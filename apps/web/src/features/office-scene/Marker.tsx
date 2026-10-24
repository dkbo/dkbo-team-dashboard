// 場景內的 DOM 疊層（drei <Html> 裡畫）：AgentMarker（§6.3、§6.15）、AgentHoverCard（§6.8、§6.18）、ZoneSign（§6.5）。
import type { CSSProperties } from 'react'
import { Coffee, Crown, FolderKanban, Hand, Laptop, Terminal } from 'lucide-react'
import type { OfficeSession, Substate } from '@dash/shared'
import { EffortStars } from '@/components/app/EffortStars'
import { RankTag } from '@/components/app/RankTag'
import { sessionName } from '@/components/app/SessionRow'
import { SubstatePill } from '@/components/app/SubstatePill'
import { Tag } from '@/components/app/Tag'
import type { Tone } from '@/components/app/StatusDot'
import { rankOf, starsOf } from '@/lib/rank'
import { SUBSTATE_META, substateLabel, timerText } from '@/lib/substate'
import { cn } from '@/lib/utils'

const SOFT: Record<Tone, string> = {
  danger: 'bg-status-danger-soft border-status-danger text-status-danger-fg',
  warn: 'bg-status-warn-soft border-status-warn text-status-warn-fg',
  ok: 'bg-status-ok-soft border-status-ok text-status-ok-fg',
  idle: 'bg-status-idle-soft border-status-idle text-status-idle-fg',
  info: 'bg-status-info-soft border-status-info text-status-info-fg',
}
const POINTER: Record<Tone, string> = {
  danger: 'stroke-status-danger',
  warn: 'stroke-status-warn',
  ok: 'stroke-status-ok',
  idle: 'stroke-status-idle',
  info: 'stroke-status-info',
}
const DOT: Record<Tone, string> = {
  danger: 'bg-status-danger',
  warn: 'bg-status-warn',
  ok: 'bg-status-ok',
  idle: 'bg-status-idle',
  info: 'bg-status-info',
}

/** 「dev-a，等你，已等 3 分 12 秒」 */
export function markerLabel(s: OfficeSession, sub: Substate, now: number): string {
  const timer = timerText(s, now, { long: true })
  return [sessionName(s), substateLabel(sub, s.tool?.name), timer].filter(Boolean).join('，')
}

export interface AgentMarkerProps {
  session: OfficeSession
  substate: Substate
  now: number
  /** 0.6–1；'dot' 只剩色點；alert 忽略 */
  scale: number | 'dot'
  /** hover／選取中：畫 effort 星、閒置也畫標記 */
  focused: boolean
  reducedMotion: boolean
  onSelect(id: string): void
  onHover(id: string | null): void
}

/** 指向角色的小三角（10 × 6）；bubble 改兩顆尾巴圓 */
function Pointer({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 10 6" className={cn('h-1.5 w-2.5 overflow-visible', className)}>
      <path d="M0 0 L5 6 L10 0" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

export function AgentMarker({ session, substate, now, scale, focused, reducedMotion, onSelect, onHover }: AgentMarkerProps) {
  const meta = SUBSTATE_META[substate]
  const alert = meta.marker === 'alert'
  const hidden = meta.hiddenByDefault && !focused
  const stars = focused ? starsOf(session.kind, session.effort) : 0
  const sub = session.subagents > 0 ? `×${session.subagents}` : null
  const Icon = meta.icon
  const label = markerLabel(session, substate, now)
  const dot = scale === 'dot' && !alert && !focused
  const k = alert || focused || scale === 'dot' ? 1 : scale
  const style: CSSProperties | undefined = k === 1 ? undefined : { transform: `scale(${k})`, transformOrigin: 'bottom center' }

  let pill
  if (meta.marker === 'alert') {
    pill = (
      <span className="relative inline-flex h-marker-alert items-center gap-1 rounded-full bg-status-danger px-3 text-sm font-bold text-on-color shadow-pop">
        {!reducedMotion && meta.pulse && (
          <span aria-hidden className="absolute inset-0 animate-alert-pulse rounded-full bg-status-danger motion-reduce:animate-none" />
        )}
        {Icon && <Icon aria-hidden className="relative size-3.5" />}
        <span className="relative">{substateLabel(substate)}</span>
        {sub && <span className="relative text-xs">{sub}</span>}
      </span>
    )
  } else if (meta.marker === 'bubble') {
    pill = (
      <span className="inline-flex h-marker items-center gap-1 rounded-full border-(length:--border-w-pill) border-status-ok bg-popover px-2.5 shadow-soft">
        {[1, 0.7, 0.45].map((o, i) => (
          <span
            key={i}
            aria-hidden
            className={cn('size-1.5 rounded-full bg-status-ok-fg', !reducedMotion && 'animate-think-dots motion-reduce:animate-none')}
            style={{ opacity: o, animationDelay: `${i * 200}ms` }}
          />
        ))}
        {sub && <span className="text-xs font-semibold text-status-ok-fg">{sub}</span>}
      </span>
    )
  } else if (meta.marker === 'line') {
    const tool = substate === 'running' ? session.tool?.name : null
    pill = (
      <span className="inline-flex h-marker max-w-40 items-center gap-1 rounded-full border-(length:--border-w-pill) border-status-ok bg-popover px-2.5 text-xs font-semibold text-status-ok-fg shadow-soft">
        {Icon && <Icon aria-hidden className="size-3 shrink-0" />}
        <span className={cn('truncate', tool && 'font-mono')}>{tool ?? meta.label}</span>
        {sub && <span className="shrink-0">{sub}</span>}
      </span>
    )
  } else {
    pill = (
      <span className={cn('inline-flex h-marker items-center gap-1 rounded-full border-(length:--border-w-pill) px-2.5 text-xs font-semibold shadow-soft', SOFT[meta.tone])}>
        {Icon && <Icon aria-hidden className="size-3" />}
        <span>{meta.label}</span>
        {sub && <span>{sub}</span>}
      </span>
    )
  }

  return (
    <div
      data-slot="agent-marker"
      data-session={session.id}
      data-substate={substate}
      className="flex -translate-x-1/2 -translate-y-full flex-col items-center whitespace-nowrap"
      style={style}
    >
      {hidden ? null : (
        <button
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(session.id)
          }}
          onPointerEnter={() => onHover(session.id)}
          onPointerLeave={() => onHover(null)}
          onFocus={() => onHover(session.id)}
          onBlur={() => onHover(null)}
          className="flex cursor-pointer flex-col items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {dot ? (
            <span data-slot="marker-dot" aria-hidden className={cn('size-2 rounded-full', DOT[meta.tone])} />
          ) : (
            <>
              {pill}
              {meta.marker === 'bubble' ? (
                <span aria-hidden className="flex flex-col items-center gap-px pt-px">
                  <span className="size-1.5 rounded-full border-(length:--border-w-pill) border-status-ok bg-popover" />
                  <span className="size-1 rounded-full border-(length:--border-w-pill) border-status-ok bg-popover" />
                </span>
              ) : (
                <Pointer className={alert ? 'fill-status-danger stroke-status-danger' : meta.marker === 'line' ? 'fill-popover stroke-status-ok' : cn('fill-current', POINTER[meta.tone])} />
              )}
            </>
          )}
        </button>
      )}
      {stars > 0 && <EffortStars level={stars} className="mt-0.75" />}
      {session.leader && <Crown aria-label="leader" className="mt-1 size-4 fill-brand-violet/30 text-brand-violet" />}
    </div>
  )
}

export interface HoverCardTask {
  display: string
  wave: { current: number; planned: number } | null
}

/** hover 角色時的卡（§6.8、§6.18）：頭像＋名字＋kind／RankTag／專案 · 任務 · 波／細狀態＋計時／工具或錯誤／提示 */
export function AgentHoverCard({
  session,
  substate,
  task,
  now,
  flip,
  below = false,
}: {
  session: OfficeSession
  substate: Substate
  task: HoverCardTask | null
  now: number
  /** 碰右緣時翻到左邊 */
  flip: boolean
  /** 碰上緣時翻到下面 */
  below?: boolean
}) {
  const name = sessionName(session)
  const where = [session.project, task?.display, task?.wave ? `波 ${task.wave.current}` : null].filter(Boolean).join(' · ')
  const err = substate === 'error' ? session.error : null
  const tool = session.tool ? [session.tool.name, session.tool.summary].filter(Boolean).join(' ') : null
  const timer = timerText(session, now)
  const danger = SUBSTATE_META[substate].tone === 'danger'
  return (
    <div
      data-slot="agent-hovercard"
      data-session={session.id}
      role="tooltip"
      className={cn(
        'pointer-events-none flex w-hovercard flex-col gap-3 rounded-xl bg-popover p-4 text-popover-foreground shadow-pop',
        flip ? '-ml-4 -translate-x-full' : 'ml-4',
        below ? 'mt-4' : '-translate-y-full',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-bold">
              {name}
              {session.leader && ' 👑'}
            </span>
            <Tag mono>{session.kind}</Tag>
          </span>
          {where && <span className="truncate text-xs text-muted-foreground">{where}</span>}
        </span>
      </div>
      <RankTag rank={rankOf(session.kind, session.model)} model={session.model} effort={session.effort} kind={session.kind} />
      <div className="flex items-center justify-between gap-2">
        <SubstatePill substate={substate} tool={session.tool?.name} />
        {timer && <span className={cn('text-xs font-semibold tabular-nums', danger ? 'text-status-danger-fg' : 'text-muted-foreground')}>{timer}</span>}
      </div>
      {(err || tool) && (
        <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5">
          <Terminal aria-hidden className="size-3 shrink-0 text-muted-foreground" />
          <code className={cn('min-w-0 truncate font-mono text-xs', err && 'text-status-danger-fg')}>{err ?? tool}</code>
        </div>
      )}
      <span className="text-2xs text-muted-foreground">點一下看詳情</span>
    </div>
  )
}

const ZONE_ICON = { project: FolderKanban, hot: Laptop, lounge: Coffee }

export function ZoneSign({ kind, title, subtitle, count, needs }: { kind: 'project' | 'hot' | 'lounge'; title: string; subtitle: string | null; count: number; needs: boolean }) {
  const Icon = ZONE_ICON[kind]
  return (
    <div
      data-slot="zone-sign"
      data-kind={kind}
      className="pointer-events-none flex h-7 -translate-y-full items-center gap-1.5 rounded-full bg-popover px-3 whitespace-nowrap shadow-soft"
    >
      <Icon aria-hidden className="size-3.5 text-brand-violet" />
      <span className="text-xs font-bold">{title}</span>
      {subtitle && <span className="text-2xs text-muted-foreground">{subtitle}</span>}
      <Tag>{count}</Tag>
      {needs && <span role="img" aria-label="有人等你" className="size-2 rounded-full bg-status-danger" />}
    </div>
  )
}

/** alert 角色在畫面外：canvas 邊緣的紅色箭頭 chip（§6.3） */
export function EdgeAlertChip({ name, onClick, style }: { name: string; onClick(): void; style: CSSProperties }) {
  return (
    <button
      type="button"
      data-slot="edge-alert"
      onClick={onClick}
      style={style}
      className="absolute inline-flex h-marker-alert cursor-pointer items-center gap-1 rounded-full bg-status-danger px-3 text-sm font-bold text-on-color shadow-pop outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Hand aria-hidden className="size-3.5" />
      {name}
    </button>
  )
}
