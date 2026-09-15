import { useEffect, useState } from 'react'
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

export function FilePreviewDialog({ file, onClose }: FilePreviewDialogProps) {
  const [text, setText] = useState<string | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)

  useEffect(() => {
    setText(null)
    setImgUrl(null)
    if (!file) return
    if (isTextFile(file)) {
      void blobToText(file.blob).then(setText)
      return
    }
    if (file.mime.startsWith('image/')) {
      const url = URL.createObjectURL(file.blob)
      setImgUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [file])

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{file?.name}</DialogTitle>
          <DialogDescription>
            {file?.mime} · {file ? formatSize(file.size) : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-3">
          {text !== null ? (
            file?.name.endsWith('.md') ? (
              <Markdown content={text} />
            ) : (
              <pre className="text-xs whitespace-pre-wrap">{text}</pre>
            )
          ) : imgUrl ? (
            <img src={imgUrl} alt={file?.name} className="max-w-full" />
          ) : (
            <div className="py-8 text-center text-xs text-muted-foreground">미리보기를 지원하지 않는 형식입니다. 다운로드해서 확인하세요.</div>
          )}
        </div>
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
