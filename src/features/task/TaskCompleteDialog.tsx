import { useState } from 'react'
import { toast } from 'sonner'
import { Download, FileCheck2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useActor, useUserMap } from '@/app/hooks'
import { giveFeedback, setTaskStatus } from '@/db/repositories/tasks'
import { downloadBlob, saveAssistantOutput, setOutputTag } from '@/db/repositories/files'
import { buildTaskReport } from '@/domain/taskReport'
import { missingRequiredChecklist } from '@/domain/transitions'
import { cn } from '@/lib/utils'
import type { SharedPool } from '@/domain/tags'
import type { FileAsset, TaskInput } from '@/domain/types'
import type { TaskData } from './useTaskData'

interface TaskCompleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TaskData
}

const RATINGS = [1, 2, 3, 4, 5]

/** 리포트용 입력 목록: 선택된 입력에 출처 에이전트 이름을 붙인다 */
function reportInputs(inputs: TaskInput[], pool: SharedPool, srFiles: FileAsset[]) {
  const byId = new Map<string, { file: FileAsset; from: string }>()
  for (const g of pool.groups) for (const i of g.items) byId.set(i.file.id, { file: i.file, from: g.assistant.name })
  for (const o of pool.own) byId.set(o.file.id, { file: o.file, from: '이 대화' })
  for (const d of pool.detachedInputs) if (!byId.has(d.file.id)) byId.set(d.file.id, { file: d.file, from: '태그 해제됨' })
  for (const f of srFiles) byId.set(f.id, { file: f, from: 'SR 첨부' })
  return inputs.flatMap((i) => {
    const hit = byId.get(i.fileId)
    return hit ? [{ name: hit.file.name, version: hit.file.version, weight: i.weight, fromAssistantName: hit.from }] : []
  })
}

/** 업무 완료: 필수 체크 경고(비차단) → 산출물 일괄 태그 → 피드백 → 리포트 저장 + done */
export function TaskCompleteDialog({ open, onOpenChange, data }: TaskCompleteDialogProps) {
  const actor = useActor()
  const users = useUserMap()
  const { task, assistant, files, pool, srFiles } = data
  const [outputs, setOutputs] = useState<string[]>(task.outputFileIds)
  const [rating, setRating] = useState<number>(task.feedback?.rating ?? 0)
  const [comment, setComment] = useState(task.feedback?.comment ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedReport, setSavedReport] = useState<string | null>(null)

  const missing = missingRequiredChecklist(task)
  const candidateFiles = files.filter((f) => f.originTaskId === task.id)
  const reportName = `완료리포트_${task.code}.md`

  function toggleOutput(id: string) {
    setOutputs((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]))
  }

  async function confirm() {
    if (!actor) return
    setBusy(true)
    try {
      for (const f of candidateFiles) {
        const want = outputs.includes(f.id)
        if (want !== task.outputFileIds.includes(f.id)) await setOutputTag(actor, task.id, f.id, want)
      }
      if (rating > 0) await giveFeedback(actor, task.id, rating, comment.trim())
      const report = buildTaskReport({
        task: { ...task, outputFileIds: outputs, feedback: rating > 0 ? { rating, comment, by: actor.userId, at: new Date().toISOString() } : task.feedback },
        assistant,
        files,
        inputs: reportInputs(task.inputs, pool, srFiles),
        users,
      })
      await saveAssistantOutput(actor, task.id, reportName, report)
      await setTaskStatus(actor, task.id, 'done', { missingRequired: missing.length, reason: missing.length ? reason.trim() : undefined })
      setSavedReport(report)
      toast.success('업무를 완료했습니다. 완료 리포트가 파일함에 저장되었습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="size-4" />
            업무 완료
          </DialogTitle>
          <DialogDescription>산출물을 확정하고 assistant 피드백을 남기면 완료 리포트가 파일함에 저장됩니다.</DialogDescription>
        </DialogHeader>

        {savedReport ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              {task.code} 업무가 완료되었습니다. 리포트 <code>{reportName}</code>이 파일함에 저장되었습니다.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => downloadBlob(new Blob([savedReport], { type: 'text/markdown' }), reportName)}>
                <Download data-icon="inline-start" />
                리포트 다운로드
              </Button>
              <Button onClick={() => onOpenChange(false)}>닫기</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {missing.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                필수 체크리스트 {missing.length}건이 미완료입니다: {missing.map((c) => c.label).join(', ')} — 그대로 완료하려면 사유가 필요하며 리포트와 이력에 기록됩니다.
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="미완료 상태로 완료하는 사유 (필수)" className="mt-2 bg-background text-xs" />
              </div>
            )}

            <section>
              <h4 className="mb-1.5 text-xs font-semibold">산출물 확정</h4>
              {candidateFiles.length === 0 ? (
                <p className="text-xs text-muted-foreground">이 업무에서 만든 파일이 없습니다.</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {candidateFiles.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
                      <Checkbox id={`out-${f.id}`} checked={outputs.includes(f.id)} onCheckedChange={() => toggleOutput(f.id)} />
                      <label htmlFor={`out-${f.id}`} className="min-w-0 flex-1 cursor-pointer truncate text-xs">
                        {f.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-1.5 text-xs font-semibold">assistant 피드백</h4>
              <div className="mb-2 flex items-center gap-1">
                {RATINGS.map((r) => (
                  <button key={r} type="button" onClick={() => setRating(r)} aria-label={`${r}점`} className="p-0.5">
                    <Star className={cn('size-5', r <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
                  </button>
                ))}
                <span className="ml-1 text-[11px] text-muted-foreground">{rating ? `${rating}점` : '선택 안 함'}</span>
              </div>
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="이 에이전트가 도움이 된 점 / 아쉬운 점" className="text-xs" />
            </section>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                취소
              </Button>
              <Button onClick={confirm} disabled={busy || !actor || (missing.length > 0 && !reason.trim())}>
                완료 처리
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
