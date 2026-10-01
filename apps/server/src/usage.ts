// 花費與額度趨勢的資料層：每 sampleMs 對 OverviewDoc.agents 取樣，append 到 <dataDir>/samples/YYYY-MM-DD.jsonl。
// server 只寫 dataDir；取樣用 hub 手上已有的 overview，不另外呼叫 herdr。
import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { HEARTBEAT_MS, localDay, PANE_STATUSES, type AgentLive, type OverviewDoc, type UsageSample } from '@dash/shared';

export const DEFAULT_SAMPLE_MS = 60_000;
export const DEFAULT_RETENTION_DAYS = 30;
const SAMPLE_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

export interface UsageOpts {
  /** 絕對路徑 */
  dataDir: string;
  sampleMs: number;
  retentionDays: number;
  now?: () => number;
  /** 讀樣本檔（測試注入以計數讀檔次數） */
  readText?: ReadText;
}

export type ReadText = (path: string) => Promise<string>;

const posInt = (s: string | undefined, dflt: number): number => {
  const n = s === undefined || s.trim() === '' ? NaN : Number(s);
  return Number.isInteger(n) && n > 0 ? n : dflt;
};

/** DASH_DATA_DIR（預設 ${XDG_STATE_HOME:-$HOME/.local/state}/dkbo-dashboard）、DASH_SAMPLE_MS、DASH_RETENTION_DAYS */
export function usageOptsFromEnv(env: NodeJS.ProcessEnv): UsageOpts {
  const state = env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local/state');
  return {
    dataDir: resolve(env.DASH_DATA_DIR || join(state, 'dkbo-dashboard')),
    sampleMs: posInt(env.DASH_SAMPLE_MS, DEFAULT_SAMPLE_MS),
    retentionDays: posInt(env.DASH_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
  };
}

const samplesDir = (dataDir: string) => join(dataDir, 'samples');

/** 去重比對的欄位：這些全沒變且距上一筆 < HEARTBEAT_MS 就不寫 */
const dedupKey = (s: UsageSample) => JSON.stringify([s.cost, s.ctxPct, s.usage5hPct, s.usageWkPct, s.status, s.project, s.taskDir, s.member, s.model, s.effort]);

const toSample = (ts: number, a: AgentLive): UsageSample => ({
  ts,
  paneId: a.paneId,
  agent: a.agent,
  project: a.project,
  taskDir: a.taskDir,
  member: a.member,
  status: a.status,
  cost: a.cost,
  ctxPct: a.ctxPct,
  usage5hPct: a.usage5hPct,
  usageWkPct: a.usageWkPct,
  model: a.model,
  effort: a.effort,
});

export class UsageRecorder {
  private readonly now: () => number;
  /** 去重基準只放記憶體：重啟後第一次取樣每個 pane 都寫 */
  private readonly last = new Map<string, { ts: number; key: string }>();
  private prunedDay: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly o: UsageOpts & { source: () => OverviewDoc }) {
    this.now = o.now ?? Date.now;
  }

  start(): void {
    this.prune(localDay(this.now()));
    if (!this.timer)
      this.timer = setInterval(() => {
        try {
          this.tick();
        } catch (e) {
          console.error(`usage: 取樣失敗：${String(e)}`);
        }
      }, this.o.sampleMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    const doc = this.o.source();
    if (doc.herdr.state === 'down') return;
    const ts = this.now();
    const rows: { s: UsageSample; key: string }[] = [];
    for (const a of doc.agents) {
      const s = toSample(ts, a);
      const key = dedupKey(s);
      const prev = this.last.get(s.paneId);
      if (prev && prev.key === key && ts - prev.ts < HEARTBEAT_MS) continue;
      rows.push({ s, key });
    }
    if (rows.length === 0) return;
    const day = localDay(ts);
    if (this.prunedDay !== day) this.prune(day);
    try {
      mkdirSync(samplesDir(this.o.dataDir), { recursive: true });
      appendFileSync(join(samplesDir(this.o.dataDir), `${day}.jsonl`), rows.map((r) => JSON.stringify(r.s) + '\n').join(''));
    } catch (e) {
      console.error(`usage: 寫入樣本失敗：${String(e)}`);
      return;
    }
    for (const r of rows) this.last.set(r.s.paneId, { ts, key: r.key });
  }

  /** 刪日期早於「today − retentionDays」的 YYYY-MM-DD.jsonl；其他檔名不碰 */
  private prune(today: string): void {
    this.prunedDay = today;
    const [y, m, d] = today.split('-').map(Number);
    const cutoff = localDay(new Date(y, m - 1, d - this.o.retentionDays, 12).getTime());
    let names: string[];
    try {
      names = readdirSync(samplesDir(this.o.dataDir));
    } catch {
      return;
    }
    for (const n of names) {
      if (!SAMPLE_FILE.test(n) || n.slice(0, 10) >= cutoff) continue;
      try {
        rmSync(join(samplesDir(this.o.dataDir), n));
      } catch (e) {
        console.error(`usage: 刪除過期樣本失敗：${String(e)}`);
      }
    }
  }
}

const nullable = <T extends z.ZodType>(t: T) => t.nullable();
const SampleSchema = z.object({
  ts: z.number().finite(),
  paneId: z.string(),
  agent: nullable(z.string()),
  project: nullable(z.string()),
  taskDir: nullable(z.string()),
  member: nullable(z.string()),
  status: z.enum(PANE_STATUSES),
  cost: nullable(z.number().finite()),
  ctxPct: nullable(z.number().finite()),
  usage5hPct: nullable(z.number().finite()),
  usageWkPct: nullable(z.number().finite()),
  // 舊格式樣本沒有這兩欄：缺欄視為 null，不算壞行
  model: nullable(z.string()).default(null),
  effort: nullable(z.string()).default(null),
});

export interface SampleFile {
  name: string;
  samples: UsageSample[];
}

interface FileCache {
  size: number;
  mtimeMs: number;
  samples: UsageSample[];
  skipped: number;
}

function parseFile(text: string): { samples: UsageSample[]; skipped: number } {
  const samples: UsageSample[] = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let j: unknown;
    try {
      j = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    const r = SampleSchema.safeParse(j);
    if (r.success) samples.push(r.data as UsageSample);
    else skipped++;
  }
  return { samples, skipped };
}

/** 讀 <dataDir>/samples/*.jsonl；壞行略過並計數。每個檔依 size／mtime 快取，沒變就不重讀；非同步讀，不長時間卡住事件迴圈 */
export class SampleStore {
  private readonly cache = new Map<string, FileCache>();

  constructor(
    readonly dataDir: string,
    private readonly readText: ReadText = (p) => readFile(p, 'utf8'),
  ) {}

  async read(): Promise<{ samples: UsageSample[]; skipped: number }> {
    const { files, skipped } = await this.files();
    const samples: UsageSample[] = [];
    for (const f of files) for (const x of f.samples) samples.push(x); // 單檔數萬筆，展開參數會撐爆堆疊
    return { samples, skipped };
  }

  /** 依檔名（日期）升冪的各檔樣本；檔案沒變時回同一個 samples 陣列，呼叫端可拿它的身分當快取鍵 */
  async files(): Promise<{ files: SampleFile[]; skipped: number }> {
    const dir = samplesDir(this.dataDir);
    let names: string[];
    try {
      names = readdirSync(dir).filter((n) => SAMPLE_FILE.test(n)).sort();
    } catch {
      this.cache.clear();
      return { files: [], skipped: 0 };
    }
    const files: SampleFile[] = [];
    let skipped = 0;
    const seen = new Set<string>();
    for (const n of names) {
      const f = join(dir, n);
      let c = this.cache.get(n);
      try {
        const st = statSync(f);
        if (!c || c.size !== st.size || c.mtimeMs !== st.mtimeMs) {
          c = { size: st.size, mtimeMs: st.mtimeMs, ...parseFile(await this.readText(f)) };
          this.cache.set(n, c);
        }
      } catch {
        continue; // 讀的當下被刪（保留期）
      }
      seen.add(n);
      files.push({ name: n, samples: c.samples });
      skipped += c.skipped;
    }
    for (const n of this.cache.keys()) if (!seen.has(n)) this.cache.delete(n);
    return { files, skipped };
  }
}
