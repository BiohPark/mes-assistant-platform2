import { useRef, useState } from 'react'
import { Paperclip, Send, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface ComposerProps {
  disabled?: boolean
  streaming: boolean
  placeholder?: string
  onSend: (text: string, files: File[]) => Promise<void>
  onStop: () => void
  suggestions?: string[]
  allowAttachments?: boolean
  onTyping?: () => void
}

export function Composer({ disabled, streaming, placeholder, onSend, onStop, suggestions, allowAttachments = true, onTyping }: ComposerProps) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const canSend = !disabled && !streaming && (text.trim().length > 0 || pending.length > 0)

  async function submit() {
    if (!canSend) return
    const t = text
    const f = pending
    setText('')
    setPending([])
    try {
      await onSend(t, f)
    } catch (e) {
      // 전송 실패 시 입력을 복구해 메시지가 사라지지 않게 한다
      setText(t)
      setPending(f)
      toast.error('전송에 실패했습니다.', { description: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div className="border-t bg-card p-2.5">
      {suggestions && suggestions.length > 0 && text === '' && !streaming && (
        <div className="mb-2 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText(s)}
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {pending.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px]">
              <Paperclip className="size-3" />
              {f.name}
              <button type="button" aria-label="첨부 제거" onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/40">
        {allowAttachments && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="파일 첨부" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <Paperclip />
          </Button>
        )}
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => setPending((p) => [...p, ...Array.from(e.target.files ?? [])])} />
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value) onTyping?.()
          }}
          placeholder={placeholder ?? 'assistant에게 요청하세요. Enter 전송, Shift+Enter 줄바꿈'}
          rows={1}
          disabled={disabled}
          className="max-h-40 min-h-8 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        {streaming ? (
          <Button type="button" variant="outline" size="icon-sm" aria-label="중지" onClick={onStop}>
            <Square className="size-3.5" />
          </Button>
        ) : (
          <Button type="button" size="icon-sm" aria-label="전송" onClick={() => void submit()} disabled={!canSend}>
            <Send />
          </Button>
        )}
      </div>
    </div>
  )
}
