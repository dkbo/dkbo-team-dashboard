import { describe, expect, it } from 'vitest';
import { isClean, layoutGraph, parsePatch, statusCounts, type GitStatus } from './git.ts';

const c = (hash: string, ...parents: string[]) => ({ hash, parents });

describe('layoutGraph', () => {
  it('直線歷史全在第 0 條線', () => {
    const rows = layoutGraph([c('c', 'b'), c('b', 'a'), c('a')]);
    expect(rows.map((r) => r.col)).toEqual([0, 0, 0]);
    expect(rows[0]).toMatchObject({ into: [], out: [0], pass: [], width: 1 });
    expect(rows[1]).toMatchObject({ into: [0], out: [0] });
    expect(rows[2]).toMatchObject({ into: [0], out: [] });
  });

  it('merge commit 開第二條線，分支 commit 走第二條線，最後收回', () => {
    // m 合併 f 進 b；f 的 parent 是 a；b 的 parent 是 a
    const rows = layoutGraph([c('m', 'b', 'f'), c('f', 'a'), c('b', 'a'), c('a')]);
    expect(rows[0]).toMatchObject({ col: 0, out: [0, 1], width: 2 });
    expect(rows[1]).toMatchObject({ col: 1, into: [1], out: [1], pass: [[0, 0]] });
    // b 的 parent a 已在第 1 條線：併過去
    expect(rows[2]).toMatchObject({ col: 0, into: [0], out: [1], pass: [[1, 1]] });
    expect(rows[3]).toMatchObject({ col: 1, into: [1], out: [] });
  });

  it('兩個分支頭共用 parent：第二個頭開新線再併回', () => {
    const rows = layoutGraph([c('x', 'a'), c('y', 'a'), c('a')]);
    expect(rows[0]).toMatchObject({ col: 0, out: [0] });
    expect(rows[1]).toMatchObject({ col: 1, out: [0], pass: [[0, 0]] });
    expect(rows[2]).toMatchObject({ col: 0, into: [0] });
  });

  it('parent 被截掉時線留著，不丟例外', () => {
    const rows = layoutGraph([c('b', 'a')]);
    expect(rows[0]).toMatchObject({ col: 0, out: [0], width: 1 });
  });

  it('空出的線位給之後的新分支用', () => {
    const rows = layoutGraph([c('m', 'b', 'f'), c('f', 'b'), c('b', 'a'), c('z', 'a'), c('a')]);
    expect(rows[3].col).toBe(1);
  });
});

describe('statusCounts', () => {
  it('同一檔案可同時算已暫存與未暫存；untracked 與衝突分開', () => {
    const s: GitStatus = {
      branch: 'master',
      head: null,
      upstream: null,
      ahead: null,
      behind: null,
      files: [
        { path: 'a', orig: null, x: 'M', y: 'M', conflict: false },
        { path: 'b', orig: null, x: 'A', y: '.', conflict: false },
        { path: 'c', orig: null, x: '?', y: '?', conflict: false },
        { path: 'd', orig: null, x: 'U', y: 'U', conflict: true },
      ],
    };
    expect(statusCounts(s)).toEqual({ staged: 2, unstaged: 1, untracked: 1, conflicts: 1 });
    expect(isClean(statusCounts({ ...s, files: [] }))).toBe(true);
  });
});

describe('parsePatch', () => {
  const patch = [
    'diff --git a/a.ts b/a.ts',
    'index 111..222 100644',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1,3 +1,3 @@ function f() {',
    ' one',
    '-two',
    '+TWO',
    ' three',
    '@@ -10,2 +10,3 @@',
    ' ten',
    '+ten and a half',
    ' eleven',
    '\\ No newline at end of file',
    '',
  ].join('\n');

  it('行號與種類；檔頭略過；--- 開頭的刪除行不被當成檔頭', () => {
    const r = parsePatch(patch);
    expect(r.binary).toBe(false);
    expect(r.hunks).toHaveLength(2);
    expect(r.hunks[0]).toMatchObject({ header: 'function f() {', oldStart: 1, newStart: 1 });
    expect(r.hunks[0].lines).toEqual([
      { kind: 'ctx', old: 1, new: 1, text: 'one' },
      { kind: 'del', old: 2, new: null, text: 'two' },
      { kind: 'add', old: null, new: 2, text: 'TWO' },
      { kind: 'ctx', old: 3, new: 3, text: 'three' },
    ]);
    expect(r.hunks[1].lines.map((l) => [l.kind, l.old, l.new])).toEqual([
      ['ctx', 10, 10],
      ['add', null, 11],
      ['ctx', 11, 12],
      ['note', null, null],
    ]);
    const dashes = parsePatch('@@ -1 +0,0 @@\n--- not a header\n');
    expect(dashes.hunks[0].lines).toEqual([{ kind: 'del', old: 1, new: null, text: '-- not a header' }]);
  });

  it('binary 與截斷', () => {
    expect(parsePatch('diff --git a/x b/x\nBinary files a/x and b/x differ\n')).toEqual({ binary: true, hunks: [], truncated: false });
    const r = parsePatch(patch, 3);
    expect(r.truncated).toBe(true);
    expect(r.hunks[0].lines).toHaveLength(3);
  });
});
