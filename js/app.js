/**
 * Creator portal app bootstrap (Phase 3a).
 */
(function (global) {
  "use strict";

  var bootstrap = null;

  function finishBoot() {
    var boot = document.getElementById("creatorBoot");
    var app = document.getElementById("creatorPortalApp");
    document.body.classList.remove("is-boot-loading");
    if (boot) boot.hidden = true;
    if (app) app.hidden = false;
  }

  function applyBootstrap(data) {
    bootstrap = data || null;
    if (!data || !data.ok) return;
    document.querySelectorAll("[data-shop-link]").forEach(function (a) {
      if (data.shop_url) a.href = data.shop_url;
    });
  }

  async function afterAuth() {
    var auth = global.CreatorPortalAuth && global.CreatorPortalAuth.state;
    if (auth && auth.loggedIn && auth.ownerId && global.CreatorPortalDashboard) {
      await global.CreatorPortalDashboard.refresh(false);
    }
  }

  async function init() {
    try {
      var bootData = await global.CreatorPortalApi.bootstrap();
      applyBootstrap(bootData);
    } catch (e) {}

    if (global.CreatorPortalAuth && typeof global.CreatorPortalAuth.refreshSession === "function") {
      await global.CreatorPortalAuth.refreshSession();
    }

    if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.init === "function") {
      global.CreatorPortalRouter.init();
    }

    await afterAuth();
    if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
      global.CreatorPortalThemeBridge.notifyContextReady();
    }
    var route = global.CreatorPortalRouter && global.CreatorPortalRouter.current
      ? global.CreatorPortalRouter.current()
      : "dashboard";
    if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.onRoute === "function") {
      global.CreatorPortalFeatures.onRoute(route);
    }
    finishBoot();
  }

  global.CreatorPortalApp = {
    bootstrap: function () {
      return bootstrap;
    },
    refresh: afterAuth,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
