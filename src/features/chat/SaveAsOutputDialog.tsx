import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActor } from '@/app/hooks'
import { saveAssistantOutput } from '@/db/repositories/files'
import type { Assistant, Message, Task } from '@/domain/types'

interface SaveAsOutputDialogProps {
  message: Message
  task: Task
  assistant: Assistant
  existingCount: number
  onClose: () => void
}

/** 부모가 message.id를 key로 주므로 메시지가 바뀌면 새로 마운트된다 */
export function SaveAsOutputDialog({ message, task, assistant, existingCount, onClose }: SaveAsOutputDialogProps) {
  const actor = useActor()
  const [name, setName] = useState(() => `${assistant.level2.replace(/\s+/g, '')}_${task.code}_v${existingCount + 1}.md`)

  async function save() {
    if (!actor) return
    await saveAssistantOutput(actor, task.id, name.trim() || 'output.md', message.content)
    toast.success('산출물로 저장했습니다. 같은 태그 대화의 공유 자료함에 나타납니다.')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>산출물로 저장</DialogTitle>
          <DialogDescription>assistant 응답을 마크다운 파일로 파일함에 저장하고 이 업무의 산출물로 태깅합니다. 같은 이름이면 새 버전이 됩니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="out-name">파일 이름</Label>
          <Input id="out-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
