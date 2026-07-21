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
  var maskCanvas = null;
  var maskCtx = null;
  var viewer = null;
  var stage = null;
  var busyEl = null;

  var currentDesign = null;
  var isOpen = false;
  var dirty = false;
  var busy = false;
  var settingsLocked = false;
  var activeTool = 'pipette'; // pipette | eraser | brush | genfill
  var pickedColor = null; // { r, g, b } — null = erase all (no color filter)
  var intensity = 30;
  var eraserSize = 28;
  var brushSize = 28;
  var brushColor = { r: 0, g: 0, b: 0 };
  var recolorTarget = null; // { r, g, b }
  var ignoredColors = []; // [{ id, r, g, b, intensity }]
  var sidebarRail = false; // desktop: icon-only rail
  var drawerCollapsed = false; // mobile: header drawer closed
  var SIDEBAR_RAIL_KEY = 'eaz_ces_sidebar_rail';
  var optionsModalTool = null; // tool whose options are mounted in overlay
  var TOOL_OPTION_KEYS = { pipette: 1, eraser: 1, brush: 1, genfill: 1 };
  var toolFlyoutCloseTimer = null;
  var toolFlyoutOutsideHandler = null;
  var toolFlyoutRepositionHandler = null;
  var TOOL_FLYOUT_CLOSE_MS = 240;

  var history = []; // [{ blobUrl, label }]
  var historyIndex = -1;

  var zoom = { scale: 1, x: 0, y: 0, panMode: false };
  var panDrag = null;
  var eraseStroke = null;
  var paintStroke = null;
  var fillStroke = null;
  var viewerBg = BG_DEFAULT;
  var brushEl = null;
  var brushVisible = false;
  var designBackdrop = null;
  var canvasResizeObserver = null;
  var activePointers = {};
  var pinchGesture = null; // two-finger pan + pinch-zoom
  var toolBeforeModal = 'pipette';
  var confirmResolver = null;
  var confirmPrevFocus = null;
  var confirmKeyHandler = null;
  var confirmBound = false;

  // Generative Fill state
  var genfillMarkerSize = 48;
  var genfillMarking = true;
  var genfillHasMask = false;
  var genfillPending = false; // preview shown, waiting for Apply
  var genfillHasGenerated = false;
  var genfillBaseBlobUrl = null;
  var genfillPreviewBlobUrl = null;

  function t(key, fallback) {
    try {
      var i18n = window.CreatorI18n || {};
      var full = 'creator.edit_studio.' + key;
      if (i18n[full]) return String(i18n[full]);
      if (i18n[key]) return String(i18n[key]);
    } catch (_) {}
    return fallback;
  }

  function tCommon(key, fallback) {
    try {
      var i18n = window.CreatorI18n || {};
      var full = 'creator.common.' + key;
      if (i18n[full]) return String(i18n[full]);
      if (i18n[key]) return String(i18n[key]);
    } catch (_) {}
    return fallback;
  }

  function isConfirmOpen() {
    var overlay = $('ces-confirm-overlay');
    return !!(overlay && !overlay.hasAttribute('hidden'));
  }

  function ensureConfirmDom() {
    var overlay = $('ces-confirm-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'ces-confirm-overlay';
    overlay.className = 'ces-confirm-overlay';
    overlay.setAttribute('hidden', '');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="ces-card ces-card--confirm" role="alertdialog" aria-modal="true" aria-labelledby="ces-confirm-title" aria-describedby="ces-confirm-message">' +
      '<div class="ces-card__header"><h3 id="ces-confirm-title"></h3></div>' +
      '<div class="ces-card__body"><p id="ces-confirm-message" class="ces-confirm-message"></p></div>' +
      '<div class="ces-card__footer">' +
      '<button type="button" class="ces-btn ces-btn--ghost" id="ces-confirm-cancel"></button>' +
      '<button type="button" class="ces-btn ces-btn--primary" id="ces-confirm-ok"></button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeStudioConfirm(result) {
    var overlay = $('ces-confirm-overlay');
    if (overlay) {
      overlay.setAttribute('hidden', '');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('is-alert', 'is-confirm');
    }
    if (confirmKeyHandler) {
      document.removeEventListener('keydown', confirmKeyHandler, true);
      confirmKeyHandler = null;
    }
    if (confirmPrevFocus && typeof confirmPrevFocus.focus === 'function') {
      try { confirmPrevFocus.focus(); } catch (_) {}
    }
    confirmPrevFocus = null;
    var resolve = confirmResolver;
    confirmResolver = null;
    if (typeof resolve === 'function') resolve(!!result);
  }

  function getConfirmFocusables() {
    var cancelBtn = $('ces-confirm-cancel');
    var okBtn = $('ces-confirm-ok');
    var list = [];
    if (cancelBtn && cancelBtn.offsetParent !== null && !cancelBtn.disabled) list.push(cancelBtn);
    if (okBtn && !okBtn.disabled) list.push(okBtn);
    return list;
  }

  function bindConfirmOnce() {
    if (confirmBound) return;
    var overlay = ensureConfirmDom();
    var cancelBtn = $('ces-confirm-cancel');
    var okBtn = $('ces-confirm-ok');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () { closeStudioConfirm(false); });
    }
    if (okBtn) {
      okBtn.addEventListener('click', function () { closeStudioConfirm(true); });
    }
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeStudioConfirm(false);
      });
    }
    confirmBound = true;
  }

  /**
   * Themed confirm/alert. Returns Promise<boolean> (true = OK/Confirm).
   * opts: { mode: 'confirm'|'alert', title, message, confirmLabel, cancelLabel }
   */
  function showStudioDialog(opts) {
    opts = opts || {};
    bindConfirmOnce();
    var overlay = ensureConfirmDom();
    var titleEl = $('ces-confirm-title');
    var msgEl = $('ces-confirm-message');
    var cancelBtn = $('ces-confirm-cancel');
    var okBtn = $('ces-confirm-ok');
    var mode = opts.mode === 'alert' ? 'alert' : 'confirm';

    if (confirmResolver) closeStudioConfirm(false);

    return new Promise(function (resolve) {
      confirmResolver = resolve;
      confirmPrevFocus = document.activeElement;

      if (titleEl) {
        titleEl.textContent = opts.title || (
          mode === 'alert'
            ? t('notice_title', 'Notice')
            : t('confirm_title', 'Please confirm')
        );
      }
      if (msgEl) msgEl.textContent = opts.message || '';

      if (cancelBtn) {
        cancelBtn.textContent = opts.cancelLabel || tCommon('cancel', 'Cancel');
      }
      if (okBtn) {
        okBtn.textContent = opts.confirmLabel || (
          mode === 'alert'
            ? t('ok', 'OK')
            : t('confirm_action', 'Confirm')
        );
      }

      overlay.classList.toggle('is-alert', mode === 'alert');
      overlay.classList.toggle('is-confirm', mode === 'confirm');
      overlay.removeAttribute('hidden');
      overlay.setAttribute('aria-hidden', 'false');

      confirmKeyHandler = function (e) {
        if (!isConfirmOpen()) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          closeStudioConfirm(false);
          return;
        }
        if (e.key === 'Tab') {
          var focusables = getConfirmFocusables();
          if (!focusables.length) return;
          var first = focusables[0];
          var last = focusables[focusables.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first || !overlay.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else if (document.activeElement === last || !overlay.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener('keydown', confirmKeyHandler, true);

      setTimeout(function () {
        try {
          if (okBtn) okBtn.focus();
        } catch (_) {}
      }, 0);
    });
  }

  function showStudioAlert(message, title) {
    return showStudioDialog({
      mode: 'alert',
      title: title || t('notice_title', 'Notice'),
      message: message || '',
      confirmLabel: t('ok', 'OK')
    });
  }

  function showStudioConfirm(message, title) {
    return showStudioDialog({
      mode: 'confirm',
      title: title || t('confirm_title', 'Please confirm'),
      message: message || '',
      confirmLabel: t('confirm_action', 'Confirm'),
      cancelLabel: tCommon('cancel', 'Cancel')
    });
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

  /**
   * Large PNG saves through Shopify App Proxy / portal hop often hit ~10s limits → HTML 502.
   * Prefer the Creator Engine URL directly (CORS is open; owner_id is passed explicitly).
   */
  function resolveHeavySaveDispatchBase() {
    try {
      if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) {
        var root = String(window.CREATOR_API_CONFIG.BASE_URL).replace(/\/+$/, '');
        if (root) return root + '/apps/creator-dispatch';
      }
    } catch (_) {}
    try {
      if (window.CreatorWidget && window.CreatorWidget.apiRoot) {
        var ar = String(window.CreatorWidget.apiRoot).replace(/\/+$/, '');
        if (ar && /workers\.dev|creator-engine/i.test(ar)) return ar + '/apps/creator-dispatch';
      }
    } catch (_) {}
    try {
      var cfgBase = window.CreatorWidget && window.CreatorWidget.apiBaseUrl
        ? String(window.CreatorWidget.apiBaseUrl)
        : '';
      if (cfgBase && /workers\.dev|creator-engine/i.test(cfgBase)) {
        return cfgBase.indexOf('/apps/creator-dispatch') >= 0
          ? cfgBase
          : cfgBase.replace(/\/+$/, '') + '/apps/creator-dispatch';
      }
    } catch (_) {}
    // Absolute fallback used elsewhere for heavy uploads
    return 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
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
    return thresholdFromValue(intensity);
  }

  function thresholdFromValue(val) {
    return (Math.max(0, Math.min(100, Number(val) || 0)) / 100) * DIST_MAX;
  }

  function colorId(rgb) {
    return rgbToHex(rgb).toLowerCase();
  }

  function isProtectedByIgnore(r, g, b) {
    for (var i = 0; i < ignoredColors.length; i++) {
      var ig = ignoredColors[i];
      if (colorDistance(r, g, b, ig.r, ig.g, ig.b) <= thresholdFromValue(ig.intensity)) {
        return true;
      }
    }
    return false;
  }

  function updatePipetteFilterUi() {
    var sw = $('ces-color-swatch');
    var clearBtn = $('ces-color-clear');
    var filterHint = $('ces-color-filter-hint');
    var intensityEl = $('ces-intensity');
    if (sw) {
      if (pickedColor) {
        sw.classList.add('has-color');
        sw.style.background = 'rgb(' + pickedColor.r + ',' + pickedColor.g + ',' + pickedColor.b + ')';
      } else {
        sw.classList.remove('has-color');
        sw.style.background = '';
      }
    }
    if (clearBtn) clearBtn.hidden = !pickedColor;
    if (filterHint) {
      filterHint.textContent = pickedColor
        ? t('color_filter_on', 'Color filter on')
        : t('color_filter_off', 'All colors (no filter)');
      filterHint.classList.toggle('is-off', !pickedColor);
    }
    if (intensityEl) intensityEl.disabled = !pickedColor;
  }

  function setPickedColor(rgb) {
    pickedColor = rgb ? { r: rgb.r, g: rgb.g, b: rgb.b } : null;
    updatePipetteFilterUi();
  }

  function clearPickedColor() {
    setPickedColor(null);
  }

  function setBrushColor(rgb) {
    brushColor = rgb ? { r: rgb.r | 0, g: rgb.g | 0, b: rgb.b | 0 } : { r: 0, g: 0, b: 0 };
    var sw = $('ces-brush-swatch');
    var picker = $('ces-brush-picker');
    if (sw) sw.style.background = 'rgb(' + brushColor.r + ',' + brushColor.g + ',' + brushColor.b + ')';
    if (picker) picker.value = rgbToHex(brushColor);
    var palette = $('ces-brush-palette');
    if (palette) {
      var hex = rgbToHex(brushColor).toLowerCase();
      palette.querySelectorAll('.ces-palette__swatch').forEach(function (btn) {
        btn.classList.toggle('is-selected', String(btn.getAttribute('data-ces-rgb') || '').toLowerCase() === hex);
      });
    }
  }

  function isMobileSidebar() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 720px)').matches;
  }

  function toolLabel(tool) {
    if (tool === 'eraser') return t('eraser', 'Eraser');
    if (tool === 'brush') return t('brush', 'Brush');
    if (tool === 'genfill') return t('generative_fill', 'Generative Fill');
    if (tool === 'recolor') return t('change_color', 'Change Color');
    if (tool === 'ignore') return t('color_ignore', 'Color Ignore');
    return t('pipette', 'Pipette');
  }

  function syncToolAccordion() {
    if (!root) return;
    root.querySelectorAll('[data-ces-tool-item]').forEach(function (item) {
      var key = item.getAttribute('data-ces-tool-item');
      var on = key === activeTool;
      item.classList.toggle('is-active', on);
    });
  }

  function restoreOptionsHome() {
    if (!optionsModalTool) return;
    var opts = document.querySelector('[data-ces-options-home="' + optionsModalTool + '"]');
    var panel = root && root.querySelector('[data-ces-tool-panel="' + optionsModalTool + '"]');
    if (opts && panel && opts.parentElement !== panel) {
      panel.appendChild(opts);
    }
    optionsModalTool = null;
  }

  function setToolFlyoutAriaExpanded(tool) {
    if (!root) return;
    root.querySelectorAll('[data-ces-tool]').forEach(function (btn) {
      if (tool && btn.getAttribute('data-ces-tool') === tool) {
        btn.setAttribute('aria-expanded', 'true');
      } else {
        btn.removeAttribute('aria-expanded');
      }
    });
  }

  function detachToolFlyoutListeners() {
    if (toolFlyoutOutsideHandler) {
      document.removeEventListener('pointerdown', toolFlyoutOutsideHandler, true);
      toolFlyoutOutsideHandler = null;
    }
    if (toolFlyoutRepositionHandler) {
      window.removeEventListener('resize', toolFlyoutRepositionHandler);
      toolFlyoutRepositionHandler = null;
    }
  }

  function positionToolFlyout(tool) {
    var overlay = $('ces-tool-options-overlay');
    var shell = root && root.querySelector('.ces-modal__shell');
    var sidebar = $('ces-sidebar');
    var btn = root && root.querySelector('[data-ces-tool="' + tool + '"]');
    if (!overlay || !shell || !sidebar || !btn) return;
    var shellRect = shell.getBoundingClientRect();
    var sidebarRect = sidebar.getBoundingClientRect();
    var btnRect = btn.getBoundingClientRect();
    var left = Math.round(sidebarRect.right - shellRect.left + 10);
    var top = Math.round(btnRect.top - shellRect.top);
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    var flyoutRect = overlay.getBoundingClientRect();
    var maxTop = Math.max(12, shellRect.height - flyoutRect.height - 12);
    var clampedTop = Math.max(12, Math.min(top, maxTop));
    if (clampedTop !== top) overlay.style.top = clampedTop + 'px';
  }

  function closeToolOptionsModal() {
    var overlay = $('ces-tool-options-overlay');
    if (toolFlyoutCloseTimer) {
      clearTimeout(toolFlyoutCloseTimer);
      toolFlyoutCloseTimer = null;
    }
    detachToolFlyoutListeners();
    setToolFlyoutAriaExpanded(null);
    if (!overlay || overlay.hasAttribute('hidden')) {
      restoreOptionsHome();
      return;
    }
    overlay.classList.remove('is-open');
    var closingTool = optionsModalTool;
    toolFlyoutCloseTimer = setTimeout(function () {
      toolFlyoutCloseTimer = null;
      if (optionsModalTool !== closingTool) return;
      overlay.setAttribute('hidden', '');
      restoreOptionsHome();
    }, TOOL_FLYOUT_CLOSE_MS);
  }

  function openToolOptionsModal(tool) {
    if (!TOOL_OPTION_KEYS[tool]) return;
    var overlay = $('ces-tool-options-overlay');
    var host = $('ces-tool-options-host');
    if (!overlay || !host) return;

    if (toolFlyoutCloseTimer) {
      clearTimeout(toolFlyoutCloseTimer);
      toolFlyoutCloseTimer = null;
    }

    // Already open for this tool: just keep it anchored, no re-animation.
    if (optionsModalTool === tool && !overlay.hasAttribute('hidden') && overlay.classList.contains('is-open')) {
      positionToolFlyout(tool);
      return;
    }

    var opts = document.querySelector('[data-ces-options-home="' + tool + '"]');
    var title = $('ces-tool-options-title');
    if (!opts) return;

    restoreOptionsHome();
    optionsModalTool = tool;
    opts.hidden = false;
    host.appendChild(opts);
    if (title) title.textContent = toolLabel(tool);
    if (tool === 'brush') renderBrushPalette();

    overlay.classList.remove('is-open');
    overlay.removeAttribute('hidden');
    positionToolFlyout(tool);
    setToolFlyoutAriaExpanded(tool);

    requestAnimationFrame(function () {
      positionToolFlyout(tool);
      requestAnimationFrame(function () {
        if (optionsModalTool === tool) overlay.classList.add('is-open');
      });
    });

    detachToolFlyoutListeners();
    toolFlyoutRepositionHandler = function () {
      positionToolFlyout(tool);
    };
    window.addEventListener('resize', toolFlyoutRepositionHandler);
    toolFlyoutOutsideHandler = function (e) {
      if (overlay.hasAttribute('hidden')) return;
      if (overlay.contains(e.target)) return;
      var activeBtn = root && root.querySelector('[data-ces-tool="' + tool + '"]');
      if (activeBtn && activeBtn.contains(e.target)) return;
      closeToolOptionsModal();
    };
    document.addEventListener('pointerdown', toolFlyoutOutsideHandler, true);
  }

  function setActiveTool(tool) {
    if (settingsLocked) return;
    if (tool === 'recolor') {
      closeToolOptionsModal();
      openRecolorModal();
      return;
    }
    if (tool === 'ignore') {
      closeToolOptionsModal();
      openIgnoreModal();
      return;
    }

    if (tool !== 'genfill' && activeTool === 'genfill') {
      exitGenfillTool({ keepPending: false });
    }

    if (tool === 'eraser') activeTool = 'eraser';
    else if (tool === 'brush') activeTool = 'brush';
    else if (tool === 'genfill') activeTool = 'genfill';
    else activeTool = 'pipette';

    var pipetteBtn = $('ces-tool-pipette');
    var eraserBtn = $('ces-tool-eraser');
    var brushBtn = $('ces-tool-brush');
    var recolorBtn = $('ces-tool-recolor');
    var ignoreBtn = $('ces-tool-ignore');
    var genfillBtn = $('ces-tool-genfill');
    var pipetteOpts = $('ces-pipette-options');
    var eraserOpts = $('ces-eraser-options');
    var brushOpts = $('ces-brush-options');
    var genfillOpts = $('ces-genfill-options');
    var genfillBar = $('ces-genfill-bar');

    if (pipetteBtn) {
      pipetteBtn.classList.toggle('is-active', activeTool === 'pipette');
      pipetteBtn.setAttribute('aria-selected', activeTool === 'pipette' ? 'true' : 'false');
    }
    if (eraserBtn) {
      eraserBtn.classList.toggle('is-active', activeTool === 'eraser');
      eraserBtn.setAttribute('aria-selected', activeTool === 'eraser' ? 'true' : 'false');
    }
    if (brushBtn) {
      brushBtn.classList.toggle('is-active', activeTool === 'brush');
      brushBtn.setAttribute('aria-selected', activeTool === 'brush' ? 'true' : 'false');
    }
    if (genfillBtn) {
      genfillBtn.classList.toggle('is-active', activeTool === 'genfill');
      genfillBtn.setAttribute('aria-selected', activeTool === 'genfill' ? 'true' : 'false');
    }
    if (recolorBtn) {
      recolorBtn.classList.remove('is-active');
      recolorBtn.setAttribute('aria-selected', 'false');
    }
    if (ignoreBtn) {
      ignoreBtn.classList.remove('is-active');
      ignoreBtn.setAttribute('aria-selected', 'false');
    }

    // Keep option nodes visible for accordion / modal mounting
    if (pipetteOpts) pipetteOpts.hidden = false;
    if (eraserOpts) eraserOpts.hidden = false;
    if (brushOpts) {
      brushOpts.hidden = false;
      if (activeTool === 'brush') renderBrushPalette();
    }
    if (genfillOpts) genfillOpts.hidden = false;

    syncToolAccordion();

    if (genfillBar) {
      if (activeTool === 'genfill') {
        genfillBar.removeAttribute('hidden');
        syncMaskCanvasSize();
        showMaskOverlay(true);
        updateGenfillUi();
      } else {
        genfillBar.setAttribute('hidden', '');
        showMaskOverlay(false);
      }
    }

    if (!isMobileSidebar() && sidebarRail && TOOL_OPTION_KEYS[activeTool]) {
      openToolOptionsModal(activeTool);
    } else {
      closeToolOptionsModal();
    }

    updateViewerCursor();
    updateIgnoreSummaryUi();
  }

  function rgbToHex(rgb) {
    if (!rgb) return '#ffffff';
    function h(n) {
      var s = Math.max(0, Math.min(255, n | 0)).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + h(rgb.r) + h(rgb.g) + h(rgb.b);
  }

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    var m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function setRecolorTarget(rgb) {
    recolorTarget = rgb ? { r: rgb.r, g: rgb.g, b: rgb.b } : null;
    var toEl = $('ces-recolor-to');
    var picker = $('ces-recolor-picker');
    if (toEl) {
      if (recolorTarget) {
        toEl.style.background = 'rgb(' + recolorTarget.r + ',' + recolorTarget.g + ',' + recolorTarget.b + ')';
      } else {
        toEl.style.background = '';
      }
    }
    if (picker && recolorTarget) picker.value = rgbToHex(recolorTarget);
    var palette = $('ces-recolor-palette');
    if (palette && recolorTarget) {
      var hex = rgbToHex(recolorTarget).toLowerCase();
      palette.querySelectorAll('.ces-palette__swatch').forEach(function (btn) {
        btn.classList.toggle('is-selected', String(btn.getAttribute('data-ces-rgb') || '').toLowerCase() === hex);
      });
    }
  }

  function extractDesignPalette(maxColors) {
    maxColors = maxColors || 32;
    if (!ctx || !canvas || !canvas.width || !canvas.height) return [];
    var w = canvas.width;
    var h = canvas.height;
    var stride = Math.max(1, Math.floor(Math.sqrt((w * h) / 60000)));
    var img;
    try {
      img = ctx.getImageData(0, 0, w, h);
    } catch (_) {
      return [];
    }
    var data = img.data;
    var buckets = Object.create(null);
    for (var y = 0; y < h; y += stride) {
      for (var x = 0; x < w; x += stride) {
        var i = (y * w + x) * 4;
        if (data[i + 3] < 40) continue;
        var rq = (data[i] >> 4) << 4;
        var gq = (data[i + 1] >> 4) << 4;
        var bq = (data[i + 2] >> 4) << 4;
        var key = rq + ',' + gq + ',' + bq;
        if (!buckets[key]) {
          buckets[key] = {
            r: Math.min(255, rq + 8),
            g: Math.min(255, gq + 8),
            b: Math.min(255, bq + 8),
            count: 0
          };
        }
        buckets[key].count++;
      }
    }
    var list = [];
    for (var k in buckets) {
      if (Object.prototype.hasOwnProperty.call(buckets, k)) list.push(buckets[k]);
    }
    list.sort(function (a, b) { return b.count - a.count; });
    return list.slice(0, maxColors);
  }

  function renderRecolorPalette() {
    var palette = $('ces-recolor-palette');
    var empty = $('ces-recolor-palette-empty');
    if (!palette) return;
    palette.innerHTML = '';
    var colors = extractDesignPalette(32);
    if (!colors.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    var selectedHex = recolorTarget ? rgbToHex(recolorTarget).toLowerCase() : '';
    colors.forEach(function (c) {
      var hex = rgbToHex(c);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ces-palette__swatch' + (hex.toLowerCase() === selectedHex ? ' is-selected' : '');
      btn.style.background = hex;
      btn.setAttribute('data-ces-rgb', hex);
      btn.setAttribute('aria-label', hex);
      btn.setAttribute('role', 'option');
      btn.addEventListener('click', function () {
        setRecolorTarget({ r: c.r, g: c.g, b: c.b });
      });
      palette.appendChild(btn);
    });
  }

  function recolorMatching(targetRgb) {
    if (!pickedColor || !targetRgb || !ctx || !canvas) return false;
    var threshold = thresholdFromIntensity();
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = img.data;
    var pr = pickedColor.r;
    var pg = pickedColor.g;
    var pb = pickedColor.b;
    var tr = targetRgb.r | 0;
    var tg = targetRgb.g | 0;
    var tb = targetRgb.b | 0;
    var changed = false;
    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      if (isProtectedByIgnore(data[i], data[i + 1], data[i + 2])) continue;
      if (colorDistance(data[i], data[i + 1], data[i + 2], pr, pg, pb) <= threshold) {
        data[i] = tr;
        data[i + 1] = tg;
        data[i + 2] = tb;
        changed = true;
      }
    }
    if (changed) ctx.putImageData(img, 0, 0);
    return changed;
  }

  async function openRecolorModal() {
    if (!pickedColor) {
      await showStudioAlert(t('pick_color_first', 'Pick a color with the pipette first.'));
      setActiveTool('pipette');
      return;
    }
    toolBeforeModal = activeTool === 'eraser' || activeTool === 'brush' ? activeTool : 'pipette';
    var recolorBtn = $('ces-tool-recolor');
    if (recolorBtn) {
      recolorBtn.classList.add('is-active');
      recolorBtn.setAttribute('aria-selected', 'true');
    }
    var fromEl = $('ces-recolor-from');
    if (fromEl) {
      fromEl.style.background = 'rgb(' + pickedColor.r + ',' + pickedColor.g + ',' + pickedColor.b + ')';
    }
    setRecolorTarget({ r: pickedColor.r, g: pickedColor.g, b: pickedColor.b });
    renderRecolorPalette();
    var overlay = $('ces-recolor-overlay');
    if (overlay) overlay.removeAttribute('hidden');
  }

  function closeRecolorModal(opts) {
    opts = opts || {};
    var overlay = $('ces-recolor-overlay');
    if (overlay) overlay.setAttribute('hidden', '');
    var recolorBtn = $('ces-tool-recolor');
    if (recolorBtn) {
      recolorBtn.classList.remove('is-active');
      recolorBtn.setAttribute('aria-selected', 'false');
    }
    recolorTarget = null;
    if (!opts.keepTool) {
      setActiveTool(toolBeforeModal || 'pipette');
    }
  }

  async function applyRecolor() {
    if (!pickedColor) {
      await showStudioAlert(t('pick_color_first', 'Pick a color with the pipette first.'));
      closeRecolorModal();
      return;
    }
    if (!recolorTarget) return;
    var changed = recolorMatching(recolorTarget);
    if (changed) {
      dirty = true;
      setPickedColor(recolorTarget);
      await pushHistory(t('recolor', 'Change color'));
    }
    closeRecolorModal({ keepTool: false });
  }

  function findIgnored(id) {
    for (var i = 0; i < ignoredColors.length; i++) {
      if (ignoredColors[i].id === id) return ignoredColors[i];
    }
    return null;
  }

  function toggleIgnoredColor(rgb) {
    var id = colorId(rgb);
    var existing = findIgnored(id);
    if (existing) {
      ignoredColors = ignoredColors.filter(function (c) { return c.id !== id; });
    } else {
      ignoredColors.push({
        id: id,
        r: rgb.r | 0,
        g: rgb.g | 0,
        b: rgb.b | 0,
        intensity: 30
      });
    }
    updateIgnoreSummaryUi();
    renderIgnoreModalUi();
  }

  function setIgnoredIntensity(id, value) {
    var item = findIgnored(id);
    if (!item) return;
    item.intensity = Math.max(0, Math.min(100, Number(value) || 0));
  }

  function removeIgnored(id) {
    ignoredColors = ignoredColors.filter(function (c) { return c.id !== id; });
    updateIgnoreSummaryUi();
    renderIgnoreModalUi();
  }

  function clearIgnoredColors() {
    ignoredColors = [];
    updateIgnoreSummaryUi();
    renderIgnoreModalUi();
  }

  function updateIgnoreSummaryUi() {
    var badge = $('ces-ignore-badge');
    var summary = $('ces-ignore-summary');
    var row = $('ces-ignore-summary-swatches');
    var n = ignoredColors.length;
    if (badge) {
      badge.textContent = String(n);
      badge.hidden = n === 0;
    }
    if (summary) summary.hidden = n === 0;
    if (!row) return;
    row.innerHTML = '';
    ignoredColors.forEach(function (c) {
      var el = document.createElement('span');
      el.className = 'ces-ignore-summary__swatch';
      el.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      el.title = rgbToHex(c);
      row.appendChild(el);
    });
  }

  function renderIgnoreModalUi() {
    var palette = $('ces-ignore-palette');
    var empty = $('ces-ignore-palette-empty');
    var list = $('ces-ignore-list');
    var listEmpty = $('ces-ignore-list-empty');
    if (palette) {
      palette.innerHTML = '';
      var colors = extractDesignPalette(32);
      if (!colors.length) {
        if (empty) empty.hidden = false;
      } else {
        if (empty) empty.hidden = true;
        colors.forEach(function (c) {
          var hex = rgbToHex(c);
          var id = hex.toLowerCase();
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ces-palette__swatch' + (findIgnored(id) ? ' is-ignored is-selected' : '');
          btn.style.background = hex;
          btn.setAttribute('data-ces-rgb', hex);
          btn.setAttribute('aria-label', hex);
          btn.addEventListener('click', function () {
            toggleIgnoredColor({ r: c.r, g: c.g, b: c.b });
          });
          palette.appendChild(btn);
        });
      }
    }
    if (list) {
      list.innerHTML = '';
      ignoredColors.forEach(function (c) {
        var row = document.createElement('div');
        row.className = 'ces-ignore-item';
        row.innerHTML =
          '<span class="ces-ignore-item__swatch" style="background:rgb(' + c.r + ',' + c.g + ',' + c.b + ')"></span>' +
          '<div class="ces-ignore-item__controls">' +
          '<span class="ces-ignore-item__label">' + t('ignore_intensity', 'Ignore intensity') + '</span>' +
          '<input type="range" class="ces-slider" min="0" max="100" value="' + c.intensity + '" data-ces-ignore-id="' + c.id + '" aria-label="' + t('ignore_intensity', 'Ignore intensity') + '">' +
          '</div>' +
          '<button type="button" class="ces-ignore-item__remove" data-ces-ignore-remove="' + c.id + '" aria-label="' + t('ignore_remove', 'Remove') + '">&times;</button>';
        list.appendChild(row);
      });
      list.querySelectorAll('input[data-ces-ignore-id]').forEach(function (input) {
        input.addEventListener('input', function () {
          setIgnoredIntensity(input.getAttribute('data-ces-ignore-id'), input.value);
        });
      });
      list.querySelectorAll('[data-ces-ignore-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          removeIgnored(btn.getAttribute('data-ces-ignore-remove'));
        });
      });
    }
    if (listEmpty) listEmpty.hidden = ignoredColors.length > 0;
  }

  function openIgnoreModal() {
    toolBeforeModal = activeTool === 'eraser' || activeTool === 'brush' ? activeTool : 'pipette';
    var ignoreBtn = $('ces-tool-ignore');
    if (ignoreBtn) {
      ignoreBtn.classList.add('is-active');
      ignoreBtn.setAttribute('aria-selected', 'true');
    }
    renderIgnoreModalUi();
    var overlay = $('ces-ignore-overlay');
    if (overlay) overlay.removeAttribute('hidden');
  }

  function closeIgnoreModal(opts) {
    opts = opts || {};
    var overlay = $('ces-ignore-overlay');
    if (overlay) overlay.setAttribute('hidden', '');
    var ignoreBtn = $('ces-tool-ignore');
    if (ignoreBtn) {
      ignoreBtn.classList.remove('is-active');
      ignoreBtn.setAttribute('aria-selected', 'false');
    }
    updateIgnoreSummaryUi();
    if (!opts.keepTool) setActiveTool(toolBeforeModal || 'pipette');
  }

  function renderBrushPalette() {
    var palette = $('ces-brush-palette');
    if (!palette) return;
    palette.innerHTML = '';
    var colors = extractDesignPalette(24);
    var selectedHex = rgbToHex(brushColor).toLowerCase();
    colors.forEach(function (c) {
      var hex = rgbToHex(c);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ces-palette__swatch' + (hex.toLowerCase() === selectedHex ? ' is-selected' : '');
      btn.style.background = hex;
      btn.setAttribute('data-ces-rgb', hex);
      btn.addEventListener('click', function () {
        setBrushColor({ r: c.r, g: c.g, b: c.b });
      });
      palette.appendChild(btn);
    });
  }

  function paintAtPoint(cx, cy, radius) {
    if (!ctx || !canvas) return false;
    ctx.save();
    ctx.fillStyle = 'rgb(' + brushColor.r + ',' + brushColor.g + ',' + brushColor.b + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return true;
  }

  function paintAlongStroke(x0, y0, x1, y1, radius) {
    var dist = Math.hypot(x1 - x0, y1 - y0);
    var step = Math.max(1, radius * 0.35);
    var n = Math.max(1, Math.ceil(dist / step));
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      paintAtPoint(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius);
    }
    return true;
  }

  function updateViewerCursor() {
    if (!viewer) return;
    viewer.classList.toggle('is-eyedropper', !zoom.panMode && activeTool === 'pipette');
    viewer.classList.toggle('is-eraser', !zoom.panMode && activeTool === 'eraser');
    viewer.classList.toggle('is-brush', !zoom.panMode && (activeTool === 'brush' || activeTool === 'genfill'));
    viewer.classList.toggle('is-pan-mode', !!zoom.panMode);
    if (
      (activeTool !== 'eraser' && activeTool !== 'brush' && activeTool !== 'genfill') ||
      zoom.panMode
    ) {
      hideBrushCursor();
    }
  }

  function activeBrushSize() {
    if (activeTool === 'brush') return brushSize;
    if (activeTool === 'genfill') return genfillMarkerSize;
    return eraserSize;
  }

  function brushCursorDisplayDiameter() {
    var size = activeBrushSize();
    if (!canvas || !canvas.width) return size;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return size;
    return Math.max(4, size * (rect.width / canvas.width));
  }

  function hideBrushCursor() {
    brushVisible = false;
    if (!brushEl) return;
    brushEl.hidden = true;
  }

  function hideEraserBrush() {
    hideBrushCursor();
  }

  function updateEraserBrush(clientX, clientY) {
    if (!brushEl || !viewer || !canvas || !isOpen) {
      hideBrushCursor();
      return;
    }
    if ((activeTool !== 'eraser' && activeTool !== 'brush' && activeTool !== 'genfill') || zoom.panMode || busy) {
      hideBrushCursor();
      return;
    }
    var canvasRect = canvas.getBoundingClientRect();
    var overCanvas =
      clientX >= canvasRect.left &&
      clientX <= canvasRect.right &&
      clientY >= canvasRect.top &&
      clientY <= canvasRect.bottom;
    if (!overCanvas && !eraseStroke && !paintStroke) {
      hideBrushCursor();
      return;
    }
    var viewerRect = viewer.getBoundingClientRect();
    var diameter = brushCursorDisplayDiameter();
    brushEl.style.width = diameter + 'px';
    brushEl.style.height = diameter + 'px';
    brushEl.style.left = clientX - viewerRect.left + 'px';
    brushEl.style.top = clientY - viewerRect.top + 'px';
    brushEl.hidden = false;
    brushVisible = true;
  }

  function refreshEraserBrushSize() {
    if (!brushVisible || !brushEl || brushEl.hidden) return;
    var diameter = brushCursorDisplayDiameter();
    brushEl.style.width = diameter + 'px';
    brushEl.style.height = diameter + 'px';
  }

  function applyZoomTransform() {
    if (!stage) return;
    stage.style.transform =
      'translate(' + zoom.x + 'px,' + zoom.y + 'px) scale(' + zoom.scale + ')';
    syncDesignBackdropSize();
  }

  function syncDesignBackdropSize() {
    var backdrop = designBackdrop || $('ces-design-backdrop');
    var target = canvas || $('ces-canvas');
    if (!backdrop || !target) return;
    // Layout size (pre-zoom) so backdrop matches the canvas box inside the scaled stage.
    var w = target.offsetWidth || 0;
    var h = target.offsetHeight || 0;
    if (w <= 0 || h <= 0) {
      var rect = target.getBoundingClientRect();
      var scale = zoom.scale || 1;
      w = scale > 0.001 ? rect.width / scale : rect.width;
      h = scale > 0.001 ? rect.height / scale : rect.height;
    }
    backdrop.style.width = Math.max(0, Math.round(w)) + 'px';
    backdrop.style.height = Math.max(0, Math.round(h)) + 'px';
  }

  function ensureCanvasResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    if (!canvasResizeObserver) {
      canvasResizeObserver = new ResizeObserver(function () {
        syncDesignBackdropSize();
      });
    }
    if (canvas) {
      try { canvasResizeObserver.disconnect(); } catch (_) {}
      canvasResizeObserver.observe(canvas);
    }
  }

  function setZoom(scale, anchorClientX, anchorClientY) {
    var next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
    if (
      typeof anchorClientX === 'number' &&
      typeof anchorClientY === 'number' &&
      viewer &&
      zoom.scale > 0.001
    ) {
      zoomTowardClient(anchorClientX, anchorClientY, next);
      return;
    }
    zoom.scale = next;
    if (zoom.scale <= 1.001) {
      zoom.scale = 1;
      zoom.x = 0;
      zoom.y = 0;
    }
    applyZoomTransform();
    refreshEraserBrushSize();
  }

  function viewerCenter() {
    if (!viewer) return { x: 0, y: 0 };
    var rect = viewer.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /** Zoom so the content under (clientX, clientY) stays under the pointer. */
  function zoomTowardClient(clientX, clientY, newScale) {
    var next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
    var center = viewerCenter();
    var prev = zoom.scale || 1;
    if (next <= 1.001) {
      zoom.scale = 1;
      zoom.x = 0;
      zoom.y = 0;
      applyZoomTransform();
      refreshEraserBrushSize();
      return;
    }
    var ox = (clientX - center.x - zoom.x) / prev;
    var oy = (clientY - center.y - zoom.y) / prev;
    zoom.scale = next;
    zoom.x = clientX - center.x - ox * next;
    zoom.y = clientY - center.y - oy * next;
    applyZoomTransform();
    refreshEraserBrushSize();
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
    refreshEraserBrushSize();
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
    // Design preview bg on dedicated backdrop behind the canvas (exact design bounds).
    // Viewer pasteboard stays fixed dark anthracite.
    var backdrop = designBackdrop || $('ces-design-backdrop');
    if (!backdrop) return;
    var isChecker = viewerBg === 'checker';
    backdrop.classList.toggle('is-checker-bg', isChecker);
    if (isChecker) {
      backdrop.style.backgroundColor = '';
      backdrop.style.backgroundImage = '';
    } else {
      backdrop.style.backgroundColor = viewerBg;
      backdrop.style.backgroundImage = 'none';
    }
    syncDesignBackdropSize();
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
    if (!ctx || !canvas) return false;
    var filterOn = !!pickedColor;
    var threshold = filterOn ? thresholdFromIntensity() : 0;
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
    var pr = filterOn ? pickedColor.r : 0;
    var pg = filterOn ? pickedColor.g : 0;
    var pb = filterOn ? pickedColor.b : 0;
    var changed = false;
    for (var row = 0; row < h; row++) {
      for (var col = 0; col < w; col++) {
        var dx = x0 + col + 0.5 - cx;
        var dy = y0 + row + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        var i = (row * w + col) * 4;
        if (data[i + 3] < 8) continue;
        if (isProtectedByIgnore(data[i], data[i + 1], data[i + 2])) continue;
        if (!filterOn || colorDistance(data[i], data[i + 1], data[i + 2], pr, pg, pb) <= threshold) {
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
    syncMaskCanvasSize();
    showMaskOverlay(activeTool === 'genfill');
    syncDesignBackdropSize();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { syncDesignBackdropSize(); });
    }
  }

  function setBusy(on, message) {
    busy = !!on;
    if (busyEl) {
      if (busy) {
        busyEl.removeAttribute('hidden');
      } else {
        busyEl.setAttribute('hidden', '');
      }
    }
    var busyText = $('ces-busy-text');
    if (busyText) {
      busyText.textContent = message || t('saving', 'Saving…');
    }
    var saveBtn = $('ces-btn-save');
    var saveCopyBtn = $('ces-btn-save-copy');
    var discardBtn = $('ces-btn-discard');
    if (saveBtn) saveBtn.disabled = busy || settingsLocked;
    if (saveCopyBtn) saveCopyBtn.disabled = busy || settingsLocked;
    if (discardBtn) discardBtn.disabled = busy || settingsLocked;
  }

  function setSettingsLocked(locked) {
    settingsLocked = !!locked;
    if (root) root.classList.toggle('is-locked', settingsLocked);
    var saveBtn = $('ces-btn-save');
    var saveCopyBtn = $('ces-btn-save-copy');
    var discardBtn = $('ces-btn-discard');
    if (saveBtn) saveBtn.disabled = busy || settingsLocked;
    if (saveCopyBtn) saveCopyBtn.disabled = busy || settingsLocked;
    if (discardBtn) discardBtn.disabled = busy || settingsLocked;
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

  function applySidebarUi() {
    var sidebar = $('ces-sidebar');
    var toggle = $('ces-sidebar-toggle');
    var railBtn = $('ces-sidebar-rail-btn');
    if (!sidebar) return;
    var mobile = isMobileSidebar();
    sidebar.classList.toggle('is-rail', !mobile && sidebarRail);
    sidebar.classList.toggle('is-drawer-collapsed', mobile && drawerCollapsed);
    if (toggle) {
      toggle.setAttribute('aria-expanded', mobile ? (drawerCollapsed ? 'false' : 'true') : 'true');
    }
    if (railBtn) {
      railBtn.setAttribute('aria-pressed', sidebarRail ? 'true' : 'false');
      railBtn.setAttribute(
        'aria-label',
        sidebarRail ? t('expand_sidebar', 'Expand sidebar') : t('collapse_sidebar', 'Collapse sidebar')
      );
      railBtn.title = sidebarRail ? t('expand_sidebar', 'Expand sidebar') : t('collapse_sidebar', 'Collapse sidebar');
    }
    if (mobile || !sidebarRail) {
      closeToolOptionsModal();
    }
  }

  function setSidebarRail(collapsed) {
    sidebarRail = !!collapsed;
    try {
      sessionStorage.setItem(SIDEBAR_RAIL_KEY, sidebarRail ? '1' : '0');
    } catch (_) {}
    applySidebarUi();
  }

  function setDrawerCollapsed(collapsed) {
    drawerCollapsed = !!collapsed;
    applySidebarUi();
  }

  function syncMaskCanvasSize() {
    if (!canvas || !maskCanvas) return;
    if (maskCanvas.width !== canvas.width || maskCanvas.height !== canvas.height) {
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      if (maskCtx) {
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      }
      genfillHasMask = false;
    }
  }

  function showMaskOverlay(on) {
    if (!maskCanvas) return;
    if (on && genfillHasMask) maskCanvas.removeAttribute('hidden');
    else if (on) maskCanvas.removeAttribute('hidden');
    else maskCanvas.setAttribute('hidden', '');
  }

  function clearGenfillMask() {
    if (maskCtx && maskCanvas) {
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    genfillHasMask = false;
  }

  function revokeGenfillUrls() {
    if (genfillBaseBlobUrl) {
      try { URL.revokeObjectURL(genfillBaseBlobUrl); } catch (_) {}
      genfillBaseBlobUrl = null;
    }
    if (genfillPreviewBlobUrl) {
      try { URL.revokeObjectURL(genfillPreviewBlobUrl); } catch (_) {}
      genfillPreviewBlobUrl = null;
    }
  }

  function resetGenfillState() {
    revokeGenfillUrls();
    genfillPending = false;
    genfillHasGenerated = false;
    genfillMarking = true;
    clearGenfillMask();
    updateGenfillUi();
  }

  function exitGenfillTool(opts) {
    opts = opts || {};
    if (genfillPending && genfillBaseBlobUrl && !opts.keepPending) {
      drawBlobUrl(genfillBaseBlobUrl).catch(function () {});
      genfillPending = false;
    }
    if (!opts.keepMask) clearGenfillMask();
    showMaskOverlay(false);
    var bar = $('ces-genfill-bar');
    if (bar) bar.setAttribute('hidden', '');
  }

  function updateGenfillUi() {
    var setAreaBtn = $('ces-genfill-set-area');
    var genBtn = $('ces-genfill-generate');
    var applyBtn = $('ces-genfill-apply');
    if (setAreaBtn) {
      setAreaBtn.classList.toggle('is-active', !!genfillMarking);
      setAreaBtn.setAttribute('aria-pressed', genfillMarking ? 'true' : 'false');
    }
    if (genBtn) {
      genBtn.textContent = genfillHasGenerated
        ? t('genfill_generate_again', 'Generate again')
        : t('genfill_generate', 'Generate');
    }
    if (applyBtn) {
      if (genfillPending) applyBtn.removeAttribute('hidden');
      else applyBtn.setAttribute('hidden', '');
    }
  }

  function paintFillMarkerAt(cx, cy, radius) {
    if (!maskCtx || !maskCanvas) return false;
    syncMaskCanvasSize();
    maskCtx.save();
    maskCtx.globalCompositeOperation = 'source-over';
    maskCtx.fillStyle = 'rgba(255, 80, 220, 0.85)';
    maskCtx.beginPath();
    maskCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    maskCtx.fill();
    maskCtx.restore();
    genfillHasMask = true;
    showMaskOverlay(true);
    return true;
  }

  function paintFillAlongStroke(x0, y0, x1, y1, radius) {
    var dist = Math.hypot(x1 - x0, y1 - y0);
    var step = Math.max(1, radius * 0.35);
    var n = Math.max(1, Math.ceil(dist / step));
    for (var i = 0; i <= n; i++) {
      var tt = i / n;
      paintFillMarkerAt(x0 + (x1 - x0) * tt, y0 + (y1 - y0) * tt, radius);
    }
    return true;
  }

  function maskCanvasToBlob() {
    return new Promise(function (resolve, reject) {
      if (!maskCanvas || !canvas) return reject(new Error('no mask'));
      // Export white-on-black mask for inpaint APIs
      var exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      var ex = exportCanvas.getContext('2d');
      if (!ex) return reject(new Error('no mask ctx'));
      ex.fillStyle = '#000000';
      ex.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      // Read magenta overlay → white where marked
      var src = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      var out = ex.createImageData(exportCanvas.width, exportCanvas.height);
      for (var i = 0; i < src.data.length; i += 4) {
        var a = src.data[i + 3];
        var luma = (src.data[i] + src.data[i + 1] + src.data[i + 2]) / 3;
        var on = a > 20 || luma > 20;
        out.data[i] = on ? 255 : 0;
        out.data[i + 1] = on ? 255 : 0;
        out.data[i + 2] = on ? 255 : 0;
        out.data[i + 3] = 255;
      }
      ex.putImageData(out, 0, 0);
      exportCanvas.toBlob(function (blob) {
        if (!blob) reject(new Error('mask toBlob failed'));
        else resolve(blob);
      }, 'image/png');
    });
  }

  async function runGenerativeFill() {
    if (busy || settingsLocked) return;
    if (!currentDesign || !currentDesign.id) {
      await showStudioAlert(t('no_design', 'No design selected.'));
      return;
    }
    if (!genfillHasMask) {
      await showStudioAlert(t('genfill_need_area', 'Mark at least one area to fill.'));
      return;
    }
    var promptEl = $('ces-genfill-prompt');
    var prompt = promptEl ? String(promptEl.value || '').trim() : '';
    if (!prompt) {
      await showStudioAlert(t('genfill_need_prompt', 'Enter a prompt for Generative Fill.'));
      return;
    }
    var ownerId = resolveOwnerId(currentDesign);
    if (!ownerId) {
      await showStudioAlert(window.CreatorI18n?.noUserId || t('no_user', 'Error: No user ID found. Please sign in.'));
      return;
    }

    setSettingsLocked(true);
    setBusy(true, t('generating', 'Generating fill…'));
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var toid = null;
    try {
      // Snapshot base before first preview (for Generate again / cancel)
      if (!genfillBaseBlobUrl || !genfillPending) {
        if (genfillBaseBlobUrl) {
          try { URL.revokeObjectURL(genfillBaseBlobUrl); } catch (_) {}
        }
        var baseBlob = await canvasToBlob();
        genfillBaseBlobUrl = URL.createObjectURL(baseBlob);
      } else if (genfillBaseBlobUrl) {
        await drawBlobUrl(genfillBaseBlobUrl);
      }

      var imageBlob = await canvasToBlob();
      var maskBlob = await maskCanvasToBlob();
      var fd = new FormData();
      fd.set('design_id', String(currentDesign.id));
      fd.set('owner_id', String(ownerId));
      fd.set('logged_in_customer_id', String(ownerId));
      fd.set('prompt', prompt);
      fd.set('image', imageBlob, 'edit-studio.png');
      fd.set('mask', maskBlob, 'fill-mask.png');

      var apiBase = resolveHeavySaveDispatchBase() || resolveDispatchBase();
      var url = new URL(apiBase);
      url.searchParams.set('op', 'design-edit-studio-generative-fill');
      url.searchParams.set('path_prefix', '/apps/creator-dispatch');
      url.searchParams.set('logged_in_customer_id', String(ownerId));
      url.searchParams.set('owner_id', String(ownerId));

      if (ac) {
        toid = setTimeout(function () {
          try { ac.abort(); } catch (_) {}
        }, 180000);
      }

      var response = await fetch(url.toString(), {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        body: fd,
        signal: ac ? ac.signal : undefined
      });
      if (toid) {
        clearTimeout(toid);
        toid = null;
      }

      var raw = await response.text();
      var data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!data || !data.ok || !data.image_url) {
        var serverMsg = data && (data.message || data.error);
        throw new Error(serverMsg || t('genfill_failed', 'Generative Fill failed.'));
      }

      await new Promise(function (resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          try {
            if (!canvas || !ctx) return reject(new Error('no canvas'));
            // Server composites onto original size; keep canvas dims and avoid
            // upscaling a smaller model frame over the whole design.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (canvas.width === img.naturalWidth && canvas.height === img.naturalHeight) {
              ctx.drawImage(img, 0, 0);
            } else {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = function () { reject(new Error(t('genfill_failed', 'Generative Fill failed.'))); };
        img.src = cacheBust(data.image_url);
      });

      if (genfillPreviewBlobUrl) {
        try { URL.revokeObjectURL(genfillPreviewBlobUrl); } catch (_) {}
      }
      var previewBlob = await canvasToBlob();
      genfillPreviewBlobUrl = URL.createObjectURL(previewBlob);
      genfillPending = true;
      genfillHasGenerated = true;
      updateGenfillUi();
    } catch (err) {
      if (toid) clearTimeout(toid);
      var msg = (err && err.message) || t('genfill_failed', 'Generative Fill failed.');
      if (err && err.name === 'AbortError') {
        msg = t('save_timeout', 'Save timed out. Please try again.');
      }
      console.error('[EditStudio] generative fill failed', err);
      if (genfillBaseBlobUrl) {
        try { await drawBlobUrl(genfillBaseBlobUrl); } catch (_) {}
      }
      await showStudioAlert(msg);
    } finally {
      setBusy(false);
      setSettingsLocked(false);
    }
  }

  async function applyGenerativeFill() {
    if (!genfillPending) return;
    await pushHistory(t('genfill_applied', 'Generative fill'));
    dirty = true;
    genfillPending = false;
    revokeGenfillUrls();
    genfillBaseBlobUrl = null;
    genfillPreviewBlobUrl = null;
    clearGenfillMask();
    updateGenfillUi();
  }

  async function saveStudio() {
    if (!currentDesign || !currentDesign.id) {
      await showStudioAlert(t('no_design', 'No design selected.'));
      return;
    }
    if (!dirty && historyIndex <= 0) {
      await showStudioAlert(t('no_changes', 'No changes to save.'));
      return;
    }
    var ok = await showStudioConfirm(
      t('confirm_save', 'Save your Edit Studio changes? This creates a new version and replaces the current design.'),
      t('confirm_save_title', 'Save changes?')
    );
    if (!ok) return;

    var ownerId = resolveOwnerId(currentDesign);
    if (!ownerId) {
      await showStudioAlert(window.CreatorI18n?.noUserId || t('no_user', 'Error: No user ID found. Please sign in.'));
      return;
    }

    setBusy(true);
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var toid = null;
    try {
      var blob = await canvasToBlob();
      if (!blob || !blob.size) {
        throw new Error(t('save_failed', 'Save failed.') + ' (empty image)');
      }
      var fd = new FormData();
      fd.set('design_id', String(currentDesign.id));
      fd.set('owner_id', String(ownerId));
      fd.set('logged_in_customer_id', String(ownerId));
      fd.set('image', blob, 'edit-studio.png');

      // Direct engine for heavy multipart — avoids Shopify/portal proxy 502 on large PNGs.
      var apiBase = resolveHeavySaveDispatchBase() || resolveDispatchBase();
      var url = new URL(apiBase);
      url.searchParams.set('op', 'design-edit-studio-save');
      url.searchParams.set('path_prefix', '/apps/creator-dispatch');
      url.searchParams.set('logged_in_customer_id', String(ownerId));
      url.searchParams.set('owner_id', String(ownerId));

      if (ac) {
        toid = setTimeout(function () {
          try { ac.abort(); } catch (_) {}
        }, 90000);
      }

      var response = await fetch(url.toString(), {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        body: fd,
        signal: ac ? ac.signal : undefined
      });
      if (toid) {
        clearTimeout(toid);
        toid = null;
      }

      var raw = await response.text();
      var data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!data || !data.ok) {
        var serverMsg = data && (data.message || data.error);
        var statusHint = response.status ? ('HTTP ' + response.status) : '';
        throw new Error(
          serverMsg ||
          (statusHint
            ? t('save_failed', 'Save failed.') + ' (' + statusHint + ')'
            : t('save_failed', 'Save failed.'))
        );
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
      if (toid) clearTimeout(toid);
      var msg = (err && err.message) || t('save_failed', 'Save failed.');
      if (err && err.name === 'AbortError') {
        msg = t('save_timeout', 'Save timed out. Please try again.');
      }
      console.error('[EditStudio] save failed', err);
      await showStudioAlert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function saveStudioCopy() {
    if (!currentDesign || !currentDesign.id) {
      await showStudioAlert(t('no_design', 'No design selected.'));
      return;
    }
    var ok = await showStudioConfirm(
      t('confirm_save_copy', 'Save a copy as a new design? The current design stays unchanged. The copy uses your edited canvas.'),
      t('confirm_save_copy_title', 'Save Copy?')
    );
    if (!ok) return;

    var ownerId = resolveOwnerId(currentDesign);
    if (!ownerId) {
      await showStudioAlert(window.CreatorI18n?.noUserId || t('no_user', 'Error: No user ID found. Please sign in.'));
      return;
    }

    setBusy(true, t('saving', 'Saving…'));
    var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var toid = null;
    try {
      // If a genfill preview is pending, include it in the copy
      var blob = await canvasToBlob();
      if (!blob || !blob.size) {
        throw new Error(t('save_copy_failed', 'Save Copy failed.') + ' (empty image)');
      }
      var fd = new FormData();
      fd.set('design_id', String(currentDesign.id));
      fd.set('owner_id', String(ownerId));
      fd.set('logged_in_customer_id', String(ownerId));
      fd.set('image', blob, 'edit-studio-copy.png');

      var apiBase = resolveHeavySaveDispatchBase() || resolveDispatchBase();
      var url = new URL(apiBase);
      url.searchParams.set('op', 'design-edit-studio-save-copy');
      url.searchParams.set('path_prefix', '/apps/creator-dispatch');
      url.searchParams.set('logged_in_customer_id', String(ownerId));
      url.searchParams.set('owner_id', String(ownerId));

      if (ac) {
        toid = setTimeout(function () {
          try { ac.abort(); } catch (_) {}
        }, 90000);
      }

      var response = await fetch(url.toString(), {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        body: fd,
        signal: ac ? ac.signal : undefined
      });
      if (toid) {
        clearTimeout(toid);
        toid = null;
      }

      var raw = await response.text();
      var data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!data || !data.ok) {
        var serverMsg = data && (data.message || data.error);
        var statusHint = response.status ? ('HTTP ' + response.status) : '';
        throw new Error(
          serverMsg ||
          (statusHint
            ? t('save_copy_failed', 'Save Copy failed.') + ' (' + statusHint + ')'
            : t('save_copy_failed', 'Save Copy failed.'))
        );
      }

      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}

      if (data.design && window.CreatorDesignPreviewModal) {
        try {
          if (typeof window.CreatorDesignPreviewModal.open === 'function') {
            window.CreatorDesignPreviewModal.open(data.design);
          }
        } catch (e) {
          console.warn('[EditStudio] open copy preview failed', e);
        }
      }

      dirty = false;
      genfillPending = false;
      revokeGenfillUrls();
      closeStudio({ force: true });
      await showStudioAlert(
        (data.title
          ? t('save_copy_success', 'Saved as a new design.') + ' (' + data.title + ')'
          : t('save_copy_success', 'Saved as a new design.'))
      );
    } catch (err) {
      if (toid) clearTimeout(toid);
      var msg = (err && err.message) || t('save_copy_failed', 'Save Copy failed.');
      if (err && err.name === 'AbortError') {
        msg = t('save_timeout', 'Save timed out. Please try again.');
      }
      console.error('[EditStudio] save copy failed', err);
      await showStudioAlert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function discardStudio() {
    if (busy) return;
    if (dirty) {
      var ok = await showStudioConfirm(
        t('confirm_discard', 'Discard Edit Studio changes? Your local edits will be lost.'),
        t('confirm_discard_title', 'Discard changes?')
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
    if (isConfirmOpen()) closeStudioConfirm(false);
    isOpen = false;
    currentDesign = null;
    eraseStroke = null;
    paintStroke = null;
    fillStroke = null;
    panDrag = null;
    hideBrushCursor();
    setPickedColor(null);
    ignoredColors = [];
    updateIgnoreSummaryUi();
    resetGenfillState();
    setSettingsLocked(false);
    clearHistory();
    resetZoom();
    closeChronik();
    closeBgModal();
    closeRecolorModal({ keepTool: true });
    closeIgnoreModal({ keepTool: true });
    closeToolOptionsModal();
    var genfillBar = $('ces-genfill-bar');
    if (genfillBar) genfillBar.setAttribute('hidden', '');
    showMaskOverlay(false);
    activePointers = {};
    pinchGesture = null;
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
      await showStudioAlert(t('no_design', 'No design selected.'));
      return;
    }
    currentDesign = design;
    isOpen = true;
    dirty = false;
    intensity = Number(($('ces-intensity') && $('ces-intensity').value) || 30);
    eraserSize = Number(($('ces-eraser-size') && $('ces-eraser-size').value) || 28);
    brushSize = Number(($('ces-brush-size') && $('ces-brush-size').value) || 28);
    genfillMarkerSize = Number(($('ces-genfill-marker-size') && $('ces-genfill-marker-size').value) || 48);
    setBrushColor({ r: 0, g: 0, b: 0 });
    ignoredColors = [];
    resetGenfillState();
    setSettingsLocked(false);
    updateIgnoreSummaryUi();
    updatePipetteFilterUi();
    try {
      sidebarRail = sessionStorage.getItem(SIDEBAR_RAIL_KEY) === '1';
    } catch (_) {
      sidebarRail = false;
    }
    drawerCollapsed = false;
    applySidebarUi();
    setActiveTool('pipette');
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
      await showStudioAlert((err && err.message) || t('image_load_failed', 'Could not load design image.'));
      closeStudio({ force: true });
      return;
    } finally {
      setBusy(false);
    }
  }

  function pointerCount() {
    var n = 0;
    for (var id in activePointers) {
      if (Object.prototype.hasOwnProperty.call(activePointers, id)) n++;
    }
    return n;
  }

  function pointerList() {
    var list = [];
    for (var id in activePointers) {
      if (Object.prototype.hasOwnProperty.call(activePointers, id)) {
        list.push(activePointers[id]);
      }
    }
    return list;
  }

  function beginPinchGesture() {
    var pts = pointerList();
    if (pts.length < 2) return false;
    if (eraseStroke) {
      if (eraseStroke.changed) {
        dirty = true;
        pushHistory(t('erase', 'Erase'));
      }
      eraseStroke = null;
    }
    if (paintStroke) {
      if (paintStroke.changed) {
        dirty = true;
        pushHistory(t('paint', 'Paint'));
      }
      paintStroke = null;
    }
    if (fillStroke) {
      fillStroke = null;
    }
    if (panDrag) {
      panDrag = null;
    }
    hideEraserBrush();
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (dist < 10) dist = 10;
    pinchGesture = {
      midX: midX,
      midY: midY,
      startDist: dist,
      startScale: zoom.scale,
      startX: zoom.x,
      startY: zoom.y
    };
    if (viewer) viewer.classList.add('is-panning');
    return true;
  }

  function updatePinchGesture() {
    if (!pinchGesture) return;
    var pts = pointerList();
    if (pts.length < 2) return;
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (dist < 10) dist = 10;
    var next = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, pinchGesture.startScale * (dist / pinchGesture.startDist))
    );
    var center = viewerCenter();
    if (next <= 1.001) {
      zoom.scale = 1;
      zoom.x = 0;
      zoom.y = 0;
    } else {
      var ox = (pinchGesture.midX - center.x - pinchGesture.startX) / (pinchGesture.startScale || 1);
      var oy = (pinchGesture.midY - center.y - pinchGesture.startY) / (pinchGesture.startScale || 1);
      zoom.scale = next;
      // Keep the content under the original pinch midpoint under the current midpoint
      // (also pans when both fingers move together).
      zoom.x = midX - center.x - ox * next;
      zoom.y = midY - center.y - oy * next;
    }
    applyZoomTransform();
    refreshEraserBrushSize();
  }

  function endPinchGesture() {
    if (!pinchGesture) return;
    pinchGesture = null;
    if (viewer && !panDrag) viewer.classList.remove('is-panning');
  }

  function panBy(dx, dy) {
    if (zoom.scale <= 1.001) return;
    zoom.x += dx;
    zoom.y += dy;
    applyZoomTransform();
  }

  function onWheel(e) {
    if (!isOpen || busy || settingsLocked || !viewer) return;
    // Trackpad pinch / ctrl+wheel → zoom toward pointer
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      var factor = Math.exp(-e.deltaY * 0.01);
      if (!isFinite(factor) || factor <= 0) {
        factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      }
      zoomTowardClient(e.clientX, e.clientY, zoom.scale * factor);
      return;
    }
    // Plain wheel / two-finger trackpad scroll → pan (when zoomed)
    if (zoom.scale <= 1.001) return;
    e.preventDefault();
    panBy(-e.deltaX, -e.deltaY);
  }

  function onPointerDown(e) {
    if (!isOpen || busy || settingsLocked || !viewer) return;
    if (e.target.closest && (
      e.target.closest('.ces-chrome-top-left') ||
      e.target.closest('.ces-chrome-top-right') ||
      e.target.closest('.ces-chrome-bottom-right') ||
      e.target.closest('.ces-overlay') ||
      e.target.closest('.ces-genfill-bar')
    )) return;

    activePointers[e.pointerId] = { x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse' };

    // Two-finger: pinch-zoom + pan (works even at 1× to zoom in)
    if (pointerCount() >= 2) {
      if (beginPinchGesture()) {
        e.preventDefault();
        return;
      }
    }

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

    // Touch + pipette: one-finger drag pans (sample still happens on tap below).
    if (
      (e.pointerType === 'touch' || e.pointerType === 'pen') &&
      activeTool === 'pipette' &&
      zoom.scale > 1.001 &&
      pointerCount() === 1
    ) {
      panDrag = {
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        startX: zoom.x,
        startY: zoom.y,
        soft: true,
        moved: false
      };
      try { viewer.setPointerCapture(e.pointerId); } catch (_) {}
    }

    if (activeTool === 'pipette') {
      if (!panDrag || !panDrag.soft) {
        var color = sampleColorAt(e.clientX, e.clientY);
        if (color) setPickedColor(color);
      } else {
        var tapColor = sampleColorAt(e.clientX, e.clientY);
        if (tapColor) setPickedColor(tapColor);
      }
      e.preventDefault();
      return;
    }

    if (activeTool === 'eraser') {
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
      return;
    }

    if (activeTool === 'brush') {
      var bpt = clientToCanvasPixel(e.clientX, e.clientY);
      if (!bpt) return;
      paintStroke = {
        pointerId: e.pointerId,
        lastX: bpt.x,
        lastY: bpt.y,
        changed: paintAtPoint(bpt.x, bpt.y, brushSize / 2)
      };
      try { viewer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      return;
    }

    if (activeTool === 'genfill' && genfillMarking) {
      var fpt = clientToCanvasPixel(e.clientX, e.clientY);
      if (!fpt) return;
      fillStroke = {
        pointerId: e.pointerId,
        lastX: fpt.x,
        lastY: fpt.y,
        changed: paintFillMarkerAt(fpt.x, fpt.y, genfillMarkerSize / 2)
      };
      try { viewer.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (!isOpen || busy) return;
    if (activePointers[e.pointerId]) {
      activePointers[e.pointerId].x = e.clientX;
      activePointers[e.pointerId].y = e.clientY;
    }

    if (pinchGesture && pointerCount() >= 2) {
      updatePinchGesture();
      e.preventDefault();
      return;
    }

    if (panDrag && panDrag.pointerId === e.pointerId) {
      var dx = e.clientX - panDrag.originX;
      var dy = e.clientY - panDrag.originY;
      if (panDrag.soft && !panDrag.moved) {
        if (Math.hypot(dx, dy) < 8) {
          updateEraserBrush(e.clientX, e.clientY);
          return;
        }
        panDrag.moved = true;
        viewer.classList.add('is-panning');
      }
      zoom.x = panDrag.startX + dx;
      zoom.y = panDrag.startY + dy;
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
      updateEraserBrush(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    if (paintStroke && paintStroke.pointerId === e.pointerId) {
      var ppt = clientToCanvasPixel(e.clientX, e.clientY);
      if (!ppt) return;
      paintAlongStroke(paintStroke.lastX, paintStroke.lastY, ppt.x, ppt.y, brushSize / 2);
      paintStroke.changed = true;
      paintStroke.lastX = ppt.x;
      paintStroke.lastY = ppt.y;
      updateEraserBrush(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    if (fillStroke && fillStroke.pointerId === e.pointerId) {
      var fpt2 = clientToCanvasPixel(e.clientX, e.clientY);
      if (!fpt2) return;
      paintFillAlongStroke(fillStroke.lastX, fillStroke.lastY, fpt2.x, fpt2.y, genfillMarkerSize / 2);
      fillStroke.changed = true;
      fillStroke.lastX = fpt2.x;
      fillStroke.lastY = fpt2.y;
      updateEraserBrush(e.clientX, e.clientY);
      e.preventDefault();
      return;
    }
    updateEraserBrush(e.clientX, e.clientY);
  }

  function onPointerLeaveViewer() {
    if (eraseStroke || paintStroke || fillStroke || panDrag || pinchGesture) return;
    hideBrushCursor();
  }

  async function onPointerUp(e) {
    delete activePointers[e.pointerId];
    if (pointerCount() < 2) endPinchGesture();

    if (panDrag && panDrag.pointerId === e.pointerId) {
      panDrag = null;
      if (viewer && !pinchGesture) viewer.classList.remove('is-panning');
      return;
    }
    if (eraseStroke && eraseStroke.pointerId === e.pointerId) {
      var changed = eraseStroke.changed;
      eraseStroke = null;
      if (changed) {
        dirty = true;
        await pushHistory(t('erase', 'Erase'));
      }
      return;
    }
    if (paintStroke && paintStroke.pointerId === e.pointerId) {
      var painted = paintStroke.changed;
      paintStroke = null;
      if (painted) {
        dirty = true;
        await pushHistory(t('paint', 'Paint'));
      }
      return;
    }
    if (fillStroke && fillStroke.pointerId === e.pointerId) {
      fillStroke = null;
    }
  }

  function bindOnce() {
    if (!root || root.__cesBound) return;
    root.__cesBound = true;

    var toggle = $('ces-sidebar-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        if (isMobileSidebar()) {
          setDrawerCollapsed(!drawerCollapsed);
        }
      });
    }

    var railBtn = $('ces-sidebar-rail-btn');
    if (railBtn) {
      railBtn.addEventListener('click', function () {
        if (isMobileSidebar()) return;
        var nextRail = !sidebarRail;
        setSidebarRail(nextRail);
        if (nextRail && TOOL_OPTION_KEYS[activeTool]) {
          // Wait out the sidebar width transition so the flyout anchors
          // to the settled rail position instead of the mid-collapse width.
          setTimeout(function () {
            if (sidebarRail && !isMobileSidebar()) openToolOptionsModal(activeTool);
          }, 190);
        }
      });
    }

    var toolOptsClose = $('ces-tool-options-close');
    if (toolOptsClose) {
      toolOptsClose.addEventListener('click', function () { closeToolOptionsModal(); });
    }
    var toolOptsDone = $('ces-tool-options-done');
    if (toolOptsDone) {
      toolOptsDone.addEventListener('click', function () { closeToolOptionsModal(); });
    }
    if (typeof window.matchMedia === 'function') {
      var mq = window.matchMedia('(max-width: 720px)');
      var onMq = function () { applySidebarUi(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
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
        refreshEraserBrushSize();
      });
    }
    var brushSizeEl = $('ces-brush-size');
    if (brushSizeEl) {
      brushSizeEl.addEventListener('input', function () {
        brushSize = Number(brushSizeEl.value) || 28;
        refreshEraserBrushSize();
      });
    }
    var genfillSizeEl = $('ces-genfill-marker-size');
    if (genfillSizeEl) {
      genfillSizeEl.addEventListener('input', function () {
        genfillMarkerSize = Number(genfillSizeEl.value) || 48;
        refreshEraserBrushSize();
      });
    }
    var genfillSetArea = $('ces-genfill-set-area');
    if (genfillSetArea) {
      genfillSetArea.addEventListener('click', function () {
        genfillMarking = true;
        updateGenfillUi();
      });
    }
    var genfillClear = $('ces-genfill-clear');
    if (genfillClear) {
      genfillClear.addEventListener('click', function () {
        clearGenfillMask();
      });
    }
    var genfillGenerate = $('ces-genfill-generate');
    if (genfillGenerate) {
      genfillGenerate.addEventListener('click', function () { runGenerativeFill(); });
    }
    var genfillApply = $('ces-genfill-apply');
    if (genfillApply) {
      genfillApply.addEventListener('click', function () { applyGenerativeFill(); });
    }
    var brushPicker = $('ces-brush-picker');
    if (brushPicker) {
      brushPicker.addEventListener('input', function () {
        var rgb = hexToRgb(brushPicker.value);
        if (rgb) setBrushColor(rgb);
      });
    }
    var colorClear = $('ces-color-clear');
    if (colorClear) {
      colorClear.addEventListener('click', function () {
        clearPickedColor();
      });
    }
    var colorSwatch = $('ces-color-swatch');
    if (colorSwatch) {
      colorSwatch.addEventListener('click', function () {
        if (pickedColor) clearPickedColor();
      });
      colorSwatch.style.cursor = 'pointer';
      colorSwatch.title = t('clear_color', 'Clear color filter');
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
    var zoomReset = $('ces-zoom-reset');
    var panToggle = $('ces-pan-toggle');
    if (zoomIn) zoomIn.addEventListener('click', function () { setZoom(zoom.scale + ZOOM_STEP); });
    if (zoomOut) zoomOut.addEventListener('click', function () { setZoom(zoom.scale - ZOOM_STEP); });
    if (zoomReset) zoomReset.addEventListener('click', function () { resetZoom(); });
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

    var recolorClose = $('ces-recolor-close');
    var recolorCancel = $('ces-recolor-cancel');
    var recolorApply = $('ces-recolor-apply');
    var recolorPicker = $('ces-recolor-picker');
    var recolorOverlay = $('ces-recolor-overlay');
    if (recolorClose) recolorClose.addEventListener('click', function () { closeRecolorModal(); });
    if (recolorCancel) recolorCancel.addEventListener('click', function () { closeRecolorModal(); });
    if (recolorApply) recolorApply.addEventListener('click', function () { applyRecolor(); });
    if (recolorPicker) {
      recolorPicker.addEventListener('input', function () {
        var rgb = hexToRgb(recolorPicker.value);
        if (rgb) setRecolorTarget(rgb);
      });
      recolorPicker.addEventListener('change', function () {
        var rgb = hexToRgb(recolorPicker.value);
        if (rgb) setRecolorTarget(rgb);
      });
    }
    if (recolorOverlay) {
      recolorOverlay.addEventListener('click', function (e) {
        if (e.target === recolorOverlay) closeRecolorModal();
      });
    }

    var ignoreClose = $('ces-ignore-close');
    var ignoreDone = $('ces-ignore-done');
    var ignoreClear = $('ces-ignore-clear');
    var ignoreOverlay = $('ces-ignore-overlay');
    if (ignoreClose) ignoreClose.addEventListener('click', function () { closeIgnoreModal(); });
    if (ignoreDone) ignoreDone.addEventListener('click', function () { closeIgnoreModal(); });
    if (ignoreClear) ignoreClear.addEventListener('click', function () { clearIgnoredColors(); });
    if (ignoreOverlay) {
      ignoreOverlay.addEventListener('click', function (e) {
        if (e.target === ignoreOverlay) closeIgnoreModal();
      });
    }

    var saveBtn = $('ces-btn-save');
    var saveCopyBtn = $('ces-btn-save-copy');
    var discardBtn = $('ces-btn-discard');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveStudio(); });
    if (saveCopyBtn) saveCopyBtn.addEventListener('click', function () { saveStudioCopy(); });
    if (discardBtn) discardBtn.addEventListener('click', discardStudio);

    if (viewer) {
      viewer.addEventListener('pointerdown', onPointerDown);
      viewer.addEventListener('pointermove', onPointerMove);
      viewer.addEventListener('pointerup', onPointerUp);
      viewer.addEventListener('pointercancel', onPointerUp);
      viewer.addEventListener('pointerleave', onPointerLeaveViewer);
      viewer.addEventListener('wheel', onWheel, { passive: false });
    }

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isConfirmOpen()) {
          // Confirm overlay owns Escape (capture handler); do not discard studio.
          return;
        }
        var toolFlyout = $('ces-tool-options-overlay');
        var chronik = $('ces-chronik-overlay');
        var bg = $('ces-bg-overlay');
        var recolor = $('ces-recolor-overlay');
        var ignore = $('ces-ignore-overlay');
        if (toolFlyout && !toolFlyout.hasAttribute('hidden')) {
          closeToolOptionsModal();
          e.preventDefault();
          return;
        }
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
        if (recolor && !recolor.hasAttribute('hidden')) {
          closeRecolorModal();
          e.preventDefault();
          return;
        }
        if (ignore && !ignore.hasAttribute('hidden')) {
          closeIgnoreModal();
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
    maskCanvas = $('ces-mask-canvas');
    designBackdrop = $('ces-design-backdrop');
    viewer = $('ces-viewer');
    stage = $('ces-zoom-stage');
    busyEl = $('ces-busy');
    brushEl = $('ces-eraser-brush');
    if (canvas && !ctx) {
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (maskCanvas && !maskCtx) {
      maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    }
    ensureCanvasResizeObserver();
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
