import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { Assistant, ID } from '@/domain/types'

export interface AssistantRow {
  assistant: Assistant
  activeCount: number
  overdueCount: number
  doneCount: number
}

/** 카드맵 한 줄: 에이전트 + 대화 집계 (공통 순서 order 기준 — 카드·칸반 열이 같은 순서) */
export function useAssistantRows(): AssistantRow[] | undefined {
  return useLiveQuery(async () => {
    const [assistants, tasks] = await Promise.all([db.assistants.toArray(), db.tasks.toArray()])
    const today = new Date().toISOString().slice(0, 10)
    const counts = new Map<ID, { active: number; overdue: number; done: number }>()
    for (const t of tasks) {
      const c = counts.get(t.assistantId) ?? { active: 0, overdue: 0, done: 0 }
      const isDone = t.status === 'done'
      const isOverdue = !isDone && !!t.dueDate && t.dueDate.slice(0, 10) < today
      counts.set(t.assistantId, {
        active: c.active + (isDone ? 0 : 1),
        overdue: c.overdue + (isOverdue ? 1 : 0),
        done: c.done + (isDone ? 1 : 0),
      })
    }
    return assistants
      .map((assistant): AssistantRow => {
        const c = counts.get(assistant.id) ?? { active: 0, overdue: 0, done: 0 }
        return { assistant, activeCount: c.active, overdueCount: c.overdue, doneCount: c.done }
      })
      .sort((a, b) => a.assistant.order - b.assistant.order)
  }, [])
}
