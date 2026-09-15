import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useActor } from '@/app/hooks'
import { insertStepAfter } from '@/db/repositories/tasks'
import { newStepTemplate } from '@/db/repositories/templates'
import { STEP_KEYS, STEP_KEY_LABEL, type StepKey } from '@/domain/types'
import type { TaskData } from './useTaskData'

interface InsertStepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TaskData
  afterStepId: string
}

/** 진행 중 업무에 단계 삽입 (워크플로우 커스터마이징) */
export function InsertStepDialog({ open, onOpenChange, data, afterStepId }: InsertStepDialogProps) {
  const actor = useActor()
  const [name, setName] = useState('')
  const [key, setKey] = useState<StepKey>('CUSTOM')
  const [manual, setManual] = useState(false)
  const [checklist, setChecklist] = useState('')
  const after = data.steps.find((s) => s.id === afterStepId)

  async function submit() {
    if (!actor || !name.trim()) return
    const tpl = newStepTemplate(key, name.trim(), {
      mode: manual ? 'manual' : 'assistant',
      checklist: checklist
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((label, i) => ({ id: `c${i}`, label, required: true })),
    })
    await insertStepAfter(actor, data.task.id, afterStepId, tpl)
    toast.success(`"${name}" 단계를 추가했습니다.`)
    setName('')
    setChecklist('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>단계 추가</DialogTitle>
          <DialogDescription>"{after?.name}" 단계 뒤에 새 단계를 삽입합니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="is-name">단계 이름</Label>
            <Input id="is-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 보안 검토" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>단계 유형(보드 축)</Label>
              <Select value={key} onValueChange={(v) => setKey(v as StepKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {STEP_KEY_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>진행 방식</Label>
              <label className="flex h-8 items-center gap-2 text-sm">
                <Switch checked={manual} onCheckedChange={setManual} />
                {manual ? '수동 (메모/첨부만)' : 'assistant 대화'}
              </label>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="is-chk">체크리스트 (줄바꿈으로 구분)</Label>
            <textarea
              id="is-chk"
              value={checklist}
              onChange={(e) => setChecklist(e.target.value)}
              rows={3}
              className="rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
              placeholder={'검토 의견 반영\n승인자 서명 확인'}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={submit} disabled={!name.trim() || !actor}>
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
