import { Link } from 'react-router'
import { toast } from 'sonner'
import { ArrowUpCircle, MessagesSquare, SlidersHorizontal, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { TaskStatusBadge } from '@/components/StatusBadges'
import { TagChip } from '@/components/TagChip'
import { useActor } from '@/app/hooks'
import {
  refreshConversationInput,
  removeConversationInput,
  selectConversation,
  setConversationWeight,
  type LoadedConversationInput,
} from '@/db/repositories/conversationInputs'
import { formatSize } from '@/db/repositories/files'
import type { Assistant, ContextMode, InputWeight, Task } from '@/domain/types'
import { cn } from '@/lib/utils'
import { InputToggle } from './InputToggle'
import type { CandidateRow, TaskData } from './useTaskData'

/** 선택 대화상자를 열 대상 */
export interface PickerTarget {
  source: Task
  sourceAssistant?: Assistant
  current?: LoadedConversationInput
  mode?: ContextMode
}

interface ListProps {
  data: TaskData
  readOnly?: boolean
  onOpenPicker: (target: PickerTarget) => void
}

export function modeLabel(mode: ContextMode, count: number): string {
  if (mode === 'summary') return '요약'
  return mode === 'messages' ? `고른 메시지 ${count}개` : `전체 ${count}개`
}

function useConversationActions(taskId: string) {
  const actor = useActor()
  const guard = (p: Promise<unknown>) => void p.catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)))
  return {
    actor,
    /** ☑/★ 토글: 선택돼 있으면 등급 변경·해제, 아니면 전체 원문으로 선택 */
    change: (source: Task, current: LoadedConversationInput | undefined) => (weight: InputWeight | null) => {
      if (!actor) return
      if (current) guard(weight ? setConversationWeight(actor, current.input.id, weight) : removeConversationInput(actor, current.input.id))
      else if (weight) guard(selectConversation(actor, taskId, source.id, { weight }))
    },
    refresh: (current: LoadedConversationInput) => actor && guard(refreshConversationInput(actor, current.input.id)),
  }
}

/** AI 입력으로 고른 참조 대화 (파일 입력과 같은 줄 모양) */
export function SelectedConversationList({ data, readOnly, onOpenPicker }: ListProps) {
  const { actor, change, refresh } = useConversationActions(data.task.id)
  if (data.conversationInputs.length === 0) return null
  return (
    <ul className="space-y-1">
      {data.conversationInputs.map((c) => (
        <li key={c.input.id} className={cn('rounded-lg border bg-card px-2 py-1.5', c.input.weight === 'main' && 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/10')}>
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-3.5 shrink-0 text-violet-500" />
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline"
              onClick={() => onOpenPicker({ source: c.source, sourceAssistant: c.assistant, current: c })}
              title="세부 조절 (전체 / 메시지 선택 / 요약)"
            >
              <span className="font-mono text-[11px] text-muted-foreground">{c.source.code}</span> {c.source.title}
            </button>
            <InputToggle weight={c.input.weight} onChange={change(c.source, c)} disabled={readOnly || !actor} label={c.source.code} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-5 text-[11px] text-muted-foreground">
            <span>{c.input.weight === 'main' ? '주 입력' : '참고'}</span>·<span>대화 {modeLabel(c.snapshot.mode, c.messages.length)}</span>·<span>{c.assistant?.name}</span>·
            <span>{formatSize(c.bytes)}</span>
            {c.detached && (
              <span className="inline-flex items-center gap-0.5 rounded-full border px-1.5" title="공유 태그가 없어졌지만 선택은 유지됩니다">
                <Unlink className="size-2.5" /> 태그 해제됨
              </span>
            )}
            {c.newMessages > 0 && !readOnly && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-sky-300 px-1.5 text-sky-700 hover:bg-sky-50 dark:text-sky-300"
                onClick={() => (c.snapshot.mode === 'full' ? refresh(c) : onOpenPicker({ source: c.source, sourceAssistant: c.assistant, current: c }))}
                title="선택 시점 이후 원본에 새 메시지가 생겼습니다. 누르면 새 메시지까지 포함합니다(자동으로 바뀌지 않음)"
              >
                <ArrowUpCircle className="size-2.5" /> 새 메시지 {c.newMessages} · 갱신
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** 같은 태그를 직접 공유하는 대화 후보 (최근 활동순). 체크하면 전체 원문으로 선택된다. */
export function ConversationCandidateList({ data, readOnly, onOpenPicker }: ListProps) {
  const { actor, change } = useConversationActions(data.task.id)
  const selected = new Map(data.conversationInputs.map((c) => [c.source.id, c]))
  if (data.task.tags.length === 0) {
    return <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">태그를 붙이면 같은 태그를 가진 대화가 여기에 보이고, 파일처럼 AI 입력으로 고를 수 있습니다.</div>
  }
  if (data.related.length === 0) {
    return <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">같은 태그를 가진 다른 대화가 없습니다.</div>
  }
  return (
    <ul className="divide-y rounded-lg border">
      {data.related.map((r: CandidateRow) => {
        const current = selected.get(r.task.id)
        return (
          <li key={r.task.id} className="px-2 py-1.5">
            <div className="flex items-center gap-2">
              {r.assistant ? <AssistantAvatar assistant={r.assistant} size="xs" className="size-4 rounded text-[8px]" /> : <MessagesSquare className="size-3.5" />}
              <Link to={`/c/${r.task.id}`} className="min-w-0 flex-1 truncate text-xs hover:underline" title={r.task.title}>
                <span className="font-mono text-[11px] text-muted-foreground">{r.task.code}</span> {r.task.title}
              </Link>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${r.task.code} 세부 조절`}
                title="메시지 선택·요약"
                disabled={readOnly || r.messageCount === 0}
                onClick={() => onOpenPicker({ source: r.task, sourceAssistant: r.assistant, current })}
              >
                <SlidersHorizontal />
              </Button>
              <InputToggle weight={current?.input.weight} onChange={change(r.task, current)} disabled={readOnly || !actor || r.messageCount === 0} label={r.task.code} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-6 text-[11px] text-muted-foreground">
              <TaskStatusBadge status={r.task.status} />
              <span>{r.assistant?.name}</span>·<span>메시지 {r.messageCount}개</span>·<span>{formatSize(r.bytes)}</span>
              {r.viaTags.map((t) => (
                <TagChip key={t} tag={t} size="xs" />
              ))}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
