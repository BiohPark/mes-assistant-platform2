# MES Assistant Workflow Platform (데모)

Syncade ET 개발 업무를 단계별 assistant(OpenWebUI)와 함께 진행하기 위한 워크플로우 플랫폼의 **프론트 전용 데모**입니다.
백엔드 없이 브라우저 IndexedDB에 데이터를 저장하고, LLM은 Mock 응답 또는 사내 OpenAI-compatible endpoint를 직접 호출합니다.

설계 문서: [docs/design.md](docs/design.md)

## 실행

```bash
npm install
npm run dev        # http://localhost:5174
npm run build      # dist/ 정적 파일 (사내 웹서버 어디든 배포 가능)
npm run preview    # 빌드 결과 미리보기
npm test           # 도메인/DB/SSE 단위 테스트
```

첫 실행 시 시드 데이터(사용자 5명, 템플릿 3개, 업무 11건)가 자동 주입됩니다.
설정 화면에서 "시드 데이터로 초기화" / JSON 내보내기·가져오기로 시연 상태를 관리합니다.

> SPA 라우팅을 쓰므로 정적 서버에 올릴 때는 모든 경로를 `index.html`로 fallback 해야 합니다 (nginx `try_files $uri /index.html;`).

## 주요 화면

| 경로 | 화면 |
|---|---|
| `/` | 워크플로우 보드 — 단계 클릭 필터, 목록형/워크플로우형 토글, KPI |
| `/tasks/:id/steps/:stepId` | 업무 상세 — 스테퍼, 단계별 assistant 채팅, 입력 파일 선택, 체크리스트, 파일함, 메모, 이력 (외부 시스템 제공용 딥링크) |
| `/templates`, `/templates/:id` | 워크플로우 템플릿 편집기 (드래그 정렬, assistant 매핑, 체크리스트) |
| `/reports` | 일별·주별·담당자별·워크플로우별 리포트, 비효율 신호, assistant 피드백 요약 |
| `/settings` | LLM 연결(Mock/Live), 데이터 내보내기/가져오기 |
| 상단 "시스템 assistant" | 자연어로 업무/템플릿/단계 생성 (도구 호출 → 확인 후 적용) |

## 실제 LLM 연결

설정 → Live 모드 → Base URL / API Key / 모델 입력 → 연결 테스트.

- OpenWebUI: `http://<host>/api` (내부적으로 `/api/chat/completions`, `/api/models` 호출)
- 일반 OpenAI-compatible 서버: `http://<host>/v1`
- 브라우저에서 직접 호출하므로 서버의 **CORS 허용**이 필요합니다. 실서비스에서는 백엔드 프록시를 두세요.
- 단계별 assistant는 템플릿의 `assistant.modelId`를 모델로 사용합니다. OpenWebUI 워크스페이스 모델 ID와 맞춰 주세요.

## 구조

```
src/
  app/        라우터, 레이아웃, 상단바(사용자 전환), UI 상태
  domain/     타입, 단계 전이, 파일 인계, 리포팅, 완료 리포트 (순수 함수 + 테스트)
  db/         Dexie 스키마, 리포지토리(트랜잭션+이력), 시드, JSON 내보내기/가져오기
  llm/        ChatProvider(mock / openai-compatible), SSE 파서, 컨텍스트 빌더, 도구 정의
  features/   dashboard · task · chat · templates · reports · settings · system-assistant
  components/ 공용 UI (shadcn/ui + 배지/아바타/마크다운)
```

스택: Vite · React 19 · TypeScript · Tailwind v4 · shadcn/ui · react-router · Dexie · zustand · recharts · vitest
