import type { ChecklistItem, ID, ISODate, StepInstance, StepMode } from './types'

export type StepAction =
  | { type: 'start'; userId: ID; at: ISODate }
  | { type: 'complete'; userId: ID; at: ISODate }
  | { type: 'skip'; userId: ID; at: ISODate }
  | { type: 'reopen'; userId: ID; at: ISODate }
  | { type: 'setMode'; mode: StepMode; userId: ID; at: ISODate }

/** 단계 상태 전이. 항상 새 객체를 반환한다. */
export function applyStepAction(step: StepInstance, action: StepAction): StepInstance {
  switch (action.type) {
    case 'start':
      return { ...step, status: 'in_progress', startedAt: step.startedAt ?? action.at }
    case 'complete':
      return {
        ...step,
        status: 'done',
        startedAt: step.startedAt ?? action.at,
        completedAt: action.at,
        completedBy: action.userId,
      }
    case 'skip':
      return { ...step, status: 'skipped', completedAt: action.at, completedBy: action.userId }
    case 'reopen': {
      const { completedAt: _c, completedBy: _b, ...rest } = step
      return { ...rest, status: 'in_progress', startedAt: step.startedAt ?? action.at }
    }
    case 'setMode':
      return { ...step, mode: action.mode }
  }
}

export function missingRequiredChecklist(step: StepInstance): ChecklistItem[] {
  return step.checklist.filter((c) => c.required && !c.checked)
}

export function toggleChecklistItem(step: StepInstance, itemId: ID, userId: ID, at: ISODate): StepInstance {
  return {
    ...step,
    checklist: step.checklist.map((c) => {
      if (c.id !== itemId) return c
      if (c.checked) {
        const { checkedBy: _u, checkedAt: _t, ...rest } = c
        return { ...rest, checked: false }
      }
      return { ...c, checked: true, checkedBy: userId, checkedAt: at }
    }),
  }
}

export function checklistProgress(step: StepInstance): { done: number; total: number } {
  return { done: step.checklist.filter((c) => c.checked).length, total: step.checklist.length }
}
