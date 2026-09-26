import type { InputDelivery, RequestInput } from '@/domain/types'

/** 입력이 AI에 전달되는 방식 — 트레이(전송 전 예상)와 답변의 "사용한 자료"(전송 후 실제)가 같은 말을 쓴다 */
export const DELIVERY_LABEL: Record<InputDelivery, string> = {
  attached: '첨부',
  inline: '본문',
  metadata_only: '이름만',
  failed: '실패',
}

export const DELIVERY_HINT: Record<InputDelivery, string> = {
  attached: 'OpenWebUI 파일로 첨부 — assistant가 자체 방식(검색 등)으로 읽습니다',
  inline: '본문을 요청에 그대로 넣습니다',
  metadata_only: '텍스트 파일이 아니라 이름·형식·크기만 갑니다 — AI는 내용을 읽지 못합니다',
  failed: 'OpenWebUI 전달 실패 — 요청을 보내지 않았습니다',
}

export const DELIVERY_CLASS: Record<InputDelivery, string> = {
  attached: 'border-sky-300 text-sky-700 dark:text-sky-300',
  inline: 'border-border text-muted-foreground',
  metadata_only: 'border-amber-300 text-amber-700 dark:text-amber-300',
  failed: 'border-destructive/50 text-destructive',
}

export function inputTitle(i: RequestInput): string {
  return i.kind === 'file' ? `${i.name} v${i.version}` : `대화 ${i.code}`
}

export function inputDetail(i: RequestInput): string {
  if (i.kind === 'file') return [i.source, i.oneShot ? '이번 메시지만' : undefined].filter(Boolean).join(' · ')
  const scope = i.mode === 'summary' ? '요약' : i.mode === 'messages' ? `고른 메시지 ${i.messageCount}개` : `메시지 ${i.messageCount}개`
  return `${i.assistantName} · ${scope}`
}
