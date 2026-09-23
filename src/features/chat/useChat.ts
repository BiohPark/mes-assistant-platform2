import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { appendMessage, createThread, updateMessage } from '@/db/repositories/chat'
import { getSettings } from '@/db/repositories/settings'
import { setTaskTitle } from '@/db/repositories/tasks'
import { createProvider } from '@/llm'
import { buildSrSystemPrompt, buildTaskSystemPrompt, srMeta, taskMeta, threadParticipants, toChatMessages, type PromptInput } from '@/llm/context'
import type { ChatMeta, ChatProvider } from '@/llm/provider'
import { suggestTitle } from '@/llm/title'
import { deliverFiles, usesFilesApi, type AttachedFile } from '@/llm/openwebuiFiles'
import { resolveModel } from '@/domain/modelResolution'
import { isSrTag } from '@/domain/tags'
import type { Actor } from '@/db/repositories/activity'
import type { Assistant, FileAsset, ID, Message, ServiceRequest, Task, Thread } from '@/domain/types'

const FLUSH_INTERVAL_MS = 250

/** 채팅이 붙는 대상: 대화(=업무, 스레드 1개) 또는 SR 접수 대화 */
export type ChatScope = { kind: 'task'; task: Task; assistant: Assistant } | { kind: 'sr'; sr: ServiceRequest; intake: Assistant; files: FileAsset[] }

export interface ChatState {
  thread?: Thread
  messages: Message[]
  streaming: boolean
  send: (text: string, attachmentIds?: string[]) => Promise<void>
  /** 팀 의견: 스레드에 기록만 하고 AI는 호출하지 않는다 */
  sendDiscussion: (text: string, attachmentIds?: string[]) => Promise<void>
  stop: () => void
}

interface PromptBundle {
  systemPrompt: string
  modelId: string
  meta: ChatMeta
  /** OpenWebUI Files API 첨부 */
  files?: AttachedFile[]
  /** 첨부하지 못해 인라인으로 대신한 파일 (전송 기록용) */
  deliveryFallbacks?: Array<{ name: string; reason: string }>
}

/** 선택한 입력(주 입력 먼저) + 이번 메시지 첨부(참고). 출처 대화 표기를 붙인다. */
async function loadInputs(task: Task, attachmentIds: ID[]): Promise<PromptInput[]> {
  const extra = attachmentIds.filter((id) => !task.inputs.some((i) => i.fileId === id))
  const refs = [...task.inputs.map((i) => ({ fileId: i.fileId, weight: i.weight })), ...extra.map((fileId) => ({ fileId, weight: 'reference' as const }))]
  const files = await db.files.bulkGet(refs.map((r) => r.fileId))
  const originIds = [...new Set(files.map((f) => f?.originTaskId).filter((id): id is ID => !!id && id !== task.id))]
  const origins = await db.tasks.bulkGet(originIds)
  const assistants = new Map((await db.assistants.toArray()).map((a) => [a.id, a.name]))
  const label = new Map(origins.filter((t): t is Task => !!t).map((t) => [t.id, `${t.code} · ${assistants.get(t.assistantId) ?? t.assistantId}`]))
  return refs.flatMap((r, i): PromptInput[] => {
    const file = files[i]
    if (!file) return []
    const source = file.originTaskId === task.id ? '이 대화' : file.originSrId ? 'SR 첨부' : file.originTaskId ? label.get(file.originTaskId) : undefined
    return [{ file, weight: r.weight, source }]
  })
}

async function buildPrompt(scope: ChatScope, thread: Thread, history: Message[], attachmentIds: string[]): Promise<PromptBundle> {
  const settings = await getSettings()
  const users = new Map((await db.users.toArray()).map((x) => [x.id, { name: x.name, role: x.role }]))
  if (scope.kind === 'sr') {
    const { sr, intake, files } = scope
    return {
      systemPrompt: await buildSrSystemPrompt({ intake, sr, files }),
      modelId: resolveModel({ thread, assistant: intake, settings: settings.llm }).modelId,
      meta: srMeta(intake, files),
    }
  }
  // 전송 시점의 최신 대화 상태로 만든다 (입력 선택이 방금 바뀌었을 수 있음)
  const task = (await db.tasks.get(scope.task.id)) ?? scope.task
  const { assistant } = scope
  const srCodes = task.tags.filter(isSrTag)
  const [loaded, linkedSrs] = await Promise.all([
    loadInputs(task, attachmentIds),
    srCodes.length ? db.serviceRequests.where('code').anyOf(srCodes).toArray() : Promise.resolve([]),
  ])
  // 파일은 assistant가 자기 방식으로 읽도록 OpenWebUI에 첨부하고, 실패한 것만 텍스트로 붙인다
  const delivery = usesFilesApi(settings.llm) ? await deliverFiles(settings.llm, loaded.map((i) => i.file)) : undefined
  const inputs = loaded.map((i) => ({ ...i, attached: !!delivery?.attached.has(i.file.id) }))
  return {
    systemPrompt: await buildTaskSystemPrompt({ assistant, task, linkedSrs, inputs, participants: threadParticipants(history, users) }),
    modelId: resolveModel({ thread, task, assistant, settings: settings.llm }).modelId,
    meta: taskMeta(assistant, task, inputs.map((i) => i.file)),
    files: delivery ? [...delivery.attached.values()] : undefined,
    deliveryFallbacks: delivery?.failed.map((f) => ({ name: f.file.name, reason: f.reason })),
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

/** 대화 1개 = 스레드 1개. 스트리밍 중에는 로컬 상태로 표시하고 주기적으로 DB에 반영한다. */
export function useChat(actor: Actor | undefined, scope: ChatScope): ChatState {
  const threadId = scope.kind === 'task' ? scope.task.threadId : scope.sr.threadId
  const thread = useLiveQuery(() => (threadId ? db.threads.get(threadId) : undefined), [threadId])
  const dbMessages = useLiveQuery(() => (threadId ? db.messages.where('threadId').equals(threadId).sortBy('createdAt') : []), [threadId]) ?? []

  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const messages = dbMessages.map((m) => (m.id === streamingId ? { ...m, content: streamingText } : m))

  const stop = useCallback(() => abortRef.current?.abort(), [])

  /** 예전 데이터에 스레드가 없으면 그때 만든다 */
  const ensureThread = useCallback(async (): Promise<Thread | undefined> => {
    if (thread) return thread
    // 구독이 아직 안 끝났을 수 있으니 DB에서 직접 확인한 뒤에만 새로 만든다
    const existing = threadId ? await db.threads.get(threadId) : undefined
    if (existing) return existing
    if (!actor || scope.kind !== 'task') return undefined
    return createThread(actor, { taskId: scope.task.id }, '대화')
  }, [actor, scope, thread, threadId])

  const sendDiscussion = useCallback(
    async (text: string, attachmentIds: string[] = []) => {
      if (!actor || !text.trim()) return
      const t = await ensureThread()
      if (t) await appendMessage(actor, t.id, 'user', text.trim(), attachmentIds, 'done', 'discussion')
    },
    [actor, ensureThread],
  )

  const send = useCallback(
    async (text: string, attachmentIds: string[] = []) => {
      if (!actor || !text.trim()) return
      const t = await ensureThread()
      if (!t) return

      await appendMessage(actor, t.id, 'user', text.trim(), attachmentIds)
      const history = await db.messages.where('threadId').equals(t.id).sortBy('createdAt')
      const placeholder = await appendMessage(null, t.id, 'assistant', '', [], 'streaming')
      setStreamingId(placeholder.id)
      setStreamingText('')

      const settings = await getSettings()
      const provider = createProvider(settings.llm)
      const users = new Map((await db.users.toArray()).map((x) => [x.id, { name: x.name, role: x.role }]))
      const { systemPrompt, modelId, meta, files, deliveryFallbacks } = await buildPrompt(scope, t, history, attachmentIds)

      const controller = new AbortController()
      abortRef.current = controller
      let acc = ''
      let lastFlush = Date.now()
      let error: string | undefined
      let requestSnapshot: string | undefined

      try {
        const request = { model: modelId, messages: toChatMessages(systemPrompt, history, users), signal: controller.signal, meta, files }
        requestSnapshot = JSON.stringify(
          { sentAt: new Date().toISOString(), provider: provider.kind, model: request.model, meta, files, deliveryFallbacks, messages: request.messages },
          null,
          2,
        )
        for await (const chunk of provider.stream(request)) {
          if (chunk.type === 'delta') {
            acc += chunk.text
            setStreamingText(acc)
            if (Date.now() - lastFlush > FLUSH_INTERVAL_MS) {
              lastFlush = Date.now()
              await updateMessage(placeholder.id, { content: acc })
            }
          } else if (chunk.type === 'error') {
            error = chunk.message
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      } finally {
        abortRef.current = null
        await updateMessage(placeholder.id, { content: acc || (error ? `⚠️ ${error}` : ''), status: error ? 'error' : 'done', error, requestSnapshot })
        setStreamingId(null)
        setStreamingText('')
      }
      if (!error && scope.kind === 'task') void maybeRetitle(scope.task.id, provider, modelId, t.id)
    },
    [actor, ensureThread, scope],
  )

  return { thread, messages, streaming: streamingId !== null, send, sendDiscussion, stop }
}
