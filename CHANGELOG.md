# Changelog

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，版號遵循 [語意化版本](https://semver.org/lang/zh-TW/)。

## [Unreleased]

### 改版：全站設計統一（dkbo 任務 unify）
- 設計系統：依 `design/unify/DESIGN-SYSTEM.md` 落地 token 與共用元件。狀態色收斂成五種語意 token（danger、warn、ok、idle、info，亮暗各一套、正文 ≥ 4.5:1），ESCALATE 一律 warn；另有終端、版面寬度（內容頁 `max-w-page` 1536px、`--topbar-h`、側欄／詳情欄寬）、圖表高度等 token。刪掉 cuteui 時覆寫的 Tailwind 舊色階（red／amber／emerald／sky／orange／yellow／violet），前端程式不再用色階 class、任意字級與圓角；元件（.tsx）裡剩下的 hex 只有圖表色盤（git 分支圖 lane、recharts 預設樣式選擇器）。
- 共用元件：PageHeader、Banner、EmptyState、SegmentedControl、SummaryTile、Tag、StatusDot、IconBlock、ProgressBar、SidebarList、PaneHeader、ChartCard、Breadcrumb；StatusPill 改吃狀態 tone（已結案任務 idle＋✓、agent done ok＋✓）。按鈕、標籤全圓角，表格支援 dense 密度。
- 頂部列：高 3.5rem、內容寬對齊頁面；狀態依嚴重度排：卡住（紅、脈動）→ 熔斷（黃）→ 額度（任一 ≥ 80% 變黃、永不變紅），放不下收成 `+N` 彈出清單；新增 SSE／herdr 連線燈＋說明 Tooltip。
- 總覽：四張摘要卡（新增「熔斷與額度」）；專案分「需要注意／活躍」與收合的「閒置專案」；縮圖只畫工作中／卡住的 pane、最後 10 行；活動欄依任務分組、加「全部｜需處理」切換（需處理＝ESCALATE、BUG、BLOCKED、LIMIT、TIMEOUT、STOP）；手機版順序改成摘要 → 活躍專案 → 活動（最新 5 則）→ 閒置專案。
- 任務詳情：麵包屑＋頁首工具列（看 herdr、複製 focus 指令）；寬螢幕右欄任務資訊與花費；波次時間軸只展開進行中的波；成員表精簡 herdr 欄；分頁改 SegmentedControl。
- 歷史：篩選移到頁首；dev vs 審查圖預設最近 15 件、可切「顯示全部」；表格預設 10 件、「再顯示 30 件」；三欄審查數字合成「審查」一欄（`9/6 · m5 · r1`）。
- 趨勢：時間區間移到頁首；圖表改 ChartCard，沒資料的圖收成矮的空狀態卡；kind／角色清單改 dense 表格。
- herdr、git：工具頁滿版窗格卡；herdr 左側 spaces／agents 清單（agents 依卡住 → 工作中 → 閒置）、鍵盤說明移到頁首 `?`；git 左欄三段清單、ref 改標籤、commit 詳情選了才出現。鍵盤、網址（`?p=&c=&f=`）、Esc 行為不變；終端畫面亮暗都固定黑底。
- 各頁自寫的錯誤條全換成 Banner（沒資料紅、有舊資料黃＋重試）。API、server 與 SSE 事件未改。

### 改版：深靛可愛風主題、總覽摘要卡與活動欄（dkbo 任務 cuteui）
- 主題：全站換成深靛遊戲風（參考 Dribbble 深色 dashboard），深淺兩套都留、主題切換照舊。深色底 `#1e2142`、卡片 `#282b55`；淺色底 `#eef0fb`、白卡；強調色電光藍 `#5b8cff`、紫 `#7b5cff`、珊瑚 `#ff5a6e`。卡片改無邊框＋柔和陰影、圓角約 20px；沿用 Nunito＋粉圓與馬卡龍狀態色（卡住＝紅系、工作中＝綠系）。
- 狀態膠囊與頂部列膠囊（卡住、熔斷、額度）改成彩色外框、透明底。
- 對比：正文、膠囊、摘要卡文字在深淺兩套皆 ≥ 4.5:1；為此微調幾個狀態色階的亮度（red-400、orange-700、amber-600／700、emerald-600、sky-600），任務頁的勾選與測試結果圖示補深色變體。圖表類別色對新卡片底色重驗通過。herdr 終端畫面維持黑底與原 ANSI 色。
- 總覽：上方三張漸層摘要卡——進行中任務數（附最近更新的兩個任務波次）、今日花費（附昨日對照，取 `/api/trends?range=7d` 每分鐘重抓）、卡住的 agent（0 時「大家都很順 ✨」，整張點了到 herdr 頁）。
- 總覽：右側活動動態欄（lg 以上約 320px、sticky、自己捲；窄螢幕排在專案卡之後），列出各任務的重要事件與訊息、成員依名字固定配小動物頭像（leader 戴皇冠）、相對時間，點了到任務詳情。收到 `task.updated`／`overview.updated` 後 1 秒防抖重抓，另每分鐘保底重抓；失敗可重試。資料來自新的唯讀 `GET /api/activity`。
- 專案卡裡的任務列改成圓角卡片列。
- 參考圖左上的漸層曲線卡、聊天輸入框、左欄、浮動按鈕本次未做。

## [0.3.0] - 2026-10-01

### 新增：git 頁（/git）
- 各專案的 git 唯讀檢視：專案清單（分支、改動數、ahead/behind、worktree 數；不是 git repo、路徑不存在會標出）、工作樹狀態（衝突／已暫存／未暫存／未追蹤）、worktree 清單與各自的改動。
- 歷史：所有分支與 tag 的分支圖（merge 空心點），預設 200 筆、可載入更多到 1000 筆；點 commit 看作者、訊息與改動檔案（+/−），再點檔案在中欄看 diff（舊／新行號，超過 5000 行截斷）。
- 版面：lg 以上三欄滿版、body 不捲，各欄自己捲；窄螢幕退回直排。Esc 依序關 diff、關 commit 詳情；選的專案／commit／檔案存在網址（`?p=&c=&f=`）。每 10 秒更新，不 fetch。
- API（只有 GET）：`/api/git`、`/api/git/:project?limit=`、`/api/git/:project/commits/:hash`、`/api/git/:project/commits/:hash/diff?path=`。
- server 只跑白名單內的唯讀 git 指令：帶 `--no-optional-locks`、關 fsmonitor，diff 不執行 repo 設定的外部 diff／textconv；commit 只收 hex、diff 的 path 必須是該 commit 改到的檔。新環境變數 `DASH_GIT_BIN`。

## [0.2.0] - 2026-09-26

### 新增：花費依模型與 effort 拆分（dkbo 任務 modelcost）
- 兩個來源並存、分開顯示：「實際」＝herdr 回報、寫進趨勢樣本的 model／effort；「設定」＝dkbo 派工的 kind／檔位（process.md 的 spawn 行＋各專案 `roles`／`kinds` 檔推出 model／effort，舊任務也有）。
- /trends：新卡片「依模型／effort 花費（實際）」「依派工檔位花費（設定）」與「實際與設定不一致」區塊；依任務花費的成員旁顯示設定檔位與不一致標記。
- 任務詳情：成員表新增「設定」「實際」兩欄（多次派工附「共 N 次」），花費卡顯示檔位。
- /history：新增「檔位」欄與「依角色 × 派工檔位」分析卡（花費、平均耗時、波數、修復波數、重審次數）。
- API 只新增欄位：`/api/costs` 加 `byActual`、`byConfigured`、`mismatch`，`TaskCost` 加 `byConfigured`、`memberInfo`；任務詳情與歷史回應加 `dispatch`、`repairWaves`。舊樣本照常可讀，缺欄顯示「未知」。
- server 對被監看專案的 roles／kinds 檔只以文字讀取，不 source、不執行。

### 改進：技術債清理（dkbo 任務 debt）
- 穩定性：herdr 訂閱 5 秒無回應即退回輪詢並重連；已結案詳情預抓排在 list 之後、每輪限量、失敗快取 60 秒；SSE 連線多時不再印 MaxListeners 警告；任務 `:dir` 格式不合回 404；舊版專案的 overlay 連結會補連。
- 關機：收到 SIGTERM／SIGINT 先收掉在途的 dk-status 行程群組再清 overlay，不再留孤兒行程。
- 效能：啟動後背景預熱趨勢與花費資料；實測 30 天×20 pane 下，第一次 `/api/costs?range=all` 由秒級降到 150ms 內。
- 手機版：/trends「依任務花費」在 768px 以下改為卡片列，不再橫向捲動。
- 總覽「波 N 進行中 · 已 X」改用統一的時間格式（例如「5 小時 0 分」）。
- 測試：e2e 改用執行期建立的假 dk-status 專案，不再依賴本機真實專案；server 測試與 e2e 不再在暫存目錄留下殘留；修正偶發不穩的比對。

## [0.1.0] - 2026-09-26

第一個標版。本機唯讀 Web dashboard，聚合多個 dkbo 專案的任務記憶與 herdr 即時狀態。

### 總覽、任務與歷史（dkbo 任務 dashv1）
- 總覽：依 `dashboard.config.json` 列出各專案；進行中任務的波進度、ESCALATE／UNDELIVERED 計數、成員 herdr 狀態膠囊、「其他 session」；已結案摺疊。
- 沒有 dk-status 的舊版（0.16）專案以自帶 dk-status 的相容模式列出；壞路徑、逾時、schema 不符等錯誤態不影響其他專案。
- 任務詳情：波次時間軸、成員表、驗收標準／所有權／裁定／訊息／事件原文分頁。
- /history：跨專案已結案任務表與耗時分析圖。
- 頂部列：熔斷倒數、各 kind 的 5h／週額度、SSE 與 herdr 連線燈；深淺色主題。
- SSE 即時推送；herdr 訂閱斷線自動退回輪詢並重試。

### herdr 唯讀鏡像
- /herdr：spaces、tabs、分割版面與 pane 畫面（ANSI 上色）、agents 狀態；鍵盤導覽仿 herdr（↑↓ space、n/p/1-9 tab、h/j/k/l pane、Tab 循環、z 放大）。
- herdr 結構變動以 SSE `herdr.view` 即時推送，訂不到事件時退回輪詢。
- 捲動歷史（e）：herdr 有保留歷史的 pane 可往回捲。
- 搜尋（/）：搜尋所有 pane 的畫面，點結果跳到那一行並標黃。
- 唯讀保證：server 對 herdr 只跑 `api snapshot`、`pane read` 與 `events.subscribe`，由白名單函式組參數並有守門測試。

### 提醒與跳轉
- 全站 blocked 提醒：分頁標題計數、頂部紅色膠囊、可選的桌面通知（只通知新變成 blocked 的 agent）。
- 任務成員表與總覽 hover 卡「看畫面」連到 herdr 頁；herdr 頁 pane 標頭顯示所屬任務並可跳回。
- 總覽專案卡顯示 agent 畫面縮圖（每 5 秒更新，可關）。

### 花費與額度趨勢（dkbo 任務 trends）
- server 每分鐘取樣所有 agent 的 cost／ctx／5h／週額度，落地到 `$DASH_DATA_DIR/samples/*.jsonl`（預設 `~/.local/state/dkbo-dashboard`，保留 30 天），不寫任何被監看專案。
- /trends：額度折線與撞額度預估、ctx 折線、每日花費、依任務／角色／kind 的花費；範圍 6h／24h／7d／30d。
- 任務詳情顯示本任務花費，/history 加花費欄。
- 新 API：`GET /api/trends`、`GET /api/costs`；新 env：`DASH_DATA_DIR`、`DASH_SAMPLE_MS`、`DASH_RETENTION_DAYS`。

### 已知限制
- 花費只算得到 dashboard 開著期間記錄的差額；「cost 在 session 重開後變小」是未實測的假設（見 README）。
- Claude Code 是全螢幕 TUI，herdr 不保留其捲動歷史，歷史模式對 Claude pane 無作用。

[0.2.0]: https://github.com/dkbo/dkbo-team-dashboard/releases/tag/v0.2.0
[0.1.0]: https://github.com/dkbo/dkbo-team-dashboard/releases/tag/v0.1.0
