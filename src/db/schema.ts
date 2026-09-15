import Dexie, { type EntityTable } from 'dexie'
import type {
  ActivityLog,
  FileAsset,
  Message,
  Note,
  Settings,
  StepInstance,
  Task,
  Thread,
  User,
  WorkflowTemplate,
} from '@/domain/types'

export class AppDB extends Dexie {
  users!: EntityTable<User, 'id'>
  templates!: EntityTable<WorkflowTemplate, 'id'>
  tasks!: EntityTable<Task, 'id'>
  steps!: EntityTable<StepInstance, 'id'>
  threads!: EntityTable<Thread, 'id'>
  messages!: EntityTable<Message, 'id'>
  files!: EntityTable<FileAsset, 'id'>
  notes!: EntityTable<Note, 'id'>
  activity!: EntityTable<ActivityLog, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'mes-assistant-platform') {
    super(name)
    this.version(1).stores({
      users: 'id',
      templates: 'id, category',
      tasks: 'id, code, templateId, status, currentStepId, ownerId',
      steps: 'id, taskId, [taskId+order], key, status',
      threads: 'id, stepInstanceId, taskId',
      messages: 'id, threadId, createdAt',
      files: 'id, taskId, producedByStepId',
      notes: 'id, taskId, stepInstanceId',
      activity: 'id, taskId, stepInstanceId, userId, at, type',
      settings: 'id',
    })
  }
}

export const db = new AppDB()

export const TABLE_NAMES = [
  'users',
  'templates',
  'tasks',
  'steps',
  'threads',
  'messages',
  'files',
  'notes',
  'activity',
  'settings',
] as const
export type TableName = (typeof TABLE_NAMES)[number]
