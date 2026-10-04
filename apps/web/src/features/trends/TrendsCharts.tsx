import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Coins, Cpu, Gauge } from 'lucide-react'
import type { TrendRange, TrendsResponse } from '@dash/shared'
import { ChartCard } from '@/components/app/ChartCard'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatCost, formatPct } from '@/lib/format'
import { costByDayRows, ctxRows, formatProjection, formatStamp, formatTick, hasUsage, latestPct, timeTicks, topCtx, type Series } from './model'
import { SERIES_COLORS, seriesConfig } from './palette'

/** 圖外的 HTML 圖例（§6.11）：identity 不只靠顏色，也不受 jsdom 下 recharts 不畫內容影響；色塊 swatch＋亮暗兩組 */
export function SeriesLegend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
      {series.map((s, i) => {
        const c = SERIES_COLORS[i % SERIES_COLORS.length]
        return (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full bg-(--sw-l) dark:bg-(--sw-d)"
              style={{ '--sw-l': c.light, '--sw-d': c.dark } as React.CSSProperties}
            />
            <span>{s.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

interface TimeAxisProps {
  from: number
  to: number
  range: TrendRange
}

function timeAxis({ from, to, range }: TimeAxisProps) {
  return (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={[from, to]}
      ticks={timeTicks(from, to, range)}
      interval="preserveStartEnd"
      tickLine={false}
      axisLine={false}
      minTickGap={16}
      tickFormatter={(t: number) => formatTick(t, range)}
    />
  )
}

const pctAxis = (
  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
)

const grid = <CartesianGrid vertical={false} strokeDasharray="3 3" />

const stampLabel = (_: unknown, payload: readonly { payload?: { t?: number } }[]) => {
  const t = payload?.[0]?.payload?.t
  return t == null ? '' : formatStamp(t)
}

const pctFormatter = (config: ChartConfig) =>
  function PctRow(value: unknown, name: unknown) {
    return (
      <div className="flex w-full justify-between gap-4">
        <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
        <span className="font-semibold tabular-nums">{formatPct(Number(value))}</span>
      </div>
    )
  }

const USAGE_SERIES: Series[] = [
  { key: 'fiveHourPct', label: '5h 額度' },
  { key: 'weekPct', label: '週額度' },
]
const usageConfig = seriesConfig(USAGE_SERIES)

/** 摘要列一項：「5h 37% · 預估 12:30 達 100%」，關鍵數字 body-bold +num */
function UsageSummary({ label, pct, projection, testId }: { label: string; pct: number | null; projection: string; testId: string }) {
  return (
    <span data-testid={testId} className="text-muted-foreground">
      {label} <span className="font-bold text-foreground tabular-nums">{formatPct(pct)}</span>
      {' · '}
      {projection}
    </span>
  )
}

export function UsageChart({
  kind,
  points,
  projection,
  now,
  ...axis
}: TimeAxisProps & {
  kind: string
  points: TrendsResponse['usage'][string]
  projection: TrendsResponse['projection'][string] | undefined
  now: number
}) {
  const empty = !hasUsage(points)
  return (
    <ChartCard
      data-testid={`usage-chart-${kind}`}
      icon={Gauge}
      title={`${kind} 額度`}
      height="auto"
      empty={empty && { icon: Gauge, title: `這段期間沒有 ${kind} 額度資料`, hint: `換個時間區間，或等 ${kind} 下次回報` }}
      summary={
        <>
          <UsageSummary testId="projection-5h" label="5h" pct={latestPct(points, 'fiveHourPct')} projection={formatProjection(projection?.fiveHourAt ?? null, now)} />
          <UsageSummary testId="projection-week" label="週" pct={latestPct(points, 'weekPct')} projection={formatProjection(projection?.weekAt ?? null, now)} />
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ChartContainer config={usageConfig} className="aspect-auto h-(--chart-h-md) w-full">
          <LineChart data={points} margin={{ top: 8, right: 12 }}>
            {grid}
            {timeAxis(axis)}
            {pctAxis}
            <ChartTooltip content={<ChartTooltipContent labelFormatter={stampLabel} formatter={pctFormatter(usageConfig)} />} />
            {USAGE_SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="linear"
                stroke={`var(--color-${s.key})`}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
        <SeriesLegend series={USAGE_SERIES} />
      </div>
    </ChartCard>
  )
}

export function CtxChart({ ctx, ...axis }: TimeAxisProps & { ctx: TrendsResponse['ctx'] }) {
  const { shown, hidden } = topCtx(ctx)
  const { rows, series } = ctxRows(shown)
  const config = seriesConfig(series)
  return (
    <ChartCard
      data-testid="ctx-chart"
      icon={Cpu}
      title="ctx 用量"
      description={
        <>
          每個 agent pane 一條線
          {hidden > 0 && `；只畫目前 ctx 最高的 ${shown.length} 個，另有 ${hidden} 個未顯示`}
        </>
      }
      height="auto"
      empty={series.length === 0 && { icon: Cpu, title: '這段期間沒有 ctx 資料' }}
    >
      <div className="flex flex-col gap-4">
        <ChartContainer config={config} className="aspect-auto h-(--chart-h-lg) w-full">
          <LineChart data={rows} margin={{ top: 8, right: 12 }}>
            {grid}
            {timeAxis(axis)}
            {pctAxis}
            <ChartTooltip content={<ChartTooltipContent labelFormatter={stampLabel} formatter={pctFormatter(config)} />} />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="linear"
                stroke={`var(--color-${s.key})`}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
        <SeriesLegend series={series} />
      </div>
    </ChartCard>
  )
}

export function CostByDayChart({ items }: { items: TrendsResponse['costByDay'] }) {
  const { rows, series } = costByDayRows(items)
  const config = seriesConfig(series)
  return (
    <ChartCard
      data-testid="cost-by-day-chart"
      icon={Coins}
      title="每日花費"
      description="依專案堆疊；日期為 server 本地日"
      height="auto"
      empty={rows.length === 0 && { icon: Coins, title: '這段期間沒有花費' }}
    >
      <div className="flex flex-col gap-4">
        <ChartContainer config={config} className="aspect-auto h-(--chart-h-lg) w-full">
          <BarChart data={rows} margin={{ top: 8, right: 12 }}>
            {grid}
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatCost(v)} />
            <ChartTooltip
              cursor={{ fillOpacity: 0.3 }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                      <span className="font-semibold tabular-nums">{formatCost(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="cost"
                fill={`var(--color-${s.key})`}
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={48}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ChartContainer>
        <SeriesLegend series={series} />
      </div>
    </ChartCard>
  )
}
