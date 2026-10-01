import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DetailDoc, TaskEvent } from './dkstatus.ts';
import { parseDispatch, type TierConfig } from './dispatch.ts';
import { historyRow, reReviewCount, spanMin, taskTotalMin, tsMinutes, waveTimings } from './timeline.ts';

const fx = (name: string) => new URL(`../fixtures/${name}`, import.meta.url);
const detail = (name: string) => JSON.parse(readFileSync(fx(name), 'utf8')) as DetailDoc;

/** 把 dk-timeline 印的 markdown 表解析成 {階段: [時長, dev, 審查]}；`—` 為 null、`skip` 原樣 */
function parseTimeline(md: string): Map<string, [number | null, number | null, number | string | null]> {
  const rows = new Map<string, [number | null, number | null, number | string | null]>();
  const num = (s: string) => (/^(\d+)m/.test(s) ? Number(s.match(/^(\d+)m/)![1]) : null);
  for (const line of md.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 6 || cells[0] === '階段' || cells[0].startsWith('---')) continue;
    rows.set(cells[0], [num(cells[3]), num(cells[4]), cells[5] === 'skip' ? 'skip' : num(cells[5])]);
  }
  return rows;
}

describe('tsMinutes／spanMin', () => {
  it('跨月跨年相減正確，壞格式回 null', () => {
    expect(spanMin('2026-12-31T23:50', '2027-01-01T00:10')).toBe(20);
    expect(spanMin('2024-02-28T00:00', '2024-03-01T00:00')).toBe(2 * 24 * 60);
    expect(tsMinutes('2026-13-01T00:00')).toBeNull();
    expect(tsMinutes('garbage')).toBeNull();
    expect(spanMin(null, '2026-01-01T00:00')).toBeNull();
  });
});

describe.each([
  ['teamflow-detail-bklog.json', 'teamflow-bklog.timeline.md'],
  ['teamflow-detail-ops.json', 'teamflow-ops.timeline.md'],
])('與 dk-timeline 一致：%s', (detailFile, timelineFile) => {
  const d = detail(detailFile);
  const expected = parseTimeline(readFileSync(fx(timelineFile), 'utf8'));

  it('總耗時（首筆 task-new → 最後 task-close）', () => {
    expect(taskTotalMin(d.task.events)).toBe(expected.get('任務')![0]);
  });

  it('每波總長、dev、審查分鐘數', () => {
    const waves = waveTimings(d.task.events);
    const expectedWaves = [...expected.keys()].filter((k) => k.startsWith('波 '));
    expect(waves.map((w) => `波 ${w.wave}`)).toEqual(expectedWaves);
    for (const w of waves) {
      const [total, dev, review] = expected.get(`波 ${w.wave}`)!;
      expect(w.totalMin).toBe(total);
      expect(w.devMin).toBe(dev);
      expect(w.reviewSkipped ? 'skip' : w.reviewMin).toBe(review);
    }
  });
});

describe('審查複看次數與 skipped', () => {
  const ev = (ts: string, text: string): TaskEvent => ({ ts, kind: text.split(' ')[0].replace(/:$/, ''), text });
  const events: TaskEvent[] = [
    ev('2026-01-01T09:00', 'task-new demo'),
    ev('2026-01-01T09:10', 'wave-open 1 base abc'),
    ev('2026-01-01T09:30', 'dev-done wave 1'),
    ev('2026-01-01T09:31', 'review 1 spawned a'),
    ev('2026-01-01T09:40', 'review 1 verdict a: Important 1'),
    ev('2026-01-01T09:50', 'review 1 verdict a: ok'),
    ev('2026-01-01T09:55', 'review 1 verdict a: ok（複看 2）'),
    ev('2026-01-01T10:00', 'wave-close 1 tests ok (t) 2 agents closed'),
    ev('2026-01-01T10:01', 'wave-open 2'),
    ev('2026-01-01T10:20', 'dev-done wave 2'),
    ev('2026-01-01T10:21', 'review 2 skipped: 文件波'),
    ev('2026-01-01T10:25', 'wave-close 2 tests ok (t) 1 agents closed'),
    ev('2026-01-01T10:30', 'review task verdict a: ok'),
    ev('2026-01-01T10:40', 'task-close merged abc1234'),
  ];

  it('每波 verdict 數減 1（下限 0）加總，不算整枝評議', () => {
    expect(reReviewCount(events)).toBe(2);
  });

  it('skipped 的波審查算 0，並標 reviewSkipped', () => {
    const w2 = waveTimings(events).find((w) => w.wave === 2)!;
    expect(w2.reviewSkipped).toBe(true);
    expect(w2.reviewMin).toBe(0);
    expect(w2.devMin).toBe(19);
  });

  it('缺端點給 null 而不是 0', () => {
    const w = waveTimings([ev('2026-01-01T10:01', 'wave-open 3')])[0];
    expect(w).toMatchObject({ wave: 3, totalMin: null, devMin: null, reviewMin: null, reviewSkipped: false });
  });
});

describe('historyRow', () => {
  it('teamflow bklog 的歷史列', () => {
    const d = detail('teamflow-detail-bklog.json');
    const row = historyRow('teamflow', d.task);
    expect(row).toMatchObject({
      project: 'teamflow',
      dir: '2026-09-24-bklog',
      status: 'done',
      closedAt: '2026-09-24T16:42',
      totalMin: 516,
      waves: 2,
      rulings: 17,
      autonomousRulings: 8,
      minors: 13,
      reReviews: 1,
    });
    expect(row.perWave).toEqual([
      { wave: 1, devMin: 33, reviewMin: 22 },
      { wave: 2, devMin: 15, reviewMin: 6 },
    ]);
  });

  it('dispatch＝parseDispatch(events, short, 專案對照)、repairWaves＝型態為修復的不同波號數（AC4）', () => {
    const config: TierConfig = { roles: { backend: { kind: 'claude', tiers: { S: 'opus/low', M: 'opus/medium' } } }, kinds: {} };
    const ops = detail('teamflow-detail-ops.json');
    const row = historyRow('teamflow', ops.task, config);
    expect(row.repairWaves).toBe(3);
    expect(row.dispatch).toEqual(parseDispatch(ops.task.events, 'ops', config));
    expect(row.dispatch.find((x) => x.member === 'backend-kinds')).toMatchObject({ kind: 'claude', tier: 'M', model: 'opus', effort: 'medium' });
    expect(historyRow('teamflow', detail('teamflow-detail-bklog.json').task).repairWaves).toBe(1);
  });

  it('沒給對照表時 model／effort 為 null，kind、tier 照樣有', () => {
    const row = historyRow('teamflow', detail('teamflow-detail-ops.json').task);
    expect(row.dispatch.length).toBeGreaterThan(0);
    for (const x of row.dispatch) expect([x.model, x.effort, typeof x.kind, typeof x.tier]).toEqual([null, null, 'string', 'string']);
  });
});
