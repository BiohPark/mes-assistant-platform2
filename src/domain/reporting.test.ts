import { describe, it, expect } from 'vitest'
import { completionBuckets, inefficiencySignals, stepDurationStats } from './reporting'
import { STEP_KEY_LABEL, type ActivityLog, type StepInstance, type Task } from './types'

const NOW = new Date('2026-09-16T12:00:00.000Z')

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  code: id.toUpperCase(),
  title: '',
  summary: '',
  templateId: 'tpl',
  status: 'active',
  currentStepId: '',
  ownerId: 'u1',
  assigneeIds: [],
  priority: 'normal',
  tags: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  createdBy: 'u1',
  ...over,
})
const step = (id: string, over: Partial<StepInstance>): StepInstance => ({
  id,
  taskId: 't1',
  templateStepId: '',
  key: 'URS',
  order: 0,
  name: 'URS',
  description: '',
  mode: 'assistant',
  inputSpec: [],
  outputSpec: [],
  status: 'done',
  checklist: [],
  inputFileIds: [],
  outputFileIds: [],
  color: '',
  ...over,
})
const act = (type: ActivityLog['type'], at: string, payload: Record<string, unknown> = {}, taskId = 't1'): ActivityLog => ({
  id: `${type}-${at}`,
  taskId,
  userId: 'u1',
  type,
  payload,
  at,
})

describe('completionBuckets', () => {
  it('fills empty days and counts completed tasks/steps in range', () => {
    const tasks = [task('t1', { status: 'done', completedAt: '2026-09-15T10:00:00.000Z' }), task('t2', { status: 'done', completedAt: '2026-08-01T00:00:00.000Z' })]
    const activity = [act('step.completed', '2026-09-16T01:00:00.000Z'), act('step.completed', '2026-09-16T02:00:00.000Z')]
    const b = completionBuckets(tasks, activity, 7, 'day', NOW)
    expect(b).toHaveLength(7)
    expect(b.at(-2)).toMatchObject({ label: '9/15', tasksDone: 1, stepsDone: 0 })
    expect(b.at(-1)).toMatchObject({ label: '9/16', tasksDone: 0, stepsDone: 2 })
  })
})

describe('stepDurationStats', () => {
  it('averages completed step durations per key, longest first', () => {
    const steps = [
      step('a', { key: 'URS', startedAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-03T00:00:00.000Z' }),
      step('b', { key: 'URS', startedAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-05T00:00:00.000Z' }),
      step('c', { key: 'DEV', startedAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-11T00:00:00.000Z' }),
      step('d', { key: 'FDS', status: 'in_progress', startedAt: '2026-09-01T00:00:00.000Z' }),
    ]
    const stats = stepDurationStats(steps, STEP_KEY_LABEL, NOW)
    expect(stats.map((s) => s.key)).toEqual(['DEV', 'URS'])
    expect(stats[1]).toMatchObject({ avgDays: 3, maxDays: 4, count: 2 })
  })
})

describe('inefficiencySignals', () => {
  it('reports reopen, long-running step and stale task', () => {
    const tasks = [task('t1')]
    const steps = [step('s1', { status: 'in_progress', startedAt: '2026-09-01T00:00:00.000Z', name: '개발' })]
    const activity = [act('step.reopened', '2026-09-05T00:00:00.000Z', { stepName: 'FDS', reason: '요구 변경' })]
    const signals = inefficiencySignals(tasks, steps, activity, NOW)
    expect(signals.map((s) => s.kind).sort()).toEqual(['long_step', 'reopen', 'stale'])
    expect(signals.find((s) => s.kind === 'reopen')?.detail).toBe('사유: 요구 변경')
  })
})
