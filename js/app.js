/**
 * Creator portal app bootstrap — theme shell + resilient boot.
 * Boot stays visible until dashboard chrome (level, journey, balances, limits) is applied.
 */
(function (global) {
  "use strict";

  var bootstrap = null;
  var bootFinished = false;
  var CREATOR_LOGO =
    "https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950";
  /** Hard fallback so a hung request never traps users on the splash. */
  var BOOT_HARD_TIMEOUT_MS = 28000;

  /**
   * Hybrid boot bar: milestones are floors; a rAF ticker creeps toward a soft
   * ceiling (just below the next milestone) so the bar never sits still for long.
   * Never reaches 100% until finishBoot animates the final stretch.
   */
  var BOOT_MILESTONES = [6, 12, 36, 48, 60, 74, 86, 94];
  var bootDisplayPct = 0;
  var bootFloorPct = 0;
  var bootTargetPct = 0;
  var bootSoftCeiling = 8;
  var bootRafId = 0;
  var bootLastTs = 0;
  var bootFinishing = false;

  function nextMilestoneAfter(pct) {
    for (var i = 0; i < BOOT_MILESTONES.length; i++) {
      if (BOOT_MILESTONES[i] > pct) return BOOT_MILESTONES[i];
    }
    return 100;
  }

  function softCeilingFor(targetPct) {
    var next = nextMilestoneAfter(targetPct);
    if (next >= 100) return 99;
    return Math.max(targetPct, next - 1);
  }

  function applyBootProgressVisual(pct) {
    var fill = document.querySelector(".creator-boot__bar-fill");
    if (!fill) return;
    fill.setAttribute("data-mode", "progress");
    fill.style.setProperty("--boot-progress", pct.toFixed(2) + "%");
  }

  function completeBootHide() {
    if (bootFinished) return;
    bootFinished = true;
    if (bootRafId) {
      cancelAnimationFrame(bootRafId);
      bootRafId = 0;
    }
    var boot = document.getElementById("creatorBoot");
    var app = document.getElementById("creatorPortalApp");
    document.body.classList.remove("is-boot-loading");
    if (boot) boot.hidden = true;
    if (app) app.hidden = false;
  }

  function tickBootProgress(ts) {
    bootRafId = 0;
    if (!bootLastTs) bootLastTs = ts;
    var dt = Math.min(0.05, Math.max(0, (ts - bootLastTs) / 1000));
    bootLastTs = ts;

    if (bootFinishing) {
      var remain = 100 - bootDisplayPct;
      if (remain <= 0.2) {
        bootDisplayPct = 100;
        applyBootProgressVisual(100);
        completeBootHide();
        return;
      }
      // ~400–500ms snap to full from typical late-boot positions
      bootDisplayPct += Math.max(remain * 9 * dt, 55 * dt);
      if (bootDisplayPct > 100) bootDisplayPct = 100;
      applyBootProgressVisual(bootDisplayPct);
      bootRafId = requestAnimationFrame(tickBootProgress);
      return;
    }

    if (bootDisplayPct < bootTargetPct) {
      var upGap = bootTargetPct - bootDisplayPct;
      bootDisplayPct += Math.max(upGap * (1 - Math.exp(-8 * dt)), 28 * dt);
      if (bootDisplayPct > bootTargetPct) bootDisplayPct = bootTargetPct;
    } else {
      var ceiling = bootSoftCeiling;
      var room = ceiling - bootDisplayPct;
      if (room > 0.08) {
        // Asymptote toward soft ceiling + small minimum creep so it feels alive
        bootDisplayPct += room * (1 - Math.exp(-0.55 * dt));
        bootDisplayPct += Math.min(1.8 * dt, room * 0.35);
        if (bootDisplayPct > ceiling) bootDisplayPct = ceiling;
      }
    }

    if (bootDisplayPct < bootFloorPct) bootDisplayPct = bootFloorPct;
    if (bootDisplayPct > 99) bootDisplayPct = 99;

    applyBootProgressVisual(bootDisplayPct);
    bootRafId = requestAnimationFrame(tickBootProgress);
  }

  function ensureBootTicker() {
    if (bootFinished || bootRafId) return;
    if (typeof requestAnimationFrame !== "function") {
      applyBootProgressVisual(Math.max(bootDisplayPct, bootTargetPct));
      return;
    }
    bootLastTs = 0;
    bootRafId = requestAnimationFrame(tickBootProgress);
  }

  function finishBoot() {
    if (bootFinished || bootFinishing) return;
    bootFinishing = true;
    bootTargetPct = 100;
    bootSoftCeiling = 100;
    ensureBootTicker();
    // No rAF (very old browsers): hide immediately after painting 100%
    if (typeof requestAnimationFrame !== "function") {
      bootDisplayPct = 100;
      applyBootProgressVisual(100);
      completeBootHide();
    }
  }

  function setBootProgress(pct, statusText) {
    var status = document.getElementById("creatorBootStatus");
    if (status && statusText) status.textContent = statusText;
    if (bootFinished || bootFinishing) return;

    var n = Math.max(0, Math.min(100, Number(pct) || 0));
    // Callers may pass 100 for "Ready"; finishBoot owns the true 100% fill.
    if (n >= 100) n = 99;

    if (n > bootTargetPct) bootTargetPct = n;
    if (n > bootFloorPct) bootFloorPct = n;
    bootSoftCeiling = softCeilingFor(bootTargetPct);
    ensureBootTicker();
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
      await new Promise(function (resolve) {
        setTimeout(resolve, 200);
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

  async function loadDashboardChrome(bootstrapChrome) {
    if (!global.CreatorPortalChrome || typeof global.CreatorPortalChrome.whenReady !== "function") {
      return null;
    }
    var owner =
      (global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.ownerId) ||
      global.__EAZ_OWNER_ID;
    if (!owner) return null;
    setBootProgress(86, "Loading Journey, Level & balances…");
    return global.CreatorPortalChrome.whenReady(12000).catch(function () {
      return null;
    });
  }

  async function init() {
    fixBootLogo();
    setBootProgress(6, "Starting Creator…");
    var bootTimeout = setTimeout(finishBoot, BOOT_HARD_TIMEOUT_MS);

    try {
      setBootProgress(12, "Loading session & layout…");
      var bootstrapPromise =
        global.CreatorPortalApi && typeof global.CreatorPortalApi.bootstrap === "function"
          ? withTimeout(global.CreatorPortalApi.bootstrap(), 12000, null).catch(function () {
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
      var bootData = parallel[0];
      if (bootData) applyBootstrap(bootData);

      // Seed chrome early so runtime scripts can skip duplicate network calls.
      if (bootData && bootData.chrome) {
        global.__EAZ_BOOTSTRAP_CHROME__ = bootData.chrome;
        if (bootData.chrome.level && bootData.chrome.level.ok) {
          global.__EAZ_JOURNEY_LEVEL_DATA__ = bootData.chrome.level;
        }
        if (bootData.chrome.daily_limits && bootData.chrome.daily_limits.ok) {
          global.__EAZ_DAILY_LIMITS__ = {
            ok: true,
            creation_limits_effective: bootData.chrome.daily_limits.creation_limits_effective || null,
            listing_limits_effective: bootData.chrome.daily_limits.listing_limits_effective || null,
          };
          global.__EAZ_DAILY_LIMITS_FETCHED_AT__ = Date.now();
        }
        if (bootData.chrome.balance && bootData.chrome.balance.ok) {
          try {
            var bv =
              bootData.chrome.balance.balance_total != null
                ? bootData.chrome.balance.balance_total
                : bootData.chrome.balance.balance_eaz;
            global.__eazBalanceCache = global.__eazBalanceCache || {};
            global.__eazBalanceCache.value = bv != null ? bv : 0;
            global.__eazBalanceCache.timestamp = Date.now();
          } catch (e) {}
        }
      }

      setBootProgress(36, "Preparing interface…");
      if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.init === "function") {
        global.CreatorPortalRouter.init();
      }
      if (global.CreatorPortalShell && typeof global.CreatorPortalShell.ensureShellVisible === "function") {
        global.CreatorPortalShell.ensureShellVisible();
      }

      setBootProgress(48, "Checking session…");
      if (global.CreatorPortalAuth && typeof global.CreatorPortalAuth.refreshSession === "function") {
        try {
          await withTimeout(global.CreatorPortalAuth.refreshSession({ skipIfKnown: true }), 8000, null);
        } catch (e) {}
      }

      setBootProgress(60, "Loading Creator…");
      if (global.CreatorPortalShell && typeof global.CreatorPortalShell.loadThemeRuntime === "function") {
        try {
          await global.CreatorPortalShell.loadThemeRuntime();
        } catch (e) {
          console.warn("[CreatorPortal] theme runtime load failed", e);
        }
      }

      setBootProgress(74, "Building dashboard…");
      await waitForInteractiveShell(8000);

      // Soft context notify after runtime (scripts ready) — chrome load owns the critical data.
      if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
        global.CreatorPortalThemeBridge.notifyContextReady();
      }

      // Prefer chrome bundled in bootstrap (one RTT); fall back to parallel client fetches.
      if (global.CreatorPortalChrome && typeof global.CreatorPortalChrome.load === "function") {
        setBootProgress(86, "Loading Journey, Level & balances…");
        await withTimeout(
          global.CreatorPortalChrome.load({
            bootstrapChrome: bootData && bootData.chrome ? bootData.chrome : null,
          }),
          14000,
          null
        );
      } else {
        await loadDashboardChrome(bootData && bootData.chrome);
      }

      setBootProgress(94, "Finishing up…");
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
      await syncRouteAfterRuntime();

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
