/**
 * Loads Eazy mascot, chat widget, and related theme assets on the creator portal.
 */
(function (global) {
  "use strict";

  var state = null;
  var partialsHostId = "creatorPortalEazy";

  function asset(file) {
    return global.CreatorPortalThemeBridge
      ? global.CreatorPortalThemeBridge.assetUrl(file)
      : "/vendor/theme/" + file;
  }

  function loadCss(href) {
    if (!href || document.querySelector('link[data-portal-eazy-css="' + href + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href + "?v=6";
    link.setAttribute("data-portal-eazy-css", href);
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (!src) return Promise.reject(new Error("missing script"));
    if (document.querySelector('script[data-portal-eazy-js="' + src + '"]')) {
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src + "?v=6";
      s.defer = true;
      s.setAttribute("data-portal-eazy-js", src);
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.body.appendChild(s);
    });
  }

  function loadScriptsSequential(urls) {
    return urls.reduce(function (chain, url) {
      return chain.then(function () {
        return loadScript(url);
      });
    }, Promise.resolve());
  }

  function ensureHost() {
    var host = document.getElementById(partialsHostId);
    if (host) return host;
    host = document.createElement("div");
    host.id = partialsHostId;
    host.setAttribute("aria-hidden", "false");
    document.body.appendChild(host);
    return host;
  }

  async function injectPartial(name) {
    var host = ensureHost();
    if (host.querySelector('[data-partial="' + name + '"]')) return;
    var res = await fetch("/partials/" + name, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load partial " + name);
    var html = await res.text();
    html = html
      .replace(/^https?:\/\/www\.eazpire\.com\/cdn\/shop[^\n]*\n/gm, "")
      .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>\s*/gi, "")
      .replace(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>\s*/gi, "")
      .replace(/<script[^>]*src=[^>]*>\s*<\/script>\s*/gi, "");
    var wrap = document.createElement("div");
    wrap.setAttribute("data-partial", name);
    wrap.innerHTML = html;
    host.appendChild(wrap);
  }

  function configureLazyChatScripts() {
    var a = asset;
    global.__EAZ_CHAT_LAZY_SCRIPTS = [
      a("eazy-verify.js"),
      a("eazy-sound-effects.js"),
      a("eazy-daily-memory-game.js"),
      a("eazy-daily-connect-game.js"),
      a("eazy-daily-simon-game.js"),
      a("eazy-prize-cards.js"),
      a("eazy-card-collection-ui.js"),
      a("eazy-games-hub.js"),
      a("eazy-games-picker.js"),
      a("eazy-community-game-host.js"),
      a("artifact-mint-shockwave.js"),
      a("eaz-artifacts-mint-scene.js"),
      a("eaz-open-wear-hub.js"),
      a("eaz-artifacts-wear-promo.js"),
      a("eaz-artifacts-hub.js"),
      a("wardrobe-figure.js"),
      a("eaz-artifacts-outfit.js"),
      a("eaz-artifacts-marketplace.js"),
      a("eazy-guide-mode.js"),
      a("creator-legacy-save.js"),
      a("creator-chat-widget.js"),
    ];
  }

  function applyBodyClasses() {
    document.body.classList.add("creator-mode", "creator-chat-available");
    if (global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.loggedIn) {
      global.__CREATOR_IS_LOGGED_IN = true;
      global.__creatorSettingsUserLoggedIn = true;
    }
  }

  function wireGuideRegistry() {
    var el = document.getElementById("eazy-guide-registry-data");
    if (el && !el.getAttribute("data-src")) {
      el.setAttribute("data-src", asset("eazy-guide-registry.json"));
    }
  }

  async function ensureEazy() {
    if (state) return state;

    state = (async function () {
      applyBodyClasses();
      if (global.CreatorPortalThemeBridge) global.CreatorPortalThemeBridge.notifyContextReady();

      [
        "/vendor/theme/eazy-mascot.css",
        "/vendor/theme/creator-chat-widget.css",
        "/vendor/theme/creator-chat-icon.css",
        "/vendor/theme/eazy-guide-mode.css",
        "/vendor/theme/eazy-prize-cards.css",
        "/vendor/theme/eazy-verify.css",
      ].forEach(loadCss);

      await injectPartial("creator-eazy-web-shell.html");
      await injectPartial("creator-chat-widget.html");

      wireGuideRegistry();
      configureLazyChatScripts();

      await loadScriptsSequential([
        asset("eazy-mascot.js"),
        asset("eazy-messages.js"),
        asset("eazy-bot.js"),
        asset("eazy-settings.js"),
        asset("creator-chat-icon.js"),
        asset("creator-chat-mascot.js"),
        asset("eazy-tips.js"),
        asset("creator-chat-actions.js"),
        asset("eazy-functions.js"),
        asset("eazy-mascot-tab.js"),
        asset("creator-notifications.bootstrap.js"),
        asset("eaz-chat-widget-loader.js"),
      ]);

      try {
        document.documentElement.classList.add("eazy-icon-ready");
      } catch (e) {}
    })();

      try {
        await state;
      } catch (e) {
        state = null;
        console.warn("[CreatorPortalEazy] load failed", e);
      }
      if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.applyOwnerFromAuth === "function") {
        global.CreatorPortalThemeBridge.applyOwnerFromAuth();
      }
      return state;
  }

  global.CreatorPortalEazy = {
    ensure: ensureEazy,
  };
})(typeof window !== "undefined" ? window : globalThis);
