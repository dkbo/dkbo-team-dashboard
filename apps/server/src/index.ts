// server 入口：讀 env（PORT、DASHBOARD_CONFIG、DASH_HERDR_*、DASH_GIT_BIN、DASH_DATA_DIR／DASH_SAMPLE_MS／DASH_RETENTION_DAYS），只 listen 127.0.0.1。
// SIGINT／SIGTERM：先收掉在途 dk-status 行程群組（SIGTERM，2 秒後 SIGKILL），再清本行程建的 overlay，才退出；總時限 5 秒內。
import type { AddressInfo } from 'node:net';
import { loadConfig } from './config.ts';
import { herdrOptsFromEnv } from './herdr.ts';
import { createDashServer, HOST, listen } from './server.ts';
import { usageOptsFromEnv } from './usage.ts';

const port = Number(process.env.PORT ?? 4317);
const dash = createDashServer({
  config: loadConfig(),
  herdr: herdrOptsFromEnv(process.env),
  usage: usageOptsFromEnv(process.env),
  gitBin: process.env.DASH_GIT_BIN || undefined,
});
process.on('exit', () => dash.overlays.cleanupSync());

dash.start();
const srv = await listen(dash.app, port);
console.log(`dashboard server listening on http://${HOST}:${(srv.address() as AddressInfo).port}`);
void dash.warm(); // 背景預熱趨勢資料，不擋 listen；失敗只記 log

/** 收子行程最多 2 秒＋SIGKILL；萬一還卡著，這條保證不超過 playwright gracefulShutdown 的 5 秒 */
const HARD_EXIT_MS = 4500;

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  setTimeout(() => {
    dash.stop();
    process.exit(0);
  }, HARD_EXIT_MS).unref();
  srv.close();
  srv.closeAllConnections?.();
  void dash.shutdown().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
