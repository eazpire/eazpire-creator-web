/**
 * Lazy-load theme creator assets for portal routes.
 */
(function (global) {
  "use strict";

  var state = {
    creations: null,
    generator: null,
    marketing: null,
    automations: null,
    settings: null,
  };
  var partialsHostId = "creatorPortalModals";

  function asset(file) {
    return global.CreatorPortalThemeBridge
      ? global.CreatorPortalThemeBridge.assetUrl(file)
      : "/vendor/theme/" + file;
  }

  function loadCss(href) {
    if (!href || document.querySelector('link[data-portal-css="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href + "?v=4";
    link.setAttribute("data-portal-css", href);
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (!src) return Promise.reject(new Error("missing script"));
    if (document.querySelector('script[data-portal-js="' + src + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src + "?v=4";
      s.defer = true;
      s.setAttribute("data-portal-js", src);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }

  function loadScriptsSequential(urls) {
    return urls.reduce(function (chain, url) {
      return chain.then(function () {
        return loadScript(url);
      });
    }, Promise.resolve());
  }

  async function injectPartial(name, hostEl) {
    var host = hostEl || document.getElementById(partialsHostId);
    if (!host) return;
    var url = "/partials/" + name;
    if (host.querySelector('[data-partial="' + name + '"]')) return;
    var res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    var html = await res.text();
    var wrap = document.createElement("div");
    wrap.setAttribute("data-partial", name);
    wrap.innerHTML = html;
    host.appendChild(wrap);
  }

  function sharedCss() {
    [
      "/vendor/theme/creator-mobile.css",
      "/vendor/theme/creator-mobile-screens.css",
      "/vendor/theme/creator-my-creations.css",
      "/vendor/theme/creator-mobile-filter-modal.css",
      "/vendor/theme/creator-mobile-options-modal.css",
      "/vendor/theme/creator-mobile-gen-styles-modal.css",
      "/vendor/theme/creator-mobile-gen-language-modal.css",
      "/vendor/theme/creator-mobile-gen-color-modal.css",
      "/vendor/theme/creator-canvas-sketch-modal.css",
      "/vendor/theme/creator-inspiration-modal.css",
    ].forEach(loadCss);
  }

  function marketingCss() {
    sharedCss();
    ["/vendor/theme/creator-automations.css", "/vendor/theme/eaz-creator-promotions.css"].forEach(loadCss);
  }

  function settingsCss() {
    [
      "/vendor/theme/creator-level-panel.css",
      "/vendor/theme/community-panel.css",
      "/vendor/theme/creator-codes-panel.css",
      "/vendor/theme/creator-settings-eaz.css",
      "/vendor/theme/eaz-interests-hub.css",
      "/vendor/theme/creator-level-celebration.css",
      "/vendor/theme/notification-preferences-panel.css",
      "/vendor/theme/sales-modal.css",
      "/vendor/theme/share-button.css",
    ].forEach(loadCss);
  }

  function applyMarketingDeepLink() {
    var params = new URLSearchParams(global.location.search || "");
    var sub = (params.get("eaz_marketing_subtab") || "").toLowerCase();
    var content = (params.get("eaz_marketing_content") || "").toLowerCase();
    if (!global.MarketingScreen) return;
    if (sub === "content-publish") global.MarketingScreen.switchSubTab("content-publish");
    else if (sub === "promotions") global.MarketingScreen.switchSubTab("promotions");
    else global.MarketingScreen.switchSubTab("content-creation");
    if (content === "videos" || content === "images" || content === "hero-images") {
      global.MarketingScreen.switchContentTab(content);
    }
  }

  function requireLogin() {
    return global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.loggedIn;
  }

  async function ensureCreations() {
    if (state.creations) return state.creations;
    if (!requireLogin()) return null;

    state.creations = (async function () {
      if (global.CreatorPortalThemeBridge) global.CreatorPortalThemeBridge.notifyContextReady();
      sharedCss();

      await Promise.all([
        injectPartial("creator-mobile-filter-modal.html"),
        injectPartial("creator-design-upload-modal.html"),
        injectPartial("my-creations-upload-source-modal.html"),
        injectPartial("creator-design-merge-modal.html"),
        injectPartial("creator-design-preview-modal.html"),
      ]);

      global.__CREATOR_LAZY_MODAL_URLS = global.__CREATOR_LAZY_MODAL_URLS || {};
      global.__CREATOR_LAZY_MODAL_URLS["creator-mobile-filter-modal.js"] = asset("creator-mobile-filter-modal.js");
      global.__CREATOR_LAZY_MODAL_URLS["creator-design-preview-modal.js"] = asset("creator-design-preview-modal.js");

      global.__CREATOR_LAZY_CREATIONS_BUNDLE = [
        asset("creator-perf-debug.js"),
        asset("creator-creations-library-actions.js"),
        asset("creator-creations-bulk.js"),
        asset("creator-design-products-modal.js"),
        asset("creator-design-preview-modal.js"),
        asset("creator-creations-screen.js"),
      ];

      await loadScript(asset("creator-lazy-modals.js"));
      await loadScriptsSequential([
        asset("creator-upload-remove-background.js"),
        asset("creator-upload-crop.js"),
        asset("creator-design-upload-modal.js"),
        asset("my-creations-upload-source-modal.js"),
        asset("creator-design-merge-modal.js"),
      ]);

      if (global.__CreatorLazyModals && typeof global.__CreatorLazyModals.ensureCreationsBundle === "function") {
        await global.__CreatorLazyModals.ensureCreationsBundle();
      }

      if (global.CreationsScreen) {
        if (typeof global.CreationsScreen.switchTab === "function") global.CreationsScreen.switchTab("designs");
        if (typeof global.CreationsScreen.loadDesigns === "function") await global.CreationsScreen.loadDesigns(true);
      }
    })();

    try {
      await state.creations;
    } catch (e) {
      state.creations = null;
      console.warn("[CreatorPortalFeatures] creations load failed", e);
    }
    return state.creations;
  }

  async function ensureGenerator() {
    if (state.generator) return state.generator;
    if (!requireLogin()) return null;

    state.generator = (async function () {
      if (global.CreatorPortalThemeBridge) global.CreatorPortalThemeBridge.notifyContextReady();
      sharedCss();

      await injectPartial("creator-mobile-generator-modals.html");
      await injectPartial("reference-influence-modal.html");
      await injectPartial("creator-inspiration-modal.html");

      await loadScriptsSequential([
        asset("eaz-cost-catalog.js"),
        asset("creator-widget.payload.js"),
        asset("creator-mobile-options-modal.js"),
        asset("generator-options-modal.js"),
        asset("creator-mobile-gen-styles-modal.js"),
        asset("creator-mobile-gen-language-modal.js"),
        asset("creator-mobile-gen-color-modal.js"),
        asset("creator-mobile-gen-my-designs-modal.js"),
        asset("creator-canvas-sketch-modal.js"),
        asset("reference-influence-modal.js"),
        asset("creator-inspiration-modal.js"),
        asset("creator-phone-upload-modal.js"),
        asset("creator-generator.js"),
      ]);
    })();

    try {
      await state.generator;
    } catch (e) {
      state.generator = null;
      console.warn("[CreatorPortalFeatures] generator load failed", e);
    }
    return state.generator;
  }

  async function ensureMarketing() {
    if (state.marketing) return state.marketing;
    if (!requireLogin()) return null;

    state.marketing = (async function () {
      if (global.CreatorPortalThemeBridge) global.CreatorPortalThemeBridge.notifyContextReady();
      marketingCss();

      var host = document.getElementById("creatorMarketingHost");
      if (host && !host.querySelector("#creatorMarketing")) {
        await injectPartial("creator-mobile-marketing.html", host);
      }

      await loadScriptsSequential([
        asset("creator-footer-eaz-ui.js"),
        asset("hero-region-utils.js"),
        asset("creator-product-image-carousel.js"),
        asset("hero-eazy-legacy-bridge.js"),
        asset("creator-content-creation-hero.js"),
        asset("creator-content-creation-video.js"),
        asset("creator-hero-images-screen.js"),
        asset("creator-videos-screen.js"),
        asset("creator-content-publish-images-screen.js"),
        asset("eaz-creator-promotions.js"),
        asset("creator-marketing-screen.js"),
      ]);

      applyMarketingDeepLink();
    })();

    try {
      await state.marketing;
    } catch (e) {
      state.marketing = null;
      console.warn("[CreatorPortalFeatures] marketing load failed", e);
    }
    return state.marketing;
  }

  async function ensureAutomations() {
    if (state.automations) return state.automations;
    if (!requireLogin()) return null;

    state.automations = (async function () {
      if (global.CreatorPortalThemeBridge) global.CreatorPortalThemeBridge.notifyContextReady();
      loadCss("/vendor/theme/creator-automations.css");

      var host = document.getElementById("creatorAutomationsHost");
      if (host && !host.querySelector("#creatorAutomations")) {
        await injectPartial("creator-mobile-automations.html", host);
      }

      await loadScriptsSequential([
        asset("creator-automations-screen.js"),
      ]);
    })();

    try {
      await state.automations;
    } catch (e) {
      state.automations = null;
      console.warn("[CreatorPortalFeatures] automations load failed", e);
    }
    return state.automations;
  }

  async function ensureSettings() {
    if (state.settings) return state.settings;
    if (!requireLogin()) return null;

    state.settings = (async function () {
      if (global.CreatorPortalThemeBridge) global.CreatorPortalThemeBridge.notifyContextReady();
      settingsCss();

      await injectPartial("creator-settings-v2-modal.html");

      await loadScriptsSequential([
        asset("share-button.js"),
        asset("sales-modal.js"),
        asset("eaz-cost-catalog.js"),
        asset("eaz-country-continents.js"),
        asset("eaz-insufficient-actions.js"),
        asset("notification-preferences-panel.js"),
        asset("community-panel.js"),
        asset("creator-codes-panel.js"),
        asset("creator-level-panel.js"),
        asset("creator-level-celebration.js"),
        asset("eaz-interests-hub.js"),
        asset("creator-settings-eaz-panel.js"),
        asset("creator-settings-payout-panel.js"),
        asset("creator-settings-names.js"),
        asset("creator-settings-wear-panel.js"),
        asset("customer-profile-settings.js"),
        asset("creator-cover-regions-ui.js"),
        asset("creator-detail-modal.js"),
        asset("creator-settings-v2-modal.js"),
      ]);
    })();

    try {
      await state.settings;
    } catch (e) {
      state.settings = null;
      console.warn("[CreatorPortalFeatures] settings load failed", e);
    }
    return state.settings;
  }

  async function openSettings(tab) {
    if (!requireLogin()) {
      if (global.CreatorPortalAuth && typeof global.CreatorPortalAuth.login === "function") {
        global.CreatorPortalAuth.login();
      }
      return;
    }
    await ensureSettings();
    if (global.CreatorSettingsV2Modal && typeof global.CreatorSettingsV2Modal.open === "function") {
      global.CreatorSettingsV2Modal.open(tab ? { tab: tab } : undefined);
    }
  }

  function bindSettingsTriggers() {
    document.querySelectorAll("[data-open-settings]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-settings-tab") || "";
        openSettings(tab || undefined);
      });
    });
  }

  function onRoute(name) {
    if (name === "creations") ensureCreations();
    if (name === "generator") ensureGenerator();
    if (name === "marketing") ensureMarketing();
    if (name === "automations") ensureAutomations();
  }

  bindSettingsTriggers();

  global.CreatorPortalFeatures = {
    onRoute: onRoute,
    ensureCreations: ensureCreations,
    ensureGenerator: ensureGenerator,
    ensureMarketing: ensureMarketing,
    ensureAutomations: ensureAutomations,
    ensureSettings: ensureSettings,
    openSettings: openSettings,
    applyMarketingDeepLink: applyMarketingDeepLink,
  };
})(typeof window !== "undefined" ? window : globalThis);
