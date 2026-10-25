import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import type { OverviewDoc, SessionsDoc } from '@dash/shared'
import { useDashStore } from '@/store'
import { attentionItems, newAttention, notifyTitle, titleWithNeeds, type AttentionKind } from './model'
import { notifyEnabled } from './notify'

/**
 * 全站提醒（AC13）：分頁標題「(N) 需要你 · 」；有人新變成等你／出錯時發桌面通知（點了跳到 /office 該人，config 外的 pane 跳 herdr 頁）。
 * 基準：overview 與 sessions 都到齊的第一份不通知；SSE 斷線後重連，要等兩者都重抓過一次再當新基準。
 */
export function useBlockedAlerts(): void {
  const overview = useDashStore((s) => s.overview)
  const sessions = useDashStore((s) => s.sessions)
  const sessionsError = useDashStore((s) => s.sessionsError)
  const sse = useDashStore((s) => s.sse)
  const navigate = useNavigate()
  const prev = useRef<Map<string, AttentionKind> | null>(null)
  // 斷線當下的資料物件；重連後兩者都換成新物件才定新基準
  const stale = useRef<{ overview: OverviewDoc | null; sessions: SessionsDoc | null } | null>(null)
  const lastSse = useRef(sse)
  const baseTitle = useRef<string>(typeof document === 'undefined' ? '' : document.title)

  useEffect(() => {
    const s = useDashStore.getState()
    if (!s.sessions && !s.sessionsError) void s.fetchSessions()
  }, [])

  useEffect(() => {
    if (lastSse.current === 'open' && sse !== 'open') {
      prev.current = null
      const s = useDashStore.getState()
      stale.current = { overview: s.overview, sessions: s.sessions }
    }
    lastSse.current = sse
  }, [sse])

  useEffect(() => {
    const items = attentionItems(overview, sessions?.sessions ?? null)
    document.title = titleWithNeeds(baseTitle.current, items.length)
    const ready =
      overview != null &&
      (sessions != null || sessionsError != null) &&
      (!stale.current || (overview !== stale.current.overview && (sessions !== stale.current.sessions || sessionsError != null)))
    if (!ready) return
    stale.current = null
    const fresh = newAttention(prev.current, items)
    prev.current = new Map(items.map((i) => [i.key, i.kind]))
    if (!notifyEnabled()) return
    for (const i of fresh) {
      const n = new Notification(notifyTitle(i), { body: i.detail ?? undefined, tag: `attention-${i.key}` })
      n.onclick = () => {
        window.focus()
        navigate(i.href)
        n.close()
      }
    }
  }, [overview, sessions, sessionsError, navigate])

  useEffect(() => {
    const base = baseTitle.current
    return () => {
      document.title = base
    }
  }, [])
}
