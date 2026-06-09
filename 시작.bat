@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  복약 알림 - 미리보기 서버
echo  브라우저: http://localhost:8789/
echo.
echo  종료: 이 창에서 Ctrl+C
echo.
for %%B in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do (
  if exist %%B (
    start "" %%B --new-window --window-size=636,1048 "http://localhost:8789/"
    goto :browser_done
  )
)
start "" "http://localhost:8789/"
:browser_done
python -m http.server 8789
