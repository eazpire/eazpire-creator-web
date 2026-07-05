/**
 * Lazy-load theme creator assets for portal routes (creations + generator).
 */
(function (global) {
  "use strict";

  var state = { creations: null, generator: null };
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
    link.href = href + "?v=3";
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
      s.src = src + "?v=3";
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

  async function injectPartial(name) {
    var host = document.getElementById(partialsHostId);
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

  async function ensureCreations() {
    if (state.creations) return state.creations;
    if (!global.CreatorPortalAuth || !global.CreatorPortalAuth.state || !global.CreatorPortalAuth.state.loggedIn) {
      return null;
    }

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
    if (!global.CreatorPortalAuth || !global.CreatorPortalAuth.state || !global.CreatorPortalAuth.state.loggedIn) {
      return null;
    }

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

  function onRoute(name) {
    if (name === "creations") ensureCreations();
    if (name === "generator") ensureGenerator();
  }

  global.CreatorPortalFeatures = {
    onRoute: onRoute,
    ensureCreations: ensureCreations,
    ensureGenerator: ensureGenerator,
  };
})(typeof window !== "undefined" ? window : globalThis);
