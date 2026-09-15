// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { AppDB } from './schema'
import { seedDatabase } from './seed'
import { exportAll, importAll, validateBundle } from './exportImport'
import { blobToText } from '@/lib/blob'

let database: AppDB

beforeEach(async () => {
  database = new AppDB(`test-${Math.random()}`)
  await seedDatabase(database, new Date('2026-09-16T09:00:00.000Z'))
})

describe('seed', () => {
  it('creates users, templates and tasks with consistent step references', async () => {
    expect(await database.users.count()).toBe(5)
    expect(await database.templates.count()).toBe(3)
    const tasks = await database.tasks.toArray()
    expect(tasks.length).toBeGreaterThanOrEqual(10)
    for (const t of tasks) {
      const step = await database.steps.get(t.currentStepId)
      expect(step?.taskId).toBe(t.id)
    }
  })

  it('every output file id referenced by a step exists', async () => {
    const steps = await database.steps.toArray()
    for (const s of steps) {
      for (const fid of s.outputFileIds) expect(await database.files.get(fid)).toBeDefined()
    }
  })
})

describe('export / import roundtrip', () => {
  it('restores identical row counts and file contents', async () => {
    const bundle = await exportAll(database)
    expect(validateBundle(bundle)).toBe(true)
    const json = JSON.parse(JSON.stringify(bundle))

    const target = new AppDB(`test-target-${Math.random()}`)
    await importAll(json, target)

    expect(await target.tasks.count()).toBe(await database.tasks.count())
    expect(await target.messages.count()).toBe(await database.messages.count())
    const src = (await database.files.toArray())[0]
    const dst = await target.files.get(src.id)
    expect(dst).toBeDefined()
    expect(await blobToText(dst!.blob)).toBe(await blobToText(src.blob))
  })

  it('rejects unknown formats', async () => {
    await expect(importAll({ format: 'x' } as never, database)).rejects.toThrow()
  })
})
