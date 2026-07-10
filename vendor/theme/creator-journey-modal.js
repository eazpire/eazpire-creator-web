/**
 * Creator Journey Modal — gaming unlock tree layout
 */
(function () {
  'use strict';

  var overlay = document.getElementById('cjOverlay');
  var sidebar = document.getElementById('cjSidebar');
  var contentEl = document.getElementById('cjContent');
  var contentBg = document.getElementById('cjContentBg');
  var mobileMenuBtn = document.getElementById('cjMobileMenuBtn');
  var mobileDrawerOverlay = document.getElementById('cjMobileDrawerOverlay');
  var currentTab = 'overview';
  var journeyData = null;
  var levelData = null;
  var treeFilter = 'royalty';
  var eazEconomyData = null;
  var eazEconomyLoadPromise = null;
  var eazEconomyExpandedAxis = '';
  var isMobileSidebarOpen = false;
  var closeTimer = null;
  var CJ_MOBILE_MAX = 991;
  var pendingCommitNodeKey = null;
  var bgAppliedKey = '';
  var journeyLoadPromise = null;
  var onboardingData = null;
  var questsLoadPromise = null;
  var questType = 'main';
  var questFilter = 'available';

  var overviewStatsData = null;
  var overviewPrefs = null;
  var overviewLoadPromise = null;
  var OVERVIEW_CUSTOMER_SETTING_KEY = 'journey.overview_prefs';
  var OVERVIEW_LOCAL_STORAGE_KEY = 'cj_overview_prefs';

  var OVERVIEW_SECTION_DEFS = [
    { id: 'portfolio', defaultVisible: true, defaultCollapsed: false },
    { id: 'performance', defaultVisible: true, defaultCollapsed: false },
    { id: 'quests', defaultVisible: true, defaultCollapsed: false },
    { id: 'eaz', defaultVisible: true, defaultCollapsed: true },
    { id: 'unlocks', defaultVisible: true, defaultCollapsed: false }
  ];

  var PINNABLE_UNLOCK_STATS = [
    { id: 'royalty', treeTab: 'royalty' },
    { id: 'eaz_economy', treeTab: 'eaz_economy' },
    { id: 'product', treeTab: 'product' },
    { id: 'market', treeTab: 'market' },
    { id: 'channel', treeTab: 'channel' },
    { id: 'creator_name', treeTab: 'creator_name' }
  ];

  var DEFAULT_PINNED_STATS = ['royalty', 'eaz_economy', 'product', 'market', 'channel', 'creator_name'];

  var OVERVIEW_STAT_ICONS = {
    products_online: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    active_designs: '<svg viewBox="0 0 24 24"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    community: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    sales: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    hero: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    product_clicks: '<svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
    ctr: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/></svg>',
    conversion: '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>',
    quest_main: '<svg viewBox="0 0 24 24"><path d="M12 2l2.4 4.8L20 8l-4 3.8L17 18l-5-2.8L7 18l1-6.2L4 8l5.6-1.2L12 2z"/></svg>',
    quest_daily: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    eaz_free: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4.5a2 2 0 0 1 0 4H9"/></svg>',
    eaz_purchased: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    eaz_earned: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    eaz_won: '<svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    eaz_spent: '<svg viewBox="0 0 24 24"><path d="M12 2v20M7 12h10"/></svg>',
    royalty: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    unlock: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
  };

  function setPanelLoading(loading) {
    var overviewLoad = document.getElementById('cjOverviewLoading');
    var treeLoad = document.getElementById('cjTreeLoading');
    var codeHint = document.getElementById('cjCodeHint');
    var balanceVal = document.getElementById('cjSidebarBalanceValue');
    var balanceWrap = document.getElementById('cjSidebarBalance');
    var xpEl = document.getElementById('cjFloatLevelXp');
    var levelWrap = document.getElementById('cjFloatLevel');

    if (overviewLoad) overviewLoad.hidden = !loading;
    if (treeLoad) treeLoad.hidden = !loading;
    if (loading) {
      if (codeHint) codeHint.hidden = true;
      var overviewShell = document.getElementById('cjOverviewShell');
      if (overviewShell) overviewShell.hidden = true;
      if (balanceWrap) {
        balanceWrap.hidden = false;
        if (balanceVal) {
          balanceVal.textContent = '—';
          balanceVal.classList.add('is-loading');
        }
      }
      if (levelWrap) levelWrap.hidden = false;
      if (xpEl) {
        xpEl.textContent = t('creator.journey.loading', 'Loading…');
        xpEl.classList.add('is-loading');
      }
    } else {
      if (balanceVal) balanceVal.classList.remove('is-loading');
      if (xpEl) xpEl.classList.remove('is-loading');
    }
  }

  function isMobileLayout() {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: ' + CJ_MOBILE_MAX + 'px)').matches;
  }

  function syncMobileLayout() {
    if (!overlay) return;
    overlay.classList.toggle('cj-is-mobile-layout', isMobileLayout());
    if (!isMobileLayout()) closeMobileSidebar();
  }

  function eazvCoinUrl() {
    return window.EazCoinBrand && window.EazCoinBrand.urlEazv
      ? window.EazCoinBrand.urlEazv()
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch?op=platform-asset-public&slot=eazv_coin_logo';
  }

  var EAZ_COIN_URL = eazvCoinUrl();

  var TREE_TAB_ORDER = [
    'royalty',
    'eaz_economy',
    'product', 'design_type', 'market', 'channel',
    'automation', 'promotion', 'hero', 'social',
    'design_slot', 'creator_name'
  ];

  var SOFTSTYLE_PRODUCT_KEY = 'unisex-softstyle-cotton-tee';
  var FLAG_CDN = 'https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.2/flags/4x3/';
  var expandedProductKeys = {};
  var expandedColorKeys = {};
  var expandedContinentKeys = {};

  var CATEGORY_ICON_SVG = {
    royalty: '<svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    product: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7.3 12 12l8.7-4.7M12 22V12"/></svg>',
    design_type: '<svg viewBox="0 0 24 24"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    market: '<svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
    channel: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    automation: '<svg viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 11-12h-9l1-8z"/></svg>',
    promotion: '<svg viewBox="0 0 24 24"><path d="M3 11v2a4 4 0 0 0 4 4h10"/><path d="m7 15 4-9 4 9"/></svg>',
    hero: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    social: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    variant: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    design_slot: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    creator_name: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    eaz_economy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4.5a2 2 0 0 1 0 4H9"/></svg>',
  };

  var EAZ_AXIS_LABELS = { cost: 'Cost', daily: 'Daily', cap: 'Cap', kickstarter: 'Kickstarter' };
  var EAZ_CATEGORY_ORDER = ['cost', 'daily', 'cap', 'kickstarter'];

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function tpl(key, fallback, vars) {
    var s = t(key, fallback);
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace(new RegExp('\\{\\{\\s*' + k + '\\s*\\}\\}', 'g'), vars[k]);
      });
    }
    return s;
  }

  function categoryLabel(cat) {
    return tpl('creator.journey.cat_' + cat, cat.replace(/_/g, ' '));
  }

  function t(key, fallback) {
    var map = window.CreatorI18n || {};
    return map[key] || fallback;
  }

  function ownerId() {
    if (typeof window._resolveEazOwnerId === 'function') return window._resolveEazOwnerId();
    return window.__EAZ_OWNER_ID || null;
  }

  async function apiFetch(op, params, method, body) {
    if (typeof window.creatorApiFetch !== 'function') throw new Error('creatorApiFetch unavailable');
    if (method === 'POST') {
      return window.creatorApiFetch(op, params || {}, { method: 'POST', body: body || {} });
    }
    return window.creatorApiFetch(op, params || {});
  }

  function isOpen() {
    return overlay && overlay.classList.contains('is-open');
  }

  function toggleMobileSidebar() {
    if (isMobileSidebarOpen) closeMobileSidebar();
    else openMobileSidebar();
  }

  function openMobileSidebar() {
    if (!isMobileLayout()) return;
    if (!sidebar || !mobileDrawerOverlay) return;
    isMobileSidebarOpen = true;
    sidebar.classList.add('is-open');
    mobileDrawerOverlay.classList.add('is-open');
    mobileDrawerOverlay.setAttribute('aria-hidden', 'false');
  }

  function closeMobileSidebar() {
    if (!sidebar || !mobileDrawerOverlay) return;
    isMobileSidebarOpen = false;
    sidebar.classList.remove('is-open');
    mobileDrawerOverlay.classList.remove('is-open');
    mobileDrawerOverlay.setAttribute('aria-hidden', 'true');
  }

  function setTab(tab) {
    currentTab = tab || 'overview';
    document.querySelectorAll('.cj-nav-item[data-cj-nav]').forEach(function (btn) {
      var on = btn.getAttribute('data-cj-nav') === currentTab;
      btn.classList.toggle('is-active', on);
    });
    document.querySelectorAll('.cj-panel[data-cj-panel]').forEach(function (panel) {
      var on = panel.getAttribute('data-cj-panel') === currentTab;
      panel.classList.toggle('is-active', on);
    });
    if (contentEl) {
      contentEl.classList.toggle('cj-content--unlock-tree', currentTab === 'unlock-tree');
    }
    updateFloatLevelVisibility();
    if (isMobileLayout()) closeMobileSidebar();
    if (currentTab === 'level' && window.creatorLevelPanel) {
      if (typeof window.creatorLevelPanel.load === 'function') {
        window.creatorLevelPanel.load();
      } else if (typeof window.creatorLevelPanel.reload === 'function') {
        window.creatorLevelPanel.reload();
      }
    } else if (window.creatorLevelPanel && typeof window.creatorLevelPanel.syncVisibility === 'function') {
      window.creatorLevelPanel.syncVisibility();
    }
    if (currentTab === 'quests') {
      loadQuests().catch(console.warn);
    }
    if (currentTab === 'overview') {
      loadOverviewStats().then(function () { renderOverview(); }).catch(console.warn);
    }
    document.dispatchEvent(new CustomEvent('creator-journey-tab-changed', {
      detail: { tab: currentTab }
    }));
  }

  function updateFloatLevelVisibility() {
    /* Level widget lives in sidebar — visibility handled in renderFloatLevel */
  }

  function nodeTitle(node) {
    if (node.metadata && node.metadata.royalty_percent != null) {
      return tpl('creator.journey.royalty_tier_title', '{{ pct }}% royalty', {
        pct: String(node.metadata.royalty_percent)
      });
    }
    if (node.metadata && node.metadata.continent_name) return String(node.metadata.continent_name);
    if (node.metadata && node.metadata.country_name) return String(node.metadata.country_name);
    if (node.metadata && node.metadata.title) return String(node.metadata.title);
    if (node.category === 'market' && isMarketContinentNode(node)) {
      return continentTitle(node.region_code || marketContinentCode(node));
    }
    if (node.category === 'market' && node.region_code) {
      return marketCountryName(node.region_code);
    }
    if (node.product_key) return node.product_key;
    if (node.design_type) return node.design_type;
    if (node.region_code) return node.region_code;
    if (node.channel_id) return node.channel_id;
    if (node.social_platform) return node.social_platform;
    if (node.name_slot) return 'Creator name ' + node.name_slot;
    if (node.slot_index) return 'Design slot ' + node.slot_index;
    if (node.automation_slot) return 'Automation ' + node.automation_slot;
    if (node.promo_slot) return 'Promotion ' + node.promo_slot;
    if (node.hero_slot) return 'Hero slot ' + node.hero_slot;
    return node.node_key;
  }

  function isMarketContinentNode(node) {
    if (!node) return false;
    if (node.metadata && node.metadata.market_kind === 'continent') return true;
    return String(node.node_key || '').indexOf('market_continent:') === 0;
  }

  function isMarketCountryNode(node) {
    if (!node || node.category !== 'market') return false;
    if (isMarketContinentNode(node)) return false;
    if (node.metadata && node.metadata.market_kind === 'country') return true;
    return String(node.node_key || '').indexOf('market:') === 0 &&
      String(node.node_key || '').indexOf('market_continent:') !== 0;
  }

  function marketContinentCode(node) {
    if (node.metadata && node.metadata.continent_code) return String(node.metadata.continent_code).toUpperCase();
    var key = String(node.node_key || '');
    if (key.indexOf('market_continent:') === 0) return key.slice('market_continent:'.length).toUpperCase();
    return String(node.region_code || '').toUpperCase();
  }

  function continentTitle(code) {
    var c = String(code || '').toUpperCase();
    var fromWindow = (typeof window !== 'undefined' && window.eazContinentLabels)
      ? window.eazContinentLabels()
      : null;
    if (fromWindow && fromWindow[c]) return fromWindow[c];
    var key = 'creator.topbar.continent_' + c.toLowerCase();
    var fallbacks = {
      AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America',
      SA: 'South America', OC: 'Oceania', AN: 'Antarctica'
    };
    return t(key, fallbacks[c] || c);
  }

  function marketCountryName(code) {
    var c = String(code || '').toUpperCase();
    if (c === 'UK') c = 'GB';
    var names = {
      EU: 'Europe', US: 'United States', GB: 'United Kingdom', UK: 'United Kingdom',
      CH: 'Switzerland', CA: 'Canada', AU: 'Australia', DE: 'Germany', AT: 'Austria',
      FR: 'France', NL: 'Netherlands', IT: 'Italy', ES: 'Spain', BE: 'Belgium',
      PL: 'Poland', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
      IE: 'Ireland', PT: 'Portugal', NZ: 'New Zealand', JP: 'Japan', KR: 'South Korea',
      CN: 'China', MX: 'Mexico', BR: 'Brazil'
    };
    return names[c] || c;
  }

  function marketFlagCode(node) {
    if (node.metadata && node.metadata.flag_code) return String(node.metadata.flag_code).toLowerCase();
    var c = String(node.region_code || '').toLowerCase();
    if (c === 'uk') return 'gb';
    return c || 'un';
  }

  function marketFlagHtml(node) {
    var code = marketFlagCode(node);
    return '<img class="cj-tree-card__flag" src="' + FLAG_CDN + escapeHtml(code) + '.svg" alt="" loading="lazy" width="48" height="36">';
  }

  function continentMarkHtml(node) {
    var code = marketContinentCode(node);
    return '<div class="cj-tree-card__continent-mark" data-continent="' + escapeHtml(code) + '" aria-hidden="true">' +
      '<span class="cj-tree-card__continent-code">' + escapeHtml(code) + '</span></div>';
  }

  function nodeImageUrl(node) {
    if (node.metadata && node.metadata.image_url) return node.metadata.image_url;
    return '';
  }

  function displayLevel() {
    return journeyData ? Number(journeyData.display_level) || 1 : 1;
  }

  function isLevelLocked(node) {
    return (Number(node.min_level) || 2) > displayLevel();
  }

  function groupNodesByLevel(nodes) {
    var map = {};
    (nodes || []).forEach(function (n) {
      var lv = Number(n.min_level) || 2;
      if (!map[lv]) map[lv] = [];
      map[lv].push(n);
    });
    return Object.keys(map)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .map(function (lv) {
        return { level: lv, nodes: map[lv] };
      });
  }

  function productCatalogStatus(node) {
    var s = node.metadata && node.metadata.catalog_is_active;
    if (s === 0 || s === '0') return 0;
    if (s === 1 || s === '1') return 1;
    return 2;
  }

  function productSections() {
    var ps = journeyData && journeyData.product_sections;
    return {
      preview: Number(ps && ps.preview_min_level) || 3,
      premium: Number(ps && ps.premium_min_level) || 5
    };
  }

  function splitProductNodes(nodes) {
    var starter = [];
    var preview = [];
    var offline = [];
    (nodes || []).forEach(function (n) {
      var s = productCatalogStatus(n);
      if (s === 2) starter.push(n);
      else if (s === 1) preview.push(n);
      else offline.push(n);
    });
    return { starter: starter, preview: preview, offline: offline };
  }

  function renderUnlockedStrip(nodes) {
    var unlocked = (nodes || []).filter(function (n) { return n.unlocked; });
    if (!unlocked.length) return '';
    return '<div class="cj-tree-unlocked-strip" role="list" aria-label="' + escapeHtml(t('creator.journey.unlocked', 'Unlocked')) + '">' +
      unlocked.map(function (n) {
        var img = nodeImageUrl(n);
        var imgHtml = img
          ? '<img class="cj-tree-unlocked-chip__img" src="' + escapeHtml(img) + '" alt="" loading="lazy">'
          : '<span class="cj-tree-unlocked-chip__img cj-tree-unlocked-chip__img--ph" aria-hidden="true"></span>';
        return '<div class="cj-tree-unlocked-chip" role="listitem">' + imgHtml +
          '<span class="cj-tree-unlocked-chip__label">' + escapeHtml(nodeTitle(n)) + '</span></div>';
      }).join('') + '</div>';
  }

  function formatEazBadge(committed, cost, unlocked) {
    if (unlocked) {
      return t('creator.journey.unlocked', 'Unlocked');
    }
    if (cost <= 0) {
      return t('creator.journey.eaz_free', 'Free');
    }
    return tpl('creator.journey.eaz_badge', '{{ committed }}/{{ cost }} EAZV', {
      committed: String(Math.round(committed * 100) / 100),
      cost: String(Math.round(cost * 100) / 100)
    });
  }

  function renderTreeCardMedia(imgUrl) {
    return imgUrl
      ? '<img class="cj-tree-card__img" src="' + escapeHtml(imgUrl) + '" alt="" loading="lazy">'
      : '<div class="cj-tree-card__img cj-tree-card__img--placeholder" aria-hidden="true"></div>';
  }

  function renderTreeCardAction(node, title, canAct, cost, unlockReady) {
    if (!canAct || cost <= 0) return '';
    var btnLabel = unlockReady
      ? t('creator.journey.unlock_short', 'Unlock')
      : t('creator.journey.commit_eaz', 'Commit');
    var btnCls = 'cj-tree-card__action cj-btn' + (unlockReady ? ' is-unlock-ready' : '');
    if (unlockReady) {
      return '<button type="button" class="' + btnCls + '" data-cj-tree-action data-cj-action="unlock" data-cj-unlock="' +
        escapeHtml(node.node_key) + '">' + escapeHtml(btnLabel) + '</button>';
    }
    return '<button type="button" class="' + btnCls + '" data-cj-tree-action data-cj-action="commit" data-cj-commit="' +
      escapeHtml(node.node_key) + '" data-cj-commit-title="' + escapeHtml(title) + '">' +
      escapeHtml(btnLabel) + '</button>';
  }

  function renderTreeCardFrame(node, opts) {
    opts = opts || {};
    var title = nodeTitle(node);
    var imgUrl = nodeImageUrl(node);
    var committed = Number(node.eaz_committed) || 0;
    var cost = Number(node.cost_eaz) || 0;
    var badge = formatEazBadge(committed, cost, !!node.unlocked);
    var hasAction = !!opts.hasAction;
    var frameCls = 'cj-tree-card__frame' + (hasAction ? ' cj-tree-card__frame--attached' : '');
    var statusHtml = node.unlocked ? '<span class="cj-tree-card__status" aria-hidden="true">✓</span>' : '';
    var mediaHtml;
    var mediaExtraCls = '';
    if (opts.continentMedia) {
      mediaHtml = continentMarkHtml(node);
      mediaExtraCls = ' cj-tree-card__media--continent';
    } else if (opts.flagMedia) {
      mediaHtml = marketFlagHtml(node);
      mediaExtraCls = ' cj-tree-card__media--flag';
    } else if (opts.sizeLabel) {
      mediaHtml = '<div class="cj-tree-card__size-label">' + escapeHtml(opts.sizeLabel) + '</div>';
      mediaExtraCls = ' cj-tree-card__media--size';
    } else {
      mediaHtml = renderTreeCardMedia(imgUrl);
    }
    return '<div class="' + frameCls + '">' +
      '<h4 class="cj-tree-card__title-in">' + escapeHtml(title) + '</h4>' +
      '<div class="cj-tree-card__media' + mediaExtraCls + '">' + mediaHtml + '</div>' +
      '<span class="cj-tree-card__eaz-badge">' + escapeHtml(badge) + '</span>' +
      statusHtml + '</div>';
  }

  function cardActionState(node, levelLocked) {
    var cost = Number(node.cost_eaz) || 0;
    var title = nodeTitle(node);
    var isCreator = journeyData && journeyData.is_creator;
    var canAct = !node.unlocked && isCreator && !node.locked_reason && !levelLocked;
    var committed = Number(node.eaz_committed) || 0;
    var unlockReady = canAct && cost > 0 && committed + 1e-9 >= cost;
    var hasAction = canAct && cost > 0;
    return {
      title: title,
      canAct: canAct,
      cost: cost,
      unlockReady: unlockReady,
      hasAction: hasAction,
      actionHtml: renderTreeCardAction(node, title, canAct, cost, unlockReady)
    };
  }

  function renderProductTreeCard(node, opts) {
    opts = opts || {};
    var sectionLocked = !!opts.sectionLocked;
    var levelLocked = sectionLocked || isLevelLocked(node);
    var act = cardActionState(node, levelLocked);
    var expandable = !!opts.expandable && !!node.unlocked;
    var expanded = expandable && !!expandedProductKeys[node.product_key || node.node_key];

    var cls = 'cj-tree-card cj-tree-card--product';
    if (levelLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';

    var expandAttr = expandable
      ? ' data-cj-expand-product="' + escapeHtml(node.product_key || '') + '"'
      : '';

    return '<article class="' + cls + '" data-node="' + escapeHtml(node.node_key) + '"' + expandAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, { hasAction: act.hasAction }) +
      act.actionHtml + '</div></article>';
  }

  function variantNodesForProduct(productKey) {
    return (journeyData && journeyData.nodes || []).filter(function (n) {
      return n.category === 'variant' && n.product_key === productKey;
    });
  }

  function variantColorNodes(productKey) {
    return variantNodesForProduct(productKey).filter(function (n) {
      return n.metadata && n.metadata.variant_kind === 'color';
    });
  }

  function variantSizeNodes(colorNodeKey) {
    return (journeyData && journeyData.nodes || []).filter(function (n) {
      return n.category === 'variant' && n.parent_key === colorNodeKey &&
        n.metadata && n.metadata.variant_kind === 'size';
    });
  }

  function renderVariantColorCard(node) {
    var levelLocked = isLevelLocked(node);
    var act = cardActionState(node, levelLocked);
    var expandable = !!node.unlocked;
    var expanded = expandable && !!expandedColorKeys[node.node_key];
    var cls = 'cj-tree-card cj-tree-card--variant-color';
    if (levelLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';
    if (!node.unlocked) cls += ' is-locked-expand';

    var expandAttr = expandable
      ? ' data-cj-expand-color="' + escapeHtml(node.node_key) + '"'
      : '';

    return '<article class="' + cls + '" data-node="' + escapeHtml(node.node_key) + '"' + expandAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, { hasAction: act.hasAction }) +
      act.actionHtml + '</div></article>';
  }

  function renderVariantSizeCard(node) {
    var levelLocked = isLevelLocked(node);
    var act = cardActionState(node, levelLocked);
    var sizeLabel = (node.metadata && node.metadata.size) || nodeTitle(node);
    var cls = 'cj-tree-card cj-tree-card--variant-size';
    if (levelLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';

    return '<article class="' + cls + '" data-node="' + escapeHtml(node.node_key) + '">' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, { hasAction: act.hasAction, sizeLabel: sizeLabel }) +
      act.actionHtml + '</div></article>';
  }

  function renderCarouselShell(trackHtml) {
    return '<div class="cj-product-carousel" data-cj-carousel>' +
      '<button type="button" class="cj-product-carousel__nav cj-product-carousel__nav--prev" data-cj-carousel-prev aria-label="' +
      escapeHtml(t('creator.journey.carousel_prev', 'Previous')) + '">‹</button>' +
      '<div class="cj-product-carousel__track" data-cj-carousel-track>' + trackHtml + '</div>' +
      '<button type="button" class="cj-product-carousel__nav cj-product-carousel__nav--next" data-cj-carousel-next aria-label="' +
      escapeHtml(t('creator.journey.carousel_next', 'Next')) + '">›</button>' +
      '</div>';
  }

  function renderSoftstyleExpandPanel(productNode) {
    if (!productNode || !productNode.unlocked) return '';
    if (productNode.product_key !== SOFTSTYLE_PRODUCT_KEY) return '';
    if (!expandedProductKeys[productNode.product_key]) return '';

    var colors = variantColorNodes(productNode.product_key);
    if (!colors.length) {
      return '<div class="cj-variant-branch">' +
        '<div class="cj-variant-connector" aria-hidden="true"></div>' +
        '<div class="cj-variant-panel">' +
        '<p class="cj-muted">' + escapeHtml(t('creator.journey.variants_empty', 'No color variants available yet.')) + '</p></div></div>';
    }

    var colorCards = colors.map(renderVariantColorCard).join('');
    var sizeHtml = '';
    colors.forEach(function (colorNode) {
      if (!(colorNode.unlocked && expandedColorKeys[colorNode.node_key])) return;
      var sizes = variantSizeNodes(colorNode.node_key);
      if (!sizes.length) return;
      sizeHtml += '<div class="cj-variant-size-panel" data-cj-size-panel="' + escapeHtml(colorNode.node_key) + '">' +
        '<div class="cj-variant-connector cj-variant-connector--size" aria-hidden="true"></div>' +
        '<h5 class="cj-variant-size-panel__title">' + escapeHtml(t('creator.journey.size_variants', 'Sizes')) +
        ' · ' + escapeHtml(nodeTitle(colorNode)) + '</h5>' +
        renderCarouselShell(sizes.map(renderVariantSizeCard).join('')) +
        '</div>';
    });

    return '<div class="cj-variant-branch" data-cj-variant-branch="' + escapeHtml(productNode.product_key) + '">' +
      '<div class="cj-variant-connector" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-variant-panel="' + escapeHtml(productNode.product_key) + '">' +
      '<h4 class="cj-variant-panel__title">' + escapeHtml(t('creator.journey.color_variants', 'Color variants')) + '</h4>' +
      renderCarouselShell(colorCards) +
      sizeHtml +
      '</div></div>';
  }

  function renderCarouselSection(title, subtitle, nodes, sectionLocked) {
    if (!nodes.length) return '';
    var sub = subtitle ? '<p class="cj-product-section__sub">' + escapeHtml(subtitle) + '</p>' : '';
    var cardsHtml = '';
    var expandHtml = '';
    nodes.forEach(function (n) {
      var expandable = n.product_key === SOFTSTYLE_PRODUCT_KEY;
      cardsHtml += renderProductTreeCard(n, { sectionLocked: sectionLocked, expandable: expandable });
      if (expandable && n.unlocked && expandedProductKeys[n.product_key]) {
        expandHtml += renderSoftstyleExpandPanel(n);
      }
    });
    return '<section class="cj-product-section' + (sectionLocked ? ' is-locked' : '') + '">' +
      '<div class="cj-product-section__head">' +
      '<h3 class="cj-product-section__title">' + escapeHtml(title) + '</h3>' + sub +
      '</div>' +
      renderCarouselShell(cardsHtml) +
      expandHtml + '</section>';
  }

  function renderProductTree(nodes) {
    var split = splitProductNodes(nodes);
    var secs = productSections();
    var dispLv = displayLevel();
    var html = renderUnlockedStrip(nodes);
    html += '<div class="cj-product-sections">';
    html += renderCarouselSection(
      t('creator.journey.starter_products', 'Starter Products'),
      '',
      split.starter,
      false
    );
    html += renderCarouselSection(
      tpl('creator.journey.level_row', 'Level {{ n }}', { n: String(secs.preview) }),
      '',
      split.preview,
      dispLv < secs.preview
    );
    html += renderCarouselSection(
      tpl('creator.journey.level_row', 'Level {{ n }}', { n: String(secs.premium) }),
      t('creator.journey.product_premium_hint', 'Premium products available at this level'),
      split.offline,
      dispLv < secs.premium
    );
    html += '</div>';
    if (!split.starter.length && !split.preview.length && !split.offline.length) {
      html = '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    return html;
  }

  function renderMarketCard(node, opts) {
    opts = opts || {};
    var levelLocked = isLevelLocked(node);
    var act = cardActionState(node, levelLocked);
    var isContinent = isMarketContinentNode(node);
    var expandable = isContinent && !!node.unlocked;
    var contCode = isContinent ? marketContinentCode(node) : '';
    var expanded = expandable && !!expandedContinentKeys[contCode];
    var cls = 'cj-tree-card cj-tree-card--market';
    if (isContinent) cls += ' cj-tree-card--market-continent';
    else cls += ' cj-tree-card--market-country';
    if (levelLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';

    var expandAttr = expandable
      ? ' data-cj-expand-continent="' + escapeHtml(contCode) + '"'
      : '';

    return '<article class="' + cls + '" data-node="' + escapeHtml(node.node_key) + '"' + expandAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        flagMedia: !isContinent,
        continentMedia: isContinent
      }) +
      act.actionHtml + '</div></article>';
  }

  function marketContinentNodes(nodes) {
    var order = { AF: 10, AS: 20, EU: 30, NA: 40, SA: 50, OC: 60, AN: 70 };
    return (nodes || []).filter(isMarketContinentNode).sort(function (a, b) {
      var ca = marketContinentCode(a);
      var cb = marketContinentCode(b);
      return (order[ca] || 99) - (order[cb] || 99) ||
        nodeTitle(a).localeCompare(nodeTitle(b), undefined, { sensitivity: 'base' });
    });
  }

  function marketCountryNodesForContinent(nodes, continentNode) {
    var parentKey = continentNode.node_key;
    var cont = marketContinentCode(continentNode);
    return (nodes || []).filter(function (n) {
      if (!isMarketCountryNode(n)) return false;
      if (n.parent_key === parentKey) return true;
      return n.metadata && String(n.metadata.continent_code || '').toUpperCase() === cont;
    }).sort(function (a, b) {
      return nodeTitle(a).localeCompare(nodeTitle(b), undefined, { sensitivity: 'base' });
    });
  }

  function renderContinentExpandPanel(continentNode, allMarketNodes) {
    if (!continentNode || !continentNode.unlocked) return '';
    var cont = marketContinentCode(continentNode);
    if (!expandedContinentKeys[cont]) return '';

    var countries = marketCountryNodesForContinent(allMarketNodes, continentNode);
    if (!countries.length) {
      return '<div class="cj-variant-branch cj-market-branch">' +
        '<div class="cj-variant-connector" aria-hidden="true"></div>' +
        '<div class="cj-variant-panel">' +
        '<p class="cj-muted">' + escapeHtml(t('creator.journey.market_countries_empty', 'No countries listed for this continent yet.')) +
        '</p></div></div>';
    }

    return '<div class="cj-variant-branch cj-market-branch" data-cj-market-branch="' + escapeHtml(cont) + '">' +
      '<div class="cj-variant-connector" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-market-panel="' + escapeHtml(cont) + '">' +
      '<h4 class="cj-variant-panel__title">' +
      escapeHtml(t('creator.journey.market_countries_title', 'Countries')) +
      ' · ' + escapeHtml(nodeTitle(continentNode)) + '</h4>' +
      renderCarouselShell(countries.map(function (n) { return renderMarketCard(n); }).join('')) +
      '</div></div>';
  }

  function renderMarketTree(nodes) {
    var continents = marketContinentNodes(nodes);
    var unlockedCountries = (nodes || []).filter(function (n) {
      return isMarketCountryNode(n) && n.unlocked;
    });
    var html = renderUnlockedStrip(unlockedCountries.length ? unlockedCountries : continents.filter(function (n) {
      return n.unlocked;
    }));

    if (!continents.length) {
      // Fallback: flat list if catalog not yet migrated
      var flat = (nodes || []).filter(isMarketCountryNode);
      if (!flat.length) {
        return html + '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
      }
      html += '<p class="cj-market-hint">' +
        escapeHtml(t('creator.journey.market_hint', 'Unlock a continent first, then expand it to unlock individual countries. Same EAZV cost for every continent and every country.')) +
        '</p>';
      html += renderCarouselShell(flat.map(function (n) { return renderMarketCard(n); }).join(''));
      return html;
    }

    html += '<p class="cj-market-hint">' +
      escapeHtml(t('creator.journey.market_hint', 'Unlock a continent first, then expand it to unlock individual countries. Same EAZV cost for every continent and every country.')) +
      '</p>';
    html += '<h3 class="cj-product-section__title">' +
      escapeHtml(t('creator.journey.market_continents_title', 'Continents')) + '</h3>';

    var cardsHtml = '';
    var expandHtml = '';
    continents.forEach(function (n) {
      cardsHtml += renderMarketCard(n);
      if (n.unlocked && expandedContinentKeys[marketContinentCode(n)]) {
        expandHtml += renderContinentExpandPanel(n, nodes);
      }
    });
    html += renderCarouselShell(cardsHtml);
    html += expandHtml;
    return html;
  }

  function renderTreeCard(node) {
    if (node.category === 'market') return renderMarketCard(node);
    var levelLocked = isLevelLocked(node);
    var act = cardActionState(node, levelLocked);

    var cls = 'cj-tree-card';
    if (levelLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';

    return '<article class="' + cls + '" data-node="' + escapeHtml(node.node_key) + '">' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, { hasAction: act.hasAction }) +
      act.actionHtml + '</div></article>';
  }

  function eazEconomyI18n(key, fallback) {
    var map = window.CreatorI18n || {};
    var short = {
      activate: map.eazEconomyActivate,
      active: map.eazEconomyActive,
      locked: map.eazEconomyLocked,
      kickstarter_locked: map.eazEconomyKickstarterLocked,
      activate_fail: map.eazEconomyActivateFail,
      kickstarter_success: map.eazEconomyKickstarterSuccess
    };
    return short[key] || t('creator.eaz_economy.' + key, fallback);
  }

  async function loadEazEconomyTree() {
    var oid = ownerId();
    if (!oid) {
      eazEconomyData = null;
      return null;
    }
    if (eazEconomyLoadPromise) return eazEconomyLoadPromise;
    eazEconomyLoadPromise = (async function () {
      try {
        var data = await apiFetch('get-eaz-economy-tree', { owner_id: oid });
        eazEconomyData = data && data.ok ? data : null;
        return eazEconomyData;
      } catch (e) {
        eazEconomyData = null;
        console.warn('[CreatorJourney] eaz economy', e);
        return null;
      } finally {
        eazEconomyLoadPromise = null;
      }
    })();
    return eazEconomyLoadPromise;
  }

  function eazSkillLabel(skillKey, isAxisGate) {
    if (!skillKey) return '';
    if (isAxisGate || String(skillKey).indexOf('axis_') === 0) {
      var tab = String(skillKey).replace('axis_', '');
      return EAZ_AXIS_LABELS[tab] || tab;
    }
    if (skillKey.indexOf('kickstarter_') === 0) {
      var ksPart = skillKey.replace('kickstarter_', '');
      return 'Kickstarter ' + (EAZ_AXIS_LABELS[ksPart] || ksPart);
    }
    var m = String(skillKey).match(/^(cost|daily|cap)_(\d+)$/);
    if (m) return (EAZ_AXIS_LABELS[m[1]] || m[1]) + ' ' + m[2];
    return String(skillKey).replace(/_/g, ' ');
  }

  function eazBonusLabel(axis, bonusPct) {
    var bonus = Math.round((Number(bonusPct) || 0) * 100);
    if (!bonus) return '';
    if (axis === 'cost') return '-' + bonus + '%';
    return '+' + bonus + '%';
  }

  function eazSkillMeta(node) {
    var parts = [];
    if (node.is_axis_gate) {
      if (node.activation_cost_eaz > 0) parts.push(node.activation_cost_eaz + ' EAZV');
      if (node.mascot_min_level) parts.push(tpl('creator.journey.level_short', 'Lv. {{ n }}', { n: String(node.mascot_min_level) }));
      return parts.join(' · ');
    }
    var bonus = eazBonusLabel(node.axis, node.bonus_pct);
    if (bonus) parts.push(bonus);
    if (node.mascot_min_level) parts.push(tpl('creator.journey.level_short', 'Lv. {{ n }}', { n: String(node.mascot_min_level) }));
    if (node.activation_cost_eaz > 0) parts.push(node.activation_cost_eaz + ' EAZV');
    return parts.join(' · ');
  }

  function groupEazNodesByLevel(nodes) {
    var map = {};
    (nodes || []).forEach(function (n) {
      if (n.is_axis_gate) return;
      var lv = Number(n.mascot_min_level) || 1;
      if (!map[lv]) map[lv] = [];
      map[lv].push(n);
    });
    return Object.keys(map)
      .map(Number)
      .sort(function (a, b) { return a - b; })
      .map(function (lv) {
        return { level: lv, nodes: map[lv] };
      });
  }

  function renderEazEconomySkillCard(node) {
    var status = node.status || 'locked';
    var title = eazSkillLabel(node.skill_key, node.is_axis_gate);
    var meta = eazSkillMeta(node);
    var isActive = status === 'active' || status === 'grandfathered';
    var canActivate = status === 'unlocked';
    var isLocked = status === 'locked' || status === 'axis_locked' || status === 'kickstarter_locked';

    var cls = 'cj-tree-card cj-tree-card--eaz-economy';
    if (isLocked) cls += ' is-level-locked';
    if (isActive) cls += ' is-unlocked';
    if (canActivate) cls += ' is-ready has-action';

    var badge = meta;
    if (isActive) badge = eazEconomyI18n('active', 'Active');
    else if (status === 'kickstarter_locked') {
      badge = meta
        ? meta + ' · ' + eazEconomyI18n('kickstarter_locked', 'Kickstarter')
        : eazEconomyI18n('kickstarter_locked', 'Kickstarter');
    }
    else if (status === 'axis_locked') badge = eazEconomyI18n('axis_locked', 'Unlock category first');
    else if (status === 'locked') badge = eazEconomyI18n('locked', 'Locked');

    var actionHtml = '';
    if (canActivate) {
      actionHtml = '<button type="button" class="cj-tree-card__action cj-btn is-unlock-ready" data-cj-eaz-skill="' +
        escapeHtml(node.skill_key) + '">' + escapeHtml(eazEconomyI18n('activate', 'Activate')) + '</button>';
    }

    var statusHtml = isActive ? '<span class="cj-tree-card__status" aria-hidden="true">✓</span>' : '';
    return '<article class="' + cls + '" data-eaz-skill="' + escapeHtml(node.skill_key) + '">' +
      '<div class="cj-tree-card__stack">' +
      '<div class="cj-tree-card__frame' + (canActivate ? ' cj-tree-card__frame--attached' : '') + '">' +
      '<h4 class="cj-tree-card__title-in">' + escapeHtml(title) + '</h4>' +
      '<div class="cj-tree-card__media"><div class="cj-tree-card__img cj-tree-card__img--placeholder cj-tree-card__img--eaz" aria-hidden="true"></div></div>' +
      '<span class="cj-tree-card__eaz-badge">' + escapeHtml(badge) + '</span>' +
      statusHtml + '</div>' + actionHtml + '</div></article>';
  }

  function renderEazEconomyAxisGate(axisNode) {
    if (!axisNode) return '';
    return '<div class="cj-eaz-economy__axis-gate">' + renderEazEconomySkillCard(axisNode) + '</div>';
  }

  function renderEazEconomyKickstarterSection(data) {
    var redeemed = !!data.kickstarter_redeemed;
    var html = '<section class="cj-eaz-economy__kickstarter">';
    if (redeemed) {
      html += '<p class="cj-eaz-economy__kickstarter-hint cj-eaz-economy__kickstarter-hint--ok">' +
        escapeHtml(t('creator.eaz_economy.kickstarter_redeemed', 'Kickstarter bonus unlocked.')) + '</p>';
    } else {
      html += '<p class="cj-eaz-economy__kickstarter-hint">' +
        escapeHtml(t('creator.eaz_economy.kickstarter_hint', 'Redeem a Kickstarter code to unlock bonus nodes.')) + '</p>' +
        '<form class="cj-eaz-economy__kickstarter-form" id="cjEazKickstarterForm">' +
        '<input type="text" id="cjEazKickstarterCode" placeholder="' +
        escapeHtml(t('creator.eaz_economy.kickstarter_code_placeholder', 'KS-…')) +
        '" autocomplete="off">' +
        '<button type="submit" class="cj-eaz-economy__btn">' +
        escapeHtml(t('creator.eaz_economy.kickstarter_redeem', 'Redeem')) + '</button></form>';
    }
    if (data.kickstarter_campaign_url) {
      html += '<a class="cj-eaz-economy__campaign-link" href="' + escapeHtml(data.kickstarter_campaign_url) +
        '" target="_blank" rel="noopener">' +
        escapeHtml(t('creator.eaz_economy.kickstarter_campaign', 'View Kickstarter campaign')) + '</a>';
    }
    html += '</section>';
    return html;
  }

  function renderEazEconomySkillGrid(nodes) {
    if (!nodes || !nodes.length) {
      return '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    return '<div class="cj-eaz-economy__skill-grid">' + nodes.map(renderEazEconomySkillCard).join('') + '</div>';
  }

  function renderEazEconomySubSkillList(nodes) {
    if (!nodes || !nodes.length) {
      return '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    return '<ul class="cj-eaz-economy__subskill-list">' + nodes.map(function (node) {
      var status = node.status || 'locked';
      var title = eazSkillLabel(node.skill_key, false);
      var bonus = eazBonusLabel(node.axis, node.bonus_pct);
      var lv = Number(node.mascot_min_level) || 1;
      var isActive = status === 'active' || status === 'grandfathered';
      var canActivate = status === 'unlocked';
      var isLocked = status === 'locked' || status === 'axis_locked' || status === 'kickstarter_locked';
      var cls = 'cj-eaz-economy__subskill';
      if (isLocked) cls += ' is-locked';
      if (isActive) cls += ' is-active';
      if (canActivate) cls += ' is-ready';
      var metaParts = [];
      metaParts.push(tpl('creator.journey.level_short', 'Lv. {{ n }}', { n: String(lv) }));
      if (bonus) metaParts.push(bonus);
      if (node.activation_cost_eaz > 0 && !isActive) metaParts.push(node.activation_cost_eaz + ' EAZV');
      var actionHtml = '';
      if (canActivate) {
        actionHtml = '<button type="button" class="cj-eaz-economy__subskill-action cj-btn is-unlock-ready" data-cj-eaz-skill="' +
          escapeHtml(node.skill_key) + '">' + escapeHtml(eazEconomyI18n('activate', 'Activate')) + '</button>';
      } else if (isActive) {
        actionHtml = '<span class="cj-eaz-economy__subskill-status" aria-hidden="true">✓</span>';
      } else if (status === 'kickstarter_locked') {
        actionHtml = '<span class="cj-eaz-economy__subskill-lock">' +
          escapeHtml(eazEconomyI18n('kickstarter_locked', 'Kickstarter')) + '</span>';
      }
      return '<li class="' + cls + '" data-eaz-skill="' + escapeHtml(node.skill_key) + '">' +
        '<div class="cj-eaz-economy__subskill-main">' +
        '<span class="cj-eaz-economy__subskill-title">' + escapeHtml(title) + '</span>' +
        '<span class="cj-eaz-economy__subskill-meta">' + escapeHtml(metaParts.join(' · ')) + '</span>' +
        '</div>' + actionHtml + '</li>';
    }).join('') + '</ul>';
  }

  function renderEazEconomyCategoryCard(axis, axisNode, data) {
    var label = t('creator.eaz_economy.tab_' + axis, EAZ_AXIS_LABELS[axis] || axis);
    var expanded = eazEconomyExpandedAxis === axis;
    var isKs = axis === 'kickstarter';
    var redeemed = !!data.kickstarter_redeemed;
    var status = axisNode ? (axisNode.status || 'locked') : (isKs && !redeemed ? 'kickstarter_locked' : 'locked');
    if (isKs) status = redeemed ? 'active' : 'kickstarter_locked';
    var isActive = status === 'active' || status === 'grandfathered';
    var canActivate = !isKs && status === 'unlocked';
    var isLocked = status === 'locked' || status === 'axis_locked' || status === 'kickstarter_locked';

    var cls = 'cj-eaz-economy__cat-card';
    if (expanded) cls += ' is-expanded';
    if (isLocked) cls += ' is-locked';
    if (isActive) cls += ' is-active';
    if (canActivate) cls += ' is-ready';

    var badge = '';
    if (isKs) {
      badge = redeemed
        ? eazEconomyI18n('active', 'Active')
        : eazEconomyI18n('kickstarter_locked', 'Kickstarter');
    } else if (axisNode) {
      badge = eazSkillMeta(axisNode) || eazEconomyI18n('locked', 'Locked');
      if (isActive) badge = eazEconomyI18n('active', 'Active');
      else if (status === 'locked') badge = eazEconomyI18n('locked', 'Locked');
    }

    var actionHtml = '';
    if (canActivate && axisNode) {
      actionHtml = '<button type="button" class="cj-eaz-economy__cat-action cj-btn is-unlock-ready" data-cj-eaz-skill="' +
        escapeHtml(axisNode.skill_key) + '">' + escapeHtml(eazEconomyI18n('activate', 'Activate')) + '</button>';
    }

    return '<article class="' + cls + '" data-cj-expand-eaz-axis="' + escapeHtml(axis) + '" role="button" tabindex="0" aria-expanded="' +
      (expanded ? 'true' : 'false') + '">' +
      '<div class="cj-eaz-economy__cat-card-inner">' +
      '<h4 class="cj-eaz-economy__cat-title">' + escapeHtml(label) + '</h4>' +
      '<div class="cj-eaz-economy__cat-media" aria-hidden="true"></div>' +
      (badge ? '<span class="cj-eaz-economy__cat-badge">' + escapeHtml(badge) + '</span>' : '') +
      (isActive ? '<span class="cj-eaz-economy__cat-check" aria-hidden="true">✓</span>' : '') +
      '</div>' + actionHtml + '</article>';
  }

  function renderEazEconomyExpandedPanel(data, axis, axisNode, tabNodes) {
    var html = '<div class="cj-eaz-economy__expand-panel" data-expanded-axis="' + escapeHtml(axis) + '">';
    if (axis === 'kickstarter') {
      html += renderEazEconomyKickstarterSection(data);
      html += '<p class="cj-eaz-economy__expand-label">' +
        escapeHtml(t('creator.eaz_economy.kickstarter_bonuses', 'Kickstarter bonus skills')) + '</p>';
      html += renderEazEconomySkillGrid(tabNodes);
      html += '</div>';
      return html;
    }

    var axisOpen = axisNode && (axisNode.status === 'active' || axisNode.status === 'grandfathered');
    if (!axisOpen) {
      if (axisNode) {
        html += '<div class="cj-eaz-economy__axis-gate">' + renderEazEconomySkillCard(axisNode) + '</div>';
      }
      html += '<p class="cj-eaz-economy__axis-hint">' +
        escapeHtml(t('creator.eaz_economy.axis_unlock_hint', 'Unlock this category with EAZV to access its skills.')) +
        '</p></div>';
      return html;
    }

    html += '<p class="cj-eaz-economy__expand-label">' +
      escapeHtml(t('creator.eaz_economy.subskills_label', 'Skills in this category')) + '</p>';
    html += renderEazEconomySubSkillList(tabNodes);
    html += '</div>';
    return html;
  }

  function renderEazEconomyTreeHtml(data) {
    if (!data || !Array.isArray(data.nodes)) {
      return '<p class="cj-muted">' + escapeHtml(t('creator.eaz_economy.loading', 'Could not load skill tree.')) + '</p>';
    }

    var byTab = {};
    var axisByTab = {};
    EAZ_CATEGORY_ORDER.forEach(function (ax) {
      byTab[ax] = [];
      axisByTab[ax] = null;
    });
    data.nodes.forEach(function (n) {
      var nTab = n.tab || n.axis || 'cost';
      if (!byTab[nTab]) byTab[nTab] = [];
      if (n.is_axis_gate) axisByTab[nTab] = n;
      else byTab[nTab].push(n);
    });

    var expanded = eazEconomyExpandedAxis;
    if (expanded && EAZ_CATEGORY_ORDER.indexOf(expanded) < 0) expanded = '';

    var html = '<div class="cj-eaz-economy">';
    html += '<div class="cj-eaz-economy__cat-row" role="group" aria-label="' +
      escapeHtml(t('creator.eaz_economy.axis_tabs_aria', 'EAZV economy categories')) + '">';
    EAZ_CATEGORY_ORDER.forEach(function (ax) {
      html += renderEazEconomyCategoryCard(ax, axisByTab[ax], data);
    });
    html += '</div>';

    if (expanded) {
      html += '<div class="cj-eaz-economy__connector" aria-hidden="true"></div>';
      html += renderEazEconomyExpandedPanel(data, expanded, axisByTab[expanded], byTab[expanded] || []);
    }

    html += '</div>';
    return html;
  }

  function wireEazEconomyTree(list) {
    if (!list) return;
    list.querySelectorAll('[data-cj-eaz-skill]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-cj-eaz-skill');
        var oid = ownerId();
        if (!oid || !key) return;
        btn.disabled = true;
        apiFetch('activate-eaz-economy-skill', { owner_id: oid }, 'POST', { skill_key: key }).then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || 'failed');
          eazEconomyData = null;
          return loadEazEconomyTree().then(function () { renderTree(); });
        }).catch(function () {
          btn.disabled = false;
          alert(eazEconomyI18n('activate_fail', 'Activation failed'));
        });
      });
    });
    list.querySelectorAll('[data-cj-expand-eaz-axis]').forEach(function (card) {
      function toggle() {
        var ax = card.getAttribute('data-cj-expand-eaz-axis') || '';
        eazEconomyExpandedAxis = eazEconomyExpandedAxis === ax ? '' : ax;
        renderTree();
      }
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-cj-eaz-skill]')) return;
        toggle();
      });
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('[data-cj-eaz-skill]')) return;
        e.preventDefault();
        toggle();
      });
    });
    var ksForm = list.querySelector('#cjEazKickstarterForm');
    if (ksForm && !ksForm.dataset.wired) {
      ksForm.dataset.wired = '1';
      ksForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var codeEl = list.querySelector('#cjEazKickstarterCode');
        var code = codeEl ? codeEl.value : '';
        var oid = ownerId();
        if (!oid || !code) return;
        apiFetch('redeem-kickstarter-eaz-bonus', { owner_id: oid }, 'POST', { code: code }).then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || 'invalid');
          if (codeEl) codeEl.value = '';
          alert(eazEconomyI18n('kickstarter_success', 'Kickstarter bonus unlocked'));
          eazEconomyData = null;
          eazEconomyExpandedAxis = 'kickstarter';
          return loadEazEconomyTree().then(function () { renderTree(); });
        }).catch(function () {
          alert(eazEconomyI18n('activate_fail', 'Redeem failed'));
        });
      });
    }
  }

  function renderTree() {
    var list = document.getElementById('cjTreeList');
    var filters = document.getElementById('cjTreeFilters');
    var treeLoad = document.getElementById('cjTreeLoading');
    if (!list || !journeyData) return;
    if (treeLoad) treeLoad.hidden = true;

    var nodes = journeyData.nodes || [];
    var availCats = TREE_TAB_ORDER.filter(function (c) {
      if (c === 'eaz_economy') return true;
      return nodes.some(function (n) { return n.category === c; });
    });
    if (!availCats.length) availCats = ['eaz_economy'];
    if (availCats.indexOf(treeFilter) < 0) treeFilter = availCats[0];

    if (filters) {
      filters.innerHTML = availCats.map(function (c) {
        var icon = CATEGORY_ICON_SVG[c] || CATEGORY_ICON_SVG.product;
        var pinDef = PINNABLE_UNLOCK_STATS.find(function (p) { return p.treeTab === c; });
        var pinHtml = '';
        if (pinDef) {
          var pinned = isUnlockStatPinned(pinDef.id);
          pinHtml = '<span class="cj-cat-tab__pin-wrap">' +
            '<button type="button" class="cj-cat-tab__pin' + (pinned ? ' is-pinned' : '') +
            '" data-cj-pin-stat="' + escapeHtml(pinDef.id) + '" aria-pressed="' + (pinned ? 'true' : 'false') +
            '" aria-label="' + escapeHtml(t('creator.journey.overview_pin_stat', 'Show in Overview')) +
            '" title="' + escapeHtml(t('creator.journey.overview_pin_stat', 'Show in Overview')) + '">' +
            (pinned
              ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
              : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>') +
            '</button></span>';
        }
        return '<div role="tab" tabindex="0" class="cj-cat-tab' + (c === treeFilter ? ' is-active' : '') + '" data-cj-filter="' + c + '" aria-selected="' + (c === treeFilter ? 'true' : 'false') + '">' +
          pinHtml +
          '<span class="cj-cat-tab__body">' +
          '<span class="cj-cat-tab__icon">' + icon + '</span>' +
          '<span class="cj-cat-tab__text">' + escapeHtml(categoryLabel(c)) + '</span>' +
          '</span></div>';
      }).join('');
      if (!filters.dataset.wired) {
        filters.dataset.wired = '1';
        filters.addEventListener('click', function (e) {
          var pinBtn = e.target.closest('[data-cj-pin-stat]');
          if (pinBtn) {
            e.preventDefault();
            e.stopPropagation();
            toggleUnlockStatPinned(pinBtn.getAttribute('data-cj-pin-stat'));
            return;
          }
          var btn = e.target.closest('[data-cj-filter]');
          if (!btn) return;
          treeFilter = btn.getAttribute('data-cj-filter') || 'eaz_economy';
          renderTree();
        });
        filters.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          var pinBtn = e.target.closest('[data-cj-pin-stat]');
          if (pinBtn) return;
          var tab = e.target.closest('[data-cj-filter]');
          if (!tab) return;
          e.preventDefault();
          treeFilter = tab.getAttribute('data-cj-filter') || 'eaz_economy';
          renderTree();
        });
      }
      requestAnimationFrame(function () {
        var activeTab = filters.querySelector('.cj-cat-tab.is-active');
        if (activeTab && typeof activeTab.scrollIntoView === 'function') {
          activeTab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        }
      });
    }

    if (treeFilter === 'eaz_economy') {
      if (!eazEconomyData) {
        list.innerHTML = '<p class="cj-muted">' + escapeHtml(t('creator.eaz_economy.loading', 'Loading skill tree…')) + '</p>';
        loadEazEconomyTree().then(function () { renderTree(); });
        return;
      }
      list.innerHTML = renderEazEconomyTreeHtml(eazEconomyData);
      wireEazEconomyTree(list);
      return;
    }

    var filtered = nodes.filter(function (n) { return n.category === treeFilter; });
    var dispLv = displayLevel();
    var html = '';

    if (treeFilter === 'product') {
      html = renderProductTree(filtered);
    } else if (treeFilter === 'market') {
      html = renderMarketTree(filtered);
    } else {
      html = renderUnlockedStrip(filtered);
      var rows = groupNodesByLevel(filtered);
      if (!rows.length) {
        html += '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
      } else {
        html += '<div class="cj-tree-levels">' + rows.map(function (row) {
          var rowLocked = row.level > dispLv;
          return '<section class="cj-level-row' + (rowLocked ? ' is-locked' : '') + '" data-level="' + row.level + '">' +
            '<div class="cj-level-row__label">' + escapeHtml(tpl('creator.journey.level_row', 'Level {{ n }}', { n: String(row.level) })) + '</div>' +
            '<div class="cj-level-row__cards">' + row.nodes.map(renderTreeCard).join('') + '</div></section>';
        }).join('') + '</div>';
      }
    }

    list.innerHTML = html;

    if (treeFilter === 'product') {
      wireProductCarousel(list);
      wireProductExpand(list);
    }

    list.querySelectorAll('[data-cj-tree-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (btn.disabled) return;
        if (btn.getAttribute('data-cj-action') === 'unlock') {
          unlockNode(btn.getAttribute('data-cj-unlock'));
          return;
        }
        openCommitModal(btn.getAttribute('data-cj-commit'), btn.getAttribute('data-cj-commit-title'));
      });
    });
  }

  function wireProductCarousel(root) {
    if (!root) return;
    root.querySelectorAll('[data-cj-carousel]').forEach(function (carousel) {
      var track = carousel.querySelector('[data-cj-carousel-track]');
      var prev = carousel.querySelector('[data-cj-carousel-prev]');
      var next = carousel.querySelector('[data-cj-carousel-next]');
      if (!track) return;
      function scrollBy(dir) {
        var amount = Math.max(160, Math.floor(track.clientWidth * 0.7));
        track.scrollBy({ left: dir * amount, behavior: 'smooth' });
      }
      if (prev) prev.addEventListener('click', function () { scrollBy(-1); });
      if (next) next.addEventListener('click', function () { scrollBy(1); });
    });
  }

  function wireProductExpand(root) {
    if (!root) return;
    root.querySelectorAll('[data-cj-expand-product]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        var pk = card.getAttribute('data-cj-expand-product');
        if (!pk) return;
        expandedProductKeys[pk] = !expandedProductKeys[pk];
        if (!expandedProductKeys[pk]) {
          Object.keys(expandedColorKeys).forEach(function (k) {
            if (k.indexOf('variant_color:' + pk + ':') === 0) delete expandedColorKeys[k];
          });
        }
        renderTree();
      });
    });
    root.querySelectorAll('[data-cj-expand-color]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        var key = card.getAttribute('data-cj-expand-color');
        if (!key) return;
        expandedColorKeys[key] = !expandedColorKeys[key];
        renderTree();
      });
    });
    root.querySelectorAll('[data-cj-expand-continent]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        var code = card.getAttribute('data-cj-expand-continent');
        if (!code) return;
        expandedContinentKeys[code] = !expandedContinentKeys[code];
        renderTree();
      });
    });
  }

  function renderFloatLevel() {
    var wrap = document.getElementById('cjFloatLevel');
    var numEl = document.getElementById('cjFloatLevelNum');
    var xpEl = document.getElementById('cjFloatLevelXp');
    var nextEl = document.getElementById('cjFloatLevelNext');
    var fillEl = document.getElementById('cjFloatLevelFill');
    if (!wrap) return;

    if (!levelData || !levelData.ok) {
      var fallbackLv = journeyData ? Number(journeyData.display_level) || 1 : 1;
      if (numEl) numEl.textContent = String(fallbackLv);
      if (xpEl && xpEl.classList.contains('is-loading')) {
        wrap.hidden = false;
        return;
      }
      wrap.hidden = true;
      return;
    }

    var lv = Number(levelData.current_level) || Number(journeyData && journeyData.display_level) || 1;
    var totalXp = Number(levelData.total_xp) || 0;
    var thresholds = Array.isArray(levelData.level_thresholds) ? levelData.level_thresholds : [];
    var curReq = 0;
    var nextReq = null;
    thresholds.forEach(function (row) {
      if (Number(row.level) === lv) curReq = Number(row.xp_required) || 0;
      if (Number(row.level) === lv + 1) nextReq = Number(row.xp_required);
    });
    if (nextReq == null) {
      var maxT = thresholds[thresholds.length - 1];
      nextReq = maxT ? Number(maxT.xp_required) : totalXp + 1;
    }

    var span = Math.max(1, nextReq - curReq);
    var progress = Math.min(1, Math.max(0, (totalXp - curReq) / span));
    var circumference = 327;

    if (numEl) numEl.textContent = String(lv);
    if (xpEl) {
      xpEl.textContent = tpl('creator.journey.float_xp', '{{ current }} / {{ next }} XP', {
        current: String(totalXp),
        next: String(nextReq)
      });
    }
    if (nextEl) {
      var rem = Math.max(0, nextReq - totalXp);
      if (rem > 0 && lv < 10) {
        nextEl.hidden = false;
        nextEl.textContent = tpl('creator.journey.float_next', 'Next level {{ n }} · {{ xp }} XP', {
          n: String(lv + 1),
          xp: String(rem)
        });
      } else {
        nextEl.hidden = true;
      }
    }
    if (fillEl) {
      fillEl.style.strokeDashoffset = String(circumference * (1 - progress));
    }
    wrap.hidden = false;
  }

  function renderSidebarBalance() {
    var wrap = document.getElementById('cjSidebarBalance');
    var val = document.getElementById('cjSidebarBalanceValue');
    if (!wrap || !val) return;
    var coin = wrap.querySelector('.cj-sidebar__balance-coin');
    if (coin) {
      coin.setAttribute('data-eaz-coin', 'eazv');
      coin.src = eazvCoinUrl();
      if (window.EazCoinBrand && window.EazCoinBrand.hydrate) window.EazCoinBrand.hydrate(wrap);
    }
    if (!journeyData || !journeyData.is_creator || journeyData.balance_eaz == null) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    val.textContent = String(Math.round(Number(journeyData.balance_eaz) * 10) / 10) + ' EAZV';
  }

  function clearContentBg() {
    if (!contentBg) return;
    var vid = contentBg.querySelector('video');
    if (vid) {
      try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (_e) {}
    }
    contentBg.innerHTML = '';
    contentBg.style.backgroundImage = '';
  }

  function applyContentBg(item) {
    if (!contentBg) return;
    clearContentBg();
    if (!item || !item.url) return;
    var key = (item.url || '') + '|' + (item.media_type || '');
    bgAppliedKey = key;
    if (item.media_type === 'video') {
      var vid = document.createElement('video');
      vid.className = 'cj-content-bg__video';
      vid.src = item.url;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.autoplay = true;
      if (item.poster_url) vid.poster = item.poster_url;
      contentBg.appendChild(vid);
      vid.play().catch(function () {});
    } else {
      contentBg.style.backgroundImage =
        'linear-gradient(180deg, rgba(6, 8, 14, 0.35), rgba(4, 6, 10, 0.55)), url("' + String(item.url).replace(/"/g, '\\"') + '")';
      contentBg.style.backgroundSize = 'cover';
      contentBg.style.backgroundPosition = 'center';
    }
  }

  async function loadJourneyBackground() {
    try {
      var data = await apiFetch('get-creator-journey-background', {});
      if (!data || !data.ok) return;
      var mobile = window.matchMedia('(max-width: 991px)').matches;
      var item = mobile ? data.mobile : data.desktop;
      if (!item && data.desktop) item = data.desktop;
      applyContentBg(item);
    } catch (e) {
      console.warn('[CreatorJourney] background', e);
    }
  }

  function openCommitModal(nodeKey, nodeTitleText) {
    var commitOverlay = document.getElementById('cjCommitOverlay');
    var amountInput = document.getElementById('cjCommitAmount');
    var availEl = document.getElementById('cjCommitAvail');
    var nodeEl = document.getElementById('cjCommitNodeLabel');
    if (!commitOverlay || !amountInput) return;

    pendingCommitNodeKey = nodeKey;
    var avail = journeyData && journeyData.balance_eaz != null ? Number(journeyData.balance_eaz) : 0;

    if (nodeEl) {
      nodeEl.textContent = nodeTitleText || nodeKey || '';
      nodeEl.hidden = !nodeEl.textContent;
    }
    if (availEl) {
      availEl.textContent = tpl('creator.journey.commit_modal_available', 'Available: {{ amount }} EAZV', {
        amount: String(Math.round(avail * 100) / 100)
      });
    }
    amountInput.value = avail > 0 ? String(Math.round(avail * 100) / 100) : '';
    amountInput.max = avail > 0 ? String(avail) : '';

    commitOverlay.hidden = false;
    commitOverlay.classList.add('is-open');
    commitOverlay.setAttribute('aria-hidden', 'false');
    amountInput.focus();
    amountInput.select();
  }

  function closeCommitModal() {
    var commitOverlay = document.getElementById('cjCommitOverlay');
    if (!commitOverlay) return;
    pendingCommitNodeKey = null;
    commitOverlay.classList.remove('is-open');
    commitOverlay.setAttribute('aria-hidden', 'true');
    commitOverlay.hidden = true;
  }

  function confirmCommitModal() {
    var amountInput = document.getElementById('cjCommitAmount');
    if (!pendingCommitNodeKey || !amountInput) return;
    var amt = Number(amountInput.value);
    if (!Number.isFinite(amt) || amt <= 0) return;
    var key = pendingCommitNodeKey;
    closeCommitModal();
    commitNode(key, amt).catch(console.warn);
  }

  function defaultOverviewPrefs() {
    var sections = {};
    OVERVIEW_SECTION_DEFS.forEach(function (def) {
      sections[def.id] = {
        visible: def.defaultVisible !== false,
        collapsed: def.defaultCollapsed === true
      };
    });
    return {
      sections: sections,
      pinnedUnlockStats: DEFAULT_PINNED_STATS.slice()
    };
  }

  function normalizeOverviewPrefs(raw) {
    var base = defaultOverviewPrefs();
    if (!raw || typeof raw !== 'object') return base;
    if (raw.sections && typeof raw.sections === 'object') {
      OVERVIEW_SECTION_DEFS.forEach(function (def) {
        var s = raw.sections[def.id];
        if (s && typeof s === 'object') {
          base.sections[def.id] = {
            visible: s.visible !== false,
            collapsed: !!s.collapsed
          };
        }
      });
    }
    if (Array.isArray(raw.pinnedUnlockStats)) {
      base.pinnedUnlockStats = raw.pinnedUnlockStats.filter(function (id) {
        return PINNABLE_UNLOCK_STATS.some(function (p) { return p.id === id; });
      });
    }
    if (!base.pinnedUnlockStats.length) base.pinnedUnlockStats = DEFAULT_PINNED_STATS.slice();
    return base;
  }

  function readLocalOverviewPrefs() {
    try {
      var raw = localStorage.getItem(OVERVIEW_LOCAL_STORAGE_KEY);
      if (!raw) return null;
      return normalizeOverviewPrefs(JSON.parse(raw));
    } catch (_e) {
      return null;
    }
  }

  function writeLocalOverviewPrefs(prefs) {
    try {
      localStorage.setItem(OVERVIEW_LOCAL_STORAGE_KEY, JSON.stringify(prefs));
    } catch (_e) {}
  }

  async function loadOverviewPrefs() {
    if (overviewPrefs) return overviewPrefs;
    var local = readLocalOverviewPrefs();
    overviewPrefs = local || defaultOverviewPrefs();
    var oid = ownerId();
    if (!oid) return overviewPrefs;
    try {
      var res = await apiFetch('get-customer-setting', { owner_id: oid, key: OVERVIEW_CUSTOMER_SETTING_KEY });
      if (res && res.ok && res.value) {
        overviewPrefs = normalizeOverviewPrefs(JSON.parse(res.value));
        writeLocalOverviewPrefs(overviewPrefs);
      }
    } catch (_e) {}
    return overviewPrefs;
  }

  function saveOverviewPrefsDebounced() {
    if (!overviewPrefs) return;
    writeLocalOverviewPrefs(overviewPrefs);
    var oid = ownerId();
    if (!oid) return;
    clearTimeout(saveOverviewPrefsDebounced._t);
    saveOverviewPrefsDebounced._t = setTimeout(function () {
      apiFetch('set-customer-setting', { owner_id: oid }, 'POST', {
        key: OVERVIEW_CUSTOMER_SETTING_KEY,
        value: JSON.stringify(overviewPrefs)
      }).catch(function () {});
    }, 400);
  }

  function overviewSectionState(id) {
    if (!overviewPrefs) overviewPrefs = defaultOverviewPrefs();
    return overviewPrefs.sections[id] || { visible: true, collapsed: false };
  }

  function isUnlockStatPinned(statId) {
    if (!overviewPrefs) return DEFAULT_PINNED_STATS.indexOf(statId) >= 0;
    return (overviewPrefs.pinnedUnlockStats || []).indexOf(statId) >= 0;
  }

  function toggleUnlockStatPinned(statId) {
    if (!overviewPrefs) overviewPrefs = defaultOverviewPrefs();
    var list = overviewPrefs.pinnedUnlockStats || [];
    var idx = list.indexOf(statId);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(statId);
    overviewPrefs.pinnedUnlockStats = list;
    saveOverviewPrefsDebounced();
    renderOverview();
    renderTree();
  }

  function toggleOverviewSectionVisible(sectionId) {
    if (!overviewPrefs) overviewPrefs = defaultOverviewPrefs();
    var st = overviewSectionState(sectionId);
    st.visible = !st.visible;
    overviewPrefs.sections[sectionId] = st;
    saveOverviewPrefsDebounced();
    renderOverview();
  }

  function toggleOverviewSectionCollapsed(sectionId) {
    if (!overviewPrefs) overviewPrefs = defaultOverviewPrefs();
    var st = overviewSectionState(sectionId);
    st.collapsed = !st.collapsed;
    overviewPrefs.sections[sectionId] = st;
    saveOverviewPrefsDebounced();
    renderOverview();
  }

  function fmtOverviewNum(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    if (v >= 1000000) return (Math.round(v / 100000) / 10) + 'M';
    if (v >= 10000) return (Math.round(v / 100) / 10) + 'k';
    return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function fmtEazOverview(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return (Math.round(v * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function overviewSectionTitle(id) {
    return t('creator.journey.overview_cat_' + id, id.replace(/_/g, ' '));
  }

  function overviewSectionSummary(id, stats) {
    if (!stats || !stats.ok) return '';
    if (id === 'portfolio') {
      return fmtOverviewNum(stats.portfolio.products_online) + ' · ' + fmtOverviewNum(stats.portfolio.active_designs);
    }
    if (id === 'performance') {
      return fmtOverviewNum(stats.performance.sales_orders) + ' sales · ' + stats.performance.hero_ctr + '% CTR';
    }
    if (id === 'quests') {
      return stats.quests.main_completed + '/' + stats.quests.main_total + ' · ' +
        stats.quests.side_completed + '/' + stats.quests.side_total;
    }
    if (id === 'eaz') {
      return fmtEazOverview(stats.eaz.balance_free) + ' free';
    }
    if (id === 'unlocks') {
      var roy = stats.unlocks.royalty;
      return roy && roy.tier ? 'T' + roy.tier : '—';
    }
    return '';
  }

  function renderOverviewStatCard(iconKey, label, value, sub) {
    var icon = OVERVIEW_STAT_ICONS[iconKey] || OVERVIEW_STAT_ICONS.unlock;
    var subHtml = sub ? '<span class="cj-overview-stat__sub">' + escapeHtml(sub) + '</span>' : '';
    return '<article class="cj-overview-stat">' +
      '<span class="cj-overview-stat__icon" aria-hidden="true">' + icon + '</span>' +
      '<div class="cj-overview-stat__body">' +
      '<span class="cj-overview-stat__label">' + escapeHtml(label) + '</span>' +
      '<strong class="cj-overview-stat__value">' + escapeHtml(String(value)) + '</strong>' +
      subHtml + '</div></article>';
  }

  function renderOverviewUnlockCards(stats) {
    var pinned = overviewPrefs ? overviewPrefs.pinnedUnlockStats : DEFAULT_PINNED_STATS;
    var html = '';
    var u = stats.unlocks || {};
    var roy = u.royalty || {};
    if (pinned.indexOf('royalty') >= 0) {
      html += renderOverviewStatCard(
        'royalty',
        t('creator.journey.overview_stat_royalty', 'Royalty tier'),
        roy.tier ? tpl('creator.journey.overview_royalty_value', 'Tier {{ tier }} · {{ pct }}%', {
          tier: String(roy.tier),
          pct: String(roy.percent || 0)
        }) : '—',
        ''
      );
    }
    if (pinned.indexOf('eaz_economy') >= 0) {
      var eco = u.economy || {};
      var parts = [];
      if (eco.cost) parts.push(t('creator.journey.overview_economy_cost', 'Cost') + ' ' + (eco.cost.label || '—'));
      if (eco.daily) parts.push(t('creator.journey.overview_economy_daily', 'Daily') + ' ' + (eco.daily.label || '—'));
      if (eco.cap) parts.push(t('creator.journey.overview_economy_cap', 'Cap') + ' ' + (eco.cap.label || '—'));
      var sub = parts.join(' · ');
      if (eco.kickstarter_active) {
        sub += (sub ? ' · ' : '') + t('creator.journey.overview_kickstarter_active', 'Kickstarter active');
      }
      html += renderOverviewStatCard(
        'eaz_free',
        t('creator.journey.overview_stat_eaz_economy', 'EAZV Economy'),
        parts.length ? t('creator.journey.overview_economy_unlocked', 'Skills unlocked') : '—',
        sub || t('creator.journey.overview_economy_none', 'No skills yet')
      );
    }
    var cats = u.categories || {};
    var catLabels = {
      product: t('creator.journey.overview_stat_products', 'Products'),
      market: t('creator.journey.overview_stat_markets', 'Markets'),
      channel: t('creator.journey.overview_stat_channels', 'Channels'),
      creator_name: t('creator.journey.overview_stat_names', 'Creator names')
    };
    ['product', 'market', 'channel', 'creator_name'].forEach(function (cat) {
      if (pinned.indexOf(cat) < 0) return;
      var c = cats[cat] || { unlocked: 0, total: 0 };
      html += renderOverviewStatCard(
        'unlock',
        catLabels[cat] || cat,
        c.unlocked + '/' + c.total,
        t('creator.journey.overview_unlocked_of', 'Unlocked')
      );
    });
    if (!html) {
      html = '<p class="cj-muted cj-overview-unlocks-empty">' +
        escapeHtml(t('creator.journey.overview_no_pinned', 'Pin stats from the Unlock Tree tabs using the eye icon.')) +
        '</p>';
    }
    return html;
  }

  function renderOverviewSectionsHtml(stats) {
    var period = stats.period_days ? stats.period_days + 'd' : 'all';
    var p = stats.portfolio || {};
    var perf = stats.performance || {};
    var q = stats.quests || {};
    var eaz = stats.eaz || {};

    var sectionCards = {
      portfolio: [
        renderOverviewStatCard('products_online', t('creator.journey.overview_stat_products_online', 'Online products'), fmtOverviewNum(p.products_online), ''),
        renderOverviewStatCard('active_designs', t('creator.journey.overview_stat_active_designs', 'Active designs'), fmtOverviewNum(p.active_designs), ''),
        renderOverviewStatCard('community', t('creator.journey.overview_stat_members', 'Active members'), fmtOverviewNum(p.community_members), t('creator.journey.overview_members_hint', 'Creator code community'))
      ].join(''),
      performance: [
        renderOverviewStatCard('sales', t('creator.journey.overview_stat_sales', 'Sales'), fmtOverviewNum(perf.sales_orders), tpl('creator.journey.overview_period', '{{ days }} days', { days: String(period) })),
        renderOverviewStatCard('hero', t('creator.journey.overview_stat_hero', 'Hero views / clicks'), fmtOverviewNum(perf.hero_impressions) + ' / ' + fmtOverviewNum(perf.hero_clicks), 'CTR ' + (perf.hero_ctr || 0) + '%'),
        renderOverviewStatCard('product_clicks', t('creator.journey.overview_stat_product_clicks', 'Product clicks'), fmtOverviewNum(perf.product_clicks), t('creator.journey.overview_from_hero', 'From hero hotspots')),
        renderOverviewStatCard('conversion', t('creator.journey.overview_stat_conversion', 'Conversion'), (perf.conversion_rate || 0) + '%', t('creator.journey.overview_conversion_hint', 'Orders ÷ hero clicks'))
      ].join(''),
      quests: [
        renderOverviewStatCard('quest_main', t('creator.journey.quests_main', 'Main Quests'), q.main_completed + '/' + q.main_total, t('creator.journey.overview_completed', 'Completed')),
        renderOverviewStatCard('quest_daily', t('creator.journey.quests_daily', 'Daily Quests'), q.side_completed + '/' + q.side_total, t('creator.journey.overview_completed', 'Completed'))
      ].join(''),
      eaz: [
        renderOverviewStatCard('eaz_free', t('creator.journey.overview_eaz_free', 'Free'), fmtEazOverview(eaz.balance_free) + ' EAZV', t('creator.journey.overview_balance_now', 'Current balance')),
        renderOverviewStatCard('eaz_purchased', t('creator.journey.overview_eaz_purchased', 'Purchased'), fmtEazOverview(eaz.balance_purchased) + ' EAZV', t('creator.journey.overview_balance_now', 'Current balance')),
        renderOverviewStatCard('eaz_earned', t('creator.journey.overview_eaz_earned', 'Earned'), fmtEazOverview(eaz.balance_earned_total) + ' EAZC', t('creator.journey.overview_balance_now', 'Current balance')),
        renderOverviewStatCard('eaz_won', t('creator.journey.overview_eaz_won', 'Won'), fmtEazOverview(eaz.lifetime_won) + ' EAZV', t('creator.journey.overview_lifetime', 'Lifetime')),
        renderOverviewStatCard('eaz_spent', t('creator.journey.overview_eaz_spent', 'Spent'), fmtEazOverview(eaz.lifetime_spent) + ' EAZV', t('creator.journey.overview_lifetime', 'Lifetime'))
      ].join(''),
      unlocks: renderOverviewUnlockCards(stats)
    };

    var html = '';
    OVERVIEW_SECTION_DEFS.forEach(function (def) {
      var st = overviewSectionState(def.id);
      if (!st.visible) return;
      var summary = overviewSectionSummary(def.id, stats);
      var collapsedCls = st.collapsed ? ' is-collapsed' : '';
      html += '<section class="cj-overview-section' + collapsedCls + '" data-cj-overview-section="' + def.id + '">' +
        '<header class="cj-overview-section__head">' +
        '<button type="button" class="cj-overview-section__toggle" data-cj-overview-collapse="' + def.id + '" aria-expanded="' + (!st.collapsed) + '">' +
        '<span class="cj-overview-section__chev" aria-hidden="true"></span>' +
        '<span class="cj-overview-section__titles">' +
        '<span class="cj-overview-section__title">' + escapeHtml(overviewSectionTitle(def.id)) + '</span>' +
        (summary ? '<span class="cj-overview-section__summary">' + escapeHtml(summary) + '</span>' : '') +
        '</span></button>' +
        '<div class="cj-overview-section__actions">' +
        '<button type="button" class="cj-overview-section__eye" data-cj-overview-hide="' + def.id + '" aria-label="' +
        escapeHtml(t('creator.journey.overview_hide_section', 'Hide section')) + '" title="' +
        escapeHtml(t('creator.journey.overview_hide_section', 'Hide section')) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
        '</div></header>' +
        '<div class="cj-overview-section__body">' +
        '<div class="cj-overview-grid">' + (sectionCards[def.id] || '') + '</div>' +
        '</div></section>';
    });
    return html;
  }

  function renderOverviewHiddenBar() {
    var bar = document.getElementById('cjOverviewHiddenBar');
    var actions = document.getElementById('cjOverviewHiddenActions');
    if (!bar || !actions || !overviewPrefs) return;
    var hidden = OVERVIEW_SECTION_DEFS.filter(function (def) {
      return !overviewSectionState(def.id).visible;
    });
    if (!hidden.length) {
      bar.hidden = true;
      actions.innerHTML = '';
      return;
    }
    bar.hidden = false;
    actions.innerHTML = hidden.map(function (def) {
      return '<button type="button" class="cj-btn cj-btn--ghost cj-overview-restore-btn" data-cj-overview-show="' + def.id + '">' +
        escapeHtml(overviewSectionTitle(def.id)) + '</button>';
    }).join('');
  }

  function wireOverviewSectionEvents(root) {
    if (!root || root.dataset.wiredOverview) return;
    root.dataset.wiredOverview = '1';
    root.addEventListener('click', function (e) {
      var collapseBtn = e.target.closest('[data-cj-overview-collapse]');
      if (collapseBtn) {
        toggleOverviewSectionCollapsed(collapseBtn.getAttribute('data-cj-overview-collapse'));
        return;
      }
      var hideBtn = e.target.closest('[data-cj-overview-hide]');
      if (hideBtn) {
        toggleOverviewSectionVisible(hideBtn.getAttribute('data-cj-overview-hide'));
        return;
      }
      var showBtn = e.target.closest('[data-cj-overview-show]');
      if (showBtn) {
        var id = showBtn.getAttribute('data-cj-overview-show');
        if (!overviewPrefs) overviewPrefs = defaultOverviewPrefs();
        overviewPrefs.sections[id] = { visible: true, collapsed: false };
        saveOverviewPrefsDebounced();
        renderOverview();
      }
    });
  }

  async function loadOverviewStats() {
    var oid = ownerId();
    if (!oid) return null;
    if (overviewLoadPromise) return overviewLoadPromise;
    overviewLoadPromise = (async function () {
      try {
        await loadOverviewPrefs();
        overviewStatsData = await apiFetch('get-journey-overview-stats', { owner_id: oid, days: '90' });
        return overviewStatsData;
      } catch (e) {
        overviewStatsData = null;
        console.warn('[CreatorJourney] overview stats', e);
        return null;
      } finally {
        overviewLoadPromise = null;
      }
    })();
    return overviewLoadPromise;
  }

  function renderOverview() {
    var codeHint = document.getElementById('cjCodeHint');
    var overviewLoad = document.getElementById('cjOverviewLoading');
    var overviewShell = document.getElementById('cjOverviewShell');
    var sectionsEl = document.getElementById('cjOverviewSections');
    if (!journeyData) return;

    if (overviewLoad) overviewLoad.hidden = true;

    if (codeHint) codeHint.hidden = !!journeyData.is_creator;

    if (overviewShell && sectionsEl) {
      if (overviewStatsData && overviewStatsData.ok) {
        overviewShell.hidden = false;
        sectionsEl.innerHTML = renderOverviewSectionsHtml(overviewStatsData);
        renderOverviewHiddenBar();
        wireOverviewSectionEvents(overviewShell);
      } else if (overviewStatsData && !overviewStatsData.ok) {
        overviewShell.hidden = false;
        sectionsEl.innerHTML = '<p class="cj-muted">' +
          escapeHtml(t('creator.journey.load_error', 'Could not load journey data. Please try again.')) + '</p>';
      }
    }
  }

  async function loadLevelData() {
    var oid = ownerId();
    if (!oid) return;
    try {
      levelData = await apiFetch('get-level', { owner_id: oid });
    } catch (e) {
      levelData = null;
      console.warn('[CreatorJourney] level', e);
    }
    renderFloatLevel();
  }

  async function loadJourney() {
    var oid = ownerId();
    if (!oid) return;
    if (journeyLoadPromise) return journeyLoadPromise;

    setPanelLoading(true);
    journeyLoadPromise = (async function () {
      try {
        journeyData = await apiFetch('get-creator-journey', { owner_id: oid });
        await loadOverviewStats();
        renderOverview();
        renderSidebarBalance();
        renderTree();
      } catch (e) {
        journeyData = null;
        console.warn('[CreatorJourney] journey', e);
        var overviewLoad = document.getElementById('cjOverviewLoading');
        if (overviewLoad) {
          overviewLoad.hidden = false;
          overviewLoad.textContent = t('creator.journey.load_error', 'Could not load journey data. Please try again.');
        }
        var treeLoad = document.getElementById('cjTreeLoading');
        if (treeLoad) {
          treeLoad.hidden = false;
          treeLoad.textContent = t('creator.journey.load_error', 'Could not load journey data. Please try again.');
        }
      } finally {
        setPanelLoading(false);
        journeyLoadPromise = null;
      }
    })();

    return journeyLoadPromise;
  }

  function questCategoryForType(type) {
    return type === 'daily' ? 'creator_side' : 'creator_main';
  }

  function questTitleFromTodo(todo) {
    var pres = todo.presentation && typeof todo.presentation === 'object' ? todo.presentation : {};
    var tt = typeof pres.title_text === 'string' ? pres.title_text.trim() : '';
    if (tt) return tt;
    var sk = typeof pres.title_shopify_key === 'string' ? pres.title_shopify_key.trim() : '';
    if (sk) return t(sk, sk);
    return todo.id || '';
  }

  function questDescriptionFromTodo(todo) {
    var pres = todo.presentation && typeof todo.presentation === 'object' ? todo.presentation : {};
    var dt = typeof pres.description_text === 'string' ? pres.description_text.trim() : '';
    if (dt) return dt;
    var dk = typeof pres.description_shopify_key === 'string' ? pres.description_shopify_key.trim() : '';
    if (dk) return t(dk, '');
    return '';
  }

  function questIconFromTodo(todo) {
    var pres = todo.presentation && typeof todo.presentation === 'object' ? todo.presentation : {};
    return typeof pres.icon === 'string' && pres.icon ? pres.icon : '✓';
  }

  function isQuestCompleted(todo, completedIds) {
    return !!(todo.completed || completedIds.has(todo.id));
  }

  function isQuestReady(todo, progress) {
    if (todo.completed) return false;
    var pk = todo.progress_key || todo.progressKey;
    if (pk && progress && progress[pk]) return true;
    if (todo.countKey && todo.count_target != null) {
      return (Number(todo.count_current) || 0) >= Number(todo.count_target);
    }
    return false;
  }

  function renderQuests() {
    var shell = document.getElementById('cjQuestsShell');
    var loading = document.getElementById('cjQuestsLoading');
    var list = document.getElementById('cjQuestsList');
    if (!list) return;

    if (!onboardingData || !onboardingData.ok) {
      if (loading) {
        loading.hidden = false;
        loading.textContent = t('creator.journey.load_error', 'Could not load journey data. Please try again.');
      }
      if (shell) shell.hidden = true;
      list.innerHTML = '';
      return;
    }

    if (loading) loading.hidden = true;
    if (shell) shell.hidden = false;

    var progress = onboardingData.progress || {};
    var completedIds = new Set(onboardingData.completed_todos || []);
    var cat = questCategoryForType(questType);
    var todos = (onboardingData.todos || []).filter(function (todo) {
      return String(todo.category || 'creator_main') === cat;
    });

    var filtered = todos.filter(function (todo) {
      var done = isQuestCompleted(todo, completedIds);
      return questFilter === 'completed' ? done : !done;
    });

    if (!filtered.length) {
      list.innerHTML =
        '<p class="cj-quests-empty">' +
        escapeHtml(
          questFilter === 'completed'
            ? t('creator.journey.quests_empty_completed', 'No completed quests yet.')
            : t('creator.journey.quests_empty_available', 'No available quests in this category.')
        ) +
        '</p>';
      return;
    }

    list.innerHTML = filtered
      .map(function (todo) {
        var pres = todo.presentation && typeof todo.presentation === 'object' ? todo.presentation : {};
        var title = questTitleFromTodo(todo);
        var desc = questDescriptionFromTodo(todo);
        var icon = questIconFromTodo(todo);
        var xp = Number(todo.xp) || 0;
        var completed = isQuestCompleted(todo, completedIds);
        var ready = !completed && isQuestReady(todo, progress);
        var statusClass = completed ? ' is-completed' : ready ? ' is-ready' : '';
        var statusLabel = completed
          ? t('creator.journey.quests_status_completed', 'Completed')
          : ready
            ? t('creator.journey.quests_status_ready', 'Ready to claim')
            : t('creator.journey.quests_status_in_progress', 'In progress');
        var countHtml = '';
        if (todo.count_target != null) {
          countHtml =
            '<span class="cj-quest-card__count">' +
            escapeHtml(String(todo.count_current || 0)) +
            '/' +
            escapeHtml(String(todo.count_target)) +
            '</span>';
        }
        var descHtml = desc
          ? '<p class="cj-quest-card__desc">' + escapeHtml(desc) + '</p>'
          : '';
        var slugHtml = '<p class="cj-quest-card__slug">' + escapeHtml(String(todo.id || '')) + '</p>';
        return (
          '<article class="cj-quest-card' +
          statusClass +
          '">' +
          '<div class="cj-quest-card__icon" aria-hidden="true">' +
          escapeHtml(icon) +
          '</div>' +
          '<div class="cj-quest-card__body">' +
          '<div class="cj-quest-card__head">' +
          '<h4 class="cj-quest-card__title">' +
          escapeHtml(title) +
          '</h4>' +
          '<span class="cj-quest-card__status">' +
          escapeHtml(statusLabel) +
          '</span>' +
          '</div>' +
          slugHtml +
          descHtml +
          '<div class="cj-quest-card__meta">' +
          '<span class="cj-quest-card__xp">+' +
          escapeHtml(String(xp)) +
          ' XP</span>' +
          countHtml +
          '</div>' +
          '</div></article>'
        );
      })
      .join('');
  }

  async function loadQuests() {
    var oid = ownerId();
    if (!oid) return;
    if (questsLoadPromise) return questsLoadPromise;

    var loading = document.getElementById('cjQuestsLoading');
    if (loading) {
      loading.hidden = false;
      loading.textContent = t('creator.journey.loading', 'Loading…');
    }
    var shell = document.getElementById('cjQuestsShell');
    if (shell) shell.hidden = true;

    questsLoadPromise = (async function () {
      try {
        onboardingData = await apiFetch('get-onboarding-progress', { owner_id: oid });
        renderQuests();
      } catch (e) {
        onboardingData = null;
        console.warn('[CreatorJourney] quests', e);
        renderQuests();
      } finally {
        questsLoadPromise = null;
      }
    })();

    return questsLoadPromise;
  }

  async function commitNode(nodeKey, amount) {
    var oid = ownerId();
    var avail = journeyData && journeyData.balance_eaz != null ? Number(journeyData.balance_eaz) : 0;
    var amt = amount != null ? amount : avail;
    if (!amt || amt <= 0) return;
    await apiFetch('commit-creator-unlock', { owner_id: oid }, 'POST', { node_key: nodeKey, amount: amt });
    await loadJourney();
  }

  async function unlockNode(nodeKey) {
    var oid = ownerId();
    await apiFetch('unlock-creator-node', { owner_id: oid }, 'POST', { node_key: nodeKey });
    await loadJourney();
  }

  function open(opts) {
    opts = opts || {};
    if (!overlay) return;
    syncMobileLayout();
    if (isMobileSidebarOpen) closeMobileSidebar();
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    overlay.style.display = 'flex';
    requestAnimationFrame(function () {
      overlay.classList.add('is-open');
    });
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    loadJourneyBackground();
    var section = opts.section || opts.tab || 'overview';
    if (section === 'unlock-tree' || opts.nodeId) section = 'unlock-tree';
    setTab(section);
    var journeyPromise = loadJourney();
    var levelPromise = loadLevelData();
    Promise.all([journeyPromise, levelPromise]).then(function () {
      if (opts.nodeId) {
        var node = (journeyData.nodes || []).find(function (n) { return n.node_key === opts.nodeId; });
        if (node && node.category) treeFilter = node.category;
        renderTree();
        var el = document.querySelector('.cj-tree-card[data-node="' + opts.nodeId + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('is-highlight');
          setTimeout(function () { el.classList.remove('is-highlight'); }, 2400);
        }
      }
    }).catch(function (e) { console.warn('[CreatorJourney]', e); });
  }

  function close() {
    if (!overlay) return;
    if (isMobileSidebarOpen) closeMobileSidebar();
    var closeBtn = document.getElementById('cjClose');
    if (closeBtn && document.activeElement && overlay.contains(document.activeElement)) {
      closeBtn.blur();
    }
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {
      overlay.style.display = 'none';
      closeTimer = null;
    }, 280);
  }

  function init() {
    if (!overlay) return;
    syncMobileLayout();
    window.addEventListener('resize', syncMobileLayout);
    var closeBtn = document.getElementById('cjClose');
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMobileSidebar);
    if (mobileDrawerOverlay) mobileDrawerOverlay.addEventListener('click', closeMobileSidebar);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    document.querySelectorAll('.cj-nav-item[data-cj-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTab(btn.getAttribute('data-cj-nav'));
      });
    });

    document.querySelectorAll('[data-cj-quest-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        questType = btn.getAttribute('data-cj-quest-type') || 'main';
        document.querySelectorAll('[data-cj-quest-type]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderQuests();
      });
    });

    document.querySelectorAll('[data-cj-quest-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        questFilter = btn.getAttribute('data-cj-quest-filter') || 'available';
        document.querySelectorAll('[data-cj-quest-filter]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderQuests();
      });
    });

    var commitCancel = document.getElementById('cjCommitCancel');
    var commitConfirm = document.getElementById('cjCommitConfirm');
    var commitOverlay = document.getElementById('cjCommitOverlay');
    if (commitCancel) commitCancel.addEventListener('click', closeCommitModal);
    if (commitConfirm) commitConfirm.addEventListener('click', confirmCommitModal);
    if (commitOverlay) {
      commitOverlay.addEventListener('click', function (e) {
        if (e.target === commitOverlay) closeCommitModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var commitOpen = document.getElementById('cjCommitOverlay');
      if (commitOpen && commitOpen.classList.contains('is-open')) {
        closeCommitModal();
        return;
      }
      if (!isOpen()) return;
      if (isMobileSidebarOpen) closeMobileSidebar();
      else close();
    });

    document.addEventListener('click', function (e) {
      var cjOpen = e.target.closest('[data-cj-open]');
      if (cjOpen && window.CreatorJourneyModal) {
        e.preventDefault();
        e.stopPropagation();
        var sec = cjOpen.getAttribute('data-cj-open') || 'overview';
        if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.close === 'function') {
          window.CreatorSettingsV2Modal.close();
        }
        window.CreatorJourneyModal.open({ section: sec });
        return;
      }
      if (!e.target.closest('.creator-journey-trigger')) return;
      e.preventDefault();
      open({});
    });

    document.addEventListener('xp-updated', function () {
      if (isOpen()) loadLevelData();
    });
  }

  window.CreatorJourneyModal = {
    open: open,
    close: close,
    isOpen: isOpen,
    reload: function () {
      journeyLoadPromise = null;
      overviewLoadPromise = null;
      return Promise.all([loadJourney(), loadLevelData()]);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
