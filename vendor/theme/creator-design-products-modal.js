/**
 * Creations — catalog products picker (auto-publish scope).
 * Embedded in Design Preview Modal (products panel). Card media helpers also used by library activate flow.
 * Persists publish_excluded_product_keys via op=update-design; queues unpublish for removed published keys.
 */
(function () {
  'use strict';

  function apiBase() {
    return window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  function Mi() {
    return window.CreatorMobileI18n || {};
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

  /** eligibleKeys: catalog keys for region; checkedMap: product_key -> included for publish (checkbox checked) */
  function computeExcludedKeys(eligibleKeys, checkedMap, previousExcludedArr) {
    var prev = previousExcludedArr || [];
    var eligible = new Set(eligibleKeys || []);
    var out = [];
    for (var i = 0; i < prev.length; i++) {
      var pk = String(prev[i] || '').trim();
      if (!pk) continue;
      if (!eligible.has(pk)) out.push(pk);
    }
    for (var j = 0; j < eligibleKeys.length; j++) {
      var key = eligibleKeys[j];
      if (!checkedMap[key]) out.push(key);
    }
    return sortUnique(out);
  }

  function arraysEqualJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function resolveLibraryStatus(d) {
    if (!d) return 'inactive';
    var ls = d.library_status;
    if (ls === 'active' || ls === 'inactive') return ls;
    var id = d.id != null ? String(d.id).trim() : '';
    return id !== '' ? 'active' : 'inactive';
  }

  var hostEl = null;
  var gridEl = null;
  var btnUpdate = null;
  var btnSelAll = null;
  var btnDeselAll = null;
  var selectedCountEl = null;
  var statusEl = null;
  var hintEl = null;
  var filterTabsEl = null;
  var boundHost = null;

  var ctxEligibleKeys = [];
  var ctxChecked = {};
  var ctxInitialExcluded = [];
  /** Snapshot of publish_excluded_product_keys from metadata when panel opened (preserves off-catalog keys). */
  var ctxMetaExcludedSnapshot = [];
  var ctxPublishedRows = [];
  /** First published_designs row per product_key (for handle + badge). */
  var ctxPubRowByKey = {};
  var ctxDesign = null;
  var ctxAllProducts = [];
  /** 'all' | 'queue' | 'active' — queue/active only for active library designs */
  var ctxFilter = 'all';

  var ROTATION_MS = 1500;
  /** @type {Map<string, number>} product_key -> interval id */
  var rotationTimers = new Map();
  /** @type {Set<string>} product_keys where user manually changed slide (auto-rotate paused) */
  var rotationPausedKeys = new Set();

  function clearAllRotations() {
    rotationTimers.forEach(function (id) {
      clearInterval(id);
    });
    rotationTimers.clear();
  }

  /** Fallback template when catalog API returns no mock_urls (e.g. stale DB row). */
  var CATALOG_MOCK_FALLBACK = {
    'coffee-mug':
      'https://creator-engine.eazpire.workers.dev/mockup/mockups/coffee-mug/red-right.png',
  };

  function normalizeMockUrls(product) {
    var urls = [];
    if (product && Array.isArray(product.mock_urls)) {
      urls = product.mock_urls
        .map(function (u) {
          return String(u || '').trim();
        })
        .filter(Boolean);
    }
    var prev = product && product.preview_image_url ? String(product.preview_image_url).trim() : '';
    if (!urls.length && prev) urls = [prev];
    var creator = urls.filter(function (u) {
      return /\/mockup\//i.test(u);
    });
    if (creator.length) return creator;
    var filtered = urls.filter(function (u) {
      return !/images\.printify\.com/i.test(u);
    });
    if (filtered.length) return filtered;
    var pk = product && product.product_key ? String(product.product_key).trim() : '';
    if (pk && CATALOG_MOCK_FALLBACK[pk]) return [CATALOG_MOCK_FALLBACK[pk]];
    return filtered;
  }

  function preloadUrl(u, done) {
    if (!u) {
      done();
      return;
    }
    var img = new Image();
    img.onload = function () {
      done();
    };
    img.onerror = function () {
      done();
    };
    img.src = u;
  }

  function bindSlideError(img, urls, stage, productKey, getIndex) {
    if (!img || !urls || !urls.length) return;
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      var idx = getIndex();
      for (var attempt = 1; attempt < urls.length; attempt++) {
        var nextIdx = (idx + attempt) % urls.length;
        var nextUrl = urls[nextIdx];
        if (!nextUrl || nextUrl === img.src) continue;
        stage.dataset.slideIndex = String(nextIdx);
        preloadUrl(nextUrl, function () {
          img.src = nextUrl;
        });
        return;
      }
      img.style.display = 'none';
    });
  }

  function mountCardMediaCarousel(mediaEl, productKey, urls) {
    if (!mediaEl) return;
    mediaEl.innerHTML = '';
    mediaEl.classList.add('creator-design-products-modal__card-media--carousel');
    if (!urls || !urls.length) {
      mediaEl.classList.remove('creator-design-products-modal__card-media--carousel');
      var ph = document.createElement('div');
      ph.className = 'creator-design-products-modal__card-ph';
      ph.textContent = '—';
      mediaEl.appendChild(ph);
      return;
    }

    var stage = document.createElement('div');
    stage.className = 'creator-design-products-modal__card-stage';
    stage.setAttribute('data-product-key', productKey);

    if (urls.length >= 2) {
      var imgA = document.createElement('img');
      imgA.className = 'creator-design-products-modal__card-slide is-active';
      imgA.alt = '';
      imgA.loading = 'lazy';
      imgA.src = urls[0];
      var imgB = document.createElement('img');
      imgB.className = 'creator-design-products-modal__card-slide';
      imgB.alt = '';
      imgB.loading = 'lazy';
      imgB.src = urls[1] || urls[0];
      bindSlideError(imgA, urls, stage, productKey, function () {
        return parseInt(stage.dataset.slideIndex || '0', 10);
      });
      bindSlideError(imgB, urls, stage, productKey, function () {
        var idx = parseInt(stage.dataset.slideIndex || '0', 10);
        return (idx + 1) % urls.length;
      });
      stage.appendChild(imgA);
      stage.appendChild(imgB);
      stage.dataset.slideIndex = '0';

      var navPrev = document.createElement('button');
      navPrev.type = 'button';
      navPrev.className = 'creator-design-products-modal__card-nav creator-design-products-modal__card-nav--prev';
      navPrev.setAttribute('aria-label', Mi().designProductsPrevMock || 'Previous mock');
      navPrev.innerHTML = '&#8249;';
      var navNext = document.createElement('button');
      navNext.type = 'button';
      navNext.className = 'creator-design-products-modal__card-nav creator-design-products-modal__card-nav--next';
      navNext.setAttribute('aria-label', Mi().designProductsNextMock || 'Next mock');
      navNext.innerHTML = '&#8250;';

      function advanceSlide(delta) {
        var idx = parseInt(stage.dataset.slideIndex || '0', 10);
        var nextIdx = (idx + delta + urls.length * 100) % urls.length;
        stage.dataset.slideIndex = String(nextIdx);
        var active = stage.querySelector('.creator-design-products-modal__card-slide.is-active');
        var inactive = stage.querySelector('.creator-design-products-modal__card-slide:not(.is-active)');
        if (!active || !inactive) return;
        var nextUrl = urls[nextIdx];
        preloadUrl(nextUrl, function () {
          inactive.src = nextUrl;
          inactive.classList.add('is-active');
          active.classList.remove('is-active');
        });
      }

      navPrev.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        rotationPausedKeys.add(productKey);
        stopCardRotation(productKey);
        advanceSlide(-1);
      });
      navNext.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        rotationPausedKeys.add(productKey);
        stopCardRotation(productKey);
        advanceSlide(1);
      });

      mediaEl.appendChild(stage);
      mediaEl.appendChild(navPrev);
      mediaEl.appendChild(navNext);
      startCardRotation(productKey, stage, urls);
    } else {
      mediaEl.classList.remove('creator-design-products-modal__card-media--carousel');
      var imgSingle = document.createElement('img');
      imgSingle.alt = '';
      imgSingle.loading = 'lazy';
      imgSingle.src = urls[0];
      bindSlideError(imgSingle, urls, stage, productKey, function () {
        return 0;
      });
      stage.appendChild(imgSingle);
      mediaEl.appendChild(stage);
    }
  }

  function stopCardRotation(productKey) {
    var id = rotationTimers.get(productKey);
    if (id) {
      clearInterval(id);
      rotationTimers.delete(productKey);
    }
  }

  function startCardRotation(productKey, stage, urls) {
    if (!urls || urls.length < 2 || rotationPausedKeys.has(productKey)) return;
    stopCardRotation(productKey);
    var id = setInterval(function () {
      if (rotationPausedKeys.has(productKey)) {
        stopCardRotation(productKey);
        return;
      }
      var idx = parseInt(stage.dataset.slideIndex || '0', 10);
      var nextIdx = (idx + 1) % urls.length;
      stage.dataset.slideIndex = String(nextIdx);
      var active = stage.querySelector('.creator-design-products-modal__card-slide.is-active');
      var inactive = stage.querySelector('.creator-design-products-modal__card-slide:not(.is-active)');
      if (!active || !inactive) return;
      var nextUrl = urls[nextIdx];
      preloadUrl(nextUrl, function () {
        inactive.src = nextUrl;
        inactive.classList.add('is-active');
        active.classList.remove('is-active');
      });
    }, ROTATION_MS);
    rotationTimers.set(productKey, id);
  }

  /** Expose for creator-creations-library-actions activate flow */
  window.CreatorDesignProductsCardMedia = {
    mount: mountCardMediaCarousel,
    clearRotations: clearAllRotations,
    normalizeMockUrls: normalizeMockUrls,
    resetPaused: function () {
      rotationPausedKeys.clear();
    },
  };

  function rebuildPublishedRowMap(rows) {
    ctxPubRowByKey = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      if (!r || !r.product_key) continue;
      var pk = String(r.product_key).trim();
      if (!pk || ctxPubRowByKey[pk]) continue;
      ctxPubRowByKey[pk] = r;
    }
  }

  function refreshCardBadges(card, pk) {
    if (!card || !pk) return;
    var old = card.querySelector('.creator-design-products-modal__card-badges');
    if (old) old.remove();
    var pubRow = ctxPubRowByKey[pk];
    var isChecked = !!ctxChecked[pk];
    var M = Mi();
    var badges = document.createElement('div');
    badges.className = 'creator-design-products-modal__card-badges';
    if (pubRow) {
      var on = document.createElement('span');
      on.className = 'creator-design-products-modal__card-badge creator-design-products-modal__card-badge--online';
      on.textContent = M.designProductsBadgeOnline || 'Online';
      badges.appendChild(on);
    } else if (isChecked) {
      var qu = document.createElement('span');
      qu.className = 'creator-design-products-modal__card-badge creator-design-products-modal__card-badge--queue';
      qu.textContent = M.designProductsBadgeQueue || 'Queue';
      badges.appendChild(qu);
    }
    if (badges.childNodes.length) card.appendChild(badges);
  }

  function refreshAllCardBadges() {
    if (!gridEl) return;
    var cards = gridEl.querySelectorAll('.creator-design-products-modal__card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var inp = card.querySelector('input[data-product-key]');
      if (!inp) continue;
      refreshCardBadges(card, inp.getAttribute('data-product-key'));
    }
  }

  function visibleKeys() {
    var products = filteredProducts();
    return products
      .map(function (p) {
        return String(p.product_key || '').trim();
      })
      .filter(Boolean);
  }

  function filteredProducts() {
    if (ctxFilter === 'all') return ctxAllProducts.slice();
    return ctxAllProducts.filter(function (p) {
      var pk = String(p.product_key || '').trim();
      if (!pk) return false;
      var isOnline = !!ctxPubRowByKey[pk];
      if (ctxFilter === 'active') return isOnline;
      if (ctxFilter === 'queue') return !isOnline;
      return true;
    });
  }

  function syncFilterTabsUi() {
    if (!filterTabsEl) return;
    var showTabs = resolveLibraryStatus(ctxDesign) === 'active';
    if (showTabs) {
      filterTabsEl.removeAttribute('hidden');
      if (ctxFilter === 'all') ctxFilter = 'queue';
    } else {
      filterTabsEl.setAttribute('hidden', '');
      ctxFilter = 'all';
    }
    var tabs = filterTabsEl.querySelectorAll('[data-cdp-products-filter]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var key = String(tab.getAttribute('data-cdp-products-filter') || '');
      var on = key === ctxFilter;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function cacheHostRefs(root) {
    hostEl = root;
    gridEl = root.querySelector('#cdp-products-grid-design-preview') || root.querySelector('[id^="cdp-products-grid-"]') || root.querySelector('.cdp-modal__products-grid');
    btnUpdate = root.querySelector('#cdp-products-update-design-preview') || root.querySelector('[id^="cdp-products-update-"]');
    btnSelAll = root.querySelector('#cdp-products-select-all-design-preview') || root.querySelector('[id^="cdp-products-select-all-"]');
    btnDeselAll = root.querySelector('#cdp-products-deselect-all-design-preview') || root.querySelector('[id^="cdp-products-deselect-all-"]');
    selectedCountEl = root.querySelector('#cdp-products-selected-count-design-preview') || root.querySelector('[id^="cdp-products-selected-count-"]');
    statusEl = root.querySelector('#cdp-products-status-design-preview') || root.querySelector('[id^="cdp-products-status-"]');
    hintEl = root.querySelector('.cdp-modal__products-hint');
    filterTabsEl = root.querySelector('#cdp-products-filter-tabs-design-preview') || root.querySelector('[id^="cdp-products-filter-tabs-"]');
  }

  function bindHostOnce(root) {
    if (!root || boundHost === root) return;
    boundHost = root;
    cacheHostRefs(root);

    if (btnSelAll) {
      btnSelAll.addEventListener('click', function () {
        var keys = visibleKeys();
        for (var i = 0; i < keys.length; i++) ctxChecked[keys[i]] = true;
        syncCheckboxInputs();
        refreshAllCardBadges();
        refreshDirty();
        refreshSelectedCount();
      });
    }
    if (btnDeselAll) {
      btnDeselAll.addEventListener('click', function () {
        var keys = visibleKeys();
        for (var j = 0; j < keys.length; j++) ctxChecked[keys[j]] = false;
        syncCheckboxInputs();
        refreshAllCardBadges();
        refreshDirty();
        refreshSelectedCount();
      });
    }
    if (btnUpdate) {
      btnUpdate.addEventListener('click', onConfirmUpdate);
    }
    if (filterTabsEl) {
      filterTabsEl.addEventListener('click', function (e) {
        var tab = e.target && e.target.closest ? e.target.closest('[data-cdp-products-filter]') : null;
        if (!tab) return;
        var next = String(tab.getAttribute('data-cdp-products-filter') || '');
        if (next !== 'queue' && next !== 'active') return;
        if (ctxFilter === next) return;
        ctxFilter = next;
        syncFilterTabsUi();
        renderGrid(filteredProducts());
        refreshDirty();
      });
    }
  }

  function applyStaticLabels() {
    var M = Mi();
    if (btnSelAll) btnSelAll.textContent = M.designProductsSelectAll || 'Select all';
    if (btnDeselAll) btnDeselAll.textContent = M.designProductsDeselectAll || 'Deselect all';
    if (btnUpdate) btnUpdate.textContent = M.designProductsUpdate || 'Update';
    if (gridEl) gridEl.setAttribute('aria-label', M.designProductsGridAria || '');
    if (filterTabsEl) {
      var q = filterTabsEl.querySelector('[data-cdp-products-filter="queue"]');
      var a = filterTabsEl.querySelector('[data-cdp-products-filter="active"]');
      if (q) q.textContent = M.designProductsTabQueue || 'Queue';
      if (a) a.textContent = M.designProductsTabActive || 'Active';
    }
  }

  function resetPanelState() {
    clearAllRotations();
    rotationPausedKeys.clear();
    ctxDesign = null;
    ctxEligibleKeys = [];
    ctxChecked = {};
    ctxInitialExcluded = [];
    ctxMetaExcludedSnapshot = [];
    ctxPublishedRows = [];
    ctxPubRowByKey = {};
    ctxAllProducts = [];
    ctxFilter = 'all';
    if (gridEl) gridEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    if (filterTabsEl) filterTabsEl.setAttribute('hidden', '');
  }

  function syncCheckboxInputs() {
    if (!gridEl) return;
    var boxes = gridEl.querySelectorAll('input[type="checkbox"][data-product-key]');
    for (var i = 0; i < boxes.length; i++) {
      var inp = boxes[i];
      var pk = inp.getAttribute('data-product-key');
      inp.checked = !!ctxChecked[pk];
    }
  }

  function refreshSelectedCount() {
    if (!selectedCountEl) return;
    var keys = visibleKeys();
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      if (ctxChecked[keys[i]]) n += 1;
    }
    var tpl = Mi().designProductsSelectedCount || '{{count}} selected';
    selectedCountEl.textContent = tpl.replace('{{count}}', String(n)).replace('{count}', String(n));
  }

  function refreshDirty() {
    var nextExcluded = computeExcludedKeys(ctxEligibleKeys, ctxChecked, ctxMetaExcludedSnapshot);
    var dirty = !arraysEqualJson(nextExcluded, ctxInitialExcluded);
    if (btnUpdate) btnUpdate.disabled = !dirty || !ctxEligibleKeys.length;
    refreshSelectedCount();
  }

  function openStudioForProduct(productKey, productMeta) {
    if (!ctxDesign || !productKey) return;
    var api = window.CreatorDesignStudioModal;
    if (api && typeof api.open === 'function') {
      api.open(ctxDesign, productKey, productMeta || null);
      return;
    }
    console.warn('[creator-design-products-modal] CreatorDesignStudioModal.open unavailable');
  }

  function renderGrid(products) {
    if (!gridEl) return;
    clearAllRotations();
    gridEl.innerHTML = '';
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      var pk = String(p.product_key || '').trim();
      if (!pk) continue;
      var card = document.createElement('div');
      card.className = 'creator-design-products-modal__card';
      card.setAttribute('role', 'group');
      card.setAttribute('tabindex', '0');
      card.setAttribute('data-product-key', pk);
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.setAttribute('data-product-key', pk);
      cb.checked = !!ctxChecked[pk];
      cb.addEventListener('click', function (ev) {
        ev.stopPropagation();
      });
      cb.addEventListener('change', function (ev) {
        ev.stopPropagation();
        var key = ev.target.getAttribute('data-product-key');
        ctxChecked[key] = !!ev.target.checked;
        refreshCardBadges(ev.target.closest('.creator-design-products-modal__card'), key);
        refreshDirty();
      });
      card.addEventListener('click', function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest('input[type="checkbox"]')) return;
        if (ev.target && ev.target.closest && ev.target.closest('.creator-design-products-modal__card-nav')) return;
        openStudioForProduct(pk, p);
      });
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          if (ev.target && ev.target.matches && ev.target.matches('input[type="checkbox"]')) return;
          ev.preventDefault();
          openStudioForProduct(pk, p);
        }
      });
      var media = document.createElement('div');
      media.className = 'creator-design-products-modal__card-media';
      mountCardMediaCarousel(media, pk, normalizeMockUrls(p));
      var ttl = document.createElement('div');
      ttl.className = 'creator-design-products-modal__card-title';
      ttl.textContent = p.title || pk;
      card.appendChild(cb);
      card.appendChild(media);
      card.appendChild(ttl);
      refreshCardBadges(card, pk);
      gridEl.appendChild(card);
    }
  }

  async function loadAndRender(design) {
    var owner = getOwnerId();
    var M = Mi();
    if (!owner || !design || !design.id) {
      if (statusEl) statusEl.textContent = M.designProductsLoadError || 'Could not load.';
      return;
    }
    var designId = String(design.id).trim();
    var shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : window.__SHOPIFY_SHOP_DOMAIN || null;
    var region = catalogRegion();

    if (statusEl) statusEl.textContent = Mi().creationsLoadingDesigns || 'Loading…';

    var base = apiBase();
    var catUrl =
      base +
      '?op=get-catalog-products&region=' +
      encodeURIComponent(region) +
      '&design_id=' +
      encodeURIComponent(designId);
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
      ctxAllProducts = products;

      ctxEligibleKeys = products
        .map(function (x) {
          return String(x.product_key || '').trim();
        })
        .filter(Boolean);

      var metaExcluded = parseExcludedFromMeta(design.metadata);
      ctxMetaExcludedSnapshot = metaExcluded.slice();

      ctxChecked = {};
      for (var i = 0; i < ctxEligibleKeys.length; i++) {
        var pk = ctxEligibleKeys[i];
        ctxChecked[pk] = metaExcluded.indexOf(pk) === -1;
      }

      ctxInitialExcluded = computeExcludedKeys(ctxEligibleKeys, ctxChecked, ctxMetaExcludedSnapshot);
      ctxPublishedRows = pubData.ok && Array.isArray(pubData.rows) ? pubData.rows : [];
      rebuildPublishedRowMap(ctxPublishedRows);

      syncFilterTabsUi();

      var visible = filteredProducts();
      if (!products.length) {
        if (statusEl) statusEl.textContent = M.designProductsEmpty || 'No products.';
      } else if (!visible.length) {
        if (statusEl) {
          statusEl.textContent =
            ctxFilter === 'active'
              ? M.designProductsEmptyActive || 'No active products.'
              : M.designProductsEmptyQueue || 'No queued products.';
        }
      } else if (statusEl) {
        statusEl.textContent = '';
      }

      renderGrid(visible);
      refreshDirty();
    } catch (e) {
      console.warn('[creator-design-products-modal]', e);
      if (statusEl) statusEl.textContent = M.designProductsLoadError || 'Could not load.';
    }
  }

  async function onConfirmUpdate() {
    var M = Mi();
    var owner = getOwnerId();
    var design = ctxDesign;
    if (!owner || !design || !design.id) return;

    var nextExcluded = computeExcludedKeys(ctxEligibleKeys, ctxChecked, ctxMetaExcludedSnapshot);
    if (arraysEqualJson(nextExcluded, ctxInitialExcluded)) return;

    var shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : window.__SHOPIFY_SHOP_DOMAIN || null;
    var base = apiBase();
    var updateUrl =
      base +
      '?op=update-design&logged_in_customer_id=' +
      encodeURIComponent(owner);
    if (shop) updateUrl += '&shop=' + encodeURIComponent(shop);

    if (btnUpdate) {
      btnUpdate.disabled = true;
      btnUpdate.textContent = M.designProductsUpdating || 'Saving…';
    }

    try {
      var putRes = await fetch(updateUrl, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design_id: design.id,
          metadata: { publish_excluded_product_keys: nextExcluded },
        }),
      });
      var putJson = await putRes.json().catch(function () {
        return {};
      });
      if (!putJson.ok) throw new Error(putJson.error || 'save_failed');

      try {
        design.metadata = Object.assign({}, design.metadata || {}, {
          publish_excluded_product_keys: nextExcluded,
        });
      } catch (_) {}

      var unpublishIds = [];
      var excludedSet = new Set(nextExcluded);
      for (var i = 0; i < ctxPublishedRows.length; i++) {
        var pr = ctxPublishedRows[i];
        if (!pr || pr.id == null) continue;
        var pk = String(pr.product_key || '').trim();
        if (excludedSet.has(pk)) unpublishIds.push(Number(pr.id));
      }

      if (unpublishIds.length) {
        var batchUrl =
          base +
          '?op=batch-unpublish-published&logged_in_customer_id=' +
          encodeURIComponent(owner);
        if (shop) batchUrl += '&shop=' + encodeURIComponent(shop);
        var batchRes = await fetch(batchUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ published_design_ids: unpublishIds }),
        });
        var batchJson = await batchRes.json().catch(function () {
          return {};
        });
        if (!batchJson.ok && !(batchJson.enqueued_ids && batchJson.enqueued_ids.length)) {
          if (statusEl) statusEl.textContent = M.designProductsUnpublishError || '';
        }
      }

      ctxInitialExcluded = nextExcluded.slice();
      // Refresh published rows map after unpublish enqueue so badges stay accurate
      rebuildPublishedRowMap(
        ctxPublishedRows.filter(function (row) {
          return row && !excludedSet.has(String(row.product_key || '').trim());
        })
      );
      ctxPublishedRows = ctxPublishedRows.filter(function (row) {
        return row && !excludedSet.has(String(row.product_key || '').trim());
      });
      syncFilterTabsUi();
      renderGrid(filteredProducts());
      refreshDirty();
      if (typeof window.refreshCreationsDesignProductState === 'function') {
        window.refreshCreationsDesignProductState();
      }
      if (statusEl && !statusEl.textContent) {
        statusEl.textContent = M.designProductsSaved || 'Saved.';
      }
    } catch (err) {
      console.warn('[creator-design-products-modal] save', err);
      if (statusEl) statusEl.textContent = M.designProductsSaveError || 'Could not save.';
    } finally {
      if (btnUpdate) {
        btnUpdate.textContent = M.designProductsUpdate || 'Update';
        refreshDirty();
      }
    }
  }

  /**
   * Mount / refresh products UI inside Design Preview products panel.
   * @param {{ host: Element, design: object }} opts
   */
  function mountPanel(opts) {
    var root = opts && opts.host;
    var design = opts && opts.design;
    if (!root || !design || !design.id) return;
    bindHostOnce(root);
    cacheHostRefs(root);
    applyStaticLabels();
    ctxDesign = design;
    ctxEligibleKeys = [];
    ctxChecked = {};
    ctxInitialExcluded = [];
    ctxPublishedRows = [];
    ctxPubRowByKey = {};
    ctxAllProducts = [];
    ctxFilter = resolveLibraryStatus(design) === 'active' ? 'queue' : 'all';
    if (gridEl) gridEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    syncFilterTabsUi();
    loadAndRender(design);
  }

  function unmountPanel() {
    resetPanelState();
  }

  window.CreatorDesignProductsPanel = {
    mount: mountPanel,
    unmount: unmountPanel,
    isMounted: function () {
      return !!ctxDesign;
    },
  };

  /**
   * Legacy entry: open Design Preview on Products screen (standalone overlay removed).
   */
  window.openCreatorDesignProductsModal = function (opts) {
    var design = opts && opts.design;
    if (!design || !design.id) return;
    var api = window.CreatorDesignPreviewModal;
    if (api && typeof api.open === 'function') {
      api.open(design, { screen: 'products' });
      return;
    }
    console.warn('[creator-design-products-modal] CreatorDesignPreviewModal.open unavailable');
  };

  window.closeCreatorDesignProductsModal = function () {
    var api = window.CreatorDesignPreviewModal;
    if (api && typeof api.close === 'function') api.close();
  };
})();
