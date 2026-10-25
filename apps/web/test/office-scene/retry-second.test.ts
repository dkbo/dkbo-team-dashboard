// AC11：第二包載入失敗後「再試 3D」要能恢復（BACKLOG loadScene.ts:5 重檢）——
// 瀏覽器以 URL 記住失敗的 import()，重試必須換 URL 重抓那個失敗的 chunk。
import { describe, expect, it, vi } from 'vitest'
import { retryableImport } from '@/features/office-scene/objects/retry'

const fail = (url: string) => new TypeError(`Failed to fetch dynamically imported module: ${url}`)

describe('retryableImport', () => {
  it('第一次照常 import；失敗後下一次改用帶 t=<次數> 的失敗 URL', async () => {
    const load = vi.fn().mockRejectedValueOnce(fail('http://h/assets/Lobby-1.js'))
    const byUrl = vi.fn().mockResolvedValue({ default: 'ok' })
    const get = retryableImport(load, byUrl)
    await expect(get()).rejects.toThrow()
    await expect(get()).resolves.toEqual({ default: 'ok' })
    expect(load).toHaveBeenCalledTimes(1)
    expect(byUrl).toHaveBeenCalledWith('http://h/assets/Lobby-1.js?t=1')
  })
  it('錯誤訊息拿不到 URL（Safari）：退回原本的 import 再試', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Importing a module script failed.')).mockResolvedValue({ default: 'ok' })
    const byUrl = vi.fn()
    const get = retryableImport(load, byUrl)
    await expect(get()).rejects.toThrow()
    await expect(get()).resolves.toEqual({ default: 'ok' })
    expect(byUrl).not.toHaveBeenCalled()
  })
})
