/**
 * Path router for creator.eazpire.com (legacy #hash supported once, then migrated).
 */
(function (global) {
  "use strict";

  var SCREEN_TITLES = {
    dashboard: "Dashboard",
    research: "Research",
    creations: "My Creations",
    marketing: "Marketing",
    automations: "Automations",
    generator: "Design Generator",
  };

  var VALID = Object.keys(SCREEN_TITLES);
  var SLIDE_INDEX = { dashboard: 0, research: 1, generator: 2, creations: 3, marketing: 4, automations: 5 };
  var PATH_FOR_SCREEN = {
    dashboard: "/dashboard",
    research: "/research",
    generator: "/generator",
    creations: "/creations",
    marketing: "/marketing",
    automations: "/automations",
  };
  var SCREEN_FOR_PATH = {
    "/": "dashboard",
    "/dashboard": "dashboard",
    "/research": "research",
    "/generator": "generator",
    "/creations": "creations",
    "/marketing": "marketing",
    "/automations": "automations",
  };

  var current = "dashboard";

  function usesThemeShell() {
    return !!document.getElementById("creatorDesktopApp") || !!document.getElementById("creatorMobileApp");
  }

  function usesPathRouting() {
    return !!global.__CREATOR_PORTAL_HOST__;
  }

  function normalizeRoute(raw) {
    var name = String(raw || "dashboard")
      .replace(/^#/, "")
      .replace(/^\//, "")
      .toLowerCase()
      .trim();
    if (!name) return "dashboard";
    if (name === "promotions") return "marketing";
    return VALID.indexOf(name) >= 0 ? name : "dashboard";
  }

  function readPathRoute() {
    if (!usesPathRouting()) return readHashRoute();
    try {
      var path = (global.location.pathname || "/").replace(/\/$/, "") || "/";
      if (SCREEN_FOR_PATH[path]) return SCREEN_FOR_PATH[path];
    } catch (e) {}
    return readHashRoute();
  }

  function readHashRoute() {
    return normalizeRoute(global.location.hash);
  }

  function pathForScreen(name) {
    return PATH_FOR_SCREEN[normalizeRoute(name)] || "/dashboard";
  }

  function migrateLegacyHashToPath() {
    if (!usesPathRouting()) return;
    try {
      var hash = String(global.location.hash || "")
        .replace(/^#/, "")
        .toLowerCase()
        .trim();
      var path = (global.location.pathname || "/").replace(/\/$/, "") || "/";
      var targetPath = path;
      if (hash && hash !== "dashboard") {
        targetPath = pathForScreen(hash === "promotions" ? "marketing" : hash);
      } else if (path === "/" || path === "") {
        targetPath = "/dashboard";
      }
      if (targetPath !== path || hash) {
        var next = targetPath + (global.location.search || "");
        global.history.replaceState({ screen: normalizeRoute(targetPath.slice(1)) }, "", next);
      }
    } catch (e) {}
  }

  function setTitle(name) {
    var title = SCREEN_TITLES[name] || "Creator";
    var el = document.getElementById("creatorScreenTitle");
    if (el) el.textContent = title;
    var desktopTitle = document.getElementById("creatorDesktopScreenTitle");
    if (desktopTitle) desktopTitle.textContent = title;
    document.title = title + " · Eazpire Creator";
  }

  function isDesktopCreatorViewport() {
    try {
      return !!(global.matchMedia && global.matchMedia("(min-width: 992px)").matches);
    } catch (_mqErr) {
      return false;
    }
  }

  function applyDesktopPanels(name) {
    name = String(name || "").toLowerCase();
    if (!name) return false;
    var panel = document.querySelector('[data-desktop-screen="' + name + '"]');
    if (!panel) return false;
    document.querySelectorAll("[data-desktop-switch]").forEach(function (link) {
      var on = String(link.getAttribute("data-desktop-switch") || "").toLowerCase() === name;
      link.classList.toggle("is-active", on);
      if (link.hasAttribute("aria-selected")) {
        link.setAttribute("aria-selected", on ? "true" : "false");
      }
    });
    document.querySelectorAll("[data-desktop-screen]").forEach(function (el) {
      var on = String(el.getAttribute("data-desktop-screen") || "").toLowerCase() === name;
      el.classList.toggle("is-active", on);
      el.hidden = !on;
      el.setAttribute("aria-hidden", on ? "false" : "true");
    });
    var hero = document.getElementById("creatorDesktopHero");
    if (hero) hero.setAttribute("data-desktop-active-screen", name);
    return true;
  }

  function patchDesktopShellNav() {
    var shell = global.CreatorDesktopShell;
    if (!shell || typeof shell.switchScreen !== "function" || shell.__eazResearchNavPatched) return;
    var orig = shell.switchScreen;
    shell.switchScreen = function (nextScreen) {
      var requested = String(nextScreen || "").toLowerCase();
      orig.call(shell, nextScreen);
      if (!requested) return;
      var active = "";
      try {
        if (typeof shell.getActiveScreen === "function") {
          active = String(shell.getActiveScreen() || "").toLowerCase();
        }
      } catch (_activeErr) {}
      if (active === requested) return;
      if (!applyDesktopPanels(requested)) return;
      if (
        requested === "research" &&
        global.CreatorPortalFeatures &&
        typeof global.CreatorPortalFeatures.ensureResearch === "function"
      ) {
        global.CreatorPortalFeatures.ensureResearch();
      }
      syncFromShellScreen(requested, { replace: false });
    };
    shell.__eazResearchNavPatched = true;
  }

  function scheduleDesktopNavPatch() {
    var tries = 0;
    function tick() {
      patchDesktopShellNav();
      if (global.CreatorDesktopShell && global.CreatorDesktopShell.__eazResearchNavPatched) return;
      tries += 1;
      if (tries < 80) global.setTimeout(tick, 50);
    }
    tick();
  }

  function syncThemeShell(name) {
    // Desktop uses named panels. Mobile goTo is index-based and must not run on
    // desktop or an older 5-screen goTo(1) can fire Generator/Dashboard instead.
    if (!isDesktopCreatorViewport()) {
      var slide = SLIDE_INDEX[name];
      if (typeof slide === "number" && typeof global.__creatorGoTo === "function") {
        global.__creatorGoTo(slide);
      }
    }
    patchDesktopShellNav();
    if (global.CreatorDesktopShell && typeof global.CreatorDesktopShell.switchScreen === "function") {
      global.CreatorDesktopShell.switchScreen(name);
    }
  }

  /** Shell nav (drawer, dots, desktop nav) bypasses showScreen — sync path + lazy features. */
  function syncFromShellScreen(screenName, options) {
    options = options || {};
    var name = normalizeRoute(screenName);
    current = name;
    setTitle(name);
    if (!options.skipUrl && usesPathRouting()) {
      var expected = pathForScreen(name);
      var path = (global.location.pathname || "/").replace(/\/$/, "") || "/";
      if (path !== expected || global.location.hash) {
        updateBrowserUrl(name, { replace: !!options.replace });
      }
    }
    if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.onRoute === "function") {
      global.CreatorPortalFeatures.onRoute(name);
    }
  }

  function bindShellScreenUrlSync() {
    if (!usesPathRouting()) return;
    document.addEventListener("creator:shell-screen-change", function (e) {
      var screen = e.detail && e.detail.screen;
      if (!screen) return;
      syncFromShellScreen(screen, { replace: false });
    });
  }

  function updateBrowserUrl(name, options) {
    options = options || {};
    if (usesPathRouting()) {
      var path = pathForScreen(name) + (global.location.search || "");
      if (options.replace) {
        global.history.replaceState({ screen: name }, "", path);
      } else {
        global.history.pushState({ screen: name }, "", path);
      }
      return;
    }
    var hash = "#" + name;
    if (options.replace) {
      global.history.replaceState({ screen: name }, "", hash);
    } else {
      global.location.hash = hash;
    }
  }

  function showScreen(name, options) {
    options = options || {};
    current = normalizeRoute(name);
    if (usesThemeShell()) {
      setTitle(current);
      if (!options.skipUrl) updateBrowserUrl(current, { replace: !!options.replace });
      if (!options.skipShell) syncThemeShell(current);
      /* onRoute runs via creator:shell-screen-change from goTo / switchScreen */
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
    if (!options.skipUrl) updateBrowserUrl(current, { replace: !!options.replace });
    if (global.CreatorPortalDashboard && typeof global.CreatorPortalDashboard.onRoute === "function") {
      global.CreatorPortalDashboard.onRoute(current);
    }
    if (global.CreatorPortalFeatures && typeof global.CreatorPortalFeatures.onRoute === "function") {
      global.CreatorPortalFeatures.onRoute(current);
    }
  }

  function go(name, options) {
    options = options || {};
    showScreen(normalizeRoute(name), options);
  }

  function bindNav() {
    document.querySelectorAll("[data-go]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        go(btn.dataset.go);
      });
    });
    if (usesPathRouting()) {
      global.addEventListener("popstate", function () {
        showScreen(readPathRoute(), { skipUrl: true });
      });
    } else {
      global.addEventListener("hashchange", function () {
        showScreen(readHashRoute(), { skipUrl: true });
      });
    }
  }

  function initFromLocation() {
    bindNav();
    bindShellScreenUrlSync();
    scheduleDesktopNavPatch();
    migrateLegacyHashToPath();
    var route = readPathRoute();
    showScreen(route, { replace: true, skipUrl: true });
    if (usesPathRouting()) {
      updateBrowserUrl(route, { replace: true });
    } else if (!global.location.hash) {
      global.history.replaceState({ screen: route }, "", "#" + route);
    }
  }

  global.CreatorPortalRouter = {
    init: initFromLocation,
    go: go,
    syncFromShellScreen: syncFromShellScreen,
    current: function () {
      return current;
    },
    titles: SCREEN_TITLES,
    pathForScreen: pathForScreen,
    slideIndex: function (name) {
      return SLIDE_INDEX[normalizeRoute(name)];
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
