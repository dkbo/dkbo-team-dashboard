import type { GitDiffLine, GitFileDiff } from '@dash/shared'
import { GIT_DIFF_MAX_LINES } from '@dash/shared'
import { cn } from '@/lib/utils'

const ROW_CLASS: Record<GitDiffLine['kind'], string> = {
  add: 'bg-emerald-500/10',
  del: 'bg-red-500/10',
  ctx: '',
  note: 'text-muted-foreground italic',
}

const SIGN: Record<GitDiffLine['kind'], string> = { add: '+', del: '-', ctx: ' ', note: '' }

const SIGN_CLASS: Record<GitDiffLine['kind'], string> = {
  add: 'text-emerald-700 dark:text-emerald-400',
  del: 'text-red-700 dark:text-red-400',
  ctx: 'text-muted-foreground',
  note: '',
}

function Num({ n }: { n: number | null }) {
  return <td className="w-px border-r px-2 text-right align-top text-muted-foreground tabular-nums select-none">{n ?? ''}</td>
}

/** 單一檔案的 unified diff：舊／新行號、+/- 與底色；長行在窗格內橫向捲動，不換行（保留縮排對齊） */
export function DiffView({ diff }: { diff: GitFileDiff }) {
  if (diff.binary) return <p className="p-6 text-center text-sm text-muted-foreground">二進位檔，不顯示 diff</p>
  if (diff.hunks.length === 0)
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {diff.change === 'R' || diff.change === 'C' ? '只改名，內容沒變' : '沒有文字差異（例如只改了檔案權限）'}
      </p>
    )
  return (
    <div data-testid="git-diff" className="min-w-max font-mono text-xs leading-5">
      {diff.hunks.map((h, i) => (
        <table key={i} className="w-full border-collapse">
          <tbody>
            <tr className="bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <td colSpan={4} className="sticky left-0 px-3 py-0.5">
                @@ −{h.oldStart} +{h.newStart} @@ {h.header}
              </td>
            </tr>
            {h.lines.map((l, j) => (
              <tr key={j} data-kind={l.kind} className={ROW_CLASS[l.kind]}>
                <Num n={l.old} />
                <Num n={l.new} />
                <td className={cn('w-4 pl-2 select-none', SIGN_CLASS[l.kind])}>{SIGN[l.kind]}</td>
                <td className="pr-4 whitespace-pre">{l.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      {diff.truncated && <p className="px-3 py-2 text-muted-foreground">超過 {GIT_DIFF_MAX_LINES} 行，後面沒有顯示</p>}
    </div>
  )
}
