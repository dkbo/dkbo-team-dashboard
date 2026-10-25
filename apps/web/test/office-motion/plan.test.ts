import { describe, expect, it } from 'vitest'
import type { Substate } from '@dash/shared'
import type { OfficeEvent } from '@/features/office/events/types'
import type { Vec3 } from '@/features/office-scene/anchors'
import { badgeLeaders, planEvent, reconcileOut, waveHasVerdict, type PlanCtx, type ReviewerOut } from '@/features/office-scene/director/plan'

const MS = { thumb: 1500, headDown: 2000, nod: 1200, celebrate: 3000, waveFill: 600, spark: 1200, walkMax: 4000 }

function ctx(over: Partial<PlanCtx> & { subs?: Record<string, Substate> } = {}): PlanCtx {
  const subs: Record<string, Substate> = { dev1: 'running', dev2: 'running', rev1: 'idle', rev2: 'idle', lead: 'idle', ...over.subs }
  const seat: Record<string, Vec3> = { dev1: [2, 0, 3], dev2: [3, 0, 3], rev1: [10, 0, 8], rev2: [11, 0, 8], lead: [5, 0, 1] }
  return {
    reducedMotion: false,
    ms: MS,
    out: new Map(),
    info: (id) => (subs[id] ? { substate: subs[id], at: seat[id] } : null),
    deskSide: (id) => (seat[id] ? [seat[id][0] + 0.9, 0, seat[id][2]] : null),
    board: (dir) => (dir === 't1' ? [4, 0, 6] : null),
    walkPath: (from, to) => [from, to],
    isReviewer: (id) => id.startsWith('rev'),
    isLeader: (id) => id === 'lead',
    ...over,
  }
}

const ev = (kind: OfficeEvent['kind'], over: Partial<OfficeEvent> = {}): OfficeEvent => ({
  id: `${kind}:t1`,
  kind,
  taskDir: 't1',
  wave: 2,
  actors: [],
  target: null,
  count: null,
  at: 0,
  announce: '',
  ...over,
})

describe('planEvent：reviewer 出動（E6）', () => {
  it('1 位 dev：走到該 dev 桌右側、拿板子、座位螢幕暗、走路期間持票，覆寫常駐到 verdict', () => {
    const c = ctx()
    const p = planEvent(ev('review-spawned', { actors: ['rev1'], target: { kind: 'session', id: 'dev1' } }), c)
    const cue = p.cues.find((q) => q.actor === 'rev1')!
    expect(cue.override?.path?.at(-1)).toEqual([2.9, 0, 3])
    expect(cue.override?.gesture).toBe('hold-board')
    expect(cue.override?.screenOff).toBe(true)
    expect(cue.override?.walkMaxMs).toBe(4000)
    expect(cue.clearAfter).toBeNull()
    expect(cue.holdMs).toBeGreaterThan(0)
    expect(cue.holdMs).toBeLessThanOrEqual(4000 + 200)
    expect(cue.bubble).toMatchObject({ emoji: '🔍', label: '審查 波 2', tone: 'info' })
    expect(p.out.set).toEqual([{ id: 'rev1', taskDir: 't1', wave: 2, since: 'idle', at: [2.9, 0, 3] }])
  })

  it('兩位 reviewer 走向同一個白板，站位錯開不重疊', () => {
    const p = planEvent(ev('review-spawned', { actors: ['rev1', 'rev2'], target: { kind: 'board', id: 't1' } }), ctx())
    const ends = p.cues.map((q) => q.override!.path!.at(-1)!)
    expect(ends).toHaveLength(2)
    expect(Math.hypot(ends[0][0] - ends[1][0], ends[0][2] - ends[1][2])).toBeGreaterThanOrEqual(0.6)
    for (const e of ends) expect(Math.abs(e[2] - 6)).toBeLessThan(0.01)
  })

  it('細狀態優先：等你的 reviewer 不起身，只出 bubble', () => {
    const p = planEvent(ev('review-spawned', { actors: ['rev1'], target: { kind: 'board', id: 't1' } }), ctx({ subs: { rev1: 'waiting' } }))
    expect(p.cues[0].override).toBeUndefined()
    expect(p.cues[0].bubble).not.toBeNull()
    expect(p.cues[0].holdMs).toBe(0)
    expect(p.out.set).toEqual([])
  })

  it('reduced motion：直接出現在目的地（instant），不持票', () => {
    const p = planEvent(ev('review-spawned', { actors: ['rev1'], target: { kind: 'board', id: 't1' } }), ctx({ reducedMotion: true }))
    expect(p.cues[0].override?.instant).toBe(true)
    expect(p.cues[0].holdMs).toBe(0)
  })

  it('找不到演員（預設 5）：不播動畫也不掛 bubble', () => {
    const p = planEvent(ev('review-spawned', { actors: ['ghost'], target: { kind: 'board', id: 't1' } }), ctx())
    expect(p.cues).toEqual([])
  })
})

describe('planEvent：審查結果', () => {
  const out = (): Map<string, ReviewerOut> => new Map([['rev1', { id: 'rev1', taskDir: 't1', wave: 2, since: 'running', at: [4, 0, 6] }]])

  it('通過：dev 比讚＋👍 bubble、reviewer 從目的地走回座位後清覆寫', () => {
    const p = planEvent(ev('review-pass', { actors: ['dev1', 'rev1'] }), ctx({ out: out() }))
    const dev = p.cues.find((q) => q.actor === 'dev1')!
    expect(dev.override?.gesture).toBe('thumbs-up')
    expect(dev.clearAfter).toBe(1500)
    expect(dev.holdMs).toBe(1500)
    expect(dev.bubble).toMatchObject({ emoji: '👍', label: '通過', tone: 'ok' })
    const rev = p.cues.find((q) => q.actor === 'rev1')!
    expect(rev.override?.path?.[0]).toEqual([4, 0, 6])
    expect(rev.override?.path?.at(-1)).toEqual([10, 0, 8])
    // 走完才清：留餘裕給 scene 晚一格開始的走路，否則差幾公分沒到、scene 會再繞走道走一次
    expect(rev.clearAfter).toBeGreaterThanOrEqual(rev.holdMs + 250)
    expect(rev.bubble).toBeNull()
    expect(p.out.clear).toEqual(['rev1'])
  })

  it('要修：dev 垂頭＋😓 要修 K 條', () => {
    const p = planEvent(ev('review-fix', { actors: ['dev1', 'dev2', 'rev1'], count: 3 }), ctx({ out: out() }))
    for (const id of ['dev1', 'dev2']) {
      const q = p.cues.find((c) => c.actor === id)!
      expect(q.override?.gesture).toBe('head-down')
      expect(q.clearAfter).toBe(2000)
      expect(q.bubble).toMatchObject({ emoji: '😓', label: '要修 3 條', tone: 'warn' })
    }
  })

  it('細狀態優先：錯誤的 dev 不垂頭，只出 bubble', () => {
    const p = planEvent(ev('review-fix', { actors: ['dev1'], count: 1 }), ctx({ subs: { dev1: 'error' } }))
    expect(p.cues[0].override).toBeUndefined()
    expect(p.cues[0].bubble?.emoji).toBe('😓')
  })

  it('reduced motion：不比讚、reviewer 直接回座（清覆寫）', () => {
    const p = planEvent(ev('review-pass', { actors: ['dev1', 'rev1'] }), ctx({ out: out(), reducedMotion: true }))
    expect(p.cues.find((q) => q.actor === 'dev1')!.override).toBeUndefined()
    const rev = p.cues.find((q) => q.actor === 'rev1')!
    expect(rev.override).toBeNull()
    expect(p.cues.every((q) => q.holdMs === 0)).toBe(true)
  })

  it('store 還沒有 reviewer 的 session（isReviewer 認不得）：出動過的照樣走回、不比讚', () => {
    const p = planEvent(ev('review-pass', { actors: ['dev1', 'rev1'] }), ctx({ out: out(), isReviewer: () => false }))
    const rev = p.cues.find((q) => q.actor === 'rev1')!
    expect(rev.override?.gesture).toBe('stand')
    expect(rev.bubble).toBeNull()
  })

  it('reviewer 沒出動過（基準時已在外）：不動它', () => {
    const p = planEvent(ev('review-pass', { actors: ['dev1', 'rev1'] }), ctx())
    expect(p.cues.find((q) => q.actor === 'rev1')).toBeUndefined()
  })
})

describe('planEvent：波關閉、結案、ESCALATE', () => {
  it('波關閉：leader 點頭＋✅ bubble；白板閃第 N 段＋星點', () => {
    const p = planEvent(ev('wave-closed', { actors: ['lead'], wave: 3 }), ctx())
    expect(p.cues[0]).toMatchObject({ actor: 'lead', clearAfter: 1200, holdMs: 1200 })
    expect(p.cues[0].override?.gesture).toBe('nod')
    expect(p.cues[0].bubble).toMatchObject({ emoji: '✅', label: '波 3 關閉', tone: 'ok' })
    expect(p.board).toEqual({ taskDir: 't1', flashIndex: 2, spark: true, confetti: false, ms: 1800 })
  })

  it('波關閉 reduced motion：直接填滿、無星點、不點頭', () => {
    const p = planEvent(ev('wave-closed', { actors: ['lead'], wave: 3 }), ctx({ reducedMotion: true }))
    expect(p.cues[0].override).toBeUndefined()
    expect(p.board).toMatchObject({ flashIndex: null, spark: false })
  })

  it('結案：全桌群 jump＋彩帶；等你的人不跳只出 bubble；在外的 reviewer 一併收回', () => {
    const p = planEvent(
      ev('task-done', { actors: ['dev1', 'dev2', 'lead'] }),
      ctx({ subs: { dev2: 'waiting' }, out: new Map([['rev1', { id: 'rev1', taskDir: 't1', wave: 2, since: 'running', at: [4, 0, 6] }]]) }),
    )
    expect(p.cues.find((q) => q.actor === 'dev1')!.override?.gesture).toBe('jump')
    expect(p.cues.find((q) => q.actor === 'dev1')!.clearAfter).toBe(3000)
    // 一般動態：跳＋彩帶就是表達，不另掛 bubble（§6.17 bubble 只在 reduced motion 欄）
    expect(p.cues.find((q) => q.actor === 'dev1')!.bubble).toBeNull()
    expect(p.cues.find((q) => q.actor === 'dev2')!.override).toBeUndefined()
    expect(p.cues.find((q) => q.actor === 'dev2')!.bubble?.emoji).toBe('🎉')
    expect(p.board).toMatchObject({ confetti: true, ms: 3000 })
    expect(p.out.clear).toEqual(['rev1'])
  })

  it('結案時還在白板前的 reviewer：收回座位，不在白板前跳（I2 b）', () => {
    const p = planEvent(
      ev('task-done', { actors: ['dev1', 'rev1'] }),
      ctx({ out: new Map([['rev1', { id: 'rev1', taskDir: 't1', wave: 2, since: 'running', at: [4, 0, 6] }]]) }),
    )
    const rev = p.cues.find((q) => q.actor === 'rev1')!
    expect(rev.override).toBeNull()
    expect(p.out.clear).toEqual(['rev1'])
  })

  it('結案 reduced motion：不跳、無彩帶；只在 leader 頭上出一顆 🎉 bubble', () => {
    const p = planEvent(ev('task-done', { actors: ['dev1', 'lead'] }), ctx({ reducedMotion: true }))
    expect(p.cues.every((q) => q.override === undefined)).toBe(true)
    expect(p.cues.filter((q) => q.bubble).map((q) => q.actor)).toEqual(['lead'])
    expect(p.board?.confetti).toBe(false)
  })

  it('結案 reduced motion、找不到 leader：bubble 掛第一位在場演員', () => {
    const p = planEvent(ev('task-done', { actors: ['dev1', 'dev2'] }), ctx({ reducedMotion: true }))
    expect(p.cues.filter((q) => q.bubble).map((q) => q.actor)).toEqual(['dev1'])
  })

  it('放棄：不慶祝', () => {
    const p = planEvent(ev('task-abandoned'), ctx())
    expect(p.cues).toEqual([])
    expect(p.board).toBeNull()
  })

  it('ESCALATE／解除：只動徽章（badgeLeaders 處理），不排動作', () => {
    expect(planEvent(ev('escalate', { actors: ['lead'] }), ctx()).cues).toEqual([])
  })
})

describe('reconcileOut：出動中的 reviewer 何時收回', () => {
  const out = new Map<string, ReviewerOut>([['rev1', { id: 'rev1', taskDir: 't1', wave: 2, since: 'running', at: [4, 0, 6] }]])
  const none = () => false
  it('變等你：停在原地揮手（不帶 path）', () => {
    expect(reconcileOut(out, new Map(), (id) => (id === 'rev1' ? 'waiting' : null), none)).toEqual([{ id: 'rev1', override: { gesture: 'wave' }, paused: true }])
  })
  it('變錯誤：直接收回座位（不在走道上留「站著」覆寫，scene 會依座位坐姿把它抬到半空）', () => {
    expect(reconcileOut(out, new Map(), () => 'error', none)).toEqual([{ id: 'rev1', override: null, paused: false, done: true }])
  })
  it('等你後恢復：清覆寫回細狀態位置，結束這次出動', () => {
    expect(reconcileOut(out, new Map([['rev1', true]]), () => 'running', none)).toEqual([{ id: 'rev1', override: null, paused: false, done: true }])
  })
  it('細狀態沒變：不動', () => {
    expect(reconcileOut(out, new Map(), () => 'running', none)).toEqual([])
  })
  it('I1：沒有 verdict 事件（切回分頁只當基準），reviewer 轉成 done：收回', () => {
    expect(reconcileOut(out, new Map(), () => 'done', none)).toEqual([{ id: 'rev1', override: null, paused: false, done: true }])
  })
  it('I1：出動時就是閒置（session 還沒動）不算「轉成」閒置', () => {
    const idleOut = new Map<string, ReviewerOut>([['rev1', { ...out.get('rev1')!, since: 'idle' }]])
    expect(reconcileOut(idleOut, new Map(), () => 'idle', none)).toEqual([])
  })
  it('I1：store 的該波已有 verdict（事件被吞）：收回', () => {
    const seen: ReviewerOut[] = []
    const acts = reconcileOut(out, new Map(), () => 'running', (o) => (seen.push(o), true))
    expect(acts).toEqual([{ id: 'rev1', override: null, paused: false, done: true }])
    expect(seen[0]).toMatchObject({ taskDir: 't1', wave: 2 })
  })
  it('角色離場：結束這次出動', () => {
    expect(reconcileOut(out, new Map(), () => null, none)).toEqual([{ id: 'rev1', override: null, paused: false, done: true }])
  })
})

describe('waveHasVerdict：store 的該波已審完', () => {
  const d = (w: Record<string, unknown>) => ({ waves: [{ wave: 2, ...w }] }) as never
  it('有 verdict、晚於出動：是', () => expect(waveHasVerdict(d({ review_spawned_at: '2026-10-25T12:00', review_verdict_at: '2026-10-25T12:14' }), 2)).toBe(true))
  it('還沒 verdict：否', () => expect(waveHasVerdict(d({ review_spawned_at: '2026-10-25T12:00', review_verdict_at: null }), 2)).toBe(false))
  it('複看重新出動、舊 verdict 早於出動：否', () => expect(waveHasVerdict(d({ review_spawned_at: '2026-10-25T12:30', review_verdict_at: '2026-10-25T12:14' }), 2)).toBe(false))
  it('沒有 detail 或波號：否', () => {
    expect(waveHasVerdict(undefined, 2)).toBe(false)
    expect(waveHasVerdict(d({ review_verdict_at: '2026-10-25T12:14' }), null)).toBe(false)
  })
})

describe('badgeLeaders：「!」常駐到解除', () => {
  const leaders = { t1: ['lead'], t2: ['lead2'] }
  it('store 未解 ESCALATE 的任務 leader 掛徽章', () => {
    expect([...badgeLeaders(leaders, new Set(['t1']), new Map())]).toEqual(['lead'])
  })
  it('即時 escalate 事件也掛（store 還沒 detail 時）；解除事件拿掉', () => {
    const live = new Map([['t2', 1]])
    expect([...badgeLeaders(leaders, new Set(), live)]).toEqual(['lead2'])
    expect([...badgeLeaders(leaders, new Set(), new Map([['t2', 0]]))]).toEqual([])
  })
})
