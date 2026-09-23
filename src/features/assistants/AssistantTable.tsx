import { useState } from 'react'
import { BookOpen, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { Markdown } from '@/components/Markdown'
import { UserAvatar } from '@/components/UserAvatar'
import { useActor, useUserMap } from '@/app/hooks'
import { setAssistantStatus, updateAssistant } from '@/db/repositories/assistants'
import { ASSISTANT_STATUSES, type Assistant, type AssistantStatus } from '@/domain/types'
import { ASSISTANT_STATUS_LABEL } from '@/lib/labels'
import { assistantLink1 } from '@/lib/links'
import { Input } from '@/components/ui/input'
import { copyText } from '@/lib/clipboard'

interface AssistantTableProps {
  assistants: Assistant[]
  baseUrl: string
  /** 서버 모델 목록 (모델 매핑 자동완성) */
  models: string[]
  defaultModel: string
  onEdit: (assistant: Assistant) => void
}

const MODEL_LIST_ID = 'manage-model-options'

/** 모델 ID 인라인 매핑. 비우면 공통 기본 모델. Enter/포커스 해제 시 저장. */
function ModelCell({ assistant, defaultModel }: { assistant: Assistant; defaultModel: string }) {
  const actor = useActor()
  const [value, setValue] = useState(assistant.modelId ?? '')
  async function commit() {
    const next = value.trim()
    if (!actor || next === (assistant.modelId ?? '')) return
    await updateAssistant(actor, assistant.id, { modelId: next || undefined })
    toast.success(next ? `${assistant.name} → ${next}` : `${assistant.name}: 공통 기본 모델 사용`)
  }
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      list={MODEL_LIST_ID}
      placeholder={`기본 (${defaultModel})`}
      aria-label={`${assistant.name} 모델 ID`}
      className="h-7 w-44 font-mono text-[11px]"
    />
  )
}

/** 컬럼: 순서 · Lv1 · Lv2 · 이름 · 요약 · 모델 ID(매핑) · 링크1 · 링크2 · 담당자 · 상태 · 사용예시 */
export function AssistantTable({ assistants, baseUrl, models, defaultModel, onEdit }: AssistantTableProps) {
  const actor = useActor()
  const users = useUserMap()

  async function copyLink(a: Assistant) {
    const url = assistantLink1(baseUrl, a)
    if (await copyText(url)) toast.success('링크1을 복사했습니다.')
    else toast.info('클립보드를 사용할 수 없습니다. 직접 복사하세요.', { description: url })
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <datalist id={MODEL_LIST_ID}>
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>업무 Lv1</TableHead>
            <TableHead>업무 Lv2</TableHead>
            <TableHead>AssistantName</TableHead>
            <TableHead className="min-w-56">요약</TableHead>
            <TableHead>모델 ID</TableHead>
            <TableHead>링크1</TableHead>
            <TableHead>링크2</TableHead>
            <TableHead>담당자</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>사용예시</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assistants.map((a) => (
            <TableRow key={a.id} className="cursor-pointer" onClick={() => onEdit(a)}>
              <TableCell className="text-xs text-muted-foreground tabular-nums">{a.order}</TableCell>
              <TableCell className="whitespace-nowrap">{a.level1}</TableCell>
              <TableCell className="whitespace-nowrap">{a.level2}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <AssistantAvatar assistant={a} size="xs" />
                  <span className="font-medium">{a.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{a.id}</span>
                </div>
              </TableCell>
              <TableCell className="max-w-72 truncate text-muted-foreground" title={a.summary}>
                {a.summary}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <ModelCell key={a.modelId ?? ''} assistant={a} defaultModel={defaultModel} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-0.5">
                  <Button size="icon-xs" variant="ghost" title="링크1 복사" onClick={() => copyLink(a)}>
                    <Copy />
                  </Button>
                  <Button size="icon-xs" variant="ghost" asChild>
                    <a href={assistantLink1(baseUrl, a)} target="_blank" rel="noreferrer" title={a.link1 ? `링크1: ${a.link1}` : '링크1 (모델 ID로 생성)'}>
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                {a.docUrl ? (
                  <Button size="icon-xs" variant="ghost" asChild>
                    <a href={a.docUrl} target="_blank" rel="noreferrer" title={a.docUrl}>
                      <BookOpen />
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <UserAvatar user={users.get(a.ownerId)} size="xs" showName />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Select value={a.status} onValueChange={(v) => actor && setAssistantStatus(actor, a.id, v as AssistantStatus).catch((e: unknown) => toast.error(e instanceof Error ? e.message : '상태 변경 실패'))}>
                  <SelectTrigger size="sm" className="h-7 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSISTANT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ASSISTANT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                {a.usageExample ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="xs" variant="outline">
                        보기
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80">
                      <Markdown content={a.usageExample} className="text-xs" />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
