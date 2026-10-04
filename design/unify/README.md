# dkbo 儀表板設計：深靛可愛風（unify）

延續 10/03 cuteui 的深靛可愛主題（`apps/web/src/index.css`），整理成全站共用的一套規則，套到
總覽 `/`、任務詳情 `/p/:project/t/:dir`、歷史 `/history`、趨勢 `/trends`、herdr `/herdr`、git `/git` 與頂部列。

**規格（token、骨架、元件尺寸與狀態）全部在 [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)**；本檔只放設計原則、各頁重點與檔案索引。

## 檔案索引

| 檔案 | 內容 |
|---|---|
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | **Design System Spec**：How to use（CSS variables、Tailwind v4 @theme、index.css 改動與落地順序）→ 1 Color Tokens（含[狀態色規則](DESIGN-SYSTEM.md#14-狀態色使用規則)）→ 2 Typography → 3 Spacing／圓角／Border → 4 Desktop Grid 與 Layout（含[兩種頁面骨架與各頁欄格](DESIGN-SYSTEM.md#4-desktop-grid-與-layout-結構)）→ 5 元件清單與組合 → 6 每個元件的尺寸、padding、文字層級與狀態 |
| [`tokens.json`](tokens.json) | DESIGN-SYSTEM 的機器可讀版（名字與值一致） |
| [`open-questions.md`](open-questions.md) | 要人裁決的選擇題，每題附建議；規格照 ★ 寫 |
| `page-*.webp` | 1440 寬設計稿：overview（亮＋暗）、task、history、trends、herdr、git；另 overview-390 |
| `unify.pen` | 所有稿的原始檔（pen.dev），frame 名與 webp 同名 |
| `.src/` | 產生 `unify.pen` 與 webp 的 pen 腳本（見文末「重畫稿」） |

> 稿上的資料是照 10/04 實機（四個專案、cuteui 已結案）改寫的示意值，不是規格。
> 主題分配：總覽亮暗各一張（亮版示範「卡住 1」的 danger 卡、暗版示範 0 值收斂的 quiet 卡）；任務、歷史、git 為亮色，趨勢、herdr 為暗色。另一個主題只換 token，版面相同。
> 字型：pen 沒有 Huninn，稿上中文是系統黑體 fallback，Latin 為 Nunito；實作照 index.css 的 Nunito＋Huninn。
> **稿與 DESIGN-SYSTEM.md 衝突時以 DESIGN-SYSTEM.md 為準。**

---

## 1. 設計原則

1. **資訊先行，可愛點到為止。** 漸層、3D 斜放圖示、動物頭像、emoji 只出現在三個地方：**摘要**（SummaryTile）、**身分**（頭像、Logo）、**空狀態**（EmptyState）。資料區（表格、圖表、清單、終端）保持安靜：白卡／亮一階卡＋柔和陰影，不加漸層。
2. **顏色只講狀態。** 紅／琥珀／綠／灰四個語意色各有一個意思（見 [DESIGN-SYSTEM §1.4](DESIGN-SYSTEM.md#14-狀態色使用規則)），不拿來裝飾；品牌三色（藍 `#5b8cff`、紫 `#7b5cff`、珊瑚 `#ff5a6e`）只用在導覽選中、焦點環、圖表、裝飾與「非狀態」的數字（花費）。
3. **沒事就收，有事才大。** 值為 0、閒置、乾淨、沒有資料的東西變小變灰（SummaryTile `quiet`、IdleProjectRow、計數 0 不顯示、圖表空狀態收成矮卡）；需要人處理的事放大、上色、排前面。
4. **一套骨架，兩種密度。** 「內容頁」（捲動、置中容器）與「工具頁」（滿版、窗格自捲）兩種骨架共用同一個頁首、卡片、側欄規格（見 [DESIGN-SYSTEM §4.4–4.6](DESIGN-SYSTEM.md#4-desktop-grid-與-layout-結構)）。
5. **全部 token 化。** 不寫死 hex、px、`text-[..px]`、`rounded-[..]`。只用 [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) 列的 token；要新值先改 token（並同步 `tokens.json`）。
6. **亮暗同構。** 亮暗兩套只換 token 值，不換版面、不換元件。終端畫面（herdr、縮圖）兩套都固定黑底。
7. **可及性底線。** 正文與底色 ≥ 4.5:1；有意義的框線、圖示 ≥ 3:1；顏色永遠搭配文字或圖示（膠囊有字、狀態有點或圖示）；所有可點元素有 `focus-visible` 環；尊重 `prefers-reduced-motion`（脈動點、hover 上浮關掉）。

---

## 2. 各頁重點（稿：`page-*.webp`）

狀態色怎麼用見 [DESIGN-SYSTEM §1.4](DESIGN-SYSTEM.md#14-狀態色使用規則)；骨架與欄格見 [DESIGN-SYSTEM §4](DESIGN-SYSTEM.md#4-desktop-grid-與-layout-結構)；元件規格見 [DESIGN-SYSTEM §6](DESIGN-SYSTEM.md#6-每個-component-的尺寸padding文字層級與基本狀態)。

### 2.0 各頁頁首（PageHeader）

| 頁 | 圖示 | 標題 | 副標 | 工具列 |
|---|---|---|---|---|
| 總覽 | `LayoutDashboard` | 總覽 | `4 個專案 · 最後更新 12:56` | 「畫面縮圖」切換（Button ghost＋aria-pressed） |
| 任務 | `ListChecks` | 任務名（display） | `<project> · <dir> · <分支>` + StatusPill | 「看 herdr」Button outline、「複製 focus 指令」 |
| 歷史 | `History` | 歷史與分析 | `共 39 件已結案` | 專案 Select、結案起迄 Field、清除篩選 |
| 趨勢 | `ChartLine` | 花費與額度趨勢 | `dashboard 未開啟期間的花費可能遺漏` | SegmentedControl 6 小時／24 小時／7 天／30 天 |
| herdr | — | herdr | `唯讀鏡像：不會送任何按鍵` | 搜尋（/）、放大（z）、鍵盤說明 `?` |
| git | — | git | `唯讀：每 10 秒更新，不 fetch` | — |

### 2.1 總覽（`page-overview-light.webp`、`page-overview-dark.webp`、`page-overview-390.webp`）

- **頁首**＋**摘要列**：4 張 SummaryTile（`grid-cols-2 lg:grid-cols-4 gap-4`），依 [DESIGN-SYSTEM §1.4](DESIGN-SYSTEM.md#14-狀態色使用規則) 變色。
- **活躍優先**：專案分兩組。
  1. **需要注意／活躍專案**：有 running／planning 任務、有 blocked agent、有錯誤或過時的專案，照「danger > warn > 活躍 > 其他」排序，每個一張 ProjectCard（`xl:grid-cols-2`，只有一張時滿寬）。
  2. **閒置專案**：沒有進行中任務、沒有警示的專案，收成一張「閒置專案」卡，每專案一列 IdleProjectRow（高 `row`：名稱、版本 Tag、`已結案 N`、其他 session 的狀態點、最後結案時間、展開箭頭）。點列展開成原本的內容（已結案清單、session、縮圖）。
- **縮圖**：只畫「工作中／卡住」pane 的縮圖，寬度跟著卡片（`grid-cols-1 sm:grid-cols-2`），終端字用 `mono-terminal`（11px，不再 9px），顯示最後 10 行；閒置 pane 不畫縮圖，只留 StatusPill（hover 照舊出 PaneHover）。
- **活動欄**（`--rail-w` 320）：**依任務分組**，同一任務連續的事件收成一組：組頭一列（`project · 任務 short`、組內最新相對時間），組內每則一行 ActivityItem `compact`（無頭像：leader 事件不再重複 👑；成員訊息顯示 24px 頭像）。text 最多 2 行，hover／focus 時 `title` 顯示全文，點組頭進任務。組內超過 4 則收成「再看 N 則」。
- **390 手機規則**（`page-overview-390.webp`）：
  1. TopBar 兩列：Logo＋狀態摘要膠囊＋主題鍵／導覽橫向捲動（不換行）。
  2. 摘要卡 2×2，`min-h-28`（112），值 `text-2xl`，副行 `text-xs` 1 行，裝飾圖示 72px。
  3. 需要注意／活躍專案卡。
  4. 活動：只顯示最新 **5 則**（分組後），底部「看全部活動」按鈕展開成全部（或開 Sheet）。
  5. 閒置專案卡（預設收合）。
  - 不得出現橫向捲動；頁高目標 < 3 個螢幕（現況 7459px）。

### 2.2 任務詳情（`page-task.webp`）

- Breadcrumb（`text-sm`）→ PageHeader（標題＝任務名、副標＝專案·dir·分支、StatusPill）。
- ≥ xl 兩欄：主欄（波次時間軸、成員表、Tabs 內容）＋右欄 `--aside-w`（任務資訊 dl 卡、任務花費卡）。
- 波次時間軸：每波一個 `muted` 內嵌列（`rounded-lg bg-muted`，取代現在的 `border` 框）。**只有進行中的波展開**（`p-4`：五步驟點＋連線，完成＝`status-ok`、進行中＝`primary` 外圈、未到＝`input` 空心）；已關閉的波收成一行（h-11：波號、StatusPill「已關閉」、成員 · 耗時、測試 Tag、commit Tag，點了展開）；未開始的波一行、`opacity-80`。
- 成員表照 Table 規格；`state` 欄改用 StatusPill（blocked＝danger）；「herdr」欄只留 StatusPill＋「看畫面」icon button，複製指令收進 hover。
- Tabs（驗收標準／檔案所有權／裁定／訊息／事件原文）改用 SegmentedControl 樣式。

### 2.3 歷史（`page-history.webp`）

- 篩選移到 PageHeader 工具列。
- 圖表：dev vs 審查圖預設只畫**最近 15 件**，ChartCard 右上「顯示全部 39 件」（open-questions Q8）。
- 表格「太密」修正：列高 44（`h-11`）、儲存格 `px-3`、表頭 `h-10 text-xs font-bold text-muted-foreground`、數字欄 `tabular-nums`、0 值灰；專案欄改成 Tag；「裁定/自主、minor、審查複看」三欄合成一欄「審查」：`9/6 · m5 · r1`（裁定/自主 · minor · 重審；表頭 Tooltip 解釋；open-questions Q7）。表格預設顯示最近 10 件，底部「再顯示 30 件」。

### 2.4 趨勢（`page-trends.webp`）

- 時間區間用 SegmentedControl 放頁首右側。
- **空資料圖表**：ChartCard 的 `empty` 狀態不畫軸，整張卡收成 `min-h-36`，中間 EmptyState `size="inline"`（圖示圓＋「這段期間沒有 agy 額度資料」＋提示「dashboard 開著時每分鐘記一次」）。兩張額度卡同列時另一張照常高度，空卡**頂端對齊、不拉高**（`items-start`）。
- 全頁沒資料時：一張 EmptyState `size="page"`。
- 「依 kind／依角色」金額清單用 Table `dense` 變體的兩欄清單（列高 36）。

### 2.5 herdr（`page-herdr.webp`）

- 工具頁骨架：左 SidebarList 卡（spaces／agents 兩段；agents 依狀態排序 blocked → working → idle）、主窗格卡（tab 列用 SegmentedControl `size="sm"`、右側搜尋／放大；下方終端黑底）。
- 鍵盤說明從左欄底搬到 PageHeader 的 `?` popover。
- pane 標題列沿用深色（終端內），狀態用 StatusPill `size="sm"`（h-5、`text-2xs`）。

### 2.6 git（`page-git.webp`）

- 工具頁骨架：左欄是一張卡，三段 SidebarList（專案、工作樹狀態、Worktree）；中欄歷史卡；右欄 commit 詳情卡（選了才出現）。
- 專案項目第二行：分支（mono）＋狀態 Tag（乾淨＝ok、N 改動＝warn、衝突＝danger）＋ ↑↓。
- commit 列 h-9、hash `font-mono text-xs text-muted-foreground`、ref 用 Tag（`HEAD → master`＝`info`、遠端分支＝`neutral`、版本 tag＝`brand` 加 lucide `Tag` 圖示；現在的琥珀框版本 tag 會被誤讀成警示，改掉）。

---

## 3. 重畫稿

`.src/` 是產生 `unify.pen` 與 webp 的 pen 腳本（`lib*.js` 是 token 變數與元件 helper，`p0`–`p7` 每頁一支）。
`node .src/run.mjs <合併後的 snippets.js> - unify.pen .exports/unify.png` 會走 `pen interactive` 無頭模式逐段 `execute`（不用 `--prompt`）。
改 token 先改 `DESIGN-SYSTEM.md` 與 `tokens.json`，稿用得到的再同步 `.src/p0-tokens.js`（它只放稿用到的顏色變數，不必涵蓋全部 token）。
