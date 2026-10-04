import type { ReactNode } from 'react'
import type { DetailDoc, Dispatch, PaneLive } from '@dash/shared'
import { MemberTable } from './MemberTable'
import { matchMemberPanes, primaryPane } from './model'
import { TaskHeader, TaskInfoCard } from './TaskHeader'
import { TaskTabs } from './TaskTabs'
import { WaveTimeline } from './WaveTimeline'

/** 任務詳情（§4.6 任務：≥ xl 主欄＋aside-w 右欄，< xl 右欄接在主欄下） */
export function TaskDetailView({
  project,
  detail,
  panes,
  dispatch,
  aside,
  banner,
}: {
  project: string
  detail: DetailDoc
  panes: PaneLive[]
  /** 本任務的派工紀錄（成員表的「設定」欄） */
  dispatch?: Dispatch[]
  /** 右欄任務資訊卡之下（任務花費） */
  aside?: ReactNode
  /** PageHeader 下的 Banner */
  banner?: ReactNode
}) {
  const task = detail.task
  const matched = matchMemberPanes(task, panes)
  return (
    <>
      <TaskHeader project={project} task={task} pane={primaryPane(matched, task.members)} />
      {banner}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_var(--aside-w)]">
        <div className="flex min-w-0 flex-col gap-6">
          <WaveTimeline task={task} />
          <MemberTable task={task} panes={matched} dispatch={dispatch} />
          <TaskTabs task={task} />
        </div>
        <aside aria-label="任務資訊" className="flex min-w-0 flex-col gap-6">
          <TaskInfoCard task={task} />
          {aside}
        </aside>
      </div>
    </>
  )
}
