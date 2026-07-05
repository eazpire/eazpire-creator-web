(function () {
  'use strict';

  var SESSION_KEY = 'eazShopStudioCanvasSession';
  /** Only set when options.sessionKey is passed — each saved slot uses its own key; empty/edit flows omit it (fresh session). */
  var activePersistKey = null;
  var CANVAS_W = 1024;
  var CANVAS_H = 1024;
  var EXPORT_SIZE = 512;

  function modalHost() {
    if (typeof window.eazCreatorAutomationLayerHost === 'function') {
      var autoHost = window.eazCreatorAutomationLayerHost();
      if (autoHost) return autoHost;
    }
    if (typeof window.eazShopStudioModalRoot === 'function') {
      return window.eazShopStudioModalRoot();
    }
    return document.body;
  }

  function isShopStudio() {
    return document.body && document.body.classList.contains('eaz-shop-studio-open');
  }

  function tFlat(flatKey, fb) {
    if (typeof window.getI18n === 'function') {
      try {
        var v = window.getI18n(flatKey, fb);
        if (v && String(v).trim()) return v;
      } catch (e) {}
    }
    var o = window.CreatorI18n && window.CreatorI18n[flatKey];
    return (typeof o === 'string' && o) || fb;
  }

  function cloneTransform(tr) {
    if (!tr) return { tx: 0, ty: 0, scale: 1, rotation: 0 };
    return {
      tx: typeof tr.tx === 'number' ? tr.tx : 0,
      ty: typeof tr.ty === 'number' ? tr.ty : 0,
      scale: typeof tr.scale === 'number' && tr.scale !== 0 ? tr.scale : 1,
      rotation: typeof tr.rotation === 'number' ? tr.rotation : 0
    };
  }

  function cloneStrokes(arr) {
    return arr.map(function (s) {
      var o = {
        points: s.points.map(function (p) {
          return { x: p.x, y: p.y };
        }),
        color: s.color,
        width: s.width
      };
      if (s.transform) o.transform = cloneTransform(s.transform);
      return o;
    });
  }

  function ensureStrokeTransform(stroke) {
    if (!stroke.transform) {
      stroke.transform = { tx: 0, ty: 0, scale: 1, rotation: 0 };
    }
    var t = stroke.transform;
    if (typeof t.tx !== 'number') t.tx = 0;
    if (typeof t.ty !== 'number') t.ty = 0;
    if (typeof t.scale !== 'number' || t.scale === 0) t.scale = 1;
    if (typeof t.rotation !== 'number') t.rotation = 0;
    return t;
  }

  function getStrokeCentroid(points) {
    if (!points || !points.length) return { x: 0, y: 0 };
    var sx = 0;
    var sy = 0;
    for (var i = 0; i < points.length; i++) {
      sx += points[i].x;
      sy += points[i].y;
    }
    var n = points.length;
    return { x: sx / n, y: sy / n };
  }

  function getTransformedPoints(stroke) {
    var pts = stroke.points;
    if (!pts || pts.length < 2) return [];
    var tr = ensureStrokeTransform(stroke);
    var c = getStrokeCentroid(pts);
    var cx = c.x;
    var cy = c.y;
    var cos = Math.cos(tr.rotation);
    var sin = Math.sin(tr.rotation);
    var sc = tr.scale || 1;
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i].x - cx;
      var y = pts[i].y - cy;
      var xr = x * cos * sc - y * sin * sc;
      var yr = x * sin * sc + y * cos * sc;
      out.push({ x: xr + cx + tr.tx, y: yr + cy + tr.ty });
    }
    return out;
  }

  function distSqToSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) {
      var dx0 = px - x1;
      var dy0 = py - y1;
      return dx0 * dx0 + dy0 * dy0;
    }
    var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    var qx = x1 + t * dx;
    var qy = y1 + t * dy;
    var ddx = px - qx;
    var ddy = py - qy;
    return ddx * ddx + ddy * ddy;
  }

  function minDistToPolyline(px, py, points) {
    var minD = Infinity;
    for (var i = 0; i < points.length - 1; i++) {
      var d = distSqToSegment(px, py, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      if (d < minD) minD = d;
    }
    return Math.sqrt(minD);
  }

  function hitTestLayerIndex(px, py) {
    var th = 12;
    for (var i = session.strokes.length - 1; i >= 0; i--) {
      var stroke = session.strokes[i];
      var pts = getTransformedPoints(stroke);
      if (pts.length < 2) continue;
      var tr = ensureStrokeTransform(stroke);
      var sc = Math.abs(tr.scale || 1);
      var w = (stroke.width || 8) * sc * 0.5 + th;
      var dist = minDistToPolyline(px, py, pts);
      if (dist <= w) return i;
    }
    return -1;
  }

  var session = {
    strokes: [],
    undoStack: [],
    redoStack: [],
    historySnapshots: [],
    currentStroke: null,
    hadDesignImage: false,
    mode: 'draw',
    selectedLayerIndex: null,
    editDrag: null
  };

  function resetSession() {
    session.strokes = [];
    session.undoStack = [];
    session.redoStack = [];
    session.historySnapshots = [];
    session.currentStroke = null;
    session.hadDesignImage = false;
    session.mode = 'draw';
    session.selectedLayerIndex = null;
    session.editDrag = null;
  }

  function pushHistorySnapshot() {
    session.historySnapshots.push({
      t: Date.now(),
      strokes: cloneStrokes(session.strokes)
    });
    if (session.historySnapshots.length > 40) session.historySnapshots.shift();
  }

  function commitStroke(stroke) {
    if (!stroke || stroke.points.length < 2) return;
    pushHistorySnapshot();
    session.undoStack.push(cloneStrokes(session.strokes));
    session.redoStack = [];
    ensureStrokeTransform(stroke);
    session.strokes.push(stroke);
    persistShopSession();
  }

  function undo() {
    var prev = session.undoStack.pop();
    if (!prev) return false;
    session.redoStack.push(cloneStrokes(session.strokes));
    session.strokes = prev;
    persistShopSession();
    return true;
  }

  function redo() {
    var next = session.redoStack.pop();
    if (!next) return false;
    session.undoStack.push(cloneStrokes(session.strokes));
    session.strokes = next;
    persistShopSession();
    return true;
  }

  function clearAll() {
    pushHistorySnapshot();
    if (!session.strokes.length && !session.currentStroke) return;
    session.undoStack.push(cloneStrokes(session.strokes));
    session.redoStack = [];
    session.strokes = [];
    session.currentStroke = null;
    session.selectedLayerIndex = null;
    session.editDrag = null;
    clearShopSessionStorage();
  }

  function removeLayerAt(index) {
    if (index < 0 || index >= session.strokes.length) return;
    session.undoStack.push(cloneStrokes(session.strokes));
    session.redoStack = [];
    session.strokes.splice(index, 1);
    if (session.selectedLayerIndex != null) {
      if (index < session.selectedLayerIndex) session.selectedLayerIndex--;
      else if (index === session.selectedLayerIndex) session.selectedLayerIndex = null;
    }
    persistShopSession();
  }

  function replaceContent(list) {
    session.undoStack = [];
    session.redoStack = [];
    session.strokes = cloneStrokes(list);
    session.currentStroke = null;
    session.selectedLayerIndex = null;
    session.editDrag = null;
    persistShopSession();
  }

  function persistShopSession() {
    if (!isShopStudio() || !activePersistKey) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY + ':' + activePersistKey,
        JSON.stringify({
          v: 1,
          strokes: cloneStrokes(session.strokes)
        })
      );
    } catch (e) {}
  }

  function clearShopSessionStorage() {
    if (!isShopStudio() || !activePersistKey) return;
    try {
      sessionStorage.removeItem(SESSION_KEY + ':' + activePersistKey);
    } catch (e) {}
  }

  /** Legacy single-key storage — clear once so old global strokes never bleed into new flows. */
  function clearLegacyGlobalShopSession() {
    if (!isShopStudio()) return;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function loadPersistedStrokesForKey(key) {
    if (!isShopStudio() || !key) return null;
    try {
      var raw = sessionStorage.getItem(SESSION_KEY + ':' + key);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.strokes)) return null;
      return o.strokes;
    } catch (e) {
      return null;
    }
  }

  var LAYER_THUMB_SIZE = 88;

  function drawStrokePreviewToCanvas(stroke, canvasEl, sizePx) {
    var s = sizePx || LAYER_THUMB_SIZE;
    var ctx = canvasEl.getContext('2d');
    canvasEl.width = s;
    canvasEl.height = s;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    if (!stroke || !stroke.points || stroke.points.length < 2) return;
    var pts = getTransformedPoints(stroke);
    if (pts.length < 2) return;
    var minX = pts[0].x;
    var maxX = pts[0].x;
    var minY = pts[0].y;
    var maxY = pts[0].y;
    for (var i = 1; i < pts.length; i++) {
      var x = pts[i].x;
      var y = pts[i].y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    var pad = 6;
    var bw = Math.max(maxX - minX, 1);
    var bh = Math.max(maxY - minY, 1);
    var scale = Math.min((s - pad * 2) / bw, (s - pad * 2) / bh);
    var ox = (s - bw * scale) / 2 - minX * scale;
    var oy = (s - bh * scale) / 2 - minY * scale;
    var tr = ensureStrokeTransform(stroke);
    var scAbs = Math.abs(tr.scale || 1);
    ctx.strokeStyle = stroke.color || '#000000';
    var lw = (stroke.width || 8) * scAbs;
    ctx.lineWidth = Math.max(1, Math.min(lw * scale * 0.45, 8));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x * scale + ox, pts[0].y * scale + oy);
    for (var j = 1; j < pts.length; j++) {
      ctx.lineTo(pts[j].x * scale + ox, pts[j].y * scale + oy);
    }
    ctx.stroke();
  }

  function renderStrokeLayer(draw, list) {
    var dctx = draw.getContext('2d');
    dctx.clearRect(0, 0, draw.width, draw.height);
    list.forEach(function (stroke) {
      var pts = getTransformedPoints(stroke);
      if (pts.length < 2) return;
      var tr = ensureStrokeTransform(stroke);
      var scAbs = Math.abs(tr.scale || 1);
      dctx.strokeStyle = stroke.color;
      dctx.lineWidth = (stroke.width || 8) * scAbs;
      dctx.lineCap = 'round';
      dctx.lineJoin = 'round';
      dctx.beginPath();
      dctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) {
        dctx.lineTo(pts[i].x, pts[i].y);
      }
      dctx.stroke();
    });
  }

  function renderAll(bg, draw) {
    var list = session.strokes.slice();
    if (session.currentStroke && session.currentStroke.points.length >= 2) {
      list.push(session.currentStroke);
    }
    renderStrokeLayer(draw, list);
  }

  function getPos(e, canvas) {
    var rect = canvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    var x = cx - rect.left;
    var y = cy - rect.top;
    return { x: x * (canvas.width / rect.width), y: y * (canvas.height / rect.height) };
  }

  function mergedExportCanvas(bg, draw) {
    var out = document.createElement('canvas');
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    var octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    octx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
    octx.drawImage(draw, 0, 0, CANVAS_W, CANVAS_H, 0, 0, EXPORT_SIZE, EXPORT_SIZE);
    return out;
  }

  function exportMergedDataUrl(bg, draw) {
    return mergedExportCanvas(bg, draw).toDataURL('image/png');
  }

  var activeCallback = null;
  var drawEl = null;
  var bgEl = null;
  var colorInput = null;
  var sizeInput = null;
  var layersEl = null;
  var layersWrap = null;
  var historyOverlay = null;
  var historyList = null;
  var boundClean = null;

  function updateModeUi() {
    var drawTools = document.getElementById('creatorCanvasDrawTools');
    var editTools = document.getElementById('creatorCanvasEditTools');
    var btnDraw = document.getElementById('creatorCanvasModeDraw');
    var btnEdit = document.getElementById('creatorCanvasModeEdit');
    if (drawTools && editTools) {
      var isDraw = session.mode === 'draw';
      drawTools.hidden = !isDraw;
      editTools.hidden = isDraw;
    }
    if (btnDraw && btnEdit) {
      btnDraw.classList.toggle('is-active', session.mode === 'draw');
      btnEdit.classList.toggle('is-active', session.mode === 'edit');
      btnDraw.setAttribute('aria-selected', session.mode === 'draw' ? 'true' : 'false');
      btnEdit.setAttribute('aria-selected', session.mode === 'edit' ? 'true' : 'false');
    }
    if (drawEl) {
      drawEl.classList.toggle('creator-canvas-draw--edit-mode', session.mode === 'edit');
    }
  }

  function syncSlidersFromSelection() {
    var scaleEl = document.getElementById('creatorCanvasEditScale');
    var rotEl = document.getElementById('creatorCanvasEditRotation');
    var scaleVal = document.getElementById('creatorCanvasEditScaleVal');
    var rotVal = document.getElementById('creatorCanvasEditRotationVal');
    if (!scaleEl || !rotEl) return;
    var i = session.selectedLayerIndex;
    if (i == null || !session.strokes[i]) {
      scaleEl.disabled = true;
      rotEl.disabled = true;
      if (scaleVal) scaleVal.textContent = '—';
      if (rotVal) rotVal.textContent = '—';
      return;
    }
    scaleEl.disabled = false;
    rotEl.disabled = false;
    var tr = ensureStrokeTransform(session.strokes[i]);
    var pct = Math.round((tr.scale || 1) * 100);
    pct = Math.max(20, Math.min(300, pct));
    scaleEl.value = String(pct);
    var deg = Math.round((tr.rotation || 0) * 180 / Math.PI);
    deg = Math.max(-180, Math.min(180, deg));
    rotEl.value = String(deg);
    if (scaleVal) scaleVal.textContent = pct + '%';
    if (rotVal) rotVal.textContent = deg + '°';
  }

  function bindEditSlidersOnce() {
    var modal = document.getElementById('creatorCanvasSketchModal');
    if (!modal || modal.dataset.editSlidersBound === '1') return;
    modal.dataset.editSlidersBound = '1';
    var scaleEl = document.getElementById('creatorCanvasEditScale');
    var rotEl = document.getElementById('creatorCanvasEditRotation');
    var scaleVal = document.getElementById('creatorCanvasEditScaleVal');
    var rotVal = document.getElementById('creatorCanvasEditRotationVal');
    if (!scaleEl || !rotEl) return;

    function applyFromSliders() {
      var i = session.selectedLayerIndex;
      if (i == null || !session.strokes[i]) return;
      var tr = ensureStrokeTransform(session.strokes[i]);
      tr.scale = Number(scaleEl.value) / 100;
      if (tr.scale < 0.05) tr.scale = 0.05;
      tr.rotation = (Number(rotEl.value) || 0) * Math.PI / 180;
      if (scaleVal) scaleVal.textContent = Math.round(tr.scale * 100) + '%';
      if (rotVal) rotVal.textContent = (Number(rotEl.value) || 0) + '°';
      renderAll(bgEl, drawEl);
      updateLayersUi();
    }

    scaleEl.addEventListener('input', applyFromSliders);
    rotEl.addEventListener('input', applyFromSliders);

    function snapshotOnChange() {
      pushHistorySnapshot();
      persistShopSession();
    }
    scaleEl.addEventListener('change', snapshotOnChange);
    rotEl.addEventListener('change', snapshotOnChange);
  }

  function bindModeButtonsOnce() {
    var modal = document.getElementById('creatorCanvasSketchModal');
    if (!modal || modal.dataset.modeBtnsBound === '1') return;
    modal.dataset.modeBtnsBound = '1';
    var md = document.getElementById('creatorCanvasModeDraw');
    var me = document.getElementById('creatorCanvasModeEdit');
    if (!md || !me) return;
    md.onclick = function () {
      session.mode = 'draw';
      session.selectedLayerIndex = null;
      session.editDrag = null;
      updateModeUi();
      syncSlidersFromSelection();
      renderAll(bgEl, drawEl);
      updateLayersUi();
    };
    me.onclick = function () {
      session.mode = 'edit';
      session.editDrag = null;
      updateModeUi();
      syncSlidersFromSelection();
    };
  }

  function ensureModal() {
    var modal = document.getElementById('creatorCanvasSketchModal');
    if (modal) {
      var host = modalHost();
      if (modal.parentElement !== host) host.appendChild(modal);
      return modal;
    }

    var root = document.createElement('div');
    root.id = 'creatorCanvasSketchModal';
    root.className = 'creator-canvas-modal';
    root.innerHTML =
      '<div class="creator-canvas-modal__dialog">' +
      '<div class="creator-canvas-modal__header">' +
      '<div class="creator-canvas-modal__header-main">' +
      '<strong id="creatorCanvasTitle">Canvas</strong>' +
      '<div class="creator-canvas-modal__mode-switch" role="tablist">' +
      '<button type="button" class="creator-canvas-modal__mode-btn is-active" id="creatorCanvasModeDraw" role="tab" aria-selected="true" title="' +
      tFlat('canvasModeDraw', 'Draw') +
      '" aria-label="' +
      tFlat('canvasModeDraw', 'Draw') +
      '">' +
      '<svg class="creator-canvas-modal__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 14c-1.1 0-2-.9-2-2s.9-2 2-2c.2 0 .4 0 .6.1l4.2-4.2C11.5 5.3 12.2 5 13 5c1.7 0 3 1.3 3 3 0 .8-.3 1.5-.8 2.1l4.2 4.2c.1.2.1.4.1.6 0 1.1-.9 2-2 2H7z"/></svg>' +
      '</button>' +
      '<button type="button" class="creator-canvas-modal__mode-btn" id="creatorCanvasModeEdit" role="tab" aria-selected="false" title="' +
      tFlat('canvasModeEdit', 'Edit') +
      '" aria-label="' +
      tFlat('canvasModeEdit', 'Edit') +
      '">' +
      '<svg class="creator-canvas-modal__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>' +
      '</button>' +
      '</div></div>' +
      '<button type="button" class="creator-canvas-modal__close" id="creatorCanvasClose">×</button></div>' +
      '<div class="creator-canvas-modal__tools creator-canvas-modal__tools--draw" id="creatorCanvasDrawTools">' +
      '<input type="color" id="creatorCanvasColor" class="creator-canvas-color" value="#000000">' +
      '<label class="creator-canvas-modal__size-label"><span id="creatorCanvasSizeLabel">Size</span>' +
      '<input type="range" id="creatorCanvasSize" class="creator-canvas-size" min="1" max="40" value="8">' +
      '</label>' +
      '<button type="button" class="creator-canvas-btn creator-canvas-btn--tool creator-canvas-btn--icon" id="creatorCanvasUndo" title="' +
      tFlat('canvasUndo', 'Undo') +
      '" aria-label="' +
      tFlat('canvasUndo', 'Undo') +
      '">' +
      '<svg class="creator-canvas-modal__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>' +
      '</button>' +
      '<button type="button" class="creator-canvas-btn creator-canvas-btn--tool creator-canvas-btn--icon" id="creatorCanvasRedo" title="' +
      tFlat('canvasRedo', 'Redo') +
      '" aria-label="' +
      tFlat('canvasRedo', 'Redo') +
      '">' +
      '<svg class="creator-canvas-modal__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22l2.37.78C5.06 12.81 8.06 10.5 11.5 10.5c1.96 0 3.73.72 5.12 1.88L13 19h9v-9l-3.6 1.6z"/></svg>' +
      '</button>' +
      '<button type="button" class="creator-canvas-btn creator-canvas-btn--tool creator-canvas-btn--icon" id="creatorCanvasClear" title="' +
      tFlat('commonClear', 'Clear') +
      '" aria-label="' +
      tFlat('commonClear', 'Clear') +
      '">' +
      '<svg class="creator-canvas-modal__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>' +
      '</button>' +
      '<button type="button" class="creator-canvas-btn creator-canvas-btn--tool creator-canvas-btn--icon" id="creatorCanvasHistory" title="' +
      tFlat('canvasHistory', 'History') +
      '" aria-label="' +
      tFlat('canvasHistory', 'History') +
      '">' +
      '<svg class="creator-canvas-modal__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.52.75-1.23-3.5-2.08V8H12z"/></svg>' +
      '</button>' +
      '</div>' +
      '<div class="creator-canvas-modal__tools creator-canvas-modal__tools--edit" id="creatorCanvasEditTools" hidden>' +
      '<label class="creator-canvas-modal__edit-label">' +
      '<span id="creatorCanvasEditScaleLabel">' +
      tFlat('canvasScaleLabel', 'Scale') +
      '</span>' +
      '<input type="range" id="creatorCanvasEditScale" min="20" max="300" value="100" step="1" disabled>' +
      '<span id="creatorCanvasEditScaleVal">100%</span></label>' +
      '<label class="creator-canvas-modal__edit-label">' +
      '<span id="creatorCanvasEditRotationLabel">' +
      tFlat('canvasRotationLabel', 'Rotation') +
      '</span>' +
      '<input type="range" id="creatorCanvasEditRotation" min="-180" max="180" value="0" step="1" disabled>' +
      '<span id="creatorCanvasEditRotationVal">0°</span></label>' +
      '</div>' +
      '<div class="creator-canvas-modal__wrap"><div class="creator-canvas-stage"><canvas id="creatorCanvasBg" width="1024" height="1024"></canvas><canvas id="creatorCanvasDraw" width="1024" height="1024"></canvas></div></div>' +
      '<div class="creator-canvas-modal__layers-subfooter" id="creatorCanvasLayersWrap" hidden>' +
      '<div class="creator-canvas-modal__layers-subfooter-inner">' +
      '<span class="creator-canvas-modal__layers-title" id="creatorCanvasLayersTitle"></span>' +
      '<div class="creator-canvas-modal__layers-scroll">' +
      '<div class="creator-canvas-modal__layers" id="creatorCanvasLayers"></div>' +
      '</div></div></div>' +
      '<div class="creator-canvas-modal__history" id="creatorCanvasHistoryOverlay" hidden>' +
      '<div class="creator-canvas-modal__history-dialog">' +
      '<div class="creator-canvas-modal__history-head">' +
      '<span id="creatorCanvasHistoryTitle">History</span>' +
      '<button type="button" class="creator-canvas-modal__close" id="creatorCanvasHistoryClose">×</button>' +
      '</div>' +
      '<ul class="creator-canvas-modal__history-list" id="creatorCanvasHistoryList"></ul>' +
      '</div></div>' +
      '<div class="creator-canvas-modal__footer">' +
      '<button type="button" class="creator-canvas-btn" id="creatorCanvasCancel">' +
      tFlat('cancel', 'Cancel') +
      '</button>' +
      '<button type="button" class="creator-canvas-btn creator-canvas-btn--primary" id="creatorCanvasSave">' +
      tFlat('canvasUseDrawing', 'Use drawing') +
      '</button>' +
      '</div>' +
      '</div>';
    modalHost().appendChild(root);
    return root;
  }

  function updateLayersUi() {
    if (!layersEl || !layersWrap) return;
    layersEl.innerHTML = '';
    var title = document.getElementById('creatorCanvasLayersTitle');
    if (title) {
      title.textContent = tFlat('canvasLayers', 'Layers');
    }
    if (!session.strokes.length) {
      layersWrap.hidden = true;
      return;
    }
    layersWrap.hidden = false;
    session.strokes.forEach(function (stroke, index) {
      var card = document.createElement('div');
      card.className = 'creator-canvas-modal__layer-card';
      if (session.mode === 'edit' && session.selectedLayerIndex === index) {
        card.classList.add('is-selected');
      }
      var thumb = document.createElement('canvas');
      thumb.className = 'creator-canvas-modal__layer-thumb';
      thumb.width = LAYER_THUMB_SIZE;
      thumb.height = LAYER_THUMB_SIZE;
      drawStrokePreviewToCanvas(stroke, thumb, LAYER_THUMB_SIZE);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'creator-canvas-modal__layer-del';
      del.setAttribute('aria-label', tFlat('delete', 'Delete'));
      del.textContent = '\u00D7';
      (function (idx) {
        del.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          removeLayerAt(idx);
          renderAll(bgEl, drawEl);
          updateLayersUi();
          syncSlidersFromSelection();
        });
        card.addEventListener('click', function (e) {
          if (e.target.closest('.creator-canvas-modal__layer-del')) return;
          session.mode = 'edit';
          session.selectedLayerIndex = idx;
          updateModeUi();
          syncSlidersFromSelection();
        });
      })(index);
      var num = document.createElement('div');
      num.className = 'creator-canvas-modal__layer-num';
      num.textContent = String(index + 1);
      card.appendChild(thumb);
      card.appendChild(del);
      card.appendChild(num);
      layersEl.appendChild(card);
    });
  }

  function openHistoryUi() {
    if (!historyOverlay || !historyList) return;
    historyOverlay.hidden = false;
    historyList.innerHTML = '';
    var hTitle = document.getElementById('creatorCanvasHistoryTitle');
    if (hTitle) hTitle.textContent = tFlat('canvasHistory', 'History');
    var snaps = session.historySnapshots.slice().reverse();
    snaps.forEach(function (snap, idx) {
      var realIdx = session.historySnapshots.length - idx;
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'creator-canvas-modal__history-item';
      var timeStr = '';
      try {
        timeStr = new Date(snap.t).toLocaleTimeString();
      } catch (e) {
        timeStr = String(snap.t);
      }
      btn.textContent =
        realIdx +
        '. ' +
        timeStr +
        ' (' +
        snap.strokes.length +
        ' ' +
        tFlat('canvasLayers', 'layers') +
        ')';
      btn.addEventListener('click', function () {
        replaceContent(snap.strokes);
        renderAll(bgEl, drawEl);
        updateLayersUi();
        historyOverlay.hidden = true;
      });
      li.appendChild(btn);
      historyList.appendChild(li);
    });
  }

  function bindDrawSurfaceOnce() {
    if (drawEl && drawEl.dataset.sketchBound === '1') return;
    if (!drawEl) return;
    drawEl.dataset.sketchBound = '1';

    function down(e) {
      e.preventDefault();
      if (session.mode === 'edit') {
        var p = getPos(e, drawEl);
        var hit = hitTestLayerIndex(p.x, p.y);
        if (hit >= 0) {
          session.selectedLayerIndex = hit;
          updateLayersUi();
          syncSlidersFromSelection();
          var tr = ensureStrokeTransform(session.strokes[hit]);
          try {
            drawEl.setPointerCapture(e.pointerId);
          } catch (err) {}
          session.editDrag = {
            layerIndex: hit,
            startX: p.x,
            startY: p.y,
            startTx: tr.tx,
            startTy: tr.ty
          };
        } else {
          session.selectedLayerIndex = null;
          updateLayersUi();
          syncSlidersFromSelection();
        }
        return;
      }
      if (!colorInput || !sizeInput) return;
      try {
        drawEl.setPointerCapture(e.pointerId);
      } catch (err) {}
      var pDraw = getPos(e, drawEl);
      session.currentStroke = {
        points: [pDraw],
        color: colorInput.value || '#000000',
        width: Number(sizeInput.value || 8)
      };
    }

    function move(e) {
      if (session.mode === 'edit') {
        if (!session.editDrag) return;
        e.preventDefault();
        var p = getPos(e, drawEl);
        var ed = session.editDrag;
        var tr = ensureStrokeTransform(session.strokes[ed.layerIndex]);
        tr.tx = ed.startTx + (p.x - ed.startX);
        tr.ty = ed.startTy + (p.y - ed.startY);
        renderAll(bgEl, drawEl);
        updateLayersUi();
        return;
      }
      if (!session.currentStroke) return;
      e.preventDefault();
      var pMove = getPos(e, drawEl);
      session.currentStroke.points.push(pMove);
      renderAll(bgEl, drawEl);
    }

    function up(e) {
      if (session.mode === 'edit') {
        if (session.editDrag) {
          var ed = session.editDrag;
          var tr = ensureStrokeTransform(session.strokes[ed.layerIndex]);
          var moved = Math.abs(tr.tx - ed.startTx) > 0.5 || Math.abs(tr.ty - ed.startTy) > 0.5;
          if (moved) {
            pushHistorySnapshot();
            persistShopSession();
          }
          session.editDrag = null;
        }
        try {
          drawEl.releasePointerCapture(e.pointerId);
        } catch (err) {}
        return;
      }
      if (!session.currentStroke) return;
      e.preventDefault();
      try {
        drawEl.releasePointerCapture(e.pointerId);
      } catch (err) {}
      var cs = session.currentStroke;
      session.currentStroke = null;
      if (cs.points.length >= 2) {
        commitStroke(cs);
      }
      renderAll(bgEl, drawEl);
      updateLayersUi();
    }

    drawEl.addEventListener('pointerdown', down);
    drawEl.addEventListener('pointermove', move);
    drawEl.addEventListener('pointerup', up);
    drawEl.addEventListener('pointercancel', up);
  }

  function open(options) {
    var modal = ensureModal();
    bgEl = document.getElementById('creatorCanvasBg');
    drawEl = document.getElementById('creatorCanvasDraw');
    colorInput = document.getElementById('creatorCanvasColor');
    sizeInput = document.getElementById('creatorCanvasSize');
    layersEl = document.getElementById('creatorCanvasLayers');
    layersWrap = document.getElementById('creatorCanvasLayersWrap');
    historyOverlay = document.getElementById('creatorCanvasHistoryOverlay');
    historyList = document.getElementById('creatorCanvasHistoryList');

    var titleEl = document.getElementById('creatorCanvasTitle');
    if (titleEl) titleEl.textContent = tFlat('canvasSketchTitle', 'Canvas sketch');
    var sizeLab = document.getElementById('creatorCanvasSizeLabel');
    if (sizeLab) sizeLab.textContent = tFlat('canvasBrushSize', 'Size');

    activeCallback = options && typeof options.onConfirm === 'function' ? options.onConfirm : null;

    var bg = bgEl;
    var draw = drawEl;
    var bgCtx = bg.getContext('2d');
    var hadImg = !!(options && options.designImage);

    resetSession();
    session.hadDesignImage = hadImg;

    bgCtx.clearRect(0, 0, bg.width, bg.height);
    if (!hadImg) {
      bgCtx.fillStyle = '#ffffff';
      bgCtx.fillRect(0, 0, bg.width, bg.height);
    }

    if (options && options.designImage) {
      var img = options.designImage;
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      var scale = Math.min(bg.width / iw, bg.height / ih);
      var w = iw * scale;
      var h = ih * scale;
      var x = (bg.width - w) / 2;
      var y = (bg.height - h) / 2;
      bgCtx.drawImage(img, x, y, w, h);
    }

    session.strokes = [];
    if (options && Array.isArray(options.initialStrokes) && options.initialStrokes.length) {
      session.strokes = cloneStrokes(options.initialStrokes);
    } else if (activePersistKey) {
      var persistedAfterBg = loadPersistedStrokesForKey(activePersistKey);
      if (persistedAfterBg && persistedAfterBg.length) {
        session.strokes = cloneStrokes(persistedAfterBg);
      }
    }

    renderAll(bg, draw);
    updateLayersUi();
    bindDrawSurfaceOnce();
    bindEditSlidersOnce();
    bindModeButtonsOnce();
    updateModeUi();
    syncSlidersFromSelection();

    document.getElementById('creatorCanvasUndo').onclick = function () {
      if (undo()) {
        renderAll(bg, draw);
        updateLayersUi();
        syncSlidersFromSelection();
      }
    };
    document.getElementById('creatorCanvasRedo').onclick = function () {
      if (redo()) {
        renderAll(bg, draw);
        updateLayersUi();
        syncSlidersFromSelection();
      }
    };
    document.getElementById('creatorCanvasClear').onclick = function () {
      clearAll();
      renderAll(bg, draw);
      updateLayersUi();
      syncSlidersFromSelection();
    };
    document.getElementById('creatorCanvasHistory').onclick = function () {
      openHistoryUi();
    };
    var hClose = document.getElementById('creatorCanvasHistoryClose');
    if (hClose) {
      hClose.onclick = function () {
        if (historyOverlay) historyOverlay.hidden = true;
      };
    }
    if (historyOverlay) {
      historyOverlay.onclick = function (e) {
        if (e.target === historyOverlay) historyOverlay.hidden = true;
      };
    }

    document.getElementById('creatorCanvasClose').onclick = close;
    document.getElementById('creatorCanvasCancel').onclick = close;
    document.getElementById('creatorCanvasSave').onclick = function () {
      var merged = mergedExportCanvas(bg, draw);
      var url = merged.toDataURL('image/png');
      merged.toBlob(function (blob) {
        if (activeCallback) activeCallback({ blob: blob, image_url: url });
        close();
      }, 'image/png');
    };

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    var modal = ensureModal();
    if (isShopStudio() && activePersistKey) {
      persistShopSession();
    }
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (historyOverlay) historyOverlay.hidden = true;
  }

  window.CanvasSketchModal = { open: open, close: close };
})();
