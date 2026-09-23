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
    createdAt: nowIso(),
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
