/**
 * Reference Influence Modal
 * Slider 5/20/40/60/80/100. Strength = right-side gradient on the image; crop = frame + darkening outside selection (same canvas).
 * Apply commits the cropped region as File + blob URL for generation.
 */
(function () {
  'use strict';

  var MODAL_ID = 'reference-influence-modal';
  var STEPS = [0.05, 0.2, 0.4, 0.6, 0.8, 1.0];

  var pendingFile = null;
  var pendingCallback = null;
  var currentStepIndex = 4;
  /** @type {string|null} blob: URL we must revoke when replacing preview */
  var previewBlobUrl = null;
  /** @type {null|function()} restore DOM parent after automation-layer reparent */
  var automationLayerRestore = null;

  var HANDLE = 12;
  var MIN_SEL = 40;

  /** @type {null|{ wrap: HTMLElement, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, img: HTMLImageElement, nw: number, nh: number, ox: number, oy: number, dw: number, dh: number, cw: number, ch: number, sel: {x:number,y:number,w:number,h:number}, dpr: number, resizeObs: ResizeObserver, pointerCleanup: function|null }} */
  var cropState = null;

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function getStepLabel(stepValue) {
    var container = document.getElementById('reference-influence-step-texts');
    if (container) {
      var el = container.querySelector('[data-step="' + stepValue + '"]');
      if (el) return el.textContent;
    }
    return '';
  }

  function revokePreviewBlob() {
    if (previewBlobUrl) {
      try {
        URL.revokeObjectURL(previewBlobUrl);
      } catch (e) {}
      previewBlobUrl = null;
    }
  }

  function updateUI() {
    var slider = document.getElementById('reference-influence-slider');
    var stepText = document.getElementById('reference-influence-step-text');
    var thumb = document.getElementById('reference-influence-thumb');
    var thumbPct = document.getElementById('reference-influence-thumb-pct');

    var strength = STEPS[currentStepIndex];
    var pct = Math.round(strength * 100);

    if (slider) slider.value = currentStepIndex;
    if (stepText) stepText.textContent = getStepLabel(pct);
    if (thumbPct) thumbPct.textContent = String(pct);
    if (thumb) thumb.style.left = (currentStepIndex / 5 * 100) + '%';
    if (cropState) drawCropCanvas();
  }

  function teardownInlineCrop() {
    if (!cropState) return;
    try {
      if (cropState.pointerCleanup) cropState.pointerCleanup();
    } catch (eP) {}
    try {
      if (cropState.resizeObs && cropState.wrap) {
        cropState.resizeObs.unobserve(cropState.wrap);
      }
    } catch (e0) {}
    cropState = null;
    var canvas = document.getElementById('reference-influence-crop-canvas');
    var img = document.getElementById('reference-influence-preview');
    if (canvas) canvas.style.display = 'none';
    if (img) {
      img.style.display = 'none';
      img.removeAttribute('src');
    }
  }

  function restoreAutomationLayer() {
    if (automationLayerRestore) {
      try {
        automationLayerRestore();
      } catch (eR) {}
      automationLayerRestore = null;
    }
  }

  function close() {
    var modal = getModal();
    if (modal && modal.close) {
      modal.close();
    }
    restoreAutomationLayer();
    pendingFile = null;
    pendingCallback = null;
    revokePreviewBlob();
    teardownInlineCrop();
  }

  function loadImageForCrop(fileOrUrl) {
    return new Promise(function (resolve, reject) {
      if (fileOrUrl instanceof File) {
        var u = URL.createObjectURL(fileOrUrl);
        var img = new Image();
        img.onload = function () {
          resolve({ img: img, revoke: function () { URL.revokeObjectURL(u); } });
        };
        img.onerror = function () {
          try {
            URL.revokeObjectURL(u);
          } catch (e2) {}
          reject(new Error('load_failed'));
        };
        img.src = u;
        return;
      }
      var urlStr = String(fileOrUrl || '');
      if (!urlStr) {
        reject(new Error('no_url'));
        return;
      }
      fetch(urlStr, { mode: 'cors', credentials: 'omit' })
        .then(function (r) {
          return r.blob();
        })
        .then(function (blob) {
          var u = URL.createObjectURL(blob);
          var img = new Image();
          img.onload = function () {
            resolve({ img: img, revoke: function () { URL.revokeObjectURL(u); } });
          };
          img.onerror = function () {
            try {
              URL.revokeObjectURL(u);
            } catch (e2) {}
            reject(new Error('load_failed'));
          };
          img.src = u;
        })
        .catch(function () {
          var img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function () {
            resolve({ img: img, revoke: function () {} });
          };
          img.onerror = function () {
            reject(new Error('cors_or_load'));
          };
          img.src = urlStr;
        });
    });
  }

  function clampSel(s, ox, oy, dw, dh) {
    var x = Math.max(ox, Math.min(s.x, ox + dw - MIN_SEL));
    var y = Math.max(oy, Math.min(s.y, oy + dh - MIN_SEL));
    var w = Math.max(MIN_SEL, Math.min(s.w, ox + dw - x));
    var h = Math.max(MIN_SEL, Math.min(s.h, oy + dh - y));
    return { x: x, y: y, w: w, h: h };
  }

  function selToNormalized(sel, ox, oy, dw, dh) {
    return {
      u0: (sel.x - ox) / dw,
      v0: (sel.y - oy) / dh,
      u1: (sel.x + sel.w - ox) / dw,
      v1: (sel.y + sel.h - oy) / dh
    };
  }

  function normToSel(n, ox, oy, dw, dh) {
    var x = ox + n.u0 * dw;
    var y = oy + n.v0 * dh;
    var w = (n.u1 - n.u0) * dw;
    var h = (n.v1 - n.v0) * dh;
    return clampSel({ x: x, y: y, w: w, h: h }, ox, oy, dw, dh);
  }

  function drawCropCanvas() {
    if (!cropState) return;
    var ctx = cropState.ctx;
    var cw = cropState.cw;
    var ch = cropState.ch;
    var img = cropState.img;
    var ox = cropState.ox;
    var oy = cropState.oy;
    var dw = cropState.dw;
    var dh = cropState.dh;
    var sel = cropState.sel;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, ox, oy, dw, dh);

    /* Strength hint (same idea as former .reference-influence-dim): gradient from the right over the image only */
    var strength = STEPS[currentStepIndex];
    var pct = Math.round(strength * 100);
    if (pct < 100 && dw > 1 && dh > 1) {
      var wStrip = (dw * (100 - pct)) / 100;
      if (wStrip > 0.5) {
        var xR = ox + dw;
        var xL = ox + dw - wStrip;
        var g = ctx.createLinearGradient(xR, oy + dh * 0.5, xL, oy + dh * 0.5);
        g.addColorStop(0, 'rgba(0,0,0,0.75)');
        g.addColorStop(0.88, 'rgba(0,0,0,0.75)');
        g.addColorStop(1, 'rgba(0,0,0,0.08)');
        ctx.fillStyle = g;
        ctx.fillRect(xL, oy, wStrip, dh);
      }
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, cw, sel.y);
    ctx.fillRect(0, sel.y + sel.h, cw, ch - (sel.y + sel.h));
    ctx.fillRect(0, sel.y, sel.x, sel.h);
    ctx.fillRect(sel.x + sel.w, sel.y, cw - (sel.x + sel.w), sel.h);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * cropState.dpr;
    var inset = cropState.dpr;
    ctx.strokeRect(sel.x + inset, sel.y + inset, Math.max(0, sel.w - 2 * inset), Math.max(0, sel.h - 2 * inset));

    var hsz = (HANDLE / 2) * cropState.dpr;
    var HH = HANDLE * cropState.dpr;
    var pts = [
      [sel.x, sel.y],
      [sel.x + sel.w / 2, sel.y],
      [sel.x + sel.w, sel.y],
      [sel.x + sel.w, sel.y + sel.h / 2],
      [sel.x + sel.w, sel.y + sel.h],
      [sel.x + sel.w / 2, sel.y + sel.h],
      [sel.x, sel.y + sel.h],
      [sel.x, sel.y + sel.h / 2]
    ];
    ctx.fillStyle = '#f59e0b';
    for (var i = 0; i < pts.length; i++) {
      ctx.fillRect(pts[i][0] - hsz, pts[i][1] - hsz, HH, HH);
    }
    ctx.restore();
  }

  function layoutCropFromWrap() {
    if (!cropState) return;
    var wrap = cropState.wrap;
    var img = cropState.img;
    var nw = cropState.nw;
    var nh = cropState.nh;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var rect = wrap.getBoundingClientRect();
    var cssW = Math.max(1, Math.floor(rect.width));
    var cssH = Math.max(1, Math.floor(rect.height));
    var cw = Math.floor(cssW * dpr);
    var ch = Math.floor(cssH * dpr);
    var canvas = cropState.canvas;
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    var scale = Math.min(cw / nw, ch / nh);
    var idw = nw * scale;
    var idh = nh * scale;
    var ox = (cw - idw) / 2;
    var oy = (ch - idh) / 2;

    var prevOx = cropState.ox;
    var prevOy = cropState.oy;
    var prevDw = cropState.dw;
    var prevDh = cropState.dh;

    var norm = null;
    if (prevDw > 0 && prevDh > 0) {
      norm = selToNormalized(cropState.sel, prevOx, prevOy, prevDw, prevDh);
    }

    cropState.cw = cw;
    cropState.ch = ch;
    cropState.dpr = dpr;
    cropState.ox = ox;
    cropState.oy = oy;
    cropState.dw = idw;
    cropState.dh = idh;
    cropState.sel = norm ? normToSel(norm, ox, oy, idw, idh) : clampSel({ x: ox, y: oy, w: idw, h: idh }, ox, oy, idw, idh);

    drawCropCanvas();
  }

  function bindCropPointer(canvas) {
    var drag = null;

    function hitMode(px, py) {
      if (!cropState) return 'none';
      var s = cropState.sel;
      var m = 14 * (cropState.dpr || 1);
      if (Math.abs(px - s.x) < m && Math.abs(py - s.y) < m) return 'nw';
      if (Math.abs(px - (s.x + s.w)) < m && Math.abs(py - s.y) < m) return 'ne';
      if (Math.abs(px - s.x) < m && Math.abs(py - (s.y + s.h)) < m) return 'sw';
      if (Math.abs(px - (s.x + s.w)) < m && Math.abs(py - (s.y + s.h)) < m) return 'se';
      if (Math.abs(py - s.y) < m && px >= s.x && px <= s.x + s.w) return 'n';
      if (Math.abs(py - (s.y + s.h)) < m && px >= s.x && px <= s.x + s.w) return 's';
      if (Math.abs(px - s.x) < m && py >= s.y && py <= s.y + s.h) return 'w';
      if (Math.abs(px - (s.x + s.w)) < m && py >= s.y && py <= s.y + s.h) return 'e';
      if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return 'move';
      return 'none';
    }

    function toLocal(ev) {
      var r = canvas.getBoundingClientRect();
      var cx = (ev.clientX !== undefined ? ev.clientX : ev.touches[0].clientX) - r.left;
      var cy = (ev.clientY !== undefined ? ev.clientY : ev.touches[0].clientY) - r.top;
      var dpr = cropState ? cropState.dpr : 1;
      return { x: cx * dpr, y: cy * dpr };
    }

    function onDown(ev) {
      if (!cropState) return;
      ev.preventDefault();
      var p = toLocal(ev);
      var mode = hitMode(p.x, p.y);
      if (mode === 'none') return;
      drag = { mode: mode, sx: p.x, sy: p.y, orig: { x: cropState.sel.x, y: cropState.sel.y, w: cropState.sel.w, h: cropState.sel.h } };
    }

    function onMove(ev) {
      if (!cropState || !drag) return;
      ev.preventDefault();
      var p = toLocal(ev);
      var dx = p.x - drag.sx;
      var dy = p.y - drag.sy;
      var o = drag.orig;
      var ox = cropState.ox;
      var oy = cropState.oy;
      var dw = cropState.dw;
      var dh = cropState.dh;
      var n = { x: o.x, y: o.y, w: o.w, h: o.h };
      var mode = drag.mode;
      if (mode === 'move') {
        n.x = o.x + dx;
        n.y = o.y + dy;
      } else if (mode === 'e') {
        n.w = o.w + dx;
      } else if (mode === 'w') {
        n.x = o.x + dx;
        n.w = o.w - dx;
      } else if (mode === 's') {
        n.h = o.h + dy;
      } else if (mode === 'n') {
        n.y = o.y + dy;
        n.h = o.h - dy;
      } else if (mode === 'se') {
        n.w = o.w + dx;
        n.h = o.h + dy;
      } else if (mode === 'nw') {
        n.x = o.x + dx;
        n.y = o.y + dy;
        n.w = o.w - dx;
        n.h = o.h - dy;
      } else if (mode === 'ne') {
        n.y = o.y + dy;
        n.w = o.w + dx;
        n.h = o.h - dy;
      } else if (mode === 'sw') {
        n.x = o.x + dx;
        n.w = o.w - dx;
        n.h = o.h + dy;
      }
      cropState.sel = clampSel(n, ox, oy, dw, dh);
      drawCropCanvas();
    }

    function onUp(ev) {
      if (drag) ev.preventDefault();
      drag = null;
    }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    return function pointerCleanup() {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('touchstart', onDown);
      canvas.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }

  function initInlineCrop(loaded) {
    teardownInlineCrop();

    var img = loaded.img;
    var nw = img.naturalWidth || img.width;
    var nh = img.naturalHeight || img.height;
    if (!nw || !nh) {
      loaded.revoke();
      window.alert('Could not read image dimensions.');
      return;
    }

    var wrap = document.getElementById('reference-influence-preview-wrap');
    var canvas = document.getElementById('reference-influence-crop-canvas');
    if (!wrap || !canvas) {
      loaded.revoke();
      window.alert('Preview not available.');
      return;
    }

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      loaded.revoke();
      return;
    }

    cropState = {
      wrap: wrap,
      canvas: canvas,
      ctx: ctx,
      img: img,
      nw: nw,
      nh: nh,
      ox: 0,
      oy: 0,
      dw: 0,
      dh: 0,
      cw: 0,
      ch: 0,
      dpr: 1,
      sel: { x: 0, y: 0, w: 0, h: 0 },
      resizeObs: null,
      pointerCleanup: null
    };

    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'crosshair';

    var previewImg = document.getElementById('reference-influence-preview');
    if (previewImg) previewImg.style.display = 'none';

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!cropState) return;
        layoutCropFromWrap();
        cropState.pointerCleanup = bindCropPointer(canvas);
      });
    });

    var ro = new ResizeObserver(function () {
      if (!cropState) return;
      requestAnimationFrame(function () {
        layoutCropFromWrap();
      });
    });
    ro.observe(wrap);
    cropState.resizeObs = ro;

    try {
      loaded.revoke();
    } catch (eRev) {}
  }

  function exportCroppedFile(done) {
    if (!cropState) {
      done(new Error('no_crop'), null);
      return;
    }
    var img = cropState.img;
    var nw = cropState.nw;
    var nh = cropState.nh;
    var ox = cropState.ox;
    var oy = cropState.oy;
    var dw = cropState.dw;
    var dh = cropState.dh;
    var sel = cropState.sel;

    var sx = (sel.x - ox) * (nw / dw);
    var sy = (sel.y - oy) * (nh / dh);
    var sw = sel.w * (nw / dw);
    var sh = sel.h * (nh / dh);
    sx = Math.max(0, Math.round(sx));
    sy = Math.max(0, Math.round(sy));
    sw = Math.min(Math.round(sw), nw - sx);
    sh = Math.min(Math.round(sh), nh - sy);
    if (sw < 2 || sh < 2) {
      done(new Error('small'), null);
      return;
    }

    var out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    try {
      out.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    } catch (e1) {
      done(e1, null);
      return;
    }

    out.toBlob(
      function (blob) {
        if (!blob) {
          done(new Error('blob'), null);
          return;
        }
        var file = new File([blob], 'reference-crop.png', { type: 'image/png' });
        done(null, file);
      },
      'image/png',
      0.95
    );
  }

  function open(options) {
    var modal = getModal();
    if (!modal) return;

    revokePreviewBlob();
    teardownInlineCrop();
    pendingFile = options.file || null;
    pendingCallback = options.onApply || null;
    currentStepIndex = typeof options.initialStep === 'number' ? Math.max(0, Math.min(5, options.initialStep)) : 4;

    var source = pendingFile || options.imageUrl || null;
    if (!source) {
      window.alert('No image.');
      return;
    }

    updateUI();
    automationLayerRestore = null;
    if (typeof window.eazReparentIntoCreatorAutomationLayer === 'function') {
      automationLayerRestore = window.eazReparentIntoCreatorAutomationLayer(modal);
    }
    modal.showModal();

    loadImageForCrop(source)
      .then(function (loaded) {
        initInlineCrop(loaded);
      })
      .catch(function () {
        window.alert('Could not load image. If it is from another site, download it and upload from your device.');
        close();
      });
  }

  function handleApply() {
    exportCroppedFile(function (err, file) {
      if (err || !file) {
        window.alert('Could not apply crop. Try another image.');
        return;
      }
      revokePreviewBlob();
      var nu = URL.createObjectURL(file);
      var strength = STEPS[currentStepIndex];
      var cb = pendingCallback;
      pendingCallback = null;
      pendingFile = null;
      previewBlobUrl = null;
      teardownInlineCrop();
      var modal = getModal();
      if (modal && modal.close) modal.close();
      restoreAutomationLayer();
      if (cb) {
        cb({ strength: strength, file: file, imageUrl: nu });
      }
    });
  }

  function handleCancel() {
    if (pendingCallback) {
      pendingCallback(null);
    }
    close();
  }

  function bind() {
    var modal = getModal();
    if (!modal) return;

    document.getElementById('reference-influence-modal-close')?.addEventListener('click', handleCancel);
    document.getElementById('reference-influence-cancel')?.addEventListener('click', handleCancel);
    document.getElementById('reference-influence-apply')?.addEventListener('click', handleApply);

    modal.addEventListener('click', function (e) {
      if (e.target === modal) handleCancel();
    });
    modal.addEventListener('cancel', handleCancel);

    var slider = document.getElementById('reference-influence-slider');
    if (slider) {
      slider.addEventListener('input', function () {
        currentStepIndex = parseInt(slider.value, 10);
        updateUI();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.ReferenceInfluenceModal = {
    open: open,
    close: close
  };
})();
