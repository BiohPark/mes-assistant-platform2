import { describe, it, expect } from 'vitest'
import { deriveInputCandidates } from './fileHandoff'
import type { FileAsset, StepInstance } from './types'

function step(over: Partial<StepInstance>): StepInstance {
  return {
    id: 's',
    taskId: 't1',
    templateStepId: 'x',
    key: 'URS',
    order: 0,
    name: '',
    description: '',
    mode: 'assistant',
    inputSpec: [],
    outputSpec: [],
    status: 'pending',
    checklist: [],
    inputFileIds: [],
    outputFileIds: [],
    color: '',
    ...over,
  }
}
function file(id: string, over: Partial<FileAsset> = {}): FileAsset {
  return {
    id,
    taskId: 't1',
    name: id,
    mime: 'text/plain',
    size: 1,
    blob: new Blob(['x']),
    uploadedBy: 'u1',
    uploadedAt: '',
    source: 'upload',
    tags: [],
    version: 1,
    ...over,
  }
}

describe('deriveInputCandidates', () => {
  const s0 = step({ id: 's0', order: 0, outputFileIds: ['f-urs'] })
  const s1 = step({ id: 's1', order: 1, outputFileIds: ['f-fds'] })
  const s2 = step({ id: 's2', order: 2 })
  const files = [
    file('f-urs', { source: 'assistant', producedByStepId: 's0' }),
    file('f-fds', { source: 'assistant', producedByStepId: 's1' }),
    file('f-upload'),
    file('f-later', { producedByStepId: 's2' }),
  ]

  it('ranks previous step outputs first (most recent step first), then plain uploads', () => {
    const result = deriveInputCandidates([s0, s1, s2], s2, files)
    expect(result.map((c) => c.file.id)).toEqual(['f-fds', 'f-urs', 'f-upload'])
    expect(result[0].fromStepId).toBe('s1')
    expect(result[0].recommended).toBe(true)
    expect(result[2].recommended).toBe(false)
  })

  it('excludes files produced by the step itself', () => {
    const result = deriveInputCandidates([s0, s1, s2], s2, files)
    expect(result.find((c) => c.file.id === 'f-later')).toBeUndefined()
  })

  it('marks already-selected inputs', () => {
    const current = step({ id: 's2', order: 2, inputFileIds: ['f-urs'] })
    const result = deriveInputCandidates([s0, s1, current], current, files)
    expect(result.find((c) => c.file.id === 'f-urs')?.selected).toBe(true)
  })
})
