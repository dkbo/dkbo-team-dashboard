// TrendsService 的差額快取：舊日檔不重算，結果與一次全算相同
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { spendDeltas, type SpendEntry, type UsageSample } from '@dash/shared';
import { DeltaCache } from '../src/trends.ts';
import { SampleStore } from '../src/usage.ts';
import { tmp } from './helpers.ts';

const MIN = 60_000;
const T0 = new Date(2026, 8, 20, 10).getTime();
const DAY = 24 * 60 * MIN;

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
const jsonl = (xs: UsageSample[]) => xs.map((x) => JSON.stringify(x) + '\n').join('');
const byKey = (e: SpendEntry[]) => [...e].sort((p, q) => p.ts - q.ts || (p.paneId < q.paneId ? -1 : 1));

function seed() {
  const dir = tmp('dash-data-');
  mkdirSync(join(dir, 'samples'));
  const f = (d: number) => join(dir, 'samples', `2026-09-${20 + d}.jsonl`);
  writeFileSync(f(0), jsonl([s({ ts: T0, cost: 1 }), s({ ts: T0 + MIN, cost: 2 }), s({ ts: T0, paneId: 'w:p2', cost: 4 })]));
  writeFileSync(f(1), jsonl([s({ ts: T0 + DAY, cost: 0.5 }), s({ ts: T0 + DAY, paneId: 'w:p2', cost: 6, taskDir: 'task-b' })]));
  writeFileSync(f(2), jsonl([s({ ts: T0 + 2 * DAY, cost: 3 })]));
  return { dir, f };
}

describe('DeltaCache', () => {
  it('結果等於一次全算；只有變動的檔（及其後）重算', async () => {
    const { dir, f } = seed();
    const store = new SampleStore(dir);
    const cache = new DeltaCache();
    const full = async () => byKey(spendDeltas((await store.read()).samples));
    expect(byKey(cache.deltas((await store.files()).files))).toEqual(await full());
    expect(cache.recomputed).toBe(3);
    expect(byKey(cache.deltas((await store.files()).files))).toEqual(await full());
    expect(cache.recomputed).toBe(0);
    appendFileSync(f(2), jsonl([s({ ts: T0 + 2 * DAY + MIN, cost: 5 })]));
    expect(byKey(cache.deltas((await store.files()).files))).toEqual(await full());
    expect(cache.recomputed).toBe(1);
    appendFileSync(f(1), jsonl([s({ ts: T0 + DAY + MIN, cost: 0.75 })]));
    expect(byKey(cache.deltas((await store.files()).files))).toEqual(await full());
    expect(cache.recomputed).toBe(2);
  });

  it('檔案間時間交錯時退回一次全算，結果仍相同', async () => {
    const { dir, f } = seed();
    appendFileSync(f(1), jsonl([s({ ts: T0 + 30 * 1000, cost: 9 })])); // 放錯檔：比前一檔的最後一筆還早
    const store = new SampleStore(dir);
    const cache = new DeltaCache();
    expect(byKey(cache.deltas((await store.files()).files))).toEqual(byKey(spendDeltas((await store.read()).samples)));
  });

  it('刪掉最舊的檔（保留期）後重算', async () => {
    const { dir } = seed();
    const store = new SampleStore(dir);
    const cache = new DeltaCache();
    cache.deltas((await store.files()).files);
    const files = (await store.files()).files.slice(1);
    expect(byKey(cache.deltas(files))).toEqual(byKey(spendDeltas(files.flatMap((x) => x.samples))));
  });
});
