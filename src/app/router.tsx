import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './AppShell'
import { HomePage } from '@/features/home/HomePage'
import { ManagePage } from '@/features/assistants/ManagePage'
import { DraftConversationPage } from '@/features/conversation/DraftConversationPage'
import { LegacyTaskRedirect, TaskPage } from '@/features/task/TaskPage'
import { SrIntakePage } from '@/features/sr/SrIntakePage'
import { SrManagePage } from '@/features/sr/SrManagePage'
import { SettingsPage } from '@/features/settings/SettingsPage'

// 무거운 라이브러리(recharts)를 쓰는 화면은 지연 로딩
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const fallback = <div className="p-4 text-sm text-muted-foreground">불러오는 중…</div>

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'assistants/manage', element: <ManagePage /> },
      { path: 'new/:assistantId', element: <DraftConversationPage /> },
      { path: 'c/:taskId', element: <TaskPage /> },
      { path: 'tasks/:taskId', element: <LegacyTaskRedirect /> },
      { path: 'sr', element: <SrIntakePage /> },
      { path: 'sr/manage', element: <SrManagePage /> },
      { path: 'reports', element: <Suspense fallback={fallback}><ReportsPage /></Suspense> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
