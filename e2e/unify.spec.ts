import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { HistoryResponse, HistoryRow } from '../packages/shared/src/index.ts'
import { snapshotFile } from './fixtures/paths'
import { RUNNING_DIR } from './fixtures/projects'

// 全站設計統一（unify AC12）：總覽四張摘要卡、閒置專案收合／展開、活動「需處理」過濾、歷史 15 件與再顯示、
// 趨勢空狀態卡高度、各頁三種寬度無橫向捲動、總覽手機順序與頁高、內容頁容器寬、herdr 終端黑底，以及 1440 亮暗＋總覽 390 亮暗截圖。
// 截圖存在每條測試的 outputPath（DASH_E2E_OUT 可指到 repo 外）。

const shotPath = (name: string) => test.info().outputPath(`${name}.png`)

/** 顏色字串（含 oklch）經 canvas 轉成 sRGB 後算相對亮度（0–1）；alpha 為 0（透明、沒有自己的底色）就往父層找實際看到的那層 */
const luminance = (el: Locator, prop: string) =>
  el.evaluate((node, p) => {
    const alpha = (c: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      return ctx.getImageData(0, 0, 1, 1).data[3]
    }
    let cur: Element | null = node
    let c = getComputedStyle(node).getPropertyValue(p)
    while (cur && alpha(c) === 0) {
      cur = cur.parentElement
      c = cur ? getComputedStyle(cur).getPropertyValue(p) : 'white'
    }
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return { color: c, l: 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
  }, prop)

/** SummaryTile 的值（第二個 span：標籤、值、副行） */
const tileValue = (tile: Locator) => tile.locator(':scope > span').nth(1)

const openOverview = async (page: Page) => {
  await page.goto('/')
  await expect(page.getByTestId('active-projects')).toBeVisible()
  await expect(page.getByTestId('activity-item').first()).toBeVisible()
}

// 各頁就緒條件一律等具體元素（SSE 長連線讓 networkidle 不可靠）；git 頁點進 teamflow 讓畫面有內容
type PageDef = { name: string; url: string; content: boolean; ready: (p: Page) => Promise<void> }
const PAGES: PageDef[] = [
  { name: 'overview', url: '/', content: true, ready: async (p) => void (await expect(p.getByTestId('activity-item').first()).toBeVisible()) },
  { name: 'task', url: '/p/teamflow/t/2026-09-23-ops', content: true, ready: async (p) => void (await expect(p.getByTestId('wave-timeline')).toBeVisible()) },
  // 進行中任務：只有進行中的波展開（AC6），頁首有「複製 focus 指令」
  { name: 'task-running', url: `/p/teamflow/t/${RUNNING_DIR}`, content: true, ready: async (p) => void (await expect(p.getByTestId('wave-timeline')).toBeVisible()) },
  // 歷史在 md 以下改畫卡片清單（history-list），表格仍在 DOM 但隱藏
  {
    name: 'history',
    url: '/history',
    content: true,
    ready: async (p) => void (await expect(p.locator('[data-testid=history-table]:visible, [data-testid=history-list]:visible').first()).toBeVisible()),
  },
  { name: 'trends', url: '/trends', content: true, ready: async (p) => void (await expect(p.getByTestId('cost-by-day-chart')).toBeVisible()) },
  { name: 'herdr', url: '/herdr', content: false, ready: async (p) => void (await expect(p.getByText('fake screen wE:p1')).toBeVisible()) },
  {
    name: 'git',
    url: '/git',
    content: false,
    ready: async (p) => {
      await p.getByTestId('git-project-teamflow').click()
      await expect(p.getByTestId('git-commits')).toBeVisible()
    },
  },
]

const noHScroll = (page: Page) =>
  page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))

// ── 總覽 ──────────────────────────────────────────────

test('總覽四張摘要卡：變色規則（進行中 ok、卡住 0 quiet → 1 danger、熔斷與額度跟頂部列一致）', async ({ page }) => {
  await openOverview(page)
  const tiles = ['summary-running', 'summary-spend', 'summary-blocked', 'summary-quota']
  for (const id of tiles) await expect(page.getByTestId(id)).toBeVisible()

  // 假 teamflow 有一件進行中任務（e2erun）
  await expect(page.getByTestId('summary-running')).toHaveAttribute('data-variant', 'ok')
  await expect(tileValue(page.getByTestId('summary-running'))).toHaveText('1')
  // 花費：有資料 brand、無資料 quiet
  const spendValue = (await page.getByTestId('summary-spend-value').textContent())?.trim()
  await expect(page.getByTestId('summary-spend')).toHaveAttribute('data-variant', spendValue === '—' ? 'quiet' : 'brand')

  // 熔斷與額度：頂部列有熔斷膠囊或任一額度膠囊為 warn → warn，否則 quiet（Q2、Q12）
  const breakers = await page.getByTestId('breaker-pill').count()
  const warnChips = await page.locator('[data-testid=usage-chip][data-tone=warn]').count()
  await expect(page.getByTestId('summary-quota')).toHaveAttribute('data-variant', breakers + warnChips > 0 ? 'warn' : 'quiet')
  // 額度膠囊永不變紅
  await expect(page.locator('[data-testid=usage-chip][data-tone=danger]')).toHaveCount(0)

  const blocked = page.getByTestId('summary-blocked')
  await expect(blocked).toHaveAttribute('data-variant', 'quiet')
  await expect(tileValue(blocked)).toHaveText('0')
  const original = readFileSync(snapshotFile, 'utf8')
  try {
    const snap = JSON.parse(original)
    for (const p of snap.panes) if (p.pane_id === 'wE:p3') p.agent_status = 'blocked'
    writeFileSync(snapshotFile, JSON.stringify(snap))
    await expect(blocked).toHaveAttribute('data-variant', 'danger', { timeout: 5_000 })
    await expect(tileValue(blocked)).toHaveText('1')
    await page.locator('[data-slot=summary-tile]').first().locator('..').screenshot({ path: shotPath('summary-tiles-blocked-1') })
  } finally {
    writeFileSync(snapshotFile, original)
  }
  await expect(blocked).toHaveAttribute('data-variant', 'quiet', { timeout: 5_000 })
})

test('閒置專案收在一張卡，每專案一列，點了展開、再點收合', async ({ page }) => {
  await openOverview(page)
  const card = page.getByTestId('idle-projects')
  await expect(card).toBeVisible()
  const rows = card.getByTestId('idle-project-row')
  expect(await rows.count()).toBeGreaterThan(0)
  // 閒置專案不會同時出現在活躍區
  for (const r of await rows.all()) {
    const name = (await r.getAttribute('data-project'))!
    await expect(page.getByTestId('active-projects').getByTestId(`project-${name}`)).toHaveCount(0)
  }
  const row = rows.first()
  const body = page.locator(`#${await row.getAttribute('aria-controls')}`)
  await expect(row).toHaveAttribute('aria-expanded', 'false')
  await expect(body).toHaveCount(0)
  await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
  await expect(body).toBeVisible()
  await card.screenshot({ path: shotPath('idle-projects-expanded') })
  await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'false')
  await expect(body).toHaveCount(0)
})

test('活動欄依任務分組，「需處理」只留 ESCALATE／BUG／BLOCKED／LIMIT／TIMEOUT／STOP', async ({ page }) => {
  await openOverview(page)
  const rail = page.getByTestId('activity-rail')
  await expect(rail.getByTestId('activity-group').first()).toBeVisible()
  // 每則活動都在某一組裡、組的 data-task 與則的 data-task 一致
  for (const g of await rail.getByTestId('activity-group').all()) {
    const task = await g.getAttribute('data-task')
    for (const it of await g.getByTestId('activity-item').all()) await expect(it).toHaveAttribute('data-task', task!)
  }

  const filter = rail.getByTestId('activity-filter')
  await expect(filter.locator('[data-value=all]')).toHaveAttribute('data-state', 'active')
  const allCount = await rail.getByTestId('activity-item').count()
  await filter.locator('[data-value=attention]').click()
  await expect(filter.locator('[data-value=attention]')).toHaveAttribute('data-state', 'active')
  const items = rail.getByTestId('activity-item')
  // 假 teamflow 的 e2erun 有一則 ESCALATE
  await expect(items.first()).toBeVisible()
  const types = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-type')))
  expect(types.length).toBeGreaterThan(0)
  expect(types.length).toBeLessThan(allCount)
  for (const t of types) expect(['ESCALATE', 'BUG', 'BLOCKED', 'LIMIT', 'TIMEOUT', 'STOP']).toContain(t)
  expect(types).toContain('ESCALATE')
  await rail.screenshot({ path: shotPath('activity-attention') })
  await filter.locator('[data-value=all]').click()
  await expect(items).toHaveCount(allCount)
})

test('390×844：無橫向捲動、頁高 < 3 屏、順序為摘要 → 活躍專案 → 活動 → 閒置專案', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openOverview(page)
  await expect(page.getByTestId('idle-projects')).toBeVisible()
  const { sw, cw } = await noHScroll(page)
  expect(sw).toBeLessThanOrEqual(cw)
  const sh = await page.evaluate(() => document.documentElement.scrollHeight)
  expect(sh).toBeLessThan(2532)
  // 閒置列（含版本與「相容模式」Tag）在 390 寬一列放得下：列本身不溢出、高度維持 row（h-11）
  for (const row of await page.getByTestId('idle-project-row').all()) {
    const m = await row.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: el.getBoundingClientRect().height }))
    expect(m.sw, await row.getAttribute('data-project')).toBeLessThanOrEqual(m.cw)
    expect(m.h).toBeLessThanOrEqual(44)
  }

  const y = async (l: Locator) => (await l.boundingBox())!.y
  let prev = -1
  for (const id of ['summary-running', 'summary-spend', 'summary-blocked', 'summary-quota']) {
    const v = await y(page.getByTestId(id))
    expect(v, id).toBeGreaterThanOrEqual(prev)
    prev = v
  }
  for (const id of ['active-projects', 'activity-rail', 'idle-projects']) {
    const v = await y(page.getByTestId(id))
    expect(v, id).toBeGreaterThan(prev)
    prev = v
  }
  // 元素截圖會捲動頁面（boundingBox 是視窗座標），放在位置斷言之後
  await page.getByTestId('idle-projects').screenshot({ path: shotPath('idle-projects-390') })
})

// ── 歷史 ──────────────────────────────────────────────

test('歷史：審查欄 9/6 · m5 · r1 格式，dev vs 審查圖預設最近 15 件、顯示全部切換，表格 10 件起每次再 30 件', async ({ page }) => {
  // 假專案只有 11 件已結案；以真回應中有波次紀錄的 ops 複製成 40 件（各自 dir 與結案時間）
  const N = 40
  await page.route('**/api/history', async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as HistoryResponse
    const ops = body.tasks.find((t) => t.dir === '2026-09-23-ops')!
    const tasks: HistoryRow[] = Array.from({ length: N }, (_, i) => ({
      ...ops,
      dir: `2026-08-${String((i % 28) + 1).padStart(2, '0')}-x${i}`,
      display: `複製任務 ${i}`,
      closedAt: `2026-08-${String((i % 28) + 1).padStart(2, '0')}T${String(10 + (i % 10)).padStart(2, '0')}:${String(i).padStart(2, '0')}`,
    }))
    await route.fulfill({ response: res, json: { ...body, tasks } })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/history')
  const table = page.getByTestId('history-table')
  await expect(table).toBeVisible()

  // 審查欄：一格三段
  const cell = table.getByTestId('col-review').first()
  await expect(cell.getByTestId('col-rulings')).toHaveText(/^\d+\/\d+$/)
  await expect(cell.getByTestId('col-minors')).toHaveText(/^m\d+$/)
  await expect(cell.getByTestId('col-rereviews')).toHaveText(/^r\d+$/)
  await expect(cell).toHaveText(/^\d+\/\d+ · m\d+ · r\d+$/)

  // 圖：預設 15 件，切換顯示全部 N 件、再切回
  const chart = page.getByTestId('chart-dev-review')
  const toggle = page.getByTestId('history-chart-toggle')
  await expect(chart).toHaveAttribute('data-rows', '15')
  await expect(toggle).toContainText(`顯示全部 ${N} 件`)
  await toggle.click()
  await expect(chart).toHaveAttribute('data-rows', String(N))
  await expect(toggle).toContainText('最近 15 件')
  await toggle.click()
  await expect(chart).toHaveAttribute('data-rows', '15')

  // 表格：10 → 40（一次 30），到底就隱藏
  const rows = table.locator('tbody tr')
  await expect(rows).toHaveCount(10)
  const more = page.getByTestId('history-more')
  await expect(more).toContainText('再顯示 30 件')
  await more.click()
  await expect(rows).toHaveCount(N)
  await expect(more).toHaveCount(0)
  await page.screenshot({ path: shotPath('history-40-rows'), fullPage: true })
})

test('歷史：真資料的審查欄等於 /api/history 的 裁定/自主 · m minor · r 重審，表頭有 Tooltip 說明', async ({ page }) => {
  const loaded = page.waitForResponse((r) => r.url().endsWith('/api/history') && r.request().method() === 'GET')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/history')
  const { tasks } = (await (await loaded).json()) as HistoryResponse
  const table = page.getByTestId('history-table')
  await expect(table).toBeVisible()
  for (const r of tasks.filter((t) => t.dir === '2026-09-23-ops' || t.dir === '2026-09-24-bklog')) {
    const cell = table.getByTestId(`history-row-${r.project}-${r.dir}`).getByTestId('col-review')
    await expect(cell).toHaveText(`${r.rulings}/${r.autonomousRulings} · m${r.minors} · r${r.reReviews}`)
  }
  // 表頭 Tooltip（Q7）：hover 與鍵盤 focus 都會出說明
  const head = table.getByRole('columnheader', { name: /審查/ }).getByRole('button', { name: /審查/ })
  await head.hover()
  await expect(page.getByRole('tooltip')).toContainText('裁定/自主 · minor 數 · 重審次數')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await page.mouse.move(0, 0)
  await head.blur()
  await head.focus()
  await expect(page.getByRole('tooltip')).toContainText('裁定/自主 · minor 數 · 重審次數')
})

// ── 趨勢 ──────────────────────────────────────────────

test('趨勢：沒有資料的圖收成矮的空狀態卡，同列另一張不被拉高', async ({ page }) => {
  await page.route('**/api/trends?range=24h', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({ response: res, json: { ...body, usage: { ...body.usage, codex: [] } } })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/trends?range=24h')
  const empty = page.getByTestId('usage-chart-codex')
  const full = page.getByTestId('usage-chart-claude')
  await expect(empty.getByTestId('chart-empty')).toBeVisible()
  await expect(empty).toHaveAttribute('data-state', 'empty')
  await expect(full.locator('.recharts-line').first()).toBeVisible()
  await expect(full.getByTestId('chart-empty')).toHaveCount(0)
  // 空狀態不畫 summary
  await expect(empty.getByTestId('projection-5h')).toHaveCount(0)
  const e = (await empty.boundingBox())!
  const f = (await full.boundingBox())!
  expect(Math.abs(e.y - f.y), '同一列').toBeLessThan(2)
  expect(e.height).toBeLessThan(f.height)
  // min-h-36（9rem = 144px）
  expect(e.height).toBeGreaterThanOrEqual(144)
  await page.locator('section[aria-label=額度]').screenshot({ path: shotPath('trends-empty-card') })
})

test('趨勢：全頁沒有資料時顯示整頁空狀態', async ({ page }) => {
  await page.route('**/api/trends?range=24h', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({ response: res, json: { ...body, usage: {}, ctx: [], costByDay: [], costByKind: {} } })
  })
  await page.route('**/api/costs?range=24h', async (route) => {
    const res = await route.fetch()
    const body = await res.json()
    await route.fulfill({
      response: res,
      json: { ...body, tasks: [], byRole: {}, unknownRole: 0, unattributed: 0, byActual: [], byConfigured: [], mismatch: [] },
    })
  })
  await page.goto('/trends?range=24h')
  await expect(page.getByText('還沒有趨勢資料')).toBeVisible()
  await expect(page.getByTestId('cost-by-day-chart')).toHaveCount(0)
})

// ── 版面 ──────────────────────────────────────────────

for (const width of [1440, 1024, 390]) {
  test(`${width} 寬：各頁沒有橫向捲動`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const pg of PAGES) {
      await page.goto(pg.url)
      await pg.ready(page)
      const { sw, cw } = await noHScroll(page)
      expect(sw, `${pg.name} ${width}`).toBeLessThanOrEqual(cw)
    }
  })
}

test('內容頁容器寬 ≤ 1536（1920 寬視窗）', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 })
  for (const pg of PAGES.filter((p) => p.content)) {
    await page.goto(pg.url)
    await pg.ready(page)
    const box = (await page.locator('main .max-w-page').first().boundingBox())!
    expect(box.width, pg.name).toBeLessThanOrEqual(1536)
    expect(box.width, pg.name).toBeGreaterThan(1400)
  }
})

test('herdr 終端在亮暗都是黑底', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/herdr')
    await expect(page.getByTestId('herdr-pane-wE:p1').getByText('fake screen wE:p1')).toBeVisible()
    for (const el of [page.getByTestId('herdr-layout'), page.getByTestId('herdr-screen').first()]) {
      const { color, l } = await luminance(el, 'background-color')
      expect(l, `${scheme} ${color}`).toBeLessThan(0.01)
    }
  }
})

// ── 截圖（關卡③對照 page-*.webp）──────────────────────

for (const scheme of ['light', 'dark'] as const) {
  for (const pg of PAGES) {
    test(`截圖 1440 ${scheme}：${pg.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(pg.url)
      await pg.ready(page)
      // recharts 進場動畫約 1.5 秒（淡入、長條長高），截太早圖表幾乎是空的
      await page.waitForTimeout(2_000)
      await page.screenshot({ path: shotPath(`${pg.name}-1440-${scheme}`), fullPage: true })
    })
  }

  test(`截圖 390 ${scheme}：總覽`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: scheme })
    await openOverview(page)
    await page.screenshot({ path: shotPath(`overview-390-${scheme}`), fullPage: true })
  })
}
