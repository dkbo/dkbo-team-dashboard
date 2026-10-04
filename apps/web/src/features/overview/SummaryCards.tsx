import { Coins, Gauge, Rocket, Siren } from 'lucide-react'
import type { OverviewDoc } from '@dash/shared'
import { SummaryTile } from '@/components/app/SummaryTile'
import { formatCost } from '@/lib/format'
import { blockedSummary, blockedVariant, quotaSummary, runningSummary, runningVariant, spendSummary, spendVariant } from './summary'
import { useCostByDay } from './useTodaySpend'

/** 總覽上方四張摘要卡（§1.4，順序固定）：進行中任務、今日花費、卡住的 agent、熔斷與額度 */
export function SummaryCards({ overview, now }: { overview: OverviewDoc; now: number }) {
  const running = runningSummary(overview.projects)
  const spend = spendSummary(useCostByDay(), now)
  const blocked = blockedSummary(overview)
  const quota = quotaSummary(overview.kindsDown, overview.usage, now)
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <SummaryTile data-testid="summary-running" variant={runningVariant(running.count)} icon={Rocket} label="進行中任務" value={running.count}>
        {running.count > 0 ? running.top.join('、') : '目前沒有任務在跑'}
      </SummaryTile>
      <SummaryTile
        data-testid="summary-spend"
        variant={spendVariant(spend.today)}
        icon={Coins}
        label="今日花費"
        value={<span data-testid="summary-spend-value">{formatCost(spend.today)}</span>}
      >
        昨日 {formatCost(spend.yesterday)}
      </SummaryTile>
      <SummaryTile
        data-testid="summary-blocked"
        variant={blockedVariant(blocked.count)}
        icon={Siren}
        label="卡住的 agent"
        value={blocked.count}
        href={blocked.href}
      >
        {blocked.count === 0 ? <span className="text-status-ok-fg">大家都很順 ✨</span> : blocked.names.join('、')}
      </SummaryTile>
      <SummaryTile data-testid="summary-quota" variant={quota.variant} icon={Gauge} label="熔斷與額度" value={quota.value}>
        {quota.line}
      </SummaryTile>
    </div>
  )
}
