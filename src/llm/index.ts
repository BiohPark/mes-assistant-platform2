import { MockProvider } from './mockProvider'
import { OpenAICompatibleProvider } from './openaiProvider'
import type { ChatProvider } from './provider'
import type { LlmSettings } from '@/domain/types'

export function createProvider(settings: LlmSettings): ChatProvider {
  return settings.mode === 'live' ? new OpenAICompatibleProvider(settings) : new MockProvider()
}

export type { ChatChunk, ChatProvider, ChatRequest, ChatMessageInput, ToolCall, ChatMeta } from './provider'
