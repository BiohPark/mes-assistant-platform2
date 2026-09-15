import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { ID, Message, MessageRole, Thread } from '@/domain/types'

export async function createThread(actor: Actor, taskId: ID, stepId: ID, title?: string): Promise<Thread> {
  const existing = await db.threads.where('stepInstanceId').equals(stepId).count()
  const thread: Thread = {
    id: newId('thr'),
    stepInstanceId: stepId,
    taskId,
    title: title ?? `스레드 ${existing + 1}`,
    createdAt: nowIso(),
    createdBy: actor.userId,
    archived: false,
  }
  await db.transaction('rw', db.threads, db.steps, db.activity, async () => {
    await db.threads.add(thread)
    await db.steps.update(stepId, { activeThreadId: thread.id })
    await logActivity(actor, taskId, 'thread.created', { title: thread.title }, stepId)
  })
  return thread
}

export async function setActiveThread(stepId: ID, threadId: ID): Promise<void> {
  await db.steps.update(stepId, { activeThreadId: threadId })
}

export async function appendMessage(
  actor: Actor | null,
  threadId: ID,
  role: MessageRole,
  content: string,
  attachmentIds: ID[] = [],
  status: Message['status'] = 'done',
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
  }
  await db.messages.add(msg)
  if (role === 'user' && actor) {
    const thread = await db.threads.get(threadId)
    if (thread) await logActivity(actor, thread.taskId, 'message.sent', { preview: content.slice(0, 60) }, thread.stepInstanceId)
  }
  return msg
}

export async function updateMessage(id: ID, patch: Partial<Message>): Promise<void> {
  await db.messages.update(id, patch)
}

export async function deleteThread(threadId: ID): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, db.steps, async () => {
    const thread = await db.threads.get(threadId)
    if (!thread) return
    await db.messages.where('threadId').equals(threadId).delete()
    await db.threads.delete(threadId)
    const step = await db.steps.get(thread.stepInstanceId)
    if (step?.activeThreadId === threadId) {
      const remaining = await db.threads.where('stepInstanceId').equals(step.id).sortBy('createdAt')
      await db.steps.update(step.id, { activeThreadId: remaining.at(-1)?.id })
    }
  })
}
