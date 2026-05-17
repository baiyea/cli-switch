export interface TrafficLightPositionPayload {
  x: number;
  y: number;
}

export const windowBridge = {
  setTrafficLightPosition(payload: TrafficLightPositionPayload): Promise<{ ok: boolean }> {
    return window.electronAPI.windowControls.setTrafficLightPosition(payload);
  },
  openExternal(url: string): Promise<void> {
    return window.electronAPI.windowControls.openExternal({ url });
  },
  minimize(): Promise<{ ok: boolean }> {
    return window.electronAPI.windowControls.minimize();
  },
  toggleMaximize(): Promise<{ ok: boolean; isMaximized: boolean }> {
    return window.electronAPI.windowControls.toggleMaximize();
  },
  close(): Promise<{ ok: boolean }> {
    return window.electronAPI.windowControls.close();
  }
};
