import { describe, expect, it } from 'vitest';
import {
  dispatchAt,
  localTsMs,
  modelMismatch,
  parseDispatch,
  parseKindFile,
  parseRoleFile,
  repairWaveCount,
  splitSpec,
  tierCounts,
  type Dispatch,
  type TierConfig,
} from './dispatch.ts';
import type { TaskEvent } from './dkstatus.ts';

const ev = (ts: string, text: string, kind = text.split(' ')[0]): TaskEvent => ({ ts, kind, text });

const CONFIG: TierConfig = {
  roles: {
    backend: { kind: 'claude', tiers: { S: 'opus/low', M: 'opus/medium', L: 'opus/high' } },
    reviewer: { kind: 'claude', tiers: { M: 'opus/medium', L: 'opus/high' } },
    odd: { kind: 'claude', tiers: { M: 'org/team/model-x/high' } },
  },
  kinds: { codex: { S: 'gpt-5.5/low', M: 'gpt-5.5/medium', L: 'gpt-5.5/high' } },
};

describe('parseRoleFile／parseKindFile（文字解析，不 source）', () => {
  it('frontmatter 的 kind 與 tiers；tiers 區塊遇到頂格行結束', () => {
    const text = '---\nname: qa\nkind: claude\ntiers:\n  S: opus/low\n  M: opus/medium\n  L: opus/high\nworktree: true\ngroup: review\n---\n## 職責\nkind: codex\n';
    expect(parseRoleFile(text)).toEqual({ kind: 'claude', tiers: { S: 'opus/low', M: 'opus/medium', L: 'opus/high' } });
  });

  it('沒有 frontmatter（README.md）→ kind null、tiers 空', () => {
    expect(parseRoleFile('# 角色\n\nkind: claude\n')).toEqual({ kind: null, tiers: {} });
  });

  it('KIND_DEFAULT_TIERS 一行；其他行（含 $(...)）只當文字', () => {
    const text = '# shellcheck shell=bash\nKIND_MODEL_EFFORTS="gpt-5.5:low,medium,high"\n$(touch /tmp/x)\nKIND_DEFAULT_TIERS="S=gpt-5.5/low M=gpt-5.5/medium L=gpt-5.5/high"\n';
    expect(parseKindFile(text)).toEqual({ S: 'gpt-5.5/low', M: 'gpt-5.5/medium', L: 'gpt-5.5/high' });
    expect(parseKindFile('echo hi\n')).toEqual({});
  });

  it('KIND_DEFAULT_TIERS 定義多次時以最後一次為準（同 source 後的值）；單引號、不加引號也認', () => {
    expect(parseKindFile("KIND_DEFAULT_TIERS='S=a/low M=a/medium'\nKIND_DEFAULT_TIERS=M=b/high\n")).toEqual({ M: 'b/high' });
  });

  it('容忍行首 export 與引號外的行尾 # 註解（同 source 後的值；波 1 審查裁定）', () => {
    expect(parseKindFile('KIND_DEFAULT_TIERS="S=a/low M=a/med"  # 註解\n')).toEqual({ S: 'a/low', M: 'a/med' });
    expect(parseKindFile('export KIND_DEFAULT_TIERS="S=a/low M=a/med"\n')).toEqual({ S: 'a/low', M: 'a/med' });
    expect(parseKindFile("  export KIND_DEFAULT_TIERS='M=b/high' # x\n")).toEqual({ M: 'b/high' });
    expect(parseKindFile('KIND_DEFAULT_TIERS=M=c/low # 不加引號\n')).toEqual({ M: 'c/low' });
    // 引號內的 # 是值的一部分（bash 也不當註解）
    expect(parseKindFile('KIND_DEFAULT_TIERS="M=d/x#y"\n')).toEqual({ M: 'd/x#y' });
    expect(parseKindFile('# KIND_DEFAULT_TIERS="M=z/z"\n')).toEqual({});
  });

  it('splitSpec 以最後一個 / 切開', () => {
    expect(splitSpec('opus/high')).toEqual({ model: 'opus', effort: 'high' });
    expect(splitSpec('org/team/model-x/high')).toEqual({ model: 'org/team/model-x', effort: 'high' });
    expect(splitSpec('opus')).toEqual({ model: null, effort: null });
    expect(splitSpec(null)).toEqual({ model: null, effort: null });
  });
});

describe('parseDispatch（AC2）', () => {
  const at = (ts: string) => localTsMs(ts)!;

  it('一般：角色檔 kind 相同 → 角色檔 tiers；agent 去短名前綴；at 為本地時間 epoch ms', () => {
    const d = parseDispatch([ev('2026-09-23T08:46', 'spawn ops-backend-kinds (claude M)')], 'ops', CONFIG);
    expect(d).toEqual<Dispatch[]>([
      { agent: 'ops-backend-kinds', member: 'backend-kinds', role: 'backend', kind: 'claude', tier: 'M', model: 'opus', effort: 'medium', at: new Date(2026, 8, 23, 8, 46).getTime(), notes: [] },
    ]);
  });

  it('(a) notes 有 override-kind 但 kind 與角色檔相同 → 仍用角色檔 tiers', () => {
    const [d] = parseDispatch([ev('2026-09-23T07:54', 'spawn ops-reviewer-p1 (claude L) isolated override-kind')], 'ops', CONFIG);
    expect(d).toMatchObject({ member: 'reviewer-p1', role: 'reviewer', kind: 'claude', tier: 'L', model: 'opus', effort: 'high', notes: ['isolated', 'override-kind'] });
  });

  it('(b) kind 與角色檔不同 → kinds/<kind>.sh 的 KIND_DEFAULT_TIERS', () => {
    const [d] = parseDispatch([ev('2026-09-23T09:00', 'spawn ops-backend (codex M) override-kind')], 'ops', CONFIG);
    expect(d).toMatchObject({ kind: 'codex', tier: 'M', model: 'gpt-5.5', effort: 'medium', notes: ['override-kind'] });
  });

  it('resume／prompt-failed／handoff notes 照樣收；failed: 行與格式不符的行略過', () => {
    const d = parseDispatch(
      [
        ev('2026-09-23T09:00', 'spawn ops-backend (claude M) resume'),
        ev('2026-09-23T09:01', 'spawn ops-backend failed: pane w1:p3 kept for diagnosis'),
        ev('2026-09-23T09:02', 'spawn ops-backend (claude L) resume handoff'),
        ev('2026-09-23T09:03', 'spawn ops-qa (codex L) isolated override-kind prompt-failed'),
        ev('2026-09-23T09:04', 'spawn ops-qa (claude X)'),
        ev('2026-09-23T09:05', 'spawn ops-qa (claude M)', 'resume'),
      ],
      'ops',
      CONFIG,
    );
    expect(d.map((x) => [x.member, x.tier, x.notes])).toEqual([
      ['backend', 'M', ['resume']],
      ['backend', 'L', ['resume', 'handoff']],
      ['qa', 'L', ['isolated', 'override-kind', 'prompt-failed']],
    ]);
  });

  it('agent 不帶短名前綴時 member 就是 agent', () => {
    const [d] = parseDispatch([ev('2026-09-23T09:00', 'spawn backend (claude S)')], 'ops', CONFIG);
    expect(d).toMatchObject({ agent: 'backend', member: 'backend', role: 'backend', model: 'opus', effort: 'low' });
  });

  it('roles 檔缺漏、tier 不存在、kinds 檔缺漏 → model／effort 為 null（kind、tier 照樣有）', () => {
    const d = parseDispatch(
      [
        ev('2026-09-23T09:00', 'spawn ops-frontend (claude M)'),
        ev('2026-09-23T09:01', 'spawn ops-reviewer-a (claude S) isolated'),
        ev('2026-09-23T09:02', 'spawn ops-backend (agy L) override-kind'),
      ],
      'ops',
      CONFIG,
    );
    expect(d.map((x) => [x.kind, x.tier, x.model, x.effort])).toEqual([
      ['claude', 'M', null, null],
      ['claude', 'S', null, null],
      ['agy', 'L', null, null],
    ]);
  });

  it('model/effort 值含多個 / 以最後一個切', () => {
    const [d] = parseDispatch([ev('2026-09-23T09:00', 'spawn t-odd (claude M)')], 't', CONFIG);
    expect(d).toMatchObject({ model: 'org/team/model-x', effort: 'high' });
  });

  it('依 at 升冪（同分鐘保留原順序）；ts 壞的行略過', () => {
    const d = parseDispatch(
      [ev('2026-09-23T10:00', 'spawn t-backend (claude L)'), ev('2026-09-23T09:00', 'spawn t-qa (claude M)'), ev('2026-09-23T09:00', 'spawn t-qa2 (claude M)'), ev('bad', 'spawn t-x (claude M)')],
      't',
      CONFIG,
    );
    expect(d.map((x) => [x.member, x.at])).toEqual([
      ['qa', at('2026-09-23T09:00')],
      ['qa2', at('2026-09-23T09:00')],
      ['backend', at('2026-09-23T10:00')],
    ]);
  });
});

describe('dispatchAt', () => {
  const d = parseDispatch(
    [ev('2026-09-23T09:00', 'spawn t-backend (claude M)'), ev('2026-09-23T10:00', 'spawn t-qa (claude M)'), ev('2026-09-23T11:00', 'spawn t-backend (claude L) resume handoff')],
    't',
    CONFIG,
  );
  const ms = (h: number, m = 0) => new Date(2026, 8, 23, h, m).getTime();

  it('取 at ≤ ts 的最後一筆（handoff 後歸新檔位；同一分鐘算新的）', () => {
    expect(dispatchAt(d, 'backend', ms(10, 30))?.tier).toBe('M');
    expect(dispatchAt(d, 'backend', ms(11))?.tier).toBe('L');
    expect(dispatchAt(d, 'backend', ms(12))?.tier).toBe('L');
  });

  it('全晚於 ts 取最早；沒有這位成員、member null、沒有派工 → null', () => {
    expect(dispatchAt(d, 'backend', ms(8))?.tier).toBe('M');
    expect(dispatchAt(d, 'frontend', ms(12))).toBeNull();
    expect(dispatchAt(d, null, ms(12))).toBeNull();
    expect(dispatchAt(undefined, 'backend', ms(12))).toBeNull();
  });
});

describe('modelMismatch', () => {
  const me = (model: string | null, effort: string | null) => ({ model, effort });

  it('相同：大小寫不拘；設定＋空白或 - 開頭算相同', () => {
    expect(modelMismatch(me('opus 5.5', 'high'), me('opus', 'high'))).toBe(false);
    expect(modelMismatch(me('Opus-5.5', 'HIGH'), me('opus', 'high'))).toBe(false);
    expect(modelMismatch(me('gpt-5.5', 'medium'), me('gpt-5.5', 'medium'))).toBe(false);
  });

  it('model 不同、effort 不同', () => {
    expect(modelMismatch(me('sonnet 5', 'high'), me('opus', 'high'))).toBe(true);
    expect(modelMismatch(me('opusx', 'high'), me('opus', 'high'))).toBe(true);
    expect(modelMismatch(me('opus 5.5', 'medium'), me('opus', 'high'))).toBe(true);
  });

  it('一邊 null 的那一項不判；整邊 null 不判', () => {
    expect(modelMismatch(me(null, 'high'), me('opus', 'high'))).toBe(false);
    expect(modelMismatch(me('sonnet 5', null), me('sonnet', 'high'))).toBe(false);
    expect(modelMismatch(me(null, 'low'), me('opus', 'high'))).toBe(true);
    expect(modelMismatch(null, me('opus', 'high'))).toBe(false);
    expect(modelMismatch(me('opus', 'high'), null)).toBe(false);
    expect(modelMismatch(me('opus', 'high'), me(null, null))).toBe(false);
  });
});

describe('tierCounts／repairWaveCount', () => {
  it('(member, tier) 去重；換檔位各算一次；排除 reviewer 與 null 角色', () => {
    const d = parseDispatch(
      [
        ev('2026-09-23T08:46', 'spawn ops-backend-kinds (claude M)'),
        ev('2026-09-23T09:48', 'spawn ops-backend-kinds (claude S)'),
        ev('2026-09-23T10:22', 'spawn ops-backend-kinds (claude S)'),
        ev('2026-09-23T10:22', 'spawn ops-backend-flow (claude S)'),
        ev('2026-09-23T10:33', 'spawn ops-reviewer-a (claude M) isolated override-kind'),
        ev('2026-09-23T10:34', 'spawn ops-backend-flow (claude L)'),
      ],
      'ops',
      CONFIG,
    );
    expect(tierCounts(d)).toEqual({ M: 1, S: 2, L: 1 });
    expect(tierCounts([])).toEqual({});
  });

  it('修復波＝型態為「修復」的不同波號個數', () => {
    const w = (wave: number | null, type: string | null) => ({ wave, type, member: null, what: null, tier: null, done: null, review: null });
    expect(repairWaveCount({ waves: [w(1, '實作'), w(2, '修復'), w(2, '修復'), w(3, '文件'), w(4, '修復'), w(null, '修復')] })).toBe(2);
    expect(repairWaveCount({ waves: [] })).toBe(0);
  });
});
