import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Cloud } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router'
import { ThemeToggle } from '@/app/theme'
import { StatusDot, type Tone } from '@/components/app/StatusDot'
import { StatusPill } from '@/components/app/StatusPill'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BlockedBadge, NotifyToggle } from '@/features/alerts/BlockedBadge'
import { blockedAgents } from '@/features/alerts/model'
import { formatCountdown, formatEpochMs, formatPct } from '@/lib/format'
import { herdrHref } from '@/lib/herdr'
import { cn } from '@/lib/utils'
import { useConnection, useDashStore } from '@/store'
import type { SseState } from '@/store'
import type { HerdrState, KindUsage } from '@dash/shared'
import { latestKindsDown, usageRows, usageTone } from './model'

/** data-state 沿用舊值（ok／down／unknown，e2e 依賴）；data-tone 是新的狀態語意 */
type LightState = 'ok' | 'down' | 'unknown'

const SSE_TEXT: Record<SseState, string> = { open: 'SSE 已連線', connecting: 'SSE 重連中', closed: 'SSE 已斷線' }
const SSE_TONE: Record<SseState, Tone> = { open: 'ok', connecting: 'warn', closed: 'danger' }
const HERDR_TEXT: Record<HerdrState, string> = {
  subscribed: 'herdr 事件訂閱中',
  polling: 'herdr 訂閱斷線，每 5 秒輪詢中',
  down: 'herdr 無法連線',
}
const HERDR_TONE: Record<HerdrState, Tone> = { subscribed: 'ok', polling: 'warn', down: 'danger' }

const NAV = [
  { to: '/', label: '總覽', end: true },
  { to: '/history', label: '歷史' },
  { to: '/trends', label: '趨勢' },
  { to: '/herdr', label: 'herdr' },
  { to: '/git', label: 'git' },
]

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
    isActive ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  )

/** 把頂部列高度寫進 <html> 的 --topbar-h（< lg 兩列時會變高），活動欄 sticky 與工具頁高度靠它 */
function useTopbarHeightVar() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--topbar-h', `${el.getBoundingClientRect().height}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return ref
}

function UsageChip({ kind, usage }: { kind: string; usage: KindUsage }) {
  const tone = usageTone(usage)
  return (
    <span
      data-testid="usage-chip"
      data-kind={kind}
      data-tone={tone}
      className={cn(
        'inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-full border-(length:--border-w-pill) px-2.5 text-xs whitespace-nowrap',
        tone === 'warn' ? 'border-status-warn text-status-warn-fg' : 'border-brand-blue/70',
      )}
    >
      <span data-testid={`usage-${kind}`} className="contents">
        <span className="font-semibold">{kind}</span>
        <span className={cn('font-medium tabular-nums', tone === 'normal' && 'text-muted-foreground')}>5h {formatPct(usage.fiveHourPct)}</span>
        <span className={cn('font-medium tabular-nums', tone === 'normal' && 'text-muted-foreground')}>週 {formatPct(usage.weekPct)}</span>
      </span>
    </span>
  )
}

function ConnectionChip({ sse, herdr, updated }: { sse: SseState; herdr: HerdrState | null; updated: string }) {
  const sseHint = SSE_TEXT[sse]
  const herdrHint = herdr == null ? '尚未取得 herdr 狀態' : HERDR_TEXT[herdr]
  const sseState: LightState = sse === 'open' ? 'ok' : 'down'
  const herdrState: LightState = herdr == null ? 'unknown' : herdr === 'subscribed' ? 'ok' : 'down'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          data-testid="connection-chip"
          aria-label={`${sseHint}；${herdrHint}`}
          className="inline-flex h-6 shrink-0 cursor-default items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <StatusDot data-testid="light-sse" data-state={sseState} tone={SSE_TONE[sse]} />
          <StatusDot data-testid="light-herdr" data-state={herdrState} tone={herdr == null ? 'idle' : HERDR_TONE[herdr]} />
          <span aria-hidden>SSE · herdr</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex flex-col gap-0.5">
          <span>{sseHint}</span>
          <span>{herdrHint}</span>
          <span className="tabular-nums">{updated}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

interface StatusItem {
  key: string
  node: ReactNode
  /** 收進 +N 清單時的一列 */
  row: ReactNode
}

/** 狀態群：放不下的換到第二行被裁掉（h-6 overflow-hidden），量出被裁的項目收成 +N（Popover 列全部） */
function StatusGroup({ items, empty }: { items: StatusItem[]; empty: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(0)
  const [open, setOpen] = useState(false)
  // 滑鼠移入就打開；緊接著的那一下點擊不要又把它關掉
  const hoverOpened = useRef(false)
  const keys = items.map((i) => i.key).join('|')

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const kids = [...el.querySelectorAll<HTMLElement>(':scope > [data-status-index]')]
      const top = kids[0]?.offsetTop ?? 0
      setHidden(kids.filter((k) => k.offsetTop > top).length)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [keys])

  const first = items.length - hidden
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div ref={ref} className="flex h-6 min-w-0 flex-wrap items-center gap-2 overflow-hidden">
        {items.length === 0 && empty}
        {items.map((it, i) => (
          <span
            key={it.key}
            data-status-index={i}
            data-overflow={i >= first ? '' : undefined}
            aria-hidden={i >= first ? true : undefined}
            inert={i >= first}
            className="flex min-w-0 max-w-full data-overflow:invisible"
          >
            {it.node}
          </span>
        ))}
      </div>
      {hidden > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid="status-overflow"
              aria-label={`另外 ${hidden} 項狀態`}
              onMouseEnter={() => {
                if (!open) hoverOpened.current = true
                setOpen(true)
              }}
              onClick={(e) => {
                e.preventDefault()
                setOpen(hoverOpened.current || !open)
                hoverOpened.current = false
              }}
              className="inline-flex h-5 shrink-0 cursor-pointer items-center rounded-full bg-muted px-2 text-2xs font-semibold text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              +{hidden}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-80 p-2" onMouseLeave={() => setOpen(false)}>
            <ul data-testid="status-overflow-list" className="flex flex-col gap-0.5">
              {items.map((it) => (
                <li key={it.key} className="flex min-h-8 items-center rounded-lg px-3 py-1 text-sm">
                  {it.row}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

export function TopBar({ now }: { now: number }) {
  const headerRef = useTopbarHeightVar()
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const { sse, herdr } = useConnection()
  const overview = useDashStore((s) => s.overview)
  const downs = overview ? latestKindsDown(overview.kindsDown, now) : []
  const usage = overview ? usageRows(overview.usage) : []
  const blocked = blockedAgents(overview)
  const updated = `最後更新 ${formatEpochMs(overview?.generatedAt ?? null)}`

  // < lg 導覽橫捲：選中項捲進可見範圍
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname])

  // 依嚴重度：卡住（danger）→ 熔斷（warn）→ 額度
  const items: StatusItem[] = [
    ...(blocked.length > 0
      ? [
          {
            key: 'blocked',
            node: <BlockedBadge />,
            row: (
              <Link to={herdrHref(blocked[0])} className="font-semibold text-status-danger-fg hover:underline">
                {blocked.length} 個 agent 卡住
              </Link>
            ),
          },
        ]
      : []),
    ...downs.map((d) => {
      const label = `${d.kind} 熔斷 · ${formatCountdown(d.until_epoch, now)}`
      return {
        key: `down-${d.kind}`,
        node: <StatusPill data-testid="breaker-pill" data-kind={d.kind} tone="warn" label={label} title={`${d.project} · ${d.reason}`} />,
        row: <span className="font-semibold text-status-warn-fg">{label}</span>,
      }
    }),
    ...usage.map((u) => ({
      key: `usage-${u.kind}`,
      node: <UsageChip kind={u.kind} usage={u} />,
      row: (
        <span className={cn('flex gap-2 tabular-nums', usageTone(u) === 'warn' && 'text-status-warn-fg')}>
          <span className="font-semibold">{u.kind}</span>
          <span>5h {formatPct(u.fiveHourPct)}</span>
          <span>週 {formatPct(u.weekPct)}</span>
        </span>
      ),
    })),
  ]

  return (
    <header ref={headerRef} className="sticky top-0 z-20 bg-background/80 shadow-soft backdrop-blur">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 lg:h-14 lg:flex-nowrap lg:px-6 lg:py-0">
        <Link
          to="/"
          className="inline-flex shrink-0 items-center gap-2 rounded-full text-base font-extrabold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Cloud aria-hidden className="size-6 fill-brand-violet/30 text-brand-blue" />
          dkbo 儀表板
        </Link>
        <nav
          ref={navRef}
          aria-label="主要導覽"
          className="order-last -mx-4 flex basis-full gap-1 overflow-x-auto px-4 py-1 lg:order-none lg:mx-0 lg:basis-auto lg:overflow-visible lg:p-0"
        >
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <StatusGroup
          items={items}
          empty={
            <span data-testid="usage-none" className="text-xs font-medium text-muted-foreground">
              額度 —
            </span>
          }
        />

        <div className="flex shrink-0 items-center gap-2">
          <span className="max-sm:hidden">
            <ConnectionChip sse={sse} herdr={herdr?.state ?? null} updated={updated} />
          </span>
          <span className="text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums max-xl:hidden">{updated}</span>
          <NotifyToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
