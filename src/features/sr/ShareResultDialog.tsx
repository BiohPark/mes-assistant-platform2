import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useActor } from '@/app/hooks'
import { shareSrResult } from '@/db/repositories/sr'
import type { FileAsset, ServiceRequest, Task } from '@/domain/types'

interface ShareResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sr: ServiceRequest
  /** 업무 화면에서 열었을 때: 이 업무 파일을 공유 후보로 */
  task?: Task
  /** 공유 후보 파일. task가 있으면 그 업무에서 만든 파일만 남긴다 (SR 관리에서는 연결 대화의 산출물) */
  files?: FileAsset[]
}

/** 담당자 → 요청자 결과 공유. 텍스트 + 파일 선택. 내부 대화는 공유되지 않는다. */
export function ShareResultDialog({ open, onOpenChange, sr, task, files = [] }: ShareResultDialogProps) {
  const actor = useActor()
  const [text, setText] = useState('')
  const [fileIds, setFileIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const candidates = task ? files.filter((f) => f.originTaskId === task.id) : files

  async function share() {
    if (!actor) return
    setBusy(true)
    try {
      await shareSrResult(actor, { srId: sr.id, taskId: task?.id, text, fileIds })
      toast.success(`${sr.code} 요청자에게 결과를 공유했습니다.`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '공유 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>요청자에게 결과 공유</DialogTitle>
          <DialogDescription>
            {sr.code} {sr.title} — 요청자는 여기서 공유한 내용과 파일만 봅니다. 업무 내부 대화·노트는 공유되지 않습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="share-text">공유 내용 (markdown)</Label>
            <Textarea id="share-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="조치 결과, 반영 일정, 확인 요청 사항 등" className="text-xs" autoFocus />
          </div>
          {candidates.length > 0 && (
            <div className="grid gap-1.5">
              <Label>함께 보낼 파일</Label>
              <ul className="max-h-36 space-y-1 overflow-y-auto">
                {candidates.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                    <Checkbox id={`sh-${f.id}`} checked={fileIds.includes(f.id)} onCheckedChange={() => setFileIds((ids) => (ids.includes(f.id) ? ids.filter((x) => x !== f.id) : [...ids, f.id]))} />
                    <label htmlFor={`sh-${f.id}`} className="cursor-pointer truncate">
                      {f.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            취소
          </Button>
          <Button onClick={share} disabled={busy || !actor || (!text.trim() && fileIds.length === 0)}>
            공유
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
