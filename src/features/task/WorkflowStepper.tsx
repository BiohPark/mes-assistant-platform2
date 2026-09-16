import { Check, SkipForward, Bot, Hand, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepInstance } from '@/domain/types'
import { checklistProgress } from '@/domain/transitions'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STEP_STATUS_LABEL } from '@/lib/labels'

interface WorkflowStepperProps {
  steps: StepInstance[]
  currentStepId: string
  selectedStepId: string
  onSelect: (stepId: string) => void
}

/** 가로 워크플로우 스테퍼. 상태별 색, manual 단계 회색, 현재 단계 핀 표시 */
export function WorkflowStepper({ steps, currentStepId, selectedStepId, onSelect }: WorkflowStepperProps) {
  return (
    <div className="flex items-stretch overflow-x-auto px-1 py-2">
      {steps.map((s, i) => {
        const grey = s.mode === 'manual'
        const color = grey ? '#9ca3af' : s.color
        const isCurrent = s.id === currentStepId
        const isSelected = s.id === selectedStepId
        const done = s.status === 'done'
        const skipped = s.status === 'skipped'
        const active = s.status === 'in_progress'
        const progress = checklistProgress(s)
        const prevDone = i > 0 && (steps[i - 1].status === 'done' || steps[i - 1].status === 'skipped')
        return (
          <div key={s.id} className="flex min-w-[176px] flex-1 shrink-0 items-center">
            {i > 0 && (
              <div className={cn('h-0.5 w-4 shrink-0 md:w-6', prevDone ? 'bg-foreground/40' : 'bg-border')} />
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={cn(
                    'group relative flex min-w-[150px] flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all',
                    isSelected ? 'border-foreground/40 bg-card shadow-md ring-2 ring-foreground/10' : 'bg-card/70 hover:bg-card hover:shadow-sm',
                    grey && !isSelected && 'bg-muted/60',
                    s.status === 'pending' && !isSelected && 'opacity-75',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                      done && 'border-transparent text-white',
                      active && 'text-white',
                      skipped && 'border-dashed text-muted-foreground',
                      s.status === 'pending' && 'text-muted-foreground',
                    )}
                    style={{
                      borderColor: done || active ? color : undefined,
                      backgroundColor: done || active ? color : undefined,
                    }}
                  >
                    {done ? <Check className="size-3.5" /> : skipped ? <SkipForward className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className={cn('truncate text-xs font-semibold', grey && 'text-muted-foreground')}>{s.name}</span>
                      {grey ? <Hand className="size-3 shrink-0 text-muted-foreground" /> : <Bot className="size-3 shrink-0 text-muted-foreground" />}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{STEP_STATUS_LABEL[s.status]}</span>
                      {progress.total > 0 && (
                        <span className="tabular-nums">
                          ☑ {progress.done}/{progress.total}
                        </span>
                      )}
                    </span>
                  </span>
                  {isCurrent && (
                    <span className="absolute -top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-foreground px-1.5 py-px text-[9px] font-medium text-background">
                      <MapPin className="size-2.5" />
                      현재
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs opacity-80">{s.description || (grey ? '수동 진행 단계' : 'assistant 진행 단계')}</div>
              </TooltipContent>
            </Tooltip>
          </div>
        )
      })}
    </div>
  )
}
