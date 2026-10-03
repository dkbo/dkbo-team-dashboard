// 真實與手造邊界的 dk-status JSON（schema v1），前端與測試可直接 import。
// @dash/shared 的 exports 只開放 "."，請用相對路徑 import 本檔（例：'../../../packages/shared/fixtures/index.ts'）。
// teamflow-*／collect-* 是 2026-09-25 本機真實輸出（collect 為 0.16 專案經相容 overlay 取得）；
// edge-* 是手造：null 欄位、skipped_lines、未知欄位、unknown／abandoned／planning 狀態；schema-v2 用來測版本檢查。
import type { DetailDoc, ListDoc } from '../src/dkstatus.ts';
import type { HistoryResponse, OverviewDoc } from '../src/types.ts';
import type { ActivityTask } from '../src/activity.ts';
import teamflowListJson from './teamflow-list.json' with { type: 'json' };
import teamflowBklogJson from './teamflow-detail-bklog.json' with { type: 'json' };
import teamflowOpsJson from './teamflow-detail-ops.json' with { type: 'json' };
import collectListJson from './collect-list.json' with { type: 'json' };
import collectAtlasJson from './collect-detail-atlas.json' with { type: 'json' };
import collectBeaconJson from './collect-detail-beacon.json' with { type: 'json' };
import edgeListJson from './edge-list.json' with { type: 'json' };
import edgeDetailJson from './edge-detail.json' with { type: 'json' };
import schemaV2ListJson from './schema-v2-list.json' with { type: 'json' };
import overviewJson from './overview.json' with { type: 'json' };
import historyJson from './history.json' with { type: 'json' };
import activityGlowJson from './activity-detail-glow.json' with { type: 'json' };
import activityDuskJson from './activity-detail-dusk.json' with { type: 'json' };
export { teamflowDkboFiles, teamflowTierConfig } from './dkbo-files.ts';

/** teamflow（0.17 原生）：10 件 done、1 件 unknown */
export const teamflowList = teamflowListJson as unknown as ListDoc;
/** teamflow 已結案任務，對應 teamflow-bklog.timeline.md（dk-timeline 輸出）；另手加 frontend-shell、backend 的 spawn 事件（對 makeSampleFixture） */
export const teamflowDetailBklog = teamflowBklogJson as unknown as DetailDoc;
/** teamflow 已結案任務，對應 teamflow-ops.timeline.md；另手加 backend 的 spawn 事件（codex M override-kind → claude L handoff） */
export const teamflowDetailOps = teamflowOpsJson as unknown as DetailDoc;
/** collect（0.16 相容模式）：1 件 running（atlas）、2 件 done */
export const collectList = collectListJson as unknown as ListDoc;
/** collect 進行中任務（有 .panes、members、current_wave） */
export const collectDetailAtlas = collectAtlasJson as unknown as DetailDoc;
/** collect 已結案任務 */
export const collectDetailBeacon = collectBeaconJson as unknown as DetailDoc;
/** 手造：planning（全 null）、running、unknown、abandoned 各一；含未知欄位 */
export const edgeList = edgeListJson as unknown as ListDoc;
/** 手造 running 任務：skipped_lines 3+2、blocked 成員、legacy pane、skipped 審查、ESCALATE／UNDELIVERED */
export const edgeDetail = edgeDetailJson as unknown as DetailDoc;
/** 與 edgeList 相同但 schema_version = 2（消費端應進 schema 錯誤態） */
export const schemaV2List = schemaV2ListJson as unknown as ListDoc;
/** 真實 GET /api/overview（2026-09-25 本機四專案＋herdr 訂閱中）：含相容模式、成員 pane、其他 session、kindsDown、usage */
export const overviewSample = overviewJson as unknown as OverviewDoc;
/** 真實 GET /api/history（四專案已結案任務，closedAt 降冪）；dispatch／repairWaves 為手補：有 detail fixture 的三件依 teamflowTierConfig 算，其餘 dispatch 空 */
export const historySample = historyJson as unknown as HistoryResponse;

/** 手造活動：running 任務 glow（12 種收錄 event 各一＋minor／commit／watch；DONE×2、ESCALATE、DECISION、BUG、FIXED、BLOCKED、LIMIT、TIMEOUT、STOP；略過的 ACK、QUESTION、UNDELIVERED、TASK） */
export const activityDetailGlow = activityGlowJson as unknown as DetailDoc;
/** 手造活動：done 任務 dusk，closed_at 2026-10-03T08:30（相對 activityNowTs 為 3.5 小時前） */
export const activityDetailDusk = activityDuskJson as unknown as DetailDoc;
/** 活動 fixture 的「現在」：餵 activityFeed 時用 tsToEpochMs(activityNowTs) 當 now，結果才不依跑測機器時區而變 */
export const activityNowTs = '2026-10-03T12:00';
/** 直接餵 activityFeed 的輸入（專案名 demo） */
export const activityTasks: ActivityTask[] = [
  { project: 'demo', detail: activityDetailGlow.task },
  { project: 'demo', detail: activityDetailDusk.task },
];
