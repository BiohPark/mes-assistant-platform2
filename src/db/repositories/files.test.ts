// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../schema'
import { createAssistant } from './assistants'
import { startConversation } from './tasks'
import { fileVersions, saveAssistantOutput, uploadFile } from './files'
import { blobToText } from '@/lib/blob'

const actor = { userId: 'u1' }

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.users.put({ id: 'u1', name: 'U', role: '', initials: 'U', color: '#000' })
  await createAssistant(actor, { id: 'a1', name: 'a1', level1: 'L1', level2: 'L2', summary: '', ownerId: 'u1', status: 'open', usageExample: '', checklistTemplate: [] })
})

describe('file versions', () => {
  it('same name in the same task bumps version and links previousId', async () => {
    const { task: t } = await startConversation(actor, { assistantId: 'a1', title: 'T' })
    const v1 = await saveAssistantOutput(actor, t.id, 'URS.md', 'first')
    const v2 = await saveAssistantOutput(actor, t.id, 'URS.md', 'second')
    expect(v1.version).toBe(1)
    expect(v2.version).toBe(2)
    expect(v2.previousId).toBe(v1.id)
    // 산출물 태그는 최신 버전으로 교체된다
    const task = (await db.tasks.get(t.id))!
    expect(task.outputFileIds).toEqual([v2.id])
    const chain = await fileVersions(v2.id)
    expect(chain.map((f) => f.version)).toEqual([2, 1])
    expect(await blobToText(chain[1].blob)).toBe('first')
  })
  it('uploads with the same name also chain', async () => {
    const { task: t } = await startConversation(actor, { assistantId: 'a1', title: 'T' })
    const a = await uploadFile(actor, { taskId: t.id }, new File(['a'], 'spec.md', { type: 'text/markdown' }))
    const b = await uploadFile(actor, { taskId: t.id }, new File(['b'], 'spec.md', { type: 'text/markdown' }))
    expect(b.version).toBe(2)
    expect(b.previousId).toBe(a.id)
  })
  it('different tasks do not share version chains', async () => {
    const { task: t1 } = await startConversation(actor, { assistantId: 'a1', title: 'T1' })
    const { task: t2 } = await startConversation(actor, { assistantId: 'a1', title: 'T2' })
    await saveAssistantOutput(actor, t1.id, 'x.md', '1')
    const other = await saveAssistantOutput(actor, t2.id, 'x.md', '1')
    expect(other.version).toBe(1)
    expect(other.previousId).toBeUndefined()
  })
})
