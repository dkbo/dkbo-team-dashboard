import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { TaskDetail } from '@dash/shared'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { TASK_STATUS_LABEL, fmtTs } from './format'
import { skippedTotal } from './model'

const STATUS_TONE: Record<TaskDetail['status'], string> = {
  running: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  planning: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  done: 'bg-muted text-muted-foreground',
  abandoned: 'bg-muted text-muted-foreground line-through',
  unknown: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

export function TaskStatusBadge({ status }: { status: TaskDetail['status'] }) {
  return <Badge className={cn(STATUS_TONE[status] ?? STATUS_TONE.unknown)}>{TASK_STATUS_LABEL[status] ?? status}</Badge>
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-sm">{children}</dd>
    </div>
  )
}

export function TaskHeader({ project, task }: { project: string; task: TaskDetail }) {
  const skipped = skippedTotal(task.skipped_lines)
  const closed = task.status === 'done' || task.status === 'abandoned'
  return (
    <Card data-testid="task-header">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{project}</span>
          <TaskStatusBadge status={task.status} />
          {skipped > 0 && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
              <AlertTriangle />
              {skipped} 行無法解析
            </Badge>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{task.display ?? task.dir}</h1>
        {task.brief.goal && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{task.brief.goal}</p>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Meta label="資料夾">{task.dir}</Meta>
          <Meta label="分支">{task.branch ?? '—'}</Meta>
          <Meta label="建立">{fmtTs(task.created_at)}</Meta>
          <Meta label="關卡① 放行">{fmtTs(task.gate1_at)}</Meta>
          <Meta label="波進度">
            {task.waves_closed}/{task.waves_planned} 波
          </Meta>
          {closed ? (
            <Meta label={`結案 ${fmtTs(task.closed_at)}`}>{task.close_result ?? '—'}</Meta>
          ) : (
            <Meta label="最後更新">{fmtTs(task.updated_at)}</Meta>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
