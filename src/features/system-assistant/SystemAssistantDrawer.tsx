import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Bot, Check, Sparkles, Trash2, Wrench } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { useActor, useSettings } from '@/app/hooks'
import { useUiStore } from '@/app/uiStore'
import { createProvider, type ChatMessageInput } from '@/llm'
import { SYSTEM_ASSISTANT_PROMPT, SYSTEM_TOOLS } from '@/llm/tools'
import { Composer } from '@/features/chat/Composer'
import { applyProposal, toProposal, type ProposedAction } from './actions'
import { cn } from '@/lib/utils'

interface LocalMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposals?: ProposedAction[]
  streaming?: boolean
}

const EXAMPLES = ['긴급 업무 "EBR 연동 오류 조치" 만들어줘', '요구사항-개발-테스트-배포 4단계 워크플로우 "간이 변경" 만들어줘', 'ET-2026-0031 에 "보안 검토" 단계 추가해줘']

/** 플랫폼 조작용 시스템 assistant. 액션은 제안 카드로 보여주고 사용자가 확인 후 적용한다. */
export function SystemAssistantDrawer() {
  const open = useUiStore((s) => s.assistantOpen)
  const setOpen = useUiStore((s) => s.setAssistantOpen)
  const settings = useSettings()
  const actor = useActor()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function send(text: string) {
    if (!settings || !text.trim()) return
    const userMsg: LocalMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    const botId = crypto.randomUUID()
    setMessages((m) => [...m, userMsg, { id: botId, role: 'assistant', content: '', streaming: true }])
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    const history: ChatMessageInput[] = [
      { role: 'system', content: SYSTEM_ASSISTANT_PROMPT },
      ...[...messages, userMsg].map((m): ChatMessageInput => ({ role: m.role, content: m.content })),
    ]
    const provider = createProvider(settings.llm)
    let acc = ''
    const proposals: ProposedAction[] = []
    let error: string | undefined
    try {
      for await (const chunk of provider.stream({ model: settings.llm.model, messages: history, tools: SYSTEM_TOOLS, signal: controller.signal, meta: { systemAssistant: true } })) {
        if (chunk.type === 'delta') {
          acc += chunk.text
          setMessages((m) => m.map((x) => (x.id === botId ? { ...x, content: acc } : x)))
        } else if (chunk.type === 'tool_call') {
          proposals.push(toProposal(chunk.call))
        } else if (chunk.type === 'error') {
          error = chunk.message
        }
      }
    } finally {
      abortRef.current = null
      setStreaming(false)
      setMessages((m) => m.map((x) => (x.id === botId ? { ...x, content: acc || (error ? `⚠️ ${error}` : ''), proposals, streaming: false } : x)))
    }
  }

  async function apply(msgId: string, p: ProposedAction) {
    if (!actor) return
    const result = await applyProposal(actor, p)
    setMessages((m) =>
      m.map((x) => (x.id === msgId ? { ...x, proposals: x.proposals?.map((q) => (q.id === p.id ? { ...q, applied: result } : q)) } : x)),
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" />
            </span>
            시스템 assistant
            <span className="mr-6 ml-auto text-[10px] font-normal text-muted-foreground">{settings?.llm.mode === 'live' ? settings.llm.model : 'Mock (규칙 기반)'}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">업무 생성, 워크플로우 템플릿 생성, 단계 추가를 자연어로 요청하세요. 제안을 확인한 뒤 적용합니다.</SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">예시:</p>
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => void send(e)} className="block w-full rounded-lg border bg-card px-3 py-2 text-left text-xs hover:bg-muted">
                  {e}
                </button>
              ))}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
              {m.role === 'assistant' && (
                <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="size-3.5" />
                </span>
              )}
              <div className={cn('max-w-[88%] space-y-2', m.role === 'user' && 'text-right')}>
                <div className={cn('inline-block rounded-2xl px-3 py-2 text-left', m.role === 'user' ? 'rounded-tr-sm bg-primary text-primary-foreground' : 'rounded-tl-sm border bg-card')}>
                  {m.content ? <Markdown content={m.content} className={cn('text-xs', m.role === 'user' && '[&_code]:bg-white/20')} /> : m.streaming ? <span className="text-xs text-muted-foreground">생각 중…</span> : null}
                </div>
                {m.proposals?.map((p) => (
                  <div key={p.id} className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-left">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium">
                      <Wrench className="size-3" />
                      제안된 작업
                    </div>
                    <div className="mt-1 text-xs">{p.summary}</div>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] text-muted-foreground">인자 보기</summary>
                      <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(p.args, null, 2)}</pre>
                    </details>
                    <div className="mt-2 flex items-center gap-2">
                      {p.applied ? (
                        <>
                          <span className={cn('inline-flex items-center gap-1 text-[11px]', p.applied.ok ? 'text-emerald-700' : 'text-destructive')}>
                            <Check className="size-3" />
                            {p.applied.message}
                          </span>
                          {p.applied.link && (
                            <Button
                              variant="link"
                              size="xs"
                              className="h-auto p-0"
                              onClick={() => {
                                navigate(p.applied!.link!)
                                setOpen(false)
                              }}
                            >
                              이동 <ArrowRight />
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button size="xs" onClick={() => void apply(m.id, p)} disabled={!actor}>
                          적용
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {messages.length > 0 && (
          <div className="flex justify-end px-4 pb-1">
            <Button variant="ghost" size="xs" onClick={() => setMessages([])}>
              <Trash2 data-icon="inline-start" />
              대화 지우기
            </Button>
          </div>
        )}
        <Composer disabled={!settings} streaming={streaming} onSend={(t) => send(t)} onStop={() => abortRef.current?.abort()} placeholder="무엇을 만들까요?" allowAttachments={false} />
      </SheetContent>
    </Sheet>
  )
}
