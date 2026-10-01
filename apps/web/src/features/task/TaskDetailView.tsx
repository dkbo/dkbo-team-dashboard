import type { ReactNode } from 'react'
import type { DetailDoc, Dispatch, PaneLive } from '@dash/shared'
import { MemberTable } from './MemberTable'
import { TaskHeader } from './TaskHeader'
import { TaskTabs } from './TaskTabs'
import { WaveTimeline } from './WaveTimeline'

export function TaskDetailView({
  project,
  detail,
  panes,
  dispatch,
  afterMembers,
}: {
  project: string
  detail: DetailDoc
  panes: PaneLive[]
  /** 本任務的派工紀錄（成員表的「設定」欄） */
  dispatch?: Dispatch[]
  /** 插在成員表之後（任務花費） */
  afterMembers?: ReactNode
}) {
  const task = detail.task
  return (
    <div className="flex flex-col gap-4">
      <TaskHeader project={project} task={task} />
      <WaveTimeline task={task} />
      <MemberTable task={task} panes={panes} dispatch={dispatch} />
      {afterMembers}
      <TaskTabs task={task} />
    </div>
  )
}
