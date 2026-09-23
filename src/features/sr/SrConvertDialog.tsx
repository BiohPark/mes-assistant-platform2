import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useActor, useSettings } from '@/app/hooks'
import { submitSr, updateSrContent } from '@/db/repositories/sr'
import { getSettings } from '@/db/repositories/settings'
import { draftFromConversation } from '@/domain/srDraft'
import type { Assistant, FileAsset, Message, ServiceRequest, TitleSource } from '@/domain/types'
import { createProvider } from '@/llm'
import { suggestTitle } from '@/llm/title'
import { resolveModel } from '@/domain/modelResolution'

interface SrConvertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sr: ServiceRequest
  intake: Assistant
  messages: Message[]
  files: FileAsset[]
}

const REFINE_PROMPT = '다음 대화를 서비스 요청(SR)으로 정리하라. 첫 줄은 "제목: …" 한 줄, 그 다음부터 markdown으로 ## 배경 / ## 원하는 결과 / ## 희망 기한 세 절을 쓴다.'

/** draft → 접수 전환, 또는 submitted 상태의 접수 내용 수정 */
export function SrConvertDialog({ open, onOpenChange, sr, intake, messages, files }: SrConvertDialogProps) {
  const actor = useActor()
  const settings = useSettings()
  const isNew = sr.status === 'draft'
  const draft = isNew ? draftFromConversation(messages.filter((m) => m.status === 'done' && m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))) : { title: sr.title, body: sr.body }
  const [title, setTitle] = useState(draft.title)
  // 사람이 제목을 고치면 manual — 이후 AI 제안이 덮어쓰지 않는다
  const [titleSource, setTitleSource] = useState<TitleSource>(isNew ? 'ai' : sr.titleSource)
  const [titling, setTitling] = useState(isNew)
  const manualRef = useRef(!isNew)

  // 접수 전환 시 제목은 채팅 답변과 별도 요청으로 제안받는다 (실패하면 첫 메시지 기반 제목 유지)
  // 대화가 갱신돼도 한 번만 요청한다 (라이브 모델 호출 비용)
  const titleRequestedRef = useRef(false)
  useEffect(() => {
    if (!isNew || titleRequestedRef.current) return
    titleRequestedRef.current = true
    void (async () => {
      try {
        const s = await getSettings()
        const t = await suggestTitle(createProvider(s.llm), resolveModel({ assistant: intake, settings: s.llm }).modelId, messages)
        if (t && !manualRef.current) setTitle(t)
      } finally {
        setTitling(false)
      }
    })()
  }, [isNew, intake, messages])
  const [body, setBody] = useState(draft.body)
  const [attachmentIds, setAttachmentIds] = useState<string[]>(isNew ? files.map((f) => f.id) : sr.attachmentIds)
  const [busy, setBusy] = useState(false)
  const [refining, setRefining] = useState(false)

  async function refine() {
    setRefining(true)
    try {
      const s = await getSettings()
      const provider = createProvider(s.llm)
      const history = messages.filter((m) => m.status === 'done' && m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      let acc = ''
      const req = {
        model: resolveModel({ assistant: intake, settings: s.llm }).modelId,
        messages: [{ role: 'system' as const, content: REFINE_PROMPT }, ...history, { role: 'user' as const, content: '위 대화를 SR로 정리해줘' }],
        meta: { assistantId: intake.id, assistantLevel2: intake.level2, assistantName: intake.name, srIntake: true, taskTitle: draft.title },
      }
      for await (const chunk of provider.stream(req)) {
        if (chunk.type === 'delta') acc += chunk.text
        else if (chunk.type === 'error') toast.error(chunk.message)
      }
      const m = /^제목:\s*(.+)$/m.exec(acc)
      if (m && !manualRef.current) setTitle(m[1].trim().slice(0, 60))
      setBody(acc.replace(/^제목:.*\n?/m, '').trim() || acc)
    } finally {
      setRefining(false)
    }
  }

  async function submit() {
    if (!actor || !title.trim()) return
    setBusy(true)
    try {
      if (isNew) {
        const next = await submitSr(actor, sr.id, { title, titleSource, body, attachmentIds })
        toast.success(`${next.code}로 접수되었습니다.`)
      } else {
        await updateSrContent(sr.id, { title: title.trim(), titleSource: title.trim() !== sr.title ? 'manual' : sr.titleSource, body, attachmentIds })
        toast.success('접수 내용을 수정했습니다.')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '접수 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? '접수로 전환' : '접수 내용 수정'}</DialogTitle>
          <DialogDescription>{isNew ? '대화 내용으로 초안을 채웠습니다. 수정 후 제출하면 SR 번호가 부여됩니다.' : '검토가 시작되기 전까지 수정할 수 있습니다.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sr-title">제목</Label>
              <Button type="button" size="xs" variant="ghost" onClick={refine} disabled={refining || messages.length === 0}>
                <Sparkles data-icon="inline-start" />
                {refining ? '정리 중…' : settings?.llm.mode === 'live' ? 'AI로 다듬기' : 'AI로 다듬기 (mock)'}
              </Button>
            </div>
            <Input
              id="sr-title"
              value={title}
              onChange={(e) => {
                manualRef.current = true
                setTitleSource('manual')
                setTitle(e.target.value)
              }}
              placeholder={titling ? 'AI가 제목을 만드는 중…' : undefined}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              {titling ? 'AI 제목 생성 중 — 직접 입력하면 그대로 씁니다.' : titleSource === 'manual' ? '직접 입력한 제목' : 'AI 제안 제목 — 접수 후에도 요청자·System Owner가 고칠 수 있습니다.'}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sr-body">본문 (markdown)</Label>
            <Textarea id="sr-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} className="text-xs" />
          </div>
          {files.length > 0 && (
            <div className="grid gap-1.5">
              <Label>첨부</Label>
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                    <Checkbox
                      id={`sra-${f.id}`}
                      checked={attachmentIds.includes(f.id)}
                      onCheckedChange={() => setAttachmentIds((ids) => (ids.includes(f.id) ? ids.filter((x) => x !== f.id) : [...ids, f.id]))}
                    />
                    <label htmlFor={`sra-${f.id}`} className="cursor-pointer truncate">
                      {f.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} disabled={busy || !title.trim() || !actor}>
            {isNew ? '접수 제출' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
