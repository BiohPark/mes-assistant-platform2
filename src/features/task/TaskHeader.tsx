import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, CheckCircle2, ExternalLink, Link2, MoreHorizontal, PauseCircle, PlayCircle, Plus, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AvatarGroup, UserAvatar } from '@/components/UserAvatar'
import { PriorityBadge, TaskStatusBadge } from '@/components/StatusBadges'
import { useActor, useUserMap } from '@/app/hooks'
import { setTaskStatus } from '@/db/repositories/tasks'
import { formatDate, daysUntil } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { TaskData } from './useTaskData'
import { TaskCompleteDialog } from './TaskCompleteDialog'
import { InsertStepDialog } from './InsertStepDialog'
import { ComposeWorkflowDialog } from './ComposeWorkflowDialog'

interface TaskHeaderProps {
  data: TaskData
  selectedStepId: string
}

export function TaskHeader({ data, selectedStepId }: TaskHeaderProps) {
  const { task } = data
  const users = useUserMap()
  const actor = useActor()
  const [completeOpen, setCompleteOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const daysLeft = daysUntil(task.dueDate)
  const overdue = task.status === 'active' && daysLeft !== undefined && daysLeft < 0

  async function copyLink() {
    const url = `${window.location.origin}/tasks/${task.id}/steps/${selectedStepId}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('외부 시스템 제공용 링크를 복사했습니다.', { description: url })
    } catch {
      toast.info(url)
    }
  }

  return (
    <div className="border-b bg-card px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{task.code}</span>
            <TaskStatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <span className="rounded bg-muted px-1.5 py-px">{data.template?.name ?? (data.steps.length ? '직접 구성' : '수동 업무')}</span>
          </div>
          <h1 className="mt-1 text-base font-semibold leading-snug">{task.title}</h1>
          {task.summary && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{task.summary}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            {task.externalRef && (
              <Button variant="outline" size="sm" asChild>
                <a href={task.externalRef.url} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  {task.externalRef.system} {task.externalRef.id}
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Link2 data-icon="inline-start" />
              링크 복사
            </Button>
            {task.status === 'active' && (
              <Button size="sm" onClick={() => setCompleteOpen(true)}>
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
                <DropdownMenuItem onClick={() => setInsertOpen(true)}>
                  <Plus />
                  Task 추가
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setComposeOpen(true)}>
                  <SlidersHorizontal />
                  워크플로우 구성 (순서/제거)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {task.status === 'active' ? (
                  <DropdownMenuItem onClick={() => actor && setTaskStatus(actor, task.id, 'on_hold')}>
                    <PauseCircle />
                    보류
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => actor && setTaskStatus(actor, task.id, 'active')}>
                    <PlayCircle />
                    {task.status === 'done' ? '업무 재개(완료 취소)' : '보류 해제'}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              담당 <UserAvatar user={users.get(task.ownerId)} showName />
            </span>
            <AvatarGroup users={task.assigneeIds.filter((id) => id !== task.ownerId).map((id) => users.get(id))} />
            {task.dueDate && (
              <span className={cn('inline-flex items-center gap-1 tabular-nums', overdue && 'font-medium text-red-600')}>
                <CalendarClock className="size-3.5" />
                {formatDate(task.dueDate)}
                {daysLeft !== undefined && task.status === 'active' && <span>({daysLeft >= 0 ? `D-${daysLeft}` : `${-daysLeft}일 지연`})</span>}
              </span>
            )}
          </div>
        </div>
      </div>
      <TaskCompleteDialog open={completeOpen} onOpenChange={setCompleteOpen} data={data} />
      <InsertStepDialog open={insertOpen} onOpenChange={setInsertOpen} data={data} afterStepId={selectedStepId} />
      <ComposeWorkflowDialog open={composeOpen} onOpenChange={setComposeOpen} data={data} />
    </div>
  )
}
