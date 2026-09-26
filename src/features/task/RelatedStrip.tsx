import { Link } from 'react-router'
import { Link2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { TaskStatusBadge } from '@/components/StatusBadges'
import { TagChip } from '@/components/TagChip'
import type { TaskData } from './useTaskData'

interface RelatedStripProps {
  related: TaskData['related']
}

/** 태그를 직접 공유하는 다른 대화 (최근 활동순). 연결은 태그로만 — 떼면 사라진다. */
export function RelatedStrip({ related }: RelatedStripProps) {
  if (related.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] text-muted-foreground hover:bg-muted">
          <Link2 className="size-3" />
          연결된 대화 {related.length}
          <span className="ml-0.5 flex -space-x-1">
            {related.slice(0, 4).map((r) => r.assistant && <AssistantAvatar key={r.task.id} assistant={r.assistant} size="xs" className="size-4 rounded text-[8px] ring-1 ring-background" />)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <div className="px-2 py-1 text-[11px] text-muted-foreground">같은 태그를 가진 대화 — 자료 탭에서 파일이나 대화를 AI 입력으로 고를 수 있습니다</div>
        <ul className="max-h-72 overflow-y-auto">
          {related.map(({ task, assistant, viaTags }) => (
            <li key={task.id}>
              <Link to={`/c/${task.id}`} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                {assistant && <AssistantAvatar assistant={assistant} size="xs" className="mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono">{task.code}</span>
                    <span className="truncate">{assistant?.name}</span>
                    <TaskStatusBadge status={task.status} className="ml-auto" />
                  </div>
                  <div className="truncate text-xs font-medium">{task.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {viaTags.map((t) => (
                      <TagChip key={t} tag={t} size="xs" />
                    ))}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
