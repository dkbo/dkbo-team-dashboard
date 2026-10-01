import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskCostCard } from '@/features/task/TaskCostCard'
import { TaskDetailView } from '@/features/task/TaskDetailView'
import { taskCostFor, taskMismatchPanes } from '@/features/trends/model'
import { useCostsAll, useTaskDetail } from '@/store'

export default function TaskPage() {
  const { project = '', dir = '' } = useParams()
  const { data, error, loading, notFound, reload } = useTaskDetail(project, dir)
  const { data: costs } = useCostsAll()

  let body
  if (data) {
    body = (
      <TaskDetailView
        project={data.project}
        detail={data.detail}
        panes={data.panes}
        dispatch={data.dispatch}
        afterMembers={
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
        <CardContent className="py-8 text-center text-muted-foreground">
          找不到任務 <code>{dir}</code>（專案 {project}）
        </CardContent>
      </Card>
    )
  } else if (error) {
    body = null
  } else if (loading) {
    body = (
      <div data-testid="task-loading" className="flex flex-col gap-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" aria-label="回總覽" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-4" />
          總覽
        </Link>
        <span>/</span>
        <span>{project}</span>
        <span>/</span>
        <span className="truncate font-mono">{dir}</span>
      </nav>
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
      {body}
    </div>
  )
}
