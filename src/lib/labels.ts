import type { ActivityType, Priority, StepStatus, TaskStatus } from '@/domain/types'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  active: '진행 중',
  done: '완료',
  on_hold: '보류',
}

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: '대기',
  in_progress: '진행 중',
  done: '완료',
  skipped: '건너뜀',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
  urgent: '긴급',
}

export const PRIORITY_CLASS: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  normal: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  high: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  urgent: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  'task.created': '업무 생성',
  'task.completed': '업무 완료',
  'task.reopened': '업무 재개',
  'task.hold': '업무 보류',
  'step.started': '단계 시작',
  'step.completed': '단계 완료',
  'step.skipped': '단계 건너뜀',
  'step.reopened': '단계 되돌림',
  'step.mode_changed': '진행 방식 변경',
  'step.model_changed': 'assistant 모델 변경',
  'step.navigated': '단계 이동',
  'checklist.checked': '체크리스트 완료',
  'checklist.unchecked': '체크리스트 해제',
  'file.uploaded': '파일 업로드',
  'file.tagged_output': '산출물 지정',
  'file.selected_input': '입력 파일 선택',
  'note.added': '메모 작성',
  'message.sent': '메시지 전송',
  'thread.created': '스레드 생성',
  'feedback.given': 'assistant 피드백',
}
