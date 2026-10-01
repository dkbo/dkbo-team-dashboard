import { useState } from 'react'
import { MonitorPlay } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useHerdrScreens } from '@/features/herdr/useHerdr'
import { projectPanes } from '@/features/overview/model'
import { ProjectCard } from '@/features/overview/ProjectCard'
import { useNow } from '@/hooks/useNow'
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
  // 縮圖：herdr 連得上才讀，所有專案共用一個 5 秒輪詢
  const herdrUp = !!data && data.herdr.state !== 'down'
  const targets = thumbsOn && herdrUp ? (data?.projects ?? []).flatMap((p) => projectPanes(p).filter((x) => x.agent)).map((x) => ({ paneId: x.paneId })) : []
  const screens = useHerdrScreens(targets, THUMBS_POLL_MS)
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 p-4">
      {herdrUp && (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="thumbs-toggle"
            aria-pressed={thumbsOn}
            onClick={toggleThumbs}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs',
              thumbsOn ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <MonitorPlay className="size-3.5" />
            畫面縮圖
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {data ? '更新失敗，顯示的是舊資料：' : '載入失敗：'}
          {error}
        </div>
      )}
      {data ? (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {data.projects.map((p) => (
            <ProjectCard key={p.name} project={p} now={now} thumbs={thumbsOn && herdrUp ? screens : undefined} />
          ))}
        </div>
      ) : (
        (loading || !error) && (
          <div data-testid="overview-loading" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
        )
      )}
    </div>
  )
}
