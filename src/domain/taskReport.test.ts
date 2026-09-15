import { describe, it, expect } from 'vitest'
import { buildTaskReport } from './taskReport'
import type { ActivityLog, StepInstance, Task, User } from './types'

const users: User[] = [{ id: 'u1', name: '박비오', role: '', initials: '박', color: '' }]
const task: Task = {
  id: 't1',
  code: 'ET-2026-0001',
  title: '테스트 업무',
  summary: '',
  templateId: 'tpl',
  status: 'done',
  currentStepId: 's2',
  ownerId: 'u1',
  assigneeIds: ['u1'],
  priority: 'normal',
  tags: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  createdBy: 'u1',
  completedAt: '2026-09-11T00:00:00.000Z',
}
const step = (id: string, over: Partial<StepInstance>): StepInstance => ({
  id,
  taskId: 't1',
  templateStepId: id,
  key: 'URS',
  order: 0,
  name: id,
  description: '',
  mode: 'assistant',
  inputSpec: [],
  outputSpec: [],
  status: 'done',
  checklist: [{ id: 'c', label: 'x', required: true, checked: true }],
  inputFileIds: [],
  outputFileIds: [],
  color: '',
  ...over,
})

describe('buildTaskReport', () => {
  it('includes header, per-step rows, reopen count and feedback', () => {
    const steps = [
      step('URS', { startedAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-03T00:00:00.000Z', completedBy: 'u1', feedback: { rating: 4, comment: '좋음', by: 'u1', at: '' } }),
      step('DEV', { order: 1, mode: 'manual', startedAt: '2026-09-03T00:00:00.000Z', completedAt: '2026-09-11T00:00:00.000Z', completedBy: 'u1' }),
    ]
    const activity: ActivityLog[] = [
      { id: 'a1', taskId: 't1', userId: 'u1', type: 'step.reopened', payload: { stepName: 'URS', reason: '요구사항 변경' }, at: '' },
    ]
    const md = buildTaskReport({ task, steps, files: [], activity, users, now: new Date('2026-09-12T00:00:00.000Z') })
    expect(md).toContain('# 업무 완료 리포트 — ET-2026-0001')
    expect(md).toContain('| 1 | URS | assistant | done | 2.0 | 1/1 | 박비오 | - |')
    expect(md).toContain('| 2 | DEV | 수동 | done | 8.0 |')
    expect(md).toContain('되돌리기: 1회 — URS(요구사항 변경)')
    expect(md).toContain('**URS** (★★★★☆, 박비오): 좋음')
    expect(md).toContain('총 10.0일')
  })
})
