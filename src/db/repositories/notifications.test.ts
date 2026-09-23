// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../schema'
import { createAssistant } from './assistants'
import { startConversation } from './tasks'
import { setSrStatus, startSrConversation, submitSr } from './sr'
import { markAllRead, markRead, unreadCount } from './notifications'
import { setSrIntakeAssistant } from './settings'
import { DEFAULT_LLM_SETTINGS } from '@/domain/types'

const park = { userId: 'u_so' }
const lee = { userId: 'u_dev3' }
const input = (id: string, ownerId: string) => ({ id, name: id, level1: 'L1', level2: 'L2', summary: '', ownerId, status: 'open' as const, usageExample: '', checklistTemplate: [] })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.users.bulkPut([
    { id: 'u_so', name: '박', role: '', initials: 'P', color: '' },
    { id: 'u_dev3', name: '이', role: '', initials: 'L', color: '' },
    { id: 'u_kim', name: '김', role: '', initials: 'K', color: '' },
  ])
  await db.settings.put({ id: 'app', currentUserId: 'u_so', llm: DEFAULT_LLM_SETTINGS })
  await createAssistant(park, input('a1', 'u_so'))
  await createAssistant(park, input('a2', 'u_kim'))
  await createAssistant(park, input('intake', 'u_so'))
  await setSrIntakeAssistant('intake')
})

describe('notifications', () => {
  it('notifies owner/assignees on conversation start (excluding the actor)', async () => {
    await startConversation(park, { assistantId: 'a1', assigneeIds: ['u_so', 'u_dev3'] })
    expect(await db.notifications.where('userId').equals('u_dev3').count()).toBe(1)
    expect(await db.notifications.where('userId').equals('u_so').count()).toBe(0)
  })
  it('SR submit notifies intake owner; status change notifies requester', async () => {
    const sr = await startSrConversation(lee)
    await submitSr(lee, sr.id, { title: '제목', titleSource: 'ai', body: '본문', attachmentIds: [] })
    expect(await db.notifications.where('userId').equals('u_so').count()).toBe(1)
    await setSrStatus(park, sr.id, 'in_progress')
    const mine = await db.notifications.where('userId').equals('u_dev3').toArray()
    expect(mine.length).toBe(1)
    expect(mine[0].link).toContain('/sr')
  })
  it('read helpers', async () => {
    await startConversation(park, { assistantId: 'a1', assigneeIds: ['u_dev3'] })
    await startConversation(park, { assistantId: 'a1', assigneeIds: ['u_dev3'] })
    expect(await unreadCount('u_dev3')).toBe(2)
    const [first] = await db.notifications.where('userId').equals('u_dev3').toArray()
    await markRead(first.id)
    expect(await unreadCount('u_dev3')).toBe(1)
    await markAllRead('u_dev3')
    expect(await unreadCount('u_dev3')).toBe(0)
  })
})

describe('shareSrResult', () => {
  it('appends result, sets responded and notifies requester', async () => {
    const { shareSrResult } = await import('./sr')
    const sr = await startSrConversation(lee)
    await submitSr(lee, sr.id, { title: '제목', titleSource: 'ai', body: '본문', attachmentIds: [] })
    await setSrStatus(park, sr.id, 'in_progress')
    const before = await db.notifications.where('userId').equals('u_dev3').count()
    const r = await shareSrResult(park, { srId: sr.id, text: '조치 완료했습니다', fileIds: [] })
    const after = await db.serviceRequests.get(sr.id)
    expect(after!.status).toBe('responded')
    expect(after!.results.map((x) => x.id)).toEqual([r.id])
    expect(await db.notifications.where('userId').equals('u_dev3').count()).toBe(before + 1)
  })
  it('rejects empty share and draft SR', async () => {
    const { shareSrResult } = await import('./sr')
    const sr = await startSrConversation(lee)
    await expect(shareSrResult(park, { srId: sr.id, text: 'x', fileIds: [] })).rejects.toThrow(/접수되지/)
    await submitSr(lee, sr.id, { title: '제목', titleSource: 'ai', body: '본문', attachmentIds: [] })
    await expect(shareSrResult(park, { srId: sr.id, text: '  ', fileIds: [] })).rejects.toThrow()
  })
})
