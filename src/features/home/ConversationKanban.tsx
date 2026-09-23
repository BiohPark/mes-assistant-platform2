import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Filter, MessageSquarePlus, RotateCcw, Search, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { TagInput } from '@/components/TagInput'
import { useActor } from '@/app/hooks'
import { useTagSuggest } from '@/app/useTagSuggest'
import { useUiStore } from '@/app/uiStore'
import { db } from '@/db/schema'
import { setTaskStatus } from '@/db/repositories/tasks'
import { filterFromParams, filterToParams, isFiltering, kanbanColumns, stageOptions, type KanbanFilter } from '@/domain/kanban'
import { tagKey } from '@/domain/tags'
import { TASK_STATUSES, type TaskStatus } from '@/domain/types'
import { TASK_STATUS_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { ConversationCard } from './ConversationCard'

const colId = (assistantId: string) => `kanban-col-${assistantId}`

/**
 * 전체 대화 칸반. 열 = 에이전트(갤러리와 같은 순서, 가로 1행), 카드 = 대화(최근 활동순).
 * 필터는 URL에 동기화된다 — 태그 칩을 누르면 해당 태그로 필터된 칸반으로 온다.
 */
export function ConversationKanban() {
  const [params, setParams] = useSearchParams()
  const filter = filterFromParams(params)
  const actor = useActor()
  const suggest = useTagSuggest()
  const collapseEmpty = useUiStore((s) => s.kanbanCollapseEmpty)
  const setCollapseEmpty = useUiStore((s) => s.setKanbanCollapseEmpty)
  const data = useLiveQuery(async () => {
    const [assistants, tasks] = await Promise.all([db.assistants.toArray(), db.tasks.toArray()])
    return { assistants, tasks }
  }, [])

  const update = (patch: Partial<KanbanFilter>) => setParams(filterToParams({ ...filter, ...patch }, params), { replace: true })
  const reset = () => setParams(filterToParams({ stages: [], statuses: [], tags: [], mine: false, q: '' }, params), { replace: true })

  if (!data) return <div className="p-4 text-sm text-muted-foreground">불러오는 중…</div>
  const columns = kanbanColumns(data.assistants, data.tasks, filter, actor?.userId)
  const stages = stageOptions(data.assistants)
  const total = columns.reduce((n, c) => n + c.tasks.length, 0)
  const focused = filter.assistantId ? data.assistants.find((a) => a.id === filter.assistantId) : undefined

  const toggleStage = (key: string) => update({ stages: filter.stages.includes(key) ? filter.stages.filter((s) => s !== key) : [...filter.stages, key] })
  const addTag = (t: string) => {
    if (!filter.tags.some((x) => tagKey(x) === tagKey(t))) update({ tags: [...filter.tags, t] })
  }

  async function changeStatus(taskId: string, status: TaskStatus) {
    if (!actor) return
    await setTaskStatus(actor, taskId, status)
    toast.success(`상태를 '${TASK_STATUS_LABEL[status]}'(으)로 바꿨습니다.`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={filter.q} onChange={(e) => update({ q: e.target.value })} placeholder="코드 · 제목 · 태그 검색" className="h-8 pl-8" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn(filter.stages.length > 0 && 'border-primary text-primary')}>
              <Filter data-icon="inline-start" />
              단계{filter.stages.length > 0 && ` ${filter.stages.length}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-2 p-3">
            <div className="text-xs font-medium">업무 단계 (여러 개 선택)</div>
            {stages.map((g) => (
              <div key={g.level1} className="space-y-1">
                <div className="text-[10px] text-muted-foreground">{g.level1}</div>
                <div className="flex flex-wrap gap-1">
                  {g.stages.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      aria-pressed={filter.stages.includes(s.key)}
                      onClick={() => toggleStage(s.key)}
                      className={cn('rounded-full border px-2 py-0.5 text-[11px]', filter.stages.includes(s.key) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
                    >
                      {s.level2}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filter.stages.length > 0 && (
              <Button size="xs" variant="ghost" onClick={() => update({ stages: [] })}>
                단계 해제
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={filter.statuses}
          onValueChange={(v) => update({ statuses: v as TaskStatus[] })}
          aria-label="상태 필터"
          className="flex-wrap"
        >
          {TASK_STATUSES.map((s) => (
            <ToggleGroupItem key={s} value={s} className="text-xs">
              {TASK_STATUS_LABEL[s]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Label className="flex items-center gap-1.5 text-xs">
          <Switch checked={filter.mine} onCheckedChange={(v) => update({ mine: v })} />내 대화
        </Label>
        <TagInput tags={filter.tags} suggest={suggest} onAdd={addTag} onRemove={(t) => update({ tags: filter.tags.filter((x) => x !== t) })} placeholder="태그 필터" />
        {focused && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px]">
            <AssistantAvatar assistant={focused} size="xs" className="size-4 rounded text-[8px]" />
            {focused.name}
            <button type="button" aria-label="에이전트 필터 해제" onClick={() => update({ assistantId: undefined })}>
              <X className="size-3" />
            </button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={collapseEmpty} onCheckedChange={setCollapseEmpty} />빈 열 접기
          </Label>
          {isFiltering(filter) && (
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw data-icon="inline-start" />
              초기화
            </Button>
          )}
        </div>
      </div>

      {/* 열 미니맵: 열이 많아도 바로 이동 */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="열 이동">
        <span className="shrink-0 text-[10px] text-muted-foreground">대화 {total}</span>
        {columns.map((c) => (
          <button
            key={c.assistant.id}
            type="button"
            title={`${c.assistant.name} (${c.tasks.length})`}
            onClick={() => document.getElementById(colId(c.assistant.id))?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })}
            className={cn('relative shrink-0 rounded-md', c.tasks.length === 0 && 'opacity-40')}
          >
            <AssistantAvatar assistant={c.assistant} size="xs" />
            {c.tasks.length > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-foreground px-1 text-[8px] leading-3 text-background">{c.tasks.length}</span>}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {columns.map(({ assistant, tasks }) => {
          const collapsed = collapseEmpty && tasks.length === 0
          if (collapsed) {
            return (
              <div key={assistant.id} id={colId(assistant.id)} className="flex w-10 shrink-0 flex-col items-center gap-2 rounded-xl border border-dashed py-2" title={`${assistant.name} — 대화 없음`}>
                <AssistantAvatar assistant={assistant} size="xs" />
                <span className="text-[10px] text-muted-foreground [writing-mode:vertical-rl]">{assistant.name}</span>
              </div>
            )
          }
          return (
            <section key={assistant.id} id={colId(assistant.id)} className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40" aria-label={`${assistant.name} 열`}>
              <header className="flex items-center gap-2 border-b px-2.5 py-2" style={{ borderTop: `3px solid ${assistant.color}`, borderRadius: '0.75rem 0.75rem 0 0' }}>
                <AssistantAvatar assistant={assistant} size="xs" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold" title={assistant.name}>
                    {assistant.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {assistant.level1} › {assistant.level2}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{tasks.length}</span>
                {assistant.status !== 'retired' && (
                  <Button size="icon-xs" variant="ghost" asChild>
                    <Link
                      to={`/new/${encodeURIComponent(assistant.id)}${filter.tags.length ? `?${filter.tags.map((t) => `tag=${encodeURIComponent(t)}`).join('&')}` : ''}`}
                      aria-label={`${assistant.name} 새 대화`}
                      title={filter.tags.length ? `새 대화 (태그 ${filter.tags.join(', ')} 포함)` : '새 대화'}
                    >
                      <MessageSquarePlus />
                    </Link>
                  </Button>
                )}
              </header>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {tasks.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-muted-foreground">대화 없음</div>
                ) : (
                  tasks.map((t) => <ConversationCard key={t.id} task={t} onTagClick={addTag} onStatusChange={(s) => void changeStatus(t.id, s)} />)
                )}
              </div>
            </section>
          )
        })}
        {columns.length === 0 && <div className="p-6 text-sm text-muted-foreground">조건에 맞는 에이전트 열이 없습니다. 단계 필터를 확인하세요.</div>}
      </div>
    </div>
  )
}
