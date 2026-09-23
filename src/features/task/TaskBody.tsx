import { ExternalLink, FileText, History, ListChecks, MessageSquare, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSettings } from '@/app/hooks'
import { useIsDesktop } from '@/app/useMediaQuery'
import { ChatView } from '@/features/chat/ChatView'
import { assistantLink1 } from '@/lib/links'
import { ActivityPanel } from './ActivityPanel'
import { ChecklistPanel } from './ChecklistPanel'
import { MaterialsPanel } from './MaterialsPanel'
import { NotesPanel } from './NotesPanel'
import type { TaskData } from './useTaskData'

interface TaskBodyProps {
  data: TaskData
  initialMessage?: { text: string; attachmentIds: string[] }
  onInitialSent?: () => void
}

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="text-[10px] text-muted-foreground">{n}</span> : null
}

/** 대화 화면 본문: 가운데 채팅, 오른쪽 [자료 | 체크 | 노트 | 히스토리]. 모바일은 탭 전환. */
export function TaskBody({ data, initialMessage, onInitialSent }: TaskBodyProps) {
  const { task, assistant, files, notes, activity } = data
  const settings = useSettings()
  const readOnly = task.status === 'done'
  const isDesktop = useIsDesktop()
  const checklistOpen = task.checklist.filter((c) => !c.checked).length

  const chat = (
    <ChatView scope={{ kind: 'task', task, assistant }} files={files} readOnly={readOnly} initialMessage={initialMessage} onInitialSent={onInitialSent} />
  )
  const materials = <MaterialsPanel data={data} readOnly={readOnly} />
  const checklist = <ChecklistPanel task={task} assistant={assistant} readOnly={readOnly} />
  const notesPanel = <NotesPanel taskId={task.id} notes={notes} files={files} />
  const history = <ActivityPanel activity={activity} />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 레이아웃은 하나만 마운트 (ChatView 훅이 중복 구독하지 않도록) */}
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px]">
          <section className="min-h-0">{chat}</section>
          <aside className="min-h-0 overflow-hidden border-l p-3">
            <Tabs defaultValue="materials" className="flex h-full min-h-0 flex-col">
              <TabsList className="w-full">
                <TabsTrigger value="materials" className="flex-1">
                  <FileText /> 자료 <Count n={task.inputs.length} />
                </TabsTrigger>
                <TabsTrigger value="checklist" className="flex-1">
                  <ListChecks /> 체크 <Count n={checklistOpen} />
                </TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">
                  <StickyNote /> 노트 <Count n={notes.length} />
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1" aria-label="히스토리">
                  <History />
                </TabsTrigger>
              </TabsList>
              <TabsContent value="materials" className="min-h-0 flex-1 overflow-hidden">
                {materials}
              </TabsContent>
              <TabsContent value="checklist" className="min-h-0 flex-1 overflow-y-auto">
                {checklist}
              </TabsContent>
              <TabsContent value="notes" className="min-h-0 flex-1 overflow-hidden">
                {notesPanel}
              </TabsContent>
              <TabsContent value="history" className="min-h-0 flex-1 overflow-hidden">
                {history}
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      ) : (
        <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-3 mt-2">
            <TabsTrigger value="chat">
              <MessageSquare /> 대화
            </TabsTrigger>
            <TabsTrigger value="materials">
              <FileText /> 자료 <Count n={task.inputs.length} />
            </TabsTrigger>
            <TabsTrigger value="checklist">
              <ListChecks /> 체크
            </TabsTrigger>
            <TabsTrigger value="more">
              <StickyNote /> 노트
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="min-h-0 flex-1">
            {chat}
          </TabsContent>
          <TabsContent value="materials" className="min-h-0 flex-1 overflow-hidden p-3">
            {materials}
          </TabsContent>
          <TabsContent value="checklist" className="min-h-0 flex-1 overflow-y-auto p-3">
            {checklist}
          </TabsContent>
          <TabsContent value="more" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            <div className="h-72">{notesPanel}</div>
            <div className="h-72">{history}</div>
          </TabsContent>
        </Tabs>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t bg-card px-4 py-2">
        <Button size="sm" variant="ghost" className="ml-auto" asChild>
          <a href={assistantLink1(settings?.llm.baseUrl ?? '', assistant)} target="_blank" rel="noreferrer">
            <ExternalLink data-icon="inline-start" />
            OpenWebUI에서 열기
          </a>
        </Button>
      </div>
    </div>
  )
}
