/**
 * Community game iframe host for Eazy Modal Games tab.
 * Exposes window.EazyCommunityGameHost.mount(opts)
 */
(function (global) {
  "use strict";

  var ALLOWED_ORIGINS = [
    "https://play.eazpire.com",
    "https://play.local.eazpire.com",
  ];

  function t(key, fb) {
    if (global.CreatorI18n && global.CreatorI18n[key]) return global.CreatorI18n[key];
    return fb;
  }

  function apiBase() {
    return global.CREATOR_API_BASE || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  }

  function shopDomain() {
    return global.CREATOR_SHOP_DOMAIN || "eazpire.myshopify.com";
  }

  function ownerId() {
    if (global.__EAZ_OWNER_ID) return String(global.__EAZ_OWNER_ID).trim();
    if (global.Shopify && global.Shopify.customerId) return String(global.Shopify.customerId).trim();
    if (global.logged_in_customer_id) return String(global.logged_in_customer_id).trim();
    return null;
  }

  function mount(opts) {
    var root = opts && opts.root;
    if (!root) return;

    root.innerHTML = "";
    var iframe = document.createElement("iframe");
    iframe.className = "eazy-community-game__frame";
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin"
    );
    iframe.setAttribute("title", opts.title || "Community game");
    iframe.style.width = "100%";
    iframe.style.minHeight = "360px";
    iframe.style.border = "0";
    iframe.style.borderRadius = "12px";
    iframe.style.background = "#0f1115";
    root.appendChild(iframe);

    var sessionToken = opts.sessionToken || "";
    var locale = opts.locale || "en";
    var theme = opts.theme || "dark";

    function onMessage(ev) {
      if (ALLOWED_ORIGINS.indexOf(ev.origin) < 0) return;
      var data = ev.data;
      if (!data || typeof data.type !== "string" || data.type.indexOf("eazy:") !== 0) return;

      if (data.type === "eazy:resize" && data.payload && data.payload.height) {
        iframe.style.minHeight = Math.max(200, Number(data.payload.height)) + "px";
      }

      if (data.type === "eazy:finish") {
        global.removeEventListener("message", onMessage);
        finishSession(data.payload || {});
        if (typeof opts.onComplete === "function") opts.onComplete(data.payload);
      }

      if (data.type === "eazy:error" && typeof opts.onError === "function") {
        opts.onError(data.payload);
      }
    }

    function finishSession(payload) {
      var uid = ownerId();
      if (!uid || !sessionToken) return;
      fetch(apiBase() + "?op=community-game-session-finish&shop=" + encodeURIComponent(shopDomain()), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_token: sessionToken,
          logged_in_customer_id: uid,
          outcome: payload.outcome || "loss",
          score: payload.score,
          duration_ms: payload.durationMs || payload.duration_ms,
        }),
      }).catch(function () {});
    }

    global.addEventListener("message", onMessage);

    iframe.addEventListener("load", function () {
      try {
        iframe.contentWindow.postMessage(
          {
            type: "eazy:init",
            payload: {
              sessionToken: sessionToken,
              gameSlug: opts.gameSlug,
              version: opts.version,
              locale: locale,
              theme: theme,
            },
          },
          "*"
        );
      } catch (e) {
        /* cross-origin until same play origin */
      }
    });

    iframe.src = opts.bundleUrl || "about:blank";
  }

  function launchGame(gameSlug, rootEl, callbacks) {
    var uid = ownerId();
    if (!uid) {
      if (callbacks && callbacks.onError) {
        callbacks.onError({ message: t("games_login", "Sign in to play.") });
      }
      return Promise.reject(new Error("unauthorized"));
    }

    return fetch(
      apiBase() +
        "?op=community-game-session-start&shop=" +
        encodeURIComponent(shopDomain()),
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_slug: gameSlug,
          logged_in_customer_id: uid,
        }),
      }
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.message || data.error || "start_failed");
        mount({
          root: rootEl,
          gameSlug: gameSlug,
          sessionToken: data.session_token,
          bundleUrl: data.bundle_url,
          version: data.game && data.game.semver,
          title: data.game && data.game.title,
          onComplete: callbacks && callbacks.onComplete,
          onError: callbacks && callbacks.onError,
        });
        return data;
      });
  }

  function loadCatalog() {
    return fetch(
      apiBase() + "?op=community-games-catalog&shop=" + encodeURIComponent(shopDomain()),
      { credentials: "include" }
    ).then(function (r) {
      return r.json();
    });
  }

  global.EazyCommunityGameHost = {
    mount: mount,
    launchGame: launchGame,
    loadCatalog: loadCatalog,
  };
})(typeof window !== "undefined" ? window : globalThis);
