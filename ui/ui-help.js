/**
 * 나만의 UI — 물음표(?) 도움말 동작
 */
export function initUiHelp() {
  function closeAll(except) {
    document.querySelectorAll(".ui-help-popover.is-open").forEach(function (pop) {
      if (pop === except) return;
      pop.classList.remove("is-open");
      var btn = pop.closest(".ui-help") && pop.closest(".ui-help").querySelector(".ui-help-btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  function toggle(helpEl, btn, pop) {
    var open = !pop.classList.contains("is-open");
    closeAll(open ? pop : null);
    pop.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      var rect = pop.getBoundingClientRect();
      helpEl.classList.toggle("popover-up", rect.bottom > window.innerHeight - 8);
    } else {
      helpEl.classList.remove("popover-up");
    }
  }

  document.querySelectorAll(".ui-help").forEach(function (helpEl) {
    var btn = helpEl.querySelector(".ui-help-btn");
    var pop = helpEl.querySelector(".ui-help-popover");
    if (!btn || !pop) return;
    if (btn.dataset.uiHelpBound === "1") return;
    btn.dataset.uiHelpBound = "1";

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      toggle(helpEl, btn, pop);
    });

    pop.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  });

  if (!document.documentElement.dataset.uiHelpDocBound) {
    document.documentElement.dataset.uiHelpDocBound = "1";
    document.addEventListener(
      "click",
      function (e) {
        if (e.target.closest(".ui-help")) return;
        closeAll(null);
      },
      true,
    );
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll(null);
    });
  }
}
