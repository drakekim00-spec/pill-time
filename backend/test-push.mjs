import dotenv from "dotenv";
import { isTossApiReady, sendFunctionalMessage, sendTestMessage } from "./toss-client.js";

dotenv.config();

var userKey = process.env.TOSS_TEST_USER_KEY || "";
var template = process.env.TOSS_TEMPLATE_SET_CODE || "pill-time-templateSetCode";
var deploymentId =
  process.env.TOSS_DEPLOYMENT_ID || "019ecf50-e2b2-756b-9a28-6188a892e8b7";

console.log("mtls:", isTossApiReady());
if (!isTossApiReady()) {
  console.error("mTLS 없음 — backend/certs 또는 환경 변수 확인");
  process.exit(1);
}
if (!userKey) {
  console.log("TOSS_TEST_USER_KEY 없음 — health만 확인하려면 서버 /api/health 사용");
  process.exit(0);
}

try {
  var testRes = await sendTestMessage(userKey, template, deploymentId, {});
  console.log("test-send status:", testRes.status);
  console.log(JSON.stringify(testRes.data, null, 2));
  if (testRes.status < 200 || testRes.status >= 300) {
    var liveRes = await sendFunctionalMessage(userKey, template, {});
    console.log("send-message status:", liveRes.status);
    console.log(JSON.stringify(liveRes.data, null, 2));
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}
