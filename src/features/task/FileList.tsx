import { useState, type ReactNode } from 'react'
import { Download, FileText, File as FileIcon, Image, Link2, Sparkles, Trash2, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FileVersionsDialog } from './FileVersionsDialog'
import { UserAvatar } from '@/components/UserAvatar'
import { useUserMap } from '@/app/hooks'
import { deleteFile, downloadBlob, formatSize } from '@/db/repositories/files'
import type { FileAsset, Task } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface FileListProps {
  files: FileAsset[]
  /** 있으면 산출물 토글/출처 뱃지를 보여준다 */
  task?: Task
  onToggleOutput?: (fileId: string, isOutput: boolean) => void
  onPreview?: (file: FileAsset) => void
  canDelete?: boolean
  dense?: boolean
  /** 행 오른쪽 앞쪽에 끼워 넣는 추가 액션 (입력 선택 토글 등) */
  renderActions?: (file: FileAsset) => ReactNode
}

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return Image
  if (mime.startsWith('text/') || mime.includes('json')) return FileText
  return FileIcon
}

export function FileList({ files, task, onToggleOutput, onPreview, canDelete = true, dense, renderActions }: FileListProps) {
  const users = useUserMap()
  const [deleting, setDeleting] = useState<FileAsset | null>(null)
  const [historyFor, setHistoryFor] = useState<FileAsset | null>(null)

  async function remove() {
    if (!deleting) return
    const r = await deleteFile(deleting.id)
    if (!r.ok) toast.error(r.reason)
    else toast.success('파일을 삭제했습니다.')
  }

  if (files.length === 0) {
    return <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">파일이 없습니다.</div>
  }
  return (
    <>
      <ul className="space-y-1">
        {files.map((f) => {
          const Icon = iconFor(f.mime)
          const isOutput = !!task && task.outputFileIds.includes(f.id)
          const isInput = !!task && task.inputs.some((i) => i.fileId === f.id)
          const fromOther = !!task && f.originTaskId !== task.id
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
                  {f.version > 1 && (
                    <button type="button" className="rounded-full border px-1.5 py-px font-mono hover:bg-muted" title="이전 버전 보기" onClick={() => setHistoryFor(f)}>
                      v{f.version}
                    </button>
                  )}
                  {isOutput && <span className="rounded-full border border-primary/40 px-1.5 py-px text-primary">산출물</span>}
                  {isInput && <span className="rounded-full border px-1.5 py-px">입력</span>}
                  {fromOther && (
                    <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px">
                      <Link2 className="size-2.5" />
                      다른 대화
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {renderActions?.(f)}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                {task && onToggleOutput && !fromOther && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isOutput ? 'secondary' : 'ghost'}
                        size="icon-xs"
                        aria-label={isOutput ? '산출물 해제' : '산출물로 지정'}
                        onClick={() => onToggleOutput(f.id, !isOutput)}
                      >
                        <Tag className={cn(isOutput && 'text-primary')} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isOutput ? '산출물 해제' : '이 업무 산출물로 지정'}</TooltipContent>
                  </Tooltip>
                )}
                <Button variant="ghost" size="icon-xs" aria-label="다운로드" onClick={() => downloadBlob(f.blob, f.name)}>
                  <Download />
                </Button>
                {canDelete && !fromOther && (
                  <Button variant="ghost" size="icon-xs" aria-label="삭제" className="hover:text-destructive" onClick={() => setDeleting(f)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {historyFor && <FileVersionsDialog file={historyFor} onClose={() => setHistoryFor(null)} onPreview={onPreview} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="파일을 삭제할까요?"
        description={deleting ? `${deleting.name} — 산출물 참조에서도 제거됩니다. 다른 대화가 입력으로 쓰는 파일은 삭제할 수 없습니다.` : undefined}
        onConfirm={remove}
      />
    </>
  )
}
