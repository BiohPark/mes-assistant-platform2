import { useLiveQuery } from 'dexie-react-hooks'
import { subDays } from 'date-fns'
import { AlertTriangle, CheckCircle2, PlayCircle, Undo2 } from 'lucide-react'
import { db } from '@/db/schema'
import type { BoardRow } from './useBoardData'
import { cn } from '@/lib/utils'

interface KpiTilesProps {
  rows: BoardRow[]
}

export function KpiTiles({ rows }: KpiTilesProps) {
  const weekAgo = subDays(new Date(), 7).toISOString()
  const reopenCount = useLiveQuery(
    () => db.activity.where('type').equals('step.reopened').and((a) => a.at >= weekAgo).count(),
    [weekAgo],
  )
  const active = rows.filter((r) => r.task.status === 'active').length
  const overdue = rows.filter((r) => r.isOverdue).length
  const doneThisWeek = rows.filter((r) => r.task.status === 'done' && (r.task.completedAt ?? '') >= weekAgo).length

  const tiles = [
    { label: '진행 중', value: active, icon: PlayCircle, tone: 'text-blue-600' },
    { label: '기한 초과', value: overdue, icon: AlertTriangle, tone: overdue ? 'text-red-600' : 'text-muted-foreground' },
    { label: '이번 주 완료', value: doneThisWeek, icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: '되돌리기 (7일)', value: reopenCount ?? 0, icon: Undo2, tone: 'text-amber-600' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
          <t.icon className={cn('size-5 shrink-0', t.tone)} />
          <div className="leading-tight">
            <div className="text-[11px] text-muted-foreground">{t.label}</div>
            <div className="text-lg font-semibold tabular-nums">{t.value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
