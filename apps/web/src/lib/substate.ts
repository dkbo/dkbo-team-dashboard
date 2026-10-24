// 細狀態對照與計時（office 規格 §1.2；decisions Q3／Q7／Q8）。純函式，時間一律由呼叫端傳 now。
import { Check, CircleAlert, Hand, Moon, PencilLine, Square, Terminal, type LucideIcon } from 'lucide-react'
import type { PaneStatus, SessionLive, Substate } from '@dash/shared'
import type { Tone } from '@/components/app/StatusDot'

export interface SubstateMeta {
  label: string
  tone: Tone
  /** 標記（AgentMarker）與清單用的圖示；thinking 是三點，沒有圖示 */
  icon: LucideIcon | null
  /** 標記型（§6.3） */
  marker: 'alert' | 'line' | 'bubble' | 'soft'
  /** 對應的粗狀態（Q15） */
  paneStatus: PaneStatus
  /** 排序：越小越要人處理 */
  order: number
  /** 膠囊前置：點、done 的 Check、interrupted 的 Square（§6.2） */
  lead: 'dot' | 'check' | 'square'
  pulse: boolean
  /** idle 的標記預設不畫，hover 才出 */
  hiddenByDefault: boolean
}

export const SUBSTATE_META: Record<Substate, SubstateMeta> = {
  waiting: { label: '等你', tone: 'danger', icon: Hand, marker: 'alert', paneStatus: 'blocked', order: 1, lead: 'dot', pulse: true, hiddenByDefault: false },
  error: { label: '錯誤', tone: 'danger', icon: CircleAlert, marker: 'alert', paneStatus: 'blocked', order: 2, lead: 'dot', pulse: false, hiddenByDefault: false },
  interrupted: { label: '中斷', tone: 'warn', icon: Square, marker: 'soft', paneStatus: 'idle', order: 3, lead: 'square', pulse: false, hiddenByDefault: false },
  running: { label: '執行', tone: 'ok', icon: Terminal, marker: 'line', paneStatus: 'working', order: 4, lead: 'dot', pulse: true, hiddenByDefault: false },
  writing: { label: '回覆中', tone: 'ok', icon: PencilLine, marker: 'line', paneStatus: 'working', order: 5, lead: 'dot', pulse: true, hiddenByDefault: false },
  thinking: { label: '思考中', tone: 'ok', icon: null, marker: 'bubble', paneStatus: 'working', order: 6, lead: 'dot', pulse: true, hiddenByDefault: false },
  done: { label: '完成', tone: 'ok', icon: Check, marker: 'soft', paneStatus: 'done', order: 7, lead: 'check', pulse: false, hiddenByDefault: false },
  idle: { label: '閒置', tone: 'idle', icon: Moon, marker: 'soft', paneStatus: 'idle', order: 8, lead: 'dot', pulse: false, hiddenByDefault: true },
}

export const SUBSTATE_ORDER = (Object.keys(SUBSTATE_META) as Substate[]).sort((a, b) => SUBSTATE_META[a].order - SUBSTATE_META[b].order)

/** Q3／Q7：done、interrupted 這麼久沒新事件就轉閒置 */
export const IDLE_AFTER_MS = 10 * 60_000
/** Q8：閒置滿這麼久算下班 */
export const OFF_DUTY_AFTER_MS = 2 * 60 * 60_000

const TOOL_MAX = 12

/** 膠囊文字：running 接工具名（≤ 12 字，超過截 11 字加 …） */
export function substateLabel(substate: Substate, tool?: string | null): string {
  const label = SUBSTATE_META[substate].label
  if (substate !== 'running' || !tool) return label
  return `${label} ${tool.length > TOOL_MAX ? `${tool.slice(0, TOOL_MAX - 1)}…` : tool}`
}

type Timing = Pick<SessionLive, 'substate' | 'substateSince' | 'turnStartedAt' | 'lastEventAt'>

/** 安靜多久的基準：最後事件，沒有就用進入該狀態的時間 */
const quietSince = (s: Timing) => s.lastEventAt ?? s.substateSince

/** 套 Q3／Q7：done、interrupted 滿 10 分鐘沒新事件視為 idle；等你、錯誤與進行中不轉 */
export function effectiveSubstate(s: Timing, now: number): Substate {
  if (s.substate !== 'done' && s.substate !== 'interrupted') return s.substate
  const since = quietSince(s)
  return since != null && now - since >= IDLE_AFTER_MS ? 'idle' : s.substate
}

/** 套 Q8：（有效）閒置滿 2 小時＝下班，不畫角色、只計數。沒有時間戳時不知道多久，不算下班 */
export function isOffDuty(s: Timing, now: number): boolean {
  if (effectiveSubstate(s, now) !== 'idle') return false
  const since = quietSince(s)
  return since != null && now - since >= OFF_DUTY_AFTER_MS
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function elapsed(from: number, now: number, long: boolean): string {
  const sec = Math.max(0, Math.floor((now - from) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h >= 1) return `${h} 時 ${pad2(m)} 分`
  return long ? `${m} 分 ${sec % 60} 秒` : `${pad2(m)}:${pad2(sec % 60)}`
}

function minutesAgo(from: number, now: number): number {
  return Math.max(0, Math.floor((now - from) / 60_000))
}

/**
 * 把「已經是有效細狀態」的時間轉成文字：等你「已等 mm:ss」、進行中「本輪 mm:ss」、完成／中斷／錯誤「N 分前」、
 * 閒置「閒置 N 分」；≥ 1 小時改「1 時 05 分」。long 給詳情窗的「已等 3 分 12 秒」。from 為 null 回空字串。
 * 不做 Q3／Q7 的轉閒置（那是 effectiveSubstate 的事）。
 */
export function formatTimer(substate: Substate, from: number | null | undefined, now: number, opts: { long?: boolean } = {}): string {
  if (from == null) return ''
  const long = !!opts.long
  switch (substate) {
    case 'waiting':
      return `已等 ${elapsed(from, now, long)}`
    case 'thinking':
    case 'running':
    case 'writing':
      return `本輪 ${elapsed(from, now, long)}`
    case 'idle': {
      const min = minutesAgo(from, now)
      return `閒置 ${min >= 60 ? elapsed(from, now, false) : `${min} 分`}`
    }
    default: {
      const min = minutesAgo(from, now)
      return min < 1 ? '剛剛' : `${min} 分前`
    }
  }
}

/** 各有效細狀態該拿哪個時間當基準 */
function timerFrom(s: Timing, sub: Substate): number | null {
  switch (sub) {
    case 'thinking':
    case 'running':
    case 'writing':
      return s.turnStartedAt ?? s.substateSince
    case 'idle':
      return quietSince(s)
    default:
      return s.substateSince ?? s.lastEventAt
  }
}

/** §1.2 計時文字：先套 effectiveSubstate，再依有效狀態挑基準時間。沒有可用時間戳回空字串 */
export function timerText(s: Timing, now: number, opts: { long?: boolean } = {}): string {
  const sub = effectiveSubstate(s, now)
  return formatTimer(sub, timerFrom(s, sub), now, opts)
}
