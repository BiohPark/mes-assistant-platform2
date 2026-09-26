import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActor } from '@/app/hooks'
import { db } from '@/db/schema'
import { saveAssistantOutput } from '@/db/repositories/files'
import type { Assistant, FileAsset, Message, Task } from '@/domain/types'

interface SaveAsOutputDialogProps {
  message: Message
  task: Task
  assistant: Assistant
  onClose: () => void
}

/** 기본 이름: 이 대화의 가장 최근 산출물 이름(같은 이름이면 새 버전) → 없으면 `{단계}_{코드}.md` */
function defaultName(own: FileAsset[], task: Task, assistant: Assistant): string {
  const latestOutput = own.filter((f) => f.source === 'assistant' || task.outputFileIds.includes(f.id)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]
  return latestOutput?.name ?? `${assistant.level2.replace(/\s+/g, '')}_${task.code}.md`
}

/** 부모가 message.id를 key로 주므로 메시지가 바뀌면 새로 마운트된다 */
export function SaveAsOutputDialog({ message, task, assistant, onClose }: SaveAsOutputDialogProps) {
  const actor = useActor()
  const own = useLiveQuery(() => db.files.where('originTaskId').equals(task.id).toArray(), [task.id])
  const [edited, setEdited] = useState<string>()
  const [saving, setSaving] = useState(false)
  const name = edited ?? (own ? defaultName(own, task, assistant) : '')
  const sameName = (own ?? []).filter((f) => f.name === name.trim()).sort((a, b) => b.version - a.version)[0]

  async function save() {
    if (!actor || !name.trim()) return
    setSaving(true)
    try {
      const saved = await saveAssistantOutput(actor, task.id, name.trim(), message.content)
      toast.success(`산출물로 저장했습니다 (${saved.name} v${saved.version}). 같은 태그 대화의 자료함에 나타납니다.`)
      onClose()
    } catch (e) {
      toast.error('산출물을 저장하지 못했습니다.', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>산출물로 저장</DialogTitle>
          <DialogDescription>assistant 응답을 마크다운 파일로 저장하고 이 대화의 산출물로 표시합니다. 같은 이름이면 새 버전이 되어 버전 기록이 이어집니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="out-name">파일 이름</Label>
          <Input id="out-name" value={name} onChange={(e) => setEdited(e.target.value)} autoFocus />
          <p className="text-xs text-muted-foreground">
            {sameName ? (
              <>
                같은 이름의 <span className="font-mono">v{sameName.version}</span>이 있어 <b>v{sameName.version + 1}</b>(새 버전)로 저장됩니다. 별도 파일로 두려면 이름을 바꾸세요.
              </>
            ) : (
              '새 파일(v1)로 저장됩니다.'
            )}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={save} disabled={!actor || !name.trim() || saving}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
