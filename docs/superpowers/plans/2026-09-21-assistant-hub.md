# MES Assistant Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 워크플로우 중심 데모를 브랜치 `feat/assistant-hub`에서 in-place로 "어시스턴트 카탈로그 + 업무 + 산출물 패키지 + SR 접수" 데모로 전환한다.

**Architecture:** 브라우저 전용 SPA(Dexie/IndexedDB). 도메인 함수(순수, 불변)는 `src/domain`, DB 변경은 `src/db/repositories`(트랜잭션 + 활동 로그), 화면은 `src/features/<도메인>`. 기존 `llm/`, `chat/`, 파일/노트/체크리스트 패널을 업무 단위로 이식하고, 워크플로우/템플릿/모듈 코드는 삭제한다. 새 DB 이름 `mes-assistant-hub`(버전 1)로 시작해 마이그레이션 없이 시드로 채운다.

**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind v4 + shadcn/ui, Dexie 4 + dexie-react-hooks, zustand, dnd-kit, recharts, vitest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-21-assistant-hub-design.md` (가정 변경: 새 repo가 아니라 이 repo의 브랜치에서 진행)

---

## 마일스톤과 DoD (Definition of Done)

| M | 범위 | DoD (모두 충족해야 완료) |
|---|---|---|
| M1 | 도메인/DB 전환 | `npm run build` 성공, `npx vitest run` 전부 green, 워크플로우/템플릿/모듈 코드·테이블 삭제, 새 types/schema/repositories + 단위 테스트(transitions·packages·modelResolution·links) 존재, 라우터가 플레이스홀더 페이지로 동작 |
| M2 | 시드 + 공통 컴포넌트 | 첫 실행 시 시드 자동 주입(어시스턴트 10 = 업무용 9 + SR 도우미, 업무 ≥12, 패키지 4, SR 6), `exportImport.test` green(시드 정합성 검사 포함), `AssistantAvatar`·상태 배지·라벨 준비 |
| M3 | 카드맵 · 관리 · 보드 | `/`에서 카드 n×n 그리드 + 검색/Lv1/상태 필터 동작, 관리 테이블에서 생성/편집/이미지 업로드·삭제/상태 변경/링크1 복사, 보드 칸반에서 드래그로 상태 변경 + 리스트 뷰 토글 지속 |
| M4 | 업무 상세 | 채팅 스트리밍(mock) + 스레드 + 산출물 저장, 입력 파일 선택이 프롬프트에 주입, 체크리스트/노트/파일/히스토리 탭, 완료 다이얼로그(필수 체크 경고·피드백·리포트 파일 저장), 두 탭에서 스트리밍 잠금·타이핑 표시 |
| M5 | 패키지 | 발행(파일 선택·메모·추천 어시스턴트) / "발행하고 바로 넘기기" / 받기 / 떼기 / 보관함 페이지 / 흐름 빵부스러기, 받은 파일이 프롬프트 `## 받은 패키지` 섹션에 포함, `packages.test` green |
| M6 | SR | `/sr`에서 접수 도우미 대화 → 접수 전환 → 목록/상태 확인, 새로고침 후 draft 대화 재개, `/sr/manage`에서 상태 변경·업무 chip 연결, 업무 헤더 chip 표시/해제 |
| M7 | 리포트·설정·시스템 어시스턴트 | 리포트 KPI/차트/패키지 흐름/SR 분포/비효율 신호 렌더, 설정에 접수 도우미 선택, 시스템 어시스턴트 도구 4종 mock 적용, export/import 왕복 테스트 green |
| M8 | 마무리 | README·`docs/design.md` 갱신, `npm run lint` 경고 0, 폰 너비(375px) 가로 스크롤 없음, 데모 스토리(스펙 §9) 수동 통과 |

각 태스크 끝의 커밋 메시지는 conventional commits + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` 를 붙인다.

---

## 파일 구조 (최종)

```
src/
  domain/   types.ts · transitions.ts · packages.ts · modelResolution.ts · reporting.ts · taskReport.ts · (+ .test.ts)
  lib/      ids.ts · dates.ts · labels.ts · blob.ts · utils.ts · links.ts(신규) · colors.ts(신규)
  db/       schema.ts · exportImport.ts
            repositories/ activity.ts · assistants.ts(신규) · tasks.ts · packages.ts(신규) · sr.ts(신규) · chat.ts · files.ts · notes.ts · settings.ts
            seed/ index.ts · users.ts · assistants.ts(신규) · builder.ts · data.ts(신규, tasks/packages/sr)
  llm/      provider.ts · openaiProvider.ts · mockProvider.ts · mockScenarios.ts · mockSystemAssistant.ts · sse.ts · context.ts · tools.ts · useModelList.ts · index.ts
  app/      router.tsx · AppShell.tsx · TopBar.tsx · hooks.ts · uiStore.ts · tabUser.ts · presence.ts
  components/ Markdown.tsx · StatusBadges.tsx · UserAvatar.tsx · AssistantAvatar.tsx(신규) · EmptyState.tsx(신규) · ConfirmDialog.tsx(신규) · ui/*
  features/
    home/        HomePage.tsx · AssistantCard.tsx · CardMapFilterBar.tsx · useAssistantStats.ts
    assistants/  ManagePage.tsx · AssistantTable.tsx · AssistantEditorSheet.tsx · ImageDropzone.tsx · BoardPage.tsx · BoardKanban.tsx · BoardList.tsx · BoardKpiTiles.tsx · TaskCard.tsx · NewTaskDialog.tsx · useBoardData.ts
    task/        TaskPage.tsx · TaskHeader.tsx · TaskFlowStrip.tsx · TaskBody.tsx · ChecklistPanel.tsx · NotesPanel.tsx · FilesPanel.tsx · FileList.tsx · FilePreviewDialog.tsx · InputFilePicker.tsx · ActivityPanel.tsx · TaskCompleteDialog.tsx · SrChips.tsx · useTaskData.ts
    chat/        useChat.ts · ChatView.tsx · MessageBubble.tsx · Composer.tsx · ModelPicker.tsx · SaveAsOutputDialog.tsx
    packages/    PackagesPage.tsx · PackageCard.tsx · PublishPackageDialog.tsx · ReceivePackageDialog.tsx · ReceivedPackages.tsx · PackageDetailSheet.tsx
    sr/          SrIntakePage.tsx · SrList.tsx · SrConvertDialog.tsx · SrManagePage.tsx · SrDetailSheet.tsx · SrPickerDialog.tsx
    reports/     ReportsPage.tsx · charts.tsx
    settings/    SettingsPage.tsx
    system-assistant/ SystemAssistantDrawer.tsx · actions.ts
```

삭제: `src/features/dashboard/*`, `src/features/templates/*`, `src/features/modules/*`, `src/features/task/{StepPanel,WorkflowStepper,InsertStepDialog,ComposeWorkflowDialog,CompleteStepDialog,ManualTaskPanel}.tsx`, `src/domain/fileHandoff.ts(+test)`, `src/db/repositories/{templates,modules}.ts`, `src/db/seed/{templates,modules,tasks}.ts`, `src/assets/hero.png`, `public/icons.svg`.

---

# M1 — 도메인/DB 전환

### Task 1.1: 새 도메인 타입

**Files:**
- Modify: `src/domain/types.ts` (전체 교체)

- [ ] **Step 1: types.ts 전체 교체**

```ts
// 도메인 타입 정의. 데이터는 불변으로 다루고, 변경은 항상 새 객체를 반환한다.
export type ID = string
export type ISODate = string

export interface User {
  id: ID
  name: string
  role: string
  initials: string
  color: string
}

export type AssistantStatus = 'open' | 'working' | 'retired'

export interface ChecklistTemplateItem {
  id: ID
  label: string
  required: boolean
}

/** 어시스턴트 카탈로그 항목. id는 사내 AI(OpenWebUI) 모델 ID와 같다. */
export interface Assistant {
  id: ID
  name: string
  level1: string
  level2: string
  summary: string
  docUrl?: string
  ownerId: ID
  status: AssistantStatus
  usageExample: string
  systemPromptHint?: string
  imageId?: ID
  color: string
  checklistTemplate: ChecklistTemplateItem[]
  createdBy: ID
  createdAt: ISODate
  updatedAt: ISODate
}

export type TaskStatus = 'todo' | 'in_progress' | 'on_hold' | 'done'
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'on_hold', 'done']
export type Priority = 'low' | 'normal' | 'high' | 'urgent'

export interface ChecklistItem {
  id: ID
  label: string
  required: boolean
  checked: boolean
  checkedBy?: ID
  checkedAt?: ISODate
}

export interface Feedback {
  rating: number
  comment: string
  by: ID
  at: ISODate
}

/** 업무. 항상 하나의 어시스턴트에 속하며 내부 단계는 없다. */
export interface Task {
  id: ID
  code: string
  assistantId: ID
  title: string
  summary: string
  status: TaskStatus
  ownerId: ID
  assigneeIds: ID[]
  priority: Priority
  dueDate?: ISODate
  tags: string[]
  checklist: ChecklistItem[]
  inputFileIds: ID[]
  outputFileIds: ID[]
  activeThreadId?: ID
  modelId?: string
  srIds: ID[]
  feedback?: Feedback
  createdAt: ISODate
  createdBy: ID
  startedAt?: ISODate
  completedAt?: ISODate
  completedBy?: ID
}

export type PackageStatus = 'open' | 'archived'

/** 산출물 패키지. 발행 시점의 파일 ID 스냅샷 + 인수인계 메모. */
export interface Package {
  id: ID
  code: string
  fromTaskId: ID
  fromAssistantId: ID
  title: string
  summary: string
  fileIds: ID[]
  suggestedAssistantIds: ID[]
  status: PackageStatus
  publishedBy: ID
  publishedAt: ISODate
}

/** 패키지 수신 기록. 떼기 = 이 행 삭제. */
export interface PackageReceipt {
  id: ID
  packageId: ID
  taskId: ID
  receivedBy: ID
  receivedAt: ISODate
}

export interface Thread {
  id: ID
  taskId?: ID
  srId?: ID
  title: string
  createdAt: ISODate
  createdBy: ID
  archived: boolean
  modelId?: string
}

export type MessageRole = 'system' | 'user' | 'assistant'
export type MessageStatus = 'streaming' | 'done' | 'error'

export interface Message {
  id: ID
  threadId: ID
  role: MessageRole
  content: string
  authorId?: ID
  createdAt: ISODate
  attachmentIds: ID[]
  status: MessageStatus
  error?: string
}

export type FileSource = 'upload' | 'assistant' | 'sr'

export interface FileAsset {
  id: ID
  originTaskId?: ID
  originSrId?: ID
  name: string
  mime: string
  size: number
  blob: Blob
  uploadedBy: ID
  uploadedAt: ISODate
  source: FileSource
  tags: string[]
  version: number
}

export interface Note {
  id: ID
  taskId: ID
  authorId: ID
  content: string
  createdAt: ISODate
  attachmentIds: ID[]
}

export type SrStatus = 'draft' | 'submitted' | 'reviewing' | 'in_progress' | 'done' | 'rejected'
export const SR_STATUSES: SrStatus[] = ['draft', 'submitted', 'reviewing', 'in_progress', 'done', 'rejected']

export interface ServiceRequest {
  id: ID
  code: string
  requesterId: ID
  title: string
  body: string
  status: SrStatus
  attachmentIds: ID[]
  threadId: ID
  submittedAt?: ISODate
  createdAt: ISODate
  updatedAt: ISODate
}

export type ActivityType =
  | 'task.created'
  | 'task.started'
  | 'task.completed'
  | 'task.reopened'
  | 'task.hold'
  | 'task.status_changed'
  | 'checklist.checked'
  | 'checklist.unchecked'
  | 'file.uploaded'
  | 'file.tagged_output'
  | 'file.selected_input'
  | 'note.added'
  | 'message.sent'
  | 'thread.created'
  | 'model.changed'
  | 'feedback.given'
  | 'package.published'
  | 'package.received'
  | 'package.detached'
  | 'package.archived'
  | 'assistant.created'
  | 'assistant.updated'
  | 'assistant.status_changed'
  | 'sr.created'
  | 'sr.submitted'
  | 'sr.status_changed'
  | 'sr.linked'
  | 'sr.unlinked'

export interface ActivityLog {
  id: ID
  taskId?: ID
  assistantId?: ID
  srId?: ID
  packageId?: ID
  userId: ID
  type: ActivityType
  payload: Record<string, unknown>
  at: ISODate
}

export type LlmMode = 'mock' | 'live'

export interface LlmSettings {
  mode: LlmMode
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  id: 'app'
  currentUserId: ID
  srIntakeAssistantId?: ID
  llm: LlmSettings
}

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  mode: 'mock',
  baseUrl: 'http://localhost:3000/api',
  apiKey: '',
  model: 'glm-5.2',
}
```

- [ ] **Step 2: 타입만 바꿨으므로 빌드는 깨진 상태. 커밋하지 않고 Task 1.2로 진행** (M1 끝에서 빌드를 복구한다)

### Task 1.2: Dexie 스키마

**Files:**
- Modify: `src/db/schema.ts` (전체 교체)

- [ ] **Step 1: schema.ts 교체**

```ts
import Dexie, { type EntityTable } from 'dexie'
import type {
  ActivityLog, Assistant, FileAsset, Message, Note, Package, PackageReceipt,
  ServiceRequest, Settings, Task, Thread, User,
} from '@/domain/types'

export class AppDB extends Dexie {
  users!: EntityTable<User, 'id'>
  assistants!: EntityTable<Assistant, 'id'>
  tasks!: EntityTable<Task, 'id'>
  threads!: EntityTable<Thread, 'id'>
  messages!: EntityTable<Message, 'id'>
  files!: EntityTable<FileAsset, 'id'>
  notes!: EntityTable<Note, 'id'>
  packages!: EntityTable<Package, 'id'>
  packageReceipts!: EntityTable<PackageReceipt, 'id'>
  serviceRequests!: EntityTable<ServiceRequest, 'id'>
  activity!: EntityTable<ActivityLog, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'mes-assistant-hub') {
    super(name)
    this.version(1).stores({
      users: 'id',
      assistants: 'id, status, level1, ownerId',
      tasks: 'id, code, assistantId, status, ownerId, *srIds',
      threads: 'id, taskId, srId',
      messages: 'id, threadId, createdAt',
      files: 'id, originTaskId, originSrId',
      notes: 'id, taskId',
      packages: 'id, code, fromTaskId, fromAssistantId, status',
      packageReceipts: 'id, packageId, taskId, [packageId+taskId]',
      serviceRequests: 'id, code, requesterId, status',
      activity: 'id, taskId, assistantId, srId, packageId, userId, at, type',
      settings: 'id',
    })
  }
}

export const db = new AppDB()

export const TABLE_NAMES = [
  'users', 'assistants', 'tasks', 'threads', 'messages', 'files', 'notes',
  'packages', 'packageReceipts', 'serviceRequests', 'activity', 'settings',
] as const
export type TableName = (typeof TABLE_NAMES)[number]
```

- [ ] **Step 2: `src/db/exportImport.ts`의 `format` 문자열을 `'mes-assistant-hub'`로 변경** (두 곳: `ExportBundle.format` 타입과 `validateBundle`, `exportAll`의 리터럴)

### Task 1.3: 링크1 파생 유틸 (TDD)

**Files:**
- Create: `src/lib/links.ts`
- Test: `src/lib/links.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, it, expect } from 'vitest'
import { assistantExternalUrl, openWebUiBase } from './links'

describe('openWebUiBase', () => {
  it('strips trailing /api', () => {
    expect(openWebUiBase('http://openwebui.internal/api')).toBe('http://openwebui.internal')
    expect(openWebUiBase('http://openwebui.internal/api/')).toBe('http://openwebui.internal')
  })
  it('keeps non-api base', () => {
    expect(openWebUiBase('http://llm.internal:8000/v1')).toBe('http://llm.internal:8000/v1')
  })
})

describe('assistantExternalUrl', () => {
  it('builds ?model= link', () => {
    expect(assistantExternalUrl('http://openwebui.internal/api', 'et-urs-assistant')).toBe('http://openwebui.internal/?model=et-urs-assistant')
  })
  it('encodes model id', () => {
    expect(assistantExternalUrl('http://x/api', 'a b')).toBe('http://x/?model=a%20b')
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/lib/links.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```ts
/** OpenWebUI API baseUrl에서 웹 UI 루트를 만든다 (`/api` 접미사 제거). */
export function openWebUiBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '').replace(/\/api$/, '')
}

/** 링크1: 어시스턴트(=모델)로 바로 열리는 OpenWebUI 주소 */
export function assistantExternalUrl(baseUrl: string, assistantId: string): string {
  return `${openWebUiBase(baseUrl)}/?model=${encodeURIComponent(assistantId)}`
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/lib/links.test.ts` → PASS (4 tests)

### Task 1.4: 색상 유틸

**Files:**
- Create: `src/lib/colors.ts`

- [ ] **Step 1: 작성**

```ts
export const ASSISTANT_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#db2777', '#4f46e5', '#65a30d'] as const

/** 문자열 해시로 결정적 색을 고른다 (같은 id는 항상 같은 색). */
export function pickColor(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ASSISTANT_COLORS[h % ASSISTANT_COLORS.length]
}

/** 이니셜: 한글은 첫 글자, 영문은 단어별 첫 글자 최대 2개 */
export function initialsOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  if (/[가-힣]/.test(trimmed[0])) return trimmed[0]
  return trimmed.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
```

### Task 1.5: 업무 상태 전이 (TDD)

**Files:**
- Modify: `src/domain/transitions.ts` (전체 교체)
- Test: `src/domain/transitions.test.ts` (전체 교체)

- [ ] **Step 1: 테스트 교체**

```ts
import { describe, it, expect } from 'vitest'
import { applyTaskStatus, checklistProgress, missingRequiredChecklist, toggleChecklistItem } from './transitions'
import type { Task } from './types'

const base: Task = {
  id: 't1', code: 'WK-2026-0001', assistantId: 'a1', title: 'x', summary: '', status: 'todo',
  ownerId: 'u1', assigneeIds: [], priority: 'normal', tags: [],
  checklist: [
    { id: 'c1', label: 'A', required: true, checked: false },
    { id: 'c2', label: 'B', required: false, checked: true, checkedBy: 'u1', checkedAt: '2026-01-01T00:00:00.000Z' },
  ],
  inputFileIds: [], outputFileIds: [], srIds: [], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u1',
}
const at = '2026-02-01T00:00:00.000Z'

describe('applyTaskStatus', () => {
  it('todo → in_progress sets startedAt once', () => {
    const t = applyTaskStatus(base, 'in_progress', 'u1', at)
    expect(t.status).toBe('in_progress')
    expect(t.startedAt).toBe(at)
    expect(applyTaskStatus(t, 'in_progress', 'u1', '2026-03-01T00:00:00.000Z').startedAt).toBe(at)
  })
  it('done sets completedAt/By', () => {
    const t = applyTaskStatus(base, 'done', 'u2', at)
    expect(t.completedAt).toBe(at)
    expect(t.completedBy).toBe('u2')
    expect(t.startedAt).toBe(at)
  })
  it('reopen clears completion', () => {
    const done = applyTaskStatus(base, 'done', 'u2', at)
    const re = applyTaskStatus(done, 'in_progress', 'u1', at)
    expect(re.completedAt).toBeUndefined()
    expect(re.completedBy).toBeUndefined()
  })
  it('does not mutate input', () => {
    applyTaskStatus(base, 'done', 'u1', at)
    expect(base.status).toBe('todo')
  })
})

describe('checklist', () => {
  it('toggle on records who/when, toggle off clears', () => {
    const on = toggleChecklistItem(base, 'c1', 'u1', at)
    expect(on.checklist[0]).toMatchObject({ checked: true, checkedBy: 'u1', checkedAt: at })
    const off = toggleChecklistItem(on, 'c1', 'u1', at)
    expect(off.checklist[0]).toEqual({ id: 'c1', label: 'A', required: true, checked: false })
  })
  it('missingRequired lists unchecked required only', () => {
    expect(missingRequiredChecklist(base).map((c) => c.id)).toEqual(['c1'])
  })
  it('progress counts', () => {
    expect(checklistProgress(base)).toEqual({ done: 1, total: 2 })
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/domain/transitions.test.ts` → FAIL

- [ ] **Step 3: 구현**

```ts
import type { ChecklistItem, ID, ISODate, Task, TaskStatus } from './types'

/** 업무 상태 전이. 항상 새 객체를 반환한다. */
export function applyTaskStatus(task: Task, status: TaskStatus, userId: ID, at: ISODate): Task {
  const { completedAt: _c, completedBy: _b, ...rest } = task
  if (status === 'done') {
    return { ...rest, status, startedAt: task.startedAt ?? at, completedAt: at, completedBy: userId }
  }
  if (status === 'in_progress' || status === 'on_hold') {
    return { ...rest, status, startedAt: task.startedAt ?? at }
  }
  return { ...rest, status }
}

export function missingRequiredChecklist(task: Pick<Task, 'checklist'>): ChecklistItem[] {
  return task.checklist.filter((c) => c.required && !c.checked)
}

export function toggleChecklistItem(task: Task, itemId: ID, userId: ID, at: ISODate): Task {
  return {
    ...task,
    checklist: task.checklist.map((c) => {
      if (c.id !== itemId) return c
      if (c.checked) {
        const { checkedBy: _u, checkedAt: _t, ...rest } = c
        return { ...rest, checked: false }
      }
      return { ...c, checked: true, checkedBy: userId, checkedAt: at }
    }),
  }
}

export function checklistProgress(task: Pick<Task, 'checklist'>): { done: number; total: number } {
  return { done: task.checklist.filter((c) => c.checked).length, total: task.checklist.length }
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/domain/transitions.test.ts` → PASS

### Task 1.6: 패키지 도메인 함수 (TDD)

**Files:**
- Create: `src/domain/packages.ts`
- Test: `src/domain/packages.test.ts`
- Delete: `src/domain/fileHandoff.ts`, `src/domain/fileHandoff.test.ts`

- [ ] **Step 1: 테스트**

```ts
import { describe, it, expect } from 'vitest'
import { deriveInputCandidates, detachInputFileIds, taskFlow } from './packages'
import type { FileAsset, Package, PackageReceipt, Task } from './types'

const file = (id: string, originTaskId?: string): FileAsset => ({
  id, originTaskId, name: `${id}.md`, mime: 'text/markdown', size: 1, blob: new Blob(['x']),
  uploadedBy: 'u1', uploadedAt: '2026-01-01T00:00:00.000Z', source: 'upload', tags: [], version: 1,
})
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, code: id, assistantId: 'a1', title: id, summary: '', status: 'todo', ownerId: 'u1', assigneeIds: [], priority: 'normal',
  tags: [], checklist: [], inputFileIds: [], outputFileIds: [], srIds: [], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'u1', ...extra,
})
const pkg = (id: string, fromTaskId: string, fileIds: string[]): Package => ({
  id, code: id, fromTaskId, fromAssistantId: 'a0', title: id, summary: '', fileIds, suggestedAssistantIds: [], status: 'open',
  publishedBy: 'u1', publishedAt: '2026-01-02T00:00:00.000Z',
})
const receipt = (packageId: string, taskId: string): PackageReceipt => ({ id: `${packageId}-${taskId}`, packageId, taskId, receivedBy: 'u1', receivedAt: '2026-01-03T00:00:00.000Z' })

describe('deriveInputCandidates', () => {
  it('lists package files first (recommended), then own uploads, no duplicates', () => {
    const t = task('t2', { inputFileIds: ['f1'] })
    const files = [file('f1', 't1'), file('f2', 't1'), file('f3', 't2')]
    const out = deriveInputCandidates(t, [pkg('p1', 't1', ['f1', 'f2'])], files)
    expect(out.map((c) => c.file.id)).toEqual(['f1', 'f2', 'f3'])
    expect(out[0]).toMatchObject({ selected: true, recommended: true, fromPackageId: 'p1' })
    expect(out[2]).toMatchObject({ selected: false, recommended: false })
  })
  it('ignores package files that no longer exist', () => {
    const out = deriveInputCandidates(task('t2'), [pkg('p1', 't1', ['gone'])], [])
    expect(out).toEqual([])
  })
})

describe('detachInputFileIds', () => {
  it('removes package files unless tagged as own output', () => {
    const t = task('t2', { inputFileIds: ['f1', 'f2', 'f3'], outputFileIds: ['f2'] })
    expect(detachInputFileIds(t, pkg('p1', 't1', ['f1', 'f2']))).toEqual(['f2', 'f3'])
  })
})

describe('taskFlow', () => {
  it('derives upstream and downstream from receipts', () => {
    const tasks = [task('t1'), task('t2'), task('t3')]
    const packages = [pkg('p1', 't1', []), pkg('p2', 't2', [])]
    const receipts = [receipt('p1', 't2'), receipt('p2', 't3')]
    const flow = taskFlow('t2', tasks, packages, receipts)
    expect(flow.upstream.map((u) => u.task.id)).toEqual(['t1'])
    expect(flow.upstream[0].pkg.id).toBe('p1')
    expect(flow.published.map((p) => p.id)).toEqual(['p2'])
    expect(flow.downstream.map((d) => d.task.id)).toEqual(['t3'])
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/domain/packages.test.ts` → FAIL

- [ ] **Step 3: 구현**

```ts
import type { FileAsset, ID, Package, PackageReceipt, Task } from './types'

export interface InputCandidate {
  file: FileAsset
  fromPackageId?: ID
  recommended: boolean
  selected: boolean
}

/**
 * 업무의 입력 후보: 받은 패키지 파일(추천) → 이 업무에서 업로드/생성된 파일 순.
 * receivedPackages는 이 업무가 수신한 패키지만 넘긴다.
 */
export function deriveInputCandidates(task: Task, receivedPackages: Package[], files: FileAsset[]): InputCandidate[] {
  const byId = new Map(files.map((f) => [f.id, f]))
  const selected = new Set(task.inputFileIds)
  const seen = new Set<ID>()
  const out: InputCandidate[] = []
  for (const p of receivedPackages) {
    for (const fid of p.fileIds) {
      const f = byId.get(fid)
      if (!f || seen.has(fid)) continue
      seen.add(fid)
      out.push({ file: f, fromPackageId: p.id, recommended: true, selected: selected.has(fid) })
    }
  }
  for (const f of files) {
    if (seen.has(f.id) || f.originTaskId !== task.id) continue
    seen.add(f.id)
    out.push({ file: f, recommended: false, selected: selected.has(f.id) })
  }
  return out
}

/** 패키지를 뗄 때 남길 inputFileIds. 이미 이 업무 산출물로 태그된 파일은 유지한다. */
export function detachInputFileIds(task: Task, pkg: Package): ID[] {
  const keep = new Set(task.outputFileIds)
  const drop = new Set(pkg.fileIds.filter((id) => !keep.has(id)))
  return task.inputFileIds.filter((id) => !drop.has(id))
}

export interface TaskFlow {
  upstream: Array<{ task: Task; pkg: Package }>
  published: Package[]
  downstream: Array<{ task: Task; pkg: Package }>
}

/** 수신 기록에서 파생되는 흐름: 어디서 받았고(upstream) 무엇을 발행했고 누가 받았는지(downstream). */
export function taskFlow(taskId: ID, tasks: Task[], packages: Package[], receipts: PackageReceipt[]): TaskFlow {
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const pkgById = new Map(packages.map((p) => [p.id, p]))
  const upstream = receipts
    .filter((r) => r.taskId === taskId)
    .flatMap((r) => {
      const pkg = pkgById.get(r.packageId)
      const from = pkg && taskById.get(pkg.fromTaskId)
      return pkg && from ? [{ task: from, pkg }] : []
    })
  const published = packages.filter((p) => p.fromTaskId === taskId)
  const publishedIds = new Set(published.map((p) => p.id))
  const downstream = receipts
    .filter((r) => publishedIds.has(r.packageId))
    .flatMap((r) => {
      const t = taskById.get(r.taskId)
      const pkg = pkgById.get(r.packageId)
      return t && pkg ? [{ task: t, pkg }] : []
    })
  return { upstream, published, downstream }
}
```

- [ ] **Step 4: 통과 확인** — `npx vitest run src/domain/packages.test.ts` → PASS
- [ ] **Step 5: `fileHandoff.ts`, `fileHandoff.test.ts` 삭제** — `git rm src/domain/fileHandoff.ts src/domain/fileHandoff.test.ts`

### Task 1.7: 모델 해석 체인 (TDD)

**Files:**
- Modify: `src/domain/modelResolution.ts`, `src/domain/modelResolution.test.ts` (전체 교체)

- [ ] **Step 1: 테스트**

```ts
import { describe, it, expect } from 'vitest'
import { resolveModel } from './modelResolution'

describe('resolveModel', () => {
  const settings = { model: 'glm-5.2' }
  it('thread > task > assistant > settings', () => {
    expect(resolveModel({ thread: { modelId: 'th' }, task: { modelId: 'tk' }, assistant: { id: 'as' }, settings })).toEqual({ modelId: 'th', source: 'thread' })
    expect(resolveModel({ thread: { modelId: '' }, task: { modelId: 'tk' }, assistant: { id: 'as' }, settings })).toEqual({ modelId: 'tk', source: 'task' })
    expect(resolveModel({ task: { modelId: '' }, assistant: { id: 'as' }, settings })).toEqual({ modelId: 'as', source: 'assistant' })
    expect(resolveModel({ settings })).toEqual({ modelId: 'glm-5.2', source: 'settings' })
  })
})
```

- [ ] **Step 2: 구현**

```ts
import type { Assistant, LlmSettings, Task, Thread } from './types'

export type ModelSource = 'thread' | 'task' | 'assistant' | 'settings'
export interface ResolvedModel { modelId: string; source: ModelSource }

export const MODEL_SOURCE_LABEL: Record<ModelSource, string> = {
  thread: '이 대화',
  task: '이 업무',
  assistant: '어시스턴트 기본',
  settings: '설정 기본',
}

/** 모델 결정 순서: 대화 > 업무 > 어시스턴트(id = 모델 ID) > 설정. 빈 문자열은 미지정. */
export function resolveModel(input: {
  thread?: Pick<Thread, 'modelId'>
  task?: Pick<Task, 'modelId'>
  assistant?: Pick<Assistant, 'id'>
  settings?: Pick<LlmSettings, 'model'>
}): ResolvedModel {
  if (input.thread?.modelId) return { modelId: input.thread.modelId, source: 'thread' }
  if (input.task?.modelId) return { modelId: input.task.modelId, source: 'task' }
  if (input.assistant?.id) return { modelId: input.assistant.id, source: 'assistant' }
  return { modelId: input.settings?.model ?? '', source: 'settings' }
}
```

- [ ] **Step 3: 통과 확인** — `npx vitest run src/domain/modelResolution.test.ts` → PASS

### Task 1.8: 활동 로그 리포지토리

**Files:**
- Modify: `src/db/repositories/activity.ts` (전체 교체)

- [ ] **Step 1: 교체** — 대상(task/assistant/sr/package)을 객체로 받는다.

```ts
import { db } from '../schema'
import { newId, nowIso } from '@/lib/ids'
import type { ActivityLog, ActivityType, ID } from '@/domain/types'

export interface Actor { userId: ID }

export type ActivityTarget = Partial<Pick<ActivityLog, 'taskId' | 'assistantId' | 'srId' | 'packageId'>>

export function logActivity(actor: Actor, target: ActivityTarget, type: ActivityType, payload: Record<string, unknown> = {}): Promise<ID> {
  const entry: ActivityLog = { id: newId('act'), ...target, userId: actor.userId, type, payload, at: nowIso() }
  return db.activity.add(entry)
}
```

### Task 1.9: 어시스턴트 리포지토리

**Files:**
- Create: `src/db/repositories/assistants.ts`
- Delete: `src/db/repositories/templates.ts`, `src/db/repositories/modules.ts`

- [ ] **Step 1: 작성**

```ts
import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import { pickColor } from '@/lib/colors'
import type { Assistant, AssistantStatus, ChecklistTemplateItem, FileAsset, ID } from '@/domain/types'

export interface AssistantInput {
  id: string
  name: string
  level1: string
  level2: string
  summary: string
  docUrl?: string
  ownerId: ID
  status: AssistantStatus
  usageExample: string
  systemPromptHint?: string
  checklistTemplate: ChecklistTemplateItem[]
}

export function newChecklistTemplateItem(label: string, required = false): ChecklistTemplateItem {
  return { id: newId('ct'), label, required }
}

export async function createAssistant(actor: Actor, input: AssistantInput): Promise<Assistant> {
  const id = input.id.trim()
  if (!id) throw new Error('어시스턴트 ID(모델 ID)는 필수입니다.')
  if (await db.assistants.get(id)) throw new Error(`이미 존재하는 ID입니다: ${id}`)
  const at = nowIso()
  const assistant: Assistant = { ...input, id, color: pickColor(id), createdBy: actor.userId, createdAt: at, updatedAt: at }
  await db.transaction('rw', db.assistants, db.activity, async () => {
    await db.assistants.add(assistant)
    await logActivity(actor, { assistantId: id }, 'assistant.created', { name: assistant.name })
  })
  return assistant
}

export async function updateAssistant(actor: Actor, id: ID, patch: Partial<Omit<AssistantInput, 'id'>>): Promise<void> {
  await db.transaction('rw', db.assistants, db.activity, async () => {
    const cur = await db.assistants.get(id)
    if (!cur) return
    await db.assistants.put({ ...cur, ...patch, updatedAt: nowIso() })
    await logActivity(actor, { assistantId: id }, 'assistant.updated', { fields: Object.keys(patch) })
  })
}

export async function setAssistantStatus(actor: Actor, id: ID, status: AssistantStatus): Promise<void> {
  await db.transaction('rw', db.assistants, db.activity, async () => {
    const cur = await db.assistants.get(id)
    if (!cur || cur.status === status) return
    await db.assistants.put({ ...cur, status, updatedAt: nowIso() })
    await logActivity(actor, { assistantId: id }, 'assistant.status_changed', { from: cur.status, to: status })
  })
}

/** 카드 이미지 교체. 이전 이미지 파일은 삭제한다. null이면 이니셜로 복귀. */
export async function setAssistantImage(actor: Actor, id: ID, image: File | null): Promise<void> {
  await db.transaction('rw', db.assistants, db.files, db.activity, async () => {
    const cur = await db.assistants.get(id)
    if (!cur) return
    if (cur.imageId) await db.files.delete(cur.imageId)
    let imageId: ID | undefined
    if (image) {
      const asset: FileAsset = {
        id: newId('img'), name: image.name, mime: image.type || 'image/png', size: image.size, blob: image,
        uploadedBy: actor.userId, uploadedAt: nowIso(), source: 'upload', tags: ['assistant-image'], version: 1,
      }
      await db.files.add(asset)
      imageId = asset.id
    }
    await db.assistants.put({ ...cur, imageId, updatedAt: nowIso() })
    await logActivity(actor, { assistantId: id }, 'assistant.updated', { fields: ['image'] })
  })
}

/** 업무가 하나도 없는 어시스턴트만 삭제. 있으면 retired 상태로 바꾸라고 안내. */
export async function deleteAssistant(id: ID): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction('rw', db.assistants, db.tasks, db.files, async () => {
    const count = await db.tasks.where('assistantId').equals(id).count()
    if (count > 0) return { ok: false, reason: `업무 ${count}건이 연결되어 있어 삭제할 수 없습니다. 상태를 '폐기'로 변경하세요.` }
    const cur = await db.assistants.get(id)
    if (cur?.imageId) await db.files.delete(cur.imageId)
    await db.assistants.delete(id)
    return { ok: true }
  })
}
```

- [ ] **Step 2: 삭제** — `git rm src/db/repositories/templates.ts src/db/repositories/modules.ts`

### Task 1.10: 업무 리포지토리

**Files:**
- Modify: `src/db/repositories/tasks.ts` (전체 교체)

- [ ] **Step 1: 교체**

```ts
import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import { applyTaskStatus, toggleChecklistItem } from '@/domain/transitions'
import type { ChecklistItem, ID, Priority, Task, TaskStatus } from '@/domain/types'

export interface NewTaskInput {
  assistantId: ID
  title: string
  summary: string
  ownerId: ID
  assigneeIds: ID[]
  priority: Priority
  dueDate?: string
  tags?: string[]
  srIds?: ID[]
  /** 생성 직후 입력 파일로 넣을 파일 (패키지 바로 넘기기, SR 첨부) */
  inputFileIds?: ID[]
  status?: TaskStatus
}

export async function nextCode(prefix: 'WK' | 'PKG' | 'SR', existing: string[]): Promise<string> {
  const year = new Date().getFullYear()
  const re = new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`)
  const max = existing
    .map((c) => re.exec(c))
    .filter((m): m is RegExpExecArray => !!m && Number(m[1]) === year)
    .reduce((acc, m) => Math.max(acc, Number(m[2])), 0)
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`
}

export async function createTask(actor: Actor, input: NewTaskInput): Promise<Task> {
  const assistant = await db.assistants.get(input.assistantId)
  if (!assistant) throw new Error('어시스턴트를 찾을 수 없습니다.')
  const checklist: ChecklistItem[] = assistant.checklistTemplate.map((c) => ({ id: newId('chk'), label: c.label, required: c.required, checked: false }))
  const at = nowIso()
  const status = input.status ?? 'todo'
  const task: Task = {
    id: newId('task'),
    code: await nextCode('WK', (await db.tasks.toArray()).map((t) => t.code)),
    assistantId: assistant.id,
    title: input.title,
    summary: input.summary,
    status,
    ownerId: input.ownerId,
    assigneeIds: input.assigneeIds,
    priority: input.priority,
    dueDate: input.dueDate,
    tags: input.tags ?? [],
    checklist,
    inputFileIds: input.inputFileIds ?? [],
    outputFileIds: [],
    srIds: input.srIds ?? [],
    createdAt: at,
    createdBy: actor.userId,
    startedAt: status === 'in_progress' ? at : undefined,
  }
  await db.transaction('rw', db.tasks, db.activity, async () => {
    await db.tasks.add(task)
    await logActivity(actor, { taskId: task.id, assistantId: assistant.id }, 'task.created', { assistantName: assistant.name })
    for (const srId of task.srIds) await logActivity(actor, { taskId: task.id, srId }, 'sr.linked', { code: task.code })
  })
  return task
}

/** 제목/요약/우선순위/기한/담당 등 단순 필드 수정 (이력 없음) */
export async function updateTask(taskId: ID, patch: Partial<Pick<Task, 'title' | 'summary' | 'priority' | 'dueDate' | 'assigneeIds' | 'ownerId' | 'tags'>>): Promise<void> {
  await db.tasks.update(taskId, patch)
}

const STATUS_ACTIVITY: Record<TaskStatus, 'task.started' | 'task.completed' | 'task.hold' | 'task.status_changed'> = {
  todo: 'task.status_changed',
  in_progress: 'task.started',
  on_hold: 'task.hold',
  done: 'task.completed',
}

export async function setTaskStatus(actor: Actor, taskId: ID, status: TaskStatus, payload: Record<string, unknown> = {}): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task || task.status === status) return
    await db.tasks.put(applyTaskStatus(task, status, actor.userId, nowIso()))
    const type = task.status === 'done' && status !== 'done' ? 'task.reopened' : STATUS_ACTIVITY[status]
    await logActivity(actor, { taskId, assistantId: task.assistantId }, type, { from: task.status, to: status, ...payload })
  })
}

export async function toggleChecklist(actor: Actor, taskId: ID, itemId: ID): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const item = task?.checklist.find((c) => c.id === itemId)
    if (!task || !item) return
    await db.tasks.put(toggleChecklistItem(task, itemId, actor.userId, nowIso()))
    await logActivity(actor, { taskId }, item.checked ? 'checklist.unchecked' : 'checklist.checked', { label: item.label })
  })
}

export async function addChecklistItem(taskId: ID, label: string, required = false): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  await db.tasks.put({ ...task, checklist: [...task.checklist, { id: newId('chk'), label, required, checked: false }] })
}

export async function removeChecklistItem(taskId: ID, itemId: ID): Promise<void> {
  const task = await db.tasks.get(taskId)
  if (!task) return
  await db.tasks.put({ ...task, checklist: task.checklist.filter((c) => c.id !== itemId) })
}

export async function giveFeedback(actor: Actor, taskId: ID, rating: number, comment: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    await db.tasks.put({ ...task, feedback: { rating, comment, by: actor.userId, at: nowIso() } })
    await logActivity(actor, { taskId, assistantId: task.assistantId }, 'feedback.given', { rating })
  })
}

export async function setTaskModel(actor: Actor, taskId: ID, modelId: string): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    await db.tasks.update(taskId, { modelId: modelId || undefined })
    await logActivity(actor, { taskId }, 'model.changed', { scope: '이 업무', modelId: modelId || '(기본)' })
  })
}

export async function setThreadModel(actor: Actor, threadId: ID, modelId: string): Promise<void> {
  await db.transaction('rw', db.threads, db.activity, async () => {
    const thread = await db.threads.get(threadId)
    if (!thread) return
    await db.threads.update(threadId, { modelId: modelId || undefined })
    await logActivity(actor, { taskId: thread.taskId, srId: thread.srId }, 'model.changed', { scope: '이 대화', thread: thread.title, modelId: modelId || '(기본)' })
  })
}

export async function linkSr(actor: Actor, taskId: ID, srId: ID): Promise<void> {
  await db.transaction('rw', db.tasks, db.serviceRequests, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const sr = await db.serviceRequests.get(srId)
    if (!task || !sr || task.srIds.includes(srId)) return
    await db.tasks.put({ ...task, srIds: [...task.srIds, srId] })
    await logActivity(actor, { taskId, srId }, 'sr.linked', { code: sr.code, taskCode: task.code })
  })
}

export async function unlinkSr(actor: Actor, taskId: ID, srId: ID): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task || !task.srIds.includes(srId)) return
    await db.tasks.put({ ...task, srIds: task.srIds.filter((id) => id !== srId) })
    await logActivity(actor, { taskId, srId }, 'sr.unlinked', { taskCode: task.code })
  })
}

/** 업무 삭제: 스레드/메시지/노트/수신기록/이 업무에서 업로드된 파일 정리. 발행한 패키지가 있으면 거부. */
export async function deleteTask(taskId: ID): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction('rw', [db.tasks, db.threads, db.messages, db.notes, db.files, db.packages, db.packageReceipts], async () => {
    if ((await db.packages.where('fromTaskId').equals(taskId).count()) > 0) {
      return { ok: false, reason: '이 업무가 발행한 패키지가 있어 삭제할 수 없습니다. 패키지를 먼저 보관 처리하세요.' }
    }
    const threads = await db.threads.where('taskId').equals(taskId).toArray()
    for (const t of threads) await db.messages.where('threadId').equals(t.id).delete()
    await db.threads.where('taskId').equals(taskId).delete()
    await db.notes.where('taskId').equals(taskId).delete()
    await db.packageReceipts.where('taskId').equals(taskId).delete()
    await db.files.where('originTaskId').equals(taskId).delete()
    await db.tasks.delete(taskId)
    return { ok: true }
  })
}
```

### Task 1.11: 패키지 리포지토리 (TDD)

**Files:**
- Create: `src/db/repositories/packages.ts`
- Test: `src/db/repositories/packages.test.ts`

- [ ] **Step 1: 테스트 작성** (전역 `db`를 쓰므로 테스트마다 비운다)

```ts
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../schema'
import { createAssistant } from './assistants'
import { createTask } from './tasks'
import { saveAssistantOutput } from './files'
import { detachPackage, publishAndForward, publishPackage, receivePackage } from './packages'

const actor = { userId: 'u1' }

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await db.users.put({ id: 'u1', name: 'U', role: '', initials: 'U', color: '#000' })
  for (const id of ['a1', 'a2']) {
    await createAssistant(actor, { id, name: id, level1: 'L1', level2: 'L2', summary: '', ownerId: 'u1', status: 'open', usageExample: '', checklistTemplate: [] })
  }
})

const newTask = (assistantId: string) => createTask(actor, { assistantId, title: assistantId, summary: '', ownerId: 'u1', assigneeIds: [], priority: 'normal' })

describe('package lifecycle', () => {
  it('publish → receive merges files into inputs; detach removes them', async () => {
    const t1 = await newTask('a1')
    const f = await saveAssistantOutput(actor, t1.id, 'out.md', '# hi')
    const pkg = await publishPackage(actor, { taskId: t1.id, title: 'P', summary: 'memo', fileIds: [f.id], suggestedAssistantIds: ['a2'] })
    expect(pkg.code).toMatch(/^PKG-\d{4}-0001$/)

    const t2 = await newTask('a2')
    await receivePackage(actor, pkg.id, t2.id)
    expect((await db.tasks.get(t2.id))!.inputFileIds).toEqual([f.id])
    expect(await db.packageReceipts.count()).toBe(1)

    await receivePackage(actor, pkg.id, t2.id) // 멱등
    expect(await db.packageReceipts.count()).toBe(1)

    await detachPackage(actor, pkg.id, t2.id)
    expect((await db.tasks.get(t2.id))!.inputFileIds).toEqual([])
    expect(await db.packageReceipts.count()).toBe(0)
  })

  it('publishAndForward creates a received task under target assistant', async () => {
    const t1 = await newTask('a1')
    const f = await saveAssistantOutput(actor, t1.id, 'out.md', 'x')
    const { task } = await publishAndForward(actor, { taskId: t1.id, title: 'P', summary: '', fileIds: [f.id], suggestedAssistantIds: [] }, 'a2')
    expect(task.assistantId).toBe('a2')
    expect(task.title).toBe('[받음] P')
    expect((await db.tasks.get(task.id))!.inputFileIds).toEqual([f.id])
  })

  it('rejects empty file list', async () => {
    const t1 = await newTask('a1')
    await expect(publishPackage(actor, { taskId: t1.id, title: 'P', summary: '', fileIds: [], suggestedAssistantIds: [] })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/db/repositories/packages.test.ts` → FAIL

- [ ] **Step 3: 구현**

```ts
import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { createTask, nextCode } from './tasks'
import { detachInputFileIds } from '@/domain/packages'
import { newId, nowIso } from '@/lib/ids'
import type { ID, Package, PackageReceipt, Task } from '@/domain/types'

export interface PublishInput {
  taskId: ID
  title: string
  summary: string
  fileIds: ID[]
  suggestedAssistantIds: ID[]
}

export async function publishPackage(actor: Actor, input: PublishInput): Promise<Package> {
  const task = await db.tasks.get(input.taskId)
  if (!task) throw new Error('업무를 찾을 수 없습니다.')
  if (input.fileIds.length === 0) throw new Error('포함할 파일을 하나 이상 선택하세요.')
  const pkg: Package = {
    id: newId('pkg'),
    code: await nextCode('PKG', (await db.packages.toArray()).map((p) => p.code)),
    fromTaskId: task.id,
    fromAssistantId: task.assistantId,
    title: input.title,
    summary: input.summary,
    fileIds: [...input.fileIds],
    suggestedAssistantIds: [...input.suggestedAssistantIds],
    status: 'open',
    publishedBy: actor.userId,
    publishedAt: nowIso(),
  }
  await db.transaction('rw', db.packages, db.activity, async () => {
    await db.packages.add(pkg)
    await logActivity(actor, { taskId: task.id, packageId: pkg.id, assistantId: task.assistantId }, 'package.published', { code: pkg.code, title: pkg.title, files: pkg.fileIds.length })
  })
  return pkg
}

/** 수신: receipt 생성 + 파일을 업무 입력에 합친다. 이미 받았으면 no-op. */
export async function receivePackage(actor: Actor, packageId: ID, taskId: ID): Promise<void> {
  await db.transaction('rw', db.packages, db.packageReceipts, db.tasks, db.activity, async () => {
    const [pkg, task] = await Promise.all([db.packages.get(packageId), db.tasks.get(taskId)])
    if (!pkg || !task) return
    const dup = await db.packageReceipts.where('[packageId+taskId]').equals([packageId, taskId]).first()
    if (dup) return
    const receipt: PackageReceipt = { id: newId('rcpt'), packageId, taskId, receivedBy: actor.userId, receivedAt: nowIso() }
    await db.packageReceipts.add(receipt)
    await db.tasks.put({ ...task, inputFileIds: Array.from(new Set([...task.inputFileIds, ...pkg.fileIds])) })
    await logActivity(actor, { taskId, packageId, assistantId: task.assistantId }, 'package.received', { code: pkg.code, title: pkg.title })
  })
}

/** 떼기: receipt 삭제 + 패키지 파일을 입력에서 제거(산출물 태그된 파일은 유지). */
export async function detachPackage(actor: Actor, packageId: ID, taskId: ID): Promise<void> {
  await db.transaction('rw', db.packages, db.packageReceipts, db.tasks, db.activity, async () => {
    const [pkg, task] = await Promise.all([db.packages.get(packageId), db.tasks.get(taskId)])
    if (!pkg || !task) return
    await db.packageReceipts.where('[packageId+taskId]').equals([packageId, taskId]).delete()
    await db.tasks.put({ ...task, inputFileIds: detachInputFileIds(task, pkg) })
    await logActivity(actor, { taskId, packageId }, 'package.detached', { code: pkg.code })
  })
}

export async function archivePackage(actor: Actor, packageId: ID, archived: boolean): Promise<void> {
  await db.transaction('rw', db.packages, db.activity, async () => {
    const pkg = await db.packages.get(packageId)
    if (!pkg) return
    await db.packages.update(packageId, { status: archived ? 'archived' : 'open' })
    await logActivity(actor, { packageId, taskId: pkg.fromTaskId }, 'package.archived', { code: pkg.code, archived })
  })
}

/** 발행하고 바로 넘기기: 대상 어시스턴트 아래 새 업무 생성 + 수신. */
export async function publishAndForward(actor: Actor, input: PublishInput, toAssistantId: ID): Promise<{ pkg: Package; task: Task }> {
  const pkg = await publishPackage(actor, input)
  const assistant = await db.assistants.get(toAssistantId)
  if (!assistant) throw new Error('대상 어시스턴트를 찾을 수 없습니다.')
  const task = await createTask(actor, {
    assistantId: toAssistantId,
    title: `[받음] ${pkg.title}`,
    summary: pkg.summary,
    ownerId: assistant.ownerId,
    assigneeIds: [assistant.ownerId],
    priority: 'normal',
  })
  await receivePackage(actor, pkg.id, task.id)
  return { pkg, task }
}
```

- [ ] **Step 4: files.ts 수정 전이면 여전히 FAIL. Task 1.12 완료 후 PASS 확인.**

### Task 1.12: 파일 / 채팅 / 노트 리포지토리 이식

**Files:**
- Modify: `src/db/repositories/files.ts`, `src/db/repositories/chat.ts`, `src/db/repositories/notes.ts`

- [ ] **Step 1: files.ts** — step 매개변수 제거. `downloadBlob`, `isTextFile`, `formatSize`는 유지.

```ts
import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { FileAsset, ID, Task } from '@/domain/types'

export type FileOrigin = { taskId: ID; srId?: undefined } | { srId: ID; taskId?: undefined }

export async function uploadFile(actor: Actor, origin: FileOrigin, file: File): Promise<FileAsset> {
  const asset: FileAsset = {
    id: newId('file'), originTaskId: origin.taskId, originSrId: origin.srId,
    name: file.name, mime: file.type || 'application/octet-stream', size: file.size, blob: file,
    uploadedBy: actor.userId, uploadedAt: nowIso(), source: origin.srId ? 'sr' : 'upload', tags: [], version: 1,
  }
  await db.transaction('rw', db.files, db.activity, async () => {
    await db.files.add(asset)
    await logActivity(actor, { taskId: origin.taskId, srId: origin.srId }, 'file.uploaded', { name: file.name })
  })
  return asset
}

/** assistant 응답을 markdown 산출물로 저장하고 업무 output에 태깅 */
export async function saveAssistantOutput(actor: Actor, taskId: ID, name: string, content: string): Promise<FileAsset> {
  const blob = new Blob([content], { type: 'text/markdown' })
  const asset: FileAsset = {
    id: newId('file'), originTaskId: taskId, name, mime: 'text/markdown', size: blob.size, blob,
    uploadedBy: actor.userId, uploadedAt: nowIso(), source: 'assistant', tags: ['산출물'], version: 1,
  }
  await db.transaction('rw', db.files, db.tasks, db.activity, async () => {
    await db.files.add(asset)
    const task = await db.tasks.get(taskId)
    if (task) await db.tasks.put({ ...task, outputFileIds: [...task.outputFileIds, asset.id] })
    await logActivity(actor, { taskId }, 'file.tagged_output', { name })
  })
  return asset
}

export async function setOutputTag(actor: Actor, taskId: ID, fileId: ID, isOutput: boolean): Promise<void> {
  await db.transaction('rw', db.tasks, db.files, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    const file = await db.files.get(fileId)
    if (!task || !file) return
    const outputFileIds = isOutput ? Array.from(new Set([...task.outputFileIds, fileId])) : task.outputFileIds.filter((id) => id !== fileId)
    await db.tasks.put({ ...task, outputFileIds })
    if (isOutput) await logActivity(actor, { taskId }, 'file.tagged_output', { name: file.name })
  })
}

export async function setInputFiles(actor: Actor, taskId: ID, inputFileIds: ID[]): Promise<void> {
  await db.transaction('rw', db.tasks, db.activity, async () => {
    const task = await db.tasks.get(taskId)
    if (!task) return
    await db.tasks.put({ ...task, inputFileIds })
    await logActivity(actor, { taskId }, 'file.selected_input', { count: inputFileIds.length })
  })
}

/** 파일 삭제. 발행된 패키지에 포함된 파일은 거부(패키지 무결성). */
export async function deleteFile(fileId: ID): Promise<{ ok: boolean; reason?: string }> {
  return db.transaction('rw', db.files, db.tasks, db.packages, async () => {
    const inPkg = (await db.packages.toArray()).find((p) => p.fileIds.includes(fileId))
    if (inPkg) return { ok: false, reason: `패키지 ${inPkg.code}에 포함된 파일은 삭제할 수 없습니다.` }
    const tasks = (await db.tasks.toArray()).filter((t) => t.inputFileIds.includes(fileId) || t.outputFileIds.includes(fileId))
    for (const t of tasks) {
      await db.tasks.put({ ...t, inputFileIds: t.inputFileIds.filter((id) => id !== fileId), outputFileIds: t.outputFileIds.filter((id) => id !== fileId) })
    }
    await db.files.delete(fileId)
    return { ok: true }
  })
}

/** 업무 화면에서 보이는 파일: 이 업무에서 만든 파일 + 입력/산출물로 참조 중인 파일 */
export async function filesForTask(task: Task): Promise<FileAsset[]> {
  const own = await db.files.where('originTaskId').equals(task.id).toArray()
  const ownIds = new Set(own.map((f) => f.id))
  const refIds = [...new Set([...task.inputFileIds, ...task.outputFileIds])].filter((id) => !ownIds.has(id))
  const referenced = (await db.files.bulkGet(refIds)).filter((f): f is FileAsset => !!f)
  return [...own, ...referenced].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt))
}

// downloadBlob / isTextFile / formatSize: 기존 코드 그대로
```

- [ ] **Step 2: chat.ts** — 스레드 소유자를 `{ taskId } | { srId }`로.

```ts
import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { newId, nowIso } from '@/lib/ids'
import type { ID, Message, MessageRole, Thread } from '@/domain/types'

export type ThreadOwner = { taskId: ID; srId?: undefined } | { srId: ID; taskId?: undefined }

export async function createThread(actor: Actor, owner: ThreadOwner, title?: string): Promise<Thread> {
  const existing = owner.taskId
    ? await db.threads.where('taskId').equals(owner.taskId).count()
    : await db.threads.where('srId').equals(owner.srId).count()
  const thread: Thread = { id: newId('thr'), ...owner, title: title ?? `스레드 ${existing + 1}`, createdAt: nowIso(), createdBy: actor.userId, archived: false }
  await db.transaction('rw', db.threads, db.tasks, db.activity, async () => {
    await db.threads.add(thread)
    if (owner.taskId) await db.tasks.update(owner.taskId, { activeThreadId: thread.id })
    await logActivity(actor, owner, 'thread.created', { title: thread.title })
  })
  return thread
}

export async function setActiveThread(taskId: ID, threadId: ID): Promise<void> {
  await db.tasks.update(taskId, { activeThreadId: threadId })
}

export async function appendMessage(actor: Actor | null, threadId: ID, role: MessageRole, content: string, attachmentIds: ID[] = [], status: Message['status'] = 'done'): Promise<Message> {
  const msg: Message = { id: newId('msg'), threadId, role, content, authorId: actor?.userId, createdAt: nowIso(), attachmentIds, status }
  await db.messages.add(msg)
  if (role === 'user' && actor) {
    const thread = await db.threads.get(threadId)
    if (thread) await logActivity(actor, { taskId: thread.taskId, srId: thread.srId }, 'message.sent', { preview: content.slice(0, 60) })
  }
  return msg
}

export async function updateMessage(id: ID, patch: Partial<Message>): Promise<void> {
  await db.messages.update(id, patch)
}

export async function deleteThread(threadId: ID): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, db.tasks, async () => {
    const thread = await db.threads.get(threadId)
    if (!thread) return
    await db.messages.where('threadId').equals(threadId).delete()
    await db.threads.delete(threadId)
    if (!thread.taskId) return
    const task = await db.tasks.get(thread.taskId)
    if (task?.activeThreadId === threadId) {
      const remaining = await db.threads.where('taskId').equals(task.id).sortBy('createdAt')
      await db.tasks.update(task.id, { activeThreadId: remaining.at(-1)?.id })
    }
  })
}
```

- [ ] **Step 3: notes.ts** — `stepInstanceId` 인자 제거: `addNote(actor, taskId, content, attachmentIds = [])`. 로그는 `logActivity(actor, { taskId }, 'note.added', { preview: content.slice(0, 60) })`.

- [ ] **Step 4: 테스트** — `npx vitest run src/db/repositories/packages.test.ts` → PASS (3 tests)

### Task 1.13: SR 리포지토리

**Files:**
- Create: `src/db/repositories/sr.ts`

- [ ] **Step 1: 작성**

```ts
import { db } from '../schema'
import { logActivity, type Actor } from './activity'
import { createThread } from './chat'
import { nextCode } from './tasks'
import { newId, nowIso } from '@/lib/ids'
import type { ID, ServiceRequest, SrStatus } from '@/domain/types'

/** 새 대화 시작 = draft SR + 스레드. 접수자는 대화만 하다가 나중에 접수로 전환한다. */
export async function startSrConversation(actor: Actor): Promise<ServiceRequest> {
  const id = newId('sr')
  const thread = await createThread(actor, { srId: id }, '접수 대화')
  const at = nowIso()
  const sr: ServiceRequest = { id, code: '', requesterId: actor.userId, title: '', body: '', status: 'draft', attachmentIds: [], threadId: thread.id, createdAt: at, updatedAt: at }
  await db.transaction('rw', db.serviceRequests, db.activity, async () => {
    await db.serviceRequests.add(sr)
    await logActivity(actor, { srId: id }, 'sr.created')
  })
  return sr
}

/** 접수로 전환: 코드 부여 + 제목/본문 확정 + submitted */
export async function submitSr(actor: Actor, srId: ID, title: string, body: string, attachmentIds: ID[]): Promise<ServiceRequest> {
  if (!title.trim()) throw new Error('제목을 입력하세요.')
  return db.transaction('rw', db.serviceRequests, db.activity, async () => {
    const cur = await db.serviceRequests.get(srId)
    if (!cur) throw new Error('요청을 찾을 수 없습니다.')
    const code = cur.code || (await nextCode('SR', (await db.serviceRequests.toArray()).map((s) => s.code)))
    const at = nowIso()
    const next: ServiceRequest = { ...cur, code, title: title.trim(), body, attachmentIds, status: 'submitted', submittedAt: at, updatedAt: at }
    await db.serviceRequests.put(next)
    await logActivity(actor, { srId }, 'sr.submitted', { code })
    return next
  })
}

/** 검토 전(draft/submitted)까지만 접수자가 내용을 고칠 수 있다 */
export async function updateSrContent(srId: ID, patch: Pick<ServiceRequest, 'title' | 'body' | 'attachmentIds'>): Promise<void> {
  const cur = await db.serviceRequests.get(srId)
  if (!cur || (cur.status !== 'draft' && cur.status !== 'submitted')) return
  await db.serviceRequests.put({ ...cur, ...patch, updatedAt: nowIso() })
}

export async function setSrStatus(actor: Actor, srId: ID, status: SrStatus): Promise<void> {
  await db.transaction('rw', db.serviceRequests, db.activity, async () => {
    const cur = await db.serviceRequests.get(srId)
    if (!cur || cur.status === status) return
    await db.serviceRequests.put({ ...cur, status, updatedAt: nowIso() })
    await logActivity(actor, { srId }, 'sr.status_changed', { from: cur.status, to: status })
  })
}

export async function deleteDraftSr(srId: ID): Promise<void> {
  await db.transaction('rw', db.serviceRequests, db.threads, db.messages, db.files, async () => {
    const cur = await db.serviceRequests.get(srId)
    if (!cur || cur.status !== 'draft') return
    await db.messages.where('threadId').equals(cur.threadId).delete()
    await db.threads.delete(cur.threadId)
    await db.files.where('originSrId').equals(srId).delete()
    await db.serviceRequests.delete(srId)
  })
}
```

### Task 1.14: settings / labels / llm 시그니처 / 라우터 정리 → 빌드 복구

**Files:**
- Modify: `src/db/repositories/settings.ts`, `src/lib/labels.ts`, `src/db/seed/index.ts`, `src/app/hooks.ts`, `src/app/router.tsx`, `src/app/AppShell.tsx`, `src/llm/provider.ts`, `src/llm/context.ts`, `src/llm/tools.ts`, `src/llm/mockProvider.ts`, `src/llm/mockScenarios.ts`, `src/features/system-assistant/actions.ts`, `src/db/exportImport.ts`
- Create: `src/features/Placeholder.tsx`
- Delete: 삭제 목록(아래 Step 9)

- [ ] **Step 1: settings.ts에 추가**

```ts
export async function setSrIntakeAssistant(assistantId: ID | undefined): Promise<void> {
  const s = await getSettings()
  await db.settings.put({ ...s, srIntakeAssistantId: assistantId })
}
```

- [ ] **Step 2: labels.ts 교체**

```ts
import type { ActivityType, AssistantStatus, Priority, SrStatus, TaskStatus } from '@/domain/types'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: '대기', in_progress: '진행 중', on_hold: '보류', done: '완료' }
export const ASSISTANT_STATUS_LABEL: Record<AssistantStatus, string> = { open: '오픈', working: '작업 중', retired: '폐기' }
export const SR_STATUS_LABEL: Record<SrStatus, string> = { draft: '대화 중', submitted: '접수됨', reviewing: '검토 중', in_progress: '진행 중', done: '완료', rejected: '반려' }
export const PRIORITY_LABEL: Record<Priority, string> = { low: '낮음', normal: '보통', high: '높음', urgent: '긴급' }
export const PRIORITY_CLASS: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  normal: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  high: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  urgent: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  'task.created': '업무 생성', 'task.started': '업무 시작', 'task.completed': '업무 완료', 'task.reopened': '업무 재개',
  'task.hold': '업무 보류', 'task.status_changed': '상태 변경', 'checklist.checked': '체크리스트 완료', 'checklist.unchecked': '체크리스트 해제',
  'file.uploaded': '파일 업로드', 'file.tagged_output': '산출물 지정', 'file.selected_input': '입력 파일 선택', 'note.added': '메모 작성',
  'message.sent': '메시지 전송', 'thread.created': '스레드 생성', 'model.changed': '모델 변경', 'feedback.given': 'assistant 피드백',
  'package.published': '패키지 발행', 'package.received': '패키지 수신', 'package.detached': '패키지 분리', 'package.archived': '패키지 보관',
  'assistant.created': '어시스턴트 등록', 'assistant.updated': '어시스턴트 수정', 'assistant.status_changed': '어시스턴트 상태 변경',
  'sr.created': 'SR 대화 시작', 'sr.submitted': 'SR 접수', 'sr.status_changed': 'SR 상태 변경', 'sr.linked': 'SR 연결', 'sr.unlinked': 'SR 연결 해제',
}
```

- [ ] **Step 3: llm/provider.ts — `ChatMeta` 교체, `StepKey` import 제거**

```ts
export interface ChatMeta {
  assistantId?: string
  assistantLevel2?: string
  assistantName?: string
  taskTitle?: string
  inputFileNames?: string[]
  packageTitles?: string[]
  systemAssistant?: boolean
  srIntake?: boolean
}
```

- [ ] **Step 4: llm/context.ts — 시그니처만 교체** (본문은 M4 Task 4.1에서 TDD로 완성). `threadParticipants`, `toChatMessages`, `UserMap`, `MAX_INLINE_CHARS`는 유지. `buildStepSystemPrompt`/`stepMeta` 삭제 후:

```ts
export interface TaskPromptInput {
  assistant: Assistant
  task: Task
  receivedPackages: Array<{ pkg: Package; fromAssistantName: string }>
  linkedSrs: ServiceRequest[]
  inputFiles: FileAsset[]
  participants?: Array<{ name: string; role: string }>
}
export async function buildTaskSystemPrompt(_input: TaskPromptInput): Promise<string> { return '' }

export interface SrPromptInput { intake: Assistant; sr: ServiceRequest; files: FileAsset[] }
export async function buildSrSystemPrompt(_input: SrPromptInput): Promise<string> { return '' }

export function taskMeta(assistant: Assistant, task: Task, inputFiles: FileAsset[], packageTitles: string[]): ChatMeta {
  return { assistantId: assistant.id, assistantLevel2: assistant.level2, assistantName: assistant.name, taskTitle: task.title, inputFileNames: inputFiles.map((f) => f.name), packageTitles }
}
```

- [ ] **Step 5: mockScenarios.ts** — `MockContext.stepName` → `assistantName`(본문의 `${ctx.stepName}` 치환), `StepKey` import 제거, 끝부분 export를 교체:

```ts
const BY_KEYWORD: Array<[RegExp, ScenarioFn[]]> = [
  [/urs|요구/i, URS], [/fds|기능/i, FDS], [/test|테스트/i, TEST], [/protocol|프로토콜|검증/i, PROTOCOL], [/deploy|배포/i, DEPLOY],
]
export function scenarioFor(assistantId: string, level2: string): ScenarioFn[] {
  const hit = BY_KEYWORD.find(([re]) => re.test(assistantId) || re.test(level2))
  return hit ? hit[1] : CUSTOM
}
export function mockReply(assistantId: string, level2: string, ctx: MockContext): string {
  const fns = scenarioFor(assistantId, level2)
  return fns[Math.min(ctx.turn, fns.length - 1)](ctx)
}
```
`mockProvider.ts`: `text = mockReply(meta.assistantId ?? '', meta.assistantLevel2 ?? '', { taskTitle: meta.taskTitle ?? '업무', assistantName: meta.assistantName ?? '어시스턴트', inputFileNames: meta.inputFileNames ?? [], userText, turn })`. `listModels()` 목록에 `'sr-intake-assistant'`, `'et-review-assistant'`, `'eq-master-assistant'`, `'qa-deviation-assistant'`, `'meeting-notes-assistant'` 추가.

- [ ] **Step 6: tools.ts / actions.ts 임시 축소** — `SYSTEM_TOOLS: ToolDefinition[] = []`, `SYSTEM_ASSISTANT_PROMPT`는 문구만 "MES Assistant Hub"로. `actions.ts`의 `applyProposal`은 `default` 분기만 남기고 `toProposal`은 유지. (M7 Task 7.3에서 완성)

- [ ] **Step 7: hooks.ts** — `useTemplates` 삭제, 추가:

```ts
export function useAssistants(): Assistant[] {
  return useLiveQuery(() => db.assistants.toArray(), []) ?? []
}
export function useAssistantMap(): Map<ID, Assistant> {
  const list = useAssistants()
  return new Map(list.map((a) => [a.id, a]))
}
```

- [ ] **Step 8: seed/index.ts / exportImport.ts** — seed: 템플릿/모듈/`buildSeedTasks` import 제거, 테이블 목록을 새 스키마 12개로, 본문은 `users.bulkPut(SEED_USERS)` + settings만 (M2에서 채움). `ensureSeeded`는 `users.count()===0`일 때만. exportImport: `format: 'mes-assistant-hub'` (타입·`validateBundle`·`exportAll` 3곳), `exportImport.test.ts`의 `seed` describe는 `describe.skip`(M2에서 복구).

- [ ] **Step 9: 삭제 + 플레이스홀더 라우터**

```bash
git rm -r src/features/dashboard src/features/templates src/features/modules
git rm src/features/task/StepPanel.tsx src/features/task/WorkflowStepper.tsx src/features/task/InsertStepDialog.tsx src/features/task/ComposeWorkflowDialog.tsx src/features/task/CompleteStepDialog.tsx src/features/task/ManualTaskPanel.tsx
git rm src/db/seed/templates.ts src/db/seed/modules.ts src/db/seed/tasks.ts
git rm src/domain/reporting.ts src/domain/reporting.test.ts src/domain/taskReport.ts src/domain/taskReport.test.ts src/llm/context.test.ts
git rm src/assets/hero.png public/icons.svg
```

`src/features/Placeholder.tsx`:
```tsx
export function Placeholder({ name }: { name: string }) {
  return <div className="p-6 text-sm text-muted-foreground">{name} — 준비 중</div>
}
```

`router.tsx` children (모두 Placeholder, M3~M7에서 실제 페이지로 교체):
```tsx
{ index: true, element: <Placeholder name="카드맵" /> },
{ path: 'assistants/manage', element: <Placeholder name="어시스턴트 관리" /> },
{ path: 'assistants/:assistantId', element: <Placeholder name="어시스턴트 보드" /> },
{ path: 'tasks/:taskId', element: <Placeholder name="업무" /> },
{ path: 'packages', element: <Placeholder name="패키지 보관함" /> },
{ path: 'sr', element: <Placeholder name="SR 접수" /> },
{ path: 'sr/manage', element: <Placeholder name="SR 관리" /> },
{ path: 'reports', element: <Placeholder name="리포트" /> },
{ path: 'settings', element: <Placeholder name="설정" /> },
{ path: '*', element: <Navigate to="/" replace /> },
```
`AppShell.tsx` NAV:
```tsx
const NAV = [
  { to: '/', label: '어시스턴트', icon: LayoutGrid, end: true },
  { to: '/packages', label: '패키지', icon: Package },
  { to: '/sr', label: 'SR 접수', icon: Inbox },
  { to: '/reports', label: '리포트', icon: BarChart3 },
  { to: '/settings', label: '설정', icon: Settings },
]
```
사이드바 부제 `Workflow Platform` → `Assistant Hub`. `SystemAssistantDrawer` import는 유지하되 파일 상단에 `// @ts-nocheck` (M7에서 제거).

남은 미이식 파일(`src/features/task/*`, `src/features/chat/*`, `src/features/reports/*`, `src/features/settings/SettingsPage.tsx`, `src/features/system-assistant/*`)은 각 파일 첫 줄에 `// @ts-nocheck — M4/M7에서 이식` 추가. 라우터에서 참조되지 않으므로 번들에도 포함되지 않는다.

- [ ] **Step 10: 빌드/테스트 확인**

Run: `npm run build` → 성공. Run: `npx vitest run` → transitions·packages(domain)·modelResolution·links·sse·packages(repo) PASS, exportImport roundtrip PASS.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "refactor: replace workflow domain with assistant/task/package/sr model

- new types and Dexie schema (mes-assistant-hub v1)
- repositories: assistants, tasks, packages, sr, files/chat/notes ported
- domain: task status transitions, package input candidates/flow, model chain
- remove workflow templates, modules, step instances and their UI
- placeholder routes for the new screens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**M1 DoD 체크:** build ✅ / vitest ✅ / 워크플로우 코드 삭제 ✅ / 플레이스홀더 라우팅 ✅

---

# M2 — 시드 + 공통 컴포넌트

### Task 2.1: 어시스턴트 시드

**Files:**
- Create: `src/db/seed/assistants.ts`

- [ ] **Step 1: 작성** (9개; `checklistTemplate` id는 `ct_<assistant>_<n>` 고정)

```ts
import type { Assistant } from '@/domain/types'
import { pickColor } from '@/lib/colors'

const T = '2026-08-01T00:00:00.000Z'
const ct = (prefix: string, items: Array<[string, boolean]>) => items.map(([label, required], i) => ({ id: `ct_${prefix}_${i + 1}`, label, required }))
const base = (id: string) => ({ color: pickColor(id), createdBy: 'u_so', createdAt: T, updatedAt: T })

export const SEED_ASSISTANTS: Assistant[] = [
  { id: 'et-urs-assistant', name: 'URS 작성 도우미', level1: 'ET 개발', level2: 'URS 작성', status: 'open', ownerId: 'u_so',
    summary: '변경 요청을 요구사항 ID 단위로 정리하고 GxP 영향 항목을 함께 도출합니다.',
    docUrl: 'http://wiki.internal/assistants/urs', usageExample: '### 예시\n- "장비 이벤트 자동 처리 요구사항 초안 작성해줘"\n- "GxP 영향 평가 항목 정리해줘"',
    systemPromptHint: '당신은 MES URS 작성 전문가다. 요구사항은 URS-nn ID를 부여하고 우선순위와 GxP 영향을 표로 정리한다.',
    checklistTemplate: ct('urs', [['요구사항 ID 부여 및 우선순위 정리', true], ['GxP 영향 평가 완료', true], ['비즈니스 오너 리뷰', false]]), ...base('et-urs-assistant') },
  { id: 'et-fds-assistant', name: 'FDS 작성 도우미', level1: 'ET 개발', level2: 'FDS 작성', status: 'open', ownerId: 'u_dev1',
    summary: 'URS를 기능 명세로 매핑하고 추적성 매트릭스를 만듭니다.', docUrl: 'http://wiki.internal/assistants/fds',
    usageExample: '### 예시\n- "URS 기준으로 기능 목록 뽑아줘"\n- "추적성 매트릭스 만들어줘"',
    systemPromptHint: '당신은 MES 기능 설계(FDS) 전문가다. URS 항목과 1:1 추적 가능한 기능 명세를 작성한다.',
    checklistTemplate: ct('fds', [['URS-FDS 추적성 매트릭스 작성', true], ['인터페이스 영향 검토', false]]), ...base('et-fds-assistant') },
  { id: 'et-review-assistant', name: '코드 리뷰 도우미', level1: 'ET 개발', level2: '코드 리뷰', status: 'open', ownerId: 'u_dev2',
    summary: 'FDS 대비 구현 누락과 GMP 로깅 규칙 위반을 찾아냅니다.', usageExample: '### 예시\n- "이 변경분에서 감사추적 누락 찾아줘"',
    systemPromptHint: '당신은 MES 코드 리뷰어다. FDS 항목 대비 구현 누락, 감사추적(actor/timestamp) 누락, 예외 처리 부재를 지적한다.',
    checklistTemplate: ct('review', [['FDS 항목별 구현 확인', true], ['감사추적 로깅 확인', true]]), ...base('et-review-assistant') },
  { id: 'et-test-assistant', name: '테스트 시나리오 도우미', level1: 'ET 개발', level2: '테스트 시나리오', status: 'open', ownerId: 'u_req',
    summary: 'FDS 항목별 테스트 케이스와 경계값 케이스를 생성합니다.', usageExample: '### 예시\n- "FDS 항목별 테스트 케이스 생성해줘"',
    systemPromptHint: '당신은 CSV 테스트 설계자다. FDS 항목마다 정상/예외/경계 케이스를 표로 만든다.',
    checklistTemplate: ct('test', [['테스트 케이스 FDS 커버리지 100%', true], ['QA 승인', true]]), ...base('et-test-assistant') },
  { id: 'et-deploy-assistant', name: '배포 체크 도우미', level1: 'ET 개발', level2: '배포 검증', status: 'working', ownerId: 'u_so',
    summary: '배포 전후 검증 SQL과 결과서 초안을 만듭니다.', usageExample: '### 예시\n- "배포 검증 SQL 만들어줘"',
    systemPromptHint: '당신은 MES 배포 검증 담당자다. 배포 전/후 대조 SQL과 결과서 양식을 제공한다.',
    checklistTemplate: ct('deploy', [['배포 전 백업 확인', true], ['배포 후 검증 결과서 작성', true]]), ...base('et-deploy-assistant') },
  { id: 'eq-master-assistant', name: '장비 마스터 변경 검토', level1: '장비 마스터', level2: '변경 검토', status: 'open', ownerId: 'u_dev3',
    summary: '장비 마스터 변경 요청의 영향 범위(레시피·배치 기록)를 검토합니다.', usageExample: '### 예시\n- "장비 클래스 변경 영향 검토해줘"',
    systemPromptHint: '당신은 장비 마스터 데이터 관리자다. 변경이 레시피/EBR/알람에 미치는 영향을 나열한다.',
    checklistTemplate: ct('eq', [['영향 레시피 목록 확인', true]]), ...base('eq-master-assistant') },
  { id: 'qa-deviation-assistant', name: '일탈 보고서 초안', level1: '품질', level2: '일탈 보고서', status: 'open', ownerId: 'u_req',
    summary: '일탈 사건 기록을 보고서 양식(발생·원인·CAPA)으로 정리합니다.', usageExample: '### 예시\n- "이 사건 기록으로 일탈 보고서 초안 만들어줘"',
    systemPromptHint: '당신은 QA 일탈 조사 담당자다. 발생 경위, 영향 평가, 근본 원인, CAPA 순으로 작성한다.',
    checklistTemplate: ct('qa', [['영향 평가 완료', true], ['CAPA 정의', true]]), ...base('qa-deviation-assistant') },
  { id: 'meeting-notes-assistant', name: '회의록 정리', level1: '공통', level2: '회의록', status: 'working', ownerId: 'u_dev1',
    summary: '회의 메모를 결정사항/액션아이템으로 정리합니다.', usageExample: '### 예시\n- "이 메모를 회의록으로 정리해줘"',
    systemPromptHint: '회의 메모를 결정사항, 액션아이템(담당/기한), 미결 이슈로 구조화한다.',
    checklistTemplate: [], ...base('meeting-notes-assistant') },
  { id: 'legacy-sql-assistant', name: '레거시 SQL 변환', level1: '공통', level2: 'SQL 변환', status: 'retired', ownerId: 'u_dev2',
    summary: '(폐기) Oracle 프로시저를 신규 스키마로 변환하던 도우미.', usageExample: '', systemPromptHint: '', checklistTemplate: [], ...base('legacy-sql-assistant') },
  { id: 'sr-intake-assistant', name: 'SR 접수 도우미', level1: '공통', level2: 'SR 접수', status: 'open', ownerId: 'u_so',
    summary: '요청자와 대화하며 요청을 제목/배경/원하는 결과/기한으로 구조화합니다.', usageExample: '### 예시\n- "장비 화면에 알람 필터 추가하고 싶어요"',
    systemPromptHint: '당신은 MES 서비스 요청(SR) 접수 도우미다. 요청자의 말을 듣고 제목, 배경, 원하는 결과, 희망 기한을 한 번에 하나씩 확인 질문한다. 충분히 모이면 "접수로 전환" 버튼을 안내한다.',
    checklistTemplate: [], ...base('sr-intake-assistant') },
]
```

### Task 2.2: 시드 빌더 + 데이터

**Files:**
- Modify: `src/db/seed/builder.ts` (전체 교체), `src/db/seed/index.ts`
- Create: `src/db/seed/data.ts`

- [ ] **Step 1: builder.ts 교체** — step 개념 제거, 패키지/SR 헬퍼 추가.

```ts
import { subDays, subHours, subMinutes } from 'date-fns'
import type { ActivityLog, ActivityType, FileAsset, ID, Message, Note, Package, PackageReceipt, Priority, ServiceRequest, SrStatus, Task, TaskStatus, Thread } from '@/domain/types'

export interface SeedBundle {
  tasks: Task[]; threads: Thread[]; messages: Message[]; files: FileAsset[]; notes: Note[]
  packages: Package[]; packageReceipts: PackageReceipt[]; serviceRequests: ServiceRequest[]; activity: ActivityLog[]
}

export interface TaskSpec {
  id: string; code: string; assistantId: ID; title: string; summary: string
  status: TaskStatus; ownerId: ID; assigneeIds: ID[]; priority: Priority
  createdDaysAgo: number; startedDaysAgo?: number; completedDaysAgo?: number; dueDaysFromNow?: number
  tags?: string[]; checklist?: Array<[label: string, required: boolean, checked: boolean]>
  feedback?: { rating: number; comment: string; by: ID }
}

export class SeedBuilder {
  readonly bundle: SeedBundle = { tasks: [], threads: [], messages: [], files: [], notes: [], packages: [], packageReceipts: [], serviceRequests: [], activity: [] }
  private seq = 0
  constructor(private readonly now: Date) {}

  private id(prefix: string): string {
    this.seq += 1
    return `${prefix}_seed_${this.seq.toString().padStart(4, '0')}`
  }
  daysAgo(days: number, hours = 0): string { return subHours(subDays(this.now, days), hours).toISOString() }
  minutesAgo(min: number): string { return subMinutes(this.now, min).toISOString() }

  log(type: ActivityType, userId: ID, at: string, target: Partial<Pick<ActivityLog, 'taskId' | 'assistantId' | 'srId' | 'packageId'>>, payload: Record<string, unknown> = {}): void {
    this.bundle.activity.push({ id: this.id('act'), ...target, userId, type, payload, at })
  }

  addTask(spec: TaskSpec): Task {
    const createdAt = this.daysAgo(spec.createdDaysAgo)
    const startedAt = spec.startedDaysAgo !== undefined ? this.daysAgo(spec.startedDaysAgo) : undefined
    const completedAt = spec.completedDaysAgo !== undefined ? this.daysAgo(spec.completedDaysAgo) : undefined
    const task: Task = {
      id: spec.id, code: spec.code, assistantId: spec.assistantId, title: spec.title, summary: spec.summary, status: spec.status,
      ownerId: spec.ownerId, assigneeIds: spec.assigneeIds, priority: spec.priority,
      dueDate: spec.dueDaysFromNow !== undefined ? this.daysAgo(-spec.dueDaysFromNow) : undefined, tags: spec.tags ?? [],
      checklist: (spec.checklist ?? []).map(([label, required, checked], i) => ({ id: `${spec.id}_chk${i}`, label, required, checked, checkedBy: checked ? spec.ownerId : undefined, checkedAt: checked ? startedAt ?? createdAt : undefined })),
      inputFileIds: [], outputFileIds: [], srIds: [], createdAt, createdBy: spec.ownerId, startedAt, completedAt, completedBy: completedAt ? spec.ownerId : undefined,
      feedback: spec.feedback ? { ...spec.feedback, at: completedAt ?? createdAt } : undefined,
    }
    this.bundle.tasks.push(task)
    this.log('task.created', spec.ownerId, createdAt, { taskId: task.id, assistantId: task.assistantId })
    if (startedAt) this.log('task.started', spec.ownerId, startedAt, { taskId: task.id, assistantId: task.assistantId })
    for (const c of task.checklist) if (c.checked) this.log('checklist.checked', spec.ownerId, c.checkedAt!, { taskId: task.id }, { label: c.label })
    if (completedAt) this.log('task.completed', spec.ownerId, completedAt, { taskId: task.id, assistantId: task.assistantId })
    if (spec.feedback && completedAt) this.log('feedback.given', spec.feedback.by, completedAt, { taskId: task.id, assistantId: task.assistantId }, { rating: spec.feedback.rating })
    return task
  }

  /** 스레드 + 교대로 user/assistant 메시지. 마지막 assistant 메시지를 산출물로 저장할 수 있게 반환 */
  addThread(task: Task, authorId: ID, turns: string[], startDaysAgo: number): { thread: Thread; messages: Message[] } {
    const thread: Thread = { id: this.id('thr'), taskId: task.id, title: '스레드 1', createdAt: this.daysAgo(startDaysAgo), createdBy: authorId, archived: false }
    this.bundle.threads.push(thread)
    task.activeThreadId = thread.id
    const messages = turns.map((content, i): Message => ({
      id: this.id('msg'), threadId: thread.id, role: i % 2 === 0 ? 'user' : 'assistant', content, authorId: i % 2 === 0 ? authorId : undefined,
      createdAt: this.daysAgo(startDaysAgo, -(i * 2)), attachmentIds: [], status: 'done',
    }))
    this.bundle.messages.push(...messages)
    this.log('thread.created', authorId, thread.createdAt, { taskId: task.id })
    return { thread, messages }
  }

  addFile(task: Task, name: string, content: string, opts: { output?: boolean; input?: boolean; by: ID; daysAgo: number; source?: FileAsset['source'] }): FileAsset {
    const blob = new Blob([content], { type: 'text/markdown' })
    const file: FileAsset = { id: this.id('file'), originTaskId: task.id, name, mime: 'text/markdown', size: blob.size, blob, uploadedBy: opts.by, uploadedAt: this.daysAgo(opts.daysAgo), source: opts.source ?? (opts.output ? 'assistant' : 'upload'), tags: opts.output ? ['산출물'] : [], version: 1 }
    this.bundle.files.push(file)
    if (opts.output) { task.outputFileIds = [...task.outputFileIds, file.id]; this.log('file.tagged_output', opts.by, file.uploadedAt, { taskId: task.id }, { name }) }
    else this.log('file.uploaded', opts.by, file.uploadedAt, { taskId: task.id }, { name })
    if (opts.input) task.inputFileIds = [...task.inputFileIds, file.id]
    return file
  }

  addNote(task: Task, authorId: ID, content: string, daysAgo: number): void {
    const note: Note = { id: this.id('note'), taskId: task.id, authorId, content, createdAt: this.daysAgo(daysAgo), attachmentIds: [] }
    this.bundle.notes.push(note)
    this.log('note.added', authorId, note.createdAt, { taskId: task.id }, { preview: content.slice(0, 60) })
  }

  publish(task: Task, code: string, title: string, summary: string, fileIds: ID[], suggested: ID[], daysAgo: number, status: Package['status'] = 'open'): Package {
    const pkg: Package = { id: this.id('pkg'), code, fromTaskId: task.id, fromAssistantId: task.assistantId, title, summary, fileIds, suggestedAssistantIds: suggested, status, publishedBy: task.ownerId, publishedAt: this.daysAgo(daysAgo) }
    this.bundle.packages.push(pkg)
    this.log('package.published', task.ownerId, pkg.publishedAt, { taskId: task.id, packageId: pkg.id, assistantId: task.assistantId }, { code, title, files: fileIds.length })
    return pkg
  }

  receive(pkg: Package, task: Task, by: ID, daysAgo: number, detachedDaysAgo?: number): void {
    const at = this.daysAgo(daysAgo)
    this.log('package.received', by, at, { taskId: task.id, packageId: pkg.id, assistantId: task.assistantId }, { code: pkg.code, title: pkg.title })
    if (detachedDaysAgo !== undefined) {
      this.log('package.detached', by, this.daysAgo(detachedDaysAgo), { taskId: task.id, packageId: pkg.id }, { code: pkg.code })
      return
    }
    this.bundle.packageReceipts.push({ id: this.id('rcpt'), packageId: pkg.id, taskId: task.id, receivedBy: by, receivedAt: at })
    task.inputFileIds = Array.from(new Set([...task.inputFileIds, ...pkg.fileIds]))
  }

  addSr(spec: { id: string; code: string; requesterId: ID; title: string; body: string; status: SrStatus; createdDaysAgo: number; turns: string[]; linkTo?: Task }): ServiceRequest {
    const createdAt = this.daysAgo(spec.createdDaysAgo)
    const thread: Thread = { id: this.id('thr'), srId: spec.id, title: '접수 대화', createdAt, createdBy: spec.requesterId, archived: false }
    this.bundle.threads.push(thread)
    this.bundle.messages.push(...spec.turns.map((content, i): Message => ({ id: this.id('msg'), threadId: thread.id, role: i % 2 === 0 ? 'user' : 'assistant', content, authorId: i % 2 === 0 ? spec.requesterId : undefined, createdAt: this.daysAgo(spec.createdDaysAgo, -(i * 1)), attachmentIds: [], status: 'done' })))
    const submitted = spec.status !== 'draft'
    const sr: ServiceRequest = { id: spec.id, code: submitted ? spec.code : '', requesterId: spec.requesterId, title: submitted ? spec.title : '', body: submitted ? spec.body : '', status: spec.status, attachmentIds: [], threadId: thread.id, submittedAt: submitted ? this.daysAgo(spec.createdDaysAgo, -2) : undefined, createdAt, updatedAt: createdAt }
    this.bundle.serviceRequests.push(sr)
    this.log('sr.created', spec.requesterId, createdAt, { srId: sr.id })
    if (submitted) this.log('sr.submitted', spec.requesterId, sr.submittedAt!, { srId: sr.id }, { code: sr.code })
    if (spec.linkTo) { spec.linkTo.srIds = [...spec.linkTo.srIds, sr.id]; this.log('sr.linked', spec.linkTo.ownerId, this.daysAgo(spec.createdDaysAgo, -6), { taskId: spec.linkTo.id, srId: sr.id }, { code: sr.code, taskCode: spec.linkTo.code }) }
    return sr
  }
}
```

- [ ] **Step 2: data.ts 작성** — `buildSeedData(now): SeedBundle`. 아래 시나리오를 그대로 코드로 옮긴다 (업무 14, 패키지 4, SR 6).

| 코드 | 어시스턴트 | 제목 | 상태 | 담당 | 비고 |
|---|---|---|---|---|---|
| WK-2026-0001 | et-urs-assistant | 장비 이벤트 자동 처리 URS | done (created 20d, started 19d, completed 14d) | u_so | 스레드 3턴(URS 시나리오), 산출물 `URS_WK-2026-0001_v1.md`, 체크 3/3, 피드백 5 |
| WK-2026-0002 | et-fds-assistant | [받음] 장비 이벤트 자동 처리 URS 산출물 | done (13d→8d) | u_dev1 | PKG-0001 수신, 산출물 `FDS_WK-2026-0002_v1.md`, 피드백 4 |
| WK-2026-0003 | et-review-assistant | 이벤트 처리 모듈 코드 리뷰 | in_progress (7d) | u_dev2 | PKG-0002 수신 후 **떼기**(detached 5d) → 다시 받은 상태 없음. 노트 1 |
| WK-2026-0004 | et-test-assistant | 이벤트 처리 테스트 시나리오 | todo (6d) | u_req | PKG-0002 수신(입력 파일 = FDS) |
| WK-2026-0005 | et-urs-assistant | 배치 기록 서명 화면 개선 URS | in_progress (5d, due +7d) | u_so | 스레드 1턴, 체크 1/3 |
| WK-2026-0006 | et-urs-assistant | 알람 필터 추가 요구사항 | todo (2d, due +10d) | u_so | SR-0002 연결 |
| WK-2026-0007 | et-deploy-assistant | 9월 정기 배포 검증 | on_hold (10d) | u_so | 노트 "인프라 일정 대기" |
| WK-2026-0008 | eq-master-assistant | 충전기 EQ-1042 클래스 변경 검토 | done (15d→12d) | u_dev3 | 산출물 1, 피드백 3, PKG-0003 발행(미수신, 추천 et-urs-assistant) |
| WK-2026-0009 | eq-master-assistant | 신규 라인 장비 마스터 등록 | in_progress (4d) | u_dev3 | SR-0003 연결 |
| WK-2026-0010 | qa-deviation-assistant | 온도 이탈 일탈 보고서 초안 | in_progress (3d, due +2d, urgent) | u_req | 업로드 입력 파일 `사건기록_0917.md` |
| WK-2026-0011 | qa-deviation-assistant | 라벨 불일치 일탈 보고서 | done (30d→25d) | u_req | 피드백 4, PKG-0004 발행(추천 et-urs-assistant, meeting-notes-assistant) |
| WK-2026-0012 | meeting-notes-assistant | 주간 개발 회의록 9/15 | done (6d→6d) | u_dev1 | 산출물 1 |
| WK-2026-0013 | meeting-notes-assistant | CAB 회의록 9/18 | todo (3d) | u_dev1 | — |
| WK-2026-0014 | et-review-assistant | 서명 화면 리팩터링 리뷰 | in_progress (12d) | u_dev2 | 장기 업무(비효율 신호용) |

패키지: PKG-2026-0001(WK-0001→ URS 파일, 추천 et-fds-assistant, 수신 WK-0002), PKG-2026-0002(WK-0002 → FDS 파일, 추천 et-review/et-test, 수신 WK-0004, WK-0003은 떼어냄), PKG-2026-0003(WK-0008, 미수신), PKG-2026-0004(WK-0011, archived).

SR: SR-draft(u_dev3, draft, 2턴 대화 진행 중), SR-2026-0001(u_dev3, submitted, "포장 라인 화면 폰트 확대"), SR-2026-0002(u_dev3, in_progress, "알람 필터 추가", WK-0006 연결), SR-2026-0003(u_dev2, in_progress, "신규 라인 장비 등록", WK-0009 연결), SR-2026-0004(u_dev3, done, "로그인 세션 시간 연장"), SR-2026-0005(u_dev1, rejected, "개인 대시보드 요청").

스레드 본문은 `mockScenarios.ts`의 URS/FDS 시나리오 1·2턴 텍스트를 `scenarioFor()`로 가져와 생성한다 (`turn` 0,1에 `taskTitle` 넣어 호출).

- [ ] **Step 3: seed/index.ts** — `buildSeedData(now)` 결과를 12개 테이블에 bulkPut, `settings.put({ id:'app', currentUserId: DEFAULT_USER_ID, srIntakeAssistantId: 'sr-intake-assistant', llm: DEFAULT_LLM_SETTINGS })`.

- [ ] **Step 4: exportImport.test.ts의 seed describe 복구**

```ts
describe('seed', () => {
  it('creates assistants, tasks, packages and srs consistently', async () => {
    expect(await database.users.count()).toBe(5)
    expect(await database.assistants.count()).toBe(SEED_ASSISTANTS.length) // 9 업무용 + SR 접수 도우미 = 10
    expect(await database.tasks.count()).toBeGreaterThanOrEqual(12)
    expect(await database.packages.count()).toBe(4)
    expect(await database.serviceRequests.count()).toBe(6)
    for (const t of await database.tasks.toArray()) expect(await database.assistants.get(t.assistantId)).toBeDefined()
    for (const p of await database.packages.toArray()) for (const fid of p.fileIds) expect(await database.files.get(fid)).toBeDefined()
    for (const r of await database.packageReceipts.toArray()) {
      const [p, t] = await Promise.all([database.packages.get(r.packageId), database.tasks.get(r.taskId)])
      expect(p).toBeDefined(); expect(t).toBeDefined()
      for (const fid of p!.fileIds) expect(t!.inputFileIds).toContain(fid)
    }
    for (const sr of await database.serviceRequests.toArray()) expect(await database.threads.get(sr.threadId)).toBeDefined()
  })
})
```

- [ ] **Step 5: 실행** — `npx vitest run src/db` → PASS. `npm run dev` 후 DevTools Application → IndexedDB에 `mes-assistant-hub` 테이블이 채워짐 확인.
- [ ] **Step 6: 커밋** — `feat(seed): assistant catalog, tasks, packages and SR scenario data`

### Task 2.3: 공통 컴포넌트

**Files:**
- Create: `src/components/AssistantAvatar.tsx`, `src/components/EmptyState.tsx`, `src/components/ConfirmDialog.tsx`
- Modify: `src/components/StatusBadges.tsx`

- [ ] **Step 1: AssistantAvatar** — 이미지(blob→objectURL, `useEffect`에서 revoke) 있으면 `<img className="object-cover">`, 없으면 `initialsOf(name)`을 `color` 배경에.

```tsx
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { cn } from '@/lib/utils'
import { initialsOf } from '@/lib/colors'
import type { Assistant } from '@/domain/types'

const SIZE = { sm: 'size-8 text-xs rounded-lg', md: 'size-12 text-base rounded-xl', lg: 'size-20 text-2xl rounded-2xl', xl: 'aspect-square w-full text-4xl rounded-2xl' }

export function AssistantAvatar({ assistant, size = 'md', className }: { assistant: Pick<Assistant, 'name' | 'color' | 'imageId'>; size?: keyof typeof SIZE; className?: string }) {
  const file = useLiveQuery(() => (assistant.imageId ? db.files.get(assistant.imageId) : undefined), [assistant.imageId])
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!file) { setUrl(undefined); return }
    const u = URL.createObjectURL(file.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  if (url) return <img src={url} alt={assistant.name} className={cn('shrink-0 object-cover', SIZE[size], className)} />
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center font-semibold text-white', SIZE[size], className)} style={{ backgroundColor: assistant.color }}>
      {initialsOf(assistant.name)}
    </span>
  )
}
```

- [ ] **Step 2: EmptyState** — `{ icon, title, description?, action? }` props, 중앙 정렬 점선 박스.
- [ ] **Step 3: ConfirmDialog** — `{ open, onOpenChange, title, description, confirmLabel='삭제', destructive, onConfirm }`; shadcn `Dialog` 사용. 모든 파괴 액션은 이걸 쓴다(`window.confirm` 금지).
- [ ] **Step 4: StatusBadges** — `StepStatusBadge`/`StepChip` 삭제, `TaskStatusBadge`(todo=slate, in_progress=blue, on_hold=amber, done=emerald), `AssistantStatusBadge`(open=emerald, working=blue, retired=slate), `SrStatusBadge`(draft=slate, submitted=violet, reviewing=amber, in_progress=blue, done=emerald, rejected=red), `PriorityBadge` 유지.
- [ ] **Step 5: 빌드 확인 후 커밋** — `feat(ui): assistant avatar, empty state, confirm dialog, status badges`

**M2 DoD 체크:** 첫 실행 시드 ✅ / exportImport.test seed 정합성 ✅ / 공통 컴포넌트 ✅

---

# M3 — 카드맵 · 어시스턴트 관리 · 보드

### Task 3.1: 카드맵 데이터 훅

**Files:**
- Create: `src/features/home/useAssistantStats.ts`

- [ ] **Step 1: 작성**

```ts
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { Assistant, ID } from '@/domain/types'

export interface AssistantRow {
  assistant: Assistant
  activeCount: number
  overdueCount: number
  doneCount: number
}

/** 카드맵 한 줄: 어시스턴트 + 업무 집계 */
export function useAssistantRows(): AssistantRow[] | undefined {
  return useLiveQuery(async () => {
    const [assistants, tasks] = await Promise.all([db.assistants.toArray(), db.tasks.toArray()])
    const today = new Date().toISOString().slice(0, 10)
    const by = new Map<ID, AssistantRow>(assistants.map((a) => [a.id, { assistant: a, activeCount: 0, overdueCount: 0, doneCount: 0 }]))
    for (const t of tasks) {
      const row = by.get(t.assistantId)
      if (!row) continue
      if (t.status === 'done') row.doneCount += 1
      else {
        row.activeCount += 1
        if (t.dueDate && t.dueDate.slice(0, 10) < today) row.overdueCount += 1
      }
    }
    return [...by.values()].sort((a, b) => a.assistant.level1.localeCompare(b.assistant.level1) || a.assistant.level2.localeCompare(b.assistant.level2) || a.assistant.name.localeCompare(b.assistant.name))
  }, [])
}
```
(집계 객체는 훅 내부에서만 생성·변경되는 로컬 값이라 불변 규칙 위반이 아니다.)

### Task 3.2: 카드맵 페이지

**Files:**
- Create: `src/features/home/HomePage.tsx`, `src/features/home/AssistantCard.tsx`, `src/features/home/CardMapFilterBar.tsx`
- Modify: `src/app/uiStore.ts` (BoardFilters 제거 → `homeFilters: { q: string; level1: string | null; showRetired: boolean }`, `boardView: 'kanban' | 'list'`, `boardHideDone: boolean`), `src/app/router.tsx`

- [ ] **Step 1: uiStore 교체**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface HomeFilters { q: string; level1: string | null; showRetired: boolean }
interface UiState {
  homeFilters: HomeFilters
  setHomeFilters: (patch: Partial<HomeFilters>) => void
  boardView: 'kanban' | 'list'
  setBoardView: (v: 'kanban' | 'list') => void
  boardHideDone: boolean
  setBoardHideDone: (v: boolean) => void
}
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      homeFilters: { q: '', level1: null, showRetired: false },
      setHomeFilters: (patch) => set((s) => ({ homeFilters: { ...s.homeFilters, ...patch } })),
      boardView: 'kanban',
      setBoardView: (boardView) => set({ boardView }),
      boardHideDone: false,
      setBoardHideDone: (boardHideDone) => set({ boardHideDone }),
    }),
    { name: 'mes-hub-ui' },
  ),
)
```

- [ ] **Step 2: AssistantCard.tsx** — 정사각 카드. 구조:

```tsx
<Link to={`/assistants/${a.id}`} className="group relative flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
  <div className="flex items-start justify-between">
    <AssistantAvatar assistant={a} size="lg" />
    <AssistantStatusBadge status={a.status} />
  </div>
  <div className="min-w-0">
    <div className="text-[11px] text-muted-foreground">{a.level1} › {a.level2}</div>
    <div className="truncate font-semibold">{a.name}</div>
    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.summary}</p>
  </div>
  <div className="mt-auto flex items-center justify-between text-xs">
    <span className="inline-flex items-center gap-1"><span className="font-medium">{row.activeCount}</span> 진행 {row.overdueCount > 0 && <span className="text-red-600">· 지연 {row.overdueCount}</span>}</span>
    <UserAvatar user={owner} size="xs" />
  </div>
  {/* hover 액션: 새 업무 / OpenWebUI / 설명 — e.preventDefault()로 Link 이동 막고 각자 동작 */}
  <div className="absolute inset-x-3 bottom-3 hidden gap-1 group-hover:flex">
    <Button size="xs" variant="secondary" onClick={(e) => { e.preventDefault(); onNewTask(a.id) }}><Plus /> 새 업무</Button>
    <Button size="xs" variant="ghost" asChild><a href={assistantExternalUrl(baseUrl, a.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><ExternalLink /> OpenWebUI</a></Button>
    {a.docUrl && <Button size="xs" variant="ghost" asChild><a href={a.docUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><BookOpen /> 설명</a></Button>}
  </div>
</Link>
```
hover 액션이 카드 하단 통계와 겹치므로 통계 영역에 `group-hover:invisible`을 준다.

- [ ] **Step 3: CardMapFilterBar.tsx** — 검색 `Input`(이름/요약/Lv 검색), Lv1 칩(`ToggleGroup type="single"`, 값은 어시스턴트에서 유니크 추출), "폐기 표시" `Switch`. 값은 `useUiStore().homeFilters`.

- [ ] **Step 4: HomePage.tsx**

```tsx
export function HomePage() {
  const rows = useAssistantRows()
  const { homeFilters } = useUiStore()
  const settings = useSettings()
  const users = useUserMap()
  const navigate = useNavigate()
  const [newTaskFor, setNewTaskFor] = useState<string | null>(null)
  const filtered = (rows ?? []).filter(({ assistant: a }) =>
    (homeFilters.showRetired || a.status !== 'retired') &&
    (!homeFilters.level1 || a.level1 === homeFilters.level1) &&
    (!homeFilters.q || `${a.name} ${a.summary} ${a.level1} ${a.level2}`.toLowerCase().includes(homeFilters.q.toLowerCase())))
  return (
    <>
      <TopBar title="어시스턴트" actions={<Button asChild variant="outline" size="sm"><Link to="/assistants/manage"><Settings2 /> 관리</Link></Button>} />
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <CardMapFilterBar level1Options={[...new Set((rows ?? []).map((r) => r.assistant.level1))]} />
        {rows && filtered.length === 0 && <EmptyState icon={Bot} title="어시스턴트가 없습니다" action={<Button asChild><Link to="/assistants/manage">어시스턴트 등록</Link></Button>} />}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((row) => <AssistantCard key={row.assistant.id} row={row} owner={users.get(row.assistant.ownerId)} baseUrl={settings?.llm.baseUrl ?? ''} onNewTask={setNewTaskFor} />)}
        </div>
      </div>
      {newTaskFor && <NewTaskDialog assistantId={newTaskFor} open onOpenChange={(o) => !o && setNewTaskFor(null)} onCreated={(t) => navigate(`/tasks/${t.id}`)} />}
    </>
  )
}
```
`NewTaskDialog`는 Task 3.5에서 만든다; 그때까지 이 줄은 주석 처리.

- [ ] **Step 5: router.tsx** — index를 `<HomePage />`로. `npm run dev`로 `/`에서 10개 카드(폐기 숨김이면 9개) 확인.
- [ ] **Step 6: 커밋** — `feat(home): assistant card map with filters`

### Task 3.3: 어시스턴트 관리 페이지

**Files:**
- Create: `src/features/assistants/ManagePage.tsx`, `AssistantTable.tsx`, `AssistantEditorSheet.tsx`, `ImageDropzone.tsx`

- [ ] **Step 1: AssistantTable.tsx** — shadcn `Table`. 컬럼 순서 고정: 업무Lv1 · 업무Lv2 · AssistantName(아바타+이름) · 요약(truncate) · 링크1(복사 버튼 + 새 창) · 링크2(있으면 아이콘 링크) · 담당자(UserAvatar showName) · 상태(`Select`, onChange → `setAssistantStatus`) · 사용예시(`Tooltip`에 markdown 첫 줄, 클릭 시 Popover 전체). 행 클릭 → `onEdit(assistant)`. 링크1 복사: `navigator.clipboard.writeText(assistantExternalUrl(baseUrl, a.id))` + toast.

- [ ] **Step 2: ImageDropzone.tsx**

```tsx
export function ImageDropzone({ assistant, onChange }: { assistant?: Pick<Assistant, 'name' | 'color' | 'imageId'>; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState<string>()
  const inputRef = useRef<HTMLInputElement>(null)
  const pick = (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('이미지 파일만 업로드할 수 있습니다.'); return }
    if (f.size > 2 * 1024 * 1024) { toast.error('2MB 이하 이미지만 가능합니다.'); return }
    setPreview(URL.createObjectURL(f)); onChange(f)
  }
  return (
    <div className="flex items-center gap-4">
      <div className="size-24 overflow-hidden rounded-2xl border" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}>
        {preview ? <img src={preview} className="size-full object-cover" /> : assistant ? <AssistantAvatar assistant={assistant} size="lg" className="size-full rounded-none" /> : <span className="flex size-full items-center justify-center text-xs text-muted-foreground">이미지</span>}
      </div>
      <div className="flex flex-col gap-1">
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}><Upload /> 업로드</Button>
        {(preview || assistant?.imageId) && <Button size="sm" variant="ghost" onClick={() => { setPreview(undefined); onChange(null) }}><X /> 이니셜로</Button>}
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  )
}
```
`onChange(null)`은 "이미지 제거"로 해석; 변경 없음은 `undefined`(호출 안 함)로 구분.

- [ ] **Step 3: AssistantEditorSheet.tsx** — shadcn `Sheet`(우측, `sm:max-w-xl`). 로컬 폼 state는 하나의 객체 `form`으로 두고 `setForm((f) => ({ ...f, [k]: v }))`. 필드: ImageDropzone · ID(신규만 편집 가능; `useModelList()` 목록에서 선택하는 `Select` + "직접 입력" 토글) · 이름 · Lv1(`Input` + datalist 기존값) · Lv2 · 요약 · 링크1 미리보기(읽기 전용 텍스트) · 링크2 · 담당자(`Select` users) · 상태 · systemPromptHint(`Textarea`) · 체크리스트 템플릿(라인 편집: label + 필수 switch + 삭제, "항목 추가") · 사용예시(`Textarea` + 미리보기 `Tabs`). 저장: 신규면 `createAssistant` 후 이미지 있으면 `setAssistantImage`; 편집이면 `updateAssistant` + 이미지 변경 시 `setAssistantImage`. 오류는 `toast.error(e.message)`. 하단에 삭제 버튼(편집 시만) → `ConfirmDialog` → `deleteAssistant`; `ok:false`면 reason 토스트.

- [ ] **Step 4: ManagePage.tsx** — `TopBar title="어시스턴트 관리" actions=<Button onClick={openNew}>새 어시스턴트</Button>`, 검색 Input, `AssistantTable`, `AssistantEditorSheet`. router에 연결.
- [ ] **Step 5: 수동 확인** — 새 어시스턴트 등록(이미지 포함) → 카드맵에 이미지 표시 → 이미지 제거 → 이니셜 복귀 → 상태 폐기 → 카드맵에서 숨김.
- [ ] **Step 6: 커밋** — `feat(assistants): management table and editor with image upload`

### Task 3.4: 보드 데이터 훅

**Files:**
- Create: `src/features/assistants/useBoardData.ts`

- [ ] **Step 1: 작성**

```ts
export interface BoardRow {
  task: Task
  assignees: (User | undefined)[]
  checklist: { done: number; total: number }
  receivedCount: number
  overdue: boolean
}
export interface BoardData { assistant: Assistant; rows: BoardRow[]; kpi: { active: number; overdue: number; doneThisWeek: number; avgRating?: number } }

export function useBoardData(assistantId: string | undefined): BoardData | null | undefined {
  return useLiveQuery(async () => {
    if (!assistantId) return null
    const assistant = await db.assistants.get(assistantId)
    if (!assistant) return null
    const [tasks, users, receipts] = await Promise.all([db.tasks.where('assistantId').equals(assistantId).toArray(), db.users.toArray(), db.packageReceipts.toArray()])
    const userMap = new Map(users.map((u) => [u.id, u]))
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const rows = tasks.map((task): BoardRow => ({
      task, assignees: task.assigneeIds.map((id) => userMap.get(id)), checklist: checklistProgress(task),
      receivedCount: receipts.filter((r) => r.taskId === task.id).length,
      overdue: task.status !== 'done' && !!task.dueDate && task.dueDate.slice(0, 10) < today,
    })).sort((a, b) => b.task.createdAt.localeCompare(a.task.createdAt))
    const ratings = tasks.map((t) => t.feedback?.rating).filter((r): r is number => typeof r === 'number')
    return {
      assistant, rows,
      kpi: {
        active: rows.filter((r) => r.task.status !== 'done').length,
        overdue: rows.filter((r) => r.overdue).length,
        doneThisWeek: tasks.filter((t) => t.completedAt && t.completedAt >= weekAgo).length,
        avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : undefined,
      },
    }
  }, [assistantId])
}
```

### Task 3.5: 새 업무 다이얼로그

**Files:**
- Create: `src/features/assistants/NewTaskDialog.tsx`

- [ ] **Step 1: 작성** — props `{ assistantId, open, onOpenChange, onCreated(task) }`. 필드: 제목(필수) · 요약 · 우선순위 · 기한(`Input type=date`) · 담당자(멀티 체크, 기본 = 현재 사용자) · "패키지 받기"(선택, `ReceivePackageDialog`는 M5에서 만들므로 지금은 숨김 플래그 `showPackagePicker=false`) · "SR 연결"(M6에서 활성). 제출: `createTask(actor, {...})` → `onCreated`. 제목 비면 버튼 disabled.
- [ ] **Step 2: HomePage의 주석 해제, 빌드 확인.**

### Task 3.6: 보드 페이지 (칸반 dnd + 리스트)

**Files:**
- Create: `src/features/assistants/BoardPage.tsx`, `BoardKpiTiles.tsx`, `BoardKanban.tsx`, `BoardList.tsx`, `TaskCard.tsx`

- [ ] **Step 1: TaskCard.tsx** — 좌측 색띠(`borderLeftColor: assistant.color`), 코드(mono, muted) · 제목 · `PriorityBadge` · 기한(지연이면 `text-red-600`) · `AvatarGroup` · 체크리스트 진행바(`Progress`) · chip 영역 `📦 {receivedCount}` / `SR {srIds.length}`(0이면 숨김). 전체가 `Link to=/tasks/:id`. dnd에서 쓰기 위해 `forwardRef` 없이 `div` 래퍼에 `useDraggable` 붙인다(래퍼는 BoardKanban에서).

- [ ] **Step 2: BoardKanban.tsx** — `DndContext` + 컬럼 4개(`TASK_STATUSES` 순, 라벨 `TASK_STATUS_LABEL`). 각 컬럼은 `useDroppable({ id: status })`, 카드 래퍼는 `useDraggable({ id: task.id })`. `onDragEnd`: `over?.id`가 status이고 현재와 다르면 `setTaskStatus(actor, taskId, over.id as TaskStatus)`; done으로 드롭 시 `TaskCompleteDialog`를 여는 대신 즉시 완료 처리하지 않고 `onRequestComplete(task)` 콜백으로 위임(M4에서 다이얼로그 연결; 그때까지는 바로 `setTaskStatus`). `PointerSensor` `activationConstraint: { distance: 6 }` 로 클릭(Link 이동)과 드래그를 구분. 컬럼 헤더에 개수, 빈 컬럼은 점선 박스 "여기로 끌어다 놓기".

- [ ] **Step 3: BoardList.tsx** — `Table`: 코드 · 제목 · 상태 배지 · 담당 · 우선순위 · 기한 · 체크리스트(`3/5`) · 📦/SR chip · 갱신(`formatRelative(completedAt ?? startedAt ?? createdAt)`). 행 클릭 이동.

- [ ] **Step 4: BoardKpiTiles.tsx** — 4타일: 진행 중 / 지연(빨강) / 이번 주 완료 / 평균 피드백(★ n.n 또는 "-").

- [ ] **Step 5: BoardPage.tsx**

헤더 블록: `AssistantAvatar size="lg"` · 이름 · `Lv1 › Lv2` · `AssistantStatusBadge` · 요약 · 담당자 · 버튼(OpenWebUI 열기, 설명 링크, 관리로) · `Collapsible` "사용예시"(Markdown). 툴바: 검색 Input · 담당자 Select · 우선순위 Select · "완료 숨김" Switch(`boardHideDone`) · 뷰 토글(`ToggleGroup`: 칸반/리스트, `boardView`) · "새 업무" 버튼. 본문: 필터된 rows를 `BoardKanban` 또는 `BoardList`에. 어시스턴트 없으면 `Navigate to="/"`. 페이지 제목은 `TopBar title={assistant.name}`.

- [ ] **Step 6: router 연결, 수동 확인** — 카드 드래그로 todo→in_progress 변경 후 히스토리(M4 전이므로 DevTools activity 테이블)에 `task.started` 기록. 리스트 뷰 토글 후 새로고침해도 유지.
- [ ] **Step 7: 커밋** — `feat(board): per-assistant kanban and list views with new task dialog`

**M3 DoD 체크:** 카드맵 필터 ✅ / 관리 CRUD+이미지 ✅ / 링크1 복사 ✅ / 칸반 dnd ✅ / 뷰 토글 지속 ✅

---

# M4 — 업무 상세

### Task 4.1: 시스템 프롬프트 빌더 (TDD)

**Files:**
- Modify: `src/llm/context.ts`
- Create: `src/llm/context.test.ts`

- [ ] **Step 1: 테스트**

```ts
import { describe, it, expect } from 'vitest'
import { buildSrSystemPrompt, buildTaskSystemPrompt, toChatMessages } from './context'
import type { Assistant, FileAsset, Package, ServiceRequest, Task } from '@/domain/types'

const assistant = { id: 'et-fds-assistant', name: 'FDS 작성 도우미', level1: 'ET 개발', level2: 'FDS 작성', summary: 'FDS를 만든다', systemPromptHint: '당신은 FDS 전문가다.' } as Assistant
const task = { code: 'WK-2026-0002', title: '이벤트 처리 FDS', summary: '요약', checklist: [{ id: 'c', label: '추적성', required: true, checked: false }] } as Task
const pkg = { title: 'URS 산출물', summary: 'URS-01~04 확정. URS-03 예외 흐름 주의.', fileIds: [] } as Package
const file = (name: string, text: string): FileAsset => ({ id: name, name, mime: 'text/markdown', size: text.length, blob: new Blob([text], { type: 'text/markdown' }), uploadedBy: 'u', uploadedAt: '', source: 'upload', tags: [], version: 1 })

describe('buildTaskSystemPrompt', () => {
  it('includes role hint, assistant, task, packages, srs, files', async () => {
    const sr = { code: 'SR-2026-0002', title: '알람 필터', body: '알람 목록에 필터가 필요' } as ServiceRequest
    const p = await buildTaskSystemPrompt({ assistant, task, receivedPackages: [{ pkg, fromAssistantName: 'URS 작성 도우미' }], linkedSrs: [sr], inputFiles: [file('URS.md', '# URS\nURS-01')], participants: [] })
    expect(p).toContain('역할 지침: 당신은 FDS 전문가다.')
    expect(p).toContain('## 어시스턴트: FDS 작성 도우미 (ET 개발 > FDS 작성)')
    expect(p).toContain('WK-2026-0002')
    expect(p).toContain('## 받은 패키지 (1)')
    expect(p).toContain('URS 산출물 ← URS 작성 도우미')
    expect(p).toContain('## 연결된 SR (1)')
    expect(p).toContain('SR-2026-0002')
    expect(p).toContain('### 파일: URS.md\n# URS\nURS-01')
    expect(p).not.toContain('## 참여자')
  })
  it('adds participants section when 2+', async () => {
    const p = await buildTaskSystemPrompt({ assistant, task, receivedPackages: [], linkedSrs: [], inputFiles: [], participants: [{ name: 'A', role: 'PL' }, { name: 'B', role: 'QA' }] })
    expect(p).toContain('## 참여자')
    expect(p).toContain('- A (PL)')
  })
})

describe('buildSrSystemPrompt', () => {
  it('describes intake goal and current draft', async () => {
    const sr = { code: '', title: '', body: '', status: 'draft' } as ServiceRequest
    const p = await buildSrSystemPrompt({ intake: { ...assistant, systemPromptHint: '접수 도우미' } as Assistant, sr, files: [] })
    expect(p).toContain('접수 도우미')
    expect(p).toContain('제목')
    expect(p).toContain('희망 기한')
  })
})

describe('toChatMessages', () => {
  it('prefixes names only for multi-participant threads', () => {
    const users = new Map([['u1', { name: 'A', role: '' }], ['u2', { name: 'B', role: '' }]])
    const msgs = [
      { id: '1', threadId: 't', role: 'user' as const, content: 'hi', authorId: 'u1', createdAt: '', attachmentIds: [], status: 'done' as const },
      { id: '2', threadId: 't', role: 'user' as const, content: 'yo', authorId: 'u2', createdAt: '', attachmentIds: [], status: 'done' as const },
    ]
    expect(toChatMessages('sys', msgs, users).map((m) => m.content)).toEqual(['sys', '[A] hi', '[B] yo'])
  })
})
```

- [ ] **Step 2: 실패 확인** → **Step 3: 구현**

```ts
export async function buildTaskSystemPrompt(input: TaskPromptInput): Promise<string> {
  const { assistant, task, receivedPackages, linkedSrs, inputFiles, participants = [] } = input
  const checklist = task.checklist.length ? task.checklist.map((c) => `- [${c.checked ? 'x' : ' '}] ${c.label}${c.required ? ' (필수)' : ''}`).join('\n') : '- (없음)'
  const parts: string[] = [
    assistant.systemPromptHint ? `역할 지침: ${assistant.systemPromptHint}` : '',
    `## 어시스턴트: ${assistant.name} (${assistant.level1} > ${assistant.level2})\n${assistant.summary}`,
    `## 업무: ${task.code} ${task.title}\n- 요약: ${task.summary || '(없음)'}\n- 체크리스트:\n${checklist}`,
  ]
  if (receivedPackages.length) {
    parts.push(`## 받은 패키지 (${receivedPackages.length})\n` + receivedPackages.map(({ pkg, fromAssistantName }) => `### ${pkg.title} ← ${fromAssistantName}\n${pkg.summary || '(메모 없음)'}`).join('\n\n'))
  }
  if (linkedSrs.length) {
    parts.push(`## 연결된 SR (${linkedSrs.length})\n` + linkedSrs.map((s) => `### ${s.code} ${s.title}\n${s.body.slice(0, MAX_SR_CHARS)}`).join('\n\n'))
  }
  if (participants.length >= 2) {
    parts.push(`## 참여자 (다중 참여 대화)\n${participants.map((p) => `- ${p.name}${p.role ? ` (${p.role})` : ''}`).join('\n')}\n사용자 메시지는 "[이름] 내용" 형식으로 발화자를 표시한다. 누가 무엇을 요청했는지 구분해서 답하고, 특정 참여자에게 확인이 필요하면 이름을 지목해서 질문한다.`)
  }
  if (inputFiles.length) parts.push(`## 입력 파일\n${(await renderFiles(inputFiles)).join('\n\n')}`)
  return parts.filter(Boolean).join('\n\n')
}

export async function buildSrSystemPrompt({ intake, sr, files }: SrPromptInput): Promise<string> {
  const parts = [
    intake.systemPromptHint ? `역할 지침: ${intake.systemPromptHint}` : '',
    `## 목표\n요청자의 이야기를 듣고 서비스 요청(SR)을 다음 항목으로 구조화한다: 제목, 배경, 원하는 결과, 희망 기한. 한 번에 하나씩만 확인 질문한다. 항목이 충분히 모이면 "상단의 '접수로 전환' 버튼을 눌러 접수하세요"라고 안내한다.`,
    sr.status !== 'draft' ? `## 현재 접수 내용 (${sr.code})\n제목: ${sr.title}\n${sr.body}` : '',
  ]
  if (files.length) parts.push(`## 첨부 파일\n${(await renderFiles(files)).join('\n\n')}`)
  return parts.filter(Boolean).join('\n\n')
}

const MAX_SR_CHARS = 4_000
async function renderFiles(files: FileAsset[]): Promise<string[]> {
  return Promise.all(files.map(async (f) => {
    if (isTextFile(f)) return `### 파일: ${f.name}\n${(await blobToText(f.blob)).slice(0, MAX_INLINE_CHARS)}`
    return `### 파일: ${f.name} (${f.mime}, ${f.size} bytes) — 본문은 인라인하지 않음`
  }))
}
```

- [ ] **Step 4: 통과 확인** → 커밋 `feat(llm): task and SR intake system prompts`

### Task 4.2: 업무 데이터 훅

**Files:**
- Modify: `src/features/task/useTaskData.ts` (전체 교체, `@ts-nocheck` 제거)

- [ ] **Step 1: 작성**

```ts
export interface TaskData {
  task: Task
  assistant: Assistant
  files: FileAsset[]
  notes: Note[]
  activity: ActivityLog[]
  receivedPackages: Array<{ pkg: Package; receipt: PackageReceipt; fromTask?: Task; fromAssistant?: Assistant }>
  publishedPackages: Package[]
  linkedSrs: ServiceRequest[]
  flow: TaskFlow
}

export function useTaskData(taskId: string | undefined): TaskData | null | undefined {
  return useLiveQuery(async () => {
    if (!taskId) return null
    const task = await db.tasks.get(taskId)
    if (!task) return null
    const assistant = await db.assistants.get(task.assistantId)
    if (!assistant) return null
    const [files, notes, activity, receipts, allPackages, allReceipts, allTasks, allAssistants, linkedSrs] = await Promise.all([
      filesForTask(task), db.notes.where('taskId').equals(taskId).sortBy('createdAt'), db.activity.where('taskId').equals(taskId).sortBy('at'),
      db.packageReceipts.where('taskId').equals(taskId).toArray(), db.packages.toArray(), db.packageReceipts.toArray(), db.tasks.toArray(), db.assistants.toArray(),
      db.serviceRequests.bulkGet(task.srIds),
    ])
    const pkgById = new Map(allPackages.map((p) => [p.id, p]))
    const taskById = new Map(allTasks.map((t) => [t.id, t]))
    const asstById = new Map(allAssistants.map((a) => [a.id, a]))
    const receivedPackages = receipts.flatMap((receipt) => {
      const pkg = pkgById.get(receipt.packageId)
      if (!pkg) return []
      const fromTask = taskById.get(pkg.fromTaskId)
      return [{ pkg, receipt, fromTask, fromAssistant: asstById.get(pkg.fromAssistantId) }]
    })
    return {
      task, assistant, files, notes: notes.reverse(), activity: activity.reverse(), receivedPackages,
      publishedPackages: allPackages.filter((p) => p.fromTaskId === taskId),
      linkedSrs: linkedSrs.filter((s): s is ServiceRequest => !!s),
      flow: taskFlow(taskId, allTasks, allPackages, allReceipts),
    }
  }, [taskId])
}
```

### Task 4.3: 채팅 이식

**Files:**
- Modify: `src/features/chat/useChat.ts`, `ChatView.tsx`, `ModelPicker.tsx`, `MessageBubble.tsx`, `SaveAsOutputDialog.tsx`, `Composer.tsx` (모두 `@ts-nocheck` 제거)

- [ ] **Step 1: useChat.ts** — 시그니처를 소유자 기반으로 바꾼다.

```ts
export type ChatScope =
  | { kind: 'task'; data: TaskData }
  | { kind: 'sr'; sr: ServiceRequest; intake: Assistant; files: FileAsset[] }

export function useChat(actor: Actor | undefined, scope: ChatScope): ChatState
```
내부: 스레드 쿼리는 `kind==='task' ? db.threads.where('taskId').equals(task.id) : db.threads.where('srId').equals(sr.id)`. activeThread는 task면 `task.activeThreadId`, sr이면 `sr.threadId`(SR은 스레드 1개 고정, `newThread`는 no-op). `send()`에서:
- task: `inputFiles = data.files.filter(f => task.inputFileIds.includes(f.id) || attachmentIds.includes(f.id))`, `systemPrompt = await buildTaskSystemPrompt({ assistant, task, receivedPackages: data.receivedPackages.map(r => ({ pkg: r.pkg, fromAssistantName: r.fromAssistant?.name ?? '?' })), linkedSrs: data.linkedSrs, inputFiles, participants })`, `modelId = resolveModel({ thread, task, assistant, settings: settings.llm }).modelId`, `meta = taskMeta(assistant, task, inputFiles, receivedPackages.map(r => r.pkg.title))`.
- sr: `systemPrompt = await buildSrSystemPrompt({ intake, sr, files })`, `modelId = resolveModel({ thread, assistant: intake, settings }).modelId`, `meta = { assistantId: intake.id, assistantLevel2: intake.level2, assistantName: intake.name, srIntake: true, inputFileNames: files.map(f=>f.name) }`.
스트리밍/flush/abort 로직은 그대로.

- [ ] **Step 2: ChatView.tsx** — props `{ scope: ChatScope; readOnly?: boolean; suggestions?: string[] }`. `SUGGESTIONS` 상수 제거; task면 `assistant.usageExample`의 `- "..."` 줄에서 추출(정규식 `/^- "(.+)"$/gm`), 없으면 기본 3개 `['이 업무 목표를 정리해줘', '입력 파일 기준으로 초안 작성해줘', '누락된 항목 확인 질문 만들어줘']`. 첨부 업로드는 `uploadFile(actor, scope.kind==='task' ? { taskId } : { srId }, f)`. "산출물로 저장"은 task scope에서만 노출. 스레드 탭/삭제는 task에서만.

- [ ] **Step 3: ModelPicker.tsx** — props `{ task?: Task; assistant: Assistant; thread?: Thread; disabled }`. scope 선택은 `thread | task`(SR이면 thread만). 해석 표시는 `resolveModel({ thread, task, assistant, settings })` + `MODEL_SOURCE_LABEL`. `setStepModel` 제거.

- [ ] **Step 4: SaveAsOutputDialog.tsx** — 기본 파일명 `${assistant.level2.replace(/\s+/g, '')}_${task.code}_v${n}.md` (n = 같은 접두사 산출물 수 + 1). 저장은 `saveAssistantOutput(actor, task.id, name, content)`.

- [ ] **Step 5: 빌드 확인 후 커밋** — `feat(chat): port chat to task/SR scopes with package and SR context`

### Task 4.4: 업무 패널 이식

**Files:**
- Modify: `src/features/task/{ChecklistPanel,NotesPanel,FilesPanel,FileList,FilePreviewDialog,InputFilePicker,ActivityPanel}.tsx` (`@ts-nocheck` 제거)

- [ ] **Step 1: ChecklistPanel** — props `{ task: Task; readOnly? }`; `toggleChecklist(actor, task.id, item.id)`, `addChecklistItem(task.id, label)`, `removeChecklistItem(task.id, id)`. `missingRequiredChecklist(task)` 수를 헤더에 경고 배지로.
- [ ] **Step 2: NotesPanel** — props `{ taskId, notes, files }`; `addNote(actor, taskId, content, attachmentIds)`. step 스코프 토글 제거.
- [ ] **Step 3: FilesPanel / FileList** — props `{ task, files }`. 필터: 전체 / 입력 / 산출물. 산출물 토글 → `setOutputTag(actor, task.id, file.id, v)`. 삭제 → `ConfirmDialog` → `deleteFile(id)`; `ok:false`면 reason 토스트. 업로드 → `uploadFile(actor, { taskId }, f)`. 출처 표시: `originTaskId !== task.id`면 "패키지로 받음" 뱃지.
- [ ] **Step 4: InputFilePicker** — props `{ task, receivedPackages, files }`; 후보 = `deriveInputCandidates(task, receivedPackages.map(r => r.pkg), files)`. 추천(패키지) 그룹 먼저, 그룹 헤더에 패키지 제목. 체크 변경 → `setInputFiles(actor, task.id, ids)`.
- [ ] **Step 5: ActivityPanel** — props `{ activity, users }`; `ACTIVITY_LABEL[type]` + payload 요약(`payload.label ?? payload.name ?? payload.code ?? payload.title ?? payload.preview`). step 필터 제거.
- [ ] **Step 6: 빌드 확인 후 커밋** — `feat(task): port checklist, notes, files, input picker, activity panels to task scope`

### Task 4.5: 완료 리포트 (TDD) + 완료 다이얼로그

**Files:**
- Create: `src/domain/taskReport.ts`, `src/domain/taskReport.test.ts`
- Modify: `src/features/task/TaskCompleteDialog.tsx`

- [ ] **Step 1: 테스트**

```ts
import { describe, it, expect } from 'vitest'
import { buildTaskReport } from './taskReport'

describe('buildTaskReport', () => {
  it('renders header, checklist, outputs, packages and feedback', () => {
    const md = buildTaskReport({
      task: { code: 'WK-2026-0001', title: 'T', summary: 'S', status: 'done', checklist: [{ id: 'c', label: 'A', required: true, checked: true }], outputFileIds: ['f1'], createdAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-05T00:00:00.000Z', feedback: { rating: 5, comment: 'good', by: 'u1', at: '' } } as never,
      assistant: { name: 'URS 작성 도우미', level1: 'ET 개발', level2: 'URS 작성' } as never,
      files: [{ id: 'f1', name: 'URS.md' } as never],
      receivedPackages: [{ code: 'PKG-2026-0001', title: 'P', fromAssistantName: 'X' }],
      publishedPackages: [{ code: 'PKG-2026-0002', title: 'Q' } as never],
      users: new Map([['u1', { name: '한지수' }]]),
      now: new Date('2026-09-05T00:00:00.000Z'),
    })
    expect(md).toContain('# 업무 완료 리포트 — WK-2026-0001 T')
    expect(md).toContain('URS 작성 도우미')
    expect(md).toContain('- [x] A (필수)')
    expect(md).toContain('URS.md')
    expect(md).toContain('PKG-2026-0001')
    expect(md).toContain('PKG-2026-0002')
    expect(md).toContain('★ 5')
    expect(md).toContain('리드타임: 4일')
  })
})
```

- [ ] **Step 2: 구현** — 섹션: 제목 / 어시스턴트 / 기간·리드타임(`durationDays`) / 요약 / 체크리스트 / 산출물 / 받은 패키지 / 발행한 패키지 / 피드백 / 생성 시각. `TaskReportInput` 타입 정의 포함.

- [ ] **Step 3: TaskCompleteDialog** — props `{ open, onOpenChange, data: TaskData }`. 3단계 한 화면: (1) 필수 체크 누락 경고(`missingRequiredChecklist`) — 차단 아님, (2) 산출물 일괄 태그(파일 체크 리스트, 기본 = 현재 outputFileIds), (3) 피드백 별점 1~5 + 코멘트. 완료 버튼: `setOutputTag` 변경분 반영 → `giveFeedback`(별점 있을 때) → 리포트 markdown 생성 → `saveAssistantOutput(actor, task.id, `완료리포트_${task.code}.md`, md)` → `setTaskStatus(actor, task.id, 'done', { missingRequired: missing.length })` → 토스트 + "다운로드" 버튼(`downloadBlob`). BoardKanban의 done 드롭도 이 다이얼로그를 연다(`onRequestComplete`).
- [ ] **Step 4: 테스트/빌드 확인 후 커밋** — `feat(task): completion report and dialog`

### Task 4.6: 업무 페이지 조립

**Files:**
- Create: `src/features/task/TaskFlowStrip.tsx`, `src/features/task/TaskBody.tsx`, `src/features/task/SrChips.tsx`(껍데기; M6에서 완성)
- Modify: `src/features/task/TaskPage.tsx`, `TaskHeader.tsx`

- [ ] **Step 1: TaskHeader** — `AssistantAvatar size="sm"` + 이름(링크 `/assistants/:id`) · 코드 · 제목(클릭 시 인라인 `Input`, blur/Enter → `updateTask`) · 상태 `Select`(done 선택 시 완료 다이얼로그) · `PriorityBadge`(클릭 → Select) · 기한 · `AvatarGroup` · `<SrChips task />` · 딥링크 복사(`navigator.clipboard.writeText(location.href)`) · "업무 완료" 버튼 · 더보기 `DropdownMenu`(보류/재개, 삭제→ConfirmDialog→`deleteTask`).
- [ ] **Step 2: TaskFlowStrip** — `flow.upstream`이 있으면 `[출처 업무 코드] → 📦 pkg.title →`, 현재 업무(강조), `flow.published`가 있으면 `→ 📦 ... → [수신 업무들]`. 각 항목 Link. 없으면 렌더 안 함.
- [ ] **Step 3: TaskBody** — 3컬럼(`lg:grid-cols-[280px_1fr_320px]`, 모바일은 `Tabs` 3개로 전환): 좌 = `ReceivedPackages`(M5, 지금은 자리만) + `InputFilePicker` + `ChecklistPanel`; 중 = `ChatView scope={{kind:'task', data}}` (status==='done'이면 readOnly); 우 = `Tabs` 파일/노트/히스토리. 하단 고정 바: "패키지 발행" · "패키지 받기"(M5에서 활성) · "OpenWebUI에서 열기".
- [ ] **Step 4: TaskPage** — `useTaskData(taskId)`; null이면 `Navigate to="/"`; undefined면 스켈레톤. `TopBar title={task.code}` + `TaskHeader` + `TaskFlowStrip` + `TaskBody` + `TaskCompleteDialog`.
- [ ] **Step 5: 수동 확인** — 두 탭(다른 사용자)에서 같은 업무 열기 → 한쪽 전송 중 다른 쪽 composer 잠금 + 타이핑 표시 → 산출물 저장 → 입력 파일 체크 → 다음 메시지의 mock 응답에 "입력 파일 n건" 문구 → 완료 다이얼로그 → 리포트 파일 생성.
- [ ] **Step 6: 커밋** — `feat(task): task detail page with chat, panels and flow strip`

**M4 DoD 체크:** 스트리밍/스레드/산출물 ✅ / 입력 파일 주입 ✅ / 4패널 ✅ / 완료 다이얼로그 ✅ / 2탭 잠금·타이핑 ✅

---

# M5 — 산출물 패키지

### Task 5.1: 발행 다이얼로그

**Files:**
- Create: `src/features/packages/PublishPackageDialog.tsx`

- [ ] **Step 1: 작성** — props `{ open, onOpenChange, data: TaskData }`. 폼 state 하나(`{ title, summary, fileIds: Set→배열, suggested: string[] }`), 기본값 `title = `${task.title} 산출물``, `fileIds = task.outputFileIds`. 섹션:
  1. 제목 `Input`
  2. 포함 파일: `data.files` 전체를 체크박스로, 산출물 태그된 파일은 "산출물" 뱃지, 기본 체크.
  3. 인수인계 메모 `Textarea` + "AI로 초안 작성" 버튼: 현재 활성 스레드의 `done` 메시지들을 `createProvider(settings.llm).stream({ model, messages: [{role:'system', content:'다음 대화를 인수인계 메모로 5줄 이내 요약. 결정사항/미결/주의점 순.'}, ...history], meta: { assistantId: assistant.id, assistantLevel2: assistant.level2, taskTitle: task.title, inputFileNames: [] } })`로 요약해 Textarea에 스트리밍. mock에서는 `mockScenarios`에 `HANDOFF_SUMMARY` 시나리오 추가: `meta.packageTitles === undefined && userText.startsWith('다음 대화를')` 대신 **`meta.handoffSummary: true`** 플래그를 `ChatMeta`에 추가하여 분기(고정 텍스트: "- 결정: ... \n- 미결: ... \n- 주의: ...").
  4. 추천 다음 어시스턴트: `useAssistants()` 중 `status !== 'retired'` && `id !== task.assistantId` 멀티 체크(아바타+이름+Lv2).
  5. 하단 버튼: "발행" → `publishPackage(actor, {...})` → toast(`PKG-… 발행됨`) → 닫기. "발행하고 바로 넘기기" → 어시스턴트 단일 선택 `Select`(추천 목록 우선 정렬) 활성화 → `publishAndForward(actor, input, toId)` → `navigate(`/tasks/${task.id}`)`.
  파일 0개면 두 버튼 disabled + 안내문.

### Task 5.2: 받기 다이얼로그 + 받은 패키지 섹션

**Files:**
- Create: `src/features/packages/ReceivePackageDialog.tsx`, `src/features/packages/ReceivedPackages.tsx`, `src/features/packages/PackageCard.tsx`

- [ ] **Step 1: PackageCard** — props `{ pkg, fromAssistant?, fromTask?, fileCount, receivedCount?, actions?: ReactNode, compact? }`. 코드(mono) · 제목 · `← fromAssistant.name` (아바타 sm) · 메모 2줄 · 파일 n · 상태 배지(archived면 회색) · `actions` 슬롯.
- [ ] **Step 2: ReceivePackageDialog** — props `{ open, onOpenChange, task, assistant, onReceived? }`. 데이터: `useLiveQuery`로 `packages.where('status').equals('open')` + receipts + assistants + tasks. 필터: 검색(제목/코드/메모), 출처 어시스턴트 `Select`, "이 어시스턴트를 추천한 패키지만" `Switch`(기본 ON; 추천 패키지가 0건이면 자동 OFF + 안내). 이미 받은 패키지는 "받음" 뱃지 + disabled, 자기 업무가 발행한 것은 제외. 카드 클릭 → `receivePackage(actor, pkg.id, task.id)` → toast → `onReceived?.()`.
- [ ] **Step 3: ReceivedPackages** — props `{ data: TaskData }`. 헤더 "받은 패키지 (n)" + "받기" 버튼(다이얼로그). 각 `PackageCard compact` + actions: "출처 업무" Link, "떼기"(ConfirmDialog: "패키지 파일이 입력에서 제거됩니다(산출물로 태그된 파일은 유지).") → `detachPackage`. 0건이면 작은 EmptyState("다른 어시스턴트의 산출물을 받아 시작할 수 있어요").
- [ ] **Step 4: TaskBody 좌측에 `ReceivedPackages`, 하단 바 "패키지 발행"/"패키지 받기" 활성, `NewTaskDialog`에 "패키지 받기" 옵션 활성(생성 후 `receivePackage` 호출).**

### Task 5.3: 보관함 페이지

**Files:**
- Create: `src/features/packages/PackagesPage.tsx`, `src/features/packages/PackageDetailSheet.tsx`
- Modify: `src/app/router.tsx`

- [ ] **Step 1: PackagesPage** — `TopBar title="패키지 보관함"`. 툴바: 검색 · 출처 어시스턴트 Select · 상태(`open/archived/all`, 기본 open). `Table`: 코드 · 제목 · 출처(어시스턴트 아바타+이름 / 업무 코드 링크) · 파일 수 · 수신 업무 수 · 추천 어시스턴트(아바타 나열) · 발행일 · 상태. 행 클릭 → `PackageDetailSheet`.
- [ ] **Step 2: PackageDetailSheet** — 제목/메모(Markdown)/파일 목록(미리보기 `FilePreviewDialog` 재사용, 다운로드)/수신 이력(업무 코드·수신자·일시, `package.detached` 활동도 "분리됨"으로 표시)/"보관 처리"·"보관 해제" 버튼(`archivePackage`)/"이 패키지로 새 업무 만들기"(어시스턴트 선택 → `createTask` + `receivePackage` → 이동).
- [ ] **Step 3: router `/packages` 연결. 수동 확인: 시드의 PKG-0003(미수신)을 새 업무로 받기 → 업무 상세 입력 파일에 자동 체크 → 채팅 프롬프트에 "## 받은 패키지" 포함(mock 응답의 입력 파일 문구로 간접 확인, 또는 DevTools에서 `buildTaskSystemPrompt` 결과 console.debug 임시 확인 후 제거).**
- [ ] **Step 4: 커밋** — `feat(packages): publish/forward, receive/detach, archive page and flow strip`

**M5 DoD 체크:** 발행 ✅ / 바로 넘기기 ✅ / 받기·떼기 ✅ / 보관함 ✅ / 빵부스러기 ✅ / 프롬프트 포함 ✅ / packages.test ✅

---

# M6 — SR 접수

### Task 6.1: SR mock 시나리오

**Files:**
- Modify: `src/llm/mockScenarios.ts`, `src/llm/mockProvider.ts`

- [ ] **Step 1: 시나리오 추가**

```ts
export const SR_INTAKE: ScenarioFn[] = [
  (ctx) => `안녕하세요, SR 접수 도우미입니다. "${ctx.userText.slice(0, 60)}" 요청 잘 들었습니다.\n\n먼저 **배경**을 알려주세요. 현재 어떤 화면/절차에서 불편하거나 문제가 생기나요?`,
  () => `감사합니다. 다음으로 **원하는 결과**를 한 문장으로 말씀해 주세요. (예: "알람 목록에서 장비별로 필터링할 수 있으면 좋겠다")`,
  () => `좋습니다. 마지막으로 **희망 기한**이 있나요? 없으면 "없음"이라고 답해 주세요.`,
  (ctx) => `정리했습니다.\n\n- **제목**: ${ctx.taskTitle}\n- **배경**: (대화 내용 참고)\n- **원하는 결과**: ${ctx.userText.slice(0, 80)}\n- **희망 기한**: 확인됨\n\n상단의 **접수로 전환** 버튼을 누르면 위 내용으로 초안이 채워집니다. 수정 후 제출해 주세요.`,
]
export const HANDOFF_SUMMARY = `- 결정사항: 요구사항 범위 확정, 예외 흐름은 수동 처리 경로로 정의\n- 미결: 인터페이스 변경은 별도 CR\n- 주의: 감사추적 로깅(actor=SYSTEM) 필수\n- 다음 작업자에게: 산출물 파일을 입력으로 선택한 뒤 "기능 목록 뽑아줘"로 시작하세요`
```
`mockProvider.stream()` 분기: `meta.srIntake` → `SR_INTAKE[min(turn, 3)](ctx)`; `meta.handoffSummary` → `HANDOFF_SUMMARY`.

### Task 6.2: SR 초안 생성 함수 (TDD)

**Files:**
- Create: `src/domain/srDraft.ts`, `src/domain/srDraft.test.ts`

- [ ] **Step 1: 테스트**

```ts
import { describe, it, expect } from 'vitest'
import { draftFromConversation } from './srDraft'
const m = (role: 'user' | 'assistant', content: string) => ({ role, content })
describe('draftFromConversation', () => {
  it('uses first user line as title and joins user turns as body', () => {
    const d = draftFromConversation([m('user', '알람 화면에 장비별 필터가 필요해요'), m('assistant', '배경?'), m('user', '알람이 너무 많아 찾기 어려움'), m('assistant', '기한?'), m('user', '10월 초')])
    expect(d.title).toBe('알람 화면에 장비별 필터가 필요해요')
    expect(d.body).toContain('## 요청 내용')
    expect(d.body).toContain('- 알람이 너무 많아 찾기 어려움')
    expect(d.body).toContain('- 10월 초')
  })
  it('truncates long titles to 60 chars', () => {
    const d = draftFromConversation([m('user', 'x'.repeat(100))])
    expect(d.title.length).toBe(60)
  })
  it('empty conversation gives empty draft', () => {
    expect(draftFromConversation([])).toEqual({ title: '', body: '' })
  })
})
```

- [ ] **Step 2: 구현**

```ts
export interface SrDraft { title: string; body: string }
const TITLE_MAX = 60
/** 대화에서 접수 초안을 규칙 기반으로 만든다 (mock/오프라인용). live 모드에서는 AI 요약으로 덮어쓸 수 있다. */
export function draftFromConversation(messages: Array<{ role: 'user' | 'assistant'; content: string }>): SrDraft {
  const userTurns = messages.filter((m) => m.role === 'user').map((m) => m.content.trim()).filter(Boolean)
  if (userTurns.length === 0) return { title: '', body: '' }
  const [first, ...rest] = userTurns
  const title = first.split('\n')[0].slice(0, TITLE_MAX)
  const body = ['## 요청 내용', `- ${first}`, ...rest.map((t) => `- ${t}`), '', '## 배경 / 원하는 결과 / 희망 기한', '(위 내용을 참고해 정리해 주세요)'].join('\n')
  return { title, body }
}
```

- [ ] **Step 3: 통과 확인 → 커밋** `feat(sr): rule-based SR draft from conversation`

### Task 6.3: SR 접수 페이지

**Files:**
- Create: `src/features/sr/SrIntakePage.tsx`, `src/features/sr/SrList.tsx`, `src/features/sr/SrConvertDialog.tsx`
- Modify: `src/app/router.tsx`

- [ ] **Step 1: 데이터 훅(페이지 내부)** — `useLiveQuery`: `serviceRequests.where('requesterId').equals(userId)` 정렬 updatedAt desc; 선택 SR의 스레드/첨부(`files.where('originSrId')`); `settings.srIntakeAssistantId` → `assistants.get`. 접수 도우미 미설정이면 화면 상단 `Alert`("설정에서 SR 접수 도우미를 지정하세요") + 채팅 비활성.
- [ ] **Step 2: SrList** — 좌측 패널(`w-72`): "새 대화" 버튼 → `startSrConversation(actor)` → 선택. 항목: `SrStatusBadge` · 제목(draft면 첫 user 메시지 40자 또는 "새 대화") · `formatRelative(updatedAt)`. draft 항목 hover에 삭제(ConfirmDialog → `deleteDraftSr`).
- [ ] **Step 3: 우측** — 상단 바: SR 코드/제목(submitted 이후) 또는 "접수 전 대화", `SrStatusBadge`, **"접수로 전환"** 버튼(draft일 때) / "접수 내용 보기·수정"(submitted일 때; reviewing 이후는 읽기 전용) · 연결된 업무 코드 배지(`tasks.where('srIds').equals(sr.id)` — 읽기 전용). 본문: `ChatView scope={{ kind:'sr', sr, intake, files }}`. 아래 `Collapsible` "상태 이력"(activity where srId).
- [ ] **Step 4: SrConvertDialog** — 열릴 때 `draftFromConversation(messages)`로 제목/본문 채움; live 모드면 "AI로 다듬기" 버튼(provider stream, system: "다음 대화를 SR 제목 1줄과 본문(배경/원하는 결과/희망 기한)으로 정리"; mock에서는 `meta.srIntake`+`turn=3` 텍스트 사용). 첨부: 대화 중 업로드된 SR 파일 목록 체크(기본 전체). 제출 → `submitSr(actor, sr.id, title, body, attachmentIds)` → toast("SR-… 접수됨"). submitted 상태에서 열면 `updateSrContent`.
- [ ] **Step 5: router `/sr` 연결. 수동 확인** — 사용자 "박하은"으로 전환 → 새 대화 → 3턴 → 새로고침 → 목록에서 draft 재개(메시지 유지) → 접수로 전환 → 코드 부여·배지 변경 → 대화 계속 가능.
- [ ] **Step 6: 커밋** — `feat(sr): intake page with persistent conversations and convert-to-SR`

### Task 6.4: SR 관리 + 업무 chip

**Files:**
- Create: `src/features/sr/SrManagePage.tsx`, `src/features/sr/SrDetailSheet.tsx`, `src/features/sr/SrPickerDialog.tsx`
- Modify: `src/features/task/SrChips.tsx`, `src/features/assistants/NewTaskDialog.tsx`, `src/app/router.tsx`, `src/app/AppShell.tsx`(SR 접수 nav 옆 "관리" 서브링크 또는 `/sr` 페이지 상단 탭 "접수 | 관리")

- [ ] **Step 1: SrManagePage** — `Table`: 코드 · 제목 · 접수자(UserAvatar) · 상태 `Select`(`setSrStatus`; draft는 목록에서 제외) · 접수일 · 연결 업무 수. 필터: 상태, 검색. 행 클릭 → `SrDetailSheet`.
- [ ] **Step 2: SrDetailSheet** — 본문 Markdown · 첨부(다운로드) · 대화 읽기(메시지 목록, 읽기 전용 `MessageBubble`) · 연결 업무 목록(각 코드 링크 + 해제 버튼 → `unlinkSr`) · "업무에 연결"(업무 피커: 검색 가능한 `Command` 목록, 선택 → `linkSr`) · "이 SR로 새 업무 만들기"(어시스턴트 `Select` → `createTask({ srIds:[sr.id], inputFileIds: sr.attachmentIds, title: sr.title, summary: sr.body.slice(0,200) })` → `setSrStatus(in_progress)` 제안 토스트 → 이동).
- [ ] **Step 3: SrPickerDialog** — 업무 화면에서 SR 붙일 때: `serviceRequests.where('status').anyOf(['submitted','reviewing','in_progress'])` 목록, 검색, 이미 연결된 건 disabled. 선택 → `linkSr`.
- [ ] **Step 4: SrChips** — props `{ task: Task; srs: ServiceRequest[] }`. 각 chip: `SR-… ` + `Popover`(제목/상태/본문 앞 200자/접수자 + "SR 관리에서 열기" 링크) + `x`(→ `unlinkSr`). 끝에 `+ SR` 버튼 → `SrPickerDialog`. `NewTaskDialog`에도 "SR 연결" 멀티 선택 활성.
- [ ] **Step 5: `/sr` 상단에 `Tabs` "접수 | 관리"(관리 = `/sr/manage`) 추가. 수동 확인** — 관리에서 SR-0001을 WK-0005에 연결 → 업무 헤더 chip 표시 → chip x로 해제 → 접수자 화면의 "연결된 업무" 배지도 사라짐(다른 탭).
- [ ] **Step 6: 커밋** — `feat(sr): management page, task chips and SR-to-task creation`

**M6 DoD 체크:** 대화→접수 ✅ / draft 재개 ✅ / 관리 상태 변경 ✅ / chip 연결·해제 ✅

---

# M7 — 리포트 · 설정 · 시스템 어시스턴트 · Export

### Task 7.1: 리포팅 도메인 (TDD)

**Files:**
- Create: `src/domain/reporting.ts`, `src/domain/reporting.test.ts`

- [ ] **Step 1: 테스트** — 함수별 최소 1케이스:

```ts
describe('completionBuckets', () => { it('counts done tasks per day within window', ...) })   // 기존 테스트 이식(steps 제거)
describe('assistantStats', () => {
  it('computes per-assistant counts, avg lead days, avg rating', () => {
    const rows = assistantStats(tasks, assistants, now)
    expect(rows.find((r) => r.assistant.id === 'a1')).toMatchObject({ total: 2, done: 1, avgLeadDays: 4, avgRating: 5 })
  })
})
describe('packageFlow', () => {
  it('aggregates from→to assistant pairs from receipts', () => {
    expect(packageFlow(packages, receipts, tasks)).toEqual([{ fromAssistantId: 'a1', toAssistantId: 'a2', count: 2 }])
  })
})
describe('srStatusDistribution', () => { it('counts by status excluding draft', ...) })
describe('inefficiencySignals', () => {
  it('flags reopen, missing_required, long_task>=10d, stale>=5d, unused_package', ...)
})
describe('feedbackDigest', () => { it('groups feedback by assistant with avg and comments', ...) })
```

- [ ] **Step 2: 구현** — 시그니처:

```ts
export function completionBuckets(tasks: Task[], days: number, granularity: 'day' | 'week', now?: Date): TimeBucket[]
export function assistantStats(tasks: Task[], assistants: Assistant[], now?: Date): AssistantStat[]   // { assistant, total, active, done, avgLeadDays?, avgRating? }
export function userActivityStats(activity: ActivityLog[], users: User[], days: number, now?: Date): UserActivityStat[]  // 기존 이식
export function packageFlow(packages: Package[], receipts: PackageReceipt[], tasks: Task[]): FlowEdge[]   // { fromAssistantId, toAssistantId, count } desc
export function srStatusDistribution(srs: ServiceRequest[]): Array<{ status: SrStatus; count: number }>
export function srLeadDays(srs: ServiceRequest[], activity: ActivityLog[]): number | undefined   // submitted→done 평균
export function inefficiencySignals(tasks: Task[], activity: ActivityLog[], packages: Package[], receipts: PackageReceipt[], now?: Date): InefficiencySignal[]
//   kinds: 'reopen' | 'missing_required' | 'long_task'(≥10d 진행) | 'stale'(≥5d 활동 없음, 미완료) | 'unused_package'(수신했으나 파일이 inputFileIds에 없음)
export function feedbackDigest(tasks: Task[], assistants: Assistant[], users: User[]): FeedbackDigestRow[]
export function feedbackDigestMarkdown(rows: FeedbackDigestRow[]): string
```
`missing_required`는 `activity.type==='task.completed' && payload.missingRequired > 0`.

- [ ] **Step 3: 통과 → 커밋** `feat(reporting): assistant, package flow, SR and inefficiency metrics`

### Task 7.2: 리포트 페이지

**Files:**
- Modify: `src/features/reports/ReportsPage.tsx` (`@ts-nocheck` 제거, 재작성), `charts.tsx` 유지

- [ ] **Step 1: 재작성** — 기간(7/30/90) · 단위(일/주) · 담당자 필터. KPI 5타일(완료, 평균 리드타임, 재오픈, 체크리스트 이행률, SR 평균 접수→완료). 차트: 완료 추이(`BarsChart`), 어시스턴트별 평균 리드타임(가로, 최대값 강조), 사용자별 활동(stacked). 표: 패키지 흐름 상위 10(from → to, 건수), SR 상태 분포(작은 막대). 비효율 신호 목록(종류 배지 + 업무 링크). 피드백 다이제스트(어시스턴트별 평균 ★ + 코멘트) + markdown 다운로드.
- [ ] **Step 2: router lazy 연결, 시드로 각 섹션에 값이 나오는지 확인(빈 섹션 없음). 커밋** `feat(reports): rebuild reports around assistants, packages and SRs`

### Task 7.3: 시스템 어시스턴트 도구 교체

**Files:**
- Modify: `src/llm/tools.ts`, `src/llm/mockSystemAssistant.ts`, `src/features/system-assistant/actions.ts`, `SystemAssistantDrawer.tsx` (`@ts-nocheck` 제거)

- [ ] **Step 1: tools.ts** — 4개 도구:

```ts
create_task { assistantName: string, title: string, summary?: string, priority?: enum }           required: assistantName, title
create_assistant { id: string, name: string, level1: string, level2: string, summary?: string, ownerName?: string }   required: id, name, level1, level2
publish_package { taskCode: string, title?: string, summary?: string }   // 파일 = 업무 outputFileIds 전체
link_sr { taskCode: string, srCode: string }
```
프롬프트: "당신은 MES Assistant Hub의 시스템 assistant입니다. 업무 생성/어시스턴트 등록/패키지 발행/SR 연결 요청에는 반드시 도구를 호출하세요. 어시스턴트는 이름으로 지정하며 카탈로그에서 가장 비슷한 이름을 고릅니다…"

- [ ] **Step 2: mockSystemAssistant.ts** — 정규식 규칙: `/(.+?)\s*(어시스턴트|도우미)?(로|에)\s*(.+?)\s*업무\s*(만들|생성)/` → create_task; `/어시스턴트\s*(등록|추가)/` → create_assistant(id는 이름을 kebab-case로); `/(WK-\d{4}-\d{4}).*(패키지|발행)/` → publish_package; `/(WK-\d{4}-\d{4}).*(SR-\d{4}-\d{4})/` → link_sr.
- [ ] **Step 3: actions.ts** — `toProposal` 요약 문구 4종, `applyProposal`: create_task(어시스턴트 이름 부분일치 → `createTask` → link `/tasks/:id`), create_assistant(`createAssistant`, owner 이름 매칭 실패 시 actor), publish_package(업무 코드 조회 → outputFileIds 비면 실패 메시지 → `publishPackage` → link `/packages`), link_sr(`linkSr`).
- [ ] **Step 4: Drawer 문구/제안 카드 확인, mock으로 4종 적용 테스트. 커밋** `feat(system-assistant): task/assistant/package/SR tools`

### Task 7.4: 설정 페이지

**Files:**
- Modify: `src/features/settings/SettingsPage.tsx` (`@ts-nocheck` 제거)

- [ ] **Step 1** — 기존 유지(모드/프리셋/baseUrl/apiKey/모델/ping/export/import/reset). 추가: "SR 접수 도우미" `Select`(어시스턴트 목록, `setSrIntakeAssistant`), "링크1 미리보기" 텍스트(`assistantExternalUrl(baseUrl, '<assistant-id>')`). `resetToSeed` 후 `location.reload()` 유지.
- [ ] **Step 2: export → import 왕복을 UI에서 수행해 카드맵/보관함/SR 동일 확인. 커밋** `feat(settings): SR intake assistant and link preview`

**M7 DoD 체크:** 리포트 전 섹션 값 ✅ / 접수 도우미 설정 ✅ / 시스템 도구 4종 ✅ / export/import 왕복 ✅

---

# M8 — 마무리

### Task 8.1: 품질 점검

- [ ] `npm run lint` 경고 0 (미사용 import 제거, `@ts-nocheck` 잔존 0: `grep -r "ts-nocheck" src` 결과 없음)
- [ ] `npx vitest run` 전부 PASS, `npm run build` 성공
- [ ] 375px 너비(DevTools 모바일)에서 카드맵/보드/업무/SR 페이지 가로 스크롤 없음; 업무 상세 3컬럼은 Tabs로 전환됨
- [ ] 모든 목록 빈 상태: 새 DB(시드 리셋 후 어시스턴트 전부 삭제)에서 카드맵/보드/보관함/SR 목록에 EmptyState 표시
- [ ] `window.confirm` 사용 없음: `grep -r "window.confirm\|confirm(" src` 결과 없음

### Task 8.2: 문서

**Files:**
- Modify: `README.md`, `docs/design.md`
- Delete: `docs/superpowers/plans/…`는 유지(이력)

- [ ] **Step 1: docs/design.md** — 스펙 §1~§7, §10을 정리해 교체(구현 결과 기준으로 파일 경로 갱신).
- [ ] **Step 2: README.md** — 화면 표(카드맵/관리/보드/업무/보관함/SR 접수/SR 관리/리포트/설정), 데모 스토리(스펙 §9), LLM 연결 가이드(OpenWebUI 프리셋, 링크1 규칙), 한계(브라우저 저장, CORS, 키 보관).
- [ ] **Step 3: 커밋** `docs: design and README for assistant hub`

### Task 8.3: 데모 스토리 수동 통과 (최종 DoD)

두 탭(한지수 / 박하은)으로:
1. `/` 카드맵 → URS 도우미 클릭 → 보드 → WK-0005 열기
2. 채팅 2턴 → "산출물로 저장" → 입력 파일에 체크 → 3턴째 응답에 입력 파일 문구
3. 하단 "패키지 발행" → 메모 AI 초안 → 추천 FDS → "발행하고 바로 넘기기" → FDS 업무 생성·이동, 좌측 "받은 패키지 1", 입력 파일 체크됨
4. 떼기 → 입력 파일 사라짐 → "패키지 받기"에서 다시 받기
5. 박하은 탭 `/sr` → 새 대화 3턴 → 새로고침 → 재개 → 접수로 전환 → SR 코드
6. 한지수 탭 `/sr/manage` → 방금 SR을 FDS 업무에 연결 → 업무 헤더 chip → 박하은 탭에 "연결된 업무" 배지
7. FDS 업무 완료 다이얼로그 → 리포트 파일 생성 → 보드 done 컬럼
8. `/reports`에서 완료 추이/패키지 흐름(URS→FDS)/SR 분포에 반영
9. `/settings` export → reset → import → 1~8 데이터 복원

- [ ] 위 9단계 통과 시 M8 완료. 브랜치 정리는 `superpowers:finishing-a-development-branch`로.

---

## 자체 점검 결과

- **스펙 커버리지:** §3 모델(1.1~1.13), §4 패키지(1.6/1.11/5.x), §5.1(3.2) §5.2(3.3) §5.3(3.4~3.6) §5.4(4.x) §5.5(5.3) §5.6(6.3) §5.7(6.4) §5.8(7.1~7.2) §5.9(7.4) §5.10(7.3), §6 AI(1.14/4.1/6.1), §7 실시간(기존 유지, 4.6 확인), §9 시드(2.1~2.2), §12 검증(각 M DoD + 8.3).
- **의도적 축소:** 스펙 §5.4 "제목 인라인 편집"은 4.6에 포함; "체인 레시피 저장"은 §10대로 범위 밖.
- **타입 일관성:** `logActivity(actor, target, type, payload)` 시그니처를 1.8에서 정의하고 이후 모든 리포지토리가 동일 형태 사용. `ChatScope`/`TaskData`는 4.2~4.3에서 정의하고 5.x/6.x가 그대로 참조. `ChatMeta.handoffSummary`는 5.1에서 추가하도록 명시.
