import { describe, expect, it } from 'vitest'
import {
  filterMessages,
  matchMemberPanes,
  messageTypes,
  minutesBetween,
  skippedTotal,
  waveSteps,
} from '@/features/task/model'

describe('minutesBetween', () => {
  it('本地時間戳相減成分鐘；任一端 null 給 null', () => {
    expect(minutesBetween('2026-09-24T08:44', '2026-09-24T09:48')).toBe(64)
    expect(minutesBetween('2026-09-24T23:50', '2026-09-25T00:10')).toBe(20)
    expect(minutesBetween(null, '2026-09-24T09:48')).toBeNull()
  })
})

describe('waveSteps', () => {
  const wave = {
    wave: 1,
    opened_at: '2026-09-24T08:44',
    dev_done_at: '2026-09-24T09:48',
    review_spawned_at: '2026-09-24T09:48',
    review_verdict_at: '2026-09-24T09:54',
    review_verdict: 'a: ok',
    closed_at: '2026-09-24T09:57',
    tests: 'ok (tests/run.sh)',
    tests_ok: true,
    commits: [{ repo: null, sha: 'b169571' }],
  }
  it('五段依序，每段帶距上一段分鐘數', () => {
    const s = waveSteps(wave)
    expect(s.map((x) => x.label)).toEqual(['開波', 'dev 完成', '送審', '裁定', '關閉'])
    expect(s.map((x) => x.ts)).toEqual([
      '2026-09-24T08:44',
      '2026-09-24T09:48',
      '2026-09-24T09:48',
      '2026-09-24T09:54',
      '2026-09-24T09:57',
    ])
    expect(s.map((x) => x.sincePrev)).toEqual([null, 64, 0, 6, 3])
  })
  it('缺的段 ts 為 null，下一段從最近一個有值的段算', () => {
    const s = waveSteps({ ...wave, review_spawned_at: null, review_verdict_at: null })
    expect(s[2].ts).toBeNull()
    expect(s[4].sincePrev).toBe(9)
  })
})

describe('skippedTotal', () => {
  it('process＋messages', () => {
    expect(skippedTotal({ process: 2, messages: 3 })).toBe(5)
    expect(skippedTotal({ process: 0, messages: 0 })).toBe(0)
  })
})

describe('messages 篩選', () => {
  const msgs = [
    { ts: 't1', from: 'a', to: 'b', type: 'DONE', text: 'x' },
    { ts: 't2', from: 'b', to: null, type: 'ACK', text: '' },
    { ts: 't3', from: 'a', to: 'b', type: 'BUG', text: 'y' },
    { ts: 't4', from: 'a', to: 'b', type: 'DONE', text: 'z' },
  ]
  it('類型清單去重、依出現次數多到少再依字母', () => {
    expect(messageTypes(msgs)).toEqual([
      { type: 'DONE', count: 2 },
      { type: 'ACK', count: 1 },
      { type: 'BUG', count: 1 },
    ])
  })
  it('依 type 篩；空或 all 不篩', () => {
    expect(filterMessages(msgs, 'DONE').map((m) => m.ts)).toEqual(['t1', 't4'])
    expect(filterMessages(msgs, 'all').length).toBe(4)
    expect(filterMessages(msgs, '').length).toBe(4)
  })
})

describe('matchMemberPanes', () => {
  const live = (paneId: string, extra: Record<string, unknown> = {}) => ({
    paneId,
    status: 'working',
    member: null,
    taskDir: null,
    ...extra,
  })
  it('以 detail.panes 的 agent ＝ <短名>-<成員> 對到 pane，再對到 herdr pane', () => {
    const m = matchMemberPanes(
      {
        dir: '2026-09-25-dashv1',
        short: 'dashv1',
        members: [{ name: 'backend' }, { name: 'qa' }, { name: 'it' }],
        panes: [
          { agent: 'dashv1-backend', pane: 'p1' },
          { agent: 'dashv1-qa', pane: 'p9' },
        ],
      },
      [live('p1'), live('p2', { member: 'it', taskDir: '2026-09-25-dashv1' })],
    )
    expect(m.backend?.paneId).toBe('p1')
    // detail 有 pane id 但 herdr 沒有 → 沒有即時資料
    expect(m.qa).toBeNull()
    // 後備：server 已標好 member/taskDir 的 pane
    expect(m.it?.paneId).toBe('p2')
  })
  it('detail 有 pane id 但不在 herdr 時退回 member／taskDir 命中（與總覽同語意）', () => {
    const m = matchMemberPanes(
      {
        dir: '2026-09-25-dashv1',
        short: 'dashv1',
        members: [{ name: 'qa' }],
        panes: [{ agent: 'dashv1-qa', pane: 'p-dead' }],
      },
      [live('p3', { member: 'qa', taskDir: '2026-09-25-dashv1' })],
    )
    expect(m.qa?.paneId).toBe('p3')
  })
})
