// AC7 物件座標（§4.6）、AC8 標籤密度（E2 修正版）與碰撞讓位（§6.14）的純函式
import { describe, expect, it } from 'vitest'
import { computeLayout, type LayoutSession, type TaskInfo } from '@/features/office-scene/layout'
import { labelBox, labelDensity, objectPlacements, resolveLabelYield } from '@/features/office-scene/objects/placement'

const task = (project: string, members: string[]): TaskInfo => ({ project, display: `${project} 任務`, members, wave: { current: 1, planned: 3 } })
const s = (id: string, over: Partial<LayoutSession> = {}): LayoutSession => ({
  id,
  project: 'atlas',
  taskDir: null,
  member: null,
  leader: false,
  substate: 'running',
  substateSince: null,
  ...over,
})

describe('objectPlacements（§4.6）', () => {
  const l = computeLayout({ sessions: [s('a', { taskDir: 'atlas/t1', member: 'dev-a' })], tasks: { 'atlas/t1': task('atlas', ['dev-a']), 'beacon/t2': task('beacon', ['qa']) } })
  const p = objectPlacements(l)

  it('六種物件；大廳四件在 x ≥ 20、電表在休息區', () => {
    expect(Object.keys(p.fixed).sort()).toEqual(['archive', 'git', 'meter', 'monitor', 'notice'])
    expect(p.fixed.monitor.center[0]).toBeCloseTo(22.1)
    expect(p.fixed.archive.center[0]).toBeCloseTo(22.2)
    expect(p.fixed.archive.center[2]).toBeCloseTo(4.2)
    expect(p.fixed.git.center).toEqual([20.6, 0, 6.4])
    expect(p.fixed.notice.center).toEqual([21, 0, 11.4])
    expect(p.fixed.meter.center[0]).toBeCloseTo(14)
    expect(p.fixed.meter.center[2]).toBeCloseTo(8.4)
    expect(p.fixed.git.placement).toBe('below')
    expect(p.fixed.monitor.align).toBe('end')
  })

  it('每個任務一塊白板，跟著桌群', () => {
    expect(Object.keys(p.boards).sort()).toEqual(['atlas/t1', 'beacon/t2'])
    expect(p.boards['atlas/t1'].center[0]).toBeCloseTo(l.boards['atlas/t1'].x)
    // process 12:30 ruling（偏離 §4.6）：標籤在板下中央、三角朝上
    expect(p.boards['atlas/t1'].placement).toBe('below')
    expect(p.boards['atlas/t1'].label[1]).toBeCloseTo(0.6)
    expect(p.boards['atlas/t1'].label[2]).toBeGreaterThan(p.boards['atlas/t1'].center[2])
  })

  it('中階房間加深：大廳物件留在原座標', () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`h${i}`))
    const m = computeLayout({ sessions: many, tasks: {} })
    expect(m.tier).toBe('medium')
    expect(objectPlacements(m).fixed.notice.center).toEqual([21, 0, 11.4])
  })

  it('辦公區比 20 寬（3 區並排）時大廳跟著右移', () => {
    const w = computeLayout({ sessions: [], tasks: { 'a/1': task('a', ['x']), 'b/1': task('b', ['x']), 'c/1': task('c', ['x']) } })
    const fx = objectPlacements(w).fixed
    expect(fx.monitor.center[0]).toBeCloseTo(w.officeW + 2.1)
    expect(fx.monitor.center[0] + 1.5).toBeLessThanOrEqual(w.room.w)
  })
})

describe('labelDensity（E2）', () => {
  it('預設視角 compact、拉近 ≤ 0.8 fit 距離 full、遠到標記縮點的程度只留異常', () => {
    expect(labelDensity({ distance: 100, fitDistance: 100, base: 1 })).toBe('compact')
    expect(labelDensity({ distance: 80, fitDistance: 100, base: 1 })).toBe('full')
    expect(labelDensity({ distance: 150, fitDistance: 100, base: 1 })).toBe('compact')
    // 中階 base 0.8：0.8 × 100 / 140 < 0.6
    expect(labelDensity({ distance: 140, fitDistance: 100, base: 0.8 })).toBe('alert-only')
  })
})

describe('resolveLabelYield（§6.14 碰撞讓位）', () => {
  const marker = { x: 100, y: 100, w: 80, h: 30 }
  it('沒撞到 none；撞到角色標記先縮點；點也撞到就隱藏', () => {
    const y = resolveLabelYield(
      [
        { id: 'far', x: 300, y: 300, w: 60, h: 28, dot: { x: 330, y: 320, w: 12, h: 12 } },
        { id: 'edge', x: 150, y: 110, w: 60, h: 28, dot: { x: 200, y: 140, w: 12, h: 12 } },
        { id: 'under', x: 90, y: 95, w: 60, h: 28, dot: { x: 120, y: 110, w: 12, h: 12 } },
      ],
      [marker],
    )
    expect(y).toEqual({ far: 'none', edge: 'dot', under: 'hidden' })
  })
  it('物件標籤彼此撞到：後者縮點（不壓到前者）', () => {
    const y = resolveLabelYield(
      [
        { id: 'a', x: 0, y: 0, w: 60, h: 28, dot: { x: 25, y: 22, w: 12, h: 12 } },
        { id: 'b', x: 40, y: 0, w: 60, h: 28, dot: { x: 90, y: 22, w: 12, h: 12 } },
      ],
      [],
    )
    expect(y).toEqual({ a: 'none', b: 'dot' })
  })
  it('labelBox：above 在錨點上方、below 在下方、end 往左推；框含指向三角', () => {
    expect(labelBox({ x: 100, y: 100 }, { w: 60, h: 28 }, 'above', 'center')).toMatchObject({ x: 70, y: 66, w: 60, h: 34 })
    expect(labelBox({ x: 100, y: 100 }, { w: 60, h: 28 }, 'below', 'center')).toMatchObject({ x: 70, y: 100, h: 34 })
    expect(labelBox({ x: 100, y: 100 }, { w: 60, h: 28 }, 'above', 'end').x).toBeLessThan(70)
  })
})
