@echo off
setlocal EnableExtensions
rem Islandale on the PC: checks the Unreal bundle in Unreal 5.8 and saves a screenshot per camera.
rem Double-click it, or run:  tools\unreal\run_islandale_pc.bat [bundle folder]
rem The bundle is the folder holding scene\ and textures\ (by default build\3d\unreal in this repo).
rem Results: <bundle>\pc-runs\<date-time>\ with run_log.txt, check.json and the screenshots.
rem Settings you may change: UE_ROOT (where Unreal 5.8 is), ISLANDALE_PROJECT (the Unreal project folder).

set "HERE=%~dp0"
for %%I in ("%HERE%..\..") do set "REPO=%%~fI"
if "%~1"=="" (set "ISLANDALE_BUNDLE=%REPO%\build\3d\unreal") else (set "ISLANDALE_BUNDLE=%~f1")
if "%UE_ROOT%"=="" set "UE_ROOT=C:\Program Files\Epic Games\UE_5.8"
if "%ISLANDALE_PROJECT%"=="" set "ISLANDALE_PROJECT=%USERPROFILE%\Documents\IslandaleUE"
set "EDITOR=%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe"
if not exist "%REPO%\build" mkdir "%REPO%\build"
set "LAUNCH_LOG=%REPO%\build\pc-launcher-log.txt"
echo %DATE% %TIME%  [launcher]  bundle "%ISLANDALE_BUNDLE%", project "%ISLANDALE_PROJECT%" > "%LAUNCH_LOG%"

if not exist "%ISLANDALE_BUNDLE%\scene\scene.json" (
  echo [launcher] FAILED: no scene\scene.json in "%ISLANDALE_BUNDLE%". Copy the Islandale bundle there, or drag its folder onto this file.>> "%LAUNCH_LOG%"
  goto :fail
)
if not exist "%EDITOR%" (
  echo [launcher] FAILED: Unreal Editor not found at "%EDITOR%". Install Unreal Engine 5.8 from the Epic launcher, or set UE_ROOT to its folder.>> "%LAUNCH_LOG%"
  goto :fail
)
if not exist "%ISLANDALE_PROJECT%\IslandaleUE.uproject" (
  echo [launcher] making the Unreal project in "%ISLANDALE_PROJECT%">> "%LAUNCH_LOG%"
  xcopy /E /I /Y "%HERE%project_template" "%ISLANDALE_PROJECT%" > nul
  if errorlevel 1 (
    echo [launcher] FAILED: could not make the project folder "%ISLANDALE_PROJECT%".>> "%LAUNCH_LOG%"
    goto :fail
  )
)
echo [launcher] starting Unreal: it imports, checks and takes screenshots, then closes itself. The first run compiles shaders for a while.>> "%LAUNCH_LOG%"
echo Starting Unreal. It closes itself when done; the first run takes a while.
"%EDITOR%" "%ISLANDALE_PROJECT%\IslandaleUE.uproject" -unattended -nosplash -nosound -log -ExecutePythonScript="%HERE%pc_run.py"
echo [launcher] Unreal closed with code %ERRORLEVEL%. Results are in "%ISLANDALE_BUNDLE%\pc-runs".>> "%LAUNCH_LOG%"
type "%LAUNCH_LOG%"
echo.
echo Done. Open "%ISLANDALE_BUNDLE%\pc-runs": the newest folder has run_log.txt and the screenshots. Copy that folder back.
pause
exit /b 0

:fail
type "%LAUNCH_LOG%"
pause
exit /b 1
