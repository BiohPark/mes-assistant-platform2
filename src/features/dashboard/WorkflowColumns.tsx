import { cn } from '@/lib/utils'
import { TaskCard } from './TaskCard'
import type { BoardColumn, BoardRow, ColumnKey } from './useBoardData'

interface WorkflowColumnsProps {
  columns: BoardColumn[]
  /** 필터 적용 전 전체 행 (컬럼 카운트/축소 표시용) */
  allRows: BoardRow[]
  /** 필터 적용 후 행 */
  rows: BoardRow[]
  selected?: ColumnKey
  onSelect: (key: ColumnKey) => void
}

/** 워크플로우형 보기: 단계별 컬럼. 선택 단계는 강조, 나머지는 축소. */
export function WorkflowColumns({ columns, allRows, rows, selected, onSelect }: WorkflowColumnsProps) {
  const visibleIds = new Set(rows.map((r) => r.task.id))
  return (
    <div className="flex min-h-[420px] gap-2 overflow-x-auto pb-2">
      {columns.map((col) => {
        const colRows = allRows.filter((r) => r.columnKey === col.key)
        const shown = colRows.filter((r) => visibleIds.has(r.task.id))
        const collapsed = !!selected && selected !== col.key
        const grey = col.mode === 'manual'
        return (
          <section
            key={col.key}
            className={cn(
              'flex shrink-0 flex-col rounded-xl border bg-muted/40 transition-all',
              collapsed ? 'w-14' : selected === col.key ? 'w-[360px] border-foreground/30 bg-muted/60 shadow-sm' : 'min-w-[230px] flex-1 basis-0',
              grey && 'bg-muted/70',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(col.key)}
              className={cn('flex items-center gap-2 px-3 py-2 text-left', collapsed && 'flex-col px-0 py-3')}
              title={col.label}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: grey ? '#9ca3af' : col.color }} />
              <span className={cn('text-xs font-semibold', collapsed && '[writing-mode:vertical-rl] text-muted-foreground')}>{col.label}</span>
              <span className={cn('rounded-full bg-background px-1.5 text-[10px] tabular-nums text-muted-foreground', !collapsed && 'ml-auto')}>
                {collapsed ? colRows.length : shown.length}
              </span>
            </button>
            {!collapsed && (
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {shown.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">업무 없음</div>
                )}
                {shown.map((r) => (
                  <TaskCard key={r.task.id} row={r} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
