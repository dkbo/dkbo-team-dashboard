import { useEffect, useMemo, useRef } from 'react'
import { layoutGraph, type GitCommit, type GraphRow } from '@dash/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatAgo, formatDate, parseRef, shortHash, type RefKind } from './model'

export const ROW_H = 28
const LANE_W = 14
/** 線數超過這個只畫到這裡（極少見，避免圖把訊息擠掉） */
const MAX_LANES = 16

// dataviz 參考色盤 slot 1–8（同 features/trends/palette.ts），淺／深色各一階；Tailwind 需要靜態字串
const LANE_STROKE = [
  'stroke-[#3d8fe0] dark:stroke-[#4290e2]',
  'stroke-[#f0804f] dark:stroke-[#dc6a3c]',
  'stroke-[#2cb68a] dark:stroke-[#1a9e74]',
  'stroke-[#e9a520] dark:stroke-[#c4880f]',
  'stroke-[#de7fb0] dark:stroke-[#d0659a]',
  'stroke-[#4c9f45] dark:stroke-[#2f8f34]',
  'stroke-[#7a6ad8] dark:stroke-[#8a7ce6]',
  'stroke-[#e05f60] dark:stroke-[#e06363]',
]
const LANE_FILL = [
  'fill-[#3d8fe0] dark:fill-[#4290e2]',
  'fill-[#f0804f] dark:fill-[#dc6a3c]',
  'fill-[#2cb68a] dark:fill-[#1a9e74]',
  'fill-[#e9a520] dark:fill-[#c4880f]',
  'fill-[#de7fb0] dark:fill-[#d0659a]',
  'fill-[#4c9f45] dark:fill-[#2f8f34]',
  'fill-[#7a6ad8] dark:fill-[#8a7ce6]',
  'fill-[#e05f60] dark:fill-[#e06363]',
]
const stroke = (i: number) => LANE_STROKE[i % LANE_STROKE.length]
const fill = (i: number) => LANE_FILL[i % LANE_FILL.length]

const x = (i: number) => Math.min(i, MAX_LANES - 1) * LANE_W + LANE_W / 2
const MID = ROW_H / 2

/** 上下兩點之間的 S 曲線（同一條線就是直線） */
const curve = (x1: number, y1: number, x2: number, y2: number) =>
  x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`

function GraphCell({ row, width, merge }: { row: GraphRow; width: number; merge: boolean }) {
  return (
    <svg aria-hidden width={width} height={ROW_H} className="shrink-0 overflow-visible" data-slot="git-graph-cell">
      <g fill="none" strokeWidth={2} strokeLinecap="round">
        {row.pass.map(([a, b]) => (
          <path key={`p${a}`} d={curve(x(a), 0, x(b), ROW_H)} className={stroke(a)} />
        ))}
        {row.into.map((a) => (
          <path key={`i${a}`} d={curve(x(a), 0, x(row.col), MID)} className={stroke(a)} />
        ))}
        {row.out.map((b) => (
          <path key={`o${b}`} d={curve(x(row.col), MID, x(b), ROW_H)} className={stroke(Math.max(b, row.col))} />
        ))}
      </g>
      {merge ? (
        <circle cx={x(row.col)} cy={MID} r={4} strokeWidth={2} className={cn('fill-background', stroke(row.col))} />
      ) : (
        <circle cx={x(row.col)} cy={MID} r={4} className={fill(row.col)} />
      )}
    </svg>
  )
}

const REF_CLASS: Record<RefKind, string> = {
  head: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  branch: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  remote: 'border-border text-muted-foreground',
  tag: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

const REF_TITLE: Record<RefKind, string> = { head: '目前 HEAD', branch: '本機分支', remote: '遠端分支', tag: 'tag' }

export function RefBadges({ refs }: { refs: string[] }) {
  return (
    <>
      {refs.flatMap(parseRef).map((r) => (
        <Badge key={`${r.kind}:${r.label}`} variant="outline" data-ref-kind={r.kind} title={REF_TITLE[r.kind]} className={cn('font-mono', REF_CLASS[r.kind])}>
          {r.label}
        </Badge>
      ))}
    </>
  )
}

export function CommitHistory({
  commits,
  selected,
  onSelect,
  now,
}: {
  commits: GitCommit[]
  selected: string | null
  onSelect(hash: string): void
  now: number
}) {
  const rows = useMemo(() => layoutGraph(commits), [commits])
  const list = useRef<HTMLOListElement>(null)

  // 網址帶進來的 commit 可能在捲動區外：捲到看得到（已在畫面內時不動）
  useEffect(() => {
    if (selected) list.current?.querySelector('[aria-current=true]')?.scrollIntoView?.({ block: 'nearest' })
  }, [selected]) // 不依賴 commits：每 10 秒輪詢換新陣列時不把使用者捲走的位置拉回來
  const lanes = Math.min(MAX_LANES, Math.max(1, ...rows.map((r) => r.width)))
  const width = lanes * LANE_W

  if (commits.length === 0) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">還沒有任何 commit</p>

  return (
    <ol ref={list} data-testid="git-commits" className="flex flex-col">
      {commits.map((c, i) => {
        const active = c.hash === selected
        return (
          <li key={c.hash}>
            <button
              type="button"
              data-testid={`git-commit-${c.hash.slice(0, 7)}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(c.hash)}
              style={{ height: ROW_H }}
              className={cn(
                'flex w-full items-center gap-3 px-3 text-left text-sm hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none',
                active && 'bg-muted',
              )}
            >
              <GraphCell row={rows[i]} width={width} merge={c.parents.length > 1} />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{shortHash(c.hash)}</span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {c.refs.length > 0 && (
                  // 窄欄時 ref 徽章最多佔一半寬，超出裁掉（hover 整列看 title），不壓到訊息
                  <span className="flex max-w-1/2 shrink-0 gap-1 overflow-hidden" title={c.refs.join(', ')}>
                    <RefBadges refs={c.refs} />
                  </span>
                )}
                <span className={cn('min-w-0 truncate', c.parents.length > 1 && 'text-muted-foreground')}>{c.subject}</span>
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground xl:inline">{c.author}</span>
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums" title={formatDate(c.time)}>
                {formatAgo(c.time, now)}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
