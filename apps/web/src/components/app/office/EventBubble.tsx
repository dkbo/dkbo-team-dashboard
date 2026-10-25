import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export interface EventBubbleProps {
  emoji: string
  label: string
  tone: 'ok' | 'warn' | 'info' | 'danger'
  /** 停留到這個時間（Date 或 epoch ms）；到了自己隱藏 */
  until: Date | number
  className?: string
}

const TONE: Record<EventBubbleProps['tone'], string> = {
  ok: 'border-status-ok bg-status-ok-soft text-status-ok-fg',
  warn: 'border-status-warn bg-status-warn-soft text-status-warn-fg',
  info: 'border-status-info bg-status-info-soft text-status-info-fg',
  danger: 'border-status-danger bg-status-danger-soft text-status-danger-fg',
}

/**
 * 事件短暫氣泡（§6.15、§6.17）：soft 膠囊，emoji＋文字。淡入停留淡出走 CSS（animate-event-bubble，reduced motion 不動、
 * 停留時間由 --motion-event-bubble 決定）；到 until 自己隱藏，until 往後延（新事件頂替）會重新計時。
 * 不是 live region —— 播報由頁面的隱藏 aria-live 區負責，避免重複報讀。
 */
export function EventBubble({ emoji, label, tone, until, className }: EventBubbleProps) {
  const untilMs = typeof until === 'number' ? until : until.getTime()
  const [expired, setExpired] = useState<number | null>(null)
  useEffect(() => {
    const left = untilMs - Date.now()
    if (left <= 0) return
    const id = setTimeout(() => setExpired(untilMs), left)
    return () => clearTimeout(id)
  }, [untilMs])
  // 動畫總長＝掛上（或 until 改變）當下的剩餘時間，淡出剛好落在隱藏的那一刻
  const duration = useMemo(() => Math.max(0, untilMs - Date.now()), [untilMs])
  if (expired === untilMs || untilMs - Date.now() <= 0) return null
  return (
    <span
      data-slot="event-bubble"
      data-tone={tone}
      style={{ animationDuration: `${duration}ms` }}
      className={cn(
        'pointer-events-none inline-flex h-6 items-center gap-1 rounded-full border-(length:--border-w-pill) px-3 text-xs font-semibold whitespace-nowrap shadow-soft animate-event-bubble motion-reduce:animate-none',
        TONE[tone],
        className,
      )}
    >
      <span data-slot="event-bubble-emoji" aria-hidden="true">
        {emoji}
      </span>
      {label}
    </span>
  )
}
