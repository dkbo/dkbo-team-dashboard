import { Link } from 'react-router'
import type { PaneLive } from '@dash/shared'
import { StatusPill } from '@/components/app/StatusPill'
import { AnsiLine } from '@/features/herdr/AnsiText'
import type { ScreenState } from '@/features/herdr/useHerdr'
import type { AnsiSegment } from '@/lib/ansi'
import { herdrHref } from '@/lib/herdr'
import { cn } from '@/lib/utils'
import { paneLabel } from './model'

export const THUMB_LINES = 8

/** 去掉尾端空行後的最後 n 行（Claude Code 的畫面底部常是空白與輸入框） */
export function tailLines(lines: AnsiSegment[][], n: number): AnsiSegment[][] {
  let end = lines.length
  while (end > 0 && lines[end - 1].every((s) => s.text.trim() === '')) end--
  return lines.slice(Math.max(0, end - n), end)
}

/** 專案卡上的 agent 畫面縮圖；點了到 herdr 頁的那個 pane */
export function PaneThumbs({ panes, screens }: { panes: PaneLive[]; screens: Record<string, ScreenState> }) {
  const agents = panes.filter((p) => p.agent)
  if (agents.length === 0) return null
  return (
    <div data-testid="pane-thumbs" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {agents.map((p) => {
        const s = screens[p.paneId]
        return (
          <Link
            key={p.paneId}
            to={herdrHref(p)}
            data-testid={`thumb-${p.paneId}`}
            className={cn(
              'group flex flex-col overflow-hidden rounded-md border bg-zinc-950 hover:ring-2 hover:ring-ring',
              p.status === 'blocked' && 'border-red-500 ring-1 ring-red-500/50',
            )}
          >
            {/* 標頭固定黑底：用 .dark 範圍讓透明底的狀態膠囊取深色 token */}
            <div className="dark flex items-center gap-1.5 border-b border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">
              <StatusPill status={p.status} className="h-4 px-1.5 text-[0.65rem]" />
              <span className="truncate">{p.member ?? paneLabel(p)}</span>
            </div>
            <pre className="h-[calc(8*1.2em+0.5rem)] overflow-hidden px-1 py-1 font-mono text-[9px] leading-[1.2] whitespace-pre text-zinc-200">
              {s ? tailLines(s.lines, THUMB_LINES).map((l, i) => <AnsiLine key={i} segs={l} />) : <span className="text-zinc-500">讀取中…</span>}
            </pre>
          </Link>
        )
      })}
    </div>
  )
}
