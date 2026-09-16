import { useEffect, useRef, useState } from 'react'

/**
 * 같은 브라우저의 탭들 사이에서 "입력 중" 상태를 주고받는다 (BroadcastChannel).
 * 데이터 자체(메시지/파일/체크)는 IndexedDB + liveQuery로 탭 간 실시간 동기화되므로
 * 여기서는 DB에 남기지 않는 휘발성 presence만 다룬다. 실서비스에서는 WebSocket 채널로 교체.
 */
const CHANNEL = 'mes-presence'
const TYPING_TTL_MS = 3000
const THROTTLE_MS = 800

interface TypingEvent {
  type: 'typing'
  threadId: string
  userId: string
  at: number
}

const channel: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null
let lastSent = 0

export function notifyTyping(threadId: string, userId: string): void {
  if (!channel) return
  const now = Date.now()
  if (now - lastSent < THROTTLE_MS) return
  lastSent = now
  const ev: TypingEvent = { type: 'typing', threadId, userId, at: now }
  channel.postMessage(ev)
}

/** 이 스레드에서 지금 입력 중인 다른 사용자 ID 목록 */
export function useTypingUsers(threadId: string | undefined, selfId: string | undefined): string[] {
  const [typing, setTyping] = useState<Record<string, number>>({})
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!channel || !threadId) return
    const onMessage = (e: MessageEvent<TypingEvent>) => {
      const ev = e.data
      if (ev?.type !== 'typing' || ev.threadId !== threadId || ev.userId === selfId) return
      setTyping((t) => ({ ...t, [ev.userId]: ev.at }))
    }
    channel.addEventListener('message', onMessage)
    timer.current = window.setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS
      setTyping((t) => {
        const next = Object.fromEntries(Object.entries(t).filter(([, at]) => at > cutoff))
        return Object.keys(next).length === Object.keys(t).length ? t : next
      })
    }, 1000)
    return () => {
      channel.removeEventListener('message', onMessage)
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [threadId, selfId])

  return Object.keys(typing)
}
