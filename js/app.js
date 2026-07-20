/**
 * Creator portal app bootstrap — theme shell + resilient boot.
 * Boot stays visible until core theme runtime AND shell UI are actually present.
 */
(function (global) {
  "use strict";

  var bootstrap = null;
  var bootFinished = false;
  var CREATOR_LOGO =
    "https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950";
  /** Hard fallback so a hung request never traps users on the splash. */
  var BOOT_HARD_TIMEOUT_MS = 25000;

  function finishBoot() {
    if (bootFinished) return;
    bootFinished = true;
    var boot = document.getElementById("creatorBoot");
    var app = document.getElementById("creatorPortalApp");
    document.body.classList.remove("is-boot-loading");
    if (boot) boot.hidden = true;
    if (app) app.hidden = false;
  }

  function setBootProgress(pct, statusText) {
    var fill = document.querySelector(".creator-boot__bar-fill");
    var status = document.getElementById("creatorBootStatus");
    var n = Math.max(0, Math.min(100, Number(pct) || 0));
    if (fill) {
      fill.setAttribute("data-mode", "progress");
      fill.style.setProperty("--boot-progress", n + "%");
    }
    if (status && statusText) status.textContent = statusText;
  }

  function applyBootstrap(data) {
    bootstrap = data || null;
    if (!data || !data.ok) return;
    document.querySelectorAll("[data-shop-link]").forEach(function (a) {
      if (data.shop_url) a.href = data.shop_url;
    });
    if (global.CreatorPortalAuth && typeof global.CreatorPortalAuth.applyBootstrapAuth === "function") {
      global.CreatorPortalAuth.applyBootstrapAuth(data);
    }
  }

  function fixBootLogo() {
    document.querySelectorAll(".creator-boot__logo").forEach(function (img) {
      img.src = CREATOR_LOGO;
    });
  }

  function withTimeout(promise, ms, fallback) {
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        setTimeout(function () {
          resolve(fallback);
        }, ms);
      }),
    ]);
  }

  function usesThemeShell() {
    return !!document.getElementById("creatorDesktopApp") || !!document.getElementById("creatorMobileApp");
  }

  function shellLooksInteractive() {
    var desktop = document.getElementById("creatorDesktopApp");
    var mobile = document.getElementById("creatorMobileApp");
    if (desktop && desktop.children && desktop.children.length > 0) return true;
    if (mobile && mobile.querySelector(".creator-screen, .creator-swipe-track")) return true;
    return false;
  }

  function waitForInteractiveShell(maxMs) {
    var limit = typeof maxMs === "number" ? maxMs : 8000;
    if (shellLooksInteractive() && global.CreatorDesktopShell) {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve) {
      var started = Date.now();
      var timer = setInterval(function () {
        var ready =
          shellLooksInteractive() &&
          (global.CreatorDesktopShell || global.CreatorMobileShell || typeof global.__creatorGoTo === "function");
        if (ready || Date.now() - started >= limit) {
          clearInterval(timer);
          resolve(ready);
        }
      }, 80);
    });
  }

  async function afterAuth() {
    if (usesThemeShell()) {
      // Theme shells hydrate their own dashboard data; give them a short settle window.
      await new Promise(function (resolve) {
        setTimeout(resolve, 350);
      });
      return;
    }
    var auth = global.CreatorPortalAuth && global.CreatorPortalAuth.state;
    if (auth && auth.loggedIn && auth.ownerId && global.CreatorPortalDashboard) {
      await global.CreatorPortalDashboard.refresh(false);
    }
  }

  async function syncRouteAfterRuntime() {
    var route =
      global.CreatorPortalRouter && global.CreatorPortalRouter.current
        ? global.CreatorPortalRouter.current()
        : "dashboard";
    if (usesThemeShell()) {
      try {
        if (global.CreatorDesktopShell && typeof global.CreatorDesktopShell.switchScreen === "function") {
          global.CreatorDesktopShell.switchScreen(route);
        }
        if (
          typeof global.__creatorGoTo === "function" &&
          global.CreatorPortalRouter &&
          typeof global.CreatorPortalRouter.slideIndex === "function"
        ) {
          var slideIndex = global.CreatorPortalRouter.slideIndex(route);
          if (typeof slideIndex === "number") {
            global.__creatorGoTo(slideIndex);
          }
        }
      } catch (e) {
        console.warn("[CreatorPortal] route sync after runtime failed", e);
      }
    }
    if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.onRoute === "function") {
      global.CreatorPortalFeatures.onRoute(route);
    }
  }

  async function init() {
    fixBootLogo();
    setBootProgress(6, "Starting Creator…");
    var bootTimeout = setTimeout(finishBoot, BOOT_HARD_TIMEOUT_MS);

    try {
      setBootProgress(12, "Loading session & layout…");
      var bootstrapPromise =
        global.CreatorPortalApi && typeof global.CreatorPortalApi.bootstrap === "function"
          ? withTimeout(global.CreatorPortalApi.bootstrap(), 5000, null).catch(function () {
              return null;
            })
          : Promise.resolve(null);

      var shellPromise =
        global.CreatorPortalShell && typeof global.CreatorPortalShell.loadShell === "function"
          ? withTimeout(global.CreatorPortalShell.loadShell(), 15000, null).catch(function (e) {
              console.warn("[CreatorPortal] shell load failed", e);
              return null;
            })
          : Promise.resolve(null);

      var parallel = await Promise.all([bootstrapPromise, shellPromise]);
      if (parallel[0]) applyBootstrap(parallel[0]);

      setBootProgress(40, "Preparing interface…");
      if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.init === "function") {
        global.CreatorPortalRouter.init();
      }
      if (global.CreatorPortalShell && typeof global.CreatorPortalShell.ensureShellVisible === "function") {
        global.CreatorPortalShell.ensureShellVisible();
      }

      setBootProgress(52, "Checking session…");
      if (global.CreatorPortalAuth && typeof global.CreatorPortalAuth.refreshSession === "function") {
        try {
          await withTimeout(global.CreatorPortalAuth.refreshSession({ skipIfKnown: true }), 8000, null);
        } catch (e) {}
      }

      if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
        global.CreatorPortalThemeBridge.notifyContextReady();
      }

      setBootProgress(68, "Loading Creator…");
      if (global.CreatorPortalShell && typeof global.CreatorPortalShell.loadThemeRuntime === "function") {
        try {
          await global.CreatorPortalShell.loadThemeRuntime();
        } catch (e) {
          console.warn("[CreatorPortal] theme runtime load failed", e);
        }
      }

      setBootProgress(82, "Building dashboard…");
      await waitForInteractiveShell(8000);

      setBootProgress(90, "Finishing up…");
      if (global.CreatorPortalSwitch && typeof global.CreatorPortalSwitch.syncAll === "function") {
        global.CreatorPortalSwitch.syncAll();
      }

      if (
        global.__CreatorThemeBackground &&
        typeof global.__CreatorThemeBackground.resumeAllThemeBgVideos === "function"
      ) {
        global.__CreatorThemeBackground.resumeAllThemeBgVideos();
      }

      await afterAuth();

      if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
        global.CreatorPortalThemeBridge.notifyContextReady();
      }

      await syncRouteAfterRuntime();

      // One more paint frame so chrome is not blank when the splash drops.
      await new Promise(function (resolve) {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(function () {
            requestAnimationFrame(resolve);
          });
        } else {
          setTimeout(resolve, 32);
        }
      });

      setBootProgress(100, "Ready");
    } catch (e) {
      console.warn("[CreatorPortal] boot failed", e);
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
