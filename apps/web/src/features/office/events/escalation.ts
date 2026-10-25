// 共用契約「未解判定」（擁有者 frontend-events）：白板 E3 的 warn／danger 與事件引擎的 ESCALATE 共用這一份規則。
// messages 依 messages.log 的行序（時間序）判先後；ruling 在 process.md、只有分鐘戳，同一分鐘算「之後」。
import type { TaskDetail } from '@dash/shared'
import { parseLocalTs } from '@/lib/format'

const atOf = (ts: string): number | null => parseLocalTs(ts)?.getTime() ?? null

const RESOLVES_BLOCK = new Set(['DONE', 'FIXED', 'ANSWER'])

/**
 * dk-watch 的 BLOCKED／TIMEOUT 文字 → agent 註冊名。
 * 格式見 `.dkbo/bin/dk-watch`：`[BLOCKED] from dk-watch: <agent> 卡在審批`、
 * `[TIMEOUT] from dk-watch: <agent> 閒置 N 分鐘…／逾時…`；dk-status 去掉了 `[TYPE]`，`from dk-watch:` 可有可無。
 * `wave N 超過…` 這種整波逾時對不到 agent，回 null。
 */
export function blockAgent(text: string): string | null {
  const body = text.replace(/^from\s+\S+:\s*/, '')
  const m = /^([A-Za-z0-9][\w.-]*)(?:\s|$)/.exec(body)
  if (!m) return null
  if (m[1] === 'wave' && /^wave\s+\d/.test(body)) return null
  return m[1]
}

/** 同一個 key 只留最晚一筆，依 at 升冪 */
function latestPer<T extends { at: number }>(items: T[], key: (t: T) => string): T[] {
  const m = new Map<string, T>()
  for (const it of items) {
    const cur = m.get(key(it))
    if (!cur || it.at >= cur.at) m.set(key(it), it)
  }
  return [...m.values()].sort((a, b) => a.at - b.at)
}

/** ESCALATE 由 X 在 t 送出；t 之後有 leader→X 的 DECISION 或任何一筆 ruling 即解除 */
export function openEscalations(detail: TaskDetail): { from: string; at: number }[] {
  const msgs = detail.messages
  const open: { from: string; at: number }[] = []
  msgs.forEach((m, i) => {
    if (m.type !== 'ESCALATE') return
    const at = atOf(m.ts)
    if (at == null) return
    const decided = msgs.slice(i + 1).some((n) => n.type === 'DECISION' && n.to === m.from)
    const ruled = detail.rulings.some((r) => r.ts >= m.ts)
    if (!decided && !ruled) open.push({ from: m.from, at })
  })
  return latestPer(open, (o) => o.from)
}

/** BLOCKED／TIMEOUT 指向 A 在 t；t 之後 A 送出 DONE／FIXED／ANSWER，或 A 的 pane 已不在 detail.panes，即解除 */
export function openBlocks(detail: TaskDetail): { agent: string; at: number }[] {
  const msgs = detail.messages
  const alive = new Set(detail.panes.map((p) => p.agent))
  const open: { agent: string; at: number }[] = []
  msgs.forEach((m, i) => {
    if (m.type !== 'BLOCKED' && m.type !== 'TIMEOUT') return
    const agent = blockAgent(m.text)
    const at = atOf(m.ts)
    if (!agent || at == null || !alive.has(agent)) return
    const answered = msgs.slice(i + 1).some((n) => n.from === agent && RESOLVES_BLOCK.has(n.type))
    if (!answered) open.push({ agent, at })
  })
  return latestPer(open, (o) => o.agent)
}
