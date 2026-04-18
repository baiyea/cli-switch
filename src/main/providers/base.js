class BaseProviderAdapter {
  id = "base";

  async isAvailable() {
    throw new Error("Not implemented");
  }

  async startSession() {
    throw new Error("Not implemented");
  }

  async resumeSession() {
    throw new Error("Not implemented");
  }

  async sendInput() {
    throw new Error("Not implemented");
  }

  async stopSession() {
    throw new Error("Not implemented");
  }

  async fetchSessionId() {
    throw new Error("Not implemented");
  }
}

module.exports = { BaseProviderAdapter };
