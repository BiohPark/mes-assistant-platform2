import { useEffect, useRef, useState } from 'react'
import { Bot } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActor, useUserMap } from '@/app/hooks'
import { AvatarGroup } from '@/components/UserAvatar'
import { uploadFile } from '@/db/repositories/files'
import type { FileAsset, Message } from '@/domain/types'
import { useChat, type ChatScope } from './useChat'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'
import { SaveAsOutputDialog } from './SaveAsOutputDialog'
import { suggestionsFrom } from './suggestions'
import { ModelPicker } from './ModelPicker'
import { notifyTyping, useTypingUsers } from '@/app/presence'

interface ChatViewProps {
  scope: ChatScope
  readOnly?: boolean
  /** 메시지 첨부 표시에 쓰는 파일 */
  files?: FileAsset[]
  /** 초안 화면에서 넘겨받은 첫 메시지. 마운트 후 한 번만 보낸다. */
  initialMessage?: { text: string; attachmentIds: string[] }
  onInitialSent?: () => void
}

const SR_SUGGESTIONS = ['화면 개선을 요청하고 싶어요', '데이터 오류를 신고하고 싶어요', '새 기능이 필요해요']

export function ChatView({ scope, readOnly, files = [], initialMessage, onInitialSent }: ChatViewProps) {
  const actor = useActor()
  const users = useUserMap()
  const chat = useChat(actor, scope)
  const typingIds = useTypingUsers(chat.thread?.id, actor?.userId)
  const { remoteStreaming } = chat
  const participantIds = Array.from(new Set(chat.messages.filter((m) => m.role === 'user' && m.authorId).map((m) => m.authorId!)))
  const [saveTarget, setSaveTarget] = useState<Message | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const assistant = scope.kind === 'task' ? scope.assistant : scope.intake
  const task = scope.kind === 'task' ? scope.task : undefined
  const fileMap = new Map((scope.kind === 'task' ? files : scope.files).map((f) => [f.id, f]))
  const suggestions = scope.kind === 'sr' ? SR_SUGGESTIONS : suggestionsFrom(assistant.usageExample)

  // 초안 → 대화 전환: 첫 메시지를 한 번만 보낸다 (StrictMode 재실행에도 ref로 막음)
  const initialSentRef = useRef(false)
  const { send } = chat
  useEffect(() => {
    if (!initialMessage || initialSentRef.current || !actor) return
    initialSentRef.current = true
    onInitialSent?.()
    void send(initialMessage.text, initialMessage.attachmentIds)
  }, [initialMessage, actor, send, onInitialSent])

  const lastContent = chat.messages.at(-1)?.content
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages.length, lastContent])

  async function handleSend(text: string, attachments: File[], discussion: boolean) {
    if (!actor) return
    const origin = scope.kind === 'task' ? { taskId: scope.task.id } : { srId: scope.sr.id }
    const uploaded = await Promise.all(attachments.map((f) => uploadFile(actor, origin, f)))
    const body = text || `(파일 ${uploaded.length}건 첨부)`
    const ids = uploaded.map((f) => f.id)
    if (discussion) await chat.sendDiscussion(body, ids)
    else await chat.send(body, ids)
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
              <span className="inline-flex items-center gap-1 rounded-md px-1 text-[10px] text-muted-foreground">
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
                ? '자료 패널에서 고른 입력(★ 주 입력 / ☑ 참고)만 AI에 전달됩니다. 좋은 답변은 "산출물로 저장"하면 같은 태그 대화의 자료함에 나타납니다.'
                : '요청 내용을 편하게 말씀해 주세요. 준비되면 상단의 "접수로 전환"으로 정식 접수할 수 있습니다.'}
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

      {!readOnly && (
        <Composer
          disabled={!actor}
          streaming={chat.streaming || remoteStreaming}
          onSend={handleSend}
          allowDiscussion={!!task}
          onTyping={() => chat.thread && actor && notifyTyping(chat.thread.id, actor.userId)}
          onStop={chat.stop}
          suggestions={chat.messages.length === 0 ? suggestions : undefined}
        />
      )}
      {task && saveTarget && <SaveAsOutputDialog key={saveTarget.id} message={saveTarget} task={task} assistant={assistant} onClose={() => setSaveTarget(null)} />}
    </div>
  )
}
