import { useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { CostsResponse, HistoryRow, OverviewDoc, PaneLive, TaskDetailResponse } from '@dash/shared'
import { detailKey, useDashStore, type SseState } from './store'

export { useDashStore } from './store'
export type { SseState } from './store'

export function useOverview(): { data: OverviewDoc | null; error: string | null; loading: boolean } {
  const r = useDashStore(useShallow((s) => ({ data: s.overview, error: s.overviewError, loading: s.overviewLoading })))
  useEffect(() => {
    const s = useDashStore.getState()
    if (!s.overview && !s.overviewLoading) void s.fetchOverview()
  }, [])
  return r
}

export function useTaskDetail(
  project: string,
  dir: string,
): {
  data: TaskDetailResponse | null
  error: string | null
  loading: boolean
  notFound: boolean
  reload(): void
} {
  const key = detailKey(project, dir)
  const entry = useDashStore((s) => s.details[key])
  useEffect(() => {
    const s = useDashStore.getState()
    const cur = s.details[detailKey(project, dir)]
    if (!cur || (!cur.data && !cur.loading)) void s.fetchDetail(project, dir)
  }, [project, dir])
  const reload = useCallback(() => void useDashStore.getState().fetchDetail(project, dir), [project, dir])
  return {
    data: entry?.data ?? null,
    error: entry?.error ?? null,
    // 還沒建立快取項表示 effect 即將開抓
    loading: entry ? entry.loading : true,
    notFound: entry?.notFound ?? false,
    reload,
  }
}

export function useHistory(): { data: HistoryRow[] | null; error: string | null; loading: boolean; reload(): void } {
  const h = useDashStore((s) => s.history)
  useEffect(() => {
    const s = useDashStore.getState()
    if (!s.history.data && !s.history.loading) void s.fetchHistory()
  }, [])
  const reload = useCallback(() => void useDashStore.getState().fetchHistory(), [])
  return { ...h, reload }
}

/** 超過這麼久沒更新，頁面掛載時重抓；掛載期間也照這個週期重抓（server 每分鐘取樣一次） */
export const COSTS_STALE_MS = 60_000

export function useCostsAll(): { data: CostsResponse | null; error: string | null; loading: boolean } {
  const c = useDashStore(useShallow((s) => ({ data: s.costsAll.data, error: s.costsAll.error, loading: s.costsAll.loading })))
  useEffect(() => {
    const s = useDashStore.getState()
    const { loading, fetchedAt } = s.costsAll
    if (!loading && (fetchedAt == null || Date.now() - fetchedAt > COSTS_STALE_MS)) void s.fetchCostsAll()
    const timer = setInterval(() => {
      const cur = useDashStore.getState()
      if (!cur.costsAll.loading) void cur.fetchCostsAll()
    }, COSTS_STALE_MS)
    return () => clearInterval(timer)
  }, [])
  return c
}

export function usePane(paneId: string | null | undefined): PaneLive | undefined {
  return useDashStore((s) => (paneId ? s.livePanes[paneId] : undefined))
}

export function useConnection(): { sse: SseState; herdr: OverviewDoc['herdr'] | null } {
  return useDashStore(useShallow((s) => ({ sse: s.sse, herdr: s.overview?.herdr ?? null })))
}
