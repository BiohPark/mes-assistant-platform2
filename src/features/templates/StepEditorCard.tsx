import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BookmarkPlus, Bot, GripVertical, Hand, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { STEP_KEYS, STEP_KEY_LABEL, type StepKey, type StepTemplate } from '@/domain/types'
import { STEP_COLORS } from '@/db/repositories/templates'
import { newId } from '@/lib/ids'
import { cn } from '@/lib/utils'

interface StepEditorCardProps {
  step: StepTemplate
  index: number
  onChange: (next: StepTemplate) => void
  onRemove: () => void
  onSaveToLibrary?: () => void
}

const listToText = (l: string[]) => l.join(', ')
const textToList = (t: string) =>
  t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export function StepEditorCard({ step, index, onChange, onRemove, onSaveToLibrary }: StepEditorCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const manual = step.mode === 'manual'

  function setMode(isManual: boolean) {
    const mode = isManual ? 'manual' : 'assistant'
    onChange({
      ...step,
      mode,
      assistant:
        mode === 'assistant'
          ? (step.assistant ?? { modelId: '', displayName: `${step.name} Assistant`, systemPromptHint: '' })
          : undefined,
    })
  }

  return (
    <div ref={setNodeRef} style={style} className={cn('rounded-xl border bg-card', isDragging && 'opacity-60 shadow-lg', manual && 'bg-muted/40')}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button type="button" className="cursor-grab text-muted-foreground touch-none" aria-label="순서 변경" {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <span className="flex size-6 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: manual ? '#9ca3af' : step.color }}>
          {index + 1}
        </span>
        <Input value={step.name} onChange={(e) => onChange({ ...step, name: e.target.value })} className="h-7 max-w-xs text-sm font-medium" placeholder="Task 이름" />
        <Select value={step.key} onValueChange={(v) => onChange({ ...step, key: v as StepKey, color: STEP_COLORS[v as StepKey] })}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STEP_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {STEP_KEY_LABEL[k]} ({k})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="ml-auto flex items-center gap-1.5 text-xs">
          {manual ? <Hand className="size-3.5 text-muted-foreground" /> : <Bot className="size-3.5 text-violet-600" />}
          {manual ? '수동' : 'assistant'}
          <Switch checked={!manual} onCheckedChange={(v) => setMode(!v)} />
        </label>
        {onSaveToLibrary && (
          <Button variant="ghost" size="icon-xs" aria-label="라이브러리에 저장" title="Task 모듈 라이브러리에 저장" onClick={onSaveToLibrary}>
            <BookmarkPlus />
          </Button>
        )}
        <Button variant="ghost" size="icon-xs" aria-label="Task 삭제" className="hover:text-destructive" onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <div className="grid gap-1">
          <Label className="text-[11px]">설명</Label>
          <Textarea value={step.description} onChange={(e) => onChange({ ...step, description: e.target.value })} rows={2} className="text-xs" />
        </div>
        {!manual && step.assistant && (
          <div className="grid gap-1">
            <Label className="text-[11px]">assistant 모델 ID (비우면 업무/템플릿/설정 기본값) / 표시 이름</Label>
            <div className="flex gap-1.5">
              <Input value={step.assistant.modelId} onChange={(e) => onChange({ ...step, assistant: { ...step.assistant!, modelId: e.target.value } })} className="h-7 font-mono text-xs" placeholder="기본 모델 사용" />
              <Input value={step.assistant.displayName} onChange={(e) => onChange({ ...step, assistant: { ...step.assistant!, displayName: e.target.value } })} className="h-7 text-xs" placeholder="URS Assistant" />
            </div>
            <Input
              value={step.assistant.systemPromptHint}
              onChange={(e) => onChange({ ...step, assistant: { ...step.assistant!, systemPromptHint: e.target.value } })}
              className="h-7 text-xs"
              placeholder="역할 지침 (system prompt에 추가)"
            />
          </div>
        )}
        <div className="grid gap-1">
          <Label className="text-[11px]">기대 입력 (쉼표 구분)</Label>
          <Input value={listToText(step.inputSpec)} onChange={(e) => onChange({ ...step, inputSpec: textToList(e.target.value) })} className="h-7 text-xs" placeholder="URS 문서, 요구사항 목록" />
        </div>
        <div className="grid gap-1">
          <Label className="text-[11px]">기대 산출물 (쉼표 구분)</Label>
          <Input value={listToText(step.outputSpec)} onChange={(e) => onChange({ ...step, outputSpec: textToList(e.target.value) })} className="h-7 text-xs" placeholder="FDS 문서" />
        </div>
        <div className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-[11px]">체크리스트</Label>
            <Button variant="ghost" size="xs" onClick={() => onChange({ ...step, checklist: [...step.checklist, { id: newId('chk'), label: '', required: true }] })}>
              <Plus data-icon="inline-start" />
              항목
            </Button>
          </div>
          <ul className="space-y-1">
            {step.checklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Input
                  value={c.label}
                  onChange={(e) => onChange({ ...step, checklist: step.checklist.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)) })}
                  className="h-7 text-xs"
                  placeholder="체크 항목"
                />
                <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Checkbox checked={c.required} onCheckedChange={(v) => onChange({ ...step, checklist: step.checklist.map((x) => (x.id === c.id ? { ...x, required: v === true } : x)) })} />
                  필수
                </label>
                <button type="button" aria-label="항목 삭제" className="text-muted-foreground hover:text-destructive" onClick={() => onChange({ ...step, checklist: step.checklist.filter((x) => x.id !== c.id) })}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
