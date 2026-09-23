import type { Transaction } from 'dexie'
import type { Assistant, AssistantStatus, ServiceRequest, Task, TaskInput, Thread } from '@/domain/types'
import { SEED_ASSISTANTS } from '../seed/assistants'

/** v2 이전 레코드 모양 (필요한 필드만) */
type LegacyTask = Omit<Task, 'inputs' | 'threadId' | 'titleSource' | 'lastActivityAt'> & {
  inputFileIds?: string[]
  srIds?: string[]
  activeThreadId?: string
  inputs?: TaskInput[]
  threadId?: string
  titleSource?: Task['titleSource']
  lastActivityAt?: string
}
type LegacyAssistant = Omit<Assistant, 'order' | 'expectedInputs' | 'expectedOutputs' | 'status'> & {
  status: AssistantStatus | 'working'
  order?: number
  expectedInputs?: string[]
  expectedOutputs?: string[]
}
type LegacySr = Omit<ServiceRequest, 'titleSource'> & { titleSource?: ServiceRequest['titleSource'] }

export interface LegacyBundle {
  tasks: LegacyTask[]
  threads: Thread[]
  assistants: LegacyAssistant[]
  serviceRequests: LegacySr[]
}

export interface ConvertedBundle {
  tasks: Task[]
  threads: Thread[]
  assistants: Assistant[]
  serviceRequests: ServiceRequest[]
}

export const LEGACY_LEVEL1 = '이전 데모'

/**
 * v2 → v3 순수 변환 (Dexie upgrade와 v1 백업 가져오기에서 공용).
 * - srIds → SR 코드 태그, inputFileIds → 참고 입력
 * - 한 업무의 여러 스레드 → 스레드별 업무로 분리 (첫 스레드는 원 업무 유지)
 * - 'working' → 'developing', 순서 부여, 기존 어시스턴트는 '이전 데모' 분류, 기본 카탈로그 중 없는 것만 추가
 */
export function convertLegacy(b: LegacyBundle): ConvertedBundle {
  const srCode = new Map(b.serviceRequests.map((s) => [s.id, s.code]))
  const catalogIds = new Set(SEED_ASSISTANTS.map((a) => a.id))

  const tasks: Task[] = []
  const threads: Thread[] = [...b.threads]
  for (const t of b.tasks) {
    const { inputFileIds, srIds, activeThreadId, ...rest } = t
    const srTags = (srIds ?? []).map((id) => srCode.get(id)).filter((c): c is string => !!c)
    const own = b.threads.filter((th) => th.taskId === t.id).sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    const primary = t.threadId ?? activeThreadId ?? own[0]?.id
    const base: Task = {
      ...rest,
      titleSource: t.titleSource ?? 'manual',
      tags: Array.from(new Set([...(t.tags ?? []), ...srTags])),
      inputs: t.inputs ?? (inputFileIds ?? []).map((fileId) => ({ fileId, weight: 'reference' as const, selectedAt: t.createdAt, selectedBy: t.createdBy })),
      threadId: primary,
      lastActivityAt: t.lastActivityAt ?? t.completedAt ?? t.startedAt ?? t.createdAt,
    }
    tasks.push(base)
    // 나머지 스레드는 같은 태그를 가진 별도 대화로 분리 → 자료는 태그로 계속 공유된다
    own
      .filter((th) => th.id !== primary)
      .forEach((th, i) => {
        const id = `${t.id}_split${i + 1}`
        tasks.push({ ...base, id, code: `${t.code}-${i + 2}`, title: `${t.title} · ${th.title}`, inputs: [], outputFileIds: [], threadId: th.id, createdAt: th.createdAt, lastActivityAt: th.createdAt })
        const idx = threads.findIndex((x) => x.id === th.id)
        threads[idx] = { ...th, taskId: id }
      })
  }

  const legacy = b.assistants.filter((a) => !catalogIds.has(a.id))
  const assistants: Assistant[] = [
    ...SEED_ASSISTANTS.filter((c) => !b.assistants.some((a) => a.id === c.id)),
    ...b.assistants
      .filter((a) => catalogIds.has(a.id))
      .map((a) => ({ ...a, status: a.status === 'working' ? 'developing' : a.status, order: a.order ?? SEED_ASSISTANTS.find((c) => c.id === a.id)!.order, expectedInputs: a.expectedInputs ?? [], expectedOutputs: a.expectedOutputs ?? [] }) as Assistant),
    ...legacy.map(
      (a, i): Assistant => ({
        ...a,
        status: a.status === 'working' ? 'developing' : a.status,
        level1: LEGACY_LEVEL1,
        order: a.order ?? 1000 + i,
        expectedInputs: a.expectedInputs ?? [],
        expectedOutputs: a.expectedOutputs ?? [],
      }),
    ),
  ]

  const serviceRequests = b.serviceRequests.map((s): ServiceRequest => ({ ...s, titleSource: s.titleSource ?? (s.title ? 'manual' : 'default') }))
  return { tasks, threads, assistants, serviceRequests }
}

/** Dexie v3 upgrade 훅 */
export async function migrateToConversationHub(tx: Transaction): Promise<void> {
  const bundle: LegacyBundle = {
    tasks: await tx.table('tasks').toArray(),
    threads: await tx.table('threads').toArray(),
    assistants: await tx.table('assistants').toArray(),
    serviceRequests: await tx.table('serviceRequests').toArray(),
  }
  // 빈 DB(신규 설치)는 시드가 채운다
  if (bundle.tasks.length === 0 && bundle.assistants.length === 0) return
  const out = convertLegacy(bundle)
  await tx.table('tasks').clear()
  await tx.table('tasks').bulkAdd(out.tasks)
  await tx.table('threads').bulkPut(out.threads)
  await tx.table('assistants').clear()
  await tx.table('assistants').bulkAdd(out.assistants)
  await tx.table('serviceRequests').bulkPut(out.serviceRequests)
}
