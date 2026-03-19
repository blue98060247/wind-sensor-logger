/**
 * fileLogger.js — 對應 Form1 的 timer2 (每秒觸發，依 Save_Rate 寫檔)
 *
 * 每秒呼叫 tick()，當 (當日秒數 % saveRate === 0) 時，
 * 將前一個掃描視窗的平均值寫入 <filePath>/<yyyy-MM-dd>.dat (CSV)。
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class FileLogger {
  constructor(config, state) {
    this._filePath = path.resolve(config.filePath);
    this._saveRate = config.scan.saveRate;
    this._state = state;

    if (!fs.existsSync(this._filePath)) {
      fs.mkdirSync(this._filePath, { recursive: true });
    }
  }

  /**
   * 每秒呼叫一次 (timer2)
   */
  tick() {
    const now = new Date();
    const secondsOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    if (secondsOfDay % this._saveRate !== 0) return;

    const avgSpeed = this._average(this._state.speedSamples);
    const avgDir = this._average(this._state.directionSamples);
    const avgLevel = this._average(this._state.levelSamples);

    // 清空採樣緩衝
    this._state.speedSamples = [];
    this._state.directionSamples = [];
    this._state.levelSamples = [];

    const timestamp = this._formatTimestamp(now);
    const dateStr = this._formatDate(now);
    const filePath = path.join(this._filePath, `${dateStr}.dat`);

    // CSV 欄位: 時間戳, CH0原始值, CH1原始值, 風速, 風向, 風力等級
    const row = [
      timestamp,
      this._state.rawCh0,
      this._state.rawCh1,
      avgSpeed.toFixed(4),
      avgDir.toFixed(4),
      Math.round(avgLevel),
    ].join(',') + '\n';

    try {
      fs.appendFileSync(filePath, row, 'utf8');
      logger.info(`Saved → ${filePath} | ${row.trim()}`);
    } catch (err) {
      logger.error(`File write error: ${err.message}`);
    }
  }

  _average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  _formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    );
  }

  _formatDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}

module.exports = FileLogger;
