import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { ChartLine } from 'lucide-react'
import { TREND_RANGES, type TrendRange } from '@dash/shared'
import { Banner, BannerAction } from '@/components/app/Banner'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/app/PageHeader'
import { SegmentedControl } from '@/components/app/SegmentedControl'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KindCosts, RoleCosts, TaskCostTable } from '@/features/trends/CostTables'
import { ActualCosts, ConfiguredCosts, MismatchCosts } from '@/features/trends/ModelCosts'
import { CostByDayChart, CtxChart, UsageChart } from '@/features/trends/TrendsCharts'
import { DEFAULT_RANGE, isEmptyData, parseRange, RANGE_LABEL } from '@/features/trends/model'
import { useTrendsData } from '@/features/trends/useTrendsData'
import { useOverview } from '@/store'

const RANGE_ITEMS = TREND_RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))

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
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-6 lg:px-6">
      <PageHeader
        icon={ChartLine}
        title="花費與額度趨勢"
        subtitle="dashboard 未開啟期間的花費可能遺漏，或併入之後第一次記錄"
        actions={
          <SegmentedControl<TrendRange>
            kind="group"
            aria-label="範圍"
            items={RANGE_ITEMS}
            value={range}
            onChange={(r) =>
              setParams((p) => {
                p.set('range', r)
                return p
              })
            }
          />
        }
      />

      {error && (
        <Banner tone={data ? 'warn' : 'danger'} title={data ? '更新失敗，顯示的是舊資料' : '載入失敗'} action={<BannerAction onClick={reload}>重試</BannerAction>}>
          <code className="font-mono text-xs break-all">{error}</code>
        </Banner>
      )}

      {trends && costs ? (
        isEmptyData(trends, costs) ? (
          <Card>
            <EmptyState size="page" icon="📈" title="還沒有趨勢資料" hint="dashboard 開著時每分鐘記錄一次" />
          </Card>
        ) : (
          <>
            <section aria-label="額度" className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
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
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
              <div className="min-w-0 lg:col-span-8">
                <CostByDayChart items={trends.costByDay} />
              </div>
              <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
                <KindCosts costByKind={trends.costByKind} />
                <RoleCosts costs={costs} />
              </div>
            </div>
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
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
              <Skeleton className="h-(--chart-h-lg) rounded-xl" />
              <Skeleton className="h-(--chart-h-lg) rounded-xl" />
            </div>
            <Skeleton className="h-(--chart-h-lg) rounded-xl" />
            <Skeleton className="h-(--chart-h-md) rounded-xl" />
          </div>
        )
      )}

      {trends && (
        <footer className="flex flex-wrap gap-x-4 text-xs font-medium text-muted-foreground">
          <span className="font-mono">資料目錄：{trends.dataDir}</span>
          {skipped > 0 && <span>略過 {skipped} 行無法解析的紀錄</span>}
        </footer>
      )}
    </div>
  )
}
