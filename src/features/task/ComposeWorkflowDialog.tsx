import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, BookmarkPlus, Bot, Hand, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StepStatusBadge } from '@/components/StatusBadges'
import { useActor } from '@/app/hooks'
import { moveStep, removeStep } from '@/db/repositories/tasks'
import { moduleFromStepInstance, saveModule } from '@/db/repositories/modules'
import type { TaskData } from './useTaskData'
import { InsertStepDialog } from './InsertStepDialog'

interface ComposeWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TaskData
}

/** 업무의 Task 구성 편집: 순서 변경, 제거, 라이브러리에 저장, Task 추가 */
export function ComposeWorkflowDialog({ open, onOpenChange, data }: ComposeWorkflowDialogProps) {
  const actor = useActor()
  const [insertAfter, setInsertAfter] = useState<string | null>(null)

  async function remove(stepId: string) {
    if (!actor) return
    const r = await removeStep(actor, stepId)
    if (r.ok) toast.success('Task를 제거했습니다.')
    else toast.error(r.reason)
  }
  async function toLibrary(stepId: string) {
    if (!actor) return
    const step = data.steps.find((s) => s.id === stepId)
    if (!step) return
    await saveModule(moduleFromStepInstance(actor, step, [data.template?.category ?? '사용자 정의']))
    toast.success(`"${step.name}"을(를) 모듈 라이브러리에 저장했습니다.`)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>워크플로우 구성 — {data.task.code}</DialogTitle>
            <DialogDescription>이 업무의 Task를 갈아끼웁니다. 대기 중인 Task만 제거할 수 있고, 진행/완료된 Task는 건너뛰기로 처리하세요.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-1.5">
            {data.steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: s.mode === 'manual' ? '#9ca3af' : s.color }}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    {s.name}
                    {s.mode === 'manual' ? <Hand className="size-3 text-muted-foreground" /> : <Bot className="size-3 text-violet-600" />}
                    <StepStatusBadge status={s.status} />
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    체크 {s.checklist.length} · {s.assistant?.modelId || (s.mode === 'assistant' ? '기본 모델' : '수동')}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-xs" aria-label="위로" disabled={i === 0 || !actor} onClick={() => actor && moveStep(actor, s.id, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="아래로" disabled={i === data.steps.length - 1 || !actor} onClick={() => actor && moveStep(actor, s.id, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="여기 뒤에 Task 추가" onClick={() => setInsertAfter(s.id)}>
                    <Plus />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="라이브러리에 저장" title="Task 모듈 라이브러리에 저장" onClick={() => toLibrary(s.id)}>
                    <BookmarkPlus />
                  </Button>
                  <Button variant="ghost" size="icon-xs" aria-label="제거" className="hover:text-destructive" disabled={s.status !== 'pending'} onClick={() => remove(s.id)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
            {data.steps.length === 0 && (
              <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Task가 없는 수동 업무입니다. 메모/첨부로 진행하거나 Task를 추가하세요.</li>
            )}
          </ol>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setInsertAfter('')}>
            <Plus data-icon="inline-start" />
            Task 추가 (맨 뒤)
          </Button>
        </DialogContent>
      </Dialog>
      <InsertStepDialog open={insertAfter !== null} onOpenChange={(o) => !o && setInsertAfter(null)} data={data} afterStepId={insertAfter ?? ''} />
    </>
  )
}
