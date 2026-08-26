/**
 * Creator portal session — OAuth via account.eazpire.com.
 */
(function (global) {
  "use strict";

  const LOGOUT_URL = "/auth/logout";
  const OAUTH_START_URL = "/auth/oauth/start";

  const state = {
    loggedIn: false,
    ownerId: null,
  };

  var uiBound = false;
  var bootstrapApplied = false;

  function setAuth(loggedIn, ownerId) {
    state.loggedIn = !!loggedIn;
    state.ownerId = ownerId ? String(ownerId) : null;
    document.body.dataset.role = state.loggedIn ? "owner" : "guest";
    var ownerLabel = document.getElementById("creatorOwnerLabel");
    if (ownerLabel) ownerLabel.textContent = state.loggedIn ? "Creator #" + state.ownerId : "Creator";
  }

  var SSO_GUARD_KEY = "eaz_creator_sso_guard";
  var SHOP_HANDOFF_URL =
    "https://www.eazpire.com/pages/creator-handoff?next=" + encodeURIComponent("/dashboard");

  function hasSsoGuard() {
    try {
      if (sessionStorage.getItem(SSO_GUARD_KEY)) return true;
    } catch (e) {}
    try {
      if (/(?:^|;\s*)eaz_sso_guard=(?:1|true)(?:;|$)/i.test(document.cookie || "")) return true;
    } catch (e) {}
    return false;
  }

  function shouldRecoverFromShop(data) {
    if (data && data.logged_in) return false;
    if (global.__EAZ_SSO_BLOCK__) return false;
    if (hasSsoGuard()) return false;
    return !!(global.__EAZ_AUTH_OK__ || global.__EAZ_FROM_SHOP__);
  }

  function goToShopHandoff() {
    try {
      sessionStorage.setItem(SSO_GUARD_KEY, String(Date.now()));
    } catch (e) {}
    global.location.replace(SHOP_HANDOFF_URL);
  }

  function recoverShopSessionAfterGuestBootstrap() {
    var api = global.CreatorPortalApi;
    if (api && typeof api.me === "function") {
      api
        .me()
        .then(function (me) {
          if (me && me.logged_in) {
            bootstrapApplied = true;
            setAuth(true, me.owner_id);
            if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
              global.CreatorPortalThemeBridge.notifyContextReady();
            }
            return;
          }
          goToShopHandoff();
        })
        .catch(function () {
          goToShopHandoff();
        });
      return;
    }
    goToShopHandoff();
  }

  // Only recover after a shop switch (auth=ok / from_shop). Direct visits stay guest.
  function resumeShopSessionIfGuest(data) {
    if (!shouldRecoverFromShop(data && data.ok ? data : data)) return false;
    recoverShopSessionAfterGuestBootstrap();
    return true;
  }

  function applyBootstrapAuth(data) {
    var session = data && data.ok ? data : null;
    if (resumeShopSessionIfGuest(session || { ok: true, logged_in: false })) return;
    if (!session) return;
    bootstrapApplied = true;
    setAuth(!!session.logged_in, session.owner_id || null);
    if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
      global.CreatorPortalThemeBridge.notifyContextReady();
    }
  }

  function showToast(title, text) {
    var toast = document.getElementById("toast");
    var tTitle = document.getElementById("tTitle");
    var tText = document.getElementById("tText");
    if (!toast || !tTitle || !tText) return;
    tTitle.textContent = title;
    tText.textContent = text;
    toast.classList.add("show");
    setTimeout(function () {
      toast.classList.remove("show");
    }, 4200);
  }

  function handleAuthQuery() {
    try {
      var params = new URLSearchParams(global.location.search);
      var authOk = params.get("auth") === "ok";
      var fromShop = params.get("from_shop") === "1";
      if (authOk || fromShop) {
        if (authOk) global.__EAZ_AUTH_OK__ = true;
        if (fromShop) global.__EAZ_FROM_SHOP__ = true;
        params.delete("auth");
        params.delete("sso");
        params.delete("from_shop");
        var next = global.location.pathname + (params.toString() ? "?" + params.toString() : "");
        global.history.replaceState({}, "", next);
        if (authOk) showToast("Signed in", "Welcome to Eazpire Creator.");
      } else if (params.get("auth_error") || params.get("sso") === "0") {
        var err = params.get("auth_error") || "sign_in_failed";
        params.delete("auth_error");
        params.delete("sso");
        var nextErr = global.location.pathname + (params.toString() ? "?" + params.toString() : "");
        global.history.replaceState({}, "", nextErr);
        global.__EAZ_SSO_BLOCK__ = true;
        showToast("Sign-in failed", String(err).replace(/_/g, " "));
      }
    } catch (e) {}
  }

  async function refreshSession(opts) {
    opts = opts || {};
    // Skip duplicate /auth/me when bootstrap already applied session (including guest).
    // After a shop switch, still re-check once if bootstrap said guest.
    if (opts.skipIfKnown && bootstrapApplied) {
      var expectShopSession = !!(global.__EAZ_AUTH_OK__ || global.__EAZ_FROM_SHOP__) && !global.__EAZ_SSO_BLOCK__;
      if (!(expectShopSession && !state.loggedIn)) {
        return { logged_in: state.loggedIn, owner_id: state.ownerId };
      }
    }
    try {
      var me = await global.CreatorPortalApi.me();
      setAuth(me.logged_in, me.owner_id);
      if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.notifyContextReady === "function") {
        global.CreatorPortalThemeBridge.notifyContextReady();
      }
      return me;
    } catch (e) {
      setAuth(false, null);
      return { logged_in: false };
    }
  }

  function openLoginModal() {
    var modal = document.getElementById("creatorLoginModal");
    if (modal) {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeLoginModal(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    var modal = document.getElementById("creatorLoginModal");
    if (modal) {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function login() {
    openLoginModal();
  }

  function startOAuth() {
    global.location.href = OAUTH_START_URL;
  }

  function logout() {
    global.location.href = LOGOUT_URL;
  }

  function isLoginCloseTarget(el) {
    if (!el || !el.closest) return false;
    return !!(el.closest("#creatorLoginClose") || el.closest("[data-login-close]"));
  }

  function bindUi() {
    if (uiBound) return;
    uiBound = true;

    // Bind early (before session refresh) so X works even while /auth/me is in flight.
    document.addEventListener(
      "click",
      function (e) {
        if (isLoginCloseTarget(e.target)) {
          closeLoginModal(e);
          return;
        }
        var modal = document.getElementById("creatorLoginModal");
        if (modal && modal.classList.contains("is-open") && e.target === modal) {
          closeLoginModal(e);
        }
      },
      true
    );

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var modal = document.getElementById("creatorLoginModal");
      if (modal && modal.classList.contains("is-open")) closeLoginModal(e);
    });

    document.querySelectorAll("[data-login]").forEach(function (el) {
      el.addEventListener("click", login);
    });
    document.querySelectorAll("[data-oauth-start]").forEach(function (el) {
      el.addEventListener("click", startOAuth);
    });
    document.querySelectorAll("[data-logout]").forEach(function (el) {
      el.addEventListener("click", logout);
    });
  }

  async function init() {
    bindUi();
    handleAuthQuery();
    // Session comes from /api/bootstrap in app.js — avoid a parallel /auth/me on every boot.
  }

  global.CreatorPortalAuth = {
    init: init,
    refreshSession: refreshSession,
    resumeShopSessionIfGuest: resumeShopSessionIfGuest,
    applyBootstrapAuth: applyBootstrapAuth,
    login: login,
    logout: logout,
    closeLoginModal: closeLoginModal,
    state: state,
  };

  bindUi();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
