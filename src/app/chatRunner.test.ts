// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/schema'
import { createAssistant } from '@/db/repositories/assistants'
import { uploadFile } from '@/db/repositories/files'
import { setInput, setTaskStatus, startConversation } from '@/db/repositories/tasks'
import { DEFAULT_LLM_SETTINGS, type Assistant, type LlmSettings, type Task, type Thread } from '@/domain/types'
import type { ChatChunk, ChatProvider, ChatRequest } from '@/llm/provider'
import type { ChatScope } from '@/llm/promptBuilder'
import { ActiveRequestError, recoverStaleReplies, retryChat, startChat, stopChat, type RunnerDeps } from './chatRunner'

const dev = { userId: 'u_dev' }
const input = (id: string) => ({ id, name: id, level1: 'SDLC', level2: id, summary: '', ownerId: 'u_dev', status: 'open' as const, usageExample: '', checklistTemplate: [] })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Scripted extends ChatProvider {
  calls: ChatRequest[]
}

/** 정해진 텍스트를 흘려보내는 가짜 provider. hang이면 첫 토큰을 영영 보내지 않는다 */
function scripted(text = '응답 본문', opts: { delayMs?: number; hang?: boolean } = {}): Scripted {
  const calls: ChatRequest[] = []
  return {
    kind: 'live',
    calls,
    ping: async () => ({ ok: true, detail: '' }),
    listModels: async () => [],
    async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
      calls.push(req)
      const aborted = () => req.signal?.aborted
      if (opts.hang) {
        while (!aborted()) await sleep(5)
        yield { type: 'error', message: '요청이 취소되었습니다.' }
        return
      }
      for (const ch of text.match(/.{1,2}/gsu) ?? []) {
        if (aborted()) {
          yield { type: 'error', message: '요청이 취소되었습니다.' }
          return
        }
        await sleep(opts.delayMs ?? 1)
        yield { type: 'delta', text: ch }
      }
      yield { type: 'done' }
    },
  }
}

const fast: RunnerDeps['timeouts'] = { firstTokenMs: 300, filesFirstTokenMs: 300, idleMs: 300, keepaliveMs: 20, flushMs: 5 }

async function setLlm(patch: Partial<LlmSettings>) {
  await db.settings.put({ id: 'app', currentUserId: 'u_dev', llm: { ...DEFAULT_LLM_SETTINGS, ...patch } })
}

async function fixture(): Promise<{ scope: ChatScope; thread: Thread; task: Task }> {
  const { task } = await startConversation(dev, { assistantId: 'fds' })
  const assistant = (await db.assistants.get('fds')) as Assistant
  return { scope: { kind: 'task', task, assistant }, thread: (await db.threads.get(task.threadId!)) as Thread, task }
}

const messagesOf = (threadId: string) => db.messages.where('threadId').equals(threadId).sortBy('createdAt')

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.users.bulkPut([{ id: 'u_dev', name: 'Dev', role: '', initials: 'D', color: '' }])
  await setLlm({ mode: 'live', baseUrl: 'http://owui.test/api', apiKey: 'k' })
  await createAssistant(dev, input('fds'))
})
afterEach(() => vi.unstubAllGlobals())

describe('startChat', () => {
  it('stores the user message and a reply with the structured request record', async () => {
    const { scope, thread } = await fixture()
    const provider = scripted('안녕하세요')
    const { replyId, done } = await startChat({ actor: dev, scope, thread, text: '질문' }, { provider: () => provider, timeouts: fast })
    await done
    const rows = await messagesOf(thread.id)
    expect(rows.map((m) => [m.role, m.status])).toEqual([
      ['user', 'done'],
      ['assistant', 'done'],
    ])
    const reply = rows.find((m) => m.id === replyId)!
    expect(reply.content).toBe('안녕하세요')
    expect(reply.heartbeatAt).toBeUndefined()
    expect(reply.requestInfo).toMatchObject({ provider: 'live', transport: 'inline', inputs: [] })
    expect(reply.requestSnapshot).not.toContain('"k"')
    expect(provider.calls[0].messages.at(-1)).toEqual({ role: 'user', content: '질문' })
  })

  it('allows only one active request per conversation, even when two start at once', async () => {
    const { scope, thread } = await fixture()
    const provider = scripted('느린 응답', { delayMs: 20 })
    const deps = { provider: () => provider, timeouts: fast }
    const results = await Promise.allSettled([
      startChat({ actor: dev, scope, thread, text: 'A' }, deps),
      startChat({ actor: dev, scope, thread, text: 'B' }, deps),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(ActiveRequestError)
    await (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ done: Promise<void> }>).value.done
    expect((await messagesOf(thread.id)).filter((m) => m.role === 'user')).toHaveLength(1)
  })

  it('a failure while building the request ends as an error instead of a stuck reply', async () => {
    const { scope, thread, task } = await fixture()
    const f = await uploadFile(dev, { taskId: task.id }, new File(['x'], 'a.md', { type: 'text/markdown' }))
    await setInput(dev, task.id, f.id, 'reference')
    await db.files.update(f.id, { blob: 'broken' as unknown as Blob })
    const { done } = await startChat({ actor: dev, scope, thread, text: '질문' }, { provider: () => scripted(), timeouts: fast })
    await done
    const reply = (await messagesOf(thread.id)).at(-1)!
    expect(reply.status).toBe('error')
  })

  it('times out when no first token arrives', async () => {
    const { scope, thread } = await fixture()
    const { done } = await startChat({ actor: dev, scope, thread, text: '질문' }, { provider: () => scripted('', { hang: true }), timeouts: { ...fast, firstTokenMs: 40 } })
    await done
    expect((await messagesOf(thread.id)).at(-1)).toMatchObject({ status: 'error', error: expect.stringContaining('시간 초과') })
  })

  it('refuses to start on a completed conversation, and completion is refused while a reply is running', async () => {
    const { scope, thread, task } = await fixture()
    const { done } = await startChat({ actor: dev, scope, thread, text: '질문' }, { provider: () => scripted('긴 응답입니다', { delayMs: 20 }), timeouts: fast })
    await expect(setTaskStatus(dev, task.id, 'done')).rejects.toThrow(/응답/)
    await done
    await setTaskStatus(dev, task.id, 'done')
    await expect(startChat({ actor: dev, scope, thread, text: '또' }, { provider: () => scripted(), timeouts: fast })).rejects.toThrow(/완료/)
  })
})

describe('stop and recovery', () => {
  it('local stop keeps the partial text and marks the reply as stopped', async () => {
    const { scope, thread } = await fixture()
    const { replyId, done } = await startChat({ actor: dev, scope, thread, text: '질문' }, { provider: () => scripted('아주 긴 응답 본문입니다', { delayMs: 15 }), timeouts: fast })
    await sleep(40)
    await stopChat(thread.id)
    await done
    const reply = (await db.messages.get(replyId))!
    expect(reply).toMatchObject({ status: 'error', error: expect.stringContaining('중지') })
    expect(reply.content.length).toBeGreaterThan(0)
  })

  it('a reply resolved elsewhere (other tab stop) is not overwritten by the late runner', async () => {
    const { scope, thread } = await fixture()
    const { replyId, done } = await startChat({ actor: dev, scope, thread, text: '질문' }, { provider: () => scripted('아주 긴 응답 본문입니다', { delayMs: 15 }), timeouts: fast })
    await sleep(30)
    await db.messages.update(replyId, { status: 'error', error: '다른 탭에서 중지했습니다.' })
    await done
    expect((await db.messages.get(replyId))!).toMatchObject({ status: 'error', error: '다른 탭에서 중지했습니다.' })
  })

  it('recovers replies whose heartbeat stopped, and leaves live ones alone', async () => {
    const { thread } = await fixture()
    const now = Date.now()
    await db.messages.bulkAdd([
      { id: 'stale', threadId: thread.id, role: 'assistant', content: '', createdAt: new Date(now - 1).toISOString(), attachmentIds: [], status: 'streaming', heartbeatAt: new Date(now - 300_000).toISOString() },
      { id: 'legacy', threadId: thread.id, role: 'assistant', content: '', createdAt: new Date(now - 2).toISOString(), attachmentIds: [], status: 'streaming' },
      { id: 'live', threadId: 'other', role: 'assistant', content: '', createdAt: new Date(now).toISOString(), attachmentIds: [], status: 'streaming', heartbeatAt: new Date(now).toISOString() },
    ])
    expect(await recoverStaleReplies(now)).toBe(2)
    expect((await db.messages.get('stale'))!.status).toBe('error')
    expect((await db.messages.get('legacy'))!.status).toBe('error')
    expect((await db.messages.get('live'))!.status).toBe('streaming')
  })
})

describe('OpenWebUI failure and retry', () => {
  it('stops before calling the model when a file cannot be delivered; retry as text sends it once', async () => {
    await setLlm({ mode: 'live', baseUrl: 'http://owui.test/api', apiKey: 'k', fileDelivery: 'openwebui' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const { scope, thread, task } = await fixture()
    const f = await uploadFile(dev, { taskId: task.id }, new File(['BODY-A'], 'a.md', { type: 'text/markdown' }))
    await setInput(dev, task.id, f.id, 'main')
    const provider = scripted('완료')
    const deps = { provider: () => provider, timeouts: fast }
    const first = await startChat({ actor: dev, scope, thread, text: '검토' }, deps)
    await first.done
    const failed = (await db.messages.get(first.replyId))!
    expect(failed.status).toBe('error')
    expect(failed.requestInfo?.inputs[0]).toMatchObject({ delivery: 'failed' })
    expect(provider.calls).toHaveLength(0)

    const retry = await retryChat({ actor: dev, scope, thread, failedReplyId: first.replyId, forceInlineFileIds: [f.id] }, deps)
    await retry.done
    const rows = await messagesOf(thread.id)
    expect(rows.filter((m) => m.role === 'user')).toHaveLength(1)
    const reply = rows.at(-1)!
    expect(reply).toMatchObject({ status: 'done', content: '완료' })
    expect(reply.requestInfo).toMatchObject({ retryOf: first.replyId })
    expect(reply.requestInfo?.inputs[0]).toMatchObject({ delivery: 'inline' })
    const sent = provider.calls[0].messages
    expect(sent.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['검토'])
    expect(sent[0].content).toContain('BODY-A')
  })

  it('retry can exclude a file (unselects it) and only works on the latest failed reply', async () => {
    await setLlm({ mode: 'live', baseUrl: 'http://owui.test/api', apiKey: 'k', fileDelivery: 'openwebui' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const { scope, thread, task } = await fixture()
    const f = await uploadFile(dev, { taskId: task.id }, new File(['X'], 'x.pdf', { type: 'application/pdf' }))
    await setInput(dev, task.id, f.id, 'reference')
    const provider = scripted('ok')
    const deps = { provider: () => provider, timeouts: fast }
    const first = await startChat({ actor: dev, scope, thread, text: '질문' }, deps)
    await first.done
    const retry = await retryChat({ actor: dev, scope, thread, failedReplyId: first.replyId, excludeFileIds: [f.id] }, deps)
    await retry.done
    expect((await db.tasks.get(task.id))!.inputs).toHaveLength(0)
    expect((await db.messages.get(retry.replyId))!.status).toBe('done')
    await expect(retryChat({ actor: dev, scope, thread, failedReplyId: first.replyId }, deps)).rejects.toThrow()
  })
})
