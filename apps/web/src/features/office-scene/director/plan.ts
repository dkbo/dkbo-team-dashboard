// 事件 → 角色動作規劃（§6.17、E6–E8）：純函式，EventDirector 照它寫覆寫、掛 bubble、持票。
// 細狀態優先：等你／錯誤的角色不起身不比讚，只出 bubble；找不到演員（預設 5）不播也不掛。
import type { Substate, TaskDetail } from '@dash/shared'
import type { OfficeEvent } from '@/features/office/events/types'
import type { CharacterOverride, Vec3 } from '../anchors'
import { WALK_SPEED } from '../motion'

export interface MotionMs {
  thumb: number
  headDown: number
  nod: number
  celebrate: number
  waveFill: number
  spark: number
  walkMax: number
}

/** 出動中的 reviewer：站在哪裡等 verdict */
export interface ReviewerOut {
  id: string
  taskDir: string
  /** 哪一波的審查（比對 store 的 review_verdict_at） */
  wave: number | null
  /** 出動當下的細狀態（之後「轉成」done／idle／interrupted 才算審完） */
  since: Substate
  at: Vec3
}

export interface PlanCtx {
  reducedMotion: boolean
  ms: MotionMs
  out: ReadonlyMap<string, ReviewerOut>
  /** 角色現在的細狀態與細狀態下該在的位置；不在場回 null */
  info(id: string): { substate: Substate; at: Vec3 } | null
  deskSide(id: string): Vec3 | null
  board(taskDir: string): Vec3 | null
  walkPath(from: Vec3, to: Vec3): Vec3[]
  isReviewer(id: string): boolean
  isLeader(id: string): boolean
}

export interface BubbleSpec {
  emoji: string
  label: string
  tone: 'ok' | 'warn' | 'info' | 'danger'
}

export interface Cue {
  actor: string
  /** undefined＝不動覆寫；null＝清掉（回細狀態） */
  override?: CharacterOverride | null
  /** 幾 ms 後清掉覆寫；null＝常駐（等下一個事件） */
  clearAfter: number | null
  bubble: BubbleSpec | null
  /** 動畫票持有時間（0＝不需要連續 render） */
  holdMs: number
}

export interface BoardFx {
  taskDir: string
  /** 新填的那一段（0 起算）；reduced motion 直接填滿＝null */
  flashIndex: number | null
  spark: boolean
  confetti: boolean
  ms: number
}

export interface Plan {
  cues: Cue[]
  board: BoardFx | null
  out: { set: ReviewerOut[]; clear: string[] }
}

/** 回座走完到清覆寫之間的餘裕（ms） */
export const CLEAR_MARGIN_MS = 300

/** reviewer 站位錯開（格） */
const SPREAD = 0.7

export const isAlert = (s: Substate) => s === 'waiting' || s === 'error'

const pathLength = (pts: Vec3[]) => pts.reduce((n, p, i) => (i === 0 ? 0 : n + Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2])), 0)

/** 走完路徑要多久（與 scene 的 walkMaxMs 同算法：照 WALK_SPEED，壓在上限內） */
export function walkDuration(pts: Vec3[], max: number): number {
  return Math.round(Math.min(max, (pathLength(pts) / WALK_SPEED) * 1000))
}

export function planEvent(e: OfficeEvent, c: PlanCtx): Plan {
  const plan: Plan = { cues: [], board: null, out: { set: [], clear: [] } }
  const rm = c.reducedMotion
  /** 只出 bubble、不動 */
  const still = (actor: string, bubble: BubbleSpec): Cue => ({ actor, clearAfter: null, bubble, holdMs: 0 })
  /** 原地做一個動作 ms 後回細狀態 */
  const gesture = (actor: string, g: CharacterOverride['gesture'], ms: number, bubble: BubbleSpec): Cue =>
    rm ? still(actor, bubble) : { actor, override: { gesture: g }, clearAfter: ms, bubble, holdMs: ms }

  switch (e.kind) {
    case 'review-spawned': {
      const bubble: BubbleSpec = { emoji: '🔍', label: `審查 波 ${e.wave ?? ''}`.trim(), tone: 'info' }
      const goal = (e.target?.kind === 'session' ? c.deskSide(e.target.id) : null) ?? c.board(e.taskDir)
      const present = e.actors.filter((id) => c.info(id))
      present.forEach((id, i) => {
        const info = c.info(id)!
        if (isAlert(info.substate) || !goal) return void plan.cues.push(still(id, bubble))
        const off = (i - (present.length - 1) / 2) * SPREAD
        const to: Vec3 = [goal[0] + off, 0, goal[2]]
        const path = c.walkPath(info.at, to)
        const ms = rm ? 0 : walkDuration(path, c.ms.walkMax)
        plan.cues.push({
          actor: id,
          override: { path, gesture: 'hold-board', walkMaxMs: c.ms.walkMax, screenOff: true, instant: rm || undefined },
          clearAfter: null,
          bubble,
          holdMs: ms > 0 ? ms + 100 : 0,
        })
        plan.out.set.push({ id, taskDir: e.taskDir, wave: e.wave, since: info.substate, at: to })
      })
      return plan
    }
    case 'review-pass':
    case 'review-fix': {
      const pass = e.kind === 'review-pass'
      const bubble: BubbleSpec = pass ? { emoji: '👍', label: '通過', tone: 'ok' } : { emoji: '😓', label: `要修 ${e.count ?? 0} 條`, tone: 'warn' }
      for (const id of e.actors) {
        const info = c.info(id)
        // 出動過的一定是 reviewer（store 還沒有那個 session 時也認得）
        if (c.out.has(id) || c.isReviewer(id)) {
          const out = c.out.get(id)
          if (!out) continue
          plan.out.clear.push(id)
          if (rm || !info) {
            plan.cues.push({ actor: id, override: null, clearAfter: null, bubble: null, holdMs: 0 })
            continue
          }
          const path = c.walkPath(out.at, info.at)
          const ms = walkDuration(path, c.ms.walkMax)
          // 走完才清：scene 的走路晚一格才開始，準時清會差幾公分沒到，scene 會再沿走道繞一次
          plan.cues.push({ actor: id, override: { path, gesture: 'stand', walkMaxMs: c.ms.walkMax }, clearAfter: ms + CLEAR_MARGIN_MS, bubble: null, holdMs: ms })
          continue
        }
        if (!info) continue
        if (isAlert(info.substate)) plan.cues.push(still(id, bubble))
        else plan.cues.push(gesture(id, pass ? 'thumbs-up' : 'head-down', pass ? c.ms.thumb : c.ms.headDown, bubble))
      }
      return plan
    }
    case 'wave-closed': {
      const bubble: BubbleSpec = { emoji: '✅', label: e.wave == null ? '波關閉' : `波 ${e.wave} 關閉`, tone: 'ok' }
      for (const id of e.actors) {
        const info = c.info(id)
        if (!info) continue
        plan.cues.push(isAlert(info.substate) ? still(id, bubble) : gesture(id, 'nod', c.ms.nod, bubble))
      }
      plan.board = {
        taskDir: e.taskDir,
        flashIndex: rm || e.wave == null ? null : e.wave - 1,
        spark: !rm,
        confetti: false,
        ms: c.ms.waveFill + c.ms.spark,
      }
      return plan
    }
    case 'task-done': {
      // 一般動態：跳＋彩帶（白板標籤另有「🎉 結案 ✓」），不另掛 bubble；等你／錯誤的人不跳、只出 bubble。
      // reduced motion：不跳、無彩帶，整桌只在 leader（找不到就第一位在場演員）頭上出一顆 bubble，不讓 bubble 疊成一片。
      const bubble: BubbleSpec = { emoji: '🎉', label: '結案', tone: 'ok' }
      const present = e.actors.filter((id) => c.info(id))
      const host = present.find((id) => c.isLeader(id)) ?? present[0]
      for (const id of present) {
        const info = c.info(id)!
        // 還在白板前的 reviewer 先收回座位（不在白板前跳；scene 依座位判坐姿會把它抬高）
        if (c.out.get(id)?.taskDir === e.taskDir) plan.cues.push({ actor: id, override: null, clearAfter: null, bubble: null, holdMs: 0 })
        else if (isAlert(info.substate)) plan.cues.push(still(id, bubble))
        else if (rm) {
          if (id === host) plan.cues.push(still(id, bubble))
        } else plan.cues.push({ actor: id, override: { gesture: 'jump' }, clearAfter: c.ms.celebrate, bubble: null, holdMs: c.ms.celebrate })
      }
      for (const o of c.out.values()) if (o.taskDir === e.taskDir) plan.out.clear.push(o.id)
      plan.board = { taskDir: e.taskDir, flashIndex: null, spark: false, confetti: !rm, ms: c.ms.celebrate }
      return plan
    }
    default:
      // task-abandoned 只更新白板（資料面）；escalate／escalate-resolved 只動徽章
      return plan
  }
}

export interface OutAction {
  id: string
  override: CharacterOverride | null
  paused: boolean
  done?: true
}

/** 該波這一輪審查已有結果：verdict 時間不早於出動時間（複看重新出動後，舊 verdict 不算） */
export function waveHasVerdict(detail: Pick<TaskDetail, 'waves'> | undefined, wave: number | null): boolean {
  const w = wave == null ? undefined : detail?.waves.find((x) => x.wave === wave)
  if (!w?.review_verdict_at) return false
  return !w.review_spawned_at || w.review_verdict_at >= w.review_spawned_at
}

/** 審完後 reviewer 會落到的細狀態（出動時就是這些的不算） */
const SETTLED = new Set<Substate>(['done', 'idle', 'interrupted'])

/**
 * 出動中的 reviewer 何時收回（清覆寫回細狀態位置並結束這次出動）：
 * - 角色離場；
 * - store 的該波已有 verdict（verdict 事件可能沒即時到：背景分頁切回、重連只當基準，I1）；
 * - 細狀態從出動時「轉成」done／idle／interrupted（審完了）；
 * - 錯誤（細狀態優先：回座位趴桌，不在走道上留站姿覆寫）；
 * - 等你＝停在原地揮手，恢復後收回。
 */
export function reconcileOut(
  out: ReadonlyMap<string, ReviewerOut>,
  paused: ReadonlyMap<string, boolean>,
  substate: (id: string) => Substate | null,
  verdict: (o: ReviewerOut) => boolean,
): OutAction[] {
  const acts: OutAction[] = []
  const recall = (id: string) => acts.push({ id, override: null, paused: false, done: true })
  for (const [id, o] of out) {
    const s = substate(id)
    const was = paused.get(id) ?? false
    if (s == null || verdict(o) || s === 'error' || (SETTLED.has(s) && s !== o.since)) recall(id)
    else if (s === 'waiting') {
      if (!was) acts.push({ id, override: { gesture: 'wave' }, paused: true })
    } else if (was) recall(id)
  }
  return acts
}

/**
 * 哪些 leader 掛「!」：store 的 detail 有未解 ESCALATE（openEscalations），或即時 escalate 事件比解除多（store 還沒 detail 時）。
 */
export function badgeLeaders(
  leadersByTask: Readonly<Record<string, string[]>>,
  storeOpen: ReadonlySet<string>,
  liveOpen: ReadonlyMap<string, number>,
): Set<string> {
  const out = new Set<string>()
  for (const [dir, ids] of Object.entries(leadersByTask)) {
    if (storeOpen.has(dir) || (liveOpen.get(dir) ?? 0) > 0) for (const id of ids) out.add(id)
  }
  return out
}
