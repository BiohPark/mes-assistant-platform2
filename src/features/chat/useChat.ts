import { useCallback, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { appendMessage, createThread, isLiveReply } from '@/db/repositories/chat'
import { setInput } from '@/db/repositories/tasks'
import type { Actor } from '@/db/repositories/activity'
import { getRunsSnapshot, retryChat, startChat, stopChat, subscribeRuns } from '@/app/chatRunner'
import type { ChatScope } from '@/llm/promptBuilder'
import type { ID, Message, Thread } from '@/domain/types'

export type { ChatScope } from '@/llm/promptBuilder'

export interface RetryOptions {
  /** 이번에 입력에서 뺄 파일 (선택 해제) */
  excludeFileIds?: ID[]
  /** 첨부 대신 본문으로 보낼 텍스트 파일 */
  forceInlineFileIds?: ID[]
}

export interface ChatState {
  thread?: Thread
  messages: Message[]
  /** 이 탭에서 보낸 요청이 응답 중 */
  streaming: boolean
  /** 다른 탭·참여자의 요청이 응답 중 (생존 신호가 살아 있는 것만) */
  remoteStreaming: boolean
  /** 첫 토큰 전 진행 단계 (파일 업로드·처리 대기 등) */
  phase?: string
  /** oneShotFileIds: 대화 입력으로 고정하지 않고 이번 메시지에만 쓰는 첨부 */
  send: (text: string, attachmentIds?: ID[], oneShotFileIds?: ID[]) => Promise<void>
  /** 팀 의견: 스레드에 기록만 하고 AI는 호출하지 않는다 */
  sendDiscussion: (text: string, attachmentIds?: ID[]) => Promise<void>
  retry: (failedReplyId: ID, opts?: RetryOptions) => Promise<void>
  stop: () => void
}

/** 대화 1개 = 스레드 1개. 요청은 app/chatRunner가 소유하고, 이 훅은 표시와 호출만 한다. */
export function useChat(actor: Actor | undefined, scope: ChatScope): ChatState {
  const threadId = scope.kind === 'task' ? scope.task.threadId : scope.sr.threadId
  const thread = useLiveQuery(() => (threadId ? db.threads.get(threadId) : undefined), [threadId])
  const dbMessages = useLiveQuery(() => (threadId ? db.messages.where('threadId').equals(threadId).sortBy('createdAt') : []), [threadId]) ?? []
  const runs = useSyncExternalStore(subscribeRuns, getRunsSnapshot)
  const run = threadId ? runs.get(threadId) : undefined

  const messages = dbMessages.map((m) => (m.id === run?.replyId && run.text ? { ...m, content: run.text } : m))
  const remoteStreaming = !run && dbMessages.some((m) => isLiveReply(m))

  /** 예전 데이터에 스레드가 없으면 그때 만든다 */
  const ensureThread = useCallback(async (): Promise<Thread | undefined> => {
    if (thread) return thread
    const existing = threadId ? await db.threads.get(threadId) : undefined
    if (existing) return existing
    if (!actor || scope.kind !== 'task') return undefined
    return createThread(actor, { taskId: scope.task.id }, '대화')
  }, [actor, scope, thread, threadId])

  const sendDiscussion = useCallback(
    async (text: string, attachmentIds: ID[] = []) => {
      if (!actor || !text.trim()) return
      const t = await ensureThread()
      if (t) await appendMessage(actor, t.id, 'user', text.trim(), attachmentIds, 'done', 'discussion')
    },
    [actor, ensureThread],
  )

  const send = useCallback(
    async (text: string, attachmentIds: ID[] = [], oneShotFileIds: ID[] = []) => {
      if (!actor || !text.trim()) return
      const t = await ensureThread()
      if (!t) return
      // 첨부는 기본으로 이 대화의 입력(☑ 참고)에 고정한다 — 다음 턴에도 AI가 볼 수 있게
      if (scope.kind === 'task') {
        const once = new Set(oneShotFileIds)
        for (const id of attachmentIds) if (!once.has(id)) await setInput(actor, scope.task.id, id, 'reference')
      }
      await startChat({ actor, scope, thread: t, text: text.trim(), attachmentIds, oneShotFileIds })
    },
    [actor, ensureThread, scope],
  )

  const retry = useCallback(
    async (failedReplyId: ID, opts: RetryOptions = {}) => {
      const t = await ensureThread()
      if (!actor || !t) return
      await retryChat({ actor, scope, thread: t, failedReplyId, ...opts })
    },
    [actor, ensureThread, scope],
  )

  const stop = useCallback(() => {
    if (threadId) void stopChat(threadId)
  }, [threadId])

  return { thread, messages, streaming: !!run, remoteStreaming, phase: run?.phase, send, sendDiscussion, retry, stop }
}
