'use strict';

async function defaultLoadFeishuAuthModule() {
  return import('@larksuite/openclaw-lark-tools/dist/utils/feishu-auth.js');
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message;
  }
  return String(error || '');
}

function isPendingPollError(error) {
  const message = getErrorMessage(error);
  return message.includes('authorization_pending') || message.includes('slow_down');
}

function createFeishuInstallService({ loadFeishuAuthModule = defaultLoadFeishuAuthModule } = {}) {
  let installIsLark = false;

  async function createAuth() {
    const { FeishuAuth } = await loadFeishuAuthModule();
    return new FeishuAuth();
  }

  return {
    async startQrcode({ isLark = false } = {}) {
      installIsLark = isLark === true;
      const auth = await createAuth();
      auth.setDomain(installIsLark);
      await auth.init();
      const response = await auth.begin();

      return {
        url: response?.verification_uri_complete || '',
        deviceCode: response?.device_code || '',
        interval: Number(response?.interval) || 5,
        expireIn: Number(response?.expire_in) || 300,
      };
    },

    async poll(deviceCode) {
      const auth = await createAuth();
      auth.setDomain(installIsLark);

      let response;
      try {
        response = await auth.poll(deviceCode);
      } catch (error) {
        if (isPendingPollError(error)) return { done: false };
        throw error;
      }

      if (!response?.client_id || !response?.client_secret) {
        return { done: false };
      }

      return {
        done: true,
        appId: response.client_id,
        appSecret: response.client_secret,
        domain: response?.user_info?.tenant_brand === 'lark' ? 'lark' : 'feishu',
      };
    },

    async verifyCredentials({ appId, appSecret } = {}) {
      const { validateAppCredentials } = await loadFeishuAuthModule();
      const valid = await validateAppCredentials(appId, appSecret);
      return valid === true
        ? { ok: true, message: 'ok' }
        : { ok: false, message: 'invalid-credentials' };
    },
  };
}

module.exports = { createFeishuInstallService };
