import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import { ArrowRight, Play, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { Markdown } from '@/components/Markdown'
import { SrStatusBadge, TaskStatusBadge } from '@/components/StatusBadges'
import { TagChip } from '@/components/TagChip'
import { UserAvatar } from '@/components/UserAvatar'
import { useActor, useAssistants, useSettings, useUserMap } from '@/app/hooks'
import { db } from '@/db/schema'
import { conversationsForSr, startTaskFromSr } from '@/db/repositories/sr'
import { MessageBubble } from '@/features/chat/MessageBubble'
import { FileList } from '@/features/task/FileList'
import { ShareResultDialog } from './ShareResultDialog'
import { SrTitleEditor } from './SrTitleEditor'
import type { Assistant, FileAsset, ServiceRequest, Task } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'

interface SrDetailSheetProps {
  sr: ServiceRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** SR 트레이스: 같은 SR 태그 대화를 에이전트 순서대로 (강제 순서 없이 진행 현황만) */
function SrTrace({ conversations, assistants }: { conversations: Task[]; assistants: Map<string, Assistant> }) {
  if (conversations.length === 0) return <p className="text-xs text-muted-foreground">아직 이 SR 태그를 가진 대화가 없습니다.</p>
  const ordered = [...conversations].sort((a, b) => (assistants.get(a.assistantId)?.order ?? 0) - (assistants.get(b.assistantId)?.order ?? 0) || a.createdAt.localeCompare(b.createdAt))
  return (
    <ol className="flex items-stretch gap-1 overflow-x-auto pb-1">
      {ordered.map((t, i) => {
        const a = assistants.get(t.assistantId)
        return (
          <li key={t.id} className="flex shrink-0 items-center gap-1">
            {i > 0 && <ArrowRight className="size-3 text-muted-foreground" />}
            <Link to={`/c/${t.id}`} className="flex w-40 flex-col gap-1 rounded-lg border bg-card p-2 hover:shadow-sm">
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {a && <AssistantAvatar assistant={a} size="xs" className="size-4 rounded text-[8px]" />}
                <span className="truncate">{a?.name ?? t.assistantId}</span>
              </span>
              <span className="line-clamp-2 text-xs font-medium">{t.title}</span>
              <span className="flex items-center gap-1 text-[10px]">
                <span className="font-mono text-muted-foreground">{t.code}</span>
                <TaskStatusBadge status={t.status} className="ml-auto h-4 px-1.5 text-[10px]" />
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

export function SrDetailSheet({ sr, open, onOpenChange }: SrDetailSheetProps) {
  const actor = useActor()
  const users = useUserMap()
  const assistants = useAssistants()
  const settings = useSettings()
  const navigate = useNavigate()
  const [assistantId, setAssistantId] = useState('')
  const [busy, setBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const detail = useLiveQuery(async () => {
    const [messages, files, conversations] = await Promise.all([
      db.messages.where('threadId').equals(sr.threadId).sortBy('createdAt'),
      db.files.bulkGet(sr.attachmentIds),
      conversationsForSr(sr.code),
    ])
    return { messages, files: files.filter((f): f is FileAsset => !!f), conversations }
  }, [sr.id, sr.threadId, sr.code, sr.attachmentIds.join(',')])

  const asstById = new Map(assistants.map((a) => [a.id, a]))
  const targets = assistants.filter((a) => a.status !== 'retired').sort((a, b) => a.order - b.order)
  const fileMap = new Map((detail?.files ?? []).map((f) => [f.id, f]))
  const intake = settings?.srIntakeAssistantId ? asstById.get(settings.srIntakeAssistantId) : undefined
  // 같은 에이전트로 이미 진행 중인 이 SR 대화 → 이어가기 후보
  const existing = (detail?.conversations ?? []).filter((t) => t.assistantId === assistantId && t.status !== 'done')

  async function startNew() {
    if (!actor || !assistantId) return
    setBusy(true)
    try {
      const task = await startTaskFromSr(actor, sr.id, assistantId)
      toast.success(`${task.code} 대화를 시작했습니다. ${sr.code} 태그가 붙어 있습니다.`)
      onOpenChange(false)
      navigate(`/c/${task.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '시작하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <SrStatusBadge status={sr.status} />
            {sr.code && <TagChip tag={sr.code} onClick={(t) => navigate(`/?view=kanban&tag=${encodeURIComponent(t)}`)} />}
            <SrTitleEditor key={sr.id + sr.title} sr={sr} />
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <UserAvatar user={users.get(sr.requesterId)} size="xs" showName />
            <span>· 접수 {formatDateTime(sr.submittedAt)}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 px-4 pb-6">
          <section>
            <h4 className="mb-1 text-xs font-semibold">본문</h4>
            <div className="rounded-lg border bg-muted/30 p-3">
              <Markdown content={sr.body || '(내용 없음)'} className="text-xs" />
            </div>
          </section>

          {detail && detail.files.length > 0 && (
            <section>
              <h4 className="mb-1 text-xs font-semibold">첨부 {detail.files.length}</h4>
              <FileList files={detail.files} canDelete={false} dense />
            </section>
          )}

          <section className="grid gap-2">
            <h4 className="text-xs font-semibold">진행 현황 · {sr.code} 태그 대화 {detail?.conversations.length ?? 0}</h4>
            <SrTrace conversations={detail?.conversations ?? []} assistants={asstById} />
          </section>

          <section className="grid gap-2 rounded-lg border bg-muted/30 p-3">
            <h4 className="text-xs font-semibold">연결 업무 시작</h4>
            <p className="text-[11px] text-muted-foreground">
              고른 에이전트로 새 대화를 만들고 <b>{sr.code}</b> 태그를 붙입니다. 같은 태그 대화의 산출물과 SR 첨부가 자료함에 보이고, 필요한 것만 골라 AI에 넘깁니다.
            </p>
            <Select value={assistantId} onValueChange={setAssistantId}>
              <SelectTrigger size="sm">
                <SelectValue placeholder="에이전트 선택" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.level2}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {existing.length > 0 && (
              <div className="grid gap-1 rounded-md border bg-background p-2">
                <div className="text-[11px] font-medium">이미 이 SR로 진행 중인 대화가 있습니다</div>
                {existing.map((t) => (
                  <Button key={t.id} size="sm" variant="outline" className="justify-start" asChild>
                    <Link to={`/c/${t.id}`} onClick={() => onOpenChange(false)}>
                      <Play data-icon="inline-start" />
                      이어가기 · {t.code} {t.title}
                    </Link>
                  </Button>
                ))}
              </div>
            )}
            <Button size="sm" onClick={() => void startNew()} disabled={!assistantId || busy || !actor || !sr.code}>
              {existing.length > 0 ? '새 대화로 시작' : '대화 시작'}
            </Button>
          </section>

          <section>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold">요청자에게 공유한 결과 {sr.results.length}</h4>
              <Button size="xs" onClick={() => setShareOpen(true)} disabled={!actor}>
                <Share2 data-icon="inline-start" />
                결과 공유
              </Button>
            </div>
            {sr.results.length === 0 ? (
              <p className="text-xs text-muted-foreground">아직 공유한 결과가 없습니다. 요청자는 여기서 공유한 내용만 볼 수 있습니다.</p>
            ) : (
              <ul className="space-y-1">
                {[...sr.results].reverse().map((r) => (
                  <li key={r.id} className="rounded-md border px-2 py-1.5 text-xs">
                    <div className="mb-0.5 text-[10px] text-muted-foreground">
                      {users.get(r.by)?.name} · {formatDateTime(r.at)}
                      {r.fileIds.length > 0 && ` · 파일 ${r.fileIds.length}`}
                    </div>
                    <Markdown content={r.text} className="text-xs" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="mb-1 text-xs font-semibold">접수 대화</h4>
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border p-3">
              {detail?.messages.length === 0 && <p className="text-xs text-muted-foreground">대화 없음</p>}
              {detail?.messages.map((m) => (
                <MessageBubble key={m.id} message={m} files={fileMap} assistantName={intake?.name ?? 'SR 접수'} />
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
      {shareOpen && <ShareResultDialog open onOpenChange={setShareOpen} sr={sr} />}
    </Sheet>
  )
}
