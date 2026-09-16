# MES Assistant Workflow Platform — 설계 문서

> 삼성바이오로직스 MES 그룹 · Syncade ET(Equipment Tracking) 개발 assistant 워크플로우 관리 플랫폼
> 버전: 컨셉/데모 (프론트 전용) · 2026-09

## 1. 문제 정의와 플랫폼의 역할

### 배경
- Syncade ET 개발 과정을 잘게 쪼개고, 일부 기능을 OpenWebUI assistant(glm-5.2 + skill/knowledge)로 이관 중.
- assistant는 **대화형(chat/completions)으로만** 호출 가능하고, assistant 내부 워크플로우는 플랫폼이 제어할 수 없음.
- 업무 관리(진척, 담당, 이력)는 외부 시스템(ITSM 등)이 이미 담당. 이 플랫폼은 **각 task에 집중**하면서 관리 업무를 90% 이상 자동화해야 함.

### 플랫폼이 하는 일 (한 문장)
**assistant "바깥"에서 업무를 워크플로우로 묶고, 단계 간 파일·맥락을 유기적으로 넘겨주며, 체크리스트/메모/추적/리포팅으로 관리 업무를 자동화한다.**

### 하지 않는 일
- assistant 내부 프롬프트/스킬 실행 흐름 제어 (OpenWebUI 영역)
- 개발(코드 작성)과 배포 실행 (수동 단계로 표기, 메모·첨부로 기록)
- 외부 업무관리 시스템 대체 (링크와 ID로 연결만)

## 2. 핵심 개념

| 개념 | 정의 |
|---|---|
| **워크플로우 템플릿** | 업무 성격별 단계 정의. 각 단계는 표준 키(URS/FDS/DEV/TEST/PROTOCOL/DEPLOY/CUSTOM), 진행 방식(assistant/manual), 매핑된 assistant 모델, 기대 입력/산출물, 체크리스트를 가진다. |
| **업무(Task)** | 템플릿에서 인스턴스화된 하나의 개발 건. 코드(ET-2026-0031), 담당, 기한, 외부 시스템 참조, 현재 단계를 가진다. |
| **단계(Step)** | 업무 안의 워크플로우 노드. 상태 `pending → in_progress → done/skipped`, 언제든 `reopen`. 진행 방식은 업무별로 바꿀 수 있다 (assistant ↔ 수동). |
| **스레드** | 단계 안의 assistant 대화 세션. 단계당 여러 개, 하나가 활성. 새 스레드로 다시 시작해도 이전 스레드는 이력으로 남는다. |
| **파일함** | 업무 단위 공유 저장소. 파일은 "어느 단계의 산출물인지" 태그를 가진다. |
| **입력 파일** | 단계 진입 시 이전 단계 산출물이 자동으로 후보에 오르고, 사용자가 체크로 넣고 뺀다. 선택된 파일은 assistant 컨텍스트에 주입된다. |
| **체크리스트** | 단계별 완료 판단 기준. 필수 항목 미완료 시 완료를 **막지 않고 경고**하며 이력에 남긴다 (GMP 판단은 담당자). |
| **이력(Activity)** | 모든 상태 변경·체크·업로드·메시지·피드백을 사용자와 시각으로 기록. trace의 원천. |
| **피드백** | 단계 완료 시 assistant에 대한 별점+코멘트. 리포트에서 단계(assistant)별로 모아 스킬/지식 업그레이드 자료로 내보낸다. |

### 파일 인계 모델
```
URS 단계 ──산출물 태그──▶ URS_v1.md ─┐
                                    ├─▶ FDS 단계 입력 후보 (추천) ──체크──▶ system prompt 주입
업로드 파일 ────────────▶ CR.md ────┘
```
- 산출물 지정 경로: ① 채팅 응답 "산출물로 저장" ② 파일함에서 태그 토글 ③ 단계 완료 다이얼로그에서 일괄 지정
- 후보 우선순위: 직전 단계 산출물 → 그 이전 단계 산출물 → 일반 업로드 파일
- 사용자가 자유롭게 추가/제외 가능 ("반드시 그럴 필요는 없음" 요구 반영)

## 3. 도메인 모델

`src/domain/types.ts` 참조. 요약:

```
User             id, name, role
WorkflowTemplate id, name, category, steps[StepTemplate]
StepTemplate     key(StepKey), name, mode, assistant{modelId, displayName, systemPromptHint},
                 inputSpec[], outputSpec[], checklist[{label, required}], color
Task             id, code, title, summary, templateId, status(active|done|on_hold),
                 currentStepId, ownerId, assigneeIds[], priority, dueDate, externalRef{system,id,url}
StepInstance     taskId, key, order, name, mode, status, checklist[{checked, checkedBy, checkedAt}],
                 activeThreadId, inputFileIds[], outputFileIds[], startedAt/completedAt/completedBy, feedback
Thread / Message 단계별 대화. Message.status = streaming|done|error
FileAsset        taskId, name, mime, blob, source(upload|assistant), producedByStepId, tags[]
Note             taskId, stepInstanceId?, authorId, content, attachmentIds[]
ActivityLog      taskId, stepInstanceId?, userId, type, payload, at
Settings         currentUserId, llm{mode, baseUrl, apiKey, model}
```

순수 도메인 로직 (단위 테스트 대상):
- `transitions.ts` — 단계 전이, 체크리스트 토글, 필수 미완료 계산
- `fileHandoff.ts` — 입력 후보 계산
- `reporting.ts` — 완료 추이, 단계 소요, 담당자 활동, 워크플로우 통계, 비효율 신호, 피드백 요약
- `taskReport.ts` — 업무 완료 리포트(마크다운)

## 4. 화면 설계

### 4.1 워크플로우 보드 (`/`)
- **KPI 타일**: 진행 중 / 기한 초과 / 이번 주 완료 / 되돌리기(7일)
- **워크플로우 파이프라인**: 단계를 가로로 배치, 단계별 업무 수. **단계 클릭 = 전체 업무 필터** (재클릭 해제, "전체" 버튼)
- **목록형 ↔ 워크플로우형 토글**
  - 목록형: 코드·제목·현재 단계·미니 진행바·담당·우선순위·기한·상태·외부 링크
  - 워크플로우형: 단계별 컬럼 카드. 선택 단계 확대, 나머지 축소(카운트만)
- 공용 필터: 검색, 담당자, 워크플로우, 상태. 필터·뷰 상태는 브라우저에 보존
- 템플릿마다 단계가 달라도 `StepKey`로 컬럼을 맞춘다. 특정 템플릿 필터 시 그 템플릿의 단계명으로 컬럼 표시

### 4.2 업무 상세 (`/tasks/:taskId/steps/:stepId`)
- **헤더**: 코드·제목·상태·우선순위·템플릿·담당·기한(D-n/지연)·외부 시스템 링크·**링크 복사**(외부 시스템 제공용 딥링크)·업무 완료·보류·단계 추가
- **워크플로우 스테퍼**: 상태별 색, 수동 단계 회색, "현재" 핀, 체크리스트 진행률. 클릭 = 그 단계 보기 (URL 변경). "이 단계를 현재 단계로"로 자유 이동
- **단계 패널 3단**
  - 좌: 입력 파일 선택(후보+추천 표시), 체크리스트(항목 추가/삭제, 체크한 사람·시각), 기대 산출물
  - 중앙: assistant 단계 = 채팅(스레드 탭, 스트리밍, 첨부, 마크다운, 복사, **산출물로 저장**) / 수동 단계 = 회색 톤 메모+첨부
  - 우: 파일함(전체/이 단계/산출물 필터, 업로드·드래그앤드롭·미리보기·다운로드·산출물 태그·삭제) / 메모 / 이력(업무 전체·이 단계)
- **단계 헤더 액션**: 수동↔assistant 전환, 건너뛰기, 되돌리기, 단계 완료
- **단계 완료 다이얼로그**: 필수 체크 미완료 경고(차단 X) · 산출물 지정 · assistant 피드백(별점+코멘트)
- **업무 완료 다이얼로그**: 완료 리포트 미리보기(단계별 소요·체크·산출물·되돌리기·피드백) → 다운로드 + 파일함 저장 + 완료 처리

### 4.3 워크플로우 템플릿 (`/templates`, `/templates/:id`)
- 목록: 단계 미리보기(assistant/수동 아이콘), 사용 업무 수, 복제/삭제(사용 중이면 차단)
- 편집기: 이름/분류/설명, 단계 드래그 정렬, 단계별 이름·키·진행 방식·assistant 모델·역할 지침·기대 입력/산출물·체크리스트(필수 여부)
- 변경은 이후 생성 업무에만 적용. 진행 중 업무는 업무 화면 "단계 추가"로 개별 조정

### 4.4 시스템 assistant (우측 드로어, 전 화면)
- 자연어로 업무 생성 / 템플릿 생성 / 진행 중 업무에 단계 추가
- LLM은 **도구 호출(function calling)**로 액션을 제안 → 사용자가 "적용" 클릭 → 실행 → 결과 링크
- Mock 모드는 규칙 기반 파서로 동일 UX 시연

### 4.5 리포트 (`/reports`)
- 기간(7/30/90일) · 일별/주별 · 담당자 필터
- KPI: 완료 업무, 평균 리드타임, 되돌리기, 체크리스트 완료율
- 차트: 완료 추이(단계/업무), 단계별 평균 소요일(병목 강조), 담당자별 활동(대화/체크/완료/파일), 워크플로우별 현황 표
- **비효율 신호**: 되돌리기(사유), 건너뛰기, 필수 미완료 완료, 장기 체류(10일+), 정체(5일 무활동)
- **assistant 피드백 요약**: 단계별 평균 별점·코멘트, 마크다운 다운로드 → 스킬/knowledge 업그레이드 입력

### 4.6 설정 (`/settings`)
- LLM: Mock / Live 전환, Base URL, API Key, 기본 모델, 연결 테스트(`GET {baseUrl}/models`)
- 데이터: JSON 내보내기/가져오기(첨부 blob 포함), 시드 초기화

## 5. LLM 연동 설계

### 어댑터 인터페이스
```ts
interface ChatProvider {
  stream(req: { model, messages, tools?, signal?, meta? }): AsyncIterable<
    { type:'delta', text } | { type:'tool_call', call } | { type:'done' } | { type:'error', message }>
  ping(): Promise<{ ok, detail }>
}
```
- `MockProvider`: 단계 키별 시나리오 응답(턴 순서에 따라 진행), 토큰 단위 지연 스트리밍, 시스템 assistant는 규칙 기반 도구 호출
- `OpenAICompatibleProvider`: `POST {baseUrl}/chat/completions` (stream: true), SSE 파싱, tool_calls 조각 병합. OpenWebUI의 `/api/chat/completions`와 호환

### 단계 assistant 호출 컨텍스트
`buildStepSystemPrompt(task, step, inputFiles)`:
```
역할 지침: {step.assistant.systemPromptHint}
## 업무  코드/제목/요약
## 현재 단계: {step.name}  설명, 기대 입력, 기대 산출물
## 입력 파일
### 파일: URS_v1.md  (텍스트/마크다운은 본문 인라인, 최대 12k자)
### 파일: capture.png (이미지 등은 메타데이터만)
```
+ 활성 스레드의 이전 메시지(user/assistant)

### assistant 모델 결정 순서
```
이 대화(스레드) > 이 단계 > 이 업무 기본 > 워크플로우 템플릿 기본 > 설정 기본 모델
```
- 템플릿 편집기에서 워크플로우 기본 모델을, 업무 생성 시 업무 기본 모델을(템플릿 값에서 복사) 지정한다.
- 채팅 헤더의 모델 버튼에서 적용 범위(이 대화만 / 이 단계 / 업무 기본)를 골라 바로 바꿀 수 있다. Live 모드는 `{baseUrl}/models` 목록에서 선택하고, 서버에 없는 모델이면 경고한다.
- 모든 변경은 이력에 `model.changed`(범위 포함)로 남는다.

### 다중 참여자 대화
같은 스레드에 여러 사용자가 참여할 수 있다(메시지마다 작성자 기록). 표준 chat/completions에는 발화자 개념이 없으므로, 참여자가 2명 이상이면
- system 프롬프트에 참여자 목록(이름·역할)과 "user 메시지는 [이름] 접두어로 발화자를 표시한다"는 지침을 넣고
- user 메시지 본문 앞에 `[박비오] …`, `[이희준] …` 접두어를 붙여 보낸다.
채팅 헤더에는 참여자 아바타와 "N명 참여"가 표시된다. 데모는 단일 브라우저(사용자 전환)로 시연하며, 실서비스에서는 백엔드의 스레드 동기화(SSE/WebSocket)가 필요하다.

### 실서비스 전환 시 OpenWebUI 연동 포인트
| 데모 | 실서비스 |
|---|---|
| 브라우저 → endpoint 직접 호출 | 백엔드 프록시(API 키 서버 보관, 사용자 SSO 매핑, 감사 로그) |
| 텍스트 파일 본문을 system prompt에 인라인 | OpenWebUI Files API(`POST /api/v1/files/`)로 업로드 후 chat 요청 `files: [{type:'file', id}]`로 첨부 → RAG/knowledge 활용 |
| `step.assistant.modelId` = 가상 ID | OpenWebUI 워크스페이스의 커스텀 모델 ID (skill/knowledge가 묶인 assistant) |
| 시스템 assistant 도구 = 프론트에서 실행 | 백엔드에서 실행하고 감사 기록 |

## 6. 아키텍처 (데모)

```
React SPA (Vite)
 ├─ features/*      화면 (dashboard, task, chat, templates, reports, settings, system-assistant)
 ├─ domain/*        순수 로직 + 테스트
 ├─ db/             Dexie(IndexedDB) 스키마, 리포지토리(트랜잭션 + 이력 기록), 시드, JSON 내보내기/가져오기
 └─ llm/            ChatProvider 어댑터 (mock / openai-compatible), 컨텍스트 빌더, 도구 정의
```
- 화면은 `useLiveQuery`로 DB를 구독 → 어느 화면에서 바꿔도 즉시 반영
- 모든 변경은 리포지토리 함수 하나로 모여 **ActivityLog를 함께 기록** (trace 자동화)
- 실서비스 전환: `db/repositories/*`를 REST/GraphQL 클라이언트로 교체, `useLiveQuery`를 서버 상태 라이브러리로 교체. 화면·도메인 로직은 유지

## 7. 실서비스 로드맵 (제안)

1. **백엔드**: Node/Python API + PostgreSQL(엔터티 그대로) + 오브젝트 스토리지(파일). SSO(AD) 연동, 역할(개발/QA/비즈니스 오너)
2. **OpenWebUI 연동**: 프록시 경유 chat/completions, Files API 첨부, 모델 목록 동기화(템플릿 편집기에서 선택)
3. **외부 시스템 연동**: ITSM 티켓 ↔ 업무 양방향 링크, 상태 변경 webhook, 딥링크 제공
4. **GMP 보강**: 전자서명(단계 완료/승인), 감사 추적 불변 저장, 리포트 PDF 출력, 문서 버전 관리
5. **자동화 확장**: 단계 완료 시 다음 단계 assistant에 자동 요약 프롬프트, 체크리스트 자동 제안(LLM), 비효율 신호 알림

## 8. 데모 시나리오 (시연 순서 제안)

1. 보드에서 "FDS 기능명세" 단계 클릭 → 목록형/워크플로우형 토글
2. ET-2026-0031 진입 → URS 단계에서 산출물(URS v1)이 FDS 입력 후보로 잡혀 있음을 보여줌
3. FDS 채팅에서 "추적성 매트릭스도 만들어줘" → 응답을 **산출물로 저장** → 파일함에 FDS 산출물 태그
4. 체크리스트 체크(사용자 전환 후 다른 사람으로도) → 이력 탭에서 누가 언제 했는지 확인
5. **단계 완료** → 필수 미완료 경고 → 피드백 별점 → 개발 단계(수동, 회색)로 자동 이동 → 메모 남기기
6. 개발 단계 **건너뛰기** → 테스트 단계에서 FDS 산출물이 입력 후보에 등장 / 다시 **되돌리기**
7. 시스템 assistant로 "긴급 업무 … 만들어줘" → 적용 → 새 업무로 이동
8. 리포트: 병목 단계, 비효율 신호(되돌리기 사유), assistant 피드백 요약 다운로드
9. 업무 완료 → 완료 리포트 미리보기/다운로드
10. 설정: Live 전환 + 연결 테스트(사내 endpoint), JSON 내보내기
