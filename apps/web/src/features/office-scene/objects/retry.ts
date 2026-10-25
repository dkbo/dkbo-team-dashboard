// 第二包（物件、事件）的 import()：失敗過就換 URL 重抓（瀏覽器以 URL 記住失敗的模組，同 URL 再 import 直接重丟）。
// 失敗會冒到場景的 AssetBoundary → 頁面落清單＋「再試 3D」；再試時場景重掛、重建 lazy，走這裡的換 URL 重抓。
import { retryUrl } from '@/features/office/loadScene'

export function retryableImport<T>(load: () => Promise<T>, byUrl: (url: string) => Promise<T> = (url) => import(/* @vite-ignore */ url) as Promise<T>): () => Promise<T> {
  let attempt = 0
  let lastError: unknown = null
  return () => {
    const url = lastError ? retryUrl(lastError, ++attempt) : null
    return (url ? byUrl(url) : load()).then(
      (m) => {
        // 成功就回到原本的 import（審查 M4：不然每次重掛都換 URL 重抓、產生新的模組實例）
        lastError = null
        return m
      },
      (e: unknown) => {
        lastError = e
        throw e
      },
    )
  }
}
