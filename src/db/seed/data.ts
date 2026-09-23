import { SeedBuilder, type SeedBundle } from './builder'
import { scenarioFor } from '@/llm/mockScenarios'

/** mock 시나리오 텍스트로 user/assistant 턴을 만든다 (user, assistant, user, assistant …) */
function turns(assistantId: string, level2: string, taskTitle: string, assistantName: string, userTexts: string[]): string[] {
  const fns = scenarioFor(assistantId, level2)
  const out: string[] = []
  userTexts.forEach((userText, turn) => {
    out.push(userText)
    out.push(fns[Math.min(turn, fns.length - 1)]({ taskTitle, assistantName, inputFileNames: [], userText, turn }))
  })
  return out
}

const URS_DOC = `# URS — 알람 목록 장비별 필터

| ID | 요구사항 | 우선순위 | GxP |
|---|---|---|---|
| URS-01 | 알람 목록에서 장비 ID·장비 클래스로 필터링할 수 있어야 한다 | High | No |
| URS-02 | 필터 조건은 사용자별로 저장되어 다음 로그인에도 유지된다 | Medium | No |
| URS-03 | 필터 적용 여부와 무관하게 Critical 알람은 상단에 고정 표시한다 | High | Yes |
`

const URS_DOC_V2 = `${URS_DOC}| URS-04 | 필터 결과를 CSV로 내보낼 수 있어야 한다 | Low | No |
`

const FDS_DOC = `# FDS — 알람 목록 장비별 필터

| FDS | 기능 | URS |
|---|---|---|
| FDS-01 | AlarmList 화면 상단에 장비 ID/클래스 멀티 선택 필터 추가 | URS-01 |
| FDS-02 | UserPreference 테이블에 ALARM_FILTER 키로 저장 | URS-02 |
| FDS-03 | Severity=Critical 은 정렬 우선순위 0으로 고정 | URS-03 |
`

const CC_DOC = `# Change Control 초안 — CC-2026-014

- **변경 제목**: EBR 서명 단계 추가 (포장 공정)
- **변경 사유**: 일탈 DEV-2026-031 CAPA 후속
- **영향 시스템**: MES EBR, 라벨 프린터 인터페이스
- **GxP 영향**: Yes — 밸리데이션 재수행 필요
`

const CC_ITEM_DOC = `# CC Item 목록 — CC-2026-014

| # | 항목 | 담당 | 비고 |
|---|---|---|---|
| 1 | EBR 템플릿 서명 단계 추가 | MES | FDS 갱신 필요 |
| 2 | 라벨 인터페이스 검증 | QA | 테스트 스크립트 재사용 |
| 3 | SOP 개정 | 생산 | 교육 기록 첨부 |
`

const DEV_DOC = `# Deviation 초안 — 라벨 불일치

- **발생일**: 포장 2라인, 로트 24B117
- **현상**: 라벨 인쇄 로트 번호와 EBR 로트 번호 불일치
- **즉시 조치**: 해당 로트 격리, 라벨 재출력
- **근본 원인(추정)**: 수기 입력 단계 존재
- **CAPA**: EBR에서 라벨 데이터 자동 전달 + 서명 단계 추가
`

export function buildSeedData(now: Date): SeedBundle {
  const b = new SeedBuilder(now)

  // ── SR-2026-0002 체인: URS 분석 도우미 → FDS 작성 도우미 → FDS 리뷰 도우미 / 테스트 시나리오
  const SR2 = 'SR-2026-0002'
  const t1 = b.addTask({
    id: 'task_seed_0001',
    code: 'WK-2026-0001',
    assistantId: 'urs-analyst',
    title: '알람 목록 장비별 필터 URS 정리',
    summary: '현업 요청(알람 과다)을 URS 항목으로 구조화',
    status: 'done',
    ownerId: 'u_dev4',
    assigneeIds: ['u_dev4'],
    priority: 'high',
    createdDaysAgo: 12,
    startedDaysAgo: 12,
    completedDaysAgo: 9,
    tags: [SR2],
    checklist: [
      ['요구사항 ID 부여', true, true],
      ['GxP 영향 표시', true, true],
    ],
    feedback: { rating: 5, comment: 'GxP 표시까지 한 번에 정리됨', by: 'u_dev4' },
  })
  b.addThread(
    t1,
    'u_dev4',
    turns(t1.assistantId, '분석', t1.title, 'URS 분석 도우미', [
      '시작',
      '알람 목록에 장비별 필터가 필요하다는 현업 요청이야. 알람이 하루 수백 건이라 찾기 힘들대',
      'Critical 알람은 필터와 무관하게 항상 보여야 해',
    ]),
    12,
  )
  const ursV1 = b.addFile(t1, 'URS_알람필터.md', URS_DOC, { output: true, by: 'u_dev4', daysAgo: 10 })

  const t2 = b.addTask({
    id: 'task_seed_0002',
    code: 'WK-2026-0002',
    assistantId: 'fds-writer',
    title: '알람 필터 FDS 작성',
    summary: 'URS-01~03 기반 기능 설계',
    status: 'in_progress',
    ownerId: 'u_dev1',
    assigneeIds: ['u_dev1'],
    priority: 'high',
    createdDaysAgo: 9,
    startedDaysAgo: 9,
    dueDaysFromNow: 3,
    tags: [SR2],
    checklist: [
      ['URS 추적성 표 작성', true, true],
      ['화면 설계 첨부', false, false],
    ],
  })
  b.select(t2, ursV1, 'main', 'u_dev1', 9)
  b.addThread(
    t2,
    'u_dev1',
    turns(t2.assistantId, '설계', t2.title, 'FDS 작성 도우미', ['시작', '주 입력 URS 기준으로 FDS 초안 만들어줘']),
    8,
  )
  const fds = b.addFile(t2, 'FDS_알람필터.md', FDS_DOC, { output: true, by: 'u_dev1', daysAgo: 6 })
  // URS가 나중에 v2로 갱신됐지만 FDS 대화의 선택 입력은 v1 그대로 (자동 교체 없음)
  b.addFile(t1, 'URS_알람필터.md', URS_DOC_V2, { output: true, by: 'u_dev4', daysAgo: 3, previous: ursV1 })

  const t3 = b.addTask({
    id: 'task_seed_0003',
    code: 'WK-2026-0003',
    assistantId: 'fds-reviewer',
    title: '알람 필터 FDS 리뷰',
    summary: 'FDS와 URS 추적성·GxP 항목 검토',
    status: 'in_progress',
    ownerId: 'u_dev1',
    assigneeIds: ['u_dev1', 'u_so'],
    priority: 'normal',
    createdDaysAgo: 5,
    startedDaysAgo: 5,
    tags: [SR2, 'fds-review'],
  })
  b.select(t3, fds, 'main', 'u_dev1', 5)
  b.select(t3, ursV1, 'reference', 'u_dev1', 5)
  b.addThread(t3, 'u_dev1', turns(t3.assistantId, '설계', t3.title, 'FDS 리뷰 도우미', ['FDS 리뷰해줘. 주 입력은 FDS, URS는 참고']), 4)

  const t4 = b.addTask({
    id: 'task_seed_0004',
    code: 'WK-2026-0004',
    assistantId: 'test-scenario-writer',
    title: '알람 필터 테스트 시나리오',
    summary: 'FDS 확정 후 시나리오 작성 예정',
    status: 'todo',
    ownerId: 'u_dev3',
    assigneeIds: ['u_dev3'],
    priority: 'normal',
    createdDaysAgo: 2,
    dueDaysFromNow: 10,
    tags: [SR2],
  })
  b.addThread(t4, 'u_dev3', [], 2)

  // ── CC-2026-014 체인: Deviation → Change Control → CC Item → Release CCA
  const t5 = b.addTask({
    id: 'task_seed_0005',
    code: 'WK-2026-0005',
    assistantId: 'deviation-drafter',
    title: '포장 2라인 라벨 불일치 일탈 초안',
    summary: '로트 번호 불일치 일탈 보고서 초안',
    status: 'done',
    ownerId: 'u_dev2',
    assigneeIds: ['u_dev2'],
    priority: 'urgent',
    createdDaysAgo: 25,
    startedDaysAgo: 25,
    completedDaysAgo: 22,
    tags: ['라벨-불일치'],
  })
  b.addThread(t5, 'u_dev2', turns(t5.assistantId, 'Deviation', t5.title, 'Deviation 초안 도우미', ['시작', '포장 2라인 로트 24B117 라벨 번호 불일치 건이야']), 25)
  const dev = b.addFile(t5, 'Deviation_라벨불일치.md', DEV_DOC, { output: true, by: 'u_dev2', daysAgo: 23 })

  const t6 = b.addTask({
    id: 'task_seed_0006',
    code: 'WK-2026-0006',
    assistantId: 'cc-writer',
    title: 'EBR 서명 단계 추가 CC 작성',
    summary: '일탈 CAPA 후속 변경 관리',
    status: 'done',
    ownerId: 'u_dev1',
    assigneeIds: ['u_dev1'],
    priority: 'high',
    createdDaysAgo: 20,
    startedDaysAgo: 20,
    completedDaysAgo: 16,
    tags: ['라벨-불일치', 'CC-2026-014'],
  })
  b.select(t6, dev, 'main', 'u_dev1', 20)
  b.addThread(t6, 'u_dev1', turns(t6.assistantId, 'Change Control(CC)', t6.title, 'Change Control 작성 도우미', ['시작', '일탈 CAPA로 EBR 서명 단계를 추가하는 CC 초안']), 19)
  const cc = b.addFile(t6, 'CC-2026-014_초안.md', CC_DOC, { output: true, by: 'u_dev1', daysAgo: 17 })

  const t7 = b.addTask({
    id: 'task_seed_0007',
    code: 'WK-2026-0007',
    assistantId: 'cc-item-builder',
    title: 'CC-2026-014 Item 분해',
    summary: 'CC를 부서별 실행 항목으로 분해',
    status: 'in_progress',
    ownerId: 'u_dev1',
    assigneeIds: ['u_dev1', 'u_so'],
    priority: 'normal',
    createdDaysAgo: 15,
    startedDaysAgo: 15,
    dueDaysFromNow: 5,
    tags: ['CC-2026-014'],
  })
  b.select(t7, cc, 'main', 'u_dev1', 15)
  b.addThread(t7, 'u_dev1', turns(t7.assistantId, 'Change Control(CC) Item', t7.title, 'CC Item 분해 도우미', ['CC 초안을 부서별 Item으로 나눠줘']), 14)
  const ccItem = b.addFile(t7, 'CC-2026-014_Items.md', CC_ITEM_DOC, { output: true, by: 'u_dev1', daysAgo: 12 })

  const t8 = b.addTask({
    id: 'task_seed_0008',
    code: 'WK-2026-0008',
    assistantId: 'release-cca-writer',
    title: '10월 릴리스 CCA 항목 준비',
    summary: 'CC Item 1번을 10월 릴리스 CCA로 작성',
    status: 'on_hold',
    ownerId: 'u_dev3',
    assigneeIds: ['u_dev3'],
    priority: 'normal',
    createdDaysAgo: 8,
    startedDaysAgo: 8,
    tags: ['CC-2026-014', 'release-2026-10'],
  })
  b.select(t8, ccItem, 'main', 'u_dev3', 8)
  b.addThread(t8, 'u_dev3', turns(t8.assistantId, 'Change Control Action(CCA) Item', t8.title, 'Release CCA 작성 도우미', ['Item 1번으로 릴리스 CCA 작성']), 8)
  b.addFile(t8, 'CCA_Release-2026-10_Item1.md', '# Release CCA — Item 1\n\n- 대상: EBR 템플릿 서명 단계 추가\n- 배포 창: 2026-10 정기 릴리스\n- 선행: SOP 개정 완료\n', {
    output: true,
    by: 'u_dev3',
    daysAgo: 7,
  })
  b.addNote(t8, 'u_dev3', 'SOP 개정 일정 확정 전까지 보류', 6)

  // release-2026-10 태그만 공유 → t8의 자료는 보이지만 CC 초안(t6)은 보이지 않는다 (간접 확산 없음)
  const t9 = b.addTask({
    id: 'task_seed_0009',
    code: 'WK-2026-0009',
    assistantId: 'cca-writer',
    title: '10월 릴리스 배포 CCA',
    summary: '릴리스 대상 변경 묶음의 CCA 작성',
    status: 'in_progress',
    ownerId: 'u_dev3',
    assigneeIds: ['u_dev3'],
    priority: 'high',
    createdDaysAgo: 4,
    startedDaysAgo: 4,
    dueDaysFromNow: 7,
    tags: ['release-2026-10'],
  })
  b.addThread(t9, 'u_dev3', turns(t9.assistantId, '배포', t9.title, 'CCA 문구 도우미', ['시작', '10월 릴리스 CCA 작성하자']), 4)

  // ── SR-2026-0003: 3라인 신규 장비
  const SR3 = 'SR-2026-0003'
  const t10 = b.addTask({
    id: 'task_seed_0010',
    code: 'WK-2026-0010',
    assistantId: 'urs-analyst-basic',
    title: '3라인 신규 장비 마스터 URS',
    summary: '신규 장비 12대 마스터 등록 요구사항',
    status: 'in_progress',
    ownerId: 'u_dev1',
    assigneeIds: ['u_dev1', 'u_dev2'],
    priority: 'urgent',
    createdDaysAgo: 5,
    startedDaysAgo: 5,
    dueDaysFromNow: 7,
    tags: [SR3],
  })
  b.addThread(t10, 'u_dev1', turns(t10.assistantId, '분석', t10.title, 'URS 분석 도우미 (기본)', ['시작', '3라인 신규 장비 12대 마스터 등록 요구사항 정리']), 5)

  const t11 = b.addTask({
    id: 'task_seed_0011',
    code: 'WK-2026-0011',
    assistantId: 'deploy-verifier',
    title: '9월 배포분 FDS–DB 정합성 비교',
    summary: '배포 전 FDS 정의와 DB 스키마 차이 확인',
    status: 'done',
    ownerId: 'u_dev3',
    assigneeIds: ['u_dev3'],
    priority: 'normal',
    createdDaysAgo: 18,
    startedDaysAgo: 18,
    completedDaysAgo: 15,
    tags: [],
  })
  b.addThread(t11, 'u_dev3', turns(t11.assistantId, '배포', t11.title, '배포 검증 도우미', ['9월 배포분 FDS와 DB 비교해줘']), 18)

  // ── SR (접수 에이전트 = URS 분석 도우미)
  b.addSr({
    id: 'sr_seed_draft',
    code: '',
    requesterId: 'u_req',
    title: '',
    body: '',
    status: 'draft',
    createdDaysAgo: 0,
    turns: [
      '포장 라인 화면에서 작업 지시서 번호를 바코드로 바로 찍고 싶어요',
      '요청 잘 들었습니다. 먼저 **배경**을 알려주세요. 현재 어떤 화면/절차에서 불편하거나 문제가 생기나요?',
      '지금은 번호를 수기로 입력해서 오타가 잦아요',
      '감사합니다. 다음으로 **원하는 결과**를 한 문장으로 말씀해 주세요.',
    ],
  })
  b.addSr({
    id: 'sr_seed_0001',
    code: 'SR-2026-0001',
    requesterId: 'u_req',
    title: '포장 라인 화면 폰트 확대',
    body: '## 요청 내용\n- 포장 라인 터치 화면 글자가 작아 장갑 낀 상태에서 오조작 발생\n\n## 원하는 결과\n- 주요 버튼/로트 번호 폰트 1.5배\n\n## 희망 기한\n- 10월 초',
    status: 'submitted',
    createdDaysAgo: 2,
    turns: ['포장 라인 화면 글자가 너무 작아요', '요청 잘 들었습니다. 먼저 **배경**을 알려주세요.', '장갑 끼고 누르면 오조작이 나요', '감사합니다. **원하는 결과**를 한 문장으로 말씀해 주세요.'],
  })
  b.addSr({
    id: 'sr_seed_0002',
    code: SR2,
    requesterId: 'u_req',
    title: '알람 목록 장비별 필터 추가',
    body: '## 요청 내용\n- 알람 목록이 너무 많아 특정 장비 알람을 찾기 어려움\n\n## 원하는 결과\n- 장비/클래스별 필터\n\n## 희망 기한\n- 없음',
    status: 'in_progress',
    createdDaysAgo: 13,
    turns: ['알람 목록에 장비별 필터가 필요해요', '요청 잘 들었습니다. **배경**을 알려주세요.', '알람이 하루 수백 건이라 찾기 힘들어요', '감사합니다. **원하는 결과**를 말씀해 주세요.'],
    followUps: [t1, t2, t3, t4],
  })
  b.addSr({
    id: 'sr_seed_0003',
    code: SR3,
    requesterId: 'u_dev2',
    title: '3라인 신규 장비 마스터 등록',
    body: '## 요청 내용\n- 3라인 신규 장비 12대 마스터 등록\n\n## 희망 기한\n- 9/30 (라인 가동 전)',
    status: 'in_progress',
    createdDaysAgo: 6,
    turns: ['3라인 신규 장비 12대 마스터 등록 요청드립니다', '요청 잘 들었습니다. **희망 기한**이 있나요?', '9월 30일 라인 가동 전에요'],
    followUps: [t10],
  })
  b.addSr({
    id: 'sr_seed_0004',
    code: 'SR-2026-0004',
    requesterId: 'u_req',
    title: '로그인 세션 시간 연장',
    body: '## 요청 내용\n- 세션 15분 만료가 너무 짧음\n\n## 원하는 결과\n- 30분으로 연장',
    status: 'done',
    createdDaysAgo: 20,
    turns: ['로그인 세션이 너무 빨리 끊겨요', '요청 잘 들었습니다. **원하는 결과**를 말씀해 주세요.', '30분으로 늘려주세요'],
    results: [{ id: 'shr_seed_0001', text: '세션 만료를 30분으로 늘렸습니다. 9/10 배포분에 반영되었으니 확인 부탁드립니다.', fileIds: [], by: 'u_so', at: b.daysAgo(12) }],
  })
  b.addSr({
    id: 'sr_seed_0005',
    code: 'SR-2026-0005',
    requesterId: 'u_dev1',
    title: '개인 대시보드 요청',
    body: '## 요청 내용\n- 내 업무만 모아 보는 대시보드',
    status: 'rejected',
    createdDaysAgo: 12,
    turns: ['제 업무만 보이는 대시보드가 있으면 좋겠어요', '요청 잘 들었습니다. **배경**을 알려주세요.'],
  })

  // ── 알림 (한지수 기준 미읽음 2, 읽음 1)
  b.notify('u_so', '대화에 참여자로 추가되었습니다', `${t3.code} ${t3.title}`, `/c/${t3.id}`, 5, true)
  b.notify('u_so', 'SR이 접수되었습니다', 'SR-2026-0001 포장 라인 화면 폰트 확대', '/sr/manage', 2)
  b.notify('u_so', '대화에 참여자로 추가되었습니다', `${t7.code} ${t7.title}`, `/c/${t7.id}`, 4)
  b.notify('u_req', "SR 상태가 '진행 중'(으)로 바뀌었습니다", 'SR-2026-0002 알람 목록 장비별 필터 추가', '/sr', 2)

  return b.bundle
}
