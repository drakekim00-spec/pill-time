import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

var API_BASE = (process.env.TOSS_API_BASE || "https://apps-in-toss-api.toss.im").replace(/\/$/, "");
var BACKEND_ROOT = path.dirname(fileURLToPath(import.meta.url));
var PROJECT_ROOT = path.join(BACKEND_ROOT, "..");

function firstExisting(paths) {
  for (var i = 0; i < paths.length; i++) {
    if (paths[i] && fs.existsSync(paths[i])) return paths[i];
  }
  return "";
}

var DEFAULT_CERT = firstExisting([
  path.join(BACKEND_ROOT, "certs", "약먹을시간_public.crt"),
  path.join(PROJECT_ROOT, "mTLS", "약먹을시간_public.crt"),
]);
var DEFAULT_KEY = firstExisting([
  path.join(BACKEND_ROOT, "certs", "약먹을시간_private.key"),
  path.join(PROJECT_ROOT, "mTLS", "약먹을시간_private.key"),
]);

function readPem(envValue, pathEnv, defaultFilePath) {
  if (envValue && String(envValue).trim()) {
    return String(envValue).replace(/\\n/g, "\n");
  }
  var filePath = process.env[pathEnv];
  if (filePath && fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
  if (defaultFilePath && fs.existsSync(defaultFilePath)) {
    return fs.readFileSync(defaultFilePath, "utf8");
  }
  return "";
}

var cachedAgent = null;

function getAgent() {
  if (cachedAgent) return cachedAgent;
  var cert = readPem(process.env.TOSS_MTLS_CERT, "TOSS_MTLS_CERT_PATH", DEFAULT_CERT);
  var key = readPem(process.env.TOSS_MTLS_KEY, "TOSS_MTLS_KEY_PATH", DEFAULT_KEY);
  if (!cert || !key) return null;
  cachedAgent = new https.Agent({
    cert: cert,
    key: key,
    rejectUnauthorized: true,
  });
  return cachedAgent;
}

export function isTossApiReady() {
  return !!getAgent();
}

export function tossRequest(method, path, options) {
  options = options || {};
  return new Promise(function (resolve, reject) {
    var agent = getAgent();
    if (!agent) {
      reject(new Error("mTLS 인증서가 없어요. Render 환경 변수 TOSS_MTLS_CERT / TOSS_MTLS_KEY 를 넣어 주세요."));
      return;
    }

    var body = options.body ? JSON.stringify(options.body) : "";
    var headers = Object.assign(
      {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      options.headers || {},
    );
    if (body) headers["Content-Length"] = Buffer.byteLength(body);

    var req = https.request(
      API_BASE + path,
      {
        method: method,
        headers: headers,
        agent: agent,
      },
      function (res) {
        var chunks = "";
        res.on("data", function (chunk) {
          chunks += chunk;
        });
        res.on("end", function () {
          var parsed = null;
          try {
            parsed = chunks ? JSON.parse(chunks) : null;
          } catch (_e) {
            parsed = { raw: chunks };
          }
          resolve({ status: res.statusCode || 0, data: parsed });
        });
      },
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function exchangeAuthCode(authorizationCode, referrer) {
  var res = await tossRequest("POST", "/api-partner/v1/apps-in-toss/user/oauth2/generate-token", {
    body: {
      authorizationCode: authorizationCode,
      referrer: referrer || "DEFAULT",
    },
  });
  if (!res.data || res.data.resultType !== "SUCCESS" || !res.data.success) {
    throw new Error("토큰 발급 실패");
  }
  return res.data.success;
}

export async function fetchLoginMe(accessToken) {
  var res = await tossRequest("GET", "/api-partner/v1/apps-in-toss/user/oauth2/login-me", {
    headers: {
      Authorization: "Bearer " + accessToken,
    },
  });
  if (!res.data || res.data.resultType !== "SUCCESS" || !res.data.success) {
    throw new Error("사용자 정보 조회 실패");
  }
  return res.data.success;
}

export async function sendFunctionalMessage(userKey, templateSetCode, context) {
  var res = await tossRequest("POST", "/api-partner/v1/apps-in-toss/messenger/send-message", {
    headers: {
      "x-toss-user-key": String(userKey),
    },
    body: {
      templateSetCode: templateSetCode,
      context: context || {},
    },
  });
  return res;
}

export async function sendTestMessage(userKey, templateSetCode, deploymentId, context) {
  var res = await tossRequest("POST", "/api-partner/v1/apps-in-toss/messenger/send-test-message", {
    headers: {
      "x-toss-user-key": String(userKey),
    },
    body: {
      templateSetCode: templateSetCode,
      deploymentId: deploymentId,
      context: context || {},
    },
  });
  return res;
}

var FALLBACK_DEPLOYMENT_ID = "019ecf87-c71c-7f69-8b06-5cf3caa12dff";

export function getDeploymentId() {
  var id = String(process.env.TOSS_DEPLOYMENT_ID || "").trim();
  return id || FALLBACK_DEPLOYMENT_ID;
}

export function useTestPushApi() {
  var mode = String(process.env.TOSS_PUSH_MODE || "auto").toLowerCase();
  if (mode === "live") return false;
  if (mode === "test") return true;
  return !!getDeploymentId();
}

export function isPushSuccess(res) {
  return !!(res && res.status >= 200 && res.status < 300 && res.data && res.data.resultType === "SUCCESS");
}

export async function sendScheduledPush(userKey, templateSetCode, context) {
  if (useTestPushApi()) {
    var deploymentId = getDeploymentId();
    if (!deploymentId) {
      throw new Error("TOSS_DEPLOYMENT_ID 가 없어요 (테스트 발송용)");
    }
    return sendTestMessage(userKey, templateSetCode, deploymentId, context || {});
  }
  return sendFunctionalMessage(userKey, templateSetCode, context || {});
}
