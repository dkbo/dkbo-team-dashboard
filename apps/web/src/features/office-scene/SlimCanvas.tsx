// 取代 r3f 的 <Canvas>：<Canvas> 會 extend(THREE) 把整個 three 命名空間登記成 JSX 元素，打包時整包 three 都留下來，
// 3D chunk 超過 AC14 的 250 KB。這裡用 createRoot 自己掛，只 extend 場景用到的幾個類別，其餘交給 tree-shaking。
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, events as createPointerEvents, extend, type ReconcilerRoot, type RenderProps, type RootState } from '@react-three/fiber'
import { DirectionalLight, Group, HemisphereLight, Mesh } from 'three'
import { frameloopFor } from './visibility'

// JSX 用到的 three 元素（<primitive> 是內建）；drei 的 Html、OrbitControls 只用 group／primitive
extend({ Group, Mesh, HemisphereLight, DirectionalLight })

type Size = { width: number; height: number; top: number; left: number }

export interface SlimCanvasProps extends Pick<RenderProps<HTMLCanvasElement>, 'frameloop' | 'dpr' | 'shadows' | 'flat' | 'camera' | 'gl'> {
  children: ReactNode
  onPointerMissed?(event: MouseEvent): void
  onCreated?(state: RootState): void
  'aria-label'?: string
}

export function SlimCanvas({ children, onPointerMissed, onCreated, 'aria-label': label, ...config }: SlimCanvasProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const root = useRef<ReconcilerRoot<HTMLCanvasElement> | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  const cb = useRef({ onPointerMissed, onCreated })
  cb.current = { onPointerMissed, onCreated }

  useLayoutEffect(() => {
    const el = wrap.current!
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize((s) => (s && s.width === r.width && s.height === r.height ? s : { width: r.width, height: r.height, top: r.top, left: r.left }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!size || size.width === 0 || size.height === 0 || !canvas.current) return
    root.current ??= createRoot(canvas.current)
    const r = root.current
    let alive = true
    r.configure({
      ...config,
      // 背景分頁維持 never（AC11）：r3f 拿這次的值跟上次傳入的比，所以不能省略（省略＝預設 'always'），要明確傳
      frameloop: frameloopFor(document.visibilityState, config.frameloop),
      events: createPointerEvents,
      size,
      onPointerMissed: (e: MouseEvent) => cb.current.onPointerMissed?.(e),
      onCreated: (state: RootState) => {
        state.events.connect?.(wrap.current!)
        cb.current.onCreated?.(state)
      },
    }).then(() => {
      if (alive) r.render(children)
    })
    return () => {
      alive = false
    }
  })

  useEffect(
    () => () => {
      root.current?.unmount()
      root.current = null
    },
    [],
  )

  return (
    <div ref={wrap} className="relative size-full overflow-hidden">
      <canvas ref={canvas} aria-label={label} className="block" />
    </div>
  )
}
