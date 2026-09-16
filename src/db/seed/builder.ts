import { subDays, subHours, subMinutes } from 'date-fns'
import type {
  ActivityLog,
  ActivityType,
  FileAsset,
  ID,
  Message,
  Note,
  Priority,
  StepInstance,
  StepStatus,
  Task,
  Thread,
  WorkflowTemplate,
} from '@/domain/types'

export interface SeedBundle {
  tasks: Task[]
  steps: StepInstance[]
  threads: Thread[]
  messages: Message[]
  files: FileAsset[]
  notes: Note[]
  activity: ActivityLog[]
}

export interface StepSpec {
  status: StepStatus
  /** 시작 시각 = now - startedDaysAgo */
  startedDaysAgo?: number
  completedDaysAgo?: number
  by?: ID
  checked?: number
  mode?: 'assistant' | 'manual'
  feedback?: { rating: number; comment: string; by: ID }
}

export interface TaskSpec {
  id: string
  code: string
  title: string
  summary: string
  template: WorkflowTemplate
  status?: Task['status']
  ownerId: ID
  assigneeIds: ID[]
  priority: Priority
  dueDaysFromNow?: number
  createdDaysAgo: number
  externalId: string
  tags?: string[]
  steps: StepSpec[]
  /** 현재 단계 index. 없으면 첫 in_progress 또는 마지막 */
  currentIndex?: number
}

/** 시드 데이터 생성 헬퍼. 모든 시각은 now 기준 상대값으로 만든다. */
export class SeedBuilder {
  readonly bundle: SeedBundle = { tasks: [], steps: [], threads: [], messages: [], files: [], notes: [], activity: [] }
  private seq = 0
  private readonly now: Date

  constructor(now: Date) {
    this.now = now
  }

  private id(prefix: string): string {
    this.seq += 1
    return `${prefix}_seed_${this.seq.toString().padStart(4, '0')}`
  }

  daysAgo(days: number, hours = 0): string {
    return subHours(subDays(this.now, days), hours).toISOString()
  }
  minutesAgo(min: number): string {
    return subMinutes(this.now, min).toISOString()
  }

  addTask(spec: TaskSpec): { task: Task; steps: StepInstance[] } {
    const taskId = spec.id
    const steps = spec.template.steps.map((tpl, i): StepInstance => {
      const s = spec.steps[i] ?? { status: 'pending' as StepStatus }
      const checkedCount = s.checked ?? (s.status === 'done' ? tpl.checklist.length : 0)
      const startedAt = s.startedDaysAgo !== undefined ? this.daysAgo(s.startedDaysAgo) : undefined
      const completedAt = s.completedDaysAgo !== undefined ? this.daysAgo(s.completedDaysAgo) : undefined
      return {
        id: `${taskId}_s${i}`,
        taskId,
        templateStepId: tpl.id,
        key: tpl.key,
        order: i,
        name: tpl.name,
        description: tpl.description,
        mode: s.mode ?? tpl.mode,
        assistant: tpl.assistant,
        inputSpec: [...tpl.inputSpec],
        outputSpec: [...tpl.outputSpec],
        status: s.status,
        checklist: tpl.checklist.map((c, ci) => ({
          id: `${taskId}_s${i}_c${ci}`,
          label: c.label,
          required: c.required,
          checked: ci < checkedCount,
          checkedBy: ci < checkedCount ? (s.by ?? spec.ownerId) : undefined,
          checkedAt: ci < checkedCount ? (completedAt ?? startedAt ?? this.daysAgo(0)) : undefined,
        })),
        inputFileIds: [],
        outputFileIds: [],
        startedAt,
        completedAt,
        completedBy: s.status === 'done' || s.status === 'skipped' ? (s.by ?? spec.ownerId) : undefined,
        feedback: s.feedback ? { ...s.feedback, at: completedAt ?? this.daysAgo(0) } : undefined,
        color: tpl.color,
      }
    })
    const currentIndex =
      spec.currentIndex ?? Math.max(0, steps.findIndex((s) => s.status === 'in_progress'))
    const task: Task = {
      id: taskId,
      code: spec.code,
      title: spec.title,
      summary: spec.summary,
      templateId: spec.template.id,
      status: spec.status ?? 'active',
      currentStepId: steps[currentIndex].id,
      ownerId: spec.ownerId,
      assigneeIds: spec.assigneeIds,
      priority: spec.priority,
      dueDate: spec.dueDaysFromNow !== undefined ? this.daysAgo(-spec.dueDaysFromNow) : undefined,
      externalRef: { system: 'ITSM', id: spec.externalId, url: `https://itsm.example.internal/tickets/${spec.externalId}` },
      tags: spec.tags ?? [],
      createdAt: this.daysAgo(spec.createdDaysAgo),
      createdBy: spec.ownerId,
      completedAt: spec.status === 'done' ? steps.at(-1)?.completedAt : undefined,
    }
    this.bundle.tasks.push(task)
    this.bundle.steps.push(...steps)
    this.log(spec.ownerId, taskId, 'task.created', { templateName: spec.template.name }, undefined, task.createdAt)
    steps.forEach((s) => {
      if (s.startedAt) this.log(spec.ownerId, taskId, 'step.started', { stepName: s.name }, s.id, s.startedAt)
      if (s.status === 'done' && s.completedAt)
        this.log(s.completedBy ?? spec.ownerId, taskId, 'step.completed', { stepName: s.name }, s.id, s.completedAt)
      if (s.status === 'skipped' && s.completedAt)
        this.log(s.completedBy ?? spec.ownerId, taskId, 'step.skipped', { stepName: s.name }, s.id, s.completedAt)
      s.checklist
        .filter((c) => c.checked && c.checkedBy && c.checkedAt)
        .forEach((c) => this.log(c.checkedBy!, taskId, 'checklist.checked', { label: c.label }, s.id, c.checkedAt!))
    })
    if (task.status === 'done' && task.completedAt) this.log(spec.ownerId, taskId, 'task.completed', {}, undefined, task.completedAt)
    return { task, steps }
  }

  log(userId: ID, taskId: ID, type: ActivityType, payload: Record<string, unknown>, stepInstanceId: ID | undefined, at: string): void {
    this.bundle.activity.push({ id: this.id('act'), taskId, stepInstanceId, userId, type, payload, at })
  }

  addFile(
    taskId: ID,
    step: StepInstance | undefined,
    name: string,
    content: string,
    opts: { by: ID; at: string; asOutput?: boolean; mime?: string; tags?: string[] },
  ): FileAsset {
    const mime = opts.mime ?? (name.endsWith('.md') ? 'text/markdown' : 'text/plain')
    const blob = new Blob([content], { type: mime })
    const file: FileAsset = {
      id: this.id('file'),
      taskId,
      name,
      mime,
      size: blob.size,
      blob,
      uploadedBy: opts.by,
      uploadedAt: opts.at,
      source: opts.asOutput ? 'assistant' : 'upload',
      producedByStepId: opts.asOutput ? step?.id : undefined,
      tags: opts.tags ?? (opts.asOutput ? ['산출물'] : []),
      version: 1,
    }
    this.bundle.files.push(file)
    if (opts.asOutput && step) step.outputFileIds = [...step.outputFileIds, file.id]
    this.log(opts.by, taskId, opts.asOutput ? 'file.tagged_output' : 'file.uploaded', { name }, step?.id, opts.at)
    return file
  }

  setInputs(step: StepInstance, fileIds: ID[]): void {
    step.inputFileIds = [...fileIds]
  }

  addThread(step: StepInstance, by: ID, at: string, title = '스레드 1'): Thread {
    const thread: Thread = { id: this.id('thr'), stepInstanceId: step.id, taskId: step.taskId, title, createdAt: at, createdBy: by, archived: false }
    this.bundle.threads.push(thread)
    step.activeThreadId = thread.id
    return thread
  }

  addMessages(thread: Thread, turns: Array<{ role: 'user' | 'assistant'; by?: ID; content: string; at: string }>): void {
    for (const t of turns) {
      this.bundle.messages.push({
        id: this.id('msg'),
        threadId: thread.id,
        role: t.role,
        content: t.content,
        authorId: t.by,
        createdAt: t.at,
        attachmentIds: [],
        status: 'done',
      })
      if (t.role === 'user' && t.by)
        this.log(t.by, thread.taskId, 'message.sent', { preview: t.content.slice(0, 60) }, thread.stepInstanceId, t.at)
    }
  }

  addNote(taskId: ID, stepId: ID | undefined, by: ID, content: string, at: string): Note {
    const note: Note = { id: this.id('note'), taskId, stepInstanceId: stepId, authorId: by, content, createdAt: at, attachmentIds: [] }
    this.bundle.notes.push(note)
    this.log(by, taskId, 'note.added', { preview: content.slice(0, 60) }, stepId, at)
    return note
  }
}
