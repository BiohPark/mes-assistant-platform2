import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { filesForTask } from '@/db/repositories/files'
import { isSrTag, sharedPool, type SharedPool } from '@/domain/tags'
import type { ActivityLog, Assistant, FileAsset, Note, ServiceRequest, Task } from '@/domain/types'

export interface TaskData {
  task: Task
  assistant: Assistant
  /** 이 대화의 파일 + 선택한 입력 파일 (메시지 첨부 표시용) */
  files: FileAsset[]
  notes: Note[]
  activity: ActivityLog[]
  /** 대화 SR 태그로 찾은 SR */
  linkedSrs: ServiceRequest[]
  /** 연결 SR의 첨부 (요청자가 올린 자료) */
  srFiles: FileAsset[]
  /** 태그로 발견되는 공유 자료함 (발견 ≠ 사용) */
  pool: SharedPool
  /** 태그를 공유하는 다른 대화 (직접 겹침만) */
  related: Array<{ task: Task; assistant?: Assistant; viaTags: string[] }>
}

/** 대화 화면에 필요한 데이터를 한 번에 구독 */
export function useTaskData(taskId: string | undefined): TaskData | null | undefined {
  return useLiveQuery(async () => {
    if (!taskId) return null
    const task = await db.tasks.get(taskId)
    if (!task) return null
    const assistant = await db.assistants.get(task.assistantId)
    if (!assistant) return null
    const srCodes = task.tags.filter(isSrTag)
    const [files, notes, activity, allTasks, allFiles, assistants, linkedSrs] = await Promise.all([
      filesForTask(task),
      db.notes.where('taskId').equals(taskId).sortBy('createdAt'),
      db.activity.where('taskId').equals(taskId).sortBy('at'),
      db.tasks.toArray(),
      db.files.toArray(),
      db.assistants.toArray(),
      srCodes.length ? db.serviceRequests.where('code').anyOf(srCodes).toArray() : Promise.resolve([] as ServiceRequest[]),
    ])
    const srFileIds = linkedSrs.flatMap((s) => s.attachmentIds)
    const srFiles = allFiles.filter((f) => srFileIds.includes(f.id))
    const asstById = new Map(assistants.map((a) => [a.id, a]))
    const myKeys = new Set(task.tags.map((t) => t.toLowerCase()))
    const related = allTasks
      .filter((t) => t.id !== task.id)
      .map((t) => ({ task: t, assistant: asstById.get(t.assistantId), viaTags: t.tags.filter((x) => myKeys.has(x.toLowerCase())) }))
      .filter((r) => r.viaTags.length > 0)
      .sort((a, b) => (a.assistant?.order ?? 0) - (b.assistant?.order ?? 0) || b.task.lastActivityAt.localeCompare(a.task.lastActivityAt))
    return {
      task,
      assistant,
      files,
      notes: notes.reverse(),
      activity: activity.reverse(),
      linkedSrs,
      srFiles,
      pool: sharedPool(task, allTasks, allFiles, assistants),
      related,
    }
  }, [taskId])
}
