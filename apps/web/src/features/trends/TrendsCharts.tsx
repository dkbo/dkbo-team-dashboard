import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { TrendRange, TrendsResponse } from '@dash/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatCost, formatPct } from '@/lib/format'
import { costByDayRows, ctxRows, formatProjection, formatStamp, formatTick, timeTicks, topCtx, type Series } from './model'
import { SERIES_COLORS, seriesConfig } from './palette'

/** 圖外的 HTML 圖例：identity 不只靠顏色，也不受 jsdom 下 recharts 不畫內容影響 */
export function SeriesLegend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s, i) => {
        const c = SERIES_COLORS[i % SERIES_COLORS.length]
        return (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px] bg-(--sw-l) dark:bg-(--sw-d)"
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

const stampLabel = (_: unknown, payload: readonly { payload?: { t?: number } }[]) => {
  const t = payload?.[0]?.payload?.t
  return t == null ? '' : formatStamp(t)
}

const pctFormatter = (config: ChartConfig) =>
  function PctRow(value: unknown, name: unknown) {
    return (
      <div className="flex w-full justify-between gap-4">
        <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
        <span className="font-mono">{formatPct(Number(value))}</span>
      </div>
    )
  }

const USAGE_SERIES: Series[] = [
  { key: 'fiveHourPct', label: '5h 額度' },
  { key: 'weekPct', label: '週額度' },
]
const usageConfig = seriesConfig(USAGE_SERIES)

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
  return (
    <Card data-testid={`usage-chart-${kind}`}>
      <CardHeader>
        <CardTitle>{kind} 額度</CardTitle>
        <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
          <span data-testid="projection-5h">5h：{formatProjection(projection?.fiveHourAt ?? null, now)}</span>
          <span data-testid="projection-week">週：{formatProjection(projection?.weekAt ?? null, now)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ChartContainer config={usageConfig} className="aspect-auto h-52 w-full">
          <LineChart data={points} margin={{ top: 8, right: 12 }}>
            <CartesianGrid vertical={false} />
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
      </CardContent>
    </Card>
  )
}

export function CtxChart({ ctx, ...axis }: TimeAxisProps & { ctx: TrendsResponse['ctx'] }) {
  const { shown, hidden } = topCtx(ctx)
  const { rows, series } = ctxRows(shown)
  const config = seriesConfig(series)
  return (
    <Card data-testid="ctx-chart">
      <CardHeader>
        <CardTitle>ctx 用量</CardTitle>
        <CardDescription>
          每個 agent pane 一條線
          {hidden > 0 && `；只畫目前 ctx 最高的 ${shown.length} 個，另有 ${hidden} 個未顯示`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {series.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">這段期間沒有 ctx 資料</p>
        ) : (
          <>
            <ChartContainer config={config} className="aspect-auto h-60 w-full">
              <LineChart data={rows} margin={{ top: 8, right: 12 }}>
                <CartesianGrid vertical={false} />
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
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function CostByDayChart({ items }: { items: TrendsResponse['costByDay'] }) {
  const { rows, series } = costByDayRows(items)
  const config = seriesConfig(series)
  return (
    <Card data-testid="cost-by-day-chart">
      <CardHeader>
        <CardTitle>每日花費</CardTitle>
        <CardDescription>依專案堆疊；日期為 server 本地日</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">這段期間沒有花費</p>
        ) : (
          <>
            <ChartContainer config={config} className="aspect-auto h-60 w-full">
              <BarChart data={rows} margin={{ top: 8, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatCost(v)} />
                <ChartTooltip
                  cursor={{ fillOpacity: 0.3 }}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <div className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                          <span className="font-mono">{formatCost(Number(value))}</span>
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
          </>
        )}
      </CardContent>
    </Card>
  )
}
