import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { makeSampleFixture } from './packages/shared/src/index.ts'
import { configFile, dataDir, fixturesDir, gitBinFile, herdrLogFile, runtimeDir, snapshotFile, snapshotSeedFile, socketFile } from './e2e/fixtures/paths'
import { setupProjects } from './e2e/fixtures/projects'

// 執行期目錄（paths.ts 以 mkdtemp 建立）裡的假專案、dashboard config、herdr 快照 seed 與趨勢樣本。
// 必須在 config 載入時寫：Playwright 先起 webServer 才跑 globalSetup。只在主行程寫一次，worker 重新載入 config 時不重寫。
if (!process.env.DASH_E2E_PREPARED) {
  process.env.DASH_E2E_PREPARED = '1'
  setupProjects()
  const samplesDir = path.join(dataDir, 'samples')
  mkdirSync(samplesDir, { recursive: true })
  for (const [day, samples] of Object.entries(makeSampleFixture(Date.now()))) {
    writeFileSync(path.join(samplesDir, `${day}.jsonl`), samples.map((s) => JSON.stringify(s)).join('\n') + '\n')
  }
}

const PORT = '4417'
const WEB_PORT = '5273'

// server 與 web 共用的 env：e2e 一律用獨立埠組與執行期目錄的設定檔；herdr 換成假的 CLI＋假 socket（不碰真 herdr 行程）
const env: Record<string, string> = {
  PORT,
  WEB_PORT,
  DASHBOARD_CONFIG: configFile,
  DASH_HERDR_BIN: path.join(fixturesDir, 'fake-herdr.mjs'),
  DASH_HERDR_SOCKET: socketFile,
  FAKE_HERDR_SEED: snapshotSeedFile,
  FAKE_HERDR_SNAPSHOT: snapshotFile,
  FAKE_HERDR_LOG: herdrLogFile,
  DASH_DATA_DIR: dataDir,
  // git 換成記錄參數的包裝（底下仍是真 git），e2e 斷言只跑唯讀指令
  DASH_GIT_BIN: gitBinFile,
  // 一小時取一次：取樣器啟動時只做保留清理、第一次取樣在 sampleMs 之後，所以 e2e 期間不會混入假 herdr 樣本
  DASH_SAMPLE_MS: '3600000',
  // webServer 子行程不在 TMPDIR 留 tsx／node 編譯快取（執行期目錄以外的暫存）
  TSX_DISABLE_CACHE: '1',
  NODE_DISABLE_COMPILE_CACHE: '1',
}

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // webServer 依陣列順序啟動（前一個就緒才起下一個）、關閉時倒序：假 socket 最先起、最後關
  webServer: [
    {
      command: 'node e2e/fixtures/fake-herdr-socket.mjs',
      wait: { stdout: /fake herdr socket listening/ },
      env: { ...env, FAKE_HERDR_CLEANUP_DIR: runtimeDir },
      reuseExistingServer: false,
      timeout: 10_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 2_000 },
    },
    {
      // 等同 apps/server 的 start（tsx src/index.ts），但不經 tsx CLI：CLI 就算 TSX_DISABLE_CACHE 也會在 TMPDIR 建 tsx-<uid>（IPC pipe 用）
      command: 'node --import tsx src/index.ts',
      cwd: 'apps/server',
      url: `http://127.0.0.1:${PORT}/api/overview`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
      // 預設是 SIGKILL 整個行程群組，server 來不及清自己建的 dash-overlay-*；改送 SIGTERM
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: 'pnpm -C apps/web dev',
      url: `http://localhost:${WEB_PORT}`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
      // 預設是 SIGKILL 整個行程群組；改送 SIGTERM 讓 vite 與 pnpm 正常收尾，不留孤兒行程
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
})
