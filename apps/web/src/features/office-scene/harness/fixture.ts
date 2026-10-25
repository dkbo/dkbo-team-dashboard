// 40 人自測資料（dev harness 用；qa 的 e2e fixture 另做）。時間一律相對 now。
import type { OfficeSession, Substate } from '@dash/shared'
import type { TaskInfo } from '../layout'

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

export function harnessTasks(): Record<string, TaskInfo> {
  const out: Record<string, TaskInfo> = {}
  for (const p of PROJECTS) out[`${p}/2026-10-24-main`] = { project: p, display: `${p} 主線`, members: MEMBERS.slice(0, p === 'comet' ? 4 : 6), wave: { current: 2, planned: 4 } }
  out['atlas/2026-10-20-side'] = { project: 'atlas', display: 'atlas 支線', members: ['dev-a', 'qa'], wave: null }
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
