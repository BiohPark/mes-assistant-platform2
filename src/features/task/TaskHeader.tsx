import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CalendarClock, CheckCircle2, Link2, MoreHorizontal, PauseCircle, PlayCircle, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ReasonDialog } from '@/components/ReasonDialog'
import { AvatarGroup } from '@/components/UserAvatar'
import { TagInput } from '@/components/TagInput'
import { useTagSuggest } from '@/app/useTagSuggest'
import { PriorityBadge } from '@/components/StatusBadges'
import { useActor, useUserMap } from '@/app/hooks'
import { addTag, deleteTask, removeTag, setTaskStatus, setTaskTitle } from '@/db/repositories/tasks'
import { TASK_STATUSES, type TaskStatus } from '@/domain/types'
import { TASK_STATUS_LABEL } from '@/lib/labels'
import { daysUntil, formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/clipboard'
import type { TaskData } from './useTaskData'
import { RelatedStrip } from './RelatedStrip'

interface TaskHeaderProps {
  data: TaskData
  onRequestComplete: () => void
}

export function TaskHeader({ data, onRequestComplete }: TaskHeaderProps) {
  const { task, assistant, related } = data
  const suggest = useTagSuggest()
  const users = useUserMap()
  const actor = useActor()
  const navigate = useNavigate()
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reopenTo, setReopenTo] = useState<TaskStatus | null>(null)
  const daysLeft = daysUntil(task.dueDate)
  const overdue = task.status !== 'done' && daysLeft !== undefined && daysLeft < 0
  const isDone = task.status === 'done'

  async function copyLink() {
    const url = `${window.location.origin}/c/${task.id}`
    if (await copyText(url)) toast.success('대화 링크를 복사했습니다.', { description: url })
    else toast.info('클립보드를 사용할 수 없습니다. 직접 복사하세요.', { description: url })
  }

  async function commitTitle() {
    setEditingTitle(false)
    const next = title.trim()
    if (!next || next === task.title) {
      setTitle(task.title)
      return
    }
    await setTaskTitle(task.id, next, 'manual')
  }

  async function changeStatus(status: TaskStatus) {
    if (!actor || status === task.status) return
    if (status === 'done') {
      onRequestComplete()
      return
    }
    // 완료된 업무를 다시 여는 것은 사유를 남긴다
    if (task.status === 'done') {
      setReopenTo(status)
      return
    }
    await setTaskStatus(actor, task.id, status)
  }

  async function remove() {
    const r = await deleteTask(task.id)
    if (!r.ok) {
      toast.error(r.reason)
      return
    }
    toast.success(`${task.code} 대화를 삭제했습니다.`)
    navigate('/?view=kanban')
  }

  return (
    <div className="border-b bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/?view=kanban&assistant=${encodeURIComponent(assistant.id)}`} title="이 에이전트의 대화 보기" className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-xs hover:bg-muted">
          <AssistantAvatar assistant={assistant} size="xs" />
          {assistant.name}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{task.code}</span>
        <Select value={task.status} onValueChange={(v) => void changeStatus(v as TaskStatus)} disabled={!actor}>
          <SelectTrigger size="sm" className="h-6 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PriorityBadge priority={task.priority} />
        {task.dueDate && (
          <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', overdue && 'font-medium text-red-600')}>
            <CalendarClock className="size-3.5" />
            {formatDate(task.dueDate)}
            {daysLeft !== undefined && !isDone && <span>({daysLeft < 0 ? `${-daysLeft}일 지연` : daysLeft === 0 ? '오늘' : `D-${daysLeft}`})</span>}
          </span>
        )}
        <AvatarGroup users={task.assigneeIds.map((id) => users.get(id))} />

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyLink}>
            <Link2 data-icon="inline-start" />
            링크 복사
          </Button>
          {!isDone && (
            <Button size="sm" onClick={onRequestComplete} disabled={!actor}>
              <CheckCircle2 data-icon="inline-start" />
              업무 완료
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="더 보기">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {task.status === 'on_hold' ? (
                <DropdownMenuItem onClick={() => void changeStatus('in_progress')}>
                  <PlayCircle /> 재개
                </DropdownMenuItem>
              ) : (
                !isDone && (
                  <DropdownMenuItem onClick={() => void changeStatus('on_hold')}>
                    <PauseCircle /> 보류
                  </DropdownMenuItem>
                )
              )}
              {isDone && (
                <DropdownMenuItem onClick={() => void changeStatus('in_progress')}>
                  <PlayCircle /> 다시 열기
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> 대화 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-2">
        {editingTitle ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitTitle()
              if (e.key === 'Escape') {
                setTitle(task.title)
                setEditingTitle(false)
              }
            }}
            autoFocus
            className="h-8 text-base font-semibold"
          />
        ) : (
          <div className="flex items-center gap-1.5">
            <button type="button" className="text-left text-base font-semibold hover:underline" onClick={() => !isDone && setEditingTitle(true)} title="클릭해서 제목 편집">
              {task.title}
            </button>
            {task.titleSource === 'ai' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 text-[10px] text-violet-700 dark:bg-violet-950 dark:text-violet-300" title="AI가 붙인 제목. 직접 고치면 이후 바뀌지 않습니다.">
                <Sparkles className="size-2.5" /> AI 제목
              </span>
            )}
          </div>
        )}
        {task.summary && <p className="mt-0.5 text-xs text-muted-foreground">{task.summary}</p>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <TagInput
          tags={task.tags}
          readOnly={isDone || !actor}
          suggest={suggest}
          onAdd={(tag) => actor && addTag(actor, task.id, tag)}
          onRemove={(tag) => actor && removeTag(actor, task.id, tag)}
          onChipClick={(tag) => navigate(`/?view=kanban&tag=${encodeURIComponent(tag)}`)}
          placeholder="태그 추가"
        />
        <RelatedStrip related={related} />
      </div>

      <ReasonDialog
        open={!!reopenTo}
        onOpenChange={(o) => !o && setReopenTo(null)}
        title="완료된 업무를 다시 열까요?"
        description="재개 사유는 이력과 리포트(재오픈 신호)에 기록됩니다."
        confirmLabel="다시 열기"
        onConfirm={async (reason) => {
          if (actor && reopenTo) await setTaskStatus(actor, task.id, reopenTo, { reason })
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="대화를 삭제할까요?"
        description="메시지, 메모, 이 대화에서 만든 파일이 함께 삭제됩니다. 다른 대화가 이 대화의 파일을 입력으로 쓰고 있으면 삭제할 수 없습니다."
        onConfirm={remove}
      />
    </div>
  )
}
