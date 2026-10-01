import { describe, expect, it } from 'vitest';
import {
  BUCKET_MS,
  costByDay,
  costByKind,
  ctxSeries,
  localDay,
  makeSampleFixture,
  projectHit,
  projections,
  roleOf,
  spendDeltas,
  spendDeltasStep,
  spendInRange,
  summarizeCosts,
  usageSeries,
  type SpendEntry,
  type TaskCost,
  type UsageSample,
} from './trends.ts';
import { parseDispatch, parseKindFile, parseRoleFile, type Dispatch, type DispatchIndex, type TierConfig } from './dispatch.ts';
import { historySample, teamflowDetailBklog, teamflowDetailOps, teamflowDkboFiles, teamflowTierConfig } from '../fixtures/index.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date(2026, 8, 20, 10).getTime();

const s = (over: Partial<UsageSample> & { ts: number }): UsageSample => ({
  paneId: 'w:p1',
  agent: 'claude',
  project: 'proj',
  taskDir: 'task-a',
  member: 'backend',
  status: 'working',
  cost: null,
  ctxPct: null,
  usage5hPct: null,
  usageWkPct: null,
  ...over,
});

const costs = (e: SpendEntry[]) => e.map((x) => x.cost);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** 只取 modelcost 之前就有的 TaskCost 欄位 */
const legacy = ({ project, taskDir, cost, members, unmatched }: TaskCost) => ({ project, taskDir, cost, members, unmatched });

describe('roleOf', () => {
  it('member 第一個 - 之前；null 為 null', () => {
    expect(roleOf('frontend-shell')).toBe('frontend');
    expect(roleOf('backend')).toBe('backend');
    expect(roleOf('qa-e2e-x')).toBe('qa');
    expect(roleOf(null)).toBeNull();
  });
});

describe('spendDeltas', () => {
  it('正常累加：相鄰差額 > 0 算花費，第一筆不算', () => {
    const e = spendDeltas([s({ ts: T0, cost: 1 }), s({ ts: T0 + MIN, cost: 1.5 }), s({ ts: T0 + 2 * MIN, cost: 2.25 })]);
    expect(costs(e)).toEqual([0.5, 0.75]);
    expect(e.map((x) => x.ts)).toEqual([T0 + MIN, T0 + 2 * MIN]);
  });

  it('只有一筆時沒有花費', () => {
    expect(spendDeltas([s({ ts: T0, cost: 9 })])).toEqual([]);
  });

  it('session 重開（cost 變小）：算後一筆的 cost 本身', () => {
    expect(costs(spendDeltas([s({ ts: T0, cost: 3 }), s({ ts: T0 + MIN, cost: 0.25 }), s({ ts: T0 + 2 * MIN, cost: 0.75 })]))).toEqual([0.25, 0.5]);
  });

  it('差額為 0 不產生花費', () => {
    expect(spendDeltas([s({ ts: T0, cost: 1 }), s({ ts: T0 + MIN, cost: 1 })])).toEqual([]);
  });

  it('cost 為 null 的樣本跳過、也不當基準', () => {
    const e = spendDeltas([s({ ts: T0, cost: null }), s({ ts: T0 + MIN, cost: 1 }), s({ ts: T0 + 2 * MIN, cost: null }), s({ ts: T0 + 3 * MIN, cost: 1.5 })]);
    expect(costs(e)).toEqual([0.5]);
    expect(e[0].ts).toBe(T0 + 3 * MIN);
  });

  it('每個 pane 分開算，輸入不需排序', () => {
    const e = spendDeltas([
      s({ ts: T0 + MIN, paneId: 'b', cost: 5 }),
      s({ ts: T0 + MIN, paneId: 'a', cost: 2 }),
      s({ ts: T0, paneId: 'a', cost: 1 }),
      s({ ts: T0, paneId: 'b', cost: 4.5 }),
    ]);
    expect(e.map((x) => [x.paneId, x.cost]).sort()).toEqual([
      ['a', 1],
      ['b', 0.5],
    ]);
  });

  it('跨任務換歸屬：差額歸後一筆的 project／taskDir／member／agent', () => {
    const e = spendDeltas([
      s({ ts: T0, cost: 1, taskDir: 'task-a', member: 'backend' }),
      s({ ts: T0 + MIN, cost: 1.5, taskDir: 'task-a', member: 'backend' }),
      s({ ts: T0 + 2 * MIN, cost: 2.5, project: 'other', taskDir: 'task-b', member: 'backend-api', agent: 'codex' }),
    ]);
    expect(e[1]).toEqual({ ts: T0 + 2 * MIN, paneId: 'w:p1', agent: 'codex', project: 'other', taskDir: 'task-b', member: 'backend-api', cost: 1, model: null, effort: null });
    expect(e[0].taskDir).toBe('task-a');
  });
});

describe('spendDeltas 帶 model／effort（AC1）', () => {
  it('花費取後一筆樣本的 model／effort；舊格式樣本（缺欄）為 null', () => {
    const old = s({ ts: T0 + 2 * MIN, cost: 3 });
    delete old.model;
    delete old.effort;
    const e = spendDeltas([s({ ts: T0, cost: 1, model: 'opus 5.5', effort: 'low' }), s({ ts: T0 + MIN, cost: 2, model: 'opus 5.5', effort: 'high' }), old]);
    expect(e.map((x) => [x.model, x.effort])).toEqual([
      ['opus 5.5', 'high'],
      [null, null],
    ]);
  });
});

describe('spendDeltasStep', () => {
  it('帶著上一段的最後 cost 接著算，分段結果串起來等於一次算完', () => {
    const a = [s({ ts: T0, cost: 1 }), s({ ts: T0 + MIN, cost: 3 }), s({ ts: T0, paneId: 'w:p2', cost: 2 }), s({ ts: T0 + MIN, paneId: 'w:p2', cost: null })];
    const b = [s({ ts: T0 + 2 * MIN, cost: 1 }), s({ ts: T0 + 2 * MIN, paneId: 'w:p2', cost: 5 }), s({ ts: T0 + 3 * MIN, paneId: 'w:p3', cost: 9 })];
    const r1 = spendDeltasStep(a, new Map());
    expect(r1.carry).toEqual(new Map([['w:p1', 3], ['w:p2', 2]]));
    const r2 = spendDeltasStep(b, r1.carry);
    expect(r1.carry).toEqual(new Map([['w:p1', 3], ['w:p2', 2]])); // 不改傳入的 carry
    expect(r2.carry).toEqual(new Map([['w:p1', 1], ['w:p2', 5], ['w:p3', 9]]));
    // p1 跨段重開算 1、p2 跨段累加 3、p3 第一筆不算
    expect(costs(r2.entries)).toEqual([1, 3]);
    expect([...r1.entries, ...r2.entries]).toEqual(spendDeltas([...a, ...b]));
  });
});

describe('spendInRange 與 summarizeCosts', () => {
  it('先全保留期算差額再依後一筆 ts 篩：窗內第一筆也有花費', () => {
    const all = spendDeltas([s({ ts: T0, cost: 1 }), s({ ts: T0 + HOUR, cost: 2 }), s({ ts: T0 + 2 * HOUR, cost: 4 })]);
    expect(costs(spendInRange(all, T0 + 30 * MIN, T0 + 2 * HOUR))).toEqual([1, 2]);
    expect(costs(spendInRange(all, T0 + HOUR + 1, T0 + 2 * HOUR))).toEqual([2]);
    expect(spendInRange(all, T0 + 2 * HOUR + 1, T0 + 3 * HOUR)).toEqual([]);
  });

  it('依任務／成員／角色彙總，兩條恆等式成立', () => {
    const e: SpendEntry[] = [
      { ts: 1, paneId: 'a', agent: 'claude', project: 'p', taskDir: 't1', member: 'frontend-shell', cost: 2, model: null, effort: null },
      { ts: 2, paneId: 'a', agent: 'claude', project: 'p', taskDir: 't1', member: 'frontend-shell', cost: 1, model: null, effort: null },
      { ts: 2, paneId: 'b', agent: 'claude', project: 'p', taskDir: 't1', member: 'backend', cost: 0.5, model: null, effort: null },
      { ts: 3, paneId: 'c', agent: 'codex', project: 'p', taskDir: 't1', member: null, cost: 0.25, model: null, effort: null },
      { ts: 3, paneId: 'd', agent: 'codex', project: 'q', taskDir: 't2', member: 'frontend', cost: 4, model: null, effort: null },
      { ts: 4, paneId: 'e', agent: 'codex', project: null, taskDir: null, member: null, cost: 1.5, model: null, effort: null },
      { ts: 4, paneId: 'f', agent: 'claude', project: 'p', taskDir: null, member: null, cost: 0.75, model: null, effort: null },
    ];
    const r = summarizeCosts(e);
    expect(r.tasks.map(legacy)).toEqual([
      { project: 'q', taskDir: 't2', cost: 4, members: { frontend: 4 }, unmatched: 0 },
      { project: 'p', taskDir: 't1', cost: 3.75, members: { 'frontend-shell': 3, backend: 0.5 }, unmatched: 0.25 },
    ]);
    expect(r.byRole).toEqual({ frontend: 7, backend: 0.5 });
    expect(r.unknownRole).toBe(2.5);
    expect(r.unattributed).toBe(2.25);
    for (const t of r.tasks) expect(t.cost).toBe(sum(Object.values(t.members)) + t.unmatched);
    expect(sum(r.tasks.map((t) => t.cost)) + r.unattributed).toBe(sum(Object.values(r.byRole)) + r.unknownRole);
  });

  it('同名 taskDir 在不同 project 是不同任務', () => {
    const e: SpendEntry[] = [
      { ts: 1, paneId: 'a', agent: 'claude', project: 'p', taskDir: 't', member: 'qa', cost: 1, model: null, effort: null },
      { ts: 1, paneId: 'b', agent: 'claude', project: 'q', taskDir: 't', member: 'qa', cost: 2, model: null, effort: null },
    ];
    expect(summarizeCosts(e).tasks.map((t) => [t.project, t.cost])).toEqual([
      ['q', 2],
      ['p', 1],
    ]);
  });

  it('project 為 null 而 taskDir 有值也算 unattributed，不進 tasks', () => {
    const r = summarizeCosts([{ ts: 1, paneId: 'a', agent: 'claude', project: null, taskDir: 't', member: 'qa', cost: 2, model: null, effort: null }]);
    expect(r).toMatchObject({ tasks: [], byRole: { qa: 2 }, unknownRole: 0, unattributed: 2 });
  });

  it('空輸入全為 0', () => {
    expect(summarizeCosts([])).toEqual({ tasks: [], byRole: {}, unknownRole: 0, unattributed: 0, byActual: [], byConfigured: [], mismatch: { cost: 0, panes: [] } });
  });
});

describe('costByDay 與 costByKind', () => {
  it('依本地日期與專案分組，null 專案排最後；kind 為 null 歸 unknown', () => {
    const d1 = new Date(2026, 8, 20, 23, 59).getTime();
    const d2 = new Date(2026, 8, 21, 0, 1).getTime();
    const e: SpendEntry[] = [
      { ts: d2, paneId: 'a', agent: 'claude', project: 'p', taskDir: 't', member: null, cost: 1, model: null, effort: null },
      { ts: d1, paneId: 'a', agent: 'claude', project: 'p', taskDir: 't', member: null, cost: 2, model: null, effort: null },
      { ts: d1, paneId: 'b', agent: null, project: null, taskDir: null, member: null, cost: 0.5, model: null, effort: null },
      { ts: d1, paneId: 'c', agent: 'codex', project: 'a', taskDir: null, member: null, cost: 0.25, model: null, effort: null },
      { ts: d1 - 1, paneId: 'a', agent: 'claude', project: 'p', taskDir: 't', member: null, cost: 0.25, model: null, effort: null },
    ];
    expect(costByDay(e)).toEqual([
      { day: '2026-09-20', project: 'a', cost: 0.25 },
      { day: '2026-09-20', project: 'p', cost: 2.25 },
      { day: '2026-09-20', project: null, cost: 0.5 },
      { day: '2026-09-21', project: 'p', cost: 1 },
    ]);
    expect(costByKind(e)).toEqual({ claude: 3.25, unknown: 0.5, codex: 0.25 });
  });

  it('localDay 用本地時區', () => {
    expect(localDay(new Date(2026, 0, 5, 0, 0, 1).getTime())).toBe('2026-01-05');
  });
});

describe('usageSeries', () => {
  it('每個 kind 依 bucket 取最大值，空 bucket 不出點，範圍外不算', () => {
    const b = BUCKET_MS['6h'];
    const base = Math.floor(T0 / b) * b;
    const samples = [
      s({ ts: base - 1, usage5hPct: 99 }),
      s({ ts: base, paneId: 'a', usage5hPct: 10, usageWkPct: 40 }),
      s({ ts: base + MIN, paneId: 'b', usage5hPct: 12, usageWkPct: null }),
      s({ ts: base + 2 * b, paneId: 'a', usage5hPct: 15, usageWkPct: 41 }),
      s({ ts: base + 2 * b + MIN, paneId: 'c', agent: 'codex', usage5hPct: null, usageWkPct: null }),
      s({ ts: base + 3 * b, paneId: 'd', agent: null, usage5hPct: 50 }),
    ];
    expect(usageSeries(samples, base, base + 6 * HOUR, b)).toEqual({
      claude: [
        { t: base, fiveHourPct: 12, weekPct: 40 },
        { t: base + 2 * b, fiveHourPct: 15, weekPct: 41 },
      ],
      codex: [{ t: base + 2 * b, fiveHourPct: null, weekPct: null }],
    });
  });
});

describe('ctxSeries', () => {
  it('每個 pane 一條，bucket 取最大值、null 不出點；label 用 member → 名字 → agent → paneId', () => {
    const b = BUCKET_MS['24h'];
    const base = Math.floor(T0 / b) * b;
    const samples = [
      s({ ts: base, paneId: 'a', member: 'backend', ctxPct: 10 }),
      s({ ts: base + MIN, paneId: 'a', member: 'backend', ctxPct: 30 }),
      s({ ts: base + 2 * b, paneId: 'a', member: 'backend', ctxPct: null }),
      s({ ts: base + 3 * b, paneId: 'a', member: 'backend', ctxPct: 5 }),
      s({ ts: base, paneId: 'b', member: null, ctxPct: 20 }),
      s({ ts: base, paneId: 'c', member: null, agent: 'codex', ctxPct: 1 }),
      s({ ts: base, paneId: 'd', member: null, agent: null, ctxPct: 2 }),
      s({ ts: base, paneId: 'e', member: null, ctxPct: null }),
    ];
    expect(ctxSeries(samples, base, base + 24 * HOUR, b, { b: 'dash-lead' })).toEqual([
      { paneId: 'a', label: 'backend', points: [{ t: base, ctxPct: 30 }, { t: base + 3 * b, ctxPct: 5 }] },
      { paneId: 'c', label: 'codex', points: [{ t: base, ctxPct: 1 }] },
      { paneId: 'd', label: 'd', points: [{ t: base, ctxPct: 2 }] },
      { paneId: 'b', label: 'dash-lead', points: [{ t: base, ctxPct: 20 }] },
    ]);
  });

  it('label 取範圍內最後一筆的 member', () => {
    const samples = [s({ ts: T0, paneId: 'a', member: 'old', ctxPct: 1 }), s({ ts: T0 + HOUR, paneId: 'a', member: 'new', ctxPct: 2 })];
    expect(ctxSeries(samples, T0, T0 + 2 * HOUR, HOUR)[0].label).toBe('new');
  });
});

describe('projectHit', () => {
  const NOW = T0 + HOUR;
  const H5 = 5 * HOUR;
  const pts = (vals: number[], step = 10 * MIN, end = NOW) => vals.map((v, i) => ({ t: end - (vals.length - 1 - i) * step, pct: v }));

  it('上升：以最小平方直線外插到 100%', () => {
    // 每 10 分鐘 +10%，最後一點在 NOW 為 50% → 再 50 分鐘達 100%
    expect(projectHit(pts([10, 20, 30, 40, 50]), NOW, H5)).toBe(NOW + 50 * MIN);
  });

  it('持平回 null', () => {
    expect(projectHit(pts([30, 30, 30, 30]), NOW, H5)).toBeNull();
  });

  it('下降（每點都比前一點低＝一直在重置）回 null', () => {
    expect(projectHit(pts([50, 40, 30]), NOW, H5)).toBeNull();
  });

  it('點數不足 3 回 null', () => {
    expect(projectHit(pts([10, 20]), NOW, H5)).toBeNull();
    expect(projectHit([], NOW, H5)).toBeNull();
  });

  it('目前值已 ≥ 100 回最新樣本時間', () => {
    expect(projectHit(pts([90, 100]), NOW, H5)).toBe(NOW);
    expect(projectHit(pts([100], 10 * MIN, NOW - 3 * MIN), NOW, H5)).toBe(NOW - 3 * MIN);
  });

  it('窗內有一次重置：只用最後一次下降之後的點', () => {
    // 重置前的 80、90 若被納入會讓斜率變負；重置後 10→20→30 每 10 分鐘 +10 → 再 70 分鐘
    expect(projectHit(pts([80, 90, 10, 20, 30]), NOW, H5)).toBe(NOW + 70 * MIN);
    // 重置後只剩兩點 → 點數不足
    expect(projectHit(pts([10, 20, 30, 5, 10]), NOW, H5)).toBeNull();
  });

  it('預估晚於 now＋週期回 null', () => {
    // 每 10 分鐘 +1% 從 10% 起 → 還要 900 分鐘，超過 5h
    expect(projectHit(pts([8, 9, 10]), NOW, H5)).toBeNull();
    expect(projectHit(pts([8, 9, 10]), NOW, 7 * 24 * HOUR)).toBe(NOW + 900 * MIN);
  });

  it('目前值 < 100 而預估早於 now 回 null（樣本都舊了，外推點落在過去）', () => {
    // 最後一點在 3 小時前、50%，每 10 分鐘 +10 → 直線在 NOW−130 分鐘就到 100
    expect(projectHit(pts([10, 20, 30, 40, 50], 10 * MIN, NOW - 3 * HOUR), NOW, 7 * 24 * HOUR)).toBeNull();
    // 剛好落在 now 不算早於 now
    expect(projectHit(pts([70, 80, 90], 10 * MIN, NOW - 10 * MIN), NOW, H5)).toBe(NOW);
    // 已 ≥ 100 仍回最新樣本時間，即使那是過去
    expect(projectHit(pts([90, 100], 10 * MIN, NOW - 3 * HOUR), NOW, H5)).toBe(NOW - 3 * HOUR);
  });

  it('輸入不需排序', () => {
    const p = pts([10, 20, 30, 40, 50]);
    expect(projectHit([p[3], p[0], p[4], p[2], p[1]], NOW, H5)).toBe(NOW + 50 * MIN);
  });
});

describe('projections', () => {
  const NOW = T0 + 2 * HOUR;
  it('5h 取最近 60 分鐘、週取最近 24 小時；同一時點同 kind 取最大值', () => {
    const rows: UsageSample[] = [];
    // 窗外（61 分鐘前）的高值不影響 5h 預估
    rows.push(s({ ts: NOW - 61 * MIN, paneId: 'a', usage5hPct: 95, usageWkPct: 10 }));
    for (let k = 0; k < 5; k++) {
      const ts = NOW - (4 - k) * 10 * MIN;
      rows.push(s({ ts, paneId: 'a', usage5hPct: 10 + 10 * k, usageWkPct: 11 + k }));
      rows.push(s({ ts, paneId: 'b', usage5hPct: 5 + 10 * k, usageWkPct: 11 + k })); // 較低的舊值不會拉低
      rows.push(s({ ts, paneId: 'c', agent: 'codex', usage5hPct: 20, usageWkPct: null }));
    }
    const r = projections(rows, NOW);
    expect(r.claude.fiveHourAt).toBe(NOW + 50 * MIN);
    expect(r.claude.weekAt).not.toBeNull();
    expect(r.codex).toEqual({ fiveHourAt: null, weekAt: null });
  });

  it('pane 沒寫的時點沿用它上一筆的值（去重造成的空缺不會被當成下降）', () => {
    const rows: UsageSample[] = [];
    for (let k = 0; k < 5; k++) {
      const ts = NOW - (4 - k) * 10 * MIN;
      rows.push(s({ ts, paneId: 'a', usage5hPct: 10 + 10 * k }));
    }
    // b 的舊值 5 在 a 沒寫的時點（NOW−5 分鐘）單獨出現：若照字面只看該時點會變成 40 → 5 → 50 的「重置」而只剩 2 點
    rows.push(s({ ts: NOW - 5 * MIN, paneId: 'b', usage5hPct: 5 }));
    const at = projections(rows, NOW).claude.fiveHourAt;
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(NOW);
    expect(at!).toBeLessThan(NOW + 60 * MIN);
  });

  it('沒有樣本的 kind 不出現', () => {
    expect(projections([], NOW)).toEqual({});
  });
});

describe('makeSampleFixture', () => {
  const NOW = new Date(2026, 8, 26, 15, 30).getTime();
  const f = makeSampleFixture(NOW);

  it('以當天與前一天的本地中午為錨點', () => {
    expect(Object.keys(f)).toEqual(['2026-09-25', '2026-09-26']);
    expect(f['2026-09-26'][0].ts).toBe(new Date(2026, 8, 26, 12).getTime());
    expect(f['2026-09-25'][0].ts).toBe(new Date(2026, 8, 25, 12).getTime());
    for (const [day, rows] of Object.entries(f)) for (const r of rows) expect(localDay(r.ts)).toBe(day);
  });

  it('2 個 kind、含 session 重開、任務換歸屬、member 為 null 的 pane，金額與註解一致', () => {
    const all = Object.values(f).flat();
    expect(new Set(all.map((x) => x.agent))).toEqual(new Set(['claude', 'codex']));
    const r = summarizeCosts(spendDeltas(all));
    expect(r.tasks.map(legacy)).toEqual([
      { project: 'teamflow', taskDir: '2026-09-24-bklog', cost: 13, members: { 'frontend-shell': 8, backend: 5 }, unmatched: 0 },
      { project: 'teamflow', taskDir: '2026-09-23-ops', cost: 11.5, members: { backend: 6 }, unmatched: 5.5 },
    ]);
    expect(r.unattributed).toBe(11);
    expect(r.unknownRole).toBe(16.5);
    expect(r.byRole).toEqual({ frontend: 8, backend: 11 });
  });

  it('樣本帶 model／effort：p1 中途改 effort、p3 缺欄模擬舊樣本（AC9）', () => {
    const all = Object.values(f).flat();
    const p1 = all.filter((x) => x.paneId === 'wF0:p1');
    expect(new Set(p1.map((x) => x.effort))).toEqual(new Set(['medium', 'high']));
    const p3 = all.filter((x) => x.paneId.endsWith(':p3'));
    expect(p3.every((x) => !('model' in x) && !('effort' in x))).toBe(true);
    expect(all.filter((x) => !x.paneId.endsWith(':p3')).every((x) => typeof x.model === 'string' && typeof x.effort === 'string')).toBe(true);
  });

  it('搭配 fixture 的 spawn 事件與 roles／kinds 檔：至少 1 列 mismatch、設定歸屬非 null（AC9）', () => {
    const dispatch: DispatchIndex = {
      teamflow: Object.fromEntries([teamflowDetailBklog, teamflowDetailOps].map((d) => [d.task.dir, parseDispatch(d.task.events, d.task.short, teamflowTierConfig)])),
    };
    const all = Object.values(f).flat();
    const r = summarizeCosts(spendDeltas(all), { dispatch, samples: all });
    expect(r.mismatch.panes).toEqual(
      ['wF0:p1', 'wF1:p1'].map((paneId) => ({
        paneId,
        project: 'teamflow',
        taskDir: '2026-09-24-bklog',
        member: 'frontend-shell',
        actual: { model: 'sonnet 5', effort: 'high' },
        configured: { model: 'sonnet', effort: 'medium' },
        cost: 1.5,
      })),
    );
    expect(r.mismatch.cost).toBe(3);
    const [bklog, ops] = r.tasks;
    expect(bklog.memberInfo['frontend-shell']).toMatchObject({ configured: { kind: 'claude', tier: 'M', model: 'sonnet', effort: 'medium' }, dispatchCount: 1, actual: { model: 'sonnet 5', effort: 'high' }, mismatch: true });
    expect(bklog.memberInfo.backend).toMatchObject({ configured: { tier: 'L', model: 'opus', effort: 'high' }, mismatch: false });
    expect(ops.memberInfo.backend).toMatchObject({ configured: { kind: 'claude', tier: 'L', notes: ['resume', 'handoff'] }, dispatchCount: 2, mismatch: false });
    expect(r.byConfigured).toEqual([
      { kind: null, tier: null, model: null, effort: null, cost: 16.5 },
      { kind: 'claude', tier: 'L', model: 'opus', effort: 'high', cost: 11 },
      { kind: 'claude', tier: 'M', model: 'sonnet', effort: 'medium', cost: 8 },
    ]);
    expect(r.byActual).toEqual([
      { model: 'gpt-5.5', effort: 'medium', cost: 11 },
      { model: 'opus 5.5', effort: 'high', cost: 11 },
      { model: null, effort: null, cost: 5.5 },
      { model: 'sonnet 5', effort: 'medium', cost: 5 },
      { model: 'sonnet 5', effort: 'high', cost: 3 },
    ]);
  });
});

describe('fixture 的 roles／kinds 檔與 spawn 事件（AC9）', () => {
  it('teamflowTierConfig 就是 teamflowDkboFiles 以文字解析的結果', () => {
    const roles: TierConfig['roles'] = {};
    const kinds: TierConfig['kinds'] = {};
    for (const [path, text] of Object.entries(teamflowDkboFiles)) {
      const m = /^(roles|kinds)\/(.+)\.(md|sh)$/.exec(path)!;
      if (m[1] === 'roles') roles[m[2]] = parseRoleFile(text);
      else kinds[m[2]] = parseKindFile(text);
    }
    expect(teamflowTierConfig).toEqual({ roles, kinds });
  });

  it('至少一行 spawn 的 kind 與角色檔不同（且有該 kind 的 kinds 檔）；至少一位成員兩次派工不同檔位', () => {
    const all = [teamflowDetailBklog, teamflowDetailOps].flatMap((d) => parseDispatch(d.task.events, d.task.short, teamflowTierConfig));
    const override = all.filter((d) => d.role !== null && teamflowTierConfig.roles[d.role]?.kind !== d.kind);
    expect(override.length).toBeGreaterThan(0);
    for (const d of override) expect(teamflowTierConfig.kinds[d.kind]).toBeDefined();
    expect(override[0]).toMatchObject({ member: 'backend', kind: 'codex', tier: 'M', model: 'gpt-5.5', effort: 'medium' });
    const tiers = new Map<string, Set<string>>();
    for (const d of all) tiers.set(d.member, (tiers.get(d.member) ?? new Set()).add(d.tier));
    expect([...tiers.values()].some((t) => t.size >= 2)).toBe(true);
  });

  it('history.json 每列都有 dispatch 與 repairWaves', () => {
    for (const row of historySample.tasks) {
      expect(Array.isArray(row.dispatch)).toBe(true);
      expect(typeof row.repairWaves).toBe('number');
    }
    const ops = historySample.tasks.find((t) => t.dir === '2026-09-23-ops')!;
    expect(ops.repairWaves).toBe(3);
    // at 是產生 fixture 那台機器的本地時間轉的 epoch，換時區會差，比對時略過
    const noAt = ({ at: _at, ...rest }: Dispatch) => rest;
    expect(ops.dispatch.map(noAt)).toEqual(parseDispatch(teamflowDetailOps.task.events, 'ops', teamflowTierConfig).map(noAt));
  });
});

describe('summarizeCosts 的實際／設定歸屬與不一致（AC5）', () => {
  const CONFIG: TierConfig = {
    roles: { backend: { kind: 'claude', tiers: { M: 'opus/medium', L: 'opus/high' } }, qa: { kind: 'claude', tiers: { M: 'sonnet/medium' } } },
    kinds: {},
  };
  const hhmm = (min: number) => {
    const d = new Date(T0 + min * MIN);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  // backend 在 T0+30 以 M 派、T0+60 以 L handoff；qa 在 T0+90 才派（晚於它所有花費）；other 沒有派工
  const dispatch: DispatchIndex = {
    proj: {
      'task-a': parseDispatch(
        [
          { ts: hhmm(30), kind: 'spawn', text: 'spawn a-backend (claude M)' },
          { ts: hhmm(60), kind: 'spawn', text: 'spawn a-backend (claude L) resume handoff' },
          { ts: hhmm(90), kind: 'spawn', text: 'spawn a-qa (claude M)' },
        ],
        'a',
        CONFIG,
      ),
    },
  };
  const at = (min: number) => T0 + min * MIN;
  const e = (min: number, over: Partial<SpendEntry>): SpendEntry => ({
    ts: at(min),
    paneId: 'w:p1',
    agent: 'claude',
    project: 'proj',
    taskDir: 'task-a',
    member: 'backend',
    cost: 1,
    model: 'opus 5.5',
    effort: 'medium',
    ...over,
  });
  const entries: SpendEntry[] = [
    e(40, { cost: 1 }), // M，一致
    e(50, { cost: 2, effort: 'high' }), // M，effort 不一致
    e(60, { cost: 4, effort: 'high' }), // 同一分鐘 handoff → L，一致
    e(70, { cost: 8, model: 'sonnet 5', effort: 'high' }), // L，實際中途換 model → 不一致
    e(20, { paneId: 'w:p2', member: 'qa', model: 'sonnet 5', effort: 'medium', cost: 0.5 }), // 派工全晚於花費 → 取最早（M）
    e(20, { paneId: 'w:p3', member: 'other', model: null, effort: null, cost: 0.25 }), // 沒有派工 → null
    e(20, { paneId: 'w:p4', member: null, cost: 0.125 }), // member null → null
    e(20, { paneId: 'w:p5', project: null, taskDir: null, member: null, agent: 'codex', model: 'gpt-5.5', effort: 'low', cost: 16 }), // 未歸屬
  ];
  const r = summarizeCosts(entries, { dispatch });
  const task = r.tasks[0];

  it('同成員中途換檔位：handoff 後的花費歸新檔位；byConfigured 含 role、cost 降冪', () => {
    expect(task.byConfigured).toEqual([
      { role: 'backend', kind: 'claude', tier: 'L', model: 'opus', effort: 'high', cost: 12 },
      { role: 'backend', kind: 'claude', tier: 'M', model: 'opus', effort: 'medium', cost: 3 },
      { role: 'qa', kind: 'claude', tier: 'M', model: 'sonnet', effort: 'medium', cost: 0.5 },
      { role: 'other', kind: null, tier: null, model: null, effort: null, cost: 0.25 },
      { role: null, kind: null, tier: null, model: null, effort: null, cost: 0.125 },
    ]);
  });

  it('Dispatch 全晚於花費取最早；無 Dispatch 為 null；memberInfo 的 configured／dispatchCount', () => {
    expect(task.memberInfo.qa.configured).toMatchObject({ member: 'qa', tier: 'M' });
    expect(task.memberInfo.qa.dispatchCount).toBe(1);
    expect(task.memberInfo.backend.configured).toMatchObject({ tier: 'L', notes: ['resume', 'handoff'] });
    expect(task.memberInfo.backend.dispatchCount).toBe(2);
    expect(task.memberInfo.other).toEqual({ configured: null, dispatchCount: 0, actual: { model: null, effort: null }, mismatch: false });
    expect(Object.keys(task.memberInfo).sort()).toEqual(Object.keys(task.members).sort());
  });

  it('頂層 byConfigured 不含 role、含未歸屬；byActual 依實際 model／effort（中途換 model 分兩列）', () => {
    expect(r.byConfigured).toEqual([
      { kind: null, tier: null, model: null, effort: null, cost: 16.375 },
      { kind: 'claude', tier: 'L', model: 'opus', effort: 'high', cost: 12 },
      { kind: 'claude', tier: 'M', model: 'opus', effort: 'medium', cost: 3 },
      { kind: 'claude', tier: 'M', model: 'sonnet', effort: 'medium', cost: 0.5 },
    ]);
    expect(r.byActual).toEqual([
      { model: 'gpt-5.5', effort: 'low', cost: 16 },
      { model: 'sonnet 5', effort: 'high', cost: 8 },
      { model: 'opus 5.5', effort: 'high', cost: 6 },
      { model: 'opus 5.5', effort: 'medium', cost: 1.125 },
      { model: 'sonnet 5', effort: 'medium', cost: 0.5 },
      { model: null, effort: null, cost: 0.25 },
    ]);
  });

  it('不一致：以 (paneId, 實際, 設定) 分組；前段一致後段切模型只有後段；cost＝Σ panes', () => {
    expect(r.mismatch.panes).toEqual([
      { paneId: 'w:p1', project: 'proj', taskDir: 'task-a', member: 'backend', actual: { model: 'sonnet 5', effort: 'high' }, configured: { model: 'opus', effort: 'high' }, cost: 8 },
      { paneId: 'w:p1', project: 'proj', taskDir: 'task-a', member: 'backend', actual: { model: 'opus 5.5', effort: 'high' }, configured: { model: 'opus', effort: 'medium' }, cost: 2 },
    ]);
    expect(r.mismatch.cost).toBe(10);
  });

  it('同 pane 換任務、兩段實際與設定都相同且都不一致 → 各任務各一列，⇔ 仍成立（波 1 審查裁定）', () => {
    const dispatchAB: DispatchIndex = {
      proj: {
        'task-a': parseDispatch([{ ts: hhmm(0), kind: 'spawn', text: 'spawn a-backend (claude M)' }], 'a', CONFIG),
        'task-b': parseDispatch([{ ts: hhmm(0), kind: 'spawn', text: 'spawn b-backend (claude M)' }], 'b', CONFIG),
      },
    };
    const x = summarizeCosts([e(40, { cost: 1, effort: 'high' }), e(50, { cost: 2, effort: 'high', taskDir: 'task-b' })], { dispatch: dispatchAB });
    expect(x.mismatch.panes.map((p) => [p.paneId, p.taskDir, p.member, p.actual, p.configured, p.cost])).toEqual([
      ['w:p1', 'task-b', 'backend', { model: 'opus 5.5', effort: 'high' }, { model: 'opus', effort: 'medium' }, 2],
      ['w:p1', 'task-a', 'backend', { model: 'opus 5.5', effort: 'high' }, { model: 'opus', effort: 'medium' }, 1],
    ]);
    for (const t of x.tasks) {
      expect(t.memberInfo.backend.mismatch).toBe(true);
      expect(x.mismatch.panes.filter((p) => p.taskDir === t.taskDir).reduce((a, p) => a + p.cost, 0)).toBe(t.cost);
    }
  });

  it('memberInfo.mismatch ⇔ mismatch.panes 有該 project／taskDir／member 的列', () => {
    for (const t of r.tasks)
      for (const [m, info] of Object.entries(t.memberInfo))
        expect(info.mismatch).toBe(r.mismatch.panes.some((p) => p.project === t.project && p.taskDir === t.taskDir && p.member === m));
    expect(task.memberInfo.backend.mismatch).toBe(true);
    expect(task.memberInfo.qa.mismatch).toBe(false);
  });

  it('同 pane 前段一致、後段切模型 → mismatch.panes 只有後段一列', () => {
    const x = summarizeCosts([e(40, { cost: 1 }), e(45, { cost: 2 }), e(50, { cost: 4, model: 'sonnet 5' }), e(55, { cost: 8, model: 'sonnet 5' })], { dispatch });
    expect(x.mismatch.panes).toEqual([
      { paneId: 'w:p1', project: 'proj', taskDir: 'task-a', member: 'backend', actual: { model: 'sonnet 5', effort: 'medium' }, configured: { model: 'opus', effort: 'medium' }, cost: 12 },
    ]);
  });

  it('兩條恆等式：Σ byActual = Σ byConfigured = Σ tasks + unattributed；每個任務 Σ byConfigured = cost', () => {
    const total = sum(r.tasks.map((t) => t.cost)) + r.unattributed;
    expect(Math.abs(sum(r.byActual.map((x) => x.cost)) - total)).toBeLessThan(1e-9);
    expect(Math.abs(sum(r.byConfigured.map((x) => x.cost)) - total)).toBeLessThan(1e-9);
    for (const t of r.tasks) expect(Math.abs(sum(t.byConfigured.map((x) => x.cost)) - t.cost)).toBeLessThan(1e-9);
  });

  it('memberInfo.actual：有給 samples 時取範圍內該成員最後一筆樣本；沒給時取最後一筆花費', () => {
    expect(task.memberInfo.backend.actual).toEqual({ model: 'sonnet 5', effort: 'high' });
    const samples = [
      s({ ts: at(80), paneId: 'w:p1', project: 'proj', taskDir: 'task-a', member: 'backend', model: 'opus 5.5', effort: 'high' }),
      s({ ts: at(75), paneId: 'w:p1', project: 'proj', taskDir: 'task-a', member: 'backend', model: 'sonnet 5', effort: 'low' }),
      s({ ts: at(80), paneId: 'w:p9', project: 'proj', taskDir: 'task-b', member: 'backend', model: 'x', effort: 'y' }),
    ];
    const y = summarizeCosts(entries, { dispatch, samples });
    expect(y.tasks[0].memberInfo.backend.actual).toEqual({ model: 'opus 5.5', effort: 'high' });
    expect(y.tasks[0].memberInfo.qa.actual).toBeNull();
  });

  it('沒給 dispatch 時設定全為 null、沒有不一致', () => {
    const z = summarizeCosts(entries);
    expect(z.byConfigured).toEqual([{ kind: null, tier: null, model: null, effort: null, cost: 31.875 }]);
    expect(z.mismatch).toEqual({ cost: 0, panes: [] });
  });
});
