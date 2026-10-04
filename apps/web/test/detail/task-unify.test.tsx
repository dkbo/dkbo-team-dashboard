import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { TaskDetailView } from '@/features/task/TaskDetailView'
import { makeDetailDoc, makePane } from './fixtures'

afterEach(cleanup)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const view = (over: Record<string, unknown> = {}, panes: any[] = [makePane()], extra: Record<string, unknown> = {}) =>
  render(<TaskDetailView project="demo-proj" detail={makeDetailDoc(over) as never} panes={panes as never} {...extra} />, { wrapper: MemoryRouter })

const unstarted = {
  wave: 3,
  opened_at: null,
  dev_done_at: null,
  review_spawned_at: null,
  review_verdict_at: null,
  review_verdict: null,
  closed_at: null,
  tests: null,
  tests_ok: null,
  commits: [],
}

describe('任務詳情 unify（AC6）：頁首', () => {
  it('PageHeader：h1 任務名、副標「專案 · dir · 分支」、meta StatusPill（running＝ok）', () => {
    const { container } = view()
    const header = container.querySelector('[data-slot="page-header"]') as HTMLElement
    expect(within(header).getByRole('heading', { level: 1, name: '示範任務' })).toBeInTheDocument()
    expect(header).toHaveTextContent('demo-proj · 2026-09-20-demo · dk/demo')
    const pill = header.querySelector('[data-slot="status-pill"]')
    expect(pill).toHaveAttribute('data-color', 'ok')
    expect(pill).toHaveTextContent('進行中')
  })

  it('已結案任務：StatusPill idle＋✓', () => {
    const { container } = view({ status: 'done', closed_at: '2026-09-21T12:00', close_result: 'merged' })
    const pill = container.querySelector('[data-slot="page-header"] [data-slot="status-pill"]')
    expect(pill).toHaveAttribute('data-color', 'idle')
    expect(pill).toHaveTextContent('已完成')
  })

  it('頁首工具列：「看 herdr」連到成員 pane、「複製 focus 指令」複製 herdr agent focus', async () => {
    const user = userEvent.setup() // 裝上 userEvent 的假剪貼簿
    const { container } = view()
    const actions = container.querySelector('[data-slot="page-header-actions"]') as HTMLElement
    expect(within(actions).getByRole('link', { name: '看 herdr' }).getAttribute('href')).toContain('p=w1-p2')
    await user.click(within(actions).getByRole('button', { name: '複製 focus 指令' }))
    expect(await navigator.clipboard.readText()).toBe('herdr agent focus w1-p2')
  })

  it('沒有對到 pane：「看 herdr」連 /herdr、不顯示複製 focus 指令', () => {
    const { container } = view({}, [])
    const actions = container.querySelector('[data-slot="page-header-actions"]') as HTMLElement
    expect(within(actions).getByRole('link', { name: '看 herdr' })).toHaveAttribute('href', '/herdr')
    expect(within(actions).queryByRole('button', { name: '複製 focus 指令' })).toBeNull()
  })
})

describe('任務詳情 unify（AC6）：版面與右欄', () => {
  it('≥ xl 主欄＋aside-w 右欄；右欄有任務資訊卡（目標、分支、關卡①）與 aside 插槽', () => {
    view({}, [makePane()], { aside: <div data-testid="aside-slot" /> })
    const info = screen.getByTestId('task-info')
    expect(info).toHaveTextContent('把示範功能做完')
    expect(info).toHaveTextContent('dk/demo')
    expect(info).toHaveTextContent('09-20 08:30')
    expect(info).toHaveTextContent('1/2 波')
    const aside = info.parentElement!
    expect(aside).toContainElement(screen.getByTestId('aside-slot'))
    expect(aside.parentElement!.className).toContain('xl:grid-cols-[minmax(0,1fr)_var(--aside-w)]')
  })

  it('Banner 插在頁首之下', () => {
    const { container } = view({}, [makePane()], { banner: <div data-testid="banner-slot" /> })
    const header = container.querySelector('[data-slot="page-header"]')!
    const banner = screen.getByTestId('banner-slot')
    expect(header.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('任務詳情 unify（AC6）：WaveRow §6.26', () => {
  it('已關閉的波收成一行（已關閉＋✓、測試 Tag、commit Tag），點了展開步驟', async () => {
    const user = userEvent.setup()
    view()
    const w1 = screen.getByTestId('wave-1')
    const toggle = within(w1).getByRole('button', { expanded: false })
    expect(within(w1).queryByTestId('step-open')).toBeNull()
    expect(w1.querySelector('[data-slot="status-pill"]')).toHaveTextContent('已關閉')
    expect(within(w1).getByText('b169571').closest('[data-slot="tag"]')).not.toBeNull()
    expect(within(w1).getByText(/tests ok/).closest('[data-slot="tag"]')).toHaveAttribute('data-variant', 'ok')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(w1).getByTestId('step-open')).toBeInTheDocument()
  })

  it('進行中的波直接展開五步驟，無收合鈕；未開始的波一行、opacity-80', () => {
    view({ waves: [...makeDetailDoc().task.waves, unstarted] })
    const w2 = screen.getByTestId('wave-2')
    expect(within(w2).queryByRole('button', { expanded: false })).toBeNull()
    for (const k of ['open', 'dev', 'review', 'verdict', 'close']) expect(within(w2).getByTestId(`step-${k}`)).toBeInTheDocument()
    expect(w2.querySelector('[data-slot="status-pill"]')).toHaveAttribute('data-color', 'ok')
    const w3 = screen.getByTestId('wave-3')
    expect(w3).toHaveTextContent('未開始')
    expect(w3.className).toContain('opacity-80')
    expect(within(w3).queryByTestId('step-open')).toBeNull()
  })

  it('波次列 rounded-lg bg-muted，不用 border 框', () => {
    view()
    const w1 = screen.getByTestId('wave-1')
    expect(w1.className).toContain('bg-muted')
    expect(w1.className).not.toMatch(/(^|\s)border(\s|$)/)
  })
})

describe('任務詳情 unify（AC6）：成員表', () => {
  it('state 欄用 StatusPill（blocked＝danger、working＝ok）；「目前」多行儲存格補 py-3', () => {
    view()
    const backend = screen.getByTestId('member-backend')
    const st = within(backend).getByTestId('state-status')
    expect(st).toHaveAttribute('data-slot', 'status-pill')
    expect(st).toHaveAttribute('data-color', 'ok')
    expect(st).toHaveTextContent('working')
    const qa = screen.getByTestId('member-qa')
    expect(within(qa).getByTestId('state-status')).toHaveAttribute('data-color', 'danger')
    expect(within(backend).getByText('寫 API 路由').closest('td')!.className).toContain('py-3')
  })

  it('herdr 欄只留 StatusPill＋「看畫面」icon button；複製指令收進 hover', async () => {
    const user = userEvent.setup()
    view()
    const backend = screen.getByTestId('member-backend')
    const herdr = within(backend).getByTestId('herdr-status')
    const watch = within(herdr).getByTestId('watch-pane')
    expect(watch).toHaveAccessibleName('看畫面')
    expect(watch.getAttribute('href')).toContain('p=w1-p2')
    expect(screen.queryByText('herdr agent focus w1-p2')).toBeNull()
    await user.hover(herdr.querySelector('[data-slot="status-pill"]')!)
    expect(await screen.findByText('herdr agent focus w1-p2')).toBeInTheDocument()
  })

  it('成員卡標題帶人數 Tag', () => {
    view()
    const card = screen.getByTestId('member-table')
    expect(within(card).getByText('2').closest('[data-slot="tag"]')).not.toBeNull()
  })
})

describe('任務詳情 unify（AC6）：分頁改 SegmentedControl', () => {
  it('分頁列是 SegmentedControl（tablist），切換照常', async () => {
    const user = userEvent.setup()
    view()
    const list = screen.getByRole('tablist')
    expect(list).toHaveAttribute('data-slot', 'segmented-control')
    await user.click(within(list).getByRole('tab', { name: /裁定/ }))
    expect(within(list).getByRole('tab', { name: /裁定/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('ruling-0')).toBeInTheDocument()
  })
})
