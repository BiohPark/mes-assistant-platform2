import type { ToolDefinition } from './provider'
import { STEP_KEYS } from '@/domain/types'

/** 시스템 assistant가 플랫폼을 조작할 때 쓰는 도구 정의 (OpenAI function calling 형식) */
export const SYSTEM_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: '새 업무를 워크플로우 템플릿 기반으로 생성한다.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          templateName: { type: 'string', description: '사용할 워크플로우 템플릿 이름' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'templateName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_template',
      description: '새 워크플로우 템플릿을 만든다.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', enum: [...STEP_KEYS] },
                name: { type: 'string' },
                mode: { type: 'string', enum: ['assistant', 'manual'] },
                checklist: { type: 'array', items: { type: 'string' } },
              },
              required: ['key', 'name'],
            },
          },
        },
        required: ['name', 'steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_step_to_task',
      description: '진행 중인 업무에 단계를 추가한다 (현재 단계 뒤에 삽입).',
      parameters: {
        type: 'object',
        properties: {
          taskCode: { type: 'string', description: '예: ET-2026-0031' },
          key: { type: 'string', enum: [...STEP_KEYS] },
          name: { type: 'string' },
          mode: { type: 'string', enum: ['assistant', 'manual'] },
          checklist: { type: 'array', items: { type: 'string' } },
        },
        required: ['taskCode', 'name'],
      },
    },
  },
]

export const SYSTEM_ASSISTANT_PROMPT = `당신은 MES Assistant Workflow Platform의 시스템 assistant입니다.
사용자가 업무 생성, 워크플로우 템플릿 생성, 단계 추가를 요청하면 반드시 제공된 도구(function)를 호출하세요.
도구 호출 전에 한두 문장으로 무엇을 만들지 요약하세요. 도구 호출 결과는 사용자가 확인 후 적용합니다.
단계 key는 URS/FDS/DEV/TEST/PROTOCOL/DEPLOY/CUSTOM 중 하나이며, 개발(DEV)은 보통 manual 모드입니다.
그 외 질문에는 플랫폼 사용법을 간단히 안내하세요.`
