// 把各專案的 dk-status 結果與 herdr pane 合成 OverviewDoc。純函式，不碰 I/O。
import type { AgentLive, HerdrState, KindUsage, OverviewDoc, PaneLive, ProjectKindsDown, ProjectView, TaskDetail } from '@dash/shared';

/** StatusCollector 交給 Aggregator 的每專案資料（ProjectView 去掉 pane 兩欄） */
export type CollectedProject = Omit<ProjectView, 'panes' | 'otherPanes'>;

interface MemberRef {
  project: number;
  dir: string;
  member: string;
}

const under = (cwd: string, root: string) => cwd === root || cwd.startsWith(root.endsWith('/') ? root : root + '/');

/** detail.panes[].agent ＝ `<短名>-<member>` 且 member 有 state 檔，才算對到成員 */
function memberOf(task: TaskDetail, agent: string): string | null {
  const prefix = `${task.short}-`;
  if (!agent.startsWith(prefix)) return null;
  const m = agent.slice(prefix.length);
  return task.members.some((x) => x.name === m) ? m : null;
}

export function aggregate(
  projects: CollectedProject[],
  panes: PaneLive[],
  herdr: { state: HerdrState; lastAt: number | null },
  now: number,
): OverviewDoc {
  const byPane = new Map<string, MemberRef>();
  const byTab = new Map<string, { project: number; dir: string }>();
  projects.forEach((p, i) => {
    for (const [dir, task] of Object.entries(p.active)) {
      if (task.task_tab) byTab.set(task.task_tab, { project: i, dir });
      for (const tp of task.panes) {
        if (!tp.pane) continue;
        const member = memberOf(task, tp.agent);
        if (member) byPane.set(tp.pane, { project: i, dir, member });
      }
    }
  });

  const views: ProjectView[] = projects.map((p) => ({ ...p, panes: [], otherPanes: [] }));
  for (const pane of panes) {
    const ref = byPane.get(pane.paneId);
    if (ref) {
      views[ref.project].panes.push({ ...pane, taskDir: ref.dir, member: ref.member });
      continue;
    }
    let best = -1;
    projects.forEach((p, i) => {
      if (under(pane.cwd, p.path) && (best < 0 || p.path.length > projects[best].path.length)) best = i;
    });
    if (best < 0) continue;
    const tab = byTab.get(pane.tabId);
    views[best].otherPanes.push({ ...pane, taskDir: tab && tab.project === best ? tab.dir : null, member: null });
  }

  const kindsDown: ProjectKindsDown[] = projects
    .flatMap((p) => (p.list?.kinds_down ?? []).map((k) => ({ ...k, project: p.name })))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : b.until_epoch - a.until_epoch));

  const usage: Record<string, KindUsage> = {};
  const max = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
  for (const pane of panes) {
    if (!pane.agent) continue;
    const u = (usage[pane.agent] ??= { fiveHourPct: null, weekPct: null });
    u.fiveHourPct = max(u.fiveHourPct, pane.usage5hPct);
    u.weekPct = max(u.weekPct, pane.usageWkPct);
  }

  const placed = new Map<string, AgentLive>();
  for (const v of views) for (const x of [...v.panes, ...v.otherPanes]) placed.set(x.paneId, { ...x, project: v.name });
  const agents: AgentLive[] = panes.filter((p) => p.agent).map((p) => placed.get(p.paneId) ?? { ...p, project: null });

  return { generatedAt: now, projects: views, agents, kindsDown, usage, herdr: { ...herdr } };
}
