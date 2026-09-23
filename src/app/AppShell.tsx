import { NavLink, Outlet } from 'react-router'
import { LayoutGrid, Inbox, BarChart3, Settings, Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SystemAssistantDrawer } from '@/features/system-assistant/SystemAssistantDrawer'

const NAV = [
  { to: '/', label: '에이전트 허브', icon: LayoutGrid, end: true },
  { to: '/sr', label: 'SR 접수', icon: Inbox },
  { to: '/reports', label: '리포트', icon: BarChart3 },
  { to: '/settings', label: '설정', icon: Settings },
]

export function AppShell() {
  return (
    <TooltipProvider>
      <div className="flex h-full bg-muted/30">
        <aside className="flex w-14 shrink-0 flex-col items-center border-r bg-sidebar py-3 lg:w-52 lg:items-stretch lg:px-3">
          <div className="mb-4 flex items-center gap-2 px-1 lg:px-1">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Boxes className="size-4" />
            </span>
            <div className="hidden leading-tight lg:block">
              <div className="text-sm font-semibold">MES Agent Hub</div>
              <div className="text-[10px] text-muted-foreground">대화 · 태그 · SR</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={label}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    isActive && 'bg-primary/10 font-medium text-primary hover:bg-primary/10 hover:text-primary',
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto hidden px-2 text-[10px] leading-relaxed text-muted-foreground lg:block">
            MES · GMP 데모
            <br />
            데모 빌드 (프론트 전용)
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
      <SystemAssistantDrawer />
      <Toaster position="bottom-right" richColors closeButton />
    </TooltipProvider>
  )
}
