// 把各元件接起來。index.ts 讀 env 後呼叫這裡；測試直接呼叫 createDashServer。
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import type { HerdrView } from '@dash/shared';
import { createApp } from './app.ts';
import { StatusCollector } from './collector.ts';
import { REPO_ROOT, type DashboardConfig } from './config.ts';
import { ChildTracker } from './dkstatus.ts';
import { GitReader } from './git.ts';
import { HerdrBridge, type HerdrOpts } from './herdr.ts';
import { HerdrReader } from './herdr-view.ts';
import { Hub } from './hub.ts';
import { OverlayManager } from './overlay.ts';
import { ProjectRegistry } from './registry.ts';
import { SessionTracker, type SessionOpts } from './sessions.ts';
import { TrendsService } from './trends.ts';
import { SampleStore, UsageRecorder, type UsageOpts } from './usage.ts';

export const HOST = '127.0.0.1';

export interface DashServerOpts {
  config: DashboardConfig;
  herdr: HerdrOpts;
  vendorDir?: string;
  timeoutMs?: number;
  debounceMs?: number;
  /** git 執行檔（測試用）；預設 PATH 上的 git */
  gitBin?: string;
  /** 趨勢取樣與 /api/trends、/api/costs；不給就不取樣、不掛這兩支（測試預設不碰任何資料目錄） */
  usage?: UsageOpts;
  /** session 細狀態（辦公室視圖）；不給就關閉（測試預設不碰任何 home 目錄） */
  sessions?: SessionOpts;
}

export interface DashServer {
  app: Hono;
  overlays: OverlayManager;
  collector: StatusCollector;
  herdr: HerdrBridge;
  reader: HerdrReader;
  hub: Hub;
  sessions: SessionTracker;
  usage: UsageRecorder | null;
  start(): void;
  /** 停輪詢、斷 herdr、SIGKILL 在途 dk-status、清自己建的 overlay（同步，測試用） */
  stop(): void;
  /** 背景預熱趨勢資料（listen 後呼叫）；失敗只記 log，不丟例外 */
  warm(): Promise<void>;
  /** 關機用：停輪詢、斷 herdr，在途 dk-status 先 SIGTERM（2 秒後 SIGKILL）、全部結束後才清 overlay */
  shutdown(): Promise<void>;
}

export function createDashServer(o: DashServerOpts): DashServer {
  const overlays = new OverlayManager({ vendorDir: o.vendorDir ?? join(REPO_ROOT, 'vendor/dkbo-status') });
  const registry = new ProjectRegistry(o.config.projects, overlays);
  const tracker = new ChildTracker();
  const collector = new StatusCollector({ registry, pollMs: o.config.pollMs, timeoutMs: o.timeoutMs, tracker });
  const herdr = new HerdrBridge(o.herdr);
  const reader = new HerdrReader({ bin: o.herdr.bin, off: o.herdr.off, socket: o.herdr.socket, backoffBaseMs: o.herdr.backoffBaseMs, subscribeTimeoutMs: o.herdr.subscribeTimeoutMs });
  const sessions = new SessionTracker(o.sessions ?? { claudeDir: '', codexDir: '', off: true }, {
    projects: o.config.projects,
    panes: () => herdr.panes(),
    sessionIds: () => herdr.sessionIds(),
    herdrUp: () => herdr.status().lastAt !== null && herdr.status().state !== 'down',
    paneSince: () => {
      const m = new Map<string, number>();
      for (const p of collector.projects()) for (const t of Object.values(p.active)) for (const x of t.panes) if (x.pane && x.since_epoch) m.set(x.pane, x.since_epoch * 1000);
      return m;
    },
    screen: async (id) => (await reader.getScreen(id, 'visible')).ansi,
  });
  // tracker 要先看到 herdr 的變動（blocked 轉變、重配），hub 才 flush
  herdr.on('change', () => sessions.refreshPanes());
  const hub = new Hub({ collector, herdr, sessions, debounceMs: o.debounceMs });
  reader.on('view', (v: HerdrView) => hub.broadcast({ event: 'herdr.view', data: hub.decorateView(v) }));
  herdr.on('change', () => reader.notify());
  const uo = o.usage && { ...o.usage, dataDir: resolve(o.usage.dataDir) };
  const usage = uo ? new UsageRecorder({ ...uo, source: () => hub.overview() }) : null;
  const trends = uo
    ? new TrendsService({
        store: new SampleStore(uo.dataDir, uo.readText),
        now: uo.now ?? Date.now,
        names: () => Object.fromEntries(hub.overview().agents.flatMap((a) => (a.name ? [[a.paneId, a.name]] : []))),
        dispatch: (refs) => collector.dispatchIndex(refs),
      })
    : undefined;
  const git = new GitReader({ projects: o.config.projects, bin: o.gitBin });
  const app = createApp(collector, hub, reader, trends, git);
  const halt = () => {
    sessions.stop();
    usage?.stop();
    collector.stop();
    herdr.stop();
    reader.stop();
    hub.stop();
  };
  return {
    app,
    overlays,
    collector,
    herdr,
    reader,
    hub,
    sessions,
    usage,
    start() {
      collector.start();
      herdr.start();
      reader.start();
      sessions.start();
      usage?.start();
    },
    stop() {
      halt();
      tracker.killSync();
      overlays.cleanupSync();
    },
    async warm() {
      const t0 = Date.now();
      try {
        await trends?.warm();
        if (trends) console.log(`trends prewarmed in ${Date.now() - t0}ms`);
      } catch (e) {
        console.error(`trends prewarm failed: ${(e as Error).message}`);
      }
    },
    async shutdown() {
      halt();
      await tracker.terminate();
      overlays.cleanupSync();
    },
  };
}

/** 只 bind 127.0.0.1 */
export function listen(app: Hono, port: number): Promise<Server> {
  return new Promise((resolve) => {
    const srv = serve({ fetch: app.fetch, port, hostname: HOST }, () => resolve(srv as Server)) as Server;
  });
}
