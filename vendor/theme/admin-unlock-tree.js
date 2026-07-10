/**
 * Admin Creator Journey — Unlock Tree tab (catalog nodes + product filters).
 */
(function () {
  'use strict';

  var CATEGORY_ORDER = [
    'product', 'design_type', 'variant', 'market', 'channel',
    'design_slot', 'creator_name', 'automation', 'promotion', 'hero', 'social'
  ];

  var DESIGN_TYPE_OPTIONS = ['classic', 'pattern', 'all-over', 'full-coverage', 'panorama'];
  var TIER_OPTIONS = ['S', 'M', 'P'];

  var state = {
    loaded: false,
    loading: false,
    data: null,
    catalogFilter: 'product',
    productFilters: {},
    cardImageView: {},
    pendingUploadNodeKey: null,
    apiUrl: null,
    customerId: null,
    bgViewport: 'desktop',
    bgData: null,
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function t(key, fallback) {
    if (window.CreatorI18n && window.CreatorI18n[key]) return window.CreatorI18n[key];
    return fallback;
  }

  function catLabel(cat) {
    var map = {
      product: t('admin.creator_journey.unlock_cat_product', 'Products'),
      design_type: t('admin.creator_journey.unlock_cat_design_type', 'Design types'),
      variant: t('admin.creator_journey.unlock_cat_variant', 'Variants'),
      market: t('admin.creator_journey.unlock_cat_market', 'Markets'),
      channel: t('admin.creator_journey.unlock_cat_channel', 'Channels'),
      design_slot: t('admin.creator_journey.unlock_cat_design_slot', 'Design slots'),
      creator_name: t('admin.creator_journey.unlock_cat_creator_name', 'Creator names'),
      automation: t('admin.creator_journey.unlock_cat_automation', 'Automations'),
      promotion: t('admin.creator_journey.unlock_cat_promotion', 'Promotions'),
      hero: t('admin.creator_journey.unlock_cat_hero', 'Hero'),
      social: t('admin.creator_journey.unlock_cat_social', 'Social'),
    };
    return map[cat] || cat;
  }

  function defaultProductFilters() {
    return {
      starter: {},
      region: {},
      tier: {},
      level: {},
      active: {},
      design_type: {},
      journey_image: {},
    };
  }

  function placeholderImgHtml() {
    return (
      '<div class="admin-ut-card__img admin-ut-card__img--placeholder" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
      '<circle cx="8.5" cy="8.5" r="1.5"/>' +
      '<path d="M21 15l-5-5L5 21"/>' +
      '</svg></div>'
    );
  }

  function resolveAdminRoot(root) {
    if (root && typeof root.getAttribute === 'function') return root;
    return (
      document.querySelector('.admin-redesign-wrapper[data-customer-id]') ||
      document.querySelector('.admin-redesign-wrapper') ||
      document.querySelector('.admin-shell') ||
      document.body
    );
  }

  function unlockTreeClickHost(root, target) {
    if (!target || typeof target.closest !== 'function') return null;
    var ccPanel = root.querySelector('#adminCcUnlockTreePanel');
    if (ccPanel && !ccPanel.hidden && ccPanel.contains(target)) return ccPanel;
    var modalSettings = root.querySelector('#paneCreator .admin-creator-page[data-cj-page="modal-settings"]');
    if (modalSettings && !modalSettings.hidden && modalSettings.contains(target)) return modalSettings;
    var cjPage = root.querySelector('#paneCreator .admin-creator-page[data-cj-page="unlock-tree"]');
    if (cjPage && !cjPage.hidden && cjPage.contains(target)) return cjPage;
    if (target.closest('#adminUtSaveBtn')) {
      if (ccPanel && !ccPanel.hidden) return ccPanel;
      if (cjPage && !cjPage.hidden) return cjPage;
    }
    return null;
  }

  function unlockTreeModalHost(root) {
    return root.querySelector('#paneCollectionCards') || root.querySelector('#paneCreator') || root;
  }

  function badgeHtml(text, extraClass) {
    return '<span class="admin-ut-badge' + (extraClass ? ' ' + extraClass : '') + '">' + esc(text) + '</span>';
  }

  function badgesOverlayHtml(badges) {
    if (!badges || !badges.length) return '';
    return '<div class="admin-ut-card__badges">' + badges.map(function (b) { return badgeHtml(b); }).join('') + '</div>';
  }

  function nodeByKey(nodes, key) {
    for (var i = 0; i < (nodes || []).length; i++) {
      if (nodes[i].node_key === key) return nodes[i];
    }
    return null;
  }

  function nodeTitle(node) {
    if (!node) return '';
    if (node.title) return node.title;
    if (node.category === 'market') {
      if (node.metadata && node.metadata.country_name) return String(node.metadata.country_name);
      if (node.metadata && node.metadata.title) return String(node.metadata.title);
      if (node.region_code) return String(node.region_code);
    }
    if (node.metadata && node.metadata.title) return node.metadata.title;
    if (node.product_key) return node.product_key;
    if (node.design_type) return node.design_type;
    if (node.region_code) return node.region_code;
    if (node.channel_id) return node.channel_id;
    if (node.social_platform) return node.social_platform;
    if (node.name_slot) return 'Name ' + node.name_slot;
    if (node.slot_index) return 'Slot ' + node.slot_index;
    if (node.automation_slot) return 'Automation ' + node.automation_slot;
    if (node.promo_slot) return 'Promo ' + node.promo_slot;
    if (node.hero_slot) return 'Hero ' + node.hero_slot;
    if (node.variant_tier) return node.variant_tier;
    return node.node_key;
  }

  function journeyImageUrl(node) {
    if (!node) return '';
    return (node.image_url || (node.metadata && node.metadata.image_url) || '').trim();
  }

  function starterKeysSet() {
    return new Set((state.data && state.data.starter_product_keys || []).map(String));
  }

  function isStarterProduct(productKey) {
    return starterKeysSet().has(String(productKey));
  }

  function groupHasSelection(group) {
    if (!group) return false;
    return Object.keys(group).some(function (k) { return group[k]; });
  }

  function groupMatches(group, value) {
    if (!groupHasSelection(group)) return true;
    return !!group[String(value)];
  }

  function productMatchesFilters(product, node) {
    var f = state.productFilters;
    var pk = product.product_key;
    var isStarter = isStarterProduct(pk);

    if (groupHasSelection(f.starter)) {
      var starterOk = (f.starter.yes && isStarter) || (f.starter.no && !isStarter);
      if (!starterOk) return false;
    }

    if (groupHasSelection(f.region)) {
      var regions = product.regions || [];
      var regionOk = regions.some(function (r) { return f.region[String(r).toLowerCase()]; });
      if (!regionOk) return false;
    }

    var tier = (node && node.product_tier) || 'S';
    if (!groupMatches(f.tier, tier)) return false;

    var minLv = node ? node.min_level : 2;
    if (!groupMatches(f.level, String(minLv))) return false;

    if (groupHasSelection(f.active)) {
      var active = node ? node.active !== false : true;
      var activeOk = (f.active.yes && active) || (f.active.no && !active);
      if (!activeOk) return false;
    }

    if (groupHasSelection(f.design_type)) {
      var dts = product.design_types || [];
      var dtOk = dts.some(function (dt) { return f.design_type[String(dt).toLowerCase()]; });
      if (!dtOk) return false;
    }

    if (groupHasSelection(f.journey_image)) {
      var hasImg = !!journeyImageUrl(node);
      var imgOk = (f.journey_image.set && hasImg) || (f.journey_image.not_set && !hasImg);
      if (!imgOk) return false;
    }

    return true;
  }

  function collectFilterOptions() {
    var products = (state.data && state.data.online_products) || [];
    var nodes = (state.data && state.data.nodes) || [];
    var regions = {};
    var levels = {};
    products.forEach(function (p) {
      (p.regions || []).forEach(function (r) {
        regions[String(r).toLowerCase()] = String(r).toUpperCase();
      });
      var node = nodeByKey(nodes, 'product:' + p.product_key);
      var lv = node ? node.min_level : 2;
      levels[String(lv)] = String(lv);
    });
    return {
      regions: Object.keys(regions).sort().map(function (k) { return { key: k, label: regions[k] }; }),
      levels: Object.keys(levels).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) {
        return { key: k, label: levels[k] };
      }),
    };
  }

  function filterCheckboxHtml(group, key, label, checked) {
    return (
      '<label class="admin-ut-filter-option">' +
      '<input type="checkbox" data-ut-filter-group="' + esc(group) + '" data-ut-filter-key="' + esc(key) + '"' +
      (checked ? ' checked' : '') + '> ' + esc(label) +
      '</label>'
    );
  }

  function renderProductFilters(root) {
    var wrap = root.querySelector('#adminUtProductFilters');
    if (!wrap) return;
    var show = state.catalogFilter === 'product';
    wrap.hidden = !show;
    if (!show || !state.data) return;

    if (!state.productFilters || !state.productFilters.starter) {
      state.productFilters = defaultProductFilters();
    }

    var opts = collectFilterOptions();
    var f = state.productFilters;
    var filterLabel = t('admin.creator_journey.unlock_filter_label', 'Filter products');
    var activeCount = 0;
    Object.keys(f).forEach(function (g) {
      Object.keys(f[g] || {}).forEach(function (k) {
        if (f[g][k]) activeCount += 1;
      });
    });

    var html =
      '<div class="admin-ut-filter-dropdown admin-ut-filter-dropdown--icon">' +
      '<button type="button" class="admin-ut-filter-icon-btn' + (activeCount ? ' has-active' : '') + '" id="adminUtProductFilterBtn" aria-expanded="false" aria-haspopup="listbox" aria-label="' + esc(filterLabel) + '">' +
      '<svg class="admin-ut-filter-icon-btn__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M4 6h16M7 12h10M10 18h4"/>' +
      '</svg>' +
      (activeCount ? '<span class="admin-ut-filter-icon-btn__badge">' + activeCount + '</span>' : '') +
      '</button>' +
      '<div class="admin-ut-filter-panel admin-ut-filter-panel--icon" id="adminUtProductFilterPanel" role="listbox">';

    html += '<div class="admin-ut-filter-group"><p class="admin-ut-filter-group__title">' +
      esc(t('admin.creator_journey.unlock_filter_starter', 'Starter')) + '</p>';
    html += filterCheckboxHtml('starter', 'yes', t('admin.creator_journey.unlock_filter_starter', 'Starter'), f.starter.yes);
    html += filterCheckboxHtml('starter', 'no', t('admin.creator_journey.unlock_filter_non_starter', 'Non-starter'), f.starter.no);
    html += '</div>';

    if (opts.regions.length) {
      html += '<div class="admin-ut-filter-group"><p class="admin-ut-filter-group__title">' +
        esc(t('admin.creator_journey.unlock_filter_region', 'Region')) + '</p>';
      opts.regions.forEach(function (r) {
        html += filterCheckboxHtml('region', r.key, r.label, f.region[r.key]);
      });
      html += '</div>';
    }

    html += '<div class="admin-ut-filter-group"><p class="admin-ut-filter-group__title">' +
      esc(t('admin.creator_journey.unlock_filter_tier', 'Tier')) + '</p>';
    TIER_OPTIONS.forEach(function (ti) {
      html += filterCheckboxHtml('tier', ti, ti, f.tier[ti]);
    });
    html += '</div>';

    if (opts.levels.length) {
      html += '<div class="admin-ut-filter-group"><p class="admin-ut-filter-group__title">' +
        esc(t('admin.creator_journey.unlock_filter_level', 'Level')) + '</p>';
      opts.levels.forEach(function (lv) {
        html += filterCheckboxHtml('level', lv.key, lv.label, f.level[lv.key]);
      });
      html += '</div>';
    }

    html += '<div class="admin-ut-filter-group"><p class="admin-ut-filter-group__title">' +
      esc(t('admin.creator_journey.unlock_active', 'Active in unlock tree')) + '</p>';
    html += filterCheckboxHtml('active', 'yes', t('admin.creator_journey.unlock_filter_active', 'Active in unlock tree'), f.active.yes);
    html += filterCheckboxHtml('active', 'no', t('admin.creator_journey.unlock_filter_inactive', 'Inactive in unlock tree'), f.active.no);
    html += '</div>';

    html += '<div class="admin-ut-filter-group"><p class="admin-ut-filter-group__title">' +
      esc(t('admin.creator_journey.unlock_filter_design_type', 'Design types')) + '</p>';
    DESIGN_TYPE_OPTIONS.forEach(function (dt) {
      html += filterCheckboxHtml('design_type', dt, dt, f.design_type[dt]);
    });
    html += '</div>';

    html += '<div class="admin-ut-filter-group"><p class="admin-ut-filter-group__title">' +
      esc(t('admin.creator_journey.unlock_filter_journey_image', 'Journey image')) + '</p>';
    html += filterCheckboxHtml('journey_image', 'set', t('admin.creator_journey.unlock_filter_journey_set', 'Set'), f.journey_image.set);
    html += filterCheckboxHtml('journey_image', 'not_set', t('admin.creator_journey.unlock_filter_journey_not_set', 'Not set'), f.journey_image.not_set);
    html += '</div></div></div>';

    wrap.innerHTML = html;

    var btn = wrap.querySelector('#adminUtProductFilterBtn');
    var panel = wrap.querySelector('#adminUtProductFilterPanel');
    if (btn && panel) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        panel.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', panel.classList.contains('is-open') ? 'true' : 'false');
      });
    }
    wrap.querySelectorAll('.admin-ut-filter-option input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var group = this.getAttribute('data-ut-filter-group');
        var key = this.getAttribute('data-ut-filter-key');
        if (!state.productFilters[group]) state.productFilters[group] = {};
        state.productFilters[group][key] = this.checked;
        var panelWasOpen = panel && panel.classList.contains('is-open');
        renderProductFilters(root);
        if (panelWasOpen) {
          var newPanel = wrap.querySelector('.admin-ut-filter-panel');
          var newBtn = wrap.querySelector('.admin-ut-filter-icon-btn');
          if (newPanel) newPanel.classList.add('is-open');
          if (newBtn) newBtn.setAttribute('aria-expanded', 'true');
        }
        renderCatalogGrid(root);
      });
    });
  }

  function starterSwitchHtml(isOn) {
    var cls = isOn ? ' is-on' : ' is-off';
    var label = t('admin.creator_journey.unlock_starter_switch', 'Starter product');
    return (
      '<div class="admin-ut-starter-switch-wrap">' +
      '<label class="dash-switch admin-ut-starter-switch' + cls + '" title="' + esc(label) + '">' +
      '<input type="checkbox" name="ut_starter"' + (isOn ? ' checked' : '') + ' tabindex="-1">' +
      '<span class="dash-switch__track"><span class="dash-switch__thumb"></span></span>' +
      '<span class="dash-switch__label">' + esc(label) + '</span>' +
      '</label></div>'
    );
  }

  function imageWrapHtml(nodeKey, mockUrl, journeyUrl, view, badges) {
    var showJourney = view === 'journey' && journeyUrl;
    var displayUrl = showJourney ? journeyUrl : (mockUrl || journeyUrl || '');
    var imgPart = displayUrl
      ? '<img class="admin-ut-card__img" src="' + esc(displayUrl) + '" alt="" loading="lazy">'
      : placeholderImgHtml();
    var hasJourney = !!journeyUrl;
    var canToggle = hasJourney && mockUrl && mockUrl !== journeyUrl;
    var isJourneyView = showJourney && hasJourney;
    var uploadHint = isJourneyView
      ? t('admin.creator_journey.unlock_preview_image_hint', 'Click to preview journey card')
      : t('admin.creator_journey.unlock_upload_image_hint', 'Click to upload journey image');
    var wrapClass = 'admin-ut-card__img-wrap admin-ut-card__img-wrap--upload' +
      (isJourneyView ? ' admin-ut-card__img-wrap--preview' : '');

    return (
      '<div class="' + wrapClass + '" data-ut-upload-node="' + esc(nodeKey) + '" ' +
      'data-mock-url="' + esc(mockUrl || '') + '" data-journey-url="' + esc(journeyUrl || '') + '" ' +
      'data-image-view="' + esc(showJourney ? 'journey' : 'mock') + '" title="' + esc(uploadHint) + '">' +
      imgPart +
      badgesOverlayHtml(badges) +
      (hasJourney ? badgeHtml(t('admin.creator_journey.unlock_journey_badge', 'Journey image'), 'admin-ut-badge--journey') : '') +
      '<span class="admin-ut-card__upload-hint">' + esc(uploadHint) + '</span>' +
      (canToggle
        ? '<button type="button" class="admin-ut-card__img-toggle" data-ut-img-toggle="' + esc(nodeKey) + '" aria-label="' +
          esc(t('admin.creator_journey.unlock_toggle_image_aria', 'Switch between mock and journey image')) + '">⇄</button>'
        : '') +
      '</div>'
    );
  }

  function productCardHtml(product, node) {
    var pk = product.product_key;
    var nodeKey = node ? node.node_key : 'product:' + pk;
    var tier = (node && node.product_tier) || 'S';
    var cost = node ? node.cost_eaz : 180;
    var minLv = node ? node.min_level : 2;
    var active = node ? node.active !== false : true;
    var title = (node && (node.title || (node.metadata && node.metadata.title))) || product.title || pk;
    var imageUrl = journeyImageUrl(node);
    var mockUrl = product.preview_image_url || '';
    var view = state.cardImageView[nodeKey] || 'mock';
    var isStarter = isStarterProduct(pk);
    var dtBadges = (product.design_types || []).slice(0, 5);
    var regBadges = (product.regions || []).slice(0, 5);
    var badges = dtBadges.concat(regBadges);

    return (
      '<article class="admin-ut-card admin-ut-card--catalog" data-node-key="' + esc(nodeKey) + '" data-ut-category="product">' +
      imageWrapHtml(nodeKey, mockUrl, imageUrl, view, badges) +
      '<div class="admin-ut-card__body">' +
      '<h4 class="admin-ut-card__title">' + esc(title) + '</h4>' +
      '<p class="admin-ut-card__key">' + esc(pk) + '</p>' +
      starterSwitchHtml(isStarter) +
      '<input type="hidden" name="ut_image_url" value="' + esc(imageUrl) + '">' +
      '<div class="admin-ut-card__fields">' +
      '<label class="admin-ut-field"><span>' + esc(t('admin.creator_journey.unlock_display_title', 'Display title')) + '</span>' +
      '<input type="text" name="ut_title" value="' + esc(title) + '"></label>' +
      '<div class="admin-ut-field-row">' +
      '<label class="admin-ut-field"><span>' + esc(t('admin.creator_journey.unlock_tier', 'Tier')) + '</span>' +
      '<select name="ut_tier">' +
      TIER_OPTIONS.map(function (ti) {
        return '<option value="' + ti + '"' + (tier === ti ? ' selected' : '') + '>' + ti + '</option>';
      }).join('') +
      '</select></label>' +
      '<label class="admin-ut-field"><span>EAZ</span>' +
      '<input type="number" step="1" min="0" name="ut_cost" value="' + esc(String(cost)) + '"></label>' +
      '<label class="admin-ut-field"><span>' + esc(t('admin.creator_journey.unlock_min_level', 'Min level')) + '</span>' +
      '<input type="number" step="1" min="1" max="99" name="ut_min_level" value="' + esc(String(minLv)) + '"></label>' +
      '</div>' +
      '<label class="admin-ut-check"><input type="checkbox" name="ut_active"' + (active ? ' checked' : '') + '> ' +
      esc(t('admin.creator_journey.unlock_active', 'Active in unlock tree')) + '</label>' +
      '</div></div></article>'
    );
  }

  function genericNodeCardHtml(node) {
    var imageUrl = journeyImageUrl(node);
    var title = nodeTitle(node);
    var nodeKey = node.node_key;
    var view = state.cardImageView[nodeKey] || 'mock';
    var mockUrl = '';
    var extraBadges = [];
    if (node.region_code) {
      extraBadges.push(node.region_code);
    }

    return (
      '<article class="admin-ut-card admin-ut-card--catalog" data-node-key="' + esc(nodeKey) + '" data-ut-category="' + esc(node.category) + '">' +
      imageWrapHtml(nodeKey, mockUrl, imageUrl, view, extraBadges) +
      '<div class="admin-ut-card__body">' +
      '<h4 class="admin-ut-card__title">' + esc(title) + '</h4>' +
      '<p class="admin-ut-card__key">' + esc(node.node_key) + '</p>' +
      '<input type="hidden" name="ut_image_url" value="' + esc(imageUrl) + '">' +
      '<div class="admin-ut-card__fields">' +
      '<label class="admin-ut-field"><span>' + esc(t('admin.creator_journey.unlock_display_title', 'Display title')) + '</span>' +
      '<input type="text" name="ut_title" value="' + esc(title) + '"></label>' +
      '<div class="admin-ut-field-row">' +
      '<label class="admin-ut-field"><span>EAZ</span>' +
      '<input type="number" step="1" min="0" name="ut_cost" value="' + esc(String(node.cost_eaz || 0)) + '"></label>' +
      '<label class="admin-ut-field"><span>' + esc(t('admin.creator_journey.unlock_min_level', 'Min level')) + '</span>' +
      '<input type="number" step="1" min="1" max="99" name="ut_min_level" value="' + esc(String(node.min_level || 2)) + '"></label>' +
      '</div>' +
      '<label class="admin-ut-check"><input type="checkbox" name="ut_active"' + (node.active !== false ? ' checked' : '') + '> ' +
      esc(t('admin.creator_journey.unlock_active', 'Active in unlock tree')) + '</label>' +
      '</div></div></article>'
    );
  }

  function renderCatalogGrid(root) {
    var el = root.querySelector('#adminUtCatalogGrid');
    var titleEl = root.querySelector('#adminUtCatalogSectionTitle');
    if (!el || !state.data) return;

    var cat = state.catalogFilter;
    if (titleEl) titleEl.textContent = catLabel(cat);

    var nodes = state.data.nodes || [];
    var html = '';

    if (cat === 'product') {
      var products = (state.data.online_products || []).filter(function (p) {
        var node = nodeByKey(nodes, 'product:' + p.product_key);
        return productMatchesFilters(p, node);
      });
      if (!products.length) {
        el.innerHTML = '<p class="admin-ut-muted">' + esc(t('admin.creator_journey.unlock_no_online_products', 'No online products found.')) + '</p>';
        return;
      }
      html = products.map(function (p) {
        var node = nodeByKey(nodes, 'product:' + p.product_key);
        return productCardHtml(p, node);
      }).join('');
    } else {
      var filtered = nodes.filter(function (n) { return n.category === cat; });
      if (!filtered.length) {
        el.innerHTML = '<p class="admin-ut-muted">' + esc(t('admin.creator_journey.unlock_cat_empty', 'No items in this category.')) + '</p>';
        return;
      }
      html = filtered.map(genericNodeCardHtml).join('');
    }

    el.innerHTML = '<div class="admin-ut-grid">' + html + '</div>';
  }

  function renderCategoryFilters(root) {
    var nav = root.querySelector('#adminUtCatalogFilters');
    if (!nav || !state.data) return;
    var nodes = state.data.nodes || [];
    nav.innerHTML = CATEGORY_ORDER.map(function (cat) {
      var count = cat === 'product'
        ? (state.data.online_products || []).length
        : nodes.filter(function (n) { return n.category === cat; }).length;
      if (!count) return '';
      var active = state.catalogFilter === cat ? ' is-active' : '';
      return '<button type="button" class="admin-ut-filter' + active + '" data-ut-cat="' + esc(cat) + '">' +
        esc(catLabel(cat)) + ' <span class="admin-ut-filter__count">' + count + '</span></button>';
    }).join('');
  }

  function renderAll(root) {
    renderCategoryFilters(root);
    renderProductFilters(root);
    renderCatalogGrid(root);
  }

  function syncStarterSwitchLabel(checkbox) {
    var label = checkbox && checkbox.closest('.dash-switch');
    if (!label) return;
    label.classList.toggle('is-on', checkbox.checked);
    label.classList.toggle('is-off', !checkbox.checked);
  }

  function updateCardImageDisplay(card) {
    var wrap = card.querySelector('.admin-ut-card__img-wrap');
    if (!wrap) return;
    var mockUrl = wrap.getAttribute('data-mock-url') || '';
    var journeyUrl = wrap.getAttribute('data-journey-url') || '';
    var view = wrap.getAttribute('data-image-view') || 'mock';
    var showJourney = view === 'journey' && journeyUrl;
    var displayUrl = showJourney ? journeyUrl : (mockUrl || journeyUrl || '');
    var img = wrap.querySelector('.admin-ut-card__img');
    if (img && displayUrl) {
      img.src = displayUrl;
    }
    var toggle = wrap.querySelector('.admin-ut-card__img-toggle');
    if (toggle) {
      toggle.hidden = !(journeyUrl && mockUrl && mockUrl !== journeyUrl);
    }
    wrap.classList.toggle('admin-ut-card__img-wrap--preview', !!showJourney);
    var hint = wrap.querySelector('.admin-ut-card__upload-hint');
    if (hint) {
      hint.textContent = showJourney
        ? t('admin.creator_journey.unlock_preview_image_hint', 'Click to preview journey card')
        : t('admin.creator_journey.unlock_upload_image_hint', 'Click to upload journey image');
    }
    wrap.title = hint ? hint.textContent : '';
  }

  function setCardJourneyImage(card, imageUrl) {
    var wrap = card.querySelector('.admin-ut-card__img-wrap');
    if (!wrap) return;
    wrap.setAttribute('data-journey-url', imageUrl);
    var hidden = card.querySelector('input[name="ut_image_url"]');
    if (hidden) hidden.value = imageUrl;

    var existingBadge = wrap.querySelector('.admin-ut-badge--journey');
    if (imageUrl && !existingBadge) {
      var badgeEl = document.createElement('span');
      badgeEl.className = 'admin-ut-badge admin-ut-badge--journey';
      badgeEl.textContent = t('admin.creator_journey.unlock_journey_badge', 'Journey image');
      var hint = wrap.querySelector('.admin-ut-card__upload-hint');
      if (hint) wrap.insertBefore(badgeEl, hint);
      else wrap.appendChild(badgeEl);
    } else if (!imageUrl && existingBadge) {
      existingBadge.remove();
    }

    var nodeKey = card.getAttribute('data-node-key');
    var mockUrl = wrap.getAttribute('data-mock-url') || '';
    if (imageUrl && mockUrl && mockUrl !== imageUrl && !wrap.querySelector('.admin-ut-card__img-toggle')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-ut-card__img-toggle';
      btn.setAttribute('data-ut-img-toggle', nodeKey || '');
      btn.setAttribute('aria-label', t('admin.creator_journey.unlock_toggle_image_aria', 'Switch between mock and journey image'));
      btn.textContent = '⇄';
      wrap.appendChild(btn);
    }

    updateCardImageDisplay(card);
  }

  function tierToRarity(tier) {
    var code = String(tier || 'S').toUpperCase();
    if (code === 'P') return 'legendary';
    if (code === 'M') return 'epic';
    if (code === 'L') return 'rare';
    return 'uncommon';
  }

  function buildPreviewPrizeItem(card, journeyUrl) {
    var titleEl = card.querySelector('.admin-ut-card__title');
    var keyEl = card.querySelector('.admin-ut-card__key');
    var tierSel = card.querySelector('select[name="ut_tier"]');
    var title = titleEl ? titleEl.textContent.trim() : '';
    var slug = keyEl ? keyEl.textContent.trim() : '';
    var tier = tierSel ? tierSel.value : 'S';
    return {
      type: 'prize',
      name: title || slug || 'Unlock item',
      slug: slug,
      category: 'creator',
      rarity: tierToRarity(tier),
      description: t('admin.creator_journey.unlock_preview_modal_label', 'Preview as Eazy Games card'),
      artwork_r2_key: journeyUrl,
      fulfillment_mode: 'cosmetic',
      subtype: 'Unlock',
    };
  }

  function ensureJourneyPreviewModal(root) {
    var existing = root.querySelector('#adminUtJourneyPreview');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = 'adminUtJourneyPreview';
    modal.className = 'admin-ut-journey-preview';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="admin-ut-journey-preview__backdrop" data-ut-preview-close></div>' +
      '<div class="admin-ut-journey-preview__dialog">' +
      '<button type="button" class="admin-ut-journey-preview__close" data-ut-preview-close aria-label="' +
      esc(t('creator.common.close', 'Close')) + '">×</button>' +
      '<p class="admin-ut-journey-preview__label">' +
      esc(t('admin.creator_journey.unlock_preview_modal_label', 'Preview as Eazy Games card')) + '</p>' +
      '<div class="admin-ut-journey-preview__card-wrap" id="adminUtJourneyPreviewCard"></div>' +
      '<div class="admin-ut-journey-preview__actions">' +
      '<button type="button" class="admin-settings-btn admin-settings-btn--secondary" id="adminUtJourneyPreviewReplace">' +
      esc(t('admin.creator_journey.unlock_replace_image', 'Replace image')) + '</button>' +
      '</div></div>';

    var pane = unlockTreeModalHost(root);
    pane.appendChild(modal);

    modal.querySelectorAll('[data-ut-preview-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeJourneyPreview(root); });
    });

    var replaceBtn = modal.querySelector('#adminUtJourneyPreviewReplace');
    if (replaceBtn) {
      replaceBtn.addEventListener('click', function () {
        var nodeKey = modal.getAttribute('data-node-key') || '';
        closeJourneyPreview(root);
        var fileInput = root.querySelector('#adminUtJourneyImageFile');
        if (!fileInput || !nodeKey) return;
        state.pendingUploadNodeKey = nodeKey;
        fileInput.click();
      });
    }

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && modal && !modal.hidden) closeJourneyPreview(root);
    });

    return modal;
  }

  function openJourneyPreview(root, card, nodeKey, journeyUrl) {
    var modal = ensureJourneyPreviewModal(root);
    var cardWrap = modal.querySelector('#adminUtJourneyPreviewCard');
    if (!cardWrap) return;

    modal.setAttribute('data-node-key', nodeKey);
    var prizeItem = buildPreviewPrizeItem(card, journeyUrl);

    cardWrap.innerHTML = '';
    var prizeEl = document.createElement('div');
    if (window.EazyPrizeCards && typeof window.EazyPrizeCards.applyCardElement === 'function') {
      window.EazyPrizeCards.applyCardElement(prizeEl, prizeItem, {
        artMode: 'upload',
        extraClass: 'admin-ut-journey-preview__card',
      });
    } else {
      prizeEl.className = 'admin-ut-journey-preview__fallback';
      prizeEl.innerHTML = '<img src="' + esc(journeyUrl) + '" alt="">';
    }
    cardWrap.appendChild(prizeEl);
    modal.hidden = false;
    document.body.classList.add('admin-ut-journey-preview-open');
    var closeBtn = modal.querySelector('.admin-ut-journey-preview__close');
    if (closeBtn) closeBtn.focus();
  }

  function closeJourneyPreview(root) {
    var modal = root.querySelector('#adminUtJourneyPreview');
    if (!modal) return;
    modal.hidden = true;
    modal.removeAttribute('data-node-key');
    document.body.classList.remove('admin-ut-journey-preview-open');
  }

  function collectPayload(root) {
    var starterKeys = [];
    root.querySelectorAll('.admin-ut-card--catalog[data-ut-category="product"]').forEach(function (card) {
      var starterInp = card.querySelector('input[name="ut_starter"]');
      if (starterInp && starterInp.checked) {
        var pk = card.querySelector('.admin-ut-card__key');
        var keyText = pk ? pk.textContent.trim() : '';
        if (keyText) starterKeys.push(keyText);
      }
    });

    var nodeUpdates = [];
    root.querySelectorAll('.admin-ut-card--catalog[data-node-key]').forEach(function (card) {
      var nodeKey = card.getAttribute('data-node-key');
      if (!nodeKey) return;
      var imageInp = card.querySelector('input[name="ut_image_url"]');
      var titleInp = card.querySelector('input[name="ut_title"]');
      var costInp = card.querySelector('input[name="ut_cost"]');
      var minInp = card.querySelector('input[name="ut_min_level"]');
      var activeInp = card.querySelector('input[name="ut_active"]');
      var tierSel = card.querySelector('select[name="ut_tier"]');

      var payload = {
        node_key: nodeKey,
        cost_eaz: costInp ? parseFloat(costInp.value) : 0,
        min_level: minInp ? parseInt(minInp.value, 10) : 2,
        active: !!(activeInp && activeInp.checked),
        metadata: {
          title: titleInp ? titleInp.value.trim() : '',
          image_url: imageInp ? imageInp.value.trim() : '',
        },
      };
      if (tierSel) payload.product_tier = tierSel.value;
      nodeUpdates.push(payload);
    });

    return { starter_product_keys: starterKeys, nodes: nodeUpdates };
  }

  function setStatus(root, msg, isError) {
    var el = root.querySelector('#adminUtStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('is-error', !!isError);
  }

  function setLoading(root, on) {
    var wrap = root.querySelector('#adminUtLoading');
    var body = root.querySelector('#adminUtBody');
    if (wrap) wrap.hidden = !on;
    if (body) body.hidden = !!on;
  }

  function loadBackgrounds(root) {
    if (!state.apiUrl) return Promise.resolve();
    return fetch(state.apiUrl('admin-journey-background-get', { logged_in_customer_id: state.customerId }), {
      credentials: 'include',
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'bg_load_failed');
        state.bgData = data;
        renderBackgroundAdmin(root);
      })
      .catch(function (err) {
        console.warn('[AdminUnlockTree] bg', err);
      });
  }

  function renderBackgroundAdmin(root) {
    var preview = root.querySelector('#adminUtBgPreview');
    var mobileWrap = root.querySelector('#adminUtBgMobileSourceWrap');
    var useDesktop = root.querySelector('#adminUtBgUseDesktop');
    if (!preview || !state.bgData) return;

    if (useDesktop && state.bgData.settings) {
      useDesktop.checked = !!state.bgData.settings.mobile_use_desktop;
    }
    if (mobileWrap) mobileWrap.hidden = state.bgViewport !== 'mobile';

    var active = (state.bgData.active && state.bgData.active[state.bgViewport]) || null;
    var uploadLabel = t('admin.creator_journey.journey_bg_upload', 'Upload background');
    var removeLabel = t('admin.creator_journey.journey_bg_remove', 'Remove background');

    if (active && active.url) {
      var mediaHtml = active.media_type === 'video'
        ? '<video src="' + esc(active.url) + '" muted loop playsinline autoplay></video>'
        : '<img src="' + esc(active.url) + '" alt="">';
      preview.innerHTML = mediaHtml +
        '<button type="button" class="admin-ut-bg-preview__clear" id="adminUtBgClearBtn" aria-label="' + esc(removeLabel) + '">&times;</button>';
      preview.classList.remove('is-empty');
      preview.classList.add('has-active');
      preview.dataset.activeId = active.id || '';
    } else {
      preview.innerHTML = '<button type="button" class="admin-ut-bg-preview__upload" id="adminUtBgUploadTrigger">' + esc(uploadLabel) + '</button>';
      preview.classList.add('is-empty');
      preview.classList.remove('has-active');
      preview.removeAttribute('data-active-id');
    }
  }

  function uploadBackground(root, file) {
    var fileInput = root.querySelector('#adminUtBgFile');
    var chosen = file || (fileInput && fileInput.files && fileInput.files[0]);
    if (!chosen || !state.apiUrl) return Promise.resolve();
    var fd = new FormData();
    fd.append('viewport', state.bgViewport);
    fd.append('file', chosen);
    return fetch(state.apiUrl('admin-journey-background-upload', { logged_in_customer_id: state.customerId }), {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'upload_failed');
        if (fileInput) fileInput.value = '';
        if (data.item && data.item.id) {
          return activateBackground(root, data.item.id);
        }
        return loadBackgrounds(root);
      });
  }

  function clearActiveBackground(root) {
    var preview = root.querySelector('#adminUtBgPreview');
    var id = preview && preview.dataset.activeId;
    if (!id) return Promise.resolve();
    return deleteBackground(root, id);
  }

  function uploadJourneyImage(root, nodeKey, file) {
    if (!state.apiUrl || !file) return Promise.resolve();
    setStatus(root, t('admin.creator_journey.unlock_image_uploading', 'Uploading image…'));
    var fd = new FormData();
    fd.append('file', file);
    fd.append('node_key', nodeKey);
    return fetch(state.apiUrl('admin-unlock-journey-image-upload', { logged_in_customer_id: state.customerId }), {
      method: 'POST',
      credentials: 'include',
      body: fd,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'upload_failed');
        var card = root.querySelector('.admin-ut-card--catalog[data-node-key="' + nodeKey + '"]');
        if (card) {
          setCardJourneyImage(card, data.image_url || '');
          state.cardImageView[nodeKey] = 'journey';
          var wrap = card.querySelector('.admin-ut-card__img-wrap');
          if (wrap) wrap.setAttribute('data-image-view', 'journey');
          updateCardImageDisplay(card);
        }
        setStatus(root, '');
      })
      .catch(function (err) {
        setStatus(root, err.message || 'Upload failed', true);
      });
  }

  function activateBackground(root, id) {
    return fetch(state.apiUrl('admin-journey-background-activate', { logged_in_customer_id: state.customerId }), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'activate_failed');
        return loadBackgrounds(root);
      });
  }

  function deleteBackground(root, id) {
    return fetch(state.apiUrl('admin-journey-background-delete', { logged_in_customer_id: state.customerId }), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'delete_failed');
        return loadBackgrounds(root);
      });
  }

  function setMobileBgSource(root, useDesktop) {
    return fetch(state.apiUrl('admin-journey-background-set-mobile-source', { logged_in_customer_id: state.customerId }), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_desktop: !!useDesktop }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'settings_failed');
        return loadBackgrounds(root);
      });
  }

  function load(root, apiUrl, customerId) {
    root = resolveAdminRoot(root);
    state.apiUrl = apiUrl;
    state.customerId = customerId;
    if (state.loading) return Promise.resolve();
    state.loading = true;
    setLoading(root, true);
    setStatus(root, '');

    return fetch(apiUrl('admin-get-unlock-tree-settings', { logged_in_customer_id: customerId }), {
      credentials: 'include',
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'load_failed');
        state.data = data;
        state.loaded = true;
        if (!state.productFilters.starter) state.productFilters = defaultProductFilters();
        renderAll(root);
        return loadBackgrounds(root);
      })
      .catch(function (err) {
        setStatus(root, err.message || 'Network error', true);
      })
      .finally(function () {
        state.loading = false;
        setLoading(root, false);
      });
  }

  function save(root) {
    if (!state.apiUrl || !state.data) return Promise.resolve();
    var payload = collectPayload(root);
    var btn = root.querySelector('#adminUtSaveBtn');
    if (btn) btn.disabled = true;
    setStatus(root, t('admin.creator_journey.unlock_saving', 'Saving…'));

    return fetch(state.apiUrl('admin-save-unlock-tree', { logged_in_customer_id: state.customerId }), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'save_failed');
        state.data.starter_product_keys = data.starter_product_keys || payload.starter_product_keys;
        state.data.nodes = data.nodes || state.data.nodes;
        renderAll(root);
        setStatus(root, t('admin.creator_journey.unlock_saved', 'Unlock tree saved.'));
        var foot =
          root.querySelector('.admin-cc-unlock-footer') ||
          root.querySelector('.admin-creator-footer-bar');
        if (foot) {
          foot.classList.add('admin-creator-footer-bar--pulse');
          setTimeout(function () { foot.classList.remove('admin-creator-footer-bar--pulse'); }, 700);
        }
      })
      .catch(function (err) {
        setStatus(root, err.message || 'Save failed', true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function bind(root) {
    root = resolveAdminRoot(root);
    if (!root || typeof root.getAttribute !== 'function') return;
    if (root.getAttribute('data-ut-bound')) return;
    root.setAttribute('data-ut-bound', '1');

    document.addEventListener('click', function (e) {
      var filtersWrap = root.querySelector('#adminUtProductFilters');
      if (filtersWrap && !filtersWrap.contains(e.target)) {
        var panel = filtersWrap.querySelector('.admin-ut-filter-panel');
        var btn = filtersWrap.querySelector('.admin-ut-filter-icon-btn');
        if (panel) panel.classList.remove('is-open');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    });

    root.addEventListener('click', function (ev) {
      var host = unlockTreeClickHost(root, ev.target);
      if (!host) return;

      var filterBtn = ev.target.closest('[data-ut-cat]');
      if (filterBtn && filterBtn.closest('#adminUtCatalogFilters')) {
        ev.preventDefault();
        state.catalogFilter = filterBtn.getAttribute('data-ut-cat') || 'product';
        renderCategoryFilters(root);
        renderProductFilters(root);
        renderCatalogGrid(root);
        return;
      }

      var imgToggle = ev.target.closest('[data-ut-img-toggle]');
      if (imgToggle) {
        ev.preventDefault();
        ev.stopPropagation();
        var card = imgToggle.closest('.admin-ut-card--catalog');
        var wrap = card && card.querySelector('.admin-ut-card__img-wrap');
        if (!wrap) return;
        var nodeKey = card.getAttribute('data-node-key');
        var current = wrap.getAttribute('data-image-view') || 'mock';
        var next = current === 'journey' ? 'mock' : 'journey';
        wrap.setAttribute('data-image-view', next);
        if (nodeKey) state.cardImageView[nodeKey] = next;
        updateCardImageDisplay(card);
        return;
      }

      var ccUnlock = root.querySelector('#adminCcUnlockTreePanel');
      var inCcUnlock = ccUnlock && !ccUnlock.hidden;

      var catalogCard = ev.target.closest('.admin-ut-card--catalog');
      if (catalogCard && inCcUnlock && ccUnlock.contains(catalogCard)) {
        if (!ev.target.closest('input, select, textarea, button, label, .admin-ut-starter-switch, .dash-switch')) {
          ev.preventDefault();
          var cardNodeKey = catalogCard.getAttribute('data-node-key');
          var pkEl = catalogCard.querySelector('.admin-ut-card__key');
          var titleEl = catalogCard.querySelector('.admin-ut-card__title');
          if (window.AdminCollectionCards && typeof window.AdminCollectionCards.openForUnlockNode === 'function') {
            window.AdminCollectionCards.openForUnlockNode(
              cardNodeKey,
              pkEl ? pkEl.textContent.trim() : '',
              titleEl ? titleEl.textContent.trim() : ''
            );
            return;
          }
        }
      }

      var uploadWrap = ev.target.closest('.admin-ut-card__img-wrap--upload');
      if (uploadWrap && !ev.target.closest('.admin-ut-card__img-toggle')) {
        ev.preventDefault();
        var nodeKey = uploadWrap.getAttribute('data-ut-upload-node');
        if (inCcUnlock && ccUnlock.contains(uploadWrap)) {
          if (window.AdminCollectionCards && typeof window.AdminCollectionCards.openForUnlockNode === 'function') {
            var utCard = uploadWrap.closest('.admin-ut-card--catalog');
            var utPk = utCard && utCard.querySelector('.admin-ut-card__key');
            var utTitle = utCard && utCard.querySelector('.admin-ut-card__title');
            window.AdminCollectionCards.openForUnlockNode(
              nodeKey,
              utPk ? utPk.textContent.trim() : '',
              utTitle ? utTitle.textContent.trim() : ''
            );
            return;
          }
        }
        var journeyUrl = (uploadWrap.getAttribute('data-journey-url') || '').trim();
        var view = uploadWrap.getAttribute('data-image-view') || 'mock';
        var card = uploadWrap.closest('.admin-ut-card--catalog');
        if (journeyUrl && view === 'journey' && card) {
          openJourneyPreview(root, card, nodeKey, journeyUrl);
          return;
        }
        var fileInput = root.querySelector('#adminUtJourneyImageFile');
        if (!fileInput || !nodeKey) return;
        state.pendingUploadNodeKey = nodeKey;
        fileInput.click();
        return;
      }

      var saveBtn = ev.target.closest('#adminUtSaveBtn');
      if (saveBtn) {
        ev.preventDefault();
        save(root);
        return;
      }

      var bgTab = ev.target.closest('[data-ut-bg-viewport]');
      if (bgTab && bgTab.closest('#adminUtBgTabs')) {
        ev.preventDefault();
        state.bgViewport = bgTab.getAttribute('data-ut-bg-viewport') || 'desktop';
        root.querySelectorAll('[data-ut-bg-viewport]').forEach(function (b) {
          b.classList.toggle('is-active', b === bgTab);
        });
        renderBackgroundAdmin(root);
        return;
      }

      var bgUploadTrigger = ev.target.closest('#adminUtBgUploadTrigger');
      var bgPreviewEmpty = ev.target.closest('#adminUtBgPreview.is-empty');
      if (bgUploadTrigger || bgPreviewEmpty) {
        ev.preventDefault();
        var bgFileInput = root.querySelector('#adminUtBgFile');
        if (bgFileInput) bgFileInput.click();
        return;
      }

      var bgClear = ev.target.closest('#adminUtBgClearBtn');
      if (bgClear) {
        ev.preventDefault();
        clearActiveBackground(root).catch(function (e) { setStatus(root, e.message, true); });
        return;
      }

      var bgAct = ev.target.closest('[data-ut-bg-activate]');
      if (bgAct) {
        ev.preventDefault();
        activateBackground(root, bgAct.getAttribute('data-ut-bg-activate')).catch(function (e) { setStatus(root, e.message, true); });
        return;
      }

      var bgDel = ev.target.closest('[data-ut-bg-delete]');
      if (bgDel) {
        ev.preventDefault();
        if (!window.confirm('Delete this background?')) return;
        deleteBackground(root, bgDel.getAttribute('data-ut-bg-delete')).catch(function (e) { setStatus(root, e.message, true); });
        return;
      }
    });

    root.addEventListener('change', function (ev) {
      var starterInp = ev.target.closest('input[name="ut_starter"]');
      if (starterInp) {
        ev.stopPropagation();
        syncStarterSwitchLabel(starterInp);
        var card = starterInp.closest('.admin-ut-card--catalog');
        var pkEl = card && card.querySelector('.admin-ut-card__key');
        if (pkEl && state.data) {
          var key = pkEl.textContent.trim();
          var keys = new Set((state.data.starter_product_keys || []).map(String));
          if (starterInp.checked) keys.add(key);
          else keys.delete(key);
          state.data.starter_product_keys = Array.from(keys);
        }
      }
    });

    var journeyFileInput = root.querySelector('#adminUtJourneyImageFile');
    if (journeyFileInput) {
      journeyFileInput.addEventListener('change', function () {
        var file = journeyFileInput.files && journeyFileInput.files[0];
        var nodeKey = state.pendingUploadNodeKey;
        journeyFileInput.value = '';
        state.pendingUploadNodeKey = null;
        if (file && nodeKey) {
          uploadJourneyImage(root, nodeKey, file);
        }
      });
    }

    var useDesktopChk = root.querySelector('#adminUtBgUseDesktop');
    if (useDesktopChk) {
      useDesktopChk.addEventListener('change', function () {
        setMobileBgSource(root, useDesktopChk.checked).catch(function (e) { setStatus(root, e.message, true); });
      });
    }

    var bgFileInput = root.querySelector('#adminUtBgFile');
    if (bgFileInput && !bgFileInput.dataset.bound) {
      bgFileInput.dataset.bound = '1';
      bgFileInput.addEventListener('change', function () {
        var file = bgFileInput.files && bgFileInput.files[0];
        bgFileInput.value = '';
        if (!file) return;
        uploadBackground(root, file).catch(function (e) { setStatus(root, e.message, true); });
      });
    }
  }

  function onTabShown(root, apiUrl, customerId) {
    root = resolveAdminRoot(root);
    state.apiUrl = apiUrl;
    state.customerId = customerId;
    bind(root);
    if (!state.loaded) {
      load(root, apiUrl, customerId);
    }
  }

  function onModalSettingsShown(root, apiUrl, customerId) {
    root = resolveAdminRoot(root);
    state.apiUrl = apiUrl;
    state.customerId = customerId;
    bind(root);
    loadBackgrounds(root);
  }

  function reset() {
    state.loaded = false;
    state.loading = false;
    state.data = null;
    state.productFilters = defaultProductFilters();
    state.cardImageView = {};
  }

  window.AdminUnlockTree = {
    onTabShown: onTabShown,
    onModalSettingsShown: onModalSettingsShown,
    load: load,
    save: save,
    reset: reset,
  };
})();
