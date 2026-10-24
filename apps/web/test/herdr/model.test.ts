import { describe, expect, it } from 'vitest'
import type { Substate } from '@dash/shared'
import { agentGroup, agentPanes, cycle, groupAgents, paneSubstate, sortAgents, cyclePane, findPane, neighborPane, resolveSelection, tabTone } from '@/features/herdr/model'
import { sessionLive } from '../shell/builders'
import { view, vpane, withSessions } from './fixture'

const split = view.workspaces[1].tabs[1]

describe('resolveSelection', () => {
  it('沒選擇時跟 herdr 的 focus', () => {
    const r = resolveSelection(view, {})
    expect([r.workspace?.id, r.tab?.id, r.pane?.paneId]).toEqual(['wB', 'wB:t2', 'wB:p3'])
  })

  it('選了 workspace：用記住的 tab，否則 active tab；pane 用 tab 的 focus', () => {
    expect(resolveSelection(view, { workspaceId: 'wA' }).pane?.paneId).toBe('wA:p1')
    expect(resolveSelection(view, { workspaceId: 'wB' }, { wB: 'wB:t1' }).tab?.id).toBe('wB:t1')
  })

  it('過期的選擇退回預設', () => {
    const r = resolveSelection(view, { workspaceId: 'wB', tabId: 'gone', paneId: 'gone' })
    expect([r.tab?.id, r.pane?.paneId]).toEqual(['wB:t2', 'wB:p3'])
    expect(resolveSelection(null, {})).toEqual({ workspace: null, tab: null, pane: null })
  })
})

describe('pane 導覽', () => {
  it('依 rect 找方向鄰居', () => {
    expect(neighborPane(split, 'wB:p2', 'right')).toBe('wB:p3')
    expect(neighborPane(split, 'wB:p3', 'down')).toBe('wB:p4')
    expect(neighborPane(split, 'wB:p4', 'up')).toBe('wB:p3')
    expect(neighborPane(split, 'wB:p4', 'left')).toBe('wB:p2')
    expect(neighborPane(split, 'wB:p2', 'left')).toBeNull()
  })

  it('Tab 依上到下、左到右循環', () => {
    expect(cyclePane(split, 'wB:p2', 1)).toBe('wB:p3')
    expect(cyclePane(split, 'wB:p4', 1)).toBe('wB:p2')
    expect(cyclePane(split, 'wB:p2', -1)).toBe('wB:p4')
  })

  it('cycle 繞回頭尾', () => {
    expect(cycle(view.workspaces, 'wB', 1)?.id).toBe('wA')
    expect(cycle(view.workspaces, 'wA', -1)?.id).toBe('wB')
  })

  it('agents 只列有 agent 的 pane；findPane 找回所在位置', () => {
    expect(agentPanes(view).map((a) => a.pane.paneId)).toEqual(['wA:p1', 'wB:p2', 'wB:p3', 'wB:p4'])
    expect(findPane(view, 'wB:p4')?.tab.id).toBe('wB:t2')
  })
})

describe('sortAgents', () => {
  it('agents 依 blocked → working → idle → 其他排序，同狀態依名稱', () => {
    expect(sortAgents(agentPanes(view)).map((a) => a.pane.paneId)).toEqual(['wB:p3', 'wB:p2', 'wA:p1', 'wB:p4'])
  })
})

// AC12：herdr 頁 agents 分組（§6.13）。細狀態只讀 pane.session，經 effectiveSubstate
const NOW = 1_800_000_000_000
const live = (substate: Substate, over: Parameters<typeof sessionLive>[0] = {}) =>
  sessionLive({ substate, substateSince: NOW - 5_000, lastEventAt: NOW - 1_000, ...over })

describe('paneSubstate／agentGroup', () => {
  it('沒有 session（undefined 或 null）回 null；有 session 經 effectiveSubstate', () => {
    expect(paneSubstate(vpane('w:p', [0, 0, 1, 1]), NOW)).toBeNull()
    expect(paneSubstate(vpane('w:p', [0, 0, 1, 1], 'idle', { session: null }), NOW)).toBeNull()
    expect(paneSubstate(vpane('w:p', [0, 0, 1, 1], 'idle', { session: live('running') }), NOW)).toBe('running')
    const stale = live('done', { substateSince: NOW - 11 * 60_000, lastEventAt: NOW - 11 * 60_000 })
    expect(paneSubstate(vpane('w:p', [0, 0, 1, 1], 'idle', { session: stale }), NOW)).toBe('idle')
  })

  it.each([
    ['waiting', 'needs'],
    ['error', 'needs'],
    ['running', 'working'],
    ['writing', 'working'],
    ['thinking', 'working'],
    ['interrupted', 'other'],
    ['done', 'other'],
    ['idle', 'other'],
  ] as const)('細狀態 %s → %s 組', (sub, group) => {
    expect(agentGroup(vpane('w:p', [0, 0, 1, 1], 'idle', { session: live(sub) }), NOW)).toBe(group)
  })

  it('套 Q3：done 滿 10 分鐘沒新事件算閒置 → 其他組', () => {
    const stale = live('interrupted', { substateSince: NOW - 11 * 60_000, lastEventAt: NOW - 11 * 60_000 })
    expect(agentGroup(vpane('w:p', [0, 0, 1, 1], 'working', { session: stale }), NOW)).toBe('other')
  })

  it('沒有 session 退回 herdr 粗狀態：blocked → 需要你、working → 工作中、其他 → 其他', () => {
    const g = (status: 'blocked' | 'working' | 'idle' | 'done') => agentGroup(vpane('w:p', [0, 0, 1, 1], status), NOW)
    expect([g('blocked'), g('working'), g('idle'), g('done')]).toEqual(['needs', 'working', 'other', 'other'])
  })
})

describe('groupAgents', () => {
  const v = withSessions(view, {
    'wA:p1': live('done'),
    'wB:p2': live('thinking'),
    'wB:p3': live('error', { error: 'x' }),
    'wB:p4': live('waiting'),
  })

  it('三組依序、組內依 §1.2 細狀態排序（等你 → 錯誤）', () => {
    const groups = groupAgents(agentPanes(v), NOW)
    expect(groups.map((g) => g.group)).toEqual(['needs', 'working', 'other'])
    expect(groups[0].items.map((a) => a.pane.paneId)).toEqual(['wB:p4', 'wB:p3'])
    expect(groups[1].items.map((a) => a.pane.paneId)).toEqual(['wB:p2'])
    expect(groups[2].items.map((a) => a.pane.paneId)).toEqual(['wA:p1'])
  })

  it('0 個的組不出現', () => {
    const only = withSessions(view, { 'wA:p1': live('running'), 'wB:p2': live('writing'), 'wB:p3': live('thinking'), 'wB:p4': live('running') })
    expect(groupAgents(agentPanes(only), NOW).map((g) => g.group)).toEqual(['working'])
  })

  it('同細狀態依名字；sortAgents 也吃 now 並依細狀態', () => {
    const same = withSessions(view, { 'wA:p1': live('running'), 'wB:p2': live('running'), 'wB:p3': live('running'), 'wB:p4': live('running') })
    const names = groupAgents(agentPanes(same), NOW)[0].items.map((a) => a.pane.name ?? a.pane.agent)
    expect(names).toEqual([...names].sort((a, b) => String(a).localeCompare(String(b))))
    expect(sortAgents(agentPanes(v), NOW).map((a) => a.pane.paneId)).toEqual(['wB:p4', 'wB:p3', 'wB:p2', 'wA:p1'])
  })
})

describe('tabTone', () => {
  const tab = (panes: ReturnType<typeof vpane>[]) => ({ ...split, panes })
  it('tab 內最嚴重的細狀態 tone：等你 > 思考中 > 閒置', () => {
    const t = tab([
      vpane('w:a', [0, 0, 1, 1], 'idle', { session: live('idle', { substateSince: NOW - 5_000 }) }),
      vpane('w:b', [0, 0, 1, 1], 'working', { session: live('thinking') }),
      vpane('w:c', [0, 0, 1, 1], 'blocked', { session: live('waiting') }),
    ])
    expect(tabTone(t, NOW)).toBe('danger')
    expect(tabTone(tab(t.panes.slice(0, 2)), NOW)).toBe('ok')
    expect(tabTone(tab(t.panes.slice(0, 1)), NOW)).toBe('idle')
  })

  it('沒有任何 session 資料：沿用 tab 的 herdr 粗狀態 tone', () => {
    expect(tabTone({ ...split, status: 'blocked' }, NOW)).toBe('danger')
    expect(tabTone({ ...split, status: 'working', panes: [vpane('w:a', [0, 0, 1, 1], 'working')] }, NOW)).toBe('ok')
  })
})
