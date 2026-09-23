import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { ArrowRight, BookOpen, ExternalLink, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TopBar } from '@/app/TopBar'
import { useActor, useSettings, useUserMap } from '@/app/hooks'
import { useTagSuggest } from '@/app/useTagSuggest'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { AssistantStatusBadge } from '@/components/StatusBadges'
import { Markdown } from '@/components/Markdown'
import { TagInput } from '@/components/TagInput'
import { UserAvatar } from '@/components/UserAvatar'
import { db } from '@/db/schema'
import { uploadFile } from '@/db/repositories/files'
import { startConversation } from '@/db/repositories/tasks'
import { normalizeTag, tagKey } from '@/domain/tags'
import { Composer } from '@/features/chat/Composer'
import { suggestionsFrom } from '@/features/chat/suggestions'
import type { ConversationHandoff } from '@/features/task/TaskPage'
import { assistantLink1 } from '@/lib/links'

/**
 * 새 대화 초안. 카드를 누르면 바로 여기서 입력할 수 있고,
 * **첫 전송(또는 첨부) 때만** 대화(업무)를 만든다 — 그냥 나가면 빈 업무가 남지 않는다.
 * `?tag=` 로 태그를 미리 채울 수 있다 (칸반 태그 필터·SR 연결 업무 시작).
 */
export function DraftConversationPage() {
  const { assistantId } = useParams()
  const [params] = useSearchParams()
  const assistant = useLiveQuery(() => (assistantId ? db.assistants.get(assistantId) : undefined), [assistantId])
  const actor = useActor()
  const users = useUserMap()
  const settings = useSettings()
  const suggest = useTagSuggest()
  const navigate = useNavigate()
  const [tags, setTags] = useState<string[]>(() => params.getAll('tag').map(normalizeTag).filter(Boolean))
  const [showUsage, setShowUsage] = useState(false)

  if (assistant === undefined) {
    return (
      <>
        <TopBar title="새 대화" />
        <div className="space-y-3 p-6">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      </>
    )
  }
  if (!assistant) return <Navigate to="/" replace />
  const retired = assistant.status === 'retired'
  const owner = users.get(assistant.ownerId)

  async function handleSend(text: string, files: File[]) {
    if (!actor || !assistant) return
    try {
      const { task } = await startConversation(actor, { assistantId: assistant.id, tags })
      const uploaded = await Promise.all(files.map((f) => uploadFile(actor, { taskId: task.id }, f)))
      const handoff: ConversationHandoff = { autoSend: { text: text || `(파일 ${uploaded.length}건 첨부)`, attachmentIds: uploaded.map((f) => f.id) } }
      navigate(`/c/${task.id}`, { replace: true, state: handoff })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '대화를 시작하지 못했습니다.')
      throw e
    }
  }

  return (
    <>
      <TopBar title={`새 대화 · ${assistant.name}`} />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
            <div className="flex items-start gap-3">
              <AssistantAvatar assistant={assistant} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-muted-foreground">
                  {assistant.level1} › {assistant.level2}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold">{assistant.name}</h1>
                  <AssistantStatusBadge status={assistant.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{assistant.summary}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {owner && (
                    <span className="inline-flex items-center gap-1">
                      <UserAvatar user={owner} size="xs" /> {owner.name}
                    </span>
                  )}
                  <Button size="xs" variant="ghost" asChild>
                    <a href={assistantLink1(settings?.llm.baseUrl ?? '', assistant)} target="_blank" rel="noreferrer">
                      <ExternalLink data-icon="inline-start" /> OpenWebUI
                    </a>
                  </Button>
                  {assistant.docUrl && (
                    <Button size="xs" variant="ghost" asChild>
                      <a href={assistant.docUrl} target="_blank" rel="noreferrer">
                        <BookOpen data-icon="inline-start" /> 설명
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {(assistant.expectedInputs.length > 0 || assistant.expectedOutputs.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/30 p-3 text-[11px]">
                {assistant.expectedInputs.map((x) => (
                  <span key={x} className="rounded-full border bg-background px-2 py-0.5">
                    {x}
                  </span>
                ))}
                {assistant.expectedInputs.length > 0 && assistant.expectedOutputs.length > 0 && <ArrowRight className="size-3.5 text-muted-foreground" />}
                {assistant.expectedOutputs.map((x) => (
                  <span key={x} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200">
                    {x}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-medium">태그</div>
              <TagInput
                tags={tags}
                suggest={suggest}
                onAdd={(t) => setTags((cur) => (cur.some((x) => tagKey(x) === tagKey(t)) ? cur : [...cur, t]))}
                onRemove={(t) => setTags((cur) => cur.filter((x) => x !== t))}
                placeholder="SR 번호·키워드"
              />
              <p className="text-[11px] text-muted-foreground">같은 태그를 가진 대화의 산출물이 자료함에 보입니다. 나중에 붙였다 떼도 됩니다.</p>
            </div>

            {assistant.usageExample && (
              <div className="rounded-xl border">
                <button type="button" className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium" onClick={() => setShowUsage((v) => !v)}>
                  <Info className="size-3.5 text-muted-foreground" /> 사용법 {showUsage ? '접기' : '보기'}
                </button>
                {showUsage && <Markdown content={assistant.usageExample} className="border-t px-3 py-2 text-sm" />}
              </div>
            )}

            {retired && (
              <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                폐기된 에이전트입니다. 새 대화를 시작할 수 없습니다. <Link to="/" className="underline">다른 에이전트 고르기</Link>
              </div>
            )}
          </div>
        </div>
        {!retired && (
          <div className="mx-auto w-full max-w-2xl">
            <Composer
              disabled={!actor}
              streaming={false}
              placeholder={`${assistant.name}에게 메시지 — "시작"을 보내면 질문 흐름으로 안내합니다`}
              onSend={(text, files) => handleSend(text, files)}
              onStop={() => undefined}
              suggestions={suggestionsFrom(assistant.usageExample)}
            />
          </div>
        )}
      </div>
    </>
  )
}
