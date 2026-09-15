import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { FileAsset, ID } from '@/domain/types'

export async function uploadFile(actor: Actor, taskId: ID, file: File, stepId?: ID): Promise<FileAsset> {
  const asset: FileAsset = {
    id: newId('file'),
    taskId,
    name: file.name,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    uploadedBy: actor.userId,
    uploadedAt: nowIso(),
    source: 'upload',
    tags: [],
    version: 1,
  }
  await db.transaction('rw', db.files, db.activity, async () => {
    await db.files.add(asset)
    await logActivity(actor, taskId, 'file.uploaded', { name: file.name }, stepId)
  })
  return asset
}

/** assistant 응답을 텍스트/마크다운 산출물 파일로 저장하고 단계 output에 태깅 */
export async function saveAssistantOutput(
  actor: Actor,
  taskId: ID,
  stepId: ID,
  name: string,
  content: string,
): Promise<FileAsset> {
  const blob = new Blob([content], { type: 'text/markdown' })
  const asset: FileAsset = {
    id: newId('file'),
    taskId,
    name,
    mime: 'text/markdown',
    size: blob.size,
    blob,
    uploadedBy: actor.userId,
    uploadedAt: nowIso(),
    source: 'assistant',
    producedByStepId: stepId,
    tags: ['산출물'],
    version: 1,
  }
  await db.transaction('rw', db.files, db.steps, db.activity, async () => {
    await db.files.add(asset)
    const step = await db.steps.get(stepId)
    if (step) await db.steps.put({ ...step, outputFileIds: [...step.outputFileIds, asset.id] })
    await logActivity(actor, taskId, 'file.tagged_output', { name }, stepId)
  })
  return asset
}

export async function setOutputTag(actor: Actor, stepId: ID, fileId: ID, isOutput: boolean): Promise<void> {
  await db.transaction('rw', db.files, db.steps, db.activity, async () => {
    const step = await db.steps.get(stepId)
    const file = await db.files.get(fileId)
    if (!step || !file) return
    const outputFileIds = isOutput
      ? Array.from(new Set([...step.outputFileIds, fileId]))
      : step.outputFileIds.filter((id) => id !== fileId)
    await db.steps.put({ ...step, outputFileIds })
    await db.files.put({ ...file, producedByStepId: isOutput ? stepId : undefined })
    if (isOutput) await logActivity(actor, step.taskId, 'file.tagged_output', { name: file.name }, stepId)
  })
}

export async function setInputFiles(actor: Actor, stepId: ID, inputFileIds: ID[]): Promise<void> {
  await db.transaction('rw', db.steps, db.activity, async () => {
    const step = await db.steps.get(stepId)
    if (!step) return
    await db.steps.put({ ...step, inputFileIds })
    await logActivity(actor, step.taskId, 'file.selected_input', { count: inputFileIds.length }, stepId)
  })
}

export async function deleteFile(fileId: ID): Promise<void> {
  await db.transaction('rw', db.files, db.steps, async () => {
    const file = await db.files.get(fileId)
    if (!file) return
    const steps = await db.steps.where('taskId').equals(file.taskId).toArray()
    for (const s of steps) {
      if (s.inputFileIds.includes(fileId) || s.outputFileIds.includes(fileId)) {
        await db.steps.put({
          ...s,
          inputFileIds: s.inputFileIds.filter((id) => id !== fileId),
          outputFileIds: s.outputFileIds.filter((id) => id !== fileId),
        })
      }
    }
    await db.files.delete(fileId)
  })
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const TEXT_MIME = /^(text\/|application\/(json|xml|x-yaml))/
export function isTextFile(file: FileAsset): boolean {
  return TEXT_MIME.test(file.mime) || /\.(md|txt|csv|json|sql|xml|yaml|yml)$/i.test(file.name)
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
