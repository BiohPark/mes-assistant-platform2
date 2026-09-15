import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Download, Info, Star } from 'lucide-react'
import { TopBar } from '@/app/TopBar'
import { useTemplates, useUserMap, useUsers } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { UserAvatar } from '@/components/UserAvatar'
import { db } from '@/db/schema'
import { downloadBlob } from '@/db/repositories/files'
import {
  completionBuckets,
  feedbackDigest,
  feedbackDigestMarkdown,
  inefficiencySignals,
  stepDurationStats,
  templateStats,
  userActivityStats,
  type Granularity,
} from '@/domain/reporting'
import { STEP_KEY_LABEL } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { BarsChart } from './charts'

const ALL = '__all__'
const SIGNAL_LABEL = { reopen: '되돌리기', skip: '건너뛰기', missing_required: '필수 미완료 완료', long_step: '장기 체류', stale: '정체' } as const

function Card({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
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

export function ReportsPage() {
  const [days, setDays] = useState(30)
  const [granularity, setGranularity] = useState<Granularity>('week')
  const [userId, setUserId] = useState<string | undefined>()
  const users = useUsers()
  const userMap = useUserMap()
  const templates = useTemplates()
  const raw = useLiveQuery(async () => {
    const [tasks, steps, activity] = await Promise.all([db.tasks.toArray(), db.steps.toArray(), db.activity.toArray()])
    return { tasks, steps, activity }
  }, [])

  const data = useMemo(() => {
    if (!raw) return undefined
    const tasks = userId ? raw.tasks.filter((t) => t.ownerId === userId || t.assigneeIds.includes(userId)) : raw.tasks
    const taskIds = new Set(tasks.map((t) => t.id))
    const steps = raw.steps.filter((s) => taskIds.has(s.taskId))
    const activity = raw.activity.filter((a) => taskIds.has(a.taskId))
    const done = tasks.filter((t) => t.status === 'done')
    const lead = done.map((t) => (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 86_400_000)
    const checks = steps.filter((s) => s.status === 'done').flatMap((s) => s.checklist)
    return {
      tasks,
      steps,
      activity,
      kpi: {
        done: done.length,
        avgLead: lead.length ? Math.round((lead.reduce((a, b) => a + b, 0) / lead.length) * 10) / 10 : undefined,
        reopens: activity.filter((a) => a.type === 'step.reopened').length,
        checkRate: checks.length ? Math.round((checks.filter((c) => c.checked).length / checks.length) * 100) : undefined,
      },
      buckets: completionBuckets(tasks, activity, days, granularity),
      stepStats: stepDurationStats(steps, STEP_KEY_LABEL),
      userStats: userActivityStats(activity, users, days),
      tplStats: templateStats(tasks, templates, activity),
      signals: inefficiencySignals(tasks, steps, activity),
      feedback: feedbackDigest(steps, tasks, users, STEP_KEY_LABEL),
    }
  }, [raw, days, granularity, userId, users, templates])

  return (
    <>
      <TopBar title="리포트" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" value={String(days)} onValueChange={(v) => v && setDays(Number(v))} variant="outline" size="sm">
              <ToggleGroupItem value="7">7일</ToggleGroupItem>
              <ToggleGroupItem value="30">30일</ToggleGroupItem>
              <ToggleGroupItem value="90">90일</ToggleGroupItem>
            </ToggleGroup>
            <ToggleGroup type="single" value={granularity} onValueChange={(v) => v && setGranularity(v as Granularity)} variant="outline" size="sm">
              <ToggleGroupItem value="day">일별</ToggleGroupItem>
              <ToggleGroupItem value="week">주별</ToggleGroupItem>
            </ToggleGroup>
            <Select value={userId ?? ALL} onValueChange={(v) => setUserId(v === ALL ? undefined : v)}>
              <SelectTrigger size="sm" className="w-36">
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

          {data && (
            <>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {[
                  { label: '완료 업무', value: data.kpi.done, unit: '건' },
                  { label: '평균 리드타임', value: data.kpi.avgLead ?? '-', unit: '일' },
                  { label: '되돌리기', value: data.kpi.reopens, unit: '회' },
                  { label: '체크리스트 완료율', value: data.kpi.checkRate ?? '-', unit: '%' },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border bg-card px-4 py-3">
                    <div className="text-[11px] text-muted-foreground">{k.label}</div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {k.value}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{k.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card title={`완료 추이 (${granularity === 'day' ? '일별' : '주별'})`}>
                  <BarsChart
                    data={data.buckets}
                    xKey="label"
                    series={[
                      { key: 'stepsDone', name: '단계 완료' },
                      { key: 'tasksDone', name: '업무 완료' },
                    ]}
                    unit="건"
                  />
                </Card>
                <Card title="단계별 평균 소요일 (완료 단계 기준)">
                  {data.stepStats.length ? (
                    <BarsChart data={data.stepStats} xKey="name" series={[{ key: 'avgDays', name: '평균 소요일' }]} layout="vertical" unit="일" highlightMax height={Math.max(140, data.stepStats.length * 34)} />
                  ) : (
                    <p className="text-xs text-muted-foreground">완료된 단계가 없습니다.</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">주황: 가장 오래 걸리는 단계 — 병목 후보</p>
                </Card>
                <Card title={`담당자별 활동 (${days}일)`}>
                  <BarsChart
                    data={data.userStats}
                    xKey="name"
                    series={[
                      { key: 'messages', name: 'assistant 대화' },
                      { key: 'checks', name: '체크' },
                      { key: 'stepsCompleted', name: '단계 완료' },
                      { key: 'files', name: '파일' },
                    ]}
                    stacked
                    layout="vertical"
                    height={Math.max(160, data.userStats.length * 36)}
                  />
                </Card>
                <Card title="워크플로우별 현황">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead>워크플로우</TableHead>
                        <TableHead className="text-right">전체</TableHead>
                        <TableHead className="text-right">진행</TableHead>
                        <TableHead className="text-right">완료</TableHead>
                        <TableHead className="text-right">평균 리드(일)</TableHead>
                        <TableHead className="text-right">되돌리기</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tplStats.map((t) => (
                        <TableRow key={t.templateId} className="text-xs">
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.total}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.active}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.done}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.avgLeadDays ?? '-'}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', t.reopens > 0 && 'text-amber-600')}>{t.reopens}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>

              <Card title={`비효율 신호 ${data.signals.length}건`}>
                {data.signals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">감지된 신호가 없습니다.</p>
                ) : (
                  <ul className="divide-y">
                    {data.signals.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 py-1.5 text-xs">
                        {s.severity === 'warn' ? <AlertTriangle className="size-3.5 shrink-0 text-amber-500" /> : <Info className="size-3.5 shrink-0 text-muted-foreground" />}
                        <span className="w-24 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[10px]">{SIGNAL_LABEL[s.kind]}</span>
                        <Link to={`/tasks/${s.taskId}`} className="font-mono text-[11px] hover:underline">
                          {s.taskCode}
                        </Link>
                        {s.stepName && <span className="text-muted-foreground">· {s.stepName}</span>}
                        <span className="min-w-0 flex-1 truncate">{s.detail}</span>
                        {s.userId && <UserAvatar user={userMap.get(s.userId)} size="xs" />}
                        <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(s.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card
                title="assistant 피드백 요약 — 스킬/지식 업그레이드 자료"
                action={
                  <Button variant="outline" size="xs" onClick={() => downloadBlob(new Blob([feedbackDigestMarkdown(data.feedback)], { type: 'text/markdown' }), 'assistant_feedback_digest.md')} disabled={!data.feedback.length}>
                    <Download data-icon="inline-start" />
                    마크다운 다운로드
                  </Button>
                }
              >
                {data.feedback.length === 0 ? (
                  <p className="text-xs text-muted-foreground">단계 완료 시 남긴 피드백이 여기에 모입니다.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.feedback.map((f) => (
                      <div key={f.key} className="rounded-lg border p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">
                          {f.name}
                          <span className="inline-flex items-center gap-0.5 text-amber-600">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {f.avgRating}
                          </span>
                          <span className="font-normal text-muted-foreground">({f.count}건)</span>
                        </div>
                        <ul className="space-y-1">
                          {f.comments.map((c, i) => (
                            <li key={i} className="text-[11px]">
                              <span className="font-mono text-muted-foreground">{c.taskCode}</span> <span className="text-amber-500">{'★'.repeat(c.rating)}</span> {c.comment || <span className="text-muted-foreground">코멘트 없음</span>}{' '}
                              <span className="text-muted-foreground">— {c.by}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
