/**
 * 약먹을시간 — 앱인토스 WebView (배너 · 인앱결제)
 */
import {
  IAP,
  TossAds,
  appLogin,
  requestNotificationAgreement,
} from "@apps-in-toss/web-framework";
import { getApiBase, setStoredUserKey } from "./pr-server.js";

function grantPremium() {
  window.PR_USER_PREMIUM = true;
  window.dispatchEvent(new CustomEvent("pr-premium-granted"));
}

function getPremiumSku() {
  var cfg = window.PR_CONFIG || {};
  return cfg.iapSkuPremium || "";
}

function getBannerAdGroupIds() {
  var cfg = window.PR_CONFIG || {};
  return {
    top: cfg.bannerAdGroupIdTop || "",
    mid: cfg.bannerAdGroupIdMid || "",
  };
}

function isIapSupported() {
  try {
    return (
      typeof IAP !== "undefined" &&
      typeof IAP.createSubscriptionPurchaseOrder === "function" &&
      !!getPremiumSku()
    );
  } catch (_e) {
    return false;
  }
}

function purchasePremium() {
  if (!isIapSupported()) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }

  return new Promise(function (resolve) {
    var settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    try {
      var cleanup = IAP.createSubscriptionPurchaseOrder({
        options: {
          sku: getPremiumSku(),
          processProductGrant: function () {
            grantPremium();
            return true;
          },
        },
        onEvent: function (event) {
          if (event && event.type === "success") grantPremium();
          cleanup();
          finish({ ok: !!(event && event.type === "success"), event: event });
        },
        onError: function (error) {
          cleanup();
          finish({ ok: false, reason: "error", error: error });
        },
      });
    } catch (error) {
      finish({ ok: false, reason: "error", error: error });
    }
  });
}

var bannerSlots = [];
var tossAdsInitialized = false;
var bannerInitPromise = null;

function isBannerAdSupported() {
  try {
    return (
      typeof TossAds !== "undefined" &&
      TossAds.initialize &&
      TossAds.attachBanner
    );
  } catch (_e) {
    return false;
  }
}

function clearBannerSlot(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function attachBannerSlot(adGroupId, slotId) {
  if (!adGroupId) return null;
  var el = document.getElementById(slotId);
  if (!el) return null;
  clearBannerSlot(el);
  el.classList.add("is-live");
  return TossAds.attachBanner(adGroupId, el, {
    theme: "auto",
    variant: "expanded",
  });
}

function mountBannerAds() {
  destroyBannerAds();
  var ids = getBannerAdGroupIds();
  var top = attachBannerSlot(ids.top, "prAdBannerTopSlot");
  var mid = attachBannerSlot(ids.mid, "prAdBannerMidSlot");
  if (top) bannerSlots.push(top);
  if (mid) bannerSlots.push(mid);
}

function destroyBannerAds() {
  bannerSlots.forEach(function (slot) {
    if (slot && slot.destroy) slot.destroy();
  });
  bannerSlots = [];
  try {
    if (TossAds.destroyAll) TossAds.destroyAll();
  } catch (_e) {
    /* ignore */
  }
}

function initBannerAds() {
  if (!isBannerAdSupported()) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }
  if (bannerInitPromise) return bannerInitPromise;

  bannerInitPromise = new Promise(function (resolve) {
    function done(result) {
      if (!result || !result.ok) bannerInitPromise = null;
      resolve(result || { ok: false, reason: "init_failed" });
    }

    if (tossAdsInitialized) {
      mountBannerAds();
      resolve({ ok: true, reason: "already_initialized" });
      return;
    }

    try {
      TossAds.initialize({
        callbacks: {
          onInitialized: function () {
            tossAdsInitialized = true;
            mountBannerAds();
            resolve({ ok: true });
          },
          onInitializationFailed: function () {
            done({ ok: false, reason: "init_failed" });
          },
        },
      });
    } catch (_e) {
      done({ ok: false, reason: "error" });
    }
  });

  return bannerInitPromise;
}

var activeAgreementCleanup = null;

function releaseAgreementCleanup() {
  if (!activeAgreementCleanup) return;
  try {
    activeAgreementCleanup();
  } catch (_e) {
    /* ignore */
  }
  activeAgreementCleanup = null;
}

function parseAgreementBridgeError(error) {
  var msg = "";
  var code = "";
  if (typeof error === "string") {
    msg = error;
  } else if (error && typeof error === "object") {
    if (error.message) msg = String(error.message);
    else if (error.reason) msg = String(error.reason);
    if (error.errorCode != null) code = String(error.errorCode);
    else if (error.code != null) code = String(error.code);
    if (!msg) {
      try {
        msg = JSON.stringify(error);
      } catch (_e) {
        msg = String(error);
      }
    }
  } else if (error != null) {
    msg = String(error);
  }
  var hay = (msg + " " + code).toLowerCase();
  if (/version|unsupported|min.?version|5\.25|업데이트/.test(hay)) {
    return { reason: "unsupported_version", detail: msg, error: error };
  }
  if (/template|not.?found|invalid|존재|없|코드/.test(hay)) {
    return { reason: "bad_template", detail: msg, error: error };
  }
  return { reason: "error", detail: msg, error: error };
}

function requestNotificationAgreementByCode(templateCode) {
  if (!templateCode || typeof requestNotificationAgreement !== "function") {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }
  releaseAgreementCleanup();
  return new Promise(function (resolve) {
    var settled = false;
    var timer = null;
    var cleanup = null;
    function finish(result) {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      releaseAgreementCleanup();
      resolve(result);
    }
    timer = window.setTimeout(function () {
      finish({ ok: false, reason: "timeout" });
    }, 20000);
    try {
      cleanup = requestNotificationAgreement({
        options: { templateCode: String(templateCode).trim() },
        onEvent: function (event) {
          var type =
            typeof event === "string"
              ? event
              : event && (event.type || event.result || event.agreementResult);
          if (type === "newAgreement" || type === "alreadyAgreed") {
            if (cleanup) cleanup();
            finish({ ok: true, event: event });
            return;
          }
          if (type === "agreementRejected") {
            if (cleanup) cleanup();
            finish({ ok: false, reason: "rejected", event: event });
            return;
          }
          if (cleanup) cleanup();
          finish({ ok: false, reason: "unknown_event", event: event, type: type });
        },
        onError: function (error) {
          if (cleanup) cleanup();
          var parsed = parseAgreementBridgeError(error);
          finish(parsed);
        },
      });
      activeAgreementCleanup = cleanup;
    } catch (error) {
      finish(parseAgreementBridgeError(error));
    }
  });
}

function loginForPush() {
  var existing = getStoredUserKey();
  if (existing) {
    return Promise.resolve({ ok: true, userKey: existing });
  }
  if (!getApiBase()) {
    return Promise.resolve({ ok: false, reason: "no_api" });
  }
  if (typeof appLogin !== "function") {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }
  return appLogin()
    .then(function (auth) {
      if (!auth || !auth.authorizationCode) {
        return { ok: false, reason: "no_code" };
      }
      return fetch(getApiBase() + "/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorizationCode: auth.authorizationCode,
          referrer: auth.referrer || "DEFAULT",
        }),
      }).then(function (res) {
        if (!res.ok) {
          return { ok: false, reason: res.status === 503 ? "network" : "auth_failed" };
        }
        return res.json().then(function (data) {
          if (data && data.ok && data.userKey) {
            setStoredUserKey(data.userKey);
            return { ok: true, userKey: data.userKey };
          }
          return { ok: false, reason: "auth_failed", data: data };
        });
      });
    })
    .catch(function (error) {
      return { ok: false, reason: "error", error: error };
    });
}

window.PR_AIT = {
  isTossMiniapp: true,
  isIapSupported: isIapSupported,
  purchasePremium: purchasePremium,
  grantPremium: grantPremium,
  requestNotificationAgreement: requestNotificationAgreementByCode,
  loginForPush: loginForPush,
  isBannerAdSupported: isBannerAdSupported,
  initBannerAds: initBannerAds,
  destroyBannerAds: destroyBannerAds,
};
