import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { router } from './app/router'
import { recoverStaleReplies } from './app/chatRunner'
import { ensureSeeded } from './db/seed'

/** 끊긴 응답 자리표시 정리 주기 (다른 탭이 닫혔을 때 입력창이 계속 잠기지 않게) */
const RECOVERY_INTERVAL_MS = 30_000

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!)
  try {
    await ensureSeeded()
  } catch (e) {
    root.render(
      <div className="p-8 text-sm">
        <h1 className="mb-2 text-lg font-semibold">데이터베이스 초기화 실패</h1>
        <p className="text-muted-foreground">
          브라우저 IndexedDB를 열 수 없습니다. 시크릿 모드이거나 저장소가 차단된 환경일 수 있습니다.
        </p>
        <pre className="mt-3 rounded bg-muted p-3 text-xs">{e instanceof Error ? e.message : String(e)}</pre>
      </div>,
    )
    return
  }
  const recover = () => void recoverStaleReplies().catch(() => undefined)
  recover()
  setInterval(recover, RECOVERY_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && recover())
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void bootstrap()
