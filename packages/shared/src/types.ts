import type { Dispatch } from './dispatch.ts';
import type { DetailDoc, KindsDown, ListDoc, TaskDetail, TaskStatus, Ts } from './dkstatus.ts';

export const PANE_STATUSES = ['idle', 'working', 'blocked', 'done', 'unknown'] as const;
export type PaneStatus = (typeof PANE_STATUSES)[number];

/** herdr 的 agent_status 字串 → PaneStatus；不認得的一律 unknown */
export const toPaneStatus = (s: string | undefined): PaneStatus =>
  (PANE_STATUSES as readonly string[]).includes(s ?? '') ? (s as PaneStatus) : 'unknown';

/** herdr pane 的即時狀態；數字由 server 解析（cost 去 `$`，ctx／usage 取 `*_num`） */
export interface PaneLive {
  paneId: string;
  tabId: string;
  workspaceId: string;
  /** herdr 註冊的 agent 名（如 `dashv1-backend`）；沒註冊為 null */
  name: string | null;
  /** agent 種類（claude／codex…），也是額度分組的 kind */
  agent: string | null;
  status: PaneStatus;
  cwd: string;
  model: string | null;
  effort: string | null;
  cost: number | null;
  ctxPct: number | null;
  usage5hPct: number | null;
  usageWkPct: number | null;
  /** 對到的任務資料夾名；otherPanes 裡若 tab 等於某進行中任務的 task_tab 也會帶 */
  taskDir: string | null;
  /** 對到的成員（state 名）；otherPanes 一律 null */
  member: string | null;
}

export type ProjectErrorKind = 'missing' | 'no-dkbo' | 'exit' | 'timeout' | 'json' | 'schema';

export interface ProjectError {
  kind: ProjectErrorKind;
  /** stderr 第一行；沒有 stderr 時等於 kind */
  message: string;
}

export interface ProjectView {
  name: string;
  path: string;
  /** 專案自己的 `.dkbo/VERSION`（相容模式下也不是 overlay 的版本） */
  dkboVersion: string | null;
  mode: 'native' | 'compat' | null;
  error: ProjectError | null;
  /** 最近一次失敗但保留了舊資料 */
  stale: boolean;
  /** 最近一次成功取得 list 的時間（epoch ms） */
  fetchedAt: number | null;
  list: ListDoc | null;
  /** 只含 running／planning 任務的 detail，key 為任務 dir */
  active: Record<string, TaskDetail>;
  /** 對到本專案任務成員的 pane（taskDir、member 都有值） */
  panes: PaneLive[];
  /** cwd 在本專案路徑下（含 .worktrees/**）但對不到任何任務成員的 pane */
  otherPanes: PaneLive[];
}

export type HerdrState = 'subscribed' | 'polling' | 'down';

export interface KindUsage {
  fiveHourPct: number | null;
  weekPct: number | null;
}

export type ProjectKindsDown = KindsDown & { project: string };

/** herdr 裡所有有 agent 的 pane（不限已設定的專案）；對得到專案時帶專案名與任務對應 */
export interface AgentLive extends PaneLive {
  project: string | null;
}

export interface OverviewDoc {
  generatedAt: number;
  projects: ProjectView[];
  /** 全部 agent pane，給 blocked 提醒與 herdr 頁用 */
  agents: AgentLive[];
  /** 各專案 kinds_down 全列（依 kind 升冪、同 kind 依 until_epoch 降冪，第一筆即最晚者） */
  kindsDown: ProjectKindsDown[];
  /** key 為 herdr pane 的 agent；值取該 kind 所有 pane 的最大值，都沒有就 null */
  usage: Record<string, KindUsage>;
  herdr: { state: HerdrState; lastAt: number | null };
}

export interface WaveTiming {
  wave: number;
  /** wave-open → dev-done；缺端點為 null */
  devMin: number | null;
  /** review spawned → 最後 verdict；本波 skipped 算 0；缺端點為 null */
  reviewMin: number | null;
}

export interface HistoryRow {
  project: string;
  dir: string;
  display: string | null;
  status: TaskStatus;
  closedAt: Ts | null;
  /** 首筆 task-new → 最後 task-close */
  totalMin: number | null;
  /** 開過的波數（process 的 wave-open 波號個數） */
  waves: number;
  rulings: number;
  autonomousRulings: number;
  minors: number;
  /** 每波 `review N verdict` 事件數減 1（下限 0）的加總 */
  reReviews: number;
  perWave: WaveTiming[];
  /** 本任務的派工紀錄（依 at 升冪；model／effort 以專案現在的 roles／kinds 檔推算） */
  dispatch: Dispatch[];
  /** brief 波次表「型態」為 `修復` 的不同波號個數 */
  repairWaves: number;
}

export interface TaskDetailResponse {
  project: string;
  detail: DetailDoc;
  panes: PaneLive[];
  /** 本任務的派工紀錄（依 at 升冪） */
  dispatch: Dispatch[];
}

export interface HistoryResponse {
  tasks: HistoryRow[];
}

export interface TaskRef {
  project: string;
  dir: string;
}

export type SseEvent =
  | { event: 'overview.updated'; data: OverviewDoc }
  | { event: 'pane.updated'; data: PaneLive }
  | { event: 'task.updated'; data: TaskRef }
  | { event: 'herdr.view'; data: HerdrView };

export type SseEventName = SseEvent['event'];

/** herdr 鏡像頁：一個 pane 在 tab 版面裡的位置（herdr 的字元格座標） */
export interface HerdrRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HerdrViewPane extends PaneLive {
  rect: HerdrRect;
  /** 終端標題（去掉控制字元） */
  title: string | null;
  /** herdr 保留的捲動歷史行數（全螢幕 TUI 如 Claude Code 通常是 0） */
  scrollback: number;
}

export interface HerdrViewTab {
  id: string;
  label: string;
  number: number;
  status: PaneStatus;
  focusedPaneId: string | null;
  zoomed: boolean;
  area: { width: number; height: number };
  panes: HerdrViewPane[];
}

export interface HerdrViewWorkspace {
  id: string;
  label: string;
  number: number;
  status: PaneStatus;
  activeTabId: string | null;
  tabs: HerdrViewTab[];
}

/** GET /api/herdr/view：herdr 的 spaces／tabs／panes 全貌（唯讀） */
export interface HerdrView {
  generatedAt: number;
  focused: { workspaceId: string | null; tabId: string | null; paneId: string | null };
  workspaces: HerdrViewWorkspace[];
  /** server 正在訂閱 herdr 結構事件、會用 SSE herdr.view 推送；false 時網頁要自己輪詢 */
  live: boolean;
}

/** GET /api/herdr/panes/:id/screen：pane 可見畫面（含 ANSI SGR） */
export interface HerdrScreen {
  paneId: string;
  generatedAt: number;
  ansi: string;
}

export interface HerdrSearchHit {
  paneId: string;
  workspaceId: string;
  tabId: string;
  /** 在 herdr 畫面（或捲動歷史）裡的第幾行，0 起算 */
  line: number;
  /** 去掉 ANSI 的整行文字 */
  text: string;
  /** 來自捲動歷史（source=recent）而不是可見畫面 */
  history: boolean;
}

/** GET /api/herdr/search?q= */
export interface HerdrSearchResponse {
  q: string;
  generatedAt: number;
  hits: HerdrSearchHit[];
  /** 超過上限被截掉 */
  truncated: boolean;
  /** 讀不到畫面的 pane */
  failed: string[];
}
