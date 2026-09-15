import type { User } from '@/domain/types'

export const SEED_USERS: User[] = [
  { id: 'u_park', name: '박비오', role: 'MES 개발 PL', initials: '박', color: '#2563eb' },
  { id: 'u_kimhy', name: '김해윤', role: 'MES 개발', initials: '김', color: '#7c3aed' },
  { id: 'u_noh', name: '노기현', role: 'CSV / QA', initials: '노', color: '#dc2626' },
  { id: 'u_lee', name: '이희준', role: '생산 비즈니스 오너', initials: '이', color: '#059669' },
  { id: 'u_kimnw', name: '김남우', role: 'MES 개발', initials: '김', color: '#d97706' },
]
