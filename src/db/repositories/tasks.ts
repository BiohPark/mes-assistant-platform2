import { format } from 'date-fns'
import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { notify } from './notifications'
import { newId, nowIso } from '@/lib/ids'
import { applyTaskStatus, toggleChecklistItem } from '@/domain/transitions'
import { isSrTag, normalizeTag, tagKey } from '@/domain/tags'
import type { ChecklistItem, ChecklistReview, ID, Priority, Task, TaskInput, TaskStatus, Thread } from '@/domain/types'

/** `PREFIX-YYYY-NNNN` 형식의 다음 코드 */
export async function nextCode(prefix: 'WK' | 'SR', existing: string[]): Promise<string> {
  const year = new Date().getFullYear()
  const re = new RegExp(`^${prefix}-(\\d{4})-(\\d+)`)
  const max = existing
    .map((c) => re.exec(c))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) === year)
    .reduce((acc, m) => Math.max(acc, Number(m[2])), 0)
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`
}

export interface StartConversationInput {
  assistantId: ID
  /** 없으면 "{에이전트} 대화 MM-dd HH:mm" (titleSource=default, 첫 답변 후 AI 제목으로 교체) */
  title?: string
  tags?: string[]
  ownerId?: ID
  assigneeIds?: ID[]
  priority?: Priority
  dueDate?: string
  /** 시작 시 미리 선택할 입력 (SR 첨부 등) */
  inputFileIds?: ID[]
  /** 제목을 넘길 때의 출처. 'default'면 첫 답변 뒤 AI 제목으로 바뀔 수 있다 */
  titleSource?: Task['titleSource']
}

/**
 * 대화(=업무) 시작. 카드 클릭만으로는 호출하지 않고 첫 메시지 전송/첨부 저장 시점에 호출한다(빈 업무 방지).
 * 업무와 스레드를 함께 만들어 대화 1개 = 스레드 1개를 보장한다.
 */
export async function startConversation(actor: Actor, input: StartConversationInput): Promise<{ task: Task; thread: Thread }> {
  const assistant = await db.assistants.get(input.assistantId)
  if (!assistant) throw new Error('에이전트를 찾을 수 없습니다.')
  if (assistant.status === 'retired') throw new Error('폐기된 에이전트로는 새 대화를 시작할 수 없습니다.')
  const at = nowIso()
  const checklist: ChecklistItem[] = assistant.checklistTemplate.map((c) => ({ id: newId('chk'), label: c.label, required: c.required, checked: false }))
  const tags = dedupeTags(input.tags ?? [])
  const taskId = newId('task')
  const thread: Thread = { id: newId('thr'), taskId, title: '대화', createdAt: at, createdBy: actor.userId, archived: false }
  const ownerId = input.ownerId ?? actor.userId
  const task: Task = {
    id: taskId,
    code: await nextCode('WK', (await db.tasks.toArray()).map((t) => t.code)),
    assistantId: assistant.id,
    title: input.title?.trim() || `${assistant.name} 대화 ${format(new Date(at), 'MM-dd HH:mm')}`,
    titleSource: input.title?.trim() ? (input.titleSource ?? 'manual') : 'default',
    summary: '',
    status: 'in_progress',
    ownerId,
    assigneeIds: input.assigneeIds ?? [ownerId],
    priority: input.priority ?? 'normal',
    dueDate: input.dueDate,
    tags,
    checklist,
    inputs: (input.inputFileIds ?? []).map((fileId) => ({ fileId, weight: 'main' as const, selectedAt: at, selectedBy: actor.userId })),
    outputFileIds: [],
    threadId: thread.id,
    createdAt: at,
    createdBy: actor.userId,
    lastActivityAt: at,
    startedAt: at,
  }
  await db.transaction('rw', [db.tasks, db.threads, db.activity, db.notifications], async () => {
    await db.tasks.add(task)
    await db.threads.add(thread)
    await logActivity(actor, { taskId, assistantId: assistant.id }, 'task.created', { assistantName: assistant.name })
    for (const tag of tags) await logActivity(actor, { taskId }, 'tag.added', { tag })
    await notify({
      userIds: [task.ownerId, ...task.assigneeIds],
      exceptUserId: actor.userId,
      title: '새 대화 업무가 배정되었습니다',
      body: `${task.code} ${task.title}`,
      link: `/c/${task.id}`,
    })
  })
  return { task, thread }
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = normalizeTag(raw)
    const k = tagKey(t)
    if (!t || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/** 제목 변경. manual은 이후 AI가 덮어쓰지 않는다. */
export async function setTaskTitle(taskId: ID, title: string, source: Task['titleSource']): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task || !title.trim()) return
  if (source === 'ai' && task.titleSource === 'manual') return
  await db.tasks.update(taskId, { title: title.trim(), titleSource: source })
}

/** 요약/우선순위/기한/담당 등 단순 필드 수정 (이력 없음) */
export async function updateTask(taskId: ID, patch: Partial<Pick<Task, 'summary' | 'priority' | 'dueDate' | 'assigneeIds' | 'ownerId'>>): Promise<void> {
  await db.tasks.update(taskId, patch)
}

/** 태그 추가. 정규화·중복 무시. 반환값: 실제로 추가됐는지 */
export async function addTag(actor: Actor, taskId: ID, raw: string): Promise<boolean> {
  const tag = normalizeTag(raw)
  if (!tag) return false
  return db.transaction('rw', db.tasks, db.activity, db.serviceRequests, async () => {
    const task = await db.tasks.get(taskId)
    if (!task || task.tags.some((t) => tagKey(t) === tagKey(tag))) return false
    await db.tasks.put({ ...task, tags: [...task.tags, tag], lastActivityAt: nowIso() })
    const sr = isSrTag(tag) ? await db.serviceRequests.where('code').equals(tag).first() : undefined
    await logActivity(actor, { taskId, srId: sr?.id }, 'tag.added', { tag })
    return true
  })
}

/** 태그 제거. 공유 자료함 결과만 바뀌고, 이미 선택한 입력(task.inputs)은 유지한다. */
export async function removeTag(actor: Actor, taskId: ID, tag: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    const next = task.tags.filter((t) => tagKey(t) !== tagKey(tag))
    if (next.length === task.tags.length) return
    await db.tasks.put({ ...task, tags: next })
    await logActivity(actor, { taskId }, 'tag.removed', { tag })
  })
}

/** 입력 선택/등급 변경. weight=null이면 선택 해제. 특정 버전 ID를 고정한다. */
export async function setInput(actor: Actor, taskId: ID, fileId: ID, weight: TaskInput['weight'] | null): Promise<void> {
  await db.transaction('rw', db.tasks, db.files, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const file = await db.files.get(fileId)
    if (!task || !file) return
    const rest = task.inputs.filter((i) => i.fileId !== fileId)
    const inputs = weight ? [...rest, { fileId, weight, selectedAt: nowIso(), selectedBy: actor.userId }] : rest
    await db.tasks.put({ ...task, inputs })
    await logActivity(actor, { taskId }, weight ? 'input.selected' : 'input.removed', { name: file.name, version: file.version, weight })
  })
}

/** 선택한 입력을 다른 버전으로 바꾼다 (등급 유지). 새 버전 알림에서 사람이 명시적으로 누를 때만 호출. */
export async function switchInputVersion(actor: Actor, taskId: ID, fromFileId: ID, toFileId: ID): Promise<void> {
  await db.transaction('rw', db.tasks, db.files, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const to = await db.files.get(toFileId)
    const cur = task?.inputs.find((i) => i.fileId === fromFileId)
    if (!task || !to || !cur) return
    const inputs = task.inputs.map((i) => (i.fileId === fromFileId ? { ...i, fileId: toFileId, selectedAt: nowIso(), selectedBy: actor.userId } : i))
    await db.tasks.put({ ...task, inputs })
    await logActivity(actor, { taskId }, 'input.selected', { name: to.name, version: to.version, weight: cur.weight })
  })
}

const STATUS_ACTIVITY: Record<TaskStatus, 'task.started' | 'task.completed' | 'task.hold' | 'task.status_changed'> = {
  todo: 'task.status_changed',
  in_progress: 'task.started',
  on_hold: 'task.hold',
  done: 'task.completed',
}

export async function setTaskStatus(actor: Actor, taskId: ID, status: TaskStatus, payload: Record<string, unknown> = {}): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task || task.status === status) return
    await db.tasks.put({ ...applyTaskStatus(task, status, actor.userId, nowIso()), lastActivityAt: nowIso() })
    const type = task.status === 'done' && status !== 'done' ? 'task.reopened' : STATUS_ACTIVITY[status]
    await logActivity(actor, { taskId, assistantId: task.assistantId }, type, { from: task.status, to: status, ...payload })
  })
}

/** AI 달성도 점검 결과 저장 (체크 상태는 그대로). 이력에 m/n을 남긴다. */
export async function saveChecklistReview(actor: Actor, taskId: ID, review: ChecklistReview): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    await db.tasks.put({ ...task, checklistReview: review })
    await logActivity(actor, { taskId }, 'checklist.reviewed', { met: review.met, total: review.total, source: review.source })
  })
}

/** AI가 달성으로 판단한 항목 중 아직 체크하지 않은 것을 사용자가 한 번에 체크 */
export async function applyChecklistReview(actor: Actor, taskId: ID): Promise<number> {
  const task = await db.tasks.get(taskId)
  const review = task?.checklistReview
  if (!task || !review) return 0
  const metIds = new Set(review.items.filter((i) => i.met).map((i) => i.itemId))
  const targets = task.checklist.filter((c) => metIds.has(c.id) && !c.checked)
  for (const c of targets) await toggleChecklist(actor, taskId, c.id)
  return targets.length
}

export async function toggleChecklist(actor: Actor, taskId: ID, itemId: ID): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const item = task?.checklist.find((c) => c.id === itemId)
    if (!task || !item) return
    await db.tasks.put(toggleChecklistItem(task, itemId, actor.userId, nowIso()))
    await logActivity(actor, { taskId }, item.checked ? 'checklist.unchecked' : 'checklist.checked', { label: item.label })
  })
}

export async function addChecklistItem(taskId: ID, label: string, required = false): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  await db.tasks.put({ ...task, checklist: [...task.checklist, { id: newId('chk'), label, required, checked: false }] })
}

export async function removeChecklistItem(taskId: ID, itemId: ID): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  await db.tasks.put({ ...task, checklist: task.checklist.filter((c) => c.id !== itemId) })
}

export async function giveFeedback(actor: Actor, taskId: ID, rating: number, comment: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    await db.tasks.put({ ...task, feedback: { rating, comment, by: actor.userId, at: nowIso() } })
    await logActivity(actor, { taskId, assistantId: task.assistantId }, 'feedback.given', { rating })
  })
}

export async function setTaskModel(actor: Actor, taskId: ID, modelId: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    await db.tasks.update(taskId, { modelId: modelId || undefined })
    await logActivity(actor, { taskId }, 'model.changed', { scope: '이 대화', modelId: modelId || '(기본)' })
  })
}

export async function setThreadModel(actor: Actor, threadId: ID, modelId: string): Promise<void> {
  await db.transaction('rw', db.threads, db.activity, async () => {
    const thread = await db.threads.get(threadId)
    if (!thread) return
    await db.threads.update(threadId, { modelId: modelId || undefined })
    await logActivity(actor, { taskId: thread.taskId, srId: thread.srId }, 'model.changed', { scope: '이 대화', modelId: modelId || '(기본)' })
  })
}

/** 업무 삭제: 스레드/메시지/노트/이 업무에서 만든 파일 정리. 다른 대화가 입력으로 쓰는 파일이 있으면 거부. */
export async function deleteTask(taskId: ID): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction('rw', [db.tasks, db.threads, db.messages, db.notes, db.files], async () => {
    const ownFileIds = new Set((await db.files.where('originTaskId').equals(taskId).toArray()).map((f) => f.id))
    const users = (await db.tasks.toArray()).filter((t) => t.id !== taskId && t.inputs.some((i) => ownFileIds.has(i.fileId)))
    if (users.length > 0) {
      return { ok: false, reason: `이 대화의 파일을 ${users.map((u) => u.code).join(', ')}에서 입력으로 사용 중이라 삭제할 수 없습니다.` }
    }
    const threads = await db.threads.where('taskId').equals(taskId).toArray()
    for (const t of threads) await db.messages.where('threadId').equals(t.id).delete()
    await db.threads.where('taskId').equals(taskId).delete()
    await db.notes.where('taskId').equals(taskId).delete()
    await db.files.where('originTaskId').equals(taskId).delete()
    await db.tasks.delete(taskId)
    return { ok: true }
  })
}
