import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Cpu, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useActor, useSettings } from '@/app/hooks'
import { setStepModel, setTaskModel, setThreadModel } from '@/db/repositories/tasks'
import { MODEL_SOURCE_LABEL, resolveModel } from '@/domain/modelResolution'
import { useModelList } from '@/llm/useModelList'
import type { StepInstance, Task, Thread, WorkflowTemplate } from '@/domain/types'
import { cn } from '@/lib/utils'

type Scope = 'thread' | 'step' | 'task'

interface ModelPickerProps {
  task: Task
  step: StepInstance
  thread?: Thread
  template?: WorkflowTemplate
  disabled?: boolean
}

const SCOPES: Array<{ key: Scope; label: string; hint: string }> = [
  { key: 'thread', label: '이 대화만', hint: '현재 스레드에서만 사용. 새 스레드는 단계/업무 기본값을 따름' },
  { key: 'step', label: '이 단계', hint: '이 업무의 이 단계에서 열리는 모든 대화' },
  { key: 'task', label: '업무 기본', hint: '이 업무 전체의 기본 모델 (단계 지정이 없을 때)' },
]

/**
 * 채팅 헤더의 모델 선택. 적용 범위(대화/단계/업무)를 고르고 모델을 지정한다.
 * 결정 순서: 대화 > 단계 > 업무 > 워크플로우 템플릿 > 설정.
 */
export function ModelPicker({ task, step, thread, template, disabled }: ModelPickerProps) {
  const settings = useSettings()
  const actor = useActor()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<Scope>('step')
  const [custom, setCustom] = useState('')
  const { models, loading, reload } = useModelList(open ? settings?.llm : undefined)

  const resolved = resolveModel({ thread, step, task, template, settings: settings?.llm })
  const isLive = settings?.llm.mode === 'live'
  const missingOnServer = isLive && models.length > 0 && !models.includes(resolved.modelId)

  const currentOf: Record<Scope, string> = {
    thread: thread?.modelId ?? '',
    step: step.assistant?.modelId ?? '',
    task: task.defaultModelId ?? '',
  }
  const chain: Array<{ label: string; value: string }> = [
    { label: '이 대화', value: currentOf.thread },
    { label: '이 단계', value: currentOf.step },
    { label: '업무 기본', value: currentOf.task },
    { label: '워크플로우 기본', value: template?.defaultModelId ?? '' },
    { label: '설정 기본', value: settings?.llm.model ?? '' },
  ]

  async function choose(modelId: string) {
    if (!actor) return
    if (scope === 'thread') {
      if (!thread) {
        toast.error('아직 대화가 없습니다. 메시지를 보낸 뒤 이 대화의 모델을 바꿀 수 있습니다.')
        return
      }
      await setThreadModel(actor, thread.id, modelId)
    } else if (scope === 'step') {
      await setStepModel(actor, step.id, modelId)
    } else {
      await setTaskModel(actor, task.id, modelId)
    }
    const scopeLabel = SCOPES.find((s) => s.key === scope)?.label
    toast.success(modelId ? `${scopeLabel} 모델을 ${modelId}(으)로 설정했습니다.` : `${scopeLabel} 지정을 해제했습니다. 상위 기본값을 따릅니다.`)
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
          title="assistant 모델 변경 (대화 / 단계 / 업무)"
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
              <span className={cn(c.value && resolved.modelId === c.value && MODEL_SOURCE_LABEL[resolved.source] === c.label && 'font-semibold text-foreground')}>
                {c.label}: <span className="font-mono">{c.value || '–'}</span>
              </span>
            </span>
          ))}
        </div>

        <div className="mb-2 grid grid-cols-3 gap-1">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setScope(s.key)}
              title={s.hint}
              className={cn('rounded-md border px-2 py-1 text-[11px]', scope === s.key ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted')}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mb-2 text-[10px] text-muted-foreground">{SCOPES.find((s) => s.key === scope)?.hint}</p>

        {missingOnServer && (
          <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            현재 모델 <code>{resolved.modelId}</code>이(가) 서버 모델 목록에 없습니다.
          </p>
        )}
        {!isLive && <p className="mb-2 text-[10px] text-muted-foreground">Mock 모드: 어떤 모델을 골라도 시나리오 응답이 나옵니다. 실제 호출은 설정에서 Live로 전환하세요.</p>}

        <ul className="max-h-44 space-y-0.5 overflow-y-auto">
          <li>
            <button type="button" onClick={() => void choose('')} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted', !currentOf[scope] && 'bg-muted/60')}>
              {!currentOf[scope] ? <Check className="size-3" /> : <span className="size-3" />}
              지정 안 함 <span className="text-muted-foreground">(상위 기본값 사용)</span>
            </button>
          </li>
          {models.map((m) => (
            <li key={m}>
              <button type="button" onClick={() => void choose(m)} className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted', currentOf[scope] === m && 'bg-muted/60')}>
                {currentOf[scope] === m ? <Check className="size-3" /> : <span className="size-3" />}
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
