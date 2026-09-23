import { useState } from 'react'
import { toast } from 'sonner'
import { GripVertical, Save, X } from 'lucide-react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { useActor } from '@/app/hooks'
import { reorderAssistants } from '@/db/repositories/assistants'
import type { Assistant, ID, User } from '@/domain/types'
import { cn } from '@/lib/utils'
import { AssistantCardBody, CARD_CLASS } from './AssistantCard'
import type { AssistantRow } from './useAssistantStats'

/** 드래그로 인식하기 전 이동 거리. 이보다 짧으면 클릭(설정 열기)으로 본다. */
const DRAG_ACTIVATION_PX = 6

interface SortableAssistantGridProps {
  rows: AssistantRow[]
  owners: Map<ID, User>
  onEdit: (assistant: Assistant) => void
  onDone: () => void
}

function SortableCard({ row, owner, onEdit }: { row: AssistantRow; owner?: User; onEdit: (a: Assistant) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.assistant.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, borderTopColor: row.assistant.color, borderTopWidth: 3 }}
      className={cn(CARD_CLASS, 'cursor-grab touch-none border-dashed ring-primary/40 hover:ring-2 active:cursor-grabbing', isDragging && 'z-20 shadow-lg ring-2')}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(row.assistant)}
      aria-label={`${row.assistant.name} — 드래그해서 순서 변경, 클릭해서 설정`}
    >
      <GripVertical className="absolute top-2 left-1/2 size-4 -translate-x-1/2 text-muted-foreground" />
      <AssistantCardBody row={row} owner={owner} dimmed={row.assistant.status === 'retired'} />
    </div>
  )
}

/**
 * SO 편집 모드: 카드를 끌어 공통 순서를 바꾸고(저장 전까지 로컬), 클릭하면 설정 시트를 연다.
 * 저장하면 갤러리·칸반 열 순서가 모두 바뀐다.
 */
export function SortableAssistantGrid({ rows, owners, onEdit, onDone }: SortableAssistantGridProps) {
  const actor = useActor()
  const [order, setOrder] = useState<ID[]>(() => rows.map((r) => r.assistant.id))
  const [busy, setBusy] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const byId = new Map(rows.map((r) => [r.assistant.id, r]))
  // 편집 중 새로 등록된 에이전트는 끝에 붙인다
  const ids = [...order.filter((id) => byId.has(id)), ...rows.map((r) => r.assistant.id).filter((id) => !order.includes(id))]
  const dirty = ids.some((id, i) => id !== rows[i]?.assistant.id)

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  async function save() {
    if (!actor) return
    setBusy(true)
    try {
      await reorderAssistants(actor, ids)
      toast.success('순서를 저장했습니다. 칸반 열도 같은 순서로 보입니다.')
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs backdrop-blur">
        <span className="font-medium">편집 모드</span>
        <span className="text-muted-foreground">카드를 끌어 순서를 바꾸고, 클릭하면 설정을 엽니다. 순서는 모든 사용자에게 같게 보입니다.</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
            <X data-icon="inline-start" />
            취소
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>
            <Save data-icon="inline-start" />
            순서 저장
          </Button>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {ids.map((id) => {
              const row = byId.get(id)!
              return <SortableCard key={id} row={row} owner={owners.get(row.assistant.ownerId)} onEdit={onEdit} />
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
