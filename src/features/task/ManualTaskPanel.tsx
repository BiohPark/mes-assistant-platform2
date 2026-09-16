import { useState } from 'react'
import { Hand, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TaskData } from './useTaskData'
import { NotesPanel } from './NotesPanel'
import { FilesPanel } from './FilesPanel'
import { ActivityPanel } from './ActivityPanel'
import { InsertStepDialog } from './InsertStepDialog'

interface ManualTaskPanelProps {
  data: TaskData
}

/** Task(assistant 단위)가 없는 수동 업무 화면: 메모/첨부/이력만으로 진행 */
export function ManualTaskPanel({ data }: ManualTaskPanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const { task, files, notes, activity, steps } = data
  const locked = task.status !== 'active'
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-0 flex-col bg-muted/40 p-4">
        <div className="mb-3 flex items-start gap-3 rounded-lg border border-dashed bg-card/70 p-3 text-xs text-muted-foreground">
          <Hand className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-foreground">수동 업무</div>
            assistant Task 없이 담당자가 직접 진행하는 업무입니다. 진행 내용은 메모와 첨부로 기록되고, 필요하면 언제든 Task를 추가해 assistant와 함께 진행할 수 있습니다.
          </div>
          {!locked && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" />
              Task 추가
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <NotesPanel taskId={task.id} notes={notes} files={files} scopeToStep={false} placeholder="진행 메모 (예: 회의 결과, 승인 대기, 완료 근거 등)" />
        </div>
      </div>
      <aside className="min-h-0 border-l bg-muted/20">
        <Tabs defaultValue="files" className="flex h-full flex-col gap-0">
          <TabsList className="m-2 grid grid-cols-2">
            <TabsTrigger value="files">파일 {files.length}</TabsTrigger>
            <TabsTrigger value="history">이력</TabsTrigger>
          </TabsList>
          <TabsContent value="files" className="min-h-0 flex-1 px-2 pb-2">
            <FilesPanel taskId={task.id} files={files} steps={steps} />
          </TabsContent>
          <TabsContent value="history" className="min-h-0 flex-1 px-2 pb-2">
            <ActivityPanel activity={activity} steps={steps} />
          </TabsContent>
        </Tabs>
      </aside>
      <InsertStepDialog open={addOpen} onOpenChange={setAddOpen} data={data} afterStepId="" />
    </div>
  )
}
