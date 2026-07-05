/**
 * Community Panel - Network UI Controller
 * Fetches data from list-community-network API and renders network view
 * Per USER (not creator): Vorname oder E-Mail. Echte SVG-Flaggen. Ebene 2-10 keine Nutzer.
 */
(function () {
  'use strict';

  const FLAG_CDN = 'https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.2/flags/4x3';
  const FLAG_EMOJI = { ALL: '🌍', DE: '🇩🇪', AT: '🇦🇹', CH: '🇨🇭', NL: '🇳🇱', SE: '🇸🇪', US: '🇺🇸', FR: '🇫🇷', ES: '🇪🇸', IT: '🇮🇹', PL: '🇵🇱', GB: '🇬🇧', TR: '🇹🇷' };
  const COUNTRIES = {
    ALL: { name: 'Alle', code: 'un' },
    DE: { name: 'Deutschland', code: 'de' },
    AT: { name: 'Österreich', code: 'at' },
    CH: { name: 'Schweiz', code: 'ch' },
    NL: { name: 'Niederlande', code: 'nl' },
    SE: { name: 'Schweden', code: 'se' },
    US: { name: 'USA', code: 'us' },
    FR: { name: 'Frankreich', code: 'fr' },
    ES: { name: 'Spanien', code: 'es' },
    IT: { name: 'Italien', code: 'it' },
    PL: { name: 'Polen', code: 'pl' },
    GB: { name: 'UK', code: 'gb' },
    TR: { name: 'Türkei', code: 'tr' }
  };

  const LEVELS = 10;
  const LEVEL_START = 1;
  var USER_ICON = '<svg class="cp-user-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Z"/><path d="M4.5 20.2c1.8-4.1 5.2-6.2 7.5-6.2s5.7 2.1 7.5 6.2" stroke-linecap="round"/></svg>';

  var ICONS = {
    designs: '<svg class="cp-stat-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    products: '<svg class="cp-stat-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    sales: '<svg class="cp-stat-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'
  };

  function flagUrl(code) {
    const c = (code || 'xx').toLowerCase();
    if (c === 'all' || c === 'xx') return FLAG_CDN + '/un.svg';
    return FLAG_CDN + '/' + c + '.svg';
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    attrs = attrs || {};
    children = children || [];
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (v != null) n.setAttribute(k, v === true ? '' : String(v));
    }
    children.forEach(function (c) {
      if (typeof c === 'string') n.appendChild(document.createTextNode(c));
      else if (c) n.appendChild(c);
    });
    return n;
  }

  function resolveOwnerId() {
    if (window._resolveEazOwnerId) return window._resolveEazOwnerId();
    if (window.__EAZ_OWNER_ID) return window.__EAZ_OWNER_ID;
    if (window.ownerId) return String(window.ownerId);
    if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId);
    const input = document.querySelector('input[id^="ownerId-"]');
    if (input && input.value) return input.value.trim();
    return null;
  }

  function applySkin(root) {
    const skin = root.getAttribute('data-community-skin');
    if (skin === 'auto') {
      const isCreator = root.closest('.csm-modal');
      root.classList.remove('community-panel--light', 'community-panel--dark');
      root.classList.add(isCreator ? 'community-panel--dark' : 'community-panel--light');
    }
  }

  function countByCountry(items, getCountryFn) {
    const counts = {};
    items.forEach(function (item, i) {
      const c = getCountryFn(item, i);
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }

  function fetchNetwork(ownerId) {
    const base = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) || 'https://creator-engine.eazpire.workers.dev';
    const url = base + '/apps/creator-dispatch?op=list-community-network&owner_id=' + encodeURIComponent(ownerId) + '&_t=' + Date.now();
    return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.json(); });
  }

  function fetchReferralCode(ownerId) {
    const base = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) || 'https://creator-engine.eazpire.workers.dev';
    const url = base + '/apps/creator-dispatch?op=get-referral-code&owner_id=' + encodeURIComponent(ownerId) + '&_t=' + Date.now();
    return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.json(); });
  }

  const REF_LINKS_SETTING_KEY = 'community_ref_links_v1';
  const REF_LINKS_MAX = 5;
  const REF_SLUG_MIN_LEN = 4;
  const REF_SLUG_MAX_LEN = 24;
  const REF_SLUG_PATTERN = /^[a-z0-9-]+$/;
  const RESERVED_REF_SLUGS = new Set([
    'admin', 'api', 'app', 'apps', 'assets', 'auth', 'account', 'accounts',
    'billing', 'checkout', 'cart', 'collections', 'collection', 'products', 'product',
    'pages', 'page', 'search', 'shop', 'store', 'creator', 'creators',
    'network', 'analytics', 'community', 'settings', 'help', 'support',
    'blog', 'blogs', 'news', 'contact', 'about', 'privacy', 'terms',
    'policy', 'policies', 'refund', 'shipping', 'imprint',
    'login', 'logout', 'register', 'signup', 'signin',
    'www', 'cdn', 'static', 'media', 'img', 'images',
    'favicon.ico', 'robots.txt', 'sitemap.xml'
  ]);

  function dispatchApiBase() {
    const base = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) || 'https://creator-engine.eazpire.workers.dev';
    return base + '/apps/creator-dispatch';
  }

  function getCustomerSetting(ownerId, key) {
    const url = dispatchApiBase()
      + '?op=get-customer-setting'
      + '&owner_id=' + encodeURIComponent(ownerId)
      + '&key=' + encodeURIComponent(key)
      + '&_t=' + Date.now();
    return fetch(url, { credentials: 'include', cache: 'no-store' }).then(function(r) { return r.json(); });
  }

  function setCustomerSetting(ownerId, key, value) {
    const url = dispatchApiBase()
      + '?op=set-customer-setting'
      + '&owner_id=' + encodeURIComponent(ownerId);
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, value: value })
    }).then(function(r) { return r.json(); });
  }

  function slugifyLabel(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40);
  }

  function buildNamedRefUrl(baseUrl, slug) {
    try {
      const u = new URL(baseUrl);
      if (slug) {
        // Named links should become first-class join short links:
        // https://join.eazpire.com/{slug}
        u.pathname = '/' + encodeURIComponent(String(slug).toLowerCase());
        u.search = '';
      }
      return u.toString();
    } catch (_e) {
      return baseUrl;
    }
  }

  function isReservedRefSlug(slug) {
    return RESERVED_REF_SLUGS.has(String(slug || '').toLowerCase());
  }

    function isValidRefSlug(slug) {
      var s = String(slug || '').toLowerCase();
      return s.length >= REF_SLUG_MIN_LEN &&
        s.length <= REF_SLUG_MAX_LEN &&
        REF_SLUG_PATTERN.test(s);
    }

  function renderStats(container, stats) {
    if (!container) return;
    const s = stats || {};
    const partnersEl = container.querySelector('[data-cp-stat="partners"]');
    const designsEl = container.querySelector('[data-cp-stat="designs"]');
    const productsEl = container.querySelector('[data-cp-stat="products"]');
    const salesEl = container.querySelector('[data-cp-stat="sales"]');
    const profitEl = container.querySelector('[data-cp-stat="profit"]');
    const userLabel = (window.CreatorI18n && window.CreatorI18n.partner) || 'Nutzer';
    if (partnersEl) partnersEl.textContent = s.partners != null ? s.partners : 0;
    if (designsEl) designsEl.textContent = s.designs != null ? s.designs : 0;
    if (productsEl) productsEl.textContent = s.products != null ? s.products : 0;
    if (salesEl) salesEl.textContent = s.sales != null ? s.sales : 0;
    if (profitEl) profitEl.textContent = (s.profit !== undefined && s.profit !== '' && s.profit != null) ? s.profit : '–';
  }

  function buildCountryGrid(counts, options) {
    const interactive = options.interactive;
    const selectedKey = options.selectedKey || 'ALL';
    const onSelect = options.onSelect || function () {};
    const grid = el('div', { class: 'cp-country-grid' });
    const entries = [['ALL', counts.__all || 0]].concat(
      Object.entries(counts).filter(function (e) { return e[0] !== '__all'; }).sort(function (a, b) { return b[1] - a[1]; })
    );
    entries.forEach(function (entry) {
      const code = entry[0];
      const count = entry[1];
      const meta = COUNTRIES[code] || { name: code, code: 'xx' };
      const flagWrap = el('div', { class: 'cp-country-flag-wrap' });
      const flagImg = el('img', { src: flagUrl(meta.code), alt: '', class: 'cp-flag-img cp-flag-img--round', width: 28, height: 28 });
      flagImg.onerror = function () {
        var fallback = el('span', { class: 'cp-flag-emoji cp-flag-emoji--round' });
        fallback.textContent = FLAG_EMOJI[code] || '🏳️';
        flagImg.parentNode.replaceChild(fallback, flagImg);
      };
      flagWrap.appendChild(flagImg);
      const userCount = el('div', { class: 'cp-ccount-row' });
      userCount.innerHTML = USER_ICON + '<span>' + count + '</span>';
      const card = el('div', {
        class: 'cp-country cp-country--circle' + (code === selectedKey ? ' cp-country--selected' : ''),
        role: interactive ? 'button' : 'group',
        tabindex: interactive ? '0' : '-1',
        'aria-disabled': interactive ? 'false' : 'true',
        'data-code': code
      }, [
        flagWrap,
        el('div', { class: 'cp-cname' }, [meta.name]),
        userCount
      ]);
      if (interactive) {
        card.addEventListener('click', function () { onSelect(code); });
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(code); }
        });
      }
      grid.appendChild(card);
    });
    return grid;
  }

  function init(root, retryCount) {
    retryCount = retryCount || 0;
    if (!root) return;
    applySkin(root);

    const loadingEl = root.querySelector('.cp-loading-el');
    const emptyEl = root.querySelector('.cp-empty-el');
    const levelsEl = root.querySelector('.cp-levels-el');
    const duSection = root.querySelector('[data-cp-du-section]');

    if (loadingEl) loadingEl.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';
    if (levelsEl) levelsEl.style.display = 'none';
    if (duSection) duSection.style.display = 'none';

    const netKvEl = root.querySelector('.cp-net-kv');
    const duTitleEl = duSection ? duSection.querySelector('.cp-du-title') : null;
    const duSubEl = duSection ? duSection.querySelector('.cp-du-sub') : null;
    const duKvEl = root.querySelector('.cp-du-kv');
    const modalBackdrop = root.querySelector('.cp-modal-backdrop-el');
    const closeModalBtn = root.querySelector('.cp-close-modal-btn');
    const kvGrid = root.querySelector('.cp-kv-grid');
    const creatorList = root.querySelector('.cp-creator-list');
    const downlineTitle = root.querySelector('.cp-downline-title');
    const downlineBody = root.querySelector('.cp-downline-body');
    const designCreatorFilter = root.querySelector('.cp-design-creator-filter');
    const productCreatorFilter = root.querySelector('.cp-product-creator-filter');
    const designGrid = root.querySelector('.cp-design-grid');
    const productGrid = root.querySelector('.cp-product-grid');
    const personIconTpl = root.querySelector('.cp-person-icon-tpl');

    let level1Partners = [];
    let levels2to10 = [];
    let meData = null;
    let currentPartner = null;
    let selectedCountry = 'ALL';
    let levelPercents = {};

    function iconNode() {
      return personIconTpl ? personIconTpl.content.cloneNode(true) : document.createDocumentFragment();
    }

    function renderDuSection(data) {
      if (!data || !duKvEl) return;
      var de = duKvEl.querySelector('[data-cp-du-stat="designs"]');
      var pr = duKvEl.querySelector('[data-cp-du-stat="products"]');
      var sa = duKvEl.querySelector('[data-cp-du-stat="sales"]');
      var pf = duKvEl.querySelector('[data-cp-du-stat="profit"]');
      if (de) de.textContent = data.designs != null ? data.designs : 0;
      if (pr) pr.textContent = data.products != null ? data.products : 0;
      if (sa) sa.textContent = data.sales != null ? data.sales : 0;
      if (pf) pf.textContent = (data.profit !== undefined && data.profit !== '') ? data.profit : '–';
      var youLabel = (window.CreatorI18n && window.CreatorI18n.you) || 'Du';
      if (duTitleEl) duTitleEl.textContent = (data.isMe ? youLabel : data.name) || youLabel;

      var pct = levelPercents[0] != null ? levelPercents[0] : 20;
      var pctStr = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1).replace('.', ',');
      if (duSubEl && data.isMe) {
        var cashbackLabel = (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.level_me_hint) || 'Dein Anteil bei jedem Kauf';
        duSubEl.textContent = cashbackLabel + ' · ' + pctStr + ' %';
      }
    }

    function setActiveModalTab(key) {
      root.querySelectorAll('.cp-tab').forEach(function (t) {
        var active = t.getAttribute('data-cp-tab') === key;
        t.classList.toggle('cp-tab--active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      root.querySelectorAll('.cp-panel').forEach(function (p) {
        p.classList.toggle('cp-panel--active', p.getAttribute('data-cp-panel') === key);
      });
    }

    function openModal(partner) {
      currentPartner = partner;
      renderDuSection(partner);
      if (!modalBackdrop) return;

      const meta = COUNTRIES[partner.country] || { name: partner.country, code: 'xx' };
      const flagImg = '<img src="' + flagUrl(meta.code) + '" alt="" class="cp-flag-img cp-flag-img--inline" width="20" height="15">';
      const titleEl = root.querySelector('.cp-modal-title-h2');
      const subtitleEl = root.querySelector('.cp-modal-subtitle-el');
      if (titleEl) titleEl.textContent = partner.name;
      if (subtitleEl) subtitleEl.innerHTML = '<span class="cp-tag">' + flagImg + ' ' + meta.name + '</span><span class="cp-tag">Seit: ' + (partner.since || '–') + '</span>';

      kvGrid.innerHTML = '';
      var kv = [
        ['Designs', partner.designs != null ? partner.designs : 0],
        ['Produkte', partner.products != null ? partner.products : 0],
        ['Verkäufe', partner.sales != null ? partner.sales : 0],
        ['Gewinn', (partner.profitForMe !== undefined && partner.profitForMe !== '') ? partner.profitForMe : '–']
      ];
      kv.forEach(function (pair) {
        var card = el('div', { class: 'cp-kvc' }, [
          el('div', { class: 'cp-k' }, [pair[0]]),
          el('div', { class: 'cp-v' }, [String(pair[1])])
        ]);
        kvGrid.appendChild(card);
      });

      creatorList.innerHTML = '';
      creatorList.appendChild(el('div', { class: 'cp-footnote' }, ['Nutzer: ' + partner.name]));

      if (downlineTitle) downlineTitle.textContent = 'Ebene 2–10: keine Nutzer';
      downlineBody.innerHTML = '';
      if (designCreatorFilter && productCreatorFilter) {
        designCreatorFilter.innerHTML = '';
        productCreatorFilter.innerHTML = '';
      }
      if (designGrid) designGrid.innerHTML = '';
      if (productGrid) productGrid.innerHTML = '';

      setActiveModalTab('info');
      modalBackdrop.classList.add('cp-modal-backdrop--open');
      modalBackdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      if (!modalBackdrop) return;
      modalBackdrop.classList.remove('cp-modal-backdrop--open');
      modalBackdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      currentPartner = null;
      if (meData) renderDuSection(meData);
    }

    root.querySelectorAll('.cp-tab').forEach(function (t) {
      t.addEventListener('click', function () { setActiveModalTab(t.getAttribute('data-cp-tab')); });
    });
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', function (e) { if (e.target === modalBackdrop) closeModal(); });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalBackdrop && modalBackdrop.classList.contains('cp-modal-backdrop--open')) closeModal();
    });

    function makeLevelDetails(level) {
      var details = el('details', { class: 'cp-level', 'data-level': String(level) });
      if (level === 1) details.open = true;

      var sum = el('summary');
      var left = el('div', { class: 'cp-left' });
      left.appendChild(el('div', { class: 'cp-badge' }, [String(level)]));
      var metaWrap = el('div', { class: 'cp-meta' });
      var count = level === 1 ? level1Partners.length : (level >= 2 && levels2to10[level - 2]) ? levels2to10[level - 2].total : 0;
      var userLabel = (window.CreatorI18n && window.CreatorI18n.partner) || 'Nutzer';
      metaWrap.appendChild(el('div', { class: 'cp-lvlname' }, [
        document.createTextNode('Ebene ' + level),
        el('span', { class: 'cp-pill' }, [count + ' ' + userLabel])
      ]));
      metaWrap.appendChild(el('div', { class: 'cp-hint' }, [level === 1 ? (count + ' direkte Nutzer') : 'Keine Nutzer']));
      left.appendChild(metaWrap);
      sum.appendChild(left);

      var pct = levelPercents[level] != null ? levelPercents[level] : 0;
      var pctStr = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1).replace('.', ',');
      var pctEl = el('div', { class: 'cp-level-pct' }, [pctStr + ' %']);
      sum.appendChild(pctEl);

      var chev = el('div', { class: 'cp-chev', 'aria-hidden': 'true' });
      chev.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      sum.appendChild(chev);
      details.appendChild(sum);

      var content = el('div', { class: 'cp-content' });
      content.appendChild(el('div', { class: 'cp-section-title' }, ['Länder']));

      if (level === 1) {
        var counts = countByCountry(level1Partners, function (p) { return p.country || 'DE'; });
        counts.__all = level1Partners.length;

        var userTitle = el('div', { class: 'cp-section-title' }, [userLabel + ' (Ebene 1)']);
        var userGrid = el('div', { class: 'cp-grid' });

        function renderUsers() {
          userGrid.innerHTML = '';
          var filtered = selectedCountry === 'ALL' ? level1Partners : level1Partners.filter(function (p) { return (p.country || 'DE') === selectedCountry; });
          filtered.forEach(function (p) {
            var meta = COUNTRIES[p.country] || { name: p.country, code: 'xx' };
            var displayName = (p.name && p.name.trim() && p.name !== '–') ? p.name.trim() : 'Busy Bee';
            var flagWrap = el('div', { class: 'cp-node-flag' });
            var flagImg = el('img', { src: flagUrl(meta.code), alt: '', class: 'cp-flag-img cp-flag-img--round', width: 22, height: 22 });
            flagImg.onerror = function () {
              var fallback = el('span', { class: 'cp-flag-emoji cp-flag-emoji--round' });
              fallback.textContent = FLAG_EMOJI[p.country] || FLAG_EMOJI.ALL || '🏳️';
              flagImg.parentNode.replaceChild(fallback, flagImg);
            };
            flagWrap.appendChild(flagImg);
            var t = el('div', { class: 'cp-text' }, [
              el('div', { class: 'cp-country-label' }, [meta.name]),
              el('div', { class: 'cp-name' }, [displayName])
            ]);
            var stats = el('div', { class: 'cp-node-stats cp-node-stats--row' });
            var sep = '<span class="cp-stat-sep">·</span>';
            stats.innerHTML = '<span class="cp-node-stat">' + ICONS.designs + '<span>' + (p.designs != null ? p.designs : 0) + '</span></span>' + sep +
              '<span class="cp-node-stat">' + ICONS.products + '<span>' + (p.products != null ? p.products : 0) + '</span></span>' + sep +
              '<span class="cp-node-stat">' + ICONS.sales + '<span>' + (p.sales != null ? p.sales : 0) + '</span></span>';
            var node = el('div', { class: 'cp-node cp-node--clickable', role: 'button', tabindex: '0' });
            var topRow = el('div', { class: 'cp-node-top' });
            topRow.appendChild(flagWrap);
            topRow.appendChild(t);
            node.appendChild(topRow);
            node.appendChild(stats);
            node.addEventListener('click', function () { openModal(p); });
            node.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(p); } });
            userGrid.appendChild(node);
          });
        }

        function setSelected(code) {
          selectedCountry = code;
          content.querySelectorAll('.cp-country').forEach(function (c) {
            c.classList.toggle('cp-country--selected', c.getAttribute('data-code') === selectedCountry);
          });
          renderUsers();
        }

        content.appendChild(buildCountryGrid(counts, { interactive: true, selectedKey: selectedCountry, onSelect: setSelected }));
        content.appendChild(userTitle);
        content.appendChild(userGrid);
        content.appendChild(el('div', { class: 'cp-divider' }));
        content.appendChild(el('div', { class: 'cp-footnote' }, ['Klick auf einen Nutzer zeigt Details.']));
        renderUsers();
      } else {
        var levData = levels2to10[level - 2];
        var anonCounts = levData ? levData.countryCounts : {};
        anonCounts.__all = levData ? levData.total : 0;
        content.appendChild(buildCountryGrid(anonCounts, { interactive: false }));
        content.appendChild(el('div', { class: 'cp-footnote' }, ['Ebene ' + level + ': keine Nutzer.']));
      }

      details.appendChild(content);
      return details;
    }

    function renderLevels() {
      if (!levelsEl) return;
      levelsEl.innerHTML = '';
      for (var lvl = LEVEL_START; lvl <= LEVELS; lvl++) {
        levelsEl.appendChild(makeLevelDetails(lvl));
      }
    }

    var ownerId = resolveOwnerId();
    if (!ownerId) {
      if (retryCount < 3) {
        setTimeout(function () { init(root, retryCount + 1); }, 250 * (retryCount + 1));
        return;
      }
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        emptyEl.textContent = 'Bitte einloggen, um dein Netzwerk zu sehen.';
      }
      return;
    }

    var referralSection = root.querySelector('[data-cp-referral-section]');
    var referralInput = root.querySelector('[data-cp-referral-input]');
    var copyBtn = root.querySelector('[data-cp-referral-copy]');
    var shareBtn = root.querySelector('.cp-referral-row [data-share-button]');
    var refLinksModal = root.querySelector('[data-cp-ref-links-modal]');
    var refLinksList = root.querySelector('[data-cp-ref-links-list]');
    var refLinksSlugInput = root.querySelector('[data-cp-ref-links-slug]');
    var refLinksNameInput = root.querySelector('[data-cp-ref-links-name]');
    var refLinksDescInput = root.querySelector('[data-cp-ref-links-description]');
    var refLinksAddBtn = root.querySelector('[data-cp-ref-links-add]');
    var refLinksPreview = root.querySelector('[data-cp-ref-links-preview]');
    var refLinksHint = root.querySelector('.cp-ref-links-modal__hint');
    var refLinksErr = root.querySelector('[data-cp-ref-links-error]');
    var refLinksCloseEls = root.querySelectorAll('[data-cp-ref-links-close]');
    var copyLabel = (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.copy_link) || 'Copy link';
    var copiedLabel = (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.copied) || 'Copied!';
    var refLinksI18n = {
      defaultName: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_default_name) || 'Main link',
      duplicate: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_name_exists) || 'This label already exists.',
      duplicateSlug: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_slug_exists) || 'This link is already used.',
      invalidSlug: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_slug_invalid) || 'Use only a-z, 0-9 and -, length 4-24.',
      maxReached: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_max_reached) || 'Maximum 5 links.',
      requiredSlug: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_required_slug) || 'Please enter the ref link.',
      requiredName: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_required_name) || 'Please enter a label.',
      reserved: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_slug_reserved) || 'This link name is reserved.',
      remove: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_remove) || 'Remove',
      select: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.ref_links_select) || 'Use'
    };
    var referralBaseUrl = '';
    var referralLinksState = { activeId: '', links: [] };

    function activeReferralLinkUrl() {
      if (!referralLinksState.links.length) return referralBaseUrl || '';
      var active = referralLinksState.links.find(function(link) { return link.id === referralLinksState.activeId; }) || referralLinksState.links[0];
      return buildNamedRefUrl(referralBaseUrl, active && active.slug ? active.slug : '');
    }

    function syncReferralInput() {
      if (!referralInput) return;
      var url = activeReferralLinkUrl();
      referralInput.value = url;
      // Keep share button in sync with the selected named link.
      if (shareBtn) {
        shareBtn.setAttribute('data-share-product-url', url);
        shareBtn.setAttribute('data-copy-url', url);
      }
    }

    function showRefLinkError(message) {
      if (!refLinksErr) return;
      if (!message) {
        refLinksErr.hidden = true;
        refLinksErr.textContent = '';
        return;
      }
      refLinksErr.hidden = false;
      refLinksErr.textContent = message;
    }

    function previewBaseJoinUrl() {
      try {
        if (!referralBaseUrl) return 'https://join.eazpire.com/';
        var u = new URL(referralBaseUrl);
        return u.origin.replace(/\/$/, '') + '/';
      } catch (_e) {
        return 'https://join.eazpire.com/';
      }
    }

    function updateRefLinkPreview() {
      if (!refLinksPreview) return;
      var raw = refLinksNameInput ? String(refLinksNameInput.value || '').trim() : '';
      var slug = slugifyLabel(raw);
      var base = previewBaseJoinUrl();
      if (!raw) {
        refLinksPreview.classList.remove('is-invalid');
        if (refLinksHint) refLinksHint.classList.remove('is-invalid');
        refLinksPreview.textContent = base + 'your-link';
        return;
      }
      var invalid = !isValidRefSlug(slug) || isReservedRefSlug(slug);
      refLinksPreview.classList.toggle('is-invalid', invalid);
      if (refLinksHint) refLinksHint.classList.toggle('is-invalid', invalid);
      refLinksPreview.textContent = base + (slug || '...');
    }

    function persistReferralLinks() {
      var payload = {
        activeId: referralLinksState.activeId,
        links: referralLinksState.links.map(function(link) {
          return { id: link.id, name: link.name, slug: link.slug || '', description: link.description || '' };
        })
      };
      return setCustomerSetting(ownerId, REF_LINKS_SETTING_KEY, JSON.stringify(payload))
        .then(function() {
          if (window.ShareButtonClearReferralCache && typeof window.ShareButtonClearReferralCache === 'function') {
            window.ShareButtonClearReferralCache(ownerId);
          }
          // Keep join.eazpire.com/{slug} resolver mapping in sync.
          return fetch(dispatchApiBase() + '?op=sync-ref-link-slugs&owner_id=' + encodeURIComponent(ownerId), {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              links: referralLinksState.links
                .filter(function(link) { return !!(link && link.slug); })
                .map(function(link) { return { slug: link.slug, name: link.name }; })
            })
          }).then(function(r) { return r.json(); }).catch(function() { return { ok: false, error: 'sync_failed' }; });
        })
        .catch(function () { return { ok: false, error: 'persist_failed' }; });
    }

    function renderRefLinksList() {
      if (!refLinksList) return;
      refLinksList.innerHTML = '';
      referralLinksState.links.forEach(function(link) {
        var row = document.createElement('div');
        row.className = 'cp-ref-links-modal__item' + (link.id === referralLinksState.activeId ? ' is-active' : '');
        var meta = document.createElement('div');
        meta.className = 'cp-ref-links-modal__meta';
        var name = document.createElement('div');
        name.className = 'cp-ref-links-modal__name';
        name.textContent = link.name;
        var url = document.createElement('div');
        url.className = 'cp-ref-links-modal__url';
        url.textContent = buildNamedRefUrl(referralBaseUrl, link.slug || '');
        meta.appendChild(name);
        meta.appendChild(url);
        if (link.description && String(link.description).trim()) {
          var desc = document.createElement('div');
          desc.className = 'cp-ref-links-modal__desc';
          desc.textContent = link.description.trim();
          meta.appendChild(desc);
        }

        var selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = 'cp-ref-links-modal__select';
        selectBtn.textContent = refLinksI18n.select;
        selectBtn.addEventListener('click', function() {
          referralLinksState.activeId = link.id;
          syncReferralInput();
          renderRefLinksList();
          persistReferralLinks();
        });

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'cp-ref-links-modal__remove';
        removeBtn.textContent = refLinksI18n.remove;
        var isMainLink = link.id === 'default';
        if (isMainLink) {
          removeBtn.style.display = 'none';
          removeBtn.setAttribute('aria-hidden', 'true');
        } else {
          removeBtn.addEventListener('click', function() {
            referralLinksState.links = referralLinksState.links.filter(function(item) { return item.id !== link.id; });
            if (!referralLinksState.links.some(function(item) { return item.id === referralLinksState.activeId; })) {
              referralLinksState.activeId = referralLinksState.links[0].id;
            }
            syncReferralInput();
            renderRefLinksList();
            persistReferralLinks();
          });
        }

        row.appendChild(meta);
        row.appendChild(selectBtn);
        row.appendChild(removeBtn);
        refLinksList.appendChild(row);
      });
    }

    function closeRefLinksModal() {
      if (!refLinksModal || !refLinksModal.open) return;
      refLinksModal.close();
      showRefLinkError('');
    }

    function openRefLinksModal() {
      if (!refLinksModal) return;
      syncReferralInput();
      renderRefLinksList();
      showRefLinkError('');
      updateRefLinkPreview();
      try { refLinksModal.showModal(); } catch (_e) {}
    }

    function normalizeStoredRefLinks(raw) {
      var parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch (_e) {
        parsed = null;
      }
      var links = Array.isArray(parsed && parsed.links) ? parsed.links : [];
      var defaultNameLc = String(refLinksI18n.defaultName || 'Main link').toLowerCase();
      var normalized = links
        .map(function(item) {
          var label = String(item && item.name ? item.name : '').trim();
          if (!label) return null;
          var id = String(item.id || ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)));
          var isDefault = (id === 'default') || (label.toLowerCase() === defaultNameLc);
          var rawSlug = String(item && item.slug ? item.slug : '').trim();
          var slug = rawSlug ? slugifyLabel(rawSlug) : '';
          var description = String(item && item.description ? item.description : '').trim();
          // Keep default link as personal base code URL (no custom slug path).
          if (isDefault && (slug === 'main-link' || slug === slugifyLabel(refLinksI18n.defaultName))) {
            slug = '';
          } else if (!isDefault && !slug) {
            // Named links without explicit slug derive slug from label.
            slug = slugifyLabel(label);
          }
          return {
            id: id,
            name: label,
            slug: slug,
            description: description
          };
        })
        .filter(Boolean)
        .slice(0, REF_LINKS_MAX);
      if (!normalized.length) {
        normalized.push({ id: 'default', name: refLinksI18n.defaultName, slug: '' });
      }
      var activeId = String(parsed && parsed.activeId ? parsed.activeId : normalized[0].id);
      if (!normalized.some(function(item) { return item.id === activeId; })) {
        activeId = normalized[0].id;
      }
      return { links: normalized, activeId: activeId };
    }

    var subTabs = root.querySelectorAll('[data-cp-subtab]');
    var subPanels = root.querySelectorAll('[data-cp-subpanel]');
    var analyticsRoot = root.querySelector('[data-cp-analytics-root]');
    var analyticsLoadingEl = root.querySelector('[data-cp-analytics-loading]');
    var analyticsEmptyEl = root.querySelector('[data-cp-analytics-empty]');
    var analyticsEventsBody = root.querySelector('[data-cp-analytics-events-body]');
    var analyticsLoadMoreBtn = root.querySelector('[data-cp-analytics-load-more]');
    var funnelListEl = root.querySelector('[data-cp-funnel-list]');
    var topLinksBarsEl = root.querySelector('[data-cp-top-links-bars]');
    var topSourcesBarsEl = root.querySelector('[data-cp-top-sources-bars]');
    var filterPeriodEl = root.querySelector('[data-cp-af-period]');
    var filterCompareEl = root.querySelector('[data-cp-af-compare]');
    var filterLinkEl = root.querySelector('[data-cp-af-link]');
    var filterSourceEl = root.querySelector('[data-cp-af-source]');
    var activeSubtab = 'overview';
    var analyticsState = {
      initialized: false,
      loading: false,
      loadingMore: false,
      hasMoreEvents: false,
      eventsCursor: '',
      filters: {
        days: 30,
        compare: 1,
        linkId: '',
        source: ''
      }
    };
    var analyticsI18n = {
      loading: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.loading) || 'Loading...',
      empty: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.analytics_empty) || 'No analytics data yet.',
      clicks: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.analytics_clicks) || 'Clicks',
      users: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.analytics_new_users) || 'New users',
      buyers: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.analytics_buyers) || 'Buyers',
      creators: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.analytics_new_creators) || 'New creators',
      currency: 'EUR',
      direct: (window.CreatorI18n && window.CreatorI18n.community && window.CreatorI18n.community.analytics_direct) || 'direct'
    };

    function setActiveSubtab(key) {
      activeSubtab = key === 'analytics' ? 'analytics' : 'overview';
      subTabs.forEach(function(tab) {
        var tabKey = tab.getAttribute('data-cp-subtab');
        var isActive = tabKey === activeSubtab;
        tab.classList.toggle('cp-subtab--active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      subPanels.forEach(function(panel) {
        var panelKey = panel.getAttribute('data-cp-subpanel');
        var isActive = panelKey === activeSubtab;
        panel.hidden = !isActive;
        panel.classList.toggle('is-active', isActive);
      });
      if (activeSubtab === 'analytics' && !analyticsState.initialized) {
        analyticsState.initialized = true;
        loadAnalytics(false);
      }
    }

    function setAnalyticsLoading(isLoading) {
      analyticsState.loading = !!isLoading;
      if (analyticsLoadingEl) analyticsLoadingEl.hidden = !analyticsState.loading;
      if (analyticsEmptyEl && analyticsState.loading) analyticsEmptyEl.hidden = true;
    }

    function toPct(value, base) {
      if (!base || base <= 0) return '0%';
      return ((Number(value || 0) / Number(base)) * 100).toFixed(1).replace(/\.0$/, '') + '%';
    }

    function fmtNumber(value) {
      return new Intl.NumberFormat('de-DE').format(Number(value || 0));
    }

    function fmtMoney(value) {
      var num = Number(value || 0);
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: analyticsI18n.currency }).format(num);
    }

    function fmtDelta(value) {
      if (value == null || isNaN(Number(value))) return '–';
      var n = Number(value);
      var sign = n > 0 ? '+' : '';
      return sign + (n * 100).toFixed(1).replace(/\.0$/, '') + '%';
    }

    function renderKpis(kpis) {
      if (!analyticsRoot) return;
      var map = {
        clicks: function(v) { return fmtNumber(v); },
        unique_clicks: function(v) { return fmtNumber(v); },
        new_users: function(v) { return fmtNumber(v); },
        sales: function(v) { return fmtNumber(v); },
        revenue: function(v) { return fmtMoney(v); },
        new_creators: function(v) { return fmtNumber(v); }
      };
      analyticsRoot.querySelectorAll('[data-kpi]').forEach(function(card) {
        var key = card.getAttribute('data-kpi');
        var k = (kpis && kpis[key]) || {};
        var valueEl = card.querySelector('.cp-ak-value');
        var deltaEl = card.querySelector('.cp-ak-delta');
        var value = k && typeof k.value !== 'undefined' && k.value !== null ? k.value : 0;
        if (valueEl) valueEl.textContent = map[key] ? map[key](value) : String(value);
        if (deltaEl) deltaEl.textContent = fmtDelta(k.delta);
      });
    }

    function renderBars(container, items, labelKey, valueKey, valueFormatter) {
      if (!container) return;
      container.innerHTML = '';
      var rows = Array.isArray(items) ? items : [];
      if (!rows.length) {
        container.innerHTML = '<div class="cp-footnote">' + analyticsI18n.empty + '</div>';
        return;
      }
      var max = rows.reduce(function(m, r) { return Math.max(m, Number(r[valueKey] || 0)); }, 0);
      rows.slice(0, 8).forEach(function(row) {
        var label = String(row[labelKey] || analyticsI18n.direct);
        var val = Number(row[valueKey] || 0);
        var pct = max > 0 ? Math.max(1, Math.round((val / max) * 100)) : 0;
        var item = document.createElement('div');
        item.className = 'cp-bar-item';
        item.innerHTML =
          '<span class="cp-bar-item__label">' + label.replace(/</g, '&lt;') + '</span>' +
          '<span class="cp-bar-item__value">' + (valueFormatter ? valueFormatter(val) : fmtNumber(val)) + '</span>' +
          '<div class="cp-bar-item__track"><div class="cp-bar-item__fill" style="width:' + pct + '%"></div></div>';
        container.appendChild(item);
      });
    }

    function renderFunnel(funnel) {
      if (!funnelListEl) return;
      var clicks = Number(funnel && funnel.clicks || 0);
      var users = Number(funnel && funnel.users || 0);
      var buyers = Number(funnel && funnel.buyers || 0);
      var creators = Number(funnel && funnel.creators || 0);
      var steps = [
        { key: 'clicks', label: analyticsI18n.clicks, value: clicks, pct: '100%' },
        { key: 'users', label: analyticsI18n.users, value: users, pct: toPct(users, clicks) },
        { key: 'buyers', label: analyticsI18n.buyers, value: buyers, pct: toPct(buyers, clicks) },
        { key: 'creators', label: analyticsI18n.creators, value: creators, pct: toPct(creators, clicks) }
      ];
      funnelListEl.innerHTML = '';
      steps.forEach(function(step) {
        var width = clicks > 0 ? Math.max(1, Math.round((step.value / clicks) * 100)) : 0;
        var row = document.createElement('div');
        row.className = 'cp-funnel-step';
        row.innerHTML =
          '<div class="cp-funnel-step__meta">' +
            '<span class="cp-funnel-step__label">' + step.label + ' (' + fmtNumber(step.value) + ')</span>' +
            '<span class="cp-funnel-step__pct">' + step.pct + '</span>' +
          '</div>' +
          '<div class="cp-bar-item__track"><div class="cp-bar-item__fill" style="width:' + width + '%"></div></div>';
        funnelListEl.appendChild(row);
      });
    }

    function renderEvents(rows, append) {
      if (!analyticsEventsBody) return;
      if (!append) analyticsEventsBody.innerHTML = '';
      var list = Array.isArray(rows) ? rows : [];
      if (!append && !list.length) {
        if (analyticsEmptyEl) analyticsEmptyEl.hidden = false;
        return;
      }
      if (analyticsEmptyEl) analyticsEmptyEl.hidden = true;
      function esc(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }
      list.forEach(function(item) {
        var landingPath = item && item.landing_path ? String(item.landing_path) : '';
        var linkCell = esc(item.link_label || '–');
        if (landingPath) {
          linkCell += '<br><small class="cp-events-path">' + esc(landingPath) + '</small>';
        }
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + esc(item.time_label || '–') + '</td>' +
          '<td>' + linkCell + '</td>' +
          '<td>' + esc(item.source || analyticsI18n.direct) + '</td>' +
          '<td>' + esc(item.outcome || 'click') + '</td>' +
          '<td>' + (item.revenue != null ? fmtMoney(item.revenue) : '–') + '</td>';
        analyticsEventsBody.appendChild(tr);
      });
    }

    function currentAnalyticsParams() {
      return {
        owner_id: ownerId,
        days: analyticsState.filters.days,
        compare: analyticsState.filters.compare ? 1 : 0,
        link_id: analyticsState.filters.linkId || '',
        source: analyticsState.filters.source || ''
      };
    }

    function fetchAnalytics(op, params) {
      var q = new URLSearchParams();
      Object.keys(params || {}).forEach(function(key) {
        var val = params[key];
        if (val !== '' && val !== null && val !== undefined) q.set(key, String(val));
      });
      q.set('op', op);
      q.set('_t', String(Date.now()));
      return fetch(dispatchApiBase() + '?' + q.toString(), { credentials: 'include', cache: 'no-store' })
        .then(function(r) { return r.json(); });
    }

    function updateFilterOptions(selectEl, list, valueKey, labelKey) {
      if (!selectEl) return;
      var current = selectEl.value;
      var staticFirst = selectEl.querySelector('option');
      var firstHtml = staticFirst ? staticFirst.outerHTML : '';
      selectEl.innerHTML = firstHtml;
      (Array.isArray(list) ? list : []).forEach(function(item) {
        if (!item || !item[valueKey]) return;
        var opt = document.createElement('option');
        opt.value = String(item[valueKey]);
        opt.textContent = String(item[labelKey] || item[valueKey]);
        selectEl.appendChild(opt);
      });
      if (current && Array.from(selectEl.options).some(function(o) { return o.value === current; })) {
        selectEl.value = current;
      }
    }

    function loadAnalytics(loadEventsMore) {
      if (!analyticsRoot || analyticsState.loading) return;
      if (loadEventsMore) {
        analyticsState.loadingMore = true;
      } else {
        analyticsState.eventsCursor = '';
      }
      setAnalyticsLoading(true);
      var params = currentAnalyticsParams();
      var eventsParams = Object.assign({}, params, { limit: 20 });
      if (analyticsState.eventsCursor) eventsParams.cursor = analyticsState.eventsCursor;

      var pOverview = fetchAnalytics('get-community-analytics-overview', params);
      var pLinks = fetchAnalytics('get-community-analytics-links', params);
      var pSources = fetchAnalytics('get-community-analytics-sources', params);
      var pEvents = fetchAnalytics('get-community-analytics-events', eventsParams);

      Promise.all([pOverview, pLinks, pSources, pEvents]).then(function(results) {
        var overviewRes = results[0] || {};
        var linksRes = results[1] || {};
        var sourcesRes = results[2] || {};
        var eventsRes = results[3] || {};

        if (overviewRes.ok) {
          renderKpis(overviewRes.kpis || {});
          renderFunnel(overviewRes.funnel || {});
        } else {
          // Even on error, render zeros so user sees the API responded
          renderKpis({});
          renderFunnel({ clicks: 0, users: 0, buyers: 0, creators: 0 });
        }

        if (linksRes.ok) {
          renderBars(topLinksBarsEl, linksRes.rows, 'link_label', 'clicks', fmtNumber);
          updateFilterOptions(filterLinkEl, linksRes.options, 'link_id', 'label');
        } else {
          renderBars(topLinksBarsEl, [], 'link_label', 'clicks', fmtNumber);
        }

        if (sourcesRes.ok) {
          renderBars(topSourcesBarsEl, sourcesRes.rows, 'source', 'clicks', fmtNumber);
          updateFilterOptions(filterSourceEl, sourcesRes.options, 'source', 'label');
        } else {
          renderBars(topSourcesBarsEl, [], 'source', 'clicks', fmtNumber);
        }

        if (eventsRes.ok) {
          renderEvents(eventsRes.rows || [], !!analyticsState.eventsCursor);
          analyticsState.eventsCursor = eventsRes.next_cursor || '';
          analyticsState.hasMoreEvents = !!eventsRes.next_cursor;
          if (analyticsLoadMoreBtn) analyticsLoadMoreBtn.hidden = !analyticsState.hasMoreEvents;
        } else if (!analyticsState.eventsCursor) {
          renderEvents([], false);
          if (analyticsLoadMoreBtn) analyticsLoadMoreBtn.hidden = true;
        }
      }).catch(function() {
        if (analyticsEmptyEl) {
          analyticsEmptyEl.hidden = false;
          analyticsEmptyEl.textContent = analyticsI18n.empty;
        }
      }).finally(function() {
        analyticsState.loading = false;
        analyticsState.loadingMore = false;
        if (analyticsLoadingEl) analyticsLoadingEl.hidden = true;
      });
    }

    function bindAnalyticsFilters() {
      if (filterPeriodEl && !filterPeriodEl.dataset.cpBound) {
        filterPeriodEl.dataset.cpBound = '1';
        filterPeriodEl.addEventListener('change', function() {
          analyticsState.filters.days = Number(filterPeriodEl.value || 30);
          loadAnalytics(false);
        });
      }
      if (filterCompareEl && !filterCompareEl.dataset.cpBound) {
        filterCompareEl.dataset.cpBound = '1';
        filterCompareEl.addEventListener('change', function() {
          analyticsState.filters.compare = Number(filterCompareEl.value || 0) ? 1 : 0;
          loadAnalytics(false);
        });
      }
      if (filterLinkEl && !filterLinkEl.dataset.cpBound) {
        filterLinkEl.dataset.cpBound = '1';
        filterLinkEl.addEventListener('change', function() {
          analyticsState.filters.linkId = filterLinkEl.value || '';
          loadAnalytics(false);
        });
      }
      if (filterSourceEl && !filterSourceEl.dataset.cpBound) {
        filterSourceEl.dataset.cpBound = '1';
        filterSourceEl.addEventListener('change', function() {
          analyticsState.filters.source = filterSourceEl.value || '';
          loadAnalytics(false);
        });
      }
      if (analyticsLoadMoreBtn && !analyticsLoadMoreBtn.dataset.cpBound) {
        analyticsLoadMoreBtn.dataset.cpBound = '1';
        analyticsLoadMoreBtn.addEventListener('click', function() {
          if (!analyticsState.hasMoreEvents || analyticsState.loading) return;
          loadAnalytics(true);
        });
      }
    }

    if (subTabs.length && !root.dataset.cpSubtabsBound) {
      root.dataset.cpSubtabsBound = '1';
      subTabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          setActiveSubtab(tab.getAttribute('data-cp-subtab'));
        });
      });
    }
    bindAnalyticsFilters();
    setActiveSubtab(activeSubtab);

    fetchReferralCode(ownerId).then(function (res) {
      if (!(res && res.ok && (res.url || res.short_url)) || !referralSection || !referralInput || !copyBtn) return;
      referralSection.style.display = '';
      referralBaseUrl = res.short_url || res.url;

      getCustomerSetting(ownerId, REF_LINKS_SETTING_KEY)
        .then(function(settingRes) {
          var raw = settingRes && settingRes.ok ? settingRes.value : null;
          referralLinksState = normalizeStoredRefLinks(raw);
          syncReferralInput();
          renderRefLinksList();
        })
        .catch(function() {
          referralLinksState = normalizeStoredRefLinks(null);
          syncReferralInput();
          renderRefLinksList();
        });

      if (window.ShareButtonInit) setTimeout(function () { window.ShareButtonInit(); }, 0);
      if (copyBtn && !copyBtn.dataset.cpBound) {
        copyBtn.dataset.cpBound = '1';
        copyBtn.addEventListener('click', function () {
          var linkToCopy = activeReferralLinkUrl();
          if (!linkToCopy) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(linkToCopy).then(function () {
              var orig = copyBtn.textContent || copyLabel;
              copyBtn.textContent = copiedLabel;
              setTimeout(function () { copyBtn.textContent = orig; }, 1500);
            });
          } else {
            referralInput.select();
            document.execCommand('copy');
            var orig = copyBtn.textContent || copyLabel;
            copyBtn.textContent = copiedLabel;
            setTimeout(function () { copyBtn.textContent = orig; }, 1500);
          }
        });
      }

      if (referralInput && !referralInput.dataset.cpManageBound) {
        referralInput.dataset.cpManageBound = '1';
        referralInput.addEventListener('click', function() {
          openRefLinksModal();
        });
      }

      if (shareBtn && !shareBtn.dataset.cpBound) {
        shareBtn.dataset.cpBound = '1';
        // Capture-phase handler to force selected custom link and bypass default generic share URL builder.
        shareBtn.addEventListener('click', function(e) {
          var url = activeReferralLinkUrl();
          if (!url) return;
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          if (window.ShareButtonOpenModal) {
            window.ShareButtonOpenModal(url, document.title, url);
            return;
          }
          if (navigator.share) {
            navigator.share({ url: url, title: document.title }).catch(function () {});
          } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).catch(function () {});
          }
        }, true);
      }

      if (refLinksAddBtn && !refLinksAddBtn.dataset.cpBound) {
        refLinksAddBtn.dataset.cpBound = '1';
        refLinksAddBtn.addEventListener('click', function() {
          var slugRaw = refLinksSlugInput ? String(refLinksSlugInput.value || '').trim() : '';
          var newSlug = slugifyLabel(slugRaw);
          var label = refLinksNameInput ? String(refLinksNameInput.value || '').trim() : '';
          var description = refLinksDescInput ? String(refLinksDescInput.value || '').trim() : '';
          if (!newSlug) {
            showRefLinkError(refLinksI18n.requiredSlug);
            return;
          }
          if (!label) {
            showRefLinkError(refLinksI18n.requiredName);
            return;
          }
          var exists = referralLinksState.links.some(function(item) {
            return String(item.name || '').toLowerCase() === label.toLowerCase();
          });
          if (exists) {
            showRefLinkError(refLinksI18n.duplicate);
            return;
          }
          if (!isValidRefSlug(newSlug)) {
            showRefLinkError(refLinksI18n.invalidSlug);
            return;
          }
          if (isReservedRefSlug(newSlug)) {
            showRefLinkError(refLinksI18n.reserved);
            return;
          }
          var slugExists = referralLinksState.links.some(function(item) {
            return String(item.slug || '').toLowerCase() === newSlug.toLowerCase();
          });
          if (slugExists) {
            showRefLinkError(refLinksI18n.duplicateSlug);
            return;
          }
          if (referralLinksState.links.length >= REF_LINKS_MAX) {
            showRefLinkError(refLinksI18n.maxReached);
            return;
          }
          var prevLinks = referralLinksState.links.slice();
          var prevActive = referralLinksState.activeId;
          var newLink = {
            id: 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            name: label,
            slug: newSlug,
            description: description
          };
          referralLinksState.links.push(newLink);
          referralLinksState.activeId = newLink.id;
          if (refLinksSlugInput) refLinksSlugInput.value = '';
          if (refLinksNameInput) refLinksNameInput.value = '';
          if (refLinksDescInput) refLinksDescInput.value = '';
          showRefLinkError('');
          syncReferralInput();
          renderRefLinksList();
          persistReferralLinks().then(function(syncRes) {
            if (syncRes && syncRes.ok === false) {
              referralLinksState.links = prevLinks;
              referralLinksState.activeId = prevActive;
              syncReferralInput();
              renderRefLinksList();
              if (syncRes.error === 'reserved_slug' || syncRes.error === 'slug_conflicts_with_code' || syncRes.error === 'invalid_slug') {
                showRefLinkError(syncRes.error === 'invalid_slug' ? refLinksI18n.invalidSlug : refLinksI18n.reserved);
              } else if (syncRes.error === 'slug_taken') {
                showRefLinkError(refLinksI18n.duplicateSlug);
              } else {
                showRefLinkError('Error while saving link.');
              }
            }
          });
        });
      }

      if (refLinksSlugInput && !refLinksSlugInput.dataset.cpBound) {
        refLinksSlugInput.dataset.cpBound = '1';
        refLinksSlugInput.addEventListener('input', updateRefLinkPreview);
      }

      if (refLinksModal && !refLinksModal.dataset.cpBound) {
        refLinksModal.dataset.cpBound = '1';
        refLinksCloseEls.forEach(function(btn) {
          btn.addEventListener('click', closeRefLinksModal);
        });
        refLinksModal.addEventListener('click', function(e) {
          if (e.target === refLinksModal) closeRefLinksModal();
        });
      }
    }).catch(function () {});

    fetchNetwork(ownerId).then(function (data) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (!data.ok) {
        if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = data.error || 'Fehler beim Laden.'; }
        return;
      }
      var network = data.network || {};
      level1Partners = network.level1 || [];
      levels2to10 = network.levels2to10 || [];
      meData = network.me || null;
      levelPercents = network.levelPercents || {};

      renderStats(netKvEl, network.stats);

      if (duSection) duSection.style.display = '';
      if (meData) renderDuSection(meData);

      if (emptyEl) { emptyEl.style.display = 'none'; emptyEl.textContent = ''; }
      if (levelsEl) {
        levelsEl.style.display = 'block';
        renderLevels();
      }
    }).catch(function (err) {
      console.error('[Community Panel] Load error:', err);
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) { emptyEl.style.display = 'block'; emptyEl.textContent = 'Fehler beim Laden.'; }
    });

    // Mentor Support Stats
    fetchMentorStats(ownerId, root);
  }

  function fetchMentorStats(ownerId, root) {
    var mentorSection = root.querySelector('[data-cp-mentor-stats]');
    if (!mentorSection) {
      mentorSection = el('div', { class: 'cp-mentor-stats', 'data-cp-mentor-stats': '' });
      root.appendChild(mentorSection);
    }

    var apiBase = window.__eazy_api_base || '/apps/creator-dispatch';
    fetch(apiBase + '?op=get-mentor-activity&owner_id=' + ownerId + '&role=mentor', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.activities || data.activities.length === 0) {
          mentorSection.style.display = 'none';
          return;
        }

        var activities = data.activities;
        var designsSent = activities.filter(function (a) { return a.action_type === 'send_design'; }).length;
        var eazSent = activities.filter(function (a) { return a.action_type === 'send_eaz'; }).reduce(function (sum, a) {
          try { var d = JSON.parse(a.details_json || '{}'); return sum + (d.amount || 0); } catch (_) { return sum; }
        }, 0);
        var productsPub = activities.filter(function (a) { return a.action_type === 'publish_product'; }).length;
        var heroCreated = activities.filter(function (a) { return a.action_type === 'create_hero'; }).length;

        mentorSection.style.display = '';
        mentorSection.innerHTML =
          '<div class="cp-section-title">Mentor Aktivit\u00e4t</div>' +
          '<div class="cp-mentor-grid">' +
            '<div class="cp-mentor-stat">' + ICONS.designs + '<span class="cp-mentor-val">' + designsSent + '</span><span class="cp-mentor-label">Designs gesendet</span></div>' +
            '<div class="cp-mentor-stat"><span class="cp-stat-icon">\uD83D\uDCB0</span><span class="cp-mentor-val">' + eazSent + '</span><span class="cp-mentor-label">EAZ gesendet</span></div>' +
            '<div class="cp-mentor-stat">' + ICONS.products + '<span class="cp-mentor-val">' + productsPub + '</span><span class="cp-mentor-label">Produkte ver\u00f6ffentlicht</span></div>' +
            '<div class="cp-mentor-stat"><span class="cp-stat-icon">\uD83D\uDDBC</span><span class="cp-mentor-val">' + heroCreated + '</span><span class="cp-mentor-label">Hero Bilder</span></div>' +
          '</div>';
      })
      .catch(function (err) {
        console.warn('[Community Panel] Mentor stats load failed:', err);
        mentorSection.style.display = 'none';
      });
  }

  function run() {
    document.querySelectorAll('.community-panel[data-community-root]').forEach(function (r) { init(r); });
  }

  function runForModal() {
    var modal = document.querySelector('.csm-modal');
    if (!modal) return;
    var panels = modal.querySelectorAll('.community-panel[data-community-root]');
    panels.forEach(function (r) { init(r); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  window.addEventListener('creator-settings-v2-tab-changed', function (e) {
    if (e.detail && e.detail.tab === 'community') runForModal();
  });

  window.addEventListener('creator-settings-v2-opened', function () {
    setTimeout(runForModal, 50);
  });

  window.CommunityPanel = { init: init, refresh: runForModal };
})();
