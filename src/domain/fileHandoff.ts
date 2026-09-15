import type { FileAsset, ID, StepInstance } from './types'

export interface InputCandidate {
  file: FileAsset
  /** 이 파일을 산출한 이전 단계. 업로드 파일이면 undefined */
  fromStepId?: ID
  recommended: boolean
  selected: boolean
}

/**
 * 현재 단계의 입력 후보를 계산한다.
 * 이전 단계 산출물(최근 단계 우선) → 일반 업로드 파일 순.
 * 현재 단계 이후에 만들어진 산출물은 제외한다.
 */
export function deriveInputCandidates(
  steps: StepInstance[],
  current: StepInstance,
  files: FileAsset[],
): InputCandidate[] {
  const previous = steps.filter((s) => s.order < current.order).sort((a, b) => b.order - a.order)
  const selected = new Set(current.inputFileIds)
  const byId = new Map(files.map((f) => [f.id, f]))
  const seen = new Set<ID>()
  const out: InputCandidate[] = []

  for (const step of previous) {
    for (const fid of step.outputFileIds) {
      const file = byId.get(fid)
      if (!file || seen.has(fid)) continue
      seen.add(fid)
      out.push({ file, fromStepId: step.id, recommended: true, selected: selected.has(fid) })
    }
  }
  for (const file of files) {
    if (seen.has(file.id) || file.producedByStepId) continue
    seen.add(file.id)
    out.push({ file, recommended: false, selected: selected.has(file.id) })
  }
  return out
}
