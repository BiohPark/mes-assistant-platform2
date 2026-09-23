// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/db/schema'
import { deliverFiles, remoteKey, usesFilesApi } from './openwebuiFiles'
import type { FileAsset, LlmSettings } from '@/domain/types'

const settings: LlmSettings = { mode: 'live', baseUrl: 'http://owui.test/api', apiKey: 'k', model: 'm', fileDelivery: 'openwebui' }
const asset = (id: string): FileAsset => ({
  id,
  name: `${id}.md`,
  mime: 'text/markdown',
  size: 3,
  blob: new Blob(['abc'], { type: 'text/markdown' }),
  uploadedBy: 'u',
  uploadedAt: '',
  source: 'upload',
  tags: [],
  version: 1,
})

beforeEach(async () => {
  await db.files.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('usesFilesApi', () => {
  it('only in live mode with openwebui delivery', () => {
    expect(usesFilesApi(settings)).toBe(true)
    expect(usesFilesApi({ ...settings, mode: 'mock' })).toBe(false)
    expect(usesFilesApi({ ...settings, fileDelivery: 'inline' })).toBe(false)
    expect(usesFilesApi({ ...settings, fileDelivery: undefined })).toBe(false)
  })
})

describe('deliverFiles', () => {
  it('uploads to /api/v1/files/ with the key, caches the remote id, and reuses it', async () => {
    const f = asset('f1')
    await db.files.add(f)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'remote-1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await deliverFiles(settings, [f])
    expect(first.attached.get('f1')).toEqual({ type: 'file', id: 'remote-1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://owui.test/api/v1/files/')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')

    const stored = (await db.files.get('f1'))!
    expect(stored.remoteIds?.[remoteKey(settings)]).toBe('remote-1')
    await deliverFiles(settings, [stored])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports failures so the caller can inline instead', async () => {
    const f = asset('f2')
    await db.files.add(f)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const r = await deliverFiles(settings, [f])
    expect(r.attached.size).toBe(0)
    expect(r.failed).toEqual([{ file: f, reason: 'HTTP 500' }])
  })
})
