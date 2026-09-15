import { ArrowRightToLine, Sparkles } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { useActor } from '@/app/hooks'
import { setInputFiles } from '@/db/repositories/files'
import { deriveInputCandidates } from '@/domain/fileHandoff'
import type { FileAsset, StepInstance } from '@/domain/types'
import { cn } from '@/lib/utils'

interface InputFilePickerProps {
  steps: StepInstance[]
  step: StepInstance
  files: FileAsset[]
}

/** 이전 단계 산출물을 이 단계의 입력으로 선택. 사용자가 넣고 뺄 수 있다. */
export function InputFilePicker({ steps, step, files }: InputFilePickerProps) {
  const actor = useActor()
  const candidates = deriveInputCandidates(steps, step, files)
  const stepById = new Map(steps.map((s) => [s.id, s]))

  async function toggle(fileId: string, on: boolean) {
    if (!actor) return
    const next = on ? [...step.inputFileIds, fileId] : step.inputFileIds.filter((id) => id !== fileId)
    await setInputFiles(actor, step.id, next)
  }

  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1 text-xs font-semibold">
        <ArrowRightToLine className="size-3.5" />
        입력 파일
        <span className="font-normal text-muted-foreground">{step.inputFileIds.length}개 선택</span>
      </h3>
      {step.inputSpec.length > 0 && (
        <p className="mb-1.5 text-[10px] text-muted-foreground">기대 입력: {step.inputSpec.join(', ')}</p>
      )}
      {candidates.length === 0 ? (
        <p className="rounded-lg border border-dashed p-2 text-[11px] text-muted-foreground">
          이전 단계 산출물이나 업로드 파일이 없습니다. 파일함에서 업로드하세요.
        </p>
      ) : (
        <ul className="space-y-1">
          {candidates.map((c) => {
            const from = c.fromStepId ? stepById.get(c.fromStepId) : undefined
            return (
              <li key={c.file.id} className={cn('flex items-start gap-2 rounded-md border px-2 py-1.5', c.selected ? 'border-primary/40 bg-primary/5' : 'bg-card')}>
                <Checkbox checked={c.selected} onCheckedChange={(v) => void toggle(c.file.id, v === true)} className="mt-0.5" id={`in-${c.file.id}`} />
                <label htmlFor={`in-${c.file.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block truncate text-xs">{c.file.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {from ? (
                      <>
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: from.color }} />
                        {from.name} 산출물
                      </>
                    ) : (
                      '업로드 파일'
                    )}
                    {c.recommended && (
                      <span className="inline-flex items-center gap-0.5 text-violet-600">
                        <Sparkles className="size-2.5" />
                        추천
                      </span>
                    )}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
