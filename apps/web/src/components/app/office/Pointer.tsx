import { cn } from '@/lib/utils'

/** 標籤指向錨點的小三角（10 × 6）；填 popover，描邊色同標籤框（無框時 popover）。placement=below 時翻轉在上 */
export function LabelPointer({ slot, stroke, flip, className }: { slot: string; stroke: string; flip?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      data-slot={slot}
      viewBox="0 0 10 6"
      className={cn('h-1.5 w-2.5 shrink-0 overflow-visible fill-popover', stroke, flip && 'rotate-180', className)}
    >
      <path d="M0 0 L5 6 L10 0" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

export const STROKE = {
  danger: 'stroke-status-danger',
  warn: 'stroke-status-warn',
  none: 'stroke-popover',
} as const

export const BORDER = {
  danger: 'border-status-danger',
  warn: 'border-status-warn',
  none: 'border-transparent',
} as const

/** 點擊：只攔截不帶修飾鍵的左鍵；⌘／Ctrl／Shift／Alt／中鍵交給瀏覽器（開新分頁） */
export function shouldIntercept(e: { defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}
