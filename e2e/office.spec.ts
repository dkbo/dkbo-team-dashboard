import { appendFileSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, expect, test, type Page } from '@playwright/test'
import { cl, claudeFile, lines } from '../apps/server/test/session-fixtures.ts'
import type { OfficeSession, SessionsDoc } from '../packages/shared/src/index.ts'
import { claudeDir, projectsDir, snapshotFile } from './fixtures/paths'
import { RUNNING_DIR } from './fixtures/projects'
import { CROWD, SID, crowdFile, crowdSid } from './fixtures/sessions'

// 辦公室 3D 視圖（任務 office）AC16：fixture 在 playwright.config.ts 載入時以 Date.now() 為基準產生（e2e/fixtures/sessions.ts）。
// 有 WebGL 的 chromium：3D 斷言照常；沒有 WebGL 時 3D 相關斷言改驗落到清單＋office-fallback-banner（見 has3D）。
// 截圖存在每條測試的 outputPath（DASH_E2E_OUT 可指到 repo 外）。

const shotPath = (name: string) => test.info().outputPath(`${name}.png`)

/** 此瀏覽器能不能開 WebGL（與頁面 hasWebGL 同一個問題；頁面用它決定要不要落到清單） */
const canWebGL = (page: Page) =>
  page.evaluate(() => {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  })

/** 開 /office 並等到有東西可驗：3D 就等 `__dashOffice` 出現；清單／退路就等第一列。回傳實際是不是 3D */
async function openOffice(page: Page, query = ''): Promise<boolean> {
  await page.goto(`/office${query}`)
  await expect(page.getByTestId('office-page')).toBeVisible()
  await expect(page.getByTestId('finder-row').first()).toBeVisible()
  if (!(await canWebGL(page))) {
    await expect(page.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'webgl')
    return false
  }
  if (query.includes('view=list')) return false
  await expect(page.getByTestId('office-canvas').locator('canvas')).toBeVisible()
  await page.waitForFunction(() => !!(window as unknown as { __dashOffice?: unknown }).__dashOffice)
  return true
}

/** 不開頁面，單獨問「這個 chromium 能不能開 WebGL」 */
const canWebGLOnce = async (page: Page) => {
  await page.goto('/office?view=list')
  return canWebGL(page)
}

const sessionsDoc = async (page: Page): Promise<SessionsDoc> => (await page.request.get('/api/sessions')).json()

const withBlocked = async (panes: string[], body: () => Promise<void>) => {
  const original = readFileSync(snapshotFile, 'utf8')
  try {
    const snap = JSON.parse(original)
    for (const key of ['panes', 'agents']) for (const p of snap[key]) if (panes.includes(p.pane_id)) p.agent_status = 'blocked'
    writeFileSync(snapshotFile, JSON.stringify(snap))
    await body()
  } finally {
    writeFileSync(snapshotFile, original)
  }
}

test.describe('fixture 與 API', () => {
  test('/api/sessions：session 數、對應與隱私（AC1／AC2／AC5）', async ({ page }) => {
    const raw = await page.request.get('/api/sessions')
    expect(raw.ok()).toBe(true)
    const text = await raw.text()
    // 提示詞、回覆、工具輸出、思考與指示的原文不出 server
    for (const secret of ['FAKE-PROMPT', 'FAKE-REPLY', 'FAKE-OUTPUT', 'FAKE-THOUGHT', 'FAKE-INSTRUCTIONS']) expect(text).not.toContain(secret)
    const doc = JSON.parse(text) as SessionsDoc
    const byId = new Map(doc.sessions.map((s) => [s.id, s]))
    expect(doc.sessions.length).toBeGreaterThanOrEqual(40)
    expect(doc.sessions).toHaveLength(7 + CROWD)
    const get = (id: string): OfficeSession => {
      const s = byId.get(id)
      if (!s) throw new Error(`沒有 session ${id}`)
      return s
    }
    // 有 pane：herdr 給 agent_session id → 直接對到 transcript
    expect(get('wE:p1')).toMatchObject({ kind: 'claude', sessionId: SID.lead, substate: 'running', leader: true, role: 'leader', taskDir: RUNNING_DIR, tool: { name: 'Bash' } })
    expect(get('wE:p2')).toMatchObject({ kind: 'claude', sessionId: SID.frontend, substate: 'thinking', member: 'frontend-shell', role: 'frontend', leader: false })
    expect(get('wE:p3')).toMatchObject({ kind: 'claude', sessionId: SID.backend, substate: 'running', member: 'backend', role: 'backend', subagents: 2 })
    // Codex pane 沒有 agent_session：走「同 cwd、kind 相同、最近更新」的退路
    expect(get('wE:p4')).toMatchObject({ kind: 'codex', sessionId: SID.codexPane, substate: 'running', paneId: 'wE:p4' })
    // 沒有 pane 的 session：以 s:<sessionId> 出現；等你、出錯各自的細狀態與文字
    expect(get(`s:${SID.codexWait}`)).toMatchObject({ kind: 'codex', substate: 'waiting', paneId: null, question: '要刪除 build 資料夾嗎？' })
    expect(get(`s:${SID.claudeErr}`)).toMatchObject({ kind: 'claude', substate: 'error', paneId: null, error: 'API Error: Connection lost mid-response.' })
    expect(get(`s:${SID.codexErr}`)).toMatchObject({ kind: 'codex', substate: 'error', error: 'Usage limit reached (fake)' })
    // 同一個 session 不得對到兩個 pane
    const paneIds = doc.sessions.map((s) => s.paneId).filter(Boolean)
    expect(new Set(paneIds).size).toBe(paneIds.length)
    // 人群 session（散座區）：四種細狀態都有
    const crowd = doc.sessions.filter((s) => s.sessionId.startsWith('e2e-crowd-'))
    expect(crowd).toHaveLength(CROWD)
    expect(new Set(crowd.map((s) => s.substate))).toEqual(new Set(['thinking', 'running', 'done', 'writing']))
    // herdr 面板：error 的 session 沒有 pane，不動任何 pane 的 status（總覽「卡住 0」的前提）
    expect(crowd.every((s) => s.paneId === null && s.taskDir === null)).toBe(true)
  })

  test('檔案追加 → 畫面細狀態更新 ≤ 2 秒（AC4）', async ({ page }) => {
    await openOffice(page, '?view=list')
    const row = page.locator(`[data-testid=finder-row][data-session="s:${crowdSid(0)}"]`)
    await expect(row).toHaveAttribute('data-substate', 'thinking')
    const t0 = Date.now()
    appendFileSync(crowdFile(0), lines([cl.text(crowdSid(0), Date.now(), 'end_turn'), cl.turnEnd(crowdSid(0), Date.now() + 1)]))
    await expect(row).toHaveAttribute('data-substate', 'done', { timeout: 2_000 })
    test.info().annotations.push({ type: 'append→畫面 ms', description: String(Date.now() - t0) })
  })
})

test.describe('/office 頁', () => {
  test('載入出現 canvas（或無 WebGL 時清單＋退路 Banner）', async ({ page }) => {
    const is3D = await openOffice(page)
    if (is3D) {
      await expect(page.getByTestId('office-canvas')).toBeVisible()
      await expect(page.getByTestId('office-fallback-banner')).toHaveCount(0)
      await expect(page.getByTestId('office-view-toggle')).toBeVisible()
    } else {
      await expect(page.getByTestId('office-list')).toBeVisible()
      await expect(page.getByTestId('office-canvas')).toHaveCount(0)
    }
    await expect(page.getByTestId('office-empty')).toHaveCount(0)
    await page.screenshot({ path: shotPath('office-1440-light-default') })
  })
})

test.describe('找人清單與選取', () => {
  test('「需要你」組只列等你（無 pane 的錯誤不算，AC2）；點列後網址 focus 與詳情出現', async ({ page }) => {
    const is3D = await openOffice(page)
    // 3D：找人清單的「需要你」區；清單／退路：清單模式的「需要你」欄。兩者列都是 finder-row
    const needs = is3D ? page.getByTestId('office-finder').locator('section[aria-label="需要你"]') : page.getByTestId('office-list').getByRole('region', { name: '需要你' })
    const rows = needs.getByTestId('finder-row')
    // 任務 lobby AC2：無 pane 的錯誤沒人能回，不進「需要你」；它們仍以 error 列在別組（10 分內）
    await expect(rows).toHaveCount(1)
    await expect(needs.locator(`[data-session="s:${SID.codexWait}"]`)).toHaveAttribute('data-substate', 'waiting')
    await expect(needs.locator(`[data-session="s:${SID.claudeErr}"]`)).toHaveCount(0)
    await expect(needs.locator(`[data-session="s:${SID.codexErr}"]`)).toHaveCount(0)
    // 3D 找人清單的「完成 · 中斷 · 閒置」組預設收合，先展開
    if (is3D) await page.getByTestId('office-finder').locator('section[aria-label="完成 · 中斷 · 閒置"] > button[aria-expanded]').click()
    await expect(page.locator(`[data-testid=finder-row][data-session="s:${SID.claudeErr}"]`)).toHaveAttribute('data-substate', 'error')
    await expect(page.locator(`[data-testid=finder-row][data-session="s:${SID.codexErr}"]`)).toHaveAttribute('data-substate', 'error')

    await expect(page.getByTestId('office-detail')).toHaveCount(0)
    await needs.locator(`[data-session="s:${SID.codexWait}"]`).click()
    await expect(page).toHaveURL(/[?&]focus=s%3Ae2e-codex-wait/)
    const detail = page.getByTestId('office-detail')
    await expect(detail).toBeVisible()
    await expect(detail).toHaveAttribute('data-session', `s:${SID.codexWait}`)
    await expect(detail).toContainText('要刪除 build 資料夾嗎？')
    // resume 指令用 session.sessionId（不是 OfficeSession.id）
    await expect(detail).toContainText(`codex resume ${SID.codexWait}`)
    await page.screenshot({ path: shotPath('office-1440-light-selected') })
  })

  test('?focus= 開頁即選取；找不到的 id 忽略', async ({ page }) => {
    await openOffice(page, '?focus=wE%3Ap3')
    await expect(page.getByTestId('office-detail')).toHaveAttribute('data-session', 'wE:p3')
    await expect(page.getByTestId('office-detail')).toContainText(`claude --resume ${SID.backend}`)
    await openOffice(page, '?focus=nope')
    await expect(page.getByTestId('office-detail')).toHaveCount(0)
  })

  test('角色 FilterChip 只縮找人清單，場景角色數不變', async ({ page }) => {
    const is3D = await openOffice(page)
    const header = page.getByTestId('office-page').getByText(/\d+ 個 session/).first()
    const before = await header.textContent()
    // 場景角色數：每個角色頭上一個 AgentMarker（data-slot=agent-marker）
    const markers = page.locator('[data-slot=agent-marker]')
    // 等所有角色的標記都掛上（43 個 session 逐批 mount，太早數會少）
    if (is3D) await expect.poll(() => markers.count(), { timeout: 30_000 }).toBe(7 + CROWD)
    const sceneCount = is3D ? await markers.count() : 0
    const rows = page.getByTestId('finder-row')
    const all = await rows.count()
    expect(all).toBeGreaterThan(5)
    if (!is3D) {
      // 沒有 WebGL：清單模式不套 f_role（E13：FilterChip 屬於 3D 找人清單），其他欄與計數維持
      await openOffice(page, '?f_role=frontend')
      await expect(rows).toHaveCount(all)
      return
    }
    await page.getByTestId('office-finder').getByRole('button', { name: '角色：全部' }).click()
    await page.getByRole('menuitemradio', { name: /^frontend / }).click()
    await expect(page).toHaveURL(/[?&]f_role=frontend/)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toHaveAttribute('data-session', 'wE:p2')
    // 場景不變：場景角色數、標題的 session 數（43）都不跟著縮
    await expect(markers).toHaveCount(sceneCount)
    await expect(header).toHaveText(before!)
    await expect(page.getByTestId('office-state-counts')).toContainText('思考')
    await page.screenshot({ path: shotPath('office-1440-light-role-filter') })
    // 清除後回到全部
    await page.getByTestId('office-finder').getByRole('button', { name: '清除角色篩選' }).click()
    await expect(rows).toHaveCount(all)
  })

  test('subagent 在標記上顯示「×N」', async ({ page }) => {
    const is3D = await openOffice(page, '?focus=wE%3Ap3')
    if (!is3D) {
      // 無 WebGL 沒有場景標記：「×N」只在 3D 場景（Marker）畫；資料面已在 /api/sessions 測試斷言 subagents === 2
      expect((await sessionsDoc(page)).sessions.find((s) => s.id === 'wE:p3')?.subagents).toBe(2)
      return
    }
    await expect(page.locator('[data-slot=agent-marker][data-session="wE:p3"]')).toContainText('×2')
  })
})

test.describe('3D 場景互動（AC10）', () => {
  test('hover 角色標記：AgentHoverCard 在滑鼠不動時留在畫面，移開後消失', async ({ page }) => {
    // 3D 軟體渲染（SwiftShader）在機器忙時每步慢數倍（實測 load 8／6 核，單步 2–6 秒）：預設 30 秒不夠，逾時放寬到 120 秒
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    const is3D = await openOffice(page)
    test.skip(!is3D, '無 WebGL：沒有場景')
    await page.mouse.move(700, 20)
    await page.waitForTimeout(5_000) // 鏡頭自動 fit 與模型淡入結束
    // wE:p2＝思考（氣泡型標記）、wE:p1＝執行（遠景縮成 8px 圓點）：兩種標記型都要撐得住
    for (const id of ['wE:p2', 'wE:p1']) {
      const btn = page.locator(`[data-slot=agent-marker][data-session="${id}"] button`)
      const b = (await btn.boundingBox())!
      await page.mouse.move(700, 20)
      await page.waitForTimeout(400)
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
      const card = page.locator(`[data-slot=agent-hovercard][data-session="${id}"]`)
      await expect(card, `${id} 的卡片要出現`).toHaveCount(1, { timeout: 30_000 })
      // 滑鼠不動：卡片要一直在（不能出現一下就消失）
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(150)
        expect(await card.count(), `${id} 滑鼠不動 ${(i + 1) * 150} ms 後卡片還在`).toBe(1)
      }
      await page.screenshot({ path: shotPath(`office-hovercard-${id.replace(':', '-')}`), clip: { x: Math.max(0, b.x - 320), y: Math.max(0, b.y - 260), width: 700, height: 420 } })
      await page.mouse.move(700, 20, { steps: 4 })
      await expect(card).toHaveCount(0, { timeout: 30_000 })
    }
  })

  test('滾輪動過鏡頭後重設視角亮起，按下後回到自動 fit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const is3D = await openOffice(page)
    test.skip(!is3D, '無 WebGL：沒有場景')
    const reset = page.getByRole('button', { name: /重設視角/ })
    await expect(reset).toHaveAttribute('data-moved', 'false')
    await page.mouse.move(800, 450)
    await page.mouse.wheel(0, -400)
    await expect(reset).toHaveAttribute('data-moved', 'true')
    await reset.click()
    await expect(reset).toHaveAttribute('data-moved', 'false')
  })
})

test.describe('3D 退路（AC9）', () => {
  test('素材載入失敗 → 自動落到清單＋素材 Banner，不留空白 canvas', async ({ page }) => {
    test.skip(!(await canWebGLOnce(page)), '無 WebGL：退路由下一條測試涵蓋')
    await page.route('**/office/**/*.glb', (r) => r.abort())
    await page.goto('/office')
    await expect(page.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'assets', { timeout: 20_000 })
    await expect(page.getByTestId('office-list')).toBeVisible()
    await expect(page.getByTestId('office-canvas')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.screenshot({ path: shotPath('office-fallback-assets-1440-light') })
  })

  test('WebGL context lost → 自動落到清單＋對應 Banner', async ({ page }) => {
    const is3D = await openOffice(page)
    test.skip(!is3D, '無 WebGL：退路由下一條測試涵蓋')
    await page.evaluate(() => {
      const c = document.querySelector('[data-testid=office-canvas] canvas') as HTMLCanvasElement
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGL2RenderingContext
      gl.getExtension('WEBGL_lose_context')!.loseContext()
    })
    await expect(page.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'context-lost', { timeout: 10_000 })
    await expect(page.getByTestId('office-list')).toBeVisible()
    await expect(page.getByTestId('office-canvas')).toHaveCount(0)
  })

  // launchOptions 不能放在 describe 裡（會強制換 worker），所以這條自己 launch 一個關掉 GPU／WebGL 的 chromium
  test('瀏覽器沒有 WebGL：落到清單＋webgl Banner；3D 切換 disabled；沒有 canvas、沒載入 three', async ({ baseURL }) => {
    const browser = await chromium.launch({ args: ['--disable-3d-apis', '--disable-webgl', '--disable-webgl2', '--use-gl=disabled'] })
    try {
      const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 900 } })
      const requests: string[] = []
      page.on('request', (r) => requests.push(r.url()))
      await page.goto('/office')
      await expect(page.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'webgl')
      await expect(page.getByTestId('office-list')).toBeVisible()
      await expect(page.getByTestId('office-canvas')).toHaveCount(0)
      await expect(page.locator('canvas')).toHaveCount(0)
      expect(await canWebGL(page)).toBe(false)
      expect(requests.filter((u) => /OfficeScene|\/office\/.*\.glb/.test(u))).toEqual([])
      await expect(page.getByTestId('office-view-toggle').getByRole('button', { name: '3D' })).toBeDisabled()
      await page.screenshot({ path: shotPath('office-nowebgl-1440-light'), fullPage: true })
    } finally {
      await browser.close()
    }
  })
})

test.describe('清單模式與窄螢幕', () => {
  test('view=list 桌機三欄並排', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openOffice(page, '?view=list')
    await expect(page.getByTestId('office-canvas')).toHaveCount(0)
    const cols = page.getByTestId('office-list').getByRole('region')
    await expect(cols).toHaveCount(3)
    const boxes = await cols.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width })))
    // 同一列、由左而右三欄、各欄寬度接近
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2)
    expect(Math.abs(boxes[1].y - boxes[2].y)).toBeLessThan(2)
    expect(boxes[0].x).toBeLessThan(boxes[1].x)
    expect(boxes[1].x).toBeLessThan(boxes[2].x)
    for (const b of boxes) expect(b.w).toBeGreaterThan(300)
    await page.screenshot({ path: shotPath('office-list-1440-light'), fullPage: true })
  })

  test('390 寬預設清單：三張收合卡、不載入 3D、仍要開 3D', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/office')
    await expect(page.getByTestId('office-page')).toBeVisible()
    await expect(page.getByTestId('office-list')).toBeVisible()
    await expect(page.getByTestId('office-canvas')).toHaveCount(0)
    await expect(page.getByTestId('office-list').getByRole('region')).toHaveCount(3)
    await expect(page.getByRole('button', { name: /仍要開 3D/ })).toBeVisible()
    // 窄螢幕預設清單時不應載入 three 的 chunk
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await page.reload()
    await expect(page.getByTestId('office-list')).toBeVisible()
    expect(requests.filter((u) => /OfficeScene|three/i.test(u))).toEqual([])
    await page.screenshot({ path: shotPath('office-390-light'), fullPage: true })
  })
})

test.describe('提醒（AC13）', () => {
  test('分頁標題前綴「(N) 需要你 · 」：N＝blocked pane ∪ 等你／出錯 session（paneId 去重）', async ({ page }) => {
    await page.goto('/office')
    await expect(page.getByTestId('finder-row').first()).toBeVisible()
    // 基準：沒有 pane 的 session 等你 1；沒有 pane 的出錯 2 條不算（任務 lobby AC2）；herdr 沒有 blocked pane
    await expect(page).toHaveTitle(/^\(1\) 需要你 · /)
    await withBlocked(['wE:p2'], async () => {
      // p2 在 herdr 變 blocked（其 session 轉「等你」，與 pane 同 key 只算一個）→ 2
      await expect(page).toHaveTitle(/^\(2\) 需要你 · /, { timeout: 5_000 })
    })
    await expect(page).toHaveTitle(/^\(1\) 需要你 · /, { timeout: 5_000 })
    // 在其他頁也一樣（標題由頂層掛）
    await page.goto('/')
    await expect(page).toHaveTitle(/^\(1\) 需要你 · /)
  })
})

test.describe('既有頁的細狀態（AC12）', () => {
  test('任務詳情成員表：細狀態欄、在辦公室看', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/p/teamflow/t/${RUNNING_DIR}`)
    await expect(page.getByTestId('wave-timeline')).toBeVisible()
    const subs = page.getByTestId('member-substate')
    await expect(subs.first()).toBeVisible()
    await expect(page.locator('[data-testid=member-substate][data-substate="thinking"]')).toHaveCount(1)
    await expect(page.locator('[data-testid=member-substate][data-substate="running"]')).toHaveCount(1)
    // 執行工具的那列帶工具名
    await expect(page.locator('[data-testid=member-substate][data-substate="running"]')).toContainText('Agent')
    const link = page.getByTestId('member-office-link').first()
    await expect(link).toHaveAttribute('href', /\/office\?focus=wE%3Ap[23]/)
    await link.click()
    await expect(page).toHaveURL(/\/office\?focus=wE%3Ap[23]/)
    await expect(page.getByTestId('office-detail')).toBeVisible()
    await page.goBack()
    await expect(page.getByTestId('wave-timeline')).toBeVisible()
    await page.screenshot({ path: shotPath('task-1440-light'), fullPage: true })
  })

  test('herdr 頁：agents 分組、pane 細狀態、在辦公室看', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/herdr')
    await expect(page.getByTestId('herdr-pane-wE:p1').getByText('fake screen wE:p1')).toBeVisible()
    const groups = page.getByTestId('herdr-agent-group')
    await expect(groups.first()).toBeVisible()
    await expect(page.locator('[data-testid=herdr-agent-group][data-group="working"]')).toHaveCount(1)
    await expect(page.locator('[data-testid=herdr-agent-group][data-group="needs"]')).toHaveCount(0)
    await expect(page.getByTestId('herdr-pane-wE:p1').getByTestId('pane-substate')).toHaveAttribute('data-substate', 'running')
    await expect(page.getByTestId('herdr-pane-wE:p2').getByTestId('pane-substate')).toHaveAttribute('data-substate', 'thinking')
    await expect(page.getByTestId('herdr-office-link').first()).toBeVisible()
    await page.screenshot({ path: shotPath('herdr-1440-light'), fullPage: true })
    // p3 轉 blocked → 進「需要你」組
    await withBlocked(['wE:p3'], async () => {
      const needs = page.locator('[data-testid=herdr-agent-group][data-group="needs"]')
      await expect(needs).toHaveCount(1, { timeout: 5_000 })
      await expect(needs).toContainText('backend')
    })
    await expect(page.locator('[data-testid=herdr-agent-group][data-group="needs"]')).toHaveCount(0, { timeout: 5_000 })
  })
})

test.describe('效能（AC11）', () => {
  test('靜止 3 秒 frames 增加 ≤ 2；40+ session 下 drawCalls ≤ 170', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const is3D = await openOffice(page)
    test.skip(!is3D, '無 WebGL：frames／drawCalls 不適用（AC11 備註）')
    // 起點：__dashOffice 出現後，等到最後一次 SSE 之後 ≥ 7 秒、指標不在 canvas 上（移到頁首空白處）
    await page.mouse.move(700, 20)
    await page.waitForTimeout(7_500)
    const read = () => page.evaluate(() => (window as unknown as { __dashOffice: { frames: number; drawCalls: number; quality: string } }).__dashOffice)
    const a = await read()
    await page.waitForTimeout(3_000)
    const b = await read()
    test.info().annotations.push({ type: 'frames', description: `${a.frames} → ${b.frames}（+${b.frames - a.frames}）；drawCalls ${b.drawCalls}；quality ${b.quality}` })
    expect(b.frames - a.frames).toBeLessThanOrEqual(2)
    expect((await sessionsDoc(page)).sessions.length).toBeGreaterThanOrEqual(40)
    expect(b.drawCalls).toBeGreaterThan(0)
    expect(b.drawCalls).toBeLessThanOrEqual(170)
  })
})

test.describe('版面：無橫向捲動', () => {
  const PAGES = [
    { name: 'office', url: '/office', ready: async (p: Page) => void (await expect(p.getByTestId('finder-row').first()).toBeVisible()) },
    { name: 'office-list', url: '/office?view=list', ready: async (p: Page) => void (await expect(p.getByTestId('office-list')).toBeVisible()) },
    { name: 'task', url: `/p/teamflow/t/${RUNNING_DIR}`, ready: async (p: Page) => void (await expect(p.getByTestId('member-substate').first()).toBeVisible()) },
    { name: 'herdr', url: '/herdr', ready: async (p: Page) => void (await expect(p.getByText('fake screen wE:p1')).toBeVisible()) },
  ]
  for (const width of [1440, 1024, 390]) {
    test(`${width} 寬：/office、任務詳情、herdr`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const pg of PAGES) {
        await page.goto(pg.url)
        await pg.ready(page)
        await page.waitForTimeout(500)
        const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
        expect(sw, `${pg.name} @${width}`).toBeLessThanOrEqual(cw)
      }
    })
  }
})

test.describe('截圖（關卡③對照 design/office/*.webp）', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`/office 1440 ${scheme}：3D 與清單`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.emulateMedia({ colorScheme: scheme })
      const is3D = await openOffice(page, '?focus=wE%3Ap1')
      await page.waitForTimeout(2_500) // 鏡頭飛行與模型 fade-in
      await page.screenshot({ path: shotPath(`office-3d-1440-${scheme}${is3D ? '' : '-fallback'}`) })
      await page.goto('/office?view=list')
      await expect(page.getByTestId('office-list')).toBeVisible()
      await page.waitForTimeout(500)
      await page.screenshot({ path: shotPath(`office-list-1440-${scheme}`), fullPage: true })
    })
  }
  for (const scheme of ['light', 'dark'] as const) {
    test(`/office 390 ${scheme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/office')
      await expect(page.getByTestId('office-list')).toBeVisible()
      await page.screenshot({ path: shotPath(`office-390-${scheme}`), fullPage: true })
    })
  }
})

// 放最後：會往 wE:p2 的 session 追加一行 API 錯誤，之後這個 session 一直是「出錯」
test.describe('桌面通知（AC13）', () => {
  let restoreFrontend: (() => void) | null = null
  test.afterEach(() => {
    restoreFrontend?.()
    restoreFrontend = null
  })

  test('只在「新變成」等你／出錯時各發一則；第一份資料當基準不通知；config 外的 blocked pane 歸「有人等你」', async ({ page }) => {
    await page.addInitScript(() => {
      const notes: { title: string; body: string | undefined; tag: string | undefined }[] = []
      ;(window as unknown as { __notes: typeof notes }).__notes = notes
      class FakeNotification {
        static permission = 'granted'
        static requestPermission = async () => 'granted'
        onclick: (() => void) | null = null
        constructor(title: string, opts?: { body?: string; tag?: string }) {
          notes.push({ title, body: opts?.body, tag: opts?.tag })
        }
        close() {}
      }
      ;(window as unknown as { Notification: unknown }).Notification = FakeNotification
      localStorage.setItem('dash.notify.blocked', 'on')
    })
    const notes = () => page.evaluate(() => (window as unknown as { __notes: { title: string; tag?: string }[] }).__notes)
    await page.goto('/office')
    await expect(page.getByTestId('finder-row').first()).toBeVisible()
    await expect(page).toHaveTitle(/^\(1\) 需要你 · /)
    // 開頁時就有 1 個等你，但第一份資料只當基準：0 則通知
    await page.waitForTimeout(2_000)
    expect(await notes()).toEqual([])

    // herdr 把 p2 轉 blocked → 「有人等你」恰 1 則（不會再多一則舊的 blocked 通知）
    await withBlocked(['wE:p2'], async () => {
      await expect.poll(async () => (await notes()).length, { timeout: 5_000 }).toBe(1)
      expect((await notes())[0].title).toMatch(/^有人等你/)
      await page.waitForTimeout(2_000)
      expect(await notes()).toHaveLength(1)
    })

    // 有 pane 的 Claude session（wE:p2）新出現 API 錯誤 → 「出錯」恰 1 則（無 pane 的錯誤不通知，AC2）
    // 追加前先備份、測完還原：server 把 session 為 error 的 pane 標成 blocked，那行 error 留著會讓後面 spec（unify 摘要卡「卡住」）變紅
    const feFile = claudeFile(claudeDir, path.join(projectsDir, 'teamflow'), SID.frontend)
    const feOrig = readFileSync(feFile, 'utf8')
    const feSt = statSync(feFile)
    restoreFrontend = () => {
      writeFileSync(feFile, feOrig)
      utimesSync(feFile, feSt.atimeMs / 1000, feSt.mtimeMs / 1000)
    }
    appendFileSync(feFile, lines([cl.apiError(SID.frontend, Date.now())]))
    await expect.poll(async () => (await notes()).length, { timeout: 5_000 }).toBe(2)
    expect((await notes())[1].title).toMatch(/^出錯/)
    await expect(page).toHaveTitle(/^\(2\) 需要你 · /)

    // config 以外專案的 blocked pane（wE:p5，cwd 不在任何 config 專案底下）：算進標題數、通知歸「有人等你」
    await withBlocked(['wE:p5'], async () => {
      await expect(page).toHaveTitle(/^\(3\) 需要你 · /, { timeout: 5_000 })
      await expect.poll(async () => (await notes()).length, { timeout: 5_000 }).toBe(3)
      expect((await notes())[2].title).toMatch(/^有人等你：outsider/)
    })
    await expect(page).toHaveTitle(/^\(2\) 需要你 · /, { timeout: 5_000 })
    expect(await notes()).toHaveLength(3)
  })
})

// 可及性：正文 ≥ 4.5:1（大字 ≥ 3:1），亮暗各算。逐個文字節點取實際前景色與疊起來的背景色（含 alpha），
// 排除終端畫面（固定黑底、不在 office 規格的對比要求內）與 aria-hidden 裝飾。
async function lowContrast(page: Page) {
  return page.evaluate(() => {
    const rgba = (c: string) => {
      const x = document.createElement('canvas').getContext('2d')!
      x.clearRect(0, 0, 1, 1)
      x.fillStyle = '#000'
      x.fillStyle = c
      x.fillRect(0, 0, 1, 1)
      const d = x.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3] / 255]
    }
    const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
    const over = (top: number[], bot: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + bot[i] * (1 - top[3])).concat(1)
    const bgOf = (el: Element) => {
      const stack: number[][] = []
      for (let cur: Element | null = el; cur; cur = cur.parentElement) {
        const c = rgba(getComputedStyle(cur).backgroundColor)
        if (c[3] > 0) stack.push(c)
        if (c[3] >= 1) break
      }
      let base = [255, 255, 255, 1]
      if (stack.length && stack[stack.length - 1][3] >= 1) base = stack.pop()!
      for (const s of stack.reverse()) base = over(s, base)
      return base
    }
    const out = new Map<string, { text: string; ratio: number; need: number; where: string | null | undefined }>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim()
      const el = n.parentElement
      if (!text || !el || el.closest('canvas, script, style, [aria-hidden=true], [data-testid=office-terminal-tail], [data-testid=herdr-screen], [data-testid=herdr-layout]')) continue
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.opacity === '0') continue
      const bg = bgOf(el)
      const fg = over(rgba(cs.color), bg)
      const [a, b] = [lum(fg), lum(bg)]
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      const size = parseFloat(cs.fontSize)
      const need = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5
      if (ratio < need) out.set(text + cs.color, { text: text.slice(0, 30), ratio: +ratio.toFixed(2), need, where: el.closest('[data-testid]')?.getAttribute('data-testid') })
    }
    return [...out.values()]
  })
}

test.describe('對比度（可及性）', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`/office 3D 與清單 ${scheme}：文字對比 ≥ 4.5:1（大字 ≥ 3:1）`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.emulateMedia({ colorScheme: scheme })
      const is3D = await openOffice(page, '?focus=wE%3Ap1')
      if (is3D) await page.waitForTimeout(3_000)
      expect(await lowContrast(page), `3D ${scheme}`).toEqual([])
      await page.goto('/office?view=list')
      await expect(page.getByTestId('office-list')).toBeVisible()
      expect(await lowContrast(page), `清單 ${scheme}`).toEqual([])
    })
  }
})
