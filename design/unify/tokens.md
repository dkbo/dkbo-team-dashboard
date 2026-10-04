# Tokens

機器可讀版：`tokens.json`（同內容，含每個值的對比數字）。
狀態欄：**keep** 既有、不變｜**changed** 既有名、改值或改用法｜**new** 新增｜**alias** 新名指向既有｜**deprecated** 移轉後刪。

所有對比以 WCAG 2.x 相對亮度計算（`scratchpad/contrast.mjs` 同算法；frontend 落地後請用 dataviz／axe 再驗一次）。

---

## 1. Color

### 1.1 基礎層（全部 keep）

| token | Tailwind | 亮 | 暗 | 用途 |
|---|---|---|---|---|
| `--background` | `bg-background` | `#eef0fb` | `#1e2142` | 頁底（另有兩團品牌色 radial 光暈，見 index.css body） |
| `--foreground` | `text-foreground` | `#1d2045` | `#eceeff` | 正文（亮 13.75:1） |
| `--card` | `bg-card` | `#ffffff` | `#282b55` | 表層：卡片、窗格、TopBar 下拉 |
| `--muted` | `bg-muted` | `#f3f4fc` | `#31356a` | 內層：卡片裡的列、SegmentedControl 外框、hover 底 |
| `--muted-foreground` | `text-muted-foreground` | `#565b82` | `#aeb2dc` | 次要文字（亮對 card 6.53、暗對 card 6.51） |
| `--popover` | `bg-popover` | `#ffffff` | `#2e3260` | Popover、HoverCard、Tooltip 底 |
| `--accent` / `-foreground` | `bg-accent` | `#ece8ff` / `#3d2c8a` | `#3a3577` / `#e0d9ff` | SidebarList 選中、PageHeader 圖示塊 |
| `--secondary` / `-foreground` | `bg-secondary` | `#f1edff` / `#3d2c8a` | `#353a6e` / `#e3e6ff` | Button secondary |
| `--primary` / `-foreground` | `bg-primary` | `#5b8cff` / `#10163a` | 同左 / `#0f1433` | 導覽選中、主要按鈕（5.54:1） |
| `--border` | `border-border` | `#e2e5f5` | `rgb(170 180 255/10%)` | 分隔線、表格列線 |
| `--input` | `border-input` | `#d6daf0` | `rgb(170 180 255/16%)` | Field 框 |
| `--ring` | `ring-ring` | `#7b5cff` | `#7b5cff` | 焦點環（一律 `/50`） |

層次：**background → card（表層）→ muted（內層）**，三層就夠；卡片裡的東西不再加陰影或框線。

### 1.2 品牌色（keep）

| token | 值 | 只用在 |
|---|---|---|
| `--brand-blue` | `#5b8cff` | 導覽選中（= primary）、額度膠囊框、Logo、圖表無關的裝飾 |
| `--brand-violet` | `#7b5cff` | 焦點環、info 狀態實心、PageHeader 圖示 |
| `--brand-coral` | `#ff5a6e` | Logo／插圖裝飾。**不當狀態色**（狀態紅用 `status-danger`） |

### 1.3 狀態色（new）

規則見 README §2。每個語意 3 個 token（＋SummaryTile 漸層）。

| 語意 | token | 亮 | 暗 | 對比（文字對 card／bg／soft；實心對 card） |
|---|---|---|---|---|
| danger | `--status-danger` | `#e0434f` | `#ff6b7f` | 實心 亮 4.13／暗 4.89 |
|  | `--status-danger-fg` | `#c62a44` | `#ff8a9a` | 亮 5.50／4.85／4.57；暗 5.97／6.92／4.92 |
|  | `--status-danger-soft` | `#fbe5e6` | `#46345b` | — |
| warn | `--status-warn` | `#b07800` | `#e9a520` | 實心 亮 3.80（對 bg 3.34）／暗 6.30 |
|  | `--status-warn-fg` | `#8a5300` | `#ffc76b` | 亮 6.33／5.57／5.70；暗 8.70／10.09／6.83 |
|  | `--status-warn-soft` | `#fcf2e0` | `#433c4e` | — |
| ok | `--status-ok` | `#1a9a74` | `#2cb68a` | 實心 亮 3.55／暗 5.21 |
|  | `--status-ok-fg` | `#0f7a5a` | `#5fdcae` | 亮 5.31／4.68／4.68；暗 7.87／9.13／6.37 |
|  | `--status-ok-soft` | `#e1f5ef` | `#293e5c` | — |
| idle | `--status-idle` | `#7a7fa8` | `#7d82b0` | 實心 亮 3.87／暗 3.63 |
|  | `--status-idle-fg` | `#565b82` | `#aeb2dc` | ＝ muted-foreground |
|  | `--status-idle-soft` | `#efeff5` | `#343762` | — |
| info | `--status-info` | `#7b5cff` | `#7b5cff` | 實心 亮 4.36／暗 3.07 |
|  | `--status-info-fg` | `#5b3fd9` | `#b9a8ff` | 亮 6.65；暗 6.45 |
|  | `--status-info-soft` | `#ede8ff` | `#34326d` | — |

`soft` 是「實心 14% 疊在 card 上」的結果寫死成 hex（在 background 上用也 OK，差 < 2%）。若想動態，可寫 `color-mix(in oklab, var(--status-X) 14%, var(--card))`，值相同。

Tailwind 對應（加在 `@theme inline`）：

```css
--color-status-danger: var(--status-danger);   --color-status-danger-fg: var(--status-danger-fg);   --color-status-danger-soft: var(--status-danger-soft);
--color-status-warn:   var(--status-warn);     --color-status-warn-fg:   var(--status-warn-fg);     --color-status-warn-soft:   var(--status-warn-soft);
--color-status-ok:     var(--status-ok);       --color-status-ok-fg:     var(--status-ok-fg);       --color-status-ok-soft:     var(--status-ok-soft);
--color-status-idle:   var(--status-idle);     --color-status-idle-fg:   var(--status-idle-fg);     --color-status-idle-soft:   var(--status-idle-soft);
--color-status-info:   var(--status-info);     --color-status-info-fg:   var(--status-info-fg);     --color-status-info-soft:   var(--status-info-soft);
```

→ class：`text-status-danger-fg`、`border-status-warn`、`bg-status-ok-soft`、`bg-status-idle`（點）。

### 1.4 SummaryTile 漸層（亮暗共用）

| token | from → to | 白字對 from | 用在 | 狀態 |
|---|---|---|---|---|
| `--grad-ok-*` | `#157f5f → #0e6b50` | 4.96 | 進行中任務 > 0 | new |
| `--grad-warn-*` | `#a05f00 → #7a4400` | 5.08 | 熔斷與額度有事 | new |
| `--grad-coral-*`（別名 `--grad-danger-*`） | `#d6344d → #a8243f` | 4.71 | 卡住的 agent > 0 | keep＋alias |
| `--grad-violet-*`（別名 `--grad-brand-*`） | `#6a4cf0 → #4a2fc0` | 5.38 | 今日花費 | keep＋alias |
| `--grad-blue-*` | `#4169e1 → #2c47b8` | 4.85 | 新規則不用，保留 | keep |

裝飾圖示維持 `opacity-12`（cuteui 教訓：疊字處也要算，0.12 時最暗疊色仍 ≥ 4.5）。

### 1.5 終端（new，亮暗相同）

| token | 值 | 取代 |
|---|---|---|
| `--terminal-bg` | `#0b0b10` | `bg-zinc-950` |
| `--terminal-chrome` | `#17171f` | pane 標題列 `bg-zinc-900` |
| `--terminal-line` | `#26262f` | `border-zinc-800` |
| `--terminal-fg` | `#e4e4e7` | `text-zinc-200`（15.47:1） |
| `--terminal-dim` | `#8b8b96` | `text-zinc-500`（5.83:1；原 zinc-500 對黑約 4.1） |

ANSI 色由 AnsiText 決定，不動。

### 1.6 圖表（keep）

`--chart-1..5` 與 `features/trends/palette.ts` 的 8 色 SERIES_COLORS 不動（cuteui 已過 validator）。格線 `stroke="var(--border)"`、軸字 `fill="var(--muted-foreground)" fontSize 12`、tooltip 走 Popover 樣式。

### 1.7 deprecated

- index.css 第二個 `@theme` 的 emerald／red／amber／sky／orange／yellow／violet 覆寫：元件換成 `status-*` 後刪除。
- 元件內 `text-red-*`、`text-amber-*`、`text-emerald-*`、`bg-orange-500/15`、`ring-orange-*`、`bg-zinc-*`：全部改 status／terminal token。

---

## 2. Typography

字族：`font-sans` = `'Nunito Variable', 'Huninn', sans-serif`（keep）；`font-mono` 只給 hash、dir、分支、時間戳、終端。

| token | Tailwind | px／行高 | 字重 | 用途 |
|---|---|---|---|---|
| display | `text-3xl font-extrabold tabular-nums` | 30／36 | 800 | SummaryTile 數值 |
| title-lg | `text-2xl font-extrabold` | 24／32 | 800 | 內容頁 PageHeader 標題（h1）；手機 SummaryTile 數值 |
| title-md | `text-lg font-extrabold` | 18／28 | 800 | 工具頁 PageHeader（h1）；區段標題（h2） |
| title-sm | `text-base font-bold` | 16／24 | 700 | CardTitle、活動欄標題、EmptyState 標題 |
| body | `text-sm` | 14／20 | 400 | 正文、表格、清單 |
| body-strong | `text-sm font-semibold` | 14／20 | 600 | 列主名稱、按鈕、導覽、SummaryTile 標籤（`font-bold`） |
| caption | `text-xs font-medium` | 12／16 | 500 | meta、時間、副行；StatusPill `font-semibold`；表頭 `font-bold` |
| micro | `text-2xs font-semibold` | 11／16 | 600 | Tag、計數、pane 標題列；**全站最小字級** |
| mono-sm | `font-mono text-xs` | 12／16 | 400 | hash、dir、時間戳 |
| mono-2xs | `font-mono text-2xs` | 11／16 | 400 | 縮圖終端 |

新增 token（`@theme`）：`--text-2xs: 0.6875rem; --text-2xs--line-height: 1rem;`

數字一律 `tabular-nums`（Nunito 有等寬數字），表格數字欄不必 `font-mono`。

禁用與替換：

| 現況 | 位置 | 換成 |
|---|---|---|
| `text-[9px]` | PaneThumbs 終端 | `font-mono text-2xs` |
| `text-[11px]` | GitPage 唯讀說明；CostTables 檔位 | PageHeader 副標；`Tag` |
| `text-[0.65rem]` | PaneThumbs StatusPill | `StatusPill size="sm"` |
| `text-[0.7rem]` ×6 | ActivityRail type、Count、herdr 標題列、ProjectCard | `text-2xs` / `Tag` |
| `text-[0.8rem]` | Button sm | `text-sm` |
| `CardTitle font-medium` | card.tsx | `font-bold` |

---

## 3. Spacing

刻度沿用 Tailwind 4px（不新增），以下是語意用法：

| 語意 | class | px | 用在 |
|---|---|---|---|
| page-x | `px-4 lg:px-6` | 16／24 | 內容頁左右 |
| page-y | `py-6` | 24 | 內容頁上下 |
| section-gap | `gap-6` | 24 | 頁首↔區塊、區塊↔區塊、總覽主欄↔活動欄 |
| grid-gap | `gap-4` | 16 | 卡片格、摘要列 |
| card-pad | `p-5` | 20 | Card 預設（**changed**：`--card-spacing` 由 16 改 20） |
| card-pad-sm | `p-4` | 16 | Card `size="sm"`、手機 SummaryTile |
| card-gap | `gap-4` | 16 | 卡片 header↔內容 |
| inner-pad | `p-3` | 12 | TaskRow、波次列、Banner |
| tool-gutter | `p-3 gap-3` | 12 | 工具頁 |
| stack-sm | `gap-2` | 8 | 膠囊群、列內元素 |
| stack-xs | `gap-1.5` | 6 | 圖示＋文字 |
| cell-x | `px-3` | 12 | 表格儲存格 |

尺寸：

| 名 | class | px |
|---|---|---|
| TopBar | `h-14`（`--topbar-h: 3.5rem`，**changed**） | 56 |
| control-sm／control／control-lg | `h-7`／`h-8`／`h-9` | 28／32／36 |
| pill／pill-sm | `h-6`／`h-5` | 24／20 |
| row／row-dense | `h-11`／`h-9` | 44／36 |
| list-item | `min-h-10` | 40 |
| pane-header | `h-10` | 40 |
| avatar／avatar-sm | `size-9`／`size-6` | 36／24 |
| icon-block | `size-10` | 40 |
| chart 高 | `h-(--chart-h-sm/md/lg)` **new** | 176／224／256 |
| chart 空狀態最小高 | `min-h-36` | 144 |

---

## 4. Radius

`--radius: 0.875rem`（14px，keep）。只准四種：

| class | px | 層 | 用在 |
|---|---|---|---|
| `rounded-full` | ∞ | 控制件 | StatusPill、Tag、Button、SegmentedControl、導覽、頭像、狀態點、進度條 |
| `rounded-xl` | 19.6 | 表層 | Card、Pane、SummaryTile、Banner、ActivityRail、Popover／HoverCard、Sheet |
| `rounded-lg` | 14 | 內層 | TaskRow、波次列、SidebarList 項、IdleProjectRow、ActivityItem、Field、Tooltip、圖示塊、Skeleton |
| `rounded-md` | 11.2 | 最小件 | code、kbd、縮圖終端框 |

規則：**內層比外層小一階**（xl 卡片裡放 lg 列，lg 列裡放 full 膠囊）。
禁用：`rounded`、`rounded-sm`、`rounded-2xl/3xl/4xl`、`rounded-[*]`、單邊圓角。替換見 `tokens.json` radius.replacements（Badge 4xl → full；Button `rounded-[min(..)]` → full；Tabs → SegmentedControl；圖例 `rounded-[3px]` → `rounded-full`；WaveRow `border` → `bg-muted`）。

---

## 5. Shadow／焦點／動態

| token | 用在 |
|---|---|
| `shadow-soft`（keep） | Card、Pane、TopBar、ActivityRail、SegmentedControl 選中項 |
| `shadow-pop`（keep） | SummaryTile、Popover／HoverCard／Tooltip、可點卡 hover |
| 無 | 卡片內的任何東西（TaskRow 拿掉 `shadow-soft`） |
| 焦點 | `focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`；漸層卡上 `focus-visible:ring-white/70` |
| 顏色轉場 | `transition-colors duration-150` |
| 上浮 | `transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop`（只給可點 SummaryTile） |
| reduced motion | `motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0` |

---

## 6. Layout

斷點用 Tailwind 預設（sm 640／md 768／lg 1024／xl 1280／2xl 1536），手機參考寬 390。

| token | 值 | Tailwind | 狀態 | 用途 |
|---|---|---|---|---|
| `--container-page` | 96rem（1536） | `max-w-page`（放 `@theme`，v4 的 `--container-*` 命名空間） | new | 四個內容頁＋TopBar 內容寬（取代 `max-w-7xl`／`max-w-screen-2xl` 混用） |
| `--topbar-h` | 3.5rem | `h-14`、`top-(--topbar-h)` | changed | ≥ lg 固定；< lg 兩列時由 ResizeObserver 覆寫（保留現有 hook） |
| `--rail-w` | 20rem | `grid-cols-[minmax(0,1fr)_var(--rail-w)]` | new | 總覽活動欄 |
| `--aside-w` | 22.5rem | 同上寫法 | new | 任務頁右欄（≥ xl） |
| `--sidebar-w` | 16rem；≥ xl 18rem | 同上 | new | 工具頁左欄 |
| `--detail-w` | 22rem；≥ xl 26rem | 同上 | new | git commit 詳情 |

骨架 class（README §3）：

- 內容頁：`mx-auto w-full max-w-page px-4 lg:px-6 py-6 flex flex-col gap-6`
- 工具頁：`flex flex-col gap-3 p-3 lg:h-[calc(100svh-var(--topbar-h))]`，窗格格線 `grid min-h-0 flex-1 gap-3`

格線（`tokens.json` layout.grids 有完整 class）：摘要 `grid-cols-2 lg:grid-cols-4`；總覽 `lg:[主欄 | rail]`；專案 `xl:grid-cols-2`；任務 `xl:[主欄 | aside]`；圖表 `lg:grid-cols-2`；趨勢花費 `lg:grid-cols-12`（8＋4）；herdr／git `lg:[sidebar | 主 (| detail)]`。

---

## 7. index.css 改動總表（給 frontend）

| 動作 | 內容 |
|---|---|
| 新增 `:root`／`.dark` | `--status-{danger,warn,ok,idle,info}{,-fg,-soft}`（15 個 × 2 套）、`--grad-ok-*`、`--grad-warn-*`、`--terminal-*`（5 個，兩套同值，可只放 `:root`）、`--rail-w`、`--aside-w`、`--sidebar-w`、`--detail-w`、`--chart-h-*` |
| 新增別名 | `--grad-danger-from/to: var(--grad-coral-from/to)`、`--grad-brand-from/to: var(--grad-violet-from/to)` |
| 新增 `@theme inline` | `--color-status-*`（15 個）；`--container-page: 96rem`；`--text-2xs: 0.6875rem`＋`--text-2xs--line-height: 1rem` |
| 改值 | `.dark --destructive` → `var(--status-danger-fg)`（`:root` 也寫成 var，值不變）；`--topbar-h` 預設 3.5rem |
| 改用法（元件） | `card.tsx` `--card-spacing` 4 → 5、CardTitle `font-bold`、`rounded-xl` 保留；`badge.tsx` → `rounded-full`；`button.tsx` 全尺寸 `rounded-full`、sm `text-sm` |
| 刪（最後一步） | 第二個 `@theme` 的 Tailwind 色階覆寫 |
