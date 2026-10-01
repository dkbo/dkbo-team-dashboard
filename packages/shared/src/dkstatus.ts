// dk-status JSON schema v1（見 .dkbo/status-schema.md）。只描述 v1 已知欄位；
// 消費端遇到不認識的欄位一律忽略 —— 新版 dkbo 只加欄位不升版。

/** `YYYY-MM-DDTHH:MM`，跑 dk-status 那台機器的本地時間 */
export type Ts = string;

export const DK_STATUS_SCHEMA_VERSION = 1;

export type TaskStatus = 'planning' | 'running' | 'done' | 'abandoned' | 'unknown';

export interface KindsDown {
  kind: string;
  /** 本地時間，不帶時區；算倒數請用 until_epoch */
  until: string;
  /** Unix 秒 */
  until_epoch: number;
  exact: boolean;
  recorded_at: string;
  from_task: string;
  agent: string;
  reason: string;
}

export interface TaskCounts {
  rulings: number;
  autonomous_rulings: number;
  minors: number;
  undelivered: number;
  escalations: number;
}

export interface TaskSummary {
  dir: string;
  short: string;
  display: string | null;
  date: string;
  status: TaskStatus;
  index_note: string | null;
  branch: string | null;
  worktree: string | null;
  task_tab: string | null;
  repo_names: string[];
  current_wave: number | null;
  waves_planned: number;
  waves_closed: number;
  created_at: Ts | null;
  gate1_at: Ts | null;
  closed_at: Ts | null;
  close_result: string | null;
  updated_at: Ts | null;
  panes_open: number;
  counts: TaskCounts;
}

export interface TaskRepo {
  name: string;
  path: string | null;
  worktree: string | null;
  base: string | null;
}

export interface BriefAcceptance {
  text: string;
  checked: boolean;
}

export interface BriefOwner {
  member: string;
  writable: string[];
  readonly: string[];
  exclusive: string[];
}

export interface BriefWave {
  wave: number | null;
  type: string | null;
  member: string | null;
  what: string | null;
  tier: string | null;
  done: string | null;
  review: string | null;
}

export interface TaskBrief {
  goal: string | null;
  acceptance: BriefAcceptance[];
  owners: BriefOwner[];
  waves: BriefWave[];
}

export interface WaveCommit {
  repo: string | null;
  sha: string;
}

export interface TaskWave {
  wave: number;
  opened_at: Ts | null;
  dev_done_at: Ts | null;
  review_spawned_at: Ts | null;
  review_verdict_at: Ts | null;
  review_verdict: string | null;
  closed_at: Ts | null;
  tests: string | null;
  tests_ok: boolean | null;
  commits: WaveCommit[];
}

export interface TaskMember {
  name: string;
  status: string | null;
  wave: number | null;
  current: string | null;
  touched: string[];
  todo: string[];
  blocked_by: string | null;
  notes: string | null;
  has_report: boolean;
}

export interface TaskPane {
  /** agent 註冊名，dkbo 慣例為 `<任務短名>-<member>` */
  agent: string;
  /** herdr pane id */
  pane: string | null;
  since_epoch: number | null;
  group: string | null;
  tab: string | null;
  slot: string | null;
}

export interface TaskRuling {
  ts: Ts;
  text: string;
  autonomous: boolean;
}

export interface TaskEvent {
  ts: Ts;
  /** process 行第 2 欄去掉尾端冒號 */
  kind: string;
  /** 時間戳之後的整行原文 */
  text: string;
}

export interface TaskMessage {
  ts: Ts;
  from: string;
  to: string | null;
  type: string;
  text: string;
}

export interface SkippedLines {
  process: number;
  messages: number;
}

export interface TaskDetail extends TaskSummary {
  repos: TaskRepo[];
  brief: TaskBrief;
  waves: TaskWave[];
  members: TaskMember[];
  panes: TaskPane[];
  rulings: TaskRuling[];
  events: TaskEvent[];
  messages: TaskMessage[];
  skipped_lines: SkippedLines;
}

export interface ListDoc {
  schema_version: number;
  dkbo_version: string | null;
  generated_at: Ts;
  kinds_down: KindsDown[];
  tasks: TaskSummary[];
}

export interface DetailDoc {
  schema_version: number;
  dkbo_version: string | null;
  generated_at: Ts;
  kinds_down: KindsDown[];
  task: TaskDetail;
}

/** running／planning 算進行中：server 對它們自動抓 detail 放進 ProjectView.active */
export function isActiveStatus(s: TaskStatus): boolean {
  return s === 'running' || s === 'planning';
}

/** done／abandoned 算已結案 */
export function isClosedStatus(s: TaskStatus): boolean {
  return s === 'done' || s === 'abandoned';
}
