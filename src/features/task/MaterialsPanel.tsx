import { useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ArrowUpCircle, ChevronDown, ChevronRight, FileText, Inbox, Lightbulb, Sparkles, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { TagChip } from '@/components/TagChip'
import { useActor } from '@/app/hooks'
import { db } from '@/db/schema'
import { setOutputTag, uploadFile } from '@/db/repositories/files'
import { setInput, switchInputVersion } from '@/db/repositories/tasks'
import type { PoolItem } from '@/domain/tags'
import type { FileAsset, TaskInput } from '@/domain/types'
import { cn } from '@/lib/utils'
import { FileList } from './FileList'
import { FilePreviewDialog } from './FilePreviewDialog'
import { InputToggle } from './InputToggle'
import type { TaskData } from './useTaskData'

interface MaterialsPanelProps {
  data: TaskData
  readOnly?: boolean
}

type Weight = TaskInput['weight']

function Section({ title, count, hint, children }: { title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <h3 className="text-xs font-semibold">{title}</h3>
        {count !== undefined && <span className="text-[10px] text-muted-foreground">{count}</span>}
        {hint && <span className="ml-auto truncate text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * 자료 패널: 발견(공유 자료함)과 사용(AI 입력 선택)을 분리해서 보여준다.
 * - AI 입력: 사람이 고른 파일만 프롬프트에 들어간다 (★ 주 입력 / ☑ 참고)
 * - 공유 자료함: 같은 태그를 직접 공유하는 대화의 파일 (출처 에이전트 순)
 * - 이 대화 파일: 업로드·산출물 (산출물은 답변 저장 시 자동)
 */
export function MaterialsPanel({ data, readOnly }: MaterialsPanelProps) {
  const { task, assistant, pool, srFiles, linkedSrs } = data
  const actor = useActor()
  const uploadRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<FileAsset | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const change = (file: FileAsset) => (weight: Weight | null) => {
    if (actor) void setInput(actor, task.id, file.id, weight)
  }
  const weightOf = (fileId: string) => task.inputs.find((i) => i.fileId === fileId)?.weight

  // 선택된 입력을 파일 객체와 함께 (자료함·SR 첨부·이 대화·해제된 태그 어디서 왔든)
  const knownFiles = new Map<string, { file: FileAsset; source: string; newerVersionId?: string }>()
  for (const g of pool.groups) for (const i of g.items) knownFiles.set(i.file.id, { file: i.file, source: `${i.sourceTask.code} · ${g.assistant.name}`, newerVersionId: i.newerVersionId })
  for (const o of pool.own) knownFiles.set(o.file.id, { file: o.file, source: '이 대화' })
  for (const f of srFiles) knownFiles.set(f.id, { file: f, source: 'SR 첨부' })
  for (const d of pool.detachedInputs) if (!knownFiles.has(d.file.id)) knownFiles.set(d.file.id, { file: d.file, source: '태그 해제됨' })
  const selected = [...task.inputs].sort((a, b) => (a.weight === b.weight ? 0 : a.weight === 'main' ? -1 : 1))

  async function upload(list: globalThis.FileList | null) {
    if (!actor || !list?.length) return
    for (const f of Array.from(list)) await uploadFile(actor, { taskId: task.id }, f)
    toast.success(`${list.length}개 파일을 업로드했습니다.`)
  }

  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="h-full space-y-4 overflow-y-auto pr-1">
      {assistant.expectedInputs.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-2 text-[11px]">
          <div className="mb-1 flex items-center gap-1 font-medium text-muted-foreground">
            <Lightbulb className="size-3" /> 이 에이전트가 주로 쓰는 자료
          </div>
          <div className="flex flex-wrap gap-1">
            {assistant.expectedInputs.map((x) => (
              <span key={x} className="rounded-full border bg-background px-1.5 py-px">
                {x}
              </span>
            ))}
          </div>
        </div>
      )}

      <Section title="AI 입력" count={selected.length} hint="선택한 것만 AI에 전달">
        {selected.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">
            아래 자료에서 체크(참고) 또는 ★(주 입력)로 고르세요.
            <br />
            태그로 보이기만 하는 자료는 전달되지 않습니다.
          </div>
        ) : (
          <ul className="space-y-1">
            {selected.map((i) => {
              const known = knownFiles.get(i.fileId)
              if (!known) return null
              const { file, source, newerVersionId } = known
              return (
                <li key={i.fileId} className={cn('rounded-lg border bg-card px-2 py-1.5', i.weight === 'main' && 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/10')}>
                  <div className="flex items-center gap-2">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <button type="button" className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline" onClick={() => setPreview(file)}>
                      {file.name} <span className="font-mono text-[10px] text-muted-foreground">v{file.version}</span>
                    </button>
                    <InputToggle weight={i.weight} onChange={change(file)} disabled={readOnly || !actor} label={file.name} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-5 text-[10px] text-muted-foreground">
                    <span>{i.weight === 'main' ? '주 입력' : '참고'}</span>·<span>{source}</span>
                    {newerVersionId && !task.inputs.some((x) => x.fileId === newerVersionId) && !readOnly && (
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-sky-300 px-1.5 py-px text-sky-700 hover:bg-sky-50 dark:text-sky-300"
                        onClick={() => actor && void switchInputVersion(actor, task.id, file.id, newerVersionId)}
                        title="선택을 최신 버전으로 바꿉니다 (자동으로 바뀌지 않음)"
                      >
                        <ArrowUpCircle className="size-2.5" /> 새 버전 있음 · 바꾸기
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="공유 자료함" count={pool.groups.reduce((n, g) => n + g.items.length, 0)} hint={task.tags.length ? '같은 태그 대화의 파일' : undefined}>
        {task.tags.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">
            <Inbox className="mx-auto mb-1 size-4" />
            태그를 붙이면 같은 태그 대화의 산출물이 여기에 보입니다.
          </div>
        ) : pool.groups.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground">같은 태그를 가진 다른 대화에 아직 파일이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {pool.groups.map((g) => (
              <div key={g.assistant.id} className="rounded-lg border">
                <div className="flex items-center gap-1.5 border-b bg-muted/30 px-2 py-1 text-[11px] font-medium">
                  <AssistantAvatar assistant={g.assistant} size="xs" className="size-4 rounded text-[8px]" />
                  <span className="truncate">{g.assistant.name}</span>
                  <span className="ml-auto text-[10px] font-normal text-muted-foreground">{g.assistant.level2}</span>
                </div>
                <ul className="divide-y">
                  {g.items.map((item) => (
                    <PoolRow
                      key={item.file.id}
                      item={item}
                      weight={weightOf(item.file.id)}
                      onChange={change(item.file)}
                      onPreview={setPreview}
                      readOnly={readOnly || !actor}
                      expanded={expanded.has(item.file.id)}
                      onToggleExpand={() => toggleExpand(item.file.id)}
                      // 이미 따로 보이는(선택된) 이전 버전은 접힌 목록에서 뺀다
                      olderIds={(item.olderVersionIds ?? []).filter((id) => !weightOf(id))}
                      weightOf={weightOf}
                      onChangeFile={(f, w) => change(f)(w)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {srFiles.length > 0 && (
        <Section title="SR 첨부" count={srFiles.length} hint={linkedSrs.map((s) => s.code).join(', ')}>
          <FileList
            files={srFiles}
            onPreview={setPreview}
            canDelete={false}
            dense
            renderActions={(f) => <InputToggle weight={weightOf(f.id)} onChange={change(f)} disabled={readOnly || !actor} label={f.name} />}
          />
        </Section>
      )}

      <Section title="이 대화 파일" count={pool.own.length} hint="산출물은 답변 저장 시 자동">
        <FileList
          files={pool.own.map((o) => o.file)}
          task={task}
          onPreview={setPreview}
          onToggleOutput={readOnly ? undefined : (fileId, isOutput) => actor && void setOutputTag(actor, task.id, fileId, isOutput)}
          canDelete={!readOnly}
          dense
          renderActions={(f) => <InputToggle weight={weightOf(f.id)} onChange={change(f)} disabled={readOnly || !actor} label={f.name} />}
        />
        {!readOnly && (
          <>
            <Button variant="outline" size="xs" className="w-full" onClick={() => uploadRef.current?.click()}>
              <Upload data-icon="inline-start" />
              파일 업로드
            </Button>
            <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
          </>
        )}
      </Section>
      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </div>
  )
}

interface PoolRowProps {
  item: PoolItem
  weight?: Weight
  onChange: (w: Weight | null) => void
  onPreview: (f: FileAsset) => void
  readOnly: boolean
  expanded: boolean
  onToggleExpand: () => void
  olderIds: string[]
  weightOf: (id: string) => Weight | undefined
  onChangeFile: (file: FileAsset, w: Weight | null) => void
}

function PoolRow({ item, weight, onChange, onPreview, readOnly, expanded, onToggleExpand, olderIds, weightOf, onChangeFile }: PoolRowProps) {
  const { file, sourceTask, viaTags, role, newerVersionId } = item
  return (
    <li className="px-2 py-1.5">
      <div className="flex items-center gap-2">
        {role === 'output' ? <Sparkles className="size-3.5 shrink-0 text-violet-500" /> : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
        <button type="button" className="min-w-0 flex-1 truncate text-left text-xs hover:underline" onClick={() => onPreview(file)} title={file.name}>
          {file.name} <span className="font-mono text-[10px] text-muted-foreground">v{file.version}</span>
        </button>
        <InputToggle weight={weight} onChange={onChange} disabled={readOnly} label={file.name} />
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-5 text-[10px] text-muted-foreground">
        <span>{role === 'output' ? 'Output' : '업로드'}</span>·
        <Link to={`/c/${sourceTask.id}`} className="truncate hover:underline">
          {sourceTask.code}
        </Link>
        {viaTags.map((t) => (
          <TagChip key={t} tag={t} size="xs" />
        ))}
        {newerVersionId && <span className="rounded-full border border-sky-300 px-1 text-sky-700 dark:text-sky-300">새 버전 있음</span>}
        {olderIds.length > 0 && (
          <button type="button" className="ml-auto inline-flex items-center gap-0.5 hover:text-foreground" onClick={onToggleExpand}>
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            이전 버전 {olderIds.length}
          </button>
        )}
      </div>
      {expanded && <OlderVersions ids={olderIds} onPreview={onPreview} weightOf={weightOf} onChange={onChangeFile} readOnly={readOnly} />}
    </li>
  )
}

interface OlderVersionsProps {
  ids: string[]
  onPreview: (f: FileAsset) => void
  weightOf: (id: string) => Weight | undefined
  onChange: (file: FileAsset, w: Weight | null) => void
  readOnly: boolean
}

/** 접힌 이전 버전. 대화마다 필요한 버전을 직접 고를 수 있다. */
function OlderVersions({ ids, onPreview, weightOf, onChange, readOnly }: OlderVersionsProps) {
  const files = useLiveQuery(() => db.files.bulkGet(ids), [ids.join(',')])
  return (
    <ul className="mt-1 space-y-0.5 border-l pl-3 ml-5">
      {(files ?? [])
        .filter((f): f is FileAsset => !!f)
        .map((f) => (
          <li key={f.id} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => onPreview(f)}>
              {f.name} v{f.version}
            </button>
            <InputToggle weight={weightOf(f.id)} onChange={(w) => onChange(f, w)} disabled={readOnly} label={`${f.name} v${f.version}`} />
          </li>
        ))}
    </ul>
  )
}
