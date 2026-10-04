import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ProjectCard } from '@/features/overview/ProjectCard'
import { formatMinutes, parseLocalTs } from '@/lib/format'
import type { ProjectView } from '@dash/shared'
import { detail, listFixture, pane, project, summary } from './builders'

const NOW = parseLocalTs('2026-09-25T10:30')!.getTime()

function renderCard(p: ProjectView) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <ProjectCard project={p} now={NOW} />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

const member = (name: string, status: string) => ({
  name, status, wave: 2, current: `${name} 在做事`, touched: [], todo: [], blocked_by: null, notes: null, has_report: false,
})

function activeProject(over: Partial<ProjectView> = {}): ProjectView {
  const t = summary({ dir: '2026-09-25-x', short: 'x', display: '做 X', status: 'running', current_wave: 2, waves_closed: 1, waves_planned: 4 })
  const d = detail({
    ...t,
    members: [member('backend', 'working'), member('qa', 'working')],
    panes: [{ agent: 'x-backend', pane: 'P1', since_epoch: null, group: 'dev', tab: null, slot: null }],
    waves: [{ wave: 2, opened_at: '2026-09-25T10:00', dev_done_at: null, review_spawned_at: null, review_verdict_at: null, review_verdict: null, closed_at: null, tests: null, tests_ok: null, commits: [] }],
    skipped_lines: { process: 2, messages: 1 },
  })
  const list = { ...listFixture, tasks: [...listFixture.tasks, t] }
  return project({
    list,
    active: { [t.dir]: d },
    panes: [pane({ paneId: 'P1', status: 'working', model: 'opus', effort: 'high', cost: 1.5, ctxPct: 33, taskDir: t.dir, member: 'backend' })],
    otherPanes: [pane({ paneId: 'L1', name: null, agent: 'claude', status: 'idle' })],
    ...over,
  })
}

describe('ProjectCard', () => {
  it('進行中任務：顯示名、狀態膠囊、波進度、「波 N 進行中 · 已 M 分」、無法解析行數；計數 0 不顯示', () => {
    renderCard(activeProject())
    const row = screen.getByTestId('task-2026-09-25-x')
    expect(within(row).getByRole('link', { name: '做 X' })).toHaveAttribute('href', '/p/teamflow/t/2026-09-25-x')
    expect(within(row).getByText('進行中').closest('[data-slot="status-pill"]')).toHaveAttribute('data-color', 'ok')
    expect(within(row).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(within(row).getByRole('progressbar')).toHaveAttribute('aria-valuemax', '4')
    expect(within(row).getByText('1/4 波')).toBeInTheDocument()
    expect(within(row).getByText('波 2 進行中 · 已 30 分')).toBeInTheDocument()
    expect(within(row).getByText('3 行無法解析')).toBeInTheDocument()
    expect(within(row).queryByText(/ESCALATE/)).toBeNull()
    expect(within(row).queryByText(/UNDELIVERED/)).toBeNull()
  })

  it('計數 > 0 顯示成 warn Tag，任務列底 warn-soft；有 blocked 成員列底 danger-soft、膠囊 danger', () => {
    const p = activeProject()
    const t = p.list!.tasks.at(-1)!
    const esc = { ...t, counts: { ...t.counts, escalations: 2, undelivered: 1 } }
    const { unmount } = renderCard({ ...p, list: { ...p.list!, tasks: [...p.list!.tasks.slice(0, -1), esc] } })
    const row = screen.getByTestId('task-2026-09-25-x')
    expect(within(row).getByText('ESCALATE 2')).toHaveAttribute('data-variant', 'warn')
    expect(within(row).getByText('UNDELIVERED 1')).toHaveAttribute('data-variant', 'warn')
    expect(row).toHaveClass('bg-status-warn-soft')
    unmount()
    const d = p.active['2026-09-25-x']
    renderCard({ ...p, active: { [d.dir]: { ...d, members: [member('backend', 'blocked'), member('qa', 'working')] } } })
    const row2 = screen.getByTestId('task-2026-09-25-x')
    expect(row2).toHaveClass('bg-status-danger-soft')
    expect(within(row2).getByText('backend').closest('[data-slot="status-pill"]')).toHaveAttribute('data-color', 'danger')
  })

  it('波進行超過一小時時用 formatMinutes 顯示（300 分）', () => {
    const p = activeProject()
    const d = p.active['2026-09-25-x']!
    p.active['2026-09-25-x'] = { ...d, waves: [{ ...d.waves[0], opened_at: '2026-09-25T05:30' }] }
    renderCard(p)
    const row = screen.getByTestId('task-2026-09-25-x')
    expect(within(row).getByText(`波 2 進行中 · 已 ${formatMinutes(300)}`)).toBeInTheDocument()
  })

  it('成員膠囊：有 pane 用 herdr 狀態，沒有的灰色並註「無 pane」；hover 看到 model 與 focus 指令', async () => {
    const user = userEvent.setup()
    renderCard(activeProject())
    const backend = screen.getByText('backend').closest('[data-slot="status-pill"]')!
    expect(backend).toHaveAttribute('data-tone', 'working')
    const qa = screen.getByText('qa').closest('[data-slot="status-pill"]')!
    expect(qa).toHaveAttribute('data-tone', 'unknown')
    expect(within(qa as HTMLElement).getByText(/無 pane/)).toBeInTheDocument()
    await user.hover(backend)
    expect(await screen.findByText('herdr agent focus P1', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText('opus')).toBeInTheDocument()
    expect(screen.getByText('$1.50')).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('其他 session 顯示 name（null 時 agent）', () => {
    renderCard(activeProject())
    const other = screen.getByTestId('other-sessions')
    expect(within(other).getByText('claude')).toBeInTheDocument()
  })

  it('狀態不明任務帶標籤；已結案摺疊為「已結案 N 件」可展開', async () => {
    const user = userEvent.setup()
    renderCard(activeProject())
    expect(screen.getByText('狀態不明')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /已結案 10 件/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('task-2026-09-23-ops')).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('task-2026-09-23-ops')).toBeInTheDocument()
  })

  it('外框依最高嚴重度：一般無；只有 ESCALATE → warn；有 blocked → danger', () => {
    const { unmount } = renderCard(activeProject())
    expect(screen.getByTestId('project-teamflow')).not.toHaveAttribute('data-alert')
    unmount()
    const p = activeProject()
    const t = p.list!.tasks.at(-1)!
    const esc = { ...t, counts: { ...t.counts, escalations: 1 } }
    const r2 = renderCard({ ...p, list: { ...p.list!, tasks: [...p.list!.tasks.slice(0, -1), esc] } })
    expect(screen.getByTestId('project-teamflow')).toHaveAttribute('data-alert', 'warn')
    r2.unmount()
    const d = p.active['2026-09-25-x']
    renderCard({ ...p, active: { [d.dir]: { ...d, members: [member('backend', 'working'), member('qa', 'blocked')] } } })
    expect(screen.getByTestId('project-teamflow')).toHaveAttribute('data-alert', 'danger')
  })

  it('相容模式標籤出錯時也保留；錯誤態顯示訊息；有舊資料標「過時 · N 分鐘前」', () => {
    renderCard(
      project({
        name: 'collect',
        mode: 'compat',
        stale: true,
        fetchedAt: NOW - 7 * 60_000,
        error: { kind: 'exit', message: 'dk: boom' },
      }),
    )
    expect(screen.getByText('相容模式')).toBeInTheDocument()
    expect(screen.getByTestId('project-collect')).toHaveAttribute('data-alert', 'danger')
    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'danger')
    expect(screen.getByRole('alert')).toHaveTextContent('dk-status 非零結束')
    expect(screen.getByRole('alert')).toHaveTextContent('dk: boom')
    expect(screen.getByText('過時 · 7 分鐘前')).toHaveAttribute('data-variant', 'warn')
    expect(screen.getByRole('button', { name: /已結案 10 件/ })).toBeInTheDocument()
  })

  it('沒有舊資料的錯誤只顯示錯誤', () => {
    renderCard(project({ name: 'ghost', list: null, fetchedAt: null, mode: null, error: { kind: 'missing', message: 'missing' } }))
    expect(screen.getByRole('alert')).toHaveTextContent('路徑不存在')
    expect(screen.queryByText(/過時/)).not.toBeInTheDocument()
  })
})
