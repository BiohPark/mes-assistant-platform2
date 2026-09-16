import type { ChatMessageInput, ChatMeta } from './provider'
import type { FileAsset, ID, Message, StepInstance, Task, User } from '@/domain/types'
import { isTextFile } from '@/db/repositories/files'
import { blobToText } from '@/lib/blob'

const MAX_INLINE_CHARS = 12_000

export type UserMap = Map<ID, Pick<User, 'name' | 'role'>>

/** 대화에 참여한 사용자(메시지 작성자) 목록. 2명 이상이면 다중 참여 대화로 취급한다. */
export function threadParticipants(history: Message[], users: UserMap): Array<{ id: ID; name: string; role: string }> {
  const seen = new Map<ID, { id: ID; name: string; role: string }>()
  for (const m of history) {
    if (m.role !== 'user' || !m.authorId || seen.has(m.authorId)) continue
    const u = users.get(m.authorId)
    seen.set(m.authorId, { id: m.authorId, name: u?.name ?? m.authorId, role: u?.role ?? '' })
  }
  return [...seen.values()]
}

/**
 * 단계 assistant 호출용 system 메시지.
 * 업무 요약 + 단계 목적 + 입력 파일(텍스트는 본문 인라인, 그 외 메타데이터) + 참여자 안내를 주입한다.
 * 실서비스에서는 OpenWebUI files API(파일 업로드 → chat 요청의 files 파라미터)로 대체 가능.
 */
export async function buildStepSystemPrompt(
  task: Task,
  step: StepInstance,
  inputFiles: FileAsset[],
  participants: Array<{ name: string; role: string }> = [],
): Promise<string> {
  const parts: string[] = [
    step.assistant?.systemPromptHint ? `역할 지침: ${step.assistant.systemPromptHint}` : '',
    `## 업무\n- 코드: ${task.code}\n- 제목: ${task.title}\n- 요약: ${task.summary}`,
    `## 현재 단계: ${step.name}\n${step.description}\n- 기대 입력: ${step.inputSpec.join(', ') || '없음'}\n- 기대 산출물: ${step.outputSpec.join(', ') || '없음'}`,
  ]
  if (participants.length >= 2) {
    parts.push(
      `## 참여자 (다중 참여 대화)\n${participants.map((p) => `- ${p.name}${p.role ? ` (${p.role})` : ''}`).join('\n')}\n` +
        `사용자 메시지는 "[이름] 내용" 형식으로 발화자를 표시한다. 누가 무엇을 요청했는지 구분해서 답하고, 특정 참여자에게 확인이 필요하면 이름을 지목해서 질문한다.`,
    )
  }
  if (inputFiles.length) {
    const rendered = await Promise.all(
      inputFiles.map(async (f) => {
        if (isTextFile(f)) {
          const text = (await blobToText(f.blob)).slice(0, MAX_INLINE_CHARS)
          return `### 파일: ${f.name}\n${text}`
        }
        return `### 파일: ${f.name} (${f.mime}, ${f.size} bytes) — 본문은 인라인하지 않음`
      }),
    )
    parts.push(`## 입력 파일\n${rendered.join('\n\n')}`)
  }
  return parts.filter(Boolean).join('\n\n')
}

/**
 * 스레드 이력을 chat/completions 메시지로 변환.
 * 참여자가 2명 이상이면 user 메시지에 "[이름]" 접두어를 붙여 표준 API에서도 발화자를 구분할 수 있게 한다.
 */
export function toChatMessages(systemPrompt: string, history: Message[], users: UserMap = new Map()): ChatMessageInput[] {
  const multi = threadParticipants(history, users).length >= 2
  return [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.status === 'done' && (m.role === 'user' || m.role === 'assistant'))
      .map((m): ChatMessageInput => {
        if (m.role === 'user' && multi) {
          const name = (m.authorId && users.get(m.authorId)?.name) || '참여자'
          return { role: 'user', content: `[${name}] ${m.content}` }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content }
      }),
  ]
}

export function stepMeta(task: Task, step: StepInstance, inputFiles: FileAsset[]): ChatMeta {
  return { stepKey: step.key, taskTitle: task.title, stepName: step.name, inputFileNames: inputFiles.map((f) => f.name) }
}
