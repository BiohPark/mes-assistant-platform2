import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { Loader2, Sparkles, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useActor, useSettings, useUserMap } from '@/app/hooks'
import { db } from '@/db/schema'
import { applyConversationSummary, selectConversation, type LoadedConversationInput } from '@/db/repositories/conversationInputs'
import { formatSize } from '@/db/repositories/files'
import { eligibleMessages } from '@/domain/conversationContext'
import { resolveModel } from '@/domain/modelResolution'
import { DEFAULT_REQUEST_BUDGET_BYTES, byteLength } from '@/domain/requestBudget'
import type { Assistant, ContextMode, Message, Task } from '@/domain/types'
import { createProvider } from '@/llm'
import { summarizeConversation } from '@/llm/conversationSummary'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface ConversationPickerDialogProps {
  /** 입력을 쓰는 현재 대화와 그 에이전트 (요약 모델 결정용) */
  task: Task
  assistant: Assistant
  source: Task
  sourceAssistant?: Assistant
  current?: LoadedConversationInput
  initialMode?: ContextMode
  onClose: () => void
}

/**
 * 참조 대화 세부 조절: 전체 원문(기본) / 메시지 선택 / 요약.
 * 요약은 누를 때만 만들고, 확인·수정한 뒤에 적용한다 (자동 요약·자동 절단 없음).
 */
export function ConversationPickerDialog({ task, assistant, source, sourceAssistant, current, initialMode, onClose }: ConversationPickerDialogProps) {
  const actor = useActor()
  const settings = useSettings()
  const users = useUserMap()
  const all = useLiveQuery(() => (source.threadId ? db.messages.where('threadId').equals(source.threadId).sortBy('createdAt') : []), [source.threadId])
  const messages = eligibleMessages(all ?? [])
  const [mode, setMode] = useState<ContextMode>(initialMode ?? current?.snapshot.mode ?? 'full')
  const [picked, setPicked] = useState<Set<string> | undefined>(() => (current?.snapshot.mode === 'messages' ? new Set(current.snapshot.messageIds) : undefined))
  const [anchor, setAnchor] = useState<number>()
  const [main, setMain] = useState(current?.input.weight === 'main')
  const [summary, setSummary] = useState(current?.snapshot.summaryText ?? '')
  const [summaryMeta, setSummaryMeta] = useState<{ source: 'ai' | 'rule'; model?: string } | undefined>(
    current?.snapshot.summarySource ? { source: current.snapshot.summarySource, model: current.snapshot.summaryModel } : undefined,
  )
  const [busy, setBusy] = useState(false)
  const limit = settings?.requestBudgetBytes ?? DEFAULT_REQUEST_BUDGET_BYTES

  const selectedIds = picked ?? new Set(messages.map((m) => m.id))
  const chosen = messages.filter((m) => selectedIds.has(m.id))
  const scopeMessages = mode === 'full' ? messages : chosen
  const bytes = mode === 'summary' ? byteLength(summary) : scopeMessages.reduce((n, m) => n + byteLength(m.content), 0)
  const weight = main ? 'main' : 'reference'

  function toggle(index: number, shift: boolean) {
    const next = new Set(selectedIds)
    const target = messages[index]
    const on = !next.has(target.id)
    const [from, to] = shift && anchor !== undefined ? [Math.min(anchor, index), Math.max(anchor, index)] : [index, index]
    for (let i = from; i <= to; i++) (on ? next.add(messages[i].id) : next.delete(messages[i].id))
    setPicked(next)
    setAnchor(index)
  }

  async function act(run: () => Promise<unknown>, done: string) {
    if (!actor) return
    setBusy(true)
    try {
      await run()
      toast.success(done)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function makeSummary() {
    if (!settings) return
    setBusy(true)
    try {
      const model = resolveModel({ task, assistant, settings: settings.llm }).modelId
      const userMap = new Map([...users].map(([id, u]) => [id, { name: u.name, role: u.role }]))
      const r = await summarizeConversation(createProvider(settings.llm), model, chosen, userMap, { limitBytes: limit })
      setSummary(r.text)
      setSummaryMeta({ source: r.source, model: r.model })
    } catch (e) {
      toast.error('요약을 만들지 못했습니다.', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (mode === 'summary') {
      const meta = summaryMeta ?? { source: 'rule' as const }
      return act(() => applyConversationSummary(actor!, task.id, source.id, { text: summary, source: meta.source, model: meta.model, messageIds: chosen.map((m) => m.id) }, weight), '요약을 입력으로 적용했습니다.')
    }
    return act(
      () => selectConversation(actor!, task.id, source.id, { weight, mode, messageIds: mode === 'messages' ? chosen.map((m) => m.id) : undefined }),
      mode === 'full' ? '대화 전체를 입력으로 골랐습니다.' : `고른 메시지 ${chosen.length}개를 입력으로 골랐습니다.`,
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="font-mono text-xs text-muted-foreground">{source.code}</span>
            <span className="truncate">{source.title}</span>
          </DialogTitle>
          <DialogDescription>
            {sourceAssistant?.name} 대화를 이 대화의 AI 입력으로 씁니다. 선택한 시점으로 고정되며, 원본에 새 메시지가 생기면 갱신을 안내합니다. 참조 대화가 쓴 파일은 따라오지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as ContextMode)}>
          <TabsList className="w-full">
            <TabsTrigger value="full" className="flex-1">전체 원문</TabsTrigger>
            <TabsTrigger value="messages" className="flex-1">메시지 선택</TabsTrigger>
            <TabsTrigger value="summary" className="flex-1">요약</TabsTrigger>
          </TabsList>
          <TabsContent value="full" className="text-xs text-muted-foreground">
            완료된 사용자·assistant 메시지 {messages.length}개를 그대로 보냅니다. 팀 의견·실패한 응답은 빠집니다.
            <Preview messages={messages} />
          </TabsContent>
          <TabsContent value="messages" className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{chosen.length}/{messages.length}개 선택 · Shift+클릭으로 범위 선택</span>
              <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setPicked(new Set(messages.map((m) => m.id)))}>전체</Button>
              <Button variant="ghost" size="xs" onClick={() => setPicked(new Set())}>해제</Button>
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
              {messages.map((m, i) => (
                <li key={m.id}>
                  <label className={cn('flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-muted', selectedIds.has(m.id) && 'bg-muted/60')}>
                    <Checkbox
                      checked={selectedIds.has(m.id)}
                      onClick={(e) => {
                        e.preventDefault()
                        toggle(i, e.shiftKey)
                      }}
                      aria-label={`${i + 1}번째 메시지 선택`}
                      className="mt-0.5"
                    />
                    <MessageLine message={m} author={m.authorId ? users.get(m.authorId)?.name : undefined} />
                  </label>
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="summary" className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {picked ? `고른 메시지 ${chosen.length}개` : `전체 메시지 ${messages.length}개`}를 요약합니다(범위는 "메시지 선택"에서 조정). 만든 요약은 확인·수정한 뒤 적용하세요.
            </p>
            <Button variant="outline" size="sm" onClick={() => void makeSummary()} disabled={busy || chosen.length === 0}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              {summary ? '다시 요약' : '요약 만들기'}
            </Button>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={8} placeholder="요약을 만들거나 직접 작성하세요" className="text-sm" />
          </TabsContent>
        </Tabs>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <label className="inline-flex items-center gap-1.5">
              <Checkbox checked={main} onCheckedChange={(v) => setMain(!!v)} />
              <Star className={cn('size-3.5', main && 'fill-amber-400 text-amber-500')} /> 주 입력
            </label>
            <span className={cn(bytes > limit && 'font-medium text-destructive')}>전달 크기 약 {formatSize(bytes)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={() => void apply()} disabled={busy || !actor || (mode === 'messages' && chosen.length === 0) || (mode === 'summary' && !summary.trim())}>
              {mode === 'full' ? '전체 원문으로 선택' : mode === 'messages' ? `고른 메시지 ${chosen.length}개로 선택` : '요약 적용'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MessageLine({ message, author }: { message: Message; author?: string }) {
  return (
    <div className="min-w-0 flex-1 text-xs">
      <div className="flex gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{message.role === 'user' ? (author ?? '사용자') : 'assistant'}</span>
        <span>{formatDateTime(message.createdAt)}</span>
      </div>
      <p className="line-clamp-2 whitespace-pre-wrap">{message.content}</p>
    </div>
  )
}

function Preview({ messages }: { messages: Message[] }) {
  return (
    <ul className="mt-1.5 max-h-60 space-y-1 overflow-y-auto rounded-md border p-2 text-foreground">
      {messages.map((m) => (
        <li key={m.id}>
          <MessageLine message={m} />
        </li>
      ))}
    </ul>
  )
}
