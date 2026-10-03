import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router'
import { Coins, Rocket, Siren } from 'lucide-react'
import type { OverviewDoc } from '@dash/shared'
import { formatCost } from '@/lib/format'
import { cn } from '@/lib/utils'
import { blockedSummary, runningSummary, spendSummary } from './summary'
import { useCostByDay } from './useTodaySpend'

type Tone = 'blue' | 'violet' | 'coral'

// 漸層取壓暗的一組（index.css 的 --grad-*），最亮處對白字仍有 4.5:1
const TONE_CLASS: Record<Tone, string> = {
  blue: 'from-(--grad-blue-from) to-(--grad-blue-to)',
  violet: 'from-(--grad-violet-from) to-(--grad-violet-to)',
  coral: 'from-(--grad-coral-from) to-(--grad-coral-to)',
}

interface CardProps {
  testId: string
  tone: Tone
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  value: ReactNode
  valueTestId?: string
  children: ReactNode
}

const cardClass = (tone: Tone) =>
  cn(
    'relative isolate flex min-h-36 flex-col gap-1 overflow-hidden rounded-xl bg-linear-to-br p-4 text-white shadow-pop',
    TONE_CLASS[tone],
  )

function CardBody({ icon: Icon, label, value, valueTestId, children }: Omit<CardProps, 'testId' | 'tone'>) {
  return (
    <>
      {/* 裝飾圖示：白字可能壓在它的線條上，opacity 0.12 時漸層中段到最暗端都還有 4.5:1 */}
      <Icon aria-hidden className="pointer-events-none absolute -right-5 -bottom-6 -z-10 size-32 -rotate-12 opacity-12" />
      <span className="text-sm font-semibold">{label}</span>
      <span data-testid={valueTestId} className="text-3xl font-extrabold tabular-nums">
        {value}
      </span>
      <div className="mt-auto space-y-0.5 text-sm font-medium">{children}</div>
    </>
  )
}

/** 總覽上方三張漸層摘要卡：進行中任務、今日花費、卡住的 agent */
export function SummaryCards({ overview, now }: { overview: OverviewDoc; now: number }) {
  const running = runningSummary(overview.projects)
  const spend = spendSummary(useCostByDay(), now)
  const blocked = blockedSummary(overview)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div data-testid="summary-running" className={cardClass('blue')}>
        <CardBody icon={Rocket} label="進行中任務" value={running.count}>
          {running.top.map((t) => (
            <div key={t} className="truncate">
              {t}
            </div>
          ))}
        </CardBody>
      </div>
      <div data-testid="summary-spend" className={cardClass('violet')}>
        <CardBody icon={Coins} label="今日花費" value={formatCost(spend.today)} valueTestId="summary-spend-value">
          <div>昨日 {formatCost(spend.yesterday)}</div>
        </CardBody>
      </div>
      <Link
        to={blocked.href}
        data-testid="summary-blocked"
        className={cn(cardClass('coral'), 'transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-ring/60')}
      >
        <CardBody icon={Siren} label="卡住的 agent" value={blocked.count}>
          <div className="truncate">{blocked.count === 0 ? '大家都很順 ✨' : blocked.names.join('、')}</div>
        </CardBody>
      </Link>
    </div>
  )
}
