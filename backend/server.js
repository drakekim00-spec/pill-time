import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { startScheduler } from "./scheduler.js";
import { getStats, upsertUser } from "./store.js";
import {
  exchangeAuthCode,
  fetchLoginMe,
  isTossApiReady,
  sendFunctionalMessage,
  sendTestMessage,
} from "./toss-client.js";

dotenv.config();

var app = express();
var PORT = Number(process.env.PORT) || 8789;
var TEMPLATE = process.env.TOSS_TEMPLATE_SET_CODE || "pill-time-templateSetCode";
var DEPLOYMENT_ID =
  process.env.TOSS_DEPLOYMENT_ID || "019ecef3-d5d2-7571-bfb7-71cf8823d279";

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
    stats: getStats(),
  });
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
    var result = await sendFunctionalMessage(userKey, TEMPLATE, {});
    res.json({
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
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
      ok: result.status >= 200 && result.status < 300,
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
