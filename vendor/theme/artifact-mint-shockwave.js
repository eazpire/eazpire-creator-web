/**
 * Artifact mint Shockwave Forge — product preview morphs into artifact artwork.
 * Modes: ambient (waiting/generating loop) | reveal (one-shot morph).
 */
(function (root) {
  "use strict";

  var SHOCKWAVE_CFG = {
    dissolve: [0.08, 0.22],
    morph: [0.28, 0.38],
    reveal: [0.64, 0.24],
    hold: [0.86, 0.1],
    fieldMul: 1.25,
    glowMul: 1.35,
    shockwaves: [0.36, 0.54],
    revealFlash: 0.45,
  };

  var AMBIENT_CYCLE_MS = 4200;

  function clamp(v, a, b) {
    if (a === void 0) a = 0;
    if (b === void 0) b = 1;
    return Math.max(a, Math.min(b, v));
  }

  function smooth(t) {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - clamp(t), 3);
  }

  function rnd(i, s) {
    var x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function apiBase() {
    return root.CREATOR_API_BASE || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  }

  function shopDomain() {
    return root.CREATOR_SHOP_DOMAIN || "eazpire.myshopify.com";
  }

  function resolveImageLoadUrl(url) {
    if (!url) return url;
    try {
      var parsed = new URL(url, root.location ? root.location.origin : "https://www.eazpire.com");
      if (root.location && parsed.origin === root.location.origin) return url;
    } catch (e) {}
    return (
      apiBase() +
      "?op=artifacts-mint-image-proxy&shop=" +
      encodeURIComponent(shopDomain()) +
      "&url=" +
      encodeURIComponent(url)
    );
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var src = resolveImageLoadUrl(url);
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("image_load_failed"));
      };
      img.src = src;
    });
  }

  function fitRect(img, W, H, scale) {
    if (scale === void 0) scale = 0.76;
    var iw = img.width;
    var ih = img.height;
    var r = Math.min((W * scale) / iw, (H * scale) / ih);
    var w = iw * r;
    var h = ih * r;
    return { x: (W - w) / 2, y: (H - h) / 2, w: w, h: h };
  }

  function imageDataFor(img, rect, W, H) {
    var off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    var ox = off.getContext("2d", { willReadFrequently: true });
    ox.clearRect(0, 0, W, H);
    ox.drawImage(img, rect.x, rect.y, rect.w, rect.h);
    return ox.getImageData(0, 0, W, H).data;
  }

  function samplePixels(data, W, H, step) {
    var pts = [];
    for (var y = 0; y < H; y += step) {
      for (var x = 0; x < W; x += step) {
        var i = ((y | 0) * W + (x | 0)) * 4;
        var a = data[i + 3];
        if (a > 30) {
          pts.push({ x: x, y: y, r: data[i], g: data[i + 1], b: data[i + 2], a: a });
        }
      }
    }
    return pts;
  }

  function nearestByIndex(arr, i) {
    return arr[i % arr.length];
  }

  function buildParticles(startImg, endImg, W, H, count) {
    var step = Math.max(3, Math.round(W / 185));
    var d1 = imageDataFor(startImg, fitRect(startImg, W, H), W, H);
    var d2 = imageDataFor(endImg, fitRect(endImg, W, H), W, H);
    var a = samplePixels(d1, W, H, step);
    var b = samplePixels(d2, W, H, step);
    var n = Math.min(count, Math.max(a.length, b.length));
    var particles = [];
    var cx = W / 2;
    var cy = H * 0.47;

    for (var i = 0; i < n; i++) {
      var p1 = nearestByIndex(a, Math.floor(rnd(i, 1) * a.length));
      var p2 = nearestByIndex(b, Math.floor(rnd(i, 2) * b.length));
      var dx = p2.x - cx;
      var dy = p2.y - cy;
      particles.push({
        sx: p1.x,
        sy: p1.y,
        ex: p2.x,
        ey: p2.y,
        r1: p1.r,
        g1: p1.g,
        b1: p1.b,
        r2: p2.r,
        g2: p2.g,
        b2: p2.b,
        phase: rnd(i, 5) * Math.PI * 2,
        amp: 1.5 + rnd(i, 6) * 4.5,
        size: 1.2 + rnd(i, 7) * 1.8,
        delay: rnd(i, 8) * 0.18,
      });
    }
    return particles;
  }

  function drawGlow(ctx, W, H, intensity) {
    if (intensity === void 0) intensity = 1;
    var glow = ctx.createRadialGradient(W / 2, H * 0.47, 0, W / 2, H * 0.47, W * 0.48);
    glow.addColorStop(0, "rgba(255,80,35," + 0.18 * intensity + ")");
    glow.addColorStop(0.55, "rgba(255,80,35," + 0.06 * intensity + ")");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  function drawFitted(ctx, img, W, H, alpha, scale) {
    if (!img || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    var r = fitRect(img, W, H, scale === void 0 ? 0.76 : scale);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  function lerpColor(p, m) {
    return {
      r: p.r1 + (p.r2 - p.r1) * m,
      g: p.g1 + (p.g2 - p.g1) * m,
      b: p.b1 + (p.b2 - p.b1) * m,
    };
  }

  function phaseAt(t, start, dur) {
    return smooth((t - start) / dur);
  }

  function shockwavePush(px, py, cx, cy, waveR, strength) {
    var dx = px - cx;
    var dy = py - cy;
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var band = Math.exp(-Math.pow((dist - waveR) / 42, 2));
    return {
      x: px + (dx / dist) * band * strength,
      y: py + (dy / dist) * band * strength,
    };
  }

  function drawShockwaves(ctx, W, H, t, times, morph) {
    if (!times || !times.length) return;
    var cx = W / 2;
    var cy = H * 0.47;
    ctx.save();
    for (var w = 0; w < times.length; w++) {
      var local = clamp((t - times[w]) / 0.14);
      if (local <= 0 || local >= 1) continue;
      var radius = local * W * 0.55;
      var alpha = (1 - local) * (0.22 + morph * 0.18);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,120,50," + alpha + ")";
      ctx.lineWidth = 3 + morph * 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  function phaseLabel(t, cfg) {
    var d = cfg.dissolve;
    var m = cfg.morph;
    var r = cfg.reveal;
    var h = cfg.hold;
    if (t < d[0]) return "mock";
    if (t < m[0]) return "dissolving";
    if (t < r[0]) return "morphing";
    if (t < h[0]) return "forging";
    return "ready";
  }

  function drawRevealFrame(ctx, state, t, cfg) {
    var W = state.W;
    var H = state.H;
    var dpr = state.dpr;
    var particles = state.particles;
    var startImg = state.startImg;
    var endImg = state.endImg;
    var cx = W / 2;
    var cy = H * 0.47;

    var dissolve = phaseAt(t, cfg.dissolve[0], cfg.dissolve[1]);
    var morph = phaseAt(t, cfg.morph[0], cfg.morph[1]);
    var reveal = phaseAt(t, cfg.reveal[0], cfg.reveal[1]);
    var holdEnd = phaseAt(t, cfg.hold[0], cfg.hold[1]);

    drawGlow(ctx, W, H, cfg.glowMul + morph * 0.25);
    drawFitted(ctx, startImg, W, H, 1 - dissolve);
    drawShockwaves(ctx, W, H, t, cfg.shockwaves, morph);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var pm = easeOut(clamp((morph - p.delay) / (1 - p.delay)));
      var field =
        clamp((t - cfg.dissolve[0]) / (cfg.reveal[0] + cfg.reveal[1] - cfg.dissolve[0])) *
        (1 - reveal * 0.65) *
        cfg.fieldMul;
      var x = (1 - pm) * p.sx + pm * p.ex;
      var y = (1 - pm) * p.sy + pm * p.ey;
      x += Math.sin(t * 22 + p.phase) * p.amp * field;
      y += Math.cos(t * 18 + p.phase * 0.9) * p.amp * field;

      if (cfg.shockwaves) {
        for (var sw = 0; sw < cfg.shockwaves.length; sw++) {
          var waveT = clamp((t - cfg.shockwaves[sw]) / 0.16);
          var pushed = shockwavePush(x, y, cx, cy, waveT * W * 0.52, 28 * (1 - waveT));
          x = pushed.x;
          y = pushed.y;
        }
      }

      var c = lerpColor(p, pm);
      var a = (0.16 + dissolve * 0.82) * (1 - holdEnd * 0.95);
      if (a <= 0.01) continue;
      var s = p.size * dpr * (1 + 0.45 * Math.sin(t * 35 + p.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgb(" + (c.r | 0) + "," + (c.g | 0) + "," + (c.b | 0) + ")";
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();

    if (cfg.revealFlash) {
      var flash =
        smooth((t - cfg.reveal[0] - cfg.reveal[1] * 0.55) / 0.05) *
        (1 - smooth((t - cfg.reveal[0] - cfg.reveal[1] * 0.72) / 0.06));
      if (flash > 0) {
        ctx.save();
        ctx.globalAlpha = flash * cfg.revealFlash * 0.35;
        ctx.fillStyle = "#ff6b35";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }

    drawFitted(ctx, endImg, W, H, reveal);
    return phaseLabel(t, cfg);
  }

  function paintHoldFrame(ctx, state) {
    if (!state || !state.W || !state.H) return;
    drawGlow(ctx, state.W, state.H, 1.1);
    if (state.endImg) {
      drawFitted(ctx, state.endImg, state.W, state.H, 1);
    } else if (state.startImg) {
      drawFitted(ctx, state.startImg, state.W, state.H, 1);
    }
  }

  function drawAmbientFrame(ctx, state, t, intensity) {
    var W = state.W;
    var H = state.H;
    var dpr = state.dpr;
    var particles = state.particles;
    var startImg = state.startImg;
    var pulse = 0.85 + 0.15 * Math.sin(t * Math.PI * 2 * 1.4);

    drawGlow(ctx, W, H, 0.75 + intensity * 0.35 * pulse);
    drawFitted(ctx, startImg, W, H, 0.92 + 0.08 * pulse);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var field = (0.35 + intensity * 0.45) * pulse;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var x = p.sx + Math.sin(t * 18 + p.phase) * p.amp * field;
      var y = p.sy + Math.cos(t * 14 + p.phase * 0.9) * p.amp * field;
      var a = (0.08 + intensity * 0.14) * pulse;
      if (a <= 0.01) continue;
      var s = p.size * dpr * 0.85;
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgb(" + p.r1 + "," + p.g1 + "," + p.b1 + ")";
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
    return intensity > 0.55 ? "generating" : "waiting";
  }

  function particleCountForOpts(opts) {
    var base = opts.compact ? 6200 : 8800;
    if (root.matchMedia && root.matchMedia("(max-width: 480px)").matches) {
      base = Math.round(base * 0.78);
    }
    return base;
  }

  function run(canvas, startImageUrl, endImageUrl, opts) {
    opts = opts || {};
    var mode = opts.mode || "ambient";
    var duration = opts.duration || (opts.compact ? 10000 : 15000);
    var intensity = opts.intensity === void 0 ? 0.4 : opts.intensity;
    var onProgress = opts.onProgress || function () {};
    var onPhaseChange = opts.onPhaseChange || function () {};
    var onComplete = opts.onComplete || function () {};

    var ctx = canvas.getContext("2d", { alpha: true });
    var running = false;
    var raf = 0;
    var startTime = 0;
    var lastPhase = "";
    var state = {
      W: 0,
      H: 0,
      dpr: 1,
      startImg: null,
      endImg: null,
      particles: [],
    };

    function resize() {
      var wrap = canvas.parentElement;
      var boxW = wrap ? wrap.clientWidth : 280;
      var boxH = wrap ? wrap.clientHeight : 280;
      state.dpr = Math.min(root.devicePixelRatio || 1, 1.35);
      state.W = Math.max(1, Math.floor(boxW * state.dpr));
      state.H = Math.max(1, Math.floor(boxH * state.dpr));
      canvas.width = state.W;
      canvas.height = state.H;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      rebuildParticles();
    }

    function rebuildParticles() {
      if (!state.startImg || !state.endImg || !state.W) return;
      state.particles = buildParticles(
        state.startImg,
        state.endImg,
        state.W,
        state.H,
        particleCountForOpts(opts)
      );
    }

    function emitPhase(phase) {
      if (phase !== lastPhase) {
        lastPhase = phase;
        onPhaseChange(phase);
      }
    }

    function frame(now) {
      if (!running) return;
      var elapsed = now - startTime;
      var t = mode === "reveal" ? clamp(elapsed / duration) : (elapsed % AMBIENT_CYCLE_MS) / AMBIENT_CYCLE_MS;

      ctx.clearRect(0, 0, state.W, state.H);

      var phase;
      if (mode === "reveal") {
        phase = drawRevealFrame(ctx, state, t, SHOCKWAVE_CFG);
        onProgress(t * 100);
        emitPhase(phase);
        if (t >= 1) {
          running = false;
          paintHoldFrame(ctx, state);
          onProgress(100);
          emitPhase("ready");
          onComplete();
          return;
        }
      } else {
        phase = drawAmbientFrame(ctx, state, t, intensity);
        var waitProgress = Math.min(85, 8 + (elapsed / 1200) * (12 + intensity * 40));
        onProgress(waitProgress);
        emitPhase(phase);
      }

      raf = root.requestAnimationFrame(frame);
    }

    function startAnim() {
      if (!state.startImg || !state.endImg) return;
      running = true;
      startTime = performance.now();
      lastPhase = "";
      if (raf) root.cancelAnimationFrame(raf);
      raf = root.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) root.cancelAnimationFrame(raf);
      raf = 0;
    }

    function holdFinal() {
      if (!state.startImg || !state.W) return;
      stop();
      paintHoldFrame(ctx, state);
    }

    var loadPromise = Promise.all([
      loadImage(startImageUrl),
      loadImage(endImageUrl || startImageUrl),
    ]).then(function (imgs) {
      state.startImg = imgs[0];
      state.endImg = imgs[1];
      resize();
      startAnim();
    }).catch(function () {
      if (state.startImg && state.W) {
        paintHoldFrame(ctx, state);
      }
    });

    return {
      stop: stop,
      holdFinal: holdFinal,
      resize: resize,
      setMode: function (nextMode, nextOpts) {
        mode = nextMode || mode;
        if (nextOpts && nextOpts.intensity !== void 0) intensity = nextOpts.intensity;
        if (nextOpts && nextOpts.duration) duration = nextOpts.duration;
        startTime = performance.now();
        lastPhase = "";
      },
      setEndImageUrl: function (url) {
        return loadImage(url).then(function (img) {
          state.endImg = img;
          rebuildParticles();
          mode = "reveal";
          startTime = performance.now();
          lastPhase = "";
        });
      },
      ready: loadPromise,
    };
  }

  root.ArtifactMintShockwave = { run: run, resolveImageLoadUrl: resolveImageLoadUrl };
})(window);
