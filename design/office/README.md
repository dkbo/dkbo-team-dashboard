# dkbo 儀表板設計：辦公室 /office（office）

新頁 `/office`：把每個 Claude Code／Codex session 畫成 3D 辦公室裡的小人（three.js，延遲載入；Kenney **Mini Characters**＋**Furniture Kit**，CC0），參考 [Charonyuu/whatsmyagentdoing](https://github.com/Charonyuu/whatsmyagentdoing)。
另外把同一套「細狀態」（思考、執行工具、寫回覆、等你、完成、中斷、錯誤、閒置）放進任務詳情成員表與 herdr 頁。

**第二輪（2026-10-24）** 追加四項：效能（react-three-fiber＋drei、on-demand render）、頁面物件（辦公室當 dashboard 大廳）、角色互動事件（dk-status 的波次／審查／ESCALATE）、角色識別（職等襯衫色、effort 星、找人清單）。新設計題在 [decisions.md](decisions.md) **E 章（E1–E16，2026-10-24 定案；E2、E11 採領導修正版）**，稿與規格照定案畫。

底層全部沿用 [`design/unify/`](../unify/README.md) 的深靛可愛風與 token；**新規格（新 token、元件尺寸與狀態）都在 [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)**，本檔只放原則、各稿重點與檔案索引。

## 檔案索引

| 檔案 | 內容 |
|---|---|
| [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) | **Design System Spec**：How to use → 1 Color Tokens（[細狀態對照](DESIGN-SYSTEM.md#12-細狀態--語意色newfeaturesofficesubstatets)、`scene-*`、地面圈、燈光）→ 2 Typography → 3 Spacing／圓角／Border／動態 → 4 Layout（頁面骨架、canvas 疊層、場景世界座標、擴張三階、清單模式）→ 5 元件 → 6 元件尺寸與狀態（含任務頁、herdr 頁改動） |
| [`tokens.json`](tokens.json) | DESIGN-SYSTEM 新增 token 的機器可讀版 |
| [`decisions.md`](decisions.md) | **已定案的 15 題**（2026-10-24 人回照建議）＋**第二輪 E1–E16**（同日定案，E2、E11 為領導修正版）；DESIGN-SYSTEM 與稿照定案寫 |
| `page-office-light.webp` | /office 亮色 1440 預設視角（fit 全部、沒 hover）：選取「等你」的 dev-a（頭頂星、右側詳情含 RankTag）、左上找人清單（收合）、右上狀態計數；物件與白板標籤 compact（圖示＋數字，異常才帶 chip）；beacon 中間的 frontend 與散座 codex 依碰撞規則縮成色點；碰撞檢查 0 |
| `page-office-dark.webp` | /office 暗色 1440：夜間光線、herdr 輪詢的 warn Banner、找人清單展開（分組＋篩選）、物件標籤 compact、hover「錯誤」的 qa（頭頂星＋HoverCard；卡片底下的公告板／git 標籤讓位隱藏）；碰撞檢查 0 |
| `office-states.webp` | 8 種細狀態 × 角色特寫 × 頭頂標記（含優先序與標記共通規則） |
| `office-scene-plan.webp` | 分區平面（俯視）、分區規則、擴張三階、亮暗光線與場景色 |
| `page-office-list.webp` | 清單模式 1440（無 WebGL 的退路，也可手動切） |
| `office-mobile-390.webp` | 窄螢幕 390：預設清單、可「仍要開 3D」、就地展開 resume 指令 |
| `office-edge-states.webp` | 載入中、沒有 session、篩選後沒人、載入失敗、素材失敗、GPU 重置／資料過時 |
| `page-task-substate.webp` | 任務詳情成員表改動稿（細狀態欄、等你列、在辦公室看） |
| `page-herdr-substate.webp` | herdr 改動稿（agents 分組、pane 標題列細狀態＋計時＋工具） |
| `office-objects.webp` | **第二輪** 頁面物件 6 件（白板、監控牆、電表、檔案室、檔案櫃、公告板）特寫＋各狀態標籤＋標籤樣式規則 |
| `office-events.webp` | **第二輪** 事件分鏡：reviewer 出動／審查通過／要修／ESCALATE／波關閉／結案＋事件規則＋reduced motion 退化表 |
| `office-identity.webp` | **第二輪** 職等襯衫色與 model 對照、effort 星、頭頂堆疊並存規則、找人清單（展開／篩選中／收合） |
| `office.pen` | 所有稿的原始檔（pen.dev），frame 名與 webp 同名 |
| `.src/` | 產生 `office.pen` 與 webp 的 pen 腳本（見文末） |

> 稿上的資料是示意值（專案 atlas／beacon／cedar、任務「結帳流程改版」「API 速率限制」）。
> 3D 場景在稿上是 **pen 畫的等角示意**（盒子＋簡化小人），不是 Kenney 模型的真實樣子；比例、分區、標記位置、配色以稿為準，造型以 Kenney 素材為準。
> 字型：pen 沒有 Huninn，稿上中文是系統黑體，emoji 頭像是單色字形；實作照 unify。
> **稿與 DESIGN-SYSTEM.md 衝突時以 DESIGN-SYSTEM.md 為準。**

---

## 1. 設計原則

1. **先回答「誰需要我」，再回答「大家在幹嘛」。** 等你、錯誤是全頁唯一的紅：實心紅標記＋地面紅圈（等你會脈動）、永遠置頂不縮小、在畫面外有邊緣箭頭；左上找人清單的「需要你」組一點就飛過去。其他狀態都比它安靜。
2. **顏色只講狀態，可愛留給角色。** 五種語意色只出現在標記、地面圈與膠囊；專案區不用類別色（用牆上區牌分），燈光與家具走 `scene-*` 中性靛色。角色、皇冠、休息區的咖啡是可愛的地方（unify 原則 1 的「身分」）。
3. **位置是記憶點。** 同一任務坐同一桌群、同一成員座位固定；狀態變化只改動作與標記，不換位置——只有「完成」會走去休息區。
4. **沒事就收。** 閒置不畫標記、角色半透明、螢幕暗；閒置 2 小時算下班不畫；0 的計數不顯示。
5. **3D 是加分，不是門檻。** 清單模式與 3D 用同一份資料與網址狀態；無 WebGL、素材失敗、窄螢幕都自動落到清單，不讓人看到空白 canvas。
6. **唯讀。** 跟 herdr 頁一樣不送按鍵：詳情窗只給「複製 resume 指令」「在 herdr 開」「任務詳情」，不在辦公室裡回覆。

---

## 2. 各稿重點

### 2.1 /office 版面（`page-office-light`、`page-office-dark`）

- **骨架**：unify 工具頁（滿版、卡片化窗格）。PageHeader compact「辦公室 · 3D 即時：12 個 session · 2 個需要你」，工具列：kind 篩選（全部｜Claude｜Codex）、專案 Select、「只看需要你」toggle、3D｜清單、重設視角、全螢幕。
- **canvas 四角疊層**：左上找人清單（第二輪取代「需要你」）、右上狀態計數、左下圖例（可收合）、右下縮放／重設；hover 角色出 HoverCard（名字、kind、專案 · 任務 · 波、細狀態＋計時、目前工具）。
- **點選角色**：地面紫色選取圈，右側開詳情窗（`detail-w` 416）：細狀態＋已等多久、等你的問題（danger Banner）、目前工具、這輪跑多久、模型／ctx／花費、終端最後 6 行、**複製 resume 指令**、任務詳情、在 herdr 開、置中。
- **暗色**：夜間辦公室，窗外深藍、螢幕亮著的桌前地面有光暈；Banner 示範 herdr 輪詢的 warn。

### 2.2 場景規劃（`office-scene-plan`）

- 後排每個有任務的專案一區；區內每個任務一組桌群，leader 大桌（雙螢幕、皇冠）在前頭，成員 2 × N 對排；前排散座區（無任務 session）＋休息區。
- 擴張三階：≤ 12 單排、13–40 兩排加深、> 40 分樓層。鏡頭人數變化時自動 fit，使用者動過就不自動。
- 亮暗：亮＝白天暖光＋柔和陰影；暗＝低環境光＋月光，用螢幕自發光與地面光暈表現誰在工作（不用真的點光源）。

### 2.3 細狀態與角色（`office-states`）

| 細狀態 | 色 | 動作 | 標記 |
|---|---|---|---|
| 等你 | danger | 站起、轉向鏡頭揮手 | 實心紅「等你」＋脈動紅圈 |
| 錯誤 | danger | 趴桌、頭冒紅煙 | 實心紅「錯誤」＋紅圈 |
| 中斷 | warn | 手停在鍵盤上方 | 琥珀「■ 中斷」 |
| 執行工具 | ok | 打字、螢幕捲動 | 綠框＋工具名（mono） |
| 寫回覆 | ok | 慢打字＋點頭 | 綠框「✎ 回覆中」 |
| 思考中 | ok | 手托下巴 | 思考泡泡（三點） |
| 完成 | ok＋✓ | 走去休息區拿咖啡 | 綠底「✓ 完成」 |
| 閒置 | idle | 打盹、半透明 | 不顯示（hover 才出） |

### 2.4 既有頁面改動（`page-task-substate`、`page-herdr-substate`）

- **任務詳情成員表**：原「herdr」欄換成「細狀態」（膠囊＋計時＋工具行）；等你／錯誤整列淡紅底；列尾「在辦公室看」「在 herdr 開」；dkbo 的 state 欄保留（流程狀態 ≠ session 此刻在做什麼）。
- **herdr**：agents 清單分「需要你／工作中／其他」三組，第二行「專案 · 細狀態 · 計時」；pane 標題列換細狀態膠囊＋計時＋工具參數；頁首加「在辦公室看」。

### 2.5 退路與例外（`page-office-list`、`office-mobile-390`、`office-edge-states`）

- 清單模式三欄「需要你／工作中／完成 · 中斷 · 閒置」；手機單欄、可就地展開 resume 指令。
- 載入中先給菱形地板 Skeleton＋下載進度；空狀態「辦公室還沒有人上班 🌙」；失敗用 danger Banner、過時用 warn Banner（沿用 unify §6.17 的文案規則）。

### 2.6 第二輪：效能（DESIGN-SYSTEM §4.7）

- r3f `<Canvas frameloop="demand">`：靜止 0 幀；背景分頁 `frameloop="never"`、切回不補播；動畫只在狀態變化（播 6 秒停在關鍵影格）、hover／選取、事件時跑；等你脈動、思考三點改成 DOM CSS。
- 角色 `useGLTF` 一次＋`SkeletonUtils.clone` 共用 geometry／material，衣服 material 每職等一份；家具 `<Instances>`，靜態房間合併；陰影不自動更新。

### 2.7 第二輪：頁面物件（`office-objects`、`office-scene-plan`）

- 房間右側加 4.4 格大廳：監控牆＝herdr、檔案室＝歷史、檔案櫃燈＝git、公告板＝總覽；休息區電表＝趨勢；每個任務桌群左前方白板＝任務詳情。點物件或標籤開那頁。
- 標籤是 DOM（同 AgentMarker）：popover 膠囊、主數字粗體、異常加 status 框＋chip；預設視角（fit）只留圖示＋數字、異常才加 chip，拉近 ≥ fit × 0.8 才 full，< 0.6 只留異常物件。碰撞時物件標籤讓位給角色標記（縮成點，點也壓到就隱藏）；預設視角任何標籤不得互壓或被切（E2 定案）。

### 2.8 第二輪：角色互動事件（`office-events`）

- reviewer 出動：1 位 dev 走到他桌邊、≥ 2 位走到白板；通過比讚、要修垂頭；ESCALATE 領導頭上「!」＋白板黃；波關閉白板進度 +1；結案全組跳＋彩帶。只播即時事件；reduced motion 不走不跳，只出文字 bubble（6 秒）。

### 2.9 第二輪：角色識別（`office-identity`）

- 職等＝襯衫色（資深深靛 → 中階藍 → 初階淺天藍；訪客淺灰＋白色識別證），codex 依後綴對到職等；effort＝頭頂 1–5 星，**只在 hover／選取時畫**（E11 定案；清單、hover 卡、詳情照常有），跟標記同一個 DOM 物件（頭 → 星 → 三角 → 標記，「!」掛膠囊左上）。
- 找人清單取代左上「需要你」：需要你／工作中／完成 · 中斷 · 閒置三組，專案／任務／角色篩選（只縮清單），點了鏡頭飛過去。

---

## 3. 重畫稿

`.src/` 是產生 `office.pen` 與 webp 的 pen 腳本：`lib.js`、`lib3-tbl.js`、`lib5-tool.js`、`p0-tokens.js` 從 `design/unify/.src/` 複製（`lib.js` 導覽多了「辦公室」，`p0-tokens.js` 多了 `scene-*` 等示意色）；`lib6-iso.js` 是等角投影、盒子、小人、標記；`lib7-scene.js` 是場景資料與共用疊層；`lib8-frame.js` 是 /office 頁框；`lib9-r2.js` 是第二輪元件（職等、星、頁面物件、物件標籤、找人清單、事件徽章與 bubble）；`p1`–`p9`、`pa` 每張稿一支（`p8-objects`、`p9-events`、`pa-identity` 是第二輪新稿）。

```
bash design/office/.src/build.sh            # 全部重畫，輸出 office.pen 與 *.webp
bash design/office/.src/build.sh p3-states.js   # 只畫一張（office.pen 會只剩這張，交付前要全部重畫）
```

走 `pen interactive` 無頭模式逐段 `execute`（不用 `--prompt`），frame 用 `Export` 匯出 webp。
pen 稿裡的 `scene-desk-t／-l／-r`、`scene-cabinet-t／-l／-r`、`shirt-*`、`skin`、`hair` 只是示意用色，實作以 DESIGN-SYSTEM §1.3 的 token 為準。
