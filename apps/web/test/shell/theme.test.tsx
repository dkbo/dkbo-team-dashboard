import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/app/theme'

let systemDark = false
let listeners: ((e: { matches: boolean }) => void)[] = []

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  systemDark = false
  listeners = []
  vi.stubGlobal('matchMedia', (q: string) => ({
    get matches() {
      return systemDark
    },
    media: q,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.push(fn),
    removeEventListener: () => {},
  }))
})

const isDark = () => document.documentElement.classList.contains('dark')

describe('主題', () => {
  it('預設跟隨系統，系統切換時跟著變', () => {
    systemDark = true
    render(<ThemeToggle />)
    expect(isDark()).toBe(true)
    act(() => {
      systemDark = false
      listeners.forEach((fn) => fn({ matches: false }))
    })
    expect(isDark()).toBe(false)
    expect(screen.getByRole('button', { name: /主題：跟隨系統/ })).toBeInTheDocument()
  })

  it('手動切換 系統 → 淺色 → 深色 → 系統，並記在 localStorage', async () => {
    const user = userEvent.setup()
    systemDark = true
    render(<ThemeToggle />)
    const btn = () => screen.getByRole('button', { name: /主題/ })
    await user.click(btn())
    expect(btn()).toHaveAccessibleName(/淺色/)
    expect(isDark()).toBe(false)
    expect(localStorage.getItem('dash-theme')).toBe('light')
    await user.click(btn())
    expect(isDark()).toBe(true)
    expect(localStorage.getItem('dash-theme')).toBe('dark')
    await user.click(btn())
    expect(btn()).toHaveAccessibleName(/跟隨系統/)
    expect(isDark()).toBe(true)
  })

  it('讀回已存的偏好', () => {
    localStorage.setItem('dash-theme', 'dark')
    render(<ThemeToggle />)
    expect(isDark()).toBe(true)
  })
})
