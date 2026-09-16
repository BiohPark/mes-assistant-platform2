import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bot, Hand, Search } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { db } from '@/db/schema'
import { STEP_KEY_LABEL, type TaskModule } from '@/domain/types'
import { cn } from '@/lib/utils'

interface ModuleLibraryPickerProps {
  /** 선택된 모듈 ID (순서 유지) */
  selected: string[]
  onChange: (ids: string[]) => void
  multiple?: boolean
  className?: string
}

export function useModules(): TaskModule[] {
  return useLiveQuery(() => db.modules.toArray(), []) ?? []
}

/** Task 모듈 라이브러리에서 고르기. multiple=false면 하나만 선택 */
export function ModuleLibraryPicker({ selected, onChange, multiple = true, className }: ModuleLibraryPickerProps) {
  const modules = useModules()
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return modules.filter((m) => !s || `${m.name} ${m.description} ${m.tags.join(' ')} ${m.key}`.toLowerCase().includes(s))
  }, [modules, q])

  function toggle(id: string) {
    if (!multiple) return onChange(selected.includes(id) ? [] : [id])
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="모듈 검색 (이름, 태그, 단계 유형)" className="h-8 pl-8" />
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {filtered.map((m) => {
          const on = selected.includes(m.id)
          const order = selected.indexOf(m.id)
          return (
            <li key={m.id}>
              <label className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2 hover:bg-muted/60', on && 'border-primary/40 bg-primary/5')}>
                <Checkbox checked={on} onCheckedChange={() => toggle(m.id)} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    {multiple && on && <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">{order + 1}</span>}
                    <span className="size-2 rounded-full" style={{ backgroundColor: m.mode === 'manual' ? '#9ca3af' : m.color }} />
                    {m.name}
                    {m.mode === 'manual' ? <Hand className="size-3 text-muted-foreground" /> : <Bot className="size-3 text-violet-600" />}
                    <span className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">{STEP_KEY_LABEL[m.key]}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{m.description || '설명 없음'}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    체크 {m.checklist.length} · {m.assistant?.modelId ? `모델 ${m.assistant.modelId}` : m.mode === 'assistant' ? '기본 모델' : '수동'}
                    {m.tags.length > 0 && ` · ${m.tags.join(', ')}`}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
        {filtered.length === 0 && <li className="p-4 text-center text-xs text-muted-foreground">모듈이 없습니다.</li>}
      </ul>
    </div>
  )
}
