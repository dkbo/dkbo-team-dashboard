import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Substate } from '@dash/shared'
import type { OfficeEvent } from '@/features/office/events/types'
import type { CharacterOverride, Vec3 } from '@/features/office-scene/anchors'
import { createTickets } from '@/features/office-scene/tickets'
import { createRuntime, type RuntimeDeps } from '@/features/office-scene/director/runtime'

const MS = { thumb: 1500, headDown: 2000, nod: 1200, celebrate: 3000, waveFill: 600, spark: 1200, walkMax: 4000 }

function setup(opts: { reduced?: boolean; subs?: Record<string, Substate> } = {}) {
  const subs: Record<string, Substate> = { dev1: 'running', rev1: 'idle', lead: 'idle', ...opts.subs }
  const seat: Record<string, Vec3> = { dev1: [2, 0, 3], rev1: [6, 0, 3], lead: [5, 0, 1] }
  const overrides = new Map<string, CharacterOverride>()
  const tickets = createTickets()
  const deps: RuntimeDeps = {
    tickets,
    setOverride: (id, o) => void (o ? overrides.set(id, o) : overrides.delete(id)),
    getOverride: (id) => overrides.get(id) ?? null,
    now: () => Date.now(),
    bubbleMs: () => 3000,
    onChange: vi.fn(),
    ctx: () => ({
      reducedMotion: opts.reduced ?? false,
      ms: MS,
      info: (id) => (subs[id] ? { substate: subs[id], at: seat[id] } : null),
      deskSide: (id) => (seat[id] ? [seat[id][0] + 0.9, 0, seat[id][2]] : null),
      board: () => [4, 0, 6],
      walkPath: (a, b) => [a, b],
      isReviewer: (id) => id.startsWith('rev'),
      isLeader: (id) => id === 'lead',
    }),
  }
  const rt = createRuntime(deps)
  return { rt, tickets, overrides, subs, deps }
}

let seq = 0
const ev = (kind: OfficeEvent['kind'], over: Partial<OfficeEvent> = {}): OfficeEvent => ({
  id: `${kind}:${++seq}`,
  kind,
  taskDir: 't1',
  wave: 1,
  actors: [],
  target: null,
  count: null,
  at: Date.now(),
  announce: '',
  ...over,
})

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }))
afterEach(() => vi.useRealTimers())

describe('createRuntime', () => {
  it('reviewer 出動 → 走路期間持票、走完票歸零但覆寫常駐；verdict 後走回、清覆寫、票歸零', () => {
    const { rt, tickets, overrides } = setup()
    rt.feed([ev('review-spawned', { actors: ['rev1'], target: { kind: 'session', id: 'dev1' } })])
    expect(tickets.count()).toBe(1)
    expect(overrides.get('rev1')?.gesture).toBe('hold-board')
    vi.advanceTimersByTime(4200)
    expect(tickets.count()).toBe(0)
    expect(overrides.has('rev1')).toBe(true)

    rt.feed([ev('review-pass', { actors: ['dev1', 'rev1'] })])
    expect(overrides.get('dev1')?.gesture).toBe('thumbs-up')
    expect(overrides.get('rev1')?.gesture).toBe('stand')
    expect(tickets.count()).toBeGreaterThan(0)
    vi.advanceTimersByTime(4200)
    expect(overrides.size).toBe(0)
    expect(tickets.count()).toBe(0)
  })

  it('同一個事件 id 只播一次（events 陣列重給不重播）', () => {
    const { rt, overrides } = setup()
    const e = ev('review-pass', { actors: ['dev1'] })
    rt.feed([e])
    vi.advanceTimersByTime(2000)
    expect(overrides.size).toBe(0)
    rt.feed([e])
    expect(overrides.size).toBe(0)
  })

  it('掛載前就存在、超過 10 秒的事件當成已播（清單 ↔ 3D 重掛不補播）', () => {
    const { rt, overrides } = setup()
    rt.feed([ev('review-pass', { actors: ['dev1'], at: Date.now() - 11_000 })])
    expect(overrides.size).toBe(0)
  })

  it('bubble 一人一顆、新事件頂替；到期移除', () => {
    const { rt } = setup()
    rt.feed([ev('review-pass', { actors: ['dev1'] })])
    expect(rt.snapshot().bubbles.get('dev1')?.spec.emoji).toBe('👍')
    rt.feed([ev('review-fix', { actors: ['dev1'], count: 2 })])
    expect(rt.snapshot().bubbles.get('dev1')?.spec.emoji).toBe('😓')
    vi.advanceTimersByTime(3100)
    expect(rt.snapshot().bubbles.size).toBe(0)
  })

  it('後一個事件換掉覆寫時，前一個的到期清除不能清掉新的', () => {
    const { rt, overrides } = setup()
    rt.feed([ev('review-pass', { actors: ['dev1'] })])
    vi.advanceTimersByTime(1000)
    rt.feed([ev('review-fix', { actors: ['dev1'], count: 1 })])
    vi.advanceTimersByTime(600) // 第一個（1500）到期
    expect(overrides.get('dev1')?.gesture).toBe('head-down')
    vi.advanceTimersByTime(1500)
    expect(overrides.size).toBe(0)
  })

  it('波關閉：白板特效到期移除、票歸零', () => {
    const { rt, tickets } = setup()
    rt.feed([ev('wave-closed', { actors: ['lead'], wave: 2 })])
    expect(rt.snapshot().boards.get('t1')).toMatchObject({ flashIndex: 1, spark: true })
    expect(tickets.count()).toBeGreaterThan(0)
    vi.advanceTimersByTime(1900)
    expect(rt.snapshot().boards.size).toBe(0)
    expect(tickets.count()).toBe(0)
  })

  it('ESCALATE 即時計數：escalate +1、解除 -1', () => {
    const { rt } = setup()
    rt.feed([ev('escalate', { actors: ['lead'] })])
    expect(rt.snapshot().liveEscalations.get('t1')).toBe(1)
    rt.feed([ev('escalate-resolved', { actors: ['lead'] })])
    expect(rt.snapshot().liveEscalations.get('t1')).toBe(0)
  })

  it('reviewer 走路中途變等你：停下揮手；恢復後清覆寫', () => {
    const { rt, overrides, subs } = setup()
    rt.feed([ev('review-spawned', { actors: ['rev1'], target: { kind: 'board', id: 't1' } })])
    subs.rev1 = 'waiting'
    rt.reconcile((id) => subs[id] ?? null, () => false)
    expect(overrides.get('rev1')).toEqual({ gesture: 'wave' })
    subs.rev1 = 'running'
    rt.reconcile((id) => subs[id] ?? null, () => false)
    expect(overrides.has('rev1')).toBe(false)
  })

  it('I1：出動後沒有 verdict 事件、reviewer 轉成 done：覆寫被清掉，之後的 verdict 事件也不再動它', () => {
    const { rt, overrides, subs } = setup({ subs: { rev1: 'running' } })
    rt.feed([ev('review-spawned', { actors: ['rev1'], target: { kind: 'board', id: 't1' } })])
    expect(overrides.get('rev1')?.gesture).toBe('hold-board')
    subs.rev1 = 'done'
    rt.reconcile((id) => subs[id] ?? null, () => false)
    expect(overrides.has('rev1')).toBe(false)
    rt.feed([ev('review-pass', { actors: ['rev1'] })])
    expect(overrides.has('rev1')).toBe(false)
  })

  it('I1：細狀態不變但 store 該波已有 verdict：清掉覆寫', () => {
    const { rt, overrides, subs } = setup({ subs: { rev1: 'running' } })
    rt.feed([ev('review-spawned', { actors: ['rev1'], target: { kind: 'board', id: 't1' }, wave: 3 })])
    rt.reconcile((id) => subs[id] ?? null, (o) => o.taskDir === 't1' && o.wave === 3)
    expect(overrides.has('rev1')).toBe(false)
  })

  it('dispose：清掉所有覆寫與計時、票歸零', () => {
    const { rt, tickets, overrides } = setup()
    rt.feed([ev('task-done', { actors: ['dev1', 'lead'] })])
    expect(tickets.count()).toBeGreaterThan(0)
    rt.dispose()
    expect(overrides.size).toBe(0)
    expect(tickets.count()).toBe(0)
  })
})
