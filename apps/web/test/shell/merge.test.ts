import { describe, expect, it } from 'vitest'
import { mergePaneIntoOverview, mergePaneIntoPanes } from '@/store/merge'
import { overview, pane, project } from './builders'

describe('mergePaneIntoPanes', () => {
  it('同 paneId 取代，其他不動；找不到回原陣列', () => {
    const a = pane({ paneId: 'a', status: 'idle' })
    const b = pane({ paneId: 'b', status: 'idle' })
    const next = mergePaneIntoPanes([a, b], pane({ paneId: 'b', status: 'working' }))
    expect(next.map((p) => p.status)).toEqual(['idle', 'working'])
    expect(next[0]).toBe(a)
    const same = [a]
    expect(mergePaneIntoPanes(same, pane({ paneId: 'zz' }))).toBe(same)
  })
})

describe('mergePaneIntoOverview', () => {
  it('更新 panes 與 otherPanes 裡同 id 的 pane，保留 taskDir／member 對應', () => {
    const doc = overview({
      projects: [
        project({
          name: 'a',
          panes: [pane({ paneId: 'p1', status: 'idle', taskDir: 'd', member: 'm' })],
          otherPanes: [pane({ paneId: 'p2', status: 'idle' })],
        }),
        project({ name: 'b' }),
      ],
    })
    const next = mergePaneIntoOverview(doc, pane({ paneId: 'p1', status: 'blocked', cost: 2 }))
    expect(next.projects[0].panes[0]).toMatchObject({ status: 'blocked', cost: 2, taskDir: 'd', member: 'm' })
    expect(next.projects[1]).toBe(doc.projects[1])
    const next2 = mergePaneIntoOverview(next, pane({ paneId: 'p2', status: 'working' }))
    expect(next2.projects[0].otherPanes[0].status).toBe('working')
  })
  it('沒有任何 pane 對得上時回同一份 doc', () => {
    const doc = overview()
    expect(mergePaneIntoOverview(doc, pane({ paneId: 'nope' }))).toBe(doc)
  })
})
