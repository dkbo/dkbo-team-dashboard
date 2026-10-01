// 趨勢資料：取樣落地（UsageRecorder）、讀檔（SampleStore）、兩支 API，以及從 env 解析資料目錄。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUCKET_MS,
  localDay,
  makeSampleFixture,
  type AgentLive,
  type CostsResponse,
  type OverviewDoc,
  type TrendsResponse,
  type UsageSample,
} from '@dash/shared';
import { createDashServer, type DashServer } from '../src/server.ts';
import { SampleStore, UsageRecorder, usageOptsFromEnv } from '../src/usage.ts';
import { script, tmp, waitFor } from './helpers.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date(2026, 8, 20, 10).getTime();

const agent = (over: Partial<AgentLive> = {}): AgentLive => ({
  paneId: 'w1:p1',
  tabId: 'w1:t1',
  workspaceId: 'w1',
  name: 'proj-backend',
  agent: 'claude',
  status: 'working',
  cwd: '/x',
  model: 'opus',
  effort: null,
  cost: 1,
  ctxPct: 10,
  usage5hPct: 20,
  usageWkPct: 30,
  taskDir: 'task-a',
  member: 'backend',
  project: 'proj',
  ...over,
});

const doc = (agents: AgentLive[], state: OverviewDoc['herdr']['state'] = 'subscribed'): OverviewDoc => ({
  generatedAt: 0,
  projects: [],
  agents,
  kindsDown: [],
  usage: {},
  herdr: { state, lastAt: null },
});

const lines = (dir: string, day: string): UsageSample[] => {
  const f = join(dir, 'samples', `${day}.jsonl`);
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as UsageSample) : [];
};

function rig(dataDir = join(tmp('dash-data-'), 'nested/data')) {
  const clock = { now: T0 };
  let current = doc([agent()]);
  const rec = new UsageRecorder({ dataDir, sampleMs: 60_000, retentionDays: 30, now: () => clock.now, source: () => current });
  return {
    dataDir,
    clock,
    rec,
    set(d: OverviewDoc) {
      current = d;
    },
  };
}

describe('usageOptsFromEnv', () => {
  it('DASH_DATA_DIR 優先，解析成絕對路徑；否則 XDG_STATE_HOME、再否則 HOME/.local/state', () => {
    expect(usageOptsFromEnv({ DASH_DATA_DIR: 'rel/dir', HOME: '/h' }).dataDir).toBe(join(process.cwd(), 'rel/dir'));
    expect(usageOptsFromEnv({ XDG_STATE_HOME: '/xdg', HOME: '/h' }).dataDir).toBe('/xdg/dkbo-dashboard');
    expect(usageOptsFromEnv({ XDG_STATE_HOME: '', HOME: '/h' }).dataDir).toBe('/h/.local/state/dkbo-dashboard');
  });

  it('DASH_SAMPLE_MS 預設 60000、DASH_RETENTION_DAYS 預設 30；不合法值用預設', () => {
    expect(usageOptsFromEnv({ HOME: '/h' })).toMatchObject({ sampleMs: 60_000, retentionDays: 30 });
    expect(usageOptsFromEnv({ HOME: '/h', DASH_SAMPLE_MS: '250', DASH_RETENTION_DAYS: '7' })).toMatchObject({ sampleMs: 250, retentionDays: 7 });
    expect(usageOptsFromEnv({ HOME: '/h', DASH_SAMPLE_MS: 'x', DASH_RETENTION_DAYS: '-1' })).toMatchObject({ sampleMs: 60_000, retentionDays: 30 });
  });
});

describe('UsageRecorder 取樣與落地（AC1）', () => {
  it('寫到 samples/<本地日期>.jsonl，目錄不存在時自動建立，每行是 UsageSample', () => {
    const r = rig();
    r.set(doc([agent(), agent({ paneId: 'w1:p2', member: null, taskDir: null, project: null, agent: 'codex', cost: null, name: null })]));
    r.rec.tick();
    expect(lines(r.dataDir, localDay(T0))).toEqual([
      { ts: T0, paneId: 'w1:p1', agent: 'claude', project: 'proj', taskDir: 'task-a', member: 'backend', status: 'working', cost: 1, ctxPct: 10, usage5hPct: 20, usageWkPct: 30, model: 'opus', effort: null },
      { ts: T0, paneId: 'w1:p2', agent: 'codex', project: null, taskDir: null, member: null, status: 'working', cost: null, ctxPct: 10, usage5hPct: 20, usageWkPct: 30, model: 'opus', effort: null },
    ]);
  });

  it('herdr down 時不取樣', () => {
    const r = rig();
    r.set(doc([agent()], 'down'));
    r.rec.tick();
    expect(existsSync(join(r.dataDir, 'samples'))).toBe(false);
    r.set(doc([agent()], 'polling'));
    r.rec.tick();
    expect(lines(r.dataDir, localDay(T0))).toHaveLength(1);
  });

  it('同 pane 值全沒變且 < 10 分鐘不寫；滿 10 分鐘寫一筆心跳；任一欄變了就寫', () => {
    const r = rig();
    r.rec.tick();
    r.clock.now = T0 + 9 * MIN;
    r.rec.tick();
    expect(lines(r.dataDir, localDay(T0)).map((x) => x.ts)).toEqual([T0]);
    r.clock.now = T0 + 10 * MIN;
    r.rec.tick();
    expect(lines(r.dataDir, localDay(T0)).map((x) => x.ts)).toEqual([T0, T0 + 10 * MIN]);
    const fields: Partial<AgentLive>[] = [
      { cost: 2 },
      { ctxPct: 11 },
      { usage5hPct: 21 },
      { usageWkPct: 31 },
      { status: 'idle' },
      { project: 'other' },
      { taskDir: 'task-b' },
      { member: 'qa' },
      { model: 'sonnet' },
      { effort: 'high' },
    ];
    let t = T0 + 10 * MIN;
    let cur: Partial<AgentLive> = {};
    for (const f of fields) {
      t += MIN;
      r.clock.now = t;
      cur = { ...cur, ...f };
      r.set(doc([agent(cur)]));
      r.rec.tick();
      expect(lines(r.dataDir, localDay(T0)).at(-1)?.ts).toBe(t);
    }
    // name、cwd 等不在比對欄位內的變動不寫
    t += MIN;
    r.clock.now = t;
    r.set(doc([agent({ ...cur, name: 'renamed', cwd: '/y' })]));
    r.rec.tick();
    expect(lines(r.dataDir, localDay(T0))).toHaveLength(2 + fields.length);
  });

  it('新樣本一律帶 model、effort（取自 PaneLive，null 也寫）（modelcost AC1）', () => {
    const r = rig();
    r.set(doc([agent({ model: 'opus 5.5', effort: 'high' }), agent({ paneId: 'w1:p2', model: null, effort: null })]));
    r.rec.tick();
    const rows = lines(r.dataDir, localDay(T0));
    expect(rows.map((x) => [x.paneId, x.model, x.effort])).toEqual([
      ['w1:p1', 'opus 5.5', 'high'],
      ['w1:p2', null, null],
    ]);
    expect(rows.every((x) => 'model' in x && 'effort' in x)).toBe(true);
  });

  it('多顆 pane 各自去重', () => {
    const r = rig();
    r.set(doc([agent(), agent({ paneId: 'w1:p2' })]));
    r.rec.tick();
    r.clock.now += MIN;
    r.set(doc([agent({ cost: 5 }), agent({ paneId: 'w1:p2' })]));
    r.rec.tick();
    expect(lines(r.dataDir, localDay(T0)).map((x) => [x.ts, x.paneId])).toEqual([
      [T0, 'w1:p1'],
      [T0, 'w1:p2'],
      [T0 + MIN, 'w1:p1'],
    ]);
  });

  it('重啟後接著 append；第一次取樣每個 pane 都寫（去重基準只在記憶體）', () => {
    const r = rig();
    r.rec.tick();
    const r2 = rig(r.dataDir);
    r2.clock.now = T0 + MIN;
    r2.rec.tick();
    expect(lines(r.dataDir, localDay(T0)).map((x) => x.ts)).toEqual([T0, T0 + MIN]);
  });

  it('跨日寫到新日期的檔', () => {
    const r = rig();
    r.rec.tick();
    const next = new Date(2026, 8, 21, 0, 5).getTime();
    r.clock.now = next;
    r.set(doc([agent({ cost: 9 })]));
    r.rec.tick();
    expect(lines(r.dataDir, '2026-09-20')).toHaveLength(1);
    expect(lines(r.dataDir, '2026-09-21').map((x) => x.cost)).toEqual([9]);
  });

  it('start 後每 sampleMs 取樣一次，stop 後停止', async () => {
    const dataDir = tmp('dash-data-');
    let n = 0;
    const rec = new UsageRecorder({ dataDir, sampleMs: 20, retentionDays: 30, now: () => T0 + n++ * HOUR, source: () => doc([agent()]) });
    rec.start();
    try {
      await waitFor(() => lines(dataDir, localDay(T0)).length >= 2, 5000);
    } finally {
      rec.stop();
    }
    const count = readdirSync(join(dataDir, 'samples')).map((f) => readFileSync(join(dataDir, 'samples', f), 'utf8')).join('').length;
    await new Promise((r) => setTimeout(r, 80));
    expect(readdirSync(join(dataDir, 'samples')).map((f) => readFileSync(join(dataDir, 'samples', f), 'utf8')).join('').length).toBe(count);
  });
});

describe('保留期刪檔（AC2）', () => {
  const seed = (dir: string, names: string[]) => {
    mkdirSync(join(dir, 'samples'), { recursive: true });
    for (const n of names) writeFileSync(join(dir, 'samples', n), '');
  };

  it('啟動時刪早於「今天 − retentionDays」的 YYYY-MM-DD.jsonl，其他檔名不碰', () => {
    const r = rig();
    // 今天 2026-09-20，保留 30 天 → 最早留 2026-08-21
    const keep = ['2026-08-21.jsonl', '2026-09-20.jsonl', '2026-09-21.jsonl', 'notes.txt', '2026-8-01.jsonl', '2026-08-01.jsonl.bak', 'x2026-08-01.jsonl'];
    seed(r.dataDir, [...keep, '2026-08-20.jsonl', '2025-12-31.jsonl']);
    r.rec.start();
    r.rec.stop();
    expect(readdirSync(join(r.dataDir, 'samples')).sort()).toEqual([...keep].sort());
  });

  it('每天第一次寫入前也刪一次', () => {
    const r = rig();
    r.rec.start();
    r.rec.stop();
    r.rec.tick();
    seed(r.dataDir, ['2026-08-01.jsonl', '2026-08-21.jsonl']);
    r.clock.now += MIN;
    r.set(doc([agent({ cost: 3 })]));
    r.rec.tick();
    expect(existsSync(join(r.dataDir, 'samples/2026-08-01.jsonl'))).toBe(true); // 同一天不再刪
    r.clock.now = new Date(2026, 8, 21, 0, 1).getTime();
    r.set(doc([agent({ cost: 4 })]));
    r.rec.tick();
    expect(existsSync(join(r.dataDir, 'samples/2026-08-01.jsonl'))).toBe(false);
    // 9/21 的保留下限是 8/22
    expect(existsSync(join(r.dataDir, 'samples/2026-08-21.jsonl'))).toBe(false);
    expect(existsSync(join(r.dataDir, 'samples/2026-09-21.jsonl'))).toBe(true);
  });

  it('資料目錄不存在時 start 不報錯', () => {
    const r = rig();
    r.rec.start();
    r.rec.stop();
    expect(existsSync(r.dataDir)).toBe(false);
  });
});

describe('SampleStore 讀取健壯（AC2）', () => {
  it('目錄不存在、samples 為空都回空資料', async () => {
    const dir = join(tmp('dash-data-'), 'none');
    expect((await new SampleStore(dir).read())).toEqual({ samples: [], skipped: 0 });
    mkdirSync(join(dir, 'samples'), { recursive: true });
    expect((await new SampleStore(dir).read())).toEqual({ samples: [], skipped: 0 });
  });

  it('壞行（非 JSON、缺欄位、型別不對）略過並計數；空行不算；只讀 YYYY-MM-DD.jsonl', async () => {
    const dir = tmp('dash-data-');
    mkdirSync(join(dir, 'samples'));
    const good: UsageSample = { ts: T0, paneId: 'p', agent: null, project: null, taskDir: null, member: null, status: 'idle', cost: null, ctxPct: null, usage5hPct: null, usageWkPct: null };
    const { ctxPct: _, ...missing } = good;
    writeFileSync(
      join(dir, 'samples/2026-09-20.jsonl'),
      [JSON.stringify(good), '{not json', '', JSON.stringify(missing), JSON.stringify({ ...good, ts: 'x' }), JSON.stringify({ ...good, status: 'weird' }), '42', JSON.stringify({ ...good, ts: T0 + 1 })].join('\n') + '\n',
    );
    writeFileSync(join(dir, 'samples/notes.jsonl'), '{bad\n');
    const r = (await new SampleStore(dir).read());
    expect(r.samples.map((x) => x.ts)).toEqual([T0, T0 + 1]);
    expect(r.skipped).toBe(5);
  });

  it('舊格式樣本（沒有 model／effort）照常讀進來、視為 null、不計入 skipped；型別不對仍算壞行（modelcost AC1）', async () => {
    const dir = tmp('dash-data-');
    mkdirSync(join(dir, 'samples'));
    const old = { ts: T0, paneId: 'p', agent: 'claude', project: null, taskDir: null, member: null, status: 'idle', cost: 1, ctxPct: null, usage5hPct: null, usageWkPct: null };
    writeFileSync(
      join(dir, 'samples/2026-09-20.jsonl'),
      [old, { ...old, ts: T0 + 1, model: 'opus 5.5', effort: 'low' }, { ...old, ts: T0 + 2, model: null, effort: null }, { ...old, ts: T0 + 3, model: 5 }].map((x) => JSON.stringify(x)).join('\n') + '\n',
    );
    const r = await new SampleStore(dir).read();
    expect(r.skipped).toBe(1);
    expect(r.samples.map((x) => [x.ts, x.model, x.effort])).toEqual([
      [T0, null, null],
      [T0 + 1, 'opus 5.5', 'low'],
      [T0 + 2, null, null],
    ]);
  });

  it('單檔大量樣本（25 萬行）不因展開參數撐爆堆疊', async () => {
    const dir = tmp('dash-data-');
    mkdirSync(join(dir, 'samples'));
    const line = JSON.stringify({ ts: T0, paneId: 'p', agent: null, project: null, taskDir: null, member: null, status: 'idle', cost: null, ctxPct: null, usage5hPct: null, usageWkPct: null });
    writeFileSync(join(dir, 'samples/2026-09-20.jsonl'), (line + '\n').repeat(250_000));
    const r = (await new SampleStore(dir).read());
    expect(r.samples.length).toBe(250_000);
    expect(r.skipped).toBe(0);
  }, 30_000);

  it('檔案變動後重讀（快取依 size／mtime）', async () => {
    const dir = tmp('dash-data-');
    mkdirSync(join(dir, 'samples'));
    const f = join(dir, 'samples/2026-09-20.jsonl');
    const row = (ts: number) => JSON.stringify({ ts, paneId: 'p', agent: null, project: null, taskDir: null, member: null, status: 'idle', cost: null, ctxPct: null, usage5hPct: null, usageWkPct: null }) + '\n';
    writeFileSync(f, row(1));
    const store = new SampleStore(dir);
    expect((await store.read()).samples).toHaveLength(1);
    writeFileSync(f, row(1) + row(2));
    expect((await store.read()).samples).toHaveLength(2);
  });
});

describe('冷啟動預熱（debt AC7）', () => {
  const NOW = new Date(2026, 8, 26, 15, 30).getTime();
  const made: DashServer[] = [];
  afterEach(() => made.splice(0).forEach((x) => x.stop()));

  function counted(readText?: (p: string) => Promise<string>) {
    const dataDir = tmp('dash-data-');
    mkdirSync(join(dataDir, 'samples'));
    const f = makeSampleFixture(NOW);
    for (const [day, rows] of Object.entries(f)) writeFileSync(join(dataDir, 'samples', `${day}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
    const reads: string[] = [];
    const s = createDashServer({
      config: { projects: [], pollMs: 60_000 },
      herdr: { bin: '/nonexistent', socket: '/nonexistent', off: true },
      usage: {
        dataDir,
        sampleMs: 3_600_000,
        retentionDays: 30,
        now: () => NOW,
        readText: (p) => {
          reads.push(p);
          return readText ? readText(p) : Promise.resolve(readFileSync(p, 'utf8'));
        },
      },
    });
    made.push(s);
    return { s, reads, files: Object.keys(f).length };
  }

  it('預熱完成後第一次 /api/costs?range=all 不再讀檔，結果與直接算相同', async () => {
    const cold = counted();
    const direct = (await (await cold.s.app.request('/api/costs?range=all')).json()) as CostsResponse;
    const { s, reads, files } = counted();
    await s.warm();
    expect(reads).toHaveLength(files);
    const res = await s.app.request('/api/costs?range=all');
    expect(await res.json()).toEqual(direct);
    expect(reads).toHaveLength(files);
  });

  it('預熱中收到的 /api/trends、/api/costs 共用同一輪讀檔', async () => {
    const { s, reads, files } = counted();
    const warming = s.warm();
    const [a, b] = await Promise.all([s.app.request('/api/trends?range=24h'), s.app.request('/api/costs?range=all'), warming]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(reads).toHaveLength(files);
  });

  it('樣本檔變動後 /api/costs?range=all 反映新資料（彙總快取會失效）', async () => {
    const { s, reads, files } = counted();
    await s.warm();
    const before = (await (await s.app.request('/api/costs?range=all')).json()) as CostsResponse;
    const dataDir = reads[0].replace(/\/samples\/.*$/, '');
    const day = readdirSync(join(dataDir, 'samples')).sort().at(-1)!;
    const last = readFileSync(join(dataDir, 'samples', day), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as UsageSample).at(-1)!;
    writeFileSync(join(dataDir, 'samples', day), readFileSync(join(dataDir, 'samples', day), 'utf8') + JSON.stringify({ ...last, ts: last.ts + 1000, cost: (last.cost ?? 0) + 7 }) + '\n');
    const after = (await (await s.app.request('/api/costs?range=all')).json()) as CostsResponse;
    expect(reads).toHaveLength(files + 1);
    const total = (c: CostsResponse) => c.tasks.reduce((m, t) => m + t.cost, 0) + c.unattributed;
    expect(total(after) - total(before)).toBeCloseTo(7);
  });

  it('快取命中時 to 上界跟著當下 now：兩次請求之間的樣本算進去，未來的仍排除（debt AC19）', async () => {
    const dataDir = tmp('dash-data-');
    mkdirSync(join(dataDir, 'samples'));
    const t = (min: number) => NOW + min * MIN;
    const row = (ts: number, cost: number) =>
      JSON.stringify({ ts, paneId: 'p', agent: 'claude', project: 'x', taskDir: '2026-09-26-a', member: 'backend', status: 'working', cost, ctxPct: null, usage5hPct: null, usageWkPct: null });
    writeFileSync(join(dataDir, 'samples', `${localDay(NOW)}.jsonl`), [row(t(0), 1), row(t(10), 3), row(t(20), 8), row(t(30), 20)].join('\n') + '\n');
    const server = (now: () => number) => {
      const s = createDashServer({
        config: { projects: [], pollMs: 60_000 },
        herdr: { bin: '/nonexistent', socket: '/nonexistent', off: true },
        usage: { dataDir, sampleMs: 3_600_000, retentionDays: 30, now },
      });
      made.push(s);
      return s;
    };
    const costs = async (s: DashServer) => (await (await s.app.request('/api/costs?range=all')).json()) as CostsResponse;
    let clock = t(15);
    const s = server(() => clock);
    const first = await costs(s);
    clock = t(25);
    const second = await costs(s);
    const fresh = await costs(server(() => t(25)));
    expect(second).toEqual(fresh);
    expect(second.tasks[0].cost).toBeGreaterThan(first.tasks[0].cost);
    expect(second.to).toBe(t(25));
  });

  it('預熱失敗只記 log，不丟例外', async () => {
    const { s } = counted(() => Promise.reject(new Error('disk on fire')));
    await expect(s.warm()).resolves.toBeUndefined();
  });
});

describe('GET /api/trends、/api/costs（AC4）', () => {
  // 固定在當天 15:30：fixture 兩天的中午錨點都在過去
  const NOW = new Date(2026, 8, 26, 15, 30).getTime();
  let s: DashServer | null = null;
  afterEach(() => {
    s?.stop();
    s = null;
  });

  function withFixture(extra: Record<string, UsageSample[]> = {}) {
    const dataDir = tmp('dash-data-');
    mkdirSync(join(dataDir, 'samples'));
    const f = makeSampleFixture(NOW);
    for (const [day, rows] of Object.entries({ ...f, ...extra })) writeFileSync(join(dataDir, 'samples', `${day}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
    s = createDashServer({
      config: { projects: [], pollMs: 60_000 },
      herdr: { bin: '/nonexistent', socket: '/nonexistent', off: true },
      usage: { dataDir, sampleMs: 3_600_000, retentionDays: 30, now: () => NOW },
    });
    return { dataDir, app: s.app };
  }

  const get = async <T>(app: DashServer['app'], path: string) => {
    const res = await app.request(path);
    return { status: res.status, body: (await res.json()) as T };
  };

  it('range 預設 24h；不合法值回 400 bad-request；trends 不接受 all', async () => {
    const { app } = withFixture();
    expect((await get<TrendsResponse>(app, '/api/trends')).body.range).toBe('24h');
    expect((await get<CostsResponse>(app, '/api/costs')).body.range).toBe('24h');
    for (const bad of ['/api/trends?range=all', '/api/trends?range=1y', '/api/trends?range=', '/api/costs?range=bogus', '/api/costs?range=24H']) {
      const r = await get<{ error: { kind: string; message: string } }>(app, bad);
      expect(r.status, bad).toBe(400);
      expect(r.body.error.kind).toBe('bad-request');
      expect(r.body.error.message).toBeTruthy();
    }
  });

  it('只有 GET', async () => {
    const { app } = withFixture();
    for (const p of ['/api/trends', '/api/costs']) {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) expect((await app.request(p, { method })).status).toBe(404);
    }
  });

  it('trends：bucket 對照表、空 bucket 不出點、dataDir、from／to', async () => {
    const { app, dataDir } = withFixture();
    for (const range of ['6h', '24h', '7d', '30d'] as const) {
      const { body } = await get<TrendsResponse>(app, `/api/trends?range=${range}`);
      expect(body.bucketMs).toBe(BUCKET_MS[range]);
      expect(body.to).toBe(NOW);
      expect(body.generatedAt).toBe(NOW);
      expect(body.dataDir).toBe(dataDir);
      expect(body.skipped).toBe(0);
      for (const pts of Object.values(body.usage)) {
        for (const p of pts) {
          expect(p.t % body.bucketMs).toBe(0);
          expect(p.t + body.bucketMs).toBeGreaterThan(body.from);
          expect(p.t).toBeLessThanOrEqual(body.to);
        }
        expect(new Set(pts.map((p) => p.t)).size).toBe(pts.length);
      }
    }
    const h6 = (await get<TrendsResponse>(app, '/api/trends?range=6h')).body;
    expect(h6.from).toBe(NOW - 6 * HOUR);
    // 今天 12:00–13:50 每 10 分鐘一輪 → 5 分鐘 bucket 只有 12 個有點（中間空 bucket 不出點）
    expect(h6.usage.claude).toHaveLength(12);
    expect(h6.usage.claude[0]).toEqual({ t: new Date(2026, 8, 26, 12).getTime(), fiveHourPct: 10, weekPct: 40 });
    expect(h6.ctx.map((c) => c.label)).toEqual(['backend', 'codex', 'codex', 'frontend-shell']);
    expect(Object.keys(h6.projection).sort()).toEqual(['claude', 'codex']);
    const d7 = (await get<TrendsResponse>(app, '/api/trends?range=7d')).body;
    expect(d7.costByDay).toEqual([
      { day: '2026-09-25', project: 'teamflow', cost: 12.25 },
      { day: '2026-09-25', project: null, cost: 5.5 },
      { day: '2026-09-26', project: 'teamflow', cost: 12.25 },
      { day: '2026-09-26', project: null, cost: 5.5 },
    ]);
    expect(d7.costByKind).toEqual({ claude: 19, codex: 16.5 });
  });

  it('costs：先全保留期算差額再篩，兩條恆等式成立', async () => {
    const { app } = withFixture();
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    for (const range of ['6h', '24h', '7d', '30d', 'all']) {
      const { body } = await get<CostsResponse>(app, `/api/costs?range=${range}`);
      expect(body.range).toBe(range);
      for (const t of body.tasks) expect(t.cost).toBeCloseTo(sum(Object.values(t.members)) + t.unmatched, 9);
      expect(sum(body.tasks.map((t) => t.cost)) + body.unattributed).toBeCloseTo(sum(Object.values(body.byRole)) + body.unknownRole, 9);
    }
    const all = (await get<CostsResponse>(app, '/api/costs?range=all')).body;
    expect(all.from).toBe(new Date(2026, 8, 25, 12).getTime());
    expect(all.tasks.map((t) => [t.taskDir, t.cost])).toEqual([
      ['2026-09-24-bklog', 13],
      ['2026-09-23-ops', 11.5],
    ]);
    // 6h 窗從 09:30 起：今天 12:00 那輪是每個 pane 在窗內的第一筆，但它跟昨天 13:50 是不同 pane，故今天一天的花費全數算進
    const h6 = (await get<CostsResponse>(app, '/api/costs?range=6h')).body;
    expect(sum(h6.tasks.map((t) => t.cost)) + h6.unattributed).toBe(17.75);
  });

  it('窗內第一筆的差額以窗外的前一筆為基準', async () => {
    const before: UsageSample = { ts: NOW - 7 * HOUR, paneId: 'wZ:p9', agent: 'claude', project: 'teamflow', taskDir: 'x', member: 'qa', status: 'working', cost: 10, ctxPct: 1, usage5hPct: 1, usageWkPct: 1 };
    // 窗外那筆放在另一個檔，窗內那筆 append 到今天的檔：跨檔也要接得起來
    const { app, dataDir } = withFixture({ '2026-09-24': [before] });
    writeFileSync(join(dataDir, 'samples/2026-09-26.jsonl'), JSON.stringify({ ...before, ts: NOW - HOUR, cost: 12.5 }) + '\n', { flag: 'a' });
    const h6 = (await get<CostsResponse>(app, '/api/costs?range=6h')).body;
    expect(h6.tasks.find((t) => t.taskDir === 'x')).toMatchObject({ project: 'teamflow', taskDir: 'x', cost: 2.5, members: { qa: 2.5 }, unmatched: 0 });
  });

  it('壞行計入 skipped；沒有樣本回空資料', async () => {
    const dataDir = tmp('dash-data-');
    s = createDashServer({
      config: { projects: [], pollMs: 60_000 },
      herdr: { bin: '/nonexistent', socket: '/nonexistent', off: true },
      usage: { dataDir, sampleMs: 3_600_000, retentionDays: 30, now: () => NOW },
    });
    const empty = (await get<TrendsResponse>(s.app, '/api/trends')).body;
    expect(empty).toMatchObject({ skipped: 0, usage: {}, projection: {}, ctx: [], costByDay: [], costByKind: {} });
    const c0 = (await get<CostsResponse>(s.app, '/api/costs?range=all')).body;
    expect(c0).toMatchObject({ skipped: 0, tasks: [], byRole: {}, unknownRole: 0, unattributed: 0, from: NOW, to: NOW });
    mkdirSync(join(dataDir, 'samples'));
    writeFileSync(join(dataDir, 'samples/2026-09-26.jsonl'), '{bad\n{"ts":1}\n');
    expect((await get<TrendsResponse>(s.app, '/api/trends')).body.skipped).toBe(2);
    expect((await get<CostsResponse>(s.app, '/api/costs')).body.skipped).toBe(2);
  });

  it('ctx label：member 為 null 且 herdr 查不到名字時退回 agent', async () => {
    const { app } = withFixture();
    const h6 = (await get<TrendsResponse>(app, '/api/trends?range=6h')).body;
    expect(h6.ctx.find((c) => c.paneId === 'wF0:p3')?.label).toBe('codex');
  });
});

describe('接上真的 HerdrBridge（整合）', () => {
  it('herdr 可用時依 sampleMs 取樣落地；herdr off（down）時不寫', async () => {
    const dir = tmp('dash-herdr-');
    const snap = join(dir, 'snap.json');
    writeFileSync(
      snap,
      JSON.stringify({
        id: 'x',
        result: {
          type: 'snapshot',
          snapshot: {
            panes: [{ pane_id: 'wX:p1', tab_id: 'wX:t1', workspace_id: 'wX', agent: 'claude', agent_status: 'working', cwd: '/nowhere', tokens: { cost: '$1.25', ctx_num: '12', usage_session_num: '9', usage_period_num: '48' } }],
            agents: [{ pane_id: 'wX:p1', name: 'solo' }],
          },
        },
      }),
    );
    const bin = script(join(dir, 'herdr'), `cat ${snap}`);
    const clock = { now: T0 };
    const upDir = tmp('dash-data-');
    const up = createDashServer({
      config: { projects: [], pollMs: 60_000 },
      herdr: { bin, socket: '/nonexistent', off: false, pollMs: 20 },
      usage: { dataDir: upDir, sampleMs: 20, retentionDays: 30, now: () => clock.now },
    });
    const downDir = tmp('dash-data-');
    const down = createDashServer({
      config: { projects: [], pollMs: 60_000 },
      herdr: { bin, socket: '/nonexistent', off: true },
      usage: { dataDir: downDir, sampleMs: 20, retentionDays: 30, now: () => clock.now },
    });
    up.start();
    down.start();
    try {
      const rows = await waitFor(() => lines(upDir, localDay(T0)).length > 0 && lines(upDir, localDay(T0)), 10_000);
      expect(rows[0]).toEqual({ ts: T0, paneId: 'wX:p1', agent: 'claude', project: null, taskDir: null, member: null, status: 'working', cost: 1.25, ctxPct: 12, usage5hPct: 9, usageWkPct: 48, model: null, effort: null });
      // 時鐘不動、值不變 → 之後的取樣都被去重
      await new Promise((r) => setTimeout(r, 100));
      expect(lines(upDir, localDay(T0))).toHaveLength(1);
      // member 為 null 時 ctx 圖例用 herdr 目前的註冊名
      const t = (await (await up.app.request('/api/trends?range=24h')).json()) as TrendsResponse;
      expect(t.ctx.map((c) => c.label)).toEqual(['solo']);
    } finally {
      up.stop();
      down.stop();
    }
    expect(existsSync(join(downDir, 'samples'))).toBe(false);
  });
});
