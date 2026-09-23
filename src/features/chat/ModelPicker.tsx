import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Cpu, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useActor, useSettings } from '@/app/hooks'
import { setTaskModel, setThreadModel } from '@/db/repositories/tasks'
import { MODEL_SOURCE_LABEL, resolveModel } from '@/domain/modelResolution'
import { useModelList } from '@/llm/useModelList'
import type { Assistant, Task, Thread } from '@/domain/types'
import { cn } from '@/lib/utils'

interface ModelPickerProps {
  assistant: Assistant
  /** 대화(=업무). SR 접수 대화에서는 없고 스레드에 지정한다 */
  task?: Task
  thread?: Thread
  disabled?: boolean
}

/**
 * 채팅 헤더의 모델 선택. 대화 1개 = 스레드 1개이므로 적용 범위는 "이 대화" 하나다.
 * 결정 순서: 이 대화 > 에이전트 매핑(modelId) > 공통 기본 모델.
 */
export function ModelPicker({ assistant, task, thread, disabled }: ModelPickerProps) {
  const settings = useSettings()
  const actor = useActor()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const { models, loading, reload } = useModelList(open ? settings?.llm : undefined)

  const resolved = resolveModel({ thread, task, assistant, settings: settings?.llm })
  const isLive = settings?.llm.mode === 'live'
  const missingOnServer = isLive && models.length > 0 && !models.includes(resolved.modelId)

  // 예전 데이터의 스레드 지정도 "이 대화"로 본다
  const current = thread?.modelId || task?.modelId || ''
  const chain: Array<{ label: string; value: string; active: boolean }> = [
    { label: '이 대화', value: current, active: resolved.source === 'thread' || resolved.source === 'task' },
    { label: '에이전트 매핑', value: assistant.modelId ?? '', active: resolved.source === 'assistant' },
    { label: '공통 기본', value: settings?.llm.model ?? '', active: resolved.source === 'settings' },
  ]

  async function choose(modelId: string) {
    if (!actor) return
    if (task) {
      await setTaskModel(actor, task.id, modelId)
      if (thread?.modelId) await setThreadModel(actor, thread.id, '')
    } else if (thread) {
      await setThreadModel(actor, thread.id, modelId)
    } else {
      toast.error('아직 대화가 없습니다. 메시지를 보낸 뒤 모델을 바꿀 수 있습니다.')
      return
    }
    toast.success(modelId ? `이 대화 모델을 ${modelId}(으)로 설정했습니다.` : '이 대화 지정을 해제했습니다. 에이전트 매핑/공통 기본을 따릅니다.')
    setOpen(false)
    setCustom('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-md border bg-background px-1.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground',
            missingOnServer && 'border-amber-400 text-amber-700',
          )}
          title="이 대화의 모델 변경"
        >
          <Cpu className="size-3" />
          {resolved.modelId || '(모델 없음)'}
          <span className="text-[9px] opacity-70">{MODEL_SOURCE_LABEL[resolved.source]}</span>
          {missingOnServer && <AlertTriangle className="size-3" />}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold">assistant 모델</div>
          <Button variant="ghost" size="icon-xs" aria-label="모델 목록 새로고침" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn(loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="mb-2 rounded-md border bg-muted/40 p-2 text-[10px] leading-relaxed text-muted-foreground">
          {chain.map((c, i) => (
            <span key={c.label}>
              {i > 0 && <span className="mx-1 opacity-50">›</span>}
              <span className={cn(c.active && 'font-semibold text-foreground')}>
                {c.label}: <span className="font-mono">{c.value || '–'}</span>
              </span>
            </span>
          ))}
        </div>


        {missingOnServer && (
          <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            현재 모델 <code>{resolved.modelId}</code>이(가) 서버 모델 목록에 없습니다.
          </p>
        )}
        {!isLive && <p className="mb-2 text-[10px] text-muted-foreground">Mock 모드: 어떤 모델을 골라도 시나리오 응답이 나옵니다. 실제 호출은 설정에서 Live로 전환하세요.</p>}

        <ul className="max-h-44 space-y-0.5 overflow-y-auto">
          <li>
            <button type="button" onClick={() => void choose('')} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted', !current && 'bg-muted/60')}>
              {!current ? <Check className="size-3" /> : <span className="size-3" />}
              지정 안 함 <span className="text-muted-foreground">(에이전트 매핑 → 공통 기본)</span>
            </button>
          </li>
          {models.map((m) => (
            <li key={m}>
              <button type="button" onClick={() => void choose(m)} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted', current === m && 'bg-muted/60')}>
                {current === m ? <Check className="size-3" /> : <span className="size-3" />}
                {m}
              </button>
            </li>
          ))}
          {!loading && models.length === 0 && <li className="px-2 py-1 text-[11px] text-muted-foreground">모델 목록을 가져오지 못했습니다. 아래에 직접 입력하세요.</li>}
        </ul>
        <form
          className="mt-2 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.trim()) void choose(custom.trim())
          }}
        >
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="모델 ID 직접 입력" className="h-7 font-mono text-xs" />
          <Button type="submit" size="sm" disabled={!custom.trim()}>
            적용
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
