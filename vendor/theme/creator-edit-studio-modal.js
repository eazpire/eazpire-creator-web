/**
 * Creator Edit Studio — fullscreen pipette + color eraser.
 * Local undo/redo/chronik (max 20). Save commits a new Edit History version.
 */
(function () {
  'use strict';

  var MAX_HISTORY = 20;
  var ZOOM_STEP = 0.25;
  var ZOOM_MIN = 1;
  var ZOOM_MAX = 4;
  var BG_DEFAULT = '#37375A';
  var BG_STORAGE_KEY = 'eaz_ces_viewer_bg';
  var DIST_MAX = Math.sqrt(3 * 255 * 255);

  var root = null;
  var canvas = null;
  var ctx = null;
  var viewer = null;
  var stage = null;
  var busyEl = null;

  var currentDesign = null;
  var isOpen = false;
  var dirty = false;
  var busy = false;
  var activeTool = 'pipette'; // pipette | eraser
  var pickedColor = null; // { r, g, b }
  var intensity = 30;
  var eraserSize = 28;
  var subheaderCollapsed = false;

  var history = []; // [{ blobUrl, label }]
  var historyIndex = -1;

  var zoom = { scale: 1, x: 0, y: 0, panMode: false };
  var panDrag = null;
  var eraseStroke = null;
  var viewerBg = BG_DEFAULT;

  function t(key, fallback) {
    try {
      var i18n = window.CreatorI18n || {};
      var full = 'creator.edit_studio.' + key;
      if (i18n[full]) return String(i18n[full]);
      if (i18n[key]) return String(i18n[key]);
    } catch (_) {}
    return fallback;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function resolveOwnerId(design) {
    if (design && design.owner_id) return String(design.owner_id);
    try {
      var sp = new URLSearchParams(window.location.search);
      var fromUrl = sp.get('logged_in_customer_id') || sp.get('owner_id');
      if (fromUrl) return String(fromUrl);
    } catch (_) {}
    try {
      if (window.CreatorWidget && typeof window.CreatorWidget.getOwnerId === 'function') {
        var w = window.CreatorWidget.getOwnerId();
        if (w) return String(w);
      }
    } catch (_) {}
    try {
      if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId);
    } catch (_) {}
    return null;
  }

  function resolveDispatchBase() {
    try {
      if (window.CreatorPortalThemeBridge && typeof window.CreatorPortalThemeBridge.dispatchBase === 'function') {
        var b = window.CreatorPortalThemeBridge.dispatchBase();
        if (b) return b;
      }
    } catch (_) {}
    try {
      if (window.__CREATOR_DISPATCH_BASE) return String(window.__CREATOR_DISPATCH_BASE);
    } catch (_) {}
    var origin = (window.location && window.location.origin) || '';
    return origin + '/apps/creator-dispatch';
  }

  function primaryImageUrl(design) {
    if (!design) return '';
    return (
      design.original_url ||
      design.image_url ||
      design.preview_url ||
      design.url ||
      ''
    );
  }

  function cacheBust(url) {
    if (!url) return url;
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + '_ces=' + Date.now();
  }

  function revokeHistoryUrls(fromIndex) {
    for (var i = fromIndex; i < history.length; i++) {
      if (history[i] && history[i].blobUrl) {
        try { URL.revokeObjectURL(history[i].blobUrl); } catch (_) {}
      }
    }
  }

  function clearHistory() {
    revokeHistoryUrls(0);
    history = [];
    historyIndex = -1;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    var undoBtn = $('ces-btn-undo');
    var redoBtn = $('ces-btn-redo');
    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
  }

  function canvasToBlob() {
    return new Promise(function (resolve, reject) {
      if (!canvas) return reject(new Error('no canvas'));
      canvas.toBlob(function (blob) {
        if (!blob) reject(new Error('toBlob failed'));
        else resolve(blob);
      }, 'image/png');
    });
  }

  async function pushHistory(label) {
    try {
      var blob = await canvasToBlob();
      var blobUrl = URL.createObjectURL(blob);
      // Drop redo branch
      if (historyIndex < history.length - 1) {
        revokeHistoryUrls(historyIndex + 1);
        history = history.slice(0, historyIndex + 1);
      }
      history.push({ blobUrl: blobUrl, label: label || t('change', 'Change') });
      // Cap to MAX_HISTORY (keep newest)
      while (history.length > MAX_HISTORY) {
        var dropped = history.shift();
        if (dropped && dropped.blobUrl) {
          try { URL.revokeObjectURL(dropped.blobUrl); } catch (_) {}
        }
      }
      historyIndex = history.length - 1;
      updateHistoryButtons();
    } catch (err) {
      console.warn('[EditStudio] pushHistory failed', err);
    }
  }

  function drawBlobUrl(blobUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        if (!canvas || !ctx) return reject(new Error('no canvas'));
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = function () { reject(new Error('history image load failed')); };
      img.src = blobUrl;
    });
  }

  async function goToHistory(index) {
    if (index < 0 || index >= history.length) return;
    historyIndex = index;
    await drawBlobUrl(history[index].blobUrl);
    updateHistoryButtons();
    dirty = historyIndex > 0;
  }

  async function undo() {
    if (historyIndex <= 0) return;
    await goToHistory(historyIndex - 1);
  }

  async function redo() {
    if (historyIndex >= history.length - 1) return;
    await goToHistory(historyIndex + 1);
  }

  function colorDistance(r1, g1, b1, r2, g2, b2) {
    var dr = r1 - r2;
    var dg = g1 - g2;
    var db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function thresholdFromIntensity() {
    return (Math.max(0, Math.min(100, Number(intensity) || 0)) / 100) * DIST_MAX;
  }

  function setPickedColor(rgb) {
    pickedColor = rgb ? { r: rgb.r, g: rgb.g, b: rgb.b } : null;
    var sw = $('ces-color-swatch');
    if (!sw) return;
    if (pickedColor) {
      sw.classList.add('has-color');
      sw.style.background = 'rgb(' + pickedColor.r + ',' + pickedColor.g + ',' + pickedColor.b + ')';
    } else {
      sw.classList.remove('has-color');
      sw.style.background = '';
    }
  }

  function setActiveTool(tool) {
    activeTool = tool === 'eraser' ? 'eraser' : 'pipette';
    var pipetteBtn = $('ces-tool-pipette');
    var eraserBtn = $('ces-tool-eraser');
    var pipetteOpts = $('ces-pipette-options');
    var eraserOpts = $('ces-eraser-options');
    if (pipetteBtn) {
      pipetteBtn.classList.toggle('is-active', activeTool === 'pipette');
      pipetteBtn.setAttribute('aria-selected', activeTool === 'pipette' ? 'true' : 'false');
    }
    if (eraserBtn) {
      eraserBtn.classList.toggle('is-active', activeTool === 'eraser');
      eraserBtn.setAttribute('aria-selected', activeTool === 'eraser' ? 'true' : 'false');
    }
    if (pipetteOpts) pipetteOpts.hidden = activeTool !== 'pipette' && activeTool !== 'eraser';
    if (eraserOpts) eraserOpts.hidden = activeTool !== 'eraser';
    // Intensity stays visible for both (affects erase)
    if (pipetteOpts) pipetteOpts.hidden = false;
    updateViewerCursor();
  }

  function updateViewerCursor() {
    if (!viewer) return;
    viewer.classList.toggle('is-eyedropper', !zoom.panMode && activeTool === 'pipette');
    viewer.classList.toggle('is-eraser', !zoom.panMode && activeTool === 'eraser');
    viewer.classList.toggle('is-pan-mode', !!zoom.panMode);
  }

  function applyZoomTransform() {
    if (!stage) return;
    stage.style.transform =
      'translate(' + zoom.x + 'px,' + zoom.y + 'px) scale(' + zoom.scale + ')';
  }

  function setZoom(scale) {
    zoom.scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
    if (zoom.scale <= 1.001) {
      zoom.x = 0;
      zoom.y = 0;
    }
    applyZoomTransform();
  }

  function setPanMode(on) {
    zoom.panMode = !!on;
    var btn = $('ces-pan-toggle');
    if (btn) {
      btn.classList.toggle('is-active', zoom.panMode);
      btn.setAttribute('aria-pressed', zoom.panMode ? 'true' : 'false');
    }
    updateViewerCursor();
  }

  function resetZoom() {
    zoom.scale = 1;
    zoom.x = 0;
    zoom.y = 0;
    setPanMode(false);
    applyZoomTransform();
  }

  function normalizeBg(value) {
    if (!value) return BG_DEFAULT;
    var v = String(value).trim();
    if (v === 'checker' || v === 'checkers') return 'checker';
    if (v.charAt(0) !== '#') v = '#' + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(v)) {
      return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toUpperCase();
    }
    return BG_DEFAULT;
  }

  function applyViewerBg() {
    if (!viewer) return;
    var isChecker = viewerBg === 'checker';
    viewer.classList.toggle('is-checker-bg', isChecker);
    viewer.style.backgroundColor = isChecker ? '' : viewerBg;
    var sw = $('ces-bg-swatch');
    if (sw) {
      sw.classList.toggle('is-checker', isChecker);
      sw.style.background = isChecker ? '' : viewerBg;
    }
    var presets = $('ces-bg-presets');
    if (presets) {
      presets.querySelectorAll('[data-ces-bg]').forEach(function (btn) {
        btn.classList.toggle('is-selected', normalizeBg(btn.getAttribute('data-ces-bg')) === viewerBg);
      });
    }
    var picker = $('ces-bg-picker');
    if (picker && !isChecker) picker.value = viewerBg;
  }

  function setViewerBg(value) {
    viewerBg = normalizeBg(value);
    try { localStorage.setItem(BG_STORAGE_KEY, viewerBg); } catch (_) {}
    applyViewerBg();
  }

  function loadViewerBg() {
    try {
      var stored = localStorage.getItem(BG_STORAGE_KEY);
      if (stored) viewerBg = normalizeBg(stored);
    } catch (_) {}
    applyViewerBg();
  }

  function clientToCanvasPixel(clientX, clientY) {
    if (!canvas) return null;
    var rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    var x = ((clientX - rect.left) / rect.width) * canvas.width;
    var y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x: x, y: y };
  }

  function sampleColorAt(clientX, clientY) {
    var pt = clientToCanvasPixel(clientX, clientY);
    if (!pt || !ctx) return null;
    var sx = Math.floor(pt.x);
    var sy = Math.floor(pt.y);
    if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) return null;
    var data = ctx.getImageData(sx, sy, 1, 1).data;
    if (data[3] < 8) return null;
    return { r: data[0], g: data[1], b: data[2] };
  }

  function eraseAtPoint(cx, cy, radius) {
    if (!pickedColor || !ctx || !canvas) return false;
    var threshold = thresholdFromIntensity();
    var x0 = Math.max(0, Math.floor(cx - radius));
    var y0 = Math.max(0, Math.floor(cy - radius));
    var x1 = Math.min(canvas.width - 1, Math.ceil(cx + radius));
    var y1 = Math.min(canvas.height - 1, Math.ceil(cy + radius));
    var w = x1 - x0 + 1;
    var h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return false;
    var img = ctx.getImageData(x0, y0, w, h);
    var data = img.data;
    var r2 = radius * radius;
    var pr = pickedColor.r;
    var pg = pickedColor.g;
    var pb = pickedColor.b;
    var changed = false;
    for (var row = 0; row < h; row++) {
      for (var col = 0; col < w; col++) {
        var dx = x0 + col + 0.5 - cx;
        var dy = y0 + row + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        var i = (row * w + col) * 4;
        if (data[i + 3] < 8) continue;
        if (colorDistance(data[i], data[i + 1], data[i + 2], pr, pg, pb) <= threshold) {
          data[i + 3] = 0;
          changed = true;
        }
      }
    }
    if (changed) ctx.putImageData(img, x0, y0);
    return changed;
  }

  function eraseAlongStroke(x0, y0, x1, y1, radius) {
    var dist = Math.hypot(x1 - x0, y1 - y0);
    var step = Math.max(1, radius * 0.35);
    var n = Math.max(1, Math.ceil(dist / step));
    var any = false;
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      if (eraseAtPoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius)) any = true;
    }
    return any;
  }

  async function loadDesignOntoCanvas(design) {
    var url = primaryImageUrl(design);
    if (!url) throw new Error(t('no_image', 'No design image available.'));
    var img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise(function (resolve, reject) {
      img.onload = resolve;
      img.onerror = function () { reject(new Error(t('image_load_failed', 'Could not load design image.'))); };
      img.src = cacheBust(url);
    });
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    clearHistory();
    await pushHistory(t('original', 'Original'));
    dirty = false;
  }

  function setBusy(on) {
    busy = !!on;
    if (busyEl) {
      if (busy) {
        busyEl.removeAttribute('hidden');
      } else {
        busyEl.setAttribute('hidden', '');
      }
    }
    var saveBtn = $('ces-btn-save');
    var discardBtn = $('ces-btn-discard');
    if (saveBtn) saveBtn.disabled = busy;
    if (discardBtn) discardBtn.disabled = busy;
  }

  function openChronik() {
    var overlay = $('ces-chronik-overlay');
    var grid = $('ces-chronik-grid');
    var empty = $('ces-chronik-empty');
    if (!overlay || !grid) return;
    grid.innerHTML = '';
    if (!history.length) {
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;
      history.forEach(function (entry, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ces-chronik-item' + (idx === historyIndex ? ' is-current' : '');
        btn.innerHTML =
          '<img class="ces-chronik-thumb" alt="" src="' + entry.blobUrl + '">' +
          '<span class="ces-chronik-label">' +
          (entry.label || (t('step', 'Step') + ' ' + (idx + 1))) +
          '</span>';
        btn.addEventListener('click', function () {
          goToHistory(idx);
          closeChronik();
        });
        grid.appendChild(btn);
      });
    }
    overlay.removeAttribute('hidden');
  }

  function closeChronik() {
    var overlay = $('ces-chronik-overlay');
    if (overlay) overlay.setAttribute('hidden', '');
  }

  function openBgModal() {
    var overlay = $('ces-bg-overlay');
    if (overlay) {
      applyViewerBg();
      overlay.removeAttribute('hidden');
    }
  }

  function closeBgModal() {
    var overlay = $('ces-bg-overlay');
    if (overlay) overlay.setAttribute('hidden', '');
  }

  function setSubheaderCollapsed(collapsed) {
    subheaderCollapsed = !!collapsed;
    var sub = $('ces-subheader');
    var toggle = $('ces-subheader-toggle');
    if (sub) sub.classList.toggle('is-collapsed', subheaderCollapsed);
    if (toggle) toggle.setAttribute('aria-expanded', subheaderCollapsed ? 'false' : 'true');
  }

  async function saveStudio() {
    if (!currentDesign || !currentDesign.id) {
      alert(t('no_design', 'No design selected.'));
      return;
    }
    if (!dirty && historyIndex <= 0) {
      alert(t('no_changes', 'No changes to save.'));
      return;
    }
    var ok = window.confirm(
      t('confirm_save', 'Save your Edit Studio changes? This creates a new version and replaces the current design.')
    );
    if (!ok) return;

    var ownerId = resolveOwnerId(currentDesign);
    if (!ownerId) {
      alert(window.CreatorI18n?.noUserId || t('no_user', 'Error: No user ID found. Please sign in.'));
      return;
    }

    setBusy(true);
    try {
      var blob = await canvasToBlob();
      var fd = new FormData();
      fd.set('design_id', String(currentDesign.id));
      fd.set('owner_id', String(ownerId));
      fd.set('logged_in_customer_id', String(ownerId));
      fd.set('image', blob, 'edit-studio.png');

      var apiBase = resolveDispatchBase();
      var url = new URL(apiBase);
      url.searchParams.set('op', 'design-edit-studio-save');
      url.searchParams.set('path_prefix', '/apps/creator-dispatch');
      url.searchParams.set('logged_in_customer_id', String(ownerId));

      var response = await fetch(url.toString(), {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        body: fd
      });
      var raw = await response.text();
      var data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!data || !data.ok) {
        throw new Error((data && (data.message || data.error)) || t('save_failed', 'Save failed.'));
      }

      if (data.design && window.CreatorDesignPreviewModal) {
        try {
          if (typeof window.CreatorDesignPreviewModal.applyDesignFromEdit === 'function') {
            window.CreatorDesignPreviewModal.applyDesignFromEdit(data.design);
          } else if (typeof window.CreatorDesignPreviewModal.open === 'function') {
            // Fallback: reopen with updated design payload if helper missing
            var merged = Object.assign({}, currentDesign, data.design);
            window.CreatorDesignPreviewModal.open(merged);
          }
        } catch (e) {
          console.warn('[EditStudio] preview refresh failed', e);
        }
      }

      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}

      dirty = false;
      closeStudio({ force: true });
    } catch (err) {
      console.error('[EditStudio] save failed', err);
      alert((err && err.message) || t('save_failed', 'Save failed.'));
    } finally {
      setBusy(false);
    }
  }

  function discardStudio() {
    if (busy) return;
    if (dirty) {
      var ok = window.confirm(
        t('confirm_discard', 'Discard Edit Studio changes? Your local edits will be lost.')
      );
      if (!ok) return;
    }
    closeStudio({ force: true });
  }

  function closeStudio(opts) {
    opts = opts || {};
    if (!opts.force && dirty) {
      discardStudio();
      return;
    }
    isOpen = false;
    currentDesign = null;
    eraseStroke = null;
    panDrag = null;
    setPickedColor(null);
    clearHistory();
    resetZoom();
    closeChronik();
    closeBgModal();
    if (root) {
      root.setAttribute('hidden', '');
      root.setAttribute('aria-hidden', 'true');
    }
    try {
      document.documentElement.classList.remove('ces-studio-open');
    } catch (_) {}
  }

  async function openStudio(design) {
    ensureDom();
    if (!root || !canvas || !ctx) {
      console.error('[EditStudio] DOM missing');
      return;
    }
    if (!design || !design.id) {
      alert(t('no_design', 'No design selected.'));
      return;
    }
    currentDesign = design;
    isOpen = true;
    dirty = false;
    intensity = Number(($('ces-intensity') && $('ces-intensity').value) || 30);
    eraserSize = Number(($('ces-eraser-size') && $('ces-eraser-size').value) || 28);
    setActiveTool('pipette');
    setSubheaderCollapsed(false);
    resetZoom();
    loadViewerBg();
    setBusy(true);
    root.removeAttribute('hidden');
    root.setAttribute('aria-hidden', 'false');
    try {
      document.documentElement.classList.add('ces-studio-open');
    } catch (_) {}
    try {
      await loadDesignOntoCanvas(design);
    } catch (err) {
      console.error('[EditStudio] open failed', err);
      alert((err && err.message) || t('image_load_failed', 'Could not load design image.'));
      closeStudio({ force: true });
      return;
    } finally {
      setBusy(false);
    }
  }

  function onPointerDown(e) {
    if (!isOpen || busy || !viewer) return;
    if (e.target.closest && (
      e.target.closest('.ces-chrome-top-left') ||
      e.target.closest('.ces-chrome-top-right') ||
      e.target.closest('.ces-chrome-bottom-right') ||
      e.target.closest('.ces-overlay')
    )) return;

    if (zoom.panMode) {
      if (zoom.scale <= 1.001) return;
      panDrag = {
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        startX: zoom.x,
        startY: zoom.y
      };
      viewer.classList.add('is-panning');
      try { viewer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      return;
    }

    if (activeTool === 'pipette') {
      var color = sampleColorAt(e.clientX, e.clientY);
      if (color) setPickedColor(color);
      e.preventDefault();
      return;
    }

    if (activeTool === 'eraser') {
      if (!pickedColor) {
        alert(t('pick_color_first', 'Pick a color with the pipette first.'));
        setActiveTool('pipette');
        return;
      }
      var pt = clientToCanvasPixel(e.clientX, e.clientY);
      if (!pt) return;
      eraseStroke = {
        pointerId: e.pointerId,
        lastX: pt.x,
        lastY: pt.y,
        changed: eraseAtPoint(pt.x, pt.y, eraserSize / 2)
      };
      try { viewer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (!isOpen || busy) return;
    if (panDrag && panDrag.pointerId === e.pointerId) {
      zoom.x = panDrag.startX + (e.clientX - panDrag.originX);
      zoom.y = panDrag.startY + (e.clientY - panDrag.originY);
      applyZoomTransform();
      e.preventDefault();
      return;
    }
    if (eraseStroke && eraseStroke.pointerId === e.pointerId) {
      var pt = clientToCanvasPixel(e.clientX, e.clientY);
      if (!pt) return;
      if (eraseAlongStroke(eraseStroke.lastX, eraseStroke.lastY, pt.x, pt.y, eraserSize / 2)) {
        eraseStroke.changed = true;
      }
      eraseStroke.lastX = pt.x;
      eraseStroke.lastY = pt.y;
      e.preventDefault();
    }
  }

  async function onPointerUp(e) {
    if (panDrag && panDrag.pointerId === e.pointerId) {
      panDrag = null;
      if (viewer) viewer.classList.remove('is-panning');
      return;
    }
    if (eraseStroke && eraseStroke.pointerId === e.pointerId) {
      var changed = eraseStroke.changed;
      eraseStroke = null;
      if (changed) {
        dirty = true;
        await pushHistory(t('erase', 'Erase'));
      }
    }
  }

  function bindOnce() {
    if (!root || root.__cesBound) return;
    root.__cesBound = true;

    var toggle = $('ces-subheader-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        setSubheaderCollapsed(!subheaderCollapsed);
      });
    }

    root.querySelectorAll('[data-ces-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setActiveTool(btn.getAttribute('data-ces-tool'));
      });
    });

    var intensityEl = $('ces-intensity');
    if (intensityEl) {
      intensityEl.addEventListener('input', function () {
        intensity = Number(intensityEl.value) || 0;
      });
    }
    var sizeEl = $('ces-eraser-size');
    if (sizeEl) {
      sizeEl.addEventListener('input', function () {
        eraserSize = Number(sizeEl.value) || 28;
      });
    }

    var undoBtn = $('ces-btn-undo');
    var redoBtn = $('ces-btn-redo');
    var chronikBtn = $('ces-btn-chronik');
    if (undoBtn) undoBtn.addEventListener('click', function () { undo(); });
    if (redoBtn) redoBtn.addEventListener('click', function () { redo(); });
    if (chronikBtn) chronikBtn.addEventListener('click', openChronik);
    var chronikClose = $('ces-chronik-close');
    var chronikDone = $('ces-chronik-done');
    if (chronikClose) chronikClose.addEventListener('click', closeChronik);
    if (chronikDone) chronikDone.addEventListener('click', closeChronik);
    var chronikOverlay = $('ces-chronik-overlay');
    if (chronikOverlay) {
      chronikOverlay.addEventListener('click', function (e) {
        if (e.target === chronikOverlay) closeChronik();
      });
    }

    var zoomIn = $('ces-zoom-in');
    var zoomOut = $('ces-zoom-out');
    var panToggle = $('ces-pan-toggle');
    if (zoomIn) zoomIn.addEventListener('click', function () { setZoom(zoom.scale + ZOOM_STEP); });
    if (zoomOut) zoomOut.addEventListener('click', function () { setZoom(zoom.scale - ZOOM_STEP); });
    if (panToggle) {
      panToggle.addEventListener('click', function () {
        if (!zoom.panMode && zoom.scale <= 1.001) setZoom(1 + ZOOM_STEP);
        setPanMode(!zoom.panMode);
      });
    }

    var bgOpen = $('ces-bg-open');
    var bgClose = $('ces-bg-close');
    var bgDone = $('ces-bg-done');
    var bgReset = $('ces-bg-reset');
    var bgPicker = $('ces-bg-picker');
    var bgOverlay = $('ces-bg-overlay');
    if (bgOpen) bgOpen.addEventListener('click', openBgModal);
    if (bgClose) bgClose.addEventListener('click', closeBgModal);
    if (bgDone) bgDone.addEventListener('click', closeBgModal);
    if (bgReset) bgReset.addEventListener('click', function () { setViewerBg(BG_DEFAULT); });
    if (bgPicker) {
      bgPicker.addEventListener('input', function () { setViewerBg(bgPicker.value); });
      bgPicker.addEventListener('change', function () { setViewerBg(bgPicker.value); });
    }
    if (bgOverlay) {
      bgOverlay.addEventListener('click', function (e) {
        if (e.target === bgOverlay) closeBgModal();
      });
    }
    var presets = $('ces-bg-presets');
    if (presets) {
      presets.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-ces-bg]') : null;
        if (!btn) return;
        setViewerBg(btn.getAttribute('data-ces-bg'));
      });
    }

    var saveBtn = $('ces-btn-save');
    var discardBtn = $('ces-btn-discard');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveStudio(); });
    if (discardBtn) discardBtn.addEventListener('click', discardStudio);

    if (viewer) {
      viewer.addEventListener('pointerdown', onPointerDown);
      viewer.addEventListener('pointermove', onPointerMove);
      viewer.addEventListener('pointerup', onPointerUp);
      viewer.addEventListener('pointercancel', onPointerUp);
    }

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        var chronik = $('ces-chronik-overlay');
        var bg = $('ces-bg-overlay');
        if (chronik && !chronik.hasAttribute('hidden')) {
          closeChronik();
          e.preventDefault();
          return;
        }
        if (bg && !bg.hasAttribute('hidden')) {
          closeBgModal();
          e.preventDefault();
          return;
        }
        discardStudio();
        e.preventDefault();
        return;
      }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        redo();
      }
    });
  }

  function ensureEditStudioCss() {
    if (document.querySelector('link[href*="creator-edit-studio-modal.css"]')) return;
    var cssUrl = null;
    try {
      if (window.__CREATOR_EDIT_STUDIO_MODAL_CSS) cssUrl = String(window.__CREATOR_EDIT_STUDIO_MODAL_CSS);
      else if (window.CreatorPortalThemeBridge && typeof window.CreatorPortalThemeBridge.assetUrl === 'function') {
        cssUrl = window.CreatorPortalThemeBridge.assetUrl('creator-edit-studio-modal.css');
      }
    } catch (_) {}
    if (!cssUrl) {
      // Shop theme: derive from this script URL if present
      var scripts = document.querySelectorAll('script[src*="creator-edit-studio-modal.js"]');
      if (scripts.length) {
        cssUrl = String(scripts[scripts.length - 1].src).replace(/creator-edit-studio-modal\.js.*/, 'creator-edit-studio-modal.css');
      }
    }
    if (!cssUrl) cssUrl = '/vendor/theme/creator-edit-studio-modal.css';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  function ensureDom() {
    ensureEditStudioCss();
    root = $('creatorEditStudioModal');
    canvas = $('ces-canvas');
    viewer = $('ces-viewer');
    stage = $('ces-zoom-stage');
    busyEl = $('ces-busy');
    if (canvas && !ctx) {
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    bindOnce();
  }

  window.CreatorEditStudio = {
    open: function (design) {
      return openStudio(design);
    },
    close: function (force) {
      closeStudio({ force: !!force });
    },
    isOpen: function () {
      return !!isOpen;
    }
  };

  function boot() {
    ensureDom();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }
})();
