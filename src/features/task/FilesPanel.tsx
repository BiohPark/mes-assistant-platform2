import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActor } from '@/app/hooks'
import { setOutputTag, uploadFile } from '@/db/repositories/files'
import type { FileAsset, StepInstance } from '@/domain/types'
import { FileList } from './FileList'
import { FilePreviewDialog } from './FilePreviewDialog'
import { cn } from '@/lib/utils'

interface FilesPanelProps {
  taskId: string
  files: FileAsset[]
  steps: StepInstance[]
  currentStep?: StepInstance
}

type Filter = 'all' | 'step' | 'outputs'

/** 업무 공유 파일함. 업로드/다운로드/미리보기/단계 산출물 태깅 */
export function FilesPanel({ taskId, files, steps, currentStep }: FilesPanelProps) {
  const actor = useActor()
  const inputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [preview, setPreview] = useState<FileAsset | null>(null)
  const [dragging, setDragging] = useState(false)

  const visible = files.filter((f) => {
    if (filter === 'outputs') return !!f.producedByStepId
    if (filter === 'step' && currentStep) return f.producedByStepId === currentStep.id || currentStep.inputFileIds.includes(f.id)
    return true
  })

  async function handleFiles(list: FileList | null) {
    if (!actor || !list?.length) return
    for (const file of Array.from(list)) {
      await uploadFile(actor, taskId, file, currentStep?.id)
    }
    toast.success(`${list.length}개 파일을 업로드했습니다.`)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1">
        {(
          [
            ['all', '전체'],
            ['step', '이 단계'],
            ['outputs', '산출물'],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn('rounded-full px-2 py-0.5 text-[11px]', filter === k ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
          >
            {label}
          </button>
        ))}
        <Button variant="outline" size="xs" className="ml-auto" onClick={() => inputRef.current?.click()}>
          <Upload data-icon="inline-start" />
          업로드
        </Button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} />
      </div>
      <div
        className={cn('min-h-0 flex-1 overflow-y-auto rounded-lg transition-colors', dragging && 'bg-primary/5 ring-2 ring-primary/40')}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handleFiles(e.dataTransfer.files)
        }}
      >
        <FileList
          files={visible}
          steps={steps}
          currentStep={currentStep}
          onPreview={setPreview}
          onToggleOutput={(fileId, isOutput) => actor && currentStep && setOutputTag(actor, currentStep.id, fileId, isOutput)}
        />
        <p className="mt-2 text-center text-[10px] text-muted-foreground">파일을 끌어다 놓아도 업로드됩니다</p>
      </div>
      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
