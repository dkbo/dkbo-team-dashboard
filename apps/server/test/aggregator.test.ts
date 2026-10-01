import { describe, expect, it } from 'vitest';
import type { TaskDetail } from '@dash/shared';
import { collectDetailAtlas, collectList, edgeDetail, edgeList, teamflowList } from '../../../packages/shared/fixtures/index.ts';
import { aggregate, type CollectedProject } from '../src/aggregator.ts';
import { toPaneLive, type HerdrPane } from '../src/herdr-parse.ts';

const raw = (over: Partial<HerdrPane> & { pane_id: string }): HerdrPane => ({
  tab_id: 'wD:t6',
  workspace_id: 'wD',
  agent: 'claude',
  agent_status: 'idle',
  cwd: '/projects/collect',
  tokens: {},
  ...over,
});

const project = (over: Partial<CollectedProject> & { name: string; path: string }): CollectedProject => ({
  dkboVersion: '0.17.0',
  mode: 'native',
  error: null,
  stale: false,
  fetchedAt: 1,
  list: null,
  active: {},
  ...over,
});

describe('toPaneLive', () => {
  it('cost 去 $、ctx／usage 用 *_num 轉數字', () => {
    const p = toPaneLive(
      raw({
        pane_id: 'wD:p16',
        agent_status: 'working',
        tokens: {
          cost: '$1,234.50',
          ctx: '6%',
          ctx_num: '6',
          model: 'opus 5.5',
          effort: 'medium',
          usage_session_num: '42',
          usage_period_num: '40',
        },
      }),
      'atlas-engine',
    );
    expect(p).toEqual({
      paneId: 'wD:p16',
      tabId: 'wD:t6',
      workspaceId: 'wD',
      name: 'atlas-engine',
      agent: 'claude',
      status: 'working',
      cwd: '/projects/collect',
      model: 'opus 5.5',
      effort: 'medium',
      cost: 1234.5,
      ctxPct: 6,
      usage5hPct: 42,
      usageWkPct: 40,
      taskDir: null,
      member: null,
    });
  });

  it('缺欄與壞值給 null，未知狀態給 unknown', () => {
    const p = toPaneLive(raw({ pane_id: 'x', agent: null, agent_status: 'weird' as never, cwd: null, tokens: { cost: 'n/a', ctx_num: '' } }), null);
    expect(p).toMatchObject({ agent: null, status: 'unknown', cwd: '', cost: null, ctxPct: null, model: null, usage5hPct: null });
  });
});

describe('aggregate', () => {
  const bomber = collectDetailAtlas.task;
  const collect = project({
    name: 'collect',
    path: '/projects/collect',
    mode: 'compat',
    dkboVersion: '0.16.0',
    list: collectList,
    active: { [bomber.dir]: bomber },
  });
  const teamflow = project({ name: 'teamflow', path: '/projects/teamflow', list: teamflowList });
  const panes = [
    raw({ pane_id: 'wD:p16', agent_status: 'working', cwd: '/projects/collect/.worktrees/atlas' }), // engine
    raw({ pane_id: 'wD:p18', agent_status: 'blocked', cwd: '/projects/collect/.worktrees/atlas' }), // qa
    raw({ pane_id: 'wD:pY', tab_id: 'wD:t6', cwd: '/projects/collect' }), // 領導：不在 .panes
    raw({ pane_id: 'wD:p3', tab_id: 'wD:t3', cwd: '/projects/collect' }), // 另一個 session
    raw({ pane_id: 'wD:p99', cwd: '/projects/collect-other' }), // 前綴相同但不在專案下
    raw({ pane_id: 'wB:p4C', tab_id: 'wB:tG', workspace_id: 'wB', cwd: '/projects/teamflow' }),
    raw({ pane_id: 'wA:p8', agent: null, cwd: '/projects/herdr-plugin2' }),
  ].map((p) => toPaneLive(p, null));

  const bomberWithTab: TaskDetail = { ...bomber, task_tab: 'wD:t6' };
  const doc = aggregate(
    [{ ...collect, active: { [bomber.dir]: bomberWithTab } }, teamflow],
    panes,
    { state: 'subscribed', lastAt: 5 },
    1000,
  );

  it('以 <短名>-<member> 對到 .panes 的 pane，再對 herdr pane', () => {
    const c = doc.projects[0];
    expect(c.panes.map((p) => [p.paneId, p.taskDir, p.member])).toEqual([
      ['wD:p16', '2026-09-25-atlas', 'engine'],
      ['wD:p18', '2026-09-25-atlas', 'qa'],
    ]);
    expect(c.panes[1].status).toBe('blocked');
  });

  it('其他 session：cwd 在專案下但對不到成員；task_tab 相同則帶 taskDir、member 一律 null', () => {
    const c = doc.projects[0];
    expect(c.otherPanes.map((p) => [p.paneId, p.taskDir, p.member])).toEqual([
      ['wD:pY', '2026-09-25-atlas', null],
      ['wD:p3', null, null],
    ]);
    expect(doc.projects[1].otherPanes.map((p) => p.paneId)).toEqual(['wB:p4C']);
    expect(doc.projects[1].panes).toEqual([]);
  });

  it('不在任何專案下的 pane 不出現', () => {
    const all = doc.projects.flatMap((p) => [...p.panes, ...p.otherPanes]).map((p) => p.paneId);
    expect(all).not.toContain('wD:p99');
    expect(all).not.toContain('wA:p8');
  });

  it('agents 列出全部有 agent 的 pane：對得到專案帶專案與任務對應，否則 project 為 null', () => {
    expect(doc.agents.map((p) => [p.paneId, p.project, p.taskDir, p.member])).toEqual([
      ['wD:p16', 'collect', '2026-09-25-atlas', 'engine'],
      ['wD:p18', 'collect', '2026-09-25-atlas', 'qa'],
      ['wD:pY', 'collect', '2026-09-25-atlas', null],
      ['wD:p3', 'collect', null, null],
      ['wD:p99', null, null, null],
      ['wB:p4C', 'teamflow', null, null],
    ]);
    expect(doc.agents[1].status).toBe('blocked');
  });

  it('巢狀路徑取最長的專案', () => {
    const outer = project({ name: 'outer', path: '/p' });
    const inner = project({ name: 'inner', path: '/p/inner' });
    const d = aggregate([outer, inner], [toPaneLive(raw({ pane_id: 'a', cwd: '/p/inner/.worktrees/x' }), null)], { state: 'down', lastAt: null }, 0);
    expect(d.projects[0].otherPanes).toEqual([]);
    expect(d.projects[1].otherPanes.map((p) => p.paneId)).toEqual(['a']);
  });

  it('usage 以 agent 分 kind 取最大，沒有數字給 null', () => {
    const ps = [
      raw({ pane_id: '1', cwd: '/x', tokens: { usage_session_num: '41', usage_period_num: '40' } }),
      raw({ pane_id: '2', cwd: '/x', tokens: { usage_session_num: '45' } }),
      raw({ pane_id: '3', cwd: '/x', agent: 'codex', tokens: {} }),
      raw({ pane_id: '4', cwd: '/x', agent: null, tokens: { usage_session_num: '99' } }),
    ].map((p) => toPaneLive(p, null));
    const d = aggregate([], ps, { state: 'polling', lastAt: null }, 0);
    expect(d.usage).toEqual({
      claude: { fiveHourPct: 45, weekPct: 40 },
      codex: { fiveHourPct: null, weekPct: null },
    });
  });

  it('kindsDown 合併各專案並帶 project，同 kind 最晚者在前', () => {
    const e = project({ name: 'edge', path: '/tmp/edge', list: edgeList });
    const d = aggregate([teamflow, e], [], { state: 'down', lastAt: null }, 0);
    expect(d.kindsDown.map((k) => [k.kind, k.project, k.until_epoch])).toEqual([
      ['agy', 'teamflow', 1790772549],
      ['codex', 'teamflow', 1791718349],
      ['codex', 'edge', 1791718349],
    ]);
  });

  it('ProjectView 欄位原樣帶出，herdr 狀態與 generatedAt', () => {
    expect(doc.generatedAt).toBe(1000);
    expect(doc.herdr).toEqual({ state: 'subscribed', lastAt: 5 });
    expect(doc.projects[0]).toMatchObject({ name: 'collect', mode: 'compat', dkboVersion: '0.16.0', stale: false, error: null });
    expect(Object.keys(doc.projects[0].active)).toEqual(['2026-09-25-atlas']);
  });

  it('legacy pane（pane 為 null）與對不到 member 的 agent 不會對上', () => {
    const e = project({ name: 'edge', path: '/tmp/edge', list: edgeList, active: { [edgeDetail.task.dir]: edgeDetail.task } });
    const ps = [
      raw({ pane_id: 'wX:p1', cwd: '/elsewhere' }),
      raw({ pane_id: 'wX:p2', cwd: '/tmp/edge/.worktrees/edge' }),
    ].map((p) => toPaneLive(p, null));
    const d = aggregate([e], ps, { state: 'down', lastAt: null }, 0);
    expect(d.projects[0].panes.map((p) => [p.paneId, p.member])).toEqual([
      ['wX:p1', 'dev'],
      ['wX:p2', 'qa'],
    ]);
  });
});
