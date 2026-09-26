import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SrStatusBadge } from '@/components/StatusBadges'
import { deleteDraftSr } from '@/db/repositories/sr'
import type { ServiceRequest } from '@/domain/types'
import { formatRelative } from '@/lib/dates'
import { cn } from '@/lib/utils'

export interface SrListItem {
  sr: ServiceRequest
  /** draft일 때 첫 user 메시지 */
  preview: string
}

interface SrListProps {
  items: SrListItem[]
  selectedId?: string
  onSelect: (id: string) => void
  onNew: () => void
  busy?: boolean
}

export function SrList({ items, selectedId, onSelect, onNew, busy }: SrListProps) {
  const [deleting, setDeleting] = useState<ServiceRequest | null>(null)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold">내 요청 {items.length > 0 && <span className="font-normal text-muted-foreground">{items.length}</span>}</h2>
        <Button size="xs" onClick={onNew} disabled={busy}>
          <Plus data-icon="inline-start" />새 대화
        </Button>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {items.length === 0 && <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">아직 요청이 없습니다. 새 대화로 시작하세요.</li>}
        {items.map(({ sr, preview }) => (
          <li key={sr.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(sr.id)}
              className={cn('w-full rounded-lg border px-2.5 py-2 text-left transition', sr.id === selectedId ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/60')}
            >
              <div className="flex items-center gap-1.5">
                <SrStatusBadge status={sr.status} />
                {sr.code && <span className="font-mono text-[10px] text-muted-foreground">{sr.code}</span>}
                <span className="ml-auto text-[10px] text-muted-foreground">{formatRelative(sr.updatedAt)}</span>
              </div>
              <div className="mt-1 truncate text-xs font-medium">{sr.title || preview || '새 대화'}</div>
            </button>
            {sr.status === 'draft' && (
              <button
                type="button"
                aria-label="대화 삭제"
                className="invisible absolute right-2 bottom-2 text-muted-foreground hover:text-destructive group-hover:visible group-focus-within:visible [@media(hover:none)]:visible"
                onClick={() => setDeleting(sr)}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="대화를 삭제할까요?"
        description="접수 전 대화와 첨부가 삭제됩니다."
        onConfirm={async () => {
          if (deleting) await deleteDraftSr(deleting.id)
        }}
      />
    </div>
  )
}
