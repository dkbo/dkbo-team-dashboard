import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActivityItem } from '@dash/shared'
import { api } from '@/api/client'
import { subscribeStreamEvents } from '@/store/store'

/** 收到 task.updated／overview.updated 後等這麼久才重抓，連續事件只抓一次 */
export const ACTIVITY_DEBOUNCE_MS = 1000
/** 沒有事件時的保底重抓週期 */
export const ACTIVITY_POLL_MS = 60_000
export const ACTIVITY_LIMIT = 50

export interface ActivityState {
  items: ActivityItem[] | null
  /** 最近一次抓取失敗 */
  error: boolean
  reload(): void
}

/** 活動欄資料：掛載時抓、SSE 事件防抖後重抓、每分鐘保底重抓；只收最後一次請求的結果 */
export function useActivity(): ActivityState {
  const [state, setState] = useState<{ items: ActivityItem[] | null; error: boolean }>({ items: null, error: false })
  const seq = useRef(0)

  const load = useCallback(async () => {
    const id = ++seq.current
    try {
      const { items } = await api.activity(ACTIVITY_LIMIT)
      if (id === seq.current) setState({ items, error: false })
    } catch {
      if (id === seq.current) setState((s) => ({ ...s, error: true }))
    }
  }, [])

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null
    void load()
    const poll = setInterval(() => void load(), ACTIVITY_POLL_MS)
    const unsubscribe = subscribeStreamEvents((e) => {
      if (e.event !== 'task.updated' && e.event !== 'overview.updated') return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void load()
      }, ACTIVITY_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      clearInterval(poll)
      if (debounce) clearTimeout(debounce)
      seq.current++ // 卸載後回來的結果不再寫入
    }
  }, [load])

  const reload = useCallback(() => void load(), [load])
  return { ...state, reload }
}
