// 追蹤中的 session ＋ OverviewDoc（pane 的任務歸屬、cost、effort…）→ SessionsDoc。純函式。
import type { OfficeSession, OverviewDoc, PaneLive, SessionsDoc, TaskDetail } from '@dash/shared';
import type { TrackedSession } from './sessions.ts';

/** member（state 名）→ 角色：完整名是角色就用它，否則逐段去掉 `-` 後綴再比；都不是就 null */
export function roleOf(member: string, roles: Set<string> | undefined): string | null {
  if (!roles) return null;
  let m = member;
  for (;;) {
    if (roles.has(m)) return m;
    const i = m.lastIndexOf('-');
    if (i <= 0) return null;
    m = m.slice(0, i);
  }
}

/** herdr／JSONL 的 agent 名對任務：`leader-<短名>` 是 leader、`<短名>-<member>` 且 member 有 state 檔是成員 */
function byName(name: string, active: Record<string, TaskDetail>): { taskDir: string; member: string | null; leader: boolean } | null {
  for (const [dir, t] of Object.entries(active)) {
    if (name === `leader-${t.short}`) return { taskDir: dir, member: null, leader: true };
    const prefix = `${t.short}-`;
    if (name.startsWith(prefix) && t.members.some((m) => m.name === name.slice(prefix.length))) return { taskDir: dir, member: name.slice(prefix.length), leader: false };
  }
  return null;
}

export function buildSessionsDoc(doc: OverviewDoc, tracked: TrackedSession[], roles: (project: string) => Set<string> | undefined, now: number): SessionsDoc {
  const panes = new Map<string, PaneLive>();
  for (const a of doc.agents) panes.set(a.paneId, a);
  for (const p of doc.projects) for (const x of [...p.panes, ...p.otherPanes]) panes.set(x.paneId, x);

  const sessions: OfficeSession[] = tracked.map((t) => {
    const pane = t.paneId ? (panes.get(t.paneId) ?? null) : null;
    const view = doc.projects.find((p) => p.name === t.project);
    const agentName = pane?.name ?? t.agentName;
    let taskDir = pane?.taskDir ?? null;
    let member = pane?.member ?? null;
    let leader = false;
    const hit = agentName && view ? byName(agentName, view.active) : null;
    if (hit?.leader) {
      leader = true;
      taskDir = hit.taskDir;
    } else if (hit && !member) {
      taskDir = hit.taskDir;
      member = hit.member;
    }
    return {
      ...t.live,
      model: t.live.model ?? pane?.model ?? null,
      id: t.paneId ?? `s:${t.sessionId}`,
      paneId: t.paneId,
      project: t.project,
      cwd: t.cwd,
      taskDir,
      member,
      role: leader ? 'leader' : member ? roleOf(member, roles(t.project)) : null,
      leader,
      agentName,
      effort: pane?.effort ?? t.effort,
      cost: pane?.cost ?? null,
      ctxPct: pane?.ctxPct ?? null,
    };
  });
  sessions.sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { generatedAt: now, sessions };
}

/** 推送去重用：去掉 generatedAt 與 lastEventAt（lastEventAt 單獨變動不推，下次推送時順帶） */
export const sessionsKey = (d: SessionsDoc) => JSON.stringify(d.sessions.map((s) => ({ ...s, lastEventAt: null })));
