import type { ComponentProps, ReactNode } from 'react'
import { Ban, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusDot, type Tone } from './StatusDot'

export type { Tone } from './StatusDot'

/** agent 狀態（herdr pane）；不認得的歸 unknown */
export type StatusTone = 'working' | 'idle' | 'blocked' | 'done' | 'unknown'

const TONE_CLASS: Record<Tone, string> = {
  danger: 'border-status-danger text-status-danger-fg',
  warn: 'border-status-warn text-status-warn-fg',
  ok: 'border-status-ok text-status-ok-fg',
  idle: 'border-status-idle text-status-idle-fg',
  info: 'border-status-info text-status-info-fg',
}

const HOVER_CLASS: Record<Tone, string> = {
  danger: 'hover:bg-status-danger-soft',
  warn: 'hover:bg-status-warn-soft',
  ok: 'hover:bg-status-ok-soft',
  idle: 'hover:bg-status-idle-soft',
  info: 'hover:bg-status-info-soft',
}

export interface PillLook {
  tone: Tone
  label: string
  dot?: true | 'check' | 'ban'
  pulse?: boolean
  dashed?: boolean
  strike?: boolean
}

const AGENT: Record<StatusTone, PillLook> = {
  working: { tone: 'ok', label: '工作中', pulse: true },
  blocked: { tone: 'danger', label: '卡住', pulse: true },
  idle: { tone: 'idle', label: '閒置' },
  done: { tone: 'ok', label: '完成', dot: 'check' },
  unknown: { tone: 'idle', label: '不明', dashed: true },
}

export function statusTone(status: string | null | undefined): StatusTone {
  return status === 'working' || status === 'idle' || status === 'blocked' || status === 'done' ? status : 'unknown'
}

/** agent 狀態 → StatusPill 外觀（§6.3 tone 對照；Q11 agent done＝ok＋✓）。不認得的狀態顯示原文 */
export function agentStatusPill(status: string | null | undefined): PillLook {
  const s = statusTone(status)
  const look = AGENT[s]
  return s === 'unknown' && status && status !== 'unknown' ? { ...look, label: status } : look
}

const TASK: Record<string, PillLook> = {
  running: { tone: 'ok', label: '進行中' },
  planning: { tone: 'info', label: '規劃中' },
  done: { tone: 'idle', label: '已完成', dot: 'check' },
  abandoned: { tone: 'idle', label: '已放棄', dot: 'ban', strike: true },
}

/** 任務狀態 → StatusPill 外觀（Q11 已結案＝idle＋✓；abandoned 加 Ban 與刪除線） */
export function taskStatusPill(status: string | null | undefined): PillLook {
  return TASK[status ?? ''] ?? { tone: 'idle', label: status || '不明', dashed: true }
}

export interface StatusPillProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** 語意色；給了 status 時可省略（由 agent 狀態推得） */
  tone?: Tone
  /** 相容舊用法：agent 狀態（working／idle／blocked／done／其他）；此時 data-tone 仍是 agent 狀態名 */
  status?: string | null
  size?: 'default' | 'sm'
  /** 預設有點；'check'／'ban' 換成圖示；false 不畫 */
  dot?: boolean | 'check' | 'ban'
  pulse?: boolean
  /** 不明／無 pane：虛線框 */
  dashed?: boolean
  /** abandoned：文字刪除線 */
  strike?: boolean
  label?: ReactNode
  /** 尾端次要字（sm 不顯示） */
  note?: ReactNode
  /** 放在終端黑底上：底 on-color/alpha-5，token 走暗色版 */
  terminal?: boolean
  /** 可點時（外層是按鈕或連結）加 hover 淡底 */
  interactive?: boolean
}

/** 講「現在的狀態」的膠囊：有框無底（§6.3） */
export function StatusPill({
  tone,
  status,
  size = 'default',
  dot,
  pulse,
  dashed,
  strike,
  label,
  note,
  terminal = false,
  interactive = false,
  className,
  ...props
}: StatusPillProps) {
  const look: Partial<PillLook> = status !== undefined || !tone ? agentStatusPill(status) : {}
  const t: Tone = tone ?? look.tone ?? 'idle'
  const d = dot ?? look.dot ?? true
  const sm = size === 'sm'
  return (
    <span
      data-slot="status-pill"
      data-tone={status !== undefined ? statusTone(status) : t}
      data-color={t}
      data-size={size}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center rounded-full border-(length:--border-w-pill) bg-transparent whitespace-nowrap',
        sm ? 'h-5 gap-1 px-2 text-2xs font-semibold' : 'h-6 gap-1.5 px-2.5 text-xs font-semibold',
        TONE_CLASS[t],
        (dashed ?? look.dashed) && 'border-dashed',
        terminal && 'dark bg-on-color/5',
        interactive && cn('cursor-pointer transition-colors duration-150 motion-reduce:transition-none', HOVER_CLASS[t]),
        className,
      )}
      {...props}
    >
      {d === 'check' ? (
        <Check aria-hidden className="size-3 shrink-0" />
      ) : d === 'ban' ? (
        <Ban aria-hidden className="size-3 shrink-0" />
      ) : d ? (
        <StatusDot tone={t} size="sm" pulse={pulse ?? look.pulse} />
      ) : null}
      <span className={cn('truncate', (strike ?? look.strike) && 'line-through')}>{label ?? look.label}</span>
      {note && !sm && <span className="text-xs font-medium opacity-75">{note}</span>}
    </span>
  )
}
