var preset = window.PR_CONFIG || {};
var iapSkuPremium = preset.iapSkuPremium || "sub.uf9.mq6entjm.26cfc803f2";
var bannerAdGroupIdTop =
  preset.bannerAdGroupIdTop || "ait.v2.live.100714c17799446f";
var bannerAdGroupIdMid =
  preset.bannerAdGroupIdMid || "ait.v2.live.be9f36b5ccd746af";
var notifyAgreementTemplateCode = preset.notifyAgreementTemplateCode || "";
var notifyTemplateSetCode = preset.notifyTemplateSetCode || "pill-time-templateSetCode";
var apiBase = preset.apiBase || "";

if (typeof import.meta !== "undefined" && import.meta.env) {
  if (import.meta.env.VITE_IAP_SKU_PREMIUM) {
    iapSkuPremium = import.meta.env.VITE_IAP_SKU_PREMIUM;
  }
  if (import.meta.env.VITE_AD_BANNER_TOP_GROUP_ID) {
    bannerAdGroupIdTop = import.meta.env.VITE_AD_BANNER_TOP_GROUP_ID;
  }
  if (import.meta.env.VITE_AD_BANNER_MID_GROUP_ID) {
    bannerAdGroupIdMid = import.meta.env.VITE_AD_BANNER_MID_GROUP_ID;
  }
  if (import.meta.env.VITE_NOTIFY_AGREEMENT_TEMPLATE_CODE) {
    notifyAgreementTemplateCode = import.meta.env.VITE_NOTIFY_AGREEMENT_TEMPLATE_CODE;
  }
  if (import.meta.env.VITE_NOTIFY_TEMPLATE_SET_CODE) {
    notifyTemplateSetCode = import.meta.env.VITE_NOTIFY_TEMPLATE_SET_CODE;
  }
  if (import.meta.env.VITE_API_BASE) {
    apiBase = import.meta.env.VITE_API_BASE;
  }
}

window.PR_CONFIG = {
  iapSkuPremium: iapSkuPremium,
  bannerAdGroupIdTop: bannerAdGroupIdTop,
  bannerAdGroupIdMid: bannerAdGroupIdMid,
  notifyAgreementTemplateCode: notifyAgreementTemplateCode,
  notifyTemplateSetCode: notifyTemplateSetCode,
  apiBase: apiBase,
};
