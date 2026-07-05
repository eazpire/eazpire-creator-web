/**
 * Hero Images Screen – Marketing > Content Publish (Hero Images List)
 * Liste und Verwaltung generierter Hero Images
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');
  var heroImages = [];
  var filteredHeroImages = [];
  var viewMode = 'grid2';
  var contexts = [];
  var currentRegionFilter = 'ALL';
  var currentSearchQuery = '';
  var REGION_TABS = [
    { code: 'ALL', label: 'Alle' },
    { code: 'EU', label: 'Europa' },
    { code: 'US', label: 'USA' },
    { code: 'GB', label: 'UK' },
    { code: 'CA', label: 'Kanada' },
    { code: 'AU', label: 'Australien' },
    { code: 'CN', label: 'China' },
    { code: 'PRINTIFY_CHOICE', label: 'Printify Choice' }
  ];

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) return String(window.__EAZ_OWNER_ID);
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  async function fetchHeroImages() {
    var owner = getOwnerId();
    if (!owner) return [];

    try {
      var url = API_BASE + '?op=hero-list&owner_id=' + encodeURIComponent(owner) + '&limit=100';
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () { return { ok: false, items: [] }; });
      if (!data.ok || !Array.isArray(data.items)) return [];
      return (data.items || []).map(function (item) {
        return {
          id: String(item.id || ''),
          image_url: item.image_url || item.thumbnail_url,
          preview_url: item.thumbnail_url || item.image_url,
          title: item.title || item.user_prompt || ('Hero #' + (item.id || '')),
          created_at: item.created_at || 0,
          status: item.status || 'active',
          published_at: item.published_at || null,
          region: String(item.region || 'EU').toUpperCase()
        };
      });
    } catch (e) {
      console.warn('[HeroImagesScreen] Fetch error:', e);
      return [];
    }
  }

  function filterHeroImages(query, regionCode) {
    currentSearchQuery = String(query || '');
    currentRegionFilter = String(regionCode || currentRegionFilter || 'ALL').toUpperCase();

    var source = heroImages.slice();
    if (currentRegionFilter !== 'ALL') {
      source = source.filter(function (h) {
        return String(h.region || 'EU').toUpperCase() === currentRegionFilter;
      });
    }

    if (!currentSearchQuery || !currentSearchQuery.trim()) {
      filteredHeroImages = source;
    } else {
      var q = currentSearchQuery.trim().toLowerCase();
      filteredHeroImages = source.filter(function (h) {
        return (h.title || '').toLowerCase().indexOf(q) >= 0 || (h.product_key || '').toLowerCase().indexOf(q) >= 0;
      });
    }
  }

  function getRegionCounts() {
    var counts = { ALL: heroImages.length };
    REGION_TABS.forEach(function (tab) {
      if (tab.code !== 'ALL') counts[tab.code] = 0;
    });
    heroImages.forEach(function (h) {
      var region = String(h.region || 'OTHER').toUpperCase();
      if (!counts[region] && counts[region] !== 0) counts[region] = 0;
      counts[region] += 1;
    });
    return counts;
  }

  function ensureRegionTabs(panel) {
    if (!panel) return null;
    var existing = panel.querySelector('[data-hero-region-tabs]');
    if (existing) return existing;
    var tabs = document.createElement('div');
    tabs.className = 'creator-hero-region-tabs';
    tabs.setAttribute('data-hero-region-tabs', 'true');
    panel.insertBefore(tabs, panel.firstChild);
    return tabs;
  }

  function renderRegionTabs() {
    var counts = getRegionCounts();
    contexts.forEach(function (ctx) {
      if (!ctx.tabsRoot) return;
      ctx.tabsRoot.innerHTML = REGION_TABS.map(function (tab) {
        var active = currentRegionFilter === tab.code;
        var count = counts[tab.code] || 0;
        return (
          '<button type="button" class="creator-hero-region-tab' + (active ? ' is-active' : '') + '" data-hero-region-tab="' + tab.code + '">' +
          '<span class="creator-hero-region-tab__label">' + tab.label + '</span>' +
          '<span class="creator-hero-region-tab__count">' + count + '</span>' +
          '</button>'
        );
      }).join('');
      ctx.tabsRoot.querySelectorAll('[data-hero-region-tab]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var next = String(btn.getAttribute('data-hero-region-tab') || 'ALL').toUpperCase();
          if (next === currentRegionFilter) return;
          filterHeroImages(currentSearchQuery, next);
          renderRegionTabs();
          contexts.forEach(function (otherCtx) { renderHeroImagesGrid(otherCtx); });
        });
      });
    });
  }

  function createHeroImageCard(item) {
    var card = document.createElement('div');
    card.className = 'creator-hero-image-card';
    card.dataset.heroId = item.id || '';
    var url = item.preview_url || item.image_url;
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.alt = item.title || 'Hero Image';
      img.loading = 'lazy';
      card.appendChild(img);
    } else {
      var noImg = document.createElement('div');
      noImg.className = 'creator-hero-image-card-noimg';
      noImg.textContent = '—';
      card.appendChild(noImg);
    }
    card.addEventListener('click', function () {
      if (item.id && window.HeroPreviewModal && typeof window.HeroPreviewModal.open === 'function') {
        window.HeroPreviewModal.open(item.id);
        return;
      }
      if (url) {
        window.dispatchEvent(new CustomEvent('hero-image-selected', { detail: { imageUrl: url, hero: item } }));
      }
    });
    return card;
  }

  function renderHeroImagesGrid(ctx) {
    var grid = ctx.grid;
    var empty = ctx.empty;
    var loading = ctx.loading;

    if (!grid) return;

    grid.innerHTML = '';
    if (loading) loading.style.display = 'none';

    if (filteredHeroImages.length === 0) {
      if (empty) {
        empty.style.display = 'block';
        if (heroImages.length === 0) empty.textContent = 'Noch keine Hero Images.';
        else if (currentRegionFilter !== 'ALL' && !currentSearchQuery) empty.textContent = 'Keine Hero Images in dieser Region.';
        else empty.textContent = 'Keine Treffer für die Suche.';
      }
    } else {
      if (empty) empty.style.display = 'none';
      filteredHeroImages.forEach(function (item) {
        grid.appendChild(createHeroImageCard(item));
      });
    }
  }

  function goToCreate() {
    if (window.MarketingScreen) {
      window.MarketingScreen.switchSubTab('content-creation');
      window.MarketingScreen.switchContentTab('hero-images');
    }
    window.dispatchEvent(new CustomEvent('hero-create-requested'));
  }

  async function loadHeroImages() {
    var hasCtx = contexts && contexts.length > 0;
    if (hasCtx) {
      contexts.forEach(function (ctx) {
        if (ctx.loading) ctx.loading.style.display = 'block';
      });
    }
    heroImages = await fetchHeroImages();
    filterHeroImages(currentSearchQuery, currentRegionFilter);
    if (!hasCtx) return;
    renderRegionTabs();
    contexts.forEach(function (ctx) {
      renderHeroImagesGrid(ctx);
    });
  }

  function registerContext(grid, empty, loading, tabsRoot) {
    if (!grid) return;
    contexts.push({ grid: grid, empty: empty || null, loading: loading || null, tabsRoot: tabsRoot || null });
  }

  function bind() {
    var panelMobile = document.getElementById('creatorHeroImagesPanel');
    var gridMobile = document.getElementById('creatorHeroImagesGrid');
    var emptyMobile = document.getElementById('creatorHeroImagesEmpty');
    var loadingMobile = document.getElementById('creatorHeroImagesLoading');

    var panelDesktop = document.getElementById('creatorDesktopHeroImagesPanel')
      || document.querySelector('#creatorDesktopMarketingHost #creatorHeroImagesPanel');
    var gridDesktop = document.getElementById('creatorDesktopHeroImagesGrid')
      || document.querySelector('#creatorDesktopMarketingHost #creatorHeroImagesGrid');
    var emptyDesktop = document.getElementById('creatorDesktopHeroImagesEmpty')
      || document.querySelector('#creatorDesktopMarketingHost #creatorHeroImagesEmpty');
    var loadingDesktop = document.getElementById('creatorDesktopHeroImagesLoading')
      || document.querySelector('#creatorDesktopMarketingHost #creatorHeroImagesLoading');

    var tabsMobile = panelMobile ? ensureRegionTabs(panelMobile) : null;
    var tabsDesktop = panelDesktop ? ensureRegionTabs(panelDesktop) : null;

    if (gridMobile) registerContext(gridMobile, emptyMobile, loadingMobile, tabsMobile);
    if (gridDesktop) registerContext(gridDesktop, emptyDesktop, loadingDesktop, tabsDesktop);

    var viewport = document.getElementById('creatorMobileSwipeViewport');
    var panelPublishMobile = document.getElementById('creatorMarketingPanelPublish');
    var panelPublishDesktop = document.getElementById('creatorDesktopMarketingPanelPublish')
      || document.querySelector('#creatorDesktopMarketingHost #creatorMarketingPanelPublish');
    var desktopStagePanel = document.getElementById('creatorDesktopPanelMarketing');

    function shouldLoadMobile() {
      return viewport && panelPublishMobile &&
        viewport.classList.contains('slide-3') &&
        !panelPublishMobile.classList.contains('creator-marketing-panel--hidden');
    }

    function shouldLoadDesktop() {
      var desktopHero = document.getElementById('creatorDesktopHero');
      if (desktopHero) {
        var active = String(desktopHero.getAttribute('data-desktop-active-screen') || 'dashboard').toLowerCase();
        if (active !== 'marketing') return false;
      }
      var desktopStageVisible = desktopStagePanel
        ? desktopStagePanel.classList.contains('is-active') && !desktopStagePanel.hidden
        : false;
      return desktopStageVisible &&
        panelPublishDesktop &&
        !panelPublishDesktop.classList.contains('creator-desktop-marketing-panel--hidden') &&
        !panelPublishDesktop.classList.contains('creator-marketing-panel--hidden');
    }

    function isDashboardHomeActive() {
      var desktopHero = document.getElementById('creatorDesktopHero');
      if (desktopHero) {
        return String(desktopHero.getAttribute('data-desktop-active-screen') || 'dashboard').toLowerCase() === 'dashboard';
      }
      return viewport && viewport.classList.contains('slide-0');
    }

    function maybeLoad() {
      if (shouldLoadMobile() || shouldLoadDesktop()) loadHeroImages();
    }

    if (viewport && panelPublishMobile) {
      var observer = new MutationObserver(maybeLoad);
      observer.observe(viewport, { attributes: true, attributeFilter: ['class'] });
      observer.observe(panelPublishMobile, { attributes: true, attributeFilter: ['class'] });
    }
    if (panelPublishDesktop) {
      var obsDesktop = new MutationObserver(maybeLoad);
      obsDesktop.observe(panelPublishDesktop, { attributes: true, attributeFilter: ['class'] });
      if (desktopStagePanel) {
        obsDesktop.observe(desktopStagePanel, { attributes: true, attributeFilter: ['class', 'hidden'] });
      }
    }

    if (!isDashboardHomeActive()) {
      maybeLoad();
    }
  }

  function init() {
    bind();
  }

  document.addEventListener('hero-image-deleted', function () {
    loadHeroImages();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HeroImagesScreen = {
    loadHeroImages: loadHeroImages,
    goToCreate: goToCreate
  };
})();
