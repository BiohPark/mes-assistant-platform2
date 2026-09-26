import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { ID, Message, MessageRole, Thread } from '@/domain/types'

export type ThreadOwner = { taskId: ID; srId?: undefined } | { srId: ID; taskId?: undefined }

export async function createThread(actor: Actor, owner: ThreadOwner, title?: string): Promise<Thread> {
  const existing =
    owner.srId !== undefined
      ? await db.threads.where('srId').equals(owner.srId).count()
      : await db.threads.where('taskId').equals(owner.taskId).count()
  const thread: Thread = {
    id: newId('thr'),
    ...owner,
    title: title ?? `스레드 ${existing + 1}`,
    createdAt: nowIso(),
    createdBy: actor.userId,
    archived: false,
  }
  await db.transaction('rw', db.threads, db.tasks, db.activity, async () => {
    await db.threads.add(thread)
    if (owner.taskId) await db.tasks.update(owner.taskId, { threadId: thread.id })
    await logActivity(actor, owner, 'thread.created', { title: thread.title })
  })
  return thread
}

export async function setActiveThread(taskId: ID, threadId: ID): Promise<void> {
  await db.tasks.update(taskId, { threadId })
}

/**
 * 스레드 안에서 항상 증가하는 시각. 같은 밀리초에 여러 메시지가 생겨도 순서가 흔들리지 않게 한다
 * (사용자 메시지 → 답변 자리표시가 같은 시각이면 정렬이 불안정했다).
 */
export async function nextMessageTime(threadId: ID): Promise<string> {
  const last = await db.messages.where('threadId').equals(threadId).reverse().sortBy('createdAt')
  const now = Date.now()
  const prev = last[0] ? Date.parse(last[0].createdAt) : 0
  return new Date(Math.max(now, prev + 1)).toISOString()
}

export async function appendMessage(
  actor: Actor | null,
  threadId: ID,
  role: MessageRole,
  content: string,
  attachmentIds: ID[] = [],
  status: Message['status'] = 'done',
  kind?: Message['kind'],
): Promise<Message> {
  const msg: Message = {
    id: newId('msg'),
    threadId,
    role,
    content,
    authorId: actor?.userId,
    createdAt: await nextMessageTime(threadId),
    attachmentIds,
    status,
    kind,
  }
  await db.messages.add(msg)
  const thread = await db.threads.get(threadId)
  // 칸반 최근 활동순 정렬용
  if (thread?.taskId) await db.tasks.update(thread.taskId, { lastActivityAt: msg.createdAt })
  if (role === 'user' && actor && thread) {
    await logActivity(actor, { taskId: thread.taskId, srId: thread.srId }, 'message.sent', { preview: content.slice(0, 60) })
  }
  return msg
}

/** 이보다 오래 생존 신호(heartbeatAt)가 없는 응답 자리표시는 끊긴 요청. 숨은 탭의 타이머 지연보다 넉넉하게 둔다 */
export const STALE_MS = 120_000
export const STALE_ERROR = '응답이 중단되었습니다 — 요청한 화면이 닫혔거나 연결이 끊겼습니다. 자동으로 다시 보내지 않았습니다.'

export class ActiveRequestError extends Error {
  constructor(message = '이 대화는 이미 응답을 기다리는 중입니다. 응답이 끝난 뒤 다시 보내세요.') {
    super(message)
  }
}

export function isLiveReply(m: Message, now = Date.now()): boolean {
  return m.status === 'streaming' && !!m.heartbeatAt && now - Date.parse(m.heartbeatAt) < STALE_MS
}

/**
 * 대화에 살아 있는 응답이 있으면 ActiveRequestError. 끊긴 자리표시는 이 자리에서 오류로 정리한다.
 * 트랜잭션 안에서 호출하면 확인과 생성이 한 번에 묶여 탭끼리도 직렬화된다.
 */
export async function assertNoActiveReply(threadId: ID | undefined, now = Date.now()): Promise<void> {
  if (!threadId) return
  const streaming = await db.messages.where('threadId').equals(threadId).filter((m) => m.status === 'streaming').toArray()
  for (const m of streaming) {
    if (isLiveReply(m, now)) throw new ActiveRequestError()
    await db.messages.update(m.id, { status: 'error', error: STALE_ERROR, heartbeatAt: undefined })
  }
}

export async function updateMessage(id: ID, patch: Partial<Message>): Promise<void> {
  await db.messages.update(id, patch)
}

export async function deleteThread(threadId: ID): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, db.tasks, async () => {
    const thread = await db.threads.get(threadId)
    if (!thread) return
    await db.messages.where('threadId').equals(threadId).delete()
    await db.threads.delete(threadId)
    if (!thread.taskId) return
    const task = await db.tasks.get(thread.taskId)
    if (task?.threadId === threadId) {
      const remaining = await db.threads.where('taskId').equals(task.id).sortBy('createdAt')
      await db.tasks.update(task.id, { threadId: remaining.at(-1)?.id })
    }
  })
}
