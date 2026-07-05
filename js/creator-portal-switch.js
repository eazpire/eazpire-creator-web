/**
 * Shop ↔ Creator toggle for creator.eazpire.com (mirrors theme/snippets/creator-switch.liquid).
 */
(function (global) {
  "use strict";

  if (!global.__CREATOR_PORTAL_HOST__) return;

  var toggles = document.querySelectorAll(".creator-toggle, .creator-drawer-toggle");
  if (!toggles.length) return;

  var raf =
    global.requestAnimationFrame ||
    function (cb) {
      return setTimeout(cb, 16);
    };

  var switchSound = null;
  try {
    switchSound = new Audio(
      "https://cdn.shopify.com/s/files/1/0739/5203/5098/files/creator-switch-audio.mp3?v=1763602051"
    );
    switchSound.volume = 0.4;
  } catch (e) {
    switchSound = null;
  }

  function playSwitchSound() {
    if (!switchSound) return;
    try {
      switchSound.currentTime = 0;
      switchSound.play().catch(function () {});
    } catch (e) {}
  }

  function normalizePath(input) {
    if (!input) return "";
    var value = String(input).trim();
    if (!value) return "";
    try {
      value = new URL(value, global.location.origin).pathname || value;
    } catch (e) {
      var match = value.match(/https?:\/\/[^/]+(\/.*)/i);
      if (match && match[1]) value = match[1];
    }
    value = value.split("#")[0].split("?")[0];
    value = value.replace(/\/+$/, "");
    if (!value.startsWith("/")) value = "/" + value.replace(/^\/+/, "");
    return value || "/";
  }

  function navigateWithTransition(targetUrl, transitionDir) {
    var url = targetUrl;
    if (url && typeof url.then === "function") {
      url.then(function (resolved) {
        navigateWithTransition(resolved, transitionDir);
      });
      return;
    }
    if (global.CreatorSwitchPageTransition && typeof global.CreatorSwitchPageTransition.start === "function") {
      global.CreatorSwitchPageTransition.start(url, transitionDir);
    } else {
      global.location.href = url;
    }
  }

  toggles.forEach(function (root) {
    if (root.__creatorInit) return;
    root.__creatorInit = true;

    var track = root.querySelector(".creator-toggle__track");
    var thumb = root.querySelector(".creator-toggle__thumb");
    if (!track || !thumb) return;

    var shopUrl = root.dataset.shopUrl || "https://www.eazpire.com/";
    var creatorUrl = root.dataset.creatorUrl || root.dataset.creatorPortalUrl || "https://creator.eazpire.com";
    var creatorPortalUrl = root.dataset.creatorPortalUrl || creatorUrl;
    var customerId = root.dataset.customerId || "";

    function resolveCreatorTarget() {
      if (global.EazCreatorPortalHandoff && customerId) {
        return global.EazCreatorPortalHandoff.resolveTargetUrl({ customerId: customerId });
      }
      return creatorPortalUrl;
    }

    var creatorPaths = (root.dataset.creatorPaths || "/dashboard,/generator,/creations,/marketing,/automations")
      .split(",")
      .map(normalizePath)
      .filter(Boolean);
    var creatorHandles = (root.dataset.creatorHandles || "")
      .split(",")
      .map(function (handle) {
        return handle.trim().replace(/^\/+/, "").toLowerCase();
      })
      .filter(Boolean);

    function currentMode() {
      return root.classList.contains("creator-toggle--creator") ? "creator" : "shop";
    }

    var dragging = false;
    var hasMoved = false;
    var startX = 0;
    var startLeft = 0;
    var minLeft = 2;
    var maxLeft = 0;

    function calcBounds() {
      var rt = track.getBoundingClientRect();
      var th = thumb.getBoundingClientRect();
      minLeft = 2;
      maxLeft = rt.width - th.width - 2;
      if (maxLeft < minLeft) maxLeft = minLeft;
    }

    function snapThumb(mode, animate) {
      calcBounds();
      thumb.style.transition = animate === false ? "none" : "left 0.2s ease";
      thumb.style.left = (mode === "creator" ? maxLeft : minLeft) + "px";
      if (animate === false) {
        raf(function () {
          thumb.style.transition = "";
        });
      }
    }

    function applyMode(mode, animate) {
      var targetMode = mode === "creator" ? "creator" : "shop";
      root.classList.toggle("creator-toggle--creator", targetMode === "creator");
      snapThumb(targetMode, animate);
    }

    function modeFromPath() {
      var currentPath = normalizePath(global.location.pathname || "/");
      var onCreatorPage = false;

      if (creatorPaths.length) {
        onCreatorPage = creatorPaths.some(function (path) {
          if (!path) return false;
          if (path === "/") return currentPath === "/";
          return (
            currentPath === path ||
            currentPath.indexOf(path + "/") === 0 ||
            currentPath.indexOf(path) > -1
          );
        });
      }

      if (!onCreatorPage && creatorHandles.length) {
        var lowerPath = currentPath.toLowerCase();
        onCreatorPage = creatorHandles.some(function (handle) {
          if (!handle) return false;
          var slug = "/pages/" + handle;
          return lowerPath.indexOf(slug) === 0;
        });
      }

      if (global.__CREATOR_PORTAL_HOST__ && (currentPath === "/" || currentPath === "/dashboard" || creatorPaths.indexOf(currentPath) >= 0)) {
        onCreatorPage = true;
      }

      return onCreatorPage ? "creator" : "shop";
    }

    applyMode(currentMode() || "creator", false);
    var pathMode = modeFromPath();
    if (pathMode) applyMode(pathMode, false);

    function onDown(e) {
      e.preventDefault();
      dragging = true;
      hasMoved = false;
      calcBounds();
      startX = e.clientX;
      startLeft = parseFloat(global.getComputedStyle(thumb).left) || (currentMode() === "creator" ? maxLeft : minLeft);
      thumb.style.transition = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    }

    function onMove(e) {
      if (!dragging) return;
      var delta = e.clientX - startX;
      if (Math.abs(delta) > 8) hasMoved = true;
      var nextLeft = Math.min(maxLeft, Math.max(minLeft, startLeft + delta));
      thumb.style.left = nextLeft + "px";
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);

      var prevMode = currentMode();
      var left = parseFloat(thumb.style.left) || (prevMode === "creator" ? maxLeft : minLeft);
      var frac = (left - minLeft) / (maxLeft - minLeft || 1);
      var newMode = prevMode;
      if (frac >= 0.8) newMode = "creator";
      else if (frac <= 0.2) newMode = "shop";

      applyMode(newMode, true);

      if (newMode !== prevMode) {
        playSwitchSound();
        if (newMode === "creator") {
          try {
            sessionStorage.setItem("__creator_switch_to_creator", "1");
          } catch (e) {}
        }
        var targetUrl = newMode === "creator" ? resolveCreatorTarget() : shopUrl;
        navigateWithTransition(targetUrl, newMode === "creator" ? "to-creator" : "to-shop");
      } else if (!hasMoved && typeof playTutorial === "function") {
        playTutorial(prevMode === "shop" ? "right" : "left");
      }
    }

    thumb.addEventListener("pointerdown", onDown);

    var tutorialHand = root.querySelector(".creator-toggle__tutorial-hand");
    if (!tutorialHand) return;

    function playTutorial(direction, options) {
      options = options || {};
      if (root.__tutorialPlaying) return;
      root.__tutorialPlaying = true;
      root.classList.remove("is-tutorial-pushing-left", "is-tutorial-pushing-right", "creator-toggle--code-hint-pulse");
      tutorialHand.classList.remove("is-pushing-left", "is-pushing-right");
      thumb.style.transition = "none";

      raf(function () {
        var isRight = direction === "right";
        root.classList.add(isRight ? "is-tutorial-pushing-right" : "is-tutorial-pushing-left");
        tutorialHand.classList.add(isRight ? "is-pushing-right" : "is-pushing-left");
        if (options.pulse) root.classList.add("creator-toggle--code-hint-pulse");
      });

      setTimeout(function () {
        root.classList.remove("is-tutorial-pushing-left", "is-tutorial-pushing-right", "creator-toggle--code-hint-pulse");
        tutorialHand.classList.remove("is-pushing-left", "is-pushing-right");
        snapThumb(currentMode(), true);
        root.__tutorialPlaying = false;
      }, 1200);
    }

    root.__playCreatorTutorial = playTutorial;

    root.querySelectorAll(".creator-toggle__label").forEach(function (label) {
      label.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var mode = currentMode();
        playTutorial(mode === "shop" ? "right" : "left");
      });
      label.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          label.click();
        }
      });
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
