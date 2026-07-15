/**
 * Creator switch transition (DOM-freeze overlay):
 * - iframe preloading is blocked by storefront headers (X-Frame-Options/CSP frame-ancestors)
 * - html2canvas can fail on modern CSS color() values
 * - use a cloned DOM overlay that visually matches the current page, then dissolve it
 */
(function () {
  'use strict';

  var ACTIVE_KEY = '__creatorSwitchTransitionActive';
  var PARTICLES_CANVAS_ID = 'creator-switch-live-particles-canvas';
  var DOM_OVERLAY_ID = 'creator-switch-live-dom-overlay';
  var DURATION_DESKTOP_MS = 2400;
  var DURATION_MOBILE_MS = 1500;
  /** Shop → Creator: shorter — portal still has its own boot. */
  var DURATION_TO_CREATOR_DESKTOP_MS = 1100;
  var DURATION_TO_CREATOR_MOBILE_MS = 800;
  var NAV_FALLBACK_MS = 5200;
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
    if (mode === 'to-creator') return eazAnim('shop', 'creator_switch_transition');
    if (mode === 'to-shop') return eazAnim('creator', 'switch_page_transition');
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
    resolveTargetUrl(targetUrl).then(function (url) {
      resolved = url;
      if (done) {
        window.location.href = url;
      }
    }).catch(function () {
      if (done) {
        window.location.href = targetUrl && typeof targetUrl === 'string' ? targetUrl : '/';
      }
    });
    return function finishNavigate() {
      done = true;
      if (resolved) {
        window.location.href = resolved;
        return;
      }
      resolveTargetUrl(targetUrl).then(function (url) {
        window.location.href = url;
      }).catch(function () {
        window.location.href = targetUrl && typeof targetUrl === 'string' ? targetUrl : '/';
      });
    };
  }

  function startTransition(targetUrl, mode) {
    if (!targetUrl) return false;
    if (!transitionAnimEnabled(mode)) {
      resolveTargetUrl(targetUrl).then(function (url) {
        window.location.href = url;
      });
      return true;
    }
    if (window[ACTIVE_KEY]) return true;
    window[ACTIVE_KEY] = true;

    var direction = mode === 'to-creator' ? 'ltr' : 'rtl';
    var isLikelyMobile = Math.min(window.innerWidth || 0, window.innerHeight || 0) < 900 ||
      ((navigator.maxTouchPoints || 0) > 0 && (window.innerWidth || 0) < 1200);
    var durationMs = mode === 'to-creator'
      ? (isLikelyMobile ? DURATION_TO_CREATOR_MOBILE_MS : DURATION_TO_CREATOR_DESKTOP_MS)
      : (isLikelyMobile ? DURATION_MOBILE_MS : DURATION_DESKTOP_MS);
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

  setTimeout(function () {
    ensureHtml2CanvasReady().catch(function () {});
  }, 0);
})();
