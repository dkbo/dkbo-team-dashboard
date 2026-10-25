import { useEffect, useState } from 'react'
import { useDashStore } from '@/store'
import { applyQueue, createEventEngine, QUEUE_WINDOW_MS } from './engine'
import type { OfficeEvent, OfficeEventsResult } from './types'

const EMPTY: OfficeEventsResult = { events: [], announce: null }

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/**
 * 頁面用：即時事件（已去重、已套 §6.17 佇列）與最新一句 live region 文字。
 * 事件留在清單上 QUEUE_WINDOW_MS 後移除 —— 場景重掛（清單 ↔ 3D）時才不會把舊事件再播一次。
 * 觸發只看 store 的 overview／sse 有沒有換；是不是即時資料交給引擎依 sse、分頁可見與 generatedAt 判斷。
 */
export function useOfficeEvents(): OfficeEventsResult {
  const [state, setState] = useState<OfficeEventsResult>(EMPTY)

  useEffect(() => {
    const engine = createEventEngine()
    let kept: OfficeEvent[] = []
    let announce: string | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const commit = (next: OfficeEvent[], text: string | null) => {
      const changed = next.length !== kept.length || next.some((e, i) => e !== kept[i])
      kept = next
      if (!changed && text === announce) return
      announce = text
      setState({ events: kept, announce })
      schedule()
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = null
      if (kept.length === 0) return
      const oldest = Math.min(...kept.map((e) => e.at))
      timer = setTimeout(() => commit(applyQueue(kept, Date.now()), announce), Math.max(0, oldest + QUEUE_WINDOW_MS - Date.now() + 1))
    }

    const run = () => {
      const s = useDashStore.getState()
      if (!s.overview) return
      const now = Date.now()
      const visible = isVisible()
      const fresh = engine.observe(s.overview, { sse: s.sse, visible, sessions: s.sessions?.sessions ?? [], now })
      // 背景分頁切回直接畫最終狀態：隱藏時清掉手上的事件
      const next = visible ? applyQueue([...kept, ...fresh], now) : []
      const said = fresh.filter((e) => next.includes(e)).map((e) => e.announce)
      commit(next, said.length > 0 ? said.join('；') : announce)
    }

    const unsub = useDashStore.subscribe((s, prev) => {
      if (s.overview !== prev.overview || s.sse !== prev.sse) run()
    })
    document.addEventListener('visibilitychange', run)
    run()
    return () => {
      unsub()
      document.removeEventListener('visibilitychange', run)
      if (timer) clearTimeout(timer)
    }
  }, [])

  return state
}
