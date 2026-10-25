import { expect, test, type Locator, type Page } from '@playwright/test'
import { cl, claudeFile, lines } from '../apps/server/test/session-fixtures.ts'
import type { GitSummaryResponse, OverviewDoc, SessionsDoc, TrendsResponse } from '../packages/shared/src/index.ts'
import { claudeDir, projectsDir, snapshotFile } from './fixtures/paths'
import { act, ageSession, peekWave2, runFakeDkStatus, setKindsDown, withGitConflict } from './fixtures/lobby'
import { RUNNING_DIR } from './fixtures/projects'
import { SID } from './fixtures/sessions'
import { appendFileSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// 辦公室頁面物件與事件（任務 lobby）AC13。fixture 沿用 office.spec.ts 的相對時間產生器（e2e/fixtures/sessions.ts、projects.ts）；
// 執行中改 fixture 的小工具在 e2e/fixtures/lobby.ts。預期值一律從 API 取（獨立於畫面），不寫死。
// 這組測試要求 WebGL：沒有就整組失敗（brief：3D 斷言必須實際執行，不得降級成驗清單）。
// 截圖存在每條測試的 outputPath（DASH_E2E_OUT 可指到 repo 外）。

const shotPath = (name: string) => test.info().outputPath(`${name}.png`)
const VIEW = { width: 1440, height: 900 }
const OBJECTS = ['board', 'monitor', 'archive', 'git', 'notice', 'meter'] as const

/**
 * 事件引擎把「載入後第一份資料」當基準不播；固定睡幾秒在機器忙時不保證第一份 detail 已到，
 * 這時改 fixture 會被當成基準吸收、事件永遠不播。navigate 之前先掛等待，之後等 detail 回應落地再多留一拍。
 */
async function gotoWithBaseline(page: Page, url: string, expectDetail = true) {
  // 沒有進行中任務時（如結案後重新載入）不會有 detail 請求，expectDetail=false
  const detail = expectDetail ? page.waitForResponse((r) => /\/api\/projects\/[^/]+\/tasks\//.test(r.url()) && r.ok(), { timeout: 30_000 }) : null
  await page.goto(url)
  await detail
}
const baselineSettled = (page: Page) => page.waitForTimeout(2_000)

async function openOffice(page: Page, query = '', expectDetail = true) {
  await gotoWithBaseline(page, `/office${query}`, expectDetail)
  await expect(page.getByTestId('office-page')).toBeVisible()
  await expect(page.getByTestId('office-canvas').locator('canvas'), '本組測試要求 WebGL：沒有 canvas 就是環境問題，不降級').toBeVisible()
  await page.waitForFunction(() => !!(window as unknown as { __dashOffice?: unknown }).__dashOffice)
}

const label = (page: Page, object: (typeof OBJECTS)[number], task?: string) =>
  page.locator(`[data-testid=object-label][data-object=${object}]${task ? `[data-task="${task}"]` : ''}`)
const probe = (page: Page, object: (typeof OBJECTS)[number], task?: string) =>
  page.locator(`[data-testid=office-object][data-object=${object}]${task ? `[data-task="${task}"]` : ''}`)
const live = (page: Page) => page.getByTestId('office-live-region')

const overview = async (page: Page): Promise<OverviewDoc> => (await page.request.get('/api/overview')).json()
const gitDoc = async (page: Page): Promise<GitSummaryResponse> => (await page.request.get('/api/git')).json()
const trends = async (page: Page): Promise<TrendsResponse> => (await page.request.get('/api/trends?range=7d')).json()

const withBlockedPane = async (panes: string[], body: () => Promise<void>) => {
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

/** 還原函式堆疊：測試中途失敗也要把 fixture 還原 */
const restores: (() => void | Promise<void>)[] = []
let sessionFilesTouched = false
test.afterEach(async ({ page }) => {
  while (restores.length) await restores.pop()!()
  if (sessionFilesTouched) {
    sessionFilesTouched = false
    // ageSession 還原時檔案先被清空：server 下一輪掃描（5 秒）才會重新找到那兩個 session、再輪詢才回到原狀態。
    // 等它們回來再交給下一條測試，免得後面的 spec 少 2 個 session 或看到殘留的 error
    await expect
      .poll(
        async () => {
          const ss = ((await (await page.request.get('/api/sessions')).json()) as SessionsDoc).sessions
          return ss.some((x) => x.id === `s:${SID.claudeErr}`) && ss.some((x) => x.id === `s:${SID.codexErr}`) && ss.find((x) => x.id === 'wE:p2')?.substate !== 'error'
        },
        { timeout: 40_000, intervals: [500] },
      )
      .toBe(true)
  }
})

type Box = { name: string; x: number; y: number; w: number; h: number }
const boxOf = async (el: Locator, name: string): Promise<Box | null> => {
  const b = await el.boundingBox()
  return b ? { name, x: b.x, y: b.y, w: b.width, h: b.height } : null
}
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test.describe('六件物件（AC13 / AC7）', () => {
  test('六件物件標籤出現且數字對；亮暗各截一張（預設視角）', async ({ page }) => {
    await page.setViewportSize(VIEW)
    await openOffice(page)
    await page.mouse.move(700, 20)
    await page.waitForTimeout(3_000) // 鏡頭 fit 與模型淡入
    // 預設視角 43 人：與角色標記相撞的標籤依 E16 讓位（yielded=hidden、視覺隱藏但仍在 DOM 與 a11y 樹），其餘要看得到
    for (const o of OBJECTS) await expect(label(page, o).first(), `${o} 標籤`).toBeAttached()
    await expect(label(page, 'board', RUNNING_DIR)).toBeAttached()
    const shown = await page.locator('[data-testid=object-label] > a[data-yielded=none]').count()
    test.info().annotations.push({ type: '預設視角可見標籤數', description: `${shown}/6` })
    expect(shown).toBeGreaterThanOrEqual(4)

    const ov = await overview(page)
    const git = await gitDoc(page)
    const tr = await trends(page)
    const running = ov.projects.flatMap((p) => Object.values(p.active)).find((d) => d.dir === RUNNING_DIR)!
    // 白板：波 closed／planned
    await expect(label(page, 'board', RUNNING_DIR)).toContainText(String(running.waves_closed))
    await expect(label(page, 'board', RUNNING_DIR)).toContainText(String(running.waves_planned))
    // 監控牆：herdr pane 數
    await expect(label(page, 'monitor')).toContainText(String((ov.agents ?? []).length))
    // 檔案室：已結案數
    const closed = ov.projects.flatMap((p) => p.list?.tasks ?? []).filter((t) => t.status === 'done' || t.status === 'abandoned').length
    await expect(label(page, 'archive')).toContainText(String(closed))
    // git 櫃：基準 repo 有未提交改動 → 燈 warn；數字＝未提交檔數
    const dirty = git.projects.reduce((n, r) => n + (r.counts ? r.counts.staged + r.counts.unstaged + r.counts.untracked : 0), 0)
    expect(dirty).toBeGreaterThan(0)
    await expect(label(page, 'git')).toHaveAttribute('data-tone', 'warn')
    await expect(label(page, 'git')).toContainText(String(dirty))
    // 公告板：進行中任務數
    const runningCount = ov.projects.flatMap((p) => p.list?.tasks ?? []).filter((t) => t.status === 'running' || t.status === 'planning').length
    await expect(label(page, 'notice')).toContainText(String(runningCount))
    // 電表：今日花費
    const day = new Date()
    const today = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    const spend = tr.costByDay.filter((r) => r.day === today).reduce((s, r) => s + r.cost, 0)
    await expect(label(page, 'meter')).toContainText(`$${spend.toFixed(2)}`)
    await page.screenshot({ path: shotPath('office-objects-1440-light-default') })
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`/office 1440 ${scheme}：預設視角與拉近各一張`, async ({ page }) => {
      await page.setViewportSize(VIEW)
      await page.emulateMedia({ colorScheme: scheme })
      await openOffice(page)
      await page.mouse.move(700, 20)
      await page.waitForTimeout(3_000)
      await page.screenshot({ path: shotPath(`office-lobby-1440-${scheme}-default`) })
      // 拉近：滾輪往前，密度應轉 full
      await page.mouse.move(900, 450)
      for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300)
      await page.mouse.move(700, 20)
      await page.waitForTimeout(2_000)
      await page.screenshot({ path: shotPath(`office-lobby-1440-${scheme}-zoomed`) })
    })
  }

  test('點物件與點標籤各開對應路由', async ({ page }) => {
    await page.setViewportSize(VIEW)
    const routes: Record<(typeof OBJECTS)[number], RegExp> = {
      board: new RegExp(`/p/teamflow/t/${RUNNING_DIR}`),
      monitor: /\/herdr$/,
      archive: /\/history$/,
      git: /\/git(\?|$)/,
      notice: /\/$/,
      meter: /\/trends(\?|$)/,
    }
    test.setTimeout(240_000)
    for (const o of OBJECTS) {
      const task = o === 'board' ? RUNNING_DIR : undefined
      // 點標籤：可見的用真實滑鼠（hover 會展開再點）；被角色標記讓位成 hidden 的看不到、滑鼠點不到，改驗鍵盤 focus＋Enter
      await openOffice(page)
      await page.mouse.move(700, 20)
      await page.waitForTimeout(2_500)
      const link = label(page, o, task).first().locator('a')
      if ((await link.getAttribute('data-yielded')) === 'none') {
        const b = (await link.boundingBox())!
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 })
        await page.waitForTimeout(500) // hover 展開
        const b2 = (await link.boundingBox())!
        await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2)
        test.info().annotations.push({ type: `${o} 標籤`, description: '滑鼠點擊' })
      } else {
        await link.focus()
        await page.keyboard.press('Enter')
        test.info().annotations.push({ type: `${o} 標籤`, description: '讓位 hidden，改鍵盤 Enter' })
      }
      await expect(page, `點 ${o} 標籤`).toHaveURL(routes[o])
      // 點物件本體：探針在物件中心的投影；中心被角色標記蓋住時往旁邊找落在 canvas 上且游標變 pointer 的點
      await openOffice(page)
      await page.mouse.move(700, 20)
      await page.waitForTimeout(2_500)
      const scan = async () => {
        const c = (await probe(page, o, task).first().boundingBox())!
        for (const [dx, dy] of [[0, 0], [0, 12], [0, -12], [14, 0], [-14, 0], [0, 24], [0, -24], [28, 0], [-28, 0], [0, 40], [0, -40], [50, 0], [-50, 0]]) {
          const p = { x: c.x + dx, y: c.y + dy }
          const onCanvas = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', p)
          if (!onCanvas) continue
          await page.mouse.move(700, 20)
          await page.mouse.move(p.x, p.y, { steps: 4 })
          await page.waitForTimeout(300)
          if ((await page.locator('canvas').first().evaluate((e) => getComputedStyle(e).cursor)) === 'pointer') return p
        }
        return null
      }
      let hit = await scan()
      if (!hit) {
        // 預設視角物件被角色標記蓋住：把滑鼠停在物件上滾輪拉近，標記縮小散開後再找
        const c = (await probe(page, o, task).first().boundingBox())!
        await page.mouse.move(c.x, c.y)
        for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -300)
        await page.mouse.move(700, 20)
        await page.waitForTimeout(2_500)
        hit = await scan()
        test.info().annotations.push({ type: `${o} 物件`, description: '預設視角被角色標記蓋住，拉近後才點得到' })
      }
      expect(hit, `${o} 物件本體找不到可點的點（游標沒變 pointer）`).not.toBeNull()
      await page.mouse.click(hit!.x, hit!.y)
      await expect(page, `點 ${o} 物件`).toHaveURL(routes[o])
    }
  })

  test('可 tab 聚焦、Enter 開頁', async ({ page }) => {
    await page.setViewportSize(VIEW)
    await openOffice(page)
    await page.waitForTimeout(2_500)
    const target = label(page, 'meter').first().locator('button, a, [tabindex]').first()
    await target.focus()
    await expect(target).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/trends(\?|$)/)
  })
})

test.describe('情境：E3 白板、E4 跳電、E5 衝突燈', () => {
  test('E3：基準＝有未解 ESCALATE 的白板 warn；pane 轉 blocked → danger，chip 兩個都列', async ({ page }) => {
    await page.setViewportSize(VIEW)
    await openOffice(page)
    await page.waitForTimeout(2_500)
    const board = label(page, 'board', RUNNING_DIR)
    const aria = board.locator('a')
    await expect(board).toHaveAttribute('data-tone', 'warn')
    await expect(aria).toHaveAttribute('aria-label', /ESCALATE/)
    await page.screenshot({ path: shotPath('office-e3-warn-1440-light') })
    await withBlockedPane(['wE:p2'], async () => {
      await expect(board).toHaveAttribute('data-tone', 'danger', { timeout: 10_000 })
      await expect(aria).toHaveAttribute('aria-label', /ESCALATE/)
      await expect(aria).toHaveAttribute('aria-label', /等你|卡住|錯誤/)
      await page.screenshot({ path: shotPath('office-e3-danger-1440-light') })
    })
    await expect(board).toHaveAttribute('data-tone', 'warn', { timeout: 10_000 })
  })

  test('E4：任一 kind 熔斷 → 電表「跳電 · kind」warn', async ({ page }) => {
    await page.setViewportSize(VIEW)
    restores.push(setKindsDown(['codex'], Date.now() + 30 * 60_000))
    await openOffice(page)
    await page.waitForTimeout(2_500)
    const meter = label(page, 'meter')
    await expect(meter).toContainText('跳電', { timeout: 10_000 })
    await expect(meter).toContainText('codex')
    await expect(meter).toHaveAttribute('data-tone', 'warn')
    await page.screenshot({ path: shotPath('office-e4-power-cut-1440-light') })
  })

  test('E5：合併衝突 → git 櫃 danger 燈＋「衝突」chip', async ({ page }) => {
    await page.setViewportSize(VIEW)
    await withGitConflict(async () => {
      // 重新載入頁面：git 摘要在 /office 掛載時抓一次（之後每 30 秒）
      await openOffice(page)
      await page.waitForTimeout(2_500)
      const gitLabel = label(page, 'git')
      await expect(gitLabel).toHaveAttribute('data-tone', 'danger', { timeout: 10_000 })
      await expect(gitLabel).toContainText('衝突')
      await page.screenshot({ path: shotPath('office-e5-conflict-1440-light') })
    })
  })
})

test.describe('事件四幕與 live region（AC13 / AC5 / AC6 / AC10）', () => {
  test('依序：審查開始 → 要修 → 波關閉 → 結案；live region 逐句播報；重新載入不重播', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(VIEW)
    await openOffice(page)
    await page.mouse.move(700, 20)
    await page.waitForTimeout(3_000)
    await baselineSettled(page)
    await expect(live(page)).toHaveAttribute('aria-live', 'polite')
    await expect(live(page)).toHaveText('') // 基準不播
    // 基準就有未解 ESCALATE（白板 warn）：leader 頭上常駐 EventBadge「!」，找人清單 leader 列同顆（AC6／AC10 常駐到解除）
    await expect(page.locator('[data-testid=event-badge][data-kind=escalate]'), 'leader 頭上的 EventBadge').toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('[data-testid=finder-row][data-session="wE:p1"] [data-testid=finder-escalate]'), '找人清單 leader 列的 finder-escalate').toHaveCount(1)
    await expect(page.locator('[data-testid=finder-escalate]'), '只有 leader 列有').toHaveCount(1)

    restores.push(act.reviewSpawned())
    await expect(live(page)).toContainText('波 2 審查開始', { timeout: 15_000 })
    await page.screenshot({ path: shotPath('office-event-1-review-spawned-1440-light') })

    // 要修：演員＝本波全部 dev（wE:p2、wE:p3）頭頂各一個 EventBubble。氣泡只活約 2 秒，機器忙時 Playwright 的每個來回都可能慢過它，
    // 所以量測不走來回：觸發前在頁面內裝錄製器（每 40 ms 記下有文字的氣泡／徽章／標記的 rect），事後一次取回再判定。
    await page.evaluate(() => {
      type B = { name: string; x: number; y: number; w: number; h: number }
      const w = window as unknown as { __bp: { rec: { t: number; texts: string[]; boxes: B[] }[]; timer: number } }
      const snap = (): B[] => {
        const out: B[] = []
        for (const [name, sel] of [['bubble', '[data-testid=event-bubble]'], ['badge', '[data-testid=event-badge]'], ['marker', '[data-slot=agent-marker]']] as const)
          document.querySelectorAll<HTMLElement>(sel).forEach((el, i) => {
            const r = el.getBoundingClientRect()
            if (r.width > 2 && r.height > 2) out.push({ name: `${name}:${el.dataset.session ?? el.dataset.kind ?? i}`, x: r.x, y: r.y, w: r.width, h: r.height })
          })
        return out
      }
      w.__bp = { rec: [], timer: 0 }
      w.__bp.timer = window.setInterval(() => {
        const texts = [...document.querySelectorAll('[data-testid=event-bubble]')].map((e) => (e.textContent ?? '').trim()).filter(Boolean)
        if (texts.length) w.__bp.rec.push({ t: performance.now(), texts, boxes: snap() })
      }, 40)
    })
    restores.push(act.reviewFix(2))
    const recorded = () => page.evaluate(() => (window as unknown as { __bp: { rec: { t: number; texts: string[]; boxes: { name: string; x: number; y: number; w: number; h: number }[] }[] } }).__bp.rec)
    await expect
      .poll(async () => (await recorded()).filter((r) => r.texts.length >= 2).length, {
        timeout: 45_000,
        intervals: [200],
        message: `錄到的氣泡文字：${JSON.stringify((await recorded()).map((r) => r.texts))}；live region：${await live(page).textContent()}；fixture 檔 wave2：${JSON.stringify(peekWave2())}；直接跑假 dk-status：${runFakeDkStatus()}；server overview：${await page.evaluate(async () => { try { const o = await (await fetch('/api/overview')).json(); return JSON.stringify(o.projects.map((p: { name: string; error: unknown; stale: boolean; fetchedAt: number }) => [p.name, p.error, p.stale, Math.round((Date.now() - p.fetchedAt) / 1000) + 's前'])) } catch (e) { return String(e) } })}；server API detail 的 wave2：${await page.evaluate(async (dir) => { try { const d = await (await fetch(`/api/projects/teamflow/tasks/${encodeURIComponent(dir)}`)).json(); const t = d.detail?.task ?? d.task; const w = t?.waves?.find((x: { wave: number }) => x.wave === 2); return JSON.stringify(w ? [w.review_spawned_at, w.review_verdict, w.review_verdict_at] : { noWave2: t?.waves?.map((x: { wave: number }) => x.wave), keys: Object.keys(d).join(',') }) } catch (e) { return String(e) } }, RUNNING_DIR)}`,
      })
      .toBeGreaterThan(0)
    await page.screenshot({ path: shotPath('office-event-2-review-fix-1440-light') }) // 盡力而為：機器忙時可能已過期，判定不靠它
    await page.waitForTimeout(3_000) // 等氣泡播完
    const rec = (await recorded()).filter((r) => r.texts.length >= 2)
    await page.evaluate(() => clearInterval((window as unknown as { __bp: { timer: number } }).__bp.timer))
    expect(rec.length, '應錄到兩個氣泡同時在').toBeGreaterThan(0)
    expect(rec[0].texts.every((t) => t.includes('要修 2 條')), `氣泡文字：${rec[0].texts.join('｜')}`).toBe(true)
    // AC10：EventBubble、EventBadge、AgentMarker 的 bounding box 兩兩不相交。氣泡排開在鏡頭停下／疊層變動後才算（director/bubbleLayout，
    // 掛上時同步排版（PlacedBubble useLayoutEffect），所以要求「穩態」（兩個氣泡都在的最後一筆）無相交，並把「花多久才排開」記進 annotation
    type RB = (typeof rec)[number]['boxes'][number]
    const hit = (a: RB, b: RB) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    const clashOf = (bs: RB[]) => {
      const c: string[] = []
      for (let i = 0; i < bs.length; i++)
        for (let j = i + 1; j < bs.length; j++) if ((/^(bubble|badge)/.test(bs[i].name) || /^(bubble|badge)/.test(bs[j].name)) && hit(bs[i], bs[j])) c.push(`${bs[i].name} × ${bs[j].name}`)
      return c
    }
    const clash = clashOf(rec[rec.length - 1].boxes)
    const firstClean = rec.findIndex((_, k) => rec.slice(k).every((r) => clashOf(r.boxes).length === 0))
    const settleMs = firstClean < 0 ? null : Math.round(rec[firstClean].t - rec[0].t)
    test.info().annotations.push({ type: 'bubble-settled-ms', description: `${settleMs}（錄到 ${rec.length} 筆、共 ${rec[0].texts.length} 個氣泡）` })
    if (clash.length) console.log('DIAG', JSON.stringify({ clash, settleMs, last: rec[rec.length - 1].boxes.filter((b) => /^(bubble|badge)/.test(b.name)) }))
    expect(clash, '事件氣泡／徽章與標記相交（穩態）').toEqual([])
    await expect(live(page)).toContainText('審查要修 2 條', { timeout: 15_000 })

    restores.push(act.waveClosed())
    await expect(live(page)).toContainText('波 2 關閉', { timeout: 15_000 })
    // 白板數字：波 1／3 → 2／3（aria-label 與 TaskBoardLabel 的進度）
    await expect(label(page, 'board', RUNNING_DIR).locator('a')).toHaveAttribute('aria-label', /波 2／3/, { timeout: 10_000 })
    await page.screenshot({ path: shotPath('office-event-3-wave-closed-1440-light') })

    restores.push(act.taskDone())
    await expect(live(page)).toContainText('任務結案', { timeout: 15_000 })
    // 結案保留 10 分鐘（E8）：白板仍在、標成結案
    await expect(page.locator(`[data-testid=object-label][data-task="${RUNNING_DIR}"] [data-closed=done]`)).toBeAttached({ timeout: 10_000 })
    await page.screenshot({ path: shotPath('office-event-4-task-done-1440-light') })

    // 重新載入：不重播（基準），白板（結案保留 10 分鐘）仍在；任務已結案，沒有進行中任務所以不會抓 detail
    await openOffice(page, '', false)
    await page.waitForTimeout(8_000)
    await expect(live(page)).toHaveText('')
    await expect(page.locator('[data-testid=event-bubble]')).toHaveCount(0)
  })

  test('直接開 /office（沒先開任務頁）看得到白板 warn 與事件', async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize(VIEW)
    await openOffice(page) // 新 page：store.details 為空
    await expect(label(page, 'board', RUNNING_DIR)).toHaveAttribute('data-tone', 'warn', { timeout: 10_000 })
    await baselineSettled(page)
    restores.push(act.reviewSpawned())
    await expect(live(page)).toContainText('審查開始', { timeout: 15_000 })
  })

  test('view=list 也播報、且不載入物件 chunk', async ({ page }) => {
    test.setTimeout(60_000)
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await page.setViewportSize(VIEW)
    await gotoWithBaseline(page, '/office?view=list')
    await expect(page.getByTestId('office-list')).toBeVisible()
    await page.waitForTimeout(3_000)
    await baselineSettled(page)
    restores.push(act.reviewSpawned())
    await expect(live(page)).toContainText('審查開始', { timeout: 15_000 })
    // 清單模式：不載 3D 程式（場景、物件、事件導演、three）與素材，也不輪詢 git 摘要
    // 比對前先拿掉 worktree 路徑（目錄名就叫 lobby）
    const rel = requests.map((u) => new URL(u).pathname.replace(/^\/@fs\/.*?\/\.worktrees\/[^/]+/, ''))
    expect(rel.filter((u) => /office-scene|OfficeScene|Lobby|EventDirector|node_modules.*three|\.glb/.test(u))).toEqual([])
    expect(requests.filter((u) => /\/api\/git/.test(u))).toEqual([])
  })
})

test.describe('無 pane 錯誤衰退（AC2）', () => {
  test('無 pane 的錯誤不算需要你、11 分後衰退成 idle 且 3D 不畫 alert 標記；有 pane 的錯誤 11 分後仍算', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(VIEW)
    await openOffice(page)
    await page.waitForTimeout(2_500)
    const row = (sid: string) => page.locator(`[data-testid=finder-row][data-session="s:${sid}"]`)
    // 無 pane 的錯誤與閒置都在「完成 · 中斷 · 閒置」組，預設收合：展開才看得到列
    const restHead = page.getByTestId('office-finder').locator('section[aria-label="完成 · 中斷 · 閒置"] > button[aria-expanded]')
    await restHead.click()
    await expect(restHead).toHaveAttribute('aria-expanded', 'true')
    const marker = (sid: string) => page.locator(`[data-slot=agent-marker][data-session="s:${sid}"]`)
    // 基準：等你 1（無 pane 的錯誤 2 條不算需要你）；兩條仍是 error
    await expect(page).toHaveTitle(/^\(1\) 需要你 · /)
    for (const sid of [SID.claudeErr, SID.codexErr]) {
      await expect(row(sid)).toHaveAttribute('data-substate', 'error')
      // 11:57 ruling：無 pane 的錯誤（10 分內）3D 照「中斷」畫，不畫 alert 標記
      await expect(marker(sid)).toHaveAttribute('data-substate', 'interrupted')
    }
    await page.screenshot({ path: shotPath('office-pane-error-fresh-1440-light') })

    // 11 分：衰退成 idle（9 分邊界由 Vitest 涵蓋；server 增量讀檔，連續改寫要先還原，這裡只推一次）
    sessionFilesTouched = true
    restores.push(ageSession('claude', SID.claudeErr, 11 * 60_000), ageSession('codex', SID.codexErr, 11 * 60_000))
    for (const sid of [SID.claudeErr, SID.codexErr]) await expect(row(sid)).toHaveAttribute('data-substate', 'idle', { timeout: 15_000 })
    await expect(page).toHaveTitle(/^\(1\) 需要你 · /)
    const needs = page.getByTestId('office-finder').locator('section[aria-label="需要你"]')
    await expect(needs.getByTestId('finder-row')).toHaveCount(1)
    // 3D：沒有任何 error／alert 標記（衰退成 idle 預設不畫標記）
    await expect(page.locator('[data-slot=agent-marker][data-substate=error]')).toHaveCount(0)
    for (const sid of [SID.claudeErr, SID.codexErr]) if ((await marker(sid).count()) > 0) await expect(marker(sid)).toHaveAttribute('data-substate', 'idle')
    await page.screenshot({ path: shotPath('office-pane-error-decayed-1440-light') })

    // 有 pane 的 error（wE:p2）11 分後仍算需要你、仍是 error
    // 追加前先備份：ageSession 還原的是「追加之後」的內容，那行 error 會留在 fixture 污染後面的 spec；這個還原最後執行（LIFO 的最底層）
    const feFile = claudeFile(claudeDir, path.join(projectsDir, 'teamflow'), SID.frontend)
    const feOrig = readFileSync(feFile, 'utf8')
    const feSt = statSync(feFile)
    restores.push(() => {
      writeFileSync(feFile, feOrig)
      utimesSync(feFile, feSt.atimeMs / 1000, feSt.mtimeMs / 1000)
    })
    appendFileSync(feFile, lines([cl.apiError(SID.frontend, Date.now())]))
    await expect(page).toHaveTitle(/^\(2\) 需要你 · /, { timeout: 10_000 })
    restores.push(ageSession('claude', SID.frontend, 11 * 60_000))
    await page.waitForTimeout(8_000)
    await expect(page).toHaveTitle(/^\(2\) 需要你 · /)
    await expect(page.locator('[data-testid=finder-row][data-session="wE:p2"]')).toHaveAttribute('data-substate', 'error')
  })
})

test.describe('標籤不重疊（AC8）', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`預設鏡頭 ${scheme}：物件標籤與角色標記互不相交、不出 canvas、不壓疊層`, async ({ page }) => {
      await page.setViewportSize(VIEW)
      await page.emulateMedia({ colorScheme: scheme })
      await openOffice(page)
      await page.mouse.move(700, 20)
      await page.waitForTimeout(4_000)
      const canvas = (await page.getByTestId('office-canvas').boundingBox())!
      // 標籤：物件標籤（讓位成 hidden 的不佔位）與區牌；量實際膠囊（label 內第一個元素）
      const labels: Box[] = []
      const objs = page.locator('[data-testid=object-label]')
      for (let i = 0; i < (await objs.count()); i++) {
        const inner = objs.nth(i).locator(':scope > *').first()
        if ((await inner.getAttribute('data-yielded')) === 'hidden' || (await inner.getAttribute('class'))?.split(' ').includes('sr-only')) continue
        const b = await boxOf(inner, `object:${await objs.nth(i).getAttribute('data-object')}`)
        if (b && b.w > 2 && b.h > 2) labels.push(b)
      }
      const signs = page.locator('[data-slot=zone-sign]')
      for (let i = 0; i < (await signs.count()); i++) {
        const b = await boxOf(signs.nth(i), `zone-sign:${((await signs.nth(i).textContent()) ?? '').trim().slice(0, 12)}`)
        if (b && b.w > 2) labels.push(b)
      }
      expect(labels.filter((b) => b.name.startsWith('object:')).length).toBeGreaterThanOrEqual(4)
      // 疊層：找人清單、狀態計數、圖例、視角控制
      const overlays: Box[] = []
      for (const [name, loc] of [
        ['finder', page.getByTestId('office-finder')],
        ['state-counts', page.getByTestId('office-state-counts')],
        ['legend', page.getByRole('button', { name: /圖例/ }).first()],
        ['view-controls', page.getByRole('group', { name: '視角' })],
      ] as const) {
        const b = await boxOf(loc, name)
        if (b) overlays.push(b)
      }
      expect(overlays.length).toBeGreaterThanOrEqual(3)
      const problems: string[] = []
      for (const b of labels) {
        if (b.x < canvas.x - 1 || b.y < canvas.y - 1 || b.x + b.w > canvas.x + canvas.width + 1 || b.y + b.h > canvas.y + canvas.height + 1) problems.push(`${b.name} 出 canvas`)
        for (const o of overlays) if (overlap(b, o)) problems.push(`${b.name} 壓到疊層 ${o.name}`)
      }
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i], labels[j])) problems.push(`${labels[i].name} × ${labels[j].name}`)
      // 與可見的角色標記也不相交（物件標籤才適用：區牌與標記的關係照任務一）
      const markers = page.locator('[data-slot=agent-marker]')
      for (let i = 0; i < (await markers.count()); i++) {
        const m = await boxOf(markers.nth(i), `marker:${await markers.nth(i).getAttribute('data-session')}`)
        if (m && m.w > 2) for (const b of labels) if (b.name.startsWith('object:') && overlap(b, m)) problems.push(`${b.name} × ${m.name}`)
      }
      expect(problems, '標籤相交／越界').toEqual([])
      await page.screenshot({ path: shotPath(`office-labels-no-overlap-1440-${scheme}`) })
    })
  }
})

test.describe('效能（AC11）', () => {
  test('有物件、無事件：靜止 frames ≤ 2（跨一次 git 30 秒輪詢）；drawCalls ≤ 170', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(VIEW)
    await openOffice(page)
    await page.mouse.move(700, 20)
    await page.waitForTimeout(7_500)
    const read = () => page.evaluate(() => (window as unknown as { __dashOffice: { frames: number; drawCalls: number } }).__dashOffice)
    // 量測期間要跨過一次 git 30 秒輪詢：連續量 11 個 3 秒窗（共約 33 秒），每窗 ≤ 2
    let calls = 0
    for (let i = 0; i < 11; i++) {
      const a = await read()
      await page.waitForTimeout(3_000)
      const b = await read()
      expect(b.frames - a.frames, `第 ${i + 1} 個 3 秒窗 frames`).toBeLessThanOrEqual(2)
      calls = Math.max(calls, b.drawCalls)
    }
    expect(calls).toBeGreaterThan(0)
    expect(calls).toBeLessThanOrEqual(170)
  })
})
