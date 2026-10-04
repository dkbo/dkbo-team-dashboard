import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { MonitorPlay } from 'lucide-react'
import type { PaneLive } from '@dash/shared'
import { CopyCommand } from '@/components/app/CopyCommand'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { herdrHref } from '@/lib/herdr'
import { formatCost, formatPct } from '@/lib/format'

interface PaneHoverProps {
  title: string
  pane: PaneLive | null
  paneId: string | null
  extra?: ReactNode
  children: ReactNode
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0 truncate font-medium">{v}</dd>
    </>
  )
}

/** 膠囊的 hover 卡：model、effort、cost、ctx% 與可複製的 `herdr agent focus <pane>`。 */
export function PaneHover({ title, pane, paneId, extra, children }: PaneHoverProps) {
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button type="button" className="cursor-pointer rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 space-y-2 text-xs">
        <div className="text-sm font-semibold">{title}</div>
        {extra}
        {pane ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <Row k="model" v={pane.model ?? '—'} />
            <Row k="effort" v={pane.effort ?? '—'} />
            <Row k="cost" v={formatCost(pane.cost)} />
            <Row k="ctx" v={formatPct(pane.ctxPct)} />
          </dl>
        ) : (
          <p className="text-muted-foreground">herdr 裡沒有這個成員的 pane。</p>
        )}
        {pane && (
          <Link to={herdrHref(pane)} data-testid="watch-pane" className="inline-flex items-center gap-1 rounded-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            <MonitorPlay aria-hidden className="size-3.5" />
            在 herdr 頁看畫面
          </Link>
        )}
        {paneId && <CopyCommand command={`herdr agent focus ${paneId}`} />}
      </HoverCardContent>
    </HoverCard>
  )
}
