import { db } from '../schema'
import type { Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { ID, StepKey, StepTemplate, WorkflowTemplate } from '@/domain/types'

export const STEP_COLORS: Record<StepKey, string> = {
  URS: '#2563eb',
  FDS: '#7c3aed',
  DEV: '#6b7280',
  TEST: '#d97706',
  PROTOCOL: '#dc2626',
  DEPLOY: '#059669',
  CUSTOM: '#0891b2',
}

export function newStepTemplate(key: StepKey, name: string, partial: Partial<StepTemplate> = {}): StepTemplate {
  const mode = partial.mode ?? 'assistant'
  return {
    id: newId('tstep'),
    key,
    name,
    description: '',
    mode,
    assistant:
      mode === 'assistant'
        ? { modelId: '', displayName: `${name} Assistant`, systemPromptHint: '' }
        : undefined,
    inputSpec: [],
    outputSpec: [],
    checklist: [],
    color: STEP_COLORS[key],
    ...partial,
  }
}

export function newWorkflowTemplate(actor: Actor, name = '새 워크플로우'): WorkflowTemplate {
  return {
    id: newId('tpl'),
    name,
    description: '',
    category: '일반',
    steps: [],
    createdBy: actor.userId,
    updatedAt: nowIso(),
  }
}

export async function saveTemplate(template: WorkflowTemplate): Promise<void> {
  await db.templates.put({ ...template, updatedAt: nowIso() })
}

export async function duplicateTemplate(actor: Actor, templateId: ID): Promise<WorkflowTemplate | undefined> {
  const src = await db.templates.get(templateId)
  if (!src) return undefined
  const copy: WorkflowTemplate = {
    ...src,
    id: newId('tpl'),
    name: `${src.name} (복제)`,
    steps: src.steps.map((s) => ({ ...s, id: newId('tstep'), checklist: s.checklist.map((c) => ({ ...c, id: newId('chk') })) })),
    createdBy: actor.userId,
    updatedAt: nowIso(),
  }
  await db.templates.add(copy)
  return copy
}

export async function deleteTemplate(templateId: ID): Promise<{ ok: boolean; reason?: string }> {
  const inUse = await db.tasks.where('templateId').equals(templateId).count()
  if (inUse > 0) return { ok: false, reason: `이 템플릿을 사용하는 업무가 ${inUse}건 있습니다.` }
  await db.templates.delete(templateId)
  return { ok: true }
}
