// e2e 假專案 teamflow 的 `.dkbo/roles/*.md` 與 `.dkbo/kinds/*.sh` 最小內容（key 為相對 `.dkbo/` 的路徑）。
// qa 原樣寫進假專案；teamflowTierConfig 是 server 以文字解析這些檔會得到的對照表（shared 測試斷言兩者一致）。
// 對照 teamflow-detail-bklog／ops 的 spawn 事件：frontend M＝sonnet/medium、backend L＝opus/high、
// `ops-backend (codex M) override-kind` 走 kinds/codex.sh＝gpt-5.5/medium。
import type { TierConfig } from '../src/dispatch.ts';

export const teamflowDkboFiles: Record<string, string> = {
  'roles/backend.md': `---
name: backend
kind: claude
tiers:
  S: opus/low
  M: opus/medium
  L: opus/high
worktree: true
group: dev
mcp: []
---
## 職責
實作 API 與資料層。
`,
  'roles/frontend.md': `---
name: frontend
kind: claude
tiers:
  S: sonnet/low
  M: sonnet/medium
  L: opus/high
worktree: true
group: dev
mcp: []
---
## 職責
實作畫面。
`,
  'roles/reviewer.md': `---
name: reviewer
kind: claude
tiers:
  M: opus/medium
  L: opus/high
worktree: true
group: review
mcp: []
---
## 職責
審查。
`,
  'kinds/codex.sh': `# shellcheck shell=bash
KIND_MODEL_EFFORTS="gpt-5.5:low,medium,high"
KIND_DEFAULT_TIERS="S=gpt-5.5/low M=gpt-5.5/medium L=gpt-5.5/high"
`,
};

export const teamflowTierConfig: TierConfig = {
  roles: {
    backend: { kind: 'claude', tiers: { S: 'opus/low', M: 'opus/medium', L: 'opus/high' } },
    frontend: { kind: 'claude', tiers: { S: 'sonnet/low', M: 'sonnet/medium', L: 'opus/high' } },
    reviewer: { kind: 'claude', tiers: { M: 'opus/medium', L: 'opus/high' } },
  },
  kinds: { codex: { S: 'gpt-5.5/low', M: 'gpt-5.5/medium', L: 'gpt-5.5/high' } },
};
