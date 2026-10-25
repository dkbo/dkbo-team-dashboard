// 辦公室 3D 場景（共用契約「OfficeScene 元件」，frontend-office 以 React.lazy 載入）。
// 無 WebGL、素材載入失敗、context lost 時呼叫 onFallback，由頁面落到清單。
import { Suspense, useEffect, useRef, useState } from 'react'
import type { OfficeSession } from '@dash/shared'
import { AssetBoundary } from './AssetBoundary'
import { CAMERA } from './camera'
import { AgentHoverCard, EdgeAlertChip } from './Marker'
import { useLingerId } from './hover'
import { loadManifest, type OfficeManifest } from './model-map'
import { SlimCanvas } from './SlimCanvas'
import { SceneRoot, sceneSubstate, type HoverCardAnchor, type OffscreenAlert } from './SceneRoot'
import type { FallbackReason, OfficeSceneProps } from '@/features/office/sceneTypes'
import { hasWebGL } from '@/features/office/webgl'

/** 高於 drei <Html> 標記的 zIndexRange（alert 最高 399） */
const HOVER_CARD_Z = 600

export type { FallbackReason, OfficeSceneProps }

export default function OfficeScene(props: OfficeSceneProps) {
  const [webgl] = useState(hasWebGL)
  const [manifest, setManifest] = useState<OfficeManifest | null>(null)
  const [offscreen, setOffscreen] = useState<OffscreenAlert[]>([])
  const [card, setCard] = useState<HoverCardAnchor | null>(null)
  const [localFocus, setLocalFocus] = useState<{ id: string; nonce: number } | null>(null)
  // 卡片收起看 DOM 層的 hoveredId，不等 r3f 根收到新 props（見 hover.ts／report）
  const lingerId = useLingerId(props.hoveredId)
  const fallback = useRef(props.onFallback)
  fallback.current = props.onFallback

  useEffect(() => {
    if (!webgl) {
      fallback.current('webgl')
      return
    }
    let alive = true
    loadManifest()
      .then((m) => alive && setManifest(m))
      .catch(() => alive && fallback.current('assets'))
    return () => {
      alive = false
    }
  }, [webgl])

  if (!webgl) return null
  // 頁面給的 focus 與畫面外 chip 的 focus，取 nonce 較新的那個
  const focus = localFocus && (!props.focusRequest || localFocus.nonce > props.focusRequest.nonce) ? localFocus : props.focusRequest
  const waiting = props.sessions.filter((s) => s.substate === 'waiting')
  const hovered = card && card.id === lingerId ? props.sessions.find((s) => s.id === card.id) ?? null : null

  return (
    <div data-slot="office-scene" className="relative size-full overflow-hidden">
      {manifest && (
        <SlimCanvas
          frameloop="demand"
          dpr={[1, 2]}
          shadows="percentage"
          flat
          camera={{ fov: CAMERA.fov, near: 0.1, far: 400, position: [30, 20, 30] }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onPointerMissed={() => props.onSelect(null)}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', () => fallback.current('context-lost'))
          }}
          aria-label="辦公室 3D 場景"
        >
          <AssetBoundary onError={() => fallback.current('assets')}>
            <Suspense fallback={null}>
              <SceneRoot {...props} focusRequest={focus} manifest={manifest} onOffscreen={setOffscreen} onHoverCard={setCard} />
            </Suspense>
          </AssetBoundary>
        </SlimCanvas>
      )}
      {offscreen.map((a) => (
        <EdgeAlertChip
          key={a.id}
          name={a.name}
          style={{ left: a.x, top: a.y }}
          onClick={() => setLocalFocus({ id: a.id, nonce: Math.max(Date.now(), (props.focusRequest?.nonce ?? 0) + 1) })}
        />
      ))}
      {hovered && card && (
        <div className="pointer-events-none absolute" style={{ left: card.x, top: card.y, zIndex: HOVER_CARD_Z }}>
          <AgentHoverCard
            session={hovered}
            substate={sceneSubstate(hovered, Date.now())}
            task={hovered.taskDir && props.tasks[hovered.taskDir] ? { display: props.tasks[hovered.taskDir].display, wave: props.tasks[hovered.taskDir].wave } : null}
            now={Date.now()}
            flip={card.flip}
            below={card.below}
          />
        </div>
      )}
      <div role="status" className="sr-only">
        {waiting.map((s) => `${s.member ?? s.agentName ?? s.sessionId} 在等你`).join('；')}
      </div>
    </div>
  )
}
