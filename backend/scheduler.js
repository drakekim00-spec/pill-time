import {
  isTossApiReady,
  isPushSuccess,
  sendScheduledPush,
} from "./toss-client.js";
import { listActiveUsers, wasSent, markSent } from "./store.js";

var TEMPLATE = process.env.TOSS_TEMPLATE_SET_CODE || "pill-time-templateSetCode";
var TICK_MS = Number(process.env.SCHEDULER_TICK_MS) || 15000;
var timer = null;

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

function doseKey(medId, time) {
  return medId + "@" + time;
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
        var time = times[t];
        if (time !== now.hhmm) continue;

        var key = doseKey(med.id, time);
        if (wasSent(now.dateKey, user.userKey, key)) continue;

        try {
          var res = await sendScheduledPush(user.userKey, TEMPLATE, {});
          if (isPushSuccess(res)) {
            markSent(now.dateKey, user.userKey, key);
            console.log("[push] sent", user.userKey, med.name, time);
          } else {
            console.warn("[push] fail", user.userKey, time, JSON.stringify(res.data));
          }
        } catch (err) {
          console.warn("[push] error", user.userKey, time, err.message || err);
        }
      }
    }
  }
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
