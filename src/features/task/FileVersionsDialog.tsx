import { useLiveQuery } from 'dexie-react-hooks'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserAvatar } from '@/components/UserAvatar'
import { useUserMap } from '@/app/hooks'
import { downloadBlob, fileVersions, formatSize } from '@/db/repositories/files'
import type { FileAsset } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'

interface FileVersionsDialogProps {
  file: FileAsset
  onClose: () => void
  onPreview?: (file: FileAsset) => void
}

/** 같은 이름으로 다시 저장된 파일의 버전 체인 (최신 → 과거) */
export function FileVersionsDialog({ file, onClose, onPreview }: FileVersionsDialogProps) {
  const users = useUserMap()
  const versions = useLiveQuery(() => fileVersions(file.id), [file.id]) ?? []
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{file.name} 버전</DialogTitle>
          <DialogDescription>같은 이름으로 다시 저장할 때마다 새 버전이 생깁니다. 패키지는 발행 당시 버전을 고정합니다.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
              <span className="w-8 font-mono font-medium">v{v.version}</span>
              <UserAvatar user={users.get(v.uploadedBy)} size="xs" />
              <span className="text-muted-foreground">{formatDateTime(v.uploadedAt)}</span>
              <span className="text-muted-foreground">· {formatSize(v.size)}</span>
              <span className="ml-auto flex gap-0.5">
                {onPreview && (
                  <Button size="xs" variant="ghost" onClick={() => onPreview(v)}>
                    보기
                  </Button>
                )}
                <Button size="icon-xs" variant="ghost" aria-label="다운로드" onClick={() => downloadBlob(v.blob, v.name)}>
                  <Download />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
