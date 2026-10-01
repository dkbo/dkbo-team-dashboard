import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusTone = 'working' | 'idle' | 'blocked' | 'done' | 'unknown'

const LABEL: Record<StatusTone, string> = {
  working: '工作中',
  idle: '閒置',
  blocked: '卡住',
  done: '完成',
  unknown: '不明',
}

const TONE_CLASS: Record<StatusTone, string> = {
  working: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  idle: 'border-border bg-muted text-muted-foreground',
  blocked: 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300',
  done: 'border-emerald-500/40 bg-background text-emerald-700 dark:text-emerald-300',
  unknown: 'border-border bg-muted text-muted-foreground',
}

const DOT_CLASS: Record<StatusTone, string> = {
  working: 'bg-emerald-500',
  idle: 'bg-zinc-400',
  blocked: 'bg-red-500',
  done: '',
  unknown: 'bg-zinc-400',
}

export function statusTone(status: string | null | undefined): StatusTone {
  return status === 'working' || status === 'idle' || status === 'blocked' || status === 'done' ? status : 'unknown'
}

export interface StatusPillProps {
  status: string | null | undefined
  label?: ReactNode
  note?: string
  className?: string
}

export function StatusPill({ status, label, note, className }: StatusPillProps) {
  const tone = statusTone(status)
  const text = label ?? (tone === 'unknown' && status && status !== 'unknown' ? status : LABEL[tone])
  return (
    <span
      data-slot="status-pill"
      data-tone={tone}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      {tone === 'done' ? (
        <Check aria-hidden className="size-3 shrink-0" />
      ) : (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASS[tone], tone === 'working' && 'animate-pulse')} />
      )}
      <span className="truncate">{text}</span>
      {note && <span className="text-[0.7rem] font-normal opacity-75">{note}</span>}
    </span>
  )
}
