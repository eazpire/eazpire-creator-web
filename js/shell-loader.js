/**
 * Assembles theme creator shell (desktop + mobile) from static partials.
 * Critical path: dashboard shell only; secondary screens + Eazy/audio deferred.
 */
(function (global) {
  "use strict";

  var CREATOR_LOGO =
    "https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950";
  // Bumped for footer EAZV -> Creator Settings (EAZ tab) fix (never falls back to sales modal).
  var RUNTIME_V = "15-eazv-footer-fix-20260719a";
  var secondaryScreensPromise = null;

  function scheduleIdle(fn, timeoutMs) {
    var run = function () {
      try {
        fn();
      } catch (e) {
        console.warn("[CreatorPortal] idle task failed", e);
      }
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: timeoutMs || 2500 });
    } else {
      setTimeout(run, 1);
    }
  }

  function fetchWithTimeout(url, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, timeoutMs);
    // Allow HTTP cache (server sets Cache-Control for /partials/*).
    return fetch(url, { credentials: "same-origin", signal: controller ? controller.signal : undefined }).finally(
      function () {
        clearTimeout(timer);
      }
    );
  }

  async function fetchPartial(name) {
    var res = await fetchWithTimeout("/partials/" + name, 12000);
    if (!res.ok) throw new Error("Failed to load partial " + name);
    return res.text();
  }

  function ensureShellVisible() {
    var route = "dashboard";
    if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.current === "function") {
      route = global.CreatorPortalRouter.current() || "dashboard";
    }
    var slideMap = { dashboard: 0, generator: 1, creations: 2, marketing: 3, automations: 4 };
    var slide = slideMap[route];
    var viewport = document.getElementById("creatorMobileSwipeViewport");
    if (viewport && typeof slide === "number") {
      viewport.className = "creator-swipe-viewport slide-" + slide;
    }
    var hero = document.getElementById("creatorDesktopHero");
    var screen = String(route || "dashboard").toLowerCase();
    if (hero) hero.setAttribute("data-desktop-active-screen", screen);
    document.querySelectorAll("[data-desktop-screen]").forEach(function (panel) {
      var panelScreen = String(panel.getAttribute("data-desktop-screen") || "").toLowerCase();
      var isActive = panelScreen === screen;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
  }

  var CREATOR_COIN_URL =
    "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch?op=platform-asset-public&slot=eazv_coin_logo";

  function mobileFooterHtml() {
    return (
      '<footer class="creator-global-footer">' +
      '<div class="creator-global-footer__left">' +
      '<span class="creator-global-footer__copyright">© ' +
      new Date().getFullYear() +
      ' <span class="creator-global-footer__brand" translate="no" data-no-translate="1">eazpire</span></span>' +
      '<span class="creator-global-footer__sep">*</span>' +
      '<button type="button" class="creator-global-footer__link creator-global-footer__link--btn" data-creator-terms-trigger>Terms &amp; Policies</button>' +
      "</div>" +
      '<div class="creator-global-footer__right">' +
      '<div class="creator-global-footer__balance creator-global-footer__balance--eaz" role="button" tabindex="0" data-footer-eaz-mode="balance">' +
      '<span class="creator-global-footer__eaz-normal" data-footer-eaz-normal>' +
      '<img class="creator-global-footer__balance-coin" src="' +
      CREATOR_COIN_URL +
      '" alt="" width="20" height="20" loading="lazy" data-eaz-coin="eazv">' +
      '<span class="creator-global-footer__balance-value" id="creator-footer-eaz-value">—</span>' +
      '<span class="creator-global-footer__balance-unit">EAZV</span>' +
      "</span></div></div></footer>"
    );
  }

  function softNavToDashboard(e) {
    if (e) e.preventDefault();
    if (global.CreatorDesktopShell && typeof global.CreatorDesktopShell.switchScreen === "function") {
      global.CreatorDesktopShell.switchScreen("dashboard");
      return;
    }
    if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.go === "function") {
      global.CreatorPortalRouter.go("dashboard");
      return;
    }
    if (typeof global.__creatorGoTo === "function") {
      global.__creatorGoTo(0);
      return;
    }
    global.location.assign("/dashboard");
  }

  function applyShellChrome(host) {
    host.querySelectorAll('img[src*="eazpire-creator-logo"]').forEach(function (img) {
      img.src = CREATOR_LOGO;
    });
    host.querySelectorAll(".creator-desktop-header__brand").forEach(function (a) {
      a.setAttribute("href", "/dashboard");
      if (a.dataset.softNavBound === "1") return;
      a.dataset.softNavBound = "1";
      a.addEventListener("click", softNavToDashboard);
    });
    if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.applyDataT === "function") {
      global.CreatorPortalI18n.applyDataT(host);
    }
  }

  /** Dashboard-critical shell only — enough to finish boot and show UI. */
  async function loadShell() {
    var host = document.getElementById("creatorPortalShell");
    if (!host || host.dataset.loaded === "1") return;

    var parts = await Promise.all([
      fetchPartial("creator-desktop-overview.html"),
      fetchPartial("creator-mobile-dashboard.html"),
      fetchPartial("creator-mobile-header.html"),
      fetchPartial("creator-daily-limits-subheader.html"),
      fetchPartial("creator-mobile-drawer.html"),
    ]);

    host.innerHTML =
      parts[0] +
      '<div class="creator-mobile-app" id="creatorMobileApp">' +
      '<div class="creator-swipe-viewport slide-0" id="creatorMobileSwipeViewport" data-initial-slide="0">' +
      '<div class="creator-swipe-track">' +
      '<section class="creator-screen" data-screen="0">' +
      parts[1] +
      "</section>" +
      '<section class="creator-screen" data-screen="1" data-portal-screen-slot="generator"></section>' +
      '<section class="creator-screen" data-screen="2" data-portal-screen-slot="creations"></section>' +
      '<section class="creator-screen" data-screen="3" data-portal-screen-slot="marketing"></section>' +
      '<section class="creator-screen" data-screen="4" data-portal-screen-slot="automations"></section>' +
      "</div></div>" +
      parts[2] +
      parts[3] +
      parts[4] +
      mobileFooterHtml() +
      "</div>";

    applyShellChrome(host);
    host.dataset.loaded = "1";
  }

  /** Fill generator / creations / marketing / automations after first paint. */
  function loadShellSecondaryScreens() {
    if (secondaryScreensPromise) return secondaryScreensPromise;
    var host = document.getElementById("creatorPortalShell");
    if (!host || host.dataset.secondaryScreens === "1") {
      return Promise.resolve();
    }
    secondaryScreensPromise = (async function () {
      var parts = await Promise.all([
        fetchPartial("creator-mobile-generator.html"),
        fetchPartial("creator-mobile-creations.html"),
        fetchPartial("creator-mobile-marketing.html"),
        fetchPartial("creator-mobile-automations.html"),
      ]);
      var slots = ["generator", "creations", "marketing", "automations"];
      slots.forEach(function (slot, i) {
        var el = host.querySelector('[data-portal-screen-slot="' + slot + '"]');
        if (!el || el.dataset.filled === "1") return;
        el.innerHTML = parts[i];
        el.dataset.filled = "1";
        el.removeAttribute("data-portal-screen-slot");
        /* Scope i18n to the new panel only — never re-walk header/subheader chrome. */
        if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.applyDataT === "function") {
          global.CreatorPortalI18n.applyDataT(el);
        }
      });
      host.dataset.secondaryScreens = "1";
    })().catch(function (e) {
      secondaryScreensPromise = null;
      console.warn("[CreatorPortal] secondary screens load failed", e);
    });
    return secondaryScreensPromise;
  }

  function setupCreatorAudioI18n() {
    if (global.CreatorAudioI18n) return;
    var pt = global.CreatorPortalI18n && global.CreatorPortalI18n.t;
    function audioT(shortKey, fallback) {
      if (pt) {
        var val = pt("creator.audio." + shortKey);
        if (val) return val;
      }
      return fallback || shortKey;
    }
    global.CreatorAudioI18n = {
      play: audioT("play", "Play"),
      pause: audioT("pause", "Pause"),
      empty: audioT("empty", "No audio files yet. Add one to get started."),
      add: audioT("add", "Add"),
      use: audioT("use", "Use"),
      mute: audioT("mute", "Mute"),
      unmute: audioT("unmute", "Unmute"),
      upload_error: audioT("upload_error", "Upload failed"),
      login_required: pt ? pt("creator.common.login_required") || "Please log in" : "Please log in",
      time_format: audioT("time_format", "0:00 / 0:00"),
      selected: audioT("selected", "Selected"),
      remove: audioT("remove", "Remove"),
      remove_confirm: audioT("remove_confirm", "Remove?"),
      remove_confirm_desc: audioT("remove_confirm_desc", "This cannot be undone."),
      cancel: audioT("cancel", "Cancel"),
      tap_to_start: audioT("tap_to_start", "Tap to start music"),
      tap_to_start_after_switch: audioT(
        "tap_to_start_after_switch",
        "You switched to Creator – tap once to start music"
      ),
    };
  }

  async function loadAudioModal() {
    var host = document.getElementById("creatorPortalModals");
    if (!host || host.querySelector('[data-partial="creator-audio-modal.html"]')) return;
    try {
      var html = await fetchPartial("creator-audio-modal.html");
      var wrap = document.createElement("div");
      wrap.setAttribute("data-partial", "creator-audio-modal.html");
      wrap.innerHTML = html;
      host.appendChild(wrap);
      if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.applyDataT === "function") {
        global.CreatorPortalI18n.applyDataT(wrap);
      }
      setupCreatorAudioI18n();
      await Promise.all([
        loadScript("/vendor/theme/creator-audio-modal.js"),
        loadScript("/vendor/theme/creator-audio-party.js"),
      ]);
    } catch (e) {
      console.warn("[CreatorPortal] audio modal load failed", e);
    }
  }

  function loadScript(src) {
    if (document.querySelector('script[data-portal-runtime="' + src + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src + "?v=" + RUNTIME_V;
      s.defer = true;
      s.setAttribute("data-portal-runtime", src);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(s);
    });
  }

  async function loadThemeRuntime() {
    // Secondary swipe screens in parallel with core runtime scripts.
    var secondary = loadShellSecondaryScreens();

    await loadScript("/js/portal-balances.js");
    await Promise.all([
      loadScript("/vendor/theme/eaz-coin-brand.js"),
      loadScript("/vendor/theme/creator-creator-area-api.js"),
      loadScript("/vendor/theme/creator-footer-eaz-ui.js"),
      loadScript("/vendor/theme/creator-theme-background.js"),
      loadScript("/vendor/theme/creator-dashboard-data.js"),
      loadScript("/vendor/theme/creator-daily-limits-subheader.js"),
    ]);
    await Promise.all([
      loadScript("/vendor/theme/particle-reveal.js"),
      loadScript("/vendor/theme/design-particle-reveal.js"),
      loadScript("/vendor/theme/drawer-aquarium.js"),
      loadScript("/vendor/theme/creator-shop-portal-handoff.js"),
      loadScript("/vendor/theme/creator-switch-page-transition.js"),
      loadScript("/js/creator-portal-switch.js"),
      loadScript("/vendor/theme/creator-mobile.js"),
      loadScript("/vendor/theme/creator-desktop.js"),
    ]);

    try {
      await secondary;
    } catch (e) {}

    // Header audio widget needs modal JS + party hooks right after shell/runtime (not idle).
    try {
      await loadAudioModal();
    } catch (e) {
      console.warn("[CreatorPortal] audio modal load failed", e);
    }

    // Eazy chat + sales/journey modals — still deferred off first interactive paint.
    scheduleIdle(function () {
      if (global.CreatorPortalEazy && typeof global.CreatorPortalEazy.ensure === "function") {
        global.CreatorPortalEazy.ensure().catch(function (e) {
          console.warn("[CreatorPortal] Eazy load failed", e);
        });
      }
      if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.ensureDashboard === "function") {
        global.CreatorPortalFeatures.ensureDashboard().catch(function (e) {
          console.warn("[CreatorPortal] dashboard modals load failed", e);
        });
      }
    }, 2000);
  }

  global.CreatorPortalShell = {
    loadShell: loadShell,
    loadShellSecondaryScreens: loadShellSecondaryScreens,
    loadThemeRuntime: loadThemeRuntime,
    loadAudioModal: loadAudioModal,
    ensureShellVisible: ensureShellVisible,
  };
})(typeof window !== "undefined" ? window : globalThis);
