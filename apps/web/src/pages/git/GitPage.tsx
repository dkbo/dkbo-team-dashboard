import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { GIT_LOG_MAX, isClean, type GitSummary } from '@dash/shared'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CommitHistory } from '@/features/git/CommitHistory'
import { DiffView } from '@/features/git/DiffView'
import { GIT_PAGE, GIT_POLL_MS } from '@/features/git/model'
import { CommitDetailSection, PaneHeader, StatusSection, WorktreeList } from '@/features/git/StatusPanels'
import { useCommit, useFileDiff, usePolled } from '@/features/git/useGit'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'

const ERROR_TEXT: Record<string, string> = { missing: '路徑不存在', 'not-git': '不是 git repo', timeout: 'git 逾時', exit: 'git 失敗' }

const READONLY_NOTE = '唯讀：只跑 status／worktree list／log／show，每 10 秒更新；不 fetch，遠端狀態以本機最後一次 fetch 為準'

function ProjectTab({ s, active, onClick }: { s: GitSummary; active: boolean; onClick(): void }) {
  const dirty = s.counts && !isClean(s.counts) ? s.counts.staged + s.counts.unstaged + s.counts.untracked + s.counts.conflicts : 0
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={`git-project-${s.project}`}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors lg:w-full',
        active ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <span className="max-w-full truncate font-medium">{s.project}</span>
      <span className="flex max-w-full flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {s.error ? (
          <span className="text-red-600 dark:text-red-400">{ERROR_TEXT[s.error.kind] ?? s.error.message}</span>
        ) : (
          <>
            <span className="max-w-full truncate font-mono">{s.branch ?? 'detached'}</span>
            {dirty > 0 ? (
              <span className={cn('tabular-nums', s.counts?.conflicts ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400')}>
                {dirty} 改動
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">乾淨</span>
            )}
            {(s.ahead ?? 0) > 0 && <span className="tabular-nums">↑{s.ahead}</span>}
            {(s.behind ?? 0) > 0 && <span className="tabular-nums">↓{s.behind}</span>}
            {s.worktrees > 1 && <span className="tabular-nums">{s.worktrees} worktree</span>}
          </>
        )}
      </span>
    </button>
  )
}

function ErrorBar({ text, stale, onRetry }: { text: string; stale: boolean; onRetry(): void }) {
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-700 dark:text-red-400"
    >
      <span>
        {stale ? '更新失敗，顯示的是舊資料：' : '載入失敗：'}
        {text}
      </span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        重試
      </Button>
    </div>
  )
}

/** 一個窗格：滿版（lg 以上）時標題固定、內容自己捲；窄螢幕時照內容高度直排 */
function Pane({ header, children, className, bodyClass, testId }: { header: ReactNode; children: ReactNode; className?: string; bodyClass?: string; testId?: string }) {
  return (
    <section className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      {header}
      <div data-testid={testId} className={cn('min-h-0 flex-1 overflow-auto', bodyClass)}>
        {children}
      </div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="p-8 text-center text-sm text-muted-foreground">{children}</div>
}

export default function GitPage() {
  const [params, setParams] = useSearchParams()
  const now = useNow(30_000)
  const summaries = usePolled('all', api.gitSummaries, GIT_POLL_MS)
  const projects = summaries.data?.projects ?? []
  const project = params.get('p') ?? projects[0]?.project ?? null
  const selected = params.get('c')
  const file = selected ? params.get('f') : null
  // 「載入更多」只對當下的專案有效；切換專案就回到第一頁
  const [more, setMore] = useState<{ project: string | null; limit: number }>({ project: null, limit: GIT_PAGE })
  const limit = more.project === project ? more.limit : GIT_PAGE

  const summary = projects.find((s) => s.project === project)
  // 等摘要回來才抓 repo：摘要已經告訴我們哪些專案讀不了，不必再打一次必然失敗的請求
  const canRead = summary != null && summary.error == null
  const repo = usePolled(canRead && project ? `${project}\0${limit}` : null, () => api.gitRepo(project!, limit), GIT_POLL_MS)
  const commit = useCommit(project, selected)
  const diff = useFileDiff(project, selected, file)

  // 換專案清掉 commit 與檔；換 commit 清掉檔
  const set = (k: 'p' | 'c' | 'f', v: string | null) =>
    setParams((p) => {
      if (v == null) p.delete(k)
      else p.set(k, v)
      if (k === 'p') p.delete('c')
      if (k !== 'f') p.delete('f')
      return p
    })

  // Esc：先關 diff 回歷史，再按一次關 commit 詳情
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (file) set('f', null)
      else if (selected) set('c', null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const data = repo.data

  const history = summaries.data && project && !summary ? (
    <Empty>找不到專案 {project}</Empty>
  ) : summary?.error ? (
    <Empty>
      {project}：{ERROR_TEXT[summary.error.kind] ?? 'git 失敗'}
      <div className="mt-1 font-mono text-xs">{summary.error.message}</div>
    </Empty>
  ) : data ? (
    <>
      <CommitHistory commits={data.commits} selected={selected} onSelect={(h) => set('c', h === selected ? null : h)} now={now} />
      {data.truncated && (
        <div className="flex justify-center py-3">
          {limit < GIT_LOG_MAX ? (
            <Button size="sm" variant="outline" onClick={() => setMore({ project, limit: Math.min(GIT_LOG_MAX, limit + GIT_PAGE) })} disabled={repo.loading}>
              載入更多
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">只顯示最近 {GIT_LOG_MAX} 筆</span>
          )}
        </div>
      )}
    </>
  ) : (
    (repo.loading || summaries.loading) && (
      <div data-testid="git-loading" className="flex flex-col gap-2 p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-5" />
        ))}
      </div>
    )
  )

  return (
    // lg 以上滿版：高度＝視窗扣掉頂部列（同 herdr 頁），body 不捲，各窗格自己捲
    <div className="flex flex-col lg:h-[calc(100svh-3.1rem)] lg:overflow-hidden">
      <h1 className="sr-only">Git 狀態與歷史</h1>
      {summaries.error && <ErrorBar text={summaries.error} stale={summaries.data != null} onRetry={summaries.reload} />}
      {repo.error && <ErrorBar text={repo.error} stale={data != null} onRetry={repo.reload} />}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col lg:grid lg:divide-x',
          selected
            ? 'lg:grid-cols-[16rem_minmax(0,1fr)_22rem] xl:grid-cols-[18rem_minmax(0,1fr)_26rem]'
            : 'lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)]',
        )}
      >
        {/* 左欄：專案、工作樹狀態、worktree 由上往下；狀態吃剩下的高度 */}
        <div className="flex min-h-0 flex-col border-b lg:border-b-0">
          <Pane header={<PaneHeader>專案</PaneHeader>} className="shrink-0 lg:max-h-[40%]">
            {summaries.data ? (
              <div role="tablist" aria-label="專案" aria-orientation="vertical" className="flex flex-wrap gap-1 p-2 lg:flex-col lg:flex-nowrap">
                {projects.map((s) => (
                  <ProjectTab key={s.project} s={s} active={s.project === project} onClick={() => set('p', s.project)} />
                ))}
              </div>
            ) : (
              summaries.loading && <Skeleton className="m-2 h-24" />
            )}
          </Pane>
          {data && (
            <>
              <Pane header={<PaneHeader>工作樹狀態</PaneHeader>} className="border-t lg:flex-1" bodyClass="max-h-[50vh] lg:max-h-none">
                <StatusSection status={data.status} />
              </Pane>
              <Pane
                header={
                  <PaneHeader>
                    Worktree <span className="font-normal text-muted-foreground tabular-nums">{data.worktrees.length}</span>
                  </PaneHeader>
                }
                className="shrink-0 border-t lg:max-h-[30%]"
              >
                <WorktreeList worktrees={data.worktrees} root={data.path} />
              </Pane>
            </>
          )}
          <p className="hidden shrink-0 border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground lg:block">{READONLY_NOTE}</p>
        </div>

        {/* 中欄：歷史；選了檔就換成那個檔的 diff（歷史保留在 DOM 裡，回來時捲動位置不變） */}
        <div className="flex min-h-0 min-w-0 flex-col border-b lg:border-b-0">
          {file && (
            <Pane
              header={
                <PaneHeader
                  action={
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => set('f', null)}>
                      ← 回歷史
                    </Button>
                  }
                >
                  <span className="truncate font-mono" title={file}>
                    {diff.data?.orig && <span className="text-muted-foreground">{diff.data.orig} → </span>}
                    {file}
                  </span>
                  {selected && <span className="shrink-0 font-mono font-normal text-muted-foreground">@ {selected.slice(0, 7)}</span>}
                </PaneHeader>
              }
              className="flex-1"
              bodyClass="max-h-[70vh] lg:max-h-none"
              testId="git-diff-scroll"
            >
              {diff.error ? (
                <p role="alert" className="p-3 text-sm text-red-600 dark:text-red-400">
                  讀取失敗：{diff.error}
                </p>
              ) : diff.data ? (
                <DiffView diff={diff.data} />
              ) : (
                <div data-testid="git-diff-loading" className="flex flex-col gap-1 p-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-4" />
                  ))}
                </div>
              )}
            </Pane>
          )}
          <Pane
            header={
              <PaneHeader>
                歷史
                {data && <span className="font-normal text-muted-foreground">所有分支與 tag · {data.commits.length} 筆</span>}
              </PaneHeader>
            }
            className={cn('flex-1', file && 'hidden')}
            bodyClass="max-h-[70vh] lg:max-h-none"
            testId="git-history-scroll"
          >
            {history}
          </Pane>
        </div>

        {/* 右欄：commit 詳情（選了才出現） */}
        {selected && (
          <Pane
            header={
              <PaneHeader
                action={
                  <button type="button" onClick={() => set('c', null)} aria-label="關閉 commit 詳情" className="rounded px-1 text-muted-foreground hover:text-foreground">
                    ✕
                  </button>
                }
              >
                Commit 詳情
              </PaneHeader>
            }
            className="lg:min-w-0"
          >
            <div data-testid="git-commit-detail">
              <CommitDetailSection detail={commit.data} error={commit.error} openFile={file} onOpenFile={(f) => set('f', f === file ? null : f)} />
            </div>
          </Pane>
        )}
      </div>
      <p className="px-3 py-2 text-xs text-muted-foreground lg:hidden">{READONLY_NOTE}</p>
    </div>
  )
}
