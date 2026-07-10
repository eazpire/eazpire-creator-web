/**
 * Creator Design Studio — fullscreen overlay (IDEA-026).
 * Shop-parity: contain scale, zone clip, pattern overlay, per-position assets, crop, asset menu.
 */
(function () {
  'use strict';

  var root = null;
  var subtitleEl = null;
  var statusEl = null;
  var btnSave = null;
  var btnClose = null;
  var btnReset = null;
  var viewerEl = null;
  var viewerStageEl = null;
  var mockImgEl = null;
  var viewerEmptyEl = null;
  var printZoneEl = null;
  var printZoneClipEl = null;
  var patternCanvasEl = null;
  var designWrapEl = null;
  var designImgEl = null;
  var designChromeEl = null;
  var cropLayerEl = null;
  var cropBoxEl = null;
  var posBarEl = null;
  var panelDesignEl = null;
  var panelVariantsEl = null;
  var addMenuEl = null;
  var pickerEl = null;
  var pickerGridEl = null;
  var pickerTitleEl = null;
  var pickerEmptyEl = null;
  var uploadInputEl = null;
  var assetActionsEl = null;
  var assetActionsPreviewEl = null;
  var assetPlacementEl = null;
  var assetPlacementListEl = null;
  var unsavedDialogEl = null;
  var pendingUnsavedDiscard = null;
  var viewerBusyEl = null;
  var viewerBusyTextEl = null;

  var ctxDesign = null;
  var ctxProductKey = null;
  var ctxProductMeta = null;
  var ctxData = null;
  var draft = null;
  var savedDraftJson = '';
  var activeSettingsTab = 'design';
  var activeAssetKey = null;
  var assetSelected = false;
  var isOpen = false;
  var isSaving = false;
  var isLoading = false;
  var pickerMode = 'mine';
  var transformDrag = null;
  var cropDrag = null;
  var cropping = false;
  var cropFrac = null;
  var cropFracAtEnter = null;
  var cropApplying = false;
  var pendingAssetKey = null;
  var pendingAssetAction = null;
  var pendingAssetSourcePos = null;
  var CREATOR_DISPATCH_FALLBACK = 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';

  var MAX_OWN_ADDITIONAL = 5;
  var MAX_PUBLIC_ADDITIONAL = 1;
  /** Manual scale ceiling (zone-width fraction). Overflow is clipped by the print-zone, not capped to contain. */
  var UI_SCALE_MAX = 2.5;
  var DEFAULT_TRANSFORM = { x: 0.5, y: 0.5, scale: 0.95, rotate: 0 };
  /** After open/Set Default: shrink admin seed (often 0.95) to fit inside the print zone once the design image is measured. */
  var pendingContainClampDefaults = false;
  /** When true, refresh savedDraftJson after contain-clamp so open does not look dirty. */
  var syncSavedAfterContainClamp = false;
  /** Hide design until mock natural size + stage fit are ready (avoids loading offset flash). */
  var layoutReady = false;
  var stageResizeObserver = null;
  var layoutRaf = 0;

  function Mi() {
    return window.CreatorMobileI18n || {};
  }

  function apiBase() {
    return window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  function getOwnerId() {
    if (window.__EAZ_OWNER_ID != null && String(window.__EAZ_OWNER_ID).trim()) {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta && meta.getAttribute('content') ? meta.getAttribute('content') : null;
  }

  function catalogRegion() {
    if (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveCatalogRegion === 'function') {
      return window.CreatorHeroRegions.resolveCatalogRegion();
    }
    return 'EU';
  }

  function t(key, fallback) {
    var M = Mi();
    if (M[key]) return M[key];
    return fallback;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function snapRotate5(deg) {
    var n = Number(deg);
    if (!Number.isFinite(n)) n = 0;
    return clamp(Math.round(n / 5) * 5, -180, 180);
  }

  function cloneTransform(tr) {
    var src = tr || DEFAULT_TRANSFORM;
    return {
      x: Number.isFinite(Number(src.x)) ? Number(src.x) : 0.5,
      y: Number.isFinite(Number(src.y)) ? Number(src.y) : 0.5,
      scale: Number.isFinite(Number(src.scale)) && Number(src.scale) > 0 ? Number(src.scale) : 0.95,
      rotate: snapRotate5(src.rotate),
    };
  }

  /** Round scale for UI only (2 decimals). Stored value stays exact. */
  function formatScaleDisplay(n) {
    var v = Number(n);
    if (!Number.isFinite(v) || v <= 0) v = 0.95;
    return (Math.round(v * 100) / 100).toFixed(2);
  }

  /**
   * product_mockup_defaults.placement_scale is often a legacy mockup bbox width (~0.35–0.55),
   * not Shop/Creator UI scale (zone-width fraction, typically ~0.95).
   * API already normalizes legacy rows to Shop-parity (x/y 0.5, scale 0.95); keep this as a client guard.
   * Open/Set Default then contain-clamps that seed so tall designs fit inside the orange print zone.
   */
  function looksLikeLegacyPlacementScale(scale) {
    var s = Number(scale);
    if (!Number.isFinite(s) || s <= 0) return true;
    return s < 0.7;
  }

  function adminDefaultTransform(pos) {
    var cfg = studioConfig();
    var map = cfg.placement_defaults_by_position || {};
    var key = normPos(pos || 'front');
    var hit = map[key] || map.front || null;
    if (!hit || typeof hit !== 'object') return cloneTransform(DEFAULT_TRANSFORM);
    var scale = Number(hit.scale);
    // Legacy mockup bbox scale → Shop open seed (center + 0.95). Contain-clamp runs after image measure.
    if (looksLikeLegacyPlacementScale(scale)) {
      return cloneTransform({
        x: DEFAULT_TRANSFORM.x,
        y: DEFAULT_TRANSFORM.y,
        scale: DEFAULT_TRANSFORM.scale,
        rotate: hit.rotate != null ? hit.rotate : hit.angle,
      });
    }
    return cloneTransform({
      x: hit.x,
      y: hit.y,
      scale: scale,
      rotate: hit.rotate != null ? hit.rotate : hit.angle,
    });
  }

  /** Primary artwork URL for a print position — Front only unless explicitly set on that bucket. */
  function primaryDesignUrlForPosition(pos, bucket) {
    var key = normPos(pos);
    if (bucket && bucket.primary_url) return bucket.primary_url;
    // Never mirror the product design onto Back/other views on open/reset.
    if (key === 'front') {
      return (
        (ctxData && ctxData.design_preview_url) ||
        (ctxDesign && ctxDesign.preview_url) ||
        ''
      );
    }
    return '';
  }

  /** Keep primary design visible in the viewer (open / reset / Front↔Back). */
  function ensurePrimaryVisible() {
    activeAssetKey = 'primary';
    setAssetSelected(true);
  }

  function draftJson() {
    return JSON.stringify(draft || {});
  }

  function isDirty() {
    if (isLoading || draft == null) return false;
    return draftJson() !== savedDraftJson;
  }

  function setStatus(msg) {
    // Prefer centered viewer busy overlay for load/apply; keep strip for short non-busy notes.
    if (statusEl) statusEl.textContent = msg || '';
  }

  function isStudioBusy() {
    return !!(isLoading || isSaving || cropApplying);
  }

  function setViewerBusy(show, message) {
    if (!viewerBusyEl) return;
    if (show) {
      if (viewerBusyTextEl) {
        viewerBusyTextEl.textContent =
          message || t('designStudioLoading', 'Loading…');
      }
      viewerBusyEl.hidden = false;
      viewerBusyEl.removeAttribute('hidden');
      viewerBusyEl.setAttribute('aria-hidden', 'false');
      viewerBusyEl.classList.add('cds-viewer-busy--visible');
    } else {
      viewerBusyEl.classList.remove('cds-viewer-busy--visible');
      viewerBusyEl.setAttribute('hidden', '');
      viewerBusyEl.hidden = true;
      viewerBusyEl.setAttribute('aria-hidden', 'true');
    }
    if (root) root.classList.toggle('is-busy', !!show || isStudioBusy());
  }

  function syncBusyChrome() {
    var busy = isStudioBusy();
    if (root) root.classList.toggle('is-busy', busy);
    if (!busy) {
      setViewerBusy(false);
    }
    markDirtyUi();
    var applyBtn = root && root.querySelector('#cds-crop-apply');
    var cancelBtn = root && root.querySelector('#cds-crop-cancel');
    if (applyBtn) applyBtn.disabled = !!cropApplying || !!isLoading;
    if (cancelBtn) cancelBtn.disabled = !!cropApplying || !!isLoading;
    if (btnReset) btnReset.disabled = busy;
    if (btnClose) btnClose.disabled = !!cropApplying;
  }

  function blurFocusInside(el) {
    try {
      var active = document.activeElement;
      if (active && el && el.contains && el.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }
    } catch (eBlur) {}
  }

  function cacheBustSrc(url) {
    if (!url || typeof url !== 'string') return '';
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return url + sep + 'v=' + Date.now();
  }

  /** If crop API returned /file/ URLs on the shop host, rewrite to creator worker. */
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

  function toCreatorDispatchEndpoint(base) {
    var b = String(base || '')
      .split('?')[0]
      .trim()
      .replace(/\/+$/, '');
    if (!b) return '';
    if (/\/apps\/creator-dispatch$/i.test(b)) return b;
    return b + '/apps/creator-dispatch';
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
    pushUnique(apiBase());
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

  function resolveServerCropDimensions() {
    var w = 0;
    var h = 0;
    if (ctxData) {
      if (ctxData.design_width != null) w = Number(ctxData.design_width) || 0;
      if (ctxData.design_height != null) h = Number(ctxData.design_height) || 0;
    }
    if ((!w || !h) && ctxDesign) {
      if (ctxDesign.width != null) w = Number(ctxDesign.width) || w;
      if (ctxDesign.height != null) h = Number(ctxDesign.height) || h;
    }
    return {
      w: isFinite(w) && w > 0 ? Math.round(w) : 0,
      h: isFinite(h) && h > 0 ? Math.round(h) : 0,
    };
  }

  function manualCropRectForServer(rect, uiW, uiH, serverW, serverH) {
    if (!rect) return null;
    var uw = uiW > 0 ? uiW : 0;
    var uh = uiH > 0 ? uiH : 0;
    var sw = serverW > 0 ? serverW : uw;
    var sh = serverH > 0 ? serverH : uh;
    if (!uw || !uh || !sw || !sh) return rect;
    if (Math.abs(uw - sw) <= 2 && Math.abs(uh - sh) <= 2) return rect;
    return {
      x: Math.round(rect.x * (sw / uw)),
      y: Math.round(rect.y * (sh / uh)),
      w: Math.max(1, Math.round(rect.w * (sw / uw))),
      h: Math.max(1, Math.round(rect.h * (sh / uh))),
    };
  }

  function applyCroppedDesignToStudio(designOut) {
    if (!designOut) return;
    var preview = normalizePersistedFileUrl(
      designOut.preview_url || designOut.image_url || designOut.original_url || ''
    );
    var original = normalizePersistedFileUrl(
      designOut.original_url || designOut.preview_url || preview
    );
    if (ctxDesign) {
      ctxDesign.preview_url = preview || ctxDesign.preview_url;
      ctxDesign.original_url = original || ctxDesign.original_url;
      ctxDesign.image_url = preview || original || ctxDesign.image_url;
      if (designOut.width) ctxDesign.width = designOut.width;
      if (designOut.height) ctxDesign.height = designOut.height;
    }
    if (ctxData) {
      ctxData.design_preview_url = preview || ctxData.design_preview_url;
      ctxData.design_original_url = original || ctxData.design_original_url;
      if (designOut.width) ctxData.design_width = designOut.width;
      if (designOut.height) ctxData.design_height = designOut.height;
    }
    var bucket = currentBucket();
    if (bucket) {
      if (!bucket.primary_original_url) {
        bucket.primary_original_url =
          bucket.primary_url ||
          (ctxData && ctxData.design_preview_url) ||
          (ctxDesign && ctxDesign.preview_url) ||
          '';
      }
      bucket.primary_url = cacheBustSrc(preview || original);
    }
  }

  function enabledPositions() {
    var cfg = studioConfig();
    var list = (cfg.enabled_positions || ['front', 'back']).map(normPos).filter(Boolean);
    if (!list.length) list = ['front'];
    if (list.indexOf('front') === -1) list.unshift('front');
    return list;
  }

  function normPos(pos) {
    return String(pos || 'front').trim().toLowerCase().replace(/\s+/g, '_');
  }

  function formatPlacementLabel(pos) {
    return normPos(pos)
      .replace(/_/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(' ');
  }

  function ensurePrintArea() {
    draft.print_area = draft.print_area || {};
    var pa = draft.print_area;
    if (!pa.position) pa.position = 'front';
    else pa.position = normPos(pa.position);
    pa.by_position = pa.by_position || {};
    migrateLegacyPrintArea(pa);
    var positions = enabledPositions();
    for (var i = 0; i < positions.length; i++) {
      ensurePositionBucket(positions[i]);
    }
    if (positions.indexOf(pa.position) === -1) pa.position = positions[0] || 'front';
    return pa;
  }

  function migrateLegacyPrintArea(pa) {
    if (!pa || pa.__cdsMigrated) return;
    var hasLegacy =
      pa.primary ||
      (Array.isArray(pa.additional) && pa.additional.length) ||
      pa.public_additional ||
      pa.pattern ||
      pa.alignment;
    var keys = Object.keys(pa.by_position || {});
    if (hasLegacy && !keys.length) {
      var pos = normPos(pa.position || 'front');
      pa.by_position[pos] = {
        primary: cloneTransform(pa.primary),
        primary_url: pa.primary_url || null,
        primary_original_url: pa.primary_original_url || null,
        additional: Array.isArray(pa.additional) ? pa.additional.slice() : [],
        public_additional: pa.public_additional || null,
        alignment: pa.alignment || { h: 'center', v: 'center' },
        pattern: pa.pattern || defaultPattern(),
      };
    }
    pa.__cdsMigrated = true;
  }

  function defaultPattern() {
    return {
      enabled: false,
      mode: 'grid',
      spacing_x: 1,
      spacing_y: 1,
      pattern_angle: 0,
      offset: 0,
      rotation_step_horizontal: 0,
      rotation_step_vertical: 0,
    };
  }

  function ensurePositionBucket(pos) {
    var pa = draft.print_area;
    var key = normPos(pos);
    pa.by_position = pa.by_position || {};
    if (!pa.by_position[key]) {
      pa.by_position[key] = {
        primary: adminDefaultTransform(key),
        primary_url: null,
        primary_original_url: null,
        additional: [],
        public_additional: null,
        alignment: { h: 'center', v: 'center' },
        pattern: defaultPattern(),
      };
    }
    var bucket = pa.by_position[key];
    bucket.primary = cloneTransform(bucket.primary);
    bucket.additional = Array.isArray(bucket.additional) ? bucket.additional : [];
    bucket.pattern = bucket.pattern || defaultPattern();
    bucket.alignment = bucket.alignment || { h: 'center', v: 'center' };
    return bucket;
  }

  function isDefaultishTransform(tr) {
    if (!tr) return true;
    return (
      Math.abs(Number(tr.x) - 0.5) < 1e-6 &&
      Math.abs(Number(tr.y) - 0.5) < 1e-6 &&
      Math.abs(Number(tr.scale) - 0.95) < 1e-6 &&
      Math.abs(Number(tr.rotate) || 0) < 1e-6
    );
  }

  /** Old bug wrote long float scales via clampScaleToContain — re-seed those from admin. */
  function looksLikeClampedScaleArtifact(scale) {
    var s = Number(scale);
    if (!Number.isFinite(s) || s <= 0) return true;
    var rounded2 = Math.round(s * 100) / 100;
    return Math.abs(s - rounded2) > 1e-5;
  }

  /**
   * Previous API rewrote legacy scale→0.95 but kept mockup bbox y (e.g. Softstyle 0.47).
   * Older layout also wrote contain-clamped scales (~0.7–1.0) into storage.
   * Shop opens centered; re-seed those near-default transforms so open matches Shop.
   * Skips clearly custom work (large moves, rotation, or scale above 1).
   */
  function looksLikeMisMappedLegacyPlacement(tr) {
    if (!tr) return false;
    var scale = Number(tr.scale);
    var x = Number(tr.x);
    var y = Number(tr.y);
    var rot = Number(tr.rotate) || 0;
    if (!Number.isFinite(scale) || scale < 0.7 || scale > 1.0 + 1e-6) return false;
    if (!Number.isFinite(x) || Math.abs(x - 0.5) > 0.02) return false;
    if (Math.abs(rot) > 1e-3) return false;
    if (!Number.isFinite(y)) return false;
    var dy = Math.abs(y - 0.5);
    return dy > 0.01 && dy < 0.15;
  }

  /** Apply admin placement defaults (open seed / Set Default). Contain-clamp runs after the design image is measured. */
  function applyAdminDefaultsToDraft(forceAll) {
    ensurePrintArea();
    var positions = enabledPositions();
    var seeded = false;
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      var bucket = ensurePositionBucket(pos);
      if (
        forceAll ||
        isDefaultishTransform(bucket.primary) ||
        looksLikeClampedScaleArtifact(bucket.primary && bucket.primary.scale) ||
        looksLikeLegacyPlacementScale(bucket.primary && bucket.primary.scale) ||
        looksLikeMisMappedLegacyPlacement(bucket.primary)
      ) {
        bucket.primary = adminDefaultTransform(pos);
        seeded = true;
      }
      // Keep non-front primary empty unless the user explicitly placed a design there.
      if (normPos(pos) !== 'front' && !bucket.primary_url && !bucket.primary_original_url) {
        bucket.primary_url = null;
        bucket.primary_original_url = null;
      }
    }
    if (seeded || forceAll) pendingContainClampDefaults = true;
  }

  /** True when transform is still the pre-clamp admin/Shop seed (center + admin scale). */
  function shouldContainClampPrimary(tr, pos) {
    if (!tr) return true;
    if (isDefaultishTransform(tr)) return true;
    var admin = adminDefaultTransform(pos);
    var rot = Number(tr.rotate) || 0;
    var adminRot = Number(admin.rotate) || 0;
    if (Math.abs(rot - adminRot) > 1e-3) return false;
    if (Math.abs(Number(tr.x) - Number(admin.x)) > 0.02) return false;
    if (Math.abs(Number(tr.y) - Number(admin.y)) > 0.02) return false;
    var scale = Number(tr.scale);
    var adminScale = Number(admin.scale);
    if (!Number.isFinite(scale) || !Number.isFinite(adminScale) || adminScale <= 0) return false;
    // Only shrink the open seed — do not rewrite a custom smaller scale.
    return Math.abs(scale - adminScale) < 0.02;
  }

  /**
   * Shop parity: default open/reset uses min(adminScale, maxContainInZone).
   * Manual scale afterward may exceed contain; overflow stays clipped to the orange zone.
   */
  function applyPendingContainClampDefaults() {
    if (!pendingContainClampDefaults) return false;
    if (!printZoneEl || printZoneEl.hidden || (printZoneEl.offsetWidth || 0) < 2) return false;
    if (!designImgEl || !designImgEl.naturalWidth || !designImgEl.naturalHeight) return false;
    var maxContain = maxContainScaleInZone();
    if (!(maxContain > 0) || !Number.isFinite(maxContain)) return false;
    ensurePrintArea();
    var positions = enabledPositions();
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      var bucket = ensurePositionBucket(pos);
      if (!shouldContainClampPrimary(bucket.primary, pos)) continue;
      var admin = adminDefaultTransform(pos);
      var seedScale = Number(admin.scale);
      if (!Number.isFinite(seedScale) || seedScale <= 0) seedScale = 0.95;
      // Round to 2 decimals so we do not re-trigger looksLikeClampedScaleArtifact on reopen.
      bucket.primary = cloneTransform({
        x: admin.x,
        y: admin.y,
        scale: Math.round(Math.min(seedScale, maxContain) * 100) / 100,
        rotate: admin.rotate,
      });
    }
    pendingContainClampDefaults = false;
    if (syncSavedAfterContainClamp) {
      savedDraftJson = draftJson();
      syncSavedAfterContainClamp = false;
      markDirtyUi();
    }
    return true;
  }

  function currentPosition() {
    ensurePrintArea();
    return normPos(draft.print_area.position || 'front');
  }

  function currentBucket() {
    return ensurePositionBucket(currentPosition());
  }

  function findStudioRoot() {
    var nodes = document.querySelectorAll('#creatorDesignStudioModal');
    if (!nodes || !nodes.length) return null;
    for (var i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i] && nodes[i].isConnected) return nodes[i];
    }
    return nodes[nodes.length - 1];
  }

  function cacheDom() {
    root = findStudioRoot();
    if (!root) return false;
    subtitleEl = root.querySelector('#cds-modal-subtitle');
    statusEl = root.querySelector('#cds-status');
    btnSave = root.querySelector('#cds-btn-save');
    btnClose = root.querySelector('#cds-btn-close');
    btnReset = root.querySelector('#cds-btn-reset');
    viewerEl = root.querySelector('#cds-viewer');
    viewerStageEl = root.querySelector('#cds-viewer-stage');
    mockImgEl = root.querySelector('#cds-mock-img');
    viewerEmptyEl = root.querySelector('#cds-viewer-empty');
    printZoneEl = root.querySelector('#cds-print-zone');
    printZoneClipEl = root.querySelector('#cds-print-zone-clip');
    patternCanvasEl = root.querySelector('#cds-pattern-canvas');
    designWrapEl = root.querySelector('#cds-design-wrap');
    designImgEl = root.querySelector('#cds-primary-design');
    designChromeEl = root.querySelector('#cds-design-chrome');
    cropLayerEl = root.querySelector('#cds-crop-layer');
    cropBoxEl = root.querySelector('#cds-crop-box');
    posBarEl = root.querySelector('#cds-pos-bar');
    panelDesignEl = root.querySelector('#cds-panel-design');
    panelVariantsEl = root.querySelector('#cds-panel-variants');
    addMenuEl = root.querySelector('#cds-add-menu');
    pickerEl = root.querySelector('#cds-design-picker');
    pickerGridEl = root.querySelector('#cds-picker-grid');
    pickerTitleEl = root.querySelector('#cds-picker-title');
    pickerEmptyEl = root.querySelector('#cds-picker-empty');
    uploadInputEl = root.querySelector('#cds-upload-input');
    assetActionsEl = root.querySelector('#cds-asset-actions');
    assetActionsPreviewEl = root.querySelector('#cds-asset-actions-preview');
    assetPlacementEl = root.querySelector('#cds-asset-placement');
    assetPlacementListEl = root.querySelector('#cds-asset-placement-list');
    unsavedDialogEl = root.querySelector('#cds-unsaved-dialog');
    viewerBusyEl = root.querySelector('#cds-viewer-busy');
    viewerBusyTextEl = root.querySelector('#cds-viewer-busy-text');
    return true;
  }

  function markDirtyUi() {
    if (btnSave) btnSave.disabled = isSaving || isLoading || cropApplying || !isDirty();
  }

  function studioConfig() {
    return (ctxData && ctxData.studio_config) || {};
  }

  function resolveColorKey() {
    var cfg = studioConfig();
    var pa = ensurePrintArea();
    var ck = String(pa.color_key || cfg.color_key_resolved || 'default').trim();
    var mocks = cfg.mocks_by_color || {};
    if (mocks[ck] && mocks[ck].length) return ck;
    if (cfg.color_key_resolved && mocks[cfg.color_key_resolved] && mocks[cfg.color_key_resolved].length) {
      return cfg.color_key_resolved;
    }
    var keys = Object.keys(mocks);
    for (var i = 0; i < keys.length; i++) {
      if (mocks[keys[i]] && mocks[keys[i]].length) return keys[i];
    }
    return ck || 'default';
  }

  function mockEntryForPosition(pos) {
    var cfg = studioConfig();
    var ck = resolveColorKey();
    var list = (cfg.mocks_by_color && cfg.mocks_by_color[ck]) || [];
    var want = normPos(pos);
    for (var i = 0; i < list.length; i++) {
      if (normPos(list[i].position) === want && list[i].mock_url) return list[i];
    }
    var allKeys = Object.keys(cfg.mocks_by_color || {});
    for (var k = 0; k < allKeys.length; k++) {
      var alt = cfg.mocks_by_color[allKeys[k]] || [];
      for (var m = 0; m < alt.length; m++) {
        if (normPos(alt[m].position) === want && alt[m].mock_url) return alt[m];
      }
    }
    return null;
  }

  function listAssetsForPosition(pos) {
    var bucket = ensurePositionBucket(pos);
    var assets = [];
    var key = normPos(pos);
    var primaryUrl = primaryDesignUrlForPosition(key, bucket);
    // Front always has the product primary slot; other views only if a design was placed there.
    if (primaryUrl || key === 'front') {
      assets.push({
        key: 'primary',
        kind: 'primary',
        preview_url: primaryUrl,
        position: key,
        transform: bucket.primary,
        original_url: bucket.primary_original_url || primaryUrl,
      });
    }
    var own = bucket.additional || [];
    for (var i = 0; i < own.length; i++) {
      assets.push({
        key: 'own-' + i,
        kind: 'own',
        index: i,
        preview_url: own[i].preview_url || '',
        position: key,
        transform: own[i].transform || cloneTransform({ scale: 0.5 }),
        slot: own[i],
        original_url: own[i].original_url || own[i].preview_url || '',
      });
    }
    if (bucket.public_additional) {
      assets.push({
        key: 'public',
        kind: 'public',
        preview_url: bucket.public_additional.preview_url || '',
        position: key,
        transform: bucket.public_additional.transform || cloneTransform({ scale: 0.4 }),
        slot: bucket.public_additional,
        original_url: bucket.public_additional.original_url || bucket.public_additional.preview_url || '',
      });
    }
    return assets;
  }

  function findAsset(key, pos) {
    var list = listAssetsForPosition(pos || currentPosition());
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === key) return list[i];
    }
    return null;
  }

  function activeTransform() {
    var bucket = currentBucket();
    if (!activeAssetKey || activeAssetKey === 'primary') return bucket.primary;
    if (activeAssetKey === 'public' && bucket.public_additional) {
      bucket.public_additional.transform =
        bucket.public_additional.transform || cloneTransform({ scale: 0.4 });
      return bucket.public_additional.transform;
    }
    var m = String(activeAssetKey || '').match(/^own-(\d+)$/);
    if (m) {
      var idx = Number(m[1]);
      var slot = bucket.additional[idx];
      if (slot) {
        slot.transform = slot.transform || cloneTransform({ scale: 0.5 });
        return slot.transform;
      }
    }
    return bucket.primary;
  }

  function designUrlForAsset(key) {
    var asset = findAsset(key, currentPosition());
    return (asset && asset.preview_url) || '';
  }

  function parseZoneFrac(f) {
    var def = { l: 0.28, t: 0.22, w: 0.44, h: 0.48 };
    if (!f || typeof f !== 'object') return def;
    var l = Number(f.l != null ? f.l : f.left);
    var t = Number(f.t != null ? f.t : f.top);
    var w = Number(f.w != null ? f.w : f.width);
    var h = Number(f.h != null ? f.h : f.height);
    if (![l, t, w, h].every(function (x) { return Number.isFinite(x); })) return def;
    return { l: l, t: t, w: w, h: h };
  }

  function currentZoneFrac() {
    var mock = mockEntryForPosition(currentPosition());
    return parseZoneFrac(mock && mock.print_area_frac);
  }

  function measureMockRect() {
    if (!viewerEl || !mockImgEl || mockImgEl.hidden || !mockImgEl.naturalWidth || !mockImgEl.naturalHeight) {
      var fw = viewerEl ? Math.max(1, viewerEl.clientWidth) : 1;
      var fh = viewerEl ? Math.max(1, viewerEl.clientHeight) : 1;
      return { left: 0, top: 0, width: fw, height: fh };
    }
    var boxW = Math.max(1, viewerEl.clientWidth);
    var boxH = Math.max(1, viewerEl.clientHeight);
    var nw = mockImgEl.naturalWidth;
    var nh = mockImgEl.naturalHeight;
    var scale = Math.min(boxW / nw, boxH / nh);
    var w = nw * scale;
    var h = nh * scale;
    return { left: (boxW - w) / 2, top: (boxH - h) / 2, width: w, height: h };
  }

  function fitViewerStage() {
    if (!viewerEl || !viewerStageEl || !mockImgEl || mockImgEl.hidden) return;
    var fr = measureMockRect();
    viewerStageEl.style.width = fr.width + 'px';
    viewerStageEl.style.height = fr.height + 'px';
    mockImgEl.style.width = '100%';
    mockImgEl.style.height = '100%';
    mockImgEl.style.objectFit = 'contain';
  }

  function setLayoutReady(on) {
    layoutReady = !!on;
    if (printZoneEl) {
      if (layoutReady) printZoneEl.classList.remove('is-layout-pending');
      else printZoneEl.classList.add('is-layout-pending');
    }
    if (designWrapEl) {
      if (layoutReady) designWrapEl.classList.remove('is-layout-pending');
      else designWrapEl.classList.add('is-layout-pending');
    }
    if (designChromeEl && !layoutReady) {
      designChromeEl.hidden = true;
      designChromeEl.classList.remove('is-visible');
    }
  }

  function canLayoutPrintZone() {
    if (!printZoneEl || !viewerStageEl || !viewerEl) return false;
    if (viewerEl.clientWidth < 8 || viewerEl.clientHeight < 8) return false;
    if (mockImgEl && !mockImgEl.hidden) {
      if (!mockImgEl.complete || !mockImgEl.naturalWidth || !mockImgEl.naturalHeight) return false;
    }
    return true;
  }

  function scheduleLayoutPrintZone() {
    if (layoutRaf) cancelAnimationFrame(layoutRaf);
    layoutRaf = requestAnimationFrame(function () {
      layoutRaf = requestAnimationFrame(function () {
        layoutRaf = 0;
        if (isOpen) layoutPrintZone();
      });
    });
  }

  function ensureStageResizeObserver() {
    if (!viewerEl || typeof ResizeObserver === 'undefined') return;
    if (stageResizeObserver) return;
    stageResizeObserver = new ResizeObserver(function () {
      if (!isOpen) return;
      scheduleLayoutPrintZone();
    });
    stageResizeObserver.observe(viewerEl);
    if (viewerStageEl) stageResizeObserver.observe(viewerStageEl);
  }

  /** Fit-in-zone scale (informational). Manual scale may exceed this; overflow is clipped. */
  function maxContainScaleInZone() {
    if (!printZoneEl) return UI_SCALE_MAX;
    var zw = printZoneEl.offsetWidth || 1;
    var zh = printZoneEl.offsetHeight || 1;
    if (zw < 1 || zh < 1) return UI_SCALE_MAX;
    var nw = designImgEl && designImgEl.naturalWidth ? designImgEl.naturalWidth : 0;
    var nh = designImgEl && designImgEl.naturalHeight ? designImgEl.naturalHeight : 0;
    if (nw > 0 && nh > 0) {
      return Math.min(1, (zh * nw) / (zw * nh), UI_SCALE_MAX);
    }
    return UI_SCALE_MAX;
  }

  /** Clamp manual scale to UI range only — do not force down to contain-fit. */
  function clampScaleUi(raw) {
    return clamp(Number(raw) || 0.95, 0.08, UI_SCALE_MAX);
  }

  /** Visual width scale: use stored scale as-is (clipped by print-zone overflow:hidden). */
  function visualScaleForTransform(tr) {
    var scale = Number(tr && tr.scale);
    if (!Number.isFinite(scale) || scale <= 0) scale = 0.95;
    return clampScaleUi(scale);
  }

  function setAssetSelected(on) {
    assetSelected = !!on;
    if (!assetSelected) {
      exitCropMode(true);
    }
    syncSelectionChrome();
  }

  function syncSelectionChrome() {
    if (!designChromeEl || !viewerStageEl) return;
    var show =
      layoutReady &&
      assetSelected &&
      !cropping &&
      !!activeAssetKey &&
      designWrapEl &&
      !designWrapEl.hidden;
    if (!show) {
      designChromeEl.hidden = true;
      designChromeEl.classList.remove('is-visible');
      return;
    }
    // Pattern mode hides the design wrap image — chrome follows the wrap box when visible.
    var wrap = designWrapEl;
    if (!wrap || wrap.hidden) {
      designChromeEl.hidden = true;
      designChromeEl.classList.remove('is-visible');
      return;
    }
    var dr = wrap.getBoundingClientRect();
    var cr = viewerStageEl.getBoundingClientRect();
    if (!dr.width || !dr.height) {
      designChromeEl.hidden = true;
      designChromeEl.classList.remove('is-visible');
      return;
    }
    designChromeEl.style.left = dr.left - cr.left + 'px';
    designChromeEl.style.top = dr.top - cr.top + 'px';
    designChromeEl.style.width = dr.width + 'px';
    designChromeEl.style.height = dr.height + 'px';
    designChromeEl.hidden = false;
    designChromeEl.classList.add('is-visible');
  }

  function applyTransformToDesignImg() {
    if (!designImgEl || !designWrapEl || !printZoneEl) return;
    var tr = activeTransform();
    var x = Number(tr.x);
    var y = Number(tr.y);
    var scale = Number(tr.scale);
    var rot = Number(tr.rotate);
    if (!Number.isFinite(x)) x = 0.5;
    if (!Number.isFinite(y)) y = 0.5;
    if (!Number.isFinite(scale) || scale <= 0) scale = 0.95;
    if (!Number.isFinite(rot)) rot = 0;
    rot = snapRotate5(rot);
    // Keep stored admin/user scale exact; only cap visual overflow.
    tr.x = x;
    tr.y = y;
    tr.scale = scale;
    tr.rotate = rot;
    var visualScale = visualScaleForTransform(tr);

    var zoneW = printZoneEl.offsetWidth || 1;
    var zoneH = printZoneEl.offsetHeight || 1;
    designImgEl.style.width = Math.max(24, zoneW * visualScale) + 'px';
    designImgEl.style.height = 'auto';
    designImgEl.style.maxWidth = 'none';
    designImgEl.style.maxHeight = 'none';

    var dx = (x - 0.5) * zoneW;
    var dy = (y - 0.5) * zoneH;
    designWrapEl.style.left = '50%';
    designWrapEl.style.top = '50%';
    designWrapEl.style.transform =
      'translate(-50%, -50%) translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';

    syncSelectionChrome();
    redrawZonePatternOverlay();
    if (cropping) syncCropUiFromFrac();
  }

  function teardownZonePatternOverlay() {
    if (!patternCanvasEl) return;
    patternCanvasEl.hidden = true;
    try {
      patternCanvasEl.style.setProperty('display', 'none', 'important');
    } catch (e1) {}
    try {
      var zc = patternCanvasEl.getContext('2d');
      if (zc) zc.clearRect(0, 0, patternCanvasEl.width, patternCanvasEl.height);
    } catch (e2) {}
    if (designImgEl) {
      designImgEl.hidden = false;
      try {
        designImgEl.style.removeProperty('display');
      } catch (e3) {}
    }
    if (printZoneEl) printZoneEl.classList.remove('is-pattern-active');
  }

  function redrawZonePatternOverlay() {
    if (!patternCanvasEl || !printZoneEl || !designWrapEl || !designImgEl) return;
    var bucket = currentBucket();
    var pat = bucket.pattern || {};
    if (cropping || !pat.enabled || designWrapEl.hidden || !designImgEl.naturalWidth) {
      teardownZonePatternOverlay();
      return;
    }
    var patMath = window.eazPfsPatternMath;
    if (!patMath || typeof patMath.drawStudioPatternTiles !== 'function') {
      teardownZonePatternOverlay();
      return;
    }

    var zw = Math.max(2, printZoneEl.clientWidth | 0 || 2);
    var zh = Math.max(2, printZoneEl.clientHeight | 0 || 2);
    var dpr = clamp(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, 1, 2);
    patternCanvasEl.hidden = false;
    try {
      patternCanvasEl.style.removeProperty('display');
    } catch (eSh) {}
    patternCanvasEl.width = Math.floor(zw * dpr);
    patternCanvasEl.height = Math.floor(zh * dpr);
    patternCanvasEl.style.width = zw + 'px';
    patternCanvasEl.style.height = zh + 'px';
    var ctx = patternCanvasEl.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, zw, zh);

    var tr = activeTransform();
    var scaleVal = visualScaleForTransform(tr);
    var zoneW = printZoneEl.offsetWidth || zw;
    var zoneH = printZoneEl.offsetHeight || zh;
    designImgEl.hidden = true;
    try {
      designImgEl.style.setProperty('display', 'none', 'important');
    } catch (eHd) {}
    if (printZoneEl) printZoneEl.classList.add('is-pattern-active');

    patMath.drawStudioPatternTiles(ctx, {
      pattern: pat,
      image: designImgEl,
      zoneWidth: zw,
      zoneHeight: zh,
      zoneWidthPx: Math.max(24, zoneW),
      tileScale: scaleVal,
      designDx: (Number(tr.x) - 0.5) * zoneW,
      designDy: (Number(tr.y) - 0.5) * zoneH,
      tileAngle: snapRotate5(tr.rotate),
      rotationStepH: pat.rotation_step_horizontal,
      rotationStepV: pat.rotation_step_vertical,
    });
  }

  function layoutPrintZone() {
    if (!printZoneEl || !viewerStageEl || !viewerEl) return;
    if (!canLayoutPrintZone()) {
      setLayoutReady(false);
      return;
    }
    fitViewerStage();
    // Stage must be sized from the fitted mock before zone % / design transform.
    if (viewerStageEl.offsetWidth < 8 || viewerStageEl.offsetHeight < 8) {
      setLayoutReady(false);
      return;
    }
    var z = currentZoneFrac();
    printZoneEl.style.left = z.l * 100 + '%';
    printZoneEl.style.top = z.t * 100 + '%';
    printZoneEl.style.width = z.w * 100 + '%';
    printZoneEl.style.height = z.h * 100 + '%';
    printZoneEl.hidden = false;
    if (printZoneClipEl) {
      printZoneClipEl.style.overflow = 'hidden';
    }
    // After mock + design are measurable: shrink open/Set Default seed to fit inside the zone.
    if (applyPendingContainClampDefaults()) {
      syncTransformInputs();
    }
    applyTransformToDesignImg();
    syncTransformInputs();
    // Design image may still be loading — keep hidden until natural size is known when a URL is set.
    var paintUrl = designImgEl && designImgEl.getAttribute('src');
    if (paintUrl && designWrapEl && !designWrapEl.hidden) {
      if (!designImgEl.complete || !designImgEl.naturalWidth) {
        setLayoutReady(false);
        return;
      }
    }
    setLayoutReady(true);
    syncSelectionChrome();
  }

  function renderPositionBar() {
    if (!posBarEl) return;
    var positions = enabledPositions();
    var current = currentPosition();
    posBarEl.innerHTML = '';
    for (var i = 0; i < positions.length; i++) {
      (function (pos) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cds-pos-tab' + (pos === current ? ' is-active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', pos === current ? 'true' : 'false');
        btn.textContent = formatPlacementLabel(pos);
        btn.addEventListener('click', function () {
          if (isStudioBusy()) return;
          ensurePrintArea().position = pos;
          var assets = listAssetsForPosition(pos);
          var hasPrimaryPaint =
            assets.some(function (a) {
              return a.key === 'primary' && a.preview_url;
            });
          if (hasPrimaryPaint) {
            ensurePrimaryVisible();
          } else if (assets.length) {
            activeAssetKey = assets[0].key;
            setAssetSelected(true);
          } else {
            activeAssetKey = null;
            setAssetSelected(false);
          }
          renderStudioUi();
          markDirtyUi();
        });
        posBarEl.appendChild(btn);
      })(positions[i]);
    }
  }

  function renderViewer() {
    if (!viewerEl) return;
    ensurePrintArea();
    if (!draft.print_area.color_key) draft.print_area.color_key = resolveColorKey();

    renderPositionBar();
    var pos = currentPosition();
    var mock = mockEntryForPosition(pos);
    var mockUrl = mock && (mock.editor_mock_url || mock.clean_mock_url || mock.mock_url);

    setLayoutReady(false);

    function afterMockReady() {
      scheduleLayoutPrintZone();
    }

    if (mockImgEl && mockUrl) {
      mockImgEl.hidden = false;
      if (viewerEmptyEl) viewerEmptyEl.hidden = true;
      if (mockImgEl.src !== mockUrl) {
        mockImgEl.onload = afterMockReady;
        mockImgEl.src = mockUrl;
      } else if (mockImgEl.complete && mockImgEl.naturalWidth) {
        afterMockReady();
      } else {
        mockImgEl.onload = afterMockReady;
      }
    } else {
      if (mockImgEl) mockImgEl.hidden = true;
      if (viewerEmptyEl) viewerEmptyEl.hidden = false;
      if (printZoneEl) printZoneEl.hidden = true;
      teardownZonePatternOverlay();
    }

    // Paint selected asset, or primary when nothing is selected — never blank the print zone.
    var paintKey = activeAssetKey || 'primary';
    var url = designUrlForAsset(paintKey);
    if (designWrapEl && designImgEl && url) {
      designWrapEl.hidden = false;
      designImgEl.hidden = false;
      if (designImgEl.src !== url) {
        designImgEl.onload = function () {
          scheduleLayoutPrintZone();
        };
        designImgEl.src = url;
      } else {
        scheduleLayoutPrintZone();
      }
    } else if (designWrapEl) {
      designWrapEl.hidden = true;
      if (designChromeEl) designChromeEl.hidden = true;
      teardownZonePatternOverlay();
      scheduleLayoutPrintZone();
    }
  }

  function collapseHtml(id, title, bodyHtml, open) {
    return (
      '<div class="cds-collapse' + (open ? ' is-open' : '') + '" data-cds-collapse="' + id + '">' +
      '<button type="button" class="cds-collapse__head">' +
      title +
      '</button>' +
      '<div class="cds-collapse__body">' +
      bodyHtml +
      '</div></div>'
    );
  }

  function assetBadgeFor(asset) {
    return (
      '<span class="cds-asset-badge">' +
      formatPlacementLabel(asset.position || currentPosition()) +
      '</span>'
    );
  }

  function sliderFieldHtml(opts) {
    var id = opts.id;
    var label = opts.label;
    var min = opts.min;
    var max = opts.max;
    var step = opts.step;
    var value = opts.value;
    return (
      '<div class="cds-field-row cds-field-row--slider">' +
      '<label for="' +
      id +
      '-range">' +
      label +
      '</label>' +
      '<div class="cds-slider-row">' +
      '<input type="number" class="cds-slider-value" id="' +
      id +
      '-num" min="' +
      min +
      '" max="' +
      max +
      '" step="' +
      step +
      '" value="' +
      value +
      '">' +
      '<input type="range" class="cds-slider-range" id="' +
      id +
      '-range" min="' +
      min +
      '" max="' +
      max +
      '" step="' +
      step +
      '" value="' +
      value +
      '">' +
      '</div></div>'
    );
  }

  function renderDesignSettingsPanel() {
    if (!panelDesignEl) return;
    ensurePrintArea();
    var bucket = currentBucket();
    var tr = activeTransform();
    var assets = listAssetsForPosition(currentPosition());

    var assetsHtml = '<div class="cds-asset-grid" id="cds-asset-grid">';
    for (var i = 0; i < assets.length; i++) {
      var a = assets[i];
      var active = assetSelected && activeAssetKey === a.key;
      assetsHtml +=
        '<button type="button" class="cds-asset-tile' +
        (active ? ' is-active' : '') +
        '" data-cds-asset="' +
        a.key +
        '">' +
        (a.preview_url
          ? '<img src="' + a.preview_url + '" alt="">'
          : '<span>#' + (i + 1) + '</span>') +
        assetBadgeFor(a) +
        '</button>';
    }
    var ownCount = (bucket.additional || []).length;
    if (ownCount < MAX_OWN_ADDITIONAL || !bucket.public_additional) {
      assetsHtml +=
        '<button type="button" class="cds-asset-tile cds-asset-tile--add" data-cds-open-add>' +
        '<span>+</span><span>' +
        t('designStudioAddDesigns', 'Add Designs') +
        '</span></button>';
    }
    assetsHtml += '</div>';

    var scaleVal = Number(tr.scale);
    if (!Number.isFinite(scaleVal) || scaleVal <= 0) scaleVal = 0.95;
    // Allow enlarging past contain-fit; zone clip hides overflow outside the orange box.
    var scaleMax = UI_SCALE_MAX;
    var scaleDisplay = formatScaleDisplay(scaleVal);
    var rotVal = snapRotate5(tr.rotate);
    var scaleBody = sliderFieldHtml({
      id: 'cds-scale',
      label: t('designStudioScale', 'Scale'),
      min: 0.08,
      max: scaleMax,
      step: 0.01,
      value: scaleDisplay,
    });
    var rotateBody = sliderFieldHtml({
      id: 'cds-rotate',
      label: t('designStudioRotate', 'Rotate'),
      min: -180,
      max: 180,
      step: 5,
      value: rotVal,
    });

    var cropBody =
      '<p class="cds-muted">' +
      t('designStudioCropHint', 'Crop adjusts the visible area of the selected design.') +
      '</p>' +
      '<button type="button" class="cds-btn-secondary" id="cds-crop-toggle">' +
      t('designStudioCrop', 'Crop') +
      '</button>';

    var align = bucket.alignment || { h: 'center', v: 'center' };
    var alignBtns = [];
    ['left', 'center', 'right'].forEach(function (h) {
      ['top', 'middle', 'bottom'].forEach(function (v) {
        var on = align.h === h && align.v === v;
        alignBtns.push(
          '<button type="button" class="cds-align-btn' +
            (on ? ' is-active' : '') +
            '" data-align-h="' +
            h +
            '" data-align-v="' +
            v +
            '">' +
            h +
            '/' +
            v +
            '</button>'
        );
      });
    });
    var alignBody = '<div class="cds-align-grid" id="cds-align-grid">' + alignBtns.join('') + '</div>';

    var pat = bucket.pattern || defaultPattern();
    var mode = pat.mode || 'grid';
    var patternBody =
      '<label class="cds-size-chip"><input type="checkbox" id="cds-pattern-enabled"' +
      (pat.enabled ? ' checked' : '') +
      '> ' +
      t('designStudioPatternEnable', 'Enable pattern') +
      '</label>' +
      '<div class="cds-pattern-modes" role="radiogroup">' +
      '<label class="cds-size-chip"><input type="radio" name="cds-pattern-mode" value="grid"' +
      (mode === 'grid' ? ' checked' : '') +
      '> ' +
      t('designStudioPatternModeGrid', 'Grid') +
      '</label>' +
      '<label class="cds-size-chip"><input type="radio" name="cds-pattern-mode" value="brick_h"' +
      (mode === 'brick_h' ? ' checked' : '') +
      '> ' +
      t('designStudioPatternModeBrickH', 'Brick horizontal') +
      '</label>' +
      '<label class="cds-size-chip"><input type="radio" name="cds-pattern-mode" value="brick_v"' +
      (mode === 'brick_v' ? ' checked' : '') +
      '> ' +
      t('designStudioPatternModeBrickV', 'Brick vertical') +
      '</label>' +
      '</div>' +
      sliderFieldHtml({
        id: 'cds-pattern-sx',
        label: t('designStudioPatternSpacingX', 'Horizontal spacing'),
        min: 0.05,
        max: 10,
        step: 0.05,
        value: pat.spacing_x != null ? pat.spacing_x : 1,
      }) +
      sliderFieldHtml({
        id: 'cds-pattern-sy',
        label: t('designStudioPatternSpacingY', 'Vertical spacing'),
        min: 0.05,
        max: 10,
        step: 0.05,
        value: pat.spacing_y != null ? pat.spacing_y : 1,
      }) +
      sliderFieldHtml({
        id: 'cds-pattern-angle',
        label: t('designStudioPatternAngle', 'Angle'),
        min: -45,
        max: 45,
        step: 1,
        value: pat.pattern_angle != null ? pat.pattern_angle : 0,
      }) +
      sliderFieldHtml({
        id: 'cds-pattern-offset',
        label: t('designStudioPatternOffset', 'Horizontal offset'),
        min: -1,
        max: 1,
        step: 0.05,
        value: pat.offset != null ? pat.offset : 0,
      }) +
      sliderFieldHtml({
        id: 'cds-pattern-rh',
        label: t('designStudioPatternRotH', 'Rotation each horizontal step'),
        min: -180,
        max: 180,
        step: 5,
        value: snapRotate5(pat.rotation_step_horizontal),
      }) +
      sliderFieldHtml({
        id: 'cds-pattern-rv',
        label: t('designStudioPatternRotV', 'Rotation each vertical step'),
        min: -180,
        max: 180,
        step: 5,
        value: snapRotate5(pat.rotation_step_vertical),
      });

    panelDesignEl.innerHTML =
      assetsHtml +
      collapseHtml(
        'transform',
        t('designStudioSectionTransform', 'Scale, Rotate, Crop'),
        scaleBody + rotateBody + cropBody,
        true
      ) +
      collapseHtml('alignment', t('designStudioSectionAlignment', 'Alignment'), alignBody, false) +
      collapseHtml('pattern', t('designStudioSectionPattern', 'Pattern'), patternBody, false);

    bindDesignSettingsPanel();
  }

  function bindCollapsibles(scope) {
    if (!scope) return;
    scope.querySelectorAll('[data-cds-collapse]').forEach(function (el) {
      var head = el.querySelector('.cds-collapse__head');
      if (!head || head.__cdsBound) return;
      head.__cdsBound = true;
      head.addEventListener('click', function () {
        el.classList.toggle('is-open');
      });
    });
  }

  function syncTransformInputs() {
    if (!panelDesignEl || !activeAssetKey) return;
    var tr = activeTransform();
    var scaleR = panelDesignEl.querySelector('#cds-scale-range');
    var scaleN = panelDesignEl.querySelector('#cds-scale-num');
    var rotR = panelDesignEl.querySelector('#cds-rotate-range');
    var rotN = panelDesignEl.querySelector('#cds-rotate-num');
    var scaleDisp = formatScaleDisplay(tr.scale != null ? tr.scale : 0.95);
    if (scaleR) scaleR.value = scaleDisp;
    if (scaleN) scaleN.value = scaleDisp;
    if (rotR) rotR.value = String(snapRotate5(tr.rotate));
    if (rotN) rotN.value = String(snapRotate5(tr.rotate));
  }

  function bindDesignSettingsPanel() {
    bindCollapsibles(panelDesignEl);

    panelDesignEl.querySelectorAll('[data-cds-asset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-cds-asset') || 'primary';
        openAssetActionsDialog(key);
      });
    });

    var addBtn = panelDesignEl.querySelector('[data-cds-open-add]');
    if (addBtn) addBtn.addEventListener('click', openAddMenu);

    function bindRangePair(rangeId, numId, key) {
      var range = panelDesignEl.querySelector(rangeId);
      var num = panelDesignEl.querySelector(numId);
      function apply(val) {
        if (!activeAssetKey) {
          activeAssetKey = 'primary';
          setAssetSelected(true);
        }
        var tr = activeTransform();
        var n = Number(val);
        if (!Number.isFinite(n)) return;
        if (key === 'scale') {
          n = clampScaleUi(n);
          n = Math.round(n * 100) / 100;
        } else if (key === 'rotate') n = snapRotate5(n);
        tr[key] = n;
        markDirtyUi();
        applyTransformToDesignImg();
        syncTransformInputs();
      }
      if (range) range.addEventListener('input', function () { apply(range.value); });
      if (num) num.addEventListener('input', function () { apply(num.value); });
    }

    bindRangePair('#cds-scale-range', '#cds-scale-num', 'scale');
    bindRangePair('#cds-rotate-range', '#cds-rotate-num', 'rotate');

    var cropBtn = panelDesignEl.querySelector('#cds-crop-toggle');
    if (cropBtn) {
      cropBtn.addEventListener('click', function () {
        if (isStudioBusy()) return;
        if (!assetSelected || !activeAssetKey) {
          setStatus(t('designStudioCropSelectFirst', 'Select a design first, then crop.'));
          return;
        }
        if (cropping) exitCropMode(true);
        else enterCropMode();
      });
    }

    panelDesignEl.querySelectorAll('[data-align-h]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var bucket = currentBucket();
        bucket.alignment = bucket.alignment || { h: 'center', v: 'center' };
        bucket.alignment.h = btn.getAttribute('data-align-h');
        bucket.alignment.v = btn.getAttribute('data-align-v');
        var tr = activeTransform();
        if (bucket.alignment.h === 'left') tr.x = 0.25;
        else if (bucket.alignment.h === 'right') tr.x = 0.75;
        else tr.x = 0.5;
        if (bucket.alignment.v === 'top') tr.y = 0.25;
        else if (bucket.alignment.v === 'bottom') tr.y = 0.75;
        else tr.y = 0.5;
        renderDesignSettingsPanel();
        applyTransformToDesignImg();
        markDirtyUi();
      });
    });

    var patEn = panelDesignEl.querySelector('#cds-pattern-enabled');
    if (patEn) {
      patEn.addEventListener('change', function () {
        currentBucket().pattern.enabled = patEn.checked;
        markDirtyUi();
        redrawZonePatternOverlay();
      });
    }
    panelDesignEl.querySelectorAll('input[name="cds-pattern-mode"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        currentBucket().pattern.mode = radio.value || 'grid';
        markDirtyUi();
        redrawZonePatternOverlay();
      });
    });
    function bindPatSlider(id, key, fallback, snap5) {
      var range = panelDesignEl.querySelector('#' + id + '-range');
      var num = panelDesignEl.querySelector('#' + id + '-num');
      function apply(val) {
        var n = Number(val);
        if (!Number.isFinite(n)) n = fallback;
        if (snap5) n = snapRotate5(n);
        currentBucket().pattern[key] = n;
        if (range) range.value = String(n);
        if (num) num.value = String(n);
        markDirtyUi();
        redrawZonePatternOverlay();
      }
      if (range) range.addEventListener('input', function () { apply(range.value); });
      if (num) num.addEventListener('input', function () { apply(num.value); });
    }
    bindPatSlider('cds-pattern-sx', 'spacing_x', 1, false);
    bindPatSlider('cds-pattern-sy', 'spacing_y', 1, false);
    bindPatSlider('cds-pattern-angle', 'pattern_angle', 0, false);
    bindPatSlider('cds-pattern-offset', 'offset', 0, false);
    bindPatSlider('cds-pattern-rh', 'rotation_step_horizontal', 0, true);
    bindPatSlider('cds-pattern-rv', 'rotation_step_vertical', 0, true);
  }

  function colorDotStyle(itemOrName) {
    if (itemOrName && typeof itemOrName === 'object' && itemOrName.color_hex) {
      return 'background:' + itemOrName.color_hex;
    }
    var n = String((itemOrName && itemOrName.color) || itemOrName || '').toLowerCase();
    var map = {
      black: '#111111',
      white: '#f5f5f5',
      red: '#dc2626',
      blue: '#2563eb',
      navy: '#1e3a5f',
      green: '#16a34a',
      grey: '#6b7280',
      gray: '#6b7280',
      pink: '#ec4899',
      orange: '#f97316',
      yellow: '#eab308',
      purple: '#7c3aed',
      brown: '#92400e',
      beige: '#d6c6a8',
      cream: '#fffdd0',
      charcoal: '#36454f',
      heather: '#9ca3af',
      forest: '#166534',
      maroon: '#7f1d1d',
      teal: '#0d9488',
    };
    for (var k in map) {
      if (n.indexOf(k) !== -1) return 'background:' + map[k];
    }
    return 'background:#888';
  }

  function resolveMockColorKeyForVariantColor(colorName) {
    var cfg = studioConfig();
    var mocks = cfg.mocks_by_color || {};
    var want = String(colorName || '').trim().toLowerCase();
    if (mocks[colorName] && mocks[colorName].length) return colorName;
    var keys = Object.keys(mocks);
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).trim().toLowerCase() === want && mocks[keys[i]].length) return keys[i];
    }
    for (var j = 0; j < keys.length; j++) {
      var k = String(keys[j]).toLowerCase();
      if ((k.indexOf(want) !== -1 || want.indexOf(k) !== -1) && mocks[keys[j]].length) return keys[j];
    }
    return colorName;
  }

  function switchMockColor(colorName) {
    var ck = resolveMockColorKeyForVariantColor(colorName);
    ensurePrintArea().color_key = ck;
    renderViewer();
    markDirtyUi();
  }

  function renderVariantSettingsPanel() {
    if (!panelVariantsEl || !ctxData) return;
    draft.variants = draft.variants || { selected_ids: [] };
    var selected = new Set((draft.variants.selected_ids || []).map(Number));
    var groups = ctxData.variant_groups || {};
    var keys = Object.keys(groups).filter(function (color) {
      var items = groups[color] || [];
      return items.some(function (v) {
        return v && v.in_admin_pool;
      });
    });

    keys.sort(function (a, b) {
      var aItems = (groups[a] || []).filter(function (v) {
        return v && v.in_admin_pool;
      });
      var bItems = (groups[b] || []).filter(function (v) {
        return v && v.in_admin_pool;
      });
      var aAvail = aItems.some(function (v) {
        return v.unlocked;
      });
      var bAvail = bItems.some(function (v) {
        return v.unlocked;
      });
      if (aAvail !== bAvail) return aAvail ? -1 : 1;
      return String(a).localeCompare(String(b));
    });

    var html =
      '<p class="cds-skill-hint">' +
      t(
        'designStudioVariantsSkillHint',
        'Some variants must be unlocked in the skill tree before you can select them.'
      ) +
      '</p>';

    if (!keys.length) {
      html +=
        '<p class="cds-muted">' + t('designStudioNoVariants', 'No variants in admin pool.') + '</p>';
    }

    var activeColor = resolveColorKey();

    for (var g = 0; g < keys.length; g++) {
      var color = keys[g];
      var items = (groups[color] || []).filter(function (v) {
        return v && v.in_admin_pool;
      });
      var unlockedItems = items.filter(function (v) {
        return v.unlocked;
      });
      var selectedInColor = unlockedItems.filter(function (v) {
        return selected.has(Number(v.id));
      });
      var allChecked = unlockedItems.length > 0 && selectedInColor.length === unlockedItems.length;
      var someChecked = selectedInColor.length > 0;
      var sample = items[0] || { color: color };
      var isActiveColor =
        String(activeColor).toLowerCase() === String(color).toLowerCase() ||
        String(resolveMockColorKeyForVariantColor(color)).toLowerCase() ===
          String(activeColor).toLowerCase();
      var openByDefault = g === 0;

      html +=
        '<div class="cds-color-group' +
        (openByDefault ? ' is-open' : '') +
        (isActiveColor ? ' is-preview-color' : '') +
        '" data-color-group="' +
        encodeURIComponent(color) +
        '">';
      html += '<div class="cds-color-head">';
      html +=
        '<input type="checkbox" data-color-all="' +
        encodeURIComponent(color) +
        '"' +
        (allChecked ? ' checked' : '') +
        (someChecked && !allChecked ? ' data-indeterminate="1"' : '') +
        (unlockedItems.length ? '' : ' disabled') +
        '>';
      html +=
        '<button type="button" class="cds-color-dot" style="' +
        colorDotStyle(sample) +
        '" data-cds-color-preview="' +
        encodeURIComponent(color) +
        '" title="' +
        t('designStudioPreviewColor', 'Preview this color') +
        '" aria-label="' +
        t('designStudioPreviewColor', 'Preview this color') +
        '"></button>';
      html +=
        '<button type="button" class="cds-color-name" data-cds-color-toggle>' +
        color +
        ' <span class="cds-color-count">(' +
        selectedInColor.length +
        '/' +
        unlockedItems.length +
        ')</span></button>';
      html +=
        '<button type="button" class="cds-color-toggle" data-cds-color-toggle aria-label="Toggle sizes">▾</button>';
      html += '</div><div class="cds-color-body"><div class="cds-size-list">';

      for (var i = 0; i < items.length; i++) {
        var v = items[i];
        var locked = !v.unlocked;
        var id = Number(v.id);
        var checked = selected.has(id);
        html +=
          '<label class="cds-size-row' +
          (locked ? ' is-locked' : '') +
          '">' +
          '<input type="checkbox" data-variant-id="' +
          id +
          '"' +
          (checked ? ' checked' : '') +
          (locked ? ' disabled' : '') +
          '>' +
          '<span class="cds-size-label">' +
          v.size +
          '</span>' +
          (locked
            ? '<span class="cds-size-lock">' + t('designStudioLocked', 'Locked') + '</span>'
            : '') +
          '</label>';
      }
      html += '</div></div></div>';
    }

    panelVariantsEl.innerHTML = html;

    panelVariantsEl.querySelectorAll('[data-indeterminate]').forEach(function (cb) {
      cb.indeterminate = true;
    });

    panelVariantsEl.querySelectorAll('[data-cds-color-preview]').forEach(function (dot) {
      dot.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var colorKey = decodeURIComponent(dot.getAttribute('data-cds-color-preview') || '');
        switchMockColor(colorKey);
        renderVariantSettingsPanel();
      });
    });

    panelVariantsEl.querySelectorAll('[data-cds-color-toggle]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var group = el.closest('.cds-color-group');
        if (group) group.classList.toggle('is-open');
      });
    });

    panelVariantsEl.querySelectorAll('[data-color-all]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var colorKey = decodeURIComponent(cb.getAttribute('data-color-all') || '');
        var items = (groups[colorKey] || []).filter(function (v) {
          return v && v.in_admin_pool;
        });
        var ids = new Set((draft.variants.selected_ids || []).map(Number));
        for (var j = 0; j < items.length; j++) {
          var v = items[j];
          if (!v.unlocked) continue;
          if (cb.checked) ids.add(Number(v.id));
          else ids.delete(Number(v.id));
        }
        draft.variants.selected_ids = Array.from(ids);
        renderVariantSettingsPanel();
        markDirtyUi();
      });
    });

    panelVariantsEl.querySelectorAll('[data-variant-id]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var id = Number(inp.getAttribute('data-variant-id'));
        var ids = new Set((draft.variants.selected_ids || []).map(Number));
        if (inp.checked) ids.add(id);
        else ids.delete(id);
        draft.variants.selected_ids = Array.from(ids);
        renderVariantSettingsPanel();
        markDirtyUi();
      });
    });
  }

  function switchSettingsTab(tab) {
    if (isStudioBusy() && tab !== activeSettingsTab) return;
    activeSettingsTab = tab === 'variants' ? 'variants' : 'design';
    root.querySelectorAll('[data-cds-settings-tab]').forEach(function (btn) {
      var on = btn.getAttribute('data-cds-settings-tab') === activeSettingsTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    root.querySelectorAll('[data-cds-settings-panel]').forEach(function (panel) {
      var on = panel.getAttribute('data-cds-settings-panel') === activeSettingsTab;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
    if (activeSettingsTab === 'variants') renderVariantSettingsPanel();
  }

  function renderStudioUi() {
    renderViewer();
    renderDesignSettingsPanel();
    renderVariantSettingsPanel();
  }

  function clampCropFrac(f) {
    var x = clamp(Number(f.x) || 0, 0, 0.98);
    var y = clamp(Number(f.y) || 0, 0, 0.98);
    var w = clamp(Number(f.w) || 1, 0.02, 1 - x);
    var h = clamp(Number(f.h) || 1, 0.02, 1 - y);
    return { x: x, y: y, w: w, h: h };
  }

  function syncCropUiFromFrac() {
    if (!cropBoxEl || !cropFrac) return;
    var f = cropFrac;
    cropBoxEl.style.left = 100 * f.x + '%';
    cropBoxEl.style.top = 100 * f.y + '%';
    cropBoxEl.style.width = 100 * f.w + '%';
    cropBoxEl.style.height = 100 * f.h + '%';
  }

  function enterCropMode() {
    if (isStudioBusy()) return;
    if (!designWrapEl || !cropLayerEl || !cropBoxEl || !activeAssetKey) return;
    if (activeAssetKey !== 'primary') {
      setStatus(t('designStudioCropPrimaryOnly', 'Crop is available for the main design. Open Edit Design for other assets.'));
      return;
    }
    cropping = true;
    cropFrac = clampCropFrac(cropFrac || { x: 0, y: 0, w: 1, h: 1 });
    cropFracAtEnter = Object.assign({}, cropFrac);
    cropLayerEl.hidden = false;
    if (printZoneEl) printZoneEl.classList.add('is-cropping');
    syncSelectionChrome();
    teardownZonePatternOverlay();
    syncCropUiFromFrac();
    layoutPrintZone();
  }

  function exitCropMode(restore) {
    if (cropApplying) return;
    if (restore && cropFracAtEnter) cropFrac = Object.assign({}, cropFracAtEnter);
    cropping = false;
    cropDrag = null;
    cropFracAtEnter = null;
    if (cropLayerEl) cropLayerEl.hidden = true;
    if (printZoneEl) printZoneEl.classList.remove('is-cropping');
    syncSelectionChrome();
    layoutPrintZone();
  }

  async function applyCropViaServer() {
    if (!ctxDesign || !ctxDesign.id || !cropFrac || cropApplying) return;
    if (activeAssetKey && activeAssetKey !== 'primary') {
      setStatus(
        t(
          'designStudioCropPrimaryOnly',
          'Crop is available for the main design. Open Edit Design for other assets.'
        )
      );
      return;
    }
    var owner = getOwnerId();
    if (!owner) {
      setStatus(t('designStudioCropError', 'Could not apply crop.'));
      return;
    }
    if (!designImgEl || !designImgEl.naturalWidth) {
      setStatus(t('designStudioCropError', 'Could not apply crop.'));
      return;
    }

    cropApplying = true;
    syncBusyChrome();
    setViewerBusy(true, t('designStudioCropApplying', 'Applying crop…'));
    setStatus('');

    var f = clampCropFrac(cropFrac);
    var uiW = designImgEl.naturalWidth;
    var uiH = designImgEl.naturalHeight;
    var uiRect = {
      x: Math.round(f.x * uiW),
      y: Math.round(f.y * uiH),
      w: Math.max(1, Math.round(f.w * uiW)),
      h: Math.max(1, Math.round(f.h * uiH)),
    };
    var serverDim = resolveServerCropDimensions();
    var serverRect = manualCropRectForServer(uiRect, uiW, uiH, serverDim.w, serverDim.h);
    if (!serverRect) {
      cropApplying = false;
      syncBusyChrome();
      setViewerBusy(false);
      setStatus(t('designStudioCropError', 'Could not apply crop.'));
      return;
    }

    var shopDomain =
      typeof window !== 'undefined' && window.Shopify && window.Shopify.shop
        ? String(window.Shopify.shop).trim()
        : '';
    var candidates = buildCropDispatchCandidates();
    var lastErr = null;
    var data = null;
    var CROP_FETCH_TIMEOUT_MS = 55000;

    try {
      for (var i = 0; i < candidates.length; i++) {
        var base = String(candidates[i] || '');
        var bodyPayload = {
          design_id: ctxDesign.id,
          owner_id: String(owner),
          logged_in_customer_id: String(owner),
          manual_crop: {
            x: serverRect.x,
            y: serverRect.y,
            w: serverRect.w,
            h: serverRect.h,
          },
        };
        if (shopDomain) bodyPayload.shop = shopDomain;

        var reqUrl = base;
        if (base.indexOf('/api/eaz-crop-design') === -1) {
          try {
            var cropUrl = new URL(base);
            cropUrl.searchParams.set('op', 'crop-design');
            cropUrl.searchParams.set('path_prefix', '/apps/creator-dispatch');
            cropUrl.searchParams.set('logged_in_customer_id', String(owner));
            if (shopDomain) cropUrl.searchParams.set('shop', shopDomain);
            reqUrl = cropUrl.toString();
          } catch (_) {
            reqUrl = base;
          }
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
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload),
                signal: ac.signal,
              });
            } catch (fe) {
              clearTimeout(toid);
              if (fe && fe.name === 'AbortError') {
                lastErr = new Error('crop_timeout');
                if (isCropProxy && sub < maxSub - 1) continue;
                throw lastErr;
              }
              throw fe;
            }
            clearTimeout(toid);

            var ct = (response.headers.get('content-type') || '').toLowerCase();
            var rawText = await response.text();
            var statusRetryable =
              isCropProxy &&
              sub < maxSub - 1 &&
              (response.status === 502 || response.status === 503 || response.status === 504);

            if (!ct.includes('application/json')) {
              lastErr = new Error('HTTP ' + response.status);
              if (statusRetryable) continue;
              throw lastErr;
            }

            try {
              data = JSON.parse(rawText);
            } catch (parseErr) {
              lastErr = parseErr;
              if (statusRetryable) continue;
              throw new Error('invalid JSON');
            }

            if (data && data.ok) {
              succeeded = true;
              break;
            }

            var errCode = (data && data.error) || 'crop_failed';
            var upstreamRetryable =
              isCropProxy &&
              sub < maxSub - 1 &&
              (errCode === 'crop_upstream_non_json' ||
                errCode === 'crop_upstream_timeout' ||
                (response.status >= 502 && response.status <= 504));
            lastErr = new Error(errCode);
            if (upstreamRetryable) continue;
            throw lastErr;
          }
          if (succeeded) break;
        } catch (attemptErr) {
          lastErr = attemptErr;
          console.warn('[CDS] crop attempt failed', attemptErr && attemptErr.message ? attemptErr.message : attemptErr);
        }
      }

      if (!data || !data.ok) {
        throw lastErr || new Error('crop_failed');
      }

      applyCroppedDesignToStudio(data.design);
      cropFrac = null;
      cropFracAtEnter = null;
      cropping = false;
      cropDrag = null;
      if (cropLayerEl) cropLayerEl.hidden = true;
      if (printZoneEl) printZoneEl.classList.remove('is-cropping');
      ensurePrimaryVisible();
      renderStudioUi();
      markDirtyUi();

      try {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns(true, { silent: true });
        }
      } catch (_) {}

      setStatus(t('designStudioCropDone', 'Crop applied as a new design version.'));
    } catch (err) {
      console.warn('[CDS] crop failed', err);
      setStatus(t('designStudioCropError', 'Could not apply crop.'));
    } finally {
      cropApplying = false;
      setViewerBusy(false);
      syncBusyChrome();
    }
  }

  function applyCropClient() {
    applyCropViaServer();
  }

  function bindCropInteractions() {
    if (!cropLayerEl || cropLayerEl.__cdsCropBound) return;
    cropLayerEl.__cdsCropBound = true;

    var cancelBtn = root.querySelector('#cds-crop-cancel');
    var applyBtn = root.querySelector('#cds-crop-apply');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (cropApplying) return;
        exitCropMode(true);
      });
    }
    if (applyBtn) applyBtn.addEventListener('click', applyCropClient);

    function onMove(e) {
      if (!cropDrag || !cropFrac || cropApplying) return;
      var rect = designWrapEl.getBoundingClientRect();
      var dw = Math.max(1, rect.width);
      var dh = Math.max(1, rect.height);
      var dx = (e.clientX - cropDrag.sx) / dw;
      var dy = (e.clientY - cropDrag.sy) / dh;
      var f = Object.assign({}, cropDrag.fr);
      var kind = cropDrag.kind;
      if (kind === 'move') {
        f.x = clamp(cropDrag.fr.x + dx, 0, 1 - cropDrag.fr.w);
        f.y = clamp(cropDrag.fr.y + dy, 0, 1 - cropDrag.fr.h);
      } else {
        if (kind.indexOf('e') !== -1) f.w = clamp(cropDrag.fr.w + dx, 0.02, 1 - cropDrag.fr.x);
        if (kind.indexOf('s') !== -1) f.h = clamp(cropDrag.fr.h + dy, 0.02, 1 - cropDrag.fr.y);
        if (kind.indexOf('w') !== -1) {
          var nx = clamp(cropDrag.fr.x + dx, 0, cropDrag.fr.x + cropDrag.fr.w - 0.02);
          f.w = cropDrag.fr.w - (nx - cropDrag.fr.x);
          f.x = nx;
        }
        if (kind.indexOf('n') !== -1) {
          var ny = clamp(cropDrag.fr.y + dy, 0, cropDrag.fr.y + cropDrag.fr.h - 0.02);
          f.h = cropDrag.fr.h - (ny - cropDrag.fr.y);
          f.y = ny;
        }
      }
      cropFrac = clampCropFrac(f);
      syncCropUiFromFrac();
    }

    function onUp() {
      cropDrag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }

    cropBoxEl.addEventListener('pointerdown', function (e) {
      if (!cropping || cropApplying) return;
      var rz = e.target && e.target.getAttribute ? e.target.getAttribute('data-cds-crop-rz') : null;
      cropDrag = {
        kind: rz || 'move',
        sx: e.clientX,
        sy: e.clientY,
        fr: Object.assign({}, cropFrac),
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      e.preventDefault();
      e.stopPropagation();
    });
  }

  function bindViewerTransform() {
    if (!designWrapEl || designWrapEl.__cdsTransformBound) return;
    designWrapEl.__cdsTransformBound = true;

    function onPointerMove(e) {
      if (!transformDrag || cropping) return;
      var tr = activeTransform();
      var zoneW = printZoneEl ? printZoneEl.offsetWidth || 1 : 1;
      var zoneH = printZoneEl ? printZoneEl.offsetHeight || 1 : 1;

      if (transformDrag.mode === 'move') {
        var dx = (e.clientX - transformDrag.startX) / zoneW;
        var dy = (e.clientY - transformDrag.startY) / zoneH;
        tr.x = clamp(transformDrag.startTr.x + dx, 0.05, 0.95);
        tr.y = clamp(transformDrag.startTr.y + dy, 0.05, 0.95);
      } else if (transformDrag.mode === 'rotate') {
        var c = transformDrag.center;
        var ang = Math.atan2(e.clientY - c.cy, e.clientX - c.cx);
        var ang0 = Math.atan2(transformDrag.startY - c.cy, transformDrag.startX - c.cx);
        tr.rotate = snapRotate5(
          transformDrag.startTr.rotate + ((ang - ang0) * 180) / Math.PI
        );
      } else if (transformDrag.mode === 'scale') {
        var startDist = Math.hypot(
          transformDrag.startX - transformDrag.center.cx,
          transformDrag.startY - transformDrag.center.cy
        );
        var curDist = Math.hypot(
          e.clientX - transformDrag.center.cx,
          e.clientY - transformDrag.center.cy
        );
        var ratio = startDist > 1 ? curDist / startDist : 1;
        tr.scale = clampScaleUi(transformDrag.startTr.scale * ratio);
      }
      applyTransformToDesignImg();
      syncTransformInputs();
      markDirtyUi();
    }

    function onPointerUp() {
      transformDrag = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    }

    function startDrag(mode, e, rz) {
      if (e.button != null && e.button !== 0) return;
      if (cropping || isStudioBusy()) return;
      setAssetSelected(true);
      var rect = designWrapEl.getBoundingClientRect();
      transformDrag = {
        mode: mode,
        rz: rz || null,
        startX: e.clientX,
        startY: e.clientY,
        startTr: Object.assign({}, activeTransform()),
        center: {
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
        },
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      e.preventDefault();
      e.stopPropagation();
    }

    designWrapEl.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-cds-rz]')) return;
      if (e.target && e.target.closest && e.target.closest('#cds-crop-layer')) return;
      if (!activeAssetKey) activeAssetKey = 'primary';
      setAssetSelected(true);
      startDrag('move', e);
    });

    if (designChromeEl && !designChromeEl.__cdsChromeBound) {
      designChromeEl.__cdsChromeBound = true;
      designChromeEl.querySelectorAll('[data-cds-rz]').forEach(function (handle) {
        handle.addEventListener('pointerdown', function (e) {
          var mode = handle.getAttribute('data-cds-rz');
          startDrag(mode === 'rotate' ? 'rotate' : 'scale', e, mode);
        });
      });
    }

    if (viewerEl && !viewerEl.__cdsDeselectBound) {
      viewerEl.__cdsDeselectBound = true;
      viewerEl.addEventListener('pointerdown', function (e) {
        if (!isOpen) return;
        if (cropping) return;
        if (e.target && e.target.closest) {
          if (e.target.closest('#cds-design-wrap')) return;
          if (e.target.closest('#cds-design-chrome')) return;
          if (e.target.closest('#cds-crop-layer')) return;
          if (e.target.closest('#cds-pos-bar')) return;
        }
        activeAssetKey = null;
        setAssetSelected(false);
        renderDesignSettingsPanel();
        renderViewer();
      });
    }

    window.addEventListener('resize', function () {
      if (isOpen) scheduleLayoutPrintZone();
    });
    ensureStageResizeObserver();
  }

  function closeAssetDialogs() {
    if (assetActionsEl) {
      assetActionsEl.hidden = true;
      assetActionsEl.setAttribute('aria-hidden', 'true');
    }
    if (assetPlacementEl) {
      assetPlacementEl.hidden = true;
      assetPlacementEl.setAttribute('aria-hidden', 'true');
    }
    pendingAssetKey = null;
    pendingAssetAction = null;
  }

  function openAssetActionsDialog(assetKey) {
    if (!assetActionsEl || !assetKey) return;
    pendingAssetKey = assetKey;
    pendingAssetSourcePos = currentPosition();
    activeAssetKey = assetKey;
    setAssetSelected(true);
    renderViewer();
    renderDesignSettingsPanel();

    var asset = findAsset(assetKey, pendingAssetSourcePos);
    if (assetActionsPreviewEl) {
      assetActionsPreviewEl.src = (asset && asset.preview_url) || '';
    }
    var others = enabledPositions().filter(function (p) {
      return p !== pendingAssetSourcePos;
    });
    root.querySelectorAll('[data-cds-asset-action]').forEach(function (btn) {
      var action = btn.getAttribute('data-cds-asset-action');
      if (action === 'copy' || action === 'move') btn.disabled = others.length === 0;
      else if (action === 'reset') {
        btn.disabled = !(asset && asset.original_url && asset.preview_url !== asset.original_url);
      } else if (action === 'remove') {
        btn.disabled = asset && asset.kind === 'primary';
      } else btn.disabled = false;
    });
    assetActionsEl.hidden = false;
    assetActionsEl.setAttribute('aria-hidden', 'false');
  }

  function openPlacementPicker(action) {
    pendingAssetAction = action;
    if (!assetPlacementEl || !assetPlacementListEl) return;
    var source = pendingAssetSourcePos || currentPosition();
    var others = enabledPositions().filter(function (p) {
      return p !== source;
    });
    assetPlacementListEl.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      (function (pk) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cds-btn-secondary cds-placement-pick';
        btn.textContent = formatPlacementLabel(pk);
        btn.addEventListener('click', function () {
          executeAssetAction(action, pk);
        });
        assetPlacementListEl.appendChild(btn);
      })(others[i]);
    }
    if (assetActionsEl) {
      assetActionsEl.hidden = true;
      assetActionsEl.setAttribute('aria-hidden', 'true');
    }
    assetPlacementEl.hidden = false;
    assetPlacementEl.setAttribute('aria-hidden', 'false');
  }

  function cloneAssetSlot(asset) {
    if (!asset) return null;
    if (asset.kind === 'primary') {
      return {
        design_id: ctxDesign && ctxDesign.id,
        preview_url: asset.preview_url,
        original_url: asset.original_url || asset.preview_url,
        label: 'Primary',
        transform: cloneTransform(asset.transform),
      };
    }
    var slot = asset.slot || {};
    return {
      design_id: slot.design_id,
      preview_url: slot.preview_url || asset.preview_url,
      original_url: slot.original_url || asset.original_url || slot.preview_url,
      label: slot.label || 'Design',
      owner_id: slot.owner_id || null,
      transform: cloneTransform(slot.transform || asset.transform),
    };
  }

  function executeAssetAction(action, targetPos) {
    var sourcePos = pendingAssetSourcePos || currentPosition();
    var assetKey = pendingAssetKey;
    var asset = findAsset(assetKey, sourcePos);
    if (!asset) {
      closeAssetDialogs();
      return;
    }
    var sourceBucket = ensurePositionBucket(sourcePos);

    if (action === 'duplicate') {
      if (asset.kind === 'primary') {
        if ((sourceBucket.additional || []).length >= MAX_OWN_ADDITIONAL) {
          setStatus(t('designStudioAddLimit', 'Additional design limit reached.'));
        } else {
          sourceBucket.additional.push(cloneAssetSlot(asset));
          activeAssetKey = 'own-' + (sourceBucket.additional.length - 1);
        }
      } else if (asset.kind === 'own') {
        if ((sourceBucket.additional || []).length >= MAX_OWN_ADDITIONAL) {
          setStatus(t('designStudioAddLimit', 'Additional design limit reached.'));
        } else {
          sourceBucket.additional.push(cloneAssetSlot(asset));
          activeAssetKey = 'own-' + (sourceBucket.additional.length - 1);
        }
      } else if (asset.kind === 'public' && !sourceBucket.public_additional) {
        sourceBucket.public_additional = cloneAssetSlot(asset);
        activeAssetKey = 'public';
      }
      setStatus(
        t('designStudioAssetDuplicated', 'Duplicate created on {{placement}}.').replace(
          '{{placement}}',
          formatPlacementLabel(sourcePos)
        )
      );
    } else if (action === 'reset') {
      if (asset.kind === 'primary' && sourceBucket.primary_original_url) {
        sourceBucket.primary_url = sourceBucket.primary_original_url;
      } else if (asset.slot && asset.slot.original_url) {
        asset.slot.preview_url = asset.slot.original_url;
      }
      setStatus(t('designStudioAssetReset', 'Design reset to original.'));
    } else if ((action === 'copy' || action === 'move') && targetPos) {
      var targetBucket = ensurePositionBucket(targetPos);
      var cloned = cloneAssetSlot(asset);
      if (cloned) {
        if ((targetBucket.additional || []).length >= MAX_OWN_ADDITIONAL) {
          setStatus(t('designStudioAddLimit', 'Additional design limit reached.'));
        } else {
          targetBucket.additional.push(cloned);
          if (action === 'move') {
            if (asset.kind === 'own') {
              sourceBucket.additional.splice(asset.index, 1);
            } else if (asset.kind === 'public') {
              sourceBucket.public_additional = null;
            } else if (asset.kind === 'primary') {
              // Keep primary on source; move means copy of primary as additional on target.
            }
          }
          setStatus(
            t(
              action === 'copy' ? 'designStudioAssetCopied' : 'designStudioAssetMoved',
              action === 'copy'
                ? 'Design copied to {{placement}}.'
                : 'Design moved to {{placement}}.'
            ).replace('{{placement}}', formatPlacementLabel(targetPos))
          );
        }
      }
    } else if (action === 'remove') {
      if (asset.kind === 'own') {
        sourceBucket.additional.splice(asset.index, 1);
        activeAssetKey = null;
        setAssetSelected(false);
        setStatus(t('designStudioAssetRemoved', 'Asset removed.'));
      } else if (asset.kind === 'public') {
        sourceBucket.public_additional = null;
        activeAssetKey = null;
        setAssetSelected(false);
        setStatus(t('designStudioAssetRemoved', 'Asset removed.'));
      }
    }

    closeAssetDialogs();
    setAssetSelected(!!activeAssetKey);
    renderStudioUi();
    markDirtyUi();
  }

  function openAddMenu() {
    if (!addMenuEl) return;
    addMenuEl.hidden = false;
    addMenuEl.setAttribute('aria-hidden', 'false');
  }

  function closeSubmodals() {
    if (addMenuEl) {
      addMenuEl.hidden = true;
      addMenuEl.setAttribute('aria-hidden', 'true');
    }
    if (pickerEl) {
      pickerEl.hidden = true;
      pickerEl.setAttribute('aria-hidden', 'true');
    }
    closeAssetDialogs();
  }

  function openDesignPicker(mode) {
    closeSubmodals();
    pickerMode = mode === 'public' ? 'public' : 'mine';
    if (!pickerEl) return;
    pickerEl.hidden = false;
    pickerEl.setAttribute('aria-hidden', 'false');
    if (pickerTitleEl) {
      pickerTitleEl.textContent =
        pickerMode === 'public'
          ? t('designStudioPublicDesigns', 'Public Designs')
          : t('designStudioMyDesigns', 'My Designs');
    }
    loadDesignPickerGrid();
  }

  async function loadDesignPickerGrid() {
    if (!pickerGridEl) return;
    pickerGridEl.innerHTML = '';
    if (pickerEmptyEl) pickerEmptyEl.hidden = true;
    var owner = getOwnerId();
    if (!owner) return;

    var url =
      apiBase() +
      '?op=' +
      (pickerMode === 'public' ? 'list-public' : 'list') +
      '&owner_id=' +
      encodeURIComponent(owner) +
      '&limit=60';
    try {
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () {
        return {};
      });
      var items = data.items || data.designs || data.results || [];
      if (!Array.isArray(items)) items = [];
      items = items.filter(function (d) {
        if (!d || d.id == null) return false;
        if (pickerMode === 'mine') return d.library_status === 'active';
        return d.visibility === 'public' || d.library_status === 'active';
      });
      if (!items.length) {
        if (pickerEmptyEl) {
          pickerEmptyEl.hidden = false;
          pickerEmptyEl.textContent = t('designStudioPickerEmpty', 'No designs found.');
        }
        return;
      }
      for (var i = 0; i < items.length; i++) {
        (function (design) {
          var card = document.createElement('button');
          card.type = 'button';
          card.className = 'cds-picker-card';
          var img = document.createElement('img');
          img.src = design.preview_url || design.thumb_url || '';
          img.alt = '';
          card.appendChild(img);
          card.addEventListener('click', function () {
            applyPickedDesign(design);
          });
          pickerGridEl.appendChild(card);
        })(items[i]);
      }
    } catch (e) {
      console.warn('[creator-design-studio] picker', e);
      if (pickerEmptyEl) {
        pickerEmptyEl.hidden = false;
        pickerEmptyEl.textContent = t('designStudioLoadError', 'Could not load studio.');
      }
    }
  }

  function applyPickedDesign(design) {
    if (!design || design.id == null) return;
    var bucket = currentBucket();
    var slot = {
      design_id: design.id,
      preview_url: design.preview_url || design.thumb_url || '',
      original_url: design.preview_url || design.thumb_url || '',
      label: design.title || 'Design ' + design.id,
      transform: cloneTransform({ scale: 0.5 }),
    };
    if (pickerMode === 'public') {
      if (bucket.public_additional) return;
      bucket.public_additional = Object.assign({}, slot, { owner_id: design.owner_id || null });
      activeAssetKey = 'public';
    } else {
      if ((bucket.additional || []).length >= MAX_OWN_ADDITIONAL) return;
      bucket.additional.push(slot);
      activeAssetKey = 'own-' + (bucket.additional.length - 1);
    }
    setAssetSelected(true);
    closeSubmodals();
    renderStudioUi();
    markDirtyUi();
  }

  function bindOnce() {
    if (!root || root.__cdsBound) return;
    root.__cdsBound = true;

    if (btnClose) btnClose.addEventListener('click', function () { close(false); });
    if (btnSave) btnSave.addEventListener('click', onSave);
    if (btnReset) btnReset.addEventListener('click', resetToDefaults);

    root.querySelectorAll('[data-cds-settings-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchSettingsTab(btn.getAttribute('data-cds-settings-tab'));
      });
    });

    root.querySelectorAll('[data-cds-sub-close]').forEach(function (el) {
      el.addEventListener('click', closeSubmodals);
    });
    root.querySelectorAll('[data-cds-asset-close]').forEach(function (el) {
      el.addEventListener('click', closeAssetDialogs);
    });
    root.querySelectorAll('[data-cds-placement-close]').forEach(function (el) {
      el.addEventListener('click', closeAssetDialogs);
    });

    root.querySelectorAll('[data-cds-asset-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-cds-asset-action');
        if (action === 'copy' || action === 'move') openPlacementPicker(action);
        else executeAssetAction(action, null);
      });
    });

    root.querySelectorAll('[data-cds-unsaved]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handleUnsavedAction(el.getAttribute('data-cds-unsaved') || 'cancel');
      });
    });

    if (addMenuEl) {
      var myBtn = addMenuEl.querySelector('[data-cds-add-my-designs]');
      var pubBtn = addMenuEl.querySelector('[data-cds-add-public-designs]');
      var devBtn = addMenuEl.querySelector('[data-cds-add-upload="device"]');
      var phoneBtn = addMenuEl.querySelector('[data-cds-add-upload="phone"]');
      if (myBtn) myBtn.addEventListener('click', function () { openDesignPicker('mine'); });
      if (pubBtn) pubBtn.addEventListener('click', function () { openDesignPicker('public'); });
      if (devBtn) {
        devBtn.addEventListener('click', function () {
          closeSubmodals();
          if (uploadInputEl) uploadInputEl.click();
        });
      }
      if (phoneBtn) {
        phoneBtn.addEventListener('click', function () {
          closeSubmodals();
          if (window.openCreatorPhoneUploadModal) window.openCreatorPhoneUploadModal();
          else if (uploadInputEl) uploadInputEl.click();
        });
      }
    }

    if (uploadInputEl) {
      uploadInputEl.addEventListener('change', function () {
        var file = uploadInputEl.files && uploadInputEl.files[0];
        uploadInputEl.value = '';
        if (!file) return;
        setStatus(t('designStudioUploadSoon', 'Upload will be wired in a follow-up step.'));
      });
    }

    document.addEventListener('keydown', function (ev) {
      if (!isOpen) return;
      if (ev.key === 'Escape') {
        if (unsavedDialogEl && !unsavedDialogEl.hidden) {
          handleUnsavedAction('cancel');
          ev.preventDefault();
          return;
        }
        if (cropping) {
          if (cropApplying) {
            ev.preventDefault();
            return;
          }
          exitCropMode(true);
          ev.preventDefault();
          return;
        }
        if (
          (addMenuEl && !addMenuEl.hidden) ||
          (pickerEl && !pickerEl.hidden) ||
          (assetActionsEl && !assetActionsEl.hidden) ||
          (assetPlacementEl && !assetPlacementEl.hidden)
        ) {
          closeSubmodals();
          ev.preventDefault();
          return;
        }
        ev.preventDefault();
        close(false);
      }
    });

    bindViewerTransform();
    bindCropInteractions();
  }

  function resetToDefaults() {
    if (isStudioBusy()) return;
    var cfg = studioConfig();
    var positions = enabledPositions();
    var colors = cfg.mocks_by_color ? Object.keys(cfg.mocks_by_color) : ['default'];
    var byPos = {};
    for (var i = 0; i < positions.length; i++) {
      byPos[positions[i]] = {
        primary: adminDefaultTransform(positions[i]),
        primary_url: null,
        primary_original_url: null,
        additional: [],
        public_additional: null,
        alignment: { h: 'center', v: 'center' },
        pattern: defaultPattern(),
      };
    }
    draft.print_area = {
      position: 'front',
      color_key: resolveColorKey() || colors[0] || 'default',
      by_position: byPos,
      __cdsMigrated: true,
    };
    pendingContainClampDefaults = true;
    ensurePrimaryVisible();
    renderStudioUi();
    markDirtyUi();
  }

  async function loadContext(design, productKey) {
    var owner = getOwnerId();
    if (!owner) throw new Error('missing_owner');
    var region = catalogRegion();
    var shop =
      window.Shopify && window.Shopify.shop
        ? window.Shopify.shop
        : window.__SHOPIFY_SHOP_DOMAIN || '';
    var url =
      apiBase() +
      '?op=get-studio-context&design_id=' +
      encodeURIComponent(String(design.id)) +
      '&product_key=' +
      encodeURIComponent(productKey) +
      '&owner_id=' +
      encodeURIComponent(owner) +
      '&region=' +
      encodeURIComponent(region);
    if (shop) url += '&shop=' + encodeURIComponent(shop);
    var res = await fetch(url, { credentials: 'include' });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!data.ok) throw new Error(data.error || 'load_failed');
    return data;
  }

  function closeUnsavedDialog() {
    pendingUnsavedDiscard = null;
    if (!unsavedDialogEl) return;
    blurFocusInside(unsavedDialogEl);
    unsavedDialogEl.hidden = true;
    unsavedDialogEl.setAttribute('aria-hidden', 'true');
  }

  function showUnsavedDialog(onDiscard) {
    pendingUnsavedDiscard = typeof onDiscard === 'function' ? onDiscard : doClose;
    if (!unsavedDialogEl) {
      // Last-resort fallback only if markup failed to load
      pendingUnsavedDiscard();
      return;
    }
    var titleEl = unsavedDialogEl.querySelector('#cds-unsaved-title');
    var msgEl = unsavedDialogEl.querySelector('#cds-unsaved-message');
    if (titleEl) {
      titleEl.textContent = t('design_studio_unsaved_title', 'Unsaved changes');
    }
    if (msgEl) {
      msgEl.textContent = t(
        'design_studio_unsaved_body',
        'You have unsaved changes. Save them, discard them, or cancel to keep editing.'
      );
    }
    unsavedDialogEl.hidden = false;
    unsavedDialogEl.setAttribute('aria-hidden', 'false');
    var saveBtn = unsavedDialogEl.querySelector('[data-cds-unsaved="save"]');
    if (saveBtn && typeof saveBtn.focus === 'function') {
      try {
        saveBtn.focus();
      } catch (eFocus) {}
    }
  }

  function handleUnsavedAction(action) {
    if (action === 'cancel') {
      closeUnsavedDialog();
      return;
    }
    if (action === 'discard') {
      var discardFn = pendingUnsavedDiscard || doClose;
      closeUnsavedDialog();
      discardFn();
      return;
    }
    if (action === 'save') {
      onSave().then(function (ok) {
        if (!ok) return;
        var after = pendingUnsavedDiscard || doClose;
        closeUnsavedDialog();
        after();
      });
    }
  }

  function doClose() {
    blurFocusInside(root);
    isOpen = false;
    isLoading = false;
    cropApplying = false;
    setViewerBusy(false);
    setLayoutReady(false);
    if (layoutRaf) {
      cancelAnimationFrame(layoutRaf);
      layoutRaf = 0;
    }
    // Force-exit crop even if apply was mid-flight (state already cleared above).
    cropping = false;
    cropDrag = null;
    cropFracAtEnter = null;
    if (cropLayerEl) cropLayerEl.hidden = true;
    if (printZoneEl) printZoneEl.classList.remove('is-cropping');
    closeUnsavedDialog();
    closeSubmodals();
    teardownZonePatternOverlay();
    if (root) {
      root.classList.remove('is-busy');
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
      window.CreatorModalPhysics.unlockBodyScroll();
    }
    ctxDesign = null;
    ctxProductKey = null;
    ctxData = null;
    draft = null;
    savedDraftJson = '';
    activeAssetKey = null;
    assetSelected = false;
    setStatus('');
  }

  function close(force) {
    if (!isOpen) return;
    if (!force && isDirty()) {
      showUnsavedDialog(doClose);
      return;
    }
    doClose();
  }

  async function onSave() {
    if (isSaving || cropApplying || isLoading || !ctxDesign || !ctxProductKey || !draft) return false;
    var owner = getOwnerId();
    if (!owner) return false;

    isSaving = true;
    syncBusyChrome();
    setViewerBusy(true, t('designStudioSaving', 'Saving…'));
    setStatus('');

    try {
      var res = await fetch(apiBase() + '?op=save-studio-draft&owner_id=' + encodeURIComponent(owner), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design_id: ctxDesign.id,
          product_key: ctxProductKey,
          region_code: catalogRegion(),
          draft: draft,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) throw new Error(data.error || 'save_failed');
      savedDraftJson = draftJson();
      setStatus(
        data.queued
          ? t('designStudioSavedQueued', 'Saved. Update queued.')
          : t('designStudioSaved', 'Saved.')
      );
      return true;
    } catch (e) {
      console.warn('[creator-design-studio]', e);
      setStatus(t('designStudioSaveError', 'Could not save.'));
      return false;
    } finally {
      isSaving = false;
      setViewerBusy(false);
      syncBusyChrome();
    }
  }

  function ensureStudioStyles() {
    if (document.querySelector('link[href*="creator-design-studio-modal.css"]')) return;
    var url = window.__CREATOR_STUDIO_MODAL_CSS;
    if (!url && window.CreatorPortalThemeBridge && typeof window.CreatorPortalThemeBridge.assetUrl === 'function') {
      url = window.CreatorPortalThemeBridge.assetUrl('creator-design-studio-modal.css');
    }
    if (!url) url = '/vendor/theme/creator-design-studio-modal.css';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = String(url).split('?')[0] + '?v=' + Date.now();
    document.head.appendChild(link);
  }

  function ensurePatternMath() {
    if (window.eazPfsPatternMath && typeof window.eazPfsPatternMath.drawStudioPatternTiles === 'function') {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var existing = document.querySelector('script[src*="eaz-shop-printify-studio-pattern.js"]');
      if (existing) {
        existing.addEventListener('load', function () {
          resolve();
        });
        setTimeout(resolve, 300);
        return;
      }
      var url = '/vendor/theme/eaz-shop-printify-studio-pattern.js';
      if (window.CreatorPortalThemeBridge && typeof window.CreatorPortalThemeBridge.assetUrl === 'function') {
        url = window.CreatorPortalThemeBridge.assetUrl('eaz-shop-printify-studio-pattern.js') || url;
      }
      var s = document.createElement('script');
      s.src = String(url).split('?')[0] + '?v=' + Date.now();
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        resolve();
      };
      document.head.appendChild(s);
    });
  }

  async function open(design, productKey, productMeta) {
    if (!cacheDom()) {
      console.warn('[creator-design-studio] modal root missing');
      return;
    }
    ensureStudioStyles();
    await ensurePatternMath();
    bindOnce();

    var nextProductKey = String(productKey || '').trim();
    if (!nextProductKey) return;

    if (isLoading && ctxProductKey === nextProductKey) return;
    if (isOpen && ctxProductKey === nextProductKey && !isLoading) return;

    if (isOpen && ctxProductKey !== nextProductKey) {
      if (isDirty()) {
        showUnsavedDialog(function () {
          doClose();
          open(design, productKey, productMeta);
        });
        return;
      }
      doClose();
    }

    ctxDesign = design;
    ctxProductKey = nextProductKey;
    ctxProductMeta = productMeta || null;
    activeAssetKey = 'primary';
    assetSelected = true;
    activeSettingsTab = 'design';

    if (subtitleEl) {
      subtitleEl.textContent = (productMeta && productMeta.title) || ctxProductKey;
    }

    setStatus('');
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    isOpen = true;
    isLoading = true;
    setViewerBusy(true, t('designStudioLoading', 'Loading…'));
    syncBusyChrome();
    setLayoutReady(false);
    ensureStageResizeObserver();
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }

    try {
      ctxData = await loadContext(design, ctxProductKey);
      if (!isOpen || ctxProductKey !== nextProductKey) return;
      if (ctxDesign && ctxData) {
        if (ctxData.design_preview_url) ctxDesign.preview_url = ctxData.design_preview_url;
        if (ctxData.design_original_url) ctxDesign.original_url = ctxData.design_original_url;
        if (ctxData.design_width) ctxDesign.width = ctxData.design_width;
        if (ctxData.design_height) ctxDesign.height = ctxData.design_height;
      }
      draft = ctxData.draft || { product_key: ctxProductKey };
      ensurePrintArea();
      draft.print_area.position = 'front';
      if (!draft.print_area.color_key) draft.print_area.color_key = resolveColorKey();
      // Seed unset positions with admin defaults (same as Reset); keep saved custom transforms.
      applyAdminDefaultsToDraft(false);
      // Contain-clamp may finish after image load — keep open clean until then.
      syncSavedAfterContainClamp = pendingContainClampDefaults;
      ensurePrimaryVisible();
      switchSettingsTab('design');
      renderStudioUi();
      savedDraftJson = draftJson();
      setStatus('');
      // Status text / settings panel can change viewer size — re-layout after chrome settles.
      scheduleLayoutPrintZone();
      markDirtyUi();
    } catch (e) {
      console.warn('[creator-design-studio]', e);
      setStatus(t('designStudioLoadError', 'Could not load studio.'));
    } finally {
      isLoading = false;
      setViewerBusy(false);
      syncBusyChrome();
    }
  }

  window.CreatorDesignStudioModal = {
    open: open,
    close: close,
    isOpen: function () {
      return isOpen;
    },
  };
})();
