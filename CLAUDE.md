# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# 安裝相依套件
npm install

# 直接執行（前景）
npm start
# 等同於
node src/index.js

# 使用 PM2 管理（背景、自動重啟）
npm run pm2:start     # 啟動
npm run pm2:stop      # 停止
npm run pm2:restart   # 重啟
npm run pm2:logs      # 即時日誌

# 手動指定設定檔
CONFIG_PATH=./config.json node src/index.js
```

## Architecture

Node.js + PM2 應用程式，從 Advantech ADAM-4017/18 透過 Modbus RTU 讀取風速/風向，記錄至每日 `.dat` 檔，並在第二個 COM 埠上作為 Modbus RTU Slave 對外輸出資料。

### 資料流

1. **ADAM 讀取**（`adamReader.js`）：以 `modbus-serial` 作為 Modbus RTU Master，對 ADAM-4017/18 發 FC04（Read Input Registers），讀取 CH0（風速）與 CH1（風向）原始整數值。
2. **校正**（`calibration.js`）：先依單位模式（V/mV/mA）將整數正規化為物理量，再套用 `value = (raw - initial) * factor + offset`。
3. **風力等級**（`windLevel.js`）：依 18 個蒲福風級門檻（m/s），將風速轉為 0–18 整數等級。
4. **寫檔**（`fileLogger.js`）：`timer2` 每秒呼叫 `tick()`，當 `(當日秒數 % saveRate === 0)` 時，將掃描視窗內的**最大風速**、**平均風力等級**、**瞬間風向**以 CSV 寫入 `<filePath>/<yyyy-MM-dd>.dat`。欄位：時間戳、rawCh0、rawCh1、風速、風向、風力等級。若 `outputPath`/`outputFilename` 有設定，也會同步追加至累積輸出檔，並於每日首次寫檔時清除 7 天前的舊資料。
5. **Modbus Slave**（`modbusSlave.js`）：`timer3` 每 10 秒呼叫 `reinit()`，若 slave 斷線則重新啟動。暫存器值 = 工程值 × 10（整數）。

### 計時器（均在 `src/index.js` 內以 `setInterval` 實作）

| 計時器 | 間隔 | 行為 |
|--------|------|------|
| timer1 | `scan.scanRate` 秒 | 輪詢 ADAM → 校正 → 累積採樣 → 更新 Modbus 暫存器 |
| timer2 | 1 秒 | 依 `scan.saveRate` 決定是否寫檔 |
| timer3 | 10 秒 | 確認 Modbus Slave 在線，否則重新初始化 |

### 共用狀態物件（`state`，定義於 `index.js`）

`state` 由 `index.js` 建立並傳入 `FileLogger` 與 `ModbusSlave`：
- `rawCh0`, `rawCh1`：最新一次的原始暫存器值
- `windSpeed`, `windDirection`, `windLevel`：最新校正後的工程值
- `speedSamples[]`, `levelSamples[]`：自上次存檔以來的採樣緩衝，寫檔後清空（風向直接取 `state.windDirection` 瞬間值，不緩衝）

### 設定（`config.json`）

| 區段 | 欄位 | 說明 |
|------|------|------|
| `adam` | `comPort`, `baudrate`, `deviceId`, `timeout` | ADAM 模組串列埠 |
| `scan` | `scanRate`, `saveRate` | 採樣頻率（秒）、存檔頻率（秒，需能整除當日秒數） |
| `filePath` | — | `.dat` 檔輸出目錄 |
| `channels.ch0/ch1` | `analog`, `initial`, `factor`, `offset` | 各通道單位與校正參數 |
| `slave` | `comPort`, `baudrate`, `slaveId`, `parity`, `stopBits`, `dataBits` | Modbus Slave 串列埠 |
| `registers` | `windSpeed`, `windDirection`, `windLevel` | Slave Input Register 位址 |
| `outputPath`, `outputFilename` | — | 累積輸出檔目錄與檔名（不隔日重置，選填） |

設定檔路徑可透過環境變數 `CONFIG_PATH` 覆蓋，預設為 `./config.json`。

### PM2（`ecosystem.config.js`）

- 記憶體上限 200 MB，超過自動重啟
- 崩潰後等待 5 秒、最多重啟 10 次
- 日誌輸出至 `./logs/pm2-error.log` 與 `./logs/pm2-out.log`
- 應用程式本身的 winston 日誌寫至 `./logs/app.log`（最多保留 7 個 5 MB 滾動檔）
