import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { ProjectErrorKind, ProjectView, TaskDetail, TaskSummary } from '@dash/shared'
import { Banner } from '@/components/app/Banner'
import { ProgressBar } from '@/components/app/ProgressBar'
import { StatusPill, taskStatusPill } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { ScreenState } from '@/features/herdr/useHerdr'
import { formatMinutes, formatTs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { projectSeverity } from './classify'
import { groupTasks, memberPills, paneLabel, projectPanes, skippedLines, staleMinutes, waveInfo, type MemberPill } from './model'
import { PaneThumbs } from './PaneThumbs'
import { PaneHover } from './PaneHover'

export const ERROR_LABEL: Record<ProjectErrorKind, string> = {
  missing: '路徑不存在',
  'no-dkbo': '沒有 .dkbo',
  exit: 'dk-status 非零結束',
  timeout: 'dk-status 逾時',
  json: 'JSON 解析失敗',
  schema: 'schema 版本不符',
}

export const taskHref = (project: string, dir: string) =>
  `/p/${encodeURIComponent(project)}/t/${encodeURIComponent(dir)}`

const taskName = (t: TaskSummary) => t.display ?? t.short

const linkClass = 'min-w-0 truncate rounded-md outline-none hover:text-primary hover:underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50'

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
        tone={pill.blocked ? 'danger' : undefined}
        label={pill.member}
        note={pill.noPane ? `${stateText} · 無 pane` : undefined}
        interactive
      />
    </PaneHover>
  )
}

/** §6.24 TaskRow：muted 內層列；有 blocked 成員底 danger-soft、有計數底 warn-soft，列本身不加 ring */
function TaskRow({ project, task, detail, now }: { project: ProjectView; task: TaskSummary; detail?: TaskDetail; now: number }) {
  const pills = memberPills(task, detail, projectPanes(project))
  const w = waveInfo(task, detail, now)
  const skipped = skippedLines(detail)
  const severity = pills.some((p) => p.blocked) ? 'danger' : task.counts.escalations > 0 || task.counts.undelivered > 0 ? 'warn' : null
  return (
    <li
      data-testid={`task-${task.dir}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg p-3',
        severity === 'danger' ? 'bg-status-danger-soft' : severity === 'warn' ? 'bg-status-warn-soft' : 'bg-muted',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link to={taskHref(project.name, task.dir)} className={cn(linkClass, 'text-sm font-semibold')}>
          {taskName(task)}
        </Link>
        <StatusPill size="sm" {...taskStatusPill(task.status)} />
        <Tag variant="warn" count={task.counts.escalations}>
          ESCALATE
        </Tag>
        <Tag variant="warn" count={task.counts.undelivered}>
          UNDELIVERED
        </Tag>
        {skipped > 0 && <Tag variant="warn">{skipped} 行無法解析</Tag>}
        {w.current != null && (
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            {w.currentMin != null ? `波 ${w.current} 進行中 · 已 ${formatMinutes(w.currentMin)}` : `波 ${w.current} 進行中`}
          </span>
        )}
      </div>
      <ProgressBar value={w.closed} max={w.planned} label={`${w.closed}/${w.planned} 波`} aria-label="波進度" />
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

/** 已結案／狀態不明任務的一列 */
function SimpleTaskRow({ project, task, unknown }: { project: string; task: TaskSummary; unknown?: boolean }) {
  const look = taskStatusPill(task.status)
  return (
    <li data-testid={`task-${task.dir}`} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
      <Link to={taskHref(project, task.dir)} className={linkClass}>
        {taskName(task)}
      </Link>
      <StatusPill size="sm" {...look} label={unknown ? '狀態不明' : look.label} />
      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{formatTs(task.closed_at ?? task.updated_at)}</span>
    </li>
  )
}

export function OtherSessions({ project }: { project: ProjectView }) {
  if (project.otherPanes.length === 0) return null
  return (
    <div data-testid="other-sessions" className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground">其他 session</span>
      {project.otherPanes.map((p) => (
        <PaneHover key={p.paneId} title={paneLabel(p)} pane={p} paneId={p.paneId} extra={<p className="truncate text-muted-foreground">{p.cwd}</p>}>
          <StatusPill status={p.status} label={paneLabel(p)} interactive />
        </PaneHover>
      ))}
    </div>
  )
}

/** 已結案清單：右側「已結案 N 件」切換，展開在下方；`lead` 放同一列左側（其他 session） */
export function ClosedTasks({ project, tasks, lead }: { project: string; tasks: TaskSummary[]; lead?: ReactNode }) {
  const [open, setOpen] = useState(false)
  if (tasks.length === 0) return lead ? <>{lead}</> : null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {lead ?? <span />}
        <CollapsibleTrigger className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full text-sm font-semibold text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none">
          已結案 {tasks.length} 件
          <ChevronRight aria-hidden className={cn('size-4 transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-90')} />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <TaskList project={project} tasks={tasks} />
      </CollapsibleContent>
    </Collapsible>
  )
}

/** 已結案或狀態不明任務的清單 */
export function TaskList({ project, tasks, unknown }: { project: string; tasks: TaskSummary[]; unknown?: boolean }) {
  if (tasks.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((t) => (
        <SimpleTaskRow key={t.dir} project={project} task={t} unknown={unknown} />
      ))}
    </ul>
  )
}

/** §6.28 活躍專案卡 */
export function ProjectCard({ project, now, thumbs }: { project: ProjectView; now: number; thumbs?: Record<string, ScreenState> }) {
  const groups = project.list ? groupTasks(project.list.tasks) : null
  const stale = staleMinutes(project, now)
  const severity = projectSeverity(project)
  const err = project.error

  return (
    <Card data-testid={`project-${project.name}`} data-alert={severity ?? undefined}>
      <CardHeader>
        <CardTitle>
          <span className="truncate">{project.name}</span>
          {project.dkboVersion && <Tag mono>v{project.dkboVersion}</Tag>}
        </CardTitle>
        <CardAction className="flex flex-wrap justify-end gap-1.5">
          {project.mode === 'compat' && <Tag>相容模式</Tag>}
          {stale != null && <Tag variant="warn">過時 · {stale} 分鐘前</Tag>}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {err && (
          <Banner
            tone="danger"
            size="sm"
            title={
              <>
                {ERROR_LABEL[err.kind]}
                {err.message !== err.kind && <span className="font-mono text-xs font-normal"> · {err.message}</span>}
              </>
            }
          />
        )}
        {!groups && !err && <p className="text-sm text-muted-foreground">尚無資料</p>}
        {groups &&
          (groups.active.length === 0 ? (
            <p className="text-sm text-muted-foreground">沒有進行中的任務</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.active.map((t) => (
                <TaskRow key={t.dir} project={project} task={t} detail={project.active[t.dir]} now={now} />
              ))}
            </ul>
          ))}
        {groups && <TaskList project={project.name} tasks={groups.unknown} unknown />}
        {thumbs && <PaneThumbs panes={projectPanes(project)} screens={thumbs} />}
        <ClosedTasks project={project.name} tasks={groups?.closed ?? []} lead={<OtherSessions project={project} />} />
      </CardContent>
    </Card>
  )
}
