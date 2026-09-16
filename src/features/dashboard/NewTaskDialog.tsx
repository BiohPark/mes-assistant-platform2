import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { StepChip } from '@/components/StatusBadges'
import { useActor, useTemplates, useUsers } from '@/app/hooks'
import { createTaskFromTemplate } from '@/db/repositories/tasks'
import { PRIORITY_LABEL } from '@/lib/labels'
import type { Priority } from '@/domain/types'

interface NewTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTemplateId?: string
}

export function NewTaskDialog({ open, onOpenChange, defaultTemplateId }: NewTaskDialogProps) {
  const templates = useTemplates()
  const users = useUsers()
  const actor = useActor()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? '')
  const [priority, setPriority] = useState<Priority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [externalId, setExternalId] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const tpl = templates.find((t) => t.id === (templateId || templates[0]?.id))

  async function submit() {
    if (!actor) return
    if (!title.trim()) {
      toast.error('제목을 입력해 주세요.')
      return
    }
    if (!tpl) {
      toast.error('워크플로우 템플릿을 선택해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const task = await createTaskFromTemplate(actor, {
        title: title.trim(),
        summary: summary.trim(),
        templateId: tpl.id,
        ownerId: actor.userId,
        assigneeIds: Array.from(new Set([actor.userId, ...assignees])),
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        externalRef: externalId.trim()
          ? { system: 'ITSM', id: externalId.trim(), url: `https://itsm.example.internal/tickets/${externalId.trim()}` }
          : undefined,
        defaultModelId: modelOverride ?? tpl.defaultModelId,
      })
      toast.success(`${task.code} 업무를 생성했습니다.`)
      onOpenChange(false)
      navigate(`/tasks/${task.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업무 생성에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>새 업무</DialogTitle>
          <DialogDescription>워크플로우 템플릿을 선택하면 단계와 체크리스트가 자동 생성됩니다.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="nt-title">제목</Label>
            <Input id="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: Bioreactor 상태 전환 로직 개선" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nt-summary">요약</Label>
            <Textarea id="nt-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="배경과 목표를 한두 문장으로" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>워크플로우</Label>
              <Select value={tpl?.id ?? ''} onValueChange={setTemplateId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="템플릿 선택" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>우선순위</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nt-due">기한</Label>
              <Input id="nt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nt-ext">외부 시스템 ID</Label>
              <Input id="nt-ext" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="CR-2026-xxxx" />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="nt-model">업무 기본 assistant 모델</Label>
              <Input
                id="nt-model"
                value={modelOverride ?? tpl?.defaultModelId ?? ''}
                onChange={(e) => setModelOverride(e.target.value)}
                placeholder="비우면 설정의 기본 모델 사용"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">템플릿 기본값에서 가져옵니다. 단계/대화별로 나중에 바꿀 수 있습니다.</p>
            </div>
          </div>
          {tpl && (
            <div className="rounded-lg border bg-muted/40 p-2.5">
              <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">단계 미리보기</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {tpl.steps.map((s) => (
                  <StepChip key={s.id} name={s.name} color={s.color} mode={s.mode} />
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label>참여자</Label>
            <div className="flex flex-wrap gap-3">
              {users
                .filter((u) => u.id !== actor?.userId)
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={assignees.includes(u.id)}
                      onCheckedChange={(c) => setAssignees((prev) => (c ? [...prev, u.id] : prev.filter((id) => id !== u.id)))}
                    />
                    {u.name}
                  </label>
                ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={submit} disabled={submitting}>
            생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
