import { create } from 'zustand'
import type { CostsResponse, HerdrView, HistoryRow, OverviewDoc, PaneLive, SseEvent, TaskDetailResponse } from '@dash/shared'
import { api, errorText, HttpError } from '@/api/client'
import { mergePaneIntoDetail, mergePaneIntoHerdrView, mergePaneIntoOverview } from './merge'

export type SseState = 'connecting' | 'open' | 'closed'

export interface DetailEntry {
  project: string
  dir: string
  data: TaskDetailResponse | null
  error: string | null
  loading: boolean
  notFound: boolean
}

export interface HistoryEntry {
  data: HistoryRow[] | null
  error: string | null
  loading: boolean
}

export interface CostsAllEntry {
  data: CostsResponse | null
  error: string | null
  loading: boolean
  /** 最近一次成功取得的時間（epoch ms） */
  fetchedAt: number | null
}

interface DashData {
  overview: OverviewDoc | null
  overviewError: string | null
  overviewLoading: boolean
  /** paneId → 最新即時狀態（overview／detail 的 panes 加上 pane.updated 疊加） */
  livePanes: Record<string, PaneLive>
  /** key 為 `${project}/${dir}` */
  details: Record<string, DetailEntry>
  history: HistoryEntry
  /** `GET /api/costs?range=all`，給任務詳情與 /history 的花費 */
  costsAll: CostsAllEntry
  /** herdr 鏡像頁的全貌；只有開過 herdr 頁才會抓 */
  herdrView: HerdrView | null
  herdrViewError: string | null
  sse: SseState
}

interface DashActions {
  fetchOverview(): Promise<void>
  fetchDetail(project: string, dir: string): Promise<void>
  fetchHistory(): Promise<void>
  fetchCostsAll(): Promise<void>
  fetchHerdrView(): Promise<void>
  handleEvent(e: SseEvent): void
  handleStreamOpen(): void
  handleStreamError(closed: boolean): void
}

export type DashState = DashData & DashActions

export const detailKey = (project: string, dir: string) => `${project}/${dir}`

const initialData = (): DashData => ({
  overview: null,
  overviewError: null,
  overviewLoading: false,
  livePanes: {},
  details: {},
  history: { data: null, error: null, loading: false },
  costsAll: { data: null, error: null, loading: false, fetchedAt: null },
  herdrView: null,
  herdrViewError: null,
  sse: 'connecting',
})

function panesOf(doc: OverviewDoc): Record<string, PaneLive> {
  const out: Record<string, PaneLive> = {}
  for (const a of doc.agents ?? []) out[a.paneId] = a
  for (const p of doc.projects) for (const pane of [...p.panes, ...p.otherPanes]) out[pane.paneId] = pane
  return out
}

const streamListeners = new Set<(e: SseEvent) => void>()

/** 訂閱每一則 SSE 事件（活動欄靠它決定何時重抓）；回傳取消訂閱函式。 */
export function subscribeStreamEvents(fn: (e: SseEvent) => void): () => void {
  streamListeners.add(fn)
  return () => void streamListeners.delete(fn)
}

export const useDashStore = create<DashState>()((set, get) => {
  // 較舊的 overview（例如 SSE 已推來較新的，fetch 才回來）不覆蓋較新的。
  const acceptOverview = (doc: OverviewDoc) => {
    const cur = get().overview
    if (cur && doc.generatedAt < cur.generatedAt) return
    set({ overview: doc, overviewError: null, livePanes: panesOf(doc) })
  }

  const acceptHerdrView = (v: HerdrView) => {
    const cur = get().herdrView
    if (cur && v.generatedAt < cur.generatedAt) return
    set({ herdrView: v, herdrViewError: null })
  }

  const patchDetail = (project: string, dir: string, patch: Partial<DetailEntry>) =>
    set((s) => {
      const key = detailKey(project, dir)
      const prev = s.details[key] ?? { project, dir, data: null, error: null, loading: false, notFound: false }
      return { details: { ...s.details, [key]: { ...prev, ...patch } } }
    })

  return {
    ...initialData(),

    async fetchOverview() {
      set({ overviewLoading: true })
      try {
        acceptOverview(await api.overview())
      } catch (e) {
        set({ overviewError: errorText(e) })
      } finally {
        set({ overviewLoading: false })
      }
    },

    async fetchDetail(project, dir) {
      patchDetail(project, dir, { loading: true })
      try {
        const data = await api.task(project, dir)
        set((s) => ({ livePanes: { ...s.livePanes, ...Object.fromEntries(data.panes.map((p) => [p.paneId, p])) } }))
        patchDetail(project, dir, { data, error: null, notFound: false, loading: false })
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) patchDetail(project, dir, { data: null, error: null, notFound: true, loading: false })
        else patchDetail(project, dir, { error: errorText(e), loading: false })
      }
    },

    async fetchHistory() {
      set((s) => ({ history: { ...s.history, loading: true } }))
      try {
        const { tasks } = await api.history()
        set({ history: { data: tasks, error: null, loading: false } })
      } catch (e) {
        set((s) => ({ history: { ...s.history, error: errorText(e), loading: false } }))
      }
    },

    async fetchCostsAll() {
      set((s) => ({ costsAll: { ...s.costsAll, loading: true } }))
      try {
        const data = await api.costs('all')
        set({ costsAll: { data, error: null, loading: false, fetchedAt: Date.now() } })
      } catch (e) {
        set((s) => ({ costsAll: { ...s.costsAll, error: errorText(e), loading: false } }))
      }
    },

    async fetchHerdrView() {
      try {
        acceptHerdrView(await api.herdrView())
      } catch (e) {
        set({ herdrViewError: errorText(e) })
      }
    },

    handleEvent(e) {
      for (const fn of streamListeners) fn(e)
      switch (e.event) {
        case 'overview.updated':
          acceptOverview(e.data)
          return
        case 'pane.updated': {
          const pane = e.data
          set((s) => {
            const details: Record<string, DetailEntry> = {}
            for (const [k, d] of Object.entries(s.details)) details[k] = d.data ? { ...d, data: mergePaneIntoDetail(d.data, pane) } : d
            const old = s.livePanes[pane.paneId]
            return {
              overview: s.overview && mergePaneIntoOverview(s.overview, pane),
              herdrView: s.herdrView && mergePaneIntoHerdrView(s.herdrView, pane),
              details,
              livePanes: {
                ...s.livePanes,
                [pane.paneId]: old ? { ...old, ...pane, taskDir: pane.taskDir ?? old.taskDir, member: pane.member ?? old.member } : pane,
              },
            }
          })
          return
        }
        case 'herdr.view':
          acceptHerdrView(e.data)
          return
        case 'task.updated': {
          const { project, dir } = e.data
          const s = get()
          if (s.details[detailKey(project, dir)]) void s.fetchDetail(project, dir)
          if (s.history.data || s.history.loading) void s.fetchHistory()
          return
        }
      }
    },

    // SSE 連上（含斷線重連）時先重抓 overview，再重抓已快取的 detail 與已載入的 history。
    handleStreamOpen() {
      set({ sse: 'open' })
      const s = get()
      void s.fetchOverview()
      for (const d of Object.values(s.details)) void s.fetchDetail(d.project, d.dir)
      if (s.history.data) void s.fetchHistory()
      if (s.costsAll.data) void s.fetchCostsAll()
      if (s.herdrView) void s.fetchHerdrView()
    },

    handleStreamError(closed) {
      set({ sse: closed ? 'closed' : 'connecting' })
    },
  }
})

export function resetDashStore() {
  useDashStore.setState(initialData())
}
