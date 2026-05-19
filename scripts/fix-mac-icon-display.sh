#!/usr/bin/env bash
set -euo pipefail

# Repair macOS app icon metadata for packaged .app bundles.
# Usage:
#   scripts/fix-mac-icon-display.sh release/mac-arm64/Cli-Switch.app

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <path-to-app>"
  exit 1
fi

APP_PATH="$1"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
RESOURCES_PATH="$APP_PATH/Contents/Resources"
ICON_BASENAME="app"
ICON_FILE="$RESOURCES_PATH/${ICON_BASENAME}.icns"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: app not found: $APP_PATH"
  exit 1
fi

if [[ ! -f "$INFO_PLIST" ]]; then
  echo "Error: Info.plist not found: $INFO_PLIST"
  exit 1
fi

if [[ ! -f "$ICON_FILE" ]]; then
  echo "Error: icon file not found: $ICON_FILE"
  exit 1
fi

if plutil -extract CFBundleIconName raw "$INFO_PLIST" >/dev/null 2>&1; then
  CURRENT_ICON_NAME="$(plutil -extract CFBundleIconName raw "$INFO_PLIST")"
  if [[ "$CURRENT_ICON_NAME" != "$ICON_BASENAME" ]]; then
    plutil -replace CFBundleIconName -string "$ICON_BASENAME" "$INFO_PLIST"
  fi
else
  plutil -insert CFBundleIconName -string "$ICON_BASENAME" "$INFO_PLIST"
fi

# Clear extended attributes and bump mtime to refresh icon cache.
xattr -cr "$APP_PATH" || true
touch "$APP_PATH" "$RESOURCES_PATH"

echo "Icon metadata fixed for: $APP_PATH"
echo "If Dock icon is still stale, run: killall Dock"
