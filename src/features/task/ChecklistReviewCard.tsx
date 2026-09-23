import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCheck, CircleCheck, CircleDashed, Gauge, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActor } from '@/app/hooks'
import { db } from '@/db/schema'
import { getSettings } from '@/db/repositories/settings'
import { applyChecklistReview, saveChecklistReview } from '@/db/repositories/tasks'
import { resolveModel } from '@/domain/modelResolution'
import type { Assistant, Task } from '@/domain/types'
import { createProvider } from '@/llm'
import { reviewChecklist } from '@/llm/checklistReview'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface ChecklistReviewCardProps {
  task: Task
  assistant: Assistant
  readOnly?: boolean
}

/**
 * AI 달성도 점검: 대화를 보고 체크리스트 n개 중 m개가 달성됐는지 판단한 참고 점수.
 * 체크를 강제하거나 자동으로 바꾸지 않는다. 원하면 "판단대로 체크"로 한 번에 반영한다.
 */
export function ChecklistReviewCard({ task, assistant, readOnly }: ChecklistReviewCardProps) {
  const actor = useActor()
  const [busy, setBusy] = useState(false)
  const review = task.checklistReview
  // 점검 이후 항목이 바뀌었으면 결과가 오래된 것
  const stale = !!review && (review.total !== task.checklist.length || review.items.some((i) => !task.checklist.some((c) => c.id === i.itemId)))
  const pending = review ? review.items.filter((i) => i.met && task.checklist.some((c) => c.id === i.itemId && !c.checked)).length : 0

  async function run() {
    if (!actor || task.checklist.length === 0) return
    setBusy(true)
    try {
      const settings = await getSettings()
      const history = task.threadId ? await db.messages.where('threadId').equals(task.threadId).sortBy('createdAt') : []
      const model = resolveModel({ task, assistant, settings: settings.llm }).modelId
      const result = await reviewChecklist(createProvider(settings.llm), model, task.checklist, history, actor.userId)
      await saveChecklistReview(actor, task.id, result)
      toast.success(`AI 달성도 ${result.met}/${result.total}`, { description: result.source === 'rule' ? '규칙 기반 판단 (Mock 또는 응답 해석 실패)' : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (!actor) return
    const n = await applyChecklistReview(actor, task.id)
    toast.success(n ? `${n}개 항목을 체크했습니다.` : '새로 체크할 항목이 없습니다.')
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <Gauge className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">AI 달성도</span>
        {review && (
          <span className={cn('rounded-full px-1.5 text-xs font-semibold tabular-nums', stale ? 'bg-muted text-muted-foreground' : 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200')}>
            {review.met}/{review.total}
          </span>
        )}
        <Button size="xs" variant="outline" className="ml-auto" onClick={() => void run()} disabled={busy || readOnly || !actor || task.checklist.length === 0}>
          <RefreshCw data-icon="inline-start" className={cn(busy && 'animate-spin')} />
          {review ? '다시 점검' : '점검'}
        </Button>
      </div>
      {!review ? (
        <p className="mt-1 text-[10px] text-muted-foreground">대화 내용을 보고 몇 개 항목이 달성됐는지 AI가 점수를 매깁니다. 체크를 강제하지 않습니다.</p>
      ) : (
        <>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {formatDateTime(review.at)} · {review.source === 'ai' ? 'AI 판단' : '규칙 판단'}
            {stale && ' · 이후 항목이 바뀜 — 다시 점검하세요'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {task.checklist.map((c) => {
              const j = review.items.find((i) => i.itemId === c.id)
              if (!j) return null
              return (
                <li key={c.id} className="flex items-start gap-1.5 text-[11px]">
                  {j.met ? <CircleCheck className="mt-0.5 size-3 shrink-0 text-emerald-600" /> : <CircleDashed className="mt-0.5 size-3 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0">
                    <span className={cn(!j.met && 'text-muted-foreground')}>{c.label}</span>
                    {j.note && <span className="block text-[10px] text-muted-foreground">{j.note}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          {pending > 0 && !readOnly && (
            <Button size="xs" variant="ghost" className="mt-1" onClick={() => void apply()}>
              <CheckCheck data-icon="inline-start" />
              판단대로 체크 ({pending})
            </Button>
          )}
        </>
      )}
    </div>
  )
}
