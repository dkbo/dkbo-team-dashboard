import { useParams } from 'react-router'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Banner, BannerAction } from '@/components/app/Banner'
import { Breadcrumb } from '@/components/app/Breadcrumb'
import { EmptyState } from '@/components/app/EmptyState'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskCostCard } from '@/features/task/TaskCostCard'
import { TaskDetailView } from '@/features/task/TaskDetailView'
import { taskCostFor, taskMismatchPanes } from '@/features/trends/model'
import { useCostsAll, useTaskDetail } from '@/store'

export default function TaskPage() {
  const { project = '', dir = '' } = useParams()
  const { data, error, loading, notFound, reload } = useTaskDetail(project, dir)
  const { data: costs } = useCostsAll()

  const banner = error && (
    <Banner tone={data ? 'warn' : 'danger'} title={data ? '更新失敗，顯示的是舊資料' : '載入失敗'} action={<BannerAction onClick={reload}>重試</BannerAction>}>
      <code className="font-mono text-xs break-all">{error}</code>
    </Banner>
  )

  let body
  if (data) {
    body = (
      <TaskDetailView
        project={data.project}
        detail={data.detail}
        panes={data.panes}
        dispatch={data.dispatch}
        banner={banner}
        aside={
          <TaskCostCard
            cost={taskCostFor(costs, data.project, data.detail.task.dir)}
            mismatchPanes={taskMismatchPanes(costs?.mismatch?.panes, data.project, data.detail.task.dir)}
          />
        }
      />
    )
  } else if (notFound) {
    body = (
      <Card>
        <EmptyState
          size="page"
          icon={FileQuestion}
          title={
            <>
              找不到任務 <code className="font-mono">{dir}</code>（專案 {project}）
            </>
          }
          hint="任務資料夾可能已改名或刪除"
        />
      </Card>
    )
  } else if (error) {
    body = banner
  } else if (loading) {
    body = (
      <div data-testid="task-loading" className="flex flex-col gap-6">
        <Skeleton className="h-12 w-96 max-w-full" />
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_var(--aside-w)]">
          <div className="flex flex-col gap-6">
            <Skeleton className="h-(--chart-h-md) rounded-xl" />
            <Skeleton className="h-(--chart-h-lg) rounded-xl" />
          </div>
          <Skeleton className="h-(--chart-h-md) rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-6 lg:px-6">
      <Breadcrumb
        className="-mb-4"
        items={[
          {
            href: '/',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <ArrowLeft aria-hidden className="size-3.5" />
                總覽
              </span>
            ),
          },
          { label: project },
          { label: dir },
        ]}
      />
      {body}
    </div>
  )
}
