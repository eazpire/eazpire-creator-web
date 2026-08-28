/**
 * Creator switch navigation:
 * - Shop → Creator: skip dissolve wipe; show Creator boot overlay + theme video, then navigate
 * - Creator → Shop: cloned DOM / html2canvas snapshot dissolve (iframe preload blocked by CSP)
 */
(function () {
  'use strict';

  var ACTIVE_KEY = '__creatorSwitchTransitionActive';
  var PARTICLES_CANVAS_ID = 'creator-switch-live-particles-canvas';
  var DOM_OVERLAY_ID = 'creator-switch-live-dom-overlay';
  var BOOT_OVERLAY_ID = 'creator-switch-boot-overlay';
  var BOOT_STYLE_ID = 'creator-switch-boot-overlay-style';
  var THEME_BG_CACHE_KEY = 'creator_theme_bg_v1';
  var CREATOR_BOOT_LOGO =
    'https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950';
  var DURATION_DESKTOP_MS = 2400;
  var DURATION_MOBILE_MS = 1500;
  /** Shop → Creator: wait for handoff URL before navigating (avoids landing logged out). */
  var NAV_FALLBACK_MS = 5200;
  var NAV_FALLBACK_TO_CREATOR_MS = 12000;
  var HTML2CANVAS_SRC = (typeof window !== 'undefined' && window.__eazHtml2canvasSrc) ||
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
  var html2canvasReadyPromise = null;

  function withTimeout(promise, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, timeoutMs);
      promise.then(function (value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }).catch(function (err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function loadHtml2Canvas() {
    return new Promise(function (resolve, reject) {
      if (window.html2canvas) {
        resolve(window.html2canvas);
        return;
      }
      var existing = document.querySelector('script[data-creator-html2canvas="true"]');
      if (existing) {
        existing.addEventListener('load', function () {
          window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas unavailable'));
        }, { once: true });
        existing.addEventListener('error', function () {
          reject(new Error('html2canvas load failed'));
        }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = HTML2CANVAS_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.creatorHtml2canvas = 'true';
      script.addEventListener('load', function () {
        window.html2canvas ? resolve(window.html2canvas) : reject(new Error('html2canvas unavailable'));
      }, { once: true });
      script.addEventListener('error', function () {
        reject(new Error('html2canvas load failed'));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureHtml2CanvasReady() {
    if (!html2canvasReadyPromise) {
      html2canvasReadyPromise = loadHtml2Canvas();
    }
    return html2canvasReadyPromise;
  }

  function captureSnapshotCanvas() {
    return ensureHtml2CanvasReady().then(function (html2canvas) {
      var isLikelyMobile = Math.min(window.innerWidth || 0, window.innerHeight || 0) < 900 ||
        ((navigator.maxTouchPoints || 0) > 0 && (window.innerWidth || 0) < 1200);
      var dpr = isLikelyMobile ? 0.9 : Math.max(1, Math.min(1.35, window.devicePixelRatio || 1));
      return html2canvas(document.body || document.documentElement, {
        backgroundColor: null,
        useCORS: true,
        logging: false,
        scale: dpr,
        imageTimeout: isLikelyMobile ? 180 : 450,
        width: window.innerWidth,
        height: window.innerHeight,
        x: window.scrollX || 0,
        y: window.scrollY || 0,
        removeContainer: true
      });
    });
  }

  /**
   * cloneNode(true) of custom elements has no shadow root. Appending them re-runs
   * connectedCallback and can throw (e.g. overflow-list in critical.js). Replace
   * hyphenated tags with inert divs before the clone enters the live document.
   */
  function neutralizeCloneForOverlay(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('script, iframe, object, embed, link[rel="stylesheet"]').forEach(function (node) {
      try { node.remove(); } catch (_e) {}
    });
    root.querySelectorAll('video, audio').forEach(function (node) {
      try { node.pause(); } catch (_e) {}
      try { node.removeAttribute('autoplay'); } catch (_e2) {}
    });

    var customs = Array.prototype.slice.call(root.querySelectorAll('*')).filter(function (el) {
      return el.tagName && el.tagName.indexOf('-') !== -1;
    });
    // Deepest first so nested custom elements are replaced before parents
    customs.sort(function (a, b) {
      var da = 0;
      var db = 0;
      var n = a;
      while (n && n !== root) { da++; n = n.parentNode; }
      n = b;
      while (n && n !== root) { db++; n = n.parentNode; }
      return db - da;
    });
    customs.forEach(function (el) {
      if (!el.parentNode) return;
      var inert = document.createElement('div');
      inert.className = el.className || '';
      var style = el.getAttribute('style');
      if (style) inert.setAttribute('style', style);
      inert.setAttribute('data-creator-switch-inert', (el.tagName || '').toLowerCase());
      while (el.firstChild) {
        inert.appendChild(el.firstChild);
      }
      try {
        el.parentNode.replaceChild(inert, el);
      } catch (_e) {
        try { el.remove(); } catch (_e2) {}
      }
    });
  }

  function ensureDomOverlay() {
    var existing = document.getElementById(DOM_OVERLAY_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var overlay = document.createElement('div');
    overlay.id = DOM_OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.overflow = 'hidden';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483646';
    overlay.style.background = 'transparent';
    overlay.style.willChange = 'clip-path';

    var clone = document.body.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.margin = '0';
    clone.style.transform = 'translate(' + (-(window.scrollX || 0)) + 'px,' + (-(window.scrollY || 0)) + 'px)';
    clone.style.transformOrigin = 'top left';
    clone.style.pointerEvents = 'none';
    clone.style.animation = 'none';
    clone.style.transition = 'none';
    neutralizeCloneForOverlay(clone);
    overlay.appendChild(clone);
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function ensureParticlesCanvas() {
    var existing = document.getElementById(PARTICLES_CANVAS_ID);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var canvas = document.createElement('canvas');
    canvas.id = PARTICLES_CANVAS_ID;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '2147483647';
    canvas.style.background = 'transparent';
    document.documentElement.appendChild(canvas);
    return canvas;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function samplePixelGrid(imgCanvas, vw, ox, oy, step, direction) {
    var pixels = [];
    var ictx = imgCanvas.getContext('2d', { alpha: true });
    if (!ictx) return pixels;
    var dw = imgCanvas.width;
    var dh = imgCanvas.height;
    var data = ictx.getImageData(0, 0, dw, dh).data;
    for (var gy = 0; gy < dh; gy += step) {
      for (var gx = 0; gx < dw; gx += step) {
        var idx = (gy * dw + gx) * 4;
        var a = data[idx + 3] / 255;
        if (a <= 0.06) continue;
        var screenX = ox + gx;
        var screenY = oy + gy;
        var normX = screenX / Math.max(1, vw);
        var jitter = (Math.random() - 0.5) * 0.08;
        var dissolveAt = direction === 'ltr' ? normX + jitter : (1 - normX) + jitter;
        pixels.push({
          x: screenX,
          y: screenY,
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: a,
          dissolveAt: Math.max(0, Math.min(1, dissolveAt)),
          vx: (direction === 'ltr' ? 1 : -1) * (1.6 + Math.random() * 2.8),
          vy: (Math.random() - 0.5) * 2.2,
          size: step * 1.05
        });
      }
    }
    return pixels;
  }

  function drawPixelDissolve(ctx, pixels, progress, dissolveBand) {
    var p = easeOutCubic(progress);
    for (var i = 0; i < pixels.length; i++) {
      var pixel = pixels[i];
      var local = (p - pixel.dissolveAt) / dissolveBand;
      if (local < 0) {
        ctx.fillStyle = 'rgba(' + pixel.r + ',' + pixel.g + ',' + pixel.b + ',' + pixel.a.toFixed(3) + ')';
        ctx.fillRect(pixel.x, pixel.y, pixel.size, pixel.size);
      } else if (local < 1) {
        var t = easeOutCubic(local);
        var alpha = pixel.a * (1 - t);
        if (alpha <= 0.02) continue;
        var drift = t * 28;
        var size = pixel.size * (1 - t * 0.35);
        ctx.fillStyle = 'rgba(' + pixel.r + ',' + pixel.g + ',' + pixel.b + ',' + alpha.toFixed(3) + ')';
        ctx.fillRect(pixel.x + pixel.vx * drift, pixel.y + pixel.vy * drift, size, size);
      }
    }
  }

  function spawnParticlesFromFrontier(particles, frontierX, direction, elapsed, viewportW, viewportH) {
    var stepY = viewportW < 640 ? 11 : 8;
    for (var y = 0; y < viewportH; y += stepY) {
      if (Math.random() > 0.52) continue;
      particles.push({
        x: frontierX + (Math.random() - 0.5) * 7,
        y: y + Math.random() * stepY,
        r: 245 + Math.floor(Math.random() * 10),
        g: 245 + Math.floor(Math.random() * 10),
        b: 245 + Math.floor(Math.random() * 10),
        a: 0.45 + Math.random() * 0.35,
        born: elapsed,
        vx: (direction === 'ltr' ? 1 : -1) * (0.8 + Math.random() * 1.7),
        vy: (Math.random() - 0.5) * 1.15,
        size: 1.2 + Math.random() * 1.8
      });
    }
    if (particles.length > 2600) particles.splice(0, particles.length - 2600);
  }

  function runSnapshotOverlayTransition(snapshotCanvas, onComplete, direction, durationMs) {
    var overlay = ensureParticlesCanvas();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    overlay.width = Math.floor(vw * dpr);
    overlay.height = Math.floor(vh * dpr);
    var ctx = overlay.getContext('2d', { alpha: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var sw = snapshotCanvas.width;
    var sh = snapshotCanvas.height;
    var scale = Math.max(vw / Math.max(1, sw), vh / Math.max(1, sh));
    var dw = Math.max(1, Math.floor(sw * scale));
    var dh = Math.max(1, Math.floor(sh * scale));
    var ox = Math.floor((vw - dw) / 2);
    var oy = Math.floor((vh - dh) / 2);

    var imgCanvas = document.createElement('canvas');
    imgCanvas.width = dw;
    imgCanvas.height = dh;
    var ictx = imgCanvas.getContext('2d', { alpha: true });
    ictx.imageSmoothingEnabled = true;
    ictx.imageSmoothingQuality = 'high';
    ictx.drawImage(snapshotCanvas, 0, 0, sw, sh, 0, 0, dw, dh);

    var step = vw < 640 ? 10 : (vw < 1080 ? 12 : 14);
    var pixels = samplePixelGrid(imgCanvas, vw, ox, oy, step, direction);
    var dissolveBand = 0.14;
    var start = performance.now();
    function frame(nowMs) {
      var elapsed = nowMs - start;
      var p = Math.min(1, elapsed / durationMs);

      ctx.clearRect(0, 0, vw, vh);
      drawPixelDissolve(ctx, pixels, p, dissolveBand);

      if (p < 1) {
        requestAnimationFrame(frame);
        return;
      }

      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof onComplete === 'function') onComplete();
    }

    requestAnimationFrame(frame);
  }

  function runDomOverlayTransition(onComplete, direction, durationMs) {
    var domOverlay;
    try {
      domOverlay = ensureDomOverlay();
    } catch (err) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    var overlay = ensureParticlesCanvas();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    overlay.width = Math.floor(vw * dpr);
    overlay.height = Math.floor(vh * dpr);
    var ctx = overlay.getContext('2d', { alpha: true });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var particles = [];
    var start = performance.now();
    function frame(nowMs) {
      var elapsed = nowMs - start;
      var p = Math.min(1, elapsed / durationMs);
      var eased = easeOutCubic(p);
      var frontier = direction === 'ltr' ? vw * eased : vw * (1 - eased);
      ctx.clearRect(0, 0, vw, vh);
      if (direction === 'ltr') domOverlay.style.clipPath = 'inset(0 ' + (eased * 100).toFixed(3) + '% 0 0)';
      else domOverlay.style.clipPath = 'inset(0 0 0 ' + (eased * 100).toFixed(3) + '%)';
      spawnParticlesFromFrontier(particles, frontier, direction, elapsed, vw, vh);
      for (var i = particles.length - 1; i >= 0; i--) {
        var pt = particles[i];
        var age = elapsed - pt.born;
        var t = Math.min(1, age / 900);
        var alpha = pt.a * (1 - easeOutCubic(t));
        if (alpha <= 0.01) { particles.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
        ctx.fillRect(pt.x + pt.vx * age * 0.1, pt.y + pt.vy * age * 0.09, pt.size, pt.size);
      }
      if (p < 1) {
        requestAnimationFrame(frame);
        return;
      }
      if (domOverlay.parentNode) domOverlay.parentNode.removeChild(domOverlay);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof onComplete === 'function') onComplete();
    }
    requestAnimationFrame(frame);
  }

  function eazAnim(scope, key) {
    try {
      if (window.EazAnim && typeof window.EazAnim.isEnabled === 'function') {
        return window.EazAnim.isEnabled(scope, key);
      }
    } catch (_e) {}
    return true;
  }

  function transitionAnimEnabled(mode) {
    if (mode === 'to-shop') return eazAnim('creator', 'switch_page_transition');
    return true;
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_e) {
      return false;
    }
  }

  function isCreatorMobileViewport() {
    try {
      return !!(window.matchMedia && window.matchMedia('(max-width: 991px)').matches);
    } catch (_e2) {
      return (window.innerWidth || 0) < 992;
    }
  }

  function themeBgApiUrl() {
    if (window.CREATOR_API_CONFIG && typeof window.CREATOR_API_CONFIG.getDispatchUrl === 'function') {
      try {
        var u = new URL(window.CREATOR_API_CONFIG.getDispatchUrl(), window.location.origin);
        u.searchParams.set('op', 'get-creator-area-backgrounds');
        return u.toString();
      } catch (_e3) {}
    }
    return 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch?op=get-creator-area-backgrounds';
  }

  function pickThemeBg(payload) {
    var bgs = (payload && payload.backgrounds) || {};
    var slot = isCreatorMobileViewport() ? bgs.mobile : bgs.desktop;
    if (slot && slot.url) return slot;
    return isCreatorMobileViewport() ? bgs.desktop : bgs.mobile;
  }

  function readCachedThemeBg() {
    try {
      var raw = sessionStorage.getItem(THEME_BG_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.expires > Date.now() && parsed.data) return parsed.data;
    } catch (_e4) {}
    return null;
  }

  function writeCachedThemeBg(data) {
    try {
      sessionStorage.setItem(THEME_BG_CACHE_KEY, JSON.stringify({ expires: Date.now() + 120000, data: data }));
    } catch (_e5) {}
  }

  function applyThemeMediaToLayer(layer, bg) {
    if (!layer || !bg || !bg.url) return;
    var useVideo = bg.media_type === 'video' && !prefersReducedMotion();
    if (useVideo) {
      var existing = layer.querySelector('video.creator-theme-bg-video');
      if (existing && existing.getAttribute('data-boot-src') === bg.url) {
        try { existing.play().catch(function () {}); } catch (_e6) {}
        return;
      }
      layer.innerHTML = '';
      layer.classList.add('creator-theme-bg-layer--video');
      layer.style.backgroundImage = '';
      var video = document.createElement('video');
      video.className = 'creator-theme-bg-video';
      video.setAttribute('data-boot-src', bg.url);
      video.muted = true;
      video.defaultMuted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('autoplay', '');
      video.setAttribute('loop', '');
      video.preload = 'auto';
      if (bg.poster_url) video.poster = bg.poster_url;
      video.src = bg.url;
      layer.appendChild(video);
      var playAttempt = video.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(function () {});
      }
      return;
    }
    layer.innerHTML = '';
    layer.classList.remove('creator-theme-bg-layer--video');
    layer.classList.add('creator-theme-bg-layer--image');
    layer.style.backgroundImage =
      "url('" + String(bg.poster_url || bg.url).replace(/'/g, "\\'") + "')";
  }

  function ensureCreatorBootOverlay() {
    var existing = document.getElementById(BOOT_OVERLAY_ID);
    if (existing) return existing;

    if (!document.getElementById(BOOT_STYLE_ID)) {
      var style = document.createElement('style');
      style.id = BOOT_STYLE_ID;
      style.textContent =
        '#' + BOOT_OVERLAY_ID + '{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:24px;margin:0;background:#030508;pointer-events:auto;}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-switch-boot__bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#030508;background-size:cover;background-position:center;}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-switch-boot__bg::after{content:"";position:absolute;inset:0;background:rgba(3,5,8,.42);}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-switch-boot__bg video{width:100%;height:100%;object-fit:cover;display:block;}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-boot__center{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:28px;width:min(360px,100%);text-align:center;}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-boot__logo{max-width:min(240px,72vw);height:auto;margin:0 auto;display:block;animation:creatorSwitchBootLogo 2.4s ease-in-out infinite;}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-boot__bar-wrap{width:min(280px,78vw);}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-boot__bar{position:relative;height:6px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.06);box-shadow:inset 0 0 12px rgba(0,0,0,.55),0 0 24px rgba(124,92,255,.12);}' +
        '#' + BOOT_OVERLAY_ID + ' .creator-boot__bar-fill{position:absolute;inset:0 auto 0 0;width:38%;border-radius:inherit;background:linear-gradient(90deg,rgba(56,189,248,.15) 0%,#7c3aed 18%,#c026d3 42%,#f97316 68%,#fde68a 100%);box-shadow:0 0 18px rgba(192,38,211,.55),0 0 32px rgba(124,58,237,.35);animation:creatorSwitchBootBar 2.1s ease-in-out infinite;}' +
        '@keyframes creatorSwitchBootLogo{0%,100%{transform:scale(1);opacity:.92}50%{transform:scale(1.04);opacity:1}}' +
        '@keyframes creatorSwitchBootBar{0%{transform:translateX(-105%);width:42%}50%{transform:translateX(85%);width:52%}100%{transform:translateX(260%);width:42%}}' +
        '@media (prefers-reduced-motion:reduce){#' + BOOT_OVERLAY_ID + ' .creator-boot__logo,#' + BOOT_OVERLAY_ID + ' .creator-boot__bar-fill{animation:none}#' + BOOT_OVERLAY_ID + ' .creator-switch-boot__bg video{display:none}}';
      document.head.appendChild(style);
    }

    var overlay = document.createElement('div');
    overlay.id = BOOT_OVERLAY_ID;
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', 'Loading Eazpire Creator');
    overlay.innerHTML =
      '<div class="creator-switch-boot__bg" data-creator-switch-boot-bg="true" aria-hidden="true"></div>' +
      '<div class="creator-boot__center">' +
      '<img class="creator-boot__logo" src="' + CREATOR_BOOT_LOGO + '" alt="" width="320" height="112" decoding="async" fetchpriority="high">' +
      '<div class="creator-boot__bar-wrap" aria-hidden="true"><div class="creator-boot__bar"><div class="creator-boot__bar-fill"></div></div></div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function startCreatorBootOverlayMedia() {
    var overlay = document.getElementById(BOOT_OVERLAY_ID);
    if (!overlay) return;
    var layer = overlay.querySelector('[data-creator-switch-boot-bg]');
    if (!layer) return;

    var cached = readCachedThemeBg();
    if (cached) applyThemeMediaToLayer(layer, pickThemeBg(cached));

    fetch(themeBgApiUrl(), { credentials: 'omit', cache: 'default' })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (!data || !data.ok) return;
        writeCachedThemeBg(data);
        var still = document.getElementById(BOOT_OVERLAY_ID);
        var nextLayer = still && still.querySelector('[data-creator-switch-boot-bg]');
        if (nextLayer) applyThemeMediaToLayer(nextLayer, pickThemeBg(data));
      })
      .catch(function () {});
  }

  function startCreatorBootHandoff(targetUrl) {
    if (window[ACTIVE_KEY]) return true;
    window[ACTIVE_KEY] = true;
    try {
      ensureCreatorBootOverlay();
      startCreatorBootOverlayMedia();
    } catch (_overlayErr) {}
    var finishNavigate = navigateWhenReady(targetUrl, NAV_FALLBACK_TO_CREATOR_MS);
    setTimeout(function () {
      if (window[ACTIVE_KEY]) finishNavigate();
    }, NAV_FALLBACK_TO_CREATOR_MS);
    finishNavigate();
    return true;
  }

  function resolveTargetUrl(targetUrl) {
    if (targetUrl && typeof targetUrl.then === 'function') {
      return targetUrl;
    }
    return Promise.resolve(targetUrl);
  }

  function navigateWhenReady(targetUrl, fallbackMs) {
    var resolved = null;
    var done = false;
    var navigated = false;
    function go(url) {
      if (navigated || !url) return;
      navigated = true;
      if (window.EazStayInWeb && typeof window.EazStayInWeb.replace === 'function') {
        window.EazStayInWeb.replace(url);
        return;
      }
      try {
        window.location.replace(url);
      } catch (_e) {
        window.location.href = url;
      }
    }
    resolveTargetUrl(targetUrl).then(function (url) {
      resolved = url;
      if (done) go(url);
    }).catch(function () {
      if (done) go(targetUrl && typeof targetUrl === 'string' ? targetUrl : '/');
    });
    return function finishNavigate() {
      done = true;
      if (resolved) {
        go(resolved);
        return;
      }
      resolveTargetUrl(targetUrl).then(function (url) {
        go(url);
      }).catch(function () {
        go(targetUrl && typeof targetUrl === 'string' ? targetUrl : '/');
      });
    };
  }

  function startTransition(targetUrl, mode) {
    if (!targetUrl) return false;
    // Shop → Creator: skip dissolve wipe; show Creator boot + theme video immediately.
    if (mode === 'to-creator') {
      return startCreatorBootHandoff(targetUrl);
    }
    if (!transitionAnimEnabled(mode)) {
      resolveTargetUrl(targetUrl).then(function (url) {
        if (window.EazStayInWeb && typeof window.EazStayInWeb.replace === 'function') {
          window.EazStayInWeb.replace(url);
          return;
        }
        try {
          window.location.replace(url);
        } catch (_e) {
          window.location.href = url;
        }
      });
      return true;
    }
    if (window[ACTIVE_KEY]) return true;
    window[ACTIVE_KEY] = true;

    var direction = 'rtl';
    var isLikelyMobile = Math.min(window.innerWidth || 0, window.innerHeight || 0) < 900 ||
      ((navigator.maxTouchPoints || 0) > 0 && (window.innerWidth || 0) < 1200);
    var durationMs = isLikelyMobile ? DURATION_MOBILE_MS : DURATION_DESKTOP_MS;
    var finishNavigate = navigateWhenReady(targetUrl, NAV_FALLBACK_MS);
    var navigated = false;

    function goToTarget() {
      if (navigated) return;
      navigated = true;
      finishNavigate();
    }

    // Always arm a hard navigation fallback (mobile path previously had none).
    setTimeout(function () {
      if (window[ACTIVE_KEY]) {
        goToTarget();
      }
    }, NAV_FALLBACK_MS);

    try {
      if (isLikelyMobile) {
        runDomOverlayTransition(goToTarget, direction, durationMs);
        return true;
      }
      var captureTimeout = 2000;
      withTimeout(captureSnapshotCanvas(), captureTimeout).then(function (snapshotCanvas) {
        runSnapshotOverlayTransition(snapshotCanvas, goToTarget, direction, durationMs);
      }).catch(function () {
        try {
          runDomOverlayTransition(goToTarget, direction, 1300);
        } catch (_e) {
          goToTarget();
        }
      });
    } catch (_err) {
      goToTarget();
    }

    return true;
  }

  window.CreatorSwitchPageTransition = { start: startTransition };

  // Soft-gate Total/TBT: do not preload html2canvas on every page — load on first transition.
})();
