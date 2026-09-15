import type { ToolCall } from './provider'
import type { StepKey } from '@/domain/types'

interface MockSystemResult {
  text: string
  toolCalls: ToolCall[]
}

const STEP_HINTS: Array<{ pattern: RegExp; key: StepKey; name: string; mode: 'assistant' | 'manual' }> = [
  { pattern: /urs|요구사항|분석/i, key: 'URS', name: 'URS 요구사항 분석', mode: 'assistant' },
  { pattern: /fds|기능\s*명세|설계/i, key: 'FDS', name: 'FDS 기능명세', mode: 'assistant' },
  { pattern: /개발|dev|구현|등록/i, key: 'DEV', name: '개발', mode: 'manual' },
  { pattern: /테스트|test/i, key: 'TEST', name: '테스트', mode: 'assistant' },
  { pattern: /프로토콜|protocol|검증|qa/i, key: 'PROTOCOL', name: '테스트 프로토콜 검증', mode: 'assistant' },
  { pattern: /배포|deploy|반영/i, key: 'DEPLOY', name: '배포 및 배포 검증', mode: 'assistant' },
]

function quoted(text: string): string | undefined {
  const m = /["'“”「](.+?)["'“”」]/.exec(text)
  return m?.[1]
}

function guessSteps(text: string) {
  const found = STEP_HINTS.filter((h) => h.pattern.test(text))
  const list = found.length >= 2 ? found : STEP_HINTS.filter((h) => h.key !== 'PROTOCOL')
  return list.map((h) => ({ key: h.key, name: h.name, mode: h.mode, checklist: [`${h.name} 완료 확인`] }))
}

/** 규칙 기반 시스템 assistant. 실제 LLM 없이도 업무/템플릿 생성 시연이 가능하다. */
export function mockSystemAssistant(userText: string): MockSystemResult {
  const t = userText.trim()
  const wantsCreate = /(만들|생성|추가|등록|새로)/.test(t)
  const isTemplate = /(워크플로우|템플릿|workflow|template)/i.test(t)
  const isStep = /단계/.test(t) && /ET-\d{4}-\d{4}/.test(t)

  if (isStep && wantsCreate) {
    const taskCode = /ET-\d{4}-\d{4}/.exec(t)![0]
    const hint = STEP_HINTS.find((h) => h.pattern.test(t.replace(/단계/g, ''))) ?? STEP_HINTS[4]
    const name = quoted(t) ?? hint.name
    return {
      text: `${taskCode} 업무의 현재 단계 뒤에 "${name}" 단계를 추가하겠습니다. 아래 제안을 확인 후 적용해 주세요.`,
      toolCalls: [
        {
          id: 'mock_add_step',
          name: 'add_step_to_task',
          arguments: JSON.stringify({ taskCode, key: hint.key, name, mode: hint.mode, checklist: [`${name} 완료 확인`] }),
        },
      ],
    }
  }

  if (isTemplate && wantsCreate) {
    const name = quoted(t) ?? (/(긴급|hotfix)/i.test(t) ? '긴급 변경 워크플로우' : /마스터/.test(t) ? '마스터 데이터 변경' : '새 워크플로우')
    const steps = guessSteps(t)
    return {
      text: `"${name}" 템플릿을 ${steps.length}단계로 구성했습니다: ${steps.map((s) => s.name).join(' → ')}. 확인 후 적용하면 템플릿 편집기에서 세부 조정할 수 있습니다.`,
      toolCalls: [
        {
          id: 'mock_create_template',
          name: 'create_template',
          arguments: JSON.stringify({ name, description: t.slice(0, 120), category: '일반', steps }),
        },
      ],
    }
  }

  if (/(업무|task|작업)/i.test(t) && wantsCreate) {
    const stripped = t.replace(/(업무|task|작업|를|을|만들어|생성해|추가해|줘|주세요|새로|새)/gi, '').trim()
    const title = quoted(t) ?? (stripped || '새 업무')
    const templateName = /(긴급|hotfix|장애)/i.test(t) ? '긴급 변경 (Hotfix)' : /마스터/.test(t) ? '장비 마스터 변경' : 'Syncade ET 표준 개발'
    const priority = /(긴급|urgent)/i.test(t) ? 'urgent' : /(높|high|중요)/i.test(t) ? 'high' : 'normal'
    return {
      text: `"${title}" 업무를 "${templateName}" 템플릿으로 생성하겠습니다. 담당자는 현재 사용자로 지정됩니다.`,
      toolCalls: [
        {
          id: 'mock_create_task',
          name: 'create_task',
          arguments: JSON.stringify({ title, summary: t, templateName, priority, tags: [] }),
        },
      ],
    }
  }

  return {
    text: `시스템 assistant입니다. 다음과 같은 요청을 처리할 수 있습니다.

- **업무 생성**: "긴급 업무 'EBR 연동 오류 조치' 만들어줘"
- **워크플로우 템플릿 생성**: "요구사항-개발-테스트-배포 4단계 워크플로우 '간이 변경' 만들어줘"
- **단계 추가**: "ET-2026-0031 에 '보안 검토' 단계 추가해줘"

실제 LLM 연결(설정 → live 모드) 시에는 자유로운 자연어로 요청할 수 있습니다.`,
    toolCalls: [],
  }
}
