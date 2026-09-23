import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { FileAsset, ID, Task } from '@/domain/types'

export type FileOrigin = { taskId: ID; srId?: undefined } | { srId: ID; taskId?: undefined }

/** 같은 origin·같은 이름의 최신 파일 (버전 체인의 머리) */
async function latestVersion(origin: FileOrigin, name: string): Promise<FileAsset | undefined> {
  const siblings = origin.taskId
    ? await db.files.where('originTaskId').equals(origin.taskId).toArray()
    : origin.srId
      ? await db.files.where('originSrId').equals(origin.srId).toArray()
      : []
  return siblings.filter((f) => f.name === name).sort((a, b) => b.version - a.version)[0]
}

/** 버전 체인: 최신 → 과거 순 */
export async function fileVersions(fileId: ID): Promise<FileAsset[]> {
  const out: FileAsset[] = []
  let cur = await db.files.get(fileId)
  const seen = new Set<ID>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.push(cur)
    cur = cur.previousId ? await db.files.get(cur.previousId) : undefined
  }
  return out
}

export async function uploadFile(actor: Actor, origin: FileOrigin, file: File): Promise<FileAsset> {
  return db.transaction('rw', db.files, db.activity, async () => {
    const prev = await latestVersion(origin, file.name)
    const asset: FileAsset = {
      id: newId('file'),
      originTaskId: origin.taskId,
      originSrId: origin.srId,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      blob: file,
      uploadedBy: actor.userId,
      uploadedAt: nowIso(),
      source: origin.srId ? 'sr' : 'upload',
      tags: [],
      version: prev ? prev.version + 1 : 1,
      previousId: prev?.id,
    }
    await db.files.add(asset)
    await logActivity(actor, { taskId: origin.taskId, srId: origin.srId }, 'file.uploaded', { name: file.name, version: asset.version })
    return asset
  })
}

/**
 * assistant 응답을 markdown 산출물로 저장하고 업무 output에 태깅.
 * 같은 이름이 있으면 새 버전을 만들고 산출물 태그를 최신 버전으로 옮긴다.
 */
export async function saveAssistantOutput(actor: Actor, taskId: ID, name: string, content: string): Promise<FileAsset> {
  const blob = new Blob([content], { type: 'text/markdown' })
  return db.transaction('rw', db.files, db.tasks, db.activity, async () => {
    const prev = await latestVersion({ taskId }, name)
    const asset: FileAsset = {
      id: newId('file'),
      originTaskId: taskId,
      name,
      mime: 'text/markdown',
      size: blob.size,
      blob,
      uploadedBy: actor.userId,
      uploadedAt: nowIso(),
      source: 'assistant',
      tags: ['산출물'],
      version: prev ? prev.version + 1 : 1,
      previousId: prev?.id,
    }
    await db.files.add(asset)
    const task = await db.tasks.get(taskId)
    if (task) {
      const outputFileIds = [...task.outputFileIds.filter((id) => id !== prev?.id), asset.id]
      await db.tasks.put({ ...task, outputFileIds })
    }
    await logActivity(actor, { taskId }, 'file.tagged_output', { name, version: asset.version })
    return asset
  })
}

export async function setOutputTag(actor: Actor, taskId: ID, fileId: ID, isOutput: boolean): Promise<void> {
  await db.transaction('rw', db.tasks, db.files, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const file = await db.files.get(fileId)
    if (!task || !file) return
    const outputFileIds = isOutput
      ? Array.from(new Set([...task.outputFileIds, fileId]))
      : task.outputFileIds.filter((id) => id !== fileId)
    await db.tasks.put({ ...task, outputFileIds })
    if (isOutput) await logActivity(actor, { taskId }, 'file.tagged_output', { name: file.name })
  })
}

/** 파일 삭제. 다른 대화가 입력으로 선택한 파일은 거부(전송 기록·선택 무결성). */
export async function deleteFile(fileId: ID): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction('rw', db.files, db.tasks, async () => {
    const all = await db.tasks.toArray()
    const file = await db.files.get(fileId)
    const usedBy = all.filter((t) => t.id !== file?.originTaskId && t.inputs.some((i) => i.fileId === fileId))
    if (usedBy.length) return { ok: false, reason: `${usedBy.map((t) => t.code).join(', ')}에서 입력으로 사용 중인 파일은 삭제할 수 없습니다.` }
    for (const t of all.filter((t) => t.inputs.some((i) => i.fileId === fileId) || t.outputFileIds.includes(fileId))) {
      await db.tasks.put({ ...t, inputs: t.inputs.filter((i) => i.fileId !== fileId), outputFileIds: t.outputFileIds.filter((id) => id !== fileId) })
    }
    await db.files.delete(fileId)
    return { ok: true }
  })
}

/** 업무 화면에서 보이는 자기 파일 + 선택한 입력 파일 (공유 자료함은 domain/tags.sharedPool) */
export async function filesForTask(task: Task): Promise<FileAsset[]> {
  const own = await db.files.where('originTaskId').equals(task.id).toArray()
  const ownIds = new Set(own.map((f) => f.id))
  const refIds = [...new Set([...task.inputs.map((i) => i.fileId), ...task.outputFileIds])].filter((id) => !ownIds.has(id))
  const referenced = (await db.files.bulkGet(refIds)).filter((f): f is FileAsset => !!f)
  return [...own, ...referenced].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
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
