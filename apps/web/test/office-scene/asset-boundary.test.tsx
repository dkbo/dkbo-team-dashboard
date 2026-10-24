// review I3 後半：glb 載入失敗後，useLoader（suspend-react）把錯誤快取起來，同一個 url 再 suspend 會直接丟快取的錯，
// 「再試 3D」永遠無效。失敗在 loader 層記下，AssetBoundary 重掛時把失敗的 url 逐個從快取清掉（review4 Important 1：多個一起失敗要一次恢復）。
import { Suspense } from 'react'
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetBoundary } from '@/features/office-scene/AssetBoundary'
import { useGLTF } from '@/features/office-scene/gltf'

const isThenable = (x: unknown) => typeof (x as { then?: unknown })?.then === 'function'
/** useGLTF 在這個 url 上現在的狀態：載入中（丟 promise）、失敗（丟 Error） */
function probe(url: string): 'pending' | 'error' | 'ok' {
  try {
    useGLTF(url)
    return 'ok'
  } catch (e) {
    return isThenable(e) ? 'pending' : 'error'
  }
}

function Model({ url }: { url: string }) {
  useGLTF(url)
  return null
}

let fetchSpy: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => vi.unstubAllGlobals())

describe('AssetBoundary', () => {
  it('glb 載入失敗：通知 onError；重掛 AssetBoundary（再試 3D）時失敗的 url 清出快取、重新下載', async () => {
    const url = 'http://localhost/office/missing-a.glb'
    const onError = vi.fn()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tree = (cb: () => void) => (
      <AssetBoundary onError={cb}>
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
      </AssetBoundary>
    )
    const first = render(tree(onError))
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    first.unmount()
    const before = fetchSpy.mock.calls.length
    render(tree(vi.fn()))
    // 快取已清：再要同一個 url 是重新載入（pending），不是丟出快取的舊錯
    expect(probe(url)).toBe('pending')
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(before))
    err.mockRestore()
  })

  it('網路恢復後重試：同一個 url 重新載入成功，不再丟出舊錯', async () => {
    const url = 'http://localhost/office/missing-b.glb'
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    const first = render(
      <AssetBoundary onError={onError}>
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
      </AssetBoundary>,
    )
    await waitFor(() => expect(onError).toHaveBeenCalled())
    first.unmount()
    // 網路回來了：最小的合法 glTF（JSON 文字）
    fetchSpy.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ asset: { version: '2.0' } }))))
    const onError2 = vi.fn()
    render(
      <AssetBoundary onError={onError2}>
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
      </AssetBoundary>,
    )
    await waitFor(() => expect(probe(url)).toBe('ok'))
    err.mockRestore()
    expect(onError2).not.toHaveBeenCalled()
  })

  it('多個 glb 一起失敗（斷線）：再試一次就全部恢復，含晚一步才失敗、沒被 render 到的 url', async () => {
    const urls = ['a', 'b', 'c', 'd'].map((n) => `http://localhost/office/multi-${n}.glb`)
    // 前三個立刻失敗；最後一個晚一步失敗 —— 那時 AssetBoundary 早已接到第一個錯誤
    let lateReject = () => {}
    const late = new Promise<void>((res) => (lateReject = res))
    fetchSpy.mockImplementation((req: Request | string) =>
      String(typeof req === 'string' ? req : req.url).endsWith('multi-d.glb')
        ? late.then(() => Promise.reject(new TypeError('Failed to fetch')))
        : Promise.reject(new TypeError('Failed to fetch')),
    )
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const tree = (onError: () => void) => (
      <AssetBoundary onError={onError}>
        {urls.map((u) => (
          <Suspense key={u} fallback={null}>
            <Model url={u} />
          </Suspense>
        ))}
      </AssetBoundary>
    )
    const onError = vi.fn()
    const first = render(tree(onError))
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    lateReject()
    // 等四個 url 的錯誤都落進載入快取
    await waitFor(() => expect(urls.map(probe)).toEqual(['error', 'error', 'error', 'error']))
    first.unmount()
    // 網路回來，使用者按一次「再試 3D」＝重掛一次
    fetchSpy.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ asset: { version: '2.0' } }))))
    const onError2 = vi.fn()
    render(tree(onError2))
    await waitFor(() => expect(urls.map(probe)).toEqual(['ok', 'ok', 'ok', 'ok']))
    err.mockRestore()
    expect(onError2).not.toHaveBeenCalled()
  })
})
