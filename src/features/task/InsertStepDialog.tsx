import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useActor } from '@/app/hooks'
import { db } from '@/db/schema'
import { insertStepAfter } from '@/db/repositories/tasks'
import { newStepTemplate } from '@/db/repositories/templates'
import { stepTemplateFromModule } from '@/db/repositories/modules'
import { STEP_KEYS, STEP_KEY_LABEL, type StepKey } from '@/domain/types'
import { ModuleLibraryPicker, useModules } from '@/features/modules/ModuleLibraryPicker'
import type { TaskData } from './useTaskData'

interface InsertStepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TaskData
  /** 이 Task 뒤에 삽입. 빈 문자열이면 맨 뒤(수동 업무의 첫 Task) */
  afterStepId: string
}

/** 업무에 Task 추가: 라이브러리 모듈을 골라 넣거나 직접 정의 (워크플로우 커스터마이징) */
export function InsertStepDialog({ open, onOpenChange, data, afterStepId }: InsertStepDialogProps) {
  const actor = useActor()
  const modules = useModules()
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [key, setKey] = useState<StepKey>('CUSTOM')
  const [manual, setManual] = useState(false)
  const [modelId, setModelId] = useState('')
  const [checklist, setChecklist] = useState('')
  const after = data.steps.find((s) => s.id === afterStepId)
  const anchor = afterStepId || (data.steps.at(-1)?.id ?? '')

  async function addFromLibrary() {
    if (!actor || picked.length === 0) return
    let cursor = anchor
    try {
      for (const id of picked) {
        const mod = modules.find((m) => m.id === id)
        if (!mod) continue
        const tpl = stepTemplateFromModule(mod)
        await insertStepAfter(actor, data.task.id, cursor, tpl)
        const steps = await db.steps.where('taskId').equals(data.task.id).sortBy('order')
        cursor = steps.find((s) => s.templateStepId === tpl.id)?.id ?? cursor
      }
      toast.success(`Task ${picked.length}개를 추가했습니다.`)
      setPicked([])
      onOpenChange(false)
    } catch (e) {
      toast.error('Task 추가에 실패했습니다.', {
        description: e instanceof Error ? e.message : String(e),
      })
    }
  }

  async function addCustom() {
    if (!actor || !name.trim()) return
    const tpl = newStepTemplate(key, name.trim(), {
      mode: manual ? 'manual' : 'assistant',
      assistant: manual
        ? undefined
        : {
            modelId: modelId.trim(),
            displayName: `${name.trim()} Assistant`,
            systemPromptHint: '',
          },
      checklist: checklist
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((label, i) => ({ id: `c${i}`, label, required: true })),
    })
    await insertStepAfter(actor, data.task.id, anchor, tpl)
    toast.success(`"${name}" Task를 추가했습니다.`)
    setName('')
    setChecklist('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Task 추가</DialogTitle>
          <DialogDescription>
            {after
              ? `"${after.name}" 뒤에 추가합니다.`
              : data.steps.length
                ? '워크플로우 맨 뒤에 추가합니다.'
                : '이 업무의 첫 Task가 됩니다.'}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="library">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library">모듈 라이브러리</TabsTrigger>
            <TabsTrigger value="custom">직접 정의</TabsTrigger>
          </TabsList>
          <TabsContent value="library" className="pt-3">
            <ModuleLibraryPicker selected={picked} onChange={setPicked} />
            <DialogFooter className="mt-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button onClick={addFromLibrary} disabled={picked.length === 0 || !actor}>
                {picked.length ? `${picked.length}개 추가` : '추가'}
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="custom" className="grid gap-3 pt-3">
            <div className="grid gap-1.5">
              <Label htmlFor="is-name">Task 이름</Label>
              <Input id="is-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 보안 검토" />
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
            {!manual && (
              <div className="grid gap-1.5">
                <Label htmlFor="is-model">assistant 모델 (비우면 업무/템플릿/설정 기본값)</Label>
                <Input
                  id="is-model"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="glm-5.2"
                  className="font-mono"
                />
              </div>
            )}
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
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button onClick={addCustom} disabled={!name.trim() || !actor}>
                추가
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
