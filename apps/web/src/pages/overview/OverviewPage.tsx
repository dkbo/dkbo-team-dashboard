import { useState } from 'react'
import { LayoutDashboard, MonitorPlay } from 'lucide-react'
import { Banner } from '@/components/app/Banner'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/app/PageHeader'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ActivityRail } from '@/features/activity/ActivityRail'
import { useHerdrScreens } from '@/features/herdr/useHerdr'
import { splitProjects } from '@/features/overview/classify'
import { IdleProjectsCard } from '@/features/overview/IdleProjectsCard'
import { projectPanes } from '@/features/overview/model'
import { thumbPanes } from '@/features/overview/PaneThumbs'
import { ProjectCard } from '@/features/overview/ProjectCard'
import { SummaryCards } from '@/features/overview/SummaryCards'
import { runningSummary } from '@/features/overview/summary'
import { useNow } from '@/hooks/useNow'
import { formatEpochMs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useOverview } from '@/store'

const THUMBS_KEY = 'dash.overview.thumbs'
export const THUMBS_POLL_MS = 5000

function readThumbsPref(): boolean {
  try {
    return localStorage.getItem(THUMBS_KEY) !== 'off'
  } catch {
    return true
  }
}

export default function OverviewPage() {
  const { data, error, loading } = useOverview()
  const now = useNow(10_000)
  const [thumbsOn, setThumbsOn] = useState(readThumbsPref)
  const toggleThumbs = () => {
    setThumbsOn(!thumbsOn)
    try {
      localStorage.setItem(THUMBS_KEY, thumbsOn ? 'off' : 'on')
    } catch {
      // 儲存被封鎖時只在這次有效
    }
  }
  const { active, idle } = splitProjects(data?.projects ?? [])
  // 縮圖：herdr 連得上才讀，只讀活躍專案裡工作中／卡住的 pane（Q9），共用一個 5 秒輪詢
  const herdrUp = !!data && data.herdr.state !== 'down'
  const thumbs = thumbsOn && herdrUp
  const targets = thumbs ? active.flatMap((p) => thumbPanes(projectPanes(p))).map((x) => ({ paneId: x.paneId })) : []
  const screens = useHerdrScreens(targets, THUMBS_POLL_MS)
  const subtitle = data
    ? `${data.projects.length} 個專案 · ${runningSummary(data.projects).count} 個進行中任務 · 最後更新 ${formatEpochMs(data.generatedAt).slice(0, 5)}`
    : '載入中…'

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-6 lg:px-6">
      <PageHeader
        icon={LayoutDashboard}
        title="總覽"
        subtitle={subtitle}
        actions={
          herdrUp && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="thumbs-toggle"
              aria-pressed={thumbsOn}
              onClick={toggleThumbs}
              className="aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              <MonitorPlay aria-hidden />
              <span className="max-sm:sr-only">畫面縮圖</span>
            </Button>
          )
        }
      />
      {error && (
        <Banner tone={data ? 'warn' : 'danger'} title={data ? '更新失敗，顯示的是舊資料' : '載入失敗'}>
          <code className="font-mono text-xs break-all">{error}</code>
        </Banner>
      )}
      {/* DOM 照手機順序：摘要＋活躍專案 → 活動 → 閒置專案。lg 以上活動欄佔右欄兩列（sticky、自捲），閒置卡回到主欄第二列；
          第二列是 1fr，活動欄比主欄高時多出的高度落在這列，主欄與閒置卡之間不會被撐開 */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_var(--rail-w)] lg:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          {data ? (
            <>
              <SummaryCards overview={data} now={now} />
              <section data-testid="active-projects" aria-labelledby="active-projects-title" className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <h2 id="active-projects-title" className="text-lg font-extrabold">
                    活躍專案
                  </h2>
                  <Tag count={active.length} />
                </div>
                {active.length === 0 ? (
                  <Card>
                    <EmptyState icon="✨" title="沒有需要注意的專案" hint="有任務開跑、卡住或出錯時會出現在這裡" />
                  </Card>
                ) : (
                  <div className={cn('grid grid-cols-1 items-start gap-4', active.length > 1 && 'xl:grid-cols-2')}>
                    {active.map((p) => (
                      <ProjectCard key={p.name} project={p} now={now} thumbs={thumbs ? screens : undefined} />
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            (loading || !error) && (
              <div data-testid="overview-loading" className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="min-h-28 rounded-xl sm:min-h-32" />
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {[0, 1].map((i) => (
                    <Skeleton key={i} className="h-(--chart-h-md) rounded-xl" />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
        <ActivityRail
          now={now}
          className="lg:sticky lg:top-(--rail-top) lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-(--rail-max-h) lg:overflow-y-auto"
        />
        {idle.length > 0 && <IdleProjectsCard projects={idle} className="lg:col-start-1 lg:row-start-2" />}
      </div>
    </div>
  )
}
