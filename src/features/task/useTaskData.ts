import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { filesForTask } from '@/db/repositories/files'
import { loadConversationInputs, type LoadedConversationInput } from '@/db/repositories/conversationInputs'
import { conversationCandidates, eligibleMessages, type ConversationCandidate } from '@/domain/conversationContext'
import { byteLength } from '@/domain/requestBudget'
import { isSrTag, sharedPool, type SharedPool } from '@/domain/tags'
import type { ActivityLog, Assistant, FileAsset, Note, ServiceRequest, Task } from '@/domain/types'

/** 같은 태그 대화 후보 + 전달될 원문 규모 */
export interface CandidateRow extends ConversationCandidate {
  /** 전달 가능한 메시지 수 (완료된 사용자·assistant 발화) */
  messageCount: number
  /** 전체 원문 크기(대략) */
  bytes: number
}

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
  /** 태그를 직접 공유하는 다른 대화 — 이동 링크와 참조 대화 후보에 함께 쓴다 (최근 활동순) */
  related: CandidateRow[]
  /** AI 입력으로 고른 참조 대화 (선택 시점 스냅샷) */
  conversationInputs: LoadedConversationInput[]
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
    const [files, notes, activity, allTasks, allFiles, assistants, linkedSrs, conversationInputs] = await Promise.all([
      filesForTask(task),
      db.notes.where('taskId').equals(taskId).sortBy('createdAt'),
      db.activity.where('taskId').equals(taskId).sortBy('at'),
      db.tasks.toArray(),
      db.files.toArray(),
      db.assistants.toArray(),
      srCodes.length ? db.serviceRequests.where('code').anyOf(srCodes).toArray() : Promise.resolve([] as ServiceRequest[]),
      loadConversationInputs(taskId),
    ])
    const srFileIds = linkedSrs.flatMap((s) => s.attachmentIds)
    const srFiles = allFiles.filter((f) => srFileIds.includes(f.id))
    const candidates = conversationCandidates(task, allTasks, assistants)
    const threadIds = candidates.map((c) => c.task.threadId).filter((id): id is string => !!id)
    const messages = threadIds.length ? await db.messages.where('threadId').anyOf(threadIds).toArray() : []
    const related = candidates.map((c): CandidateRow => {
      const eligible = eligibleMessages(messages.filter((m) => m.threadId === c.task.threadId))
      return { ...c, messageCount: eligible.length, bytes: eligible.reduce((n, m) => n + byteLength(m.content), 0) }
    })
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
      conversationInputs,
    }
  }, [taskId])
}
