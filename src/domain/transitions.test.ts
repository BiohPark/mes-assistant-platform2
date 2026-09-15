import { describe, it, expect } from 'vitest'
import { applyStepAction, missingRequiredChecklist, toggleChecklistItem } from './transitions'
import type { StepInstance } from './types'

const base: StepInstance = {
  id: 's1',
  taskId: 't1',
  templateStepId: 'ts1',
  key: 'URS',
  order: 0,
  name: 'URS',
  description: '',
  mode: 'assistant',
  inputSpec: [],
  outputSpec: [],
  status: 'pending',
  checklist: [
    { id: 'c1', label: '필수 항목', required: true, checked: false },
    { id: 'c2', label: '선택 항목', required: false, checked: false },
  ],
  inputFileIds: [],
  outputFileIds: [],
  color: '#000',
}
const AT = '2026-09-16T00:00:00.000Z'

describe('applyStepAction', () => {
  it('start moves pending to in_progress and records startedAt without mutating input', () => {
    const next = applyStepAction(base, { type: 'start', userId: 'u1', at: AT })
    expect(next.status).toBe('in_progress')
    expect(next.startedAt).toBe(AT)
    expect(base.status).toBe('pending')
  })

  it('complete sets done, completedBy and keeps startedAt if already set', () => {
    const started = applyStepAction(base, { type: 'start', userId: 'u1', at: AT })
    const done = applyStepAction(started, { type: 'complete', userId: 'u2', at: '2026-09-17T00:00:00.000Z' })
    expect(done.status).toBe('done')
    expect(done.completedBy).toBe('u2')
    expect(done.startedAt).toBe(AT)
  })

  it('complete on a pending step also fills startedAt', () => {
    const done = applyStepAction(base, { type: 'complete', userId: 'u1', at: AT })
    expect(done.startedAt).toBe(AT)
  })

  it('skip sets skipped and completedAt', () => {
    const next = applyStepAction(base, { type: 'skip', userId: 'u1', at: AT })
    expect(next.status).toBe('skipped')
    expect(next.completedAt).toBe(AT)
  })

  it('reopen returns done/skipped step to in_progress and clears completion', () => {
    const done = applyStepAction(base, { type: 'complete', userId: 'u1', at: AT })
    const reopened = applyStepAction(done, { type: 'reopen', userId: 'u1', at: AT })
    expect(reopened.status).toBe('in_progress')
    expect(reopened.completedAt).toBeUndefined()
    expect(reopened.completedBy).toBeUndefined()
  })

  it('setMode switches between assistant and manual', () => {
    const manual = applyStepAction(base, { type: 'setMode', mode: 'manual', userId: 'u1', at: AT })
    expect(manual.mode).toBe('manual')
  })
})

describe('missingRequiredChecklist', () => {
  it('returns required unchecked items only', () => {
    expect(missingRequiredChecklist(base).map((c) => c.id)).toEqual(['c1'])
  })
  it('returns empty when all required checked', () => {
    const checked = toggleChecklistItem(base, 'c1', 'u1', AT)
    expect(missingRequiredChecklist(checked)).toEqual([])
  })
})

describe('toggleChecklistItem', () => {
  it('checks with user and time, unchecks clearing them', () => {
    const checked = toggleChecklistItem(base, 'c1', 'u1', AT)
    expect(checked.checklist[0]).toMatchObject({ checked: true, checkedBy: 'u1', checkedAt: AT })
    const unchecked = toggleChecklistItem(checked, 'c1', 'u1', AT)
    expect(unchecked.checklist[0]).toMatchObject({ checked: false })
    expect(unchecked.checklist[0].checkedBy).toBeUndefined()
  })
})
