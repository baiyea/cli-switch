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
  }
};
