/**
 * index.js — 主程式入口，對應 C# 的 Program.cs + Form1
 *
 * 三個計時器：
 *   timer1 (scanRate 秒)  → 讀取 ADAM、更新 Modbus 暫存器
 *   timer2 (1 秒)        → 檢查是否需要寫檔
 *   timer3 (10 秒)       → 重新初始化 Modbus Slave（若斷線）
 */
const path = require('path');
const fs = require('fs');

const AdamReader  = require('./adamReader');
const FileLogger  = require('./fileLogger');
const ModbusSlave = require('./modbusSlave');
const { calibrate } = require('./calibration');
const { getWindLevel } = require('./windLevel');
const logger = require('./logger');

// ── 載入設定 ──────────────────────────────────────────────────────────────
const configPath = process.env.CONFIG_PATH
  ? path.resolve(process.env.CONFIG_PATH)
  : path.resolve(__dirname, '../config.json');

if (!fs.existsSync(configPath)) {
  logger.error(`Config file not found: ${configPath}`);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// ── 共用狀態（對應 Form1 的成員變數） ────────────────────────────────────
const state = {
  rawCh0: 0,
  rawCh1: 0,
  windSpeed: 0,
  windDirection: 0,
  windLevel: 0,
  // 掃描視窗內的累積採樣（用於存檔前取平均）
  speedSamples: [],
  directionSamples: [],
  levelSamples: [],
};

// ── 元件初始化 ────────────────────────────────────────────────────────────
const adam  = new AdamReader(config);
const flog  = new FileLogger(config, state);
const slave = new ModbusSlave(config, state);

// ── timer1：以 Scan_Rate 輪詢 ADAM ────────────────────────────────────────
async function pollAdam() {
  try {
    const { ch0, ch1 } = await adam.read();

    state.rawCh0 = ch0;
    state.rawCh1 = ch1;

    // 校正計算
    state.windSpeed     = calibrate(ch0, config.channels.ch0);
    state.windDirection = calibrate(ch1, config.channels.ch1);
    state.windLevel     = getWindLevel(state.windSpeed);

    // 累積採樣（存檔時取平均）
    state.speedSamples.push(state.windSpeed);
    state.directionSamples.push(state.windDirection);
    state.levelSamples.push(state.windLevel);

    // 更新 Modbus 暫存器（值 × 10）
    slave.updateRegisters(state.windSpeed, state.windDirection, state.windLevel);

    logger.info(
      `Speed=${state.windSpeed.toFixed(2)} m/s  ` +
      `Dir=${state.windDirection.toFixed(1)}°  ` +
      `Level=${state.windLevel}  ` +
      `[raw CH0=${ch0} CH1=${ch1}]`
    );
  } catch (err) {
    logger.error(`pollAdam: ${err.message}`);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────────
async function main() {
  logger.info('=== Wind Sensor Logger starting ===');
  logger.info(`Config: ${configPath}`);
  logger.info(`ADAM port: ${config.adam.comPort}  Slave port: ${config.slave.comPort}`);

  // 啟動 Modbus Slave（對應 Form1_Load 時的初始化）
  await slave.start();

  // timer1
  const t1 = setInterval(pollAdam, config.scan.scanRate * 1000);

  // timer2
  const t2 = setInterval(() => flog.tick(), 1000);

  // timer3：每 10 秒重新確認 slave 是否在線
  const t3 = setInterval(() => slave.reinit(), 10000);

  // ── 優雅關閉 ───────────────────────────────────────────────────────────
  function shutdown(signal) {
    logger.info(`Received ${signal}, shutting down...`);
    clearInterval(t1);
    clearInterval(t2);
    clearInterval(t3);
    adam.close();
    slave.close();
    logger.info('Goodbye.');
    process.exit(0);
  }

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info('=== Wind Sensor Logger running ===');
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
