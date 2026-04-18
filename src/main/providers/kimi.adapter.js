const { BaseProviderAdapter } = require("./base");

class KimiAdapter extends BaseProviderAdapter {
  id = "kimi";
  async isAvailable() { return { ok: false, reason: "Not enabled in v1" }; }
  async startSession() { throw new Error("Provider not enabled"); }
  async resumeSession() { throw new Error("Provider not enabled"); }
  async sendInput() { throw new Error("Provider not enabled"); }
  async stopSession() { throw new Error("Provider not enabled"); }
  async fetchSessionId() { return null; }
}

module.exports = { KimiAdapter };
