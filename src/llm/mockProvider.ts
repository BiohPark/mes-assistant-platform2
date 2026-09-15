import type { ChatChunk, ChatProvider, ChatRequest, ToolCall } from './provider'
import { mockReply } from './mockScenarios'
import { mockSystemAssistant } from './mockSystemAssistant'

const CHUNK_DELAY_MS = 18
const FIRST_TOKEN_DELAY_MS = 350

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })
}

/** 단어/구두점 단위로 잘라 스트리밍 느낌을 낸다 */
function tokenize(text: string): string[] {
  return text.match(/[^\s]+\s*|\s+/g) ?? [text]
}

/** 백엔드 없이 시연 가능한 시나리오 기반 응답기 */
export class MockProvider implements ChatProvider {
  readonly kind = 'mock' as const

  async ping(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: 'Mock 모드 — 네트워크 호출 없음' }
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const userText = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const turn = req.messages.filter((m) => m.role === 'assistant').length
    const meta = req.meta ?? {}

    let text: string
    let toolCalls: ToolCall[] = []
    if (meta.systemAssistant) {
      const r = mockSystemAssistant(userText)
      text = r.text
      toolCalls = r.toolCalls
    } else {
      text = mockReply(meta.stepKey ?? 'CUSTOM', {
        taskTitle: meta.taskTitle ?? '업무',
        stepName: meta.stepName ?? '단계',
        inputFileNames: meta.inputFileNames ?? [],
        userText,
        turn,
      })
    }

    try {
      await sleep(FIRST_TOKEN_DELAY_MS, req.signal)
      for (const tok of tokenize(text)) {
        yield { type: 'delta', text: tok }
        await sleep(CHUNK_DELAY_MS, req.signal)
      }
      for (const call of toolCalls) yield { type: 'tool_call', call }
      yield { type: 'done' }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        yield { type: 'error', message: '요청이 취소되었습니다.' }
        return
      }
      yield { type: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' }
    }
  }
}
