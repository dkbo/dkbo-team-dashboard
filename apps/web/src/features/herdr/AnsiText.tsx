import type { CSSProperties } from 'react'
import type { AnsiSegment, AnsiStyle } from '@/lib/ansi'
import { cn } from '@/lib/utils'

export function segStyle(s: AnsiStyle): CSSProperties | undefined {
  if (Object.keys(s).length === 0) return undefined
  const fg = s.inverse ? (s.bg ?? 'var(--terminal-bg)') : s.fg
  const bg = s.inverse ? (s.fg ?? 'var(--terminal-fg)') : s.bg
  return {
    color: fg,
    backgroundColor: bg,
    fontWeight: s.bold ? 700 : undefined,
    opacity: s.dim ? 0.6 : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    textDecoration: [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
  }
}

/** 把 ANSI 片段依搜尋命中切開（命中可能跨片段） */
export function markSegments(segs: AnsiSegment[], q: string): (AnsiSegment & { hit: boolean })[] {
  if (!q) return segs.map((s) => ({ ...s, hit: false }))
  const text = segs.map((s) => s.text).join('')
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const ranges: [number, number][] = []
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + needle.length)) ranges.push([i, i + needle.length])
  if (ranges.length === 0) return segs.map((s) => ({ ...s, hit: false }))
  const out: (AnsiSegment & { hit: boolean })[] = []
  let pos = 0
  for (const s of segs) {
    const end = pos + s.text.length
    const cuts = new Set([pos, end])
    for (const [a, b] of ranges) {
      if (a > pos && a < end) cuts.add(a)
      if (b > pos && b < end) cuts.add(b)
    }
    const sorted = [...cuts].sort((x, y) => x - y)
    for (let i = 0; i < sorted.length - 1; i++) {
      const [a, b] = [sorted[i], sorted[i + 1]]
      out.push({ text: text.slice(a, b), style: s.style, hit: ranges.some(([x, y]) => a >= x && b <= y) })
    }
    pos = end
  }
  return out
}

export function AnsiLine({ segs, highlight = '', focused = false }: { segs: AnsiSegment[]; highlight?: string; focused?: boolean }) {
  return (
    <div data-focused={focused || undefined} className={cn('dark min-h-lh', focused && 'bg-status-warn-soft outline outline-status-warn')}>
      {markSegments(segs, highlight).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-sm bg-status-warn text-terminal-bg">
            {s.text}
          </mark>
        ) : (
          <span key={i} style={segStyle(s.style)}>
            {s.text}
          </span>
        ),
      )}
    </div>
  )
}
