import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { dataDir } from './fixtures/paths'

// 花費與額度趨勢（AC4、AC6–AC8）：樣本由 playwright.config.ts 在 webServer 啟動前用 makeSampleFixture(Date.now()) 寫入 dataDir。
// fixture 以今天與昨天的本地中午為錨點，今天那組在中午前還是未來時間；期望值一律從同一個 server 的 API 取，不寫死金額。
// 頁面上的數字只跟頁面自己那次 /api/costs 回應比：另發一次請求可能剛好跨過窗界（fixture 樣本每 10 分鐘一筆）而對不上。

type TaskCost = { project: string; taskDir: string; cost: number; members: Record<string, number>; unmatched: number }
type Costs = { range: string; tasks: TaskCost[]; byRole: Record<string, number>; unknownRole: number; unattributed: number }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const money = (n: number) => `$${n.toFixed(2)}`
const costs = async (request: APIRequestContext, range: string): Promise<Costs> => {
  const res = await request.get(`/api/costs?range=${range}`)
  expect(res.status()).toBe(200)
  return res.json()
}
/** 在觸發載入之前呼叫，拿到頁面自己抓的那次 /api/costs?range=… 回應 */
const pageCosts = (page: Page, range: string): Promise<Costs> =>
  page
    .waitForResponse((r) => r.url().endsWith(`/api/costs?range=${range}`) && r.request().method() === 'GET')
    .then((r) => {
      expect(r.status()).toBe(200)
      return r.json()
    })

test('/api/costs 每個 range 兩條花費恆等式成立，不合法 range 回 400', async ({ request }) => {
  for (const range of ['6h', '24h', '7d', '30d', 'all']) {
    const c = await costs(request, range)
    expect(c.range).toBe(range)
    for (const t of c.tasks) expect(t.cost).toBeCloseTo(sum(Object.values(t.members)) + t.unmatched, 9)
    expect(sum(c.tasks.map((t) => t.cost)) + c.unattributed).toBeCloseTo(sum(Object.values(c.byRole)) + c.unknownRole, 9)
  }
  // fixture 昨天那組一定在 24h 與保留期內：兩個任務、未歸屬、未知角色都非零
  const all = await costs(request, 'all')
  expect(all.tasks.map((t) => t.taskDir).sort()).toEqual(['2026-09-23-ops', '2026-09-24-bklog'])
  expect(all.unattributed).toBeGreaterThan(0)
  expect(all.unknownRole).toBeGreaterThan(all.unattributed)
  for (const bad of ['/api/costs?range=1y', '/api/trends?range=all', '/api/trends?range=bogus']) {
    const res = await request.get(bad)
    expect(res.status()).toBe(400)
    expect((await res.json()).error.kind).toBe('bad-request')
  }
})

test('/trends：從 TopBar 進入，額度圖、預估、任務花費表、角色小計與資料目錄', async ({ page }) => {
  await page.goto('/')
  const loaded = pageCosts(page, '24h')
  await page.getByRole('link', { name: '趨勢' }).click()
  await expect(page).toHaveURL(/\/trends\?range=24h$/)

  for (const kind of ['claude', 'codex']) {
    const chart = page.getByTestId(`usage-chart-${kind}`)
    await expect(chart).toBeVisible()
    await expect(chart.locator('.recharts-line').first()).toBeVisible()
    await expect(chart.getByTestId('projection-5h')).toBeVisible()
    await expect(chart.getByTestId('projection-week')).toBeVisible()
  }
  await expect(page.getByTestId('ctx-chart')).toBeVisible()
  await expect(page.getByTestId('cost-by-day-chart')).toBeVisible()
  await expect(page.getByText('dashboard 未開啟期間的花費可能遺漏，或併入之後第一次記錄')).toBeVisible()

  const c = await loaded
  const table = page.getByTestId('task-cost-table')
  await expect(table).toBeVisible()
  for (const t of c.tasks) {
    const row = table.getByTestId(`task-cost-${t.project}-${t.taskDir}`)
    await expect(row).toContainText(money(t.cost))
    for (const [m, v] of Object.entries(t.members)) await expect(row.getByTestId(`member-cost-${m}`)).toContainText(money(v))
    if (t.unmatched > 0) await expect(row.getByTestId('member-cost-other')).toContainText(`其他 ${money(t.unmatched)}`)
  }
  await expect(table.getByTestId('task-cost-unattributed')).toContainText(money(c.unattributed))
  for (const [role, v] of Object.entries(c.byRole)) await expect(page.getByTestId(`role-cost-${role}`)).toContainText(money(v))
  await expect(page.getByTestId('role-cost-unknown')).toContainText(`未知角色${money(c.unknownRole)}`)
  await expect(page.getByText(`資料目錄：${dataDir}`)).toBeVisible()

  // 任務在 overview list 找得到 → 可點到任務詳情
  await table.getByTestId('task-cost-teamflow-2026-09-24-bklog').getByRole('link').click()
  await expect(page).toHaveURL(/\/p\/teamflow\/t\/2026-09-24-bklog$/)
})

test('/trends 範圍切換寫進網址、數字跟著變；不合法值回落 24h', async ({ page }) => {
  await page.goto('/trends?range=bogus')
  await expect(page).toHaveURL(/\/trends\?range=24h$/)
  await expect(page.getByRole('button', { name: '24 小時' })).toHaveAttribute('aria-pressed', 'true')

  for (const [range, label] of [['7d', '7 天'], ['6h', '6 小時'], ['30d', '30 天']] as const) {
    const loaded = pageCosts(page, range)
    await page.getByRole('button', { name: label }).click()
    await expect(page).toHaveURL(new RegExp(`range=${range}$`))
    const c = await loaded
    if (c.tasks.length === 0 && c.unattributed === 0) {
      // 6h 在本地中午前沒有樣本 → 空狀態
      await expect(page.getByText('尚無資料：dashboard 開著時每分鐘記錄一次')).toBeVisible()
    } else {
      await expect(page.getByTestId('role-cost-unknown')).toContainText(money(c.unknownRole))
      await expect(page.getByTestId('task-cost-unattributed')).toContainText(money(c.unattributed))
    }
  }
})

test('任務詳情顯示本任務花費（總額＋依成員），/history 有花費欄', async ({ page }) => {
  // 期望值取頁面自己那次 /api/costs?range=all 回應（每次 goto 都是新頁面、會重抓）
  const findOps = (c: Costs) => c.tasks.find((t) => t.taskDir === '2026-09-23-ops')!
  let loaded = pageCosts(page, 'all')
  await page.goto('/p/teamflow/t/2026-09-23-ops')
  const ops = findOps(await loaded)
  const card = page.getByTestId('task-cost')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('task-cost-total')).toHaveText(money(ops.cost))
  for (const [m, v] of Object.entries(ops.members)) await expect(card.getByTestId(`member-cost-${m}`)).toContainText(money(v))
  await expect(card.getByTestId('member-cost-other')).toContainText(money(ops.unmatched))

  // 沒有花費紀錄的任務顯示「—」
  await page.goto('/p/teamflow/t/2026-09-22-tasktab')
  await expect(page.getByTestId('task-cost-total')).toHaveText('—')

  loaded = pageCosts(page, 'all')
  await page.goto('/history')
  const historyOps = findOps(await loaded)
  const table = page.getByTestId('history-table')
  await expect(table.getByRole('columnheader', { name: '花費' })).toBeVisible()
  await expect(table.getByTestId('history-row-teamflow-2026-09-23-ops').getByTestId('col-cost')).toHaveText(money(historyOps.cost))
  await expect(table.getByTestId('history-row-teamflow-2026-09-22-tasktab').getByTestId('col-cost')).toHaveText('—')
})
