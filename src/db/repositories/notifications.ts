import { db } from '../schema'
import { newId, nowIso } from '@/lib/ids'
import type { ID, Notification } from '@/domain/types'

interface NotifyInput {
  userIds: ID[]
  /** 이 사용자는 제외 (행위자 본인) */
  exceptUserId?: ID
  title: string
  body: string
  link: string
}

/** 대상 사용자마다 알림 1건. 행위자 본인과 중복 대상은 제외. 트랜잭션 안에서 호출해도 된다. */
export async function notify(input: NotifyInput): Promise<void> {
  const targets = [...new Set(input.userIds)].filter((id) => id && id !== input.exceptUserId)
  if (targets.length === 0) return
  const at = nowIso()
  const rows: Notification[] = targets.map((userId) => ({ id: newId('ntf'), userId, title: input.title, body: input.body, link: input.link, at, read: false }))
  await db.notifications.bulkAdd(rows)
}

export function unreadCount(userId: ID): Promise<number> {
  return db.notifications.where('userId').equals(userId).filter((n) => !n.read).count()
}

export async function markRead(id: ID): Promise<void> {
  await db.notifications.update(id, { read: true })
}

export async function markAllRead(userId: ID): Promise<void> {
  await db.notifications.where('userId').equals(userId).modify({ read: true })
}
