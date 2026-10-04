import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { GitCommitDetail, GitFileDiff, GitRepoResponse, GitSummaryResponse } from '@dash/shared'
import { TooltipProvider } from '@/components/ui/tooltip'
import { formatAgo, groupFiles, parseRef, relPath } from '@/features/git/model'
import GitPage from '@/pages/git/GitPage'

const NOW = new Date('2026-10-01T12:00:00').getTime()
const H = (c: string) => c.repeat(40)

const summaries: GitSummaryResponse = {
  generatedAt: NOW,
  projects: [
    { project: 'alpha', path: '/p/alpha', error: null, branch: 'main', ahead: 1, behind: 0, counts: { staged: 1, unstaged: 1, untracked: 0, conflicts: 0 }, worktrees: 2 },
    { project: 'plain', path: '/p/plain', error: { kind: 'not-git', message: '不是 git repo' }, branch: null, ahead: null, behind: null, counts: null, worktrees: 0 },
  ],
}

const repo = (limit: number): GitRepoResponse => ({
  project: 'alpha',
  path: '/p/alpha',
  generatedAt: NOW,
  truncated: limit < 400,
  status: {
    branch: 'main',
    head: H('c'),
    upstream: 'origin/main',
    ahead: 1,
    behind: 0,
    files: [
      { path: 'a.ts', orig: null, x: 'M', y: '.', conflict: false },
      { path: 'b.ts', orig: null, x: '.', y: 'M', conflict: false },
    ],
  },
  worktrees: [
    { path: '/p/alpha', head: H('c'), branch: 'main', detached: false, bare: false, locked: false, prunable: false, main: true, status: null },
    {
      path: '/p/alpha/.worktrees/dev',
      head: H('b'),
      branch: 'task/dev',
      detached: false,
      bare: false,
      locked: false,
      prunable: false,
      main: false,
      status: { branch: 'task/dev', head: H('b'), upstream: null, ahead: null, behind: null, files: [] },
    },
  ],
  commits: [
    { hash: H('c'), parents: [H('a'), H('b')], author: 'Ann', email: 'a@x', time: NOW / 1000 - 120, subject: 'merge dev', refs: ['HEAD -> main', 'origin/main'] },
    { hash: H('b'), parents: [H('a')], author: 'Bob', email: 'b@x', time: NOW / 1000 - 7200, subject: 'dev work', refs: ['task/dev'] },
    { hash: H('a'), parents: [], author: 'Ann', email: 'a@x', time: NOW / 1000 - 86400 * 3, subject: 'init', refs: ['tag: v1'] },
  ],
})

const detail: GitCommitDetail = {
  ...repo(200).commits[1],
  body: 'longer body',
  committer: 'Bob',
  commitTime: NOW / 1000 - 7200,
  files: [
    { path: 'new.ts', orig: 'old.ts', change: 'R', additions: 2, deletions: 1 },
    { path: 'img.png', orig: null, change: 'A', additions: null, deletions: null },
  ],
}

const fileDiff: GitFileDiff = {
  hash: H('b'),
  path: 'new.ts',
  orig: 'old.ts',
  change: 'R',
  binary: false,
  truncated: false,
  hunks: [
    {
      header: 'export function f()',
      oldStart: 4,
      newStart: 4,
      lines: [
        { kind: 'ctx', old: 4, new: 4, text: 'keep' },
        { kind: 'del', old: 5, new: null, text: 'gone line' },
        { kind: 'add', old: null, new: 5, text: 'added line' },
      ],
    },
  ],
}

const calls: string[] = []

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const u = new URL(url, 'http://x')
      const body =
        u.pathname === '/api/git'
          ? summaries
          : u.pathname === '/api/git/alpha'
            ? repo(Number(u.searchParams.get('limit')))
            : u.pathname === `/api/git/alpha/commits/${H('b')}`
              ? detail
              : u.pathname === `/api/git/alpha/commits/${H('b')}/diff` && u.searchParams.get('path') === 'new.ts'
                ? fileDiff
                : u.pathname === `/api/git/alpha/commits/${H('b')}/diff` && u.searchParams.get('path') === 'img.png'
                  ? { ...fileDiff, path: 'img.png', orig: null, change: 'A', binary: true, hunks: [] }
                  : null
      if (!body) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

let location = ''
function Loc() {
  location = useLocation().search
  return null
}

const renderPage = (url = '/git') =>
  render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/git"
            element={
              <>
                <GitPage />
                <Loc />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )

describe('git model', () => {
  it('groupFiles：同檔可同時已暫存與未暫存', () => {
    const g = groupFiles({ ...repo(1).status, files: [{ path: 'x', orig: null, x: 'M', y: 'M', conflict: false }] })
    expect([g.staged.length, g.unstaged.length]).toEqual([1, 1])
  })
  it('parseRef：HEAD、tag、遠端、含斜線的本機分支', () => {
    expect(parseRef('HEAD -> main')).toEqual([{ kind: 'head', label: 'HEAD → main' }])
    expect(parseRef('tag: v1')[0].kind).toBe('tag')
    expect(parseRef('origin/main')[0].kind).toBe('remote')
    expect(parseRef('feat/git-view')[0].kind).toBe('branch')
  })
  it('formatAgo 與 relPath', () => {
    expect(formatAgo(NOW / 1000 - 30, NOW)).toBe('剛剛')
    expect(formatAgo(NOW / 1000 - 600, NOW)).toBe('10 分鐘前')
    expect(formatAgo(NOW / 1000 - 3 * 86400, NOW)).toBe('3 天前')
    expect(formatAgo(NOW / 1000 - 60 * 86400, NOW)).toMatch(/^\d{4}-\d{2}-\d{2} /)
    expect(relPath('/p/a/.worktrees/x', '/p/a')).toBe('.worktrees/x')
    expect(relPath('/p/a', '/p/a')).toBe('.')
    expect(relPath('/elsewhere', '/p/a')).toBe('/elsewhere')
  })
})

describe('GitPage', () => {
  it('預設選第一個專案：狀態、worktree、歷史與圖', async () => {
    renderPage()
    const status = await screen.findByTestId('git-status')
    expect(within(status).getByText('已暫存', { exact: false })).toBeTruthy()
    expect(within(status).getByText('a.ts')).toBeTruthy()
    expect(within(status).getByText('origin/main')).toBeTruthy()
    const wt = screen.getByTestId('git-worktrees')
    expect(within(wt).getByText('.worktrees/dev')).toBeTruthy()
    expect(within(wt).getByText('乾淨')).toBeTruthy()
    const commits = screen.getByTestId('git-commits')
    expect(within(commits).getByText('merge dev')).toBeTruthy()
    expect(within(commits).getByText('HEAD → main')).toBeTruthy()
    expect(within(commits).getByText('v1')).toBeTruthy()
    expect(commits.querySelectorAll('[data-slot=git-graph-cell]')).toHaveLength(3)
    expect(calls).toContain('/api/git/alpha?limit=200')
  })

  it('點 commit 開詳情並寫進網址；再點一次關掉', async () => {
    renderPage()
    const row = await screen.findByTestId(`git-commit-${H('b').slice(0, 7)}`)
    await userEvent.click(row)
    const d = await screen.findByTestId('git-commit-detail')
    await waitFor(() => expect(within(d).getByText('longer body')).toBeTruthy())
    expect(within(d).getByText('new.ts')).toBeTruthy()
    expect(within(d).getByText('old.ts')).toBeTruthy()
    expect(within(d).getByText('binary')).toBeTruthy()
    expect(location).toContain(`c=${H('b')}`)
    await userEvent.click(row)
    await waitFor(() => expect(screen.queryByTestId('git-commit-detail')).toBeNull())
  })

  it('截斷時可載入更多', async () => {
    renderPage('/git?p=alpha')
    await userEvent.click(await screen.findByRole('button', { name: '載入更多' }))
    await waitFor(() => expect(calls).toContain('/api/git/alpha?limit=400'))
    await waitFor(() => expect(screen.queryByRole('button', { name: '載入更多' })).toBeNull())
  })

  it('不是 git repo 的專案顯示錯誤，不呼叫 repo API', async () => {
    renderPage('/git?p=plain')
    expect(await screen.findByText('plain：不是 git repo')).toBeTruthy()
    expect(calls.some((c) => c.startsWith('/api/git/plain'))).toBe(false)
  })

  it('網址帶了不存在的專案', async () => {
    renderPage('/git?p=nope')
    expect(await screen.findByText('找不到專案 nope')).toBeTruthy()
    expect(calls.some((c) => c.startsWith('/api/git/nope'))).toBe(false)
  })

  it('點詳情裡的檔看 diff：中欄換成 diff、網址帶 f；Esc 回歷史、再 Esc 關詳情', async () => {
    renderPage(`/git?p=alpha&c=${H('b')}`)
    await userEvent.click(await screen.findByTestId('git-file-new.ts'))
    const d = await screen.findByTestId('git-diff')
    expect(within(d).getByText('added line').closest('tr')!.getAttribute('data-kind')).toBe('add')
    expect(within(d).getByText('gone line').closest('tr')!.getAttribute('data-kind')).toBe('del')
    expect(within(d).getByText('@@ −4 +4 @@ export function f()')).toBeTruthy()
    expect(location).toContain('f=new.ts')
    expect(calls).toContain(`/api/git/alpha/commits/${H('b')}/diff?path=new.ts`)
    expect(screen.getByTestId('git-history-scroll').closest('[data-slot=card]')!.className).toContain('hidden')

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('git-diff')).toBeNull())
    expect(location).not.toContain('f=')
    expect(screen.getByTestId('git-commit-detail')).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('git-commit-detail')).toBeNull())
  })

  it('網址直接帶 f：二進位檔顯示說明，不畫空表', async () => {
    renderPage(`/git?p=alpha&c=${H('b')}&f=img.png`)
    expect(await screen.findByText('二進位檔，不顯示 diff')).toBeTruthy()
    expect(screen.queryByTestId('git-diff')).toBeNull()
  })

  it('工具頁骨架：PageHeader compact 帶唯讀說明；左欄三段 SidebarList', async () => {
    renderPage()
    await screen.findByTestId('git-status')
    const h1 = screen.getByRole('heading', { level: 1, name: 'git' })
    expect(h1.closest('[data-slot=page-header]')).toHaveAttribute('data-size', 'compact')
    expect(h1.closest('[data-slot=page-header]')).toHaveTextContent('唯讀')
    const titles = [...document.querySelectorAll('[data-slot=sidebar-section-title]')].map((e) => e.textContent)
    expect(titles).toEqual(['專案2', '工作樹狀態', 'Worktree2'])
  })

  it('專案項目：SidebarItem，狀態 Tag（改動 warn、乾淨 ok），錯誤專案顯示錯誤；點了寫網址', async () => {
    renderPage()
    await screen.findByTestId('git-status')
    const alpha = screen.getByTestId('git-project-alpha')
    expect(alpha).toHaveAttribute('data-slot', 'sidebar-item')
    expect(alpha).toHaveAttribute('aria-current', 'true')
    expect(within(alpha).getByText('2 改動').closest('[data-slot=tag]')).toHaveAttribute('data-variant', 'warn')
    expect(within(screen.getByTestId('git-project-plain')).getByText('不是 git repo')).toBeTruthy()
    const wt = screen.getByTestId('git-worktrees')
    expect(within(wt).getByText('乾淨').closest('[data-slot=tag]')).toHaveAttribute('data-variant', 'ok')
    await userEvent.click(screen.getByTestId('git-project-plain'))
    expect(location).toContain('p=plain')
  })

  it('commit 列的 ref 用 Tag：HEAD info、遠端 neutral、版本 tag brand＋圖示', async () => {
    renderPage()
    const commits = await screen.findByTestId('git-commits')
    const tag = (t: string) => within(commits).getByText(t).closest('[data-slot=tag]')!
    expect(tag('HEAD → main')).toHaveAttribute('data-variant', 'info')
    expect(tag('origin/main')).toHaveAttribute('data-variant', 'neutral')
    expect(tag('v1')).toHaveAttribute('data-variant', 'brand')
    expect(tag('v1').querySelector('svg')).toBeTruthy()
  })

  it('摘要讀取失敗用 Banner＋重試', async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => new Response('{}', { status: 500 }))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'banner')
    expect(within(alert).getByRole('button', { name: '重試' })).toBeTruthy()
  })
})
