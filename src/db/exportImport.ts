import { db, TABLE_NAMES, type AppDB, type TableName } from './schema'
import type { FileAsset, Settings } from '@/domain/types'
import { blobToArrayBuffer } from '@/lib/blob'
import { convertLegacy, type LegacyBundle } from './migrations/v3'

/**
 * 3 = 대화 입력·스냅샷 테이블 추가(v4 스키마). 2 = 대화/태그 모델. 1 = 패키지 모델 → 가져올 때 변환.
 * 백업에는 **비밀값과 원격 캐시를 넣지 않는다**: API 키, OpenWebUI 원격 파일 ID(재사용 캐시).
 */
export const BACKUP_VERSION = 3

export interface ExportBundle {
  format: 'mes-assistant-hub'
  version: 1 | 2 | 3
  exportedAt: string
  tables: Record<TableName, unknown[]>
}

/** 백업에서 빼는 값: API 키 */
function withoutSecrets(s: Settings): Settings {
  return { ...s, llm: { ...s.llm, apiKey: '' } }
}

type SerializedFile = Omit<FileAsset, 'blob'> & { blobBase64: string }

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blobToArrayBuffer(blob))
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function exportAll(database: AppDB = db): Promise<ExportBundle> {
  const tables = {} as Record<TableName, unknown[]>
  for (const name of TABLE_NAMES) {
    const rows = await database.table(name).toArray()
    if (name === 'files') {
      tables[name] = await Promise.all(
        // remoteIds: OpenWebUI 재사용 캐시 — 서버·사용자에 묶여 있어 백업하지 않는다
        (rows as FileAsset[]).map(async ({ blob, remoteIds: _cache, ...rest }): Promise<SerializedFile> => ({
          ...rest,
          blobBase64: await blobToBase64(blob),
        })),
      )
    } else if (name === 'settings') {
      tables[name] = (rows as Settings[]).map(withoutSecrets)
    } else {
      tables[name] = rows
    }
  }
  return { format: 'mes-assistant-hub', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }
}

export function validateBundle(input: unknown): input is ExportBundle {
  if (!input || typeof input !== 'object') return false
  const b = input as Partial<ExportBundle>
  return b.format === 'mes-assistant-hub' && (b.version === 1 || b.version === 2 || b.version === 3) && typeof b.tables === 'object' && b.tables !== null
}

/** v1(패키지 모델) 백업의 테이블을 현재 모델로 변환. 패키지 테이블은 버린다(파일은 출처 대화에 남아 있음). */
function upgradeTables(bundle: ExportBundle): Record<TableName, unknown[]> {
  if (bundle.version !== 1) return bundle.tables
  const t = bundle.tables as Record<string, unknown[] | undefined>
  const legacy = {
    tasks: t.tasks ?? [],
    threads: t.threads ?? [],
    assistants: t.assistants ?? [],
    serviceRequests: t.serviceRequests ?? [],
  } as LegacyBundle
  const converted = convertLegacy(legacy)
  return { ...bundle.tables, ...converted }
}

/** 전체 교체 가져오기 */
export async function importAll(bundle: ExportBundle, database: AppDB = db): Promise<void> {
  if (!validateBundle(bundle)) throw new Error('지원하지 않는 파일 형식입니다.')
  const data = upgradeTables(bundle)
  const tables = TABLE_NAMES.map((n) => database.table(n))
  // 이 브라우저의 API 키와 현재 사용자는 유지한다 (백업의 값으로 덮지 않는다)
  const local = await database.settings.get('app')
  await database.transaction('rw', tables, async () => {
    for (const name of TABLE_NAMES) {
      await database.table(name).clear()
      const rows = data[name] ?? []
      if (name === 'settings') {
        const merged = (rows as Settings[]).map((s) =>
          local ? { ...s, currentUserId: local.currentUserId, llm: { ...s.llm, apiKey: local.llm.apiKey } } : withoutSecrets(s),
        )
        await database.table(name).bulkAdd(merged)
      } else if (name === 'files') {
        const files = (rows as SerializedFile[]).map(({ blobBase64, ...rest }) => ({
          ...rest,
          blob: base64ToBlob(blobBase64, rest.mime),
        }))
        await database.table(name).bulkAdd(files)
      } else {
        await database.table(name).bulkAdd(rows)
      }
    }
  })
}

export async function clearAll(database: AppDB = db): Promise<void> {
  const tables = TABLE_NAMES.map((n) => database.table(n))
  await database.transaction('rw', tables, async () => {
    for (const t of tables) await t.clear()
  })
}
