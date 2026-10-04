import { describe, expect, it } from 'vitest'
import { agentPanes, cycle, sortAgents, cyclePane, findPane, neighborPane, resolveSelection } from '@/features/herdr/model'
import { view } from './fixture'

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
