import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActor } from '@/app/hooks'
import { saveAssistantOutput } from '@/db/repositories/files'
import type { Message, StepInstance, Task } from '@/domain/types'

interface SaveAsOutputDialogProps {
  message: Message | null
  task: Task
  step: StepInstance
  existingCount: number
  onClose: () => void
}

export function SaveAsOutputDialog({ message, task, step, existingCount, onClose }: SaveAsOutputDialogProps) {
  const actor = useActor()
  const [name, setName] = useState('')
  useEffect(() => {
    if (message) setName(`${step.key}_${task.code}_v${existingCount + 1}.md`)
  }, [message, step.key, task.code, existingCount])

  async function save() {
    if (!actor || !message) return
    await saveAssistantOutput(actor, task.id, step.id, name.trim() || 'output.md', message.content)
    toast.success('산출물로 저장했습니다. 다음 단계의 입력 후보에 표시됩니다.')
    onClose()
  }

  return (
    <Dialog open={!!message} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>산출물로 저장</DialogTitle>
          <DialogDescription>assistant 응답을 마크다운 파일로 파일함에 저장하고 이 단계의 산출물로 태깅합니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="out-name">파일 이름</Label>
          <Input id="out-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <p className="text-[11px] text-muted-foreground">기대 산출물: {step.outputSpec.join(', ') || '지정 없음'}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={save} disabled={!actor}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
