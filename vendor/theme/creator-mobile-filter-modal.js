/**
 * Filter Modal – Shop style (Design + Product)
 * Shared opening logic for both designs and products.
 */
(function () {
  'use strict';

  var modal = null;
  var currentFilters = { design: {}, product: {} };
  var hasWarnedDuplicateModal = false;

  function getModal() {
    var nodes = document.querySelectorAll('#creator-filter-modal');
    if (!nodes || !nodes.length) return null;
    if (nodes.length === 1) return nodes[0];

    var preferred = null;
    nodes.forEach(function (node) {
      if (!preferred && node.querySelector('#creator-filter-panel-design') && node.querySelector('#creator-filter-panel-product')) {
        preferred = node;
      }
    });
    if (!preferred) {
      var scoped = document.querySelector('#creatorMobileApp #creator-filter-modal');
      preferred = scoped || nodes[0];
    }

    if (!hasWarnedDuplicateModal) {
      hasWarnedDuplicateModal = true;
      console.warn('[CreatorMobileFilter] Duplicate #creator-filter-modal detected:', nodes.length, '(using best match)');
    }

    nodes.forEach(function (node) {
      if (node === preferred) return;
      node.setAttribute('data-creator-filter-ignored', 'true');
    });

    return preferred;
  }

  function normalizeValue(value) {
    if (value === null || value === undefined) return '';
    return String(value).toLowerCase().trim();
  }

  function getCreationsDesignPoolForFilterUi() {
    try {
      if (window.CreationsScreen && typeof window.CreationsScreen.getDesignsForListFilter === 'function') {
        var pool = window.CreationsScreen.getDesignsForListFilter();
        if (Array.isArray(pool)) return pool;
      }
      if (window.CreationsScreen && typeof window.CreationsScreen.getDesigns === 'function') {
        return window.CreationsScreen.getDesigns() || [];
      }
    } catch (_e) {}
    return [];
  }

  function getDesignFilterValues() {
    var filters = {};
    modal = getModal();
    if (!modal) return filters;

    var designPanel = modal.querySelector('#creator-filter-panel-design');
    if (!designPanel) return filters;

    var checkboxes = designPanel.querySelectorAll('.inspiration-filter-checkbox[data-filter][data-value]');
    checkboxes.forEach(function (cb) {
      if (cb.checked) {
        var ft = cb.getAttribute('data-filter');
        var fv = cb.getAttribute('data-value');
        if (!filters[ft]) filters[ft] = [];
        filters[ft].push(fv);
      }
    });

    var switches = designPanel.querySelectorAll('.filter-switch__toggle[data-filter], .inspiration-filter-switch__toggle[data-filter]');
    switches.forEach(function (sw) {
      var ft = sw.getAttribute('data-filter');
      if (sw.getAttribute('data-active') === 'true') {
        filters[ft] = ['yes'];
      }
    });

    // Nur Creator-Filter setzen wenn ein Creator gewählt – "Alle Creator" (leer) = kein Filter
    var creatorTrigger = modal.querySelector('#creator-filter-modal-creator-trigger');
    var creatorVal = creatorTrigger ? (creatorTrigger.getAttribute('data-selected-creator') || '').trim() : '';
    if (creatorVal) filters.creator_name = [creatorVal];

    return filters;
  }

  function getProductFilterValues() {
    var filters = {};
    modal = getModal();
    if (!modal) return filters;

    var productPanel = modal.querySelector('#creator-filter-panel-product');
    if (!productPanel) return filters;

    var checkboxes = productPanel.querySelectorAll('.products-filter-checkbox[data-filter][data-value]');
    checkboxes.forEach(function (cb) {
      if (cb.checked) {
        var ft = cb.getAttribute('data-filter');
        var fv = cb.getAttribute('data-value');
        if (!filters[ft]) filters[ft] = [];
        filters[ft].push(fv);
      }
    });

    var priceMin = productPanel.querySelector('.filter-price-input[data-filter="price_min"]');
    var priceMax = productPanel.querySelector('.filter-price-input[data-filter="price_max"]');
    if (priceMin && priceMin.value && priceMin.value.trim()) {
      filters.price_min = [priceMin.value.trim()];
    }
    if (priceMax && priceMax.value && priceMax.value.trim()) {
      filters.price_max = [priceMax.value.trim()];
    }

    return filters;
  }

  function matchesDesignFilter(design, filters) {
    if (!design) return false;
    if (!filters || Object.keys(filters).length === 0) return true;

    var meta = design.metadata || {};

    for (var ft in filters) {
      if (!Object.prototype.hasOwnProperty.call(filters, ft) || !filters[ft] || filters[ft].length === 0) continue;

      var matches = false;
      var fvs = filters[ft];

      // "Alle Creator": creator_name mit leeren Werten = kein Filter
      if (ft === 'creator_name' && fvs.every(function (fv) { return fv == null || String(fv).trim() === ''; })) continue;

      switch (ft) {
        case 'design_art':
          // Use design_source from normalized design, or check metadata for uploaded vs saved
          var src = design.design_source || design.source || meta.design_art || meta.design_source;
          // If no explicit design_source, check metadata to determine uploaded vs saved
          if (!src && meta) {
            var userImageUrl = meta.user_image_url || null;
            var designPrompt = meta.design_prompt || null;
            if (userImageUrl && userImageUrl.trim() && !designPrompt) {
              src = 'uploaded';
            } else if (design.source === 'generated') {
              src = 'generated';
            } else {
              src = 'saved';
            }
          }
          var aidRaw = meta.automation_id != null ? meta.automation_id : design.automation_id;
          var aidNum = aidRaw != null && aidRaw !== '' ? Number(aidRaw) : NaN;
          var effectiveArt = !isNaN(aidNum) && aidNum > 0 ? 'automation' : src;
          if (effectiveArt) {
            matches = fvs.some(function (fv) { return normalizeValue(effectiveArt) === normalizeValue(fv); });
          }
          break;
        case 'ratio':
          matches = fvs.some(function (fv) { return normalizeValue(meta.ratio) === normalizeValue(fv); });
          break;
        case 'content_type':
          var ct = meta.content_type;
          var ctVal = ct === 'Design + Text' ? 'design_text' : ct === 'Text Only' ? 'text_only' : ct === 'Design Only' ? 'design_only' : ct;
          matches = fvs.some(function (fv) { return normalizeValue(ctVal) === normalizeValue(fv); });
          break;
        case 'design_type':
          matches = fvs.some(function (fv) { return normalizeValue(meta.design_type) === normalizeValue(fv); });
          break;
        case 'design_language':
        case 'dialect':
        case 'writing_system':
        case 'design_color':
        case 'background':
        case 'design_style':
        case 'target_product':
          var mVal = meta[ft];
          matches = fvs.some(function (fv) { return normalizeValue(mVal) === normalizeValue(fv); });
          break;
        case 'topic':
          if (Array.isArray(meta.topic)) {
            matches = fvs.some(function (fv) {
              return meta.topic.some(function (t) { return normalizeValue(t) === normalizeValue(fv); });
            });
          } else {
            matches = fvs.some(function (fv) { return normalizeValue(meta.topic) === normalizeValue(fv); });
          }
          break;
        case 'subtopic':
          if (Array.isArray(meta.subtopic)) {
            matches = fvs.some(function (fv) {
              return meta.subtopic.some(function (s) { return normalizeValue(s) === normalizeValue(fv); });
            });
          } else {
            matches = fvs.some(function (fv) { return normalizeValue(meta.subtopic) === normalizeValue(fv); });
          }
          break;
        case 'personalizable':
          var pv = meta.personalizable || (meta.custom && meta.custom.personalizable) || '';
          matches = fvs.includes('yes') ? normalizeValue(pv) === 'yes' : normalizeValue(pv) !== 'yes';
          break;
        case 'creator_name':
          var cn = (design.creator_name || meta.creator_name || '').toString().trim();
          if (fvs.some(function (fv) { return fv === '__none__'; })) {
            matches = !cn;
          } else {
            matches = fvs.some(function (fv) { return normalizeValue(cn) === normalizeValue(fv); });
          }
          break;
        default:
          matches = true;
      }

      if (!matches) return false;
    }
    return true;
  }

  function matchesProductFilter(product, filters) {
    if (!product) return false;
    if (!filters || Object.keys(filters).length === 0) return true;

    var title = ((product.title || '') + ' ' + (product.product_name || '') + ' ' + (product.product_key || '')).toLowerCase();

    for (var ft in filters) {
      if (!Object.prototype.hasOwnProperty.call(filters, ft) || !filters[ft] || filters[ft].length === 0) continue;
      var matches = false;
      var fvs = filters[ft];

      if (ft === 'category') {
        if (!fvs.length) matches = true;
        else if (fvs.indexOf('clothing') >= 0 && /shirt|tee|hoodie|tank|jacket|sweat|pullover|t-shirt/.test(title)) matches = true;
        else if (fvs.indexOf('accessories') >= 0 && /bag|cap|hat|beanie|backpack/.test(title)) matches = true;
        else if (fvs.indexOf('home') >= 0 && /poster|pillow|mug|blanket|cushion/.test(title)) matches = true;
        else if (fvs.indexOf('other') >= 0 && !/shirt|tee|hoodie|tank|jacket|sweat|pullover|t-shirt|bag|cap|hat|beanie|backpack|poster|pillow|mug|blanket|cushion/.test(title)) matches = true;
      } else if (ft === 'product_type') {
        var id = fvs[0];
        if (id === 't_shirts' && /tee|t-shirt|shirt/.test(title)) matches = true;
        else if (id === 'hoodies' && /hoodie/.test(title)) matches = true;
        else if (id === 'poster' && /poster/.test(title)) matches = true;
        else if (id === 'mugs' && /mug/.test(title)) matches = true;
        else if (id === 'totes' && /tote|bag/.test(title)) matches = true;
        else if (id === 'caps' && /cap|hat|beanie/.test(title)) matches = true;
        else if (id === 'other' && !/tee|t-shirt|shirt|hoodie|poster|mug|tote|bag|cap|hat|beanie/.test(title)) matches = true;
      } else {
        matches = true;
      }

      if (!matches) return false;
    }
    return true;
  }

  function applyFilters(close) {
    var source = (modal && modal.dataset.source) || 'designs';
    var designFilters = getDesignFilterValues();
    var productFilters = getProductFilterValues();

    currentFilters.design = designFilters;
    currentFilters.product = productFilters;

    window.dispatchEvent(new CustomEvent('creator-filter-applied', {
      detail: {
        source: source,
        filters: source === 'products' ? productFilters : designFilters,
        designFilters: designFilters,
        productFilters: productFilters
      }
    }));

    updateFilterBadge();
    setTimeout(function () {
      updateFilteredCount();
    }, 0);

    if (close) closeFilterModal();
  }

  function resetFilters() {
    modal = getModal();
    if (!modal) return;

    modal.querySelectorAll('.inspiration-filter-checkbox').forEach(function (cb) {
      cb.checked = false;
    });
    modal.querySelectorAll('.filter-switch__toggle, .inspiration-filter-switch__toggle').forEach(function (sw) {
      sw.setAttribute('data-active', 'false');
      sw.setAttribute('aria-checked', 'false');
    });
    modal.querySelectorAll('.products-filter-checkbox').forEach(function (cb) {
      cb.checked = false;
    });
    var priceMin = modal.querySelector('.filter-price-input[data-filter="price_min"]');
    var priceMax = modal.querySelector('.filter-price-input[data-filter="price_max"]');
    if (priceMin) priceMin.value = '';
    if (priceMax) priceMax.value = '';

    var creatorTrigger = modal.querySelector('#creator-filter-modal-creator-trigger');
    var creatorLabel = modal.querySelector('#creator-filter-modal-creator-label');
    if (creatorTrigger) creatorTrigger.setAttribute('data-selected-creator', '');
    if (creatorLabel) creatorLabel.textContent = 'Alle Creator';

    currentFilters.design = {};
    currentFilters.product = {};
    applyFilters(false);
  }

  function closeFilterModal() {
    modal = getModal();
    if (!modal) return;

    var active = document.activeElement;
    if (active && modal.contains(active) && typeof active.blur === 'function') {
      active.blur();
    }

    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openFilterModal(options) {
    options = options || {};
    var source = options.source || options.mode || 'designs';

    modal = getModal();
    if (!modal) return;

    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    modal.setAttribute('aria-hidden', 'false');
    modal.dataset.source = source;
    document.body.style.overflow = 'hidden';

    var titleEl = modal.querySelector('#creator-filter-modal-title');
    if (titleEl) titleEl.textContent = source === 'products' ? 'Product Filter' : 'Design Filter';

    var designTab = modal.querySelector('.creator-filter-modal__tab[data-tab="design"]');
    var productTab = modal.querySelector('.creator-filter-modal__tab[data-tab="product"]');
    var designPanel = modal.querySelector('#creator-filter-panel-design');
    var productPanel = modal.querySelector('#creator-filter-panel-product');

    if (source === 'products') {
      if (productTab) productTab.classList.add('is-active');
      if (designTab) designTab.classList.remove('is-active');
      if (productPanel) productPanel.classList.add('is-active');
      if (designPanel) designPanel.classList.remove('is-active');
    } else {
      if (designTab) designTab.classList.add('is-active');
      if (productTab) productTab.classList.remove('is-active');
      if (designPanel) designPanel.classList.add('is-active');
      if (productPanel) productPanel.classList.remove('is-active');
    }

    populateTopicsSubtopics();
    loadProductTypes();
    populateCreatorModal();
    updateFilterCounts();
    updateFilteredCount();
    updateFilterBadge();
  }

  function populateCreatorModal() {
    modal = getModal();
    var listEl = document.getElementById('creator-filter-creator-modal-list');
    var trigger = modal ? modal.querySelector('#creator-filter-modal-creator-trigger') : null;
    if (!listEl || !trigger) return;

    var allDesigns = getCreationsDesignPoolForFilterUi();

    var names = [];
    var countByCreator = {};
    allDesigns.forEach(function (d) {
      var cn = (d.creator_name || (d.metadata && d.metadata.creator_name) || '').toString().trim();
      if (cn) {
        if (!countByCreator[cn]) { countByCreator[cn] = 0; names.push(cn); }
        countByCreator[cn]++;
      }
    });
    names.sort();

    var currentVal = trigger.getAttribute('data-selected-creator') || '';
    listEl.innerHTML = '';

    var allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'creator-filter-creator-modal__option' + (currentVal === '' ? ' is-selected' : '');
    allBtn.dataset.value = '';
    allBtn.innerHTML = '<span>Alle Creator</span><span class="creator-filter-creator-modal__count">(' + allDesigns.length + ')</span>';
    listEl.appendChild(allBtn);

    var notAssignedLabel = (window.CreatorMobileI18n && window.CreatorMobileI18n.creationsCreatorNotAssigned) || 'Not assigned';
    var unassignedCount = allDesigns.filter(function (d) {
      var cn = (d.creator_name || (d.metadata && d.metadata.creator_name) || '').toString().trim();
      return !cn;
    }).length;
    if (unassignedCount > 0) {
      var notAssignedBtn = document.createElement('button');
      notAssignedBtn.type = 'button';
      notAssignedBtn.className = 'creator-filter-creator-modal__option' + (currentVal === '__none__' ? ' is-selected' : '');
      notAssignedBtn.dataset.value = '__none__';
      notAssignedBtn.innerHTML = '<span>' + notAssignedLabel + '</span><span class="creator-filter-creator-modal__count">(' + unassignedCount + ')</span>';
      listEl.appendChild(notAssignedBtn);
    }

    names.forEach(function (n) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'creator-filter-creator-modal__option' + (currentVal === n ? ' is-selected' : '');
      btn.dataset.value = n;
      btn.innerHTML = '<span>' + (n.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) + '</span><span class="creator-filter-creator-modal__count">(' + (countByCreator[n] || 0) + ')</span>';
      listEl.appendChild(btn);
    });
  }

  function openCreatorModal() {
    populateCreatorModal();
    var cm = document.getElementById('creator-filter-creator-modal');
    if (cm) {
      if (cm.parentElement !== document.body) document.body.appendChild(cm);
      cm.setAttribute('aria-hidden', 'false');
      cm.style.display = 'flex';
    }
  }

  function closeCreatorModal() {
    var cm = document.getElementById('creator-filter-creator-modal');
    if (cm) {
      var active = document.activeElement;
      if (active && cm.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }
      cm.setAttribute('aria-hidden', 'true');
      cm.style.display = 'none';
    }
    modal = getModal();
    var trigger = modal ? modal.querySelector('#creator-filter-modal-creator-trigger') : null;
    if (trigger && typeof trigger.focus === 'function') {
      trigger.focus();
    }
  }

  function selectCreator(value, label) {
    modal = getModal();
    var trigger = modal ? modal.querySelector('#creator-filter-modal-creator-trigger') : null;
    var labelEl = modal ? modal.querySelector('#creator-filter-modal-creator-label') : null;
    if (trigger) trigger.setAttribute('data-selected-creator', value || '');
    if (labelEl) {
      var labelText = (label || '').replace(/\s*\(\d+\)\s*$/, '').trim();
      labelEl.textContent = labelText || 'Alle Creator';
    }
    closeCreatorModal();
    updateFilterCounts();
    applyFilters(false);
  }

  function populateTopicsSubtopics() {
    var allDesigns = getCreationsDesignPoolForFilterUi();

    var topics = {};
    var subtopics = {};
    allDesigns.forEach(function (design) {
      var m = design.metadata || {};
      if (Array.isArray(m.topic)) {
        m.topic.forEach(function (t) { if (t) topics[t] = (topics[t] || 0) + 1; });
      } else if (m.topic) {
        topics[m.topic] = (topics[m.topic] || 0) + 1;
      }
      if (Array.isArray(m.subtopic)) {
        m.subtopic.forEach(function (s) { if (s) subtopics[s] = (subtopics[s] || 0) + 1; });
      } else if (m.subtopic) {
        subtopics[m.subtopic] = (subtopics[m.subtopic] || 0) + 1;
      }
    });

    modal = getModal();
    if (!modal) return;
    var topicEl = modal.querySelector('#creator-filter-topic-options');
    var subtopicEl = modal.querySelector('#creator-filter-subtopic-options');
    if (topicEl) {
      topicEl.innerHTML = '';
      Object.keys(topics).sort().forEach(function (t) {
        var esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        var lb = document.createElement('label');
        lb.className = 'filter-option';
        lb.innerHTML = '<input type="checkbox" class="inspiration-filter-checkbox" data-filter="topic" data-value="' + esc + '"><span class="filter-option__label">' + esc + '</span><span class="filter-option__count">(' + topics[t] + ')</span>';
        topicEl.appendChild(lb);
      });
    }
    if (subtopicEl) {
      subtopicEl.innerHTML = '';
      Object.keys(subtopics).sort().forEach(function (s) {
        var esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        var lb = document.createElement('label');
        lb.className = 'filter-option';
        lb.innerHTML = '<input type="checkbox" class="inspiration-filter-checkbox" data-filter="subtopic" data-value="' + esc + '"><span class="filter-option__label">' + esc + '</span><span class="filter-option__count">(' + subtopics[s] + ')</span>';
        subtopicEl.appendChild(lb);
      });
    }
  }

  function loadProductTypes() {
    modal = getModal();
    if (!modal) return;
    var typesEl = modal.querySelector('#creator-filter-types');
    if (!typesEl) return;

    var types = ['T-Shirts', 'Hoodies', 'Poster', 'Mugs', 'Totes', 'Caps', 'Other'];
    typesEl.innerHTML = '';
    types.forEach(function (t) {
      var lb = document.createElement('label');
      lb.className = 'filter-option';
      var id = t.toLowerCase().replace(/-/g, '_').replace(/ /g, '_');
      lb.innerHTML = '<input type="checkbox" class="products-filter-checkbox" data-filter="product_type" data-value="' + id + '"><span class="filter-option__label">' + t + '</span><span class="filter-option__count" data-count-for="product_type:' + id + '"></span>';
      typesEl.appendChild(lb);
    });
  }

  function updateFilterCounts() {
    modal = getModal();
    if (!modal) return;

    var allDesigns = getCreationsDesignPoolForFilterUi();
    var allProducts = [];
    try {
      if (window.CreationsScreen && typeof window.CreationsScreen.getProducts === 'function') {
        allProducts = window.CreationsScreen.getProducts() || [];
      }
    } catch (_e) {}

    var creatorTrigger = modal.querySelector('#creator-filter-modal-creator-trigger');
    var creatorVal = creatorTrigger ? (creatorTrigger.getAttribute('data-selected-creator') || '').trim() : '';
    var designBase = allDesigns;
    if (creatorVal) {
      var creatorFilter = creatorVal === '__none__' ? { creator_name: ['__none__'] } : { creator_name: [creatorVal] };
      designBase = allDesigns.filter(function (d) { return matchesDesignFilter(d, creatorFilter); });
    }

    var designPanel = modal.querySelector('#creator-filter-panel-design');
    if (designPanel) {
      designPanel.querySelectorAll('.filter-option__count[data-count-for]').forEach(function (el) {
        var key = el.getAttribute('data-count-for');
        if (!key) return;
        var parts = key.split(':');
        if (parts.length !== 2) return;
        var filterKey = parts[0];
        var filterVal = parts[1];
        var singleFilter = {};
        singleFilter[filterKey] = [filterVal];
        var count = designBase.filter(function (d) { return matchesDesignFilter(d, singleFilter); }).length;
        el.textContent = '(' + count + ')';
      });
    }

    var productPanel = modal.querySelector('#creator-filter-panel-product');
    if (productPanel) {
      productPanel.querySelectorAll('.filter-option__count[data-count-for]').forEach(function (el) {
        var key = el.getAttribute('data-count-for');
        if (!key) return;
        var parts = key.split(':');
        if (parts.length !== 2) return;
        var filterKey = parts[0];
        var filterVal = parts[1];
        var singleFilter = {};
        singleFilter[filterKey] = [filterVal];
        var count = allProducts.filter(function (p) { return matchesProductFilter(p, singleFilter); }).length;
        el.textContent = '(' + count + ')';
      });
    }
  }

  function getActiveFilterCount(source) {
    var designFilters = getDesignFilterValues();
    var productFilters = getProductFilterValues();
    var count = 0;
    if (source === 'designs') {
      if ((designFilters.creator_name || []).length) count++;
      Object.keys(designFilters).forEach(function (k) {
        if (k === 'creator_name') return;
        var arr = designFilters[k];
        if (Array.isArray(arr) && arr.length) count += arr.length;
      });
    } else if (source === 'products') {
      Object.keys(productFilters).forEach(function (k) {
        var arr = productFilters[k];
        if (Array.isArray(arr) && arr.length) count += arr.length;
      });
    }
    return count;
  }

  function updateFilterBadge() {
    var designCount = getActiveFilterCount('designs');
    var productCount = getActiveFilterCount('products');
    var designsBadge = document.getElementById('creatorDesignsFilterBadge');
    var productsBadge = document.getElementById('creatorProductsFilterBadge');
    if (designsBadge) designsBadge.textContent = designCount > 0 ? String(designCount) : '';
    if (productsBadge) productsBadge.textContent = productCount > 0 ? String(productCount) : '';
  }

  function updateFilteredCount() {
    var countEl = document.getElementById('creator-filter-modal-filtered-count');
    if (!countEl || !modal) return;
    var source = modal.dataset.source || 'designs';
    var count = 0;
    try {
      if (source === 'designs' && window.CreationsScreen && typeof window.CreationsScreen.getFilteredDesigns === 'function') {
        count = (window.CreationsScreen.getFilteredDesigns() || []).length;
      } else if (source === 'products' && window.CreationsScreen && typeof window.CreationsScreen.getFilteredProducts === 'function') {
        count = (window.CreationsScreen.getFilteredProducts() || []).length;
      }
    } catch (_e) {}
    var designsLabel = (window.CreatorMobileI18n && window.CreatorMobileI18n.mobileDesigns) || 'designs';
    var productsLabel = (window.CreatorMobileI18n && window.CreatorMobileI18n.mobileProducts) || 'products';
    countEl.textContent = source === 'designs' ? count + ' ' + designsLabel : count + ' ' + productsLabel;
  }

  function bind() {
    modal = getModal();
    if (!modal) return;

    var closeBtn = modal.querySelector('#creator-filter-modal-close');
    var backdrop = modal.querySelector('.creator-filter-modal__backdrop');
    var resetBtn = modal.querySelector('#creator-filter-modal-reset');

    if (closeBtn) closeBtn.addEventListener('click', closeFilterModal);
    if (backdrop) backdrop.addEventListener('click', closeFilterModal);
    if (resetBtn) resetBtn.addEventListener('click', resetFilters);

    modal.addEventListener('click', function (e) {
      var header = e.target.closest('[data-toggle-filter]');
      if (header && modal.contains(header)) {
        var group = header.closest('.filter-group');
        if (!group) return;
        var content = group.querySelector('.filter-group__content');
        var chevron = group.querySelector('.filter-group__toggle');
        if (content) content.classList.toggle('collapsed');
        if (chevron) chevron.classList.toggle('collapsed');
      }
    });

    modal.querySelectorAll('.creator-filter-modal__tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var t = tab.dataset.tab;
        var nextSource = t === 'product' ? 'products' : 'designs';
        modal.dataset.source = nextSource;
        modal.querySelectorAll('.creator-filter-modal__tab').forEach(function (x) {
          x.classList.toggle('is-active', x.dataset.tab === t);
        });
        modal.querySelectorAll('.creator-filter-modal__panel').forEach(function (p) {
          p.classList.toggle('is-active', p.id === 'creator-filter-panel-' + t);
        });
        var titleEl = modal.querySelector('#creator-filter-modal-title');
        if (titleEl) titleEl.textContent = nextSource === 'products' ? 'Product Filter' : 'Design Filter';
        updateFilteredCount();
      });
    });

    modal.addEventListener('click', function (e) {
      var toggle = e.target.closest('.filter-switch__toggle, .inspiration-filter-switch__toggle');
      if (toggle && modal.contains(toggle)) {
        e.preventDefault();
        var isActive = toggle.getAttribute('data-active') === 'true';
        toggle.setAttribute('data-active', isActive ? 'false' : 'true');
        toggle.setAttribute('aria-checked', isActive ? 'false' : 'true');
        applyFilters(false);
      }
    });

    modal.addEventListener('keydown', function (e) {
      var toggle = e.target.closest('.filter-switch__toggle, .inspiration-filter-switch__toggle');
      if (toggle && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggle.click();
      }
    });

    modal.addEventListener('change', function (e) {
      if (!modal.contains(e.target)) return;
      if (e.target.matches('.inspiration-filter-checkbox, .products-filter-checkbox')) {
        applyFilters(false);
      }
    });

    var creatorTrigger = modal.querySelector('#creator-filter-modal-creator-trigger');
    if (creatorTrigger) creatorTrigger.addEventListener('click', openCreatorModal);

    var creatorModal = document.getElementById('creator-filter-creator-modal');
    if (creatorModal) {
      var cmBackdrop = creatorModal.querySelector('.creator-filter-creator-modal__backdrop');
      var cmClose = creatorModal.querySelector('.creator-filter-creator-modal__close');
      var cmList = document.getElementById('creator-filter-creator-modal-list');
      if (cmBackdrop) cmBackdrop.addEventListener('click', closeCreatorModal);
      if (cmClose) cmClose.addEventListener('click', closeCreatorModal);
      if (cmList) {
        cmList.addEventListener('click', function (e) {
          var opt = e.target.closest('.creator-filter-creator-modal__option');
          if (opt) {
            var labelSpan = opt.querySelector('span:first-child');
            var label = labelSpan ? labelSpan.textContent : (opt.textContent || '').replace(/\s*\(\d+\)\s*$/, '').trim();
            selectCreator(opt.dataset.value || '', label || 'Alle Creator');
          }
        });
      }
    }

    modal.addEventListener('input', function (e) {
      if (!modal.contains(e.target)) return;
      if (e.target.matches('.filter-price-input')) {
        applyFilters(false);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var cm = document.getElementById('creator-filter-creator-modal');
        if (cm && cm.getAttribute('aria-hidden') === 'false') {
          closeCreatorModal();
          e.preventDefault();
        } else if (modal && modal.getAttribute('aria-hidden') === 'false') {
          closeFilterModal();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.addEventListener('creator-designs-loaded', function () {
    populateCreatorModal();
    updateFilterCounts();
    updateFilterBadge();
    updateFilteredCount();
  });
  window.addEventListener('creator-products-loaded', function () {
    updateFilterCounts();
    updateFilterBadge();
    updateFilteredCount();
  });

  window.openFilterModal = openFilterModal;
  window.closeFilterModal = closeFilterModal;
  window.getFilterState = function () {
    return {
      design: getDesignFilterValues(),
      product: getProductFilterValues()
    };
  };
  window.matchesDesignFilter = matchesDesignFilter;
  window.matchesProductFilter = matchesProductFilter;
})();
