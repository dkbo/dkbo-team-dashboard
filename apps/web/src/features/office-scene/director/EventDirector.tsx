// 角色互動事件（§6.17、E6–E8；AC10）：第二包的 default export，SceneRoot 在第一次 render 後掛上。
// 收即時事件 → runtime 寫角色覆寫（走路、比讚、垂頭、點頭、跳）、持動畫票；頭頂掛 EventBubble／EventBadge、白板星點與彩帶。
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as THREE from 'three'
import { createPortal, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import type { OfficeSession, TaskDetail } from '@dash/shared'
import { EventBadge, EventBubble } from '@/components/app/office'
import { openEscalations } from '@/features/office/events/escalation'
import { useMedia } from '@/features/office/hooks'
import { useDashStore } from '@/store'
import {
  boardAnchor,
  characterInfo,
  deskSideAnchor,
  getCharacterOverride,
  setCharacterOverride,
  useAnchorsVersion,
  useCharacterHead,
  walkPath,
  type EventDirectorProps,
  type Vec3,
} from '../anchors'
import { publishBoardFlashes } from './boardFx'
import { Confetti, BoardSpark } from './Effects'
import { createBubbleRegistry, type BubbleRegistry, type Rect } from './bubbleLayout'
import { PlacedBubble } from './PlacedBubble'
import { badgeLeaders, waveHasVerdict, type MotionMs } from './plan'
import { createRuntime, type BubbleState } from './runtime'

/** 頭頂疊層在一般標記之上、alert 標記同層（E16） */
const Z_EVENT: [number, number] = [399, 300]
/** leader 點頭：規格沒有獨立 token，取一次點頭的長度 */
const NOD_MS = 1200

/** 讀 :root 的時間 token（"1500ms"／"1.5s"） */
function cssMs(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n
}

function readMs(): MotionMs {
  return {
    thumb: cssMs('--motion-thumb', 1500),
    headDown: cssMs('--motion-head-down', 2000),
    nod: NOD_MS,
    celebrate: cssMs('--motion-celebrate', 3000),
    waveFill: cssMs('--motion-wave-fill', 600),
    spark: cssMs('--motion-spark', 1200),
    walkMax: cssMs('--review-walk-max', 4000),
  }
}

/** 與事件引擎同一條規則：role＝reviewer，或沒有 role 時 member 以 reviewer 開頭 */
const isReviewerSession = (s: OfficeSession) => s.role === 'reviewer' || (s.role == null && !!s.member?.startsWith('reviewer'))

const xz = (p: { x: number; z: number }): Vec3 => [p.x, 0, p.z]

declare global {
  interface Window {
    /** AC11 量測：場景動畫票目前張數（事件播放中 > 0、播完歸零）；只讀 */
    __dashMotion?: { tickets(): number }
  }
}

export default function EventDirector({ events, tickets }: EventDirectorProps) {
  const invalidate = useThree((s) => s.invalidate)
  // 與 OfficePage 傳給場景的 reducedMotion 同一個來源（契約只給 events／tickets）
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const sessions = useDashStore((s) => s.sessions?.sessions)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const [, bump] = useReducer((n: number) => n + 1, 0)

  const rt = useMemo(
    () =>
      createRuntime({
        tickets,
        setOverride: setCharacterOverride,
        getOverride: getCharacterOverride,
        now: Date.now,
        bubbleMs: () => cssMs('--motion-event-bubble', 3000),
        onChange: bump,
        ctx: () => {
          const byId = new Map((sessionsRef.current ?? []).map((s) => [s.id, s]))
          return {
            reducedMotion: reducedRef.current,
            ms: readMs(),
            info: (id) => {
              const i = characterInfo(id)
              return i ? { substate: i.substate, at: xz(i.place) } : null
            },
            deskSide: deskSideAnchor,
            board: boardAnchor,
            walkPath,
            isReviewer: (id) => {
              const s = byId.get(id)
              return s ? isReviewerSession(s) : false
            },
            isLeader: (id) => byId.get(id)?.leader ?? false,
          }
        },
      }),
    [tickets],
  )
  useEffect(() => () => rt.dispose(), [rt])
  useEffect(() => {
    window.__dashMotion = { tickets: () => tickets.count() }
    return () => void delete window.__dashMotion
  }, [tickets])
  useEffect(() => rt.feed(events), [rt, events])

  // 任務 detail：同 office 的 detailFor，store 快取的較新，沒有就用 overview active 那份
  const details = useDashStore((s) => s.details)
  const overview = useDashStore((s) => s.overview)
  const byDir = useMemo(() => {
    const m = new Map<string, TaskDetail>()
    for (const p of overview?.projects ?? []) for (const [dir, d] of Object.entries(p.active)) m.set(dir, d)
    for (const d of Object.values(details)) if (d.data) m.set(d.dir, d.data.detail.task)
    return m
  }, [details, overview])

  // 細狀態（scene publish）或資料變了：出動中的 reviewer 停下揮手或回座；verdict 事件沒即時到也收回（I1）
  const version = useAnchorsVersion()
  useEffect(
    () =>
      rt.reconcile(
        (id) => characterInfo(id)?.substate ?? null,
        (o) => waveHasVerdict(byDir.get(o.taskDir), o.wave),
      ),
    [rt, version, byDir],
  )

  const snap = rt.snapshot()
  useEffect(() => {
    const m = new Map<string, number>()
    for (const [dir, fx] of snap.boards) if (fx.flashIndex != null) m.set(dir, fx.flashIndex)
    publishBoardFlashes(m)
  }, [snap.boards])
  useEffect(() => () => publishBoardFlashes(new Map()), [])

  // 「!」：detail 有未解 ESCALATE，或即時事件比解除多；掛在該任務的 leader 頭上
  const badges = useMemo(() => {
    const open = new Set<string>()
    for (const [dir, d] of byDir) if (openEscalations(d).length > 0) open.add(dir)
    const leaders: Record<string, string[]> = {}
    for (const s of sessions ?? []) if (s.leader && s.taskDir) (leaders[s.taskDir] ??= []).push(s.id)
    for (const [dir, ids] of snap.escalationActors) leaders[dir] = [...new Set([...(leaders[dir] ?? []), ...ids])]
    return badgeLeaders(leaders, open, snap.liveEscalations)
  }, [byDir, sessions, snap.liveEscalations, snap.escalationActors])

  // DOM 疊層新增時補畫一格（drei <Html> 只在 render 時定位）；移除不用畫，不浪費一格
  const shown = useRef(new Set<string>())
  useEffect(() => {
    const now = new Set([...[...snap.bubbles.values()].map((b) => b.key), ...[...snap.boards.values()].map((b) => b.key), ...[...badges].map((id) => `!${id}`)])
    const added = [...now].some((k) => !shown.current.has(k))
    shown.current = now
    if (added) invalidate()
  }, [snap.bubbles, snap.boards, badges, invalidate])

  const canvas = useThree((s) => s.gl.domElement)
  const registry = useMemo(() => createBubbleRegistry(), [])
  const tick = useBubbleRelayout(canvas, snap.bubbles.size > 0)

  const heads = new Set([...snap.bubbles.keys(), ...badges])
  return (
    <>
      {[...heads].map((id) => (
        <HeadStack key={id} id={id} bubble={snap.bubbles.get(id) ?? null} badge={badges.has(id)} registry={registry} tick={tick} />
      ))}
      {[...snap.boards.values()].map((fx) => {
        const at = boardAnchor(fx.taskDir)
        if (!at) return null
        return (
          <group key={fx.key}>
            {fx.spark && <BoardSpark at={at} />}
            {fx.confetti && <Confetti at={at} ms={fx.ms} />}
          </group>
        )
      })}
    </>
  )
}

/**
 * 頭頂堆疊（§6.15）：EventBubble 在頭部右側、標記下面那一列（與標記不同列）；碰 canvas 右緣翻左。
 * EventBadge 在標記膠囊左上外側（量 AgentMarker 的 DOM，與膠囊不相交）；角色沒有標記時改掛頭頂正上方。
 */
function HeadStack({ id, bubble, badge, registry, tick }: { id: string; bubble: BubbleState | null; badge: boolean; registry: BubbleRegistry; tick: number }) {
  const head = useCharacterHead(id)
  const camera = useThree((s) => s.camera)
  const canvas = useThree((s) => s.gl.domElement)
  if (!head) return null
  return createPortal(
    <Html zIndexRange={Z_EVENT}>
      <div data-slot="event-stack" data-session={id} className="pointer-events-none relative size-0">
        {badge && <PlacedBadge id={id} />}
        {bubble && (
          <PlacedBubble
            key={bubble.key}
            id={id}
            bubble={bubble}
            anchor={() => headScreen(head, camera, canvas)}
            bounds={() => rectOf(canvas)}
            obstacles={() => obstaclesOf(canvas)}
            registry={registry}
            tick={tick}
          />
        )}
      </div>
    </Html>,
    head,
  )
}

const BADGE = 20
const BADGE_GAP = 2

function PlacedBadge({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -BADGE / 2, top: -BADGE - 4 })
  useLayoutEffect(() => {
    const put = (left: number, top: number) => setPos((p) => (p.left === left && p.top === top ? p : { left, top }))
    const measure = () => {
      const root = document.querySelector<HTMLElement>(`[data-slot="agent-marker"][data-session="${CSS.escape(id)}"]`)
      if (!root) return put(-BADGE / 2, -BADGE - 4)
      const r = root.getBoundingClientRect()
      const ax = r.left + r.width / 2
      const ay = r.bottom
      const pill = root.querySelector('button')?.firstElementChild as HTMLElement | null | undefined
      if (!pill) return put(-BADGE / 2, r.top - ay - BADGE - 4)
      const p = pill.getBoundingClientRect()
      // 水平以標記整體（含皇冠、縮成點時比膠囊寬）最左緣為界，與標記不相交
      put(Math.min(p.left, r.left) - ax - BADGE - BADGE_GAP, p.top - ay - BADGE / 2 + 1)
    }
    measure()
    // 看整個 <Html> 疊層容器（自己這個 <Html> 的父層＝AgentMarker 也掛的那一層）：
    // 掛上時 leader 可能還沒有標記，之後出現、換型或縮點都要重量（M6）
    const overlay = ref.current?.closest('[data-slot="event-stack"]')?.parentElement?.parentElement
    if (!overlay) return
    const mo = new MutationObserver(measure)
    mo.observe(overlay, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-substate'] })
    return () => mo.disconnect()
  }, [id])
  return (
    <span ref={ref} data-testid="event-badge" data-kind="escalate" className="absolute" style={{ left: pos.left, top: pos.top }}>
      <EventBadge kind="escalate" />
    </span>
  )
}

const RELAYOUT_DEBOUNCE_MS = 200

const rectOf = (e: Element): Rect => {
  const r = e.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

const _p = new THREE.Vector3()
/** 頭頂 group 在視窗的位置：drei <Html> 的原點就是它的投影點（不讀 DOM，<Html> 剛掛上時還沒定位） */
function headScreen(head: THREE.Object3D, camera: THREE.Camera, canvas: HTMLCanvasElement): { x: number; y: number } | null {
  head.updateWorldMatrix(true, false)
  _p.setFromMatrixPosition(head.matrixWorld).project(camera)
  if (_p.z > 1) return null
  const r = canvas.getBoundingClientRect()
  return { x: r.left + ((_p.x + 1) / 2) * r.width, y: r.top + ((1 - _p.y) / 2) * r.height }
}

/** 氣泡要避開的東西：角色標記與 EventBadge 目前的視窗位置 */
function obstaclesOf(canvas: HTMLCanvasElement): Rect[] {
  const root = canvas.closest('[data-slot="office-scene"]') ?? canvas.parentElement
  if (!root) return []
  return [...root.querySelectorAll('[data-slot="agent-marker"], [data-testid="event-badge"]')].map(rectOf).filter((r) => r.w > 2 && r.h > 2)
}

/**
 * 相機停下（滾輪、拖曳放開）或標記縮放／換型（class、data-substate）後 +1，讓存在中的氣泡重排一次。
 * 不看 style／childList（<Html> 每幀改 style，會讓去抖永遠等不到）；沒有氣泡時不監聽；只動 DOM，不 invalidate。
 * 氣泡「掛上」當下的排版不靠這裡，見 PlacedBubble 的 useLayoutEffect。
 */
function useBubbleRelayout(canvas: HTMLCanvasElement, active: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const root = canvas.closest('[data-slot="office-scene"]') ?? canvas.parentElement
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setTick((n) => n + 1), RELAYOUT_DEBOUNCE_MS)
    }
    canvas.addEventListener('wheel', schedule, { passive: true })
    canvas.addEventListener('pointerup', schedule)
    const mo = new MutationObserver(schedule)
    if (root) mo.observe(root, { subtree: true, attributes: true, attributeFilter: ['class', 'data-substate'] })
    return () => {
      window.clearTimeout(timer)
      canvas.removeEventListener('wheel', schedule)
      canvas.removeEventListener('pointerup', schedule)
      mo.disconnect()
    }
  }, [canvas, active])
  return tick
}
