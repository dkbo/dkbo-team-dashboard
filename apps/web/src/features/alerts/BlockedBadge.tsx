import { useState } from 'react'
import { Link } from 'react-router'
import { Bell, BellOff } from 'lucide-react'
import { StatusPill } from '@/components/app/StatusPill'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDashStore } from '@/store'
import { herdrHref } from '@/lib/herdr'
import { cn } from '@/lib/utils'
import { agentLabel, blockedAgents } from './model'
import { enableNotify, notifyEnabled, notifySupported, setNotifyPref } from './notify'

/** 頂部列：有 agent 卡住時的 danger 膠囊，hover 列出、點了跳到 herdr 頁 */
export function BlockedBadge({ className }: { className?: string }) {
  const blocked = blockedAgents(useDashStore((s) => s.overview))
  if (blocked.length === 0) return null
  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Link
          to={herdrHref(blocked[0])}
          data-testid="blocked-badge"
          className={cn('inline-flex max-w-full min-w-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
        >
          <StatusPill tone="danger" pulse interactive label={`${blocked.length} 個 agent 卡住`} />
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-2">
        <ul className="flex flex-col">
          {blocked.map((a) => (
            <li key={a.paneId}>
              <Link to={herdrHref(a)} className="flex flex-col rounded-lg px-3 py-2 text-sm transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
                <span className="font-semibold">{agentLabel(a)}</span>
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-testid="notify-toggle"
          aria-pressed={on}
          aria-label={hint}
          disabled={denied}
          onClick={() => void toggle()}
          className="text-muted-foreground"
        >
          {on ? <Bell /> : <BellOff />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}
