// SessionTracker：唯讀讀 Claude Code／Codex 的 session JSONL，算出每個 session 的細狀態並對到 herdr pane。
// - 探索（scanMs）：Claude 讀 `<claudeDir>/projects/<cwd 編碼>*/*.jsonl`（mtime 24 小時內或被 pane 的 session id 指到，以檔內 cwd 確認專案）；
//   Codex 對 `<codexDir>/sessions/YYYY/MM/DD/rollout-*.jsonl` 建索引，每檔只讀第一行 session_meta 一次（以路徑快取；首行不會變）。
//   最近兩天的日期夾每次探索都讀，其餘日期夾每 codexFullScanMs 才重走一次（新檔只會出現在當天的夾）。
// - tail（pollMs）：只讀上次 offset 之後新增的位元組；檔案變小就從頭重讀；第一次讀只讀最後 initialTailBytes。
// - 不寫 ~/.claude、~/.codex，不對 herdr 送任何東西；Claude 等審批的問句只在 pane 轉 blocked 時讀一次畫面（唯讀 pane read）。
import { EventEmitter } from 'node:events';
import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PaneLive, PaneStatus, SessionLive } from '@dash/shared';
import type { ProjectConfig } from './config.ts';
import { matchPanes, type MatchPane, type MatchSession } from './session-match.ts';
import { combineHerdr, questionFromScreen, SessionReducer, type SessionKind } from './session-parse.ts';

export interface SessionOpts {
  claudeDir: string;
  codexDir: string;
  off: boolean;
  pollMs?: number;
  scanMs?: number;
  codexFullScanMs?: number;
  /** mtime 在這段時間內的 transcript 才讀（被 pane 對到的不限） */
  windowMs?: number;
  initialTailBytes?: number;
  /** subagent 檔超過這麼久沒動就不算執行中 */
  subagentStaleMs?: number;
  now?: () => number;
}

export function sessionOptsFromEnv(env: NodeJS.ProcessEnv): SessionOpts {
  return {
    claudeDir: env.DASH_CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'),
    codexDir: env.DASH_CODEX_DIR || env.CODEX_HOME || join(homedir(), '.codex'),
    off: env.DASH_SESSIONS === 'off',
  };
}

export interface TrackerDeps {
  projects: ProjectConfig[];
  /** herdr 的 pane（status 是 herdr 原值） */
  panes: () => PaneLive[];
  /** paneId → herdr agent_session id */
  sessionIds: () => Map<string, string>;
  /** herdr snapshot 是否已成功過（第一次成功時在場的 pane 首次出現時間記為未知） */
  herdrUp: () => boolean;
  /** paneId → dkbo 註冊時間（epoch ms，來自任務 detail 的 panes[].since_epoch） */
  paneSince?: () => Map<string, number>;
  /** 讀 pane 可見畫面（ANSI）；只在 Claude pane 轉 blocked 時呼叫一次 */
  screen?: (paneId: string) => Promise<string>;
}

/** 一個被追的 session（給 Hub 組 OfficeSession） */
export interface TrackedSession {
  live: SessionLive;
  kind: SessionKind;
  sessionId: string;
  cwd: string;
  project: string;
  paneId: string | null;
  agentName: string | null;
  effort: string | null;
}

interface FileEntry {
  path: string;
  kind: SessionKind;
  sessionId: string;
  cwd: string;
  project: string;
  startedAt: number | null;
  mtime: number;
  size: number;
  offset: number;
  rest: Buffer;
  reducer: SessionReducer;
  /** 已讀過至少一次 */
  read: boolean;
  subagents: number;
  busy: boolean;
}

interface CodexIndex {
  id: string;
  cwd: string;
  startedAt: number | null;
  mtime: number;
}

const DAY = 24 * 3600_000;
const HEAD_MAX = 1024 * 1024;
const NL = 0x0a;

const under = (cwd: string, root: string) => cwd === root || cwd.startsWith(root.endsWith('/') ? root : root + '/');
export const claudeDirName = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-');

async function readRange(path: string, start: number, end: number): Promise<Buffer> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(end - start);
    let n = 0;
    while (n < buf.length) {
      const r = await fh.read(buf, n, buf.length - n, start + n);
      if (r.bytesRead === 0) break;
      n += r.bytesRead;
    }
    return buf.subarray(0, n);
  } finally {
    await fh.close();
  }
}

/** 檔頭的完整行（最多 HEAD_MAX 位元組），逐行交給 pick，pick 回非 undefined 就停 */
async function scanHead<T>(path: string, pick: (j: Record<string, unknown>) => T | undefined): Promise<T | undefined> {
  let buf: Buffer;
  try {
    buf = await readRange(path, 0, HEAD_MAX);
  } catch {
    return undefined;
  }
  let at = 0;
  for (;;) {
    const i = buf.indexOf(NL, at);
    if (i < 0) return undefined;
    const line = buf.subarray(at, i).toString('utf8');
    at = i + 1;
    try {
      const v = pick(JSON.parse(line));
      if (v !== undefined) return v;
    } catch {
      // 壞行略過
    }
  }
}

async function ls(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function mtimeOf(path: string): Promise<{ mtime: number; size: number } | null> {
  try {
    const s = await stat(path);
    return { mtime: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

const tsOf = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export class SessionTracker extends EventEmitter {
  private readonly o: Required<Omit<SessionOpts, 'off'>> & { off: boolean };
  private readonly files = new Map<string, FileEntry>();
  /** Claude transcript 的 cwd／開始時間（以路徑快取；null＝不屬於任何專案） */
  private readonly claudeHead = new Map<string, { cwd: string; startedAt: number | null } | null>();
  private readonly codexIdx = new Map<string, CodexIndex | null>();
  private codexFullAt = -Infinity;
  /** 現在的 pane → session 對應 */
  private match = new Map<string, string>();
  private readonly firstSeen = new Map<string, number | null>();
  private baselined = false;
  private readonly blocked = new Map<string, { since: number; question: string | null }>();
  private readonly prevRaw = new Map<string, PaneStatus>();
  private readonly subCache = new Map<string, { mtime: number; active: boolean }>();
  private pollTimer: NodeJS.Timeout | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private stopped = true;
  private halted = false;
  private scanning: Promise<void> | null = null;
  private readonly asked = new Set<string>();
  private readonly roleNames = new Map<string, Set<string>>();

  constructor(
    opts: SessionOpts,
    private readonly d: TrackerDeps,
  ) {
    super();
    this.o = {
      pollMs: 1000,
      scanMs: 5000,
      codexFullScanMs: 60_000,
      windowMs: DAY,
      initialTailBytes: 4 * 1024 * 1024,
      subagentStaleMs: 10 * 60_000,
      now: Date.now,
      ...opts,
    };
  }

  get enabled(): boolean {
    return !this.o.off;
  }

  start(): void {
    if (this.o.off || !this.stopped) return;
    this.stopped = false;
    this.halted = false;
    const scanLoop = async () => {
      await this.scan();
      if (!this.stopped) this.scanTimer = setTimeout(scanLoop, this.o.scanMs);
    };
    const pollLoop = async () => {
      await this.poll();
      if (!this.stopped) this.pollTimer = setTimeout(pollLoop, this.o.pollMs);
    };
    void scanLoop().then(() => {
      if (!this.stopped) this.pollTimer = setTimeout(pollLoop, this.o.pollMs);
    });
  }

  /** stop 之後在途的掃描、畫面讀取不再發 change（免得 hub 在關機後又排 timer） */
  private changed(): void {
    if (!this.halted) this.emit('change');
  }

  stop(): void {
    this.halted = true;
    this.stopped = true;
    for (const t of [this.pollTimer, this.scanTimer]) if (t) clearTimeout(t);
    this.pollTimer = this.scanTimer = null;
  }

  private projectOf(cwd: string): string | null {
    let best: ProjectConfig | null = null;
    for (const p of this.d.projects) if (under(cwd, p.path) && (!best || p.path.length > best.path.length)) best = p;
    return best?.name ?? null;
  }

  // ── 探索 ────────────────────────────────────────────────

  /** 重新探索 transcript、重配 pane，並 tail 一次 */
  scan(): Promise<void> {
    if (this.o.off) return Promise.resolve();
    this.scanning ??= this.doScan().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  private async doScan(): Promise<void> {
    const now = this.o.now();
    const wanted = new Set(this.d.sessionIds().values());
    const keep = new Map<string, Omit<FileEntry, 'offset' | 'rest' | 'reducer' | 'read' | 'subagents' | 'busy' | 'size'>>();

    // 各專案的角色名（roles/*.md），給 member → role
    for (const p of this.d.projects) this.roleNames.set(p.name, new Set((await ls(join(p.path, '.dkbo/roles'))).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3))));

    // Claude
    const root = join(this.o.claudeDir, 'projects');
    const encs = this.d.projects.map((p) => claudeDirName(p.path));
    for (const dir of await ls(root)) {
      if (!encs.some((e) => dir === e || dir.startsWith(e + '-'))) continue;
      for (const f of await ls(join(root, dir))) {
        if (!f.endsWith('.jsonl')) continue;
        const path = join(root, dir, f);
        const sid = f.slice(0, -'.jsonl'.length);
        const st = await mtimeOf(path);
        if (!st) continue;
        if (now - st.mtime > this.o.windowMs && !wanted.has(sid)) continue;
        if (!this.claudeHead.has(path)) {
          const head = await scanHead(path, (j) => (typeof j.cwd === 'string' ? { cwd: j.cwd, startedAt: tsOf(j.timestamp) } : undefined));
          this.claudeHead.set(path, head && this.projectOf(head.cwd) ? head : null);
        }
        const h = this.claudeHead.get(path);
        if (!h) continue;
        keep.set(path, { path, kind: 'claude', sessionId: sid, cwd: h.cwd, project: this.projectOf(h.cwd)!, startedAt: h.startedAt, mtime: st.mtime });
      }
    }

    // Codex 索引
    const sroot = join(this.o.codexDir, 'sessions');
    const full = now - this.codexFullAt >= this.o.codexFullScanMs;
    if (full) this.codexFullAt = now;
    // Codex 的日期夾是本地日期；UTC 也算進來，時區交界不漏
    const p2 = (n: number) => String(n).padStart(2, '0');
    const recent = new Set<string>();
    for (const d of [0, 1].map((k) => new Date(now - k * DAY))) {
      recent.add(`${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`);
      recent.add(`${d.getUTCFullYear()}/${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())}`);
    }
    for (const y of await ls(sroot))
      for (const m of await ls(join(sroot, y)))
        for (const dd of await ls(join(sroot, y, m))) {
          if (!full && !recent.has(`${y}/${m}/${dd}`)) continue;
          const dir = join(sroot, y, m, dd);
          for (const f of await ls(dir)) {
            if (!f.startsWith('rollout-') || !f.endsWith('.jsonl')) continue;
            const path = join(dir, f);
            const st = await mtimeOf(path);
            if (!st) continue;
            if (!this.codexIdx.has(path)) {
              const meta = await scanHead(path, (j) => {
                if (j.type !== 'session_meta') return null;
                const p = (j.payload ?? {}) as Record<string, unknown>;
                return typeof p.id === 'string' && typeof p.cwd === 'string' ? { id: p.id, cwd: p.cwd, startedAt: tsOf(p.timestamp) ?? tsOf(j.timestamp), mtime: st.mtime } : null;
              });
              this.codexIdx.set(path, meta && this.projectOf(meta.cwd) ? meta : null);
            }
            const ix = this.codexIdx.get(path);
            if (ix) ix.mtime = st.mtime;
          }
        }

    // 配對：Claude 用已納入的檔，Codex 用全部索引（長壽 pane 的 rollout 可能在幾天前的日期夾）
    const codexAll = [...this.codexIdx.entries()].filter((e): e is [string, CodexIndex] => e[1] !== null);
    const cands: MatchSession[] = [
      ...[...keep.values()].map((k) => ({ kind: k.kind, sessionId: k.sessionId, cwd: k.cwd, startedAt: k.startedAt, updatedAt: k.mtime })),
      ...codexAll.map(([, x]) => ({ kind: 'codex' as const, sessionId: x.id, cwd: x.cwd, startedAt: x.startedAt, updatedAt: x.mtime })),
    ];
    this.match = matchPanes(this.matchPanesInput(), cands);
    const matched = new Set(this.match.values());
    for (const [path, x] of codexAll) {
      if (now - x.mtime > this.o.windowMs && !matched.has(x.id)) continue;
      keep.set(path, { path, kind: 'codex', sessionId: x.id, cwd: x.cwd, project: this.projectOf(x.cwd)!, startedAt: x.startedAt, mtime: x.mtime });
    }

    let changed = false;
    for (const path of [...this.files.keys()])
      if (!keep.has(path)) {
        this.files.delete(path);
        changed = true;
      }
    for (const [path, k] of keep) {
      if (this.files.has(path)) continue;
      this.files.set(path, { ...k, size: 0, offset: 0, rest: Buffer.alloc(0), reducer: new SessionReducer(k.kind, k.sessionId), read: false, subagents: 0, busy: false });
      changed = true;
    }
    if (changed) this.changed();
    await this.poll();
  }

  private matchPanesInput(): MatchPane[] {
    const ids = this.d.sessionIds();
    const since = this.d.paneSince?.() ?? new Map<string, number>();
    return this.d.panes().filter((p) => this.projectOf(p.cwd)).map((p) => ({
      paneId: p.paneId,
      kind: p.agent === 'claude' || p.agent === 'codex' ? p.agent : null,
      cwd: p.cwd,
      sessionId: ids.get(p.paneId) ?? null,
      firstSeen: since.get(p.paneId) ?? this.firstSeen.get(p.paneId) ?? null,
    }));
  }

  // ── herdr 變動 ──────────────────────────────────────────

  /** herdr pane 有變：記首次出現時間、blocked 轉變，重配（不讀檔） */
  refreshPanes(): void {
    if (this.o.off) return;
    const now = this.o.now();
    const panes = this.d.panes();
    const up = this.d.herdrUp();
    if (!up) {
      // herdr 掛了：恢復後第一份 snapshot 重新當基準
      this.baselined = false;
      return;
    }
    const present = new Set(panes.map((p) => p.paneId));
    for (const p of panes) if (!this.firstSeen.has(p.paneId)) this.firstSeen.set(p.paneId, this.baselined ? now : null);
    // 至少看到一個 pane 才定基準：HerdrBridge 會在 snapshot 成功、pane 還沒 rebuild 前先發一次 change（空清單）
    if (panes.length) this.baselined = true;
    for (const id of [...this.firstSeen.keys()]) if (!present.has(id)) this.firstSeen.delete(id);

    let changed = false;
    for (const p of panes) {
      const prev = this.prevRaw.get(p.paneId);
      this.prevRaw.set(p.paneId, p.status);
      if (p.status === 'blocked' && !this.blocked.has(p.paneId)) {
        const b = { since: now, question: null as string | null };
        this.blocked.set(p.paneId, b);
        changed = true;
        if (p.agent === 'claude' && this.d.screen && prev !== 'blocked')
          void this.d
            .screen(p.paneId)
            .then((ansi) => {
              if (this.blocked.get(p.paneId) !== b) return;
              b.question = questionFromScreen(ansi);
              if (b.question) this.changed();
            })
            .catch(() => undefined);
      } else if (p.status !== 'blocked' && this.blocked.delete(p.paneId)) changed = true;
    }
    for (const id of [...this.prevRaw.keys()]) if (!present.has(id)) this.prevRaw.delete(id);
    for (const id of [...this.blocked.keys()]) if (!present.has(id)) this.blocked.delete(id);

    const files = [...this.files.values()];
    const cands: MatchSession[] = [
      ...files.filter((f) => f.kind === 'claude').map((f) => ({ kind: f.kind, sessionId: f.sessionId, cwd: f.cwd, startedAt: f.startedAt, updatedAt: f.mtime })),
      ...[...this.codexIdx.values()].filter((x): x is CodexIndex => x !== null).map((x) => ({ kind: 'codex' as const, sessionId: x.id, cwd: x.cwd, startedAt: x.startedAt, updatedAt: x.mtime })),
    ];
    const next = matchPanes(this.matchPanesInput(), cands);
    const key = (m: Map<string, string>) => JSON.stringify([...m].sort());
    if (key(next) !== key(this.match)) {
      this.match = next;
      changed = true;
      // 新對到但還沒在追的檔（例：pane 指到 24 小時外的 transcript）→ 下次探索補上
      const tracked = new Set(files.map((f) => f.sessionId));
      if ([...next.values()].some((id) => !tracked.has(id))) void this.scan();
    } else {
      // pane 指到還沒見過的 transcript（剛開的 session）→ 補掃一次；同一個 id 只補一次，免得 config 外或沒檔的 pane 每次都觸發
      const fresh = this.matchPanesInput().flatMap((p) => (p.sessionId && !this.asked.has(p.sessionId) && !files.some((f) => f.sessionId === p.sessionId) ? [p.sessionId] : []));
      for (const id of fresh) this.asked.add(id);
      if (fresh.length) void this.scan();
    }
    if (changed) this.changed();
  }

  // ── tail ───────────────────────────────────────────────

  /** 每個追蹤中的檔讀新增的位元組；有新事件就發 change */
  async poll(): Promise<void> {
    if (this.o.off) return;
    let changed = false;
    await Promise.all(
      [...this.files.values()].map(async (f) => {
        if (f.busy) return;
        f.busy = true;
        try {
          if (await this.tail(f)) changed = true;
          if (f.kind === 'claude' && (await this.countSubagents(f))) changed = true;
        } finally {
          f.busy = false;
        }
      }),
    );
    if (changed) this.changed();
  }

  private async tail(f: FileEntry): Promise<boolean> {
    const st = await mtimeOf(f.path);
    if (!st) return false;
    f.mtime = st.mtime;
    if (st.size < f.offset) {
      // 檔案變小（被截斷或換檔）：從頭重讀
      f.offset = 0;
      f.rest = Buffer.alloc(0);
      f.reducer = new SessionReducer(f.kind, f.sessionId);
      f.read = false;
    }
    if (st.size === f.offset && f.read) return false;
    let start = f.offset;
    let skipFirst = false;
    if (!f.read && st.size - start > this.o.initialTailBytes) {
      start = st.size - this.o.initialTailBytes;
      skipFirst = true;
    }
    let chunk: Buffer;
    try {
      chunk = await readRange(f.path, start, st.size);
    } catch {
      return false;
    }
    f.read = true;
    f.offset = start + chunk.length;
    let buf = f.rest.length ? Buffer.concat([f.rest, chunk]) : chunk;
    if (skipFirst) {
      const i = buf.indexOf(NL);
      buf = i < 0 ? Buffer.alloc(0) : buf.subarray(i + 1);
    }
    const last = buf.lastIndexOf(NL);
    f.rest = Buffer.from(last < 0 ? buf : buf.subarray(last + 1));
    if (last < 0) return false;
    let n = 0;
    for (const line of buf.subarray(0, last).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        f.reducer.apply(JSON.parse(line));
        n++;
      } catch {
        // 壞行略過
      }
    }
    if (f.kind === 'codex' && f.reducer.cwd) f.cwd = f.reducer.cwd;
    return n > 0;
  }

  /** `<session>/subagents/*.jsonl` 中最近有動、最後一則不是 end_turn 的檔數 */
  private async countSubagents(f: FileEntry): Promise<boolean> {
    const dir = join(dirname(f.path), f.sessionId, 'subagents');
    const now = this.o.now();
    let n = 0;
    for (const name of await ls(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const path = join(dir, name);
      const st = await mtimeOf(path);
      if (!st || now - st.mtime > this.o.subagentStaleMs) continue;
      let c = this.subCache.get(path);
      if (!c || c.mtime !== st.mtime) {
        c = { mtime: st.mtime, active: await subagentActive(path, st.size) };
        this.subCache.set(path, c);
      }
      if (c.active) n++;
    }
    if (n === f.subagents) return false;
    f.subagents = n;
    return true;
  }

  // ── 輸出 ───────────────────────────────────────────────

  private liveOf(f: FileEntry, paneId: string | null): SessionLive {
    const live = f.reducer.live(f.subagents);
    if (!paneId) return live;
    const b = this.blocked.get(paneId);
    return combineHerdr(live, this.prevRaw.get(paneId) ?? null, b?.since ?? null, b?.question ?? null);
  }

  private bySession(): Map<string, FileEntry> {
    const m = new Map<string, FileEntry>();
    for (const f of this.files.values()) {
      const cur = m.get(f.sessionId);
      if (!cur || f.mtime > cur.mtime) m.set(f.sessionId, f);
    }
    return m;
  }

  /** 專案的角色名集合（`.dkbo/roles/*.md`）；探索過才有 */
  roles(project: string): Set<string> | undefined {
    return this.roleNames.get(project);
  }

  /** paneId → 合算後的細狀態；off 或對不到為 null */
  paneSession(paneId: string): SessionLive | null {
    if (this.o.off) return null;
    const sid = this.match.get(paneId);
    const f = sid ? this.bySession().get(sid) : undefined;
    return f ? this.liveOf(f, paneId) : null;
  }

  sessions(): TrackedSession[] {
    if (this.o.off) return [];
    const paneOf = new Map([...this.match].map(([p, s]) => [s, p]));
    return [...this.bySession().values()].map((f) => {
      const paneId = paneOf.get(f.sessionId) ?? null;
      return {
        live: this.liveOf(f, paneId),
        kind: f.kind,
        sessionId: f.sessionId,
        cwd: f.cwd,
        project: f.project,
        paneId,
        agentName: f.reducer.agentName,
        effort: f.reducer.effort,
      };
    });
  }
}

async function subagentActive(path: string, size: number): Promise<boolean> {
  const from = Math.max(0, size - 64 * 1024);
  let buf: Buffer;
  try {
    buf = await readRange(path, from, size);
  } catch {
    return false;
  }
  const rows = buf.toString('utf8').split('\n').filter((l) => l.trim());
  for (let i = rows.length - 1; i >= 0; i--) {
    try {
      const j = JSON.parse(rows[i]) as { type?: string; message?: { stop_reason?: unknown } };
      if (j.type === 'assistant') return j.message?.stop_reason !== 'end_turn';
      if (j.type === 'user') return true;
    } catch {
      // 首行可能被切半
    }
  }
  return false;
}
