import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { ArrowLeft, Bot, Plus, Save } from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TopBar } from '@/app/TopBar'
import { useUiStore } from '@/app/uiStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/db/schema'
import { newStepTemplate, saveTemplate } from '@/db/repositories/templates'
import type { StepTemplate, WorkflowTemplate } from '@/domain/types'
import { StepEditorCard } from './StepEditorCard'

export function TemplateEditorPage() {
  const { templateId } = useParams()
  const saved = useLiveQuery(() => (templateId ? db.templates.get(templateId) : undefined), [templateId])
  const [draft, setDraft] = useState<WorkflowTemplate | null>(null)
  const setAssistantOpen = useUiStore((s) => s.setAssistantOpen)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    if (saved && (!draft || draft.id !== saved.id)) setDraft(saved)
  }, [saved, draft])

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved)

  function updateStep(id: string, next: StepTemplate) {
    setDraft((d) => (d ? { ...d, steps: d.steps.map((s) => (s.id === id ? next : s)) } : d))
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setDraft((d) => {
      if (!d) return d
      const from = d.steps.findIndex((s) => s.id === active.id)
      const to = d.steps.findIndex((s) => s.id === over.id)
      return { ...d, steps: arrayMove(d.steps, from, to) }
    })
  }
  async function save() {
    if (!draft) return
    if (!draft.name.trim()) {
      toast.error('템플릿 이름을 입력하세요.')
      return
    }
    if (draft.steps.some((s) => !s.name.trim())) {
      toast.error('이름이 비어 있는 단계가 있습니다.')
      return
    }
    await saveTemplate(draft)
    toast.success('템플릿을 저장했습니다.')
  }

  if (saved === undefined && draft === null) {
    return (
      <>
        <TopBar title="템플릿 편집" />
        <div className="p-4 text-sm text-muted-foreground">불러오는 중…</div>
      </>
    )
  }
  if (!draft) {
    return (
      <>
        <TopBar title="템플릿 편집" />
        <div className="p-10 text-center text-sm text-muted-foreground">
          템플릿을 찾을 수 없습니다.{' '}
          <Link to="/templates" className="underline">
            목록으로
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" asChild aria-label="목록으로">
              <Link to="/templates">
                <ArrowLeft />
              </Link>
            </Button>
            템플릿 편집 · {draft.name}
            {dirty && <span className="text-[10px] text-amber-600">저장되지 않음</span>}
          </span>
        }
        actions={
          <Button size="sm" onClick={save} disabled={!dirty}>
            <Save data-icon="inline-start" />
            저장
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
          <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_180px]">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-name">템플릿 이름</Label>
              <Input id="tpl-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-cat">분류</Label>
              <Input id="tpl-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="tpl-desc">설명</Label>
              <Textarea id="tpl-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">단계 {draft.steps.length}개</h2>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setAssistantOpen(true)}>
                <Bot data-icon="inline-start" />
                assistant로 단계 구성
              </Button>
              <Button size="sm" onClick={() => setDraft({ ...draft, steps: [...draft.steps, newStepTemplate('CUSTOM', `새 단계 ${draft.steps.length + 1}`)] })}>
                <Plus data-icon="inline-start" />
                단계 추가
              </Button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={draft.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {draft.steps.map((s, i) => (
                  <StepEditorCard
                    key={s.id}
                    step={s}
                    index={i}
                    onChange={(next) => updateStep(s.id, next)}
                    onRemove={() => setDraft({ ...draft, steps: draft.steps.filter((x) => x.id !== s.id) })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {draft.steps.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              단계가 없습니다. "단계 추가" 또는 시스템 assistant로 구성하세요.
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            변경 사항은 이후 생성되는 업무에만 적용됩니다. 진행 중인 업무는 업무 화면의 "단계 추가"로 개별 조정할 수 있습니다.
          </p>
        </div>
      </div>
    </>
  )
}
