import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { TopBar } from '@/app/TopBar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTaskData } from './useTaskData'
import { TaskHeader } from './TaskHeader'
import { WorkflowStepper } from './WorkflowStepper'
import { StepPanel } from './StepPanel'

export function TaskPage() {
  const { taskId, stepId } = useParams()
  const navigate = useNavigate()
  const data = useTaskData(taskId)

  // 단계 파라미터가 없으면 현재 단계로 URL 정규화 (딥링크 일관성)
  useEffect(() => {
    if (data && !stepId) navigate(`/tasks/${data.task.id}/steps/${data.task.currentStepId}`, { replace: true })
  }, [data, stepId, navigate])

  if (data === undefined) {
    return (
      <>
        <TopBar title="업무 상세" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
          <Skeleton className="h-96" />
        </div>
      </>
    )
  }
  if (data === null) {
    return (
      <>
        <TopBar title="업무 상세" />
        <div className="p-10 text-center text-sm text-muted-foreground">
          업무를 찾을 수 없습니다.
          <div className="mt-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">보드로 돌아가기</Link>
            </Button>
          </div>
        </div>
      </>
    )
  }

  const selected = data.steps.find((s) => s.id === stepId) ?? data.steps.find((s) => s.id === data.task.currentStepId) ?? data.steps[0]

  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" asChild aria-label="보드로">
              <Link to="/">
                <ArrowLeft />
              </Link>
            </Button>
            <span className="font-mono text-xs text-muted-foreground">{data.task.code}</span>
            <span className="truncate">{data.task.title}</span>
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <TaskHeader data={data} selectedStepId={selected.id} />
        <div className="border-b bg-muted/30 px-3">
          <WorkflowStepper
            steps={data.steps}
            currentStepId={data.task.currentStepId}
            selectedStepId={selected.id}
            onSelect={(id) => navigate(`/tasks/${data.task.id}/steps/${id}`)}
          />
        </div>
        <StepPanel key={selected.id} data={data} step={selected} />
      </div>
    </>
  )
}
