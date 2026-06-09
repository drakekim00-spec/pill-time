@echo off
chcp 65001 >nul
cd /d "%~dp0miniapp"
if not exist node_modules (
  echo [miniapp] 패키지 설치 중...
  call npm install
)
echo [miniapp] ait build — .ait 파일 생성
call npm run build
if exist pill-time.ait (
  echo.
  echo 빌드 완료. pill-time.ait — 콘솔에 업로드하세요.
  explorer .
) else if exist dist (
  echo.
  echo 웹 빌드만 완료. dist 폴더를 엽니다.
  explorer dist
) else (
  echo 빌드 실패. 위 오류 메시지를 확인하세요.
)
pause
