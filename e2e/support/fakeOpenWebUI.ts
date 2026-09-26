import type { BrowserContext, Route } from '@playwright/test'

/** 테스트 전용 가짜 OpenWebUI. 실제 서버·주소·키를 쓰지 않는다. */
export const FAKE_ORIGIN = 'http://fake-owui.test'
export const FAKE_BASE_URL = `${FAKE_ORIGIN}/api`

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

export interface ChatBody {
  model: string
  messages: Array<{ role: string; content: string }>
  files?: Array<{ type: string; id: string }>
}

export interface FakeLog {
  /** 플랫폼 대화 요청만 (system이 플랫폼 컨텍스트로 시작) — 제목 생성 등 보조 요청 제외 */
  chats: Array<{ at: number; body: ChatBody }>
  /** 모든 chat/completions 요청 */
  allChats: Array<{ at: number; body: ChatBody }>
  uploads: Array<{ at: number; id: string; filename: string }>
  statusPolls: Array<{ at: number; id: string }>
}

export interface FakeOptions {
  reply?: string
  /** 응답 전 지연 (동시 전송 검증용) */
  chatDelayMs?: number
  /** 파일별 처리 상태 순서. 마지막 값이 계속 반복된다 */
  statusSequence?: string[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function sse(text: string): string {
  const chunks = text.match(/.{1,12}/gsu) ?? [text]
  return chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n'
}

function filenameOf(route: Route): string {
  const raw = route.request().postDataBuffer()?.toString('utf8') ?? ''
  return /filename="([^"]*)"/.exec(raw)?.[1] ?? ''
}

export async function installFakeOpenWebUI(context: BrowserContext, opts: FakeOptions = {}): Promise<FakeLog> {
  const log: FakeLog = { chats: [], allChats: [], uploads: [], statusPolls: [] }
  const polls = new Map<string, number>()
  let seq = 0
  await context.route(`${FAKE_ORIGIN}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname === '/api/models') {
      return route.fulfill({ status: 200, headers: CORS, json: { data: [{ id: 'fake-model' }] } })
    }
    if (url.pathname === '/api/chat/completions') {
      const body = JSON.parse(req.postData() ?? '{}') as ChatBody
      const entry = { at: Date.now(), body }
      log.allChats.push(entry)
      if (body.messages[0]?.content.startsWith('## 플랫폼 컨텍스트')) log.chats.push(entry)
      if (opts.chatDelayMs) await sleep(opts.chatDelayMs)
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body: sse(opts.reply ?? '가짜 응답입니다.') })
    }
    if (url.pathname === '/api/v1/files/' && req.method() === 'POST') {
      const id = `rf_${++seq}`
      log.uploads.push({ at: Date.now(), id, filename: filenameOf(route) })
      return route.fulfill({ status: 200, headers: CORS, json: { id } })
    }
    const status = /^\/api\/v1\/files\/([^/]+)\/process\/status$/.exec(url.pathname)
    if (status) {
      const id = status[1]
      const n = polls.get(id) ?? 0
      polls.set(id, n + 1)
      log.statusPolls.push({ at: Date.now(), id })
      const sequence = opts.statusSequence ?? ['pending', 'completed']
      return route.fulfill({ status: 200, headers: CORS, json: { status: sequence[Math.min(n, sequence.length - 1)] } })
    }
    return route.fulfill({ status: 404, headers: CORS, body: 'not found' })
  })
  return log
}
