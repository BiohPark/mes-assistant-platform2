import { db } from '@/db/schema'
import type { Actor } from '@/db/repositories/activity'
import { createTaskFromTemplate, insertStepAfter } from '@/db/repositories/tasks'
import { newStepTemplate, newWorkflowTemplate, saveTemplate } from '@/db/repositories/templates'
import { STEP_KEYS, type Priority, type StepKey, type StepMode } from '@/domain/types'
import type { ToolCall } from '@/llm'

export interface ProposedAction {
  id: string
  name: string
  args: Record<string, unknown>
  summary: string
  applied?: { ok: boolean; message: string; link?: string }
}

interface StepArg {
  key?: string
  name?: string
  mode?: string
  checklist?: string[]
}

function asStepKey(v: unknown): StepKey {
  return typeof v === 'string' && (STEP_KEYS as readonly string[]).includes(v) ? (v as StepKey) : 'CUSTOM'
}
function asMode(v: unknown, key: StepKey): StepMode {
  if (v === 'manual' || v === 'assistant') return v
  return key === 'DEV' ? 'manual' : 'assistant'
}
function asPriority(v: unknown): Priority {
  return v === 'low' || v === 'high' || v === 'urgent' ? v : 'normal'
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** 도구 호출을 사용자에게 보여줄 제안으로 변환 (인자 JSON 파싱 실패는 안전하게 처리) */
export function toProposal(call: ToolCall): ProposedAction {
  let args: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(call.arguments || '{}')
    if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
  } catch {
    args = {}
  }
  let summary = call.name
  if (call.name === 'create_task') summary = `업무 생성: "${str(args.title, '(제목 없음)')}" — 템플릿 ${str(args.templateName, '?')}`
  if (call.name === 'create_template') {
    const steps = Array.isArray(args.steps) ? (args.steps as StepArg[]) : []
    summary = `템플릿 생성: "${str(args.name, '(이름 없음)')}" — ${steps.map((s) => s.name).join(' → ')}`
  }
  if (call.name === 'add_step_to_task') summary = `단계 추가: ${str(args.taskCode)} 에 "${str(args.name)}"`
  return { id: call.id, name: call.name, args, summary }
}

/** 제안 적용. 결과 메시지와 이동 링크를 돌려준다. */
export async function applyProposal(actor: Actor, p: ProposedAction): Promise<NonNullable<ProposedAction['applied']>> {
  try {
    switch (p.name) {
      case 'create_task': {
        const templates = await db.templates.toArray()
        const want = str(p.args.templateName).toLowerCase()
        const tpl = templates.find((t) => t.name.toLowerCase() === want) ?? templates.find((t) => t.name.toLowerCase().includes(want)) ?? templates[0]
        if (!tpl) return { ok: false, message: '사용할 템플릿이 없습니다.' }
        const task = await createTaskFromTemplate(actor, {
          title: str(p.args.title, '새 업무'),
          summary: str(p.args.summary),
          templateId: tpl.id,
          ownerId: actor.userId,
          assigneeIds: [actor.userId],
          priority: asPriority(p.args.priority),
          tags: Array.isArray(p.args.tags) ? (p.args.tags as unknown[]).map(String) : [],
        })
        return { ok: true, message: `${task.code} 업무를 생성했습니다.`, link: `/tasks/${task.id}` }
      }
      case 'create_template': {
        const tpl = newWorkflowTemplate(actor, str(p.args.name, '새 워크플로우'))
        const steps = Array.isArray(p.args.steps) ? (p.args.steps as StepArg[]) : []
        const built = {
          ...tpl,
          description: str(p.args.description),
          category: str(p.args.category, '일반'),
          steps: steps.map((s) => {
            const key = asStepKey(s.key)
            return newStepTemplate(key, str(s.name, key), {
              mode: asMode(s.mode, key),
              checklist: (s.checklist ?? []).map((label, i) => ({ id: `c${i}`, label: String(label), required: true })),
            })
          }),
        }
        await saveTemplate(built)
        return { ok: true, message: `"${built.name}" 템플릿을 만들었습니다. 편집기에서 세부 조정하세요.`, link: `/templates/${built.id}` }
      }
      case 'add_step_to_task': {
        const task = await db.tasks.where('code').equals(str(p.args.taskCode)).first()
        if (!task) return { ok: false, message: `업무 ${str(p.args.taskCode)}를 찾을 수 없습니다.` }
        const key = asStepKey(p.args.key)
        const stepTpl = newStepTemplate(key, str(p.args.name, '새 단계'), {
          mode: asMode(p.args.mode, key),
          checklist: (Array.isArray(p.args.checklist) ? (p.args.checklist as unknown[]) : []).map((l, i) => ({ id: `c${i}`, label: String(l), required: true })),
        })
        await insertStepAfter(actor, task.id, task.currentStepId, stepTpl)
        return { ok: true, message: `${task.code}에 "${stepTpl.name}" 단계를 추가했습니다.`, link: `/tasks/${task.id}` }
      }
      default:
        return { ok: false, message: `알 수 없는 도구: ${p.name}` }
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '적용 실패' }
  }
}
