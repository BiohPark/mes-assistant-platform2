import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Bot, CheckCircle2, Hand, MapPin, SkipForward, Undo2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { StepStatusBadge } from '@/components/StatusBadges'
import { useActor } from '@/app/hooks'
import { navigateToStep, runStepAction, setStepMode } from '@/db/repositories/tasks'
import type { StepInstance } from '@/domain/types'
import { cn } from '@/lib/utils'
import type { TaskData } from './useTaskData'
import { ChecklistPanel } from './ChecklistPanel'
import { InputFilePicker } from './InputFilePicker'
import { FilesPanel } from './FilesPanel'
import { NotesPanel } from './NotesPanel'
import { ActivityPanel } from './ActivityPanel'
import { CompleteStepDialog } from './CompleteStepDialog'
import { ChatView } from '@/features/chat/ChatView'

interface StepPanelProps {
  data: TaskData
  step: StepInstance
}

export function StepPanel({ data, step }: StepPanelProps) {
  const actor = useActor()
  const navigate = useNavigate()
  const [completeOpen, setCompleteOpen] = useState(false)
  const { task, steps, files, notes, activity } = data
  const isCurrent = task.currentStepId === step.id
  const nextStep = steps.find((s) => s.order > step.order && s.status !== 'done' && s.status !== 'skipped')
  const closed = step.status === 'done' || step.status === 'skipped'
  const taskLocked = task.status !== 'active'
  const manual = step.mode === 'manual'

  function goTo(stepId?: string) {
    if (stepId) navigate(`/tasks/${task.id}/steps/${stepId}`)
  }
  async function skip() {
    if (!actor) return
    await runStepAction(actor, step.id, 'skip')
    toast.info(`"${step.name}" Task를 건너뛰었습니다.`)
    goTo(nextStep?.id)
  }
  async function reopen() {
    if (!actor) return
    await runStepAction(actor, step.id, 'reopen')
    toast.info(`"${step.name}" Task를 다시 열었습니다. 현재 Task로 설정됩니다.`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 단계 헤더 */}
      <div className={cn('flex flex-wrap items-center gap-2 border-b px-4 py-2', manual ? 'bg-muted/60' : 'bg-card')}>
        <span className="flex size-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: manual ? '#9ca3af' : step.color }}>
          {manual ? <Hand className="size-3.5" /> : <Bot className="size-3.5" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{step.name}</h2>
            <StepStatusBadge status={step.status} />
            {isCurrent ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-foreground">
                <MapPin className="size-3" />
                현재 Task
              </span>
            ) : (
              !taskLocked && (
                <Button variant="link" size="xs" className="h-auto p-0 text-[11px]" onClick={() => actor && navigateToStep(actor, task.id, step.id)}>
                  이 Task를 현재 Task로
                </Button>
              )
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{step.description || (manual ? '수동으로 진행하는 Task입니다. 메모와 첨부로 진행 내용을 남기세요.' : '')}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {step.feedback && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  {step.feedback.rating}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{step.feedback.comment || '피드백 코멘트 없음'}</TooltipContent>
            </Tooltip>
          )}
          {!taskLocked && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={() => actor && setStepMode(actor, step.id, manual ? 'assistant' : 'manual')}>
                    {manual ? <Bot data-icon="inline-start" /> : <Hand data-icon="inline-start" />}
                    {manual ? 'assistant로 진행' : '수동으로 진행'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>이 Task를 assistant에게 이관하지 않고 직접 진행할 수 있습니다 (회색 표시)</TooltipContent>
              </Tooltip>
              {closed ? (
                <Button variant="outline" size="sm" onClick={reopen}>
                  <Undo2 data-icon="inline-start" />
                  되돌리기
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={skip}>
                    <SkipForward data-icon="inline-start" />
                    건너뛰기
                  </Button>
                  <Button size="sm" onClick={() => setCompleteOpen(true)}>
                    <CheckCircle2 data-icon="inline-start" />
                    Task 완료
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 3단 레이아웃 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="space-y-5 overflow-y-auto border-r bg-muted/20 p-3">
          <InputFilePicker steps={steps} step={step} files={files} />
          <ChecklistPanel step={step} readOnly={taskLocked} />
          {step.outputSpec.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold">기대 산출물</h3>
              <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                {step.outputSpec.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <div className={cn('flex min-h-0 flex-col', manual && 'bg-muted/40')}>
          {manual ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-3 rounded-lg border border-dashed bg-card/70 p-3 text-xs text-muted-foreground">
                <Hand className="mr-1 inline size-3.5" />
                수동 진행 Task입니다. assistant 대화 없이 메모와 첨부파일로 진행 내용을 기록합니다. 언제든 상단에서 "assistant로 진행"으로 전환할 수 있습니다.
              </div>
              <div className="min-h-0 flex-1">
                <NotesPanel taskId={task.id} stepId={step.id} notes={notes} files={files} placeholder="진행 메모 (예: 개발 완료, 코드 리뷰 링크, DBA 승인 대기 등)" />
              </div>
            </div>
          ) : (
            <ChatView task={task} step={step} files={files} template={data.template} readOnly={taskLocked} />
          )}
        </div>

        <aside className="min-h-0 border-l bg-muted/20">
          <Tabs defaultValue="files" className="flex h-full flex-col gap-0">
            <TabsList className="m-2 grid grid-cols-3">
              <TabsTrigger value="files">파일 {files.length}</TabsTrigger>
              <TabsTrigger value="notes">메모 {notes.length}</TabsTrigger>
              <TabsTrigger value="history">이력</TabsTrigger>
            </TabsList>
            <TabsContent value="files" className="min-h-0 flex-1 px-2 pb-2">
              <FilesPanel taskId={task.id} files={files} steps={steps} currentStep={step} />
            </TabsContent>
            <TabsContent value="notes" className="min-h-0 flex-1 px-2 pb-2">
              <NotesPanel taskId={task.id} stepId={step.id} notes={notes} files={files} scopeToStep={false} />
            </TabsContent>
            <TabsContent value="history" className="min-h-0 flex-1 px-2 pb-2">
              <ActivityPanel activity={activity} steps={steps} stepId={step.id} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      <CompleteStepDialog key={step.id} open={completeOpen} onOpenChange={setCompleteOpen} step={step} files={files} nextStep={nextStep} onCompleted={goTo} />
    </div>
  )
}
