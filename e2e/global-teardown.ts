import { rmSync } from 'node:fs'
import { runtimeDir } from './fixtures/paths'

// 刪掉本次 run 的執行期目錄（paths.ts 以 mkdtemp 建立）。
// 注意 Playwright 的 globalTeardown 跑在 webServer 關掉之前；之後 server 關機途中若又寫進去，由最後關的假 herdr socket 補刪。
export default function globalTeardown() {
  rmSync(runtimeDir, { recursive: true, force: true })
}
