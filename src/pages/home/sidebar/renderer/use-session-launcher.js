import { DEFAULT_PROVIDER_SETTINGS } from '../../../pages.store';

const PRIMARY_SESSION_TOOL_ID = 'claude';

export function useSessionLauncher({
  settingsModel,
  sessionToolOptions,
  createSession,
  setActiveSession,
  setSettingsOpen,
  setSettingsSection,
  setProviderTab,
  setAppError,
}) {
  async function createSessionForProject(project, toolId = PRIMARY_SESSION_TOOL_ID) {
    if (!project) return;
    setSettingsOpen(false);
    const currentTool =
      sessionToolOptions.find((item) => item.id === toolId) || sessionToolOptions[0];
    const providerSettings = settingsModel.providers?.[currentTool.id] || DEFAULT_PROVIDER_SETTINGS;
    const enabledProfileId = providerSettings.enabledProfileId;
    const enabledProfile = (providerSettings.profiles || []).find(
      (profile) => profile.id === enabledProfileId,
    );
    if (!enabledProfileId || !enabledProfile) {
      setAppError(`${currentTool.label} 未启用，请先在 Settings -> Providers 中测试连接并启用。`);
      setSettingsOpen(true);
      setSettingsSection('providers');
      setProviderTab(currentTool.id);
      return;
    }
    const sid = await createSession(project.id, project.path, currentTool.id);
    setActiveSession(sid);
  }

  return { createSessionForProject };
}
