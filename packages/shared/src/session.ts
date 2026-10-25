// 辦公室視圖的 session 資料（共用契約「session 資料」，擁有者 backend）。
// server 唯讀讀 Claude Code／Codex 的 session JSONL，與 herdr 狀態合算出細狀態後經 API 與 SSE 推出。

export const SUBSTATES = ['thinking', 'running', 'writing', 'waiting', 'done', 'interrupted', 'error', 'idle'] as const;
export type Substate = (typeof SUBSTATES)[number];

/** 一個 session 的即時細狀態（時間皆 epoch ms） */
export interface SessionLive {
  kind: 'claude' | 'codex';
  sessionId: string;
  substate: Substate;
  /** 進入目前細狀態的時間（JSONL 事件自帶 timestamp；herdr 轉出的 waiting 取 server 觀察到 blocked 的時間） */
  substateSince: number | null;
  /** 本輪開始（使用者送出提示）的時間 */
  turnStartedAt: number | null;
  /** running 時的工具；summary 為參數摘要（≤ 80 字） */
  tool: { name: string; summary: string | null } | null;
  /** waiting 時的問句（≤ 200 字） */
  question: string | null;
  /** error 時的錯誤第一行（≤ 200 字） */
  error: string | null;
  /** 執行中的 subagent 數 */
  subagents: number;
  lastEventAt: number | null;
  model: string | null;
}

export interface OfficeSession extends SessionLive {
  /** paneId ?? 's:' + sessionId */
  id: string;
  paneId: string | null;
  project: string;
  cwd: string;
  taskDir: string | null;
  member: string | null;
  role: string | null;
  leader: boolean;
  agentName: string | null;
  effort: string | null;
  cost: number | null;
  ctxPct: number | null;
}

/** GET /api/sessions、SSE sessions.updated */
export interface SessionsDoc {
  generatedAt: number;
  sessions: OfficeSession[];
}
