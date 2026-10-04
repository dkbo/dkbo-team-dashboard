# Components

全部用 `tokens.md` 的 token 表示。「亮暗差異」欄沒寫的，表示只靠 token 自動切換、沒有額外規則。
建議位置：共用元件放 `apps/web/src/components/app/`，shadcn 原子元件（`components/ui/`）只改 radius／字重這類 token 層面的東西。

共同互動狀態（各元件沒特別寫就照這個）：

| 狀態 | 規則 |
|---|---|
| hover | `transition-colors duration-150`；可點的列／項 `hover:bg-muted`（在 muted 底上的改 `hover:bg-card`）；文字連結 `hover:text-foreground` |
| active（按下） | `active:translate-y-px`（按鈕類）；選中態另見各元件 |
| focus-visible | `outline-none ring-3 ring-ring/50`；在漸層卡上 `ring-white/70`；清單項用 `ring-inset` 避免被父層裁掉 |
| disabled | `opacity-50 pointer-events-none`，不改色相 |
| cursor | 可點元素 `cursor-pointer` |

---

## 1. TopBar

全站頂部列，`sticky top-0 z-20`。

| 部位 | 規格 |
|---|---|
| 外框 | 滿版 `h-14 bg-background/80 backdrop-blur shadow-soft`；內容 `mx-auto max-w-page px-4 lg:px-6 flex items-center gap-4` |
| 左：Logo | lucide `Cloud` `size-6 text-brand-blue fill-brand-violet/30` ＋「dkbo 儀表板」`text-base font-extrabold`；整塊連到 `/` |
| 左：導覽 | `nav` 內 5 個 NavLink：`h-8 px-3.5 rounded-full text-sm font-semibold`；未選 `text-muted-foreground hover:bg-muted hover:text-foreground`；選中 `bg-primary text-primary-foreground shadow-soft`（維持 cuteui 裁定 3：實心表示選中） |
| 中：狀態群 | `flex-1 flex items-center gap-2 min-w-0 overflow-hidden`，依嚴重度排序：卡住（StatusPill danger＋數字，連 herdr）→ 熔斷（**StatusPill warn**：`agy 熔斷 · 5 天 20 小時`）→ 額度（UsageChip）。超出寬度的收成一顆 `+N` Tag，hover 出 HoverCard 列全部 |
| UsageChip | `h-6 rounded-full border-[1.5px] px-2.5 text-xs`：kind `font-semibold` ＋ `5h 37%` ＋ `週 25%`（`tabular-nums text-muted-foreground`）；任一值 ≥ 80% 時整顆改 warn（`border-status-warn text-status-warn-fg`）；正常 `border-brand-blue/70` |
| 右：連線 | 一顆 ConnectionChip 取代兩顆燈：`h-6 rounded-full bg-muted px-2.5 text-xs`，兩個 `size-2` 點（SSE、herdr；ok／warn(polling)／danger(斷)／idle(未知)）＋「SSE · herdr」；Tooltip 說明各自狀態 |
| 右：最後更新 | `text-xs text-muted-foreground tabular-nums`（< xl 隱藏，進 ConnectionChip tooltip） |
| 右：通知、主題 | icon button `size-8 rounded-full`（Button ghost icon） |

響應：
- ≥ xl：單列（56）。
- lg–xl：最後更新收進 tooltip；狀態群超出收 `+N`。
- < lg（含 390）：兩列。第一列 Logo＋狀態摘要膠囊（最嚴重的一顆，例 `⚠ 2 熔斷`，點開 Popover 列全部）＋通知＋主題；第二列導覽 `overflow-x-auto no-scrollbar`、不換行、選中項 `scrollIntoView`。`--topbar-h` 由 ResizeObserver 寫入。

亮暗：暗色 `bg-background/80` 與陰影 `--soft-shadow`（暗 0.55）已足夠分層，不加邊線。

---

## 2. PageHeader

| prop | 值 |
|---|---|
| `size` | `default`（內容頁）｜`compact`（工具頁） |
| `icon` | lucide 元件（只 default 用） |
| `title` | 字串（渲染成 h1） |
| `subtitle` | ReactNode，一行 |
| `meta` | ReactNode，標題右邊緊貼的 StatusPill（任務頁） |
| `actions` | ReactNode，右側工具列 |

| 部位 | default | compact |
|---|---|---|
| 容器 | `flex flex-wrap items-center gap-x-4 gap-y-3` | `flex h-10 items-center gap-3` |
| 圖示塊 | `size-10 rounded-lg bg-accent text-accent-foreground grid place-items-center`，icon `size-5` | — |
| 標題 | `text-2xl font-extrabold tracking-tight` | `text-lg font-extrabold` |
| 副標 | 標題下一行 `text-sm text-muted-foreground truncate` | 同列，前面 `·`，`text-sm text-muted-foreground truncate` |
| 工具列 | `ml-auto flex flex-wrap items-center gap-2` | `ml-auto flex items-center gap-2`，元件 `size="sm"` |
| < sm | 工具列換到下一列、靠左、可橫捲 | 副標隱藏（改放 `title` 屬性） |

Breadcrumb（只有任務頁）：在 PageHeader 上方 `gap-2`，`text-sm text-muted-foreground`，分隔 lucide `ChevronRight size-3.5`，最後一段 `text-foreground font-semibold font-mono truncate`。

---

## 3. SummaryTile

| prop | 值 |
|---|---|
| `variant` | `ok`｜`warn`｜`danger`｜`brand`｜`quiet` |
| `icon` | lucide（Rocket／Coins／Siren／Gauge） |
| `label`、`value`、`children`（副行） | |
| `href` | 有就整張是 Link |

| 部位 | 規格 |
|---|---|
| 容器 | `relative isolate flex min-h-32 flex-col gap-1 overflow-hidden rounded-xl p-5`；手機（< sm）`min-h-28 p-4` |
| 漸層 variant | `bg-linear-to-br from-(--grad-X-from) to-(--grad-X-to) text-white shadow-pop` |
| quiet variant | `bg-card text-card-foreground shadow-soft`；label `text-muted-foreground`；value `text-muted-foreground`（**不**用大紅大綠）；裝飾圖示 `text-status-idle opacity-15` |
| label | `text-sm font-bold`（漸層上白、quiet 上 muted） |
| value | `text-3xl font-extrabold tabular-nums`；手機 `text-2xl` |
| 副行 | `mt-auto text-sm font-medium`，最多 2 行（`line-clamp-2`）；quiet 的好消息（「大家都很順 ✨」）用 `text-status-ok-fg` |
| 裝飾圖示 | `absolute -right-5 -bottom-6 -z-10 size-28 -rotate-12 opacity-12`（手機 `size-18`），`aria-hidden` |
| 副行溢出 | 副行只留 1 行最重要的資訊（例「agy、codex · 最短還剩 5 天 20 小時」）；放不下就 `truncate`，不得把卡片撐高或被裁切 |
| hover（有 href） | `hover:-translate-y-0.5 hover:shadow-pop`；quiet 另加 `hover:bg-muted/40` |
| focus-visible | 漸層 `ring-3 ring-white/70`；quiet `ring-ring/50` |

對比：白字對各漸層 from ≥ 4.71（tokens §1.4）。暗色：quiet 卡在暗底上靠 `--card` 亮一階，不需加框。

總覽四張的內容見 README §2.4。

---

## 4. Card／ChartCard

### Card

| 部位 | 規格 |
|---|---|
| 容器 | `flex flex-col gap-4 rounded-xl bg-card p-5 text-sm text-card-foreground shadow-soft`；`size="sm"` 時 `p-4 gap-3` |
| CardHeader | `grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1` |
| CardTitle | `text-base font-bold leading-6`；可帶前置 icon（`size-4 text-brand-violet`） |
| CardDescription | `text-sm text-muted-foreground`（最多 2 行，超出放 Tooltip） |
| CardAction | 右上，放 Tag／Button sm／SegmentedControl sm |
| CardFooter | `-mx-5 -mb-5 mt-1 border-t bg-muted/50 px-5 py-3`（不再自己 `rounded-b-xl`，由容器 `overflow-hidden` 裁） |
| 警示外框 | `data-alert="danger"` → `ring-2 ring-status-danger`；`"warn"` → `ring-2 ring-status-warn`（取代 orange ring） |
| `variant="pane"` | 工具頁窗格：`p-0 gap-0 overflow-hidden`，頂端 PaneHeader `h-10 px-4 border-b text-sm font-bold flex items-center gap-2`（次要資訊 `font-medium text-muted-foreground`，右側 action），內容 `min-h-0 flex-1 overflow-auto` |
| 內層列 | 卡片裡的列（TaskRow、波次列）用 `rounded-lg bg-muted p-3`，**不加陰影、不加框** |

### ChartCard（Card 的變體）

| 部位 | 規格 |
|---|---|
| Header | CardTitle＋Description；右上 CardAction 放圖例切換或「顯示全部」 |
| 摘要列（可選） | header 下一行 `flex gap-4 text-sm`：關鍵數字 `font-bold tabular-nums`（例「5h —　週 預估 10-09 13:37 達 100%」） |
| 圖區 | `h-(--chart-h-md)`（預設 224）；小圖 `sm` 176、大圖 `lg` 256；水平長條圖高 = `max(176, 列數×28+64)`，**上限 15 列**，超過顯示「顯示全部 N 件」Button ghost sm |
| 圖例 | 圖區下方 `flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground`，色塊 `size-2.5 rounded-full` |
| 軸 | `tickLine=false axisLine=false`，字 12 `var(--muted-foreground)`；格線 `var(--border)` `strokeDasharray="3 3"` |
| Bar 圓角 | 末端 `radius=4`（recharts px，維持現值） |
| Tooltip | Popover 樣式：`rounded-lg bg-popover shadow-pop px-3 py-2 text-xs`；數值 `font-semibold tabular-nums` |
| **empty** | 不畫軸與格線；Card 收成 `min-h-36`，Header 保留，內容換成 `EmptyState size="inline"`（見 §10）；與同列的非空卡 `items-start` 頂端對齊，不被拉高 |
| loading | 圖區換成 `Skeleton rounded-lg h-(--chart-h-md)` |

---

## 5. StatusPill／Tag

### StatusPill — 有「狀態」意義的膠囊

| prop | 值 |
|---|---|
| `tone` | `danger`｜`warn`｜`ok`｜`idle`｜`info` |
| `size` | `default`（h-6）｜`sm`（h-5） |
| `dot` | 預設有點；`ok`+完成時用 `Check` 圖示；idle 結案用 `Check`，abandoned 用 `Ban` |
| `note` | 尾端次要字 |

| 部位 | default | sm |
|---|---|---|
| 容器 | `inline-flex h-6 items-center gap-1.5 rounded-full border-[1.5px] bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap` | `h-5 px-2 gap-1 text-2xs` |
| 色 | `border-status-X text-status-X-fg` | 同 |
| 點 | `size-1.5 rounded-full bg-status-X`；working／blocked `animate-pulse motion-reduce:animate-none` | `size-1.5` |
| note | `font-medium opacity-75` | 不顯示 |
| 可點時 | `hover:bg-status-X-soft` | 同 |

對照（取代現在的 TONE_CLASS）：

| 現 status | tone | 文字 |
|---|---|---|
| working | ok | 工作中 |
| blocked | danger | 卡住 |
| idle | idle | 閒置 |
| done（agent） | ok + Check | 完成 |
| unknown／無 pane | idle（框線 `border-dashed`） | 不明／無 pane |
| 任務 running | ok | 進行中 |
| 任務 planning | info | 規劃中 |
| 任務 done | idle + Check | 已完成 |
| 任務 abandoned | idle + Ban，`line-through` | 已放棄 |
| kind 熔斷 | warn | `codex 熔斷 · 7 天 6 小時` |

在終端（herdr pane 標題列、縮圖）裡：外框改 `bg-white/5`，色仍用暗色版 token（終端區加 `.dark` class，照現況）。

### Tag — 沒有狀態意義的標籤

| variant | 規格 | 用在 |
|---|---|---|
| `neutral` | `h-5 rounded-full bg-muted px-2 text-2xs font-semibold text-muted-foreground` | 版本 `v0.19.0`、專案名、遠端分支、「相容模式」 |
| `brand` | `bg-accent text-accent-foreground` | git 版本 tag（＋`Tag` icon `size-3`）、檔位 `L · opus/high` |
| `info` | `bg-status-info-soft text-status-info-fg` | 活動 type（spawn、review、wave-open、ruling…）、`HEAD → master` |
| `ok`／`warn`／`danger` | `bg-status-X-soft text-status-X-fg` | 活動 type 好／壞消息；計數（`ESCALATE 2` warn、`BLOCKED 1` danger）；git「乾淨」ok、「3 改動」warn、「衝突」danger |
| `mono` | 任一 variant 加 `font-mono font-normal` | hash、kind |

規則：**StatusPill 有框無底（在講現在的狀態）；Tag 有底無框（在講分類或計數）。** 兩者不混用。計數為 0 時不渲染 Tag。

活動 type → Tag variant：DONE、FIXED、dev-done、wave-close、gate3、task-close → ok；ESCALATE、LIMIT、TIMEOUT、timeout → warn；BUG、BLOCKED、STOP → danger；其餘 → info。

---

## 6. Table

| 部位 | default | dense |
|---|---|---|
| 外框 | 放在 Card 內：Card `p-0`，Header 區 `px-5 pt-5`，表格滿卡寬、左右 cell 第一／最後欄 `pl-5`／`pr-5` | 同 |
| 表頭列 | `h-10 border-b`；th `px-3 text-left text-xs font-bold text-muted-foreground whitespace-nowrap`；數字欄 `text-right` | `h-9` |
| 列 | `h-11 border-b border-border last:border-0`；td `px-3 text-sm align-middle` | `h-9`，td `text-sm` |
| 多行內容列 | `align-top py-3`（成員表的「目前」「待辦」） | — |
| 數字欄 | `text-right tabular-nums`；0／空值 `text-muted-foreground`（金額 0 → `—`） | 同 |
| mono 欄 | hash／時間／dir：`font-mono text-xs text-muted-foreground` | 同 |
| 主名稱欄 | `font-semibold`，連結 `hover:text-primary hover:underline underline-offset-4` | 同 |
| hover | 整列 `hover:bg-muted/60`；整列可點時 `cursor-pointer`，focus 落在主名稱連結上 | 同 |
| 選中 | `bg-accent/60` | 同 |
| sticky 表頭 | 長表（> 20 列）`sticky top-(--topbar-h) bg-card z-10` | 同 |
| 空 | 一列 `colSpan` → `EmptyState size="inline"` | 同 |
| < md | 寬表改卡片清單（照 TierAnalysis 現在的做法）：每列一個 `rounded-lg bg-muted p-3`，`dl grid-cols-2 text-xs` | — |

亮暗：暗色列線 `--border`（10% 白）偏淡，表頭下線改 `border-b-2` 讓欄頭分得出來。

歷史表欄位（建議，見 open-questions Q7）：專案（Tag neutral）｜任務（主名稱）｜狀態（StatusPill sm）｜結案（mono）｜耗時｜波數｜檔位（Tag brand mono）｜審查（`9/6 · m5 · r1`＝裁定/自主 · minor · 重審，tabular；表頭 Tooltip 解釋縮寫）｜花費。

---

## 7. SidebarList（herdr／git 左欄）

放在 `Card variant="pane"` 內，可多段。

| 部位 | 規格 |
|---|---|
| 容器 | `flex flex-col gap-0.5 p-2`，自己捲 `overflow-y-auto` |
| 段標題 | `px-3 pt-3 pb-1 text-xs font-bold text-muted-foreground`，右側可放數字 Tag；段之間 `border-t mt-2 pt-2` |
| 項目 | `button`／`a`：`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm` |
| 前置 | 編號（`w-4 text-right text-xs text-muted-foreground tabular-nums`）或狀態點（`size-2 rounded-full bg-status-X`） |
| 主文字 | `min-w-0 flex-1`：第一行 `truncate font-semibold`；第二行（可選）`truncate text-xs text-muted-foreground`，可內嵌 Tag／mono 分支 |
| 尾端 | Tag、`Eye`（herdr 目前所在）`size-3.5 text-muted-foreground`、計數 |
| hover | `hover:bg-muted` |
| 選中 | `aria-selected=true` → `bg-accent text-accent-foreground`，第二行 `text-accent-foreground/80`；**不用**左側色條 |
| focus-visible | `ring-3 ring-inset ring-ring/50` |
| disabled／錯誤項 | 第二行換成 `text-status-danger-fg` 的錯誤文字，項目仍可選 |
| 底部說明 | 不放在 sidebar（搬到 PageHeader 副標／`?` popover） |

herdr agents 段排序：blocked → working → idle → 其他，同狀態依名稱。

---

## 8. ActivityItem／ActivityGroup（總覽活動欄）

ActivityRail：`rounded-xl bg-card p-3 shadow-soft`，標題列 `px-2 pt-1 pb-2 text-base font-bold`（`Sparkles size-4 text-brand-violet`）＋右側 SegmentedControl sm「全部｜需處理」（open-questions Q6）。lg 以上 `sticky top-[calc(var(--topbar-h)+1.5rem)] max-h-[calc(100svh-var(--topbar-h)-3rem)] overflow-y-auto`。

### ActivityGroup（同一任務、連續的事件）

| 部位 | 規格 |
|---|---|
| 分組規則 | 依時間新到舊，相鄰且同 `project/taskDir` 的項目併成一組；組間 `gap-3` |
| 組頭 | `Link` 到任務：`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs`：任務 short `font-bold text-foreground` ＋ `· project` `text-muted-foreground` ＋ 右側最新相對時間 `tabular-nums text-muted-foreground`；hover `bg-muted` |
| 組身 | `ml-4 border-l-2 border-border pl-3 flex flex-col gap-1`（左側細時間線） |
| 收合 | 組內 > 4 則：只顯示前 3 則＋「再看 N 則」`text-xs font-semibold text-primary`（展開在原地） |

### ActivityItem

| 部位 | default（成員訊息） | compact（leader／process 事件） |
|---|---|---|
| 容器 | `flex gap-2.5 rounded-lg px-2 py-2 hover:bg-muted` | 同，`py-1.5` |
| 頭像 | `size-6 rounded-full text-sm`，emoji＋固定底色（avatar.ts 不動） | **不顯示**（leader 事件不重複 👑）；改 `size-1.5` 點 `bg-status-idle`，對齊在時間線上 |
| 第一行 | actor `text-sm font-semibold truncate` ＋ type Tag（§5 對照）＋ 右側相對時間 `text-xs text-muted-foreground`（組內第一則不重複顯示時間，組頭已有） | actor 省略（組頭隱含 leader），直接 type Tag ＋ text 第一行 |
| text | `text-sm text-muted-foreground line-clamp-2 break-words`，`title` 帶全文 | 同 |
| focus-visible | `ring-3 ring-inset ring-ring/50` | 同 |

截斷：text 仍 2 行，但因為拿掉了重複的「專案 · 任務」行與 👑 頭像，每則高度約 56 → 可見則數約 ×1.6。

狀態：
- loading：3 組骨架（`Skeleton h-4 w-24` 組頭＋兩條 `h-10 rounded-lg`）。
- 失敗：`Banner tone="warn" size="sm"`「暫時拿不到活動」＋重試（warn 而非 danger：不影響其他資料）。
- 空：`EmptyState size="inline"` 🍵「還沒有新動態，喝口茶吧」。

手機（< lg）：只顯示最新 5 則（分組後計），底部 Button outline 全寬「看全部活動（N）」展開。

---

## 9. Banner

取代各頁自寫的錯誤條（OverviewPage、TaskPage、HistoryPage、TrendsPage、HerdrPage、GitPage 的 ErrorBar、ActivityRail error、ProjectCard error）。

| prop | 值 |
|---|---|
| `tone` | `danger`｜`warn`｜`info`｜`ok` |
| `size` | `default`｜`sm` |
| `title` | 粗體一句 |
| `children` | 細節（可含 mono 錯誤訊息） |
| `action` | 通常是「重試」Button |
| `onDismiss` | 可選 |

| 部位 | default | sm |
|---|---|---|
| 容器 | `role="alert"`（danger／warn）或 `role="status"`；`flex items-start gap-3 rounded-xl bg-status-X-soft p-3 text-sm`；左側 `border-l-4 border-status-X` **不用**（圓角卡＋左粗線不搭），改圖示 | `rounded-lg px-3 py-2 gap-2` |
| 圖示 | `size-5 shrink-0 text-status-X-fg`：danger `CircleAlert`、warn `TriangleAlert`、info `Info`、ok `CircleCheck` | `size-4` |
| 文字 | title `font-bold text-status-X-fg`；細節 `text-foreground/80`，錯誤原文 `font-mono text-xs break-all` | 只有 title |
| action | 右側 `Button size="sm" variant="outline"`，框色 `border-status-X/60` | `size="xs"` |
| dismiss | `X` icon button `size-7 rounded-full` | 同 |

語意（統一文案）：

| 情境 | tone | title |
|---|---|---|
| 沒有任何資料可顯示（首次載入失敗） | danger | 載入失敗 |
| 有舊資料、這次更新失敗 | **warn** | 更新失敗，顯示的是舊資料 |
| herdr 改為輪詢 | warn | herdr 訂閱斷線，每 5 秒輪詢中 |
| 專案 dk-status 錯誤（ProjectCard 內） | danger `size="sm"` | 路徑不存在／dk-status 逾時… |
| 活動欄拿不到 | warn `size="sm"` | 暫時拿不到活動 |

位置：內容頁在 PageHeader 下、第一個區塊上；工具頁在 PageHeader 下、窗格上（不再貼窗格頂邊）。

---

## 10. EmptyState

| prop | 值 |
|---|---|
| `size` | `page`｜`inline` |
| `icon` | emoji 或 lucide |
| `title`、`hint`、`action` | |

| 部位 | page | inline |
|---|---|---|
| 容器 | `flex flex-col items-center gap-3 py-12 text-center` | `flex flex-col items-center gap-2 py-6 text-center`（ChartCard 空：在 `min-h-36` 卡內垂直置中） |
| 圖示圓 | `size-16 rounded-full bg-accent grid place-items-center text-3xl`（emoji）或 lucide `size-7 text-accent-foreground` | `size-10 rounded-full bg-muted text-xl`／lucide `size-5 text-muted-foreground` |
| 標題 | `text-base font-bold` | `text-sm font-semibold` |
| 提示 | `text-sm text-muted-foreground max-w-sm` | `text-xs text-muted-foreground` |
| action | Button outline sm | 不放（或文字連結） |

文案（可愛但具體，一律說「為什麼空」＋「什麼時候會有」）：

| 地方 | icon | 標題 | 提示 |
|---|---|---|---|
| 趨勢全頁 | 📈 | 還沒有趨勢資料 | dashboard 開著時每分鐘記錄一次 |
| 額度圖（某 kind） | `Gauge` | 這段期間沒有 agy 額度資料 | 換個時間區間，或等 agy 下次回報 |
| ctx 圖 | `Cpu` | 這段期間沒有 ctx 資料 | — |
| 每日花費 | `Coins` | 這段期間沒有花費 | — |
| 歷史表（篩選後） | 🔍 | 沒有符合條件的已結案任務 | 清除篩選（文字連結） |
| 專案沒有進行中任務 | （不顯示 EmptyState，專案進「閒置專案」） | | |
| herdr 沒有 space | 🫥 | herdr 目前沒有任何 space | — |
| git 找不到專案 | `FolderX` | 找不到專案 {name} | — |
| 活動欄 | 🍵 | 還沒有新動態，喝口茶吧 | — |

亮暗：圖示圓 `bg-accent`（亮淡紫／暗深紫），不需另寫。

---

## 11. SegmentedControl（時間區間、任務 Tabs、herdr tab 列）

| prop | 值 |
|---|---|
| `size` | `default`｜`sm` |
| `items` | `{ value, label, count? }[]` |
| `value`、`onChange` | |
| 語意 | 切換「視圖」用 `role="tablist"`＋`aria-selected`；切換「參數」（趨勢區間）用 `role="group"`＋`aria-pressed`（照現況） |

| 部位 | default | sm |
|---|---|---|
| 外框 | `inline-flex h-9 items-center gap-0.5 rounded-full bg-muted p-1` | `h-8 p-0.5` |
| 項目 | `h-7 rounded-full px-3.5 text-sm font-semibold text-muted-foreground` | `h-7 px-3 text-xs` |
| count | 項目內 `ml-1 text-xs tabular-nums opacity-70` | 同 |
| hover | `hover:text-foreground` | 同 |
| 選中 | `bg-card text-foreground shadow-soft` | 同 |
| focus-visible | `ring-3 ring-ring/50`（項目自己） | 同 |
| disabled 項 | `opacity-50` | 同 |
| 鍵盤 | ← → 移動、Home／End；tablist 時 roving tabindex | 同 |
| 溢出 | 項目過多（任務 Tabs 在手機）時外框 `max-w-full overflow-x-auto` | 同 |

亮暗：暗色 `bg-muted`（#31356a）上的選中項 `bg-card`（#282b55）比外框**暗**，所以暗色選中項改 `dark:bg-secondary`（#353a6e）＋ `shadow-soft`，確保選中比外框亮一階。

---

## 12. 其他

### Button

沿用 shadcn button 的 variant，改 token 層：全部 `rounded-full`；尺寸 `xs h-6 px-2.5 text-xs`／`sm h-7 px-3 text-sm`／`default h-8 px-4 text-sm`／`lg h-9 px-5`；`font-semibold`。icon-only `size-8`（sm `size-7`）。漸層卡上的按鈕用 `bg-white/15 text-white hover:bg-white/25`。

### Field（Select、日期、搜尋）

`h-8 rounded-lg border border-input bg-card px-3 text-sm`（暗 `bg-input/30`）；label 在上 `text-xs font-semibold text-muted-foreground`，或在工具列裡用 `aria-label` 不顯示 label。focus `border-ring ring-3 ring-ring/50`。圓角用 lg 不用 full：日期輸入在膠囊裡會擠（open-questions Q5）。

### TaskRow（ProjectCard 內的進行中任務）

`rounded-lg bg-muted p-3 flex flex-col gap-2`（拿掉 `shadow-soft`）：
1. 第一行：任務名（`font-semibold hover:underline`）＋ StatusPill sm（running／planning）＋ 計數 Tag（只顯示 > 0）＋ 右側 `波 2 進行中 · 已 18 分` `text-xs text-muted-foreground`。
2. 進度：`h-1.5 rounded-full bg-card` 軌、`bg-primary` 填；右側 `1/3 波` `text-xs font-semibold tabular-nums`。
3. 成員膠囊：StatusPill（blocked 的不另加 ring，改 tone=danger 本身就夠）。
- 有警示：列底改 `bg-status-warn-soft`（有 blocked 成員時 `bg-status-danger-soft`），**列本身不加 ring**——外層 ProjectCard 已依最高嚴重度加 `ring-2`，兩層都框會變成雙紅框。

### IdleProjectRow（「閒置專案」卡內）

`flex h-11 items-center gap-3 rounded-lg px-3 hover:bg-muted`：
`ChevronRight size-4`（展開時轉 90°）｜專案名 `font-semibold`｜Tag `v0.19.0`｜`已結案 17` `text-xs text-muted-foreground`｜session 狀態點群（每個 pane 一個 `size-2` 點，最多 5 個＋`+N`）｜右側最後結案 `text-xs font-mono text-muted-foreground`。
展開：列下方 `pl-9 pb-3` 顯示原 ProjectCard 的已結案清單與其他 session（縮圖不顯示）。
整列是 `button aria-expanded`。

### Skeleton

`rounded-lg bg-muted animate-pulse`；形狀對齊最終版面（SummaryTile `h-32 rounded-xl`、卡 `h-56 rounded-xl`）。

### 縮圖（PaneThumb）

`rounded-md overflow-hidden bg-(--terminal-bg)`；標題列 `bg-(--terminal-chrome) px-2 h-6 text-2xs text-(--terminal-fg)`＋StatusPill sm；內容 `font-mono text-2xs leading-[1.2] text-(--terminal-fg)` 最後 10 行（`h-[calc(10*1.2em+0.5rem)]`）。只畫 working／blocked 的 pane（README §4.1）。
