// 事件播放的執行面（非 React）：照 plan.ts 的規劃寫覆寫、排清除、持動畫票、管 bubble／白板特效／即時 ESCALATE 計數。
// 動畫票只在動作播放期間持有（走路、比讚、跳），播完歸零；bubble 與「!」是 DOM，不吃 WebGL 幀（§4.7）。
import type { Substate } from '@dash/shared'
import type { OfficeEvent } from '@/features/office/events/types'
import type { CharacterOverride } from '../anchors'
import type { Tickets } from '../tickets'
import { planEvent, reconcileOut, type BoardFx, type BubbleSpec, type PlanCtx, type ReviewerOut } from './plan'

/** 掛載時已經存在、超過這麼久的事件當成已播（event-live-window；清單 ↔ 3D 重掛不補播，E7） */
export const STALE_ON_MOUNT_MS = 10_000

export interface RuntimeDeps {
  tickets: Tickets
  setOverride(id: string, o: CharacterOverride | null): void
  getOverride(id: string): CharacterOverride | null
  /** 每個事件當下的規劃環境（細狀態、錨點、reduced motion） */
  ctx(): Omit<PlanCtx, 'out'>
  now(): number
  /** bubble 停留（--motion-event-bubble；reduced motion 6 秒） */
  bubbleMs(): number
  /** bubble／白板／ESCALATE 計數變了 */
  onChange(): void
}

export interface BubbleState {
  spec: BubbleSpec
  /** 哪種事件（testid 的 data-kind） */
  kind: OfficeEvent['kind']
  until: number
  /** 換新 bubble 時換 key，DOM 重新進場 */
  key: string
}

export interface RuntimeSnapshot {
  bubbles: ReadonlyMap<string, BubbleState>
  boards: ReadonlyMap<string, BoardFx & { key: string }>
  liveEscalations: ReadonlyMap<string, number>
  /** 即時 escalate 事件的演員（leader）；store 還沒有 session 時拿來掛「!」 */
  escalationActors: ReadonlyMap<string, readonly string[]>
}

export interface Runtime {
  feed(events: readonly OfficeEvent[]): void
  /** 細狀態或資料變了：出動中的 reviewer 停下或回座（verdict＝store 的該波已有審查結果） */
  reconcile(substate: (id: string) => Substate | null, verdict: (o: ReviewerOut) => boolean): void
  snapshot(): RuntimeSnapshot
  dispose(): void
}

export function createRuntime(deps: RuntimeDeps): Runtime {
  const mountedAt = deps.now()
  const played = new Set<string>()
  const out = new Map<string, ReviewerOut>()
  const paused = new Map<string, boolean>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const releases = new Set<() => void>()
  let bubbles = new Map<string, BubbleState>()
  let boards = new Map<string, BoardFx & { key: string }>()
  let liveEsc = new Map<string, number>()
  let escActors = new Map<string, readonly string[]>()
  /** 寫過覆寫的角色（dispose 時清掉） */
  const owned = new Set<string>()
  const put = (id: string, o: CharacterOverride | null) => {
    if (o) owned.add(id)
    else owned.delete(id)
    deps.setOverride(id, o)
  }

  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }
  const hold = (ms: number) => {
    if (ms <= 0) return
    const release = deps.tickets.holdFor(ms)
    releases.add(release)
    later(ms, () => releases.delete(release))
  }
  const setOverride = (id: string, o: CharacterOverride | null, clearAfter: number | null) => {
    put(id, o)
    if (o && clearAfter != null) later(clearAfter, () => deps.getOverride(id) === o && put(id, null))
  }

  const play = (e: OfficeEvent) => {
    let changed = false
    if (e.kind === 'escalate' || e.kind === 'escalate-resolved') {
      const n = liveEsc.get(e.taskDir) ?? 0
      liveEsc = new Map(liveEsc).set(e.taskDir, Math.max(0, n + (e.kind === 'escalate' ? 1 : -1)))
      if (e.actors.length > 0) escActors = new Map(escActors).set(e.taskDir, e.actors)
      changed = true
    }
    const plan = planEvent(e, { ...deps.ctx(), out })
    const cued = new Set(plan.cues.map((c) => c.actor))
    for (const id of plan.out.clear) {
      out.delete(id)
      paused.delete(id)
      if (!cued.has(id)) put(id, null)
    }
    for (const o of plan.out.set) {
      out.set(o.id, o)
      paused.delete(o.id)
    }
    const now = deps.now()
    for (const c of plan.cues) {
      if (c.override !== undefined) setOverride(c.actor, c.override, c.clearAfter)
      hold(c.holdMs)
      if (c.bubble) {
        const key = `${e.id}:${c.actor}`
        const until = now + deps.bubbleMs()
        bubbles = new Map(bubbles).set(c.actor, { spec: c.bubble, kind: e.kind, until, key })
        later(until - now, () => {
          if (bubbles.get(c.actor)?.key !== key) return
          bubbles = new Map(bubbles)
          bubbles.delete(c.actor)
          deps.onChange()
        })
        changed = true
      }
    }
    if (plan.board) {
      const fx = { ...plan.board, key: e.id }
      boards = new Map(boards).set(fx.taskDir, fx)
      if (fx.spark || fx.confetti) hold(fx.ms)
      later(fx.ms, () => {
        if (boards.get(fx.taskDir)?.key !== fx.key) return
        boards = new Map(boards)
        boards.delete(fx.taskDir)
        deps.onChange()
      })
      changed = true
    }
    return changed
  }

  return {
    feed(events) {
      let changed = false
      for (const e of events) {
        if (played.has(e.id)) continue
        played.add(e.id)
        if (e.at < mountedAt - STALE_ON_MOUNT_MS) continue
        changed = play(e) || changed
      }
      if (changed) deps.onChange()
    },
    reconcile(substate, verdict) {
      for (const a of reconcileOut(out, paused, substate, verdict)) {
        put(a.id, a.override)
        if (a.done) {
          out.delete(a.id)
          paused.delete(a.id)
        } else paused.set(a.id, a.paused)
      }
    },
    snapshot: () => ({ bubbles, boards, liveEscalations: liveEsc, escalationActors: escActors }),
    dispose() {
      for (const t of timers) clearTimeout(t)
      timers.clear()
      for (const r of releases) r()
      releases.clear()
      for (const id of [...owned]) put(id, null)
      out.clear()
      paused.clear()
    },
  }
}
