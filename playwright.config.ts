import { defineConfig } from '@playwright/test';

/**
 * 브라우저 자동 테스트. 배포와 똑같은 정적 빌드(dist)를 vite preview 로 띄워 검사한다.
 *   npm run test:e2e         기본 시나리오 (약 2~3분)
 *   npm run test:e2e:full    봇이 실제 입력으로 15분 한 판을 끝까지 플레이 (실시간 15분)
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  grepInvert: process.env.FULL_RUN ? undefined : /@long/,
  use: {
    // E2E_BASE_URL 을 주면 이미 떠 있는 서버(또는 배포 URL)를 대상으로 검사한다
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
