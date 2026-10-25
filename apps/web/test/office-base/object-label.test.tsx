// lobby AC3：ObjectLabel（§5.3、§6.14）—— density full／compact／alert-only、yielded none／dot／hidden、異常框、點擊與 a11y
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Activity } from 'lucide-react'
import { ObjectLabel, type ObjectLabelProps } from '@/components/app/office/ObjectLabel'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const root = (c: HTMLElement) => c.querySelector('[data-slot="object-label"]')!
const base: ObjectLabelProps = {
  icon: Activity,
  page: 'herdr',
  value: '14',
  unit: '個 pane',
  density: 'full',
  href: '/herdr',
}
const chip = { label: '2 個卡住', tone: 'danger' as const }

describe('ObjectLabel · full', () => {
  it('膠囊：h-7、px-3、rounded-full、bg-popover、shadow-soft；圖示 text-brand-violet；頁名＋主數字＋單位', () => {
    const { container } = render(<ObjectLabel {...base} />)
    const el = root(container).querySelector('[data-slot="object-label-pill"]')!
    for (const c of ['h-7', 'px-3', 'gap-1.5', 'rounded-full', 'bg-popover', 'shadow-soft']) expect(cls(el)).toContain(c)
    expect(cls(container.querySelector('svg.lucide-activity'))).toContain('text-brand-violet')
    expect(el).toHaveTextContent('herdr')
    expect(el).toHaveTextContent('14')
    expect(el).toHaveTextContent('個 pane')
  })

  it('是 <a href>，data-density／data-tone 供場景量測', () => {
    const { container } = render(<ObjectLabel {...base} chip={chip} lamp="danger" />)
    expect(root(container).tagName).toBe('A')
    expect(root(container)).toHaveAttribute('href', '/herdr')
    expect(root(container)).toHaveAttribute('data-density', 'full')
    expect(root(container)).toHaveAttribute('data-tone', 'danger')
  })

  it('chip 一律畫（Tag 變體照 tone）', () => {
    const { container, rerender } = render(<ObjectLabel {...base} chip={{ label: '今日 +3', tone: 'neutral' }} />)
    expect(container.querySelector('[data-slot="tag"]')).toHaveAttribute('data-variant', 'neutral')
    rerender(<ObjectLabel {...base} chip={{ label: '1 個未推送', tone: 'warn' }} />)
    expect(container.querySelector('[data-slot="tag"]')).toHaveAttribute('data-variant', 'warn')
  })

  it('燈：lamp 給了才畫 StatusDot（tone 對應）；沒給不畫', () => {
    const { container, rerender } = render(<ObjectLabel {...base} lamp="ok" />)
    expect(container.querySelector('[data-slot="status-dot"]')).toHaveAttribute('data-tone', 'ok')
    rerender(<ObjectLabel {...base} lamp="warn" />)
    expect(container.querySelector('[data-slot="status-dot"]')).toHaveAttribute('data-tone', 'warn')
    rerender(<ObjectLabel {...base} lamp={null} />)
    expect(container.querySelector('[data-slot="status-dot"]')).toBeNull()
  })
})

describe('ObjectLabel · 異常框', () => {
  it('chip danger／warn 或 lamp danger／warn → border-(length:--border-w-pill) border-status-X，底不變', () => {
    const { container, rerender } = render(<ObjectLabel {...base} chip={chip} />)
    const pill = () => container.querySelector('[data-slot="object-label-pill"]')!
    expect(cls(pill())).toContain('border-(length:--border-w-pill)')
    expect(cls(pill())).toContain('border-status-danger')
    expect(cls(pill())).toContain('bg-popover')
    rerender(<ObjectLabel {...base} lamp="warn" />)
    expect(cls(pill())).toContain('border-status-warn')
    rerender(<ObjectLabel {...base} lamp="warn" chip={chip} />)
    expect(cls(pill())).toContain('border-status-danger') // danger 優先
  })

  it('正常（沒有 chip、lamp ok／null、neutral chip）不加狀態框', () => {
    const { container } = render(<ObjectLabel {...base} lamp="ok" chip={{ label: '今日 +3', tone: 'neutral' }} />)
    expect(cls(container.querySelector('[data-slot="object-label-pill"]'))).not.toContain('border-status')
    expect(root(container)).not.toHaveAttribute('data-tone')
  })
})

describe('ObjectLabel · compact', () => {
  it('只有圖示＋主數字：不寫頁名與單位', () => {
    const { container } = render(<ObjectLabel {...base} density="compact" />)
    const pill = container.querySelector('[data-slot="object-label-pill"]')!
    expect(pill).toHaveTextContent('14')
    expect(pill).not.toHaveTextContent('herdr')
    expect(pill).not.toHaveTextContent('個 pane')
    expect(container.querySelector('svg.lucide-activity')).not.toBeNull()
  })

  it('有異常（danger／warn）才加 chip；neutral chip 不畫', () => {
    const { container, rerender } = render(<ObjectLabel {...base} density="compact" chip={chip} />)
    expect(container.querySelector('[data-slot="tag"]')).toHaveTextContent('2 個卡住')
    rerender(<ObjectLabel {...base} density="compact" chip={{ label: '今日 +3', tone: 'neutral' }} />)
    expect(container.querySelector('[data-slot="tag"]')).toBeNull()
  })
})

describe('ObjectLabel · alert-only', () => {
  it('有異常：照 compact 畫', () => {
    const { container } = render(<ObjectLabel {...base} density="alert-only" chip={chip} />)
    expect(cls(root(container))).not.toContain('sr-only')
    expect(container.querySelector('[data-slot="tag"]')).not.toBeNull()
  })

  it('沒有異常：視覺隱藏（sr-only）但仍在 tab 順序裡，focus 時顯示', () => {
    const { container } = render(<ObjectLabel {...base} density="alert-only" lamp="ok" />)
    expect(cls(root(container))).toContain('sr-only')
    expect(cls(root(container))).toContain('focus-visible:not-sr-only')
    expect(root(container)).not.toHaveAttribute('tabindex', '-1')
  })
})

describe('ObjectLabel · yielded（碰撞讓位）', () => {
  it('none：正常膠囊', () => {
    const { container } = render(<ObjectLabel {...base} yielded="none" />)
    expect(container.querySelector('[data-slot="object-label-pill"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="object-label-dot"]')).toBeNull()
  })

  it('dot：縮成 size-3 圓、bg-popover、2px 框＝異常語意色；無異常用 border', () => {
    const { container, rerender } = render(<ObjectLabel {...base} yielded="dot" chip={chip} />)
    const dot = () => container.querySelector('[data-slot="object-label-dot"]')!
    for (const c of ['size-3', 'rounded-full', 'bg-popover', 'border-2', 'border-status-danger']) expect(cls(dot())).toContain(c)
    expect(container.querySelector('[data-slot="object-label-pill"]')).toBeNull()
    rerender(<ObjectLabel {...base} yielded="dot" />)
    expect(cls(dot())).toContain('border-border')
  })

  it('dot 與 hidden 仍是可聚焦的連結，aria-label 不變', () => {
    const { container, rerender } = render(<ObjectLabel {...base} yielded="dot" />)
    expect(root(container)).toHaveAttribute('aria-label', 'herdr：14 個 pane，開 herdr 頁')
    rerender(<ObjectLabel {...base} yielded="hidden" />)
    expect(cls(root(container))).toContain('sr-only')
    expect(root(container)).toHaveAttribute('aria-label', 'herdr：14 個 pane，開 herdr 頁')
    expect(root(container)).toHaveAttribute('data-yielded', 'hidden')
  })
})

describe('ObjectLabel · 指向三角與錨點', () => {
  it('above：三角在膠囊下方；below：在上方（data-placement）', () => {
    const { container, rerender } = render(<ObjectLabel {...base} placement="above" />)
    const kids = () => [...root(container).children].map((c) => c.getAttribute('data-slot'))
    expect(kids()).toEqual(['object-label-pill', 'object-label-pointer'])
    rerender(<ObjectLabel {...base} placement="below" />)
    expect(kids()).toEqual(['object-label-pointer', 'object-label-pill'])
    expect(root(container)).toHaveAttribute('data-placement', 'below')
  })

  it('三角色同框：有異常 stroke-status-X，無框 stroke-popover；填 popover', () => {
    const { container, rerender } = render(<ObjectLabel {...base} chip={chip} />)
    const ptr = () => container.querySelector('[data-slot="object-label-pointer"]')!
    expect(cls(ptr())).toContain('stroke-status-danger')
    expect(cls(ptr())).toContain('fill-popover')
    rerender(<ObjectLabel {...base} />)
    expect(cls(ptr())).toContain('stroke-popover')
  })

  it('align end／start：標籤往內推，data-align 供場景定位', () => {
    const { container, rerender } = render(<ObjectLabel {...base} align="end" />)
    expect(root(container)).toHaveAttribute('data-align', 'end')
    expect(cls(root(container))).toContain('items-end')
    rerender(<ObjectLabel {...base} align="start" />)
    expect(cls(root(container))).toContain('items-start')
    rerender(<ObjectLabel {...base} />)
    expect(root(container)).toHaveAttribute('data-align', 'center')
    expect(cls(root(container))).toContain('items-center')
  })
})

describe('ObjectLabel · 互動與 a11y', () => {
  it('aria-label：「頁名：數字 單位，chip，開 頁名 頁」', () => {
    render(<ObjectLabel {...base} chip={chip} />)
    expect(screen.getByRole('link', { name: 'herdr：14 個 pane，2 個卡住，開 herdr 頁' })).toBeInTheDocument()
  })

  it('label prop 覆寫 aria-label', () => {
    render(<ObjectLabel {...base} label="自訂說明" />)
    expect(screen.getByRole('link', { name: '自訂說明' })).toBeInTheDocument()
  })

  it('左鍵點擊：preventDefault 並呼叫 onOpen(href)', () => {
    const onOpen = vi.fn()
    render(<ObjectLabel {...base} onOpen={onOpen} />)
    const notPrevented = fireEvent.click(screen.getByRole('link'))
    expect(onOpen).toHaveBeenCalledWith('/herdr')
    expect(notPrevented).toBe(false)
  })

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }])('修飾鍵／中鍵 %o：交給瀏覽器，不呼叫 onOpen', (mod) => {
    const onOpen = vi.fn()
    render(<ObjectLabel {...base} onOpen={onOpen} />)
    const notPrevented = fireEvent.click(screen.getByRole('link'), mod)
    expect(onOpen).not.toHaveBeenCalled()
    expect(notPrevented).toBe(true)
  })

  it('沒給 onOpen：不攔截，走原生 href', () => {
    render(<ObjectLabel {...base} />)
    expect(fireEvent.click(screen.getByRole('link'))).toBe(true)
  })

  it('hover／focus 進出通知 onActiveChange（場景據此描邊）', () => {
    const onActiveChange = vi.fn()
    render(<ObjectLabel {...base} onActiveChange={onActiveChange} />)
    const a = screen.getByRole('link')
    fireEvent.mouseEnter(a)
    expect(onActiveChange).toHaveBeenLastCalledWith(true)
    fireEvent.mouseLeave(a)
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
    fireEvent.focus(a)
    expect(onActiveChange).toHaveBeenLastCalledWith(true)
    fireEvent.blur(a)
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
  })

  it('focus ring、cursor-pointer、title（Tooltip 內容）', () => {
    const { container } = render(<ObjectLabel {...base} chip={chip} />)
    for (const c of ['cursor-pointer', 'outline-none', 'focus-visible:ring-3', 'focus-visible:ring-ring/50']) expect(cls(root(container))).toContain(c)
    expect(root(container)).toHaveAttribute('title', '開 herdr 頁 · 14 個 pane、2 個卡住')
  })

  it('empty（沒資料）：整體 60%，數字照給（呼叫端傳「—」）', () => {
    const { container } = render(<ObjectLabel {...base} value="—" unit="herdr 離線" empty />)
    expect(cls(root(container))).toContain('opacity-60')
    expect(root(container)).toHaveTextContent('—')
  })

  it('chip.icon 字串走內建對照；未知名稱不畫圖示也不壞', () => {
    const { container, rerender } = render(<ObjectLabel {...base} chip={{ ...chip, icon: 'alert' }} />)
    expect(container.querySelector('[data-slot="tag"] svg')).not.toBeNull()
    rerender(<ObjectLabel {...base} chip={{ ...chip, icon: 'no-such-icon' }} />)
    expect(container.querySelector('[data-slot="tag"] svg')).toBeNull()
  })
})
