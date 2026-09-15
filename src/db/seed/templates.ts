import type { ChecklistTemplateItem, StepTemplate, WorkflowTemplate } from '@/domain/types'
import { STEP_COLORS } from '../repositories/templates'

function chk(id: string, label: string, required = true): ChecklistTemplateItem {
  return { id, label, required }
}

function step(
  id: string,
  key: StepTemplate['key'],
  name: string,
  over: Partial<StepTemplate> & { checklist: ChecklistTemplateItem[] },
): StepTemplate {
  const mode = over.mode ?? 'assistant'
  return {
    id,
    key,
    name,
    description: '',
    mode,
    assistant:
      mode === 'assistant'
        ? {
            modelId: `et-${key.toLowerCase()}-assistant`,
            displayName: `${name} Assistant`,
            systemPromptHint: '',
          }
        : undefined,
    inputSpec: [],
    outputSpec: [],
    color: STEP_COLORS[key],
    ...over,
  }
}

export const TPL_STANDARD = 'tpl_et_standard'
export const TPL_HOTFIX = 'tpl_et_hotfix'
export const TPL_MASTER = 'tpl_et_master'

export const SEED_TEMPLATES: WorkflowTemplate[] = [
  {
    id: TPL_STANDARD,
    name: 'Syncade ET 표준 개발',
    description: '요구사항 분석부터 배포 검증까지 6단계 표준 개발 워크플로우 (GMP 변경관리 대상)',
    category: '기능 개발',
    createdBy: 'u_park',
    updatedAt: '2026-08-01T00:00:00.000Z',
    steps: [
      step('ts_std_urs', 'URS', 'URS 요구사항 분석', {
        description: '비즈니스 오너와 대화하며 요구사항을 수집하고 URS 초안을 작성한다.',
        assistant: {
          modelId: 'et-urs-assistant',
          displayName: 'URS Assistant',
          systemPromptHint: 'Syncade ET 도메인 용어로 요구사항을 정리하고, 누락된 정보는 질문으로 확인한다.',
        },
        inputSpec: ['변경 요청서(CR)', '현행 화면/프로세스 자료'],
        outputSpec: ['URS 문서(초안)', '요구사항 목록'],
        checklist: [
          chk('c_urs_1', '비즈니스 오너 인터뷰 완료'),
          chk('c_urs_2', '요구사항 ID 부여 및 우선순위 정리'),
          chk('c_urs_3', 'GMP 영향 평가(GxP Impact) 확인'),
          chk('c_urs_4', 'URS 초안 비즈니스 오너 리뷰', false),
        ],
      }),
      step('ts_std_fds', 'FDS', 'FDS 기능명세', {
        description: 'URS를 기반으로 기능 명세와 화면/데이터 정의를 작성한다.',
        assistant: {
          modelId: 'et-fds-assistant',
          displayName: 'FDS Assistant',
          systemPromptHint: 'URS 항목별로 기능 명세를 매핑하고 추적성 매트릭스를 유지한다.',
        },
        inputSpec: ['URS 문서', '요구사항 목록'],
        outputSpec: ['FDS 문서', 'URS-FDS 추적성 매트릭스'],
        checklist: [
          chk('c_fds_1', 'URS 항목 100% 매핑'),
          chk('c_fds_2', '화면/데이터 모델 정의'),
          chk('c_fds_3', '인터페이스(EBR, LIMS 등) 영향 검토'),
          chk('c_fds_4', 'FDS 리뷰 회의', false),
        ],
      }),
      step('ts_std_dev', 'DEV', '개발', {
        mode: 'manual',
        description: '개발자가 직접 진행하는 단계. 진행 메모와 산출물(코드 리뷰 기록 등)을 남긴다.',
        inputSpec: ['FDS 문서'],
        outputSpec: ['개발 완료 보고', '코드 리뷰 기록'],
        checklist: [chk('c_dev_1', '개발 완료'), chk('c_dev_2', '코드 리뷰 완료'), chk('c_dev_3', '개발 환경 단위 테스트', false)],
      }),
      step('ts_std_test', 'TEST', '테스트', {
        description: 'FDS 기반 테스트 케이스 작성과 테스트 수행 결과 정리.',
        assistant: {
          modelId: 'et-test-assistant',
          displayName: 'Test Assistant',
          systemPromptHint: 'FDS 항목별 테스트 케이스를 생성하고 예상 결과를 명시한다.',
        },
        inputSpec: ['FDS 문서', '개발 완료 보고'],
        outputSpec: ['테스트 케이스', '테스트 결과서'],
        checklist: [chk('c_test_1', '테스트 케이스 FDS 커버리지 확인'), chk('c_test_2', '테스트 수행 및 결과 기록'), chk('c_test_3', '결함 조치 완료')],
      }),
      step('ts_std_proto', 'PROTOCOL', '테스트 프로토콜 검증', {
        description: 'GMP 테스트 프로토콜(IQ/OQ) 형식 검토와 검증 증빙 확인.',
        assistant: {
          modelId: 'et-protocol-assistant',
          displayName: 'Protocol Assistant',
          systemPromptHint: '테스트 프로토콜이 GMP 문서 요건(서명, 날짜, 증빙)을 충족하는지 점검한다.',
        },
        inputSpec: ['테스트 케이스', '테스트 결과서'],
        outputSpec: ['테스트 프로토콜 검토 의견', '승인 요청서'],
        checklist: [chk('c_pro_1', '프로토콜 형식 요건 충족'), chk('c_pro_2', '증빙(스크린샷/로그) 첨부 확인'), chk('c_pro_3', 'QA 검토 의견 반영')],
      }),
      step('ts_std_deploy', 'DEPLOY', '배포 및 배포 검증', {
        description: '배포 후 DB 조회 등으로 타겟 반영 여부를 확인한다. 배포 자체는 수동.',
        assistant: {
          modelId: 'et-deploy-assistant',
          displayName: 'Deploy Verify Assistant',
          systemPromptHint: '배포 대상 목록을 기준으로 검증 SQL/체크 항목을 제시하고 결과를 대조한다.',
        },
        inputSpec: ['승인 요청서', '배포 대상 목록'],
        outputSpec: ['배포 검증 결과서'],
        checklist: [chk('c_dep_1', '배포 대상 목록 대조'), chk('c_dep_2', 'DB 조회 검증 완료'), chk('c_dep_3', '운영 담당자 확인', false)],
      }),
    ],
  },
  {
    id: TPL_HOTFIX,
    name: '긴급 변경 (Hotfix)',
    description: '운영 장애 대응용 단축 워크플로우. FDS 생략, 사후 문서화.',
    category: '운영 대응',
    createdBy: 'u_park',
    updatedAt: '2026-08-10T00:00:00.000Z',
    steps: [
      step('ts_hf_urs', 'URS', '장애 분석', {
        description: '장애 현상과 원인을 정리하고 조치 범위를 확정한다.',
        inputSpec: ['장애 보고서'],
        outputSpec: ['원인 분석서'],
        checklist: [chk('c_hf_1', '재현 조건 확인'), chk('c_hf_2', '영향 범위 확정')],
      }),
      step('ts_hf_dev', 'DEV', '긴급 조치', {
        mode: 'manual',
        inputSpec: ['원인 분석서'],
        outputSpec: ['조치 내역'],
        checklist: [chk('c_hf_3', '조치 완료'), chk('c_hf_4', '롤백 방안 확보')],
      }),
      step('ts_hf_test', 'TEST', '검증', {
        inputSpec: ['조치 내역'],
        outputSpec: ['검증 결과'],
        checklist: [chk('c_hf_5', '재현 케이스 통과')],
      }),
      step('ts_hf_deploy', 'DEPLOY', '배포 및 사후 문서화', {
        inputSpec: ['검증 결과'],
        outputSpec: ['배포 검증 결과서', '변경관리 문서'],
        checklist: [chk('c_hf_6', '운영 반영 확인'), chk('c_hf_7', '변경관리(CC) 사후 등록')],
      }),
    ],
  },
  {
    id: TPL_MASTER,
    name: '장비 마스터 변경',
    description: '장비 마스터 데이터 신규/변경 등록 워크플로우. 개발 없이 데이터 등록과 검증 중심.',
    category: '마스터 데이터',
    createdBy: 'u_kimhy',
    updatedAt: '2026-08-15T00:00:00.000Z',
    steps: [
      step('ts_ms_urs', 'URS', '변경 요청 분석', {
        inputSpec: ['마스터 변경 요청서'],
        outputSpec: ['변경 항목 목록'],
        checklist: [chk('c_ms_1', '대상 장비 목록 확정'), chk('c_ms_2', '명명 규칙 준수 확인')],
      }),
      step('ts_ms_fds', 'FDS', '마스터 정의서 작성', {
        inputSpec: ['변경 항목 목록'],
        outputSpec: ['마스터 정의서'],
        checklist: [chk('c_ms_3', '속성값 정의 완료'), chk('c_ms_4', '상태 모델 매핑')],
      }),
      step('ts_ms_dev', 'DEV', '데이터 등록', {
        mode: 'manual',
        inputSpec: ['마스터 정의서'],
        outputSpec: ['등록 결과 캡처'],
        checklist: [chk('c_ms_5', '개발계 등록'), chk('c_ms_6', '검증계 등록')],
      }),
      step('ts_ms_proto', 'PROTOCOL', '등록 검증', {
        inputSpec: ['등록 결과 캡처', '마스터 정의서'],
        outputSpec: ['검증 프로토콜'],
        checklist: [chk('c_ms_7', '정의서 대비 100% 일치')],
      }),
      step('ts_ms_deploy', 'DEPLOY', '운영 반영 검증', {
        inputSpec: ['검증 프로토콜'],
        outputSpec: ['배포 검증 결과서'],
        checklist: [chk('c_ms_8', '운영 DB 조회 검증')],
      }),
    ],
  },
]
