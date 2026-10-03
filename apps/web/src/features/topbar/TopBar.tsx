import { Cloud } from 'lucide-react'
import { NavLink } from 'react-router'
import { ThemeToggle } from '@/app/theme'
import { BlockedBadge, NotifyToggle } from '@/features/alerts/BlockedBadge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatCountdown, formatEpochMs, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useConnection, useDashStore } from '@/store'
import type { SseState } from '@/store'
import type { HerdrState } from '@dash/shared'
import { latestKindsDown, usageRows } from './model'

type LightState = 'ok' | 'down' | 'unknown'

const LIGHT_CLASS: Record<LightState, string> = {
  ok: 'bg-emerald-500',
  down: 'bg-red-500',
  unknown: 'bg-zinc-400',
}

const SSE_TEXT: Record<SseState, string> = { open: 'SSE 已連線', connecting: 'SSE 重連中', closed: 'SSE 已斷線' }
const HERDR_TEXT: Record<HerdrState, string> = {
  subscribed: 'herdr 事件訂閱中',
  polling: 'herdr 訂閱斷線，每 5 秒輪詢中',
  down: 'herdr 無法連線',
}

function Light({ id, label, state, hint }: { id: string; label: string; state: LightState; hint: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-testid={`light-${id}`} data-state={state} className="inline-flex items-center gap-1.5 text-xs" tabIndex={0}>
          <span aria-hidden className={cn('size-2 rounded-full', LIGHT_CLASS[state])} />
          {label}
          <span className="sr-only">：{hint}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-full px-3 py-1 text-sm transition-colors',
    isActive ? 'bg-primary font-semibold text-primary-foreground shadow-soft' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  )

export function TopBar({ now }: { now: number }) {
  const { sse, herdr } = useConnection()
  const overview = useDashStore((s) => s.overview)
  const downs = overview ? latestKindsDown(overview.kindsDown, now) : []
  const usage = overview ? usageRows(overview.usage) : []

  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-bold">
            <Cloud aria-hidden className="size-5 fill-primary/30 text-primary" />
            dkbo 儀表板
          </span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              總覽
            </NavLink>
            <NavLink to="/history" className={navClass}>
              歷史
            </NavLink>
            <NavLink to="/trends" className={navClass}>
              趨勢
            </NavLink>
            <NavLink to="/herdr" className={navClass}>
              herdr
            </NavLink>
            <NavLink to="/git" className={navClass}>
              git
            </NavLink>
          </nav>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2 text-xs">
          <BlockedBadge />
          {downs.map((d) => (
            <span
              key={d.kind}
              title={`${d.project} · ${d.reason}`}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 font-medium text-red-700 dark:text-red-300"
            >
              {d.kind} 熔斷 · 還剩 {formatCountdown(d.until_epoch, now)}
            </span>
          ))}
          {usage.length === 0 ? (
            <span data-testid="usage-none" className="text-muted-foreground">
              額度 —
            </span>
          ) : (
            usage.map((u) => (
              <span key={u.kind} data-testid={`usage-${u.kind}`} className="inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-2.5 py-0.5">
                <span className="font-medium">{u.kind}</span>
                <span className="text-muted-foreground tabular-nums">5h {formatPct(u.fiveHourPct)}</span>
                <span className="text-muted-foreground tabular-nums">週 {formatPct(u.weekPct)}</span>
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-3">
          <Light id="sse" label="SSE" state={sse === 'open' ? 'ok' : 'down'} hint={SSE_TEXT[sse]} />
          <Light
            id="herdr"
            label="herdr"
            state={herdr == null ? 'unknown' : herdr.state === 'subscribed' ? 'ok' : 'down'}
            hint={herdr == null ? '尚未取得 herdr 狀態' : HERDR_TEXT[herdr.state]}
          />
          <span className="text-xs text-muted-foreground tabular-nums">最後更新 {formatEpochMs(overview?.generatedAt ?? null)}</span>
          <NotifyToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
