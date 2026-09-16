import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Database, Download, Plug, RefreshCw, Upload } from 'lucide-react'
import { TopBar } from '@/app/TopBar'
import { useSettings } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { setLlmSettings } from '@/db/repositories/settings'
import { exportAll, importAll, validateBundle } from '@/db/exportImport'
import { resetToSeed } from '@/db/seed'
import { createProvider } from '@/llm'
import { DEFAULT_LLM_SETTINGS, type LlmMode, type LlmSettings } from '@/domain/types'
import { downloadBlob } from '@/db/repositories/files'
import { useModelList } from '@/llm/useModelList'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function SettingsPage() {
  const settings = useSettings()
  const [llm, setLlm] = useState<LlmSettings>(DEFAULT_LLM_SETTINGS)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const modelList = useModelList(llm, false)

  useEffect(() => {
    if (settings) setLlm(settings.llm)
  }, [settings])

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
      if (!window.confirm('현재 데이터를 모두 교체합니다. 계속할까요?')) return
      await importAll(parsed)
      toast.success('데이터를 가져왔습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '가져오기 실패')
    }
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
                  <ToggleGroupItem value="mock">Mock (오프라인 시연)</ToggleGroupItem>
                  <ToggleGroupItem value="live">Live (실제 endpoint)</ToggleGroupItem>
                </ToggleGroup>
              </div>
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
                    단계에 모델이 지정되어 있으면(템플릿 또는 채팅 헤더의 모델 선택) 그 모델을 우선 사용하고, 없으면 이 기본 모델을 씁니다. Mock 모드에서는 모델과 무관하게 시나리오 응답이 나옵니다.
                  </p>
                </div>
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
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm('모든 데이터를 삭제하고 시드 데이터로 초기화합니다. 계속할까요?')) return
                  await resetToSeed()
                  toast.success('시드 데이터로 초기화했습니다.')
                }}
              >
                시드 데이터로 초기화
              </Button>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
