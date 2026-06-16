import "./pr-config.js";
import "./ait-bridge.js";
import { initUiHelp } from "./ui/ui-help.js";
import "./app.js";

function notifyAitReady() {
  window.dispatchEvent(new CustomEvent("pr-ait-ready"));
}

notifyAitReady();
window.initUiHelp = initUiHelp;
