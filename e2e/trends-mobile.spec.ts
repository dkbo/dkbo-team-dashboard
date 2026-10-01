import { expect, test, type Page } from '@playwright/test'

// 手機版依任務花費（AC12）：390px 卡片內不橫向捲動，總額與成員細分看得到；768px 起維持表格。
// 小螢幕的表格仍在 DOM（display 切換），所以一律用可見性斷言。

type TaskCost = { project: string; taskDir: string; cost: number; members: Record<string, number>; unmatched: number }
const money = (n: number) => `$${n.toFixed(2)}`

const openTrends = async (page: Page): Promise<TaskCost[]> => {
  const loaded = page.waitForResponse((r) => r.url().endsWith('/api/costs?range=24h') && r.request().method() === 'GET')
  await page.goto('/trends?range=24h')
  const res = await loaded
  expect(res.status()).toBe(200)
  return (await res.json()).tasks
}

test('390px：依任務花費卡片不橫向捲動，總額與成員細分可見', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const tasks = await openTrends(page)
  expect(tasks.length).toBeGreaterThan(0)

  const box = page.getByTestId('cost-by-task')
  await expect(box).toBeVisible()
  await expect(box.locator('table')).toBeHidden()
  for (const t of tasks) {
    const row = box.getByTestId(`task-cost-card-${t.project}-${t.taskDir}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText(money(t.cost))
    for (const [m, v] of Object.entries(t.members)) {
      const cell = row.getByTestId(`member-cost-${m}`)
      await expect(cell).toBeVisible()
      await expect(cell).toContainText(money(v))
    }
  }
  expect(tasks.some((t) => Object.keys(t.members).length > 0)).toBe(true)

  // 卡片本身與其內每個元素都不需要橫向捲動
  const overflow = await box.evaluate((el) => {
    const bad = [el, ...el.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX !== 'visible')
    return { sw: el.scrollWidth, cw: el.clientWidth, bad: bad.map((e) => e.getAttribute('data-testid') ?? e.tagName) }
  })
  expect(overflow.sw).toBeLessThanOrEqual(overflow.cw)
  expect(overflow.bad).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('trends-390.png'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await box.screenshot({ path: test.info().outputPath('cost-by-task-390-dark.png') })
})

test('768px：依任務花費維持表格', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  const tasks = await openTrends(page)
  const box = page.getByTestId('cost-by-task')
  await expect(box.locator('table')).toBeVisible()
  await expect(box.getByTestId('task-cost-list')).toBeHidden()
  for (const t of tasks) await expect(box.getByTestId(`task-cost-${t.project}-${t.taskDir}`)).toContainText(money(t.cost))
  await page.screenshot({ path: test.info().outputPath('trends-768.png'), fullPage: true })
})
