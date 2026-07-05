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

  global.EazAnim = global.EazAnim || {
    isEnabled: function () {
      return false;
    },
    whenReady: function () {
      return Promise.resolve();
    },
  };

  global.CreatorPortalThemeBridge = {
    applyOwnerFromAuth: applyOwnerFromAuth,
    resolveOwnerId: resolveOwnerId,
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
