# dkbo 團隊 dashboard

本機唯讀 Web dashboard：聚合 `dashboard.config.json` 列出的 dkbo 專案（dk-status 任務記憶）與 herdr 即時 pane 狀態。

## 頁面
全站共用一套深靛可愛風設計系統（規格 `design/unify/DESIGN-SYSTEM.md`）：狀態色只有五種語意（danger 卡住要人處理、warn 降級／熔斷／ESCALATE、ok 運作中、idle 閒置／已結束、info 中性事件），內容頁（總覽、任務詳情、歷史、趨勢）置中最寬 1536px，工具頁（herdr、git）滿版窗格卡。各頁頂端是 PageHeader（標題、副標、工具列），錯誤一律用頁首下的橫幅（沒資料紅、有舊資料黃＋重試），空資料用空狀態卡。

- `/`：總覽。上方四張摘要卡：進行中任務、今日花費、卡住的 agent、熔斷與額度（有熔斷或任一額度 ≥ 80% 變黃）；專案分「需要注意／活躍」（依卡住 > 警示 > 活躍排序，卡片依最嚴重狀態加外框）與收合的「閒置專案」（每專案一列，點了展開）；agent 畫面縮圖只畫工作中／卡住的 pane、最後 10 行，每 5 秒更新，頁首「畫面縮圖」可關，偏好存在瀏覽器；右側活動欄，見下方「活動欄」。手機寬度依序是摘要 2×2 → 活躍專案 → 活動（最新 5 則）→ 閒置專案
- `/office`：辦公室。把 Claude Code、Codex 的 session 畫成 3D 小人（three.js，進這一頁且是 3D 視圖才延遲載入）：有進行中任務的專案一區、任務桌群依 brief 成員順序固定座位、leader 坐大桌戴皇冠、沒有任務的 session 坐散座區、完成的去休息區；頭頂標記與地面圈顯示細狀態（見下方「辦公室與細狀態」），滑鼠移上去看 hover 卡。左側找人清單分「需要你／工作中／其他」，點一列場景會飛過去並選取，右側詳情含終端尾 6 行與 resume 指令（Claude `claude --resume <sessionId>`、Codex `codex resume <sessionId>`）。工具列有 kind 篩選、專案、「只看需要你」、3D｜清單切換、重設視角與全螢幕；選取與篩選存在網址（`?kind=&project=&needs=1&focus=&view=list`，找人清單另可 `f_project`／`f_task`／`f_role`）。不支援 WebGL、素材載入失敗或 context lost 時自動改用清單並顯示橫幅；< 768 寬預設清單、可「仍要開 3D」。純唯讀，沒有任何回覆或審批操作
- `/p/:project/t/:dir`：任務詳情。麵包屑＋頁首（任務名、專案 · dir · 分支、狀態膠囊，工具列「在辦公室看」「看 herdr」「複製 focus 指令」）；波次時間軸只展開進行中的波，已關閉的波收成一行可點開；成員表的「細狀態」欄顯示該成員 session 此刻在做什麼（膠囊＋計時，有工具時第二行是工具參數；沒有 pane 註「無 session」），「state」欄仍是 dkbo 的任務流程狀態；等你或錯誤的成員整列淡紅底、卡片標題出現「N 個等你」，列尾有「在辦公室看」「在 herdr 開」；寬螢幕右欄是任務資訊與花費
- `/history`：歷史與分析。篩選在頁首工具列；dev vs 審查圖預設只畫最近 15 件，右上「顯示全部 N 件」切換；表格預設最近 10 件、底部「再顯示 30 件」，裁定／自主、minor 數、重審次數合成「審查」一欄（例 `9/6 · m5 · r1`，表頭 ⓘ 有說明）
- `/trends`：花費與額度趨勢（額度與 ctx 曲線、撞額度預估、每日花費、依任務／角色／kind 的花費）；時間區間在頁首切換，沒資料的圖收成矮的空狀態卡；資料來源見下方「花費與額度趨勢」
- `/herdr`：herdr 唯讀鏡像。spaces／tabs／分割版面／pane 畫面與 agent 狀態；鍵盤 ↑↓ 切 space、n/p/1-9 切 tab、h/j/k/l 切 pane、Tab 循環、z 放大、/ 搜尋所有 pane 的畫面（不分大小寫的純文字，點結果跳到那一行）、e 看捲動歷史（只有 herdr 有保留歷史的 pane 才有；Claude Code 這類全螢幕 TUI 沒有）。herdr 變動由 SSE `herdr.view` 即時推送（server 訂不到事件時網頁退回每 2 秒輪詢）。選擇只存在網址，不會 focus 真的 herdr，也不送任何按鍵或命令。版面是左側 spaces／agents 清單（agents 依細狀態分「需要你／工作中／其他」三組、組內依等你 → 錯誤 → 中斷 → 執行 → 回覆 → 思考 → 完成 → 閒置排序，第二行是「專案 · 細狀態 · 計時」；沒有 session 資料的 pane 退回 herdr 的卡住／工作中／其他）＋主窗格卡（tab 列的點取該 tab 最嚴重的細狀態；pane 標題列是細狀態膠囊、計時與工具參數；搜尋、放大），頁首有「在辦公室看」（帶目前選的 pane），鍵盤說明在頁首的 `?`；終端畫面亮暗主題都固定黑底與原 ANSI 色
- `/git`：各專案的 git 唯讀檢視。左欄清單切專案（每列顯示分支、狀態標籤（乾淨／N 改動／N 衝突）、ahead/behind；不是 git repo 或路徑不存在會標出）；工作樹狀態（分支、HEAD、upstream ↑↓、衝突／已暫存／未暫存／未追蹤檔案）；worktree 清單與各自的改動；歷史含所有分支與 tag 的分支圖（`--all --topo-order`，預設 200 筆、可載入更多到 1000 筆），點 commit 看作者、訊息與改動檔案（+/−，merge 對第一個 parent 比較），再點檔案在中欄看該檔的 diff（舊／新行號，超過 5000 行截斷；Esc 回歷史、再按一次關詳情）。lg 以上三欄滿版窗格卡、各欄自己捲：左欄專案、工作樹狀態、Worktree 三段（乾淨綠、有改動黃、衝突紅），中欄歷史（ref 標籤：HEAD 紫、分支灰、版本 tag 品牌色），右欄 commit 詳情選了才出現。每 10 秒更新，選的專案、commit 與檔案存在網址（`?p=&c=&f=`）。不 fetch，ahead/behind 以本機最後一次 fetch 為準
- 需要你提醒（全站）：有人卡住、等你或出錯時分頁標題前綴 `(N) 需要你 · `（N＝herdr 全部 blocked 的 pane 與細狀態為等你／錯誤的 session 的聯集，以 pane（沒有 pane 用 session）去重）、頂部列出現紅色膠囊（hover 列出、點了跳到 herdr 頁；頂部列另有熔斷膠囊、額度膠囊（≥ 80% 變黃、不會變紅）與 SSE／herdr 連線燈，放不下時收成 `+N`）；右上鈴鐺可開桌面通知，只在「新變成」等你或出錯時通知（文案分「有人等你」「出錯」；設定以外專案的 blocked pane 歸「有人等你」），頁面第一次載入的資料當基準不通知
- 任務 ↔ pane：任務詳情成員表的細狀態膠囊 hover 卡有 model／effort 與複製 focus 指令，列尾圖示鈕「在 herdr 開」跳到 herdr 頁、「在辦公室看」跳到 `/office?focus=<pane>`；總覽膠囊的 hover 卡有「在 herdr 頁看畫面」；herdr 頁 pane 標頭顯示所屬任務與成員，點了回任務詳情

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
- `apps/web`：Vite + React + shadcn/ui + Tailwind v4 + Zustand（入口 `src/main.tsx`）；辦公室 3D 場景用 three.js／react-three-fiber／drei（`src/features/office-scene/`，延遲載入），模型與 `LICENSE.md` 在 `public/office/`
- `packages/shared`：`@dash/shared`，共用型別與計算（直接吃 TS，不 build）
- `vendor/dkbo-status`：dkbo 0.21.0 的 dk-status（bin/lib/VERSION，未修改），給沒有 dk-status 的舊專案用相容模式

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
| `DASH_CLAUDE_DIR` | `$CLAUDE_CONFIG_DIR` 或 `~/.claude` | 辦公室讀 Claude Code session JSONL 的目錄（只讀） |
| `DASH_CODEX_DIR` | `$CODEX_HOME` 或 `~/.codex` | 辦公室讀 Codex rollout JSONL 的目錄（只讀） |
| `DASH_SESSIONS` | — | 設 `off` 關閉整個 session／細狀態功能：`/api/sessions` 回空、`PaneLive.session` 恆為 null，各頁細狀態退回 herdr 粗狀態 |
| `DASH_DATA_DIR` | `${XDG_STATE_HOME:-$HOME/.local/state}/dkbo-dashboard` | 趨勢樣本的資料目錄（server 唯一會寫的地方；相對路徑以 server 的 cwd 解析） |
| `DASH_SAMPLE_MS` | 60000 | 取樣間隔（毫秒） |
| `DASH_RETENTION_DAYS` | 30 | 樣本保留天數 |

## 辦公室與細狀態
server 唯讀讀 `DASH_CLAUDE_DIR`／`DASH_CODEX_DIR` 底下的 session JSONL，和 herdr 的 pane 狀態合算出每個 session 的「細狀態」，經 `GET /api/sessions`、SSE `sessions.updated` 與各 pane 的 `session` 欄位送到網頁（型別見 `packages/shared/src/session.ts`）。
- 八種細狀態：思考中、執行（附工具名）、回覆中、等你、完成、中斷、錯誤、閒置。完成或中斷滿 10 分鐘沒新事件顯示閒置；閒置滿 2 小時算下班，不畫角色、只計數。**pane 已關的錯誤**（例如 reviewer 啟動失敗後 pane 被收掉）沒人能回，比照完成：不算「需要你」（分頁標題 N、桌面通知、找人清單的需要你組、「只看需要你」都不含），10 分鐘後轉閒置、2 小時下班；pane 還開著的錯誤照舊一直算需要你。網頁一律用同一套規則換算，所以辦公室、任務詳情與 herdr 頁的顯示一致。
- 頁面物件（辦公室當 dashboard 大廳）：每個既有頁面一件物件，物件與它頭上的數字標籤都可點（Enter 開頁、⌘／Ctrl＋click 新分頁）。任務白板（每個進行中任務一塊，波 closed/planned；桌群有人等你／有 pane 的錯誤、或 dk-watch 的 BLOCKED／TIMEOUT 未解＝紅，只有未回的 ESCALATE＝黃；結案後保留 10 分鐘顯示「結案 ✓」或「已放棄」）→ 任務詳情；監控牆（herdr pane 數、卡住數）→ `/herdr`；檔案室（已結案數、今天 +N）→ `/history`；git 檔案櫃（所有專案只亮最嚴重一項：衝突紅 ＞ 未推送 ＞ 未提交／detached 黃，乾淨熄燈）→ `/git`；大廳公告板（進行中任務數）→ `/`；茶水間電表（今日花費、最高額度 %，≥ 80% 黃 chip；任一 kind 熔斷＝「跳電」）→ `/trends`。git 摘要每 30 秒、今日花費每分鐘抓一次，只在 3D 視圖開著且分頁可見時抓。
- 大廳場景：房間擴到 24.4 × 14，右側大廳放六件物件（有 Kenney 模型的用模型：電表箱、檔案櫃、螢幕、書櫃；白板與公告板沒有合適模型，用盒子拼）。物件可 Tab 聚焦、Enter 開頁，滑鼠移上物件（或 Tab 聚焦）會描邊、該物件的標籤恢復完整密度且不讓位，標籤上另有瀏覽器原生 `title` 提示（沒有自製 Tooltip）；不受「只看需要你」變淡影響。標籤分三種密度：預設視角是精簡（圖示＋數字，有異常才多一顆 chip）、拉近到預設距離的 0.8 倍以內是完整、縮遠到標記縮到 0.6 倍以下只留有異常的物件；標籤與角色標記碰撞時，物件標籤讓位（縮成小點或隱藏），相機停下後才算一次。桌群每排最多 6 桌（預設 4），一個任務最多 12 個座位，第 13 位起坐到散座區，區牌顯示「+K 在散座」。
- 分包：物件、標籤與事件動畫放在場景的第二個延遲 chunk，第一次 render 之後才載入；載入失敗時橫幅的「再試 3D」可重試。清單模式不會載入它。
- 角色互動事件：reviewer 出動、審查通過／要修、ESCALATE（leader 頭上與找人清單的「!」常駐到 DECISION 或 ruling）、波關閉、任務結案。只播 SSE 即時收到的事件；首次載入、重連、背景分頁切回都直接畫最終狀態、不補播。每個事件寫一句到頁面的隱藏 live region（`aria-live="polite"`，3D 與清單模式都播報）；`prefers-reduced-motion` 時不走路、不跳，只出泡泡。動畫：reviewer 從座位走到目標（單一 dev 就走到那位 dev 旁，多位 dev 則走到任務白板前）、拿板子站著直到結果出來，座位螢幕變暗；通過時 dev 比讚、要修時垂頭冒汗，reviewer 走回座位；波關閉時 leader 點頭、白板進度格填滿並迸星點；結案時整桌跳兩下、白板灑彩帶。已經在等你或出錯的角色不起身、不比讚，只出泡泡；reviewer 走到一半變成等你就停在原地揮手。事件播完角色回到細狀態該有的姿勢與位置，動畫只在播放期間要求連續 render，播完回到靜止 0 幀。進 `/office` 時會對每個進行中任務抓一次任務詳情，之後靠 SSE 保持新鮮。
- 範圍：只追 `dashboard.config.json` 專案（含其 `.worktrees/**`）底下 cwd 的 Claude Code 與 Codex session，其他 agent 不做。pane 與 session 以 herdr 給的 session id 優先對應，沒有時退回「同 cwd、同 kind、最近更新」；同 cwd 有多個 Codex pane 又分不出誰是誰時寧可不對，不會把甲的狀態掛到乙。
- 隱私：提示詞與回覆全文不出 server；送到網頁的文字只有工具名加參數摘要（≤ 80 字；參數取指令、路徑、搜尋字串、說明等，不含子 agent 的 `prompt`）、等你的問句（≤ 200 字）、錯誤第一行（≤ 200 字）。
- **Claude 等審批的已知限制**：Claude Code 的審批請求不會寫進 session JSONL，所以「等你」只能由 herdr 回報該 pane `blocked` 轉出，問句取自 pane 畫面最後一行以問號結尾的文字（啟發式，抓不到時不顯示問句）；herdr 沒回 blocked、或畫面上沒有問號行時，審批會顯示成執行或思考。Codex 的審批事件有寫進 rollout，但 dkbo 的 Codex 通常以 `approval_policy: never` 執行，很少出現。
- Claude 出錯時 herdr 實際回報什麼尚未實測；細狀態以 JSONL 的 API 錯誤優先（pane 粗狀態一律顯示 blocked）。
- 3D 素材：角色來自 [Kenney Mini Characters 1.0](https://kenney.nl/assets/mini-characters)、家具與大廳物件來自 [Kenney Furniture Kit 2.0](https://kenney.nl/assets/furniture-kit) 與 [Kenney Factory Kit 3.0](https://kenney.nl/assets/factory-kit)，授權 CC0 1.0；只保留用到的模型與動畫並做 meshopt 壓縮，授權與修改說明見 `apps/web/public/office/LICENSE.md`。

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

## session 唯讀保證
server 對 `~/.claude`、`~/.codex` 只做 `readdir`、`stat`、讀檔（transcript 只讀新增的位元組），不寫入、不刪除；對 herdr 沒有新增任何寫入類呼叫（Claude pane 轉等你時多讀一次可見畫面，走既有的 `herdr pane read` 白名單）。網頁沒有任何回覆或審批操作。

## git 唯讀保證
server 對各專案的 git 只會跑白名單內的指令（`apps/server/src/git.ts` 的 `gitArgs`）：`status --porcelain=v2 --branch -z`、`worktree list --porcelain -z`、`log --all --topo-order`、`show -s <hash>`、`diff-tree <parent> <hash>`（檔案清單），以及單檔 `diff-tree -p --no-ext-diff --no-textconv <parent> <hash> -- <path>`（不執行 repo 設定的外部 diff／textconv；path 必須是該 commit 改到的檔）。每次都帶 `--no-optional-locks`（status 不刷新 index、不建 `index.lock`）、`-c core.fsmonitor=false`（不執行 repo 設定的 fsmonitor 指令），並設 `GIT_TERMINAL_PROMPT=0`、不繼承 server 的 `GIT_*` 環境變數；commit 參數只收 7–64 碼小寫 hex。不 fetch、不 checkout、不寫任何 ref。HTTP 只有 GET：`/api/git`（各專案摘要）、`/api/git/:project?limit=1..1000`、`/api/git/:project/commits/:hash`、`/api/git/:project/commits/:hash/diff?path=`；不是 git repo 回 409、找不到專案或 commit 回 404。

## 授權
MIT，見 [LICENSE](LICENSE)。
