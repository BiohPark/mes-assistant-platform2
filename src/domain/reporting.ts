import { differenceInCalendarDays, format, startOfWeek, subDays } from 'date-fns'
import type { ActivityLog, StepInstance, StepKey, Task, User, WorkflowTemplate } from './types'

export type Granularity = 'day' | 'week'

const DAY_MS = 86_400_000

function durationDays(start?: string, end?: string, now = new Date()): number | undefined {
  if (!start) return undefined
  const e = end ? new Date(end).getTime() : now.getTime()
  return Math.max(0, (e - new Date(start).getTime()) / DAY_MS)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export interface TimeBucket {
  label: string
  key: string
  tasksDone: number
  stepsDone: number
}

/** 기간 내 일별/주별 완료 건수. 빈 버킷도 0으로 채운다. */
export function completionBuckets(tasks: Task[], activity: ActivityLog[], days: number, granularity: Granularity, now = new Date()): TimeBucket[] {
  const from = subDays(now, days - 1)
  const keyOf = (d: Date) => (granularity === 'day' ? format(d, 'yyyy-MM-dd') : format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const labelOf = (d: Date) => (granularity === 'day' ? format(d, 'M/d') : `${format(startOfWeek(d, { weekStartsOn: 1 }), 'M/d')}주`)
  const buckets = new Map<string, TimeBucket>()
  for (let i = 0; i < days; i++) {
    const d = subDays(now, days - 1 - i)
    const key = keyOf(d)
    if (!buckets.has(key)) buckets.set(key, { key, label: labelOf(d), tasksDone: 0, stepsDone: 0 })
  }
  for (const t of tasks) {
    if (t.status !== 'done' || !t.completedAt) continue
    const d = new Date(t.completedAt)
    if (d < from) continue
    const b = buckets.get(keyOf(d))
    if (b) b.tasksDone += 1
  }
  for (const a of activity) {
    if (a.type !== 'step.completed') continue
    const d = new Date(a.at)
    if (d < from) continue
    const b = buckets.get(keyOf(d))
    if (b) b.stepsDone += 1
  }
  return [...buckets.values()]
}

export interface StepDurationStat {
  key: StepKey
  name: string
  avgDays: number
  count: number
  maxDays: number
}

/** 완료된 단계의 평균/최대 소요일 (단계 키 기준) */
export function stepDurationStats(steps: StepInstance[], labels: Record<StepKey, string>, now = new Date()): StepDurationStat[] {
  const acc = new Map<StepKey, number[]>()
  for (const s of steps) {
    if (s.status !== 'done') continue
    const d = durationDays(s.startedAt, s.completedAt, now)
    if (d === undefined) continue
    acc.set(s.key, [...(acc.get(s.key) ?? []), d])
  }
  return [...acc.entries()]
    .map(([key, list]) => ({
      key,
      name: labels[key],
      avgDays: round1(list.reduce((a, b) => a + b, 0) / list.length),
      maxDays: round1(Math.max(...list)),
      count: list.length,
    }))
    .sort((a, b) => b.avgDays - a.avgDays)
}

export interface UserActivityStat {
  userId: string
  name: string
  messages: number
  checks: number
  stepsCompleted: number
  files: number
  total: number
}

export function userActivityStats(activity: ActivityLog[], users: User[], days: number, now = new Date()): UserActivityStat[] {
  const from = subDays(now, days - 1).toISOString()
  const byUser = new Map<string, UserActivityStat>(users.map((u) => [u.id, { userId: u.id, name: u.name, messages: 0, checks: 0, stepsCompleted: 0, files: 0, total: 0 }]))
  for (const a of activity) {
    if (a.at < from) continue
    const s = byUser.get(a.userId)
    if (!s) continue
    if (a.type === 'message.sent') s.messages += 1
    else if (a.type === 'checklist.checked') s.checks += 1
    else if (a.type === 'step.completed') s.stepsCompleted += 1
    else if (a.type === 'file.uploaded' || a.type === 'file.tagged_output') s.files += 1
    else continue
    s.total += 1
  }
  return [...byUser.values()].sort((a, b) => b.total - a.total)
}

export interface TemplateStat {
  templateId: string
  name: string
  total: number
  active: number
  done: number
  avgLeadDays?: number
  reopens: number
}

export function templateStats(tasks: Task[], templates: WorkflowTemplate[], activity: ActivityLog[], now = new Date()): TemplateStat[] {
  const reopenByTask = new Map<string, number>()
  for (const a of activity) if (a.type === 'step.reopened') reopenByTask.set(a.taskId, (reopenByTask.get(a.taskId) ?? 0) + 1)
  return templates.map((t) => {
    const mine = tasks.filter((x) => x.templateId === t.id)
    const done = mine.filter((x) => x.status === 'done')
    const leads = done.map((x) => durationDays(x.createdAt, x.completedAt, now)).filter((d): d is number => d !== undefined)
    return {
      templateId: t.id,
      name: t.name,
      total: mine.length,
      active: mine.filter((x) => x.status === 'active').length,
      done: done.length,
      avgLeadDays: leads.length ? round1(leads.reduce((a, b) => a + b, 0) / leads.length) : undefined,
      reopens: mine.reduce((a, x) => a + (reopenByTask.get(x.id) ?? 0), 0),
    }
  })
}

export interface InefficiencySignal {
  kind: 'reopen' | 'skip' | 'missing_required' | 'long_step' | 'stale'
  taskId: string
  taskCode: string
  stepName?: string
  detail: string
  userId?: string
  at: string
  severity: 'info' | 'warn'
}

const LONG_STEP_DAYS = 10
const STALE_DAYS = 5

/** 되돌리기/건너뛰기/필수 미완료 완료/장기 체류/정체 신호 */
export function inefficiencySignals(tasks: Task[], steps: StepInstance[], activity: ActivityLog[], now = new Date()): InefficiencySignal[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const out: InefficiencySignal[] = []
  for (const a of activity) {
    const task = taskById.get(a.taskId)
    if (!task) continue
    if (a.type === 'step.reopened')
      out.push({ kind: 'reopen', taskId: task.id, taskCode: task.code, stepName: String(a.payload.stepName ?? ''), detail: a.payload.reason ? `사유: ${String(a.payload.reason)}` : '단계 되돌리기', userId: a.userId, at: a.at, severity: 'warn' })
    if (a.type === 'step.skipped')
      out.push({ kind: 'skip', taskId: task.id, taskCode: task.code, stepName: String(a.payload.stepName ?? ''), detail: '단계 건너뜀', userId: a.userId, at: a.at, severity: 'info' })
    if (a.type === 'step.completed' && Number(a.payload.missingRequired ?? 0) > 0)
      out.push({ kind: 'missing_required', taskId: task.id, taskCode: task.code, stepName: String(a.payload.stepName ?? ''), detail: `필수 체크 ${String(a.payload.missingRequired)}건 미완료 상태로 완료`, userId: a.userId, at: a.at, severity: 'warn' })
  }
  for (const s of steps) {
    const task = taskById.get(s.taskId)
    if (!task || task.status !== 'active' || s.status !== 'in_progress') continue
    const d = durationDays(s.startedAt, undefined, now)
    if (d !== undefined && d >= LONG_STEP_DAYS)
      out.push({ kind: 'long_step', taskId: task.id, taskCode: task.code, stepName: s.name, detail: `${Math.round(d)}일째 진행 중`, at: s.startedAt ?? '', severity: 'warn' })
  }
  const lastTouch = new Map<string, string>()
  for (const a of activity) if ((lastTouch.get(a.taskId) ?? '') < a.at) lastTouch.set(a.taskId, a.at)
  for (const t of tasks) {
    if (t.status !== 'active') continue
    const last = lastTouch.get(t.id)
    if (!last) continue
    const idle = differenceInCalendarDays(now, new Date(last))
    if (idle >= STALE_DAYS) out.push({ kind: 'stale', taskId: t.id, taskCode: t.code, detail: `${idle}일간 활동 없음`, at: last, severity: 'info' })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

export interface FeedbackDigestRow {
  key: StepKey
  name: string
  count: number
  avgRating: number
  comments: Array<{ taskCode: string; rating: number; comment: string; by: string }>
}

/** 단계(assistant)별 피드백 요약 — assistant 스킬/지식 업그레이드 자료 */
export function feedbackDigest(steps: StepInstance[], tasks: Task[], users: User[], labels: Record<StepKey, string>): FeedbackDigestRow[] {
  const taskCode = new Map(tasks.map((t) => [t.id, t.code]))
  const userName = new Map(users.map((u) => [u.id, u.name]))
  const acc = new Map<StepKey, FeedbackDigestRow>()
  for (const s of steps) {
    if (!s.feedback) continue
    const row = acc.get(s.key) ?? { key: s.key, name: labels[s.key], count: 0, avgRating: 0, comments: [] }
    const nextCount = row.count + 1
    acc.set(s.key, {
      ...row,
      count: nextCount,
      avgRating: round1((row.avgRating * row.count + s.feedback.rating) / nextCount),
      comments: [...row.comments, { taskCode: taskCode.get(s.taskId) ?? s.taskId, rating: s.feedback.rating, comment: s.feedback.comment, by: userName.get(s.feedback.by) ?? s.feedback.by }],
    })
  }
  return [...acc.values()].sort((a, b) => a.avgRating - b.avgRating)
}

export function feedbackDigestMarkdown(rows: FeedbackDigestRow[]): string {
  const lines = ['# assistant 피드백 요약 (스킬/지식 업그레이드 자료)', '']
  for (const r of rows) {
    lines.push(`## ${r.name} — 평균 ${r.avgRating}점 (${r.count}건)`)
    for (const c of r.comments) lines.push(`- [${c.taskCode}] ${'★'.repeat(c.rating)} (${c.by}): ${c.comment || '-'}`)
    lines.push('')
  }
  return lines.join('\n')
}
