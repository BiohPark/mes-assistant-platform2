import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActor, useUserMap } from '@/app/hooks'
import { addChecklistItem, removeChecklistItem, toggleChecklist } from '@/db/repositories/tasks'
import { checklistProgress } from '@/domain/transitions'
import type { StepInstance } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface ChecklistPanelProps {
  step: StepInstance
  readOnly?: boolean
}

export function ChecklistPanel({ step, readOnly }: ChecklistPanelProps) {
  const actor = useActor()
  const users = useUserMap()
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const progress = checklistProgress(step)

  async function submitNew() {
    if (!actor || !label.trim()) return
    await addChecklistItem(actor, step.id, label.trim())
    setLabel('')
    setAdding(false)
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold">
          체크리스트{' '}
          <span className="font-normal text-muted-foreground">
            {progress.done}/{progress.total}
          </span>
        </h3>
        {!readOnly && (
          <Button variant="ghost" size="xs" onClick={() => setAdding((v) => !v)}>
            <Plus data-icon="inline-start" />
            항목
          </Button>
        )}
      </div>
      <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
        />
      </div>
      <ul className="space-y-1">
        {step.checklist.map((c) => {
          const by = c.checkedBy ? users.get(c.checkedBy) : undefined
          return (
            <li key={c.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/60">
              <Checkbox
                id={c.id}
                checked={c.checked}
                disabled={readOnly || !actor}
                onCheckedChange={() => actor && toggleChecklist(actor, step.id, c.id)}
                className="mt-0.5"
              />
              <label htmlFor={c.id} className="min-w-0 flex-1 cursor-pointer text-xs leading-snug">
                <span className={cn(c.checked && 'text-muted-foreground line-through')}>{c.label}</span>
                {c.required && !c.checked && <span className="ml-1 text-[10px] text-red-500">필수</span>}
                {c.checked && by && (
                  <span className="block text-[10px] text-muted-foreground">
                    {by.name} · {formatDateTime(c.checkedAt)}
                  </span>
                )}
              </label>
              {!readOnly && (
                <button
                  type="button"
                  aria-label="항목 삭제"
                  className="invisible text-muted-foreground hover:text-destructive group-hover:visible"
                  onClick={() => removeChecklistItem(step.id, c.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          )
        })}
        {step.checklist.length === 0 && <li className="px-1 text-xs text-muted-foreground">체크리스트가 없습니다.</li>}
      </ul>
      {adding && (
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            void submitNew()
          }}
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="새 체크 항목" className="h-7 text-xs" autoFocus />
          <Button type="submit" size="sm">
            추가
          </Button>
        </form>
      )}
    </section>
  )
}
