import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Bot, Copy, Hand, Library, Plus, Trash2, Workflow } from 'lucide-react'
import { TopBar } from '@/app/TopBar'
import { useActor, useTemplates } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { db } from '@/db/schema'
import { deleteTemplate, duplicateTemplate, newWorkflowTemplate, saveTemplate } from '@/db/repositories/templates'
import { formatDate } from '@/lib/dates'
import { useModules } from '@/features/modules/ModuleLibraryPicker'
import { deleteModule } from '@/db/repositories/modules'
import { STEP_KEY_LABEL } from '@/domain/types'

export function TemplatesPage() {
  const templates = useTemplates()
  const actor = useActor()
  const navigate = useNavigate()
  const modules = useModules()
  const usage = useLiveQuery(async () => {
    const tasks = await db.tasks.toArray()
    const m: Record<string, number> = {}
    for (const t of tasks) m[t.templateId] = (m[t.templateId] ?? 0) + 1
    return m
  }, []) ?? {}

  async function create() {
    if (!actor) return
    const tpl = newWorkflowTemplate(actor)
    await saveTemplate(tpl)
    navigate(`/templates/${tpl.id}`)
  }

  return (
    <>
      <TopBar
        title="워크플로우 템플릿"
        actions={
          <Button size="sm" onClick={create}>
            <Plus data-icon="inline-start" />새 템플릿
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          업무 성격별로 단계·체크리스트·assistant 매핑을 정의합니다. 시스템 assistant에게 "○○ 워크플로우 만들어줘"라고 요청해도 됩니다.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] text-muted-foreground">{t.category}</span>
                  <Link to={`/templates/${t.id}`} className="block text-sm font-semibold hover:underline">
                    {t.name}
                  </Link>
                </div>
                <Workflow className="size-4 shrink-0 text-muted-foreground" />
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{t.description || '설명 없음'}</p>
              <ol className="my-3 flex flex-wrap items-center gap-1">
                {t.steps.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-1">
                    <span
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                      style={{ borderColor: s.mode === 'manual' ? '#d1d5db' : s.color, color: s.mode === 'manual' ? '#6b7280' : undefined }}
                    >
                      {s.mode === 'manual' ? <Hand className="size-3" /> : <Bot className="size-3" />}
                      {s.name}
                    </span>
                    {i < t.steps.length - 1 && <span className="text-muted-foreground/50">›</span>}
                  </li>
                ))}
                {t.steps.length === 0 && <li className="text-[11px] text-muted-foreground">단계 없음</li>}
              </ol>
              <div className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                <span>
                  {t.steps.length}단계 · 업무 {usage[t.id] ?? 0}건 · {formatDate(t.updatedAt)}
                </span>
                <div className="ml-auto flex gap-0.5">
                  <Button variant="ghost" size="icon-xs" aria-label="복제" onClick={() => actor && duplicateTemplate(actor, t.id).then(() => toast.success('복제했습니다.'))}>
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="삭제"
                    className="hover:text-destructive"
                    onClick={async () => {
                      const r = await deleteTemplate(t.id)
                      if (r.ok) toast.success('삭제했습니다.')
                      else toast.error(r.reason)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <h2 className="mt-6 mb-1 flex items-center gap-2 text-sm font-semibold">
          <Library className="size-4" />
          Task 모듈 라이브러리 <span className="font-normal text-muted-foreground">{modules.length}</span>
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          업무를 구성하는 실질 단위입니다. 템플릿 편집기나 업무 화면의 "워크플로우 구성"에서 갈아끼워 쓸 수 있고, 진행 중인 Task를 라이브러리에 저장할 수도 있습니다.
        </p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {modules.map((m) => (
            <div key={m.id} className="flex flex-col rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <span className="size-2 rounded-full" style={{ backgroundColor: m.mode === 'manual' ? '#9ca3af' : m.color }} />
                {m.name}
                {m.mode === 'manual' ? <Hand className="size-3 text-muted-foreground" /> : <Bot className="size-3 text-violet-600" />}
                <span className="ml-auto rounded bg-muted px-1 text-[10px] text-muted-foreground">{STEP_KEY_LABEL[m.key]}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{m.description || '설명 없음'}</p>
              <div className="mt-2 flex items-center text-[10px] text-muted-foreground">
                체크 {m.checklist.length} · {m.assistant?.modelId || (m.mode === 'assistant' ? '기본 모델' : '수동')}
                {m.tags.length > 0 && ` · ${m.tags.join(', ')}`}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="모듈 삭제"
                  className="ml-auto hover:text-destructive"
                  onClick={() => deleteModule(m.id).then(() => toast.success('모듈을 삭제했습니다.'))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
