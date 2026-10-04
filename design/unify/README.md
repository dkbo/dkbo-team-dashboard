# dkbo 儀表板 Design System：深靛可愛風（unify）

延續 10/03 cuteui 的深靛可愛主題（`apps/web/src/index.css`），整理成全站共用的一套規則，套到
總覽 `/`、任務詳情 `/p/:project/t/:dir`、歷史 `/history`、趨勢 `/trends`、herdr `/herdr`、git `/git` 與頂部列。
字型沿用 Nunito Variable＋Huninn（粉圓），不引入新套件；圖示只用 lucide-react。

| 檔案 | 內容 |
|---|---|
| `README.md` | 本檔：設計原則、狀態色規則、兩種頁面骨架、各頁重點 |
| `tokens.md`／`tokens.json` | color（亮暗＋狀態色）、typography、spacing、radius、shadow、layout；與 index.css 對照、改名與新增清單 |
| `components.md` | PageHeader、TopBar、SummaryTile、Card／ChartCard、StatusPill／Tag、Table、SidebarList、ActivityItem、Banner、EmptyState、SegmentedControl、Button／Field、TaskRow、IdleProjectRow |
| `open-questions.md` | 要人裁決的選擇題，每題附建議 |
| `page-*.webp` | 1440 寬設計稿：overview（亮＋暗）、task、history、trends、herdr、git；另 overview-390 |
| `unify.pen` | 所有稿的原始檔（pen.dev），frame 名與 webp 同名 |

> 稿上的資料是照 10/04 實機（四個專案、cuteui 已結案）改寫的示意值，不是規格；規格以文件為準。
> 主題分配：總覽亮暗各一張（亮版示範「卡住 1」的 danger 卡、暗版示範 0 值收斂的 quiet 卡）；任務、歷史、git 為亮色，趨勢、herdr 為暗色。另一個主題只換 token，版面相同。
> 字型：pen 沒有 Huninn，稿上中文是系統黑體 fallback，Latin 為 Nunito；實作照 index.css 的 Nunito＋Huninn。
> 稿與文件衝突時以 `components.md`／`tokens.md` 為準。

---

## 1. 設計原則

1. **資訊先行，可愛點到為止。** 漸層、3D 斜放圖示、動物頭像、emoji 只出現在三個地方：**摘要**（SummaryTile）、**身分**（頭像、Logo）、**空狀態**（EmptyState）。資料區（表格、圖表、清單、終端）保持安靜：白卡／亮一階卡＋柔和陰影，不加漸層。
2. **顏色只講狀態。** 紅／琥珀／綠／灰四個語意色各有一個意思（見 §2），不拿來裝飾；品牌三色（藍 `#5b8cff`、紫 `#7b5cff`、珊瑚 `#ff5a6e`）只用在導覽選中、焦點環、圖表、裝飾與「非狀態」的數字（花費）。
3. **沒事就收，有事才大。** 值為 0、閒置、乾淨、沒有資料的東西變小變灰（SummaryTile `quiet`、IdleProjectRow、計數 0 不顯示、圖表空狀態收成矮卡）；需要人處理的事放大、上色、排前面。
4. **一套骨架，兩種密度。** 「內容頁」（捲動、置中容器）與「工具頁」（滿版、窗格自捲）兩種骨架共用同一個頁首、卡片、側欄規格（§3）。
5. **全部 token 化。** 不寫死 hex、px、`text-[..px]`、`rounded-[..]`。只用 `tokens.md` 列的 Tailwind class；要新值先改 token。
6. **亮暗同構。** 亮暗兩套只換 token 值，不換版面、不換元件。終端畫面（herdr、縮圖）兩套都固定黑底。
7. **可及性底線。** 正文與底色 ≥ 4.5:1；有意義的框線、圖示 ≥ 3:1；顏色永遠搭配文字或圖示（膠囊有字、狀態有點或圖示）；所有可點元素有 `focus-visible` 環；尊重 `prefers-reduced-motion`（脈動點、hover 上浮關掉）。

---

## 2. 狀態色規則

### 2.1 四個語意（＋一個資訊色）

| 語意 | token 前綴 | 意思 | 一句話判準 |
|---|---|---|---|
| **danger 紅** | `status-danger` | 需要人**立刻**處理 | 不處理，事情就停在那裡 |
| **warn 琥珀** | `status-warn` | **降級／熔斷**／過時／部分失敗，系統還在跑 | 會自己好，或可以晚點處理 |
| **ok 綠** | `status-ok` | **運作中**、剛成功 | 正在動、或這一步過了 |
| **idle 灰** | `status-idle` | 閒置、已結束、未知 | 沒有在動，也不需要你 |
| info 紫 | `status-info` | 中性事件（spawn、review、wave-open…）、規劃中 | 只是告知 |

### 2.2 對照表（現況 → 新規則）

| 東西 | 現況 | 新 |
|---|---|---|
| agent `blocked`（卡住） | 紅 | **danger** |
| 訊息 ESCALATE、BUG、BLOCKED、STOP；測試失敗；git 衝突；頁面載入失敗（無資料可顯示） | 紅 | **danger** |
| kind 熔斷（agy／codex 熔斷 N 天） | **紅** | **warn**（長期、已自動降級） |
| LIMIT、TIMEOUT、UNDELIVERED、額度 ≥ 80%、資料過時（stale）、「更新失敗，顯示舊資料」、無法解析的行、herdr polling、git 有未提交改動、detached HEAD | 紅／橘／琥珀混用 | **warn** |
| agent `working`、任務 running、SSE／herdr 連線正常、DONE、FIXED、wave-close、gate3、task-close、測試通過、git 乾淨 | 綠 | **ok** |
| agent `idle`、未知、無 pane、任務 done／abandoned（已結案） | 灰／綠混用 | **idle**（done 加 ✓ 圖示、abandoned 加刪除線） |
| 任務 planning、event spawn／review／wave-open／ruling／gate1、DECISION | 藍／紫 | **info** |
| 專案卡「有警示」的外框 | 橘 ring | 依最高嚴重度：有 blocked → danger ring；只有 escalation／undelivered → warn ring |

### 2.3 每個語意色的四個 token

| token | 用途 |
|---|---|
| `--status-X` | 實心：狀態點、框線、進度條、圖示 |
| `--status-X-fg` | 文字（在 card／background／muted／soft 上都 ≥ 4.5:1） |
| `--status-X-soft` | 淡底：Banner 底、警示列底、計數 Tag 底 |
| `--grad-X-from`／`--grad-X-to` | 只給 SummaryTile 漸層（白字 ≥ 4.5:1） |

數值與對比見 `tokens.md` §1.3。

### 2.4 摘要卡依狀態變色、0 值收斂

| 卡 | 條件 | variant |
|---|---|---|
| 進行中任務 | > 0 | `ok`（綠漸層） |
|  | = 0 | `quiet`（卡片底、灰字「目前沒有任務在跑」） |
| 今日花費 | 有資料 | `brand`（紫漸層，花費不是狀態） |
|  | 無資料 | `quiet`（值 `—`） |
| 卡住的 agent | > 0 | `danger`（珊瑚漸層），名字最多 3 個 |
|  | = 0 | `quiet`，副行用 `status-ok-fg`「大家都很順 ✨」 |
| 熔斷與額度（新增，見 open-questions Q1） | 有 kind 熔斷或任一額度 ≥ 80% | `warn`（琥珀漸層），列 kind 與剩餘時間 |
|  | 都正常 | `quiet`，副行「額度都健康」＋最高用量 |

規則：**漸層卡＝要看一眼的事；quiet 卡＝沒事。** 一列最多同時出現兩張紅／琥珀漸層卡的情況是正常的，它們本來就該搶眼。

### 2.5 計數與 0

- `ESCALATE 0`、`UNDELIVERED 0` 這類計數 **0 時不顯示**；> 0 顯示成 `Tag` 的 `warn`／`danger` 變體（ESCALATE → warn，UNDELIVERED → warn，BLOCKED → danger）。
- 表格裡的 0 用 `text-muted-foreground`，非 0 才用 `text-foreground`；金額 0 顯示 `—`。

---

## 3. 兩種頁面骨架

兩種骨架都在 `AppLayout` 的 `<main>` 內，頂部列（TopBar）高度固定 `--topbar-h: 56px`（≥ lg 單列）。

### 3.1 內容頁（Content page）— 總覽、任務詳情、歷史、趨勢

```
┌ TopBar（sticky, h-14, 滿版底，內容 max-w-(--container-page) 置中）──────────────┐
├──────────────────────────────────────────────────────────────────────────────┤
│  <div class="mx-auto w-full max-w-(--container-page) px-4 lg:px-6 py-6         │
│              flex flex-col gap-6">                                             │
│    [Breadcrumb]（只有任務頁，PageHeader 之上，gap-2）                            │
│    PageHeader：圖示塊 + 標題 + 副標 ……………………………… 右側工具列                │
│    [Banner]（錯誤／警示，0..n 條）                                              │
│    區塊 1（SummaryTile 列 / Card / ChartCard 格）                                │
│    區塊 2 …（區塊之間 gap-6；同一區塊內卡片之間 gap-4）                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 容器：`max-w-(--container-page)`（= 1536px，與 `max-w-screen-2xl` 同值；四頁統一，取代 7xl／2xl 混用）；左右 gutter 手機 16、≥ lg 24；上下 24。
- 頁首到內容 `gap-6`；卡片格 `gap-4`；卡片內 `p-5 gap-4`。
- body 自然捲動；sticky 只有 TopBar 與總覽活動欄。
- 欄格：12 欄心智模型，實作用 `grid` + 下表：

| 頁 | ≥ xl（1280） | lg（1024） | < lg |
|---|---|---|---|
| 總覽 | 主欄 `minmax(0,1fr)` + 活動欄 `--rail-w`（320） | 同左 | 單欄（順序見 §4.1） |
| 任務 | 主欄 `minmax(0,1fr)` + 右側資訊欄 `--aside-w`（360） | 單欄 | 單欄 |
| 歷史 | 圖表 2 欄 → 表格滿寬 → 檔位分析滿寬 | 同左 | 單欄 |
| 趨勢 | 額度 2 欄 → ctx 滿寬 → 每日花費 8/12 + kind／角色 4/12 → 模型 2 欄 → 表格 | 同左 | 單欄 |

### 3.2 工具頁（Tool page）— herdr、git

```
┌ TopBar ─────────────────────────────────────────────────────────────────────┐
├─────────────────────────────────────────────────────────────────────────────┤
│ <div class="flex h-[calc(100svh-var(--topbar-h))] flex-col gap-3 p-3">         │
│   PageHeader size="compact"（h-10：標題 + 副標(唯讀說明) …… 右側工具列）         │
│   [Banner]                                                                    │
│   <div class="grid min-h-0 flex-1 gap-3 grid-cols-[var(--sidebar-w)_1fr(_aside)]"> │
│     SidebarList 卡（自己捲）│ 主窗格卡（PaneHeader h-10 + 內容自己捲）│ [詳情卡] │
│   </div>                                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

- 滿版寬（不設 max-w），四周 gutter 12（`p-3`），窗格之間 `gap-3`。
- 每個窗格是一張 `Card variant="pane"`：`rounded-xl bg-card shadow-soft overflow-hidden`，頂端 `PaneHeader`（h-10，`border-b`），內容區 `min-h-0 flex-1 overflow-auto`。取代現在的貼邊＋`divide-x` 分隔線。
- 左欄寬 `--sidebar-w`（256；≥ xl 288）；git 右側詳情 `--detail-w`（352；≥ xl 416）。
- body 不捲；窄於 lg 時改成單欄直排、body 捲動、各窗格限高 `max-h-[70svh]`（照現在的行為）。
- 唯讀說明從左欄底的 `text-[11px]` 小字搬到 PageHeader 副標（一行，超出 truncate＋`title`）。
- 終端區（herdr 主畫面、縮圖）是窗格內的 `bg-(--terminal-bg)`（固定 `#0b0b10`，不跟主題），圓角跟著窗格，內部不再加圓角。

### 3.3 共用頁首（PageHeader）

| 部位 | 內容頁（`size="default"`） | 工具頁（`size="compact"`） |
|---|---|---|
| 圖示塊 | 40×40 `rounded-lg bg-accent text-accent-foreground`，lucide 20px | 無 |
| 標題 | `text-2xl font-extrabold`（h1） | `text-lg font-extrabold`（h1，不再 sr-only） |
| 副標 | `text-sm text-muted-foreground`，一行 | 同字級，與標題同列（`·` 分隔），truncate |
| 右側工具列 | `flex gap-2 items-center`：SegmentedControl／Field／Button | 同左，元件用 `size="sm"` |
| 高度 | 自然（約 56） | h-10 |

各頁內容：

| 頁 | 圖示 | 標題 | 副標 | 工具列 |
|---|---|---|---|---|
| 總覽 | `LayoutDashboard` | 總覽 | `4 個專案 · 最後更新 12:56` | 「畫面縮圖」切換（Button ghost＋aria-pressed） |
| 任務 | `ListChecks` | 任務名（display） | `<project> · <dir> · <分支>` + StatusPill | 「看 herdr」Button outline、「複製 focus 指令」 |
| 歷史 | `History` | 歷史與分析 | `共 39 件已結案` | 專案 Select、結案起迄 Field、清除篩選 |
| 趨勢 | `ChartLine` | 花費與額度趨勢 | `dashboard 未開啟期間的花費可能遺漏` | SegmentedControl 6 小時／24 小時／7 天／30 天 |
| herdr | — | herdr | `唯讀鏡像：不會送任何按鍵` | 搜尋（/）、放大（z）、鍵盤說明 `?` |
| git | — | git | `唯讀：每 10 秒更新，不 fetch` | — |

---

## 4. 各頁重點（稿：`page-*.webp`）

### 4.1 總覽（`page-overview-light.webp`、`page-overview-dark.webp`、`page-overview-390.webp`）

- **頁首**＋**摘要列**：4 張 SummaryTile（`grid-cols-2 lg:grid-cols-4 gap-4`），依 §2.4 變色。
- **活躍優先**：專案分兩組。
  1. **需要注意／活躍專案**：有 running／planning 任務、有 blocked agent、有錯誤或過時的專案，照「danger > warn > 活躍 > 其他」排序，每個一張 ProjectCard（`xl:grid-cols-2`，只有一張時滿寬）。
  2. **閒置專案**：沒有進行中任務、沒有警示的專案，收成一張「閒置專案」卡，每專案一列 IdleProjectRow（48px 高：名稱、版本 Tag、`已結案 N`、其他 session 的狀態點、最後結案時間、展開箭頭）。點列展開成原本的內容（已結案清單、session、縮圖）。
- **縮圖**：只畫「工作中／卡住」pane 的縮圖，寬度跟著卡片（`grid-cols-1 sm:grid-cols-2`），終端字級 `--terminal-thumb-font`（10px，不再 9px），顯示最後 10 行；閒置 pane 不畫縮圖，只留 StatusPill（hover 照舊出 PaneHover）。
- **活動欄**（`--rail-w` 320）：**依任務分組**，同一任務連續的事件收成一組：組頭一列（`project · 任務 short`、組內最新相對時間），組內每則一行 ActivityItem `compact`（無頭像：leader 事件不再重複 👑；成員訊息顯示 24px 頭像）。text 最多 2 行，hover／focus 時 `title` 顯示全文，點組頭進任務。組內超過 4 則收成「再看 N 則」。
- **390 手機規則**（`page-overview-390.webp`）：
  1. TopBar 兩列：Logo＋狀態摘要膠囊＋主題鍵／導覽橫向捲動（不換行）。
  2. 摘要卡 2×2，`min-h-28`（112），值 `text-2xl`，副行 `text-xs` 1 行，裝飾圖示 72px。
  3. 需要注意／活躍專案卡。
  4. 活動：只顯示最新 **5 則**（分組後），底部「看全部活動」按鈕展開成全部（或開 Sheet）。
  5. 閒置專案卡（預設收合）。
  - 不得出現橫向捲動；頁高目標 < 3 個螢幕（現況 7459px）。

### 4.2 任務詳情（`page-task.webp`）

- Breadcrumb（`text-sm`）→ PageHeader（標題＝任務名、副標＝專案·dir·分支、StatusPill）。
- ≥ xl 兩欄：主欄（波次時間軸、成員表、Tabs 內容）＋右欄 `--aside-w`（任務資訊 dl 卡、任務花費卡）。
- 波次時間軸：每波一個 `muted` 內嵌列（`rounded-lg bg-muted`，取代現在的 `border` 框）。**只有進行中的波展開**（`p-4`：五步驟點＋連線，完成＝`status-ok`、進行中＝`primary` 外圈、未到＝`input` 空心）；已關閉的波收成一行（h-11：波號、StatusPill「已關閉」、成員 · 耗時、測試 Tag、commit Tag，點了展開）；未開始的波一行、`opacity-80`。
- 成員表照 Table 規格；`state` 欄改用 StatusPill（blocked＝danger）；「herdr」欄只留 StatusPill＋「看畫面」icon button，複製指令收進 hover。
- Tabs（驗收標準／檔案所有權／裁定／訊息／事件原文）改用 SegmentedControl 樣式。

### 4.3 歷史（`page-history.webp`）

- 篩選移到 PageHeader 工具列。
- 圖表：dev vs 審查圖預設只畫**最近 15 件**，ChartCard 右上「顯示全部 39 件」（open-questions Q8）。
- 表格「太密」修正：列高 44（`h-11`）、儲存格 `px-3`、表頭 `h-10 text-xs font-bold text-muted-foreground`、數字欄 `tabular-nums`、0 值灰；專案欄改成 Tag；「裁定/自主、minor、審查複看」三欄合成一欄「審查」：`9/6 · m5 · r1`（裁定/自主 · minor · 重審；表頭 Tooltip 解釋；open-questions Q7）。表格預設顯示最近 10 件，底部「再顯示 30 件」。

### 4.4 趨勢（`page-trends.webp`）

- 時間區間用 SegmentedControl 放頁首右側。
- **空資料圖表**：ChartCard 的 `empty` 狀態不畫軸，整張卡收成 `min-h-36`，中間 EmptyState `size="inline"`（圖示圓＋「這段期間沒有 agy 額度資料」＋提示「dashboard 開著時每分鐘記一次」）。兩張額度卡同列時另一張照常高度，空卡**頂端對齊、不拉高**（`items-start`）。
- 全頁沒資料時：一張 EmptyState `size="page"`。
- 「依 kind／依角色」金額清單用 Table `dense` 變體的兩欄清單（列高 36）。

### 4.5 herdr（`page-herdr.webp`）

- 工具頁骨架：左 SidebarList 卡（spaces／agents 兩段；agents 依狀態排序 blocked → working → idle）、主窗格卡（tab 列用 SegmentedControl `size="sm"`、右側搜尋／放大；下方終端黑底）。
- 鍵盤說明從左欄底搬到 PageHeader 的 `?` popover。
- pane 標題列沿用深色（終端內），狀態用 StatusPill `size="sm"`（h-5、`text-2xs`）。

### 4.6 git（`page-git.webp`）

- 工具頁骨架：左欄是一張卡，三段 SidebarList（專案、工作樹狀態、Worktree）；中欄歷史卡；右欄 commit 詳情卡（選了才出現）。
- 專案項目第二行：分支（mono）＋狀態 Tag（乾淨＝ok、N 改動＝warn、衝突＝danger）＋ ↑↓。
- commit 列 h-9、hash `font-mono text-xs text-muted-foreground`、ref 用 Tag（`HEAD → master`＝`info`、遠端分支＝`neutral`、版本 tag＝`brand` 加 lucide `Tag` 圖示；現在的琥珀框版本 tag 會被誤讀成警示，改掉）。

---

## 5. 給 frontend 的落地順序（建議）

1. index.css：加 §tokens 的新 token（狀態色、`text-2xs`、版面變數、`--terminal-bg`）；**不刪舊名**，舊 Tailwind 色階覆寫保留到所有元件換完。
2. 共用元件：`PageHeader`、`Banner`、`EmptyState`、`SegmentedControl`、`SummaryTile`、`Tag`、`SidebarList`（放 `components/app/`）；StatusPill 改吃狀態 token。
3. 逐頁換骨架：趨勢、歷史、任務（內容頁）→ git、herdr（工具頁）→ 總覽（版面改最多，最後做）。
4. 刪掉各頁自寫的錯誤條、`text-[..]`、`rounded-[..]`；`grep -rn "text-\[\|rounded-\[\|red-\|amber-\|emerald-" apps/web/src` 應只剩 chart 色盤與終端。

---

## 6. 重畫稿

`.src/` 是產生 `unify.pen` 與 webp 的 pen 腳本（`lib*.js` 是 token 變數與元件 helper，`p0`–`p7` 每頁一支）。
`node .src/run.mjs <合併後的 snippets.js> - unify.pen .exports/unify.png` 會走 `pen interactive` 無頭模式逐段 `execute`（不用 `--prompt`）；
改 token 先改 `p0-tokens.js` 與 `tokens.json`，兩邊要一致。
