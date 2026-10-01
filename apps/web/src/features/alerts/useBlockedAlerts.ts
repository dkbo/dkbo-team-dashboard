import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import type { PaneStatus } from '@dash/shared'
import { useDashStore } from '@/store'
import { herdrHref } from '@/lib/herdr'
import { agentLabel, blockedAgents, newlyBlocked, titleWithCount } from './model'
import { notifyEnabled } from './notify'

/** 全站：分頁標題顯示卡住數；agent 新變成 blocked 時發桌面通知（點了跳到 herdr 頁的那個 pane） */
export function useBlockedAlerts(): void {
  const overview = useDashStore((s) => s.overview)
  const navigate = useNavigate()
  const prev = useRef<Map<string, PaneStatus> | null>(null)
  const baseTitle = useRef<string>(typeof document === 'undefined' ? '' : document.title)

  useEffect(() => {
    if (!overview) return
    const agents = overview.agents ?? []
    const fresh = newlyBlocked(prev.current, agents)
    prev.current = new Map(agents.map((a) => [a.paneId, a.status]))
    document.title = titleWithCount(baseTitle.current, blockedAgents(overview).length)
    if (!notifyEnabled()) return
    for (const a of fresh) {
      const n = new Notification(`${agentLabel(a)} 卡住了`, { body: a.project ? `${a.project} · ${a.cwd}` : a.cwd, tag: `blocked-${a.paneId}` })
      n.onclick = () => {
        window.focus()
        navigate(herdrHref(a))
        n.close()
      }
    }
  }, [overview, navigate])

  useEffect(() => {
    const base = baseTitle.current
    return () => {
      document.title = base
    }
  }, [])
}
