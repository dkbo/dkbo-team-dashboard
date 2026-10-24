// 3D 場景的唯一入口：只有進 /office 且是 3D 視圖時才 import()，three／r3f 不進入口 chunk（AC14）
// url：重試用。瀏覽器的 module map 以 URL 記住失敗的 import()，同一個 URL 再 import 不發請求、直接重丟，重試必須換 URL（retryUrl）
export const loadScene = (url?: string) =>
  url
    ? (import(/* @vite-ignore */ url) as Promise<typeof import('@/features/office-scene/OfficeScene')>)
    : import('@/features/office-scene/OfficeScene')

/**
 * 失敗的模組 URL 加上 `t=<attempt>`（vite dev 把 t 當時間戳剝掉、正式 build 的靜態檔不看 query），換 URL 才會真的重抓。
 * URL 取自 Chromium／Firefox 的錯誤訊息（build 後 chunk 名帶 hash，只能在執行期拿）；取不到（Safari、不是載入失敗）回 null。
 */
export function retryUrl(err: unknown, attempt: number): string | null {
  const m = err instanceof Error ? /dynamically imported module:\s*(\S+)/.exec(err.message) : null
  if (!m) return null
  try {
    const u = new URL(m[1])
    u.searchParams.set('t', String(attempt))
    return u.href
  } catch {
    return null
  }
}
