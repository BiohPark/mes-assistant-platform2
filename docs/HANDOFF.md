# HANDOFF — MES Agent Hub

다른 세션(사람 또는 AI)이 이어서 작업할 수 있도록 컨셉·현재 상태·결정 사항·남은 일·주의점을 한곳에 정리한다.
기준 시점: 2026-09-23, `master` = `feat/platform-scope` 머지 직후.
추가(2026-09-26): 형제 저장소(Codex)와의 비교·융합 설계와 진행 방식 판단은 [fusion-design.md](fusion-design.md)에 있다(설계 문서, 구현 아님). 이 저장소는 **데모로 마무리**하고 실제 구현은 별도 저장소에서 한다(D16).

---

## 1. 한 줄 요약

사내 AI 에이전트(OpenWebUI assistant)를 **카드로 골라 대화**하고, 대화끼리 **태그로 느슨하게 연결**해 **파일을 주고받는 플랫폼**의 프론트 전용 데모.
각 에이전트의 워크플로우는 assistant 안에 있고, 이 플랫폼은 **대화창 + 파일 주고받기 + 진행 기록**만 깔아 준다.

## 2. 컨셉 (반드시 지킬 원칙)

| 원칙 | 의미 | 코드 위치 |
|---|---|---|
| **플랫폼 ≠ 워크플로우** | 질문 흐름·작성 절차·역할 프롬프트는 각 assistant(OpenWebUI) 안에서 구현된다. 플랫폼은 흐름을 지시하지 않는다. system 메시지는 "플랫폼 컨텍스트"(대화·태그·연결 SR·고른 입력)만 | `src/llm/context.ts` (`PLATFORM_CONTEXT_NOTE`) |
| **대화 1개 = 업무 1개** | `Task` 엔티티가 곧 대화. 스레드 1개 고정 | `src/domain/types.ts` `Task.threadId` |
| **지연 생성** | 카드 클릭은 초안(`/new/:id`)만 연다. 첫 전송/첨부 때 대화 생성 → 빈 업무 없음 | `features/conversation/DraftConversationPage.tsx` |
| **태그로 느슨한 결합** | SR 코드(`SR-YYYY-NNNN`) + 자유 키워드. 붙였다 떼도 됨 | `src/domain/tags.ts` |
| **발견과 사용의 분리** | 같은 태그를 **직접** 공유하는 대화의 파일이 자료함에 "보임"(간접 확산 없음). **사람이 ☑참고/★주 입력으로 고른 버전만** AI로 감. 새 버전 자동 교체 없음, 태그 해제해도 선택 유지 | `sharedPool()`, `Task.inputs` |
| **OpenWebUI는 API + 링크만** | 채팅·모델 목록·파일 업로드는 API 호출. 화면 연동은 "OpenWebUI에서 열기" 링크(해당 assistant 대화창)뿐. 플랫폼 대화 기록은 OpenWebUI 채팅 목록에 남지 않는다 | `src/llm/openaiProvider.ts`, `openwebuiFiles.ts`, `lib/links.ts` |
| **체크리스트는 강제 아님** | 에이전트별 기본값 → 새 대화에 복사. "AI 달성도 점검"으로 m/n 참고 점수, 원하면 "판단대로 체크" | `domain/checklistReview.ts`, `features/task/ChecklistReviewCard.tsx` |
| **공개 저장소** | GitHub 저장소가 PUBLIC. 참고 이미지·사내 주소·이미지에서 옮긴 문구는 절대 커밋 금지 | 7장 참고 |

## 3. 기술 스택 · 실행

- Vite 8 · React 19 · TypeScript 6 · Tailwind v4 · shadcn/ui · react-router 8 · Dexie 4(IndexedDB, `useLiveQuery`) · zustand · dnd-kit · recharts
- 테스트: vitest + fake-indexeddb (`npx vitest run`, 21개 파일 · 110개), 린트: `npx oxlint` (shadcn 기본 경고 6건은 기존 상태)
- 실행: `npm install` → `npm run dev` (http://localhost:5174) · 빌드 `npm run build`
- 백엔드 없음. 데이터는 브라우저 IndexedDB(`mes-assistant-hub`), 첫 실행 시 시드 자동 주입. 설정에서 JSON 내보내기/가져오기, 시드로 초기화
- LLM: 설정에서 Mock(대역 응답) / Live(OpenAI 호환 `{baseUrl}/chat/completions` SSE)

## 4. 구조 (시스템 분석)

```
src/
  domain/        순수 로직 (테스트 대상): types, tags(sharedPool·정규화), kanban(필터·URL), checklistReview,
                 titles(제목 규칙), modelResolution, reporting, taskReport, transitions, srDraft
  db/            schema.ts(Dexie v1→v3), migrations/v3.ts(구 패키지 모델 변환), exportImport.ts(백업 v2, v1 가져오기 변환)
    repositories/  tasks(대화·태그·입력·체크·달성도) · sr · files(버전 체인) · assistants(순서) · chat · activity · notifications · settings
    seed/        users · assistants(12개 카탈로그, 기본 체크리스트) · data(대화 11 · SR 6) · builder
  llm/           provider 인터페이스, openaiProvider(SSE, files 파라미터), mockProvider/mockScenarios(대역),
                 context(플랫폼 컨텍스트 프롬프트), openwebuiFiles(Files API 업로드·캐시), title(AI 제목), checklistReview(달성도)
  features/
    home/        HomePage(카드|칸반 토글), AssistantCard, SortableAssistantGrid(SO 편집 모드), ConversationKanban, ConversationCard
    conversation/ DraftConversationPage (/new/:assistantId)
    task/        TaskPage(/c/:taskId), TaskHeader(태그·연결된 대화), TaskBody, MaterialsPanel(자료함·입력 선택), ChecklistPanel(+ReviewCard), Notes, Activity, CompleteDialog
    chat/        useChat(전송·스트리밍·파일 전달·AI 제목), ChatView, Composer, ModelPicker, SaveAsOutputDialog
    sr/          SrIntakePage(/sr), SrManagePage(/sr/manage), SrDetailSheet(진행 현황·연결 업무 시작), SrConvertDialog(AI 제목), SrTitleEditor
    assistants/  ManagePage(/assistants/manage), AssistantTable(모델 ID 인라인), AssistantEditorSheet(전 항목·체크리스트)
    reports/ settings/ system-assistant/
  components/    TagChip, TagInput(자동완성), StatusBadges, AssistantAvatar …
```

### 데이터 흐름 (대화 전송)
1. `ChatView` → `useChat.send` → 사용자 메시지 저장
2. `buildPrompt`: 최신 `task` 재조회 → `task.inputs` 파일 로드(+이번 첨부) → 태그의 SR 조회
3. 설정이 Live + "OpenWebUI 파일 첨부"면 `deliverFiles`로 `/api/v1/files/` 업로드(버전별 1회, `FileAsset.remoteIds` 캐시) → 요청 `files`로 첨부, 실패분만 텍스트 인라인
4. `buildTaskSystemPrompt`(플랫폼 컨텍스트) + 대화 이력 → provider.stream → 250ms마다 DB 반영
5. 요청 스냅샷은 메시지의 "전송 기록"에 저장. 첫 답변 뒤 기본 제목이면 별도 요청으로 AI 제목(수동 제목 보호)

### 모델 결정
이 대화 지정 › 에이전트 매핑(`Assistant.modelId`) › 설정의 공통 기본 모델. 링크에서 모델을 추정하지 않음. 링크1은 저장값 우선, 없으면 `{OpenWebUI}/?model={모델 ID}`

### 라우트
`/`(카드|`?view=kanban`) · `/new/:assistantId` · `/c/:taskId`(`/tasks/:id` 리다이렉트) · `/assistants/manage` · `/sr` · `/sr/manage` · `/reports` · `/settings`

## 5. 결정 사항 로그

| # | 결정 | 근거/출처 |
|---|---|---|
| D1 | 패키지(발행/받기/발췌) 제거 → 태그로 일원화 | 사용자 선택 |
| D2 | 대화 1개 = 스레드 1개 | 사용자 선택 |
| D3 | 칸반 열 = 에이전트(카드와 같은 공통 순서), 단계는 Lv1/Lv2 다중 필터 | 사용자 피드백 + Codex 안 일반화 |
| D4 | 순서는 공통 설정, System Owner가 편집 모드에서 변경(저장/취소, 필터 중 차단) | 사용자·Codex |
| D5 | SR 태그만 저채도 결정색, 일반 태그는 중립색. SR 태그 개수 제한 없음 | 사용자 |
| D6 | 공유 자료함은 직접 태그 공유만, 사람이 고른 입력만 AI 전달, 새 버전 자동 교체 없음 | Codex 안 채택 |
| D7 | 접수 에이전트 = URS 분석 도우미(가상 카탈로그 기준), 명시적 "접수로 전환", AI 제목 별도 요청, 수동 제목 보호 | Codex 안 채택 |
| D8 | 모델 ID는 기본 비움(공통 기본 모델), 관리 페이지에서 매핑 | 사용자 |
| D9 | 워크플로우는 assistant 쪽 — 역할 지침 주입 제거, Mock 흐름은 대역으로 명시 | 사용자 (2026-09-23) |
| D10 | 입력 파일은 OpenWebUI Files API로 첨부(프리셋 기본), 실패분만 인라인 | 사용자 승인 |
| D11 | 체크리스트: 기본값 + 관리 페이지에서 수정, 강제 없음, AI 달성도 m/n 버튼 | 사용자 |
| D12 | OpenWebUI와 UI 연동 없음, API 호출 + 대화창 링크만 | 사용자 |
| D13 | 시드는 가상 카탈로그. 사내 주소·이미지 문구 제거, 공개 저장소 이력은 커밋 1개로 초기화 | 사용자 (노출 금지) |
| D14 | System Owner는 여러 명: 박비오·김해윤·김남우·이희준·노기현 (실명 사용은 사용자가 공개 노출을 인지하고 요청) | 사용자 |
| D15 | 대화 간 컨텍스트: **같은 태그를 직접 공유하는 대화를 파일처럼 통째로 선택**하고 필요하면 메시지 선택·요약으로 세부 조절. 기본은 전체 원문. 단계·순서를 참조 조건으로 쓰지 않음(순서 기반 인계·"인계 메모"·"다음 단계로 넘기기" 없음). 자동 절단·자동 요약·재귀 수집 금지 | 사용자 (2026-09-26, Codex 논의에서 확정) |
| D16 | 이 저장소는 데모로 마무리하고 실제 구현은 별도 저장소에서 진행 | 사용자 (2026-09-26) |

## 6. 진행 현황

### 완료
- 도메인/스키마 v3 전환, 구 데이터·구 백업 자동 변환 (테스트: `db/migrations/v3.test.ts`, `exportImport.test.ts`)
- 홈 토글, 카드 → 초안 대화(지연 생성), SO 편집 모드(드래그·저장), 전체 대화 칸반(필터 URL 동기화)
- 대화 화면: 태그 입력·자동완성, 연결된 대화, 자료 패널(AI 입력·공유 자료함·SR 첨부·이 대화 파일, 버전 비교체), AI 제목
- SR: 접수 → AI 제목 → 관리 → 연결 업무 시작(이어가기/새 대화) → 진행 현황 · 결과 공유
- 관리 페이지: 전 항목 편집(이미지·모델 ID·링크1/2·입출력 안내·체크리스트 순서/기본값), 모델 ID 인라인, 삭제 보호
- 플랫폼 범위 정리(D9–D12), OpenWebUI Files API 전달, AI 달성도
- 리포트: 자료 흐름·태그별 대화·비효율 신호(이전 버전 입력 등)
- 검증: 단위 110개, 브라우저 스크립트로 주요 흐름·전 라우트 1280/375px 오류 0, 가짜 OpenWebUI 서버로 Live 경로(업로드 1회·files 첨부·본문 미인라인·달성도) 확인

### 남은 일 / 미결정
| 우선 | 항목 | 메모 |
|---|---|---|
| 결정 필요 | **관리 페이지 수정 권한** — 현재 누구나 에이전트 추가·수정·삭제 가능(홈 편집 모드는 SO만) | SO만 / 담당자+SO 중 선택 대기 |
| 결정 필요 | **System Owner 지정 UI** — 지금은 시드 또는 JSON 내보내기→`isSystemOwner` 수정→가져오기로만 변경 | 설정 화면에 추가 여부 |
| 결정 필요 | **진행 방식** — 데모 완성 후 이관(경우 1) vs 바로 새 저장소(경우 2) | [fusion-design.md](fusion-design.md) §1, 추천: 경우 2 + 짧은 UX 검증(2-b) |
| 결정 필요 | **융합 설계 미확정 정책 12개** — 대화 선택 시점 고정, 태그 해제 후 유지, 한도 단위, 컴포저 첨부 고정 등 | [fusion-design.md](fusion-design.md) §6. 특히 7번(파일 전달 실패 시 중단)은 **D10 변경**이라 확인 필요 |
| 높음 | 코드로 확인한 결함: 컴포저 첨부 1회만 전달, SR 접수 첨부가 그 메시지에서 누락, 산출물 기본 이름 때문에 버전 체인 미생성, 프롬프트 생성 예외 시 입력창 잠김, **API 키가 백업 JSON에 포함** | [fusion-design.md](fusion-design.md) §2 — 아직 수정 안 함 |
| 높음 | **실제 사내 OpenWebUI 연동 확인** — CORS 허용 필요, Files API 응답 형식·`files` 파라미터 동작, 모델 ID 매핑 | 가짜 서버로만 검증됨 |
| 높음 | 인증 없음 — 사용자 전환은 시연용(누구나 SO 가능). 운영 시 사내 SSO 연동 필요 | |
| 중간 | assistant가 **생성한 파일**을 플랫폼 산출물로 받는 경로 — 현재는 답변 텍스트를 "산출물로 저장"만 | OpenWebUI 응답의 파일 참조 처리 |
| 중간 | 브라우저 저장 한계(용량·공유), 크로스 PC 실시간 없음 → 백엔드 필요 | |
| 낮음 | 번들 500KB 경고(청크 분할), 모바일 칸반 세로 스크롤 UX | |

## 7. 주의사항 (함정)

- **공개 저장소 규칙**: 참고 이미지(에이전트 목록·워크플로우 다이어그램·과제 계획서 등), 사내 AI 포털 주소, 양식 번호, 이미지에서 옮긴 문구는 커밋 금지. 커밋 전 `git grep`으로 확인. 루트의 `*.png/*.jpg`는 `.gitignore`로 막아 둠
- 로컬에만 있는 `backup/before-history-reset` 브랜치에는 초기화 전(민감) 이력이 있다. **절대 push 금지**
- Windows 환경: 일부 파일이 CRLF. 스크립트로 치환할 때 줄바꿈을 정규화할 것. 화면 점검 스크립트의 스크린샷은 저장소 밖(스크래치 폴더)에 저장
- `useLiveQuery`는 마운트 직후 `undefined` — 기본값을 여기에 의존하면 안 됨(관리 시트의 담당자 버그가 이 원인이었음)
- 초안 → 대화 전환 시 첫 메시지는 history state로 넘기고 `TaskPage`가 전송 후 로컬 상태까지 비움(리마운트 중복 전송 방지)
- 예전 브라우저 데이터는 이전 시드를 그대로 가짐 → 설정 → "시드 데이터로 초기화"

## 8. 다음 세션 시작 체크리스트

1. `git pull` → `npm install` → `npx tsc -b` · `npx vitest run` 녹색 확인
2. 이 문서 5·6장(결정/미결정) 확인 후 사용자에게 미결정 항목부터 확인
3. 기능 작업은 `feat/*` 브랜치 → 커밋 전 민감 문자열 검사 → master 머지·push
4. 문서: 사용자용 [README](../README.md), 설계 [conversation-hub.md](conversation-hub.md), 융합 설계 [fusion-design.md](fusion-design.md), 실제 환경 검증 절차 [evaluation/real-env-verification.md](evaluation/real-env-verification.md). 이 문서는 상태 변경 시 함께 갱신
