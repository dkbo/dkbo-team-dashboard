import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedItem<T extends string = string> {
  value: T
  label: ReactNode
  count?: number
  disabled?: boolean
  'data-testid'?: string
}

export interface SegmentedControlProps<T extends string = string> {
  size?: 'default' | 'sm'
  items: SegmentedItem<T>[]
  value: T
  onChange: (value: T) => void
  /** tablist＝切換視圖（aria-selected＋roving tabindex）；group＝切換參數（aria-pressed），如趨勢區間 */
  kind?: 'tablist' | 'group'
  'aria-label'?: string
  'data-testid'?: string
  className?: string
}

/** 視圖或參數切換（§6.12），取代 Tabs。← → Home End 移動並選取 */
export function SegmentedControl<T extends string = string>({
  size = 'default',
  items,
  value,
  onChange,
  kind = 'tablist',
  className,
  ...props
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const sm = size === 'sm'
  const tab = kind === 'tablist'
  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)
  const current = items.findIndex((it) => it.value === value)

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const pos = enabled.indexOf(i)
    let next: number | undefined
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length]
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') next = enabled[0]
    else if (e.key === 'End') next = enabled[enabled.length - 1]
    if (next == null) return
    e.preventDefault()
    refs.current[next]?.focus()
    onChange(items[next].value)
  }

  return (
    <div
      role={kind}
      data-slot="segmented-control"
      data-size={size}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full bg-muted',
        sm ? 'h-8 p-0.5' : 'h-9 p-1',
        className,
      )}
      {...props}
    >
      {items.map((it, i) => {
        const selected = it.value === value
        // roving tabindex：選中項（沒有就第一個可用項）可 Tab 進入
        const focusable = selected || (current < 0 && i === enabled[0])
        return (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role={tab ? 'tab' : undefined}
            aria-selected={tab ? selected : undefined}
            aria-pressed={tab ? undefined : selected}
            tabIndex={focusable ? 0 : -1}
            disabled={it.disabled}
            data-value={it.value}
            data-state={selected ? 'active' : 'inactive'}
            data-testid={it['data-testid']}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
              sm ? 'px-3 text-xs' : 'px-3.5 text-sm',
              selected && 'bg-card text-foreground shadow-soft dark:bg-secondary',
            )}
          >
            {it.label}
            {it.count != null && <span className="ml-1 text-xs font-medium tabular-nums opacity-70">{it.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
