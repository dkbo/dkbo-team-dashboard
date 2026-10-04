import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { CalendarCheck, ChartBarStacked } from 'lucide-react'
import { ChartCard, ChartShowAll, chartBarHeight } from '@/components/app/ChartCard'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { fmtMinutes } from '@/features/task/format'
import { SERIES_COLORS } from '@/features/trends/palette'
import { SeriesLegend } from '@/features/trends/TrendsCharts'
import { RECENT_LIMIT, type DevReviewPoint } from './aggregate'

// 類別色：趨勢頁同一套色盤 slot 1（藍）與 slot 2（橘），淺／深色各自一階
const devReviewConfig = {
  dev: { label: 'dev', theme: SERIES_COLORS[0] },
  review: { label: '審查', theme: SERIES_COLORS[1] },
} satisfies ChartConfig
const DEV_REVIEW_SERIES = [
  { key: 'dev', label: 'dev' },
  { key: 'review', label: '審查' },
]

const weeklyConfig = {
  count: { label: '結案數', theme: SERIES_COLORS[0] },
} satisfies ChartConfig

const NO_DATA = { title: '沒有可畫的已結案任務', hint: '換個篩選條件' }

/** 每任務 dev vs 審查（水平堆疊長條）；data 已依 expanded 截好，total 是截前件數 */
export function DevReviewChart({
  data,
  total,
  expanded,
  onToggle,
}: {
  data: DevReviewPoint[]
  total: number
  expanded: boolean
  onToggle: () => void
}) {
  const limited = total > RECENT_LIMIT && !expanded
  return (
    <ChartCard
      data-testid="chart-dev-review"
      data-rows={data.length}
      icon={ChartBarStacked}
      title="每任務 dev vs 審查耗時"
      description={`${limited ? `最近 ${RECENT_LIMIT} 件；` : ''}各波加總（分鐘）；dev＝開波→dev 完成，審查＝派審→最後裁定`}
      action={<ChartShowAll data-testid="history-chart-toggle" total={total} expanded={expanded} onToggle={onToggle} limit={RECENT_LIMIT} />}
      height="auto"
      empty={data.length === 0 && { icon: ChartBarStacked, ...NO_DATA }}
    >
      <div className="flex flex-col gap-4">
        <ChartContainer config={devReviewConfig} className="aspect-auto w-full" style={{ height: chartBarHeight(data.length) }}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)}
            />
            <ChartTooltip
              cursor={{ fillOpacity: 0.3 }}
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{devReviewConfig[name as keyof typeof devReviewConfig]?.label ?? name}</span>
                      <span className="font-semibold tabular-nums">{fmtMinutes(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="dev" stackId="t" fill="var(--color-dev)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
            <Bar dataKey="review" stackId="t" fill="var(--color-review)" stroke="var(--card)" strokeWidth={2} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
        <SeriesLegend series={DEV_REVIEW_SERIES} />
      </div>
    </ChartCard>
  )
}

export function WeeklyChart({ data }: { data: { week: string; count: number }[] }) {
  return (
    <ChartCard
      data-testid="chart-weekly"
      icon={CalendarCheck}
      title="每週結案數"
      description="週一起算，依結案時間"
      height="md"
      empty={data.length === 0 && { icon: CalendarCheck, ...NO_DATA }}
    >
      <ChartContainer config={weeklyConfig} className="aspect-auto h-full w-full">
        <BarChart data={data} margin={{ top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tickFormatter={(w: string) => w.slice(5)} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
          <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent labelFormatter={(w) => `${String(w)} 當週`} />} />
          <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}
