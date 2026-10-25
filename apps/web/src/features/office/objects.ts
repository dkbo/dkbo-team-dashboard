// /office 頁面物件的資料模型（AC4；§4.6、§6.14、E3–E5、E8）：純函式，從 store 與 git 摘要組出契約「OfficeObjects」。
import type { GitSummary, OfficeSession, OverviewDoc, TaskDetail } from '@dash/shared'
import { runningSummary } from '@/features/overview/summary'
import { latestKindsDown, USAGE_WARN_PCT, usageRows } from '@/features/topbar/model'
import { formatCost } from '@/lib/format'
import { openBlocks, openEscalations } from './events/escalation'
import { taskHref } from './format'
import { closedAtMs, needsOf, type SceneTask } from './model'
import type { BoardStat, Chip, ObjectStat, OfficeObjects } from './sceneTypes'

export interface ObjectSources {
  overview: OverviewDoc | null
  /** buildTasks 的結果（含結案 10 分鐘內保留的任務，E8） */
  tasks: Record<string, SceneTask>
  /** 全部 session（白板的 needsYou） */
  sessions: OfficeSession[]
  /** store 快取的 detail，key＝`${project}/${dir}`；沒有就用 overview active 那份 */
  details: Record<string, TaskDetail>
  /** `GET /api/git` 的 projects；還沒抓到為 null */
  git: GitSummary[] | null
  /** 今日花費（各專案加總）；沒資料為 null */
  todaySpend: number | null
  now: number
}

const NO_DATA = '—'

/** store 快取的 detail 較新（SSE task.updated 會重抓）；沒有就用 overview active 那份 */
const detailFor = (details: Record<string, TaskDetail>, overview: OverviewDoc | null, project: string, dir: string): TaskDetail | null =>
  details[`${project}/${dir}`] ?? overview?.projects.find((p) => p.name === project)?.active[dir] ?? null

const detailOf = (src: ObjectSources, project: string, dir: string) => detailFor(src.details, src.overview, project, dir)

/** E3：danger＝桌群有 needsYou 或未解 BLOCKED／TIMEOUT；warn＝未解 ESCALATE（判定一律用契約「未解判定」）；並存用 danger、chip 都列 */
function board(src: ObjectSources, dir: string, t: SceneTask): BoardStat {
  const crew = t.closedState ? [] : src.sessions.filter((s) => s.project === t.project && s.taskDir === dir && needsOf(s, src.now))
  const waiting = crew.filter((s) => s.substate === 'waiting').length
  const errors = crew.length - waiting
  const d = t.closedState ? null : detailOf(src, t.project, dir)
  const blocks = d ? openBlocks(d).length : 0
  const escalations = d ? openEscalations(d).length : 0
  const chips: Chip[] = []
  if (waiting > 0) chips.push({ label: `${waiting} 等你`, tone: 'danger', icon: 'hand' })
  if (errors > 0) chips.push({ label: `${errors} 錯誤`, tone: 'danger', icon: 'alert' })
  if (blocks > 0) chips.push({ label: `${blocks} 卡住`, tone: 'danger', icon: 'alert' })
  if (escalations > 0) chips.push({ label: 'ESCALATE', tone: 'warn', icon: 'escalate' })
  return {
    project: t.project,
    display: t.display,
    closed: t.wave?.current ?? 0,
    planned: t.wave?.planned ?? 0,
    tone: crew.length + blocks > 0 ? 'danger' : escalations > 0 ? 'warn' : null,
    chips,
    closedState: t.closedState,
    closedAt: t.closedAt,
    href: taskHref(t.project, dir),
  }
}

/** 監控牆：herdr 全部 pane 數；卡住（PaneStatus blocked，含等你／錯誤）> 0 出 danger chip；監控牆不用燈 */
function monitor(doc: OverviewDoc | null): ObjectStat {
  const href = '/herdr'
  if (!doc) return { value: NO_DATA, unit: 'pane', lamp: null, chip: null, href }
  if (doc.herdr.state === 'down') return { value: NO_DATA, unit: 'herdr 離線', lamp: null, chip: null, href }
  const agents = doc.agents ?? []
  const stuck = agents.filter((a) => a.status === 'blocked').length
  const chip: Chip | null =
    stuck > 0 ? { label: `${stuck} 卡住`, tone: 'danger', icon: 'alert' } : doc.herdr.state === 'polling' ? { label: '輪詢', tone: 'warn' } : null
  return { value: String(agents.length), unit: 'pane', lamp: null, chip, href }
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 檔案室：已結案（done＋abandoned）數；今天有結案 neutral chip「今天 +N」 */
function archive(doc: OverviewDoc | null, now: number): ObjectStat {
  const closed = (doc?.projects ?? []).flatMap((p) => (p.list?.tasks ?? []).filter((t) => t.status === 'done' || t.status === 'abandoned'))
  const today = dayOf(now)
  const n = closed.filter((t) => {
    const at = closedAtMs(t.closed_at)
    return at != null && dayOf(at) === today
  }).length
  return { value: doc ? String(closed.length) : NO_DATA, unit: '已結案', lamp: null, chip: n > 0 ? { label: `今天 +${n}`, tone: 'neutral' } : null, href: '/history' }
}

/** E5：所有專案加總只亮最嚴重一項：衝突 danger ＞ 未推送 warn ＞ 未提交／detached warn；乾淨熄燈 */
function git(rows: GitSummary[] | null): ObjectStat {
  const href = '/git'
  if (!rows) return { value: NO_DATA, unit: '讀取中', lamp: null, chip: null, href }
  const ok = rows.filter((r) => r.error == null)
  const sum = (f: (r: GitSummary) => number) => ok.reduce((n, r) => n + f(r), 0)
  const conflicts = sum((r) => r.counts?.conflicts ?? 0)
  if (conflicts > 0) {
    const first = ok.find((r) => (r.counts?.conflicts ?? 0) > 0)!
    return { value: String(conflicts), lamp: 'danger', chip: { label: '衝突', tone: 'danger', icon: 'git' }, href: `${href}?${new URLSearchParams({ p: first.project })}` }
  }
  const ahead = sum((r) => r.ahead ?? 0)
  if (ahead > 0) return { value: String(ahead), lamp: 'warn', chip: { label: '未推送', tone: 'warn', icon: 'git' }, href }
  const dirty = sum((r) => (r.counts ? r.counts.staged + r.counts.unstaged + r.counts.untracked : 0))
  if (dirty > 0) return { value: String(dirty), lamp: 'warn', chip: { label: '未提交', tone: 'warn', icon: 'git' }, href }
  const detached = ok.filter((r) => r.branch == null).length
  if (detached > 0) return { value: String(detached), lamp: 'warn', chip: { label: 'detached', tone: 'warn', icon: 'git' }, href }
  return { value: '乾淨', lamp: null, chip: null, href }
}

/** 公告板：進行中任務數（running＋planning）；有白板 danger 出「N 卡住」，只有 ESCALATE 出 warn */
function notice(doc: OverviewDoc | null, boards: Record<string, BoardStat>): ObjectStat {
  const href = '/'
  if (!doc) return { value: NO_DATA, unit: '個任務進行中', lamp: null, chip: null, href }
  const { count } = runningSummary(doc.projects)
  const live = Object.values(boards).filter((b) => b.closedState == null)
  const stuck = live.filter((b) => b.tone === 'danger').length
  const esc = live.filter((b) => b.tone === 'warn').length
  const chip: Chip | null =
    stuck > 0 ? { label: `${stuck} 卡住`, tone: 'danger', icon: 'alert' } : esc > 0 ? { label: `${esc} ESCALATE`, tone: 'warn', icon: 'escalate' } : null
  return { value: String(count), unit: count > 0 ? '個任務進行中' : '沒有進行中任務', lamp: null, chip, href }
}

/** 電表（E4）：今日花費＋最高額度 %；≥ 80% warn chip「額度 84%」；任一 kind 熔斷＝跳電（warn，不變紅） */
function meter(doc: OverviewDoc | null, spend: number | null, now: number): ObjectStat {
  const href = '/trends'
  const value = spend == null ? NO_DATA : formatCost(spend)
  const downs = latestKindsDown(doc?.kindsDown ?? [], now)
  const top = usageRows(doc?.usage ?? {})
    .flatMap((u) => [u.fiveHourPct, u.weekPct])
    .reduce<number | null>((m, v) => (v != null && (m == null || v > m) ? v : m), null)
  const hot = top != null && top >= USAGE_WARN_PCT
  if (downs.length > 0) return { value, unit: '今日', lamp: 'warn', chip: { label: `跳電 · ${downs.map((d) => d.kind).join('、')}`, tone: 'warn', icon: 'zap' }, href }
  if (hot) return { value, unit: '今日', lamp: null, chip: { label: `額度 ${Math.round(top)}%`, tone: 'warn' }, href }
  return { value, unit: top != null ? `今日 · 額度 ${Math.round(top)}%` : '今日', lamp: null, chip: null, href }
}

export function buildObjects(src: ObjectSources): OfficeObjects {
  const boards: Record<string, BoardStat> = {}
  for (const [dir, t] of Object.entries(src.tasks)) boards[dir] = board(src, dir, t)
  return {
    boards,
    monitor: monitor(src.overview),
    archive: archive(src.overview, src.now),
    git: git(src.git),
    notice: notice(src.overview, boards),
    meter: meter(src.overview, src.todaySpend, src.now),
  }
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * 值沒變就沿用舊參照（逐件比、白板逐塊比）：git 每 30 秒、花費每分鐘輪詢回來的結果相同時，場景收到的 objects 不變，
 * 不 invalidate（AC11 靜止 0 幀）。全部沒變回傳 prev 本身。
 */
export function keepSame(prev: OfficeObjects | null, next: OfficeObjects): OfficeObjects {
  if (!prev) return next
  const boards: Record<string, BoardStat> = {}
  for (const [k, b] of Object.entries(next.boards)) boards[k] = prev.boards[k] && same(prev.boards[k], b) ? prev.boards[k] : b
  const keys = Object.keys(boards)
  const boardsSame = keys.length === Object.keys(prev.boards).length && keys.every((k) => boards[k] === prev.boards[k])
  const out: OfficeObjects = {
    boards: boardsSame ? prev.boards : boards,
    monitor: same(prev.monitor, next.monitor) ? prev.monitor : next.monitor,
    archive: same(prev.archive, next.archive) ? prev.archive : next.archive,
    git: same(prev.git, next.git) ? prev.git : next.git,
    notice: same(prev.notice, next.notice) ? prev.notice : next.notice,
    meter: same(prev.meter, next.meter) ? prev.meter : next.meter,
  }
  return (Object.keys(out) as (keyof OfficeObjects)[]).every((k) => out[k] === prev[k]) ? prev : out
}

/** 找人清單的 EventBadge（§6.6、§6.15）：有未解 ESCALATE 的進行中任務，該任務 leader session 的 id */
export function escalatedLeaders(
  sessions: OfficeSession[],
  tasks: Record<string, SceneTask>,
  details: Record<string, TaskDetail>,
  overview: OverviewDoc | null,
): Set<string> {
  const out = new Set<string>()
  for (const [dir, t] of Object.entries(tasks)) {
    if (t.closedState) continue
    const d = detailFor(details, overview, t.project, dir)
    if (!d || openEscalations(d).length === 0) continue
    for (const s of sessions) if (s.leader && s.project === t.project && s.taskDir === dir) out.add(s.id)
  }
  return out
}
