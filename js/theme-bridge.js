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
  global.__CREATOR_DASHBOARD_EMBED_PAGE = true;
  global.__EAZ_SKIP_SHOP_LIST_JOBS__ = true;
  global.__EAZ_DEFER_CREATOR_DESIGN_MODAL__ = true;

  (function patchStorageWhenBlocked() {
    ["localStorage", "sessionStorage"].forEach(function (name) {
      try {
        var store = global[name];
        store.setItem("__eaz_storage_probe__", "1");
        store.removeItem("__eaz_storage_probe__");
      } catch (e) {
        var mem = {};
        global[name] = {
          getItem: function (k) {
            return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
          },
          setItem: function (k, v) {
            mem[k] = String(v);
          },
          removeItem: function (k) {
            delete mem[k];
          },
          key: function (i) {
            return Object.keys(mem)[i] || null;
          },
          clear: function () {
            mem = {};
          },
        };
        try {
          Object.defineProperty(global[name], "length", {
            get: function () {
              return Object.keys(mem).length;
            },
          });
        } catch (_e) {}
      }
    });
  })();

  global.Shopify = global.Shopify || {};
  if (!global.Shopify.shop) global.Shopify.shop = "allyoucanpink.myshopify.com";

  function resolveOwnerId() {
    if (global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.ownerId) {
      return String(global.CreatorPortalAuth.state.ownerId).trim();
    }
    if (global.__EAZ_OWNER_ID) return String(global.__EAZ_OWNER_ID).trim();
    return null;
  }

  function syncChatAuthUi() {
    var loggedIn = !!resolveOwnerId();
    var gate = document.getElementById("creator-chat-login-gate");
    if (gate) gate.hidden = loggedIn;
    var input = document.getElementById("creator-chat-input");
    if (input) {
      input.disabled = !loggedIn;
      if (loggedIn && input.getAttribute("data-portal-placeholder")) {
        input.placeholder = input.getAttribute("data-portal-placeholder");
      }
    }
    var uploadBtn = document.getElementById("creator-chat-upload-btn");
    if (uploadBtn) {
      uploadBtn.disabled = !loggedIn;
      uploadBtn.style.opacity = loggedIn ? "" : "0.3";
      uploadBtn.style.pointerEvents = loggedIn ? "" : "none";
    }
    var loginBtn = gate && gate.querySelector(".creator-chat__login-gate-btn");
    if (loginBtn && loggedIn === false) {
      loginBtn.setAttribute("href", "/auth/login");
    }
  }

  function bindChatCloseDelegation() {
    if (global.__creatorPortalChatCloseBound) return;
    global.__creatorPortalChatCloseBound = true;
    document.addEventListener(
      "click",
      function (e) {
        var btn = e.target.closest("#creator-chat-close, .creator-chat__panel-close");
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        if (global.CreatorChat && typeof global.CreatorChat.close === "function") {
          global.CreatorChat.close();
        }
      },
      true
    );
  }

  function applyOwnerFromAuth() {
    var oid = resolveOwnerId();
    if (oid) {
      global.__EAZ_OWNER_ID = oid;
      global.__CREATOR_IS_LOGGED_IN = true;
      global.__creatorSettingsUserLoggedIn = true;
      try {
        delete global.__EAZY_GUEST;
      } catch (e) {
        global.__EAZY_GUEST = false;
      }
    } else {
      global.__CREATOR_IS_LOGGED_IN = false;
      global.__creatorSettingsUserLoggedIn = false;
      global.__EAZY_GUEST = true;
    }
    syncChatAuthUi();
    bindChatCloseDelegation();
    return oid;
  }

  global.creatorApiFetch = async function (operation, params, options) {
    var dispatchPath = "/api/dispatch";
    var url = new URL(origin + dispatchPath);
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
    var method = String((fetchOpts.method || "GET")).toUpperCase();
    var idempotent = method === "GET" || method === "HEAD";
    var attempts = idempotent ? 3 : 1;
    var lastErr = null;
    for (var attempt = 1; attempt <= attempts; attempt++) {
      try {
        var res = await fetch(url.toString(), fetchOpts);
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          var err = new Error("HTTP " + res.status);
          err.status = res.status;
          err.body = data;
          if (idempotent && (res.status >= 500 || res.status === 429) && attempt < attempts) {
            lastErr = err;
            await new Promise(function (r) {
              setTimeout(r, 200 * attempt);
            });
            continue;
          }
          throw err;
        }
        return data;
      } catch (e) {
        lastErr = e;
        if (idempotent && attempt < attempts && (!e.status || e.status >= 500 || e.status === 429)) {
          await new Promise(function (r) {
            setTimeout(r, 200 * attempt);
          });
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error("HTTP failed");
  };

  global.CreatorWidget = global.CreatorWidget || {};
  if (!global.CreatorWidget.apiBaseUrl) {
    global.CreatorWidget.apiBaseUrl = origin + "/api/dispatch";
  }
  if (!global.CreatorWidget.ownerId && resolveOwnerId()) {
    global.CreatorWidget.ownerId = resolveOwnerId();
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
      if (global.CreatorWidget) global.CreatorWidget.ownerId = resolveOwnerId();
      if (
        global.CreatorDashboardData &&
        typeof global.CreatorDashboardData.refreshDashboardShellData === "function"
      ) {
        try {
          global.CreatorDashboardData.refreshDashboardShellData();
        } catch (e) {}
      }
      if (typeof global.loadCreatorBalance === "function") {
        try {
          global.loadCreatorBalance(0);
        } catch (e) {}
      }
      if (typeof global.loadCreatorSalesBalance === "function") {
        try {
          global.loadCreatorSalesBalance(0);
        } catch (e) {}
      }
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
