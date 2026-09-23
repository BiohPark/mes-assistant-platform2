import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import { pickColor } from '@/lib/colors'
import type { Assistant, AssistantStatus, ChecklistTemplateItem, FileAsset, ID } from '@/domain/types'

export interface AssistantInput {
  id: string
  name: string
  level1: string
  level2: string
  summary: string
  docUrl?: string
  modelId?: string
  link1?: string
  expectedInputs?: string[]
  expectedOutputs?: string[]
  ownerId: ID
  status: AssistantStatus
  usageExample: string
  systemPromptHint?: string
  checklistTemplate: ChecklistTemplateItem[]
}

const INTAKE_GUARD_MSG = 'SR 접수 에이전트로 지정된 에이전트입니다. 설정에서 다른 접수 에이전트를 먼저 지정하세요.'

async function isIntakeAssistant(id: ID): Promise<boolean> {
  const s = await db.settings.get('app')
  return s?.srIntakeAssistantId === id
}

export function newChecklistTemplateItem(label: string, required = false): ChecklistTemplateItem {
  return { id: newId('ct'), label, required }
}

export async function createAssistant(actor: Actor, input: AssistantInput): Promise<Assistant> {
  const id = input.id.trim()
  if (!id) throw new Error('어시스턴트 ID(모델 ID)는 필수입니다.')
  if (await db.assistants.get(id)) throw new Error(`이미 존재하는 ID입니다: ${id}`)
  const at = nowIso()
  const order = ((await db.assistants.orderBy('order').last())?.order ?? 0) + 1
  const assistant: Assistant = { expectedInputs: [], expectedOutputs: [], ...input, id, order, color: pickColor(id), createdBy: actor.userId, createdAt: at, updatedAt: at }
  await db.transaction('rw', db.assistants, db.activity, async () => {
    await db.assistants.add(assistant)
    await logActivity(actor, { assistantId: id }, 'assistant.created', { name: assistant.name })
  })
  return assistant
}

export async function updateAssistant(actor: Actor, id: ID, patch: Partial<Omit<AssistantInput, 'id'>>): Promise<void> {
  if (patch.status === 'retired' && (await isIntakeAssistant(id))) throw new Error(INTAKE_GUARD_MSG)
  await db.transaction('rw', db.assistants, db.activity, async () => {
    const cur = await db.assistants.get(id)
    if (!cur) return
    await db.assistants.put({ ...cur, ...patch, updatedAt: nowIso() })
    await logActivity(actor, { assistantId: id }, 'assistant.updated', { fields: Object.keys(patch) })
  })
}

export async function setAssistantStatus(actor: Actor, id: ID, status: AssistantStatus): Promise<void> {
  if (status === 'retired' && (await isIntakeAssistant(id))) throw new Error(INTAKE_GUARD_MSG)
  await db.transaction('rw', db.assistants, db.activity, async () => {
    const cur = await db.assistants.get(id)
    if (!cur || cur.status === status) return
    await db.assistants.put({ ...cur, status, updatedAt: nowIso() })
    await logActivity(actor, { assistantId: id }, 'assistant.status_changed', { from: cur.status, to: status })
  })
}

/** 카드 이미지 교체. 이전 이미지 파일은 삭제한다. null이면 이니셜로 복귀. */
export async function setAssistantImage(actor: Actor, id: ID, image: File | null): Promise<void> {
  await db.transaction('rw', db.assistants, db.files, db.activity, async () => {
    const cur = await db.assistants.get(id)
    if (!cur) return
    if (cur.imageId) await db.files.delete(cur.imageId)
    let imageId: ID | undefined
    if (image) {
      const asset: FileAsset = {
        id: newId('img'),
        name: image.name,
        mime: image.type || 'image/png',
        size: image.size,
        blob: image,
        uploadedBy: actor.userId,
        uploadedAt: nowIso(),
        source: 'upload',
        tags: ['assistant-image'],
        version: 1,
      }
      await db.files.add(asset)
      imageId = asset.id
    }
    await db.assistants.put({ ...cur, imageId, updatedAt: nowIso() })
    await logActivity(actor, { assistantId: id }, 'assistant.updated', { fields: ['image'] })
  })
}

/** 업무가 하나도 없는 어시스턴트만 삭제. 있으면 retired 상태로 바꾸라고 안내. */
export async function deleteAssistant(id: ID): Promise<{ ok: boolean; reason?: string }> {
  if (await isIntakeAssistant(id)) return { ok: false, reason: INTAKE_GUARD_MSG }
  return db.transaction('rw', db.assistants, db.tasks, db.files, async () => {
    const count = await db.tasks.where('assistantId').equals(id).count()
    if (count > 0) return { ok: false, reason: `업무 ${count}건이 연결되어 있어 삭제할 수 없습니다. 상태를 '폐기'로 변경하세요.` }
    const cur = await db.assistants.get(id)
    if (cur?.imageId) await db.files.delete(cur.imageId)
    await db.assistants.delete(id)
    return { ok: true }
  })
}

/**
 * 공통 순서 저장 (SO 편집 모드의 드래그 결과). 전달받지 않은 에이전트는 기존 순서를 유지한 채 뒤에 둔다.
 */
export async function reorderAssistants(actor: Actor, orderedIds: ID[]): Promise<void> {
  await db.transaction('rw', db.assistants, db.users, db.activity, async () => {
    const user = await db.users.get(actor.userId)
    if (!user?.isSystemOwner) throw new Error('System Owner만 순서를 바꿀 수 있습니다.')
    const all = await db.assistants.orderBy('order').toArray()
    const rest = all.filter((a) => !orderedIds.includes(a.id)).map((a) => a.id)
    const ids = [...orderedIds.filter((id) => all.some((a) => a.id === id)), ...rest]
    const at = nowIso()
    await db.assistants.bulkPut(ids.map((id, i) => ({ ...all.find((a) => a.id === id)!, order: i + 1, updatedAt: at })))
    await logActivity(actor, {}, 'assistant.reordered', { count: ids.length })
  })
}
