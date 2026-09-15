import { cn } from '@/lib/utils'
import type { StepInstance } from '@/domain/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STEP_STATUS_LABEL } from '@/lib/labels'

interface TaskProgressBarProps {
  steps: StepInstance[]
  currentStepId?: string
  className?: string
}

/** 단계별 세그먼트 미니 진행바. manual 단계는 회색, 현재 단계는 링 강조 */
export function TaskProgressBar({ steps, currentStepId, className }: TaskProgressBarProps) {
  return (
    <div className={cn('flex h-1.5 w-full gap-0.5', className)}>
      {steps.map((s) => {
        const grey = s.mode === 'manual'
        const color = grey ? '#9ca3af' : s.color
        const filled = s.status === 'done' || s.status === 'in_progress'
        return (
          <Tooltip key={s.id}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  'flex-1 rounded-sm transition-colors',
                  s.status === 'skipped' && 'bg-[repeating-linear-gradient(45deg,#cbd5e1_0_2px,transparent_2px_4px)]',
                  s.id === currentStepId && 'ring-1 ring-foreground/40 ring-offset-1',
                )}
                style={{
                  backgroundColor: filled ? color : s.status === 'skipped' ? undefined : 'color-mix(in oklch, var(--foreground) 10%, transparent)',
                  opacity: s.status === 'in_progress' ? 0.55 : 1,
                }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {s.name} · {STEP_STATUS_LABEL[s.status]}
              {grey ? ' · 수동' : ''}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
