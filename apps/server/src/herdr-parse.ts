// herdr API 的原始 pane 形狀（herdr api schema：PaneInfo／AgentInfo），只列用得到的欄位。
import { toPaneStatus, type PaneLive } from '@dash/shared';

export interface HerdrPane {
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  agent?: string | null;
  agent_status: string;
  cwd?: string | null;
  foreground_cwd?: string | null;
  tokens?: Record<string, string>;
}

export interface HerdrAgent {
  pane_id: string;
  name?: string | null;
}

export interface HerdrSnapshot {
  panes: HerdrPane[];
  agents?: HerdrAgent[];
}

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.replace(/[$,%\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const str = (s: string | undefined): string | null => (s === undefined || s === '' ? null : s);

export function toPaneLive(p: HerdrPane, name: string | null): PaneLive {
  const t = p.tokens ?? {};
  return {
    paneId: p.pane_id,
    tabId: p.tab_id,
    workspaceId: p.workspace_id,
    name,
    agent: p.agent ?? null,
    status: toPaneStatus(p.agent_status),
    cwd: p.cwd ?? p.foreground_cwd ?? '',
    model: str(t.model),
    effort: str(t.effort),
    cost: num(t.cost),
    ctxPct: num(t.ctx_num),
    usage5hPct: num(t.usage_session_num),
    usageWkPct: num(t.usage_period_num),
    taskDir: null,
    member: null,
  };
}

/** `herdr api snapshot` 印 `{id, result:{type:'snapshot', snapshot:{…}}}`；也接受直接給 snapshot 本體 */
export function parseSnapshot(stdout: string): HerdrSnapshot {
  const j = JSON.parse(stdout) as { result?: { snapshot?: HerdrSnapshot } } & Partial<HerdrSnapshot>;
  const snap = j.result?.snapshot ?? (j as HerdrSnapshot);
  if (!snap || !Array.isArray(snap.panes)) throw new Error('herdr snapshot: no panes');
  return snap;
}
