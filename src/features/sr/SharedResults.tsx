import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/Markdown'
import { UserAvatar } from '@/components/UserAvatar'
import { useUserMap } from '@/app/hooks'
import { db } from '@/db/schema'
import { downloadBlob } from '@/db/repositories/files'
import type { FileAsset, ServiceRequest } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'

/** 요청자 화면: 담당자가 명시적으로 공유한 결과만 보여준다 */
export function SharedResults({ sr }: { sr: ServiceRequest }) {
  const users = useUserMap()
  const fileIds = sr.results.flatMap((r) => r.fileIds)
  const files = useLiveQuery(async () => (await db.files.bulkGet(fileIds)).filter((f): f is FileAsset => !!f), [fileIds.join(',')]) ?? []
  const fileById = new Map(files.map((f) => [f.id, f]))

  return (
    <section className="border-b bg-teal-50/40 px-4 py-3 dark:bg-teal-950/20">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal-800 dark:text-teal-200">
        <Gift className="size-3.5" />
        공유받은 결과 {sr.results.length}
      </h3>
      <ul className="space-y-2">
        {[...sr.results].reverse().map((r) => (
          <li key={r.id} className="rounded-lg border bg-card p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <UserAvatar user={users.get(r.by)} size="xs" />
              <span className="font-medium text-foreground">{users.get(r.by)?.name}</span>
              <span>{formatDateTime(r.at)}</span>
            </div>
            {r.text && <Markdown content={r.text} className="text-xs" />}
            {r.fileIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {r.fileIds.map((id) => {
                  const f = fileById.get(id)
                  return f ? (
                    <Button key={id} size="xs" variant="outline" onClick={() => downloadBlob(f.blob, f.name)}>
                      <Download data-icon="inline-start" />
                      {f.name}
                    </Button>
                  ) : null
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
