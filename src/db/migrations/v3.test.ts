// @vitest-environment node
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'
import { AppDB } from '../schema'
import { SEED_ASSISTANTS } from '../seed/assistants'
import { LEGACY_LEVEL1 } from './v3'

/** v2(패키지 모델) 스키마로 만든 DB를 AppDB(v3)로 열면 upgrade 훅이 변환한다 */
async function createLegacyDb(name: string): Promise<void> {
  const old = new Dexie(name)
  old.version(1).stores({
    users: 'id',
    assistants: 'id, status, level1, ownerId',
    tasks: 'id, code, assistantId, status, ownerId, *srIds',
    threads: 'id, taskId, srId',
    messages: 'id, threadId, createdAt',
    files: 'id, originTaskId, originSrId',
    notes: 'id, taskId',
    packages: 'id, code, fromTaskId, fromAssistantId, status',
    packageReceipts: 'id, packageId, taskId, [packageId+taskId]',
    serviceRequests: 'id, code, requesterId, status',
    activity: 'id, taskId, assistantId, srId, packageId, userId, at, type',
    settings: 'id',
  })
  old.version(2).stores({ notifications: 'id, userId, read, at' })
  await old.open()
  const at = '2026-09-01T00:00:00.000Z'
  await old.table('assistants').bulkAdd([
    { id: 'et-urs-assistant', name: 'URS 작성 도우미', level1: 'ET 개발', level2: 'URS', summary: '', ownerId: 'u1', status: 'working', usageExample: '', checklistTemplate: [], color: '#000', createdBy: 'u1', createdAt: at, updatedAt: at },
  ])
  await old.table('serviceRequests').add({ id: 'sr1', code: 'SR-2026-0001', requesterId: 'u2', title: '요청', body: '', status: 'submitted', attachmentIds: [], threadId: 'th_sr', results: [], createdAt: at, updatedAt: at })
  await old.table('tasks').add({
    id: 't1', code: 'WK-2026-0001', assistantId: 'et-urs-assistant', title: 'URS', summary: '', status: 'in_progress', ownerId: 'u1', assigneeIds: [], priority: 'normal',
    tags: ['ET'], checklist: [], inputFileIds: ['f1'], outputFileIds: [], srIds: ['sr1'], activeThreadId: 'th1', createdAt: at, createdBy: 'u1',
  })
  await old.table('threads').bulkAdd([
    { id: 'th1', taskId: 't1', title: '스레드 1', createdAt: at, createdBy: 'u1', archived: false },
    { id: 'th2', taskId: 't1', title: '스레드 2', createdAt: '2026-09-02T00:00:00.000Z', createdBy: 'u1', archived: false },
  ])
  await old.table('packages').add({ id: 'p1', code: 'PKG-1', fromTaskId: 't1', fromAssistantId: 'et-urs-assistant', status: 'open' })
  old.close()
}

describe('Dexie v3 upgrade', () => {
  it('converts a v2 package-model database in place', async () => {
    const name = `legacy-${Math.random()}`
    await createLegacyDb(name)
    const db = new AppDB(name)
    await db.open()

    const t1 = (await db.tasks.get('t1'))!
    expect(t1.tags).toEqual(['ET', 'SR-2026-0001'])
    expect(t1.inputs).toMatchObject([{ fileId: 'f1', weight: 'reference' }])
    expect(t1.threadId).toBe('th1')
    // 두 번째 스레드는 같은 태그를 가진 별도 대화로 분리
    const split = (await db.tasks.get('t1_split1'))!
    expect(split).toMatchObject({ code: 'WK-2026-0001-2', threadId: 'th2', tags: ['ET', 'SR-2026-0001'] })
    expect((await db.threads.get('th2'))!.taskId).toBe('t1_split1')
    // 태그 인덱스로 조회 가능
    expect((await db.tasks.where('tags').equals('SR-2026-0001').toArray()).map((t) => t.id).sort()).toEqual(['t1', 't1_split1'])

    const legacy = (await db.assistants.get('et-urs-assistant'))!
    expect(legacy).toMatchObject({ status: 'developing', level1: LEGACY_LEVEL1 })
    expect(await db.assistants.count()).toBe(SEED_ASSISTANTS.length + 1)
    expect((await db.serviceRequests.get('sr1'))!.titleSource).toBe('manual')
    expect(db.tables.map((t) => t.name)).not.toContain('packages')
    db.close()
  })
})
