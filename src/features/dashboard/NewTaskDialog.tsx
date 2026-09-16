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
import { stepTemplateFromModule } from '@/db/repositories/modules'
import { PRIORITY_LABEL } from '@/lib/labels'
import type { Priority } from '@/domain/types'
import { ModuleLibraryPicker, useModules } from '@/features/modules/ModuleLibraryPicker'
import { cn } from '@/lib/utils'

interface NewTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTemplateId?: string
}

type Compose = 'template' | 'modules' | 'manual'

const COMPOSE_OPTIONS: Array<{ key: Compose; label: string; hint: string }> = [
  { key: 'template', label: '워크플로우 템플릿', hint: '정해진 Task 조합으로 시작' },
  { key: 'modules', label: '직접 구성', hint: 'Task 모듈을 골라 조합' },
  { key: 'manual', label: '수동 업무', hint: 'Task 없이 메모/첨부로 진행' },
]

export function NewTaskDialog({ open, onOpenChange, defaultTemplateId }: NewTaskDialogProps) {
  const templates = useTemplates()
  const modules = useModules()
  const users = useUsers()
  const actor = useActor()
  const navigate = useNavigate()
  const [compose, setCompose] = useState<Compose>('template')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? '')
  const [picked, setPicked] = useState<string[]>([])
  const [priority, setPriority] = useState<Priority>('normal')
  const [dueDate, setDueDate] = useState('')
  const [externalId, setExternalId] = useState('')
  const [assignees, setAssignees] = useState<string[]>([])
  const [modelOverride, setModelOverride] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const tpl = templates.find((t) => t.id === (templateId || templates[0]?.id))
  const pickedModules = picked.map((id) => modules.find((m) => m.id === id)).filter((m) => m !== undefined)
  const previewSteps = compose === 'template' ? (tpl?.steps ?? []) : compose === 'modules' ? pickedModules : []

  async function submit() {
    if (!actor) return
    if (!title.trim()) {
      toast.error('제목을 입력해 주세요.')
      return
    }
    if (compose === 'template' && !tpl) {
      toast.error('워크플로우 템플릿을 선택해 주세요.')
      return
    }
    if (compose === 'modules' && pickedModules.length === 0) {
      toast.error('Task 모듈을 하나 이상 선택하거나 "수동 업무"를 선택하세요.')
      return
    }
    setSubmitting(true)
    try {
      const task = await createTaskFromTemplate(actor, {
        title: title.trim(),
        summary: summary.trim(),
        templateId: compose === 'template' ? tpl?.id : undefined,
        modules: compose === 'modules' ? pickedModules.map(stepTemplateFromModule) : compose === 'manual' ? [] : undefined,
        ownerId: actor.userId,
        assigneeIds: Array.from(new Set([actor.userId, ...assignees])),
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        externalRef: externalId.trim()
          ? { system: 'ITSM', id: externalId.trim(), url: `https://itsm.example.internal/tickets/${externalId.trim()}` }
          : undefined,
        defaultModelId: modelOverride ?? (compose === 'template' ? tpl?.defaultModelId : undefined),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>새 업무</DialogTitle>
          <DialogDescription>업무는 Task(assistant 단위)의 조합입니다. 템플릿으로 시작하거나, 모듈을 직접 고르거나, Task 없이 수동으로 진행할 수 있습니다.</DialogDescription>
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

          <div className="grid gap-1.5">
            <Label>구성 방식</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {COMPOSE_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setCompose(o.key)}
                  className={cn('rounded-lg border px-2 py-1.5 text-left', compose === o.key ? 'border-primary bg-primary/10' : 'hover:bg-muted')}
                >
                  <div className="text-xs font-medium">{o.label}</div>
                  <div className="text-[10px] text-muted-foreground">{o.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {compose === 'template' && (
            <div className="grid gap-1.5">
              <Label>워크플로우 템플릿</Label>
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
          )}
          {compose === 'modules' && <ModuleLibraryPicker selected={picked} onChange={setPicked} />}

          {previewSteps.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-2.5">
              <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Task 구성 미리보기 ({previewSteps.length})</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {previewSteps.map((s, i) => (
                  <StepChip key={`${s.id}-${i}`} name={s.name} color={s.color} mode={s.mode} />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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
            {compose !== 'manual' && (
              <div className="grid gap-1.5">
                <Label htmlFor="nt-model">업무 기본 assistant 모델</Label>
                <Input
                  id="nt-model"
                  value={modelOverride ?? (compose === 'template' ? (tpl?.defaultModelId ?? '') : '')}
                  onChange={(e) => setModelOverride(e.target.value)}
                  placeholder="비우면 설정의 기본 모델"
                  className="font-mono"
                />
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>참여자</Label>
            <div className="flex flex-wrap gap-3">
              {users
                .filter((u) => u.id !== actor?.userId)
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={assignees.includes(u.id)} onCheckedChange={(c) => setAssignees((prev) => (c ? [...prev, u.id] : prev.filter((id) => id !== u.id)))} />
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
