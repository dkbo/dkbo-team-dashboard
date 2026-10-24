import { useEffect, useState, useSyncExternalStore } from 'react'

const mq = (q: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null)

/** matchMedia 的訂閱版；沒有 matchMedia（舊環境）時回 fallback */
export function useMedia(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = mq(query)
      m?.addEventListener?.('change', fn)
      return () => m?.removeEventListener?.('change', fn)
    },
    () => mq(query)?.matches ?? fallback,
    () => fallback,
  )
}

/** <html> 目前是不是 .dark（ThemeToggle 與系統切換都改這個 class） */
export function useHtmlTheme(): 'light' | 'dark' {
  const read = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  const [theme, setTheme] = useState<'light' | 'dark'>(read)
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(read()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

/** localStorage 存一個布林偏好；讀寫失敗就只在本次生效 */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void, boolean] {
  const read = (): boolean | null => {
    try {
      const v = localStorage.getItem(key)
      return v === '1' ? true : v === '0' ? false : null
    } catch {
      return null
    }
  }
  const [stored, setStored] = useState<boolean | null>(read)
  const set = (v: boolean) => {
    setStored(v)
    try {
      localStorage.setItem(key, v ? '1' : '0')
    } catch {
      // 無痕或封鎖儲存
    }
  }
  return [stored ?? initial, set, stored != null]
}
