// review2 I1／I2：開頁 ?focus= 要飛（掛上時已有 focusRequest）、SSE 重連後第一份 sessions 不算即時（E7）
import { describe, expect, it } from 'vitest'
import { pendingFocus } from '@/features/office-scene/camera'
import { createLiveGate } from '@/features/office-scene/live'

describe('pendingFocus（I1）', () => {
  it('掛上時已有 focus（lastNonce 初值 null）→ 要飛', () => {
    expect(pendingFocus(null, { x: 1, z: 2, nonce: 1 })).toEqual({ x: 1, z: 2, nonce: 1 })
  })
  it('同一個 nonce 不重飛；新的 nonce 才飛；沒有 focus 不飛', () => {
    expect(pendingFocus(1, { x: 1, z: 2, nonce: 1 })).toBeNull()
    expect(pendingFocus(1, { x: 3, z: 4, nonce: 2 })).toEqual({ x: 3, z: 4, nonce: 2 })
    expect(pendingFocus(null, null)).toBeNull()
  })
})

describe('createLiveGate（I2）', () => {
  const A = [{ id: 'a' }]
  const B = [{ id: 'a' }, { id: 'b' }]
  const C = [{ id: 'c' }]

  it('SSE 已連上時進頁：第一份非空 sessions 畫完才變即時', () => {
    const g = createLiveGate()
    expect(g.update('open', [])).toBe(false)
    expect(g.update('open', A)).toBe(true)
    expect(g.update('open', B)).toBe(true)
  })

  it('冷開：sessions 比 SSE 先到 → 連上後重抓的那份也不算即時，之後才算', () => {
    const g = createLiveGate()
    expect(g.update('connecting', A)).toBe(false)
    expect(g.update('open', A)).toBe(false)
    expect(g.update('open', B)).toBe(true)
  })

  it('斷線 → 重連：重連當下與補抓的第一份都不算即時，下一份才算', () => {
    const g = createLiveGate()
    g.update('open', A)
    expect(g.isLive()).toBe(true)
    expect(g.update('connecting', A)).toBe(false)
    expect(g.isLive()).toBe(false)
    expect(g.update('open', A)).toBe(false)
    // 補抓的那份畫成最終狀態（呼叫端在 commit 後才 update，所以這份 commit 時 isLive 仍是 false）
    expect(g.isLive()).toBe(false)
    expect(g.update('open', B)).toBe(true)
    expect(g.update('open', C)).toBe(true)
  })

  it('closed 也算斷線', () => {
    const g = createLiveGate()
    g.update('open', A)
    expect(g.update('closed', A)).toBe(false)
  })
})
