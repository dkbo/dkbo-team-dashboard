// 花費依模型與 effort 拆分：詳情／歷史 API 的 dispatch、repairWaves，/api/costs 的實際／設定歸屬，
// 以及 server 只以文字讀 roles／kinds 檔（改檔後下一次回應反映新值、kinds 檔不被執行）。
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeSampleFixture, parseDispatch, type CostsResponse, type HistoryResponse, type TaskDetailResponse } from '@dash/shared';
import { teamflowDetailBklog, teamflowDetailOps, teamflowDkboFiles, teamflowList, teamflowTierConfig } from '../../../packages/shared/fixtures/index.ts';
import { createDashServer, type DashServer } from '../src/server.ts';
import { fakeProject, tmp } from './helpers.ts';

const NOW = new Date(2026, 8, 26, 15, 30).getTime();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const servers: DashServer[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.stop()));

function writeDkbo(root: string, rel: string, text: string, bumpMtime = false) {
  const f = join(root, '.dkbo', rel);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, text);
  if (bumpMtime) {
    const later = new Date(Date.now() + 120_000);
    utimesSync(f, later, later);
  }
}

async function setup() {
  const root = fakeProject(tmp('dash-mc-'), {
    list: teamflowList,
    details: { [teamflowDetailBklog.task.dir]: teamflowDetailBklog, [teamflowDetailOps.task.dir]: teamflowDetailOps },
  });
  for (const [rel, text] of Object.entries(teamflowDkboFiles)) writeDkbo(root, rel, text);
  const marker = join(tmp('dash-marker-'), 'executed');
  writeDkbo(root, 'kinds/evil.sh', `touch ${marker}\n$(touch ${marker})\nKIND_DEFAULT_TIERS="M=x/y"\n`);
  const dataDir = tmp('dash-data-');
  mkdirSync(join(dataDir, 'samples'));
  for (const [day, rows] of Object.entries(makeSampleFixture(NOW))) writeFileSync(join(dataDir, 'samples', `${day}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
  const s = createDashServer({
    config: { projects: [{ name: 'teamflow', path: root }], pollMs: 60_000 },
    herdr: { bin: '/nonexistent', socket: '/nonexistent', off: true },
    timeoutMs: 3000,
    usage: { dataDir, sampleMs: 3_600_000, retentionDays: 30, now: () => NOW },
  });
  servers.push(s);
  await s.collector.pollOnce('teamflow');
  const get = async <T>(path: string) => {
    const res = await s.app.request(path);
    expect(res.status, path).toBe(200);
    return (await res.json()) as T;
  };
  return { s, root, marker, get };
}

describe('詳情與歷史 API 的派工紀錄（modelcost AC4）', () => {
  it('TaskDetailResponse.dispatch 依 at 升冪，model／effort 以專案的 roles／kinds 檔推算', async () => {
    const { get } = await setup();
    const body = await get<TaskDetailResponse>(`/api/projects/teamflow/tasks/${teamflowDetailOps.task.dir}`);
    expect(body.dispatch).toEqual(parseDispatch(teamflowDetailOps.task.events, 'ops', teamflowTierConfig));
    expect(body.dispatch.map((d) => d.at)).toEqual([...body.dispatch.map((d) => d.at)].sort((a, b) => a - b));
    expect(body.dispatch.find((d) => d.member === 'backend' && d.kind === 'codex')).toMatchObject({ tier: 'M', model: 'gpt-5.5', effort: 'medium', notes: ['override-kind'] });
    expect(body.dispatch.find((d) => d.member === 'backend-kinds')).toMatchObject({ kind: 'claude', tier: 'M', model: 'opus', effort: 'medium' });
  });

  it('HistoryRow 帶 dispatch 與 repairWaves', async () => {
    const { get } = await setup();
    const body = await get<HistoryResponse>('/api/history');
    const ops = body.tasks.find((t) => t.dir === teamflowDetailOps.task.dir)!;
    const bklog = body.tasks.find((t) => t.dir === teamflowDetailBklog.task.dir)!;
    expect(ops.repairWaves).toBe(3);
    expect(bklog.repairWaves).toBe(1);
    expect(ops.dispatch).toEqual(parseDispatch(teamflowDetailOps.task.events, 'ops', teamflowTierConfig));
    expect(bklog.dispatch.find((d) => d.member === 'frontend-shell')).toMatchObject({ tier: 'M', model: 'sonnet', effort: 'medium' });
  });
});

describe('server 以文字讀 roles／kinds（modelcost AC3）', () => {
  it('kinds 檔裡的 $(touch …) 沒被執行', async () => {
    const { get, marker } = await setup();
    await get<TaskDetailResponse>(`/api/projects/teamflow/tasks/${teamflowDetailOps.task.dir}`);
    await get<HistoryResponse>('/api/history');
    await get<CostsResponse>('/api/costs?range=all');
    expect(existsSync(marker)).toBe(false);
  });

  it('改寫 roles 檔並更新 mtime 後，下一次詳情、歷史、花費回應都反映新值', async () => {
    const { get, root } = await setup();
    const path = `/api/projects/teamflow/tasks/${teamflowDetailBklog.task.dir}`;
    const before = await get<TaskDetailResponse>(path);
    expect(before.dispatch.find((d) => d.member === 'frontend-shell')).toMatchObject({ model: 'sonnet', effort: 'medium' });
    expect((await get<CostsResponse>('/api/costs?range=all')).mismatch.panes).toHaveLength(2);
    writeDkbo(root, 'roles/frontend.md', teamflowDkboFiles['roles/frontend.md'].replace('M: sonnet/medium', 'M: sonnet/high'), true);
    const after = await get<TaskDetailResponse>(path);
    expect(after.dispatch.find((d) => d.member === 'frontend-shell')).toMatchObject({ model: 'sonnet', effort: 'high' });
    const h = await get<HistoryResponse>('/api/history');
    expect(h.tasks.find((t) => t.dir === teamflowDetailBklog.task.dir)!.dispatch.find((d) => d.member === 'frontend-shell')?.effort).toBe('high');
    // 設定改成 sonnet/high 後，換成 p1 前半段（實際 medium）不一致：每天 2.5
    const c = await get<CostsResponse>('/api/costs?range=all');
    expect(c.mismatch.cost).toBe(5);
    expect(c.mismatch.panes.map((p) => [p.paneId, p.actual.effort, p.configured.effort, p.cost])).toEqual([
      ['wF0:p1', 'medium', 'high', 2.5],
      ['wF1:p1', 'medium', 'high', 2.5],
    ]);
  });
});

describe('GET /api/costs 的實際／設定歸屬（modelcost AC5）', () => {
  it('fixture 產生預期的 mismatch 列；設定歸屬非 null；兩條恆等式在每個 range 成立', async () => {
    const { get } = await setup();
    const all = await get<CostsResponse>('/api/costs?range=all');
    expect(all.mismatch.panes.map((p) => [p.paneId, p.member, p.actual, p.configured, p.cost])).toEqual([
      ['wF0:p1', 'frontend-shell', { model: 'sonnet 5', effort: 'high' }, { model: 'sonnet', effort: 'medium' }, 1.5],
      ['wF1:p1', 'frontend-shell', { model: 'sonnet 5', effort: 'high' }, { model: 'sonnet', effort: 'medium' }, 1.5],
    ]);
    const bklog = all.tasks.find((t) => t.taskDir === teamflowDetailBklog.task.dir)!;
    expect(bklog.memberInfo['frontend-shell']).toMatchObject({ configured: { tier: 'M', model: 'sonnet' }, dispatchCount: 1, actual: { model: 'sonnet 5', effort: 'high' }, mismatch: true });
    expect(bklog.memberInfo.backend).toMatchObject({ configured: { tier: 'L' }, mismatch: false });
    for (const range of ['6h', '24h', '7d', '30d', 'all']) {
      const b = await get<CostsResponse>(`/api/costs?range=${range}`);
      const total = sum(b.tasks.map((t) => t.cost)) + b.unattributed;
      expect(Math.abs(sum(b.byActual.map((x) => x.cost)) - total), range).toBeLessThan(1e-9);
      expect(Math.abs(sum(b.byConfigured.map((x) => x.cost)) - total), range).toBeLessThan(1e-9);
      for (const t of b.tasks) expect(Math.abs(sum(t.byConfigured.map((x) => x.cost)) - t.cost), range).toBeLessThan(1e-9);
      expect(b.mismatch.cost).toBe(sum(b.mismatch.panes.map((p) => p.cost)));
      for (const t of b.tasks)
        for (const [m, info] of Object.entries(t.memberInfo))
          expect(info.mismatch).toBe(b.mismatch.panes.some((p) => p.project === t.project && p.taskDir === t.taskDir && p.member === m));
    }
  });

  it('沒設定任何專案時設定全為 null（不報錯）', async () => {
    const dataDir = tmp('dash-data-');
    mkdirSync(join(dataDir, 'samples'));
    for (const [day, rows] of Object.entries(makeSampleFixture(NOW))) writeFileSync(join(dataDir, 'samples', `${day}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
    const s = createDashServer({
      config: { projects: [], pollMs: 60_000 },
      herdr: { bin: '/nonexistent', socket: '/nonexistent', off: true },
      usage: { dataDir, sampleMs: 3_600_000, retentionDays: 30, now: () => NOW },
    });
    servers.push(s);
    const b = (await (await s.app.request('/api/costs?range=all')).json()) as CostsResponse;
    expect(b.byConfigured).toEqual([{ kind: null, tier: null, model: null, effort: null, cost: 35.5 }]);
    expect(b.mismatch).toEqual({ cost: 0, panes: [] });
  });
});
