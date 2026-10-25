import { describe, expect, it } from 'vitest'
import type { GitSummary, TaskDetail } from '@dash/shared'
import { buildObjects, keepSame, type ObjectSources } from '@/features/office/objects'
import { buildTasks } from '@/features/office/model'
import { detail, officeSession, overview, pane, project, summary } from '../shell/builders'

// 本地時間 2026-10-25 12:00
const NOW = new Date(2026, 9, 25, 12, 0).getTime()
const min = 60_000
const ts = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const DIR = '2026-10-25-pay'
const task = (over: Partial<TaskDetail> = {}) => detail({ dir: DIR, short: 'pay', display: '結帳流程改版', waves_closed: 1, waves_planned: 3, ...over })

function src(over: Partial<ObjectSources> = {}): ObjectSources {
  const doc = over.overview ?? overview({ projects: [project({ name: 'atlas', list: null, active: { [DIR]: task() } })] })
  return { overview: doc, tasks: buildTasks(doc, NOW), sessions: [], details: {}, git: null, todaySpend: null, now: NOW, ...over }
}

const gitRow = (over: Partial<GitSummary> = {}): GitSummary => ({
  project: 'atlas',
  path: '/p',
  error: null,
  branch: 'main',
  ahead: 0,
  behind: 0,
  counts: { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 },
  worktrees: 1,
  ...over,
})

describe('白板（E3）', () => {
  it('沒事：tone null、無 chip；波 closed／planned、href 開任務詳情', () => {
    const b = buildObjects(src()).boards[DIR]
    expect(b).toEqual({
      project: 'atlas',
      display: '結帳流程改版',
      closed: 1,
      planned: 3,
      tone: null,
      chips: [],
      closedState: null,
      closedAt: null,
      href: '/p/atlas/t/2026-10-25-pay',
    })
  })

  it('danger：桌群內有 needsYou 的 session（等你、有 pane 的錯誤）；無 pane 的錯誤不算', () => {
    const sessions = [
      officeSession({ id: 'a', project: 'atlas', taskDir: DIR, substate: 'waiting' }),
      officeSession({ id: 'b', project: 'atlas', taskDir: DIR, substate: 'error', paneId: 'pb' }),
      officeSession({ id: 's:c', project: 'atlas', taskDir: DIR, substate: 'error', paneId: null }),
      officeSession({ id: 'd', project: 'other', taskDir: DIR, substate: 'waiting' }),
    ]
    const b = buildObjects(src({ sessions })).boards[DIR]
    expect(b.tone).toBe('danger')
    expect(b.chips).toEqual([
      { label: '1 等你', tone: 'danger', icon: 'hand' },
      { label: '1 錯誤', tone: 'danger', icon: 'alert' },
    ])
  })

  it('danger：未解 BLOCKED／TIMEOUT（用契約「未解判定」）；warn：未解 ESCALATE；兩者並存用 danger、chip 都列', () => {
    const t0 = ts(NOW - 5 * min)
    const blocked = task({
      panes: [{ agent: 'pay-dev', paneId: 'p1' } as unknown as TaskDetail['panes'][number]],
      messages: [{ ts: t0, from: 'dk-watch', to: 'leader', type: 'BLOCKED', text: 'from dk-watch: pay-dev 卡在審批' }],
    })
    const esc = task({ messages: [{ ts: t0, from: 'pay-qa', to: 'leader', type: 'ESCALATE', text: '要選 A 或 B' }] })
    const both = task({ panes: blocked.panes, messages: [...blocked.messages, ...esc.messages] })

    const withDetail = (d: TaskDetail) => buildObjects(src({ details: { [`atlas/${DIR}`]: d } })).boards[DIR]
    expect(withDetail(blocked)).toMatchObject({ tone: 'danger', chips: [{ label: '1 卡住', tone: 'danger', icon: 'alert' }] })
    expect(withDetail(esc)).toMatchObject({ tone: 'warn', chips: [{ label: 'ESCALATE', tone: 'warn', icon: 'escalate' }] })
    expect(withDetail(both)).toMatchObject({
      tone: 'danger',
      chips: [
        { label: '1 卡住', tone: 'danger' },
        { label: 'ESCALATE', tone: 'warn' },
      ],
    })
    // 解除：leader→X 的 DECISION
    const decided = task({ messages: [...esc.messages, { ts: t0, from: 'leader', to: 'pay-qa', type: 'DECISION', text: '選 A' }] })
    expect(withDetail(decided).tone).toBeNull()
  })

  it('store 沒有 detail 時用 overview active 的那份判 E3', () => {
    const esc = task({ messages: [{ ts: ts(NOW - min), from: 'pay-qa', to: 'leader', type: 'ESCALATE', text: '?' }] })
    const doc = overview({ projects: [project({ name: 'atlas', list: null, active: { [DIR]: esc } })] })
    expect(buildObjects(src({ overview: doc })).boards[DIR].tone).toBe('warn')
  })
})

describe('結案保留（E8）：buildTasks 與白板', () => {
  const closedList = (closedAt: number, result: 'done' | 'abandoned') => ({
    schema_version: 1,
    dkbo_version: null,
    generated_at: ts(NOW),
    kinds_down: [],
    tasks: [summary({ dir: DIR, short: 'pay', display: '結帳流程改版', status: result, closed_at: ts(closedAt), close_result: result, waves_closed: 3, waves_planned: 3 })],
  })

  it('closed_at 10 分鐘內的 done／abandoned 留在 tasks 與 boards，成員用快取 detail；標 closedState／closedAt', () => {
    const at = NOW - 4 * min
    const doc = overview({ projects: [project({ name: 'atlas', list: closedList(at, 'done'), active: {} })] })
    const cached = task({ brief: { goal: null, acceptance: [], owners: [], waves: [{ wave: 1, type: '實作', member: 'dev-a', what: null, tier: null, done: null, review: null }] } })
    const tasks = buildTasks(doc, NOW, { details: { [`atlas/${DIR}`]: cached }, sessions: [] })
    expect(tasks[DIR]).toMatchObject({ project: 'atlas', members: ['dev-a'], wave: { current: 3, planned: 3 }, closedState: 'done', closedAt: at })
    const b = buildObjects(src({ overview: doc, tasks })).boards[DIR]
    expect(b).toMatchObject({ closed: 3, planned: 3, closedState: 'done', closedAt: at, tone: null })

    const ab = overview({ projects: [project({ name: 'atlas', list: closedList(at, 'abandoned'), active: {} })] })
    expect(buildTasks(ab, NOW)[DIR]).toMatchObject({ closedState: 'abandoned' })
  })

  it('沒有快取 detail：成員退回 summary 那個任務仍開著的 session member', () => {
    const doc = overview({ projects: [project({ name: 'atlas', list: closedList(NOW - min, 'done'), active: {} })] })
    const sessions = [officeSession({ id: 'x', project: 'atlas', taskDir: DIR, member: 'qa' }), officeSession({ id: 'y', project: 'atlas', taskDir: DIR, member: 'qa' })]
    expect(buildTasks(doc, NOW, { details: {}, sessions })[DIR].members).toEqual(['qa'])
  })

  it('超過 10 分鐘就移除；進行中任務 closedState null', () => {
    const doc = overview({ projects: [project({ name: 'atlas', list: closedList(NOW - 11 * min, 'done'), active: {} })] })
    expect(buildTasks(doc, NOW)).toEqual({})
    expect(buildTasks(src().overview, NOW)[DIR]).toMatchObject({ closedState: null, closedAt: null })
  })
})

describe('監控牆、檔案室、公告板', () => {
  it('監控牆：herdr pane 數、卡住數 > 0 出 danger chip；herdr 離線「—」；輪詢 warn chip', () => {
    const agents = [pane({ paneId: 'a', status: 'blocked' }), pane({ paneId: 'b', status: 'working' }), pane({ paneId: 'c', status: 'blocked' })].map((p) => ({ ...p, project: null }))
    const m = buildObjects(src({ overview: overview({ agents }) })).monitor
    expect(m).toEqual({ value: '3', unit: 'pane', lamp: null, chip: { label: '2 卡住', tone: 'danger', icon: 'alert' }, href: '/herdr' })
    expect(buildObjects(src({ overview: overview({ agents: [], herdr: { state: 'down', lastAt: null } }) })).monitor).toMatchObject({ value: '—', unit: 'herdr 離線', chip: null })
    expect(buildObjects(src({ overview: overview({ agents: [], herdr: { state: 'polling', lastAt: 1 } }) })).monitor).toMatchObject({ value: '0', chip: { label: '輪詢', tone: 'warn' } })
  })

  it('檔案室：done＋abandoned 數，今天有結案 neutral chip「今天 +N」', () => {
    const list = {
      schema_version: 1,
      dkbo_version: null,
      generated_at: ts(NOW),
      kinds_down: [],
      tasks: [
        summary({ dir: 'a', status: 'done', closed_at: ts(NOW - 60 * min) }),
        summary({ dir: 'b', status: 'abandoned', closed_at: ts(NOW - 30 * 60 * min) }),
        summary({ dir: 'c', status: 'running' }),
      ],
    }
    const a = buildObjects(src({ overview: overview({ projects: [project({ list })] }) })).archive
    expect(a).toEqual({ value: '2', unit: '已結案', lamp: null, chip: { label: '今天 +1', tone: 'neutral' }, href: '/history' })
  })

  it('公告板：進行中任務數；有卡住 danger chip、只有 ESCALATE warn chip', () => {
    const list = { schema_version: 1, dkbo_version: null, generated_at: ts(NOW), kinds_down: [], tasks: [summary({ dir: DIR, status: 'running' }), summary({ dir: 'z', status: 'planning' })] }
    const doc = overview({ projects: [project({ name: 'atlas', list, active: { [DIR]: task() } })] })
    expect(buildObjects(src({ overview: doc })).notice).toEqual({ value: '2', unit: '個任務進行中', lamp: null, chip: null, href: '/' })
    const waiting = [officeSession({ project: 'atlas', taskDir: DIR, substate: 'waiting' })]
    expect(buildObjects(src({ overview: doc, sessions: waiting })).notice.chip).toEqual({ label: '1 卡住', tone: 'danger', icon: 'alert' })
    const esc = task({ messages: [{ ts: ts(NOW - min), from: 'pay-qa', to: 'leader', type: 'ESCALATE', text: '?' }] })
    expect(buildObjects(src({ overview: doc, details: { [`atlas/${DIR}`]: esc } })).notice.chip).toEqual({ label: '1 ESCALATE', tone: 'warn', icon: 'escalate' })
    const empty = overview({ projects: [project({ list: { ...list, tasks: [] } })] })
    expect(buildObjects(src({ overview: empty })).notice).toMatchObject({ value: '0', unit: '沒有進行中任務' })
  })
})

describe('git 櫃（E5）', () => {
  const g = (rows: GitSummary[]) => buildObjects(src({ git: rows })).git
  it('衝突 danger ＞ 未推送 warn ＞ 未提交／detached warn；乾淨熄燈；沒資料「—」', () => {
    const conflict = gitRow({ project: 'beacon', counts: { staged: 0, unstaged: 0, untracked: 0, conflicts: 2 } })
    const ahead = gitRow({ ahead: 3 })
    const dirty = gitRow({ counts: { staged: 1, unstaged: 2, untracked: 0, conflicts: 0 } })
    const detached = gitRow({ branch: null })
    expect(g([ahead, conflict, dirty])).toEqual({ value: '2', lamp: 'danger', chip: { label: '衝突', tone: 'danger', icon: 'git' }, href: '/git?p=beacon' })
    expect(g([dirty, ahead, gitRow({ project: 'b2', ahead: 2 })])).toEqual({ value: '5', lamp: 'warn', chip: { label: '未推送', tone: 'warn', icon: 'git' }, href: '/git' })
    expect(g([dirty, gitRow({ project: 'b', counts: { staged: 0, unstaged: 0, untracked: 4, conflicts: 0 } })])).toMatchObject({ value: '7', lamp: 'warn', chip: { label: '未提交' } })
    expect(g([detached])).toMatchObject({ value: '1', lamp: 'warn', chip: { label: 'detached' } })
    expect(g([gitRow(), gitRow({ error: { kind: 'not-git', message: 'x' }, counts: null })])).toEqual({ value: '乾淨', lamp: null, chip: null, href: '/git' })
    expect(g([])).toMatchObject({ value: '乾淨', lamp: null })
    expect(buildObjects(src({ git: null })).git).toMatchObject({ value: '—', unit: '讀取中', lamp: null })
  })
})

describe('電表（E4）', () => {
  const m = (over: Partial<ObjectSources>) => buildObjects(src(over)).meter
  it('今日花費＋最高額度 %；≥ 80% warn chip；任一 kind 熔斷＝「跳電 · kind」warn（不變紅）', () => {
    const usage = { claude: { fiveHourPct: 37, weekPct: 12 }, codex: { fiveHourPct: null, weekPct: 20 } }
    expect(m({ todaySpend: 42.1, overview: overview({ usage }) })).toEqual({ value: '$42.10', unit: '今日 · 額度 37%', lamp: null, chip: null, href: '/trends' })
    const hot = { claude: { fiveHourPct: 84.4, weekPct: 12 } }
    expect(m({ todaySpend: 42.1, overview: overview({ usage: hot }) })).toMatchObject({ unit: '今日', lamp: null, chip: { label: '額度 84%', tone: 'warn' } })
    const down = [{ project: 'atlas', kind: 'codex', until: '', until_epoch: NOW / 1000 + 600, exact: true, recorded_at: '', from_task: '', agent: '', reason: '' }]
    expect(m({ todaySpend: 42.1, overview: overview({ usage: hot, kindsDown: down }) })).toMatchObject({ lamp: 'warn', chip: { label: '跳電 · codex', tone: 'warn', icon: 'zap' } })
    // 已過期的熔斷不算
    const old = [{ ...down[0], until_epoch: NOW / 1000 - 1 }]
    expect(m({ overview: overview({ kindsDown: old }) })).toMatchObject({ value: '—', unit: '今日', lamp: null, chip: null })
  })
})

describe('keepSame：值沒變沿用舊參照（AC4／AC11 靜止 0 幀）', () => {
  it('同內容回傳同一個物件；只有某件變了時其他件沿用舊參照', () => {
    const a = buildObjects(src({ todaySpend: 1 }))
    const b = keepSame(a, buildObjects(src({ todaySpend: 1 })))
    expect(b).toBe(a)
    const c = keepSame(a, buildObjects(src({ todaySpend: 2 })))
    expect(c).not.toBe(a)
    expect(c.meter).not.toBe(a.meter)
    expect(c.monitor).toBe(a.monitor)
    expect(c.boards).toBe(a.boards)
    expect(keepSame(null, a)).toBe(a)
  })
})
