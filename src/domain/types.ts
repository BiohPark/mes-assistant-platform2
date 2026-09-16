// 도메인 타입 정의. 데이터는 불변으로 다루고, 변경은 항상 새 객체를 반환한다.

export type ID = string
export type ISODate = string

export interface User {
  id: ID
  name: string
  role: string
  initials: string
  color: string
}

/** 워크플로우 보드의 공통 축. 템플릿마다 단계명이 달라도 이 키로 컬럼을 맞춘다. */
export const STEP_KEYS = ['URS', 'FDS', 'DEV', 'TEST', 'PROTOCOL', 'DEPLOY', 'CUSTOM'] as const
export type StepKey = (typeof STEP_KEYS)[number]

export const STEP_KEY_LABEL: Record<StepKey, string> = {
  URS: 'URS',
  FDS: 'FDS',
  DEV: '개발',
  TEST: '테스트',
  PROTOCOL: '프로토콜 검증',
  DEPLOY: '배포/검증',
  CUSTOM: '기타',
}

export type StepMode = 'assistant' | 'manual'

export interface AssistantBinding {
  modelId: string
  displayName: string
  systemPromptHint: string
}

export interface ChecklistTemplateItem {
  id: ID
  label: string
  required: boolean
}

export interface StepTemplate {
  id: ID
  /** 라이브러리 모듈에서 가져온 경우 원본 모듈 ID */
  moduleId?: ID
  key: StepKey
  name: string
  description: string
  mode: StepMode
  assistant?: AssistantBinding
  inputSpec: string[]
  outputSpec: string[]
  checklist: ChecklistTemplateItem[]
  color: string
}

/**
 * Task 모듈: assistant와 연계되는 실질 업무 단위의 재사용 정의.
 * 템플릿은 모듈을 조합한 것이고, 업무는 모듈을 갈아끼워 구성할 수 있다.
 */
export interface TaskModule extends StepTemplate {
  tags: string[]
  createdBy: ID
  updatedAt: ISODate
}

export interface WorkflowTemplate {
  id: ID
  name: string
  description: string
  category: string
  /** 템플릿 기본 assistant 모델. 단계에 지정이 없을 때 사용 */
  defaultModelId?: string
  steps: StepTemplate[]
  createdBy: ID
  updatedAt: ISODate
}

export type TaskStatus = 'active' | 'done' | 'on_hold'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export interface ExternalRef {
  system: string
  id: string
  url: string
}

export interface Task {
  id: ID
  code: string
  title: string
  summary: string
  templateId: ID
  status: TaskStatus
  /** 현재 Task. 모듈 없는 수동 업무는 빈 문자열 */
  currentStepId: ID
  ownerId: ID
  assigneeIds: ID[]
  priority: Priority
  dueDate?: ISODate
  externalRef?: ExternalRef
  tags: string[]
  /** 업무 기본 assistant 모델 (템플릿 기본값에서 복사, 업무별 변경 가능) */
  defaultModelId?: string
  createdAt: ISODate
  createdBy: ID
  completedAt?: ISODate
}

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export interface ChecklistItem {
  id: ID
  label: string
  required: boolean
  checked: boolean
  checkedBy?: ID
  checkedAt?: ISODate
}

export interface StepFeedback {
  rating: number
  comment: string
  by: ID
  at: ISODate
}

export interface StepInstance {
  id: ID
  taskId: ID
  templateStepId: ID
  key: StepKey
  order: number
  name: string
  description: string
  mode: StepMode
  assistant?: AssistantBinding
  inputSpec: string[]
  outputSpec: string[]
  status: StepStatus
  checklist: ChecklistItem[]
  activeThreadId?: ID
  inputFileIds: ID[]
  outputFileIds: ID[]
  startedAt?: ISODate
  completedAt?: ISODate
  completedBy?: ID
  feedback?: StepFeedback
  color: string
}

export interface Thread {
  id: ID
  stepInstanceId: ID
  taskId: ID
  title: string
  createdAt: ISODate
  createdBy: ID
  archived: boolean
  /** 이 대화에서만 쓰는 모델 (단계/업무 기본값보다 우선) */
  modelId?: string
}

export type MessageRole = 'system' | 'user' | 'assistant'
export type MessageStatus = 'streaming' | 'done' | 'error'

export interface Message {
  id: ID
  threadId: ID
  role: MessageRole
  content: string
  authorId?: ID
  createdAt: ISODate
  attachmentIds: ID[]
  status: MessageStatus
  error?: string
}

export type FileSource = 'upload' | 'assistant'

export interface FileAsset {
  id: ID
  taskId: ID
  name: string
  mime: string
  size: number
  blob: Blob
  uploadedBy: ID
  uploadedAt: ISODate
  source: FileSource
  producedByStepId?: ID
  tags: string[]
  version: number
}

export interface Note {
  id: ID
  taskId: ID
  stepInstanceId?: ID
  authorId: ID
  content: string
  createdAt: ISODate
  attachmentIds: ID[]
}

export type ActivityType =
  | 'task.created'
  | 'task.completed'
  | 'task.reopened'
  | 'task.hold'
  | 'step.started'
  | 'step.completed'
  | 'step.skipped'
  | 'step.reopened'
  | 'step.mode_changed'
  | 'step.removed'
  | 'step.reordered'
  | 'model.changed'
  | 'step.navigated'
  | 'checklist.checked'
  | 'checklist.unchecked'
  | 'file.uploaded'
  | 'file.tagged_output'
  | 'file.selected_input'
  | 'note.added'
  | 'message.sent'
  | 'thread.created'
  | 'feedback.given'

export interface ActivityLog {
  id: ID
  taskId: ID
  stepInstanceId?: ID
  userId: ID
  type: ActivityType
  payload: Record<string, unknown>
  at: ISODate
}

export type LlmMode = 'mock' | 'live'

export interface LlmSettings {
  mode: LlmMode
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  id: 'app'
  currentUserId: ID
  llm: LlmSettings
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  mode: 'mock',
  baseUrl: 'http://localhost:3000/api',
  apiKey: '',
  model: 'glm-5.2',
}
