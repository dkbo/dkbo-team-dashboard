import { describe, expect, it } from 'vitest'
import {
  buildTasks,
  finderOptions,
  groupSessions,
  kindCounts,
  narrowFinder,
  parseOfficeParams,
  sceneSessions,
  stateCounts,
  toneOf,
  writeOfficeParams,
} from '@/features/office/model'
import { SUBSTATE_META } from '@/lib/substate'
import { detail, officeSession, overview, project } from '../shell/builders'

const NOW = 10_000_000_000
const min = 60_000

describe('網址參數', () => {
  it('解析 kind／project／needs／focus／view 與三個 f_ 參數；不認得的值退回預設', () => {
    const p = parseOfficeParams(new URLSearchParams('kind=codex&project=atlas&needs=1&focus=p1&view=list&f_project=a&f_task=t&f_role=qa'))
    expect(p).toEqual({ kind: 'codex', project: 'atlas', needs: true, focus: 'p1', view: 'list', fProject: 'a', fTask: 't', fRole: 'qa' })
    expect(parseOfficeParams(new URLSearchParams('kind=gemini&view=x&needs=0'))).toEqual({
      kind: 'all',
      project: null,
      needs: false,
      focus: null,
      view: '3d',
      fProject: null,
      fTask: null,
      fRole: null,
    })
  })

  it('寫回時預設值不進網址、其他參數保留', () => {
    const next = writeOfficeParams(new URLSearchParams('kind=codex&other=1'), { kind: 'all', needs: true, view: 'list', fRole: 'qa' })
    expect(next.toString()).toBe('other=1&needs=1&view=list&f_role=qa')
    expect(writeOfficeParams(next, { needs: false, view: '3d', fRole: null }).toString()).toBe('other=1')
  })
})

describe('場景與清單的篩選', () => {
  const s = [
    officeSession({ id: 'a', kind: 'claude', project: 'atlas', substate: 'waiting' }),
    officeSession({ id: 'b', kind: 'codex', project: 'atlas', substate: 'running' }),
    officeSession({ id: 'c', kind: 'claude', project: 'beacon', substate: 'error' }),
    // 閒置 3 小時＝下班
    officeSession({ id: 'd', kind: 'claude', project: 'beacon', substate: 'idle', lastEventAt: NOW - 180 * min }),
    // done 15 分＝有效閒置，但沒下班
    officeSession({ id: 'e', kind: 'codex', project: 'beacon', substate: 'done', lastEventAt: NOW - 15 * min }),
  ]
  const base = parseOfficeParams(new URLSearchParams())

  it('場景：去掉下班的人，依 kind、project 篩；needs 只留等你／錯誤', () => {
    expect(sceneSessions(s, base, NOW).map((x) => x.id)).toEqual(['a', 'b', 'c', 'e'])
    expect(sceneSessions(s, { ...base, kind: 'claude' }, NOW).map((x) => x.id)).toEqual(['a', 'c'])
    expect(sceneSessions(s, { ...base, project: 'beacon' }, NOW).map((x) => x.id)).toEqual(['c', 'e'])
    expect(sceneSessions(s, { ...base, needs: true }, NOW).map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('kind 計數：套專案篩選、不含下班；回傳 all／claude／codex 與 needs 數', () => {
    expect(kindCounts(s, { ...base, kind: 'codex' }, NOW)).toEqual({ all: 4, claude: 2, codex: 2, needs: 0, offDuty: 1 })
    expect(kindCounts(s, { ...base, project: 'atlas' }, NOW)).toEqual({ all: 2, claude: 1, codex: 1, needs: 1, offDuty: 0 })
  })

  it('找人清單 FilterChip 只縮清單：專案／任務／角色；任務 __none__ 表示無任務 session', () => {
    const list = [
      officeSession({ id: 'a', project: 'atlas', taskDir: '2026-10-01-pay', role: 'backend' }),
      officeSession({ id: 'b', project: 'atlas', taskDir: null, role: null }),
      officeSession({ id: 'c', project: 'beacon', taskDir: '2026-10-02-ui', role: 'qa' }),
    ]
    const f = (fProject: string | null, fTask: string | null, fRole: string | null) =>
      narrowFinder(list, { ...base, fProject, fTask, fRole }).map((x) => x.id)
    expect(f(null, null, null)).toEqual(['a', 'b', 'c'])
    expect(f('atlas', null, null)).toEqual(['a', 'b'])
    expect(f('atlas', '__none__', null)).toEqual(['b'])
    expect(f(null, '2026-10-02-ui', null)).toEqual(['c'])
    expect(f(null, null, 'backend')).toEqual(['a'])
  })

  it('FilterChip 選項：專案、目前專案範圍的任務（含無任務數）、現場有的角色', () => {
    const list = [
      officeSession({ id: 'a', project: 'atlas', taskDir: '2026-10-01-pay', role: 'backend' }),
      officeSession({ id: 'b', project: 'atlas', taskDir: '2026-10-01-pay', role: 'qa' }),
      officeSession({ id: 'x', project: 'atlas', taskDir: null, role: null }),
      officeSession({ id: 'c', project: 'beacon', taskDir: '2026-10-02-ui', role: 'qa' }),
    ]
    expect(finderOptions(list, null)).toEqual({
      projects: [
        { value: 'atlas', count: 3 },
        { value: 'beacon', count: 1 },
      ],
      tasks: [
        { value: '2026-10-01-pay', project: 'atlas', count: 2 },
        { value: '2026-10-02-ui', project: 'beacon', count: 1 },
        { value: '__none__', project: null, count: 1 },
      ],
      roles: [
        { value: 'backend', count: 1 },
        { value: 'qa', count: 2 },
      ],
    })
    expect(finderOptions(list, 'beacon').tasks).toEqual([{ value: '2026-10-02-ui', project: 'beacon', count: 1 }])
  })
})

describe('分組與計數', () => {
  it('三組：需要你（等你、錯誤）→ 工作中 → 完成·中斷·閒置；組內依 §1.2 排序再依名字', () => {
    const list = [
      officeSession({ id: 'z', member: 'zed', substate: 'thinking' }),
      officeSession({ id: 'e', member: 'eve', substate: 'error' }),
      officeSession({ id: 'w', member: 'wes', substate: 'waiting' }),
      officeSession({ id: 'r', member: 'amy', substate: 'running' }),
      officeSession({ id: 'b', member: 'bob', substate: 'running' }),
      officeSession({ id: 'i', member: 'ian', substate: 'interrupted', lastEventAt: NOW - min }),
      officeSession({ id: 'd', member: 'dan', substate: 'done', lastEventAt: NOW - 20 * min }), // 有效閒置
      officeSession({ id: 'd2', member: 'don', substate: 'done', lastEventAt: NOW - min }),
    ]
    const g = groupSessions(list, NOW)
    expect(g.needs.map((x) => x.id)).toEqual(['w', 'e'])
    expect(g.working.map((x) => x.id)).toEqual(['r', 'b', 'z'])
    expect(g.rest.map((x) => x.id)).toEqual(['i', 'd2', 'd'])
  })

  it('StateCounts：依有效細狀態計數、不含等你／錯誤、0 的不列、照稿排序（思考→執行→回覆→完成→中斷→閒置）', () => {
    const list = [
      officeSession({ id: 'a', substate: 'thinking' }),
      officeSession({ id: 'b', substate: 'thinking' }),
      officeSession({ id: 'c', substate: 'waiting' }),
      officeSession({ id: 'd', substate: 'done', lastEventAt: NOW - 20 * min }),
      officeSession({ id: 'e', substate: 'running' }),
    ]
    expect(stateCounts(list, NOW)).toEqual([
      { substate: 'thinking', count: 2 },
      { substate: 'running', count: 1 },
      { substate: 'idle', count: 1 },
    ])
  })
})

describe('AC2：無 pane 的錯誤衰退（hasPane＝paneId != null）', () => {
  const err = (id: string, paneId: string | null, m: number) =>
    officeSession({ id, paneId, member: id, substate: 'error', error: 'boom', substateSince: NOW - m * min, lastEventAt: NOW - m * min })
  const list = [err('n9', null, 9), err('n11', null, 11), err('n120', null, 120), err('p9', 'pp9', 9), err('p11', 'pp11', 11), err('p120', 'pp120', 120)]
  const base = parseOfficeParams(new URLSearchParams())

  it('需要你組只收有 pane 的錯誤；無 pane 的 9 分仍是錯誤但不算需要你、11 分轉閒置', () => {
    const g = groupSessions(list, NOW)
    expect(g.needs.map((x) => x.id)).toEqual(['p11', 'p120', 'p9'])
    expect(g.rest.map((x) => x.id)).toEqual(['n9', 'n11', 'n120'])
  })

  it('2 小時下班只套無 pane；場景「只看需要你」與 needs 計數用 needsYou', () => {
    expect(sceneSessions(list, base, NOW).map((x) => x.id)).toEqual(['n9', 'n11', 'p9', 'p11', 'p120'])
    expect(sceneSessions(list, { ...base, needs: true }, NOW).map((x) => x.id)).toEqual(['p9', 'p11', 'p120'])
    expect(kindCounts(list, base, NOW)).toMatchObject({ all: 5, needs: 3, offDuty: 1 })
  })

  it('StateCounts：無 pane 的錯誤 10 分內歸「中斷」（ruling 11:57）、11 分起算閒置；有 pane 的錯誤在需要你、不計', () => {
    expect(stateCounts(list, NOW)).toEqual([
      { substate: 'interrupted', count: 1 },
      { substate: 'idle', count: 2 },
    ])
  })

  it('toneOf：需要你才是 danger；無 pane 的錯誤用中斷的語氣', () => {
    expect(toneOf(err('n9', null, 9), NOW)).toBe(SUBSTATE_META.interrupted.tone)
    expect(toneOf(err('p9', 'pp9', 9), NOW)).toBe('danger')
    expect(toneOf(officeSession({ substate: 'waiting' }), NOW)).toBe('danger')
    expect(toneOf(officeSession({ substate: 'running' }), NOW)).toBe('ok')
  })
})

describe('buildTasks（OfficeScene 的 tasks）', () => {
  it('key＝任務 dir（scene 以 taskDir 查）；members 依 brief 波次表順序取不重複 member，沒有波次表退回 members[].name；wave 取 closed／planned', () => {
    const withWaves = detail({
      dir: '2026-10-24-office',
      display: '辦公室',
      waves_closed: 1,
      waves_planned: 3,
      brief: {
        goal: null,
        acceptance: [],
        owners: [],
        waves: [
          { wave: 1, type: '實作', member: 'backend', what: null, tier: null, done: null, review: null },
          { wave: 1, type: '實作', member: 'it', what: null, tier: null, done: null, review: null },
          { wave: 2, type: '實作', member: 'backend', what: null, tier: null, done: null, review: null },
          { wave: 2, type: '審查', member: null, what: null, tier: null, done: null, review: null },
          { wave: 3, type: '驗證', member: 'qa', what: null, tier: null, done: null, review: null },
        ],
      },
    })
    const noWaves = detail({
      dir: '2026-10-20-x',
      display: null,
      waves_planned: 0,
      members: [
        { name: 'dev-a', status: null, wave: null, current: null, touched: [], todo: [], blocked_by: null, notes: null, has_report: false },
        { name: 'dev-b', status: null, wave: null, current: null, touched: [], todo: [], blocked_by: null, notes: null, has_report: false },
      ],
    })
    const doc = overview({
      projects: [
        project({ name: 'dash', active: { '2026-10-24-office': withWaves } }),
        project({ name: 'atlas', active: { '2026-10-20-x': noWaves } }),
      ],
    })
    expect(buildTasks(doc, NOW)).toEqual({
      '2026-10-24-office': { project: 'dash', display: '辦公室', members: ['backend', 'it', 'qa'], wave: { current: 1, planned: 3 }, closedState: null, closedAt: null },
      '2026-10-20-x': { project: 'atlas', display: 'x', members: ['dev-a', 'dev-b'], wave: null, closedState: null, closedAt: null },
    })
    expect(buildTasks(null, NOW)).toEqual({})
  })
})
