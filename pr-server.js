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
      return res.json().catch(function () {
        return { ok: false };
      });
    })
    .catch(function () {
      return { ok: false, reason: "network" };
    });
}
