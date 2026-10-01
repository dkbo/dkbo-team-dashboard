import { useCallback, useEffect, useRef, useState } from 'react'
import type { CostsResponse, TrendRange, TrendsResponse } from '@dash/shared'
import { api, errorText } from '@/api/client'

/** server 每分鐘取樣一次，頁面跟著每分鐘重抓 */
export const TRENDS_POLL_MS = 60_000

export interface TrendsData {
  trends: TrendsResponse
  costs: CostsResponse
}

/** 同一個 range 同時抓 trends 與 costs；只收最後一次請求的結果，切換範圍時不沿用別的範圍的數字 */
export function useTrendsData(range: TrendRange): {
  data: TrendsData | null
  error: string | null
  loading: boolean
  reload(): void
} {
  const [state, setState] = useState<{ range: TrendRange; data: TrendsData | null; error: string | null; loading: boolean }>({
    range,
    data: null,
    error: null,
    loading: true,
  })
  const seq = useRef(0)

  const load = useCallback(async (r: TrendRange) => {
    const id = ++seq.current
    setState((s) => (s.range === r ? { ...s, loading: true } : { range: r, data: null, error: null, loading: true }))
    try {
      const [trends, costs] = await Promise.all([api.trends(r), api.costs(r)])
      if (id === seq.current) setState({ range: r, data: { trends, costs }, error: null, loading: false })
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, error: errorText(e), loading: false }))
    }
  }, [])

  useEffect(() => {
    void load(range)
    const t = setInterval(() => void load(range), TRENDS_POLL_MS)
    return () => clearInterval(t)
  }, [range, load])

  const reload = useCallback(() => void load(range), [load, range])
  const current = state.range === range
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: current ? state.loading : true,
    reload,
  }
}
