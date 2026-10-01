import type { OverviewDoc, PaneLive, ProjectView, TaskDetail, TaskSummary } from '@dash/shared'
import teamflowList from '../../../../packages/shared/fixtures/teamflow-list.json'
import opsDetail from '../../../../packages/shared/fixtures/teamflow-detail-ops.json'

export const listFixture = teamflowList as unknown as NonNullable<ProjectView['list']>
export const opsDetailFixture = opsDetail.task as unknown as TaskDetail

export function pane(over: Partial<PaneLive> = {}): PaneLive {
  return {
    paneId: 'p1',
    tabId: 't1',
    workspaceId: 'w1',
    name: null,
    agent: 'claude',
    status: 'idle',
    cwd: '/projects/teamflow',
    model: null,
    effort: null,
    cost: null,
    ctxPct: null,
    usage5hPct: null,
    usageWkPct: null,
    taskDir: null,
    member: null,
    ...over,
  }
}

export function summary(over: Partial<TaskSummary> = {}): TaskSummary {
  return {
    dir: '2026-09-25-x',
    short: 'x',
    display: 'X 任務',
    date: '2026-09-25',
    status: 'running',
    index_note: null,
    branch: 'dk/x',
    worktree: null,
    task_tab: null,
    repo_names: ['main'],
    current_wave: null,
    waves_planned: 3,
    waves_closed: 1,
    created_at: '2026-09-25T08:00',
    gate1_at: null,
    closed_at: null,
    close_result: null,
    updated_at: null,
    panes_open: 0,
    counts: { rulings: 0, autonomous_rulings: 0, minors: 0, undelivered: 0, escalations: 0 },
    ...over,
  }
}

export function detail(over: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...summary(),
    repos: [],
    brief: { goal: null, acceptance: [], owners: [], waves: [] },
    waves: [],
    members: [],
    panes: [],
    rulings: [],
    events: [],
    messages: [],
    skipped_lines: { process: 0, messages: 0 },
    ...over,
  } as TaskDetail
}

export function project(over: Partial<ProjectView> = {}): ProjectView {
  return {
    name: 'teamflow',
    path: '/projects/teamflow',
    dkboVersion: '0.17.0',
    mode: 'native',
    error: null,
    stale: false,
    fetchedAt: 1_000,
    list: listFixture,
    active: {},
    panes: [],
    otherPanes: [],
    ...over,
  }
}

export function overview(over: Partial<OverviewDoc> = {}): OverviewDoc {
  return {
    generatedAt: 1_000,
    projects: [project()],
    kindsDown: [],
    agents: [],
    usage: {},
    herdr: { state: 'subscribed', lastAt: 1_000 },
    ...over,
  }
}
