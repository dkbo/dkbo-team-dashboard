import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { gitLogFile } from './fixtures/paths'

// /git：假 teamflow 是真 git repo（fixtures/projects.ts 的 makeTeamflowGit）；collect 不是 repo、missing-project 路徑不存在
test('git 頁顯示狀態、分支圖歷史與 commit 檔案，且只做唯讀呼叫', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'git' }).click()
  await expect(page).toHaveURL(/\/git$/)

  await expect(page.getByTestId('git-project-collect')).toContainText('不是 git repo')
  await expect(page.getByTestId('git-project-missing-project')).toContainText('路徑不存在')
  await page.getByTestId('git-project-teamflow').click()
  await expect(page).toHaveURL(/p=teamflow/)

  const status = page.getByTestId('git-status')
  await expect(status).toContainText('main')
  await expect(status.getByText('README.md')).toBeVisible()

  const commits = page.getByTestId('git-commits')
  await expect(commits.locator('li')).toHaveCount(3)
  await expect(commits.locator('li').first()).toContainText('merge feature/e2e')
  await expect(commits.getByText('HEAD → main')).toBeVisible()
  await expect(commits.getByText('v1', { exact: true })).toBeVisible()

  await commits.getByText('e2e feature work').click()
  const detail = page.getByTestId('git-commit-detail')
  await expect(detail.getByText('feature.txt')).toBeVisible()
  await expect(page).toHaveURL(/c=[0-9a-f]{40}/)

  // 點檔看 diff：中欄換成 diff，Esc 回歷史
  await detail.getByTestId('git-file-feature.txt').click()
  const diff = page.getByTestId('git-diff')
  await expect(diff.locator('tr[data-kind=add]', { hasText: 'feature' })).toBeVisible()
  await expect(page).toHaveURL(/f=feature\.txt/)
  await page.keyboard.press('Escape')
  await expect(diff).toBeHidden()
  await expect(commits).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('git-page.png'), fullPage: true })

  const PREFIX = '--no-optional-locks -c core.fsmonitor=false -c color.ui=never -c core.pager=cat '
  const calls = readFileSync(gitLogFile, 'utf8').trim().split('\n')
  expect(calls.length).toBeGreaterThan(0)
  for (const c of calls) {
    expect(c.startsWith(PREFIX)).toBe(true)
    expect(c.slice(PREFIX.length)).toMatch(/^(status|worktree list|log|show -s|diff-tree) /)
    if (c.includes(' -p ')) expect(c).toContain('--no-ext-diff --no-textconv')
  }
})
