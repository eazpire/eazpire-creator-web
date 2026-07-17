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
  var pendingCommitMeta = null;
  var pendingCommitAmount = null;
  var celebrateTimer = null;
  var toastTimer = null;
  var bgAppliedKey = '';
  var journeyLoadPromise = null;
  var levelLoadPromise = null;
  var onboardingData = null;
  var questsLoadPromise = null;
  var questType = 'main';
  var questFilter = 'available';

  /** In-memory cache so reopening / tab switches do not refetch every time. */
  var JOURNEY_CACHE_TTL_MS = 60000;
  var OVERVIEW_CACHE_TTL_MS = 60000;
  var journeyFetchedAt = 0;
  var overviewFetchedAt = 0;

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
        var cachedBal = readCachedBalanceEaz();
        if (balanceVal) {
          if (cachedBal != null) {
            balanceVal.textContent = formatSidebarBalanceValue(cachedBal);
            balanceVal.classList.remove('is-loading');
          } else {
            balanceVal.textContent = '—';
            balanceVal.classList.add('is-loading');
          }
        }
      }
      if (levelWrap) levelWrap.hidden = false;
      if (xpEl) {
        if (levelData && levelData.ok) {
          renderFloatLevel();
        } else if (journeyData && journeyData.display_level) {
          var fbLv = Number(journeyData.display_level) || 1;
          var numEl = document.getElementById('cjFloatLevelNum');
          if (numEl) numEl.textContent = String(fbLv);
          xpEl.textContent = t('creator.journey.loading', 'Loading…');
          xpEl.classList.add('is-loading');
        } else {
          xpEl.textContent = t('creator.journey.loading', 'Loading…');
          xpEl.classList.add('is-loading');
        }
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
    'product', 'design_type', 'creation_limit', 'market', 'channel', 'listing_limit',
    'automation', 'promotion', 'hero', 'social',
    'design_slot', 'creator_name'
  ];

  var SOFTSTYLE_PRODUCT_KEY = 'unisex-softstyle-cotton-tee';
  var FLAG_CDN = 'https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.2.2/flags/4x3/';
  /** Continent → lipis flag-icons code when a real regional flag exists. */
  var CONTINENT_FLAG_CDN = { EU: 'eu', AN: 'aq' };
  /**
   * Custom 4×3 continent emblems (data URIs) for continents without ISO/regional flags.
   * Kept inline so Shopify theme + creator-web portal both work without asset_url wiring.
   */
  var CONTINENT_FLAG_DATA = {
    AF: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">' +
      '<rect width="640" height="480" fill="#008751"/>' +
      '<circle cx="320" cy="240" r="108" fill="none" stroke="#FFD100" stroke-width="22"/>' +
      '<path fill="#FFD100" d="M320 148l22 68h72l-58 42 22 68-58-42-58 42 22-68-58-42h72z"/>' +
      '</svg>'
    ),
    AS: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">' +
      '<rect width="640" height="480" fill="#C8102E"/>' +
      '<circle cx="320" cy="240" r="96" fill="#FFD100"/>' +
      '<circle cx="320" cy="240" r="58" fill="#C8102E"/>' +
      '<path fill="#FFD100" d="M320 120l18 56h58l-47 34 18 56-47-34-47 34 18-56-47-34h58z"/>' +
      '</svg>'
    ),
    NA: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">' +
      '<rect width="640" height="480" fill="#0B3D91"/>' +
      '<path fill="#FFFFFF" d="M180 300c40-120 90-170 140-180 55-10 95 30 120 70 30 48 55 70 100 90-55 20-100 10-140 35-55 35-100 55-160 40-35-8-50-30-60-55z"/>' +
      '<circle cx="250" cy="170" r="10" fill="#FFD100"/><circle cx="320" cy="150" r="10" fill="#FFD100"/><circle cx="390" cy="175" r="10" fill="#FFD100"/>' +
      '</svg>'
    ),
    SA: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">' +
      '<rect width="640" height="480" fill="#009C3B"/>' +
      '<path fill="#FFDF00" d="M320 70L560 240 320 410 80 240z"/>' +
      '<circle cx="320" cy="240" r="78" fill="#002776"/>' +
      '<path fill="none" stroke="#FFFFFF" stroke-width="10" d="M260 250c30-35 70-50 120-35"/>' +
      '</svg>'
    ),
    OC: 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">' +
      '<rect width="640" height="480" fill="#012169"/>' +
      '<path fill="#FFFFFF" d="M420 120l12 36h38l-30 22 12 36-32-22-32 22 12-36-30-22h38z"/>' +
      '<path fill="#FFFFFF" d="M500 220l9 28h30l-24 18 9 28-24-18-24 18 9-28-24-18h30z"/>' +
      '<path fill="#FFFFFF" d="M455 280l9 28h30l-24 18 9 28-24-18-24 18 9-28-24-18h30z"/>' +
      '<path fill="#FFFFFF" d="M390 250l7 22h24l-19 14 7 22-19-14-19 14 7-22-19-14h24z"/>' +
      '<path fill="#FFFFFF" d="M470 340l7 22h24l-19 14 7 22-19-14-19 14 7-22-19-14h24z"/>' +
      '<circle cx="160" cy="160" r="36" fill="#FFD100"/>' +
      '</svg>'
    )
  };
  var expandedProductKeys = {};
  var expandedColorKeys = {};
  var expandedContinentKeys = {};
  var expandedChannelKeys = {};
  var expandedSlotLevelKeys = {};
  var expandedCreationLimitKeys = {};
  var expandedListingLimitKeys = {};

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
    creation_limit: '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 21h8"/></svg>',
    listing_limit: '<svg viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h14"/><circle cx="19" cy="17" r="2"/></svg>',
    creator_name: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    eaz_economy: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4.5a2 2 0 0 1 0 4H9"/></svg>',
  };

  /**
   * Lucide-style inline SVGs (ISC) — one distinct motif per royalty tier.
   * Paths match the stroke icon style already used in CATEGORY_ICON_SVG / overview stats.
   */
  var ROYALTY_TIER_ICON_SVG = {
    1: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    2: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
    3: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>',
    4: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/></svg>',
    5: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>',
    6: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m15 9-6 6"/><path d="M9 9h.01"/><path d="M15 15h.01"/></svg>',
    7: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
    8: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>',
    9: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>',
    10: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>'
  };

  var ROYALTY_INFO_ICON_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

  /** Progressive grid motifs — one distinct icon per design slot level (L1–L10). */
  var DESIGN_SLOT_LEVEL_ICON_SVG = {
    1: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
    2: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="7" width="7" height="10" rx="1"/><rect x="13" y="7" width="7" height="10" rx="1"/></svg>',
    3: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="6" height="6" rx="1"/><rect x="13" y="5" width="6" height="6" rx="1"/><rect x="9" y="13" width="6" height="6" rx="1"/></svg>',
    4: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
    5: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="5" height="5" rx="0.8"/><rect x="9.5" y="6" width="5" height="5" rx="0.8"/><rect x="16" y="6" width="5" height="5" rx="0.8"/><rect x="3" y="13" width="5" height="5" rx="0.8"/><rect x="9.5" y="13" width="5" height="5" rx="0.8"/><rect x="16" y="13" width="5" height="5" rx="0.8"/></svg>',
    6: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="4.5" height="4.5" rx="0.7"/><rect x="7.5" y="5" width="4.5" height="4.5" rx="0.7"/><rect x="13" y="5" width="4.5" height="4.5" rx="0.7"/><rect x="18.5" y="5" width="3.5" height="4.5" rx="0.7"/><rect x="2" y="11" width="4.5" height="4.5" rx="0.7"/><rect x="7.5" y="11" width="4.5" height="4.5" rx="0.7"/><rect x="13" y="11" width="4.5" height="4.5" rx="0.7"/><rect x="18.5" y="11" width="3.5" height="4.5" rx="0.7"/></svg>',
    7: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="4.5" height="4.5" rx="0.7"/><rect x="9.75" y="4" width="4.5" height="4.5" rx="0.7"/><rect x="15.5" y="4" width="4.5" height="4.5" rx="0.7"/><rect x="4" y="9.75" width="4.5" height="4.5" rx="0.7"/><rect x="15.5" y="9.75" width="4.5" height="4.5" rx="0.7"/><rect x="4" y="15.5" width="4.5" height="4.5" rx="0.7"/><rect x="9.75" y="15.5" width="4.5" height="4.5" rx="0.7"/><rect x="15.5" y="15.5" width="4.5" height="4.5" rx="0.7"/></svg>',
    8: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="4.5" height="4.5" rx="0.7"/><rect x="9.75" y="4" width="4.5" height="4.5" rx="0.7"/><rect x="15.5" y="4" width="4.5" height="4.5" rx="0.7"/><rect x="4" y="9.75" width="4.5" height="4.5" rx="0.7"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="0.7"/><rect x="15.5" y="9.75" width="4.5" height="4.5" rx="0.7"/><rect x="4" y="15.5" width="4.5" height="4.5" rx="0.7"/><rect x="9.75" y="15.5" width="4.5" height="4.5" rx="0.7"/><rect x="15.5" y="15.5" width="4.5" height="4.5" rx="0.7"/></svg>',
    9: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="3.5" height="3.5" rx="0.5"/><rect x="6.5" y="5" width="3.5" height="3.5" rx="0.5"/><rect x="11" y="5" width="3.5" height="3.5" rx="0.5"/><rect x="15.5" y="5" width="3.5" height="3.5" rx="0.5"/><rect x="19" y="5" width="3" height="3.5" rx="0.5"/><rect x="2" y="10" width="3.5" height="3.5" rx="0.5"/><rect x="6.5" y="10" width="3.5" height="3.5" rx="0.5"/><rect x="11" y="10" width="3.5" height="3.5" rx="0.5"/><rect x="15.5" y="10" width="3.5" height="3.5" rx="0.5"/><rect x="19" y="10" width="3" height="3.5" rx="0.5"/><rect x="2" y="15" width="3.5" height="3.5" rx="0.5"/><rect x="6.5" y="15" width="3.5" height="3.5" rx="0.5"/><rect x="11" y="15" width="3.5" height="3.5" rx="0.5"/><rect x="15.5" y="15" width="3.5" height="3.5" rx="0.5"/><rect x="19" y="15" width="3" height="3.5" rx="0.5"/></svg>',
    10: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z"/><path d="M10.5 7h3v10h-3z"/><path d="M12 2l1.2 2.2L16 5l-2.2 1.2L12 8.5 10.2 6.2 8 5l2.8-.8L12 2z"/></svg>'
  };

  function royaltyTierFromNode(node) {
    if (!node) return 0;
    if (node.metadata && node.metadata.royalty_tier != null) {
      return Math.floor(Number(node.metadata.royalty_tier)) || 0;
    }
    var key = String(node.node_key || '');
    if (key.indexOf('royalty:') === 0) {
      return Math.floor(Number(key.slice('royalty:'.length))) || 0;
    }
    return 0;
  }

  function royaltyPercentFromNode(node) {
    if (node && node.metadata && node.metadata.royalty_percent != null) {
      return Number(node.metadata.royalty_percent) || 0;
    }
    return 0;
  }

  function royaltyTierIconSvg(tier) {
    return ROYALTY_TIER_ICON_SVG[tier] || ROYALTY_TIER_ICON_SVG[1] || CATEGORY_ICON_SVG.royalty;
  }

  function designSlotLevelFromNode(node) {
    if (!node) return 0;
    if (node.metadata && node.metadata.slot_level != null) {
      return Math.floor(Number(node.metadata.slot_level)) || 0;
    }
    var key = String(node.node_key || '');
    if (key.indexOf('design_slot_level:') === 0) {
      return Math.floor(Number(key.slice('design_slot_level:'.length))) || 0;
    }
    return Math.floor(Number(node.min_level)) || 0;
  }

  function designSlotLevelIconSvg(level) {
    var lv = Math.max(1, Math.min(10, Math.floor(Number(level)) || 1));
    return DESIGN_SLOT_LEVEL_ICON_SVG[lv] || DESIGN_SLOT_LEVEL_ICON_SVG[1] || CATEGORY_ICON_SVG.design_slot;
  }

  function designSlotLevelShortTitle(node) {
    return tpl('creator.journey.design_slot_level_short', 'Level {{ n }}', {
      n: String(designSlotLevelFromNode(node) || '')
    });
  }

  function designSlotCountLabel(node) {
    var cap = node && node.metadata && node.metadata.slot_cap;
    if (cap == null || cap === '') return '';
    return tpl('creator.journey.design_slot_count_label', '{{ n }}', { n: String(cap) });
  }

  function highestUnlockedDesignSlotLevelIcon(nodes) {
    var unlocked = (nodes || []).filter(function (n) {
      return isDesignSlotLevelNode(n) && n.unlocked;
    });
    if (!unlocked.length) return CATEGORY_ICON_SVG.design_slot;
    unlocked.sort(function (a, b) {
      return designSlotLevelFromNode(b) - designSlotLevelFromNode(a);
    });
    return designSlotLevelIconSvg(designSlotLevelFromNode(unlocked[0]));
  }

  function categoryTabIconSvg(cat, nodes) {
    if (cat === 'design_slot') return highestUnlockedDesignSlotLevelIcon(nodes);
    return CATEGORY_ICON_SVG[cat] || CATEGORY_ICON_SVG.product;
  }

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
    var fallbacks = {
      creation_limit: 'Creation Limits',
      listing_limit: 'Listing Limits',
      design_type: 'Design types',
      eaz_economy: 'EAZV Economy'
    };
    var fb = fallbacks[cat];
    if (!fb) {
      fb = cat.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }
    return tpl('creator.journey.cat_' + cat, fb);
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
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      };
      return window.creatorApiFetch(op, params || {}, opts);
    }
    return window.creatorApiFetch(op, params || {});
  }

  function parseLocaleAmount(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(/\s/g, '').replace(/[^\d.,\-]/g, '');
    if (!s || s === '-' || s === '.' || s === ',') return NaN;
    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      s = s.replace(',', '.');
    }
    var n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Balance from journey payload, global cache, or already-painted page widgets. */
  function readCachedBalanceEaz() {
    if (journeyData && journeyData.balance_eaz != null) {
      return Number(journeyData.balance_eaz);
    }
    var cache = window.__eazBalanceCache;
    if (cache && cache.value != null && Number.isFinite(Number(cache.value))) {
      return Number(cache.value);
    }
    if (typeof window._getGlobalEazSource === 'function') {
      var src = window._getGlobalEazSource();
      if (src && src.dataset && src.dataset.eazLoaded === '1') {
        var fromDom = parseLocaleAmount(src.textContent);
        if (Number.isFinite(fromDom)) return fromDom;
      }
    }
    return null;
  }

  function formatSidebarBalanceValue(n) {
    return String(Math.round(Number(n) * 10) / 10) + ' EAZV';
  }

  function formatEazAmount(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    return String(v);
  }

  function findJourneyNode(nodeKey) {
    if (!nodeKey || !journeyData || !Array.isArray(journeyData.nodes)) return null;
    for (var i = 0; i < journeyData.nodes.length; i++) {
      if (journeyData.nodes[i].node_key === nodeKey) return journeyData.nodes[i];
    }
    return null;
  }

  function showCjToast(message, isError) {
    if (!message) return;
    var el = document.getElementById('cjToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cjToast';
      el.className = 'cj-toast';
      el.setAttribute('role', 'status');
      (overlay || document.body).appendChild(el);
    }
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
    el.classList.add('is-open');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-open');
      toastTimer = null;
    }, 2800);
  }

  function journeyErrorDetail(err) {
    var body = err && err.body;
    var code = (body && (body.error || body.code)) || '';
    if (!code && err && err.message) {
      var m = String(err.message);
      try {
        var jsonStart = m.indexOf('{');
        if (jsonStart >= 0) {
          var parsed = JSON.parse(m.slice(jsonStart));
          code = parsed.error || parsed.code || '';
        }
      } catch (_e) {}
      if (!code && /parent_required/i.test(m)) code = 'parent_required';
      if (!code && /level_required/i.test(m)) code = 'level_required';
    }
    if (code === 'parent_required' || code === 'prev_tier_required') {
      return t('creator.journey.unlock_fail_parent', 'Unlock the parent skill first.');
    }
    if (code === 'level_required') {
      return t('creator.journey.unlock_fail_level', 'Higher level required.');
    }
    if (code === 'invalid_amount') {
      return t('creator.journey.commit_modal_invalid_amount', 'Enter a valid amount greater than zero.');
    }
    if (code === 'insufficient_balance' || code === 'INSUFFICIENT_EAZ' || code === 'insufficient_eaz') {
      return t('creator.journey.commit_modal_insufficient', 'Not enough EAZV available.');
    }
    return code ? String(code).replace(/_/g, ' ') : '';
  }

  function celebrateMediaHtml(node) {
    if (!node) return '<span class="cj-celebrate-fallback" aria-hidden="true">★</span>';
    var img = nodeImageUrl(node);
    if (img) return '<img src="' + escapeHtml(img) + '" alt="">';
    if (node.category === 'market') {
      if (isMarketContinentNode(node)) return continentFlagHtml(node);
      var meta = node.metadata || {};
      if (meta.market_kind === 'country' || meta.flag_code) return marketFlagHtml(node);
      return continentFlagHtml(node);
    }
    if (node.metadata && node.metadata.variant_kind === 'size') {
      var sizeLabel = node.metadata.size || nodeTitle(node);
      return '<span class="cj-celebrate-fallback">' + escapeHtml(sizeLabel) + '</span>';
    }
    return '<span class="cj-celebrate-fallback" aria-hidden="true">★</span>';
  }

  function showUnlockCelebration(opts) {
    opts = opts || {};
    var celebrate = document.getElementById('cjCelebrateOverlay');
    if (!celebrate) return;
    var media = document.getElementById('cjCelebrateMedia');
    var titleEl = document.getElementById('cjCelebrateTitle');
    var subEl = document.getElementById('cjCelebrateSub');
    var name = opts.name || '';
    if (media) media.innerHTML = opts.mediaHtml || celebrateMediaHtml(opts.node);
    if (titleEl) {
      titleEl.textContent = opts.title || tpl(
        'creator.journey.unlock_success_title',
        'Congratulations — {{ name }} unlocked',
        { name: name }
      );
    }
    if (subEl) {
      subEl.textContent = opts.sub || t(
        'creator.journey.unlock_success_sub',
        'New skill unlocked in your Creator Journey'
      );
    }
    celebrate.hidden = false;
    celebrate.classList.add('is-open');
    celebrate.setAttribute('aria-hidden', 'false');
    if (celebrateTimer) clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(function () {
      celebrate.classList.remove('is-open');
      celebrate.setAttribute('aria-hidden', 'true');
      celebrate.hidden = true;
      celebrateTimer = null;
    }, 2800);
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
      if (overviewCacheFresh()) {
        renderOverview();
      } else {
        loadOverviewStats().then(function () { renderOverview(); }).catch(console.warn);
      }
    }
    document.dispatchEvent(new CustomEvent('creator-journey-tab-changed', {
      detail: { tab: currentTab }
    }));
  }

  function updateFloatLevelVisibility() {
    /* Level widget lives in sidebar — visibility handled in renderFloatLevel */
  }

  function highestUnlockedTierNode(tierNodes) {
    var active = null;
    for (var i = tierNodes.length - 1; i >= 0; i--) {
      if (tierNodes[i].unlocked) {
        active = tierNodes[i];
        break;
      }
    }
    return active;
  }

  var LISTING_CHANNEL_ICONS = {
    shopify: '<svg viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    amazon: '<svg viewBox="0 0 24 24"><path d="M3 14c3.5-4.5 7.5-6.5 9-6.5s5.5 2 9 6.5"/><path d="M17 13l4 2.5-1.2 3.5"/></svg>',
    ebay: '<svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1"/></svg>',
    etsy: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/></svg>'
  };

  var LISTING_CHANNEL_DEFAULT_ICON =
    '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>';

  function creationLimitAxisIconSvg(axis) {
    return axis === 'upload'
      ? '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 21h8"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M12 3l2 4h5l-4 3 2 4-5-3-5 3 2-4-4-3h5z"/></svg>';
  }

  function listingLimitChannelIconSvg(channelId) {
    var ch = String(channelId || '').toLowerCase();
    return LISTING_CHANNEL_ICONS[ch] || LISTING_CHANNEL_DEFAULT_ICON;
  }

  function multiTierParentShortTitle(node) {
    if (node.metadata && node.metadata.title) return String(node.metadata.title);
    if (node.metadata && node.metadata.creation_limit_kind === 'parent') {
      return node.metadata.creation_limit_axis === 'upload' ? 'Upload' : 'Generate';
    }
    if (node.metadata && node.metadata.listing_limit_kind === 'channel') {
      return String(node.channel_id || '');
    }
    return '';
  }

  function activeLimitLabelForParent(node) {
    if (node.metadata && node.metadata.creation_limit_kind === 'parent') {
      var activeCreation = highestUnlockedTierNode(creationLimitTierNodes(node));
      if (!activeCreation || !activeCreation.metadata) return '';
      var val = activeCreation.metadata.limit_value;
      if (activeCreation.metadata.limit_mode === 'lifetime') {
        return tpl('creator.journey.limit_total_label', '{{ n }} Total', { n: String(val) });
      }
      return tpl('creator.journey.limit_daily_label', '{{ n }} Daily', { n: String(val) });
    }
    if (node.metadata && node.metadata.listing_limit_kind === 'channel') {
      var activeListing = highestUnlockedTierNode(listingLimitTierNodes(node));
      var dailyVal = null;
      if (activeListing && activeListing.metadata) {
        dailyVal = activeListing.metadata.listings_per_day;
      } else if (node.unlocked && node.channel_id === 'shopify') {
        dailyVal = 10;
      }
      if (dailyVal == null || dailyVal === '') return '';
      return tpl('creator.journey.limit_daily_label', '{{ n }} Daily', { n: String(dailyVal) });
    }
    return '';
  }

  function parentLimitMediaOpts(node) {
    if (node.metadata && node.metadata.creation_limit_kind === 'parent') {
      return {
        iconSvg: creationLimitAxisIconSvg(node.metadata.creation_limit_axis),
        limitLabel: activeLimitLabelForParent(node)
      };
    }
    if (node.metadata && node.metadata.listing_limit_kind === 'channel') {
      return {
        iconSvg: listingLimitChannelIconSvg(node.channel_id),
        limitLabel: activeLimitLabelForParent(node)
      };
    }
    if (isDesignSlotLevelNode(node)) {
      return {
        iconSvg: designSlotLevelIconSvg(designSlotLevelFromNode(node)),
        limitLabel: designSlotCountLabel(node)
      };
    }
    return null;
  }

  function creationLimitCardMediaOpts(node) {
    if (isCreationLimitParent(node)) return parentLimitMediaOpts(node);
    if (node.metadata && node.metadata.creation_limit_kind === 'tier') {
      return {
        iconSvg: creationLimitAxisIconSvg(node.metadata.creation_limit_axis)
      };
    }
    return null;
  }

  function listingLimitCardMediaOpts(node) {
    if (isListingLimitChannel(node)) return parentLimitMediaOpts(node);
    if (node.metadata && node.metadata.listing_limit_kind === 'tier') {
      return {
        iconSvg: listingLimitChannelIconSvg(node.channel_id)
      };
    }
    return null;
  }

  var SKILL_INFO_ICON_SVG = ROYALTY_INFO_ICON_SVG;

  var PRODUCT_KEY_ICON_SVG = {
    'unisex-softstyle-cotton-tee': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3 3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-3-4"/><path d="M6 3h12l1.5 4H4.5L6 3z"/><path d="M9 11v6M15 11v6"/></svg>'
  };

  var DESIGN_TYPE_ICON_SVG = {
    classic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    pattern: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    'all-over': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M4 9h16M4 14h16M9 4v16M14 4v16"/></svg>',
    'full-coverage': '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20M8 4v16M16 4v16"/></svg>',
    panorama: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/></svg>'
  };

  var CHANNEL_ICON_SVG = {
    shopify: LISTING_CHANNEL_ICONS.shopify,
    amazon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14c3.5-4.5 7.5-6.5 9-6.5s5.5 2 9 6.5"/><path d="M17 13l4 2.5-1.2 3.5"/></svg>',
    amazon_eu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    amazon_us: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/></svg>',
    amazon_uk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5z"/><path d="M12 22V12"/></svg>',
    ebay: LISTING_CHANNEL_ICONS.ebay,
    etsy: LISTING_CHANNEL_ICONS.etsy
  };

  var SOCIAL_PLATFORM_ICON_SVG = {
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 8.5a2.5 2.5 0 0 0-1.76-1.77C18.2 6.2 12 6.2 12 6.2s-6.2 0-8.24.53A2.5 2.5 0 0 0 2 8.5 26 26 0 0 0 1.5 12 26 26 0 0 0 2 15.5a2.5 2.5 0 0 0 1.76 1.77C5.8 17.8 12 17.8 12 17.8s6.2 0 8.24-.53A2.5 2.5 0 0 0 22 15.5 26 26 0 0 0 22.5 12 26 26 0 0 0 22 8.5z"/><path d="M10 9.5v7l6-3.5-6-3.5z"/></svg>'
  };

  var EAZ_AXIS_ICON_SVG = {
    cost: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4.5a2 2 0 0 1 0 4H9"/></svg>',
    daily: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    cap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10l8-5 8 5v10"/><path d="M9 20v-6h6v6"/></svg>',
    kickstarter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5z"/><path d="M12 22V12"/></svg>'
  };

  function productIconSvg(productKey) {
    return PRODUCT_KEY_ICON_SVG[productKey] || CATEGORY_ICON_SVG.product;
  }

  function designTypeIconSvg(designType) {
    return DESIGN_TYPE_ICON_SVG[designType] || CATEGORY_ICON_SVG.design_type;
  }

  function channelIconSvg(channelId, node) {
    if (isChannelGroupNode(node)) return CHANNEL_ICON_SVG.amazon || CATEGORY_ICON_SVG.channel;
    var ch = String(channelId || '').toLowerCase();
    return CHANNEL_ICON_SVG[ch] || LISTING_CHANNEL_ICONS[ch] || CATEGORY_ICON_SVG.channel;
  }

  function socialPlatformIconSvg(platform) {
    return SOCIAL_PLATFORM_ICON_SVG[String(platform || '').toLowerCase()] || CATEGORY_ICON_SVG.social;
  }

  function automationSlotIconSvg(slot) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 11-12h-9l1-8z"/></svg>';
  }

  function promotionSlotIconSvg(slot) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2a4 4 0 0 0 4 4h10"/><path d="m7 15 4-9 4 9"/></svg>';
  }

  function heroSlotIconSvg(slot) {
    return CATEGORY_ICON_SVG.hero;
  }

  function creatorNameSlotIconSvg(slot) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 3h2v4M18 5h-4"/></svg>';
  }

  function designSlotChildIconSvg(slotIndex) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>';
  }

  function variantColorIconSvg(node) {
    var hex = node && node.metadata && node.metadata.color_hex;
    if (hex && /^#[0-9a-f]{3,8}$/i.test(hex)) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="' +
        escapeHtml(hex) + '" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5C14.5 8.5 12 3 12 3S9.5 8.5 8 9.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';
  }

  function eazEconomySkillIconSvg(node) {
    if (!node) return CATEGORY_ICON_SVG.eaz_economy;
    if (node.is_axis_gate) return EAZ_AXIS_ICON_SVG[node.axis] || CATEGORY_ICON_SVG.eaz_economy;
    var axis = node.axis || 'cost';
    return EAZ_AXIS_ICON_SVG[axis] || CATEGORY_ICON_SVG.eaz_economy;
  }

  /**
   * Inline SVG for tree cards when no product image / flag / size label is shown.
   * Returns empty string when an image URL should be used instead.
   */
  function skillIconSvgForNode(node, opts) {
    opts = opts || {};
    if (!node) return '';
    if (opts.type === 'eaz_economy') return eazEconomySkillIconSvg(node);
    if (nodeImageUrl(node)) return '';
    if (node.category === 'market') return '';
    if (node.category === 'variant' && node.metadata && node.metadata.variant_kind === 'size') return '';
    if (node.category === 'royalty') return royaltyTierIconSvg(royaltyTierFromNode(node));
    if (node.category === 'creation_limit') {
      var cm = creationLimitCardMediaOpts(node);
      if (cm && cm.iconSvg) return cm.iconSvg;
    }
    if (node.category === 'listing_limit') {
      var lm = listingLimitCardMediaOpts(node);
      if (lm && lm.iconSvg) return lm.iconSvg;
    }
    if (isDesignSlotLevelNode(node)) return designSlotLevelIconSvg(designSlotLevelFromNode(node));
    if (isDesignSlotChildNode(node)) return designSlotChildIconSvg(node.slot_index);
    if (node.category === 'product') return productIconSvg(node.product_key);
    if (node.category === 'design_type') return designTypeIconSvg(node.design_type);
    if (node.category === 'channel') return channelIconSvg(node.channel_id, node);
    if (node.category === 'automation') return automationSlotIconSvg(node.automation_slot);
    if (node.category === 'promotion') return promotionSlotIconSvg(node.promo_slot);
    if (node.category === 'hero') return heroSlotIconSvg(node.hero_slot);
    if (node.category === 'social') return socialPlatformIconSvg(node.social_platform);
    if (node.category === 'creator_name') return creatorNameSlotIconSvg(node.name_slot);
    if (node.category === 'variant') return variantColorIconSvg(node);
    return CATEGORY_ICON_SVG[node.category] || CATEGORY_ICON_SVG.product;
  }

  function skillInfoSlug(node, opts) {
    opts = opts || {};
    if (opts.type === 'eaz_economy') return String(node.skill_key || '').replace(/_/g, '-');
    if (node.product_key) return String(node.product_key);
    if (node.design_type) return String(node.design_type);
    if (isDesignSlotLevelNode(node)) return 'level-' + designSlotLevelFromNode(node);
    if (isDesignSlotChildNode(node)) return 'slot-' + (node.slot_index || '');
    if (isMarketContinentNode(node)) return 'continent-' + marketContinentCode(node).toLowerCase();
    if (isMarketCountryNode(node)) return 'country-' + marketFlagCode(node);
    if (node.category === 'royalty') return 'tier-' + royaltyTierFromNode(node);
    if (isCreationLimitParent(node)) return 'parent-' + (node.metadata && node.metadata.creation_limit_axis || 'axis');
    if (node.metadata && node.metadata.creation_limit_kind === 'tier') {
      return (node.metadata.creation_limit_axis || 'axis') + '-tier-' +
        (node.metadata.creation_limit_tier || '');
    }
    if (isListingLimitChannel(node)) return 'channel-' + (node.channel_id || 'channel');
    if (node.metadata && node.metadata.listing_limit_kind === 'tier') {
      return (node.channel_id || 'channel') + '-tier-' + (node.metadata.listing_tier_level || '');
    }
    if (isChannelGroupNode(node)) return 'group-' + String(node.node_key || '').replace(/:/g, '-');
    if (node.channel_id) return String(node.channel_id);
    if (node.social_platform) return String(node.social_platform);
    if (node.name_slot != null) return 'slot-' + node.name_slot;
    if (node.automation_slot != null) return 'slot-' + node.automation_slot;
    if (node.promo_slot != null) return 'slot-' + node.promo_slot;
    if (node.hero_slot != null) return 'slot-' + node.hero_slot;
    if (node.category === 'variant' && node.metadata) {
      if (node.metadata.variant_kind === 'color') {
        return 'color-' + (node.metadata.color_slug || node.metadata.color || 'color');
      }
      return 'size-' + (node.metadata.size || 'size');
    }
    return String(node.node_key || 'skill').replace(/:/g, '-').replace(/_/g, '-');
  }

  function skillInfoCategory(node, opts) {
    if (opts && opts.type === 'eaz_economy') return 'eaz_economy';
    return node && node.category ? node.category : 'product';
  }

  function skillInfoField(node, field, opts) {
    var cat = skillInfoCategory(node, opts);
    var slug = skillInfoSlug(node, opts);
    var specificKey = 'creator.journey.info.' + cat + '.' + slug + '.' + field;
    var genericKey = 'creator.journey.info.' + cat + '._generic.' + field;
    var specific = t(specificKey, '');
    if (specific && specific !== specificKey) return specific;
    var generic = t(genericKey, '');
    if (generic && generic !== genericKey) return generic;
    return skillInfoInlineFallback(node, field, opts);
  }

  function skillInfoInlineFallback(node, field, opts) {
    if (node && node.category === 'royalty' && field === 'body') {
      return royaltyInfoBenefitText(royaltyTierFromNode(node), royaltyPercentFromNode(node));
    }
    if (opts && opts.type === 'eaz_economy') {
      var sk = node && node.skill_key;
      if (field === 'title') return eazSkillLabel(sk, node && node.is_axis_gate);
      if (field === 'body') {
        return t('creator.journey.info.eaz_economy._generic.body',
          'EAZV Economy skills reduce costs, raise daily allowances, or increase caps once activated.');
      }
    }
    if (field === 'title') return nodeTitle(node);
    return t('creator.journey.info._fallback.body',
      'Unlock this skill in your Creator Journey to expand what you can create, publish, and earn.');
  }

  function skillInfoAriaLabel(node, opts) {
    return tpl('creator.journey.info_aria', 'About {{ name }}', {
      name: skillInfoField(node, 'title', opts)
    });
  }

  /**
   * Expandable parents: card click/tap expands accordion; info (i) opens modal.
   * Leaf / non-expandable skills: card click opens info modal (unless action button).
   * Locked cards still show info — preview what the skill does before unlocking.
   */
  function isExpandableNode(node) {
    if (!node) return false;
    if (node.category === 'product' && node.product_key === SOFTSTYLE_PRODUCT_KEY && node.unlocked) return true;
    if (node.category === 'variant' && node.metadata && node.metadata.variant_kind === 'color' && node.unlocked) {
      return true;
    }
    if (isMarketContinentNode(node) && node.unlocked) return true;
    if (isChannelGroupNode(node)) {
      return !!node.unlocked && channelChildNodes(node.node_key).length > 0;
    }
    if (isDesignSlotLevelNode(node)) {
      return !!node.unlocked && designSlotChildren(node).some(function (s) { return !s.unlocked; });
    }
    if (isCreationLimitParent(node)) {
      return creationLimitTierNodes(node).some(function (tier) { return !tier.unlocked; });
    }
    if (isListingLimitChannel(node)) {
      return !!node.unlocked && listingLimitTierNodes(node).some(function (tier) { return !tier.unlocked; });
    }
    return false;
  }

  function renderSkillInfoButton(nodeKey, label, opts) {
    opts = opts || {};
    var typeAttr = opts.type === 'eaz_economy' ? ' data-cj-skill-info-type="eaz_economy"' : '';
    return '<button type="button" class="cj-tree-card__info-btn" data-cj-skill-info-btn="' +
      escapeHtml(nodeKey) + '"' + typeAttr + ' aria-label="' + escapeHtml(label) + '">' +
      SKILL_INFO_ICON_SVG + '</button>';
  }

  function skillCardInfoChrome(node, expandableOverride, opts) {
    opts = opts || {};
    var expandable = expandableOverride != null ? expandableOverride : isExpandableNode(node);
    var label = skillInfoAriaLabel(node, opts);
    var key = opts.infoKey || (node && node.node_key) || '';
    var typeAttr = opts.type === 'eaz_economy' ? ' data-cj-skill-info-type="eaz_economy"' : '';
    if (expandable) {
      return {
        extraCls: ' has-info-btn',
        infoBtn: renderSkillInfoButton(key, label, opts),
        cardAttrs: ''
      };
    }
    return {
      extraCls: ' is-info-card',
      infoBtn: '',
      cardAttrs: ' data-cj-skill-info="' + escapeHtml(key) + '"' + typeAttr +
        ' role="button" tabindex="0" aria-label="' + escapeHtml(label) + '"'
    };
  }

  function nodeTitle(node) {
    if (node.metadata && node.metadata.creation_limit_kind === 'parent') {
      return multiTierParentShortTitle(node);
    }
    if (node.metadata && node.metadata.listing_limit_kind === 'channel') {
      return multiTierParentShortTitle(node);
    }
    if (isDesignSlotLevelNode(node)) {
      return designSlotLevelShortTitle(node);
    }
    if (node.metadata && node.metadata.royalty_percent != null) {
      return tpl('creator.journey.royalty_tier_title', '{{ pct }}% royalty', {
        pct: String(node.metadata.royalty_percent)
      });
    }
    if (node.metadata && node.metadata.continent_name) return String(node.metadata.continent_name);
    if (node.metadata && node.metadata.country_name) return String(node.metadata.country_name);
    if (node.metadata && node.metadata.title) {
      return String(node.metadata.title);
    }
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

  /** Continent card media: real EU/AQ flags via CDN; custom emblems for other continents. */
  function continentFlagHtml(node) {
    var code = marketContinentCode(node);
    var cdnCode = CONTINENT_FLAG_CDN[code];
    var src = cdnCode
      ? FLAG_CDN + cdnCode + '.svg'
      : (CONTINENT_FLAG_DATA[code] || (FLAG_CDN + 'un.svg'));
    return '<img class="cj-tree-card__flag" src="' + src + '" alt="" loading="lazy" width="48" height="36" data-continent="' +
      escapeHtml(code) + '">';
  }

  function continentMarkHtml(node) {
    return continentFlagHtml(node);
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

  function isJourneyStarterProductNode(node) {
    if (!node) return false;
    if (String(node.product_key || '') === SOFTSTYLE_PRODUCT_KEY) return true;
    var meta = node.metadata || {};
    if (meta.journey_starter === true) return true;
    if (meta.journey_starter === false) return false;
    var starterKeys = (journeyData && journeyData.starter && journeyData.starter.product_keys) || [];
    if (starterKeys.length) {
      var pk = String(node.product_key || '');
      return starterKeys.some(function (k) { return String(k) === pk; });
    }
    return productCatalogStatus(node) === 2;
  }

  /** True once the owner used their free starter pick — either a saved selection or any unlocked starter product. */
  function ownerHasStarterPick(nodes) {
    var sel = journeyData && journeyData.starter && journeyData.starter.selection;
    if (sel && sel.product_key) return true;
    return (nodes || []).some(function (n) {
      return isJourneyStarterProductNode(n) && n.unlocked;
    });
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
      if (isJourneyStarterProductNode(n)) {
        starter.push(n);
        return;
      }
      var s = productCatalogStatus(n);
      if (s === 1) preview.push(n);
      else offline.push(n);
    });
    return { starter: starter, preview: preview, offline: offline };
  }

  function splitUnlockedLocked(nodes) {
    var unlocked = [];
    var locked = [];
    (nodes || []).forEach(function (n) {
      if (n && n.unlocked) unlocked.push(n);
      else locked.push(n);
    });
    return { unlocked: unlocked, locked: locked };
  }

  function renderSectionHead(title, subtitle, hintHtml) {
    var sub = subtitle ? '<p class="cj-product-section__sub">' + escapeHtml(subtitle) + '</p>' : '';
    return '<div class="cj-product-section__head">' +
      '<h3 class="cj-product-section__title">' + escapeHtml(title) + '</h3>' +
      sub + (hintHtml || '') + '</div>';
  }

  function formatEazBadge(committed, cost, unlocked, freePick) {
    if (unlocked) {
      return t('creator.journey.unlocked', 'Unlocked');
    }
    if (freePick || cost <= 0) {
      return t('creator.journey.eaz_free', 'Free');
    }
    return tpl('creator.journey.eaz_badge', '{{ committed }}/{{ cost }} EAZV', {
      committed: String(Math.round(committed * 100) / 100),
      cost: String(Math.round(cost * 100) / 100)
    });
  }

  /**
   * Child nodes used for unlock-progress % on parent cards (only when parent is unlocked).
   * Product → colors; color → sizes; continent → countries; channel group → regions.
   */
  function unlockProgressChildren(node) {
    if (!node || !node.unlocked) return null;
    if (node.category === 'product' && node.product_key) {
      var colors = variantColorNodes(node.product_key);
      return colors.length ? colors : null;
    }
    if (node.category === 'variant' && node.metadata && node.metadata.variant_kind === 'color') {
      var sizes = variantSizeNodes(node.node_key);
      return sizes.length ? sizes : null;
    }
    if (isMarketContinentNode(node)) {
      var all = (journeyData && journeyData.nodes) || [];
      var countries = marketCountryNodesForContinent(all, node);
      return countries.length ? countries : null;
    }
    if (isChannelGroupNode(node)) {
      var regions = channelChildNodes(node.node_key);
      return regions.length ? regions : null;
    }
    if (isDesignSlotLevelNode(node)) {
      var slots = designSlotChildren(node);
      return slots.length ? slots : null;
    }
    return null;
  }

  function unlockProgressPct(children) {
    if (!children || !children.length) return null;
    var unlockedCount = 0;
    for (var i = 0; i < children.length; i++) {
      if (children[i].unlocked) unlockedCount++;
    }
    return Math.round((unlockedCount / children.length) * 100);
  }

  /** Unlocked badge, or horizontal progress bar when parent has unlockable children. */
  function renderUnlockedBadgeHtml(node) {
    var children = unlockProgressChildren(node);
    var pct = unlockProgressPct(children);
    if (pct == null) {
      return '<span class="cj-tree-card__eaz-badge">' +
        escapeHtml(t('creator.journey.unlocked', 'Unlocked')) + '</span>';
    }
    var label = tpl('creator.journey.unlocked_progress', 'Unlocked {{ pct }}%', {
      pct: String(pct)
    });
    return '<div class="cj-tree-card__progress" role="progressbar" aria-valuenow="' + pct +
      '" aria-valuemin="0" aria-valuemax="100" aria-label="' + escapeHtml(label) + '">' +
      '<div class="cj-tree-card__progress-track" aria-hidden="true">' +
      '<div class="cj-tree-card__progress-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<span class="cj-tree-card__progress-label">' + escapeHtml(label) + '</span>' +
      '</div>';
  }

  function nodeEffectiveCost(node) {
    if (node && node.free_pick_eligible) return 0;
    if (node && node.effective_cost_eaz != null && Number.isFinite(Number(node.effective_cost_eaz))) {
      return Number(node.effective_cost_eaz);
    }
    return Number(node && node.cost_eaz) || 0;
  }

  function renderTreeCardMedia(imgUrl) {
    return imgUrl
      ? '<img class="cj-tree-card__img" src="' + escapeHtml(imgUrl) + '" alt="" loading="lazy">'
      : '<div class="cj-tree-card__img cj-tree-card__img--placeholder" aria-hidden="true"></div>';
  }

  function renderTreeCardAction(node, title, canAct, cost, unlockReady, freePick) {
    if (!canAct) return '';
    if (!(cost > 0 || freePick || unlockReady)) return '';
    var btnLabel = (unlockReady || freePick)
      ? t('creator.journey.unlock_short', 'Unlock')
      : t('creator.journey.commit_eaz', 'Commit');
    var btnCls = 'cj-tree-card__action cj-btn' + (unlockReady || freePick ? ' is-unlock-ready' : '');
    if (unlockReady || freePick) {
      return '<button type="button" class="' + btnCls + '" data-cj-tree-action data-cj-action="unlock" data-cj-unlock="' +
        escapeHtml(node.node_key) + '">' + escapeHtml(btnLabel) + '</button>';
    }
    return '<button type="button" class="' + btnCls + '" data-cj-tree-action data-cj-action="commit" data-cj-commit="' +
      escapeHtml(node.node_key) + '" data-cj-commit-title="' + escapeHtml(title) + '">' +
      escapeHtml(btnLabel) + '</button>';
  }

  function levelRequiredLabel(node, opts) {
    opts = opts || {};
    var n = opts.requiredLevel != null
      ? Number(opts.requiredLevel)
      : (Number(node && (node.min_level != null ? node.min_level : node.mascot_min_level)) || 2);
    if (!Number.isFinite(n) || n < 1) n = 2;
    return tpl('creator.journey.level_required_n', 'Level {{ n }} required', { n: String(n) });
  }

  /** Shared lock badge for all unlock-tree cards (level / parent / prev tier / creator code). */
  function lockBadgeLabel(node, opts) {
    opts = opts || {};
    var reason = opts.lockReason != null ? opts.lockReason : (node && node.locked_reason);
    var levelLocked = !!opts.levelLocked || reason === 'level_required' ||
      (!reason && node && isLevelLocked(node));
    if (levelLocked || reason === 'level_required') {
      return levelRequiredLabel(node, opts);
    }
    if (reason === 'prev_tier_required') {
      return t('creator.journey.prev_tier_required_short', 'Previous tier required');
    }
    if (reason === 'prev_slot_required') {
      return t('creator.journey.prev_slot_required', 'Previous slot required');
    }
    if (reason === 'parent_required') {
      return t('creator.journey.parent_required_short', 'Parent required');
    }
    if (reason === 'creator_code_required') {
      return t('creator.journey.creator_code_required', 'Creator code required');
    }
    if (reason === 'eaz_economy_daily_required') {
      return t('creator.journey.eaz_economy_daily_required', 'Activate Daily in EAZV Economy');
    }
    if (reason === 'channel_required') {
      return t('creator.journey.channel_required_short', 'Unlock channel first');
    }
    return '';
  }

  function nodeVisuallyLocked(node, opts) {
    opts = opts || {};
    if (opts.seqBlocked) return true;
    if (!node || node.unlocked) return false;
    if (opts.levelLocked || isLevelLocked(node)) return true;
    return !!node.locked_reason;
  }

  function resolveCardLockOpts(node, opts) {
    opts = opts || {};
    var levelLocked = !!opts.levelLocked || isLevelLocked(node);
    var lockReason = opts.lockReason != null
      ? opts.lockReason
      : (opts.seqBlocked ? 'prev_slot_required' : (node && node.locked_reason) || null);
    if (levelLocked && !lockReason) lockReason = 'level_required';
    var visuallyLocked = nodeVisuallyLocked(node, {
      levelLocked: levelLocked,
      seqBlocked: !!opts.seqBlocked,
      lockReason: lockReason
    });
    var label = visuallyLocked
      ? lockBadgeLabel(node, {
          levelLocked: levelLocked,
          lockReason: lockReason,
          requiredLevel: opts.requiredLevel
        })
      : '';
    return {
      levelLocked: levelLocked,
      lockReason: lockReason,
      visuallyLocked: visuallyLocked,
      label: label,
      titleAttr: label ? ' title="' + escapeHtml(label) + '"' : ''
    };
  }

  function renderTreeCardFrame(node, opts) {
    opts = opts || {};
    var title = nodeTitle(node);
    var imgUrl = nodeImageUrl(node);
    var committed = Number(node.eaz_committed) || 0;
    var freePick = !!node.free_pick_eligible;
    var cost = nodeEffectiveCost(node);
    var levelLocked = !!opts.levelLocked;
    var lockReason = opts.lockReason != null ? opts.lockReason : (node && node.locked_reason);
    // Unlock-ready (free pick or fully funded): Unlock button is enough — no FREE / progress badge.
    var unlockReady = freePick || (cost > 0 && committed + 1e-9 >= cost);
    var hasAction = !!opts.hasAction;
    var frameCls = 'cj-tree-card__frame' + (hasAction ? ' cj-tree-card__frame--attached' : '');
    if (freePick) frameCls += ' is-free-pick';
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
    } else if (opts.iconSvg || skillIconSvgForNode(node)) {
      var iconSvgResolved = opts.iconSvg || skillIconSvgForNode(node);
      var limitLabelHtml = opts.limitLabel
        ? '<span class="cj-tree-card__limit-label">' + escapeHtml(opts.limitLabel) + '</span>'
        : '';
      mediaHtml = '<div class="cj-tree-card__icon-stack" aria-hidden="true">' +
        '<div class="cj-tree-card__icon">' + iconSvgResolved + '</div>' +
        limitLabelHtml + '</div>';
      mediaExtraCls = ' cj-tree-card__media--icon';
      if (opts.limitLabel) mediaExtraCls += ' cj-tree-card__media--has-limit';
    } else {
      mediaHtml = renderTreeCardMedia(imgUrl);
    }
    // Size cards: size only in viewer (no title).
    var titleHtml = opts.hideTitle
      ? ''
      : '<h4 class="cj-tree-card__title-in">' + escapeHtml(title) + '</h4>';
    var badgeHtml = '';
    var skipUnlockedBadge = node.metadata && (
      node.metadata.creation_limit_kind === 'parent' ||
      node.metadata.listing_limit_kind === 'channel'
    );
    if (node.unlocked && !skipUnlockedBadge) {
      badgeHtml = renderUnlockedBadgeHtml(node);
    } else if (levelLocked || lockReason) {
      // Locked: clear reason instead of misleading EAZV progress (e.g. 0/200).
      var lockLabel = lockBadgeLabel(node, {
        levelLocked: levelLocked,
        lockReason: lockReason,
        requiredLevel: opts.requiredLevel
      });
      if (lockLabel) {
        badgeHtml = '<span class="cj-tree-card__eaz-badge cj-tree-card__level-badge">' +
          escapeHtml(lockLabel) + '</span>';
      }
    } else if (!freePick && !unlockReady) {
      // Partial commits keep the EAZV progress badge (e.g. 0/80).
      badgeHtml = '<span class="cj-tree-card__eaz-badge">' +
        escapeHtml(formatEazBadge(committed, cost, false, false)) + '</span>';
    }
    return '<div class="' + frameCls + '">' +
      titleHtml +
      '<div class="cj-tree-card__media' + mediaExtraCls + '">' + mediaHtml + '</div>' +
      badgeHtml +
      statusHtml + '</div>';
  }

  function cardActionState(node, levelLocked) {
    if (node.category === 'creation_limit') {
      var isParent = node.metadata && node.metadata.creation_limit_kind === 'parent';
      if (isParent) {
        return {
          title: nodeTitle(node),
          canAct: false,
          cost: 0,
          catalogCost: 0,
          freePick: false,
          unlockReady: false,
          hasAction: false,
          actionHtml: ''
        };
      }
    }
    var freePick = !!node.free_pick_eligible;
    var cost = nodeEffectiveCost(node);
    var catalogCost = Number(node.cost_eaz) || 0;
    var title = nodeTitle(node);
    var isCreator = journeyData && journeyData.is_creator;
    var canAct = !node.unlocked && isCreator && !node.locked_reason && !levelLocked;
    var committed = Number(node.eaz_committed) || 0;
    var unlockReady = canAct && (freePick || (cost > 0 && committed + 1e-9 >= cost));
    var hasAction = canAct && (cost > 0 || freePick);
    return {
      title: title,
      canAct: canAct,
      cost: cost,
      catalogCost: catalogCost,
      freePick: freePick,
      unlockReady: unlockReady,
      hasAction: hasAction,
      actionHtml: renderTreeCardAction(node, title, canAct, cost, unlockReady, freePick)
    };
  }

  function renderProductTreeCard(node, opts) {
    opts = opts || {};
    var sectionLocked = !!opts.sectionLocked;
    var lock = resolveCardLockOpts(node, {
      levelLocked: sectionLocked || isLevelLocked(node),
      requiredLevel: opts.requiredLevel
    });
    var act = cardActionState(node, lock.levelLocked);
    var expandable = !!opts.expandable && !!node.unlocked;
    var expanded = expandable && !!expandedProductKeys[node.product_key || node.node_key];

    var cls = 'cj-tree-card cj-tree-card--product';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';

    var expandAttr = expandable
      ? ' data-cj-expand-product="' + escapeHtml(node.product_key || '') + '"'
      : '';
    var infoChrome = skillCardInfoChrome(node, expandable);

    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      expandAttr + infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason,
        requiredLevel: opts.requiredLevel
      }) +
      infoChrome.infoBtn +
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
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);
    var expandable = !!node.unlocked;
    var expanded = expandable && !!expandedColorKeys[node.node_key];
    var cls = 'cj-tree-card cj-tree-card--variant-color';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (act.freePick) cls += ' is-free-pick';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded is-selected';
    if (!node.unlocked) cls += ' is-locked-expand';

    var expandAttr = expandable
      ? ' data-cj-expand-color="' + escapeHtml(node.node_key) + '"'
      : '';
    var infoChrome = skillCardInfoChrome(node, expandable);

    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      expandAttr + infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason
      }) +
      infoChrome.infoBtn +
      act.actionHtml + '</div></article>';
  }

  function renderVariantSizeCard(node) {
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);
    var sizeLabel = (node.metadata && node.metadata.size) || nodeTitle(node);
    var cls = 'cj-tree-card cj-tree-card--variant-size';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked is-selected';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (act.freePick) cls += ' is-free-pick';
    var infoChrome = skillCardInfoChrome(node, false);

    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        sizeLabel: sizeLabel,
        hideTitle: true,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason
      }) +
      infoChrome.infoBtn +
      act.actionHtml + '</div></article>';
  }

  function renderCarouselShell(trackHtml) {
    return '<div class="cj-product-carousel" data-cj-carousel>' +
      '<button type="button" class="cj-product-carousel__nav cj-product-carousel__nav--prev" data-cj-carousel-prev hidden aria-hidden="true" tabindex="-1" aria-label="' +
      escapeHtml(t('creator.journey.carousel_prev', 'Previous')) + '">‹</button>' +
      '<div class="cj-product-carousel__track" data-cj-carousel-track>' + trackHtml + '</div>' +
      '<button type="button" class="cj-product-carousel__nav cj-product-carousel__nav--next" data-cj-carousel-next hidden aria-hidden="true" tabindex="-1" aria-label="' +
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

    var freeColorHint = colors.some(function (c) { return c.free_pick_eligible; })
      ? '<p class="cj-variant-panel__hint">' +
        escapeHtml(t('creator.journey.free_pick_color_hint', 'One free color pick — choose any color. Extra colors cost EAZV.')) +
        '</p>'
      : '';

    var colorCards = colors.map(renderVariantColorCard).join('');
    var sizeHtml = '';
    colors.forEach(function (colorNode) {
      if (!(colorNode.unlocked && expandedColorKeys[colorNode.node_key])) return;
      var sizes = variantSizeNodes(colorNode.node_key);
      if (!sizes.length) return;
      var freeSizeHint = sizes.some(function (s) { return s.free_pick_eligible; })
        ? '<p class="cj-variant-panel__hint">' +
          escapeHtml(t('creator.journey.free_pick_size_hint', 'One free size pick for this color — extra sizes cost EAZV.')) +
          '</p>'
        : '';
      sizeHtml += '<div class="cj-variant-size-branch" data-cj-size-panel="' + escapeHtml(colorNode.node_key) + '">' +
        '<div class="cj-variant-connector cj-variant-connector--size" aria-hidden="true"></div>' +
        '<div class="cj-variant-size-panel">' +
        '<h5 class="cj-variant-size-panel__title">' + escapeHtml(t('creator.journey.size_variants', 'Sizes')) +
        ' · ' + escapeHtml(nodeTitle(colorNode)) + '</h5>' +
        freeSizeHint +
        renderCarouselShell(sizes.map(renderVariantSizeCard).join('')) +
        '</div></div>';
    });

    return '<div class="cj-variant-branch" data-cj-variant-branch="' + escapeHtml(productNode.product_key) + '">' +
      '<div class="cj-variant-connector" data-cj-connector-from="product" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-variant-panel="' + escapeHtml(productNode.product_key) + '">' +
      '<h4 class="cj-variant-panel__title">' + escapeHtml(t('creator.journey.color_variants', 'Color variants')) + '</h4>' +
      freeColorHint +
      renderCarouselShell(colorCards) +
      sizeHtml +
      '</div></div>';
  }

  function renderCarouselSection(title, subtitle, nodes, sectionLocked, opts) {
    opts = opts || {};
    if (!nodes.length) return '';
    var freeProductHint = !sectionLocked && !opts.skipFreeHint && nodes.some(function (n) { return n.free_pick_eligible; })
      ? '<p class="cj-product-section__hint">' +
        escapeHtml(t('creator.journey.free_pick_product_hint', 'One free starter product — pick any. Extra products cost EAZV.')) +
        '</p>'
      : '';
    var cardsHtml = '';
    var expandHtml = '';
    nodes.forEach(function (n) {
      var expandable = n.product_key === SOFTSTYLE_PRODUCT_KEY;
      cardsHtml += renderProductTreeCard(n, {
        sectionLocked: sectionLocked,
        expandable: expandable,
        requiredLevel: opts.requiredLevel
      });
      if (expandable && n.unlocked && expandedProductKeys[n.product_key]) {
        expandHtml += renderSoftstyleExpandPanel(n);
      }
    });
    var sectionCls = 'cj-product-section' + (sectionLocked ? ' is-locked' : '') +
      (opts.unlockedRow ? ' cj-unlocked-skills' : '');
    return '<section class="' + sectionCls + '">' +
      renderSectionHead(title, subtitle, freeProductHint) +
      renderCarouselShell(cardsHtml) +
      expandHtml + '</section>';
  }

  function renderProductTree(nodes) {
    var split = splitProductNodes(nodes);
    var dispLv = displayLevel();
    var unlocked = (nodes || []).filter(function (n) { return n.unlocked; });
    var lockedStarter = split.starter.filter(function (n) { return !n.unlocked; });
    var lockedNonStarter = split.preview.concat(split.offline).filter(function (n) { return !n.unlocked; });

    // Once the free starter pick is used, remaining locked starters move into the
    // Level 3 row instead of staying in the always-free "Starter Products" carousel.
    // Softstyle stays in Starter Products regardless (color → size drill-down stays up front).
    if (lockedStarter.length && ownerHasStarterPick(nodes)) {
      var demoted = lockedStarter.filter(function (n) { return n.product_key !== SOFTSTYLE_PRODUCT_KEY; });
      lockedStarter = lockedStarter.filter(function (n) { return n.product_key === SOFTSTYLE_PRODUCT_KEY; });
      lockedNonStarter = lockedNonStarter.concat(demoted.map(function (n) {
        return Object.assign({}, n, { min_level: 3 });
      }));
    }

    var html = '<div class="cj-product-sections">';
    if (unlocked.length) {
      html += renderCarouselSection(
        t('creator.journey.unlocked_skills', 'Unlocked'),
        '',
        unlocked,
        false,
        { unlockedRow: true, skipFreeHint: true }
      );
    }
    if (lockedStarter.length) {
      html += renderCarouselSection(
        t('creator.journey.starter_products', 'Starter Products'),
        t('creator.journey.available_skills', 'Available'),
        lockedStarter,
        false
      );
    }
    var levelRows = groupNodesByLevel(lockedNonStarter);
    if (levelRows.length) {
      html += '<div class="cj-tree-levels">' + levelRows.map(function (row) {
        var rowLocked = row.level > dispLv;
        return '<section class="cj-level-row' + (rowLocked ? ' is-locked' : '') + '" data-level="' + row.level + '">' +
          '<div class="cj-level-row__label">' +
          escapeHtml(tpl('creator.journey.level_row', 'Level {{ n }}', { n: String(row.level) })) +
          '</div>' +
          '<div class="cj-level-row__cards">' +
          row.nodes.map(function (n) {
            return renderProductTreeCard(n, {
              sectionLocked: rowLocked,
              expandable: n.product_key === SOFTSTYLE_PRODUCT_KEY,
              requiredLevel: row.level
            });
          }).join('') +
          '</div></section>';
      }).join('') + '</div>';
    }
    html += '</div>';
    if (!unlocked.length && !lockedStarter.length && !levelRows.length) {
      html = '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    return html;
  }

  function renderMarketCard(node, opts) {
    opts = opts || {};
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);
    var isContinent = isMarketContinentNode(node);
    var expandable = isContinent && !!node.unlocked;
    var contCode = isContinent ? marketContinentCode(node) : '';
    var expanded = expandable && !!expandedContinentKeys[contCode];
    var cls = 'cj-tree-card cj-tree-card--market';
    if (isContinent) cls += ' cj-tree-card--market-continent';
    else cls += ' cj-tree-card--market-country';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (act.freePick) cls += ' is-free-pick';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';

    var expandAttr = expandable
      ? ' data-cj-expand-continent="' + escapeHtml(contCode) + '" role="button" tabindex="0" aria-expanded="' +
        (expanded ? 'true' : 'false') + '"'
      : '';
    var infoChrome = skillCardInfoChrome(node, expandable);

    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      expandAttr + infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        flagMedia: !isContinent,
        continentMedia: isContinent,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason
      }) +
      infoChrome.infoBtn +
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

    var freeCountryHint = countries.some(function (c) { return c.free_pick_eligible; })
      ? '<p class="cj-variant-panel__hint">' +
        escapeHtml(t('creator.journey.free_pick_country_hint', 'One free country pick for this continent — choose any. Extra countries cost EAZV.')) +
        '</p>'
      : '';

    return '<div class="cj-variant-branch cj-market-branch" data-cj-market-branch="' + escapeHtml(cont) + '">' +
      '<div class="cj-variant-connector" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-market-panel="' + escapeHtml(cont) + '">' +
      '<h4 class="cj-variant-panel__title">' +
      escapeHtml(t('creator.journey.market_countries_title', 'Countries')) +
      ' · ' + escapeHtml(nodeTitle(continentNode)) + '</h4>' +
      freeCountryHint +
      renderCarouselShell(countries.map(function (n) { return renderMarketCard(n); }).join('')) +
      '</div></div>';
  }

  function renderMarketContinentRow(title, continents, allMarketNodes, opts) {
    opts = opts || {};
    if (!continents.length) return '';
    var freeContinentHint = continents.some(function (n) { return n.free_pick_eligible; })
      ? '<p class="cj-product-section__hint">' +
        escapeHtml(t('creator.journey.free_pick_continent_hint', 'One free continent — pick any. Extra continents cost EAZV.')) +
        '</p>'
      : '';
    var cardsHtml = '';
    var expandHtml = '';
    continents.forEach(function (n) {
      cardsHtml += renderMarketCard(n);
      if (n.unlocked && expandedContinentKeys[marketContinentCode(n)]) {
        expandHtml += renderContinentExpandPanel(n, allMarketNodes);
      }
    });
    var sectionCls = 'cj-product-section' + (opts.unlockedRow ? ' cj-unlocked-skills' : '');
    return '<section class="' + sectionCls + '">' +
      renderSectionHead(title, '', freeContinentHint) +
      renderCarouselShell(cardsHtml) +
      expandHtml + '</section>';
  }

  function renderMarketTree(nodes) {
    var continents = marketContinentNodes(nodes);
    var hint = '<p class="cj-market-hint">' +
      escapeHtml(t('creator.journey.market_hint', 'Unlock a continent first, then expand it to unlock individual countries.')) +
      '</p>';

    if (!continents.length) {
      // Fallback: flat country list if catalog not yet migrated
      var flat = (nodes || []).filter(isMarketCountryNode);
      if (!flat.length) {
        return '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
      }
      var flatSplit = splitUnlockedLocked(flat);
      var htmlFlat = hint;
      if (flatSplit.unlocked.length) {
        htmlFlat += '<section class="cj-product-section cj-unlocked-skills">' +
          renderSectionHead(t('creator.journey.unlocked_skills', 'Unlocked'), '', '') +
          renderCarouselShell(flatSplit.unlocked.map(function (n) { return renderMarketCard(n); }).join('')) +
          '</section>';
      }
      if (flatSplit.locked.length) {
        htmlFlat += '<section class="cj-product-section">' +
          renderSectionHead(t('creator.journey.available_skills', 'Available'), '', '') +
          renderCarouselShell(flatSplit.locked.map(function (n) { return renderMarketCard(n); }).join('')) +
          '</section>';
      }
      return htmlFlat;
    }

    var unlocked = continents.filter(function (n) { return n.unlocked; });
    var locked = continents.filter(function (n) { return !n.unlocked; });
    var html = hint;
    html += '<div class="cj-product-sections">';
    html += renderMarketContinentRow(
      t('creator.journey.unlocked_skills', 'Unlocked'),
      unlocked,
      nodes,
      { unlockedRow: true }
    );
    html += renderMarketContinentRow(
      t('creator.journey.market_continents_title', 'Continents'),
      locked,
      nodes,
      {}
    );
    html += '</div>';
    return html;
  }

  function renderGenericSkillTree(nodes) {
    var list = nodes || [];
    var category = list[0] && list[0].category;
    // Royalty tiers chain via parent_key (sequence), not a UI nest — show every tier.
    var showSequential = category === 'royalty';
    var visible = showSequential
      ? list.slice().sort(function (a, b) {
          return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
            (Number(a.min_level) || 0) - (Number(b.min_level) || 0);
        })
      : list.filter(function (n) { return !n.parent_key; });
    var split = splitUnlockedLocked(visible);
    var dispLv = displayLevel();
    var html = '';

    if (split.unlocked.length) {
      html += '<section class="cj-product-section cj-unlocked-skills">' +
        renderSectionHead(t('creator.journey.unlocked_skills', 'Unlocked'), '', '') +
        renderCarouselShell(split.unlocked.map(renderTreeCard).join('')) +
        '</section>';
    }

    if (showSequential) {
      if (split.locked.length) {
        html += '<section class="cj-product-section">' +
          renderSectionHead(t('creator.journey.available_skills', 'Available'), '', '') +
          renderCarouselShell(split.locked.map(renderTreeCard).join('')) +
          '</section>';
      } else if (!split.unlocked.length) {
        html += '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
      }
      return html;
    }

    var rows = groupNodesByLevel(split.locked);
    if (!rows.length) {
      if (!split.unlocked.length) {
        html += '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
      }
      return html;
    }

    html += '<div class="cj-tree-levels">' + rows.map(function (row) {
      var rowLocked = row.level > dispLv;
      return '<section class="cj-level-row' + (rowLocked ? ' is-locked' : '') + '" data-level="' + row.level + '">' +
        '<div class="cj-level-row__label">' + escapeHtml(tpl('creator.journey.level_row', 'Level {{ n }}', { n: String(row.level) })) + '</div>' +
        '<div class="cj-level-row__cards">' + row.nodes.map(renderTreeCard).join('') + '</div></section>';
    }).join('') + '</div>';
    return html;
  }

  function isChannelGroupNode(node) {
    if (!node || node.category !== 'channel') return false;
    if (node.metadata && node.metadata.channel_kind === 'group') return true;
    return String(node.node_key || '') === 'channel:amazon' && !node.parent_key;
  }

  function channelChildNodes(parentKey) {
    var all = (journeyData && journeyData.nodes) || [];
    return all.filter(function (n) {
      return n.category === 'channel' && n.parent_key === parentKey;
    }).sort(function (a, b) {
      return (Number(a.min_level) || 0) - (Number(b.min_level) || 0) ||
        nodeTitle(a).localeCompare(nodeTitle(b), undefined, { sensitivity: 'base' });
    });
  }

  function renderChannelCard(node, opts) {
    opts = opts || {};
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);
    var isGroup = isChannelGroupNode(node);
    var children = isGroup ? channelChildNodes(node.node_key) : [];
    var expandable = isGroup && !!node.unlocked && children.length > 0;
    var expanded = expandable && !!expandedChannelKeys[node.node_key];
    var cls = 'cj-tree-card cj-tree-card--channel';
    if (isGroup) cls += ' cj-tree-card--channel-group';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (act.freePick) cls += ' is-free-pick';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';

    var expandAttr = expandable
      ? ' data-cj-expand-channel="' + escapeHtml(node.node_key) + '" role="button" tabindex="0" aria-expanded="' +
        (expanded ? 'true' : 'false') + '"'
      : '';
    var infoChrome = skillCardInfoChrome(node, expandable);

    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      expandAttr + infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason
      }) +
      infoChrome.infoBtn +
      act.actionHtml + '</div></article>';
  }

  function renderChannelExpandPanel(parentNode) {
    if (!parentNode || !parentNode.unlocked) return '';
    if (!expandedChannelKeys[parentNode.node_key]) return '';
    var children = channelChildNodes(parentNode.node_key);
    if (!children.length) {
      return '<div class="cj-variant-branch cj-channel-branch">' +
        '<div class="cj-variant-connector" aria-hidden="true"></div>' +
        '<div class="cj-variant-panel">' +
        '<p class="cj-muted">' + escapeHtml(t('creator.journey.channel_regions_empty', 'No regional channels yet.')) +
        '</p></div></div>';
    }
    return '<div class="cj-variant-branch cj-channel-branch" data-cj-channel-branch="' +
      escapeHtml(parentNode.node_key) + '">' +
      '<div class="cj-variant-connector" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-channel-panel="' + escapeHtml(parentNode.node_key) + '">' +
      '<h4 class="cj-variant-panel__title">' +
      escapeHtml(t('creator.journey.channel_regions_title', 'Regions')) +
      ' · ' + escapeHtml(nodeTitle(parentNode)) + '</h4>' +
      renderCarouselShell(children.map(function (n) { return renderChannelCard(n); }).join('')) +
      '</div></div>';
  }

  function renderChannelRow(title, nodes, opts) {
    opts = opts || {};
    if (!nodes.length) return '';
    var cardsHtml = '';
    var expandHtml = '';
    nodes.forEach(function (n) {
      cardsHtml += renderChannelCard(n);
      if (isChannelGroupNode(n) && n.unlocked && expandedChannelKeys[n.node_key]) {
        expandHtml += renderChannelExpandPanel(n);
      }
    });
    var sectionCls = 'cj-product-section' + (opts.unlockedRow ? ' cj-unlocked-skills' : '');
    return '<section class="' + sectionCls + '">' +
      renderSectionHead(title, '', '') +
      renderCarouselShell(cardsHtml) +
      expandHtml + '</section>';
  }

  function renderChannelTree(nodes) {
    var topLevel = (nodes || []).filter(function (n) { return !n.parent_key; });
    var split = splitUnlockedLocked(topLevel);
    if (!topLevel.length) {
      return '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    var html = '<div class="cj-product-sections">';
    html += renderChannelRow(
      t('creator.journey.unlocked_skills', 'Unlocked'),
      split.unlocked,
      { unlockedRow: true }
    );
    html += renderChannelRow(
      t('creator.journey.available_skills', 'Available'),
      split.locked,
      {}
    );
    html += '</div>';
    return html;
  }

  function isDesignSlotLevelNode(node) {
    if (!node || node.category !== 'design_slot') return false;
    if (node.metadata && node.metadata.design_slot_kind === 'level') return true;
    return String(node.node_key || '').indexOf('design_slot_level:') === 0;
  }

  function isDesignSlotChildNode(node) {
    if (!node || node.category !== 'design_slot') return false;
    if (isDesignSlotLevelNode(node)) return false;
    return node.slot_index != null || String(node.node_key || '').indexOf('design_slot:') === 0;
  }

  function designSlotChildren(levelNode) {
    var parentKey = levelNode && levelNode.node_key;
    if (!parentKey) return [];
    var all = (journeyData && journeyData.nodes) || [];
    return all.filter(function (n) {
      return isDesignSlotChildNode(n) && n.parent_key === parentKey;
    }).sort(function (a, b) {
      return (Number(a.slot_index) || 0) - (Number(b.slot_index) || 0);
    });
  }

  function nextActivatableSlotIndex(slots) {
    for (var i = 0; i < (slots || []).length; i++) {
      if (!slots[i].unlocked) return Number(slots[i].slot_index) || 0;
    }
    return 0;
  }

  function renderDesignSlotCard(node, opts) {
    opts = opts || {};
    var seqBlocked = !!opts.seqBlocked;
    var lock = resolveCardLockOpts(node, { seqBlocked: seqBlocked });
    var act = cardActionState(node, lock.levelLocked);
    var isLevel = isDesignSlotLevelNode(node);
    var children = isLevel ? designSlotChildren(node) : [];
    var expandable = isLevel && !!node.unlocked && children.some(function (s) { return !s.unlocked; });
    var expanded = expandable && !!expandedSlotLevelKeys[node.node_key];
    var cls = 'cj-tree-card cj-tree-card--design-slot';
    if (isLevel) cls += ' cj-tree-card--design-slot-level';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady && !seqBlocked) cls += ' is-ready';
    if (act.hasAction && !seqBlocked) cls += ' has-action';
    if (act.freePick && !seqBlocked) cls += ' is-free-pick';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';

    var expandAttr = expandable
      ? ' data-cj-expand-slot-level="' + escapeHtml(node.node_key) + '" role="button" tabindex="0" aria-expanded="' +
        (expanded ? 'true' : 'false') + '"'
      : '';

    var actionHtml = seqBlocked ? '' : act.actionHtml;
    var levelMedia = isLevel ? parentLimitMediaOpts(node) : null;
    var infoChrome = skillCardInfoChrome(node, expandable);
    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      expandAttr + infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: !!actionHtml,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason,
        iconSvg: levelMedia ? levelMedia.iconSvg : null,
        limitLabel: levelMedia ? levelMedia.limitLabel : ''
      }) +
      infoChrome.infoBtn +
      actionHtml + '</div></article>';
  }

  function renderDesignSlotExpandPanel(levelNode) {
    if (!levelNode || !levelNode.unlocked) return '';
    if (!expandedSlotLevelKeys[levelNode.node_key]) return '';
    var slots = designSlotChildren(levelNode).filter(function (s) { return !s.unlocked; });
    if (!slots.length) {
      return '<div class="cj-variant-branch cj-slot-level-branch">' +
        '<div class="cj-variant-connector" aria-hidden="true"></div>' +
        '<div class="cj-variant-panel">' +
        '<p class="cj-muted">' + escapeHtml(t('creator.journey.design_slots_bucket_complete', 'All slots in this level are unlocked.')) +
        '</p></div></div>';
    }
    var nextIdx = nextActivatableSlotIndex(designSlotChildren(levelNode));
    return '<div class="cj-variant-branch cj-slot-level-branch" data-cj-slot-level-branch="' +
      escapeHtml(levelNode.node_key) + '">' +
      '<div class="cj-variant-connector" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-slot-level-panel="' + escapeHtml(levelNode.node_key) + '">' +
      '<h4 class="cj-variant-panel__title">' +
      escapeHtml(t('creator.journey.design_slots_inactive_title', 'Available slots')) +
      ' · ' + escapeHtml(nodeTitle(levelNode)) + '</h4>' +
      '<p class="cj-variant-panel__hint">' +
      escapeHtml(t('creator.journey.design_slots_sequential_hint', 'Unlock slots in order — only the next slot can be activated.')) +
      '</p>' +
      renderCarouselShell(slots.map(function (n) {
        return renderDesignSlotCard(n, {
          seqBlocked: nextIdx > 0 && Number(n.slot_index) !== nextIdx
        });
      }).join('')) +
      '</div></div>';
  }

  function renderDesignSlotRow(title, nodes, opts) {
    opts = opts || {};
    if (!nodes.length) return '';
    var cardsHtml = '';
    var expandHtml = '';
    nodes.forEach(function (n) {
      cardsHtml += renderDesignSlotCard(n);
      if (isDesignSlotLevelNode(n) && n.unlocked && expandedSlotLevelKeys[n.node_key]) {
        expandHtml += renderDesignSlotExpandPanel(n);
      }
    });
    var sectionCls = 'cj-product-section' + (opts.unlockedRow ? ' cj-unlocked-skills' : '');
    return '<section class="' + sectionCls + '">' +
      renderSectionHead(title, '', '') +
      renderCarouselShell(cardsHtml) +
      expandHtml + '</section>';
  }

  function sortDesignSlotLevels(nodes, descending) {
    return (nodes || []).slice().sort(function (a, b) {
      var diff = designSlotLevelFromNode(a) - designSlotLevelFromNode(b);
      return descending ? -diff : diff;
    });
  }

  function renderDesignSlotTree(nodes) {
    var levels = sortDesignSlotLevels((nodes || []).filter(isDesignSlotLevelNode), false);
    if (!levels.length) {
      return '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    var split = splitUnlockedLocked(levels);
    split.unlocked = sortDesignSlotLevels(split.unlocked, true);
    var html = '<div class="cj-product-sections">';
    html += renderDesignSlotRow(
      t('creator.journey.unlocked_skills', 'Unlocked'),
      split.unlocked,
      { unlockedRow: true }
    );
    html += renderDesignSlotRow(
      t('creator.journey.available_skills', 'Available'),
      split.locked,
      {}
    );
    html += '</div>';
    return html;
  }

  function isCreationLimitParent(node) {
    return node && node.category === 'creation_limit' &&
      node.metadata && node.metadata.creation_limit_kind === 'parent';
  }

  function isListingLimitChannel(node) {
    return node && node.category === 'listing_limit' &&
      node.metadata && node.metadata.listing_limit_kind === 'channel';
  }

  function creationLimitTierNodes(parentNode) {
    var axis = parentNode && parentNode.metadata && parentNode.metadata.creation_limit_axis;
    if (!axis) return [];
    var all = (journeyData && journeyData.nodes) || [];
    return all.filter(function (n) {
      return n.category === 'creation_limit' &&
        n.metadata && n.metadata.creation_limit_kind === 'tier' &&
        n.metadata.creation_limit_axis === axis;
    }).sort(function (a, b) {
      return (Number(a.metadata.creation_limit_tier) || 0) - (Number(b.metadata.creation_limit_tier) || 0);
    });
  }

  function listingLimitTierNodes(channelNode) {
    var ch = channelNode && channelNode.channel_id;
    if (!ch) return [];
    var all = (journeyData && journeyData.nodes) || [];
    return all.filter(function (n) {
      return n.category === 'listing_limit' &&
        n.metadata && n.metadata.listing_limit_kind === 'tier' &&
        n.channel_id === ch;
    }).sort(function (a, b) {
      return (Number(a.metadata.listing_tier_level) || 0) - (Number(b.metadata.listing_tier_level) || 0);
    });
  }

  function renderCreationLimitCard(node) {
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);
    var isParent = isCreationLimitParent(node);
    var tiers = isParent ? creationLimitTierNodes(node) : [];
    var lockedTiers = tiers.filter(function (t) { return !t.unlocked; });
    var expandable = isParent && lockedTiers.length > 0;
    var expanded = expandable && !!expandedCreationLimitKeys[node.node_key];
    var isTier = node.metadata && node.metadata.creation_limit_kind === 'tier';
    var cls = 'cj-tree-card cj-tree-card--creation-limit';
    if (isParent) cls += ' cj-tree-card--creation-limit-parent';
    if (isTier) cls += ' cj-tree-card--creation-limit-tier';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';
    var expandAttr = expandable
      ? ' data-cj-expand-creation-limit="' + escapeHtml(node.node_key) + '" role="button" tabindex="0" aria-expanded="' +
        (expanded ? 'true' : 'false') + '"'
      : '';
    var cardMedia = creationLimitCardMediaOpts(node);
    var infoChrome = skillCardInfoChrome(node, expandable);
    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      expandAttr + infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason,
        iconSvg: cardMedia ? cardMedia.iconSvg : null,
        limitLabel: cardMedia ? cardMedia.limitLabel : ''
      }) +
      infoChrome.infoBtn +
      act.actionHtml + '</div></article>';
  }

  function renderCreationLimitExpandPanel(parentNode) {
    if (!parentNode || !expandedCreationLimitKeys[parentNode.node_key]) return '';
    var tiers = creationLimitTierNodes(parentNode);
    var lockedTiers = tiers.filter(function (t) { return !t.unlocked; });
    if (!lockedTiers.length) return '';
    return '<div class="cj-variant-branch cj-creation-limit-branch" data-cj-creation-limit-branch="' +
      escapeHtml(parentNode.node_key) + '">' +
      '<div class="cj-variant-connector" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-creation-limit-panel="' + escapeHtml(parentNode.node_key) + '">' +
      '<h4 class="cj-variant-panel__title">' + escapeHtml(nodeTitle(parentNode)) + '</h4>' +
      renderCarouselShell(lockedTiers.map(renderCreationLimitCard).join('')) +
      '</div></div>';
  }

  function renderCreationLimitTree(nodes) {
    var parents = (nodes || []).filter(isCreationLimitParent);
    if (!parents.length) {
      return '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    var cardsHtml = '';
    var expandHtml = '';
    parents.forEach(function (n) {
      cardsHtml += renderCreationLimitCard(n);
      if (expandedCreationLimitKeys[n.node_key]) {
        expandHtml += renderCreationLimitExpandPanel(n);
      }
    });
    return '<div class="cj-product-sections">' +
      '<section class="cj-product-section cj-unlocked-skills cj-creation-limit-row">' +
      renderSectionHead(t('creator.journey.creation_limits_title', 'Creation Limits'), '', '') +
      '<div class="cj-creation-limit-parents">' + renderCarouselShell(cardsHtml) + '</div>' +
      expandHtml + '</section></div>';
  }

  function renderListingLimitCard(node) {
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);
    var isChannel = isListingLimitChannel(node);
    var tiers = isChannel ? listingLimitTierNodes(node) : [];
    var lockedTiers = tiers.filter(function (t) { return !t.unlocked; });
    var expandable = isChannel && !!node.unlocked && lockedTiers.length > 0;
    var expanded = expandable && !!expandedListingLimitKeys[node.node_key];
    var isTier = node.metadata && node.metadata.listing_limit_kind === 'tier';
    var cls = 'cj-tree-card cj-tree-card--listing-limit';
    if (isChannel) cls += ' cj-tree-card--listing-channel';
    if (isTier) cls += ' cj-tree-card--listing-limit-tier';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (expandable) cls += ' is-expandable';
    if (expanded) cls += ' is-expanded';
    var expandAttr = expandable
      ? ' data-cj-expand-listing-limit="' + escapeHtml(node.node_key) + '" role="button" tabindex="0" aria-expanded="' +
        (expanded ? 'true' : 'false') + '"'
      : '';
    var cardMedia = listingLimitCardMediaOpts(node);
    var infoChrome = skillCardInfoChrome(node, expandable);
    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      expandAttr + infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason,
        iconSvg: cardMedia ? cardMedia.iconSvg : null,
        limitLabel: cardMedia ? cardMedia.limitLabel : ''
      }) +
      infoChrome.infoBtn +
      act.actionHtml + '</div></article>';
  }

  function renderListingLimitExpandPanel(channelNode) {
    if (!channelNode || !channelNode.unlocked || !expandedListingLimitKeys[channelNode.node_key]) return '';
    var tiers = listingLimitTierNodes(channelNode);
    var lockedTiers = tiers.filter(function (t) { return !t.unlocked; });
    if (!lockedTiers.length) return '';
    return '<div class="cj-variant-branch cj-listing-limit-branch" data-cj-listing-limit-branch="' +
      escapeHtml(channelNode.node_key) + '">' +
      '<div class="cj-variant-connector" aria-hidden="true"></div>' +
      '<div class="cj-variant-panel" data-cj-listing-limit-panel="' + escapeHtml(channelNode.node_key) + '">' +
      '<h4 class="cj-variant-panel__title">' + escapeHtml(nodeTitle(channelNode)) + '</h4>' +
      renderCarouselShell(lockedTiers.map(renderListingLimitCard).join('')) +
      '</div></div>';
  }

  function renderListingLimitTree(nodes) {
    var channels = (nodes || []).filter(isListingLimitChannel);
    var split = splitUnlockedLocked(channels);
    if (!channels.length) {
      return '<p class="cj-muted">' + escapeHtml(t('creator.journey.starter_empty', 'No items in this category yet.')) + '</p>';
    }
    var html = '<div class="cj-product-sections">';
    if (split.unlocked.length) {
      var cardsHtml = '';
      var expandHtml = '';
      split.unlocked.forEach(function (n) {
        cardsHtml += renderListingLimitCard(n);
        if (expandedListingLimitKeys[n.node_key]) {
          expandHtml += renderListingLimitExpandPanel(n);
        }
      });
      html += '<section class="cj-product-section cj-unlocked-skills">' +
        renderSectionHead(t('creator.journey.unlocked_skills', 'Unlocked'), '', '') +
        renderCarouselShell(cardsHtml) + expandHtml + '</section>';
    }
    if (split.locked.length) {
      html += '<section class="cj-product-section">' +
        renderSectionHead(t('creator.journey.available_skills', 'Available'), '', '') +
        renderCarouselShell(split.locked.map(renderListingLimitCard).join('')) +
        '</section>';
    }
    html += '</div>';
    return html;
  }

  function renderRoyaltyCard(node) {
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);
    var tier = royaltyTierFromNode(node);
    var infoChrome = skillCardInfoChrome(node, false);

    var cls = 'cj-tree-card cj-tree-card--royalty';
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (act.freePick) cls += ' is-free-pick';

    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason,
        iconSvg: royaltyTierIconSvg(tier)
      }) +
      infoChrome.infoBtn +
      act.actionHtml + '</div></article>';
  }

  function renderTreeCard(node) {
    if (node.category === 'market') return renderMarketCard(node);
    if (node.category === 'channel') return renderChannelCard(node);
    if (node.category === 'design_slot') return renderDesignSlotCard(node);
    if (node.category === 'royalty') return renderRoyaltyCard(node);
    if (node.category === 'creation_limit') return renderCreationLimitCard(node);
    if (node.category === 'listing_limit') return renderListingLimitCard(node);
    var lock = resolveCardLockOpts(node);
    var act = cardActionState(node, lock.levelLocked);

    var cls = 'cj-tree-card cj-tree-card--' + String(node.category || 'skill').replace(/_/g, '-');
    if (lock.visuallyLocked) cls += ' is-level-locked';
    if (node.unlocked) cls += ' is-unlocked';
    if (act.unlockReady) cls += ' is-ready';
    if (act.hasAction) cls += ' has-action';
    if (act.freePick) cls += ' is-free-pick';
    var infoChrome = skillCardInfoChrome(node, false);

    return '<article class="' + cls + infoChrome.extraCls + '" data-node="' + escapeHtml(node.node_key) + '"' +
      infoChrome.cardAttrs + lock.titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      renderTreeCardFrame(node, {
        hasAction: act.hasAction,
        levelLocked: lock.levelLocked,
        lockReason: lock.lockReason
      }) +
      infoChrome.infoBtn +
      act.actionHtml + '</div></article>';
  }

  function eazEconomyI18n(key, fallback) {
    var map = window.CreatorI18n || {};
    var short = {
      activate: map.eazEconomyActivate,
      commit: map.eazEconomyCommit || t('creator.journey.commit_eaz', 'Commit'),
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
      // Parent is a category gate only — no bonus (bonuses live on child tiers).
      if (node.activation_cost_eaz > 0) {
        var paidGate = Number(node.eaz_paid) || 0;
        var costGate = Number(node.activation_cost_eaz) || 0;
        if (paidGate > 0 && paidGate < costGate) {
          parts.push(formatEazBadge(paidGate, costGate, false, false));
        } else {
          parts.push(costGate + ' EAZV');
        }
      }
      if (node.mascot_min_level) parts.push(tpl('creator.journey.level_short', 'Lv. {{ n }}', { n: String(node.mascot_min_level) }));
      return parts.join(' · ');
    }
    var bonus = eazBonusLabel(node.axis, node.bonus_pct);
    if (bonus) parts.push(bonus);
    if (node.mascot_min_level) parts.push(tpl('creator.journey.level_short', 'Lv. {{ n }}', { n: String(node.mascot_min_level) }));
    if (node.activation_cost_eaz > 0) {
      var paid = Number(node.eaz_paid) || 0;
      var cost = Number(node.activation_cost_eaz) || 0;
      if (paid > 0 && paid < cost) parts.push(formatEazBadge(paid, cost, false, false));
      else parts.push(cost + ' EAZV');
    }
    return parts.join(' · ');
  }


  /** First child tier bonus for an axis (parents themselves grant 0%). */
  function eazFirstChildTierBonus(axis, tabNodes) {
    var list = (tabNodes || []).slice().sort(function (a, b) {
      return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
        (Number(a.mascot_min_level) || 0) - (Number(b.mascot_min_level) || 0);
    });
    for (var i = 0; i < list.length; i++) {
      var bonus = eazBonusLabel(axis, list[i].bonus_pct);
      if (bonus) return bonus;
    }
    return '';
  }

  function eazAxisIsActive(axis, axisNode, data) {
    if (axis === 'kickstarter') return !!(data && data.kickstarter_redeemed);
    if (!axisNode) return false;
    var status = axisNode.status || 'locked';
    return status === 'active' || status === 'grandfathered';
  }

  /** Expand only when activated; Kickstarter keeps special expand (redeem / bonuses). */
  function eazAxisCanExpand(axis, axisNode, data) {
    if (axis === 'kickstarter') return true;
    return eazAxisIsActive(axis, axisNode, data);
  }

  function eazSkillFullyFunded(node) {
    if (!node) return false;
    var cost = Number(node.activation_cost_eaz) || 0;
    if (cost <= 0) return true;
    return (Number(node.eaz_paid) || 0) >= cost - 0.0001;
  }

  function eazSkillCanCommit(node) {
    return !!(node && node.status === 'unlocked' && !eazSkillFullyFunded(node));
  }

  function eazSkillCanActivate(node) {
    return !!(node && node.status === 'unlocked' && eazSkillFullyFunded(node));
  }

  function findEazEconomyNode(skillKey) {
    if (!eazEconomyData || !Array.isArray(eazEconomyData.nodes) || !skillKey) return null;
    for (var i = 0; i < eazEconomyData.nodes.length; i++) {
      if (eazEconomyData.nodes[i].skill_key === skillKey) return eazEconomyData.nodes[i];
    }
    return null;
  }

  function openEazEconomyCommitModal(skillKey) {
    var node = findEazEconomyNode(skillKey);
    if (!node) return;
    var title = eazSkillLabel(node.skill_key, node.is_axis_gate);
    var cost = Number(node.activation_cost_eaz) || 0;
    var committed = Number(node.eaz_paid) || 0;
    openCommitModal(skillKey, title, {
      type: 'eaz_economy',
      skillKey: skillKey,
      title: title,
      cost: cost,
      committed: committed,
      remaining: Math.max(0, Math.round((cost - committed) * 100) / 100),
      node: node
    });
  }

  function renderEazEconomyActionButton(node, btnClass) {
    if (eazSkillCanActivate(node)) {
      return '<button type="button" class="' + btnClass + ' is-unlock-ready" data-cj-eaz-skill="' +
        escapeHtml(node.skill_key) + '" data-cj-eaz-action="activate">' +
        escapeHtml(eazEconomyI18n('activate', 'Activate')) + '</button>';
    }
    if (eazSkillCanCommit(node)) {
      return '<button type="button" class="' + btnClass + '" data-cj-eaz-skill="' +
        escapeHtml(node.skill_key) + '" data-cj-eaz-action="commit">' +
        escapeHtml(eazEconomyI18n('commit', 'Commit')) + '</button>';
    }
    return '';
  }

  function renderEazEconomySkillCard(node) {
    var status = node.status || 'locked';
    var title = eazSkillLabel(node.skill_key, node.is_axis_gate);
    var meta = eazSkillMeta(node);
    var isActive = status === 'active' || status === 'grandfathered';
    var canAct = eazSkillCanActivate(node) || eazSkillCanCommit(node);
    var isLocked = status === 'locked' || status === 'axis_locked' || status === 'kickstarter_locked';

    var cls = 'cj-tree-card cj-tree-card--eaz-economy';
    if (isLocked) cls += ' is-level-locked';
    if (isActive) cls += ' is-unlocked';
    if (canAct) cls += ' is-ready has-action';

    var badge = meta;
    if (isActive) badge = eazEconomyI18n('active', 'Active');
    else if (status === 'kickstarter_locked') {
      badge = eazEconomyI18n('kickstarter_locked', 'Kickstarter');
    } else if (status === 'axis_locked') {
      badge = eazEconomyI18n('axis_locked', 'Unlock category first');
    } else if (status === 'locked') {
      badge = levelRequiredLabel({ min_level: node.mascot_min_level || 1 });
    }

    var actionHtml = renderEazEconomyActionButton(node, 'cj-tree-card__action cj-btn');
    var titleAttr = (isLocked && badge) ? ' title="' + escapeHtml(badge) + '"' : '';
    var iconSvg = eazEconomySkillIconSvg(node);
    var infoChrome = skillCardInfoChrome(node, false, { type: 'eaz_economy', infoKey: node.skill_key });

    var statusHtml = isActive ? '<span class="cj-tree-card__status" aria-hidden="true">✓</span>' : '';
    return '<article class="' + cls + infoChrome.extraCls + '" data-eaz-skill="' + escapeHtml(node.skill_key) + '"' +
      infoChrome.cardAttrs + titleAttr + '>' +
      '<div class="cj-tree-card__stack">' +
      '<div class="cj-tree-card__frame' + (canAct ? ' cj-tree-card__frame--attached' : '') + '">' +
      '<h4 class="cj-tree-card__title-in">' + escapeHtml(title) + '</h4>' +
      '<div class="cj-tree-card__media cj-tree-card__media--icon">' +
      '<div class="cj-tree-card__icon-stack" aria-hidden="true">' +
      '<div class="cj-tree-card__icon">' + iconSvg + '</div></div></div>' +
      '<span class="cj-tree-card__eaz-badge' + (isLocked ? ' cj-tree-card__level-badge' : '') + '">' + escapeHtml(badge) + '</span>' +
      statusHtml + '</div>' +
      infoChrome.infoBtn +
      actionHtml + '</div></article>';
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
      var canAct = eazSkillCanActivate(node) || eazSkillCanCommit(node);
      var isLocked = status === 'locked' || status === 'axis_locked' || status === 'kickstarter_locked';
      var cls = 'cj-eaz-economy__subskill';
      if (isLocked) cls += ' is-locked';
      if (isActive) cls += ' is-active';
      if (canAct) cls += ' is-ready';
      var metaParts = [];
      if (status === 'locked') {
        metaParts.push(levelRequiredLabel({ min_level: lv }));
      } else {
        metaParts.push(tpl('creator.journey.level_short', 'Lv. {{ n }}', { n: String(lv) }));
        if (bonus) metaParts.push(bonus);
        if (node.activation_cost_eaz > 0 && !isActive) {
          var paid = Number(node.eaz_paid) || 0;
          var cost = Number(node.activation_cost_eaz) || 0;
          if (paid > 0 && paid < cost) metaParts.push(formatEazBadge(paid, cost, false, false));
          else metaParts.push(cost + ' EAZV');
        }
      }
      var actionHtml = renderEazEconomyActionButton(node, 'cj-eaz-economy__subskill-action cj-btn');
      if (!actionHtml && isActive) {
        actionHtml = '<span class="cj-eaz-economy__subskill-status" aria-hidden="true">✓</span>';
      } else if (!actionHtml && status === 'kickstarter_locked') {
        actionHtml = '<span class="cj-eaz-economy__subskill-lock">' +
          escapeHtml(eazEconomyI18n('kickstarter_locked', 'Kickstarter')) + '</span>';
      } else if (!actionHtml && status === 'axis_locked') {
        actionHtml = '<span class="cj-eaz-economy__subskill-lock">' +
          escapeHtml(eazEconomyI18n('axis_locked', 'Unlock category first')) + '</span>';
      } else if (!actionHtml && status === 'locked') {
        actionHtml = '<span class="cj-eaz-economy__subskill-lock">' +
          escapeHtml(levelRequiredLabel({ min_level: lv })) + '</span>';
      }
      return '<li class="' + cls + '" data-eaz-skill="' + escapeHtml(node.skill_key) + '">' +
        '<div class="cj-eaz-economy__subskill-main">' +
        '<span class="cj-eaz-economy__subskill-title">' + escapeHtml(title) + '</span>' +
        '<span class="cj-eaz-economy__subskill-meta">' + escapeHtml(metaParts.join(' · ')) + '</span>' +
        '</div>' + actionHtml + '</li>';
    }).join('') + '</ul>';
  }

  function renderEazEconomyCategoryCard(axis, axisNode, data, tabNodes) {
    var label = t('creator.eaz_economy.tab_' + axis, EAZ_AXIS_LABELS[axis] || axis);
    var isKs = axis === 'kickstarter';
    var redeemed = !!data.kickstarter_redeemed;
    var status = axisNode ? (axisNode.status || 'locked') : (isKs && !redeemed ? 'kickstarter_locked' : 'locked');
    if (isKs) status = redeemed ? 'active' : 'kickstarter_locked';
    var isActive = status === 'active' || status === 'grandfathered';
    var canExpand = eazAxisCanExpand(axis, axisNode, data);
    var expanded = canExpand && eazEconomyExpandedAxis === axis;
    var canAct = !isKs && axisNode && (eazSkillCanActivate(axisNode) || eazSkillCanCommit(axisNode));
    var isLocked = status === 'locked' || status === 'axis_locked' || status === 'kickstarter_locked';

    var cls = 'cj-eaz-economy__cat-card';
    if (canExpand) cls += ' is-expandable';
    else cls += ' is-static';
    if (expanded) cls += ' is-expanded';
    if (isLocked) cls += ' is-locked';
    if (isActive) cls += ' is-active';
    if (canAct) cls += ' is-ready';

    var badge = '';
    if (isKs) {
      badge = redeemed
        ? eazEconomyI18n('active', 'Active')
        : eazEconomyI18n('kickstarter_locked', 'Kickstarter');
    } else if (axisNode) {
      if (isActive) {
        // Parent grants no bonus — surface first child tier bonus as the real reward cue.
        var childBonus = eazFirstChildTierBonus(axis, tabNodes);
        badge = childBonus
          ? eazEconomyI18n('active', 'Active') + ' · ' + childBonus
          : eazEconomyI18n('active', 'Active');
      } else if (status === 'locked') {
        badge = levelRequiredLabel({ min_level: axisNode.mascot_min_level || 1 });
      } else {
        badge = eazSkillMeta(axisNode) || eazEconomyI18n('locked', 'Locked');
      }
    }

    var actionHtml = (!isKs && axisNode)
      ? renderEazEconomyActionButton(axisNode, 'cj-eaz-economy__cat-action cj-btn')
      : '';

    var expandAttr = canExpand
      ? ' data-cj-expand-eaz-axis="' + escapeHtml(axis) + '" role="button" tabindex="0" aria-expanded="' +
        (expanded ? 'true' : 'false') + '"'
      : '';

    var pseudoNode = axisNode || { skill_key: 'axis_' + axis, axis: axis, is_axis_gate: true };
    var infoChrome = skillCardInfoChrome(pseudoNode, canExpand, {
      type: 'eaz_economy',
      infoKey: pseudoNode.skill_key
    });
    if (!canExpand) cls += infoChrome.extraCls;
    else cls += infoChrome.extraCls;

    var axisIcon = EAZ_AXIS_ICON_SVG[axis] || CATEGORY_ICON_SVG.eaz_economy;
    var cardAttrs = canExpand ? '' : infoChrome.cardAttrs;

    return '<article class="' + cls + '"' + expandAttr + cardAttrs + '>' +
      '<div class="cj-eaz-economy__cat-card-inner">' +
      '<h4 class="cj-eaz-economy__cat-title">' + escapeHtml(label) + '</h4>' +
      '<div class="cj-eaz-economy__cat-media cj-eaz-economy__cat-media--icon" aria-hidden="true">' +
      axisIcon + '</div>' +
      (badge ? '<span class="cj-eaz-economy__cat-badge">' + escapeHtml(badge) + '</span>' : '') +
      (isActive ? '<span class="cj-eaz-economy__cat-check" aria-hidden="true">✓</span>' : '') +
      infoChrome.infoBtn +
      '</div>' + actionHtml + '</article>';
  }

  function renderEazEconomyExpandedPanel(data, axis, axisNode, tabNodes) {
    var html = '<div class="cj-eaz-economy__expand-panel cj-variant-panel" data-expanded-axis="' + escapeHtml(axis) + '">';
    if (axis === 'kickstarter') {
      html += renderEazEconomyKickstarterSection(data);
      html += '<p class="cj-eaz-economy__expand-label">' +
        escapeHtml(t('creator.eaz_economy.kickstarter_bonuses', 'Kickstarter bonus skills')) + '</p>';
      html += renderEazEconomySkillGrid(tabNodes);
      html += '</div>';
      return html;
    }

    // Only reached when axis is already activated — show tier children.
    var activeSkills = [];
    var lockedSkills = [];
    (tabNodes || []).forEach(function (node) {
      var status = node.status || 'locked';
      if (status === 'active' || status === 'grandfathered') activeSkills.push(node);
      else lockedSkills.push(node);
    });

    if (activeSkills.length) {
      html += '<p class="cj-eaz-economy__expand-label">' +
        escapeHtml(t('creator.journey.unlocked_skills', 'Unlocked')) + '</p>';
      html += renderEazEconomySubSkillList(activeSkills);
    }
    if (lockedSkills.length) {
      html += '<p class="cj-eaz-economy__expand-label">' +
        escapeHtml(t('creator.journey.available_skills', 'Available')) + '</p>';
      html += renderEazEconomySubSkillList(lockedSkills);
    }
    if (!activeSkills.length && !lockedSkills.length) {
      html += '<p class="cj-eaz-economy__expand-label">' +
        escapeHtml(t('creator.eaz_economy.subskills_label', 'Skills in this category')) + '</p>';
      html += renderEazEconomySubSkillList(tabNodes);
    }
    html += '</div>';
    return html;
  }

  function renderEazEconomyAxisRow(axes, axisByTab, data, opts) {
    opts = opts || {};
    if (!axes.length) return '';
    var expanded = eazEconomyExpandedAxis;
    var html = '<section class="cj-product-section' + (opts.unlockedRow ? ' cj-unlocked-skills' : '') + '">';
    html += renderSectionHead(
      opts.title || t('creator.journey.available_skills', 'Available'),
      '',
      ''
    );
    html += '<div class="cj-eaz-economy__cat-row" role="group" aria-label="' +
      escapeHtml(opts.title || t('creator.eaz_economy.axis_tabs_aria', 'EAZV economy categories')) + '">';
    axes.forEach(function (ax) {
      html += renderEazEconomyCategoryCard(ax, axisByTab[ax], data, opts.byTab[ax] || []);
    });
    html += '</div>';
    if (expanded && axes.indexOf(expanded) >= 0 &&
        eazAxisCanExpand(expanded, axisByTab[expanded], data)) {
      html += '<div class="cj-variant-branch cj-eaz-economy__branch" data-cj-eaz-branch="' + escapeHtml(expanded) + '">' +
        '<div class="cj-variant-connector" aria-hidden="true"></div>' +
        renderEazEconomyExpandedPanel(data, expanded, axisByTab[expanded], opts.byTab[expanded] || []) +
        '</div>';
    }
    html += '</section>';
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
    if (expanded && EAZ_CATEGORY_ORDER.indexOf(expanded) < 0) {
      eazEconomyExpandedAxis = '';
      expanded = '';
    }
    if (expanded && !eazAxisCanExpand(expanded, axisByTab[expanded], data)) {
      eazEconomyExpandedAxis = '';
      expanded = '';
    }

    var activeAxes = [];
    var lockedAxes = [];
    EAZ_CATEGORY_ORDER.forEach(function (ax) {
      if (eazAxisIsActive(ax, axisByTab[ax], data)) activeAxes.push(ax);
      else lockedAxes.push(ax);
    });

    var html = '<div class="cj-eaz-economy cj-product-sections">';
    html += renderEazEconomyAxisRow(activeAxes, axisByTab, data, {
      unlockedRow: true,
      title: t('creator.journey.unlocked_skills', 'Unlocked'),
      byTab: byTab
    });
    html += renderEazEconomyAxisRow(lockedAxes, axisByTab, data, {
      unlockedRow: false,
      title: t('creator.journey.available_skills', 'Available'),
      byTab: byTab
    });
    html += '</div>';
    return html;
  }

  function wireEazEconomyTree(list) {
    if (!list) return;
    list.querySelectorAll('[data-cj-eaz-skill]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-cj-eaz-skill');
        var action = btn.getAttribute('data-cj-eaz-action') || 'activate';
        var oid = ownerId();
        if (!oid || !key) return;
        if (action === 'commit') {
          openEazEconomyCommitModal(key);
          return;
        }
        btn.disabled = true;
        apiFetch('activate-eaz-economy-skill', { owner_id: oid }, 'POST', { skill_key: key }).then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || 'failed');
          var label = btn.closest('.cj-tree-card, .cj-eaz-economy__subskill, .cj-eaz-economy__cat-card');
          var nameEl = label && (
            label.querySelector('.cj-tree-card__title-in') ||
            label.querySelector('.cj-eaz-economy__subskill-title') ||
            label.querySelector('.cj-eaz-economy__cat-title')
          );
          var skillName = nameEl ? nameEl.textContent.trim() : key;
          showUnlockCelebration({
            title: tpl('creator.journey.activate_success_title', 'Activated — {{ name }}', { name: skillName }),
            sub: t('creator.journey.activate_success_sub', 'Skill is now active'),
            mediaHtml: '<span class="cj-celebrate-fallback" aria-hidden="true">⚡</span>'
          });
          if (String(key).indexOf('axis_') === 0) {
            eazEconomyExpandedAxis = String(key).replace('axis_', '');
          }
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
        if (e.target.closest('[data-cj-eaz-skill], [data-cj-eaz-action], [data-cj-skill-info-btn]')) return;
        toggle();
      });
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('[data-cj-eaz-skill], [data-cj-eaz-action], [data-cj-skill-info-btn]')) return;
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
        var icon = categoryTabIconSvg(c, nodes);
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
      positionVariantConnectors(list);
      requestAnimationFrame(function () { positionVariantConnectors(list); });
      return;
    }

    var filtered = nodes.filter(function (n) { return n.category === treeFilter; });
    var html = '';

    if (treeFilter === 'product') {
      html = renderProductTree(filtered);
    } else if (treeFilter === 'market') {
      html = renderMarketTree(filtered);
    } else if (treeFilter === 'channel') {
      html = renderChannelTree(filtered);
    } else if (treeFilter === 'design_slot') {
      html = renderDesignSlotTree(filtered);
    } else if (treeFilter === 'creation_limit') {
      html = renderCreationLimitTree(filtered);
    } else if (treeFilter === 'listing_limit') {
      html = renderListingLimitTree(filtered);
    } else {
      html = renderGenericSkillTree(filtered);
    }

    list.innerHTML = html;

    // Carousels on unlocked/locked rows; expand panels for product + markets + channels + slots + limits.
    wireProductCarousel(list);
    if (treeFilter === 'product' || treeFilter === 'market' || treeFilter === 'channel' ||
        treeFilter === 'design_slot' || treeFilter === 'creation_limit' || treeFilter === 'listing_limit') {
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

    list.querySelectorAll('[data-cj-skill-info]').forEach(function (card) {
      function openInfo(e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
        if (e.target.closest('[data-cj-eaz-action]')) return;
        var key = card.getAttribute('data-cj-skill-info');
        if (!key) return;
        var infoType = card.getAttribute('data-cj-skill-info-type');
        openSkillInfoModal(key, infoType === 'eaz_economy' ? { type: 'eaz_economy' } : null);
      }
      card.addEventListener('click', openInfo);
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('[data-cj-tree-action]')) return;
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
        e.preventDefault();
        openInfo(e);
      });
    });
    list.querySelectorAll('[data-cj-skill-info-btn]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = btn.getAttribute('data-cj-skill-info-btn');
        if (!key) return;
        var infoType = btn.getAttribute('data-cj-skill-info-type');
        openSkillInfoModal(key, infoType === 'eaz_economy' ? { type: 'eaz_economy' } : null);
      });
    });
  }

  /**
   * Show prev/next only when the track content overflows the visible width.
   * Uses ResizeObserver so expand/collapse, font load, and window resize stay in sync.
   */
  function updateCarouselScrollable(carousel) {
    if (!carousel) return;
    var track = carousel.querySelector('[data-cj-carousel-track]');
    if (!track) {
      carousel.classList.remove('is-scrollable');
      return;
    }
    var overflow = track.scrollWidth > track.clientWidth + 1;
    carousel.classList.toggle('is-scrollable', overflow);
    var prev = carousel.querySelector('[data-cj-carousel-prev]');
    var next = carousel.querySelector('[data-cj-carousel-next]');
    if (prev) {
      prev.hidden = !overflow;
      prev.setAttribute('aria-hidden', overflow ? 'false' : 'true');
      prev.tabIndex = overflow ? 0 : -1;
    }
    if (next) {
      next.hidden = !overflow;
      next.setAttribute('aria-hidden', overflow ? 'false' : 'true');
      next.tabIndex = overflow ? 0 : -1;
    }
  }

  function updateAllCarouselsScrollable(root) {
    if (!root) return;
    root.querySelectorAll('[data-cj-carousel]').forEach(updateCarouselScrollable);
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
      track.addEventListener('scroll', function () {
        updateCarouselScrollable(carousel);
        positionVariantConnectors(root);
      }, { passive: true });

      if (typeof ResizeObserver !== 'undefined') {
        if (carousel._cjOverflowObserver) {
          try { carousel._cjOverflowObserver.disconnect(); } catch (e) { /* ignore */ }
        }
        var ro = new ResizeObserver(function () {
          updateCarouselScrollable(carousel);
        });
        ro.observe(track);
        carousel._cjOverflowObserver = ro;
      }

      // Images / fonts can change intrinsic card width after first paint.
      track.querySelectorAll('img').forEach(function (img) {
        if (img.complete) return;
        img.addEventListener('load', function () {
          updateCarouselScrollable(carousel);
        }, { once: true });
      });

      updateCarouselScrollable(carousel);
      requestAnimationFrame(function () {
        updateCarouselScrollable(carousel);
      });
    });
  }

  /**
   * Anchor skill-tree connector stems to the selected card center and stretch them
   * flush from parent frame bottom border into child panel top border (no gap).
   */
  function clearConnectorAnchor(connector, panel) {
    if (!connector) return;
    connector.style.removeProperty('--cj-connector-x');
    connector.style.removeProperty('--cj-connector-top');
    connector.style.removeProperty('--cj-connector-h');
    connector.style.removeProperty('width');
    connector.style.removeProperty('height');
    connector.classList.remove('is-anchored', 'is-orthogonal');
    var svg = connector.querySelector('svg');
    if (svg) svg.remove();
    if (panel) panel.style.removeProperty('--cj-connector-x');
  }

  var CONNECTOR_STROKE_PX = 3;
  var CONNECTOR_STROKE_HALF = CONNECTOR_STROKE_PX / 2;

  function connectorFrameEl(card) {
    if (!card) return null;
    if (card.classList && card.classList.contains('cj-tree-card__frame')) return card;
    var frame = card.querySelector && card.querySelector('.cj-tree-card__frame');
    return frame || card;
  }

  function anchorConnectorToCard(connector, panel, card, branch) {
    if (!connector || !branch) return;
    if (!card || !panel) {
      clearConnectorAnchor(connector, panel);
      return;
    }
    var branchRect = branch.getBoundingClientRect();
    var frameEl = connectorFrameEl(card);
    var cardRect = frameEl.getBoundingClientRect();
    var panelRect = panel.getBoundingClientRect();
    var parentX = Math.round(cardRect.left + cardRect.width / 2 - branchRect.left);
    var panelX = Math.round(panelRect.left + panelRect.width / 2 - branchRect.left);
    // Terminate exactly at outer border edges (no overlap into parent/child frames).
    var top = Math.round(cardRect.bottom - branchRect.top);
    var bottom = Math.round(panelRect.top - branchRect.top);
    var h = Math.max(CONNECTOR_STROKE_PX, bottom - top);
    connector.classList.add('is-anchored');
    connector.style.setProperty('--cj-connector-top', top + 'px');
    connector.style.setProperty('--cj-connector-h', h + 'px');
    panel.style.setProperty('--cj-connector-x', panelX + 'px');

    var svg = connector.querySelector('svg');
    if (Math.abs(parentX - panelX) > 4) {
      connector.classList.add('is-orthogonal');
      connector.style.removeProperty('--cj-connector-x');
      connector.style.width = Math.round(branchRect.width) + 'px';
      connector.style.height = h + 'px';
      var pathStartY = CONNECTOR_STROKE_HALF;
      var pathEndY = h - CONNECTOR_STROKE_HALF;
      var elbowY = Math.round(pathStartY + (pathEndY - pathStartY) * 0.42);
      var pathD = 'M' + parentX + ',' + pathStartY + ' L' + parentX + ',' + elbowY + ' L' + panelX + ',' + elbowY +
        ' L' + panelX + ',' + pathEndY;
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'cj-variant-connector__path');
        svg.appendChild(path);
        connector.appendChild(svg);
      }
      svg.setAttribute('viewBox', '0 0 ' + Math.round(branchRect.width) + ' ' + h);
      svg.querySelector('.cj-variant-connector__path').setAttribute('d', pathD);
      return;
    }

    connector.classList.remove('is-orthogonal');
    connector.style.removeProperty('width');
    connector.style.removeProperty('height');
    if (svg) svg.remove();
    connector.style.setProperty('--cj-connector-x', parentX + 'px');
    panel.style.setProperty('--cj-connector-x', parentX + 'px');
  }

  function wireConnectorHoverReposition(root) {
    if (!root) return;
    var scheduleReposition = function () {
      requestAnimationFrame(function () { positionVariantConnectors(root); });
    };
    root.querySelectorAll(
      '.cj-tree-card.is-expanded.is-expandable, .cj-eaz-economy__cat-card.is-expanded.is-expandable'
    ).forEach(function (card) {
      card.addEventListener('mouseenter', scheduleReposition);
      card.addEventListener('mouseleave', scheduleReposition);
    });
    if (!root._cjConnectorTransitionBound) {
      root._cjConnectorTransitionBound = true;
      root.addEventListener('transitionend', function (e) {
        if (!e.target || !e.target.closest) return;
        if (e.target.closest('.cj-tree-card__frame, .cj-tree-card, .cj-eaz-economy__cat-card-inner')) {
          scheduleReposition();
        }
      });
    }
  }

  function positionVariantConnectors(root) {
    if (!root) return;
    var list = root;

    list.querySelectorAll('[data-cj-variant-branch]').forEach(function (branch) {
      var pk = branch.getAttribute('data-cj-variant-branch');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-variant-panel');
      if (!connector || !pk) return;
      var section = branch.closest('.cj-product-section') || list;
      var card = section.querySelector('.cj-tree-card--product.is-expanded[data-cj-expand-product="' + pk + '"]');
      anchorConnectorToCard(connector, panel, card, branch);
    });

    list.querySelectorAll('[data-cj-size-panel]').forEach(function (branch) {
      var colorKey = branch.getAttribute('data-cj-size-panel');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-variant-size-panel');
      if (!connector || !colorKey) return;
      var variantPanel = branch.closest('[data-cj-variant-panel]') || list;
      var card = null;
      variantPanel.querySelectorAll('.cj-tree-card--variant-color.is-expanded[data-cj-expand-color]').forEach(function (el) {
        if (el.getAttribute('data-cj-expand-color') === colorKey) card = el;
      });
      anchorConnectorToCard(connector, panel, card, branch);
    });

    list.querySelectorAll('[data-cj-market-branch]').forEach(function (branch) {
      var code = branch.getAttribute('data-cj-market-branch');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-variant-panel');
      if (!connector || !code) return;
      var card = null;
      list.querySelectorAll('.cj-tree-card--market-continent.is-expanded[data-cj-expand-continent]').forEach(function (el) {
        if (el.getAttribute('data-cj-expand-continent') === code) card = el;
      });
      anchorConnectorToCard(connector, panel, card, branch);
    });

    list.querySelectorAll('[data-cj-eaz-branch]').forEach(function (branch) {
      var code = branch.getAttribute('data-cj-eaz-branch');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-eaz-economy__expand-panel, :scope > .cj-variant-panel');
      if (!connector || !code) return;
      var cardEl = list.querySelector('.cj-eaz-economy__cat-card.is-expanded[data-cj-expand-eaz-axis="' + code + '"]');
      var frame = cardEl && (cardEl.querySelector('.cj-eaz-economy__cat-card-inner') || cardEl);
      anchorConnectorToCard(connector, panel, frame, branch);
    });

    list.querySelectorAll('[data-cj-channel-branch]').forEach(function (branch) {
      var key = branch.getAttribute('data-cj-channel-branch');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-variant-panel');
      if (!connector || !key) return;
      var card = list.querySelector('.cj-tree-card--channel-group.is-expanded[data-cj-expand-channel="' + key + '"]');
      anchorConnectorToCard(connector, panel, card, branch);
    });

    list.querySelectorAll('[data-cj-slot-level-branch]').forEach(function (branch) {
      var key = branch.getAttribute('data-cj-slot-level-branch');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-variant-panel');
      if (!connector || !key) return;
      var card = list.querySelector('.cj-tree-card--design-slot-level.is-expanded[data-cj-expand-slot-level="' + key + '"]');
      anchorConnectorToCard(connector, panel, card, branch);
    });

    list.querySelectorAll('[data-cj-creation-limit-branch]').forEach(function (branch) {
      var key = branch.getAttribute('data-cj-creation-limit-branch');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-variant-panel');
      if (!connector || !key) return;
      var section = branch.closest('.cj-creation-limit-row') || branch.closest('.cj-product-section') || list;
      var card = section.querySelector(
        '.cj-tree-card--creation-limit-parent.is-expanded[data-cj-expand-creation-limit="' + key + '"]'
      );
      anchorConnectorToCard(connector, panel, card, branch);
    });

    list.querySelectorAll('[data-cj-listing-limit-branch]').forEach(function (branch) {
      var key = branch.getAttribute('data-cj-listing-limit-branch');
      var connector = branch.querySelector(':scope > .cj-variant-connector');
      var panel = branch.querySelector(':scope > .cj-variant-panel');
      if (!connector || !key) return;
      var section = branch.closest('.cj-product-section') || list;
      var card = section.querySelector(
        '.cj-tree-card--listing-channel.is-expanded[data-cj-expand-listing-limit="' + key + '"]'
      );
      anchorConnectorToCard(connector, panel, card, branch);
    });
  }

  function wireProductExpand(root) {
    if (!root) return;
    root.querySelectorAll('[data-cj-expand-product]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
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
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
        var key = card.getAttribute('data-cj-expand-color');
        if (!key) return;
        expandedColorKeys[key] = !expandedColorKeys[key];
        renderTree();
      });
    });
    root.querySelectorAll('[data-cj-expand-continent]').forEach(function (card) {
      function toggleContinent(e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
        var code = card.getAttribute('data-cj-expand-continent');
        if (!code) return;
        // Toggle for any unlocked continent — including fully unlocked (all countries done).
        expandedContinentKeys[code] = !expandedContinentKeys[code];
        renderTree();
      }
      card.addEventListener('click', toggleContinent);
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleContinent(e);
      });
    });
    root.querySelectorAll('[data-cj-expand-channel]').forEach(function (card) {
      function toggleChannel(e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
        var key = card.getAttribute('data-cj-expand-channel');
        if (!key) return;
        expandedChannelKeys[key] = !expandedChannelKeys[key];
        renderTree();
      }
      card.addEventListener('click', toggleChannel);
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleChannel(e);
      });
    });
    root.querySelectorAll('[data-cj-expand-slot-level]').forEach(function (card) {
      function toggleSlotLevel(e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
        var key = card.getAttribute('data-cj-expand-slot-level');
        if (!key) return;
        expandedSlotLevelKeys[key] = !expandedSlotLevelKeys[key];
        renderTree();
      }
      card.addEventListener('click', toggleSlotLevel);
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleSlotLevel(e);
      });
    });
    root.querySelectorAll('[data-cj-expand-creation-limit]').forEach(function (card) {
      function toggleCreation(e) {
        if (e.target.closest('[data-cj-tree-action]') || e.target.closest('[data-cj-goto-eaz-daily]')) return;
        var key = card.getAttribute('data-cj-expand-creation-limit');
        if (!key) return;
        var wasOpen = !!expandedCreationLimitKeys[key];
        expandedCreationLimitKeys = {};
        if (!wasOpen) expandedCreationLimitKeys[key] = true;
        renderTree();
      }
      card.addEventListener('click', toggleCreation);
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleCreation(e);
      });
    });
    root.querySelectorAll('[data-cj-expand-listing-limit]').forEach(function (card) {
      function toggleListing(e) {
        if (e.target.closest('[data-cj-tree-action]')) return;
        if (e.target.closest('[data-cj-skill-info-btn]')) return;
        var key = card.getAttribute('data-cj-expand-listing-limit');
        if (!key) return;
        var wasOpen = !!expandedListingLimitKeys[key];
        expandedListingLimitKeys = {};
        if (!wasOpen) expandedListingLimitKeys[key] = true;
        renderTree();
      }
      card.addEventListener('click', toggleListing);
      card.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleListing(e);
      });
    });
    root.querySelectorAll('[data-cj-goto-eaz-daily]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        treeFilter = 'eaz_economy';
        eazEconomyExpandedAxis = 'daily';
        renderTree();
      });
    });
    positionVariantConnectors(root);
    wireConnectorHoverReposition(root);
    if (!window._cjConnectorResizeBound) {
      window._cjConnectorResizeBound = true;
      window.addEventListener('resize', function () {
        var listEl = document.getElementById('cjTreeList');
        if (!listEl) return;
        updateAllCarouselsScrollable(listEl);
        positionVariantConnectors(listEl);
      });
    }
    requestAnimationFrame(function () {
      updateAllCarouselsScrollable(root);
      positionVariantConnectors(root);
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
    if (journeyData && journeyData.is_creator === false) {
      wrap.hidden = true;
      return;
    }
    var bal = readCachedBalanceEaz();
    if (bal == null) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    val.textContent = formatSidebarBalanceValue(bal);
    val.classList.remove('is-loading');
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

  function openCommitModal(nodeKey, nodeTitleText, metaOverride) {
    var commitOverlay = document.getElementById('cjCommitOverlay');
    var amountInput = document.getElementById('cjCommitAmount');
    var availEl = document.getElementById('cjCommitAvail');
    var costEl = document.getElementById('cjCommitCost');
    var nodeEl = document.getElementById('cjCommitNodeLabel');
    var errEl = document.getElementById('cjCommitError');
    var coinEl = document.getElementById('cjCommitCoin');
    if (!commitOverlay || !amountInput) return;

    var title;
    var cost;
    var committed;
    var remaining;
    var node = null;
    if (metaOverride && metaOverride.type === 'eaz_economy') {
      title = metaOverride.title || nodeTitleText || nodeKey || '';
      cost = Number(metaOverride.cost) || 0;
      committed = Number(metaOverride.committed) || 0;
      remaining = Math.max(0, Math.round((cost - committed) * 100) / 100);
      node = metaOverride.node || null;
      pendingCommitMeta = {
        type: 'eaz_economy',
        skillKey: metaOverride.skillKey || nodeKey,
        title: title,
        cost: cost,
        committed: committed,
        remaining: remaining,
        node: node
      };
    } else {
      node = findJourneyNode(nodeKey);
      title = nodeTitleText || (node ? nodeTitle(node) : '') || nodeKey || '';
      cost = node ? Number(node.cost_eaz) || 0 : 0;
      committed = node ? Number(node.eaz_committed) || 0 : 0;
      remaining = Math.max(0, Math.round((cost - committed) * 100) / 100);
      pendingCommitMeta = {
        title: title,
        cost: cost,
        committed: committed,
        remaining: remaining,
        node: node
      };
    }
    var avail = journeyData && journeyData.balance_eaz != null ? Number(journeyData.balance_eaz) : 0;
    var defaultAmt = Math.min(avail > 0 ? avail : 0, remaining > 0 ? remaining : avail);

    pendingCommitNodeKey = nodeKey;
    pendingCommitAmount = null;

    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (nodeEl) {
      nodeEl.textContent = title;
      nodeEl.hidden = !title;
    }
    if (availEl) {
      availEl.textContent = tpl('creator.journey.commit_modal_available', 'Available: {{ amount }} EAZV', {
        amount: formatEazAmount(avail)
      });
    }
    if (costEl) {
      costEl.textContent = tpl('creator.journey.commit_modal_cost', 'Needed: {{ remaining }} / {{ cost }} EAZV', {
        remaining: formatEazAmount(remaining),
        cost: formatEazAmount(cost)
      });
      costEl.hidden = !(cost > 0);
    }
    if (coinEl) {
      coinEl.src = eazvCoinUrl();
      coinEl.hidden = false;
      coinEl.alt = 'EAZV';
      if (window.EazCoinBrand && window.EazCoinBrand.hydrate) {
        window.EazCoinBrand.hydrate(coinEl.parentNode || commitOverlay);
      }
    }
    amountInput.value = defaultAmt > 0 ? formatEazAmount(defaultAmt) : '';

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
    pendingCommitMeta = null;
    pendingCommitAmount = null;
    commitOverlay.classList.remove('is-open');
    commitOverlay.setAttribute('aria-hidden', 'true');
    commitOverlay.hidden = true;
    closeCommitConfirm();
  }

  function openCommitConfirm(amount) {
    var overlayEl = document.getElementById('cjCommitConfirmOverlay');
    var bodyEl = document.getElementById('cjCommitConfirmBody');
    if (!overlayEl) return;
    pendingCommitAmount = amount;
    var name = (pendingCommitMeta && pendingCommitMeta.title) || pendingCommitNodeKey || '';
    if (bodyEl) {
      bodyEl.textContent = tpl(
        'creator.journey.commit_reconfirm_body',
        'Commit {{ amount }} EAZV to unlock “{{ name }}”? This cannot be undone.',
        { amount: formatEazAmount(amount), name: name }
      );
    }
    overlayEl.hidden = false;
    overlayEl.classList.add('is-open');
    overlayEl.setAttribute('aria-hidden', 'false');
  }

  function closeCommitConfirm() {
    var overlayEl = document.getElementById('cjCommitConfirmOverlay');
    if (!overlayEl) return;
    overlayEl.classList.remove('is-open');
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.hidden = true;
  }

  function royaltyInfoBenefitText(tier, pct) {
    var key = 'creator.journey.royalty_info_tier_' + tier;
    var fallbacks = {
      1: 'Starter royalty: you earn {{ pct }}% of each sale’s net profit. This tier unlocks automatically at Level 1 so you start earning right away.',
      2: 'Raise your creator share to {{ pct }}% of net profit on every qualifying sale — double the starter rate.',
      3: 'Earn {{ pct }}% of net profit per sale. A steady step up that puts more of each order’s margin in your pocket.',
      4: 'Earn {{ pct }}% of net profit per sale. Higher royalty means stronger earnings as your catalog grows.',
      5: 'Earn {{ pct }}% of net profit per sale. Mid-tier rate for creators building consistent sales volume.',
      6: 'Earn {{ pct }}% of net profit per sale. A clear jump in take-home on every order you sell.',
      7: 'Earn {{ pct }}% of net profit per sale. Advanced royalty for creators scaling toward top earnings.',
      8: 'Earn {{ pct }}% of net profit per sale. Near-top share — most of the creator-side margin goes to you.',
      9: 'Earn {{ pct }}% of net profit per sale. Elite royalty reserved for high-level creators with strong sales.',
      10: 'Top royalty: you earn {{ pct }}% of net profit — the highest creator share available in the Unlock Tree.'
    };
    return tpl(key, fallbacks[tier] || fallbacks[1], { pct: String(pct) });
  }

  var productSkillInfoToken = 0;
  var productSkillInfoBound = false;

  function isProductSkillNode(node) {
    return !!(node && node.category === 'product' && node.product_key);
  }

  function formatCentsPrice(cents) {
    if (cents == null || !Number.isFinite(Number(cents))) return '';
    var n = Number(cents) / 100;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(n);
    } catch (e) {
      return '€' + n.toFixed(2);
    }
  }

  function psiT(key, fallback, vars) {
    return tpl('creator.journey.product_skill.' + key, fallback, vars);
  }

  function setProductSkillTab(tabKey) {
    var tabs = document.getElementById('cjProductSkillTabs');
    var panels = document.getElementById('cjProductSkillPanels');
    if (!tabs || !panels) return;
    tabs.querySelectorAll('[data-cj-psi-tab]').forEach(function (btn) {
      var active = btn.getAttribute('data-cj-psi-tab') === tabKey;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.querySelectorAll('[data-cj-psi-panel]').forEach(function (panel) {
      var active = panel.getAttribute('data-cj-psi-panel') === tabKey;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  }

  function ensureProductSkillInfoBindings() {
    if (productSkillInfoBound) return;
    productSkillInfoBound = true;
    var tabs = document.getElementById('cjProductSkillTabs');
    if (!tabs) return;
    tabs.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-cj-psi-tab]') : null;
      if (!btn) return;
      var key = btn.getAttribute('data-cj-psi-tab');
      if (key) setProductSkillTab(key);
    });
  }

  function renderPsiKvRows(rows) {
    if (!rows || !rows.length) {
      return '<p class="cj-psi-empty">' + escapeHtml(psiT('empty', 'No data available yet.')) + '</p>';
    }
    return '<div class="cj-psi-kv">' + rows.map(function (row) {
      return '<div class="cj-psi-kv__row">' +
        '<div class="cj-psi-kv__label">' + escapeHtml(row.label) + '</div>' +
        '<div class="cj-psi-kv__value">' + row.valueHtml + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function renderPsiChips(items) {
    if (!items || !items.length) return '—';
    return '<div class="cj-psi-chips">' + items.map(function (item) {
      return '<span class="cj-psi-chip">' + escapeHtml(item) + '</span>';
    }).join('') + '</div>';
  }

  function renderProductSkillShippingCountry(ov) {
    var flagCode = ov.shipping_flag_code || (ov.shipping_country ? String(ov.shipping_country).toLowerCase() : '');
    var name = ov.shipping_country_name || ov.shipping_country || '';
    if (!name) return escapeHtml('—');
    var flag = flagCode
      ? '<img class="cj-psi-shipping__flag" src="' + FLAG_CDN + escapeHtml(flagCode) + '.svg" alt="" loading="lazy">'
      : '';
    return '<span class="cj-psi-shipping">' + flag + '<span>' + escapeHtml(name) + '</span></span>';
  }

  function renderProductSkillOverview(data) {
    var ov = data.overview || {};
    var audience = Array.isArray(ov.audience) ? ov.audience : [];
    var printAreas = Array.isArray(ov.print_areas) ? ov.print_areas : [];
    return renderPsiKvRows([
      {
        label: psiT('audience', 'Audience'),
        valueHtml: renderPsiChips(audience.length ? audience : ['—'])
      },
      {
        label: psiT('shipping_country', 'Shipping country'),
        valueHtml: renderProductSkillShippingCountry(ov)
      },
      {
        label: psiT('base_product_model', 'Base product model'),
        valueHtml: escapeHtml(ov.base_product_model || data.title || '—')
      },
      {
        label: psiT('base_product_brand', 'Base product brand'),
        valueHtml: escapeHtml(ov.provider_brand || '—')
      },
      {
        label: psiT('print_areas', 'Print areas'),
        valueHtml: renderPsiChips(printAreas.length ? printAreas : ['—'])
      }
    ]);
  }

  function renderProductSkillSkillTab(data) {
    var skill = data.skill || {};
    var colors = Array.isArray(skill.colors) ? skill.colors : [];
    var variantCost = Number(skill.variant_unlock_cost_eaz) || 60;
    var html = '';
    html += '<div class="cj-psi-stats">';
    html += '<div class="cj-psi-stat"><span class="cj-psi-stat__label">' +
      escapeHtml(psiT('required_level', 'Required level')) +
      '</span><span class="cj-psi-stat__value">' +
      escapeHtml(String(skill.min_level != null ? skill.min_level : '—')) +
      '</span></div>';
    html += '<div class="cj-psi-stat"><span class="cj-psi-stat__label">' +
      escapeHtml(psiT('unlock_cost', 'Unlock cost')) +
      '</span><span class="cj-psi-stat__value">' +
      escapeHtml((Number(skill.unlock_cost_eaz) || 0) + ' EAZV') +
      '</span></div>';
    html += '</div>';
    html += '<p class="cj-psi-hint">' +
      escapeHtml(psiT('variant_cost_hint', 'Each additional color or size variant costs {{ n }} EAZV after free picks.', {
        n: String(variantCost)
      })) +
      '</p>';
    if (!colors.length) {
      html += '<p class="cj-psi-empty">' + escapeHtml(psiT('empty', 'No data available yet.')) + '</p>';
      return html;
    }
    html += '<div class="cj-psi-subskills" aria-label="' + escapeHtml(psiT('subskills', 'Sub-skills')) + '">';
    colors.forEach(function (c) {
      var hex = c.hex || '#888888';
      var sizes = Array.isArray(c.sizes) ? c.sizes : [];
      html += '<details class="cj-psi-subskill">';
      html += '<summary><span class="cj-psi-dot" style="background:' + escapeHtml(hex) + '"></span>' +
        '<span>' + escapeHtml(c.name || '') + '</span></summary>';
      if (sizes.length) {
        html += '<div class="cj-psi-sizes" aria-label="' + escapeHtml(psiT('sizes', 'Sizes')) + '">';
        sizes.forEach(function (sz) {
          html += '<span class="cj-psi-size">' + escapeHtml(sz) + '</span>';
        });
        html += '</div>';
      } else {
        html += '<p class="cj-psi-empty">' + escapeHtml(psiT('empty', 'No data available yet.')) + '</p>';
      }
      html += '</details>';
    });
    html += '</div>';
    return html;
  }

  function renderProductSkillVariantsTab(data) {
    var variants = Array.isArray(data.variants) ? data.variants : [];
    if (!variants.length) {
      return '<p class="cj-psi-empty">' + escapeHtml(psiT('empty', 'No data available yet.')) + '</p>';
    }
    return '<div class="cj-psi-variant-grid">' + variants.map(function (v) {
      var price = formatCentsPrice(v.cost_cents);
      var priceLabel = price
        ? psiT('purchase_price', 'From {{ price }}', { price: price })
        : psiT('price_na', 'Price n/a');
      var media = v.image_url
        ? '<img src="' + escapeHtml(v.image_url) + '" alt="" loading="lazy">'
        : '<span class="cj-psi-dot" style="width:28px;height:28px;background:' +
          escapeHtml(v.hex || '#888') + '"></span>';
      return '<div class="cj-psi-variant-card">' +
        '<div class="cj-psi-variant-card__media">' + media + '</div>' +
        '<div class="cj-psi-variant-card__body">' +
        '<div class="cj-psi-variant-card__name">' + escapeHtml(v.name || '') + '</div>' +
        '<div class="cj-psi-variant-card__price">' + escapeHtml(priceLabel) + '</div>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  function renderProductSkillRegionsTab(data) {
    var regions = data.regions || {};
    var continents = Array.isArray(regions.continents) ? regions.continents : [];
    var html = '<p class="cj-psi-hint">' +
      escapeHtml(psiT('shipping_placeholder', 'Shipping costs will be configured in Admin.')) +
      '</p>';
    if (!continents.length) {
      html += '<p class="cj-psi-empty">' + escapeHtml(psiT('empty', 'No data available yet.')) + '</p>';
      return html;
    }
    continents.forEach(function (cont, idx) {
      var countries = Array.isArray(cont.countries) ? cont.countries : [];
      html += '<details class="cj-psi-region">';
      html += '<summary><span>' + escapeHtml(cont.title || cont.code || '') + '</span>' +
        '<span class="cj-psi-region__count">' +
        escapeHtml(psiT('countries_count', '{{ n }} countries', { n: String(countries.length) })) +
        '</span></summary>';
      countries.forEach(function (c) {
        var flag = c.flag_code
          ? '<img class="cj-psi-country__flag" src="' + FLAG_CDN + escapeHtml(c.flag_code) + '.svg" alt="" loading="lazy">'
          : '<span class="cj-psi-country__flag" aria-hidden="true"></span>';
        var ship = psiT('shipping_tba', 'TBA');
        html += '<div class="cj-psi-country">' + flag +
          '<span class="cj-psi-country__name">' + escapeHtml(c.name || c.code || '') + '</span>' +
          '<span class="cj-psi-country__ship">' +
          escapeHtml(psiT('shipping_first', '1st') + ': ' + ship + ' · ' + psiT('shipping_additional', 'Add.') + ': ' + ship) +
          '</span></div>';
      });
      html += '</details>';
    });
    return html;
  }

  function renderProductSkillPrintAreasTab(data) {
    var areas = Array.isArray(data.print_areas) ? data.print_areas : [];
    if (!areas.length) {
      return '<p class="cj-psi-empty">' + escapeHtml(psiT('empty', 'No data available yet.')) + '</p>';
    }
    return '<div class="cj-psi-print-grid">' + areas.map(function (a) {
      var img = a.shop_mock_url
        ? '<img src="' + escapeHtml(a.shop_mock_url) + '" alt="" loading="lazy">'
        : '';
      return '<div class="cj-psi-print-card">' +
        '<div class="cj-psi-print-card__label">' + escapeHtml(a.label || a.position || '') + '</div>' +
        '<div class="cj-psi-print-card__stage">' + img + '</div></div>';
    }).join('') + '</div>';
  }

  function sanitizePsiHtml(html) {
    if (!html) return '<p class="cj-psi-empty">' + escapeHtml(psiT('details_empty', 'No details yet.')) + '</p>';
    var wrap = document.createElement('div');
    wrap.innerHTML = String(html);
    wrap.querySelectorAll('script,style,iframe,object,embed').forEach(function (n) { n.remove(); });
    wrap.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes || []).forEach(function (attr) {
        if (/^on/i.test(attr.name) || String(attr.value || '').trim().toLowerCase().indexOf('javascript:') === 0) {
          el.removeAttribute(attr.name);
        }
      });
    });
    var out = wrap.innerHTML.trim();
    return out || '<p class="cj-psi-empty">' + escapeHtml(psiT('details_empty', 'No details yet.')) + '</p>';
  }

  function normalizePsiSectionTitle(s) {
    return String(s == null ? '' : s)
      .replace(/&nbsp;/gi, ' ')
      .replace(/[:：]\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Accordion summary already shows the section label — remove a matching leading
   * title block from catalog HTML (e.g. <p><strong>Product Features:</strong></p>).
   */
  function stripLeadingPsiSectionTitle(html, labels) {
    var raw = html != null ? String(html).trim() : '';
    if (!raw) return '';
    var aliases = (Array.isArray(labels) ? labels : [labels])
      .map(normalizePsiSectionTitle)
      .filter(Boolean);
    if (!aliases.length) return raw;

    function isAlias(text) {
      return aliases.indexOf(normalizePsiSectionTitle(text)) !== -1;
    }

    var wrap = document.createElement('div');
    wrap.innerHTML = raw;

    function firstMeaningfulNode(root) {
      for (var i = 0; i < root.childNodes.length; i++) {
        var n = root.childNodes[i];
        if (n.nodeType === 8) continue;
        if (n.nodeType === 3 && !String(n.textContent || '').trim()) continue;
        return n;
      }
      return null;
    }

    var first = firstMeaningfulNode(wrap);
    if (!first) return raw;

    if (first.nodeType === 3) {
      var plain = String(first.textContent || '');
      var m = plain.match(/^([^\n:：]+)[:：]?\s*/);
      if (m && isAlias(m[1])) {
        first.textContent = plain.slice(m[0].length);
        if (!String(first.textContent || '').trim()) first.remove();
      }
      return wrap.innerHTML.trim();
    }

    if (first.nodeType !== 1) return raw;

    if (isAlias(first.textContent)) {
      first.remove();
      return wrap.innerHTML.trim();
    }

    var lead = firstMeaningfulNode(first);
    if (
      lead &&
      lead.nodeType === 1 &&
      /^(STRONG|B|H1|H2|H3|H4)$/i.test(lead.tagName) &&
      isAlias(lead.textContent)
    ) {
      lead.remove();
      if (!normalizePsiSectionTitle(first.textContent)) first.remove();
    }

    return wrap.innerHTML.trim();
  }

  var PSI_SECTION_TITLE_ALIASES = {
    product_features: ['Product Features', 'Produkteigenschaften', 'Features'],
    care_instructions: ['Care Instructions', 'Pflegehinweise', 'Pflege'],
    size_table: ['Size Table', 'Größentabelle', 'Size Guide'],
    gpsr: ['GPSR'],
  };

  function renderProductSkillDetailsTab(data) {
    var d = data.product_details || {};
    var sections = [
      { key: 'product_features', label: psiT('details_features', 'Product Features'), html: d.product_features, open: true },
      { key: 'care_instructions', label: psiT('details_care', 'Care Instructions'), html: d.care_instructions, open: false },
      { key: 'size_table', label: psiT('details_size', 'Size Table'), html: d.size_table_html, open: false },
      { key: 'gpsr', label: psiT('details_gpsr', 'GPSR'), html: d.gpsr_html, open: false }
    ];
    return '<div class="cj-psi-details-acc">' + sections.map(function (sec) {
      var aliases = (PSI_SECTION_TITLE_ALIASES[sec.key] || []).slice();
      if (sec.label) aliases.unshift(sec.label);
      var bodyHtml = stripLeadingPsiSectionTitle(sec.html, aliases);
      return '<details' + (sec.open ? ' open' : '') + '>' +
        '<summary>' + escapeHtml(sec.label) + '</summary>' +
        '<div class="cj-psi-details-acc__body">' + sanitizePsiHtml(bodyHtml) + '</div>' +
        '</details>';
    }).join('') + '</div>';
  }

  function fillProductSkillPanels(data) {
    var panels = document.getElementById('cjProductSkillPanels');
    if (!panels) return;
    var map = {
      overview: renderProductSkillOverview(data),
      skill: renderProductSkillSkillTab(data),
      variants: renderProductSkillVariantsTab(data),
      regions: renderProductSkillRegionsTab(data),
      print_areas: renderProductSkillPrintAreasTab(data),
      details: renderProductSkillDetailsTab(data)
    };
    Object.keys(map).forEach(function (key) {
      var panel = panels.querySelector('[data-cj-psi-panel="' + key + '"]');
      if (panel) panel.innerHTML = map[key];
    });
  }

  function showSimpleSkillInfoMode() {
    var dialog = document.getElementById('cjRoyaltyInfoDialog');
    var simple = document.getElementById('cjRoyaltyInfoSimple');
    var product = document.getElementById('cjProductSkillInfo');
    if (dialog) dialog.classList.remove('is-product-skill');
    if (simple) simple.hidden = false;
    if (product) product.hidden = true;
  }

  function showProductSkillInfoMode() {
    var dialog = document.getElementById('cjRoyaltyInfoDialog');
    var simple = document.getElementById('cjRoyaltyInfoSimple');
    var product = document.getElementById('cjProductSkillInfo');
    if (dialog) dialog.classList.add('is-product-skill');
    if (simple) simple.hidden = true;
    if (product) product.hidden = false;
  }

  function localizeProductSkillTabs() {
    var tabs = document.getElementById('cjProductSkillTabs');
    if (!tabs) return;
    var labels = {
      overview: psiT('tab_overview', 'Overview'),
      skill: psiT('tab_skill', 'Skill Info'),
      variants: psiT('tab_variants', 'Variants'),
      regions: psiT('tab_regions', 'Regions'),
      print_areas: psiT('tab_print_areas', 'Print Areas'),
      details: psiT('tab_details', 'Product Details')
    };
    tabs.querySelectorAll('[data-cj-psi-tab]').forEach(function (btn) {
      var key = btn.getAttribute('data-cj-psi-tab');
      if (key && labels[key]) btn.textContent = labels[key];
    });
  }

  function openProductSkillInfoModal(node) {
    ensureProductSkillInfoBindings();
    showProductSkillInfoMode();
    localizeProductSkillTabs();

    var title = skillInfoField(node, 'title', null) || node.product_key || '';
    var iconHtml = skillIconSvgForNode(node) || CATEGORY_ICON_SVG.product;
    var iconEl = document.getElementById('cjProductSkillIcon');
    var titleEl = document.getElementById('cjProductSkillTitle');
    var metaEl = document.getElementById('cjProductSkillMeta');
    if (iconEl) iconEl.innerHTML = iconHtml;
    if (titleEl) titleEl.textContent = title;

    var metaParts = [];
    var minLv = Number(node.min_level) || 1;
    metaParts.push(tpl('creator.journey.level_badge', 'Level {{ n }}', { n: String(minLv) }));
    if (!node.unlocked && nodeEffectiveCost(node) > 0) {
      metaParts.push(formatEazBadge(Number(node.eaz_committed) || 0, nodeEffectiveCost(node), false, false));
    }
    if (metaEl) {
      metaEl.textContent = metaParts.join(' · ');
      metaEl.hidden = !metaParts.length;
    }

    setProductSkillTab('overview');
    var panels = document.getElementById('cjProductSkillPanels');
    if (panels) {
      panels.querySelectorAll('[data-cj-psi-panel]').forEach(function (panel) {
        panel.innerHTML = '<p class="cj-psi-loading">' +
          escapeHtml(psiT('loading', 'Loading product info…')) + '</p>';
      });
    }

    var token = ++productSkillInfoToken;
    var pk = String(node.product_key || '').trim();
    apiFetch('get-journey-product-skill-info', { product_key: pk })
      .then(function (data) {
        if (token !== productSkillInfoToken) return;
        if (!data || !data.ok) throw new Error((data && data.error) || 'load_failed');
        if (titleEl && data.title) titleEl.textContent = data.title;
        fillProductSkillPanels(data);
        setProductSkillTab('overview');
      })
      .catch(function () {
        if (token !== productSkillInfoToken) return;
        var err = '<p class="cj-psi-error">' +
          escapeHtml(psiT('load_error', 'Could not load product information.')) + '</p>';
        if (panels) {
          panels.querySelectorAll('[data-cj-psi-panel]').forEach(function (panel) {
            panel.innerHTML = err;
          });
        }
      });
  }

  function openSkillInfoModal(nodeKey, opts) {
    opts = opts || {};
    var overlayEl = document.getElementById('cjRoyaltyInfoOverlay');
    if (!overlayEl || !nodeKey) return;

    var isEaz = opts.type === 'eaz_economy';
    var node = isEaz ? findEazEconomyNode(nodeKey) : findJourneyNode(nodeKey);
    if (!node) return;

    if (!isEaz && isProductSkillNode(node)) {
      openProductSkillInfoModal(node);
      overlayEl.hidden = false;
      overlayEl.classList.add('is-open');
      overlayEl.setAttribute('aria-hidden', 'false');
      var closeBtnProduct = document.getElementById('cjRoyaltyInfoClose');
      if (closeBtnProduct) closeBtnProduct.focus();
      return;
    }

    showSimpleSkillInfoMode();

    var modalOpts = isEaz ? { type: 'eaz_economy' } : null;
    var title = skillInfoField(node, 'title', modalOpts);
    var body = skillInfoField(node, 'body', modalOpts);
    var iconEl = document.getElementById('cjRoyaltyInfoIcon');
    var titleEl = document.getElementById('cjRoyaltyInfoTitle');
    var bodyEl = document.getElementById('cjRoyaltyInfoBody');
    var metaEl = document.getElementById('cjRoyaltyInfoMeta');
    var noteEl = document.getElementById('cjRoyaltyInfoNote');

    if (iconEl) {
      iconEl.innerHTML = isEaz
        ? eazEconomySkillIconSvg(node)
        : (skillIconSvgForNode(node) || CATEGORY_ICON_SVG.product);
    }
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = body;

    var metaParts = [];
    if (!isEaz && node.category === 'royalty') {
      var salesRef = node.metadata && node.metadata.sales_ref != null
        ? Number(node.metadata.sales_ref)
        : null;
      if (salesRef != null && salesRef > 0) {
        metaParts.push(tpl('creator.journey.royalty_sales_ref', '~{{ n }} sales at €10 net', {
          n: String(salesRef)
        }));
      }
    }
    var minLv = isEaz
      ? (Number(node.mascot_min_level) || 1)
      : (Number(node.min_level) || 1);
    metaParts.push(tpl('creator.journey.level_badge', 'Level {{ n }}', { n: String(minLv) }));
    if (isEaz && node.activation_cost_eaz > 0) {
      metaParts.push(formatEazBadge(Number(node.eaz_paid) || 0, Number(node.activation_cost_eaz) || 0, false, false));
    } else if (!isEaz && !node.unlocked && nodeEffectiveCost(node) > 0) {
      metaParts.push(formatEazBadge(Number(node.eaz_committed) || 0, nodeEffectiveCost(node), false, false));
    }
    if (metaEl) {
      metaEl.textContent = metaParts.join(' · ');
      metaEl.hidden = !metaParts.length;
    }
    if (noteEl) {
      if (!isEaz && node.category === 'royalty') {
        noteEl.textContent = t(
          'creator.journey.royalty_min_payout_note',
          'Payouts use at least €2 net profit equivalent. Actual earnings vary with margin and promotions.'
        );
        noteEl.hidden = false;
      } else {
        var note = skillInfoField(node, 'note', modalOpts);
        if (note && note !== skillInfoInlineFallback(node, 'note', modalOpts)) {
          noteEl.textContent = note;
          noteEl.hidden = false;
        } else {
          noteEl.textContent = '';
          noteEl.hidden = true;
        }
      }
    }

    overlayEl.hidden = false;
    overlayEl.classList.add('is-open');
    overlayEl.setAttribute('aria-hidden', 'false');
    var closeBtn = document.getElementById('cjRoyaltyInfoClose');
    if (closeBtn) closeBtn.focus();
  }

  function openRoyaltyInfoModal(nodeKey) {
    openSkillInfoModal(nodeKey);
  }

  function closeRoyaltyInfoModal() {
    closeSkillInfoModal();
  }

  function closeSkillInfoModal() {
    var overlayEl = document.getElementById('cjRoyaltyInfoOverlay');
    if (!overlayEl) return;
    overlayEl.classList.remove('is-open');
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.hidden = true;
    productSkillInfoToken += 1;
    showSimpleSkillInfoMode();
  }

  function confirmCommitModal() {
    var amountInput = document.getElementById('cjCommitAmount');
    var errEl = document.getElementById('cjCommitError');
    if (!pendingCommitNodeKey || !amountInput) return;
    var amt = parseLocaleAmount(amountInput.value);
    var avail = journeyData && journeyData.balance_eaz != null ? Number(journeyData.balance_eaz) : 0;
    if (!Number.isFinite(amt) || amt <= 0) {
      if (errEl) {
        errEl.textContent = t('creator.journey.commit_modal_invalid_amount', 'Enter a valid amount greater than zero.');
        errEl.hidden = false;
      }
      return;
    }
    if (amt > avail + 1e-9) {
      if (errEl) {
        errEl.textContent = t('creator.journey.commit_modal_insufficient', 'Not enough EAZV available.');
        errEl.hidden = false;
      }
      return;
    }
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    openCommitConfirm(Math.round(amt * 100) / 100);
  }

  function executePendingCommit() {
    var key = pendingCommitNodeKey;
    var amt = pendingCommitAmount;
    var meta = pendingCommitMeta;
    if (!key || !Number.isFinite(amt) || amt <= 0) return;
    closeCommitModal();
    commitNode(key, amt, meta).catch(function (err) {
      console.warn('[CreatorJourney] commit', err);
      var detail = journeyErrorDetail(err);
      showCjToast(
        detail || t('creator.journey.commit_fail', 'Could not commit EAZV. Please try again.'),
        true
      );
    });
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

  function storeJourneyOnWindow(data) {
    if (!data || !data.ok) return;
    window.__EAZ_CREATOR_JOURNEY__ = data;
    window.__EAZ_CREATOR_JOURNEY_FETCHED_AT__ = Date.now();
  }

  function journeyCacheFresh() {
    return !!(journeyData && journeyData.ok && journeyFetchedAt &&
      (Date.now() - journeyFetchedAt) < JOURNEY_CACHE_TTL_MS);
  }

  function overviewCacheFresh() {
    return !!(overviewStatsData && overviewStatsData.ok && overviewFetchedAt &&
      (Date.now() - overviewFetchedAt) < OVERVIEW_CACHE_TTL_MS);
  }

  function invalidateJourneyCaches() {
    journeyFetchedAt = 0;
    overviewFetchedAt = 0;
    journeyLoadPromise = null;
    overviewLoadPromise = null;
    eazEconomyData = null;
    eazEconomyLoadPromise = null;
    levelData = null;
    levelLoadPromise = null;
    window.__EAZ_JOURNEY_LEVEL_DATA__ = null;
    window.__EAZ_JOURNEY_LEVEL_LOAD_PROMISE__ = null;
    window.__EAZ_CREATOR_JOURNEY__ = null;
    window.__EAZ_CREATOR_JOURNEY_FETCHED_AT__ = 0;
  }

  async function loadOverviewStats(opts) {
    opts = opts || {};
    var oid = ownerId();
    if (!oid) return null;
    if (!opts.force && overviewCacheFresh()) return overviewStatsData;
    if (overviewLoadPromise) return overviewLoadPromise;
    overviewLoadPromise = (async function () {
      try {
        await loadOverviewPrefs();
        overviewStatsData = await apiFetch('get-journey-overview-stats', { owner_id: oid, days: '90' });
        overviewFetchedAt = Date.now();
        return overviewStatsData;
      } catch (e) {
        overviewStatsData = null;
        overviewFetchedAt = 0;
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

  async function loadLevelData(opts) {
    opts = opts || {};
    var force = !!opts.force;
    var oid = ownerId();
    if (!oid) return;
    if (!force && levelData && levelData.ok) {
      window.__EAZ_JOURNEY_LEVEL_DATA__ = levelData;
      renderFloatLevel();
      return levelData;
    }
    if (levelLoadPromise) return levelLoadPromise;

    levelLoadPromise = (async function () {
      try {
        levelData = await apiFetch('get-level', { owner_id: oid });
        window.__EAZ_JOURNEY_LEVEL_DATA__ = levelData;
        document.dispatchEvent(new CustomEvent('creator-journey-level-data', { detail: levelData }));
        renderFloatLevel();
        return levelData;
      } catch (e) {
        levelData = null;
        window.__EAZ_JOURNEY_LEVEL_DATA__ = null;
        console.warn('[CreatorJourney] level', e);
        renderFloatLevel();
        return null;
      } finally {
        levelLoadPromise = null;
        window.__EAZ_JOURNEY_LEVEL_LOAD_PROMISE__ = null;
      }
    })();
    window.__EAZ_JOURNEY_LEVEL_LOAD_PROMISE__ = levelLoadPromise;
    return levelLoadPromise;
  }

  async function loadJourney(opts) {
    opts = opts || {};
    var force = !!opts.force;
    var oid = ownerId();
    if (!oid) return;
    if (!force && journeyCacheFresh()) {
      setPanelLoading(false);
      renderSidebarBalance();
      renderTree();
      if (overviewCacheFresh()) {
        renderOverview();
      } else {
        loadOverviewStats().then(function () { renderOverview(); }).catch(console.warn);
      }
      storeJourneyOnWindow(journeyData);
      return journeyData;
    }
    if (window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__) return window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__;
    if (journeyLoadPromise) return journeyLoadPromise;

    setPanelLoading(true);
    renderSidebarBalance();
    journeyLoadPromise = (async function () {
      try {
        // Journey first — paint shell ASAP. Overview is independent and must not block the tree.
        journeyData = await apiFetch('get-creator-journey', { owner_id: oid });
        journeyFetchedAt = Date.now();
        storeJourneyOnWindow(journeyData);
        try {
          window.dispatchEvent(new CustomEvent('creator-journey-updated', {
            detail: { source: 'journey-modal', journey: journeyData },
          }));
        } catch (_ev) {}
        if (journeyData && journeyData.balance_eaz == null) {
          var seededBal = readCachedBalanceEaz();
          if (seededBal != null) journeyData.balance_eaz = seededBal;
        }
        renderSidebarBalance();
        renderTree();
        setPanelLoading(false);
        loadOverviewStats({ force: force }).then(function () {
          renderOverview();
        }).catch(function (e) {
          console.warn('[CreatorJourney] overview stats', e);
        });
      } catch (e) {
        journeyData = null;
        journeyFetchedAt = 0;
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
        window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__ = null;
      }
    })();
    window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__ = journeyLoadPromise;

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

  async function commitNode(nodeKey, amount, meta) {
    var oid = ownerId();
    if (!oid) throw new Error('missing_owner_id');
    var avail = journeyData && journeyData.balance_eaz != null ? Number(journeyData.balance_eaz) : 0;
    var amt = amount != null ? amount : avail;
    if (!amt || amt <= 0) return;

    if (meta && meta.type === 'eaz_economy') {
      var resEaz = await apiFetch('commit-eaz-economy-skill', { owner_id: oid }, 'POST', {
        skill_key: nodeKey,
        amount: amt
      });
      if (!resEaz || resEaz.ok === false) {
        var errEaz = new Error((resEaz && resEaz.error) || 'commit_failed');
        errEaz.body = resEaz || {};
        throw errEaz;
      }
      showCjToast(tpl('creator.journey.commit_success', 'Committed {{ amount }} EAZV', {
        amount: formatEazAmount(resEaz.committed != null ? resEaz.committed : amt)
      }));
      eazEconomyData = null;
      await Promise.all([loadJourney({ force: true }), loadEazEconomyTree()]);
      renderTree();
      return resEaz;
    }

    var res = await apiFetch('commit-creator-unlock', { owner_id: oid }, 'POST', {
      node_key: nodeKey,
      amount: amt
    });
    if (!res || res.ok === false) {
      var err = new Error((res && res.error) || 'commit_failed');
      err.body = res || {};
      throw err;
    }
    showCjToast(tpl('creator.journey.commit_success', 'Committed {{ amount }} EAZV', {
      amount: formatEazAmount(res.committed != null ? res.committed : amt)
    }));
    await loadJourney({ force: true });
    if (res.unlocked) {
      var node = findJourneyNode(nodeKey) || (meta && meta.node) || null;
      showUnlockCelebration({
        name: (meta && meta.title) || (node ? nodeTitle(node) : nodeKey),
        node: node
      });
    }
    return res;
  }

  async function unlockNode(nodeKey) {
    var oid = ownerId();
    if (!oid) {
      showCjToast(tpl('creator.journey.unlock_fail', 'Could not unlock. {{ detail }}', { detail: 'missing owner' }), true);
      return;
    }
    var before = findJourneyNode(nodeKey);
    var title = before ? nodeTitle(before) : nodeKey;
    try {
      var res = await apiFetch('unlock-creator-node', { owner_id: oid }, 'POST', { node_key: nodeKey });
      if (!res || res.ok === false) {
        var err = new Error((res && res.error) || 'unlock_failed');
        err.body = res || {};
        throw err;
      }
      await loadJourney({ force: true });
      var after = findJourneyNode(nodeKey) || before;
      if (res.unlocked || res.already_unlocked || (after && after.unlocked)) {
        showUnlockCelebration({ name: title, node: after || before });
      } else {
        showCjToast(tpl('creator.journey.commit_success', 'Committed {{ amount }} EAZV', {
          amount: formatEazAmount(res.committed || 0)
        }));
      }
    } catch (e) {
      console.warn('[CreatorJourney] unlock', e);
      var detail = journeyErrorDetail(e);
      showCjToast(
        tpl('creator.journey.unlock_fail', 'Could not unlock. {{ detail }}', {
          detail: detail || ''
        }),
        true
      );
    }
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
    renderSidebarBalance();
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
    var commitConfirmCancel = document.getElementById('cjCommitConfirmCancel');
    var commitConfirmOk = document.getElementById('cjCommitConfirmOk');
    var commitConfirmOverlay = document.getElementById('cjCommitConfirmOverlay');
    var royaltyInfoClose = document.getElementById('cjRoyaltyInfoClose');
    var royaltyInfoOverlay = document.getElementById('cjRoyaltyInfoOverlay');
    if (commitCancel) commitCancel.addEventListener('click', closeCommitModal);
    if (commitConfirm) commitConfirm.addEventListener('click', confirmCommitModal);
    if (commitConfirmCancel) commitConfirmCancel.addEventListener('click', closeCommitConfirm);
    if (commitConfirmOk) commitConfirmOk.addEventListener('click', executePendingCommit);
    if (royaltyInfoClose) royaltyInfoClose.addEventListener('click', closeSkillInfoModal);
    if (commitOverlay) {
      commitOverlay.addEventListener('click', function (e) {
        if (e.target === commitOverlay) closeCommitModal();
      });
    }
    if (commitConfirmOverlay) {
      commitConfirmOverlay.addEventListener('click', function (e) {
        if (e.target === commitConfirmOverlay) closeCommitConfirm();
      });
    }
    if (royaltyInfoOverlay) {
      royaltyInfoOverlay.addEventListener('click', function (e) {
        if (e.target === royaltyInfoOverlay) closeSkillInfoModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var royaltyOpen = document.getElementById('cjRoyaltyInfoOverlay');
      if (royaltyOpen && royaltyOpen.classList.contains('is-open')) {
        closeSkillInfoModal();
        return;
      }
      var confirmOpen = document.getElementById('cjCommitConfirmOverlay');
      if (confirmOpen && confirmOpen.classList.contains('is-open')) {
        closeCommitConfirm();
        return;
      }
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
      if (isOpen()) loadLevelData({ force: true });
    });

    document.addEventListener('eazBalanceUpdated', function (e) {
      if (!isOpen()) return;
      var detail = e && e.detail ? e.detail : {};
      if (detail.inactive) return;
      if (detail.balance != null && journeyData) {
        journeyData.balance_eaz = Number(detail.balance);
      }
      renderSidebarBalance();
    });

    /* Full journey loads on modal open — daily-limits strip uses get-daily-limits. */
  }

  window.CreatorJourneyModal = {
    open: open,
    close: close,
    isOpen: isOpen,
    getCachedLevelData: function () {
      return levelData && levelData.ok ? levelData : (window.__EAZ_JOURNEY_LEVEL_DATA__ || null);
    },
    getCachedJourneyData: function () {
      if (journeyData && journeyData.ok) return journeyData;
      return window.__EAZ_CREATOR_JOURNEY__ || null;
    },
    reload: function () {
      invalidateJourneyCaches();
      levelData = null;
      window.__EAZ_JOURNEY_LEVEL_DATA__ = null;
      return Promise.all([loadJourney({ force: true }), loadLevelData({ force: true })]);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
