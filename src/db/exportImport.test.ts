// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { AppDB } from './schema'
import { seedDatabase } from './seed'
import { SEED_ASSISTANTS, SR_INTAKE_ASSISTANT_ID } from './seed/assistants'
import { SEED_USERS } from './seed/users'
import { isSrTag, sharedPool } from '@/domain/tags'
import { exportAll, importAll, validateBundle } from './exportImport'
import { blobToText } from '@/lib/blob'

let database: AppDB

beforeEach(async () => {
  database = new AppDB(`test-${Math.random()}`)
  await seedDatabase(database, new Date('2026-09-16T09:00:00.000Z'))
})

describe('seed', () => {
  it('creates catalog, conversations and SRs consistently', async () => {
    expect(await database.users.count()).toBe(SEED_USERS.length)
    expect(await database.assistants.count()).toBe(SEED_ASSISTANTS.length)
    expect((await database.assistants.orderBy('order').toArray()).map((a) => a.id)).toEqual(SEED_ASSISTANTS.map((a) => a.id))
    expect((await database.settings.get('app'))?.srIntakeAssistantId).toBe(SR_INTAKE_ASSISTANT_ID)
    expect((await database.users.toArray()).filter((u) => u.isSystemOwner).map((u) => u.id).sort()).toEqual(['u_dev1', 'u_dev2', 'u_dev3', 'u_req', 'u_so'])
    // 모든 에이전트에 기본 체크리스트(관리 페이지에서 수정)
    for (const a of await database.assistants.toArray()) expect(a.checklistTemplate.length).toBeGreaterThan(0)
    expect(await database.serviceRequests.count()).toBe(6)
    const tasks = await database.tasks.toArray()
    const files = await database.files.toArray()
    const srCodes = new Set((await database.serviceRequests.toArray()).map((s) => s.code))
    expect(tasks.length).toBeGreaterThanOrEqual(10)
    for (const t of tasks) {
      expect(await database.assistants.get(t.assistantId)).toBeDefined()
      // 대화 1개 = 스레드 1개
      expect(t.threadId).toBeDefined()
      expect((await database.threads.get(t.threadId!))?.taskId).toBe(t.id)
      for (const i of t.inputs) expect(files.some((f) => f.id === i.fileId)).toBe(true)
      for (const id of t.outputFileIds) expect(files.find((f) => f.id === id)?.originTaskId).toBe(t.id)
      for (const tag of t.tags.filter(isSrTag)) expect(srCodes.has(tag)).toBe(true)
    }
    for (const sr of await database.serviceRequests.toArray()) expect(await database.threads.get(sr.threadId)).toBeDefined()
  })

  it('demonstrates newer-version flag and no transitive sharing', async () => {
    const [tasks, files, assistants] = await Promise.all([database.tasks.toArray(), database.files.toArray(), database.assistants.toArray()])
    const fds = tasks.find((t) => t.id === 'task_seed_0002')!
    const selected = sharedPool(fds, tasks, files, assistants).groups.flatMap((g) => g.items).find((i) => i.selected)
    expect(selected?.newerVersionId).toBeDefined()
    // release-2026-10만 가진 CCA 대화에는 CC 초안(WK-0006 출력)이 보이지 않는다
    const cca = tasks.find((t) => t.id === 'task_seed_0009')!
    const visible = sharedPool(cca, tasks, files, assistants).groups.flatMap((g) => g.items.map((i) => i.sourceTask.id))
    expect(visible).toContain('task_seed_0008')
    expect(visible).not.toContain('task_seed_0006')
  })
})

describe('export / import roundtrip', () => {
  it('restores identical row counts and file contents', async () => {
    const bundle = await exportAll(database)
    expect(validateBundle(bundle)).toBe(true)
    const json = JSON.parse(JSON.stringify(bundle))

    const target = new AppDB(`test-target-${Math.random()}`)
    await importAll(json, target)

    expect(await target.users.count()).toBe(await database.users.count())
    expect(await target.tasks.count()).toBe(await database.tasks.count())
    expect(await target.messages.count()).toBe(await database.messages.count())
    const src = (await database.files.toArray())[0]
    if (src) {
      const dst = await target.files.get(src.id)
      expect(dst).toBeDefined()
      expect(await blobToText(dst!.blob)).toBe(await blobToText(src.blob))
    }
  })

  it('upgrades a v1 (package model) backup on import', async () => {
    const bundle = await exportAll(database)
    const tasks = bundle.tables.tasks as Array<Record<string, unknown>>
    const legacyTasks = tasks.map(({ inputs, threadId, titleSource, lastActivityAt, ...t }) => ({
      ...t,
      tags: [],
      inputFileIds: (inputs as Array<{ fileId: string }>).map((i) => i.fileId),
      srIds: t.id === 'task_seed_0010' ? ['sr_seed_0003'] : [],
      activeThreadId: threadId,
      _drop: [titleSource, lastActivityAt],
    }))
    const v1 = JSON.parse(JSON.stringify({ ...bundle, version: 1, tables: { ...bundle.tables, tasks: legacyTasks, packages: [], packageReceipts: [] } }))
    const target = new AppDB(`test-v1-${Math.random()}`)
    await importAll(v1, target)
    const t10 = (await target.tasks.get('task_seed_0010'))!
    expect(t10.tags).toEqual(['SR-2026-0003'])
    expect(t10.threadId).toBeDefined()
    expect((await target.tasks.get('task_seed_0002'))!.inputs[0]).toMatchObject({ weight: 'reference' })
  })

  it('rejects unknown formats', async () => {
    await expect(importAll({ format: 'x' } as never, database)).rejects.toThrow()
  })
})
