/**
 * fileLogger.js — 對應 Form1 的 timer2 (每秒觸發，依 Save_Rate 寫檔)
 *
 * 每秒呼叫 tick()，當 (當日秒數 % saveRate === 0) 時，
 * 將前一個掃描視窗的最大風速、平均風力等級、瞬間風向寫入 <filePath>/<yyyy-MM-dd>.dat (CSV)。
 *
 * 同時將相同資料追加至 <outputPath>/<outputFilename>.dat（不隔日重置）；
 * 每日（首次寫檔時）清除該檔案中早於最新一筆資料 7 天的行。
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

    // 累積輸出檔（不隔日重置）
    this._outputFile = config.outputPath && config.outputFilename
      ? path.resolve(config.outputPath, `${config.outputFilename}.dat`)
      : null;

    if (this._outputFile) {
      const outputDir = path.dirname(this._outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
    }

    this._lastCleanupDate = null; // 記錄上次清理的日期字串 (yyyy-MM-dd)
  }

  /**
   * 每秒呼叫一次 (timer2)
   */
  tick() {
    const now = new Date();
    const secondsOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    if (secondsOfDay % this._saveRate !== 0) return;

    const hasData = this._state.speedSamples.length > 0;
    const maxSpeed = this._max(this._state.speedSamples);
    const avgLevel = this._average(this._state.levelSamples);

    // 清空採樣緩衝
    this._state.speedSamples = [];
    this._state.levelSamples = [];

    const timestamp = this._formatTimestamp(now);
    const dateStr = this._formatDate(now);
    const filePath = path.join(this._filePath, `${dateStr}.dat`);

    // CSV 欄位: 時間戳, CH0原始值, CH1原始值, 風速, 風向, 風力等級
    // 若無有效數據（連線失敗），數值欄位全部寫 NaN
    const row = [
      timestamp,
      hasData ? this._state.rawCh0 : 'NaN',
      hasData ? this._state.rawCh1 : 'NaN',
      hasData ? maxSpeed.toFixed(4) : 'NaN',
      hasData ? this._state.windDirection.toFixed(4) : 'NaN',
      hasData ? Math.round(avgLevel) : 'NaN',
    ].join(',') + '\n';

    try {
      fs.appendFileSync(filePath, row, 'utf8');
      logger.info(`Saved → ${filePath} | ${row.trim()}`);
    } catch (err) {
      logger.error(`File write error: ${err.message}`);
    }

    // 累積輸出檔
    if (this._outputFile) {
      // 每日首次寫檔時清理 7 天前的資料
      if (this._lastCleanupDate !== dateStr) {
        this._lastCleanupDate = dateStr;
        this._cleanupOutputFile();
      }

      try {
        fs.appendFileSync(this._outputFile, row, 'utf8');
        logger.info(`Saved → ${this._outputFile} | ${row.trim()}`);
      } catch (err) {
        logger.error(`Output file write error: ${err.message}`);
      }
    }
  }

  /**
   * 移除累積輸出檔中早於最新一筆資料 7 天的行
   */
  _cleanupOutputFile() {
    if (!fs.existsSync(this._outputFile)) return;

    let content;
    try {
      content = fs.readFileSync(this._outputFile, 'utf8');
    } catch (err) {
      logger.error(`Output file read error during cleanup: ${err.message}`);
      return;
    }

    const lines = content.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return;

    // 找最新一筆的時間戳（最後一行）
    const lastLine = lines[lines.length - 1];
    const lastTime = this._parseTimestamp(lastLine);
    if (!lastTime) return;

    const cutoff = new Date(lastTime.getTime() - 7 * 24 * 60 * 60 * 1000);

    const kept = lines.filter(line => {
      const t = this._parseTimestamp(line);
      return t && t >= cutoff;
    });

    if (kept.length === lines.length) return; // 無需清理

    try {
      fs.writeFileSync(this._outputFile, kept.join('\n') + '\n', 'utf8');
      logger.info(`Cleanup ${this._outputFile}: removed ${lines.length - kept.length} old row(s)`);
    } catch (err) {
      logger.error(`Output file cleanup write error: ${err.message}`);
    }
  }

  /**
   * 解析 CSV 行首的時間戳 "yyyy-MM-dd HH:mm:ss"
   */
  _parseTimestamp(line) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    if (!match) return null;
    return new Date(match[1].replace(' ', 'T'));
  }

  _average(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  _max(arr) {
    if (!arr || arr.length === 0) return 0;
    return Math.max(...arr);
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
