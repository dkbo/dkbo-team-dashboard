import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { fmtMinutes } from '@/features/task/format'
import type { DevReviewPoint } from './aggregate'

// 類別色：dataviz 參考色盤 slot 1（藍）與 slot 2（橘），淺／深色各自一階，已過 validate_palette。
const devReviewConfig = {
  dev: { label: 'dev', theme: { light: '#3d8fe0', dark: '#4290e2' } },
  review: { label: '審查', theme: { light: '#f0804f', dark: '#dc6a3c' } },
} satisfies ChartConfig

const weeklyConfig = {
  count: { label: '結案數', theme: { light: '#3d8fe0', dark: '#4290e2' } },
} satisfies ChartConfig

const ROW_PX = 28

export function DevReviewChart({ data }: { data: DevReviewPoint[] }) {
  return (
    <Card data-testid="chart-dev-review">
      <CardHeader>
        <CardTitle>每任務 dev vs 審查耗時</CardTitle>
        <CardDescription>各波加總（分鐘）；dev＝開波→dev 完成，審查＝派審→最後裁定</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">沒有資料</p>
        ) : (
          <ChartContainer
            config={devReviewConfig}
            className="aspect-auto w-full"
            style={{ height: Math.max(160, data.length * ROW_PX + 64) }}
          >
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
              <CartesianGrid horizontal={false} />
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
                        <span className="text-muted-foreground">
                          {devReviewConfig[name as keyof typeof devReviewConfig]?.label ?? name}
                        </span>
                        <span className="font-mono">{fmtMinutes(Number(value))}</span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="dev" stackId="t" fill="var(--color-dev)" stroke="var(--card)" strokeWidth={2} />
              <Bar
                dataKey="review"
                stackId="t"
                fill="var(--color-review)"
                stroke="var(--card)"
                strokeWidth={2}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

export function WeeklyChart({ data }: { data: { week: string; count: number }[] }) {
  return (
    <Card data-testid="chart-weekly">
      <CardHeader>
        <CardTitle>每週結案數</CardTitle>
        <CardDescription>週一起算，依結案時間</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">沒有資料</p>
        ) : (
          <ChartContainer config={weeklyConfig} className="aspect-auto h-56 w-full">
            <BarChart data={data} margin={{ top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickFormatter={(w: string) => w.slice(5)}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <ChartTooltip
                cursor={{ fillOpacity: 0.3 }}
                content={<ChartTooltipContent labelFormatter={(w) => `${String(w)} 當週`} />}
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
