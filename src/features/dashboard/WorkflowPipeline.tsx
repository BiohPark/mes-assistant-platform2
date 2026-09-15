import { ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardColumn, ColumnKey } from './useBoardData'

interface WorkflowPipelineProps {
  columns: BoardColumn[]
  counts: Record<string, number>
  selected?: ColumnKey
  onToggle: (key: ColumnKey) => void
  onClear: () => void
  total: number
}

/** 워크플로우 단계를 가로 파이프라인으로 보여주고, 단계 클릭으로 업무를 필터링한다. */
export function WorkflowPipeline({ columns, counts, selected, onToggle, onClear, total }: WorkflowPipelineProps) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">단계를 클릭하면 해당 단계의 업무만 표시됩니다</div>
        <button
          type="button"
          onClick={onClear}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
            !selected ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted',
          )}
        >
          전체 {total}
          {selected && <X className="size-3" />}
        </button>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {columns.map((col, i) => {
          const active = selected === col.key
          const count = counts[col.key] ?? 0
          const grey = col.mode === 'manual'
          return (
            <div key={col.key} className="flex items-center">
              <button
                type="button"
                onClick={() => onToggle(col.key)}
                aria-pressed={active}
                className={cn(
                  'group relative flex min-w-[120px] flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-all',
                  active
                    ? 'border-transparent text-white shadow-md'
                    : 'bg-background hover:border-foreground/30 hover:shadow-sm',
                  grey && !active && 'bg-muted/50',
                )}
                style={active ? { backgroundColor: grey ? '#6b7280' : col.color } : undefined}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className={cn('size-2 rounded-full', active && 'bg-white/80')}
                    style={active ? undefined : { backgroundColor: grey ? '#9ca3af' : col.color }}
                  />
                  {col.label}
                  {grey && <span className={cn('text-[10px]', active ? 'text-white/80' : 'text-muted-foreground')}>수동</span>}
                </span>
                <span className={cn('text-xl font-semibold tabular-nums', !active && count === 0 && 'text-muted-foreground/50')}>
                  {count}
                </span>
              </button>
              {i < columns.length - 1 && <ChevronRight className="mx-0.5 size-4 shrink-0 text-muted-foreground/40" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
