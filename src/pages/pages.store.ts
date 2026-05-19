import { create } from 'zustand';

/**
 * 跨页面共享状态：Home ↔ Settings
 *
 * 只放确实被两个页面同时使用的 renderer 状态。
 * Provider 配置等通过 IPC 读写的数据，不在 store 中维护。
 */

interface PagesStore {
  // 当前打开的设置 section（HomePage 和 SettingsPage 共享）
  settingsOpen: boolean;
  settingsSection: string;

  openSettings: (section?: string) => void;
  closeSettings: () => void;
}

export const usePagesStore = create<PagesStore>((set) => ({
  settingsOpen: false,
  settingsSection: 'providers',

  openSettings(section = 'providers') {
    set({ settingsOpen: true, settingsSection: section });
  },

  closeSettings() {
    set({ settingsOpen: false });
  },
}));
