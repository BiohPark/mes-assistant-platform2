const DEFAULT_SUGGESTIONS = ['시작', '선택한 입력 기준으로 초안 작성해줘', '누락된 항목 확인 질문 만들어줘']
const MAX_SUGGESTIONS = 4

/**
 * 사용예시 markdown의 `- "…"` 줄을 제안 칩으로.
 * OpenWebUI 샘플처럼 "시작"으로 질문 흐름을 여는 칩을 항상 맨 앞에 둔다.
 */
export function suggestionsFrom(usageExample: string): string[] {
  const found = [...usageExample.matchAll(/^-\s*"(.+?)"\s*$/gm)].map((m) => m[1])
  if (found.length === 0) return DEFAULT_SUGGESTIONS
  return ['시작', ...found.filter((x) => x !== '시작')].slice(0, MAX_SUGGESTIONS)
}
