import type { ActivityLog } from '@/domain/types'

/** 활동 한 줄 요약. payload 키는 리포지토리에서 기록한 것을 그대로 쓴다. */
export function describeActivity(a: ActivityLog): string {
  const p = a.payload
  switch (a.type) {
    case 'checklist.checked':
    case 'checklist.unchecked':
      return String(p.label ?? '')
    case 'file.uploaded':
    case 'file.tagged_output':
      return String(p.name ?? '')
    case 'message.sent':
    case 'note.added':
      return String(p.preview ?? '')
    case 'model.changed':
      return `${String(p.scope ?? '')} → ${String(p.modelId ?? '')}`
    case 'input.selected':
      return `${String(p.name ?? '')} v${String(p.version ?? 1)} · ${p.weight === 'main' ? '주 입력' : '참고'}`
    case 'input.removed':
      return `${String(p.name ?? '')} v${String(p.version ?? 1)}`
    case 'thread.created':
      return String(p.title ?? '')
    case 'feedback.given':
      return '★'.repeat(Number(p.rating ?? 0))
    case 'task.created':
      return String(p.assistantName ?? '')
    case 'task.reopened':
      return p.reason ? `사유: ${String(p.reason)}` : ''
    case 'task.completed':
      return [Number(p.missingRequired ?? 0) > 0 ? `필수 체크 ${String(p.missingRequired)}건 누락` : '', p.reason ? `사유: ${String(p.reason)}` : '']
        .filter(Boolean)
        .join(' · ')
    case 'tag.added':
    case 'tag.removed':
      return String(p.tag ?? '')
    case 'sr.task_started':
      return [p.code, p.taskCode].filter(Boolean).map(String).join(' → ')
    case 'sr.status_changed':
    case 'task.status_changed':
      return `${String(p.from ?? '')} → ${String(p.to ?? '')}`
    default:
      return ''
  }
}
