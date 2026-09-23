import { db } from '@/db/schema'
import type { Actor } from '@/db/repositories/activity'
import { createAssistant } from '@/db/repositories/assistants'
import { addTag, startConversation } from '@/db/repositories/tasks'
import { normalizeTag } from '@/domain/tags'
import type { Priority } from '@/domain/types'
import type { ToolCall } from '@/llm'

export interface ProposedAction {
  id: string
  name: string
  args: Record<string, unknown>
  summary: string
  applied?: { ok: boolean; message: string; link?: string }
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function asPriority(v: unknown): Priority {
  return v === 'low' || v === 'high' || v === 'urgent' ? v : 'normal'
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
  const tags = strList(args.tags)
  const summaries: Record<string, () => string> = {
    start_conversation: () => `대화 시작: ${str(args.assistantName, '?')}${args.title ? ` — "${str(args.title)}"` : ''}${tags.length ? ` · 태그 ${tags.join(', ')}` : ''}`,
    create_assistant: () => `에이전트 등록: ${str(args.name)} (${str(args.id)}) — ${str(args.level1)} › ${str(args.level2)}`,
    add_tag: () => `태그 추가: ${str(args.taskCode)} ← ${normalizeTag(str(args.tag))}`,
  }
  return { id: call.id, name: call.name, args, summary: summaries[call.name]?.() ?? call.name }
}

async function findAssistantByName(name: string) {
  const all = await db.assistants.toArray()
  const want = name.toLowerCase()
  return all.find((a) => a.name.toLowerCase() === want) ?? all.find((a) => a.name.toLowerCase().includes(want) || want.includes(a.name.toLowerCase()))
}

/** 제안 적용. 결과 메시지와 이동 링크를 돌려준다. */
export async function applyProposal(actor: Actor, p: ProposedAction): Promise<NonNullable<ProposedAction['applied']>> {
  try {
    switch (p.name) {
      case 'start_conversation': {
        const assistant = await findAssistantByName(str(p.args.assistantName))
        if (!assistant) return { ok: false, message: `"${str(p.args.assistantName)}" 에이전트를 찾을 수 없습니다.` }
        const { task } = await startConversation(actor, {
          assistantId: assistant.id,
          title: str(p.args.title) || undefined,
          tags: strList(p.args.tags),
          priority: asPriority(p.args.priority),
        })
        return { ok: true, message: `${task.code} 대화를 ${assistant.name}와 시작했습니다.`, link: `/c/${task.id}` }
      }
      case 'create_assistant': {
        const users = await db.users.toArray()
        const owner = users.find((u) => u.name === str(p.args.ownerName))
        const a = await createAssistant(actor, {
          id: str(p.args.id),
          name: str(p.args.name, '새 에이전트'),
          level1: str(p.args.level1, '공통'),
          level2: str(p.args.level2, '기타'),
          summary: str(p.args.summary),
          modelId: str(p.args.modelId) || undefined,
          ownerId: owner?.id ?? actor.userId,
          status: 'developing',
          usageExample: '',
          checklistTemplate: [],
        })
        return { ok: true, message: `"${a.name}" 에이전트를 카탈로그 끝에 등록했습니다. 관리에서 모델·링크를 매핑하세요.`, link: '/assistants/manage' }
      }
      case 'add_tag': {
        const task = await db.tasks.where('code').equals(str(p.args.taskCode)).first()
        if (!task) return { ok: false, message: `대화 ${str(p.args.taskCode)}를 찾을 수 없습니다.` }
        const tag = normalizeTag(str(p.args.tag))
        if (!tag) return { ok: false, message: '태그가 비어 있습니다.' }
        const added = await addTag(actor, task.id, tag)
        return { ok: true, message: added ? `${task.code}에 ${tag} 태그를 붙였습니다.` : `${task.code}에는 이미 ${tag} 태그가 있습니다.`, link: `/c/${task.id}` }
      }
      default:
        return { ok: false, message: `알 수 없는 도구: ${p.name}` }
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '적용 실패' }
  }
}
