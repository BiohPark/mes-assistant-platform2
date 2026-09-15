import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { TopBar } from '@/app/TopBar'
import { useUiStore } from '@/app/uiStore'
import { useTemplates } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { STEP_COLORS } from '@/db/repositories/templates'
import { applyBoardFilters, boardColumns, useBoardRows } from './useBoardData'
import { WorkflowPipeline } from './WorkflowPipeline'
import { KpiTiles } from './KpiTiles'
import { BoardFilterBar } from './BoardFilterBar'
import { TaskListTable } from './TaskListTable'
import { WorkflowColumns } from './WorkflowColumns'
import { NewTaskDialog } from './NewTaskDialog'

export function BoardPage() {
  const rows = useBoardRows()
  const templates = useTemplates()
  const { boardView, boardFilters, toggleStepFilter, setBoardFilters } = useUiStore()
  const [newOpen, setNewOpen] = useState(false)

  const selectedTemplate = templates.find((t) => t.id === boardFilters.templateId)
  const columns = useMemo(() => boardColumns(selectedTemplate, STEP_COLORS), [selectedTemplate])

  // 단계 필터를 제외한 나머지 필터만 적용한 행 → 파이프라인 카운트에 사용
  const baseRows = useMemo(() => (rows ? applyBoardFilters(rows, { ...boardFilters, stepKey: undefined }) : []), [rows, boardFilters])
  const filteredRows = useMemo(() => (rows ? applyBoardFilters(rows, boardFilters) : []), [rows, boardFilters])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of baseRows) c[r.columnKey] = (c[r.columnKey] ?? 0) + 1
    return c
  }, [baseRows])

  return (
    <>
      <TopBar
        title="워크플로우 보드"
        actions={
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus data-icon="inline-start" />새 업무
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-4">
          {!rows ? (
            <>
              <Skeleton className="h-16" />
              <Skeleton className="h-24" />
              <Skeleton className="h-64" />
            </>
          ) : (
            <>
              <KpiTiles rows={rows} />
              <WorkflowPipeline
                columns={columns}
                counts={counts}
                selected={boardFilters.stepKey}
                onToggle={toggleStepFilter}
                onClear={() => setBoardFilters({ stepKey: undefined })}
                total={baseRows.length}
              />
              <BoardFilterBar />
              {boardView === 'list' ? (
                <TaskListTable rows={filteredRows} />
              ) : (
                <WorkflowColumns columns={columns} allRows={baseRows} rows={filteredRows} selected={boardFilters.stepKey} onSelect={toggleStepFilter} />
              )}
            </>
          )}
        </div>
      </div>
      <NewTaskDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  )
}
