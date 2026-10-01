// git 唯讀檢視（/git 頁）的型別與分支圖排線。server 只跑白名單內的唯讀 git 指令（見 apps/server/src/git.ts 的 gitArgs）。

export type GitErrorKind = 'missing' | 'not-git' | 'exit' | 'timeout';

export interface GitError {
  kind: GitErrorKind;
  message: string;
}

/** porcelain v2 的一個檔案；x／y 為 XY 兩碼（'.' 表示沒變），untracked 為 '?'，衝突為 'u' 列 */
export interface GitStatusFile {
  path: string;
  /** 改名／複製的來源路徑 */
  orig: string | null;
  x: string;
  y: string;
  conflict: boolean;
}

export interface GitStatus {
  /** 分支名；detached 時為 null */
  branch: string | null;
  /** HEAD commit；空 repo 為 null */
  head: string | null;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  files: GitStatusFile[];
}

export interface GitStatusCounts {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
}

export interface GitWorktree {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
  /** 主工作樹（git worktree list 的第一筆） */
  main: boolean;
  /** 這個 worktree 的 status；讀失敗（例如 prunable）為 null */
  status: GitStatus | null;
}

export interface GitCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  /** author time，epoch 秒 */
  time: number;
  subject: string;
  /** %D 的 ref 名（HEAD -> master、tag: v0.2.0、origin/master…） */
  refs: string[];
}

export interface GitRepoResponse {
  project: string;
  path: string;
  status: GitStatus;
  worktrees: GitWorktree[];
  commits: GitCommit[];
  /** 是否還有更多 commit 沒列（超過 limit） */
  truncated: boolean;
  generatedAt: number;
}

export interface GitSummary {
  project: string;
  path: string;
  error: GitError | null;
  branch: string | null;
  ahead: number | null;
  behind: number | null;
  counts: GitStatusCounts | null;
  worktrees: number;
}

export interface GitSummaryResponse {
  projects: GitSummary[];
  generatedAt: number;
}

export interface GitCommitFile {
  path: string;
  orig: string | null;
  /** A／M／D／R／C／T… 的第一碼 */
  change: string;
  /** binary 為 null */
  additions: number | null;
  deletions: number | null;
}

export interface GitCommitDetail extends GitCommit {
  body: string;
  committer: string;
  commitTime: number;
  /** 與第一個 parent（root commit 為空樹）比較的檔案 */
  files: GitCommitFile[];
}

export const GIT_LOG_DEFAULT = 200;
export const GIT_LOG_MAX = 1000;

export function statusCounts(s: GitStatus): GitStatusCounts {
  const c: GitStatusCounts = { staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
  for (const f of s.files) {
    if (f.conflict) c.conflicts++;
    else if (f.x === '?') c.untracked++;
    else {
      if (f.x !== '.') c.staged++;
      if (f.y !== '.') c.unstaged++;
    }
  }
  return c;
}

export const isClean = (c: GitStatusCounts): boolean => c.staged + c.unstaged + c.untracked + c.conflicts === 0;

/** 分支圖的一列：commit 落在第 col 條線；top 為從上緣接進節點或穿過的線，bottom 為從節點或穿過往下的線 */
export interface GraphRow {
  col: number;
  /** 穿過這列、不經過節點的線：[上緣的線號, 下緣的線號] */
  pass: [number, number][];
  /** 從上緣接進節點的線號（子 commit 指向這個 commit 的線） */
  into: number[];
  /** 從節點往下接到 parent 的線號 */
  out: number[];
  /** 這列畫到的線數（含節點），供決定寬度 */
  width: number;
}

/**
 * commit 依 --topo-order（子在上）排好後算每列的排線。parent 不在清單內（被 limit 截掉）時線一路畫到底。
 * 線號不壓縮：空出的線位留給之後新開的分支，避免整片線左右移動。
 */
export function layoutGraph(commits: Pick<GitCommit, 'hash' | 'parents'>[]): GraphRow[] {
  let lanes: (string | null)[] = [];
  const rows: GraphRow[] = [];
  const free = () => {
    const i = lanes.indexOf(null);
    return i === -1 ? lanes.length : i;
  };
  for (const c of commits) {
    const before = lanes.slice();
    let col = before.indexOf(c.hash);
    if (col === -1) col = free();
    const into = before.flatMap((h, i) => (h === c.hash ? [i] : []));
    const next = before.map((h) => (h === c.hash ? null : h));
    while (next.length <= col) next.push(null);
    lanes = next;
    const out: number[] = [];
    c.parents.forEach((p, k) => {
      if (k === 0) {
        // 第一個 parent 已經有線（另一個子 commit 先開的）就併進去，否則沿用自己的線
        const at = lanes.indexOf(p);
        if (at !== -1 && at !== col) out.push(at);
        else {
          lanes[col] = p;
          out.push(col);
        }
        return;
      }
      let at = lanes.indexOf(p);
      if (at === -1) {
        at = free();
        if (at === lanes.length) lanes.push(p);
        else lanes[at] = p;
      }
      out.push(at);
    });
    const pass: [number, number][] = [];
    before.forEach((h, i) => {
      if (h !== null && h !== c.hash) pass.push([i, i]);
    });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    const width = Math.max(col + 1, before.length, lanes.length, ...out.map((o) => o + 1));
    rows.push({ col, pass, into, out: [...new Set(out)], width });
  }
  return rows;
}

export type GitDiffLineKind = 'add' | 'del' | 'ctx' | 'note';

export interface GitDiffLine {
  kind: GitDiffLineKind;
  /** 舊檔行號；新增行與 note 為 null */
  old: number | null;
  /** 新檔行號；刪除行與 note 為 null */
  new: number | null;
  text: string;
}

export interface GitDiffHunk {
  /** @@ -a,b +c,d @@ 之後的函式脈絡（可能為空） */
  header: string;
  oldStart: number;
  newStart: number;
  lines: GitDiffLine[];
}

export interface GitFileDiff {
  hash: string;
  path: string;
  orig: string | null;
  change: string;
  binary: boolean;
  hunks: GitDiffHunk[];
  /** 超過 GIT_DIFF_MAX_LINES 行，後面沒列 */
  truncated: boolean;
}

export const GIT_DIFF_MAX_LINES = 5000;

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

/** 單一檔案的 unified diff → hunks；檔頭（diff --git、index、---／+++）略過 */
export function parsePatch(patch: string, maxLines = GIT_DIFF_MAX_LINES): { binary: boolean; hunks: GitDiffHunk[]; truncated: boolean } {
  const hunks: GitDiffHunk[] = [];
  let cur: GitDiffHunk | null = null;
  let o = 0;
  let n = 0;
  let count = 0;
  let binary = false;
  const lines = patch.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const l of lines) {
    const m = HUNK_RE.exec(l);
    if (m) {
      if (count >= maxLines) return { binary, hunks, truncated: true };
      o = Number(m[1]);
      n = Number(m[2]);
      cur = { header: m[3], oldStart: o, newStart: n, lines: [] };
      hunks.push(cur);
      continue;
    }
    if (!cur) {
      if (/^Binary files .* differ$/.test(l) || l === 'GIT binary patch') binary = true;
      continue;
    }
    if (count >= maxLines) return { binary, hunks, truncated: true };
    const c = l[0];
    if (c === '+') cur.lines.push({ kind: 'add', old: null, new: n++, text: l.slice(1) });
    else if (c === '-') cur.lines.push({ kind: 'del', old: o++, new: null, text: l.slice(1) });
    else if (c === '\\') cur.lines.push({ kind: 'note', old: null, new: null, text: l.slice(2) });
    else if (c === ' ' || l === '') cur.lines.push({ kind: 'ctx', old: o++, new: n++, text: l.slice(1) });
    else continue;
    count++;
  }
  return { binary, hunks, truncated: false };
}
