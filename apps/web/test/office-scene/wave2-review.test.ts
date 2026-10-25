// 波 2 審查 I2（覆寫時坐或站）、I3（物件標籤互撞不藏異常）、I4（< 0.6 收掉沒異常的白板）與 M1、M4、M7
import { describe, expect, it, vi } from 'vitest'
import type { OfficeSession } from '@dash/shared'
import { computeLayout } from '@/features/office-scene/layout'
import { gestureAction, overrideSeated } from '@/features/office-scene/motion'
import { boardYield, labelBox, objectPlacements, resolveLabelYield } from '@/features/office-scene/objects/placement'
import { retryableImport } from '@/features/office-scene/objects/retry'
import { sceneSubstate } from '@/features/office-scene/SceneRoot'

describe('I2 overrideSeated：坐不坐看人在不在座位、動作要不要站', () => {
  it('在座位上、沒走開：垂頭／點頭／stand 維持坐', () => {
    for (const g of ['head-down', 'nod', 'stand'] as const) expect(overrideSeated({ gesture: g, hasPath: false, away: false, placePose: 'sit' })).toBe(true)
  })
  it('(a)(b) 人不在座位（走到一半、白板前）：不坐', () => {
    expect(overrideSeated({ gesture: 'stand', hasPath: false, away: true, placePose: 'sit' })).toBe(false)
    expect(overrideSeated({ gesture: 'jump', hasPath: false, away: true, placePose: 'sit' })).toBe(false)
  })
  it('(c)(d) 比讚、跳、拿板子、揮手：在座位上也站起來', () => {
    for (const g of ['thumbs-up', 'jump', 'hold-board', 'wave'] as const) expect(overrideSeated({ gesture: g, hasPath: false, away: false, placePose: 'sit' })).toBe(false)
  })
  it('有路徑或細狀態本來就站：不坐', () => {
    expect(overrideSeated({ gesture: 'head-down', hasPath: true, away: false, placePose: 'sit' })).toBe(false)
    expect(overrideSeated({ gesture: 'head-down', hasPath: false, away: false, placePose: 'stand' })).toBe(false)
  })
  it('比讚是站姿的手勢（不是打字），拿板子有 procedural', () => {
    expect(gestureAction('thumbs-up', true)).toMatchObject({ seated: false, clip: 'wave', thumb: true })
    expect(gestureAction('hold-board', false)).toMatchObject({ seated: false, board: true })
  })
})

describe('I3 物件標籤互撞不得藏異常標籤', () => {
  const box = (id: string, x: number, abnormal: boolean) => ({ id, x, y: 0, w: 60, h: 28, abnormal, dot: { x: x + 24, y: 22, w: 12, h: 12 } })
  it('異常標籤撞到別的物件標籤或區牌：照常顯示', () => {
    const y = resolveLabelYield([box('git', 0, true), box('notice', 40, true)], [], [{ x: 30, y: 0, w: 40, h: 28 }])
    expect(y).toEqual({ git: 'none', notice: 'none' })
  })
  it('異常標籤撞到角色標記：照 §6.14 讓位', () => {
    expect(resolveLabelYield([box('git', 0, true)], [{ x: 10, y: 0, w: 30, h: 20 }])).toEqual({ git: 'dot' })
  })
  it('沒異常的撞到物件標籤或區牌：讓位', () => {
    expect(resolveLabelYield([box('git', 0, true), box('archive', 40, false)], [])).toEqual({ git: 'none', archive: 'dot' })
  })
  it('預設擺放：git 標籤往右（start）、公告板往左（end）；預設鏡頭下 git 錨點投影在公告板右側約 60px、同高，兩框不相交', () => {
    const l = computeLayout({ sessions: [], tasks: {} })
    const fx = objectPlacements(l).fixed
    expect(fx.git.align).toBe('start')
    expect(fx.notice.align).toBe('end')
    // 實測（harness 1440 預設鏡頭）：notice 錨點 (974, 608)、git 錨點 (1036, 584)；標籤寬取異常時的最寬 140
    const n = labelBox({ x: 974, y: 608 }, { w: 140, h: 28 }, fx.notice.placement, fx.notice.align)
    const g = labelBox({ x: 1036, y: 584 }, { w: 140, h: 28 }, fx.git.placement, fx.git.align)
    expect(n.x + n.w <= g.x || g.y + g.h <= n.y || n.y + n.h <= g.y).toBe(true)
  })
})

describe('I4 boardYield：< 0.6（alert-only）收掉沒異常的白板', () => {
  it('alert-only＋無 tone → hidden；有 tone 照讓位結果；其他密度照讓位結果', () => {
    expect(boardYield('alert-only', null, 'none')).toBe('hidden')
    expect(boardYield('alert-only', 'warn', 'none')).toBe('none')
    expect(boardYield('compact', null, 'dot')).toBe('dot')
  })
})

describe('M1 sceneSubstate', () => {
  const now = Date.now()
  const s = (over: Partial<OfficeSession>) => ({ id: 'a', substate: 'error', substateSince: now - 60_000, lastEventAt: now - 60_000, paneId: null, ...over }) as OfficeSession
  it('無 pane 的錯誤 10 分內畫中斷、11 分後閒置；有 pane 照錯誤', () => {
    expect(sceneSubstate(s({}), now)).toBe('interrupted')
    expect(sceneSubstate(s({ substateSince: now - 11 * 60_000, lastEventAt: now - 11 * 60_000 }), now)).toBe('idle')
    expect(sceneSubstate(s({ paneId: 'p1', substateSince: now - 11 * 60_000, lastEventAt: now - 11 * 60_000 }), now)).toBe('error')
  })
})

describe('M4 retryableImport 成功後清掉錯誤', () => {
  it('換 URL 成功之後，下一次回到原本的 import', async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: http://h/a.js')).mockResolvedValue('ok')
    const byUrl = vi.fn().mockResolvedValue('ok')
    const get = retryableImport(load, byUrl)
    await get().catch(() => {})
    await get()
    await get()
    expect(byUrl).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
