!macro closeCliSwitchProcesses
  DetailPrint "Closing running Cli-Switch instances before install..."
  InitPluginsDir
  File /oname=$PLUGINSDIR\close-cli-switch-processes.ps1 "${BUILD_RESOURCES_DIR}\close-cli-switch-processes.ps1"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\close-cli-switch-processes.ps1"'
!macroend

!macro customInit
  !insertmacro closeCliSwitchProcesses
!macroend

!macro customInstall
  !insertmacro closeCliSwitchProcesses
!macroend
