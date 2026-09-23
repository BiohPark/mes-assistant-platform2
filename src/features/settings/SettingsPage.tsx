import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Bot, Database, Download, Plug, RefreshCw, Upload } from 'lucide-react'
import { TopBar } from '@/app/TopBar'
import { useAssistants, useSettings } from '@/app/hooks'
import { AssistantAvatar } from '@/components/AssistantAvatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { assistantExternalUrl } from '@/lib/links'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { setLlmSettings, setSrIntakeAssistant } from '@/db/repositories/settings'
import { exportAll, importAll, validateBundle, type ExportBundle } from '@/db/exportImport'
import { resetToSeed } from '@/db/seed'
import { createProvider } from '@/llm'
import { type FileDelivery, type LlmMode, type LlmSettings, type Settings } from '@/domain/types'
import { downloadBlob } from '@/db/repositories/files'
import { useModelList } from '@/llm/useModelList'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PRESETS = [
  { label: 'OpenWebUI', baseUrl: 'http://openwebui.internal/api', model: 'glm-5.2', fileDelivery: 'openwebui' as const, hint: 'OpenWebUI: /api/chat/completions, /api/models, 파일은 /api/v1/files/. 워크스페이스 모델(assistant) ID를 그대로 사용' },
  { label: 'vLLM / OpenAI 호환', baseUrl: 'http://llm.internal:8000/v1', model: '', fileDelivery: 'inline' as const, hint: 'vLLM, LiteLLM, Ollama(/v1) 등 OpenAI-compatible 서버' },
  { label: '로컬 Ollama', baseUrl: 'http://localhost:11434/v1', model: '', fileDelivery: 'inline' as const, hint: 'Ollama OpenAI 호환 엔드포인트 (OLLAMA_ORIGINS 설정 필요)' },
]

/** 설정이 로드된 뒤 폼을 마운트해 초기값을 state로 바로 쓴다 (effect로 동기화하지 않음) */
export function SettingsPage() {
  const settings = useSettings()
  if (!settings) return <TopBar title="설정" />
  return <SettingsForm key={JSON.stringify(settings.llm)} settings={settings} />
}

function SettingsForm({ settings }: { settings: Settings }) {
  const [llm, setLlm] = useState<LlmSettings>(settings.llm)
  const [testing, setTesting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [pendingImport, setPendingImport] = useState<ExportBundle | null>(null)
  const assistants = useAssistants()
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const modelList = useModelList(llm, false)

  const dirty = settings ? JSON.stringify(settings.llm) !== JSON.stringify(llm) : false

  async function save() {
    await setLlmSettings(llm)
    toast.success('LLM 설정을 저장했습니다.')
  }
  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await createProvider(llm).ping()
      setTestResult(r)
      if (r.ok) toast.success('연결 성공', { description: r.detail })
      else toast.error('연결 실패', { description: r.detail })
    } finally {
      setTesting(false)
    }
  }
  async function exportJson() {
    const bundle = await exportAll()
    downloadBlob(new Blob([JSON.stringify(bundle)], { type: 'application/json' }), `mes-assistant-demo_${new Date().toISOString().slice(0, 10)}.json`)
    toast.success('데이터를 내보냈습니다.')
  }
  async function importJson(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!validateBundle(parsed)) throw new Error('지원하지 않는 파일 형식입니다.')
      setPendingImport(parsed)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '가져오기 실패')
    }
  }
  async function confirmImport() {
    if (!pendingImport) return
    await importAll(pendingImport)
    toast.success('데이터를 가져왔습니다.')
    window.location.reload()
  }

  return (
    <>
      <TopBar title="설정" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Plug className="size-4" />
              LLM 연결
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              기본은 Mock(시나리오 응답)입니다. 사내 OpenAI-compatible endpoint(OpenWebUI 등)를 입력하면 브라우저에서 직접 호출합니다. 브라우저 직접 호출이므로 서버의 CORS 허용이 필요합니다.
            </p>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>모드</Label>
                <ToggleGroup type="single" value={llm.mode} onValueChange={(v) => v && setLlm({ ...llm, mode: v as LlmMode })} variant="outline" size="sm">
                  <ToggleGroupItem value="mock">Mock (오프라인 시연 · 응답은 대역)</ToggleGroupItem>
                  <ToggleGroupItem value="live">Live (실제 endpoint)</ToggleGroupItem>
                </ToggleGroup>
              </div>
              {llm.mode === 'live' && (
                <div className="grid gap-1.5">
                  <Label>사내 API 프리셋</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                      <Button key={p.label} type="button" variant="outline" size="sm" onClick={() => setLlm({ ...llm, baseUrl: p.baseUrl, model: p.model || llm.model, fileDelivery: p.fileDelivery })} title={p.hint}>
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">프리셋은 URL 형식만 채워 줍니다. 실제 호스트와 API 키는 사내 값으로 바꿔 주세요.</p>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5 md:col-span-2">
                  <Label htmlFor="base">Base URL</Label>
                  <Input id="base" value={llm.baseUrl} onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value })} placeholder="http://openwebui.internal/api" disabled={llm.mode === 'mock'} />
                  <p className="text-[11px] text-muted-foreground">
                    <code>{'{baseUrl}/chat/completions'}</code>, <code>{'{baseUrl}/models'}</code>를 호출합니다. OpenWebUI는 <code>/api</code>, 일반 OpenAI-compatible 서버는 <code>/v1</code>로 끝납니다.
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="key">API Key</Label>
                  <Input id="key" type="password" value={llm.apiKey} onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })} placeholder="sk-…" disabled={llm.mode === 'mock'} autoComplete="off" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="model">기본 모델</Label>
                  <div className="flex gap-1.5">
                    <Input id="model" value={llm.model} onChange={(e) => setLlm({ ...llm, model: e.target.value })} placeholder="glm-5.2" className="font-mono" />
                    <Button type="button" variant="outline" size="sm" onClick={() => void modelList.reload()} disabled={modelList.loading}>
                      <RefreshCw data-icon="inline-start" className={modelList.loading ? 'animate-spin' : ''} />
                      목록
                    </Button>
                  </div>
                  {modelList.models.length > 0 && (
                    <Select value={modelList.models.includes(llm.model) ? llm.model : ''} onValueChange={(v) => setLlm({ ...llm, model: v })}>
                      <SelectTrigger size="sm" className="w-full font-mono">
                        <SelectValue placeholder={`서버 모델 ${modelList.models.length}개 중 선택`} />
                      </SelectTrigger>
                      <SelectContent>
                        {modelList.models.map((m) => (
                          <SelectItem key={m} value={m} className="font-mono">
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    모델 결정 순서: 대화 지정 → 에이전트 매핑(관리 페이지의 모델 ID) → 이 공통 기본 모델. 매핑하지 않은 에이전트와 시스템 assistant는 이 모델로 대화합니다. Mock 모드에서는 모델과 무관하게 시나리오 응답이 나옵니다.
                  </p>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>입력 파일 전달 방식</Label>
                <ToggleGroup
                  type="single"
                  value={llm.fileDelivery ?? 'inline'}
                  onValueChange={(v) => v && setLlm({ ...llm, fileDelivery: v as FileDelivery })}
                  variant="outline"
                  size="sm"
                  disabled={llm.mode === 'mock'}
                >
                  <ToggleGroupItem value="openwebui">OpenWebUI 파일 첨부</ToggleGroupItem>
                  <ToggleGroupItem value="inline">텍스트로 붙이기</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-[11px] text-muted-foreground">
                  파일 첨부: 고른 입력 파일을 OpenWebUI Files API(<code>/api/v1/files/</code>)에 올려 채팅 요청에 첨부합니다. assistant가 자체 방식(RAG·워크플로우)으로 읽고, 같은 버전은 다시 올리지 않습니다. 올리기 실패 시 그 파일만 텍스트로 대신 붙이며 "전송 기록"에 남습니다.
                  텍스트로 붙이기: 텍스트 파일 본문(최대 12,000자)을 프롬프트에 넣습니다(OpenAI 호환 서버·Mock).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={save} disabled={!dirty}>
                  저장
                </Button>
                <Button size="sm" variant="outline" onClick={test} disabled={testing}>
                  <RefreshCw data-icon="inline-start" className={testing ? 'animate-spin' : ''} />
                  연결 테스트
                </Button>
                {testResult && <span className={testResult.ok ? 'text-xs text-emerald-700' : 'text-xs text-destructive'}>{testResult.detail}</span>}
              </div>
              <p className="rounded-lg bg-muted/60 p-2 text-[11px] text-muted-foreground">
                API 키는 이 브라우저의 IndexedDB에만 저장됩니다. 실서비스에서는 백엔드 프록시를 두고 키를 서버에서 관리해야 합니다.
              </p>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Bot className="size-4" />
              SR 접수 에이전트
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">SR 접수 페이지에서 요청자와 대화하는 에이전트입니다(기본: URS 분석 도우미). 접수 제목은 AI가 별도 요청으로 제안합니다.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>접수 에이전트</Label>
                <Select value={settings?.srIntakeAssistantId ?? ''} onValueChange={(v) => setSrIntakeAssistant(v || undefined).catch((e: unknown) => toast.error(e instanceof Error ? e.message : '지정 실패'))}>
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue placeholder="에이전트 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {assistants
                      .filter((a) => a.status !== 'retired')
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="inline-flex items-center gap-1.5">
                            <AssistantAvatar assistant={a} size="xs" />
                            {a.name}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>링크1 기본 규칙 (링크1 미입력 시)</Label>
                <code className="truncate rounded-md border bg-muted/40 px-2 py-1.5 text-[11px]">{assistantExternalUrl(llm.baseUrl, '{모델 ID}')}</code>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Database className="size-4" />
              데모 데이터
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              모든 데이터(업무, 대화, 첨부파일)는 브라우저 IndexedDB에 저장됩니다. JSON으로 내보내 다른 PC에서 시연 상태를 복원할 수 있습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={exportJson}>
                <Download data-icon="inline-start" />
                JSON 내보내기
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload data-icon="inline-start" />
                JSON 가져오기
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importJson(f)
                  e.target.value = ''
                }}
              />
              <Button size="sm" variant="destructive" onClick={() => setConfirmReset(true)}>
                시드 데이터로 초기화
              </Button>
              <ConfirmDialog
                open={!!pendingImport}
                onOpenChange={(o) => !o && setPendingImport(null)}
                title="데이터를 가져올까요?"
                description="현재 브라우저의 모든 데이터가 파일 내용으로 교체됩니다."
                confirmLabel="가져오기"
                destructive={false}
                onConfirm={confirmImport}
              />
              <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                title="시드 데이터로 초기화할까요?"
                description="모든 데이터를 삭제하고 데모 시드로 되돌립니다. 되돌릴 수 없습니다."
                confirmLabel="초기화"
                onConfirm={async () => {
                  await resetToSeed()
                  toast.success('시드 데이터로 초기화했습니다.')
                  window.location.reload()
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
