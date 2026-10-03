import { useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import type { ProjectErrorKind, ProjectView, TaskDetail, TaskSummary } from '@dash/shared'
import { StatusPill } from '@/components/app/StatusPill'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ScreenState } from '@/features/herdr/useHerdr'
import { formatMinutes, formatTs } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  cardAlert,
  groupTasks,
  memberPills,
  paneLabel,
  projectPanes,
  skippedLines,
  staleMinutes,
  taskAlert,
  waveInfo,
  type MemberPill,
} from './model'
import { PaneThumbs } from './PaneThumbs'
import { PaneHover } from './PaneHover'

const ERROR_LABEL: Record<ProjectErrorKind, string> = {
  missing: '路徑不存在',
  'no-dkbo': '沒有 .dkbo',
  exit: 'dk-status 非零結束',
  timeout: 'dk-status 逾時',
  json: 'JSON 解析失敗',
  schema: 'schema 版本不符',
}

const TASK_STATUS_LABEL: Record<TaskSummary['status'], string> = {
  running: '進行中',
  planning: '規劃中',
  done: '已完成',
  abandoned: '已放棄',
  unknown: '狀態不明',
}

export const taskHref = (project: string, dir: string) =>
  `/p/${encodeURIComponent(project)}/t/${encodeURIComponent(dir)}`

const taskName = (t: TaskSummary) => t.display ?? t.short

function MemberCapsule({ pill }: { pill: MemberPill }) {
  const stateText = pill.stateStatus ?? '—'
  return (
    <PaneHover
      title={pill.member}
      pane={pill.pane}
      paneId={pill.paneId}
      extra={
        <p className="text-muted-foreground">
          state：{stateText}
          {pill.state?.current ? ` · ${pill.state.current}` : ''}
        </p>
      }
    >
      <StatusPill
        status={pill.noPane ? 'unknown' : pill.pane?.status}
        label={pill.member}
        note={pill.noPane ? `${stateText} · 無 pane` : undefined}
        className={cn(pill.blocked && 'ring-2 ring-red-500/60')}
      />
    </PaneHover>
  )
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 font-mono text-[0.7rem]',
        n > 0 ? 'bg-orange-500/15 font-semibold text-orange-700 dark:text-orange-300' : 'text-muted-foreground',
      )}
    >
      {label} {n}
    </span>
  )
}

function ActiveTaskRow({ project, task, detail, now }: { project: ProjectView; task: TaskSummary; detail?: TaskDetail; now: number }) {
  const pills = memberPills(task, detail, projectPanes(project))
  const alert = taskAlert(task, pills)
  const w = waveInfo(task, detail, now)
  const skipped = skippedLines(detail)
  return (
    <li
      data-testid={`task-${task.dir}`}
      className={cn('space-y-2 rounded-xl bg-muted p-3 shadow-soft', alert && 'bg-orange-500/10 ring-2 ring-orange-500/70')}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link to={taskHref(project.name, task.dir)} className="min-w-0 truncate font-medium hover:underline">
          {taskName(task)}
        </Link>
        <Badge variant={task.status === 'running' ? 'default' : 'secondary'}>{TASK_STATUS_LABEL[task.status]}</Badge>
        {skipped > 0 && (
          <Badge variant="outline" className="text-amber-700 dark:text-amber-300">
            {skipped} 行無法解析
          </Badge>
        )}
        <span className="ml-auto flex gap-1">
          <Count label="ESCALATE" n={task.counts.escalations} />
          <Count label="UNDELIVERED" n={task.counts.undelivered} />
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <div
          role="progressbar"
          aria-label="波進度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={w.pct}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-card"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${w.pct}%` }} />
        </div>
        <span className="font-mono tabular-nums">
          {w.closed}/{w.planned} 波
        </span>
        {w.current != null && (
          <span className="text-muted-foreground">
            {w.currentMin != null ? `波 ${w.current} 進行中 · 已 ${formatMinutes(w.currentMin)}` : `波 ${w.current} 進行中`}
          </span>
        )}
      </div>
      {pills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <MemberCapsule key={p.member} pill={p} />
          ))}
        </div>
      )}
    </li>
  )
}

function SimpleTaskRow({ project, task, tag }: { project: string; task: TaskSummary; tag?: string }) {
  return (
    <li data-testid={`task-${task.dir}`} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-1.5 text-sm">
      <Link to={taskHref(project, task.dir)} className="min-w-0 truncate hover:underline">
        {taskName(task)}
      </Link>
      <Badge variant="outline" className="text-muted-foreground">
        {tag ?? TASK_STATUS_LABEL[task.status]}
      </Badge>
      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
        {formatTs(task.closed_at ?? task.updated_at)}
      </span>
    </li>
  )
}

function OtherSessions({ project }: { project: ProjectView }) {
  if (project.otherPanes.length === 0) return null
  return (
    <div data-testid="other-sessions" className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">其他 session</div>
      <div className="flex flex-wrap gap-1.5">
        {project.otherPanes.map((p) => (
          <PaneHover key={p.paneId} title={paneLabel(p)} pane={p} paneId={p.paneId} extra={<p className="truncate text-muted-foreground">{p.cwd}</p>}>
            <StatusPill status={p.status} label={paneLabel(p)} />
          </PaneHover>
        ))}
      </div>
    </div>
  )
}

export function ProjectCard({ project, now, thumbs }: { project: ProjectView; now: number; thumbs?: Record<string, ScreenState> }) {
  const [open, setOpen] = useState(false)
  const groups = project.list ? groupTasks(project.list.tasks) : null
  const stale = staleMinutes(project, now)
  const alert = cardAlert(project)

  return (
    <Card
      data-testid={`project-${project.name}`}
      data-alert={String(alert)}
      className={cn(alert && 'ring-2 ring-orange-500 dark:ring-orange-400', project.error && !alert && 'ring-destructive/40')}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="truncate">{project.name}</span>
          {project.dkboVersion && <span className="font-mono text-xs font-normal text-muted-foreground">v{project.dkboVersion}</span>}
        </CardTitle>
        <CardAction className="flex flex-wrap justify-end gap-1">
          {project.mode === 'compat' && <Badge variant="secondary">相容模式</Badge>}
          {project.error && <Badge variant="destructive">錯誤</Badge>}
          {stale != null && (
            <Badge variant="outline" className="text-amber-700 dark:text-amber-300">
              過時 · {stale} 分鐘前
            </Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.error && (
          <div role="alert" className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">{ERROR_LABEL[project.error.kind]}</div>
              {project.error.message !== project.error.kind && <div className="font-mono text-xs break-all">{project.error.message}</div>}
            </div>
          </div>
        )}
        {!groups && !project.error && <p className="text-sm text-muted-foreground">尚無資料</p>}
        {groups && (
          <>
            {groups.active.length === 0 ? (
              <p className="text-sm text-muted-foreground">沒有進行中的任務</p>
            ) : (
              <ul className="space-y-2">
                {groups.active.map((t) => (
                  <ActiveTaskRow key={t.dir} project={project} task={t} detail={project.active[t.dir]} now={now} />
                ))}
              </ul>
            )}
            {groups.unknown.length > 0 && (
              <ul className="space-y-1.5">
                {groups.unknown.map((t) => (
                  <SimpleTaskRow key={t.dir} project={project.name} task={t} tag="狀態不明" />
                ))}
              </ul>
            )}
            {groups.closed.length > 0 && (
              <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground">
                  已結案 {groups.closed.length} 件 {open ? '▾' : '▸'}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="mt-1.5 space-y-1.5">
                    {groups.closed.map((t) => (
                      <SimpleTaskRow key={t.dir} project={project.name} task={t} />
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
        <OtherSessions project={project} />
        {thumbs && <PaneThumbs panes={projectPanes(project)} screens={thumbs} />}
      </CardContent>
    </Card>
  )
}
