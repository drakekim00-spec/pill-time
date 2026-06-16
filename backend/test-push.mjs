import dotenv from "dotenv";
import {
  isTossApiReady,
  isPushSuccess,
  sendScheduledPush,
  sendTestMessage,
  useTestPushApi,
} from "./toss-client.js";

dotenv.config();

var userKey = process.env.TOSS_TEST_USER_KEY || "";
var template = process.env.TOSS_TEMPLATE_SET_CODE || "pill-time-templateSetCode";
var deploymentId =
  process.env.TOSS_DEPLOYMENT_ID || "019ecf5d-3a1c-7d11-a78a-53eade7db6bd";
var apiBase = process.env.PILL_TIME_API || "https://pill-time-api.onrender.com";

async function wakeRemote() {
  try {
    var res = await fetch(apiBase + "/api/wake");
    var data = await res.json();
    console.log("wake:", res.status, JSON.stringify(data));
  } catch (e) {
    console.log("wake fail:", e.message || e);
  }
}

console.log("mtls:", isTossApiReady());
console.log("pushMode:", useTestPushApi() ? "test" : "live");
await wakeRemote();

if (!isTossApiReady()) {
  console.error("mTLS 없음 — backend/certs 또는 환경 변수 확인");
  process.exit(1);
}
if (!userKey) {
  console.log("TOSS_TEST_USER_KEY 없음 — wake·mtls만 확인됨");
  process.exit(0);
}

try {
  var testRes = await sendTestMessage(userKey, template, deploymentId, {});
  console.log("test-send status:", testRes.status);
  console.log(JSON.stringify(testRes.data, null, 2));
  if (!isPushSuccess(testRes)) {
    var schedRes = await sendScheduledPush(userKey, template, {});
    console.log("scheduled-push status:", schedRes.status);
    console.log(JSON.stringify(schedRes.data, null, 2));
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}
