import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Bot, KanbanSquare, LayoutGrid, Pencil, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TopBar } from '@/app/TopBar'
import { useCurrentUser, useSettings, useUserMap } from '@/app/hooks'
import { useUiStore } from '@/app/uiStore'
import { EmptyState } from '@/components/EmptyState'
import { AssistantEditorSheet } from '@/features/assistants/AssistantEditorSheet'
import type { Assistant } from '@/domain/types'
import { cn } from '@/lib/utils'
import { AssistantCard } from './AssistantCard'
import { CardMapFilterBar } from './CardMapFilterBar'
import { ConversationKanban } from './ConversationKanban'
import { SortableAssistantGrid } from './SortableAssistantGrid'
import { useAssistantRows, type AssistantRow } from './useAssistantStats'

type HomeView = 'cards' | 'kanban'

function matches(row: AssistantRow, q: string, level1: string | null, level2: string | null, showRetired: boolean): boolean {
  const a = row.assistant
  if (!showRetired && a.status === 'retired') return false
  if (level1 && a.level1 !== level1) return false
  if (level2 && a.level2 !== level2) return false
  if (!q) return true
  return `${a.name} ${a.summary} ${a.level1} ${a.level2}`.toLowerCase().includes(q.toLowerCase())
}

const VIEWS: Array<{ value: HomeView; label: string; icon: typeof LayoutGrid }> = [
  { value: 'cards', label: '에이전트 카드', icon: LayoutGrid },
  { value: 'kanban', label: '전체 대화 칸반', icon: KanbanSquare },
]

/** 눈에 띄는 세그먼트 토글: 카드 목록 ↔ 전체 대화 칸반 (URL `view`로 유지) */
function ViewToggle({ view, onChange }: { view: HomeView; onChange: (v: HomeView) => void }) {
  return (
    <div role="tablist" aria-label="보기 전환" className="inline-flex rounded-xl border bg-muted p-1 shadow-xs">
      {VIEWS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={view === value}
          onClick={() => onChange(value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
            view === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

export function HomePage() {
  const [params, setParams] = useSearchParams()
  const view: HomeView = params.get('view') === 'kanban' ? 'kanban' : 'cards'
  const rows = useAssistantRows()
  const { q, level1, level2, showRetired } = useUiStore((s) => s.homeFilters)
  const settings = useSettings()
  const users = useUserMap()
  const me = useCurrentUser()
  const isSo = !!me?.isSystemOwner
  const [editing, setEditing] = useState(false)
  const [editorFor, setEditorFor] = useState<Assistant | null>(null)

  const all = rows ?? []
  const filtered = all.filter((r) => matches(r, q, level1, level2, showRetired))
  // 편집 모드는 폐기 포함 전체를 보여 주므로 검색·분류 필터만 막는다
  const filteringCards = !!q || !!level1 || !!level2
  const level1Options = [...new Set(all.map((r) => r.assistant.level1))]
  const level2Options = level1 ? [...new Set(all.filter((r) => r.assistant.level1 === level1).map((r) => r.assistant.level2))] : []

  function switchView(v: HomeView) {
    setEditing(false)
    const next = new URLSearchParams(v === 'kanban' ? params : undefined)
    if (v === 'kanban') next.set('view', 'kanban')
    setParams(next)
  }

  return (
    <>
      <TopBar
        title="MES Agent Hub"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/assistants/manage">
              <Settings2 data-icon="inline-start" />
              관리
            </Link>
          </Button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <ViewToggle view={view} onChange={switchView} />
          {view === 'cards' && isSo && !editing && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* 필터 중에는 일부만 보이므로 순서 편집을 막는다 */}
                <span className="ml-auto">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={filteringCards}>
                    <Pencil data-icon="inline-start" />
                    편집 모드
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{filteringCards ? '검색·분류 필터를 해제하면 편집할 수 있습니다' : '카드 순서·설정 편집 (System Owner)'}</TooltipContent>
            </Tooltip>
          )}
        </div>

        {view === 'kanban' ? (
          <ConversationKanban />
        ) : editing ? (
          <SortableAssistantGrid rows={all} owners={users} onEdit={setEditorFor} onDone={() => setEditing(false)} />
        ) : (
          <>
            <CardMapFilterBar level1Options={level1Options} level2Options={level2Options} />
            {rows && filtered.length === 0 && (
              <EmptyState
                icon={Bot}
                title={rows.length === 0 ? '에이전트가 없습니다' : '조건에 맞는 에이전트가 없습니다'}
                description={rows.length === 0 ? '관리 페이지에서 첫 에이전트를 등록하세요.' : '검색어나 필터를 바꿔 보세요.'}
                action={
                  rows.length === 0 && (
                    <Button asChild>
                      <Link to="/assistants/manage">에이전트 등록</Link>
                    </Button>
                  )
                }
              />
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((row) => (
                <AssistantCard key={row.assistant.id} row={row} owner={users.get(row.assistant.ownerId)} baseUrl={settings?.llm.baseUrl ?? ''} />
              ))}
            </div>
          </>
        )}
      </div>
      {editorFor && <AssistantEditorSheet key={editorFor.id} open onOpenChange={(o) => !o && setEditorFor(null)} assistant={editorFor} />}
    </>
  )
}
