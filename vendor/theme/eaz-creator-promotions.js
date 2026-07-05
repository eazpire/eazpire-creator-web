/**
 * Creator Marketing – Promotions tab (grid, sidebar form modal, integrated product picker).
 * Uses creator-dispatch ops: list-promotions, save-promotion, delete-promotion, list-products-for-promotion.
 */
(function () {
  'use strict';

  var I = function () {
    return (window.CreatorI18n && window.CreatorI18n.promotions) || {};
  };

  var ICON_SETTINGS =
    '<svg class="eaz-promo-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
    '</svg>';

  var ICON_PRODUCTS =
    '<svg class="eaz-promo-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' +
    '</svg>';

  function ownerId() {
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID);
    var dbg = document.querySelector('[data-debug-owner]');
    if (dbg && dbg.dataset && dbg.dataset.debugOwner) {
      try {
        var p = JSON.parse(dbg.dataset.debugOwner);
        if (p) return String(p);
      } catch (_e) {}
    }
    return '';
  }

  function apiBase() {
    return (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) || 'https://creator-engine.eazpire.workers.dev';
  }

  function getOp(op, params) {
    if (typeof window.creatorApiFetch === 'function') {
      return window.creatorApiFetch(op, params || {});
    }
    var url = new URL(apiBase() + '/apps/creator-dispatch');
    url.searchParams.set('op', op);
    url.searchParams.set('_t', String(Date.now()));
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] != null && params[k] !== '') url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.json(); });
  }

  function postJsonOp(op, body) {
    var payload = Object.assign({}, body || {});
    payload.op = op;
    if (typeof window.creatorApiFetch === 'function') {
      return window.creatorApiFetch(op, {}, {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function (err) {
        if (err && err.body && typeof err.body === 'object') return err.body;
        throw err;
      });
    }
    var base = String(apiBase() || '').replace(/\/+$/, '') || 'https://creator-engine.eazpire.workers.dev';
    var url = new URL(base + '/apps/creator-dispatch');
    url.searchParams.set('op', op);
    url.searchParams.set('_t', String(Date.now()));
    return fetch(url.toString(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  var state = {
    list: [],
    promotionSubTab: 'active',
    loading: false,
    editId: null,
    editPromo: null,
    formOpen: false,
    formSection: 'settings',
    sidebarOpen: false,
    draftProducts: [],
    draftProductMeta: {},
    pickerAvailable: [],
    pickerFiltered: [],
    pickerSelectedIds: {},
    pickerRemoveIds: {},
    pickerTab: 'available',
    pickerSearch: '',
    promoDesignFilters: {},
    promoProductFilters: {},
    productsLoading: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var a = arguments;
      t = setTimeout(function () { fn.apply(null, a); }, ms);
    };
  }

  function toDatetimeLocalValue(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) d = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function defaultEndMs(startMs) {
    return startMs + 7 * 86400000;
  }

  function showSheet(modal, back) {
    if (!modal || !back) return;
    back.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        back.classList.add('is-open');
        modal.classList.add('is-open');
      });
    });
  }

  function hideSheet(modal, back, onDone) {
    if (!modal || !back) return;
    back.classList.remove('is-open');
    modal.classList.remove('is-open');
    setTimeout(function () {
      modal.hidden = true;
      back.hidden = true;
      if (typeof onDone === 'function') onDone();
    }, 340);
  }

  function fmtDiscount(p) {
    if (!p) return '';
    if (p.discount_type === 'fixed_usd' || p.discount_type === 'fixed') {
      var t = I().discount_summary_fixed || '${{ value }} off';
      return t.replace(/\{\{\s*value\s*\}\}/g, String(p.discount_value != null ? p.discount_value : ''));
    }
    var tp = I().discount_summary_percent || '{{ value }}% off';
    return tp.replace(/\{\{\s*value\s*\}\}/g, String(p.discount_value != null ? p.discount_value : ''));
  }

  function fmtDateShort(ms) {
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function promotionStatus(p) {
    var now = Date.now();
    var s = p && p.starts_at != null ? Number(p.starts_at) : NaN;
    var e = p && p.ends_at != null ? Number(p.ends_at) : NaN;
    if (!Number.isFinite(s) || !Number.isFinite(e)) return 'unknown';
    if (s > e) return 'unknown';
    if (now < s) return 'upcoming';
    if (now > e) return 'ended';
    return 'active';
  }

  function filterPromotionsByTab(list, tab) {
    if (tab === 'all') return list.slice();
    return list.filter(function (p) {
      return promotionStatus(p) === tab;
    });
  }

  function statusLabel(st) {
    var m = I();
    if (st === 'active') return m.status_active || 'Active';
    if (st === 'upcoming') return m.status_upcoming || 'Upcoming';
    if (st === 'ended') return m.status_ended || 'Ended';
    return m.status_unknown || '—';
  }

  function periodLinesHtml(p) {
    var s = p && p.starts_at != null ? Number(p.starts_at) : NaN;
    var e = p && p.ends_at != null ? Number(p.ends_at) : NaN;
    if (!Number.isFinite(s) || !Number.isFinite(e)) return '';
    var startStr = fmtDateShort(s);
    var endStr = fmtDateShort(e);
    var rangeTpl = I().period_range || '{{ start }} – {{ end }}';
    var rangeLine = rangeTpl
      .replace(/\{\{\s*start\s*\}\}/g, startStr)
      .replace(/\{\{\s*end\s*\}\}/g, endStr);
    var days = Math.max(1, Math.ceil((e - s) / 86400000));
    var daysTpl = I().period_days || '{{ count }} days';
    var daysLine = daysTpl.replace(/\{\{\s*count\s*\}\}/g, String(days));
    return (
      '<span class="eaz-creator-promotions-card__meta">' +
      escapeHtml(rangeLine) +
      '</span><span class="eaz-creator-promotions-card__submeta">' +
      escapeHtml(daysLine) +
      '</span>'
    );
  }

  function syncSubTabUi() {
    var root = $('eazCreatorPromotionsSubTabs');
    if (!root) return;
    var tab = state.promotionSubTab || 'active';
    root.querySelectorAll('[data-promo-tab]').forEach(function (btn) {
      var id = btn.getAttribute('data-promo-tab');
      var on = id === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderGrid() {
    var grid = $('eazCreatorPromotionsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    syncSubTabUi();

    var filtered = filterPromotionsByTab(state.list, state.promotionSubTab || 'active');
    var tabEmpty = $('eazCreatorPromotionsTabEmpty');
    if (tabEmpty) {
      var showTabHint = state.list.length > 0 && filtered.length === 0;
      tabEmpty.hidden = !showTabHint;
      if (showTabHint) tabEmpty.textContent = I().tab_empty_filtered || '';
    }

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'eaz-creator-promotions-card eaz-creator-promotions-card--placeholder';
    add.innerHTML =
      '<span class="eaz-creator-promotions-card__plus">+</span><span class="eaz-creator-promotions-card__ptitle">' +
      (I().new_promotion || 'New') +
      '</span><span class="eaz-creator-promotions-card__sub">' +
      (I().placeholder_hint || '') +
      '</span>';
    add.addEventListener('click', function () { openForm(null); });
    grid.appendChild(add);

    filtered.forEach(function (p) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'eaz-creator-promotions-card';
      var st = promotionStatus(p);
      var statusClass =
        st === 'active'
          ? 'eaz-creator-promotions-card__status--active'
          : st === 'upcoming'
            ? 'eaz-creator-promotions-card__status--upcoming'
            : st === 'ended'
              ? 'eaz-creator-promotions-card__status--ended'
              : 'eaz-creator-promotions-card__status--unknown';
      card.innerHTML =
        '<span class="eaz-creator-promotions-card__status ' +
        statusClass +
        '">' +
        escapeHtml(statusLabel(st)) +
        '</span>' +
        '<span class="eaz-creator-promotions-card__title">' +
        escapeHtml(p.name || '') +
        '</span>' +
        '<span class="eaz-creator-promotions-card__badge">' +
        escapeHtml(fmtDiscount(p)) +
        '</span>' +
        periodLinesHtml(p);
      card.addEventListener('click', function () { openForm(p); });
      grid.appendChild(card);
    });
  }

  function setLoading(on) {
    state.loading = on;
    var ld = $('eazCreatorPromotionsLoading');
    if (ld) {
      ld.hidden = !on;
      if (!on) ld.style.display = 'none';
      else ld.style.display = '';
    }
  }

  function showError(msg) {
    var e = $('eazCreatorPromotionsError');
    if (e) {
      e.textContent = msg || '';
      e.hidden = !msg;
    }
  }

  function loadList() {
    var oid = ownerId();
    if (!oid) {
      setLoading(false);
      showError(I().load_error || 'Login required');
      return;
    }
    setLoading(true);
    showError('');
    getOp('list-promotions', { owner_id: oid })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.promotions)) {
          state.list = data.promotions;
        } else {
          state.list = [];
          if (data && data.ok === false && data.error) showError(String(data.error));
        }
        var empty = $('eazCreatorPromotionsEmpty');
        if (empty) empty.hidden = state.list.length > 0;
        renderGrid();
      })
      .catch(function () {
        state.list = [];
        renderGrid();
        showError(I().load_error || 'Error');
      })
      .finally(function () { setLoading(false); });
  }

  function normalizeProducts(arr) {
    return (arr || []).map(function (p) {
      var img = '';
      if (p.image && typeof p.image === 'string') img = p.image;
      else if (p.image_url && typeof p.image_url === 'string') img = p.image_url;
      else if (p.featured_image) img = p.featured_image.src || p.featured_image;
      else if (p.images && p.images[0]) img = p.images[0].src || '';
      return {
        id: String(p.id),
        title: p.title || p.product_name || p.product_key || String(p.id),
        handle: p.handle || p.shopify_handle || '',
        image: img,
        product_key: p.product_key || '',
        product_name: p.product_name || p.title || '',
        metadata: p.metadata || null
      };
    });
  }

  function fetchProductsFallback() {
    return fetch('/collections/all/products.json?limit=250', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        return normalizeProducts((data && data.products) ? data.products : []);
      })
      .catch(function () { return []; });
  }

  function loadPickerProducts() {
    var oid = ownerId();
    var params = { owner_id: oid, q: state.pickerSearch || '' };
    if (state.editId) params.promotion_id = state.editId;

    return getOp('list-products-for-promotion', params)
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.products)) {
          var products = normalizeProducts(data.products);
          if (products.length) return products;
          return fetchProductsFallback();
        }
        return fetchProductsFallback();
      })
      .catch(function () {
        return fetchProductsFallback();
      });
  }

  function countActiveFilters() {
    var n = 0;
    function countObj(obj) {
      Object.keys(obj || {}).forEach(function (k) {
        var v = obj[k];
        if (Array.isArray(v) && v.length) n += v.length;
        else if (v != null && String(v).trim() !== '') n += 1;
      });
    }
    countObj(state.promoDesignFilters);
    countObj(state.promoProductFilters);
    return n;
  }

  function updateFilterBadge() {
    var badge = $('eazPromoProductsFilterBadge');
    if (!badge) return;
    var n = countActiveFilters();
    badge.textContent = n > 0 ? String(n) : '';
    badge.hidden = n <= 0;
  }

  function productMatchesPromoFilters(p) {
    var q = (state.pickerSearch || '').trim().toLowerCase();
    if (q) {
      var hay = ((p.title || '') + ' ' + (p.handle || '') + ' ' + (p.product_name || '') + ' ' + (p.product_key || '')).toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }

    if (typeof window.matchesProductFilter === 'function' && state.promoProductFilters && Object.keys(state.promoProductFilters).length) {
      if (!window.matchesProductFilter(p, state.promoProductFilters)) return false;
    }

    if (typeof window.matchesDesignFilter === 'function' && state.promoDesignFilters && Object.keys(state.promoDesignFilters).length) {
      var designLike = {
        metadata: p.metadata || {},
        creator_name: p.creator_name || (p.metadata && p.metadata.creator_name) || '',
        source: p.source || '',
        design_source: p.design_source || ''
      };
      if (!window.matchesDesignFilter(designLike, state.promoDesignFilters)) return false;
    }

    return true;
  }

  function applyProductFilters() {
    state.pickerFiltered = state.pickerAvailable.filter(function (p) {
      var id = String(p.id);
      if (state.draftProducts.indexOf(id) >= 0) return false;
      return productMatchesPromoFilters(p);
    });
  }

  function selectedAvailableCount() {
    var n = 0;
    Object.keys(state.pickerSelectedIds).forEach(function (id) {
      if (state.pickerSelectedIds[id]) n += 1;
    });
    return n;
  }

  function selectedRemoveCount() {
    var n = 0;
    Object.keys(state.pickerRemoveIds).forEach(function (id) {
      if (state.pickerRemoveIds[id]) n += 1;
    });
    return n;
  }

  function renderProductsGrid() {
    var grid = $('eazPromoProductsGrid');
    var empty = $('eazPromoProductsEmpty');
    var subFoot = $('eazPromoProductsSubFoot');
    if (!grid) return;

    grid.innerHTML = '';
    var tab = state.pickerTab;

    if (tab === 'picked') {
      if (state.draftProducts.length === 0) {
        if (empty) {
          empty.hidden = false;
          empty.textContent = I().products_empty || 'No products selected yet.';
        }
        if (subFoot) subFoot.hidden = true;
        return;
      }
      if (empty) empty.hidden = true;

      state.draftProducts.forEach(function (id) {
        var meta = state.draftProductMeta[id] || { title: id, image: '' };
        var checked = !!state.pickerRemoveIds[id];
        var card = document.createElement('label');
        card.className = 'eaz-promo-product-card' + (checked ? ' is-selected' : '');
        card.innerHTML =
          '<input type="checkbox" class="eaz-promo-product-card__check" data-pid="' + escapeHtml(id) + '"' + (checked ? ' checked' : '') + ' />' +
          (meta.image
            ? '<img src="' + escapeHtml(meta.image) + '" alt="" class="eaz-promo-product-card__img" loading="lazy" />'
            : '<span class="eaz-promo-product-card__ph"></span>') +
          '<span class="eaz-promo-product-card__title">' + escapeHtml(meta.title || id) + '</span>';
        var cb = card.querySelector('input');
        cb.addEventListener('change', function () {
          state.pickerRemoveIds[id] = cb.checked;
          card.classList.toggle('is-selected', cb.checked);
          updateProductsSubFooter();
        });
        grid.appendChild(card);
      });

      updateProductsSubFooter();
      return;
    }

    if (state.productsLoading) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = (window.CreatorI18n && window.CreatorI18n.common && window.CreatorI18n.common.loading) || 'Loading…';
      }
      if (subFoot) subFoot.hidden = true;
      return;
    }

    if (!state.pickerFiltered.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = I().products_no_results || I().products_empty || 'No products.';
      }
      if (subFoot) subFoot.hidden = selectedAvailableCount() <= 0;
      updateProductsSubFooter();
      return;
    }

    if (empty) empty.hidden = true;

    state.pickerFiltered.forEach(function (pr) {
      var id = String(pr.id);
      var checked = !!state.pickerSelectedIds[id];
      var card = document.createElement('label');
      card.className = 'eaz-promo-product-card' + (checked ? ' is-selected' : '');
      card.innerHTML =
        '<input type="checkbox" class="eaz-promo-product-card__check" data-pid="' + escapeHtml(id) + '"' + (checked ? ' checked' : '') + ' />' +
        (pr.image
          ? '<img src="' + escapeHtml(pr.image) + '" alt="" class="eaz-promo-product-card__img" loading="lazy" />'
          : '<span class="eaz-promo-product-card__ph"></span>') +
        '<span class="eaz-promo-product-card__title">' + escapeHtml(pr.title || id) + '</span>';
      var cb = card.querySelector('input');
      cb.addEventListener('change', function () {
        state.pickerSelectedIds[id] = cb.checked;
        card.classList.toggle('is-selected', cb.checked);
        updateProductsSubFooter();
      });
      grid.appendChild(card);
    });

    updateProductsSubFooter();
  }

  function updateProductsSubFooter() {
    var subFoot = $('eazPromoProductsSubFoot');
    var selAll = $('eazPromoProductsSelAll');
    var deselAll = $('eazPromoProductsDeselAll');
    var action = $('eazPromoProductsSubAction');
    if (!subFoot) return;

    var isAvailable = state.pickerTab === 'available';
    var count = isAvailable ? selectedAvailableCount() : selectedRemoveCount();
    subFoot.hidden = count <= 0;

    if (selAll) selAll.textContent = I().select_all_list || 'Select all';
    if (deselAll) deselAll.textContent = I().deselect_all || I().clear_selection || 'Deselect all';
    if (action) {
      action.textContent = isAvailable ? (I().add_selected || 'Add') : (I().remove_selected || 'Remove');
      action.classList.toggle('eaz-creator-promotions-btn--danger', !isAvailable);
    }
  }

  function refreshAvailableProducts() {
    state.productsLoading = true;
    renderProductsGrid();
    loadPickerProducts().then(function (products) {
      state.pickerAvailable = products;
      applyProductFilters();
      state.productsLoading = false;
      renderProductsGrid();
    });
  }

  function addSelectedToDraft() {
    state.pickerFiltered.forEach(function (pr) {
      var id = String(pr.id);
      if (!state.pickerSelectedIds[id]) return;
      state.draftProductMeta[id] = { title: pr.title || id, image: pr.image || '' };
      if (state.draftProducts.indexOf(id) < 0) state.draftProducts.push(id);
    });
    state.pickerSelectedIds = {};
    applyProductFilters();
    renderProductsGrid();
    updateFormValidation();
    updateNavBadges();
  }

  function removeSelectedFromDraft() {
    var remove = Object.keys(state.pickerRemoveIds).filter(function (id) { return state.pickerRemoveIds[id]; });
    if (!remove.length) return;
    state.draftProducts = state.draftProducts.filter(function (id) {
      return remove.indexOf(String(id)) < 0;
    });
    remove.forEach(function (id) {
      delete state.draftProductMeta[id];
      delete state.pickerRemoveIds[id];
    });
    applyProductFilters();
    renderProductsGrid();
    updateFormValidation();
    updateNavBadges();
  }

  function selectAllVisibleProducts() {
    if (state.pickerTab === 'available') {
      state.pickerFiltered.forEach(function (pr) {
        state.pickerSelectedIds[String(pr.id)] = true;
      });
    } else {
      state.draftProducts.forEach(function (id) {
        state.pickerRemoveIds[id] = true;
      });
    }
    renderProductsGrid();
  }

  function deselectAllVisibleProducts() {
    if (state.pickerTab === 'available') {
      state.pickerSelectedIds = {};
    } else {
      state.pickerRemoveIds = {};
    }
    renderProductsGrid();
  }

  function updateNavBadges() {
    var badge = $('eazPromoNavProductsBadge');
    if (badge) {
      var n = state.draftProducts.length;
      badge.textContent = n > 0 ? String(n) : '';
      badge.hidden = n <= 0;
    }
  }

  function setFormSection(section) {
    state.formSection = section === 'products' ? 'products' : 'settings';
    var layout = $('eazPromoFormLayout');
    if (layout) {
      layout.querySelectorAll('[data-promo-section]').forEach(function (btn) {
        var on = btn.getAttribute('data-promo-section') === state.formSection;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-current', on ? 'page' : 'false');
      });
      layout.querySelectorAll('[data-promo-panel]').forEach(function (panel) {
        panel.classList.toggle('is-active', panel.getAttribute('data-promo-panel') === state.formSection);
      });
    }
    if (state.formSection === 'products' && !state.pickerAvailable.length && !state.productsLoading) {
      refreshAvailableProducts();
    }
    if (state.formSection === 'products') {
      renderProductsGrid();
    }
    closeSidebar();
  }

  function openSidebar() {
    state.sidebarOpen = true;
    var layout = $('eazPromoFormLayout');
    var toggle = $('eazPromoSidebarToggle');
    if (layout) layout.classList.add('is-sidebar-open');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', I().sidebar_close || 'Close menu');
    }
  }

  function closeSidebar() {
    state.sidebarOpen = false;
    var layout = $('eazPromoFormLayout');
    var toggle = $('eazPromoSidebarToggle');
    if (layout) layout.classList.remove('is-sidebar-open');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', I().sidebar_open || 'Open menu');
    }
  }

  function toggleSidebar() {
    if (state.sidebarOpen) closeSidebar();
    else openSidebar();
  }

  function readFormValues() {
    var name = ($('eazPromoFieldName') && $('eazPromoFieldName').value) || '';
    var desc = ($('eazPromoFieldDesc') && $('eazPromoFieldDesc').value) || '';
    var dtype = ($('eazPromoFieldDiscountType') && $('eazPromoFieldDiscountType').value) || 'percent';
    var dval = parseFloat(($('eazPromoFieldDiscountVal') && $('eazPromoFieldDiscountVal').value) || '', 10);
    var startEl = $('eazPromoFieldStart');
    var endEl = $('eazPromoFieldEnd');
    var startsAt = startEl && startEl.value ? new Date(startEl.value).getTime() : Date.now();
    var endsAt = endEl && endEl.value ? new Date(endEl.value).getTime() : defaultEndMs(startsAt);
    return { name: name, desc: desc, dtype: dtype, dval: dval, startsAt: startsAt, endsAt: endsAt };
  }

  function isFormValid() {
    var v = readFormValues();
    if (!v.name.trim()) return false;
    if (!Number.isFinite(v.dval) || v.dval <= 0) return false;
    if (v.dtype === 'percent' && v.dval > 100) return false;
    if (!Number.isFinite(v.startsAt) || !Number.isFinite(v.endsAt) || v.endsAt <= v.startsAt) return false;
    if (!state.draftProducts.length) return false;
    return true;
  }

  function getLivePromotionStatus() {
    var v = readFormValues();
    var now = Date.now();
    if (!Number.isFinite(v.startsAt) || !Number.isFinite(v.endsAt)) return 'unknown';
    if (v.startsAt > now) return 'upcoming';
    if (v.endsAt <= now) return 'ended';
    return 'active';
  }

  function updatePrimaryButton() {
    var btn = $('eazPromoFormSave');
    if (!btn) return;
    var st = getLivePromotionStatus();
    var isActive = st === 'active';
    btn.textContent = isActive ? (I().end_promotion || 'End promotion') : (I().start_promotion || 'Start promotion');
    btn.classList.toggle('eaz-creator-promotions-btn--danger', isActive);
    btn.disabled = !isFormValid();
  }

  function updateFormValidation() {
    updatePrimaryButton();
  }

  function enrichDraftProductMeta(promo) {
    if (!promo || !promo.id || !state.draftProducts.length) return;
    getOp('list-products-for-promotion', { owner_id: ownerId(), promotion_id: promo.id })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.products)) {
          data.products.forEach(function (p) {
            var id = String(p.id);
            if (state.draftProducts.indexOf(id) >= 0) {
              state.draftProductMeta[id] = {
                title: p.title || id,
                image: p.image || ''
              };
            }
          });
          if (state.formSection === 'products') renderProductsGrid();
          updateNavBadges();
        }
      })
      .catch(function () {});
  }

  function bindFormFieldListeners() {
    ['eazPromoFieldName', 'eazPromoFieldDesc', 'eazPromoFieldDiscountType', 'eazPromoFieldDiscountVal', 'eazPromoFieldStart', 'eazPromoFieldEnd'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', updateFormValidation);
      el.addEventListener('change', updateFormValidation);
    });

    var sel = $('eazPromoFieldDiscountType');
    function syncUsdHint() {
      var hint = $('eazPromoUsdHint');
      var s = $('eazPromoFieldDiscountType');
      if (!hint || !s) return;
      hint.hidden = s.value !== 'fixed_usd';
    }
    syncUsdHint();
    if (sel) sel.addEventListener('change', syncUsdHint);

    var search = $('eazPromoProductsSearch');
    if (search) {
      search.addEventListener('input', debounce(function () {
        state.pickerSearch = search.value || '';
        applyProductFilters();
        renderProductsGrid();
      }, 250));
    }

    var filterBtn = $('eazPromoProductsFilter');
    if (filterBtn) {
      filterBtn.addEventListener('click', function () {
        if (typeof window.openFilterModal === 'function') {
          window.openFilterModal({ source: 'products' });
        }
      });
    }

    var body = $('eazPromoFormBody');
    if (body) {
      body.querySelectorAll('[data-promo-section]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setFormSection(btn.getAttribute('data-promo-section'));
        });
      });
      body.querySelectorAll('[data-ptab]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.pickerTab = btn.getAttribute('data-ptab') === 'picked' ? 'picked' : 'available';
          body.querySelectorAll('[data-ptab]').forEach(function (t) {
            t.classList.toggle('is-active', t.getAttribute('data-ptab') === (state.pickerTab === 'picked' ? 'picked' : 'available'));
          });
          renderProductsGrid();
        });
      });
    }

    var selAll = $('eazPromoProductsSelAll');
    var deselAll = $('eazPromoProductsDeselAll');
    var subAction = $('eazPromoProductsSubAction');
    if (selAll) selAll.addEventListener('click', selectAllVisibleProducts);
    if (deselAll) deselAll.addEventListener('click', deselectAllVisibleProducts);
    if (subAction) {
      subAction.addEventListener('click', function () {
        if (state.pickerTab === 'available') addSelectedToDraft();
        else removeSelectedFromDraft();
      });
    }

    var del = $('eazPromoDelete');
    if (del) {
      del.addEventListener('click', function () {
        if (!confirm(I().delete_confirm || 'Delete?')) return;
        postJsonOp('delete-promotion', { owner_id: ownerId(), promotion_id: state.editId })
          .then(function (d) {
            if (d && d.ok) {
              closeForm();
              loadList();
            } else {
              alert((d && d.error) || 'Error');
            }
          })
          .catch(function () { alert('Error'); });
      });
    }

    var backdrop = $('eazPromoSidebarBackdrop');
    if (backdrop) backdrop.addEventListener('click', closeSidebar);
  }

  function openForm(promo) {
    state.editId = promo && promo.id ? promo.id : null;
    state.editPromo = promo || null;
    state.formOpen = true;
    state.formSection = 'settings';
    state.sidebarOpen = false;
    state.draftProducts = promo && promo.product_ids ? promo.product_ids.map(String) : [];
    state.draftProductMeta = {};
    state.draftProducts.forEach(function (id) {
      state.draftProductMeta[id] = { title: id, image: '' };
    });
    state.pickerAvailable = [];
    state.pickerFiltered = [];
    state.pickerSelectedIds = {};
    state.pickerRemoveIds = {};
    state.pickerTab = 'available';
    state.pickerSearch = '';
    state.promoDesignFilters = {};
    state.promoProductFilters = {};
    state.productsLoading = false;

    var modal = $('eazCreatorPromotionsFormModal');
    var back = $('eazCreatorPromotionsFormBackdrop');
    var title = $('eazPromoFormTitle');
    var body = $('eazPromoFormBody');
    if (!modal || !body) return;

    if (title) title.textContent = state.editId ? (I().modal_title_edit || 'Edit') : (I().modal_title_new || 'New');

    var dt = promo && promo.discount_type ? promo.discount_type : 'percent';
    var dv = promo && promo.discount_value != null ? promo.discount_value : '';
    var name = promo && promo.name ? promo.name : '';
    var desc = promo && promo.description ? promo.description : '';

    var now = Date.now();
    var startMs = promo && promo.starts_at ? Number(promo.starts_at) : now;
    var endMs = promo && promo.ends_at ? Number(promo.ends_at) : defaultEndMs(startMs);
    if (endMs <= startMs) endMs = defaultEndMs(startMs);

    body.innerHTML =
      '<div class="eaz-promo-form-layout" id="eazPromoFormLayout">' +
      '<div class="eaz-promo-sidebar-backdrop" id="eazPromoSidebarBackdrop" aria-hidden="true"></div>' +
      '<aside class="eaz-promo-sidebar" id="eazPromoSidebar" aria-label="' + escapeHtml(I().nav_settings || 'Navigation') + '">' +
      '<nav class="eaz-promo-nav">' +
      '<button type="button" class="eaz-promo-nav__item is-active" data-promo-section="settings">' +
      ICON_SETTINGS + '<span>' + escapeHtml(I().nav_settings || 'Settings') + '</span></button>' +
      '<button type="button" class="eaz-promo-nav__item" data-promo-section="products">' +
      ICON_PRODUCTS + '<span>' + escapeHtml(I().nav_products || 'Products') + '</span>' +
      '<span class="eaz-promo-nav__badge" id="eazPromoNavProductsBadge" hidden></span></button>' +
      '</nav></aside>' +
      '<div class="eaz-promo-content">' +
      '<div class="eaz-promo-panel is-active" data-promo-panel="settings" id="eazPromoPanelSettings">' +
      '<div class="eaz-creator-promotions-field"><label>' + escapeHtml(I().name || 'Name') + '</label>' +
      '<input type="text" id="eazPromoFieldName" class="eaz-creator-promotions-input" value="' + escapeHtml(name) + '" /></div>' +
      '<div class="eaz-creator-promotions-field"><label>' + escapeHtml(I().description || '') + '</label>' +
      '<textarea id="eazPromoFieldDesc" class="eaz-creator-promotions-input" rows="2">' + escapeHtml(desc) + '</textarea></div>' +
      '<div class="eaz-creator-promotions-row--type-value">' +
      '<div class="eaz-creator-promotions-field eaz-creator-promotions-field--type"><label>' + escapeHtml(I().discount_type || '') + '</label>' +
      '<select id="eazPromoFieldDiscountType" class="eaz-creator-promotions-input">' +
      '<option value="percent">' + escapeHtml(I().discount_percent || '%') + '</option>' +
      '<option value="fixed_usd">' + escapeHtml(I().discount_fixed_usd || 'USD') + '</option></select></div>' +
      '<div class="eaz-creator-promotions-field eaz-creator-promotions-field--value"><label>' + escapeHtml(I().discount_value || '') + '</label>' +
      '<input type="number" id="eazPromoFieldDiscountVal" class="eaz-creator-promotions-input" step="any" min="0" value="' + escapeHtml(String(dv)) + '" /></div></div>' +
      '<p class="eaz-creator-promotions-hint" id="eazPromoUsdHint" hidden>' + escapeHtml(I().discount_value_usd_hint || '') + '</p>' +
      '<div class="eaz-creator-promotions-row--dates">' +
      '<div class="eaz-creator-promotions-field"><label>' + escapeHtml(I().date_start || 'Start') + '</label>' +
      '<input type="datetime-local" id="eazPromoFieldStart" class="eaz-creator-promotions-input" value="' + escapeHtml(toDatetimeLocalValue(startMs)) + '" /></div>' +
      '<div class="eaz-creator-promotions-field"><label>' + escapeHtml(I().date_end || 'End') + '</label>' +
      '<input type="datetime-local" id="eazPromoFieldEnd" class="eaz-creator-promotions-input" value="' + escapeHtml(toDatetimeLocalValue(endMs)) + '" /></div></div>' +
      '<p class="eaz-creator-promotions-hint">' + escapeHtml(I().duration_hint || '') + '</p>' +
      (state.editId ? '<button type="button" class="eaz-creator-promotions-btn eaz-creator-promotions-btn--danger" id="eazPromoDelete">' + escapeHtml(I().delete || 'Delete') + '</button>' : '') +
      '</div>' +
      '<div class="eaz-promo-panel" data-promo-panel="products" id="eazPromoPanelProducts">' +
      '<div class="eaz-promo-products-tabs">' +
      '<button type="button" class="eaz-creator-promotions-tab is-active" data-ptab="available">' + escapeHtml(I().tab_available || 'Available') + '</button>' +
      '<button type="button" class="eaz-creator-promotions-tab" data-ptab="picked">' + escapeHtml(I().tab_picked || 'Selected') + '</button></div>' +
      '<div class="eaz-promo-products-toolbar">' +
      '<input type="search" id="eazPromoProductsSearch" class="eaz-creator-promotions-input eaz-promo-products-search" placeholder="' + escapeHtml(I().search_products || 'Search products') + '" aria-label="' + escapeHtml(I().search_products || 'Search') + '" />' +
      '<button type="button" class="creator-creations-filter-btn creator-creations-filter-btn--has-badge eaz-promo-products-filter" id="eazPromoProductsFilter" aria-label="' + escapeHtml(I().filter_badge_aria || 'Filter') + '">' +
      '<span class="creator-creations-filter-btn__rail" aria-hidden="true"></span>' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>' +
      '<span class="creator-creations-filter-badge" id="eazPromoProductsFilterBadge" aria-hidden="true"></span></button></div>' +
      '<p class="eaz-promo-products-empty" id="eazPromoProductsEmpty" hidden></p>' +
      '<div class="eaz-promo-products-grid" id="eazPromoProductsGrid"></div>' +
      '<footer class="eaz-promo-products-subfoot" id="eazPromoProductsSubFoot" hidden>' +
      '<div class="eaz-promo-products-subfoot__actions">' +
      '<button type="button" class="eaz-creator-promotions-btn eaz-creator-promotions-btn--ghost" id="eazPromoProductsSelAll"></button>' +
      '<button type="button" class="eaz-creator-promotions-btn eaz-creator-promotions-btn--ghost" id="eazPromoProductsDeselAll"></button>' +
      '<button type="button" class="eaz-creator-promotions-btn eaz-creator-promotions-btn--primary" id="eazPromoProductsSubAction"></button>' +
      '</div></footer></div></div></div>';

    var sel = $('eazPromoFieldDiscountType');
    if (sel) sel.value = dt === 'fixed_usd' || dt === 'fixed' ? 'fixed_usd' : 'percent';

    bindFormFieldListeners();
    updateNavBadges();
    updateFilterBadge();
    updateFormValidation();

    if (promo && promo.id && state.draftProducts.length) enrichDraftProductMeta(promo);

    showSheet(modal, back);
  }

  function closeForm() {
    state.formOpen = false;
    closeSidebar();
    hideSheet($('eazCreatorPromotionsFormModal'), $('eazCreatorPromotionsFormBackdrop'));
  }

  function saveForm(endNow) {
    if (!isFormValid()) {
      alert(I().validation_incomplete || 'Please complete all required fields.');
      return;
    }

    var v = readFormValues();
    if (endNow) {
      if (!confirm(I().end_promotion_confirm || 'End this promotion now?')) return;
      v.endsAt = Date.now();
      if (v.endsAt <= v.startsAt) {
        alert(I().date_range_invalid || 'Invalid dates');
        return;
      }
    } else if (v.endsAt <= v.startsAt) {
      alert(I().date_range_invalid || 'End must be after start');
      return;
    }

    var durationDays = Math.max(1, Math.ceil((v.endsAt - v.startsAt) / 86400000));
    var body = {
      owner_id: ownerId(),
      name: v.name.trim(),
      description: v.desc.trim(),
      discount_type: v.dtype,
      discount_value: v.dval,
      duration_days: durationDays,
      starts_at: v.startsAt,
      ends_at: v.endsAt,
      product_ids: state.draftProducts.map(String)
    };
    if (state.editId) body.id = state.editId;

    var btn = $('eazPromoFormSave');
    if (btn) btn.disabled = true;

    postJsonOp('save-promotion', body)
      .then(function (d) {
        if (d && d.ok) {
          closeForm();
          loadList();
        } else {
          alert((d && d.error) || (I().save_error || 'Error'));
          updateFormValidation();
        }
      })
      .catch(function () {
        alert(I().save_error || 'Error');
        updateFormValidation();
      });
  }

  function onPrimaryAction() {
    if (getLivePromotionStatus() === 'active') saveForm(true);
    else saveForm(false);
  }

  function onFilterApplied(e) {
    if (!state.formOpen) return;
    var detail = (e && e.detail) || {};
    state.promoDesignFilters = detail.designFilters || {};
    state.promoProductFilters = detail.productFilters || detail.filters || {};
    if (detail.source === 'products' && detail.filters && !detail.productFilters) {
      state.promoProductFilters = detail.filters;
    }
    updateFilterBadge();
    applyProductFilters();
    renderProductsGrid();
  }

  function bindChrome() {
    var fb = $('eazCreatorPromotionsFormBackdrop');
    var fc = $('eazPromoFormClose');
    var fca = $('eazPromoFormCancel');
    var fs = $('eazPromoFormSave');
    var sidebarToggle = $('eazPromoSidebarToggle');
    if (fb) fb.addEventListener('click', closeForm);
    if (fc) fc.addEventListener('click', closeForm);
    if (fca) fca.addEventListener('click', closeForm);
    if (fs) fs.addEventListener('click', onPrimaryAction);
    if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);

    var subRoot = $('eazCreatorPromotionsSubTabs');
    if (subRoot) {
      subRoot.querySelectorAll('[data-promo-tab]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-promo-tab');
          if (!id) return;
          state.promotionSubTab = id;
          renderGrid();
        });
      });
    }

    window.addEventListener('creator-filter-applied', onFilterApplied);
  }

  function init() {
    if (!$('eazCreatorPromotionsRoot')) return;
    bindChrome();
    loadList();
  }

  window.EazCreatorPromotions = {
    init: init,
    refresh: loadList
  };

  if (document.querySelector('[data-creator-dashboard-embed]') || window.__CREATOR_DASHBOARD_EMBED_PAGE) {
    window.EazCreatorPromotions = window.EazCreatorPromotions || { init: init, refresh: loadList };
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
