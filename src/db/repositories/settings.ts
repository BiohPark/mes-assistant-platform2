import { db } from '../schema'
import { DEFAULT_LLM_SETTINGS, type ID, type LlmSettings, type Settings } from '@/domain/types'

export const DEFAULT_USER_ID = 'u_park'

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app')
  return s ?? { id: 'app', currentUserId: DEFAULT_USER_ID, llm: DEFAULT_LLM_SETTINGS }
}

export async function setCurrentUser(userId: ID): Promise<void> {
  const s = await getSettings()
  await db.settings.put({ ...s, currentUserId: userId })
}

export async function setLlmSettings(llm: LlmSettings): Promise<void> {
  const s = await getSettings()
  await db.settings.put({ ...s, llm })
}
