// 派工對照表：被監看專案的 `.dkbo/roles/*.md` 與 `.dkbo/kinds/*.sh`，只以文字讀進來交給 shared 的解析函式。
// 絕不 source、不執行這些檔（kinds 檔是 shell script）。每個檔依 size／mtime 快取，沒變就不重讀；
// 全部沒變時回同一個 TierConfig 物件，呼叫端可拿它的身分當快取鍵。
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseKindFile, parseRoleFile, type RoleSpec, type TierConfig } from '@dash/shared';
import type { ReadText } from './usage.ts';

interface FileCache<T> {
  size: number;
  mtimeMs: number;
  value: T;
}

interface ProjectCache {
  files: Map<string, FileCache<RoleSpec | Record<string, string>>>;
  /** 上一次組出的對照表與組它用的檔（檔名＋快取項）；全部相同就回它 */
  config: TierConfig;
  parts: string;
}

const DIRS = [
  { sub: 'roles', ext: '.md', parse: parseRoleFile },
  { sub: 'kinds', ext: '.sh', parse: parseKindFile },
] as const;

export class TierReader {
  private readonly cache = new Map<string, ProjectCache>();

  constructor(private readonly readText: ReadText = (p) => readFile(p, 'utf8')) {}

  /** projectPath＝專案根目錄（底下有 .dkbo/）；目錄或檔讀不到就當沒有 */
  async read(projectPath: string): Promise<TierConfig> {
    const prev = this.cache.get(projectPath);
    const files = new Map<string, FileCache<RoleSpec | Record<string, string>>>();
    const config: TierConfig = { roles: {}, kinds: {} };
    const parts: string[] = [];
    for (const { sub, ext, parse } of DIRS) {
      const dir = join(projectPath, '.dkbo', sub);
      const names = await readdir(dir).then(
        (xs) => xs.filter((n) => n.endsWith(ext) && n.length > ext.length).sort(),
        () => [] as string[],
      );
      for (const n of names) {
        const f = join(dir, n);
        let c = prev?.files.get(f);
        try {
          const st = await stat(f);
          if (!st.isFile()) continue;
          if (!c || c.size !== st.size || c.mtimeMs !== st.mtimeMs) c = { size: st.size, mtimeMs: st.mtimeMs, value: parse(await this.readText(f)) };
        } catch {
          continue; // 讀的當下被刪
        }
        files.set(f, c);
        parts.push(`${f}\u0000${c.size}\u0000${c.mtimeMs}`);
        const key = n.slice(0, -ext.length);
        if (sub === 'roles') config.roles[key] = c.value as RoleSpec;
        else config.kinds[key] = c.value as Record<string, string>;
      }
    }
    const joined = parts.join('\n');
    if (prev && prev.parts === joined) {
      prev.files = files;
      return prev.config;
    }
    this.cache.set(projectPath, { files, config, parts: joined });
    return config;
  }
}
