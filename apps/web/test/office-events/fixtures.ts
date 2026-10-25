// 事件引擎測試用的手造 dk-status detail／list；時間戳相對現在產生（`YYYY-MM-DDTHH:MM` 本地時間）。
import type { ListDoc, TaskDetail, TaskMessage, TaskSummary, TaskWave } from '@dash/shared'

const pad = (n: number) => String(n).padStart(2, '0')

/** epoch ms → dk-status 的分鐘戳 */
export function ts(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 對齊到分鐘的「現在」，讓 ts(NOW) 解回來等於 NOW */
export const NOW = Math.floor(Date.now() / 60_000) * 60_000
export const MIN = 60_000

export function wave(n: number, over: Partial<TaskWave> = {}): TaskWave {
  return {
    wave: n,
    opened_at: ts(NOW - 60 * MIN),
    dev_done_at: null,
    review_spawned_at: null,
    review_verdict_at: null,
    review_verdict: null,
    closed_at: null,
    tests: null,
    tests_ok: null,
    commits: [],
    ...over,
  }
}

export function msg(from: string, to: string | null, type: string, text: string, at = NOW): TaskMessage {
  return { ts: ts(at), from, to, type, text }
}

export function summary(over: Partial<TaskSummary> = {}): TaskSummary {
  return {
    dir: '2026-10-25-demo',
    short: 'demo',
    display: '示範任務',
    date: '2026-10-25',
    status: 'running',
    index_note: null,
    branch: 'dk/demo',
    worktree: null,
    task_tab: null,
    repo_names: [],
    current_wave: 1,
    waves_planned: 3,
    waves_closed: 0,
    created_at: ts(NOW - 120 * MIN),
    gate1_at: null,
    closed_at: null,
    close_result: null,
    updated_at: ts(NOW),
    panes_open: 3,
    counts: { rulings: 0, autonomous_rulings: 0, minors: 0, undelivered: 0, escalations: 0 },
    ...over,
  }
}

export function detail(over: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...summary(),
    repos: [],
    brief: {
      goal: null,
      acceptance: [],
      owners: [],
      waves: [
        { wave: 1, type: '實作', member: 'backend', what: null, tier: 'M', done: null, review: '預設' },
        { wave: 1, type: '實作', member: 'frontend', what: null, tier: 'M', done: null, review: null },
        { wave: 2, type: '實作', member: 'frontend', what: null, tier: 'M', done: null, review: '預設' },
        { wave: 3, type: '驗收', member: 'qa', what: null, tier: 'S', done: null, review: null },
      ],
    },
    waves: [wave(1)],
    members: [],
    panes: [
      { agent: 'demo-backend', pane: 'p-be', since_epoch: null, group: null, tab: null, slot: null },
      { agent: 'demo-frontend', pane: 'p-fe', since_epoch: null, group: null, tab: null, slot: null },
    ],
    rulings: [],
    events: [],
    messages: [],
    skipped_lines: { process: 0, messages: 0 },
    ...over,
  }
}

export function listDoc(tasks: TaskSummary[]): ListDoc {
  return { schema_version: 1, dkbo_version: null, generated_at: ts(NOW), kinds_down: [], tasks }
}
