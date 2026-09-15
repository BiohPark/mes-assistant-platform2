import type { StepKey } from '@/domain/types'

export interface MockContext {
  taskTitle: string
  stepName: string
  inputFileNames: string[]
  userText: string
  turn: number
}

type ScenarioFn = (ctx: MockContext) => string

const inputsLine = (ctx: MockContext) =>
  ctx.inputFileNames.length
    ? `입력 파일 ${ctx.inputFileNames.length}건(${ctx.inputFileNames.join(', ')})을 확인했습니다.`
    : '입력 파일이 없어 업무 요약만으로 진행합니다. 관련 자료가 있으면 좌측에서 입력 파일로 선택해 주세요.'

const URS: ScenarioFn[] = [
  (ctx) => `${inputsLine(ctx)}

"${ctx.taskTitle}" 요구사항 정리를 시작하겠습니다. URS 작성 전에 확인이 필요한 항목입니다.

1. **트리거/대상 범위** — 어떤 장비(클래스)와 어떤 이벤트가 대상인가요?
2. **GxP 영향** — 배치 기록(EBR)이나 장비 상태에 영향이 있나요?
3. **예외 처리** — 자동 처리가 실패했을 때 운전자가 개입하는 절차가 있나요?

답변해 주시면 요구사항 ID를 부여해 초안을 작성하겠습니다.`,
  (ctx) => `답변 감사합니다. 반영해서 URS 초안을 작성했습니다.

# URS — ${ctx.taskTitle}

## 1. 배경
${ctx.userText.slice(0, 160)}

## 2. 요구사항
| ID | 요구사항 | 우선순위 | GxP |
|---|---|---|---|
| URS-01 | 대상 이벤트 발생 시 시스템이 자동으로 처리를 수행한다 | High | Yes |
| URS-02 | 처리 결과는 Equipment Log에 actor=SYSTEM 으로 기록한다 | High | Yes |
| URS-03 | 실패 시 운전자에게 알람을 표시하고 수동 처리 경로를 제공한다 | Medium | Yes |
| URS-04 | 수동 처리 시 사유 입력을 필수로 한다 | Medium | Yes |

## 3. 제외 범위
- 타 시스템 인터페이스 변경 (별도 CR)

우측 상단 **산출물로 저장**을 누르면 이 문서가 다음 단계(FDS)의 입력 후보로 등록됩니다.`,
  (ctx) => `요청하신 내용을 반영해 URS를 갱신했습니다. 변경 사항:

- ${ctx.userText.slice(0, 80)} → 요구사항 반영 (URS-05 신규)
- 우선순위 재정렬

체크리스트의 "요구사항 ID 부여 및 우선순위 정리" 항목을 완료 처리하셔도 됩니다. 비즈니스 오너 리뷰가 끝나면 단계를 완료해 주세요.`,
]

const FDS: ScenarioFn[] = [
  (ctx) => `${inputsLine(ctx)}

URS 항목을 기능 명세로 매핑했습니다.

# FDS 초안 — ${ctx.taskTitle}

## 기능 목록
| FDS ID | URS | 기능 설명 | 구성요소 |
|---|---|---|---|
| FDS-01 | URS-01 | 이벤트 구독 및 상태 전환 서비스 호출 | EquipmentStatusService |
| FDS-02 | URS-02 | 전환 이력 기록 (actor=SYSTEM, source 컬럼) | EQUIPMENT_STATUS_LOG |
| FDS-03 | URS-03 | 실패 알람 발생 및 수동 처리 화면 진입 | AlarmService, ET UI |

## 데이터 모델 변경
- \`EQUIPMENT_STATUS_LOG.TRANSITION_SOURCE VARCHAR2(20)\` 추가

## 추적성
URS-01~04 → FDS-01~03 (URS-04는 기존 기능 재사용)

인터페이스(EBR/LIMS) 영향 검토가 필요하면 말씀해 주세요.`,
  (ctx) => `"${ctx.userText.slice(0, 60)}" 관련 검토 결과입니다.

- 기존 인터페이스 스펙 변경 없음 (상태값 집합 유지)
- 리포트 뷰가 \`SELECT *\`를 사용하는 경우 컬럼 추가 영향 가능 → 뷰 정의 확인 권장
- 성능: 이벤트 구독은 기존 큐를 재사용하므로 추가 부하 미미

FDS 문서에 "인터페이스 영향 검토" 절을 추가했습니다. 산출물로 저장하시겠어요?`,
  () => `FDS 리뷰 회의용 요약을 준비했습니다.

1. 기능 3건, 데이터 모델 변경 1건
2. 인터페이스 영향 없음 (뷰 확인 필요 1건)
3. 미결 사항: 알람 코드 체계 확정

체크리스트 항목을 확인하고 단계를 완료하면 테스트 단계의 입력으로 전달됩니다.`,
]

const TEST: ScenarioFn[] = [
  (ctx) => `${inputsLine(ctx)}

FDS 항목별 테스트 케이스를 생성했습니다.

# 테스트 케이스 — ${ctx.taskTitle}

| TC | FDS | 사전조건 | 절차 | 예상결과 |
|---|---|---|---|---|
| TC-01 | FDS-01 | 대상 장비 상태 초기값 | 트리거 이벤트 발생 | 상태 자동 전환 |
| TC-02 | FDS-02 | TC-01 수행 | Equipment Log 조회 | actor=SYSTEM 기록 |
| TC-03 | FDS-03 | 서비스 강제 실패 | 트리거 이벤트 발생 | 알람 표시, 수동 처리 가능 |
| TC-04 | FDS-01 | 경계값 조건 | 임계값 ±1 단위로 수행 | 경계 조건 정확히 동작 |

테스트 결과를 알려주시면 결과서 형식으로 정리해 드립니다.`,
  (ctx) => `테스트 결과를 반영했습니다.

${ctx.userText.slice(0, 120)}

# 테스트 결과서
- 수행 케이스: 4건 / 통과: 4건 / 결함: 0건
- 수행자: (사용자 전환 드롭다운의 현재 사용자)
- 증빙: 스크린샷 첨부 필요 (파일함에 업로드 후 산출물 태깅)

프로토콜 검증 단계로 넘길 준비가 되었습니다.`,
]

const PROTOCOL: ScenarioFn[] = [
  (ctx) => `${inputsLine(ctx)}

GMP 테스트 프로토콜 요건 점검 결과입니다.

| 항목 | 상태 | 비고 |
|---|---|---|
| 프로토콜 번호/버전 | ✅ | |
| 테스트 케이스 ↔ FDS 추적성 | ✅ | 100% |
| 수행자/검토자 서명란 | ⚠️ | 검토자 서명 누락 |
| 증빙(스크린샷/로그) | ⚠️ | TC-03 증빙 없음 |
| 결함 조치 기록 | ✅ | 해당 없음 |

⚠️ 2건을 보완하면 승인 요청서를 생성할 수 있습니다.`,
  () => `보완 내용을 확인했습니다. 승인 요청서 초안입니다.

# 승인 요청서
- 대상: 테스트 프로토콜 v1.1
- 검토 의견: 형식 요건 충족, 증빙 완비
- 승인 요청 대상: QA

산출물로 저장 후 배포 단계로 진행하세요.`,
]

const DEPLOY: ScenarioFn[] = [
  (ctx) => `${inputsLine(ctx)}

배포 대상 기준 검증 항목과 조회 SQL을 준비했습니다. 배포 자체는 수동으로 진행하고, 완료 후 아래 결과를 알려주세요.

\`\`\`sql
-- 1. 변경 오브젝트 반영 확인
SELECT OBJECT_NAME, STATUS, LAST_DDL_TIME
FROM USER_OBJECTS
WHERE OBJECT_NAME IN ('EQUIPMENT_STATUS_SVC', 'V_EQUIP_STATUS_HIST');

-- 2. 컬럼 추가 확인
SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS
WHERE TABLE_NAME = 'EQUIPMENT_STATUS_LOG' AND COLUMN_NAME = 'TRANSITION_SOURCE';
\`\`\`

체크 항목: 오브젝트 VALID 2건, 컬럼 1건, 설정값 1건`,
  (ctx) => `조회 결과를 대조했습니다.

${ctx.userText.slice(0, 120)}

# 배포 검증 결과서
| 항목 | 기대 | 실제 | 판정 |
|---|---|---|---|
| 오브젝트 상태 | VALID ×2 | VALID ×2 | ✅ |
| TRANSITION_SOURCE 컬럼 | 존재 | 존재 | ✅ |
| 설정값 | 72 | 72 | ✅ |

모든 항목 일치. 산출물로 저장 후 업무를 완료하면 완료 리포트가 생성됩니다.`,
]

const GENERIC: ScenarioFn[] = [
  (ctx) => `${inputsLine(ctx)}

"${ctx.stepName}" 단계 작업을 돕겠습니다. 요청하신 내용: "${ctx.userText.slice(0, 80)}"

정리한 내용을 산출물로 저장하거나, 추가로 필요한 정보를 알려주세요.`,
]

const SCENARIOS: Record<StepKey, ScenarioFn[]> = {
  URS,
  FDS,
  DEV: GENERIC,
  TEST,
  PROTOCOL,
  DEPLOY,
  CUSTOM: GENERIC,
}

export function mockReply(key: StepKey, ctx: MockContext): string {
  const list = SCENARIOS[key] ?? GENERIC
  const fn = list[Math.min(ctx.turn, list.length - 1)]
  return fn(ctx)
}
