import { db, type AppDB } from '../schema'
import { clearAll } from '../exportImport'
import { SEED_USERS } from './users'
import { SEED_TEMPLATES } from './templates'
import { buildSeedTasks } from './tasks'
import { DEFAULT_LLM_SETTINGS } from '@/domain/types'
import { DEFAULT_USER_ID } from '../repositories/settings'

export async function seedDatabase(database: AppDB = db, now = new Date()): Promise<void> {
  const bundle = buildSeedTasks(now)
  const tables = [
    database.users,
    database.templates,
    database.tasks,
    database.steps,
    database.threads,
    database.messages,
    database.files,
    database.notes,
    database.activity,
    database.settings,
  ]
  await database.transaction('rw', tables, async () => {
    await database.users.bulkPut(SEED_USERS)
    await database.templates.bulkPut(SEED_TEMPLATES)
    await database.tasks.bulkPut(bundle.tasks)
    await database.steps.bulkPut(bundle.steps)
    await database.threads.bulkPut(bundle.threads)
    await database.messages.bulkPut(bundle.messages)
    await database.files.bulkPut(bundle.files)
    await database.notes.bulkPut(bundle.notes)
    await database.activity.bulkPut(bundle.activity)
    await database.settings.put({ id: 'app', currentUserId: DEFAULT_USER_ID, llm: DEFAULT_LLM_SETTINGS })
  })
}

export async function resetToSeed(database: AppDB = db): Promise<void> {
  await clearAll(database)
  await seedDatabase(database)
}

/** 최초 실행 시 비어 있으면 시드 주입 */
export async function ensureSeeded(database: AppDB = db): Promise<void> {
  const count = await database.users.count()
  if (count === 0) await seedDatabase(database)
}
