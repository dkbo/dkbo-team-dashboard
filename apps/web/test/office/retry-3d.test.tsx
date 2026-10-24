import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { retryUrl } from '@/features/office/loadScene'
import { resetDashStore, useDashStore } from '@/store/store'
import { officeSession, overview, sessionsDoc } from '../shell/builders'

// 「再試 3D」：瀏覽器的 module map 以 URL 記住失敗的 import()，同一個 URL 再 import 不會發請求、直接重丟（qa b3 探測）。
// 假 loadScene 照這個行為：網路斷時失敗的 URL 永遠失敗，只有換了 URL（cache-bust）才會真的重抓。
const BASE = 'http://localhost:5273/src/features/office-scene/OfficeScene.tsx'
const h = vi.hoisted(() => ({
  networkDown: false,
  failed: new Set<string>(),
  requests: [] as string[],
  onFallback: null as ((r: 'assets') => void) | null,
}))

vi.mock('@/features/office/loadScene', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/office/loadScene')>()),
  loadScene: async (url?: string) => {
    const u = url ?? BASE
    if (h.failed.has(u)) throw new TypeError(`Failed to fetch dynamically imported module: ${u}`)
    h.requests.push(u)
    if (h.networkDown) {
      h.failed.add(u)
      throw new TypeError(`Failed to fetch dynamically imported module: ${u}`)
    }
    return {
      default: (p: { onFallback(r: 'assets'): void }) => {
        h.onFallback = p.onFallback
        return <div data-testid="fake-scene" />
      },
    }
  },
}))
vi.mock('@/features/office/webgl', () => ({ hasWebGL: () => true }))
vi.setConfig({ testTimeout: 15_000 })

async function renderOffice() {
  const { default: OfficePage } = await import('@/pages/office/OfficePage')
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/office']}>
        <Routes>
          <Route path="/office" element={<OfficePage />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )
}

const banner = () => screen.getByTestId('office-fallback-banner')

beforeEach(() => {
  resetDashStore()
  h.networkDown = false
  h.failed.clear()
  h.requests = []
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: /min-width/.test(q), addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useDashStore.setState({ overview: overview({ projects: [], agents: [] }), sessions: sessionsDoc([officeSession()]) })
})
afterEach(() => vi.unstubAllGlobals())

describe('retryUrl', () => {
  it('從 Chromium／Firefox 的錯誤訊息取出失敗的模組 URL，加上 t=第幾次', () => {
    expect(retryUrl(new TypeError(`Failed to fetch dynamically imported module: ${BASE}`), 1)).toBe(`${BASE}?t=1`)
    expect(retryUrl(new TypeError('error loading dynamically imported module: http://x/assets/OfficeScene-AbC.js'), 2)).toBe('http://x/assets/OfficeScene-AbC.js?t=2')
    // 已經是 cache-bust 過的 URL：換掉 t，不疊加
    expect(retryUrl(new TypeError(`Failed to fetch dynamically imported module: ${BASE}?t=1`), 2)).toBe(`${BASE}?t=2`)
  })

  it('不是模組載入失敗（場景 render 丟錯、訊息裡沒 URL）→ null', () => {
    expect(retryUrl(new Error('Could not load http://x/office/char.glb'), 1)).toBeNull()
    expect(retryUrl(new TypeError('Importing a module script failed.'), 1)).toBeNull()
    expect(retryUrl('boom', 1)).toBeNull()
  })
})

// 順序有意義：場景 lazy 是模組層的，失敗後才重建；第一個測試讓它失敗，後面的測試拿到的是重建後那份
describe('再試 3D', () => {
  it('3D chunk 載入失敗 → Banner；網路恢復後按「再試 3D」換 URL 真的重抓，場景出現', async () => {
    h.networkDown = true
    await renderOffice()
    await waitFor(() => expect(banner()).toHaveAttribute('data-reason', 'assets'))

    // 還沒恢復就按：換了 URL 也失敗，Banner 還在
    await userEvent.click(screen.getByRole('button', { name: /再試 3D/ }))
    await waitFor(() => expect(banner()).toHaveAttribute('data-reason', 'assets'))

    h.networkDown = false
    await userEvent.click(screen.getByRole('button', { name: /再試 3D/ }))
    expect(await screen.findByTestId('fake-scene')).toBeInTheDocument()
    expect(screen.queryByTestId('office-fallback-banner')).toBeNull()
    expect(h.requests).toEqual([BASE, `${BASE}?t=1`, `${BASE}?t=2`])
  })

  it('場景自己回報素材失敗（glb）：原地重掛，不重抓 chunk', async () => {
    await renderOffice()
    await screen.findByTestId('fake-scene')
    const before = h.requests.length
    act(() => h.onFallback!('assets'))
    await userEvent.click(screen.getByRole('button', { name: /再試 3D/ }))
    expect(await screen.findByTestId('fake-scene')).toBeInTheDocument()
    expect(h.requests.length).toBe(before)
  })
})
