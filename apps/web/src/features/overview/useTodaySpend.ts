import { useEffect, useState } from 'react'
import type { DayCost } from '@dash/shared'
import { api } from '@/api/client'

/** server 每分鐘取樣一次，摘要卡跟著每分鐘重抓 */
export const SPEND_POLL_MS = 60_000

/** 紫卡用的每日花費（`/api/trends?range=7d` 的 costByDay）；還沒拿到或抓失敗為 null，失敗時沿用上一次成功的資料 */
export function useCostByDay(): DayCost[] | null {
  const [rows, setRows] = useState<DayCost[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const { costByDay } = await api.trends('7d')
        if (alive) setRows(costByDay)
      } catch {
        // 留著舊資料；完全沒有就顯示 —
      }
    }
    void load()
    const t = setInterval(() => void load(), SPEND_POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return rows
}
