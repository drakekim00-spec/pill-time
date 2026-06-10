import "./pr-config.js";
import { initUiHelp } from "./ui/ui-help.js";
import "./app.js";

function installAitStub() {
  window.PR_AIT = {
    isIapSupported: function () {
      return false;
    },
    purchasePremium: function () {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    },
    grantPremium: function () {
      window.PR_USER_PREMIUM = true;
      window.dispatchEvent(new CustomEvent("pr-premium-granted"));
    },
    requestNotificationAgreement: function () {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    },
    loginForPush: function () {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    },
    isBannerAdSupported: function () {
      return false;
    },
    initBannerAds: function () {
      return Promise.resolve({ ok: false, reason: "unsupported" });
    },
    destroyBannerAds: function () {},
  };
}

function notifyAitReady() {
  window.dispatchEvent(new CustomEvent("pr-ait-ready"));
}

import("./ait-bridge.js")
  .then(notifyAitReady)
  .catch(function () {
    installAitStub();
    notifyAitReady();
  });

window.initUiHelp = initUiHelp;
