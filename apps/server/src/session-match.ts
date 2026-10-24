// pane ↔ session 對應（純函式）。判法：
// 1. herdr 給了 agent_session id → 直接對同 id 的 transcript；對不到就不配（不退回猜）。
// 2. 沒 id（Codex 目前一律如此）→ 依 (kind, cwd) 分組，候選＝同組還沒被對走的 session。
//    首次出現時間一律往前放 START_SLACK_MS：dk-spawn 先 agent start、等它回來才記 since，session 開始時間必早於 since（實測數秒）。
//    - 組內只有一個 pane：首次出現時間已知 → 只配 startedAt ≥ 首次出現−容差 中最近更新的（舊 session 不配）；不知道 → 最近更新的那個；
//    - 多個 pane：首次出現時間已知的 pane 依序排好，第 i 個的時間窗是 [首次出現_i−容差, 首次出現_{i+1}−容差)，
//      窗內「恰好一個」session_meta 開始時間才配，零個或多個都不配；
//      首次出現時間不知道的 pane 只有一個時，配「第一個已知 pane 出現−容差之前開始」的 session 中最近更新者，兩個以上就全不配。
// 分不出來寧可不配（pane.session 為 null、那些 session 以無 pane 身分出現），不猜錯把甲的狀態掛到乙。

export interface MatchPane {
  paneId: string;
  kind: 'claude' | 'codex' | null;
  cwd: string;
  /** herdr agent_session.value（kind: "id"） */
  sessionId: string | null;
  /** pane 首次出現時間（dkbo 註冊時間或 server 觀察到建立的時間）；server 啟動時就在的為 null */
  firstSeen: number | null;
}

export interface MatchSession {
  kind: 'claude' | 'codex';
  sessionId: string;
  cwd: string;
  /** session 開始時間（Codex 取 session_meta.timestamp） */
  startedAt: number | null;
  /** 檔案 mtime */
  updatedAt: number;
}

/** 首次出現時間的容差（review1 I1／I2 裁定 30 秒；Codex payload.timestamp 比寫檔早 27 秒） */
export const START_SLACK_MS = 30_000;

const latest = (xs: MatchSession[]) => xs.reduce<MatchSession | null>((b, x) => (!b || x.updatedAt > b.updatedAt ? x : b), null);

export function matchPanes(panes: MatchPane[], sessions: MatchSession[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  const byId = new Map(sessions.map((s) => [s.sessionId, s]));

  const rest: MatchPane[] = [];
  for (const p of panes) {
    if (!p.kind) continue;
    if (p.sessionId === null) {
      rest.push(p);
      continue;
    }
    const s = byId.get(p.sessionId);
    if (s && !used.has(s.sessionId)) {
      out.set(p.paneId, s.sessionId);
      used.add(s.sessionId);
    }
  }

  const groups = new Map<string, MatchPane[]>();
  for (const p of rest) {
    const k = `${p.kind}\0${p.cwd}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  for (const group of groups.values()) {
    const { kind, cwd } = group[0];
    const cands = sessions.filter((s) => s.kind === kind && s.cwd === cwd && !used.has(s.sessionId));
    const take = (p: MatchPane, s: MatchSession | null) => {
      if (!s) return;
      out.set(p.paneId, s.sessionId);
      used.add(s.sessionId);
    };
    if (group.length === 1) {
      const f = group[0].firstSeen;
      take(group[0], latest(f === null ? cands : cands.filter((s) => s.startedAt !== null && s.startedAt >= f - START_SLACK_MS)));
      continue;
    }
    const known = group.filter((p) => p.firstSeen !== null).sort((a, b) => a.firstSeen! - b.firstSeen!);
    const unknown = group.filter((p) => p.firstSeen === null);
    const picks: [MatchPane, MatchSession][] = [];
    known.forEach((p, i) => {
      const from = p.firstSeen! - START_SLACK_MS;
      const to = (known[i + 1]?.firstSeen ?? Infinity) - START_SLACK_MS;
      const inWin = cands.filter((s) => s.startedAt !== null && s.startedAt >= from && s.startedAt < to);
      if (inWin.length === 1) picks.push([p, inWin[0]]);
    });
    for (const [p, s] of picks) take(p, s);
    if (unknown.length === 1) {
      const before = (known[0]?.firstSeen ?? Infinity) - START_SLACK_MS;
      take(unknown[0], latest(cands.filter((s) => !used.has(s.sessionId) && s.startedAt !== null && s.startedAt < before)));
    }
  }
  return out;
}
