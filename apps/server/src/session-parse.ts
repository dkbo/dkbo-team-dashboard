// session JSONL → 細狀態。純函式（每個 session 一個 reducer，逐行 apply），不碰 I/O。
// 規則與實際欄位見 backend report；文字一律截斷（工具摘要 ≤ 80、問句與錯誤 ≤ 200），提示詞與回覆全文不留在狀態裡。
import type { PaneStatus, SessionLive, Substate } from '@dash/shared';
import { stripAnsi } from './herdr-view.ts';

export type SessionKind = SessionLive['kind'];

export const SUMMARY_MAX = 80;
export const TEXT_MAX = 200;

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
const clip = (s: unknown, n: number): string | null => (typeof s === 'string' && firstLine(s) ? cut(firstLine(s), n) : null);

/** 錯誤文字：API 原樣回的 JSON（`{"error":{"message":…}}`）取內層 message */
const errText = (v: unknown): string | null => {
  if (typeof v === 'string' && v.trimStart().startsWith('{')) {
    try {
      const j = JSON.parse(v) as { error?: { message?: unknown }; message?: unknown };
      const inner = j.error?.message ?? j.message;
      if (typeof inner === 'string') return clip(inner, TEXT_MAX);
    } catch {
      // 不是 JSON，照原文
    }
  }
  return clip(v, TEXT_MAX);
};

const ts = (v: unknown): number | null => {
  if (typeof v !== 'string') return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

const SUMMARY_KEYS = ['command', 'cmd', 'file_path', 'path', 'notebook_path', 'pattern', 'url', 'query', 'description', 'prompt', 'skill'];

/** 工具參數 → 一行摘要（只取白名單鍵的第一行）；取不到就 null */
export function toolSummary(name: string, input: unknown): string | null {
  if (typeof input === 'string') {
    // Codex apply_patch 的 input 是整份 patch：只取檔名
    const m = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/m.exec(input);
    return m ? cut(m[1].trim(), SUMMARY_MAX) : null;
  }
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  for (const k of SUMMARY_KEYS) {
    const v = o[k];
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return clip(v.join(' '), SUMMARY_MAX);
    const c = clip(v, SUMMARY_MAX);
    if (c) return c;
  }
  return null;
}

interface Pending {
  name: string;
  summary: string | null;
}

/** 一個 session 的累積狀態；apply 逐行吃事件，live() 取目前細狀態（subagents 由呼叫端補） */
export class SessionReducer {
  substate: Substate = 'idle';
  since: number | null = null;
  turnStartedAt: number | null = null;
  lastEventAt: number | null = null;
  model: string | null = null;
  effort: string | null = null;
  agentName: string | null = null;
  error: string | null = null;
  question: string | null = null;
  /** 第一個帶時間的事件（Codex 用 session_meta.timestamp） */
  startedAt: number | null = null;
  cwd: string | null = null;
  private readonly pending = new Map<string, Pending>();
  private toolId: string | null = null;

  constructor(
    readonly kind: SessionKind,
    readonly sessionId: string,
  ) {}

  private set(s: Substate, at: number | null, toolId: string | null = null): void {
    if (s !== this.substate || toolId !== this.toolId) this.since = at;
    this.substate = s;
    this.toolId = toolId;
    if (s !== 'error') this.error = null;
    if (s !== 'waiting') this.question = null;
  }

  private newTurn(at: number | null): void {
    this.pending.clear();
    this.turnStartedAt = at;
    this.set('thinking', at);
  }

  private afterTool(at: number | null): void {
    const last = [...this.pending.keys()].at(-1);
    if (last) this.set('running', at, last);
    else this.set('thinking', at);
  }

  apply(ev: unknown): void {
    if (!ev || typeof ev !== 'object') return;
    const e = ev as Record<string, unknown>;
    const at = ts(e.timestamp);
    if (at !== null) {
      this.lastEventAt = at;
      this.startedAt ??= at;
    }
    if (this.kind === 'claude') this.applyClaude(e, at);
    else this.applyCodex(e, at);
  }

  private applyClaude(e: Record<string, unknown>, at: number | null): void {
    if (typeof e.cwd === 'string') this.cwd ??= e.cwd;
    if (e.type === 'agent-name' && typeof e.agentName === 'string') this.agentName = e.agentName;
    if (e.isSidechain === true) return;
    const msg = (e.message ?? {}) as { content?: unknown; stop_reason?: unknown; model?: unknown };
    const blocks = Array.isArray(msg.content) ? (msg.content as Record<string, unknown>[]) : [];

    if (e.type === 'user') {
      if (e.isMeta === true) return;
      const results = blocks.filter((b) => b?.type === 'tool_result');
      if (results.length) {
        for (const r of results) this.pending.delete(String(r.tool_use_id));
        return this.afterTool(at);
      }
      const text = typeof msg.content === 'string' ? msg.content : blocks.filter((b) => b?.type === 'text').map((b) => String(b.text ?? '')).join('\n');
      if (text.startsWith('[Request interrupted by user')) {
        this.pending.clear();
        return this.set('interrupted', at);
      }
      // 內建斜線指令（/model 之類）不打 API，輸出直接寫回來：視為本輪結束
      if (text.startsWith('<local-command-stdout>')) return this.set('done', at);
      if (text.startsWith('<local-command-caveat>') || !text.trim()) return;
      return this.newTurn(at);
    }

    if (e.type === 'assistant') {
      if (e.isApiErrorMessage === true) {
        this.pending.clear();
        this.set('error', at);
        this.error = clip(blocks.find((b) => b?.type === 'text')?.text, TEXT_MAX) ?? (typeof e.error === 'string' ? e.error : 'API error');
        return;
      }
      if (typeof msg.model === 'string' && msg.model !== '<synthetic>') this.model = msg.model;
      if (typeof e.effort === 'string') this.effort = e.effort;
      let text = false;
      let tool = false;
      for (const b of blocks) {
        if (b?.type === 'tool_use') {
          tool = true;
          this.pending.set(String(b.id), { name: String(b.name ?? 'tool'), summary: toolSummary(String(b.name ?? ''), b.input) });
        } else if (b?.type === 'text') text = true;
      }
      const stop = msg.stop_reason;
      if (tool) return this.afterTool(at);
      if (text && (stop === 'end_turn' || stop === 'stop_sequence' || stop === 'refusal')) {
        this.pending.clear();
        return this.set('done', at);
      }
      if (text) return this.set('writing', at);
      if (blocks.some((b) => b?.type === 'thinking')) return this.set('thinking', at);
      return;
    }

    if (e.type === 'system' && e.subtype === 'turn_duration') {
      if (this.substate === 'error' || this.substate === 'interrupted' || this.substate === 'done') return;
      this.pending.clear();
      this.set('done', at);
    }
  }

  private applyCodex(e: Record<string, unknown>, at: number | null): void {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case 'session_meta':
        if (typeof p.cwd === 'string') this.cwd = p.cwd;
        this.startedAt = ts(p.timestamp) ?? this.startedAt;
        return;
      case 'turn_context':
        if (typeof p.model === 'string') this.model = p.model;
        if (typeof p.effort === 'string') this.effort = p.effort;
        return;
      case 'response_item':
        switch (p.type) {
          case 'reasoning':
            return this.pending.size ? undefined : this.set('thinking', at);
          case 'function_call':
          case 'custom_tool_call': {
            const name = String(p.name ?? 'tool');
            let input: unknown = p.input;
            if (typeof p.arguments === 'string') {
              try {
                input = JSON.parse(p.arguments);
              } catch {
                input = null;
              }
            }
            this.pending.set(String(p.call_id), { name, summary: toolSummary(name, input) });
            return this.afterTool(at);
          }
          case 'function_call_output':
          case 'custom_tool_call_output':
            this.pending.delete(String(p.call_id));
            return this.afterTool(at);
        }
        return;
      case 'event_msg':
        switch (p.type) {
          case 'task_started':
            return this.newTurn(at);
          case 'user_message':
            if (this.substate === 'thinking' && !this.pending.size) return;
            return this.newTurn(at);
          case 'agent_reasoning':
            return this.pending.size ? undefined : this.set('thinking', at);
          case 'exec_command_begin':
            this.pending.set(String(p.call_id), { name: 'exec_command', summary: toolSummary('exec_command', p) });
            return this.afterTool(at);
          case 'exec_command_end':
            this.pending.delete(String(p.call_id));
            return this.afterTool(at);
          case 'agent_message':
            return this.set('writing', at);
          case 'task_complete': {
            this.pending.clear();
            const err = p.error as { message?: unknown } | null | undefined;
            if (err) {
              this.set('error', at);
              this.error = errText(err.message) ?? 'error';
            } else this.set('done', at);
            return;
          }
          case 'turn_aborted':
            this.pending.clear();
            return this.set('interrupted', at);
          case 'error':
          case 'stream_error':
            this.set('error', at);
            this.error = errText(p.message) ?? 'error';
            return;
        }
        if (typeof p.type === 'string' && (p.type.endsWith('_approval_request') || p.type === 'request_user_input' || p.type === 'elicitation_request')) {
          this.set('waiting', at);
          const cmd = Array.isArray(p.command) ? `執行 ${p.command.join(' ')}` : null;
          this.question = clip(p.reason, TEXT_MAX) ?? clip(p.message, TEXT_MAX) ?? (cmd && cut(cmd, TEXT_MAX)) ?? '等待核准';
        }
        return;
    }
  }

  live(subagents = 0): SessionLive {
    const tool = this.substate === 'running' || this.substate === 'waiting' ? (this.toolId ? (this.pending.get(this.toolId) ?? null) : null) : null;
    return {
      kind: this.kind,
      sessionId: this.sessionId,
      substate: this.substate,
      substateSince: this.since,
      turnStartedAt: this.turnStartedAt,
      tool: tool && { name: tool.name, summary: tool.summary },
      question: this.substate === 'waiting' ? this.question : null,
      error: this.substate === 'error' ? this.error : null,
      subagents,
      lastEventAt: this.lastEventAt,
      model: this.model,
    };
  }
}

/** 測試與一次性計算用：整串事件折成 SessionLive */
export function foldSession(kind: SessionKind, sessionId: string, events: unknown[]): SessionLive {
  const r = new SessionReducer(kind, sessionId);
  for (const e of events) r.apply(e);
  return r.live();
}

/**
 * 套 herdr 原始狀態：JSONL error ＞ herdr 原始 blocked→waiting ＞ JSONL 其他規則。
 * raw 必須是 herdr 給的原值（不是「error 改 blocked」之後的值）；blockedSince 是 server 觀察到轉 blocked 的時間。
 */
export function combineHerdr(live: SessionLive, raw: PaneStatus | null, blockedSince: number | null, screenQuestion: string | null): SessionLive {
  if (live.substate === 'error' || raw !== 'blocked') return live;
  return {
    ...live,
    substate: 'waiting',
    substateSince: blockedSince ?? live.substateSince,
    question: live.substate === 'waiting' ? live.question : screenQuestion,
    error: null,
  };
}

const BOX = /^[\s│┃|╭╮╰╯─━┌┐└┘├┤>❯·•*]+|[\s│┃|╭╮╰╯─━┌┐└┘├┤]+$/g;

/** pane 畫面（ANSI）→ 最後一句問句（以 ? 或 ？ 結尾的行），≤ 200 字；沒有就 null */
export function questionFromScreen(ansi: string): string | null {
  const rows = stripAnsi(ansi)
    .map((l) => l.replace(BOX, '').trim())
    .filter(Boolean);
  const q = rows.reverse().find((l) => /[?？]$/.test(l));
  return q ? cut(q, TEXT_MAX) : null;
}
