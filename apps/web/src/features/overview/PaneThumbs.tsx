import { Link } from 'react-router'
import type { PaneLive } from '@dash/shared'
import { StatusPill } from '@/components/app/StatusPill'
import { AnsiLine } from '@/features/herdr/AnsiText'
import type { ScreenState } from '@/features/herdr/useHerdr'
import type { AnsiSegment } from '@/lib/ansi'
import { formatPct } from '@/lib/format'
import { herdrHref } from '@/lib/herdr'
import { paneLabel } from './model'

/** thumb-lines（index.css --thumb-lines） */
export const THUMB_LINES = 10

/** 去掉尾端空行後的最後 n 行（Claude Code 的畫面底部常是空白與輸入框） */
export function tailLines(lines: AnsiSegment[][], n: number): AnsiSegment[][] {
  let end = lines.length
  while (end > 0 && lines[end - 1].every((s) => s.text.trim() === '')) end--
  return lines.slice(Math.max(0, end - n), end)
}

/** Q9：只有工作中／卡住的 agent pane 畫縮圖；閒置 pane 只留 StatusPill */
export const thumbPanes = (panes: PaneLive[]): PaneLive[] => panes.filter((p) => p.agent && (p.status === 'working' || p.status === 'blocked'))

/** §6.29 專案卡上的 agent 畫面縮圖（終端固定黑底）；點了到 herdr 頁的那個 pane */
export function PaneThumbs({ panes, screens }: { panes: PaneLive[]; screens: Record<string, ScreenState> }) {
  const agents = thumbPanes(panes)
  if (agents.length === 0) return null
  return (
    <div data-testid="pane-thumbs" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {agents.map((p) => {
        const s = screens[p.paneId]
        const info = [p.model, p.ctxPct != null ? `ctx ${formatPct(p.ctxPct)}` : null].filter(Boolean).join(' · ')
        return (
          <Link
            key={p.paneId}
            to={herdrHref(p)}
            data-testid={`thumb-${p.paneId}`}
            data-status={p.status}
            className="flex min-w-0 flex-col overflow-hidden rounded-md bg-terminal-bg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <div className="flex h-6 shrink-0 items-center gap-1.5 bg-terminal-chrome px-2 text-2xs font-semibold text-terminal-fg">
              <StatusPill status={p.status} size="sm" terminal />
              <span className="min-w-0 truncate">{p.member ?? paneLabel(p)}</span>
              {info && <span className="ml-auto shrink-0 font-normal text-terminal-dim">{info}</span>}
            </div>
            <pre className="h-(--thumb-h) overflow-hidden px-2 py-1 font-mono text-2xs leading-terminal whitespace-pre text-terminal-fg">
              {s ? tailLines(s.lines, THUMB_LINES).map((l, i) => <AnsiLine key={i} segs={l} />) : <span className="text-terminal-dim">讀取中…</span>}
            </pre>
          </Link>
        )
      })}
    </div>
  )
}
