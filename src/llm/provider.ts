import type { StepKey } from '@/domain/types'

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessageInput[]
  tools?: ToolDefinition[]
  signal?: AbortSignal
  /** Mock 응답 선택용 힌트 (실제 provider는 무시) */
  meta?: ChatMeta
}

export interface ChatMeta {
  stepKey?: StepKey
  taskTitle?: string
  stepName?: string
  inputFileNames?: string[]
  systemAssistant?: boolean
}

export type ChatChunk =
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done' }
  | { type: 'error'; message: string }

export interface ChatProvider {
  readonly kind: 'mock' | 'live'
  stream(req: ChatRequest): AsyncIterable<ChatChunk>
  /** 연결 확인. 실패 시 이유 반환 */
  ping(): Promise<{ ok: boolean; detail: string }>
}
