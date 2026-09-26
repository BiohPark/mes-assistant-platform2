import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { Message, RequestInfo, Thread } from '@/domain/types'
import { buildChatRequest, type ChatScope } from '@/llm/promptBuilder'
import { nowIso } from '@/lib/ids'

const DEBOUNCE_MS = 400

/**
 * 지금 보내면 AI가 받을 것을 미리 계산한다 — 실제 전송과 같은 조립 함수(dryRun: 업로드 없이 첨부 예정).
 * 트레이의 칩·전달 방식·크기 게이지가 이 결과를 그대로 보여 준다.
 */
export function useRequestEstimate(scope: ChatScope, thread: Thread | undefined, messages: Message[], draft: string, enabled: boolean): RequestInfo | undefined {
  const [info, setInfo] = useState<RequestInfo>()
  const taskId = scope.kind === 'task' ? scope.task.id : undefined
  // 대화 입력·설정이 바뀌면 다시 계산
  const conversationKey = useLiveQuery(
    async () => (taskId ? (await db.conversationInputs.where('taskId').equals(taskId).toArray()).map((c) => `${c.id}:${c.snapshotId}:${c.weight}`).join('|') : ''),
    [taskId],
  )
  const settingsKey = useLiveQuery(async () => JSON.stringify(await db.settings.get('app')), [])
  const inputsKey = scope.kind === 'task' ? scope.task.inputs.map((i) => `${i.fileId}:${i.weight}`).join('|') : ''
  const historyKey = messages.map((m) => `${m.id}:${m.status}`).join('|')

  useEffect(() => {
    if (!enabled || !thread) return
    let cancelled = false
    const timer = setTimeout(() => {
      const history: Message[] = [
        ...messages.filter((m) => m.status === 'done'),
        { id: 'draft', threadId: thread.id, role: 'user', content: draft || ' ', createdAt: nowIso(), attachmentIds: [], status: 'done' },
      ]
      buildChatRequest(scope, thread, history, { dryRun: true })
        .then((built) => !cancelled && setInfo(built.info))
        .catch(() => !cancelled && setInfo(undefined))
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // messages·scope 객체는 매 렌더 새로 만들어지므로 내용 키로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, thread?.id, draft, inputsKey, historyKey, conversationKey, settingsKey])

  return enabled ? info : undefined
}
