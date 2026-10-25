import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusDot } from '../StatusDot'
import { ChipTag, abnormalTone } from './ChipTag'
import { BORDER, LabelPointer, STROKE, shouldIntercept } from './Pointer'
import type { LabelDensity, LabelInteraction, LabelYield, ObjectChip, ObjectTone } from './types'

export interface ObjectLabelProps extends LabelInteraction {
  icon: LucideIcon
  /** 頁名，如「herdr」「檔案室」 */
  page: string
  /** 主數字；沒資料給 '—' */
  value: string
  unit?: string
  chip?: ObjectChip | null
  lamp?: ObjectTone | null
  density: LabelDensity
  placement?: 'above' | 'below'
  align?: 'center' | 'end' | 'start'
  yielded?: LabelYield
  /** 覆寫自動組出的 aria-label */
  label?: string
  /** 沒資料（整體 60%） */
  empty?: boolean
}

/** 錨點對齊：標籤自己帶位移（同 ZoneSign），三角留在錨點；end／start 往內推 */
const ALIGN = {
  center: { wrap: 'items-center -translate-x-1/2', pointer: '' },
  end: { wrap: 'items-end -translate-x-full ml-4', pointer: 'mr-3' },
  start: { wrap: 'items-start -ml-4', pointer: 'ml-3' },
} as const

/** 物件上的數字標籤（§6.14）。`<a href>`：Enter 開頁、⌘／Ctrl＋click 新分頁；SPA 導頁由 onOpen 接手 */
export function ObjectLabel({
  icon: Icon,
  page,
  value,
  unit,
  chip = null,
  lamp = null,
  density,
  placement = 'above',
  align = 'center',
  yielded = 'none',
  label,
  empty = false,
  href,
  onOpen,
  onActiveChange,
  className,
}: ObjectLabelProps) {
  const tone = abnormalTone(chip, lamp)
  const full = density === 'full'
  // alert-only：有異常照 compact 畫，沒有就視覺隱藏（仍可 tab 聚焦，focus 時顯示）
  const hiddenByDensity = density === 'alert-only' && tone == null
  const srOnly = hiddenByDensity || yielded === 'hidden'
  const showChip = chip != null && (full || tone != null) && (full || chip.tone !== 'neutral')
  const valueText = unit ? `${value} ${unit}` : value
  const ariaLabel = label ?? `${page}：${valueText}${chip ? `，${chip.label}` : ''}，開 ${page} 頁`
  const title = `開 ${page} 頁 · ${[valueText, chip?.label].filter(Boolean).join('、')}`
  const stroke = STROKE[tone ?? 'none']
  const above = placement === 'above'
  const a = ALIGN[align]

  const pill = (
    <span
      data-slot="object-label-pill"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border-(length:--border-w-pill) bg-popover px-3 whitespace-nowrap shadow-soft',
        BORDER[tone ?? 'none'],
      )}
    >
      {lamp && <StatusDot tone={lamp} />}
      <Icon aria-hidden className="size-3.5 shrink-0 text-brand-violet" />
      {full && <span className="text-xs font-semibold text-muted-foreground">{page}</span>}
      <span className="text-sm font-bold tabular-nums">{value}</span>
      {full && unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      {showChip && <ChipTag chip={chip} />}
    </span>
  )
  const dot = (
    <span
      data-slot="object-label-dot"
      className={cn('block size-3 rounded-full border-2 bg-popover', tone ? BORDER[tone] : 'border-border')}
    />
  )
  const pointer = <LabelPointer slot="object-label-pointer" stroke={stroke} flip={!above} className={a.pointer} />

  return (
    <a
      href={href}
      data-slot="object-label"
      data-density={density}
      data-tone={tone ?? undefined}
      data-yielded={yielded}
      data-placement={placement}
      data-align={align}
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
        'pointer-events-auto flex cursor-pointer flex-col rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        above && '-translate-y-full',
        a.wrap,
        empty && 'opacity-60',
        srOnly && 'sr-only focus-visible:not-sr-only',
        className,
      )}
    >
      {yielded === 'dot' ? (
        dot
      ) : above ? (
        <>
          {pill}
          {pointer}
        </>
      ) : (
        <>
          {pointer}
          {pill}
        </>
      )}
    </a>
  )
}
