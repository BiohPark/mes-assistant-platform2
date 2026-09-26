import { expect, test, type Page } from '@playwright/test'
import { FAKE_BASE_URL, installFakeOpenWebUI } from './support/fakeOpenWebUI'
import { addFile, boot, createTask, inApp, selectInput, send, setLlm, waitForReplies } from './support/app'

/**
 * 평가 E2–E4 (docs/evaluation/context-flow.md): 파일 전달 실패 복구, 같은 태그 대화를 입력으로 선택, 크기 한도.
 * 가상 자료 + 가짜 OpenWebUI. "AI가 실제로 받은 것"은 가로챈 요청 본문으로 판정한다.
 */

const LIVE_INLINE = { mode: 'live' as const, baseUrl: FAKE_BASE_URL, apiKey: 'e2e-dummy', model: 'fake-model', fileDelivery: 'inline' as const }

const systemOf = (body: { messages: Array<{ role: string; content: string }> }) => body.messages.find((m) => m.role === 'system')?.content ?? ''

/** 대화에 사용자·assistant 발화를 직접 넣는다 (참조 대상 준비) */
async function addTurns(page: Page, threadId: string, turns: string[]): Promise<void> {
  await inApp(
    page,
    `async ({ threadId, turns }) => {
      const settings = await import('/src/db/repositories/settings.ts')
      const chat = await import('/src/db/repositories/chat.ts')
      const actor = { userId: (await settings.getSettings()).currentUserId }
      for (const [i, text] of turns.entries()) await chat.appendMessage(i % 2 === 0 ? actor : null, threadId, i % 2 === 0 ? 'user' : 'assistant', text)
    }`,
    { threadId, turns },
  )
}

const candidateToggle = (page: Page, code: string) => page.getByRole('checkbox', { name: `${code} 참고 입력으로 선택` })

test('E2 OpenWebUI 전달 실패: 요청을 보내지 않고, 텍스트로 보내기로 복구한다', async ({ page, context }) => {
  const fake = await installFakeOpenWebUI(context, { statusSequence: ['failed'] })
  await boot(page)
  await setLlm(page, { ...LIVE_INLINE, fileDelivery: 'openwebui' })
  const t = await createTask(page)
  const f = await addFile(page, t.id, 'spec-e2.md', 'MARKER-E2 본문')
  await selectInput(page, t.id, f, 'main')
  await page.goto(`/c/${t.id}`)
  await send(page, '검토해 주세요')
  await expect(page.getByText(/OpenWebUI에 전달하지 못해 요청을 보내지 않았습니다/)).toBeVisible()
  expect(fake.chats).toHaveLength(0)
  await expect(page.getByRole('button', { name: '빼고 다시' })).toBeVisible()
  await page.getByRole('button', { name: '텍스트로 보내기' }).click()
  await expect.poll(() => fake.chats.length).toBe(1)
  expect(systemOf(fake.chats[0].body)).toContain('MARKER-E2')
  expect(fake.chats[0].body.messages.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['검토해 주세요'])
  // 실패한 답변과 새 답변 모두 사용한 자료 기록을 가진다 (실패 기록은 남는다)
  await expect(page.getByText('사용한 자료 1')).toHaveCount(2)
})

test('E3a 같은 태그 대화만 후보가 되고, 통째로 고르면 전체 원문이 간다 (간접 연결·팀 의견 제외)', async ({ page, context }) => {
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  const a = await createTask(page, { tags: ['e3-x'] })
  await addTurns(page, a.threadId, ['보관 기간은?', 'MARKER-A 90일로 합의'])
  await inApp(page, `async (threadId) => { const chat = await import('/src/db/repositories/chat.ts'); await chat.appendMessage({ userId: 'u_so' }, threadId, 'user', 'MARKER-NOTE 팀 메모', [], 'done', 'discussion') }`, a.threadId)
  const b = await createTask(page, { tags: ['e3-x', 'e3-y'], assistantIndex: 1 })
  const c = await createTask(page, { tags: ['e3-y'], assistantIndex: 2 })
  await addTurns(page, c.threadId, ['C 질문', 'C 답변'])
  // A에서는 B만 보이고, B–C로만 이어진 C는 보이지 않는다
  await page.goto(`/c/${a.id}`)
  await expect(candidateToggle(page, b.code)).toBeVisible()
  await expect(candidateToggle(page, c.code)).toHaveCount(0)
  // B에서 A를 통째로 고른다
  await page.goto(`/c/${b.id}`)
  await candidateToggle(page, a.code).click()
  await expect(page.getByText('이번 요청에 사용 · 1')).toBeVisible()
  await send(page, 'A 결과 기준으로 진행')
  await expect.poll(() => fake.chats.length).toBe(1)
  const sys = systemOf(fake.chats[0].body)
  expect(sys).toContain('## 참조 대화 (1)')
  expect(sys).toContain('MARKER-A 90일로 합의')
  expect(sys).not.toContain('MARKER-NOTE')
  expect(sys).not.toContain('C 답변')
})

test('E3b 메시지 범위를 고르면 고른 메시지만 간다', async ({ page, context }) => {
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  const a = await createTask(page, { tags: ['e3b'] })
  await addTurns(page, a.threadId, ['KEEP-1 질문', 'KEEP-2 답변', 'DROP-3 질문', 'DROP-4 답변'])
  const b = await createTask(page, { tags: ['e3b'], assistantIndex: 1 })
  await page.goto(`/c/${b.id}`)
  await page.getByRole('button', { name: `${a.code} 세부 조절` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: '메시지 선택' }).click()
  await dialog.getByRole('checkbox', { name: '3번째 메시지 선택' }).click()
  await dialog.getByRole('checkbox', { name: '4번째 메시지 선택' }).click()
  await dialog.getByRole('button', { name: '고른 메시지 2개로 선택' }).click()
  await expect(dialog).toBeHidden()
  await send(page, '진행')
  await expect.poll(() => fake.chats.length).toBe(1)
  const sys = systemOf(fake.chats[0].body)
  expect(sys).toContain('KEEP-2 답변')
  expect(sys).not.toContain('DROP-3')
  expect(sys).toContain('고른 메시지')
})

test('E3c 요약은 누를 때만 만들고, 확인·수정한 요약이 간다 (Mock 대역)', async ({ page, context }) => {
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  const a = await createTask(page, { tags: ['e3c'] })
  await addTurns(page, a.threadId, ['질문', '# 결정 사항\n본문'])
  const b = await createTask(page, { tags: ['e3c'], assistantIndex: 1 })
  await page.goto(`/c/${b.id}`)
  await page.getByRole('button', { name: `${a.code} 세부 조절` }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('tab', { name: '요약' }).click()
  await dialog.getByRole('button', { name: '요약 만들기' }).click()
  const box = dialog.getByPlaceholder('요약을 만들거나 직접 작성하세요')
  await expect(box).toHaveValue(/Mock 대역 요약/)
  await box.fill('EDITED-SUMMARY 보관 90일')
  await dialog.getByRole('button', { name: '요약 적용' }).click()
  await expect(dialog).toBeHidden()
  await setLlm(page, LIVE_INLINE)
  await send(page, '요약 기준으로')
  await expect.poll(() => fake.chats.length).toBe(1)
  const sys = systemOf(fake.chats[0].body)
  expect(sys).toContain('EDITED-SUMMARY 보관 90일')
  expect(sys).not.toContain('# 결정 사항')
})

test('E3d 선택 시점으로 고정되고, 새 메시지는 갱신을 눌러야 들어간다', async ({ page, context }) => {
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  const a = await createTask(page, { tags: ['e3d'] })
  await addTurns(page, a.threadId, ['OLD 질문', 'OLD 답변'])
  const b = await createTask(page, { tags: ['e3d'], assistantIndex: 1 })
  await page.goto(`/c/${b.id}`)
  await candidateToggle(page, a.code).click()
  await addTurns(page, a.threadId, ['NEW 질문', 'NEW 답변'])
  await expect(page.getByRole('button', { name: /새 메시지 2 · 갱신/ })).toBeVisible()
  await send(page, '첫 요청')
  await expect.poll(() => fake.chats.length).toBe(1)
  expect(systemOf(fake.chats[0].body)).not.toContain('NEW 답변')
  await waitForReplies(page, b.threadId, 1)
  await page.getByRole('button', { name: /새 메시지 2 · 갱신/ }).click()
  await expect(page.getByRole('button', { name: /새 메시지 \d · 갱신/ })).toHaveCount(0)
  await send(page, '두 번째 요청')
  await expect.poll(() => fake.chats.length).toBe(2)
  expect(systemOf(fake.chats[1].body)).toContain('NEW 답변')
})

test('E4 요청 크기 한도를 넘으면 전송을 막고 줄이는 방법을 안내한다 (자동 절단 없음)', async ({ page, context }) => {
  const fake = await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  await inApp(page, `async () => { const s = await import('/src/db/repositories/settings.ts'); await s.setRequestBudget(4 * 1024) }`)
  const a = await createTask(page, { tags: ['e4'] })
  await addTurns(page, a.threadId, ['긴 질문', 'X'.repeat(6000)])
  const b = await createTask(page, { tags: ['e4'], assistantIndex: 1 })
  await page.goto(`/c/${b.id}`)
  await candidateToggle(page, a.code).click()
  await expect(page.getByRole('alert').filter({ hasText: '요청 크기 한도를 넘어 보낼 수 없습니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: `${a.code} 요약 만들기` })).toBeVisible()
  await expect(page.getByRole('button', { name: '새 대화로 이어가기' })).toBeVisible()
  await page.getByPlaceholder(/assistant에게 요청하세요/).fill('보내 보기')
  await expect(page.getByRole('button', { name: '전송', exact: true })).toBeDisabled()
  expect(fake.chats).toHaveLength(0)
})

test('E6 답변의 "사용한 자료"에서 전송 기록을 앱 안에서 본다', async ({ page, context }) => {
  await installFakeOpenWebUI(context)
  await boot(page)
  await setLlm(page, LIVE_INLINE)
  const t = await createTask(page)
  const f = await addFile(page, t.id, 'memo-e6.md', '메모')
  await selectInput(page, t.id, f, 'reference')
  await page.goto(`/c/${t.id}`)
  await send(page, '질문')
  await page.getByRole('button', { name: /사용한 자료 1/ }).click()
  const dialog = page.getByRole('dialog', { name: '전송 기록' })
  await expect(dialog.getByText('memo-e6.md v1')).toBeVisible()
  await expect(dialog.getByText('본문', { exact: true })).toBeVisible()
})
