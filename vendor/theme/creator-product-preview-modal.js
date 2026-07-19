/**
 * Creator Product Preview Modal (IDEA-041)
 * Opens from Creations → Products. Overview / Variants / Channels.
 * Deep edits go to Creator Design Studio.
 */
(function () {
  'use strict';

  var ROOT_ID = 'creator-product-preview-modal';
  var STAT_KEYS = ['sales', 'add_to_cart', 'impressions', 'clicks'];
  var CHANNEL_STAT_IDS = ['eazpire', 'amazon', 'etsy', 'ebay'];

  /**
   * Amazon marketplaces we sell on (aligned with src/config/amazonMarketplaces.js + MX).
   * Later filtered by product ship-from / publish map.
   */
  var AMAZON_REGIONS = [
    { id: 'A1PA6795UKMFR9', code: 'DE', label: 'Amazon.de' },
    { id: 'A13V1IB3VIYZZH', code: 'FR', label: 'Amazon.fr' },
    { id: 'APJ6JRA9NG5V4', code: 'IT', label: 'Amazon.it' },
    { id: 'A1RKKUPIHCS9HS', code: 'ES', label: 'Amazon.es' },
    { id: 'A1805IZSGTT6HS', code: 'NL', label: 'Amazon.nl' },
    { id: 'AMEN7PMS3EDWL', code: 'BE', label: 'Amazon.com.be' },
    { id: 'A1C3SOZ6ARJ6G9', code: 'PL', label: 'Amazon.pl' },
    { id: 'A2NODRKZP88ZB9', code: 'SE', label: 'Amazon.se' },
    { id: 'A1F83G8C2ARO7P', code: 'UK', label: 'Amazon.co.uk' },
    { id: 'A1EVM2S7H5RM6G', code: 'IE', label: 'Amazon.ie' },
    { id: 'A33AVAJ2PDY3EV', code: 'TR', label: 'Amazon.com.tr' },
    { id: 'A2VIGQ35RCS4UG', code: 'AE', label: 'Amazon.ae' },
    { id: 'A17EUQ2OIB8DTQ', code: 'SA', label: 'Amazon.sa' },
    { id: 'A21TJRUUN4KGV', code: 'IN', label: 'Amazon.in' },
    { id: 'ARBP9OOSHTCHU', code: 'EG', label: 'Amazon.eg' },
    { id: 'A1AM78C64UM0Y8', code: 'MX', label: 'Amazon.com.mx' },
    { id: 'ATVPDKIKX0DER', code: 'US', label: 'Amazon.com' },
    { id: 'A2EUQ1WTGCTBG2', code: 'CA', label: 'Amazon.ca' },
  ];

  var root = null;
  var isOpen = false;
  var collapsed = false;
  var activePanel = 'overview';
  var ctx = null;
  var channelState = {};
  var amazonExpanded = false;
  var studioLoadPromise = null;
  var boundOnce = false;

  function t(key, fallback) {
    var i18n = window.CreatorI18n || {};
    var nested = i18n.product_preview || i18n.productPreview;
    if (nested && nested[key]) return String(nested[key]);
    var camel =
      'productPreview' +
      String(key)
        .split('_')
        .map(function (p, i) {
          if (!i) return p.charAt(0).toUpperCase() + p.slice(1);
          return p.charAt(0).toUpperCase() + p.slice(1);
        })
        .join('');
    if (i18n[camel]) return String(i18n[camel]);
    if (i18n[key]) return String(i18n[key]);
    return fallback || key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiBase() {
    var cfg = window.CREATOR_API_CONFIG;
    if (cfg && typeof cfg.getDispatchUrl === 'function') {
      try {
        var via = cfg.getDispatchUrl();
        if (via) return String(via).replace(/\/+$/, '');
      } catch (_e) {}
    }
    var base =
      (cfg && cfg.BASE_URL) ||
      window.__CREATOR_API_BASE ||
      'https://creator-engine.eazpire.workers.dev';
    base = String(base).replace(/\/+$/, '');
    if (/\/api\/dispatch$/i.test(base) || /\/apps\/creator-dispatch$/i.test(base)) return base;
    try {
      if (
        window.location &&
        window.location.hostname &&
        (window.location.hostname === 'creator.eazpire.com' ||
          window.location.hostname.indexOf('creator.') === 0)
      ) {
        return String(window.location.origin || '').replace(/\/+$/, '') + '/api/dispatch';
      }
    } catch (_e2) {}
    return base + '/apps/creator-dispatch';
  }

  function fetchJSON(url) {
    return fetch(url, { credentials: 'include' }).then(function (r) {
      return r.json().catch(function () {
        return {};
      });
    });
  }

  function viewLabel(key) {
    var k = String(key || 'front').replace(/_/g, ' ');
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  function ensureDom() {
    if (root && document.body.contains(root)) return root;
    root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'cppm';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<button type="button" class="cppm__backdrop" data-cppm-close="1" aria-label="' +
      esc(t('close', 'Close')) +
      '"></button>' +
      '<div class="cppm__shell">' +
      '  <aside class="cppm__sidebar">' +
      '    <div class="cppm__sidebar-top">' +
      '      <button type="button" class="cppm__collapse" data-cppm-collapse="1" aria-label="' +
      esc(t('collapse_sidebar', 'Collapse sidebar')) +
      '">‹</button>' +
      '    </div>' +
      '    <nav class="cppm__nav" aria-label="' +
      esc(t('title', 'Product Preview')) +
      '">' +
      '      <button type="button" class="cppm__nav-btn cppm__nav-btn--active" data-cppm-nav="overview">' +
      '        <span class="cppm__nav-icon" aria-hidden="true">◎</span>' +
      '        <span class="cppm__nav-label" data-t="creator.product_preview.overview">' +
      esc(t('overview', 'Overview')) +
      '</span>' +
      '      </button>' +
      '      <button type="button" class="cppm__nav-btn" data-cppm-nav="variants">' +
      '        <span class="cppm__nav-icon" aria-hidden="true">▦</span>' +
      '        <span class="cppm__nav-label" data-t="creator.product_preview.variants">' +
      esc(t('variants', 'Variants')) +
      '</span>' +
      '      </button>' +
      '      <button type="button" class="cppm__nav-btn" data-cppm-nav="channels">' +
      '        <span class="cppm__nav-icon" aria-hidden="true">⬡</span>' +
      '        <span class="cppm__nav-label" data-t="creator.product_preview.channels">' +
      esc(t('channels', 'Channels')) +
      '</span>' +
      '      </button>' +
      '    </nav>' +
      '    <div class="cppm__sidebar-footer">' +
      '      <button type="button" class="cppm__studio-btn" data-cppm-studio="1">' +
      '        <span aria-hidden="true">✎</span>' +
      '        <span class="cppm__studio-label" data-t="creator.product_preview.edit_in_design_studio">' +
      esc(t('edit_in_design_studio', 'Edit in Design Studio')) +
      '</span>' +
      '      </button>' +
      '    </div>' +
      '  </aside>' +
      '  <div class="cppm__main">' +
      '    <header class="cppm__header">' +
      '      <h2 class="cppm__title" data-cppm-title="1"></h2>' +
      '      <button type="button" class="cppm__close" data-cppm-close="1" aria-label="' +
      esc(t('close', 'Close')) +
      '">×</button>' +
      '    </header>' +
      '    <div class="cppm__body">' +
      '      <section class="cppm__panel" data-cppm-panel="overview"></section>' +
      '      <section class="cppm__panel" data-cppm-panel="variants" hidden></section>' +
      '      <section class="cppm__panel" data-cppm-panel="channels" hidden></section>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(root);
    return root;
  }

  function bindEvents() {
    if (boundOnce || !root) return;
    boundOnce = true;

    root.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.closest) return;

      if (target.closest('[data-cppm-close]')) {
        close();
        return;
      }

      var collapseBtn = target.closest('[data-cppm-collapse]');
      if (collapseBtn) {
        collapsed = !collapsed;
        root.classList.toggle('cppm--collapsed', collapsed);
        collapseBtn.textContent = collapsed ? '›' : '‹';
        collapseBtn.setAttribute(
          'aria-label',
          collapsed
            ? t('expand_sidebar', 'Expand sidebar')
            : t('collapse_sidebar', 'Collapse sidebar')
        );
        return;
      }

      var navBtn = target.closest('[data-cppm-nav]');
      if (navBtn) {
        setPanel(navBtn.getAttribute('data-cppm-nav') || 'overview');
        return;
      }

      if (target.closest('[data-cppm-studio]')) {
        openDesignStudio();
        return;
      }

      var carBtn = target.closest('[data-cppm-carousel]');
      if (carBtn) {
        var trackId = carBtn.getAttribute('data-cppm-carousel');
        var track = root.querySelector('[data-cppm-track="' + trackId + '"]');
        if (track) {
          var dir = carBtn.getAttribute('data-cppm-dir') === 'prev' ? -1 : 1;
          var step = trackId === 'channels' ? 232 : trackId === 'amazon-regions' ? 180 : 180;
          track.scrollBy({ left: dir * step, behavior: 'smooth' });
        }
        return;
      }

      if (target.closest('[data-cppm-amazon-toggle]')) {
        amazonExpanded = !amazonExpanded;
        renderChannelsPanel();
        return;
      }

      var channelTile = target.closest('[data-cppm-channel-tile]');
      if (channelTile) {
        var tileId = channelTile.getAttribute('data-cppm-channel-tile');
        if (tileId === 'amazon') {
          amazonExpanded = !amazonExpanded;
          renderChannelsPanel();
        }
        return;
      }

      var pubBtn = target.closest('[data-cppm-publish]');
      if (pubBtn) {
        var ch = pubBtn.getAttribute('data-cppm-publish');
        var region = pubBtn.getAttribute('data-cppm-region') || '';
        runQueueAction(ch, region, 'publish');
        return;
      }

      var unpubBtn = target.closest('[data-cppm-unpublish]');
      if (unpubBtn) {
        var ch2 = unpubBtn.getAttribute('data-cppm-unpublish');
        var region2 = unpubBtn.getAttribute('data-cppm-region') || '';
        runQueueAction(ch2, region2, 'unpublish');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  }

  function setPanel(name) {
    activePanel = name || 'overview';
    if (!root) return;
    var navBtns = root.querySelectorAll('[data-cppm-nav]');
    for (var i = 0; i < navBtns.length; i++) {
      navBtns[i].classList.toggle(
        'cppm__nav-btn--active',
        navBtns[i].getAttribute('data-cppm-nav') === activePanel
      );
    }
    var panels = root.querySelectorAll('[data-cppm-panel]');
    for (var j = 0; j < panels.length; j++) {
      var p = panels[j];
      var match = p.getAttribute('data-cppm-panel') === activePanel;
      if (match) p.removeAttribute('hidden');
      else p.setAttribute('hidden', '');
    }
  }

  function placeholderStatsHtml(channelId, channelLabel) {
    var cells = STAT_KEYS.map(function (k) {
      var label =
        k === 'sales'
          ? t('stats_sales', 'Sales')
          : k === 'add_to_cart'
            ? t('stats_add_to_cart', 'Add to Cart')
            : k === 'impressions'
              ? t('stats_impressions', 'Impressions')
              : t('stats_clicks', 'Clicks');
      var dataT =
        'creator.product_preview.stats_' +
        (k === 'add_to_cart' ? 'add_to_cart' : k);
      return (
        '<div class="cppm__stat">' +
        '<span class="cppm__stat-label" data-t="' +
        dataT +
        '">' +
        esc(label) +
        '</span>' +
        '<span class="cppm__stat-value cppm__stat-value--placeholder" data-t="creator.product_preview.stats_placeholder">' +
        esc(t('stats_placeholder', '—')) +
        '</span>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="cppm__stats-block" data-cppm-stats-channel="' +
      esc(channelId) +
      '">' +
      '<h4 class="cppm__stats-block-title">' +
      esc(channelLabel) +
      '</h4>' +
      '<div class="cppm__stats-grid">' +
      cells +
      '</div>' +
      '</div>'
    );
  }

  function renderOverviewPanel() {
    var el = root && root.querySelector('[data-cppm-panel="overview"]');
    if (!el) return;
    var labels = {
      eazpire: t('channel_eazpire', 'Eazpire'),
      amazon: t('channel_amazon', 'Amazon'),
      etsy: t('channel_etsy', 'Etsy'),
      ebay: t('channel_ebay', 'eBay'),
    };
    var html =
      '<h3 class="cppm__section-title" data-t="creator.product_preview.overview">' +
      esc(t('overview', 'Overview')) +
      '</h3><div class="cppm__channel-stats">';
    html += placeholderStatsHtml('all', t('stats_section_all', 'All channels'));
    for (var i = 0; i < CHANNEL_STAT_IDS.length; i++) {
      var id = CHANNEL_STAT_IDS[i];
      html += placeholderStatsHtml(id, labels[id] || id);
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function buildVariantGroups(defaultsResp) {
    var groups = [];
    var printAreas = (defaultsResp && defaultsResp.print_areas) || [];
    for (var i = 0; i < printAreas.length; i++) {
      var pa = printAreas[i];
      var viewKey = pa.print_area_key || 'front';
      var byColor = pa.mockup_images_by_color || null;
      var items = [];
      if (byColor && typeof byColor === 'object') {
        Object.keys(byColor).forEach(function (colorName) {
          items.push({ color: colorName, url: byColor[colorName] });
        });
      } else if (pa.template_url) {
        items.push({ color: pa.template_color || viewLabel(viewKey), url: pa.template_url });
      }
      if (items.length) {
        groups.push({ viewKey: viewKey, items: items });
      }
    }
    if (!groups.length && ctx && ctx.imageUrl) {
      groups.push({
        viewKey: 'front',
        items: [{ color: ctx.productName || 'Product', url: ctx.imageUrl }],
      });
    }
    return groups;
  }

  function renderVariantsPanel(defaultsResp) {
    var el = root && root.querySelector('[data-cppm-panel="variants"]');
    if (!el) return;
    var groups = buildVariantGroups(defaultsResp);
    if (!groups.length) {
      el.innerHTML =
        '<h3 class="cppm__section-title" data-t="creator.product_preview.variants">' +
        esc(t('variants', 'Variants')) +
        '</h3><p class="cppm__empty" data-t="creator.product_preview.no_variants">' +
        esc(t('no_variants', 'No variants available yet.')) +
        '</p>';
      return;
    }

    var html =
      '<h3 class="cppm__section-title" data-t="creator.product_preview.variants">' +
      esc(t('variants', 'Variants')) +
      '</h3><div class="cppm__variants">';

    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var trackId = 'v-' + group.viewKey + '-' + g;
      html +=
        '<div class="cppm__view-block">' +
        '<h4 class="cppm__view-title">' +
        esc(viewLabel(group.viewKey)) +
        '</h4>' +
        '<div class="cppm__carousel">' +
        '<button type="button" class="cppm__carousel-btn" data-cppm-carousel="' +
        esc(trackId) +
        '" data-cppm-dir="prev" aria-label="Previous">‹</button>' +
        '<div class="cppm__carousel-track" data-cppm-track="' +
        esc(trackId) +
        '">';
      for (var i = 0; i < group.items.length; i++) {
        var item = group.items[i];
        html +=
          '<article class="cppm__variant-card">' +
          '<img src="' +
          esc(item.url) +
          '" alt="' +
          esc(item.color) +
          '" loading="lazy" />' +
          '<div class="cppm__variant-card-label">' +
          esc(item.color) +
          '</div>' +
          '</article>';
      }
      html +=
        '</div>' +
        '<button type="button" class="cppm__carousel-btn" data-cppm-carousel="' +
        esc(trackId) +
        '" data-cppm-dir="next" aria-label="Next">›</button>' +
        '</div></div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function stateKey(channel, region) {
    return region ? channel + ':' + region : channel;
  }

  function getState(channel, region) {
    var key = stateKey(channel, region);
    if (!channelState[key]) {
      channelState[key] = {
        status: channel === 'eazpire' ? 'published' : 'unpublished',
        queue: false,
      };
    }
    return channelState[key];
  }

  function statusLabel(st) {
    if (st.queue) {
      return (
        '<span class="cppm__queue"><span class="cppm__queue-spinner" aria-hidden="true"></span>' +
        '<span data-t="creator.product_preview.queue">' +
        esc(t('queue', 'Queue')) +
        '</span></span>'
      );
    }
    if (st.status === 'published') {
      return (
        '<span class="cppm__channel-status cppm__channel-status--published" data-t="creator.product_preview.published">' +
        esc(t('published', 'Published')) +
        '</span>'
      );
    }
    return (
      '<span class="cppm__channel-status" data-t="creator.product_preview.unpublished">' +
      esc(t('unpublished', 'Not published')) +
      '</span>'
    );
  }

  function actionButtons(channel, region, st) {
    if (st.queue) return '';
    var regionAttr = region ? ' data-cppm-region="' + esc(region) + '"' : '';
    if (st.status === 'published') {
      return (
        '<button type="button" class="cppm__btn cppm__btn--ghost" data-cppm-unpublish="' +
        esc(channel) +
        '"' +
        regionAttr +
        ' data-t="creator.product_preview.unpublish">' +
        esc(t('unpublish', 'Unpublish')) +
        '</button>'
      );
    }
    return (
      '<button type="button" class="cppm__btn cppm__btn--primary" data-cppm-publish="' +
      esc(channel) +
      '"' +
      regionAttr +
      ' data-t="creator.product_preview.publish">' +
      esc(t('publish', 'Publish')) +
      '</button>'
    );
  }

  function availableAmazonRegions() {
    // v1: full sell list; later filter by product_publish_map / ship-from
    return AMAZON_REGIONS.slice();
  }

  function amazonPublishedCount(regions) {
    var n = 0;
    for (var i = 0; i < regions.length; i++) {
      if (getState('amazon', regions[i].code).status === 'published') n++;
    }
    return n;
  }

  function renderChannelTile(opts) {
    var id = opts.id;
    var name = opts.name;
    var dataT = opts.dataT;
    var soon = !!opts.soon;
    var expanded = !!opts.expanded;
    var st = opts.state || null;
    var meta = opts.meta || '';
    var actions = opts.actions || '';

    return (
      '<article class="cppm__channel-tile cppm__channel-tile--' +
      esc(id) +
      (expanded ? ' cppm__channel-tile--expanded' : '') +
      (soon ? ' cppm__channel-tile--soon' : '') +
      '"' +
      (id === 'amazon' ? ' data-cppm-channel-tile="amazon"' : '') +
      ' role="listitem">' +
      '<div class="cppm__channel-tile-top">' +
      '<h4 class="cppm__channel-name" data-t="' +
      esc(dataT) +
      '">' +
      esc(name) +
      '</h4>' +
      (soon
        ? '<span class="cppm__badge-soon" data-t="creator.product_preview.coming_soon">' +
          esc(t('coming_soon', 'Coming soon')) +
          '</span>'
        : st
          ? statusLabel(st)
          : '') +
      '</div>' +
      (meta ? '<p class="cppm__channel-tile-meta">' + meta + '</p>' : '') +
      (actions ? '<div class="cppm__channel-actions">' + actions + '</div>' : '') +
      '</article>'
    );
  }

  function renderChannelsPanel() {
    var el = root && root.querySelector('[data-cppm-panel="channels"]');
    if (!el) return;

    var eaz = getState('eazpire');
    var regions = availableAmazonRegions();
    var amzPublished = amazonPublishedCount(regions);
    var amzMeta =
      (amazonExpanded ? '▾ ' : '▸ ') +
      esc(t('amazon_regions', 'Amazon regions')) +
      ' · ' +
      amzPublished +
      '/' +
      regions.length;

    var html =
      '<h3 class="cppm__section-title" data-t="creator.product_preview.channels">' +
      esc(t('channels', 'Channels')) +
      '</h3>' +
      '<div class="cppm__channels-carousel" aria-label="' +
      esc(t('channels', 'Channels')) +
      '">' +
      '<button type="button" class="cppm__carousel-btn cppm__carousel-btn--channels" data-cppm-carousel="channels" data-cppm-dir="prev" aria-label="Previous">‹</button>' +
      '<div class="cppm__channels-track cppm__scroll-hide" data-cppm-track="channels" role="list">';

    html += renderChannelTile({
      id: 'eazpire',
      name: t('channel_eazpire', 'eazpire'),
      dataT: 'creator.product_preview.channel_eazpire',
      state: eaz,
      actions: actionButtons('eazpire', '', eaz),
    });

    html += renderChannelTile({
      id: 'amazon',
      name: t('channel_amazon', 'Amazon'),
      dataT: 'creator.product_preview.channel_amazon',
      expanded: amazonExpanded,
      meta: amzMeta,
      state:
        amzPublished > 0
          ? { status: 'published', queue: false }
          : { status: 'unpublished', queue: false },
    });

    html += renderChannelTile({
      id: 'etsy',
      name: t('channel_etsy', 'Etsy'),
      dataT: 'creator.product_preview.channel_etsy',
      soon: true,
    });

    html += renderChannelTile({
      id: 'ebay',
      name: t('channel_ebay', 'eBay'),
      dataT: 'creator.product_preview.channel_ebay',
      soon: true,
    });

    html +=
      '</div>' +
      '<button type="button" class="cppm__carousel-btn cppm__carousel-btn--channels" data-cppm-carousel="channels" data-cppm-dir="next" aria-label="Next">›</button>' +
      '</div>';

    if (amazonExpanded) {
      html +=
        '<div class="cppm__amazon-expand">' +
        '<div class="cppm__amazon-line" aria-hidden="true"></div>' +
        '<div class="cppm__amazon-regions-wrap">' +
        '<button type="button" class="cppm__carousel-btn" data-cppm-carousel="amazon-regions" data-cppm-dir="prev" aria-label="Previous">‹</button>' +
        '<div class="cppm__amazon-regions cppm__scroll-hide" data-cppm-track="amazon-regions" role="list">';
      for (var r = 0; r < regions.length; r++) {
        var reg = regions[r];
        var st = getState('amazon', reg.code);
        html +=
          '<div class="cppm__region-card" role="listitem">' +
          '<h5 class="cppm__region-name">' +
          esc(reg.label) +
          '</h5>' +
          statusLabel(st) +
          '<div class="cppm__channel-actions">' +
          actionButtons('amazon', reg.code, st) +
          '</div></div>';
      }
      html +=
        '</div>' +
        '<button type="button" class="cppm__carousel-btn" data-cppm-carousel="amazon-regions" data-cppm-dir="next" aria-label="Next">›</button>' +
        '</div></div>';
    }

    el.innerHTML = html;
  }

  function runQueueAction(channel, region, action) {
    if (channel === 'etsy' || channel === 'ebay') return;
    var st = getState(channel, region);
    if (st.queue) return;
    st.queue = true;
    renderChannelsPanel();

    // Phase 1: queue UX; real Amazon/Eazpire queue wiring in Phase 2
    window.setTimeout(function () {
      st.queue = false;
      st.status = action === 'publish' ? 'published' : 'unpublished';
      if (isOpen) renderChannelsPanel();
    }, 1400);
  }

  function inferStudioScriptUrl() {
    if (window.__CREATOR_STUDIO_MODAL_JS) return window.__CREATOR_STUDIO_MODAL_JS;
    var bundle = window.__CREATOR_LAZY_CREATIONS_BUNDLE || [];
    for (var i = 0; i < bundle.length; i++) {
      if (String(bundle[i] || '').indexOf('creator-design-studio-modal.js') !== -1) {
        return bundle[i];
      }
    }
    try {
      var scripts = document.getElementsByTagName('script');
      for (var s = 0; s < scripts.length; s++) {
        var src = scripts[s].src || '';
        if (src.indexOf('creator-creations-screen.js') !== -1) {
          return src.replace('creator-creations-screen.js', 'creator-design-studio-modal.js');
        }
      }
    } catch (_e) {}
    return '';
  }

  function ensureStudioScript() {
    if (window.CreatorDesignStudioModal && typeof window.CreatorDesignStudioModal.open === 'function') {
      return Promise.resolve();
    }
    var url = inferStudioScriptUrl();
    if (!url) return Promise.reject(new Error('studio_script_missing'));
    if (studioLoadPromise) return studioLoadPromise;
    if (window.__CreatorLazyModals && typeof window.__CreatorLazyModals.loadScript === 'function') {
      studioLoadPromise = window.__CreatorLazyModals.loadScript(url);
      return studioLoadPromise;
    }
    studioLoadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('studio_script_load_failed'));
      };
      document.head.appendChild(s);
    });
    return studioLoadPromise;
  }

  function openDesignStudio() {
    if (!ctx || !ctx.productKey) return;
    if (!ctx.designId) {
      window.alert(t('no_design_for_studio', 'No linked design — open from a design first, or link a design to this product.'));
      return;
    }
    var design = { id: ctx.designId };
    var meta = {
      title: ctx.productName || ctx.productKey,
      product_key: ctx.productKey,
    };
    ensureStudioScript()
      .then(function () {
        if (window.CreatorDesignStudioModal && typeof window.CreatorDesignStudioModal.open === 'function') {
          window.CreatorDesignStudioModal.open(design, ctx.productKey, meta);
        } else {
          window.alert(t('studio_unavailable', 'Design Studio could not be opened.'));
        }
      })
      .catch(function (err) {
        console.warn('[ProductPreviewModal] Design Studio load failed', err);
        window.alert(t('studio_unavailable', 'Design Studio could not be opened.'));
      });
  }

  function resetState() {
    channelState = {};
    amazonExpanded = false;
    collapsed = false;
    activePanel = 'overview';
    if (root) {
      root.classList.remove('cppm--collapsed');
      var collapseBtn = root.querySelector('[data-cppm-collapse]');
      if (collapseBtn) {
        collapseBtn.textContent = '‹';
        collapseBtn.setAttribute('aria-label', t('collapse_sidebar', 'Collapse sidebar'));
      }
    }
  }

  function open(opts) {
    opts = opts || {};
    ensureDom();
    bindEvents();
    resetState();

    ctx = {
      productKey: opts.productKey || null,
      productName: opts.productName || opts.productKey || t('title', 'Product Preview'),
      ownerId: opts.ownerId || '',
      designId: opts.designId || null,
      imageUrl: opts.imageUrl || opts.renderedSrc || null,
      publishedDesignId: opts.publishedDesignId || null,
    };

    var titleEl = root.querySelector('[data-cppm-title]');
    if (titleEl) titleEl.textContent = ctx.productName;

    renderOverviewPanel();
    renderVariantsPanel(null);
    renderChannelsPanel();
    setPanel('overview');

    root.classList.add('cppm--open', 'creator-modal--open');
    root.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.body.style.overflow = 'hidden';

    if (ctx.productKey) {
      fetchJSON(apiBase() + '?op=get-mockup-defaults&product_key=' + encodeURIComponent(ctx.productKey))
        .then(function (data) {
          if (!isOpen) return;
          if (data && data.ok !== false) renderVariantsPanel(data);
        })
        .catch(function (err) {
          console.warn('[ProductPreviewModal] mockup defaults failed', err);
        });
    }
  }

  function close() {
    if (!root) return;
    root.classList.remove('cppm--open', 'creator-modal--open');
    root.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.body.style.overflow = '';
    ctx = null;
  }

  window.CreatorProductPreviewModal = {
    open: open,
    close: close,
    isOpen: function () {
      return isOpen;
    },
  };
})();
