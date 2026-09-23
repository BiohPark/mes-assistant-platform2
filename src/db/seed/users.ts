import type { User } from '@/domain/types'

// 가상 인물. 실제 도입 시에는 사내 계정 연동으로 대체한다.
export const SEED_USERS: User[] = [
  { id: 'u_so', name: '한지수', role: 'MES System Owner', initials: '지', color: '#2563eb', isSystemOwner: true },
  { id: 'u_dev1', name: '김도현', role: 'MES 개발', initials: '도', color: '#7c3aed' },
  { id: 'u_dev2', name: '이서준', role: 'MES 개발', initials: '서', color: '#d97706' },
  { id: 'u_dev3', name: '박하은', role: 'MES 개발', initials: '하', color: '#059669' },
  { id: 'u_dev4', name: '최민호', role: 'MES 개발', initials: '민', color: '#0891b2' },
  { id: 'u_req', name: '정유진', role: '현업 요청자', initials: '유', color: '#dc2626' },
]
