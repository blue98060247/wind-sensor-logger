/**
 * adamReader.js — 對應 C# 的 AdamCom + AdamAnalogInput
 *
 * 透過 modbus-serial 作為 Modbus RTU Master，
 * 讀取 ADAM-4017/18 的 CH0 (風速) 與 CH1 (風向) 輸入暫存器。
 */
const ModbusRTU = require('modbus-serial');
const logger = require('./logger');

class AdamReader {
  constructor(config) {
    this._cfg = config.adam;
    this._client = new ModbusRTU();
    this._connected = false;
  }

  /**
   * 建立 RTU 連線
   */
  async connect() {
    try {
      await this._client.connectRTUBuffered(this._cfg.comPort, {
        baudRate: this._cfg.baudrate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      });
      this._client.setID(this._cfg.deviceId);
      this._client.setTimeout(this._cfg.timeout);
      this._connected = true;
      logger.info(`ADAM connected on ${this._cfg.comPort} @ ${this._cfg.baudrate} baud`);
    } catch (err) {
      this._connected = false;
      throw new Error(`ADAM connect failed: ${err.message}`);
    }
  }

  /**
   * 讀取 CH0 與 CH1 的原始整數值 (Input Registers, FC04)
   * ADAM-4017 通道暫存器起始位址 = 0
   * @returns {{ ch0: number, ch1: number }}
   */
  async read() {
    if (!this._connected) {
      await this.connect();
    }
    try {
      // 一次讀 2 個 input registers（CH0, CH1）
      const result = await this._client.readInputRegisters(0, 2);
      return {
        ch0: result.data[0],
        ch1: result.data[1],
      };
    } catch (err) {
      this._connected = false;
      throw new Error(`ADAM read error: ${err.message}`);
    }
  }

  close() {
    if (this._client.isOpen) {
      this._client.close(() => {});
    }
    this._connected = false;
  }
}

module.exports = AdamReader;
