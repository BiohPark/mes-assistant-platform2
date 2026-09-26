import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ChevronDown, FileText, MessagesSquare, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActor } from '@/app/hooks'
import { useIsDesktop } from '@/app/useMediaQuery'
import { findConversationInput, removeConversationInput, setConversationWeight } from '@/db/repositories/conversationInputs'
import { formatSize } from '@/db/repositories/files'
import { setInput } from '@/db/repositories/tasks'
import { budgetLevel } from '@/domain/requestBudget'
import type { ConversationRequestInput, RequestInfo, RequestInput, Task } from '@/domain/types'
import { cn } from '@/lib/utils'
import { DELIVERY_CLASS, DELIVERY_HINT, DELIVERY_LABEL, inputDetail, inputTitle } from './requestLabels'

interface ContextTrayProps {
  task: Task
  info?: RequestInfo
  readOnly?: boolean
  /** 한도 초과 시 가장 큰 참조 대화의 범위·요약 조절 */
  onAdjustConversation: (input: ConversationRequestInput, mode: 'messages' | 'summary') => void
  /** 이 대화를 참조로 고른 새 대화로 이어가기 */
  onContinueInNew: () => void
}

/**
 * "이번 요청에 사용" — 지금 보내면 AI가 받을 파일·대화와 전달 방식, 요청 크기.
 * 실제 전송과 같은 조립 결과를 보여 주므로 여기 보이는 것이 곧 보내는 것이다.
 */
export function ContextTray({ task, info, readOnly, onAdjustConversation, onContinueInNew }: ContextTrayProps) {
  const actor = useActor()
  const isDesktop = useIsDesktop()
  const [open, setOpen] = useState<boolean>()
  const inputs = info?.inputs ?? []
  const level = info ? budgetLevel(info.bytes, info.limitBytes) : 'ok'
  const expanded = open ?? (isDesktop || level === 'over')
  if (!info || (inputs.length === 0 && level === 'ok')) return null

  const guard = (p: Promise<unknown>) => void p.catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
  async function changeConversation(sourceTaskId: string, next: 'main' | 'reference' | null) {
    if (!actor) return
    const found = await findConversationInput(task.id, sourceTaskId)
    if (!found) return
    await (next ? setConversationWeight(actor, found.id, next) : removeConversationInput(actor, found.id))
  }
  const toggleMain = (i: RequestInput) => {
    if (!actor) return
    const next = i.weight === 'main' ? 'reference' : 'main'
    guard(i.kind === 'file' ? setInput(actor, task.id, i.fileId, next) : changeConversation(i.sourceTaskId, next))
  }
  const remove = (i: RequestInput) => {
    if (!actor) return
    guard(i.kind === 'file' ? setInput(actor, task.id, i.fileId, null) : changeConversation(i.sourceTaskId, null))
  }
  const largestConversation = inputs.filter((i): i is ConversationRequestInput => i.kind === 'conversation').sort((a, b) => b.bytes - a.bytes)[0]
  const pct = Math.min(100, Math.round((info.bytes / info.limitBytes) * 100))

  return (
    <div className="border-t bg-muted/20 px-2.5 pt-2" aria-label="이번 요청에 사용할 자료">
      <button type="button" className="flex w-full items-center gap-2 text-left text-[11px]" onClick={() => setOpen(!expanded)} aria-expanded={expanded}>
        <span className="font-medium">이번 요청에 사용 · {inputs.length}</span>
        <span className="text-muted-foreground">{info.transport === 'openwebui' ? '파일은 OpenWebUI 첨부' : '본문으로 전달'}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground" title="직렬화한 요청 본문 크기 (모델 토큰 한도와 다름, OpenWebUI 첨부 파일 제외)">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <span className={cn('block h-full', level === 'over' ? 'bg-destructive' : level === 'warn' ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
          </span>
          <span className={cn(level === 'over' && 'font-medium text-destructive')}>
            {formatSize(info.bytes)} / {formatSize(info.limitBytes)}
          </span>
        </span>
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition', expanded && 'rotate-180')} />
      </button>
      {expanded && inputs.length > 0 && (
        <ul className="mt-1.5 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
          {inputs.map((i) => (
            <li
              key={i.kind === 'file' ? i.fileId : i.sourceTaskId}
              className={cn('inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px]', i.weight === 'main' && 'border-amber-300')}
              title={`${inputTitle(i)} · ${inputDetail(i)}`}
            >
              <button type="button" disabled={readOnly || !actor} onClick={() => toggleMain(i)} aria-label={`${inputTitle(i)} ${i.weight === 'main' ? '주 입력 해제' : '주 입력으로 지정'}`}>
                <Star className={cn('size-3', i.weight === 'main' ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground')} />
              </button>
              {i.kind === 'file' ? <FileText className="size-3 text-muted-foreground" /> : <MessagesSquare className="size-3 text-violet-500" />}
              <span className="truncate">{inputTitle(i)}</span>
              {i.kind === 'file' ? (
                <span className={cn('rounded border px-1 text-[10px]', DELIVERY_CLASS[i.delivery])} title={DELIVERY_HINT[i.delivery]}>
                  {DELIVERY_LABEL[i.delivery]}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">{i.mode === 'summary' ? '요약' : `${i.messageCount}개`}</span>
              )}
              {!readOnly && (
                <button type="button" onClick={() => remove(i)} aria-label={`${inputTitle(i)} 이번 요청에서 빼기`} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {level === 'over' && (
        <div role="alert" className="mt-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertTriangle className="size-3.5" /> 요청 크기 한도를 넘어 보낼 수 없습니다. 자동으로 자르거나 요약하지 않습니다.
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="self-center text-muted-foreground">위 칩의 ×로 입력을 빼거나</span>
            {largestConversation && (
              <>
                <Button size="xs" variant="outline" onClick={() => onAdjustConversation(largestConversation, 'messages')}>
                  {largestConversation.code} 메시지 범위 선택
                </Button>
                <Button size="xs" variant="outline" onClick={() => onAdjustConversation(largestConversation, 'summary')}>
                  {largestConversation.code} 요약 만들기
                </Button>
              </>
            )}
            <Button size="xs" variant="outline" onClick={onContinueInNew}>
              새 대화로 이어가기
            </Button>
          </div>
        </div>
      )}
      <div className="h-2" />
    </div>
  )
}
