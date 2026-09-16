import { useState } from 'react'
import { UserAvatar } from '@/components/UserAvatar'
import { useUserMap } from '@/app/hooks'
import type { ActivityLog, StepInstance } from '@/domain/types'
import { ACTIVITY_LABEL } from '@/lib/labels'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface ActivityPanelProps {
  activity: ActivityLog[]
  steps: StepInstance[]
  stepId?: string
}

const HIGHLIGHT: Partial<Record<ActivityLog['type'], string>> = {
  'step.reopened': 'text-amber-600',
  'step.skipped': 'text-slate-500',
  'step.completed': 'text-emerald-600',
  'task.completed': 'text-emerald-700',
  'step.mode_changed': 'text-slate-600',
}

function describe(a: ActivityLog): string {
  const p = a.payload
  switch (a.type) {
    case 'checklist.checked':
    case 'checklist.unchecked':
      return String(p.label ?? '')
    case 'file.uploaded':
    case 'file.tagged_output':
      return String(p.name ?? '')
    case 'message.sent':
    case 'note.added':
      return String(p.preview ?? '')
    case 'step.mode_changed':
      return p.mode === 'manual' ? '수동 진행으로 전환' : 'assistant 진행으로 전환'
    case 'model.changed':
      return `${String(p.scope ?? '')} → ${String(p.modelId ?? '')}`
    case 'step.reopened':
      return p.reason ? `사유: ${String(p.reason)}` : ''
    case 'file.selected_input':
      return `${String(p.count ?? 0)}개 파일`
    case 'thread.created':
      return String(p.title ?? '')
    case 'feedback.given':
      return `${'★'.repeat(Number(p.rating ?? 0))}`
    case 'task.created':
      return String(p.templateName ?? '')
    default:
      return ''
  }
}

export function ActivityPanel({ activity, steps, stepId }: ActivityPanelProps) {
  const users = useUserMap()
  const stepById = new Map(steps.map((s) => [s.id, s]))
  const [onlyStep, setOnlyStep] = useState(false)
  const list = onlyStep && stepId ? activity.filter((a) => a.stepInstanceId === stepId) : activity

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOnlyStep(false)}
          className={cn('rounded-full px-2 py-0.5 text-[11px]', !onlyStep ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
        >
          업무 전체
        </button>
        <button
          type="button"
          onClick={() => setOnlyStep(true)}
          className={cn('rounded-full px-2 py-0.5 text-[11px]', onlyStep ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
        >
          이 단계
        </button>
        <span className="ml-auto text-[10px] text-muted-foreground">{list.length}건</span>
      </div>
      <ol className="min-h-0 flex-1 space-y-0 overflow-y-auto">
        {list.map((a) => {
          const user = users.get(a.userId)
          const step = a.stepInstanceId ? stepById.get(a.stepInstanceId) : undefined
          const detail = describe(a)
          return (
            <li key={a.id} className="flex gap-2 border-l-2 py-1.5 pl-2.5" style={{ borderColor: step ? (step.mode === 'manual' ? '#9ca3af' : step.color) : 'var(--border)' }}>
              <UserAvatar user={user} size="xs" className="mt-0.5" />
              <div className="min-w-0 flex-1 text-[11px] leading-snug">
                <span className="font-medium">{user?.name ?? '시스템'}</span>{' '}
                <span className={cn(HIGHLIGHT[a.type])}>{ACTIVITY_LABEL[a.type]}</span>
                {step && <span className="text-muted-foreground"> · {step.name}</span>}
                {detail && <div className="truncate text-muted-foreground">{detail}</div>}
                <div className="text-[10px] text-muted-foreground/80">{formatDateTime(a.at)}</div>
              </div>
            </li>
          )
        })}
        {list.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">이력이 없습니다.</li>}
      </ol>
    </div>
  )
}
