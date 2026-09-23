import { db } from '@/db/schema'
import { openWebUiBase } from '@/lib/links'
import type { FileAsset, LlmSettings } from '@/domain/types'

/** chat/completions 요청의 files 파라미터 (OpenWebUI 확장) */
export interface AttachedFile {
  type: 'file'
  id: string
}

export interface FileDeliveryResult {
  attached: Map<string, AttachedFile>
  /** 올리지 못해 텍스트 인라인으로 대신한 파일과 사유 */
  failed: Array<{ file: FileAsset; reason: string }>
}

/** 원격 ID 캐시 키: 서버가 바뀌면 다시 올린다 */
export function remoteKey(settings: Pick<LlmSettings, 'baseUrl'>): string {
  return openWebUiBase(settings.baseUrl)
}

export function usesFilesApi(settings: LlmSettings): boolean {
  return settings.mode === 'live' && settings.fileDelivery === 'openwebui'
}

/** OpenWebUI Files API 업로드: POST {root}/api/v1/files/ (multipart) → { id } */
export async function uploadToOpenWebUi(settings: LlmSettings, file: FileAsset): Promise<string> {
  const form = new FormData()
  form.append('file', new File([file.blob], file.name, { type: file.mime || 'application/octet-stream' }))
  const headers: Record<string, string> = {}
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`
  const res = await fetch(`${remoteKey(settings)}/api/v1/files/`, { method: 'POST', headers, body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as { id?: unknown }
  if (typeof body.id !== 'string' || !body.id) throw new Error('응답에 파일 ID가 없습니다')
  return body.id
}

/**
 * 선택한 입력 파일을 OpenWebUI에 올리고(이미 올린 버전은 재사용) 첨부 목록을 만든다.
 * 실패한 파일은 failed로 돌려 호출 측이 텍스트 인라인으로 대신하게 한다.
 */
export async function deliverFiles(settings: LlmSettings, files: FileAsset[]): Promise<FileDeliveryResult> {
  const key = remoteKey(settings)
  const attached = new Map<string, AttachedFile>()
  const failed: FileDeliveryResult['failed'] = []
  for (const file of files) {
    const cached = file.remoteIds?.[key]
    if (cached) {
      attached.set(file.id, { type: 'file', id: cached })
      continue
    }
    try {
      const remoteId = await uploadToOpenWebUi(settings, file)
      await db.files.update(file.id, { remoteIds: { ...file.remoteIds, [key]: remoteId } })
      attached.set(file.id, { type: 'file', id: remoteId })
    } catch (e) {
      failed.push({ file, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return { attached, failed }
}
