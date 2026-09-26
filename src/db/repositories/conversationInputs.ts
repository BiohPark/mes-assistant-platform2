import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import { eligibleMessages, newMessagesSince, snapshotMessages } from '@/domain/conversationContext'
import { byteLength } from '@/domain/requestBudget'
import { tagKey } from '@/domain/tags'
import type { Assistant, ContextMode, ContextSnapshot, ConversationInput, ID, InputWeight, Message, Task } from '@/domain/types'

/**
 * 대화 입력: 같은 태그를 직접 공유하는 다른 대화를 파일처럼 고른다 (docs/fusion-design.md §5).
 * 선택 시점 스냅샷(메시지 ID)에 고정하고, 원본에 새 메시지가 생기면 안내만 한다.
 */

export interface SelectConversationOptions {
  weight?: InputWeight
  mode?: Exclude<ContextMode, 'summary'>
  /** mode='messages'일 때 전달할 메시지 */
  messageIds?: ID[]
}

export interface ConversationSummaryInput {
  text: string
  source: 'ai' | 'rule'
  model?: string
  /** 요약에 쓴 원본 메시지 */
  messageIds: ID[]
}

async function threadMessagesOf(task: Task): Promise<Message[]> {
  return task.threadId ? db.messages.where('threadId').equals(task.threadId).sortBy('createdAt') : []
}

function assertEditable(task: Task | undefined): asserts task is Task {
  if (!task) throw new Error('대화를 찾을 수 없습니다.')
  if (task.status === 'done') throw new Error('완료된 대화는 입력을 바꿀 수 없습니다. 재개한 뒤 바꾸세요.')
}

async function loadPair(taskId: ID, sourceTaskId: ID): Promise<{ task: Task; source: Task }> {
  if (taskId === sourceTaskId) throw new Error('자기 대화는 참조로 고를 수 없습니다.')
  const [task, source] = await Promise.all([db.tasks.get(taskId), db.tasks.get(sourceTaskId)])
  assertEditable(task)
  if (!source) throw new Error('참조할 대화를 찾을 수 없습니다.')
  return { task, source }
}

function assertSharesTag(task: Task, source: Task): void {
  const mine = new Set(task.tags.map(tagKey))
  if (!source.tags.some((t) => mine.has(tagKey(t)))) throw new Error('같은 태그를 직접 공유하는 대화만 참조로 고를 수 있습니다.')
}

function newSnapshot(actor: Actor, source: Task, eligible: Message[], mode: ContextMode, messageIds: ID[], summary?: ConversationSummaryInput): ContextSnapshot {
  const last = eligible.at(-1)
  return {
    id: newId('ctx'),
    sourceTaskId: source.id,
    mode,
    messageIds,
    upToMessageId: last?.id,
    upToCreatedAt: last?.createdAt,
    summaryText: summary?.text.trim(),
    summarySource: summary?.source,
    summaryModel: summary?.model,
    createdBy: actor.userId,
    createdAt: nowIso(),
  }
}

/** 같은 쌍의 입력은 하나만: 있으면 스냅샷만 바꾼다(등급은 지정했을 때만 변경) */
async function upsertInput(actor: Actor, task: Task, source: Task, snapshot: ContextSnapshot, weight?: InputWeight): Promise<ConversationInput> {
  return db.transaction('rw', db.conversationInputs, db.contextSnapshots, db.activity, async () => {
    const existing = await db.conversationInputs.where('[taskId+sourceTaskId]').equals([task.id, source.id]).first()
    const input: ConversationInput = {
      id: existing?.id ?? newId('cin'),
      taskId: task.id,
      sourceTaskId: source.id,
      weight: weight ?? existing?.weight ?? 'reference',
      mode: snapshot.mode,
      snapshotId: snapshot.id,
      selectedAt: nowIso(),
      selectedBy: actor.userId,
    }
    await db.contextSnapshots.add(snapshot)
    await db.conversationInputs.put(input)
    await logActivity(actor, { taskId: task.id }, existing ? 'context.refreshed' : 'context.selected', {
      code: source.code,
      mode: snapshot.mode,
      messages: snapshot.messageIds.length,
      weight: input.weight,
    })
    return input
  })
}

/** 대화를 통째로(기본) 또는 고른 메시지만 입력으로 선택 */
export async function selectConversation(actor: Actor, taskId: ID, sourceTaskId: ID, opts: SelectConversationOptions = {}): Promise<ConversationInput> {
  const { task, source } = await loadPair(taskId, sourceTaskId)
  assertSharesTag(task, source)
  const mode = opts.mode ?? 'full'
  const eligible = eligibleMessages(await threadMessagesOf(source))
  const chosen = new Set(opts.messageIds ?? [])
  const ids = (mode === 'full' ? eligible : eligible.filter((m) => chosen.has(m.id))).map((m) => m.id)
  if (ids.length === 0) throw new Error(mode === 'full' ? '전달할 메시지가 없는 대화입니다.' : '전달할 메시지를 하나 이상 고르세요.')
  return upsertInput(actor, task, source, newSnapshot(actor, source, eligible, mode, ids), opts.weight)
}

/** 사람이 확인·수정한 요약을 입력으로 적용 (요약 생성은 llm/conversationSummary) */
export async function applyConversationSummary(
  actor: Actor,
  taskId: ID,
  sourceTaskId: ID,
  summary: ConversationSummaryInput,
  weight?: InputWeight,
): Promise<ConversationInput> {
  const { task, source } = await loadPair(taskId, sourceTaskId)
  const existing = await db.conversationInputs.where('[taskId+sourceTaskId]').equals([taskId, sourceTaskId]).first()
  if (!existing) assertSharesTag(task, source)
  if (!summary.text.trim()) throw new Error('요약 내용이 비어 있습니다.')
  const eligible = eligibleMessages(await threadMessagesOf(source))
  return upsertInput(actor, task, source, newSnapshot(actor, source, eligible, 'summary', summary.messageIds, summary), weight)
}

/** 원본의 새 메시지까지 다시 고정 (전체 원문 모드). 고른 메시지·요약은 선택 화면에서 다시 고른다. */
export async function refreshConversationInput(actor: Actor, inputId: ID): Promise<ConversationInput> {
  const input = await db.conversationInputs.get(inputId)
  if (!input) throw new Error('선택을 찾을 수 없습니다.')
  if (input.mode !== 'full') throw new Error('고른 메시지·요약은 세부 조절에서 다시 고르세요.')
  const { task, source } = await loadPair(input.taskId, input.sourceTaskId)
  const eligible = eligibleMessages(await threadMessagesOf(source))
  if (eligible.length === 0) throw new Error('전달할 메시지가 없는 대화입니다.')
  return upsertInput(actor, task, source, newSnapshot(actor, source, eligible, 'full', eligible.map((m) => m.id)))
}

export async function setConversationWeight(actor: Actor, inputId: ID, weight: InputWeight): Promise<void> {
  await db.transaction('rw', db.conversationInputs, db.tasks, db.activity, async () => {
    const input = await db.conversationInputs.get(inputId)
    if (!input) return
    assertEditable(await db.tasks.get(input.taskId))
    const source = await db.tasks.get(input.sourceTaskId)
    await db.conversationInputs.update(inputId, { weight })
    await logActivity(actor, { taskId: input.taskId }, 'context.selected', { code: source?.code, weight })
  })
}

/** 선택 해제. 스냅샷은 전송 기록이 가리킬 수 있어 남긴다. */
export async function removeConversationInput(actor: Actor, inputId: ID): Promise<void> {
  await db.transaction('rw', db.conversationInputs, db.tasks, db.activity, async () => {
    const input = await db.conversationInputs.get(inputId)
    if (!input) return
    assertEditable(await db.tasks.get(input.taskId))
    const source = await db.tasks.get(input.sourceTaskId)
    await db.conversationInputs.delete(inputId)
    await logActivity(actor, { taskId: input.taskId }, 'context.removed', { code: source?.code })
  })
}

/** 대화 쌍으로 입력 찾기 (트레이의 칩처럼 원본 대화만 아는 곳에서) */
export async function findConversationInput(taskId: ID, sourceTaskId: ID): Promise<ConversationInput | undefined> {
  return db.conversationInputs.where('[taskId+sourceTaskId]').equals([taskId, sourceTaskId]).first()
}

export interface LoadedConversationInput {
  input: ConversationInput
  snapshot: ContextSnapshot
  source: Task
  assistant?: Assistant
  /** 스냅샷이 가리키는 원문 (summary 모드는 빈 배열) */
  messages: Message[]
  /** 선택 이후 원본에 생긴 적격 메시지 수 */
  newMessages: number
  /** 공유 태그가 없어졌는데 선택은 유지된 상태 */
  detached: boolean
  /** 전달될 본문의 대략적 크기 (정확한 요청 크기는 프롬프트 조립에서 계산) */
  bytes: number
}

/** 대화의 참조 대화 입력을 원문·안내 정보와 함께 (선택 순서) */
export async function loadConversationInputs(taskId: ID): Promise<LoadedConversationInput[]> {
  const task = await db.tasks.get(taskId)
  if (!task) return []
  const inputs = (await db.conversationInputs.where('taskId').equals(taskId).toArray()).sort((a, b) => a.selectedAt.localeCompare(b.selectedAt))
  const mine = new Set(task.tags.map(tagKey))
  const out: LoadedConversationInput[] = []
  for (const input of inputs) {
    const [snapshot, source] = await Promise.all([db.contextSnapshots.get(input.snapshotId), db.tasks.get(input.sourceTaskId)])
    if (!snapshot || !source) continue
    const all = await threadMessagesOf(source)
    const messages = snapshot.mode === 'summary' ? [] : snapshotMessages(snapshot.messageIds, all)
    const bytes = snapshot.mode === 'summary' ? byteLength(snapshot.summaryText ?? '') : messages.reduce((n, m) => n + byteLength(m.content), 0)
    out.push({
      input,
      snapshot,
      source,
      assistant: await db.assistants.get(source.assistantId),
      messages,
      newMessages: newMessagesSince(snapshot, all),
      detached: !source.tags.some((t) => mine.has(tagKey(t))),
      bytes,
    })
  }
  return out
}
