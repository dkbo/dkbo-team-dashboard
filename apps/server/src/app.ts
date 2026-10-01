// HTTP／SSE API（契約見 brief「HTTP／SSE API」）。全部唯讀。
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { GIT_LOG_DEFAULT, GIT_LOG_MAX, type HistoryResponse, type SseEvent, type TaskDetailResponse } from '@dash/shared';
import type { StatusCollector } from './collector.ts';
import { BadGitRead, GitFailure, UnknownCommit, UnknownFile, type GitReader } from './git.ts';
import { BadRead, HerdrUnavailable, UnknownPane, type HerdrReader } from './herdr-view.ts';
import type { Hub } from './hub.ts';
import { isCostRange, isTrendRange, type TrendsService } from './trends.ts';

export const SSE_PING_MS = 15_000;

/** 任務資料夾名（2026-09-26-debt）或短名（debt）；其他一律 404，不交給 dk-status */
export const TASK_DIR_RE = /^(\d{4}-\d{2}-\d{2}-)?[a-z0-9][a-z0-9-]{0,63}$/;

export function createApp(collector: StatusCollector, hub: Hub, reader: HerdrReader, trends?: TrendsService, git?: GitReader): Hono {
  const app = new Hono();

  const herdrError = (e: unknown) =>
    e instanceof UnknownPane
      ? ({ body: { error: { kind: 'missing', message: 'pane not found' } }, status: 404 } as const)
      : e instanceof BadRead
      ? ({ body: { error: { kind: 'bad-request', message: String(e) } }, status: 400 } as const)
      : ({ body: { error: { kind: 'herdr', message: e instanceof HerdrUnavailable ? e.message : String(e) } }, status: 503 } as const);

  // herdr 鏡像：只有 GET，底下只會跑 `herdr api snapshot`／`herdr pane read`（見 herdr-view.ts 白名單）
  app.get('/api/herdr/view', async (c) => {
    try {
      return c.json(await reader.getView());
    } catch (e) {
      const r = herdrError(e);
      return c.json(r.body, r.status);
    }
  });

  app.get('/api/herdr/search', async (c) => {
    try {
      return c.json(await reader.search(c.req.query('q') ?? ''));
    } catch (e) {
      const r = herdrError(e);
      return c.json(r.body, r.status);
    }
  });

  app.get('/api/herdr/panes/:id/screen', async (c) => {
    try {
      const source = c.req.query('source') ?? 'visible';
      const lines = c.req.query('lines');
      if ((source !== 'visible' && source !== 'recent') || (lines !== undefined && !/^\d{1,5}$/.test(lines)))
        return c.json({ error: { kind: 'bad-request', message: 'source 只能是 visible／recent，lines 為正整數' } }, 400);
      return c.json(await reader.getScreen(c.req.param('id'), source, lines === undefined ? undefined : Number(lines)));
    } catch (e) {
      const r = herdrError(e);
      return c.json(r.body, r.status);
    }
  });

  app.get('/api/overview', (c) => c.json(hub.overview()));

  app.get('/api/projects/:name/tasks/:dir', async (c) => {
    const { name, dir } = c.req.param();
    if (!TASK_DIR_RE.test(dir)) return c.json({ error: { kind: 'missing', message: 'bad task dir' } }, 404);
    const r = await collector.detail(name, dir);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    const body: TaskDetailResponse = {
      project: name,
      detail: r.doc,
      panes: hub.taskPanes(name, r.doc.task.dir),
      dispatch: await collector.dispatchOf(name, r.doc.task),
    };
    return c.json(body);
  });

  app.get('/api/history', async (c) => {
    const body: HistoryResponse = { tasks: await collector.history() };
    return c.json(body);
  });

  // 趨勢：只讀 dataDir 的樣本檔；沒設定資料目錄（測試）時不掛
  if (trends) {
    const badRange = (allowed: string) => ({ error: { kind: 'bad-request', message: `range 只能是 ${allowed}` } });
    app.get('/api/trends', async (c) => {
      const range = c.req.query('range') ?? '24h';
      if (!isTrendRange(range)) return c.json(badRange('6h／24h／7d／30d'), 400);
      return c.json(await trends.trends(range));
    });
    app.get('/api/costs', async (c) => {
      const range = c.req.query('range') ?? '24h';
      if (!isCostRange(range)) return c.json(badRange('6h／24h／7d／30d／all'), 400);
      return c.json(await trends.costs(range));
    });
  }

  // git 唯讀檢視：只有 GET，底下只會跑 gitArgs 白名單內的 status／worktree list／log／show／diff-tree（含單檔 -p）
  if (git) {
    const gitError = (e: unknown) =>
      e instanceof UnknownCommit
        ? ({ body: { error: { kind: 'missing', message: 'commit not found' } }, status: 404 } as const)
        : e instanceof UnknownFile
        ? ({ body: { error: { kind: 'missing', message: 'file not changed in this commit' } }, status: 404 } as const)
        : e instanceof BadGitRead
        ? ({ body: { error: { kind: 'bad-request', message: e.message } }, status: 400 } as const)
        : e instanceof GitFailure && e.error.kind === 'missing'
        ? ({ body: { error: e.error }, status: 404 } as const)
        : e instanceof GitFailure && e.error.kind === 'not-git'
        ? ({ body: { error: e.error }, status: 409 } as const)
        : ({ body: { error: e instanceof GitFailure ? e.error : { kind: 'exit', message: String(e) } }, status: 503 } as const);

    app.get('/api/git', async (c) => c.json(await git.summaries()));

    app.get('/api/git/:name', async (c) => {
      const limit = c.req.query('limit') ?? String(GIT_LOG_DEFAULT);
      if (!/^\d{1,4}$/.test(limit) || Number(limit) < 1 || Number(limit) > GIT_LOG_MAX)
        return c.json({ error: { kind: 'bad-request', message: `limit 為 1–${GIT_LOG_MAX}` } }, 400);
      try {
        return c.json(await git.repo(c.req.param('name'), Number(limit)));
      } catch (e) {
        const r = gitError(e);
        return c.json(r.body, r.status);
      }
    });

    app.get('/api/git/:name/commits/:hash/diff', async (c) => {
      const path = c.req.query('path');
      if (!path) return c.json({ error: { kind: 'bad-request', message: '缺少 path' } }, 400);
      try {
        return c.json(await git.diff(c.req.param('name'), c.req.param('hash'), path));
      } catch (e) {
        const r = gitError(e);
        return c.json(r.body, r.status);
      }
    });

    app.get('/api/git/:name/commits/:hash', async (c) => {
      try {
        return c.json(await git.commit(c.req.param('name'), c.req.param('hash')));
      } catch (e) {
        const r = gitError(e);
        return c.json(r.body, r.status);
      }
    });
  }

  app.get('/api/stream', (c) =>
    streamSSE(c, async (stream) => {
      // 立刻寫一個註解：Node 在第一個 body chunk 前不送 header，經 vite proxy 時 EventSource 會一直不 open
      let chain: Promise<unknown> = stream
        .write(': connected\n\n')
        .then(() => undefined)
        .catch(() => undefined);
      const onEvent = (e: SseEvent) => {
        chain = chain.then(() => stream.writeSSE({ event: e.event, data: JSON.stringify(e.data) })).catch(() => undefined);
      };
      hub.on('sse', onEvent);
      const ping = setInterval(() => {
        chain = chain.then(() => stream.write(': ping\n\n')).then(() => undefined).catch(() => undefined);
      }, SSE_PING_MS);
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
        c.req.raw.signal.addEventListener('abort', () => resolve());
      });
      clearInterval(ping);
      hub.off('sse', onEvent);
    }),
  );

  app.notFound((c) => c.json({ error: { kind: 'missing', message: 'not found' } }, 404));
  return app;
}
