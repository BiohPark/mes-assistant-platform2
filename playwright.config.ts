import os from 'node:os'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * 브라우저 흐름 검증. 설치된 Edge를 쓰고, 결과물(스크린샷·trace)은 저장소 밖에 둔다(공개 저장소).
 * 외부 LLM·OpenWebUI는 호출하지 않는다 — e2e/support/fakeOpenWebUI.ts가 가짜 응답을 준다.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: process.env.E2E_OUT_DIR ?? path.join(os.tmpdir(), 'mes-hub-e2e'),
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'msedge',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
