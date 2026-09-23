import { subDays, subHours, subMinutes } from 'date-fns'
import type {
  ActivityLog,
  ActivityType,
  FileAsset,
  ID,
  Message,
  Note,
  Notification,
  Priority,
  ServiceRequest,
  SharedResult,
  SrStatus,
  Task,
  TaskInput,
  TaskStatus,
  Thread,
} from '@/domain/types'

export interface SeedBundle {
  tasks: Task[]
  threads: Thread[]
  messages: Message[]
  files: FileAsset[]
  notes: Note[]
  serviceRequests: ServiceRequest[]
  activity: ActivityLog[]
  notifications: Notification[]
}

export interface TaskSpec {
  id: string
  code: string
  assistantId: ID
  title: string
  summary: string
  status: TaskStatus
  ownerId: ID
  assigneeIds: ID[]
  priority: Priority
  createdDaysAgo: number
  startedDaysAgo?: number
  completedDaysAgo?: number
  dueDaysFromNow?: number
  tags?: string[]
  checklist?: Array<[label: string, required: boolean, checked: boolean]>
  feedback?: { rating: number; comment: string; by: ID }
}

export interface SrSpec {
  id: string
  code: string
  requesterId: ID
  title: string
  body: string
  status: SrStatus
  createdDaysAgo: number
  turns: string[]
  /** 이 SR에서 '연결 업무 시작'으로 만든 대화 (태그는 TaskSpec.tags에 SR 코드로 이미 붙어 있어야 한다) */
  followUps?: Task[]
  results?: SharedResult[]
}

type ActivityTarget = Partial<Pick<ActivityLog, 'taskId' | 'assistantId' | 'srId'>>

/**
 * 시드 데이터 생성 헬퍼. 모든 시각은 now 기준 상대값으로 만든다.
 * 번들 내부 객체는 빌더가 소유하므로 조립 중에는 제자리에서 갱신한다.
 */
export class SeedBuilder {
  readonly bundle: SeedBundle = {
    tasks: [],
    threads: [],
    messages: [],
    files: [],
    notes: [],
    serviceRequests: [],
    activity: [],
    notifications: [],
  }
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

  log(type: ActivityType, userId: ID, at: string, target: ActivityTarget, payload: Record<string, unknown> = {}): void {
    this.bundle.activity.push({ id: this.id('act'), ...target, userId, type, payload, at })
  }

  addTask(spec: TaskSpec): Task {
    const createdAt = this.daysAgo(spec.createdDaysAgo)
    const startedAt = spec.startedDaysAgo !== undefined ? this.daysAgo(spec.startedDaysAgo) : undefined
    const completedAt = spec.completedDaysAgo !== undefined ? this.daysAgo(spec.completedDaysAgo) : undefined
    const task: Task = {
      id: spec.id,
      code: spec.code,
      assistantId: spec.assistantId,
      title: spec.title,
      titleSource: 'ai',
      summary: spec.summary,
      status: spec.status,
      ownerId: spec.ownerId,
      assigneeIds: spec.assigneeIds,
      priority: spec.priority,
      dueDate: spec.dueDaysFromNow !== undefined ? this.daysAgo(-spec.dueDaysFromNow) : undefined,
      tags: spec.tags ?? [],
      checklist: (spec.checklist ?? []).map(([label, required, checked], i) => ({
        id: `${spec.id}_chk${i}`,
        label,
        required,
        checked,
        checkedBy: checked ? spec.ownerId : undefined,
        checkedAt: checked ? (startedAt ?? createdAt) : undefined,
      })),
      inputs: [],
      outputFileIds: [],
      createdAt,
      lastActivityAt: completedAt ?? startedAt ?? createdAt,
      createdBy: spec.ownerId,
      startedAt,
      completedAt,
      completedBy: completedAt ? spec.ownerId : undefined,
      feedback: spec.feedback ? { ...spec.feedback, at: completedAt ?? createdAt } : undefined,
    }
    this.bundle.tasks.push(task)
    const target = { taskId: task.id, assistantId: task.assistantId }
    this.log('task.created', spec.ownerId, createdAt, target)
    for (const tag of task.tags) this.log('tag.added', spec.ownerId, createdAt, { taskId: task.id }, { tag })
    if (startedAt) this.log('task.started', spec.ownerId, startedAt, target)
    for (const c of task.checklist) {
      if (c.checked && c.checkedAt) this.log('checklist.checked', spec.ownerId, c.checkedAt, { taskId: task.id }, { label: c.label })
    }
    if (completedAt) this.log('task.completed', spec.ownerId, completedAt, target)
    if (spec.feedback && completedAt) this.log('feedback.given', spec.feedback.by, completedAt, target, { rating: spec.feedback.rating })
    return task
  }

  /** 스레드 + 교대로 user/assistant 메시지 */
  addThread(task: Task, authorId: ID, turns: string[], startDaysAgo: number): { thread: Thread; messages: Message[] } {
    const thread: Thread = {
      id: this.id('thr'),
      taskId: task.id,
      title: '대화',
      createdAt: this.daysAgo(startDaysAgo),
      createdBy: authorId,
      archived: false,
    }
    this.bundle.threads.push(thread)
    task.threadId = thread.id
    const messages = turns.map(
      (content, i): Message => ({
        id: this.id('msg'),
        threadId: thread.id,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content,
        authorId: i % 2 === 0 ? authorId : undefined,
        createdAt: this.daysAgo(startDaysAgo, -(i * 2)),
        attachmentIds: [],
        status: 'done',
      }),
    )
    this.bundle.messages.push(...messages)
    this.touch(task, messages.at(-1)?.createdAt ?? thread.createdAt)
    this.log('thread.created', authorId, thread.createdAt, { taskId: task.id })
    for (const m of messages) {
      if (m.role === 'user') this.log('message.sent', authorId, m.createdAt, { taskId: task.id }, { preview: m.content.slice(0, 60) })
    }
    return { thread, messages }
  }

  addFile(
    task: Task,
    name: string,
    content: string,
    opts: { output?: boolean; by: ID; daysAgo: number; source?: FileAsset['source']; previous?: FileAsset },
  ): FileAsset {
    const blob = new Blob([content], { type: 'text/markdown' })
    const file: FileAsset = {
      id: this.id('file'),
      originTaskId: task.id,
      name,
      mime: 'text/markdown',
      size: blob.size,
      blob,
      uploadedBy: opts.by,
      uploadedAt: this.daysAgo(opts.daysAgo),
      source: opts.source ?? (opts.output ? 'assistant' : 'upload'),
      tags: opts.output ? ['산출물'] : [],
      version: opts.previous ? opts.previous.version + 1 : 1,
      previousId: opts.previous?.id,
    }
    this.bundle.files.push(file)
    if (opts.output) {
      task.outputFileIds = [...task.outputFileIds.filter((id) => id !== opts.previous?.id), file.id]
      this.log('file.tagged_output', opts.by, file.uploadedAt, { taskId: task.id }, { name })
    } else {
      this.log('file.uploaded', opts.by, file.uploadedAt, { taskId: task.id }, { name })
    }
    this.touch(task, file.uploadedAt)
    return file
  }

  /** 사람이 공유 자료함에서 입력으로 고른 것 (특정 버전 고정) */
  select(task: Task, file: FileAsset, weight: TaskInput['weight'], by: ID, daysAgo: number): void {
    const selectedAt = this.daysAgo(daysAgo)
    task.inputs = [...task.inputs.filter((i) => i.fileId !== file.id), { fileId: file.id, weight, selectedAt, selectedBy: by }]
    this.log('input.selected', by, selectedAt, { taskId: task.id }, { name: file.name, version: file.version, weight })
    this.touch(task, selectedAt)
  }

  private touch(task: Task, at: string): void {
    if (at > task.lastActivityAt) task.lastActivityAt = at
  }

  addNote(task: Task, authorId: ID, content: string, daysAgo: number): void {
    const note: Note = { id: this.id('note'), taskId: task.id, authorId, content, createdAt: this.daysAgo(daysAgo), attachmentIds: [] }
    this.bundle.notes.push(note)
    this.log('note.added', authorId, note.createdAt, { taskId: task.id }, { preview: content.slice(0, 60) })
  }

  notify(userId: ID, title: string, body: string, link: string, daysAgo: number, read = false): void {
    this.bundle.notifications.push({ id: this.id('ntf'), userId, title, body, link, at: this.daysAgo(daysAgo), read })
  }

  addSr(spec: SrSpec): ServiceRequest {
    const createdAt = this.daysAgo(spec.createdDaysAgo)
    const thread: Thread = { id: this.id('thr'), srId: spec.id, title: '접수 대화', createdAt, createdBy: spec.requesterId, archived: false }
    this.bundle.threads.push(thread)
    this.bundle.messages.push(
      ...spec.turns.map(
        (content, i): Message => ({
          id: this.id('msg'),
          threadId: thread.id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content,
          authorId: i % 2 === 0 ? spec.requesterId : undefined,
          createdAt: this.daysAgo(spec.createdDaysAgo, -i),
          attachmentIds: [],
          status: 'done',
        }),
      ),
    )
    const submitted = spec.status !== 'draft'
    const sr: ServiceRequest = {
      id: spec.id,
      code: submitted ? spec.code : '',
      requesterId: spec.requesterId,
      title: submitted ? spec.title : '',
      titleSource: submitted ? 'ai' : 'default',
      body: submitted ? spec.body : '',
      status: spec.status,
      attachmentIds: [],
      threadId: thread.id,
      results: spec.results ?? [],
      submittedAt: submitted ? this.daysAgo(spec.createdDaysAgo, -2) : undefined,
      createdAt,
      updatedAt: createdAt,
    }
    this.bundle.serviceRequests.push(sr)
    this.log('sr.created', spec.requesterId, createdAt, { srId: sr.id })
    if (sr.submittedAt) this.log('sr.submitted', spec.requesterId, sr.submittedAt, { srId: sr.id }, { code: sr.code })
    if (submitted && spec.status !== 'submitted') {
      // 접수 후 상태 변경은 담당자(u_so)가 며칠 뒤 처리한 것으로 기록
      const changedAt = this.daysAgo(Math.max(0, spec.createdDaysAgo - 3))
      this.log('sr.status_changed', 'u_so', changedAt, { srId: sr.id }, { from: 'submitted', to: spec.status })
    }
    for (const t of spec.followUps ?? []) {
      this.log('sr.task_started', t.ownerId, t.createdAt, { srId: sr.id, taskId: t.id, assistantId: t.assistantId }, { code: sr.code, taskCode: t.code })
    }
    return sr
  }
}
