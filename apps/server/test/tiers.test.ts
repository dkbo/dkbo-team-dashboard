// 派工對照表：server 以文字讀被監看專案的 .dkbo/roles/*.md、.dkbo/kinds/*.sh（快取依 mtime／size），不 source 不執行
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TierReader } from '../src/tiers.ts';
import { tmp } from './helpers.ts';

const ROLE = (kind: string, m: string) => `---\nname: backend\nkind: ${kind}\ntiers:\n  S: opus/low\n  M: ${m}\n  L: opus/high\nworktree: true\n---\n## 職責\n`;

function project() {
  const root = tmp('dash-tiers-');
  mkdirSync(join(root, '.dkbo/roles'), { recursive: true });
  mkdirSync(join(root, '.dkbo/kinds'), { recursive: true });
  writeFileSync(join(root, '.dkbo/roles/backend.md'), ROLE('claude', 'opus/medium'));
  writeFileSync(join(root, '.dkbo/roles/README.md'), '# 角色\n');
  writeFileSync(join(root, '.dkbo/roles/notes.txt'), 'kind: nope\n');
  writeFileSync(join(root, '.dkbo/kinds/codex.sh'), 'KIND_DEFAULT_TIERS="S=gpt-5.5/low M=gpt-5.5/medium L=gpt-5.5/high"\n');
  return root;
}

function counting() {
  const reads: string[] = [];
  const reader = new TierReader((p) => {
    reads.push(p);
    return Promise.resolve(readFileSync(p, 'utf8'));
  });
  return { reads, reader };
}

describe('TierReader（modelcost AC3）', () => {
  it('以文字讀 roles/*.md 與 kinds/*.sh 組出對照表；其他副檔名不讀', async () => {
    const root = project();
    const { reads, reader } = counting();
    const c = await reader.read(root);
    expect(c.roles.backend).toEqual({ kind: 'claude', tiers: { S: 'opus/low', M: 'opus/medium', L: 'opus/high' } });
    expect(c.roles.README).toEqual({ kind: null, tiers: {} });
    expect(c.kinds).toEqual({ codex: { S: 'gpt-5.5/low', M: 'gpt-5.5/medium', L: 'gpt-5.5/high' } });
    expect(reads.map((p) => p.slice(root.length)).sort()).toEqual(['/.dkbo/kinds/codex.sh', '/.dkbo/roles/README.md', '/.dkbo/roles/backend.md']);
  });

  it('kinds 檔裡的 $(touch …) 不會被執行', async () => {
    const root = project();
    const marker = join(tmp('dash-marker-'), 'executed');
    writeFileSync(join(root, '.dkbo/kinds/evil.sh'), `touch ${marker}\n$(touch ${marker})\nKIND_X="$(touch ${marker})"\nKIND_DEFAULT_TIERS="M=gpt-5.5/low"\n`);
    const c = await new TierReader().read(root);
    expect(existsSync(marker)).toBe(false);
    expect(c.kinds.evil).toEqual({ M: 'gpt-5.5/low' });
  });

  it('沒變的檔不重讀；mtime 變了才重讀並反映新值；沒變時回同一個物件', async () => {
    const root = project();
    const { reads, reader } = counting();
    const a = await reader.read(root);
    const n = reads.length;
    const b = await reader.read(root);
    expect(reads.length).toBe(n);
    expect(b).toBe(a);
    const f = join(root, '.dkbo/roles/backend.md');
    writeFileSync(f, ROLE('claude', 'sonnet/medium'));
    const later = new Date(Date.now() + 60_000);
    utimesSync(f, later, later);
    const c = await reader.read(root);
    expect(reads.slice(n).map((p) => p.slice(root.length))).toEqual(['/.dkbo/roles/backend.md']);
    expect(c.roles.backend.tiers.M).toBe('sonnet/medium');
    expect(c).not.toBe(a);
  });

  it('刪檔、目錄不存在都不報錯', async () => {
    const root = project();
    const reader = new TierReader();
    await reader.read(root);
    rmSync(join(root, '.dkbo/roles/backend.md'));
    expect((await reader.read(root)).roles.backend).toBeUndefined();
    expect(await reader.read(join(root, 'nope'))).toEqual({ roles: {}, kinds: {} });
  });
});
