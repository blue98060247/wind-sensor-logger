/**
 * modbusSlave.js — 對應 Form1 的 nmodbuspc (ModbusSerialSlave)
 *
 * 在第二個 COM 埠上作為 Modbus RTU Slave，
 * 將風速、風向、風力等級以 Input Registers (FC04) 對外輸出（值 × 10）。
 *
 * timer3 邏輯：每 10 秒檢查連線，斷線則重新初始化。
 */
const ModbusRTU = require('modbus-serial');
const logger = require('./logger');

// modbus-serial 的 ServerSerial 向量 (vector) 定義了 slave 如何回應請求
class ModbusSlave {
  constructor(config, state) {
    this._slaveCfg = config.slave;
    this._regCfg = config.registers;
    this._state = state;
    this._server = null;
    this._running = false;
    this._disabled = false; // port 持續無法開啟時設為 true，停止 reinit 嘗試

    // Input registers 內部儲存 (值 × 10)
    this._registers = new Array(8).fill(0);
  }

  /**
   * 啟動 Modbus RTU Slave Server
   */
  async start() {
    const vector = {
      getInputRegister: (addr) => {
        return this._registers[addr] ?? 0;
      },
      getHoldingRegister: (addr) => {
        return this._registers[addr] ?? 0;
      },
      getCoil: () => false,
      getDiscreteInput: () => false,
      setRegister: () => {},
      setCoil: () => {},
    };

    return new Promise((resolve) => {
      try {
        const server = new ModbusRTU.ServerSerial(
          vector,
          {
            port: this._slaveCfg.comPort,
            baudRate: this._slaveCfg.baudrate,
            dataBits: this._slaveCfg.dataBits,
            stopBits: this._slaveCfg.stopBits,
            parity: this._slaveCfg.parity,
            unitID: this._slaveCfg.slaveId,
          }
        );

        let settled = false;
        const settle = () => { settled = true; };

        // 底層 SerialPort 的錯誤（含找不到 port）會在此觸發，
        // ServerSerial 內部沒有對 _serverPath 掛 error handler，
        // 不處理會造成 uncaught exception 而崩潰。
        server.getPort().on('error', (err) => {
          if (settled) {
            // 執行中斷線 → 等待 reinit
            logger.error(`Modbus slave port error: ${err.message}`);
            this._running = false;
          } else {
            // 啟動時就失敗
            settle();
            logger.warn(`Modbus slave unavailable (${this._slaveCfg.comPort}): ${err.message}`);
            logger.warn('Program continues without Modbus slave output.');
            resolve();
          }
        });

        // ServerSerial 成功開啟 port 後會 emit 'initialized'（不是 'open'）
        server.on('initialized', () => {
          settle();
          this._server = server;
          this._running = true;
          this._disabled = false;
          logger.info(
            `Modbus slave started on ${this._slaveCfg.comPort} ` +
            `(ID=${this._slaveCfg.slaveId}, ${this._slaveCfg.baudrate} baud)`
          );
          resolve();
        });

        // ServerSerial 本身的 error（非底層 port open 失敗）
        server.on('error', (err) => {
          if (this._running) {
            logger.error(`Modbus slave error: ${err.message}`);
            this._running = false;
          }
        });

      } catch (err) {
        this._running = false;
        logger.warn(`Modbus slave start failed: ${err.message}`);
        logger.warn('Program continues without Modbus slave output.');
        resolve();
      }
    });
  }

  /**
   * 更新對外暴露的暫存器值（值 × 10，對應 C# 的 × 10 處理）
   * @param {number} windSpeed   m/s
   * @param {number} windDir     度
   * @param {number} windLevel   0–18
   */
  updateRegisters(windSpeed, windDir, windLevel) {
    this._registers[this._regCfg.windSpeed] = Math.round(windSpeed * 10) & 0xffff;
    this._registers[this._regCfg.windDirection] = Math.round(windDir * 10) & 0xffff;
    this._registers[this._regCfg.windLevel] = Math.round(windLevel * 10) & 0xffff;
  }

  /**
   * 每 10 秒呼叫一次 (timer3)：若 slave 不在線則重新初始化
   */
  async reinit() {
    if (this._disabled || this._running) return;

    logger.info('Modbus slave not running, reinitializing...');
    if (this._server) {
      try { this._server.close(); } catch (_) {}
      this._server = null;
    }
    await this.start();
  }

  close() {
    if (this._server) {
      try { this._server.close(); } catch (_) {}
    }
    this._running = false;
  }
}

module.exports = ModbusSlave;
