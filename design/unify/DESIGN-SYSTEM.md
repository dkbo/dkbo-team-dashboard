# dkbo 儀表板 Design System Spec：深靛可愛風（unify）

一份交給 artifacts 與前端工程師的規格。延續 10/03 cuteui 的深靛可愛主題（`apps/web/src/index.css`），套用到總覽 `/`、任務詳情 `/p/:project/t/:dir`、歷史 `/history`、趨勢 `/trends`、herdr `/herdr`、git `/git` 與頂部列。

- **機器可讀版**：`tokens.json`（與本檔同一套 token，值與名字必須一致；改一邊就改兩邊）。
- **設計原則、各頁重點、稿的索引**：`README.md`。**已定案的設計題**：`decisions.md`（Q1–Q13 的定案與理由；本檔已照定案寫成確定規格）。
- **稿與本檔衝突時以本檔為準。** 稿（`page-*.webp`）是 pen 畫的，中文字是系統黑體、少數字級是 13px 近似值；實作照本檔。
- 字型沿用 Nunito Variable＋Huninn（粉圓），不引入新套件；圖示只用 lucide-react。

狀態欄縮寫：**keep** 既有不變｜**changed** 既有名改值或改用法｜**new** 新增｜**alias** 新名指向既有｜**deprecated** 移轉後刪。

---

## How to use

### 規則

1. **只用本檔的 token。** 不寫 hex、裸 px、`text-[..]`、`rounded-[..]`、`h-[..px]`。需要新值先在第 1–4 章加 token（並同步 `tokens.json`），再在元件引用。
2. **一個 token 三種寫法**：token 名（本檔與 `tokens.json` 用）↔ CSS 變數（artifacts 用）↔ Tailwind class（`apps/web` 用）。第 1–4 章每張表都列出三者；第 6 章只寫 token 名。
3. **第 6 章的讀法**：`bg card`、`text muted-foreground` 是顏色 token；`body-strong` 是第 2 章的字級角色；`inset-pill`、`stack-sm` 是第 3 章的 spacing；`muted / alpha-60` 表示 `muted` 疊 `alpha-60` 透明度（Tailwind `bg-muted/60`）。
4. **亮暗同構**：亮暗只換顏色 token 值，不換版面。暗色在根節點加 `.dark` class（與 app 相同）。第 6 章「亮暗差異」欄寫的是 token 自動切換以外的額外規則。

### A. 給 artifacts：CSS variables

貼進 `<style>`。字型：Nunito 可從 Google Fonts 載入（`family=Nunito:wght@400..800`），Huninn 取不到時退回系統字，不影響版面。

```css
:root {
  /* 1. Color — base */
  --background: #eef0fb; --foreground: #1d2045;
  --card: #ffffff; --card-foreground: #1d2045;
  --popover: #ffffff; --popover-foreground: #1d2045;
  --primary: #5b8cff; --primary-foreground: #10163a;
  --secondary: #f1edff; --secondary-foreground: #3d2c8a;
  --muted: #f3f4fc; --muted-foreground: #565b82;
  --accent: #ece8ff; --accent-foreground: #3d2c8a;
  --border: #e2e5f5; --input: #d6daf0; --ring: #7b5cff;
  --soft-shadow: rgb(80 90 180 / 0.2);
  --on-color: #ffffff;
  /* 1. Color — brand */
  --brand-blue: #5b8cff; --brand-violet: #7b5cff; --brand-coral: #ff5a6e;
  /* 1. Color — status（solid / fg / soft） */
  --status-danger: #e0434f; --status-danger-fg: #c62a44; --status-danger-soft: #fbe5e6;
  --status-warn:   #b07800; --status-warn-fg:   #8a5300; --status-warn-soft:   #fcf2e0;
  --status-ok:     #1a9a74; --status-ok-fg:     #0f7a5a; --status-ok-soft:     #e1f5ef;
  --status-idle:   #7a7fa8; --status-idle-fg:   #565b82; --status-idle-soft:   #efeff5;
  --status-info:   #7b5cff; --status-info-fg:   #5b3fd9; --status-info-soft:   #ede8ff;
  --destructive: var(--status-danger-fg);
  /* 1. Color — SummaryTile 漸層（亮暗共用） */
  --grad-ok-from: #157f5f;     --grad-ok-to: #0e6b50;
  --grad-warn-from: #a05f00;   --grad-warn-to: #7a4400;
  --grad-coral-from: #d6344d;  --grad-coral-to: #a8243f;
  --grad-violet-from: #6a4cf0; --grad-violet-to: #4a2fc0;
  --grad-blue-from: #4169e1;   --grad-blue-to: #2c47b8;
  --grad-danger-from: var(--grad-coral-from);  --grad-danger-to: var(--grad-coral-to);
  --grad-brand-from: var(--grad-violet-from);  --grad-brand-to: var(--grad-violet-to);
  /* 1. Color — terminal（亮暗共用） */
  --terminal-bg: #0b0b10; --terminal-chrome: #17171f; --terminal-line: #26262f;
  --terminal-fg: #e4e4e7; --terminal-dim: #8b8b96;
  /* 1. Color — chart */
  --chart-1: #3d8fe0; --chart-2: #2cb68a; --chart-3: #e9a520; --chart-4: #7a6ad8; --chart-5: #f0804f;

  /* 2. Typography */
  --font-sans: 'Nunito Variable', 'Nunito', 'Huninn', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --type-display:   800 1.875rem/2.25rem var(--font-sans);
  --type-title-lg:  800 1.5rem/2rem var(--font-sans);
  --type-title-md:  800 1.125rem/1.75rem var(--font-sans);
  --type-title-sm:  700 1rem/1.5rem var(--font-sans);
  --type-wordmark:  800 1rem/1.5rem var(--font-sans);
  --type-body:      400 0.875rem/1.25rem var(--font-sans);
  --type-body-medium: 500 0.875rem/1.25rem var(--font-sans);
  --type-body-strong: 600 0.875rem/1.25rem var(--font-sans);
  --type-body-bold: 700 0.875rem/1.25rem var(--font-sans);
  --type-caption:   500 0.75rem/1rem var(--font-sans);
  --type-caption-strong: 600 0.75rem/1rem var(--font-sans);
  --type-caption-bold:   700 0.75rem/1rem var(--font-sans);
  --type-micro:     600 0.6875rem/1rem var(--font-sans);
  --type-mono-sm:   400 0.75rem/1rem var(--font-mono);
  --type-mono-2xs:  400 0.6875rem/1rem var(--font-mono);
  --leading-terminal: 1.2;

  /* 3. Spacing（刻度 = 0.25rem × n） */
  --spacing: 0.25rem;
  --page-x: 1rem; --page-y: 1.5rem; --section-gap: 1.5rem; --grid-gap: 1rem;
  --card-pad: 1.25rem; --card-pad-sm: 1rem; --card-gap: 1rem; --card-gap-sm: 0.75rem;
  --inner-pad: 0.75rem; --tool-gutter: 0.75rem; --cell-x: 0.75rem;
  /* 3. Radius */
  --radius: 0.875rem;
  --radius-md: calc(var(--radius) * 0.8); --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4); --radius-full: 9999px;
  /* 3. Border / ring */
  --border-w-hair: 1px; --border-w-pill: 1.5px; --border-w-strong: 2px; --ring-w-focus: 3px;
  /* 3. Elevation */
  --shadow-soft: 0 6px 20px -10px var(--soft-shadow), 0 1px 3px -1px var(--soft-shadow);
  --shadow-pop: 0 14px 30px -14px var(--soft-shadow), 0 2px 6px -2px var(--soft-shadow);
  /* 3. Size（只列非 Tailwind 刻度的） */
  --chart-h-sm: 11rem; --chart-h-md: 14rem; --chart-h-lg: 16rem;
  --step-line-h: 0.1875rem;
  --thumb-lines: 10;
  --thumb-h: calc(var(--thumb-lines) * var(--leading-terminal) * 1em + 0.5rem);

  /* 4. Layout */
  --container-page: 96rem;
  --topbar-h: 3.5rem;
  --rail-w: 20rem; --aside-w: 22.5rem; --sidebar-w: 16rem; --detail-w: 22rem;
  --tool-h: calc(100svh - var(--topbar-h));
  --rail-top: calc(var(--topbar-h) + 1.5rem);
  --rail-max-h: calc(100svh - var(--topbar-h) - 3rem);
  --pane-max-h-sm: 70svh;
}
@media (min-width: 64rem) { :root { --page-x: 1.5rem; } }
@media (min-width: 80rem) { :root { --sidebar-w: 18rem; --detail-w: 26rem; } }

.dark {
  --background: #1e2142; --foreground: #eceeff;
  --card: #282b55; --card-foreground: #eceeff;
  --popover: #2e3260; --popover-foreground: #eceeff;
  --primary: #5b8cff; --primary-foreground: #0f1433;
  --secondary: #353a6e; --secondary-foreground: #e3e6ff;
  --muted: #31356a; --muted-foreground: #aeb2dc;
  --accent: #3a3577; --accent-foreground: #e0d9ff;
  --border: rgb(170 180 255 / 10%); --input: rgb(170 180 255 / 16%); --ring: #7b5cff;
  --soft-shadow: rgb(8 10 30 / 0.55);
  --status-danger: #ff6b7f; --status-danger-fg: #ff8a9a; --status-danger-soft: #46345b;
  --status-warn:   #e9a520; --status-warn-fg:   #ffc76b; --status-warn-soft:   #433c4e;
  --status-ok:     #2cb68a; --status-ok-fg:     #5fdcae; --status-ok-soft:     #293e5c;
  --status-idle:   #7d82b0; --status-idle-fg:   #aeb2dc; --status-idle-soft:   #343762;
  --status-info:   #7b5cff; --status-info-fg:   #b9a8ff; --status-info-soft:   #34326d;
  --chart-1: #4290e2; --chart-2: #1a9e74; --chart-3: #c4880f; --chart-4: #8a7ce6; --chart-5: #dc6a3c;
}
```

用法例：`.card { background: var(--card); border-radius: var(--radius-xl); box-shadow: var(--shadow-soft); padding: var(--card-pad); font: var(--type-body); }`。

### B. 給 Tailwind v4（`apps/web/src/index.css`）

`:root`／`.dark` 的顏色值照上面 A 段（index.css 已有的 keep 不動，加 new 的）；以下加進 `@theme inline`，產生本檔用到的 class：

```css
@theme inline {
  /* status → bg-status-ok、text-status-danger-fg、bg-status-warn-soft、border-status-idle… */
  --color-status-danger: var(--status-danger); --color-status-danger-fg: var(--status-danger-fg); --color-status-danger-soft: var(--status-danger-soft);
  --color-status-warn:   var(--status-warn);   --color-status-warn-fg:   var(--status-warn-fg);   --color-status-warn-soft:   var(--status-warn-soft);
  --color-status-ok:     var(--status-ok);     --color-status-ok-fg:     var(--status-ok-fg);     --color-status-ok-soft:     var(--status-ok-soft);
  --color-status-idle:   var(--status-idle);   --color-status-idle-fg:   var(--status-idle-fg);   --color-status-idle-soft:   var(--status-idle-soft);
  --color-status-info:   var(--status-info);   --color-status-info-fg:   var(--status-info-fg);   --color-status-info-soft:   var(--status-info-soft);
  /* terminal → bg-terminal-bg、text-terminal-fg… */
  --color-terminal-bg: var(--terminal-bg); --color-terminal-chrome: var(--terminal-chrome);
  --color-terminal-line: var(--terminal-line); --color-terminal-fg: var(--terminal-fg); --color-terminal-dim: var(--terminal-dim);
  /* typography → text-2xs、leading-terminal */
  --text-2xs: 0.6875rem; --text-2xs--line-height: 1rem;
  --leading-terminal: 1.2;
  /* layout → max-w-page */
  --container-page: 96rem;
}
```

| token 類別 | Tailwind v4 對照 |
|---|---|
| 顏色 | `bg-<token>`／`text-<token>`／`border-<token>`／`ring-<token>`；透明度 `/<alpha>`（如 `bg-muted/60`） |
| 字級角色 | 第 2 章「class」欄的組合（如 `body-strong` = `text-sm font-semibold`） |
| spacing | Tailwind 刻度 `p-*`／`gap-*`（`--spacing: 0.25rem` 不改）；語意名見 §3.2 |
| radius | `rounded-md`／`rounded-lg`／`rounded-xl`／`rounded-full`（由 `--radius` 推得，index.css 已有） |
| border 寬 | `border`、`border-2`、`ring-2`、`ring-3`；1.5px 用 `border-(length:--border-w-pill)` |
| 尺寸／版面變數 | `h-(--chart-h-md)`、`max-h-(--rail-max-h)`、`grid-cols-[minmax(0,1fr)_var(--rail-w)]` |

### C. index.css 改動總表與落地順序（給 frontend）

| 動作 | 內容 |
|---|---|
| 新增 `:root`／`.dark` | `--status-{danger,warn,ok,idle,info}{,-fg,-soft}`（15 個 × 2 套）、`--grad-ok-*`、`--grad-warn-*`、`--terminal-*`（5 個，亮暗同值，可只放 `:root`）、`--on-color`、`--rail-w`、`--aside-w`、`--sidebar-w`、`--detail-w`（後兩個 ≥ xl 改值）、`--chart-h-*`、`--border-w-pill`、`--step-line-h`、`--thumb-lines`、`--thumb-h`、`--tool-h`、`--rail-top`、`--rail-max-h`、`--pane-max-h-sm` |
| 新增別名 | `--grad-danger-from/to: var(--grad-coral-from/to)`、`--grad-brand-from/to: var(--grad-violet-from/to)` |
| 新增 `@theme inline` | 上面 B 段 |
| 改值 | `--destructive` → `var(--status-danger-fg)`（亮值不變；暗由 `#ff6b7f` 變 `#ff8a9a`）；`--topbar-h` 預設 3.5rem |
| 改用法（shadcn 元件） | `card.tsx` `--card-spacing` 4 → 5、CardTitle `font-bold`；`badge.tsx` → `rounded-full`；`button.tsx` 全尺寸 `rounded-full`、sm `text-sm` |
| 刪（最後一步） | 第二個 `@theme` 的 emerald／red／amber／sky／orange／yellow／violet 色階覆寫 |

落地順序：
1. index.css 加 token，**不刪舊名**；舊 Tailwind 色階覆寫保留到所有元件換完。
2. 共用元件（放 `apps/web/src/components/app/`）：PageHeader、Banner、EmptyState、SegmentedControl、SummaryTile、Tag、SidebarList；StatusPill 改吃狀態 token。shadcn 原子元件（`components/ui/`）只改 token 層面（radius、字重）。
3. 逐頁換骨架：趨勢、歷史、任務（內容頁）→ git、herdr（工具頁）→ 總覽（改最多，最後做）。
4. 刪各頁自寫錯誤條、`text-[..]`、`rounded-[..]`；`grep -rn "text-\[\|rounded-\[\|red-\|amber-\|emerald-" apps/web/src` 應只剩 chart 色盤與終端。

---

## 1. Color Tokens

對比以 WCAG 2.x 相對亮度計算；frontend 落地後用 axe 再驗一次。

### 1.1 基礎層（keep）

| token | CSS 變數 | Tailwind | 亮 | 暗 | 用途 |
|---|---|---|---|---|---|
| `background` | `--background` | `bg-background` | `#eef0fb` | `#1e2142` | 頁底（另有兩團品牌色 radial 光暈，見 index.css body） |
| `foreground` | `--foreground` | `text-foreground` | `#1d2045` | `#eceeff` | 正文（亮對 card 13.75:1） |
| `card` | `--card` | `bg-card` | `#ffffff` | `#282b55` | **表層**：卡片、窗格、ActivityRail |
| `card-foreground` | `--card-foreground` | `text-card-foreground` | `#1d2045` | `#eceeff` | 卡片內正文 |
| `muted` | `--muted` | `bg-muted` | `#f3f4fc` | `#31356a` | **內層**：卡片裡的列、SegmentedControl 軌、hover 底 |
| `muted-foreground` | `--muted-foreground` | `text-muted-foreground` | `#565b82` | `#aeb2dc` | 次要文字（亮對 card 6.53、暗 6.51） |
| `popover` | `--popover` | `bg-popover` | `#ffffff` | `#2e3260` | **浮層**：Popover、HoverCard、Tooltip |
| `popover-foreground` | `--popover-foreground` | `text-popover-foreground` | `#1d2045` | `#eceeff` | 浮層正文 |
| `accent` | `--accent` | `bg-accent` | `#ece8ff` | `#3a3577` | 選中項（SidebarList）、PageHeader 圖示塊、EmptyState 圖示圓、Tag brand |
| `accent-foreground` | `--accent-foreground` | `text-accent-foreground` | `#3d2c8a` | `#e0d9ff` | accent 上的字 |
| `secondary` | `--secondary` | `bg-secondary` | `#f1edff` | `#353a6e` | Button secondary；暗色 SegmentedControl 選中項 |
| `secondary-foreground` | `--secondary-foreground` | `text-secondary-foreground` | `#3d2c8a` | `#e3e6ff` | secondary 上的字 |
| `primary` | `--primary` | `bg-primary` | `#5b8cff` | `#5b8cff` | 導覽選中、主要按鈕、進度條、連結 hover |
| `primary-foreground` | `--primary-foreground` | `text-primary-foreground` | `#10163a` | `#0f1433` | primary 上的字（5.54:1） |
| `border` | `--border` | `border-border` | `#e2e5f5` | `rgb(170 180 255 / 10%)` | 分隔線、表格列線（規則見 §3.6） |
| `input` | `--input` | `border-input` | `#d6daf0` | `rgb(170 180 255 / 16%)` | Field 框、未完成步驟點 |
| `ring` | `--ring` | `ring-ring` | `#7b5cff` | `#7b5cff` | 焦點環（一律疊 `alpha-50`） |
| `destructive` | `--destructive` | `text-destructive` | → `status-danger-fg` | → `status-danger-fg` | **alias**：shadcn 相容名，新碼用 `status-danger-*` |
| `soft-shadow` | `--soft-shadow` | （shadow 內部用） | `rgb(80 90 180 / 0.2)` | `rgb(8 10 30 / 0.55)` | 陰影色 |
| `on-color` | `--on-color` | `text-white`／`bg-white`／`ring-white` | `#ffffff` | `#ffffff` | **new**：漸層與終端上的前景（白字、白色疊色） |

層次：**background → card（表層）→ muted（內層）**，三層就夠；浮層用 popover。分層手段見 §3.6。

### 1.2 品牌色（keep）

| token | CSS 變數 | Tailwind | 值（亮暗同） | 只用在 |
|---|---|---|---|---|
| `brand-blue` | `--brand-blue` | `*-brand-blue` | `#5b8cff` | 導覽選中（= primary）、UsageChip 正常框、Logo、裝飾 |
| `brand-violet` | `--brand-violet` | `*-brand-violet` | `#7b5cff` | 焦點環、info 實心、CardTitle 前置圖示、ActivityRail 標題圖示 |
| `brand-coral` | `--brand-coral` | `*-brand-coral` | `#ff5a6e` | Logo／插圖裝飾。**不當狀態色**（狀態紅用 `status-danger`） |

品牌三色只用在導覽選中、焦點環、圖表、裝飾與「非狀態」的數字（花費）。

### 1.3 狀態色（new）

每個語意 3 個 token（＋SummaryTile 漸層，§1.5）：

| 後綴 | 用途 |
|---|---|
| `status-X` | 實心：狀態點、框線、進度、圖示 |
| `status-X-fg` | 文字（在 card／background／muted／soft 上都 ≥ 4.5:1） |
| `status-X-soft` | 淡底：Banner 底、警示列底、Tag 底 |

| token | Tailwind | 亮 | 暗 | 對比（文字對 card／bg／soft；實心對 card） |
|---|---|---|---|---|
| `status-danger` | `bg-/border-status-danger` | `#e0434f` | `#ff6b7f` | 實心 亮 4.13（bg 3.64）／暗 4.89 |
| `status-danger-fg` | `text-status-danger-fg` | `#c62a44` | `#ff8a9a` | 亮 5.50／4.85／4.57；暗 5.97／6.92／4.92 |
| `status-danger-soft` | `bg-status-danger-soft` | `#fbe5e6` | `#46345b` | — |
| `status-warn` | `bg-/border-status-warn` | `#b07800` | `#e9a520` | 實心 亮 3.80（bg 3.34）／暗 6.30 |
| `status-warn-fg` | `text-status-warn-fg` | `#8a5300` | `#ffc76b` | 亮 6.33／5.57／5.70；暗 8.70／10.09／6.83 |
| `status-warn-soft` | `bg-status-warn-soft` | `#fcf2e0` | `#433c4e` | — |
| `status-ok` | `bg-/border-status-ok` | `#1a9a74` | `#2cb68a` | 實心 亮 3.55（bg 3.12）／暗 5.21 |
| `status-ok-fg` | `text-status-ok-fg` | `#0f7a5a` | `#5fdcae` | 亮 5.31／4.68／4.68；暗 7.87／9.13／6.37 |
| `status-ok-soft` | `bg-status-ok-soft` | `#e1f5ef` | `#293e5c` | — |
| `status-idle` | `bg-/border-status-idle` | `#7a7fa8` | `#7d82b0` | 實心 亮 3.87（bg 3.41）／暗 3.63 |
| `status-idle-fg` | `text-status-idle-fg` | `#565b82` | `#aeb2dc` | ＝ muted-foreground（6.53／6.51） |
| `status-idle-soft` | `bg-status-idle-soft` | `#efeff5` | `#343762` | — |
| `status-info` | `bg-/border-status-info` | `#7b5cff` | `#7b5cff` | 實心 亮 4.36／暗 3.07 |
| `status-info-fg` | `text-status-info-fg` | `#5b3fd9` | `#b9a8ff` | 亮 6.65；暗 6.45 |
| `status-info-soft` | `bg-status-info-soft` | `#ede8ff` | `#34326d` | — |

`soft` 是「實心 14% 疊在 card 上」寫死成 hex（在 background 上用也 OK，差 < 2%）；動態寫法 `color-mix(in oklab, var(--status-X) 14%, var(--card))` 值相同。

### 1.4 狀態色使用規則

**四個語意（＋一個資訊色）：**

| 語意 | token 前綴 | 意思 | 一句話判準 |
|---|---|---|---|
| **danger 紅** | `status-danger` | 需要人**立刻**處理 | 不處理，事情就停在那裡 |
| **warn 琥珀** | `status-warn` | **降級／熔斷**／過時／部分失敗／ESCALATE（交給領導處理），系統還在跑 | 會自己好，或可以晚點處理 |
| **ok 綠** | `status-ok` | **運作中**、剛成功 | 正在動、或這一步過了 |
| **idle 灰** | `status-idle` | 閒置、已結束、未知 | 沒有在動，也不需要你 |
| info 紫 | `status-info` | 中性事件（spawn、review、wave-open…）、規劃中 | 只是告知 |

**對照表（現況 → 新規則）：**

| 東西 | 現況 | 新 |
|---|---|---|
| agent `blocked`（卡住） | 紅 | **danger** |
| 訊息 BUG、BLOCKED、STOP；測試失敗；git 衝突；頁面載入失敗（無資料可顯示） | 紅 | **danger** |
| kind 熔斷（agy／codex 熔斷 N 天） | **紅** | **warn**（長期、已自動降級） |
| 訊息 ESCALATE（交給領導處理，不是要人立刻動手）、LIMIT、TIMEOUT、UNDELIVERED、額度 ≥ 80%（不變紅）、資料過時（stale）、「更新失敗，顯示舊資料」、無法解析的行、herdr polling、git 有未提交改動、detached HEAD | 紅／橘／琥珀混用 | **warn** |
| agent `working`、任務 running、SSE／herdr 連線正常、DONE、FIXED、wave-close、gate3、task-close、測試通過、git 乾淨 | 綠 | **ok** |
| agent `idle`、未知、無 pane、任務 done／abandoned（已結案） | 灰／綠混用 | **idle**（done 加 ✓ 圖示、abandoned 加刪除線） |
| 任務 planning、event spawn／review／wave-open／ruling／gate1、DECISION | 藍／紫 | **info** |
| 專案卡「有警示」的外框 | 橘 ring | 依最高嚴重度：有 blocked → `ring-alert-danger`；只有 escalation／undelivered → `ring-alert-warn`（§3.7） |

ESCALATE 一律 warn：訊息、計數 Tag、活動 type、專案卡外框都一樣；danger 只留給 blocked、BUG、STOP、測試失敗、git 衝突、頁面載入失敗這類要人立刻處理的事。

**SummaryTile 四張（順序固定），依狀態變色、0 值收斂：**

| 卡 | 條件 | variant |
|---|---|---|
| 進行中任務 | > 0 | `ok`（綠漸層） |
|  | = 0 | `quiet`（卡片底、灰字「目前沒有任務在跑」） |
| 今日花費 | 有資料 | `brand`（紫漸層，花費不是狀態） |
|  | 無資料 | `quiet`（值 `—`） |
| 卡住的 agent | > 0 | `danger`（珊瑚漸層），名字最多 3 個 |
|  | = 0 | `quiet`，副行用 `status-ok-fg`「大家都很順 ✨」 |
| 熔斷與額度 | 有 kind 熔斷或任一額度 ≥ 80% | `warn`（琥珀漸層），列 kind 與剩餘時間 |
|  | 都正常 | `quiet`，副行「額度都健康 · 最高 claude 5h 37%」（最高用量的 kind、窗口、百分比） |

規則：**漸層卡＝要看一眼的事；quiet 卡＝沒事。** 一列同時出現兩張紅／琥珀漸層卡是正常的。

**計數與 0：**
- `ESCALATE 0`、`UNDELIVERED 0` 這類計數 **0 時不顯示**；> 0 顯示成 Tag 的 `warn`／`danger`（ESCALATE → warn、UNDELIVERED → warn、BLOCKED → danger）。
- 表格裡的 0 用 `muted-foreground`，非 0 才用 `foreground`；金額 0 顯示 `—`。

### 1.5 SummaryTile 漸層（亮暗共用）

| token | CSS 變數 | 值 from → to | 白字對 from | 用在 | 狀態 |
|---|---|---|---|---|---|
| `grad-ok` | `--grad-ok-from／-to` | `#157f5f → #0e6b50` | 4.96 | variant ok | new |
| `grad-warn` | `--grad-warn-from／-to` | `#a05f00 → #7a4400` | 5.08 | variant warn | new |
| `grad-coral`（別名 `grad-danger`） | `--grad-coral-*`（`--grad-danger-*`） | `#d6344d → #a8243f` | 4.71 | variant danger | keep＋alias |
| `grad-violet`（別名 `grad-brand`） | `--grad-violet-*`（`--grad-brand-*`） | `#6a4cf0 → #4a2fc0` | 5.38 | variant brand | keep＋alias |
| `grad-blue` | `--grad-blue-*` | `#4169e1 → #2c47b8` | 4.85 | 新規則不用，保留 | keep |

Tailwind：`bg-linear-to-br from-(--grad-X-from) to-(--grad-X-to)`。裝飾圖示疊 `alpha-12` 後最暗疊色處白字仍 ≥ 4.5。

### 1.6 終端（new，亮暗相同）

| token | CSS 變數 | Tailwind | 值 | 取代 |
|---|---|---|---|---|
| `terminal-bg` | `--terminal-bg` | `bg-terminal-bg` | `#0b0b10` | `bg-zinc-950` |
| `terminal-chrome` | `--terminal-chrome` | `bg-terminal-chrome` | `#17171f` | pane 標題列 `bg-zinc-900` |
| `terminal-line` | `--terminal-line` | `border-terminal-line` | `#26262f` | `border-zinc-800` |
| `terminal-fg` | `--terminal-fg` | `text-terminal-fg` | `#e4e4e7` | `text-zinc-200`（15.47:1） |
| `terminal-dim` | `--terminal-dim` | `text-terminal-dim` | `#8b8b96` | `text-zinc-500`（對 bg 5.83、對 chrome 5.29） |

ANSI 色由 AnsiText 決定，不動。終端區兩套主題都固定黑底。

### 1.7 圖表（keep）

| token | 亮 | 暗 |
|---|---|---|
| `chart-1` | `#3d8fe0` | `#4290e2` |
| `chart-2` | `#2cb68a` | `#1a9e74` |
| `chart-3` | `#e9a520` | `#c4880f` |
| `chart-4` | `#7a6ad8` | `#8a7ce6` |
| `chart-5` | `#f0804f` | `#dc6a3c` |

類別色盤維持 `features/trends/palette.ts` 的 8 色 SERIES_COLORS（已過 dataviz validator）。格線 `border`、軸字 `muted-foreground`、tooltip 走 Tooltip 元件樣式（§6.25）。

### 1.8 透明度（alpha，new）

顏色疊透明度只准用這幾階（Tailwind `/N`，artifacts `color-mix(in oklab, var(--X) N%, transparent)`；`opacity-N` 同一套）：

| token | 值 | 用在 |
|---|---|---|
| `alpha-5` | 5% | 終端內 StatusPill 底（`on-color`） |
| `alpha-12` | 12% | SummaryTile 漸層卡裝飾圖示（opacity） |
| `alpha-15` | 15% | quiet SummaryTile 裝飾圖示；漸層卡上的按鈕底（`on-color`） |
| `alpha-25` | 25% | 漸層卡上按鈕 hover 底 |
| `alpha-30` | 30% | Logo 填色（`brand-violet`）；暗色 Field 底（`input`） |
| `alpha-40` | 40% | quiet SummaryTile hover 底（`muted`） |
| `alpha-50` | 50% | 焦點環（`ring`）；CardFooter 底（`muted`）；disabled（opacity） |
| `alpha-60` | 60% | 表格列 hover（`muted`）、表格選中列（`accent`）、Banner 按鈕框（`status-X`） |
| `alpha-70` | 70% | 漸層卡焦點環（`on-color`）；UsageChip 正常框（`brand-blue`）；SegmentedControl count（opacity） |
| `alpha-75` | 75% | StatusPill note（opacity） |
| `alpha-80` | 80% | TopBar 底（`background`）；Banner 細節字（`foreground`）；選中項第二行（`accent-foreground`）；未開始的波（opacity） |

### 1.9 deprecated

- index.css 第二個 `@theme` 的 emerald／red／amber／sky／orange／yellow／violet 覆寫：元件換成 `status-*` 後刪除；在那之前保留，避免沒換到的元件掉色。
- 元件內 `text-red-*`、`text-amber-*`、`text-emerald-*`、`bg-orange-500/15`、`ring-orange-*`、`bg-zinc-*`：全部改 status／terminal token。

---

## 2. Typography（字型、字級、字重與用途）

### 2.1 字族

| token | CSS 變數 | Tailwind | 值 | 用途 |
|---|---|---|---|---|
| `font-sans` | `--font-sans` | `font-sans` | `'Nunito Variable', 'Huninn', sans-serif` | 全站（keep） |
| `font-heading` | `--font-heading` | `font-heading` | `var(--font-sans)` | shadcn 相容（keep） |
| `font-mono` | `--font-mono` | `font-mono` | Tailwind 預設 ui-monospace 堆疊 | 只給 hash、dir、分支、時間戳、終端 |

### 2.2 字級角色

一個角色 = 字級＋行高＋字重。元件只引用角色名；`+num`（`tabular-nums`）、`+mono`（`font-mono`，字重照角色）、`+tight`（`tracking-tight`）是允許的修飾。

| 角色 | Tailwind class | px／行高 | 字重 | 用途 |
|---|---|---|---|---|
| `display` | `text-3xl font-extrabold` | 30／36 | 800 | SummaryTile 數值（≥ sm，加 `+num`） |
| `title-lg` | `text-2xl font-extrabold` | 24／32 | 800 | 內容頁 PageHeader 標題（h1，加 `+tight`）；SummaryTile 數值（< sm） |
| `title-md` | `text-lg font-extrabold` | 18／28 | 800 | 工具頁 PageHeader 標題（h1）；區段標題（h2，如「閒置專案」） |
| `title-sm` | `text-base font-bold` | 16／24 | 700 | CardTitle、ActivityRail 標題、EmptyState page 標題 |
| `wordmark` | `text-base font-extrabold` | 16／24 | 800 | TopBar Logo 字 |
| `body` | `text-sm` | 14／20 | 400 | 正文、表格儲存格、清單、副標 |
| `body-medium` | `text-sm font-medium` | 14／20 | 500 | SummaryTile 副行、PaneHeader 次要資訊 |
| `body-strong` | `text-sm font-semibold` | 14／20 | 600 | 列主名稱、按鈕、導覽、SegmentedControl 項 |
| `body-bold` | `text-sm font-bold` | 14／20 | 700 | SummaryTile 標籤、Banner 標題、PaneHeader 標題、關鍵數字、波號 |
| `caption` | `text-xs font-medium` | 12／16 | 500 | meta、時間、副行、軸字、圖例 |
| `caption-strong` | `text-xs font-semibold` | 12／16 | 600 | StatusPill、Field label、Button xs、「再看 N 則」、進度標籤 |
| `caption-bold` | `text-xs font-bold` | 12／16 | 700 | 表頭、SidebarList 段標題、ActivityGroup 任務名 |
| `micro` | `text-2xs font-semibold` | 11／16 | 600 | Tag、StatusPill sm、終端標題列；**全站最小字級**（new：`--text-2xs`） |
| `mono-sm` | `font-mono text-xs` | 12／16 | 400 | hash、dir、時間戳、錯誤原文 |
| `mono-2xs` | `font-mono text-2xs` | 11／16 | 400 | Tag mono 變體 |
| `mono-terminal` | `font-mono text-2xs leading-terminal` | 11／1.2 | 400 | 縮圖終端內容（new：`--leading-terminal`） |
| `emoji-lg` | `text-3xl` | 30 | — | EmptyState page 的 emoji |
| `emoji-md` | `text-xl` | 20 | — | EmptyState inline 的 emoji |
| `emoji-sm` | `text-sm` | 14 | — | ActivityItem 頭像 emoji |

規則：
- 數字一律 `+num`（Nunito 有等寬數字），表格數字欄不必 `+mono`。
- 標題一律 bold／extrabold，不用 `font-medium` 當標題（`CardTitle font-medium` → `title-sm`）。
- 圖表軸字（recharts `fontSize`）＝ `caption` 的字級。

### 2.3 禁用與替換

| 現況 | 位置 | 換成 |
|---|---|---|
| `text-[9px]` | PaneThumbs 終端 | `mono-terminal` |
| `text-[11px]` | GitPage 唯讀說明；CostTables 檔位 | PageHeader 副標（`body`）；Tag（`micro`） |
| `text-[0.65rem]` | PaneThumbs StatusPill | StatusPill `sm`（`micro`） |
| `text-[0.7rem]` ×6 | ActivityRail type、Count、herdr 標題列、ProjectCard | `micro`／Tag |
| `text-[0.8rem]` | Button sm | `body-strong` |
| `CardTitle font-medium` | card.tsx | `title-sm` |

---

## 3. Spacing、圓角、Border

### 3.1 Spacing 刻度

刻度 = `--spacing`（0.25rem）× n，沿用 Tailwind，不新增。**只准用這些 n**：

| token | n | px | Tailwind |
|---|---|---|---|
| `space-0.5` | 0.5 | 2 | `*-0.5` |
| `space-1` | 1 | 4 | `*-1` |
| `space-1.5` | 1.5 | 6 | `*-1.5` |
| `space-2` | 2 | 8 | `*-2` |
| `space-2.5` | 2.5 | 10 | `*-2.5` |
| `space-3` | 3 | 12 | `*-3` |
| `space-3.5` | 3.5 | 14 | `*-3.5` |
| `space-4` | 4 | 16 | `*-4` |
| `space-5` | 5 | 20 | `*-5` |
| `space-6` | 6 | 24 | `*-6` |
| `space-9` | 9 | 36 | `*-9` |
| `space-12` | 12 | 48 | `*-12` |

### 3.2 語意 spacing

元件優先用語意名；沒有語意名的才直接用 `space-n`。

| token | 值 | Tailwind | 用在 |
|---|---|---|---|
| `page-x` | space-4／≥ lg space-6 | `px-4 lg:px-6` | 內容頁左右外邊距 |
| `page-y` | space-6 | `py-6` | 內容頁上下 |
| `section-gap` | space-6 | `gap-6` | 頁首↔區塊、區塊↔區塊、主欄↔側欄 |
| `grid-gap` | space-4 | `gap-4` | 卡片格、摘要列（＝ 12 欄 gutter） |
| `card-pad` | space-5 | `p-5` | Card 預設（**changed**：`--card-spacing` 16 → 20） |
| `card-pad-sm` | space-4 | `p-4` | Card `sm`、手機 SummaryTile、進行中的波、Popover |
| `card-gap` | space-4 | `gap-4` | 卡片 header↔內容 |
| `card-gap-sm` | space-3 | `gap-3` | Card `sm` |
| `inner-pad` | space-3 | `p-3` | 內層列：TaskRow、Banner、手機表格卡 |
| `tool-gutter` | space-3 | `p-3 gap-3` | 工具頁外框與窗格間 |
| `cell-x` | space-3 | `px-3` | 表格儲存格 |
| `stack-3xs` | space-0.5 | `gap-0.5` | SegmentedControl 項之間、SidebarList 項之間 |
| `stack-2xs` | space-1 | `gap-1` | SummaryTile 內、StatusPill sm、時間線組身 |
| `stack-xs` | space-1.5 | `gap-1.5` | 圖示＋文字、StatusPill |
| `stack-sm` | space-2 | `gap-2` | 列內元素、膠囊群、工具列 |
| `stack-md` | space-2.5 | `gap-2.5` | SidebarList 項內、ActivityItem 內、TaskRow 內 |
| `stack-lg` | space-3 | `gap-3` | Banner、IdleProjectRow、ActivityGroup 之間、縮圖格 |
| `inset-pill-sm` | space-2 | `px-2` | StatusPill sm、Tag |
| `inset-pill` | space-2.5 | `px-2.5` | StatusPill、UsageChip、ConnectionChip、Button xs |
| `inset-control-sm` | space-3 | `px-3` | Button sm、Field、SidebarList 項、SegmentedControl sm 項、Tooltip、IdleProjectRow |
| `inset-control` | space-3.5 | `px-3.5` | NavLink、SegmentedControl 項 |
| `inset-control-md` | space-4 | `px-4` | Button default、PaneHeader、波次列 |
| `inset-control-lg` | space-5 | `px-5` | Button lg、Card 內滿寬表格的首末欄 |
| `inset-y-xs` | space-1.5 | `py-1.5` | ActivityGroup 組頭、ActivityItem compact |
| `inset-y-sm` | space-2 | `py-2` | SidebarList 項、ActivityItem、Banner sm、Tooltip |
| `inset-y-md` | space-3 | `py-3` | CardFooter、表格多行列 |
| `inset-track` | space-1 | `p-1` | SegmentedControl 軌 |
| `inset-track-sm` | space-0.5 | `p-0.5` | SegmentedControl sm 軌 |
| `inset-list` | space-2 | `p-2` | SidebarList 容器 |
| `empty-pad` | space-12 | `py-12` | EmptyState page |
| `empty-pad-inline` | space-6 | `py-6` | EmptyState inline |
| `indent-row` | space-9 | `pl-9` | IdleProjectRow 展開內容縮排（對齊箭頭後的文字） |
| `timeline-indent` | space-4 | `ml-4` | ActivityGroup 組身左移 |
| `timeline-pad` | space-3 | `pl-3` | ActivityGroup 組身時間線到內容 |

### 3.3 尺寸

| token | Tailwind | px | 用在 |
|---|---|---|---|
| `control-lg` | `h-9` | 36 | SegmentedControl 軌、Button lg |
| `control` | `h-8`／`size-8` | 32 | Button default、Field、NavLink、icon button、SegmentedControl sm 軌 |
| `control-sm` | `h-7`／`size-7` | 28 | Button sm、SegmentedControl 項、icon button sm、dismiss |
| `pill` | `h-6` | 24 | StatusPill、UsageChip、ConnectionChip、Button xs、縮圖標題列 |
| `pill-sm` | `h-5` | 20 | StatusPill sm、Tag |
| `bar` | `h-10` | 40 | PaneHeader、PageHeader compact、表頭列、SidebarList 項最小高（`min-h-10`） |
| `row` | `h-11` | 44 | 表格列、IdleProjectRow、已關閉的波 |
| `row-dense` | `h-9` | 36 | Table dense 列與表頭、commit 列、金額清單 |
| `icon-2xs` | `size-3` | 12 | Tag 內圖示 |
| `icon-xs` | `size-3.5` | 14 | Breadcrumb 分隔、SidebarList 尾端圖示、波次步驟點 |
| `icon-sm` | `size-4` | 16 | 預設行內圖示、按鈕內圖示、CardTitle 前置、Banner sm |
| `icon-md` | `size-5` | 20 | PageHeader 圖示、Banner、EmptyState inline lucide |
| `icon-lg` | `size-6` | 24 | Logo |
| `icon-xl` | `size-7` | 28 | EmptyState page lucide |
| `dot-sm` | `size-1.5` | 6 | StatusPill 點、ActivityItem compact 點 |
| `dot` | `size-2` | 8 | SidebarList 狀態點、ConnectionChip、IdleProjectRow session 點 |
| `swatch` | `size-2.5` | 10 | 圖例色塊 |
| `avatar` | `size-6` | 24 | ActivityItem 頭像 |
| `avatar-lg` | `size-9` | 36 | 保留（目前無元件使用） |
| `icon-block` | `size-10` | 40 | PageHeader 圖示塊、EmptyState inline 圖示圓 |
| `empty-icon` | `size-16` | 64 | EmptyState page 圖示圓 |
| `tile-h` | `min-h-32` | 128 | SummaryTile 最小高、其 Skeleton |
| `tile-h-sm` | `min-h-28` | 112 | SummaryTile（< sm） |
| `tile-deco` | `size-28` | 112 | SummaryTile 裝飾圖示；位移 `-right-5 -bottom-6`（space-5／space-6）、旋轉 `-rotate-12` |
| `tile-deco-sm` | `size-18` | 72 | SummaryTile 裝飾圖示（< sm） |
| `progress-h` | `h-1.5` | 6 | TaskRow 進度條 |
| `step-line-h` | `h-(--step-line-h)` | 3 | 波次步驟連線（new） |
| `chart-h-sm`／`-md`／`-lg` | `h-(--chart-h-sm/md/lg)` | 176／224／256 | 圖區（new）；卡片 Skeleton 用 `chart-h-md` |
| `chart-empty-min` | `min-h-36` | 144 | ChartCard empty 整卡最小高 |
| `chart-bar-row`／`chart-bar-pad`／`chart-bar-max` | recharts 參數 | 28／64／15 列 | 水平長條圖高 = `max(chart-h-sm, 列數 × chart-bar-row + chart-bar-pad)`，最多 15 列 |
| `chart-bar-radius` | recharts `radius` | 4 | 長條末端圓角（recharts px，維持現值） |
| `slot-index` | `w-4` | 16 | SidebarList 編號欄 |
| `skeleton-label` | `h-4 w-24` | 16 × 96 | 標題型 Skeleton（ActivityGroup 組頭） |
| `measure-hint` | `max-w-sm` | 384 | EmptyState 提示文字最大寬 |
| `thumb-h` | `h-(--thumb-h)` | `thumb-lines`(10) × 1.2em ＋ space-2 | 縮圖終端內容高（new） |

### 3.4 圓角

`--radius: 0.875rem`（14px，keep）。**只准四種**，規則：**內層比外層小一階**（xl 卡片裡放 lg 列，lg 列裡放 full 膠囊）。

| token | Tailwind | px | 層 | 用在 |
|---|---|---|---|---|
| `radius-full` | `rounded-full` | ∞ | 控制件 | StatusPill、Tag、Button、SegmentedControl、NavLink、頭像、點、進度條、icon button |
| `radius-xl` | `rounded-xl` | 19.6 | 表層 | Card、Pane、SummaryTile、Banner、ActivityRail、Popover／HoverCard、Sheet |
| `radius-lg` | `rounded-lg` | 14 | 內層 | TaskRow、波次列、SidebarList 項、IdleProjectRow、ActivityItem、Field、Tooltip、圖示塊、Skeleton、Banner sm |
| `radius-md` | `rounded-md` | 11.2 | 最小件 | code、kbd、縮圖終端框 |

禁用：`rounded`、`rounded-sm`、`rounded-2xl/3xl/4xl`、`rounded-[*]`、單邊圓角（改由父層 `overflow-hidden` 裁）。替換：Badge `rounded-4xl` → Tag `rounded-full`；Button `rounded-lg`／`rounded-[min(..)]` → `rounded-full`；Tabs → SegmentedControl；圖例 `rounded-[2px]/[3px]` → `swatch` `rounded-full`；Count `rounded` → Tag；git ProjectTab `rounded-md` → SidebarList 項 `rounded-lg`；WaveRow `rounded-lg border` → `rounded-lg bg-muted`（無框）。

### 3.5 Border 寬度

| token | CSS 變數 | Tailwind | px | 何時用 |
|---|---|---|---|---|
| `border-w-hair` | `--border-w-hair` | `border`、`border-t`、`border-b` | 1 | **分隔**：同一表層內的列線、PaneHeader 底線、CardFooter 頂線、SidebarList 段間線、Field 框、終端內格線（`terminal-line`） |
| `border-w-pill` | `--border-w-pill` | `border-(length:--border-w-pill)` | 1.5 | **狀態外框**：StatusPill、UsageChip（有框無底的膠囊） |
| `border-w-strong` | `--border-w-strong` | `border-2`、`border-l-2`、`border-b-2`、`ring-2` | 2 | **強調**：警示外框 ring、ActivityGroup 時間線、暗色表頭下線、未完成步驟點的空心框 |
| `ring-w-focus` | `--ring-w-focus` | `ring-3` | 3 | **焦點環**；進行中步驟點的外圈 |

不准：1.5 以外的小數寬、`border-4`、`border-l-4` 這類左側粗色條（圓角卡＋粗左線不搭，改用圖示或底色）。

### 3.6 分隔規則：底色 vs 陰影 vs 框線

先用底色，再用陰影，最後才用框線。

| 要分開的兩者 | 手段 | token |
|---|---|---|
| 頁底 ↔ 表層（Card、Pane、SummaryTile quiet、ActivityRail、TopBar） | **陰影**，不加框 | `shadow-soft` |
| 頁底／表層 ↔ 浮層（Popover、HoverCard、Tooltip）、要被注意的卡（漸層 SummaryTile、可點卡 hover） | **較強陰影** | `shadow-pop` |
| 表層 ↔ 內層（卡片裡的 TaskRow、波次列、SegmentedControl 軌） | **底色**，不加陰影不加框 | `bg muted`（在 muted 上的再內層用 `bg card`，如進度條軌） |
| 表層內同層的連續項（表格列、PaneHeader ↔ 內容、CardFooter、SidebarList 段） | **1px 框線** | `border-w-hair` ＋ `border` |
| 狀態（膠囊在講現在的狀態） | **狀態色框線** | `border-w-pill` ＋ `status-X` |
| 輸入框 | **框線** | `border-w-hair` ＋ `input` |
| 終端區 | 底色 | `terminal-bg`；內部分隔 `terminal-line` |

| token | CSS 變數 | Tailwind | 值 |
|---|---|---|---|
| `shadow-soft` | `--shadow-soft` | `shadow-soft` | `0 6px 20px -10px var(--soft-shadow), 0 1px 3px -1px var(--soft-shadow)` |
| `shadow-pop` | `--shadow-pop` | `shadow-pop` | `0 14px 30px -14px var(--soft-shadow), 0 2px 6px -2px var(--soft-shadow)` |

禁止：卡片加 border（除了表格列線這類內部分隔）；卡片內的東西加陰影（TaskRow 拿掉 `shadow-soft`）；同一個東西兩層都框（ProjectCard 已有 ring 時 TaskRow 不再加）。暗色 `border`（10% 白）偏淡：表頭下線改用 `border-w-strong`。

### 3.7 Ring（狀態框）

| token | Tailwind | 用在 |
|---|---|---|
| `focus-ring` | `outline-none focus-visible:ring-3 focus-visible:ring-ring/50` | 所有可互動元素的 focus-visible |
| `focus-ring-inset` | `focus-visible:ring-inset` ＋ `focus-ring` | 清單項、表格內連結、SegmentedControl 項以外的窗格內項目（避免被父層 `overflow` 裁掉） |
| `focus-ring-on-color` | `focus-visible:ring-3 focus-visible:ring-white/70` | 漸層 SummaryTile 與其上的按鈕 |
| `focus-field` | `focus-visible:border-ring` ＋ `focus-ring` | Field |
| `ring-alert-danger` | `ring-2 ring-status-danger` | Card `data-alert="danger"`（專案卡有 blocked） |
| `ring-alert-warn` | `ring-2 ring-status-warn` | Card `data-alert="warn"`（只有 escalation／undelivered） |
| `ring-step-current` | `ring-3 ring-card` ＋ `bg primary` | 進行中的波次步驟點 |

ring 不佔版面（不推擠鄰居），所以狀態框一律用 ring，不用 border 加粗。

### 3.8 互動狀態與動態

第 6 章的狀態欄引用這些名字。

| token | Tailwind | 規則 |
|---|---|---|
| `motion-colors` | `transition-colors duration-150` | 所有 hover／選中的顏色變化 |
| `motion-lift` | `transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop` | 只給可點的 SummaryTile |
| `motion-pulse` | `animate-pulse` | working／blocked 狀態點、Skeleton |
| `motion-reduce` | `motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0` | 有動態的元素都加 |
| `hover-fill` | `hover:bg-muted` | 在 card 上可點的列／項 |
| `hover-fill-on-muted` | `hover:bg-card` | 在 muted 上可點的列／項 |
| `hover-row` | `hover:bg-muted/60` | 表格列 |
| `hover-text` | `hover:text-foreground` | 次要文字連結、未選中的導覽與 SegmentedControl 項 |
| `hover-link` | `hover:text-primary hover:underline underline-offset-4` | 表格主名稱、TaskRow 名稱連結 |
| `press` | `active:translate-y-px` | 按鈕類 |
| `disabled` | `disabled:opacity-50 disabled:pointer-events-none`（`alpha-50`） | 不改色相 |
| `selected-solid` | `bg-primary text-primary-foreground shadow-soft` | NavLink 選中 |
| `selected-soft` | `bg-accent text-accent-foreground` | SidebarList 項選中 |
| `selected-seg` | `bg-card text-foreground shadow-soft`；暗 `dark:bg-secondary` | SegmentedControl 選中項 |
| `selected-row` | `bg-accent/60` | 表格選中列 |
| `cursor` | `cursor-pointer` | 所有可點元素 |

---

## 4. Desktop Grid 與 Layout 結構

### 4.1 斷點

Tailwind 預設，不改：sm 640／md 768／**lg 1024**／**xl 1280**／2xl 1536；手機參考寬 390。桌機設計寬 1440（稿）。

### 4.2 Layout token

| token | CSS 變數 | Tailwind | 值 | 狀態 | 用途 |
|---|---|---|---|---|---|
| `container-page` | `--container-page` | `max-w-page` | 96rem（1536） | new | 內容頁與 TopBar 內容寬（取代 `max-w-7xl`／`max-w-screen-2xl` 混用；總覽、任務、歷史、趨勢四頁統一此寬） |
| `grid-cols` | — | `grid-cols-12` | 12 | new | 內容頁區塊層欄數 |
| `grid-gutter` | `--grid-gap` | `gap-4` | 16 | alias（＝ `grid-gap`） | 12 欄的 gutter |
| `page-margin` | `--page-x` | `px-4 lg:px-6` | 16／24 | alias（＝ `page-x`） | 內容頁外邊距 |
| `topbar-h` | `--topbar-h` | `h-14`、`top-(--topbar-h)` | 3.5rem（56） | changed | ≥ lg 固定單列；< lg 兩列時由 ResizeObserver 覆寫（保留現有 hook） |
| `rail-w` | `--rail-w` | `var(--rail-w)` | 20rem（320） | new | 總覽活動欄 |
| `aside-w` | `--aside-w` | `var(--aside-w)` | 22.5rem（360） | new | 任務頁右欄（≥ xl） |
| `sidebar-w` | `--sidebar-w` | `var(--sidebar-w)` | 16rem（256）；≥ xl 18rem（288） | new | 工具頁左欄 |
| `detail-w` | `--detail-w` | `var(--detail-w)` | 22rem（352）；≥ xl 26rem（416） | new | git commit 詳情欄 |
| `tool-h` | `--tool-h` | `h-(--tool-h)` | `100svh − topbar-h` | new | 工具頁外框高（≥ lg） |
| `rail-top` | `--rail-top` | `top-(--rail-top)` | `topbar-h + page-y` | new | 活動欄 sticky 位置 |
| `rail-max-h` | `--rail-max-h` | `max-h-(--rail-max-h)` | `100svh − topbar-h − 2 × page-y` | new | 活動欄最大高 |
| `pane-max-h-sm` | `--pane-max-h-sm` | `max-h-(--pane-max-h-sm)` | 70svh | new | 工具頁 < lg 各窗格限高 |
| `z-rail`／`z-topbar`／`z-popover` | — | `z-10`／`z-20`／`z-50` | 10／20／50 | keep | 疊層順序 |

### 4.3 Desktop Grid

兩層結構：

- **頁面層**：固定寬側欄（`rail-w`／`aside-w`／`sidebar-w`／`detail-w`）＋流動主欄 `minmax(0,1fr)`，欄間距內容頁 `section-gap`、工具頁 `tool-gutter`。
- **區塊層**（內容頁主欄內）：12 欄，gutter `grid-gutter`；實作只用 `grid-cols-2`／`grid-cols-4`／`grid-cols-12 + col-span-*`，不手算寬度。

**內容頁**（`container-page` 置中，外邊距 `page-margin`）：

| 視窗寬 | 斷點 | 欄數 | gutter | 外邊距 | 容器寬（內容區） | 單欄寬 |
|---|---|---|---|---|---|---|
| ≥ 1584 | 2xl | 12 | 16 | 自動置中 | 1488（`container-page` − 2 × 24） | 112 |
| **1440** | xl | 12 | 16 | 24 | **1392** | 101.3 |
| **1280** | xl | 12 | 16 | 24 | **1232** | 88 |
| **1024** | lg | 12 | 16 | 24 | **976** | 66.7 |
| < 1024 | — | 1（單欄） | 16 | 16 | 視窗 − 32 | — |

**工具頁**（滿版，不設 max-w；外邊距與 gutter 都是 `tool-gutter`）：

| 視窗寬 | 欄 | gutter | 外邊距 | sidebar | 主窗格（herdr／git 無詳情） | git 有詳情：主窗格＋detail |
|---|---|---|---|---|---|---|
| **1440** | 2–3 | 12 | 12 | 288 | 1116 | 688＋416 |
| **1280** | 2–3 | 12 | 12 | 288 | 956 | 528＋416 |
| **1024** | 2–3 | 12 | 12 | 256 | 732 | 368＋352 |
| < 1024 | 1（直排） | 12 | 12 | 滿寬 | 滿寬 | 滿寬 |

（寬度以版面寬計，不扣捲軸。）

### 4.4 內容頁骨架（總覽、任務詳情、歷史、趨勢）

```
┌ TopBar（sticky, topbar-h, 滿版底；內容 max-w-page＋page-x 置中）──────────────┐
├──────────────────────────────────────────────────────────────────────────────┤
│  <div class="mx-auto w-full max-w-page px-4 lg:px-6 py-6 flex flex-col gap-6"> │
│    [Breadcrumb]（只有任務頁，PageHeader 之上，stack-sm）                        │
│    PageHeader size=default：圖示塊 + 標題 + 副標 ……………………… 右側工具列        │
│    [Banner]（0..n 條）                                                          │
│    區塊 1（SummaryTile 列 / Card / ChartCard 格，gap-4）                         │
│    區塊 2 …（區塊之間 section-gap）                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 外框：`container-page`、`page-margin`、`page-y`，直排 `section-gap`。
- 頁首到內容 `section-gap`；卡片格 `grid-gap`；卡片內 `card-pad`＋`card-gap`。
- body 自然捲動；sticky 只有 TopBar 與總覽活動欄（`rail-top`、`rail-max-h`、自捲）。

### 4.5 工具頁骨架（herdr、git）

```
┌ TopBar ─────────────────────────────────────────────────────────────────────┐
├─────────────────────────────────────────────────────────────────────────────┤
│ <div class="flex flex-col gap-3 p-3 lg:h-(--tool-h)">                          │
│   PageHeader size=compact（bar：標題 · 副標(唯讀說明) …… 右側工具列）           │
│   [Banner]                                                                    │
│   <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)(_var(--detail-w))]"> │
│     Card pane：SidebarList（自捲）│ Card pane：PaneHeader + 內容（自捲）│ [Card pane：詳情] │
│   </div>                                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

- 滿版寬；四周與窗格之間 `tool-gutter`；窗格一律卡片化（`radius-xl` 卡＋`shadow-soft`，取代貼邊＋`divide-x`）。
- 每個窗格是 `Card variant="pane"`（§6.13）。
- ≥ lg body 不捲；< lg 改單欄直排、body 捲動、各窗格 `pane-max-h-sm`。
- 唯讀說明在 PageHeader 副標（不放側欄底）；終端區是窗格內的 `terminal-bg`，圓角跟著窗格，內部不再加圓角。

### 4.6 各頁欄格配置

數字是主欄／各欄在 1440／1280／1024 的寬（px）。

| 頁 | 骨架 | 頁面層 grid | 1440 | 1280 | 1024 | < lg |
|---|---|---|---|---|---|---|
| 總覽 | 內容 | `lg:grid-cols-[minmax(0,1fr)_var(--rail-w)] gap-6 items-start` | 主 1048＋rail 320 | 主 888＋rail 320 | 主 632＋rail 320 | 單欄（順序見 README 總覽） |
| 任務 | 內容 | `xl:grid-cols-[minmax(0,1fr)_var(--aside-w)] gap-6 items-start` | 主 1008＋aside 360 | 主 848＋aside 360 | 單欄 976（aside 接在主欄下） | 單欄 |
| 歷史 | 內容 | 單欄 | 1392 | 1232 | 976 | 單欄 |
| 趨勢 | 內容 | 單欄 | 1392 | 1232 | 976 | 單欄 |
| herdr | 工具 | `lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]` | 288＋1116 | 288＋956 | 256＋732 | 直排 |
| git | 工具 | 同上；選了 commit 加 `_var(--detail-w)` | 288＋1116（＋詳情：688＋416） | 288＋956（528＋416） | 256＋732（368＋352） | 直排 |

區塊層：

| 區塊 | grid（全部 `gap-4 items-start`） | 1440 | 1280 | 1024 |
|---|---|---|---|---|
| 總覽 摘要列（在主欄內） | `grid-cols-2 lg:grid-cols-4` | 4 × 250 | 4 × 210 | 4 × 146 |
| 總覽 專案卡（主欄內） | `grid-cols-1 xl:grid-cols-2`（只有一張時滿寬） | 2 × 516 | 2 × 436 | 1 × 632 |
| 總覽 縮圖（專案卡內） | `grid-cols-1 sm:grid-cols-2`，`stack-lg` | 跟卡寬 | 跟卡寬 | 跟卡寬 |
| 歷史 圖表 | `grid-cols-1 lg:grid-cols-2` | 2 × 688 | 2 × 608 | 2 × 480 |
| 歷史 表格、檔位分析 | 滿寬 | 1392 | 1232 | 976 |
| 趨勢 額度 | `grid-cols-1 lg:grid-cols-2` | 2 × 688 | 2 × 608 | 2 × 480 |
| 趨勢 ctx | 滿寬 | 1392 | 1232 | 976 |
| 趨勢 每日花費＋kind／角色 | `grid-cols-1 lg:grid-cols-12`，`lg:col-span-8`＋`lg:col-span-4` | 923＋453 | 816＋400 | 645＋315 |
| 趨勢 模型 | `grid-cols-1 lg:grid-cols-2` | 2 × 688 | 2 × 608 | 2 × 480 |
| 趨勢 表格 | 滿寬 | 1392 | 1232 | 976 |

1024 的摘要卡只有 146 寬：副行必須 `truncate`（§6.9），不得撐高卡片。

---

## 5. 主要可重複使用的 Components

共用元件放 `apps/web/src/components/app/`；shadcn 原子元件（`components/ui/`）只改 token 層面。

### 5.1 原子

| 元件 | 用途 | 組成 |
|---|---|---|
| Button | 動作；含 icon-only | lucide 圖示（可選） |
| Field | Select、日期、搜尋輸入 | label（可選） |
| StatusPill | 講「現在的狀態」的膠囊（有框無底） | StatusDot 或圖示（Check／Ban）＋文字＋note |
| Tag | 講「分類或計數」的標籤（有底無框） | 文字＋圖示（可選） |
| StatusDot | 純狀態點 | — |
| Avatar | 成員 emoji 頭像 | — |
| IconBlock | 頁首圖示塊 | lucide 圖示 |
| ProgressBar | 任務進度 | 軌＋填色 |
| Skeleton | 載入佔位 | — |
| Tooltip／Popover | 浮層說明與內容 | 任意 |

### 5.2 複合

| 元件 | 用途 | 組成 |
|---|---|---|
| SegmentedControl | 視圖切換（Tabs）或參數切換（時間區間） | 軌＋項（文字＋count） |
| Breadcrumb | 任務頁路徑 | 連結＋分隔圖示 |
| Card | 表層容器 | CardHeader（CardTitle＋CardDescription＋CardAction）＋內容＋CardFooter |
| PaneHeader | 工具頁窗格頂列 | 標題＋次要資訊＋action（Button／SegmentedControl sm） |
| ChartCard | 圖表卡 | Card＋摘要列＋圖區（recharts）＋圖例；empty 時 EmptyState inline；loading 時 Skeleton；「顯示全部」Button |
| SummaryTile | 總覽摘要數字卡 | label＋value＋副行＋裝飾圖示 |
| Banner | 錯誤／警示／資訊條 | 圖示＋title＋細節＋Button（action）＋dismiss icon button |
| EmptyState | 為什麼空、什麼時候會有 | 圖示圓（emoji／lucide）＋標題＋提示＋Button |
| Table | 資料表 | 表頭＋列；儲存格內放 Tag、StatusPill、連結；空時 EmptyState inline |
| SidebarList | 工具頁左欄清單 | 段標題（＋Tag 計數）＋SidebarItem（StatusDot／編號＋主文字＋Tag／圖示） |
| ActivityItem | 一則活動 | Avatar 或 StatusDot＋actor＋Tag（type）＋時間＋text |
| ActivityGroup | 同一任務連續的活動 | 組頭連結＋時間線組身（ActivityItem ×n）＋「再看 N 則」 |
| UsageChip | TopBar 額度膠囊 | kind＋兩個百分比 |
| ConnectionChip | TopBar 連線燈 | 兩個 StatusDot＋文字＋Tooltip |
| TaskRow | 專案卡內的進行中任務 | 名稱連結＋StatusPill sm＋Tag 計數＋ProgressBar＋StatusPill（成員） |
| WaveRow | 任務頁波次時間軸的一波 | 波號＋StatusPill sm＋步驟點（進行中）＋Tag（測試、commit） |
| IdleProjectRow | 閒置專案卡內一列 | 展開箭頭＋名稱＋Tag 版本＋StatusDot 群＋時間 |
| PaneThumb | 總覽終端縮圖 | 終端標題列（StatusPill sm）＋終端內容 |

### 5.3 版面

| 元件 | 用途 | 組成 |
|---|---|---|
| TopBar | 全站頂部列 | Logo＋NavLink ×5＋狀態群（StatusPill、UsageChip、Tag `+N`＋HoverCard）＋ConnectionChip＋Button ghost icon（通知、主題） |
| PageHeader | 每頁頁首 | IconBlock（default）＋h1＋副標＋StatusPill（meta）＋工具列（SegmentedControl／Field／Button） |
| ActivityRail | 總覽活動欄 | Card 樣式容器＋標題＋SegmentedControl sm＋ActivityGroup ×n；Banner sm／EmptyState inline／Skeleton；手機「看全部」Button |
| ProjectCard | 總覽活躍專案 | Card（`data-alert` ring）＋TaskRow ×n＋PaneThumb 格＋StatusPill（其他 session）＋Banner sm（錯誤） |
| IdleProjectsCard | 總覽閒置專案 | Card＋區段標題＋Tag 計數＋IdleProjectRow ×n |

### 5.4 元件 API（props）

| 元件 | props |
|---|---|
| PageHeader | `size`: `default`｜`compact`；`icon`（lucide，只 default）；`title`（渲染 h1）；`subtitle`（ReactNode，一行）；`meta`（標題右邊的 StatusPill）；`actions`（右側工具列） |
| SummaryTile | `variant`: `ok`｜`warn`｜`danger`｜`brand`｜`quiet`；`icon`（Rocket／Coins／Siren／Gauge）；`label`；`value`；`children`（副行）；`href`（有就整張是 Link） |
| Card | `size`: `default`｜`sm`；`variant`: `default`｜`pane`；`data-alert`: `danger`｜`warn` |
| StatusPill | `tone`: `danger`｜`warn`｜`ok`｜`idle`｜`info`；`size`: `default`｜`sm`；`dot`（預設有點；可換 Check／Ban）；`note`（尾端次要字） |
| Tag | `variant`: `neutral`｜`brand`｜`info`｜`ok`｜`warn`｜`danger`；`mono` |
| Banner | `tone`: `danger`｜`warn`｜`info`｜`ok`；`size`: `default`｜`sm`；`title`；`children`（細節，可含 mono 錯誤訊息）；`action`（通常是「重試」）；`onDismiss`（可選） |
| EmptyState | `size`: `page`｜`inline`；`icon`（emoji 或 lucide）；`title`；`hint`；`action` |
| SegmentedControl | `size`: `default`｜`sm`；`items`: `{ value, label, count? }[]`；`value`；`onChange`；語意 `tablist`｜`group` |
| Table | `density`: `default`｜`dense` |
| ActivityItem | `variant`: `default`｜`compact` |
| Button | shadcn variant（default／secondary／outline／ghost）；`size`: `xs`｜`sm`｜`default`｜`lg`｜icon-only |

組合樹（只列兩層以上的）：

```
TopBar ─ NavLink · StatusPill · UsageChip · Tag(+N) · ConnectionChip(StatusDot) · Button
PageHeader ─ IconBlock · StatusPill · SegmentedControl · Field · Button   （上方可接 Breadcrumb）
ProjectCard(Card) ─ TaskRow(StatusPill · Tag · ProgressBar) · PaneThumb(StatusPill) · Banner
ActivityRail ─ SegmentedControl · ActivityGroup ─ ActivityItem(Avatar|StatusDot · Tag)
ChartCard(Card) ─ Skeleton | EmptyState | 圖區 ; Button
Card variant=pane ─ PaneHeader · SidebarList(StatusDot · Tag) | Table(Tag · StatusPill) | 終端
```

---

## 6. 每個 Component 的尺寸、Padding、文字層級與基本狀態

全部引用第 1–4 章 token。表格沒寫的狀態照 §6.0。「亮暗差異」沒寫的，表示只靠 token 自動切換。

### 6.0 共同狀態

| 狀態 | token |
|---|---|
| default | 各元件表 |
| hover | `motion-colors`；可點列／項 `hover-fill`（在 muted 上的 `hover-fill-on-muted`）；文字連結 `hover-text`；`cursor` |
| active | 按鈕類 `press`；選中態見各元件 |
| focus-visible | `focus-ring`；清單項 `focus-ring-inset`；漸層上 `focus-ring-on-color` |
| disabled | `disabled` |
| reduced motion | 有動態的都加 `motion-reduce` |

### 6.1 Button

| 項目 | xs | sm | default | lg |
|---|---|---|---|---|
| 尺寸 | 高 `pill` | 高 `control-sm`；icon-only `control-sm` 方 | 高 `control`；icon-only `control` 方 | 高 `control-lg` |
| Padding | `inset-pill` | `inset-control-sm` | `inset-control-md` | `inset-control-lg` |
| Gap（圖示＋字） | `stack-xs` | `stack-xs` | `stack-xs` | `stack-xs` |
| 圖示 | `icon-sm` | `icon-sm` | `icon-sm` | `icon-sm` |
| 圓角 | `radius-full` | 同 | 同 | 同 |
| 文字層級 | `caption-strong` | `body-strong` | `body-strong` | `body-strong` |

| 狀態 | 規格 |
|---|---|
| default | variant 照 shadcn：default `bg primary`＋`primary-foreground`；secondary `bg secondary`＋`secondary-foreground`；outline `border-w-hair` `border`＋`bg card`；ghost 透明＋`foreground` |
| hover | `motion-colors`；ghost／outline `hover-fill` |
| active | `press` |
| focus-visible | `focus-ring`；漸層卡上 `focus-ring-on-color` |
| disabled | `disabled` |
| 漸層卡上 | `bg on-color / alpha-15`＋`text on-color`；hover `on-color / alpha-25` |
| 亮暗差異 | — |

### 6.2 Field（Select、日期、搜尋）

| 項目 | 規格 |
|---|---|
| 尺寸 | 高 `control`（工具列內 sm 同高） |
| Padding | `inset-control-sm` |
| 圓角 | `radius-lg`（輸入框／Select 一律 `radius-lg`、不用 full：日期輸入兩端會擠到原生圖示；按鈕、SegmentedControl、Tag、Pill 一律 `radius-full`） |
| 底／框 | `bg card`；`border-w-hair` `input` |
| 文字層級 | 值 `body`；placeholder `body` `muted-foreground`；label（在上方）`caption-strong` `muted-foreground`，與欄位 `stack-xs`；工具列內不顯示 label，用 `aria-label` |
| default | 如上 |
| hover | `motion-colors`，框不變 |
| active | — |
| focus-visible | `focus-field` |
| disabled | `disabled` |
| 亮暗差異 | 暗色底改 `input / alpha-30` |

### 6.3 StatusPill

| 項目 | default | sm |
|---|---|---|
| 尺寸 | 高 `pill` | 高 `pill-sm` |
| Padding | `inset-pill` | `inset-pill-sm` |
| Gap | `stack-xs` | `stack-2xs` |
| 圓角 | `radius-full` | 同 |
| 框／底 | `border-w-pill` `status-X`；底透明 | 同 |
| 點 | `dot-sm` `bg status-X`；working／blocked 加 `motion-pulse`＋`motion-reduce` | `dot-sm` |
| 圖示（取代點） | `icon-2xs`：完成 Check、abandoned Ban | 同 |
| 文字層級 | `caption-strong` `status-X-fg`；note `caption` 疊 `alpha-75` | `micro`；不顯示 note |
| default | 不可點 | 同 |
| hover（可點時） | `motion-colors`＋`bg status-X-soft` | 同 |
| active | — | — |
| focus-visible（可點時） | `focus-ring` | 同 |
| disabled | — | — |
| 終端內 | 底 `on-color / alpha-5`，色用暗色版 token（終端區加 `.dark`） | 同 |
| 亮暗差異 | — | — |

tone 對照（取代 TONE_CLASS）：

| 狀態 | tone | 文字 |
|---|---|---|
| working | ok | 工作中 |
| blocked | danger | 卡住 |
| idle | idle | 閒置 |
| done（agent） | ok＋Check | 完成 |
| unknown／無 pane | idle（框改虛線 `border-dashed`） | 不明／無 pane |
| 任務 running | ok | 進行中 |
| 任務 planning | info | 規劃中 |
| 任務 done | idle＋Check | 已完成 |
| 任務 abandoned | idle＋Ban，刪除線 | 已放棄 |
| kind 熔斷 | warn | `codex 熔斷 · 7 天 6 小時` |
| 波已關閉／未開始 | idle（已關閉加 Check） | 已關閉／未開始 |

### 6.4 Tag

| 項目 | 規格 |
|---|---|
| 尺寸 | 高 `pill-sm` |
| Padding | `inset-pill-sm` |
| Gap（圖示＋字） | `stack-2xs`；圖示 `icon-2xs` |
| 圓角 | `radius-full` |
| 框 | 無 |
| 文字層級 | `micro`；`mono` 變體 `mono-2xs` |
| variant 色 | `neutral`：`bg muted`＋`muted-foreground`｜`brand`：`bg accent`＋`accent-foreground`｜`info`：`bg status-info-soft`＋`status-info-fg`｜`ok`／`warn`／`danger`：`bg status-X-soft`＋`status-X-fg` |
| default | 不可點；計數為 0 時不渲染 |
| hover／active／focus-visible／disabled | 不可互動（`+N` Tag 的 HoverCard 觸發用 `focus-ring`） |
| 亮暗差異 | — |

用法：neutral＝版本 `v0.19.0`、專案名、遠端分支、「相容模式」；brand＝git 版本 tag（＋Tag 圖示）、檔位 `L · opus/high`；info＝活動 type 中性事件、`HEAD → master`；ok／warn／danger＝活動 type 好／壞消息、計數、git 乾淨／改動／衝突；mono＝hash、kind。

活動 type → variant：DONE、FIXED、dev-done、wave-close、gate3、task-close → ok；ESCALATE、LIMIT、TIMEOUT、timeout → warn；BUG、BLOCKED、STOP → danger；其餘 → info。

**StatusPill 有框無底（現在的狀態）；Tag 有底無框（分類或計數）。** 兩者不混用。

### 6.5 StatusDot

| 項目 | 規格 |
|---|---|
| 尺寸 | `dot`（清單、ConnectionChip、IdleProjectRow）／`dot-sm`（StatusPill 內、ActivityItem compact） |
| 圓角 | `radius-full` |
| 色 | `bg status-X` |
| 狀態 | working／blocked `motion-pulse`＋`motion-reduce`；不可互動 |
| 可及性 | 一定配文字或 `aria-label`／`title` |
| 亮暗差異 | — |

### 6.6 Avatar

| 項目 | 規格 |
|---|---|
| 尺寸 | `avatar` |
| 圓角 | `radius-full` |
| 文字層級 | `emoji-sm` |
| 色 | emoji＋固定底色（`avatar.ts` 不動，屬資料不屬 token） |
| 狀態 | 不可互動 |
| 亮暗差異 | — |

### 6.7 IconBlock

| 項目 | 規格 |
|---|---|
| 尺寸 | `icon-block`；圖示 `icon-md` |
| 圓角 | `radius-lg` |
| 色 | `bg accent`＋`accent-foreground` |
| 狀態 | 不可互動 |
| 亮暗差異 | — |

### 6.8 ProgressBar

| 項目 | 規格 |
|---|---|
| 尺寸 | 高 `progress-h`，寬滿 |
| 圓角 | `radius-full` |
| 色 | 軌 `bg card`（放在 muted 列上）；填 `bg primary` |
| 標籤 | 右側 `caption-strong` `+num`（`1/3 波`），與軌 `stack-md` |
| 狀態 | 不可互動 |
| 亮暗差異 | — |

### 6.9 SummaryTile

| 項目 | 規格（≥ sm） | < sm |
|---|---|---|
| 尺寸 | 最小高 `tile-h`；寬跟格 | `tile-h-sm` |
| Padding | `card-pad` | `card-pad-sm` |
| Gap | `stack-2xs`；副行推到底 | 同 |
| 圓角 | `radius-xl`，`overflow-hidden` | 同 |
| 底 | 漸層 variant：`grad-X`＋`shadow-pop`＋`text on-color`｜quiet：`bg card`＋`shadow-soft` | 同 |
| 裝飾圖示 | `tile-deco`（位移與旋轉見 §3.3），漸層上 `on-color` 疊 `alpha-12`；quiet `status-idle` 疊 `alpha-15`；`aria-hidden` | `tile-deco-sm` |
| label | `body-bold`（漸層上 `on-color`、quiet `muted-foreground`） | 同 |
| value | `display` `+num`（quiet 用 `muted-foreground`，不用大紅大綠） | `title-lg` `+num` |
| 副行 | `body-medium`，只 1 行、放不下 `truncate`（不得撐高或被裁）；quiet 的好消息用 `status-ok-fg` | 同 |
| default | variant 見 §1.4 | — |
| hover（有 href） | `motion-lift`；quiet 另加 `bg muted / alpha-40` | — |
| active | — | — |
| focus-visible | 漸層 `focus-ring-on-color`；quiet `focus-ring` | — |
| disabled | — | — |
| reduced motion | `motion-reduce` | — |
| 亮暗差異 | 漸層亮暗共用；暗色 quiet 卡靠 `card` 亮一階，不加框 | — |

### 6.10 Card

| 項目 | default | sm |
|---|---|---|
| Padding | `card-pad` | `card-pad-sm` |
| Gap（header↔內容） | `card-gap` | `card-gap-sm` |
| 圓角 | `radius-xl`，`overflow-hidden` | 同 |
| 底／分層 | `bg card`＋`card-foreground`＋`shadow-soft`；不加框 | 同 |
| CardHeader | 兩欄（標題｜action），欄距 `stack-lg`、列距 `stack-2xs` | 同 |
| CardTitle | `title-sm`；前置圖示 `icon-sm` `brand-violet`，`stack-xs` | 同 |
| CardDescription | `body` `muted-foreground`，最多 2 行，超出進 Tooltip | 同 |
| CardAction | 放 Tag／Button sm／SegmentedControl sm | 同 |
| CardFooter | 頂線 `border-w-hair` `border`；底 `muted / alpha-50`；padding 左右 `card-pad`、上下 `inset-y-md`；向外延伸到卡邊（由容器裁圓角，不自己寫單邊圓角） | 左右 `card-pad-sm` |
| 內層列 | `radius-lg` `bg muted` `inner-pad`，不加陰影不加框 | 同 |
| 文字層級 | 內文 `body` | 同 |
| default | 不可點 | — |
| 警示 | `data-alert="danger"` → `ring-alert-danger`；`"warn"` → `ring-alert-warn` | 同 |
| hover／active／focus-visible／disabled | 卡片本身不可互動（可點的是裡面的列與連結） | — |
| 亮暗差異 | — | — |

### 6.11 ChartCard

Card 的變體，除下表外照 §6.10。

| 項目 | 規格 |
|---|---|
| Header | CardTitle＋CardDescription；CardAction 放圖例切換或「顯示全部 N 件」Button ghost sm |
| 摘要列（可選） | header 下一行，各項間距 `card-gap`；`body`，關鍵數字 `body-bold` `+num` |
| 圖區高 | `chart-h-md`（預設）；小圖 `chart-h-sm`、大圖 `chart-h-lg`；水平長條圖見 `chart-bar-*`（§3.3）；資料超過 15 列時預設只畫最近 15 列，CardAction「顯示全部 N 件」切換（再按回「只看最近 15 件」） |
| 圖例 | 圖區下方，欄距 `card-gap`、列距 `stack-2xs`；`caption` `muted-foreground`；色塊 `swatch` `radius-full` |
| 軸 | 不畫 tick 線與軸線；字 `caption` 字級、`muted-foreground`；格線 `border` 虛線 |
| Bar | 末端 `chart-bar-radius` |
| Tooltip | §6.25 |
| default | 有資料 |
| loading | 圖區換 Skeleton，高 `chart-h-md`、`radius-lg` |
| empty | 不畫軸與格線；整卡最小高 `chart-empty-min`，Header 保留，內容換 EmptyState inline 垂直置中；同列非空卡頂端對齊（`items-start`），不被拉高 |
| hover | 圖區 hover 出 Tooltip；卡片本身無 |
| focus-visible | CardAction 內控制件照各自規格 |
| 亮暗差異 | 系列色見 §1.7（亮暗兩組） |

### 6.12 SegmentedControl

| 項目 | default | sm |
|---|---|---|
| 軌 尺寸 | 高 `control-lg` | 高 `control` |
| 軌 Padding | `inset-track` | `inset-track-sm` |
| 軌 Gap | `stack-3xs` | 同 |
| 軌 底／圓角 | `bg muted`、`radius-full` | 同 |
| 項 尺寸 | 高 `control-sm` | 高 `control-sm` |
| 項 Padding | `inset-control` | `inset-control-sm` |
| 項 圓角 | `radius-full` | 同 |
| 文字層級 | `body-strong` `muted-foreground`；count `caption` `+num` 疊 `alpha-70`，與字 `space-1` | `caption-strong`；count 同 |
| default | 未選中如上 | 同 |
| hover | `motion-colors`＋`hover-text` | 同 |
| active（選中） | `selected-seg` | 同 |
| focus-visible | 項自己 `focus-ring` | 同 |
| disabled | 項 `disabled` | 同 |
| 溢出 | 軌 `max-w-full overflow-x-auto` | 同 |
| 亮暗差異 | 暗色 `card` 比 `muted` 暗，選中項改 `bg secondary`（已含在 `selected-seg`） | 同 |

語意：切換「視圖」用 `role="tablist"`＋`aria-selected`＋roving tabindex；切換「參數」（趨勢區間）用 `role="group"`＋`aria-pressed`。鍵盤 ← →、Home／End。

### 6.13 Card pane＋PaneHeader（工具頁窗格）

| 項目 | 規格 |
|---|---|
| 容器 | Card，padding 0、gap 0、`overflow-hidden`；直排、內容區 `min-h-0 flex-1 overflow-auto` |
| PaneHeader 尺寸 | 高 `bar` |
| PaneHeader Padding | `inset-control-md` |
| PaneHeader Gap | `stack-sm` |
| PaneHeader 分隔 | 底線 `border-w-hair` `border` |
| 文字層級 | 標題 `body-bold`；次要資訊 `body-medium` `muted-foreground`；右側 action（Button sm／SegmentedControl sm） |
| 狀態 | PaneHeader 不可互動；action 照各自規格 |
| 終端窗格 | 內容區 `bg terminal-bg`；終端標題列 `bg terminal-chrome`、分隔 `terminal-line`、字 `micro` `terminal-fg` |
| 亮暗差異 | 終端區不跟主題 |

### 6.14 PageHeader

| 項目 | default（內容頁） | compact（工具頁） |
|---|---|---|
| 尺寸 | 自然高（由 `icon-block` 與兩行字撐起） | 高 `bar` |
| Gap | 欄距 `card-gap`、列距 `stack-lg`（可換行） | `stack-lg`（單列） |
| 圖示塊 | IconBlock | 無 |
| 標題（h1） | `title-lg` `+tight` | `title-md`（不再 sr-only） |
| meta | 標題右邊 StatusPill（任務頁） | — |
| 副標 | 標題下一行，`body` `muted-foreground` `truncate` | 同列、前接 `·`，同字級 `truncate`＋`title` 屬性 |
| 工具列 | 靠右，`stack-sm`，可換行；SegmentedControl／Field／Button | 靠右，`stack-sm`，控制件用 `sm` |
| < sm | 工具列換到下一列、靠左、可橫捲 | 副標隱藏（改放 `title`） |
| 狀態 | 不可互動；工具列控制件照各自規格 | 同 |
| 亮暗差異 | — | — |

各頁圖示、標題、副標、工具列內容見 README「各頁重點」。

### 6.15 Breadcrumb

| 項目 | 規格 |
|---|---|
| 位置 | PageHeader 上方，與它 `stack-sm` |
| Gap | `stack-xs` |
| 文字層級 | `body` `muted-foreground`；最後一段 `body-strong` `+mono` `foreground` `truncate` |
| 分隔 | ChevronRight `icon-xs` |
| hover | `hover-text` |
| focus-visible | `focus-ring` |
| 亮暗差異 | — |

### 6.16 TopBar

| 項目 | 規格 |
|---|---|
| 外框 | 滿版，高 `topbar-h`，`sticky top-0` `z-topbar`；底 `background / alpha-80`＋背景模糊＋`shadow-soft` |
| 內容 | `container-page` 置中，`page-margin`，`card-gap` |
| Logo | Cloud `icon-lg`：`brand-blue` 線、`brand-violet / alpha-30` 填；字 `wordmark`；連到 `/`，`stack-sm` |
| NavLink | 高 `control`、`inset-control`、`radius-full`、`body-strong` |
| NavLink 狀態 | default `muted-foreground`；hover `hover-fill`＋`hover-text`；active（選中）`selected-solid`；focus-visible `focus-ring` |
| 狀態群 | 填滿中間、`stack-sm`、超出收成 Tag `+N`（hover／focus 出 HoverCard 列全部）；依嚴重度：卡住（StatusPill danger＋數字，連 herdr）→ 熔斷（StatusPill warn）→ UsageChip |
| UsageChip | 高 `pill`、`inset-pill`、`radius-full`、框 `border-w-pill`；kind `caption-strong`＋百分比 `caption` `+num` `muted-foreground`；正常框 `brand-blue / alpha-70`；任一值 ≥ 80% 框 `status-warn`、字 `status-warn-fg`；**不會變紅**（額度用完＝熔斷＝降級，不是要人立刻處理） |
| ConnectionChip | 高 `pill`、`inset-pill`、`radius-full`、`bg muted`；兩個 `dot`（SSE、herdr：ok／warn=polling／danger=斷／idle=未知）＋`caption`「SSE · herdr」；Tooltip 說明 |
| 最後更新 | `caption` `+num` `muted-foreground`；< xl 隱藏，進 ConnectionChip Tooltip |
| 通知、主題 | Button ghost icon-only（`control`） |
| 響應 | ≥ xl 單列；lg–xl 狀態群收 `+N`；< lg 兩列：第一列 Logo＋最嚴重一顆狀態膠囊（點開 Popover 列全部）＋通知＋主題，第二列導覽橫向捲動不換行、選中項 `scrollIntoView`，`topbar-h` 由 ResizeObserver 寫入 |
| 亮暗差異 | 暗色靠 `background / alpha-80` 與 `soft-shadow` 分層，不加邊線 |

### 6.17 Banner

| 項目 | default | sm |
|---|---|---|
| Padding | `inner-pad` | `inset-control-sm`＋`inset-y-sm` |
| Gap | `stack-lg` | `stack-sm` |
| 圓角 | `radius-xl` | `radius-lg` |
| 底 | `bg status-X-soft`；不用左側粗色條 | 同 |
| 圖示 | `icon-md` `status-X-fg`：danger CircleAlert、warn TriangleAlert、info Info、ok CircleCheck | `icon-sm` |
| 文字層級 | title `body-bold` `status-X-fg`；細節 `body` `foreground / alpha-80`；錯誤原文 `mono-sm`（斷行 break-all） | 只有 title |
| action | Button outline sm，框 `status-X / alpha-60` | Button xs |
| dismiss | Button ghost icon-only sm（`control-sm`） | 同 |
| role | danger／warn `alert`；其他 `status` | 同 |
| 狀態 | Banner 本身不可互動；action／dismiss 照 Button | 同 |
| 亮暗差異 | — | — |

情境與文案（取代各頁自寫錯誤條）：

| 情境 | tone | title |
|---|---|---|
| 沒有任何資料可顯示（首次載入失敗） | danger | 載入失敗 |
| 有舊資料、這次更新失敗 | warn | 更新失敗，顯示的是舊資料 |
| herdr 改為輪詢 | warn | herdr 訂閱斷線，每 5 秒輪詢中 |
| 專案 dk-status 錯誤（ProjectCard 內） | danger sm | 路徑不存在／dk-status 逾時… |
| 活動欄拿不到 | warn sm | 暫時拿不到活動 |

位置：PageHeader 下、第一個區塊（或窗格）上，不貼窗格頂邊。

### 6.18 EmptyState

| 項目 | page | inline |
|---|---|---|
| Padding | `empty-pad` | `empty-pad-inline`（ChartCard 內改垂直置中） |
| Gap | `stack-lg` | `stack-sm` |
| 對齊 | 置中 | 置中 |
| 圖示圓 | `empty-icon` `radius-full` `bg accent`；emoji `emoji-lg`；lucide `icon-xl` `accent-foreground` | `icon-block` `radius-full` `bg muted`；emoji `emoji-md`；lucide `icon-md` `muted-foreground` |
| 標題 | `title-sm` | `body-strong` |
| 提示 | `body` `muted-foreground`，最大寬 `measure-hint` | `caption` `muted-foreground` |
| action | Button outline sm | 不放（或文字連結 `hover-text`） |
| 狀態 | 不可互動 | 同 |
| 亮暗差異 | 圖示圓 `accent` 亮淡紫／暗深紫，不另寫 | — |

文案一律說「為什麼空」＋「什麼時候會有」：

| 地方 | icon | 標題 | 提示 |
|---|---|---|---|
| 趨勢全頁 | 📈 | 還沒有趨勢資料 | dashboard 開著時每分鐘記錄一次 |
| 額度圖（某 kind） | Gauge | 這段期間沒有 agy 額度資料 | 換個時間區間，或等 agy 下次回報 |
| ctx 圖 | Cpu | 這段期間沒有 ctx 資料 | — |
| 每日花費 | Coins | 這段期間沒有花費 | — |
| 歷史表（篩選後） | 🔍 | 沒有符合條件的已結案任務 | 清除篩選（文字連結） |
| 專案沒有進行中任務 | 不顯示 EmptyState，專案進「閒置專案」 | | |
| herdr 沒有 space | 🫥 | herdr 目前沒有任何 space | — |
| git 找不到專案 | FolderX | 找不到專案 {name} | — |
| 活動欄 | 🍵 | 還沒有新動態，喝口茶吧 | — |

### 6.19 Table

| 項目 | default | dense |
|---|---|---|
| 外框 | 放在 Card 內：Card padding 0、Header 區 `card-pad`（不含下）；表格滿卡寬，首欄左、末欄右 `inset-control-lg` | 同 |
| 表頭列 | 高 `bar`；底線 `border-w-hair` `border` | 高 `row-dense` |
| th | `cell-x`；`caption-bold` `muted-foreground`；不換行；數字欄靠右 | 同 |
| 列 | 高 `row`；列線 `border-w-hair` `border`，最後一列無 | 高 `row-dense` |
| td | `cell-x`；`body`；垂直置中 | 同 |
| 多行內容列 | 靠上、`inset-y-md`（成員表「目前」「待辦」） | — |
| 數字欄 | 靠右 `+num`；0／空 `muted-foreground`，金額 0 → `—` | 同 |
| mono 欄 | hash／時間／dir：`mono-sm` `muted-foreground` | 同 |
| 主名稱欄 | `body-strong`；連結 `hover-link` | 同 |
| default | 如上 | 同 |
| hover | 整列 `hover-row`；整列可點時 `cursor`，焦點落在主名稱連結 | 同 |
| active（選中） | `selected-row` | 同 |
| focus-visible | 連結 `focus-ring-inset` | 同 |
| disabled | — | — |
| sticky 表頭 | 長表（> 20 列）`top-(--topbar-h)`、`bg card`、`z-rail` | 同 |
| 空 | 一列跨欄 → EmptyState inline | 同 |
| < md | 寬表改卡片清單：每列 `radius-lg` `bg muted` `inner-pad`，內容兩欄 dl、`caption` | — |
| 亮暗差異 | 暗色表頭下線改 `border-w-strong`（`border` 10% 白偏淡） | 同 |

歷史表欄位（9 欄）：專案（Tag neutral）｜任務（主名稱）｜狀態（StatusPill sm）｜結案（mono）｜耗時｜波數｜檔位（Tag brand mono）｜審查（`9/6 · m5 · r1`＝裁定/自主 · minor · 重審，`+num`，表頭 Tooltip 解釋；儲存格 hover 出 Tooltip 列三個數字的完整說明）｜花費。原「裁定/自主」「minor」「審查複看」三欄已合併成「審查」一欄。

testid：合併後的儲存格 `data-testid="col-review"`；格內三段各包一個 span，沿用 `col-rulings`（`9/6`）、`col-minors`（`m5`）、`col-rereviews`（`r1`）。現有測試（`apps/web/test/detail/history-view.test.tsx` 的 `3 / 1`、`7`、`2`）斷言要改成新文字格式（`3/1`、`m7`、`r2`），實作者在 report 列出改了哪些斷言。

### 6.20 SidebarList＋SidebarItem

放在 Card pane 內，可多段。

| 項目 | 規格 |
|---|---|
| 容器 | `inset-list`，項之間 `stack-3xs`，自捲 |
| 段標題 | padding 左右 `inset-control-sm`、上 `space-3`、下 `space-1`；`caption-bold` `muted-foreground`；右側可放 Tag 計數；段之間頂線 `border-w-hair` `border`，上下 `space-2` |
| 項 尺寸 | 最小高 `bar`，寬滿 |
| 項 Padding | `inset-control-sm`＋`inset-y-sm` |
| 項 Gap | `stack-md` |
| 項 圓角 | `radius-lg` |
| 前置 | 編號 `slot-index` 靠右 `caption` `+num` `muted-foreground`；或 StatusDot `dot` |
| 主文字 | 第一行 `body-strong` `truncate`；第二行（可選）`caption` `muted-foreground` `truncate`，可內嵌 Tag／`+mono` 分支 |
| 尾端 | Tag、Eye `icon-xs` `muted-foreground`、計數 |
| default | 透明底 |
| hover | `hover-fill` |
| active（選中） | `selected-soft`；第二行 `accent-foreground / alpha-80`；不用左側色條 |
| focus-visible | `focus-ring-inset` |
| disabled／錯誤項 | 第二行換成 `status-danger-fg` 錯誤文字，仍可選 |
| 亮暗差異 | — |

herdr agents 段排序：blocked → working → idle → 其他，同狀態依名稱。說明文字不放 sidebar（在 PageHeader 副標／`?` popover）。

### 6.21 ActivityRail

| 項目 | 規格 |
|---|---|
| 容器 | 寬 `rail-w`；`radius-xl` `bg card` `shadow-soft`；padding `inner-pad`；組之間 `stack-lg` |
| ≥ lg | sticky `top-(--rail-top)`、`max-h-(--rail-max-h)`、自捲 |
| 標題列 | padding 左右 `space-2`、上 `space-1`、下 `space-2`；Sparkles `icon-sm` `brand-violet`＋`title-sm`；右側 SegmentedControl sm「全部｜需處理」，預設「全部」；「需處理」只留 ESCALATE、BUG、BLOCKED、LIMIT、TIMEOUT、STOP（danger／warn 類），純前端過濾、不改 API；過濾後空時 EmptyState inline「沒有要處理的事 ✨」 |
| loading | 3 組 Skeleton：組頭一條 `skeleton-label`＋兩條高 `bar`、`radius-lg` |
| 失敗 | Banner warn sm「暫時拿不到活動」＋重試 |
| 空 | EmptyState inline 🍵 |
| < lg | 只顯示最新 5 則（分組後），底部 Button outline 滿寬「看全部活動（N）」 |
| 狀態 | 容器不可互動 |
| 亮暗差異 | — |

### 6.22 ActivityGroup

| 項目 | 規格 |
|---|---|
| 分組 | 新到舊，相鄰且同 `project/taskDir` 併一組 |
| 組頭 | 連到任務；padding `space-2`＋`inset-y-xs`；`stack-sm`；`radius-lg`；任務 short `caption-bold` `foreground`＋`· project` `caption` `muted-foreground`＋右側最新相對時間 `caption` `+num` `muted-foreground` |
| 組身 | 左移 `timeline-indent`；左線 `border-w-strong` `border`；`timeline-pad`；項之間 `stack-2xs` |
| 收合 | 組內 > 4 則：只顯示前 3 則＋「再看 N 則」`caption-strong` `primary`，原地展開 |
| hover | 組頭 `hover-fill` |
| focus-visible | 組頭 `focus-ring-inset` |
| 亮暗差異 | — |

### 6.23 ActivityItem

| 項目 | default（成員訊息） | compact（leader／process 事件） |
|---|---|---|
| Padding | `space-2`＋`inset-y-sm` | `space-2`＋`inset-y-xs` |
| Gap | `stack-md` | 同 |
| 圓角 | `radius-lg` | 同 |
| 前置 | Avatar | 不顯示頭像；`dot-sm` `status-idle` 對齊時間線 |
| 第一行 | actor `body-strong` `truncate`＋type Tag＋右側相對時間 `caption` `muted-foreground`（組內第一則不重複時間） | 省略 actor，直接 type Tag＋text 第一行 |
| text | `body` `muted-foreground`，最多 2 行，`title` 帶全文 | 同 |
| default | 透明底 | 同 |
| hover | `hover-fill` | 同 |
| active | — | — |
| focus-visible | `focus-ring-inset` | 同 |
| disabled | — | — |
| 亮暗差異 | — | — |

### 6.24 TaskRow

| 項目 | 規格 |
|---|---|
| 容器 | `radius-lg` `bg muted` `inner-pad`，直排 `stack-sm`；不加陰影 |
| 第一行 | 任務名 `body-strong`（連結 `hover-link`）＋StatusPill sm＋計數 Tag（> 0 才顯示）＋右側 `caption` `muted-foreground`（`波 2 進行中 · 已 18 分`），`stack-sm` |
| 第二行 | ProgressBar（§6.8） |
| 第三行 | 成員 StatusPill，`stack-xs`；blocked 成員用 tone danger，不另加 ring |
| 警示 | 有警示列底 `status-warn-soft`；有 blocked 成員 `status-danger-soft`；**列本身不加 ring**（外層 ProjectCard 已有） |
| 狀態 | 列本身不可點；名稱連結 `focus-ring` |
| 亮暗差異 | — |

### 6.25 Tooltip／Popover／HoverCard

| 項目 | Tooltip | Popover／HoverCard |
|---|---|---|
| Padding | `inset-control-sm`＋`inset-y-sm` | `card-pad-sm` |
| 圓角 | `radius-lg` | `radius-xl` |
| 底／分層 | `bg popover`＋`shadow-pop`，不加框 | 同 |
| 文字層級 | `caption`；數值 `caption-strong` `+num` | `body` |
| z | `z-popover` | 同 |
| 狀態 | 由觸發元件的 hover／focus 開啟 | 內部控制件照各自規格 |
| 亮暗差異 | `popover` 暗色比 card 亮一階 | 同 |

### 6.26 WaveRow（任務頁波次時間軸）

| 項目 | 已關閉／未開始 | 進行中 |
|---|---|---|
| 尺寸 | 高 `row` | 自然高 |
| Padding | `inset-control-md` | `card-pad-sm` |
| Gap | `stack-md` | 直排 `space-3.5`；頂列 `stack-md` |
| 圓角／底 | `radius-lg` `bg muted`，無框（取代 `border` 框） | 同 |
| 內容 | 波號 `body-bold`＋StatusPill sm（已關閉＋Check／未開始）＋成員 · 耗時 `body` `muted-foreground`＋右側 Tag（測試 ok、commit neutral mono） | 頂列：波號＋StatusPill sm 進行中＋成員＋右側耗時 `body-strong`；下：五步驟 |
| 步驟點 | — | `icon-xs` `radius-full`：完成 `bg status-ok`；進行中 `ring-step-current`；未到 `bg card`＋`border-w-strong` `input` |
| 步驟連線 | — | 高 `step-line-h` `radius-full`：完成段 `status-ok`、其餘 `input` |
| 步驟字 | — | 名稱 `body-bold`（未到 `muted-foreground`）；時間 `mono-sm` `muted-foreground`（進行中 `primary`）；與點 `stack-xs` |
| default | 已關閉收一行；未開始整列疊 `alpha-80` opacity | 只有進行中的波展開 |
| hover | 已關閉的波可點展開：`cursor`，底不變 | — |
| focus-visible | `focus-ring` | — |
| 亮暗差異 | — | — |

### 6.27 IdleProjectRow＋IdleProjectsCard

| 項目 | 規格 |
|---|---|
| 閒置判定 | 專案同時符合：沒有 running／planning 任務、沒有 blocked agent、沒有錯誤／過時。任一不符就留在活躍區畫 ProjectCard（有錯誤的專案不得收進閒置卡） |
| IdleProjectsCard | Card；區段標題 `title-sm`＋Tag 計數＋說明 `body` `muted-foreground` |
| 列 尺寸 | 高 `row` |
| 列 Padding | `inset-control-sm` |
| 列 Gap | `stack-lg` |
| 列 圓角 | `radius-lg` |
| 內容 | ChevronRight `icon-sm`（展開轉 90°）｜名稱 `body-strong`｜Tag 版本｜`已結案 N` `caption` `muted-foreground`｜session 點群（`dot`，最多 5 個＋`+N`，`stack-2xs`）｜右側最後結案 `mono-sm` `muted-foreground` |
| 展開區 | 列下方左縮 `indent-row`、下 `space-3`：原 ProjectCard 的已結案清單與其他 session（不畫縮圖） |
| default | 透明底；整列是 `button aria-expanded` |
| hover | `hover-fill` |
| active | 展開：箭頭旋轉，`motion-colors` |
| focus-visible | `focus-ring-inset` |
| disabled | — |
| 亮暗差異 | — |

### 6.28 ProjectCard

| 項目 | 規格 |
|---|---|
| 容器 | Card default（§6.10）；依最高嚴重度 `ring-alert-danger`／`ring-alert-warn` |
| Header | CardTitle（專案名）＋Tag（版本）＋CardAction（計數 Tag，0 不顯示） |
| 任務 | TaskRow ×n，`stack-sm` |
| 縮圖 | 只畫 working／blocked pane（`mono-terminal` 11px、最後 `thumb-lines` 10 行，寬跟卡片）：PaneThumb 格 `grid-cols-1 sm:grid-cols-2`、`stack-lg`；閒置 pane 只留 StatusPill（hover 出 PaneHover） |
| 其他 session | `caption-strong` `muted-foreground` 標籤＋StatusPill，`stack-sm`；右側「已結案 N 件」連結 `hover-text` |
| 錯誤 | Banner danger sm（在 Header 下） |
| 狀態 | 卡本身不可點 |
| 亮暗差異 | — |

### 6.29 PaneThumb（總覽縮圖）

| 項目 | 規格 |
|---|---|
| 容器 | `radius-md` `overflow-hidden` `bg terminal-bg` |
| 標題列 | 高 `pill`；`bg terminal-chrome`；padding 左右 `space-2`；`micro` `terminal-fg`＋StatusPill sm（終端內規格） |
| 內容 | `mono-terminal` `terminal-fg`；最後 `thumb-lines` 行，高 `thumb-h` |
| hover | 出 PaneHover（Popover 樣式） |
| focus-visible | `focus-ring` |
| 亮暗差異 | 不跟主題（終端固定黑底） |

### 6.30 Skeleton

| 項目 | 規格 |
|---|---|
| 圓角 | `radius-lg`；形狀對齊最終版面（SummaryTile `tile-h` `radius-xl`、卡 `chart-h-md` `radius-xl`） |
| 色 | `bg muted` |
| 狀態 | `motion-pulse`＋`motion-reduce` |
| 亮暗差異 | — |
