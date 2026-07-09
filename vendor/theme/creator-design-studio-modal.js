/**
 * Creator Design Studio overlay modal (IDEA-026).
 */
(function () {
  'use strict';

  var root = null;
  var subtitleEl = null;
  var statusEl = null;
  var btnSave = null;
  var btnClose = null;
  var sidebarEl = null;
  var drawerToggle = null;

  var ctxDesign = null;
  var ctxProductKey = null;
  var ctxProductMeta = null;
  var ctxData = null;
  var draft = null;
  var savedDraftJson = '';
  var activeTab = 'print_area';
  var isOpen = false;
  var isSaving = false;
  var isLoading = false;

  var TABS = ['print_area', 'variants', 'publication', 'mockups', 'prices'];
  var MAX_OWN_ADDITIONAL = 5;
  var MAX_PUBLIC_ADDITIONAL = 1;
  var MAX_CUSTOM_MOCKS = 2;

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
    sidebarEl = root.querySelector('#cds-sidebar');
    drawerToggle = root.querySelector('#cds-drawer-toggle');
    return true;
  }

  function bindOnce() {
    if (!root || root.__cdsBound) return;
    root.__cdsBound = true;

    if (btnClose) btnClose.addEventListener('click', function () { close(false); });
    if (btnSave) btnSave.addEventListener('click', onSave);
    root.querySelectorAll('[data-cds-close]').forEach(function (el) {
      el.addEventListener('click', function () { close(false); });
    });

    root.querySelectorAll('[data-cds-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.getAttribute('data-cds-tab'));
        if (sidebarEl) sidebarEl.classList.remove('is-open');
        if (drawerToggle) drawerToggle.setAttribute('aria-expanded', 'false');
      });
    });

    if (drawerToggle && sidebarEl) {
      drawerToggle.addEventListener('click', function () {
        var open = sidebarEl.classList.toggle('is-open');
        drawerToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    document.addEventListener('keydown', function (ev) {
      if (!isOpen) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close(false);
      }
    });
  }

  function switchTab(tab) {
    if (!tab || TABS.indexOf(tab) === -1) return;
    activeTab = tab;
    root.querySelectorAll('[data-cds-tab]').forEach(function (btn) {
      var on = btn.getAttribute('data-cds-tab') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-current', on ? 'page' : 'false');
    });
    root.querySelectorAll('[data-cds-panel]').forEach(function (panel) {
      var on = panel.getAttribute('data-cds-panel') === tab;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
  }

  function currentMockEntry() {
    var cfg = ctxData && ctxData.studio_config;
    if (!cfg || !cfg.mocks_by_color) return null;
    var ck = (draft && draft.print_area && draft.print_area.color_key) || cfg.color_key_resolved || 'default';
    var list = cfg.mocks_by_color[ck] || cfg.mocks_by_color.default || [];
    var pos = (draft && draft.print_area && draft.print_area.position) || (cfg.enabled_positions && cfg.enabled_positions[0]) || 'front';
    for (var i = 0; i < list.length; i++) {
      if (list[i].position === pos && list[i].mock_url) return list[i];
    }
    for (var j = 0; j < list.length; j++) {
      if (list[j].mock_url) return list[j];
    }
    return null;
  }

  function applyPrimaryTransform(img) {
    if (!img || !draft || !draft.print_area || !draft.print_area.primary) return;
    var p = draft.print_area.primary;
    var x = Number(p.x);
    var y = Number(p.y);
    var scale = Number(p.scale);
    var rot = Number(p.rotate);
    if (!Number.isFinite(x)) x = 0.5;
    if (!Number.isFinite(y)) y = 0.5;
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    if (!Number.isFinite(rot)) rot = 0;
    img.style.left = (x * 100) + '%';
    img.style.top = (y * 100) + '%';
    img.style.transform = 'translate(-50%, -50%) scale(' + scale + ') rotate(' + rot + 'deg)';
  }

  function renderPrintAreaPanel() {
    var panel = root.querySelector('#cds-panel-print-area');
    if (!panel) return;
    var cfg = ctxData && ctxData.studio_config;
    var mock = currentMockEntry();
    var positions = (cfg && cfg.enabled_positions) || ['front'];
    var colors = cfg && cfg.mocks_by_color ? Object.keys(cfg.mocks_by_color) : ['default'];
    var pa = draft.print_area || {};

    panel.innerHTML =
      '<h3 class="cds-section-title">' + t('designStudioTabPrintArea', 'Print Area') + '</h3>' +
      '<p class="cds-muted">' + t('designStudioPrimaryHint', 'Primary design can be repositioned only.') + '</p>' +
      '<div class="cds-viewer" id="cds-print-viewer">' +
      (mock && mock.mock_url
        ? '<img class="cds-viewer__mock" src="' + mock.mock_url + '" alt="">' +
          '<img class="cds-viewer__design" id="cds-primary-design" src="" alt="">'
        : '<p class="cds-muted" style="padding:20px;text-align:center">' + t('designStudioNoMock', 'No mock available for this view.') + '</p>') +
      '</div>' +
      '<div class="cds-row">' +
      fieldSelect('cds-pos', t('designStudioPosition', 'Position'), positions, pa.position || positions[0]) +
      fieldSelect('cds-color', t('designStudioColor', 'Color'), colors, pa.color_key || colors[0]) +
      fieldNumber('cds-scale', t('designStudioScale', 'Scale'), pa.primary && pa.primary.scale != null ? pa.primary.scale : 1, 0.2, 3, 0.05) +
      fieldNumber('cds-rotate', t('designStudioRotate', 'Rotate °'), pa.primary && pa.primary.rotate != null ? pa.primary.rotate : 0, -180, 180, 1) +
      '</div>' +
      '<div class="cds-row">' +
      '<button type="button" class="cds-btn-secondary" id="cds-reset-defaults">' + t('designStudioResetDefaults', 'Reset to admin defaults') + '</button>' +
      '</div>' +
      '<h3 class="cds-section-title">' + t('designStudioAdditional', 'Additional designs') + '</h3>' +
      '<p class="cds-muted">' + t('designStudioAdditionalHint', 'Up to 5 own + 1 public design.') + '</p>' +
      '<div class="cds-list" id="cds-additional-list"></div>' +
      '<div class="cds-row">' +
      '<button type="button" class="cds-btn-secondary" id="cds-add-own">' + t('designStudioAddOwn', 'Add from library') + '</button>' +
      '<button type="button" class="cds-btn-secondary" id="cds-add-public">' + t('designStudioAddPublic', 'Browse public') + '</button>' +
      '</div>';

    var designImg = panel.querySelector('#cds-primary-design');
    if (designImg) {
      designImg.src = (ctxData && ctxData.design_preview_url) || (ctxDesign && ctxDesign.preview_url) || '';
      applyPrimaryTransform(designImg);
    }

    bindPrintAreaControls(panel, positions, colors);
    renderAdditionalList(panel);
  }

  function fieldSelect(id, label, options, value) {
    var html = '<div class="cds-field"><label for="' + id + '">' + label + '</label><select id="' + id + '">';
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      html += '<option value="' + opt + '"' + (opt === value ? ' selected' : '') + '>' + opt + '</option>';
    }
    html += '</select></div>';
    return html;
  }

  function fieldNumber(id, label, value, min, max, step) {
    return (
      '<div class="cds-field"><label for="' + id + '">' + label + '</label>' +
      '<input type="number" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '"></div>'
    );
  }

  function bindPrintAreaControls(panel, positions, colors) {
    var posSel = panel.querySelector('#cds-pos');
    var colorSel = panel.querySelector('#cds-color');
    var scaleInp = panel.querySelector('#cds-scale');
    var rotInp = panel.querySelector('#cds-rotate');
    var resetBtn = panel.querySelector('#cds-reset-defaults');
    var addOwn = panel.querySelector('#cds-add-own');
    var addPublic = panel.querySelector('#cds-add-public');

    function syncDraftFromInputs() {
      draft.print_area = draft.print_area || {};
      draft.print_area.primary = draft.print_area.primary || { x: 0.5, y: 0.5, scale: 1, rotate: 0 };
      if (posSel) draft.print_area.position = posSel.value;
      if (colorSel) draft.print_area.color_key = colorSel.value;
      if (scaleInp) draft.print_area.primary.scale = Number(scaleInp.value) || 1;
      if (rotInp) draft.print_area.primary.rotate = Number(rotInp.value) || 0;
      markDirtyUi();
      var img = panel.querySelector('#cds-primary-design');
      applyPrimaryTransform(img);
    }

    [posSel, colorSel, scaleInp, rotInp].forEach(function (el) {
      if (!el) return;
      el.addEventListener('change', function () {
        if (posSel || colorSel) renderPrintAreaPanel();
        else syncDraftFromInputs();
      });
      el.addEventListener('input', syncDraftFromInputs);
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        draft.print_area = {
          position: positions[0] || 'front',
          color_key: colors[0] || 'default',
          primary: { x: 0.5, y: 0.5, scale: 1, rotate: 0 },
          additional: draft.print_area.additional || [],
          public_additional: draft.print_area.public_additional || null,
        };
        renderPrintAreaPanel();
        markDirtyUi();
      });
    }

    if (addOwn) {
      addOwn.addEventListener('click', function () {
        var list = draft.print_area.additional || [];
        if (list.length >= MAX_OWN_ADDITIONAL) return;
        list.push({ design_id: null, label: t('designStudioOwnPlaceholder', 'Own design slot'), transform: { x: 0.5, y: 0.5, scale: 0.5, rotate: 0 } });
        draft.print_area.additional = list;
        renderAdditionalList(panel);
        markDirtyUi();
      });
    }

    if (addPublic) {
      addPublic.addEventListener('click', function () {
        if (draft.print_area.public_additional) return;
        draft.print_area.public_additional = {
          design_id: null,
          owner_id: null,
          label: t('designStudioPublicPlaceholder', 'Public design'),
          transform: { x: 0.5, y: 0.5, scale: 0.4, rotate: 0 },
        };
        renderAdditionalList(panel);
        markDirtyUi();
      });
    }
  }

  function renderAdditionalList(panel) {
    var wrap = panel.querySelector('#cds-additional-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    var own = draft.print_area.additional || [];
    for (var i = 0; i < own.length; i++) {
      var row = document.createElement('div');
      row.className = 'cds-channel-row';
      row.textContent = (own[i].label || 'Own') + ' #' + (i + 1);
      wrap.appendChild(row);
    }
    if (draft.print_area.public_additional) {
      var pub = document.createElement('div');
      pub.className = 'cds-channel-row';
      pub.textContent = draft.print_area.public_additional.label || t('designStudioPublicPlaceholder', 'Public design');
      wrap.appendChild(pub);
    }
  }

  function renderVariantsPanel() {
    var panel = root.querySelector('#cds-panel-variants');
    if (!panel || !ctxData) return;
    var groups = ctxData.variant_groups || {};
    var keys = Object.keys(groups).sort();
    var selected = new Set((draft.variants && draft.variants.selected_ids) || []);

    var html = '<h3 class="cds-section-title">' + t('designStudioTabVariants', 'Variants') + '</h3>' +
      '<p class="cds-muted">' + t('designStudioVariantsHint', 'Locked variants stay visible but cannot be selected.') + '</p>';

    if (!keys.length) {
      html += '<p class="cds-muted">' + t('designStudioNoVariants', 'No variants in admin pool.') + '</p>';
    }

    for (var g = 0; g < keys.length; g++) {
      var color = keys[g];
      var items = groups[color] || [];
      html += '<div class="cds-variant-group"><h4 class="cds-variant-group__title">' + color + '</h4>';
      for (var i = 0; i < items.length; i++) {
        var v = items[i];
        var id = Number(v.id);
        var locked = !v.unlocked || !v.in_admin_pool;
        var checked = selected.has(id);
        html +=
          '<label class="cds-variant-chip' + (locked ? ' is-locked' : '') + '">' +
          '<input type="checkbox" data-variant-id="' + id + '"' + (checked ? ' checked' : '') + (locked ? ' disabled' : '') + '> ' +
          v.size +
          (locked ? ' (' + t('designStudioLocked', 'Locked') + ')' : '') +
          '</label>';
      }
      html += '</div>';
    }

    panel.innerHTML = html;
    panel.querySelectorAll('input[data-variant-id]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var ids = [];
        panel.querySelectorAll('input[data-variant-id]:checked').forEach(function (cb) {
          ids.push(Number(cb.getAttribute('data-variant-id')));
        });
        draft.variants = draft.variants || {};
        draft.variants.selected_ids = ids;
        markDirtyUi();
      });
    });
  }

  function renderPublicationPanel() {
    var panel = root.querySelector('#cds-panel-publication');
    if (!panel || !ctxData) return;
    var pub = ctxData.publication || {};
    var markets = pub.markets || [];
    var channels = pub.channels || [];
    draft.publication = draft.publication || { markets: [], channels: { shopify: true } };
    var selMarkets = new Set(draft.publication.markets || []);
    if (!selMarkets.size && markets.length) markets.forEach(function (m) { selMarkets.add(m); });

    var html = '<h3 class="cds-section-title">' + t('designStudioTabPublication', 'Publication') + '</h3>' +
      '<p class="cds-muted">' + t('designStudioPublicationHint', 'Settings only — publish runs via queue.') + '</p>' +
      '<h4 class="cds-variant-group__title">' + t('designStudioMarkets', 'Markets') + '</h4>';

    for (var i = 0; i < markets.length; i++) {
      var m = markets[i];
      html += '<label class="cds-market-row"><input type="checkbox" data-market="' + m + '"' + (selMarkets.has(m) ? ' checked' : '') + '> ' + m + '</label>';
    }

    html += '<h4 class="cds-variant-group__title">' + t('designStudioChannels', 'Channels') + '</h4>';
    for (var c = 0; c < channels.length; c++) {
      var ch = channels[c];
      var on = ch.always_on || !!(draft.publication.channels && draft.publication.channels[ch.id]);
      html += '<label class="cds-channel-row' + (ch.locked ? ' is-locked' : '') + '">' +
        '<input type="checkbox" data-channel="' + ch.id + '"' + (on ? ' checked' : '') + (ch.always_on || ch.locked ? ' disabled' : '') + '> ' +
        ch.label + (ch.locked ? ' (' + t('designStudioLocked', 'Locked') + ')' : '') +
        '</label>';
    }

    panel.innerHTML = html;

    panel.querySelectorAll('[data-market]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var arr = [];
        panel.querySelectorAll('[data-market]:checked').forEach(function (x) { arr.push(x.getAttribute('data-market')); });
        draft.publication.markets = arr;
        markDirtyUi();
      });
    });

    panel.querySelectorAll('[data-channel]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        draft.publication.channels = draft.publication.channels || { shopify: true };
        draft.publication.channels[cb.getAttribute('data-channel')] = cb.checked;
        draft.publication.channels.shopify = true;
        markDirtyUi();
      });
    });
  }

  function renderMockupsPanel() {
    var panel = root.querySelector('#cds-panel-mockups');
    if (!panel || !ctxData) return;
    draft.mockups = draft.mockups || { custom_by_variant_id: {}, channel_preview: {} };
    var cfg = ctxData.studio_config || {};
    var mocks = cfg.mocks_by_color || {};
    var html = '<h3 class="cds-section-title">' + t('designStudioTabMockups', 'Mockups') + '</h3>' +
      '<p class="cds-muted">' + t('designStudioMockupsHint', 'Printify mocks + up to 2 custom uploads per variant.') + '</p>' +
      '<div class="cds-mock-grid" id="cds-mock-grid"></div>' +
      '<div class="cds-row"><button type="button" class="cds-btn-secondary" id="cds-add-custom-mock">' + t('designStudioAddCustomMock', 'Add custom mock') + '</button></div>';

    panel.innerHTML = html;
    var grid = panel.querySelector('#cds-mock-grid');
    var count = 0;
    Object.keys(mocks).forEach(function (ck) {
      (mocks[ck] || []).forEach(function (m) {
        if (!m.mock_url) return;
        count += 1;
        var card = document.createElement('div');
        card.className = 'cds-mock-card';
        card.innerHTML = '<img src="' + m.mock_url + '" alt=""><div class="cds-mock-card__label">' + (m.position || ck) + '</div>';
        grid.appendChild(card);
      });
    });
    if (!count) {
      grid.innerHTML = '<p class="cds-muted">' + t('designStudioNoMock', 'No mock available for this view.') + '</p>';
    }

    var addBtn = panel.querySelector('#cds-add-custom-mock');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        var vid = (draft.variants.selected_ids && draft.variants.selected_ids[0]) || 'default';
        var bucket = draft.mockups.custom_by_variant_id[vid] || [];
        if (bucket.length >= MAX_CUSTOM_MOCKS) return;
        bucket.push({ url: '', label: t('designStudioCustomMock', 'Custom mock') + ' ' + (bucket.length + 1) });
        draft.mockups.custom_by_variant_id[vid] = bucket;
        markDirtyUi();
        setStatus(t('designStudioCustomMockAdded', 'Custom mock slot added (upload in a later step).'));
      });
    }
  }

  function centsToUsd(cents) {
    return (Number(cents) / 100).toFixed(2);
  }

  function renderPricesPanel() {
    var panel = root.querySelector('#cds-panel-prices');
    if (!panel || !ctxData) return;
    draft.prices = draft.prices || { by_variant_id: {} };
    var variants = ctxData.variants || [];
    var royalty = ctxData.royalty || { percent: 0 };
    var html = '<h3 class="cds-section-title">' + t('designStudioTabPrices', 'Prices') + '</h3>' +
      '<p class="cds-muted">' + t('designStudioPricesHint', 'Prices below production cost are blocked. Royalty based on current tier.') + '</p>';

    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      if (!v.unlocked) continue;
      var vid = String(v.id);
      var stored = draft.prices.by_variant_id[vid];
      var price = stored != null ? stored : v.default_sell_cents;
      html += '<div class="cds-price-row" data-variant-price="' + vid + '">' +
        '<span>' + v.title + '</span>' +
        '<input type="number" min="' + Math.ceil((v.cost_cents || 0) / 100) + '" step="0.01" value="' + centsToUsd(price) + '" data-price-variant="' + vid + '" data-cost-cents="' + (v.cost_cents || 0) + '">' +
        '<span class="cds-muted">' + t('designStudioMinCost', 'Min') + ': $' + centsToUsd(v.cost_cents || 0) + '</span></div>';
    }

    var pct = Number(royalty.percent) || 0;
    html += '<div class="cds-royalty-box">' +
      t('designStudioRoyaltyPrimary', 'Primary royalty') + ': ' + pct + '% · ' +
      t('designStudioRoyaltyAdditional', 'Additional split') + ': 87.5% / 12.5%' +
      '</div>';

    panel.innerHTML = html;

    panel.querySelectorAll('[data-price-variant]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var vid = inp.getAttribute('data-price-variant');
        var cost = Number(inp.getAttribute('data-cost-cents')) || 0;
        var usd = Number(inp.value);
        var cents = Math.round(usd * 100);
        inp.classList.toggle('invalid', cents < cost);
        draft.prices.by_variant_id[vid] = cents;
        markDirtyUi();
      });
    });
  }

  function renderAllPanels() {
    renderPrintAreaPanel();
    renderVariantsPanel();
    renderPublicationPanel();
    renderMockupsPanel();
    renderPricesPanel();
  }

  function markDirtyUi() {
    if (btnSave) btnSave.disabled = isSaving || !isDirty();
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
      switchTab('print_area');
      renderAllPanels();
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
