// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../schema'
import { createAssistant, deleteAssistant, setAssistantStatus } from './assistants'
import { setSrIntakeAssistant } from './settings'
import { DEFAULT_LLM_SETTINGS } from '@/domain/types'

const actor = { userId: 'u1' }
const input = (id: string) => ({ id, name: id, level1: 'L1', level2: 'L2', summary: '', ownerId: 'u1', status: 'open' as const, usageExample: '', checklistTemplate: [] })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.settings.put({ id: 'app', currentUserId: 'u1', llm: DEFAULT_LLM_SETTINGS })
  await createAssistant(actor, input('intake'))
  await createAssistant(actor, input('other'))
  await setSrIntakeAssistant('intake')
})

describe('SR intake assistant guards', () => {
  it('refuses to retire the current intake assistant', async () => {
    await expect(setAssistantStatus(actor, 'intake', 'retired')).rejects.toThrow(/접수 에이전트/)
    expect((await db.assistants.get('intake'))!.status).toBe('open')
  })
  it('refuses to delete the current intake assistant', async () => {
    const r = await deleteAssistant('intake')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/접수 에이전트/)
  })
  it('allows retire/delete after reassigning intake', async () => {
    await setSrIntakeAssistant('other')
    await setAssistantStatus(actor, 'intake', 'retired')
    expect((await db.assistants.get('intake'))!.status).toBe('retired')
  })
  it('refuses to set a retired assistant as intake', async () => {
    await setAssistantStatus(actor, 'other', 'retired')
    await expect(setSrIntakeAssistant('other')).rejects.toThrow(/폐기/)
  })
})
