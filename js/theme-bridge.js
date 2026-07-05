/**
 * Bridges theme creator JS to creator.eazpire.com portal (API, owner, Shopify stubs).
 */
(function (global) {
  "use strict";

  var origin = global.location ? global.location.origin.replace(/\/$/, "") : "";

  global.CREATOR_API_CONFIG = global.CREATOR_API_CONFIG || {};
  global.CREATOR_API_CONFIG.BASE_URL = origin;
  global.CREATOR_API_CONFIG.TIMEOUT = 30000;
  global.CREATOR_API_CONFIG.RETRY_ATTEMPTS = 2;
  global.CREATOR_API_CONFIG.RETRY_DELAY = 1000;
  global.CREATOR_API_CONFIG.getDispatchUrl = function () {
    return origin + "/api/dispatch";
  };

  global.__CREATOR_PORTAL_HOST__ = true;
  global.__EAZ_SKIP_SHOP_LIST_JOBS__ = true;
  global.__EAZ_DEFER_CREATOR_DESIGN_MODAL__ = true;

  global.Shopify = global.Shopify || {};
  if (!global.Shopify.shop) global.Shopify.shop = "allyoucanpink.myshopify.com";

  function resolveOwnerId() {
    if (global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.ownerId) {
      return String(global.CreatorPortalAuth.state.ownerId).trim();
    }
    if (global.__EAZ_OWNER_ID) return String(global.__EAZ_OWNER_ID).trim();
    return null;
  }

  function applyOwnerFromAuth() {
    var oid = resolveOwnerId();
    if (oid) {
      global.__EAZ_OWNER_ID = oid;
      global.__CREATOR_IS_LOGGED_IN = true;
    } else {
      global.__CREATOR_IS_LOGGED_IN = false;
    }
    return oid;
  }

  global.creatorApiFetch = async function (operation, params, options) {
    var url = new URL(origin + "/apps/creator-dispatch");
    url.searchParams.set("op", operation);
    if (!options || !options.method || options.method === "GET") url.searchParams.set("_t", String(Date.now()));
    Object.keys(params || {}).forEach(function (key) {
      var val = params[key];
      if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
    });
    var oid = resolveOwnerId();
    if (oid && !url.searchParams.has("owner_id")) url.searchParams.set("owner_id", oid);
    if (oid && !url.searchParams.has("logged_in_customer_id")) url.searchParams.set("logged_in_customer_id", oid);

    var fetchOpts = { credentials: "include", cache: "no-store" };
    if (options) Object.assign(fetchOpts, options);
    var res = await fetch(url.toString(), fetchOpts);
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      var err = new Error("HTTP " + res.status);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  };

  global.CreatorWidget = global.CreatorWidget || {};
  if (!global.CreatorWidget.apiBaseUrl) {
    global.CreatorWidget.apiBaseUrl = origin + "/apps/creator-dispatch";
  }

  global.EazAnim = global.EazAnim || {
    isEnabled: function (scope, key) {
      if (scope === "creator" && key === "theme_bg_video") return true;
      return false;
    },
    whenReady: function () {
      return Promise.resolve();
    },
  };

  function applyPortalI18n(root) {
    var scope = root || document;
    var map = global.CreatorI18n || {};
    scope.querySelectorAll("[data-t]").forEach(function (el) {
      var key = el.getAttribute("data-t");
      if (!key || map[key] == null) return;
      if (el.children.length) return;
      el.textContent = map[key];
      el.setAttribute("data-t-applied", "1");
    });
    scope.querySelectorAll("[data-t-aria-label]").forEach(function (el) {
      var key = el.getAttribute("data-t-aria-label");
      if (key && map[key] != null) {
        el.setAttribute("aria-label", map[key]);
        el.setAttribute("data-t-applied", "1");
      }
    });
    scope.querySelectorAll("[aria-label][data-t]").forEach(function (el) {
      var key = el.getAttribute("data-t");
      if (key && map[key] != null) el.setAttribute("aria-label", map[key]);
    });
  }

  global.CreatorPortalI18n = {
    applyDataT: applyPortalI18n,
  };

  global.CreatorPortalThemeBridge = {
    applyOwnerFromAuth: applyOwnerFromAuth,
    resolveOwnerId: resolveOwnerId,
    applyPortalI18n: applyPortalI18n,
    notifyContextReady: function () {
      applyOwnerFromAuth();
      global.dispatchEvent(new CustomEvent("eazCreatorContextReady"));
    },
    assetUrl: function (file) {
      return "/vendor/theme/" + file;
    },
    partialUrl: function (name) {
      return "/partials/" + name;
    },
  };

  applyOwnerFromAuth();
})(typeof window !== "undefined" ? window : globalThis);
