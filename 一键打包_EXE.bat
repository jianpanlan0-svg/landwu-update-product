@echo off
chcp 65001 >nul
cd /d %~dp0
set "APP_NAME=领物TEMU上传器"
set "APP_VERSION=2.0.11"
set "RELEASE_DIR=%~dp0%APP_NAME%EXE版本V%APP_VERSION%"
set "RELEASE_EXE=%RELEASE_DIR%\\%APP_NAME%.exe"

echo [1/3] 安装/校验依赖...
call npm install
if errorlevel 1 (
  echo.
  echo 依赖安装失败，请检查后重试。
  pause
  exit /b 1
)

echo.
echo [2/3] 开始打包 EXE...
call npm run build:exe
if errorlevel 1 (
  echo.
  echo 打包失败，请检查报错信息。
  pause
  exit /b 1
)

echo.
echo [3/3] 打包完成
echo 输出目录：%RELEASE_DIR%
if exist "%RELEASE_EXE%" (
  echo 已生成：%RELEASE_EXE%
)
pause
