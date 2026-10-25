import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cl, claudeFile, codexFile, cx, writeJsonl } from '../../apps/server/test/session-fixtures.ts'
import type { SessionsDoc } from '../../packages/shared/src/index.ts'
import { claudeDir, codexDir, projectsDir } from './paths'

// 辦公室（office）用的去識別化 session JSONL：Claude Code 與 Codex 各一批，內容全是假字串、路徑全在執行期目錄底下。
// 事件 `timestamp` 與檔案 mtime 一律以呼叫當下（config 載入時的 Date.now()）為基準往前推，不寫死日期：
// 24 小時窗、Q3 的 10 分轉閒置與 Q8 的 2 小時下班才不會讓 fixture 隔天全部消失。
// 形狀沿用 apps/server/test/session-fixtures.ts（backend 對照真實 JSONL 欄位寫的產生器）。

const teamflowDir = path.join(projectsDir, 'teamflow')
const wt = (name: string) => path.join(teamflowDir, '.worktrees', name)

/** herdr 快照（herdr-snapshot.json）的 agent_session 與這裡的 session id 必須一致 */
export const SID = {
  lead: 'e2e-claude-lead', // pane wE:p1（leader-e2erun）：執行工具
  frontend: 'e2e-claude-fs', // pane wE:p2（e2erun-frontend-shell）：思考
  backend: 'e2e-claude-be', // pane wE:p3（e2erun-backend）：執行工具＋ 2 個 subagent
  claudeErr: 'e2e-claude-err', // 無 pane：API 錯誤
  codexPane: 'e2e-codex-pane', // pane wE:p4（herdr 不給 agent_session，走退路）：執行
  codexWait: 'e2e-codex-wait', // 無 pane：審批（等你）
  codexErr: 'e2e-codex-err', // 無 pane：task_complete 帶 error
}
export const crowdSid = (i: number) => `e2e-crowd-${String(i).padStart(2, '0')}`
/** 人群 session 數（含 crowd-00 這條讓測試追加行用）；加上上面 7 條共 43 個，超過 AC16 要求的 40 */
export const CROWD = 36

const ago = (now: number, s: number) => now - s * 1000

export function setupSessions(now: number = Date.now()) {
  mkdirSync(claudeDir, { recursive: true })
  mkdirSync(codexDir, { recursive: true })
  const claude = (sid: string, cwd: string, events: unknown[], mtime: number) => writeJsonl(claudeFile(claudeDir, cwd, sid), events, mtime)
  const codex = (sid: string, cwd: string, startedAt: number, events: unknown[], mtime: number) => writeJsonl(codexFile(codexDir, startedAt, sid), [cx.meta(sid, cwd, startedAt), cx.context(startedAt + 500), ...events], mtime)

  // ── 有 pane 的 Claude（herdr 給 agent_session id，直接對到 transcript）
  claude(SID.lead, teamflowDir, [cl.meta(SID.lead, teamflowDir, ago(now, 120)), cl.prompt(SID.lead, teamflowDir, ago(now, 90)), cl.thinking(SID.lead, ago(now, 60)), cl.tool(SID.lead, ago(now, 20), 'tl1', 'Bash', { command: 'pnpm test --filter e2e' })], ago(now, 20))
  claude(SID.frontend, teamflowDir, [cl.prompt(SID.frontend, teamflowDir, ago(now, 50)), cl.thinking(SID.frontend, ago(now, 10), 'claude-sonnet-5-5')], ago(now, 10))
  const be = claude(SID.backend, teamflowDir, [cl.prompt(SID.backend, teamflowDir, ago(now, 70)), cl.tool(SID.backend, ago(now, 30), 'tb1', 'Agent', { description: 'scan repo' })], ago(now, 30))
  // subagent：最近有動且最後一則不是 end_turn 的檔才算執行中
  const sub = path.join(be.slice(0, -'.jsonl'.length), 'subagents')
  for (const n of ['a', 'b']) writeJsonl(path.join(sub, `agent-${n}.jsonl`), [{ ...cl.tool(SID.backend, ago(now, 15), `s${n}`, 'Grep', { pattern: 'x' }), isSidechain: true }], ago(now, 15))

  // ── 沒有 pane 的 Claude：API 錯誤（需要你的「出錯」）
  claude(SID.claudeErr, wt('claude-err'), [cl.prompt(SID.claudeErr, wt('claude-err'), ago(now, 40)), cl.apiError(SID.claudeErr, ago(now, 5))], ago(now, 5))

  // ── Codex：pane 不給 agent_session，走「同 cwd、kind 相同、最近更新」的退路（只有 wE:p4 一個 Codex pane 在 teamflow 根目錄）
  const cpStart = ago(now, 200)
  codex(SID.codexPane, teamflowDir, cpStart, [cx.started(cpStart + 1000), cx.user(cpStart + 2000), cx.call(ago(now, 15), 'cc1', 'pnpm build')], ago(now, 15))
  const cwStart = ago(now, 100)
  codex(SID.codexWait, wt('codex-wait'), cwStart, [cx.started(cwStart + 1000), cx.approval(ago(now, 8))], ago(now, 8))
  const ceStart = ago(now, 150)
  codex(SID.codexErr, wt('codex-err'), ceStart, [cx.started(ceStart + 1000), cx.complete(ago(now, 12), { message: 'Usage limit reached (fake)', codex_error_info: 'usage_limit_exceeded' })], ago(now, 12))

  // ── 人群：各專案的無任務 session（散座區），把場景撐到 40 人以上量 drawCalls
  for (let i = 0; i < CROWD; i++) {
    const sid = crowdSid(i)
    const cwd = wt(`crowd-${String(i).padStart(2, '0')}`)
    const t = ago(now, 30 + i)
    const head = [cl.prompt(sid, cwd, t - 5000)]
    const events =
      i % 4 === 0 ? [...head, cl.thinking(sid, t)]
      : i % 4 === 1 ? [...head, cl.tool(sid, t, `c${i}`, 'Bash', { command: `echo ${i}` })]
      : i % 4 === 2 ? [...head, cl.text(sid, t, 'end_turn'), cl.turnEnd(sid, t + 500)]
      : [...head, cl.text(sid, t, 'tool_use')]
    claude(sid, cwd, events, t)
  }
}

/** crowd-i 的 transcript 路徑（測試往裡追加行，驗檔案追加到畫面的時間） */
export const crowdFile = (i: number) => claudeFile(claudeDir, wt(`crowd-${String(i).padStart(2, '0')}`), crowdSid(i))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 全套 e2e 跑超過 10 分鐘後，config 載入時一次生成的 fixture 會過期（subagent 10 分不算執行中、人群 10 分轉閒置而沒有標記），
 * 依賴新鮮度的 spec（office.spec.ts 排在長的 lobby.spec.ts 之後）開跑前重生成一次。
 * server 的 tail 以「檔案大小＝已讀位移」增量讀，所以先把 transcript 清空、等它重置，再用 setupSessions 以現在為基準寫回，最後等 API 反映出來。
 * Claude 的路徑只含 cwd 與 sid，原路徑清空即可；Codex 的檔名含啟動時間（隨 now 變），清空會留下同 sid 的空檔、新舊兩份並存，所以直接刪除。
 * 最後要求 session 數恰好是 7 ＋ CROWD：有重複就明確報錯，不悄悄污染後面的測試。
 */
export async function refreshSessions(apiBase = 'http://127.0.0.1:4417') {
  for (const e of readdirSync(claudeDir, { withFileTypes: true, recursive: true })) if (e.isFile() && e.name.endsWith('.jsonl')) writeFileSync(path.join(e.parentPath, e.name), '')
  for (const e of readdirSync(codexDir, { withFileTypes: true, recursive: true })) if (e.isFile() && e.name.endsWith('.jsonl')) unlinkSync(path.join(e.parentPath, e.name))
  await sleep(2_500)
  setupSessions(Date.now())
  const deadline = Date.now() + 45_000
  let last = ''
  for (;;) {
    try {
      const ss = ((await (await fetch(`${apiBase}/api/sessions`)).json()) as SessionsDoc).sessions
      const stale = ss.filter((x) => x.lastEventAt != null && Date.now() - x.lastEventAt > 3 * 60_000).length
      last = `sessions=${ss.length} p3.subagents=${ss.find((x) => x.id === 'wE:p3')?.subagents} 過期=${stale}`
      if (ss.length === 7 + CROWD && ss.find((x) => x.id === 'wE:p3')?.subagents === 2 && stale === 0) return
    } catch (e) {
      last = String(e)
    }
    if (Date.now() > deadline) throw new Error(`refreshSessions：45 秒內 server 沒反映出新 fixture（${last}）`)
    await sleep(500)
  }
}
