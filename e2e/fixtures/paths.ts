import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// e2e 共用路徑：config（webServer env）與測試（改快照觸發事件）都從這裡取。
// 執行期目錄每次 run 用 mkdtemp 建一個（跟隨 TMPDIR）並寫回 env；worker 與重新載入的 config 繼承 env，沿用同一個不另建。
// 由 globalTeardown（e2e/global-teardown.ts）與最後關掉的假 herdr socket 刪掉。
const RUNTIME_ENV = 'DASH_E2E_RUNTIME_DIR'
export const runtimeDir = (process.env[RUNTIME_ENV] ??= mkdtempSync(path.join(os.tmpdir(), 'dash-e2e-')))
export const fixturesDir = import.meta.dirname
export const projectsDir = path.join(runtimeDir, 'projects')
export const configFile = path.join(runtimeDir, 'dashboard.config.json')
export const snapshotSeedFile = path.join(runtimeDir, 'herdr-seed.json')
export const snapshotFile = path.join(runtimeDir, 'herdr-snapshot.json')
export const socketFile = path.join(runtimeDir, 'herdr.sock')
export const herdrLogFile = path.join(runtimeDir, 'herdr-calls.log')
export const dataDir = path.join(runtimeDir, 'data')
export const gitBinFile = path.join(runtimeDir, 'bin/git')
export const gitLogFile = path.join(runtimeDir, 'git-calls.log')
