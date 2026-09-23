// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../schema'
import { createAssistant, reorderAssistants } from './assistants'
import { addTag, applyChecklistReview, deleteTask, removeTag, saveChecklistReview, setInput, setTaskTitle, startConversation, switchInputVersion } from './tasks'
import { saveAssistantOutput } from './files'
import { conversationsForSr, setSrTitle, startSrConversation, startTaskFromSr, submitSr } from './sr'
import { DEFAULT_LLM_SETTINGS } from '@/domain/types'
import { sharedPool } from '@/domain/tags'

const so = { userId: 'u_so' }
const dev = { userId: 'u_dev' }
const req = { userId: 'u_req' }
const input = (id: string) => ({ id, name: id, level1: 'SDLC', level2: id, summary: '', ownerId: 'u_dev', status: 'open' as const, usageExample: '', checklistTemplate: [] })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.users.bulkPut([
    { id: 'u_so', name: 'SO', role: '', initials: 'S', color: '', isSystemOwner: true },
    { id: 'u_dev', name: 'Dev', role: '', initials: 'D', color: '' },
    { id: 'u_req', name: 'Req', role: '', initials: 'R', color: '' },
  ])
  await db.settings.put({ id: 'app', currentUserId: 'u_so', srIntakeAssistantId: 'urs', llm: DEFAULT_LLM_SETTINGS })
  for (const id of ['urs', 'fds', 'test']) await createAssistant(so, input(id))
})

describe('startConversation', () => {
  it('creates task + single thread, default title, in_progress, normalized unique tags', async () => {
    const { task, thread } = await startConversation(dev, { assistantId: 'fds', tags: ['#sr-2026-0002', 'SR-2026-0002', ' cca item '] })
    expect(task.threadId).toBe(thread.id)
    expect(thread.taskId).toBe(task.id)
    expect(task.titleSource).toBe('default')
    expect(task.status).toBe('in_progress')
    expect(task.tags).toEqual(['SR-2026-0002', 'cca-item'])
    expect(await db.threads.where('taskId').equals(task.id).count()).toBe(1)
  })
  it('refuses retired assistants', async () => {
    await db.assistants.update('test', { status: 'retired' })
    await expect(startConversation(dev, { assistantId: 'test' })).rejects.toThrow(/폐기/)
  })
})

describe('titles', () => {
  it('AI title does not overwrite a manual title', async () => {
    const { task } = await startConversation(dev, { assistantId: 'fds' })
    await setTaskTitle(task.id, 'AI 제목', 'ai')
    expect((await db.tasks.get(task.id))!.title).toBe('AI 제목')
    await setTaskTitle(task.id, '내 제목', 'manual')
    await setTaskTitle(task.id, '다른 AI 제목', 'ai')
    expect((await db.tasks.get(task.id))!).toMatchObject({ title: '내 제목', titleSource: 'manual' })
  })
})

describe('tags and inputs', () => {
  it('addTag dedupes case-insensitively; removeTag keeps already selected inputs', async () => {
    const { task: urs } = await startConversation(dev, { assistantId: 'urs', tags: ['SR-2026-0002'] })
    const out = await saveAssistantOutput(dev, urs.id, 'URS.md', '# URS')
    const { task: fds } = await startConversation(dev, { assistantId: 'fds' })
    expect(await addTag(dev, fds.id, 'sr-2026-0002')).toBe(true)
    expect(await addTag(dev, fds.id, 'SR-2026-0002')).toBe(false)

    await setInput(dev, fds.id, out.id, 'main')
    await removeTag(dev, fds.id, 'SR-2026-0002')
    const after = (await db.tasks.get(fds.id))!
    expect(after.tags).toEqual([])
    expect(after.inputs.map((i) => [i.fileId, i.weight])).toEqual([[out.id, 'main']])
  })

  it('new version does not replace a selected input; pool flags the newer version', async () => {
    const { task: urs } = await startConversation(dev, { assistantId: 'urs', tags: ['t'] })
    const v1 = await saveAssistantOutput(dev, urs.id, 'URS.md', 'v1')
    const { task: fds } = await startConversation(dev, { assistantId: 'fds', tags: ['t'] })
    await setInput(dev, fds.id, v1.id, 'reference')
    const v2 = await saveAssistantOutput(dev, urs.id, 'URS.md', 'v2')
    const me = (await db.tasks.get(fds.id))!
    expect(me.inputs.map((i) => i.fileId)).toEqual([v1.id])
    const pool = sharedPool(me, await db.tasks.toArray(), await db.files.toArray(), await db.assistants.toArray())
    const selected = pool.groups[0].items.find((i) => i.file.id === v1.id)!
    expect(selected.newerVersionId).toBe(v2.id)
  })

  it('switchInputVersion moves the selection to the chosen version and keeps its weight', async () => {
    const { task: urs } = await startConversation(dev, { assistantId: 'urs', tags: ['t'] })
    const v1 = await saveAssistantOutput(dev, urs.id, 'URS.md', 'v1')
    const { task: fds } = await startConversation(dev, { assistantId: 'fds', tags: ['t'] })
    await setInput(dev, fds.id, v1.id, 'main')
    const v2 = await saveAssistantOutput(dev, urs.id, 'URS.md', 'v2')
    await switchInputVersion(dev, fds.id, v1.id, v2.id)
    expect((await db.tasks.get(fds.id))!.inputs.map((i) => [i.fileId, i.weight])).toEqual([[v2.id, 'main']])
  })

  it('setInput(null) deselects; deleteTask refuses when its files are someone else’s input', async () => {
    const { task: urs } = await startConversation(dev, { assistantId: 'urs', tags: ['t'] })
    const f = await saveAssistantOutput(dev, urs.id, 'URS.md', 'x')
    const { task: fds } = await startConversation(dev, { assistantId: 'fds', tags: ['t'] })
    await setInput(dev, fds.id, f.id, 'main')
    expect((await deleteTask(urs.id)).ok).toBe(false)
    await setInput(dev, fds.id, f.id, null)
    expect((await db.tasks.get(fds.id))!.inputs).toEqual([])
    expect((await deleteTask(urs.id)).ok).toBe(true)
  })
})

describe('SR follow-up', () => {
  it('startTaskFromSr tags the new conversation with the SR code and lists existing ones', async () => {
    const sr = await startSrConversation(req)
    const submitted = await submitSr(req, sr.id, { title: '알람 필터', titleSource: 'ai', body: '', attachmentIds: [] })
    const task = await startTaskFromSr(dev, sr.id, 'fds')
    expect(task.tags).toEqual([submitted.code])
    expect(task.assistantId).toBe('fds')
    expect((await conversationsForSr(submitted.code)).map((t) => t.id)).toEqual([task.id])
    expect((await db.serviceRequests.get(sr.id))!.status).toBe('in_progress')
  })
  it('only requester or SO can edit SR title; edits become manual', async () => {
    const sr = await startSrConversation(req)
    await submitSr(req, sr.id, { title: 'AI 제목', titleSource: 'ai', body: '', attachmentIds: [] })
    await expect(setSrTitle(dev, sr.id, '남의 수정')).rejects.toThrow()
    await setSrTitle(so, sr.id, 'SO 수정')
    expect((await db.serviceRequests.get(sr.id))!).toMatchObject({ title: 'SO 수정', titleSource: 'manual' })
  })
  it('refuses to start from a draft SR', async () => {
    const sr = await startSrConversation(req)
    await expect(startTaskFromSr(dev, sr.id, 'fds')).rejects.toThrow()
  })
})

describe('reorderAssistants', () => {
  it('SO only; missing ids keep relative order at the end', async () => {
    await expect(reorderAssistants(dev, ['test'])).rejects.toThrow()
    await reorderAssistants(so, ['test', 'urs'])
    const order = (await db.assistants.orderBy('order').toArray()).map((a) => a.id)
    expect(order).toEqual(['test', 'urs', 'fds'])
  })
})

describe('checklist review', () => {
  it('saves an m/n review without touching checks; apply checks only AI-met items', async () => {
    await db.assistants.update('fds', { checklistTemplate: [{ id: 't1', label: 'A', required: true }, { id: 't2', label: 'B', required: false }] })
    const { task } = await startConversation(dev, { assistantId: 'fds' })
    const [a, b] = task.checklist
    await saveChecklistReview(dev, task.id, {
      at: '2026-09-23T00:00:00.000Z',
      by: dev.userId,
      met: 1,
      total: 2,
      source: 'ai',
      items: [
        { itemId: a.id, met: true, note: '근거' },
        { itemId: b.id, met: false, note: '' },
      ],
    })
    const saved = (await db.tasks.get(task.id))!
    expect(saved.checklistReview).toMatchObject({ met: 1, total: 2 })
    expect(saved.checklist.every((c) => !c.checked)).toBe(true)
    expect(await applyChecklistReview(dev, task.id)).toBe(1)
    const after = (await db.tasks.get(task.id))!
    expect(after.checklist.map((c) => c.checked)).toEqual([true, false])
    expect(await db.activity.where('type').equals('checklist.reviewed').count()).toBe(1)
  })
})
