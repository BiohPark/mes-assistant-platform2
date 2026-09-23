import { useSyncExternalStore } from 'react'

/**
 * 탭 단위 사용자 전환. sessionStorage에 저장되므로 탭마다 다른 사용자로 같은 대화에 참여할 수 있다
 * (실시간 협업 시연: 탭 A = 한지수, 탭 B = 박하은). 값이 없으면 설정의 기본 사용자를 쓴다.
 */
const KEY = 'mes-tab-user'
const listeners = new Set<() => void>()

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setTabUser(userId: string | null): void {
  try {
    if (userId) sessionStorage.setItem(KEY, userId)
    else sessionStorage.removeItem(KEY)
  } catch {
    // 저장소 차단 환경에서는 메모리 상태만 유지
  }
  listeners.forEach((l) => l())
}

export function useTabUserId(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    read,
    () => null,
  )
}
