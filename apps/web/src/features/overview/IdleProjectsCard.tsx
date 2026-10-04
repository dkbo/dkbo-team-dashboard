import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ProjectView } from '@dash/shared'
import { StatusDot } from '@/components/app/StatusDot'
import { agentStatusPill } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatTs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { lastClosedAt } from './classify'
import { groupTasks, paneLabel, projectPanes } from './model'
import { OtherSessions, TaskList } from './ProjectCard'

const MAX_DOTS = 5

function SessionDots({ project }: { project: ProjectView }) {
  const panes = projectPanes(project)
  if (panes.length === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-1">
      {panes.slice(0, MAX_DOTS).map((p) => {
        const look = agentStatusPill(p.status)
        return <StatusDot key={p.paneId} tone={look.tone} pulse={look.pulse} label={`${paneLabel(p)}：${look.label}`} />
      })}
      {panes.length > MAX_DOTS && <span className="text-xs font-medium text-muted-foreground">+{panes.length - MAX_DOTS}</span>}
    </span>
  )
}

/** §6.27 閒置專案一列：整列是展開按鈕，展開後是已結案清單與其他 session（不畫縮圖） */
function IdleProjectRow({ project }: { project: ProjectView }) {
  const [open, setOpen] = useState(false)
  const groups = project.list ? groupTasks(project.list.tasks) : null
  const closed = groups?.closed.length ?? 0
  const last = lastClosedAt(project)
  const bodyId = `idle-${project.name}`
  return (
    <li className="flex flex-col">
      <button
        type="button"
        data-testid="idle-project-row"
        data-project={project.name}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="flex h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 text-left outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none"
      >
        <ChevronRight aria-hidden className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-90')} />
        <span className="min-w-0 truncate text-sm font-semibold">{project.name}</span>
        {project.dkboVersion && <Tag mono>v{project.dkboVersion}</Tag>}
        {closed > 0 && <span className="shrink-0 text-xs font-medium text-muted-foreground max-sm:hidden">已結案 {closed}</span>}
        <SessionDots project={project} />
        {last && <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{formatTs(last)}</span>}
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-2 pt-1 pb-3 pl-9">
          {groups && <TaskList project={project.name} tasks={groups.unknown} unknown />}
          {groups && <TaskList project={project.name} tasks={groups.closed} />}
          {!groups && <p className="text-sm text-muted-foreground">尚無資料</p>}
          <OtherSessions project={project} />
        </div>
      )}
    </li>
  )
}

/** 閒置專案卡：沒有進行中任務、沒有警示的專案收在這裡，每專案一列 */
export function IdleProjectsCard({ projects, className }: { projects: ProjectView[]; className?: string }) {
  return (
    <Card data-testid="idle-projects" className={className}>
      <CardHeader className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-base font-bold">閒置專案</h2>
        <Tag count={projects.length} />
        <p className="text-sm text-muted-foreground">沒有進行中任務、也沒有警示</p>
      </CardHeader>
      <CardContent className="px-2">
        <ul className="flex flex-col gap-0.5">
          {projects.map((p) => (
            <IdleProjectRow key={p.name} project={p} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
