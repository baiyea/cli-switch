!macro closeCliSwitchProcesses
  DetailPrint "Closing running Cli-Switch instances before install..."
  InitPluginsDir
  File /oname=$PLUGINSDIR\close-cli-switch-processes.ps1 "${BUILD_RESOURCES_DIR}\close-cli-switch-processes.ps1"
  nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\close-cli-switch-processes.ps1"'
!macroend

!macro writeCliSwitchInstallLog PHASE
  CreateDirectory "$APPDATA\Cli-Switch"
  FileOpen $9 "$APPDATA\Cli-Switch\install-timing.log" a
  FileWrite $9 "phase=${PHASE} instdir=$INSTDIR appdata=$APPDATA$\r$\n"
  FileClose $9
!macroend

!macro removePreviousInstallDirectory
  !insertmacro writeCliSwitchInstallLog "old-install-cleanup-start"
  DetailPrint "Moving previous Cli-Switch installation aside..."
  StrCpy $3 ""
  IfFileExists "$INSTDIR\*.*" 0 SkipOldDirRemoval
    nsExec::ExecToLog 'cmd /c for /d %D in ("$INSTDIR.old*") do @start "" /b cmd /c rd /s /q "%~fD"'
    Pop $0
    System::Call 'kernel32::GetTickCount()i .r4'
    StrCpy $3 "$INSTDIR.old.$4"
    Rename "$INSTDIR" "$3"
    IfErrors 0 RenameOK
      Goto SkipOldDirRemoval
    RenameOK:
      nsExec::ExecToLog 'cmd /c start "" /b cmd /c rd /s /q "$3"'
      Pop $0
  SkipOldDirRemoval:
  !insertmacro writeCliSwitchInstallLog "old-install-cleanup-complete"
!macroend

!macro customCheckAppRunning
  !insertmacro closeCliSwitchProcesses
!macroend

!macro customInit
  !insertmacro writeCliSwitchInstallLog "custom-init-start"
  !insertmacro closeCliSwitchProcesses
  !insertmacro removePreviousInstallDirectory
!macroend

!macro customInstall
  !insertmacro writeCliSwitchInstallLog "custom-install-start"
  !insertmacro closeCliSwitchProcesses
  !insertmacro writeCliSwitchInstallLog "custom-install-complete"
!macroend
