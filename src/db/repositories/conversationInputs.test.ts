// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../schema'
import { createAssistant } from './assistants'
import { appendMessage } from './chat'
import {
  applyConversationSummary,
  loadConversationInputs,
  refreshConversationInput,
  removeConversationInput,
  selectConversation,
  setConversationWeight,
} from './conversationInputs'
import { deleteTask, removeTag, setTaskStatus, startConversation } from './tasks'
import { DEFAULT_LLM_SETTINGS } from '@/domain/types'

const dev = { userId: 'u_dev' }
const input = (id: string) => ({ id, name: id, level1: 'SDLC', level2: id, summary: '', ownerId: 'u_dev', status: 'open' as const, usageExample: '', checklistTemplate: [] })

async function conversation(assistantId: string, tags: string[], turns: string[] = []) {
  const { task, thread } = await startConversation(dev, { assistantId, tags })
  for (const [i, text] of turns.entries()) await appendMessage(i % 2 === 0 ? dev : null, thread.id, i % 2 === 0 ? 'user' : 'assistant', text)
  return { task, thread }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.users.bulkPut([{ id: 'u_dev', name: 'Dev', role: '', initials: 'D', color: '' }])
  await db.settings.put({ id: 'app', currentUserId: 'u_dev', llm: DEFAULT_LLM_SETTINGS })
  for (const id of ['urs', 'fds']) await createAssistant(dev, input(id))
})

describe('selectConversation', () => {
  it('pins a full snapshot of eligible messages (ids only, no copied text)', async () => {
    const src = await conversation('urs', ['sr-1'], ['질문', '답변', '추가 질문', '추가 답변'])
    await appendMessage(dev, src.thread.id, 'user', '팀 메모', [], 'done', 'discussion')
    const me = await conversation('fds', ['SR-1'])
    const ci = await selectConversation(dev, me.task.id, src.task.id)
    expect(ci).toMatchObject({ taskId: me.task.id, sourceTaskId: src.task.id, weight: 'reference', mode: 'full' })
    const snap = (await db.contextSnapshots.get(ci.snapshotId))!
    expect(snap.messageIds).toHaveLength(4)
    expect(snap.upToMessageId).toBe(snap.messageIds[3])
    expect(JSON.stringify(snap)).not.toContain('추가 답변')
  })

  it('refuses conversations that do not directly share a tag, and itself', async () => {
    const other = await conversation('urs', ['x'], ['q', 'a'])
    const me = await conversation('fds', ['y'])
    await expect(selectConversation(dev, me.task.id, other.task.id)).rejects.toThrow(/태그/)
    await expect(selectConversation(dev, me.task.id, me.task.id)).rejects.toThrow()
  })

  it('messages mode keeps only chosen eligible messages in time order', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1', 'q2', 'a2'])
    const me = await conversation('fds', ['t'])
    const rows = await db.messages.where('threadId').equals(src.thread.id).sortBy('createdAt')
    const ci = await selectConversation(dev, me.task.id, src.task.id, { mode: 'messages', messageIds: [rows[3].id, rows[1].id, 'bogus'] })
    expect((await db.contextSnapshots.get(ci.snapshotId))!.messageIds).toEqual([rows[1].id, rows[3].id])
    await expect(selectConversation(dev, me.task.id, src.task.id, { mode: 'messages', messageIds: [] })).rejects.toThrow()
  })

  it('re-selecting the same conversation replaces the snapshot (one input per pair)', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1'])
    const me = await conversation('fds', ['t'])
    const first = await selectConversation(dev, me.task.id, src.task.id)
    const second = await selectConversation(dev, me.task.id, src.task.id, { weight: 'main' })
    expect(second.id).toBe(first.id)
    expect(second.snapshotId).not.toBe(first.snapshotId)
    expect(await db.conversationInputs.count()).toBe(1)
  })

  it('refuses changes on a completed conversation', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1'])
    const me = await conversation('fds', ['t'])
    await setTaskStatus(dev, me.task.id, 'done')
    await expect(selectConversation(dev, me.task.id, src.task.id)).rejects.toThrow(/완료/)
  })
})

describe('snapshot lifecycle', () => {
  it('keeps the pinned snapshot when the source grows; refresh pins the new messages', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1'])
    const me = await conversation('fds', ['t'])
    const ci = await selectConversation(dev, me.task.id, src.task.id)
    await appendMessage(dev, src.thread.id, 'user', 'q2')
    const [loaded] = await loadConversationInputs(me.task.id)
    expect(loaded.messages).toHaveLength(2)
    expect(loaded.newMessages).toBe(1)
    await refreshConversationInput(dev, ci.id)
    const [after] = await loadConversationInputs(me.task.id)
    expect(after.messages).toHaveLength(3)
    expect(after.newMessages).toBe(0)
  })

  it('keeps the selection after the shared tag is removed and marks it detached', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1'])
    const me = await conversation('fds', ['t'])
    await selectConversation(dev, me.task.id, src.task.id)
    await removeTag(dev, me.task.id, 't')
    const [loaded] = await loadConversationInputs(me.task.id)
    expect(loaded.detached).toBe(true)
  })

  it('summary mode stores the reviewed text with provenance', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1'])
    const me = await conversation('fds', ['t'])
    const ids = (await db.messages.where('threadId').equals(src.thread.id).toArray()).map((m) => m.id)
    const ci = await applyConversationSummary(dev, me.task.id, src.task.id, { text: '결정: 90일 보관', source: 'ai', model: 'm', messageIds: ids })
    const snap = (await db.contextSnapshots.get(ci.snapshotId))!
    expect(snap).toMatchObject({ mode: 'summary', summaryText: '결정: 90일 보관', summarySource: 'ai', summaryModel: 'm' })
    await expect(applyConversationSummary(dev, me.task.id, src.task.id, { text: '  ', source: 'ai', messageIds: ids })).rejects.toThrow()
  })

  it('weight change and removal', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1'])
    const me = await conversation('fds', ['t'])
    const ci = await selectConversation(dev, me.task.id, src.task.id)
    await setConversationWeight(dev, ci.id, 'main')
    expect((await db.conversationInputs.get(ci.id))!.weight).toBe('main')
    await removeConversationInput(dev, ci.id)
    expect(await db.conversationInputs.count()).toBe(0)
  })
})

describe('deleteTask protection', () => {
  it('refuses to delete a conversation another conversation references; cleans its own inputs', async () => {
    const src = await conversation('urs', ['t'], ['q1', 'a1'])
    const me = await conversation('fds', ['t'])
    await selectConversation(dev, me.task.id, src.task.id)
    expect((await deleteTask(src.task.id)).ok).toBe(false)
    expect((await deleteTask(me.task.id)).ok).toBe(true)
    expect(await db.conversationInputs.count()).toBe(0)
    expect((await deleteTask(src.task.id)).ok).toBe(true)
  })
})
