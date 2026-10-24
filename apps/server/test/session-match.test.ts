import { describe, expect, it } from 'vitest';
import { matchPanes, type MatchPane, type MatchSession } from '../src/session-match.ts';

const P = (paneId: string, o: Partial<MatchPane> = {}): MatchPane => ({ paneId, kind: 'codex', cwd: '/w', sessionId: null, firstSeen: null, ...o });
const S = (sessionId: string, o: Partial<MatchSession> = {}): MatchSession => ({ sessionId, kind: 'codex', cwd: '/w', startedAt: 0, updatedAt: 0, ...o });
const obj = (m: Map<string, string>) => Object.fromEntries(m);

describe('pane ↔ session 對應', () => {
  it('herdr 給 session id 時直接對同 id', () => {
    const m = matchPanes([P('p1', { kind: 'claude', sessionId: 'a' })], [S('a', { kind: 'claude', updatedAt: 1 }), S('b', { kind: 'claude', updatedAt: 9 })]);
    expect(obj(m)).toEqual({ p1: 'a' });
  });

  it('有 id 但對不到 transcript：不退回猜測', () => {
    expect(obj(matchPanes([P('p1', { kind: 'claude', sessionId: 'zzz' })], [S('b', { kind: 'claude' })]))).toEqual({});
  });

  it('沒 id 時退回同 cwd、同 kind、最近更新；已被 id 對走的 session 不再配', () => {
    const m = matchPanes(
      [P('p1', { kind: 'claude', sessionId: 'new' }), P('p2', { kind: 'claude' })],
      [S('new', { kind: 'claude', updatedAt: 99 }), S('old', { kind: 'claude', updatedAt: 5 }), S('other-cwd', { kind: 'claude', cwd: '/x', updatedAt: 50 }), S('codex', { updatedAt: 70 })],
    );
    expect(obj(m)).toEqual({ p1: 'new', p2: 'old' });
  });

  it('單一 Codex pane 對最近更新的同 cwd session（含幾天前開的）', () => {
    expect(obj(matchPanes([P('p1')], [S('d4', { startedAt: 1, updatedAt: 500 }), S('d1', { startedAt: 300, updatedAt: 400 })]))).toEqual({ p1: 'd4' });
  });

  it('同 cwd 兩個 Codex pane：以 session_meta 時間對 pane 首次出現時間依序配對', () => {
    // 更新時間故意交叉：用「最近更新」會配反
    const m = matchPanes([P('pB', { firstSeen: 2_000_000 }), P('pA', { firstSeen: 1_000_000 })], [S('sA', { startedAt: 1_100_000, updatedAt: 9_000_000 }), S('sB', { startedAt: 2_100_000, updatedAt: 3_000_000 }), S('stale', { startedAt: 10_000, updatedAt: 20_000 })]);
    expect(obj(m)).toEqual({ pA: 'sA', pB: 'sB' });
  });

  it('同 cwd 兩個 Codex pane 首次出現時間都不知道：寧可不配', () => {
    expect(obj(matchPanes([P('p1'), P('p2')], [S('s1', { startedAt: 1, updatedAt: 2 }), S('s2', { startedAt: 3, updatedAt: 4 })]))).toEqual({});
  });

  it('某 pane 的時間窗內有兩個 session（分不出來）：該 pane 不配，其他照配', () => {
    const m = matchPanes([P('pA', { firstSeen: 1_000_000 }), P('pB', { firstSeen: 2_000_000 })], [S('a1', { startedAt: 1_100_000 }), S('a2', { startedAt: 1_500_000 }), S('b1', { startedAt: 2_100_000 })]);
    expect(obj(m)).toEqual({ pB: 'b1' });
  });

  it('一個不知道首次出現時間的 pane＋一個知道的：知道的配窗內、不知道的配窗前最近更新', () => {
    const m = matchPanes([P('old'), P('new', { firstSeen: 5_000_000 })], [S('o1', { startedAt: 100_000, updatedAt: 900_000 }), S('o2', { startedAt: 200_000, updatedAt: 300_000 }), S('n1', { startedAt: 5_100_000, updatedAt: 6_000_000 })]);
    expect(obj(m)).toEqual({ old: 'o1', new: 'n1' });
  });

  it('session 早於 pane 註冊時間數秒（dk-spawn 先 agent start 後記 since）：兩 pane 不錯位', () => {
    const m = matchPanes([P('pA', { firstSeen: 100_000 }), P('pB', { firstSeen: 200_000 })], [S('sA', { startedAt: 98_000, updatedAt: 9 }), S('sB', { startedAt: 198_000, updatedAt: 1 })]);
    expect(obj(m)).toEqual({ pA: 'sA', pB: 'sB' });
  });

  it('容差 30 秒內連開兩個：窗內不唯一就不配，不掛錯人', () => {
    const m = matchPanes([P('pA', { firstSeen: 100_000 }), P('pB', { firstSeen: 110_000 })], [S('sA', { startedAt: 98_000 }), S('sB', { startedAt: 108_000 })]);
    expect(m.get('pA')).not.toBe('sB');
    expect(m.get('pB')).not.toBe('sA');
  });

  it('不知道首次出現時間的 pane 不搶已知 pane 稍早開始的 session', () => {
    const m = matchPanes([P('old'), P('new', { firstSeen: 100_000 })], [S('o1', { startedAt: 1_000, updatedAt: 5 }), S('n1', { startedAt: 98_000, updatedAt: 99 })]);
    expect(obj(m)).toEqual({ old: 'o1', new: 'n1' });
  });

  it('單一 pane 首次出現時間已知：只配 firstSeen−30 秒之後開始的，舊 session 不配', () => {
    expect(obj(matchPanes([P('p1', { firstSeen: 100_000 })], [S('prev', { startedAt: 1_000, updatedAt: 99_000 })]))).toEqual({});
    expect(obj(matchPanes([P('p1', { firstSeen: 100_000 })], [S('prev', { startedAt: 1_000, updatedAt: 99_000 }), S('mine', { startedAt: 97_000, updatedAt: 98_000 })]))).toEqual({ p1: 'mine' });
  });

  it('同一 session 不會對到兩個 pane', () => {
    const m = matchPanes([P('p1', { sessionId: 's1' }), P('p2', { sessionId: 's1' })], [S('s1')]);
    expect([...m.values()].filter((v) => v === 's1')).toHaveLength(1);
  });

  it('非 claude／codex 的 pane 不配', () => {
    expect(obj(matchPanes([P('p1', { kind: null })], [S('s1')]))).toEqual({});
  });
});
