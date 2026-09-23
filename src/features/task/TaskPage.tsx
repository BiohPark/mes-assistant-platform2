import { useCallback, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { TopBar } from '@/app/TopBar'
import { TaskBody } from './TaskBody'
import { TaskCompleteDialog } from './TaskCompleteDialog'
import { TaskHeader } from './TaskHeader'
import { useTaskData } from './useTaskData'

/** 초안 화면(/new/:assistantId)이 첫 전송 때 넘기는 메시지 */
export interface ConversationHandoff {
  autoSend?: { text: string; attachmentIds: string[] }
}

export function TaskPage() {
  const { taskId } = useParams()
  const data = useTaskData(taskId)
  const location = useLocation()
  const navigate = useNavigate()
  const [completing, setCompleting] = useState(false)
  // 넘겨받은 첫 메시지는 마운트 시점 값만 쓴다. 전송 후 로컬 값과 history state를 모두 비워
  // ChatView가 다시 마운트돼도(모바일 탭 전환·화면 폭 변경) 두 번 보내지 않는다.
  const [handoff, setHandoff] = useState(() => (location.state as ConversationHandoff | null)?.autoSend)
  const clearHandoff = useCallback(() => {
    setHandoff(undefined)
    navigate(location.pathname, { replace: true, state: null })
  }, [navigate, location.pathname])

  if (data === null) return <Navigate to="/" replace />
  if (!data) {
    return (
      <>
        <TopBar title="…" />
        <div className="space-y-3 p-6">
          <Skeleton className="h-16" />
          <Skeleton className="h-64" />
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title={`${data.task.code} · ${data.task.title}`} />
      <TaskHeader data={data} onRequestComplete={() => setCompleting(true)} />
      <TaskBody data={data} initialMessage={handoff} onInitialSent={clearHandoff} />
      {completing && <TaskCompleteDialog open onOpenChange={(o) => !o && setCompleting(false)} data={data} />}
    </>
  )
}

/** 예전 링크(/tasks/:id) 호환 */
export function LegacyTaskRedirect() {
  const { taskId } = useParams()
  return <Navigate to={`/c/${taskId ?? ''}`} replace />
}
