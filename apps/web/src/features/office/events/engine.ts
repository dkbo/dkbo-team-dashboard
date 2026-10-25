// 事件引擎（AC5、§6.17、E6–E8）：比對前後兩份 overview（進行中任務的 detail＋list 的 close_result）產出 OfficeEvent。
// 只播即時事件（預設 1）：第一份、SSE 重連後與背景分頁期間的資料只當基準；分鐘戳早於現在 2 分鐘以上的不播。
import type { OfficeSession, OverviewDoc, TaskDetail, TaskWave } from '@dash/shared'
import { parseLocalTs } from '@/lib/format'
import type { SseState } from '@/store'
import { openEscalations } from './escalation'
import type { OfficeEvent, OfficeEventKind } from './types'

/** 預設 1 的保險：分鐘戳比現在早這麼多以上就不播 */
export const STALE_MS = 2 * 60_000
/** §6.17：每個角色一條佇列，這段時間內超過 QUEUE_MAX 個只留最後一個；也是事件留在清單上的時間 */
export const QUEUE_WINDOW_MS = 30_000
export const QUEUE_MAX = 3

interface TaskSnap {
  project: string
  dir: string
  /** 「<專案> <任務顯示名>」，live region 文字的開頭 */
  label: string
  closeResult: string | null
  closedAt: string | null
  detail: TaskDetail | null
}

type Snapshot = Map<string, TaskSnap>

/** key＝任務 dir（同 model.ts 的 taskKey，撞名時先出現的專案優先） */
function snapshotOf(doc: OverviewDoc): Snapshot {
  const out: Snapshot = new Map()
  for (const p of doc.projects) {
    for (const t of p.list?.tasks ?? []) {
      if (out.has(t.dir)) continue
      out.set(t.dir, {
        project: p.name,
        dir: t.dir,
        label: `${p.name} ${t.display ?? t.short}`,
        closeResult: t.close_result || null,
        closedAt: t.closed_at,
        detail: p.active[t.dir] ?? null,
      })
    }
    for (const [dir, d] of Object.entries(p.active)) {
      if (out.has(dir)) continue
      out.set(dir, { project: p.name, dir, label: `${p.name} ${d.display ?? d.short}`, closeResult: d.close_result || null, closedAt: d.closed_at, detail: d })
    }
  }
  return out
}

const VERDICT_SEG = /^\s*[A-Za-z][\w-]*:\s*(ok|important\s+(\d+)|skipped)(?![\w])/i

/** verdict 依 ` / ` 切段；任一段 important K > 0＝要修（K 取最大），其餘皆 ok／skipped＝通過；沒有一段看得懂回 null */
export function parseVerdict(v: string): { fix: boolean; count: number } | null {
  let seen = false
  let count = 0
  for (const seg of v.split(' / ')) {
    const m = VERDICT_SEG.exec(seg)
    if (!m) continue
    seen = true
    if (m[2] != null) count = Math.max(count, Number(m[2]))
  }
  return seen ? { fix: count > 0, count } : null
}

/** brief 波次表裡第 n 波的成員（待命不算 dev），依表序不重複 */
function waveDevs(d: TaskDetail, n: number): string[] {
  const rows = d.brief.waves.filter((w) => w.wave === n && w.member && w.type !== '待命')
  return [...new Set(rows.map((w) => w.member as string))]
}

interface Cast {
  all: OfficeSession[]
  leader: string[]
  dev(member: string): string | null
  reviewers(n: number): string[]
}

function castOf(sessions: OfficeSession[], dir: string, d: TaskDetail | null): Cast {
  const all = sessions.filter((s) => s.taskDir === dir)
  return {
    all,
    leader: all.filter((s) => s.leader).map((s) => s.id),
    dev: (member) => all.find((s) => !s.leader && s.member === member)?.id ?? null,
    reviewers: (n) =>
      all
        .filter((s) => s.role === 'reviewer' || (s.role == null && s.member?.startsWith('reviewer')))
        .filter((s) => {
          const w = d?.members.find((m) => m.name === s.member)?.wave
          return w == null || w === n
        })
        .map((s) => s.id),
  }
}

const tsMs = (ts: string | null | undefined): number | null => parseLocalTs(ts)?.getTime() ?? null

function diffTask(p: TaskSnap, n: TaskSnap, sessions: OfficeSession[], now: number): OfficeEvent[] {
  const out: OfficeEvent[] = []
  const board = { kind: 'board' as const, id: n.dir }
  const cast = castOf(sessions, n.dir, n.detail ?? p.detail)
  const push = (
    kind: OfficeEventKind,
    key: string,
    ts: string | null,
    e: { wave?: number | null; actors?: string[]; target?: OfficeEvent['target']; count?: number | null },
    text: string,
  ) => {
    const t = tsMs(ts)
    if (t != null && now - t > STALE_MS) return
    out.push({
      id: `${kind}:${n.dir}:${key}`,
      kind,
      taskDir: n.dir,
      wave: e.wave ?? null,
      actors: e.actors ?? [],
      target: e.target ?? null,
      count: e.count ?? null,
      at: now,
      announce: `${n.label}：${text}`,
    })
  }

  // 結案：以 list 的 close_result 判定（detail 在結案瞬間就離開 active）
  if (!p.closeResult && n.closeResult) {
    if (/^abandoned\b/.test(n.closeResult)) push('task-abandoned', '', n.closedAt, { target: board }, '任務已放棄')
    else push('task-done', '', n.closedAt, { actors: cast.all.map((s) => s.id), target: board }, '任務結案')
    return out
  }

  const pd = p.detail
  const nd = n.detail
  if (!pd || !nd) return out
  const prevWave = new Map<number, TaskWave>(pd.waves.map((w) => [w.wave, w]))

  for (const w of nd.waves) {
    const o = prevWave.get(w.wave)
    if (w.review_spawned_at && w.review_spawned_at !== o?.review_spawned_at) {
      const devs = waveDevs(nd, w.wave)
      const one = devs.length === 1 ? cast.dev(devs[0]) : null
      push(
        'review-spawned',
        `${w.wave}:${w.review_spawned_at}`,
        w.review_spawned_at,
        { wave: w.wave, actors: cast.reviewers(w.wave), target: one ? { kind: 'session', id: one } : board },
        `波 ${w.wave} 審查開始`,
      )
    }
    if (w.review_verdict && (w.review_verdict !== o?.review_verdict || w.review_verdict_at !== o?.review_verdict_at)) {
      const v = parseVerdict(w.review_verdict)
      if (v) {
        const devs = waveDevs(nd, w.wave)
          .map(cast.dev)
          .filter((id): id is string => id != null)
        const actors = [...devs, ...cast.reviewers(w.wave)]
        const key = `${w.wave}:${w.review_verdict_at ?? ''}:${w.review_verdict}`
        if (v.fix) push('review-fix', key, w.review_verdict_at, { wave: w.wave, actors, count: v.count }, `波 ${w.wave} 審查要修 ${v.count} 條`)
        else push('review-pass', key, w.review_verdict_at, { wave: w.wave, actors }, `波 ${w.wave} 審查通過`)
      }
    }
  }

  if (nd.waves_closed > pd.waves_closed) {
    const fresh = nd.waves.filter((w) => w.closed_at && !prevWave.get(w.wave)?.closed_at)
    const last = fresh.sort((a, b) => b.wave - a.wave)[0]
    const n_ = last?.wave ?? nd.waves_closed
    push('wave-closed', String(n_), last?.closed_at ?? null, { wave: n_, actors: cast.leader, target: board }, `波 ${n_} 關閉`)
  }

  const key = (e: { from: string; at: number }) => `${e.from}:${e.at}`
  const before = new Map(openEscalations(pd).map((e) => [key(e), e]))
  const after = new Map(openEscalations(nd).map((e) => [key(e), e]))
  for (const [k, e] of after) {
    if (before.has(k) || now - e.at > STALE_MS) continue
    push('escalate', k, null, { actors: cast.leader, target: board }, '有 ESCALATE 待決定')
  }
  for (const k of before.keys()) {
    if (!after.has(k)) push('escalate-resolved', k, null, { actors: cast.leader, target: board }, 'ESCALATE 已決定')
  }
  return out
}

export interface ObserveCtx {
  sse: SseState
  /** 分頁可見（document.visibilityState !== 'hidden'） */
  visible: boolean
  sessions: OfficeSession[]
  now: number
}

export interface EventEngine {
  /** 看一份 overview；回傳這一份新產生的即時事件（基準一律空陣列） */
  observe(doc: OverviewDoc, ctx: ObserveCtx): OfficeEvent[]
}

/**
 * 即時判定：不靠物件參照，看 sse 狀態、分頁可見與 generatedAt。
 * SSE 斷線時記下手上那份的 generatedAt；重連後要等到比它新的一份才當基準，之後才開始比對 ——
 * 重連瞬間 store 裡還是斷線前那份，拿它比對會把斷線期間的變化補播出來。
 * 分頁隱藏期間 SSE 照常收，手上那份就是最新：切回後第一次看到的那份直接當基準（不等新資料，否則會吞掉下一個真實事件）。
 */
export function createEventEngine(): EventEngine {
  let prev: Snapshot | null = null
  let lastGen = -Infinity
  let awaiting = false
  let heldGen = -Infinity
  let wasHidden = false
  const seen = new Set<string>()

  return {
    observe(doc, ctx) {
      const snap = snapshotOf(doc)
      const base = prev
      prev = snap
      const gen = doc.generatedAt
      if (ctx.sse !== 'open') {
        if (!awaiting) {
          awaiting = true
          heldGen = lastGen
        }
        lastGen = Math.max(lastGen, gen)
        return []
      }
      lastGen = Math.max(lastGen, gen)
      if (!ctx.visible) {
        wasHidden = true
        return []
      }
      if (awaiting) {
        if (gen > heldGen) awaiting = false
        wasHidden = false
        return []
      }
      if (wasHidden) {
        wasHidden = false
        return []
      }
      if (!base) return []
      const out: OfficeEvent[] = []
      for (const [dir, n] of snap) {
        const p = base.get(dir)
        if (!p) continue
        for (const e of diffTask(p, n, ctx.sessions, ctx.now)) {
          if (seen.has(e.id)) continue
          seen.add(e.id)
          out.push(e)
        }
      }
      return out
    },
  }
}

/** §6.17 佇列：留下 QUEUE_WINDOW_MS 內的事件；同一角色（沒有演員時以白板）超過 QUEUE_MAX 個只留最後一個 */
export function applyQueue(events: OfficeEvent[], now: number): OfficeEvent[] {
  const recent = events.filter((e) => e.at >= now - QUEUE_WINDOW_MS).sort((a, b) => a.at - b.at)
  const queues = new Map<string, OfficeEvent[]>()
  for (const e of recent) {
    for (const k of e.actors.length > 0 ? e.actors : [`board:${e.taskDir}`]) {
      const q = queues.get(k) ?? []
      q.push(e)
      queues.set(k, q)
    }
  }
  const dropped = new Set<string>()
  for (const q of queues.values()) if (q.length > QUEUE_MAX) for (const e of q.slice(0, -1)) dropped.add(e.id)
  return recent.filter((e) => !dropped.has(e.id))
}
