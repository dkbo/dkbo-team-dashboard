import { describe, expect, it } from 'vitest'
import type { OverviewDoc, TaskDetail, TaskSummary } from '@dash/shared'
import { applyQueue, createEventEngine, parseVerdict, QUEUE_WINDOW_MS, type ObserveCtx } from '@/features/office/events/engine'
import type { OfficeEvent } from '@/features/office/events/types'
import { officeSession, overview, project } from '../shell/builders'
import { detail, listDoc, MIN, msg, NOW, summary, ts, wave } from './fixtures'

const DIR = '2026-10-25-demo'
const S = (id: string, over: Parameters<typeof officeSession>[0] = {}) =>
  officeSession({ id, paneId: id, project: 'teamflow', taskDir: DIR, member: null, ...over })

const SESSIONS = [
  S('p-ld', { leader: true, role: 'leader' }),
  S('p-be', { member: 'backend', role: 'backend' }),
  S('p-fe', { member: 'frontend', role: 'frontend' }),
  S('p-ra', { member: 'reviewer-a', role: 'reviewer' }),
  S('p-rb', { member: 'reviewer-b', role: 'reviewer' }),
]

let gen = 1_000
function doc(d: TaskDetail | null, list: Partial<TaskSummary> = {}): OverviewDoc {
  gen += 1
  const sum = summary({ ...(d ?? {}), ...list })
  return overview({
    generatedAt: gen,
    projects: [project({ list: listDoc([sum]), active: d ? { [DIR]: d } : {} })],
  })
}

const ctx = (over: Partial<ObserveCtx> = {}): ObserveCtx => ({ sse: 'open', visible: true, sessions: SESSIONS, now: NOW, ...over })

/** 基準一份、第二份比對；回傳第二份產生的事件 */
function step(a: OverviewDoc, b: OverviewDoc, c: Partial<ObserveCtx> = {}): OfficeEvent[] {
  const eng = createEventEngine()
  expect(eng.observe(a, ctx(c))).toEqual([])
  return eng.observe(b, ctx(c))
}

describe('parseVerdict', () => {
  it('依 " / " 切段，任一段 important K>0 為要修、K 取最大；其餘 ok／skipped 為通過；括號文字忽略', () => {
    expect(parseVerdict('a: ok')).toEqual({ fix: false, count: 0 })
    expect(parseVerdict('a: important 1（領導由 Minor 1 升級） / b: skipped (agy 撞額度)')).toEqual({ fix: true, count: 1 })
    expect(parseVerdict('a: important 2 / b: important 3')).toEqual({ fix: true, count: 3 })
    expect(parseVerdict('a: ok（複看：Important 0） / b: skipped (熔斷)')).toEqual({ fix: false, count: 0 })
    expect(parseVerdict('a: important 0')).toEqual({ fix: false, count: 0 })
    expect(parseVerdict('看不懂')).toBeNull()
  })
})

describe('reviewer 出動', () => {
  it('review_spawned_at 新出現：本波 2 位 dev → 目標白板；兩位 reviewer 都是演員', () => {
    const a = doc(detail({ waves: [wave(1)] }))
    const b = doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW) })] }))
    const [e, ...rest] = step(a, b)
    expect(rest).toEqual([])
    expect(e).toMatchObject({ kind: 'review-spawned', taskDir: DIR, wave: 1, target: { kind: 'board', id: DIR }, count: null })
    expect(e.actors.sort()).toEqual(['p-ra', 'p-rb'])
    expect(e.announce).toBe('teamflow 示範任務：波 1 審查開始')
  })

  it('本波 1 位 dev → 目標該 dev 的 session', () => {
    const a = doc(detail({ current_wave: 2, waves: [wave(1, { closed_at: ts(NOW - 30 * MIN) }), wave(2)] }))
    const b = doc(detail({ current_wave: 2, waves: [wave(1, { closed_at: ts(NOW - 30 * MIN) }), wave(2, { review_spawned_at: ts(NOW) })] }))
    expect(step(a, b)).toMatchObject([{ kind: 'review-spawned', wave: 2, target: { kind: 'session', id: 'p-fe' } }])
  })

  it('dev 的 session 不在場 → 退回白板；沒有 reviewer session 時演員為空（預設 5）', () => {
    const sessions = SESSIONS.filter((s) => s.role !== 'reviewer' && s.id !== 'p-fe')
    const a = doc(detail({ waves: [wave(1, { closed_at: ts(NOW - 30 * MIN) }), wave(2)] }))
    const b = doc(detail({ waves: [wave(1, { closed_at: ts(NOW - 30 * MIN) }), wave(2, { review_spawned_at: ts(NOW) })] }))
    expect(step(a, b, { sessions })).toMatchObject([{ kind: 'review-spawned', actors: [], target: { kind: 'board', id: DIR } }])
  })
})

describe('審查結果', () => {
  const spawned = wave(1, { review_spawned_at: ts(NOW - MIN) })

  it('verdict important → 要修，演員為本波全部 dev（＋reviewer），count＝K', () => {
    const a = doc(detail({ waves: [spawned] }))
    const b = doc(detail({ waves: [{ ...spawned, review_verdict_at: ts(NOW), review_verdict: 'a: important 2 / b: ok' }] }))
    const [e] = step(a, b)
    expect(e).toMatchObject({ kind: 'review-fix', wave: 1, count: 2, target: null })
    expect(e.actors.sort()).toEqual(['p-be', 'p-fe', 'p-ra', 'p-rb'])
    expect(e.announce).toBe('teamflow 示範任務：波 1 審查要修 2 條')
  })

  it('verdict 全 ok／skipped → 通過', () => {
    const a = doc(detail({ waves: [spawned] }))
    const b = doc(detail({ waves: [{ ...spawned, review_verdict_at: ts(NOW), review_verdict: 'a: ok / b: skipped (熔斷)' }] }))
    expect(step(a, b)).toMatchObject([{ kind: 'review-pass', wave: 1, count: null, announce: 'teamflow 示範任務：波 1 審查通過' }])
  })

  it('複看 important → ok：同一分鐘也因 verdict 字串不同而播「通過」', () => {
    const fix = { ...spawned, review_verdict_at: ts(NOW), review_verdict: 'a: important 1' }
    const a = doc(detail({ waves: [fix] }))
    const b = doc(detail({ waves: [{ ...fix, review_verdict: 'a: ok（複看）' }] }))
    expect(step(a, b)).toMatchObject([{ kind: 'review-pass', wave: 1 }])
  })

  it('verdict 沒變不重播；看不懂的 verdict 不播', () => {
    const v = { ...spawned, review_verdict_at: ts(NOW), review_verdict: 'a: ok' }
    expect(step(doc(detail({ waves: [v] })), doc(detail({ waves: [v] })))).toEqual([])
    expect(step(doc(detail({ waves: [spawned] })), doc(detail({ waves: [{ ...v, review_verdict: '???' }] })))).toEqual([])
  })
})

describe('ESCALATE', () => {
  const esc = msg('demo-backend', 'leader-demo', 'ESCALATE', '要動 shared', NOW)

  it('新的未解 ESCALATE → escalate，演員 leader、目標白板', () => {
    const [e] = step(doc(detail()), doc(detail({ messages: [esc] })))
    expect(e).toMatchObject({ kind: 'escalate', actors: ['p-ld'], target: { kind: 'board', id: DIR }, announce: 'teamflow 示範任務：有 ESCALATE 待決定' })
  })

  it('DECISION 之後 → escalate-resolved', () => {
    const a = doc(detail({ messages: [esc] }))
    const b = doc(detail({ messages: [esc, msg('leader-demo', 'demo-backend', 'DECISION', '准', NOW)] }))
    expect(step(a, b)).toMatchObject([{ kind: 'escalate-resolved', actors: ['p-ld'], announce: 'teamflow 示範任務：ESCALATE 已決定' }])
  })

  it('ruling 也解除', () => {
    const a = doc(detail({ messages: [esc] }))
    const b = doc(detail({ messages: [esc], rulings: [{ ts: ts(NOW), text: 'x', autonomous: false }] }))
    expect(step(a, b)).toMatchObject([{ kind: 'escalate-resolved' }])
  })
})

describe('波關閉與結案', () => {
  it('waves_closed 增加 → wave-closed，波號取新關的那一波，演員 leader', () => {
    const a = doc(detail({ waves_closed: 0, waves: [wave(1)] }))
    const b = doc(detail({ waves_closed: 1, waves: [wave(1, { closed_at: ts(NOW) })] }))
    expect(step(a, b)).toMatchObject([{ kind: 'wave-closed', wave: 1, actors: ['p-ld'], target: { kind: 'board', id: DIR }, announce: 'teamflow 示範任務：波 1 關閉' }])
  })

  it('close_result 由空轉 done（detail 已離開 active）→ task-done，演員為全桌群', () => {
    const a = doc(detail())
    const b = doc(null, { status: 'done', closed_at: ts(NOW), close_result: 'merged abc1234' })
    const [e] = step(a, b)
    expect(e).toMatchObject({ kind: 'task-done', target: { kind: 'board', id: DIR }, announce: 'teamflow 示範任務：任務結案' })
    expect(e.actors.sort()).toEqual(['p-be', 'p-fe', 'p-ld', 'p-ra', 'p-rb'])
  })

  it('abandoned 不慶祝：task-abandoned，沒有演員', () => {
    const b = doc(null, { status: 'abandoned', closed_at: ts(NOW), close_result: 'abandoned: 需求取消' })
    expect(step(doc(detail()), b)).toMatchObject([{ kind: 'task-abandoned', actors: [], announce: 'teamflow 示範任務：任務已放棄' }])
  })

  it('基準時已結案的任務不播', () => {
    const closed = doc(null, { status: 'done', closed_at: ts(NOW), close_result: 'merged x' })
    expect(step(closed, doc(null, { status: 'done', closed_at: ts(NOW), close_result: 'merged x' }))).toEqual([])
  })
})

describe('即時判定（預設 1）', () => {
  const a = () => doc(detail({ waves: [wave(1)] }))
  const b = () => doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW) })] }))

  it('第一份資料只當基準不播', () => {
    const eng = createEventEngine()
    expect(eng.observe(b(), ctx())).toEqual([])
  })

  it('SSE 斷線後重連：期間的資料與重連後第一份新資料都只當基準', () => {
    const eng = createEventEngine()
    const first = a()
    eng.observe(first, ctx())
    // 斷線：store 還留著舊 overview
    expect(eng.observe(first, ctx({ sse: 'connecting' }))).toEqual([])
    // 重連瞬間 sse=open，但 overview 還是斷線前那份（同一內容、同一 generatedAt）
    expect(eng.observe(first, ctx())).toEqual([])
    // 重連後抓回的第一份新資料：基準，不補播
    expect(eng.observe(b(), ctx())).toEqual([])
    // 之後的變化照常播
    expect(eng.observe(doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW), review_verdict_at: ts(NOW), review_verdict: 'a: ok' })] })), ctx())).toMatchObject([
      { kind: 'review-pass' },
    ])
  })

  it('重連判定不靠物件參照：內容相同的新物件（舊 generatedAt）不算新資料', () => {
    const eng = createEventEngine()
    const first = a()
    eng.observe(first, ctx())
    eng.observe(first, ctx({ sse: 'closed' }))
    expect(eng.observe(structuredClone(first), ctx())).toEqual([])
    expect(eng.observe(b(), ctx())).toEqual([])
  })

  it('背景分頁期間的資料與切回後第一份只當基準；之後照常播', () => {
    const eng = createEventEngine()
    eng.observe(a(), ctx())
    const hidden = b()
    expect(eng.observe(hidden, ctx({ visible: false }))).toEqual([])
    // 切回時 hook 用手上那份（隱藏期間收到的）再看一次：基準
    expect(eng.observe(hidden, ctx())).toEqual([])
    expect(eng.observe(doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW), review_verdict_at: ts(NOW), review_verdict: 'a: ok' })] })), ctx())).toHaveLength(1)
  })

  it('分頁隱藏又切回、期間沒有新資料：切回後下一個真實事件照常播（I1）', () => {
    const eng = createEventEngine()
    const first = a()
    eng.observe(first, ctx())
    expect(eng.observe(first, ctx({ visible: false }))).toEqual([])
    expect(eng.observe(first, ctx())).toEqual([])
    expect(eng.observe(b(), ctx())).toMatchObject([{ kind: 'review-spawned' }])
  })

  it('隱藏期間 SSE 也斷線：切回仍要等重連後的新資料當基準', () => {
    const eng = createEventEngine()
    const first = a()
    eng.observe(first, ctx())
    eng.observe(first, ctx({ visible: false }))
    eng.observe(first, ctx({ visible: false, sse: 'connecting' }))
    expect(eng.observe(first, ctx())).toEqual([])
    expect(eng.observe(b(), ctx())).toEqual([])
    expect(eng.observe(doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW), review_verdict_at: ts(NOW), review_verdict: 'a: ok' })] })), ctx())).toHaveLength(1)
  })

  it('2 分鐘保險：分鐘戳早於現在 2 分鐘以上的不播', () => {
    const old = doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW - 3 * MIN) })] }))
    expect(step(a(), old)).toEqual([])
    const ok = doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW - 2 * MIN) })] }))
    expect(step(a(), ok)).toHaveLength(1)
  })

  it('同一事件 id 只出一次（資料來回時不重播）', () => {
    const eng = createEventEngine()
    eng.observe(a(), ctx())
    expect(eng.observe(b(), ctx())).toHaveLength(1)
    expect(eng.observe(a(), ctx())).toEqual([])
    expect(eng.observe(b(), ctx())).toEqual([])
  })
})

describe('佇列（§6.17）', () => {
  const ev = (id: string, actors: string[], at: number): OfficeEvent => ({
    id,
    kind: 'wave-closed',
    taskDir: DIR,
    wave: 1,
    actors,
    target: null,
    count: null,
    at,
    announce: id,
  })

  it('同一角色 30 秒內超過 3 個只留最後一個；其他角色不受影響', () => {
    const list = [ev('1', ['x'], NOW), ev('2', ['x'], NOW + 1), ev('3', ['x'], NOW + 2), ev('4', ['x'], NOW + 3), ev('y', ['y'], NOW + 1)]
    expect(applyQueue(list, NOW + 3).map((e) => e.id)).toEqual(['y', '4'])
  })

  it('剛好 3 個全留、依 at 排序', () => {
    const list = [ev('2', ['x'], NOW + 1), ev('1', ['x'], NOW), ev('3', ['x'], NOW + 2)]
    expect(applyQueue(list, NOW + 2).map((e) => e.id)).toEqual(['1', '2', '3'])
  })

  it('超過 30 秒的事件移出清單；沒有演員的事件以白板當佇列', () => {
    const list = [ev('old', ['x'], NOW - QUEUE_WINDOW_MS - 1), ev('a', [], NOW), ev('b', [], NOW), ev('c', [], NOW), ev('d', [], NOW)]
    expect(applyQueue(list, NOW).map((e) => e.id)).toEqual(['d'])
  })
})

// qa 疑慮 1：高負載下偶爾 review-fix 之後一直沒有氣泡、live region 停在「審查開始」。
// 負載會造成：資料延遲到、中間夾多份無關 overview、多次變動被合併成一份、list 先到而 detail 後到。
describe('審查結果在延遲與合併下不漏播（qa 疑慮 1）', () => {
  const fixed = (k = 2) => wave(2, { review_spawned_at: ts(NOW), review_verdict_at: ts(NOW), review_verdict: `a: important ${k}` })
  const spawnedOnly = () => wave(2, { review_spawned_at: ts(NOW) })

  it('review-fix 前夾了多份無關 overview（generatedAt 前進、pane 疊加的新物件）仍播出', () => {
    const eng = createEventEngine()
    const d = detail({ waves: [wave(1), spawnedOnly()] })
    eng.observe(doc(d), ctx())
    expect(eng.observe(doc(d), ctx())).toEqual([])
    expect(eng.observe(doc(detail({ ...d, updated_at: ts(NOW + 1) } as Partial<TaskDetail>)), ctx())).toEqual([])
    expect(eng.observe(structuredClone(doc(d)), ctx())).toEqual([])
    expect(eng.observe(doc(detail({ waves: [wave(1), fixed()] })), ctx())).toMatchObject([{ kind: 'review-fix', wave: 2, count: 2 }])
  })

  it('審查開始與 verdict 被合併成同一份：兩個事件都播', () => {
    const a = doc(detail({ waves: [wave(1), wave(2)] }))
    const b = doc(detail({ waves: [wave(1), fixed()] }))
    expect(step(a, b).map((e) => e.kind).sort()).toEqual(['review-fix', 'review-spawned'])
  })

  it('list 先更新、detail 還是舊的（detail 抓取失敗保留上一次）：detail 補上後才播，且只播一次', () => {
    const eng = createEventEngine()
    const old = detail({ waves: [wave(1), spawnedOnly()] })
    eng.observe(doc(old), ctx())
    // list 的摘要已變（波數不變但 updated_at 變），active 仍是舊 detail
    expect(eng.observe(doc(old, { updated_at: ts(NOW + MIN) }), ctx())).toEqual([])
    const fresh = detail({ waves: [wave(1), fixed()] })
    expect(eng.observe(doc(fresh), ctx())).toMatchObject([{ kind: 'review-fix' }])
    expect(eng.observe(doc(fresh), ctx())).toEqual([])
  })

  it('verdict 延遲很久才到：分鐘戳在 2 分鐘保險內（含分鐘截斷的最壞情況）仍播', () => {
    const a = doc(detail({ waves: [wave(1), spawnedOnly()] }))
    const b = doc(detail({ waves: [wave(1), fixed()] }))
    // 實際寫入於 NOW 分鐘的第 59 秒 → 戳＝NOW；偵測時 NOW + 59 秒 + 延遲 60 秒
    expect(step(a, b, { now: NOW + 119_000 })).toMatchObject([{ kind: 'review-fix' }])
  })

  it('SSE 閃斷（open→connecting→open）夾在 spawned 與 verdict 之間：重連後的下一份 push 仍播（僅 refetch 的那一份是基準）', () => {
    const eng = createEventEngine()
    const spawnedDoc = doc(detail({ waves: [wave(1), spawnedOnly()] }))
    eng.observe(spawnedDoc, ctx())
    eng.observe(spawnedDoc, ctx({ sse: 'connecting' }))
    eng.observe(spawnedDoc, ctx())
    // handleStreamOpen 的 fetchOverview 回來：基準
    expect(eng.observe(doc(detail({ waves: [wave(1), spawnedOnly()] })), ctx())).toEqual([])
    // 之後 push 來的 verdict：照常播
    expect(eng.observe(doc(detail({ waves: [wave(1), fixed()] })), ctx())).toMatchObject([{ kind: 'review-fix' }])
  })
})
