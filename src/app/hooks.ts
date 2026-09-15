import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { getSettings } from '@/db/repositories/settings'
import type { Actor } from '@/db/repositories/activity'
import type { ID, Settings, User } from '@/domain/types'

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

export function useCurrentUser(): User | undefined {
  const settings = useSettings()
  return useLiveQuery(() => (settings ? db.users.get(settings.currentUserId) : undefined), [settings?.currentUserId])
}

/** 변경 작업에 넘길 actor. 사용자 로딩 전에는 undefined */
export function useActor(): Actor | undefined {
  const settings = useSettings()
  return settings ? { userId: settings.currentUserId } : undefined
}

export function useTemplates() {
  return useLiveQuery(() => db.templates.toArray(), []) ?? []
}
