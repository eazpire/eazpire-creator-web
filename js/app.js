/**
 * Creator portal shell bootstrap (Phase 1).
 */
(function (global) {
  "use strict";

  function finishBoot() {
    var boot = document.getElementById("creatorBoot");
    var shell = document.getElementById("creatorShell");
    document.body.classList.remove("is-boot-loading");
    if (boot) boot.hidden = true;
    if (shell) shell.hidden = false;
  }

  async function runPingTest() {
    var out = document.getElementById("creatorPingOut");
    if (!out) return;
    out.hidden = false;
    out.textContent = "Pinging portal…";
    try {
      var ping = await global.CreatorPortalApi.ping();
      var me = await global.CreatorPortalApi.me();
      out.textContent = JSON.stringify({ ping: ping, session: me }, null, 2);
    } catch (e) {
      out.textContent = String(e && e.message ? e.message : e);
    }
  }

  function bindUi() {
    var pingBtn = document.getElementById("creatorPingBtn");
    if (pingBtn) pingBtn.addEventListener("click", runPingTest);
  }

  async function init() {
    bindUi();
    if (global.CreatorPortalAuth && typeof global.CreatorPortalAuth.refreshSession === "function") {
      await global.CreatorPortalAuth.refreshSession();
    }
    finishBoot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
