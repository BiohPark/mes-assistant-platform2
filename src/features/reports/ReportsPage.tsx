import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowRight, Download, Star } from 'lucide-react'
import { TopBar } from '@/app/TopBar'
import { useAssistantMap, useUsers } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { SrStatusBadge } from '@/components/StatusBadges'
import { TagChip } from '@/components/TagChip'
import { db } from '@/db/schema'
import { downloadBlob } from '@/db/repositories/files'
import {
  assistantStats,
  completionBuckets,
  feedbackDigest,
  feedbackDigestMarkdown,
  inefficiencySignals,
  inputFlow,
  SIGNAL_LABEL,
  srLeadDays,
  srStatusDistribution,
  tagUsage,
  userActivityStats,
  type Granularity,
} from '@/domain/reporting'
import { formatDateTime } from '@/lib/dates'
import { SR_STATUS_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { BarsChart } from './charts'

const ALL = '__all__'

function Card({
  title,
  children,
  action,
  className,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Kpi({ label, value, unit, tone }: { label: string; value: string | number | undefined; unit?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold', tone)}>
        {value ?? '-'}
        {value !== undefined && unit && <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

export function ReportsPage() {
  const [days, setDays] = useState(30)
  const [granularity, setGranularity] = useState<Granularity>('week')
  const [userId, setUserId] = useState(ALL)
  const users = useUsers()
  const assistants = useAssistantMap()
  const raw = useLiveQuery(async () => {
    const [tasks, activity, files, srs, assistantList] = await Promise.all([
      db.tasks.toArray(),
      db.activity.toArray(),
      db.files.toArray(),
      db.serviceRequests.toArray(),
      db.assistants.toArray(),
    ])
    // blob은 리포트에 필요 없으므로 메타만 남긴다
    return { tasks, activity, files: files.map(({ id, name, version, previousId, originTaskId }) => ({ id, name, version, previousId, originTaskId })), srs, assistantList }
  }, [])

  const data = useMemo(() => {
    if (!raw) return undefined
    const tasks = userId === ALL ? raw.tasks : raw.tasks.filter((t) => t.ownerId === userId || t.assigneeIds.includes(userId))
    const taskIds = new Set(tasks.map((t) => t.id))
    const activity = raw.activity.filter((a) => !a.taskId || taskIds.has(a.taskId))
    const done = tasks.filter((t) => t.status === 'done' && t.completedAt)
    const lead = done.map((t) => (new Date(t.completedAt!).getTime() - new Date(t.startedAt ?? t.createdAt).getTime()) / 86_400_000)
    const checks = done.flatMap((t) => t.checklist)
    return {
      tasks,
      kpi: {
        done: done.length,
        avgLead: lead.length ? Math.round((lead.reduce((a, b) => a + b, 0) / lead.length) * 10) / 10 : undefined,
        reopens: activity.filter((a) => a.type === 'task.reopened').length,
        checkRate: checks.length ? Math.round((checks.filter((c) => c.checked).length / checks.length) * 100) : undefined,
        srLead: srLeadDays(raw.srs, raw.activity),
      },
      buckets: completionBuckets(tasks, days, granularity),
      assistantStats: assistantStats(tasks, raw.assistantList),
      userStats: userActivityStats(activity, users, days),
      flow: inputFlow(raw.tasks, raw.files).slice(0, 10),
      tags: tagUsage(tasks).slice(0, 12),
      srDist: srStatusDistribution(raw.srs),
      signals: inefficiencySignals(tasks, activity, raw.files),
      digest: feedbackDigest(tasks, raw.assistantList, users),
    }
  }, [raw, userId, days, granularity, users])

  if (!data) return <TopBar title="리포트" />
  const maxLead = Math.max(0, ...data.assistantStats.map((s) => s.avgLeadDays ?? 0))

  return (
    <>
      <TopBar title="리포트" />
      <div className="flex-1 space-y-4 overflow-auto p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={String(days)} onValueChange={(v) => v && setDays(Number(v))}>
            <ToggleGroupItem value="7">7일</ToggleGroupItem>
            <ToggleGroupItem value="30">30일</ToggleGroupItem>
            <ToggleGroupItem value="90">90일</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={granularity}
            onValueChange={(v) => v && setGranularity(v as Granularity)}
          >
            <ToggleGroupItem value="day">일</ToggleGroupItem>
            <ToggleGroupItem value="week">주</ToggleGroupItem>
          </ToggleGroup>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
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
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Kpi label="완료 업무" value={data.kpi.done} unit="건" />
          <Kpi label="평균 리드타임" value={data.kpi.avgLead} unit="일" />
          <Kpi label="재오픈" value={data.kpi.reopens} unit="건" tone={data.kpi.reopens > 0 ? 'text-amber-600' : undefined} />
          <Kpi label="체크리스트 이행률" value={data.kpi.checkRate} unit="%" />
          <Kpi label="SR 접수→완료" value={data.kpi.srLead} unit="일" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="완료 추이">
            <BarsChart data={data.buckets} xKey="label" series={[{ key: 'done', name: '완료 업무' }]} />
          </Card>
          <Card title="에이전트별 평균 리드타임 (최대값 강조)">
            <BarsChart
              data={data.assistantStats
                .filter((s) => s.avgLeadDays !== undefined)
                .map((s) => ({ name: s.assistant.name, days: s.avgLeadDays }))}
              xKey="name"
              series={[{ key: 'days', name: '평균 일수' }]}
              layout="vertical"
              unit="일"
              highlightMax
              height={Math.max(160, 30 * data.assistantStats.length)}
            />
            {maxLead === 0 && <p className="text-xs text-muted-foreground">완료된 업무가 없습니다.</p>}
          </Card>
          <Card title="사용자별 활동">
            <BarsChart
              data={data.userStats}
              xKey="name"
              stacked
              series={[
                { key: 'messages', name: '메시지' },
                { key: 'checks', name: '체크' },
                { key: 'completed', name: '완료' },
                { key: 'files', name: '파일' },
              ]}
            />
          </Card>
          <Card title="SR 상태 분포">
            <div className="grid gap-1.5">
              {data.srDist.map(({ status, count }) => {
                const total = data.srDist.reduce((s, x) => s + x.count, 0) || 1
                return (
                  <div key={status} className="flex items-center gap-2 text-xs">
                    <SrStatusBadge status={status} className="w-16 justify-center" />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(count / total) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right tabular-nums">{count}</span>
                    <span className="sr-only">{SR_STATUS_LABEL[status]}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="자료 흐름 (출처 에이전트 → 입력으로 쓴 에이전트)">
            {data.flow.length === 0 ? (
              <p className="text-xs text-muted-foreground">다른 대화의 파일을 입력으로 고른 기록이 없습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.flow.map((e) => {
                  const from = assistants.get(e.fromAssistantId)
                  const to = assistants.get(e.toAssistantId)
                  return (
                    <li
                      key={`${e.fromAssistantId}-${e.toAssistantId}`}
                      className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs"
                    >
                      {from && <AssistantAvatar assistant={from} size="xs" />}
                      <span className="truncate">{from?.name ?? e.fromAssistantId}</span>
                      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                      {to && <AssistantAvatar assistant={to} size="xs" />}
                      <span className="truncate">{to?.name ?? e.toAssistantId}</span>
                      <span className="ml-auto rounded-full bg-muted px-2 font-medium tabular-nums">{e.count}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <Card title="태그별 대화">
            {data.tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">태그가 붙은 대화가 없습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.tags.map((t) => (
                  <li key={t.tag} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs">
                    <Link to={`/?view=kanban&tag=${encodeURIComponent(t.tag)}`} className="hover:underline">
                      <TagChip tag={t.tag} size="xs" />
                    </Link>
                    <span className="flex -space-x-1">
                      {t.assistantIds.map((id) => {
                        const a = assistants.get(id)
                        return a ? <AssistantAvatar key={id} assistant={a} size="xs" className="size-5 ring-1 ring-background" /> : null
                      })}
                    </span>
                    <span className="ml-auto text-muted-foreground">진행 {t.open}</span>
                    <span className="rounded-full bg-muted px-2 font-medium tabular-nums">{t.conversations}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="에이전트별 현황" className="lg:col-span-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>에이전트</TableHead>
                  <TableHead className="text-right">전체</TableHead>
                  <TableHead className="text-right">진행</TableHead>
                  <TableHead className="text-right">완료</TableHead>
                  <TableHead className="text-right">리드타임</TableHead>
                  <TableHead className="text-right">피드백</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.assistantStats.map((s) => (
                  <TableRow key={s.assistant.id}>
                    <TableCell>
                      <Link to={`/?view=kanban&assistant=${encodeURIComponent(s.assistant.id)}`} className="flex items-center gap-1.5 text-xs hover:underline">
                        <AssistantAvatar assistant={s.assistant} size="xs" />
                        {s.assistant.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{s.total}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{s.active}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{s.done}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{s.avgLeadDays ?? '-'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {s.avgRating !== undefined ? `★ ${s.avgRating}` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card title={`비효율 신호 ${data.signals.length}`}>
          {data.signals.length === 0 ? (
            <p className="text-xs text-muted-foreground">감지된 신호가 없습니다.</p>
          ) : (
            <ul className="grid gap-1.5 md:grid-cols-2">
              {data.signals.map((s, i) => (
                <li key={`${s.kind}-${s.taskId}-${i}`} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs">
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />
                  <span className="rounded-full bg-muted px-1.5 text-[10px]">{SIGNAL_LABEL[s.kind]}</span>
                  <Link to={`/c/${s.taskId}`} className="font-mono hover:underline">
                    {s.taskCode}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{s.taskTitle}</span>
                  <span className="text-muted-foreground">{s.detail}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDateTime(s.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="assistant 피드백 다이제스트"
          action={
            <Button
              size="xs"
              variant="outline"
              onClick={() => downloadBlob(new Blob([feedbackDigestMarkdown(data.digest)], { type: 'text/markdown' }), 'feedback-digest.md')}
            >
              <Download data-icon="inline-start" />
              markdown
            </Button>
          }
        >
          {data.digest.length === 0 ? (
            <p className="text-xs text-muted-foreground">피드백이 없습니다.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {data.digest.map((r) => (
                <div key={r.assistantId} className="rounded-lg border p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                    {r.assistantName}
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      {r.avgRating}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{r.count}건</span>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {r.comments.map((c, i) => (
                      <li key={i} className="text-muted-foreground">
                        ★{c.rating} {c.comment || '(코멘트 없음)'}{' '}
                        <span className="text-[10px]">
                          — {c.by}, {c.taskCode}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
