import { initUiHelp } from "./ui/ui-help.js";
import { hasApiBase, syncScheduleToApi, wakeApiServer } from "./pr-server.js";

(function () {
  "use strict";

  var STORAGE_KEY = "pill-reminder-v1";
  var PREMIUM_KEY = "pill-reminder-premium";
  var FREE_MED_LIMIT = 2;
  var FREE_TIME_LIMIT = 3;
  var SUBSCRIBE_LABEL = "월 구독 2,200원";
  var TICK_MS = 15000;
  var DUE_WINDOW_MIN = 5;
  var CATCHUP_MIN = 60;
  var NOTIFY_ICON = "./brand-icon.png";
  var swRegistration = null;

  var state = {
    medicines: [],
    taken: {},
    notified: {},
  };

  var pendingTimes = [];
  var lastDateKey = "";

  function $(id) {
    return document.getElementById(id);
  }

  function uid() {
    return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayKey() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function formatTodayLabel() {
    var d = new Date();
    var wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return (
      d.getFullYear() +
      "년 " +
      (d.getMonth() + 1) +
      "월 " +
      d.getDate() +
      "일 (" +
      wd +
      ")"
    );
  }

  function doseKey(medId, time) {
    return medId + "@" + time;
  }

  function isPremiumUser() {
    return window.PR_USER_PREMIUM === true;
  }

  function isTossMiniapp() {
    var bridge = window.PR_AIT;
    return !!(bridge && bridge.isTossMiniapp);
  }

  function isTossWebView() {
    try {
      return !!(
        window.ReactNativeWebView ||
        window.__GRANITE_NATIVE_EMITTER ||
        (window.navigator && /toss|intoss|granite/i.test(window.navigator.userAgent || ""))
      );
    } catch (_e) {
      return false;
    }
  }

  function shouldUseTossNotifyFlow() {
    if (isTossMiniapp()) return true;
    var bridge = window.PR_AIT;
    return !!(
      isTossWebView() &&
      bridge &&
      typeof bridge.requestNotificationAgreement === "function"
    );
  }

  function loadPremium() {
    try {
      if (localStorage.getItem(PREMIUM_KEY) === "1") {
        window.PR_USER_PREMIUM = true;
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function savePremium() {
    try {
      if (isPremiumUser()) {
        localStorage.setItem(PREMIUM_KEY, "1");
      } else {
        localStorage.removeItem(PREMIUM_KEY);
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function grantPremium() {
    window.PR_USER_PREMIUM = true;
    savePremium();
    closePremiumModal();
    renderAll();
    setStatus("월 구독이 적용됐어요. 약 무제한 · 광고 없음");
  }

  function openPremiumModal() {
    var modal = $("prPremiumModal");
    if (!modal) return;
    modal.hidden = false;
  }

  function closePremiumModal() {
    var modal = $("prPremiumModal");
    if (!modal) return;
    modal.hidden = true;
  }

  function handlePremiumClick() {
    if (isPremiumUser()) return;
    openPremiumModal();
  }

  function handlePremiumPurchase() {
    /* [유료 결제 연동 지점] 앱인토스 IAP 연동 시 bridge.purchasePremium() 호출 */
    var bridge = window.PR_AIT;
    if (bridge && bridge.isIapSupported && bridge.isIapSupported()) {
      setStatus("결제 창을 열었어요…");
      bridge.purchasePremium().then(function (result) {
        if (result && result.ok) {
          grantPremium();
          return;
        }
        if (result && result.reason === "unsupported") {
          grantPremium();
          return;
        }
        setStatus("결제가 취소되었거나 실패했어요.", true);
      });
      return;
    }
    grantPremium();
  }

  function setBannersVisible(show) {
    ["prAdBannerTop", "prAdBannerMid"].forEach(function (id) {
      var el = $(id);
      if (el) el.hidden = !show;
    });
    var bridge = window.PR_AIT;
    if (!show && bridge && bridge.destroyBannerAds) bridge.destroyBannerAds();
    else if (show) ensureBannerAds();
  }

  function ensureBannerAds() {
    if (isPremiumUser()) return;
    var bridge = window.PR_AIT;
    if (!bridge || !bridge.initBannerAds) return;

    function retry(delayMs) {
      window.setTimeout(function () {
        if (isPremiumUser()) return;
        if (window.PR_AIT && window.PR_AIT.initBannerAds) {
          window.PR_AIT.initBannerAds();
        }
      }, delayMs);
    }

    bridge.initBannerAds().then(function (result) {
      if (result && result.ok) return;
      retry(2000);
      retry(5000);
    });
  }

  function renderPremiumUI() {
    var btn = $("prPremiumBtn");
    var hint = $("prFreeHint");
    var addBtn = $("prAddMedBtn");
    var timeAddBtn = $("prTimeAddBtn");
    var atMedLimit = state.medicines.length >= FREE_MED_LIMIT;
    var atTimeLimit = pendingTimes.length >= FREE_TIME_LIMIT;

    if (btn) {
      if (isPremiumUser()) {
        btn.textContent = "구독 중 ✓";
        btn.classList.add("is-owned");
        btn.setAttribute("aria-label", "월 구독 사용 중");
      } else {
        btn.textContent = SUBSCRIBE_LABEL;
        btn.classList.remove("is-owned");
        btn.setAttribute("aria-label", SUBSCRIBE_LABEL);
      }
    }

    setBannersVisible(!isPremiumUser());

    if (hint) {
      if (isPremiumUser()) {
        hint.hidden = true;
        hint.classList.remove("is-limit");
      } else {
        hint.hidden = false;
        hint.textContent =
          "무료는 약 최대 " +
          FREE_MED_LIMIT +
          "개 · 약당 시간 최대 " +
          FREE_TIME_LIMIT +
          "개 (" +
          state.medicines.length +
          "/" +
          FREE_MED_LIMIT +
          " · 시간 " +
          pendingTimes.length +
          "/" +
          FREE_TIME_LIMIT +
          ")";
        hint.classList.toggle("is-limit", atMedLimit || atTimeLimit);
      }
    }

    if (addBtn) {
      addBtn.disabled = !isPremiumUser() && atMedLimit;
    }
    if (timeAddBtn) {
      timeAddBtn.disabled = !isPremiumUser() && atTimeLimit;
    }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.medicines)) {
        state.medicines = parsed.medicines;
        state.taken = parsed.taken || {};
        state.notified = parsed.notified || {};
      }
    } catch (_e) {
      /* ignore */
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          medicines: state.medicines,
          taken: state.taken,
          notified: state.notified,
        }),
      );
    } catch (_e) {
      setStatus("저장이 막혀 있어요. 토스 앱을 다시 열어 주세요.", true);
    }
    try {
      syncScheduleToWorker();
    } catch (_e) {
      /* 토스 WebView 등 Notification 없는 환경 */
    }
    pushScheduleToServer();
  }

  function pushScheduleToServer(forceNotify) {
    if (!hasApiBase()) return Promise.resolve({ ok: false, reason: "no_api" });
    return syncScheduleToApi({
      notifyEnabled: forceNotify ? true : isTossNotifyOn(),
      medicines: state.medicines,
    });
  }

  function ensurePushLogin() {
    var bridge = window.PR_AIT;
    if (!hasApiBase() || !bridge || !bridge.loginForPush) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }
    return bridge.loginForPush();
  }

  function getWorkerState() {
    return {
      medicines: state.medicines,
      taken: state.taken,
      notified: state.notified,
    };
  }

  function postToWorker(message) {
    if (!("serviceWorker" in navigator)) return;
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
    if (swRegistration && swRegistration.active) {
      swRegistration.active.postMessage(message);
    }
  }

  function registerPeriodicSync() {
    if (!swRegistration || !swRegistration.periodicSync) return;
    swRegistration.periodicSync.register("pill-dose-check", { minInterval: 15 * 60 * 1000 }).catch(function () {
      /* optional */
    });
  }

  function registerBackgroundSync() {
    if (!swRegistration || !swRegistration.sync) return;
    swRegistration.sync.register("pill-dose-check").catch(function () {
      /* optional */
    });
  }

  function syncScheduleToWorker() {
    if (!("serviceWorker" in navigator)) return;
    var payload = { type: "SYNC_STATE", state: getWorkerState() };
    postToWorker(payload);
    if (hasWebNotify() && Notification.permission === "granted") {
      postToWorker({ type: "START_ALARMS" });
      registerPeriodicSync();
      registerBackgroundSync();
    }
  }

  function applyWorkerPatch(patch) {
    if (!patch || !patch.dateKey || !patch.notified) return;
    if (!state.notified[patch.dateKey]) state.notified[patch.dateKey] = {};
    Object.keys(patch.notified).forEach(function (key) {
      state.notified[patch.dateKey][key] = patch.notified[key];
    });
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          medicines: state.medicines,
          taken: state.taken,
          notified: state.notified,
        }),
      );
    } catch (_e) {
      /* ignore */
    }
    renderAll();
  }

  function ensureDayBuckets() {
    var key = todayKey();
    if (!state.taken[key]) state.taken[key] = {};
    if (!state.notified[key]) state.notified[key] = {};
    return key;
  }

  function setStatus(text, isError) {
    var el = $("prStatus");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function setNotifyHint(text, isError) {
    var hint = $("prNotifyHint");
    if (!hint) return;
    hint.textContent = text || "";
    hint.classList.toggle("is-error", !!isError);
    if (text) {
      hint.dataset.state = isError ? "error" : "busy";
    } else {
      delete hint.dataset.state;
    }
  }

  function loginFailMessage(result) {
    if (!result) return "토스 로그인이 필요해요. 알림 켜기를 다시 눌러 주세요.";
    if (result.reason === "no_code") return "토스 로그인이 취소됐어요. 다시 눌러 주세요.";
    if (result.reason === "unsupported") return "토스 앱에서 다시 열어 주세요.";
    if (result.reason === "no_api") return "서버 주소가 없어요.";
    if (result.reason === "auth_failed") return "로그인 연결에 실패했어요. 잠시 후 다시 눌러 주세요.";
    if (result.reason === "timeout") {
      return "로그인이 오래 걸려요. 약관 창이 안 보이면 다시 눌러 주세요.";
    }
    if (result.reason === "network" || result.reason === "error") {
      return "서버가 잠들었을 수 있어요. 잠시 후 알림 켜기를 다시 눌러 주세요.";
    }
    return "토스 로그인이 필요해요. 알림 켜기를 다시 눌러 주세요.";
  }

  function scheduleFailMessage(result) {
    if (!result) return "서버에 저장이 안 됐어요.";
    if (result.reason === "no_user") return "토스 로그인이 안 됐어요. 알림 켜기를 다시 눌러 주세요.";
    if (result.reason === "network") return "서버 연결이 안 됐어요. 잠시 후 다시 눌러 주세요.";
    if (result.reason === "no_api") return "서버 주소가 없어요.";
    return "약·시간을 서버에 저장하지 못했어요. 다시 눌러 주세요.";
  }

  function wakeServer() {
    wakeApiServer().catch(function () {
      /* optional */
    });
  }

  function finishNotifyEnable(loginResult) {
    var btn = $("prNotifyBtn");

    if (!hasApiBase()) {
      setTossNotifyOn();
      afterNotifyEnabled();
      return Promise.resolve({ ok: true });
    }

    if (!loginResult || !loginResult.ok) {
      clearTossNotifyOn();
      var loginMsg = loginFailMessage(loginResult);
      setNotifyHint(loginMsg, true);
      setStatus(loginMsg, true);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "알림 켜기";
        btn.classList.remove("is-on");
      }
      renderNotifyCard();
      return Promise.resolve({ ok: false, reason: "login" });
    }

    setNotifyHint("서버에 저장 중…");
    return pushScheduleToServer(true).then(function (scheduleResult) {
      if (!scheduleResult || !scheduleResult.ok) {
        clearTossNotifyOn();
        var saveMsg = scheduleFailMessage(scheduleResult);
        setNotifyHint(saveMsg, true);
        setStatus(saveMsg, true);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "알림 켜기";
          btn.classList.remove("is-on");
        }
        renderNotifyCard();
        return { ok: false, reason: "schedule" };
      }
      setTossNotifyOn();
      afterNotifyEnabled();
      return { ok: true };
    });
  }

  function notifyFailMessage(result) {
    if (!result) return "알림 동의가 필요해요.";
    if (result.reason === "rejected") return "알림 수신을 거부했어요.";
    if (result.reason === "timeout") {
      return "동의 창이 안 열렸어요. 토스 앱을 최신으로 올리고, 콘솔 동의문 코드를 확인해 주세요.";
    }
    if (result.reason === "unsupported") {
      return "토스 앱에서 다시 열어 주세요.";
    }
    if (result.reason === "unsupported_version") {
      return "토스 앱을 최신 버전으로 업데이트한 뒤 다시 눌러 주세요.";
    }
    if (result.reason === "bad_template") {
      return "동의문 코드가 맞지 않아요. 콘솔 스마트발송 → 알림동의문에서 코드를 확인해 주세요.";
    }
    if (result.reason === "unknown_event") {
      return "동의 결과를 못 읽었어요. 다시 눌러 주세요.";
    }
    if (result.reason === "error") {
      return "동의 요청에 실패했어요. 콘솔 동의문 코드(pill-time-templateCode)와 최신 ait 업로드를 확인해 주세요.";
    }
    return "토스 알림 동의가 필요해요.";
  }

  function normalizeTime(value) {
    if (!value) return "";
    var parts = value.split(":");
    if (parts.length < 2) return "";
    return parts[0].padStart(2, "0") + ":" + parts[1].padStart(2, "0");
  }

  function timeToMinutes(time) {
    var p = time.split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function nowMinutes() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function getTodayDoses() {
    var doses = [];
    state.medicines.forEach(function (med) {
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

  function isTaken(dateKey, key) {
    return !!(state.taken[dateKey] && state.taken[dateKey][key]);
  }

  function toggleTaken(key) {
    var dateKey = ensureDayBuckets();
    if (!state.taken[dateKey][key]) {
      state.taken[dateKey][key] = true;
    } else {
      delete state.taken[dateKey][key];
    }
    saveState();
    renderAll();
  }

  function renderProgress(doses, dateKey) {
    var total = doses.length;
    var done = doses.filter(function (d) {
      return isTaken(dateKey, d.key);
    }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    var fill = $("prProgressFill");
    var text = $("prProgressText");
    if (fill) fill.style.width = pct + "%";
    if (text) {
      text.textContent =
        total === 0
          ? "오늘 등록된 복약이 없어요"
          : "오늘 " + done + " / " + total + " 완료";
    }
  }

  function removeDose(medId, time, name) {
    var label = "「" + name + " " + time + "」";
    if (!confirm(label + "을(를) 삭제할까요?")) return;

    state.medicines.forEach(function (med) {
      if (med.id !== medId) return;
      med.times = (med.times || []).filter(function (t) {
        return t !== time;
      });
    });
    state.medicines = state.medicines.filter(function (med) {
      return (med.times || []).length > 0;
    });
    saveState();
    renderAll();
    setStatus(label + "을(를) 삭제했어요.");
  }

  function renderTodayList() {
    var list = $("prTodayList");
    var empty = $("prTodayEmpty");
    if (!list) return;

    var dateKey = ensureDayBuckets();
    var doses = getTodayDoses();
    var now = nowMinutes();

    list.innerHTML = "";
    doses.forEach(function (dose) {
      var taken = isTaken(dateKey, dose.key);
      var mins = timeToMinutes(dose.time);
      var overdue = !taken && mins < now;

      var li = document.createElement("li");
      li.className = "pr-dose-row";

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pr-dose-item" + (taken ? " is-taken" : "") + (overdue ? " is-overdue" : "");
      btn.setAttribute("aria-pressed", taken ? "true" : "false");

      btn.innerHTML =
        '<span class="pr-dose-check" aria-hidden="true">' +
        (taken ? "✓" : "") +
        "</span>" +
        '<span class="pr-dose-main">' +
        '<div class="pr-dose-time">' +
        dose.time +
        "</div>" +
        '<div class="pr-dose-name">' +
        escapeHtml(dose.name) +
        "</div>" +
        "</span>" +
        '<span class="pr-dose-badge">' +
        (taken ? "완료" : overdue ? "지남" : "예정") +
        "</span>";

      btn.addEventListener("click", function () {
        toggleTaken(dose.key);
      });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "ui-btn pr-dose-del";
      delBtn.textContent = "삭제";
      delBtn.setAttribute("aria-label", dose.name + " " + dose.time + " 삭제");
      delBtn.addEventListener("click", function () {
        removeDose(dose.medId, dose.time, dose.name);
      });

      li.appendChild(btn);
      li.appendChild(delBtn);
      list.appendChild(li);
    });

    if (empty) empty.hidden = doses.length > 0;
    renderProgress(doses, dateKey);
  }

  function renderMedList() {
    var card = $("prMedsCard");
    var list = $("prMedList");
    if (!list || !card) return;

    if (!state.medicines.length) {
      card.hidden = true;
      list.innerHTML = "";
      return;
    }

    card.hidden = false;
    list.innerHTML = "";

    state.medicines.forEach(function (med) {
      var li = document.createElement("li");
      li.className = "pr-med-item";

      var times = (med.times || []).slice().sort(function (a, b) {
        return timeToMinutes(a) - timeToMinutes(b);
      });

      li.innerHTML =
        '<p class="pr-med-name">' +
        escapeHtml(med.name) +
        "</p>" +
        '<p class="pr-med-times">매일 ' +
        escapeHtml(times.join(", ")) +
        "</p>" +
        '<div class="pr-med-actions">' +
        '<button type="button" class="ui-btn pr-med-del">삭제</button>' +
        "</div>";

      li.querySelector(".pr-med-del").addEventListener("click", function () {
        if (!confirm("「" + med.name + "」을(를) 삭제할까요?")) return;
        state.medicines = state.medicines.filter(function (m) {
          return m.id !== med.id;
        });
        saveState();
        renderAll();
        setStatus("약을 삭제했어요.");
      });

      list.appendChild(li);
    });
  }

  function renderTimeChips() {
    var ul = $("prTimeChips");
    if (!ul) return;
    ul.innerHTML = "";
    pendingTimes.forEach(function (time) {
      var li = document.createElement("li");
      li.className = "pr-time-chip";
      li.innerHTML =
        "<span>" +
        time +
        '</span><button type="button" aria-label="시간 삭제">×</button>';
      li.querySelector("button").addEventListener("click", function () {
        pendingTimes = pendingTimes.filter(function (t) {
          return t !== time;
        });
        renderTimeChips();
        renderPremiumUI();
      });
      ul.appendChild(li);
    });
  }

  function renderDateLabel() {
    var el = $("prTodayLabel");
    if (el) el.textContent = formatTodayLabel();
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderNotifyCard() {
    var card = $("prNotifyCard");
    var hint = $("prNotifyHint");
    var btn = $("prNotifyBtn");
    if (!card) return;

    card.hidden = false;

    if (btn) {
      btn.hidden = false;
      btn.disabled = false;
      btn.classList.remove("is-on");
      btn.textContent = "알림 켜기";
    }

    var notifyOn = isNotifyEnabled();

    if (notifyOn) {
      if (btn) {
        btn.textContent = "알림 켜졌음";
        btn.classList.add("is-on");
      }
      if (hint) {
        if (isTossMiniapp() && hasApiBase()) {
          hint.textContent =
            "알림이 켜져 있어요. 동의 화면을 다시 보려면 버튼을 한 번 더 눌러 주세요.";
        } else if (hasWebNotify()) {
          hint.textContent = "알림이 켜져 있어요. 정해진 시간에 알려 드릴게요.";
        } else {
          hint.textContent = "알림이 켜져 있어요. 앱을 켜 둔 동안 화면으로 알려 드려요.";
        }
      }
      return;
    }

    if (hint) {
      if (hint.dataset.state === "error" || hint.dataset.state === "busy") {
        /* 버튼 누른 직후 안내·오류 문구는 여기서 지우지 않음 */
      } else if (isTossMiniapp() || shouldUseTossNotifyFlow()) {
        hint.textContent = "토스 알림 허용이 필요해요. 아래 버튼을 눌러 주세요.";
      } else if (hasWebNotify() && Notification.permission === "denied") {
        hint.textContent = "알림이 꺼져 있어요. 토스 설정에서 이 앱 알림을 허용해 주세요.";
      } else if (!hasWebNotify() && hasTossNotifyBridge()) {
        hint.textContent = "토스 알림 허용이 필요해요. 아래 버튼을 눌러 주세요.";
      } else {
        hint.textContent = "허용하면 정해진 시간에 알려 드려요.";
      }
    }
  }

  function renderAll() {
    renderDateLabel();
    renderTodayList();
    renderMedList();
    renderTimeChips();
    renderNotifyCard();
    renderPremiumUI();
  }

  function addPendingTime() {
    var input = $("prMedTime");
    var time = normalizeTime(input && input.value);
    if (!time) {
      setStatus("시간을 선택해 주세요.", true);
      return;
    }
    if (pendingTimes.indexOf(time) >= 0) {
      setStatus("이미 추가한 시간이에요.", true);
      return;
    }
    if (!isPremiumUser() && pendingTimes.length >= FREE_TIME_LIMIT) {
      setStatus(
        "무료는 약 1개당 시간을 최대 " +
          FREE_TIME_LIMIT +
          "개까지만 추가할 수 있어요. " +
          SUBSCRIBE_LABEL +
          "을 이용해 주세요.",
        true,
      );
      openPremiumModal();
      return;
    }
    pendingTimes.push(time);
    pendingTimes.sort(function (a, b) {
      return timeToMinutes(a) - timeToMinutes(b);
    });
    renderTimeChips();
    renderPremiumUI();
    setStatus("");
  }

  function addMedicine() {
    var nameEl = $("prMedName");
    var name = nameEl && nameEl.value ? nameEl.value.trim() : "";
    if (!name) {
      setStatus("약 이름을 입력해 주세요.", true);
      return;
    }
    if (!pendingTimes.length) {
      setStatus("먹을 시간을 하나 이상 추가해 주세요.", true);
      return;
    }
    if (!isPremiumUser() && pendingTimes.length > FREE_TIME_LIMIT) {
      setStatus(
        "무료는 약 1개당 시간을 최대 " + FREE_TIME_LIMIT + "개까지만 등록할 수 있어요.",
        true,
      );
      openPremiumModal();
      return;
    }
    if (!isPremiumUser() && state.medicines.length >= FREE_MED_LIMIT) {
      setStatus(
        "무료는 약을 최대 " + FREE_MED_LIMIT + "개까지만 등록할 수 있어요. 월 구독을 이용해 주세요.",
        true,
      );
      openPremiumModal();
      return;
    }

    state.medicines.push({
      id: uid(),
      name: name,
      times: pendingTimes.slice(),
    });
    saveState();

    pendingTimes = [];
    if (nameEl) nameEl.value = "";
    renderTimeChips();
    renderAll();
    setStatus("「" + name + "」을(를) 등록했어요. 위 「먹을 약」에 추가됐어요.");
    var todayList = $("prTodayList");
    if (todayList && todayList.scrollIntoView) {
      todayList.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  var TOSS_NOTIFY_KEY = "pill-reminder-toss-agree-v2";
  var TOSS_NOTIFY_LEGACY_KEY = "pill-reminder-toss-notify";

  function hasWebNotify() {
    return typeof window.Notification !== "undefined";
  }

  function hasTossNotifyBridge() {
    return shouldUseTossNotifyFlow();
  }

  function hasTossNotifyTemplate() {
    var cfg = window.PR_CONFIG || {};
    return !!(cfg.notifyAgreementTemplateCode && String(cfg.notifyAgreementTemplateCode).trim());
  }

  function getNotifyTemplateCode() {
    var cfg = window.PR_CONFIG || {};
    return String(cfg.notifyAgreementTemplateCode || "").trim();
  }

  function clearLegacyNotifyFlags() {
    try {
      localStorage.removeItem(TOSS_NOTIFY_LEGACY_KEY);
    } catch (_e) {
      /* ignore */
    }
  }

  function isTossNotifyOn() {
    if (!shouldUseTossNotifyFlow()) {
      try {
        return localStorage.getItem(TOSS_NOTIFY_LEGACY_KEY) === "1";
      } catch (_e) {
        return false;
      }
    }
    try {
      var raw = localStorage.getItem(TOSS_NOTIFY_KEY);
      if (!raw) return false;
      var rec = JSON.parse(raw);
      var code = getNotifyTemplateCode();
      return !!(rec && rec.agreed === true && code && rec.templateCode === code);
    } catch (_e) {
      return false;
    }
  }

  function isNotifyEnabled() {
    if (shouldUseTossNotifyFlow()) {
      return isTossNotifyOn();
    }
    return (
      isTossNotifyOn() ||
      (hasWebNotify() && Notification.permission === "granted")
    );
  }

  function setTossNotifyOn() {
    try {
      if (shouldUseTossNotifyFlow()) {
        localStorage.setItem(
          TOSS_NOTIFY_KEY,
          JSON.stringify({
            agreed: true,
            templateCode: getNotifyTemplateCode(),
            at: Date.now(),
          }),
        );
        clearLegacyNotifyFlags();
        return;
      }
      localStorage.setItem(TOSS_NOTIFY_LEGACY_KEY, "1");
    } catch (_e) {
      /* ignore */
    }
  }

  function clearTossNotifyOn() {
    try {
      localStorage.removeItem(TOSS_NOTIFY_KEY);
      clearLegacyNotifyFlags();
    } catch (_e) {
      /* ignore */
    }
  }

  function requestTossNotifyAgreement() {
    if (!hasTossNotifyBridge()) {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    }
    if (!hasTossNotifyTemplate()) {
      return Promise.resolve({ ok: false, reason: "no_template" });
    }
    var bridge = window.PR_AIT;
    var cfg = window.PR_CONFIG || {};
    return bridge.requestNotificationAgreement(cfg.notifyAgreementTemplateCode);
  }

  function showInAppDoseAlert(dose, diff) {
    var msg =
      "💊 " +
      dose.name +
      " · " +
      dose.time +
      (diff > 1 ? " (방금 지남)" : "") +
      " 먹을 시간이에요.";
    setStatus(msg);
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }

  function afterNotifyEnabled() {
    try {
      syncScheduleToWorker();
    } catch (_e) {
      /* ignore */
    }
    tryNotifyDueDoses(true, CATCHUP_MIN);
    var hint = $("prNotifyHint");
    if (hint) delete hint.dataset.state;
    var btn = $("prNotifyBtn");
    if (btn) btn.disabled = false;
    renderNotifyCard();
    if (hasApiBase() && isTossNotifyOn()) {
      setStatus("알림을 켰어요. 정해진 시간에 토스로 알려 드릴게요.");
    } else if (hasWebNotify() && Notification.permission === "granted") {
      setStatus("알림을 켰어요. 정해진 시간에 알려 드릴게요.");
    } else if (isTossNotifyOn()) {
      setStatus("알림을 켰어요. 앱을 켜 둔 동안 화면으로 알려 드릴게요.");
    } else {
      setStatus("알림을 켰어요.");
    }
    if (navigator.vibrate) navigator.vibrate(80);
  }

  function resetNotifyButton() {
    var btn = $("prNotifyBtn");
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = "알림 켜기";
    btn.classList.remove("is-on");
  }

  function proceedTossNotifyAgreement() {
    if (!hasTossNotifyTemplate()) {
      setNotifyHint("알림 동의문 코드가 없어요.", true);
      setStatus("알림 동의문 코드가 없어요.", true);
      renderNotifyCard();
      resetNotifyButton();
      return;
    }
    setNotifyHint("동의 창을 여는 중…");
    requestTossNotifyAgreement().then(function (result) {
      if (result && result.ok) {
        setNotifyHint("동의했어요. 연결 중…");
        wakeServer();
        ensurePushLogin().then(function (loginResult) {
          finishNotifyEnable(loginResult);
        });
        return;
      }
      if (result && result.reason === "rejected") {
        clearTossNotifyOn();
      }
      var msg = notifyFailMessage(result);
      setNotifyHint(msg, true);
      setStatus(msg, true);
      resetNotifyButton();
      renderNotifyCard();
    });
  }

  function runTossNotifyFlow() {
    var btn = $("prNotifyBtn");
    if (btn) btn.disabled = true;
    setNotifyHint("동의 창을 여는 중…");
    wakeServer();
    proceedTossNotifyAgreement();
  }

  function requestNotifyPermission() {
    setStatus("알림 설정 중…");
    setNotifyHint("잠시만요…");

    if (!window.PR_AIT) {
      window.addEventListener(
        "pr-ait-ready",
        function () {
          requestNotifyPermission();
        },
        { once: true },
      );
      return;
    }

    if (shouldUseTossNotifyFlow()) {
      runTossNotifyFlow();
      return;
    }

    if (isTossWebView()) {
      var stuckMsg = "토스 연결이 안 됐어요. 최신 ait를 다시 올려 주세요.";
      setNotifyHint(stuckMsg, true);
      setStatus(stuckMsg, true);
      return;
    }

    if (hasWebNotify() && Notification.permission === "granted") {
      requestTossNotifyAgreement().finally(function () {
        setStatus("이미 알림이 켜져 있어요.");
        renderNotifyCard();
      });
      return;
    }

    if (hasWebNotify() && Notification.permission !== "denied") {
      Notification.requestPermission().then(function () {
        if (Notification.permission === "granted") {
          return requestTossNotifyAgreement().then(function () {
            afterNotifyEnabled();
          });
        }
        if (Notification.permission === "denied") {
          setStatus("알림이 거부됐어요. 토스 설정에서 알림을 켜 주세요.", true);
        } else {
          setStatus("알림 허용이 필요해요.", true);
        }
        renderNotifyCard();
      });
      return;
    }

    setStatus("토스 앱에서 열어 주세요. 여기서는 알림을 켤 수 없어요.", true);
  }

  function showNotification(title, body, tag) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    var options = {
      body: body,
      tag: tag || "pill-reminder",
      renotify: true,
      icon: NOTIFY_ICON,
      badge: NOTIFY_ICON,
    };
    try {
      if (swRegistration && swRegistration.showNotification) {
        swRegistration.showNotification(title, options);
      } else {
        var n = new Notification(title, options);
        n.onclick = function () {
          window.focus();
          n.close();
        };
      }
    } catch (_e) {
      /* ignore */
    }
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }

  function tryNotifyDueDoses(forceNow, catchUpMin) {
    if (!isNotifyEnabled()) return;

    var dateKey = ensureDayBuckets();
    var doses = getTodayDoses();
    var now = nowMinutes();
    var pastLimit = catchUpMin != null ? catchUpMin : forceNow ? CATCHUP_MIN : DUE_WINDOW_MIN;
    var canPush =
      !isTossMiniapp() && hasWebNotify() && Notification.permission === "granted";

    doses.forEach(function (dose) {
      if (isTaken(dateKey, dose.key)) return;
      if (state.notified[dateKey][dose.key]) return;

      var target = timeToMinutes(dose.time);
      var diff = now - target;
      if (diff < -1 || diff > pastLimit) return;

      state.notified[dateKey][dose.key] = true;
      saveState();
      if (canPush) {
        showNotification(
          "💊 약 먹을 시간",
          dose.name + " · " + dose.time + (diff > 1 ? " (방금 지남)" : ""),
          "pill-reminder-" + dose.key,
        );
      } else {
        showInAppDoseAlert(dose, diff);
      }
    });
  }

  function onDayChange() {
    var key = todayKey();
    if (key === lastDateKey) return;
    lastDateKey = key;
    ensureDayBuckets();
    renderAll();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return Promise.resolve();
    return navigator.serviceWorker
      .register("sw.js")
      .then(function (reg) {
        swRegistration = reg;
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        return navigator.serviceWorker.ready;
      })
      .then(function (reg) {
        swRegistration = reg;
        if (reg.waiting && reg.waiting.state === "installed") {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        return reg.update().catch(function () {});
      })
      .then(function () {
        syncScheduleToWorker();
      })
      .catch(function () {
        /* optional */
      });
  }

  function bindServiceWorkerMessages() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.type === "STATE_PATCH") applyWorkerPatch(data.patch);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        postToWorker({ type: "CHECK_NOW" });
        tryNotifyDueDoses(true, CATCHUP_MIN);
      }
    });
  }

  function bootApp() {
    if (window.__PR_APP_BOOTED) return;
    window.__PR_APP_BOOTED = true;

    try {
      initUiHelp();
    } catch (_e) {
      /* optional */
    }

    loadPremium();
    clearLegacyNotifyFlags();
    loadState();
    wakeServer();
    lastDateKey = todayKey();
    ensureDayBuckets();

    var addTimeBtn = $("prTimeAddBtn");
    var addMedBtn = $("prAddMedBtn");
    var notifyBtn = $("prNotifyBtn");
    var premiumBtn = $("prPremiumBtn");
    var premiumBuyBtn = $("prPremiumBuyBtn");
    var premiumCloseBtn = $("prPremiumCloseBtn");
    var premiumBackdrop = $("prPremiumBackdrop");

    if (addTimeBtn) addTimeBtn.addEventListener("click", addPendingTime);
    if (addMedBtn) addMedBtn.addEventListener("click", addMedicine);
    if (notifyBtn) notifyBtn.addEventListener("click", requestNotifyPermission);
    if (premiumBtn) premiumBtn.addEventListener("click", handlePremiumClick);
    if (premiumBuyBtn) premiumBuyBtn.addEventListener("click", handlePremiumPurchase);
    if (premiumCloseBtn) premiumCloseBtn.addEventListener("click", closePremiumModal);
    if (premiumBackdrop) premiumBackdrop.addEventListener("click", closePremiumModal);

    window.addEventListener("pr-premium-granted", grantPremium);
    window.addEventListener("pr-ait-ready", ensureBannerAds);

    renderAll();
    ensureBannerAds();
    tryNotifyDueDoses(false);
    setInterval(function () {
      onDayChange();
      tryNotifyDueDoses(false);
      if (hasWebNotify() && Notification.permission === "granted") {
        syncScheduleToWorker();
      }
    }, TICK_MS);

    bindServiceWorkerMessages();
    registerServiceWorker();
  }

  function scheduleBoot() {
    if (window.__PR_APP_BOOTED) return;
    function start() {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootApp, { once: true });
      } else {
        bootApp();
      }
    }
    if (window.PR_AIT) {
      start();
      return;
    }
    window.addEventListener(
      "pr-ait-ready",
      function () {
        start();
      },
      { once: true },
    );
  }

  scheduleBoot();
})();
