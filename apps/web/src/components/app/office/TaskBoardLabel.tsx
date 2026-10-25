import { ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChipTag } from './ChipTag'
import { BORDER, LabelPointer, STROKE, shouldIntercept } from './Pointer'
import type { LabelInteraction, LabelYield, ObjectChip } from './types'

export interface TaskBoardLabelProps extends LabelInteraction {
  /** 任務顯示名 */
  task: string
  wavesClosed: number
  /** 0＝沒有 brief 波次表：只顯示任務名、不畫進度條 */
  wavesPlanned: number
  tone?: 'danger' | 'warn' | null
  chips: ObjectChip[]
  /** 結案保留期（E8）：done 顯示「🎉 結案 ✓」、abandoned 顯示「已放棄」 */
  closed?: 'done' | 'abandoned' | null
  density: 'full' | 'compact'
  /** 波關閉時新填的那一段（0 起算）外框閃一次 */
  flashIndex?: number | null
  yielded?: LabelYield
  /** 覆寫自動組出的 aria-label */
  label?: string
}

type SegState = 'closed' | 'active' | 'todo'

const SEG: Record<SegState, string> = {
  closed: 'bg-status-ok',
  active: 'bg-status-ok/40',
  todo: 'bg-muted',
}

function segState(i: number, closedCount: number, closed: TaskBoardLabelProps['closed']): SegState {
  if (i < closedCount) return 'closed'
  // 結案或放棄後沒有「進行中」的波
  return i === closedCount && !closed ? 'active' : 'todo'
}

/** 白板標籤（§6.14）：full 是 200 寬的卡（任務名＋波數＋進度條＋chip），compact 是一列膠囊（圖示＋「2/5」＋異常 chip） */
export function TaskBoardLabel({
  task,
  wavesClosed,
  wavesPlanned,
  tone = null,
  chips,
  closed = null,
  density,
  flashIndex = null,
  yielded = 'none',
  label,
  href,
  onOpen,
  onActiveChange,
  className,
}: TaskBoardLabelProps) {
  const full = density === 'full'
  const hasPlan = wavesPlanned > 0
  const closedCount = closed === 'done' ? wavesPlanned : Math.min(wavesClosed, wavesPlanned)
  const srOnly = yielded === 'hidden'
  const waveText = `波 ${wavesClosed}/${wavesPlanned}`
  const status =
    closed === 'done' ? (
      <span data-slot="task-board-closed" className="text-xs font-bold text-status-ok-fg">
        🎉 結案 ✓
      </span>
    ) : closed === 'abandoned' ? (
      <span data-slot="task-board-closed" className="text-xs font-semibold text-status-idle-fg">
        已放棄
      </span>
    ) : hasPlan ? (
      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{full ? waveText : `${wavesClosed}/${wavesPlanned}`}</span>
    ) : null

  const state =
    closed === 'done' ? '已結案' : closed === 'abandoned' ? '已放棄' : hasPlan ? `波 ${wavesClosed}／${wavesPlanned}` : null
  const chipText = chips.map((c) => `，${c.label}`).join('')
  const ariaLabel = label ?? `${task}${state ? `：${state}` : ''}${chipText}，開任務詳情`
  const title = `任務詳情 · ${closed === 'done' ? '已結案' : closed === 'abandoned' ? '已放棄' : `波 ${wavesClosed + 1} 進行中`}`

  const bar = hasPlan && full && (
    <div
      data-slot="task-board-bar"
      role="progressbar"
      aria-label={`${task} 波次進度`}
      aria-valuemin={0}
      aria-valuemax={wavesPlanned}
      aria-valuenow={closedCount}
      className="flex gap-0.75"
    >
      {Array.from({ length: wavesPlanned }, (_, i) => {
        const s = segState(i, closedCount, closed)
        return (
          <span
            key={i}
            data-seg={s}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              SEG[s],
              flashIndex === i && 'ring-2 ring-status-ok-fg animate-wave-fill motion-reduce:animate-none',
            )}
          />
        )
      })}
    </div>
  )

  const card = (
    <div
      data-slot="task-board-card"
      className={cn(
        'flex w-50 flex-col gap-1.5 rounded-lg border-(length:--border-w-pill) bg-popover px-3 py-2 shadow-soft',
        BORDER[tone ?? 'none'],
      )}
    >
      <div className="flex items-center gap-1.5">
        <ListChecks aria-hidden className="size-3.5 shrink-0 text-brand-violet" />
        <span className={cn('min-w-0 flex-1 truncate text-sm font-bold', closed === 'abandoned' && 'text-muted-foreground line-through')}>{task}</span>
        {status}
      </div>
      {bar}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <ChipTag key={c.label} chip={c} />
          ))}
        </div>
      )}
    </div>
  )

  // compact：danger chip 照 Tag，warn（ESCALATE）縮成 18 實心 warn 圓「!」；neutral 不畫
  const pill = (
    <span
      data-slot="task-board-pill"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border-(length:--border-w-pill) bg-popover px-3 whitespace-nowrap shadow-soft',
        BORDER[tone ?? 'none'],
      )}
    >
      <ListChecks aria-hidden className="size-3.5 shrink-0 text-brand-violet" />
      {status}
      {chips
        .filter((c) => c.tone !== 'neutral')
        .map((c) =>
          c.tone === 'warn' ? (
            <span
              key={c.label}
              data-slot="board-escalate"
              role="img"
              aria-label={c.label}
              className="grid size-4.5 shrink-0 place-items-center rounded-full bg-status-warn text-xs leading-none font-bold text-on-color"
            >
              !
            </span>
          ) : (
            <ChipTag key={c.label} chip={c} />
          ),
        )}
    </span>
  )

  const dot = (
    <span
      data-slot="task-board-dot"
      className={cn('block size-3 rounded-full border-2 bg-popover', tone ? BORDER[tone] : 'border-border')}
    />
  )

  return (
    <a
      href={href}
      data-slot="task-board-label"
      data-density={density}
      data-tone={tone ?? undefined}
      data-yielded={yielded}
      data-closed={closed ?? undefined}
      aria-label={ariaLabel}
      title={title}
      onClick={(e) => {
        if (!onOpen || !shouldIntercept(e)) return
        e.preventDefault()
        onOpen(href)
      }}
      onMouseEnter={() => onActiveChange?.(true)}
      onMouseLeave={() => onActiveChange?.(false)}
      onFocus={() => onActiveChange?.(true)}
      onBlur={() => onActiveChange?.(false)}
      className={cn(
        'pointer-events-auto flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        srOnly && 'sr-only focus-visible:not-sr-only',
        className,
      )}
    >
      {yielded === 'dot' ? (
        dot
      ) : (
        <>
          {full ? card : pill}
          <LabelPointer slot="task-board-pointer" stroke={STROKE[tone ?? 'none']} />
        </>
      )}
    </a>
  )
}
