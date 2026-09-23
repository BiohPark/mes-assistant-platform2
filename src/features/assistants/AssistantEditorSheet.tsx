import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Markdown } from '@/components/Markdown'
import { useActor, useAssistants, useSettings, useUsers } from '@/app/hooks'
import { createAssistant, defaultChecklistTemplate, deleteAssistant, newChecklistTemplateItem, setAssistantImage, updateAssistant, type AssistantInput } from '@/db/repositories/assistants'
import { useModelList } from '@/llm/useModelList'
import { assistantLink1 } from '@/lib/links'
import { ASSISTANT_STATUS_LABEL } from '@/lib/labels'
import { ASSISTANT_STATUSES, type Assistant, type AssistantStatus, type ChecklistTemplateItem } from '@/domain/types'
import { ImageDropzone } from './ImageDropzone'

interface AssistantEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 없으면 신규 등록 */
  assistant?: Assistant
}

type Form = AssistantInput

function emptyForm(ownerId: string): Form {
  return { id: '', name: '', level1: '', level2: '', summary: '', docUrl: '', modelId: '', link1: '', expectedInputs: [], expectedOutputs: [], ownerId, status: 'developing', usageExample: '', checklistTemplate: defaultChecklistTemplate() }
}

/** "a, b ,, c" → ['a','b','c'] */
function splitList(v: string): string[] {
  return v.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
}

function formFrom(a: Assistant): Form {
  return {
    id: a.id,
    name: a.name,
    level1: a.level1,
    level2: a.level2,
    summary: a.summary,
    docUrl: a.docUrl ?? '',
    modelId: a.modelId ?? '',
    link1: a.link1 ?? '',
    expectedInputs: a.expectedInputs,
    expectedOutputs: a.expectedOutputs,
    ownerId: a.ownerId,
    status: a.status,
    usageExample: a.usageExample,
    checklistTemplate: a.checklistTemplate,
  }
}

export function AssistantEditorSheet({ open, onOpenChange, assistant }: AssistantEditorSheetProps) {
  const actor = useActor()
  const users = useUsers()
  const settings = useSettings()
  const assistants = useAssistants()
  const modelList = useModelList(settings?.llm, open)
  const [form, setForm] = useState<Form>(() => (assistant ? formFrom(assistant) : emptyForm(actor?.userId ?? '')))
  const [image, setImage] = useState<File | null | undefined>(undefined)
  // 쉼표 입력 중에도 글자가 사라지지 않도록 원문으로 들고 있다가 저장 때 나눈다
  const [inputsText, setInputsText] = useState(() => (form.expectedInputs ?? []).join(', '))
  const [outputsText, setOutputsText] = useState(() => (form.expectedOutputs ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isNew = !assistant
  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }))
  const level1Options = [...new Set(assistants.map((a) => a.level1))]
  // 필수: ID·이름·Lv1·Lv2. 담당자는 비우면 저장 시 현재 사용자로 채운다(시트가 사용자 로딩 전에 열려도 막히지 않게)
  const missing = [
    [form.id.trim(), 'ID'],
    [form.name.trim(), '이름'],
    [form.level1.trim(), '업무 Lv1'],
    [form.level2.trim(), '업무 Lv2'],
  ]
    .filter(([v]) => !v)
    .map(([, label]) => label)
  const canSave = missing.length === 0

  function moveChecklist(id: string, step: -1 | 1) {
    const list = [...form.checklistTemplate]
    const i = list.findIndex((c) => c.id === id)
    const j = i + step
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    patch({ checklistTemplate: list })
  }

  function updateChecklist(id: string, p: Partial<ChecklistTemplateItem>) {
    patch({ checklistTemplate: form.checklistTemplate.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  }

  async function save() {
    if (!actor || !canSave) return
    setBusy(true)
    try {
      const input: AssistantInput = {
        ...form,
        id: form.id.trim(),
        // 기존 에이전트의 "담당자 없음"은 그대로 둔다
        ownerId: isNew ? form.ownerId || actor.userId : form.ownerId,
        docUrl: form.docUrl?.trim() || undefined,
        // 비우면 공통 기본 모델 (링크에서 추정하지 않음)
        modelId: form.modelId?.trim() || undefined,
        link1: form.link1?.trim() || undefined,
        expectedInputs: splitList(inputsText),
        expectedOutputs: splitList(outputsText),
        checklistTemplate: form.checklistTemplate.filter((c) => c.label.trim()),
      }
      if (isNew) {
        await createAssistant(actor, input)
        if (image) await setAssistantImage(actor, input.id, image)
        toast.success(`${input.name} 에이전트를 카탈로그 끝에 등록했습니다.`)
      } else {
        const { id: _id, ...rest } = input
        await updateAssistant(actor, assistant.id, rest)
        if (image !== undefined) await setAssistantImage(actor, assistant.id, image)
        toast.success('저장했습니다.')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!assistant) return
    const r = await deleteAssistant(assistant.id)
    if (!r.ok) {
      toast.error(r.reason)
      return
    }
    toast.success('삭제했습니다.')
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isNew ? '새 에이전트' : '에이전트 편집'}</SheetTitle>
          <SheetDescription>모델 ID를 비워 두면 설정의 공통 기본 모델을 씁니다. 링크1을 비우면 모델 ID로 만든 주소를 씁니다.</SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-4 pb-6">
          <ImageDropzone assistant={assistant} onChange={setImage} />

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="as-id">ID (카탈로그 키)</Label>
              <Input id="as-id" value={form.id} onChange={(e) => patch({ id: e.target.value })} disabled={!isNew} className="font-mono" placeholder="fds-writer" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-model">모델 ID (사내 AI)</Label>
              <Input
                id="as-model"
                list="as-model-options"
                value={form.modelId ?? ''}
                onChange={(e) => patch({ modelId: e.target.value })}
                className="font-mono"
                placeholder={`비우면 기본: ${settings?.llm.model ?? ''}`}
              />
              <datalist id="as-model-options">
                {modelList.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="as-link1">링크1 (OpenWebUI 주소)</Label>
            <Input id="as-link1" value={form.link1 ?? ''} onChange={(e) => patch({ link1: e.target.value })} placeholder="https://…/?model=…" />
            {settings && !form.link1?.trim() && (
              <div className="truncate text-[11px] text-muted-foreground">
                비워 두면: {assistantLink1(settings.llm.baseUrl, { id: form.id.trim() || 'id', modelId: form.modelId?.trim() })}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="as-name">AssistantName</Label>
            <Input id="as-name" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="as-l1">업무 Lv1</Label>
              <Input id="as-l1" list="as-l1-options" value={form.level1} onChange={(e) => patch({ level1: e.target.value })} />
              <datalist id="as-l1-options">
                {level1Options.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-l2">업무 Lv2</Label>
              <Input id="as-l2" value={form.level2} onChange={(e) => patch({ level2: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="as-summary">요약</Label>
            <Textarea id="as-summary" rows={2} value={form.summary} onChange={(e) => patch({ summary: e.target.value })} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="as-doc">링크2 (설명 페이지 URL)</Label>
            <Input id="as-doc" value={form.docUrl ?? ''} onChange={(e) => patch({ docUrl: e.target.value })} placeholder="http://wiki.internal/…" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>담당자</Label>
              <Select value={form.ownerId} onValueChange={(v) => patch({ ownerId: v })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue placeholder="비우면 나" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>상태</Label>
              <Select value={form.status} onValueChange={(v) => patch({ status: v as AssistantStatus })}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSISTANT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ASSISTANT_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="as-in">주로 쓰는 입력 (쉼표 구분)</Label>
              <Input id="as-in" value={inputsText} onChange={(e) => setInputsText(e.target.value)} placeholder="URS, 개정 전 FDS" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="as-out">주요 산출물 (쉼표 구분)</Label>
              <Input id="as-out" value={outputsText} onChange={(e) => setOutputsText(e.target.value)} placeholder="FDS" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>체크리스트 (기본값 · 강제 아님)</Label>
              <div className="flex gap-0.5">
                <Button type="button" size="xs" variant="ghost" onClick={() => patch({ checklistTemplate: defaultChecklistTemplate() })} title="공통 기본 항목으로 되돌리기">
                  <RotateCcw data-icon="inline-start" />
                  기본값
                </Button>
                <Button type="button" size="xs" variant="ghost" onClick={() => patch({ checklistTemplate: [...form.checklistTemplate, newChecklistTemplateItem('')] })}>
                  <Plus data-icon="inline-start" />
                  항목
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">새 대화를 시작할 때 복사됩니다. 이미 진행 중인 대화는 바뀌지 않으며, 대화 화면에서 항목을 따로 더하거나 뺄 수 있습니다.</p>
            {form.checklistTemplate.length === 0 && <div className="text-xs text-muted-foreground">새 대화에 복사될 체크 항목이 없습니다.</div>}
            {form.checklistTemplate.map((c, i) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input value={c.label} onChange={(e) => updateChecklist(c.id, { label: e.target.value })} className="h-8" placeholder="항목" />
                <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Switch checked={c.required} onCheckedChange={(v) => updateChecklist(c.id, { required: v })} /> 중요
                </label>
                <Button type="button" size="icon-xs" variant="ghost" aria-label="위로" disabled={i === 0} onClick={() => moveChecklist(c.id, -1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label="아래로" disabled={i === form.checklistTemplate.length - 1} onClick={() => moveChecklist(c.id, 1)}>
                  <ArrowDown />
                </Button>
                <Button type="button" size="icon-xs" variant="ghost" aria-label="항목 삭제" onClick={() => patch({ checklistTemplate: form.checklistTemplate.filter((x) => x.id !== c.id) })}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label>사용예시 (markdown)</Label>
            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">편집</TabsTrigger>
                <TabsTrigger value="preview">미리보기</TabsTrigger>
              </TabsList>
              <TabsContent value="edit">
                <Textarea rows={5} value={form.usageExample} onChange={(e) => patch({ usageExample: e.target.value })} placeholder={'### 예시\n- "…해줘"'} />
              </TabsContent>
              <TabsContent value="preview">
                <div className="rounded-lg border p-3">
                  {form.usageExample ? <Markdown content={form.usageExample} /> : <span className="text-xs text-muted-foreground">내용 없음</span>}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex items-center justify-between pt-2">
            {!isNew ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 data-icon="inline-start" />
                삭제
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              {missing.length > 0 && <span className="text-[11px] text-muted-foreground">필수 입력: {missing.join(', ')}</span>}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                취소
              </Button>
              <Button onClick={save} disabled={busy || !canSave}>
                {isNew ? '등록' : '저장'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="에이전트를 삭제할까요?"
        description="대화가 있는 에이전트는 삭제 대신 '폐기' 상태로 변경하세요."
        onConfirm={remove}
      />
    </Sheet>
  )
}
