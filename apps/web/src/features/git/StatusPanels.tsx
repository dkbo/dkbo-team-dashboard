import type { ReactNode } from 'react'
import { statusCounts, type GitCommitDetail, type GitStatus, type GitStatusFile, type GitWorktree } from '@dash/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { RefBadges } from './CommitHistory'
import { CHANGE_LABEL, formatDate, groupFiles, relPath, shortHash } from './model'

const CODE_CLASS: Record<string, string> = {
  M: 'text-amber-600 dark:text-amber-400',
  A: 'text-emerald-600 dark:text-emerald-400',
  D: 'text-red-600 dark:text-red-400',
  R: 'text-sky-600 dark:text-sky-400',
  C: 'text-sky-600 dark:text-sky-400',
  U: 'text-red-600 dark:text-red-400',
  '?': 'text-muted-foreground',
}

/** 路徑在每個 / 後面給斷行點：窄欄先在目錄邊界換行，不把檔名切成兩半 */
function PathText({ p }: { p: string }) {
  const parts = p.split('/')
  return (
    <>
      {parts.map((seg, i) => (
        <span key={i}>
          {seg}
          {i < parts.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </span>
      ))}
    </>
  )
}

function Code({ c }: { c: string }) {
  return (
    <span title={CHANGE_LABEL[c] ?? c} className={cn('w-3 shrink-0 text-center font-mono text-xs font-semibold', CODE_CLASS[c])}>
      {c}
    </span>
  )
}

function FileList({ title, files, code }: { title: string; files: GitStatusFile[]; code(f: GitStatusFile): string }) {
  if (files.length === 0) return null
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">
        {title} <span className="tabular-nums">{files.length}</span>
      </h3>
      <ul className="flex flex-col gap-0.5">
        {files.map((f) => (
          <li key={f.path} className="flex items-baseline gap-2 font-mono text-xs">
            <Code c={code(f)} />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {f.orig && <span className="text-muted-foreground"><PathText p={f.orig} /> → </span>}
              <PathText p={f.path} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Upstream({ s }: { s: GitStatus }) {
  if (!s.upstream) return <span className="text-muted-foreground">沒有 upstream</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{s.upstream}</span>
      <span title="領先 upstream 的 commit 數" className={cn('tabular-nums', s.ahead ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground')}>
        ↑{s.ahead ?? 0}
      </span>
      <span title="落後 upstream 的 commit 數" className={cn('tabular-nums', s.behind ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
        ↓{s.behind ?? 0}
      </span>
    </span>
  )
}

/** 窗格標題列：滿版時固定在窗格頂端，內容在下面自己捲 */
export function PaneHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3 text-sm font-medium">
      <div className="flex min-w-0 items-center gap-2 truncate">{children}</div>
      {action}
    </div>
  )
}

export function StatusSection({ status }: { status: GitStatus }) {
  const g = groupFiles(status)
  const clean = status.files.length === 0
  return (
    <div data-testid="git-status" className="flex flex-col gap-3 p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">分支</dt>
        <dd className="font-mono break-all">{status.branch ?? <span className="text-amber-600 dark:text-amber-400">detached HEAD</span>}</dd>
        <dt className="text-muted-foreground">HEAD</dt>
        <dd className="font-mono">{shortHash(status.head)}</dd>
        <dt className="text-muted-foreground">upstream</dt>
        <dd className="min-w-0 break-all">
          <Upstream s={status} />
        </dd>
      </dl>
      {clean ? (
        <p data-testid="git-clean" className="text-xs text-emerald-700 dark:text-emerald-400">
          工作樹乾淨，沒有未提交的改動
        </p>
      ) : (
        <>
          <FileList title="衝突" files={g.conflicts} code={() => 'U'} />
          <FileList title="已暫存" files={g.staged} code={(f) => f.x} />
          <FileList title="未暫存" files={g.unstaged} code={(f) => f.y} />
          <FileList title="未追蹤" files={g.untracked} code={() => '?'} />
        </>
      )}
    </div>
  )
}

function ChangeSummary({ status }: { status: GitStatus | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>
  const c = statusCounts(status)
  const parts = [
    c.conflicts && `衝突 ${c.conflicts}`,
    c.staged && `暫存 ${c.staged}`,
    c.unstaged && `未暫存 ${c.unstaged}`,
    c.untracked && `未追蹤 ${c.untracked}`,
  ].filter(Boolean)
  if (parts.length === 0) return <span className="text-emerald-700 dark:text-emerald-400">乾淨</span>
  return <span className={c.conflicts ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}>{parts.join(' · ')}</span>
}

/** 窄欄用的清單（不用表格）：路徑一行，分支／HEAD／改動一行 */
export function WorktreeList({ worktrees, root }: { worktrees: GitWorktree[]; root: string }) {
  return (
    <ul data-testid="git-worktrees" className="flex flex-col divide-y">
      {worktrees.map((w) => (
        <li key={w.path} className="flex flex-col gap-0.5 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono break-all" title={w.path}>
              {relPath(w.path, root)}
            </span>
            {w.main && <Badge variant="outline">主工作樹</Badge>}
            {w.locked && <Badge variant="outline">locked</Badge>}
            {w.prunable && (
              <Badge variant="outline" className="text-red-600 dark:text-red-400">
                prunable
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
            <span className="font-mono text-foreground">
              {w.bare ? 'bare' : w.detached ? <span className="text-amber-600 dark:text-amber-400">detached</span> : (w.branch ?? '—')}
            </span>
            <span className="font-mono">{shortHash(w.head)}</span>
            {w.status?.upstream && (
              <span className="tabular-nums">
                ↑{w.status.ahead ?? 0} ↓{w.status.behind ?? 0}
              </span>
            )}
            <ChangeSummary status={w.status} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function CommitDetailSection({
  detail,
  error,
  openFile,
  onOpenFile,
}: {
  detail: GitCommitDetail | null
  error: string | null
  /** 正在看 diff 的檔 */
  openFile?: string | null
  onOpenFile?(path: string): void
}) {
  if (error)
    return (
      <p role="alert" className="p-3 text-sm text-red-600 dark:text-red-400">
        讀取失敗：{error}
      </p>
    )
  if (!detail) return <p className="p-3 text-sm text-muted-foreground">載入中…</p>
  const add = detail.files.reduce((n, f) => n + (f.additions ?? 0), 0)
  const del = detail.files.reduce((n, f) => n + (f.deletions ?? 0), 0)
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <h2 className="font-medium break-words">{detail.subject}</h2>
      {detail.refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <RefBadges refs={detail.refs} />
        </div>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">hash</dt>
        <dd className="font-mono break-all select-all">{detail.hash}</dd>
        <dt className="text-muted-foreground">parent</dt>
        <dd className="font-mono">{detail.parents.length ? detail.parents.map(shortHash).join(' ') : '（root）'}</dd>
        <dt className="text-muted-foreground">作者</dt>
        <dd className="min-w-0 break-words">
          {detail.author} <span className="text-muted-foreground">&lt;{detail.email}&gt;</span>
          <div className="text-muted-foreground">{formatDate(detail.time)}</div>
        </dd>
        {(detail.committer !== detail.author || detail.commitTime !== detail.time) && (
          <>
            <dt className="text-muted-foreground">提交者</dt>
            <dd>
              {detail.committer} · {formatDate(detail.commitTime)}
            </dd>
          </>
        )}
      </dl>
      {detail.body && <pre className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap [overflow-wrap:anywhere]">{detail.body}</pre>}
      <section aria-label="改動的檔案" className="flex flex-col gap-1">
        <h3 className="text-xs font-medium text-muted-foreground">
          {detail.parents.length > 1 ? '與第一個 parent 比較 · ' : ''}
          {detail.files.length} 個檔案
          <span className="ml-2 text-emerald-600 tabular-nums dark:text-emerald-400">+{add}</span>
          <span className="ml-1 text-red-600 tabular-nums dark:text-red-400">−{del}</span>
        </h3>
        <ul className="flex flex-col gap-0.5">
          {detail.files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                data-testid={`git-file-${f.path}`}
                aria-current={openFile === f.path ? 'true' : undefined}
                onClick={() => onOpenFile?.(f.path)}
                title="看這個檔的 diff"
                className={cn(
                  '-mx-1 flex w-[calc(100%+0.5rem)] items-baseline gap-2 rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-muted/60',
                  openFile === f.path && 'bg-muted',
                )}
              >
                <Code c={f.change} />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {f.orig && (
                    <span className="text-muted-foreground">
                      <PathText p={f.orig} /> →{' '}
                    </span>
                  )}
                  <PathText p={f.path} />
                </span>
                {f.additions == null ? (
                  <span className="shrink-0 text-muted-foreground">binary</span>
                ) : (
                  <span className="shrink-0 tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>{' '}
                    <span className="text-red-600 dark:text-red-400">−{f.deletions}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
