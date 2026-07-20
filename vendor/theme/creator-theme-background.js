/**
 * Applies configured Creator area backgrounds (mobile + desktop) from worker API.
 * Falls back to Liquid-injected defaults (galaxy-nebula-bg.png).
 */
(function () {
  "use strict";

  var MOBILE_QUERY = window.matchMedia("(max-width: 991px)");
  var appliedKey = "";
  var autoplayUnlockBound = false;
  var bgWatchdogTimer = null;
  /** Per-video last known currentTime for freeze detection (browser power-saving). */
  var bgVideoProgress = typeof WeakMap !== "undefined" ? new WeakMap() : null;

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
        vid.__creatorBgPauseAllowed = true;
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
      } catch (_) {}
    }
    layer.innerHTML = "";
    layer.classList.remove("creator-theme-bg-layer--video", "creator-theme-bg-layer--image");
  }

  function eazAnim(scope, key) {
    try {
      if (window.EazAnim && typeof window.EazAnim.isEnabled === "function") {
        return window.EazAnim.isEnabled(scope, key);
      }
    } catch (_e) {}
    return true;
  }

  function hardenThemeBgVideoAttrs(video) {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    try {
      video.volume = 0;
    } catch (_) {}
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("loop", "");
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("autoplay", "");
    video.setAttribute("disablepictureinpicture", "");
  }

  function rewindThemeBgVideo(video) {
    if (!video) return;
    try {
      if (video.currentTime > 0.05) {
        video.currentTime = 0.001;
      }
    } catch (_) {
      try {
        video.currentTime = 0;
      } catch (_e2) {}
    }
  }

  function playThemeBgVideo(video) {
    if (!video || !eazAnim("creator", "theme_bg_video")) return;
    if (document.hidden) return;
    if (video.__creatorBgPauseAllowed) return;

    hardenThemeBgVideoAttrs(video);

    if (video.preload === "none") {
      video.preload = "auto";
      try {
        video.load();
      } catch (_) {}
    }

    if (video.ended) {
      rewindThemeBgVideo(video);
    }

    var playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(function () {
        bindAutoplayUnlock();
      });
    }
  }

  function bindAutoplayUnlock() {
    if (autoplayUnlockBound) return;
    autoplayUnlockBound = true;
    function unlock() {
      document.querySelectorAll(".creator-theme-bg-video").forEach(function (video) {
        video.__creatorBgPauseAllowed = false;
      });
      resumeAllThemeBgVideos();
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("touchstart", unlock, true);
    }
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("touchstart", unlock, true);
  }

  function bindThemeBgVideoLoop(video) {
    if (!video || video.__creatorBgLoopBound) return;
    video.__creatorBgLoopBound = true;

    // Native loop is unreliable on some MP4s / Safari — always restart on ended.
    video.addEventListener("ended", function () {
      video.__creatorBgPauseAllowed = false;
      rewindThemeBgVideo(video);
      playThemeBgVideo(video);
    });

    // If the browser pauses us (power saving, memory pressure) while the tab is
    // visible, resume immediately. Intentional pauses set __creatorBgPauseAllowed.
    video.addEventListener("pause", function () {
      if (document.hidden || video.__creatorBgPauseAllowed) return;
      if (!eazAnim("creator", "theme_bg_video")) return;
      if (video.__creatorBgResumeScheduled) return;
      video.__creatorBgResumeScheduled = true;
      requestAnimationFrame(function () {
        video.__creatorBgResumeScheduled = false;
        if (document.hidden || video.__creatorBgPauseAllowed) return;
        if (video.ended) rewindThemeBgVideo(video);
        playThemeBgVideo(video);
      });
    });

    ["stalled", "waiting", "suspend", "emptied", "abort"].forEach(function (evt) {
      video.addEventListener(evt, function () {
        if (!document.hidden && !video.__creatorBgPauseAllowed) {
          playThemeBgVideo(video);
        }
      });
    });

    video.addEventListener("error", function () {
      if (video.__creatorBgRetryCount >= 4) return;
      video.__creatorBgRetryCount = (video.__creatorBgRetryCount || 0) + 1;
      setTimeout(function () {
        if (!video.__creatorBgSrc || !video.isConnected) return;
        video.__creatorBgPauseAllowed = false;
        try {
          if (video.src !== video.__creatorBgSrc) {
            video.src = video.__creatorBgSrc;
          }
          video.load();
        } catch (_) {}
        playThemeBgVideo(video);
      }, 400 * video.__creatorBgRetryCount);
    });
  }

  function ensureThemeBgVideoPlaying(video) {
    if (!video || !video.isConnected || document.hidden) return;
    if (!eazAnim("creator", "theme_bg_video")) return;
    if (video.__creatorBgPauseAllowed) return;

    hardenThemeBgVideoAttrs(video);

    var needsPlay = video.paused || video.ended || video.readyState < 2;

    // Detect frozen playback: reported as playing but currentTime not advancing.
    if (!needsPlay && bgVideoProgress) {
      var prev = bgVideoProgress.get(video);
      var now = video.currentTime;
      if (typeof prev === "number" && Math.abs(now - prev) < 0.01 && !video.ended) {
        needsPlay = true;
        rewindThemeBgVideo(video);
      }
      bgVideoProgress.set(video, now);
    }

    if (needsPlay) {
      playThemeBgVideo(video);
    }
  }

  function resumeAllThemeBgVideos() {
    if (!eazAnim("creator", "theme_bg_video")) return;
    document.querySelectorAll(".creator-theme-bg-video").forEach(function (video) {
      video.__creatorBgPauseAllowed = false;
      playThemeBgVideo(video);
    });
  }

  function startThemeBgVideo(video, opts) {
    if (!video) return;
    var forceReload = opts && opts.forceReload;
    video.__creatorBgPauseAllowed = false;
    hardenThemeBgVideoAttrs(video);
    bindThemeBgVideoLoop(video);
    bindAutoplayUnlock();

    function tryPlay() {
      playThemeBgVideo(video);
    }

    if (video.readyState >= 2 && !forceReload) {
      tryPlay();
      return;
    }

    video.addEventListener("loadeddata", tryPlay, { once: true });
    video.addEventListener("canplay", tryPlay, { once: true });
    video.addEventListener("canplaythrough", tryPlay, { once: true });

    if (forceReload || video.readyState === 0) {
      try {
        video.load();
      } catch (_) {}
    }
    tryPlay();
  }

  function createThemeBgVideo(url, posterUrl) {
    var video = document.createElement("video");
    video.className = "creator-theme-bg-video";
    video.preload = "auto";
    hardenThemeBgVideoAttrs(video);
    if (posterUrl) video.poster = posterUrl;
    video.__creatorBgSrc = url;
    video.__creatorBgRetryCount = 0;
    video.src = url;
    return video;
  }

  function applyImageLayer(layer, url) {
    var existingVideo = layer.querySelector("video.creator-theme-bg-video");
    if (existingVideo) clearLayer(layer);
    if (!url) {
      clearLayer(layer);
      return;
    }
    layer.classList.remove("creator-theme-bg-layer--video");
    layer.classList.add("creator-theme-bg-layer--image");
    layer.style.backgroundImage =
      "linear-gradient(180deg, rgba(10, 5, 20, 0.4) 0%, rgba(5, 2, 15, 0.6) 100%), url('" +
      String(url).replace(/'/g, "\\'") +
      "')";
  }

  function applyVideoLayer(layer, url, posterUrl) {
    if (!eazAnim("creator", "theme_bg_video")) {
      applyImageLayer(layer, posterUrl || url);
      return;
    }
    if (!url) {
      clearLayer(layer);
      return;
    }

    var existing = layer.querySelector("video.creator-theme-bg-video");
    if (existing && existing.__creatorBgSrc === url) {
      layer.classList.remove("creator-theme-bg-layer--image");
      layer.classList.add("creator-theme-bg-layer--video");
      layer.style.backgroundImage = "";
      if (posterUrl && existing.poster !== posterUrl) existing.poster = posterUrl;
      // Same URL: resume without load() — reloading mid-session was a stop cause.
      startThemeBgVideo(existing, { forceReload: false });
      return;
    }

    clearLayer(layer);
    layer.classList.add("creator-theme-bg-layer--video");
    layer.style.backgroundImage = "";
    var video = createThemeBgVideo(url, posterUrl);
    layer.appendChild(video);
    startThemeBgVideo(video, { forceReload: true });
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
    if (key === appliedKey) {
      resumeAllThemeBgVideos();
      return;
    }
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

  function readCachedPayload() {
    var cacheKey = "creator_theme_bg_v1";
    try {
      var cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;
      var parsed = JSON.parse(cached);
      if (parsed && parsed.expires > Date.now() && parsed.data) {
        return parsed.data;
      }
    } catch (_cacheRead) {}
    return null;
  }

  function writeCachedPayload(data) {
    var cacheKey = "creator_theme_bg_v1";
    try {
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ expires: Date.now() + 120000, data: data })
      );
    } catch (_cacheWrite) {}
  }

  function hasShellTargets() {
    return (
      !!document.querySelector(".creator-mobile-app") ||
      !!document.getElementById("creatorDesktopApp") ||
      !!document.getElementById("creatorDesktopHero")
    );
  }

  async function loadAndApply() {
    if (!hasShellTargets()) return;

    var fallbackPayload = {
      backgrounds: {
        mobile: resolveBg(null, "mobile"),
        desktop: resolveBg(null, "desktop"),
      },
    };

    var cachedPayload = readCachedPayload();
    if (cachedPayload) {
      window.__CREATOR_THEME_LAST_PAYLOAD__ = cachedPayload;
      applyAll(cachedPayload);
    }

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
      writeCachedPayload(data);
    } catch (err) {
      console.warn("[creator-theme-background]", err);
      if (!cachedPayload) {
        applyAll(fallbackPayload);
      }
    }
  }

  function startBgWatchdog() {
    if (bgWatchdogTimer) return;
    bgWatchdogTimer = setInterval(function () {
      if (document.hidden) return;
      document.querySelectorAll(".creator-theme-bg-video").forEach(ensureThemeBgVideoPlaying);
    }, 1500);
  }

  if (typeof MOBILE_QUERY.addEventListener === "function") {
    MOBILE_QUERY.addEventListener("change", onViewportChange);
  } else if (typeof MOBILE_QUERY.addListener === "function") {
    MOBILE_QUERY.addListener(onViewportChange);
  }

  function boot() {
    loadAndApply();
    startBgWatchdog();
    bindAutoplayUnlock();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      document.querySelectorAll(".creator-theme-bg-video").forEach(function (video) {
        video.__creatorBgPauseAllowed = true;
        try {
          video.pause();
        } catch (_) {}
      });
      return;
    }
    // Tab visible again: clear intentional-pause flag and restart playback.
    resumeAllThemeBgVideos();
    document.querySelectorAll(".creator-theme-bg-video").forEach(ensureThemeBgVideoPlaying);
  });

  document.addEventListener("creator:shell-screen-change", function () {
    resumeAllThemeBgVideos();
  });

  window.addEventListener("pageshow", function () {
    resumeAllThemeBgVideos();
  });

  document.addEventListener("eazCreatorContextReady", function (e) {
    if (e && e.detail && e.detail.soft) {
      resumeAllThemeBgVideos();
      return;
    }
    if (hasShellTargets()) {
      loadAndApply();
    } else {
      resumeAllThemeBgVideos();
    }
  });

  window.__CreatorThemeBackground = {
    resumeAllThemeBgVideos: resumeAllThemeBgVideos,
    loadAndApply: loadAndApply,
  };
})();
