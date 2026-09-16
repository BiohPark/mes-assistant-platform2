import { describe, it, expect } from 'vitest'
import { threadParticipants, toChatMessages } from './context'
import type { Message } from '@/domain/types'

const users = new Map([
  ['u1', { name: '박비오', role: 'MES 개발 PL' }],
  ['u2', { name: '이희준', role: '생산 비즈니스 오너' }],
])
const msg = (id: string, role: Message['role'], content: string, authorId?: string): Message => ({
  id,
  threadId: 't',
  role,
  content,
  authorId,
  createdAt: '',
  attachmentIds: [],
  status: 'done',
})

describe('multi-participant chat messages', () => {
  it('does not tag speakers when a single user is in the thread', () => {
    const out = toChatMessages('sys', [msg('1', 'user', '안녕', 'u1'), msg('2', 'assistant', '네')], users)
    expect(out[1].content).toBe('안녕')
  })

  it('prefixes user messages with speaker names when 2+ users participate', () => {
    const history = [msg('1', 'user', 'URS 잡아줘', 'u1'), msg('2', 'assistant', '확인 질문'), msg('3', 'user', '72시간입니다', 'u2')]
    expect(threadParticipants(history, users).map((p) => p.name)).toEqual(['박비오', '이희준'])
    const out = toChatMessages('sys', history, users)
    expect(out[1].content).toBe('[박비오] URS 잡아줘')
    expect(out[3].content).toBe('[이희준] 72시간입니다')
    expect(out[2].content).toBe('확인 질문')
  })

  it('skips streaming/error messages', () => {
    const out = toChatMessages('sys', [{ ...msg('1', 'user', 'x', 'u1'), status: 'streaming' }], users)
    expect(out).toHaveLength(1)
  })
})
