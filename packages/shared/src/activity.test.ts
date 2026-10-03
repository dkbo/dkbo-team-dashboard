import { describe, expect, it } from 'vitest';
import { activityDetailDusk, activityDetailGlow, activityNowTs, activityTasks } from '../fixtures/index.ts';
import { ACTIVITY_EVENT_KINDS, ACTIVITY_MESSAGE_TYPES, activityFeed, tsToEpochMs, type ActivityTask } from './activity.ts';
import type { TaskDetail, TaskEvent, TaskMessage } from './dkstatus.ts';

// 預期的 at 一律用 tsToEpochMs 算，結果不依跑測機器的時區而變
const at = (ts: string) => tsToEpochMs(ts)!;
const NOW = at(activityNowTs);
const feed = (tasks: ActivityTask[], limit = 200, now = NOW) => activityFeed(tasks, { now, limit });

const glow = activityDetailGlow.task;
const task = (over: Partial<TaskDetail>): TaskDetail => ({ ...glow, events: [], messages: [], ...over });
const ev = (ts: string, text: string): TaskEvent => ({ ts, kind: text.split(/\s+/)[0].replace(/:$/, ''), text });
const msg = (ts: string, type: string, from = 'glow-dev', text = `${type} 內文`): TaskMessage => ({ ts, from, to: 'leader-glow', type, text });

describe('tsToEpochMs', () => {
  it('本地時間 YYYY-MM-DDTHH:MM → epoch ms；壞格式與不存在的日期回 null', () => {
    expect(tsToEpochMs('2026-10-03T12:00')).toBe(new Date(2026, 9, 3, 12, 0).getTime());
    expect(at('2026-10-03T12:01') - at('2026-10-03T12:00')).toBe(60_000);
    for (const bad of ['', '2026-10-03', '2026-10-03 12:00', '2026-13-01T00:00', '2026-02-30T00:00', '2026-10-03T24:00', '2026-10-03T12:60', 'x'])
      expect(tsToEpochMs(bad), bad).toBeNull();
    expect(tsToEpochMs(null)).toBeNull();
    expect(tsToEpochMs(undefined)).toBeNull();
  });
});

describe('activityFeed：收錄與略過', () => {
  it('收錄清單是 brief 規定的 12 種 event、9 種 message', () => {
    expect([...ACTIVITY_EVENT_KINDS].sort()).toEqual(
      ['task-new', 'gate1', 'brief-review', 'spawn', 'wave-open', 'dev-done', 'review', 'ruling', 'timeout', 'wave-close', 'gate3', 'task-close'].sort(),
    );
    expect([...ACTIVITY_MESSAGE_TYPES].sort()).toEqual(['DONE', 'ESCALATE', 'BUG', 'FIXED', 'BLOCKED', 'LIMIT', 'TIMEOUT', 'DECISION', 'STOP'].sort());
  });

  it('fixture：每種收錄 event 各一，minor／commit／watch 略過', () => {
    const types = feed([{ project: 'demo', detail: glow }]).filter((i) => i.source === 'event').map((i) => i.type);
    expect([...types].sort()).toEqual([...ACTIVITY_EVENT_KINDS].sort());
  });

  it('fixture：收錄的 message 種類都在，ACK／QUESTION／UNDELIVERED／TASK 略過', () => {
    const types = feed([{ project: 'demo', detail: glow }]).filter((i) => i.source === 'message').map((i) => i.type);
    expect(new Set(types)).toEqual(new Set(ACTIVITY_MESSAGE_TYPES));
    expect(types.filter((t) => t === 'DONE')).toHaveLength(2);
  });

  it('清單外的 event 一律略過（含未來新 kind）', () => {
    const skipped = ['minor', 'commit', 'watch', 'events', 'handoff', 'materialize', 'pane-close', 'wave-refresh', 'wave', 'note', 'tab', 'future-kind'];
    const t = task({ events: skipped.map((k, i) => ev(`2026-10-03T10:${String(i).padStart(2, '0')}`, `${k} x`)) });
    expect(feed([{ project: 'p', detail: t }])).toEqual([]);
  });

  it('清單外的 message 一律略過（ACK、UNDELIVERED、TASK、QUESTION、ANSWER、未知）', () => {
    const t = task({ messages: ['ACK', 'UNDELIVERED', 'TASK', 'QUESTION', 'ANSWER', 'done', 'WHATEVER'].map((ty) => msg('2026-10-03T10:00', ty)) });
    expect(feed([{ project: 'p', detail: t }])).toEqual([]);
  });

  it('每種收錄 event／message 單獨餵都收', () => {
    for (const k of ACTIVITY_EVENT_KINDS) expect(feed([{ project: 'p', detail: task({ events: [ev('2026-10-03T10:00', `${k} x`)] }) }]), k).toHaveLength(1);
    for (const ty of ACTIVITY_MESSAGE_TYPES) expect(feed([{ project: 'p', detail: task({ messages: [msg('2026-10-03T10:00', ty)] }) }]), ty).toHaveLength(1);
  });
});

describe('activityFeed：欄位', () => {
  it('message 的 actor 是 from、event 的 actor 是 null；其他欄位照抄', () => {
    const t = task({ events: [ev('2026-10-03T10:00', 'wave-open 1 base abc')], messages: [msg('2026-10-03T10:01', 'DONE', 'glow-backend', '完成')] });
    expect(feed([{ project: 'demo', detail: t }])).toEqual([
      { project: 'demo', taskDir: glow.dir, taskShort: 'glow', ts: '2026-10-03T10:01', at: at('2026-10-03T10:01'), source: 'message', type: 'DONE', actor: 'glow-backend', text: '完成' },
      { project: 'demo', taskDir: glow.dir, taskShort: 'glow', ts: '2026-10-03T10:00', at: at('2026-10-03T10:00'), source: 'event', type: 'wave-open', actor: null, text: 'wave-open 1 base abc' },
    ]);
  });

  it('ts 轉不了的項目略過', () => {
    const t = task({
      events: [ev('2026-10-03 10:00', 'gate1 approved'), ev('', 'gate3 approved'), ev('2026-10-03T10:00', 'spawn x')],
      messages: [msg('bad', 'DONE'), msg('2026-02-30T10:00', 'BUG'), msg('2026-10-03T10:01', 'FIXED')],
    });
    expect(feed([{ project: 'p', detail: t }]).map((i) => i.type)).toEqual(['FIXED', 'spawn']);
  });

  it('text 超過 300 字元截斷成 300 字元加 …；剛好 300 原樣；以字元（code point）計', () => {
    const t = task({
      messages: [
        msg('2026-10-03T10:03', 'DONE', 'a', '字'.repeat(301)),
        msg('2026-10-03T10:02', 'DONE', 'a', 'x'.repeat(300)),
        msg('2026-10-03T10:01', 'DONE', 'a', '🍵'.repeat(301)),
      ],
    });
    const [a, b, c] = feed([{ project: 'p', detail: t }]).map((i) => i.text);
    expect(a).toBe('字'.repeat(300) + '…');
    expect(b).toBe('x'.repeat(300));
    expect(c).toBe('🍵'.repeat(300) + '…');
  });
});

describe('activityFeed：排序與 limit', () => {
  it('at 降冪；同分鐘同任務 message 先於 event；同 source 原檔較後的行在前', () => {
    const t = task({
      events: [ev('2026-10-03T10:50', 'dev-done wave 1'), ev('2026-10-03T10:50', 'review 1 spawned'), ev('2026-10-03T11:00', 'gate3 approved')],
      messages: [msg('2026-10-03T10:50', 'DONE', 'glow-a'), msg('2026-10-03T10:50', 'DONE', 'glow-b'), msg('2026-10-03T09:00', 'BUG')],
    });
    expect(feed([{ project: 'p', detail: t }]).map((i) => `${i.ts.slice(11)} ${i.type} ${i.actor ?? i.text}`)).toEqual([
      '11:00 gate3 gate3 approved',
      '10:50 DONE glow-b',
      '10:50 DONE glow-a',
      '10:50 review review 1 spawned',
      '10:50 dev-done dev-done wave 1',
      '09:00 BUG glow-dev',
    ]);
  });

  it('同 at 不同任務依 project、taskDir 升冪，與輸入順序無關', () => {
    const mk = (dir: string) => task({ dir, short: dir.slice(11), events: [ev('2026-10-03T10:00', 'gate1 approved')] });
    const tasks: ActivityTask[] = [
      { project: 'zeta', detail: mk('2026-10-01-aaa') },
      { project: 'alpha', detail: mk('2026-10-02-bbb') },
      { project: 'alpha', detail: mk('2026-10-01-ccc') },
    ];
    const want = ['alpha 2026-10-01-ccc', 'alpha 2026-10-02-bbb', 'zeta 2026-10-01-aaa'];
    expect(feed(tasks).map((i) => `${i.project} ${i.taskDir}`)).toEqual(want);
    expect(feed([...tasks].reverse()).map((i) => `${i.project} ${i.taskDir}`)).toEqual(want);
  });

  it('取前 limit 筆', () => {
    const all = feed(activityTasks);
    expect(feed(activityTasks, 3)).toEqual(all.slice(0, 3));
    expect(feed(activityTasks, 1)).toHaveLength(1);
    expect(feed(activityTasks, 1000)).toEqual(all);
  });

  it('fixture 前 5 筆（固定 now）', () => {
    expect(feed(activityTasks, 5).map((i) => [i.ts.slice(11), i.type, i.actor])).toEqual([
      ['11:50', 'STOP', 'leader-glow'],
      ['11:46', 'TIMEOUT', 'dk-watch'],
      ['11:45', 'LIMIT', 'dk-watch'],
      ['11:40', 'BLOCKED', 'dk-watch'],
      ['11:30', 'task-close', null],
    ]);
  });
});

describe('activityFeed：來源任務', () => {
  it('進行中（running／planning）不論多久都收；unknown 不收', () => {
    const old = (status: TaskDetail['status']) => task({ status, events: [ev('2026-01-01T10:00', 'gate1 approved')] });
    expect(feed([{ project: 'p', detail: old('running') }])).toHaveLength(1);
    expect(feed([{ project: 'p', detail: old('planning') }])).toHaveLength(1);
    expect(feed([{ project: 'p', detail: old('unknown') }])).toEqual([]);
  });

  it('已結案：closed_at 在 now−24h 之內才收（含邊界），之外、缺或壞都不收', () => {
    const dusk = activityDetailDusk.task;
    const closed = (closed_at: string | null, status: TaskDetail['status'] = 'done') => [{ project: 'p', detail: { ...dusk, status, closed_at } }];
    expect(feed(closed(dusk.closed_at)).length).toBeGreaterThan(0);
    expect(feed(closed('2026-10-02T12:00')).length).toBeGreaterThan(0); // 剛好 24h
    expect(feed(closed('2026-10-02T11:59'))).toEqual([]);
    expect(feed(closed('2026-10-02T12:00', 'abandoned')).length).toBeGreaterThan(0);
    expect(feed(closed(null))).toEqual([]);
    expect(feed(closed('壞'))).toEqual([]);
    // 同一份 fixture，now 往後推 25 小時就整個不收
    expect(feed(closed(dusk.closed_at), 200, NOW + 25 * 3600_000)).toEqual([]);
  });

  it('fixture：兩個任務都收，dusk 的 ACK 略過', () => {
    const items = feed(activityTasks);
    expect(new Set(items.map((i) => i.taskDir))).toEqual(new Set([glow.dir, activityDetailDusk.task.dir]));
    expect(items.filter((i) => i.taskShort === 'dusk').map((i) => i.type)).toEqual(['task-close', 'wave-close', 'DONE', 'wave-open', 'task-new']);
  });
});
