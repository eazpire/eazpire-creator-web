/**
 * Creator Design Preview Modal
 * Modal für die Vorschau und Verwaltung von gespeicherten Designs
 * Wird beim Klick auf das Design-Bild im Design Modal geöffnet
 */

(function() {
  'use strict';

  console.log('CreatorDesignPreviewModal script starting...');

  const sectionId = 'design-preview';
  function toEnglishUiText(text) {
    if (!text || typeof text !== 'string') return text;
    var out = text;
    var replacements = [
      [/Fehler beim Laden/g, 'Error loading'],
      [/Fehler beim Speichern/g, 'Error saving'],
      [/Fehler beim Löschen/g, 'Error deleting'],
      [/Fehler beim Übertragen/g, 'Error transferring'],
      [/Fehler beim Croppen/g, 'Error cropping'],
      [/Unbekannter Fehler/g, 'Unknown error'],
      [/Löschen fehlgeschlagen/g, 'Delete failed'],
      [/Öffentlich/g, 'Public'],
      [/Privat/g, 'Private'],
      [/Möchtest du die Änderungen speichern\?/g, 'Do you want to save the changes?'],
      [/Abbrechen/g, 'Cancel'],
      [/Speichern/g, 'Save'],
      [/Schließen/g, 'Close'],
      [/Wird gelöscht\.\.\./g, 'Deleting...']
    ];
    for (var i = 0; i < replacements.length; i++) out = out.replace(replacements[i][0], replacements[i][1]);
    return out;
  }
  const __nativeAlert = window.alert ? window.alert.bind(window) : function() {};
  const __nativeConfirm = window.confirm ? window.confirm.bind(window) : function() { return false; };
  const alert = function(message) { __nativeAlert(toEnglishUiText(message)); };
  const confirm = function(message) { return __nativeConfirm(toEnglishUiText(message)); };

  /** If DB blob mixes system instructions + generation prompt, take text after the last clear marker. */
  function extractTailAfterUserPromptMarker(text) {
    if (!text || typeof text !== 'string') return '';
    var lower = text.toLowerCase();
    var markers = ['user prompt:', 'benutzeraufforderung:', 'benutzer-prompt:', 'nutzer-prompt:'];
    var bestIdx = -1;
    var bestLen = 0;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      var idx = lower.lastIndexOf(m);
      if (idx > bestIdx) {
        bestIdx = idx;
        bestLen = m.length;
      }
    }
    if (bestIdx < 0) return text.trim();
    var tail = text.slice(bestIdx + bestLen).trim();
    return tail || text.trim();
  }

  function pickEffectiveImagePrompt(metadata, design) {
    var m = metadata || {};
    var d = design || {};
    function pick(v) {
      if (v == null) return '';
      var s = String(v).trim();
      return s || '';
    }
    var raw =
      pick(m.final_prompt) ||
      pick(m.effective_prompt) ||
      pick(d.final_prompt) ||
      pick(d.effective_prompt) ||
      pick(m.design_prompt) ||
      pick(d.prompt);
    if (!raw) return '';
    var tail = extractTailAfterUserPromptMarker(raw);
    return tail.length < raw.length ? tail : raw;
  }

  const CREATOR_DISPATCH_FALLBACK = 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';

  /** Ring buffer for crop debugging (DevTools: `copy(__EAZ_CROP_DEBUG_EXPORT())`). */
  var CROP_DEBUG_RING_MAX = 80;
  function eazCropDebugPush(entry) {
    try {
      if (!window.__EAZ_CROP_DEBUG) window.__EAZ_CROP_DEBUG = [];
      var row = Object.assign({ t: Date.now(), iso: new Date().toISOString() }, entry);
      window.__EAZ_CROP_DEBUG.push(row);
      while (window.__EAZ_CROP_DEBUG.length > CROP_DEBUG_RING_MAX) window.__EAZ_CROP_DEBUG.shift();
    } catch (_) {}
  }
  window.__EAZ_CROP_DEBUG_EXPORT = function () {
    try {
      return JSON.stringify(window.__EAZ_CROP_DEBUG || [], null, 2);
    } catch (e) {
      return String(e);
    }
  };
  window.__EAZ_CROP_DEBUG_CLEAR = function () {
    window.__EAZ_CROP_DEBUG = [];
  };

  /** Normalize so we never produce …/apps/creator-dispatch/apps/creator-dispatch. */
  function toCreatorDispatchEndpoint(maybeBaseOrDispatch) {
    var raw = String(maybeBaseOrDispatch || '').split('?')[0].trim().replace(/\/+$/, '');
    if (!raw) return '';
    if (/\/apps\/creator-dispatch$/i.test(raw)) return raw;
    return raw + '/apps/creator-dispatch';
  }

  function resolveCreatorDispatchBase() {
    var cfg = window.CREATOR_API_CONFIG || {};
    if (typeof cfg.getDispatchUrl === 'function') {
      try {
        var u = cfg.getDispatchUrl();
        if (u) return u;
      } catch (_) {}
    }
    // Do not force __eaz on www: CreatorWidget/listJobs use api_dispatch or creator-engine.workers.dev (see creator-widget.core.js).
    // Same-origin __eaz was returning Shopify HTML 503 when the edge route was not the tunnel worker.
    var w = window.CreatorWidget && window.CreatorWidget.apiBaseUrl;
    if (w) {
      var s = String(w).split('?')[0].trim();
      if (/^https?:\/\//i.test(s)) return s;
    }
    if (cfg.BASE_URL) return toCreatorDispatchEndpoint(String(cfg.BASE_URL).trim());
    return CREATOR_DISPATCH_FALLBACK;
  }

  function buildCropDispatchCandidates() {
    var out = [];
    function pushUnique(url) {
      if (!url) return;
      var u = String(url).trim();
      if (!u) return;
      if (out.indexOf(u) >= 0) return;
      out.push(u);
    }
    var origin = '';
    var onEazStorefront = false;
    try {
      if (window.location && window.location.origin) {
        origin = window.location.origin.replace(/\/$/, '');
        var hn = (window.location.hostname || '').toLowerCase();
        onEazStorefront = hn === 'www.eazpire.com' || hn === 'eazpire.com';
      }
    } catch (_) {}
    var cfg = window.CREATOR_API_CONFIG || {};
    var engineRoot = String(
      cfg.BASE_URL || CREATOR_DISPATCH_FALLBACK.replace(/\/apps\/creator-dispatch$/i, '')
    )
      .split('?')[0]
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/apps\/creator-dispatch$/i, '');
    /* On production storefront, never use __eaz/creator-dispatch for crop: it often hits Shopify (HTML 503).
       Use a fixed order — do not insert resolveCreatorDispatchBase() (may be __eaz). */
    if (onEazStorefront && origin) {
      pushUnique(origin + '/api/eaz-crop-design');
      pushUnique(toCreatorDispatchEndpoint(engineRoot));
      pushUnique(CREATOR_DISPATCH_FALLBACK);
      try {
        var w = window.CreatorWidget && window.CreatorWidget.apiBaseUrl;
        if (w) {
          var wb = String(w).split('?')[0].trim().replace(/\/+$/, '');
          if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(wb)) {
            pushUnique(toCreatorDispatchEndpoint(wb));
          }
        }
      } catch (_) {}
      pushUnique(origin + '/apps/creator-dispatch');
      return out;
    }
    if (origin) {
      pushUnique(origin + '/api/eaz-crop-design');
      pushUnique(toCreatorDispatchEndpoint(engineRoot));
    }
    pushUnique(resolveCreatorDispatchBase());
    try {
      if (origin) {
        pushUnique(origin + '/__eaz/creator-dispatch');
        pushUnique(origin + '/api/eaz-crop-design');
        pushUnique(origin + '/apps/creator-dispatch');
      }
    } catch (_) {}
    if (cfg.BASE_URL) {
      pushUnique(toCreatorDispatchEndpoint(cfg.BASE_URL));
    }
    pushUnique(CREATOR_DISPATCH_FALLBACK);
    return out;
  }

  function setPromptBoxContent(el, text) {
    if (!el) return;
    var v = text || '–';
    if (el.tagName === 'TEXTAREA') el.value = v;
    else el.textContent = v;
    if (el.classList) el.classList.toggle('cdp-modal__value--empty', !text);
  }

  // Export API immediately - ensure it exists before any initialization
  // This will be replaced with real implementation below, but ensures API exists immediately
  window.CreatorDesignPreviewModal = window.CreatorDesignPreviewModal || {};
  
  console.log('CreatorDesignPreviewModal API placeholder created', window.CreatorDesignPreviewModal);

  // Modal state
  let modal = null;
  let modalTitle = null;
  let modalClose = null;
  let modalImage = null;
  let modalImageMobile = null;
  let modalImageMobileUploaded = null;
  let modalUserImageWrapper = null;
  let modalUserImageWrapperMobile = null;
  let modalUserImage = null;
  let modalUserImageMobile = null;
  let modalDesignPrompt = null;
  let modalDesignPromptMobile = null;
  let modalUserPrompt = null;
  let modalUserPromptMobile = null;
  let btnRemix = null;
  let btnSimilar = null;
  let btnTransfer = null;
  let btnDownload = null;
  let btnSave = null;
  let btnDelete = null;
  let btnCrop = null;
  let currentDesign = null;
  let originalVisibility = null; // Original visibility when modal opens
  let currentVisibility = null; // Current visibility (may differ from original if changed)
  let hasUnsavedChanges = false; // Track if there are unsaved changes
  let isSaving = false; // Track if save is in progress
  let isInitialized = false;

  /** Manual crop overlay (pixel rect in natural coordinates of the crop-session image). */
  let manualCropActive = false;
  let manualCropRect = null;
  /** naturalWidth/Height of the image the user adjusted (crop-session URL). */
  let manualCropUiNaturalW = 0;
  let manualCropUiNaturalH = 0;
  let manualCropDrag = null;
  let manualCropResizeObserver = null;
  let manualCropDocListenersBound = false;

  const MANUAL_CROP_MIN_NATURAL = 16;
  
  // User image text elements
  let modalUserImageText = null;
  let modalUserImageTextMobile = null;
  
  // Visibility switch
  let modalVisibilitySwitch = null;
  let modalVisibilitySwitchLeft = null; // Desktop: linke Spalte
  let modalVisibilitySwitchMobile = null;
  
  // Carousel state
  let modalCarousel = null;
  let modalCarouselSlides = null;
  let modalCarouselDots = null;
  let currentCarouselSlide = 0;
  
  // Layout containers
  let modalDesktopRight = null;
  let modalMobileGenerated = null;
  let modalMobileUploaded = null;

  let cropBusyOverlay = null;
  let cropToast = null;
  let cropToastTextEl = null;
  let cropToastHideTimer = null;

  // Get modal element
  function getModal() {
    if (!modal) {
      modal = document.getElementById('creatorDesignPreviewModal-design-preview');
    }
    return modal;
  }

  // Get all DOM elements
  function getDOMElements() {
    modal = getModal();
    if (!modal) {
      console.warn('CreatorDesignPreviewModal: Modal element not found');
      return false;
    }

    modalTitle = document.getElementById('cdp-modal-title-' + sectionId);
    modalClose = document.getElementById('cdp-modal-close-' + sectionId);
    modalImage = document.getElementById('cdp-modal-image-' + sectionId);
    modalImageMobile = document.getElementById('cdp-modal-image-mobile-' + sectionId);
    modalImageMobileUploaded = document.getElementById('cdp-modal-image-mobile-uploaded-' + sectionId);
    modalUserImageWrapper = document.getElementById('cdp-user-image-wrapper-' + sectionId);
    modalUserImageWrapperMobile = document.getElementById('cdp-user-image-wrapper-mobile-' + sectionId);
    modalUserImage = document.getElementById('cdp-user-image-' + sectionId);
    modalUserImageMobile = document.getElementById('cdp-user-image-mobile-' + sectionId);
    modalUserImageText = document.getElementById('cdp-user-image-text-' + sectionId);
    modalUserImageTextMobile = document.getElementById('cdp-user-image-text-mobile-' + sectionId);
    modalDesignPrompt = document.getElementById('cdp-design-prompt-' + sectionId);
    modalDesignPromptMobile = document.getElementById('cdp-design-prompt-mobile-' + sectionId);
    modalUserPrompt = document.getElementById('cdp-user-prompt-' + sectionId);
    modalUserPromptMobile = document.getElementById('cdp-user-prompt-mobile-' + sectionId);
    btnRemix = document.getElementById('cdp-btn-remix-' + sectionId);
    btnSimilar = document.getElementById('cdp-btn-similar-' + sectionId);
    btnTransfer = document.getElementById('cdp-btn-transfer-' + sectionId);
    btnDownload = document.getElementById('cdp-btn-download-' + sectionId);
    btnSave = document.getElementById('cdp-btn-save-' + sectionId);
    btnDelete = document.getElementById('cdp-btn-delete-' + sectionId);
    btnCrop = document.getElementById('cdp-btn-crop-' + sectionId);
    modalVisibilitySwitch = document.getElementById('cdp-visibility-switch-' + sectionId);
    modalVisibilitySwitchLeft = document.getElementById('cdp-visibility-switch-left-' + sectionId);
    modalVisibilitySwitchMobile = document.getElementById('cdp-visibility-switch-mobile-slide1-' + sectionId);
    
    // Carousel elements
    modalCarousel = modal?.querySelector('.cdp-modal__carousel');
    modalCarouselSlides = modal ? Array.from(modal.querySelectorAll('.cdp-modal__carousel-slide')) : [];
    modalCarouselDots = modal ? Array.from(modal.querySelectorAll('.cdp-modal__carousel-dot')) : [];
    
    // Layout containers
    modalDesktopRight = modal?.querySelector('.cdp-modal__desktop-right');
    modalMobileGenerated = modal?.querySelector('.cdp-modal__mobile-container--generated');
    modalMobileUploaded = modal?.querySelector('.cdp-modal__mobile-container--uploaded');

    cropBusyOverlay = document.getElementById('cdp-crop-busy-' + sectionId);
    cropToast = document.getElementById('cdp-crop-toast-' + sectionId);
    cropToastTextEl = cropToast ? cropToast.querySelector('.cdp-modal__crop-toast-text') : null;

    return true;
  }

  function cacheBustSrc(url) {
    if (!url || typeof url !== 'string') return '';
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'v=' + Date.now();
  }

  /** If crop API returned /file/ URLs on the shop host, rewrite to creator worker (fixes 404 on preview). */
  function normalizePersistedFileUrl(url) {
    if (!url || typeof url !== 'string') return url;
    var s = url.trim();
    if (!s) return s;
    try {
      var u = new URL(s, window.location.href);
      var hn = u.hostname.toLowerCase();
      if (
        u.pathname.indexOf('/file/') === 0 &&
        (hn === 'www.eazpire.com' || hn === 'eazpire.com' || hn.indexOf('.myshopify.com') > 0)
      ) {
        return 'https://creator-engine.eazpire.workers.dev' + u.pathname + u.search + u.hash;
      }
    } catch (_) {}
    return s;
  }

  /** Match grid / updateDesignInfo: preview thumbnail first, then fallbacks. */
  function primaryDesignImageUrl(design) {
    if (!design) return '';
    return design.preview_url || design.image_url || design.original_url || '';
  }

  function refreshModalDesignImagesAfterCrop() {
    var raw = primaryDesignImageUrl(currentDesign);
    var url = cacheBustSrc(normalizePersistedFileUrl(raw));
    if (!url) return;
    if (modalImage) modalImage.src = url;
    if (modalImageMobile) modalImageMobile.src = url;
    if (modalImageMobileUploaded) modalImageMobileUploaded.src = url;
  }

  function setCropBusyVisible(show) {
    getDOMElements();
    if (!cropBusyOverlay) return;
    if (show) {
      cropBusyOverlay.removeAttribute('hidden');
      cropBusyOverlay.setAttribute('aria-hidden', 'false');
      cropBusyOverlay.classList.add('cdp-modal__crop-busy--visible');
    } else {
      cropBusyOverlay.setAttribute('hidden', '');
      cropBusyOverlay.setAttribute('aria-hidden', 'true');
      cropBusyOverlay.classList.remove('cdp-modal__crop-busy--visible');
    }
    var shell = modal && modal.querySelector('.cdp-modal');
    if (shell) {
      shell.classList.toggle('cdp-modal--crop-busy', !!show);
    }
  }

  function showCropSuccessToast(message) {
    getDOMElements();
    if (!cropToast || !cropToastTextEl) return;
    if (cropToastHideTimer) {
      clearTimeout(cropToastHideTimer);
      cropToastHideTimer = null;
    }
    cropToastTextEl.textContent = message || previewModalCropStrings().savedMsg;
    cropToast.removeAttribute('hidden');
    cropToast.setAttribute('aria-hidden', 'false');
    cropToast.classList.remove('cdp-modal__crop-toast--show');
    void cropToast.offsetWidth;
    cropToast.classList.add('cdp-modal__crop-toast--show');
    cropToastHideTimer = setTimeout(function () {
      cropToast.classList.remove('cdp-modal__crop-toast--show');
      cropToast.setAttribute('hidden', '');
      cropToast.setAttribute('aria-hidden', 'true');
      cropToastHideTimer = null;
    }, 3200);
  }

  function previewModalCropStrings() {
    var m = getModal();
    var d = (m && m.dataset) || {};
    return {
      enterTitle: d.manualCropEnter || 'Adjust crop area',
      saveTitle: d.manualCropSave || 'Apply crop and overwrite design',
      savedMsg: d.manualCropSaved || 'Design cropped successfully.',
    };
  }

  function cropSourceUrlForSession(design) {
    if (!design) return '';
    // Server crop-design reads r2_key_original (full-size PNG). Preview is often WebP from the pre-upscale
    // crop — different pixel dimensions. Cropping must use original_url so coordinates match the worker.
    if (design.id && !design.original_url && (design.preview_url || design.image_url)) {
      console.warn(
        '[CDP] Saved design has no original_url; crop uses preview/image — may not match server crop space.',
        { id: design.id, job_id: design.job_id }
      );
    }
    return design.original_url || design.preview_url || design.image_url || '';
  }

  function revertModalImagesToPrimaryPreview() {
    var url = primaryDesignImageUrl(currentDesign);
    if (!url) return;
    if (modalImage) modalImage.src = url;
    if (modalImageMobile) modalImageMobile.src = url;
    if (modalImageMobileUploaded) modalImageMobileUploaded.src = url;
  }

  function pushImagesForManualCropSession() {
    var url = cropSourceUrlForSession(currentDesign);
    if (!url) return false;
    var busted = cacheBustSrc(url);
    if (modalImage) modalImage.src = busted;
    if (modalImageMobile) modalImageMobile.src = busted;
    if (modalImageMobileUploaded) modalImageMobileUploaded.src = busted;
    return true;
  }

  function resolveServerCropDimensions(design) {
    if (!design) return { w: 0, h: 0 };
    var w = design.width != null && design.width !== '' ? Number(design.width) : 0;
    var h = design.height != null && design.height !== '' ? Number(design.height) : 0;
    return {
      w: isFinite(w) && w > 0 ? Math.round(w) : 0,
      h: isFinite(h) && h > 0 ? Math.round(h) : 0,
    };
  }

  /**
   * Map UI crop rect (browser natural pixels of crop-session image) to server PNG space
   * (r2_key_original — often larger than preview WebP shown in the grid).
   */
  function manualCropRectForServer(rect, uiW, uiH, serverW, serverH) {
    if (!rect) return null;
    var uw = uiW > 0 ? uiW : 0;
    var uh = uiH > 0 ? uiH : 0;
    var sw = serverW > 0 ? serverW : uw;
    var sh = serverH > 0 ? serverH : uh;
    if (!uw || !uh || !sw || !sh) return rect;
    if (Math.abs(uw - sw) <= 2 && Math.abs(uh - sh) <= 2) return rect;
    console.warn('[CDP] Scaling manual crop UI → server PNG space', {
      ui: { w: uw, h: uh },
      server: { w: sw, h: sh },
      before: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    });
    var scaled = clampNaturalRect(
      {
        x: rect.x * (sw / uw),
        y: rect.y * (sh / uh),
        w: rect.w * (sw / uw),
        h: rect.h * (sh / uh),
      },
      sw,
      sh
    );
    console.warn('[CDP] Scaled manual crop rect', { after: scaled });
    return scaled;
  }

  function setCropButtonsSaveMode(saveMode) {
    if (!modal) return;
    var t = previewModalCropStrings();
    modal.querySelectorAll('.cdp-modal__crop-btn').forEach(function (btn) {
      btn.classList.toggle('cdp-modal__crop-btn--save-mode', !!saveMode);
      btn.setAttribute('aria-label', saveMode ? t.saveTitle : t.enterTitle);
      btn.setAttribute('title', saveMode ? t.saveTitle : t.enterTitle);
    });
  }

  function clampNaturalRect(r, iw, ih) {
    var MIN = MANUAL_CROP_MIN_NATURAL;
    var x = Math.round(r.x);
    var y = Math.round(r.y);
    var w = Math.round(r.w);
    var h = Math.round(r.h);
    x = Math.max(0, Math.min(x, iw - MIN));
    y = Math.max(0, Math.min(y, ih - MIN));
    w = Math.max(MIN, Math.min(w, iw - x));
    h = Math.max(MIN, Math.min(h, ih - y));
    return { x: x, y: y, w: w, h: h };
  }

  /**
   * Map between element coordinates and natural pixels for <img>, respecting object-fit
   * (the modal preview uses object-fit: contain; letterboxing broke the old linear map).
   */
  function getImageFitLayout(img) {
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    var rect = img.getBoundingClientRect();
    var ew = rect.width;
    var eh = rect.height;
    if (!nw || !nh || ew < 1 || eh < 1) return null;
    var fit = 'fill';
    try {
      if (typeof getComputedStyle !== 'undefined') {
        fit = getComputedStyle(img).objectFit || 'fill';
      }
    } catch (_) {}
    if (fit === 'scale-down') {
      var c = Math.min(ew / nw, eh / nh);
      fit = c < 1 ? 'contain' : 'none';
    }
    if (fit === 'none') {
      return {
        nw: nw,
        nh: nh,
        ew: ew,
        eh: eh,
        fit: fit,
        uniform: true,
        scale: 1,
        offsetX: (ew - nw) / 2,
        offsetY: (eh - nh) / 2,
        drawnW: nw,
        drawnH: nh,
      };
    }
    if (fit === 'fill') {
      return {
        nw: nw,
        nh: nh,
        ew: ew,
        eh: eh,
        fit: fit,
        uniform: false,
        scaleX: nw / ew,
        scaleY: nh / eh,
      };
    }
    var isCover = fit === 'cover';
    var s = isCover ? Math.max(ew / nw, eh / nh) : Math.min(ew / nw, eh / nh);
    var W = nw * s;
    var H = nh * s;
    return {
      nw: nw,
      nh: nh,
      ew: ew,
      eh: eh,
      fit: fit,
      uniform: true,
      scale: s,
      offsetX: (ew - W) / 2,
      offsetY: (eh - H) / 2,
      drawnW: W,
      drawnH: H,
    };
  }

  function pointerToNatural(img, clientX, clientY) {
    if (!img || !img.naturalWidth) return null;
    var L = getImageFitLayout(img);
    if (!L) return null;
    var rect = img.getBoundingClientRect();
    var ex = clientX - rect.left;
    var ey = clientY - rect.top;
    if (!L.uniform) {
      return { px: ex * L.scaleX, py: ey * L.scaleY };
    }
    var lx = ex - L.offsetX;
    var ly = ey - L.offsetY;
    return { px: lx / L.scale, py: ly / L.scale };
  }

  function applyManualCropResize(px, py, drag) {
    var MIN = MANUAL_CROP_MIN_NATURAL;
    var iw = drag.iw;
    var ih = drag.ih;
    var x;
    var y;
    var w;
    var h;
    switch (drag.handle) {
      case 'nw': {
        var fr = drag.fixed.right;
        var fb = drag.fixed.bottom;
        var nl = Math.min(px, fr - MIN);
        var nt = Math.min(py, fb - MIN);
        nl = Math.max(0, nl);
        nt = Math.max(0, nt);
        x = nl;
        y = nt;
        w = fr - nl;
        h = fb - nt;
        break;
      }
      case 'ne': {
        var fl = drag.fixed.left;
        var fb2 = drag.fixed.bottom;
        var nr = Math.max(px, fl + MIN);
        var nt2 = Math.min(py, fb2 - MIN);
        nt2 = Math.max(0, nt2);
        nr = Math.min(iw, nr);
        x = fl;
        y = nt2;
        w = nr - fl;
        h = fb2 - nt2;
        break;
      }
      case 'sw': {
        var fr2 = drag.fixed.right;
        var ft = drag.fixed.top;
        var nl2 = Math.min(px, fr2 - MIN);
        var nb = Math.max(py, ft + MIN);
        nl2 = Math.max(0, nl2);
        nb = Math.min(ih, nb);
        x = nl2;
        y = ft;
        w = fr2 - nl2;
        h = nb - ft;
        break;
      }
      case 'se': {
        var fl2 = drag.fixed.left;
        var ft2 = drag.fixed.top;
        var nr2 = Math.max(px, fl2 + MIN);
        var nb2 = Math.max(py, ft2 + MIN);
        nr2 = Math.min(iw, nr2);
        nb2 = Math.min(ih, nb2);
        x = fl2;
        y = ft2;
        w = nr2 - fl2;
        h = nb2 - ft2;
        break;
      }
      case 'n': {
        var ftNBottom = drag.fixed.bottom;
        var nyTop = Math.min(py, ftNBottom - MIN);
        nyTop = Math.max(0, nyTop);
        x = drag.fixed.left;
        y = nyTop;
        w = drag.fixed.right - drag.fixed.left;
        h = ftNBottom - nyTop;
        break;
      }
      case 's': {
        var ftSTop = drag.fixed.top;
        var nyBottom = Math.max(py, ftSTop + MIN);
        nyBottom = Math.min(ih, nyBottom);
        x = drag.fixed.left;
        y = ftSTop;
        w = drag.fixed.right - drag.fixed.left;
        h = nyBottom - ftSTop;
        break;
      }
      case 'w': {
        var ftWRight = drag.fixed.right;
        var nxLeft = Math.min(px, ftWRight - MIN);
        nxLeft = Math.max(0, nxLeft);
        x = nxLeft;
        y = drag.fixed.top;
        w = ftWRight - nxLeft;
        h = drag.fixed.bottom - drag.fixed.top;
        break;
      }
      case 'e': {
        var ftELeft = drag.fixed.left;
        var nxRight = Math.max(px, ftELeft + MIN);
        nxRight = Math.min(iw, nxRight);
        x = ftELeft;
        y = drag.fixed.top;
        w = nxRight - ftELeft;
        h = drag.fixed.bottom - drag.fixed.top;
        break;
      }
      default:
        return;
    }
    manualCropRect = clampNaturalRect({ x: x, y: y, w: w, h: h }, iw, ih);
  }

  function displayRectForNatural(img, r) {
    var frame = img.closest('.cdp-modal__image-frame');
    var L = getImageFitLayout(img);
    if (!frame || !L) return null;
    var imgRect = img.getBoundingClientRect();
    var frameRect = frame.getBoundingClientRect();
    if (!L.uniform) {
      return {
        imageLeft: imgRect.left - frameRect.left,
        imageTop: imgRect.top - frameRect.top,
        imageWidth: imgRect.width,
        imageHeight: imgRect.height,
        cropLeft: r.x / L.scaleX,
        cropTop: r.y / L.scaleY,
        cropWidth: r.w / L.scaleX,
        cropHeight: r.h / L.scaleY,
      };
    }
    return {
      imageLeft: imgRect.left - frameRect.left + L.offsetX,
      imageTop: imgRect.top - frameRect.top + L.offsetY,
      imageWidth: L.drawnW,
      imageHeight: L.drawnH,
      cropLeft: (r.x / L.nw) * L.drawnW,
      cropTop: (r.y / L.nh) * L.drawnH,
      cropWidth: (r.w / L.nw) * L.drawnW,
      cropHeight: (r.h / L.nh) * L.drawnH,
    };
  }

  function applyLayerLayout(layer, disp, frame) {
    if (!layer || !disp || !frame) return;
    layer.removeAttribute('hidden');
    layer.classList.add('cdp-manual-crop-layer--active');
    layer.setAttribute('aria-hidden', 'false');
    var inner = layer.querySelector('.cdp-manual-crop-inner');
    var topEl = layer.querySelector('.cdp-manual-crop-shade[data-band="top"]');
    var leftEl = layer.querySelector('.cdp-manual-crop-shade[data-band="left"]');
    var rightEl = layer.querySelector('.cdp-manual-crop-shade[data-band="right"]');
    var bottomEl = layer.querySelector('.cdp-manual-crop-shade[data-band="bottom"]');
    layer.style.left = disp.imageLeft + 'px';
    layer.style.top = disp.imageTop + 'px';
    layer.style.width = disp.imageWidth + 'px';
    layer.style.height = disp.imageHeight + 'px';
    layer.style.right = 'auto';
    layer.style.bottom = 'auto';
    layer.style.inset = 'auto';
    if (inner) {
      inner.style.left = disp.cropLeft + 'px';
      inner.style.top = disp.cropTop + 'px';
      inner.style.width = disp.cropWidth + 'px';
      inner.style.height = disp.cropHeight + 'px';
    }
    var fw = disp.imageWidth;
    var fh = disp.imageHeight;
    var l = disp.cropLeft;
    var t = disp.cropTop;
    var w = disp.cropWidth;
    var h = disp.cropHeight;
    if (topEl) {
      topEl.style.left = '0';
      topEl.style.top = '0';
      topEl.style.width = fw + 'px';
      topEl.style.height = Math.max(0, t) + 'px';
    }
    if (bottomEl) {
      bottomEl.style.left = '0';
      bottomEl.style.top = t + h + 'px';
      bottomEl.style.width = fw + 'px';
      bottomEl.style.height = Math.max(0, fh - t - h) + 'px';
    }
    if (leftEl) {
      leftEl.style.left = '0';
      leftEl.style.top = t + 'px';
      leftEl.style.width = Math.max(0, l) + 'px';
      leftEl.style.height = Math.max(0, h) + 'px';
    }
    if (rightEl) {
      rightEl.style.left = l + w + 'px';
      rightEl.style.top = t + 'px';
      rightEl.style.width = Math.max(0, fw - l - w) + 'px';
      rightEl.style.height = Math.max(0, h) + 'px';
    }
  }

  /** Prefer the visible design image (largest on-screen box) so crop coords match what the user sees. */
  function pickCropReferenceImage(candidates) {
    var best = null;
    var bestArea = 0;
    if (modal && candidates && candidates.length) {
      modal.querySelectorAll('.cdp-modal__image-frame img.cdp-modal__image').forEach(function (img) {
        if (candidates.indexOf(img) === -1) return;
        if (!img.complete || img.naturalWidth <= 0) return;
        var r = img.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        var area = r.width * r.height;
        if (area > bestArea) {
          bestArea = area;
          best = img;
        }
      });
    }
    if (best) return best;
    for (var i = 0; candidates && i < candidates.length; i++) {
      var im = candidates[i];
      if (im && im.complete && im.naturalWidth > 0) return im;
    }
    return null;
  }

  function syncManualCropLayout() {
    if (!manualCropActive || !manualCropRect || !modal) return;
    var frames = modal.querySelectorAll('.cdp-modal__image-frame');
    frames.forEach(function (frame) {
      var layer = frame.querySelector('.cdp-manual-crop-layer');
      var img = frame.querySelector('img.cdp-modal__image');
      if (!layer || !img || !img.naturalWidth) return;
      var br = img.getBoundingClientRect();
      if (br.width < 2 || br.height < 2) return;
      var disp = displayRectForNatural(img, manualCropRect);
      if (!disp) return;
      applyLayerLayout(layer, disp, frame);
    });
  }

  function bindManualCropResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    if (manualCropResizeObserver) manualCropResizeObserver.disconnect();
    manualCropResizeObserver = new ResizeObserver(function () {
      if (manualCropActive) syncManualCropLayout();
    });
    if (modal) {
      modal.querySelectorAll('.cdp-modal__image-frame').forEach(function (fr) {
        manualCropResizeObserver.observe(fr);
      });
    }
  }

  function exitManualCropMode() {
    manualCropActive = false;
    manualCropDrag = null;
    manualCropRect = null;
    manualCropUiNaturalW = 0;
    manualCropUiNaturalH = 0;
    if (modalCarousel) modalCarousel.classList.remove('cdp-modal__carousel--manual-crop');
    if (modal) {
      modal.querySelectorAll('.cdp-manual-crop-layer').forEach(function (layer) {
        layer.setAttribute('hidden', '');
        layer.classList.remove('cdp-manual-crop-layer--active');
        layer.setAttribute('aria-hidden', 'true');
      });
    }
    setCropButtonsSaveMode(false);
    revertModalImagesToPrimaryPreview();
    if (manualCropResizeObserver) {
      manualCropResizeObserver.disconnect();
      manualCropResizeObserver = null;
    }
  }

  function enterManualCropMode() {
    getDOMElements();
    if (!pushImagesForManualCropSession()) {
      alert('Kein Bild zum Croppen verfügbar');
      return;
    }
    var imgs = [modalImage, modalImageMobile, modalImageMobileUploaded].filter(Boolean);

    function tryInit() {
      if (manualCropActive) return;
      var ref = pickCropReferenceImage(imgs);
      if (!ref) return;
      var iw = ref.naturalWidth;
      var ih = ref.naturalHeight;
      if (currentDesign && currentDesign.id) {
        var dw = currentDesign.width != null ? Number(currentDesign.width) : NaN;
        var dh = currentDesign.height != null ? Number(currentDesign.height) : NaN;
        if (isFinite(dw) && isFinite(dh) && dw > 0 && dh > 0) {
          if (Math.abs(iw - dw) > 2 || Math.abs(ih - dh) > 2) {
            console.warn(
              '[CDP] Loaded crop image pixel size does not match design metadata (worker crops r2_key_original / same as original_url).',
              { natural: { w: iw, h: ih }, designRecord: { w: dw, h: dh }, cropUrl: cropSourceUrlForSession(currentDesign) }
            );
          }
        }
      }
      manualCropRect = { x: 0, y: 0, w: iw, h: ih };
      manualCropUiNaturalW = iw;
      manualCropUiNaturalH = ih;
      manualCropActive = true;
      setCropButtonsSaveMode(true);
      syncManualCropLayout();
      bindManualCropResizeObserver();
      if (modalCarousel) modalCarousel.classList.add('cdp-modal__carousel--manual-crop');
    }

    tryInit();
    if (!manualCropActive) {
      imgs.forEach(function (im) {
        if (!im) return;
        im.addEventListener(
          'load',
          function () {
            tryInit();
          },
          { once: true }
        );
      });
    }
  }

  function onManualCropPointerDown(e) {
    if (!manualCropActive || !manualCropRect) return;
    var layer = e.target.closest('.cdp-manual-crop-layer');
    if (!layer || !layer.classList.contains('cdp-manual-crop-layer--active')) return;
    var frame = layer.closest('.cdp-modal__image-frame');
    var img = frame && frame.querySelector('img.cdp-modal__image');
    if (!img || !img.naturalWidth) return;

    var handle = e.target.closest('.cdp-manual-crop-handle');
    var inner = e.target.closest('.cdp-manual-crop-inner');
    var nat = pointerToNatural(img, e.clientX, e.clientY);
    if (!nat) return;

    var dims = { iw: img.naturalWidth, ih: img.naturalHeight };
    var r = manualCropRect;

    if (handle) {
      var h = handle.getAttribute('data-handle');
      var fixed = {};
      if (h === 'nw') fixed = { right: r.x + r.w, bottom: r.y + r.h };
      else if (h === 'ne') fixed = { left: r.x, bottom: r.y + r.h };
      else if (h === 'sw') fixed = { right: r.x + r.w, top: r.y };
      else if (h === 'se') fixed = { left: r.x, top: r.y };
      else if (h === 'n') fixed = { left: r.x, right: r.x + r.w, bottom: r.y + r.h };
      else if (h === 's') fixed = { left: r.x, right: r.x + r.w, top: r.y };
      else if (h === 'w') fixed = { top: r.y, right: r.x + r.w, bottom: r.y + r.h };
      else if (h === 'e') fixed = { left: r.x, top: r.y, bottom: r.y + r.h };
      else return;
      manualCropDrag = {
        kind: 'resize',
        handle: h,
        fixed: fixed,
        iw: dims.iw,
        ih: dims.ih,
        pointerId: e.pointerId,
        img: img,
        captureEl: handle,
      };
      e.preventDefault();
      e.stopPropagation();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch (_) {}
      return;
    }

    if (inner && !handle) {
      manualCropDrag = {
        kind: 'move',
        startRect: { x: r.x, y: r.y, w: r.w, h: r.h },
        startPx: nat.px,
        startPy: nat.py,
        iw: dims.iw,
        ih: dims.ih,
        pointerId: e.pointerId,
        img: img,
        captureEl: inner,
      };
      e.preventDefault();
      e.stopPropagation();
      try {
        inner.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
  }

  function onManualCropPointerMove(e) {
    if (!manualCropDrag || !manualCropRect) return;
    if (manualCropDrag.pointerId != null && e.pointerId !== manualCropDrag.pointerId) return;
    var img = manualCropDrag.img;
    var nat = pointerToNatural(img, e.clientX, e.clientY);
    if (!nat) return;

    if (manualCropDrag.kind === 'move') {
      var dx = nat.px - manualCropDrag.startPx;
      var dy = nat.py - manualCropDrag.startPy;
      var r0 = manualCropDrag.startRect;
      var nx = Math.round(r0.x + dx);
      var ny = Math.round(r0.y + dy);
      nx = Math.max(0, Math.min(nx, manualCropDrag.iw - r0.w));
      ny = Math.max(0, Math.min(ny, manualCropDrag.ih - r0.h));
      manualCropRect = { x: nx, y: ny, w: r0.w, h: r0.h };
    } else if (manualCropDrag.kind === 'resize') {
      applyManualCropResize(nat.px, nat.py, manualCropDrag);
    }
    syncManualCropLayout();
  }

  function onManualCropPointerUp(e) {
    if (!manualCropDrag) return;
    if (manualCropDrag.pointerId != null && e.pointerId !== manualCropDrag.pointerId) return;
    var cap = manualCropDrag.captureEl;
    if (cap && cap.releasePointerCapture) {
      try {
        cap.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    manualCropDrag = null;
  }

  function ensureManualCropDocListeners() {
    if (manualCropDocListenersBound) return;
    manualCropDocListenersBound = true;
    document.addEventListener('pointermove', onManualCropPointerMove);
    document.addEventListener('pointerup', onManualCropPointerUp);
    document.addEventListener('pointercancel', onManualCropPointerUp);
  }

  // Helper: Body-Scrolling steuern
  function preventBodyScroll(prevent) {
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      if (prevent) {
        window.CreatorModalPhysics.lockBodyScroll();
      } else {
        window.CreatorModalPhysics.unlockBodyScroll();
      }
    } else {
      // Fallback
      if (prevent) {
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';
      } else {
        const scrollY = document.body.style.top;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
      }
    }
  }

  // Initialize
  function init() {
    if (!getDOMElements()) {
      console.warn('Creator Design Preview Modal: DOM elements not found');
      return false;
    }
    
    if (isInitialized) return true;
    
    setupEventListeners();
    initCarousel();
    
    // Initially disable save button
    if (btnSave) {
      btnSave.disabled = true;
      updateSaveButtonState();
    }
    
    isInitialized = true;
    console.log('Creator Design Preview Modal initialized');
    return true;
  }

  // Event Listeners
  function setupEventListeners() {
    if (!modal) return;
    if (modalClose) {
      modalClose.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(false); // false = nicht forciert, prüfe auf ungespeicherte Änderungen
      });
    }

    // Backdrop click
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeModal(false); // false = nicht forciert, prüfe auf ungespeicherte Änderungen
        }
      });
    }

    // Escape key — beim manuellen Crop nur Crop-Modus beenden
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.getAttribute('aria-hidden') === 'false') {
        e.preventDefault();
        if (manualCropActive) {
          exitManualCropMode();
          return;
        }
        closeModal(false); // false = nicht forciert, prüfe auf ungespeicherte Änderungen
      }
    });

    ensureManualCropDocListeners();
    if (modal) {
      modal.addEventListener('pointerdown', onManualCropPointerDown);
    }

    window.addEventListener('resize', function () {
      if (manualCropActive) syncManualCropLayout();
    });

    // Buttons
    if (btnRemix) {
      btnRemix.addEventListener('click', handleRemix);
    }

    if (btnSimilar) {
      btnSimilar.addEventListener('click', handleSimilar);
    }

    if (btnTransfer) {
      btnTransfer.addEventListener('click', handleTransfer);
    }

    if (btnDownload) {
      btnDownload.addEventListener('click', handleDownload);
    }

    modal.querySelectorAll('.cdp-modal__crop-btn').forEach(function (b) {
      b.addEventListener('click', handleCrop);
    });

    if (btnSave) {
      btnSave.addEventListener('click', handleSave);
    }
    
    // Synchronize visibility switches (Desktop left, Desktop right, and Mobile Slide 1)
    const allVisibilitySwitches = [
      modalVisibilitySwitch,
      modalVisibilitySwitchLeft,
      modalVisibilitySwitchMobile
    ].filter(Boolean); // Remove null/undefined values

    // Sync all switches when any one changes AND track changes
    allVisibilitySwitches.forEach(switchEl => {
      switchEl.addEventListener('change', () => {
        // Sync all switches
        allVisibilitySwitches.forEach(otherSwitch => {
          if (otherSwitch !== switchEl) {
            otherSwitch.checked = switchEl.checked;
          }
        });
        
        // Update current visibility state
        const newVisibility = switchEl.checked ? 'public' : 'private';
        currentVisibility = newVisibility;
        
        // Check if changed from original
        checkForUnsavedChanges();
      });
    });

    if (btnDelete) {
      btnDelete.addEventListener('click', handleDelete);
    }
  }

  // Truncate long text to one line with ellipsis (max 80 chars)
  function truncateTitle(text, maxLen) {
    if (!text || typeof text !== 'string') return text || '';
    var s = text.trim();
    if (s.length <= (maxLen || 80)) return s;
    return s.substring(0, maxLen || 80).trim() + '...';
  }

  /** After performDesignDeletion success we close without hitting the catch — must not leave "Deleting…" on the DOM. */
  function resetDeleteButtonState() {
    if (!btnDelete) return;
    btnDelete.disabled = false;
    var label = btnDelete.querySelector('.cdp-modal__btn-text');
    if (label) label.textContent = window.CreatorI18n?.delete || 'Löschen';
  }

  // Open Modal
  function openModal(design) {
    console.log('CreatorDesignPreviewModal.openModal called', { design, modal: !!modal, isInitialized });
    
    // Ensure initialization
    if (!isInitialized || !modal) {
      if (!init()) {
        console.error('Modal element not found, cannot open');
        return;
      }
    }

    // Ensure modal reference is fresh
    modal = getModal();
    if (!modal) {
      console.error('openModal: Modal element still not found after init');
      return;
    }

    currentDesign = design;

    exitManualCropMode();

    // Initialize visibility state - will be set properly in updateDesignInfo, but set defaults here
    originalVisibility = null;
    currentVisibility = null;
    hasUnsavedChanges = false;
    isSaving = false;
    resetDeleteButtonState();

    // Optional: Close other modals that might be open (like the design modal)
    // This ensures the preview modal is on top
    if (window.CreatorDesignModal && typeof window.CreatorDesignModal.close === 'function') {
      // Don't close it, as user might want to go back
      // But we ensure our modal has higher z-index, so it should be on top
    }

    // Lock body scroll BEFORE showing modal
    preventBodyScroll(true);

    // Set title: metadata title > user_prompt > design_prompt/final_prompt > fallback. Always truncated.
    var metadata = null;
    try {
      metadata = design.metadata ? (typeof design.metadata === 'string' ? JSON.parse(design.metadata) : design.metadata) : null;
    } catch (_) {}
    var rawTitle = design.title || (metadata && metadata.title) || (metadata && metadata.user_prompt) || (metadata && (metadata.design_prompt || metadata.final_prompt)) || 'Design';
    const title = truncateTitle(String(rawTitle || 'Design'), 80);
    if (modalTitle) modalTitle.textContent = title;

    // Set image
    const imageUrl = design.preview_url || design.image_url || design.original_url || '';
    if (modalImage) modalImage.src = imageUrl;
    if (modalImageMobile) modalImageMobile.src = imageUrl;

    // Update design info from design object (sets layout based on design type)
    updateDesignInfo(design);
    
    // Reset carousel to first slide when opening
    setCarouselSlide(0);

    // Show modal - multiple ways to ensure visibility
    console.log('Setting modal to visible', modal);
    
    // Method 1: Remove aria-hidden attribute or set to false
    modal.setAttribute('aria-hidden', 'false');
    
    // ✅ TODO 1: Preview-Modal als echtes Creator-Modal markieren
    if (modal.classList) {
      modal.classList.add('creator-modal');
      modal.classList.add('creator-modal--open');
    }
    
    // Method 2: Add open class
    if (modal.classList) {
      modal.classList.add('cdp-modal--open');
    }
    
    // ✅ TODO 3: Modal-Scroll-Lock initialisieren (symmetrisch zu remove)
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.initModalScrollLock === 'function') {
      window.CreatorModalPhysics.initModalScrollLock(modal);
    }
    
    // Method 3: Force display style (as fallback)
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    
    // Ensure z-index is correct (should be set in CSS, but double-check)
    const computedZIndex = window.getComputedStyle(modal).zIndex;
    console.log('Modal z-index:', computedZIndex);
    
    console.log('Modal should now be visible', {
      ariaHidden: modal.getAttribute('aria-hidden'),
      hasOpenClass: modal.classList ? modal.classList.contains('cdp-modal--open') : false,
      display: modal.style.display,
      visibility: modal.style.visibility,
      opacity: modal.style.opacity
    });
  }

  // Determine if design is generated (GPT/user prompt flow) vs uploaded/saved (only image, no prompts)
  function isGeneratedDesign(design) {
    if (!design) return false;
    
    let metadata = null;
    if (design.metadata) {
      try {
        metadata = typeof design.metadata === 'string' ? JSON.parse(design.metadata) : design.metadata;
      } catch (e) {
        console.error('Error parsing metadata:', e);
      }
    }
    
    // Uploaded/Saved: Layout mit nur einem Bild, ohne User-Prompt/GPT-Prompt
    if (metadata?.design_source === 'Uploaded') return false;

    // Legacy uploads: no design_source but no generation prompts either
    const hasUserPrompt = metadata?.user_prompt && String(metadata.user_prompt).trim() && String(metadata.user_prompt).trim() !== '-';
    const hasUserImage = metadata?.user_image_url && String(metadata.user_image_url).trim();
    if (!metadata?.design_source && !hasUserPrompt && !hasUserImage && (design.preview_url || design.original_url)) {
      return false;
    }
    
    const hasDesignSource = metadata?.design_source === 'Generated';
    
    console.log('isGeneratedDesign check:', {
      hasDesignSource,
      hasUserPrompt: !!hasUserPrompt,
      hasUserImage: !!hasUserImage,
      design_source: metadata?.design_source
    });
    
    return hasDesignSource || (hasUserPrompt || hasUserImage);
  }

  // Helper: Check if mobile device
  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  }

  // Helper: Get section ID from widget (for accessing widget elements)
  function getWidgetSectionId() {
    // Try to find creator widget on page
    const widget = document.querySelector('[id^="creator-widget-"]');
    if (widget) {
      const widgetId = widget.id;
      const match = widgetId.match(/creator-widget-(.+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    // Fallback: try to get from URL or use default
    return null;
  }

  const CREATOR_DASHBOARD_PATH = '/pages/creator-dashboard';

  function isCreatorShellGeneratorContext() {
    const path = (window.location.pathname || '').toLowerCase();
    if (path.indexOf('/pages/design-generator') !== -1) return true;
    const onShell =
      path.indexOf('/pages/creator-dashboard') !== -1 || path.indexOf('/pages/creator-overview') !== -1;
    if (!onShell) return false;
    if (window.CreatorDesktopShell && typeof window.CreatorDesktopShell.getActiveScreen === 'function') {
      return window.CreatorDesktopShell.getActiveScreen() === 'generator';
    }
    const vp = document.getElementById('creatorMobileSwipeViewport');
    if (vp && vp.classList.contains('slide-1')) return true;
    return false;
  }

  function remixRedirectUrl(designId, remixType) {
    const q =
      'remix_design_id=' +
      encodeURIComponent(String(designId)) +
      '&remix_type=' +
      encodeURIComponent(String(remixType || 'remix'));
    return CREATOR_DASHBOARD_PATH + '?' + q + '#generator';
  }

  function focusCreatorGeneratorAfterRemix() {
    setTimeout(function () {
      try {
        if (window.CreatorDesktopShell && typeof window.CreatorDesktopShell.switchScreen === 'function') {
          window.CreatorDesktopShell.switchScreen('generator');
        }
      } catch (_e) {}
      try {
        if (typeof window.__creatorGoTo === 'function') {
          window.__creatorGoTo(1);
        }
      } catch (_e2) {}
      const genEl = document.getElementById('creatorGenerator');
      if (genEl && typeof genEl.scrollIntoView === 'function') {
        genEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const w = document.querySelector('[id^="creator-widget-"]');
      if (w && typeof w.scrollIntoView === 'function') {
        w.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  }

  // Helper: Navigate to creator dashboard generator tab (legacy name kept for callers)
  function navigateToDesignGenerator() {
    const targetUrl = CREATOR_DASHBOARD_PATH + '#generator';
    const currentPath = (window.location.pathname || '').toLowerCase();
    const onTarget =
      currentPath.indexOf('/pages/design-generator') !== -1 ||
      currentPath.indexOf('/pages/creator-dashboard') !== -1 ||
      currentPath.indexOf('/pages/creator-overview') !== -1;
    if (onTarget) {
      setTimeout(() => {
        const genEl = document.getElementById('creatorGenerator');
        if (genEl) {
          genEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const widgetEl = document.querySelector('[id^="creator-widget-"]');
        if (widgetEl) {
          widgetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      window.location.href = targetUrl;
    }
  }

  // Load design from API for remix/similar
  async function loadDesignForRemix(designId, type) {
    try {
      // Owner-ID mit mehreren Fallbacks ermitteln
      let ownerId = currentDesign?.owner_id || null;
      
      // Fallback 1: Aus URL-Parametern
      if (!ownerId) {
        const urlParams = new URLSearchParams(window.location.search);
        ownerId = urlParams.get('logged_in_customer_id') || 
                 urlParams.get('owner_id') || 
                 urlParams.get('customer_id');
      }
      
      // Fallback 2: Aus CreatorWidget (falls verfügbar)
      if (!ownerId && window.CreatorWidget) {
        // Versuche alle Widget-Instanzen
        for (const key in window.CreatorWidget) {
          if (window.CreatorWidget[key] && typeof window.CreatorWidget[key].getOwnerId === 'function') {
            ownerId = window.CreatorWidget[key].getOwnerId();
            if (ownerId) break;
          }
        }
      }
      
      // Fallback 3: Aus Shopify (falls verfügbar)
      if (!ownerId && window.Shopify && window.Shopify.customerId) {
        ownerId = window.Shopify.customerId.toString();
      }
      
      if (!ownerId) {
        console.error('[Remix] No owner ID available (tried: currentDesign, URL, CreatorWidget, Shopify)');
        return false; // ❌ Misserfolg signalisieren
      }
      
      console.log('[Remix] ✅ Owner-ID gefunden:', ownerId);

      const apiBaseUrl = resolveCreatorDispatchBase();
      const url = `${apiBaseUrl}?op=get-design&design_id=${encodeURIComponent(designId)}&owner_id=${encodeURIComponent(ownerId)}`;

      console.log('[Remix] Loading design from API:', { designId, type, url });

      const response = await fetch(url, { credentials: 'include' });
      const data = await response.json();

      if (!response.ok || !data.ok || !data.design) {
        throw new Error(data.error || 'Design nicht gefunden');
      }

      const design = data.design;
      console.log('[Remix] Design loaded:', { designId, type, hasMetadata: !!design.metadata });

      // Parse metadata
      let metadata = null;
      if (design.metadata) {
        try {
          metadata = typeof design.metadata === 'string' 
            ? JSON.parse(design.metadata) 
            : design.metadata;
        } catch (e) {
          console.error('[Remix] Error parsing metadata:', e);
        }
      }

      if (typeof window.__creatorGenApplyRemixDetail === 'function') {
        if (type === 'remix') {
          const imageUrl = design.preview_url || design.original_url || design.image_url;
          if (!imageUrl) {
            console.warn('[Remix] ⚠️ Kein Bild-URL gefunden für Remix');
            return false;
          }
          window.__creatorGenApplyRemixDetail({
            mode: 'remix',
            imageUrl: imageUrl,
            parentDesignId: designId
          });
          console.log('[Remix] ✅ New generator: remix image + parent design');
        } else if (type === 'similar') {
          const userPrompt = metadata?.user_prompt || '';
          const userImageUrl = metadata?.user_image_url || metadata?.image_url || metadata?.baseImageUrl || null;
          const hasValidUserPrompt = userPrompt && userPrompt.trim() && userPrompt.trim() !== '-';
          const hasUserImage = userImageUrl && userImageUrl.trim();
          if (!hasValidUserPrompt && !hasUserImage) {
            console.warn('[Remix] ⚠️ Kein User-Bild oder User-Prompt gefunden für Similar Design');
            return false;
          }
          window.__creatorGenApplyRemixDetail({
            mode: 'similar',
            userImageUrl: hasUserImage ? String(userImageUrl).trim() : '',
            userPrompt: hasValidUserPrompt ? userPrompt.trim() : ''
          });
          console.log('[Remix] ✅ New generator: similar fields');
        } else {
          return false;
        }
        focusCreatorGeneratorAfterRemix();
        return true;
      }

      if (type === 'remix') {
        const imageUrl = design.preview_url || design.original_url || design.image_url;
        if (imageUrl) {
          setupRemixFields(imageUrl, designId);
          console.log('[Remix] ✅ Remix-Felder gesetzt (Bild ins Upload-Feld, Prompt geleert)');
        } else {
          console.warn('[Remix] ⚠️ Kein Bild-URL gefunden für Remix');
          return false;
        }
      } else if (type === 'similar') {
        const userPrompt = metadata?.user_prompt || '';
        const userImageUrl = metadata?.user_image_url || metadata?.image_url || metadata?.baseImageUrl || null;

        const hasValidUserPrompt = userPrompt && userPrompt.trim() && userPrompt.trim() !== '-';
        const hasUserImage = userImageUrl && userImageUrl.trim();

        if (!hasValidUserPrompt && !hasUserImage) {
          console.warn('[Remix] ⚠️ Kein User-Bild oder User-Prompt gefunden für Similar Design');
          return false;
        }

        setupSimilarFields(userImageUrl, userPrompt);
        console.log('[Remix] ✅ Similar-Felder gesetzt (User-Bild und/oder User-Prompt)', {
          hasUserImage: !!userImageUrl,
          hasUserPrompt: !!(userPrompt && userPrompt.trim() && userPrompt.trim() !== '-')
        });
      }

      setTimeout(() => {
        const widgetEl = document.querySelector('[id^="creator-widget-"]');
        if (widgetEl) {
          widgetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

      return true;
    } catch (error) {
      console.error('[Remix] Error loading design:', error);
      alert((window.CreatorI18n?.errorLoading || 'Fehler beim Laden des Designs') + ': ' + (error.message || window.CreatorI18n?.errorUnknown || 'Unbekannter Fehler'));
      return false; // ❌ Misserfolg signalisieren
    }
  }
  
  // ✅ Exportiere loadDesignForRemix in die Public API
  window.CreatorDesignPreviewModal = window.CreatorDesignPreviewModal || {};
  window.CreatorDesignPreviewModal.loadDesignForRemix = loadDesignForRemix;

  // Helper: Set up remix fields (image in upload, clear prompt)
  function setupRemixFields(imageUrl, remixDesignId) {
    const sid = getWidgetSectionId();
    if (!sid) {
      console.warn('Could not find widget section ID');
      return;
    }

    const uploadZone = document.getElementById('uploadZone-' + sid);
    const previewContainer = document.getElementById('imagePreviewContainer-' + sid);
    const previewImg = document.getElementById('imagePreview-' + sid);
    const fileInput = document.getElementById('creatorImage-' + sid);

    if (previewContainer && previewImg) {
      previewImg.src = imageUrl;
      previewContainer.style.display = 'flex';
      if (uploadZone) uploadZone.style.display = 'none';
      if (fileInput) {
        fileInput.dataset.imageUrl = imageUrl;
        // WICHTIG: Speichere parent_design_id im Input-Dataset für späteres Speichern
        if (remixDesignId) {
          // WICHTIG: Beide setzen für Kompatibilität (parentDesignId hat Priorität)
          fileInput.dataset.parentDesignId = remixDesignId;
          fileInput.dataset.remixDesignId = remixDesignId;
          console.log('[Creator Design Preview Modal Remix] 🔗 parent_design_id gespeichert im Input-Dataset:', remixDesignId);
        }
      }
    }

    // Clear prompt
    const promptTextarea = document.getElementById('creatorPrompt-' + sid);
    if (promptTextarea) {
      promptTextarea.value = '';
    }

    // On mobile, switch to first slide (upload zone)
    if (isMobile()) {
      const widget = window.CreatorWidget && window.CreatorWidget[sid];
      if (widget && typeof widget.setSlide === 'function') {
        widget.setSlide(0);
      }
    }
  }

  // Helper: Show confirmation modal (wrapper for CreatorUtils or fallback)
  function showConfirmModal(message, onConfirm) {
    message = toEnglishUiText(message);
    if (window.CreatorUtils && window.CreatorUtils.showConfirmModal) {
      window.CreatorUtils.showConfirmModal(message, onConfirm);
    } else {
      console.warn('CreatorUtils nicht verfügbar, verwende window.confirm');
      if (window.confirm(message)) {
        if (typeof onConfirm === 'function') onConfirm();
      }
    }
  }

  // Remix function: Load design image into upload field
  function handleRemix() {
    if (!currentDesign) return;
    
    const designId = currentDesign.id || currentDesign.design_id;
    if (!designId) {
      console.warn('No design ID available for remix');
      return;
    }

    // Show confirmation dialog first
    showConfirmModal(window.CreatorI18n?.confirmRemix || 'Do you want to use this design as a remix?\n\nThe generated image will be loaded into the upload field.', function() {
      // Close all modals first
      doCloseModal();
      if (window.CreatorDesignModal && typeof window.CreatorDesignModal.close === 'function') {
        window.CreatorDesignModal.close();
      }

      const onGen = isCreatorShellGeneratorContext();
      if (onGen) {
        loadDesignForRemix(designId, 'remix');
      } else {
        window.location.href = remixRedirectUrl(designId, 'remix');
      }
    });
  }

  // Helper: Set up similar design fields (user image and user prompt)
  function setupSimilarFields(userImageUrl, userPrompt) {
    const sid = getWidgetSectionId();
    if (!sid) {
      console.warn('Could not find widget section ID');
      return;
    }

    const hasValidUserPrompt = userPrompt && userPrompt.trim() && userPrompt.trim() !== '-';
    const hasUserImage = userImageUrl && userImageUrl.trim();

    // Set user image if available
    if (hasUserImage) {
      const uploadZone = document.getElementById('uploadZone-' + sid);
      const previewContainer = document.getElementById('imagePreviewContainer-' + sid);
      const previewImg = document.getElementById('imagePreview-' + sid);
      const fileInput = document.getElementById('creatorImage-' + sid);

      if (previewContainer && previewImg) {
        previewImg.src = userImageUrl;
        previewContainer.style.display = 'flex';
        if (uploadZone) uploadZone.style.display = 'none';
        if (fileInput) {
          fileInput.dataset.imageUrl = userImageUrl;
        }
      }
    }

    // Set user prompt if available
    if (hasValidUserPrompt) {
      const promptTextarea = document.getElementById('creatorPrompt-' + sid);
      if (!promptTextarea) {
        // Try fallback: find textarea in form
        const form = document.getElementById('creatorForm-' + sid);
        if (form) {
          const fallbackTextarea = form.querySelector('textarea[name="prompt"]');
          if (fallbackTextarea) {
            fallbackTextarea.id = 'creatorPrompt-' + sid;
            fallbackTextarea.value = userPrompt.trim();
          }
        }
      } else {
        promptTextarea.value = userPrompt.trim();
      }
    }

    // On mobile, switch to first slide (upload zone)
    if (isMobile()) {
      const widget = window.CreatorWidget && window.CreatorWidget[sid];
      if (widget && typeof widget.setSlide === 'function') {
        widget.setSlide(0);
      }
    }
  }

  // Similar design function: Load user image and user prompt
  function handleSimilar() {
    if (!currentDesign) return;

    // Extract metadata
    let metadata = null;
    if (currentDesign.metadata) {
      try {
        metadata = typeof currentDesign.metadata === 'string' 
          ? JSON.parse(currentDesign.metadata) 
          : currentDesign.metadata;
      } catch (e) {
        console.error('Error parsing metadata:', e);
      }
    }

    // Get user prompt and user image
    const userPrompt = metadata?.user_prompt || '';
    const userImageUrl = metadata?.user_image_url || metadata?.image_url || metadata?.baseImageUrl || null;

    // Check if we have valid user prompt (not empty and not just "-")
    const hasValidUserPrompt = userPrompt && userPrompt.trim() && userPrompt.trim() !== '-';
    const hasUserImage = userImageUrl && userImageUrl.trim();

    // Only proceed if we have at least user prompt or user image
    if (!hasValidUserPrompt && !hasUserImage) {
      console.warn('No user prompt or user image available for similar design');
      return;
    }

    // Store designId BEFORE showing modal (currentDesign könnte nach Modal-Close null sein)
    const designId = currentDesign.id || currentDesign.design_id;
    if (!designId) {
      console.warn('No design ID available for similar design');
      return;
    }

    // Show confirmation dialog first
    showConfirmModal(window.CreatorI18n?.confirmRegenerate || 'Do you want to regenerate this design?\n\nImage and/or prompt will be loaded into the fields so you can make changes.', function() {
      // Close all modals first
      doCloseModal();
      if (window.CreatorDesignModal && typeof window.CreatorDesignModal.close === 'function') {
        window.CreatorDesignModal.close();
      }

      const onGen = isCreatorShellGeneratorContext();
      if (onGen) {
        loadDesignForRemix(designId, 'similar');
      } else {
        window.location.href = remixRedirectUrl(designId, 'similar');
      }
    });
  }

  // Update button states based on design type and available data
  function updateButtonStates(design) {
    const isGenerated = isGeneratedDesign(design);
    
    // Extract metadata for checking user prompt/image
    let metadata = null;
    if (design.metadata) {
      try {
        metadata = typeof design.metadata === 'string' 
          ? JSON.parse(design.metadata) 
          : design.metadata;
      } catch (e) {
        console.error('Error parsing metadata for button states:', e);
      }
    }

    // Remix button: Always enabled if we have an image
    if (btnRemix) {
      const hasImage = !!(design.preview_url || design.original_url || design.image_url);
      btnRemix.disabled = !hasImage;
      btnRemix.style.opacity = hasImage ? '1' : '0.5';
      btnRemix.style.cursor = hasImage ? 'pointer' : 'not-allowed';
    }

    // Similar design button: Only enabled for generated designs with user prompt AND user image
    if (btnSimilar) {
      if (!isGenerated) {
        // Uploaded designs: Disabled
        btnSimilar.disabled = true;
        btnSimilar.style.opacity = '0.5';
        btnSimilar.style.cursor = 'not-allowed';
      } else {
        // Generated designs: Check if we have valid user prompt OR user image
        const userPrompt = metadata?.user_prompt || '';
        const userImageUrl = metadata?.user_image_url || metadata?.image_url || metadata?.baseImageUrl || null;
        
        const hasValidUserPrompt = userPrompt && userPrompt.trim() && userPrompt.trim() !== '-';
        const hasUserImage = userImageUrl && userImageUrl.trim();
        
        // Enable if we have user prompt OR user image (not both required)
        const shouldEnable = hasValidUserPrompt || hasUserImage;
        
        btnSimilar.disabled = !shouldEnable;
        btnSimilar.style.opacity = shouldEnable ? '1' : '0.5';
        btnSimilar.style.cursor = shouldEnable ? 'pointer' : 'not-allowed';
      }
    }
  }

  // Update design info from design object
  function updateDesignInfo(design) {
    console.log('updateDesignInfo called with design:', {
      id: design?.id,
      hasMetadata: !!design?.metadata,
      metadataType: typeof design?.metadata,
      metadataPreview: design?.metadata ? (typeof design.metadata === 'string' ? design.metadata.substring(0, 100) : Object.keys(design.metadata)) : null
    });
    
    // Try to extract from metadata
    let metadata = null;
    if (design.metadata) {
      try {
        metadata = typeof design.metadata === 'string' ? JSON.parse(design.metadata) : design.metadata;
        console.log('Metadata parsed successfully:', {
          keys: Object.keys(metadata),
          design_source: metadata.design_source,
          has_design_prompt: !!metadata.design_prompt,
          has_user_prompt: !!metadata.user_prompt,
          has_user_image_url: !!metadata.user_image_url
        });
      } catch (e) {
        console.error('Error parsing metadata:', e);
      }
    } else {
      console.warn('No metadata found in design object');
    }

    const isGenerated = isGeneratedDesign(design);
    console.log('Design type determined:', { isGenerated });
    
    // Show/hide layout containers based on design type
    if (isGenerated) {
      // Generated design: Show right side on desktop, carousel on mobile
      if (modalDesktopRight && modalDesktopRight.classList) {
        modalDesktopRight.classList.add('cdp-modal__desktop-right--generated');
      }
      if (modalMobileGenerated) {
        modalMobileGenerated.style.display = 'flex';
      }
      if (modalMobileUploaded) {
        modalMobileUploaded.style.display = 'none';
      }
    } else {
      // Uploaded design: Hide right side on desktop, show simple layout on mobile
      if (modalDesktopRight && modalDesktopRight.classList) {
        modalDesktopRight.classList.remove('cdp-modal__desktop-right--generated');
      }
      if (modalMobileGenerated) {
        modalMobileGenerated.style.display = 'none';
      }
      if (modalMobileUploaded) {
        modalMobileUploaded.style.display = 'flex';
      }
    }

    const designPrompt = pickEffectiveImagePrompt(metadata, design);
    setPromptBoxContent(modalDesignPrompt, designPrompt);
    setPromptBoxContent(modalDesignPromptMobile, designPrompt);

    // User Prompt (from metadata) - only for generated designs
    // WICHTIG: user_prompt wird immer in metadata.user_prompt gespeichert, kein Fallback nötig
    const userPrompt = metadata?.user_prompt || '';
    if (modalUserPrompt) {
      modalUserPrompt.textContent = userPrompt || '–';
      if (modalUserPrompt.classList) {
        modalUserPrompt.classList.toggle('cdp-modal__value--empty', !userPrompt);
      }
    }
    if (modalUserPromptMobile) {
      modalUserPromptMobile.textContent = userPrompt || '–';
      if (modalUserPromptMobile.classList) {
        modalUserPromptMobile.classList.toggle('cdp-modal__value--empty', !userPrompt);
      }
    }

    // User Image (from metadata) - only for generated designs
    // WICHTIG: design.original_url ist das finale Design-Bild (nach Upscaling), NICHT das User-Input-Bild!
    // Versuche mehrere Quellen: metadata.user_image_url, metadata.image_url, metadata.baseImageUrl
    // baseImageUrl könnte auch das User-Input-Bild sein
    const userImageUrl = metadata?.user_image_url || metadata?.image_url || metadata?.baseImageUrl || null;
    console.log('User image URL lookup:', {
      fromMetadataUserImageUrl: metadata?.user_image_url?.substring(0, 50),
      fromMetadataImageUrl: metadata?.image_url?.substring(0, 50),
      fromMetadataBaseImageUrl: metadata?.baseImageUrl?.substring(0, 50),
      finalUserImageUrl: userImageUrl?.substring(0, 50) || 'null (no user image)',
      allMetadataKeys: Object.keys(metadata || {})
    });
    updateUserImage(userImageUrl, isGenerated);
    
    // Set mobile uploaded image
    if (modalImageMobileUploaded && !isGenerated) {
      const imageUrl = design.preview_url || design.image_url || design.original_url || '';
      modalImageMobileUploaded.src = imageUrl;
    }
    
    // Set visibility switch (Desktop left, Desktop right, and Mobile - all should be synchronized)
    // ✅ Debug: Log visibility values
    console.log('🔍 [Visibility Debug]', {
      'design.visibility': design.visibility,
      'metadata?.visibility': metadata?.visibility,
      'design object keys': Object.keys(design || {}),
      'metadata keys': metadata ? Object.keys(metadata) : null
    });
    
    const visibility = design.visibility || metadata?.visibility || 'private';
    // ✅ Case-insensitive check for visibility
    const isPublic = String(visibility).toLowerCase() === 'public';
    
    // Initialize visibility state (only set originalVisibility once when modal opens)
    const visibilityLower = String(visibility).toLowerCase();
    if (originalVisibility === null) {
      originalVisibility = visibilityLower;
    }
    currentVisibility = visibilityLower;
    
    console.log('🔍 [Visibility Debug] Final:', {
      visibility,
      isPublic,
      originalVisibility,
      currentVisibility,
      'will set switches to': isPublic ? 'Public' : 'Private'
    });
    if (modalVisibilitySwitch) {
      modalVisibilitySwitch.checked = isPublic;
    }
    if (modalVisibilitySwitchLeft) {
      modalVisibilitySwitchLeft.checked = isPublic;
    }
    if (modalVisibilitySwitchMobile) {
      modalVisibilitySwitchMobile.checked = isPublic;
    }
    
    // Ensure button state is updated after visibility is set
    checkForUnsavedChanges();
    
    // Update button states based on design type and available data
    updateButtonStates(design);
  }

  // Update user image display
  function updateUserImage(imageUrl, isGenerated) {
    console.log('updateUserImage called:', { imageUrl: imageUrl?.substring(0, 50), isGenerated, hasModalUserImage: !!modalUserImage, hasModalUserImageMobile: !!modalUserImageMobile });
    
    if (isGenerated) {
      // User Image Wrapper immer anzeigen für generierte Designs
      if (modalUserImageWrapper && modalUserImageWrapper.classList) {
        modalUserImageWrapper.classList.add('cdp-modal__user-image-wrapper--visible');
      }
      if (modalUserImageWrapperMobile && modalUserImageWrapperMobile.classList) {
        modalUserImageWrapperMobile.classList.add('cdp-modal__user-image-wrapper--visible');
      }
      
      // Wenn User-Bild vorhanden, anzeigen
      if (imageUrl && imageUrl.trim()) {
        console.log('Setting user image:', imageUrl);
        if (modalUserImage) {
          modalUserImage.src = imageUrl;
          modalUserImage.style.display = '';
          modalUserImage.onerror = function () {
            modalUserImage.style.display = 'none';
            if (modalUserImageText) modalUserImageText.style.display = 'block';
          };
        }
        if (modalUserImageMobile) {
          modalUserImageMobile.src = imageUrl;
          modalUserImageMobile.style.display = '';
          modalUserImageMobile.onerror = function () {
            modalUserImageMobile.style.display = 'none';
            if (modalUserImageTextMobile) modalUserImageTextMobile.style.display = 'block';
          };
        }
        // Text ausblenden
        if (modalUserImageText) modalUserImageText.style.display = 'none';
        if (modalUserImageTextMobile) modalUserImageTextMobile.style.display = 'none';
      } else {
        // Kein User-Bild vorhanden - Text anzeigen
        console.log('No user image, showing text');
        if (modalUserImage) modalUserImage.style.display = 'none';
        if (modalUserImageMobile) modalUserImageMobile.style.display = 'none';
        if (modalUserImageText) modalUserImageText.style.display = 'block';
        if (modalUserImageTextMobile) modalUserImageTextMobile.style.display = 'block';
      }
    } else {
      console.log('Hiding user image (not generated)');
      if (modalUserImageWrapper && modalUserImageWrapper.classList) {
        modalUserImageWrapper.classList.remove('cdp-modal__user-image-wrapper--visible');
      }
      if (modalUserImageWrapperMobile && modalUserImageWrapperMobile.classList) {
        modalUserImageWrapperMobile.classList.remove('cdp-modal__user-image-wrapper--visible');
      }
    }
  }
  
  // Carousel functions
  function setCarouselSlide(index) {
    if (!modalCarouselSlides || modalCarouselSlides.length === 0) return;

    if (manualCropActive) exitManualCropMode();

    currentCarouselSlide = Math.max(0, Math.min(index, modalCarouselSlides.length - 1));
    
    modalCarouselSlides.forEach((slide, i) => {
      if (slide && slide.classList) {
        slide.classList.toggle('cdp-modal__carousel-slide--active', i === currentCarouselSlide);
      }
    });
    
    modalCarouselDots.forEach((dot, i) => {
      if (dot && dot.classList) {
        dot.classList.toggle('cdp-modal__carousel-dot--active', i === currentCarouselSlide);
      }
    });
  }
  
  function initCarousel() {
    if (!modalCarousel || !modalCarouselDots || modalCarouselDots.length === 0) return;
    
    // Reset to first slide
    setCarouselSlide(0);
    
    // Add click handlers to dots
    modalCarouselDots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        setCarouselSlide(index);
      });
    });
    
    // Touch swipe support
    let touchStartX = 0;
    let touchEndX = 0;
    
    modalCarousel.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    modalCarousel.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
    
    function handleSwipe() {
      const swipeThreshold = 50; // Minimum swipe distance
      const diff = touchStartX - touchEndX;
      
      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          // Swipe left - next slide
          setCarouselSlide(currentCarouselSlide + 1);
        } else {
          // Swipe right - previous slide
          setCarouselSlide(currentCarouselSlide - 1);
        }
      }
    }
  }

  // Check for unsaved changes and update button state
  function checkForUnsavedChanges() {
    if (!currentDesign || originalVisibility === null || currentVisibility === null) {
      hasUnsavedChanges = false;
      updateSaveButtonState();
      console.log('🔍 checkForUnsavedChanges: No design or visibility null', {
        hasDesign: !!currentDesign,
        originalVisibility,
        currentVisibility
      });
      return;
    }
    
    // Check if visibility has changed from original
    const originalVisibilityLower = String(originalVisibility).toLowerCase();
    const currentVisibilityLower = String(currentVisibility).toLowerCase();
    hasUnsavedChanges = originalVisibilityLower !== currentVisibilityLower;
    
    console.log('🔍 checkForUnsavedChanges:', {
      originalVisibility: originalVisibilityLower,
      currentVisibility: currentVisibilityLower,
      hasUnsavedChanges
    });
    
    updateSaveButtonState();
  }

  // Update save button enabled/disabled state
  function updateSaveButtonState() {
    if (!btnSave) return;
    
    if (hasUnsavedChanges && !isSaving) {
      btnSave.disabled = false;
      btnSave.style.opacity = '1';
      btnSave.style.cursor = 'pointer';
    } else {
      btnSave.disabled = true;
      btnSave.style.opacity = '0.5';
      btnSave.style.cursor = 'not-allowed';
    }
  }

  // Save changes - shows confirmation dialog first
  function handleSave(e) {
    e.preventDefault();
    
    if (!currentDesign || !hasUnsavedChanges || isSaving) {
      return;
    }
    
    if (!currentDesign.id) {
      console.error('Cannot save: No design ID');
      alert(window.CreatorI18n?.noDesignId || 'Fehler: Keine Design-ID gefunden.');
      return;
    }
    
    // Show confirmation dialog before saving
    const visibilityText = currentVisibility === 'public' ? 'Öffentlich' : 'Privat';
    const message = 'Möchtest du die Änderungen speichern?\n\n' +
                    'Sichtbarkeit: ' + visibilityText;
    
    if (window.CreatorUtils && window.CreatorUtils.showConfirmModal) {
      window.CreatorUtils.showConfirmModal(message, function() {
        // User confirmed - proceed with save
        performSave();
      });
    } else {
      // Fallback to native confirm
      if (confirm(message)) {
        performSave();
      }
    }
  }
  
  // Actually perform the save operation
  async function performSave() {
    if (!currentDesign || isSaving) {
      return;
    }
    
    // Get owner_id from design object first, then fallback to URL params or current context
    const ownerId = currentDesign.owner_id || 
                    (() => {
                      const urlParams = new URLSearchParams(window.location.search);
                      return urlParams.get('logged_in_customer_id') || 
                             urlParams.get('owner_id') || 
                             (window.CreatorWidget && window.CreatorWidget.getOwnerId ? window.CreatorWidget.getOwnerId() : null) ||
                             (window.Shopify?.customerId ? window.Shopify.customerId.toString() : null);
                    })();
    
    if (!ownerId) {
      console.error('Cannot save: No owner_id', { 
        currentDesign: currentDesign,
        hasOwnerId: !!currentDesign.owner_id,
        urlParams: new URLSearchParams(window.location.search).toString()
      });
      alert(window.CreatorI18n?.noUserId || 'Fehler: Keine Benutzer-ID gefunden. Bitte melde dich an.');
      return;
    }
    
    isSaving = true;
    updateSaveButtonState();
    
    try {
      // Find API base URL
      const apiBaseUrl = resolveCreatorDispatchBase();
      const updateUrl = `${apiBaseUrl}?op=update-design&logged_in_customer_id=${encodeURIComponent(ownerId)}`;
      
      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          design_id: currentDesign.id,
          visibility: currentVisibility,
        }),
      });
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || data.message || window.CreatorI18n?.saveFailed || 'Fehler beim Speichern');
      }
      
      // Update currentDesign with new visibility
      if (data.design) {
        currentDesign.visibility = data.design.visibility;
        currentVisibility = String(data.design.visibility).toLowerCase();
      } else {
        currentDesign.visibility = currentVisibility;
      }
      
      // Update originalVisibility to match current (no more unsaved changes)
      originalVisibility = currentVisibility;
      hasUnsavedChanges = false;
      updateSaveButtonState();
      
      console.log('✅ Design saved, visibility updated:', {
        originalVisibility,
        currentVisibility,
        designVisibility: currentDesign.visibility
      });
      
      console.log('Design saved successfully', data);
      
      // Optionally refresh the design list if the widget has that function
      if (window.CreatorDesignModal && typeof window.CreatorDesignModal.refresh === 'function') {
        window.CreatorDesignModal.refresh();
      }
      
    } catch (error) {
      console.error('Error saving design:', error);
      alert((window.CreatorI18n?.errorSaving || 'Fehler beim Speichern') + ': ' + (error.message || window.CreatorI18n?.errorUnknown || 'Unbekannter Fehler'));
    } finally {
      isSaving = false;
      updateSaveButtonState();
    }
  }

  // Download original (upscaled) image
  // Handle Delete Design
  async function handleDelete(e) {
    e.preventDefault();
    
    if (!currentDesign || !currentDesign.id) {
      console.warn('No design selected for deletion');
      showErrorDialog('Kein Design ausgewählt');
      return;
    }

    const shop = window.Shopify?.shop || null;
    const ownerId = currentDesign.owner_id || null;
    
    if (!ownerId) {
      showErrorDialog('Owner ID nicht gefunden');
      return;
    }

    // Track published count for the confirmation callback
    // -1 means "unknown, assume products might exist"
    let publishedCount = -1;
    let isLoadingProducts = true;

    // Show confirmation dialog immediately with placeholder message
    // The product count will be loaded in the background and updated
    const placeholderMessage = 'Lade Produktinformationen...\n\nMöchtest du das Design löschen?';
    const confirmationDialog = showConfirmationDialog(placeholderMessage, async () => {
      // User confirmed - proceed with deletion
      // If still loading, wait a bit for the count to be available
      if (isLoadingProducts) {
        // Wait up to 2 seconds for product count to load
        let waitCount = 0;
        while (isLoadingProducts && waitCount < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          waitCount++;
        }
      }
      // Use publishedCount (will be >= 0 if loaded, -1 if unknown)
      await performDesignDeletion(publishedCount > 0);
    });

    // Load published products count asynchronously in the background
    // This doesn't block the modal from opening
    (async () => {
      try {
        // Find API base URL
        const apiBaseUrl = resolveCreatorDispatchBase();
        let publishedUrl = `${apiBaseUrl}?op=get-published&design_id=${currentDesign.id}&owner_id=${encodeURIComponent(ownerId)}`;
        if (shop) {
          publishedUrl += `&shop=${encodeURIComponent(shop)}`;
        }

        const response = await fetch(publishedUrl, { credentials: 'include' });
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error || window.CreatorI18n?.errorLoadingProducts || 'Fehler beim Laden der Produkte');
        }

        const publishedProducts = data.published || [];
        publishedCount = publishedProducts.length;
        isLoadingProducts = false;

        // Update the confirmation dialog message with the actual product count
        const deleteMessage = publishedCount > 0
          ? `Design auf ${publishedCount} ${publishedCount === 1 ? 'Produkt' : 'Produkte'} veröffentlicht\n\nMöchtest du das Design inkl. der Produkte löschen?`
          : `Design auf 0 Produkte veröffentlicht\n\nMöchtest du das Design endgültig löschen?`;

        if (confirmationDialog && typeof confirmationDialog.updateMessage === 'function') {
          confirmationDialog.updateMessage(deleteMessage);
        }

      } catch (error) {
        console.error('Error checking published products:', error);
        isLoadingProducts = false;
        
        // Update dialog to show error, but keep it open so user can still proceed
        const errorMessage = window.CreatorI18n?.confirmDeleteWithProducts || `Fehler beim Laden der Produktinformationen\n\nMöchtest du das Design trotzdem löschen?\n\nHinweis: Falls Produkte veröffentlicht wurden, werden diese ebenfalls gelöscht.`;
        if (confirmationDialog && typeof confirmationDialog.updateMessage === 'function') {
          confirmationDialog.updateMessage(errorMessage);
        }
        
        // Assume there might be products if we can't check
        publishedCount = -1; // -1 means "unknown, assume yes"
      }
    })();
  }

  // Toast after successful design deletion (Creations / My Creations / preview modal).
  var deleteToastTimers = { hide: null, remove: null };

  function replaceDesignDeletePlaceholders(str, map) {
    var out = String(str || '');
    if (!map) return out;
    Object.keys(map).forEach(function (k) {
      out = out.split('%' + k + '%').join(String(map[k] != null ? map[k] : ''));
    });
    return out;
  }

  function dismissDesignDeletedToast() {
    var el = document.getElementById('creatorDesignDeleteToast');
    if (deleteToastTimers.hide) {
      clearTimeout(deleteToastTimers.hide);
      deleteToastTimers.hide = null;
    }
    if (deleteToastTimers.remove) {
      clearTimeout(deleteToastTimers.remove);
      deleteToastTimers.remove = null;
    }
    if (!el) return;
    el.classList.add('creator-design-delete-toast--out');
    deleteToastTimers.remove = setTimeout(function () {
      el.remove();
      deleteToastTimers.remove = null;
    }, 320);
  }

  function refreshCreationsAfterDesignDelete(meta) {
    meta = meta || {};
    if (window.CreationsScreen && typeof window.CreationsScreen.removeDeletedDesignLocally === 'function') {
      var removed = window.CreationsScreen.removeDeletedDesignLocally({
        designId: meta.designId != null ? String(meta.designId).trim() : '',
        jobId: meta.jobId != null ? String(meta.jobId).trim() : ''
      });
      if (removed) return;
    }
    var path = window.location.pathname || '';
    if (
      path.indexOf('/pages/creator-dashboard') !== -1 ||
      path.indexOf('/pages/my-creations') !== -1
    ) {
      if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
        window.CreationsScreen.loadDesigns(true, { silent: true });
        return;
      }
      if (window.CreatorMyCreations && typeof window.CreatorMyCreations.refreshData === 'function') {
        window.CreatorMyCreations.refreshData();
        return;
      }
    }
    if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
      window.CreationsScreen.loadDesigns(true, { silent: true });
    }
  }

  function showDesignDeletedToast(opts) {
    var I = window.CreatorI18n || {};
    var designTitle = opts && opts.designTitle ? String(opts.designTitle).trim() : '';
    var productsRemoved = opts && opts.productsRemoved != null ? Number(opts.productsRemoved) : 0;
    if (!isFinite(productsRemoved) || productsRemoved < 0) productsRemoved = 0;

    dismissDesignDeletedToast();

    var overlay = document.createElement('div');
    overlay.id = 'creatorDesignDeleteToast';
    overlay.className = 'creator-design-delete-toast';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.addEventListener('click', function () {
      dismissDesignDeletedToast();
    });

    var card = document.createElement('div');
    card.className = 'creator-design-delete-toast__card';
    card.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    var icon = document.createElement('div');
    icon.className = 'creator-design-delete-toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u2713';

    var titleFallback = I.designDeleteSuccessUntitled || 'Design';
    var headlineTpl =
      I.designDeleteSuccessHeadline || '%design_title% was deleted successfully';
    var headlineEl = document.createElement('div');
    headlineEl.className = 'creator-design-delete-toast__headline';
    headlineEl.textContent = replaceDesignDeletePlaceholders(headlineTpl, {
      design_title: designTitle || titleFallback,
    });

    card.appendChild(icon);
    card.appendChild(headlineEl);

    if (productsRemoved > 0) {
      var tpl =
        productsRemoved === 1
          ? I.designDeleteSuccessProductsOne ||
            '%count% product was removed from your shop.'
          : I.designDeleteSuccessProductsMany ||
            '%count% products were removed from your shop.';
      var subEl = document.createElement('div');
      subEl.className = 'creator-design-delete-toast__sub';
      subEl.textContent = replaceDesignDeletePlaceholders(tpl, {
        count: String(productsRemoved),
      });
      card.appendChild(subEl);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    deleteToastTimers.hide = setTimeout(function () {
      deleteToastTimers.hide = null;
      dismissDesignDeletedToast();
    }, 5600);
  }

  window.showCreatorDesignDeletedToast = showDesignDeletedToast;

  // Perform design deletion
  async function performDesignDeletion(hasProducts = false) {
    if (!currentDesign || !currentDesign.id) {
      return;
    }

    // Disable delete button
    if (btnDelete) {
      btnDelete.disabled = true;
      const originalText = btnDelete.querySelector('.cdp-modal__btn-text')?.textContent || window.CreatorI18n?.delete || 'Löschen';
      if (btnDelete.querySelector('.cdp-modal__btn-text')) {
        btnDelete.querySelector('.cdp-modal__btn-text').textContent = 'Wird gelöscht...';
      }
    }

    // Show loading overlay if products need to be deleted
    let loadingOverlay = null;
    if (hasProducts && modal) {
      loadingOverlay = createLoadingOverlayForModal(modal);
    }

    try {
      const ownerId = currentDesign.owner_id || null;
      
      if (!ownerId) {
        throw new Error('Owner ID nicht gefunden');
      }

      // Find API base URL
      const apiBaseUrl = resolveCreatorDispatchBase();
      const deleteUrl = `${apiBaseUrl}?op=delete-design&design_id=${currentDesign.id}&owner_id=${encodeURIComponent(ownerId)}`;

      console.log('🗑️ Deleting design:', { designId: currentDesign.id, ownerId });

      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      const data = await response.json();
      console.log('🗑️ Delete design response:', data);

      if (!response.ok || !data.ok) {
        throw new Error(data.error || data.message || window.CreatorI18n?.deleteFailed || 'Löschen fehlgeschlagen');
      }

      // Erfolgreich gelöscht
      console.log('✅ Design deleted successfully');

      const savedDesignTitle = String(currentDesign.title || currentDesign.prompt || '').trim();
      const productCount = Number(data.products_total || data.products_deleted || 0) || 0;
      const deletedDesignMeta = {
        designId: String(currentDesign.id || '').trim(),
        jobId: currentDesign.job_id != null ? String(currentDesign.job_id).trim() : ''
      };

      // Remove loading overlay if it was shown
      if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.remove();
      }

      // Close preview modal (clears currentDesign — read title/count above)
      doCloseModal();

      // Close creator design modal if open
      if (window.CreatorDesignModal && typeof window.CreatorDesignModal.close === 'function') {
        window.CreatorDesignModal.close();
      }

      showDesignDeletedToast({
        designTitle: savedDesignTitle,
        productsRemoved: productCount,
      });
      refreshCreationsAfterDesignDelete(deletedDesignMeta);

    } catch (error) {
      console.error('❌ Error deleting design:', error);
      
      // Remove loading overlay if it was shown
      if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.remove();
      }
      
      showErrorDialog(`${window.CreatorI18n?.errorDeleting || 'Fehler beim Löschen des Designs'}: ${error.message || window.CreatorI18n?.errorUnknown || 'Unbekannter Fehler'}`);
      
      resetDeleteButtonState();
    }
  }

  // Create loading overlay with pulsing eazpire creator logo for modal
  function createLoadingOverlayForModal(modalElement) {
    const overlay = document.createElement('div');
    overlay.className = 'cdp-modal-loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.96);
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 20px;
    `;
    
    // Try to find the eazpire creator logo from header
    const logoImg = document.querySelector('img[alt*="eazpire" i], img[src*="eazpire-creator-logo" i], .header-logo img, header img[src*="eazpire-creator" i]');
    const logoUrl = logoImg ? logoImg.src : 'https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950';
    
    // Create pulsing logo element
    const logoElement = document.createElement('div');
    logoElement.style.cssText = 'text-align: center;';
    
    const logoImgEl = document.createElement('img');
    logoImgEl.src = logoUrl;
    logoImgEl.alt = 'eazpire creator';
    logoImgEl.style.cssText = 'max-width: 200px; max-height: 200px; width: auto; height: auto; animation: cdp-modal-pulse 1.5s ease-in-out infinite; object-fit: contain;';
    
    logoElement.appendChild(logoImgEl);
    overlay.appendChild(logoElement);
    
    // Add pulse animation CSS if not already added
    if (!document.getElementById('cdp-modal-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'cdp-modal-pulse-style';
      style.textContent = `
        @keyframes cdp-modal-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.05);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
    return overlay;
  }

  // Show confirmation dialog with Yes/No buttons
  function showConfirmationDialog(message, onYes, onNo = null) {
    message = toEnglishUiText(message);
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.96);z-index:999999;display:flex;align-items:center;justify-content:center;';
    
    const modalBox = document.createElement('div');
    modalBox.style.cssText = 'background:rgba(192,132,252,0.18);border-radius:12px;padding:32px;max-width:500px;width:90%;border:1px solid #020617;';
    
    const messageElement = document.createElement('div');
    messageElement.style.cssText = 'color:#e5e7eb;font-size:18px;font-weight:600;margin-bottom:20px;text-align:center;white-space:pre-line;';
    messageElement.textContent = message;
    
    modalBox.innerHTML = `
      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
        <button type="button" class="creator-confirm-yes" style="padding:12px 24px;background:#F59E0B;color:#020617;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          Yes
        </button>
        <button type="button" class="creator-confirm-no" style="padding:12px 24px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          No
        </button>
      </div>
    `;
    
    modalBox.insertBefore(messageElement, modalBox.firstChild);
    modalOverlay.appendChild(modalBox);
    document.body.appendChild(modalOverlay);
    
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }
    
    const yesBtn = modalBox.querySelector('.creator-confirm-yes');
    const noBtn = modalBox.querySelector('.creator-confirm-no');
    
    // Hover-Effekte
    [yesBtn, noBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('mouseenter', function() { this.style.opacity = '0.9'; });
        btn.addEventListener('mouseleave', function() { this.style.opacity = '1'; });
      }
    });
    
    const close = function() {
      if (document.body.contains(modalOverlay)) {
        document.body.removeChild(modalOverlay);
        if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
          window.CreatorModalPhysics.unlockBodyScroll();
        }
      }
    };
    
    if (yesBtn) {
      yesBtn.addEventListener('click', function() {
        close();
        if (onYes && typeof onYes === 'function') {
          onYes();
        }
      });
    }
    
    if (noBtn) {
      noBtn.addEventListener('click', function() {
        close();
        if (onNo && typeof onNo === 'function') {
          onNo();
        }
      });
    }
    
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        close();
        if (onNo && typeof onNo === 'function') {
          onNo();
        }
      }
    });
    
    // ESC-Taste zum Schließen
    const handleEsc = function(e) {
      if (e.key === 'Escape') {
        close();
        if (onNo && typeof onNo === 'function') {
          onNo();
        }
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
    
    // Return object with updateMessage function for dynamic message updates
    return {
      updateMessage: function(newMessage) {
        if (messageElement && document.body.contains(modalOverlay)) {
          messageElement.textContent = newMessage;
        }
      },
      close: close
    };
  }

  // Show error dialog
  function showErrorDialog(message) {
    message = toEnglishUiText(message);
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.96);z-index:999999;display:flex;align-items:center;justify-content:center;';
    
    const modalBox = document.createElement('div');
    modalBox.style.cssText = 'background:rgba(192,132,252,0.18);border-radius:12px;padding:32px;max-width:500px;width:90%;border:1px solid #020617;';
    
    modalBox.innerHTML = `
      <div style="color:#ef4444;font-size:18px;font-weight:600;margin-bottom:20px;text-align:center;white-space:pre-line;">
        ${escapeHtml(message)}
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
        <button type="button" class="creator-confirm-ok" style="padding:12px 24px;background:#F59E0B;color:#020617;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          OK
        </button>
      </div>
    `;
    
    modalOverlay.appendChild(modalBox);
    document.body.appendChild(modalOverlay);
    
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }
    
    const okBtn = modalBox.querySelector('.creator-confirm-ok');
    
    // Hover-Effekt
    if (okBtn) {
      okBtn.addEventListener('mouseenter', function() { this.style.opacity = '0.9'; });
      okBtn.addEventListener('mouseleave', function() { this.style.opacity = '1'; });
      okBtn.addEventListener('click', function() {
        if (document.body.contains(modalOverlay)) {
          document.body.removeChild(modalOverlay);
          if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
            window.CreatorModalPhysics.unlockBodyScroll();
          }
        }
      });
    }
    
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        if (document.body.contains(modalOverlay)) {
          document.body.removeChild(modalOverlay);
          if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
            window.CreatorModalPhysics.unlockBodyScroll();
          }
        }
      }
    });
    
    // ESC-Taste zum Schließen
    const handleEsc = function(e) {
      if (e.key === 'Escape') {
        if (document.body.contains(modalOverlay)) {
          document.body.removeChild(modalOverlay);
          if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
            window.CreatorModalPhysics.unlockBodyScroll();
          }
        }
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  function handleDownload(e) {
    e.preventDefault();
    
    if (!currentDesign) {
      console.warn('No design selected for download');
      return;
    }
    
    // Das originale, hochskalierte Bild verwenden (original_url hat Priorität)
    const imageUrl = currentDesign.original_url || currentDesign.preview_url || currentDesign.image_url;
    
    if (!imageUrl) {
      console.warn('No image URL available for download', currentDesign);
      alert('Kein Bild zum Herunterladen verfügbar');
      return;
    }
    
    console.log('Downloading image:', imageUrl);
    
    // Dateiname generieren
    // Versuche Titel zu verwenden, sonst Design-ID oder Timestamp
    let filename = 'design';
    if (currentDesign.title) {
      // Titel säubern für Dateinamen (nur alphanumerische Zeichen, Bindestriche, Unterstriche)
      filename = currentDesign.title
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 50) || 'design';
    } else if (currentDesign.id) {
      filename = `design-${currentDesign.id}`;
    } else {
      filename = `design-${Date.now()}`;
    }
    
    // Dateiendung aus URL extrahieren (oder Standard verwenden)
    const urlPath = new URL(imageUrl).pathname;
    const urlExtension = urlPath.substring(urlPath.lastIndexOf('.') + 1).toLowerCase();
    const validExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    const extension = validExtensions.includes(urlExtension) ? urlExtension : 'png';
    
    filename = `${filename}.${extension}`;
    
    // Download-Link erstellen und klicken
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = filename;
    link.target = '_blank'; // Fallback: in neuem Tab öffnen falls Download nicht funktioniert
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    
    // Element nach kurzer Verzögerung wieder entfernen
    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);
  }

  // Handle Crop Design — erster Klick: manueller Crop-Modus; zweiter Klick: Speichern
  async function handleCrop(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!currentDesign || !currentDesign.id) {
      console.warn('No design selected for cropping');
      alert('Kein Design ausgewählt');
      return;
    }

    var imageUrl = cropSourceUrlForSession(currentDesign);
    if (!imageUrl) {
      console.warn('No image URL available for cropping', currentDesign);
      alert('Kein Bild zum Croppen verfügbar');
      return;
    }

    if (manualCropActive) {
      await performCrop();
      return;
    }

    enterManualCropMode();
  }

  // Crop ausführen (mit optional manual_crop aus dem Overlay)
  async function performCrop() {
    if (!currentDesign || !currentDesign.id || isSaving) {
      return;
    }

    if (!manualCropActive || !manualCropRect) {
      return;
    }

    // Get owner_id
    const ownerId = currentDesign.owner_id || 
                    (() => {
                      const urlParams = new URLSearchParams(window.location.search);
                      return urlParams.get('logged_in_customer_id') || 
                             urlParams.get('owner_id') || 
                             (window.CreatorWidget && window.CreatorWidget.getOwnerId ? window.CreatorWidget.getOwnerId() : null) ||
                             (window.Shopify?.customerId ? window.Shopify.customerId.toString() : null);
                    })();
    
    if (!ownerId) {
      console.error('Cannot crop: No owner_id', { 
        currentDesign: currentDesign,
        hasOwnerId: !!currentDesign.owner_id,
        urlParams: new URLSearchParams(window.location.search).toString()
      });
      alert(window.CreatorI18n?.noUserId || 'Fehler: Keine Benutzer-ID gefunden. Bitte melde dich an.');
      return;
    }

    var cropBtns = modal ? modal.querySelectorAll('.cdp-modal__crop-btn') : [];
    cropBtns.forEach(function (b) {
      b.classList.add('cdp-modal__crop-btn--loading');
      b.disabled = true;
    });
    setCropBusyVisible(true);

    try {
      let data;

      const shopDomain = typeof window !== 'undefined' && window.Shopify?.shop
        ? String(window.Shopify.shop).trim()
        : '';

      var candidates = buildCropDispatchCandidates();
      var refImg = pickCropReferenceImage(
        [modalImage, modalImageMobile, modalImageMobileUploaded].filter(Boolean)
      );
      var uiW = manualCropUiNaturalW || (refImg && refImg.naturalWidth) || 0;
      var uiH = manualCropUiNaturalH || (refImg && refImg.naturalHeight) || 0;
      var serverDim = resolveServerCropDimensions(currentDesign);
      var serverRect = manualCropRectForServer(
        manualCropRect,
        uiW,
        uiH,
        serverDim.w,
        serverDim.h
      );
      if (!serverRect) {
        throw new Error('invalid_crop_rect');
      }

      eazCropDebugPush({
        ev: 'crop_ui_start',
        design_id: currentDesign.id,
        owner_id: String(ownerId),
        manual_rect_ui: { x: manualCropRect.x, y: manualCropRect.y, w: manualCropRect.w, h: manualCropRect.h },
        manual_rect_server: { x: serverRect.x, y: serverRect.y, w: serverRect.w, h: serverRect.h },
        ui_natural: { w: uiW, h: uiH },
        server_wh: serverDim,
        candidate_count: candidates.length,
        candidates_preview: candidates.map(function (c) {
          try {
            return String(c).split('?')[0].slice(-60);
          } catch (_) {
            return '';
          }
        }),
      });
      var lastErr = null;
      var CROP_FETCH_TIMEOUT_MS = 55000;
      for (var i = 0; i < candidates.length; i++) {
        const base = String(candidates[i] || '');
        const bodyPayload = {
          design_id: currentDesign.id,
          owner_id: String(ownerId),
          logged_in_customer_id: String(ownerId),
          manual_crop: {
            x: serverRect.x,
            y: serverRect.y,
            w: serverRect.w,
            h: serverRect.h,
          },
        };
        if (shopDomain) bodyPayload.shop = shopDomain;

        let reqUrl = base;
        if (base.indexOf('/api/eaz-crop-design') === -1) {
          const cropUrl = new URL(base);
          cropUrl.searchParams.set('op', 'crop-design');
          cropUrl.searchParams.set('path_prefix', '/apps/creator-dispatch');
          cropUrl.searchParams.set('logged_in_customer_id', String(ownerId));
          if (shopDomain) cropUrl.searchParams.set('shop', shopDomain);
          reqUrl = cropUrl.toString();
        }

        try {
          var isCropProxy = reqUrl.indexOf('/api/eaz-crop-design') !== -1;
          var maxSub = isCropProxy ? 2 : 1;
          var succeeded = false;
          for (var sub = 0; sub < maxSub; sub++) {
            if (sub > 0) {
              await new Promise(function (resolve) {
                setTimeout(resolve, 500 * sub);
              });
            }
            var ac = new AbortController();
            var toid = setTimeout(function () {
              try {
                ac.abort();
              } catch (_) {}
            }, CROP_FETCH_TIMEOUT_MS);
            var response;
            try {
              response = await fetch(reqUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
                signal: ac.signal,
              });
            } catch (fe) {
              clearTimeout(toid);
              if (fe && fe.name === 'AbortError') {
                lastErr = new Error('Request timed out while cropping (waited ' + Math.round(CROP_FETCH_TIMEOUT_MS / 1000) + 's).');
                console.warn('[CDP] crop fetch timeout', { candidate: i + 1, subAttempt: sub + 1, ms: CROP_FETCH_TIMEOUT_MS });
                eazCropDebugPush({
                  ev: 'crop_fetch_timeout',
                  candidate: i + 1,
                  subAttempt: sub + 1,
                  ms: CROP_FETCH_TIMEOUT_MS,
                });
                if (isCropProxy && sub < maxSub - 1) continue;
                throw lastErr;
              }
              throw fe;
            }
            clearTimeout(toid);

            const ct = (response.headers.get('content-type') || '').toLowerCase();
            const routeHeader = response.headers.get('x-eaz-translate-proxy-route') || '';
            const serverHeader = response.headers.get('server') || '';
            const cfRay = response.headers.get('cf-ray') || '';
            const rawText = await response.text();
            console.log(
              '[CDP DEBUG] crop attempt response meta ' +
                JSON.stringify({
                  candidate: i + 1,
                  subAttempt: sub + 1,
                  reqUrl: reqUrl,
                  status: response.status,
                  routeHeader: routeHeader,
                  serverHeader: serverHeader,
                  cfRay: cfRay,
                  contentType: ct,
                })
            );

            var statusRetryable =
              isCropProxy &&
              sub < maxSub - 1 &&
              (response.status === 502 || response.status === 503 || response.status === 504);

            if (!ct.includes('application/json')) {
              if (statusRetryable) {
                const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 120);
                lastErr = new Error('HTTP ' + response.status + (snippet ? ' — ' + snippet : ''));
                continue;
              }
              const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 160);
              throw new Error('HTTP ' + response.status + (snippet ? ' — ' + snippet : ''));
            }

            try {
              data = JSON.parse(rawText);
            } catch (parseErr) {
              if (statusRetryable) {
                lastErr = parseErr;
                continue;
              }
              throw new Error('invalid JSON (HTTP ' + response.status + ')');
            }

            eazCropDebugPush({
              ev: 'crop_response',
              candidate: i + 1,
              subAttempt: sub + 1,
              req_url: reqUrl.length > 200 ? reqUrl.slice(0, 200) + '…' : reqUrl,
              status: response.status,
              proxy_run: response.headers.get('x-eaz-crop-proxy-run-id') || (data && data.proxy_run_id) || '',
              engine_run: response.headers.get('x-eaz-crop-run-id') || '',
              route: routeHeader,
              cf_ray: cfRay,
              ok: !!data.ok,
              err: data.ok ? '' : String(data.error || ''),
              upstream_status: data.upstream_status != null ? data.upstream_status : '',
            });

            if (data.ok) {
              succeeded = true;
              break;
            }

            var errCode = data.error || 'crop_failed';
            var upstreamRetryable =
              isCropProxy &&
              sub < maxSub - 1 &&
              (errCode === 'crop_upstream_non_json' ||
                errCode === 'crop_upstream_timeout' ||
                (response.status >= 502 && response.status <= 504));

            if (upstreamRetryable) {
              var errDetailR = data.message ? String(data.message).trim() : '';
              if (errDetailR && errDetailR !== errCode && errDetailR.length < 500) {
                lastErr = new Error(errCode + ': ' + errDetailR);
              } else {
                lastErr = new Error(errCode);
              }
              continue;
            }

            var errDetail = data.message ? String(data.message).trim() : '';
            if (errDetail && errDetail !== errCode && errDetail.length < 500) {
              throw new Error(errCode + ': ' + errDetail);
            }
            throw new Error(errCode);
          }

          if (succeeded) {
            break;
          }
          throw lastErr || new Error('crop_failed');
        } catch (attemptErr) {
          lastErr = attemptErr;
          var originLabel = '';
          try { originLabel = new URL(reqUrl).origin; } catch (_) { originLabel = reqUrl; }
          console.warn('[CDP] crop attempt failed via', originLabel, attemptErr?.message || attemptErr);
        }
      }

      if (!data || !data.ok) {
        if (lastErr) throw lastErr;
        throw new Error('crop_failed');
      }

      eazCropDebugPush({ ev: 'crop_ui_success', design_id: currentDesign.id });

      if (!data || data.ok !== true) {
        throw new Error(data?.error || data?.message || window.CreatorI18n?.cropFailed || 'Fehler beim Croppen');
      }
      
      console.log('✅ Design cropped successfully:', data);
      
      if (data.design) {
        currentDesign.original_url = normalizePersistedFileUrl(data.design.original_url);
        currentDesign.preview_url = normalizePersistedFileUrl(data.design.preview_url);
        currentDesign.image_url = normalizePersistedFileUrl(
          data.design.image_url || data.design.preview_url || data.design.original_url
        );
        if (data.design.width) currentDesign.width = data.design.width;
        if (data.design.height) currentDesign.height = data.design.height;
      }

      getDOMElements();

      manualCropActive = false;
      manualCropDrag = null;
      manualCropRect = null;
      manualCropUiNaturalW = 0;
      manualCropUiNaturalH = 0;
      if (modalCarousel) modalCarousel.classList.remove('cdp-modal__carousel--manual-crop');
      if (modal) {
        modal.querySelectorAll('.cdp-manual-crop-layer').forEach(function (layer) {
          layer.setAttribute('hidden', '');
          layer.classList.remove('cdp-manual-crop-layer--active');
          layer.setAttribute('aria-hidden', 'true');
        });
      }
      setCropButtonsSaveMode(false);
      if (manualCropResizeObserver) {
        manualCropResizeObserver.disconnect();
        manualCropResizeObserver = null;
      }

      refreshModalDesignImagesAfterCrop();

      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (refreshErr) {
        console.warn('[CDP] Creations list refresh after crop failed:', refreshErr);
      }

      try {
        if (typeof window.refreshCreationsDesignProductState === 'function') {
          window.refreshCreationsDesignProductState();
        }
      } catch (badgeErr) {
        console.warn('[CDP] Product badge refresh after crop failed:', badgeErr);
      }

      showCropSuccessToast(previewModalCropStrings().savedMsg);

    } catch (error) {
      eazCropDebugPush({
        ev: 'crop_ui_error',
        design_id: currentDesign && currentDesign.id,
        message: error && error.message ? String(error.message) : String(error),
      });
      console.error('Error cropping design:', error);
      alert((window.CreatorI18n?.cropFailed || 'Fehler beim Croppen') + ': ' + (error.message || window.CreatorI18n?.errorUnknown || 'Unbekannter Fehler'));
    } finally {
      setCropBusyVisible(false);
      cropBtns.forEach(function (b) {
        b.classList.remove('cdp-modal__crop-btn--loading');
        b.disabled = false;
      });
    }
  }

  // Close Modal
  function closeModal(forceClose = false) {
    // Handle case where event object is passed instead of boolean
    if (forceClose && typeof forceClose === 'object' && forceClose.preventDefault) {
      forceClose = false; // It's an event object, treat as not forced
    }
    
    console.log('🔍 closeModal called', { forceClose, hasUnsavedChanges, originalVisibility, currentVisibility });
    
    // Ensure we check for unsaved changes before closing
    checkForUnsavedChanges();
    
    console.log('🔍 After checkForUnsavedChanges:', { hasUnsavedChanges, originalVisibility, currentVisibility });
    
    // Check for unsaved changes before closing (only if not forced)
    if (forceClose === false && hasUnsavedChanges) {
      console.log('✅ Closing with unsaved changes, showing dialog', {
        originalVisibility,
        currentVisibility,
        hasUnsavedChanges
      });
      showCloseConfirmDialog();
      return;
    }
    
    console.log('✅ No unsaved changes or forced close, closing directly', { forceClose, hasUnsavedChanges });
    doCloseModal();
  }
  
  // Actually close the modal (without checking for unsaved changes)
  function doCloseModal() {
    // Ensure we have modal reference
    if (!modal) {
      if (!getDOMElements()) return;
    }

    exitManualCropMode();

    // Remove focus from any focused element within modal before hiding
    // This prevents accessibility warnings about aria-hidden on focused elements
    const activeElement = document.activeElement;
    if (activeElement && modal.contains(activeElement)) {
      activeElement.blur();
    }

    // ✅ TODO 3: Modal-Scroll-Lock entfernen (symmetrisch zu init)
    // WICHTIG: Muss vor unlockBodyScroll() passieren, damit Listener korrekt entfernt werden
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.removeModalScrollLock === 'function' && modal) {
      window.CreatorModalPhysics.removeModalScrollLock(modal);
    }

    preventBodyScroll(false);

    // Hide modal - multiple ways to ensure it's hidden
    modal.setAttribute('aria-hidden', 'true');
    
    // ✅ TODO 1: Creator-Modal Klassen entfernen
    if (modal.classList) {
      modal.classList.remove('creator-modal--open');
      modal.classList.remove('creator-modal');
      modal.classList.remove('cdp-modal--open');
    }
    
    // Reset inline styles (remove them to let CSS take over)
    modal.style.display = '';
    modal.style.visibility = '';
    modal.style.opacity = '';
    
    // Clear content
    if (modalImage) modalImage.src = '';
    if (modalImageMobile) modalImageMobile.src = '';
    if (modalUserImage) modalUserImage.src = '';
    if (modalUserImageMobile) modalUserImageMobile.src = '';
    
    // Reset state
    currentDesign = null;
    originalVisibility = null;
    currentVisibility = null;
    hasUnsavedChanges = false;
    isSaving = false;
    resetDeleteButtonState();
  }
  
  // Show confirmation dialog when closing with unsaved changes
  function showCloseConfirmDialog() {
    const visibilityText = currentVisibility === 'public' ? 'Öffentlich' : 'Privat';
    const message = 'Du hast ungespeicherte Änderungen.\n\n' +
                    'Sichtbarkeit: ' + visibilityText + '\n\n' +
                    'Möchtest du die Änderungen speichern oder verwerfen?';
    
    if (window.CreatorUtils && window.CreatorUtils.showConfirmModal) {
      // Use the same confirmation modal style as job preview modal
      // But we need a custom version with "Speichern" and "Verwerfen" buttons
      showSaveOrDiscardDialog(message);
    } else {
      // Fallback to native confirm
      if (confirm(message + '\n\n' + (window.CreatorI18n?.confirmOkSaveCancelDiscard || 'Klicke "OK" zum Speichern oder "Abbrechen" zum Verwerfen.'))) {
        handleSave(new Event('click')).then(() => {
          doCloseModal();
        });
      } else {
        doCloseModal();
      }
    }
  }
  
  // Show custom dialog with "Speichern" and "Verwerfen" buttons (similar to job preview modal style)
  function showSaveOrDiscardDialog(message) {
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.96);z-index:999999;display:flex;align-items:center;justify-content:center;';
    
    const modalBox = document.createElement('div');
    modalBox.style.cssText = 'background:rgba(192,132,252,0.18);border-radius:12px;padding:32px;max-width:500px;width:90%;border:1px solid #020617;';
    
    modalBox.innerHTML = `
      <div style="color:#e5e7eb;font-size:18px;font-weight:600;margin-bottom:20px;text-align:center;white-space:pre-line;">
        ${message || 'Bist du sicher?'}
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
        <button type="button" class="creator-confirm-save" style="padding:12px 24px;background:#F59E0B;color:#020617;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          Speichern
        </button>
        <button type="button" class="creator-confirm-discard" style="padding:12px 24px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          Verwerfen
        </button>
      </div>
    `;
    
    modalOverlay.appendChild(modalBox);
    document.body.appendChild(modalOverlay);
    
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }
    
    const saveBtn = modalBox.querySelector('.creator-confirm-save');
    const discardBtn = modalBox.querySelector('.creator-confirm-discard');
    
    // Hover-Effekte
    if (saveBtn) {
      saveBtn.addEventListener('mouseenter', function() {
        this.style.opacity = '0.9';
      });
      saveBtn.addEventListener('mouseleave', function() {
        this.style.opacity = '1';
      });
    }
    
    if (discardBtn) {
      discardBtn.addEventListener('mouseenter', function() {
        this.style.opacity = '0.9';
      });
      discardBtn.addEventListener('mouseleave', function() {
        this.style.opacity = '1';
      });
    }
    
    const close = function() {
      if (document.body.contains(modalOverlay)) {
        document.body.removeChild(modalOverlay);
        if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
          window.CreatorModalPhysics.unlockBodyScroll();
        }
      }
    };
    
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        close();
        // Save changes, then close modal
        // Call performSave directly (skip confirmation dialog, as user already confirmed in this dialog)
        await performSave();
        doCloseModal();
      });
    }
    
    if (discardBtn) {
      discardBtn.addEventListener('click', function() {
        close();
        // Just close without saving
        doCloseModal();
      });
    }
    
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        // Click outside = discard
        close();
        doCloseModal();
      }
    });
    
    // ESC-Taste zum Schließen (verwirft Änderungen)
    const handleEsc = function(e) {
      if (e.key === 'Escape') {
        close();
        doCloseModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  // Set up the exported functions directly - robust implementation
  window.CreatorDesignPreviewModal.open = function(design) {
    console.log('CreatorDesignPreviewModal.open called', { design, isInitialized, modal: !!modal });
    
    // Try to initialize if not already done or modal element is missing
    if (!isInitialized || !modal) {
      console.log('Initializing modal...');
      if (!init()) {
        console.warn('Creator Design Preview Modal: Element not found, retrying...');
        // Retry after a short delay
        setTimeout(() => {
          if (init()) {
            console.log('Modal initialized on retry, opening...');
            openModal(design);
          } else {
            console.error('Creator Design Preview Modal: Element still not found after retry');
          }
        }, 200);
        return;
      }
    }
    openModal(design);
  };

  // Handle transfer button click
  async function handleTransfer(e) {
    e.preventDefault();
    
    if (!currentDesign || !currentDesign.id) {
      console.error('Cannot transfer: No design selected');
      alert(window.CreatorI18n?.noDesignId || 'Fehler: Kein Design ausgewählt.');
      return;
    }
    
    // Get owner_id
    const ownerId = currentDesign.owner_id || 
                    (() => {
                      const urlParams = new URLSearchParams(window.location.search);
                      return urlParams.get('logged_in_customer_id') || 
                             urlParams.get('owner_id') || 
                             (window.CreatorWidget && window.CreatorWidget.getOwnerId ? window.CreatorWidget.getOwnerId() : null) ||
                             (window.Shopify?.customerId ? window.Shopify.customerId.toString() : null);
                    })();
    
    if (!ownerId) {
      console.error('Cannot transfer: No owner_id');
      alert(window.CreatorI18n?.noUserId || 'Fehler: Keine Benutzer-ID gefunden. Bitte melde dich an.');
      return;
    }
    
    try {
      // Load creator settings to get available creator names
      const apiBaseUrl = resolveCreatorDispatchBase();
      const settingsUrl = `${apiBaseUrl}?op=get-settings&logged_in_customer_id=${encodeURIComponent(ownerId)}`;

      console.log('[CreatorDesignPreviewModal] apiBaseUrl:', apiBaseUrl, 'settingsUrl:', settingsUrl);

      const settingsResponse = await fetch(settingsUrl);
      const settingsData = await settingsResponse.json();
      
      if (!settingsData.ok || !settingsData.settings) {
        throw new Error('Failed to load creator settings');
      }
      
      const allCreatorNames = settingsData.settings.creator_names || [];
      
      // Get creator_name from design object - check multiple possible sources
      let currentCreatorName = currentDesign.creator_name || 
                               (currentDesign.metadata && typeof currentDesign.metadata === 'object' 
                                 ? currentDesign.metadata.creator_name 
                                 : null) ||
                               null;
      
      // If still null, try to parse metadata if it's a string
      if (!currentCreatorName && currentDesign.metadata && typeof currentDesign.metadata === 'string') {
        try {
          const parsedMeta = JSON.parse(currentDesign.metadata);
          currentCreatorName = parsedMeta.creator_name || null;
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      console.log('🔍 Transfer: Creator name lookup', {
        designCreatorName: currentDesign.creator_name,
        metadataType: typeof currentDesign.metadata,
        metadataCreatorName: currentDesign.metadata?.creator_name,
        finalCurrentCreatorName: currentCreatorName
      });
      
      // Filter out current creator name
      const otherCreatorNames = allCreatorNames.filter(name => name !== currentCreatorName);
      
      // Load published products count
      const publishedUrl = `${apiBaseUrl}?op=get-published&design_id=${currentDesign.id}&logged_in_customer_id=${encodeURIComponent(ownerId)}&shop=${encodeURIComponent(window.Shopify?.shop || 'allyoucanpink.myshopify.com')}`;
      const publishedResponse = await fetch(publishedUrl);
      const publishedData = await publishedResponse.json();
      
      const publishedCount = publishedData.ok && publishedData.published ? publishedData.published.length : 0;
      
      // Show transfer dialog
      if (otherCreatorNames.length === 0) {
        // No other creators available
        showNoCreatorDialog();
      } else {
        // Show creator selection dialog
        showTransferDialog(otherCreatorNames, currentCreatorName, publishedCount);
      }
      
    } catch (error) {
      console.error('Error preparing transfer:', error);
      alert((window.CreatorI18n?.errorLoadingCreators || 'Fehler beim Laden der Creator-Informationen') + ': ' + (error.message || window.CreatorI18n?.errorUnknown || 'Unbekannter Fehler'));
    }
  }
  
  // Show dialog when no other creators are available
  function showNoCreatorDialog() {
    const message = 'Du hast keinen weiteren Creator, auf den du übertragen kannst.\n\n' +
                    'Möchtest du einen neuen Creator erstellen?';
    
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.96);z-index:999999;display:flex;align-items:center;justify-content:center;';
    
    const modalBox = document.createElement('div');
    modalBox.style.cssText = 'background:rgba(192,132,252,0.18);border-radius:12px;padding:32px;max-width:500px;width:90%;border:1px solid #020617;';
    
    modalBox.innerHTML = `
      <div style="color:#e5e7eb;font-size:18px;font-weight:600;margin-bottom:20px;text-align:center;white-space:pre-line;">
        ${message}
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
        <button type="button" class="creator-confirm-create" style="padding:12px 24px;background:#F59E0B;color:#020617;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          Neuen Creator erstellen
        </button>
        <button type="button" class="creator-confirm-cancel" style="padding:12px 24px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          Abbrechen
        </button>
      </div>
    `;
    
    modalOverlay.appendChild(modalBox);
    document.body.appendChild(modalOverlay);
    
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }
    
    const createBtn = modalBox.querySelector('.creator-confirm-create');
    const cancelBtn = modalBox.querySelector('.creator-confirm-cancel');
    
    // Hover-Effekte
    [createBtn, cancelBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('mouseenter', function() { this.style.opacity = '0.9'; });
        btn.addEventListener('mouseleave', function() { this.style.opacity = '1'; });
      }
    });
    
    const close = function() {
      if (document.body.contains(modalOverlay)) {
        document.body.removeChild(modalOverlay);
        if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
          window.CreatorModalPhysics.unlockBodyScroll();
        }
      }
    };
    
    if (createBtn) {
      createBtn.addEventListener('click', function() {
        close();
        // TODO: Implement create new creator functionality later
        alert('Funktion "Neuen Creator erstellen" wird später implementiert.');
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', close);
    }
    
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        close();
      }
    });
    
    // ESC-Taste zum Schließen
    const handleEsc = function(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
  
  // Show transfer dialog with creator selection
  function showTransferDialog(otherCreatorNames, currentCreatorName, publishedCount) {
    const currentText = currentCreatorName || 'Nicht zugewiesen';
    const productsText = publishedCount === 1 ? '1 Produkt' : `${publishedCount} Produkte`;
    
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.96);z-index:999999;display:flex;align-items:center;justify-content:center;';
    
    const modalBox = document.createElement('div');
    modalBox.style.cssText = 'background:rgba(192,132,252,0.18);border-radius:12px;padding:32px;max-width:500px;width:90%;border:1px solid #020617;';
    
    const selectId = 'transfer-creator-select-' + Date.now();
    const optionsHtml = otherCreatorNames.map(name => 
      `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join('');
    
    modalBox.innerHTML = `
      <div style="color:#e5e7eb;font-size:18px;font-weight:600;margin-bottom:16px;text-align:center;">
        Design übertragen
      </div>
      <div style="color:#9ca3af;font-size:14px;margin-bottom:20px;text-align:center;white-space:pre-line;">
        Aktueller Creator: <strong style="color:#e5e7eb;">${escapeHtml(currentText)}</strong>
        Anzahl veröffentlichter Produkte: ${publishedCount}
      </div>
      <div style="margin-bottom:24px;">
        <label style="display:block;color:#e5e7eb;font-size:14px;font-weight:600;margin-bottom:8px;">
          Übertragen zu:
        </label>
        <select id="${selectId}" style="width:100%;padding:10px;background:#020617;border:1px solid #4b5563;border-radius:8px;color:#e5e7eb;font-size:14px;cursor:pointer;">
          ${optionsHtml}
        </select>
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
        <button type="button" class="creator-confirm-transfer" style="padding:12px 24px;background:#F59E0B;color:#020617;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          Übertragen
        </button>
        <button type="button" class="creator-confirm-close" style="padding:12px 24px;background:#374151;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          Schließen
        </button>
      </div>
    `;
    
    modalOverlay.appendChild(modalBox);
    document.body.appendChild(modalOverlay);
    
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }
    
    const transferBtn = modalBox.querySelector('.creator-confirm-transfer');
    const closeBtn = modalBox.querySelector('.creator-confirm-close');
    const selectEl = document.getElementById(selectId);
    
    // Hover-Effekte
    [transferBtn, closeBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('mouseenter', function() { this.style.opacity = '0.9'; });
        btn.addEventListener('mouseleave', function() { this.style.opacity = '1'; });
      }
    });
    
    const close = function() {
      if (document.body.contains(modalOverlay)) {
        document.body.removeChild(modalOverlay);
        if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
          window.CreatorModalPhysics.unlockBodyScroll();
        }
      }
    };
    
    if (transferBtn && selectEl) {
      transferBtn.addEventListener('click', async function() {
        const selectedCreatorName = selectEl.value;
        if (!selectedCreatorName) {
          alert(window.CreatorI18n?.pleaseSelectCreator || 'Bitte wähle einen Creator aus.');
          return;
        }
        
        // Show confirmation dialog
        const confirmMessage = publishedCount > 0
          ? `Möchtest du dieses Design inklusive ${productsText} auf "${selectedCreatorName}" übertragen?`
          : `Möchtest du dieses Design auf "${selectedCreatorName}" übertragen?`;
        
        if (window.CreatorUtils && window.CreatorUtils.showConfirmModal) {
          window.CreatorUtils.showConfirmModal(confirmMessage, async function() {
            // Only close the transfer dialog confirmation, keep preview modal open
            // (We need currentDesign for the transfer)
            close(); // Close transfer dialog confirmation
            // Perform transfer while preview modal is still open
            await performTransfer(selectedCreatorName, publishedCount);
          });
        } else {
          if (confirm(confirmMessage)) {
            // Only close the transfer dialog confirmation, keep preview modal open
            // (We need currentDesign for the transfer)
            close(); // Close transfer dialog confirmation
            // Perform transfer while preview modal is still open
            await performTransfer(selectedCreatorName, publishedCount);
          }
        }
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }
    
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        close();
      }
    });
    
    // ESC-Taste zum Schließen
    const handleEsc = function(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
  
  // Perform the actual transfer
  async function performTransfer(newCreatorName, publishedCount) {
    if (!currentDesign || !currentDesign.id) {
      alert(window.CreatorI18n?.noDesignId || 'Fehler: Kein Design ausgewählt.');
      return;
    }
    
    const ownerId = currentDesign.owner_id || 
                    (() => {
                      const urlParams = new URLSearchParams(window.location.search);
                      return urlParams.get('logged_in_customer_id') || 
                             urlParams.get('owner_id') || 
                             (window.CreatorWidget && window.CreatorWidget.getOwnerId ? window.CreatorWidget.getOwnerId() : null) ||
                             (window.Shopify?.customerId ? window.Shopify.customerId.toString() : null);
                    })();
    
    if (!ownerId) {
      alert(window.CreatorI18n?.noUserId || 'Fehler: Keine Benutzer-ID gefunden.');
      return;
    }
    
    try {
      const apiBaseUrl = resolveCreatorDispatchBase();
      const transferUrl = `${apiBaseUrl}?op=transfer-design&logged_in_customer_id=${encodeURIComponent(ownerId)}&shop=${encodeURIComponent(window.Shopify?.shop || 'allyoucanpink.myshopify.com')}`;
      
      const response = await fetch(transferUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          design_id: currentDesign.id,
          new_creator_name: newCreatorName,
        }),
      });
      
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error(data.error || data.message || window.CreatorI18n?.transferFailed || 'Fehler beim Übertragen');
      }
      
      console.log('✅ Design transferred successfully', data);
      
      // Save ownerId and designId before closing modal (needed for later operations)
      const savedOwnerId = currentDesign.owner_id || 
                           (() => {
                             const urlParams = new URLSearchParams(window.location.search);
                             return urlParams.get('logged_in_customer_id') || 
                                    urlParams.get('owner_id') || 
                                    (window.CreatorWidget && window.CreatorWidget.getOwnerId ? window.CreatorWidget.getOwnerId() : null) ||
                                    (window.Shopify?.customerId ? window.Shopify.customerId.toString() : null);
                           })();
      const savedDesignId = currentDesign.id;
      const savedSessionId = data.session_id;
      const hasQueueJob = data.queue_enqueued === true && savedSessionId;
      
      // Update currentDesign with new creator_name
      if (data.design) {
        currentDesign.creator_name = data.design.creator_name;
      }
      
      // Close preview modal first
      doCloseModal();
      
      // If queue job was created, show different message and handle differently
      if (hasQueueJob) {
        // Show message that products will be updated
        const successMessage = `Design erfolgreich übertragen.\n\nDie publizierten Produkte werden aktualisiert...`;
        
        // Show success dialog and handle queue job when OK is clicked
        showSuccessDialog(successMessage, function() {
          // Switch to published products tab in Creator Design Modal
          // The modal should still be open, just switch the tab
          if (window.CreatorDesignModal && typeof window.CreatorDesignModal.switchTab === 'function') {
            window.CreatorDesignModal.switchTab('published');
          }
          
          // Start polling for transfer progress (will use the same progress UI as publish)
          if (savedSessionId) {
            // Dispatch event so Creator Design Modal can start polling
            window.dispatchEvent(new CustomEvent('transfer-progress-started', {
              detail: { sessionId: savedSessionId, designId: savedDesignId, ownerId: savedOwnerId }
            }));
          }
          
          // Switch to the new creator and reload designs on My Creations page
          switchCreatorAndReload(newCreatorName, savedOwnerId);
        });
      } else {
        // No products to update - close creator design modal as well
        if (window.CreatorDesignModal && typeof window.CreatorDesignModal.close === 'function') {
          window.CreatorDesignModal.close();
        }
        
        // Wait a bit for modals to close visually, then show success dialog
        setTimeout(() => {
          // Show success message in same style as confirmation dialogs
          const productsText = data.products_updated > 0 
            ? ` und ${data.products_updated} ${data.products_updated === 1 ? 'Produkt' : 'Produkte'} aktualisiert`
            : '';
          const successMessage = `Design erfolgreich auf "${newCreatorName}" übertragen${productsText}.`;
          
          // Show success dialog and switch creator + reload designs when OK is clicked
          showSuccessDialog(successMessage, function() {
            // Switch to the new creator and reload designs on My Creations page
            console.log('🔄 Calling switchCreatorAndReload with:', { newCreatorName, savedOwnerId });
            switchCreatorAndReload(newCreatorName, savedOwnerId);
          });
        }, 200);
      }
      
    } catch (error) {
      console.error('Error transferring design:', error);
      alert((window.CreatorI18n?.transferFailed || 'Fehler beim Übertragen') + ': ' + (error.message || window.CreatorI18n?.errorUnknown || 'Unbekannter Fehler'));
    }
  }
  
  // Show success dialog (same style as confirmation dialogs)
  function showSuccessDialog(message, onOk = null) {
    const modalOverlay = document.createElement('div');
    modalOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,0.96);z-index:999999;display:flex;align-items:center;justify-content:center;';
    
    const modalBox = document.createElement('div');
    modalBox.style.cssText = 'background:rgba(192,132,252,0.18);border-radius:12px;padding:32px;max-width:500px;width:90%;border:1px solid #020617;';
    
    modalBox.innerHTML = `
      <div style="color:#e5e7eb;font-size:18px;font-weight:600;margin-bottom:20px;text-align:center;white-space:pre-line;">
        ${escapeHtml(message)}
      </div>
      <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;">
        <button type="button" class="creator-confirm-ok" style="padding:12px 24px;background:#F59E0B;color:#020617;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.2s;">
          OK
        </button>
      </div>
    `;
    
    modalOverlay.appendChild(modalBox);
    document.body.appendChild(modalOverlay);
    
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }
    
    const okBtn = modalBox.querySelector('.creator-confirm-ok');
    
    // Hover-Effekt
    if (okBtn) {
      okBtn.addEventListener('mouseenter', function() {
        this.style.opacity = '0.9';
      });
      okBtn.addEventListener('mouseleave', function() {
        this.style.opacity = '1';
      });
    }
    
    const close = function() {
      if (document.body.contains(modalOverlay)) {
        document.body.removeChild(modalOverlay);
        if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
          window.CreatorModalPhysics.unlockBodyScroll();
        }
        // Call onOk callback after closing
        if (onOk && typeof onOk === 'function') {
          onOk();
        }
      }
    };
    
    if (okBtn) {
      okBtn.addEventListener('click', close);
    }
    
    modalOverlay.addEventListener('click', function(e) {
      if (e.target === modalOverlay) {
        close();
      }
    });
    
    // ESC-Taste zum Schließen
    const handleEsc = function(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }
  
  // Switch creator in dropdown and reload designs on My Creations page
  async function switchCreatorAndReload(newCreatorName, ownerId = null) {
    // Only on My Creations page
    const p = window.location.pathname || '';
    if (p.indexOf('/pages/creator-dashboard') === -1 && p.indexOf('/pages/my-creations') === -1) {
      return;
    }
    
    console.log('🔄 Switching creator to:', newCreatorName, 'with ownerId:', ownerId);
    
    // Use provided ownerId, or try to get it from other sources
    if (!ownerId) {
      console.log('⚠️ No ownerId provided, trying to get from other sources');
      ownerId = (() => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('logged_in_customer_id') || 
               urlParams.get('owner_id') || 
               (window.CreatorWidget && window.CreatorWidget.getOwnerId ? window.CreatorWidget.getOwnerId() : null) ||
               (window.Shopify?.customerId ? window.Shopify.customerId.toString() : null);
      })();
    }
    
    if (!ownerId) {
      console.warn('⚠️ Cannot switch creator: No owner_id found');
      return;
    }
    
    console.log('✅ OwnerId found:', ownerId);
    
    try {
      // Step 1: Save active creator on server
      const apiBaseUrl = resolveCreatorDispatchBase();
      const saveUrl = `${apiBaseUrl}?op=set-active-creator-name&logged_in_customer_id=${encodeURIComponent(ownerId)}`;
      
      const saveResponse = await fetch(saveUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newCreatorName }),
      });
      
      const saveData = await saveResponse.json();
      
      if (!saveData.ok) {
        console.warn('⚠️ Failed to save active creator on server:', saveData.error);
        // Continue anyway - try to update UI
      } else {
        console.log('✅ Active creator saved on server:', newCreatorName);
      }
      
      // Step 2: Update dropdown value
      const dropdown = document.getElementById('creator-selector-dropdown');
      if (dropdown) {
        dropdown.value = newCreatorName;
        console.log('✅ Dropdown value set');
      }
      
      // Step 3: Update global CreatorSettings
      if (window.CreatorSettings) {
        window.CreatorSettings.creatorName = newCreatorName;
      }
      
      // Step 4: Apply filter and reload designs (wait a bit to ensure dropdown is updated)
      setTimeout(() => {
        if (window.CreatorMyCreations && typeof window.CreatorMyCreations.applyCreatorFilter === 'function') {
          console.log('🔄 Applying creator filter and reloading designs');
          window.CreatorMyCreations.applyCreatorFilter(newCreatorName);
        } else {
          // Fallback: Dispatch creator-filter-changed event
          console.log('🔄 Dispatching creator-filter-changed event');
          window.dispatchEvent(new CustomEvent('creator-filter-changed', {
            detail: {
              creatorName: newCreatorName,
              source: 'transfer'
            },
            bubbles: true
          }));
        }
      }, 150);
      
    } catch (error) {
      console.error('❌ Error switching creator:', error);
      // Try to at least update the filter without saving
      if (window.CreatorMyCreations && typeof window.CreatorMyCreations.applyCreatorFilter === 'function') {
        window.CreatorMyCreations.applyCreatorFilter(newCreatorName);
      }
    }
  }
  
  // Start polling for transfer progress
  async function startTransferProgressPolling(sessionId, designId, ownerId) {
    console.log('🔄 Starting transfer progress polling:', { sessionId, designId, ownerId });
    
    // The progress will be displayed in the Creator Design Modal
    // We just need to trigger it - the modal should handle the display
    // For now, we'll use a simple approach: pass the sessionId to the modal
    if (window.CreatorDesignModal) {
      // Store sessionId in a way the modal can access it
      if (!window.CreatorDesignModal._transferSessions) {
        window.CreatorDesignModal._transferSessions = new Set();
      }
      window.CreatorDesignModal._transferSessions.add(sessionId);
      window.CreatorDesignModal._currentTransferSessionId = sessionId;
      window.CreatorDesignModal._currentTransferDesignId = designId;
      
      // Dispatch event so modal can listen and start polling
      window.dispatchEvent(new CustomEvent('transfer-progress-started', {
        detail: { sessionId, designId, ownerId }
      }));
    }
  }
  
  // Helper: Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.CreatorDesignPreviewModal.close = function() {
    // Try to initialize if not already done OR if modal element is null
    // Use || instead of && so we refresh DOM elements even if initialized but modal became null
    if (!isInitialized || !modal) {
      getDOMElements();
    }
    closeModal();
  };
  
  console.log('CreatorDesignPreviewModal API ready', window.CreatorDesignPreviewModal);

  // Initialize
  function initialize() {
    if (init()) {
      console.log('Creator Design Preview Modal ready');
    } else {
      console.warn('Creator Design Preview Modal element not found, will retry on open');
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // DOM already loaded, but give it a moment for the modal HTML to be rendered
    setTimeout(initialize, 100);
  }
})();
