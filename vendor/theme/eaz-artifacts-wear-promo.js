/**
 * EAZPIRE Artifacts — Wear hub promo (NFTs tab, after first unlock).
 */
(function () {
  "use strict";

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  function countUnlockedArtifacts(slots) {
    return (slots || []).filter(function (s) {
      return s && s.artwork_url && s.generation_status !== "failed";
    }).length;
  }

  function updateVisibility(slots, section) {
    var wrap = document.getElementById("eaz-artifacts-wear-promo-wrap");
    if (!wrap) return;
    var show = section === "collection" && countUnlockedArtifacts(slots) >= 1;
    wrap.hidden = !show;
  }

  function openWearHub() {
    if (window.EazOpenWearHub && typeof window.EazOpenWearHub.open === "function") {
      window.EazOpenWearHub.open();
    } else {
      window.open("https://wear.eazpire.com/", "_blank", "noopener,noreferrer");
    }
  }

  function bindClick() {
    var btn = document.getElementById("eaz-artifacts-wear-promo");
    if (!btn || btn.getAttribute("data-eaz-wear-promo-bound") === "1") return;
    btn.setAttribute("data-eaz-wear-promo-bound", "1");
    btn.addEventListener("click", openWearHub);
    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openWearHub();
      }
    });
    var label = btn.querySelector(".eaz-artifacts-wear-promo__label");
    if (label && !label.textContent) {
      label.textContent = t("eazy_chat.artifacts_unlock_wear_now", "Unlock eazpire Wear Now");
    }
    btn.setAttribute(
      "aria-label",
      t("eazy_chat.artifacts_unlock_wear_now", "Unlock eazpire Wear Now")
    );
  }

  function init() {
    bindClick();
    updateVisibility([], "collection");
  }

  window.EazArtifactsWearPromo = {
    init: init,
    update: updateVisibility,
    countUnlockedArtifacts: countUnlockedArtifacts,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
