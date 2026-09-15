import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useActor } from '@/app/hooks'
import { giveStepFeedback, runStepAction } from '@/db/repositories/tasks'
import { setOutputTag } from '@/db/repositories/files'
import { missingRequiredChecklist } from '@/domain/transitions'
import type { FileAsset, StepInstance } from '@/domain/types'
import { cn } from '@/lib/utils'

interface CompleteStepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: StepInstance
  files: FileAsset[]
  nextStep?: StepInstance
  onCompleted?: (nextStepId?: string) => void
}

/** 단계 완료 확인: 체크리스트 요약 + 산출물 지정 + assistant 피드백 */
export function CompleteStepDialog({ open, onOpenChange, step, files, nextStep, onCompleted }: CompleteStepDialogProps) {
  const actor = useActor()
  const missing = missingRequiredChecklist(step)
  const candidates = files.filter((f) => f.producedByStepId === step.id || !f.producedByStepId)
  const [outputs, setOutputs] = useState<Set<string>>(() => new Set(step.outputFileIds))
  const [rating, setRating] = useState(step.feedback?.rating ?? 0)
  const [comment, setComment] = useState(step.feedback?.comment ?? '')
  const [busy, setBusy] = useState(false)

  // 열릴 때마다 현재 단계 상태로 초기화 (대화 중 산출물이 추가될 수 있음)
  useEffect(() => {
    if (!open) return
    setOutputs(new Set(step.outputFileIds))
    setRating(step.feedback?.rating ?? 0)
    setComment(step.feedback?.comment ?? '')
  }, [open, step.outputFileIds, step.feedback])

  async function confirm() {
    if (!actor) return
    setBusy(true)
    try {
      for (const f of candidates) {
        const want = outputs.has(f.id)
        const has = step.outputFileIds.includes(f.id)
        if (want !== has) await setOutputTag(actor, step.id, f.id, want)
      }
      if (step.mode === 'assistant' && (rating > 0 || comment.trim())) {
        await giveStepFeedback(actor, step.id, rating, comment.trim())
      }
      await runStepAction(actor, step.id, 'complete', { missingRequired: missing.length })
      toast.success(`"${step.name}" 단계를 완료했습니다.`, {
        description: nextStep ? `다음 단계: ${nextStep.name}` : '마지막 단계입니다. 업무를 완료할 수 있습니다.',
      })
      onOpenChange(false)
      onCompleted?.(nextStep?.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>단계 완료 — {step.name}</DialogTitle>
          <DialogDescription>완료 전 체크리스트와 산출물을 확인하세요. 산출물은 다음 단계의 입력 후보가 됩니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {missing.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">필수 체크리스트 {missing.length}건이 미완료입니다.</div>
                <ul className="mt-1 list-disc pl-4">
                  {missing.map((m) => (
                    <li key={m.id}>{m.label}</li>
                  ))}
                </ul>
                <div className="mt-1 opacity-80">GMP 판단은 담당자에게 있습니다. 그대로 완료하면 이력에 기록됩니다.</div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              필수 체크리스트를 모두 완료했습니다.
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs font-semibold">이 단계의 산출물</div>
            {candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">지정할 파일이 없습니다. (채팅 응답을 "산출물로 저장"하거나 파일을 업로드하세요)</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {candidates.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-xs">
                    <Checkbox
                      id={`out-${f.id}`}
                      checked={outputs.has(f.id)}
                      onCheckedChange={(v) =>
                        setOutputs((prev) => {
                          const next = new Set(prev)
                          if (v === true) next.add(f.id)
                          else next.delete(f.id)
                          return next
                        })
                      }
                    />
                    <label htmlFor={`out-${f.id}`} className="truncate">
                      {f.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {step.mode === 'assistant' && (
            <div>
              <div className="mb-1 text-xs font-semibold">assistant 피드백 (스킬 개선 자료)</div>
              <div className="mb-1.5 flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}점`}>
                    <Star className={cn('size-5', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
                  </button>
                ))}
              </div>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="assistant가 잘한 점 / 보완할 점 (예: 추적성 매트릭스 형식이 사내 양식과 다름)"
                className="text-xs"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={confirm} disabled={busy || !actor}>
            완료 처리
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
