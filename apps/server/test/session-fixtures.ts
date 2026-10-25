// session JSONL 的去識別化 fixture 產生器：事件時間一律相對傳入的 t0（假時鐘），不寫死日期。
// 形狀照 Claude Code 2.1.x 與 Codex 0.x 實際 JSONL 的欄位（見 backend report），內容全是假的。
import { mkdirSync, utimesSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const iso = (ms: number) => new Date(ms).toISOString();

/** Claude 把 cwd 的非英數字元換成 `-` 當資料夾名 */
export const claudeDirName = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-');

export const cl = {
  meta: (sid: string, cwd: string, at: number) => ({ type: 'permission-mode', permissionMode: 'default', sessionId: sid, cwd, timestamp: iso(at) }),
  agentName: (sid: string, name: string) => ({ type: 'agent-name', agentName: name, sessionId: sid }),
  prompt: (sid: string, cwd: string, at: number, text = 'FAKE-PROMPT-do the thing') => ({
    type: 'user',
    sessionId: sid,
    cwd,
    timestamp: iso(at),
    isSidechain: false,
    message: { role: 'user', content: text },
  }),
  thinking: (sid: string, at: number, model = 'claude-opus-5-5') => ({
    type: 'assistant',
    sessionId: sid,
    timestamp: iso(at),
    isSidechain: false,
    effort: 'medium',
    message: { id: 'msg_1', model, role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: 'FAKE-THOUGHT' }] },
  }),
  text: (sid: string, at: number, stop: string | null = 'end_turn', text = 'FAKE-REPLY-all done') => ({
    type: 'assistant',
    sessionId: sid,
    timestamp: iso(at),
    isSidechain: false,
    message: { id: 'msg_2', model: 'claude-opus-5-5', role: 'assistant', stop_reason: stop, content: [{ type: 'text', text }] },
  }),
  tool: (sid: string, at: number, id: string, name: string, input: Record<string, unknown>) => ({
    type: 'assistant',
    sessionId: sid,
    timestamp: iso(at),
    isSidechain: false,
    message: { id: 'msg_3', model: 'claude-opus-5-5', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] },
  }),
  result: (sid: string, at: number, id: string) => ({
    type: 'user',
    sessionId: sid,
    timestamp: iso(at),
    isSidechain: false,
    toolUseResult: { stdout: 'FAKE-OUTPUT' },
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'FAKE-OUTPUT', is_error: false }] },
  }),
  turnEnd: (sid: string, at: number) => ({ type: 'system', subtype: 'turn_duration', durationMs: 1000, sessionId: sid, timestamp: iso(at), isMeta: false }),
  interrupt: (sid: string, at: number) => ({
    type: 'user',
    sessionId: sid,
    timestamp: iso(at),
    isSidechain: false,
    message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] },
  }),
  apiError: (sid: string, at: number) => ({
    type: 'assistant',
    sessionId: sid,
    timestamp: iso(at),
    isSidechain: false,
    isApiErrorMessage: true,
    error: 'server_error',
    message: { model: '<synthetic>', role: 'assistant', stop_reason: 'stop_sequence', content: [{ type: 'text', text: 'API Error: Connection lost mid-response.\nsecond line' }] },
  }),
  noise: (sid: string, at: number) => ({ type: 'attachment', sessionId: sid, timestamp: iso(at), attachment: { type: 'x' } }),
};

export const cx = {
  meta: (id: string, cwd: string, at: number) => ({
    timestamp: iso(at),
    type: 'session_meta',
    payload: { id, session_id: id, timestamp: iso(at), cwd, originator: 'codex_cli_rs', cli_version: '0.0.0', base_instructions: { text: 'FAKE-INSTRUCTIONS' } },
  }),
  context: (at: number, model = 'gpt-5.5', effort = 'high') => ({ timestamp: iso(at), type: 'turn_context', payload: { turn_id: 't1', cwd: '/x', model, effort } }),
  ev: (at: number, payload: Record<string, unknown>) => ({ timestamp: iso(at), type: 'event_msg', payload }),
  item: (at: number, payload: Record<string, unknown>) => ({ timestamp: iso(at), type: 'response_item', payload }),
  started: (at: number) => cx.ev(at, { type: 'task_started', turn_id: 't1' }),
  user: (at: number) => cx.ev(at, { type: 'user_message', message: 'FAKE-PROMPT-codex' }),
  reasoning: (at: number) => cx.item(at, { type: 'reasoning', summary: [], content: null, encrypted_content: 'x' }),
  call: (at: number, id: string, cmd = 'pnpm test') =>
    cx.item(at, { type: 'function_call', name: 'exec_command', call_id: id, arguments: JSON.stringify({ cmd, workdir: '/x' }) }),
  output: (at: number, id: string) => cx.item(at, { type: 'function_call_output', call_id: id, output: 'FAKE-OUTPUT' }),
  message: (at: number) => cx.ev(at, { type: 'agent_message', message: 'FAKE-REPLY-codex', phase: null }),
  complete: (at: number, error: { message: string; codex_error_info: string } | null = null) =>
    cx.ev(at, { type: 'task_complete', turn_id: 't1', last_agent_message: 'FAKE-REPLY-codex', ...(error ? { error } : {}) }),
  aborted: (at: number) => cx.ev(at, { type: 'turn_aborted', turn_id: 't1', reason: 'interrupted' }),
  error: (at: number) => cx.ev(at, { type: 'error', message: 'stream disconnected before completion\nretrying' }),
  approval: (at: number) => cx.ev(at, { type: 'exec_approval_request', call_id: 'c9', command: ['rm', 'build'], cwd: '/x', reason: '要刪除 build 資料夾嗎？' }),
  tokens: (at: number) => cx.ev(at, { type: 'token_count', info: null, rate_limits: null }),
};

export const lines = (events: unknown[]) => events.map((e) => JSON.stringify(e) + '\n').join('');

/** 寫 JSONL 檔並把 mtime 設成 mtimeMs */
export function writeJsonl(path: string, events: unknown[], mtimeMs?: number): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines(events));
  if (mtimeMs !== undefined) utimesSync(path, mtimeMs / 1000, mtimeMs / 1000);
  return path;
}

export function appendJsonl(path: string, events: unknown[], mtimeMs?: number): void {
  appendFileSync(path, lines(events));
  if (mtimeMs !== undefined) utimesSync(path, mtimeMs / 1000, mtimeMs / 1000);
}

export const claudeFile = (claudeDir: string, cwd: string, sid: string) => join(claudeDir, 'projects', claudeDirName(cwd), `${sid}.jsonl`);

/** `<codexDir>/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl`，日期夾取 at 當天（UTC） */
export function codexFile(codexDir: string, at: number, id: string): string {
  const d = new Date(at);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}-${p2(d.getUTCMinutes())}-${p2(d.getUTCSeconds())}`;
  return join(codexDir, 'sessions', String(d.getUTCFullYear()), p2(d.getUTCMonth() + 1), p2(d.getUTCDate()), `rollout-${ts}-${id}.jsonl`);
}
