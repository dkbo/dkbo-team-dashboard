// AC1：index.css 照規格 §How to use C 段逐項出現（不刪舊名）
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.resolve(import.meta.dirname, '../../src/index.css'), 'utf8')

/** 取出第一個符合 selector 的區塊內文（不含巢狀） */
function block(selector: string): string {
  const i = css.indexOf(`${selector} {`)
  if (i < 0) return ''
  const start = css.indexOf('{', i) + 1
  return css.slice(start, css.indexOf('}', start))
}

const has = (src: string, name: string, value?: string) => {
  const m = src.match(new RegExp(`${name.replace(/[-/]/g, '\\$&')}\\s*:\\s*([^;]+);`))
  if (!m) return false
  return value == null || m[1].trim() === value
}

const STATUS_LIGHT: Record<string, [string, string, string]> = {
  danger: ['#e0434f', '#c62a44', '#fbe5e6'],
  warn: ['#b07800', '#8a5300', '#fcf2e0'],
  ok: ['#1a9a74', '#0f7a5a', '#e1f5ef'],
  idle: ['#7a7fa8', '#565b82', '#efeff5'],
  info: ['#7b5cff', '#5b3fd9', '#ede8ff'],
}
const STATUS_DARK: Record<string, [string, string, string]> = {
  danger: ['#ff6b7f', '#ff8a9a', '#46345b'],
  warn: ['#e9a520', '#ffc76b', '#433c4e'],
  ok: ['#2cb68a', '#5fdcae', '#293e5c'],
  idle: ['#7d82b0', '#aeb2dc', '#343762'],
  info: ['#7b5cff', '#b9a8ff', '#34326d'],
}

describe('index.css token（規格 §How to use C）', () => {
  const root = block(':root')
  const dark = block('.dark')

  it('新增 :root／.dark 狀態色 15 個 × 2 套', () => {
    for (const [k, [solid, fg, soft]] of Object.entries(STATUS_LIGHT)) {
      expect(has(root, `--status-${k}`, solid), `:root --status-${k}`).toBe(true)
      expect(has(root, `--status-${k}-fg`, fg), `:root --status-${k}-fg`).toBe(true)
      expect(has(root, `--status-${k}-soft`, soft), `:root --status-${k}-soft`).toBe(true)
    }
    for (const [k, [solid, fg, soft]] of Object.entries(STATUS_DARK)) {
      expect(has(dark, `--status-${k}`, solid), `.dark --status-${k}`).toBe(true)
      expect(has(dark, `--status-${k}-fg`, fg), `.dark --status-${k}-fg`).toBe(true)
      expect(has(dark, `--status-${k}-soft`, soft), `.dark --status-${k}-soft`).toBe(true)
    }
  })

  it('新增 :root 漸層、終端、on-color、版面與尺寸變數', () => {
    const want: [string, string][] = [
      ['--grad-ok-from', '#157f5f'], ['--grad-ok-to', '#0e6b50'],
      ['--grad-warn-from', '#a05f00'], ['--grad-warn-to', '#7a4400'],
      ['--terminal-bg', '#0b0b10'], ['--terminal-chrome', '#17171f'], ['--terminal-line', '#26262f'],
      ['--terminal-fg', '#e4e4e7'], ['--terminal-dim', '#8b8b96'],
      ['--on-color', '#ffffff'],
      ['--rail-w', '20rem'], ['--aside-w', '22.5rem'], ['--sidebar-w', '16rem'], ['--detail-w', '22rem'],
      ['--chart-h-sm', '11rem'], ['--chart-h-md', '14rem'], ['--chart-h-lg', '16rem'],
      ['--border-w-pill', '1.5px'], ['--step-line-h', '0.1875rem'], ['--thumb-lines', '10'],
      ['--thumb-h', 'calc(var(--thumb-lines) * var(--leading-terminal) * 1em + 0.5rem)'],
      ['--tool-h', 'calc(100svh - var(--topbar-h))'],
      ['--rail-top', 'calc(var(--topbar-h) + 1.5rem)'],
      ['--rail-max-h', 'calc(100svh - var(--topbar-h) - 3rem)'],
      ['--pane-max-h-sm', '70svh'],
    ]
    for (const [n, v] of want) expect(has(root, n, v), `:root ${n}`).toBe(true)
  })

  it('≥ xl 改 --sidebar-w／--detail-w', () => {
    expect(css).toMatch(/@media \(min-width: 80rem\)\s*\{\s*:root\s*\{[^}]*--sidebar-w:\s*18rem;[^}]*--detail-w:\s*26rem;/)
  })

  it('新增別名 grad-danger／grad-brand', () => {
    expect(has(root, '--grad-danger-from', 'var(--grad-coral-from)')).toBe(true)
    expect(has(root, '--grad-danger-to', 'var(--grad-coral-to)')).toBe(true)
    expect(has(root, '--grad-brand-from', 'var(--grad-violet-from)')).toBe(true)
    expect(has(root, '--grad-brand-to', 'var(--grad-violet-to)')).toBe(true)
  })

  it('新增 @theme inline（B 段）', () => {
    const theme = block('@theme inline')
    for (const k of ['danger', 'warn', 'ok', 'idle', 'info'])
      for (const s of ['', '-fg', '-soft']) expect(has(theme, `--color-status-${k}${s}`, `var(--status-${k}${s})`), `${k}${s}`).toBe(true)
    for (const k of ['bg', 'chrome', 'line', 'fg', 'dim']) expect(has(theme, `--color-terminal-${k}`, `var(--terminal-${k})`)).toBe(true)
    expect(has(theme, '--text-2xs', '0.6875rem')).toBe(true)
    expect(has(theme, '--text-2xs--line-height', '1rem')).toBe(true)
    expect(has(theme, '--leading-terminal', '1.2')).toBe(true)
    expect(has(theme, '--container-page', '96rem')).toBe(true)
  })

  it('改值：--destructive 指向 status-danger-fg；--topbar-h 預設 3.5rem', () => {
    expect(has(root, '--destructive', 'var(--status-danger-fg)')).toBe(true)
    expect(has(dark, '--destructive', 'var(--status-danger-fg)')).toBe(true)
    expect(has(root, '--topbar-h', '3.5rem')).toBe(true)
  })

  it('不刪舊名（品牌色、舊漸層、chart）', () => {
    for (const n of ['--brand-blue', '--brand-violet', '--brand-coral', '--grad-blue-from', '--grad-violet-from', '--grad-coral-from', '--chart-1'])
      expect(has(root, n), n).toBe(true)
  })
})
