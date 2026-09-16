import type { TaskModule } from '@/domain/types'
import { STEP_COLORS } from '../repositories/templates'
import { SEED_TEMPLATES } from './templates'

const AT = '2026-08-01T00:00:00.000Z'

/** 템플릿 단계들을 라이브러리 모듈로 등록 + 추가 모듈 몇 개 */
export const SEED_MODULES: TaskModule[] = [
  ...SEED_TEMPLATES.flatMap((t) =>
    t.steps.map(
      (s): TaskModule => ({
        ...s,
        id: `mod_${s.id}`,
        moduleId: undefined,
        tags: [t.category],
        createdBy: t.createdBy,
        updatedAt: AT,
      }),
    ),
  ),
  {
    id: 'mod_security_review',
    key: 'CUSTOM',
    name: '보안 검토',
    description: '인증/권한/감사 추적 관점의 보안 검토. 결과는 검토 의견서로 남긴다.',
    mode: 'assistant',
    assistant: { modelId: '', displayName: 'Security Review Assistant', systemPromptHint: 'GMP 시스템의 접근 통제·감사 추적 요건(21 CFR Part 11) 관점으로 점검한다.' },
    inputSpec: ['FDS 문서'],
    outputSpec: ['보안 검토 의견서'],
    checklist: [
      { id: 'c_sec_1', label: '권한 매트릭스 검토', required: true },
      { id: 'c_sec_2', label: '감사 추적 항목 확인', required: true },
    ],
    color: STEP_COLORS.CUSTOM,
    tags: ['공통'],
    createdBy: 'u_noh',
    updatedAt: AT,
  },
  {
    id: 'mod_perf_test',
    key: 'TEST',
    name: '성능 테스트',
    description: '대량 데이터/동시 사용자 조건에서 응답 시간과 자원 사용을 확인한다.',
    mode: 'assistant',
    assistant: { modelId: '', displayName: 'Performance Test Assistant', systemPromptHint: '성능 시나리오와 판정 기준(응답 시간, TPS)을 표로 정리한다.' },
    inputSpec: ['FDS 문서', '테스트 환경 정보'],
    outputSpec: ['성능 테스트 결과서'],
    checklist: [
      { id: 'c_perf_1', label: '시나리오/판정 기준 합의', required: true },
      { id: 'c_perf_2', label: '결과 기준 충족', required: true },
    ],
    color: STEP_COLORS.TEST,
    tags: ['공통'],
    createdBy: 'u_kimnw',
    updatedAt: AT,
  },
  {
    id: 'mod_manual_review',
    key: 'CUSTOM',
    name: '수동 검토 (assistant 없음)',
    description: '담당자가 직접 수행하고 메모/첨부로 기록하는 범용 수동 Task.',
    mode: 'manual',
    inputSpec: [],
    outputSpec: ['검토 기록'],
    checklist: [{ id: 'c_man_1', label: '검토 완료', required: true }],
    color: STEP_COLORS.CUSTOM,
    tags: ['공통', '수동'],
    createdBy: 'u_park',
    updatedAt: AT,
  },
]
