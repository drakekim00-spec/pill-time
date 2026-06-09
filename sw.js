/* 복약 알림 — 백그라운드 알림 (서비스 워커) */
var CACHE_NAME = "pill-reminder-v2";
var DB_NAME = "pill-reminder-sw";
var DB_STORE = "state";
var NOTIFY_TITLE = "💊 약 먹을 시간";
var NOTIFY_TAG = "pill-reminder";
var DEFAULT_WAIT_MS = 30000;
var IDLE_WAIT_MS = 5 * 60 * 1000;
var MAX_SLEEP_MS = 30 * 60 * 1000;
var WAKE_EARLY_MS = 90 * 1000;

var alarmLoopToken = 0;
var alarmTimerId = null;

function openDb() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}

function loadState() {
  return openDb().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction(DB_STORE, "readonly");
      var req = tx.objectStore(DB_STORE).get("schedule");
      req.onsuccess = function () {
        resolve(req.result || null);
      };
      req.onerror = function () {
        resolve(null);
      };
    });
  });
}

function saveState(state) {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(state, "schedule");
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  });
}

function todayKey() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function timeToMinutes(time) {
  var p = time.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function doseKey(medId, time) {
  return medId + "@" + time;
}

function ensureDayBuckets(state) {
  var key = todayKey();
  if (!state.taken) state.taken = {};
  if (!state.notified) state.notified = {};
  if (!state.taken[key]) state.taken[key] = {};
  if (!state.notified[key]) state.notified[key] = {};
  return key;
}

function getTodayDoses(state) {
  var doses = [];
  (state.medicines || []).forEach(function (med) {
    (med.times || []).forEach(function (time) {
      doses.push({
        medId: med.id,
        name: med.name,
        time: time,
        key: doseKey(med.id, time),
      });
    });
  });
  doses.sort(function (a, b) {
    return timeToMinutes(a.time) - timeToMinutes(b.time);
  });
  return doses;
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function computeWaitMs(state) {
  if (!state || !state.medicines || !state.medicines.length) {
    return IDLE_WAIT_MS;
  }

  var dateKey = ensureDayBuckets(state);
  var doses = getTodayDoses(state);
  if (!doses.length) return IDLE_WAIT_MS;

  var now = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var nowSec = now.getSeconds();
  var nearest = null;

  doses.forEach(function (dose) {
    if (state.taken[dateKey] && state.taken[dateKey][dose.key]) return;
    if (state.notified[dateKey] && state.notified[dateKey][dose.key]) return;

    var target = timeToMinutes(dose.time);
    var diffMin = target - nowMin;
    var msUntil;

    if (diffMin < -2) return;
    if (diffMin <= 1) {
      msUntil = 5000;
    } else {
      msUntil = (diffMin * 60 - nowSec) * 1000;
    }

    if (nearest === null || msUntil < nearest) nearest = msUntil;
  });

  if (nearest === null) return IDLE_WAIT_MS;
  if (nearest <= DEFAULT_WAIT_MS) return nearest;
  if (nearest > WAKE_EARLY_MS) nearest -= WAKE_EARLY_MS;
  return Math.min(nearest, MAX_SLEEP_MS);
}

function notifyClients(patch) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    list.forEach(function (client) {
      client.postMessage({ type: "STATE_PATCH", patch: patch });
    });
  });
}

function showDoseNotification(dose, diff) {
  var body = dose.name + " · " + dose.time + (diff > 1 ? " (방금 지남)" : "");
  return self.registration.showNotification(NOTIFY_TITLE, {
    body: body,
    tag: NOTIFY_TAG + "-" + dose.key,
    renotify: true,
    icon: "./manifest.json",
    badge: "./manifest.json",
    data: { doseKey: dose.key },
  });
}

function checkDueAndNotify() {
  return loadState().then(function (state) {
    if (!state || !state.medicines || !state.medicines.length) return;

    var dateKey = ensureDayBuckets(state);
    var doses = getTodayDoses(state);
    var nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    var changed = false;
    var tasks = [];

    doses.forEach(function (dose) {
      if (state.taken[dateKey] && state.taken[dateKey][dose.key]) return;
      if (state.notified[dateKey] && state.notified[dateKey][dose.key]) return;

      var target = timeToMinutes(dose.time);
      var diff = nowMin - target;
      if (diff < 0 || diff > 2) return;

      state.notified[dateKey][dose.key] = true;
      changed = true;
      tasks.push(showDoseNotification(dose, diff));
    });

    if (!changed) return;
    return Promise.all(tasks)
      .then(function () {
        return saveState(state);
      })
      .then(function () {
        return notifyClients({ dateKey: dateKey, notified: state.notified[dateKey] });
      });
  });
}

function clearAlarmTimer() {
  if (alarmTimerId) {
    clearTimeout(alarmTimerId);
    alarmTimerId = null;
  }
}

function scheduleNextTick() {
  clearAlarmTimer();
  return loadState().then(function (state) {
    var wait = computeWaitMs(state);
    alarmTimerId = setTimeout(function () {
      checkDueAndNotify()
        .catch(function () {})
        .then(function () {
          return scheduleNextTick();
        });
    }, wait);
  });
}

function runAlarmLoop(token) {
  if (token !== alarmLoopToken) return Promise.resolve();
  return checkDueAndNotify()
    .catch(function () {})
    .then(function () {
      if (token !== alarmLoopToken) return;
      return loadState();
    })
    .then(function (state) {
      if (token !== alarmLoopToken) return;
      return sleep(computeWaitMs(state));
    })
    .then(function () {
      return runAlarmLoop(token);
    });
}

function startAlarms() {
  clearAlarmTimer();
  alarmLoopToken += 1;
  return runAlarmLoop(alarmLoopToken);
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(["./", "./index.html", "./app.css", "./app.js", "./manifest.json", "./sw.js"]);
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== CACHE_NAME;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      })
      .then(function () {
        return loadState();
      })
      .then(function (state) {
        if (state && state.medicines && state.medicines.length) {
          return startAlarms();
        }
      }),
  );
});

self.addEventListener("message", function (event) {
  var data = event.data || {};
  if (data.type === "SYNC_STATE" && data.state) {
    event.waitUntil(
      saveState(data.state).then(function () {
        return startAlarms();
      }),
    );
    return;
  }
  if (data.type === "START_ALARMS") {
    event.waitUntil(startAlarms());
    return;
  }
  if (data.type === "CHECK_NOW") {
    event.waitUntil(checkDueAndNotify());
  }
});

self.addEventListener("periodicsync", function (event) {
  if (event.tag === "pill-dose-check") {
    event.waitUntil(
      checkDueAndNotify()
        .catch(function () {})
        .then(scheduleNextTick),
    );
  }
});

self.addEventListener("sync", function (event) {
  if (event.tag === "pill-dose-check") {
    event.waitUntil(checkDueAndNotify());
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      if (list.length) {
        list[0].focus();
        return;
      }
      return self.clients.openWindow("./");
    }),
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    }),
  );
});
