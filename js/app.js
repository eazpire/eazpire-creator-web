/**
 * Creator portal app bootstrap — theme shell + resilient boot.
 */
(function (global) {
  "use strict";

  var bootstrap = null;
  var bootFinished = false;
  var CREATOR_LOGO =
    "https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950";

  function finishBoot() {
    if (bootFinished) return;
    bootFinished = true;
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

  function fixBootLogo() {
    document.querySelectorAll(".creator-boot__logo").forEach(function (img) {
      img.src = CREATOR_LOGO;
    });
  }

  function usesThemeShell() {
    return !!document.getElementById("creatorDesktopApp") || !!document.getElementById("creatorMobileApp");
  }

  async function afterAuth() {
    if (usesThemeShell()) return;
    var auth = global.CreatorPortalAuth && global.CreatorPortalAuth.state;
    if (auth && auth.loggedIn && auth.ownerId && global.CreatorPortalDashboard) {
      await global.CreatorPortalDashboard.refresh(false);
    }
  }

  async function init() {
    fixBootLogo();
    var bootTimeout = setTimeout(finishBoot, 12000);

    try {
      try {
        var bootData = await global.CreatorPortalApi.bootstrap();
        applyBootstrap(bootData);
      } catch (e) {}

      if (global.CreatorPortalAuth && typeof global.CreatorPortalAuth.refreshSession === "function") {
        await global.CreatorPortalAuth.refreshSession();
      }

      if (global.CreatorPortalShell && typeof global.CreatorPortalShell.loadShell === "function") {
        await global.CreatorPortalShell.loadShell();
      }

      if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.init === "function") {
        global.CreatorPortalRouter.init();
      }

      clearTimeout(bootTimeout);
      finishBoot();

      var runtimeWork = (async function () {
        if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
          global.CreatorPortalThemeBridge.notifyContextReady();
        }

        if (global.CreatorPortalShell && typeof global.CreatorPortalShell.loadThemeRuntime === "function") {
          try {
            await global.CreatorPortalShell.loadThemeRuntime();
          } catch (e) {
            console.warn("[CreatorPortal] theme runtime load failed", e);
          }
        }

        await afterAuth();

        if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
          global.CreatorPortalThemeBridge.notifyContextReady();
        }

        var route =
          global.CreatorPortalRouter && global.CreatorPortalRouter.current
            ? global.CreatorPortalRouter.current()
            : "dashboard";
        if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.onRoute === "function") {
          global.CreatorPortalFeatures.onRoute(route);
        }
      })();

      await runtimeWork;
    } finally {
      clearTimeout(bootTimeout);
      finishBoot();
    }
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
