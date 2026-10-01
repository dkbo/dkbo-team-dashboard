import { describe, expect, it } from 'vitest'
import { findMemberPane } from '@/lib/member-pane'

const task = { dir: '2026-09-25-x', short: 'x' }
const live = (paneId: string, member: string | null = null, taskDir: string | null = null) => ({ paneId, member, taskDir })

describe('findMemberPane', () => {
  it('有 id 且在 live：用 id 對到的 pane', () => {
    const panes = [{ agent: 'x-fe', pane: 'P1' }]
    const r = findMemberPane(task, panes, 'fe', [live('P1'), live('P2', 'fe', task.dir)])
    expect(r).toEqual({ recordedId: 'P1', pane: live('P1') })
  })
  it('有 id 但不在 live：退回 taskDir＋member 命中', () => {
    const panes = [{ agent: 'x-fe', pane: 'P-dead' }]
    const r = findMemberPane(task, panes, 'fe', [live('P2', 'fe', task.dir)])
    expect(r).toEqual({ recordedId: 'P-dead', pane: live('P2', 'fe', task.dir) })
  })
  it('沒有 id：退回 taskDir＋member 命中', () => {
    const r = findMemberPane(task, [{ agent: 'x-fe', pane: null }], 'fe', [live('P3', 'fe', task.dir)])
    expect(r).toEqual({ recordedId: null, pane: live('P3', 'fe', task.dir) })
  })
  it('都找不到：pane 為 null', () => {
    const r = findMemberPane(task, [{ agent: 'x-fe', pane: 'P-dead' }], 'fe', [live('P4', 'fe', 'other'), live('P5', 'qa', task.dir)])
    expect(r).toEqual({ recordedId: 'P-dead', pane: null })
  })
})
