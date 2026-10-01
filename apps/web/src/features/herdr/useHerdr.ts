import { useEffect, useRef, useState } from 'react'
import type { HerdrView, HerdrViewPane, HerdrViewTab } from '@dash/shared'
import { api, errorText } from '@/api/client'
import { useDashStore } from '@/store'
import { parseAnsi, type AnsiSegment } from '@/lib/ansi'

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

export const LIVE_SAFETY_MS = 30_000

export const viewPollMs = (pushed: boolean, pollMs: number): number => (pushed ? LIVE_SAFETY_MS : pollMs)

/**
 * herdr 全貌放在 store：server 訂閱中（view.live）且 SSE 連著 → 靠 SSE herdr.view／pane.updated 推送，只每 30 秒保險重抓；
 * 否則每 pollMs 輪詢。分頁在背景時暫停。
 */
export function useHerdrView(pollMs = 2000): { view: HerdrView | null; error: string | null } {
  const view = useDashStore((s) => s.herdrView)
  const error = useDashStore((s) => s.herdrViewError)
  const pushed = useDashStore((s) => s.sse === 'open' && !!s.herdrView?.live)
  const intervalMs = viewPollMs(pushed, pollMs)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (visible()) await useDashStore.getState().fetchHerdrView()
      if (alive) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs])
  return { view, error }
}

export interface ScreenState {
  lines: AnsiSegment[][]
  at: number
  error: string | null
}

/** server 上限 5000 行 */
export const historyLines = (p: HerdrViewPane, tab: HerdrViewTab): number => Math.min(5000, p.scrollback + Math.max(tab.area.height, p.rect.height))

export interface ScreenTarget {
  paneId: string
  /** 有值：讀捲動歷史（source=recent）這麼多行；否則讀可見畫面 */
  recentLines?: number
}

/** 只輪詢目前畫面上的 pane（約每秒一次）；pane 集合變了就重排 */
export function useHerdrScreens(targets: ScreenTarget[], intervalMs = 1000): Record<string, ScreenState> {
  const [screens, setScreens] = useState<Record<string, ScreenState>>({})
  const key = targets.map((t) => `${t.paneId}\t${t.recentLines ?? ''}`).join('\n')
  const raw = useRef<Record<string, string>>({})
  useEffect(() => {
    const list = key
      ? key.split('\n').map((row) => {
          const [paneId, n] = row.split('\t')
          return { paneId, recentLines: n ? Number(n) : undefined }
        })
      : []
    const ids = list.map((t) => t.paneId)
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (visible() && ids.length > 0) {
        const results = await Promise.all(
          list.map(async ({ paneId: id, recentLines }) => {
            try {
              return [id, await api.herdrScreen(id, recentLines), null] as const
            } catch (e) {
              return [id, null, errorText(e)] as const
            }
          }),
        )
        if (!alive) return
        setScreens((prev) => {
          const next: Record<string, ScreenState> = {}
          let changed = Object.keys(prev).length !== ids.length
          for (const [id, s, err] of results) {
            const old = prev[id]
            if (s && old && raw.current[id] === s.ansi && !old.error) {
              next[id] = old // 畫面沒變就沿用，避免重繪
              continue
            }
            changed = true
            if (s) raw.current[id] = s.ansi
            next[id] = s ? { lines: parseAnsi(s.ansi), at: s.generatedAt, error: null } : { lines: old?.lines ?? [], at: old?.at ?? 0, error: err }
          }
          return changed ? next : prev
        })
      }
      if (alive) timer = setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [key, intervalMs])
  return screens
}
