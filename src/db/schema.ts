import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type { ActivityLog, Assistant, FileAsset, Message, Note, Notification, ServiceRequest, Settings, Task, Thread, User } from '@/domain/types'
import { migrateToConversationHub } from './migrations/v3'

export class AppDB extends Dexie {
  users!: EntityTable<User, 'id'>
  assistants!: EntityTable<Assistant, 'id'>
  tasks!: EntityTable<Task, 'id'>
  threads!: EntityTable<Thread, 'id'>
  messages!: EntityTable<Message, 'id'>
  files!: EntityTable<FileAsset, 'id'>
  notes!: EntityTable<Note, 'id'>
  notifications!: EntityTable<Notification, 'id'>
  serviceRequests!: EntityTable<ServiceRequest, 'id'>
  activity!: EntityTable<ActivityLog, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'mes-assistant-hub') {
    super(name)
    this.version(1).stores({
      users: 'id',
      assistants: 'id, status, level1, ownerId',
      tasks: 'id, code, assistantId, status, ownerId, *srIds',
      threads: 'id, taskId, srId',
      messages: 'id, threadId, createdAt',
      files: 'id, originTaskId, originSrId',
      notes: 'id, taskId',
      packages: 'id, code, fromTaskId, fromAssistantId, status',
      packageReceipts: 'id, packageId, taskId, [packageId+taskId]',
      serviceRequests: 'id, code, requesterId, status',
      activity: 'id, taskId, assistantId, srId, packageId, userId, at, type',
      settings: 'id',
    })
    // v2: 인앱 알림
    this.version(2).stores({
      notifications: 'id, userId, read, at',
    })
    // v3: 대화 중심 + 태그 공유. 패키지 제거, srIds → tags, 스레드별 업무 분리
    this.version(3)
      .stores({
        assistants: 'id, status, level1, ownerId, order',
        tasks: 'id, code, assistantId, status, ownerId, *tags, lastActivityAt',
        activity: 'id, taskId, assistantId, srId, userId, at, type',
        packages: null,
        packageReceipts: null,
      })
      .upgrade((tx: Transaction) => migrateToConversationHub(tx))
  }
}

export const db = new AppDB()

export const TABLE_NAMES = [
  'users',
  'assistants',
  'tasks',
  'threads',
  'messages',
  'files',
  'notes',
  'notifications',
  'serviceRequests',
  'activity',
  'settings',
] as const
export type TableName = (typeof TABLE_NAMES)[number]
