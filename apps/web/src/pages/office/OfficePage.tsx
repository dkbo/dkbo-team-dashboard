import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { OfficeSession } from '@dash/shared'
import { Banner, BannerAction } from '@/components/app/Banner'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/app/PageHeader'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AgentDetailPane } from '@/features/office/AgentDetailPane'
import { FinderPanel } from '@/features/office/FinderPanel'
import { useHtmlTheme, useMedia, useStoredFlag } from '@/features/office/hooks'
import {
  buildTasks,
  kindCounts,
  parseOfficeParams,
  sceneSessions,
  stateCounts,
  writeOfficeParams,
  type OfficeParams,
  type OfficeView,
  type SceneTask,
} from '@/features/office/model'
import { OfficeCanvas } from '@/features/office/OfficeCanvas'
import { OfficeList } from '@/features/office/OfficeList'
import { OfficeToolbar } from '@/features/office/OfficeToolbar'
import { Legend, StateCounts, ViewControls } from '@/features/office/Overlays'
import type { FallbackReason } from '@/features/office/sceneTypes'
import { hasWebGL } from '@/features/office/webgl'
import { useNow } from '@/hooks/useNow'
import { formatEpochMs } from '@/lib/format'
import { isOffDuty } from '@/lib/substate'
import { cn } from '@/lib/utils'
import { useDashStore, useSessions } from '@/store'

const FALLBACK_BANNER: Record<FallbackReason, { tone: 'danger' | 'info' | 'warn'; title: string; detail: string; retry: boolean }> = {
  webgl: {
    tone: 'info',
    title: '這個瀏覽器無法使用 WebGL，改用清單顯示',
    detail: '資料與篩選跟 3D 相同；換支援 WebGL 2 的瀏覽器（或開啟硬體加速）後重新整理即可看到辦公室',
    retry: false,
  },
  assets: { tone: 'danger', title: '3D 素材載入失敗，已改用清單', detail: '模型或 3D 程式碼下載失敗；網路恢復後可再試', retry: true },
  'context-lost': { tone: 'warn', title: '3D 畫面暫停（WebGL context lost），已改用清單', detail: '顯示卡重置或記憶體不足；資料照常更新', retry: true },
}

/** 首次載入失敗後自動重試的間隔（§6.11） */
const RETRY_MS = 10_000

/** 同內容的 tasks 保持同一個物件，避免 overview 每次更新都讓場景重收 props */
function useStableTasks(tasks: Record<string, SceneTask>): Record<string, SceneTask> {
  const ref = useRef<{ key: string; value: Record<string, SceneTask> }>({ key: '', value: tasks })
  const key = JSON.stringify(tasks)
  if (ref.current.key !== key) ref.current = { key, value: tasks }
  return ref.current.value
}

/** 元素都同一個物件時沿用上一份陣列：跨分鐘重算篩選不該讓場景收到新的 sessions */
function useStableList<T>(list: T[]): T[] {
  const ref = useRef(list)
  const prev = ref.current
  if (prev !== list && (prev.length !== list.length || prev.some((x, i) => x !== list[i]))) ref.current = list
  return ref.current
}

/** /office：3D 辦公室（延遲載入）＋清單退路（AC8、AC9）。篩選與選取只存在網址 */
export default function OfficePage() {
  const { data: doc, error } = useSessions()
  const overview = useDashStore((s) => s.overview)
  const livePanes = useDashStore((s) => s.livePanes)
  const [sp, setSp] = useSearchParams()
  const params = parseOfficeParams(sp)
  const now = useNow(1000)
  // 場景篩選只用分鐘精度的時鐘：每秒的計時不該讓場景重收 sessions
  const minute = Math.floor(now / 60_000) * 60_000

  const webglOk = useMemo(() => hasWebGL(), [])
  const [fallback, setFallback] = useState<FallbackReason | null>(webglOk ? null : 'webgl')
  const narrow = !useMedia('(min-width: 768px)', true)
  const lg = useMedia('(min-width: 1024px)', true)
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const theme = useHtmlTheme()
  const [force3d, setForce3d] = useState(false)
  const view: OfficeView = params.view === 'list' || fallback || (narrow && !force3d) ? 'list' : '3d'

  const setParams = useCallback(
    (patch: Partial<OfficeParams>) => setSp((prev) => writeOfficeParams(prev, patch), { replace: true }),
    [setSp],
  )

  const all = useMemo(() => doc?.sessions ?? [], [doc])
  const counts = kindCounts(all, params, minute)
  const scene = useStableList(useMemo(() => sceneSessions(all, params, minute), [all, params.kind, params.project, params.needs, minute])) // eslint-disable-line react-hooks/exhaustive-deps
  const offDuty = useMemo(() => all.filter((s) => isOffDuty(s, minute) && (!params.project || s.project === params.project)), [all, params.project, minute])
  const tasks = useStableTasks(useMemo(() => buildTasks(overview), [overview]))
  const projects = useMemo(() => [...new Set([...(overview?.projects.map((p) => p.name) ?? []), ...all.map((s) => s.project)])].sort(), [overview, all])
  const anyone = all.some((s) => !isOffDuty(s, minute))

  // 選取＝網址 focus；找不到（篩掉或不存在）就當沒選
  const selected: OfficeSession | null = (params.focus && [...scene, ...offDuty].find((s) => s.id === params.focus)) || null
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null)
  const nonce = useRef(0)
  const requestFocus = useCallback((id: string) => setFocusRequest({ id, nonce: ++nonce.current }), [])
  // 開頁帶 ?focus=：資料到了、找得到那個人時飛過去一次
  const initialFocus = useRef(params.focus)
  useEffect(() => {
    const id = initialFocus.current
    if (id && scene.some((s) => s.id === id)) {
      initialFocus.current = null
      requestFocus(id)
    }
  }, [scene, requestFocus])

  const select = useCallback((id: string | null) => setParams({ focus: id }), [setParams])
  const focusOn = useCallback(
    (id: string) => {
      select(id)
      requestFocus(id)
    },
    [select, requestFocus],
  )

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [resetRequest, setResetRequest] = useState(0)
  const [moved, setMoved] = useState(false)
  const reset = useCallback(() => {
    setResetRequest((n) => n + 1)
    setMoved(false)
  }, [])
  const [legendOpen, setLegendOpen] = useStoredFlag('dash.office.legend', false)
  const [finderOpen, setFinderOpen, finderStored] = useStoredFlag('dash.office.finder', true)

  const pageRef = useRef<HTMLDivElement>(null)
  const canvasWrap = useRef<HTMLDivElement>(null)
  const projectBtn = useRef<HTMLButtonElement>(null)

  // 先到的原因才是根因：落到清單後 canvas 卸載會補報 context-lost，不能蓋掉 assets
  const onFallback = useCallback((reason: FallbackReason) => setFallback((prev) => prev ?? reason), [])
  const zoom = (dir: 1 | -1) => {
    // OrbitControls 聽 canvas 的 wheel；用同一條路徑縮放，不必擴充場景契約
    canvasWrap.current
      ?.querySelector('canvas')
      ?.dispatchEvent(new WheelEvent('wheel', { deltaY: dir > 0 ? -240 : 240, bubbles: true, cancelable: true }))
  }
  const fullscreen = () => {
    const el = canvasWrap.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void el.requestFullscreen?.()
  }
  const setView = (v: OfficeView) => {
    if (v === '3d') {
      if (fallback && fallback !== 'webgl') setFallback(null)
      if (narrow) setForce3d(true)
    }
    setParams({ view: v })
  }

  // 首次載入失敗：10 秒自動重試
  useEffect(() => {
    if (doc || !error) return
    const t = setTimeout(() => void useDashStore.getState().fetchSessions(), RETRY_MS)
    return () => clearTimeout(t)
  }, [doc, error])

  // 鍵盤（§6.1、§6.6）
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
    let handled = true
    if (e.key === '/') projectBtn.current?.focus()
    else if (e.key === 'n' && (counts.needs > 0 || params.needs)) setParams({ needs: !params.needs })
    else if (e.key === 'r' && view === '3d') reset()
    else if (e.key === 'l') setView(view === 'list' ? '3d' : 'list')
    else if (e.key === 'f') pageRef.current?.querySelector<HTMLElement>('[data-testid="finder-row"]')?.focus()
    else if (e.key === 'Escape' && params.focus) select(null)
    else handled = false
    if (handled) e.preventDefault()
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const needsTotal = kindCounts(all, { ...params, kind: 'all', project: null }, minute).needs
  const subtitle = doc
    ? `${view === '3d' ? '3D 即時' : '清單模式'}：${counts.all} 個 session · ${needsTotal > 0 ? `${needsTotal} 個需要你` : '大家都很順 ✨'}`
    : '載入中…'

  const toolbar = (
    <OfficeToolbar
      ref={projectBtn}
      params={params}
      counts={counts}
      projects={projects}
      view={view}
      webglOk={webglOk}
      moved={moved}
      sceneOn={view === '3d' && anyone}
      compact={!lg}
      onParams={setParams}
      onView={setView}
      onReset={reset}
      onFullscreen={fullscreen}
    />
  )

  const filterLabel = [params.kind !== 'all' ? (params.kind === 'claude' ? 'Claude' : 'Codex') : null, params.project, params.needs ? '需要你' : null]
    .filter(Boolean)
    .join(' · ')
  const emptyFilter = anyone && scene.length === 0 ? { label: filterLabel || '篩選', onClear: () => setParams({ kind: 'all', project: null, needs: false }) } : null

  const selectedPane = selected?.paneId ? livePanes[selected.paneId] : undefined
  const detail = selected && (
    <AgentDetailPane
      session={selected}
      pane={selectedPane}
      tasks={tasks}
      now={now}
      onClose={() => select(null)}
      onCenter={() => requestFocus(selected.id)}
      className="min-h-0 flex-1"
    />
  )
  // ≥ lg 右欄；768–1023（與窄螢幕硬開 3D）底部 Sheet；手機清單就地展開不開詳情
  const detailAs: 'side' | 'sheet' | 'none' = !detail ? 'none' : lg ? 'side' : view === 'list' && narrow ? 'none' : 'sheet'

  const banners = (
    <>
      {fallback && (
        <Banner
          tone={FALLBACK_BANNER[fallback].tone}
          title={FALLBACK_BANNER[fallback].title}
          data-testid="office-fallback-banner"
          data-reason={fallback}
          action={FALLBACK_BANNER[fallback].retry ? <BannerAction onClick={() => setView('3d')}>再試 3D</BannerAction> : undefined}
        >
          {FALLBACK_BANNER[fallback].detail}
        </Banner>
      )}
      {!fallback && narrow && view === 'list' && params.view !== 'list' && (
        <Banner tone="info" size="sm" title="窄螢幕用清單顯示" action={<BannerAction onClick={() => setView('3d')}>仍要開 3D</BannerAction>} />
      )}
      {error && !doc && (
        <Banner tone="danger" title="載入失敗" action={<BannerAction onClick={() => void useDashStore.getState().fetchSessions()}>重試</BannerAction>}>
          <code className="font-mono text-xs break-all">{error}</code>；10 秒後自動重試
        </Banner>
      )}
      {error && doc && <Banner tone="warn" size="sm" title={`更新失敗，顯示的是舊資料（最後成功 ${formatEpochMs(doc.generatedAt)}）`} />}
      {overview?.herdr.state === 'polling' && <Banner tone="warn" size="sm" title="herdr 訂閱斷線，每 5 秒輪詢中（細狀態最多延遲 5 秒）" />}
    </>
  )

  let body
  if (!doc) {
    body = error ? (
      <Card className="min-h-60 flex-1">
        <EmptyState size="page" icon="☁️" title="目前拿不到 session 資料" />
      </Card>
    ) : (
      <Skeleton data-testid="office-loading" className="min-h-60 flex-1 rounded-xl" />
    )
  } else if (!anyone) {
    body = (
      <Card data-testid="office-empty" className="min-h-60 flex-1 justify-center">
        <EmptyState size="page" icon="🌙" title="辦公室還沒有人上班" hint="開一個 Claude Code 或 Codex session（herdr 裡）就會出現在這裡" />
      </Card>
    )
  } else if (view === 'list') {
    body = emptyFilter ? (
      <Card className="flex-1 justify-center">
        <EmptyState
          title={`「${emptyFilter.label}」目前沒有人`}
          action={
            <button type="button" onClick={emptyFilter.onClear} className="cursor-pointer text-sm font-semibold text-link-fg hover:underline">
              清除篩選
            </button>
          }
        />
      </Card>
    ) : (
      <OfficeList sessions={scene} offDuty={offDuty} tasks={tasks} panes={livePanes} selectedId={selected?.id ?? null} onSelect={select} mobile={narrow} now={now} />
    )
  } else {
    body = (
      <div ref={canvasWrap} className="flex min-h-0 flex-1 flex-col">
        <OfficeCanvas
          onList={() => setView('list')}
          emptyFilter={emptyFilter}
          scene={{
            sessions: scene,
            tasks,
            selectedId: selected?.id ?? null,
            hoveredId,
            onSelect: select,
            onHover: setHoveredId,
            focusRequest,
            resetRequest,
            theme,
            reducedMotion,
            onFallback,
            onUserMovedCamera: setMoved,
          }}
          finder={(width) =>
            scene.length > 0 && (
              <FinderPanel
                sessions={scene}
                offDuty={offDuty}
                tasks={tasks}
                filters={params}
                onFilters={setParams}
                selectedId={selected?.id ?? null}
                onFocus={focusOn}
                collapsed={!(finderStored ? finderOpen : width >= 1200)}
                onCollapsed={(c) => setFinderOpen(!c)}
                now={now}
              />
            )
          }
          topRight={<StateCounts counts={stateCounts(scene, now)} />}
          bottomLeft={<Legend open={legendOpen} onOpen={setLegendOpen} />}
          bottomRight={<ViewControls onZoom={zoom} onReset={reset} />}
        />
      </div>
    )
  }

  return (
    <div ref={pageRef} data-testid="office-page" className={cn('flex flex-col gap-3 p-3', !narrow && 'lg:h-(--tool-h)', narrow && view === '3d' && 'h-(--tool-h)')}>
      <PageHeader size="compact" title="辦公室" subtitle={subtitle} actions={lg ? toolbar : undefined} />
      {!lg && <div className="-mx-3 overflow-x-auto px-3 pb-1">{toolbar}</div>}
      {banners}
      <div className={cn('grid min-h-0 flex-1 gap-3', detailAs === 'side' && 'lg:grid-cols-[minmax(0,1fr)_var(--detail-w)]')}>
        <div className="flex min-h-0 min-w-0 flex-col">{body}</div>
        {detailAs === 'side' && (
          <Card variant="pane" className="min-h-0">
            {detail}
          </Card>
        )}
      </div>
      {detailAs === 'sheet' && (
        <div role="dialog" aria-label="詳情" className="fixed inset-x-0 bottom-0 z-30 flex h-[60svh] flex-col rounded-t-xl bg-card shadow-pop">
          <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/40" />
          {detail}
        </div>
      )}
    </div>
  )
}
