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

  function setAuth(loggedIn, ownerId) {
    state.loggedIn = !!loggedIn;
    state.ownerId = ownerId ? String(ownerId) : null;
    document.body.dataset.role = state.loggedIn ? "owner" : "guest";
    var ownerLabel = document.getElementById("creatorOwnerLabel");
    if (ownerLabel) ownerLabel.textContent = state.loggedIn ? "Creator #" + state.ownerId : "Creator";
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
      if (params.get("auth") === "ok") {
        params.delete("auth");
        var next = global.location.pathname + (params.toString() ? "?" + params.toString() : "");
        global.history.replaceState({}, "", next);
        showToast("Signed in", "Welcome to Eazpire Creator.");
      } else if (params.get("auth_error")) {
        var err = params.get("auth_error");
        params.delete("auth_error");
        var nextErr = global.location.pathname + (params.toString() ? "?" + params.toString() : "");
        global.history.replaceState({}, "", nextErr);
        showToast("Sign-in failed", err.replace(/_/g, " "));
      }
    } catch (e) {}
  }

  async function refreshSession() {
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

  function closeLoginModal() {
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

  async function init() {
    handleAuthQuery();
    await refreshSession();
    document.querySelectorAll("[data-login]").forEach(function (el) {
      el.addEventListener("click", login);
    });
    document.querySelectorAll("[data-oauth-start]").forEach(function (el) {
      el.addEventListener("click", startOAuth);
    });
    document.querySelectorAll("[data-logout]").forEach(function (el) {
      el.addEventListener("click", logout);
    });
    var closeBtn = document.getElementById("creatorLoginClose");
    if (closeBtn) closeBtn.addEventListener("click", closeLoginModal);
    var modal = document.getElementById("creatorLoginModal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeLoginModal();
      });
    }
  }

  global.CreatorPortalAuth = {
    init: init,
    refreshSession: refreshSession,
    login: login,
    logout: logout,
    state: state,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
