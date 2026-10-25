// AC9 座位上限（N ≤ 6、第 13 位進散座、區牌 +K）與共用契約「場景錨點」的純函式
import { afterEach, describe, expect, it } from 'vitest'
import type { Substate } from '@dash/shared'
import { computeLayout, ZONE_W, type LayoutSession, type TaskInfo } from '@/features/office-scene/layout'
import {
  boardAnchor,
  characterInfo,
  clearCharacterOverrides,
  deskAnchor,
  deskSideAnchor,
  getCharacterOverride,
  loungeAnchor,
  pathMs,
  pathVia,
  publishSceneAnchors,
  samplePath,
  setCharacterOverride,
  walkPath,
} from '@/features/office-scene/anchors'
import { gestureAction, WALK_MAX_MS, WALK_SPEED } from '@/features/office-scene/motion'

const s = (id: string, over: Partial<LayoutSession> = {}): LayoutSession => ({
  id,
  project: 'atlas',
  taskDir: 'atlas/t1',
  member: null,
  leader: false,
  substate: 'running' as Substate,
  substateSince: null,
  ...over,
})

function crew(n: number) {
  const members = Array.from({ length: n }, (_, i) => `m${i}`)
  const tasks: Record<string, TaskInfo> = {
    'atlas/t1': { project: 'atlas', display: 'atlas 任務', members, wave: null },
    'beacon/t2': { project: 'beacon', display: 'beacon 任務', members: ['x'], wave: null },
  }
  const sessions = members.map((m) => s(m, { member: m }))
  return computeLayout({ sessions, tasks })
}

describe('AC9 座位上限', () => {
  it('8 人：全部在桌群，區寬不變', () => {
    const l = crew(8)
    expect(Object.values(l.homes).every((h) => h.area === 'task')).toBe(true)
    expect(l.zones[0].rect.w).toBeCloseTo(ZONE_W)
    expect(l.zones[0].overflow).toBe(0)
  })
  it('12 人：N＝6，全部在桌群；區依需要加寬，隔壁專案區不重疊', () => {
    const l = crew(12)
    expect(Object.values(l.homes).every((h) => h.area === 'task')).toBe(true)
    const [atlas, beacon] = l.zones
    const right = Math.max(...l.desks.filter((d) => d.group === 'atlas/t1').map((d) => d.x + d.w / 2))
    expect(right).toBeLessThanOrEqual(atlas.rect.x + atlas.rect.w)
    expect(beacon.rect.x).toBeGreaterThanOrEqual(atlas.rect.x + atlas.rect.w)
    expect(atlas.overflow).toBe(0)
  })
  it('13 人：第 13 位進散座，區牌 +1 在散座', () => {
    const l = crew(13)
    expect(l.homes.m12.area).toBe('hot')
    expect(Object.entries(l.homes).filter(([, h]) => h.area === 'task')).toHaveLength(12)
    expect(l.zones[0].overflow).toBe(1)
  })
})

describe('場景錨點', () => {
  afterEach(() => {
    publishSceneAnchors(null)
    clearCharacterOverrides()
  })

  it('沒 publish 前一律 null', () => {
    expect(deskAnchor('m0')).toBeNull()
    expect(boardAnchor('atlas/t1')).toBeNull()
    expect(loungeAnchor(0)).toBeNull()
    expect(characterInfo('m0')).toBeNull()
  })

  it('desk／side／board／lounge 都落在 layout 上', () => {
    const l = crew(4)
    publishSceneAnchors({ layout: l, subs: { m0: 'running', m1: 'running', m2: 'running', m3: 'running' }, boards: l.boards })
    expect(deskAnchor('m0')).toEqual([l.homes.m0.x, 0, l.homes.m0.z])
    expect(deskSideAnchor('m0')![0]).toBeGreaterThan(l.homes.m0.x)
    const b = l.boards['atlas/t1']
    const a = boardAnchor('atlas/t1')!
    expect(a[0]).toBeCloseTo(b.x)
    expect(a[2]).toBeGreaterThan(b.z)
    const lounge = l.zones.find((z) => z.kind === 'lounge')!.rect
    const p = loungeAnchor(0)!
    expect(p[0]).toBeGreaterThan(lounge.x)
    expect(p[2]).toBeGreaterThan(lounge.z)
    expect(characterInfo('m0')?.substate).toBe('running')
    // 走道路徑：終點正確、中間點在走道中線上
    const path = walkPath(deskAnchor('m0')!, a)
    expect(path[path.length - 1]).toEqual(a)
    expect(path.length).toBeGreaterThanOrEqual(3)
  })

  it('白板在桌群原點 +(0.2, 5.6) 起、寬 1.8', () => {
    const l = crew(2)
    const z = l.zones[0].rect
    expect(l.boards['atlas/t1']).toEqual({ x: z.x + 0.2 + 0.9, z: z.z + 5.6 })
  })

  it('pathVia：走到起點那排的走道、橫移、再走到終點；不留重複點', () => {
    expect(pathVia([7.3], [3, 0, 2], [5, 0, 4])).toEqual([
      [3, 0, 2],
      [3, 0, 7.3],
      [5, 0, 7.3],
      [5, 0, 4],
    ])
    expect(pathVia([7.3], [3, 0, 7.3], [3, 0, 4])).toEqual([
      [3, 0, 7.3],
      [3, 0, 4],
    ])
  })

  it('samplePath：依比例取點與面向；pathMs 照速度、壓在上限內', () => {
    const pts: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 2],
      [2, 0, 2],
    ]
    const mid = samplePath(pts, 0.5)
    expect(mid.x).toBeCloseTo(0)
    expect(mid.z).toBeCloseTo(2)
    const late = samplePath(pts, 0.75)
    expect(late.x).toBeCloseTo(1)
    expect(late.rotY).toBeCloseTo(Math.PI / 2)
    expect(samplePath(pts, 0.1).rotY).toBeCloseTo(0)
    expect(samplePath(pts, 1)).toMatchObject({ x: 2, z: 2 })
    expect(pathMs(pts)).toBeCloseTo((4 / WALK_SPEED) * 1000)
    expect(pathMs(pts, 1000)).toBe(1000)
    expect(pathMs([[0, 0, 0], [100, 0, 0]])).toBe(WALK_MAX_MS)
  })

  it('覆寫：set／get／清掉', () => {
    setCharacterOverride('m0', { gesture: 'thumbs-up' })
    expect(getCharacterOverride('m0')).toEqual({ gesture: 'thumbs-up' })
    setCharacterOverride('m0', null)
    expect(getCharacterOverride('m0')).toBeNull()
  })
})

describe('gestureAction', () => {
  it('各動作對到 clip／procedural', () => {
    expect(gestureAction('jump', false)).toMatchObject({ clip: 'cheer', seated: false })
    expect(gestureAction('wave', false)).toMatchObject({ clip: 'wave', seated: false })
    expect(gestureAction('nod', true)).toMatchObject({ nod: true, seated: true })
    expect(gestureAction('head-down', true)).toMatchObject({ slump: true, seated: true })
    expect(gestureAction('head-down', false)).toMatchObject({ slump: true, seated: false })
    expect(gestureAction('hold-board', false)).toMatchObject({ seated: false, board: true })
    expect(gestureAction('stand', false)).toMatchObject({ clip: 'idle', seated: false })
  })
})
