import { db } from '../schema'
import { DEFAULT_LLM_SETTINGS, type ID, type LlmSettings, type Settings } from '@/domain/types'

export const DEFAULT_USER_ID = 'u_so'

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

export async function setSrIntakeAssistant(assistantId: ID | undefined): Promise<void> {
  if (assistantId) {
    const a = await db.assistants.get(assistantId)
    if (!a) throw new Error('어시스턴트를 찾을 수 없습니다.')
    if (a.status === 'retired') throw new Error('폐기된 어시스턴트는 접수 도우미로 지정할 수 없습니다.')
  }
  const s = await getSettings()
  await db.settings.put({ ...s, srIntakeAssistantId: assistantId })
}
