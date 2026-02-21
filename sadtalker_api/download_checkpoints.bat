@echo off
echo Downloading SadTalker checkpoints...
echo.

cd /d "%~dp0"

REM Create checkpoints directory if it doesn't exist
if not exist "checkpoints" mkdir checkpoints

cd checkpoints

echo Downloading checkpoint files...
echo.

echo NOTE: This will download ~500MB of model files.
echo Please be patient, this may take several minutes.
echo.

REM Download safetensors first (preferred format, ~185MB each)
echo [1/5] Downloading SadTalker_V0.0.2_512.safetensors (~185MB)...
curl -L --progress-bar -o SadTalker_V0.0.2_512.safetensors https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_512.safetensors
if errorlevel 1 (
    echo ERROR: Failed to download SadTalker_V0.0.2_512.safetensors
    pause
    exit /b 1
)
echo ✓ Downloaded SadTalker_V0.0.2_512.safetensors
echo.

echo [2/5] Downloading SadTalker_V0.0.2_256.safetensors (~185MB)...
curl -L --progress-bar -o SadTalker_V0.0.2_256.safetensors https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/SadTalker_V0.0.2_256.safetensors
if errorlevel 1 (
    echo ERROR: Failed to download SadTalker_V0.0.2_256.safetensors
    pause
    exit /b 1
)
echo ✓ Downloaded SadTalker_V0.0.2_256.safetensors
echo.

REM Download mapping models (needed for full preprocess mode)
echo [3/5] Downloading mapping_00109-model.pth.tar...
curl -L --progress-bar -o mapping_00109-model.pth.tar https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00109-model.pth.tar
if errorlevel 1 (
    echo ERROR: Failed to download mapping_00109-model.pth.tar
    pause
    exit /b 1
)
echo ✓ Downloaded mapping_00109-model.pth.tar
echo.

echo [4/5] Downloading mapping_00229-model.pth.tar...
curl -L --progress-bar -o mapping_00229-model.pth.tar https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc/mapping_00229-model.pth.tar
if errorlevel 1 (
    echo ERROR: Failed to download mapping_00229-model.pth.tar
    pause
    exit /b 1
)
echo ✓ Downloaded mapping_00229-model.pth.tar
echo.

echo.
echo ========================================
echo Checkpoints downloaded successfully!
echo ========================================
echo.
echo Files downloaded to: %CD%
echo.
pause

