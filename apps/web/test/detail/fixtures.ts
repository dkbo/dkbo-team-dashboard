// 手造的 dk-status v1 detail 與 herdr pane，形狀照 .dkbo/status-schema.md 與共用契約。

export function makeTask(over: Record<string, unknown> = {}) {
  return {
    dir: '2026-09-20-demo',
    short: 'demo',
    display: '示範任務',
    date: '2026-09-20',
    status: 'running',
    index_note: '—',
    branch: 'dk/demo',
    worktree: '/tmp/demo/.worktrees/demo',
    task_tab: 'w1:t1',
    repo_names: ['main'],
    current_wave: 2,
    waves_planned: 2,
    waves_closed: 1,
    created_at: '2026-09-20T08:00',
    gate1_at: '2026-09-20T08:30',
    closed_at: null,
    close_result: null,
    updated_at: '2026-09-20T10:10',
    panes_open: 2,
    counts: { rulings: 2, autonomous_rulings: 1, minors: 1, undelivered: 0, escalations: 0 },
    repos: [{ name: 'main', path: '/tmp/demo', worktree: '/tmp/demo/.worktrees/demo', base: 'abc1234' }],
    brief: {
      goal: '把示範功能做完\n第二行目標',
      acceptance: [
        { text: 'AC1 首頁可開', checked: true },
        { text: 'AC2 測試全綠', checked: false },
      ],
      owners: [
        { member: 'backend', writable: ['src/api/**'], readonly: ['src/shared/**'], exclusive: ['port:4000'] },
        { member: 'qa', writable: ['e2e/**'], readonly: [], exclusive: [] },
      ],
      waves: [
        { wave: 1, type: '實作', member: 'backend', what: '做 API', tier: 'M', done: '測試綠', review: '預設' },
        { wave: 2, type: '實作', member: 'qa', what: '驗收', tier: 'S', done: 'e2e 綠', review: 'skip: 純驗收' },
      ],
    },
    waves: [
      {
        wave: 1,
        opened_at: '2026-09-20T08:40',
        dev_done_at: '2026-09-20T09:20',
        review_spawned_at: '2026-09-20T09:21',
        review_verdict_at: '2026-09-20T09:30',
        review_verdict: 'a: ok (Important 0)',
        closed_at: '2026-09-20T09:35',
        tests: 'ok (pnpm -r test)',
        tests_ok: true,
        commits: [{ repo: null, sha: 'b169571' }],
      },
      {
        wave: 2,
        opened_at: '2026-09-20T09:40',
        dev_done_at: null,
        review_spawned_at: null,
        review_verdict_at: null,
        review_verdict: null,
        closed_at: null,
        tests: null,
        tests_ok: null,
        commits: [],
      },
    ],
    members: [
      {
        name: 'backend',
        status: 'working',
        wave: 2,
        current: '寫 API 路由',
        touched: ['src/api/a.ts'],
        todo: ['錯誤碼對齊', '補測試'],
        blocked_by: null,
        notes: null,
        has_report: false,
      },
      {
        name: 'qa',
        status: 'blocked',
        wave: 2,
        current: '等 backend',
        touched: [],
        todo: [],
        blocked_by: 'backend 未完成',
        notes: null,
        has_report: false,
      },
    ],
    panes: [
      { agent: 'demo-backend', pane: 'w1-p2', since_epoch: 1790000000, group: 'dev', tab: '1', slot: 'a' },
    ],
    rulings: [
      { ts: '2026-09-20T08:10', text: '用 Hono 不用 Express', autonomous: false },
      { ts: '2026-09-20T09:32', text: '[自主] Minor 延後處理', autonomous: true },
    ],
    events: [
      { ts: '2026-09-20T08:00', kind: 'task-new', text: 'task-new demo' },
      { ts: '2026-09-20T08:40', kind: 'wave-open', text: 'wave-open 1' },
      { ts: '2026-09-20T09:35', kind: 'wave-close', text: 'wave-close 1 tests ok (pnpm -r test) 1 agents closed' },
    ],
    messages: [
      { ts: '2026-09-20T09:19', from: 'demo-backend', to: 'leader-demo', type: 'DONE', text: '波1 完成' },
      { ts: '2026-09-20T09:25', from: 'demo-qa', to: 'demo-backend', type: 'BUG', text: '登入 500' },
      { ts: '2026-09-20T09:26', from: 'leader-demo', to: null, type: 'ACK', text: '' },
      { ts: '2026-09-20T09:28', from: 'demo-backend', to: 'demo-qa', type: 'FIXED', text: '根因：少驗 token' },
    ],
    skipped_lines: { process: 0, messages: 0 },
    ...over,
  }
}

export function makeDetailDoc(over: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    dkbo_version: '0.17.0',
    generated_at: '2026-09-20T10:10',
    kinds_down: [],
    task: makeTask(over),
  }
}

export function makePane(over: Record<string, unknown> = {}) {
  return {
    paneId: 'w1-p2',
    tabId: 'w1:t1',
    workspaceId: 'w1',
    name: 'demo-backend',
    agent: 'claude',
    status: 'working',
    cwd: '/tmp/demo/.worktrees/demo',
    model: 'opus',
    effort: 'high',
    cost: 1.25,
    ctxPct: 42,
    usage5hPct: 10,
    usageWkPct: 20,
    taskDir: '2026-09-20-demo',
    member: 'backend',
    ...over,
  }
}

export function makeDispatch(over: Record<string, unknown> = {}) {
  return {
    agent: 'demo-backend',
    member: 'backend',
    role: 'backend',
    kind: 'claude',
    tier: 'M',
    model: 'opus',
    effort: 'medium',
    at: new Date(2026, 8, 20, 8, 40).getTime(),
    notes: [] as string[],
    ...over,
  }
}
