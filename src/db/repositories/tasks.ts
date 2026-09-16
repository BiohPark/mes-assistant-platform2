import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import { applyStepAction, toggleChecklistItem, type StepAction } from '@/domain/transitions'
import type {
  ChecklistItem,
  ID,
  Priority,
  StepInstance,
  StepMode,
  StepTemplate,
  Task,
  TaskStatus,
  WorkflowTemplate,
} from '@/domain/types'

export interface NewTaskInput {
  title: string
  summary: string
  templateId: ID
  ownerId: ID
  assigneeIds: ID[]
  priority: Priority
  dueDate?: string
  externalRef?: Task['externalRef']
  tags?: string[]
}

export function instantiateStep(taskId: ID, tpl: StepTemplate, order: number): StepInstance {
  const checklist: ChecklistItem[] = tpl.checklist.map((c) => ({
    id: newId('chk'),
    label: c.label,
    required: c.required,
    checked: false,
  }))
  return {
    id: newId('step'),
    taskId,
    templateStepId: tpl.id,
    key: tpl.key,
    order,
    name: tpl.name,
    description: tpl.description,
    mode: tpl.mode,
    assistant: tpl.assistant,
    inputSpec: [...tpl.inputSpec],
    outputSpec: [...tpl.outputSpec],
    status: order === 0 ? 'in_progress' : 'pending',
    checklist,
    inputFileIds: [],
    outputFileIds: [],
    startedAt: order === 0 ? nowIso() : undefined,
    color: tpl.color,
  }
}

async function nextTaskCode(): Promise<string> {
  const year = new Date().getFullYear()
  const all = await db.tasks.toArray()
  const max = all
    .map((t) => /^ET-(\d{4})-(\d+)$/.exec(t.code))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) === year)
    .reduce((acc, m) => Math.max(acc, Number(m[2])), 0)
  return `ET-${year}-${String(max + 1).padStart(4, '0')}`
}

export async function createTaskFromTemplate(actor: Actor, input: NewTaskInput): Promise<Task> {
  const template = await db.templates.get(input.templateId)
  if (!template) throw new Error('템플릿을 찾을 수 없습니다.')
  const taskId = newId('task')
  const steps = template.steps.map((s, i) => instantiateStep(taskId, s, i))
  const task: Task = {
    id: taskId,
    code: await nextTaskCode(),
    title: input.title,
    summary: input.summary,
    templateId: template.id,
    status: 'active',
    currentStepId: steps[0].id,
    ownerId: input.ownerId,
    assigneeIds: input.assigneeIds,
    priority: input.priority,
    dueDate: input.dueDate,
    externalRef: input.externalRef,
    tags: input.tags ?? [],
    createdAt: nowIso(),
    createdBy: actor.userId,
  }
  await db.transaction('rw', db.tasks, db.steps, db.activity, async () => {
    await db.tasks.add(task)
    await db.steps.bulkAdd(steps)
    await logActivity(actor, taskId, 'task.created', { templateName: template.name })
  })
  return task
}

export async function updateTask(actor: Actor, taskId: ID, patch: Partial<Task>): Promise<void> {
  await db.tasks.update(taskId, patch)
  void actor
}

export async function navigateToStep(actor: Actor, taskId: ID, stepId: ID): Promise<void> {
  await db.transaction('rw', db.tasks, db.steps, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const step = await db.steps.get(stepId)
    if (!task || !step || task.currentStepId === stepId) return
    await db.tasks.update(taskId, { currentStepId: stepId })
    if (step.status === 'pending') {
      await db.steps.put(applyStepAction(step, { type: 'start', userId: actor.userId, at: nowIso() }))
      await logActivity(actor, taskId, 'step.started', { stepName: step.name }, stepId)
    }
    await logActivity(actor, taskId, 'step.navigated', { stepName: step.name }, stepId)
  })
}

const ACTIVITY_BY_ACTION: Record<StepAction['type'], Parameters<typeof logActivity>[2]> = {
  start: 'step.started',
  complete: 'step.completed',
  skip: 'step.skipped',
  reopen: 'step.reopened',
  setMode: 'step.mode_changed',
}

/** 단계 상태 전이 + 이력 기록. complete/skip 시 다음 pending 단계로 자동 이동한다. */
export async function runStepAction(
  actor: Actor,
  stepId: ID,
  type: Exclude<StepAction['type'], 'setMode'>,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.transaction('rw', db.tasks, db.steps, db.activity, async () => {
    const step = await db.steps.get(stepId)
    if (!step) return
    const at = nowIso()
    const next = applyStepAction(step, { type, userId: actor.userId, at })
    await db.steps.put(next)
    await logActivity(actor, step.taskId, ACTIVITY_BY_ACTION[type], { stepName: step.name, ...payload }, stepId)

    if (type === 'complete' || type === 'skip') {
      const siblings = await db.steps.where('taskId').equals(step.taskId).sortBy('order')
      const following = siblings.find((s) => s.order > step.order && s.status !== 'done' && s.status !== 'skipped')
      if (following) {
        await db.tasks.update(step.taskId, { currentStepId: following.id })
        if (following.status === 'pending') {
          await db.steps.put(applyStepAction(following, { type: 'start', userId: actor.userId, at }))
          await logActivity(actor, step.taskId, 'step.started', { stepName: following.name }, following.id)
        }
      }
    }
    if (type === 'reopen') {
      await db.tasks.update(step.taskId, { currentStepId: stepId, status: 'active', completedAt: undefined })
    }
  })
}

export async function setStepMode(actor: Actor, stepId: ID, mode: StepMode): Promise<void> {
  await db.transaction('rw', db.steps, db.activity, async () => {
    const step = await db.steps.get(stepId)
    if (!step || step.mode === mode) return
    await db.steps.put(applyStepAction(step, { type: 'setMode', mode, userId: actor.userId, at: nowIso() }))
    await logActivity(actor, step.taskId, 'step.mode_changed', { stepName: step.name, mode }, stepId)
  })
}

/** 단계 assistant 모델 변경. 빈 문자열이면 설정의 기본 모델을 사용한다. */
export async function setStepModel(actor: Actor, stepId: ID, modelId: string): Promise<void> {
  await db.transaction('rw', db.steps, db.activity, async () => {
    const step = await db.steps.get(stepId)
    if (!step) return
    const assistant = {
      modelId,
      displayName: step.assistant?.displayName ?? `${step.name} Assistant`,
      systemPromptHint: step.assistant?.systemPromptHint ?? '',
    }
    await db.steps.put({ ...step, assistant })
    await logActivity(actor, step.taskId, 'step.model_changed', { stepName: step.name, modelId: modelId || '(기본)' }, stepId)
  })
}

export async function toggleChecklist(actor: Actor, stepId: ID, itemId: ID): Promise<void> {
  await db.transaction('rw', db.steps, db.activity, async () => {
    const step = await db.steps.get(stepId)
    if (!step) return
    const item = step.checklist.find((c) => c.id === itemId)
    if (!item) return
    await db.steps.put(toggleChecklistItem(step, itemId, actor.userId, nowIso()))
    await logActivity(
      actor,
      step.taskId,
      item.checked ? 'checklist.unchecked' : 'checklist.checked',
      { label: item.label },
      stepId,
    )
  })
}

export async function addChecklistItem(actor: Actor, stepId: ID, label: string, required = false): Promise<void> {
  const step = await db.steps.get(stepId)
  if (!step) return
  const item: ChecklistItem = { id: newId('chk'), label, required, checked: false }
  await db.steps.put({ ...step, checklist: [...step.checklist, item] })
  void actor
}

export async function removeChecklistItem(stepId: ID, itemId: ID): Promise<void> {
  const step = await db.steps.get(stepId)
  if (!step) return
  await db.steps.put({ ...step, checklist: step.checklist.filter((c) => c.id !== itemId) })
}

export async function giveStepFeedback(actor: Actor, stepId: ID, rating: number, comment: string): Promise<void> {
  await db.transaction('rw', db.steps, db.activity, async () => {
    const step = await db.steps.get(stepId)
    if (!step) return
    await db.steps.put({ ...step, feedback: { rating, comment, by: actor.userId, at: nowIso() } })
    await logActivity(actor, step.taskId, 'feedback.given', { rating }, stepId)
  })
}

export async function setTaskStatus(actor: Actor, taskId: ID, status: TaskStatus): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    const completedAt = status === 'done' ? nowIso() : undefined
    await db.tasks.update(taskId, { status, completedAt })
    const type = status === 'done' ? 'task.completed' : status === 'on_hold' ? 'task.hold' : 'task.reopened'
    await logActivity(actor, taskId, type)
  })
}

/** 템플릿의 단계를 진행 중 업무에 추가 (현재 단계 뒤에 삽입) */
export async function insertStepAfter(actor: Actor, taskId: ID, afterStepId: ID, tpl: StepTemplate): Promise<void> {
  await db.transaction('rw', db.steps, db.activity, async () => {
    const steps = await db.steps.where('taskId').equals(taskId).sortBy('order')
    const idx = steps.findIndex((s) => s.id === afterStepId)
    const inserted = { ...instantiateStep(taskId, tpl, idx + 1), status: 'pending' as const, startedAt: undefined }
    const reordered = [...steps.slice(0, idx + 1), inserted, ...steps.slice(idx + 1)].map((s, i) => ({ ...s, order: i }))
    await db.steps.bulkPut(reordered)
    await logActivity(actor, taskId, 'step.started', { stepName: inserted.name, inserted: true }, inserted.id)
  })
}

export function templateStepFor(template: WorkflowTemplate | undefined, step: StepInstance): StepTemplate | undefined {
  return template?.steps.find((s) => s.id === step.templateStepId)
}
