import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Cpu, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useActor, useSettings } from '@/app/hooks'
import { setStepModel } from '@/db/repositories/tasks'
import { useModelList } from '@/llm/useModelList'
import type { StepInstance } from '@/domain/types'
import { cn } from '@/lib/utils'

interface ModelPickerProps {
  step: StepInstance
  disabled?: boolean
}

/** 채팅 헤더에서 이 단계의 assistant 모델을 바로 바꾼다. 비어 있으면 설정의 기본 모델을 쓴다. */
export function ModelPicker({ step, disabled }: ModelPickerProps) {
  const settings = useSettings()
  const actor = useActor()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const { models, loading, reload } = useModelList(open ? settings?.llm : undefined)

  const override = step.assistant?.modelId ?? ''
  const defaultModel = settings?.llm.model ?? ''
  const effective = override || defaultModel
  const isLive = settings?.llm.mode === 'live'
  const missingOnServer = isLive && models.length > 0 && !models.includes(effective)

  async function choose(modelId: string) {
    if (!actor) return
    await setStepModel(actor, step.id, modelId)
    toast.success(modelId ? `이 단계 모델을 ${modelId}(으)로 변경했습니다.` : '설정의 기본 모델을 사용합니다.')
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
          title="이 단계의 assistant 모델 변경"
        >
          <Cpu className="size-3" />
          {effective || '(모델 없음)'}
          {!override && <span className="text-[9px] opacity-70">기본</span>}
          {missingOnServer && <AlertTriangle className="size-3" />}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold">이 단계의 assistant 모델</div>
          <Button variant="ghost" size="icon-xs" aria-label="모델 목록 새로고침" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn(loading && 'animate-spin')} />
          </Button>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          {isLive ? `Live: ${settings?.llm.baseUrl}/models 목록` : 'Mock 모드: 어떤 모델을 골라도 시나리오 응답이 나옵니다. 실제 호출은 설정에서 Live로 전환하세요.'}
        </p>
        {missingOnServer && (
          <p className="mb-2 rounded border border-amber-300 bg-amber-50 p-1.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            현재 모델 <code>{effective}</code>이(가) 서버 모델 목록에 없습니다. 아래에서 다시 선택하세요.
          </p>
        )}
        <ul className="max-h-48 space-y-0.5 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => void choose('')}
              className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted', !override && 'bg-muted/60')}
            >
              {!override ? <Check className="size-3" /> : <span className="size-3" />}
              설정의 기본 모델 사용 <span className="font-mono text-muted-foreground">({defaultModel || '미설정'})</span>
            </button>
          </li>
          {models.map((m) => (
            <li key={m}>
              <button
                type="button"
                onClick={() => void choose(m)}
                className={cn('flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-muted', override === m && 'bg-muted/60')}
              >
                {override === m ? <Check className="size-3" /> : <span className="size-3" />}
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
