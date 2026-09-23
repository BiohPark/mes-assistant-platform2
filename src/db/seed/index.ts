import { db, type AppDB } from '../schema'
import { clearAll } from '../exportImport'
import { SEED_USERS } from './users'
import { SEED_ASSISTANTS, SR_INTAKE_ASSISTANT_ID } from './assistants'
import { buildSeedData } from './data'
import { DEFAULT_LLM_SETTINGS } from '@/domain/types'
import { DEFAULT_USER_ID } from '../repositories/settings'

export async function seedDatabase(database: AppDB = db, now = new Date()): Promise<void> {
  const bundle = buildSeedData(now)
  const tables = [
    database.users,
    database.assistants,
    database.tasks,
    database.threads,
    database.messages,
    database.files,
    database.notes,
    database.serviceRequests,
    database.activity,
    database.notifications,
    database.settings,
  ]
  await database.transaction('rw', tables, async () => {
    await database.users.bulkPut(SEED_USERS)
    await database.assistants.bulkPut(SEED_ASSISTANTS)
    await database.tasks.bulkPut(bundle.tasks)
    await database.threads.bulkPut(bundle.threads)
    await database.messages.bulkPut(bundle.messages)
    await database.files.bulkPut(bundle.files)
    await database.notes.bulkPut(bundle.notes)
    await database.serviceRequests.bulkPut(bundle.serviceRequests)
    await database.activity.bulkPut(bundle.activity)
    await database.notifications.bulkPut(bundle.notifications)
    await database.settings.put({
      id: 'app',
      currentUserId: DEFAULT_USER_ID,
      srIntakeAssistantId: SR_INTAKE_ASSISTANT_ID,
      llm: DEFAULT_LLM_SETTINGS,
    })
  })
}

export async function resetToSeed(database: AppDB = db): Promise<void> {
  await clearAll(database)
  await seedDatabase(database)
}

/** 최초 실행 시 비어 있으면 시드 주입 */
export async function ensureSeeded(database: AppDB = db): Promise<void> {
  if ((await database.users.count()) === 0) await seedDatabase(database)
}
