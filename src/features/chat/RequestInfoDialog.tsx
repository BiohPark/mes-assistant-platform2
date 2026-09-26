import { FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { downloadBlob, formatSize } from '@/db/repositories/files'
import type { Message } from '@/domain/types'
import { formatDateTime } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { DELIVERY_CLASS, DELIVERY_HINT, DELIVERY_LABEL, inputDetail, inputTitle } from './requestLabels'

interface RequestInfoDialogProps {
  message: Message
  onClose: () => void
}

/** 전송 기록 — 이 답변을 만들 때 AI가 실제로 받은 것 (JSON을 열지 않고 확인) */
export function RequestInfoDialog({ message, onClose }: RequestInfoDialogProps) {
  const info = message.requestInfo
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>전송 기록</DialogTitle>
          <DialogDescription>이 답변을 만들 때 실제로 보낸 자료와 방식입니다. 선택을 바꿔도 이 기록은 바뀌지 않습니다.</DialogDescription>
        </DialogHeader>
        {info ? (
          <div className="space-y-3 text-xs">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">보낸 시각</dt>
              <dd>{formatDateTime(info.at)}</dd>
              <dt className="text-muted-foreground">연결</dt>
              <dd>
                {info.provider === 'mock' ? 'Mock(대역)' : 'Live'} · 모델 <span className="font-mono">{info.model || '(기본)'}</span> · 파일 {info.transport === 'openwebui' ? 'OpenWebUI 첨부' : '본문 포함'}
              </dd>
              <dt className="text-muted-foreground">요청 크기</dt>
              <dd>
                {formatSize(info.bytes)} / 한도 {formatSize(info.limitBytes)} <span className="text-muted-foreground">(토큰 한도와 다름)</span>
              </dd>
              {info.srCodes.length > 0 && (
                <>
                  <dt className="text-muted-foreground">연결 SR</dt>
                  <dd>{info.srCodes.join(', ')}</dd>
                </>
              )}
              {info.retryOf && (
                <>
                  <dt className="text-muted-foreground">다시 시도</dt>
                  <dd>실패한 이전 답변을 같은 질문으로 다시 요청</dd>
                </>
              )}
            </dl>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 font-normal">자료</th>
                  <th className="py-1 font-normal">등급</th>
                  <th className="py-1 font-normal">출처·범위</th>
                  <th className="py-1 font-normal">전달</th>
                  <th className="py-1 text-right font-normal">크기</th>
                </tr>
              </thead>
              <tbody>
                {info.inputs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-2 text-muted-foreground">
                      선택한 입력 없이 대화 내용만 보냈습니다.
                    </td>
                  </tr>
                )}
                {info.inputs.map((i) => (
                  <tr key={i.kind === 'file' ? i.fileId : i.sourceTaskId} className="border-b last:border-0 align-top">
                    <td className="py-1 pr-2">{inputTitle(i)}</td>
                    <td className="py-1 pr-2">{i.weight === 'main' ? '★ 주 입력' : '☑ 참고'}</td>
                    <td className="py-1 pr-2 text-muted-foreground">{inputDetail(i)}</td>
                    <td className="py-1 pr-2">
                      {i.kind === 'file' ? (
                        <span className={cn('rounded border px-1', DELIVERY_CLASS[i.delivery])} title={DELIVERY_HINT[i.delivery]}>
                          {DELIVERY_LABEL[i.delivery]}
                        </span>
                      ) : (
                        <span className="rounded border px-1 text-muted-foreground">본문</span>
                      )}
                      {i.kind === 'file' && i.error && <div className="mt-0.5 text-destructive">{i.error}</div>}
                    </td>
                    <td className="py-1 text-right text-muted-foreground">{i.bytes ? formatSize(i.bytes) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">이 답변에는 구조화된 전송 기록이 없습니다(이전 버전에서 만든 답변).</p>
        )}
        {message.requestSnapshot && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => downloadBlob(new Blob([message.requestSnapshot!], { type: 'application/json' }), `request_${message.id}.json`)}
          >
            <FileJson data-icon="inline-start" /> 원본 요청 JSON 받기
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
