import { describe, expect, it } from 'vitest';
import { combineHerdr, foldSession, questionFromScreen, toolSummary } from '../src/session-parse.ts';
import { cl, cx } from './session-fixtures.ts';

const T = 1_000_000_000_000;
const S = 'sid-1';
const C = '/fake/proj';
const s = (n: number) => T + n * 1000;

describe('Claude 細狀態', () => {
  it('未配對 tool_result 的 tool_use ＝ running，帶工具名與參數摘要', () => {
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.thinking(S, s(1)), cl.tool(S, s(2), 'tu1', 'Bash', { command: 'pnpm test\nsecond', description: 'x' })]);
    expect(l).toMatchObject({ kind: 'claude', sessionId: S, substate: 'running', substateSince: s(2), turnStartedAt: s(0), tool: { name: 'Bash', summary: 'pnpm test' }, model: 'claude-opus-5-5', lastEventAt: s(2) });
  });

  it('tool_result 之後 ＝ thinking', () => {
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.tool(S, s(2), 'tu1', 'Read', { file_path: '/fake/proj/a.ts' }), cl.result(S, s(3), 'tu1')]);
    expect(l).toMatchObject({ substate: 'thinking', substateSince: s(3), tool: null });
  });

  it('使用者送出提示之後 ＝ thinking，turnStartedAt 取該事件時間', () => {
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.text(S, s(1)), cl.turnEnd(S, s(2)), cl.prompt(S, C, s(9))]);
    expect(l).toMatchObject({ substate: 'thinking', substateSince: s(9), turnStartedAt: s(9) });
  });

  it('本輪已有 assistant 文字但未 end_turn ＝ writing', () => {
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.text(S, s(1), 'tool_use')]);
    expect(l).toMatchObject({ substate: 'writing', substateSince: s(1) });
  });

  it('文字且 stop_reason end_turn ＝ done；其後 turn_duration 仍是 done、since 不變', () => {
    const a = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.text(S, s(4), 'end_turn')]);
    expect(a).toMatchObject({ substate: 'done', substateSince: s(4) });
    const b = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.text(S, s(4), 'end_turn'), cl.turnEnd(S, s(5))]);
    expect(b).toMatchObject({ substate: 'done', substateSince: s(4), lastEventAt: s(5) });
  });

  it('只有 thinking 區塊（即使帶 end_turn）不算 done', () => {
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), { ...cl.thinking(S, s(1)), message: { ...cl.thinking(S, s(1)).message, stop_reason: 'end_turn' } }]);
    expect(l.substate).toBe('thinking');
  });

  it('使用者中斷 ＝ interrupted，清掉未完成的工具', () => {
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.tool(S, s(1), 'tu1', 'Bash', { command: 'sleep 99' }), cl.interrupt(S, s(2))]);
    expect(l).toMatchObject({ substate: 'interrupted', substateSince: s(2), tool: null });
  });

  it('API 錯誤 ＝ error，文字取第一行', () => {
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.apiError(S, s(3))]);
    expect(l).toMatchObject({ substate: 'error', substateSince: s(3), error: 'API Error: Connection lost mid-response.', model: null });
  });

  it('對不到規則 ＝ idle；無關事件不改狀態', () => {
    expect(foldSession('claude', S, [cl.meta(S, C, s(0)), cl.noise(S, s(1))]).substate).toBe('idle');
    const l = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.text(S, s(1)), cl.noise(S, s(8))]);
    expect(l).toMatchObject({ substate: 'done', substateSince: s(1) });
  });

  it('sidechain 事件不影響主 session', () => {
    const side = { ...cl.tool(S, s(2), 'tu9', 'Bash', { command: 'x' }), isSidechain: true };
    expect(foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.text(S, s(1)), side]).substate).toBe('done');
  });
});

describe('Codex 細狀態', () => {
  const base = [cx.meta(S, C, s(0)), cx.context(s(0))];

  it('task_started ＝ thinking；reasoning 也是 thinking', () => {
    expect(foldSession('codex', S, [...base, cx.started(s(1))])).toMatchObject({ substate: 'thinking', substateSince: s(1), turnStartedAt: s(1), model: 'gpt-5.5' });
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.call(s(2), 'c1'), cx.output(s(3), 'c1'), cx.reasoning(s(4))]).substate).toBe('thinking');
  });

  it('exec 開始 ＝ running；output 回來 ＝ thinking', () => {
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.call(s(2), 'c1', 'pnpm -r test')])).toMatchObject({
      substate: 'running',
      substateSince: s(2),
      tool: { name: 'exec_command', summary: 'pnpm -r test' },
    });
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.call(s(2), 'c1'), cx.output(s(3), 'c1')])).toMatchObject({ substate: 'thinking', tool: null });
  });

  it('agent_message ＝ writing', () => {
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.message(s(5))])).toMatchObject({ substate: 'writing', substateSince: s(5) });
  });

  it('task_complete 無 error ＝ done', () => {
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.message(s(5)), cx.complete(s(6)), cx.tokens(s(7))])).toMatchObject({ substate: 'done', substateSince: s(6), lastEventAt: s(7) });
  });

  it('task_complete 帶 payload.error ＝ error，文字取 error.message', () => {
    const l = foldSession('codex', S, [...base, cx.started(s(1)), cx.complete(s(6), { message: "You've hit your usage limit. Try again later.", codex_error_info: 'usage_limit_exceeded' })]);
    expect(l).toMatchObject({ substate: 'error', substateSince: s(6), error: "You've hit your usage limit. Try again later." });
  });

  it('error.message 本身是 API 回的 JSON：取內層 message', () => {
    const msg = JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error', message: 'The model is not supported.', code: 'model_not_found' } });
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.complete(s(2), { message: msg, codex_error_info: 'other' })]).error).toBe('The model is not supported.');
  });

  it('turn_aborted ＝ interrupted', () => {
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.call(s(2), 'c1'), cx.aborted(s(3))])).toMatchObject({ substate: 'interrupted', tool: null });
  });

  it('獨立 error 事件 ＝ error，取第一行', () => {
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.error(s(2))])).toMatchObject({ substate: 'error', error: 'stream disconnected before completion' });
  });

  it('approval request ＝ waiting＋question', () => {
    expect(foldSession('codex', S, [...base, cx.started(s(1)), cx.approval(s(2))])).toMatchObject({ substate: 'waiting', substateSince: s(2), question: '要刪除 build 資料夾嗎？' });
  });

  it('只有 session_meta ＝ idle', () => {
    expect(foldSession('codex', S, base).substate).toBe('idle');
  });
});

describe('herdr 覆寫', () => {
  const err = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.apiError(S, s(3))]);
  const run = foldSession('claude', S, [cl.prompt(S, C, s(0)), cl.tool(S, s(1), 'tu1', 'Bash', { command: 'rm -r x' })]);

  it('JSONL error 優先於 herdr blocked', () => {
    expect(combineHerdr(err, 'blocked', s(9), '要繼續嗎？')).toMatchObject({ substate: 'error', substateSince: s(3), question: null });
  });

  it('herdr 原始 blocked → waiting，since 取觀察時間、問句取畫面', () => {
    expect(combineHerdr(run, 'blocked', s(9), 'Do you want to proceed?')).toMatchObject({ substate: 'waiting', substateSince: s(9), question: 'Do you want to proceed?', tool: { name: 'Bash' } });
  });

  it('herdr 非 blocked 不動 JSONL 結果', () => {
    expect(combineHerdr(run, 'working', null, null)).toEqual(run);
  });
});

describe('文字截斷與摘要', () => {
  it('工具摘要 ≤ 80 字、取第一行', () => {
    expect(toolSummary('Bash', { command: 'x'.repeat(200) })!.length).toBeLessThanOrEqual(80);
    expect(toolSummary('Edit', { file_path: '/a/b.ts', old_string: 'SECRET' })).toBe('/a/b.ts');
    expect(toolSummary('Unknown', {})).toBeNull();
  });

  it('畫面取最後一句問句，≤ 200 字', () => {
    const ansi = '\u001b[1m╭────╮\u001b[0m\n│ Bash command  │\n│ rm -r build │\n│ Do you want to proceed? │\n│ ❯ 1. Yes │\n╰────╯';
    expect(questionFromScreen(ansi)).toBe('Do you want to proceed?');
    expect(questionFromScreen('no question here')).toBeNull();
    expect(questionFromScreen(`${'問'.repeat(300)}？`)!.length).toBeLessThanOrEqual(200);
  });
});
