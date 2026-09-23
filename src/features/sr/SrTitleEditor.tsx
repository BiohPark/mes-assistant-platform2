import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActor, useCurrentUser } from '@/app/hooks'
import { setSrTitle } from '@/db/repositories/sr'
import type { ServiceRequest } from '@/domain/types'

/** 접수된 SR 제목: 요청자 본인 또는 System Owner만 고칠 수 있고, 고친 제목은 AI가 다시 덮어쓰지 않는다. */
export function SrTitleEditor({ sr, className }: { sr: ServiceRequest; className?: string }) {
  const actor = useActor()
  const me = useCurrentUser()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(sr.title)
  const canEdit = !!me && (me.id === sr.requesterId || !!me.isSystemOwner)

  async function commit() {
    setEditing(false)
    if (!actor || !title.trim() || title.trim() === sr.title) {
      setTitle(sr.title)
      return
    }
    try {
      await setSrTitle(actor, sr.id, title)
      toast.success('제목을 수정했습니다.')
    } catch (e) {
      setTitle(sr.title)
      toast.error(e instanceof Error ? e.message : '수정하지 못했습니다.')
    }
  }

  if (editing) {
    return (
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit()
          if (e.key === 'Escape') {
            setTitle(sr.title)
            setEditing(false)
          }
        }}
        autoFocus
        aria-label="SR 제목"
        className="h-7 min-w-48 flex-1 text-sm"
      />
    )
  }
  return (
    <span className={className ?? 'inline-flex items-center gap-1 text-sm font-medium'}>
      {sr.title}
      {sr.titleSource === 'ai' && <Sparkles className="size-3 text-violet-500" aria-label="AI 제목" />}
      {canEdit && (
        <Button size="icon-xs" variant="ghost" aria-label="제목 수정" onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
      )}
    </span>
  )
}
