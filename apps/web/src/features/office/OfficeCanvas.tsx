import { Component, lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { SearchX, X } from 'lucide-react'
import { EmptyState } from '@/components/app/EmptyState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { loadScene, retryUrl } from './loadScene'
import type { OfficeSceneProps } from './sceneTypes'

// memo：頁面每秒更新計時，props 沒變就不重渲染場景（避免無謂的 invalidate）
const makeScene = (url?: string) => memo(lazy(() => loadScene(url)))
// React.lazy 會永久記住 rejected；失敗後重建，下一次掛載（再試 3D）才會重新 import()。沒失敗就沿用，切清單再切回來不會閃載入中。
// 瀏覽器也以 URL 記住失敗的 import()，所以 chunk 載入失敗時換成 cache-bust 的 URL；不是載入失敗（場景 render 丟錯）就沿用目前能載的 URL。
let sceneUrl: string | undefined
let attempts = 0
let OfficeScene = makeScene()

/** lazy import 失敗（chunk 404、模型壞掉丟例外）→ 當成素材載入失敗，交給頁面切清單 */
class SceneBoundary extends Component<{ onError(): void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    sceneUrl = retryUrl(error, ++attempts) ?? sceneUrl
    OfficeScene = makeScene(sceneUrl)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** §6.11 3D 載入中：地板菱形 Skeleton＋字（chunk 下載期間；模型載入進度由場景自己處理） */
function SceneLoading({ onList }: { onList(): void }) {
  return (
    <div data-testid="office-loading" className="absolute inset-0 grid place-items-center bg-scene-sky">
      <div className="flex flex-col items-center gap-3">
        <div aria-hidden className="size-40 rotate-45 scale-y-60 rounded-xl border border-border bg-muted/60 motion-safe:animate-pulse" />
        <p className="text-sm font-bold">載入辦公室 3D 場景…</p>
        <p className="text-xs text-muted-foreground">
          等待期間可切到
          <button type="button" onClick={onList} className="cursor-pointer rounded-sm font-semibold text-link-fg outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            清單
          </button>
        </p>
      </div>
    </div>
  )
}

/** 寬度（找人清單預設展開門檻 1200 用）；沒有 ResizeObserver 時當成夠寬 */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(Number.POSITIVE_INFINITY)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export interface OfficeCanvasProps {
  scene: OfficeSceneProps
  /** 左上（找人清單）；拿到 canvas 寬度決定預設收合 */
  finder: (width: number) => ReactNode
  topRight?: ReactNode
  bottomLeft?: ReactNode
  bottomRight?: ReactNode
  /** 篩選後沒人：場景照畫，中央疊 EmptyState inline */
  emptyFilter: { label: string; onClear(): void } | null
  onList(): void
  className?: string
}

/** §5.1 OfficeCanvas：Card pane＋延遲載入的 3D 場景＋§4.2 四角疊層 */
export function OfficeCanvas({ scene, finder, topRight, bottomLeft, bottomRight, emptyFilter, onList, className }: OfficeCanvasProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [Scene] = useState(() => OfficeScene)
  const [hint, setHint] = useState(true)
  const { onFallback } = scene
  const movedRef = useRef(scene.onUserMovedCamera)
  movedRef.current = scene.onUserMovedCamera

  // 操作提示：10 秒後淡出；鏡頭沒動過時保留（§4.2）
  const [moved, setMoved] = useState(false)
  const onUserMovedCamera = useCallback((m: boolean) => {
    if (m) setMoved(true)
    movedRef.current(m)
  }, [])
  useEffect(() => {
    if (!moved) return
    const t = setTimeout(() => setHint(false), 10_000)
    return () => clearTimeout(t)
  }, [moved])

  return (
    <Card ref={ref} variant="pane" data-testid="office-canvas" className={cn('relative isolate min-h-96 flex-1 bg-scene-sky', className)}>
      <SceneBoundary onError={() => onFallback('assets')}>
        <Suspense fallback={<SceneLoading onList={onList} />}>
          {/* 場景自成一層：drei <Html> 標記的 z-index（最高 599）關在這層裡，疊層與底部 Sheet 永遠在上面 */}
          <div className="absolute inset-0 z-0">
            <Scene {...scene} onUserMovedCamera={onUserMovedCamera} />
          </div>
        </Suspense>
      </SceneBoundary>

      <div className="pointer-events-none absolute inset-4 z-10 flex flex-col justify-between gap-4">
        <div className="flex min-h-0 items-start justify-between gap-4">
          <div className="pointer-events-auto flex max-h-full min-h-0 [&>*]:max-h-full">{finder(width)}</div>
          {topRight && <div className="pointer-events-auto min-w-0">{topRight}</div>}
        </div>
        <div className="flex items-end justify-between gap-4">
          <div className="pointer-events-auto min-h-0">{bottomLeft}</div>
          {hint && (
            <p className="pointer-events-none mb-2 truncate text-xs text-muted-foreground transition-opacity duration-300 max-md:hidden motion-reduce:transition-none">
              拖曳旋轉 · 滾輪縮放 · 點小人看詳情 · Esc 取消選取
            </p>
          )}
          <div className="pointer-events-auto">{bottomRight}</div>
        </div>
      </div>

      {emptyFilter && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="pointer-events-auto rounded-xl bg-popover/90 p-4 shadow-pop">
            <EmptyState
              icon={SearchX}
              title={`「${emptyFilter.label}」目前沒有人`}
              action={
                <Button type="button" variant="outline" size="sm" onClick={emptyFilter.onClear}>
                  <X />
                  清除篩選
                </Button>
              }
            />
          </div>
        </div>
      )}
    </Card>
  )
}
