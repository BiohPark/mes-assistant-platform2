import { expect, test } from '@playwright/test'
import { FAKE_BASE_URL, installFakeOpenWebUI } from './support/fakeOpenWebUI'
import { addFile, attachViaComposer, boot, createTask, inApp, selectInput, send, setLlm, threadMessages, waitForReplies } from './support/app'

/**
 * 파일·대화 컨텍스트 흐름 평가 (docs/evaluation/context-flow.md S1–S8).
 * 모두 가상 자료 + 가짜 OpenWebUI. 요청 본문을 가로채 "AI가 실제로 받은 것"으로 판정한다.
 */

const LIVE_INLINE = { mode: 'live' as const, baseUrl: FAKE_BASE_URL, apiKey: 'e2e-dummy', model: 'fake-model', fileDelivery: 'inline' as const }
const LIVE_OWUI = { ...LIVE_INLINE, fileDelivery: 'openwebui' as const }

/** E1 기준선에서 재현된 결함. 고친 커밋에서 해당 ID를 지운다 */
const KNOWN_DEFECTS = new Set(['S1', 'S2', 'S3', 'S5', 'S6', 'S7', 'S8'])
const expectDefect = (id: string) => test.fail(KNOWN_DEFECTS.has(id), `${id}: E1 기준선 결함(수정 전)`)

const systemOf = (body: { messages: Array<{ role: string; content: string }> }) => body.messages.find((m) => m.role === 'system')?.content ?? ''

test('S1 컴포저 첨부는 다음 턴에도 AI 입력으로 남는다', async ({ page, context }) => {
  expectDefect('S1')
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  const t = await createTask(page)
  await page.goto(`/c/${t.id}`)
  await attachViaComposer(page, 'notes-s1.txt', 'MARKER-S1 첨부 본문')
  await send(page, '첫 질문')
  await waitForReplies(page, t.threadId, 1)
  await send(page, '두 번째 질문')
  await waitForReplies(page, t.threadId, 2)
  expect(fake.chats).toHaveLength(2)
  expect(JSON.stringify(fake.chats[0].body)).toContain('MARKER-S1')
  expect(JSON.stringify(fake.chats[1].body)).toContain('MARKER-S1')
})

test('S2 SR 접수 대화의 첨부는 첨부한 그 메시지에 포함된다', async ({ page, context }) => {
  expectDefect('S2')
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  await page.goto('/sr')
  await page.getByRole('button', { name: '새 대화' }).first().click()
  await expect(page.getByText('접수 전 대화')).toBeVisible()
  await attachViaComposer(page, 'sr-s2.txt', 'MARKER-S2 요청 첨부')
  await send(page, '화면 개선 요청입니다')
  await expect.poll(() => fake.chats.length).toBe(1)
  expect(JSON.stringify(fake.chats[0].body)).toContain('MARKER-S2')
})

test('S3 기본 이름으로 두 번 저장한 산출물은 같은 파일의 v2가 된다', async ({ page }) => {
  expectDefect('S3')
  await boot(page)
  const t = await createTask(page)
  await page.goto(`/c/${t.id}`)
  await send(page, '초안 부탁합니다')
  await waitForReplies(page, t.threadId, 1)
  await send(page, '수정해 주세요')
  await waitForReplies(page, t.threadId, 2)
  for (const idx of [0, 1]) {
    await page.getByRole('button', { name: '산출물로 저장' }).nth(idx).click()
    await page.getByRole('dialog').getByRole('button', { name: '저장' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
  }
  const files = await inApp<Array<{ name: string; version: number }>>(
    page,
    `async (taskId) => { const { db } = await import('/src/db/schema.ts'); return (await db.files.where('originTaskId').equals(taskId).toArray()).map((f) => ({ name: f.name, version: f.version })) }`,
    t.id,
  )
  expect(files).toHaveLength(2)
  expect(new Set(files.map((f) => f.name)).size).toBe(1)
  expect(files.map((f) => f.version).sort()).toEqual([1, 2])
})

test('S4 태그 공유 자료를 ★·☑로 고르면 주 입력이 먼저 전달된다', async ({ page, context }) => {
  expectDefect('S4')
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  const a = await createTask(page, { tags: ['e2e-s4'] })
  const main = await addFile(page, a.id, 'main-s4.md', 'MARKER-MAIN', true)
  const ref = await addFile(page, a.id, 'ref-s4.md', 'MARKER-REF', true)
  const b = await createTask(page, { tags: ['e2e-s4'], assistantIndex: 1 })
  await selectInput(page, b.id, ref, 'reference')
  await selectInput(page, b.id, main, 'main')
  await page.goto(`/c/${b.id}`)
  await send(page, '자료 기준으로 정리해 주세요')
  await expect.poll(() => fake.chats.length).toBe(1)
  const sys = systemOf(fake.chats[0].body)
  expect(sys.indexOf('MARKER-MAIN')).toBeGreaterThan(-1)
  expect(sys.indexOf('MARKER-MAIN')).toBeLessThan(sys.indexOf('MARKER-REF'))
})

test('S5 OpenWebUI 첨부: 처리 완료 확인 후 전송, 주 입력 먼저, 업로드 이름에 버전', async ({ page, context }) => {
  expectDefect('S5')
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_OWUI)
  const a = await createTask(page, { tags: ['e2e-s5'] })
  await addFile(page, a.id, 'URS-s5.md', 'v1 본문', true)
  const v2 = await addFile(page, a.id, 'URS-s5.md', 'v2 본문', true)
  const ref = await addFile(page, a.id, 'memo-s5.md', '참고 메모', true)
  const b = await createTask(page, { tags: ['e2e-s5'], assistantIndex: 1 })
  await selectInput(page, b.id, ref, 'reference')
  await selectInput(page, b.id, v2, 'main')
  await page.goto(`/c/${b.id}`)
  await send(page, '검토해 주세요')
  await expect.poll(() => fake.chats.length).toBe(1)
  const chat = fake.chats[0]
  const mainUpload = fake.uploads.find((u) => u.filename.startsWith('URS-s5'))
  expect(mainUpload?.filename).toContain('(v2)')
  expect(chat.body.files?.[0]?.id).toBe(mainUpload?.id)
  for (const u of fake.uploads) {
    const polled = fake.statusPolls.filter((p) => p.id === u.id)
    expect(polled.length).toBeGreaterThan(0)
    expect(Math.max(...polled.map((p) => p.at))).toBeLessThanOrEqual(chat.at)
  }
})

test('S6 프롬프트를 만들다 실패해도 입력창이 잠기지 않는다', async ({ page }) => {
  expectDefect('S6')
  await boot(page)
  const t = await createTask(page)
  const fid = await addFile(page, t.id, 'broken-s6.md', '본문')
  await selectInput(page, t.id, fid, 'reference')
  // 파일 본문을 읽을 수 없게 만들어 프롬프트 생성 단계의 예외를 재현
  await inApp(page, `async (id) => { const { db } = await import('/src/db/schema.ts'); await db.files.update(id, { blob: 'not-a-blob' }) }`, fid)
  await page.goto(`/c/${t.id}`)
  await send(page, '질문')
  // 답변 자리가 생긴 뒤 '응답 중'에서 벗어나야 한다 (오류로 끝나도 됨)
  await expect
    .poll(
      async () => {
        const rows = await threadMessages(page, t.threadId)
        return rows.some((m) => m.role === 'assistant') && !rows.some((m) => m.status === 'streaming')
      },
      { timeout: 8_000 },
    )
    .toBe(true)
  await expect(page.getByRole('button', { name: '중지' })).toHaveCount(0)
})

test('S7 두 탭에서 동시에 보내도 진행 중 요청은 하나다', async ({ page, context }) => {
  expectDefect('S7')
  const fake = await installFakeOpenWebUI(context, { chatDelayMs: 2_500 })
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  const t = await createTask(page)
  const other = await context.newPage()
  await page.goto(`/c/${t.id}`)
  await other.goto(`/c/${t.id}`)
  const boxes = [page, other].map((p) => p.getByPlaceholder(/assistant에게 요청하세요/))
  await boxes[0].fill('탭 1 질문')
  await boxes[1].fill('탭 2 질문')
  await Promise.all(boxes.map((b) => b.press('Enter')))
  await page.waitForTimeout(4_000)
  expect(fake.chats.length).toBe(1)
})

test('S8 Mock 응답은 매 턴 사용한 자료(등급·버전)를 드러낸다', async ({ page }) => {
  expectDefect('S8')
  await boot(page)
  const a = await createTask(page, { tags: ['e2e-s8'] })
  const f = await addFile(page, a.id, 'spec-s8.md', '# 사양 초안\n본문', true)
  const b = await createTask(page, { tags: ['e2e-s8'], assistantIndex: 1 })
  await selectInput(page, b.id, f, 'main')
  await page.goto(`/c/${b.id}`)
  await send(page, '검토 부탁합니다')
  await waitForReplies(page, b.threadId, 1)
  await send(page, '추가 의견 주세요')
  const rows = await waitForReplies(page, b.threadId, 2)
  const replies = rows.filter((m) => m.role === 'assistant')
  for (const r of replies) {
    expect(r.content).toContain('사용한 자료')
    expect(r.content).toContain('spec-s8.md v1')
  }
})
