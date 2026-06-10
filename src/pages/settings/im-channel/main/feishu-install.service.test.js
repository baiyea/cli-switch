const test = require('node:test');
const assert = require('node:assert/strict');
const { createFeishuInstallService } = require('./feishu-install.service');

function createAuthHarness({ beginResult, pollResult, pollError, verifyResult = true } = {}) {
  const calls = [];
  class FeishuAuth {
    setDomain(isLark) {
      calls.push(['setDomain', isLark]);
    }

    async init() {
      calls.push(['init']);
    }

    async begin() {
      calls.push(['begin']);
      return beginResult;
    }

    async poll(deviceCode) {
      calls.push(['poll', deviceCode]);
      if (pollError) throw pollError;
      return pollResult;
    }
  }

  return {
    calls,
    loadFeishuAuthModule: async () => ({
      FeishuAuth,
      validateAppCredentials: async (appId, appSecret) => {
        calls.push(['validateAppCredentials', appId, appSecret]);
        return verifyResult;
      },
    }),
  };
}

test('startQrcode initializes FeishuAuth and maps qrcode response', async () => {
  const harness = createAuthHarness({
    beginResult: {
      verification_uri_complete: 'https://example.test/qr',
      device_code: 'device-1',
      interval: 4,
      expire_in: 240,
    },
  });
  const service = createFeishuInstallService(harness);

  const result = await service.startQrcode({ isLark: true });

  assert.deepEqual(harness.calls, [['setDomain', true], ['init'], ['begin']]);
  assert.deepEqual(result, {
    url: 'https://example.test/qr',
    deviceCode: 'device-1',
    interval: 4,
    expireIn: 240,
  });
});

test('poll returns not done while FeishuAuth reports authorization pending', async () => {
  const harness = createAuthHarness({
    pollError: new Error('authorization_pending'),
  });
  const service = createFeishuInstallService(harness);

  await service.startQrcode({ isLark: false });
  const result = await service.poll('device-1');

  assert.deepEqual(result, { done: false });
});

test('poll maps completed install credentials and detected tenant domain', async () => {
  const harness = createAuthHarness({
    pollResult: {
      client_id: 'cli_a',
      client_secret: 'secret',
      user_info: { tenant_brand: 'lark' },
    },
  });
  const service = createFeishuInstallService(harness);

  await service.startQrcode({ isLark: true });
  const result = await service.poll('device-1');

  assert.equal(harness.calls.some((call) => call[0] === 'poll' && call[1] === 'device-1'), true);
  assert.deepEqual(result, {
    done: true,
    appId: 'cli_a',
    appSecret: 'secret',
    domain: 'lark',
  });
});

test('verifyCredentials maps validation result into stable envelope', async () => {
  const harness = createAuthHarness({ verifyResult: false });
  const service = createFeishuInstallService(harness);

  const result = await service.verifyCredentials({ appId: 'cli_a', appSecret: 'secret' });

  assert.deepEqual(harness.calls, [['validateAppCredentials', 'cli_a', 'secret']]);
  assert.deepEqual(result, { ok: false, message: 'invalid-credentials' });
});
