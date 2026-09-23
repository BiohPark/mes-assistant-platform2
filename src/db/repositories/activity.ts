import { db } from '../schema'
import { newId, nowIso } from '@/lib/ids'
import type { ActivityLog, ActivityType, ID } from '@/domain/types'

export interface Actor {
  userId: ID
}

export type ActivityTarget = Partial<Pick<ActivityLog, 'taskId' | 'assistantId' | 'srId'>>

export function logActivity(actor: Actor, target: ActivityTarget, type: ActivityType, payload: Record<string, unknown> = {}): Promise<ID> {
  const entry: ActivityLog = { id: newId('act'), ...target, userId: actor.userId, type, payload, at: nowIso() }
  return db.activity.add(entry)
}
