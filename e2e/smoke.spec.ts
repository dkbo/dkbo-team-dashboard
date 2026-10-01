import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { herdrLogFile, snapshotFile } from './fixtures/paths'

// 煙霧測試（AC12）：總覽 → 任務詳情 → 看到波次時間軸
test('總覽列出專案，點進任務詳情看得到波次時間軸', async ({ page }) => {
  await page.goto('/')
  const card = page.getByTestId('project-teamflow')
  await expect(card).toBeVisible()

  // 展開「已結案 N 件」，點一件有多波紀錄的已結案任務（狀態不明的 briefrev 沒有波次，不能用 first()）
  await card.getByText(/已結案 \d+ 件/).click()
  const taskLink = card.locator('a[href="/p/teamflow/t/2026-09-23-ops"]')
  await expect(taskLink).toBeVisible()
  await taskLink.click()

  await expect(page).toHaveURL(/\/p\/teamflow\/t\/2026-09-23-ops$/)
  await expect(page.getByTestId('wave-timeline')).toBeVisible()
  await expect(page.getByTestId('wave-1')).toBeVisible()

  await page.getByRole('link', { name: '回總覽' }).click()
  await expect(page.getByTestId('project-teamflow')).toBeVisible()
})

// AC3／AC4：相容模式標籤、壞路徑錯誤態不影響其他專案
test('相容模式與壞路徑錯誤態', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('project-collect').getByText('相容模式')).toBeVisible()
  await expect(page.getByTestId('project-missing-project').getByText('路徑不存在')).toBeVisible()
  await expect(page.getByTestId('project-teamflow').getByText(/已結案 \d+ 件/)).toBeVisible()
})

// AC9：假 herdr socket 推 pane_updated，畫面 2 秒內更新且不重新整理
test('herdr 狀態改變 2 秒內反映到其他 session 膠囊', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('light-herdr')).toHaveAttribute('data-state', 'ok')
  const pill = page.getByTestId('project-teamflow').getByTestId('other-sessions').locator('[data-slot=status-pill]', { hasText: 'leader-e2e' })
  await expect(pill).toHaveAttribute('data-tone', 'working')

  const original = readFileSync(snapshotFile, 'utf8')
  try {
    const snap = JSON.parse(original)
    for (const p of snap.panes) if (p.pane_id === 'wE:p1') p.agent_status = 'blocked'
    writeFileSync(snapshotFile, JSON.stringify(snap))
    await expect(pill).toHaveAttribute('data-tone', 'blocked', { timeout: 2_000 })
  } finally {
    writeFileSync(snapshotFile, original)
  }
  await expect(pill).toHaveAttribute('data-tone', 'working', { timeout: 2_000 })
})

// herdr 唯讀鏡像：看得到 space、pane 畫面與狀態；背後只跑過 snapshot、pane read 與事件訂閱
test('herdr 鏡像頁顯示 space 與 pane 畫面，且只做唯讀呼叫', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'herdr' }).click()
  await expect(page).toHaveURL(/\/herdr$/)
  await expect(page.getByTestId('herdr-spaces').getByText('teamflow')).toBeVisible()
  const pane = page.getByTestId('herdr-pane-wE:p1')
  await expect(pane.getByText('fake screen wE:p1')).toBeVisible()
  await expect(pane.locator('[data-slot=status-pill]')).toHaveAttribute('data-tone', 'working')
  await page.keyboard.press('z')
  await expect(page).toHaveURL(/z=1/)

  const calls = readFileSync(herdrLogFile, 'utf8').trim().split('\n').map((l) => l.replace(/^\d+ /, ''))
  expect(calls.length).toBeGreaterThan(0)
  for (const c of calls) expect(c).toMatch(/^(api snapshot|pane read wE:p[1-3] --source visible --format ansi|socket events\.subscribe)$/)
})

// 進行中任務的波次時間用 formatMinutes（假 teamflow 的 e2erun 波 2 在 setup 時已開 300 分鐘 → 「5 小時 N 分」）
test('總覽進行中任務顯示「波 N 進行中 · 已 X 小時 Y 分」', async ({ page }) => {
  await page.goto('/')
  const card = page.getByTestId('project-teamflow')
  await expect(card.getByText(/^波 2 進行中 · 已 5 小時 \d+ 分$/)).toBeVisible()
  await card.screenshot({ path: test.info().outputPath('overview-running-wave.png') })
})
