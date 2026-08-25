@echo off
chcp 65001 >nul
title Cuber - 前后端一键启动
cd /d "%~dp0"

echo ========================================================
echo   Cuber 智能魔方平台 - 一键启动
echo   前端: http://localhost:5173/
echo   后端: http://127.0.0.1:8000/
echo ========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node.js 18+ 后再运行。
  pause
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Python，请先安装 Python 3.10+ 后再运行。
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [提示] 首次运行，正在安装前端依赖...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo [错误] 前端依赖安装失败。
    pause
    exit /b 1
  )
  echo.
)

if exist "requirements.txt" (
  echo [提示] 检查并安装后端 Python 依赖...
  python -m pip install -r requirements.txt -q
  if errorlevel 1 (
    echo [警告] 部分 Python 依赖安装失败，仍将尝试启动后端。
  )
  echo.
)

echo [启动] 正在同时拉起后端 ^(8000^) 与前端 ^(5173^)...
echo [提示] 关闭本窗口将同时停止前后端服务。
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173/"
call npm start

echo.
echo [结束] 服务已停止。
pause
