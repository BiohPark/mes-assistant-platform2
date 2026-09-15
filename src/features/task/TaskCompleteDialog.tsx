import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Markdown } from '@/components/Markdown'
import { useActor, useUsers } from '@/app/hooks'
import { setTaskStatus } from '@/db/repositories/tasks'
import { downloadBlob, saveAssistantOutput } from '@/db/repositories/files'
import { buildTaskReport } from '@/domain/taskReport'
import type { TaskData } from './useTaskData'

interface TaskCompleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TaskData
}

export function TaskCompleteDialog({ open, onOpenChange, data }: TaskCompleteDialogProps) {
  const actor = useActor()
  const users = useUsers()
  const [busy, setBusy] = useState(false)
  const report = useMemo(
    () => buildTaskReport({ task: data.task, steps: data.steps, files: data.files, activity: data.activity, users }),
    [data, users],
  )
  const unfinished = data.steps.filter((s) => s.status !== 'done' && s.status !== 'skipped')
  const reportName = `완료리포트_${data.task.code}.md`

  async function confirm() {
    if (!actor) return
    setBusy(true)
    try {
      const last = data.steps.at(-1)
      if (last) await saveAssistantOutput(actor, data.task.id, last.id, reportName, report)
      await setTaskStatus(actor, data.task.id, 'done')
      toast.success('업무를 완료했습니다. 완료 리포트가 파일함에 저장되었습니다.')
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="size-4" />
            업무 완료 리포트
          </DialogTitle>
          <DialogDescription>
            단계별 소요시간, 체크리스트, 산출물, 되돌리기 이력, assistant 피드백을 요약합니다. 리포트는 파일함에 저장되고 다운로드할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        {unfinished.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            미완료 단계 {unfinished.length}개: {unfinished.map((s) => s.name).join(', ')} — 그대로 완료하면 리포트에 그대로 기록됩니다.
          </div>
        )}
        <div className="max-h-[50vh] overflow-y-auto rounded-lg border bg-muted/30 p-3">
          <Markdown content={report} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => downloadBlob(new Blob([report], { type: 'text/markdown' }), reportName)}>
            <Download data-icon="inline-start" />
            다운로드
          </Button>
          <Button onClick={confirm} disabled={busy || !actor}>
            업무 완료 처리
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
