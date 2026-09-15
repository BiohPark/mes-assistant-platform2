import type { ChatMessageInput, ChatMeta } from './provider'
import type { FileAsset, Message, StepInstance, Task } from '@/domain/types'
import { isTextFile } from '@/db/repositories/files'
import { blobToText } from '@/lib/blob'

const MAX_INLINE_CHARS = 12_000

/**
 * 단계 assistant 호출용 system 메시지.
 * 업무 요약 + 단계 목적 + 입력 파일(텍스트는 본문 인라인, 그 외 메타데이터)을 주입한다.
 * 실서비스에서는 OpenWebUI files API(파일 업로드 → chat 요청의 files 파라미터)로 대체 가능.
 */
export async function buildStepSystemPrompt(task: Task, step: StepInstance, inputFiles: FileAsset[]): Promise<string> {
  const parts: string[] = [
    step.assistant?.systemPromptHint ? `역할 지침: ${step.assistant.systemPromptHint}` : '',
    `## 업무\n- 코드: ${task.code}\n- 제목: ${task.title}\n- 요약: ${task.summary}`,
    `## 현재 단계: ${step.name}\n${step.description}\n- 기대 입력: ${step.inputSpec.join(', ') || '없음'}\n- 기대 산출물: ${step.outputSpec.join(', ') || '없음'}`,
  ]
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

export function toChatMessages(systemPrompt: string, history: Message[]): ChatMessageInput[] {
  return [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((m) => m.status === 'done' && (m.role === 'user' || m.role === 'assistant'))
      .map((m): ChatMessageInput => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]
}

export function stepMeta(task: Task, step: StepInstance, inputFiles: FileAsset[]): ChatMeta {
  return { stepKey: step.key, taskTitle: task.title, stepName: step.name, inputFileNames: inputFiles.map((f) => f.name) }
}
