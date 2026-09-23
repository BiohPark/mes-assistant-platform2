import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { downloadBlob, formatSize, isTextFile } from '@/db/repositories/files'
import { blobToText } from '@/lib/blob'
import type { FileAsset } from '@/domain/types'

interface FilePreviewDialogProps {
  file: FileAsset | null
  onClose: () => void
}

/** 파일이 바뀌면 key로 내용을 다시 읽는다 */
function PreviewBody({ file }: { file: FileAsset }) {
  const [text, setText] = useState<string | null>(null)
  const imgUrl = useMemo(() => (file.mime.startsWith('image/') ? URL.createObjectURL(file.blob) : null), [file])

  useEffect(() => {
    if (!isTextFile(file)) return
    let alive = true
    void blobToText(file.blob).then((t) => alive && setText(t))
    return () => {
      alive = false
    }
  }, [file])
  useEffect(() => () => {
    if (imgUrl) URL.revokeObjectURL(imgUrl)
  }, [imgUrl])

  if (text !== null) return file.name.endsWith('.md') ? <Markdown content={text} /> : <pre className="text-xs whitespace-pre-wrap">{text}</pre>
  if (imgUrl) return <img src={imgUrl} alt={file.name} className="max-w-full" />
  if (isTextFile(file)) return <div className="py-8 text-center text-xs text-muted-foreground">불러오는 중…</div>
  return <div className="py-8 text-center text-xs text-muted-foreground">미리보기를 지원하지 않는 형식입니다. 다운로드해서 확인하세요.</div>
}

export function FilePreviewDialog({ file, onClose }: FilePreviewDialogProps) {
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{file?.name}</DialogTitle>
          <DialogDescription>
            {file?.mime} · {file ? formatSize(file.size) : ''}
            {file && file.version > 1 ? ` · v${file.version}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-3">{file && <PreviewBody key={file.id} file={file} />}</div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => file && downloadBlob(file.blob, file.name)}>
            <Download data-icon="inline-start" />
            다운로드
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
