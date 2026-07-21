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

  var FLAG_CDN = 'https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.2/flags/4x3/';
  var REGION_FLAG_CODES = {
    UK: 'gb',
    AE: 'ae',
    SA: 'sa',
    US: 'us',
    CA: 'ca',
    DE: 'de',
    FR: 'fr',
    IT: 'it',
    ES: 'es',
    NL: 'nl',
    BE: 'be',
    PL: 'pl',
    SE: 'se',
    IE: 'ie',
    TR: 'tr',
    IN: 'in',
    EG: 'eg',
    MX: 'mx',
  };

  var VARIANT_VIEW_ORDER = { front: 0, back: 1 };

  var CHANNEL_LOGOS = {
    eazpire:
      '<img class="cppm__channel-logo-img" src="https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950" alt="" width="40" height="40" loading="lazy" decoding="async">',
    amazon:
      '<svg class="cppm__channel-logo-svg cppm__channel-logo-svg--amazon" viewBox="0 0 64 64" aria-hidden="true"><text x="4" y="26" fill="currentColor" font-size="22" font-weight="800" font-family="Inter,Arial,sans-serif">amazon</text><path fill="#fbbf24" d="M8 38c8-10 18-14 24-14s18 4 26 14"/><path fill="#fbbf24" d="M46 36l14 8-4 10"/></svg>',
    etsy:
      '<svg class="cppm__channel-logo-svg cppm__channel-logo-svg--etsy" viewBox="0 0 64 64" aria-hidden="true"><text x="6" y="40" fill="currentColor" font-size="28" font-weight="800" font-family="Georgia,serif">etsy</text></svg>',
    ebay:
      '<svg class="cppm__channel-logo-svg cppm__channel-logo-svg--ebay" viewBox="0 0 64 64" aria-hidden="true"><text x="4" y="28" fill="#e53238" font-size="16" font-weight="800" font-family="Inter,Arial,sans-serif">e</text><text x="18" y="28" fill="#0064d2" font-size="16" font-weight="800" font-family="Inter,Arial,sans-serif">b</text><text x="32" y="28" fill="#f5af02" font-size="16" font-weight="800" font-family="Inter,Arial,sans-serif">a</text><text x="46" y="28" fill="#86b817" font-size="16" font-weight="800" font-family="Inter,Arial,sans-serif">y</text></svg>',
    all:
      '<svg class="cppm__channel-logo-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5A1.5 1.5 0 0 1 12 5.5v5A1.5 1.5 0 0 1 10.5 12h-5A1.5 1.5 0 0 1 4 10.5v-5Zm8 0A1.5 1.5 0 0 1 13.5 4h5A1.5 1.5 0 0 1 20 5.5v5A1.5 1.5 0 0 1 18.5 12h-5A1.5 1.5 0 0 1 12 10.5v-5ZM4 13.5A1.5 1.5 0 0 1 5.5 12h5a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 10.5 20h-5A1.5 1.5 0 0 1 4 18.5v-5Zm8 0a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 12 18.5v-5Z" fill="currentColor"/></svg>',
  };

  var STAT_ICONS = {
    sales:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19h16M6 16l3.2-4.2a1 1 0 0 1 1.5-.1L13 14l3.3-4.4a1 1 0 0 1 1.6.1L20 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18.5" cy="6.5" r="2" fill="currentColor"/></svg>',
    add_to_cart:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.5 5h1.8l1.4 10.2a1.5 1.5 0 0 0 1.5 1.3h8.7a1.5 1.5 0 0 0 1.5-1.2L19.5 8H7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.4" fill="currentColor"/><circle cx="16.5" cy="20" r="1.4" fill="currentColor"/></svg>',
    impressions:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.8"/></svg>',
    clicks:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4.5v9.2l2.4-1.5 1.6 3.8 2.2-.9-1.6-3.8L16.5 10 8 4.5Z" fill="currentColor"/><path d="M14.5 16.5 16 20.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  var NAV_ICONS = {
    overview:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 13.5V6.8A1.8 1.8 0 0 1 5.8 5h4.4A1.8 1.8 0 0 1 12 6.8v6.7M12 10.2V17a1.8 1.8 0 0 0 1.8 1.8h4.4A1.8 1.8 0 0 0 20 17v-6.8A1.8 1.8 0 0 0 18.2 8.4H12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    variants:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" stroke="currentColor" stroke-width="1.8"/></svg>',
    channels:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="6.5" cy="12" r="2.2" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="2.2" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="17.5" r="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M8.6 11.1 15.4 7.4M8.7 12.9l6.7 3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  var root = null;
  var isOpen = false;
  var collapsed = false;
  var activePanel = 'overview';
  var ctx = null;
  var productMockupsByView = null;
  var variantsLoadToken = 0;
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

  function regionFlagCode(code) {
    var c = String(code || '').trim().toUpperCase();
    if (REGION_FLAG_CODES[c]) return REGION_FLAG_CODES[c];
    return c ? c.toLowerCase() : 'un';
  }

  function regionFlagHtml(code) {
    var c = String(code || '').trim().toUpperCase();
    if (c === 'UK') c = 'GB';
    if (c.length !== 2) return '';
    var a = c.charCodeAt(0);
    var b = c.charCodeAt(1);
    if (a < 65 || a > 90 || b < 65 || b > 90) return '';
    var emoji = String.fromCodePoint(0x1f1e6 + a - 65, 0x1f1e6 + b - 65);
    return '<span class="cppm__region-flag" aria-hidden="true">' + emoji + '</span>';
  }

  function channelLogoHtml(id) {
    var html = CHANNEL_LOGOS[id];
    if (!html) return '';
    return '<span class="cppm__channel-logo" aria-hidden="true">' + html + '</span>';
  }

  function normalizeVariantViewKey(raw) {
    var v = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (!v || v === 'other') return null;
    if (v.indexOf('folded') !== -1) return null;
    if (v === 'front' || v.indexOf('front') === 0) return 'front';
    if (v === 'back' || v === 'back_2' || v === 'back2' || v.indexOf('back') === 0) return 'back';
    if (v.indexOf('back') !== -1 && v.indexOf('feedback') === -1) return 'back';
    if (v.indexOf('front') !== -1) return 'front';
    return VARIANT_VIEW_ORDER[v] != null ? v : null;
  }

  function viewFromPrintifySrc(url) {
    if (!url) return null;
    try {
      var u = new URL(String(url));
      var cam = u.searchParams.get('camera_label') || u.searchParams.get('camera') || '';
      if (cam) return normalizeVariantViewKey(cam);
      var path = String(u.pathname || '').toLowerCase();
      if (path.indexOf('/back') !== -1 || path.indexOf('_back') !== -1) return 'back';
      if (path.indexOf('/front') !== -1 || path.indexOf('_front') !== -1) return 'front';
    } catch (_e) {}
    return null;
  }

  function parseAltColorView(altRaw) {
    var alt = String(altRaw || '').trim();
    if (!alt || alt.indexOf('|') === -1) return null;
    var parts = alt.split('|').map(function (p) {
      return String(p || '').trim();
    });
    if (!parts[0]) return null;
    var color = parts[0];
    var viewPart = parts[1] || '';
    if (viewPart === 'preview-default' && parts[2]) viewPart = parts[2];
    var viewKey = normalizeVariantViewKey(viewPart);
    return viewKey ? { color: color, viewKey: viewKey } : null;
  }

  function mockUrlFromEntry(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry.trim() || null;
    if (typeof entry === 'object') {
      return (
        String(entry.image_url || entry.url || entry.src || entry.preview_url || '').trim() || null
      );
    }
    return null;
  }

  function parsePrintifyImagesToByView(printifyImages) {
    var byView = Object.create(null);
    if (!Array.isArray(printifyImages) || !printifyImages.length) return byView;
    printifyImages.forEach(function (raw) {
      var url = mockUrlFromEntry(raw);
      if (!url) return;
      var color = null;
      var viewKey = null;
      if (raw && typeof raw === 'object') {
        var parsed =
          parseAltColorView(raw.alt) ||
          parseAltColorView(raw.label) ||
          parseAltColorView(raw.alt_text);
        if (parsed) {
          color = parsed.color;
          viewKey = parsed.viewKey;
        }
        if (!viewKey && raw.position) viewKey = normalizeVariantViewKey(raw.position);
        if (!viewKey && raw.view_key) viewKey = normalizeVariantViewKey(raw.view_key);
        if (!color && raw.color) color = String(raw.color).trim();
      }
      if (!viewKey) viewKey = viewFromPrintifySrc(url);
      if (!viewKey || !color) return;
      if (!byView[viewKey]) byView[viewKey] = Object.create(null);
      if (!byView[viewKey][color]) byView[viewKey][color] = url;
    });
    return byView;
  }

  function mergeByViewMaps(base, extra) {
    var out = Object.create(null);
    function copyFrom(src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (viewRaw) {
        var viewKey = normalizeVariantViewKey(viewRaw);
        if (!viewKey || VARIANT_VIEW_ORDER[viewKey] == null) return;
        var colors = src[viewRaw];
        if (!colors || typeof colors !== 'object') return;
        if (!out[viewKey]) out[viewKey] = Object.create(null);
        Object.keys(colors).forEach(function (colorName) {
          var url = mockUrlFromEntry(colors[colorName]);
          if (!url || out[viewKey][colorName]) return;
          out[viewKey][colorName] = url;
        });
      });
    }
    copyFrom(base);
    copyFrom(extra);
    return out;
  }

  function countByViewUrls(byView) {
    var n = 0;
    if (!byView) return 0;
    Object.keys(byView).forEach(function (vk) {
      n += Object.keys(byView[vk] || {}).length;
    });
    return n;
  }

  function buildVariantGroupsFromProductMockups(byView) {
    var groups = [];
    if (!byView || typeof byView !== 'object') return groups;
    Object.keys(byView).forEach(function (viewRaw) {
      var viewKey = normalizeVariantViewKey(viewRaw);
      if (!viewKey || VARIANT_VIEW_ORDER[viewKey] == null) return;
      var colors = byView[viewRaw];
      if (!colors || typeof colors !== 'object') return;
      var items = [];
      Object.keys(colors).forEach(function (colorName) {
        var url = mockUrlFromEntry(colors[colorName]);
        if (!url) return;
        items.push({ color: colorName, url: url });
      });
      items = dedupeItemsByColor(items);
      if (!items.length) return;
      groups.push({ viewKey: viewKey, items: items });
    });
    groups.sort(function (a, b) {
      return (VARIANT_VIEW_ORDER[a.viewKey] || 99) - (VARIANT_VIEW_ORDER[b.viewKey] || 99);
    });
    return groups;
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
      '        <span class="cppm__nav-icon" aria-hidden="true">' +
      NAV_ICONS.overview +
      '</span>' +
      '        <span class="cppm__nav-label" data-t="creator.product_preview.overview">' +
      esc(t('overview', 'Overview')) +
      '</span>' +
      '      </button>' +
      '      <button type="button" class="cppm__nav-btn" data-cppm-nav="variants">' +
      '        <span class="cppm__nav-icon" aria-hidden="true">' +
      NAV_ICONS.variants +
      '</span>' +
      '        <span class="cppm__nav-label" data-t="creator.product_preview.variants">' +
      esc(t('variants', 'Variants')) +
      '</span>' +
      '      </button>' +
      '      <button type="button" class="cppm__nav-btn" data-cppm-nav="channels">' +
      '        <span class="cppm__nav-icon" aria-hidden="true">' +
      NAV_ICONS.channels +
      '</span>' +
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
        '<div class="cppm__stat cppm__stat--' +
        esc(k) +
        '">' +
        '<div class="cppm__stat-top">' +
        '<span class="cppm__stat-icon" aria-hidden="true">' +
        (STAT_ICONS[k] || '') +
        '</span>' +
        '<span class="cppm__stat-label" data-t="' +
        dataT +
        '">' +
        esc(label) +
        '</span>' +
        '</div>' +
        '<span class="cppm__stat-value cppm__stat-value--placeholder" data-t="creator.product_preview.stats_placeholder">' +
        esc(t('stats_placeholder', '—')) +
        '</span>' +
        '</div>'
      );
    }).join('');

    var logoWrap =
      '<span class="cppm__stats-block-logo cppm__stats-block-logo--' +
      esc(channelId) +
      '">' +
      channelLogoHtml(channelId) +
      '</span>';

    return (
      '<div class="cppm__stats-block cppm__stats-block--' +
      esc(channelId) +
      '" data-cppm-stats-channel="' +
      esc(channelId) +
      '">' +
      '<div class="cppm__stats-block-head">' +
      logoWrap +
      '<h4 class="cppm__stats-block-title">' +
      esc(channelLabel) +
      '</h4>' +
      '</div>' +
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

  var SIZE_COLOR_LABEL_RE =
    /^(?:XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|\d+)\s*\/\s*(.+)$/i;

  /** Clothing mock labels often look like "S / White" — keep color only (mocks match per size). */
  function colorLabelFromKey(raw) {
    var s = String(raw || '').trim();
    if (!s) return s;
    var m = s.match(SIZE_COLOR_LABEL_RE);
    return m ? String(m[1] || '').trim() : s;
  }

  function dedupeItemsByColor(items) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var color = colorLabelFromKey(item.color);
      var key = color.toLowerCase();
      if (!color || seen[key]) continue;
      seen[key] = true;
      out.push({ color: color, url: item.url });
    }
    return out;
  }

  function extractCatalogByView(defaultsResp) {
    var out = Object.create(null);
    if (!defaultsResp) return out;

    // Prefer full catalog map (all colors × front/back), then print_areas fallback.
    if (defaultsResp.mockup_images_by_view && typeof defaultsResp.mockup_images_by_view === 'object') {
      out = mergeByViewMaps(out, defaultsResp.mockup_images_by_view);
    }

    var printAreas = defaultsResp.print_areas || [];
    for (var i = 0; i < printAreas.length; i++) {
      var pa = printAreas[i];
      var viewKey = normalizeVariantViewKey(pa.print_area_key || 'front');
      if (!viewKey) continue;
      var byColor = pa.mockup_images_by_color || null;
      if (byColor && typeof byColor === 'object') {
        if (!out[viewKey]) out[viewKey] = Object.create(null);
        Object.keys(byColor).forEach(function (colorName) {
          if (!out[viewKey][colorName]) out[viewKey][colorName] = byColor[colorName];
        });
      } else if (pa.template_url) {
        if (!out[viewKey]) out[viewKey] = Object.create(null);
        var tc = pa.template_color || viewLabel(viewKey);
        if (!out[viewKey][tc]) out[viewKey][tc] = pa.template_url;
      }
    }
    return out;
  }

  function buildVariantGroups(defaultsResp, byViewProduct) {
    // Prefer published/product mockups (design printed), then fill missing
    // colors + views from catalog so Front/Back and all colors show up.
    var byView = mergeByViewMaps({}, byViewProduct);
    var catalogByView = extractCatalogByView(defaultsResp);
    byView = mergeByViewMaps(byView, catalogByView);

    var groups = buildVariantGroupsFromProductMockups(byView);
    groups.sort(function (a, b) {
      return (VARIANT_VIEW_ORDER[a.viewKey] || 99) - (VARIANT_VIEW_ORDER[b.viewKey] || 99);
    });

    if (!groups.length && ctx && ctx.imageUrl) {
      var fallbackView = inferPrimaryViewFromProductName(ctx.productName) || 'front';
      groups.push({
        viewKey: fallbackView,
        items: [{ color: ctx.productName || 'Product', url: ctx.imageUrl }],
      });
    }
    return groups;
  }

  function inferPrimaryViewFromProductName(name) {
    var s = String(name || '').toLowerCase();
    if (s.indexOf('backprint') !== -1 || s.indexOf('back print') !== -1 || s.indexOf('back-print') !== -1) {
      return 'back';
    }
    return 'front';
  }

  function renderVariantsPanel(defaultsResp, byViewProduct) {
    var el = root && root.querySelector('[data-cppm-panel="variants"]');
    if (!el) return;
    var mergedByView = byViewProduct || productMockupsByView;
    var groups = buildVariantGroups(defaultsResp, mergedByView);
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
      var colorCount = group.items.length;
      html +=
        '<div class="cppm__view-block">' +
        '<h4 class="cppm__view-title">' +
        esc(viewLabel(group.viewKey)) +
        '<span class="cppm__view-count">' +
        colorCount +
        ' ' +
        esc(
          colorCount === 1
            ? t('color_singular', 'color')
            : t('color_plural', 'colors')
        ) +
        '</span>' +
        '</h4>' +
        '<div class="cppm__carousel">' +
        '<button type="button" class="cppm__carousel-btn" data-cppm-carousel="' +
        esc(trackId) +
        '" data-cppm-dir="prev" aria-label="Previous">‹</button>' +
        '<div class="cppm__carousel-track cppm__scroll-hide" data-cppm-track="' +
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
      channelLogoHtml(id) +
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
          '<div class="cppm__region-head">' +
          regionFlagHtml(reg.code) +
          '<h5 class="cppm__region-name">' +
          esc(reg.label) +
          '</h5></div>' +
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
    var productKey = ctx.productKey;
    close();
    ensureStudioScript()
      .then(function () {
        if (window.CreatorDesignStudioModal && typeof window.CreatorDesignStudioModal.open === 'function') {
          window.CreatorDesignStudioModal.open(design, productKey, meta);
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

  function loadProductMockups() {
    if (!ctx) return Promise.resolve(null);
    var token = ++variantsLoadToken;

    if (ctx.mockupsByView && countByViewUrls(ctx.mockupsByView) > 0) {
      productMockupsByView = mergeByViewMaps({}, ctx.mockupsByView);
    }

    var parts = [];
    if (ctx.publishedDesignId) {
      parts.push('published_design_id=' + encodeURIComponent(String(ctx.publishedDesignId)));
    }
    if (ctx.designId) parts.push('design_id=' + encodeURIComponent(String(ctx.designId)));
    if (ctx.productKey) parts.push('product_key=' + encodeURIComponent(ctx.productKey));
    if (ctx.printifyProductId) {
      parts.push('printify_product_id=' + encodeURIComponent(String(ctx.printifyProductId)));
    }
    if (!parts.length) {
      return Promise.resolve(productMockupsByView);
    }

    return fetchJSON(apiBase() + '?op=get-published-product-mockups&' + parts.join('&'))
      .then(function (data) {
        if (!isOpen || token !== variantsLoadToken) return productMockupsByView;
        if (data && data.ok && data.by_view) {
          productMockupsByView = mergeByViewMaps(productMockupsByView, data.by_view);
        }
        if (countByViewUrls(productMockupsByView) === 0 && ctx.printifyImages) {
          productMockupsByView = mergeByViewMaps(
            productMockupsByView,
            parsePrintifyImagesToByView(ctx.printifyImages)
          );
        }
        return productMockupsByView;
      })
      .catch(function (err) {
        console.warn('[ProductPreviewModal] product mockups failed', err);
        return productMockupsByView;
      });
  }

  function loadVariantPanels() {
    var token = ++variantsLoadToken;
    var defaultsPromise = ctx.productKey
      ? fetchJSON(
          apiBase() + '?op=get-mockup-defaults&product_key=' + encodeURIComponent(ctx.productKey)
        )
      : Promise.resolve(null);
    return Promise.all([loadProductMockups(), defaultsPromise]).then(function (results) {
      if (!isOpen || token !== variantsLoadToken) return;
      var mockData = results[0];
      var defaultsResp = results[1];
      if (mockData) productMockupsByView = mockData;
      renderVariantsPanel(defaultsResp && defaultsResp.ok !== false ? defaultsResp : null, mockData);
    });
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
      printifyProductId: opts.printifyProductId || null,
      printifyImages: Array.isArray(opts.printifyImages) ? opts.printifyImages : null,
      mockupsByView:
        opts.mockupsByView && typeof opts.mockupsByView === 'object' ? opts.mockupsByView : null,
    };
    productMockupsByView = null;
    variantsLoadToken = 0;

    var titleEl = root.querySelector('[data-cppm-title]');
    if (titleEl) titleEl.textContent = ctx.productName;

    renderOverviewPanel();
    var variantsEl = root.querySelector('[data-cppm-panel="variants"]');
    if (variantsEl && (ctx.productKey || ctx.publishedDesignId || ctx.designId)) {
      variantsEl.innerHTML =
        '<h3 class="cppm__section-title" data-t="creator.product_preview.variants">' +
        esc(t('variants', 'Variants')) +
        '</h3><p class="cppm__variants-loading" data-t="creator.product_preview.loading_variants">' +
        esc(t('loading_variants', 'Loading color variants…')) +
        '</p>';
    } else {
      renderVariantsPanel(null, ctx.mockupsByView);
    }
    renderChannelsPanel();
    setPanel('overview');

    root.classList.add('cppm--open', 'creator-modal--open');
    root.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.body.style.overflow = 'hidden';

    if (ctx.productKey || ctx.publishedDesignId || ctx.designId) {
      loadVariantPanels();
    }
  }

  function close() {
    if (!root) return;
    root.classList.remove('cppm--open', 'creator-modal--open');
    root.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.body.style.overflow = '';
    ctx = null;
    productMockupsByView = null;
  }

  window.CreatorProductPreviewModal = {
    open: open,
    close: close,
    isOpen: function () {
      return isOpen;
    },
  };
})();
