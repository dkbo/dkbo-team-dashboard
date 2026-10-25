// AC10／AC11 的純函式：role→模型、職等換衣遮罩、動畫票、動作選擇、鏡頭 fit、CSS 色解析、標記縮放與碰撞
import { afterEach, describe, expect, it, vi } from 'vitest'
import { characterKey } from '@/features/office-scene/model-map'
import { clothCells, clothMask, CELL_GRID } from '@/features/office-scene/cloth'
import { createTickets } from '@/features/office-scene/tickets'
import { ANIMATION_MS, actionFor, shouldAnimate, walkMs, WALK_MAX_MS, WALK_SPEED } from '@/features/office-scene/motion'
import { fitCamera, CAMERA } from '@/features/office-scene/camera'
import { parseCssColor } from '@/features/office-scene/colors'
import { markerPriority, markerScale, resolveCollisions } from '@/features/office-scene/markers'

const KEYS = ['default', 'leader', 'backend', 'frontend', 'qa', 'reviewer', 'it', 'designer', 'pm']

describe('characterKey（role→manifest 角色）', () => {
  it('leader 用 leader', () => {
    expect(characterKey({ member: 'leader-office', leader: true }, KEYS)).toBe('leader')
  })
  it('完整名命中', () => {
    expect(characterKey({ member: 'qa', leader: false }, KEYS)).toBe('qa')
  })
  it('去掉 - 後綴再比', () => {
    expect(characterKey({ member: 'reviewer-a', leader: false }, KEYS)).toBe('reviewer')
    expect(characterKey({ member: 'frontend-scene', leader: false }, KEYS)).toBe('frontend')
  })
  it('都不中、沒有 member 用 default', () => {
    expect(characterKey({ member: 'chore-x', leader: false }, KEYS)).toBe('default')
    expect(characterKey({ member: null, leader: false }, KEYS)).toBe('default')
  })
  it('manifest 沒有 leader 時 leader 也退回 default', () => {
    expect(characterKey({ member: 'leader-x', leader: true }, ['default'])).toBe('default')
  })
})

describe('clothCells／clothMask（職等換衣只動衣服區域）', () => {
  // 4 個頂點：0、1 綁 torso，落在格 (3,8)；2 綁 arm 也在 (3,8)（袖子）；3 綁 arm 在 (13,12)（手）
  const cell = (cx: number, cy: number) => [(cx + 0.5) / CELL_GRID, (cy + 0.5) / CELL_GRID]
  const uv = new Float32Array([...cell(3, 8), ...cell(3, 8), ...cell(3, 8), ...cell(13, 12)])
  const joints = [0, 0, 1, 1]
  const bones = ['torso', 'arm-left']

  it('有 torso 頂點的格＝衣服格；少於門檻的格不算', () => {
    expect([...clothCells(uv, joints, bones, { minCount: 2 })]).toEqual([8 * CELL_GRID + 3])
    expect([...clothCells(uv, joints, bones, { minCount: 3 })]).toEqual([])
  })

  it('遮罩：衣服格的所有頂點（含袖子）＝1，手＝0', () => {
    const cells = clothCells(uv, joints, bones, { minCount: 2 })
    expect([...clothMask(uv, cells)]).toEqual([1, 1, 1, 0])
  })
})

describe('createTickets（動畫票：> 0 才連續 render）', () => {
  afterEach(() => vi.useRealTimers())

  it('hold／release 計數，歸零通知', () => {
    const changes: number[] = []
    const t = createTickets((n) => changes.push(n))
    const r1 = t.hold()
    const r2 = t.hold()
    expect(t.count()).toBe(2)
    r1()
    r1() // 重複 release 不重扣
    expect(t.count()).toBe(1)
    r2()
    expect(t.count()).toBe(0)
    expect(changes).toEqual([1, 2, 1, 0])
  })

  it('holdFor 到時自動歸還；dispose 清掉全部', () => {
    vi.useFakeTimers()
    const t = createTickets()
    t.holdFor(ANIMATION_MS)
    t.holdFor(400)
    expect(t.count()).toBe(2)
    vi.advanceTimersByTime(400)
    expect(t.count()).toBe(1)
    vi.advanceTimersByTime(ANIMATION_MS)
    expect(t.count()).toBe(0)
    t.hold()
    t.holdFor(1000)
    t.dispose()
    expect(t.count()).toBe(0)
  })
})

describe('動作（§6.4、E15）', () => {
  it('細狀態 → clip 與關鍵影格', () => {
    expect(actionFor('waiting', 'task')).toMatchObject({ clip: 'wave', loop: true })
    expect(actionFor('running', 'task')).toMatchObject({ clip: 'type', speed: 1 })
    expect(actionFor('writing', 'task')).toMatchObject({ clip: 'type', speed: 0.6 })
    expect(actionFor('thinking', 'task')).toMatchObject({ clip: 'idle', seated: true })
    expect(actionFor('interrupted', 'task')).toMatchObject({ clip: 'type', keyframe: 0 })
    expect(actionFor('error', 'task')).toMatchObject({ clip: 'sit', slump: true })
    expect(actionFor('idle', 'task')).toMatchObject({ clip: 'sit' })
    expect(actionFor('done', 'lounge').clip).toBe('idle')
  })

  it('只在即時變化時播：首次、重連、切回分頁直接畫最終狀態', () => {
    expect(shouldAnimate({ prev: 'thinking', next: 'running', live: true })).toBe(true)
    expect(shouldAnimate({ prev: undefined, next: 'running', live: true })).toBe(false)
    expect(shouldAnimate({ prev: 'thinking', next: 'running', live: false })).toBe(false)
    expect(shouldAnimate({ prev: 'running', next: 'running', live: true })).toBe(false)
  })

  it('走路 1.2 格／秒，最長 6 秒（路長就加速）', () => {
    expect(WALK_SPEED).toBe(1.2)
    expect(walkMs({ x: 0, z: 0 }, { x: 3, z: 4 })).toBeCloseTo((5 / 1.2) * 1000)
    expect(walkMs({ x: 0, z: 0 }, { x: 20, z: 0 })).toBe(WALK_MAX_MS)
  })
})

describe('fitCamera（§4.3）', () => {
  const box = { minX: 0, maxX: 24.4, minZ: 0, maxZ: 14 }

  it('看向房間中心，從右前方 45°、俯角 35°', () => {
    const f = fitCamera(box, 16 / 9)
    expect(f.target[0]).toBeCloseTo(12.2)
    expect(f.target[2]).toBeCloseTo(7)
    const [dx, dy, dz] = f.position.map((v, i) => v - f.target[i])
    expect(dx).toBeGreaterThan(0)
    expect(dz).toBeGreaterThan(0)
    expect(dx).toBeCloseTo(dz)
    expect((Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI).toBeCloseTo(35)
    expect(Math.hypot(dx, dy, dz)).toBeCloseTo(f.distance)
  })

  it('窄畫面要拉更遠；房間更大也要更遠', () => {
    expect(fitCamera(box, 1).distance).toBeGreaterThan(fitCamera(box, 2).distance)
    expect(fitCamera({ ...box, maxZ: 22 }, 2).distance).toBeGreaterThan(fitCamera(box, 2).distance)
  })

  it('OrbitControls 限制：俯角 20–70°、距離 0.4–1.6 倍', () => {
    const f = fitCamera(box, 2)
    expect(f.minDistance).toBeCloseTo(f.distance * 0.4)
    expect(f.maxDistance).toBeCloseTo(f.distance * 1.6)
    expect(CAMERA.minPolar).toBeCloseTo((20 * Math.PI) / 180)
    expect(CAMERA.maxPolar).toBeCloseTo((70 * Math.PI) / 180)
    expect(CAMERA.fov).toBe(30)
  })
})

describe('parseCssColor', () => {
  it('hex 與 rgb（含 / alpha%）', () => {
    expect(parseCssColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(parseCssColor(' #fff ')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    const c = parseCssColor('rgb(61 67 128 / 12%)')!
    expect(c.r).toBeCloseTo(61 / 255)
    expect(c.a).toBeCloseTo(0.12)
    expect(parseCssColor('rgba(255, 0, 0, 0.5)')).toEqual({ r: 1, g: 0, b: 0, a: 0.5 })
  })
  it('讀不到回 null', () => {
    expect(parseCssColor('')).toBeNull()
    expect(parseCssColor('oklch(0.5 0.1 200)')).toBeNull()
  })
})

describe('標記縮放與碰撞（§6.3、§6.14、E2）', () => {
  it('隨鏡頭距離 0.6–1，< 0.6 只剩點；alert 永遠 1', () => {
    expect(markerScale({ base: 1, fitDistance: 10, distance: 5, alert: false })).toBe(1)
    expect(markerScale({ base: 1, fitDistance: 10, distance: 12.5, alert: false })).toBeCloseTo(0.8)
    expect(markerScale({ base: 0.8, fitDistance: 10, distance: 10, alert: false })).toBeCloseTo(0.8)
    expect(markerScale({ base: 1, fitDistance: 10, distance: 16, alert: false })).toBeCloseTo(0.625)
    expect(markerScale({ base: 0.8, fitDistance: 10, distance: 16, alert: false })).toBe('dot')
    expect(markerScale({ base: 0.8, fitDistance: 10, distance: 16, alert: true })).toBe(1)
  })

  it('優先序：hover／選取 ＞ §1.2 狀態序', () => {
    expect(markerPriority('idle', true)).toBeLessThan(markerPriority('waiting', false))
    expect(markerPriority('waiting', false)).toBeLessThan(markerPriority('running', false))
  })

  it('互撞時優先序低的縮成點，alert 不讓位', () => {
    const box = (id: string, x: number, priority: number, alert = false) => ({ id, x, y: 0, w: 40, h: 24, priority, alert })
    expect([...resolveCollisions([box('a', 0, 4), box('b', 20, 6), box('c', 200, 6)])]).toEqual(['b'])
    expect([...resolveCollisions([box('a', 0, 4), box('w', 20, 9, true)])]).toEqual(['a'])
    // 已縮成點的不再擋別人
    expect([...resolveCollisions([box('a', 0, 1), box('b', 30, 2), box('c', 60, 3)]).values()].sort()).toEqual(['b'])
  })
})
