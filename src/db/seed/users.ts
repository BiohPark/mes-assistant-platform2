import type { User } from '@/domain/types'

// 시드 사용자. 최민호는 가상 인물. 실제 도입 시에는 사내 계정 연동으로 대체한다.
// System Owner(편집 모드·SR 제목 수정 등)는 여러 명일 수 있다.
export const SEED_USERS: User[] = [
  { id: 'u_so', name: '박비오', role: 'MES System Owner', initials: '박', color: '#2563eb', isSystemOwner: true },
  { id: 'u_dev1', name: '김해윤', role: 'MES 개발 · System Owner', initials: '해', color: '#7c3aed', isSystemOwner: true },
  { id: 'u_dev2', name: '김남우', role: 'MES 개발 · System Owner', initials: '남', color: '#d97706', isSystemOwner: true },
  { id: 'u_dev3', name: '이희준', role: 'MES 개발 · System Owner', initials: '희', color: '#059669', isSystemOwner: true },
  { id: 'u_dev4', name: '최민호', role: 'MES 개발', initials: '민', color: '#0891b2' },
  { id: 'u_req', name: '노기현', role: '현업 요청자 · System Owner', initials: '노', color: '#dc2626', isSystemOwner: true },
]
