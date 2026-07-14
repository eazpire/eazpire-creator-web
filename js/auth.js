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
    await refreshSession();
  }

  global.CreatorPortalAuth = {
    init: init,
    refreshSession: refreshSession,
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
