import { useState } from 'react'
import { Bot, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TopBar } from '@/app/TopBar'
import { useAssistants, useSettings } from '@/app/hooks'
import { EmptyState } from '@/components/EmptyState'
import { useModelList } from '@/llm/useModelList'
import type { Assistant } from '@/domain/types'
import { AssistantEditorSheet } from './AssistantEditorSheet'
import { AssistantTable } from './AssistantTable'

type EditorState = { open: false } | { open: true; assistant?: Assistant }

export function ManagePage() {
  const assistants = useAssistants()
  const settings = useSettings()
  const [q, setQ] = useState('')
  const [editor, setEditor] = useState<EditorState>({ open: false })
  const modelList = useModelList(settings?.llm)

  const filtered = assistants
    .filter((a) => !q || `${a.name} ${a.id} ${a.level1} ${a.level2} ${a.summary}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.order - b.order)

  return (
    <>
      <TopBar
        title="에이전트 관리"
        actions={
          <Button size="sm" onClick={() => setEditor({ open: true })}>
            <Plus data-icon="inline-start" />새 에이전트
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <p className="mb-3 text-xs text-muted-foreground">순서는 홈 카드의 편집 모드(System Owner)에서 바꿉니다. 모델 ID를 비우면 설정의 공통 기본 모델로 대화합니다.</p>
        <div className="relative mb-3 w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · ID · 분류 검색" className="h-8 pl-8" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Bot} title="에이전트가 없습니다" action={<Button onClick={() => setEditor({ open: true })}>새 에이전트</Button>} />
        ) : (
          <AssistantTable
            assistants={filtered}
            baseUrl={settings?.llm.baseUrl ?? ''}
            models={modelList.models}
            defaultModel={settings?.llm.model ?? ''}
            onEdit={(assistant) => setEditor({ open: true, assistant })} />
        )}
      </div>
      {editor.open && (
        <AssistantEditorSheet key={editor.assistant?.id ?? 'new'} open onOpenChange={(o) => !o && setEditor({ open: false })} assistant={editor.assistant} />
      )}
    </>
  )
}
