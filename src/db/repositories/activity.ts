import { db } from '../schema'
import { newId, nowIso } from '@/lib/ids'
import type { ActivityLog, ActivityType, ID } from '@/domain/types'

export interface Actor {
  userId: ID
}

export function logActivity(
  actor: Actor,
  taskId: ID,
  type: ActivityType,
  payload: Record<string, unknown> = {},
  stepInstanceId?: ID,
): Promise<ID> {
  const entry: ActivityLog = {
    id: newId('act'),
    taskId,
    stepInstanceId,
    userId: actor.userId,
    type,
    payload,
    at: nowIso(),
  }
  return db.activity.add(entry)
}
