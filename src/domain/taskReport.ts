import type { ActivityLog, FileAsset, StepInstance, Task, User } from './types'

export interface TaskReportInput {
  task: Task
  steps: StepInstance[]
  files: FileAsset[]
  activity: ActivityLog[]
  users: User[]
  now?: Date
}

const DAY_MS = 86_400_000

function days(start?: string, end?: string, now = new Date()): string {
  if (!start) return '-'
  const e = end ? new Date(end) : now
  return (Math.round(((e.getTime() - new Date(start).getTime()) / DAY_MS) * 10) / 10).toFixed(1)
}

/** 업무 완료 리포트(마크다운). 단계별 소요/체크리스트/산출물/되돌리기/피드백을 요약한다. */
export function buildTaskReport({ task, steps, files, activity, users, now = new Date() }: TaskReportInput): string {
  const userName = (id?: string) => users.find((u) => u.id === id)?.name ?? '-'
  const fileById = new Map(files.map((f) => [f.id, f]))
  const reopens = activity.filter((a) => a.type === 'step.reopened')
  const skips = activity.filter((a) => a.type === 'step.skipped')
  const manualSteps = steps.filter((s) => s.mode === 'manual')

  const lines: string[] = [
    `# 업무 완료 리포트 — ${task.code}`,
    '',
    `- 제목: ${task.title}`,
    `- 담당: ${userName(task.ownerId)} / 참여: ${task.assigneeIds.map(userName).join(', ')}`,
    `- 기간: ${task.createdAt.slice(0, 10)} ~ ${(task.completedAt ?? now.toISOString()).slice(0, 10)} (총 ${days(task.createdAt, task.completedAt, now)}일)`,
    task.externalRef ? `- 외부 시스템: ${task.externalRef.system} ${task.externalRef.id} (${task.externalRef.url})` : '',
    '',
    '## 단계별 요약',
    '| # | 단계 | 방식 | 상태 | 소요(일) | 체크리스트 | 완료자 | 산출물 |',
    '|---|---|---|---|---|---|---|---|',
    ...steps.map((s, i) => {
      const chk = `${s.checklist.filter((c) => c.checked).length}/${s.checklist.length}`
      const outs = s.outputFileIds.map((id) => fileById.get(id)?.name ?? id).join(', ') || '-'
      return `| ${i + 1} | ${s.name} | ${s.mode === 'manual' ? '수동' : 'assistant'} | ${s.status} | ${days(s.startedAt, s.completedAt, now)} | ${chk} | ${userName(s.completedBy)} | ${outs} |`
    }),
    '',
    '## 프로세스 신호 (비효율 분석)',
    `- 되돌리기: ${reopens.length}회${reopens.length ? ' — ' + reopens.map((r) => `${String(r.payload.stepName ?? '')}${r.payload.reason ? `(${String(r.payload.reason)})` : ''}`).join(', ') : ''}`,
    `- 건너뛰기: ${skips.length}회${skips.length ? ' — ' + skips.map((r) => String(r.payload.stepName ?? '')).join(', ') : ''}`,
    `- 수동 진행 단계: ${manualSteps.length}개${manualSteps.length ? ' — ' + manualSteps.map((s) => s.name).join(', ') : ''}`,
    `- 필수 체크 미완료 상태로 완료된 단계: ${
      activity.filter((a) => a.type === 'step.completed' && Number(a.payload.missingRequired ?? 0) > 0).length
    }개`,
    '',
    '## assistant 피드백 (스킬/지식 업그레이드 자료)',
    ...(steps.some((s) => s.feedback)
      ? steps
          .filter((s) => s.feedback)
          .map((s) => `- **${s.name}** (${'★'.repeat(s.feedback!.rating)}${'☆'.repeat(5 - s.feedback!.rating)}, ${userName(s.feedback!.by)}): ${s.feedback!.comment || '-'}`)
      : ['- 기록된 피드백 없음']),
    '',
    '## 산출물 목록',
    ...(files.length
      ? files.map((f) => `- ${f.name} (${f.source === 'assistant' ? 'assistant 생성' : '업로드'}, ${userName(f.uploadedBy)}, ${f.uploadedAt.slice(0, 10)})`)
      : ['- 없음']),
    '',
    `_생성: ${now.toISOString()}_`,
  ]
  return lines.filter((l) => l !== undefined).join('\n')
}
