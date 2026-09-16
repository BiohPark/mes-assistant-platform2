import { Bot, ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/UserAvatar'
import { useCurrentUser, useSettings, useUsers } from './hooks'
import { useUiStore } from './uiStore'
import { setTabUser } from './tabUser'
import { toast } from 'sonner'

interface TopBarProps {
  title?: React.ReactNode
  actions?: React.ReactNode
}

export function TopBar({ title, actions }: TopBarProps) {
  const users = useUsers()
  const current = useCurrentUser()
  const settings = useSettings()
  const setAssistantOpen = useUiStore((s) => s.setAssistantOpen)

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-4">
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
      {actions}
      <span className="hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground md:inline-flex">
        <span className={settings?.llm.mode === 'live' ? 'size-1.5 rounded-full bg-emerald-500' : 'size-1.5 rounded-full bg-amber-400'} />
        {settings?.llm.mode === 'live' ? `LLM: ${settings.llm.model}` : 'LLM: Mock'}
      </span>
      <Button variant="outline" size="sm" onClick={() => setAssistantOpen(true)}>
        <Bot data-icon="inline-start" />
        시스템 assistant
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 pl-1.5">
            <UserAvatar user={current} size="sm" />
            <span className="hidden sm:inline">{current?.name ?? '...'}</span>
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">사용자 전환 — 이 탭에만 적용 (탭마다 다른 사용자로 같은 대화에 참여 가능)</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {users.map((u) => (
            <DropdownMenuItem
              key={u.id}
              onClick={() => {
                setTabUser(u.id)
                toast.success(`이 탭을 ${u.name} 님으로 전환했습니다.`)
              }}
            >
              <UserAvatar user={u} size="sm" />
              <span className="flex-1">
                {u.name}
                <span className="ml-1.5 text-xs text-muted-foreground">{u.role}</span>
              </span>
              {u.id === current?.id && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
