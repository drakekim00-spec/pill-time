export function getApiBase() {
  var cfg = window.PR_CONFIG || {};
  var base = cfg.apiBase || "";
  return String(base).replace(/\/$/, "");
}

export function hasApiBase() {
  return !!getApiBase();
}

export function getStoredUserKey() {
  try {
    return localStorage.getItem("pill-reminder-user-key") || "";
  } catch (_e) {
    return "";
  }
}

export function setStoredUserKey(userKey) {
  try {
    if (userKey) localStorage.setItem("pill-reminder-user-key", String(userKey));
  } catch (_e) {
    /* ignore */
  }
}

export function wakeApiServer() {
  if (!hasApiBase()) return Promise.resolve({ ok: false, reason: "no_api" });
  return fetch(getApiBase() + "/api/wake", { method: "GET" })
    .then(function (res) {
      return res.json().catch(function () {
        return { ok: false, reason: "bad_json" };
      });
    })
    .catch(function () {
      return { ok: false, reason: "network" };
    });
}

export function syncScheduleToApi(payload) {
  if (!hasApiBase()) return Promise.resolve({ ok: false, reason: "no_api" });
  var userKey = getStoredUserKey();
  if (!userKey) return Promise.resolve({ ok: false, reason: "no_user" });

  return fetch(getApiBase() + "/api/schedule", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PR-User-Key": userKey,
    },
    body: JSON.stringify({
      userKey: userKey,
      notifyEnabled: payload.notifyEnabled !== false,
      medicines: payload.medicines || [],
    }),
  })
    .then(function (res) {
      return res.json().then(function (data) {
        var body = data || {};
        if (!body.ok && res.status >= 400) {
          body.reason = body.reason || "http_" + res.status;
        }
        return body;
      });
    })
    .catch(function () {
      return { ok: false, reason: "network" };
    });
}
