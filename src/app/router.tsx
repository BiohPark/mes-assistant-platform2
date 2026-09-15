import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './AppShell'
import { BoardPage } from '@/features/dashboard/BoardPage'
import { TaskPage } from '@/features/task/TaskPage'
import { TemplatesPage } from '@/features/templates/TemplatesPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

// 무거운 라이브러리(recharts, dnd-kit)를 쓰는 화면은 지연 로딩
const TemplateEditorPage = lazy(() => import('@/features/templates/TemplateEditorPage').then((m) => ({ default: m.TemplateEditorPage })))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))

const fallback = <div className="p-4 text-sm text-muted-foreground">불러오는 중…</div>

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <BoardPage /> },
      { path: 'tasks/:taskId', element: <TaskPage /> },
      { path: 'tasks/:taskId/steps/:stepId', element: <TaskPage /> },
      { path: 'templates', element: <TemplatesPage /> },
      {
        path: 'templates/:templateId',
        element: (
          <Suspense fallback={fallback}>
            <TemplateEditorPage />
          </Suspense>
        ),
      },
      {
        path: 'reports',
        element: (
          <Suspense fallback={fallback}>
            <ReportsPage />
          </Suspense>
        ),
      },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
