import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { createThread } from './chat'
import { nextCode, startConversation } from './tasks'
import { notify } from './notifications'
import { SR_STATUS_LABEL } from '@/lib/labels'
import { newId, nowIso } from '@/lib/ids'
import type { ID, ServiceRequest, SharedResult, SrStatus, Task } from '@/domain/types'

/** 새 대화 시작 = draft SR + 스레드. 접수자는 대화만 하다가 나중에 접수로 전환한다. */
export async function startSrConversation(actor: Actor): Promise<ServiceRequest> {
  const id = newId('sr')
  const thread = await createThread(actor, { srId: id }, '접수 대화')
  const at = nowIso()
  const sr: ServiceRequest = {
    id,
    code: '',
    requesterId: actor.userId,
    title: '',
    titleSource: 'default',
    body: '',
    status: 'draft',
    attachmentIds: [],
    threadId: thread.id,
    results: [],
    createdAt: at,
    updatedAt: at,
  }
  await db.transaction('rw', db.serviceRequests, db.activity, async () => {
    await db.serviceRequests.add(sr)
    await logActivity(actor, { srId: id }, 'sr.created')
  })
  return sr
}

export interface SubmitSrInput {
  title: string
  /** AI 제안 그대로면 'ai', 사람이 고쳤으면 'manual' */
  titleSource: ServiceRequest['titleSource']
  body: string
  attachmentIds: ID[]
}

/** 명시적 접수: 코드 부여 + 제목/본문 확정 + submitted. 일반 답변으로 접수를 추정하지 않는다. */
export async function submitSr(actor: Actor, srId: ID, input: SubmitSrInput): Promise<ServiceRequest> {
  const { title, titleSource, body, attachmentIds } = input
  if (!title.trim()) throw new Error('제목을 입력하세요.')
  return db.transaction('rw', db.serviceRequests, db.activity, db.settings, db.assistants, db.notifications, async () => {
    const cur = await db.serviceRequests.get(srId)
    if (!cur) throw new Error('요청을 찾을 수 없습니다.')
    const code = cur.code || (await nextCode('SR', (await db.serviceRequests.toArray()).map((s) => s.code)))
    const at = nowIso()
    const next: ServiceRequest = { ...cur, code, title: title.trim(), titleSource, body, attachmentIds, status: 'submitted', submittedAt: at, updatedAt: at }
    await db.serviceRequests.put(next)
    await logActivity(actor, { srId }, 'sr.submitted', { code })
    // 접수 에이전트 담당자에게 알림
    const settings = await db.settings.get('app')
    const intake = settings?.srIntakeAssistantId ? await db.assistants.get(settings.srIntakeAssistantId) : undefined
    if (intake) await notify({ userIds: [intake.ownerId], exceptUserId: actor.userId, title: 'SR이 접수되었습니다', body: `${code} ${next.title}`, link: '/sr/manage' })
    return next
  })
}

/** 제목 수정: 요청자 본인 또는 System Owner. 사람이 고친 제목은 이후 AI가 덮어쓰지 않는다. */
export async function setSrTitle(actor: Actor, srId: ID, title: string): Promise<void> {
  const [cur, user] = await Promise.all([db.serviceRequests.get(srId), db.users.get(actor.userId)])
  if (!cur || !title.trim()) return
  if (cur.requesterId !== actor.userId && !user?.isSystemOwner) throw new Error('요청자 또는 System Owner만 제목을 수정할 수 있습니다.')
  await db.serviceRequests.put({ ...cur, title: title.trim(), titleSource: 'manual', updatedAt: nowIso() })
}

/** SR 태그를 가진 진행 중 대화 (연결 업무 시작 시 이어가기 후보) */
export async function conversationsForSr(srCode: string): Promise<Task[]> {
  if (!srCode) return []
  return db.tasks.where('tags').equals(srCode).toArray()
}

/** SR에서 연결 업무 시작: 선택한 에이전트로 새 대화를 만들고 SR 태그를 자동 부여한다. */
export async function startTaskFromSr(actor: Actor, srId: ID, assistantId: ID): Promise<Task> {
  const sr = await db.serviceRequests.get(srId)
  if (!sr || !sr.code) throw new Error('접수된 SR에서만 연결 업무를 시작할 수 있습니다.')
  const { task } = await startConversation(actor, { assistantId, tags: [sr.code], title: sr.title, titleSource: 'default', inputFileIds: [] })
  await logActivity(actor, { srId, taskId: task.id, assistantId }, 'sr.task_started', { code: sr.code, taskCode: task.code })
  if (sr.status === 'submitted' || sr.status === 'reviewing') await setSrStatus(actor, srId, 'in_progress')
  return task
}

/** 검토 전(draft/submitted)까지만 접수자가 내용을 고칠 수 있다 */
export async function updateSrContent(srId: ID, patch: Pick<ServiceRequest, 'title' | 'body' | 'attachmentIds'> & Partial<Pick<ServiceRequest, 'titleSource'>>): Promise<void> {
  const cur = await db.serviceRequests.get(srId)
  if (!cur || (cur.status !== 'draft' && cur.status !== 'submitted')) return
  await db.serviceRequests.put({ ...cur, ...patch, updatedAt: nowIso() })
}

export async function setSrStatus(actor: Actor, srId: ID, status: SrStatus): Promise<void> {
  await db.transaction('rw', db.serviceRequests, db.activity, db.notifications, async () => {
    const cur = await db.serviceRequests.get(srId)
    if (!cur || cur.status === status) return
    await db.serviceRequests.put({ ...cur, status, updatedAt: nowIso() })
    await logActivity(actor, { srId }, 'sr.status_changed', { from: cur.status, to: status })
    await notify({
      userIds: [cur.requesterId],
      exceptUserId: actor.userId,
      title: `SR 상태가 '${SR_STATUS_LABEL[status]}'(으)로 바뀌었습니다`,
      body: `${cur.code} ${cur.title}`,
      link: '/sr',
    })
  })
}

export async function deleteDraftSr(srId: ID): Promise<void> {
  await db.transaction('rw', db.serviceRequests, db.threads, db.messages, db.files, async () => {
    const cur = await db.serviceRequests.get(srId)
    if (!cur || cur.status !== 'draft') return
    await db.messages.where('threadId').equals(cur.threadId).delete()
    await db.threads.delete(cur.threadId)
    await db.files.where('originSrId').equals(srId).delete()
    await db.serviceRequests.delete(srId)
  })
}

export interface ShareInput {
  srId: ID
  taskId?: ID
  text: string
  fileIds: ID[]
}

/** 담당자가 요청자에게 결과를 공유한다. 상태는 'responded'로, 요청자에게 알림. */
export async function shareSrResult(actor: Actor, input: ShareInput): Promise<SharedResult> {
  if (!input.text.trim() && input.fileIds.length === 0) throw new Error('공유할 내용이나 파일을 입력하세요.')
  return db.transaction('rw', db.serviceRequests, db.activity, db.notifications, async () => {
    const cur = await db.serviceRequests.get(input.srId)
    if (!cur) throw new Error('SR을 찾을 수 없습니다.')
    if (cur.status === 'draft') throw new Error('접수되지 않은 요청에는 결과를 공유할 수 없습니다.')
    const result: SharedResult = { id: newId('shr'), taskId: input.taskId, text: input.text.trim(), fileIds: [...input.fileIds], by: actor.userId, at: nowIso() }
    const status: SrStatus = cur.status === 'done' || cur.status === 'rejected' ? cur.status : 'responded'
    await db.serviceRequests.put({ ...cur, results: [...cur.results, result], status, updatedAt: result.at })
    await logActivity(actor, { srId: cur.id, taskId: input.taskId }, 'sr.result_shared', { code: cur.code, files: result.fileIds.length })
    if (status !== cur.status) await logActivity(actor, { srId: cur.id }, 'sr.status_changed', { from: cur.status, to: status })
    await notify({ userIds: [cur.requesterId], exceptUserId: actor.userId, title: '요청 결과가 공유되었습니다', body: `${cur.code} ${cur.title}`, link: '/sr' })
    return result
  })
}
