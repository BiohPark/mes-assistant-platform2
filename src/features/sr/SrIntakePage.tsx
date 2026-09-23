import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronDown, FileEdit, Inbox, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TopBar } from '@/app/TopBar'
import { useActor, useCurrentUserId, useSettings, useUserMap } from '@/app/hooks'
import { EmptyState } from '@/components/EmptyState'
import { SrStatusBadge } from '@/components/StatusBadges'
import { db } from '@/db/schema'
import { startSrConversation } from '@/db/repositories/sr'
import { ChatView } from '@/features/chat/ChatView'
import { describeActivity } from '@/lib/activity'
import type { ServiceRequest } from '@/domain/types'
import { ACTIVITY_LABEL } from '@/lib/labels'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { SrTitleEditor } from './SrTitleEditor'
import { SrConvertDialog } from './SrConvertDialog'
import { SrList, type SrListItem } from './SrList'
import { SharedResults } from './SharedResults'

/** /sr(접수) | /sr/manage(관리) 상단 탭 */
export function SrTabs() {
  const { pathname } = useLocation()
  const tab = (to: string, label: string) => (
    <Link to={to} className={cn('rounded-md px-2.5 py-1 text-xs', pathname === to ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}>
      {label}
    </Link>
  )
  return (
    <div className="inline-flex gap-1 rounded-lg border bg-card p-0.5">
      {tab('/sr', '접수')}
      {tab('/sr/manage', '관리')}
    </div>
  )
}

export function SrIntakePage() {
  const actor = useActor()
  const userId = useCurrentUserId()
  const settings = useSettings()
  const users = useUserMap()
  const [selectedId, setSelectedId] = useState<string>()
  const [convertOpen, setConvertOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const intake = useLiveQuery(() => (settings?.srIntakeAssistantId ? db.assistants.get(settings.srIntakeAssistantId) : undefined), [settings?.srIntakeAssistantId])

  const items = useLiveQuery(async () => {
    if (!userId) return []
    const srs = await db.serviceRequests.where('requesterId').equals(userId).toArray()
    const list = await Promise.all(
      srs.map(async (sr): Promise<SrListItem> => {
        const first = sr.status === 'draft' ? await db.messages.where('threadId').equals(sr.threadId).filter((m) => m.role === 'user').first() : undefined
        return { sr, preview: first?.content.slice(0, 40) ?? '' }
      }),
    )
    return list.sort((a, b) => b.sr.updatedAt.localeCompare(a.sr.updatedAt))
  }, [userId])

  const selected = items?.find((i) => i.sr.id === selectedId)?.sr ?? items?.[0]?.sr
  const detail = useLiveQuery(async () => {
    if (!selected) return undefined
    const [messages, files, linkedTasks, activity] = await Promise.all([
      db.messages.where('threadId').equals(selected.threadId).sortBy('createdAt'),
      db.files.where('originSrId').equals(selected.id).toArray(),
      selected.code ? db.tasks.where('tags').equals(selected.code).toArray() : Promise.resolve([]),
      db.activity.where('srId').equals(selected.id).sortBy('at'),
    ])
    return { messages, files, linkedTasks, activity: activity.reverse() }
  }, [selected?.id, selected?.threadId])

  async function startNew() {
    if (!actor) return
    setCreating(true)
    try {
      const sr = await startSrConversation(actor)
      setSelectedId(sr.id)
    } finally {
      setCreating(false)
    }
  }

  const canEdit = (sr: ServiceRequest) => sr.status === 'draft' || sr.status === 'submitted'

  return (
    <>
      <TopBar title="SR 접수" actions={<SrTabs />} />
      {!intake && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          SR 접수 에이전트가 지정되지 않았습니다.{' '}
          <Link to="/settings" className="underline">
            설정
          </Link>
          에서 지정하세요.
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[288px_1fr]">
        <aside className="max-h-56 border-b p-3 lg:max-h-none lg:border-r lg:border-b-0">
          <SrList items={items ?? []} selectedId={selected?.id} onSelect={setSelectedId} onNew={startNew} busy={creating || !intake} />
        </aside>
        <section className="flex min-h-0 flex-1 flex-col">
          {!selected || !detail || !intake ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={Inbox}
                title="요청을 시작해 보세요"
                description={`${intake?.name ?? '접수 에이전트'}와 대화하며 요청을 정리하고, 준비되면 접수로 전환합니다. 대화는 저장되어 언제든 이어갈 수 있습니다.`}
                action={
                  <Button onClick={startNew} disabled={!intake || creating}>
                    새 대화
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-2">
                <SrStatusBadge status={selected.status} />
                {selected.code ? (
                  <>
                    <span className="font-mono text-xs text-muted-foreground">{selected.code}</span>
                    <SrTitleEditor key={selected.id + selected.title} sr={selected} />
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">접수 전 대화</span>
                )}
                {detail.linkedTasks.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    · 진행 중 업무
                    {detail.linkedTasks.map((t) => (
                      <span key={t.id} className="rounded-full border px-1.5 font-mono">
                        {t.code}
                      </span>
                    ))}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="xs" onClick={() => setHistoryOpen((v) => !v)}>
                    상태 이력 <ChevronDown className={cn('transition', historyOpen && 'rotate-180')} />
                  </Button>
                  {selected.status === 'draft' ? (
                    <Button size="sm" onClick={() => setConvertOpen(true)} disabled={!actor}>
                      <Send data-icon="inline-start" />
                      접수로 전환
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setConvertOpen(true)} disabled={!canEdit(selected)}>
                      <FileEdit data-icon="inline-start" />
                      {canEdit(selected) ? '접수 내용 수정' : '접수 내용 보기'}
                    </Button>
                  )}
                </div>
              </div>
              {historyOpen && (
                <ol className="max-h-40 space-y-1 overflow-y-auto border-b bg-muted/30 px-4 py-2 text-[11px]">
                  {detail.activity.map((a) => (
                    <li key={a.id} className="flex gap-2">
                      <span className="text-muted-foreground">{formatDateTime(a.at)}</span>
                      <span className="font-medium">{users.get(a.userId)?.name}</span>
                      <span>{ACTIVITY_LABEL[a.type] ?? a.type}</span>
                      <span className="text-muted-foreground">{describeActivity(a)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {selected.results.length > 0 && <SharedResults sr={selected} />}
              <div className="min-h-0 flex-1">
                <ChatView scope={{ kind: 'sr', sr: selected, intake, files: detail.files }} readOnly={selected.status === 'done' || selected.status === 'rejected'} />
              </div>
              {convertOpen && (
                <SrConvertDialog open onOpenChange={setConvertOpen} sr={selected} intake={intake} messages={detail.messages} files={detail.files} />
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
