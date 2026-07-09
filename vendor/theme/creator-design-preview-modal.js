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
  let currentDesign = null;
  let originalVisibility = null; // Original visibility when modal opens
  let currentVisibility = null; // Current visibility (may differ from original if changed)
  let hasUnsavedChanges = false; // Track if there are unsaved changes
  let isSaving = false; // Track if save is in progress
  let isInitialized = false;

  /** Manual crop overlay (pixel rect in natural coordinates of the crop-session image). */
  let manualCropActive = false;
  let manualCropRect = null;
  let manualCropInitialRect = null;
  let manualCropDirty = false;
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

  // Sidebar / tabs
  let modalShell = null;
  let drawerToggle = null;
  let drawerBackdrop = null;
  let sidebarNav = null;
  let activeTab = 'overview';
  let draftMeta = null;
  let metaDirty = false;
  let metaSaving = false;
  let metaHistoryOpen = false;

  // Edit Design tab state
  let editImageEl = null;
  let editImageWrap = null;
  let editMaskCanvas = null;
  let editColorCanvas = null;
  let editVersions = [];
  let editHistoryIndex = 0;
  let editHistoryOpen = false;
  let editDesignColorsOpen = false;
  let editBgMode = 'complete';
  let editPickedColors = [];
  let editPaletteColors = [];
  let editColorTolerance = 30;
  let editBrushSize = 28;
  let editColorBrushSize = 28;
  let editColorReplaceMode = 'transparent'; // 'transparent' | 'color'
  let editReplaceTargetColor = null; // {r,g,b} | null
  let editPickReplaceTarget = false;
  let editToolMode = null; // 'eyedropper' | 'brush' | null
  let editActiveTool = 'crop'; // 'crop' | 'remove_bg' | 'remove_color' | 'remove_object'
  let editBrushPainting = false;
  let editMaskDirty = false;
  let editOpBusy = false;
  let editHistoryTouchX = null;
  let viewerBgModalOpen = false;
  const VIEWER_BG_DEFAULT = '#37375A';
  const VIEWER_BG_STORAGE_KEY = 'eaz_cdp_viewer_bg';
  let viewerBgValue = VIEWER_BG_DEFAULT;
  const VIEWER_ZOOM_MIN = 1;
  const VIEWER_ZOOM_MAX = 4;
  const VIEWER_ZOOM_STEP = 0.25;
  /** Per-wrapper zoom/pan: key → { scale, x, y, panMode } */
  let viewerZoomStates = Object.create(null);
  let viewerPanDrag = null;
  let viewerZoomDocListenersBound = false;
  let editColorPreviewTimer = null;
  let editColorPreviewRaf = null;
  let editColorPreviewWorking = null; // reused sample canvas
  let editColorPreviewFull = null; // reused natural-size canvas for downscale
  let editColorLivePreviewActive = false;
  let editSourceImageData = null;
  let editSourceImageKey = '';
  let editSourceNaturalW = 0;
  let editSourceNaturalH = 0;
  /** Server preview version shown in viewer but not yet applied to the live design. */
  let editPendingPreviewVersion = null;
  let editPendingPreviewTool = null;
  let editPendingPreviewBaselineUrl = null;

  // Get modal element
  function getModal() {
    if (!modal) {
      modal = document.getElementById('creatorDesignPreviewModal-design-preview');
    }
    return modal;
  }

  function tPreview(key, fallback) {
    var map = window.CreatorI18n || {};
    var full = 'creator.preview_modal.' + key;
    if (map[full] != null && String(map[full]).trim() !== '') return String(map[full]);
    if (map[key] != null && String(map[key]).trim() !== '') return String(map[key]);
    return fallback || key;
  }

  function parseDesignMetadata(design) {
    if (!design || !design.metadata) return {};
    try {
      return typeof design.metadata === 'string' ? JSON.parse(design.metadata) : Object.assign({}, design.metadata);
    } catch (e) {
      return {};
    }
  }

  function cloneMeta(meta) {
    try {
      return JSON.parse(JSON.stringify(meta || {}));
    } catch (e) {
      return Object.assign({}, meta || {});
    }
  }

  function normalizeStringList(value) {
    if (Array.isArray(value)) {
      return value.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
    }
    return [];
  }

  function setDrawerOpen(open) {
    getDOMElements();
    if (!modalShell) return;
    modalShell.classList.toggle('is-drawer-open', !!open);
    if (drawerToggle) drawerToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function mountProductsPanelIfNeeded() {
    var panelApi = window.CreatorDesignProductsPanel;
    if (!panelApi || typeof panelApi.mount !== 'function' || !currentDesign) return;
    var host =
      document.getElementById('cdp-products-root-' + sectionId) ||
      (modal && modal.querySelector('[data-cdp-products-root]'));
    if (!host) return;
    panelApi.mount({ host: host, design: currentDesign });
  }

  function unmountProductsPanel() {
    var panelApi = window.CreatorDesignProductsPanel;
    if (panelApi && typeof panelApi.unmount === 'function') {
      panelApi.unmount();
    }
  }

  function setActiveTab(tabName) {
    getDOMElements();
    var next = String(tabName || 'overview').toLowerCase();
    if (next !== 'overview' && next !== 'edit' && next !== 'metadata' && next !== 'products') {
      next = 'overview';
    }
    var prevTab = activeTab;
    activeTab = next;
    if (!modal) return;
    modal.querySelectorAll('[data-cdp-tab]').forEach(function (btn) {
      var on = String(btn.getAttribute('data-cdp-tab') || '') === next;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    modal.querySelectorAll('[data-cdp-panel]').forEach(function (panel) {
      var on = String(panel.getAttribute('data-cdp-panel') || '') === next;
      panel.classList.toggle('is-active', on);
      if (on) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
    });
    setDrawerOpen(false);
    if (next === 'edit') {
      refreshEditPreviewImage();
      setEditActiveTool(editActiveTool || 'crop', { force: true });
      loadEditVersions();
    }
    if (next === 'metadata') renderMetadataPanel(currentDesign);
    if (modalShell) {
      modalShell.classList.toggle('cdp-modal--products-tab', next === 'products');
    }
    if (next === 'products') {
      mountProductsPanelIfNeeded();
    } else if (prevTab === 'products') {
      unmountProductsPanel();
    }
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

    editImageEl = document.getElementById('cdp-edit-image-' + sectionId);
    editImageWrap = document.getElementById('cdp-edit-image-wrap-' + sectionId);
    editMaskCanvas = document.getElementById('cdp-edit-mask-canvas-' + sectionId);
    editColorCanvas = document.getElementById('cdp-edit-color-canvas-' + sectionId);

    modalShell = modal ? modal.querySelector('.cdp-modal') : null;
    drawerToggle = document.getElementById('cdp-drawer-toggle-' + sectionId);
    drawerBackdrop = document.getElementById('cdp-drawer-backdrop-' + sectionId);
    sidebarNav = document.getElementById('cdp-sidebar-' + sectionId);

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
    if (editImageEl) editImageEl.src = url;
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
    if (editImageEl) editImageEl.src = url;
  }

  function pushImagesForManualCropSession() {
    var url = cropSourceUrlForSession(currentDesign);
    if (!url) return false;
    var busted = cacheBustSrc(url);
    if (modalImage) modalImage.src = busted;
    if (modalImageMobile) modalImageMobile.src = busted;
    if (modalImageMobileUploaded) modalImageMobileUploaded.src = busted;
    if (editImageEl) editImageEl.src = busted;
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
    // Overview crop chrome removed; Edit Design crop trigger still updates via label helper.
    updateEditCropTriggerLabel();
  }

  function normalizeViewerBgValue(value) {
    var raw = String(value || '').trim();
    if (!raw) return VIEWER_BG_DEFAULT;
    if (raw.toLowerCase() === 'checker' || raw.toLowerCase() === 'checkerboard') return 'checker';
    var hex = raw.toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
    if (/^#[0-9a-f]{3}$/.test(hex)) {
      return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return VIEWER_BG_DEFAULT;
  }

  function loadViewerBgFromStorage() {
    try {
      var stored = window.localStorage && window.localStorage.getItem(VIEWER_BG_STORAGE_KEY);
      if (stored) viewerBgValue = normalizeViewerBgValue(stored);
    } catch (_) {}
  }

  function persistViewerBg(value) {
    try {
      if (window.localStorage) window.localStorage.setItem(VIEWER_BG_STORAGE_KEY, value);
    } catch (_) {}
  }

  function applyViewerBgToTargets() {
    if (!modal) return;
    var isChecker = viewerBgValue === 'checker';
    var color = isChecker ? VIEWER_BG_DEFAULT : viewerBgValue;
    var targets = modal.querySelectorAll(
      '.cdp-modal__panel--overview .cdp-modal__image-wrapper, .cdp-modal__edit-image-wrap, .cdp-modal__edit-history-slide-wrap'
    );
    targets.forEach(function (el) {
      if (isChecker) {
        el.classList.add('is-checker-bg');
        el.style.background = '';
        el.style.backgroundColor = '';
      } else {
        el.classList.remove('is-checker-bg');
        el.style.backgroundImage = 'none';
        el.style.backgroundColor = color;
      }
    });
    modal.querySelectorAll('.cdp-modal__viewer-bg-swatch').forEach(function (swatch) {
      if (isChecker) {
        swatch.classList.add('is-checker');
        swatch.style.background = '';
        swatch.style.backgroundColor = '';
      } else {
        swatch.classList.remove('is-checker');
        swatch.style.backgroundImage = 'none';
        swatch.style.backgroundColor = color;
      }
    });
    var currentSwatch = document.getElementById('cdp-viewer-bg-current-swatch-' + sectionId);
    var hexEl = document.getElementById('cdp-viewer-bg-hex-' + sectionId);
    var picker = document.getElementById('cdp-viewer-bg-picker-' + sectionId);
    if (currentSwatch) {
      if (isChecker) {
        currentSwatch.classList.add('is-checker');
        currentSwatch.style.background = '';
        currentSwatch.style.backgroundColor = '';
      } else {
        currentSwatch.classList.remove('is-checker');
        currentSwatch.style.backgroundImage = 'none';
        currentSwatch.style.backgroundColor = color;
      }
    }
    if (hexEl) {
      hexEl.textContent = isChecker
        ? tPreview('viewer_bg_preset_checker', 'Checkerboard')
        : color.toUpperCase();
    }
    if (picker && !isChecker) picker.value = color;
    var presets = document.getElementById('cdp-viewer-bg-presets-' + sectionId);
    if (presets) {
      presets.querySelectorAll('[data-cdp-viewer-bg]').forEach(function (btn) {
        var v = normalizeViewerBgValue(btn.getAttribute('data-cdp-viewer-bg'));
        btn.classList.toggle('is-selected', v === viewerBgValue);
      });
    }
  }

  function setViewerBg(value, opts) {
    var next = normalizeViewerBgValue(value);
    viewerBgValue = next;
    if (!opts || opts.persist !== false) persistViewerBg(next);
    applyViewerBgToTargets();
  }

  function openViewerBgModal() {
    var el = document.getElementById('cdp-viewer-bg-modal-' + sectionId);
    if (!el) return;
    viewerBgModalOpen = true;
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
    el.classList.add('is-open');
    applyViewerBgToTargets();
  }

  function closeViewerBgModal() {
    var el = document.getElementById('cdp-viewer-bg-modal-' + sectionId);
    if (!el) return;
    viewerBgModalOpen = false;
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
    el.classList.remove('is-open');
  }

  function bindViewerBgControls() {
    if (!modal || modal.__cdpViewerBgBound) return;
    modal.__cdpViewerBgBound = true;
    loadViewerBgFromStorage();
    applyViewerBgToTargets();

    modal.querySelectorAll('[data-cdp-viewer-bg-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openViewerBgModal();
      });
    });

    var closeBtn = document.getElementById('cdp-viewer-bg-close-' + sectionId);
    if (closeBtn) closeBtn.addEventListener('click', closeViewerBgModal);
    var doneBtn = document.getElementById('cdp-viewer-bg-done-' + sectionId);
    if (doneBtn) doneBtn.addEventListener('click', closeViewerBgModal);
    var resetBtn = document.getElementById('cdp-viewer-bg-reset-' + sectionId);
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        setViewerBg(VIEWER_BG_DEFAULT);
      });
    }
    var picker = document.getElementById('cdp-viewer-bg-picker-' + sectionId);
    if (picker) {
      picker.addEventListener('input', function () {
        setViewerBg(picker.value);
      });
      picker.addEventListener('change', function () {
        setViewerBg(picker.value);
      });
    }
    var presets = document.getElementById('cdp-viewer-bg-presets-' + sectionId);
    if (presets) {
      presets.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-cdp-viewer-bg]') : null;
        if (!btn) return;
        setViewerBg(btn.getAttribute('data-cdp-viewer-bg'));
      });
    }
    var bgModal = document.getElementById('cdp-viewer-bg-modal-' + sectionId);
    if (bgModal) {
      bgModal.addEventListener('click', function (e) {
        if (e.target === bgModal) closeViewerBgModal();
      });
    }
  }

  function viewerZoomKeyForWrap(wrap) {
    if (!wrap) return 'default';
    if (wrap.id) return wrap.id;
    var stage = wrap.querySelector('[data-cdp-zoom-stage]');
    if (stage) return 'stage:' + (stage.getAttribute('data-cdp-zoom-stage') || 'anon');
    return 'wrap';
  }

  function getViewerZoomState(wrap) {
    var key = viewerZoomKeyForWrap(wrap);
    if (!viewerZoomStates[key]) {
      viewerZoomStates[key] = { scale: 1, x: 0, y: 0, panMode: false };
    }
    return viewerZoomStates[key];
  }

  function isViewerPanMode(wrap) {
    return !!(wrap && getViewerZoomState(wrap).panMode);
  }

  function clampViewerPan(wrap, state) {
    if (!wrap || !state) return;
    if (state.scale <= 1.001) {
      state.x = 0;
      state.y = 0;
      return;
    }
    var w = wrap.clientWidth || 0;
    var h = wrap.clientHeight || 0;
    var maxX = Math.max(0, (w * (state.scale - 1)) / 2);
    var maxY = Math.max(0, (h * (state.scale - 1)) / 2);
    state.x = Math.max(-maxX, Math.min(maxX, state.x));
    state.y = Math.max(-maxY, Math.min(maxY, state.y));
  }

  function applyViewerZoomTransform(wrap) {
    if (!wrap) return;
    var state = getViewerZoomState(wrap);
    clampViewerPan(wrap, state);
    var stage = wrap.querySelector('.cdp-modal__zoom-stage');
    if (stage) {
      stage.style.transform =
        'translate(' + state.x + 'px, ' + state.y + 'px) scale(' + state.scale + ')';
    }
    wrap.classList.toggle('is-pan-mode', !!state.panMode);
    wrap.classList.toggle('is-zoomed', state.scale > 1.001);
    var chrome = wrap.querySelector('.cdp-modal__zoom-chrome');
    if (chrome) {
      var outBtn = chrome.querySelector('[data-cdp-zoom-out]');
      var inBtn = chrome.querySelector('[data-cdp-zoom-in]');
      var panBtn = chrome.querySelector('[data-cdp-pan-toggle]');
      if (outBtn) outBtn.disabled = state.scale <= VIEWER_ZOOM_MIN + 0.001;
      if (inBtn) inBtn.disabled = state.scale >= VIEWER_ZOOM_MAX - 0.001;
      if (panBtn) {
        panBtn.classList.toggle('is-active', !!state.panMode);
        panBtn.setAttribute('aria-pressed', state.panMode ? 'true' : 'false');
        var panLabel = state.panMode
          ? tPreview('viewer_pan_mode_active', 'Exit move mode')
          : tPreview('viewer_pan_mode', 'Move image');
        panBtn.setAttribute('aria-label', panLabel);
        panBtn.setAttribute('title', panLabel);
      }
    }
  }

  function setViewerZoom(wrap, nextScale, opts) {
    opts = opts || {};
    if (!wrap) return;
    var state = getViewerZoomState(wrap);
    var scale = Math.max(VIEWER_ZOOM_MIN, Math.min(VIEWER_ZOOM_MAX, Number(nextScale) || 1));
    // Round to avoid float drift on repeated +/- clicks.
    scale = Math.round(scale / VIEWER_ZOOM_STEP) * VIEWER_ZOOM_STEP;
    state.scale = scale;
    if (scale <= 1.001) {
      state.x = 0;
      state.y = 0;
      if (!opts.keepPanMode) state.panMode = false;
    }
    applyViewerZoomTransform(wrap);
    if (wrap === editImageWrap) updateEditToolModeUi();
  }

  function nudgeViewerZoom(wrap, delta) {
    if (!wrap) return;
    var state = getViewerZoomState(wrap);
    setViewerZoom(wrap, state.scale + delta);
  }

  function setViewerPanMode(wrap, enabled) {
    if (!wrap) return;
    var state = getViewerZoomState(wrap);
    state.panMode = !!enabled;
    if (!state.panMode && viewerPanDrag && viewerPanDrag.wrap === wrap) {
      endViewerPanDrag();
    }
    applyViewerZoomTransform(wrap);
    if (wrap === editImageWrap) updateEditToolModeUi();
  }

  function resetViewerZoom(wrap) {
    if (!wrap) return;
    var key = viewerZoomKeyForWrap(wrap);
    viewerZoomStates[key] = { scale: 1, x: 0, y: 0, panMode: false };
    wrap.classList.remove('is-panning');
    applyViewerZoomTransform(wrap);
  }

  function resetAllViewerZooms() {
    if (!modal) return;
    if (viewerPanDrag) endViewerPanDrag();
    modal.querySelectorAll('.cdp-modal__image-wrapper, .cdp-modal__edit-image-wrap').forEach(function (wrap) {
      if (wrap.querySelector('.cdp-modal__zoom-stage')) resetViewerZoom(wrap);
    });
  }

  function endViewerPanDrag() {
    if (!viewerPanDrag) return;
    var wrap = viewerPanDrag.wrap;
    if (wrap) wrap.classList.remove('is-panning');
    viewerPanDrag = null;
  }

  function onViewerPanPointerMove(e) {
    if (!viewerPanDrag) return;
    if (viewerPanDrag.pointerId != null && e.pointerId !== viewerPanDrag.pointerId) return;
    var state = getViewerZoomState(viewerPanDrag.wrap);
    state.x = viewerPanDrag.startX + (e.clientX - viewerPanDrag.originX);
    state.y = viewerPanDrag.startY + (e.clientY - viewerPanDrag.originY);
    applyViewerZoomTransform(viewerPanDrag.wrap);
    e.preventDefault();
  }

  function onViewerPanPointerUp(e) {
    if (!viewerPanDrag) return;
    if (viewerPanDrag.pointerId != null && e.pointerId !== viewerPanDrag.pointerId) return;
    var wrap = viewerPanDrag.wrap;
    if (wrap && wrap.releasePointerCapture) {
      try { wrap.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    endViewerPanDrag();
  }

  function ensureViewerZoomDocListeners() {
    if (viewerZoomDocListenersBound) return;
    viewerZoomDocListenersBound = true;
    document.addEventListener('pointermove', onViewerPanPointerMove);
    document.addEventListener('pointerup', onViewerPanPointerUp);
    document.addEventListener('pointercancel', onViewerPanPointerUp);
  }

  function bindViewerZoomControls() {
    if (!modal || modal.__cdpZoomBound) return;
    modal.__cdpZoomBound = true;
    ensureViewerZoomDocListeners();

    modal.addEventListener('click', function (e) {
      var zoomBtn = e.target && e.target.closest
        ? e.target.closest('[data-cdp-zoom-in], [data-cdp-zoom-out], [data-cdp-pan-toggle]')
        : null;
      if (!zoomBtn || !modal.contains(zoomBtn)) return;
      var wrap = zoomBtn.closest('.cdp-modal__image-wrapper, .cdp-modal__edit-image-wrap');
      if (!wrap) return;
      e.preventDefault();
      e.stopPropagation();
      if (zoomBtn.hasAttribute('data-cdp-zoom-in')) {
        nudgeViewerZoom(wrap, VIEWER_ZOOM_STEP);
        return;
      }
      if (zoomBtn.hasAttribute('data-cdp-zoom-out')) {
        nudgeViewerZoom(wrap, -VIEWER_ZOOM_STEP);
        return;
      }
      if (zoomBtn.hasAttribute('data-cdp-pan-toggle')) {
        var state = getViewerZoomState(wrap);
        if (!state.panMode && state.scale <= 1.001) {
          // Entering pan without zoom is useless — nudge in first.
          setViewerZoom(wrap, 1 + VIEWER_ZOOM_STEP);
        }
        setViewerPanMode(wrap, !getViewerZoomState(wrap).panMode);
      }
    });

    modal.addEventListener('pointerdown', function (e) {
      var wrap = e.target && e.target.closest
        ? e.target.closest('.cdp-modal__image-wrapper, .cdp-modal__edit-image-wrap')
        : null;
      if (!wrap || !modal.contains(wrap)) return;
      if (!isViewerPanMode(wrap)) return;
      if (e.target.closest && (
        e.target.closest('.cdp-modal__zoom-chrome') ||
        e.target.closest('.cdp-modal__edit-viewer-chrome') ||
        e.target.closest('.cdp-modal__viewer-bg-btn') ||
        e.target.closest('.cdp-modal__edit-history-btn') ||
        e.target.closest('[data-cdp-viewer-bg-open]')
      )) return;
      var state = getViewerZoomState(wrap);
      if (state.scale <= 1.001) return;
      viewerPanDrag = {
        wrap: wrap,
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        startX: state.x,
        startY: state.y,
      };
      wrap.classList.add('is-panning');
      try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  function cropRectsEqual(a, b) {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
  }

  function markManualCropDirtyFromRect() {
    if (!manualCropActive || !manualCropRect || !manualCropInitialRect) {
      manualCropDirty = false;
    } else {
      manualCropDirty = !cropRectsEqual(manualCropRect, manualCropInitialRect);
    }
    updateEditCropTriggerLabel();
  }

  function updateEditCropTriggerLabel() {
    var btn = document.getElementById('cdp-edit-crop-trigger-' + sectionId);
    if (!btn) return;
    var cropLabel = btn.getAttribute('data-label-crop') || tPreview('edit_crop', 'Crop');
    var applyLabel = btn.getAttribute('data-label-apply') || tPreview('edit_crop_apply', 'Apply');
    if (manualCropActive && manualCropDirty) {
      btn.textContent = applyLabel;
    } else {
      btn.textContent = cropLabel;
    }
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
    markManualCropDirtyFromRect();
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

  function getCropCandidateImages() {
    var list = [modalImage, modalImageMobile, modalImageMobileUploaded, editImageEl].filter(Boolean);
    if (activeTab === 'edit' && editImageEl) {
      return [editImageEl].concat(list.filter(function (img) { return img !== editImageEl; }));
    }
    return list;
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
    manualCropInitialRect = null;
    manualCropDirty = false;
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
    updateEditCropTriggerLabel();
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
    resetEditToolModes({ keepCrop: true });
    var imgs = getCropCandidateImages();

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
      manualCropInitialRect = { x: 0, y: 0, w: iw, h: ih };
      manualCropDirty = false;
      manualCropUiNaturalW = iw;
      manualCropUiNaturalH = ih;
      manualCropActive = true;
      setCropButtonsSaveMode(true);
      updateEditCropTriggerLabel();
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
    var wrap = e.target.closest('.cdp-modal__image-wrapper, .cdp-modal__edit-image-wrap');
    if (wrap && isViewerPanMode(wrap)) return;
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
    markManualCropDirtyFromRect();
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
    markManualCropDirtyFromRect();
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

    // Escape key — nested overlays first, then crop mode, then main modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.getAttribute('aria-hidden') === 'false') {
        e.preventDefault();
        if (viewerBgModalOpen) {
          closeViewerBgModal();
          return;
        }
        if (editHistoryOpen) {
          closeEditHistoryModal();
          return;
        }
        if (editDesignColorsOpen) {
          closeDesignColorsModal();
          return;
        }
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

    bindViewerBgControls();

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

    bindSidebarControls();
    bindViewerZoomControls();
    bindEditDesignControls();
    setActiveTab('overview');
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
  function openModal(design, options) {
    console.log('CreatorDesignPreviewModal.openModal called', { design, modal: !!modal, isInitialized, options });
    
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
    var opts = options && typeof options === 'object' ? options : {};
    var initialTab = String(opts.screen || opts.tab || 'overview').toLowerCase();
    if (initialTab !== 'overview' && initialTab !== 'edit' && initialTab !== 'metadata' && initialTab !== 'products') {
      initialTab = 'overview';
    }

    exitManualCropMode();
    unmountProductsPanel();

    // Initialize visibility state - will be set properly in updateDesignInfo, but set defaults here
    originalVisibility = null;
    currentVisibility = null;
    hasUnsavedChanges = false;
    isSaving = false;
    draftMeta = null;
    metaDirty = false;
    metaSaving = false;
    metaHistoryOpen = false;
    editVersions = [];
    editHistoryIndex = 0;
    editPickedColors = [];
    editPaletteColors = [];
    editBgMode = 'complete';
    editToolMode = null;
    editActiveTool = 'crop';
    editMaskDirty = false;
    editSourceImageData = null;
    editSourceImageKey = '';
    closeEditHistoryModal();
    closeDesignColorsModal();
    closeViewerBgModal();
    clearColorPreview();
    resetAllViewerZooms();
    resetDeleteButtonState();
    setActiveTab(initialTab);
    setDrawerOpen(false);
    renderEditColorChips();
    clearEditMask(true);
    updateEditActionButtons();

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
    applyViewerBgToTargets();
    
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
    refreshEditPreviewImage();
    if (activeTab === 'edit') {
      loadEditVersions();
    }
    if (!draftMeta || activeTab === 'metadata') {
      renderMetadataPanel(design, { forceReset: activeTab !== 'metadata' || !metaDirty });
    }
  }

  function setRefText(el, value) {
    if (!el) return;
    var text = value != null && String(value).trim() !== '' ? String(value) : '–';
    el.textContent = text;
  }

  function uniqueUrls(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (url) {
      var u = String(url || '').trim();
      if (!u || seen[u]) return;
      seen[u] = true;
      out.push(u);
    });
    return out;
  }

  function refreshEditPreviewImage() {
    if (!editImageEl) {
      editImageEl = document.getElementById('cdp-edit-image-' + sectionId);
    }
    if (!editImageEl || !currentDesign) return;
    var raw = primaryDesignImageUrl(currentDesign);
    var url = cacheBustSrc(normalizePersistedFileUrl(raw));
    if (url) {
      try { editImageEl.crossOrigin = 'anonymous'; } catch (_) {}
      editImageEl.onload = function () {
        editSourceImageData = null;
        editSourceImageKey = '';
        syncEditMaskCanvasSize();
        syncEditColorCanvasSize();
        if (editActiveTool === 'remove_color') scheduleColorPreview();
      };
      editImageEl.src = url;
    }
    syncEditMaskCanvasSize();
    syncEditColorCanvasSize();
  }

  function applyDesignFromEditResponse(designOut) {
    if (!designOut || !currentDesign) return;
    currentDesign.original_url = normalizePersistedFileUrl(designOut.original_url || currentDesign.original_url);
    currentDesign.preview_url = normalizePersistedFileUrl(designOut.preview_url || currentDesign.preview_url);
    currentDesign.image_url = normalizePersistedFileUrl(
      designOut.image_url || designOut.preview_url || designOut.original_url || currentDesign.image_url
    );
    if (designOut.width) currentDesign.width = designOut.width;
    if (designOut.height) currentDesign.height = designOut.height;
    if (designOut.r2_key_original) currentDesign.r2_key_original = designOut.r2_key_original;
    if (designOut.r2_key_preview) currentDesign.r2_key_preview = designOut.r2_key_preview;
    refreshModalDesignImagesAfterCrop();
    refreshEditPreviewImage();
  }

  function setEditBusy(busy, message) {
    editOpBusy = !!busy;
    setCropBusyVisible(!!busy);
    if (busy && cropBusyOverlay) {
      var textEl = cropBusyOverlay.querySelector('.cdp-modal__crop-busy-text');
      if (textEl) {
        textEl.textContent = message || tPreview('edit_processing', 'Processing edit…');
      }
    }
    if (!busy && cropBusyOverlay) {
      var resetEl = cropBusyOverlay.querySelector('.cdp-modal__crop-busy-text');
      if (resetEl) {
        resetEl.textContent = tPreview('crop_processing', 'Cropping design…');
      }
    }
    var tools = document.getElementById('cdp-edit-tools-' + sectionId);
    if (tools) {
      tools.querySelectorAll('button, input').forEach(function (el) {
        if (busy) {
          el.dataset.cdpPrevDisabled = el.disabled ? '1' : '0';
          el.disabled = true;
        } else if (el.dataset.cdpPrevDisabled != null) {
          el.disabled = el.dataset.cdpPrevDisabled === '1';
          delete el.dataset.cdpPrevDisabled;
        }
      });
    }
  }

  function resetEditToolModes(opts) {
    opts = opts || {};
    editToolMode = null;
    editBrushPainting = false;
    if (editImageWrap) {
      editImageWrap.classList.remove('is-eyedropper', 'is-brushing');
    }
    if (!opts.keepMask) {
      // mask cleared only when explicitly requested
    }
    syncEditMaskCanvasSize();
    syncEditColorCanvasSize();
    updateEditToolModeUi();
    updateEditActionButtons();
  }

  function updateEditToolModeUi() {
    if (!editImageWrap) return;
    editImageWrap.classList.toggle('is-eyedropper', editToolMode === 'eyedropper' && !isViewerPanMode(editImageWrap));
    editImageWrap.classList.toggle('is-brushing', editToolMode === 'brush' && !isViewerPanMode(editImageWrap));
  }

  function setEditActiveTool(tool, opts) {
    opts = opts || {};
    var next = String(tool || 'crop');
    if (['crop', 'remove_bg', 'remove_color', 'remove_object'].indexOf(next) < 0) next = 'crop';
    var prevTool = editActiveTool;
    if (!opts.force && editActiveTool === next) {
      // still refresh modes for current tool
    } else {
      editActiveTool = next;
    }
    if (!modal) getDOMElements();
    if (modal) {
      modal.querySelectorAll('[data-cdp-edit-tool]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-cdp-edit-tool') === editActiveTool);
      });
      modal.querySelectorAll('[data-cdp-edit-panel]').forEach(function (panel) {
        var on = panel.getAttribute('data-cdp-edit-panel') === editActiveTool;
        panel.classList.toggle('is-active', on);
        if (on) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      });
    }
    if (manualCropActive && editActiveTool !== 'crop') exitManualCropMode();
    if (prevTool !== editActiveTool && editPendingPreviewVersion) {
      clearPendingEditPreview({ restoreBaseline: true, silent: true });
    }
    // Brush mask is shared; clear when switching between tools that use it differently.
    if (prevTool !== editActiveTool && editMaskDirty) {
      if (
        (prevTool === 'remove_object' || prevTool === 'remove_color') &&
        (editActiveTool === 'remove_object' || editActiveTool === 'remove_color' ||
          editActiveTool === 'crop' || editActiveTool === 'remove_bg')
      ) {
        clearEditMask(true);
      }
    }
    if (editActiveTool === 'remove_color') {
      editPickReplaceTarget = false;
      updateColorReplaceModeUi();
      enableEyedropperMode();
      scheduleColorPreview();
      refreshColorAreaPalette();
    } else if (editActiveTool === 'remove_object') {
      editPickReplaceTarget = false;
      enableBrushMode();
      clearColorPreview();
    } else {
      editPickReplaceTarget = false;
      editToolMode = null;
      updateEditToolModeUi();
      clearColorPreview();
    }
    updateEditActionButtons();
  }

  function enableEyedropperMode() {
    if (manualCropActive) exitManualCropMode();
    editToolMode = 'eyedropper';
    updateEditToolModeUi();
  }

  function enableBrushMode() {
    if (manualCropActive) exitManualCropMode();
    editToolMode = 'brush';
    syncEditMaskCanvasSize();
    updateEditToolModeUi();
  }

  function syncEditOverlayCanvas(canvas) {
    if (!canvas || !editImageEl) return false;
    // Size to the zoom stage (layout box, not transformed getBoundingClientRect).
    var stage = canvas.closest('.cdp-modal__zoom-stage');
    var box = stage || editImageWrap || canvas.parentElement;
    if (!box) return false;
    var w = Math.max(1, Math.round(box.clientWidth || 0));
    var h = Math.max(1, Math.round(box.clientHeight || 0));
    if (w < 2 || h < 2) return false;
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    return true;
  }

  function syncEditMaskCanvasSize() {
    if (!editMaskCanvas || !editImageEl) return;
    var resized = syncEditOverlayCanvas(editMaskCanvas);
    if (resized) {
      if (editMaskDirty) {
        // previous strokes lost on resize — keep dirty false if empty
        clearEditMask(true);
      } else {
        clearEditMask(true);
      }
    }
  }

  function syncEditColorCanvasSize() {
    if (!editColorCanvas) return;
    syncEditOverlayCanvas(editColorCanvas);
  }

  function clearEditMask(silent) {
    if (!editMaskCanvas) return;
    var ctx = editMaskCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, editMaskCanvas.width, editMaskCanvas.height);
    editMaskDirty = false;
    updateEditActionButtons();
    if (!silent && editActiveTool === 'remove_object') enableBrushMode();
    if (!silent && editActiveTool === 'remove_color') {
      enableEyedropperMode();
      refreshColorAreaPalette();
      scheduleColorPreview();
    }
  }

  function updateEditActionButtons() {
    updateEditCropTriggerLabel();
    var colorBtn = document.getElementById('cdp-edit-remove-color-apply-' + sectionId);
    if (colorBtn) {
      var chooseColor = colorBtn.getAttribute('data-label-choose') || tPreview('edit_choose_color', 'Choose Color');
      var applyColor = colorBtn.getAttribute('data-label-apply') || tPreview('edit_remove_color_apply', 'Apply');
      var canApplyColor = editPickedColors.length && (
        editColorReplaceMode !== 'color' || !!editReplaceTargetColor
      );
      colorBtn.textContent = canApplyColor ? applyColor : chooseColor;
      colorBtn.disabled = !!editOpBusy;
    }
    var objPreviewBtn = document.getElementById('cdp-edit-remove-object-preview-' + sectionId);
    var objApplyBtn = document.getElementById('cdp-edit-remove-object-apply-' + sectionId);
    if (objApplyBtn) {
      var chooseObj = objApplyBtn.getAttribute('data-label-choose') || tPreview('edit_choose_object', 'Choose Object');
      var applyObj = objApplyBtn.getAttribute('data-label-apply') || tPreview('edit_remove_object_apply', 'Apply');
      var hasObjPreview = !!(editPendingPreviewVersion && editPendingPreviewTool === 'remove_object');
      if (editMaskDirty) {
        objApplyBtn.textContent = applyObj;
        objApplyBtn.disabled = !!editOpBusy;
      } else if (hasObjPreview) {
        objApplyBtn.textContent = applyObj;
        objApplyBtn.disabled = !!editOpBusy;
      } else {
        objApplyBtn.textContent = chooseObj;
        objApplyBtn.disabled = !!editOpBusy;
      }
    }
    if (objPreviewBtn) {
      objPreviewBtn.hidden = !editMaskDirty;
      objPreviewBtn.disabled = !!editOpBusy || !editMaskDirty;
    }
    var bgPreviewBtn = document.getElementById('cdp-edit-remove-bg-preview-' + sectionId);
    var bgApplyBtn = document.getElementById('cdp-edit-remove-bg-apply-' + sectionId);
    if (bgPreviewBtn) {
      bgPreviewBtn.disabled = !!editOpBusy;
    }
    if (bgApplyBtn) {
      bgApplyBtn.disabled = !!editOpBusy;
    }
    var clearMask = document.getElementById('cdp-edit-clear-mask-' + sectionId);
    if (clearMask) {
      if (editMaskDirty && editActiveTool === 'remove_object') clearMask.removeAttribute('hidden');
      else clearMask.setAttribute('hidden', '');
    }
    var clearColorMask = document.getElementById('cdp-edit-clear-color-mask-' + sectionId);
    if (clearColorMask) {
      if (editMaskDirty && editActiveTool === 'remove_color') clearColorMask.removeAttribute('hidden');
      else clearColorMask.setAttribute('hidden', '');
    }
    updateReplaceTargetUi();
  }

  function paintEditBrush(clientX, clientY) {
    if (!editMaskCanvas || editToolMode !== 'brush') return;
    var rect = editMaskCanvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    var x = ((clientX - rect.left) / rect.width) * editMaskCanvas.width;
    var y = ((clientY - rect.top) / rect.height) * editMaskCanvas.height;
    var ctx = editMaskCanvas.getContext('2d');
    if (!ctx) return;
    var size = editActiveTool === 'remove_color' ? editColorBrushSize : editBrushSize;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(4, size / 2), 0, Math.PI * 2);
    ctx.fill();
    editMaskDirty = true;
    // New brush strokes invalidate a previous server Preview result.
    if (editPendingPreviewVersion && editPendingPreviewTool === editActiveTool) {
      clearPendingEditPreview({ restoreBaseline: false, silent: true });
    }
    updateEditActionButtons();
    // Live preview + palette refresh run on stroke end (not every pointermove).
  }

  function rgbToHex(color) {
    if (!color) return '#f59e0b';
    function h(n) {
      var s = Math.max(0, Math.min(255, Math.round(Number(n) || 0))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + h(color.r) + h(color.g) + h(color.b);
  }

  function hexToRgb(hex) {
    var m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function setReplaceTargetColor(color, opts) {
    opts = opts || {};
    if (!color) {
      editReplaceTargetColor = null;
    } else {
      editReplaceTargetColor = {
        r: Math.max(0, Math.min(255, Math.round(Number(color.r) || 0))),
        g: Math.max(0, Math.min(255, Math.round(Number(color.g) || 0))),
        b: Math.max(0, Math.min(255, Math.round(Number(color.b) || 0)))
      };
    }
    if (!opts.keepEyedropper) editPickReplaceTarget = false;
    updateReplaceTargetUi();
    updateEditActionButtons();
    scheduleColorPreview();
  }

  function updateReplaceTargetUi() {
    var host = document.getElementById('cdp-edit-replace-target-' + sectionId);
    if (host) {
      if (editColorReplaceMode === 'color') host.removeAttribute('hidden');
      else host.setAttribute('hidden', '');
    }
    var swatch = document.getElementById('cdp-edit-replace-swatch-' + sectionId);
    if (swatch) {
      if (editReplaceTargetColor) {
        swatch.classList.remove('is-empty');
        swatch.style.background = 'rgb(' + editReplaceTargetColor.r + ',' + editReplaceTargetColor.g + ',' + editReplaceTargetColor.b + ')';
      } else {
        swatch.classList.add('is-empty');
        swatch.style.background = '';
      }
    }
    var picker = document.getElementById('cdp-edit-replace-picker-' + sectionId);
    if (picker && editReplaceTargetColor) {
      picker.value = rgbToHex(editReplaceTargetColor);
    }
    var eyeBtn = document.getElementById('cdp-edit-replace-eyedrop-' + sectionId);
    if (eyeBtn) {
      eyeBtn.classList.toggle('is-active', !!editPickReplaceTarget);
    }
    renderReplacePaletteSwatches();
  }

  function updateColorReplaceModeUi() {
    if (!modal) getDOMElements();
    if (modal) {
      modal.querySelectorAll('[data-cdp-color-replace-mode]').forEach(function (btn) {
        btn.classList.toggle(
          'is-active',
          btn.getAttribute('data-cdp-color-replace-mode') === editColorReplaceMode
        );
      });
    }
    updateReplaceTargetUi();
  }

  function setColorReplaceMode(mode) {
    editColorReplaceMode = mode === 'color' ? 'color' : 'transparent';
    if (editColorReplaceMode !== 'color') editPickReplaceTarget = false;
    updateColorReplaceModeUi();
    updateEditActionButtons();
    scheduleColorPreview();
  }

  /**
   * Build a natural-size boolean mask from the brush overlay (same mapping as server mask).
   * Returns { width, height, data: Uint8Array } where data[i]=1 means inside brush.
   */
  function buildNaturalBrushMaskBits() {
    if (!editMaskCanvas || !editImageEl || !editImageEl.naturalWidth || !editMaskDirty) return null;
    var nw = editImageEl.naturalWidth;
    var nh = editImageEl.naturalHeight;
    var out = document.createElement('canvas');
    out.width = nw;
    out.height = nh;
    var octx = out.getContext('2d');
    if (!octx) return null;
    octx.fillStyle = '#000000';
    octx.fillRect(0, 0, nw, nh);

    var src = editMaskCanvas;
    var tmp = document.createElement('canvas');
    tmp.width = src.width;
    tmp.height = src.height;
    var tctx = tmp.getContext('2d');
    if (!tctx) return null;
    tctx.drawImage(src, 0, 0);
    var imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
    var data = imgData.data;
    for (var i = 0; i < data.length; i += 4) {
      var a = data[i + 3];
      if (a > 20) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    tctx.putImageData(imgData, 0, 0);

    var imgRect = editImageEl.getBoundingClientRect();
    var canvasRect = editMaskCanvas.getBoundingClientRect();
    var scaleX = src.width / canvasRect.width;
    var scaleY = src.height / canvasRect.height;
    var dx = (imgRect.left - canvasRect.left) * scaleX;
    var dy = (imgRect.top - canvasRect.top) * scaleY;
    var dw = imgRect.width * scaleX;
    var dh = imgRect.height * scaleY;
    octx.drawImage(tmp, dx, dy, dw, dh, 0, 0, nw, nh);

    var mapped = octx.getImageData(0, 0, nw, nh);
    var bits = new Uint8Array(nw * nh);
    var md = mapped.data;
    for (var p = 0, bi = 0; p < md.length; p += 4, bi++) {
      bits[bi] = md[p] > 20 ? 1 : 0;
    }
    return { width: nw, height: nh, data: bits };
  }

  function isNaturalPixelInBrushMask(maskBits, x, y) {
    if (!maskBits) return true;
    var xi = Math.max(0, Math.min(maskBits.width - 1, Math.round(x)));
    var yi = Math.max(0, Math.min(maskBits.height - 1, Math.round(y)));
    return !!maskBits.data[yi * maskBits.width + xi];
  }

  function buildMaskDataUrlForServer() {
    if (!editMaskCanvas || !editImageEl || !editImageEl.naturalWidth) return null;
    if (!editMaskDirty) return null;
    var nw = editImageEl.naturalWidth;
    var nh = editImageEl.naturalHeight;
    var fit = getImageFitLayout(editImageEl);
    if (!fit) return null;

    var out = document.createElement('canvas');
    out.width = nw;
    out.height = nh;
    var octx = out.getContext('2d');
    if (!octx) return null;
    octx.fillStyle = '#000000';
    octx.fillRect(0, 0, nw, nh);

    var src = editMaskCanvas;
    var tmp = document.createElement('canvas');
    tmp.width = src.width;
    tmp.height = src.height;
    var tctx = tmp.getContext('2d');
    if (!tctx) return null;
    tctx.drawImage(src, 0, 0);
    var imgData = tctx.getImageData(0, 0, tmp.width, tmp.height);
    var data = imgData.data;
    for (var i = 0; i < data.length; i += 4) {
      var a = data[i + 3];
      if (a > 20) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    tctx.putImageData(imgData, 0, 0);

    // Map canvas overlay (full wrap inset) onto the object-fit:contain image area inside the wrap.
    var imgRect = editImageEl.getBoundingClientRect();
    var canvasRect = editMaskCanvas.getBoundingClientRect();
    var scaleX = src.width / canvasRect.width;
    var scaleY = src.height / canvasRect.height;
    var dx = (imgRect.left - canvasRect.left) * scaleX;
    var dy = (imgRect.top - canvasRect.top) * scaleY;
    var dw = imgRect.width * scaleX;
    var dh = imgRect.height * scaleY;

    octx.drawImage(tmp, dx, dy, dw, dh, 0, 0, nw, nh);
    return out.toDataURL('image/png');
  }

  function colorDistance(a, b) {
    var dr = a.r - b.r;
    var dg = a.g - b.g;
    var db = a.b - b.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function ensureEditSourcePixels() {
    if (!editImageEl || !editImageEl.naturalWidth) return null;
    var key = String(editImageEl.currentSrc || editImageEl.src || '') + '|' + editImageEl.naturalWidth + 'x' + editImageEl.naturalHeight;
    if (editSourceImageData && editSourceImageKey === key) return editSourceImageData;
    var canvas = document.createElement('canvas');
    canvas.width = editImageEl.naturalWidth;
    canvas.height = editImageEl.naturalHeight;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    try {
      ctx.drawImage(editImageEl, 0, 0);
      editSourceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      editSourceImageKey = key;
      editSourceNaturalW = canvas.width;
      editSourceNaturalH = canvas.height;
      return editSourceImageData;
    } catch (err) {
      console.warn('[CDP] source pixels unavailable (CORS?)', err);
      return null;
    }
  }

  function extractDesignPalette(maxColors, opts) {
    maxColors = maxColors || 36;
    opts = opts || {};
    var src = ensureEditSourcePixels();
    if (!src) return [];
    var maskBits = opts.maskBits;
    if (opts.useBrushMask && maskBits == null) {
      maskBits = buildNaturalBrushMaskBits();
    }
    var data = src.data;
    var step = Math.max(1, Math.floor((src.width * src.height) / 12000));
    var buckets = {};
    for (var i = 0; i < data.length; i += 4 * step) {
      var a = data[i + 3];
      if (a < 40) continue;
      if (maskBits) {
        var px = (i / 4) % src.width;
        var py = Math.floor(i / 4 / src.width);
        if (!isNaturalPixelInBrushMask(maskBits, px, py)) continue;
      }
      var r = data[i];
      var g = data[i + 1];
      var b = data[i + 2];
      // skip near-transparent / extreme noise by quantizing
      var qr = Math.round(r / 16) * 16;
      var qg = Math.round(g / 16) * 16;
      var qb = Math.round(b / 16) * 16;
      var key = qr + ',' + qg + ',' + qb;
      if (!buckets[key]) buckets[key] = { r: qr, g: qg, b: qb, count: 0 };
      buckets[key].count += 1;
    }
    var list = Object.keys(buckets).map(function (k) { return buckets[k]; });
    list.sort(function (a, b) { return b.count - a.count; });
    var out = [];
    list.forEach(function (c) {
      var tooClose = out.some(function (o) { return colorDistance(o, c) < 28; });
      if (!tooClose) out.push({ r: c.r, g: c.g, b: c.b, count: c.count });
    });
    return out.slice(0, maxColors);
  }

  function refreshColorAreaPalette() {
    editPaletteColors = extractDesignPalette(36, { useBrushMask: !!editMaskDirty });
    if (editDesignColorsOpen) renderDesignColorsGrid();
    if (editColorReplaceMode === 'color') renderReplacePaletteSwatches();
  }

  function renderReplacePaletteSwatches() {
    var host = document.getElementById('cdp-edit-replace-palette-' + sectionId);
    if (!host) return;
    host.innerHTML = '';
    if (editColorReplaceMode !== 'color') return;
    var colors = editPaletteColors.length
      ? editPaletteColors
      : extractDesignPalette(18, { useBrushMask: !!editMaskDirty });
    colors.slice(0, 18).forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cdp-modal__edit-replace-palette-swatch';
      btn.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      btn.title = c.r + ', ' + c.g + ', ' + c.b;
      if (
        editReplaceTargetColor &&
        editReplaceTargetColor.r === c.r &&
        editReplaceTargetColor.g === c.g &&
        editReplaceTargetColor.b === c.b
      ) {
        btn.classList.add('is-selected');
      }
      btn.addEventListener('click', function () {
        setReplaceTargetColor(c);
      });
      host.appendChild(btn);
    });
  }

  function setColorLivePreviewActive(active) {
    editColorLivePreviewActive = !!active;
    if (editImageWrap) {
      editImageWrap.classList.toggle('is-color-live-preview', editColorLivePreviewActive);
    }
  }

  function clearColorPreview() {
    if (editColorPreviewTimer) {
      clearTimeout(editColorPreviewTimer);
      editColorPreviewTimer = null;
    }
    if (editColorPreviewRaf) {
      cancelAnimationFrame(editColorPreviewRaf);
      editColorPreviewRaf = null;
    }
    if (!editColorCanvas) {
      setColorLivePreviewActive(false);
      return;
    }
    var ctx = editColorCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, editColorCanvas.width, editColorCanvas.height);
    setColorLivePreviewActive(false);
  }

  function scheduleColorPreview() {
    if (editColorPreviewTimer) clearTimeout(editColorPreviewTimer);
    // Slightly longer debounce while brushing; snappy for color/slider changes.
    var delay = editBrushPainting ? 120 : 50;
    editColorPreviewTimer = setTimeout(function () {
      editColorPreviewTimer = null;
      if (editColorPreviewRaf) cancelAnimationFrame(editColorPreviewRaf);
      editColorPreviewRaf = requestAnimationFrame(function () {
        editColorPreviewRaf = null;
        renderLiveRemoveColorPreview();
      });
    }, delay);
  }

  /**
   * Client-side live preview of remove/replace color (matches server threshold).
   * Covers the edit image so Transparent holes show the viewer background.
   */
  function renderLiveRemoveColorPreview() {
    if (!editColorCanvas || !editImageEl) return;
    syncEditColorCanvasSize();
    var ctx = editColorCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, editColorCanvas.width, editColorCanvas.height);

    var canPreview =
      editActiveTool === 'remove_color' &&
      editPickedColors.length > 0 &&
      (editColorReplaceMode !== 'color' || !!editReplaceTargetColor);

    if (!canPreview) {
      setColorLivePreviewActive(false);
      return;
    }

    var src = ensureEditSourcePixels();
    if (!src) {
      setColorLivePreviewActive(false);
      return;
    }

    var imgRect = editImageEl.getBoundingClientRect();
    var canvasRect = editColorCanvas.getBoundingClientRect();
    if (imgRect.width < 1 || canvasRect.width < 1) {
      setColorLivePreviewActive(false);
      return;
    }

    var scaleX = editColorCanvas.width / canvasRect.width;
    var scaleY = editColorCanvas.height / canvasRect.height;
    var dx = (imgRect.left - canvasRect.left) * scaleX;
    var dy = (imgRect.top - canvasRect.top) * scaleY;
    var dw = imgRect.width * scaleX;
    var dh = imgRect.height * scaleY;

    // Cap sample size for main-thread cost; still sharp enough for preview.
    var maxEdge = 640;
    var sampleW = Math.max(1, Math.round(Math.min(src.width, maxEdge)));
    var sampleH = Math.max(1, Math.round(sampleW * (src.height / src.width)));
    if (sampleH > maxEdge) {
      sampleH = maxEdge;
      sampleW = Math.max(1, Math.round(sampleH * (src.width / src.height)));
    }

    if (!editColorPreviewWorking) {
      editColorPreviewWorking = document.createElement('canvas');
    }
    var tmp = editColorPreviewWorking;
    if (tmp.width !== sampleW) tmp.width = sampleW;
    if (tmp.height !== sampleH) tmp.height = sampleH;
    var tctx = tmp.getContext('2d', { willReadFrequently: true });
    if (!tctx) {
      setColorLivePreviewActive(false);
      return;
    }

    // Draw source → sample (reuse canvases to avoid alloc churn)
    if (sampleW === src.width && sampleH === src.height) {
      tctx.putImageData(src, 0, 0);
    } else {
      if (!editColorPreviewFull) editColorPreviewFull = document.createElement('canvas');
      var full = editColorPreviewFull;
      if (full.width !== src.width) full.width = src.width;
      if (full.height !== src.height) full.height = src.height;
      var fctx = full.getContext('2d');
      if (!fctx) {
        setColorLivePreviewActive(false);
        return;
      }
      fctx.putImageData(src, 0, 0);
      tctx.clearRect(0, 0, sampleW, sampleH);
      tctx.drawImage(full, 0, 0, sampleW, sampleH);
    }

    var sampled = tctx.getImageData(0, 0, sampleW, sampleH);
    var data = sampled.data;
    var maskBits = editMaskDirty ? buildNaturalBrushMaskBits() : null;
    // Match server: threshold = (tolerance/100) * √(3*255²)
    var tol = Math.max(0, Math.min(100, Number(editColorTolerance) || 0));
    var maxDist = (tol / 100) * Math.sqrt(3 * 255 * 255);
    var doReplace =
      editColorReplaceMode === 'color' &&
      editReplaceTargetColor &&
      Number.isFinite(editReplaceTargetColor.r);
    var rr = doReplace ? editReplaceTargetColor.r : 0;
    var rg = doReplace ? editReplaceTargetColor.g : 0;
    var rb = doReplace ? editReplaceTargetColor.b : 0;
    var scaleToNatX = src.width / sampleW;
    var scaleToNatY = src.height / sampleH;
    var colors = editPickedColors;
    var colorCount = colors.length;

    for (var i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      if (maskBits) {
        var sx = ((i / 4) % sampleW) * scaleToNatX;
        var sy = Math.floor(i / 4 / sampleW) * scaleToNatY;
        if (!isNaturalPixelInBrushMask(maskBits, sx, sy)) continue;
      }
      var pr = data[i];
      var pg = data[i + 1];
      var pb = data[i + 2];
      var matched = false;
      for (var ci = 0; ci < colorCount; ci++) {
        var c = colors[ci];
        var dr = pr - c.r;
        var dg = pg - c.g;
        var db = pb - c.b;
        if (Math.sqrt(dr * dr + dg * dg + db * db) <= maxDist) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
      if (doReplace) {
        data[i] = rr;
        data[i + 1] = rg;
        data[i + 2] = rb;
        // keep alpha (same as server)
      } else {
        data[i + 3] = 0;
      }
    }

    tctx.putImageData(sampled, 0, 0);
    ctx.drawImage(tmp, 0, 0, sampleW, sampleH, dx, dy, dw, dh);
    setColorLivePreviewActive(true);
  }

  function renderEditColorChips() {
    var host = document.getElementById('cdp-edit-color-chips-' + sectionId);
    if (!host) return;
    host.innerHTML = '';
    editPickedColors.forEach(function (c, index) {
      var chip = document.createElement('span');
      chip.className = 'cdp-modal__edit-color-chip';
      var swatch = document.createElement('span');
      swatch.className = 'cdp-modal__edit-color-swatch';
      swatch.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      var label = document.createElement('span');
      label.textContent = c.r + ',' + c.g + ',' + c.b;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Remove');
      btn.textContent = '×';
      btn.addEventListener('click', function () {
        editPickedColors.splice(index, 1);
        renderEditColorChips();
        updateEditActionButtons();
        scheduleColorPreview();
        if (editDesignColorsOpen) renderDesignColorsGrid();
      });
      chip.appendChild(swatch);
      chip.appendChild(label);
      chip.appendChild(btn);
      host.appendChild(chip);
    });
    updateEditActionButtons();
    scheduleColorPreview();
  }

  function isColorSelected(color) {
    return editPickedColors.some(function (c) {
      return c.r === color.r && c.g === color.g && c.b === color.b;
    });
  }

  function togglePickedColor(color) {
    if (!color) return;
    var idx = editPickedColors.findIndex(function (c) {
      return c.r === color.r && c.g === color.g && c.b === color.b;
    });
    if (idx >= 0) editPickedColors.splice(idx, 1);
    else editPickedColors.push({ r: color.r, g: color.g, b: color.b });
    renderEditColorChips();
    if (editDesignColorsOpen) renderDesignColorsGrid();
  }

  function pickColorFromEditImage(clientX, clientY) {
    if (!editImageEl || !editImageEl.naturalWidth) return;
    var nat = pointerToNatural(editImageEl, clientX, clientY);
    if (!nat) return;
    var src = ensureEditSourcePixels();
    if (!src) {
      alert(tPreview('edit_pick_color_first', 'Pick at least one color first.'));
      return;
    }
    var x = Math.max(0, Math.min(src.width - 1, Math.round(nat.px)));
    var y = Math.max(0, Math.min(src.height - 1, Math.round(nat.py)));
    if (editMaskDirty) {
      var maskBits = buildNaturalBrushMaskBits();
      if (maskBits && !isNaturalPixelInBrushMask(maskBits, x, y)) {
        // Outside brushed area: ignore pick for source colors (still allow replace eyedropper).
        if (!editPickReplaceTarget) return;
      }
    }
    var i = (y * src.width + x) * 4;
    var color = { r: src.data[i], g: src.data[i + 1], b: src.data[i + 2] };
    if (editPickReplaceTarget) {
      setReplaceTargetColor(color);
      return;
    }
    if (!isColorSelected(color)) {
      editPickedColors.push(color);
      renderEditColorChips();
    }
  }

  function openDesignColorsModal() {
    var el = document.getElementById('cdp-design-colors-modal-' + sectionId);
    if (!el) return;
    editDesignColorsOpen = true;
    el.classList.add('is-open');
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
    refreshColorAreaPalette();
    renderDesignColorsGrid();
  }

  function closeDesignColorsModal() {
    var el = document.getElementById('cdp-design-colors-modal-' + sectionId);
    if (!el) return;
    editDesignColorsOpen = false;
    el.classList.remove('is-open');
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
  }

  function renderDesignColorsGrid() {
    var grid = document.getElementById('cdp-design-colors-grid-' + sectionId);
    var emptyEl = document.getElementById('cdp-design-colors-empty-' + sectionId);
    if (!grid) return;
    grid.innerHTML = '';
    if (!editPaletteColors.length) {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = editMaskDirty
          ? tPreview('edit_design_colors_empty_selection', 'No colors found in the brushed area')
          : tPreview('edit_design_colors_empty', 'No colors found in this design');
      }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    editPaletteColors.forEach(function (c) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cdp-modal__design-colors-swatch' + (isColorSelected(c) ? ' is-selected' : '');
      btn.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      btn.title = c.r + ', ' + c.g + ', ' + c.b;
      btn.setAttribute('aria-pressed', isColorSelected(c) ? 'true' : 'false');
      btn.addEventListener('click', function () {
        togglePickedColor(c);
      });
      grid.appendChild(btn);
    });
  }

  function versionTypeLabel(version) {
    if (!version) return '';
    if (version.label) return String(version.label);
    var t = String(version.version_type || '');
    var map = {
      original: tPreview('edit_version_original', 'Original'),
      crop: tPreview('edit_version_crop', 'Crop'),
      remove_bg: tPreview('edit_version_remove_bg', 'Remove background'),
      remove_bg_outside: tPreview('edit_version_remove_bg_outside', 'Remove background (outside)'),
      remove_color: tPreview('edit_version_remove_color', 'Remove color'),
      replace_color: tPreview('edit_version_replace_color', 'Replace color'),
      remove_object: tPreview('edit_version_remove_object', 'Remove object')
    };
    return map[t] || t || 'Version';
  }

  function formatVersionDate(ts) {
    var n = Number(ts);
    if (!isFinite(n) || n <= 0) return '';
    if (n < 1e12) n = n * 1000;
    try {
      return new Date(n).toLocaleString();
    } catch (_) {
      return String(ts);
    }
  }

  function clearPendingEditPreview(opts) {
    opts = opts || {};
    var had = !!editPendingPreviewVersion;
    editPendingPreviewVersion = null;
    editPendingPreviewTool = null;
    if (opts.restoreBaseline && editPendingPreviewBaselineUrl && editImageEl) {
      try { editImageEl.crossOrigin = 'anonymous'; } catch (_) {}
      editImageEl.src = cacheBustSrc(normalizePersistedFileUrl(editPendingPreviewBaselineUrl));
    }
    editPendingPreviewBaselineUrl = null;
    if (had && !opts.silent) updateEditActionButtons();
  }

  function showPendingEditPreview(version, tool) {
    if (!version) return;
    if (!editPendingPreviewBaselineUrl && currentDesign) {
      editPendingPreviewBaselineUrl =
        primaryDesignImageUrl(currentDesign) || getCropSourceImageUrl(currentDesign) || '';
    }
    editPendingPreviewVersion = version;
    editPendingPreviewTool = tool || editActiveTool;
    var url = normalizePersistedFileUrl(
      version.preview_url || version.original_url || version.image_url || ''
    );
    if (url && editImageEl) {
      try { editImageEl.crossOrigin = 'anonymous'; } catch (_) {}
      editImageEl.onload = function () {
        editSourceImageData = null;
        editSourceImageKey = '';
        syncEditMaskCanvasSize();
        syncEditColorCanvasSize();
      };
      editImageEl.src = cacheBustSrc(url);
    }
    updateEditActionButtons();
  }

  async function dispatchEditOp(op, options) {
    options = options || {};
    var ownerId = resolveOwnerIdForPreview();
    if (!ownerId) {
      alert(window.CreatorI18n?.noUserId || 'Error: No user ID found. Please sign in.');
      return null;
    }
    if (!currentDesign || !currentDesign.id) {
      alert(window.CreatorI18n?.noDesignId || 'Error: No design selected.');
      return null;
    }
    var apiBaseUrl = resolveCreatorDispatchBase();
    var url = new URL(apiBaseUrl);
    url.searchParams.set('op', op);
    url.searchParams.set('path_prefix', '/apps/creator-dispatch');
    url.searchParams.set('logged_in_customer_id', String(ownerId));

    var method = options.method || 'POST';
    var isGet = method === 'GET';
    var heavyOps = {
      'design-edit-remove-object': 1,
      'design-edit-remove-background': 1,
      'design-edit-remove-color': 1
    };
    var timeoutMs = options.timeoutMs || (heavyOps[op] ? 75000 : (isGet ? 25000 : 45000));
    var maxAttempts = options.maxAttempts != null
      ? options.maxAttempts
      : (isGet ? 3 : (heavyOps[op] ? 1 : 2));

    var bodyPayload = null;
    var formDataPayload = null;
    if (options.formData) {
      options.formData.set('design_id', String(currentDesign.id));
      options.formData.set('owner_id', String(ownerId));
      options.formData.set('logged_in_customer_id', String(ownerId));
      formDataPayload = options.formData;
    } else if (options.body) {
      bodyPayload = Object.assign({}, options.body, {
        design_id: currentDesign.id,
        owner_id: String(ownerId),
        logged_in_customer_id: String(ownerId)
      });
    } else if (isGet) {
      url.searchParams.set('design_id', String(currentDesign.id));
      url.searchParams.set('owner_id', String(ownerId));
    } else {
      bodyPayload = {
        design_id: currentDesign.id,
        owner_id: String(ownerId),
        logged_in_customer_id: String(ownerId)
      };
    }

    var lastErr = null;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await new Promise(function (r) { setTimeout(r, 220 * attempt * attempt); });
      }
      var ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var toid = null;
      if (ac) {
        toid = setTimeout(function () {
          try { ac.abort(); } catch (_) {}
        }, timeoutMs);
      }
      var fetchOpts = {
        method: method,
        mode: 'cors',
        credentials: 'include',
        signal: ac ? ac.signal : undefined
      };
      if (formDataPayload) {
        fetchOpts.body = formDataPayload;
      } else if (bodyPayload) {
        fetchOpts.headers = { 'Content-Type': 'application/json' };
        fetchOpts.body = JSON.stringify(bodyPayload);
      }

      var response;
      try {
        response = await fetch(url.toString(), fetchOpts);
      } catch (fe) {
        if (toid) clearTimeout(toid);
        if (fe && fe.name === 'AbortError') {
          lastErr = new Error(
            tPreview('edit_request_timeout', 'Edit request timed out. Please try again.')
          );
          console.warn('[CDP] edit op timeout', { op: op, attempt: attempt, ms: timeoutMs });
          if (attempt < maxAttempts) continue;
          throw lastErr;
        }
        lastErr = fe;
        if (attempt < maxAttempts) continue;
        throw fe;
      }
      if (toid) clearTimeout(toid);

      var ct = (response.headers.get('content-type') || '').toLowerCase();
      var raw = await response.text();
      var data = null;
      if (ct.indexOf('application/json') !== -1) {
        try { data = JSON.parse(raw); } catch (_) {}
      }

      var retryableStatus =
        attempt < maxAttempts &&
        (response.status === 502 || response.status === 503 || response.status === 504);
      if (!data) {
        lastErr = new Error(
          'HTTP ' + response.status + (raw ? ' — ' + raw.replace(/\s+/g, ' ').trim().slice(0, 160) : '')
        );
        if (retryableStatus) continue;
        throw lastErr;
      }
      if (!data.ok) {
        var errCode = data.error || op + '_failed';
        var retryableErr =
          attempt < maxAttempts &&
          (errCode === 'db_overloaded' ||
            errCode === 'upstream_unavailable' ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504);
        lastErr = new Error(data.message || errCode);
        if (retryableErr) continue;
        throw lastErr;
      }
      return data;
    }
    throw lastErr || new Error(op + '_failed');
  }

  function buildSyntheticOriginalVersion() {
    if (!currentDesign) return null;
    var preview = primaryDesignImageUrl(currentDesign) || '';
    var original = getCropSourceImageUrl(currentDesign) || preview;
    if (!preview && !original) return null;
    return {
      id: null,
      design_id: currentDesign.id,
      version_type: 'original',
      label: tPreview('edit_version_original', 'Original'),
      preview_url: preview || original,
      original_url: original || preview,
      is_applied: 1,
      created_at: currentDesign.created_at || null,
      meta: { source: 'client_fallback_live' }
    };
  }

  function ensureEditVersionsHaveBaseline() {
    if (editVersions && editVersions.length) return;
    var baseline = buildSyntheticOriginalVersion();
    editVersions = baseline ? [baseline] : [];
  }

  async function loadEditVersions() {
    if (!currentDesign || !currentDesign.id) {
      editVersions = [];
      return;
    }
    try {
      var data = await dispatchEditOp('list-design-edit-versions', { method: 'GET' });
      editVersions = (data && data.items) || [];
      ensureEditVersionsHaveBaseline();
      if (editHistoryOpen) renderEditHistoryCarousel();
    } catch (err) {
      console.warn('[CDP] loadEditVersions failed', err);
      editVersions = [];
      ensureEditVersionsHaveBaseline();
      if (editHistoryOpen) renderEditHistoryCarousel();
    }
  }

  function openEditHistoryModal() {
    var el = document.getElementById('cdp-edit-history-modal-' + sectionId);
    if (!el) return;
    editHistoryOpen = true;
    el.classList.add('is-open');
    el.removeAttribute('hidden');
    el.setAttribute('aria-hidden', 'false');
    // Show live design immediately so History never flashes empty while the API loads.
    ensureEditVersionsHaveBaseline();
    editHistoryIndex = 0;
    for (var i = 0; i < editVersions.length; i++) {
      if (Number(editVersions[i].is_applied) === 1) {
        editHistoryIndex = i;
        break;
      }
    }
    renderEditHistoryCarousel();
    loadEditVersions().then(function () {
      for (var j = 0; j < editVersions.length; j++) {
        if (Number(editVersions[j].is_applied) === 1) {
          editHistoryIndex = j;
          break;
        }
      }
      renderEditHistoryCarousel();
    });
  }

  function closeEditHistoryModal() {
    var el = document.getElementById('cdp-edit-history-modal-' + sectionId);
    if (!el) return;
    editHistoryOpen = false;
    el.classList.remove('is-open');
    el.setAttribute('hidden', '');
    el.setAttribute('aria-hidden', 'true');
  }

  function renderEditHistoryCarousel() {
    var emptyEl = document.getElementById('cdp-edit-history-empty-' + sectionId);
    var carousel = document.getElementById('cdp-edit-history-carousel-' + sectionId);
    var img = document.getElementById('cdp-edit-history-image-' + sectionId);
    var labelEl = document.getElementById('cdp-edit-history-label-' + sectionId);
    var dateEl = document.getElementById('cdp-edit-history-date-' + sectionId);
    var badge = document.getElementById('cdp-edit-history-applied-badge-' + sectionId);
    var dots = document.getElementById('cdp-edit-history-dots-' + sectionId);
    var applyBtn = document.getElementById('cdp-edit-history-apply-' + sectionId);
    var deleteBtn = document.getElementById('cdp-edit-history-delete-' + sectionId);
    var saveBtn = document.getElementById('cdp-edit-history-save-new-' + sectionId);
    var prevBtn = document.getElementById('cdp-edit-history-prev-' + sectionId);
    var nextBtn = document.getElementById('cdp-edit-history-next-' + sectionId);

    if (!editVersions.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (carousel) carousel.style.display = 'none';
      if (dots) dots.innerHTML = '';
      if (labelEl) labelEl.textContent = '';
      if (dateEl) dateEl.textContent = '';
      if (badge) {
        badge.hidden = true;
        badge.setAttribute('hidden', '');
      }
      if (applyBtn) applyBtn.disabled = true;
      if (deleteBtn) deleteBtn.disabled = true;
      if (saveBtn) saveBtn.disabled = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (carousel) carousel.style.display = '';
    if (editHistoryIndex < 0) editHistoryIndex = 0;
    if (editHistoryIndex >= editVersions.length) editHistoryIndex = editVersions.length - 1;
    var v = editVersions[editHistoryIndex];
    var url = normalizePersistedFileUrl(v.preview_url || v.original_url || '');
    if (img) img.src = cacheBustSrc(url);
    if (labelEl) labelEl.textContent = versionTypeLabel(v);
    if (dateEl) dateEl.textContent = formatVersionDate(v.created_at);
    var applied = Number(v.is_applied) === 1;
    if (badge) {
      if (applied) {
        badge.hidden = false;
        badge.removeAttribute('hidden');
      } else {
        badge.hidden = true;
        badge.setAttribute('hidden', '');
      }
    }
    var isPersistedVersion = v && v.id != null && v.id !== '';
    if (applyBtn) applyBtn.disabled = applied || editOpBusy || !isPersistedVersion;
    if (deleteBtn) deleteBtn.disabled = applied || editOpBusy || !isPersistedVersion;
    if (saveBtn) saveBtn.disabled = applied || editOpBusy || !isPersistedVersion;
    if (prevBtn) prevBtn.disabled = editHistoryIndex <= 0;
    if (nextBtn) nextBtn.disabled = editHistoryIndex >= editVersions.length - 1;

    if (dots) {
      dots.innerHTML = '';
      editVersions.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'cdp-modal__edit-history-dot' + (i === editHistoryIndex ? ' is-active' : '');
        dot.setAttribute('aria-label', String(i + 1));
        dot.addEventListener('click', function () {
          editHistoryIndex = i;
          renderEditHistoryCarousel();
        });
        dots.appendChild(dot);
      });
    }
  }

  function shiftEditHistory(delta) {
    if (!editVersions.length) return;
    editHistoryIndex = Math.max(0, Math.min(editVersions.length - 1, editHistoryIndex + delta));
    renderEditHistoryCarousel();
  }

  async function applySelectedEditVersion() {
    var v = editVersions[editHistoryIndex];
    if (!v || v.id == null || v.id === '' || Number(v.is_applied) === 1) return;
    setEditBusy(true);
    try {
      var data = await dispatchEditOp('apply-design-edit-version', {
        body: { version_id: v.id }
      });
      if (data && data.design) applyDesignFromEditResponse(data.design);
      showCropSuccessToast(tPreview('edit_success', 'Design updated.'));
      await loadEditVersions();
      renderEditHistoryCarousel();
      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}
    } catch (err) {
      console.error('[CDP] apply version failed', err);
      alert((err && err.message) || 'Apply failed');
    } finally {
      setEditBusy(false);
      renderEditHistoryCarousel();
    }
  }

  async function deleteSelectedEditVersion() {
    var v = editVersions[editHistoryIndex];
    if (!v || v.id == null || v.id === '') return;
    if (Number(v.is_applied) === 1) {
      alert(tPreview('edit_cannot_delete_applied', 'Apply another version before deleting the currently applied one.'));
      return;
    }
    setEditBusy(true);
    try {
      await dispatchEditOp('delete-design-edit-version', {
        method: 'POST',
        body: { version_id: v.id }
      });
      await loadEditVersions();
      if (editHistoryIndex >= editVersions.length) editHistoryIndex = Math.max(0, editVersions.length - 1);
      renderEditHistoryCarousel();
    } catch (err) {
      console.error('[CDP] delete version failed', err);
      alert((err && err.message) || 'Delete failed');
    } finally {
      setEditBusy(false);
      renderEditHistoryCarousel();
    }
  }

  async function saveSelectedEditVersionAsNew() {
    var v = editVersions[editHistoryIndex];
    if (!v || v.id == null || v.id === '') return;
    if (Number(v.is_applied) === 1) {
      alert(tPreview('edit_cannot_save_applied', 'The currently applied version cannot be saved as a new design.'));
      return;
    }
    setEditBusy(true);
    try {
      await dispatchEditOp('save-design-edit-version-as-new', {
        body: { version_id: v.id }
      });
      showCropSuccessToast(tPreview('edit_saved_as_new', 'Saved as a new design.'));
      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}
    } catch (err) {
      console.error('[CDP] save-as-new failed', err);
      alert((err && err.message) || 'Save failed');
    } finally {
      setEditBusy(false);
      renderEditHistoryCarousel();
    }
  }

  async function runRemoveBackground(previewOnly) {
    setEditBusy(
      true,
      previewOnly
        ? tPreview('edit_generating_preview', 'Generating preview…')
        : tPreview('edit_processing', 'Processing edit…')
    );
    try {
      var data = await dispatchEditOp('design-edit-remove-background', {
        body: {
          mode: editBgMode === 'outside' ? 'outside' : 'complete',
          preview_only: !!previewOnly
        }
      });
      if (previewOnly) {
        if (data && data.version) showPendingEditPreview(data.version, 'remove_bg');
        showCropSuccessToast(tPreview('edit_preview_ready', 'Preview ready. Click Apply to save.'));
        await loadEditVersions();
        return;
      }
      clearPendingEditPreview({ silent: true });
      if (data && data.design) applyDesignFromEditResponse(data.design);
      clearEditMask(true);
      showCropSuccessToast(tPreview('edit_success', 'Design updated.'));
      await loadEditVersions();
      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}
    } catch (err) {
      console.error('[CDP] remove-bg failed', err);
      alert((err && err.message) || 'Remove background failed');
    } finally {
      setEditBusy(false);
      updateEditActionButtons();
    }
  }

  async function previewRemoveBackground() {
    return runRemoveBackground(true);
  }

  async function applyRemoveBackground() {
    if (
      editPendingPreviewVersion &&
      editPendingPreviewTool === 'remove_bg' &&
      editPendingPreviewVersion.id != null
    ) {
      setEditBusy(true);
      try {
        var applied = await dispatchEditOp('apply-design-edit-version', {
          body: { version_id: editPendingPreviewVersion.id }
        });
        clearPendingEditPreview({ silent: true });
        if (applied && applied.design) applyDesignFromEditResponse(applied.design);
        else if (applied && applied.version) {
          applyDesignFromEditResponse({
            preview_url: applied.version.preview_url,
            original_url: applied.version.original_url,
            image_url: applied.version.preview_url || applied.version.original_url,
            width: applied.version.width,
            height: applied.version.height,
            r2_key_original: applied.version.r2_key_original,
            r2_key_preview: applied.version.r2_key_preview
          });
        }
        showCropSuccessToast(tPreview('edit_success', 'Design updated.'));
        await loadEditVersions();
        try {
          if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
            window.CreationsScreen.loadDesigns(true, { silent: true });
          }
        } catch (_) {}
      } catch (err) {
        console.error('[CDP] remove-bg apply preview failed', err);
        alert((err && err.message) || 'Remove background failed');
      } finally {
        setEditBusy(false);
        updateEditActionButtons();
      }
      return;
    }
    return runRemoveBackground(false);
  }

  async function applyRemoveColor() {
    if (!editPickedColors.length) {
      setEditActiveTool('remove_color');
      // Prefer Design Colors when a brush region exists; otherwise eyedropper on the design.
      if (editMaskDirty) openDesignColorsModal();
      else enableEyedropperMode();
      return;
    }
    if (editColorReplaceMode === 'color' && !editReplaceTargetColor) {
      alert(tPreview('edit_replace_pick_target_first', 'Pick a replacement color first.'));
      editPickReplaceTarget = true;
      enableEyedropperMode();
      updateReplaceTargetUi();
      return;
    }
    setEditBusy(true);
    try {
      var body = {
        colors: editPickedColors.slice(),
        tolerance: Number(editColorTolerance) || 0,
        replace_mode: editColorReplaceMode === 'color' ? 'color' : 'transparent'
      };
      if (editColorReplaceMode === 'color' && editReplaceTargetColor) {
        body.replace_with = {
          r: editReplaceTargetColor.r,
          g: editReplaceTargetColor.g,
          b: editReplaceTargetColor.b
        };
      }
      if (editMaskDirty) {
        var maskDataUrl = buildMaskDataUrlForServer();
        if (maskDataUrl) {
          body.mask = maskDataUrl;
          body.mask_data_url = maskDataUrl;
        }
      }
      var data = await dispatchEditOp('design-edit-remove-color', { body: body });
      clearPendingEditPreview({ silent: true });
      if (data && data.design) applyDesignFromEditResponse(data.design);
      editPickedColors = [];
      renderEditColorChips();
      clearEditMask(true);
      clearColorPreview();
      showCropSuccessToast(tPreview('edit_success', 'Design updated.'));
      await loadEditVersions();
      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}
    } catch (err) {
      console.error('[CDP] remove-color failed', err);
      alert((err && err.message) || 'Remove color failed');
    } finally {
      setEditBusy(false);
      updateEditActionButtons();
    }
  }

  async function runRemoveObject(previewOnly) {
    if (!editMaskDirty) {
      setEditActiveTool('remove_object');
      enableBrushMode();
      return;
    }
    var maskDataUrl = buildMaskDataUrlForServer();
    if (!maskDataUrl) {
      enableBrushMode();
      alert(tPreview('edit_paint_mask_first', 'Paint a mask over the object first.'));
      return;
    }
    setEditBusy(
      true,
      previewOnly
        ? tPreview('edit_generating_preview', 'Generating preview…')
        : tPreview('edit_processing', 'Processing edit…')
    );
    try {
      var data = await dispatchEditOp('design-edit-remove-object', {
        body: {
          mask: maskDataUrl,
          mask_data_url: maskDataUrl,
          preview_only: !!previewOnly
        },
        timeoutMs: 75000
      });
      if (previewOnly) {
        if (data && data.version) showPendingEditPreview(data.version, 'remove_object');
        clearEditMask(true);
        showCropSuccessToast(tPreview('edit_preview_ready', 'Preview ready. Click Apply to save.'));
        await loadEditVersions();
        return;
      }
      clearPendingEditPreview({ silent: true });
      if (data && data.design) applyDesignFromEditResponse(data.design);
      clearEditMask(true);
      showCropSuccessToast(tPreview('edit_success', 'Design updated.'));
      await loadEditVersions();
      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}
    } catch (err) {
      console.error('[CDP] remove-object failed', err);
      alert((err && err.message) || 'Remove object failed');
    } finally {
      setEditBusy(false);
      updateEditActionButtons();
    }
  }

  async function previewRemoveObject() {
    return runRemoveObject(true);
  }

  async function applyRemoveObject() {
    if (
      !editMaskDirty &&
      editPendingPreviewVersion &&
      editPendingPreviewTool === 'remove_object' &&
      editPendingPreviewVersion.id != null
    ) {
      setEditBusy(true);
      try {
        var applied = await dispatchEditOp('apply-design-edit-version', {
          body: { version_id: editPendingPreviewVersion.id }
        });
        clearPendingEditPreview({ silent: true });
        if (applied && applied.design) applyDesignFromEditResponse(applied.design);
        else if (applied && applied.version) {
          applyDesignFromEditResponse({
            preview_url: applied.version.preview_url,
            original_url: applied.version.original_url,
            image_url: applied.version.preview_url || applied.version.original_url,
            width: applied.version.width,
            height: applied.version.height,
            r2_key_original: applied.version.r2_key_original,
            r2_key_preview: applied.version.r2_key_preview
          });
        }
        showCropSuccessToast(tPreview('edit_success', 'Design updated.'));
        await loadEditVersions();
        try {
          if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
            window.CreationsScreen.loadDesigns(true, { silent: true });
          }
        } catch (_) {}
      } catch (err) {
        console.error('[CDP] remove-object apply preview failed', err);
        alert((err && err.message) || 'Remove object failed');
      } finally {
        setEditBusy(false);
        updateEditActionButtons();
      }
      return;
    }
    if (!editMaskDirty) {
      setEditActiveTool('remove_object');
      enableBrushMode();
      return;
    }
    return runRemoveObject(false);
  }

  function bindEditDesignControls() {
    if (!modal || modal.__cdpEditBound) return;
    modal.__cdpEditBound = true;

    editImageEl = document.getElementById('cdp-edit-image-' + sectionId);
    editImageWrap = document.getElementById('cdp-edit-image-wrap-' + sectionId);
    editMaskCanvas = document.getElementById('cdp-edit-mask-canvas-' + sectionId);
    editColorCanvas = document.getElementById('cdp-edit-color-canvas-' + sectionId);

    modal.querySelectorAll('[data-cdp-edit-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setEditActiveTool(btn.getAttribute('data-cdp-edit-tool'));
      });
    });

    var cropTrigger = document.getElementById('cdp-edit-crop-trigger-' + sectionId);
    if (cropTrigger) {
      cropTrigger.addEventListener('click', function (e) {
        e.preventDefault();
        setEditActiveTool('crop');
        handleCrop(e);
      });
    }

    modal.querySelectorAll('[data-cdp-bg-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var nextMode = btn.getAttribute('data-cdp-bg-mode') === 'outside' ? 'outside' : 'complete';
        if (nextMode !== editBgMode && editPendingPreviewTool === 'remove_bg') {
          clearPendingEditPreview({ restoreBaseline: true, silent: true });
        }
        editBgMode = nextMode;
        modal.querySelectorAll('[data-cdp-bg-mode]').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-cdp-bg-mode') === editBgMode);
        });
        updateEditActionButtons();
      });
    });

    var bgApply = document.getElementById('cdp-edit-remove-bg-apply-' + sectionId);
    if (bgApply) bgApply.addEventListener('click', function () { applyRemoveBackground(); });
    var bgPreview = document.getElementById('cdp-edit-remove-bg-preview-' + sectionId);
    if (bgPreview) bgPreview.addEventListener('click', function () { previewRemoveBackground(); });

    modal.querySelectorAll('[data-cdp-color-replace-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setEditActiveTool('remove_color');
        setColorReplaceMode(btn.getAttribute('data-cdp-color-replace-mode'));
      });
    });
    updateColorReplaceModeUi();

    var colorApply = document.getElementById('cdp-edit-remove-color-apply-' + sectionId);
    if (colorApply) {
      colorApply.addEventListener('click', function () { applyRemoveColor(); });
    }
    var designColorsOpen = document.getElementById('cdp-edit-design-colors-open-' + sectionId);
    if (designColorsOpen) {
      designColorsOpen.addEventListener('click', function () {
        setEditActiveTool('remove_color');
        openDesignColorsModal();
      });
    }
    var designColorsClose = document.getElementById('cdp-design-colors-close-' + sectionId);
    if (designColorsClose) designColorsClose.addEventListener('click', closeDesignColorsModal);
    var designColorsDone = document.getElementById('cdp-design-colors-done-' + sectionId);
    if (designColorsDone) designColorsDone.addEventListener('click', closeDesignColorsModal);
    var designColorsModal = document.getElementById('cdp-design-colors-modal-' + sectionId);
    if (designColorsModal) {
      designColorsModal.addEventListener('click', function (e) {
        if (e.target === designColorsModal) closeDesignColorsModal();
      });
    }

    var tol = document.getElementById('cdp-edit-color-tolerance-' + sectionId);
    if (tol) {
      tol.addEventListener('input', function () {
        editColorTolerance = Number(tol.value) || 0;
        scheduleColorPreview();
      });
      editColorTolerance = Number(tol.value) || 30;
    }

    var replacePicker = document.getElementById('cdp-edit-replace-picker-' + sectionId);
    if (replacePicker) {
      replacePicker.addEventListener('input', function () {
        var rgb = hexToRgb(replacePicker.value);
        if (rgb) setReplaceTargetColor(rgb);
      });
      replacePicker.addEventListener('change', function () {
        var rgb = hexToRgb(replacePicker.value);
        if (rgb) setReplaceTargetColor(rgb);
      });
    }
    var replaceEye = document.getElementById('cdp-edit-replace-eyedrop-' + sectionId);
    if (replaceEye) {
      replaceEye.addEventListener('click', function () {
        setEditActiveTool('remove_color');
        setColorReplaceMode('color');
        editPickReplaceTarget = !editPickReplaceTarget;
        if (editPickReplaceTarget) enableEyedropperMode();
        updateReplaceTargetUi();
      });
    }

    var brush = document.getElementById('cdp-edit-brush-size-' + sectionId);
    if (brush) {
      brush.addEventListener('input', function () {
        editBrushSize = Number(brush.value) || 28;
      });
      editBrushSize = Number(brush.value) || 28;
    }
    var colorBrush = document.getElementById('cdp-edit-color-brush-size-' + sectionId);
    if (colorBrush) {
      colorBrush.addEventListener('input', function () {
        editColorBrushSize = Number(colorBrush.value) || 28;
        setEditActiveTool('remove_color');
        enableBrushMode();
      });
      colorBrush.addEventListener('pointerdown', function () {
        setEditActiveTool('remove_color');
        enableBrushMode();
      });
      editColorBrushSize = Number(colorBrush.value) || 28;
    }
    var clearMask = document.getElementById('cdp-edit-clear-mask-' + sectionId);
    if (clearMask) clearMask.addEventListener('click', function () { clearEditMask(); });
    var clearColorMask = document.getElementById('cdp-edit-clear-color-mask-' + sectionId);
    if (clearColorMask) {
      clearColorMask.addEventListener('click', function () {
        setEditActiveTool('remove_color');
        clearEditMask();
      });
    }
    var objApply = document.getElementById('cdp-edit-remove-object-apply-' + sectionId);
    if (objApply) objApply.addEventListener('click', function () { applyRemoveObject(); });
    var objPreview = document.getElementById('cdp-edit-remove-object-preview-' + sectionId);
    if (objPreview) objPreview.addEventListener('click', function () { previewRemoveObject(); });

    var histOpen = document.getElementById('cdp-edit-history-open-' + sectionId);
    if (histOpen) {
      histOpen.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openEditHistoryModal();
      });
    }
    var histClose = document.getElementById('cdp-edit-history-close-' + sectionId);
    if (histClose) histClose.addEventListener('click', function () { closeEditHistoryModal(); });
    var histModal = document.getElementById('cdp-edit-history-modal-' + sectionId);
    if (histModal) {
      histModal.addEventListener('click', function (e) {
        if (e.target === histModal) closeEditHistoryModal();
      });
    }
    var prev = document.getElementById('cdp-edit-history-prev-' + sectionId);
    var next = document.getElementById('cdp-edit-history-next-' + sectionId);
    if (prev) prev.addEventListener('click', function () { shiftEditHistory(-1); });
    if (next) next.addEventListener('click', function () { shiftEditHistory(1); });
    var applyV = document.getElementById('cdp-edit-history-apply-' + sectionId);
    var delV = document.getElementById('cdp-edit-history-delete-' + sectionId);
    var saveV = document.getElementById('cdp-edit-history-save-new-' + sectionId);
    if (applyV) applyV.addEventListener('click', function () { applySelectedEditVersion(); });
    if (delV) delV.addEventListener('click', function () { deleteSelectedEditVersion(); });
    if (saveV) saveV.addEventListener('click', function () { saveSelectedEditVersionAsNew(); });

    // Swipe on history carousel
    var slideWrap = histModal && histModal.querySelector('.cdp-modal__edit-history-slide-wrap');
    if (slideWrap) {
      slideWrap.addEventListener('touchstart', function (e) {
        if (e.target && e.target.closest && e.target.closest('[data-cdp-viewer-bg-open]')) {
          editHistoryTouchX = null;
          return;
        }
        editHistoryTouchX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : null;
      }, { passive: true });
      slideWrap.addEventListener('touchend', function (e) {
        if (editHistoryTouchX == null) return;
        var x = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : editHistoryTouchX;
        var dx = x - editHistoryTouchX;
        editHistoryTouchX = null;
        if (Math.abs(dx) < 40) return;
        shiftEditHistory(dx < 0 ? 1 : -1);
      }, { passive: true });
    }

    // Eyedropper / brush on edit preview
    if (editImageWrap) {
      editImageWrap.addEventListener('click', function (e) {
        if (editOpBusy || manualCropActive || editHistoryOpen || editDesignColorsOpen || viewerBgModalOpen) return;
        if (isViewerPanMode(editImageWrap)) return;
        if (e.target && e.target.closest && e.target.closest('.cdp-modal__edit-history-btn')) return;
        if (e.target && e.target.closest && e.target.closest('[data-cdp-viewer-bg-open]')) return;
        if (e.target && e.target.closest && e.target.closest('.cdp-modal__zoom-chrome')) return;
        if (editActiveTool !== 'remove_color' && editToolMode !== 'eyedropper') return;
        // While brushing a color area, clicks on the wrap (outside mask canvas) still pick colors.
        if (editToolMode === 'brush' && !editPickReplaceTarget) return;
        if (editToolMode !== 'eyedropper') enableEyedropperMode();
        pickColorFromEditImage(e.clientX, e.clientY);
      });
    }

    if (editMaskCanvas) {
      editMaskCanvas.addEventListener('pointerdown', function (e) {
        if (editOpBusy || manualCropActive) return;
        if (editImageWrap && isViewerPanMode(editImageWrap)) return;
        if (editActiveTool !== 'remove_object' && editActiveTool !== 'remove_color') return;
        // In remove_color: Alt/Option or active brush mode paints; replace eyedropper picks instead.
        if (editActiveTool === 'remove_color') {
          if (editPickReplaceTarget || editToolMode !== 'brush') {
            enableEyedropperMode();
            pickColorFromEditImage(e.clientX, e.clientY);
            e.preventDefault();
            return;
          }
        }
        enableBrushMode();
        editBrushPainting = true;
        try { editMaskCanvas.setPointerCapture(e.pointerId); } catch (_) {}
        paintEditBrush(e.clientX, e.clientY);
        e.preventDefault();
      });
      editMaskCanvas.addEventListener('pointermove', function (e) {
        if (!editBrushPainting) return;
        paintEditBrush(e.clientX, e.clientY);
      });
      function endBrush(e) {
        if (!editBrushPainting) return;
        editBrushPainting = false;
        try { editMaskCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        if (editActiveTool === 'remove_color') {
          refreshColorAreaPalette();
          scheduleColorPreview();
        }
      }
      editMaskCanvas.addEventListener('pointerup', endBrush);
      editMaskCanvas.addEventListener('pointercancel', endBrush);
    }

    if (brush) {
      brush.addEventListener('pointerdown', function () {
        setEditActiveTool('remove_object');
        enableBrushMode();
      });
    }
    if (clearMask) {
      clearMask.addEventListener('pointerdown', function () {
        setEditActiveTool('remove_object');
        enableBrushMode();
      });
    }
    window.addEventListener('resize', function () {
      if (activeTab === 'edit') {
        syncEditMaskCanvasSize();
        syncEditColorCanvasSize();
        if (editActiveTool === 'remove_color') scheduleColorPreview();
      }
    });
    updateEditActionButtons();
  }

  function ensureDraftMeta(design, forceReset) {
    if (forceReset || !draftMeta) {
      draftMeta = cloneMeta(parseDesignMetadata(design));
      if (!Array.isArray(draftMeta.tags)) draftMeta.tags = normalizeStringList(draftMeta.tags);
      if (!Array.isArray(draftMeta.topics)) {
        draftMeta.topics = normalizeStringList(draftMeta.topics || draftMeta.topic);
      }
      if (!Array.isArray(draftMeta.subtopics)) {
        draftMeta.subtopics = normalizeStringList(draftMeta.subtopics || draftMeta.subtopic);
      }
      metaDirty = false;
    }
    return draftMeta;
  }

  function renderChipList(hostId, values, onRemove) {
    var host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    (values || []).forEach(function (value, index) {
      var chip = document.createElement('span');
      chip.className = 'cdp-modal__chip';
      chip.textContent = value + ' ';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cdp-modal__chip-remove';
      btn.setAttribute('aria-label', 'Remove');
      btn.textContent = '×';
      btn.addEventListener('click', function () {
        onRemove(index);
      });
      chip.appendChild(btn);
      host.appendChild(chip);
    });
  }

  function renderEditableList(hostId, values, onChange) {
    var host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    (values || []).forEach(function (value, index) {
      var row = document.createElement('div');
      row.className = 'cdp-modal__list-row';
      var input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.addEventListener('input', function () {
        values[index] = input.value;
        metaDirty = true;
        updateMetadataSaveState();
      });
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cdp-modal__row-remove';
      btn.textContent = '×';
      btn.addEventListener('click', function () {
        values.splice(index, 1);
        metaDirty = true;
        onChange();
      });
      row.appendChild(input);
      row.appendChild(btn);
      host.appendChild(row);
    });
  }

  function updateMetadataSaveState() {
    var saveBtn = document.getElementById('cdp-meta-save-' + sectionId);
    if (!saveBtn) return;
    saveBtn.disabled = !metaDirty || metaSaving || !currentDesign || !currentDesign.id;
  }

  function renderMetadataPanel(design, options) {
    options = options || {};
    if (!modal) getDOMElements();
    if (!modal) return;
    var meta = ensureDraftMeta(design, !!options.forceReset);
    var titleEl = document.getElementById('cdp-meta-title-' + sectionId);
    var descEl = document.getElementById('cdp-meta-description-' + sectionId);
    if (titleEl && document.activeElement !== titleEl) titleEl.value = meta.title || '';
    if (descEl && document.activeElement !== descEl) descEl.value = meta.description || '';

    renderChipList('cdp-meta-tags-' + sectionId, meta.tags || [], function (index) {
      meta.tags.splice(index, 1);
      metaDirty = true;
      renderMetadataPanel(currentDesign);
    });
    renderEditableList('cdp-meta-topics-' + sectionId, meta.topics || [], function () {
      renderMetadataPanel(currentDesign);
    });
    renderEditableList('cdp-meta-subtopics-' + sectionId, meta.subtopics || [], function () {
      renderMetadataPanel(currentDesign);
    });
    updateMetadataSaveState();
  }

  function collectMetadataDraftFromDom() {
    var meta = ensureDraftMeta(currentDesign, false);
    var titleEl = document.getElementById('cdp-meta-title-' + sectionId);
    var descEl = document.getElementById('cdp-meta-description-' + sectionId);
    if (titleEl) meta.title = titleEl.value.trim();
    if (descEl) meta.description = descEl.value.trim();
    meta.tags = normalizeStringList(meta.tags);
    meta.topics = normalizeStringList(meta.topics);
    meta.subtopics = normalizeStringList(meta.subtopics);
    meta.topic = meta.topics;
    meta.subtopic = meta.subtopics;
    return meta;
  }

  function resolveOwnerIdForPreview() {
    if (currentDesign && currentDesign.owner_id) return String(currentDesign.owner_id);
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var fromUrl = urlParams.get('logged_in_customer_id') || urlParams.get('owner_id');
      if (fromUrl) return String(fromUrl);
    } catch (e) {}
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID);
    if (window.CreatorWidget && typeof window.CreatorWidget.getOwnerId === 'function') {
      var oid = window.CreatorWidget.getOwnerId();
      if (oid) return String(oid);
    }
    if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId);
    return '';
  }

  async function saveMetadataDraft() {
    if (!currentDesign || !currentDesign.id || metaSaving) return;
    var ownerId = resolveOwnerIdForPreview();
    if (!ownerId) {
      alert(window.CreatorI18n?.noUserId || 'Error: No user ID found. Please sign in.');
      return;
    }
    var metadata = collectMetadataDraftFromDom();
    metaSaving = true;
    updateMetadataSaveState();
    try {
      var apiBaseUrl = resolveCreatorDispatchBase();
      var updateUrl = apiBaseUrl + '?op=update-design&logged_in_customer_id=' + encodeURIComponent(ownerId);
      var response = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          design_id: currentDesign.id,
          metadata: metadata,
          history_source: 'manual_save'
        })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || data.ok === false) {
        throw new Error(data.error || 'save_failed');
      }
      currentDesign.metadata = metadata;
      if (metadata.title) currentDesign.title = metadata.title;
      draftMeta = cloneMeta(metadata);
      metaDirty = false;
      if (modalTitle && metadata.title) modalTitle.textContent = truncateTitle(String(metadata.title), 80);
      showCropSuccessToast(tPreview('meta_save', 'Save metadata'));
    } catch (err) {
      console.error('[CreatorDesignPreviewModal] metadata save failed', err);
      alert(window.CreatorI18n?.errorSaving || 'Error saving');
    } finally {
      metaSaving = false;
      updateMetadataSaveState();
    }
  }

  async function regenerateMetadataDraft() {
    if (!currentDesign || !currentDesign.id) return;
    var ownerId = resolveOwnerIdForPreview();
    if (!ownerId) {
      alert(window.CreatorI18n?.noUserId || 'Error: No user ID found. Please sign in.');
      return;
    }
    var btn = document.getElementById('cdp-meta-regenerate-' + sectionId);
    if (btn) btn.disabled = true;
    try {
      var apiBaseUrl = resolveCreatorDispatchBase();
      var url = apiBaseUrl + '?op=regenerate-design-metadata&logged_in_customer_id=' + encodeURIComponent(ownerId);
      var response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ design_id: currentDesign.id, owner_id: ownerId })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok || data.ok === false) throw new Error(data.error || 'regenerate_failed');
      var nextMeta = data.metadata || data.design && data.design.metadata || data;
      if (typeof nextMeta === 'string') {
        try { nextMeta = JSON.parse(nextMeta); } catch (e) { nextMeta = {}; }
      }
      if (!nextMeta || typeof nextMeta !== 'object') nextMeta = {};
      currentDesign.metadata = nextMeta;
      draftMeta = null;
      metaDirty = false;
      renderMetadataPanel(currentDesign, { forceReset: true });
      if (nextMeta.title && modalTitle) modalTitle.textContent = truncateTitle(String(nextMeta.title), 80);
    } catch (err) {
      console.error('[CreatorDesignPreviewModal] regenerate metadata failed', err);
      alert(window.CreatorI18n?.errorSaving || 'Error regenerating metadata');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function toggleMetadataHistory() {
    var list = document.getElementById('cdp-meta-history-list-' + sectionId);
    if (!list) return;
    metaHistoryOpen = !metaHistoryOpen;
    list.classList.toggle('is-open', metaHistoryOpen);
    if (!metaHistoryOpen) return;
    list.innerHTML = '<p class="cdp-modal__ref-empty">…</p>';
    var ownerId = resolveOwnerIdForPreview();
    if (!ownerId || !currentDesign || !currentDesign.id) {
      list.innerHTML = '<p class="cdp-modal__ref-empty">' + tPreview('meta_history_empty', 'No snapshots yet') + '</p>';
      return;
    }
    try {
      var apiBaseUrl = resolveCreatorDispatchBase();
      var url =
        apiBaseUrl +
        '?op=list-design-metadata-history&design_id=' +
        encodeURIComponent(currentDesign.id) +
        '&owner_id=' +
        encodeURIComponent(ownerId) +
        '&limit=40';
      var response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      var data = await response.json().catch(function () { return {}; });
      var items = (data && (data.items || data.history || data.snapshots)) || [];
      if (!items.length) {
        list.innerHTML = '<p class="cdp-modal__ref-empty">' + tPreview('meta_history_empty', 'No snapshots yet') + '</p>';
        return;
      }
      list.innerHTML = '';
      items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'cdp-modal__history-item';
        var metaWrap = document.createElement('div');
        metaWrap.className = 'cdp-modal__history-meta';
        var strong = document.createElement('strong');
        strong.textContent = item.created_at || item.timestamp || item.saved_at || 'Snapshot';
        var span = document.createElement('span');
        span.textContent = item.source || item.history_source || item.label || '';
        metaWrap.appendChild(strong);
        metaWrap.appendChild(span);
        var restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'cdp-modal__meta-btn';
        restoreBtn.textContent = tPreview('meta_history_restore', 'Restore');
        restoreBtn.addEventListener('click', function () {
          var snapMeta = item.metadata || item.meta || item;
          if (typeof snapMeta === 'string') {
            try { snapMeta = JSON.parse(snapMeta); } catch (e) { snapMeta = {}; }
          }
          draftMeta = cloneMeta(snapMeta);
          draftMeta.tags = normalizeStringList(draftMeta.tags);
          draftMeta.topics = normalizeStringList(draftMeta.topics || draftMeta.topic);
          draftMeta.subtopics = normalizeStringList(draftMeta.subtopics || draftMeta.subtopic);
          metaDirty = true;
          renderMetadataPanel(currentDesign);
        });
        row.appendChild(metaWrap);
        row.appendChild(restoreBtn);
        list.appendChild(row);
      });
    } catch (err) {
      console.error('[CreatorDesignPreviewModal] history load failed', err);
      list.innerHTML = '<p class="cdp-modal__ref-empty">' + tPreview('meta_history_empty', 'No snapshots yet') + '</p>';
    }
  }

  function bindSidebarControls() {
    if (!modal) return;
    if (drawerToggle && !drawerToggle.__cdpBound) {
      drawerToggle.__cdpBound = true;
      drawerToggle.addEventListener('click', function () {
        var open = !(modalShell && modalShell.classList.contains('is-drawer-open'));
        setDrawerOpen(open);
      });
    }
    if (drawerBackdrop && !drawerBackdrop.__cdpBound) {
      drawerBackdrop.__cdpBound = true;
      drawerBackdrop.addEventListener('click', function () {
        setDrawerOpen(false);
      });
    }
    if (sidebarNav && !sidebarNav.__cdpBound) {
      sidebarNav.__cdpBound = true;
      sidebarNav.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-cdp-tab]');
        if (!btn) return;
        setActiveTab(btn.getAttribute('data-cdp-tab'));
      });
    }

    var titleEl = document.getElementById('cdp-meta-title-' + sectionId);
    var descEl = document.getElementById('cdp-meta-description-' + sectionId);
    if (titleEl && !titleEl.__cdpBound) {
      titleEl.__cdpBound = true;
      titleEl.addEventListener('input', function () {
        ensureDraftMeta(currentDesign, false).title = titleEl.value;
        metaDirty = true;
        updateMetadataSaveState();
      });
    }
    if (descEl && !descEl.__cdpBound) {
      descEl.__cdpBound = true;
      descEl.addEventListener('input', function () {
        ensureDraftMeta(currentDesign, false).description = descEl.value;
        metaDirty = true;
        updateMetadataSaveState();
      });
    }

    function bindAdd(inputId, addId, kind) {
      var input = document.getElementById(inputId);
      var addBtn = document.getElementById(addId);
      if (!input || !addBtn || addBtn.__cdpBound) return;
      addBtn.__cdpBound = true;
      function commit() {
        var raw = String(input.value || '').trim();
        if (!raw) return;
        var meta = ensureDraftMeta(currentDesign, false);
        if (kind === 'tags') {
          raw.split(',').map(function (v) { return v.trim(); }).filter(Boolean).forEach(function (tag) {
            if (meta.tags.indexOf(tag) === -1) meta.tags.push(tag);
          });
        } else if (kind === 'topics') {
          meta.topics.push(raw);
        } else {
          meta.subtopics.push(raw);
        }
        input.value = '';
        metaDirty = true;
        renderMetadataPanel(currentDesign);
      }
      addBtn.addEventListener('click', commit);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      });
    }

    bindAdd('cdp-meta-tags-input-' + sectionId, 'cdp-meta-tags-add-' + sectionId, 'tags');
    bindAdd('cdp-meta-topics-input-' + sectionId, 'cdp-meta-topics-add-' + sectionId, 'topics');
    bindAdd('cdp-meta-subtopics-input-' + sectionId, 'cdp-meta-subtopics-add-' + sectionId, 'subtopics');

    var regen = document.getElementById('cdp-meta-regenerate-' + sectionId);
    var saveMeta = document.getElementById('cdp-meta-save-' + sectionId);
    var hist = document.getElementById('cdp-meta-history-' + sectionId);
    if (regen && !regen.__cdpBound) {
      regen.__cdpBound = true;
      regen.addEventListener('click', function () { regenerateMetadataDraft(); });
    }
    if (saveMeta && !saveMeta.__cdpBound) {
      saveMeta.__cdpBound = true;
      saveMeta.addEventListener('click', function () { saveMetadataDraft(); });
    }
    if (hist && !hist.__cdpBound) {
      hist.__cdpBound = true;
      hist.addEventListener('click', function () { toggleMetadataHistory(); });
    }
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
      if (!manualCropDirty) {
        // Crop mode active but no change yet — keep waiting for adjustments
        return;
      }
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

    var editCropTrigger = document.getElementById('cdp-edit-crop-trigger-' + sectionId);
    if (editCropTrigger) {
      editCropTrigger.classList.add('is-loading');
      editCropTrigger.disabled = true;
    }
    setCropBusyVisible(true);

    try {
      let data;

      const shopDomain = typeof window !== 'undefined' && window.Shopify?.shop
        ? String(window.Shopify.shop).trim()
        : '';

      var candidates = buildCropDispatchCandidates();
      var refImg = pickCropReferenceImage(getCropCandidateImages());
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

      try {
        if (activeTab === 'edit' || editHistoryOpen) {
          loadEditVersions();
        }
      } catch (_) {}

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
      var editCropTriggerDone = document.getElementById('cdp-edit-crop-trigger-' + sectionId);
      if (editCropTriggerDone) {
        editCropTriggerDone.classList.remove('is-loading');
        editCropTriggerDone.disabled = false;
      }
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
    unmountProductsPanel();
    closeEditHistoryModal();
    closeDesignColorsModal();
    closeViewerBgModal();
    clearColorPreview();
    resetEditToolModes();
    clearEditMask(true);
    setDrawerOpen(false);
    setActiveTab('overview');
    draftMeta = null;
    metaDirty = false;
    metaHistoryOpen = false;

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
  window.CreatorDesignPreviewModal.open = function(design, options) {
    console.log('CreatorDesignPreviewModal.open called', { design, options, isInitialized, modal: !!modal });
    
    // Try to initialize if not already done or modal element is missing
    if (!isInitialized || !modal) {
      console.log('Initializing modal...');
      if (!init()) {
        console.warn('Creator Design Preview Modal: Element not found, retrying...');
        // Retry after a short delay
        setTimeout(() => {
          if (init()) {
            console.log('Modal initialized on retry, opening...');
            openModal(design, options);
          } else {
            console.error('Creator Design Preview Modal: Element still not found after retry');
          }
        }, 200);
        return;
      }
    }
    openModal(design, options);
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
