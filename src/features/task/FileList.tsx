import { Download, FileText, File as FileIcon, Image, Sparkles, Trash2, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserAvatar } from '@/components/UserAvatar'
import { useUserMap } from '@/app/hooks'
import { deleteFile, downloadBlob, formatSize } from '@/db/repositories/files'
import type { FileAsset, StepInstance } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface FileListProps {
  files: FileAsset[]
  steps: StepInstance[]
  /** 현재 단계. 있으면 산출물 토글 버튼을 보여준다 */
  currentStep?: StepInstance
  onToggleOutput?: (fileId: string, isOutput: boolean) => void
  onPreview?: (file: FileAsset) => void
  dense?: boolean
}

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return Image
  if (mime.startsWith('text/') || mime.includes('json')) return FileText
  return FileIcon
}

export function FileList({ files, steps, currentStep, onToggleOutput, onPreview, dense }: FileListProps) {
  const users = useUserMap()
  const stepById = new Map(steps.map((s) => [s.id, s]))
  if (files.length === 0) {
    return <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">파일이 없습니다.</div>
  }
  return (
    <ul className="space-y-1">
      {files.map((f) => {
        const Icon = iconFor(f.mime)
        const producer = f.producedByStepId ? stepById.get(f.producedByStepId) : undefined
        const isOutputOfCurrent = !!currentStep && currentStep.outputFileIds.includes(f.id)
        return (
          <li key={f.id} className={cn('group flex items-start gap-2 rounded-lg border bg-card px-2 py-1.5', dense && 'py-1')}>
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <button type="button" className="block max-w-full truncate text-left text-xs font-medium hover:underline" onClick={() => onPreview?.(f)} title={f.name}>
                {f.name}
              </button>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{formatSize(f.size)}</span>
                <span>·</span>
                <UserAvatar user={users.get(f.uploadedBy)} size="xs" />
                <span>{formatDateTime(f.uploadedAt)}</span>
                {f.source === 'assistant' && (
                  <span className="inline-flex items-center gap-0.5 text-violet-600">
                    <Sparkles className="size-2.5" />
                    assistant
                  </span>
                )}
                {producer && (
                  <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px" style={{ borderColor: producer.color }}>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: producer.color }} />
                    {producer.name} 산출물
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100">
              {currentStep && onToggleOutput && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isOutputOfCurrent ? 'secondary' : 'ghost'}
                      size="icon-xs"
                      aria-label={isOutputOfCurrent ? '산출물 해제' : '이 단계 산출물로 지정'}
                      onClick={() => onToggleOutput(f.id, !isOutputOfCurrent)}
                    >
                      <Tag className={cn(isOutputOfCurrent && 'text-primary')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isOutputOfCurrent ? '이 단계 산출물 해제' : '이 단계 산출물로 지정'}</TooltipContent>
                </Tooltip>
              )}
              <Button variant="ghost" size="icon-xs" aria-label="다운로드" onClick={() => downloadBlob(f.blob, f.name)}>
                <Download />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label="삭제" className="hover:text-destructive" onClick={() => deleteFile(f.id)}>
                <Trash2 />
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
