약먹을시간 — mTLS 인증서 (앱인토스 콘솔에서 발급)
================================================

■ 이 폴더 파일
  약먹을시간_public.crt   → 인증서 (공개)
  약먹을시간_private.key  → 비밀키 (GitHub에 올리지 말 것)

■ 로컬 서버
  backend 실행 시 위 파일을 자동으로 읽음 (별도 .env 없어도 됨)
  확인: http://localhost:8789/api/health → mtls: true

■ Render (24시간 서버)
  폴더 파일은 Render에 안 올라감 → 환경 변수에 직접 넣어야 함

  backend 폴더에서:
    npm run mtls:print

  나온 내용을 Render → pill-time-api → Environment 에 붙여넣기
    TOSS_MTLS_CERT  = (crt 파일 내용 통째)
    TOSS_MTLS_KEY   = (key 파일 내용 통째)

  배포 후: https://pill-time-api.onrender.com/api/health → mtls: true
