# dkbo 團隊 dashboard

本機唯讀 Web dashboard：聚合 `dashboard.config.json` 列出的 dkbo 專案（dk-status 任務記憶）與 herdr 即時 pane 狀態。

## 頁面
全站共用一套深靛可愛風設計系統（規格 `design/unify/DESIGN-SYSTEM.md`）：狀態色只有五種語意（danger 卡住要人處理、warn 降級／熔斷／ESCALATE、ok 運作中、idle 閒置／已結束、info 中性事件），內容頁（總覽、任務詳情、歷史、趨勢）置中最寬 1536px，工具頁（herdr、git）滿版窗格卡。各頁頂端是 PageHeader（標題、副標、工具列），錯誤一律用頁首下的橫幅（沒資料紅、有舊資料黃＋重試），空資料用空狀態卡。

- `/`：總覽。上方四張摘要卡：進行中任務、今日花費、卡住的 agent、熔斷與額度（有熔斷或任一額度 ≥ 80% 變黃）；專案分「需要注意／活躍」（依卡住 > 警示 > 活躍排序，卡片依最嚴重狀態加外框）與收合的「閒置專案」（每專案一列，點了展開）；agent 畫面縮圖只畫工作中／卡住的 pane、最後 10 行，每 5 秒更新，頁首「畫面縮圖」可關，偏好存在瀏覽器；右側活動欄，見下方「活動欄」。手機寬度依序是摘要 2×2 → 活躍專案 → 活動（最新 5 則）→ 閒置專案
- `/p/:project/t/:dir`：任務詳情。麵包屑＋頁首（任務名、專案 · dir · 分支、狀態膠囊，工具列「看 herdr」「複製 focus 指令」）；波次時間軸只展開進行中的波，已關閉的波收成一行可點開；成員表（state 膠囊、待辦與卡在併進「目前」欄、「看畫面」按鈕）；寬螢幕右欄是任務資訊與花費
- `/history`：歷史與分析。篩選在頁首工具列；dev vs 審查圖預設只畫最近 15 件，右上「顯示全部 N 件」切換；表格預設最近 10 件、底部「再顯示 30 件」，裁定／自主、minor 數、重審次數合成「審查」一欄（例 `9/6 · m5 · r1`，表頭 ⓘ 有說明）
- `/trends`：花費與額度趨勢（額度與 ctx 曲線、撞額度預估、每日花費、依任務／角色／kind 的花費）；時間區間在頁首切換，沒資料的圖收成矮的空狀態卡；資料來源見下方「花費與額度趨勢」
- `/herdr`：herdr 唯讀鏡像。spaces／tabs／分割版面／pane 畫面與 agent 狀態；鍵盤 ↑↓ 切 space、n/p/1-9 切 tab、h/j/k/l 切 pane、Tab 循環、z 放大、/ 搜尋所有 pane 的畫面（不分大小寫的純文字，點結果跳到那一行）、e 看捲動歷史（只有 herdr 有保留歷史的 pane 才有；Claude Code 這類全螢幕 TUI 沒有）。herdr 變動由 SSE `herdr.view` 即時推送（server 訂不到事件時網頁退回每 2 秒輪詢）。選擇只存在網址，不會 focus 真的 herdr，也不送任何按鍵或命令。版面是左側 spaces／agents 清單（agents 依卡住 → 工作中 → 閒置排序）＋主窗格卡（tab 列、搜尋、放大），鍵盤說明在頁首的 `?`；終端畫面亮暗主題都固定黑底與原 ANSI 色
- `/git`：各專案的 git 唯讀檢視。左欄清單切專案（每列顯示分支、狀態標籤（乾淨／N 改動／N 衝突）、ahead/behind；不是 git repo 或路徑不存在會標出）；工作樹狀態（分支、HEAD、upstream ↑↓、衝突／已暫存／未暫存／未追蹤檔案）；worktree 清單與各自的改動；歷史含所有分支與 tag 的分支圖（`--all --topo-order`，預設 200 筆、可載入更多到 1000 筆），點 commit 看作者、訊息與改動檔案（+/−，merge 對第一個 parent 比較），再點檔案在中欄看該檔的 diff（舊／新行號，超過 5000 行截斷；Esc 回歷史、再按一次關詳情）。lg 以上三欄滿版窗格卡、各欄自己捲：左欄專案、工作樹狀態、Worktree 三段（乾淨綠、有改動黃、衝突紅），中欄歷史（ref 標籤：HEAD 紫、分支灰、版本 tag 品牌色），右欄 commit 詳情選了才出現。每 10 秒更新，選的專案、commit 與檔案存在網址（`?p=&c=&f=`）。不 fetch，ahead/behind 以本機最後一次 fetch 為準
- blocked 提醒（全站）：有 agent 卡住時分頁標題顯示 `(N)`、頂部列出現紅色膠囊（hover 列出、點了跳到 herdr 頁；頂部列另有熔斷膠囊、額度膠囊（≥ 80% 變黃、不會變紅）與 SSE／herdr 連線燈，放不下時收成 `+N`）；右上鈴鐺可開桌面通知，只在 agent「新變成」blocked 時通知
- 任務 ↔ pane：任務詳情成員表的 herdr 欄是狀態膠囊＋旁邊的「看畫面」圖示鈕（跳到 herdr 頁），膠囊的 hover 卡只有 model／effort 與複製 focus 指令；總覽膠囊的 hover 卡有「在 herdr 頁看畫面」；herdr 頁 pane 標頭顯示所屬任務與成員，點了回任務詳情

## 需求
- Node ≥ 24、pnpm 11
- `jq`、`bash`（dk-status 需要）；herdr 可選

## 安裝
```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # 只有跑 e2e 才需要
cp dashboard.config.example.json dashboard.config.json   # 改成你要看的專案路徑（這個檔不進版控）
```

## 啟動
```sh
pnpm dev        # 同時起 server（127.0.0.1:4317）與 web（http://localhost:5173）
```
server 收到 SIGTERM／SIGINT 時，先對還在跑的 dk-status 行程群組送 SIGTERM（2 秒沒結束改 SIGKILL），全部結束後才刪自己建的 `dash-overlay-*` 暫存目錄，再退出；整個過程 5 秒內。

## 測試
```sh
pnpm -r test    # 各 package 的 vitest
pnpm e2e        # Playwright 煙霧測試（PORT=4417 WEB_PORT=5273）
```
server 的測試整輪跑在一個私有暫存目錄（`$TMPDIR/dash-vitest-*`），結束後刪掉，不在 `$TMPDIR` 留東西（pnpm 自己的 `node-compile-cache` 除外）。

## 結構
- `apps/server`：Hono server（入口 `src/index.ts`）
- `apps/web`：Vite + React + shadcn/ui + Tailwind v4 + Zustand（入口 `src/main.tsx`）
- `packages/shared`：`@dash/shared`，共用型別與計算（直接吃 TS，不 build）
- `vendor/dkbo-status`：dkbo 0.20.0 的 dk-status（bin/lib/VERSION，未修改），給沒有 dk-status 的舊專案用相容模式

## 環境變數
| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 4317 | server 埠（web 的 `/api` proxy 也導到這裡） |
| `WEB_PORT` | 5173 | web dev 埠 |
| `DASHBOARD_CONFIG` | `./dashboard.config.json` | 設定檔 `{ projects: [{name, path}], pollMs? }` |
| `DASH_HERDR_BIN` | `herdr` | herdr 執行檔 |
| `DASH_HERDR_SOCKET` | herdr 預設 | herdr socket 路徑 |
| `DASH_HERDR` | — | 設 `off` 等同沒有 herdr |
| `DASH_GIT_BIN` | `git` | git 執行檔（e2e 換成記錄參數的包裝） |
| `DASH_DATA_DIR` | `${XDG_STATE_HOME:-$HOME/.local/state}/dkbo-dashboard` | 趨勢樣本的資料目錄（server 唯一會寫的地方；相對路徑以 server 的 cwd 解析） |
| `DASH_SAMPLE_MS` | 60000 | 取樣間隔（毫秒） |
| `DASH_RETENTION_DAYS` | 30 | 樣本保留天數 |

## 花費與額度趨勢
server 開著時每 `DASH_SAMPLE_MS` 對手上已有的 herdr pane 狀態（`/api/overview` 的 `agents`，不另外呼叫 herdr）取樣一次，append 到 `$DASH_DATA_DIR/samples/YYYY-MM-DD.jsonl`（server 本地日期，一行一筆 `UsageSample`，型別見 `packages/shared/src/trends.ts`）。
- herdr 為 down 時不取樣；同一 pane 的 cost／ctx／額度／狀態／歸屬／model／effort 全沒變且距上一筆不滿 10 分鐘時不寫。去重基準只在記憶體，重啟後第一次取樣每個 pane 都寫一筆
- 啟動時與每天第一次寫入前，刪掉日期早於「今天 − `DASH_RETENTION_DAYS`」的 `YYYY-MM-DD.jsonl`，其他檔名不碰
- API（只有 GET）：`/api/trends?range=6h|24h|7d|30d`、`/api/costs?range=6h|24h|7d|30d|all`（預設 24h，其他值 400）。壞掉的行略過並計入回應的 `skipped`
- server listen 後在背景預熱（讀一輪樣本檔、各算一次 trends 24h 與 costs all），不擋啟動、失敗只記 log；預熱中進來的請求共用同一輪讀檔
- 花費＝同一 pane 相鄰兩筆 herdr `cost`（session 累計美元）的差額，歸屬給後一筆的任務／成員；每個 pane 的第一筆不算。dashboard 沒開的期間不會有樣本，那段花費可能遺漏，或併進之後第一次記錄
- **未實測的假設**：Claude Code 等 agent 的 session 重開後 herdr 回報的 `cost` 會變小或歸零，所以 cost 變小時把後一筆的 cost 值本身當成新 session 的花費。**已知限制**：paneId 被新 session 重用、而新 session 第一次取樣時的 cost 已大於舊值時，會被當成正常累加：只算到「新 cost − 舊 cost」，少算了新 session 的舊 cost 那一段
- 撞額度預估：每個 kind，5h 額度看最近 60 分鐘、週額度看最近 24 小時，只用最後一次下降（視為額度重置）之後的點做最小平方直線外插；同一時點取同 kind 各 pane 的最大值，pane 在某時點因去重沒寫時沿用它上一筆的值（最多 20 分鐘）。目前值已 ≥ 100 回最新樣本時間；外推點早於現在（樣本都舊了）或晚於重置週期（5h／7d）時不預估

### 模型、effort 與派工檔位
花費另外依模型與 effort 拆成兩個來源，分開顯示、不混在同一欄；兩者不一致時標出：
- **實際**（herdr 回報）：每筆樣本多記 `model`、`effort`，取自 server 手上已有的 `PaneLive.model`／`effort`（不另外呼叫 herdr）。一筆花費的實際值取後一筆樣本的值（與任務／成員的歸屬規則相同）
- **設定**（dkbo 派工）：任務 process 的 `spawn <agent> (<kind> <tier>)<notes>` 行（dk-status 詳情的 `events`），加上該專案 `.dkbo/roles/<角色>.md` frontmatter 的 `kind`／`tiers` 與 `.dkbo/kinds/<kind>.sh` 的 `KIND_DEFAULT_TIERS` 推出 model／effort（規則同 dk-spawn：spawn 的 kind 等於角色檔 kind 用角色檔 tiers，否則用 kinds 檔）。server 只以文字讀這兩種檔（依 mtime 快取），**不 source、不執行**。每筆花費歸給該成員在花費時間當下（含）之前的最後一次派工；都晚於花費時取最早一次；找不到對應任務或派工為「未知」
- 不一致：兩邊都有 model 才比 model（不分大小寫；`opus 5.5` 對 `opus` 算相同，`sonnet 5` 對 `opus` 不同），兩邊都有 effort 才比 effort；每一段花費各自判定，成員只要範圍內有一段對不上就標記
- API：`/api/costs` 多了 `byActual`、`byConfigured`、`mismatch` 與每個任務的 `byConfigured`、`memberInfo`；`/api/projects/:name/tasks/:dir` 與 `/api/history` 每列多了 `dispatch`（`/api/history` 另有 `repairWaves`＝brief 波次表型態為「修復」的不同波號數）
- 限制：
  - 設定值用各專案**現在**的 roles／kinds 檔推算；roles 檔改過之後，舊任務也會以新的對照顯示
  - 舊樣本（這個版本之前寫的，沒有 model／effort）與 herdr 沒回報 model／effort 的 pane（例如某些 codex／agy）歸「未知」，不回填
  - 派工時間只到分鐘：同一分鐘內、派工之前的花費會歸到新的那次派工
  - spawn 行的時間是跑 dk-status 那台機器的本地時間，轉 epoch 的前提是 server 與它同時區
  - 設定歸屬只用 server 手上有的任務詳情（進行中任務、已結案任務的快取；缺的已結案詳情會先補抓一次），其他狀態的任務歸「未知」

## 活動欄
總覽右側的活動動態，資料來自 `GET /api/activity?limit=1..200`（預設 50，其他值含非整數 400），回 `ActivityResponse`（型別與合併規則見 `packages/shared/src/activity.ts` 的 `activityFeed`）。
- 只用 server 手上已有的任務詳情：進行中任務（running／planning）的詳情，加上 `closed_at` 在 24 小時內、且詳情已在快取裡的已結案任務；**不為它另跑 dk-status**
- 收錄的 process 事件：`task-new`、`gate1`、`brief-review`、`spawn`、`wave-open`、`dev-done`、`review`、`ruling`、`timeout`、`wave-close`、`gate3`、`task-close`；收錄的訊息：`DONE`、`ESCALATE`、`BUG`、`FIXED`、`BLOCKED`、`LIMIT`、`TIMEOUT`、`DECISION`、`STOP`。其他（minor、commit、ACK、TASK、QUESTION…）略過
- 依時間新到舊；同一分鐘同一任務的訊息排在事件前，同一來源原檔較後的行排前面；text 超過 300 字元截斷
- 網頁收到 SSE `task.updated`／`overview.updated` 後 1 秒防抖重抓，另每 60 秒保底重抓
- 限制：
  - 已結案任務的詳情由背景每輪限量預抓（或有人開過它的詳情頁才進快取）：server 剛啟動、快取還沒補到時，最近結案任務的活動會暫時少幾筆
  - 時間戳是跑 dk-status 那台機器的本地時間（只到分鐘），轉 epoch 的前提是 server 與它同時區
  - 摘要卡的「今日／昨日花費」以瀏覽器本地日期比對 server 依它本地日期算的每日花費（`/api/trends?range=7d` 的 `costByDay`），前提是瀏覽器與 server 同時區；不同時區時跨日前後會對到錯的一天

## herdr 唯讀保證
server 對 herdr 只會做三件事：`herdr api snapshot`、`herdr pane read <id> --source visible|recent [--lines N] --format ansi`、socket `events.subscribe`（pane 事件與 workspace／tab／layout 結構事件各一條連線）（白名單見 `apps/server/src/herdr-view.ts` 的 `herdrArgs`）。HTTP 只有 GET：`/api/herdr/view`、`/api/herdr/search?q=`、`/api/herdr/panes/:id/screen[?source=recent&lines=N]`。

## git 唯讀保證
server 對各專案的 git 只會跑白名單內的指令（`apps/server/src/git.ts` 的 `gitArgs`）：`status --porcelain=v2 --branch -z`、`worktree list --porcelain -z`、`log --all --topo-order`、`show -s <hash>`、`diff-tree <parent> <hash>`（檔案清單），以及單檔 `diff-tree -p --no-ext-diff --no-textconv <parent> <hash> -- <path>`（不執行 repo 設定的外部 diff／textconv；path 必須是該 commit 改到的檔）。每次都帶 `--no-optional-locks`（status 不刷新 index、不建 `index.lock`）、`-c core.fsmonitor=false`（不執行 repo 設定的 fsmonitor 指令），並設 `GIT_TERMINAL_PROMPT=0`、不繼承 server 的 `GIT_*` 環境變數；commit 參數只收 7–64 碼小寫 hex。不 fetch、不 checkout、不寫任何 ref。HTTP 只有 GET：`/api/git`（各專案摘要）、`/api/git/:project?limit=1..1000`、`/api/git/:project/commits/:hash`、`/api/git/:project/commits/:hash/diff?path=`；不是 git repo 回 409、找不到專案或 commit 回 404。

## 授權
MIT，見 [LICENSE](LICENSE)。
