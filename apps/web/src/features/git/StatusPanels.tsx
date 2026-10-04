import { CircleCheck } from 'lucide-react'
import { statusCounts, type GitCommitDetail, type GitStatus, type GitStatusFile, type GitWorktree } from '@dash/shared'
import { Banner } from '@/components/app/Banner'
import { Tag } from '@/components/app/Tag'
import { cn } from '@/lib/utils'
import { RefBadges } from './CommitHistory'
import { CHANGE_LABEL, formatDate, groupFiles, relPath, shortHash } from './model'

const CODE_CLASS: Record<string, string> = {
  M: 'text-status-warn-fg',
  A: 'text-status-ok-fg',
  D: 'text-status-danger-fg',
  R: 'text-status-info-fg',
  C: 'text-status-info-fg',
  U: 'text-status-danger-fg',
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
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {title} <Tag count={files.length} />
      </h3>
      <ul className="flex flex-col gap-0.5">
        {files.map((f) => (
          <li key={f.path} className="flex items-baseline gap-2 font-mono text-xs">
            <Code c={code(f)} />
            <span className="min-w-0 wrap-anywhere">
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
      <span title="領先 upstream 的 commit 數" className={cn('tabular-nums', s.ahead ? 'text-status-info-fg' : 'text-muted-foreground')}>
        ↑{s.ahead ?? 0}
      </span>
      <span title="落後 upstream 的 commit 數" className={cn('tabular-nums', s.behind ? 'text-status-warn-fg' : 'text-muted-foreground')}>
        ↓{s.behind ?? 0}
      </span>
    </span>
  )
}

export function StatusSection({ status }: { status: GitStatus }) {
  const g = groupFiles(status)
  const clean = status.files.length === 0
  return (
    <div data-testid="git-status" className="flex flex-col gap-3 px-3 py-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">分支</dt>
        <dd className="font-mono break-all">{status.branch ?? <span className="text-status-warn-fg">detached HEAD</span>}</dd>
        <dt className="text-muted-foreground">HEAD</dt>
        <dd className="font-mono">{shortHash(status.head)}</dd>
        <dt className="text-muted-foreground">upstream</dt>
        <dd className="min-w-0 break-all">
          <Upstream s={status} />
        </dd>
      </dl>
      {clean ? (
        <p data-testid="git-clean" className="flex items-center gap-1.5 text-xs font-semibold text-status-ok-fg">
          <CircleCheck aria-hidden className="size-3.5 shrink-0" />
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
  if (parts.length === 0) return <Tag variant="ok">乾淨</Tag>
  return <Tag variant={c.conflicts ? 'danger' : 'warn'}>{parts.join(' · ')}</Tag>
}

/** 窄欄用的清單（不用表格）：路徑一行，分支／HEAD／改動一行 */
export function WorktreeList({ worktrees, root }: { worktrees: GitWorktree[]; root: string }) {
  return (
    <ul data-testid="git-worktrees" className="flex flex-col divide-y">
      {worktrees.map((w) => (
        <li key={w.path} className="flex flex-col gap-1 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold break-all" title={w.path}>
              {relPath(w.path, root)}
            </span>
            {w.main && <Tag>主工作樹</Tag>}
            {w.locked && <Tag>locked</Tag>}
            {w.prunable && <Tag variant="danger">prunable</Tag>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span className="font-mono">
              {w.bare ? 'bare' : w.detached ? <span className="text-status-warn-fg">detached</span> : (w.branch ?? '—')}
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
  if (error) return <Banner tone="danger" size="sm" title={`讀取失敗：${error}`} className="m-3" />
  if (!detail) return <p className="p-4 text-sm text-muted-foreground">載入中…</p>
  const add = detail.files.reduce((n, f) => n + (f.additions ?? 0), 0)
  const del = detail.files.reduce((n, f) => n + (f.deletions ?? 0), 0)
  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <h2 className="text-base font-bold break-words">{detail.subject}</h2>
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
      {detail.body && <pre className="rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap wrap-anywhere">{detail.body}</pre>}
      <section aria-label="改動的檔案" className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold text-muted-foreground">
          {detail.parents.length > 1 ? '與第一個 parent 比較 · ' : ''}
          {detail.files.length} 個檔案
          <span className="ml-2 text-status-ok-fg tabular-nums">+{add}</span>
          <span className="ml-1 text-status-danger-fg tabular-nums">−{del}</span>
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
                  'flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2 py-1 text-left font-mono text-xs transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
                  openFile === f.path && 'bg-accent text-accent-foreground',
                )}
              >
                <Code c={f.change} />
                <span className="min-w-0 flex-1 wrap-anywhere">
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
                    <span className="text-status-ok-fg">+{f.additions}</span>{' '}
                    <span className="text-status-danger-fg">−{f.deletions}</span>
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
