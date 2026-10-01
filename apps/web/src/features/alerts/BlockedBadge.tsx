import { useState } from 'react'
import { Link } from 'react-router'
import { Bell, BellOff } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDashStore } from '@/store'
import { herdrHref } from '@/lib/herdr'
import { agentLabel, blockedAgents } from './model'
import { enableNotify, notifyEnabled, notifySupported, setNotifyPref } from './notify'

/** 頂部列：有 agent 卡住時的紅色膠囊，hover 列出、點了跳到 herdr 頁 */
export function BlockedBadge() {
  const blocked = blockedAgents(useDashStore((s) => s.overview))
  if (blocked.length === 0) return null
  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Link
          to={herdrHref(blocked[0])}
          data-testid="blocked-badge"
          className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300"
        >
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-red-500" />
          {blocked.length} 個 agent 卡住
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-1.5">
        <ul className="flex flex-col">
          {blocked.map((a) => (
            <li key={a.paneId}>
              <Link to={herdrHref(a)} className="flex flex-col rounded-md px-2 py-1 text-sm hover:bg-muted">
                <span className="font-medium">{agentLabel(a)}</span>
                <span className="truncate text-xs text-muted-foreground">{a.project ?? a.cwd}</span>
              </Link>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  )
}

/** 桌面通知開關（agent 變成 blocked 時通知） */
export function NotifyToggle() {
  const [on, setOn] = useState(notifyEnabled)
  if (!notifySupported()) return null
  const denied = Notification.permission === 'denied'
  const toggle = async () => {
    if (on) {
      setNotifyPref(false)
      setOn(false)
    } else setOn(await enableNotify())
  }
  const hint = denied ? '瀏覽器已封鎖通知，請在網站設定裡允許' : on ? 'agent 卡住時發桌面通知（點擊關閉）' : '開啟：agent 卡住時發桌面通知'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="notify-toggle"
          aria-pressed={on}
          aria-label={hint}
          disabled={denied}
          onClick={() => void toggle()}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          {on ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
