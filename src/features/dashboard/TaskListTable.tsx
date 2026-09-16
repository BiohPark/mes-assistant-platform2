import { Link, useNavigate } from 'react-router'
import { ExternalLink } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AvatarGroup, UserAvatar } from '@/components/UserAvatar'
import { PriorityBadge, StepChip, TaskStatusBadge } from '@/components/StatusBadges'
import { TaskProgressBar } from './TaskProgressBar'
import type { BoardRow } from './useBoardData'
import { useUserMap } from '@/app/hooks'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface TaskListTableProps {
  rows: BoardRow[]
}

export function TaskListTable({ rows }: TaskListTableProps) {
  const users = useUserMap()
  const navigate = useNavigate()

  if (rows.length === 0) {
    return <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">조건에 맞는 업무가 없습니다.</div>
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-28">코드</TableHead>
            <TableHead>제목</TableHead>
            <TableHead className="w-40">현재 단계</TableHead>
            <TableHead className="w-36">진행</TableHead>
            <TableHead className="w-28">담당</TableHead>
            <TableHead className="w-20">우선순위</TableHead>
            <TableHead className="w-24">기한</TableHead>
            <TableHead className="w-20">상태</TableHead>
            <TableHead className="w-14">외부</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.task.id}
              className="cursor-pointer"
              onClick={() => navigate(`/tasks/${r.task.id}`)}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">{r.task.code}</TableCell>
              <TableCell>
                <Link to={`/tasks/${r.task.id}`} className="line-clamp-1 text-sm font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                  {r.task.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {r.task.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {r.task.status === 'done' ? (
                  <span className="text-xs text-muted-foreground">완료</span>
                ) : r.currentStep ? (
                  <StepChip name={r.currentStep.name} color={r.currentStep.color} mode={r.currentStep.mode} />
                ) : (
                  <span className="text-xs text-muted-foreground">수동 업무</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <TaskProgressBar steps={r.steps} currentStepId={r.task.currentStepId} className="w-20" />
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {r.progress.done}/{r.progress.total}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <UserAvatar user={users.get(r.task.ownerId)} />
                  <AvatarGroup users={r.task.assigneeIds.filter((id) => id !== r.task.ownerId).map((id) => users.get(id))} max={2} />
                </div>
              </TableCell>
              <TableCell>
                <PriorityBadge priority={r.task.priority} />
              </TableCell>
              <TableCell className={cn('text-xs tabular-nums', r.isOverdue && 'font-medium text-red-600')}>
                {formatDate(r.task.dueDate)}
                {r.isOverdue && <span className="ml-1">({r.daysLeft}일)</span>}
              </TableCell>
              <TableCell>
                <TaskStatusBadge status={r.task.status} />
              </TableCell>
              <TableCell>
                {r.task.externalRef && (
                  <a
                    href={r.task.externalRef.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                    title={`${r.task.externalRef.system} ${r.task.externalRef.id}`}
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
