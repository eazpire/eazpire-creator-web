/**
 * Hash router — delegates to theme shell when present.
 */
(function (global) {
  "use strict";

  var SCREEN_TITLES = {
    dashboard: "Dashboard",
    creations: "My Creations",
    marketing: "Marketing",
    automations: "Automations",
    generator: "Design Generator",
  };

  var VALID = Object.keys(SCREEN_TITLES);
  var current = "dashboard";

  function usesThemeShell() {
    return !!document.getElementById("creatorDesktopApp") || !!document.getElementById("creatorMobileApp");
  }

  function normalizeRoute(raw) {
    var name = String(raw || "dashboard")
      .replace(/^#/, "")
      .toLowerCase()
      .trim();
    if (!name) return "dashboard";
    if (name === "promotions") return "marketing";
    return VALID.indexOf(name) >= 0 ? name : "dashboard";
  }

  function readHashRoute() {
    return normalizeRoute(global.location.hash);
  }

  function setTitle(name) {
    var title = SCREEN_TITLES[name] || "Creator";
    var el = document.getElementById("creatorScreenTitle");
    if (el) el.textContent = title;
    var desktopTitle = document.getElementById("creatorDesktopScreenTitle");
    if (desktopTitle) desktopTitle.textContent = title;
    document.title = title + " · Eazpire Creator";
  }

  function showScreen(name) {
    current = normalizeRoute(name);
    if (usesThemeShell()) {
      setTitle(current);
      var hash = "#" + current;
      if (global.location.hash !== hash) {
        if (global.history.replaceState) {
          global.history.replaceState({ screen: current }, "", hash);
        } else {
          global.location.hash = hash;
        }
      }
      if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.onRoute === "function") {
        global.CreatorPortalFeatures.onRoute(current);
      }
      return;
    }

    document.querySelectorAll("[data-screen]").forEach(function (section) {
      var screenName = section.dataset.screen;
      if (!screenName || /^[0-9]+$/.test(screenName)) return;
      var on = screenName === current;
      section.classList.toggle("active", on);
      section.hidden = !on;
    });
    document.querySelectorAll("[data-go]").forEach(function (btn) {
      var on = btn.dataset.go === current;
      btn.classList.toggle("active", on);
      btn.classList.toggle("on", on);
    });
    setTitle(current);
    if (global.CreatorPortalDashboard && typeof global.CreatorPortalDashboard.onRoute === "function") {
      global.CreatorPortalDashboard.onRoute(current);
    }
    if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.onRoute === "function") {
      global.CreatorPortalFeatures.onRoute(current);
    }
  }

  function go(name, options) {
    options = options || {};
    var next = normalizeRoute(name);
    var hash = "#" + next;
    if (options.replace) {
      global.history.replaceState({ screen: next }, "", hash);
    } else {
      global.location.hash = hash;
    }
    showScreen(next);
  }

  function bindNav() {
    document.querySelectorAll("[data-go]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        go(btn.dataset.go);
      });
    });
    global.addEventListener("hashchange", function () {
      showScreen(readHashRoute());
    });
  }

  function initFromHash() {
    bindNav();
    var route = readHashRoute();
    if (!global.location.hash) {
      global.history.replaceState({ screen: route }, "", "#" + route);
    }
    showScreen(route);
  }

  global.CreatorPortalRouter = {
    init: initFromHash,
    go: go,
    current: function () {
      return current;
    },
    titles: SCREEN_TITLES,
  };
})(typeof window !== "undefined" ? window : globalThis);
