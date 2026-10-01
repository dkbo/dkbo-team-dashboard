import { describe, expect, it } from 'vitest'
import { cardAlert, groupTasks, memberPills, paneLabel, staleMinutes, taskAlert, waveInfo } from '@/features/overview/model'
import { latestKindsDown, usageRows } from '@/features/topbar/model'
import { parseLocalTs } from '@/lib/format'
import { detail, listFixture, pane, project, summary } from './builders'

describe('groupTasks', () => {
  it('running、planning 在前（running 優先），unknown 其次，done／abandoned 算已結案', () => {
    const g = groupTasks([
      summary({ dir: 'a', status: 'done' }),
      summary({ dir: 'b', status: 'planning' }),
      summary({ dir: 'c', status: 'unknown' }),
      summary({ dir: 'd', status: 'running' }),
      summary({ dir: 'e', status: 'abandoned' }),
    ])
    expect(g.active.map((t) => t.dir)).toEqual(['d', 'b'])
    expect(g.unknown.map((t) => t.dir)).toEqual(['c'])
    expect(g.closed.map((t) => t.dir)).toEqual(['e', 'a'])
  })
  it('對真實 teamflow list fixture：1 件狀態不明、10 件已結案', () => {
    const g = groupTasks(listFixture.tasks)
    expect(g.unknown).toHaveLength(1)
    expect(g.closed).toHaveLength(10)
  })
})

describe('memberPills', () => {
  const task = summary({ dir: '2026-09-25-x', short: 'x' })
  it('以 panes[].agent = <短名>-<member> 對到 pane id，再對到 herdr pane', () => {
    const d = detail({
      ...task,
      members: [
        { name: 'backend', status: 'working', wave: 2, current: null, touched: [], todo: [], blocked_by: null, notes: null, has_report: false },
        { name: 'qa', status: 'blocked', wave: 2, current: null, touched: [], todo: [], blocked_by: 'x', notes: null, has_report: false },
        { name: 'web', status: 'done', wave: 2, current: null, touched: [], todo: [], blocked_by: null, notes: null, has_report: true },
      ],
      panes: [
        { agent: 'x-backend', pane: 'P1', since_epoch: null, group: null, tab: null, slot: null },
        { agent: 'x-web', pane: 'P-dead', since_epoch: null, group: null, tab: null, slot: null },
      ],
    })
    const live = [pane({ paneId: 'P1', status: 'working', model: 'opus' })]
    const pills = memberPills(task, d, live)
    expect(pills.map((p) => [p.member, p.pane?.paneId ?? null, p.noPane, p.blocked])).toEqual([
      ['backend', 'P1', false, false],
      ['qa', null, true, true],
      ['web', null, true, false],
    ])
    expect(pills[0].paneId).toBe('P1')
    expect(pills[2].paneId).toBe('P-dead')
  })
  it('.panes 沒列但 server 已對上 taskDir／member 時沿用', () => {
    const d = detail({
      ...task,
      members: [{ name: 'fe', status: 'working', wave: 1, current: null, touched: [], todo: [], blocked_by: null, notes: null, has_report: false }],
    })
    const pills = memberPills(task, d, [pane({ paneId: 'Q', status: 'blocked', taskDir: task.dir, member: 'fe' })])
    expect(pills[0]).toMatchObject({ noPane: false, blocked: true })
  })
  it('沒有 detail 時沒有膠囊', () => {
    expect(memberPills(task, undefined, [])).toEqual([])
  })
})

describe('taskAlert／cardAlert', () => {
  it('ESCALATE、UNDELIVERED 計數或任一成員 blocked 就警示', () => {
    const base = summary({ dir: 'd', status: 'running' })
    expect(taskAlert(base, [])).toBe(false)
    expect(taskAlert(summary({ counts: { ...base.counts, escalations: 1 } }), [])).toBe(true)
    expect(taskAlert(summary({ counts: { ...base.counts, undelivered: 2 } }), [])).toBe(true)
    expect(
      taskAlert(base, [{ member: 'a', paneId: null, pane: null, stateStatus: 'working', noPane: true, blocked: true, state: null }]),
    ).toBe(true)
  })
  it('cardAlert 只看 active 任務', () => {
    const esc = { rulings: 0, autonomous_rulings: 0, minors: 0, undelivered: 0, escalations: 3 }
    const list = { ...listFixture, tasks: [summary({ dir: 'old', status: 'done', counts: esc })] }
    expect(cardAlert(project({ list }))).toBe(false)
    const list2 = { ...listFixture, tasks: [summary({ dir: 'now', status: 'running', counts: esc })] }
    expect(cardAlert(project({ list: list2 }))).toBe(true)
  })
})

describe('waveInfo', () => {
  it('進度與「波 N 進行中 · 已 M 分」的分鐘數取該波 opened_at', () => {
    const t = summary({ current_wave: 2, waves_closed: 1, waves_planned: 4 })
    const d = detail({ ...t, waves: [{ wave: 2, opened_at: '2026-09-25T10:00', dev_done_at: null, review_spawned_at: null, review_verdict_at: null, review_verdict: null, closed_at: null, tests: null, tests_ok: null, commits: [] }] })
    const now = parseLocalTs('2026-09-25T10:42')!.getTime()
    expect(waveInfo(t, d, now)).toEqual({ closed: 1, planned: 4, pct: 25, current: 2, currentMin: 42 })
    expect(waveInfo(summary({ current_wave: null, waves_planned: 0, waves_closed: 0 }), undefined, now)).toEqual({
      closed: 0,
      planned: 0,
      pct: 0,
      current: null,
      currentMin: null,
    })
  })
})

describe('staleMinutes／paneLabel', () => {
  it('過時分鐘依 fetchedAt', () => {
    expect(staleMinutes(project({ stale: true, fetchedAt: 0 }), 5 * 60_000)).toBe(5)
    expect(staleMinutes(project({ stale: false }), 5 * 60_000)).toBeNull()
    expect(staleMinutes(project({ stale: true, fetchedAt: null }), 5)).toBeNull()
  })
  it('name 為 null 時顯示 agent，再沒有就 paneId', () => {
    expect(paneLabel(pane({ name: 'leader', agent: 'claude' }))).toBe('leader')
    expect(paneLabel(pane({ name: null, agent: 'codex' }))).toBe('codex')
    expect(paneLabel(pane({ name: null, agent: null, paneId: 'wA:p3' }))).toBe('wA:p3')
  })
})

describe('topbar model', () => {
  const kd = (kind: string, until_epoch: number, project = 'p') => ({
    kind, until: '', until_epoch, exact: true, recorded_at: '', from_task: '', agent: '', reason: '', project,
  })
  it('同 kind 取最晚者、過期不列、依 kind 排序', () => {
    const now = 1_000_000
    const rows = latestKindsDown([kd('codex', 2000, 'a'), kd('codex', 5000, 'b'), kd('agy', 999), kd('claude', 3000)], now)
    expect(rows.map((r) => [r.kind, r.until_epoch])).toEqual([
      ['claude', 3000],
      ['codex', 5000],
    ])
  })
  it('usageRows 依 kind 排序', () => {
    expect(usageRows({ codex: { fiveHourPct: null, weekPct: 3 }, claude: { fiveHourPct: 40, weekPct: null } })).toEqual([
      { kind: 'claude', fiveHourPct: 40, weekPct: null },
      { kind: 'codex', fiveHourPct: null, weekPct: 3 },
    ])
  })
})
