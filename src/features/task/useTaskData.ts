import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { ActivityLog, FileAsset, Note, StepInstance, Task, WorkflowTemplate } from '@/domain/types'

export interface TaskData {
  task: Task
  steps: StepInstance[]
  template?: WorkflowTemplate
  files: FileAsset[]
  notes: Note[]
  activity: ActivityLog[]
}

/** 업무 상세 화면에 필요한 데이터를 한 번에 구독 */
export function useTaskData(taskId: string | undefined): TaskData | null | undefined {
  return useLiveQuery(async () => {
    if (!taskId) return null
    const task = await db.tasks.get(taskId)
    if (!task) return null
    const [steps, template, files, notes, activity] = await Promise.all([
      db.steps.where('taskId').equals(taskId).sortBy('order'),
      db.templates.get(task.templateId),
      db.files.where('taskId').equals(taskId).sortBy('uploadedAt'),
      db.notes.where('taskId').equals(taskId).sortBy('createdAt'),
      db.activity.where('taskId').equals(taskId).sortBy('at'),
    ])
    return { task, steps, template, files, notes: notes.reverse(), activity: activity.reverse() }
  }, [taskId])
}
