// ProjectRegistry：設定檔的每個專案 → 原生或相容模式、要跑哪支 dk-status、DK_ROOT 指哪裡。
// 相容判法：專案 .dkbo/bin/dk-status 不存在（直接看要用的東西在不在，比看 VERSION 穩）。
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { ProjectError } from '@dash/shared';
import type { ProjectConfig } from './config.ts';
import type { OverlayManager } from './overlay.ts';

export type Resolved =
  | { ok: true; mode: 'native' | 'compat'; dkboVersion: string | null; dkbo: string }
  | { ok: false; mode: null; dkboVersion: null; error: ProjectError };

const isDir = async (p: string) => (await stat(p).catch(() => null))?.isDirectory() ?? false;

export async function resolveProject(path: string): Promise<Resolved> {
  if (!(await isDir(path))) return { ok: false, mode: null, dkboVersion: null, error: { kind: 'missing', message: 'missing' } };
  const dkbo = join(path, '.dkbo');
  if (!(await isDir(dkbo))) return { ok: false, mode: null, dkboVersion: null, error: { kind: 'no-dkbo', message: 'no-dkbo' } };
  const version = await readFile(join(dkbo, 'VERSION'), 'utf8').then(
    (s) => s.replace(/\s+/g, '') || null,
    () => null,
  );
  const native = await access(join(dkbo, 'bin/dk-status'), constants.X_OK).then(
    () => true,
    () => false,
  );
  return { ok: true, mode: native ? 'native' : 'compat', dkboVersion: version, dkbo };
}

export type Invocation =
  | { ok: true; mode: 'native' | 'compat'; dkboVersion: string | null; bin: string; dkRoot: string; projectRoot: string }
  | { ok: false; mode: 'native' | 'compat' | null; dkboVersion: string | null; error: ProjectError };

export class ProjectRegistry {
  constructor(
    readonly projects: ProjectConfig[],
    private readonly overlays: OverlayManager,
  ) {}

  find(name: string): ProjectConfig | undefined {
    return this.projects.find((p) => p.name === name);
  }

  /** 每次輪詢都重新判斷（專案升級 dkbo 後自動改走原生） */
  async invocation(p: ProjectConfig): Promise<Invocation> {
    const r = await resolveProject(p.path);
    if (!r.ok) return r;
    if (r.mode === 'native') {
      return { ...r, bin: join(r.dkbo, 'bin/dk-status'), dkRoot: r.dkbo, projectRoot: p.path };
    }
    try {
      const overlay = await this.overlays.get(r.dkbo);
      return { ...r, bin: join(overlay, 'bin/dk-status'), dkRoot: overlay, projectRoot: p.path };
    } catch (e) {
      return { ok: false, mode: 'compat', dkboVersion: r.dkboVersion, error: { kind: 'exit', message: `overlay: ${(e as Error).message}` } };
    }
  }
}
