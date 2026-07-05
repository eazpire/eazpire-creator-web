/**
 * Per-region cover settings (display mode, layout, image) in Creator Detail Modal.
 */
(function () {
  'use strict';

  if (window.CreatorCoverRegionsUI) return;

  var REGION_FLAGS = {
    EU: '\uD83C\uDDEA\uD83C\uDDFA',
    GB: '\uD83C\uDDEC\uD83C\uDDE7',
    US: '\uD83C\uDDFA\uD83C\uDDF8',
    CA: '\uD83C\uDDE8\uD83C\uDDE6',
    AU: '\uD83C\uDDE6\uD83C\uDDFA',
    CN: '\uD83C\uDDE8\uD83C\uDDF3',
    OTHER: '\uD83C\uDF10',
  };

  var api = null;

  function t(key, fallback) {
    var i18n = window.CreatorI18n || {};
    return i18n[key] || fallback;
  }

  function regionTabs() {
    return (window.CreatorHeroRegions && window.CreatorHeroRegions.tabs) || [
      { code: 'EU', label: 'Europe' },
      { code: 'US', label: 'USA' },
      { code: 'GB', label: 'UK' },
      { code: 'CA', label: 'Canada' },
      { code: 'AU', label: 'Australia' },
      { code: 'CN', label: 'China' },
      { code: 'OTHER', label: 'Other' },
    ];
  }

  function normalizeCode(code) {
    if (window.CreatorHeroRegions && window.CreatorHeroRegions.normalizeRegionCode) {
      return window.CreatorHeroRegions.normalizeRegionCode(code);
    }
    return String(code || 'EU').toUpperCase();
  }

  function isLocked() {
    var st = api.state.cover;
    return (
      st.activeRegion !== st.standardRegion &&
      st.regions[st.activeRegion] &&
      st.regions[st.activeRegion].inheritFromStandard
    );
  }

  function emptyDraft() {
    return {
      displayMode: 'cover',
      originalDisplayMode: 'cover',
      coverLayout: 'simple',
      originalCoverLayout: 'simple',
      rotationInterval: 3,
      originalRotationInterval: 3,
      rotationSelectedIds: [],
      originalRotationSelectedIds: [],
      inheritFromStandard: false,
      originalInheritFromStandard: false,
      pendingImageData: null,
      hasUnsavedChanges: false,
      originalImageUrl: null,
      currentImageUrl: null,
      hasExistingImage: false,
      zoom: 100,
      offsetX: 0,
      offsetY: 0,
    };
  }

  function flushActiveRegionDraft() {
    var st = api.state.cover;
    var code = st.activeRegion;
    if (!code) return;
    if (!st.regions[code]) st.regions[code] = emptyDraft();
    var d = st.regions[code];
    d.displayMode = st.displayMode;
    d.coverLayout = st.coverLayout;
    d.rotationInterval = st.rotationInterval;
    d.rotationSelectedIds = st.rotationSelectedIds.slice();
    d.inheritFromStandard = !!st.regions[code].inheritFromStandard;
    d.pendingImageData = st.pendingImageData;
    d.hasUnsavedChanges = st.hasUnsavedChanges;
    d.originalImageUrl = st.originalImageUrl;
    d.currentImageUrl = st.currentImageUrl;
    d.hasExistingImage = st.hasExistingImage;
    d.zoom = st.zoom;
    d.offsetX = st.offsetX;
    d.offsetY = st.offsetY;
    d.originalDisplayMode = st.originalDisplayMode;
    d.originalCoverLayout = st.originalCoverLayout;
    d.originalRotationInterval = st.originalRotationInterval;
    d.originalRotationSelectedIds = st.originalRotationSelectedIds.slice();
    d.originalInheritFromStandard = st.originalInheritFromStandard;
  }

  function applyRegionDraftToCoverState(code) {
    var st = api.state.cover;
    var d = st.regions[code] || emptyDraft();
    st.displayMode = d.displayMode;
    st.originalDisplayMode = d.originalDisplayMode;
    st.coverLayout = d.coverLayout;
    st.originalCoverLayout = d.originalCoverLayout;
    st.rotationInterval = d.rotationInterval;
    st.originalRotationInterval = d.originalRotationInterval;
    st.rotationSelectedIds = d.rotationSelectedIds.slice();
    st.originalRotationSelectedIds = d.originalRotationSelectedIds.slice();
    st.inheritFromStandard = d.inheritFromStandard;
    st.originalInheritFromStandard = d.originalInheritFromStandard;
    st.pendingImageData = d.pendingImageData;
    st.hasUnsavedChanges = d.hasUnsavedChanges;
    st.originalImageUrl = d.originalImageUrl;
    st.currentImageUrl = d.currentImageUrl;
    st.hasExistingImage = d.hasExistingImage;
    st.zoom = d.zoom || 100;
    st.offsetX = d.offsetX || 0;
    st.offsetY = d.offsetY || 0;
  }

  function draftFromApiRow(row) {
    var effMode = row.effective_display_mode || row.display_mode || 'cover';
    var effLayout = row.effective_cover_layout || row.cover_layout || 'simple';
    var effInterval = row.effective_cover_rotation_interval ?? row.cover_rotation_interval ?? 3;
    var effIds = row.effective_cover_rotation_asset_ids || row.cover_rotation_asset_ids || [];
    var img = row.locked ? row.effective_image_url : row.image_url || row.effective_image_url;
    return {
      displayMode: effMode,
      originalDisplayMode: row.display_mode || effMode,
      coverLayout: effLayout,
      originalCoverLayout: row.cover_layout || effLayout,
      rotationInterval: effInterval,
      originalRotationInterval: row.cover_rotation_interval ?? effInterval,
      rotationSelectedIds: effIds.slice(),
      originalRotationSelectedIds: (row.cover_rotation_asset_ids || effIds).slice(),
      inheritFromStandard: !!row.inherit_from_standard,
      originalInheritFromStandard: !!row.inherit_from_standard,
      pendingImageData: null,
      hasUnsavedChanges: false,
      originalImageUrl: img || null,
      currentImageUrl: img || null,
      hasExistingImage: !!img,
      zoom: 100,
      offsetX: 0,
      offsetY: 0,
    };
  }

  function updateControlsUI() {
    var st = api.state.cover;
    var bar = api.elements.coverRegionBar;
    if (!bar) return;

    var standard = st.standardRegion;
    var active = st.activeRegion;
    var isStd = active === standard;
    var locked = isLocked();

    var standardWrap = bar.querySelector('#cdm-cover-region-standard-wrap');
    var inheritWrap = bar.querySelector('#cdm-cover-region-inherit-wrap');
    var inheritLabel = bar.querySelector('#cdm-cover-region-inherit-label');
    var applyBtn = bar.querySelector('#cdm-cover-region-apply-all');

    if (standardWrap) standardWrap.style.display = isStd ? '' : 'none';
    if (inheritWrap) inheritWrap.style.display = isStd ? 'none' : '';
    if (inheritLabel) {
      inheritLabel.textContent = t('detailModalCoverRegionInheritTpl', standard + ' settings')
        .replace('__REGION__', standard)
        .replace('{region}', standard);
    }

    var standardInput = bar.querySelector('#cdm-cover-region-standard');
    if (standardInput) standardInput.checked = isStd;

    var inheritInput = bar.querySelector('#cdm-cover-region-inherit');
    if (inheritInput) {
      inheritInput.checked = !!st.regions[active]?.inheritFromStandard;
      inheritInput.disabled = false;
    }

    if (applyBtn) applyBtn.disabled = locked;

    bar.classList.toggle('cdm-cover-region-bar--locked', locked);
    var coverContent = api.elements.contentCover;
    if (coverContent) {
      coverContent.classList.toggle('cdm-cover-content--region-locked', locked);
    }
  }

  function renderRegionTabs() {
    var tabsRoot = api.elements.coverRegionTabs;
    if (!tabsRoot) return;
    var st = api.state.cover;
    var active = st.activeRegion;

    tabsRoot.innerHTML = regionTabs()
      .map(function (tab) {
        var code = tab.code;
        var flag = REGION_FLAGS[code] || REGION_FLAGS.OTHER;
        var cls = 'cdm-cover-region-tab' + (code === active ? ' is-active' : '');
        return (
          '<button type="button" class="' +
          cls +
          '" data-cover-region="' +
          code +
          '" role="tab" aria-selected="' +
          (code === active) +
          '">' +
          '<span class="cdm-cover-region-tab__flag" aria-hidden="true">' +
          flag +
          '</span>' +
          '<span class="cdm-cover-region-tab__code">' +
          code +
          '</span>' +
          '</button>'
        );
      })
      .join('');

    tabsRoot.querySelectorAll('[data-cover-region]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchRegion(btn.getAttribute('data-cover-region'));
      });
    });
  }

  function applyRegionToUI(code) {
    applyRegionDraftToCoverState(code);
    api.updateDisplayModeUI(api.state.cover.displayMode);
    api.updateCoverLayoutUI(api.state.cover.coverLayout);
    api.syncRotationIntervalLabel();

    var img = api.state.cover.currentImageUrl;
    if (img) {
      api.showImage('cover', img, true);
    } else {
      api.showPlaceholder('cover');
    }

    if (api.state.cover.coverLayout === 'rotating' && api.loadRotationAssets) {
      api.loadRotationAssets();
    }

    updateControlsUI();
    api.updateSaveButtonState();
  }

  function switchRegion(code) {
    code = normalizeCode(code);
    var st = api.state.cover;
    if (code === st.activeRegion) return;
    flushActiveRegionDraft();
    st.activeRegion = code;
    renderRegionTabs();
    applyRegionToUI(code);
  }

  function onStandardToggle(checked) {
    var st = api.state.cover;
    if (!checked) return;
    flushActiveRegionDraft();
    st.standardRegion = st.activeRegion;
    st.regionsMetaDirty = true;
    if (!st.regions[st.standardRegion]) st.regions[st.standardRegion] = emptyDraft();
    st.regions[st.standardRegion].inheritFromStandard = false;
    Object.keys(st.regions).forEach(function (code) {
      if (code !== st.standardRegion && st.regions[code].inheritFromStandard) {
        st.regions[code].inheritFromStandard = true;
      }
    });
    renderRegionTabs();
    applyRegionToUI(st.activeRegion);
    api.markAsChanged('cover');
  }

  function onInheritToggle(checked) {
    var st = api.state.cover;
    var code = st.activeRegion;
    if (!st.regions[code]) st.regions[code] = emptyDraft();
    st.regions[code].inheritFromStandard = checked;
    st.regionsMetaDirty = true;
    if (checked && st.regions[st.standardRegion]) {
      var src = st.regions[st.standardRegion];
      var d = st.regions[code];
      d.displayMode = src.displayMode;
      d.coverLayout = src.coverLayout;
      d.rotationInterval = src.rotationInterval;
      d.rotationSelectedIds = src.rotationSelectedIds.slice();
      d.originalImageUrl = src.originalImageUrl || src.currentImageUrl;
      d.currentImageUrl = src.currentImageUrl || src.originalImageUrl;
      d.hasExistingImage = src.hasExistingImage;
      d.pendingImageData = null;
    }
    if (checked) {
      st.pendingImageData = null;
    }
    applyRegionToUI(code);
    api.markAsChanged('cover');
  }

  async function applyToAllRegions() {
    var st = api.state.cover;
    flushActiveRegionDraft();
    var from = st.activeRegion;
    if (!api.getOwnerId() || !api.getCreatorName()) return;

    try {
      var url = new URL(api.API_BASE);
      url.searchParams.set('op', 'save-creator-cover-regions');
      url.searchParams.set('owner_id', api.getOwnerId());
      url.searchParams.set('creator_name', api.getCreatorName());

      var res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply_settings_from: from }),
      });
      var data = await res.json();
      if (!data.ok) {
        api.showStatus(data.error || 'Could not apply settings.', 'error');
        return;
      }
      await loadCoverRegions(api.imageLoadGeneration);
      api.showStatus(
        t('detailModalCoverRegionAppliedAll', 'Settings applied to all regions.'),
        'success'
      );
    } catch (e) {
      api.showStatus(e.message || 'Could not apply settings.', 'error');
    }
  }

  async function loadCoverRegions(loadGen) {
    if (!api.getOwnerId() || !api.getCreatorName()) return;

    try {
      var url = new URL(api.API_BASE);
      url.searchParams.set('op', 'get-creator-cover-regions');
      url.searchParams.set('owner_id', api.getOwnerId());
      url.searchParams.set('creator_name', api.getCreatorName());

      var res = await fetch(url.toString());
      var data = await res.json();

      if (loadGen !== undefined && loadGen !== api.imageLoadGeneration) return;
      if (!data.ok) return;

      var st = api.state.cover;
      st.standardRegion = normalizeCode(data.standard_region || 'EU');
      st.originalStandardRegion = st.standardRegion;
      st.activeRegion = st.standardRegion;
      st.regions = {};
      st.regionsMetaDirty = false;
      st.regionsLoaded = true;

      (data.regions || []).forEach(function (row) {
        st.regions[normalizeCode(row.region_code)] = draftFromApiRow(row);
      });

      renderRegionTabs();
      applyRegionToUI(st.activeRegion);
    } catch (err) {
      console.warn('[CoverRegions] load failed', err);
      api.loadCreatorImage('cover', loadGen);
    }
  }

  function buildRegionsSavePayload() {
    flushActiveRegionDraft();
    var st = api.state.cover;
    var regions = [];
    regionTabs().forEach(function (tab) {
      var code = tab.code;
      var d = st.regions[code] || emptyDraft();
      regions.push({
        region_code: code,
        inherit_from_standard: !!d.inheritFromStandard,
        display_mode: d.displayMode,
        cover_layout: d.coverLayout,
        cover_rotation_interval: d.rotationInterval,
        cover_rotation_asset_ids: d.rotationSelectedIds,
      });
    });
    return {
      standard_region: st.standardRegion,
      regions: regions,
    };
  }

  async function saveCoverRegionsMeta() {
    if (!api.state.cover.regionsMetaDirty && !hasRegionMetaChanges()) return true;
    flushActiveRegionDraft();

    var url = new URL(api.API_BASE);
    url.searchParams.set('op', 'save-creator-cover-regions');
    url.searchParams.set('owner_id', api.getOwnerId());
    url.searchParams.set('creator_name', api.getCreatorName());

    var res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRegionsSavePayload()),
    });
    var data = await res.json();
    if (!data.ok) return false;
    api.state.cover.regionsMetaDirty = false;
    api.state.cover.originalStandardRegion = api.state.cover.standardRegion;
    regionTabs().forEach(function (tab) {
      var d = api.state.cover.regions[tab.code];
      if (d) {
        d.originalInheritFromStandard = d.inheritFromStandard;
        d.originalDisplayMode = d.displayMode;
        d.originalCoverLayout = d.coverLayout;
        d.originalRotationInterval = d.rotationInterval;
        d.originalRotationSelectedIds = d.rotationSelectedIds.slice();
      }
    });
    return true;
  }

  function hasRegionMetaChanges() {
    var st = api.state.cover;
    if (!st.regionsLoaded) return false;
    if (st.standardRegion !== st.originalStandardRegion) return true;
    return regionTabs().some(function (tab) {
      var d = st.regions[tab.code];
      if (!d) return false;
      return d.inheritFromStandard !== d.originalInheritFromStandard;
    });
  }

  function appendRegionQuery(url) {
    var code = api.state.cover.activeRegion;
    if (api.state.cover.regionsLoaded && code) {
      url.searchParams.set('region_code', code);
    }
    return url;
  }

  function init(hooks) {
    api = hooks;
    var bar = api.elements.coverRegionBar;
    if (!bar) return;

    var standardInput = bar.querySelector('#cdm-cover-region-standard');
    var inheritInput = bar.querySelector('#cdm-cover-region-inherit');
    var applyBtn = bar.querySelector('#cdm-cover-region-apply-all');

    if (standardInput) {
      standardInput.addEventListener('change', function () {
        if (standardInput.checked) onStandardToggle(true);
      });
    }
    if (inheritInput) {
      inheritInput.addEventListener('change', function () {
        onInheritToggle(inheritInput.checked);
      });
    }
    if (applyBtn) {
      applyBtn.addEventListener('click', function () {
        applyToAllRegions();
      });
    }
  }

  function reset() {
    if (!api) return;
    api.state.cover.regions = {};
    api.state.cover.regionsLoaded = false;
    api.state.cover.regionsMetaDirty = false;
    api.state.cover.activeRegion = 'EU';
    api.state.cover.standardRegion = 'EU';
    api.state.cover.originalStandardRegion = 'EU';
  }

  window.CreatorCoverRegionsUI = {
    init: init,
    reset: reset,
    loadCoverRegions: loadCoverRegions,
    flushActiveRegionDraft: flushActiveRegionDraft,
    switchRegion: switchRegion,
    saveCoverRegionsMeta: saveCoverRegionsMeta,
    appendRegionQuery: appendRegionQuery,
    isLocked: isLocked,
    hasRegionMetaChanges: hasRegionMetaChanges,
    buildRegionsSavePayload: buildRegionsSavePayload,
  };
})();
