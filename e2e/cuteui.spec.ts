import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { ActivityResponse } from '../packages/shared/src/index.ts'
import { snapshotFile } from './fixtures/paths'
import { CLOSED_DIR, RUNNING_DIR } from './fixtures/projects'

// 可愛風改版（cuteui AC9）：總覽摘要卡、活動欄（順序／連結／版面）。各頁截圖與 herdr 黑底在 unify.spec.ts。
// 活動內容由 e2e/fixtures/projects.ts 以 now 相對寫進假 teamflow（backend notes 定義），期望的前 5 筆寫在 TOP5。
// 截圖存在每條測試的 outputPath。

const shotPath = (name: string) => test.info().outputPath(`${name}.png`)

// 前 5 筆活動（backend notes）：actor 顯示去掉「<任務短名>-」前綴；event 的 actor 為 null（leader），unify 後不再重複頭像與名字（actor: null）；
// 都在 teamflow 的 e2erun（−5 DONE、−10 review、−20 DONE 先於同分鐘 dev-done、−25 ESCALATE；−15 ACK、−30 minor 略過）
const TOP5 = [
  { type: 'DONE', actor: 'backend', text: '後端完成' },
  { type: 'review', actor: null, text: 'review 2 spawned' },
  { type: 'DONE', actor: 'frontend-shell', text: '前端完成' },
  { type: 'dev-done', actor: null, text: 'dev-done wave 2' },
  { type: 'ESCALATE', actor: 'backend', text: '要動 apps/web 的檔' },
]

const openOverview = async (page: Page) => {
  await page.goto('/')
  await expect(page.getByTestId('project-teamflow')).toBeVisible()
  await expect(page.getByTestId('activity-item').first()).toBeVisible()
}

test('總覽出現四張摘要卡與活動欄', async ({ page }) => {
  await openOverview(page)
  for (const id of ['summary-running', 'summary-spend', 'summary-blocked', 'summary-quota', 'activity-rail']) await expect(page.getByTestId(id)).toBeVisible()
})

test('活動前 5 筆順序與內容符合 backend notes', async ({ page }) => {
  await openOverview(page)
  // unify：同任務收成一組，組內超過 4 則收成「再看 N 則」；先全部展開
  const rail = page.getByTestId('activity-rail')
  for (const more of await rail.getByRole('button', { name: /^再看 \d+ 則$/ }).all()) await more.click()
  const items = page.getByTestId('activity-item')
  for (const [i, exp] of TOP5.entries()) {
    const it = items.nth(i)
    await expect(it, `#${i + 1}`).toHaveAttribute('data-type', exp.type)
    await expect(it).toHaveAttribute('data-project', 'teamflow')
    await expect(it).toHaveAttribute('data-task', RUNNING_DIR)
    if (exp.actor) await expect(it).toContainText(exp.actor)
    else {
      await expect(it).not.toContainText('leader')
      await expect(it.getByTestId('activity-avatar')).toHaveCount(0)
    }
    await expect(it).toContainText(exp.text)
  }
  // ACK 與 minor 不收
  await expect(page.locator('[data-testid=activity-item][data-type=ACK]')).toHaveCount(0)
  await expect(page.locator('[data-testid=activity-item][data-type=minor]')).toHaveCount(0)
  await page.getByTestId('activity-rail').screenshot({ path: shotPath('activity-rail-top5') })
})

test('/api/activity：24 小時內結案的任務進快取後出現，且排在 e2erun 之後', async ({ request }) => {
  // 已結案 detail 由背景每輪補 3 件；/api/history 會一次補齊，之後活動應帶 e2edone 的 task-close 與 DONE
  expect((await request.get('/api/history')).status()).toBe(200)
  const res = await request.get('/api/activity?limit=10')
  expect(res.status()).toBe(200)
  const { items } = (await res.json()) as ActivityResponse
  expect(items.slice(0, 5).map((x) => [x.type, x.taskDir])).toEqual(TOP5.map((x) => [x.type, RUNNING_DIR]))
  expect(items.slice(5, 7).map((x) => [x.type, x.taskDir, x.actor])).toEqual([
    ['task-close', CLOSED_DIR, null],
    ['DONE', CLOSED_DIR, 'e2edone-dev'],
  ])
  for (const q of ['0', '201', '1.5', 'abc']) expect((await request.get(`/api/activity?limit=${q}`)).status(), q).toBe(400)
})

test('點活動跳到任務詳情', async ({ page }) => {
  await openOverview(page)
  const first = page.getByTestId('activity-item').first()
  const project = await first.getAttribute('data-project')
  const task = await first.getAttribute('data-task')
  await expect(first).toHaveAttribute('href', `/p/${project}/t/${task}`)
  await first.click()
  await expect(page).toHaveURL(new RegExp(`/p/${project}/t/${task}$`))
})

test('珊瑚卡點了到 herdr 頁', async ({ page }) => {
  await openOverview(page)
  await page.getByTestId('summary-blocked').click()
  await expect(page).toHaveURL(/\/herdr(\?|$)/)
})

test('珊瑚卡有卡住 agent 時顯示數量並連到該 pane 的 herdr 頁', async ({ page }) => {
  await openOverview(page)
  const card = page.getByTestId('summary-blocked')
  const original = readFileSync(snapshotFile, 'utf8')
  try {
    const snap = JSON.parse(original)
    for (const p of snap.panes) if (p.pane_id === 'wE:p3') p.agent_status = 'blocked'
    writeFileSync(snapshotFile, JSON.stringify(snap))
    await expect(card).toContainText('1', { timeout: 5_000 })
    await expect(card).not.toContainText('大家都很順')
    await expect(card).toHaveAttribute('href', '/herdr?w=wE&t=wE%3At1&p=wE%3Ap3')
    await card.screenshot({ path: shotPath('summary-blocked-1') })
    await card.click()
    await expect(page).toHaveURL(/\/herdr\?w=wE&t=wE%3At1&p=wE%3Ap3$/)
  } finally {
    writeFileSync(snapshotFile, original)
  }
})

test('紫卡：今日、昨日以本地日期比對 costByDay 並跨專案加總，無資料顯示「—」', async ({ page }) => {
  const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  const today = dayOf(now)
  const yesterday = dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  let costByDay = [
    { day: today, project: 'teamflow', cost: 1.25 },
    { day: today, project: 'collect', cost: 2.5 },
    { day: '2000-01-01', project: 'teamflow', cost: 99 },
  ]
  await page.route('**/api/trends?range=7d', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), costByDay } })
  })
  await openOverview(page)
  const card = page.getByTestId('summary-spend')
  await expect(card).toContainText('$3.75')
  await expect(card).toContainText('昨日 —')
  costByDay = [{ day: yesterday, project: 'teamflow', cost: 4 }]
  await page.reload()
  await expect(card).toContainText('昨日 $4.00')
  await expect(page.getByTestId('summary-spend-value')).toHaveText('—')
})

test('活動欄失敗顯示錯誤與重試、空清單顯示喝茶文案', async ({ page }) => {
  let mode: 'fail' | 'empty' = 'fail'
  await page.route('**/api/activity?*', (route) =>
    mode === 'fail' ? route.fulfill({ status: 500, json: { error: { kind: 'x' } } }) : route.fulfill({ json: { generatedAt: Date.now(), items: [] } }),
  )
  await page.goto('/')
  await expect(page.getByTestId('activity-error')).toContainText('暫時拿不到活動')
  await page.getByTestId('activity-rail').screenshot({ path: shotPath('activity-error') })
  mode = 'empty'
  await page.getByTestId('activity-retry').click()
  // unify：🍵 是 EmptyState 的圖示圓，排在標題前
  await expect(page.getByTestId('activity-empty')).toContainText('還沒有新動態，喝口茶吧')
  await expect(page.getByTestId('activity-empty')).toContainText('🍵')
  await page.getByTestId('activity-rail').screenshot({ path: shotPath('activity-empty') })
})

test('1440 寬：活動欄在主欄右側、寬 300–340、sticky、內容超出自身可捲', async ({ page }) => {
  // unify 後 1440×900 的總覽只比視窗高一點點；用 600 高讓頁面捲得夠遠，才分得出 sticky 與一般捲動
  await page.setViewportSize({ width: 1440, height: 600 })
  await openOverview(page)
  const rail = page.getByTestId('activity-rail')
  const r = (await rail.boundingBox())!
  const cards = page.locator('[data-testid^="project-"]')
  let mainRight = 0
  for (const c of await cards.all()) {
    const b = (await c.boundingBox())!
    mainRight = Math.max(mainRight, b.x + b.width)
  }
  expect(r.x).toBeGreaterThan(mainRight)
  expect(r.width).toBeGreaterThanOrEqual(300)
  expect(r.width).toBeLessThanOrEqual(340)

  // sticky：rail 起始在 PageHeader 下方；捲過 (起始 top − sticky top) 之後 rail 黏在 sticky top，不跟著頁面往上走
  // （滑鼠停在主欄、不在 rail 上）
  const stickyTop = await rail.evaluate((el) => parseFloat(getComputedStyle(el).top))
  const travel = r.y - stickyTop
  await page.mouse.move(200, 500)
  await page.mouse.wheel(0, 2000)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(travel + 50)
  const r2 = (await rail.boundingBox())!
  expect(Math.abs(r2.y - stickyTop), `rail top ${r.y} → ${r2.y}（sticky ${stickyTop}）`).toBeLessThan(1)
  await page.mouse.wheel(0, -2000)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)

  // rail 本身是捲動容器：內容超出時捲 rail，頁面不動。unify 分組收合後假資料塞不滿 rail，
  // 這段改用 12 個任務各 3 則的活動清單（從真回應的第一則複製）
  await page.route('**/api/activity?*', async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as ActivityResponse
    const base = body.items[0]
    const items = Array.from({ length: 36 }, (_, i) => ({ ...base, taskDir: `${base.taskDir}-${Math.floor(i / 3)}`, taskShort: `t${Math.floor(i / 3)}`, at: base.at - i * 60_000 }))
    await route.fulfill({ response: res, json: { ...body, items } })
  })
  await page.reload()
  await expect(rail.getByTestId('activity-group')).toHaveCount(12)
  const st = await rail.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }))
  expect(st.sh, 'rail 內容超出').toBeGreaterThan(st.ch)
  expect(['auto', 'scroll']).toContain(st.oy)
  const pageY = await page.evaluate(() => window.scrollY)
  await page.mouse.move(r.x + r.width / 2, r.y + 200)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => rail.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY)
  await page.screenshot({ path: shotPath('overview-1440-rail') })
})

test('390×844：活動欄排在最後一張專案卡之後、無橫向捲動', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openOverview(page)
  const cards = await page.locator('[data-testid^="project-"]').all()
  let lastBottom = 0
  for (const c of cards) {
    const b = (await c.boundingBox())!
    lastBottom = Math.max(lastBottom, b.y + b.height)
  }
  const r = (await page.getByTestId('activity-rail').boundingBox())!
  expect(r.y).toBeGreaterThan(lastBottom)
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  expect(sw).toBeLessThanOrEqual(cw)
})

// herdr 終端黑底與各頁 1440／390 亮暗截圖已搬到 unify.spec.ts（AC12）
