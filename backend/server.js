import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { startScheduler } from "./scheduler.js";
import { getStats, upsertUser } from "./store.js";
import {
  exchangeAuthCode,
  fetchLoginMe,
  isTossApiReady,
  isPushSuccess,
  sendFunctionalMessage,
  sendScheduledPush,
  sendTestMessage,
  useTestPushApi,
  getDeploymentId,
} from "./toss-client.js";

dotenv.config();

var app = express();
var PORT = Number(process.env.PORT) || 8789;
var TEMPLATE = process.env.TOSS_TEMPLATE_SET_CODE || "pill-time-templateSetCode";

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-PR-User-Key"],
  }),
);
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", function (_req, res) {
  res.json({
    ok: true,
    service: "pill-time-api",
    mtls: isTossApiReady(),
    templateSetCode: TEMPLATE,
    pushMode: useTestPushApi() ? "test" : "live",
    deploymentId: getDeploymentId() || null,
    stats: getStats(),
  });
});

app.get("/api/wake", function (_req, res) {
  res.json({ ok: true, awake: true, mtls: isTossApiReady() });
});

app.post("/api/auth/session", async function (req, res) {
  try {
    if (!isTossApiReady()) {
      res.status(503).json({ ok: false, error: "mTLS not configured" });
      return;
    }
    var body = req.body || {};
    if (!body.authorizationCode) {
      res.status(400).json({ ok: false, error: "authorizationCode required" });
      return;
    }
    var token = await exchangeAuthCode(body.authorizationCode, body.referrer || "DEFAULT");
    var me = await fetchLoginMe(token.accessToken);
    if (!me || !me.userKey) {
      res.status(500).json({ ok: false, error: "userKey missing" });
      return;
    }
    res.json({ ok: true, userKey: String(me.userKey) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/api/schedule", function (req, res) {
  var userKey = req.header("x-pr-user-key") || (req.body && req.body.userKey);
  if (!userKey) {
    res.status(400).json({ ok: false, error: "userKey required" });
    return;
  }
  var body = req.body || {};
  var saved = upsertUser(userKey, {
    notifyEnabled: body.notifyEnabled !== false,
    medicines: body.medicines || [],
  });
  res.json({ ok: true, schedule: saved });
});

app.post("/api/push/test", async function (req, res) {
  try {
    if (!isTossApiReady()) {
      res.status(503).json({ ok: false, error: "mTLS not configured" });
      return;
    }
    var userKey = req.header("x-pr-user-key") || (req.body && req.body.userKey);
    if (!userKey) {
      res.status(400).json({ ok: false, error: "userKey required" });
      return;
    }
    var result = await sendScheduledPush(userKey, TEMPLATE, {});
    res.json({
      ok: isPushSuccess(result),
      status: result.status,
      pushMode: useTestPushApi() ? "test" : "live",
      result: result.data,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/api/push/test-send", async function (req, res) {
  try {
    if (!isTossApiReady()) {
      res.status(503).json({ ok: false, error: "mTLS not configured" });
      return;
    }
    var userKey = req.header("x-pr-user-key") || (req.body && req.body.userKey);
    if (!userKey) {
      res.status(400).json({ ok: false, error: "userKey required" });
      return;
    }
    var body = req.body || {};
    var deploymentId = body.deploymentId || DEPLOYMENT_ID;
    var result = await sendTestMessage(userKey, TEMPLATE, deploymentId, body.context || {});
    res.json({
      ok: isPushSuccess(result),
      status: result.status,
      deploymentId: deploymentId,
      result: result.data,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.listen(PORT, function () {
  console.log("pill-time-api → port", PORT, "mtls:", isTossApiReady());
  startScheduler();
});
