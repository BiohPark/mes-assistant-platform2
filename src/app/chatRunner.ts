import { db } from '@/db/schema'
import { ActiveRequestError, STALE_ERROR, assertNoActiveReply, isLiveReply, nextMessageTime } from '@/db/repositories/chat'
import { logActivity, type Actor } from '@/db/repositories/activity'
import { setInput, setTaskTitle } from '@/db/repositories/tasks'
import type { ID, LlmSettings, Message, RequestInfo, Thread } from '@/domain/types'
import { newId, nowIso } from '@/lib/ids'
import { createProvider } from '@/llm'
import { buildChatRequest, type ChatScope } from '@/llm/promptBuilder'
import type { ChatProvider } from '@/llm/provider'
import { suggestTitle } from '@/llm/title'

/**
 * 채팅 요청 실행기. 화면 컴포넌트가 아니라 이 모듈이 요청을 소유한다 — 화면을 옮겨도 응답이 이어진다.
 * - 대화당 진행 중 요청 1건: 사용자 메시지·답변 자리표시를 한 트랜잭션에서 확인·생성 (탭끼리도 직렬화)
 * - 생존 신호(heartbeatAt): 응답 중 주기적으로 갱신. 오래 멈춘 자리표시는 끊긴 요청으로 정리(자동 재전송 없음)
 * - 늦은 쓰기 차단: 자리표시가 이미 다른 곳에서 끝났으면(중지·정리) 덮어쓰지 않는다
 */

export interface RunnerTimeouts {
  /** 첫 토큰까지 (OpenWebUI 파일 처리가 없을 때) */
  firstTokenMs: number
  /** 첫 토큰까지 (OpenWebUI 업로드·처리 대기 포함) */
  filesFirstTokenMs: number
  /** 토큰 사이 최대 공백 */
  idleMs: number
  keepaliveMs: number
  flushMs: number
}

const DEFAULT_TIMEOUTS: RunnerTimeouts = { firstTokenMs: 60_000, filesFirstTokenMs: 360_000, idleMs: 60_000, keepaliveMs: 10_000, flushMs: 250 }

export interface RunnerDeps {
  provider?: (settings: LlmSettings) => ChatProvider
  timeouts?: Partial<RunnerTimeouts>
}

// ── 진행 상태 (화면 표시용, 탭 메모리) ───────────────────────────────────────────

export interface RunState {
  replyId: ID
  text: string
  /** 파일 업로드·처리 등 첫 토큰 전 단계 */
  phase?: string
}

type Abort = 'cancelled' | 'timeout' | 'lost'

const runs = new Map<ID, { controller: AbortController; state: RunState }>()
const listeners = new Set<() => void>()
let snapshot: ReadonlyMap<ID, RunState> = new Map()

function emit(): void {
  snapshot = new Map([...runs].map(([k, v]) => [k, v.state]))
  for (const l of listeners) l()
}

export function subscribeRuns(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRunsSnapshot(): ReadonlyMap<ID, RunState> {
  return snapshot
}

// ── 공통 ─────────────────────────────────────────────────────────────────────

/** 자리표시가 아직 응답 중일 때만 쓴다 (늦은 쓰기 차단) */
async function fencedUpdate(replyId: ID, patch: Partial<Message>): Promise<boolean> {
  return db.transaction('rw', db.messages, async () => {
    const m = await db.messages.get(replyId)
    if (!m || m.status !== 'streaming') return false
    await db.messages.update(replyId, patch)
    return true
  })
}

interface Acquired {
  replyId: ID
  userMessage: Message
}

/** 완료 여부·진행 중 요청 확인 → (새) 사용자 메시지 + 답변 자리표시를 한 트랜잭션에서 */
async function acquire(actor: Actor, scope: ChatScope, thread: Thread, user: { text: string; attachmentIds: ID[] } | { existing: Message }): Promise<Acquired> {
  return db.transaction('rw', [db.messages, db.threads, db.tasks, db.activity], async () => {
    if (scope.kind === 'task') {
      const task = await db.tasks.get(scope.task.id)
      if (!task) throw new Error('대화를 찾을 수 없습니다.')
      if (task.status === 'done') throw new Error('완료된 대화입니다. 재개한 뒤 보내세요.')
    }
    await assertNoActiveReply(thread.id)
    let userMessage: Message
    if ('existing' in user) {
      userMessage = user.existing
    } else {
      userMessage = {
        id: newId('msg'),
        threadId: thread.id,
        role: 'user',
        content: user.text,
        authorId: actor.userId,
        createdAt: await nextMessageTime(thread.id),
        attachmentIds: user.attachmentIds,
        status: 'done',
      }
      await db.messages.add(userMessage)
      await logActivity(actor, { taskId: thread.taskId, srId: thread.srId }, 'message.sent', { preview: user.text.slice(0, 60) })
    }
    const at = await nextMessageTime(thread.id)
    const reply: Message = {
      id: newId('msg'),
      threadId: thread.id,
      role: 'assistant',
      content: '',
      createdAt: at,
      attachmentIds: [],
      status: 'streaming',
      heartbeatAt: nowIso(),
      requestedBy: actor.userId,
    }
    await db.messages.add(reply)
    if (thread.taskId) await db.tasks.update(thread.taskId, { lastActivityAt: at })
    return { replyId: reply.id, userMessage }
  })
}

interface RunArgs {
  actor: Actor
  scope: ChatScope
  thread: Thread
  acquired: Acquired
  oneShotFileIds: ID[]
  forceInlineFileIds?: ID[]
  retryOf?: ID
  deps: RunnerDeps
}

function abortMessage(reason: unknown): string | undefined {
  if (reason === 'cancelled') return '요청을 중지했습니다.'
  if (reason === 'timeout') return '응답 시간 초과 — 제한 시간 안에 응답이 오지 않았습니다.'
  return undefined
}

function deliveryFailureMessage(names: string[]): string {
  return `파일 ${names.length}개(${names.join(', ')})를 OpenWebUI에 전달하지 못해 요청을 보내지 않았습니다. 다시 시도하거나, 파일을 빼거나, 텍스트로 보낼 수 있습니다.`
}

async function run(args: RunArgs): Promise<void> {
  const { scope, thread, acquired, deps } = args
  const t = { ...DEFAULT_TIMEOUTS, ...deps.timeouts }
  const controller = new AbortController()
  const state: RunState = { replyId: acquired.replyId, text: '' }
  runs.set(thread.id, { controller, state })
  emit()

  const abort = (reason: Abort) => controller.abort(reason)
  let deadline: ReturnType<typeof setTimeout> | undefined
  const arm = (ms: number) => {
    clearTimeout(deadline)
    deadline = setTimeout(() => abort('timeout'), ms)
  }
  const keepalive = setInterval(() => {
    void fencedUpdate(acquired.replyId, { heartbeatAt: nowIso() }).then((ok) => ok || abort('lost'))
  }, t.keepaliveMs)

  let acc = ''
  let error: string | undefined
  let info: RequestInfo | undefined
  let requestSnapshot: string | undefined
  let settings: LlmSettings | undefined
  let model = ''
  try {
    const history = (await db.messages.where('threadId').equals(thread.id).sortBy('createdAt')).filter((m) => m.createdAt <= acquired.userMessage.createdAt)
    const setPhase = (phase?: string) => {
      state.phase = phase
      emit()
    }
    const built = await buildChatRequest(scope, thread, history, {
      oneShotFileIds: args.oneShotFileIds,
      forceInlineFileIds: args.forceInlineFileIds,
      signal: controller.signal,
      onProgress: (p) => setPhase(`${p.phase === 'uploading' ? '파일 올리는 중' : 'OpenWebUI 파일 처리 대기'} ${p.index + 1}/${p.total} · ${p.name}`),
    })
    setPhase(undefined)
    settings = built.settings.llm
    model = built.model
    info = { ...built.info, retryOf: args.retryOf }
    if (built.failed.length) {
      error = deliveryFailureMessage(built.failed.map((f) => f.name))
      return
    }
    if (info.bytes > info.limitBytes) {
      error = `요청 크기 한도 초과 (${Math.ceil(info.bytes / 1024)} KB / ${Math.ceil(info.limitBytes / 1024)} KB). 입력을 줄이거나 메시지 범위·요약을 고르세요.`
      return
    }
    const provider = (deps.provider ?? createProvider)(built.settings.llm)
    requestSnapshot = JSON.stringify(
      { sentAt: nowIso(), provider: provider.kind, model: built.model, meta: built.meta, files: built.files, messages: built.messages },
      null,
      2,
    )
    arm(built.files?.length ? t.filesFirstTokenMs : t.firstTokenMs)
    let lastFlush = Date.now()
    for await (const chunk of provider.stream({ model: built.model, messages: built.messages, signal: controller.signal, meta: built.meta, files: built.files })) {
      if (chunk.type === 'delta') {
        acc += chunk.text
        arm(t.idleMs)
        state.text = acc
        emit()
        if (Date.now() - lastFlush > t.flushMs) {
          lastFlush = Date.now()
          if (!(await fencedUpdate(acquired.replyId, { content: acc, heartbeatAt: nowIso() }))) abort('lost')
        }
      } else if (chunk.type === 'error') {
        error = chunk.message
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  } finally {
    clearTimeout(deadline)
    clearInterval(keepalive)
    const reason = controller.signal.reason as Abort | undefined
    const message = reason === 'lost' ? undefined : (abortMessage(reason) ?? error)
    try {
      // 최종 내용을 DB에 먼저 쓴 뒤 메모리 진행 상태를 지운다.
      // 순서가 반대면 마지막 flush 이후의 글자가 잠깐 사라지고, 그 틈의 전송이 "응답 중"으로 거부된다.
      if (reason !== 'lost') {
        await fencedUpdate(acquired.replyId, {
          content: acc || (message ? `⚠️ ${message}` : ''),
          status: message ? 'error' : 'done',
          error: message,
          requestInfo: info,
          requestSnapshot,
          heartbeatAt: undefined,
        })
      }
    } finally {
      runs.delete(thread.id)
      emit()
    }
    if (reason !== 'lost' && !message && scope.kind === 'task' && settings) void maybeRetitle(scope.task.id, (deps.provider ?? createProvider)(settings), model, thread.id)
  }
}

/** 첫 답변 뒤 한 번: 기본 제목인 대화만 AI(실패 시 규칙) 제목으로 바꾼다. 수동 제목은 건드리지 않는다. */
async function maybeRetitle(taskId: ID, provider: ChatProvider, modelId: string, threadId: ID): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task || task.titleSource !== 'default') return
  const history = await db.messages.where('threadId').equals(threadId).sortBy('createdAt')
  const title = await suggestTitle(provider, modelId, history)
  if (title) await setTaskTitle(taskId, title, 'ai')
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

export interface StartChatInput {
  actor: Actor
  scope: ChatScope
  thread: Thread
  text: string
  /** 메시지에 표시할 첨부 */
  attachmentIds?: ID[]
  /** 대화 입력으로 고정하지 않고 이번 메시지에만 쓰는 첨부 */
  oneShotFileIds?: ID[]
}

export interface StartedChat {
  replyId: ID
  /** 응답이 끝날 때 resolve (화면은 기다리지 않는다) */
  done: Promise<void>
}

export async function startChat(input: StartChatInput, deps: RunnerDeps = {}): Promise<StartedChat> {
  const acquired = await acquire(input.actor, input.scope, input.thread, { text: input.text, attachmentIds: input.attachmentIds ?? [] })
  const done = run({ ...input, acquired, oneShotFileIds: input.oneShotFileIds ?? [], deps })
  return { replyId: acquired.replyId, done }
}

export interface RetryChatInput {
  actor: Actor
  scope: ChatScope
  thread: Thread
  /** 실패한 답변 (대화의 마지막 메시지여야 한다) */
  failedReplyId: ID
  /** 이번에 입력에서 뺄 파일 (선택 해제) */
  excludeFileIds?: ID[]
  /** 첨부 대신 본문으로 보낼 텍스트 파일 */
  forceInlineFileIds?: ID[]
}

/** 같은 사용자 메시지로 다시 요청한다(메시지를 새로 만들지 않아 AI에 두 번 가지 않는다). 입력은 현재 선택 기준. */
export async function retryChat(input: RetryChatInput, deps: RunnerDeps = {}): Promise<StartedChat> {
  const rows = await db.messages.where('threadId').equals(input.thread.id).sortBy('createdAt')
  const idx = rows.findIndex((m) => m.id === input.failedReplyId)
  const failed = rows[idx]
  if (!failed || failed.status !== 'error') throw new Error('다시 시도할 수 있는 실패한 답변이 아닙니다.')
  if (rows.slice(idx + 1).some((m) => m.kind !== 'discussion')) throw new Error('가장 최근의 실패한 답변만 다시 시도할 수 있습니다.')
  const userMessage = rows.slice(0, idx).reverse().find((m) => m.role === 'user' && m.kind !== 'discussion')
  if (!userMessage) throw new Error('다시 보낼 사용자 메시지가 없습니다.')
  const exclude = new Set(input.excludeFileIds ?? [])
  if (input.scope.kind === 'task') for (const id of exclude) await setInput(input.actor, input.scope.task.id, id, null)
  const task = input.scope.kind === 'task' ? await db.tasks.get(input.scope.task.id) : undefined
  const oneShotFileIds = userMessage.attachmentIds.filter((id) => !exclude.has(id) && !task?.inputs.some((i) => i.fileId === id))
  const acquired = await acquire(input.actor, input.scope, input.thread, { existing: userMessage })
  const done = run({ ...input, acquired, oneShotFileIds, retryOf: failed.id, deps })
  return { replyId: acquired.replyId, done }
}

/** 중지: 이 탭의 요청이면 바로 멈추고, 다른 탭의 요청이면 기록을 먼저 닫아 그 탭이 다음 쓰기에서 멈추게 한다 */
export async function stopChat(threadId: ID): Promise<void> {
  const local = runs.get(threadId)
  if (local) {
    local.controller.abort('cancelled')
    return
  }
  const streaming = await db.messages.where('threadId').equals(threadId).filter((m) => m.status === 'streaming').toArray()
  for (const m of streaming) await fencedUpdate(m.id, { status: 'error', error: '다른 탭에서 중지했습니다.', heartbeatAt: undefined })
}

/** 생존 신호가 끊긴 자리표시를 오류로 정리한다 (앱 시작·주기 실행). 정리한 개수를 돌려준다 */
export async function recoverStaleReplies(now = Date.now()): Promise<number> {
  const streaming = await db.messages.where('status').equals('streaming').toArray()
  let n = 0
  for (const m of streaming) {
    if (isLiveReply(m, now) || runs.get(m.threadId)?.state.replyId === m.id) continue
    if (await fencedUpdate(m.id, { status: 'error', error: STALE_ERROR, heartbeatAt: undefined })) n++
  }
  return n
}

export { ActiveRequestError }
