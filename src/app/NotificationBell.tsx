import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { db } from '@/db/schema'
import { markAllRead, markRead } from '@/db/repositories/notifications'
import { formatRelative } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useCurrentUserId } from './hooks'

const MAX_ITEMS = 30

/** 상단 알림 종. 현재 탭 사용자의 알림만 보여주고, 클릭하면 읽음 처리 후 이동한다. */
export function NotificationBell() {
  const userId = useCurrentUserId()
  const navigate = useNavigate()
  const items = useLiveQuery(() => (userId ? db.notifications.where('userId').equals(userId).reverse().sortBy('at') : []), [userId]) ?? []
  const unread = items.filter((n) => !n.read).length
  const visible = items.slice(0, MAX_ITEMS)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`알림${unread ? ` ${unread}건 미읽음` : ''}`} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-semibold">알림 {unread > 0 && <span className="font-normal text-muted-foreground">미읽음 {unread}</span>}</span>
          <Button size="xs" variant="ghost" onClick={() => userId && markAllRead(userId)} disabled={unread === 0}>
            <CheckCheck data-icon="inline-start" />
            모두 읽음
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {visible.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">알림이 없습니다.</li>}
          {visible.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn('flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60', !n.read && 'bg-primary/5')}
                onClick={async () => {
                  await markRead(n.id)
                  navigate(n.link)
                }}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="truncate">{n.title}</span>
                </span>
                <span className="truncate text-[11px] text-muted-foreground">{n.body}</span>
                <span className="text-[10px] text-muted-foreground/80">{formatRelative(n.at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
