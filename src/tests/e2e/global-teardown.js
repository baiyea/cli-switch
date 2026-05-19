const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

module.exports = async function globalTeardown() {
  const baseDir = path.join(os.tmpdir(), '.cli-switch-e2e');
  if (fs.existsSync(baseDir)) {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
};
