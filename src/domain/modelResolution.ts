import type { LlmSettings, StepInstance, Task, Thread, WorkflowTemplate } from './types'

export type ModelSource = 'thread' | 'step' | 'task' | 'template' | 'settings'

export interface ResolvedModel {
  modelId: string
  source: ModelSource
}

export const MODEL_SOURCE_LABEL: Record<ModelSource, string> = {
  thread: '이 대화',
  step: '이 단계',
  task: '이 업무 기본',
  template: '워크플로우 기본',
  settings: '설정 기본',
}

/**
 * assistant 모델 결정 순서: 대화(스레드) > 단계 > 업무 > 워크플로우 템플릿 > 설정.
 * 빈 문자열은 "지정 안 함"으로 본다.
 */
export function resolveModel(input: {
  thread?: Pick<Thread, 'modelId'>
  step?: Pick<StepInstance, 'assistant'>
  task?: Pick<Task, 'defaultModelId'>
  template?: Pick<WorkflowTemplate, 'defaultModelId'>
  settings?: Pick<LlmSettings, 'model'>
}): ResolvedModel {
  if (input.thread?.modelId) return { modelId: input.thread.modelId, source: 'thread' }
  if (input.step?.assistant?.modelId) return { modelId: input.step.assistant.modelId, source: 'step' }
  if (input.task?.defaultModelId) return { modelId: input.task.defaultModelId, source: 'task' }
  if (input.template?.defaultModelId) return { modelId: input.template.defaultModelId, source: 'template' }
  return { modelId: input.settings?.model ?? '', source: 'settings' }
}
