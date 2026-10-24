// dev 專用 40 人 harness：http://localhost:<WEB_PORT>/src/features/office-scene/harness/index.html?n=40&theme=dark
// 不在 build 入口裡（vite build 只吃 apps/web/index.html），不會進正式包。
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { useDashStore } from '@/store'
import OfficeScene from '../OfficeScene'
import { harnessSessions, harnessTasks } from './fixture'

const q = new URLSearchParams(location.search)
const N = Number(q.get('n') ?? 40)
// harness 沒有 SSE：當成已連上（場景讀 store 的 sse 判斷即時與否）
useDashStore.setState({ sse: 'open' })

function Harness() {
  const [theme, setTheme] = useState<'light' | 'dark'>(q.get('theme') === 'dark' ? 'dark' : 'light')
  const [seed, setSeed] = useState(0)
  const [now] = useState(() => Date.now())
  const [sessions, setSessions] = useState(() => harnessSessions(N, now, 0))
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  // ?focus=<id>：模擬帶 focus 開頁（場景掛上時 focusRequest 已存在）
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(() => (q.get('focus') ? { id: q.get('focus')!, nonce: 1 } : null))
  const [reset, setReset] = useState(0)
  const [moved, setMoved] = useState(false)
  const [fallback, setFallback] = useState<string | null>(null)
  const reduced = q.get('reduced') === '1'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  useEffect(() => {
    if (seed > 0) setSessions(harnessSessions(N, now, seed))
  }, [seed, now])
  const btn = 'rounded-lg bg-muted px-3 py-1 text-xs font-semibold'
  return (
    <div className="flex h-svh flex-col gap-2 bg-background p-3 text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">office-scene harness · {N} 人</span>
        <button className={btn} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>主題：{theme}</button>
        <button className={btn} onClick={() => setSeed(seed + 1)}>狀態輪替（即時變化）</button>
        <button className={btn} onClick={() => setFocus({ id: q.get('fly') ?? 'p3', nonce: Date.now() })}>飛到 p3</button>
        <button
          className={btn}
          onClick={() => {
            // 模擬 SSE 斷線 → 重連 → 補抓到一份有變化的 sessions（不該播動作）
            useDashStore.setState({ sse: 'connecting' })
            setTimeout(() => useDashStore.setState({ sse: 'open' }), 300)
            setTimeout(() => setSeed((n) => n + 1), 600)
          }}
        >
          斷線重連
        </button>
        <button className={btn} onClick={() => setReset(reset + 1)}>重設視角{moved ? '（動過）' : ''}</button>
        <span className="text-xs text-muted-foreground">選取：{selected ?? '—'} · fallback：{fallback ?? '—'}</span>
      </div>
      <div data-testid="office-canvas" className="min-h-0 flex-1 overflow-hidden rounded-xl bg-scene-sky">
        <OfficeScene
          sessions={sessions}
          tasks={harnessTasks()}
          selectedId={selected}
          hoveredId={hovered}
          onSelect={setSelected}
          onHover={setHovered}
          focusRequest={focus}
          resetRequest={reset}
          theme={theme}
          reducedMotion={reduced}
          onFallback={setFallback}
          onUserMovedCamera={setMoved}
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
