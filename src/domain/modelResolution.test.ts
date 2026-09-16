import { describe, it, expect } from 'vitest'
import { resolveModel } from './modelResolution'

describe('resolveModel', () => {
  const settings = { model: 'glm-5.2' }

  it('falls back to settings when nothing is set', () => {
    expect(resolveModel({ settings })).toEqual({ modelId: 'glm-5.2', source: 'settings' })
  })

  it('prefers template, then task, then step, then thread', () => {
    const template = { defaultModelId: 'tpl-model' }
    expect(resolveModel({ template, settings }).source).toBe('template')
    const task = { defaultModelId: 'task-model' }
    expect(resolveModel({ task, template, settings })).toEqual({ modelId: 'task-model', source: 'task' })
    const step = { assistant: { modelId: 'step-model', displayName: '', systemPromptHint: '' } }
    expect(resolveModel({ step, task, template, settings }).modelId).toBe('step-model')
    const thread = { modelId: 'thread-model' }
    expect(resolveModel({ thread, step, task, template, settings })).toEqual({ modelId: 'thread-model', source: 'thread' })
  })

  it('treats empty strings as unset', () => {
    const step = { assistant: { modelId: '', displayName: '', systemPromptHint: '' } }
    expect(resolveModel({ thread: { modelId: '' }, step, task: { defaultModelId: '' }, settings }).source).toBe('settings')
  })
})
