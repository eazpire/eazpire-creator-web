/**
 * Creations grid — activate / deactivate saved designs (library_status) with confirmation modals.
 */
(function () {
  'use strict';

  var LS_LAST_CREATOR = 'eaz_creations_last_library_creator_name';

  var overlay = null;
  var modalEl = null;
  var panelEl = null;
  var titleEl = null;
  var contentEl = null;
  var subFooterEl = null;
  var btnCancel = null;
  var btnConfirm = null;
  var busyEl = null;
  var busyTextEl = null;
  var mode = '';
  var pendingDesign = null;
  var pendingDeactivateIds = [];
  var isModalBusy = false;
  var isContentLoading = false;
  var activateLoadToken = 0;
  var creatorNamesCache = null;

  /** Same semantics as creator-design-products-modal (eligible catalog vs excluded keys). */
  var activateProdCtx = null;

  /** Match creator-design-products-modal: Skill Tree unlock flag from get-catalog-products. */
  function isProductUnlocked(p) {
    if (!p) return false;
    if (typeof p.unlocked === 'boolean') return p.unlocked;
    // Fallback when API has no unlock flags: treat as unlocked.
    return true;
  }

  /** 'direct_sell' | 'personalized_sample' — chosen in the Activate modal (fixed per design). */
  var activateListingMode = 'direct_sell';

  /** Embedded Activate UI inside Design Preview Modal (no separate overlay). */
  var activateEmbedActive = false;
  var activateEmbedContentHost = null;
  var activateEmbedSubFooterHost = null;
  var activateEmbedSetLoading = null;
  var pendingActivateConfirmHandler = null;
  var pendingActivateSaveHandler = null;

  function Mi() {
    return window.CreatorMobileI18n || {};
  }

  function isShopStudioLockedDesign(design) {
    if (!design) return false;
    var meta = design.metadata || {};
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta || '{}') || {};
      } catch (_) {
        meta = {};
      }
    }
    if (design.shop_locked === true) return true;
    return meta.shop_locked === true || meta.shop_locked === 'yes' || meta.shop_locked === 1;
  }

  function formatUnlockConfirm(cost) {
    var M = Mi();
    var tpl =
      M.libraryUnlockShopConfirm ||
      'Unlock this Shop design for {{ cost }} EAZV? This uses one generation slot and one design slot.';
    return String(tpl).replace(/\{\{\s*cost\s*\}\}/g, String(cost != null ? cost : 15));
  }

  async function unlockShopStudioDesign(design) {
    var M = Mi();
    var owner = getOwnerId();
    if (!owner || !design || !design.id) return { ok: false, error: 'missing' };
    var cost = 15;
    try {
      var limUrl =
        apiBase() +
        '?op=check-shop-studio-generate-limit&owner_id=' +
        encodeURIComponent(owner) +
        '&logged_in_customer_id=' +
        encodeURIComponent(owner);
      var limRes = await fetch(limUrl, { credentials: 'include' });
      var limJson = await limRes.json().catch(function () {
        return {};
      });
      if (limJson && limJson.unlock_cost_eaz != null) cost = Number(limJson.unlock_cost_eaz) || 15;
    } catch (_) {}

    if (!window.confirm(formatUnlockConfirm(cost))) {
      return { ok: false, cancelled: true };
    }

    var url =
      apiBase() +
      '?op=unlock-shop-studio-design&logged_in_customer_id=' +
      encodeURIComponent(owner);
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ owner_id: owner, design_id: Number(design.id) }),
    });
    var json = await res.json().catch(function () {
      return { ok: false };
    });
    if (!json || !json.ok) {
      var msg =
        (json && (json.message || json.error)) || M.libraryUnlockShopFailed || 'Could not unlock design.';
      window.alert(String(msg));
      return { ok: false, error: json && json.error };
    }
    if (design.metadata && typeof design.metadata === 'object') {
      delete design.metadata.shop_locked;
      design.metadata.origin = design.metadata.origin || 'shop_studio';
    }
    design.shop_locked = false;
    design.library_status = 'active';
    design.visibility = 'private';
    if (window.CreationsScreen && typeof window.CreationsScreen.applyDesignLibraryPatch === 'function') {
      window.CreationsScreen.applyDesignLibraryPatch(design.id, {
        library_status: 'active',
        visibility: 'private',
        shop_locked: false,
        metadata: design.metadata,
      });
    } else {
      try {
        window.dispatchEvent(new CustomEvent('eaz-creations-refresh'));
      } catch (_) {}
    }
    window.alert(M.libraryUnlockShopSuccess || 'Design unlocked.');
    return { ok: true, cost_eaz: json.cost_eaz };
  }

  function getActivateListingMode() {
    return activateListingMode === 'personalized_sample' ? 'personalized_sample' : 'direct_sell';
  }

  function setActivateListingMode(mode) {
    activateListingMode = mode === 'personalized_sample' ? 'personalized_sample' : 'direct_sell';
    syncListingModeUi();
  }

  /** Refresh the mode switch + hint text (called after toggle). */
  function syncListingModeUi() {
    var M = Mi();
    var sample = getActivateListingMode() === 'personalized_sample';
    var track = document.querySelector('[data-creator-listing-mode-track]');
    if (track) {
      track.setAttribute('aria-checked', sample ? 'true' : 'false');
      track.classList.toggle('creator-library-action-modal__listing-track--sample', sample);
    }
    document.querySelectorAll('[data-creator-listing-mode-label]').forEach(function (el) {
      var key = el.getAttribute('data-creator-listing-mode-label');
      el.classList.toggle('is-active', (key === 'sample') === sample);
    });
    var hint = document.querySelector('[data-creator-listing-mode-hint]');
    if (hint) {
      hint.textContent = sample
        ? M.listingModeHintSample || 'Only mockups are shown. Customers personalize before they buy.'
        : M.listingModeHintDirect || 'Products are listed in the shop and can be bought directly.';
    }
  }

  function apiBase() {
    return window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  function getOwnerId() {
    if (
      typeof window.__EAZ_OWNER_ID !== 'undefined' &&
      window.__EAZ_OWNER_ID != null &&
      String(window.__EAZ_OWNER_ID).trim()
    ) {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    return null;
  }

  function getShop() {
    return window.Shopify && window.Shopify.shop ? window.Shopify.shop : window.__SHOPIFY_SHOP_DOMAIN || null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function replacePlaceholders(str, map) {
    var out = String(str || '');
    if (!map) return out;
    Object.keys(map).forEach(function (k) {
      out = out.split('%' + k + '%').join(String(map[k] != null ? map[k] : ''));
    });
    return out;
  }

  function catalogRegion() {
    if (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveCatalogRegion === 'function') {
      return window.CreatorHeroRegions.resolveCatalogRegion();
    }
    return 'EU';
  }

  function parseExcludedFromMeta(meta) {
    try {
      var m =
        meta && typeof meta === 'string'
          ? JSON.parse(meta || '{}')
          : meta && typeof meta === 'object'
            ? meta
            : {};
      var raw = m.publish_excluded_product_keys;
      if (!Array.isArray(raw)) return [];
      return raw
        .map(function (k) {
          return String(k || '').trim();
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function sortUnique(arr) {
    return Array.from(new Set(arr || []))
      .filter(Boolean)
      .sort();
  }

  /** eligibleKeys + checked map + preserved off-catalog exclusions from snapshot */
  function computeExcludedKeys(eligibleKeys, checkedMap, metaExcludedSnapshot) {
    var prev = metaExcludedSnapshot || [];
    var eligible = new Set(eligibleKeys || []);
    var out = [];
    var i;
    for (i = 0; i < prev.length; i++) {
      var pk = String(prev[i] || '').trim();
      if (!pk) continue;
      if (!eligible.has(pk)) out.push(pk);
    }
    for (var j = 0; j < (eligibleKeys || []).length; j++) {
      var key = eligibleKeys[j];
      if (!checkedMap[key]) out.push(key);
    }
    return sortUnique(out);
  }

  function resetActivateProductCtx() {
    activateProdCtx = null;
  }

  function getActivateExcludedKeysFromCtx() {
    if (!activateProdCtx) return null;
    return computeExcludedKeys(
      activateProdCtx.eligibleKeys,
      activateProdCtx.checked,
      activateProdCtx.metaExcludedSnapshot
    );
  }

  function syncActivateGridCheckboxes() {
    if (!activateProdCtx || !activateProdCtx.gridEl) return;
    var boxes = activateProdCtx.gridEl.querySelectorAll('input[type="checkbox"][data-product-key]');
    for (var i = 0; i < boxes.length; i++) {
      var inp = boxes[i];
      var pk = inp.getAttribute('data-product-key');
      inp.checked = !!activateProdCtx.checked[pk];
    }
    refreshAllActivateCardBadges();
  }

  /** Design artwork URL for composited product cards (same rules as design products modal). */
  function activateDesignPreviewUrl(design) {
    var d = design || pendingDesign;
    if (!d) return '';
    var result = d.result;
    if (result && typeof result === 'object') {
      var fromResult =
        result.preview_url || result.image_url || result.original_url || result.url || '';
      if (fromResult) return String(fromResult).trim();
    }
    if (typeof result === 'string' && result.indexOf('http') === 0) {
      return String(result).trim();
    }
    return String(
      d.preview_url || d.image_url || d.original_url || d.url || d.thumbnail_url || ''
    ).trim();
  }

  function mountActivateCardMedia(media, pk, product) {
    var cardMedia = window.CreatorDesignProductsCardMedia;
    var previewConfig = product && product.studio_card_preview ? product.studio_card_preview : null;
    var designUrl = activateDesignPreviewUrl();
    if (cardMedia && typeof cardMedia.mount === 'function') {
      var urls = cardMedia.normalizeMockUrls(product);
      try {
        cardMedia.mount(media, pk, urls, previewConfig, designUrl);
      } catch (err) {
        console.warn('[creator-creations-library-actions] card media mount failed', pk, err);
        try {
          cardMedia.mount(media, pk, urls, null, '');
        } catch (_) {}
      }
      return;
    }
    var imgUrl = product.preview_image_url || null;
    if (imgUrl) {
      var img0 = document.createElement('img');
      img0.src = imgUrl;
      img0.alt = '';
      img0.loading = 'lazy';
      media.appendChild(img0);
    } else {
      var ph = document.createElement('div');
      ph.className = 'creator-design-products-modal__card-ph';
      ph.textContent = '—';
      media.appendChild(ph);
    }
  }

  function refreshActivateCardBadges(card, pk) {
    if (!card || !pk || !activateProdCtx) return;
    var old = card.querySelector('.creator-design-products-modal__card-badges');
    if (old) old.remove();
    var pubRow = activateProdCtx.pubRowByKey && activateProdCtx.pubRowByKey[pk];
    var isChecked = !!activateProdCtx.checked[pk];
    var Mgrid = Mi();
    var badges = document.createElement('div');
    badges.className = 'creator-design-products-modal__card-badges';
    if (pubRow) {
      var on = document.createElement('span');
      on.className = 'creator-design-products-modal__card-badge creator-design-products-modal__card-badge--online';
      on.textContent = Mgrid.designProductsBadgeOnline || 'Online';
      badges.appendChild(on);
    } else if (isChecked) {
      var qu = document.createElement('span');
      qu.className = 'creator-design-products-modal__card-badge creator-design-products-modal__card-badge--queue';
      qu.textContent = Mgrid.designProductsBadgeQueue || 'Queue';
      badges.appendChild(qu);
    }
    if (badges.childNodes.length) card.appendChild(badges);
  }

  function refreshAllActivateCardBadges() {
    if (!activateProdCtx || !activateProdCtx.gridEl) return;
    var cards = activateProdCtx.gridEl.querySelectorAll('.creator-design-products-modal__card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var inp = card.querySelector('input[data-product-key]');
      if (!inp) continue;
      refreshActivateCardBadges(card, inp.getAttribute('data-product-key'));
    }
  }

  function renderActivateProductGrid(products) {
    if (!activateProdCtx || !activateProdCtx.gridEl) return;
    var cardMediaApi = window.CreatorDesignProductsCardMedia;
    if (cardMediaApi && typeof cardMediaApi.clearRotations === 'function') {
      cardMediaApi.clearRotations();
    }
    if (cardMediaApi && typeof cardMediaApi.resetPaused === 'function') {
      cardMediaApi.resetPaused();
    }
    var gridEl = activateProdCtx.gridEl;
    gridEl.innerHTML = '';
    var Mgrid = Mi();
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var pk = String(p.product_key || '').trim();
      if (!pk) continue;
      var card = document.createElement('label');
      card.className = 'creator-design-products-modal__card';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-product-key', pk);
      cb.checked = !!activateProdCtx.checked[pk];
      cb.addEventListener('change', function (ev) {
        var key = ev.target.getAttribute('data-product-key');
        activateProdCtx.checked[key] = !!ev.target.checked;
        var lbl = ev.target.closest ? ev.target.closest('.creator-design-products-modal__card') : null;
        if (lbl) refreshActivateCardBadges(lbl, key);
      });
      var media = document.createElement('div');
      media.className = 'creator-design-products-modal__card-media';
      mountActivateCardMedia(media, pk, p);
      var ttl = document.createElement('div');
      ttl.className = 'creator-design-products-modal__card-title';
      ttl.textContent = p.title || pk;
      card.appendChild(cb);
      card.appendChild(media);
      card.appendChild(ttl);
      refreshActivateCardBadges(card, pk);
      gridEl.appendChild(card);
    }
  }

  async function fetchActivateCatalogBundle(design) {
    var owner = getOwnerId();
    var shop = getShop();
    var empty = function () {
      return {
        products: [],
        unlockedProducts: [],
        eligibleKeys: [],
        checked: {},
        metaExcludedSnapshot: [],
        initialExcluded: [],
        publishedRows: [],
        pubKeySet: new Set(),
        pubRowByKey: {},
        loadError: false,
      };
    };
    if (!owner || !design || !design.id) return empty();

    var designId = String(design.id).trim();
    var region = catalogRegion();
    var base = apiBase();
    var catUrl =
      base +
      '?op=get-catalog-products&region=' +
      encodeURIComponent(region) +
      '&design_id=' +
      encodeURIComponent(designId) +
      '&owner_id=' +
      encodeURIComponent(owner);
    if (shop) catUrl += '&shop=' + encodeURIComponent(shop);
    var pubUrl =
      base +
      '?op=get-design-published-rows&design_id=' +
      encodeURIComponent(designId) +
      '&owner_id=' +
      encodeURIComponent(owner);
    if (shop) pubUrl += '&shop=' + encodeURIComponent(shop);

    try {
      var res = await Promise.all([
        fetch(catUrl, { credentials: 'include' }),
        fetch(pubUrl, { credentials: 'include' }),
      ]);
      var catData = await res[0].json().catch(function () {
        return {};
      });
      var pubData = await res[1].json().catch(function () {
        return {};
      });

      var products = (catData.ok && Array.isArray(catData.products) ? catData.products : []).slice();
      // Same as Edit Mode → Products: eligible / selectable = Skill Tree unlocked only.
      var unlockedProducts = products.filter(function (x) {
        return isProductUnlocked(x);
      });
      var eligibleKeys = unlockedProducts
        .map(function (x) {
          return String(x.product_key || '').trim();
        })
        .filter(Boolean);

      var metaExcluded = parseExcludedFromMeta(design.metadata);
      var metaSnap = metaExcluded.slice();

      var checked = {};
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var pk = String(p.product_key || '').trim();
        if (!pk) continue;
        if (!isProductUnlocked(p)) {
          checked[pk] = false;
          continue;
        }
        checked[pk] = metaExcluded.indexOf(pk) === -1;
      }

      var initialExcluded = computeExcludedKeys(eligibleKeys, checked, metaSnap);

      var publishedRows = pubData.ok && Array.isArray(pubData.rows) ? pubData.rows : [];
      var pubKeySet = new Set();
      var pubRowByKey = {};
      for (var j = 0; j < publishedRows.length; j++) {
        var row = publishedRows[j];
        if (row && row.product_key) {
          var pkRow = String(row.product_key).trim();
          if (!pkRow) continue;
          pubKeySet.add(pkRow);
          if (!pubRowByKey[pkRow]) pubRowByKey[pkRow] = row;
        }
      }

      return {
        products: products,
        unlockedProducts: unlockedProducts,
        eligibleKeys: eligibleKeys,
        checked: checked,
        metaExcludedSnapshot: metaSnap,
        initialExcluded: initialExcluded,
        publishedRows: publishedRows,
        pubKeySet: pubKeySet,
        pubRowByKey: pubRowByKey,
        loadError: false,
      };
    } catch (e) {
      console.warn('[creator-creations-library-actions] catalog', e);
      var em = empty();
      em.loadError = true;
      return em;
    }
  }

  function appendListingModeInfoSection(parent, headingText, bodyText) {
    var section = document.createElement('section');
    section.className = 'creator-library-action-modal__info-section';

    var heading = document.createElement('h4');
    heading.className = 'creator-library-action-modal__info-heading';
    heading.textContent = headingText;
    section.appendChild(heading);

    var body = document.createElement('p');
    body.className = 'creator-library-action-modal__info-body';
    body.textContent = bodyText;
    section.appendChild(body);

    parent.appendChild(section);
  }

  /** Open the detail overlay explaining Direct Sell vs Personalized Sample. */
  function openListingModeInfoModal() {
    var M = Mi();
    var overlayEl = document.createElement('div');
    overlayEl.className = 'creator-library-action-modal__info-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-labelledby', 'creator-listing-mode-info-title');

    var panel = document.createElement('div');
    panel.className = 'creator-library-action-modal__info-panel';

    var h = document.createElement('h3');
    h.id = 'creator-listing-mode-info-title';
    h.className = 'creator-library-action-modal__info-title';
    h.textContent = M.listingModeInfoTitle || 'Direct Sell vs. Personalized Sample';
    panel.appendChild(h);

    appendListingModeInfoSection(
      panel,
      M.listingModeInfoDirectHeading || M.listingModeDirectSell || 'Direct Sell',
      M.listingModeInfoDirectBody ||
        'Your design is published through Printify and listed as a normal shop product. Customers see the finished mockup and can buy it immediately. Selected products enter the publish queue and go live on Shopify after processing.'
    );

    appendListingModeInfoSection(
      panel,
      M.listingModeInfoSampleHeading || M.listingModePersonalizedSample || 'Personalized Sample',
      M.listingModeInfoSampleBody ||
        'Your design is activated as a sample only — not as a direct shop listing. Mockups appear in the Personalizable Samples carousel and sample pages. Customers choose a sample, personalize it with your design, then order the finished product. This still counts toward activation limits and creator rewards.'
    );

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'creator-library-action-modal__info-close';
    close.textContent = M.listingModeInfoClose || 'Got it';
    close.addEventListener('click', function () {
      overlayEl.remove();
    });
    panel.appendChild(close);

    overlayEl.appendChild(panel);
    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) overlayEl.remove();
    });
    document.body.appendChild(overlayEl);
  }

  /**
   * Sub-header with the Direct Sell / Personalized Sample switch, short hint and info button.
   * Rendered above the product grid in the Activate modal. Resets to Direct Sell each open.
   */
  function openSimpleInfoModal(titleText, bodyText) {
    var M = Mi();
    var overlayEl = document.createElement('div');
    overlayEl.className = 'creator-library-action-modal__info-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');

    var panel = document.createElement('div');
    panel.className = 'creator-library-action-modal__info-panel';

    var h = document.createElement('h3');
    h.className = 'creator-library-action-modal__info-title';
    h.textContent = titleText || '';
    panel.appendChild(h);

    var body = document.createElement('p');
    body.className = 'creator-library-action-modal__info-body';
    body.style.margin = '0 0 14px';
    body.textContent = bodyText || '';
    panel.appendChild(body);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'creator-library-action-modal__info-close';
    close.textContent = M.listingModeInfoClose || 'Got it';
    close.addEventListener('click', function () {
      overlayEl.remove();
    });
    panel.appendChild(close);

    overlayEl.appendChild(panel);
    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) overlayEl.remove();
    });
    document.body.appendChild(overlayEl);
  }

  /**
   * Visibility box — dual labels Private | switch | Public (same pattern as listing mode).
   */
  function appendVisibilitySettingsBox(parentEl, visSwitch) {
    var M = Mi();
    if (!parentEl || !visSwitch) return;

    var wrap = document.createElement('div');
    wrap.className =
      'creator-library-action-modal__listing-mode creator-library-action-modal__settings-box';

    var row = document.createElement('div');
    row.className = 'creator-library-action-modal__listing-row';

    var labelPrivate = document.createElement('span');
    labelPrivate.className = 'creator-library-action-modal__listing-label';
    labelPrivate.setAttribute('data-creator-vis-label', 'private');
    labelPrivate.textContent = M.libraryVisibilityPrivate || 'Private';

    var labelPublic = document.createElement('span');
    labelPublic.className = 'creator-library-action-modal__listing-label';
    labelPublic.setAttribute('data-creator-vis-label', 'public');
    labelPublic.textContent = M.libraryVisibilityPublic || 'Public';

    var track = visSwitch.querySelector('.creator-library-action-modal__vis-switch-track');
    var cap = visSwitch.querySelector('.creator-library-action-modal__vis-switch-caption');
    if (cap) cap.setAttribute('hidden', '');

    var info = document.createElement('button');
    info.type = 'button';
    info.className = 'creator-library-action-modal__listing-info';
    info.setAttribute('aria-label', M.libraryVisibilityInfoAria || 'Learn more about visibility');
    info.textContent = 'i';
    info.addEventListener('click', function () {
      openSimpleInfoModal(
        M.libraryVisibilityInfoTitle || 'Public vs Private',
        M.libraryVisibilityInfoBody ||
          'Public designs can appear in the creator library and samples. Private keeps the design for you until you choose to make it public.'
      );
    });

    row.appendChild(labelPrivate);
    if (track) row.appendChild(track);
    row.appendChild(labelPublic);
    row.appendChild(info);
    wrap.appendChild(row);

    var hint = document.createElement('p');
    hint.className = 'creator-library-action-modal__listing-hint';
    hint.textContent =
      M.libraryVisibilityHint ||
      'Public designs can be discovered; private designs stay only in your account.';
    wrap.appendChild(hint);

    visSwitch._visLabels = { private: labelPrivate, public: labelPublic };
    if (typeof visSwitch.syncUi === 'function') visSwitch.syncUi();

    parentEl.appendChild(wrap);
  }

  /** Keep CDP activate host class so panel padding is not lost when content mounts. */
  function setLibraryContentClassName(el, extraClass) {
    if (!el) return;
    var parts = ['creator-library-action-modal__content'];
    if (extraClass) parts.push(extraClass);
    var keepCdp =
      activateEmbedActive ||
      (el.id && String(el.id).indexOf('cdp-activate-content') === 0) ||
      (el.classList && el.classList.contains('cdp-modal__activate-content'));
    if (keepCdp) parts.unshift('cdp-modal__activate-content');
    el.className = parts.join(' ');
  }

  /**
   * Creator name box — same container style as listing mode.
   */
  function appendCreatorSettingsBox(parentEl, opts) {
    var M = Mi();
    opts = opts || {};
    if (!parentEl) return;

    var wrap = document.createElement('div');
    wrap.className =
      'creator-library-action-modal__listing-mode creator-library-action-modal__settings-box';

    var row = document.createElement('div');
    row.className = 'creator-library-action-modal__listing-row creator-library-action-modal__settings-row';

    var title = document.createElement('span');
    title.className = 'creator-library-action-modal__listing-label is-active';
    title.textContent = M.libraryActivateCreatorLabel || 'Creator name';

    var info = document.createElement('button');
    info.type = 'button';
    info.className = 'creator-library-action-modal__listing-info';
    info.setAttribute('aria-label', M.libraryCreatorInfoAria || 'Learn more about creator name');
    info.textContent = 'i';
    info.addEventListener('click', function () {
      openSimpleInfoModal(
        M.libraryCreatorInfoTitle || 'Creator name',
        M.libraryCreatorInfoBody ||
          'This name is shown on published products and samples. Choose the creator identity that should receive credit and royalties for this design.'
      );
    });

    row.appendChild(title);
    row.appendChild(info);
    wrap.appendChild(row);

    var controlWrap = document.createElement('div');
    controlWrap.className = 'creator-library-action-modal__settings-control';
    if (opts.control) {
      controlWrap.appendChild(opts.control);
    } else if (opts.emptyText) {
      var empty = document.createElement('p');
      empty.className = 'creator-library-action-modal__listing-hint';
      empty.style.margin = '0';
      empty.textContent = opts.emptyText;
      controlWrap.appendChild(empty);
    }
    wrap.appendChild(controlWrap);

    var hint = document.createElement('p');
    hint.className = 'creator-library-action-modal__listing-hint';
    hint.textContent =
      M.libraryCreatorHint ||
      'Used on product listings and sample pages for this design.';
    wrap.appendChild(hint);

    parentEl.appendChild(wrap);
  }

  function appendListingModeSwitch(parentEl) {
    var M = Mi();
    activateListingMode = 'direct_sell';

    var wrap = document.createElement('div');
    wrap.className = 'creator-library-action-modal__listing-mode';

    var row = document.createElement('div');
    row.className = 'creator-library-action-modal__listing-row';

    var labelDirect = document.createElement('span');
    labelDirect.className = 'creator-library-action-modal__listing-label is-active';
    labelDirect.setAttribute('data-creator-listing-mode-label', 'direct');
    labelDirect.textContent = M.listingModeDirectSell || 'Direct Sell';

    var track = document.createElement('button');
    track.type = 'button';
    track.className = 'creator-library-action-modal__listing-track';
    track.setAttribute('role', 'switch');
    track.setAttribute('aria-checked', 'false');
    track.setAttribute('data-creator-listing-mode-track', '1');
    var knob = document.createElement('span');
    knob.className = 'creator-library-action-modal__listing-knob';
    knob.setAttribute('aria-hidden', 'true');
    track.appendChild(knob);
    track.addEventListener('click', function () {
      setActivateListingMode(getActivateListingMode() === 'personalized_sample' ? 'direct_sell' : 'personalized_sample');
    });

    var labelSample = document.createElement('span');
    labelSample.className = 'creator-library-action-modal__listing-label';
    labelSample.setAttribute('data-creator-listing-mode-label', 'sample');
    labelSample.textContent = M.listingModePersonalizedSample || 'Personalized Sample';

    var info = document.createElement('button');
    info.type = 'button';
    info.className = 'creator-library-action-modal__listing-info';
    info.setAttribute('aria-label', M.listingModeInfoAria || 'Learn more about listing modes');
    info.textContent = 'i';
    info.addEventListener('click', openListingModeInfoModal);

    row.appendChild(labelDirect);
    row.appendChild(track);
    row.appendChild(labelSample);
    row.appendChild(info);
    wrap.appendChild(row);

    var hint = document.createElement('p');
    hint.className = 'creator-library-action-modal__listing-hint';
    hint.setAttribute('data-creator-listing-mode-hint', '1');
    hint.textContent = M.listingModeHintDirect || 'Products are listed in the shop and can be bought directly.';
    wrap.appendChild(hint);

    var notice = document.createElement('p');
    notice.className = 'creator-library-action-modal__listing-notice';
    notice.textContent = M.listingModeFixedNotice || 'This choice applies to this design until you deactivate it.';
    wrap.appendChild(notice);

    parentEl.appendChild(wrap);
    syncListingModeUi();
  }

  /**
   * Appends product checkbox grid (same UX as product badge modal). Product scope
   * applies to both listing modes; the mode is chosen in the sub-header above.
   */
  function appendActivateCatalogBlock(parentEl, design, bundle) {
    var M = Mi();
    activateProdCtx = {
      eligibleKeys: bundle.eligibleKeys,
      checked: Object.assign({}, bundle.checked),
      metaExcludedSnapshot: bundle.metaExcludedSnapshot.slice(),
      initialExcluded: bundle.initialExcluded.slice(),
      publishedRows: bundle.publishedRows,
      pubRowByKey: bundle.pubRowByKey || {},
      gridEl: null,
    };

    var wrap = document.createElement('div');
    wrap.className = 'creator-library-action-modal__catalog-block';

    if (bundle.loadError) {
      activateProdCtx = null;
      var err = document.createElement('p');
      err.className = 'creator-library-action-modal__catalog-status';
      err.textContent = M.designProductsLoadError || 'Could not load products.';
      wrap.appendChild(err);
      parentEl.appendChild(wrap);
      return;
    }

    var unlockedProducts = Array.isArray(bundle.unlockedProducts)
      ? bundle.unlockedProducts
      : (bundle.products || []).filter(function (x) {
          return isProductUnlocked(x);
        });

    var statusEl = document.createElement('div');
    statusEl.className = 'creator-design-products-modal__status';
    if (!bundle.products.length) {
      statusEl.textContent = M.designProductsEmpty || 'No products available for your region.';
    } else if (!unlockedProducts.length) {
      statusEl.textContent = M.designProductsEmptyUnlocked || 'No unlocked products.';
    }

    var gridEl = document.createElement('div');
    gridEl.className = 'creator-design-products-modal__grid';
    gridEl.setAttribute('aria-label', M.designProductsGridAria || '');
    activateProdCtx.gridEl = gridEl;

    if (statusEl.textContent) wrap.appendChild(statusEl);
    wrap.appendChild(gridEl);

    parentEl.appendChild(wrap);

    // Quick Publish has no Locked tab — only show selectable (unlocked) products.
    renderActivateProductGrid(unlockedProducts);
  }

  function normalizeNames(names) {
    var seen = {};
    var out = [];
    var raw = Array.isArray(names) ? names : [];
    for (var i = 0; i < raw.length; i++) {
      var n = String(raw[i] || '').trim();
      if (!n) continue;
      var key = n.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(n);
    }
    out.sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    return out;
  }

  async function fetchCreatorNames() {
    var owner = getOwnerId();
    if (!owner) return [];
    var shop = getShop();
    var url = apiBase() + '?op=get-settings&logged_in_customer_id=' + encodeURIComponent(owner);
    if (shop) url += '&shop=' + encodeURIComponent(shop);
    try {
      var res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      var data = await res.json().catch(function () {
        return {};
      });
      var settings = data.settings || {};
      var names = Array.isArray(settings.creator_names) ? settings.creator_names.slice() : [];
      if (settings.creator_name && names.indexOf(settings.creator_name) === -1) {
        names.unshift(settings.creator_name);
      }
      return normalizeNames(names);
    } catch (e) {
      console.warn('[creator-creations-library-actions] get-settings', e);
      return [];
    }
  }

  async function fetchCreatorNamesCached() {
    if (creatorNamesCache) return creatorNamesCache.slice();
    var names = await fetchCreatorNames();
    creatorNamesCache = names;
    return names.slice();
  }

  /** Invalidate after settings change elsewhere if needed */
  function invalidateCreatorNamesCache() {
    creatorNamesCache = null;
  }

  function readLastCreatorPick(validNames) {
    try {
      var raw = localStorage.getItem(LS_LAST_CREATOR);
      var s = raw ? String(raw).trim() : '';
      if (!s) return null;
      for (var i = 0; i < validNames.length; i++) {
        if (validNames[i] === s) return s;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  function writeLastCreatorPick(name) {
    try {
      if (name && String(name).trim()) localStorage.setItem(LS_LAST_CREATOR, String(name).trim());
    } catch (_) {}
  }

  function ensureShell() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'creator-library-action-modal-overlay';
    overlay.setAttribute('hidden', '');
    overlay.innerHTML =
      '<div class="creator-library-action-modal" role="dialog" aria-modal="true">' +
      '<div class="creator-library-action-modal__panel">' +
      '<h2 class="creator-library-action-modal__title"></h2>' +
      '<div class="creator-library-action-modal__content"></div>' +
      '<div class="creator-library-action-modal__subfooter" hidden></div>' +
      '<div class="creator-library-action-modal__footer">' +
      '<button type="button" class="creator-library-action-modal__btn creator-library-action-modal__btn--secondary creator-library-action-modal__cancel"></button>' +
      '<button type="button" class="creator-library-action-modal__btn creator-library-action-modal__btn--primary creator-library-action-modal__confirm"></button>' +
      '</div>' +
      '<div class="creator-library-action-modal__busy" hidden aria-hidden="true">' +
      '<div class="creator-library-action-modal__busy-inner">' +
      '<span class="creator-library-action-modal__busy-spinner" aria-hidden="true"></span>' +
      '<p class="creator-library-action-modal__busy-text"></p>' +
      '</div></div>' +
      '</div></div>';

    document.body.appendChild(overlay);
    modalEl = overlay.querySelector('.creator-library-action-modal');
    panelEl = overlay.querySelector('.creator-library-action-modal__panel');
    titleEl = overlay.querySelector('.creator-library-action-modal__title');
    contentEl = overlay.querySelector('.creator-library-action-modal__content');
    subFooterEl = overlay.querySelector('.creator-library-action-modal__subfooter');
    btnCancel = overlay.querySelector('.creator-library-action-modal__cancel');
    btnConfirm = overlay.querySelector('.creator-library-action-modal__confirm');
    busyEl = overlay.querySelector('.creator-library-action-modal__busy');
    busyTextEl = overlay.querySelector('.creator-library-action-modal__busy-text');

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay && !isModalBusy) closeModal();
    });
    btnCancel.addEventListener('click', function () {
      if (!isModalBusy) closeModal();
    });
    document.addEventListener('keydown', function (ev) {
      if (!overlay || overlay.hasAttribute('hidden')) return;
      if (ev.key === 'Escape' && !isModalBusy) closeModal();
    });
  }

  function syncModalActionButtons() {
    if (!btnConfirm || !btnCancel) return;
    btnConfirm.disabled = isModalBusy || isContentLoading;
    btnCancel.disabled = isModalBusy;
  }

  function setContentLoading(loading) {
    isContentLoading = !!loading;
    if (panelEl) {
      panelEl.classList.toggle('creator-library-action-modal__panel--content-loading', isContentLoading);
    }
    syncModalActionButtons();
  }

  function setModalBusy(busy, message) {
    isModalBusy = !!busy;
    if (busyEl) {
      if (isModalBusy) {
        busyEl.removeAttribute('hidden');
        busyEl.setAttribute('aria-hidden', 'false');
      } else {
        busyEl.setAttribute('hidden', '');
        busyEl.setAttribute('aria-hidden', 'true');
      }
    }
    if (busyTextEl) {
      busyTextEl.textContent = isModalBusy ? String(message || '') : '';
    }
    if (overlay) {
      overlay.classList.toggle('creator-library-action-modal-overlay--busy', isModalBusy);
    }
    if (panelEl) {
      panelEl.classList.toggle('creator-library-action-modal__panel--busy', isModalBusy);
    }
    syncModalActionButtons();
  }

  function setActivateBusy(busy, message) {
    isModalBusy = !!busy;
    if (activateEmbedActive && typeof activateEmbedSetLoading === 'function') {
      try {
        activateEmbedSetLoading(!!busy, message);
      } catch (_) {}
      return;
    }
    setModalBusy(busy, message);
  }

  function bindActivateConfirmHandler(fn) {
    pendingActivateConfirmHandler = typeof fn === 'function' ? fn : null;
    if (btnConfirm && !activateEmbedActive) {
      btnConfirm.onclick = pendingActivateConfirmHandler;
    }
  }

  function bindActivateSaveHandler(fn) {
    pendingActivateSaveHandler = typeof fn === 'function' ? fn : null;
  }

  function clearActivateEmbedHosts() {
    if (activateEmbedContentHost) {
      try {
        activateEmbedContentHost.innerHTML = '';
        activateEmbedContentHost.className = 'creator-library-action-modal__content';
      } catch (_) {}
    }
    if (activateEmbedSubFooterHost) {
      try {
        activateEmbedSubFooterHost.innerHTML = '';
        activateEmbedSubFooterHost.setAttribute('hidden', '');
      } catch (_) {}
    }
    activateEmbedContentHost = null;
    activateEmbedSubFooterHost = null;
    activateEmbedSetLoading = null;
    activateEmbedActive = false;
    pendingActivateConfirmHandler = null;
    pendingActivateSaveHandler = null;
    refreshShellElementRefs();
  }

  function refreshShellElementRefs() {
    if (!overlay) return;
    modalEl = overlay.querySelector('.creator-library-action-modal');
    panelEl = overlay.querySelector('.creator-library-action-modal__panel');
    titleEl = overlay.querySelector('.creator-library-action-modal__title');
    contentEl = overlay.querySelector('.creator-library-action-modal__content');
    subFooterEl = overlay.querySelector('.creator-library-action-modal__subfooter');
    btnCancel = overlay.querySelector('.creator-library-action-modal__cancel');
    btnConfirm = overlay.querySelector('.creator-library-action-modal__confirm');
    busyEl = overlay.querySelector('.creator-library-action-modal__busy');
    busyTextEl = overlay.querySelector('.creator-library-action-modal__busy-text');
  }

  function closeDesignPreviewIfOpen() {
    try {
      var api = window.CreatorDesignPreviewModal;
      if (api && typeof api.close === 'function') {
        api.close(true);
      }
    } catch (_) {}
  }

  function renderActivateSkeleton() {
    var M = Mi();
    contentEl.innerHTML = '';
    setLibraryContentClassName(contentEl, 'creator-library-action-modal__content--skeleton');

    var intro = document.createElement('div');
    intro.className =
      'creator-library-action-modal__intro creator-library-action-modal__skeleton-block';
    intro.innerHTML =
      '<div class="creator-library-action-modal__sk-line creator-library-action-modal__sk-line--w90"></div>' +
      '<div class="creator-library-action-modal__sk-line creator-library-action-modal__sk-line--w72"></div>';
    contentEl.appendChild(intro);

    var wrap = document.createElement('div');
    wrap.className =
      'creator-library-action-modal__catalog-block creator-library-action-modal__skeleton-block';

    var grid = document.createElement('div');
    grid.className =
      'creator-design-products-modal__grid creator-library-action-modal__skeleton-grid';
    grid.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 4; i++) {
      var card = document.createElement('div');
      card.className = 'creator-library-action-modal__sk-card';
      card.innerHTML =
        '<div class="creator-library-action-modal__sk-card-media"></div>' +
        '<div class="creator-library-action-modal__sk-line creator-library-action-modal__sk-line--title"></div>';
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    contentEl.appendChild(wrap);

    mountActivateSkeletonSubfooter(M);
  }

  function mountActivateSkeletonSubfooter(M) {
    if (!subFooterEl) return;
    subFooterEl.innerHTML = '';

    var grid = document.createElement('div');
    grid.className = 'creator-library-action-modal__subfooter-grid';

    var labelLeft = document.createElement('div');
    labelLeft.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--label-left';
    labelLeft.innerHTML =
      '<div class="creator-library-action-modal__sk-line creator-library-action-modal__sk-line--label"></div>';

    var labelRight = document.createElement('div');
    labelRight.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--label-right';
    var cap = document.createElement('div');
    cap.className = 'creator-library-action-modal__vis-switch-caption creator-library-action-modal__sk-caption';
    cap.textContent = M.libraryVisibilityPublic || 'Public';
    labelRight.appendChild(cap);

    var ctrlLeft = document.createElement('div');
    ctrlLeft.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--control-left';
    ctrlLeft.innerHTML = '<div class="creator-library-action-modal__sk-select"></div>';

    var ctrlRight = document.createElement('div');
    ctrlRight.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--control-right';
    ctrlRight.innerHTML = '<div class="creator-library-action-modal__sk-toggle"></div>';

    grid.appendChild(labelLeft);
    grid.appendChild(labelRight);
    grid.appendChild(ctrlLeft);
    grid.appendChild(ctrlRight);
    subFooterEl.appendChild(grid);
    subFooterEl.removeAttribute('hidden');
  }

  function openActivateShell() {
    ensureShell();
    refreshShellElementRefs();
    var M = Mi();
    if (modalEl) {
      modalEl.classList.add('creator-library-action-modal--activate');
      modalEl.classList.remove('creator-library-action-modal--deactivate');
    }
    titleEl.textContent = M.libraryActivateTitle || 'Activate design';
    btnCancel.textContent = M.libraryCancel || window.CreatorI18n?.cancel || 'Cancel';
    btnConfirm.textContent = M.libraryConfirmActivate || 'Activate';
    if (subFooterEl) {
      subFooterEl.innerHTML = '';
      subFooterEl.setAttribute('hidden', '');
    }
    setModalBusy(false);
    setContentLoading(false);
    overlay.removeAttribute('hidden');
    document.documentElement.classList.add('creator-library-action-modal-open');
  }

  function openDeactivateShell() {
    ensureShell();
    refreshShellElementRefs();
    var M = Mi();
    if (modalEl) {
      modalEl.classList.add('creator-library-action-modal--deactivate');
      modalEl.classList.remove('creator-library-action-modal--activate');
    }
    titleEl.textContent = M.libraryDeactivateTitle || 'Deactivate design';
    btnCancel.textContent = M.libraryCancel || window.CreatorI18n?.cancel || 'Cancel';
    btnConfirm.textContent = M.libraryConfirmDeactivate || 'Deactivate';
    if (subFooterEl) {
      subFooterEl.innerHTML = '';
      subFooterEl.setAttribute('hidden', '');
    }
    setModalBusy(false);
    setContentLoading(false);
    overlay.removeAttribute('hidden');
    document.documentElement.classList.add('creator-library-action-modal-open');
  }

  function mountActivateSubfooter(opts) {
    if (!subFooterEl && !activateEmbedActive) ensureShell();
    if (!subFooterEl || !opts || !opts.visibilitySwitch) return;
    var visWrap = opts.visibilitySwitch;
    subFooterEl.innerHTML = '';

    var cap = visWrap.querySelector('.creator-library-action-modal__vis-switch-caption');
    var track = visWrap.querySelector('.creator-library-action-modal__vis-switch-track');
    if (!cap || !track) return;

    var grid = document.createElement('div');
    grid.className = 'creator-library-action-modal__subfooter-grid';

    var labelLeft = document.createElement('div');
    labelLeft.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--label-left';
    if (opts.creatorLabel) labelLeft.appendChild(opts.creatorLabel);

    var labelRight = document.createElement('div');
    labelRight.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--label-right';
    labelRight.appendChild(cap);

    var ctrlLeft = document.createElement('div');
    ctrlLeft.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--control-left';
    if (opts.creatorControl) ctrlLeft.appendChild(opts.creatorControl);

    var ctrlRight = document.createElement('div');
    ctrlRight.className =
      'creator-library-action-modal__subfooter-slot creator-library-action-modal__subfooter-slot--control-right';
    ctrlRight.appendChild(track);

    grid.appendChild(labelLeft);
    grid.appendChild(labelRight);
    grid.appendChild(ctrlLeft);
    grid.appendChild(ctrlRight);
    subFooterEl.appendChild(grid);
    subFooterEl.removeAttribute('hidden');
  }

  function closeModal() {
    if (!overlay) return;
    if (isModalBusy) return;
    var cardMediaApi = window.CreatorDesignProductsCardMedia;
    if (cardMediaApi && typeof cardMediaApi.clearRotations === 'function') {
      cardMediaApi.clearRotations();
    }
    if (cardMediaApi && typeof cardMediaApi.resetPaused === 'function') {
      cardMediaApi.resetPaused();
    }
    activateLoadToken++;
    isContentLoading = false;
    isModalBusy = false;
    overlay.setAttribute('hidden', '');
    document.documentElement.classList.remove('creator-library-action-modal-open');
    overlay.classList.remove('creator-library-action-modal-overlay--busy');
    if (modalEl) {
      modalEl.classList.remove('creator-library-action-modal--activate');
      modalEl.classList.remove('creator-library-action-modal--deactivate');
    }
    if (panelEl) {
      panelEl.classList.remove('creator-library-action-modal__panel--content-loading');
      panelEl.classList.remove('creator-library-action-modal__panel--busy');
    }
    if (busyEl) {
      busyEl.setAttribute('hidden', '');
      busyEl.setAttribute('aria-hidden', 'true');
    }
    contentEl.innerHTML = '';
    setLibraryContentClassName(contentEl);
    if (subFooterEl) {
      subFooterEl.innerHTML = '';
      subFooterEl.setAttribute('hidden', '');
    }
    mode = '';
    pendingDesign = null;
    pendingDeactivateIds = [];
    resetActivateProductCtx();
    bindActivateConfirmHandler(null);
    syncModalActionButtons();
  }

  function updateDesignPut(body) {
    var owner = getOwnerId();
    var shop = getShop();
    if (!owner) return Promise.reject(new Error('missing_owner'));
    var url = apiBase() + '?op=update-design&logged_in_customer_id=' + encodeURIComponent(owner);
    if (shop) url += '&shop=' + encodeURIComponent(shop);
    return fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () {
        return {};
      });
    });
  }

  function batchUnpublish(ids) {
    var owner = getOwnerId();
    var shop = getShop();
    if (!owner || !ids.length) return Promise.resolve({ ok: true });
    var url = apiBase() + '?op=batch-unpublish-published&logged_in_customer_id=' + encodeURIComponent(owner);
    if (shop) url += '&shop=' + encodeURIComponent(shop);
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published_design_ids: ids }),
    }).then(function (r) {
      return r.json().catch(function () {
        return {};
      });
    });
  }

  function fetchPublishedRows(designId) {
    var owner = getOwnerId();
    var shop = getShop();
    if (!owner) return Promise.resolve([]);
    var url =
      apiBase() +
      '?op=get-design-published-rows&design_id=' +
      encodeURIComponent(String(designId)) +
      '&owner_id=' +
      encodeURIComponent(owner);
    if (shop) url += '&shop=' + encodeURIComponent(shop);
    return fetch(url, { credentials: 'include' })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (data) {
        return data.ok && Array.isArray(data.rows) ? data.rows : [];
      });
  }

  function hydrateProductThumb(mediaEl, handle) {
    var key = String(handle || '').trim().toLowerCase();
    if (!key || !mediaEl) return;
    var storeJsUrl;
    try {
      var h = window.location && window.location.hostname;
      if (
        window.__CREATOR_PORTAL_HOST__ ||
        h === 'creator.eazpire.com' ||
        (h && h.indexOf('creator.') === 0)
      ) {
        storeJsUrl = 'https://www.eazpire.com/products/' + encodeURIComponent(key) + '.js';
      } else if (h === 'www.eazpire.com' || h === 'eazpire.com' || (h && h.indexOf('.myshopify.com') > 0)) {
        storeJsUrl = '/products/' + encodeURIComponent(key) + '.js';
      } else {
        storeJsUrl = 'https://www.eazpire.com/products/' + encodeURIComponent(key) + '.js';
      }
    } catch (_e) {
      storeJsUrl = 'https://www.eazpire.com/products/' + encodeURIComponent(key) + '.js';
    }
    fetch(storeJsUrl, { credentials: 'omit', mode: 'cors' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (payload) {
        if (!payload || mediaEl.querySelector('img')) return;
        var imgUrl =
          payload.featured_image ||
          (Array.isArray(payload.images) && payload.images[0]) ||
          payload.image ||
          null;
        if (!imgUrl) return;
        var img = document.createElement('img');
        img.src = typeof imgUrl === 'string' ? imgUrl : imgUrl.src || imgUrl.url || '';
        if (img.src.indexOf('//') === 0) img.src = 'https:' + img.src;
        img.alt = payload.title || '';
        img.loading = 'lazy';
        mediaEl.innerHTML = '';
        mediaEl.appendChild(img);
      })
      .catch(function () {});
  }

  function countActivateEligibleChecked() {
    if (!activateProdCtx || !activateProdCtx.eligibleKeys) return 0;
    var keys = activateProdCtx.eligibleKeys;
    var checked = activateProdCtx.checked || {};
    var n = 0;
    var i;
    for (i = 0; i < keys.length; i++) {
      if (checked[keys[i]]) n++;
    }
    return n;
  }

  function activateCatalogHadEligibleProducts() {
    return !!(activateProdCtx && activateProdCtx.eligibleKeys && activateProdCtx.eligibleKeys.length > 0);
  }

  async function runActivate(design, opts) {
    var M = Mi();
    var owner = getOwnerId();
    if (!owner || !design || !design.id) return;

    var visibility =
      opts && opts.visibility === 'private' ? 'private' : 'public';
    var activateWithout = !!(opts && opts.activate_without_creator_name);
    var creatorName =
      opts && opts.creator_name != null ? String(opts.creator_name).trim() : '';

    var publishTargetCount = countActivateEligibleChecked();
    var showProductCountLine = activateCatalogHadEligibleProducts();

    var body = {
      design_id: design.id,
      library_status: 'active',
      visibility: visibility,
    };
    if (activateWithout) {
      body.activate_without_creator_name = true;
      body.creator_name = '';
    } else {
      body.creator_name = creatorName;
    }

    var excludedPayload = opts && opts.publish_excluded_product_keys;
    var listingMode = opts && opts.listing_mode === 'personalized_sample' ? 'personalized_sample' : 'direct_sell';
    var metaOut = {};
    if (Array.isArray(excludedPayload)) metaOut.publish_excluded_product_keys = excludedPayload;
    metaOut.library_listing_mode = listingMode;
    body.metadata = metaOut;
    var isSampleMode = listingMode === 'personalized_sample';

    if (btnConfirm) btnConfirm.disabled = true;
    setActivateBusy(true, M.libraryActivating || M.libraryLoading || 'Activating…');
    try {
      var json = await updateDesignPut(body);
      if (!json.ok) throw new Error(json.error || 'update_failed');

      var excludedMeta =
        body.metadata && Array.isArray(body.metadata.publish_excluded_product_keys)
          ? body.metadata.publish_excluded_product_keys
          : [];

      setActivateBusy(false);
      if (activateEmbedActive) {
        clearActivateEmbedHosts();
        resetActivateProductCtx();
        mode = '';
        pendingDesign = null;
      } else {
        closeModal();
      }
      closeDesignPreviewIfOpen();
      if (creatorName && !activateWithout) writeLastCreatorPick(creatorName);

      var CS = window.CreationsScreen;
      if (CS) {
        if (typeof CS.applyDesignLibraryPatch === 'function') {
          CS.applyDesignLibraryPatch(String(design.id), {
            library_status: 'active',
            visibility: visibility,
            creator_name: activateWithout ? '' : creatorName,
            publish_excluded_product_keys: excludedMeta,
          });
        }
        if (typeof CS.setDesignsActivityFilter === 'function') {
          CS.setDesignsActivityFilter('active');
        }
        if (typeof CS.showDesignActivationSuccessToast === 'function') {
          CS.showDesignActivationSuccessToast({
            designTitle: (design.title || design.prompt || '').toString(),
            productCount: publishTargetCount,
            showProductCountLine: showProductCountLine && !isSampleMode,
            listingMode: listingMode,
            sampleSub: isSampleMode ? (M.libraryActivateSampleSuccessSub || '') : '',
          });
        }
        if (typeof CS.loadDesigns === 'function') {
          await CS.loadDesigns(true, { silent: true });
        }
      }
    } catch (err) {
      console.warn('[creator-creations-library-actions] activate', err);
      setActivateBusy(false);
      alert(M.libraryErrorGeneric || window.CreatorI18n?.errorSaving || 'Could not save.');
    }
  }

  /** Persist listing mode / visibility / creator / exclusions without activating. */
  async function runSaveActivateSettings(design, opts) {
    var M = Mi();
    var owner = getOwnerId();
    if (!owner || !design || !design.id) return;

    var visibility = opts && opts.visibility === 'private' ? 'private' : 'public';
    var activateWithout = !!(opts && opts.activate_without_creator_name);
    var creatorName =
      opts && opts.creator_name != null ? String(opts.creator_name).trim() : '';

    var body = {
      design_id: design.id,
      visibility: visibility,
    };
    if (activateWithout) {
      body.activate_without_creator_name = true;
      body.creator_name = '';
    } else {
      body.creator_name = creatorName;
    }

    var excludedPayload = opts && opts.publish_excluded_product_keys;
    var listingMode = opts && opts.listing_mode === 'personalized_sample' ? 'personalized_sample' : 'direct_sell';
    var metaOut = {};
    if (Array.isArray(excludedPayload)) metaOut.publish_excluded_product_keys = excludedPayload;
    metaOut.library_listing_mode = listingMode;
    body.metadata = metaOut;

    setActivateBusy(true, M.librarySaving || window.CreatorI18n?.saving || 'Saving…');
    try {
      var json = await updateDesignPut(body);
      if (!json.ok) throw new Error(json.error || 'update_failed');

      var excludedMeta =
        body.metadata && Array.isArray(body.metadata.publish_excluded_product_keys)
          ? body.metadata.publish_excluded_product_keys
          : [];

      setActivateBusy(false);
      if (creatorName && !activateWithout) writeLastCreatorPick(creatorName);

      var CS = window.CreationsScreen;
      if (CS && typeof CS.applyDesignLibraryPatch === 'function') {
        CS.applyDesignLibraryPatch(String(design.id), {
          visibility: visibility,
          creator_name: activateWithout ? '' : creatorName,
          publish_excluded_product_keys: excludedMeta,
        });
      }
      if (CS && typeof CS.loadDesigns === 'function') {
        await CS.loadDesigns(true, { silent: true });
      }
    } catch (err) {
      console.warn('[creator-creations-library-actions] save activate settings', err);
      setActivateBusy(false);
      alert(M.libraryErrorGeneric || window.CreatorI18n?.errorSaving || 'Could not save.');
    }
  }

  async function runDeactivate(design, publishedIds) {
    var M = Mi();
    var owner = getOwnerId();
    if (!owner || !design || !design.id) return;

    if (btnConfirm) btnConfirm.disabled = true;
    try {
      if (publishedIds && publishedIds.length) {
        var batchJson = await batchUnpublish(publishedIds);
        if (!batchJson.ok && !(batchJson.enqueued_ids && batchJson.enqueued_ids.length)) {
          throw new Error(batchJson.error || 'batch_unpublish_failed');
        }
      }
      var json = await updateDesignPut({
        design_id: design.id,
        library_status: 'inactive',
      });
      if (!json.ok) throw new Error(json.error || 'update_failed');
      closeModal();
      var CSd = window.CreationsScreen;
      if (CSd) {
        if (typeof CSd.applyDesignLibraryPatch === 'function') {
          CSd.applyDesignLibraryPatch(String(design.id), { library_status: 'inactive' });
        }
        if (typeof CSd.loadDesigns === 'function') {
          await CSd.loadDesigns(true, { silent: true });
        }
      }
    } catch (err) {
      console.warn('[creator-creations-library-actions] deactivate', err);
      alert(M.libraryErrorDeactivate || M.libraryErrorGeneric || 'Could not deactivate.');
    } finally {
      if (btnConfirm) btnConfirm.disabled = false;
    }
  }

  function renderCreatorNameStatic(name) {
    var wrap = document.createElement('div');
    wrap.className = 'creator-library-action-modal__creator-static';

    var cap = document.createElement('span');
    cap.className = 'creator-library-action-modal__label';
    cap.textContent = Mi().libraryActivateCreatorLabel || 'Creator name';

    var val = document.createElement('span');
    val.className = 'creator-library-action-modal__creator-static-value';
    val.textContent = String(name || '');

    wrap.appendChild(cap);
    wrap.appendChild(val);
    return wrap;
  }

  /** Toggle switch: public = knob right (accent), private = knob left */
  function renderVisibilitySwitch(initialPublic) {
    var M = Mi();
    var wrap = document.createElement('div');
    wrap.className = 'creator-library-action-modal__vis-switch-wrap';

    var cap = document.createElement('div');
    cap.className = 'creator-library-action-modal__vis-switch-caption';
    cap.setAttribute('aria-live', 'polite');

    var track = document.createElement('button');
    track.type = 'button';
    track.className = 'creator-library-action-modal__vis-switch-track';
    track.setAttribute('role', 'switch');

    var knob = document.createElement('span');
    knob.className = 'creator-library-action-modal__vis-switch-knob';
    knob.setAttribute('aria-hidden', 'true');
    track.appendChild(knob);

    var isPublic = initialPublic !== false;

    function sync() {
      track.setAttribute('aria-checked', isPublic ? 'true' : 'false');
      track.classList.toggle('creator-library-action-modal__vis-switch-track--public', isPublic);
      track.classList.toggle('creator-library-action-modal__vis-switch-track--private', !isPublic);
      if (!cap.hasAttribute('hidden')) {
        cap.textContent = isPublic
          ? M.libraryVisibilityPublic || 'Public'
          : M.libraryVisibilityPrivate || 'Private';
      }
      track.setAttribute(
        'aria-label',
        (isPublic ? M.libraryVisibilityPublic || 'Public' : M.libraryVisibilityPrivate || 'Private')
      );
      var labels = wrap._visLabels;
      if (labels) {
        if (labels.private) labels.private.classList.toggle('is-active', !isPublic);
        if (labels.public) labels.public.classList.toggle('is-active', isPublic);
      }
    }

    track.addEventListener('click', function () {
      isPublic = !isPublic;
      sync();
    });

    sync();

    wrap.appendChild(cap);
    wrap.appendChild(track);

    wrap.syncUi = sync;
    wrap.getValue = function () {
      return isPublic ? 'public' : 'private';
    };
    return wrap;
  }

  async function fillActivateUi(opts) {
    opts = opts || {};
    var design = opts.design;
    var contentHost = opts.contentHost;
    var subFooterHost = opts.subFooterHost;
    var includeCatalog = opts.includeCatalog !== false;
    var setConfirmHandler =
      typeof opts.setConfirmHandler === 'function' ? opts.setConfirmHandler : null;
    var setLoading = typeof opts.setLoading === 'function' ? opts.setLoading : null;
    var embedded = !!opts.embedded;
    var M = Mi();

    if (!design || !contentHost) return;

    pendingDesign = design;
    mode = 'activate';
    var loadToken = ++activateLoadToken;

    var prevContentEl = contentEl;
    var prevSubFooterEl = subFooterEl;
    contentEl = contentHost;
    subFooterEl = subFooterHost || null;

    if (embedded) {
      activateEmbedActive = true;
      activateEmbedContentHost = contentHost;
      activateEmbedSubFooterHost = subFooterHost || null;
      activateEmbedSetLoading = setLoading;
    }

    bindActivateConfirmHandler(null);
    if (setConfirmHandler) setConfirmHandler(null);

    function applyLoading(loading) {
      if (setLoading) {
        try {
          setLoading(!!loading);
        } catch (_) {}
      }
      if (!embedded) setContentLoading(!!loading);
      else isContentLoading = !!loading;
    }

    applyLoading(true);
    renderActivateSkeleton();
    if (!includeCatalog && contentEl) {
      // Edit Mode: no product grid skeleton — keep a lighter loading block
      var skGrid = contentEl.querySelector('.creator-library-action-modal__skeleton-grid');
      if (skGrid && skGrid.parentNode) skGrid.parentNode.remove();
    }

    var names = [];
    var catalog = {
      eligibleKeys: [],
      checked: {},
      metaExcludedSnapshot: [],
      initialExcluded: [],
      publishedRows: [],
      pubKeySet: new Set(),
      products: [],
      loadError: false,
    };
    try {
      var tasks = [fetchCreatorNamesCached()];
      if (includeCatalog) tasks.push(fetchActivateCatalogBundle(design));
      var loaded = await Promise.all(tasks);
      if (loadToken !== activateLoadToken) return;
      names = loaded[0];
      if (includeCatalog) catalog = loaded[1];
    } catch (e) {
      if (loadToken !== activateLoadToken) return;
      console.warn('[creator-creations-library-actions] activate preload', e);
    }

    setLibraryContentClassName(contentEl);
    contentEl.innerHTML = '';
    if (subFooterEl) {
      subFooterEl.innerHTML = '';
      subFooterEl.setAttribute('hidden', '');
    }

    var sel = null;
    var visSwitch = renderVisibilitySwitch(true);
    var activateWithoutCreator = names.length === 0;
    var soleName = names.length === 1 ? names[0] : '';

    function pushExcluded(extra) {
      var ex = getActivateExcludedKeysFromCtx();
      if (ex !== null) extra.publish_excluded_product_keys = ex;
      extra.listing_mode = getActivateListingMode();
      return extra;
    }

    function collectCreatorOpts() {
      if (activateWithoutCreator) {
        return { activate_without_creator_name: true, visibility: visSwitch.getValue() };
      }
      if (soleName) {
        return { creator_name: soleName, visibility: visSwitch.getValue() };
      }
      var chosen = sel ? String(sel.value || '').trim() : '';
      return { creator_name: chosen, visibility: visSwitch.getValue() };
    }

    function wireConfirm(fn) {
      bindActivateConfirmHandler(fn);
      if (setConfirmHandler) setConfirmHandler(fn);
    }

    function wireSave(fn) {
      bindActivateSaveHandler(fn);
    }

    // Order: listing mode → visibility → creator → products (quick only)
    appendListingModeSwitch(contentEl);
    appendVisibilitySettingsBox(contentEl, visSwitch);

    if (activateWithoutCreator) {
      appendCreatorSettingsBox(contentEl, {
        emptyText: M.libraryActivateNoCreatorBody || 'No creator name available for this design.',
      });
    } else if (soleName) {
      appendCreatorSettingsBox(contentEl, {
        control: renderCreatorNameStatic(soleName),
      });
    } else {
      sel = document.createElement('select');
      sel.id = 'creator-library-creator-select';
      sel.className = 'creator-library-action-modal__select';
      var pick = readLastCreatorPick(names) || names[0];
      for (var i = 0; i < names.length; i++) {
        var opt = document.createElement('option');
        opt.value = names[i];
        opt.textContent = names[i];
        if (names[i] === pick) opt.selected = true;
        sel.appendChild(opt);
      }
      appendCreatorSettingsBox(contentEl, { control: sel });
    }

    if (includeCatalog) appendActivateCatalogBlock(contentEl, design, catalog);

    wireConfirm(function () {
      runActivate(design, pushExcluded(collectCreatorOpts()));
    });
    wireSave(function () {
      runSaveActivateSettings(design, pushExcluded(collectCreatorOpts()));
    });

    applyLoading(false);

    if (!embedded) {
      contentEl = prevContentEl || contentEl;
      subFooterEl = prevSubFooterEl || subFooterEl;
    }
  }

  async function openActivateModal(design) {
    if (isShopStudioLockedDesign(design)) {
      await unlockShopStudioDesign(design);
      return;
    }
    pendingDesign = design;
    mode = 'activate';

    openActivateShell();
    bindActivateConfirmHandler(null);
    await fillActivateUi({
      design: design,
      contentHost: contentEl,
      subFooterHost: subFooterEl,
      includeCatalog: true,
      embedded: false,
      setConfirmHandler: function (fn) {
        if (btnConfirm) btnConfirm.onclick = fn;
      },
      setLoading: function (loading) {
        setContentLoading(!!loading);
      },
    });
  }

  function mountCreatorCreationsActivateInto(opts) {
    opts = opts || {};
    if (!opts.design || !opts.contentHost) {
      return Promise.resolve();
    }
    return fillActivateUi({
      design: opts.design,
      contentHost: opts.contentHost,
      subFooterHost: opts.subFooterHost || null,
      includeCatalog: opts.includeCatalog !== false,
      embedded: true,
      setConfirmHandler: opts.setConfirmHandler,
      setLoading: opts.setLoading,
    });
  }

  function unmountCreatorCreationsActivateInto() {
    activateLoadToken++;
    isContentLoading = false;
    isModalBusy = false;
    clearActivateEmbedHosts();
    resetActivateProductCtx();
    if (mode === 'activate' && (!overlay || overlay.hasAttribute('hidden'))) {
      mode = '';
      pendingDesign = null;
    }
  }

  function triggerCreatorCreationsActivateConfirm() {
    if (typeof pendingActivateConfirmHandler === 'function') {
      pendingActivateConfirmHandler();
      return true;
    }
    if (btnConfirm && typeof btnConfirm.onclick === 'function') {
      btnConfirm.onclick();
      return true;
    }
    return false;
  }

  function triggerCreatorCreationsActivateSave() {
    if (typeof pendingActivateSaveHandler === 'function') {
      pendingActivateSaveHandler();
      return true;
    }
    return false;
  }

  async function openDeactivateModal(design) {
    var M = Mi();
    pendingDesign = design;
    mode = 'deactivate';

    openDeactivateShell();
    contentEl.innerHTML =
      '<p class="creator-library-action-modal__loading">' +
      escapeHtml(M.libraryLoading || window.CreatorI18n?.loading || 'Loading…') +
      '</p>';

    var rows = await fetchPublishedRows(design.id);
    pendingDeactivateIds = rows.map(function (r) {
      return r && r.id != null ? Number(r.id) : null;
    }).filter(function (x) {
      return x != null && isFinite(x);
    });

    contentEl.innerHTML = '';

    var intro = document.createElement('div');
    intro.className = 'creator-library-action-modal__intro';

    if (rows.length) {
      intro.innerHTML =
        '<p>' +
        escapeHtml(M.libraryDeactivatePublishedIntro || '') +
        '</p>';
      contentEl.appendChild(intro);

      var grid = document.createElement('div');
      grid.className = 'creator-library-action-modal__pub-grid';
      grid.setAttribute('aria-label', M.libraryDeactivateGridAria || 'Published products');

      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var card = document.createElement('div');
        card.className = 'creator-library-action-modal__pub-card';
        var media = document.createElement('div');
        media.className = 'creator-library-action-modal__pub-card-media';
        var ph = document.createElement('div');
        ph.className = 'creator-library-action-modal__pub-card-ph';
        ph.textContent = '—';
        media.appendChild(ph);
        var ttl = document.createElement('div');
        ttl.className = 'creator-library-action-modal__pub-card-title';
        ttl.textContent = row.product_name || row.product_key || 'Product';
        card.appendChild(media);
        card.appendChild(ttl);
        grid.appendChild(card);

        var h = row.shopify_handle ? String(row.shopify_handle).trim() : '';
        if (h) hydrateProductThumb(media, h);
      }
      contentEl.appendChild(grid);
    } else {
      intro.innerHTML =
        '<p>' +
        escapeHtml(M.libraryDeactivateSimpleIntro || '') +
        '</p>';
      contentEl.appendChild(intro);
    }

    btnConfirm.onclick = function () {
      runDeactivate(design, pendingDeactivateIds);
    };
  }

  window.CreatorCreationsLibraryCore = {
    Mi: Mi,
    apiBase: apiBase,
    getOwnerId: getOwnerId,
    getShop: getShop,
    escapeHtml: escapeHtml,
    replacePlaceholders: replacePlaceholders,
    catalogRegion: catalogRegion,
    parseExcludedFromMeta: parseExcludedFromMeta,
    computeExcludedKeys: computeExcludedKeys,
    sortUnique: sortUnique,
    fetchActivateCatalogBundle: fetchActivateCatalogBundle,
    updateDesignPut: updateDesignPut,
    batchUnpublish: batchUnpublish,
    fetchPublishedRows: fetchPublishedRows,
    fetchCreatorNames: fetchCreatorNames,
    fetchCreatorNamesCached: fetchCreatorNamesCached,
    invalidateCreatorNamesCache: invalidateCreatorNamesCache,
    readLastCreatorPick: readLastCreatorPick,
    writeLastCreatorPick: writeLastCreatorPick,
    renderVisibilitySwitch: renderVisibilitySwitch,
    hydrateProductThumb: hydrateProductThumb,
    LS_LAST_CREATOR: LS_LAST_CREATOR,
  };

  window.openCreatorCreationsActivateModal = openActivateModal;
  window.openCreatorCreationsDeactivateModal = openDeactivateModal;
  window.closeCreatorCreationsLibraryModal = closeModal;
  window.mountCreatorCreationsActivateInto = mountCreatorCreationsActivateInto;
  window.unmountCreatorCreationsActivateInto = unmountCreatorCreationsActivateInto;
  window.triggerCreatorCreationsActivateConfirm = triggerCreatorCreationsActivateConfirm;
  window.triggerCreatorCreationsActivateSave = triggerCreatorCreationsActivateSave;
  window.unlockShopStudioDesign = unlockShopStudioDesign;
  window.isShopStudioLockedDesign = isShopStudioLockedDesign;
})();
