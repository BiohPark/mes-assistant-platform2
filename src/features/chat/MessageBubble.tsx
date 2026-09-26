import { useState } from 'react'
import { Bot, Copy, FileDown, FileText, ListTree, MessagesSquare, Paperclip, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { UserAvatar } from '@/components/UserAvatar'
import { useUserMap } from '@/app/hooks'
import type { FileAsset, FileRequestInput, Message } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'
import { RequestInfoDialog } from './RequestInfoDialog'
import { DELIVERY_CLASS, DELIVERY_HINT, DELIVERY_LABEL, inputTitle } from './requestLabels'
import type { RetryOptions } from './useChat'

interface MessageBubbleProps {
  message: Message
  files: Map<string, FileAsset>
  assistantName?: string
  onSaveAsOutput?: (message: Message) => void
  /** 가장 최근의 실패한 답변에만: 같은 질문으로 다시 요청 */
  onRetry?: (opts?: RetryOptions) => void
  /** 첫 토큰 전 진행 단계 (파일 업로드·처리 대기 등) */
  phase?: string
}

/** 터치 기기와 키보드 포커스에서도 보이게 (hover 전용 금지) */
const REVEAL = 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'

export function MessageBubble({ message, files, assistantName, onSaveAsOutput, onRetry, phase }: MessageBubbleProps) {
  const users = useUserMap()
  const [infoOpen, setInfoOpen] = useState(false)
  const isUser = message.role === 'user'
  const author = message.authorId ? users.get(message.authorId) : undefined
  const streaming = message.status === 'streaming'
  const isDiscussion = message.kind === 'discussion'
  const info = message.requestInfo
  const failedFiles = (info?.inputs.filter((i) => i.kind === 'file' && i.delivery === 'failed') ?? []) as FileRequestInput[]

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
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{isUser ? (author?.name ?? '사용자') : (assistantName ?? 'Assistant')}</span>
          <span>{formatDateTime(message.createdAt)}</span>
          {isDiscussion && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
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
            <span className="inline-flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
              <span className="inline-flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </span>
              {phase}
            </span>
          ) : null}
          {streaming && message.content && <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-foreground/60 align-middle" />}
        </div>
        {message.attachmentIds.length > 0 && (
          <div className={cn('flex flex-wrap gap-1', isUser && 'justify-end')}>
            {message.attachmentIds.map((id) => {
              const f = files.get(id)
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px]">
                  <Paperclip className="size-2.5" />
                  {f?.name ?? '(삭제된 파일)'}
                </span>
              )
            })}
          </div>
        )}
        {!isUser && info && !streaming && (
          <button type="button" onClick={() => setInfoOpen(true)} className="flex flex-wrap items-center gap-1 text-left text-[11px] text-muted-foreground hover:text-foreground" title="이 답변에 실제로 보낸 자료와 방식 보기">
            <ListTree className="size-3" />
            <span>사용한 자료 {info.inputs.length}</span>
            {info.inputs.slice(0, 4).map((i) => (
              <span key={i.kind === 'file' ? i.fileId : i.sourceTaskId} className="inline-flex items-center gap-0.5 rounded border bg-background px-1">
                {i.weight === 'main' && '★'}
                {i.kind === 'file' ? <FileText className="size-2.5" /> : <MessagesSquare className="size-2.5" />}
                <span className="max-w-32 truncate">{inputTitle(i)}</span>
                {i.kind === 'file' && (
                  <span className={cn('rounded border px-0.5 text-[10px]', DELIVERY_CLASS[i.delivery])} title={DELIVERY_HINT[i.delivery]}>
                    {DELIVERY_LABEL[i.delivery]}
                  </span>
                )}
              </span>
            ))}
            {info.inputs.length > 4 && <span>+{info.inputs.length - 4}</span>}
          </button>
        )}
        {onRetry && (
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="실패한 답변 복구">
            <Button variant="outline" size="xs" onClick={() => onRetry()}>
              <RotateCcw data-icon="inline-start" /> 다시 시도
            </Button>
            {failedFiles.map((f) => (
              <span key={f.fileId} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-1 text-[11px]">
                <span className="max-w-40 truncate text-destructive" title={f.error}>
                  {f.name} v{f.version}
                </span>
                <Button variant="ghost" size="xs" onClick={() => onRetry({ excludeFileIds: [f.fileId] })} title="이 파일을 입력에서 빼고 다시 요청">
                  빼고 다시
                </Button>
                {f.text && (
                  <Button variant="ghost" size="xs" onClick={() => onRetry({ forceInlineFileIds: [f.fileId] })} title="첨부 대신 본문으로 넣어 다시 요청">
                    텍스트로 보내기
                  </Button>
                )}
              </span>
            ))}
          </div>
        )}
        {!isUser && !streaming && message.content && message.status !== 'error' && (
          <div className={cn('flex gap-0.5', REVEAL)}>
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
          </div>
        )}
      </div>
      {infoOpen && <RequestInfoDialog message={message} onClose={() => setInfoOpen(false)} />}
    </div>
  )
}
