// BUG-2（qa，AC8）：預設鏡頭下區牌被找人清單蓋住 42px。區牌在相機停下後，依疊層的實際位置往右讓開。
import { describe, expect, it } from 'vitest'
import { signShifts } from '@/features/office-scene/signs'

const finder = { x: 16, y: 16, w: 304, h: 605 }
const canvas = { w: 1416, h: 768 }

describe('signShifts', () => {
  it('沒壓到疊層就不動', () => {
    expect(signShifts([{ key: 'hot', x: 400, y: 406, w: 175, h: 28 }], [finder], canvas)).toEqual({})
  })

  it('QA 量到的情境：x 278–453 壓住右緣 320 → 推到疊層右側外加間隙', () => {
    const s = signShifts([{ key: 'hot', x: 278, y: 406, w: 175, h: 28 }], [finder], canvas)
    expect(s.hot).toBe(320 + 8 - 278)
    // 推完不再相交
    expect(278 + s.hot).toBeGreaterThanOrEqual(finder.x + finder.w)
  })

  it('y 不重疊（區牌在疊層下方）不動', () => {
    expect(signShifts([{ key: 'hot', x: 100, y: 700, w: 175, h: 28 }], [finder], canvas)).toEqual({})
  })

  it('推完又撞到另一個疊層就繼續往右', () => {
    const next = { x: 340, y: 380, w: 120, h: 80 }
    const s = signShifts([{ key: 'hot', x: 278, y: 406, w: 175, h: 28 }], [finder, next], canvas)
    expect(278 + s.hot).toBeGreaterThanOrEqual(next.x + next.w)
  })

  it('推到右緣出 canvas 就放棄（不動，由其他規則處理）', () => {
    expect(signShifts([{ key: 'hot', x: 278, y: 406, w: 175, h: 28 }], [{ x: 0, y: 0, w: 1400, h: 768 }], canvas)).toEqual({})
  })
})
