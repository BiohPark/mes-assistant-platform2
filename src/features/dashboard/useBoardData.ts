import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { StepInstance, StepKey, Task, WorkflowTemplate } from '@/domain/types'
import { STEP_KEYS } from '@/domain/types'
import type { BoardFilters } from '@/app/uiStore'
import { daysUntil } from '@/lib/dates'

export interface BoardRow {
  task: Task
  steps: StepInstance[]
  currentStep?: StepInstance
  template?: WorkflowTemplate
  progress: { done: number; total: number }
  daysLeft?: number
  isOverdue: boolean
  /** 보드 컬럼 키. 완료 업무는 'DONE' */
  columnKey: StepKey | 'DONE'
}

export type ColumnKey = StepKey | 'DONE'

export function useBoardRows(): BoardRow[] | undefined {
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const steps = useLiveQuery(() => db.steps.toArray(), [])
  const templates = useLiveQuery(() => db.templates.toArray(), [])

  return useMemo(() => {
    if (!tasks || !steps || !templates) return undefined
    const stepsByTask = new Map<string, StepInstance[]>()
    for (const s of steps) {
      const list = stepsByTask.get(s.taskId) ?? []
      stepsByTask.set(s.taskId, [...list, s])
    }
    const tplById = new Map(templates.map((t) => [t.id, t]))
    return tasks
      .map((task): BoardRow => {
        const taskSteps = (stepsByTask.get(task.id) ?? []).sort((a, b) => a.order - b.order)
        const currentStep = taskSteps.find((s) => s.id === task.currentStepId)
        const done = taskSteps.filter((s) => s.status === 'done' || s.status === 'skipped').length
        const daysLeft = task.status === 'active' ? daysUntil(task.dueDate) : undefined
        return {
          task,
          steps: taskSteps,
          currentStep,
          template: tplById.get(task.templateId),
          progress: { done, total: taskSteps.length },
          daysLeft,
          isOverdue: daysLeft !== undefined && daysLeft < 0,
          columnKey: task.status === 'done' ? 'DONE' : (currentStep?.key ?? 'CUSTOM'),
        }
      })
      .sort((a, b) => b.task.createdAt.localeCompare(a.task.createdAt))
  }, [tasks, steps, templates])
}

export function applyBoardFilters(rows: BoardRow[], f: BoardFilters): BoardRow[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.stepKey && r.columnKey !== f.stepKey) return false
    if (f.status && r.task.status !== f.status) return false
    if (f.templateId && r.task.templateId !== f.templateId) return false
    if (f.assigneeId && !(r.task.ownerId === f.assigneeId || r.task.assigneeIds.includes(f.assigneeId))) return false
    if (q) {
      const hay = `${r.task.code} ${r.task.title} ${r.task.summary} ${r.task.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** 보드 컬럼 축. 템플릿을 고르면 그 템플릿의 단계 순서/이름을 쓰고, 아니면 표준 키 순서 */
export interface BoardColumn {
  key: ColumnKey
  label: string
  color: string
  mode?: 'assistant' | 'manual'
}

export function boardColumns(template: WorkflowTemplate | undefined, fallbackColors: Record<StepKey, string>): BoardColumn[] {
  if (template) {
    const seen = new Set<StepKey>()
    const cols: BoardColumn[] = []
    for (const s of template.steps) {
      if (seen.has(s.key)) continue
      seen.add(s.key)
      cols.push({ key: s.key, label: s.name, color: s.color, mode: s.mode })
    }
    if (!seen.has('CUSTOM')) cols.push({ key: 'CUSTOM', label: '수동/기타', color: fallbackColors.CUSTOM })
    return [...cols, { key: 'DONE', label: '완료', color: '#64748b' }]
  }
  return [
    ...STEP_KEYS.map((k) => ({ key: k, label: STEP_LABEL_FULL[k], color: fallbackColors[k] })),
    { key: 'DONE', label: '완료', color: '#64748b' },
  ]
}

const STEP_LABEL_FULL: Record<StepKey, string> = {
  URS: 'URS 요구사항',
  FDS: 'FDS 기능명세',
  DEV: '개발',
  TEST: '테스트',
  PROTOCOL: '프로토콜 검증',
  DEPLOY: '배포/검증',
  CUSTOM: '수동/기타',
}
