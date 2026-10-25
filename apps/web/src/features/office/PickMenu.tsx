import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface PickOption {
  value: string
  label: ReactNode
  /** 右側 micro 說明（例：「atlas · 4」） */
  meta?: ReactNode
}

export interface PickMenuProps {
  /** 觸發按鈕（asChild） */
  trigger: ReactNode
  label: string
  options: PickOption[]
  value: string | null
  onChange(value: string | null): void
  /** 有給就在最上面多一個「全部」項（選它＝null） */
  allLabel?: string
  align?: 'start' | 'end'
}

/** Field 的 popover 選單（unify Field）：單選、menuitemradio、選了就關 */
export function PickMenu({ trigger, label, options, value, onChange, allLabel, align = 'start' }: PickMenuProps) {
  const [open, setOpen] = useState(false)
  const pick = (v: string | null) => {
    onChange(v)
    setOpen(false)
  }
  const items: { value: string | null; label: ReactNode; meta?: ReactNode }[] = [
    ...(allLabel ? [{ value: null, label: allLabel }] : []),
    ...options,
  ]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-60 p-1">
        <div role="menu" aria-label={label} className="flex max-h-72 flex-col overflow-y-auto">
          {items.map((it) => {
            const on = it.value === value
            return (
              <button
                key={it.value ?? '__all__'}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => pick(it.value)}
                className={cn(
                  'flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1 text-left text-sm transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none',
                  on && 'bg-accent text-accent-foreground',
                )}
              >
                <Check aria-hidden className={cn('size-3.5 shrink-0', !on && 'invisible')} />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.meta != null && <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">{it.meta}</span>}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
