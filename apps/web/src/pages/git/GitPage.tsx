import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ArrowLeft, GitCommitHorizontal, X } from 'lucide-react'
import { GIT_LOG_MAX, isClean, type GitSummary } from '@dash/shared'
import { api } from '@/api/client'
import { Banner, BannerAction } from '@/components/app/Banner'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/app/PageHeader'
import { PaneBody, PaneHeader } from '@/components/app/PaneHeader'
import { SidebarItem, SidebarList, SidebarSection } from '@/components/app/SidebarList'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CommitHistory } from '@/features/git/CommitHistory'
import { DiffView } from '@/features/git/DiffView'
import { GIT_PAGE, GIT_POLL_MS } from '@/features/git/model'
import { CommitDetailSection, StatusSection, WorktreeList } from '@/features/git/StatusPanels'
import { useCommit, useFileDiff, usePolled } from '@/features/git/useGit'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'

const ERROR_TEXT: Record<string, string> = { missing: '路徑不存在', 'not-git': '不是 git repo', timeout: 'git 逾時', exit: 'git 失敗' }

const READONLY_NOTE = '唯讀：只跑 status／worktree list／log／show，每 10 秒更新；不 fetch，遠端狀態以本機最後一次 fetch 為準'

/** 專案狀態 Tag：乾淨 ok、N 改動 warn、有衝突 danger（§6.4） */
function ProjectState({ s }: { s: GitSummary }) {
  const c = s.counts
  if (!c || isClean(c)) return <Tag variant="ok">乾淨</Tag>
  if (c.conflicts) return <Tag variant="danger">{c.conflicts} 衝突</Tag>
  return <Tag variant="warn">{c.staged + c.unstaged + c.untracked} 改動</Tag>
}

function ProjectItem({ s, active, onClick }: { s: GitSummary; active: boolean; onClick(): void }) {
  return (
    <SidebarItem
      data-testid={`git-project-${s.project}`}
      title={s.project}
      selected={active}
      onClick={onClick}
      error={s.error ? (ERROR_TEXT[s.error.kind] ?? s.error.message) : undefined}
      subtitle={
        <>
          <span className="min-w-0 truncate font-mono">{s.branch ?? 'detached'}</span>
          <ProjectState s={s} />
          {(s.ahead ?? 0) > 0 && <span className="tabular-nums">↑{s.ahead}</span>}
          {(s.behind ?? 0) > 0 && <span className="tabular-nums">↓{s.behind}</span>}
        </>
      }
    />
  )
}

function ErrorBanner({ text, stale, onRetry }: { text: string; stale: boolean; onRetry(): void }) {
  return (
    <Banner tone={stale ? 'warn' : 'danger'} title={stale ? '更新失敗，顯示的是舊資料' : '載入失敗'} action={<BannerAction onClick={onRetry}>重試</BannerAction>}>
      <code className="font-mono text-xs break-all">{text}</code>
    </Banner>
  )
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
    <EmptyState icon="🔍" title={`找不到專案 ${project}`} hint="網址的 ?p= 可能打錯了，或專案已從設定移除" />
  ) : summary?.error ? (
    <EmptyState
      icon="⚠️"
      title={`${project}：${ERROR_TEXT[summary.error.kind] ?? 'git 失敗'}`}
      hint={<code className="font-mono text-xs break-all">{summary.error.message}</code>}
    />
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
    // 工具頁骨架（§4.5）：lg 以上高度＝視窗扣掉頂部列，body 不捲，各窗格卡片自己捲
    <div className="flex flex-col gap-3 p-3 lg:h-(--tool-h)">
      <PageHeader size="compact" title="git" subtitle={READONLY_NOTE} />
      {summaries.error && <ErrorBanner text={summaries.error} stale={summaries.data != null} onRetry={summaries.reload} />}
      {repo.error && <ErrorBanner text={repo.error} stale={data != null} onRetry={repo.reload} />}

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-3',
          selected ? 'lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)_var(--detail-w)]' : 'lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]',
        )}
      >
        {/* 左欄：一張卡、三段 SidebarList（專案、工作樹狀態、Worktree） */}
        <Card variant="pane" className="max-lg:max-h-(--pane-max-h-sm)">
          <SidebarList>
            <SidebarSection title="專案" count={<Tag count={projects.length} />}>
              {summaries.data
                ? projects.map((s) => <ProjectItem key={s.project} s={s} active={s.project === project} onClick={() => set('p', s.project)} />)
                : summaries.loading && <Skeleton className="m-1 h-24" />}
            </SidebarSection>
            {data && (
              <>
                <SidebarSection title="工作樹狀態">
                  <StatusSection status={data.status} />
                </SidebarSection>
                <SidebarSection title="Worktree" count={<Tag count={data.worktrees.length} />}>
                  <WorktreeList worktrees={data.worktrees} root={data.path} />
                </SidebarSection>
              </>
            )}
          </SidebarList>
        </Card>

        {/* 中欄：歷史；選了檔就換成那個檔的 diff（歷史保留在 DOM 裡，回來時捲動位置不變） */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {file && (
            <Card variant="pane" className="flex-1 max-lg:h-(--pane-max-h-sm)">
              <PaneHeader
                title={
                  <span className="font-mono" title={file}>
                    {diff.data?.orig && <span className="text-muted-foreground">{diff.data.orig} → </span>}
                    {file}
                  </span>
                }
                info={selected && <span className="font-mono text-xs">@ {selected.slice(0, 7)}</span>}
                actions={
                  <Button size="sm" variant="ghost" onClick={() => set('f', null)}>
                    <ArrowLeft aria-hidden />
                    回歷史
                  </Button>
                }
              />
              <PaneBody data-testid="git-diff-scroll">
                {diff.error ? (
                  <Banner tone="danger" size="sm" title={`讀取失敗：${diff.error}`} className="m-3" />
                ) : diff.data ? (
                  <DiffView diff={diff.data} />
                ) : (
                  <div data-testid="git-diff-loading" className="flex flex-col gap-1 p-3">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-4" />
                    ))}
                  </div>
                )}
              </PaneBody>
            </Card>
          )}
          <Card variant="pane" className={cn('flex-1 max-lg:h-(--pane-max-h-sm)', file && 'hidden')}>
            <PaneHeader title="歷史" info={data && `所有分支與 tag · ${data.commits.length} 筆`} />
            <PaneBody data-testid="git-history-scroll">{history}</PaneBody>
          </Card>
        </div>

        {/* 右欄：commit 詳情（選了才出現） */}
        {selected && (
          <Card variant="pane" className="max-lg:max-h-(--pane-max-h-sm)">
            <PaneHeader
              title={
                <span className="inline-flex items-center gap-1.5">
                  <GitCommitHorizontal aria-hidden className="size-4 text-brand-violet" />
                  Commit 詳情
                </span>
              }
              actions={
                <Button size="icon-xs" variant="ghost" onClick={() => set('c', null)} aria-label="關閉 commit 詳情" title="關閉（Esc）">
                  <X />
                </Button>
              }
            />
            <PaneBody data-testid="git-commit-detail">
              <CommitDetailSection detail={commit.data} error={commit.error} openFile={file} onOpenFile={(f) => set('f', f === file ? null : f)} />
            </PaneBody>
          </Card>
        )}
      </div>
    </div>
  )
}
