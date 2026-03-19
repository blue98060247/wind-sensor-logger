/**
 * windLevel.js — 蒲福風級 (Beaufort Scale) 對應 Form1 的 wind_level[] 陣列
 *
 * 共 18 個門檻值 (m/s)，對應 0–18 級。
 * 當風速 >= thresholds[i] 且 < thresholds[i+1]，則等級為 i。
 */

// 索引 0 = 0 級下界 (0 m/s)，索引 17 = 17 級下界
const WIND_LEVEL_THRESHOLDS = [
  0.0,   // 0 級：靜風
  0.3,   // 1 級：軟風
  1.6,   // 2 級：輕風
  3.4,   // 3 級：微風
  5.5,   // 4 級：和風
  8.0,   // 5 級：清風
  10.8,  // 6 級：強風
  13.9,  // 7 級：疾風
  17.2,  // 8 級：大風
  20.8,  // 9 級：烈風
  24.5,  // 10 級：狂風
  28.5,  // 11 級：暴風
  32.7,  // 12 級：颶風
  36.9,  // 13 級
  41.4,  // 14 級
  46.2,  // 15 級
  51.0,  // 16 級
  56.1,  // 17 級
];

/**
 * 將風速 (m/s) 轉換為蒲福風級 0–18
 * @param {number} speedMs  風速 (m/s)
 * @returns {number} 風力等級 (整數 0–18)
 */
function getWindLevel(speedMs) {
  if (speedMs < 0) return 0;
  for (let i = WIND_LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (speedMs >= WIND_LEVEL_THRESHOLDS[i]) {
      return i;
    }
  }
  return 0;
}

module.exports = { getWindLevel, WIND_LEVEL_THRESHOLDS };
