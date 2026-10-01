import type { HerdrView, OverviewDoc, PaneLive, TaskDetailResponse } from '@dash/shared'

// pane.updated 只帶 herdr 即時欄位；任務對應（taskDir／member）以 overview 算好的為準，新值是 null 時沿用舊的。
function mergeOne<T extends PaneLive>(old: T, incoming: PaneLive): T {
  return {
    ...old,
    ...incoming,
    taskDir: incoming.taskDir ?? old.taskDir,
    member: incoming.member ?? old.member,
  }
}

export function mergePaneIntoPanes<T extends PaneLive>(panes: T[], incoming: PaneLive): T[] {
  const i = panes.findIndex((p) => p.paneId === incoming.paneId)
  if (i < 0) return panes
  const next = panes.slice()
  next[i] = mergeOne(panes[i], incoming)
  return next
}

export function mergePaneIntoOverview(doc: OverviewDoc, incoming: PaneLive): OverviewDoc {
  let changed = false
  const projects = doc.projects.map((p) => {
    const panes = mergePaneIntoPanes(p.panes, incoming)
    const otherPanes = mergePaneIntoPanes(p.otherPanes, incoming)
    if (panes === p.panes && otherPanes === p.otherPanes) return p
    changed = true
    return { ...p, panes, otherPanes }
  })
  const agents = mergePaneIntoPanes(doc.agents ?? [], incoming)
  if (agents !== doc.agents) changed = true
  return changed ? { ...doc, projects, agents } : doc
}

export function mergePaneIntoDetail(resp: TaskDetailResponse, incoming: PaneLive): TaskDetailResponse {
  const panes = mergePaneIntoPanes(resp.panes, incoming)
  return panes === resp.panes ? resp : { ...resp, panes }
}

/** pane.updated 帶來的狀態、token 蓋進 herdr 全貌（版面、標題不動；taskDir／member 用 herdr 頁自己的 null） */
export function mergePaneIntoHerdrView(view: HerdrView, incoming: PaneLive): HerdrView {
  let changed = false
  const workspaces = view.workspaces.map((w) => {
    if (w.id !== incoming.workspaceId) return w
    const tabs = w.tabs.map((t) => {
      const i = t.panes.findIndex((p) => p.paneId === incoming.paneId)
      if (i < 0) return t
      changed = true
      const panes = t.panes.slice()
      panes[i] = { ...panes[i], ...incoming, rect: panes[i].rect, title: panes[i].title, scrollback: panes[i].scrollback }
      return { ...t, panes }
    })
    return tabs.some((t, i) => t !== w.tabs[i]) ? { ...w, tabs } : w
  })
  return changed ? { ...view, workspaces } : view
}
