import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { getSettings } from '@/db/repositories/settings'
import type { Actor } from '@/db/repositories/activity'
import type { Assistant, ID, Settings, User } from '@/domain/types'
import { useTabUserId } from './tabUser'

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings(), [])
}

export function useUsers(): User[] {
  return useLiveQuery(() => db.users.toArray(), []) ?? []
}

export function useUserMap(): Map<ID, User> {
  const users = useUsers()
  return new Map(users.map((u) => [u.id, u]))
}

/** 현재 사용자 ID: 탭별 전환값이 있으면 우선, 없으면 설정의 기본 사용자 */
export function useCurrentUserId(): ID | undefined {
  const settings = useSettings()
  const tabUser = useTabUserId()
  return tabUser ?? settings?.currentUserId
}

export function useCurrentUser(): User | undefined {
  const id = useCurrentUserId()
  return useLiveQuery(() => (id ? db.users.get(id) : undefined), [id])
}

/** 변경 작업에 넘길 actor. 사용자 로딩 전에는 undefined */
export function useActor(): Actor | undefined {
  const id = useCurrentUserId()
  return id ? { userId: id } : undefined
}

export function useAssistants(): Assistant[] {
  return useLiveQuery(() => db.assistants.toArray(), []) ?? []
}

export function useAssistantMap(): Map<ID, Assistant> {
  const list = useAssistants()
  return new Map(list.map((a) => [a.id, a]))
}
