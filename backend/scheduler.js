import {
  isTossApiReady,
  isPushSuccess,
  sendScheduledPush,
} from "./toss-client.js";
import { listActiveUsers, wasSent, markSent } from "./store.js";

var TEMPLATE = process.env.TOSS_TEMPLATE_SET_CODE || "pill-time-templateSetCode";
var TICK_MS = Number(process.env.SCHEDULER_TICK_MS) || 15000;
var GRACE_MIN = Number(process.env.SCHEDULER_GRACE_MIN) || 10;
var timer = null;
var lastPushLog = [];

function kstParts(date) {
  var fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  var parts = fmt.formatToParts(date || new Date());
  var map = {};
  parts.forEach(function (p) {
    map[p.type] = p.value;
  });
  var hour = String(map.hour === "24" ? "00" : map.hour).padStart(2, "0");
  return {
    dateKey: map.year + "-" + map.month + "-" + map.day,
    hhmm: hour + ":" + String(map.minute).padStart(2, "0"),
  };
}

function normalizeTime(value) {
  var parts = String(value || "").trim().split(":");
  if (parts.length < 2) return "";
  var hour = parseInt(parts[0], 10);
  var minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return "";
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

function timeToMinutes(hhmm) {
  var parts = normalizeTime(hhmm).split(":");
  if (parts.length < 2) return -1;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function isDueNow(scheduledTime, nowHhmm) {
  var target = timeToMinutes(scheduledTime);
  var now = timeToMinutes(nowHhmm);
  if (target < 0 || now < 0) return false;
  var diff = now - target;
  return diff >= 0 && diff <= GRACE_MIN;
}

function doseKey(medId, time) {
  return medId + "@" + normalizeTime(time);
}

function pushLog(entry) {
  lastPushLog.unshift(entry);
  if (lastPushLog.length > 20) lastPushLog.length = 20;
}

async function tick() {
  if (!isTossApiReady()) return;

  var now = kstParts(new Date());
  var users = listActiveUsers();

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    var medicines = user.medicines || [];

    for (var m = 0; m < medicines.length; m++) {
      var med = medicines[m];
      var times = med.times || [];
      for (var t = 0; t < times.length; t++) {
        var time = normalizeTime(times[t]);
        if (!time || !isDueNow(time, now.hhmm)) continue;

        var key = doseKey(med.id, time);
        if (wasSent(now.dateKey, user.userKey, key)) continue;

        try {
          var res = await sendScheduledPush(user.userKey, TEMPLATE, {});
          if (isPushSuccess(res)) {
            markSent(now.dateKey, user.userKey, key);
            console.log("[push] sent", user.userKey, med.name, time);
            pushLog({
              at: new Date().toISOString(),
              ok: true,
              userKeyTail: String(user.userKey).slice(-6),
              med: med.name,
              time: time,
            });
          } else {
            var failDetail = JSON.stringify(res.data || {});
            console.warn("[push] fail", user.userKey, time, failDetail);
            pushLog({
              at: new Date().toISOString(),
              ok: false,
              userKeyTail: String(user.userKey).slice(-6),
              med: med.name,
              time: time,
              status: res.status,
              detail: failDetail,
            });
          }
        } catch (err) {
          var msg = err.message || String(err);
          console.warn("[push] error", user.userKey, time, msg);
          pushLog({
            at: new Date().toISOString(),
            ok: false,
            userKeyTail: String(user.userKey).slice(-6),
            med: med.name,
            time: time,
            error: msg,
          });
        }
      }
    }
  }
}

export function getSchedulerStatus() {
  return {
    kst: kstParts(new Date()),
    tickMs: TICK_MS,
    graceMin: GRACE_MIN,
    mtls: isTossApiReady(),
    lastPushLog: lastPushLog.slice(0, 10),
  };
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(function () {
    tick().catch(function (err) {
      console.warn("[scheduler]", err.message || err);
    });
  }, TICK_MS);
  tick().catch(function () {});
}
