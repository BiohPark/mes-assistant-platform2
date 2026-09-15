import { cn } from '@/lib/utils'
import type { Priority, StepStatus, TaskStatus } from '@/domain/types'
import { PRIORITY_CLASS, PRIORITY_LABEL, STEP_STATUS_LABEL, TASK_STATUS_LABEL } from '@/lib/labels'

const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  done: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  on_hold: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
}

const STEP_STATUS_CLASS: Record<StepStatus, string> = {
  pending: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  skipped: 'bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400',
}

const base = 'inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium whitespace-nowrap'

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <span className={cn(base, TASK_STATUS_CLASS[status], className)}>{TASK_STATUS_LABEL[status]}</span>
}

export function StepStatusBadge({ status, className }: { status: StepStatus; className?: string }) {
  return <span className={cn(base, STEP_STATUS_CLASS[status], className)}>{STEP_STATUS_LABEL[status]}</span>
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return <span className={cn(base, PRIORITY_CLASS[priority], className)}>{PRIORITY_LABEL[priority]}</span>
}

interface StepChipProps {
  name: string
  color: string
  mode?: 'assistant' | 'manual'
  className?: string
}

/** 단계 이름 + 색 점. manual 단계는 회색 처리 */
export function StepChip({ name, color, mode = 'assistant', className }: StepChipProps) {
  const grey = mode === 'manual'
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', grey && 'text-muted-foreground', className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: grey ? '#9ca3af' : color }} />
      {name}
    </span>
  )
}
