/**
 * calibration.js — 對應 Form1 的校正計算邏輯
 *
 * 原始值先依單位模式 (V / mV / mA) 正規化，
 * 再套用: value = (raw - initial) * factor + offset
 */

/**
 * 依單位模式將 Modbus 原始整數轉為物理量 (float)
 * ADAM-4117 的 input register 回傳值為帶正負號 16-bit，
 * 對應量程：±10V → ±32768，4-20mA → 0~32768
 */
function scaleRaw(rawInt, analog) {
  switch (analog) {
    case 'V':
      // ±10 V 量程
      return ((rawInt - 32767) / 32768) * 10.0;
    case 'mV':
      // ±500 mV 量程
      return ((rawInt - 32767) / 32768.0) * 500.0;
    case 'mA':
      // 4–20 mA 量程 → 0~20 mA
      return ((rawInt - 32767) / 32768.0) * 20.0;
    default:
      return rawInt;
  }
}

/**
 * 校正計算
 * @param {number} rawInt  Modbus 原始整數值
 * @param {object} chConfig  { analog, initial, factor, offset }
 * @returns {number} 校正後的工程值
 */
function calibrate(rawInt, chConfig) {
  const { analog, initial, factor, offset } = chConfig;
  const scaled = scaleRaw(rawInt, analog);
  return (scaled - initial) * factor + offset;
}

module.exports = { calibrate, scaleRaw };
