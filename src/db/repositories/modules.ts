import { db } from '../schema'
import type { Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { ID, StepInstance, StepTemplate, TaskModule } from '@/domain/types'

/** StepTemplate(템플릿 단계 정의)을 라이브러리 모듈로 저장 */
export function moduleFromStepTemplate(actor: Actor, step: StepTemplate, tags: string[] = []): TaskModule {
  return {
    ...step,
    id: newId('mod'),
    moduleId: undefined,
    checklist: step.checklist.map((c) => ({ ...c, id: newId('chk') })),
    tags,
    createdBy: actor.userId,
    updatedAt: nowIso(),
  }
}

/** 진행 중 업무의 Task 인스턴스를 라이브러리 모듈로 저장 (체크 상태는 버림) */
export function moduleFromStepInstance(actor: Actor, step: StepInstance, tags: string[] = []): TaskModule {
  return {
    id: newId('mod'),
    key: step.key,
    name: step.name,
    description: step.description,
    mode: step.mode,
    assistant: step.assistant,
    inputSpec: [...step.inputSpec],
    outputSpec: [...step.outputSpec],
    checklist: step.checklist.map((c) => ({ id: newId('chk'), label: c.label, required: c.required })),
    color: step.color,
    tags,
    createdBy: actor.userId,
    updatedAt: nowIso(),
  }
}

/** 모듈을 템플릿 단계 정의로 복사 (moduleId로 출처 유지) */
export function stepTemplateFromModule(mod: TaskModule): StepTemplate {
  const { tags: _t, createdBy: _c, updatedAt: _u, ...rest } = mod
  return { ...rest, id: newId('tstep'), moduleId: mod.id, checklist: mod.checklist.map((c) => ({ ...c, id: newId('chk') })) }
}

export async function saveModule(mod: TaskModule): Promise<void> {
  await db.modules.put({ ...mod, updatedAt: nowIso() })
}

export async function deleteModule(id: ID): Promise<void> {
  await db.modules.delete(id)
}
