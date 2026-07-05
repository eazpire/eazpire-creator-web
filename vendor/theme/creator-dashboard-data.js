/**
 * Tab-gated dashboard loading + shared overview stats (get-dashboard-stats).
 */
(function () {
  'use strict';

  var tabLoaded = {
    dashboard: false,
    creations: false,
    marketing: false,
    automations: false,
    generator: false
  };

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

  function apiGet(op, params) {
    if (typeof window.creatorApiFetch === 'function') {
      return window.creatorApiFetch(op, params || {});
    }
    var url = new URL(apiBase() + '/apps/creator-dispatch');
    url.searchParams.set('op', op);
    url.searchParams.set('_t', String(Date.now()));
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] != null && params[k] !== '') url.searchParams.set(k, String(params[k]));
    });
    return fetch(url.toString(), { credentials: 'include', cache: 'no-store' }).then(function (r) {
      return r.json();
    });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function applyDashboardStats(data) {
    if (!data || !data.ok) return;
    var d = data.designs || {};
    var p = data.products || {};
    var h = data.heroes || data.hero_count || {};

    var gen = Number(d.generated) || 0;
    var upl = Number(d.uploaded) || 0;
    var merged = Number(d.merged) || 0;
    var heroesGen = Number(h.generated != null ? h.generated : h.total) || 0;
    var heroesOn = Number(h.online != null ? h.online : h.published) || 0;
    var prodsOn = Number(p.online) || 0;
    var prodsOff = Number(p.offline);
    if (!Number.isFinite(prodsOff)) {
      prodsOff = Math.max(0, (Number(p.possible) || 0) - prodsOn);
    }

    var loc = function (n) {
      return n.toLocaleString();
    };

    setText('creator-desktop-stat-designs-generated', loc(gen));
    setText('creator-desktop-stat-designs-uploaded', loc(upl));
    setText('creator-desktop-stat-heroes-generated', loc(heroesGen));
    setText('creator-desktop-stat-products-online', loc(prodsOn));
    setText('creator-desktop-stat-products-offline', loc(prodsOff));
    setText('creator-desktop-stat-heroes-online', loc(heroesOn));

    setText('creator-mobile-stat-designs-generated', loc(gen));
    setText('creator-mobile-stat-designs-uploaded', loc(upl));
    setText('creator-mobile-stat-heroes-generated', loc(heroesGen));
    setText('creator-mobile-stat-products-online', loc(prodsOn));
    setText('creator-mobile-stat-products-offline', loc(prodsOff));
    setText('creator-mobile-stat-heroes-online', loc(heroesOn));
  }

  function loadOverviewStats(force) {
    var oid = ownerId();
    if (!oid) return Promise.resolve();
    if (force) tabLoaded.dashboard = false;
    var params = { owner_id: oid };
    if (force) params.force = '1';
    return apiGet('get-dashboard-stats', params).then(function (data) {
      applyDashboardStats(data);
      return data;
    });
  }

  function bootstrapCreations() {
    function runBoot() {
      function tryBoot(attempt) {
        var n = typeof attempt === 'number' ? attempt : 0;
        if (window.CreationsScreen && typeof window.CreationsScreen.setViewMode === 'function') {
          window.CreationsScreen.setViewMode('grid4');
          if (typeof window.CreationsScreen.switchTab === 'function') {
            var ct =
              typeof window.CreationsScreen.getCurrentTab === 'function'
                ? window.CreationsScreen.getCurrentTab()
                : 'designs';
            window.CreationsScreen.switchTab(ct || 'designs');
          }
          return true;
        }
        if (n < 60) {
          setTimeout(function () {
            tryBoot(n + 1);
          }, 100);
        }
        return false;
      }
      tryBoot(0);
    }

    if (window.__CreatorLazyModals && typeof window.__CreatorLazyModals.ensureCreationsBundle === 'function') {
      window.__CreatorLazyModals.ensureCreationsBundle().then(runBoot).catch(function () {
        runBoot();
      });
      return;
    }
    runBoot();
  }

  window.addEventListener('creator-creations-bundle-ready', function () {
    if (tabLoaded.creations) {
      bootstrapCreations();
    }
  });

  function ensureCreatorBillingLevelLazy() {
    if (window.__EAZ_BILLING_LEVEL || window.__eazBillingLevelLoading) return;
    if (typeof window.loadCreatorBillingLevel !== 'function') return;
    window.__eazBillingLevelLoading = true;
    window.loadCreatorBillingLevel().catch(function () {}).finally(function () {
      window.__eazBillingLevelLoading = false;
    });
  }

  function isDesktopCreatorShell() {
    return !!(
      window.__CREATOR_DASHBOARD_EMBED_PAGE &&
      window.matchMedia &&
      window.matchMedia('(min-width: 992px)').matches
    );
  }

  function ensureTabLoaded(tab) {
    var t = String(tab || '').toLowerCase();
    if (t === 'dashboard') {
      if (!tabLoaded.dashboard) {
        tabLoaded.dashboard = true;
        if (isDesktopCreatorShell() && typeof window.CreatorDesktopLoadDashboard === 'function') {
          window.CreatorDesktopLoadDashboard();
        } else {
          if (typeof window.__creatorLoadLevel === 'function') window.__creatorLoadLevel();
          if (typeof window.__creatorLoadOnboarding === 'function') window.__creatorLoadOnboarding();
          if (typeof window.CreatorDashboardData && typeof loadOverviewStats === 'function') {
            loadOverviewStats(false);
          }
          if (typeof window.__creatorLoadMobileSales === 'function') window.__creatorLoadMobileSales();
        }
      }
      return;
    }
    if (t === 'creations' && !tabLoaded.creations) {
      tabLoaded.creations = true;
      bootstrapCreations();
      return;
    }
    if (t === 'marketing' && !tabLoaded.marketing) {
      tabLoaded.marketing = true;
      if (window.EazCreatorPromotions && typeof window.EazCreatorPromotions.init === 'function') {
        window.EazCreatorPromotions.init();
      }
      return;
    }
    if (t === 'automations' && !tabLoaded.automations) {
      tabLoaded.automations = true;
      if (window.AutomationsScreen && typeof window.AutomationsScreen.refreshList === 'function') {
        setTimeout(function () {
          window.AutomationsScreen.refreshList();
        }, 0);
      }
      return;
    }
    if (t === 'generator' && !tabLoaded.generator) {
      tabLoaded.generator = true;
      ensureCreatorBillingLevelLazy();
      return;
    }
  }

  function invalidateStats() {
    tabLoaded.dashboard = false;
    tabLoaded.creations = false;
    tabLoaded.marketing = false;
    tabLoaded.automations = false;
    tabLoaded.generator = false;
  }

  function refreshDashboardShellData() {
    if (typeof window.CreatorDesktopResetDashboardScroll === 'function') {
      window.CreatorDesktopResetDashboardScroll();
    }
    invalidateStats();
    ensureTabLoaded('dashboard');
    if (typeof window.CreatorDesktopReloadBalances === 'function') {
      window.CreatorDesktopReloadBalances();
    } else if (typeof window.reloadCreatorFooterEazBalance === 'function') {
      window.reloadCreatorFooterEazBalance();
    }
  }

  window.CreatorDashboardData = {
    ensureTabLoaded: ensureTabLoaded,
    loadOverviewStats: loadOverviewStats,
    invalidateStats: invalidateStats,
    applyDashboardStats: applyDashboardStats,
    refreshDashboardShellData: refreshDashboardShellData
  };

  document.addEventListener('eaz:creator-redeemed', function () {
    refreshDashboardShellData();
  });

  // Shop ↔ Creator switch often restores this page from bfcache: JS state says "already loaded"
  // but the DOM still shows "Loading…" placeholders — reload dashboard data.
  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    if (!document.getElementById('creatorMobileApp') && !document.getElementById('creatorDesktopApp')) return;
    refreshDashboardShellData();
  });

  try {
    if (sessionStorage.getItem('__creator_switch_to_creator') === '1') {
      sessionStorage.removeItem('__creator_switch_to_creator');
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          setTimeout(refreshDashboardShellData, 50);
        }, { once: true });
      } else {
        setTimeout(refreshDashboardShellData, 50);
      }
    }
  } catch (_switchFlag) {}
})();
