@echo off
chcp 65001 >nul
cd /d "%~dp0miniapp"
if not exist node_modules (
  echo [miniapp] 패키지 설치 중...
  call npm install
)
echo [miniapp] granite dev — http://localhost:5173/
start "" "http://localhost:5173/"
call npm run dev
