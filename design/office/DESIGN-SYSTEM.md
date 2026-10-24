# dkbo 儀表板 Design System Spec：辦公室 /office（office）

一份交給 artifacts 與前端工程師的規格：新頁 `/office`（three.js 3D 辦公室，延遲載入）、它的清單退路，以及任務詳情成員表與 herdr 頁的「細狀態」顯示。

- **底層沿用 [`design/unify/DESIGN-SYSTEM.md`](../unify/DESIGN-SYSTEM.md)**（以下簡稱 unify）：顏色、字級、spacing、圓角、元件全部照 unify；本檔只寫 **新增** 的 token 與元件，以及 unify 元件在本頁的用法。兩邊衝突時，通用元件以 unify 為準，`/office` 專屬的東西以本檔為準。
- **機器可讀版**：`tokens.json`（只含本檔新增的 token）。
- **已定案的設計題**：`decisions.md`（Q1–Q15，2026-10-24 人回照建議）。本檔已照定案寫成確定規格。
- **稿與本檔衝突時以本檔為準。** 稿是 pen 畫的示意（俯視等角＋角色特寫），不是 3D 模型；中文字是系統黑體。
- 3D 素材：Kenney **Mini Characters**、**Furniture Kit**（CC0），放 `apps/web/public/office/kenney/`；three.js 與模型都在進 `/office` 時才 `import()`。

狀態欄縮寫：**new** 新增｜**reuse** 直接用 unify 的 token｜**changed** unify 既有元件在本頁改用法。

---

## How to use

1. **只用 unify＋本檔的 token。** 3D 場景的顏色也是 token：場景色（`scene-*`）寫成 CSS 變數，three.js 在掛載與主題切換時用 `getComputedStyle(document.documentElement).getPropertyValue('--scene-floor')` 讀出來設材質色，不在 JS 寫死 hex。
2. **狀態色只在兩個地方出現在 3D 裡：頭頂標記（DOM）與地面圈（3D 平面）。** 燈光、家具、牆、地板都不用 `status-*`。
3. **標記與區牌是 DOM，不是 3D 貼圖**（`CSS2DRenderer`）：吃 Tailwind class、亮暗自動換色、字清楚、可被報讀。
4. **亮暗同構**：亮暗只換 `scene-*` 的值與燈光參數（§1.5），場景結構、鏡頭、標記一樣。
5. 落地順序建議：① `index.css` 加 `scene-*` 變數與 `--hovercard-w`、`--marker-*`（§1.3、§3）→ ② 細狀態對照表（§1.2）做成 `features/office/substate.ts` 共用給 office／task／herdr → ③ 清單模式（不需 WebGL，先上線）→ ④ 3D 場景 → ⑤ 任務頁、herdr 頁改動。

### A. 給 artifacts：CSS variables（只列新增）

```css
:root {
  --scene-sky: #f5f6fe; --scene-floor: #dfe3f5; --scene-floor-edge: #c3c9e8;
  --scene-zone: #d3d9f1; --scene-zone-edge: #b6bde2; --scene-lounge: #ece6fb;
  --scene-wall-l: #ffffff; --scene-wall-r: #e9ecf9; --scene-wall-top: #c9cee9;
  --scene-window: #cfe0ff; --scene-desk: #f3e7d5; --scene-desk-side: #dccaae;
  --scene-monitor: #2b2e4c; --scene-screen-off: #4a4f78; --scene-screen-on: #a9c6ff;
  --scene-couch: #c4bdf0; --scene-plant: #8fb8a5; --scene-shadow: rgb(61 67 128 / 12%);
  --hovercard-w: 17.5rem; --marker-h: 1.5rem; --marker-alert-h: 1.75rem;
}
.dark {
  --scene-sky: #161935; --scene-floor: #2a2e5a; --scene-floor-edge: #1a1d3d;
  --scene-zone: #323668; --scene-zone-edge: #15183a; --scene-lounge: #332f63;
  --scene-wall-l: #363b74; --scene-wall-r: #2b2f62; --scene-wall-top: #454b8c;
  --scene-window: #0e1130; --scene-desk: #4c4675; --scene-desk-side: #3b3660;
  --scene-monitor: #1a1c33; --scene-screen-off: #2c2f52; --scene-screen-on: #7fa6ff;
  --scene-couch: #5a5296; --scene-plant: #4f7f6c; --scene-shadow: rgb(5 6 20 / 40%);
}
```

### B. 給 Tailwind v4（`apps/web/src/index.css`）

```css
@theme inline {
  --color-scene-sky: var(--scene-sky);   /* 只有 canvas 底與清單模式的空白 canvas 用得到 */
  --color-scene-floor: var(--scene-floor);
  /* 其他 scene-* 只給 three.js 讀，不必進 @theme */
  --width-hovercard: var(--hovercard-w); /* w-hovercard */
  --height-marker: var(--marker-h);      /* h-marker */
  --height-marker-alert: var(--marker-alert-h); /* h-marker-alert */
}
```

---

## 1. Color Tokens

### 1.1 沿用（reuse）

unify §1.1–1.8 全部沿用：`background`／`card`／`muted`／`popover`／`accent`、品牌三色、五個語意 `status-{danger,warn,ok,idle,info}` 各 `-fg`／`-soft`、`terminal-*`、`on-color`、alpha 階。**不新增任何狀態色。**

### 1.2 細狀態 → 語意色（new，`features/office/substate.ts`）

| 細狀態 key | 中文（StatusPill 文字） | tone | 圖示（lucide） | 標記樣式（§6.6） | 粗狀態 PaneStatus（現有） | 排序 |
|---|---|---|---|---|---|---|
| `waiting` | 等你（note：審批／提問） | **danger** | `Hand` | alert（實心紅） | `blocked` | 1 |
| `error` | 錯誤 | **danger** | `CircleAlert` | alert（實心紅） | `blocked`（見 decisions Q15） | 2 |
| `interrupted` | 中斷 | **warn** | `Square` | soft | `idle` | 3 |
| `running` | 執行 `<工具名>` | ok | `Terminal` | line（工具名 mono） | `working` | 4 |
| `writing` | 回覆中 | ok | `PencilLine` | line | `working` | 5 |
| `thinking` | 思考中 | ok | 三點（無圖示） | bubble | `working` | 6 |
| `done` | 完成 | ok＋Check | `Check` | soft | `done` | 7 |
| `idle` | 閒置 | idle | `Moon` | soft，**預設隱藏**（hover 才出） | `idle` | 8 |
| （無 session） | 無 session | idle（虛線框） | — | 不畫角色 | `unknown` | 9 |

- 判準沿用 unify §1.4：**danger＝不處理就停在那裡**（等你、錯誤）；warn＝這輪沒做完但可晚點處理（中斷）；ok＝正在動／剛完成；idle＝沒在動。
- **ok 的三種（執行、回覆、思考）不用顏色區分**，靠圖示、文字與角色動作區分（decisions Q1）。
- 計時：`waiting` 顯示「已等 mm:ss」、其他進行中狀態顯示「本輪 mm:ss」、`done`／`interrupted` 顯示「N 分前」、`idle` 顯示「閒置 N 分」。
- 自動轉換：`done`、`interrupted` 10 分鐘無新事件 → `idle`；`idle` 超過 2 小時 → 「下班」（不畫角色，只計數；decisions Q8）。

### 1.3 場景色 `scene-*`（new，three.js 材質用）

| token | CSS 變數 | 亮 | 暗 | 用在 |
|---|---|---|---|---|
| `scene-sky` | `--scene-sky` | `#f5f6fe` | `#161935` | canvas 背景（`scene.background`）、霧色 |
| `scene-floor` | `--scene-floor` | `#dfe3f5` | `#2a2e5a` | 地板 |
| `scene-floor-edge` | `--scene-floor-edge` | `#c3c9e8` | `#1a1d3d` | 地板厚度側面 |
| `scene-zone` | `--scene-zone` | `#d3d9f1` | `#323668` | 專案區、散座區地毯（**全部同色**，不按專案上色） |
| `scene-zone-edge` | `--scene-zone-edge` | `#b6bde2` | `#15183a` | 地毯邊、地板右側面 |
| `scene-lounge` | `--scene-lounge` | `#ece6fb` | `#332f63` | 休息區地毯 |
| `scene-wall-l`／`-r`／`-top` | `--scene-wall-*` | `#ffffff`／`#e9ecf9`／`#c9cee9` | `#363b74`／`#2b2f62`／`#454b8c` | 左牆、後牆、牆頂 |
| `scene-window` | `--scene-window` | `#cfe0ff` | `#0e1130` | 窗玻璃（暗色加零星星點貼圖） |
| `scene-desk`／`-side` | `--scene-desk*` | `#f3e7d5`／`#dccaae` | `#4c4675`／`#3b3660` | 桌面、桌側（Kenney 木紋材質的 `color` 乘色） |
| `scene-monitor` | `--scene-monitor` | `#2b2e4c` | `#1a1c33` | 螢幕外殼 |
| `scene-screen-off` | `--scene-screen-off` | `#4a4f78` | `#2c2f52` | 螢幕暗（閒置、完成、下班） |
| `scene-screen-on` | `--scene-screen-on` | `#a9c6ff` | `#7fa6ff` | 螢幕亮（`emissive`，§1.5）；暗色桌前地面光暈 |
| `scene-couch` | `--scene-couch` | `#c4bdf0` | `#5a5296` | 沙發、休息區圓地毯（疊 35%） |
| `scene-plant` | `--scene-plant` | `#8fb8a5` | `#4f7f6c` | 盆栽葉（刻意去飽和，避免被讀成 ok 綠） |
| `scene-shadow` | `--scene-shadow` | `rgb(61 67 128 / 12%)` | `rgb(5 6 20 / 40%)` | 角色腳下接觸陰影（貼圖圓，不是即時陰影） |

規則：
- 專案區**不用類別色區分**（顏色只講狀態）；用牆上的區牌（§6.7）區分。
- Kenney 模型保留自己的貼圖，只對家具材質乘 `scene-desk*`、`scene-couch`，讓亮暗兩套跟頁面同一個色調；角色衣服用 Kenney 原色（身分＝可愛的地方，unify 原則 1）。

### 1.4 地面圈（new，3D 平面，顏色取 status token）

| token | 規格 | 用在 |
|---|---|---|
| `ring-alert` | 內圈半徑 0.62 格、線寬 0.06 格、`status-danger`；外圈 0.95 格、`status-danger` 40%；底 `status-danger` 14% 實心圓 | `waiting`（外圈脈動 `motion-alert-pulse`）、`error`（不脈動） |
| `ring-select` | 半徑 0.62 格、線寬 0.1 格、`ring`（`brand-violet`） | 目前選取的人（與 `ring-alert` 同時存在時畫在其內側 0.5 格） |
| `screen-glow` | 半徑 1.1 格、`scene-screen-on` 16%，只在暗色 | 螢幕亮著的桌前地面光暈 |

地面圈 `depthWrite: false`、`renderOrder` 高於地板；顏色在主題切換時重讀 CSS 變數。

### 1.5 燈光（new，數值 token，給 three.js）

| token | 亮 | 暗 |
|---|---|---|
| `light-hemi`（sky／ground／intensity） | `#ffffff`／`scene-floor`／0.9 | `#8fa8ff`／`#1a1d3d`／0.35 |
| `light-key`（color／intensity／方向） | `#fff4e5`／1.2／左上後方 (-5, 10, 4) | `#b9c6ff`／0.4／同方向（月光） |
| `light-key-shadow` | `castShadow`，map 1024，PCFSoft，只有桌子與角色投影 | 同 |
| `screen-emissive` | `scene-screen-on`，emissiveIntensity 0.4 | 0.9 |
| `theme-lerp` | 主題切換時顏色與強度 400ms 線性過渡；`prefers-reduced-motion` 直接切 | 同 |

暗色**不用真的 PointLight**（每桌一顆會掉幀），用 `screen-glow` 貼圖＋螢幕 emissive 表現「誰在工作」。

---

## 2. Typography（字型、字級、字重與用途）

**不新增字級角色**，全部用 unify §2.2。本頁用法：

| 東西 | 角色 | 備註 |
|---|---|---|
| PageHeader（compact）標題「辦公室」 | `title-md` | 工具頁骨架 |
| 標記 一般（line／bubble／soft） | `caption-strong`；工具名 `caption-strong` `+mono` | 最多 12 字，超過 `…` |
| 標記 alert（等你、錯誤） | `body-bold` | 唯一比膠囊大的標記 |
| 區牌 | 專案名 `caption-bold`＋任務 · 波 `micro` `muted-foreground` | — |
| NeedsYou／SessionRow 名字 | `body-strong` | — |
| NeedsYou／SessionRow 第二行 | `caption` `muted-foreground` | danger 計時 `caption-strong` `status-danger-fg` |
| 工具參數行 | `mono-2xs`（清單）／`mono-sm`（詳情、hover） | `truncate`＋`title` |
| 計時 | `caption-strong` `+num`；詳情窗「已等 3 分 12 秒」`body-bold` | `mm:ss`，≥ 1 小時「1 時 05 分」 |
| 詳情窗名字 | `title-sm` | — |
| resume 指令 | `mono-sm` | — |
| canvas 操作提示 | `caption` `muted-foreground` | 鍵盤使用者看得到同一行（不是只在 hover） |

---

## 3. Spacing、圓角、Border

沿用 unify §3。新增尺寸 token：

| token | CSS 變數 | Tailwind | 值 | 狀態 | 用在 |
|---|---|---|---|---|---|
| `marker-h` | `--marker-h` | `h-marker` | 24（＝ `pill`） | alias | 一般標記 |
| `marker-alert-h` | `--marker-alert-h` | `h-marker-alert` | 28（＝ `control-sm`） | alias | 等你、錯誤標記 |
| `marker-pointer` | — | `size-2.5`（三角） | 10 × 6 | new | 標記下方指向角色的小三角 |
| `hovercard-w` | `--hovercard-w` | `w-hovercard` | 280 | new | AgentHoverCard |
| `overlay-w` | `--sidebar-w`（xl 值） | `w-72` | 288 | reuse | NeedsYouOverlay |
| `overlay-inset` | — | `top-4 left-4`… | `space-4` | reuse | canvas 內四角疊層距邊 |
| `detail-w` | `--detail-w` | `var(--detail-w)` | 352／≥ xl 416 | reuse | AgentDetailPane |
| `avatar-detail` | — | `size-10` | 40（＝ `icon-block`） | reuse | 詳情窗頭像 |
| `avatar-row` | — | `size-7` | 28（＝ `control-sm`） | reuse | SessionRow、HoverCard 頭像 |

圓角：canvas 疊層（NeedsYou、HoverCard、Legend）`radius-xl`；StateCounts、ViewControls、區牌、標記 `radius-full`；canvas 本身是 Card pane 的 `radius-xl`。
陰影：疊層一律 `shadow-pop`（浮在場景上）；StateCounts、區牌、一般標記 `shadow-soft`；alert 標記 `shadow-pop`。
Border：一般標記 `border-w-pill`＋`status-ok`；soft 標記 `border-w-pill`＋`status-X`；alert 標記無框。

動態（new，全部要 `motion-reduce`）：

| token | 值 | 用在 | reduced motion |
|---|---|---|---|
| `motion-alert-pulse` | 外圈 scale 1 → 1.25、opacity 0.4 → 0，1.6s 無限 | `ring-alert`（等你） | 靜態雙圈 |
| `motion-think-dots` | 三點依序 opacity 1 → 0.3，1.2s | thinking 泡泡 | 三點靜止 |
| `motion-camera-fly` | 600ms ease-out（`OrbitControls` target＋距離） | 點 NeedsYou 列、「置中」、`?focus=` | 直接跳 |
| `motion-walk` | Kenney walk clip，速度 1.2 格／秒 | done → 休息區、回座位 | 直接瞬移 |
| `theme-lerp` | 400ms | 主題切換 | 直接切 |

---

## 4. Desktop Grid 與 Layout 結構

### 4.1 頁面骨架：工具頁（unify §4.5）

```
┌ TopBar（NavLink：總覽｜辦公室｜歷史｜趨勢｜herdr｜git）──────────────────────────┐
├────────────────────────────────────────────────────────────────────────────┤
│ <div class="flex flex-col gap-3 p-3 lg:h-(--tool-h)">                          │
│   PageHeader compact：辦公室 · 副標 …… 工具列（§6.1）                            │
│   [Banner]（0..n）                                                             │
│   <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_var(--detail-w)]"> │
│     Card pane：OfficeCanvas（疊層見 §4.2）│ [Card pane：AgentDetailPane（選了才有）] │
│   </div>                                                                       │
└────────────────────────────────────────────────────────────────────────────┘
```

| 視窗寬 | canvas（有詳情） | canvas（無詳情） | 詳情 | 備註 |
|---|---|---|---|---|
| **1440** | 988 × 768 | 1416 × 768 | 416 | 稿 `page-office-light`、`page-office-dark` |
| **1280** | 828 | 1256 | 416 | — |
| **1024** | 636 | 1000 | 352 | 一般標記預設 0.8 倍 |
| 768–1023 | 滿寬 | 滿寬 | 底部 Sheet（高 60svh） | 3D；工具列換行 |
| < 768 | — | — | — | **預設清單模式**（§4.4），Banner info「窄螢幕用清單顯示」＋「仍要開 3D」 |

（canvas 高＝ `tool-h` − PageHeader − gap − Banner；Banner 出現時 canvas 變矮，不推出捲軸。）

### 4.2 canvas 內疊層（`absolute`，`overlay-inset` 距邊）

| 位置 | 元件 | 何時 |
|---|---|---|
| 左上 | NeedsYouOverlay | 有等你／錯誤時；0 個時整塊不顯示 |
| 右上 | StateCounts | 永遠（0 的項不顯示） |
| 左下 | Legend（收合成 chip；展開成卡） | 永遠；展開狀態存 localStorage |
| 右下 | ViewControls（＋、−、重設） | 永遠 |
| 下中 | 操作提示（caption） | 首次進頁 10 秒後淡出；鏡頭沒動過時保留 |
| 跟著角色 | AgentMarker、ZoneSign、AgentHoverCard | CSS2DRenderer；HoverCard 在角色右上，碰邊翻到左邊 |

疊層之間不重疊：NeedsYou 最多 4 列（超過出「再看 N 位」），Legend 展開時高 ≤ canvas 高 − NeedsYou 高 − 3 × `overlay-inset`，不夠就只出捲動。

### 4.3 場景世界座標（1 格 ＝ 1 公尺 ≈ Kenney 桌寬 1.4 格）

稿：`office-scene-plan`。

| 項目 | 規格 |
|---|---|
| 房間（小） | 20 × 14 格；後牆在 y=0、左牆在 x=0，高 2.4 格；窗在後牆 |
| 後排 | 專案區，每區 9.2 × 6.6 格，最多 3 區並排；區間走道 0.6 格 |
| 前排 | 散座區（9.2 × 5.6）＋休息區（9.2 × 5.6） |
| 任務桌群 | leader 大桌 1.9 × 1.0（雙螢幕）在桌群左前；成員桌 1.4 × 0.8，2 × N 對排（N＝ceil(成員數 ÷ 2)，≤ 4），桌距 0.4 |
| 入座順序 | brief 成員表順序（dev → qa → reviewer …）；同一成員整個任務期間座位不變 |
| 同專案多任務 | 桌群左右並排，區寬 ＝ 桌群數 × 9.2 |
| 散座區 | 一排 4 桌，滿了往前加一排；依專案名排序 |
| 鏡頭預設 | 右前方 45°、俯角 35°、正交感強的透視（fov 30）；`OrbitControls`：俯角限 20°–70°、距離限 fit 距離的 0.4–1.6 倍、不能鑽到地板下 |
| 自動 fit | 人數或區數變化時 fit 全部（`motion-camera-fly`）；使用者拖過鏡頭後不再自動，改把「重設視角」Button 變成 `selected-soft` 提醒 |

### 4.4 擴張三階（依「在場」人數，不含下班）

| 階 | 條件 | 規則 |
|---|---|---|
| 小 | ≤ 12 | 單排專案區（≤ 3 區），房間 20 × 14 |
| 中 | 13–40 | 專案區兩排（每排 3 區），房間往前加深 8 格；一般標記預設 0.8 倍 |
| 大 | > 40 或 > 6 個專案區 | 分樓層：每層 6 區；PageHeader 工具列多一個 SegmentedControl sm「1F｜2F｜3F」，有等你的樓層項加 `dot` danger；閒置角色不畫，桌上立「N 位閒置」小牌；桌椅用 InstancedMesh |

### 4.5 清單模式（無 WebGL、窄螢幕、使用者切換）

- 桌機：三欄 `grid-cols-3 gap-3`，每欄一張 Card pane：「需要你」（danger）／「工作中」（ok）／「完成 · 中斷 · 閒置」（neutral）；欄內 SessionRow，`inset-list`、`stack-2xs`。稿 `page-office-list`。
- < 768：單欄，三組各一張 Card（收合式），「需要你」預設展開、「工作中」最多 3 列＋「再顯示 N 位」、第三組預設收合。點列就地展開（resume 指令＋兩顆按鈕）。稿 `office-mobile-390`。
- 篩選與 3D 共用同一份 URL 狀態（`?kind=claude&project=atlas&needs=1&focus=<pane>&view=list`）。

---

## 5. 主要可重複使用的 Components

新元件放 `apps/web/src/features/office/`；跨頁共用的（SubstatePill、SessionRow、`substate.ts`）放 `components/app/`。

### 5.1 新增

| 元件 | 用途 | 組成 |
|---|---|---|
| **SubstatePill** | 細狀態膠囊（office、任務頁、herdr 共用） | StatusPill（unify §6.3）＋ tone/圖示/文字照 §1.2 ＋可選計時 |
| **AgentMarker** | 角色頭頂標記（CSS2D） | 膠囊（bubble／line／soft／alert 四型）＋指向小三角；bubble 改兩顆尾巴圓 |
| **ZoneSign** | 牆上區牌（CSS2D） | 圖示（`FolderKanban`／`Laptop`／`Coffee`）＋專案名＋任務 · 波＋Tag 人數 |
| **OfficeCanvas** | three.js 畫布與疊層的容器 | Card pane ＋ `<canvas>` ＋ CSS2D 層 ＋ §4.2 疊層 |
| **NeedsYouOverlay** | 左上「需要你」清單 | 標題（Hand＋字＋Tag danger）＋SidebarItem（unify §6.20）× ≤ 4 |
| **StateCounts** | 右上各狀態人數 | `dot`＋文字 × n |
| **Legend** | 圖例 | chip（收合）／卡（展開：AgentMarker 縮 0.85 ＋說明 × 8） |
| **ViewControls** | 縮放、重設 | 直排 icon button × 3＋分隔線 |
| **AgentHoverCard** | hover 角色 | HoverCard（unify §6.25）：頭像＋名字＋kind Tag／專案 · 任務 · 波／SubstatePill＋計時／工具列（mono）／提示 |
| **AgentDetailPane** | 點選角色後的右欄 | 頭部（頭像、名字、角色 Tag、kind Tag、關閉）＋SubstatePill＋計時＋[Banner：等你的問題／錯誤原文]＋dl（目前工具、這輪跑了、模型、ctx、花費）＋終端尾 6 行＋resume 指令列＋動作列 |
| **SessionRow** | 清單模式、手機一列 | 頭像＋名字（＋👑）＋kind Tag／專案 · 任務 · 角色／工具行 ｜ SubstatePill sm＋計時 |
| **OfficeList** | 清單模式整體 | Card pane × 3（或手機 Card × 3）＋SessionRow |

### 5.2 沿用 unify（changed＝本頁有特殊用法）

| 元件 | 本頁用法 |
|---|---|
| PageHeader compact | 標題「辦公室」，副標「3D 即時：N 個 session · M 個需要你」（M=0 時改「大家都很順 ✨」） |
| SegmentedControl sm | kind 篩選「全部｜Claude｜Codex」（含 count）；視圖「3D｜清單」（無 WebGL 時 3D 項 disabled＋`Ban` 圖示） |
| Field | 專案 Select「專案：全部」 |
| Button outline sm（changed） | 「只看需要你」：toggle，`aria-pressed`，前置 `dot` danger、尾 Tag danger 計數；按下＝`selected-soft` |
| Button ghost sm | 「重設視角」（`RotateCcw`）；icon button「全螢幕」（`Maximize2`） |
| Banner | §6.11 情境表 |
| EmptyState | page：沒有 session；inline：篩選後沒人 |
| Skeleton＋ProgressBar | 3D 載入中 |
| Table（changed） | 任務頁成員表的「細狀態」欄（§6.12） |
| SidebarList（changed） | herdr agents 段分組（§6.13） |

### 5.3 元件 API（props）

| 元件 | props |
|---|---|
| SubstatePill | `substate`: §1.2 key；`tool?`（running 時接在文字後）；`since?`（Date，有就顯示計時）；`size`: `default`｜`sm`；`note?`（等你：審批／提問） |
| AgentMarker | `substate`；`tool?`；`scale`（0.6–1，alert 忽略）；`hidden?`（idle 預設 true）；`onClick`、`onHover` |
| ZoneSign | `kind`: `project`｜`hot`｜`lounge`；`title`；`subtitle?`；`count` |
| NeedsYouOverlay | `items`: `{ paneId, name, project, substate, since, summary }[]`；`onFocus(paneId)` |
| AgentHoverCard | `session`（見 decisions Q15 的資料欄位） |
| AgentDetailPane | `session`；`onClose`；`onCenter` |
| SessionRow | `session`；`selected?`；`expanded?`；`onSelect` |
| OfficeCanvas | `sessions`；`filters`；`selected?`；`onSelect`；`theme`（`light`｜`dark`）；`quality`（`auto`｜`low`） |

組合樹：

```
OfficePage ─ PageHeader(SegmentedControl · Field · Button) · Banner
  └ OfficeCanvas ─ NeedsYouOverlay(SidebarItem) · StateCounts · Legend(AgentMarker) · ViewControls
       └ CSS2D ─ AgentMarker · ZoneSign · AgentHoverCard(SubstatePill)
  └ AgentDetailPane ─ SubstatePill · Banner · dl · Terminal · Button
OfficeList ─ Card pane ─ SessionRow(SubstatePill · Tag · Avatar)
```

---

## 6. 每個 Component 的尺寸、Padding、文字層級與基本狀態

共同狀態照 unify §6.0（hover `motion-colors`、focus-visible `focus-ring`、disabled、`motion-reduce`）。

### 6.1 PageHeader 工具列（/office）

| 項目 | 規格 |
|---|---|
| 順序（左 → 右） | kind SegmentedControl sm → 專案 Field → 「只看需要你」→ 視圖 SegmentedControl sm（3D｜清單）→ [樓層 SegmentedControl sm] → 「重設視角」Button ghost sm → 全螢幕 icon button |
| Gap | `stack-sm` |
| 「只看需要你」 | Button outline sm（高 `control-sm`、`inset-control-sm`）；前 `dot` danger、後 Tag danger；0 個時 disabled、Tag 不顯示；按下後場景只畫等你／錯誤的人，其他人 25% 透明、不可點 |
| 「重設視角」 | 鏡頭沒動過時 `muted-foreground`；動過後 `selected-soft`（提醒可以回去） |
| < lg | 工具列換到第二列、可橫捲；「重設視角」只留圖示 |
| 鍵盤 | `/` 聚焦專案 Select、`n` 切「只看需要你」、`r` 重設視角、`l` 切清單、`Esc` 取消選取（寫進 `?` popover，同 herdr） |

### 6.2 SubstatePill

| 項目 | default | sm |
|---|---|---|
| 尺寸／padding／圓角／框 | 同 unify StatusPill default | 同 StatusPill sm |
| 文字 | `caption-strong` `status-X-fg`；running 為「執行 `<工具>`」，工具名 ≤ 12 字 | `micro` |
| 前置 | `dot-sm`；running／writing／thinking／waiting 加 `motion-pulse`；done 換 Check；interrupted 換 Square `icon-2xs` | 同 |
| note | waiting「審批」／「提問」，`alpha-75` | 不顯示 note，文字改「等你 · 審批」 |
| 計時 | 接在膠囊右邊（不在膠囊內）：`caption-strong` `+num`；danger 用 `status-danger-fg`，其他 `muted-foreground` | 同 |
| 終端標題列內 | 底 `on-color / alpha-5`（同 unify） | 同 |

### 6.3 AgentMarker

| 項目 | line（執行、回覆） | bubble（思考） | soft（中斷、完成、閒置） | alert（等你、錯誤） |
|---|---|---|---|---|
| 高 | `marker-h` | `marker-h` | `marker-h` | `marker-alert-h` |
| Padding | `inset-pill` | `inset-pill` | `inset-pill` | `inset-control-sm` |
| Gap | `stack-2xs` | 三點間 `stack-2xs` | `stack-2xs` | `stack-2xs` |
| 底／框 | `bg popover`＋`border-w-pill` `status-ok`＋`shadow-soft` | 同 line | `bg status-X-soft`＋`border-w-pill` `status-X` | `bg status-danger`，無框，`shadow-pop` |
| 圖示 | `icon-2xs`（12）`status-ok-fg` | 三個 `dot-sm` `status-ok-fg`（opacity 1／0.7／0.45，`motion-think-dots`） | `icon-2xs` `status-X-fg` | `icon-xs`（14）`on-color` |
| 文字 | `caption-strong`（工具名 `+mono`）`status-ok-fg` | 無 | `caption-strong` `status-X-fg` | `body-bold` `on-color` |
| 指向 | 小三角 `marker-pointer`，色同框 | 兩顆尾巴圓（6、3.5）同底同框 | 小三角，色 `status-X` | 小三角 `status-danger` |
| 位置 | 角色頭頂上方 `space-1.5`；有皇冠時再高 `space-2` | 同 | 同 | 同 |
| 縮放 | 隨鏡頭距離 0.6–1；< 0.6 只剩 `dot`（8） | 同 | 同 | **永不縮**，永遠 1 |
| 遮擋 | 被家具遮住時隱藏（射線檢查） | 同 | 同 | **永遠置頂**；角色在畫面外時，canvas 邊緣出現紅色箭頭 chip（`marker-alert-h`、`Hand` 圖示＋名字），點了 `motion-camera-fly` |
| 顯示 | 預設 | 預設 | 中斷、完成預設；閒置只在 hover／選取時 | 預設 |
| hover | 角色出 AgentHoverCard；標記本身 `cursor-pointer` | 同 | 同 | 同 |
| focus-visible | 標記是 `<button>`（tab 順序＝§1.2 排序），`focus-ring`；Enter＝選取 | 同 | 同 | 同 |
| a11y | `aria-label`：「dev-a，等你審批，已等 3 分 12 秒」 | 同 | 同 | 同；另有 `role="status"` 的隱藏 live region 播報「dev-a 在等你」 |
| 亮暗差異 | `popover` 暗色比 card 亮一階，標記自然浮出 | 同 | 同 | 同 |

### 6.4 角色動作（Kenney Mini Characters clip）

稿：`office-states`。

| 細狀態 | 位置 | 姿勢／clip | 道具與場景變化 |
|---|---|---|---|
| waiting | 自己座位旁（站起） | `wave` 迴圈、面向鏡頭 | 地面 `ring-alert`（脈動） |
| error | 自己座位 | `sit`＋頭前傾（趴桌，自訂 pose） | 頭上紅煙粒子 2 顆（`status-danger` 35%／20%）、`ring-alert`（不脈動） |
| interrupted | 自己座位 | `sit`、手停在鍵盤上方（`interact` 第 0 格停住） | 螢幕亮度降到 50% |
| running | 自己座位 | `interact` 迴圈（打字） | 螢幕亮、程式碼往上捲（UV 位移） |
| writing | 自己座位 | `interact` 慢速 0.6 倍＋點頭 | 螢幕亮 |
| thinking | 自己座位 | `idle`＋手托下巴、頭左右 ±8° | 螢幕亮 |
| done | 休息區（茶水或沙發，先到先佔） | `walk` → `idle` 拿杯子／`sit` 沙發 | 座位螢幕暗；10 分後走回座位轉 idle |
| idle | 自己座位 | `sit` 頭低、身體呼吸縮放 1 → 1.02（3s） | 角色 55% 不透明、螢幕暗、無標記 |
| leader | 大桌 | 同上 | 頭上皇冠配件（Kenney accessory） |
| 選取 | — | — | `ring-select` |

`prefers-reduced-motion`：所有 clip 停在關鍵影格（揮手停在舉手、打字停在手放鍵盤），不走路（直接出現在目的地），脈動改靜態雙圈，思考三點靜止。

### 6.5 ZoneSign

| 項目 | 規格 |
|---|---|
| 位置 | 專案區：後牆上、區左端往右 0.5 格、離地 2.25 格；散座區：左牆；休息區：地面區角 |
| 尺寸 | 高 `control-sm`（28）、`inset-control-sm`、`radius-full` |
| 底 | `bg popover`＋`shadow-soft` |
| 內容 | 圖示 `icon-xs` `brand-violet`＋專案名 `caption-bold`＋「任務 · 波 N」`micro` `muted-foreground`＋Tag 人數 |
| hover | `hover-fill`；出 Tooltip「任務詳情」 |
| click | 鏡頭飛到該區（`motion-camera-fly`）；⌘/Ctrl＋click 開任務詳情 |
| 有等你 | 區牌尾端多一個 `dot` danger（不改底色） |

### 6.6 NeedsYouOverlay

| 項目 | 規格 |
|---|---|
| 尺寸 | 寬 `overlay-w`；高自然，最多 4 列 |
| Padding | `card-pad-sm` 上、`inset-list` 其餘；列間 `stack-3xs` |
| 底 | `bg popover`＋`shadow-pop`＋`radius-xl` |
| 標題 | `Hand` `icon-sm` `status-danger-fg`＋「需要你」`body-bold` `status-danger-fg`＋Tag danger 計數；右側提示「點一下飛過去」`micro` `muted-foreground` |
| 列 | SidebarItem（unify §6.20）：`dot` danger＋名字＋第二行「專案 · 等你審批 · 3 分 12 秒」；尾 `Crosshair` `icon-xs` |
| 列 hover／active | `hover-fill`；選取中＝`selected-soft` |
| 列 click | 選取該人＋`motion-camera-fly` |
| 0 個 | 整塊不畫 |
| > 4 個 | 第 5 列換成「再看 N 位」連結（`caption-strong` `primary`），點了切到「只看需要你」 |

### 6.7 StateCounts／Legend／ViewControls

| 項目 | StateCounts | Legend 收合 | Legend 展開 | ViewControls |
|---|---|---|---|---|
| 尺寸 | 高 `control`、`inset-control` | 高 `control`、`inset-control-sm` | 寬 300、`card-pad-sm`、列高 30 | 寬 `control`＋`space-1` × 2，直排 |
| 底 | `bg popover`＋`shadow-soft`＋`radius-full` | 同 | `bg popover`＋`shadow-pop`＋`radius-xl` | `bg popover`＋`shadow-soft`＋`radius-full` |
| 內容 | `dot`＋「思考 2」`caption-strong`，項間 `stack-lg`；0 的不顯示；不含等你／錯誤（在 NeedsYou） | `Info`＋「圖例」`body-strong`＋`ChevronUp` | 8 列：AgentMarker（`scale` 0.85，放 96 寬槽）＋說明 `caption`；尾註「紅圈＝要你處理；紫圈＝目前選取」`micro` | icon button `Plus`／`Minus`／分隔線／`RotateCcw` |
| hover／focus | 項可點＝把該狀態設為篩選（再點取消） | `hover-fill` | — | 照 Button |

### 6.8 AgentHoverCard

| 項目 | 規格 |
|---|---|
| 尺寸 | 寬 `hovercard-w`，`card-pad-sm`，列距 `stack-md` |
| 底 | HoverCard（unify §6.25）：`bg popover`、`shadow-pop`、`radius-xl` |
| 第一列 | Avatar `avatar-row`＋名字 `body-bold`＋kind Tag `mono`；第二行「專案 · 任務 · 波 N」`caption` `muted-foreground` |
| 第二列 | SubstatePill default ＋（靠右）計時 `caption-strong` |
| 第三列（有工具時） | `bg muted` `radius-lg` `inset-control-sm`＋`inset-y-xs`：`Terminal` `icon-2xs`＋工具參數 `mono-sm` `truncate` |
| 錯誤時 | 第三列改錯誤原文第一行，`status-danger-fg` `mono-sm` |
| 尾 | 「點一下看詳情」`micro` `muted-foreground` |
| 開關 | hover 150ms 後開、離開 100ms 後關；鍵盤 focus 標記時也開 |
| 位置 | 角色頭部右上，`space-4` 間距；碰 canvas 邊翻到左／下 |

### 6.9 AgentDetailPane

| 項目 | 規格 |
|---|---|
| 外框 | Card pane（unify §6.13），寬 `detail-w`，自捲 |
| 頭部 | 高自然；`card-pad-sm`；底線 `border-w-hair`；Avatar `avatar-detail`＋名字 `title-sm`＋角色 Tag brand＋kind Tag `mono`；第二行「專案 · 任務 · 波」`body` `muted-foreground`；關閉 icon button（`X`，Esc 同效） |
| 內容 | `card-pad-sm`，區塊間 `stack-lg` |
| 狀態列 | SubstatePill default（含 note）＋靠右計時（danger：`body-bold` `status-danger-fg`「已等 3 分 12 秒」） |
| 等你 | Banner danger default：title＝agent 問的那句（取終端最後一個問句或審批提示），細節＝工具＋參數摘要；**沒有「回覆」按鈕**（唯讀，去 herdr 回） |
| 錯誤 | Banner danger：title「這輪出錯」，細節＝錯誤原文 `mono-sm` |
| dl | 列高 36、`border-w-hair` 分隔：目前工具（`mono-sm`）、這輪跑了（`body-bold` `+num`）、模型（Tag brand mono）、ctx、花費 |
| 終端尾 | 最後 6 行，`terminal-bg`、`radius-lg`、`mono-terminal`（11），高 = 6 行 ＋ `space-3` |
| resume 指令 | 標籤「resume 指令」`caption-bold` `muted-foreground`；列 `bg muted` `radius-lg` 高 `control-lg`：指令 `mono-sm` `truncate`（中段省略 session id）＋Button ghost sm「複製」（`Copy` → 成功後 1.5s 顯示 `Check`「已複製」）；指令依 kind：`claude --resume <id>`／`codex resume <id>` |
| 動作列 | Button outline sm「任務詳情」（`ListChecks`；無任務時 disabled）、「在 herdr 開」（`MonitorPlay`）；靠右 Button ghost sm「置中」（`Crosshair`） |
| < lg | 改成底部 Sheet（高 60svh、`radius-xl` 上緣、拖把手），內容相同 |

### 6.10 SessionRow

| 項目 | 規格 |
|---|---|
| 尺寸 | 最小高 `row`；`inset-control-sm`＋`inset-y-sm`；`radius-lg` |
| Gap | `stack-md` |
| 左 | Avatar `avatar-row` |
| 中 | 第一行名字 `body-strong`＋[👑]＋kind Tag `mono`；第二行「專案 · 任務 · 角色」`caption` `muted-foreground`；第三行（有工具時）`Terminal` `icon-2xs`＋參數 `mono-2xs` `muted-foreground` `truncate` |
| 右 | 直排靠右：SubstatePill sm、計時 `caption-strong`（danger 用 `status-danger-fg`） |
| 底 | 等你／錯誤：`bg status-danger-soft`；選取：`selected-soft`；其他透明 |
| hover | 透明列 `hover-fill`；danger 列不變底，加 `shadow-soft` |
| click | 桌機：開 AgentDetailPane；手機：就地展開（resume 列＋兩顆 Button sm），縮排 `indent-row` |
| focus-visible | `focus-ring-inset` |

### 6.11 Banner 與空狀態情境（/office）

稿：`office-edge-states`。

| 情境 | 元件 | tone | title | 細節／action | 場景 |
|---|---|---|---|---|---|
| 3D 載入中 | Skeleton（地板菱形）＋ProgressBar（`progress-h`，寬 220）＋字 | — | 「載入辦公室 3D 場景…」 | 「0.8 ／ 1.3 MB · 等待期間可切到清單」 | — |
| 沒有任何 session | EmptyState page | — | 「辦公室還沒有人上班」🌙 | 「開一個 Claude Code 或 Codex session（herdr 裡）就會出現在這裡」 | 只畫空房間（不畫桌群） |
| 篩選後沒人 | EmptyState inline（canvas 中央疊層） | — | 「『Codex · beacon』目前沒有人」 | Button outline sm「清除篩選」 | 場景照畫，全部 25% |
| 首次載入失敗 | Banner default | danger | 載入失敗 | 錯誤原文；「重試」（10 秒自動） | 不畫場景，canvas 內 EmptyState inline `CloudOff` |
| 3D 素材載入失敗 | Banner default | danger | 3D 素材載入失敗，已改用清單 | 失敗檔名；「再試 3D」 | 自動切清單模式 |
| 無 WebGL | Banner default | info | 這個瀏覽器無法使用 WebGL，改用清單顯示 | 說明；無 action | 清單模式，3D 項 disabled |
| WebGL context lost | Banner sm | warn | 3D 畫面暫停，正在重建（WebGL context lost） | — | 自動重建 |
| 更新失敗、顯示舊資料 | Banner sm | warn | 更新失敗，顯示的是舊資料 | 最後成功時間 | 角色停在最後狀態，整體 55% |
| herdr 輪詢 | Banner sm | warn | herdr 訂閱斷線，每 5 秒輪詢中 | 「細狀態最多延遲 5 秒」 | 照常 |
| 窄螢幕 | Banner sm | info | 窄螢幕用清單顯示 | Button outline sm「仍要開 3D」 | 清單 |

### 6.12 任務詳情成員表（changed）

稿：`page-task-substate`。

| 項目 | 規格 |
|---|---|
| 欄 | 成員 150 ｜ state 96（dkbo 流程狀態，**不變**）｜ **細狀態 230（取代原「herdr」欄）**｜ 目前（彈性）｜ 設定 170 ｜ cost 72 ｜ ctx 56 ｜ 動作 76 |
| 細狀態格 | 第一行 SubstatePill sm＋計時；第二行（有工具時）`Terminal` `icon-2xs`＋參數 `mono-2xs` `muted-foreground` `truncate`；沒有 session：StatusPill sm idle 虛線框「無 session」 |
| 等你／錯誤列 | 列底 `status-danger-soft`（取代 `selected-row`）；「目前」欄 `body-strong` `status-danger-fg` |
| 卡片標題 | 「成員」Tag 人數之後加 Tag danger「N 個等你」（0 不顯示） |
| 動作欄 | icon button sm × 2：`Armchair`「在辦公室看」（→ `/office?focus=<pane>`）、`MonitorPlay`「在 herdr 開」；沒有 session 時兩者 disabled |
| PageHeader | 工具列最前面加 Button outline sm「在辦公室看」（`Armchair`，→ `/office?project=<p>`） |
| 列高 | 有工具行的列自然長高（`inset-y-sm`），其他維持 `row` |

### 6.13 herdr 頁（changed）

稿：`page-herdr-substate`。

| 項目 | 規格 |
|---|---|
| agents 段 | 段內再分三組：「需要你」（等你、錯誤）→「工作中」（執行、回覆、思考）→「其他」（中斷、完成、閒置）；組標 padding 同段標題、`micro` 粗體（需要你用 `status-danger-fg`）＋Tag 計數；0 的組不顯示；組內依 §1.2 排序再依名字 |
| agents 項第二行 | 「專案 · 細狀態 · 計時」：`caption` `muted-foreground`，計時 `caption-strong` `+num`（danger 組 `status-danger-fg`）；StatusDot 用細狀態 tone |
| pane 標題列 | SubstatePill sm（終端版，`on-color / alpha-5` 底）→ 計時 `micro` 粗體（danger 用 `status-danger-fg`）→ pane 名 → 工具參數（`Terminal` `icon-2xs`＋`mono-2xs` `terminal-dim` `truncate`）→ 靠右既有 meta（模型 · ctx · $） |
| tab 項 | dot 改用該 tab 內最嚴重的細狀態 tone |
| PageHeader | 工具列最前面加 Button outline sm「在辦公室看」（→ `/office?focus=<目前選的 pane>`） |
| 不變 | 唯讀鏡像；選中 danger pane 的 2px `status-danger` 外框 |
