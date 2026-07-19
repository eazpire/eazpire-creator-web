(function () {
  'use strict';

  var embedDashboard = false;
  try {
    embedDashboard = new URLSearchParams(window.location.search).get('creator_dashboard_embed') === '1';
  } catch (e) {}
  try {
    if (!embedDashboard && typeof window.__CREATOR_DASHBOARD_EMBED_PAGE !== 'undefined' && window.__CREATOR_DASHBOARD_EMBED_PAGE) {
      embedDashboard = true;
    }
  } catch (e2) {}

  var app = document.getElementById('creatorDesktopApp');
  if (!app) return;

  var desktopViewportMq = null;
  try {
    desktopViewportMq = window.matchMedia('(min-width: 992px)');
  } catch (_mqErr) {
    desktopViewportMq = null;
  }

  function isDesktopCreatorViewport() {
    try {
      return !!(desktopViewportMq ? desktopViewportMq.matches : window.matchMedia('(min-width: 992px)').matches);
    } catch (_e) {
      return true;
    }
  }

  // Non-embed mobile boot: wait until viewport crosses 992px, then reload so desktop shell can init.
  // Portal/embed always continues (hosts must remount on resize without a full reload).
  if (!embedDashboard && !isDesktopCreatorViewport()) {
    function bootDesktopShellWhenWide(ev) {
      var matches = ev && typeof ev.matches === 'boolean' ? ev.matches : isDesktopCreatorViewport();
      if (!matches) return;
      try {
        if (desktopViewportMq) {
          if (typeof desktopViewportMq.removeEventListener === 'function') {
            desktopViewportMq.removeEventListener('change', bootDesktopShellWhenWide);
          } else if (typeof desktopViewportMq.removeListener === 'function') {
            desktopViewportMq.removeListener(bootDesktopShellWhenWide);
          }
        }
      } catch (_rm) {}
      try {
        window.location.reload();
      } catch (_reload) {}
    }
    try {
      if (desktopViewportMq) {
        if (typeof desktopViewportMq.addEventListener === 'function') {
          desktopViewportMq.addEventListener('change', bootDesktopShellWhenWide);
        } else if (typeof desktopViewportMq.addListener === 'function') {
          desktopViewportMq.addListener(bootDesktopShellWhenWide);
        }
      }
    } catch (_add) {}
    return;
  }

  var API_BASE = 'https://creator-engine.eazpire.workers.dev';
  var ownerId = window.__EAZ_OWNER_ID;
  var i18n = window.CreatorDesktopI18n || {};
  var googleMapsScriptPromise = null;
  var leafletAssetsPromise = null;

  var TODO_DESKTOP = {
    todo_first_design: { icon: '💾', link: '/?eaz_open_shop_create=1', progressKey: 'has_any_design' },
    todo_first_product: { icon: '📦', link: '/#creations', progressKey: 'has_any_product' },
    todo_five_designs: { icon: '🎨', link: '/?eaz_open_shop_create=1', progressKey: 'has_five_designs', countKey: 'design_count', countTarget: 5 },
    todo_twenty_products: { icon: '🚀', link: '/?eaz_creations_tab=products#creations', progressKey: 'has_twenty_products', countKey: 'product_count', countTarget: 20 },
    todo_first_transaction: { icon: '🛒', link: '#', progressKey: 'has_transaction' },
    todo_become_creator: {
      icon: '⭐',
      link: '/#dashboard',
      progressKey: 'has_creator_code',
      openSettingsTab: 'creator-codes'
    },
    todo_creator_name: { icon: '👤', link: '/#dashboard', progressKey: 'has_creator_name' },
    todo_generate_design: { icon: '🎨', link: '/?eaz_open_shop_create=1', progressKey: 'has_generated_design' },
    todo_activate_design: { icon: '✅', link: '/#creations', progressKey: 'has_active_design' },
    todo_publish_product: { icon: '🚀', link: '/?eaz_creations_tab=products#creations', progressKey: 'has_published_product' },
    todo_upload_design: { icon: '📤', link: '/#creations', progressKey: 'has_uploaded_design' },
    todo_create_hero: { icon: '🖼️', link: '/?eaz_marketing_subtab=content-creation&eaz_marketing_content=hero-images#marketing', progressKey: 'has_hero_image' },
    todo_create_avatar: { icon: '👤', link: '/#dashboard#creator-image', progressKey: 'has_avatar_image' },
    todo_create_cover: { icon: '🎨', link: '/#dashboard#cover-image', progressKey: 'has_cover_image' },
    todo_remix_design: { icon: '🔄', link: 'https://www.eazpire.com/pages/inspirations', progressKey: 'has_remixed_design' },
    todo_invite_user: { icon: '👥', action: 'share_referral', progressKey: 'has_invited_user' }
  };

  function escDesktop(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setDesktopXpHint(hint) {
    var raw = String(hint || '').trim();
    var body = document.getElementById('creator-desktop-xp-hint-modal-body');
    var btn = document.getElementById('creator-desktop-xp-hint-info');
    if (body) body.textContent = raw;
    if (btn) {
      btn.hidden = !raw;
      if (!raw) btn.setAttribute('aria-expanded', 'false');
    }
  }

  function switchDesktopJourneyTab(tab) {
    var openL = document.getElementById('creator-desktop-journey-open-list');
    var compL = document.getElementById('creator-desktop-journey-completed-list');
    document.querySelectorAll('[data-desktop-journey-tab]').forEach(function (b) {
      var t = b.getAttribute('data-desktop-journey-tab');
      var active = t === tab;
      b.classList.toggle('creator-desktop-journey-tab--active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (openL) openL.classList.toggle('creator-desktop-journey__list--hidden', tab !== 'open');
    if (compL) compL.classList.toggle('creator-desktop-journey__list--hidden', tab !== 'completed');
  }

  function initDesktopJourneyTabs() {
    document.querySelectorAll('[data-desktop-journey-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-desktop-journey-tab');
        if (tab) switchDesktopJourneyTab(tab);
      });
    });
  }

  function initDesktopJourneyCreatorSettingsLinks() {
    if (!app) return;
    app.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-open-creator-settings]');
      if (!a || !app.contains(a)) return;
      e.preventDefault();
      var tab = a.getAttribute('data-open-creator-settings');
      if (!tab) return;
      if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
        window.CreatorSettingsV2Modal.open({ tab: tab });
        return;
      }
      try {
        window.location.href = a.getAttribute('data-settings-fallback-href') || '/#dashboard';
      } catch (_e) {}
    });
  }

  function initDesktopJourneyShareReferral() {
    if (!app) return;
    app.addEventListener('click', function (e) {
      var a = e.target.closest('[data-journey-share-referral]');
      if (!a || !app.contains(a)) return;
      e.preventDefault();
      openJourneyReferralShare();
    });
  }

  function initDesktopXpHintModal() {
    var modal = document.getElementById('creator-desktop-xp-hint-modal');
    var btn = document.getElementById('creator-desktop-xp-hint-info');
    if (!modal || !btn) return;
    // Header backdrop-filter creates a containing block — portal to body for viewport centering.
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    function closeM() {
      modal.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      try {
        document.body.style.overflow = '';
      } catch (_e) {}
    }
    function openM() {
      modal.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      try {
        document.body.style.overflow = 'hidden';
      } catch (_e2) {}
    }
    btn.addEventListener('click', function () {
      openM();
    });
    modal.querySelectorAll('[data-desktop-xp-modal-close]').forEach(function (el) {
      el.addEventListener('click', closeM);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeM();
    });
  }

  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
    document.querySelectorAll('[data-sync="' + id + '"]').forEach(function (node) {
      node.textContent = value;
    });
  }

  function width(id, pct) {
    var el = document.getElementById(id);
    if (el) el.style.width = Math.max(0, Math.min(100, Number(pct) || 0)) + '%';
  }

  function heightSync(id, pct) {
    var value = Math.max(0, Math.min(100, Number(pct) || 0)) + '%';
    var el = document.getElementById(id);
    if (el) el.style.height = value;
    document.querySelectorAll('[data-sync-height="' + id + '"]').forEach(function (node) {
      node.style.height = value;
    });
  }

  function getOwnerId() {
    if (ownerId) return ownerId;
    if (window.__EAZ_OWNER_ID) return window.__EAZ_OWNER_ID;
    var debugEl = document.querySelector('[data-debug-owner]');
    if (!debugEl || !debugEl.dataset || !debugEl.dataset.debugOwner) return null;
    try {
      var parsed = JSON.parse(debugEl.dataset.debugOwner);
      if (parsed) return String(parsed);
    } catch (_e) {}
    return null;
  }

  function creatorGuestBypassDesktop() {
    return window.__CREATOR_IS_LOGGED_IN === false && !window.__DEV_BYPASS;
  }

  function removeDesktopGuestNavLocks() {
    document
      .querySelectorAll('.creator-desktop-stage__panel > .creator-generator-lock.creator-guest-nav-lock')
      .forEach(function (el) {
        el.remove();
      });
  }

  /** Generator uses #creatorGenerator lock from creator-mobile bypass; skips duplicate panel overlay. */
  function syncCreatorGuestDesktopLock(screen) {
    removeDesktopGuestNavLocks();
    if (!creatorGuestBypassDesktop()) return;
    var scr = String(screen || 'dashboard').toLowerCase();
    if (scr === 'dashboard' || scr === 'generator') return;
    var panel = document.querySelector('.creator-desktop-stage__panel[data-desktop-screen="' + scr + '"]');
    if (!panel || typeof window.buildCreatorGuestLockOverlay !== 'function') return;
    panel.appendChild(window.buildCreatorGuestLockOverlay());
  }

  window.syncCreatorGuestDesktopLock = syncCreatorGuestDesktopLock;

  async function apiGet(operation, params) {
    params = params || {};
    if (typeof window.creatorApiFetch === 'function') {
      return window.creatorApiFetch(operation, params);
    }
    var url = new URL(API_BASE + '/apps/creator-dispatch');
    url.searchParams.set('op', operation);
    url.searchParams.set('_t', Date.now());
    Object.keys(params).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null) url.searchParams.set(key, String(params[key]));
    });
    var res = await fetch(url.toString(), { credentials: 'include', cache: 'no-store' });
    return res.json();
  }

  function setActiveNav(activeScreen) {
    var links = document.querySelectorAll('[data-desktop-switch]');
    if (!links.length) return;
    var target = activeScreen || 'dashboard';
    var activeTitle = '';
    links.forEach(function (link) {
      var screen = String(link.getAttribute('data-desktop-switch') || '').toLowerCase();
      var isActive = screen === target;
      link.classList.toggle('is-active', isActive);
      link.setAttribute('aria-selected', isActive ? 'true' : 'false');
      link.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive && !activeTitle) {
        var customTitle = String(link.getAttribute('data-screen-title') || '').trim();
        activeTitle = customTitle || String(link.textContent || '').trim();
      }
    });
    var titleEl = document.getElementById('creatorDesktopScreenTitle');
    if (titleEl && activeTitle) titleEl.textContent = activeTitle;
  }

  function resetDesktopDashboardScroll() {
    var panel = document.querySelector('.creator-desktop-stage__panel[data-desktop-screen="dashboard"]');
    if (panel) panel.scrollTop = 0;
  }

  function setActiveDesktopPanel(activeScreen) {
    var hero = document.getElementById('creatorDesktopHero');
    var panels = document.querySelectorAll('[data-desktop-screen]');
    var normalized = String(activeScreen || 'dashboard').toLowerCase();
    if (hero) hero.setAttribute('data-desktop-active-screen', normalized || 'dashboard');
    panels.forEach(function (panel) {
      var panelScreen = String(panel.getAttribute('data-desktop-screen') || '').toLowerCase();
      var isActive = panelScreen === normalized;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      if (isActive && panelScreen === 'dashboard') {
        panel.scrollTop = 0;
      }
    });
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }
    try {
      if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
    } catch (e) {}
  }

  function initDesktopShellSwitch() {
    var nav = document.getElementById('creatorDesktopNav');
    if (!nav) return;
    var buttons = nav.querySelectorAll('[data-desktop-switch]');
    if (!buttons.length) return;
    var allowed = { dashboard: true, generator: true, creations: true, marketing: true, automations: true };
    var order = ['dashboard', 'generator', 'creations', 'marketing', 'automations'];
    function portalScreenFromPath() {
      if (!window.__CREATOR_PORTAL_HOST__) return '';
      try {
        var path = String(window.location.pathname || '/').replace(/\/+$/, '').toLowerCase() || '/';
        if (path === '/' || path === '/dashboard') return 'dashboard';
        if (path === '/generator') return 'generator';
        if (path === '/creations') return 'creations';
        if (path === '/marketing') return 'marketing';
        if (path === '/automations') return 'automations';
      } catch (_portalPathErr) {}
      return '';
    }
    var activeScreen = 'dashboard';
    if (embedDashboard) {
      try {
        var portalPathScreen = portalScreenFromPath();
        if (portalPathScreen) {
          activeScreen = portalPathScreen;
        } else {
          var sp = new URLSearchParams(window.location.search);
          var req = String(sp.get('screen') || 'generator').toLowerCase();
          activeScreen = allowed[req] ? req : 'generator';
        }
      } catch (e2) {
        activeScreen = 'generator';
      }
    } else {
      try {
        var pathDash = window.location.pathname || '';
        var onDash =
          pathDash.indexOf('/') !== -1 ||
          pathDash.indexOf('/pages/creator-overview') !== -1;
        if (onDash) {
          var dh = (window.location.hash || '').replace(/^#/, '').toLowerCase().trim();
          if (dh === 'promotions') activeScreen = 'marketing';
          else if (allowed[dh]) activeScreen = dh;
        }
      } catch (eDash) {}
    }

    function replaceCreatorDesktopShellHash(screen) {
      if (embedDashboard) return;
      try {
        var pathDash = window.location.pathname || '';
        if (
          pathDash.indexOf('/') === -1 &&
          pathDash.indexOf('/pages/creator-overview') === -1
        ) {
          return;
        }
        var cur = (window.location.hash || '').replace(/^#/, '').toLowerCase();
        if (screen === 'dashboard' && !cur) return;
        if (cur === screen) return;
        if (screen === 'marketing' && cur === 'promotions') return;
        var u = new URL(window.location.href);
        u.hash = screen;
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
      } catch (eH) {}
    }
    var wheelLocked = false;
    var wheelUnlockTimer = null;
    var touchStartX = 0;
    var touchStartY = 0;
    var touchSwitched = false;

    function switchScreen(nextScreen) {
      var normalized = String(nextScreen || '').toLowerCase();
      if (!allowed[normalized]) normalized = 'dashboard';
      activeScreen = normalized;
      setActiveNav(activeScreen);
      setActiveDesktopPanel(activeScreen);
      replaceCreatorDesktopShellHash(activeScreen);
      // Desktop shell does not toggle creatorMobileSwipeViewport slide-*; ensure designs/products load when Creations opens.
      if (normalized === 'creations' && window.CreationsScreen && typeof window.CreationsScreen.switchTab === 'function') {
        var ct =
          typeof window.CreationsScreen.getCurrentTab === 'function'
            ? window.CreationsScreen.getCurrentTab()
            : 'designs';
        window.CreationsScreen.switchTab(ct || 'designs');
      }
      if (normalized === 'automations' && window.AutomationsScreen && typeof window.AutomationsScreen.refreshList === 'function') {
        window.setTimeout(function () {
          window.AutomationsScreen.refreshList();
        }, 0);
      }
      if (normalized === 'marketing') {
        window.setTimeout(function () {
          try {
            if (window.ContentCreationHero && typeof window.ContentCreationHero.scanHosts === 'function') {
              window.ContentCreationHero.scanHosts();
            }
          } catch (eHeroScan) {}
          try {
            if (window.CreatorVideosScreen && typeof window.CreatorVideosScreen.load === 'function') {
              window.CreatorVideosScreen.load();
            }
          } catch (eVid) {}
          if (window.ContentCreationHero && typeof window.ContentCreationHero.maybeScheduleAutoPick === 'function') {
            window.ContentCreationHero.maybeScheduleAutoPick();
          } else if (typeof window.eazMaybeScheduleHeroMarketingAutoPick === 'function') {
            window.eazMaybeScheduleHeroMarketingAutoPick();
          }
        }, 80);
      }
      syncCreatorGuestDesktopLock(normalized);
      if (window.CreatorDashboardData && typeof window.CreatorDashboardData.ensureTabLoaded === 'function') {
        window.CreatorDashboardData.ensureTabLoaded(normalized);
      }

      try {
        document.dispatchEvent(new CustomEvent('creator:shell-screen-change', { detail: { screen: normalized } }));
      } catch (_screenEv) {}
    }

    function switchByStep(step) {
      var currentIndex = Math.max(0, order.indexOf(activeScreen));
      var nextIndex = currentIndex + (step > 0 ? 1 : -1);
      nextIndex = Math.max(0, Math.min(order.length - 1, nextIndex));
      if (nextIndex === currentIndex) return false;
      switchScreen(order[nextIndex]);
      return true;
    }

    function refreshWheelLockDebounce() {
      if (wheelUnlockTimer) clearTimeout(wheelUnlockTimer);
      wheelUnlockTimer = setTimeout(function () {
        wheelLocked = false;
      }, 620);
    }

    function hasVerticalScrollableAncestor(startNode) {
      var node = startNode;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node instanceof Element) {
          var style = window.getComputedStyle(node);
          var overflowY = String(style.overflowY || '');
          var canScrollY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay');
          if (canScrollY && node.scrollHeight > node.clientHeight + 2) return true;
        }
        node = node.parentNode;
      }
      return false;
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        switchScreen(button.getAttribute('data-desktop-switch'));
      });
    });

    nav.addEventListener('keydown', function (event) {
      var key = event.key;
      if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
      var list = Array.prototype.slice.call(buttons);
      if (!list.length) return;
      var current = document.activeElement;
      var currentIndex = Math.max(0, list.indexOf(current));
      var delta = key === 'ArrowRight' ? 1 : -1;
      var nextIndex = (currentIndex + delta + list.length) % list.length;
      event.preventDefault();
      list[nextIndex].focus();
      switchScreen(list[nextIndex].getAttribute('data-desktop-switch'));
    });

    window.addEventListener('wheel', function (event) {
      if (event.ctrlKey) return;
      var dx = Number(event.deltaX) || 0;
      var dy = Number(event.deltaY) || 0;
      if (Math.abs(dx) < 18) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (hasVerticalScrollableAncestor(event.target)) return;
      event.preventDefault();
      if (wheelLocked) {
        refreshWheelLockDebounce();
        return;
      }
      wheelLocked = true;
      switchByStep(dx > 0 ? 1 : -1);
      refreshWheelLockDebounce();
    }, { passive: false, capture: true });

    window.addEventListener('touchstart', function (event) {
      var touch = event.touches && event.touches[0];
      if (!touch) return;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchSwitched = false;
    }, { passive: true, capture: true });

    window.addEventListener('touchmove', function (event) {
      if (touchSwitched) return;
      var touch = event.touches && event.touches[0];
      if (!touch) return;
      var dx = touch.clientX - touchStartX;
      var dy = touch.clientY - touchStartY;
      if (Math.abs(dx) < 42) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      event.preventDefault();
      touchSwitched = true;
      switchByStep(dx < 0 ? 1 : -1);
    }, { passive: false, capture: true });

    switchScreen(activeScreen);

    window.addEventListener('hashchange', function () {
      if (embedDashboard) return;
      try {
        var pathDash = window.location.pathname || '';
        if (
          pathDash.indexOf('/') === -1 &&
          pathDash.indexOf('/pages/creator-overview') === -1
        ) {
          return;
        }
        var h = (window.location.hash || '').replace(/^#/, '').toLowerCase().trim();
        if (h === 'promotions') {
          switchScreen('marketing');
          return;
        }
        if (allowed[h]) switchScreen(h);
      } catch (eHc) {}
    });

    window.CreatorDesktopShell = {
      switchScreen: switchScreen,
      getActiveScreen: function () { return activeScreen; }
    };
  }

  var DESKTOP_SCREEN_MOUNT = {
    generator: {
      hostId: 'creatorDesktopGeneratorHost',
      screen: '1',
      sourceId: 'creatorGenerator',
      desktopClass: 'creator-generator--desktop'
    },
    creations: {
      hostId: 'creatorDesktopCreationsHost',
      screen: '2',
      sourceId: 'creatorCreations',
      desktopClass: 'creator-creations--desktop'
    },
    marketing: {
      hostId: 'creatorDesktopMarketingHost',
      screen: '3',
      sourceId: 'creatorMarketing',
      desktopClass: 'creator-marketing--desktop'
    },
    automations: {
      hostId: 'creatorDesktopAutomationsHost',
      screen: '4',
      sourceId: 'creatorAutomations',
      desktopClass: 'creator-automations--desktop'
    }
  };

  function getMobileScreenSection(screenIndex) {
    return document.querySelector('#creatorMobileApp .creator-screen[data-screen="' + screenIndex + '"]');
  }

  function mountDesktopScreenByKey(key, opts) {
    opts = opts || {};
    var cfg = DESKTOP_SCREEN_MOUNT[key];
    if (!cfg) return false;
    var host = document.getElementById(cfg.hostId);
    if (!host) return false;
    if (host.dataset.mounted === 'true' && host.querySelector('#' + cfg.sourceId)) return true;

    var source =
      document.getElementById(cfg.sourceId) ||
      document.querySelector('#creatorMobileApp .creator-screen[data-screen="' + cfg.screen + '"] #' + cfg.sourceId);
    if (!source) {
      if (!opts.skipRetry) {
        var retries = Number(host.dataset.mountRetries || 0);
        if (retries < 6) {
          host.dataset.mountRetries = String(retries + 1);
          setTimeout(function () {
            mountDesktopScreenByKey(key, opts);
          }, 120);
        }
      }
      return false;
    }

    host.appendChild(source);
    source.classList.add(cfg.desktopClass);
    host.dataset.mounted = 'true';
    host.dataset.mountRetries = '0';

    if (key === 'creations') {
      configureDesktopCreationsViewModes();
    }
    if (key === 'automations' && window.AutomationsScreen && typeof window.AutomationsScreen.switchMainTab === 'function') {
      window.AutomationsScreen.switchMainTab('design-generator');
    }
    try {
      if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
    } catch (e) {}
    return true;
  }

  function unmountDesktopScreenByKey(key) {
    var cfg = DESKTOP_SCREEN_MOUNT[key];
    if (!cfg) return false;
    var host = document.getElementById(cfg.hostId);
    if (!host) return false;
    var source = host.querySelector('#' + cfg.sourceId) || document.getElementById(cfg.sourceId);
    if (!source) {
      host.dataset.mounted = 'false';
      return false;
    }
    var section = getMobileScreenSection(cfg.screen);
    if (!section) return false;
    if (source.parentElement === section) {
      host.dataset.mounted = 'false';
      source.classList.remove(cfg.desktopClass);
      return true;
    }
    section.appendChild(source);
    source.classList.remove(cfg.desktopClass);
    host.dataset.mounted = 'false';
    host.dataset.mountRetries = '0';
    return true;
  }

  function mountDesktopGeneratorScreen() {
    mountDesktopScreenByKey('generator');
  }

  function mountDesktopCreationsScreen() {
    mountDesktopScreenByKey('creations');
  }

  /** Creations grid bootstrap must not depend on #creatorViewModeOverlay (mount runs before shell modals may move markup). */
  function bootstrapDesktopCreationsDataLoad() {
    function tryBoot(attempt) {
      var n = typeof attempt === 'number' ? attempt : 0;
      if (window.CreationsScreen && typeof window.CreationsScreen.setViewMode === 'function') {
        window.CreationsScreen.setViewMode('grid4');
        if (typeof window.CreationsScreen.switchTab === 'function') {
          window.CreationsScreen.switchTab('designs');
        }
        return;
      }
      if (n < 20) {
        setTimeout(function () {
          tryBoot(n + 1);
        }, 80);
      }
    }
    tryBoot(0);
  }

  function mountDesktopMarketingScreen() {
    mountDesktopScreenByKey('marketing');
  }

  function mountDesktopAutomationsScreen() {
    mountDesktopScreenByKey('automations');
  }

  function mountAllDesktopSharedScreens() {
    mountDesktopGeneratorScreen();
    mountDesktopCreationsScreen();
    mountDesktopMarketingScreen();
    mountDesktopAutomationsScreen();
  }

  function unmountAllDesktopSharedScreens() {
    unmountDesktopScreenByKey('generator');
    unmountDesktopScreenByKey('creations');
    unmountDesktopScreenByKey('marketing');
    unmountDesktopScreenByKey('automations');
  }

  function syncActiveScreenAfterShellLayout(isDesktop) {
    var screen = 'dashboard';
    try {
      if (
        window.CreatorDesktopShell &&
        typeof window.CreatorDesktopShell.getActiveScreen === 'function'
      ) {
        screen = window.CreatorDesktopShell.getActiveScreen() || 'dashboard';
      }
    } catch (_e) {}

    var slideMap = { dashboard: 0, generator: 1, creations: 2, marketing: 3, automations: 4 };
    if (!isDesktop) {
      var slide = slideMap[screen];
      if (typeof slide === 'number' && typeof window.__creatorGoTo === 'function') {
        try {
          window.__creatorGoTo(slide);
        } catch (_go) {}
      }
      if (screen === 'creations' && window.CreationsScreen) {
        try {
          if (typeof window.CreationsScreen.setViewMode === 'function') {
            window.CreationsScreen.setViewMode('grid2');
          }
          if (typeof window.CreationsScreen.switchTab === 'function') {
            var tab =
              typeof window.CreationsScreen.getCurrentTab === 'function'
                ? window.CreationsScreen.getCurrentTab()
                : 'designs';
            window.CreationsScreen.switchTab(tab || 'designs');
          } else if (typeof window.CreationsScreen.redrawDesignsGridOnly === 'function') {
            window.CreationsScreen.redrawDesignsGridOnly();
          }
        } catch (_cr) {}
      }
      return;
    }

    if (
      window.CreatorDesktopShell &&
      typeof window.CreatorDesktopShell.switchScreen === 'function'
    ) {
      try {
        window.CreatorDesktopShell.switchScreen(screen);
      } catch (_sw) {}
    }
    if (screen === 'creations') {
      bootstrapDesktopCreationsDataLoad();
    }
  }

  var lastDesktopShellLayout = null;
  function syncCreatorShellLayoutForViewport() {
    var isDesktop = isDesktopCreatorViewport();
    if (lastDesktopShellLayout === isDesktop) return;
    lastDesktopShellLayout = isDesktop;
    if (isDesktop) {
      mountAllDesktopSharedScreens();
      mountDesktopShellModals();
      syncActiveScreenAfterShellLayout(true);
    } else {
      unmountAllDesktopSharedScreens();
      restoreMobileCreationsViewModes();
      syncActiveScreenAfterShellLayout(false);
    }
    try {
      if (typeof window.relocateCreatorEazyCluster === 'function') window.relocateCreatorEazyCluster();
    } catch (_e) {}
    try {
      document.dispatchEvent(
        new CustomEvent('creator:shell-layout-change', { detail: { desktop: isDesktop } })
      );
    } catch (_ev) {}
  }

  function bindCreatorShellViewportSync() {
    function onChange() {
      syncCreatorShellLayoutForViewport();
    }
    try {
      if (desktopViewportMq) {
        if (typeof desktopViewportMq.addEventListener === 'function') {
          desktopViewportMq.addEventListener('change', onChange);
        } else if (typeof desktopViewportMq.addListener === 'function') {
          desktopViewportMq.addListener(onChange);
        }
      } else {
        window.addEventListener('resize', onChange);
      }
    } catch (_bind) {
      window.addEventListener('resize', onChange);
    }
  }

  function configureDesktopCreationsViewModes() {
    var overlay = document.getElementById('creatorViewModeOverlay');
    if (!overlay) return;
    var options = overlay.querySelectorAll('.creator-view-mode-opt');
    if (!options || options.length < 2) return;

    var first = options[0];
    var second = options[1];
    var third = options[2];

    first.dataset.view = 'grid4';
    var firstLabel = first.querySelector('span:last-child');
    var firstIcon = first.querySelector('.creator-view-mode-opt-icon');
    if (firstLabel) firstLabel.textContent = '4 columns';
    if (firstIcon) {
      firstIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="9.5" width="4" height="4" rx="1"/><rect x="7.5" y="9.5" width="4" height="4" rx="1"/><rect x="12.5" y="9.5" width="4" height="4" rx="1"/><rect x="17.5" y="9.5" width="4" height="4" rx="1"/></svg>';
    }

    second.dataset.view = 'grid6';
    var secondLabel = second.querySelector('span:last-child');
    var secondIcon = second.querySelector('.creator-view-mode-opt-icon');
    if (secondLabel) secondLabel.textContent = '6 columns';
    if (secondIcon) {
      secondIcon.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="4" height="4" rx="1"/><rect x="10" y="7" width="4" height="4" rx="1"/><rect x="17" y="7" width="4" height="4" rx="1"/><rect x="3" y="13" width="4" height="4" rx="1"/><rect x="10" y="13" width="4" height="4" rx="1"/><rect x="17" y="13" width="4" height="4" rx="1"/></svg>';
    }

    if (third) {
      third.dataset.view = 'list';
      third.style.display = '';
      third.setAttribute('aria-hidden', 'false');
    }
  }

  function restoreMobileCreationsViewModes() {
    var overlay = document.getElementById('creatorViewModeOverlay');
    if (!overlay) return;
    var options = overlay.querySelectorAll('.creator-view-mode-opt');
    if (!options || options.length < 2) return;

    var first = options[0];
    var second = options[1];
    var third = options[2];
    var M = window.CreatorMobileI18n || {};

    first.dataset.view = 'grid2';
    var firstLabel = first.querySelector('span:last-child');
    var firstIcon = first.querySelector('.creator-view-mode-opt-icon');
    if (firstLabel) firstLabel.textContent = M.viewGrid2 || '2 columns';
    if (firstIcon) {
      firstIcon.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="8" height="8" rx="1"/><rect x="13" y="8" width="8" height="8" rx="1"/></svg>';
    }

    second.dataset.view = 'grid3';
    var secondLabel = second.querySelector('span:last-child');
    var secondIcon = second.querySelector('.creator-view-mode-opt-icon');
    if (secondLabel) secondLabel.textContent = M.viewGrid3 || '3 columns';
    if (secondIcon) {
      secondIcon.innerHTML =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="16.5" y="9.5" width="5" height="5" rx="1"/></svg>';
    }

    if (third) {
      third.dataset.view = 'list';
      third.style.display = '';
      third.setAttribute('aria-hidden', 'false');
      var thirdLabel = third.querySelector('span:last-child');
      if (thirdLabel) thirdLabel.textContent = M.viewList || 'List view';
    }
  }

  function mountDesktopShellModals() {
    function hiddenByAncestor(el) {
      var node = el;
      while (node && node !== document.body) {
        var styles = window.getComputedStyle(node);
        if (styles.display === 'none' || styles.visibility === 'hidden') return true;
        node = node.parentElement;
      }
      return false;
    }

    var modalRootIds = [
      'eazCreatorPromotionsModalsRoot',
      'creatorViewModeOverlay',
      'creator-design-modal-filter',
      'creator-filter-creator-modal',
      'creator-design-modal',
      'creator-detail-modal',
      'my-creations-upload-source-modal',
      'design-upload-modal-creator-mobile',
      'design-merge-modal',
      'genRefImageOverlay',
      'genMyDesignsOverlay',
      'genProductInfoOverlay',
      'genConfirmOverlay',
      'genSelectOverlay',
      'genOptionsOverlay',
      'genStylesOverlay',
      'genLangOverlay',
      'genColorOverlay',
      'genDialectOverlay',
      'reference-influence-modal',
      'creator-inspiration-modal',
      'creatorHeroImagesModal'
    ];

    modalRootIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.parentElement === document.body) return;
      if (hiddenByAncestor(el.parentElement)) {
        document.body.appendChild(el);
      }
    });

    var previewModal = document.querySelector('[id^="creatorDesignPreviewModal-"]');
    if (previewModal && previewModal.parentElement !== document.body && hiddenByAncestor(previewModal.parentElement)) {
      document.body.appendChild(previewModal);
    }
    configureDesktopCreationsViewModes();
  }

  function renderTimeBasedWelcome() {
    var titles = document.querySelectorAll('[data-desktop-hero-welcome]');
    if (!titles.length) return;
    var name = String((titles[0] && titles[0].getAttribute('data-display-name')) || '').trim();
    var hour = new Date().getHours();

    var template = i18n.welcomeDefault || (titles[0] ? titles[0].textContent : '');
    if (hour >= 5 && hour < 12) template = i18n.welcomeMorning || template;
    else if (hour >= 12 && hour < 18) template = i18n.welcomeAfternoon || template;
    else if (hour >= 18 && hour < 22) template = i18n.welcomeEvening || template;
    else template = i18n.welcomeNight || template;

    var rendered = String(template || '')
      .replace(/\{\{\s*name\s*\}\}/g, name)
      .replace(/\{name\}/g, name);
    titles.forEach(function (title) {
      title.textContent = rendered;
    });
  }

  function loadGoogleMapsApi(apiKey) {
    if (!apiKey) return Promise.reject(new Error('Missing Google Maps API key'));
    if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
    if (googleMapsScriptPromise) return googleMapsScriptPromise;

    googleMapsScriptPromise = new Promise(function (resolve, reject) {
      var callbackName = '__creatorDesktopGoogleMapsReady';
      window[callbackName] = function () {
        try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
        if (window.google && window.google.maps) resolve(window.google.maps);
        else reject(new Error('Google Maps loaded without maps namespace'));
      };

      var script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' +
        encodeURIComponent(apiKey) +
        '&v=weekly&callback=' + callbackName;
      script.async = true;
      script.defer = true;
      script.onerror = function () {
        try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
        reject(new Error('Google Maps script failed to load'));
      };
      document.head.appendChild(script);
    });

    return googleMapsScriptPromise;
  }

  function loadLeafletAssets() {
    if (window.L && window.L.map) return Promise.resolve(window.L);
    if (leafletAssetsPromise) return leafletAssetsPromise;

    leafletAssetsPromise = new Promise(function (resolve, reject) {
      var cssHref = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      var jsSrc = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

      if (!document.querySelector('link[data-creator-leaflet-css]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = cssHref;
        link.setAttribute('data-creator-leaflet-css', '1');
        document.head.appendChild(link);
      }

      if (window.L && window.L.map) {
        resolve(window.L);
        return;
      }

      var existing = document.querySelector('script[data-creator-leaflet-js]');
      if (existing) {
        var tick = function () {
          if (window.L && window.L.map) resolve(window.L);
          else setTimeout(tick, 60);
        };
        tick();
        return;
      }

      var script = document.createElement('script');
      script.src = jsSrc;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-creator-leaflet-js', '1');
      script.onload = function () {
        if (window.L && window.L.map) resolve(window.L);
        else reject(new Error('Leaflet loaded without global L'));
      };
      script.onerror = function () {
        reject(new Error('Leaflet script failed to load'));
      };
      document.head.appendChild(script);
    });

    return leafletAssetsPromise;
  }

  function initEarthHeroMap() {
    var hero = document.getElementById('creatorDesktopHero');
    var earthRoot = hero ? hero.querySelector('[data-earth-hero-root] .creator-desktop-earth-hero') : null;
    var viewport = document.getElementById('creatorDesktopEarthViewport');
    var map = document.getElementById('creatorDesktopEarthMap');
    var miniMapEl = document.getElementById('creatorDesktopEarthMiniMap');
    var marker = document.getElementById('creatorDesktopEarthMapMarker');
    var zoomInBtn = document.getElementById('creatorDesktopEarthZoomIn');
    var zoomOutBtn = document.getElementById('creatorDesktopEarthZoomOut');
    if (!viewport || !map || !marker) return;

    var apiKey = String(
      (hero && hero.getAttribute('data-google-maps-key')) ||
      window.__EAZ_GOOGLE_MAPS_API_KEY ||
      ''
    ).trim();
    var useGoogleLiveEarth = String(window.__EAZ_EARTH_USE_GOOGLE || '').toLowerCase() === 'true';
    var useDetailedMap = String(window.__EAZ_EARTH_USE_DETAILED_MAP || 'true').toLowerCase() !== 'false';
    var mapId = String(
      (hero && hero.getAttribute('data-google-map-id')) ||
      window.__EAZ_GOOGLE_MAP_ID ||
      ''
    ).trim();

    var center = { x: 0.58, y: 0.34 };
    var zoom = 2.6;
    var MIN_ZOOM = 1.6;
    var MAX_ZOOM = 5.2;
    var cropW = 0.26;
    var cropH = 0.2;
    var zoomInHandler = null;
    var zoomOutHandler = null;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function apply() {
      var posX = clamp(center.x * 100, 0, 100);
      var posY = clamp(center.y * 100, 0, 100);
      viewport.style.backgroundSize = (zoom * 100) + '% auto';
      viewport.style.backgroundPosition = posX + '% ' + posY + '%';

      var markerW = cropW * 100;
      var markerH = cropH * 100;
      marker.style.width = markerW + '%';
      marker.style.height = markerH + '%';
      marker.style.left = clamp(posX - markerW / 2, 0, 100 - markerW) + '%';
      marker.style.top = clamp(posY - markerH / 2, 0, 100 - markerH) + '%';
    }

    function onPick(event) {
      var rect = map.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      center.x = clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98);
      center.y = clamp((event.clientY - rect.top) / rect.height, 0.02, 0.98);
      apply();
    }

    function isEarthHeroPageActive() {
      if (!hero) return true;
      var activeIndex = hero.getAttribute('data-hero-active-index');
      return activeIndex === '1' || activeIndex == null || activeIndex === '';
    }

    function setZoomHandlers(onIn, onOut) {
      zoomInHandler = onIn;
      zoomOutHandler = onOut;
    }

    function bindZoom(onIn, onOut) {
      setZoomHandlers(onIn, onOut);
      if (zoomInBtn) zoomInBtn.addEventListener('click', function () { onIn(0.26); });
      if (zoomOutBtn) zoomOutBtn.addEventListener('click', function () { onOut(0.26); });
    }

    function preventPageWheelAndZoom(event) {
      if (!isEarthHeroPageActive()) return;
      var deltaX = Math.abs(Number(event.deltaX) || 0);
      var deltaY = Math.abs(Number(event.deltaY) || 0);
      if (deltaX > deltaY) return;
      event.preventDefault();
      event.stopPropagation();
    }

    if (earthRoot) {
      earthRoot.addEventListener('wheel', preventPageWheelAndZoom, { passive: false, capture: true });
    }
    map.addEventListener('wheel', preventPageWheelAndZoom, { passive: false, capture: true });
    if (miniMapEl) miniMapEl.addEventListener('wheel', preventPageWheelAndZoom, { passive: false, capture: true });

    viewport.addEventListener('wheel', function (event) {
      if (!isEarthHeroPageActive()) return;
      if (!zoomInHandler || !zoomOutHandler) return;
      if (Math.abs(event.deltaY) < 2) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY < 0) zoomInHandler(0.14);
      else zoomOutHandler(0.14);
    }, { passive: false });

    function initStaticFallback() {
      var zoomAnimation = { frameId: 0, target: zoom };

      function stopZoomAnimation() {
        if (!zoomAnimation.frameId) return;
        cancelAnimationFrame(zoomAnimation.frameId);
        zoomAnimation.frameId = 0;
      }

      function animateStaticZoomTo(nextZoom) {
        zoomAnimation.target = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
        stopZoomAnimation();
        var start = zoom;
        var delta = zoomAnimation.target - start;
        if (Math.abs(delta) < 0.001) return;
        var startAt = 0;
        var duration = 180;
        function easeOutCubic(t) {
          return 1 - Math.pow(1 - t, 3);
        }
        function step(ts) {
          if (!startAt) startAt = ts;
          var p = clamp((ts - startAt) / duration, 0, 1);
          zoom = start + delta * easeOutCubic(p);
          apply();
          if (p < 1) zoomAnimation.frameId = requestAnimationFrame(step);
          else zoomAnimation.frameId = 0;
        }
        zoomAnimation.frameId = requestAnimationFrame(step);
      }

      var dragState = {
        active: false,
        pointerId: null,
        moved: false,
        startX: 0,
        startY: 0,
        startCenterX: 0,
        startCenterY: 0
      };

      function endDrag() {
        dragState.active = false;
        dragState.pointerId = null;
        viewport.classList.remove('is-dragging');
      }

      viewport.addEventListener('pointerdown', function (event) {
        dragState.active = true;
        dragState.pointerId = event.pointerId;
        dragState.moved = false;
        dragState.startX = event.clientX;
        dragState.startY = event.clientY;
        dragState.startCenterX = center.x;
        dragState.startCenterY = center.y;
        viewport.classList.add('is-dragging');
        if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
      });

      viewport.addEventListener('pointermove', function (event) {
        if (!dragState.active || dragState.pointerId !== event.pointerId) return;
        var rect = viewport.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var dx = event.clientX - dragState.startX;
        var dy = event.clientY - dragState.startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;
        center.x = clamp(dragState.startCenterX - (dx / Math.max(1, rect.width)) / zoom, 0.02, 0.98);
        center.y = clamp(dragState.startCenterY - (dy / Math.max(1, rect.height)) / zoom, 0.02, 0.98);
        apply();
      });

      viewport.addEventListener('pointerup', function () {
        endDrag();
      });
      viewport.addEventListener('pointercancel', function () {
        endDrag();
      });
      viewport.addEventListener('lostpointercapture', function () {
        endDrag();
      });

      map.addEventListener('click', onPick);
      map.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
        }
      });
      map.addEventListener('click', function (event) {
        if (dragState.moved) {
          event.preventDefault();
          event.stopPropagation();
          dragState.moved = false;
        }
      }, true);

      bindZoom(
        function (stepSize) {
          var step = Number(stepSize) || 0.26;
          animateStaticZoomTo(zoomAnimation.target + step);
        },
        function (stepSize) {
          var step = Number(stepSize) || 0.26;
          animateStaticZoomTo(zoomAnimation.target - step);
        }
      );
      apply();
    }

    function initGoogleMaps() {
      if (!useGoogleLiveEarth || !apiKey || !miniMapEl) return;

      loadGoogleMapsApi(apiKey).then(function () {
        var mainCenter = { lat: 48.137154, lng: 11.576124 };
        var miniCenter = { lat: 20, lng: 0 };
        var darkMiniStyles = [
          { elementType: 'geometry', stylers: [{ color: '#0b1023' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#9ca7c9' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1023' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#09172c' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1b2945' }] },
          { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'administrative', stylers: [{ visibility: 'off' }] }
        ];

        var mainOptions = {
          center: mainCenter,
          zoom: 6,
          mapTypeId: 'satellite',
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          draggable: true,
          scrollwheel: false,
          disableDoubleClickZoom: true,
          gestureHandling: 'greedy'
        };
        if (mapId) mainOptions.mapId = mapId;

        var miniOptions = {
          center: miniCenter,
          zoom: 1,
          mapTypeId: 'roadmap',
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: false,
          draggableCursor: 'pointer',
          gestureHandling: 'greedy',
          styles: darkMiniStyles
        };
        if (mapId) miniOptions.mapId = mapId;

        var mainMap = new window.google.maps.Map(viewport, mainOptions);
        var miniMap = new window.google.maps.Map(miniMapEl, miniOptions);
        var mapZoomAnim = { frameId: 0, target: mainMap.getZoom() || 6 };
        var markerRect = new window.google.maps.Rectangle({
          map: miniMap,
          strokeColor: '#ff8b36',
          strokeOpacity: 0.95,
          strokeWeight: 1,
          fillColor: '#ff8b36',
          fillOpacity: 0.08
        });

        map.classList.add('is-google');

        function stopMapZoomAnimation() {
          if (!mapZoomAnim.frameId) return;
          cancelAnimationFrame(mapZoomAnim.frameId);
          mapZoomAnim.frameId = 0;
        }

        function setMapZoomValue(value) {
          var clamped = clamp(value, 2, 18);
          if (typeof mainMap.moveCamera === 'function') {
            mainMap.moveCamera({ zoom: clamped });
          } else {
            mainMap.setZoom(clamped);
          }
        }

        function animateMapZoomTo(nextZoom) {
          mapZoomAnim.target = clamp(nextZoom, 2, 18);
          stopMapZoomAnimation();
          var start = Number(mainMap.getZoom()) || mapZoomAnim.target;
          var delta = mapZoomAnim.target - start;
          if (Math.abs(delta) < 0.001) return;
          var startAt = 0;
          var duration = 180;
          function easeOutCubic(t) {
            return 1 - Math.pow(1 - t, 3);
          }
          function step(ts) {
            if (!startAt) startAt = ts;
            var p = clamp((ts - startAt) / duration, 0, 1);
            setMapZoomValue(start + delta * easeOutCubic(p));
            if (p < 1) mapZoomAnim.frameId = requestAnimationFrame(step);
            else mapZoomAnim.frameId = 0;
          }
          mapZoomAnim.frameId = requestAnimationFrame(step);
        }

        function syncRectFromMainMap() {
          var bounds = mainMap.getBounds();
          if (!bounds) return;
          markerRect.setBounds(bounds);
        }

        mainMap.addListener('bounds_changed', syncRectFromMainMap);
        mainMap.addListener('idle', syncRectFromMainMap);

        miniMap.addListener('click', function (event) {
          if (!event || !event.latLng) return;
          mainMap.setCenter(event.latLng);
          syncRectFromMainMap();
        });

        bindZoom(
          function (stepSize) {
            var step = Number(stepSize) || 0.26;
            animateMapZoomTo(mapZoomAnim.target + Math.max(0.25, step * 2.6));
          },
          function (stepSize) {
            var step = Number(stepSize) || 0.26;
            animateMapZoomTo(mapZoomAnim.target - Math.max(0.25, step * 2.6));
          }
        );

        map.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (mainMap && miniMap) {
              mainMap.setCenter(miniMap.getCenter());
            }
          }
        });
      }).catch(function () {});
    }

    function initDetailedMap() {
      if (!useDetailedMap || !miniMapEl || !window.L) return false;
      var L = window.L;
      var darkLabelsPaneName = 'creatorLabelsPane';
      var mainCenter = [48.137154, 11.576124];
      var mainMap = L.map(viewport, {
        zoomControl: false,
        attributionControl: false,
        center: mainCenter,
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        dragging: true,
        inertia: true,
        inertiaDeceleration: 420,
        inertiaMaxSpeed: 6800,
        easeLinearity: 0.06,
        worldCopyJump: true
      });

      var miniMap = L.map(miniMapEl, {
        zoomControl: false,
        attributionControl: false,
        center: [12, 0],
        zoom: 0,
        minZoom: 0,
        maxZoom: 0,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        dragging: true,
        boxZoom: false,
        keyboard: false,
        tap: false,
        worldCopyJump: true,
        zoomSnap: 1,
        zoomDelta: 1
      });

      var mainTiles = {
        tileSize: 256,
        maxZoom: 19,
        crossOrigin: true,
        updateWhenIdle: true,
        noWrap: false
      };
      var miniTiles = {
        tileSize: 256,
        maxZoom: 19,
        crossOrigin: true,
        updateWhenIdle: true,
        noWrap: false
      };
      var mainTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      var miniTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      L.tileLayer(mainTileUrl, mainTiles).addTo(mainMap);
      if (!mainMap.getPane('creatorGlowPane')) {
        mainMap.createPane('creatorGlowPane');
        mainMap.getPane('creatorGlowPane').style.zIndex = 360;
      }
      L.tileLayer(mainTileUrl, {
        tileSize: 256,
        maxZoom: 19,
        crossOrigin: true,
        updateWhenIdle: true,
        noWrap: false,
        pane: 'creatorGlowPane',
        opacity: 0.32,
        className: 'creator-map-glow-layer'
      }).addTo(mainMap);
      L.tileLayer(miniTileUrl, miniTiles).addTo(miniMap);

      if (!miniMap.getPane(darkLabelsPaneName)) {
        miniMap.createPane(darkLabelsPaneName);
        miniMap.getPane(darkLabelsPaneName).style.zIndex = 450;
      }

      var markerRect = L.rectangle([[0, 0], [0, 0]], {
        pane: darkLabelsPaneName,
        color: '#ff8b36',
        weight: 2,
        opacity: 0.98,
        dashArray: '6 4',
        fillColor: '#ff8b36',
        fillOpacity: 0.16
      }).addTo(miniMap);

      var markerRectInner = L.rectangle([[0, 0], [0, 0]], {
        pane: darkLabelsPaneName,
        color: '#ffffff',
        weight: 1,
        opacity: 0.72,
        fill: false
      }).addTo(miniMap);
      markerRect.bringToFront();
      markerRectInner.bringToFront();
      var miniPulseTimer = 0;

      function syncMiniRect() {
        var bounds = mainMap.getBounds();
        if (!bounds) return;
        var wrapped = mainMap.wrapLatLngBounds(bounds);
        markerRect.setBounds(wrapped);
        markerRectInner.setBounds(wrapped);
        markerRect.bringToFront();
        markerRectInner.bringToFront();

        if (marker && miniMapEl) {
          var nw = miniMap.latLngToContainerPoint(wrapped.getNorthWest());
          var se = miniMap.latLngToContainerPoint(wrapped.getSouthEast());
          var mapW = miniMapEl.clientWidth || 1;
          var mapH = miniMapEl.clientHeight || 1;
          var left = Math.min(nw.x, se.x);
          var top = Math.min(nw.y, se.y);
          var width = Math.abs(se.x - nw.x);
          var height = Math.abs(se.y - nw.y);
          if (width > mapW * 0.98) {
            width = mapW * 0.98;
            left = mapW * 0.01;
          }
          if (height > mapH * 0.98) {
            height = mapH * 0.98;
            top = mapH * 0.01;
          }
          left = clamp(left, 0, Math.max(0, mapW - width));
          top = clamp(top, 0, Math.max(0, mapH - height));
          marker.style.display = 'block';
          marker.style.left = left + 'px';
          marker.style.top = top + 'px';
          marker.style.width = Math.max(10, width) + 'px';
          marker.style.height = Math.max(8, height) + 'px';
          marker.style.transform = 'none';
        }
      }

      function pulseMiniSelection() {
        map.classList.add('is-pulse');
        markerRect.setStyle({ weight: 3, fillOpacity: 0.24 });
        markerRectInner.setStyle({ weight: 2, opacity: 0.95 });
        if (miniPulseTimer) clearTimeout(miniPulseTimer);
        miniPulseTimer = setTimeout(function () {
          map.classList.remove('is-pulse');
          markerRect.setStyle({ weight: 2, fillOpacity: 0.16 });
          markerRectInner.setStyle({ weight: 1, opacity: 0.72 });
        }, 260);
      }

      function createVerticalWrapHandler(mapObj) {
        var reentryTop = 78;
        var reentryBottom = -78;
        var isWrapping = false;
        return function () {
          if (isWrapping) return false;
          var c = mapObj.getCenter();
          if (!c) return false;
          var nextLat = c.lat;
          if (c.lat > reentryTop) nextLat = reentryBottom + (c.lat - reentryTop);
          else if (c.lat < reentryBottom) nextLat = reentryTop + (c.lat - reentryBottom);
          if (Math.abs(nextLat - c.lat) < 0.0001) return false;
          isWrapping = true;
          mapObj.setView([nextLat, c.lng], mapObj.getZoom(), { animate: false });
          setTimeout(function () { isWrapping = false; }, 0);
          return true;
        };
      }

      var wrapMainVertical = createVerticalWrapHandler(mainMap);
      var wrapMiniVertical = createVerticalWrapHandler(miniMap);

      mainMap.on('move zoom', syncMiniRect);
      mainMap.on('moveend dragend', function () {
        var wrapped = wrapMainVertical();
        if (!wrapped) syncMiniRect();
        else setTimeout(syncMiniRect, 0);
      });
      miniMap.on('moveend dragend', function () {
        wrapMiniVertical();
      });
      miniMap.on('click', function (event) {
        if (!event || !event.latlng) return;
        mainMap.panTo(event.latlng, { animate: true, duration: 0.38 });
        pulseMiniSelection();
      });
      miniMapEl.addEventListener('click', function (event) {
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
        var latlng = miniMap.mouseEventToLatLng(event);
        if (!latlng) return;
        mainMap.panTo(latlng, { animate: true, duration: 0.38 });
        pulseMiniSelection();
      }, true);
      miniMapEl.addEventListener('pointerdown', function (event) {
        if (!event) return;
        event.stopPropagation();
      }, true);
      miniMapEl.addEventListener('pointermove', function (event) {
        if (!event) return;
        event.stopPropagation();
      }, true);
      miniMapEl.addEventListener('pointerup', function (event) {
        if (!event) return;
        event.stopPropagation();
      }, true);

      bindZoom(
        function (stepSize) {
          var step = Number(stepSize) || 0.26;
          var z = mainMap.getZoom() || 4;
          mainMap.setZoom(Math.min(18, z + Math.max(1, Math.round(step * 6))), { animate: true });
        },
        function (stepSize) {
          var step = Number(stepSize) || 0.26;
          var z = mainMap.getZoom() || 4;
          mainMap.setZoom(Math.max(2, z - Math.max(1, Math.round(step * 6))), { animate: true });
        }
      );

      if (earthRoot) earthRoot.classList.add('is-detailed-map-active');
      viewport.style.backgroundImage = 'none';
      miniMapEl.style.backgroundImage = 'none';
      viewport.classList.add('creator-map-theme-gamified');
      miniMapEl.classList.add('creator-map-theme-gamified', 'creator-map-theme-gamified--mini');
      map.classList.add('is-detailed-map');
      map.style.display = 'block';
      map.style.opacity = '1';
      map.style.pointerEvents = 'auto';
      var zoomControls = document.getElementById('creatorDesktopEarthZoomControls');
      if (zoomControls) {
        zoomControls.style.display = 'grid';
        zoomControls.style.opacity = '1';
        zoomControls.style.pointerEvents = 'auto';
      }
      miniMap.fitWorld({ animate: false });
      miniMap.setView([12, 0], 0, { animate: false });
      syncMiniRect();
      window.addEventListener('creator:hero-page-change', function (event) {
        var index = event && event.detail ? Number(event.detail.index) : NaN;
        if (index !== 1) return;
        setTimeout(function () {
          mainMap.invalidateSize(false);
          miniMap.invalidateSize(false);
          miniMap.fitWorld({ animate: false });
          miniMap.setView([12, 0], 0, { animate: false });
          syncMiniRect();
        }, 40);
      });
      setTimeout(function () {
        mainMap.invalidateSize(false);
        miniMap.invalidateSize(false);
        miniMap.fitWorld({ animate: false });
        miniMap.setView([12, 0], 0, { animate: false });
        syncMiniRect();
      }, 50);
      return true;
    }

    if (useDetailedMap) {
      loadLeafletAssets()
        .then(function () {
          if (!initDetailedMap()) initGoogleMaps();
        })
        .catch(function () {
          initGoogleMaps();
        });
      return;
    }

    initGoogleMaps();
  }

  function initHeroPager() {
    var scroller = document.getElementById('creatorDesktopHeroScroller');
    var pager = document.getElementById('creatorDesktopHeroPager');
    var hero = document.getElementById('creatorDesktopHero');
    if (!scroller || !pager) return;
    var dots = pager.querySelectorAll('[data-hero-page]');
    var pages = scroller.querySelectorAll('.creator-desktop-hero__page');
    function goToIndex(targetIndex, behavior) {
      var max = pages.length - 1;
      if (max < 0) return;
      var safeIndex = Math.max(0, Math.min(max, targetIndex));
      var targetPage = pages[safeIndex];
      var left = targetPage ? (targetPage.offsetLeft || 0) : 0;
      scroller.scrollTo({ left: left, behavior: behavior || 'smooth' });
      syncDots(safeIndex);
    }

    if (!dots.length) return;
    if (!pages.length) return;

    function activeIndex() {
      var left = scroller.scrollLeft || 0;
      var bestIndex = 0;
      var bestDistance = Infinity;
      pages.forEach(function (page, i) {
        var distance = Math.abs((page.offsetLeft || 0) - left);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      });
      return Math.max(0, Math.min(dots.length - 1, bestIndex));
    }

    function syncDots(index) {
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === index);
      });
      if (hero) hero.setAttribute('data-hero-active-index', String(index));
      try {
        window.dispatchEvent(new CustomEvent('creator:hero-page-change', { detail: { index: index } }));
      } catch (err) {}
    }

    function snapToActiveWithoutAnimation() {
      var index = activeIndex();
      var targetPage = pages[index];
      var left = targetPage ? (targetPage.offsetLeft || 0) : 0;
      scroller.scrollTo({ left: left, behavior: 'auto' });
      syncDots(index);
    }

    scroller.addEventListener('scroll', function () {
      syncDots(activeIndex());
    }, { passive: true });

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        var index = Number(dot.getAttribute('data-hero-page') || 0);
        goToIndex(index, 'smooth');
      });
    });

    var lastWheelSwitchAt = 0;
    scroller.addEventListener('wheel', function (event) {
      var dx = Number(event.deltaX) || 0;
      var dy = Number(event.deltaY) || 0;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (Math.abs(dx) < 8) return;
      var now = Date.now();
      if (now - lastWheelSwitchAt < 340) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      lastWheelSwitchAt = now;
      event.preventDefault();
      event.stopPropagation();
      var index = activeIndex();
      if (dx > 0 && index >= pages.length - 1) return;
      if (dx < 0 && index <= 0) return;
      var next = dx > 0 ? index + 1 : index - 1;
      goToIndex(next, 'smooth');
    }, { passive: false });

    scroller.addEventListener('touchstart', function (event) {
      if (!event) return;
      event.stopPropagation();
    }, { passive: true });

    window.addEventListener('resize', snapToActiveWithoutAnimation);
    syncDots(activeIndex());
  }

  function initHeroParticles() {
    /* Particle canvas retired; seamless CSS backgrounds handle motion (creator-seamless-bg.css). */
  }

  var DEFAULT_HERO_LAYOUT = {
    upload: { x: 220, y: 132, w: 140, h: 80, scale: 1 },
    prompt: { x: 220, y: 218, w: 260, h: 100, scale: 1 },
    design: { x: 466, y: 82, w: 158, h: 128, scale: 1 },
    mock: { x: 365, y: -70, w: 360, h: 450, scale: 1 }
  };

  function initHeroDesignReveal() {
    var canvasContainer = document.getElementById('creatorDesktopHeroDesignCanvas');
    var promptSlot = document.getElementById('creatorDesktopHeroPromptAnimSlot');
    if (!canvasContainer || !window.DesignParticleReveal) return;

    var apiBase = (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) || API_BASE;
    var listUrl = apiBase.indexOf('creator-dispatch') !== -1
      ? apiBase + '?op=list-public&limit=100'
      : apiBase.replace(/\/?$/, '') + '/apps/creator-dispatch?op=list-public&limit=100';

    function isValidDesignUrl(url) {
      return url && typeof url === 'string' && url.trim().length > 0 &&
        (url.indexOf('http://') === 0 || url.indexOf('https://') === 0);
    }

    function shuffle(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
      }
      return a;
    }

    function fetchPublicDesignsWithMeta() {
      return fetch(listUrl, { credentials: 'include', cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok || !Array.isArray(d.items)) return [];
          var items = (d.items || []).filter(function (it) {
            var url = it.preview_url || it.original_url;
            if (!isValidDesignUrl(url)) return false;
            var meta = it.metadata || {};
            var userPrompt = (meta.user_prompt || meta.prompt || it.prompt || '').trim();
            var userImageUrl = meta.user_image_url || meta.image_url || meta.baseImageUrl || null;
            var hasUserImage = userImageUrl && typeof userImageUrl === 'string' &&
              userImageUrl.indexOf('http') === 0;
            var hasUserPrompt = userPrompt.length > 0;
            return hasUserPrompt || hasUserImage;
          });
          return items;
        })
        .catch(function () { return []; });
    }

    function getHeroLayout() {
      return DEFAULT_HERO_LAYOUT;
    }

    var LOOP_DELAY_MS = 7000;

    function runPixelReveal(item, data, img, duration, skipAnim, onComplete) {
      var url = (item && (item.preview_url || item.original_url)) || null;
      if (!url) {
        if (typeof onComplete === 'function') onComplete(false);
        return;
      }
      var savedLayout = getHeroLayout();
      var dur = duration != null ? duration : 5;
      var apiBase = (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) || API_BASE;
      var mockBase = String(apiBase).replace(/\/apps\/creator-dispatch\/?$/, '').replace(/\/?$/, '');
      var mockUrl = mockBase + '/mockup/mockups/unisex-softstyle-cotton-tee/white-front.png';
      requestAnimationFrame(function () {
        var submitWrap = document.querySelector('#creatorDesktopHeroPromptAnimSlot .creator-desktop-hero-prompt-anim__submit-wrap');
        if (submitWrap && !skipAnim) {
          submitWrap.classList.add('creator-desktop-hero-prompt-anim__submit-wrap--particle-dissolve');
          submitWrap.style.animationDuration = Math.max(2.5, Math.min(dur, 5)) + 's';
        }
        window.DesignParticleReveal.run(canvasContainer, url, {
          density: 6,
          duration: dur,
          backgroundColor: 'transparent',
          particleOpacity: 1,
          mockUrl: mockUrl,
          mockPrintArea: { x: 0.15, y: 0.10, w: 0.20, h: 0.28 },
          preloadedImage: img || null,
          savedLayout: savedLayout,
          skipAnimation: skipAnim,
          onComplete: function () {
            if (typeof onComplete === 'function') onComplete(true);
          }
        });
      });
    }

    function runDesignPromptThenPixel(item, img, skipAnim, onComplete, onFailed) {
      var meta = item.metadata || {};
      var userPrompt = (meta.user_prompt || meta.prompt || item.prompt || '').trim();
      var userImageUrl = meta.user_image_url || meta.image_url || meta.baseImageUrl || null;
      if (userImageUrl && (typeof userImageUrl !== 'string' || userImageUrl.indexOf('http') !== 0)) {
        userImageUrl = null;
      }

      var designUrl = (item && (item.preview_url || item.original_url)) || null;
      if (!designUrl || !isValidDesignUrl(designUrl)) {
        if (typeof onFailed === 'function') onFailed();
        return;
      }
      var preloadImg = new Image();
      preloadImg.crossOrigin = 'anonymous';
      preloadImg.onerror = function () {
        if (typeof onFailed === 'function') onFailed();
      };
      preloadImg.src = designUrl;

      var revealDuration = 5;
      if (!skipAnim && (img || preloadImg) && window.DesignParticleReveal && typeof window.DesignParticleReveal.getDurationForImage === 'function') {
        var durImg = (preloadImg && preloadImg.complete && preloadImg.naturalWidth) ? preloadImg : img;
        if (durImg) revealDuration = window.DesignParticleReveal.getDurationForImage(durImg, { density: 6 });
      }

      var heroLayout = getHeroLayout();
      function onPromptComplete(data) {
        var readyImg = (preloadImg && preloadImg.complete && preloadImg.naturalWidth) ? preloadImg : (img || null);
        if (!readyImg && preloadImg && preloadImg.complete === false) {
          preloadImg.onload = function () {
            if (preloadImg.naturalWidth && preloadImg.naturalHeight) {
              runPixelReveal(item, data || {}, preloadImg, revealDuration, skipAnim, onComplete);
            } else {
              if (typeof onFailed === 'function') onFailed();
            }
          };
          preloadImg.onerror = function () {
            if (typeof onFailed === 'function') onFailed();
          };
          return;
        }
        if (readyImg && readyImg.naturalWidth && readyImg.naturalHeight) {
          runPixelReveal(item, data || {}, readyImg, revealDuration, skipAnim, onComplete);
        } else {
          if (typeof onFailed === 'function') onFailed();
        }
      }

      if (promptSlot && window.CreatorDesktopHeroDesignPromptAnimation) {
        window.CreatorDesktopHeroDesignPromptAnimation.run(promptSlot, {
          userPrompt: userPrompt,
          userImageUrl: userImageUrl,
          revealDuration: revealDuration,
          skipAnimation: skipAnim,
          initialLayout: heroLayout,
          onComplete: onPromptComplete
        });
      } else {
        onPromptComplete({});
      }
    }

    function tryNextValidItem(pool, index, skipAnim) {
      if (!pool || pool.length === 0) return;
      var idx = index % pool.length;
      var item = pool[idx];
      if (!item) return;

      canvasContainer.innerHTML = '';
      if (promptSlot) promptSlot.innerHTML = '';

      function onRevealComplete(success) {
        var delay = success ? LOOP_DELAY_MS : 500;
        setTimeout(function () {
          var nextIdx = (idx + 1) % pool.length;
          if (nextIdx === 0 && pool.length > 1) {
            var shuffled = shuffle(pool);
            pool.length = 0;
            pool.push.apply(pool, shuffled);
          }
          tryNextValidItem(pool, nextIdx, skipAnim);
        }, delay);
      }

      function onItemFailed() {
        var nextIdx = (idx + 1) % pool.length;
        if (nextIdx === 0 && pool.length === 1) return;
        tryNextValidItem(pool, nextIdx, skipAnim);
      }

      runDesignPromptThenPixel(item, null, skipAnim, onRevealComplete, onItemFailed);
    }

    function fetchAllDesignsForFallback() {
      return fetch(listUrl, { credentials: 'include', cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok || !Array.isArray(d.items)) return [];
          return (d.items || []).filter(function (it) {
            var url = it.preview_url || it.original_url;
            return isValidDesignUrl(url);
          });
        })
        .catch(function () { return []; });
    }

    function startWithItem(item, skipAnim) {
      if (!item || !item.preview_url) return;
      runDesignPromptThenPixel(item, null, skipAnim);
    }

    function startHeroReveal(skipAnim) {
      var started = false;
      function tryStart(items) {
        if (started) return;
        var pool = items && items.length > 0 ? shuffle(items) : [];
        if (pool.length > 0) {
          started = true;
          tryNextValidItem(pool, 0, skipAnim);
        }
      }

      fetchPublicDesignsWithMeta().then(function (items) {
        tryStart(items);
        if (started) return;
        fetchAllDesignsForFallback().then(function (fallbackItems) {
          tryStart(fallbackItems);
        });
      }).catch(function () {});
    }

    startHeroReveal(false);
  }

  function getDesktopSectionOrderFromDom() {
    var cards = document.querySelectorAll('.creator-desktop-grid .creator-desktop-card[data-section-id]');
    return Array.prototype.map.call(cards, function (el) { return el.getAttribute('data-section-id'); }).filter(Boolean);
  }

  function normalizeDesktopJourneyFirstOrder(order) {
    if (!Array.isArray(order) || !order.length) return order;
    if (order.indexOf('journey') === -1) return order.slice();
    return ['journey'].concat(
      order.filter(function (id) {
        return id !== 'journey';
      })
    );
  }

  function reorderDesktopDom(order) {
    var grid = document.querySelector('.creator-desktop-grid');
    if (!grid || !Array.isArray(order) || !order.length) return;
    order = normalizeDesktopJourneyFirstOrder(order);
    if (!Array.isArray(order) || !order.length) return;
    var byId = {};
    grid.querySelectorAll('.creator-desktop-card[data-section-id]').forEach(function (el) {
      var id = el.getAttribute('data-section-id');
      if (id) byId[id] = el;
    });
    order.forEach(function (id) {
      if (byId[id]) grid.appendChild(byId[id]);
    });
  }

  function saveDesktopLayout(sectionOrder) {
    var owner = getOwnerId();
    if (!owner || !Array.isArray(sectionOrder) || !sectionOrder.length) return;
    fetch(API_BASE + '/apps/creator-dispatch?op=save-creator-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_id: String(owner),
        page_type: 'desktop-dashboard',
        section_order: sectionOrder
      })
    }).catch(function (e) {
      console.warn('[CreatorDesktop] Save layout error:', e);
    });
  }

  function loadDesktopLayout() {
    var owner = getOwnerId();
    if (!owner) return Promise.resolve(false);
    return fetch(API_BASE + '/apps/creator-dispatch?op=get-creator-layout&owner_id=' + encodeURIComponent(owner) + '&page_type=desktop-dashboard')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.section_order) && data.section_order.length) {
          reorderDesktopDom(data.section_order);
          return true;
        }
        return false;
      })
      .catch(function (e) {
        console.warn('[CreatorDesktop] Load layout error:', e);
        return false;
      });
  }

  function initDesktopContainerLookAndDrag() {
    var grid = document.querySelector('.creator-desktop-grid');
    if (!grid) return;
    var defaultSectionOrder = ['journey', 'overview', 'actions'];

    var known = {
      'creator-desktop-card--overview': 'overview',
      'creator-desktop-card--actions': 'actions',
      'creator-desktop-card--journey': 'journey'
    };

    grid.querySelectorAll('.creator-desktop-card').forEach(function (card, idx) {
      if (!card.getAttribute('data-section-id')) {
        var assigned = '';
        Object.keys(known).some(function (klass) {
          if (card.classList.contains(klass)) {
            assigned = known[klass];
            return true;
          }
          return false;
        });
        if (!assigned) assigned = 'section-' + String(idx + 1);
        card.setAttribute('data-section-id', assigned);
      }

      var hasStaticHeader = card.firstElementChild && card.firstElementChild.classList && card.firstElementChild.classList.contains('creator-container__header');
      if (!hasStaticHeader) {
        var h2 = null;
        Array.prototype.some.call(card.children, function (child) {
          if (child.tagName && child.tagName.toUpperCase() === 'H2') {
            h2 = child;
            return true;
          }
          return false;
        });
        if (!h2) return;
        var title = h2.textContent || '';
        h2.remove();

        var body = document.createElement('div');
        body.className = 'creator-container__body creator-container__body--desktop';
        while (card.firstChild) {
          body.appendChild(card.firstChild);
        }

        var header = document.createElement('div');
        header.className = 'creator-container__header creator-container__header--static';
        header.setAttribute('aria-label', title);
        var sectionId = card.getAttribute('data-section-id');
        if (sectionId === 'journey') {
          header.classList.add('creator-container__header--no-reorder');
          header.innerHTML = '<span class="creator-container__title"></span>';
        } else {
          header.innerHTML =
            '<span class="creator-container__drag" aria-label="Reorder">⋮⋮</span>' +
            '<span class="creator-container__title"></span>';
        }
        var titleEl = header.querySelector('.creator-container__title');
        if (titleEl) titleEl.textContent = title;

        card.appendChild(header);
        card.appendChild(body);
      }
    });

    var bootSortable = function () {
      if (typeof Sortable === 'undefined') return;
      Sortable.create(grid, {
        handle: '.creator-container__drag',
        animation: 150,
        ghostClass: 'creator-container--dragging',
        onEnd: function () {
          var order = normalizeDesktopJourneyFirstOrder(getDesktopSectionOrderFromDom());
          reorderDesktopDom(order);
          saveDesktopLayout(order);
        }
      });
    };

    // Apply the intended default immediately to avoid initial Overview flash.
    reorderDesktopDom(defaultSectionOrder);
    loadDesktopLayout().then(function () {
      resetDesktopDashboardScroll();
      bootSortable();
    });
  }

  function initDesktopActions() {
    var balanceBtn = document.getElementById('creatorDesktopBalanceBtn');
    if (balanceBtn) {
      balanceBtn.addEventListener('click', function () {
        if (window.openSalesModal) window.openSalesModal();
      });
    }
    var eazBtn = document.getElementById('creatorDesktopEazBalance');
    if (eazBtn) {
      eazBtn.addEventListener('click', function () {
        var sub = eazBtn.getAttribute('data-footer-eaz-mode') === 'starter' ? 'starter' : 'balance';
        var opts = { tab: 'eaz', eazSub: sub };
        // Portal: lazy-load settings; never fall back to Balance & Payouts for footer EAZV.
        if (window.CreatorPortalFeatures && typeof window.CreatorPortalFeatures.openSettings === 'function') {
          window.CreatorPortalFeatures.openSettings(opts);
          return;
        }
        if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
          var overlay = document.getElementById('csmOverlay');
          if (overlay && overlay.parentElement && overlay.parentElement !== document.body) {
            try {
              var node = overlay.parentElement;
              while (node && node !== document.body) {
                var st = window.getComputedStyle(node);
                if (st.display === 'none' || st.visibility === 'hidden') {
                  document.body.appendChild(overlay);
                  break;
                }
                node = node.parentElement;
              }
            } catch (_e) {}
          }
          window.CreatorSettingsV2Modal.open(opts);
        }
      });
    }

    var copyBtn = document.getElementById('creatorDesktopCopyLinkBtn');
    var shareBtn = document.getElementById('creatorDesktopShareBtn');
    var shareBaseUrl = window.location.origin + '/';

    function resolveShareUrl() {
      if (window.ShareButtonResolveShareUrl && typeof window.ShareButtonResolveShareUrl === 'function') {
        return window.ShareButtonResolveShareUrl(shareBaseUrl);
      }
      return Promise.resolve(shareBaseUrl);
    }

    function showShareFeedback(btn, state) {
      if (!btn) return;
      btn.classList.remove('is-success', 'is-error');
      if (state === 'success' || state === 'error') btn.classList.add(state === 'success' ? 'is-success' : 'is-error');
      setTimeout(function () {
        btn.classList.remove('is-success', 'is-error');
      }, 1300);
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
          showShareFeedback(copyBtn, 'error');
          return;
        }
        resolveShareUrl()
          .then(function (url) {
            return navigator.clipboard.writeText(url);
          })
          .then(function () {
            showShareFeedback(copyBtn, 'success');
          })
          .catch(function () {
            showShareFeedback(copyBtn, 'error');
          });
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        resolveShareUrl().then(function (url) {
          if (navigator.share) {
            navigator.share({ title: 'Creator Dashboard', url: url }).catch(function () {});
            return;
          }
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(url)
              .then(function () { showShareFeedback(shareBtn, 'success'); })
              .catch(function () { showShareFeedback(shareBtn, 'error'); });
          }
        }).catch(function () {
          showShareFeedback(shareBtn, 'error');
        });
      });
    }

    function handleDesktopDashboardNav(el) {
      if (!el) return;
      var idx = parseInt(el.getAttribute('data-goto'), 10);
      if (isNaN(idx)) return;
      var screenMap = ['dashboard', 'generator', 'creations', 'marketing', 'automations'];
      var screen = screenMap[idx];
      if (!screen) return;
      if (window.CreatorDesktopShell && typeof window.CreatorDesktopShell.switchScreen === 'function') {
        window.CreatorDesktopShell.switchScreen(screen);
      }
      if (el.dataset.creationsTab && window.CreationsScreen && typeof window.CreationsScreen.switchTab === 'function') {
        window.CreationsScreen.switchTab(el.dataset.creationsTab);
      }
      if (el.dataset.marketingSubtab && window.MarketingScreen) {
        if (window.MarketingScreen.switchSubTab) window.MarketingScreen.switchSubTab(el.dataset.marketingSubtab);
        if (el.dataset.marketingContent && window.MarketingScreen.switchContentTab) {
          window.MarketingScreen.switchContentTab(el.dataset.marketingContent);
        }
        if (
          el.dataset.marketingSubtab === 'content-publish' &&
          window.HeroImagesScreen &&
          typeof window.HeroImagesScreen.loadHeroImages === 'function'
        ) {
          window.HeroImagesScreen.loadHeroImages();
        }
      }
      if (el.dataset.automationsMaintab && window.AutomationsScreen && typeof window.AutomationsScreen.switchMainTab === 'function') {
        window.AutomationsScreen.switchMainTab(el.dataset.automationsMaintab);
      }
    }

    document.querySelectorAll('.creator-desktop-action[data-goto], .creator-stat-card[data-goto]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handleDesktopDashboardNav(el);
      });
    });
  }

  function mountEazyForDesktop() {
    var header = document.querySelector('.creator-desktop-header');
    var snapAnchor = document.querySelector('.creator-desktop-header__snap-anchor');
    var mascot = document.getElementById('eazy-mascot');
    var snapSlot =
      document.getElementById('eazy-snap-slot--desktop') || document.getElementById('eazy-snap-slot--mobile');
    if (!header || !snapAnchor || !mascot || !snapSlot) {
      var retries = Number(document.documentElement.getAttribute('data-eazy-desktop-mount-retries') || 0);
      if (retries < 10) {
        document.documentElement.setAttribute('data-eazy-desktop-mount-retries', String(retries + 1));
        setTimeout(mountEazyForDesktop, 160);
      }
      return;
    }
    document.documentElement.removeAttribute('data-eazy-desktop-mount-retries');

    // Speech cluster into desktop snap anchor (snap slot is already in anchor via Liquid).
    var eazyCluster = document.getElementById('creatorEazyCluster');
    if (eazyCluster && eazyCluster.parentElement !== snapAnchor) {
      snapAnchor.insertBefore(eazyCluster, snapAnchor.firstChild);
    } else if (!eazyCluster) {
      if (mascot.parentElement !== document.body) {
        document.body.appendChild(mascot);
      }
    }
    snapSlot.classList.add('creator-desktop-snap-slot');
    mascot.classList.add('creator-desktop-mascot');
  }

  function initLanguageModal() {
    var langBtn = document.getElementById('creatorDesktopLangBtn');
    var modal = document.getElementById('creatorDesktopLangModal');
    var closeBtn = document.getElementById('creatorDesktopLangClose');
    var search = document.getElementById('creatorDesktopLangSearch');
    var list = document.getElementById('creatorDesktopLangList');
    var empty = document.getElementById('creatorDesktopLangEmpty');
    var input = document.getElementById('creatorDesktopLangInput');
    var footerFlagEl = document.getElementById('creatorDesktopLangFlag');
    var countryFlagMapEl = document.getElementById('creatorDesktopCountryFlagMap');
    if (!langBtn || !modal || !list || !input) return;
    var countryFlagMap = {};
    try { countryFlagMap = JSON.parse(countryFlagMapEl ? countryFlagMapEl.textContent : '{}'); } catch (_e) {}

    var LANG_TO_COUNTRY = {
      de: 'DE', en: 'GB', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', nl: 'NL', pl: 'PL',
      cs: 'CZ', da: 'DK', sv: 'SE', nb: 'NO', nn: 'NO', no: 'NO', fi: 'FI', hu: 'HU', ro: 'RO',
      bg: 'BG', hr: 'HR', sk: 'SK', sl: 'SI', et: 'EE', lv: 'LV', lt: 'LT', el: 'GR',
      ru: 'RU', uk: 'UA', tr: 'TR', ar: 'SA', he: 'IL', ja: 'JP', ko: 'KR',
      zh: 'CN', 'zh-cn': 'CN', 'zh-tw': 'TW', 'zh-hans': 'CN', 'zh-hant': 'TW',
      'pt-br': 'BR', 'pt-pt': 'PT', 'en-us': 'US', 'en-gb': 'GB', 'en-au': 'AU',
      af: 'ZA', sq: 'AL', hy: 'AM', az: 'AZ', be: 'BY', bs: 'BA', ca: 'ES', eu: 'ES', gl: 'ES',
      fa: 'IR', bn: 'BD', hi: 'IN', ga: 'IE', is: 'IS', id: 'ID', kk: 'KZ', ka: 'GE', mk: 'MK',
      ms: 'MY', mt: 'MT', mn: 'MN', ne: 'NP', sr: 'RS', sw: 'KE', ta: 'IN', te: 'IN', th: 'TH',
      vi: 'VN', cy: 'GB', lb: 'LU', fil: 'PH', km: 'KH', lo: 'LA', my: 'MM', si: 'LK',
      am: 'ET', an: 'ES', as: 'IN', ur: 'PK', uz: 'UZ', tg: 'TJ', tk: 'TM', ky: 'KG',
      ps: 'AF', pa: 'IN', gu: 'IN', mr: 'IN', ml: 'IN', kn: 'IN', or: 'IN',
      yo: 'NG', ig: 'NG', ha: 'NG', zu: 'ZA', xh: 'ZA', st: 'ZA', tn: 'BW',
      nso: 'ZA', rw: 'RW', rn: 'BI', so: 'SO', om: 'ET', ti: 'ER', ak: 'GH',
      ee: 'GH', tw: 'GH', mg: 'MG', ny: 'MW', sn: 'ZW', sd: 'PK', jv: 'ID', su: 'ID',
      ceb: 'PH', ilo: 'PH', mi: 'NZ', sm: 'WS', to: 'TO', fj: 'FJ', haw: 'US',
      eo: 'EU', ia: 'EU', gv: 'IM', co: 'FR', fy: 'NL', sc: 'IT', vec: 'IT',
      qu: 'PE', ay: 'BO', gn: 'PY',
      'zh-latn': 'CN', 'sr-latn': 'RS', 'sr-cyrl': 'RS', 'ja-romaji': 'JP', 'ko-romaji': 'KR',
      'ar-latn': 'SA', 'ru-latn': 'RU', 'hi-latn': 'IN'
    };
    function normalizeSearchText(value) {
      return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    var LANG_TO_COUNTRY_NORMALIZED = {};
    Object.keys(LANG_TO_COUNTRY).forEach(function (key) {
      LANG_TO_COUNTRY_NORMALIZED[String(key).toLowerCase()] = LANG_TO_COUNTRY[key];
    });
    var STRICT_LANGUAGE_COUNTRY = {
      af: 'ZA', ar: 'SA', be: 'BY', bn: 'BD', my: 'MM', zh: 'CN', 'zh-cn': 'CN', 'zh-hans': 'CN',
      'zh-tw': 'TW', 'zh-hant': 'TW', fil: 'PH', tl: 'PH', he: 'IL', id: 'ID', ja: 'JP', kk: 'KZ',
      km: 'KH', ko: 'KR', lo: 'LA', ms: 'MY', mn: 'MN', ne: 'NP', nb: 'NO', nn: 'NO', no: 'NO', 'nn-no': 'NO', 'no-no': 'NO',
      fa: 'IR', ru: 'RU', si: 'LK', sw: 'KE', th: 'TH', vi: 'VN'
    };

    function normalizeCode(code) {
      return String(code || '').trim();
    }

    function normalizeLocaleForMatch(code) {
      return normalizeCode(code).replace('_', '-').toLowerCase();
    }

    function getAvailableLocalesFromProxyLinks() {
      var links = document.querySelectorAll('link[rel="alternate"][hreflang]');
      var seen = {};
      var locales = [];
      links.forEach(function (el) {
        var code = normalizeLocaleForMatch(el.getAttribute('hreflang') || '');
        if (!code || code === 'x-default') return;
        if (seen[code]) return;
        seen[code] = true;
        locales.push(code);
      });
      if (!seen.en) locales.push('en');
      return locales;
    }

    function getBasePathWithoutLocalePrefix() {
      var parts = (window.location.pathname || '/').split('/').filter(Boolean);
      var available = getAvailableLocalesFromProxyLinks();
      var prefixSet = window.EAZ_LANG_PREFIXES;
      function isLocaleSegment(seg) {
        var normalized = normalizeLocaleForMatch(seg);
        if (!normalized) return false;
        if (prefixSet && prefixSet.has(normalized)) return true;
        if (available.indexOf(normalized) >= 0) return true;
        var base = getBaseLocale(normalized);
        if (available.some(function (loc) {
          return normalizeLocaleForMatch(loc) === base || getBaseLocale(loc) === base;
        })) return true;
        // Fallback when locale links are temporarily unavailable.
        return /^[a-z]{2}(?:-[a-z0-9]+)?$/i.test(normalized);
      }
      while (parts.length > 0 && isLocaleSegment(parts[0])) {
        parts.shift();
      }
      return '/' + parts.join('/');
    }

    function getPreferredLocaleCode() {
      var scriptLang = '';
      var dialectLang = '';
      try { scriptLang = normalizeLocaleForMatch(localStorage.getItem('eaz_script') || ''); } catch (_e) {}
      try { dialectLang = normalizeLocaleForMatch(localStorage.getItem('eaz_dialect') || ''); } catch (_e2) {}
      var cookieMatch = (document.cookie || '').match(/(?:^|;\s*)eaz_lang=([^;]+)/i);
      var cookieLang = cookieMatch && cookieMatch[1] ? normalizeLocaleForMatch(decodeURIComponent(cookieMatch[1])) : '';
      return scriptLang || dialectLang || cookieLang || '';
    }

    function getBaseLocale(code) {
      return normalizeLocaleForMatch(code).split('-')[0];
    }

    var LOCALE_GROUP_BASE_MAP = { nb: 'no', nn: 'no', no: 'no' };
    function getLocaleGroupBase(code) {
      var base = getBaseLocale(code);
      return LOCALE_GROUP_BASE_MAP[base] || base;
    }

    function getMainLanguageLabel(baseCode, uiLocale) {
      var normalizedBase = getLocaleGroupBase(baseCode);
      if (normalizedBase === 'no') {
        return getLanguageLabelForLocale('no', uiLocale) || getLanguageLabelForLocale('nb', uiLocale) || 'Norwegian';
      }
      return getLanguageLabelForLocale(normalizedBase, uiLocale) || getLanguageLabelFallback(normalizedBase);
    }

    function isScriptVariantCode(code) {
      var normalized = normalizeLocaleForMatch(code);
      var token = normalized.split('-').slice(1).join('-');
      if (!token) return false;
      return ['hans', 'hant', 'latn', 'cyrl', 'romaji'].indexOf(token) >= 0;
    }

    function resolveStoreLocale(code) {
      var normalized = normalizeLocaleForMatch(code);
      var available = getAvailableLocalesFromProxyLinks();
      if (!normalized || !available.length) return normalized || 'en';
      if (available.indexOf(normalized) >= 0) return normalized;
      var base = getBaseLocale(normalized);
      if (available.indexOf(base) >= 0) return base;
      var groupedBase = getLocaleGroupBase(normalized);
      var fallback = '';
      available.some(function (locale) {
        if (getLocaleGroupBase(locale) === groupedBase || getBaseLocale(locale) === base) {
          fallback = locale;
          return true;
        }
        return false;
      });
      return fallback || (available.indexOf('en') >= 0 ? 'en' : available[0]);
    }

    function applyLocaleRouting(code) {
      var normalized = normalizeLocaleForMatch(code);
      if (!normalized) return;
      if (typeof window.eazSetLangCookie === 'function') {
        window.eazSetLangCookie(normalized);
      } else {
        var _eazSecure =
          typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
        document.cookie =
          'eaz_lang=' + normalized + ';path=/;max-age=31536000;SameSite=Lax' + _eazSecure;
      }
      try {
        if (isScriptVariantCode(normalized)) {
          localStorage.setItem('eaz_script', normalized);
          localStorage.removeItem('eaz_dialect');
        } else if (normalized.indexOf('-') >= 0) {
          localStorage.setItem('eaz_dialect', normalized);
          localStorage.removeItem('eaz_script');
        } else {
          localStorage.removeItem('eaz_script');
          localStorage.removeItem('eaz_dialect');
        }
      } catch (_e) {}

      var returnTo =
        typeof window.eazBuildNavigationUrlForLang === 'function'
          ? window.eazBuildNavigationUrlForLang(normalized, { bust: false })
          : (function () {
              var basePath = getBasePathWithoutLocalePrefix();
              var routeLocale = resolveStoreLocale(normalized);
              var targetPath =
                routeLocale === 'en'
                  ? basePath
                  : '/' + routeLocale + (basePath === '/' ? '' : basePath);
              return targetPath + (window.location.search || '') + (window.location.hash || '');
            })();
      function hardNavigate() {
        if (typeof window.eazHardNavigateForLanguage === 'function') {
          window.eazHardNavigateForLanguage(normalized);
          return;
        }
        var targetUrl =
          typeof window.eazBuildNavigationUrlForLang === 'function'
            ? window.eazBuildNavigationUrlForLang(normalized, { bust: true })
            : returnTo;
        var sync =
          typeof window.eazSubmitShopifyLocaleChange === 'function'
            ? window.eazSubmitShopifyLocaleChange(normalized, returnTo)
            : Promise.resolve();
        sync.finally(function () {
          window.location.replace(targetUrl);
        });
      }

      if (typeof window.eazSubmitShopifyLocaleChange === 'function') {
        window.eazSubmitShopifyLocaleChange(normalized, returnTo);
      }

      if (typeof window.eazSoftSwitchLanguage === 'function') {
        window
          .eazSoftSwitchLanguage(normalized)
          .then(function (result) {
            if (result && result.ok) return;
            hardNavigate();
          })
          .catch(function () {
            hardNavigate();
          });
        return;
      }

      hardNavigate();
    }

    function getCurrentUiLocale() {
      var cookieMatch = (document.cookie || '').match(/(?:^|;\s*)eaz_lang=([^;]+)/i);
      if (cookieMatch && cookieMatch[1]) {
        try {
          return decodeURIComponent(cookieMatch[1]).trim();
        } catch (_e) {
          return String(cookieMatch[1]).trim();
        }
      }
      var match = (window.location.pathname || '').match(/^\/([a-z]{2}(?:-[a-z0-9]+)?)(?:\/|$)/i);
      if (match && match[1]) return match[1];
      var htmlLang =
        document.documentElement && document.documentElement.lang
          ? String(document.documentElement.lang).trim()
          : '';
      if (htmlLang) return htmlLang;
      return '';
    }

    var LANGUAGE_NAME_FALLBACK = {
      en: 'English', de: 'Deutsch', fr: 'Francais', es: 'Espanol', it: 'Italiano', pt: 'Portugues',
      nl: 'Nederlands', pl: 'Polski', cs: 'Cestina', da: 'Dansk', sv: 'Svenska', nb: 'Norsk Bokmal',
      nn: 'Nynorsk', no: 'Norsk', fi: 'Suomi', hu: 'Magyar', ro: 'Romana', bg: 'Balgarski',
      hr: 'Hrvatski', sk: 'Slovencina', sl: 'Slovenscina', et: 'Eesti', lv: 'Latviesu', lt: 'Lietuviu',
      el: 'Ellinika', ru: 'Russkiy', uk: 'Ukrainska', tr: 'Turkce', ar: 'Arabic', he: 'Hebrew',
      ja: 'Nihongo', ko: 'Hangugeo', zh: 'Chinese', fa: 'Farsi', bn: 'Bangla', hi: 'Hindi',
      az: 'Azarbaycan', be: 'Belaruskaya', bs: 'Bosanski', af: 'Afrikaans', sq: 'Shqip',
      hy: 'Hayeren', ka: 'Kartuli', mk: 'Makedonski', sr: 'Srpski', sw: 'Kiswahili', ta: 'Tamil',
      te: 'Telugu', th: 'Thai', vi: 'Tieng Viet', id: 'Bahasa Indonesia', ms: 'Bahasa Melayu',
      mt: 'Malti', mn: 'Mongol', ne: 'Nepali', cy: 'Cymraeg', ga: 'Gaeilge', is: 'Islenska',
      lb: 'Letzebuergesch', fil: 'Filipino', km: 'Khmer', lo: 'Lao', my: 'Burmese', si: 'Sinhala',
      'en-us': 'English (US)', 'en-gb': 'English (UK)', 'en-au': 'English (Australia)',
      'pt-br': 'Portugues (Brasil)', 'pt-pt': 'Portugues (Portugal)',
      'zh-cn': 'Chinese (Simplified)', 'zh-tw': 'Chinese (Traditional)',
      'zh-hans': 'Chinese (Simplified Script)', 'zh-hant': 'Chinese (Traditional Script)',
      'zh-latn': 'Chinese (Pinyin)', 'sr-latn': 'Serbian (Latin)', 'sr-cyrl': 'Serbian (Cyrillic)',
      'ja-romaji': 'Japanese (Romaji)', 'ko-romaji': 'Korean (Romanized)',
      'ar-latn': 'Arabic (Romanized)', 'ru-latn': 'Russian (Romanized)', 'hi-latn': 'Hindi (Romanized)'
    };

    function formatCode(code) {
      return normalizeCode(code).toUpperCase();
    }

    function resolveCountryCode(code) {
      var normalized = normalizeCode(code);
      var lower = normalized.toLowerCase();
      if (STRICT_LANGUAGE_COUNTRY[lower]) return STRICT_LANGUAGE_COUNTRY[lower];
      if (LANG_TO_COUNTRY_NORMALIZED[lower]) return LANG_TO_COUNTRY_NORMALIZED[lower];
      var parts = lower.split('-');
      if (parts.length > 1 && parts[1] && parts[1].length === 2) return parts[1].toUpperCase();
      if (parts.length > 2 && parts[2] && parts[2].length === 2) return parts[2].toUpperCase();
      if (LANG_TO_COUNTRY_NORMALIZED[parts[0]]) return LANG_TO_COUNTRY_NORMALIZED[parts[0]];
      try {
        if (typeof Intl !== 'undefined' && typeof Intl.Locale === 'function') {
          var maximized = new Intl.Locale(normalized).maximize();
          if (maximized && maximized.region && String(maximized.region).length === 2) {
            return String(maximized.region).toUpperCase();
          }
        }
      } catch (_e) {}
      return '';
    }

    function getFlagUrl(countryCode) {
      var cc = String(countryCode || '').toUpperCase();
      if (!cc || cc.length !== 2) return '';
      return 'https://flagcdn.com/w80/' + cc.toLowerCase() + '.png';
    }

    function countryCodeToFlagEmoji(countryCode) {
      var cc = String(countryCode || '').toUpperCase();
      if (cc.length !== 2) return '🌐';
      return String.fromCodePoint(cc.charCodeAt(0) + 127397, cc.charCodeAt(1) + 127397);
    }

    function isLangDebugEnabled() {
      try {
        var url = new URL(window.location.href);
        if (url.searchParams.get('lang_debug') === '1') return true;
      } catch (_e) {}
      return false;
    }

    function renderLangDebugPanel() {
      if (!isLangDebugEnabled()) return;
      var panelId = 'creatorDesktopLangDebugPanel';
      var panel = document.getElementById(panelId);
      if (!panel) {
        panel = document.createElement('div');
        panel.id = panelId;
        panel.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;max-width:360px;max-height:42vh;overflow:auto;padding:8px 10px;border-radius:10px;background:rgba(5,9,24,.9);border:1px solid rgba(255,255,255,.18);color:#dbe5ff;font:11px/1.35 system-ui,sans-serif;backdrop-filter:blur(8px);';
        document.body.appendChild(panel);
      }
      var rows = [];
      list.querySelectorAll('.creator-desktop-lang-modal__item').forEach(function (item) {
        var code = normalizeCode(item.dataset.langCode);
        var cc = resolveCountryCode(code);
        var viaMap = !!(cc && (countryFlagMap[String(cc).toUpperCase()] || countryFlagMap[String(cc).toLowerCase()]));
        var url = cc ? getFlagUrl(cc) : '';
        rows.push('<div><strong>' + code + '</strong> -> ' + (cc || 'none') + ' | ' + (cc ? (viaMap ? 'shopify-map' : 'flagcdn') : 'emoji') + '</div>');
      });
      panel.innerHTML = '<div style="font-weight:700;margin-bottom:6px">Creator Desktop Lang Debug</div><div style="opacity:.8;margin-bottom:6px">active=' + normalizeLocaleForMatch(input.value) + '</div>' + rows.join('');
    }

    function formatTitleCaseIfLatin(text) {
      var value = String(text || '').trim();
      if (!value) return value;
      if (!/[A-Za-z]/.test(value)) return value;
      return value
        .split(/\s+/)
        .map(function (part) { return part ? (part.charAt(0).toUpperCase() + part.slice(1)) : part; })
        .join(' ');
    }

    function intlDisplayNamesLocale(uiLocale) {
      var u = String(uiLocale || '').trim().toLowerCase();
      if (!u) return 'en';
      if (u === 'fil') return 'tl';
      return u;
    }

    function getLanguageLabelForLocale(code, locale) {
      var normalized = normalizeCode(code);
      try {
        var dn = new Intl.DisplayNames([intlDisplayNamesLocale(locale)], { type: 'language' });
        var translated = dn.of(normalized);
        if (translated) return formatTitleCaseIfLatin(translated);
      } catch (_e) {}
      return '';
    }

    function getLanguageLabelFallback(code) {
      var normalized = normalizeLocaleForMatch(code);
      if (LANGUAGE_NAME_FALLBACK[normalized]) return LANGUAGE_NAME_FALLBACK[normalized];
      var base = getBaseLocale(normalized);
      if (LANGUAGE_NAME_FALLBACK[base]) return LANGUAGE_NAME_FALLBACK[base];
      return formatCode(code);
    }

    function rebuildLanguageListFromProxy() {
      var locales = getAvailableLocalesFromProxyLinks();
      if (!Array.isArray(locales) || locales.length === 0) return;
      var uiLocale = normalizeLocaleForMatch(getCurrentUiLocale()) || 'en';
      var current = normalizeLocaleForMatch(getPreferredLocaleCode() || input.value || getCurrentUiLocale());

      var groupsByBase = {};
      locales.forEach(function (locale) {
        var normalized = normalizeLocaleForMatch(locale);
        var base = getLocaleGroupBase(normalized);
        if (!groupsByBase[base]) {
          groupsByBase[base] = { base: base, main: normalized, variants: [] };
        }
        if (normalized === base) groupsByBase[base].main = normalized;
        else groupsByBase[base].variants.push(normalized);
      });

      var groups = Object.keys(groupsByBase).map(function (base) { return groupsByBase[base]; });
      groups.forEach(function (group) {
        if (!group.main && group.base === 'no') {
          if (group.variants.indexOf('nb') >= 0) group.main = 'nb';
          else if (group.variants.indexOf('nn') >= 0) group.main = 'nn';
        }
        group.variants = group.variants.filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
      });
      groups.sort(function (a, b) {
        var aActive = getLocaleGroupBase(current) === a.base ? 1 : 0;
        var bActive = getLocaleGroupBase(current) === b.base ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        var aLabel = getLanguageLabelForLocale(a.main || a.base, uiLocale) || a.base;
        var bLabel = getLanguageLabelForLocale(b.main || b.base, uiLocale) || b.base;
        return aLabel.localeCompare(bLabel);
      });

      var html = groups.map(function (group) {
        var code = group.main || group.base;
        var name = getMainLanguageLabel(group.base, uiLocale);
        var activeClass = (getLocaleGroupBase(current) === group.base) ? ' is-active' : '';
        var variants = group.variants.slice().filter(function (v) { return v !== code; }).sort();
        var searchText = [name, group.base].join(' ');
        var plusBtn = variants.length ? '<span class="creator-desktop-lang-plus" role="button" tabindex="0" data-base-code="' + group.base + '" aria-label="Dialects and scripts">+</span>' : '';
        return '' +
          '<div class="creator-desktop-lang-row" data-base-code="' + group.base + '" data-lang-search="' + searchText + '">' +
            '<button class="creator-desktop-lang-modal__item' + activeClass + '" type="button" data-lang-code="' + code + '" data-lang-name="' + name + '" data-base-code="' + group.base + '" data-variants="' + variants.join(',') + '">' +
              '<span class="creator-desktop-lang-modal__item-left">' +
                '<span class="creator-desktop-lang-modal__item-flag" data-lang-flag>🌐</span>' +
                '<span class="creator-desktop-lang-modal__item-name" data-lang-label>' + name + '</span>' +
              '</span>' +
              '<span class="creator-desktop-lang-modal__item-right">' + plusBtn + '</span>' +
            '</button>' +
          '</div>';
      }).join('');

      html += '<div class="creator-desktop-lang-modal__empty" id="creatorDesktopLangEmpty" hidden>No languages found</div>';
      list.innerHTML = html;
      empty = document.getElementById('creatorDesktopLangEmpty');
    }

    function syncInputWithCurrentLocale() {
      var current = normalizeLocaleForMatch(getPreferredLocaleCode() || getCurrentUiLocale());
      if (!current) return;
      var items = list.querySelectorAll('.creator-desktop-lang-modal__item');
      var exact = '';
      var base = getLocaleGroupBase(current);
      var baseMatch = '';
      Array.prototype.forEach.call(items, function (item) {
        var code = normalizeLocaleForMatch(item.dataset.langCode);
        if (!exact && code === current) exact = item.dataset.langCode || '';
        if (!baseMatch && getLocaleGroupBase(code) === base) baseMatch = item.dataset.langCode || '';
      });
      if (exact) input.value = exact;
      else if (baseMatch) input.value = baseMatch;
    }

    function applyLanguageItems() {
      var activeCode = normalizeLocaleForMatch(input.value);
      var uiLocale = normalizeLocaleForMatch(getCurrentUiLocale()) || activeCode || 'en';
      list.querySelectorAll('.creator-desktop-lang-modal__item').forEach(function (item) {
        var code = normalizeCode(item.dataset.langCode);
        var flagEl = item.querySelector('[data-lang-flag]');
        var labelEl = item.querySelector('[data-lang-label]');
        var fallbackName = String(item.dataset.langName || '').trim();
        var baseCode = String(item.getAttribute('data-base-code') || '');
        var translatedName = getMainLanguageLabel(baseCode || code, uiLocale);
        var resolvedName = translatedName || formatTitleCaseIfLatin(fallbackName) || getMainLanguageLabel(baseCode || code, uiLocale);
        var normalizedCode = normalizeLocaleForMatch(code);
        var isActive = !!activeCode && (normalizedCode === activeCode || getLocaleGroupBase(normalizedCode) === getLocaleGroupBase(activeCode));
        item.classList.toggle('is-active', isActive);
        item.dataset.langSearch = [resolvedName, fallbackName, getLocaleGroupBase(code)].join(' ');
        var row = item.closest('.creator-desktop-lang-row');
        if (row) {
          var baseCode = String(item.getAttribute('data-base-code') || '');
          row.dataset.langSearch = [resolvedName, fallbackName, baseCode].join(' ');
        }
        if (labelEl) labelEl.textContent = resolvedName;
        if (!flagEl) return;
        var countryCode = resolveCountryCode(code);
        if (countryCode) {
          var flagUrl = getFlagUrl(countryCode);
          if (!flagUrl) {
            flagEl.classList.add('creator-desktop-lang-modal__item-flag--emoji');
            flagEl.style.backgroundImage = '';
            flagEl.textContent = countryCodeToFlagEmoji(countryCode);
            return;
          }
          flagEl.classList.remove('creator-desktop-lang-modal__item-flag--emoji');
          flagEl.style.backgroundImage = flagUrl ? ('url(' + flagUrl + ')') : '';
          flagEl.textContent = '';
        } else {
          flagEl.classList.add('creator-desktop-lang-modal__item-flag--emoji');
          flagEl.style.backgroundImage = '';
          flagEl.textContent = countryCodeToFlagEmoji(countryCode);
        }
      });
      if (footerFlagEl && input && input.value) {
        var activeCountryCode = resolveCountryCode(input.value);
        if (activeCountryCode) {
          var activeFlagUrl = getFlagUrl(activeCountryCode);
          if (!activeFlagUrl) {
            footerFlagEl.classList.add('creator-desktop-lang-modal__item-flag--emoji');
            footerFlagEl.style.backgroundImage = '';
            footerFlagEl.textContent = countryCodeToFlagEmoji(activeCountryCode);
            renderLangDebugPanel();
            return;
          }
          footerFlagEl.classList.remove('creator-desktop-lang-modal__item-flag--emoji');
          footerFlagEl.style.backgroundImage = activeFlagUrl ? ('url(' + activeFlagUrl + ')') : '';
          footerFlagEl.textContent = '';
        } else {
          footerFlagEl.classList.add('creator-desktop-lang-modal__item-flag--emoji');
          footerFlagEl.style.backgroundImage = '';
          footerFlagEl.textContent = countryCodeToFlagEmoji(activeCountryCode);
        }
      }
      renderLangDebugPanel();
    }

    function filterItems(term) {
      var q = normalizeSearchText(term);
      var visible = 0;
      list.querySelectorAll('.creator-desktop-lang-row').forEach(function (row) {
        var searchable = normalizeSearchText(row.dataset.langSearch || '');
        var match = !q || searchable.indexOf(q) !== -1;
        row.hidden = !match;
        row.style.display = match ? '' : 'none';
        if (match) visible += 1;
      });
      if (empty) empty.hidden = visible > 0;
    }

    function openVariantModal(baseCode, variantsCsv, title) {
      var variants = String(variantsCsv || '').split(',').map(function (v) { return normalizeLocaleForMatch(v); }).filter(Boolean);
      if (!variants.length) return;
      var modalId = 'creatorDesktopDialectModal';
      var modal = document.getElementById(modalId);
      if (!modal) {
        modal = document.createElement('dialog');
        modal.id = modalId;
        modal.className = 'creator-desktop-lang-modal creator-desktop-dialect-modal';
        modal.innerHTML = '<div class="creator-desktop-lang-modal__content"><div class="creator-desktop-lang-modal__header"><h2 class="creator-desktop-lang-modal__title" id="creatorDesktopDialectTitle">Variants</h2><button class="creator-desktop-lang-modal__close" type="button" data-close>×</button></div><div class="creator-desktop-lang-modal__list" id="creatorDesktopDialectList"></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
        modal.querySelector('[data-close]').addEventListener('click', function () { modal.close(); });
      }
      var titleEl = document.getElementById('creatorDesktopDialectTitle');
      var bodyEl = document.getElementById('creatorDesktopDialectList');
      if (!bodyEl) return;
      if (titleEl) titleEl.textContent = title || baseCode.toUpperCase();
      var uiLocale = normalizeLocaleForMatch(getCurrentUiLocale()) || 'en';
      var activeCode = normalizeLocaleForMatch(input.value || getCurrentUiLocale());
      var dialects = [];
      var scripts = [];
      variants.forEach(function (code) {
        if (isScriptVariantCode(code)) scripts.push(code);
        else dialects.push(code);
      });
      function row(code) {
        var cc = resolveCountryCode(code);
        var flag = cc ? ('url(' + getFlagUrl(cc) + ')') : '';
        var name = getLanguageLabelForLocale(code, uiLocale) || getLanguageLabelFallback(code);
        var active = (code === activeCode) ? ' is-active' : '';
        return '<button class="creator-desktop-lang-modal__item' + active + '" type="button" data-variant-code="' + code + '">' +
          '<span class="creator-desktop-lang-modal__item-left">' +
          '<span class="creator-desktop-lang-modal__item-flag' + (flag ? '' : ' creator-desktop-lang-modal__item-flag--emoji') + '" data-lang-flag style="' + (flag ? ('background-image:' + flag) : '') + '">' + (flag ? '' : countryCodeToFlagEmoji(cc)) + '</span>' +
          '<span class="creator-desktop-lang-modal__item-name">' + name + '</span></span>' +
          '<span style="opacity:.72;font-size:12px">' + formatCode(code) + '</span>' +
          '</button>';
      }
      var html = '';
      if (dialects.length) {
        html += '<div class="creator-desktop-dialect-modal__section-title">Dialects</div>';
        html += dialects.map(row).join('');
      }
      if (scripts.length) {
        html += '<div class="creator-desktop-dialect-modal__section-title">Scripts</div>';
        html += scripts.map(row).join('');
      }
      bodyEl.innerHTML = html;
      bodyEl.onclick = function (e) {
        var btn = e.target.closest('[data-variant-code]');
        if (!btn) return;
        var code = btn.getAttribute('data-variant-code');
        if (!code) return;
        input.value = code;
        applyLanguageItems();
        modal.close();
        applyLocaleRouting(code);
      };
      modal.showModal();
    }

    function selectCode(code) {
      input.value = code;
      applyLanguageItems();
      applyLocaleRouting(code);
    }

    langBtn.addEventListener('click', function () {
      syncInputWithCurrentLocale();
      applyLanguageItems();
      modal.showModal();
      if (search) {
        filterItems(search.value || '');
        setTimeout(function () { search.focus(); }, 20);
      }
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { modal.close(); });
    if (search) {
      var runDesktopLangFilter = function () { filterItems(search.value); };
      search.addEventListener('input', runDesktopLangFilter);
      search.addEventListener('keyup', runDesktopLangFilter);
      search.addEventListener('search', runDesktopLangFilter);
      search.addEventListener('change', runDesktopLangFilter);
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.close();
    });
    list.addEventListener('click', function (e) {
      var plus = e.target.closest('.creator-desktop-lang-plus');
      if (plus) {
        e.preventDefault();
        e.stopPropagation();
        var base = plus.getAttribute('data-base-code') || '';
        var row = plus.closest('.creator-desktop-lang-row');
        var item = row ? row.querySelector('.creator-desktop-lang-modal__item') : null;
        if (item) openVariantModal(base, item.getAttribute('data-variants') || '', item.getAttribute('data-lang-name') || base);
        return;
      }
      var btn = e.target.closest('.creator-desktop-lang-modal__item');
      if (!btn) return;
      selectCode(btn.dataset.langCode);
    });

    rebuildLanguageListFromProxy();
    syncInputWithCurrentLocale();
    applyLanguageItems();
  }

  async function loadBalances() {
    if (window.__CREATOR_IS_LOGGED_IN === false && !window.__DEV_BYPASS) {
      text('creator-desktop-sales-balance-value', '0');
      document.querySelectorAll('.creator-desktop-header [data-sales-balance-unit]').forEach(function (el) {
        el.textContent = 'EAZC';
      });
      text('creator-desktop-eaz-value', '—');
      if (typeof window.applyCreatorFooterStarterUi === 'function') {
        window.applyCreatorFooterStarterUi({ ok: false });
      }
      return;
    }

    var owner = getOwnerId();
    if (!owner) {
      text('creator-desktop-sales-balance-value', '—');
      text('creator-desktop-eaz-value', '—');
      if (typeof window.applyCreatorFooterStarterUi === 'function') {
        window.applyCreatorFooterStarterUi({ ok: false });
      }
      return;
    }

    // EAZ: creator-api-helper.liquid (loadCreatorBalance). Sales: creator-creator-area-api.js.
    if (typeof window.loadCreatorSalesBalance === 'function') {
      window.loadCreatorSalesBalance();
    }
    if (typeof window.loadCreatorBalance === 'function') {
      window.loadCreatorBalance();
    }
  }

  function readGuestAuthConfig() {
    var el = document.getElementById('creator-desktop-guest-auth-json');
    if (!el || !String(el.textContent || '').trim()) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (_e) {
      return null;
    }
  }

  function buildGuestLoginHref(cfg) {
    if (!cfg || !cfg.loginBase) return '#';
    if (!cfg.returnUrl) return String(cfg.loginBase);
    var join = String(cfg.loginBase).indexOf('?') >= 0 ? '&' : '?';
    return String(cfg.loginBase) + join + 'redirect=' + encodeURIComponent(String(cfg.returnUrl));
  }

  function hideGuestJourneyExtras() {
    var cta = document.getElementById('creator-desktop-journey-guest-cta');
    if (cta) cta.hidden = true;
  }

  function applyGuestDashboard() {
    text('creator-desktop-level-num', '0');
    text('creator-desktop-hero-level-num', '0');
    text('creator-desktop-level-name', resolveLevelName(0));
    text('creator-desktop-hero-level-name', resolveLevelName(0));
    text('creator-desktop-xp-value', '—');
    text('creator-desktop-hero-xp-value', '—');
    setDesktopXpHint(i18n.guestXpHint || '');
    width('creator-desktop-xp-fill', 0);
    heightSync('creator-desktop-hero-xp-fill', 0);
    var cfgGuest = readGuestAuthConfig();
    var listEl = document.getElementById('creator-desktop-journey-open-list');
    var completedEl = document.getElementById('creator-desktop-journey-completed-list');
    if (completedEl) {
      completedEl.innerHTML = '';
    }
    if (listEl) {
      listEl.innerHTML = '';
      var li = document.createElement('li');
      li.className = 'creator-desktop-journey__task-row--guest-login';
      var loginHref = buildGuestLoginHref(cfgGuest);
      var a = document.createElement('a');
      a.className = 'creator-todo-item creator-todo-item--login';
      a.href = loginHref;
      var todoTitle = i18n.todoLogin || '';
      var todoReward = i18n.todoLoginReward || '';
      a.setAttribute('aria-label', [todoTitle, todoReward].filter(Boolean).join('. ') || todoTitle);

      var icon = document.createElement('div');
      icon.className = 'creator-todo-item__icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '🚀';

      var content = document.createElement('div');
      content.className = 'creator-todo-item__content';
      var titleEl = document.createElement('p');
      titleEl.className = 'creator-todo-item__title';
      titleEl.setAttribute('data-t', 'creator.overview.todo_login');
      titleEl.textContent = todoTitle;
      var xpEl = document.createElement('span');
      xpEl.className = 'creator-todo-item__xp';
      xpEl.setAttribute('data-t', 'creator.overview.todo_login_reward');
      xpEl.textContent = todoReward;
      content.appendChild(titleEl);
      content.appendChild(xpEl);

      var arrow = document.createElement('span');
      arrow.className = 'creator-todo-item__arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';

      a.appendChild(icon);
      a.appendChild(content);
      a.appendChild(arrow);
      li.appendChild(a);
      listEl.appendChild(li);
    }
    var guestCta = document.getElementById('creator-desktop-journey-guest-cta');
    if (guestCta) {
      guestCta.hidden = false;
      var ctaP = guestCta.querySelector('p');
      var ctaA = guestCta.querySelector('a');
      if (ctaP) {
        ctaP.textContent = i18n.guestCtaText || '';
      }
      if (ctaA) {
        ctaA.textContent = i18n.guestCtaRegister || '';
        if (cfgGuest && cfgGuest.registerUrl) {
          ctaA.href = String(cfgGuest.registerUrl);
        }
      }
    }
    switchDesktopJourneyTab('open');
    text('creator-desktop-journey-open-count', '1');
    text('creator-desktop-journey-completed-count', '0');
    width('creator-desktop-journey-fill', 0);
    text('creator-desktop-stat-designs-generated', '—');
    text('creator-desktop-stat-designs-uploaded', '—');
    text('creator-desktop-stat-products-online', '—');
    text('creator-desktop-stat-products-offline', '—');
    text('creator-desktop-stat-heroes-generated', '—');
    text('creator-desktop-stat-heroes-online', '—');
  }

  function normalizeJourneySettingsTab(raw) {
    if (raw == null || raw === '') return null;
    var s = String(raw).trim();
    if (!s) return null;
    if (s === 'creator_code') return 'creator-codes';
    if (s === 'creator_names' || s === 'creator_name') return 'creator-names';
    return s;
  }

  function normalizeCreatorDashboardHref(href) {
    if (!href || typeof href !== 'string') return href || '#';
    return href.replace(/\/pages\/creator-overview/gi, '/');
  }

  function journeyHrefFromPresentation(pres, fb) {
    var p = pres && typeof pres === 'object' ? pres : {};
    var fbL = fb && fb.link ? String(fb.link) : '';
    var base =
      typeof p.web_href === 'string' && String(p.web_href).trim() ? String(p.web_href).trim() : fbL || '';
    var q = p.query != null ? String(p.query) : '';
    if (base && q) {
      var qPart = q.indexOf('?') === 0 ? q.slice(1) : q;
      base += base.indexOf('?') >= 0 ? '&' + qPart : '?' + qPart;
    }
    var ah = p.anchor != null ? String(p.anchor) : '';
    if (base && ah) base += ah.charAt(0) === '#' ? ah : '#' + ah;
    return normalizeCreatorDashboardHref(base || '#');
  }

  function journeyPresentationSettingsTab(pres, fb) {
    var p = pres && typeof pres === 'object' ? pres : {};
    return normalizeJourneySettingsTab(p.settings_tab_open || p.open_settings_modal || (fb && fb.openSettingsTab));
  }

  function isJourneyShareReferralTask(todoId, pres, fb) {
    var p = pres && typeof pres === 'object' ? pres : {};
    if (todoId === 'todo_invite_user') return true;
    if (p.journey_action === 'share_referral') return true;
    if (fb && fb.action === 'share_referral') return true;
    return false;
  }

  function openJourneyReferralShare() {
    var homeBase = 'https://www.eazpire.com/';
    function doShare(url) {
      if (navigator.share) {
        navigator.share({ title: 'eazpire', url: url }).catch(function () {});
      } else if (window.ShareButtonOpenModal) {
        window.ShareButtonOpenModal(url, 'eazpire', url);
      }
    }
    if (window.ShareButtonResolveShareUrl) {
      window.ShareButtonResolveShareUrl(homeBase).then(doShare).catch(function () {
        doShare(homeBase);
      });
    } else {
      doShare(homeBase);
    }
  }

  function journeyTaskAnchorOpen(todoId, pres, fb, rawHref) {
    if (isJourneyShareReferralTask(todoId, pres, fb)) {
      return ' href="#" data-journey-share-referral="1"';
    }
    var settingsTab = journeyPresentationSettingsTab(pres, fb);
    var hrefEsc = escDesktop(String(rawHref || '#'));
    if (settingsTab && typeof settingsTab === 'string') {
      return (
        ' href="#" data-open-creator-settings="' +
        escDesktop(settingsTab) +
        '" data-settings-fallback-href="' +
        hrefEsc +
        '"'
      );
    }
    return ' href="' + hrefEsc + '"';
  }

  function journeyTodoTitleFromApi(todoId, pres, todoLabels) {
    var p = pres && typeof pres === 'object' ? pres : {};
    var tt = typeof p.title_text === 'string' ? p.title_text.trim() : '';
    if (tt) return tt;
    var sk = typeof p.title_shopify_key === 'string' ? p.title_shopify_key.trim() : '';
    if (sk && sk.indexOf('creator.overview.') === 0) {
      var shortKey = sk.slice('creator.overview.'.length);
      if (todoLabels && todoLabels[shortKey]) return String(todoLabels[shortKey]);
    }
    if (todoLabels && todoLabels[todoId]) return String(todoLabels[todoId]);
    if (todoId) return String(todoId);
    return '';
  }

  function resolveLevelName(level) {
    var L = Number(level);
    var fallback = i18n.defaultLevel || '';
    var names = i18n.levelNames || {};
    if (Number.isFinite(L) && L >= 0 && names[L]) {
      return String(names[L]);
    }
    var mapEl = document.getElementById('creator-desktop-level-map');
    if (mapEl) {
      var attr = mapEl.getAttribute('data-level-' + String(L));
      if (attr && String(attr).trim()) return String(attr).trim();
    }
    return fallback;
  }

  function renderDesktopJourneyOnboarding(onboarding) {
    var openList = document.getElementById('creator-desktop-journey-open-list');
    var completedList = document.getElementById('creator-desktop-journey-completed-list');
    if (!openList || !completedList) return;
    var todoLabels = (i18n && i18n.todoLabels) || {};
    var progress = onboarding && onboarding.progress ? onboarding.progress : {};
    var todos = onboarding && onboarding.todos ? onboarding.todos : [];
    var completedIds = new Set((onboarding && onboarding.completed_todos) || []);
    var openParts = [];
    var completedParts = [];
    var xpTpl = i18n.xpReward || '+%{xp} XP';

    todos.forEach(function (t) {
      var pres = t.presentation && typeof t.presentation === 'object' ? t.presentation : {};
      var cfg = TODO_DESKTOP[t.id] || { icon: '✓', link: '#' };
      var pk = t.progressKey || t.progress_key || cfg.progressKey;
      var isDone = pk ? Boolean(progress[pk]) : false;
      var isClaimed = completedIds.has(t.id) || t.completed;
      var label = journeyTodoTitleFromApi(t.id, pres, todoLabels) || t.title || String(t.id || '');
      var xpText = String(xpTpl).replace('%{xp}', String(t.xp != null ? t.xp : 0));
      var countHtml = '';
      var countKeyMerged = cfg.countKey || t.countKey;
      if (countKeyMerged && t.count_current !== undefined) {
        var target = t.count_target != null ? t.count_target : cfg.countTarget;
        countHtml =
          '<span class="creator-todo-count">' +
          escDesktop(String(t.count_current || 0)) +
          '/' +
          escDesktop(String(target != null ? target : 0)) +
          '</span>';
      }
      var rawHref = journeyHrefFromPresentation(pres, cfg);
      var anchorOpen = journeyTaskAnchorOpen(t.id, pres, cfg, rawHref);

      var iconMerged = typeof pres.icon === 'string' && pres.icon ? pres.icon : cfg.icon || '✓';

      if (isClaimed) {
        completedParts.push(
          '<li class="creator-desktop-journey__task-row"><div class="creator-todo-item creator-todo-item--claimed">' +
            '<div class="creator-todo-item__icon">' +
            escDesktop(iconMerged) +
            '</div><div class="creator-todo-item__content"><p>' +
            escDesktop(label) +
            '</p><span class="creator-todo-item__xp">' +
            escDesktop(xpText) +
            ' ✓</span>' +
            countHtml +
            '</div></div></li>'
        );
        return;
      }
      if (isDone) {
        openParts.push(
          '<li class="creator-desktop-journey__task-row"><a' +
            anchorOpen +
            ' class="creator-todo-item creator-todo-item--ready"><span class="creator-todo-badge">' +
            escDesktop(i18n.badgeDone || '') +
            '</span><div class="creator-todo-item__icon">' +
            escDesktop(iconMerged) +
            '</div><div class="creator-todo-item__content"><p>' +
            escDesktop(label) +
            '</p><span class="creator-todo-item__xp">' +
            escDesktop(xpText) +
            '</span>' +
            countHtml +
            '<p class="creator-todo-claim">' +
            escDesktop(i18n.claimHint || '') +
            '</p></div><span class="creator-todo-item__arrow">→</span></a></li>'
        );
      } else {
        openParts.push(
          '<li class="creator-desktop-journey__task-row"><a' +
            anchorOpen +
            ' class="creator-todo-item"><div class="creator-todo-item__icon">' +
            escDesktop(iconMerged) +
            '</div><div class="creator-todo-item__content"><p>' +
            escDesktop(label) +
            '</p><span class="creator-todo-item__xp">' +
            escDesktop(xpText) +
            '</span>' +
            countHtml +
            '</div><span class="creator-todo-item__arrow">→</span></a></li>'
        );
      }
    });

    openList.innerHTML = openParts.length
      ? openParts.join('')
      : '<li class="creator-desktop-journey__empty"><p>' + escDesktop(i18n.noOpenTasks || '') + '</p></li>';
    completedList.innerHTML = completedParts.length
      ? completedParts.join('')
      : '<li class="creator-desktop-journey__empty"><p>' + escDesktop(i18n.noCompletedTasks || '') + '</p></li>';

    text('creator-desktop-journey-open-count', String(openParts.length));
    text('creator-desktop-journey-completed-count', String(completedParts.length));
  }

  function showDesktopJourneyLoadError(message) {
    var openList = document.getElementById('creator-desktop-journey-open-list');
    var msg = message || (i18n.todosError || 'Could not load tasks.');
    if (openList) {
      openList.innerHTML =
        '<li class="creator-desktop-journey__empty"><p>' + escDesktop(msg) + '</p></li>';
    }
  }

  function applyDesktopLevelFromApi(level) {
    if (!level || !level.ok) return;
        var totalXp = Number(level.total_xp || 0);
        var thresholds = [];
        if (Array.isArray(level.level_thresholds) && level.level_thresholds.length) {
          thresholds = level.level_thresholds;
        } else if (Array.isArray(level.thresholds) && level.thresholds.length) {
          thresholds = level.thresholds;
        }

        function xpAtLevel(L) {
          var row = thresholds.find(function (item) {
            return Number(item.level) === Number(L);
          });
          return row ? Number(row.xp_required) || 0 : 0;
        }

        var trialMode = level.trial_mode === true;
        var srvLevel = Number(level.current_level);
        var currentLevel =
          Number.isFinite(srvLevel) && srvLevel >= 1 ? Math.min(10, Math.floor(srvLevel)) : 1;

        var pct = 0;
        var xpMainText = '';
        var heroHint = '';

        if (trialMode) {
          var capXp = xpAtLevel(2);
          var denomTrial = Math.max(1, capXp);
          pct = Math.min(100, (totalXp / denomTrial) * 100);
          xpMainText = totalXp + ' / ' + capXp + ' XP';
          var remTrial = Math.max(0, capXp - totalXp);
          if (level.trial_needs_creator_code || totalXp >= capXp) {
            heroHint = i18n.xpNeedCreatorCode || '';
          } else {
            var hintTplTrial = i18n.xpUntilNext || 'Still {xp} XP until Level {level}';
            heroHint = String(hintTplTrial)
              .replace('{xp}', String(remTrial))
              .replace('{level}', '2');
          }
        } else {
          var currentXpReq = xpAtLevel(currentLevel);
          var nextXpAbs = xpAtLevel(currentLevel + 1);
          var hasNextLevel = currentLevel < 10 && nextXpAbs > currentXpReq;
          var inLevelXp = Math.max(0, totalXp - currentXpReq);
          var denom = hasNextLevel ? Math.max(1, nextXpAbs - currentXpReq) : 1;
          pct = hasNextLevel ? Math.min(100, (inLevelXp / denom) * 100) : 100;
          var remainingXp = hasNextLevel ? Math.max(0, nextXpAbs - totalXp) : 0;
          xpMainText = hasNextLevel ? inLevelXp + ' / ' + denom + ' XP' : totalXp + ' XP';
          if (currentLevel >= 10) {
            heroHint = i18n.maxLevelReached || '';
          } else if (hasNextLevel) {
            var hintTpl = i18n.xpUntilNext || 'Still {xp} XP until Level {level}';
            heroHint = String(hintTpl)
              .replace('{xp}', String(remainingXp))
              .replace('{level}', String(currentLevel + 1));
          } else {
            heroHint = i18n.maxLevelReached || '';
          }
        }

        text('creator-desktop-level-num', String(currentLevel));
        text('creator-desktop-level-name', resolveLevelName(currentLevel));
        text('creator-desktop-xp-value', xpMainText);
        text('creator-desktop-hero-level-num', String(currentLevel));
        text('creator-desktop-hero-level-name', resolveLevelName(currentLevel));
        text('creator-desktop-hero-xp-value', xpMainText);
        setDesktopXpHint(heroHint);
        width('creator-desktop-xp-fill', pct);
        heightSync('creator-desktop-hero-xp-fill', pct);

        if (
          window.CreatorLevelCelebration &&
          typeof window.CreatorLevelCelebration.syncFromApi === 'function'
        ) {
          window.CreatorLevelCelebration.syncFromApi(level, {
            levelName: resolveLevelName(currentLevel),
          });
        }
  }

  async function loadStats() {
    if (creatorGuestBypassDesktop()) {
      applyGuestDashboard();
      return;
    }
    hideGuestJourneyExtras();
    var owner = getOwnerId();
    if (!owner) return;

    apiGet('get-dashboard-stats', { owner_id: owner })
      .then(function (dashboardStats) {
        if (
          dashboardStats &&
          dashboardStats.ok &&
          window.CreatorDashboardData &&
          typeof window.CreatorDashboardData.applyDashboardStats === 'function'
        ) {
          window.CreatorDashboardData.applyDashboardStats(dashboardStats);
        }
      })
      .catch(function (err) {
        console.warn('[CreatorDesktop] dashboard-stats error', err);
      });

    apiGet('get-level', { owner_id: owner })
      .then(function (level) {
        if (level && level.ok) {
          applyDesktopLevelFromApi(level);
        } else {
          text('creator-desktop-hero-xp-value', '—');
          text('creator-desktop-xp-value', '—');
        }
      })
      .catch(function (err) {
        console.warn('[CreatorDesktop] get-level error', err);
        text('creator-desktop-hero-xp-value', '—');
        text('creator-desktop-xp-value', '—');
      });

    apiGet('get-onboarding-progress', { owner_id: owner })
      .then(function (onboarding) {
        if (onboarding && onboarding.ok) {
          var stats = onboarding.stats || {};
          width('creator-desktop-journey-fill', stats.progress_percent || 0);
          renderDesktopJourneyOnboarding(onboarding);
        } else {
          showDesktopJourneyLoadError();
        }
      })
      .catch(function (err) {
        console.warn('[CreatorDesktop] onboarding error', err);
        showDesktopJourneyLoadError();
      });
  }

  function initDesktopContentCreationMarketing() {
    var wrap = document.getElementById('creatorDesktopContentCreation');
    if (!wrap) return;
    var currentSubTab = '';
    var currentContentTab = '';
    var panelCreation = document.getElementById('creatorDesktopMarketingPanelCreation');
    var panelPublish = document.getElementById('creatorDesktopMarketingPanelPublish');

    function bumpEazyHeaderUi() {
      if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
        window.syncCreatorMobileEazyLookLeft();
      }
    }

    function setDesktopMarketingPanelHidden(el, hidden) {
      if (!el) return;
      el.classList.toggle('creator-desktop-marketing-panel--hidden', hidden);
      if (hidden) el.setAttribute('hidden', '');
      else el.removeAttribute('hidden');
    }

    function setParentExpanded(parent, expanded) {
      wrap.querySelectorAll('.cmkt-card--parent, .creator-desktop-marketing-tab').forEach(function (btn) {
        var key = btn.dataset.mktParent || btn.dataset.subtab;
        var isThis = key === parent;
        btn.classList.toggle('is-active', !!(expanded && isThis));
        btn.setAttribute('aria-expanded', expanded && isThis ? 'true' : 'false');
      });
      wrap.querySelectorAll('[data-mkt-branch]').forEach(function (branch) {
        var show = expanded && branch.getAttribute('data-mkt-branch') === parent;
        if (show) branch.removeAttribute('hidden');
        else branch.setAttribute('hidden', '');
      });
    }

    function switchSubTab(subtab) {
      if (currentSubTab === subtab && !currentContentTab) {
        currentSubTab = '';
        currentContentTab = '';
        setParentExpanded('', false);
        setDesktopMarketingPanelHidden(panelCreation, true);
        setDesktopMarketingPanelHidden(panelPublish, true);
        wrap.setAttribute('data-marketing-subtab', '');
        bumpEazyHeaderUi();
        return;
      }
      currentSubTab = subtab;
      currentContentTab = '';
      setParentExpanded(subtab, true);
      setDesktopMarketingPanelHidden(panelCreation, true);
      setDesktopMarketingPanelHidden(panelPublish, true);
      wrap.querySelectorAll('.cmkt-card--child').forEach(function (btn) {
        btn.classList.remove('is-active');
      });
      wrap.setAttribute('data-marketing-subtab', subtab);
      bumpEazyHeaderUi();
    }

    function switchContentTab(content) {
      if (!currentSubTab) currentSubTab = 'content-creation';
      currentContentTab = content;
      setParentExpanded(currentSubTab, true);
      wrap.querySelectorAll('.cmkt-card--child, .creator-desktop-marketing-under-tab').forEach(function (btn) {
        var forParent = btn.dataset.mktFor || currentSubTab;
        var child = btn.dataset.mktChild || btn.dataset.content;
        btn.classList.toggle('is-active', forParent === currentSubTab && child === content);
      });

      if (currentSubTab === 'content-creation' && content === 'hero-images') {
        setDesktopMarketingPanelHidden(panelCreation, true);
        setDesktopMarketingPanelHidden(panelPublish, true);
        if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.open === 'function') {
          window.CreatorHeroImagesModal.open();
        }
        bumpEazyHeaderUi();
        return;
      }

      if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.close === 'function') {
        window.CreatorHeroImagesModal.close();
      }

      var activePanel = currentSubTab === 'content-creation' ? panelCreation : panelPublish;
      setDesktopMarketingPanelHidden(panelCreation, currentSubTab !== 'content-creation');
      setDesktopMarketingPanelHidden(panelPublish, currentSubTab !== 'content-publish');
      if (activePanel) {
        activePanel.querySelectorAll('.creator-desktop-marketing-panel-content').forEach(function (el) {
          el.classList.toggle('is-active', el.dataset.content === content);
        });
      }
      bumpEazyHeaderUi();
    }

    wrap.querySelectorAll('.cmkt-card--parent, .creator-desktop-marketing-tab').forEach(function (btn) {
      var subtab = btn.dataset.mktParent || btn.dataset.subtab;
      if (subtab) btn.addEventListener('click', function () { switchSubTab(subtab); });
    });
    wrap.querySelectorAll('.cmkt-card--child, .creator-desktop-marketing-under-tab').forEach(function (btn) {
      var content = btn.dataset.mktChild || btn.dataset.content;
      var parent = btn.dataset.mktFor;
      if (content) {
        btn.addEventListener('click', function () {
          if (parent) currentSubTab = parent;
          switchContentTab(content);
        });
      }
    });

    window.CreatorDesktopMarketing = {
      switchSubTab: switchSubTab,
      switchContentTab: switchContentTab
    };
  }

  window.CreatorDesktopLoadDashboard = function () {
    loadStats();
  };

  window.CreatorDesktopReloadBalances = function () {
    if (typeof window.reloadCreatorDashboardBalances === 'function') {
      window.reloadCreatorDashboardBalances();
      return;
    }
    loadBalances();
  };

  window.CreatorDesktopResetDashboardScroll = resetDesktopDashboardScroll;

  initDesktopShellSwitch();
  // Move shared screens into desktop hosts when wide; restore into mobile swipe when narrow
  // (DevTools dock / resize). Dashboard stays in both shells — only Generator/Creations/…
  // were relocated and previously stayed trapped in display:none desktop hosts.
  if (isDesktopCreatorViewport()) {
    mountAllDesktopSharedScreens();
  } else {
    unmountAllDesktopSharedScreens();
    restoreMobileCreationsViewModes();
  }
  bindCreatorShellViewportSync();
  mountDesktopShellModals();
  window.mountCreatorDesktopShellModals = mountDesktopShellModals;
  window.syncCreatorShellLayoutForViewport = syncCreatorShellLayoutForViewport;
  renderTimeBasedWelcome();
  initHeroParticles();
  // Design reveal animation paused per current desktop request.
  // initHeroDesignReveal();
  mountEazyForDesktop();
  initDesktopActions();
  initDesktopContainerLookAndDrag();
  initLanguageModal();
  initDesktopContentCreationMarketing();
  initDesktopJourneyTabs();
  initDesktopJourneyCreatorSettingsLinks();
  initDesktopJourneyShareReferral();
  initDesktopXpHintModal();
  loadBalances();
  if (window.CreatorDashboardData && typeof window.CreatorDashboardData.ensureTabLoaded === 'function') {
    window.CreatorDashboardData.ensureTabLoaded(
      window.CreatorDesktopShell && typeof window.CreatorDesktopShell.getActiveScreen === 'function'
        ? window.CreatorDesktopShell.getActiveScreen()
        : 'dashboard'
    );
  } else {
    loadStats();
  }
  // After first paint / late shell load: ensure Creations (etc.) sit in the visible shell.
  // Force a layout pass even if the initial mount already matched the viewport.
  setTimeout(function () {
    try {
      lastDesktopShellLayout = null;
      syncCreatorShellLayoutForViewport();
    } catch (_sync) {}
  }, 0);
  document.addEventListener('eaz:creator-redeemed', function () {
    if (window.CreatorDashboardData && typeof window.CreatorDashboardData.refreshDashboardShellData === 'function') {
      window.CreatorDashboardData.refreshDashboardShellData();
      return;
    }
    if (window.CreatorDashboardData && typeof window.CreatorDashboardData.invalidateStats === 'function') {
      window.CreatorDashboardData.invalidateStats();
    }
    loadStats();
    loadBalances();
  });
})();
