pill-time-api (Render)
======================

로컬
  cd backend
  npm start   (mTLS는 ../mTLS 폴더 자동 로드)
  Render용: npm run mtls:print
  npm install
  npm start
  → http://localhost:8789/api/health

Render 환경 변수 (필수)
  TOSS_TEMPLATE_SET_CODE = pill-time-templateSetCode
  TOSS_API_BASE          = https://apps-in-toss-api.toss.im
  TOSS_MTLS_CERT         = (콘솔 mTLS 인증서 PEM)
  TOSS_MTLS_KEY          = (콘솔 mTLS 키 PEM)
  TZ                     = Asia/Seoul

mTLS 없으면 푸시 API 호출 불가 (mtls: false)
