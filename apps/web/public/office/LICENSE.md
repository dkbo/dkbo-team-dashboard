# 素材授權

本目錄的 3D 模型來自 [Kenney](https://www.kenney.nl)，授權為 **CC0 1.0（公眾領域貢獻）**：
<http://creativecommons.org/publicdomain/zero/1.0/>。個人、教育與商業用途皆可，不需署名（仍標註來源以示感謝）。

| 素材包 | 版本 | 來源 |
|---|---|---|
| Mini Characters | 1.0 | <https://kenney.nl/assets/mini-characters> |
| Furniture Kit | 2.0 | <https://kenney.nl/assets/furniture-kit> |

## 本專案所做的修改
- 只保留用得到的模型與動畫（idle、walk、sit、interact-right、interact-left、jump、emote-yes、emote-no）。
- 以 glTF-Transform 做 dedup、prune、quantize、meshopt 壓縮（`EXT_meshopt_compression`、`KHR_mesh_quantization`），載入端需支援 meshopt（drei `useGLTF` 預設支援）。
- 幾何與貼圖內容未修改。
