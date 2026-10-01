import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { TREND_RANGES } from '@dash/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KindCosts, RoleCosts, TaskCostTable } from '@/features/trends/CostTables'
import { ActualCosts, ConfiguredCosts, MismatchCosts } from '@/features/trends/ModelCosts'
import { CostByDayChart, CtxChart, UsageChart } from '@/features/trends/TrendsCharts'
import { DEFAULT_RANGE, isEmptyData, parseRange, RANGE_LABEL } from '@/features/trends/model'
import { useTrendsData } from '@/features/trends/useTrendsData'
import { useOverview } from '@/store'

export default function TrendsPage() {
  const [params, setParams] = useSearchParams()
  const parsed = parseRange(params.get('range'))
  const range = parsed ?? DEFAULT_RANGE

  // 網址沒帶或帶了不合法的 range：回落 24h 並改寫網址（不留歷史紀錄）
  useEffect(() => {
    if (parsed == null)
      setParams(
        (p) => {
          p.set('range', DEFAULT_RANGE)
          return p
        },
        { replace: true },
      )
  }, [parsed, setParams])

  const { data, error, loading, reload } = useTrendsData(range)
  const { data: overview } = useOverview()

  const trends = data?.trends
  const costs = data?.costs
  // 兩支 API 讀同一批樣本檔，壞行數取較大者而不相加
  const skipped = Math.max(trends?.skipped ?? 0, costs?.skipped ?? 0)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">花費與額度趨勢</h1>
        <div role="group" aria-label="範圍" className="flex gap-1">
          {TREND_RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === range ? 'secondary' : 'ghost'}
              aria-pressed={r === range}
              onClick={() =>
                setParams((p) => {
                  p.set('range', r)
                  return p
                })
              }
            >
              {RANGE_LABEL[r]}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">dashboard 未開啟期間的花費可能遺漏，或併入之後第一次記錄</p>

      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          <span>
            {data ? '更新失敗，顯示的是舊資料：' : '載入失敗：'}
            {error}
          </span>
          <Button size="sm" variant="outline" onClick={reload}>
            重試
          </Button>
        </div>
      )}

      {trends && costs ? (
        isEmptyData(trends, costs) ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">尚無資料：dashboard 開著時每分鐘記錄一次</CardContent>
          </Card>
        ) : (
          <>
            <section aria-label="額度" className="grid items-start gap-4 lg:grid-cols-2">
              {Object.entries(trends.usage)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([kind, points]) => (
                  <UsageChart
                    key={kind}
                    kind={kind}
                    points={points}
                    projection={trends.projection[kind]}
                    now={trends.generatedAt}
                    from={trends.from}
                    to={trends.to}
                    range={range}
                  />
                ))}
            </section>
            <CtxChart ctx={trends.ctx} from={trends.from} to={trends.to} range={range} />
            <div className="grid items-start gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <CostByDayChart items={trends.costByDay} />
              </div>
              <div className="flex flex-col gap-4">
                <KindCosts costByKind={trends.costByKind} />
                <RoleCosts costs={costs} />
              </div>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <ActualCosts byActual={costs.byActual} />
              <ConfiguredCosts byConfigured={costs.byConfigured} />
            </div>
            <MismatchCosts mismatch={costs.mismatch} projects={overview?.projects} />
            <TaskCostTable costs={costs} projects={overview?.projects} />
          </>
        )
      ) : (
        loading &&
        !error && (
          <div data-testid="trends-loading" className="flex flex-col gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
        )
      )}

      {trends && (
        <footer className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span className="font-mono">資料目錄：{trends.dataDir}</span>
          {skipped > 0 && <span>略過 {skipped} 行無法解析的紀錄</span>}
        </footer>
      )}
    </div>
  )
}
