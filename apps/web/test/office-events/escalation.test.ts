import { describe, expect, it } from 'vitest'
import { openBlocks, openEscalations } from '@/features/office/events/escalation'
import { detail, MIN, msg, NOW, ts } from './fixtures'

const BE = 'demo-backend'
const FE = 'demo-frontend'
const LEADER = 'leader-demo'

describe('openEscalations', () => {
  it('沒有後續 DECISION／ruling 的 ESCALATE 未解，at 為分鐘戳的 epoch', () => {
    const d = detail({ messages: [msg(BE, LEADER, 'ESCALATE', '要動 shared', NOW - 3 * MIN)] })
    expect(openEscalations(d)).toEqual([{ from: BE, at: NOW - 3 * MIN }])
  })

  it('之後 leader→X 的 DECISION 解除；給別人的 DECISION 不算', () => {
    const esc = msg(BE, LEADER, 'ESCALATE', 'x', NOW - 3 * MIN)
    expect(openEscalations(detail({ messages: [esc, msg(LEADER, FE, 'DECISION', 'y', NOW - MIN)] }))).toHaveLength(1)
    expect(openEscalations(detail({ messages: [esc, msg(LEADER, BE, 'DECISION', 'y', NOW - MIN)] }))).toEqual([])
  })

  it('DECISION 在 ESCALATE 之前不算解除', () => {
    const d = detail({ messages: [msg(LEADER, BE, 'DECISION', 'old', NOW - 5 * MIN), msg(BE, LEADER, 'ESCALATE', 'x', NOW - 3 * MIN)] })
    expect(openEscalations(d)).toHaveLength(1)
  })

  it('t 之後（含同一分鐘）任何一筆 ruling 解除；之前的 ruling 不算', () => {
    const esc = msg(BE, LEADER, 'ESCALATE', 'x', NOW - 3 * MIN)
    expect(openEscalations(detail({ messages: [esc], rulings: [{ ts: ts(NOW - 4 * MIN), text: 'r', autonomous: false }] }))).toHaveLength(1)
    expect(openEscalations(detail({ messages: [esc], rulings: [{ ts: ts(NOW - 3 * MIN), text: 'r', autonomous: false }] }))).toEqual([])
    expect(openEscalations(detail({ messages: [esc], rulings: [{ ts: ts(NOW - MIN), text: 'r', autonomous: true }] }))).toEqual([])
  })

  it('兩位各自 ESCALATE、只解一位；同一人多則只留最晚一則', () => {
    const d = detail({
      messages: [
        msg(BE, LEADER, 'ESCALATE', 'a', NOW - 6 * MIN),
        msg(FE, LEADER, 'ESCALATE', 'b', NOW - 5 * MIN),
        msg(BE, LEADER, 'ESCALATE', 'c', NOW - 4 * MIN),
        msg(LEADER, FE, 'DECISION', 'ok', NOW - 2 * MIN),
      ],
    })
    expect(openEscalations(d)).toEqual([{ from: BE, at: NOW - 4 * MIN }])
  })
})

describe('openBlocks', () => {
  it('BLOCKED 的 agent 取自文字（含 from dk-watch: 前綴與不含兩種寫法）', () => {
    const a = detail({ messages: [msg('dk-watch', LEADER, 'BLOCKED', `from dk-watch: ${BE} 卡在審批`, NOW - 2 * MIN)] })
    expect(openBlocks(a)).toEqual([{ agent: BE, at: NOW - 2 * MIN }])
    const b = detail({ messages: [msg('dk-watch', LEADER, 'BLOCKED', `${FE} 卡在審批`, NOW - 2 * MIN)] })
    expect(openBlocks(b)).toEqual([{ agent: FE, at: NOW - 2 * MIN }])
  })

  it('TIMEOUT 三種 agent 格式都認；wave 逾時解析不出 agent 不計入', () => {
    const d = detail({
      messages: [
        msg('dk-watch', LEADER, 'TIMEOUT', `from dk-watch: ${BE} 閒置 12 分鐘未交（state 不是這一輪的 done）`, NOW - 3 * MIN),
        msg('dk-watch', LEADER, 'TIMEOUT', `from dk-watch: ${FE} 逾時 (quota?)`, NOW - 3 * MIN),
        msg('dk-watch', LEADER, 'TIMEOUT', 'from dk-watch: wave 2 超過 90 分鐘未收尾', NOW - 3 * MIN),
      ],
    })
    expect(openBlocks(d).map((b) => b.agent).sort()).toEqual([BE, FE])
  })

  it('t 之後 A 送出 DONE／FIXED／ANSWER 即解除；別人的訊息或之前的 DONE 不算', () => {
    const blk = msg('dk-watch', LEADER, 'BLOCKED', `from dk-watch: ${BE} 卡在審批`, NOW - 3 * MIN)
    for (const type of ['DONE', 'FIXED', 'ANSWER']) {
      expect(openBlocks(detail({ messages: [blk, msg(BE, LEADER, type, 'x', NOW - MIN)] }))).toEqual([])
    }
    expect(openBlocks(detail({ messages: [blk, msg(FE, LEADER, 'DONE', 'x', NOW - MIN)] }))).toHaveLength(1)
    expect(openBlocks(detail({ messages: [blk, msg(BE, LEADER, 'QUESTION', 'x', NOW - MIN)] }))).toHaveLength(1)
    expect(openBlocks(detail({ messages: [msg(BE, LEADER, 'DONE', 'x', NOW - 5 * MIN), blk] }))).toHaveLength(1)
  })

  it('A 的 pane 已不在 detail.panes 即解除', () => {
    const d = detail({
      messages: [msg('dk-watch', LEADER, 'TIMEOUT', 'from dk-watch: demo-reviewer-a 逾時', NOW - 3 * MIN)],
    })
    expect(openBlocks(d)).toEqual([])
  })
})
