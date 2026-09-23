import { Star } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TaskInput } from '@/domain/types'
import { cn } from '@/lib/utils'

type Weight = TaskInput['weight']

interface InputToggleProps {
  weight?: Weight
  onChange: (weight: Weight | null) => void
  disabled?: boolean
  label: string
}

/**
 * 입력 선택: 체크 = 참고 입력, ★ = 주 입력(한 번 클릭 승격).
 * 기본은 체크 하나로 쓰고, 주 입력이 필요할 때만 별을 누른다.
 */
export function InputToggle({ weight, onChange, disabled, label }: InputToggleProps) {
  const isMain = weight === 'main'
  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={isMain ? `${label} 주 입력 해제` : `${label} 주 입력으로 지정`}
            aria-pressed={isMain}
            onClick={() => onChange(isMain ? 'reference' : 'main')}
            className="rounded p-0.5 text-muted-foreground hover:text-amber-500 disabled:opacity-40"
          >
            <Star className={cn('size-3.5', isMain && 'fill-amber-400 text-amber-500')} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{isMain ? '주 입력 (AI에 먼저 전달)' : '주 입력으로 지정'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Checkbox
              checked={!!weight}
              disabled={disabled}
              aria-label={weight ? `${label} 입력 해제` : `${label} 참고 입력으로 선택`}
              onCheckedChange={(v) => onChange(v ? (weight ?? 'reference') : null)}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>{weight ? 'AI 입력에서 빼기' : '참고 입력으로 AI에 전달'}</TooltipContent>
      </Tooltip>
    </span>
  )
}
