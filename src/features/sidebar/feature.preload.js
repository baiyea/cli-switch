// Phase 3: Will expose sidebar preload API
// Currently handled by src/electron/preload.js
function createSidebarPreloadApi() {
  return {
    sidebar: {
      // Will be populated when existing preload is migrated
    },
  };
}

module.exports = { createSidebarPreloadApi };
