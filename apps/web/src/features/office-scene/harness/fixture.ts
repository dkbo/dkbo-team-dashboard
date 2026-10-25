// 40 人自測資料（dev harness 用；qa 的 e2e fixture 另做）。時間一律相對 now。
import type { OfficeSession, Substate } from '@dash/shared'
import type { SceneTask } from '@/features/office/model'
import type { OfficeEvent } from '@/features/office/events/types'
import type { OfficeObjects } from '@/features/office/sceneTypes'

const MIN = 60_000
const PROJECTS = ['atlas', 'beacon', 'comet']
const MEMBERS = ['dev-a', 'dev-b', 'qa', 'reviewer-a', 'frontend-x', 'backend', 'it', 'designer']
const CYCLE: Substate[] = ['running', 'thinking', 'writing', 'waiting', 'done', 'running', 'interrupted', 'error', 'idle', 'thinking']
const MODELS = [
  ['claude', 'opus-4', 'medium'],
  ['claude', 'sonnet-4', 'high'],
  ['claude', 'haiku-4', 'low'],
  ['codex', 'gpt-5.5', 'xhigh'],
  ['codex', 'gpt-5-codex', 'medium'],
  ['codex', 'mystery', null],
] as const
const TOOLS = ['Bash', 'Edit', 'Read', 'Grep', 'apply_patch']

export function harnessTasks(): Record<string, SceneTask> {
  const out: Record<string, SceneTask> = {}
  for (const p of PROJECTS) out[`${p}/2026-10-24-main`] = { project: p, display: `${p} 主線`, members: MEMBERS.slice(0, p === 'comet' ? 4 : 6), wave: { current: 2, planned: 4 }, closedState: null, closedAt: null }
  out['atlas/2026-10-20-side'] = { project: 'atlas', display: 'atlas 支線', members: ['dev-a', 'qa'], wave: null, closedState: null, closedAt: null }
  return out
}

export function harnessSessions(n: number, now: number, seed = 0): OfficeSession[] {
  const tasks = harnessTasks()
  const seats: { taskDir: string | null; member: string | null; leader: boolean; project: string }[] = []
  for (const [dir, t] of Object.entries(tasks)) {
    seats.push({ taskDir: dir, member: `leader-${t.project}`, leader: true, project: t.project })
    for (const m of t.members) seats.push({ taskDir: dir, member: m, leader: false, project: t.project })
  }
  const out: OfficeSession[] = []
  for (let i = 0; i < n; i++) {
    const seat = seats[i] ?? { taskDir: null, member: i % 3 === 0 ? `chore-${i}` : null, leader: false, project: ['zed', 'atlas', 'misc'][i % 3] }
    const sub = CYCLE[(i + seed) % CYCLE.length]
    const [kind, model, effort] = MODELS[i % MODELS.length]
    const since = now - ((i % 7) + 1) * MIN
    out.push({
      id: `p${i}`,
      paneId: `p${i}`,
      kind,
      sessionId: `s-${i.toString(16).padStart(8, '0')}`,
      substate: sub,
      substateSince: since,
      turnStartedAt: since - 2 * MIN,
      tool: sub === 'running' ? { name: TOOLS[i % TOOLS.length], summary: 'pnpm -C apps/web test' } : null,
      question: sub === 'waiting' ? 'Do you want to proceed?' : null,
      error: sub === 'error' ? 'API Error: 529 overloaded' : null,
      subagents: i % 9 === 4 ? 2 : 0,
      lastEventAt: since,
      model,
      project: seat.project,
      cwd: `/projects/${seat.project}`,
      taskDir: seat.taskDir,
      member: seat.member,
      role: null,
      leader: seat.leader,
      agentName: null,
      effort,
      cost: 1.2 * i,
      ctxPct: (i * 7) % 100,
    })
  }
  return out
}

// ---- 事件播放（AC10 自測、AC11 量 ticket）：照契約「OfficeEvent」的形狀，演員取自 harness 的 session ----
export const HARNESS_TASK = 'atlas/2026-10-24-main'
export type HarnessEventKind = OfficeEvent['kind']
export const HARNESS_EVENT_KINDS: HarnessEventKind[] = ['review-spawned', 'review-pass', 'review-fix', 'escalate', 'escalate-resolved', 'wave-closed', 'task-done', 'task-abandoned']

/** 一個即時事件；devCount 1 → reviewer 走到該 dev（E6），否則走到白板 */
export function harnessEvent(kind: HarnessEventKind, sessions: OfficeSession[], seq: number, opts: { devCount?: number; task?: string } = {}): OfficeEvent {
  const task = opts.task ?? HARNESS_TASK
  const crew = sessions.filter((s) => s.taskDir === task)
  const leader = crew.filter((s) => s.leader).map((s) => s.id)
  const reviewers = crew.filter((s) => s.member?.startsWith('reviewer')).map((s) => s.id)
  const devs = crew.filter((s) => !s.leader && /^(dev|frontend|backend)/.test(s.member ?? '')).slice(0, opts.devCount ?? 2).map((s) => s.id)
  const board = { kind: 'board' as const, id: task }
  const base = { id: `harness:${kind}:${seq}`, kind, taskDir: task, wave: 2, at: Date.now(), count: null as number | null }
  switch (kind) {
    case 'review-spawned':
      return { ...base, actors: reviewers, target: devs.length === 1 ? { kind: 'session', id: devs[0] } : board, announce: 'atlas 主線：波 2 審查開始' }
    case 'review-pass':
      return { ...base, actors: [...devs, ...reviewers], target: null, announce: 'atlas 主線：波 2 審查通過' }
    case 'review-fix':
      return { ...base, actors: [...devs, ...reviewers], target: null, count: 2, announce: 'atlas 主線：波 2 審查要修 2 條' }
    case 'escalate':
      return { ...base, wave: null, actors: leader, target: board, announce: 'atlas 主線：有 ESCALATE 待決定' }
    case 'escalate-resolved':
      return { ...base, wave: null, actors: leader, target: board, announce: 'atlas 主線：ESCALATE 已決定' }
    case 'wave-closed':
      return { ...base, actors: leader, target: board, announce: 'atlas 主線：波 2 關閉' }
    case 'task-done':
      return { ...base, wave: null, actors: crew.map((s) => s.id), target: board, announce: 'atlas 主線：任務結案' }
    case 'task-abandoned':
      return { ...base, wave: null, actors: [], target: board, announce: 'atlas 主線：任務已放棄' }
  }
}

// ---- 六件頁面物件（契約「OfficeObjects」）；mode 切三種情境：一般／異常（E3–E5）／沒資料 ----
export type HarnessObjectsMode = 'normal' | 'alert' | 'empty'

export function harnessObjects(mode: HarnessObjectsMode): OfficeObjects {
  const tasks = harnessTasks()
  const boards: OfficeObjects['boards'] = {}
  for (const [dir, t] of Object.entries(tasks)) {
    const [project] = dir.split('/')
    const alert = mode === 'alert'
    const tone = alert && project === 'atlas' && dir.endsWith('main') ? 'danger' : alert && project === 'beacon' ? 'warn' : null
    boards[dir] = {
      project,
      display: t.display,
      closed: t.wave?.current ?? 0,
      planned: t.wave?.planned ?? 0,
      tone,
      chips:
        tone === 'danger'
          ? [
              { label: '1 等你', tone: 'danger', icon: 'hand' },
              { label: 'ESCALATE', tone: 'warn', icon: 'escalate' },
            ]
          : tone === 'warn'
            ? [{ label: 'ESCALATE', tone: 'warn', icon: 'escalate' }]
            : [],
      closedState: null,
      closedAt: null,
      href: `/p/${project}/t/${dir.split('/')[1]}`,
    }
  }
  if (mode === 'empty')
    return {
      boards,
      monitor: { value: '—', unit: 'herdr 離線', lamp: null, chip: null, href: '/herdr' },
      archive: { value: '—', unit: '已結案', lamp: null, chip: null, href: '/history' },
      git: { value: '—', unit: '讀取中', lamp: null, chip: null, href: '/git' },
      notice: { value: '—', unit: '個任務進行中', lamp: null, chip: null, href: '/' },
      meter: { value: '—', unit: '今日', lamp: null, chip: null, href: '/trends' },
    }
  const alert = mode === 'alert'
  return {
    boards,
    monitor: { value: '14', unit: 'pane', lamp: null, chip: alert ? { label: '2 卡住', tone: 'danger', icon: 'pane' } : null, href: '/herdr' },
    archive: { value: '27', unit: '已結案', lamp: null, chip: { label: '今天 +2', tone: 'neutral' }, href: '/history' },
    git: alert ? { value: '1', lamp: 'danger', chip: { label: '衝突', tone: 'danger', icon: 'git' }, href: '/git?p=atlas' } : { value: '乾淨', lamp: null, chip: null, href: '/git' },
    notice: { value: '4', unit: '個任務進行中', lamp: null, chip: alert ? { label: '1 卡住', tone: 'danger', icon: 'alert' } : null, href: '/' },
    meter: alert
      ? { value: '$42.10', unit: '今日', lamp: 'warn', chip: { label: '跳電 · codex', tone: 'warn', icon: 'zap' }, href: '/trends' }
      : { value: '$12.40', unit: '今日 · 額度 46%', lamp: null, chip: null, href: '/trends' },
  }
}
