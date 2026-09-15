import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { ID, Note } from '@/domain/types'

export async function addNote(
  actor: Actor,
  taskId: ID,
  content: string,
  stepInstanceId?: ID,
  attachmentIds: ID[] = [],
): Promise<Note> {
  const note: Note = {
    id: newId('note'),
    taskId,
    stepInstanceId,
    authorId: actor.userId,
    content,
    createdAt: nowIso(),
    attachmentIds,
  }
  await db.transaction('rw', db.notes, db.activity, async () => {
    await db.notes.add(note)
    await logActivity(actor, taskId, 'note.added', { preview: content.slice(0, 60) }, stepInstanceId)
  })
  return note
}

export async function deleteNote(noteId: ID): Promise<void> {
  await db.notes.delete(noteId)
}
