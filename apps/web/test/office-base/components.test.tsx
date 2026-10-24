// AC7：SubstatePill、SessionRow、EffortStars、RankTag（props 照 office 規格 §5.3，尺寸與狀態照 §6）
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { SUBSTATES, type Substate } from '@dash/shared'
import { EffortStars } from '@/components/app/EffortStars'
import { RankTag } from '@/components/app/RankTag'
import { SessionRow } from '@/components/app/SessionRow'
import { SubstatePill } from '@/components/app/SubstatePill'
import { SUBSTATE_META } from '@/lib/substate'
import { officeSession } from '../shell/builders'

const NOW = 1_800_000_000_000
const MIN = 60_000
const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const pillOf = (container: HTMLElement) => container.querySelector('[data-slot="status-pill"]')!

describe('EffortStars', () => {
  it('level 0 不畫', () => {
    const { container } = render(<EffortStars level={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([1, 2, 3, 4, 5])('level %i：畫 5 顆星、前 %i 顆實心、其餘空格', (n) => {
    const { container } = render(<EffortStars level={n} />)
    const stars = container.querySelectorAll('[data-star]')
    expect(stars).toHaveLength(5)
    stars.forEach((s, i) => {
      expect(s.getAttribute('data-star')).toBe(i < n ? 'filled' : 'empty')
      expect(cls(s)).toContain(i < n ? 'text-accent-foreground' : 'text-accent-foreground/22')
    })
  })

  it('level 超出範圍時夾在 0–5', () => {
    const { container, rerender } = render(<EffortStars level={9} />)
    expect(container.querySelectorAll('[data-star="filled"]')).toHaveLength(5)
    rerender(<EffortStars level={-2} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('default：膠囊 h-3.5、rounded-full、bg-popover、shadow-soft、星 size-2', () => {
    const { container } = render(<EffortStars level={3} />)
    const root = container.querySelector('[data-slot="effort-stars"]')!
    expect(root).toHaveAttribute('data-size', 'default')
    for (const c of ['h-3.5', 'rounded-full', 'bg-popover', 'shadow-soft']) expect(cls(root)).toContain(c)
    expect(cls(container.querySelector('[data-star]'))).toContain('size-2')
  })

  it('sm：無底無陰影、星 size-1.75', () => {
    const { container } = render(<EffortStars level={2} size="sm" />)
    const root = container.querySelector('[data-slot="effort-stars"]')!
    expect(root).toHaveAttribute('data-size', 'sm')
    expect(cls(root)).not.toContain('bg-popover')
    expect(cls(root)).not.toContain('shadow-soft')
    expect(cls(container.querySelector('[data-star]'))).toContain('size-1.75')
  })

  it('有可讀的 aria-label', () => {
    render(<EffortStars level={3} />)
    expect(screen.getByRole('img', { name: 'effort 3／5 星' })).toBeInTheDocument()
  })
})

describe('RankTag', () => {
  it.each([
    ['senior', '資深'],
    ['mid', '中階'],
    ['junior', '初階'],
    ['visitor', '訪客'],
  ] as const)('%s：色塊 bg-rank-%s、文字「%s」', (rank, label) => {
    const { container } = render(<RankTag rank={rank} />)
    const root = container.querySelector('[data-slot="rank-tag"]')!
    expect(root).toHaveAttribute('data-rank', rank)
    expect(root).toHaveTextContent(label)
    expect(cls(container.querySelector('[data-slot="rank-swatch"]'))).toContain(`bg-rank-${rank}`)
  })

  it('外觀：h-5、rounded-full、bg-muted', () => {
    const { container } = render(<RankTag rank="mid" />)
    const root = container.querySelector('[data-slot="rank-tag"]')!
    for (const c of ['h-5', 'rounded-full', 'bg-muted']) expect(cls(root)).toContain(c)
  })

  it('model 與 effort 接成「model/effort」，mono、muted-foreground', () => {
    render(<RankTag rank="senior" model="opus" effort="medium" />)
    const m = screen.getByText('opus/medium')
    expect(cls(m)).toContain('font-mono')
    expect(cls(m)).toContain('text-muted-foreground')
  })

  it('只有 model 沒有 effort：只寫 model', () => {
    render(<RankTag rank="mid" model="sonnet" />)
    expect(screen.getByText('sonnet')).toBeInTheDocument()
  })

  it('給 kind＋effort 時畫星（sm）；沒給 kind 不畫', () => {
    const { container, rerender } = render(<RankTag rank="mid" model="sonnet" effort="high" kind="claude" />)
    const stars = container.querySelector('[data-slot="effort-stars"]')!
    expect(stars).toHaveAttribute('data-size', 'sm')
    expect(container.querySelectorAll('[data-star="filled"]')).toHaveLength(3)
    rerender(<RankTag rank="mid" model="sonnet" effort="high" />)
    expect(container.querySelector('[data-slot="effort-stars"]')).toBeNull()
  })

  it('讀不到 effort：不畫星', () => {
    const { container } = render(<RankTag rank="mid" model="sonnet" kind="claude" />)
    expect(container.querySelector('[data-slot="effort-stars"]')).toBeNull()
  })

  it('model 很長時可截斷（truncate）', () => {
    render(<RankTag rank="senior" model="claude-opus-4-1-20250805" />)
    expect(cls(screen.getByText('claude-opus-4-1-20250805'))).toContain('truncate')
  })
})

describe('SubstatePill', () => {
  it.each(SUBSTATES)('%s：tone 與文字照 §1.2 對照表', (sub) => {
    const { container } = render(<SubstatePill substate={sub} />)
    const pill = pillOf(container)
    const meta = SUBSTATE_META[sub]
    expect(pill).toHaveAttribute('data-color', meta.tone)
    expect(pill).toHaveAttribute('data-substate', sub)
    expect(pill).toHaveTextContent(meta.label)
    expect(cls(pill)).toContain(`border-status-${meta.tone}`)
    expect(cls(pill)).toContain(`text-status-${meta.tone}-fg`)
  })

  it('running 帶工具名：「執行 Bash」', () => {
    const { container } = render(<SubstatePill substate="running" tool="Bash" />)
    expect(pillOf(container)).toHaveTextContent('執行 Bash')
  })

  it('點脈動：waiting／running／writing／thinking 有 animate-pulse，其他沒有', () => {
    for (const sub of SUBSTATES) {
      const { container, unmount } = render(<SubstatePill substate={sub} />)
      const dot = container.querySelector('[data-slot="status-dot"]')
      if (['waiting', 'running', 'writing', 'thinking'].includes(sub)) expect(cls(dot)).toContain('animate-pulse')
      else expect(cls(dot)).not.toContain('animate-pulse')
      unmount()
    }
  })

  it('done 換 Check（沒有點）；interrupted 換 Square（沒有點）', () => {
    const done = render(<SubstatePill substate="done" />)
    expect(done.container.querySelector('[data-slot="status-dot"]')).toBeNull()
    expect(done.container.querySelector('svg')).not.toBeNull()
    done.unmount()
    const intr = render(<SubstatePill substate="interrupted" />)
    expect(intr.container.querySelector('[data-slot="status-dot"]')).toBeNull()
    expect(intr.container.querySelector('svg')).not.toBeNull()
  })

  it('size：default 對應 StatusPill default、sm 對應 sm', () => {
    const a = render(<SubstatePill substate="idle" />)
    expect(pillOf(a.container)).toHaveAttribute('data-size', 'default')
    a.unmount()
    const b = render(<SubstatePill substate="idle" size="sm" />)
    expect(pillOf(b.container)).toHaveAttribute('data-size', 'sm')
  })

  it('note：default 顯示在膠囊內；sm 改成「等你 · 審批」', () => {
    const a = render(<SubstatePill substate="waiting" note="審批" />)
    expect(pillOf(a.container)).toHaveTextContent('等你')
    expect(pillOf(a.container)).toHaveTextContent('審批')
    a.unmount()
    const b = render(<SubstatePill substate="waiting" note="審批" size="sm" />)
    expect(pillOf(b.container)).toHaveTextContent('等你 · 審批')
  })

  it('沒給 since：只有膠囊，沒有計時', () => {
    const { container } = render(<SubstatePill substate="waiting" />)
    expect(container.querySelector('[data-slot="substate-timer"]')).toBeNull()
  })

  it('給 since＋now：計時在膠囊外，waiting 用 danger 色', () => {
    const { container } = render(<SubstatePill substate="waiting" since={NOW - 3 * MIN} now={NOW} />)
    const timer = container.querySelector('[data-slot="substate-timer"]')!
    expect(timer).toHaveTextContent('已等 03:00')
    expect(pillOf(container).contains(timer)).toBe(false)
    expect(cls(timer)).toContain('text-status-danger-fg')
    expect(cls(timer)).toContain('tabular-nums')
  })

  it('非 danger 的計時是 muted-foreground；since 可以是 Date', () => {
    const { container } = render(<SubstatePill substate="done" since={new Date(NOW - 4 * MIN)} now={NOW} />)
    const timer = container.querySelector('[data-slot="substate-timer"]')!
    expect(timer).toHaveTextContent('4 分前')
    expect(cls(timer)).toContain('text-muted-foreground')
  })

  it('error 的計時也是 danger 色', () => {
    const { container } = render(<SubstatePill substate="error" since={NOW - 2 * MIN} now={NOW} />)
    expect(cls(container.querySelector('[data-slot="substate-timer"]'))).toContain('text-status-danger-fg')
  })
})

describe('SessionRow', () => {
  const base = { now: NOW, onSelect: () => {} }

  it('名字、kind Tag、「專案 · 任務 · 角色」第二行', () => {
    render(
      <SessionRow
        {...base}
        session={officeSession({ member: 'backend', kind: 'claude', project: 'teamflow', taskDir: '2026-10-24-office', role: 'backend' })}
      />,
    )
    expect(screen.getByText('backend', { selector: '[data-slot="session-name"]' })).toBeInTheDocument()
    expect(screen.getByText('claude', { selector: '[data-slot="tag"]' })).toBeInTheDocument()
    expect(screen.getByText('teamflow · office · backend')).toBeInTheDocument()
  })

  it('taskLabel 蓋掉從 taskDir 推的短名；沒有任務就略過那一段', () => {
    const a = render(<SessionRow {...base} taskLabel="辦公室" session={officeSession({ project: 'p', taskDir: '2026-10-24-office', role: 'qa' })} />)
    expect(screen.getByText('p · 辦公室 · qa')).toBeInTheDocument()
    a.unmount()
    render(<SessionRow {...base} session={officeSession({ project: 'p', taskDir: null, role: null })} />)
    expect(screen.getByText('p')).toBeInTheDocument()
  })

  it('名字退路：member → agentName → kind 加 session 前 6 碼', () => {
    const a = render(<SessionRow {...base} session={officeSession({ member: null, agentName: 'chore-1' })} />)
    expect(a.container.querySelector('[data-slot="session-name"]')).toHaveTextContent('chore-1')
    a.unmount()
    render(<SessionRow {...base} session={officeSession({ member: null, agentName: null, kind: 'codex', sessionId: 'abcdef123456' })} />)
    expect(screen.getByText('codex abcdef', { selector: '[data-slot="session-name"]' })).toBeInTheDocument()
  })

  it('leader 名字後加 👑', () => {
    const { container } = render(<SessionRow {...base} session={officeSession({ leader: true })} />)
    expect(container.querySelector('[data-slot="session-name"]')).toHaveTextContent('👑')
  })

  it('職等色點＋星（E9／E10）：codex gpt-5.5 xhigh → 資深、4 星', () => {
    const { container } = render(<SessionRow {...base} session={officeSession({ kind: 'codex', model: 'gpt-5.5', effort: 'xhigh' })} />)
    const dot = container.querySelector('[data-slot="rank-dot"]')!
    expect(cls(dot)).toContain('bg-rank-senior')
    expect(cls(dot)).toContain('size-2.5')
    expect(dot).toHaveAttribute('title', '職等 資深')
    expect(dot).toHaveAttribute('aria-label', '職等 資深')
    expect(cls(dot)).toContain('border-foreground/55')
    expect(container.querySelectorAll('[data-star="filled"]')).toHaveLength(4)
  })

  it('讀不到 effort：不畫星；讀不到 model：訪客色點', () => {
    const { container } = render(<SessionRow {...base} session={officeSession({ model: null, effort: null })} />)
    expect(cls(container.querySelector('[data-slot="rank-dot"]'))).toContain('bg-rank-visitor')
    expect(container.querySelector('[data-slot="effort-stars"]')).toBeNull()
  })

  it('有 tool：第三行 Terminal 圖示＋摘要（mono、truncate）；沒有就沒有第三行', () => {
    const a = render(<SessionRow {...base} session={officeSession({ substate: 'running', tool: { name: 'Bash', summary: 'pnpm -r test' } })} />)
    const line = a.container.querySelector('[data-slot="session-tool"]')!
    expect(line).toHaveTextContent('pnpm -r test')
    expect(cls(line.querySelector('code'))).toContain('font-mono')
    expect(cls(line.querySelector('code'))).toContain('truncate')
    a.unmount()
    const b = render(<SessionRow {...base} session={officeSession({ substate: 'thinking', tool: null })} />)
    expect(b.container.querySelector('[data-slot="session-tool"]')).toBeNull()
  })

  it('tool 沒有 summary 時退回工具名', () => {
    const { container } = render(<SessionRow {...base} session={officeSession({ substate: 'running', tool: { name: 'Read', summary: null } })} />)
    expect(container.querySelector('[data-slot="session-tool"]')).toHaveTextContent('Read')
  })

  it('右側：SubstatePill sm＋計時', () => {
    const { container } = render(
      <SessionRow {...base} session={officeSession({ substate: 'waiting', substateSince: NOW - 3 * MIN - 12_000, lastEventAt: NOW - 1000 })} />,
    )
    const pill = pillOf(container)
    expect(pill).toHaveAttribute('data-size', 'sm')
    expect(pill).toHaveAttribute('data-substate', 'waiting')
    const timer = container.querySelector('[data-slot="session-timer"]')!
    expect(timer).toHaveTextContent('已等 03:12')
    expect(cls(timer)).toContain('text-status-danger-fg')
  })

  it('done 超過 10 分鐘顯示成閒置（Q3／Q7）', () => {
    const { container } = render(
      <SessionRow {...base} session={officeSession({ substate: 'done', substateSince: NOW - 20 * MIN, lastEventAt: NOW - 15 * MIN })} />,
    )
    expect(pillOf(container)).toHaveAttribute('data-substate', 'idle')
    expect(container.querySelector('[data-slot="session-timer"]')).toHaveTextContent('閒置 15 分')
  })

  it.each(['waiting', 'error'] as const)('%s：列底 bg-status-danger-soft', (sub) => {
    const { container } = render(<SessionRow {...base} session={officeSession({ substate: sub })} />)
    expect(cls(container.querySelector('[data-slot="session-row"]'))).toContain('bg-status-danger-soft')
  })

  it.each(['running', 'thinking', 'idle', 'done'] as Substate[])('%s：透明底、hover-fill', (sub) => {
    const { container } = render(<SessionRow {...base} session={officeSession({ substate: sub, lastEventAt: NOW })} />)
    const row = container.querySelector('[data-slot="session-row"]')
    expect(cls(row)).not.toContain('bg-status-danger-soft')
    expect(cls(container.querySelector('[data-slot="session-main"]'))).toContain('hover:bg-muted')
  })

  it('danger 列 hover 不換底、加 shadow-soft', () => {
    const { container } = render(<SessionRow {...base} session={officeSession({ substate: 'waiting' })} />)
    expect(cls(container.querySelector('[data-slot="session-row"]'))).toContain('hover:shadow-soft')
    expect(cls(container.querySelector('[data-slot="session-main"]'))).not.toContain('hover:bg-muted')
  })

  it('selected：bg-accent 與 aria-pressed／data-selected', () => {
    const { container } = render(<SessionRow {...base} selected session={officeSession({ substate: 'running' })} />)
    const row = container.querySelector('[data-slot="session-row"]')!
    expect(cls(row)).toContain('bg-accent')
    expect(row).toHaveAttribute('data-selected', 'true')
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument()
  })

  it('等你且 selected：保留 danger 底並加 ring 標示選取', () => {
    const { container } = render(<SessionRow {...base} selected session={officeSession({ substate: 'waiting' })} />)
    const row = container.querySelector('[data-slot="session-row"]')!
    expect(cls(row)).toContain('bg-status-danger-soft')
    expect(cls(row)).toContain('ring-2')
    expect(row).toHaveAttribute('data-selected', 'true')
  })

  it('點擊呼叫 onSelect(session.id)', () => {
    const onSelect = vi.fn()
    render(<SessionRow now={NOW} onSelect={onSelect} session={officeSession({ id: 'pane-7' })} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('pane-7')
  })

  it('可聚焦且有 focus-visible 環（inset）', () => {
    const { container } = render(<SessionRow {...base} session={officeSession()} />)
    const main = container.querySelector('[data-slot="session-main"]')!
    expect(main.tagName).toBe('BUTTON')
    expect(cls(main)).toContain('focus-visible:ring-3')
    expect(cls(main)).toContain('focus-visible:ring-inset')
  })

  it('按鈕的可讀名稱含名字、狀態與計時（用內容，不蓋 aria-label）', () => {
    render(<SessionRow {...base} session={officeSession({ member: 'dev-a', substate: 'waiting', substateSince: NOW - 3 * MIN - 12_000 })} />)
    expect(screen.getByRole('button', { name: /dev-a.*等你.*已等 03:12/ })).toBeInTheDocument()
  })

  it('expanded=false 不畫 resume 列；expanded=true 畫 Claude resume 指令（取 sessionId，不是 id）', () => {
    const s = officeSession({ id: 'pane-1', sessionId: 'sess-claude-1', kind: 'claude' })
    const a = render(<SessionRow {...base} session={s} />)
    expect(a.container.querySelector('[data-slot="session-expanded"]')).toBeNull()
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    a.unmount()
    const b = render(<SessionRow {...base} expanded session={s} />)
    const ex = b.container.querySelector('[data-slot="session-expanded"]')!
    expect(within(ex as HTMLElement).getByText('claude --resume sess-claude-1')).toBeInTheDocument()
    expect(cls(ex)).toContain('pl-9')
    expect(b.container.querySelector('[data-slot="session-main"]')).toHaveAttribute('aria-expanded', 'true')
  })

  it('codex 的 resume 指令：codex resume <sessionId>', () => {
    render(<SessionRow {...base} expanded session={officeSession({ kind: 'codex', sessionId: 'rollout-9' })} />)
    expect(screen.getByText('codex resume rollout-9')).toBeInTheDocument()
  })

  it('expanded 時 actions 插槽顯示在 resume 列之後', () => {
    render(<SessionRow {...base} expanded actions={<a href="#x">任務詳情</a>} session={officeSession()} />)
    expect(screen.getByRole('link', { name: '任務詳情' })).toBeInTheDocument()
  })

  it('頭像：名字第一個字（大寫）、avatar-row（size-7）、圓形', () => {
    const { container } = render(<SessionRow {...base} session={officeSession({ member: 'backend' })} />)
    const av = container.querySelector('[data-slot="session-avatar"]')!
    expect(av).toHaveTextContent('B')
    expect(cls(av)).toContain('size-7')
    expect(cls(av)).toContain('rounded-full')
    expect(av).toHaveAttribute('aria-hidden', 'true')
  })
})
