import { forwardRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Crosshair, Moon, Users, X } from 'lucide-react'
import type { OfficeSession } from '@dash/shared'
import { EffortStars } from '@/components/app/EffortStars'
import { EventBadge } from '@/components/app/office'
import { sessionName } from '@/components/app/SessionRow'
import { StatusDot } from '@/components/app/StatusDot'
import { Tag, type TagVariant } from '@/components/app/Tag'
import { rankOf, starsOf } from '@/lib/rank'
import { timerText } from '@/lib/substate'
import { cn } from '@/lib/utils'
import { rowAriaLabel, substateText, taskLabel, taskOptionLabel } from './format'
import { finderOptions, groupSessions, narrowFinder, needsOf, paneOpts, subOf, toneOf, type OfficeParams, type SceneTask } from './model'
import { PickMenu } from './PickMenu'

export const RANK_DOT = {
  senior: 'bg-rank-senior',
  mid: 'bg-rank-mid',
  junior: 'bg-rank-junior',
  visitor: 'bg-rank-visitor',
} as const

type Filters = Pick<OfficeParams, 'fProject' | 'fTask' | 'fRole'>

export interface FinderPanelProps {
  /** 場景裡的人（已套工具列篩選、去掉下班） */
  sessions: OfficeSession[]
  /** 下班的人（底列「N 位已下班 · 顯示」） */
  offDuty: OfficeSession[]
  tasks: Record<string, SceneTask>
  filters: Filters
  onFilters(patch: Partial<Filters>): void
  selectedId: string | null
  onFocus(id: string): void
  /** 有未解 ESCALATE 的 leader（列上掛 EventBadge，§6.6） */
  escalated?: ReadonlySet<string>
  collapsed: boolean
  onCollapsed(collapsed: boolean): void
  now: number
  className?: string
}

interface ChipProps {
  label: string
  value: string | null
  display: string | null
  options: { value: string; label: string; meta?: ReactNode }[]
  onChange(v: string | null): void
}

/** §6.6 FilterChip：未選＝card 底＋框＋ChevronDown；已選＝accent＋值＋X */
function FilterChip({ label, value, display, options, onChange }: ChipProps) {
  const on = value != null
  return (
    <span className={cn('inline-flex h-6.5 min-w-0 items-center rounded-full', on ? 'bg-accent text-accent-foreground' : 'border border-input bg-card')}>
      <PickMenu
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        allLabel={`全部${label}`}
        trigger={
          <button
            type="button"
            aria-label={`${label}：${display ?? '全部'}`}
            className="inline-flex h-full min-w-0 cursor-pointer items-center gap-1 rounded-full pr-1 pl-2.5 text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="min-w-0 truncate">{on ? display : label}</span>
            {!on && <ChevronDown aria-hidden className="size-3 shrink-0 text-muted-foreground" />}
          </button>
        }
      />
      {on ? (
        <button
          type="button"
          aria-label={`清除${label}篩選`}
          onClick={() => onChange(null)}
          className="mr-1 grid size-4.5 shrink-0 cursor-pointer place-items-center rounded-full outline-none hover:bg-background/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : (
        <span className="w-1.5" />
      )}
    </span>
  )
}

export interface FinderRowProps {
  session: OfficeSession
  tasks: Record<string, SceneTask>
  selected: boolean
  onClick(): void
  now: number
  escalated?: boolean
}

/** §6.6 FinderRow：頭像＋職等點／細狀態點＋名字＋星／「專案 · 任務 · 細狀態／計時」｜Crosshair */
export const FinderRow = forwardRef<HTMLButtonElement, FinderRowProps>(function FinderRow({ session: s, tasks, selected, onClick, now, escalated = false }, ref) {
  const sub = subOf(s, now)
  const danger = needsOf(s, now)
  const name = sessionName(s)
  const timer = timerText(s, now, paneOpts(s))
  // 等你只寫「已等 mm:ss」（計時本身就說了是等你），其他「細狀態 計時」
  const state = sub === 'waiting' && timer ? timer : [substateText(s, now), timer].filter(Boolean).join(' ')
  const second = [s.project, taskLabel(s, tasks), state].filter(Boolean).join(' · ')
  return (
    <button
      ref={ref}
      type="button"
      data-testid="finder-row"
      data-session={s.id}
      data-substate={sub}
      aria-current={selected || undefined}
      aria-label={rowAriaLabel(s, tasks, now)}
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none',
        selected ? 'bg-accent' : 'hover:bg-muted',
      )}
    >
      <span aria-hidden className="relative grid size-6 shrink-0 place-items-center rounded-full bg-accent text-2xs font-bold text-accent-foreground">
        {name.charAt(0).toUpperCase()}
        <span className={cn('absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-(length:--border-w-pill) border-popover', RANK_DOT[rankOf(s.kind, s.model)])} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusDot tone={toneOf(s, now)} size="sm" />
          <span className="min-w-0 truncate text-sm font-bold">
            {name}
            {s.leader && <span aria-hidden> 👑</span>}
          </span>
          <EffortStars level={starsOf(s.kind, s.effort)} size="sm" />
          {escalated && (
            <span data-testid="finder-escalate" className="inline-flex shrink-0">
              <EventBadge kind="escalate" size="sm" />
            </span>
          )}
        </span>
        <span className={cn('truncate text-2xs', danger ? 'text-status-danger-fg' : 'text-muted-foreground')}>{second}</span>
      </span>
      <Crosshair aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
})

const GROUPS: { key: 'needs' | 'working' | 'rest'; title: string; tone: TagVariant; titleClass?: string }[] = [
  { key: 'needs', title: '需要你', tone: 'danger', titleClass: 'text-status-danger-fg' },
  { key: 'working', title: '工作中', tone: 'ok' },
  { key: 'rest', title: '完成 · 中斷 · 閒置', tone: 'neutral' },
]

/** canvas 左上找人清單（§6.6；E12／E13）：FilterChip 只縮清單，不改場景 */
export function FinderPanel({
  sessions,
  offDuty,
  tasks,
  filters,
  onFilters,
  selectedId,
  onFocus,
  escalated,
  collapsed,
  onCollapsed,
  now,
  className,
}: FinderPanelProps) {
  const [showOff, setShowOff] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ needs: true, working: true, rest: false })
  const shown = narrowFinder(showOff ? [...sessions, ...offDuty] : sessions, filters)
  const groups = groupSessions(shown, now)
  const opts = finderOptions(sessions, filters.fProject)
  const filtering = filters.fProject != null || filters.fTask != null || filters.fRole != null

  // ↑↓ 在列之間移動焦點；Esc 交回 canvas（由頁面處理 focus）
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-testid="finder-row"]')]
    const i = rows.indexOf(document.activeElement as HTMLElement)
    const next = rows[e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1)]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  return (
    <nav
      data-testid="office-finder"
      aria-label="找人"
      data-collapsed={collapsed}
      onKeyDown={onKeyDown}
      className={cn('flex max-h-full w-finder min-h-0 flex-col rounded-xl bg-popover text-popover-foreground shadow-pop', className)}
    >
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Users aria-hidden className="size-4 text-brand-violet" />
          <span className="text-sm font-bold">找人</span>
          <Tag>{filtering ? `${shown.length} / ${sessions.length}` : sessions.length}</Tag>
          <span className="flex-1" />
          {filtering && (
            <button
              type="button"
              onClick={() => onFilters({ fProject: null, fTask: null, fRole: null })}
              className="cursor-pointer rounded-md text-xs font-semibold text-link-fg outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              清除
            </button>
          )}
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => onCollapsed(!collapsed)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md text-xs font-semibold text-link-fg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {collapsed ? (
              <>
                展開全部 <ChevronDown aria-hidden className="size-3.5" />
              </>
            ) : (
              <ChevronUp aria-label="收合" className="size-4 text-muted-foreground" />
            )}
          </button>
        </div>
        {!collapsed && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              label="專案"
              value={filters.fProject}
              display={filters.fProject}
              options={opts.projects.map((o) => ({ value: o.value, label: o.value, meta: o.count }))}
              onChange={(v) => onFilters({ fProject: v, fTask: null })}
            />
            <FilterChip
              label="任務"
              value={filters.fTask}
              display={filters.fTask ? taskOptionLabel(filters.fTask, tasks, filters.fProject ?? opts.tasks.find((t) => t.value === filters.fTask)?.project ?? null) : null}
              options={opts.tasks.map((o) => ({
                value: o.value,
                label: taskOptionLabel(o.value, tasks, o.project),
                meta: o.project ? `${o.project} · ${o.count}` : o.count,
              }))}
              onChange={(v) => onFilters({ fTask: v })}
            />
            <FilterChip
              label="角色"
              value={filters.fRole}
              display={filters.fRole}
              options={opts.roles.map((o) => ({ value: o.value, label: o.value, meta: o.count }))}
              onChange={(v) => onFilters({ fRole: v })}
            />
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto px-1.5 pb-2">
        {GROUPS.map((g) => {
          const list = groups[g.key]
          if (list.length === 0 || (collapsed && g.key !== 'needs')) return null
          const open = collapsed || openGroups[g.key]
          return (
            <section key={g.key} aria-label={g.title} className="flex flex-col gap-0.5">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenGroups((o) => ({ ...o, [g.key]: !open }))}
                className="sticky top-0 z-1 flex cursor-pointer items-center gap-1.5 rounded-md bg-popover px-1.5 py-1 text-xs font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {open ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronRight aria-hidden className="size-3.5" />}
                <span className={g.titleClass}>{g.title}</span>
                <Tag variant={g.tone}>{list.length}</Tag>
              </button>
              {open &&
                list.map((s) => <FinderRow key={s.id} session={s} tasks={tasks} selected={s.id === selectedId} onClick={() => onFocus(s.id)} now={now} escalated={escalated?.has(s.id)} />)}
            </section>
          )
        })}
      </div>
      {!collapsed && (
        <div className="flex shrink-0 items-center gap-1.5 border-t px-3 py-2 text-2xs text-muted-foreground">
          {offDuty.length > 0 && (
            <button
              type="button"
              aria-pressed={showOff}
              onClick={() => setShowOff(!showOff)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Moon aria-hidden className="size-3" />
              {offDuty.length} 位已下班 · {showOff ? '隱藏' : '顯示'}
            </button>
          )}
          <span className="ml-auto">點一下飛過去</span>
        </div>
      )}
    </nav>
  )
}
