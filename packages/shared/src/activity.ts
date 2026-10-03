// 總覽活動欄：把進行中任務與 24 小時內結案任務的 process 事件、messages.log 訊息合成一條時間線（新到舊）。
// server 的 GET /api/activity 與前端測試共用這個純函式；規則見 brief「活動 feed 的唯一規則」。
import { isActiveStatus, isClosedStatus, type TaskDetail, type Ts } from './dkstatus.ts';

export interface ActivityItem {
  project: string;
  taskDir: string;
  taskShort: string;
  /** 原始時間戳（本地 `YYYY-MM-DDTHH:MM`） */
  ts: Ts;
  /** ts 轉 epoch ms（以執行環境的本地時區解讀） */
  at: number;
  source: 'event' | 'message';
  /** event 為 kind（如 `wave-open`）；message 為 type（如 `DONE`） */
  type: string;
  /** message 為 from；event 為 null（前端顯示成 leader） */
  actor: string | null;
  /** 原文；超過 ACTIVITY_TEXT_MAX 字元截斷並加 `…` */
  text: string;
}

export interface ActivityResponse {
  generatedAt: number;
  items: ActivityItem[];
}

export interface ActivityTask {
  project: string;
  detail: TaskDetail;
}

/** 收錄的 process 事件種類；其他（minor、commit、watch…）略過 */
export const ACTIVITY_EVENT_KINDS: readonly string[] = [
  'task-new',
  'gate1',
  'brief-review',
  'spawn',
  'wave-open',
  'dev-done',
  'review',
  'ruling',
  'timeout',
  'wave-close',
  'gate3',
  'task-close',
];
/** 收錄的訊息類型；其他（ACK、TASK、QUESTION、ANSWER、UNDELIVERED…）略過 */
export const ACTIVITY_MESSAGE_TYPES: readonly string[] = ['DONE', 'ESCALATE', 'BUG', 'FIXED', 'BLOCKED', 'LIMIT', 'TIMEOUT', 'DECISION', 'STOP'];
export const ACTIVITY_TEXT_MAX = 300;
/** 已結案任務 closed_at 在 now 之前這麼久以內才收 */
export const ACTIVITY_CLOSED_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_LIMIT_DEFAULT = 50;
export const ACTIVITY_LIMIT_MAX = 200;

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `YYYY-MM-DDTHH:MM`（本地時間）→ epoch ms；格式或日期不合法回 null */
export function tsToEpochMs(ts: string | null | undefined): number | null {
  const m = ts ? TS_RE.exec(ts) : null;
  if (!m) return null;
  const [y, mo, d, hh, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, hh, mi);
  // Date 會把 2 月 30 日、24 時這類溢位進位；欄位對不回來就是不存在的時間
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || date.getHours() !== hh || date.getMinutes() !== mi) return null;
  return date.getTime();
}

const clip = (text: string) => {
  const cps = Array.from(text);
  return cps.length > ACTIVITY_TEXT_MAX ? cps.slice(0, ACTIVITY_TEXT_MAX).join('') + '…' : text;
};

/** 進行中任務都收；已結案任務 closed_at 在 now−24h 之內才收 */
function inWindow(t: TaskDetail, now: number): boolean {
  if (isActiveStatus(t.status)) return true;
  if (!isClosedStatus(t.status)) return false;
  const closed = tsToEpochMs(t.closed_at);
  return closed !== null && closed >= now - ACTIVITY_CLOSED_WINDOW_MS;
}

/**
 * 合併各任務的 events／messages 成活動時間線：at 降冪；同 at 依 project、taskDir 升冪；
 * 同任務 message 先於 event；同 source 原檔較後的行在前。取前 limit 筆。
 */
export function activityFeed(tasks: ActivityTask[], opts: { now: number; limit: number }): ActivityItem[] {
  const rows: { item: ActivityItem; line: number }[] = [];
  for (const { project, detail: t } of tasks) {
    if (!inWindow(t, opts.now)) continue;
    const base = { project, taskDir: t.dir, taskShort: t.short };
    t.events.forEach((e, line) => {
      const at = tsToEpochMs(e.ts);
      if (at === null || !ACTIVITY_EVENT_KINDS.includes(e.kind)) return;
      rows.push({ item: { ...base, ts: e.ts, at, source: 'event', type: e.kind, actor: null, text: clip(e.text) }, line });
    });
    t.messages.forEach((m, line) => {
      const at = tsToEpochMs(m.ts);
      if (at === null || !ACTIVITY_MESSAGE_TYPES.includes(m.type)) return;
      rows.push({ item: { ...base, ts: m.ts, at, source: 'message', type: m.type, actor: m.from, text: clip(m.text) }, line });
    });
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  rows.sort(
    (a, b) =>
      b.item.at - a.item.at ||
      cmp(a.item.project, b.item.project) ||
      cmp(a.item.taskDir, b.item.taskDir) ||
      (a.item.source === b.item.source ? 0 : a.item.source === 'message' ? -1 : 1) ||
      b.line - a.line,
  );
  return rows.slice(0, Math.max(0, opts.limit)).map((r) => r.item);
}
