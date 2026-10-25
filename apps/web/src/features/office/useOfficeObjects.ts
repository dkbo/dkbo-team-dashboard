import { useMemo, useRef, useSyncExternalStore } from 'react'
import type { OfficeSession, TaskDetail } from '@dash/shared'
import { api } from '@/api/client'
import { usePolled } from '@/features/git/useGit'
import { spendSummary } from '@/features/overview/summary'
import { SPEND_POLL_MS } from '@/features/overview/useTodaySpend'
import { useDashStore } from '@/store'
import type { SceneTask } from './model'
import { buildObjects, keepSame } from './objects'
import type { OfficeObjects } from './sceneTypes'

/** git 摘要輪詢間隔（AC4） */
export const GIT_POLL_MS = 30_000

const subscribeVisibility = (fn: () => void) => {
  document.addEventListener('visibilitychange', fn)
  return () => document.removeEventListener('visibilitychange', fn)
}

/** 分頁是否可見（隱藏時停輪詢） */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => true,
  )
}

/** store 快取的 detail 攤平成 `${project}/${dir}` → TaskDetail（白板 E3、結案保留的成員都用它） */
export function useCachedDetails(): Record<string, TaskDetail> {
  const details = useDashStore((s) => s.details)
  return useMemo(() => {
    const out: Record<string, TaskDetail> = {}
    for (const [k, d] of Object.entries(details)) if (d.data) out[k] = d.data.detail.task
    return out
  }, [details])
}

export interface UseOfficeObjectsArgs {
  /** 只有 /office 3D 視圖開著時算；清單模式回 null、不輪詢 */
  enabled: boolean
  tasks: Record<string, SceneTask>
  sessions: OfficeSession[]
  details: Record<string, TaskDetail>
  /** 分鐘精度的時鐘就夠（今天 +N、熔斷到期） */
  now: number
}

/**
 * /office 頁面物件（AC4）：store（overview、sessions、detail）＋ git 摘要（每 30 秒）＋今日花費（每分鐘）。
 * 兩個輪詢只在 3D 視圖開著、分頁可見時跑；值沒變沿用舊參照，場景不 invalidate（AC11）。
 */
export function useOfficeObjects({ enabled, tasks, sessions, details, now }: UseOfficeObjectsArgs): OfficeObjects | null {
  const overview = useDashStore((s) => s.overview)
  const visible = usePageVisible()
  const on = enabled && visible
  const git = usePolled(on ? 'office-git' : null, api.gitSummaries, GIT_POLL_MS)
  const spend = usePolled(on ? 'office-spend' : null, () => api.trends('7d'), SPEND_POLL_MS)
  // 輪詢暫停（分頁隱藏）時沿用最後一次的值，回來不閃「讀取中」
  const lastGit = useRef(git.data)
  if (git.data) lastGit.current = git.data
  const lastSpend = useRef(spend.data)
  if (spend.data) lastSpend.current = spend.data
  const gitRows = git.data?.projects ?? lastGit.current?.projects ?? null
  const costByDay = spend.data?.costByDay ?? lastSpend.current?.costByDay ?? null

  const prev = useRef<OfficeObjects | null>(null)
  const next = useMemo(
    () =>
      enabled
        ? buildObjects({ overview, tasks, sessions, details, git: gitRows, todaySpend: spendSummary(costByDay, now).today, now })
        : null,
    [enabled, overview, tasks, sessions, details, gitRows, costByDay, now],
  )
  if (!next) return null
  prev.current = keepSame(prev.current, next)
  return prev.current
}
