import { SeedBuilder, type SeedBundle } from './builder'
import { SEED_TEMPLATES, TPL_HOTFIX, TPL_MASTER, TPL_STANDARD } from './templates'

const tpl = (id: string) => SEED_TEMPLATES.find((t) => t.id === id)!

const URS_0031 = `# URS — Bioreactor 장비 상태 전환 로직 개선

## 1. 배경
현행 Syncade ET에서 Bioreactor(BR-201~BR-208)의 상태는 \`Dirty → Clean → Ready\` 순으로 수동 전환된다.
CIP 완료 후 운전자가 Clean 전환을 누락하는 사례가 월 3~4건 발생하여 Batch 시작이 지연된다.

## 2. 요구사항
| ID | 요구사항 | 우선순위 | GxP |
|---|---|---|---|
| URS-01 | CIP 레시피 완료 신호 수신 시 장비 상태를 자동으로 Clean으로 전환한다 | High | Yes |
| URS-02 | Clean Hold Time(72h) 초과 시 Ready 전환을 차단하고 알람을 표시한다 | High | Yes |
| URS-03 | 자동 전환 이력은 Equipment Log에 사용자 "SYSTEM"으로 기록한다 | Medium | Yes |
| URS-04 | 운전자가 수동으로 상태를 되돌릴 수 있어야 하며 사유 입력을 필수로 한다 | Medium | Yes |

## 3. 제외 범위
- SIP 프로세스 연동 (별도 CR)
`

const FDS_0031_DRAFT = `# FDS 초안 — Bioreactor 상태 전환 자동화

## 기능 목록
- FDS-01 (URS-01): CIP 레시피 Phase "Final Rinse Complete" 이벤트 구독 → EquipmentStatusService.transition(equipmentId, "Clean")
- FDS-02 (URS-02): Ready 전환 시 lastCleanedAt + 72h < now 이면 차단, Alarm "CHT-EXCEEDED" 발생
- FDS-03 (URS-03): 상태 전환 로그에 actor = SYSTEM, reason = "CIP_AUTO"

## 데이터 모델 변경
- EQUIPMENT_STATUS_LOG: 컬럼 추가 \`TRANSITION_SOURCE VARCHAR2(20)\` (MANUAL / CIP_AUTO)
`

const TEST_0028 = `# 테스트 케이스 — Clean Hold Time 초과 알람

| TC | 사전조건 | 절차 | 예상결과 |
|---|---|---|---|
| TC-01 | BR-203 Clean, lastCleanedAt = now-71h | Ready 전환 | 전환 성공, 알람 없음 |
| TC-02 | BR-203 Clean, lastCleanedAt = now-73h | Ready 전환 | 전환 차단, 알람 CHT-EXCEEDED |
| TC-03 | TC-02 이후 | 알람 Acknowledge | 알람 목록에서 제거, 이력 기록 |
`

const DEPLOY_0019 = `# 배포 검증 결과서 — Buffer Tank 마스터 등록

검증 SQL:
\`\`\`sql
SELECT EQUIPMENT_ID, EQUIPMENT_NAME, CLASS, STATUS
FROM ET_EQUIPMENT
WHERE EQUIPMENT_ID BETWEEN 'BT-410' AND 'BT-415';
\`\`\`

결과: 6건 조회, 정의서와 100% 일치 (검증자: 노기현)
`

export function buildSeedTasks(now: Date): SeedBundle {
  const b = new SeedBuilder(now)
  const std = tpl(TPL_STANDARD)
  const hotfix = tpl(TPL_HOTFIX)
  const master = tpl(TPL_MASTER)

  // 1. FDS 진행 중 — 핵심 시연 업무
  {
    const { task, steps } = b.addTask({
      id: 'task_0031',
      code: 'ET-2026-0031',
      title: 'Bioreactor 장비 상태 전환 로직 개선 (CIP 완료 → Clean 자동 전환)',
      summary: 'CIP 완료 시 Bioreactor 상태를 자동으로 Clean으로 전환하고 Clean Hold Time 초과 시 Ready 전환을 차단한다.',
      template: std,
      ownerId: 'u_park',
      assigneeIds: ['u_park', 'u_kimhy', 'u_lee'],
      priority: 'high',
      dueDaysFromNow: 21,
      createdDaysAgo: 9,
      externalId: 'CR-2026-1187',
      tags: ['Bioreactor', 'CIP', '상태전환'],
      steps: [
        { status: 'done', startedDaysAgo: 9, completedDaysAgo: 4, by: 'u_park', feedback: { rating: 4, comment: 'GxP 영향 평가 항목을 먼저 물어봐 주면 좋겠음', by: 'u_park' } },
        { status: 'in_progress', startedDaysAgo: 4, checked: 1, by: 'u_kimhy' },
      ],
    })
    const [urs, fds] = steps
    const cr = b.addFile(task.id, urs, 'CR-2026-1187_변경요청서.md', '# 변경 요청서\n요청자: 이희준(생산1팀)\n\nCIP 완료 후 Clean 전환 누락으로 Batch 지연 발생. 자동 전환 요청.', { by: 'u_lee', at: b.daysAgo(9, 1) })
    b.setInputs(urs, [cr.id])
    const ursThread = b.addThread(urs, 'u_park', b.daysAgo(8))
    b.addMessages(ursThread, [
      { role: 'user', by: 'u_park', content: '첨부한 변경 요청서 기준으로 URS 초안을 잡아줘. 비즈니스 오너는 이희준 님이야.', at: b.daysAgo(8) },
      { role: 'assistant', content: '변경 요청서를 확인했습니다. URS 작성 전에 몇 가지 확인이 필요합니다.\n\n1. CIP 완료 신호는 Syncade Recipe Phase 이벤트인가요, 아니면 PLC 태그인가요?\n2. Clean Hold Time 기준값(시간)과 초과 시 동작(차단/경고)을 확정해 주세요.\n3. 자동 전환 이력의 actor 표기는 SYSTEM으로 할까요?', at: b.daysAgo(8, -0.1) },
      { role: 'user', by: 'u_lee', content: '1. Recipe Phase "Final Rinse Complete" 이벤트입니다. 2. 72시간, 초과 시 Ready 전환 차단 + 알람. 3. 네 SYSTEM으로요.', at: b.daysAgo(7) },
      { role: 'assistant', content: '확인했습니다. 답변을 반영해 URS 초안을 작성했습니다. 요구사항 4건(URS-01~04)으로 정리했고, 모두 GxP 영향 "Yes"로 분류했습니다. 산출물로 저장 후 FDS 단계로 넘기시면 됩니다.\n\n' + URS_0031, at: b.daysAgo(7, -0.2) },
    ])
    const ursDoc = b.addFile(task.id, urs, 'URS_ET-2026-0031_v1.md', URS_0031, { by: 'u_park', at: b.daysAgo(5), asOutput: true })
    b.addNote(task.id, urs.id, 'u_lee', 'URS-04 수동 되돌리기 사유는 드롭다운(고정 사유) + 자유 입력 병행 희망.', b.daysAgo(5, 2))
    b.setInputs(fds, [ursDoc.id])
    const fdsThread = b.addThread(fds, 'u_kimhy', b.daysAgo(3))
    b.addMessages(fdsThread, [
      { role: 'user', by: 'u_kimhy', content: 'URS v1 기준으로 FDS 기능 목록과 데이터 모델 변경안을 먼저 뽑아줘.', at: b.daysAgo(3) },
      { role: 'assistant', content: 'URS 4건을 기능 3건으로 매핑했습니다. URS-04(수동 되돌리기)는 기존 기능 재사용이라 별도 FDS 항목 없이 추적성 매트릭스에 "기존 기능"으로 표기하겠습니다.\n\n' + FDS_0031_DRAFT, at: b.daysAgo(3, -0.1) },
      { role: 'user', by: 'u_kimhy', content: 'EBR 인터페이스 영향은? Batch 시작 시 장비 상태 조회하는 부분.', at: b.daysAgo(1) },
      { role: 'assistant', content: 'EBR은 Batch 시작 시 `GET /equipment/{id}/status`로 상태를 조회합니다. 상태값 집합(Dirty/Clean/Ready)은 변하지 않으므로 인터페이스 스펙 변경은 없습니다. 다만 TRANSITION_SOURCE 컬럼 추가로 EBR 쪽 리포트 뷰(V_EQUIP_STATUS_HIST)가 컬럼 목록을 명시하지 않는다면 영향이 있을 수 있어 확인을 권장합니다.', at: b.daysAgo(1, -0.1) },
    ])
    b.addNote(task.id, fds.id, 'u_kimhy', 'V_EQUIP_STATUS_HIST 뷰 정의 확인 필요 → 김남우 님께 요청.', b.daysAgo(1, -1))
  }

  // 2. TEST 진행 중
  {
    const { task, steps } = b.addTask({
      id: 'task_0028',
      code: 'ET-2026-0028',
      title: 'Clean Hold Time 초과 알람 기능 추가',
      summary: 'Clean 상태 장비의 Hold Time 초과를 감지해 알람을 발생시키고 Ready 전환을 차단한다.',
      template: std,
      ownerId: 'u_kimhy',
      assigneeIds: ['u_kimhy', 'u_noh'],
      priority: 'normal',
      dueDaysFromNow: 10,
      createdDaysAgo: 30,
      externalId: 'CR-2026-1142',
      tags: ['알람', 'Hold Time'],
      steps: [
        { status: 'done', startedDaysAgo: 30, completedDaysAgo: 24, by: 'u_kimhy' },
        { status: 'done', startedDaysAgo: 24, completedDaysAgo: 18, by: 'u_kimhy' },
        { status: 'done', startedDaysAgo: 18, completedDaysAgo: 6, by: 'u_kimnw' },
        { status: 'in_progress', startedDaysAgo: 6, checked: 1, by: 'u_noh' },
      ],
    })
    const test = steps[3]
    b.addFile(task.id, steps[2], '개발완료보고_0028.md', '# 개발 완료 보고\n- 알람 코드 CHT-EXCEEDED 추가\n- Ready 전환 가드 구현\n- 코드 리뷰: 박비오 (승인)', { by: 'u_kimnw', at: b.daysAgo(6), asOutput: true })
    const tc = b.addFile(task.id, test, 'TestCases_0028_v1.md', TEST_0028, { by: 'u_noh', at: b.daysAgo(4), asOutput: true })
    void tc
    const thread = b.addThread(test, 'u_noh', b.daysAgo(5))
    b.addMessages(thread, [
      { role: 'user', by: 'u_noh', content: 'FDS 항목별로 테스트 케이스를 생성해줘. 경계값(72h) 케이스 포함.', at: b.daysAgo(5) },
      { role: 'assistant', content: '경계값 71h/73h를 포함한 테스트 케이스 3건을 작성했습니다.\n\n' + TEST_0028, at: b.daysAgo(5, -0.1) },
    ])
  }

  // 3. URS 진행 중 — 방금 시작
  b.addTask({
    id: 'task_0035',
    code: 'ET-2026-0035',
    title: 'Equipment Log 조회 화면 필터 추가 (장비 클래스·기간·사용자)',
    summary: '감사 대응 시 Equipment Log를 빠르게 조회할 수 있도록 다중 필터를 추가한다.',
    template: std,
    ownerId: 'u_kimnw',
    assigneeIds: ['u_kimnw', 'u_lee'],
    priority: 'normal',
    dueDaysFromNow: 40,
    createdDaysAgo: 1,
    externalId: 'CR-2026-1203',
    tags: ['조회', 'Audit'],
    steps: [{ status: 'in_progress', startedDaysAgo: 1 }],
  })

  // 4. PROTOCOL 진행 중, TEST에서 되돌리기 이력
  {
    const { task, steps } = b.addTask({
      id: 'task_0022',
      code: 'ET-2026-0022',
      title: '배양기 CIP/SIP 이력 리포트',
      summary: '장비별 CIP/SIP 수행 이력을 기간 조회하고 PDF로 출력한다.',
      template: std,
      ownerId: 'u_park',
      assigneeIds: ['u_park', 'u_noh'],
      priority: 'normal',
      dueDaysFromNow: -2,
      createdDaysAgo: 45,
      externalId: 'CR-2026-1098',
      tags: ['리포트'],
      steps: [
        { status: 'done', startedDaysAgo: 45, completedDaysAgo: 40, by: 'u_park' },
        { status: 'done', startedDaysAgo: 40, completedDaysAgo: 33, by: 'u_park' },
        { status: 'done', startedDaysAgo: 33, completedDaysAgo: 20, by: 'u_kimhy' },
        { status: 'done', startedDaysAgo: 20, completedDaysAgo: 3, by: 'u_noh' },
        { status: 'in_progress', startedDaysAgo: 3, checked: 1, by: 'u_noh' },
      ],
    })
    // 되돌리기 이력: 테스트 중 결함 → 개발 단계 재오픈
    b.log('u_noh', task.id, 'step.reopened', { stepName: steps[2].name, reason: 'PDF 한글 폰트 깨짐 결함' }, steps[2].id, b.daysAgo(12))
    b.log('u_kimhy', task.id, 'step.completed', { stepName: steps[2].name }, steps[2].id, b.daysAgo(9))
    b.addNote(task.id, steps[3].id, 'u_noh', '결함 D-01: PDF 한글 폰트 깨짐 → 개발 재오픈 후 조치 완료, 재테스트 통과.', b.daysAgo(8))
    b.addFile(task.id, steps[3], 'TestResult_0022_v2.md', '# 테스트 결과서 v2\n전체 12 케이스 통과 (재테스트 포함)', { by: 'u_noh', at: b.daysAgo(3, 1), asOutput: true })
  }

  // 5. 장비 마스터 — DEPLOY 진행 중
  {
    const { task, steps } = b.addTask({
      id: 'task_0019',
      code: 'ET-2026-0019',
      title: 'Buffer Tank 마스터 신규 등록 (BT-410 ~ BT-415)',
      summary: '신규 Buffer Tank 6기 장비 마스터 등록 및 상태 모델 매핑.',
      template: master,
      ownerId: 'u_kimhy',
      assigneeIds: ['u_kimhy', 'u_noh'],
      priority: 'high',
      dueDaysFromNow: 2,
      createdDaysAgo: 20,
      externalId: 'CR-2026-1120',
      tags: ['마스터', 'Buffer Tank'],
      steps: [
        { status: 'done', startedDaysAgo: 20, completedDaysAgo: 18, by: 'u_kimhy' },
        { status: 'done', startedDaysAgo: 18, completedDaysAgo: 14, by: 'u_kimhy' },
        { status: 'done', startedDaysAgo: 14, completedDaysAgo: 8, by: 'u_kimhy' },
        { status: 'done', startedDaysAgo: 8, completedDaysAgo: 2, by: 'u_noh' },
        { status: 'in_progress', startedDaysAgo: 2, checked: 0, by: 'u_noh' },
      ],
    })
    const deploy = steps[4]
    const thread = b.addThread(deploy, 'u_noh', b.daysAgo(1))
    b.addMessages(thread, [
      { role: 'user', by: 'u_noh', content: 'BT-410~415 운영 반영 검증 SQL 만들어줘. 정의서 기준 컬럼 비교까지.', at: b.daysAgo(1) },
      { role: 'assistant', content: '운영 DB 검증용 SQL과 대조 체크리스트를 작성했습니다.\n\n' + DEPLOY_0019, at: b.daysAgo(1, -0.1) },
    ])
    b.addFile(task.id, deploy, '배포검증결과서_0019_draft.md', DEPLOY_0019, { by: 'u_noh', at: b.daysAgo(0, 5), asOutput: true })
  }

  // 6. Hotfix — DEV(manual) 진행 중
  {
    const { task, steps } = b.addTask({
      id: 'task_0037',
      code: 'ET-2026-0037',
      title: '[Hotfix] 장비 상태 변경 시 Batch 연동 오류 (EBR timeout)',
      summary: '운영에서 장비 상태 변경 시 EBR 연동 timeout으로 Batch 시작 실패. 긴급 조치.',
      template: hotfix,
      ownerId: 'u_park',
      assigneeIds: ['u_park', 'u_kimnw'],
      priority: 'urgent',
      dueDaysFromNow: 1,
      createdDaysAgo: 2,
      externalId: 'INC-2026-0442',
      tags: ['장애', 'EBR'],
      steps: [
        { status: 'done', startedDaysAgo: 2, completedDaysAgo: 1, by: 'u_park' },
        { status: 'in_progress', startedDaysAgo: 1, checked: 1, by: 'u_kimnw' },
      ],
    })
    b.addFile(task.id, steps[0], '원인분석서_INC-0442.md', '# 원인 분석\nEBR 상태 조회 API 응답 지연(>30s). 원인: 상태 이력 테이블 인덱스 누락으로 Full Scan.', { by: 'u_park', at: b.daysAgo(1, 2), asOutput: true })
    b.addNote(task.id, steps[1].id, 'u_kimnw', '인덱스 IX_EQUIP_STATUS_LOG_01 생성 스크립트 준비. 운영 DBA 승인 대기.', b.minutesAgo(90))
  }

  // 7. 완료 업무
  b.addTask({
    id: 'task_0012',
    code: 'ET-2026-0012',
    title: 'Autoclave 사용 이력 EBR 연동',
    summary: 'Autoclave 사용 이력을 EBR 배치 기록에 자동 첨부한다.',
    template: std,
    status: 'done',
    ownerId: 'u_kimhy',
    assigneeIds: ['u_kimhy', 'u_noh', 'u_lee'],
    priority: 'normal',
    createdDaysAgo: 90,
    externalId: 'CR-2026-0988',
    tags: ['EBR', 'Autoclave'],
    steps: [
      { status: 'done', startedDaysAgo: 90, completedDaysAgo: 84, by: 'u_kimhy', feedback: { rating: 5, comment: '인터뷰 질문 목록이 유용했음', by: 'u_kimhy' } },
      { status: 'done', startedDaysAgo: 84, completedDaysAgo: 75, by: 'u_kimhy', feedback: { rating: 3, comment: '추적성 매트릭스 형식이 사내 양식과 달라 수정 필요', by: 'u_kimhy' } },
      { status: 'done', startedDaysAgo: 75, completedDaysAgo: 50, by: 'u_kimnw' },
      { status: 'done', startedDaysAgo: 50, completedDaysAgo: 40, by: 'u_noh' },
      { status: 'done', startedDaysAgo: 40, completedDaysAgo: 33, by: 'u_noh' },
      { status: 'done', startedDaysAgo: 33, completedDaysAgo: 30, by: 'u_kimhy' },
    ],
    currentIndex: 5,
  })

  // 8. 완료 업무 (PROTOCOL 건너뜀)
  {
    const { task, steps } = b.addTask({
      id: 'task_0015',
      code: 'ET-2026-0015',
      title: 'Equipment Calibration 만료 사전 알림',
      summary: '교정 만료 14일 전 담당자에게 알림 메일 발송.',
      template: std,
      status: 'done',
      ownerId: 'u_kimnw',
      assigneeIds: ['u_kimnw'],
      priority: 'low',
      createdDaysAgo: 70,
      externalId: 'CR-2026-1020',
      tags: ['알림', 'Calibration'],
      steps: [
        { status: 'done', startedDaysAgo: 70, completedDaysAgo: 66, by: 'u_kimnw' },
        { status: 'done', startedDaysAgo: 66, completedDaysAgo: 60, by: 'u_kimnw' },
        { status: 'done', startedDaysAgo: 60, completedDaysAgo: 45, by: 'u_kimnw' },
        { status: 'done', startedDaysAgo: 45, completedDaysAgo: 8, by: 'u_kimnw' },
        { status: 'skipped', completedDaysAgo: 8, by: 'u_noh' },
        { status: 'done', startedDaysAgo: 8, completedDaysAgo: 3, by: 'u_kimnw' },
      ],
      currentIndex: 5,
    })
    b.addNote(task.id, steps[4].id, 'u_noh', 'Non-GxP(알림 메일)로 분류되어 프로토콜 검증 생략. QA 확인: 노기현.', b.daysAgo(8))
  }

  // 9. 보류
  b.addTask({
    id: 'task_0033',
    code: 'ET-2026-0033',
    title: 'Portable 장비 위치 추적 기능',
    summary: '이동식 장비(Portable Tank 등)의 현재 위치(Room)를 추적한다.',
    template: std,
    status: 'on_hold',
    ownerId: 'u_park',
    assigneeIds: ['u_park', 'u_lee'],
    priority: 'low',
    createdDaysAgo: 15,
    externalId: 'CR-2026-1175',
    tags: ['Portable'],
    steps: [{ status: 'in_progress', startedDaysAgo: 15, checked: 1 }],
  })

  // 10. DEV(manual) 진행 중 — 표준 템플릿
  {
    const { task, steps } = b.addTask({
      id: 'task_0030',
      code: 'ET-2026-0030',
      title: 'Filter Integrity Test 결과 자동 등록',
      summary: 'FIT 장비 결과 파일을 파싱해 필터 장비 상태와 이력에 자동 등록한다.',
      template: std,
      ownerId: 'u_kimnw',
      assigneeIds: ['u_kimnw', 'u_kimhy'],
      priority: 'high',
      dueDaysFromNow: 14,
      createdDaysAgo: 25,
      externalId: 'CR-2026-1160',
      tags: ['FIT', '인터페이스'],
      steps: [
        { status: 'done', startedDaysAgo: 25, completedDaysAgo: 20, by: 'u_kimnw' },
        { status: 'done', startedDaysAgo: 20, completedDaysAgo: 12, by: 'u_kimnw' },
        { status: 'in_progress', startedDaysAgo: 12, checked: 1, by: 'u_kimnw' },
      ],
    })
    b.addNote(task.id, steps[2].id, 'u_kimnw', '파서 구현 완료. 결과 파일 인코딩(UTF-16) 이슈로 샘플 파일 추가 요청.', b.daysAgo(2))
    b.addFile(task.id, steps[2], 'FIT_sample_result.txt', 'Filter ID: F-1021\nTest: Bubble Point\nResult: PASS\nValue: 3.45 bar', { by: 'u_kimhy', at: b.daysAgo(1) })
  }

  // 11. 마스터 — FDS 진행 중
  b.addTask({
    id: 'task_0036',
    code: 'ET-2026-0036',
    title: 'Chromatography Column 마스터 속성 추가 (Resin Lot)',
    summary: 'Column 장비 마스터에 Resin Lot 속성을 추가하고 상태 모델을 갱신한다.',
    template: master,
    ownerId: 'u_kimhy',
    assigneeIds: ['u_kimhy', 'u_lee'],
    priority: 'normal',
    dueDaysFromNow: 12,
    createdDaysAgo: 4,
    externalId: 'CR-2026-1198',
    tags: ['마스터', 'Column'],
    steps: [
      { status: 'done', startedDaysAgo: 4, completedDaysAgo: 2, by: 'u_kimhy' },
      { status: 'in_progress', startedDaysAgo: 2, by: 'u_kimhy' },
    ],
  })

  return b.bundle
}
