import { expect, type Page } from '@playwright/test'

/**
 * 앱 내부 모듈을 브라우저에서 직접 호출해 시나리오를 준비한다(가상 데이터만 사용).
 * 코드 문자열로 넘겨 테스트 변환기가 dynamic import를 바꾸지 않게 한다.
 */
export async function inApp<T>(page: Page, code: string, arg?: unknown): Promise<T> {
  // 테스트 전용: 앱 모듈을 브라우저에서 dynamic import 하려고 코드 문자열을 평가한다
  // oxlint-disable-next-line no-eval
  return page.evaluate(({ code, arg }) => (0, eval)(code)(arg), { code, arg }) as Promise<T>
}

const PRELUDE = `
  const { db } = await import('/src/db/schema.ts')
  const settingsRepo = await import('/src/db/repositories/settings.ts')
  const actor = { userId: (await settingsRepo.getSettings()).currentUserId }
`

/** 첫 화면 로드 + 시드 주입 완료까지 대기 */
export async function boot(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect
    .poll(() => inApp<boolean>(page, `async () => { const { db } = await import('/src/db/schema.ts'); return !!(await db.settings.get('app')) }`))
    .toBe(true)
}

export interface LlmPatch {
  mode?: 'mock' | 'live'
  baseUrl?: string
  apiKey?: string
  model?: string
  fileDelivery?: 'inline' | 'openwebui'
}

export async function setLlm(page: Page, patch: LlmPatch): Promise<void> {
  await inApp(page, `async (patch) => { ${PRELUDE} const s = await settingsRepo.getSettings(); await settingsRepo.setLlmSettings({ ...s.llm, ...patch }) }`, patch)
}

export interface CreatedTask {
  id: string
  code: string
  threadId: string
}

/** 에이전트 공통 순서에서 n번째(폐기 제외) 에이전트로 대화를 만든다 */
export async function createTask(page: Page, opts: { tags?: string[]; assistantIndex?: number } = {}): Promise<CreatedTask> {
  return inApp<CreatedTask>(
    page,
    `async (opts) => { ${PRELUDE}
      const tasks = await import('/src/db/repositories/tasks.ts')
      const list = (await db.assistants.orderBy('order').toArray()).filter((a) => a.status !== 'retired')
      const { task } = await tasks.startConversation(actor, { assistantId: list[opts.assistantIndex ?? 0].id, tags: opts.tags ?? [] })
      return { id: task.id, code: task.code, threadId: task.threadId }
    }`,
    opts,
  )
}

/** 대화에 텍스트 파일을 올린다. asOutput이면 산출물로 표시한다 */
export async function addFile(page: Page, taskId: string, name: string, content: string, asOutput = false): Promise<string> {
  return inApp<string>(
    page,
    `async ({ taskId, name, content, asOutput }) => { ${PRELUDE}
      const files = await import('/src/db/repositories/files.ts')
      const f = await files.uploadFile(actor, { taskId }, new File([content], name, { type: 'text/markdown' }))
      if (asOutput) await files.setOutputTag(actor, taskId, f.id, true)
      return f.id
    }`,
    { taskId, name, content, asOutput },
  )
}

export async function selectInput(page: Page, taskId: string, fileId: string, weight: 'main' | 'reference'): Promise<void> {
  await inApp(
    page,
    `async ({ taskId, fileId, weight }) => { ${PRELUDE}
      const tasks = await import('/src/db/repositories/tasks.ts')
      await tasks.setInput(actor, taskId, fileId, weight)
    }`,
    { taskId, fileId, weight },
  )
}

export interface MessageRow {
  id: string
  role: string
  status: string
  content: string
  kind?: string
}

export async function threadMessages(page: Page, threadId: string): Promise<MessageRow[]> {
  return inApp<MessageRow[]>(
    page,
    `async (threadId) => { const { db } = await import('/src/db/schema.ts')
      const rows = await db.messages.where('threadId').equals(threadId).sortBy('createdAt')
      return rows.map((m) => ({ id: m.id, role: m.role, status: m.status, content: m.content, kind: m.kind }))
    }`,
    threadId,
  )
}

/** 완료(done/error)된 assistant 답변이 n개가 될 때까지 대기 */
export async function waitForReplies(page: Page, threadId: string, n: number): Promise<MessageRow[]> {
  await expect
    .poll(async () => (await threadMessages(page, threadId)).filter((m) => m.role === 'assistant' && m.status !== 'streaming').length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(n)
  return threadMessages(page, threadId)
}

export function composer(page: Page) {
  return page.getByPlaceholder(/assistant에게 요청하세요/)
}

export async function send(page: Page, text: string): Promise<void> {
  const box = composer(page)
  await box.fill(text)
  await box.press('Enter')
}

/** 컴포저 클립 버튼으로 파일 첨부 */
export async function attachViaComposer(page: Page, name: string, content: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '파일 첨부' }).click()
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content, 'utf8') })
}
