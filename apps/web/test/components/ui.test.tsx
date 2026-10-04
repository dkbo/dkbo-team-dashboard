// AC1：shadcn 原子元件只改 token 層面（radius、字重、spacing、density）
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const cls = (el: Element) => el.getAttribute('class') ?? ''

describe('Card', () => {
  it('default 間距 5（card-pad）、header↔內容 gap-4；sm 間距 4、gap-3；CardTitle title-sm（font-bold）', () => {
    render(
      <>
        <Card data-testid="c1">
          <CardTitle>標題</CardTitle>
        </Card>
        <Card data-testid="c2" size="sm" />
      </>,
    )
    const c1 = screen.getByTestId('c1')
    expect(cls(c1)).toContain('[--card-spacing:--spacing(5)]')
    expect(cls(c1)).toContain('gap-4')
    expect(cls(c1)).toContain('data-[size=sm]:[--card-spacing:--spacing(4)]')
    expect(cls(c1)).toContain('data-[size=sm]:gap-3')
    expect(cls(screen.getByText('標題'))).toMatch(/\bfont-bold\b/)
    expect(cls(screen.getByText('標題'))).not.toMatch(/\bfont-medium\b/)
  })

  it('variant="pane"：padding 0、gap 0、直排；data-alert 對應 ring-alert-*', () => {
    render(
      <>
        <Card data-testid="pane" variant="pane" />
        <Card data-testid="d" data-alert="danger" />
        <Card data-testid="w" data-alert="warn" />
      </>,
    )
    const pane = screen.getByTestId('pane')
    expect(pane).toHaveAttribute('data-variant', 'pane')
    expect(cls(pane)).toMatch(/\bgap-0\b/)
    expect(cls(pane)).toMatch(/\bp-0\b/)
    expect(cls(screen.getByTestId('d'))).toContain('data-[alert=danger]:ring-status-danger')
    expect(cls(screen.getByTestId('w'))).toContain('data-[alert=warn]:ring-status-warn')
    expect(cls(screen.getByTestId('d'))).toContain('data-[alert=danger]:ring-2')
  })

  it('CardFooter 不自己寫單邊圓角（由卡片 overflow-hidden 裁）', () => {
    render(<CardFooter data-testid="f" />)
    expect(cls(screen.getByTestId('f'))).not.toMatch(/rounded-b/)
  })
})

describe('Badge／Button', () => {
  it('Badge rounded-full', () => {
    render(<Badge>v0.19.0</Badge>)
    expect(cls(screen.getByText('v0.19.0'))).toMatch(/\brounded-full\b/)
    expect(cls(screen.getByText('v0.19.0'))).not.toMatch(/rounded-4xl/)
  })

  it.each(['xs', 'sm', 'default', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const)('Button %s rounded-full、無 rounded-[..]', (size) => {
    render(<Button size={size}>b</Button>)
    const b = screen.getByRole('button')
    expect(cls(b)).toMatch(/\brounded-full\b/)
    expect(cls(b)).not.toMatch(/rounded-\[/)
    expect(cls(b)).not.toMatch(/\brounded-lg\b/)
  })

  it('Button sm 用 body-strong（text-sm font-semibold），不再 text-[0.8rem]；focus-ring 與 disabled', () => {
    render(<Button size="sm">b</Button>)
    const b = screen.getByRole('button')
    expect(cls(b)).toMatch(/\btext-sm\b/)
    expect(cls(b)).toMatch(/\bfont-semibold\b/)
    expect(cls(b)).not.toContain('text-[0.8rem]')
    expect(cls(b)).toContain('focus-visible:ring-3')
    expect(cls(b)).toContain('focus-visible:ring-ring/50')
    expect(cls(b)).toContain('disabled:opacity-50')
    expect(cls(b)).toContain('cursor-pointer')
  })

  it('Button 尺寸照規格：xs pill（h-6 px-2.5 caption-strong）、default h-8 px-4、lg h-9 px-5', () => {
    render(
      <>
        <Button size="xs">xs</Button>
        <Button>md</Button>
        <Button size="lg">lg</Button>
      </>,
    )
    expect(cls(screen.getByText('xs'))).toMatch(/\bh-6\b/)
    expect(cls(screen.getByText('xs'))).toMatch(/\bpx-2\.5\b/)
    expect(cls(screen.getByText('xs'))).toMatch(/\btext-xs\b/)
    expect(cls(screen.getByText('md'))).toMatch(/\bpx-4\b/)
    expect(cls(screen.getByText('lg'))).toMatch(/\bpx-5\b/)
  })
})

describe('Table density', () => {
  function T({ density }: { density?: 'default' | 'dense' }) {
    return (
      <Table density={density} data-testid="t">
        <TableHeader>
          <TableRow data-testid="hr">
            <TableHead>欄</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow data-testid="r">
            <TableCell>值</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  it('default：表頭 h-10、列 h-11、th caption-bold muted、cell-x px-3、hover-row', () => {
    render(<T />)
    expect(screen.getByTestId('t')).toHaveAttribute('data-density', 'default')
    const th = screen.getByText('欄')
    expect(cls(th)).toMatch(/\bpx-3\b/)
    expect(cls(th)).toMatch(/\btext-xs\b/)
    expect(cls(th)).toMatch(/\bfont-bold\b/)
    expect(cls(th)).toMatch(/\btext-muted-foreground\b/)
    expect(cls(screen.getByText('值'))).toMatch(/\bpx-3\b/)
    const t = cls(screen.getByTestId('t'))
    expect(t).toContain('[&_tbody_tr]:h-11')
    expect(t).toContain('[&_thead_tr]:h-10')
    expect(cls(screen.getByTestId('r'))).toContain('hover:bg-muted/60')
  })

  it('dense：表頭與列都 h-9', () => {
    render(<T density="dense" />)
    expect(screen.getByTestId('t')).toHaveAttribute('data-density', 'dense')
    const t = cls(screen.getByTestId('t'))
    expect(t).toContain('[&_tbody_tr]:h-9')
    expect(t).toContain('[&_thead_tr]:h-9')
  })
})

describe('Skeleton', () => {
  it('radius-lg、bg-muted、motion-pulse＋motion-reduce', () => {
    render(<Skeleton data-testid="s" />)
    const c = cls(screen.getByTestId('s'))
    expect(c).toMatch(/\brounded-lg\b/)
    expect(c).toContain('animate-pulse')
    expect(c).toContain('motion-reduce:animate-none')
  })
})

describe('select.tsx', () => {
  it('不再有 rounded-[min(..)]，改規格 radius token', () => {
    const src = readFileSync(path.resolve(import.meta.dirname, '../../src/components/ui/select.tsx'), 'utf8')
    expect(src).not.toMatch(/rounded-\[/)
  })
})
