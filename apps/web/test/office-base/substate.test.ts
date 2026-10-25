// AC7：lib/substate.ts —— §1.2 對照表每一列、§1.2 計時文字、Q3／Q7 10 分轉閒置、Q8 2 小時下班（邊界）
import { describe, expect, it } from 'vitest'
import { CircleAlert, Hand, Moon, PencilLine, Square, Terminal, Check } from 'lucide-react'
import { SUBSTATES, type Substate } from '@dash/shared'
import {
  IDLE_AFTER_MS,
  OFF_DUTY_AFTER_MS,
  SUBSTATE_META,
  SUBSTATE_ORDER,
  effectiveSubstate,
  formatTimer,
  isOffDuty,
  substateLabel,
  timerText,
} from '@/lib/substate'

const NOW = 1_800_000_000_000
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const live = (over: Partial<Parameters<typeof timerText>[0]> = {}) => ({
  substate: 'idle' as Substate,
  substateSince: null as number | null,
  turnStartedAt: null as number | null,
  lastEventAt: null as number | null,
  ...over,
})

describe('SUBSTATE_META（§1.2 對照表，每列）', () => {
  // [key, 中文, tone, 圖示, 標記型, 粗狀態, 排序]
  const ROWS = [
    ['waiting', '等你', 'danger', Hand, 'alert', 'blocked', 1],
    ['error', '錯誤', 'danger', CircleAlert, 'alert', 'blocked', 2],
    ['interrupted', '中斷', 'warn', Square, 'soft', 'idle', 3],
    ['running', '執行', 'ok', Terminal, 'line', 'working', 4],
    ['writing', '回覆中', 'ok', PencilLine, 'line', 'working', 5],
    ['thinking', '思考中', 'ok', null, 'bubble', 'working', 6],
    ['done', '完成', 'ok', Check, 'soft', 'done', 7],
    ['idle', '閒置', 'idle', Moon, 'soft', 'idle', 8],
  ] as const

  it('涵蓋 SUBSTATES 全部 8 個且不多', () => {
    expect(Object.keys(SUBSTATE_META).sort()).toEqual([...SUBSTATES].sort())
  })

  it.each(ROWS)('%s：中文「%s」、tone %s、標記 %s、粗狀態 %s、排序 %i', (key, label, tone, icon, marker, pane, order) => {
    const m = SUBSTATE_META[key]
    expect(m.label).toBe(label)
    expect(m.tone).toBe(tone)
    expect(m.icon).toBe(icon)
    expect(m.marker).toBe(marker)
    expect(m.paneStatus).toBe(pane)
    expect(m.order).toBe(order)
  })

  it('idle 標記預設隱藏，其他不隱藏', () => {
    expect(SUBSTATE_META.idle.hiddenByDefault).toBe(true)
    for (const s of SUBSTATES.filter((k) => k !== 'idle')) expect(SUBSTATE_META[s].hiddenByDefault).toBe(false)
  })

  it('waiting／running／writing／thinking 的點脈動，其他不脈動（§6.2）', () => {
    for (const s of SUBSTATES) expect(SUBSTATE_META[s].pulse).toBe(['waiting', 'running', 'writing', 'thinking'].includes(s))
  })

  it('膠囊前置：done 換 Check、interrupted 換 Square、其餘是點', () => {
    expect(SUBSTATE_META.done.lead).toBe('check')
    expect(SUBSTATE_META.interrupted.lead).toBe('square')
    for (const s of SUBSTATES.filter((k) => k !== 'done' && k !== 'interrupted')) expect(SUBSTATE_META[s].lead).toBe('dot')
  })

  it('SUBSTATE_ORDER 依 order 由小到大、涵蓋全部', () => {
    expect(SUBSTATE_ORDER).toEqual(['waiting', 'error', 'interrupted', 'running', 'writing', 'thinking', 'done', 'idle'])
  })
})

describe('substateLabel', () => {
  it('沒有 tool 時就是對照表中文', () => {
    expect(substateLabel('waiting')).toBe('等你')
    expect(substateLabel('thinking')).toBe('思考中')
  })
  it('running 帶工具名：「執行 Bash」', () => {
    expect(substateLabel('running', 'Bash')).toBe('執行 Bash')
  })
  it('running 沒給工具名：只有「執行」', () => {
    expect(substateLabel('running')).toBe('執行')
    expect(substateLabel('running', null)).toBe('執行')
  })
  it('工具名 ≤ 12 字，超過截成 11 字加 …', () => {
    expect(substateLabel('running', 'a'.repeat(12))).toBe(`執行 ${'a'.repeat(12)}`)
    expect(substateLabel('running', 'a'.repeat(13))).toBe(`執行 ${'a'.repeat(11)}…`)
  })
  it('非 running 忽略 tool', () => {
    expect(substateLabel('writing', 'Bash')).toBe('回覆中')
  })
})

describe('effectiveSubstate（Q3／Q7：done、interrupted 10 分無新事件轉閒置）', () => {
  it('常數', () => {
    expect(IDLE_AFTER_MS).toBe(10 * MIN)
    expect(OFF_DUTY_AFTER_MS).toBe(2 * HOUR)
  })

  it.each(['done', 'interrupted'] as const)('%s：9:59 還是 %s，10:00 起轉 idle', (sub) => {
    const t = NOW - 10 * MIN
    expect(effectiveSubstate(live({ substate: sub, lastEventAt: t + 1 }), NOW)).toBe(sub)
    expect(effectiveSubstate(live({ substate: sub, lastEventAt: t }), NOW)).toBe('idle')
    expect(effectiveSubstate(live({ substate: sub, lastEventAt: t - 1 }), NOW)).toBe('idle')
  })

  it('有新事件（lastEventAt 較新）就續算，不看 substateSince', () => {
    expect(effectiveSubstate(live({ substate: 'done', substateSince: NOW - 30 * MIN, lastEventAt: NOW - MIN }), NOW)).toBe('done')
  })

  it('沒有 lastEventAt 時退回 substateSince', () => {
    expect(effectiveSubstate(live({ substate: 'done', substateSince: NOW - 11 * MIN }), NOW)).toBe('idle')
    expect(effectiveSubstate(live({ substate: 'done', substateSince: NOW - 9 * MIN }), NOW)).toBe('done')
  })

  it('兩個時間都沒有：不轉（沒有依據）', () => {
    expect(effectiveSubstate(live({ substate: 'done' }), NOW)).toBe('done')
  })

  it.each(['waiting', 'error', 'running', 'writing', 'thinking'] as const)('%s 再久也不轉閒置（等你、錯誤永遠留在座位）', (sub) => {
    expect(effectiveSubstate(live({ substate: sub, lastEventAt: NOW - 5 * HOUR, substateSince: NOW - 5 * HOUR }), NOW)).toBe(sub)
  })

  it('idle 還是 idle', () => {
    expect(effectiveSubstate(live({ substate: 'idle', lastEventAt: NOW }), NOW)).toBe('idle')
  })
})

describe('isOffDuty（Q8：閒置滿 2 小時下班）', () => {
  it('idle：1:59:59 在班，2:00:00 起下班', () => {
    expect(isOffDuty(live({ substate: 'idle', lastEventAt: NOW - 2 * HOUR + 1 }), NOW)).toBe(false)
    expect(isOffDuty(live({ substate: 'idle', lastEventAt: NOW - 2 * HOUR }), NOW)).toBe(true)
  })

  it('done 10 分轉閒置後，從最後事件算滿 2 小時才下班', () => {
    expect(isOffDuty(live({ substate: 'done', lastEventAt: NOW - 11 * MIN }), NOW)).toBe(false)
    expect(isOffDuty(live({ substate: 'done', lastEventAt: NOW - 2 * HOUR }), NOW)).toBe(true)
    expect(isOffDuty(live({ substate: 'interrupted', lastEventAt: NOW - 3 * HOUR }), NOW)).toBe(true)
  })

  it.each(['waiting', 'error', 'running', 'writing', 'thinking'] as const)('%s 永遠不下班', (sub) => {
    expect(isOffDuty(live({ substate: sub, lastEventAt: NOW - 9 * HOUR }), NOW)).toBe(false)
  })

  it('idle 但沒有任何時間戳：不下班（不知道多久）', () => {
    expect(isOffDuty(live({ substate: 'idle' }), NOW)).toBe(false)
  })

  it('idle 沒有 lastEventAt 時退回 substateSince', () => {
    expect(isOffDuty(live({ substate: 'idle', substateSince: NOW - 3 * HOUR }), NOW)).toBe(true)
  })
})

describe('timerText（§1.2 計時）', () => {
  it('waiting：「已等 mm:ss」從 substateSince', () => {
    expect(timerText(live({ substate: 'waiting', substateSince: NOW - (3 * MIN + 12 * SEC) }), NOW)).toBe('已等 03:12')
  })

  it('waiting long：「已等 3 分 12 秒」', () => {
    expect(timerText(live({ substate: 'waiting', substateSince: NOW - (3 * MIN + 12 * SEC) }), NOW, { long: true })).toBe('已等 3 分 12 秒')
  })

  it.each(['thinking', 'running', 'writing'] as const)('%s：「本輪 mm:ss」從 turnStartedAt', (sub) => {
    expect(timerText(live({ substate: sub, turnStartedAt: NOW - (4 * MIN + 5 * SEC), substateSince: NOW - SEC }), NOW)).toBe('本輪 04:05')
  })

  it('進行中沒有 turnStartedAt：退回 substateSince', () => {
    expect(timerText(live({ substate: 'running', substateSince: NOW - 90 * SEC }), NOW)).toBe('本輪 01:30')
  })

  it('≥ 1 小時改「1 時 05 分」', () => {
    expect(timerText(live({ substate: 'thinking', turnStartedAt: NOW - (HOUR + 5 * MIN + 30 * SEC) }), NOW)).toBe('本輪 1 時 05 分')
    expect(timerText(live({ substate: 'waiting', substateSince: NOW - HOUR }), NOW)).toBe('已等 1 時 00 分')
  })

  it('59:59 還是 mm:ss', () => {
    expect(timerText(live({ substate: 'waiting', substateSince: NOW - (59 * MIN + 59 * SEC) }), NOW)).toBe('已等 59:59')
  })

  it.each(['done', 'interrupted', 'error'] as const)('%s：「N 分前」從 substateSince', (sub) => {
    expect(timerText(live({ substate: sub, substateSince: NOW - 3 * MIN - 20 * SEC, lastEventAt: NOW - 3 * MIN }), NOW)).toBe('3 分前')
  })

  it('done 未滿 1 分：「剛剛」', () => {
    expect(timerText(live({ substate: 'done', substateSince: NOW - 59 * SEC, lastEventAt: NOW - 59 * SEC }), NOW)).toBe('剛剛')
  })

  it('idle：「閒置 N 分」', () => {
    expect(timerText(live({ substate: 'idle', lastEventAt: NOW - 25 * MIN }), NOW)).toBe('閒置 25 分')
  })

  it('idle ≥ 1 小時：「閒置 1 時 05 分」', () => {
    expect(timerText(live({ substate: 'idle', lastEventAt: NOW - (HOUR + 5 * MIN) }), NOW)).toBe('閒置 1 時 05 分')
  })

  it('done 滿 10 分轉閒置後，用閒置的文字與基準（最後事件）', () => {
    expect(timerText(live({ substate: 'done', substateSince: NOW - 20 * MIN, lastEventAt: NOW - 15 * MIN }), NOW)).toBe('閒置 15 分')
  })

  it('沒有可用時間戳：空字串', () => {
    expect(timerText(live({ substate: 'waiting' }), NOW)).toBe('')
    expect(timerText(live({ substate: 'idle' }), NOW)).toBe('')
  })

  it('時間戳在未來（時鐘偏移）：當 0', () => {
    expect(timerText(live({ substate: 'waiting', substateSince: NOW + 5 * SEC }), NOW)).toBe('已等 00:00')
  })
})

describe('formatTimer（給已經是有效細狀態的元件用，不做轉閒置）', () => {
  it('done 即使超過 10 分鐘也維持「N 分前」，不被轉成閒置', () => {
    expect(formatTimer('done', NOW - 25 * MIN, NOW)).toBe('25 分前')
  })
  it('各狀態的文字格式同 timerText', () => {
    expect(formatTimer('waiting', NOW - 65 * SEC, NOW)).toBe('已等 01:05')
    expect(formatTimer('thinking', NOW - 5 * SEC, NOW)).toBe('本輪 00:05')
    expect(formatTimer('idle', NOW - 7 * MIN, NOW)).toBe('閒置 7 分')
    expect(formatTimer('error', NOW - 2 * MIN, NOW)).toBe('2 分前')
  })
  it('沒有基準時間：空字串', () => {
    expect(formatTimer('waiting', null, NOW)).toBe('')
    expect(formatTimer('waiting', undefined, NOW)).toBe('')
  })
})
