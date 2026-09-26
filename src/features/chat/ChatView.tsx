import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Bot } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActor, useUserMap } from '@/app/hooks'
import { AvatarGroup } from '@/components/UserAvatar'
import { loadConversationInputs } from '@/db/repositories/conversationInputs'
import { uploadFile } from '@/db/repositories/files'
import { budgetLevel } from '@/domain/requestBudget'
import type { ConversationRequestInput, FileAsset, Message } from '@/domain/types'
import { ConversationPickerDialog } from '@/features/task/ConversationPickerDialog'
import { useChat, type ChatScope, type RetryOptions } from './useChat'
import { MessageBubble } from './MessageBubble'
import { Composer, type PendingAttachment } from './Composer'
import { ContextTray } from './ContextTray'
import { SaveAsOutputDialog } from './SaveAsOutputDialog'
import { suggestionsFrom } from './suggestions'
import { ModelPicker } from './ModelPicker'
import { useRequestEstimate } from './useRequestEstimate'
import { notifyTyping, useTypingUsers } from '@/app/presence'

/** 초안 화면에서 넘겨받는 첫 메시지 */
export interface InitialMessage {
  text: string
  attachmentIds: string[]
  /** 대화 입력으로 고정하지 않은 첨부 */
  oneShotFileIds?: string[]
}

interface ChatViewProps {
  scope: ChatScope
  readOnly?: boolean
  /** 메시지 첨부 표시에 쓰는 파일 */
  files?: FileAsset[]
  /** 초안 화면에서 넘겨받은 첫 메시지. 마운트 후 한 번만 보낸다. */
  initialMessage?: InitialMessage
  onInitialSent?: () => void
}

const SR_SUGGESTIONS = ['화면 개선을 요청하고 싶어요', '데이터 오류를 신고하고 싶어요', '새 기능이 필요해요']

/** 가장 최근의 실패한 답변 (그 뒤에 AI 대화가 없을 때만 다시 시도 가능) */
function lastFailedReply(messages: Message[]): Message | undefined {
  const last = [...messages].reverse().find((m) => m.kind !== 'discussion')
  return last?.role === 'assistant' && last.status === 'error' ? last : undefined
}

export function ChatView({ scope, readOnly, files = [], initialMessage, onInitialSent }: ChatViewProps) {
  const actor = useActor()
  const users = useUserMap()
  const navigate = useNavigate()
  const chat = useChat(actor, scope)
  const typingIds = useTypingUsers(chat.thread?.id, actor?.userId)
  const { remoteStreaming } = chat
  const participantIds = Array.from(new Set(chat.messages.filter((m) => m.role === 'user' && m.authorId).map((m) => m.authorId!)))
  const [saveTarget, setSaveTarget] = useState<Message | null>(null)
  const [draft, setDraft] = useState('')
  const [adjust, setAdjust] = useState<{ sourceTaskId: string; mode: 'messages' | 'summary' } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const assistant = scope.kind === 'task' ? scope.assistant : scope.intake
  const task = scope.kind === 'task' ? scope.task : undefined
  const fileMap = new Map((scope.kind === 'task' ? files : scope.files).map((f) => [f.id, f]))
  const suggestions = scope.kind === 'sr' ? SR_SUGGESTIONS : suggestionsFrom(assistant.usageExample)
  const estimate = useRequestEstimate(scope, chat.thread, chat.messages, draft, !!task && !readOnly)
  const over = estimate && budgetLevel(estimate.bytes, estimate.limitBytes) === 'over'
  const failed = readOnly || chat.streaming || remoteStreaming ? undefined : lastFailedReply(chat.messages)
  const conversationInputs = useLiveQuery(() => (task && adjust ? loadConversationInputs(task.id) : []), [task?.id, adjust])
  const adjusting = conversationInputs?.find((c) => c.source.id === adjust?.sourceTaskId)

  // 초안 → 대화 전환: 첫 메시지를 한 번만 보낸다 (StrictMode 재실행에도 ref로 막음)
  const initialSentRef = useRef(false)
  const { send } = chat
  useEffect(() => {
    if (!initialMessage || initialSentRef.current || !actor) return
    initialSentRef.current = true
    onInitialSent?.()
    send(initialMessage.text, initialMessage.attachmentIds, initialMessage.oneShotFileIds).catch((e: unknown) =>
      toast.error('첫 메시지를 보내지 못했습니다.', { description: e instanceof Error ? e.message : String(e) }),
    )
  }, [initialMessage, actor, send, onInitialSent])

  const lastContent = chat.messages.at(-1)?.content
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages.length, lastContent])

  async function handleSend(text: string, attachments: PendingAttachment[], discussion: boolean) {
    if (!actor) return
    const origin = scope.kind === 'task' ? { taskId: scope.task.id } : { srId: scope.sr.id }
    const uploaded = await Promise.all(attachments.map((a) => uploadFile(actor, origin, a.file)))
    const body = text || `(파일 ${uploaded.length}건 첨부: ${uploaded.map((f) => f.name).join(', ')})`
    const ids = uploaded.map((f) => f.id)
    if (discussion) await chat.sendDiscussion(body, ids)
    else await chat.send(body, ids, uploaded.filter((_, i) => attachments[i].once).map((f) => f.id))
  }

  function retry(message: Message, opts?: RetryOptions) {
    chat.retry(message.id, opts).catch((e: unknown) => toast.error('다시 보내지 못했습니다.', { description: e instanceof Error ? e.message : String(e) }))
  }

  function continueInNew() {
    if (!task) return
    const params = new URLSearchParams([...task.tags.map((t) => ['tag', t]), ['ref', task.id]])
    navigate(`/new/${assistant.id}?${params.toString()}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700">
          <Bot className="size-3.5" />
          {assistant.name}
        </span>
        <ModelPicker assistant={assistant} task={task} thread={chat.thread} disabled={readOnly} />
        {participantIds.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 rounded-md px-1 text-[11px] text-muted-foreground">
                <AvatarGroup users={participantIds.map((id) => users.get(id))} max={4} />
                {participantIds.length >= 2 && <span>{participantIds.length}명 참여</span>}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              참여자: {participantIds.map((id) => users.get(id)?.name ?? id).join(', ')}
              {participantIds.length >= 2 && ' — assistant에게는 발화자 이름이 함께 전달됩니다'}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center">
            <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950">
              <Bot className="size-5" />
            </span>
            <div className="text-sm font-medium">{assistant.name}와 대화를 시작하세요</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {scope.kind === 'task'
                ? 'AI에는 고른 입력(★ 주 입력 / ☑ 참고 — 파일·같은 태그 대화)과 여기서 첨부한 파일만 갑니다. 입력창 위 "이번 요청에 사용"에서 확인하세요. 좋은 답변은 "산출물로 저장"하면 같은 태그 대화의 자료함에 나타납니다.'
                : '요청 내용을 편하게 말씀해 주세요. 첨부한 파일은 함께 전달됩니다. 준비되면 상단의 "접수로 전환"으로 정식 접수할 수 있습니다.'}
            </p>
          </div>
        )}
        {chat.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            files={fileMap}
            assistantName={assistant.name}
            onSaveAsOutput={readOnly || !task ? undefined : setSaveTarget}
            onRetry={failed?.id === m.id ? (opts) => retry(m, opts) : undefined}
            phase={m.status === 'streaming' ? chat.phase : undefined}
          />
        ))}
        {(typingIds.length > 0 || remoteStreaming) && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex gap-0.5">
              <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1 animate-bounce rounded-full bg-muted-foreground" />
            </span>
            {typingIds.length > 0 && <span>{typingIds.map((id) => users.get(id)?.name ?? id).join(', ')} 님이 입력 중…</span>}
            {remoteStreaming && <span>다른 참여자의 요청에 assistant가 응답 중…</span>}
          </div>
        )}
      </div>

      {task && !readOnly && (
        <ContextTray
          task={task}
          info={estimate}
          onAdjustConversation={(i: ConversationRequestInput, mode) => setAdjust({ sourceTaskId: i.sourceTaskId, mode })}
          onContinueInNew={continueInNew}
        />
      )}
      {!readOnly && (
        <Composer
          disabled={!actor}
          streaming={chat.streaming || remoteStreaming}
          onSend={handleSend}
          allowDiscussion={!!task}
          allowPin={!!task}
          blockedReason={over ? '요청 크기 한도를 넘었습니다. 입력창 위 안내에서 줄이세요.' : undefined}
          onDraftChange={setDraft}
          onTyping={() => chat.thread && actor && notifyTyping(chat.thread.id, actor.userId)}
          onStop={chat.stop}
          suggestions={chat.messages.length === 0 ? suggestions : undefined}
        />
      )}
      {task && saveTarget && <SaveAsOutputDialog key={saveTarget.id} message={saveTarget} task={task} assistant={assistant} onClose={() => setSaveTarget(null)} />}
      {task && adjusting && adjust && (
        <ConversationPickerDialog
          key={`${adjusting.source.id}-${adjust.mode}`}
          task={task}
          assistant={assistant}
          source={adjusting.source}
          sourceAssistant={adjusting.assistant}
          current={adjusting}
          initialMode={adjust.mode}
          onClose={() => setAdjust(null)}
        />
      )}
    </div>
  )
}
