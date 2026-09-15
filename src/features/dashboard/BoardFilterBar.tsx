import { LayoutList, Columns3, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { useUiStore, type BoardView } from '@/app/uiStore'
import { useTemplates, useUsers } from '@/app/hooks'
import { TASK_STATUS_LABEL } from '@/lib/labels'
import type { TaskStatus } from '@/domain/types'

const ALL = '__all__'

export function BoardFilterBar() {
  const users = useUsers()
  const templates = useTemplates()
  const { boardView, boardFilters, setBoardView, setBoardFilters, resetBoardFilters } = useUiStore()
  const hasFilter = !!(boardFilters.search || boardFilters.assigneeId || boardFilters.templateId || boardFilters.status)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={boardFilters.search}
          onChange={(e) => setBoardFilters({ search: e.target.value })}
          placeholder="코드, 제목, 태그 검색"
          className="h-8 w-56 pl-8"
        />
      </div>
      <Select value={boardFilters.assigneeId ?? ALL} onValueChange={(v) => setBoardFilters({ assigneeId: v === ALL ? undefined : v })}>
        <SelectTrigger className="h-8 w-32" size="sm">
          <SelectValue placeholder="담당자" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>담당자 전체</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={boardFilters.templateId ?? ALL} onValueChange={(v) => setBoardFilters({ templateId: v === ALL ? undefined : v })}>
        <SelectTrigger className="h-8 w-44" size="sm">
          <SelectValue placeholder="워크플로우" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>워크플로우 전체</SelectItem>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={boardFilters.status ?? ALL} onValueChange={(v) => setBoardFilters({ status: v === ALL ? undefined : (v as TaskStatus) })}>
        <SelectTrigger className="h-8 w-28" size="sm">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>상태 전체</SelectItem>
          {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasFilter && (
        <Button variant="ghost" size="sm" onClick={resetBoardFilters}>
          <X data-icon="inline-start" />
          필터 초기화
        </Button>
      )}
      <div className="ml-auto">
        <ToggleGroup type="single" value={boardView} onValueChange={(v) => v && setBoardView(v as BoardView)} variant="outline" size="sm">
          <ToggleGroupItem value="list" aria-label="목록형">
            <LayoutList className="size-4" />
            <span className="hidden sm:inline">목록형</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="workflow" aria-label="워크플로우형">
            <Columns3 className="size-4" />
            <span className="hidden sm:inline">워크플로우형</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}
