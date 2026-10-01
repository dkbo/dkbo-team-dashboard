// 相容模式 overlay：OS 暫存目錄下 dash-overlay-XXXX，bin/lib/VERSION 來自 vendor/dkbo-status，
// tasks/roles/kinds/.sessions symlink 到舊專案的 .dkbo/（建立後才出現的，下次 get 補連）。每個行程只清自己建的，不用 glob。
import { existsSync, rmSync } from 'node:fs';
import { cp, lstat, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINKS = ['tasks', 'roles', 'kinds', '.sessions'] as const;

export interface OverlayOpts {
  vendorDir: string;
  /** 預設 os.tmpdir()（跟隨 TMPDIR） */
  tmpBase?: string;
}

export class OverlayManager {
  private readonly byProject = new Map<string, Promise<string>>();
  private readonly created: string[] = [];

  constructor(private readonly opts: OverlayOpts) {}

  /** 取某專案 .dkbo 的 overlay；同一專案重用同一個，並補上後來才出現的連結 */
  async get(projectDkbo: string): Promise<string> {
    let p = this.byProject.get(projectDkbo);
    if (!p) {
      p = this.create(projectDkbo);
      this.byProject.set(projectDkbo, p);
      p.catch(() => this.byProject.delete(projectDkbo));
      return p;
    }
    const dir = await p;
    await this.link(projectDkbo, dir);
    return dir;
  }

  paths(): string[] {
    return [...this.created];
  }

  private async create(projectDkbo: string): Promise<string> {
    const dir = await mkdtemp(join(this.opts.tmpBase ?? tmpdir(), 'dash-overlay-'));
    this.created.push(dir);
    const v = this.opts.vendorDir;
    await cp(join(v, 'bin'), join(dir, 'bin'), { recursive: true });
    await cp(join(v, 'lib'), join(dir, 'lib'), { recursive: true });
    await cp(join(v, 'VERSION'), join(dir, 'VERSION'));
    await this.link(projectDkbo, dir);
    return dir;
  }

  /** 專案裡有、overlay 裡還沒有的連結補上；已有的不動 */
  private async link(projectDkbo: string, dir: string): Promise<void> {
    for (const name of LINKS) {
      const target = join(projectDkbo, name);
      const at = join(dir, name);
      if (!existsSync(target) || (await lstat(at).then(() => true, () => false))) continue;
      await symlink(target, at).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== 'EEXIST') throw e; // 同時兩個 get 補同一條
      });
    }
  }

  /** 同步清理（signal／exit handler 用）。rmSync 不跟隨 symlink，只刪連結本身 */
  cleanupSync(): void {
    for (const dir of this.created.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // 清不掉就算了：不能因為清理失敗卡住關機
      }
    }
    this.byProject.clear();
  }
}

