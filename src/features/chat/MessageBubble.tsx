import { Bot, Copy, FileDown, FileJson, MessagesSquare, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { UserAvatar } from '@/components/UserAvatar'
import { useUserMap } from '@/app/hooks'
import { downloadBlob } from '@/db/repositories/files'
import type { FileAsset, Message } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'

interface MessageBubbleProps {
  message: Message
  files: Map<string, FileAsset>
  assistantName?: string
  onSaveAsOutput?: (message: Message) => void
}

export function MessageBubble({ message, files, assistantName, onSaveAsOutput }: MessageBubbleProps) {
  const users = useUserMap()
  const isUser = message.role === 'user'
  const author = message.authorId ? users.get(message.authorId) : undefined
  const streaming = message.status === 'streaming'
  const isDiscussion = message.kind === 'discussion'

  return (
    <div className={cn('group flex gap-2.5', isUser && 'flex-row-reverse')}>
      {isUser ? (
        <UserAvatar user={author} size="sm" className="mt-1" />
      ) : (
        <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white">
          <Bot className="size-3.5" />
        </span>
      )}
      <div className={cn('flex max-w-[85%] min-w-0 flex-col gap-1', isUser && 'items-end')}>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-medium text-foreground">{isUser ? (author?.name ?? '사용자') : (assistantName ?? 'Assistant')}</span>
          <span>{formatDateTime(message.createdAt)}</span>
          {isDiscussion && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[9px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <MessagesSquare className="size-2.5" />
              팀 의견 · AI 미전송
            </span>
          )}
        </div>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5',
            isUser && !isDiscussion && 'rounded-tr-sm bg-primary text-primary-foreground',
            isUser && isDiscussion && 'rounded-tr-sm border border-dashed border-amber-300 bg-amber-50/60 dark:bg-amber-950/30',
            !isUser && 'rounded-tl-sm border bg-card',
            message.status === 'error' && 'border-destructive/40 bg-destructive/5',
          )}
        >
          {message.content ? (
            <Markdown content={message.content} className={cn(isUser && !isDiscussion && '[&_a]:text-primary-foreground [&_code]:bg-white/20')} />
          ) : streaming ? (
            <span className="inline-flex gap-1 py-1">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </span>
          ) : null}
          {streaming && message.content && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground/60 align-middle" />}
        </div>
        {message.attachmentIds.length > 0 && (
          <div className={cn('flex flex-wrap gap-1', isUser && 'justify-end')}>
            {message.attachmentIds.map((id) => {
              const f = files.get(id)
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[10px]">
                  <Paperclip className="size-2.5" />
                  {f?.name ?? '(삭제된 파일)'}
                </span>
              )
            })}
          </div>
        )}
        {!isUser && !streaming && message.content && (
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void copyText(message.content).then((ok) => (ok ? toast.success('복사했습니다.') : toast.error('클립보드를 사용할 수 없습니다.')))}
            >
              <Copy data-icon="inline-start" />
              복사
            </Button>
            {onSaveAsOutput && (
              <Button variant="ghost" size="xs" onClick={() => onSaveAsOutput(message)}>
                <FileDown data-icon="inline-start" />
                산출물로 저장
              </Button>
            )}
            {message.requestSnapshot && (
              <Button
                variant="ghost"
                size="xs"
                title="이 응답을 만들 때 실제로 전송한 요청 본문(JSON)"
                onClick={() => downloadBlob(new Blob([message.requestSnapshot!], { type: 'application/json' }), `request_${message.id}.json`)}
              >
                <FileJson data-icon="inline-start" />
                전송 기록
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
