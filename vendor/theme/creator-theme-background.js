/**
 * Applies configured Creator area backgrounds (mobile + desktop) from worker API.
 * Falls back to Liquid-injected defaults (galaxy-nebula-bg.png).
 */
(function () {
  "use strict";

  var MOBILE_QUERY = window.matchMedia("(max-width: 991px)");
  var appliedKey = "";

  function defaults() {
    return (
      window.__CREATOR_THEME_DEFAULTS__ || {
        mobile: { media_type: "image", url: "" },
        desktop: { media_type: "image", url: "" },
      }
    );
  }

  function apiBase() {
    return (
      (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) ||
      (window.CreatorWidgetConfig && Object.values(window.CreatorWidgetConfig)[0] && Object.values(window.CreatorWidgetConfig)[0].api_dispatch) ||
      "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch"
    );
  }

  function resolveBg(item, viewport) {
    var def = defaults()[viewport] || {};
    if (!item) return def;
    if (item.url) {
      return {
        media_type: item.media_type === "video" ? "video" : "image",
        url: item.url,
        poster_url: item.poster_url || (item.media_type === "image" ? item.url : def.url || ""),
      };
    }
    if (item.shopify_asset || item.source === "shopify_asset") {
      return {
        media_type: "image",
        url: def.url || "",
        poster_url: def.url || "",
      };
    }
    return def;
  }

  function ensureMediaLayer(container, slotName) {
    if (!container) return null;
    var layer = container.querySelector('[data-creator-theme-bg-layer="' + slotName + '"]');
    if (layer) return layer;
    layer = document.createElement("div");
    layer.className = "creator-theme-bg-layer";
    layer.setAttribute("data-creator-theme-bg-layer", slotName);
    layer.setAttribute("aria-hidden", "true");
    if (container.firstChild) {
      container.insertBefore(layer, container.firstChild);
    } else {
      container.appendChild(layer);
    }
    return layer;
  }

  function clearLayer(layer) {
    if (!layer) return;
    var vid = layer.querySelector("video");
    if (vid) {
      try {
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
      } catch (_) {}
    }
    layer.innerHTML = "";
    layer.classList.remove("creator-theme-bg-layer--video", "creator-theme-bg-layer--image");
  }

  function playThemeBgVideo(video) {
    if (!video || !eazAnim("creator", "theme_bg_video")) return;
    if (document.hidden) return;
    if (video.preload === "none") {
      video.preload = "auto";
      try {
        video.load();
      } catch (_) {}
    }
    video.play().catch(function () {});
  }

  function resumeAllThemeBgVideos() {
    if (!eazAnim("creator", "theme_bg_video")) return;
    document.querySelectorAll(".creator-theme-bg-video").forEach(function (video) {
      playThemeBgVideo(video);
    });
  }

  /** Ambient shell video — start when attached; do not pause on IO (screen switches kept it paused). */
  function startVideoWhenVisible(video) {
    if (!video) return;
    playThemeBgVideo(video);
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) playThemeBgVideo(video);
        });
      },
      { root: null, threshold: 0.01 }
    );
    obs.observe(video);
  }

  function applyImageLayer(layer, url) {
    clearLayer(layer);
    if (!url) return;
    layer.classList.add("creator-theme-bg-layer--image");
    layer.style.backgroundImage =
      "linear-gradient(180deg, rgba(10, 5, 20, 0.4) 0%, rgba(5, 2, 15, 0.6) 100%), url('" +
      String(url).replace(/'/g, "\\'") +
      "')";
  }

  function eazAnim(scope, key) {
    try {
      if (window.EazAnim && typeof window.EazAnim.isEnabled === "function") {
        return window.EazAnim.isEnabled(scope, key);
      }
    } catch (_e) {}
    return true;
  }

  function applyVideoLayer(layer, url, posterUrl) {
    if (!eazAnim("creator", "theme_bg_video")) {
      applyImageLayer(layer, posterUrl || url);
      return;
    }
    clearLayer(layer);
    if (!url) return;
    layer.classList.add("creator-theme-bg-layer--video");
    var video = document.createElement("video");
    video.className = "creator-theme-bg-video";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = false;
    video.preload = "none";
    video.setAttribute("disablepictureinpicture", "");
    if (posterUrl) video.poster = posterUrl;
    video.src = url;
    layer.appendChild(video);
    startVideoWhenVisible(video);
  }

  function applyMobile(bg) {
    var app = document.querySelector(".creator-mobile-app");
    if (!app) return;
    var layer = ensureMediaLayer(app, "mobile");

    if (bg.media_type === "video" && bg.url) {
      app.style.background = "linear-gradient(180deg, rgba(10, 5, 20, 0.4) 0%, rgba(5, 2, 15, 0.6) 100%)";
      app.style.removeProperty("--creator-mobile-galaxy");
      if (layer) layer.style.backgroundImage = "";
      applyVideoLayer(layer, bg.url, bg.poster_url);
      return;
    }

    clearLayer(layer);
    var cssUrl = bg.url ? "url('" + String(bg.url).replace(/'/g, "\\'") + "')" : "";
    if (cssUrl) {
      app.style.setProperty("--creator-mobile-galaxy", cssUrl);
      app.style.background =
        "var(--creator-mobile-galaxy) center center / cover no-repeat, linear-gradient(180deg, rgba(10, 5, 20, 0.4) 0%, rgba(5, 2, 15, 0.6) 100%)";
    }
  }

  function applyDesktop(bg) {
    var app = document.getElementById("creatorDesktopApp");
    var hero = document.getElementById("creatorDesktopHero");
    if (!app) return;

    var shellLayer = ensureMediaLayer(app, "desktop-shell");
    var heroLayer = hero ? ensureMediaLayer(hero, "desktop") : null;
    if (heroLayer) clearLayer(heroLayer);

    if (bg.media_type === "video" && bg.url) {
      app.classList.add("has-creator-theme-bg");
      if (hero) hero.style.removeProperty("--creator-desktop-hero-bg");
      applyVideoLayer(shellLayer, bg.url, bg.poster_url);
      return;
    }

    clearLayer(shellLayer);
    if (bg.url) {
      app.classList.add("has-creator-theme-bg");
      if (hero) hero.style.removeProperty("--creator-desktop-hero-bg");
      applyImageLayer(shellLayer, bg.url);
      return;
    }

    app.classList.remove("has-creator-theme-bg");
    if (hero) {
      hero.style.removeProperty("background");
    }
  }

  function applyAll(payload) {
    var bgs = (payload && payload.backgrounds) || {};
    var mobile = resolveBg(bgs.mobile, "mobile");
    var desktop = resolveBg(bgs.desktop, "desktop");
    var key = JSON.stringify({ mobile: mobile, desktop: desktop });
    if (key === appliedKey) return;
    appliedKey = key;

    if (MOBILE_QUERY.matches) {
      applyMobile(mobile);
    } else {
      applyDesktop(desktop);
    }
  }

  function onViewportChange() {
    appliedKey = "";
    if (window.__CREATOR_THEME_LAST_PAYLOAD__) {
      applyAll(window.__CREATOR_THEME_LAST_PAYLOAD__);
    }
  }

  async function loadAndApply() {
    if (
      !document.querySelector(".creator-mobile-app") &&
      !document.getElementById("creatorDesktopApp") &&
      !document.getElementById("creatorDesktopHero")
    ) {
      return;
    }

    var fallbackPayload = {
      backgrounds: {
        mobile: resolveBg(null, "mobile"),
        desktop: resolveBg(null, "desktop"),
      },
    };
    applyAll(fallbackPayload);

    var cacheKey = "creator_theme_bg_v1";
    try {
      var cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && parsed.expires > Date.now() && parsed.data) {
          window.__CREATOR_THEME_LAST_PAYLOAD__ = parsed.data;
          applyAll(parsed.data);
        }
      }
    } catch (_cacheRead) {}

    var fetchPromise = (async function () {
      if (window.EazAnim && typeof window.EazAnim.whenReady === "function") {
        try {
          await Promise.race([
            window.EazAnim.whenReady(),
            new Promise(function (resolve) {
              setTimeout(resolve, 400);
            }),
          ]);
        } catch (_e) {}
      }
      try {
        var u = new URL(apiBase(), window.location.origin);
        u.searchParams.set("op", "get-creator-area-backgrounds");
        var res = await fetch(u.toString(), { credentials: "omit", cache: "default" });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!data.ok) throw new Error(data.error || "load_failed");
        window.__CREATOR_THEME_LAST_PAYLOAD__ = data;
        applyAll(data);
        try {
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ expires: Date.now() + 120000, data: data })
          );
        } catch (_cacheWrite) {}
      } catch (err) {
        console.warn("[creator-theme-background]", err);
      }
    })();

    return fetchPromise;
  }

  if (typeof MOBILE_QUERY.addEventListener === "function") {
    MOBILE_QUERY.addEventListener("change", onViewportChange);
  } else if (typeof MOBILE_QUERY.addListener === "function") {
    MOBILE_QUERY.addListener(onViewportChange);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadAndApply);
  } else {
    loadAndApply();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      document.querySelectorAll(".creator-theme-bg-video").forEach(function (video) {
        try {
          video.pause();
        } catch (_) {}
      });
      return;
    }
    resumeAllThemeBgVideos();
  });

  document.addEventListener("creator:shell-screen-change", function () {
    resumeAllThemeBgVideos();
  });

  window.__CreatorThemeBackground = {
    resumeAllThemeBgVideos: resumeAllThemeBgVideos,
  };
})();
