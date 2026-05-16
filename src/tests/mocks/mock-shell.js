const { EventEmitter } = require("node:events");

class MockPtyProcess extends EventEmitter {
  constructor({ cols = 120, rows = 36, cwd = "/test/project" } = {}) {
    super();
    this.cols = cols;
    this.rows = rows;
    this.cwd = cwd;
    this._killed = false;
    this._buffer = "";
  }

  write(data) {
    if (this._killed) return;

    const input = String(data).trim();

    if (input === "echo hello") {
      this._emitData("hello\r\n");
    } else if (input === "pwd") {
      this._emitData(`${this.cwd}\r\n`);
    } else if (input === "slow") {
      setTimeout(() => this._emitData("slow response\r\n"), 2000);
    } else if (input === "error") {
      this._emitData("error message\r\n");
    } else if (input === "exit") {
      this._emitData("\r\n[process exited with code 0]\r\n");
      this._killed = true;
      this.emit("exit", { exitCode: 0 });
    } else if (input) {
      this._emitData(`${input}\r\n`);
    }
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
  }

  kill() {
    this._killed = true;
    this.emit("exit", { exitCode: 0 });
  }

  _emitData(data) {
    this._buffer += data;
    this.emit("data", data);
  }

  getBuffer() {
    return this._buffer;
  }
}

function createMockPty({ cwd, cols, rows } = {}) {
  return new MockPtyProcess({ cwd, cols, rows });
}

module.exports = { createMockPty, MockPtyProcess };
