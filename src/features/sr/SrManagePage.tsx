import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Inbox, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TopBar } from '@/app/TopBar'
import { useActor, useUserMap } from '@/app/hooks'
import { EmptyState } from '@/components/EmptyState'
import { SrStatusBadge } from '@/components/StatusBadges'
import { UserAvatar } from '@/components/UserAvatar'
import { db } from '@/db/schema'
import { setSrStatus } from '@/db/repositories/sr'
import { SR_STATUSES, type ServiceRequest, type SrStatus } from '@/domain/types'
import { SR_STATUS_LABEL } from '@/lib/labels'
import { formatDate } from '@/lib/dates'
import { SrDetailSheet } from './SrDetailSheet'
import { SrTabs } from './SrIntakePage'

const ALL = '__all__'
const MANAGED: SrStatus[] = SR_STATUSES.filter((s) => s !== 'draft')

export function SrManagePage() {
  const actor = useActor()
  const users = useUserMap()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(ALL)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    const [srs, tasks] = await Promise.all([db.serviceRequests.where('status').anyOf(MANAGED).toArray(), db.tasks.toArray()])
    const linkedCount = new Map<string, number>()
    // SR 연결 = 대화 태그에 SR 코드가 있음
    for (const t of tasks) for (const tag of t.tags) linkedCount.set(tag, (linkedCount.get(tag) ?? 0) + 1)
    return { srs, linkedCount }
  }, [])

  const rows = (data?.srs ?? [])
    .filter((s) => status === ALL || s.status === status)
    .filter((s) => !q || `${s.code} ${s.title} ${s.body}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt))
  const selected = selectedId ? data?.srs.find((s) => s.id === selectedId) : undefined

  return (
    <>
      <TopBar title="SR 관리" actions={<SrTabs />} />
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="코드 · 제목 검색" className="h-8 pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>상태 전체</SelectItem>
              {MANAGED.map((s) => (
                <SelectItem key={s} value={s}>
                  {SR_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data && rows.length === 0 ? (
          <EmptyState icon={Inbox} title="접수된 SR이 없습니다" description="접수자가 '접수로 전환'하면 여기에 나타납니다." />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>코드</TableHead>
                  <TableHead className="min-w-64">제목</TableHead>
                  <TableHead>접수자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>접수일</TableHead>
                  <TableHead>연결 업무</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s: ServiceRequest) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelectedId(s.id)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.code}</TableCell>
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell>
                      <UserAvatar user={users.get(s.requesterId)} size="xs" showName />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select value={s.status} onValueChange={(v) => actor && setSrStatus(actor, s.id, v as SrStatus)}>
                        <SelectTrigger size="sm" className="h-7 w-28">
                          <SelectValue>
                            <SrStatusBadge status={s.status} />
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {MANAGED.map((st) => (
                            <SelectItem key={st} value={st}>
                              {SR_STATUS_LABEL[st]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(s.submittedAt)}</TableCell>
                    <TableCell className="text-xs">{data?.linkedCount.get(s.code) ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {selected && <SrDetailSheet key={selected.id} sr={selected} open onOpenChange={(o) => !o && setSelectedId(null)} />}
    </>
  )
}
