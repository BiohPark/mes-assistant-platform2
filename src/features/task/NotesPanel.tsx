import { useRef, useState } from 'react'
import { Paperclip, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/UserAvatar'
import { Markdown } from '@/components/Markdown'
import { useActor, useUserMap } from '@/app/hooks'
import { addNote, deleteNote } from '@/db/repositories/notes'
import { downloadBlob, uploadFile } from '@/db/repositories/files'
import type { FileAsset, Note } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'

interface NotesPanelProps {
  taskId: string
  notes: Note[]
  files: FileAsset[]
  placeholder?: string
}

export function NotesPanel({ taskId, notes, files, placeholder }: NotesPanelProps) {
  const actor = useActor()
  const users = useUserMap()
  const [text, setText] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const fileById = new Map(files.map((f) => [f.id, f]))

  async function submit() {
    if (!actor || (!text.trim() && pending.length === 0)) return
    const uploaded = await Promise.all(pending.map((f) => uploadFile(actor, { taskId }, f)))
    await addNote(actor, taskId, text.trim() || `(첨부 ${uploaded.length}건)`, uploaded.map((f) => f.id))
    setText('')
    setPending([])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {notes.length === 0 && <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">메모가 없습니다.</div>}
        {notes.map((n) => {
          const author = users.get(n.authorId)
          return (
            <div key={n.id} className="group rounded-lg border bg-card p-2">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <UserAvatar user={author} size="xs" />
                <span className="font-medium text-foreground">{author?.name}</span>
                <span>{formatDateTime(n.createdAt)}</span>
                <button
                  type="button"
                  aria-label="메모 삭제"
                  className="ml-auto invisible hover:text-destructive group-hover:visible group-focus-within:visible [@media(hover:none)]:visible"
                  onClick={() => deleteNote(n.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
              <Markdown content={n.content} className="text-xs" />
              {n.attachmentIds.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {n.attachmentIds.map((id) => {
                    const f = fileById.get(id)
                    if (!f) return null
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => downloadBlob(f.blob, f.name)}
                        className="inline-flex max-w-full items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] hover:bg-muted"
                      >
                        <Paperclip className="size-2.5" />
                        <span className="truncate">{f.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <form
        className="mt-2 rounded-lg border bg-card p-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? '메모를 남기세요 (마크다운 지원)'}
          rows={2}
          className="min-h-0 resize-none border-0 bg-transparent p-1 text-xs shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
          }}
        />
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1 pb-1">
            {pending.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]">
                {f.name}
                <button type="button" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} aria-label="첨부 제거">
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon-xs" aria-label="첨부" onClick={() => inputRef.current?.click()}>
            <Paperclip />
          </Button>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => setPending((p) => [...p, ...Array.from(e.target.files ?? [])])} />
          <Button type="submit" size="xs" disabled={!actor}>
            <Send data-icon="inline-start" />
            남기기
          </Button>
        </div>
      </form>
    </div>
  )
}
