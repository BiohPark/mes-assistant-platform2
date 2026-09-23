import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import type { Assistant } from '@/domain/types'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

interface ImageDropzoneProps {
  assistant?: Pick<Assistant, 'name' | 'color' | 'imageId'>
  /** File = 새 이미지, null = 이미지 제거 */
  onChange: (file: File | null) => void
}

export function ImageDropzone({ assistant, onChange }: ImageDropzoneProps) {
  const [preview, setPreview] = useState<string>()
  const [removed, setRemoved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
  }, [preview])

  function pick(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('2MB 이하 이미지만 가능합니다.')
      return
    }
    setPreview(URL.createObjectURL(file))
    setRemoved(false)
    onChange(file)
  }

  function clear() {
    setPreview(undefined)
    setRemoved(true)
    onChange(null)
  }

  const showAvatar = assistant && !removed && !preview
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pick(e.dataTransfer.files[0])
        }}
      >
        {preview ? (
          <img src={preview} alt="미리보기" className="size-full object-cover" />
        ) : showAvatar ? (
          <AssistantAvatar assistant={removed ? { ...assistant, imageId: undefined } : assistant} size="lg" className="size-full rounded-none" />
        ) : (
          <span className="px-2 text-center text-[11px] text-muted-foreground">이미지를 끌어다 놓거나 업로드</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <Upload data-icon="inline-start" />
          업로드
        </Button>
        {(preview || (assistant?.imageId && !removed)) && (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            <X data-icon="inline-start" />
            이니셜로
          </Button>
        )}
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  )
}
