// AC10：分區與座位（§4.3、Q5、Q6）、擴張前兩階（§4.4）
import { describe, expect, it } from 'vitest'
import type { Substate } from '@dash/shared'
import { computeLayout, LOBBY_W, type LayoutSession, type TaskInfo } from '@/features/office-scene/layout'

const s = (id: string, over: Partial<LayoutSession> = {}): LayoutSession => ({
  id,
  project: 'atlas',
  taskDir: null,
  member: null,
  leader: false,
  substate: 'running' as Substate,
  substateSince: null,
  ...over,
})

const task = (project: string, members: string[]): TaskInfo => ({ project, display: `${project} 任務`, members, wave: { current: 1, planned: 3 } })

const TASKS = {
  'atlas/t1': task('atlas', ['dev-a', 'dev-b', 'qa']),
  'beacon/t2': task('beacon', ['backend', 'frontend', 'qa']),
}

describe('computeLayout 分區', () => {
  it('每個有任務的專案一區＋散座區＋休息區；小階房間 24.4 × 14', () => {
    const l = computeLayout({ sessions: [s('a', { taskDir: 'atlas/t1', member: 'dev-a' })], tasks: TASKS })
    expect(l.tier).toBe('small')
    expect(l.room).toEqual({ w: 20 + LOBBY_W, d: 14 })
    expect(l.zones.map((z) => `${z.kind}:${z.key}`)).toEqual(['project:atlas', 'project:beacon', 'hot:hot', 'lounge:lounge'])
    // 專案區 9.2 × 6.6，同排、區間走道 0.6
    const [a, b] = l.zones
    expect(a.rect.w).toBeCloseTo(9.2)
    expect(a.rect.d).toBeCloseTo(6.6)
    expect(b.rect.x - (a.rect.x + a.rect.w)).toBeCloseTo(0.6)
    expect(b.rect.z).toBeCloseTo(a.rect.z)
    // 前排在專案區之後
    const hot = l.zones[2]
    expect(hot.rect.z).toBeGreaterThan(a.rect.z + a.rect.d)
  })

  it('區牌標題＝專案名、副標＝任務 · 波，人數只算在場', () => {
    const l = computeLayout({
      sessions: [s('a', { taskDir: 'atlas/t1', member: 'dev-a' }), s('b', { taskDir: 'atlas/t1', member: 'qa' })],
      tasks: TASKS,
    })
    const atlas = l.zones[0]
    expect(atlas.title).toBe('atlas')
    expect(atlas.subtitle).toBe('atlas 任務 · 波 1')
    expect(atlas.count).toBe(2)
    expect(l.zones[1].count).toBe(0)
  })

  it('區內有人等你／錯誤時 needs=true', () => {
    const l = computeLayout({ sessions: [s('a', { taskDir: 'atlas/t1', member: 'dev-a', substate: 'error' })], tasks: TASKS })
    expect(l.zones[0].needs).toBe(true)
    expect(l.zones[1].needs).toBe(false)
  })

  it('同專案多任務：桌群左右並排，區寬＝桌群數 × 9.2', () => {
    const l = computeLayout({ sessions: [], tasks: { ...TASKS, 'atlas/t3': task('atlas', ['x']) } })
    const atlas = l.zones.find((z) => z.key === 'atlas')!
    expect(atlas.rect.w).toBeCloseTo(18.4)
    const groups = l.desks.filter((d) => d.kind === 'leader').map((d) => d.group)
    expect(groups).toEqual(['atlas/t1', 'atlas/t3', 'beacon/t2'])
  })

  it('超過 3 個桌群換第二排專案區', () => {
    const tasks: Record<string, TaskInfo> = {}
    for (const p of ['a', 'b', 'c', 'd']) tasks[`${p}/t`] = task(p, ['m'])
    const l = computeLayout({ sessions: [], tasks })
    const zs = l.zones.filter((z) => z.kind === 'project')
    expect(zs[3].rect.z).toBeGreaterThan(zs[0].rect.z + zs[0].rect.d)
    expect(zs[3].rect.x).toBeCloseTo(zs[0].rect.x)
  })

  it('沒有任務時不畫專案區', () => {
    const l = computeLayout({ sessions: [s('a')], tasks: {} })
    expect(l.zones.map((z) => z.kind)).toEqual(['hot', 'lounge'])
  })
})

describe('computeLayout 座位', () => {
  it('leader 坐大桌；成員依 brief 順序 2 × N 對排', () => {
    const l = computeLayout({
      sessions: [
        s('L', { taskDir: 'atlas/t1', member: 'leader-atlas', leader: true }),
        s('a', { taskDir: 'atlas/t1', member: 'dev-a' }),
        s('b', { taskDir: 'atlas/t1', member: 'dev-b' }),
        s('q', { taskDir: 'atlas/t1', member: 'qa' }),
      ],
      tasks: TASKS,
    })
    const leaderDesk = l.desks.find((d) => d.id === l.places.L.deskId)!
    expect(leaderDesk.kind).toBe('leader')
    expect(leaderDesk.w).toBeCloseTo(1.9)
    const [a, b, q] = ['a', 'b', 'q'].map((id) => l.places[id])
    // 0、1 同一欄對坐，2 下一欄
    expect(a.x).toBeCloseTo(b.x)
    expect(a.z).not.toBeCloseTo(b.z)
    expect(q.x).toBeGreaterThan(a.x)
    expect(q.z).toBeCloseTo(a.z)
    // 成員桌數＝2 × ceil(成員數 ÷ 2)，空位也畫
    const memberDesks = l.desks.filter((d) => d.group === 'atlas/t1' && d.kind === 'member')
    expect(memberDesks).toHaveLength(4)
    expect(memberDesks[0].w).toBeCloseTo(1.4)
  })

  it('座位只看成員順序，別人來去不改變', () => {
    const dev = s('b', { taskDir: 'atlas/t1', member: 'dev-b' })
    const alone = computeLayout({ sessions: [dev], tasks: TASKS }).places.b
    const crowd = computeLayout({
      sessions: [s('x', { taskDir: 'atlas/t1', member: 'qa' }), dev, s('y', { project: 'zed' })],
      tasks: TASKS,
    }).places.b
    expect(crowd).toEqual(alone)
  })

  it('無任務、任務不在場、名字不在成員表的 session 進散座區，依專案名排序、一排 4 桌', () => {
    const l = computeLayout({
      sessions: [
        s('z1', { project: 'zed' }),
        s('a1', { project: 'alpha' }),
        s('u', { project: 'atlas', taskDir: 'atlas/old', member: 'dev-a' }),
        s('n', { project: 'atlas', taskDir: 'atlas/t1', member: 'stranger' }),
        s('a2', { project: 'alpha' }),
      ],
      tasks: TASKS,
    })
    for (const id of ['z1', 'a1', 'u', 'n', 'a2']) expect(l.places[id].area).toBe('hot')
    const order = ['a1', 'a2', 'n', 'u', 'z1']
    const xs = order.map((id) => l.places[id])
    expect(xs[0].x).toBeLessThan(xs[1].x)
    expect(xs[2].x).toBeLessThan(xs[3].x)
    // 第 5 位換到下一排
    expect(xs[4].z).toBeGreaterThan(xs[0].z)
    expect(xs[4].x).toBeCloseTo(xs[0].x)
    expect(l.zones.find((z) => z.kind === 'hot')!.count).toBe(5)
  })

  it('成員超過 8 位：第 9 位起進散座區', () => {
    const members = Array.from({ length: 9 }, (_, i) => `m${i}`)
    const l = computeLayout({
      sessions: members.map((m) => s(m, { taskDir: 'atlas/t1', member: m })),
      tasks: { 'atlas/t1': task('atlas', members) },
    })
    expect(l.places.m7.area).toBe('task')
    expect(l.places.m8.area).toBe('hot')
  })

  it('done 去休息區（先到先佔），home 仍是自己座位；等你站在座位旁', () => {
    const l = computeLayout({
      sessions: [
        s('a', { taskDir: 'atlas/t1', member: 'dev-a', substate: 'done', substateSince: 200 }),
        s('b', { taskDir: 'atlas/t1', member: 'dev-b', substate: 'done', substateSince: 100 }),
        s('q', { taskDir: 'atlas/t1', member: 'qa', substate: 'waiting' }),
      ],
      tasks: TASKS,
    })
    const lounge = l.zones.find((z) => z.kind === 'lounge')!.rect
    for (const id of ['a', 'b']) {
      const p = l.places[id]
      expect(p.area).toBe('lounge')
      expect(p.x).toBeGreaterThanOrEqual(lounge.x)
      expect(p.x).toBeLessThanOrEqual(lounge.x + lounge.w)
    }
    // b 先完成，佔第一個位子
    expect(l.loungeOrder).toEqual(['b', 'a'])
    expect(l.homes.a.area).toBe('task')
    expect(l.places.q.pose).toBe('stand')
    expect(l.places.q.x).not.toBeCloseTo(l.homes.q.x)
    expect(l.places.a.pose === 'sit' || l.places.a.pose === 'stand').toBe(true)
  })
})

describe('computeLayout 擴張（§4.4 前兩階）', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => s(`h${i}`, { project: `p${String(i).padStart(2, '0')}` }))

  it('≤ 12 人小階、標記 1 倍', () => {
    const l = computeLayout({ sessions: many(12), tasks: TASKS })
    expect(l.tier).toBe('small')
    expect(l.markerScale).toBe(1)
    expect(l.present).toBe(12)
  })

  it('13–40 人中階：房間往前加深 8 格、一般標記 0.8 倍', () => {
    const l = computeLayout({ sessions: many(13), tasks: TASKS })
    expect(l.tier).toBe('medium')
    expect(l.room.d).toBeGreaterThanOrEqual(22)
    expect(l.markerScale).toBe(0.8)
  })

  it('> 40 人照第二階繼續加深，所有人都在房間裡、不重疊', () => {
    const l = computeLayout({ sessions: many(48), tasks: TASKS })
    expect(l.tier).toBe('medium')
    const pts = Object.values(l.places)
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(l.room.w)
      expect(p.z).toBeGreaterThan(0)
      expect(p.z).toBeLessThan(l.room.d)
    }
    const keys = new Set(pts.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`))
    expect(keys.size).toBe(pts.length)
  })

  it('人數只算傳進來的 session（下班已由頁面濾掉）', () => {
    expect(computeLayout({ sessions: [], tasks: {} }).present).toBe(0)
  })
})
