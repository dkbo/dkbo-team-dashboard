// AC10：場景 DOM 疊層（AgentMarker §6.3／§6.15、AgentHoverCard §6.8／§6.18、ZoneSign §6.5）、無 WebGL 退路、只用 token
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Substate } from '@dash/shared'
import { AgentHoverCard, AgentMarker, EdgeAlertChip, ZoneSign } from '@/features/office-scene/Marker'
import OfficeScene from '@/features/office-scene/OfficeScene'
import { officeSession } from '../shell/builders'

const NOW = 1_800_000_000_000
const MIN = 60_000

function marker(substate: Substate, over: Partial<Parameters<typeof AgentMarker>[0]> = {}, s = {}) {
  const onSelect = vi.fn()
  const onHover = vi.fn()
  const session = officeSession({ id: 'p1', member: 'dev-a', substate, substateSince: NOW - 3 * MIN, turnStartedAt: NOW - 4 * MIN, lastEventAt: NOW - MIN, ...s })
  const r = render(
    <AgentMarker session={session} substate={substate} now={NOW} scale={1} focused={false} reducedMotion={false} onSelect={onSelect} onHover={onHover} {...over} />,
  )
  return { ...r, onSelect, onHover }
}

describe('AgentMarker', () => {
  it('等你：alert 型＋CSS 脈動環（E14）、aria-label 含名字與計時', () => {
    const { container } = marker('waiting')
    const btn = screen.getByRole('button')
    expect(btn).toHaveAccessibleName('dev-a，等你，已等 3 分 0 秒')
    expect(container.querySelector('.animate-alert-pulse')).not.toBeNull()
    expect(container.querySelector('.bg-marker-alert-bg.text-marker-alert-fg.h-marker-alert')).not.toBeNull()
  })

  it('警示標記（pill、脈動環、指向三角）與邊緣 chip 用 marker-alert 對比 token，不用 status-danger／on-color（亮暗 ≥ 4.5:1）', () => {
    const { container } = marker('waiting')
    const html = container.innerHTML
    expect(html).not.toMatch(/bg-status-danger|text-on-color|fill-status-danger|stroke-status-danger/)
    expect(container.querySelector('.animate-alert-pulse')).toHaveClass('bg-marker-alert-bg')
    expect(container.querySelector('svg[viewBox="0 0 10 6"]')).toHaveClass('fill-marker-alert-bg', 'stroke-marker-alert-bg')
    const chip = render(<EdgeAlertChip name="dev-a" onClick={vi.fn()} style={{}} />).container.firstElementChild!
    expect(chip).toHaveClass('bg-marker-alert-bg', 'text-marker-alert-fg')
    expect(chip.className).not.toMatch(/bg-status-danger|text-on-color/)
  })

  it('錯誤不脈動（只有等你脈動，Q2）', () => {
    expect(marker('error').container.querySelector('.animate-alert-pulse')).toBeNull()
  })

  it('reduced motion：等你不脈動、思考三點靜止', () => {
    expect(marker('waiting', { reducedMotion: true }).container.querySelector('.animate-alert-pulse')).toBeNull()
    expect(marker('thinking', { reducedMotion: true }).container.querySelector('.animate-think-dots')).toBeNull()
  })

  it('思考：bubble 三點（CSS 動畫）', () => {
    expect(marker('thinking').container.querySelectorAll('.animate-think-dots')).toHaveLength(3)
  })

  it('執行：line 型、工具名 mono', () => {
    const { container } = marker('running', {}, { tool: { name: 'Bash', summary: 'ls' } })
    expect(screen.getByText('Bash')).toHaveClass('font-mono')
    expect(container.querySelector('.border-status-ok.bg-popover')).not.toBeNull()
  })

  it('subagents > 0 加 ×N', () => {
    marker('running', {}, { subagents: 3, tool: { name: 'Task', summary: null } })
    expect(screen.getByText('×3')).toBeInTheDocument()
  })

  it('閒置預設不畫標記，hover／選取時才畫', () => {
    expect(marker('idle').container.querySelector('button')).toBeNull()
    expect(marker('idle', { focused: true }).container.querySelector('button')).not.toBeNull()
  })

  it('effort 星只在 hover／選取時畫（E11）', () => {
    expect(marker('running', {}, { kind: 'claude', effort: 'high' }).container.querySelector('[data-slot="effort-stars"]')).toBeNull()
    expect(marker('running', { focused: true }, { kind: 'claude', effort: 'high' }).container.querySelector('[data-slot="effort-stars"]')).not.toBeNull()
  })

  it('leader 有皇冠', () => {
    marker('running', {}, { leader: true })
    expect(screen.getByLabelText('leader')).toBeInTheDocument()
  })

  it('縮放：< 0.6 只剩點；alert 永不縮成點', () => {
    expect(marker('running', { scale: 'dot' }).container.querySelector('[data-slot="marker-dot"]')).not.toBeNull()
    expect(marker('waiting', { scale: 'dot' }).container.querySelector('[data-slot="marker-dot"]')).toBeNull()
    const el = marker('running', { scale: 0.8 }).container.querySelector('[data-slot="agent-marker"]') as HTMLElement
    expect(el.style.transform).toBe('scale(0.8)')
  })

  it('hover 時多出的 effort 星把標記膠囊推高：指標從膠囊移到星上仍算在標記內（不取消 hover）', () => {
    const { onHover, container } = marker('running', { focused: true }, { kind: 'claude', effort: 'high' })
    const btn = screen.getByRole('button')
    const stars = container.querySelector('[data-slot="effort-stars"]') as HTMLElement
    fireEvent.pointerOver(btn)
    expect(onHover).toHaveBeenLastCalledWith('p1')
    // 膠囊上移後指標落在星上：pointerout(btn → stars) 接 pointerover(stars)
    fireEvent.pointerOut(btn, { relatedTarget: stars })
    fireEvent.pointerOver(stars, { relatedTarget: btn })
    expect(onHover).not.toHaveBeenCalledWith(null)
    // 真正離開標記才取消
    fireEvent.pointerOut(stars, { relatedTarget: document.body })
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('click 選取、focus／hover 開 hover 卡', () => {
    const { onSelect, onHover } = marker('running')
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(onSelect).toHaveBeenCalledWith('p1')
    fireEvent.focus(btn)
    expect(onHover).toHaveBeenLastCalledWith('p1')
    fireEvent.blur(btn)
    expect(onHover).toHaveBeenLastCalledWith(null)
  })
})

describe('AgentHoverCard', () => {
  const s = officeSession({
    member: 'dev-a',
    kind: 'claude',
    model: 'opus-4',
    effort: 'medium',
    project: 'atlas',
    substate: 'running',
    tool: { name: 'Bash', summary: 'pnpm test' },
    turnStartedAt: NOW - 2 * MIN,
  })

  it('名字、kind、專案 · 任務 · 波、RankTag（含星）、細狀態、工具列、提示', () => {
    render(<AgentHoverCard session={s} substate="running" task={{ display: '結帳流程', wave: { current: 3, planned: 5 } }} now={NOW} flip={false} />)
    expect(screen.getByText('dev-a')).toBeInTheDocument()
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('atlas · 結帳流程 · 波 3')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="rank-tag"][data-rank="senior"] [data-slot="effort-stars"]')).not.toBeNull()
    expect(screen.getByText('Bash pnpm test')).toBeInTheDocument()
    expect(screen.getByText('本輪 02:00')).toBeInTheDocument()
    expect(screen.getByText('點一下看詳情')).toBeInTheDocument()
  })

  it('錯誤時第三列改錯誤原文（danger 色）；碰右緣翻左', () => {
    const e = officeSession({ substate: 'error', error: 'API Error: 529', tool: null })
    render(<AgentHoverCard session={e} substate="error" task={null} now={NOW} flip />)
    expect(screen.getByText('API Error: 529')).toHaveClass('text-status-danger-fg')
    expect(screen.getByRole('tooltip')).toHaveClass('-translate-x-full')
  })
})

describe('ZoneSign', () => {
  it('AC9：overflow > 0 時加「+K 在散座」', () => {
    const { rerender, queryByText } = render(<ZoneSign kind="project" title="atlas" subtitle={null} count={12} needs={false} overflow={0} />)
    expect(queryByText(/在散座/)).toBeNull()
    rerender(<ZoneSign kind="project" title="atlas" subtitle={null} count={13} needs={false} overflow={2} />)
    expect(queryByText('+2 在散座')).not.toBeNull()
  })

  it('有等你時尾端多一個 danger 點', () => {
    const { rerender } = render(<ZoneSign kind="project" title="atlas" subtitle="結帳 · 波 3" count={4} needs={false} />)
    expect(screen.queryByLabelText('有人等你')).toBeNull()
    rerender(<ZoneSign kind="project" title="atlas" subtitle="結帳 · 波 3" count={4} needs />)
    expect(screen.getByLabelText('有人等你')).toHaveClass('bg-status-danger')
  })
})

describe('OfficeScene 退路', () => {
  afterEach(() => vi.restoreAllMocks())

  it('沒有 WebGL：onFallback("webgl")，不畫 canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const onFallback = vi.fn()
    const { container } = render(
      <OfficeScene
        sessions={[]}
        tasks={{}}
        selectedId={null}
        hoveredId={null}
        onSelect={vi.fn()}
        onHover={vi.fn()}
        focusRequest={null}
        resetRequest={0}
        theme="light"
        reducedMotion={false}
        onFallback={onFallback}
        onUserMovedCamera={vi.fn()}
        objects={null}
        events={[]}
        onOpenObject={vi.fn()}
      />,
    )
    expect(onFallback).toHaveBeenCalledWith('webgl')
    expect(container.querySelector('canvas')).toBeNull()
  })
})

describe('只用 token（brief 全域約束）', () => {
  const DIR = path.resolve(import.meta.dirname, '../../src/features/office-scene')
  const files = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(d, e.name)) : [path.join(d, e.name)]))

  it('features/office-scene 沒有 hex、text-[／rounded-[、-[Npx]', () => {
    const hits = files(DIR)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .flatMap((line, i) => (/#[0-9a-fA-F]{3,8}\b|text-\[|rounded-\[|-\[[0-9.]+px\]/.test(line) ? [`${path.relative(DIR, f)}:${i + 1}`] : [])),
      )
    expect(hits).toEqual([])
  })
})
