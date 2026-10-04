import { describe, expect, it } from 'vitest'
import { isIdleProject, lastClosedAt, projectSeverity, splitProjects } from '@/features/overview/classify'
import { detail, listFixture, pane, project, summary } from '../shell/builders'

const list = (tasks: ReturnType<typeof summary>[]) => ({ ...listFixture, tasks })
const member = (name: string, status: string) => ({
  name, status, wave: 1, current: null, touched: [], todo: [], blocked_by: null, notes: null, has_report: false,
})
const counts = (over: Partial<ReturnType<typeof summary>['counts']> = {}) => ({
  rulings: 0, autonomous_rulings: 0, minors: 0, undelivered: 0, escalations: 0, ...over,
})

/** 一個 running 任務的專案；members 與 counts 可調 */
function running(name: string, opts: { members?: ReturnType<typeof member>[]; esc?: number; und?: number } = {}) {
  const t = summary({ dir: `d-${name}`, short: name, status: 'running', counts: counts({ escalations: opts.esc ?? 0, undelivered: opts.und ?? 0 }) })
  return project({ name, list: list([t]), active: { [t.dir]: detail({ ...t, members: opts.members ?? [] }) } })
}
const idle = (name: string) => project({ name, list: list([summary({ dir: `d-${name}`, status: 'done' })]) })

describe('isIdleProject（Q10）', () => {
  it('沒有 running／planning、沒有 blocked、沒有錯誤或過時才算閒置', () => {
    expect(isIdleProject(idle('a'))).toBe(true)
    expect(isIdleProject(running('b'))).toBe(false)
    expect(isIdleProject(project({ list: list([summary({ status: 'planning' })]) }))).toBe(false)
  })
  it('有 blocked pane（含其他 session）不算閒置', () => {
    expect(isIdleProject({ ...idle('a'), otherPanes: [pane({ status: 'blocked' })] })).toBe(false)
    expect(isIdleProject({ ...idle('a'), panes: [pane({ status: 'blocked' })] })).toBe(false)
    expect(isIdleProject({ ...idle('a'), otherPanes: [pane({ status: 'working' })] })).toBe(true)
  })
  it('有錯誤或過時不算閒置（錯誤不得被收起來）', () => {
    expect(isIdleProject({ ...idle('a'), error: { kind: 'exit', message: 'boom' } })).toBe(false)
    expect(isIdleProject({ ...idle('a'), stale: true })).toBe(false)
    expect(isIdleProject(project({ list: null, error: null }))).toBe(true)
  })
})

describe('projectSeverity', () => {
  it('有 blocked（成員 state、herdr pane、其他 session）→ danger', () => {
    expect(projectSeverity(running('a', { members: [member('qa', 'blocked')] }))).toBe('danger')
    expect(projectSeverity({ ...idle('a'), otherPanes: [pane({ status: 'blocked' })] })).toBe('danger')
  })
  it('只有 ESCALATE／UNDELIVERED → warn；blocked 優先', () => {
    expect(projectSeverity(running('a', { esc: 1 }))).toBe('warn')
    expect(projectSeverity(running('a', { und: 2 }))).toBe('warn')
    expect(projectSeverity(running('a', { esc: 1, members: [member('qa', 'blocked')] }))).toBe('danger')
  })
  it('有錯誤（project.error）→ danger（裁定）', () => {
    expect(projectSeverity({ ...idle('a'), error: { kind: 'exit', message: 'boom' } })).toBe('danger')
    expect(projectSeverity({ ...running('a', { esc: 1 }), error: { kind: 'timeout', message: 'timeout' } })).toBe('danger')
  })
  it('已結案任務的計數不算；沒事為 null', () => {
    const p = project({ list: list([summary({ status: 'done', counts: counts({ escalations: 3 }) })]) })
    expect(projectSeverity(p)).toBeNull()
    expect(projectSeverity(running('a'))).toBeNull()
  })
})

describe('splitProjects', () => {
  it('活躍依 danger（含錯誤）> warn > 活躍 > 其他（過時）排序（同級保持原順序），閒置另一組', () => {
    const errored = { ...idle('err'), error: { kind: 'exit' as const, message: 'x' } }
    const stale = { ...idle('old'), stale: true }
    const ps = [idle('i1'), stale, errored, running('plain'), running('w', { esc: 1 }), idle('i2'), running('d', { members: [member('x', 'blocked')] }), running('plain2')]
    const { active, idle: idles } = splitProjects(ps)
    expect(active.map((p) => p.name)).toEqual(['err', 'd', 'w', 'plain', 'plain2', 'old'])
    expect(idles.map((p) => p.name)).toEqual(['i1', 'i2'])
  })
})

describe('lastClosedAt', () => {
  it('取已結案任務最晚的 closed_at；沒有就 null', () => {
    const p = project({
      list: list([
        summary({ dir: 'a', status: 'done', closed_at: '2026-09-25T13:45' }),
        summary({ dir: 'b', status: 'abandoned', closed_at: '2026-10-03T10:39' }),
        summary({ dir: 'c', status: 'running', closed_at: null }),
      ]),
    })
    expect(lastClosedAt(p)).toBe('2026-10-03T10:39')
    expect(lastClosedAt(project({ list: null }))).toBeNull()
  })
})
