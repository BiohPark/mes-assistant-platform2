import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { appendMessage, createThread, updateMessage } from '@/db/repositories/chat'
import { getSettings } from '@/db/repositories/settings'
import { createProvider } from '@/llm'
import { buildStepSystemPrompt, stepMeta, threadParticipants, toChatMessages } from '@/llm/context'
import { resolveModel } from '@/domain/modelResolution'
import type { Actor } from '@/db/repositories/activity'
import type { FileAsset, Message, StepInstance, Task, Thread, WorkflowTemplate } from '@/domain/types'

const FLUSH_INTERVAL_MS = 250

export interface ChatState {
  threads: Thread[]
  activeThread?: Thread
  messages: Message[]
  streaming: boolean
  send: (text: string, attachmentIds?: string[]) => Promise<void>
  stop: () => void
  newThread: () => Promise<void>
}

/** 단계별 스레드 대화. 스트리밍 중에는 로컬 상태로 표시하고 주기적으로 DB에 반영한다. */
export function useChat(actor: Actor | undefined, task: Task, step: StepInstance, files: FileAsset[], template?: WorkflowTemplate): ChatState {
  const threads = useLiveQuery(() => db.threads.where('stepInstanceId').equals(step.id).sortBy('createdAt'), [step.id]) ?? []
  const activeThread = threads.find((t) => t.id === step.activeThreadId) ?? threads.at(-1)
  const dbMessages =
    useLiveQuery(() => (activeThread ? db.messages.where('threadId').equals(activeThread.id).sortBy('createdAt') : []), [activeThread?.id]) ?? []

  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const messages = dbMessages.map((m) => (m.id === streamingId ? { ...m, content: streamingText } : m))

  const newThread = useCallback(async () => {
    if (!actor) return
    await createThread(actor, task.id, step.id)
  }, [actor, task.id, step.id])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string, attachmentIds: string[] = []) => {
      if (!actor || !text.trim()) return
      let thread = activeThread
      if (!thread) thread = await createThread(actor, task.id, step.id)

      await appendMessage(actor, thread.id, 'user', text.trim(), attachmentIds)
      const history = await db.messages.where('threadId').equals(thread.id).sortBy('createdAt')
      const placeholder = await appendMessage(null, thread.id, 'assistant', '', [], 'streaming')
      setStreamingId(placeholder.id)
      setStreamingText('')

      const settings = await getSettings()
      const provider = createProvider(settings.llm)
      const users = new Map((await db.users.toArray()).map((x) => [x.id, { name: x.name, role: x.role }]))
      const inputFiles = files.filter((f) => step.inputFileIds.includes(f.id) || attachmentIds.includes(f.id))
      const systemPrompt = await buildStepSystemPrompt(task, step, inputFiles, threadParticipants(history, users))
      const { modelId } = resolveModel({ thread, step, task, template, settings: settings.llm })

      const controller = new AbortController()
      abortRef.current = controller
      let acc = ''
      let lastFlush = Date.now()
      let error: string | undefined

      try {
        for await (const chunk of provider.stream({
          model: modelId,
          messages: toChatMessages(systemPrompt, history, users),
          signal: controller.signal,
          meta: stepMeta(task, step, inputFiles),
        })) {
          if (chunk.type === 'delta') {
            acc += chunk.text
            setStreamingText(acc)
            if (Date.now() - lastFlush > FLUSH_INTERVAL_MS) {
              lastFlush = Date.now()
              await updateMessage(placeholder.id, { content: acc })
            }
          } else if (chunk.type === 'error') {
            error = chunk.message
          }
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      } finally {
        abortRef.current = null
        await updateMessage(placeholder.id, {
          content: acc || (error ? `⚠️ ${error}` : ''),
          status: error ? 'error' : 'done',
          error,
        })
        setStreamingId(null)
        setStreamingText('')
      }
    },
    [actor, activeThread, task, step, files, template],
  )

  return { threads, activeThread, messages, streaming: streamingId !== null, send, stop, newThread }
}
