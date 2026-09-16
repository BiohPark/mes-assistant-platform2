import { useEffect, useRef, useState } from 'react'
import { Bot, MessageSquarePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActor, useUserMap } from '@/app/hooks'
import { AvatarGroup } from '@/components/UserAvatar'
import { Tooltip as Tip } from '@/components/ui/tooltip'
import { deleteThread, setActiveThread } from '@/db/repositories/chat'
import { uploadFile } from '@/db/repositories/files'
import type { FileAsset, Message, StepInstance, Task, WorkflowTemplate } from '@/domain/types'
import { cn } from '@/lib/utils'
import { useChat } from './useChat'
import { MessageBubble } from './MessageBubble'
import { Composer } from './Composer'
import { SaveAsOutputDialog } from './SaveAsOutputDialog'
import { ModelPicker } from './ModelPicker'

interface ChatViewProps {
  task: Task
  step: StepInstance
  files: FileAsset[]
  template?: WorkflowTemplate
  readOnly?: boolean
}

const SUGGESTIONS: Record<string, string[]> = {
  URS: ['입력 파일 기준으로 URS 초안 작성해줘', 'GxP 영향 평가 항목 정리해줘', '누락된 요구사항 확인 질문 만들어줘'],
  FDS: ['URS 기준으로 기능 목록 뽑아줘', '인터페이스 영향 검토해줘', '추적성 매트릭스 만들어줘'],
  TEST: ['FDS 항목별 테스트 케이스 생성해줘', '경계값 케이스 추가해줘', '테스트 결과서 형식으로 정리해줘'],
  PROTOCOL: ['GMP 프로토콜 요건 점검해줘', '승인 요청서 초안 작성해줘'],
  DEPLOY: ['배포 검증 SQL 만들어줘', '조회 결과 대조해서 결과서 작성해줘'],
}

export function ChatView({ task, step, files, template, readOnly }: ChatViewProps) {
  const actor = useActor()
  const users = useUserMap()
  const chat = useChat(actor, task, step, files, template)
  const participantIds = Array.from(new Set(chat.messages.filter((m) => m.role === 'user' && m.authorId).map((m) => m.authorId!)))
  const [saveTarget, setSaveTarget] = useState<Message | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileMap = new Map(files.map((f) => [f.id, f]))
  const outputCount = files.filter((f) => f.producedByStepId === step.id).length

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages.length, chat.messages.at(-1)?.content])

  async function handleSend(text: string, attachments: File[]) {
    if (!actor) return
    const uploaded = await Promise.all(attachments.map((f) => uploadFile(actor, task.id, f, step.id)))
    await chat.send(text || `(파일 ${uploaded.length}건 첨부)`, uploaded.map((f) => f.id))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700">
          <Bot className="size-3.5" />
          {step.assistant?.displayName ?? 'Assistant'}
        </span>
        <ModelPicker task={task} step={step} thread={chat.activeThread} template={template} disabled={readOnly} />
        {participantIds.length > 0 && (
          <Tip>
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
          </Tip>
        )}
        <span className="mx-1 h-4 w-px bg-border" />
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {chat.threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveThread(step.id, t.id)}
              className={cn(
                'shrink-0 rounded-md px-2 py-0.5 text-[11px]',
                t.id === chat.activeThread?.id ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.title}
            </button>
          ))}
        </div>
        {!readOnly && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="새 스레드" onClick={() => void chat.newThread()}>
                  <MessageSquarePlus />
                </Button>
              </TooltipTrigger>
              <TooltipContent>새 스레드로 다시 시작 (이전 스레드는 이력으로 보관)</TooltipContent>
            </Tooltip>
            {chat.activeThread && chat.threads.length > 1 && (
              <Button variant="ghost" size="icon-xs" aria-label="스레드 삭제" className="hover:text-destructive" onClick={() => chat.activeThread && deleteThread(chat.activeThread.id)}>
                <Trash2 />
              </Button>
            )}
          </>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center">
            <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950">
              <Bot className="size-5" />
            </span>
            <div className="text-sm font-medium">{step.name} assistant와 대화를 시작하세요</div>
            <p className="mt-1 text-xs text-muted-foreground">
              좌측에서 선택한 입력 파일은 자동으로 assistant 컨텍스트에 포함됩니다. 응답은 "산출물로 저장"해 다음 단계로 넘길 수 있습니다.
            </p>
          </div>
        )}
        {chat.messages.map((m) => (
          <MessageBubble key={m.id} message={m} files={fileMap} assistantName={step.assistant?.displayName} onSaveAsOutput={readOnly ? undefined : setSaveTarget} />
        ))}
      </div>

      {!readOnly && (
        <Composer
          disabled={!actor}
          streaming={chat.streaming}
          onSend={handleSend}
          onStop={chat.stop}
          suggestions={chat.messages.length === 0 ? SUGGESTIONS[step.key] : undefined}
        />
      )}
      <SaveAsOutputDialog message={saveTarget} task={task} step={step} existingCount={outputCount} onClose={() => setSaveTarget(null)} />
    </div>
  )
}
