import { useEffect, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'dash-theme'
const ORDER: ThemePref[] = ['system', 'light', 'dark']
const LABEL: Record<ThemePref, string> = { system: '跟隨系統', light: '淺色', dark: '深色' }
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

function writePref(p: ThemePref) {
  try {
    if (p === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch {
    // 儲存被擋時只在本次生效
  }
  listeners.forEach((fn) => fn())
}

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** 依偏好（system 時看系統）設定 <html> 的 .dark；main.tsx 在渲染前先呼叫一次避免閃爍。 */
export function applyTheme(pref: ThemePref = readPref()) {
  const dark = pref === 'dark' || (pref === 'system' && systemQuery().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(subscribe, readPref, () => 'system' as ThemePref)
  return [pref, writePref]
}

/** 套用主題並跟著系統切換；頂部列的 ThemeToggle 內含此 hook。 */
export function useApplyTheme(pref: ThemePref) {
  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = systemQuery()
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])
}

export function ThemeToggle() {
  const [pref, setPref] = useThemePref()
  useApplyTheme(pref)
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]
  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`主題：${LABEL[pref]}（按一下切換為${LABEL[next]}）`}
      title={`主題：${LABEL[pref]}`}
      onClick={() => setPref(next)}
    >
      <Icon />
    </Button>
  )
}
