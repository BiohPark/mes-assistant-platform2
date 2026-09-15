import { Link } from 'react-router'
import { CalendarClock, ExternalLink } from 'lucide-react'
import { AvatarGroup } from '@/components/UserAvatar'
import { PriorityBadge, TaskStatusBadge } from '@/components/StatusBadges'
import { TaskProgressBar } from './TaskProgressBar'
import type { BoardRow } from './useBoardData'
import { useUserMap } from '@/app/hooks'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface TaskCardProps {
  row: BoardRow
  compact?: boolean
}

export function TaskCard({ row, compact }: TaskCardProps) {
  const users = useUserMap()
  const { task } = row
  const people = [task.ownerId, ...task.assigneeIds.filter((id) => id !== task.ownerId)].map((id) => users.get(id))
  return (
    <Link
      to={`/tasks/${task.id}`}
      className={cn(
        'block rounded-lg border bg-card p-2.5 shadow-xs transition-all hover:-translate-y-px hover:shadow-md',
        task.status === 'on_hold' && 'opacity-70',
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">{task.code}</span>
        <div className="flex items-center gap-1">
          {task.status !== 'active' && <TaskStatusBadge status={task.status} />}
          {task.priority !== 'normal' && <PriorityBadge priority={task.priority} />}
        </div>
      </div>
      <div className={cn('text-sm font-medium leading-snug', compact ? 'line-clamp-1' : 'line-clamp-2')}>{task.title}</div>
      {!compact && (
        <>
          <TaskProgressBar steps={row.steps} currentStepId={task.currentStepId} className="mt-2" />
          <div className="mt-2 flex items-center justify-between">
            <AvatarGroup users={people} max={3} />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {task.externalRef && <ExternalLink className="size-3" />}
              {task.dueDate && (
                <span className={cn('inline-flex items-center gap-1 tabular-nums', row.isOverdue && 'font-medium text-red-600')}>
                  <CalendarClock className="size-3" />
                  {formatDate(task.dueDate, 'MM-dd')}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </Link>
  )
}
