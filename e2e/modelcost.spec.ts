import { existsSync } from 'node:fs'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import type { CostsResponse, HistoryResponse, TaskDetailResponse } from '../packages/shared/src/index.ts'
import { modelMismatch } from '../packages/shared/src/index.ts'
import { kindsCanaryFile } from './fixtures/projects'

// 花費依模型與 effort 拆分（modelcost AC11）：假專案 teamflow 帶 backend 定義的 roles／kinds 檔（teamflowDkboFiles），
// 任務詳情 fixture 帶 spawn 事件，樣本由 makeSampleFixture(Date.now()) 寫入。期望值一律取 server 回應，
// 只有 backend 在 notes 寫明的 fixture 事實（mismatch 列、派工結果）寫死。截圖存在每條測試的 outputPath。

const RANGES = ['6h', '24h', '7d', '30d', 'all'] as const
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const money = (n: number) => `$${n.toFixed(2)}`
const shotPath = (name: string) => test.info().outputPath(`${name}.png`)
const UNKNOWN = '未知'
const me = (x: { model: string | null; effort: string | null } | null | undefined) =>
  x == null || (x.model == null && x.effort == null) ? UNKNOWN : `${x.model ?? UNKNOWN}/${x.effort ?? UNKNOWN}`
const configured = (x: { kind: string | null; tier: string | null; model: string | null; effort: string | null }) =>
  x.kind == null && x.tier == null ? me(x) : `${x.kind ?? UNKNOWN} ${x.tier ?? UNKNOWN} · ${me(x)}`
/** 元素本身與其內任何可捲動元素都不需要橫向捲動 */
const noHScroll = async (box: Locator) => {
  const r = await box.evaluate((el) => {
    const bad = [el, ...el.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX !== 'visible')
    return { sw: el.scrollWidth, cw: el.clientWidth, bad: bad.map((e) => e.getAttribute('data-testid') ?? e.tagName) }
  })
  expect(r.sw, 'scrollWidth <= clientWidth').toBeLessThanOrEqual(r.cw)
  expect(r.bad).toEqual([])
}

const getJson = async <T>(request: APIRequestContext, url: string): Promise<T> => {
  const res = await request.get(url)
  expect(res.status(), url).toBe(200)
  return res.json()
}
/** 在觸發載入之前呼叫，拿到頁面自己那次 GET 回應 */
const pageJson = <T>(page: Page, suffix: string): Promise<T> =>
  page
    .waitForResponse((r) => r.url().endsWith(suffix) && r.request().method() === 'GET')
    .then((r) => {
      expect(r.status()).toBe(200)
      return r.json()
    })

const expectDesc = (xs: { cost: number }[]) => {
  for (let i = 1; i < xs.length; i++) expect(xs[i - 1].cost).toBeGreaterThanOrEqual(xs[i].cost)
}

test('/api/costs：每個 range 兩條恆等式、降冪、mismatch 彙總與 memberInfo 對應', async ({ request }) => {
  for (const range of RANGES) {
    const c = await getJson<CostsResponse>(request, `/api/costs?range=${range}`)
    const total = sum(c.tasks.map((t) => t.cost)) + c.unattributed
    expect(Math.abs(sum(c.byActual.map((x) => x.cost)) - total), `${range} Σ byActual`).toBeLessThan(1e-9)
    expect(Math.abs(sum(c.byConfigured.map((x) => x.cost)) - total), `${range} Σ byConfigured`).toBeLessThan(1e-9)
    expectDesc(c.byActual)
    expectDesc(c.byConfigured)
    expectDesc(c.mismatch.panes)
    expect(Math.abs(c.mismatch.cost - sum(c.mismatch.panes.map((p) => p.cost)))).toBeLessThan(1e-9)
    for (const p of c.mismatch.panes) expect(modelMismatch(p.actual, p.configured)).toBe(true)
    for (const t of c.tasks) {
      expect(Math.abs(sum(t.byConfigured.map((x) => x.cost)) - t.cost), `${range} ${t.taskDir} Σ byConfigured`).toBeLessThan(1e-9)
      for (const [m, info] of Object.entries(t.memberInfo)) {
        const hasRow = c.mismatch.panes.some((p) => p.project === t.project && p.taskDir === t.taskDir && p.member === m)
        expect(info.mismatch, `${range} ${t.taskDir}/${m} mismatch`).toBe(hasRow)
      }
    }
  }

  // backend notes-qa-3：昨天 wF1:p1 一列 frontend-shell 實際 sonnet 5/high、設定 sonnet/medium、$1.5；
  // 今天 wF0:p1 那段在本地 13:00–13:50，之前還是未來時間 → 只在已過 13:50 時要求整列 $1.5（之間可能是部分）
  const all = await getJson<CostsResponse>(request, '/api/costs?range=all')
  const byPane = new Map(all.mismatch.panes.map((p) => [p.paneId, p]))
  expect([...byPane.keys()].every((id) => id === 'wF0:p1' || id === 'wF1:p1'), [...byPane.keys()].join()).toBe(true)
  expect(byPane.get('wF1:p1')?.cost).toBeCloseTo(1.5, 9)
  const now = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 50).getTime()
  if (now.getTime() >= todayEnd) expect(byPane.get('wF0:p1')?.cost).toBeCloseTo(1.5, 9)
  if (now.getHours() < 13) expect(byPane.has('wF0:p1')).toBe(false)
  for (const p of all.mismatch.panes) {
    expect(p).toMatchObject({
      project: 'teamflow',
      taskDir: '2026-09-24-bklog',
      member: 'frontend-shell',
      actual: { model: 'sonnet 5', effort: 'high' },
      configured: { model: 'sonnet', effort: 'medium' },
    })
  }
  // 缺欄的舊樣本讀得進來、視為 null（「未知」），不算 skipped
  expect(all.skipped).toBe(0)
  expect(all.byActual.some((x) => x.model === null)).toBe(true)
  const bklog = all.tasks.find((t) => t.taskDir === '2026-09-24-bklog')!
  expect(bklog.memberInfo['frontend-shell'].configured).toMatchObject({ kind: 'claude', tier: 'M', model: 'sonnet', effort: 'medium' })
  // server 只以文字讀 kinds 檔：canary.sh 裡的 $(touch …) 沒被執行
  expect(existsSync(kindsCanaryFile)).toBe(false)
})

test('/api 任務詳情 dispatch 依 at 升冪、override-kind 走 kinds 檔；/api/history 有 dispatch 與 repairWaves', async ({ request }) => {
  const ops = await getJson<TaskDetailResponse>(request, '/api/projects/teamflow/tasks/2026-09-23-ops')
  for (let i = 1; i < ops.dispatch.length; i++) expect(ops.dispatch[i - 1].at).toBeLessThanOrEqual(ops.dispatch[i].at)
  // notes-qa-2：ops backend (codex M) override-kind → gpt-5.5/medium，之後 (claude L) resume handoff → opus/high
  const backend = ops.dispatch.filter((d) => d.member === 'backend')
  expect(backend.map((d) => [d.kind, d.tier, d.model, d.effort])).toEqual([
    ['codex', 'M', 'gpt-5.5', 'medium'],
    ['claude', 'L', 'opus', 'high'],
  ])
  expect(backend[1].notes).toEqual(expect.arrayContaining(['resume', 'handoff']))
  const bklog = await getJson<TaskDetailResponse>(request, '/api/projects/teamflow/tasks/2026-09-24-bklog')
  expect(bklog.dispatch.find((d) => d.member === 'frontend-shell')).toMatchObject({ role: 'frontend', kind: 'claude', tier: 'M', model: 'sonnet', effort: 'medium' })

  const h = await getJson<HistoryResponse>(request, '/api/history')
  for (const r of h.tasks) {
    expect(Array.isArray(r.dispatch)).toBe(true)
    expect(typeof r.repairWaves).toBe('number')
  }
  const hOps = h.tasks.find((r) => r.project === 'teamflow' && r.dir === '2026-09-23-ops')!
  expect(hOps.dispatch).toEqual(ops.dispatch)
  expect(existsSync(kindsCanaryFile)).toBe(false)
})


test('/trends：實際／設定兩張卡、不一致區塊、成員檔位與不一致標記，數字跟著 range 切換', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const range of ['7d', '24h', '30d', '6h'] as const) {
    const loaded = pageJson<CostsResponse>(page, `/api/costs?range=${range}`)
    if (range === '7d') await page.goto('/trends?range=7d')
    else await page.getByRole('button', { name: { '24h': '24 小時', '30d': '30 天', '6h': '6 小時' }[range] }).click()
    const c = await loaded
    if (c.tasks.length === 0 && c.unattributed === 0) {
      // 本地中午前 6h 沒有樣本：既有的空狀態，新卡片跟著不顯示
      await expect(page.getByText('尚無資料：dashboard 開著時每分鐘記錄一次')).toBeVisible()
      await expect(page.getByTestId('cost-by-actual')).toHaveCount(0)
      continue
    }
    const actual = page.getByTestId('cost-by-actual')
    const conf = page.getByTestId('cost-by-configured')
    await expect(actual).toContainText('依模型／effort 花費（實際：herdr 回報）')
    await expect(conf).toContainText('依派工檔位花費（設定：dkbo 派工）')
    await expect(actual.locator('li')).toHaveCount(c.byActual.length || 1)
    for (const [i, r] of c.byActual.entries()) {
      await expect(actual.getByTestId(`cost-actual-${i}`)).toContainText(me(r))
      await expect(actual.getByTestId(`cost-actual-${i}`)).toContainText(money(r.cost))
    }
    for (const [i, r] of c.byConfigured.entries()) {
      await expect(conf.getByTestId(`cost-configured-${i}`)).toContainText(configured(r))
      await expect(conf.getByTestId(`cost-configured-${i}`)).toContainText(money(r.cost))
    }
    const mm = page.getByTestId('cost-mismatch')
    if (c.mismatch.panes.length === 0) await expect(mm).toHaveCount(0)
    else {
      await expect(mm).toContainText('實際與設定不一致')
      await expect(mm).toContainText(money(c.mismatch.cost))
      for (const [i, p] of c.mismatch.panes.entries()) {
        const row = mm.getByTestId(`mismatch-row-${i}`)
        await expect(row).toContainText(p.project ?? UNKNOWN)
        await expect(row).toContainText(p.member ?? UNKNOWN)
        await expect(row.getByTestId('mismatch-actual')).toContainText(me(p.actual))
        await expect(row.getByTestId('mismatch-configured')).toContainText(me(p.configured))
        await expect(row).toContainText(money(p.cost))
      }
    }
    if (range === '7d') {
      // 7d 必含昨天：舊樣本（p3 無欄）→ 實際「未知」、member null → 設定「未知」；至少一列不一致
      expect(c.mismatch.panes.length).toBeGreaterThan(0)
      await expect(actual).toContainText(UNKNOWN)
      await expect(conf).toContainText(UNKNOWN)
      const bklog = c.tasks.find((t) => t.taskDir === '2026-09-24-bklog')!
      const row = page.getByTestId('task-cost-teamflow-2026-09-24-bklog')
      for (const m of Object.keys(bklog.members)) {
        const info = bklog.memberInfo[m]
        const tier = info.configured ? `${info.configured.tier} · ${me(info.configured)}` : UNKNOWN
        await expect(row.getByTestId(`member-tier-${m}`)).toHaveText(`設定 ${tier}`)
        await expect(row.getByTestId(`member-mismatch-${m}`)).toHaveCount(info.mismatch ? 1 : 0)
      }
      const mark = row.getByTestId('member-mismatch-frontend-shell')
      // tooltip 取該成員在本任務 mismatch.panes 花費最大的一列（reviewer-a Minor 2 裁定）
      const top = c.mismatch.panes.filter((p) => p.taskDir === '2026-09-24-bklog' && p.member === 'frontend-shell').sort((a, b) => b.cost - a.cost)[0]
      const tip = `實際 ${me(top.actual)}，設定 ${me(top.configured)}`
      expect(tip).toBe('實際 sonnet 5/high，設定 sonnet/medium')
      await expect(mark).toHaveAttribute('aria-label', tip)
      await mark.hover()
      await expect(page.getByRole('tooltip')).toHaveText(tip)
      await page.screenshot({ path: shotPath('AC6-trends-7d-1280-light'), fullPage: true })
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.screenshot({ path: shotPath('AC6-trends-7d-1280-dark'), fullPage: true })
      await page.emulateMedia({ colorScheme: 'light' })
      await page.mouse.move(0, 0)
    }
  }
})

test('任務詳情：成員表「設定」「實際」兩欄、共 N 次 hover、不一致標記；本任務花費卡顯示檔位', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  let loaded = pageJson<TaskDetailResponse>(page, '/api/projects/teamflow/tasks/2026-09-26-e2erun')
  await page.goto('/p/teamflow/t/2026-09-26-e2erun')
  const run = await loaded
  expect(run.dispatch.map((d) => `${d.member} ${d.tier}`)).toEqual(['frontend-shell M', 'backend M', 'backend L'])
  const table = page.getByTestId('member-table')
  await expect(table.getByRole('columnheader', { name: '設定' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: '實際' })).toBeVisible()
  // frontend-shell：設定 claude M · sonnet/medium，實際 sonnet 5/high → 不一致
  await expect(page.getByTestId('member-configured-frontend-shell')).toHaveText('claude M · sonnet/medium')
  await expect(page.getByTestId('member-actual-frontend-shell')).toContainText('sonnet 5/high')
  const mark = page.getByTestId('member-mismatch-frontend-shell')
  await expect(mark).toHaveAttribute('aria-label', '實際 sonnet 5/high，設定 sonnet/medium')
  // backend：最後一次 claude L · opus/high，共 2 次；實際 opus 5.5/high → 一致
  const be = page.getByTestId('member-configured-backend')
  await expect(be).toContainText('claude L · opus/high')
  await expect(be).toContainText('共 2 次')
  await expect(page.getByTestId('member-actual-backend')).toHaveText('opus 5.5/high')
  await expect(page.getByTestId('member-mismatch-backend')).toHaveCount(0)
  await be.getByRole('button', { name: '共 2 次' }).hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('claude M · opus/medium')
  await expect(tip).toContainText('claude L · opus/high（resume handoff）')
  await table.screenshot({ path: shotPath('AC7-detail-e2erun-members-1440') })
  await page.mouse.move(0, 0)
  await mark.hover()
  await expect(page.getByRole('tooltip')).toHaveText('實際 sonnet 5/high，設定 sonnet/medium')
  await table.screenshot({ path: shotPath('AC7-detail-e2erun-mismatch-tooltip-1440') })

  // 結案任務：沒有 live pane → 實際「—」；本任務花費卡成員旁有設定檔位
  const costs = pageJson<CostsResponse>(page, '/api/costs?range=all')
  loaded = pageJson<TaskDetailResponse>(page, '/api/projects/teamflow/tasks/2026-09-23-ops')
  await page.goto('/p/teamflow/t/2026-09-23-ops')
  const [c, ops] = await Promise.all([costs, loaded])
  // backend-kinds：M → S → S → S，最後一次 claude S · opus/low、共 4 次；結案任務沒有 live pane → 實際「—」
  const kinds = ops.dispatch.filter((d) => d.member === 'backend-kinds')
  expect(kinds.map((d) => d.tier)).toEqual(['M', 'S', 'S', 'S'])
  await expect(page.getByTestId('member-configured-backend-kinds')).toContainText('claude S · opus/low')
  await expect(page.getByTestId('member-configured-backend-kinds')).toContainText('共 4 次')
  await expect(page.getByTestId('member-actual-backend-kinds')).toHaveText('—')
  const t = c.tasks.find((x) => x.taskDir === '2026-09-23-ops')!
  const card = page.getByTestId('task-cost')
  for (const m of Object.keys(t.members)) {
    const info = t.memberInfo[m]
    await expect(card.getByTestId(`member-tier-${m}`)).toHaveText(`設定 ${info.configured ? `${info.configured.tier} · ${me(info.configured)}` : UNKNOWN}`)
  }
  await page.screenshot({ path: shotPath('AC7-detail-ops-1440'), fullPage: true })
})

test('/history：檔位欄、依角色 × 派工檔位分析卡（含耗時欄），篩選生效', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const hist = pageJson<HistoryResponse>(page, '/api/history')
  const costs = pageJson<CostsResponse>(page, '/api/costs?range=all')
  await page.goto('/history')
  const [h] = await Promise.all([hist, costs])
  const table = page.getByTestId('history-table')
  await expect(table.getByRole('columnheader', { name: '檔位' })).toBeVisible()
  // 檔位計數：(member, tier) 去重後依 tier 計數，排除 reviewer 與 null 角色
  const tiers = (r: HistoryResponse['tasks'][number]) => {
    const seen = new Set<string>()
    const n: Record<string, number> = {}
    for (const d of r.dispatch) {
      if (d.role === null || d.role === 'reviewer' || seen.has(`${d.member} ${d.tier}`)) continue
      seen.add(`${d.member} ${d.tier}`)
      n[d.tier] = (n[d.tier] ?? 0) + 1
    }
    const s = ['L', 'M', 'S'].filter((t) => n[t]).map((t) => `${t}×${n[t]}`).join(' ')
    return s || '—'
  }
  const ops = h.tasks.find((r) => r.dir === '2026-09-23-ops')!
  const bklog = h.tasks.find((r) => r.dir === '2026-09-24-bklog')!
  // ops：backend-kinds／flow／docs 各 M 或 S、backend M(codex) 與 L → 手算
  expect(tiers(ops)).toBe('L×1 M×3 S×3')
  expect(tiers(bklog)).toBe('L×1 M×5')
  for (const r of [ops, bklog]) await expect(table.getByTestId(`history-row-${r.project}-${r.dir}`).getByTestId('col-tiers')).toHaveText(tiers(r))

  const card = page.getByTestId('history-tier-analysis')
  await expect(card).toContainText('依角色 × 派工檔位')
  await expect(card).toContainText('耗時、波數等為任務層級的相關，不代表因果')
  for (const col of ['任務數', '成員數', '歸屬花費', '每成員平均花費', '平均耗時', '平均波數', '平均修復波數', '平均重審次數'])
    await expect(card.getByRole('columnheader', { name: col, exact: true })).toBeVisible()
  const rows = card.getByTestId('tier-analysis-table').locator('tbody tr')
  const n = await rows.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) {
    await expect(rows.nth(i).locator('td').first()).not.toHaveText('reviewer')
    await expect(rows.nth(i).getByTestId('ta-total-min')).not.toHaveText('')
  }
  // codex 覆寫那列（backend codex M · gpt-5.5/medium）只在 ops
  const codexRow = rows.filter({ hasText: 'codex M · gpt-5.5/medium' })
  await expect(codexRow).toHaveCount(1)
  await expect(codexRow.getByTestId('ta-tasks')).toHaveText('1')
  await card.screenshot({ path: shotPath('AC8-history-tier-analysis-1440') })
  await page.screenshot({ path: shotPath('AC8-history-1440'), fullPage: true })

  // 日期篩選：結案起 ＝ bklog 結案日 → ops（較早結案）從表格與分析卡消失
  const day = (ts: string | null) => ts!.slice(0, 10)
  expect(day(ops.closedAt) < day(bklog.closedAt)).toBe(true)
  await page.getByLabel('結案起').fill(day(bklog.closedAt))
  await expect(table.getByTestId('history-row-teamflow-2026-09-23-ops')).toHaveCount(0)
  await expect(codexRow).toHaveCount(0)
  await page.getByRole('button', { name: '清除篩選' }).click()
  await expect(codexRow).toHaveCount(1)
  // 專案篩選：選 teamflow 後分析卡仍在（e2e 只有 teamflow 有結案任務，選單只列它）
  await page.getByLabel('專案').selectOption('teamflow')
  await expect(codexRow).toHaveCount(1)
  // 日期篩選到未來 → 沒有任務 → 分析卡「沒有派工紀錄」
  await page.getByLabel('結案起').fill('2099-01-01')
  await expect(card).toContainText('沒有派工紀錄')
})

test('390×844：新卡片容器不橫向捲動（淺色＋深色截圖）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const loaded = pageJson<CostsResponse>(page, '/api/costs?range=7d')
  await page.goto('/trends?range=7d')
  expect((await loaded).mismatch.panes.length).toBeGreaterThan(0)
  for (const id of ['cost-by-actual', 'cost-by-configured', 'cost-mismatch', 'cost-by-task']) {
    await expect(page.getByTestId(id)).toBeVisible()
    await noHScroll(page.getByTestId(id))
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: shotPath('AC11-trends-390-light'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.screenshot({ path: shotPath('AC11-trends-390-dark'), fullPage: true })
  await page.emulateMedia({ colorScheme: 'light' })

  await page.goto('/history')
  const card = page.getByTestId('history-tier-analysis')
  await expect(card.getByTestId('tier-analysis-list')).toBeVisible()
  await noHScroll(card)
  await expect(card.getByTestId('tier-analysis-list')).toContainText('平均耗時')
  await card.screenshot({ path: shotPath('AC11-history-tier-analysis-390-light') })
  await page.emulateMedia({ colorScheme: 'dark' })
  await card.screenshot({ path: shotPath('AC11-history-tier-analysis-390-dark') })
})
