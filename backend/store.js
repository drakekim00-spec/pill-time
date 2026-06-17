import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var DATA_DIR = path.join(__dirname, "data");
var DATA_FILE = path.join(DATA_DIR, "schedules.json");

var state = {
  users: {},
  sent: {},
};

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (_e) {
    /* ignore */
  }
}

function load() {
  ensureDir();
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    var raw = fs.readFileSync(DATA_FILE, "utf8");
    var parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.users = parsed.users || {};
      state.sent = parsed.sent || {};
    }
  } catch (_e) {
    /* ignore */
  }
}

function save() {
  ensureDir();
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ users: state.users, sent: state.sent }, null, 0),
      "utf8",
    );
  } catch (_e) {
    /* ignore */
  }
}

load();

export function getStats() {
  return {
    users: Object.keys(state.users).length,
    active: listActiveUsers().length,
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

function normalizeMedicines(medicines) {
  if (!Array.isArray(medicines)) return [];
  return medicines.map(function (med) {
    var item = Object.assign({}, med || {});
    item.times = (item.times || [])
      .map(normalizeTime)
      .filter(function (time) {
        return !!time;
      });
    return item;
  });
}

export function upsertUser(userKey, payload) {
  var key = String(userKey);
  var prev = state.users[key] || {};
  var medicines = Array.isArray(payload.medicines)
    ? normalizeMedicines(payload.medicines)
    : prev.medicines || [];
  state.users[key] = {
    userKey: key,
    notifyEnabled: !!payload.notifyEnabled,
    medicines: medicines,
    updatedAt: new Date().toISOString(),
  };
  save();
  return state.users[key];
}

export function listScheduleSummary() {
  return listActiveUsers().map(function (user) {
    return {
      userKeyTail: String(user.userKey || "").slice(-6),
      notifyEnabled: !!user.notifyEnabled,
      updatedAt: user.updatedAt || null,
      medicines: (user.medicines || []).map(function (med) {
        return {
          id: med.id,
          name: med.name,
          times: med.times || [],
        };
      }),
    };
  });
}

export function getUser(userKey) {
  return state.users[String(userKey)] || null;
}

export function listActiveUsers() {
  return Object.values(state.users).filter(function (u) {
    return u && u.notifyEnabled && u.medicines && u.medicines.length;
  });
}

export function wasSent(dateKey, userKey, doseKey) {
  var bucket = state.sent[dateKey];
  if (!bucket) return false;
  var userBucket = bucket[String(userKey)];
  return !!(userBucket && userBucket[doseKey]);
}

export function markSent(dateKey, userKey, doseKey) {
  if (!state.sent[dateKey]) state.sent[dateKey] = {};
  if (!state.sent[dateKey][String(userKey)]) state.sent[dateKey][String(userKey)] = {};
  state.sent[dateKey][String(userKey)][doseKey] = true;
  save();
}
