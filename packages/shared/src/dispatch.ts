// 派工紀錄（設定值）：process.md 的 spawn 行＋該專案現在的 roles／kinds 檔推出 model／effort。
// 解析規則只有這一份（同 dk-spawn 第 18–20 行）：server、前端與 qa 驗算都用這裡的函式。
// server 只以文字讀 roles／kinds 檔再交給 parseRoleFile／parseKindFile，不 source、不執行。
import type { TaskBrief, TaskEvent, Ts } from './dkstatus.ts';
import { roleOf } from './trends.ts';

export type Tier = 'S' | 'M' | 'L';

/** 一次派工（process 的一行 `spawn <agent> (<kind> <tier>)<notes>`） */
export interface Dispatch {
  /** herdr 註冊名（`<任務短名>-<member>`） */
  agent: string;
  /** agent 去掉開頭的 `<任務短名>-`；去不掉就是 agent 本身 */
  member: string;
  /** roleOf(member) */
  role: string | null;
  kind: string;
  tier: Tier;
  /** 由 roles／kinds 檔推出；讀不到或對不到為 null */
  model: string | null;
  effort: string | null;
  /** 事件 ts（本地 `YYYY-MM-DDTHH:MM`）轉 epoch ms */
  at: number;
  /** spawn 行尾以空白切開的旗標（isolated、override-kind、resume、handoff、prompt-failed…） */
  notes: string[];
}

export interface ModelEffort {
  model: string | null;
  effort: string | null;
}

/** roles/<角色>.md 的 frontmatter：`kind:` 與 `tiers:` 底下的 `<tier>: <model/effort>` */
export interface RoleSpec {
  kind: string | null;
  /** key 為 tier（S／M／L），值為原文 `model/effort` */
  tiers: Record<string, string>;
}

/** 一個專案的派工對照表（server 以文字讀 `.dkbo/roles/*.md`、`.dkbo/kinds/*.sh` 組出） */
export interface TierConfig {
  /** key 為角色（檔名去 `.md`） */
  roles: Record<string, RoleSpec>;
  /** key 為 kind（檔名去 `.sh`），值為 KIND_DEFAULT_TIERS 解出的 tier → `model/effort` */
  kinds: Record<string, Record<string, string>>;
}

export const EMPTY_TIER_CONFIG: TierConfig = { roles: {}, kinds: {} };

/** 花費歸屬用的派工索引：project → taskDir → 該任務的 Dispatch（依 at 升冪） */
export type DispatchIndex = Record<string, Record<string, Dispatch[]>>;

const SPAWN_RE = /^spawn (\S+) \((\S+) ([SML])\)(.*)$/;
const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** 本地時間 `YYYY-MM-DDTHH:MM` → epoch ms（前提：server 與跑 dk-status 的機器同時區）；格式壞回 null */
export function localTsMs(ts: Ts | null | undefined): number | null {
  const m = ts ? TS_RE.exec(ts) : null;
  if (!m) return null;
  const [y, mo, d, hh, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) return null;
  return new Date(y, mo - 1, d, hh, mi).getTime();
}

/** frontmatter 區塊（第一行必須是 `---`，到下一個 `---` 為止）；同 lib/frontmatter.sh 的 dk__fm_block */
const fmBlock = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return [];
  const end = lines.indexOf('---', 1);
  return lines.slice(1, end < 0 ? lines.length : end);
};

/** 文字解析 roles/<角色>.md 的 frontmatter（同 dk_fm／dk_fm_tier）；沒有 frontmatter 時 kind 為 null、tiers 為空 */
export function parseRoleFile(text: string): RoleSpec {
  let kind: string | null = null;
  const tiers: Record<string, string> = {};
  let inTiers = false;
  for (const line of fmBlock(text)) {
    if (inTiers && /^\S/.test(line)) inTiers = false;
    if (inTiers) {
      const f = line.trim().split(/\s+/);
      const k = f[0]?.endsWith(':') ? f[0].slice(0, -1) : null;
      if (k && f[1] && !(k in tiers)) tiers[k] = f[1];
      continue;
    }
    if (/^tiers:/.test(line)) {
      inTiers = true;
      continue;
    }
    const m = /^kind: *(.*)$/.exec(line);
    if (m && kind === null) kind = m[1].trim() || null;
  }
  return { kind, tiers };
}

/** `KIND_DEFAULT_TIERS=` 右邊的值：引號內整段；不加引號取到第一個空白為止；引號外的 `# 註解` 忽略。引號沒關回 null */
const assignedValue = (rhs: string): string | null => {
  const q = rhs[0];
  if (q === '"' || q === "'") {
    const end = rhs.indexOf(q, 1);
    if (end < 0) return null;
    const rest = rhs.slice(end + 1);
    return rest === '' || /^\s/.test(rest) ? rhs.slice(1, end) : null;
  }
  return /^[^\s#]*/.exec(rhs)![0];
};

/**
 * 文字解析 kinds/<kind>.sh 的 `KIND_DEFAULT_TIERS="S=a/b M=…"`（不 source）：容忍行首 `export ` 與引號外的行尾 `# 註解`；
 * 定義多次取最後一次（同 source 後的值）；沒有這行回空物件
 */
export function parseKindFile(text: string): Record<string, string> {
  let out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?KIND_DEFAULT_TIERS=(.*)$/.exec(line);
    const v = m ? assignedValue(m[1]) : null;
    if (v === null) continue;
    out = {};
    for (const pair of v.trim().split(/\s+/)) {
      const i = pair.indexOf('=');
      if (i > 0 && !(pair.slice(0, i) in out)) out[pair.slice(0, i)] = pair.slice(i + 1);
    }
  }
  return out;
}

/** `model/effort` 以最後一個 `/` 切開；沒有 `/`、任一邊為空或 spec 為 null 時兩者皆 null */
export function splitSpec(spec: string | null | undefined): ModelEffort {
  const i = spec ? spec.lastIndexOf('/') : -1;
  if (!spec || i <= 0 || i === spec.length - 1) return { model: null, effort: null };
  return { model: spec.slice(0, i), effort: spec.slice(i + 1) };
}

/**
 * 某角色以 (kind, tier) 派工的 model／effort（同 dk-spawn）：角色檔 kind 等於 spawn 的 kind 時取角色檔 tiers.<tier>，
 * 不等時取 kinds/<kind>.sh 的 KIND_DEFAULT_TIERS；角色檔讀不到、對不到 tier 都回 null。
 */
export function resolveTier(config: TierConfig, role: string | null, kind: string, tier: string): ModelEffort {
  const r = role === null ? undefined : config.roles[role];
  if (!r) return { model: null, effort: null };
  const spec = r.kind === kind ? r.tiers[tier] : config.kinds[kind]?.[tier];
  return splitSpec(spec);
}

/** events 裡 kind 為 spawn 的行 → Dispatch（依 at 升冪；`failed:` 等格式不符或 ts 壞的行略過） */
export function parseDispatch(events: TaskEvent[], short: string, config: TierConfig): Dispatch[] {
  const out: Dispatch[] = [];
  const prefix = `${short}-`;
  for (const e of events) {
    if (e.kind !== 'spawn') continue;
    const m = SPAWN_RE.exec(e.text);
    const at = localTsMs(e.ts);
    if (!m || at === null) continue;
    const [, agent, kind, tier, rest] = m;
    const member = agent.startsWith(prefix) && agent.length > prefix.length ? agent.slice(prefix.length) : agent;
    const role = roleOf(member);
    out.push({ agent, member, role, kind, tier: tier as Tier, ...resolveTier(config, role, kind, tier), at, notes: rest.split(/\s+/).filter(Boolean) });
  }
  return out.map((d, i) => [d, i] as const).sort((p, q) => p[0].at - q[0].at || p[1] - q[1]).map(([d]) => d);
}

/** 某成員在 ts 當下的設定：at ≤ ts 的最後一筆；都晚於 ts 取最早一筆；沒有這位成員的派工回 null。dispatch 須依 at 升冪 */
export function dispatchAt(dispatch: readonly Dispatch[] | undefined, member: string | null, ts: number): Dispatch | null {
  if (!dispatch || member === null) return null;
  let first: Dispatch | null = null;
  let last: Dispatch | null = null;
  for (const d of dispatch) {
    if (d.member !== member) continue;
    first ??= d;
    if (d.at <= ts) last = d;
  }
  return last ?? first;
}

const sameModel = (actual: string, configured: string) => {
  const a = actual.toLowerCase();
  const c = configured.toLowerCase();
  return a === c || a.startsWith(`${c} `) || a.startsWith(`${c}-`);
};

/**
 * 實際（herdr 回報）與設定（派工推算）是否不一致：兩邊都有 model 時比 model（實際等於設定、或以「設定＋空白／-」開頭算相同，不分大小寫），
 * 兩邊都有 effort 時比 effort（不分大小寫全等）；任一邊為 null 的那一項不判。
 */
export function modelMismatch(actual: ModelEffort | null, configured: ModelEffort | null): boolean {
  if (!actual || !configured) return false;
  if (actual.model !== null && configured.model !== null && !sameModel(actual.model, configured.model)) return true;
  if (actual.effort !== null && configured.effort !== null && actual.effort.toLowerCase() !== configured.effort.toLowerCase()) return true;
  return false;
}

/** 計入檔位統計：排除 reviewer 與 role 為 null */
export const countsForTiers = (d: Pick<Dispatch, 'role'>): boolean => d.role !== null && d.role !== 'reviewer';

/** 檔位計數：以 (member, tier) 去重後依 tier 計數，排除 reviewer 與 null 角色（例：{ L: 2, M: 1 }） */
export function tierCounts(dispatch: readonly Dispatch[]): Partial<Record<Tier, number>> {
  const seen = new Set<string>();
  const out: Partial<Record<Tier, number>> = {};
  for (const d of dispatch) {
    if (!countsForTiers(d)) continue;
    const k = `${d.member}\u0000${d.tier}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out[d.tier] = (out[d.tier] ?? 0) + 1;
  }
  return out;
}

/** 修復波數：brief 波次表「型態」欄為 `修復` 的不同波號個數 */
export function repairWaveCount(brief: Pick<TaskBrief, 'waves'>): number {
  const set = new Set<number>();
  for (const w of brief.waves) if (w.type?.trim() === '修復' && w.wave !== null) set.add(w.wave);
  return set.size;
}
