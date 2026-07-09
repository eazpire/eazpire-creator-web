/**
 * Creator Design Studio — fullscreen overlay (IDEA-026).
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
  var designWrapEl = null;
  var designImgEl = null;
  var designChromeEl = null;
  var posBarEl = null;
  var panelDesignEl = null;
  var panelVariantsEl = null;
  var addMenuEl = null;
  var pickerEl = null;
  var pickerGridEl = null;
  var pickerTitleEl = null;
  var pickerEmptyEl = null;
  var uploadInputEl = null;

  var ctxDesign = null;
  var ctxProductKey = null;
  var ctxProductMeta = null;
  var ctxData = null;
  var draft = null;
  var savedDraftJson = '';
  var activeSettingsTab = 'design';
  var activeAssetKey = 'primary';
  var isOpen = false;
  var isSaving = false;
  var isLoading = false;
  var pickerMode = 'mine';
  var transformDrag = null;

  var MAX_OWN_ADDITIONAL = 5;
  var MAX_PUBLIC_ADDITIONAL = 1;

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

  function draftJson() {
    return JSON.stringify(draft || {});
  }

  function isDirty() {
    if (isLoading || draft == null) return false;
    return draftJson() !== savedDraftJson;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function ensurePrintArea() {
    draft.print_area = draft.print_area || {};
    draft.print_area.primary = draft.print_area.primary || { x: 0.5, y: 0.5, scale: 0.95, rotate: 0 };
    draft.print_area.additional = draft.print_area.additional || [];
    draft.print_area.pattern = draft.print_area.pattern || {
      enabled: false,
      spacing_x: 1,
      spacing_y: 1,
      pattern_angle: 0,
    };
    draft.print_area.alignment = draft.print_area.alignment || { h: 'center', v: 'center' };
    return draft.print_area;
  }

  function findStudioRoot() {
    var nodes = document.querySelectorAll('#creatorDesignStudioModal');
    if (!nodes || !nodes.length) return null;
    for (var i = nodes.length - 1; i >= 0; i--) {
      var node = nodes[i];
      if (node && node.isConnected) return node;
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
    designWrapEl = root.querySelector('#cds-design-wrap');
    designImgEl = root.querySelector('#cds-primary-design');
    designChromeEl = root.querySelector('#cds-design-chrome');
    posBarEl = root.querySelector('#cds-pos-bar');
    panelDesignEl = root.querySelector('#cds-panel-design');
    panelVariantsEl = root.querySelector('#cds-panel-variants');
    addMenuEl = root.querySelector('#cds-add-menu');
    pickerEl = root.querySelector('#cds-design-picker');
    pickerGridEl = root.querySelector('#cds-picker-grid');
    pickerTitleEl = root.querySelector('#cds-picker-title');
    pickerEmptyEl = root.querySelector('#cds-picker-empty');
    uploadInputEl = root.querySelector('#cds-upload-input');
    return true;
  }

  function markDirtyUi() {
    if (btnSave) btnSave.disabled = isSaving || !isDirty();
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

  function currentPosition() {
    var cfg = studioConfig();
    var positions = cfg.enabled_positions || ['front', 'back'];
    var pos = (draft && draft.print_area && draft.print_area.position) || positions[0] || 'front';
    return pos;
  }

  function mockEntryForPosition(pos) {
    var cfg = studioConfig();
    var ck = resolveColorKey();
    var list = (cfg.mocks_by_color && cfg.mocks_by_color[ck]) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].position === pos && list[i].mock_url) return list[i];
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].mock_url) return list[j];
    }
    var allKeys = Object.keys(cfg.mocks_by_color || {});
    for (var k = 0; k < allKeys.length; k++) {
      var alt = cfg.mocks_by_color[allKeys[k]] || [];
      for (var m = 0; m < alt.length; m++) {
        if (alt[m].position === pos && alt[m].mock_url) return alt[m];
      }
    }
    return null;
  }

  function activeTransform() {
    ensurePrintArea();
    if (activeAssetKey === 'primary') return draft.print_area.primary;
    if (activeAssetKey === 'public' && draft.print_area.public_additional) {
      draft.print_area.public_additional.transform = draft.print_area.public_additional.transform || { x: 0.5, y: 0.5, scale: 0.4, rotate: 0 };
      return draft.print_area.public_additional.transform;
    }
    var m = String(activeAssetKey || '').match(/^own-(\d+)$/);
    if (m) {
      var idx = Number(m[1]);
      var slot = draft.print_area.additional[idx];
      if (slot) {
        slot.transform = slot.transform || { x: 0.5, y: 0.5, scale: 0.5, rotate: 0 };
        return slot.transform;
      }
    }
    return draft.print_area.primary;
  }

  function designUrlForAsset(key) {
    if (key === 'primary') {
      return (ctxData && ctxData.design_preview_url) || (ctxDesign && ctxDesign.preview_url) || '';
    }
    if (key === 'public' && draft.print_area.public_additional && draft.print_area.public_additional.preview_url) {
      return draft.print_area.public_additional.preview_url;
    }
    var m = String(key || '').match(/^own-(\d+)$/);
    if (m) {
      var slot = draft.print_area.additional[Number(m[1])];
      if (slot && slot.preview_url) return slot.preview_url;
    }
    return '';
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
    if (!viewerStageEl || !mockImgEl || mockImgEl.hidden || !mockImgEl.naturalWidth) {
      var sw = viewerStageEl ? viewerStageEl.clientWidth : (viewerEl ? viewerEl.clientWidth : 1);
      var sh = viewerStageEl ? viewerStageEl.clientHeight : (viewerEl ? viewerEl.clientHeight : 1);
      return { left: 0, top: 0, width: Math.max(1, sw), height: Math.max(1, sh) };
    }
    var nw = mockImgEl.naturalWidth;
    var nh = mockImgEl.naturalHeight;
    var cw = mockImgEl.clientWidth || mockImgEl.offsetWidth;
    var ch = mockImgEl.clientHeight || mockImgEl.offsetHeight;
    if (!cw || !ch) {
      cw = viewerStageEl.clientWidth || 1;
      ch = viewerStageEl.clientHeight || 1;
      var scale = Math.min(cw / nw, ch / nh);
      cw = nw * scale;
      ch = nh * scale;
    }
    return { left: 0, top: 0, width: cw, height: ch };
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
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

    var zoneW = printZoneEl.offsetWidth || 1;
    var zoneH = printZoneEl.offsetHeight || 1;
    var designW = Math.max(24, zoneW * scale);
    designImgEl.style.width = designW + 'px';
    designImgEl.style.height = 'auto';
    designImgEl.style.maxWidth = 'none';
    designImgEl.style.maxHeight = 'none';
    designImgEl.style.left = '';
    designImgEl.style.top = '';
    designImgEl.style.transform = '';

    // x/y are center position inside the print zone (0..1)
    var dx = (x - 0.5) * zoneW;
    var dy = (y - 0.5) * zoneH;
    designWrapEl.style.left = '50%';
    designWrapEl.style.top = '50%';
    designWrapEl.style.transform =
      'translate(-50%, -50%) translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';

    if (designChromeEl) {
      designChromeEl.hidden = false;
      designChromeEl.classList.add('is-visible');
      designChromeEl.style.left = '0';
      designChromeEl.style.top = '0';
      designChromeEl.style.width = '100%';
      designChromeEl.style.height = '100%';
    }
  }

  function layoutPrintZone() {
    if (!printZoneEl || !viewerStageEl) return;
    var fr = measureMockRect();
    var z = currentZoneFrac();
    printZoneEl.style.left = (z.l * fr.width) + 'px';
    printZoneEl.style.top = (z.t * fr.height) + 'px';
    printZoneEl.style.width = (z.w * fr.width) + 'px';
    printZoneEl.style.height = (z.h * fr.height) + 'px';
    printZoneEl.hidden = false;
    applyTransformToDesignImg();
  }

  function syncDesignChrome() {
    // Chrome is sized to the design wrap via CSS (100%); nothing to sync.
  }

  function renderPositionBar() {
    if (!posBarEl) return;
    var cfg = studioConfig();
    var positions = cfg.enabled_positions || ['front', 'back'];
    var current = currentPosition();
    posBarEl.innerHTML = '';
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cds-pos-tab' + (pos === current ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', pos === current ? 'true' : 'false');
      btn.textContent = pos;
      btn.addEventListener('click', function (p) {
        return function () {
          ensurePrintArea().position = p;
          renderViewer();
          markDirtyUi();
        };
      }(pos));
      posBarEl.appendChild(btn);
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

    function afterMockReady() {
      layoutPrintZone();
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
    }

    var url = designUrlForAsset(activeAssetKey);
    if (designWrapEl && designImgEl && url) {
      designWrapEl.hidden = false;
      designImgEl.hidden = false;
      if (designImgEl.src !== url) {
        designImgEl.onload = function () {
          layoutPrintZone();
        };
        designImgEl.src = url;
      } else {
        layoutPrintZone();
      }
    } else if (designWrapEl) {
      designWrapEl.hidden = true;
      if (designChromeEl) designChromeEl.hidden = true;
    }
  }

  function collapseHtml(id, title, bodyHtml, open) {
    return (
      '<div class="cds-collapse' + (open ? ' is-open' : '') + '" data-cds-collapse="' + id + '">' +
      '<button type="button" class="cds-collapse__head">' + title + '</button>' +
      '<div class="cds-collapse__body">' + bodyHtml + '</div></div>'
    );
  }

  function renderDesignSettingsPanel() {
    if (!panelDesignEl) return;
    ensurePrintArea();
    var pa = draft.print_area;
    var tr = activeTransform();

    var assetsHtml = '<div class="cds-asset-grid" id="cds-asset-grid">';
    assetsHtml +=
      '<button type="button" class="cds-asset-tile' + (activeAssetKey === 'primary' ? ' is-active' : '') + '" data-cds-asset="primary">' +
      '<img src="' + (designUrlForAsset('primary') || '') + '" alt=""></button>';
    var own = pa.additional || [];
    for (var i = 0; i < own.length; i++) {
      var key = 'own-' + i;
      assetsHtml +=
        '<button type="button" class="cds-asset-tile' + (activeAssetKey === key ? ' is-active' : '') + '" data-cds-asset="' + key + '">' +
        (own[i].preview_url ? '<img src="' + own[i].preview_url + '" alt="">' : '<span>#' + (i + 1) + '</span>') +
        '</button>';
    }
    if (pa.public_additional) {
      assetsHtml +=
        '<button type="button" class="cds-asset-tile' + (activeAssetKey === 'public' ? ' is-active' : '') + '" data-cds-asset="public">' +
        (pa.public_additional.preview_url ? '<img src="' + pa.public_additional.preview_url + '" alt="">' : '<span>P</span>') +
        '</button>';
    }
    if (own.length < MAX_OWN_ADDITIONAL || !pa.public_additional) {
      assetsHtml +=
        '<button type="button" class="cds-asset-tile cds-asset-tile--add" data-cds-open-add>' +
        '<span>+</span><span>' + t('designStudioAddDesigns', 'Add Designs') + '</span></button>';
    }
    assetsHtml += '</div>';

    var scaleBody =
      '<div class="cds-field-row"><label for="cds-scale-range">' + t('designStudioScale', 'Scale') + '</label>' +
      '<input type="range" id="cds-scale-range" min="0.15" max="3" step="0.01" value="' + (tr.scale != null ? tr.scale : 1) + '">' +
      '<input type="number" id="cds-scale-num" min="0.15" max="3" step="0.01" value="' + (tr.scale != null ? tr.scale : 1) + '"></div>';

    var rotateBody =
      '<div class="cds-field-row"><label for="cds-rotate-range">' + t('designStudioRotate', 'Rotate') + '</label>' +
      '<input type="range" id="cds-rotate-range" min="-180" max="180" step="1" value="' + (tr.rotate != null ? tr.rotate : 0) + '">' +
      '<input type="number" id="cds-rotate-num" min="-180" max="180" step="1" value="' + (tr.rotate != null ? tr.rotate : 0) + '"></div>';

    var cropBody =
      '<p class="cds-muted">' + t('designStudioCropHint', 'Crop adjusts the visible area of the selected design.') + '</p>' +
      '<button type="button" class="cds-btn-secondary" id="cds-crop-toggle">' + t('designStudioCrop', 'Crop') + '</button>';

    var align = pa.alignment || { h: 'center', v: 'center' };
    var alignBtns = [];
    ['left', 'center', 'right'].forEach(function (h) {
      ['top', 'middle', 'bottom'].forEach(function (v) {
        var on = align.h === h && align.v === v;
        alignBtns.push(
          '<button type="button" class="cds-align-btn' + (on ? ' is-active' : '') + '" data-align-h="' + h + '" data-align-v="' + v + '">' + h + '/' + v + '</button>'
        );
      });
    });
    var alignBody = '<div class="cds-align-grid" id="cds-align-grid">' + alignBtns.join('') + '</div>';

    var pat = pa.pattern || {};
    var patternBody =
      '<label class="cds-size-chip"><input type="checkbox" id="cds-pattern-enabled"' + (pat.enabled ? ' checked' : '') + '> ' +
      t('designStudioPatternEnable', 'Enable pattern') + '</label>' +
      '<div class="cds-field-row"><label>' + t('designStudioPatternSpacingX', 'Spacing X') + '</label>' +
      '<input type="range" id="cds-pattern-sx" min="0.5" max="3" step="0.05" value="' + (pat.spacing_x || 1) + '"></div>' +
      '<div class="cds-field-row"><label>' + t('designStudioPatternSpacingY', 'Spacing Y') + '</label>' +
      '<input type="range" id="cds-pattern-sy" min="0.5" max="3" step="0.05" value="' + (pat.spacing_y || 1) + '"></div>';

    panelDesignEl.innerHTML =
      assetsHtml +
      collapseHtml('transform', t('designStudioSectionTransform', 'Scale, Rotate, Crop'), scaleBody + rotateBody + cropBody, true) +
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
    if (!panelDesignEl) return;
    var tr = activeTransform();
    var scaleR = panelDesignEl.querySelector('#cds-scale-range');
    var scaleN = panelDesignEl.querySelector('#cds-scale-num');
    var rotR = panelDesignEl.querySelector('#cds-rotate-range');
    var rotN = panelDesignEl.querySelector('#cds-rotate-num');
    if (scaleR) scaleR.value = String(tr.scale != null ? tr.scale : 1);
    if (scaleN) scaleN.value = String(tr.scale != null ? tr.scale : 1);
    if (rotR) rotR.value = String(tr.rotate != null ? tr.rotate : 0);
    if (rotN) rotN.value = String(tr.rotate != null ? tr.rotate : 0);
  }

  function bindDesignSettingsPanel() {
    bindCollapsibles(panelDesignEl);

    panelDesignEl.querySelectorAll('[data-cds-asset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeAssetKey = btn.getAttribute('data-cds-asset') || 'primary';
        renderDesignSettingsPanel();
        renderViewer();
      });
    });

    var addBtn = panelDesignEl.querySelector('[data-cds-open-add]');
    if (addBtn) addBtn.addEventListener('click', openAddMenu);

    function bindRangePair(rangeId, numId, key, min, max) {
      var range = panelDesignEl.querySelector(rangeId);
      var num = panelDesignEl.querySelector(numId);
      function apply(val) {
        var tr = activeTransform();
        var n = Number(val);
        if (!Number.isFinite(n)) return;
        n = Math.max(min, Math.min(max, n));
        tr[key] = n;
        markDirtyUi();
        applyTransformToDesignImg();
        syncTransformInputs();
      }
      if (range) {
        range.addEventListener('input', function () { apply(range.value); });
      }
      if (num) {
        num.addEventListener('input', function () { apply(num.value); });
      }
    }

    bindRangePair('#cds-scale-range', '#cds-scale-num', 'scale', 0.15, 3);
    bindRangePair('#cds-rotate-range', '#cds-rotate-num', 'rotate', -180, 180);

    panelDesignEl.querySelectorAll('[data-align-h]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pa = ensurePrintArea();
        pa.alignment = pa.alignment || { h: 'center', v: 'center' };
        pa.alignment.h = btn.getAttribute('data-align-h');
        pa.alignment.v = btn.getAttribute('data-align-v');
        var tr = activeTransform();
        if (pa.alignment.h === 'left') tr.x = 0.25;
        else if (pa.alignment.h === 'right') tr.x = 0.75;
        else tr.x = 0.5;
        if (pa.alignment.v === 'top') tr.y = 0.25;
        else if (pa.alignment.v === 'bottom') tr.y = 0.75;
        else tr.y = 0.5;
        renderDesignSettingsPanel();
        applyTransformToDesignImg();
        markDirtyUi();
      });
    });

    var patEn = panelDesignEl.querySelector('#cds-pattern-enabled');
    if (patEn) {
      patEn.addEventListener('change', function () {
        ensurePrintArea().pattern.enabled = patEn.checked;
        markDirtyUi();
      });
    }
    ['#cds-pattern-sx', '#cds-pattern-sy'].forEach(function (sel, idx) {
      var el = panelDesignEl.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', function () {
        var pa = ensurePrintArea();
        if (idx === 0) pa.pattern.spacing_x = Number(el.value) || 1;
        else pa.pattern.spacing_y = Number(el.value) || 1;
        markDirtyUi();
      });
    });
  }

  function colorDotStyle(name) {
    var n = String(name || '').toLowerCase();
    var map = {
      black: '#111', white: '#f5f5f5', red: '#dc2626', blue: '#2563eb', navy: '#1e3a5f',
      green: '#16a34a', grey: '#6b7280', gray: '#6b7280', pink: '#ec4899', orange: '#f97316',
    };
    for (var k in map) {
      if (n.indexOf(k) !== -1) return 'background:' + map[k];
    }
    return 'background:#888';
  }

  function renderVariantSettingsPanel() {
    if (!panelVariantsEl || !ctxData) return;
    draft.variants = draft.variants || { selected_ids: [] };
    var selected = new Set((draft.variants.selected_ids || []).map(Number));
    var groups = ctxData.variant_groups || {};
    var keys = Object.keys(groups).sort();

    var html = '<p class="cds-skill-hint">' + t('designStudioVariantsSkillHint', 'Some variants must be unlocked in the skill tree before you can select them.') + '</p>';

    if (!keys.length) {
      html += '<p class="cds-muted">' + t('designStudioNoVariants', 'No variants in admin pool.') + '</p>';
    }

    for (var g = 0; g < keys.length; g++) {
      var color = keys[g];
      var items = groups[color] || [];
      var unlockedItems = items.filter(function (v) { return v.unlocked && v.in_admin_pool; });
      var selectedInColor = unlockedItems.filter(function (v) { return selected.has(Number(v.id)); });
      var allChecked = unlockedItems.length > 0 && selectedInColor.length === unlockedItems.length;
      var someChecked = selectedInColor.length > 0;

      html += '<div class="cds-color-group" data-color-group="' + color + '">';
      html += '<div class="cds-color-head">';
      html += '<input type="checkbox" data-color-all="' + color + '"' + (allChecked ? ' checked' : '') + (someChecked && !allChecked ? ' data-indeterminate="1"' : '') + '>';
      html += '<span class="cds-color-dot" style="' + colorDotStyle(color) + '"></span>';
      html += '<span class="cds-color-name">' + color + ' (' + selectedInColor.length + ')</span>';
      html += '<button type="button" class="cds-color-toggle" aria-label="Toggle sizes">▾</button>';
      html += '</div><div class="cds-color-body">';

      for (var i = 0; i < items.length; i++) {
        var v = items[i];
        var locked = !v.unlocked || !v.in_admin_pool;
        var id = Number(v.id);
        var checked = selected.has(id);
        html +=
          '<label class="cds-size-chip' + (locked ? ' is-locked' : '') + '">' +
          '<input type="checkbox" data-variant-id="' + id + '"' + (checked ? ' checked' : '') + (locked ? ' disabled' : '') + '> ' +
          v.size + (locked ? ' (' + t('designStudioLocked', 'Locked') + ')' : '') +
          '</label>';
      }
      html += '</div></div>';
    }

    panelVariantsEl.innerHTML = html;

    panelVariantsEl.querySelectorAll('[data-indeterminate]').forEach(function (cb) {
      cb.indeterminate = true;
    });

    panelVariantsEl.querySelectorAll('.cds-color-head').forEach(function (head) {
      head.addEventListener('click', function (e) {
        if (e.target.matches('input[type="checkbox"]')) return;
        head.parentElement.classList.toggle('is-open');
      });
    });

    panelVariantsEl.querySelectorAll('[data-color-all]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var color = cb.getAttribute('data-color-all');
        var items = groups[color] || [];
        var ids = new Set((draft.variants.selected_ids || []).map(Number));
        for (var j = 0; j < items.length; j++) {
          var v = items[j];
          if (!v.unlocked || !v.in_admin_pool) continue;
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

  function bindViewerTransform() {
    if (!designWrapEl || designWrapEl.__cdsTransformBound) return;
    designWrapEl.__cdsTransformBound = true;

    function onPointerMove(e) {
      if (!transformDrag) return;
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
        tr.rotate = clamp(transformDrag.startTr.rotate + ((ang - ang0) * 180) / Math.PI, -180, 180);
      } else if (transformDrag.mode === 'scale') {
        var startDist = Math.hypot(transformDrag.startX - transformDrag.center.cx, transformDrag.startY - transformDrag.center.cy);
        var curDist = Math.hypot(e.clientX - transformDrag.center.cx, e.clientY - transformDrag.center.cy);
        var ratio = startDist > 1 ? curDist / startDist : 1;
        tr.scale = clamp(transformDrag.startTr.scale * ratio, 0.15, 2.5);
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

    window.addEventListener('resize', function () {
      if (isOpen) layoutPrintZone();
    });
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

    var url = apiBase() + '?op=' + (pickerMode === 'public' ? 'list-public' : 'list') +
      '&owner_id=' + encodeURIComponent(owner) + '&limit=60';
    try {
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () { return {}; });
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
    ensurePrintArea();
    var pa = draft.print_area;
    var slot = {
      design_id: design.id,
      preview_url: design.preview_url || design.thumb_url || '',
      label: design.title || ('Design ' + design.id),
      transform: { x: 0.5, y: 0.5, scale: 0.5, rotate: 0 },
    };
    if (pickerMode === 'public') {
      if (pa.public_additional) return;
      pa.public_additional = Object.assign({}, slot, { owner_id: design.owner_id || null });
      activeAssetKey = 'public';
    } else {
      if ((pa.additional || []).length >= MAX_OWN_ADDITIONAL) return;
      pa.additional.push(slot);
      activeAssetKey = 'own-' + (pa.additional.length - 1);
    }
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

    if (addMenuEl) {
      var myBtn = addMenuEl.querySelector('[data-cds-add-my-designs]');
      var pubBtn = addMenuEl.querySelector('[data-cds-add-public-designs]');
      var devBtn = addMenuEl.querySelector('[data-cds-add-upload="device"]');
      var phoneBtn = addMenuEl.querySelector('[data-cds-add-upload="phone"]');
      if (myBtn) myBtn.addEventListener('click', function () { openDesignPicker('mine'); });
      if (pubBtn) pubBtn.addEventListener('click', function () { openDesignPicker('public'); });
      if (devBtn) devBtn.addEventListener('click', function () {
        closeSubmodals();
        if (uploadInputEl) uploadInputEl.click();
      });
      if (phoneBtn) phoneBtn.addEventListener('click', function () {
        closeSubmodals();
        if (window.openCreatorPhoneUploadModal) window.openCreatorPhoneUploadModal();
        else if (uploadInputEl) uploadInputEl.click();
      });
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
        if ((addMenuEl && !addMenuEl.hidden) || (pickerEl && !pickerEl.hidden)) {
          closeSubmodals();
          ev.preventDefault();
          return;
        }
        ev.preventDefault();
        close(false);
      }
    });

    bindViewerTransform();
  }

  function resetToDefaults() {
    var cfg = studioConfig();
    var positions = cfg.enabled_positions || ['front'];
    var colors = cfg.mocks_by_color ? Object.keys(cfg.mocks_by_color) : ['default'];
    draft.print_area = {
      position: positions[0] || 'front',
      color_key: resolveColorKey() || colors[0] || 'default',
      primary: { x: 0.5, y: 0.5, scale: 0.95, rotate: 0 },
      additional: [],
      public_additional: null,
      alignment: { h: 'center', v: 'center' },
      pattern: { enabled: false, spacing_x: 1, spacing_y: 1, pattern_angle: 0 },
    };
    activeAssetKey = 'primary';
    renderStudioUi();
    markDirtyUi();
  }

  async function loadContext(design, productKey) {
    var owner = getOwnerId();
    if (!owner) throw new Error('missing_owner');
    var region = catalogRegion();
    var shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : window.__SHOPIFY_SHOP_DOMAIN || '';
    var url =
      apiBase() +
      '?op=get-studio-context&design_id=' + encodeURIComponent(String(design.id)) +
      '&product_key=' + encodeURIComponent(productKey) +
      '&owner_id=' + encodeURIComponent(owner) +
      '&region=' + encodeURIComponent(region);
    if (shop) url += '&shop=' + encodeURIComponent(shop);
    var res = await fetch(url, { credentials: 'include' });
    var data = await res.json().catch(function () { return {}; });
    if (!data.ok) throw new Error(data.error || 'load_failed');
    return data;
  }

  function showUnsavedDialog(onDiscard) {
    var msg = t('designStudioUnsaved', 'You have unsaved changes. Save before closing?');
    if (window.confirm(msg + '\n\n' + t('designStudioUnsavedOk', 'OK = Save, Cancel = Discard'))) {
      onSave().then(function (ok) {
        if (ok) doClose();
      });
    } else {
      onDiscard();
    }
  }

  function doClose() {
    isOpen = false;
    isLoading = false;
    closeSubmodals();
    if (root) {
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
    activeAssetKey = 'primary';
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
    if (isSaving || !ctxDesign || !ctxProductKey || !draft) return false;
    var owner = getOwnerId();
    if (!owner) return false;

    isSaving = true;
    markDirtyUi();
    setStatus(t('designStudioSaving', 'Saving…'));

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
      var data = await res.json().catch(function () { return {}; });
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
      markDirtyUi();
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

  async function open(design, productKey, productMeta) {
    if (!cacheDom()) {
      console.warn('[creator-design-studio] modal root missing');
      return;
    }
    ensureStudioStyles();
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
    activeSettingsTab = 'design';

    if (subtitleEl) {
      subtitleEl.textContent = (productMeta && productMeta.title) || ctxProductKey;
    }

    setStatus(t('designStudioLoading', 'Loading…'));
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    isOpen = true;
    isLoading = true;
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }

    try {
      ctxData = await loadContext(design, ctxProductKey);
      if (!isOpen || ctxProductKey !== nextProductKey) return;
      draft = ctxData.draft || { product_key: ctxProductKey };
      ensurePrintArea();
      if (!draft.print_area.color_key) draft.print_area.color_key = resolveColorKey();
      switchSettingsTab('design');
      renderStudioUi();
      savedDraftJson = draftJson();
      setStatus('');
      markDirtyUi();
    } catch (e) {
      console.warn('[creator-design-studio]', e);
      setStatus(t('designStudioLoadError', 'Could not load studio.'));
    } finally {
      isLoading = false;
    }
  }

  window.CreatorDesignStudioModal = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; },
  };
})();
