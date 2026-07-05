/**
 * Creator Area Mobile – Touch Swipe + Drawer Navigation
 * 5 Screens: Dashboard, Generator, Creations, Marketing, Automations
 */
(function () {
  'use strict';

  function creatorShellIsMobileAppVisible() {
    var el = document.querySelector('.creator-mobile-app');
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none';
  }

  function creatorShellGetSlideIndex() {
    var viewportEl = document.getElementById('creatorMobileSwipeViewport') || document.getElementById('swipeViewport');
    var sm = viewportEl && viewportEl.className.match(/\bslide-(\d+)\b/);
    return sm ? parseInt(sm[1], 10) : -1;
  }

  function creatorShellGetDesktopScreen() {
    var hero = document.getElementById('creatorDesktopHero');
    if (!hero) return '';
    return String(hero.getAttribute('data-desktop-active-screen') || '').toLowerCase();
  }

  function creatorShellElementLooksVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.closest('[hidden]')) return false;
    var st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    if (el.offsetParent === null && st.position !== 'fixed') return false;
    return true;
  }

  function creatorShellQueryVisibleHeroStartBtn() {
    var btns = document.querySelectorAll('[data-creator-hero-eazy-start]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var ctx = b.closest('.creator-hero-create-context');
      if (ctx && creatorShellElementLooksVisible(ctx)) return b;
    }
    return null;
  }

  function computeCreatorGenReady() {
    var owner =
      typeof window.__EAZ_OWNER_ID !== 'undefined' &&
      window.__EAZ_OWNER_ID !== null &&
      String(window.__EAZ_OWNER_ID).trim() !== '';
    var ta = document.getElementById('genPrompt');
    var promptOk = !!(ta && ta.value.trim().length > 0);
    var imgs = window.__creatorGenSelectedImages || [];
    return !!(owner && (promptOk || imgs.length > 0));
  }

  var COMPOSE_ROW_DRAG_KEY = 'eazy_compose_row_drag';
  var composeDragInitDone = false;

  function getEazyMascotDocked() {
    var el = document.getElementById('eazy-mascot');
    return !!(el && el.classList.contains('eazy-mascot--docked'));
  }

  function applyComposeRowDragTransform(x, y) {
    var row = document.getElementById('creatorEazyComposeRow');
    if (!row) return;
    row.style.transform = x || y ? 'translate(' + x + 'px,' + y + 'px)' : '';
  }

  function relocateCreatorEazyCluster() {
    var cluster = document.getElementById('creatorEazyCluster');
    var defaultHost = document.getElementById('creatorEazyClusterDefaultHost') || document.body;
    if (!cluster) return;
    var jobOverlay = false;
    try {
      jobOverlay =
        typeof window.__eazyGenJobOverlayActive === 'function' && window.__eazyGenJobOverlayActive();
    } catch (e) {}
    var speechEl = document.getElementById('creatorHeaderEazySpeech');
    var speechVisible = !!(speechEl && speechEl.classList.contains('is-visible'));
    var docked = getEazyMascotDocked();
    var mobileVis = creatorShellIsMobileAppVisible();
    var slideIdx = creatorShellGetSlideIndex();
    var dsk = creatorShellGetDesktopScreen();
    var target = null;
    if (!jobOverlay && speechVisible && docked) {
      if (mobileVis && slideIdx === 1) target = document.getElementById('creatorEazySpeechAnchorGen');
      else if (mobileVis && slideIdx === 3) target = document.getElementById('creatorEazySpeechAnchorMar');
      else if (!mobileVis && dsk === 'generator') target = document.getElementById('creatorEazySpeechAnchorGen');
      else if (!mobileVis && dsk === 'marketing') target = document.getElementById('creatorEazySpeechAnchorMar');
    }
    var wasDocked = docked;
    var below = !!(target && speechVisible && wasDocked);
    /* Docked mascot lives in header slot; cluster is speech-only — undock so #eazy-mascot joins cluster at bottom */
    if (wasDocked && (below || jobOverlay)) {
      try {
        if (typeof window.undockEazyMascot === 'function') {
          /* preserve DOCK_KEY + temp flag so Eazy can snap back to header when speech/job clears */
          window.undockEazyMascot(true, true);
        }
      } catch (eU) {}
    }
    if (jobOverlay) {
      cluster.classList.remove('creator-eazy-cluster--docked-speech-below');
      cluster.classList.add('creator-eazy-cluster--job-overlay');
      defaultHost.appendChild(cluster);
      cluster.classList.remove('creator-eazy-cluster--speech-after');
    } else {
      cluster.classList.remove('creator-eazy-cluster--job-overlay');
      cluster.classList.toggle('creator-eazy-cluster--docked-speech-below', below);
      if (!speechVisible) {
        cluster.classList.remove('creator-eazy-cluster--speech-after');
      }
      if (target && target.parentNode) {
        target.appendChild(cluster);
      } else {
        defaultHost.appendChild(cluster);
      }
    }
    if (!speechVisible || !below || jobOverlay) {
      try {
        localStorage.removeItem(COMPOSE_ROW_DRAG_KEY);
      } catch (e) {}
      applyComposeRowDragTransform(0, 0);
    } else {
      try {
        var raw = localStorage.getItem(COMPOSE_ROW_DRAG_KEY);
        if (raw) {
          var p = JSON.parse(raw);
          if (typeof p.x === 'number' && typeof p.y === 'number') applyComposeRowDragTransform(p.x, p.y);
          else applyComposeRowDragTransform(0, 0);
        } else applyComposeRowDragTransform(0, 0);
      } catch (e2) {
        applyComposeRowDragTransform(0, 0);
      }
    }
    try {
      if (typeof window.syncEazyClusterFacing === 'function') window.syncEazyClusterFacing();
      if (typeof window.reconcileComposeMode === 'function') window.reconcileComposeMode();
    } catch (e3) {}
    maybeRestoreEazyDockAfterCompose(speechVisible, jobOverlay);
  }

  function maybeRestoreEazyDockAfterCompose(speechVisible, jobOverlay) {
    try {
      if (speechVisible || jobOverlay) return;
      if (localStorage.getItem('eazy_compose_temp_undock') !== '1') return;
      if (localStorage.getItem('eazy_mascot_docked') !== '1') {
        localStorage.removeItem('eazy_compose_temp_undock');
        return;
      }
      var mascot = document.getElementById('eazy-mascot');
      if (!mascot || mascot.classList.contains('eazy-mascot--docked')) {
        try {
          localStorage.removeItem('eazy_compose_temp_undock');
        } catch (e4) {}
        return;
      }
      if (typeof window.dockEazyMascot === 'function') {
        window.dockEazyMascot(true);
      }
    } catch (e5) {}
  }

  try {
    window.relocateCreatorEazyCluster = relocateCreatorEazyCluster;
  } catch (e4) {}

  function initCreatorEazyComposeDrag() {
    var row = document.getElementById('creatorEazyComposeRow');
    if (!row || composeDragInitDone) return;
    composeDragInitDone = true;
    var dragging = false;
    var startX = 0;
    var startY = 0;
    var ox = 0;
    var oy = 0;
    var curX = 0;
    var curY = 0;
    function persist() {
      try {
        localStorage.setItem(COMPOSE_ROW_DRAG_KEY, JSON.stringify({ x: curX, y: curY }));
      } catch (e) {}
    }
    function onMove(clientX, clientY) {
      if (!dragging) return;
      curX = ox + (clientX - startX);
      curY = oy + (clientY - startY);
      applyComposeRowDragTransform(curX, curY);
    }
    row.addEventListener('mousedown', function (e) {
      var cluster = document.getElementById('creatorEazyCluster');
      if (!cluster || !cluster.classList.contains('creator-eazy-cluster--docked-speech-below')) return;
      if (e.target.closest('button')) return;
      dragging = true;
      try {
        var raw = localStorage.getItem(COMPOSE_ROW_DRAG_KEY);
        if (raw) {
          var p = JSON.parse(raw);
          ox = typeof p.x === 'number' ? p.x : 0;
          oy = typeof p.y === 'number' ? p.y : 0;
        } else {
          ox = 0;
          oy = 0;
        }
      } catch (e) {
        ox = 0;
        oy = 0;
      }
      curX = ox;
      curY = oy;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
      function mm(ev) {
        onMove(ev.clientX, ev.clientY);
      }
      function mu() {
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu);
        dragging = false;
        persist();
      }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
    row.addEventListener(
      'touchstart',
      function (e) {
        var cluster = document.getElementById('creatorEazyCluster');
        if (!cluster || !cluster.classList.contains('creator-eazy-cluster--docked-speech-below')) return;
        if (e.target.closest('button')) return;
        dragging = true;
        try {
          var raw = localStorage.getItem(COMPOSE_ROW_DRAG_KEY);
          if (raw) {
            var p = JSON.parse(raw);
            ox = typeof p.x === 'number' ? p.x : 0;
            oy = typeof p.y === 'number' ? p.y : 0;
          } else {
            ox = 0;
            oy = 0;
          }
        } catch (err) {
          ox = 0;
          oy = 0;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        curX = ox;
        curY = oy;
        function tm(ev) {
          if (ev.touches && ev.touches[0]) {
            ev.preventDefault();
            onMove(ev.touches[0].clientX, ev.touches[0].clientY);
          }
        }
        function te() {
          document.removeEventListener('touchmove', tm);
          document.removeEventListener('touchend', te);
          dragging = false;
          persist();
        }
        document.addEventListener('touchmove', tm, { passive: false });
        document.addEventListener('touchend', te);
      },
      { passive: true }
    );
  }

  /**
   * "Start generation" speech bubble (Design Generator + Hero). When Eazy is docked, bubble is relocated into the active screen anchor (below header, scrolls with content).
   */
  function syncCreatorHeaderEazySpeech() {
    var speechWrap = document.getElementById('creatorHeaderEazySpeech');
    var speechBtn = document.getElementById('creatorHeaderEazySpeechBtn');
    if (!speechWrap || !speechBtn) return;

    var genReady = computeCreatorGenReady();
    var sp = window.selectedHeroProducts || {};
    var heroProductsReady = !!(sp.top || sp.addition);
    var heroBtn = creatorShellQueryVisibleHeroStartBtn();

    var mobileVis = creatorShellIsMobileAppVisible();
    var slideIdx = creatorShellGetSlideIndex();
    var dsk = creatorShellGetDesktopScreen();

    var show = false;
    var disabled = true;

    if (mobileVis) {
      if (slideIdx === 1 && genReady) {
        show = true;
        disabled = false;
      } else if (slideIdx === 3 && heroProductsReady && heroBtn) {
        show = true;
        disabled = !!heroBtn.disabled;
      }
    } else {
      if (dsk === 'generator' && genReady) {
        show = true;
        disabled = false;
      } else if (dsk === 'marketing' && heroProductsReady && heroBtn) {
        show = true;
        disabled = !!heroBtn.disabled;
      }
    }

    speechWrap.classList.toggle('is-visible', show);
    speechWrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    speechBtn.disabled = disabled || !show;

    if (!speechBtn.getAttribute('data-creator-eazy-speech-bound')) {
      speechBtn.setAttribute('data-creator-eazy-speech-bound', '1');
      speechBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var mv = creatorShellIsMobileAppVisible();
        var si = creatorShellGetSlideIndex();
        var dk = creatorShellGetDesktopScreen();
        if (mv && si === 1) {
          if (window.CreatorGenerator && typeof window.CreatorGenerator.triggerGenerate === 'function') {
            window.CreatorGenerator.triggerGenerate();
          }
          return;
        }
        if (mv && si === 3) {
          var hb = creatorShellQueryVisibleHeroStartBtn();
          if (hb && !hb.disabled) hb.click();
          return;
        }
        if (!mv && dk === 'generator') {
          if (window.CreatorGenerator && typeof window.CreatorGenerator.triggerGenerate === 'function') {
            window.CreatorGenerator.triggerGenerate();
          }
          return;
        }
        if (!mv && dk === 'marketing') {
          var hb2 = creatorShellQueryVisibleHeroStartBtn();
          if (hb2 && !hb2.disabled) hb2.click();
        }
      });
    }
    relocateCreatorEazyCluster();
    initCreatorEazyComposeDrag();
  }
  window.syncCreatorHeaderEazySpeech = syncCreatorHeaderEazySpeech;

  /**
   * Single #eazy-mascot: face toward hero/generator speech bubbles (not duplicate footer mascots).
   * Generator: slide-1 + owner + (prompt or refs). Hero: slide-3 + product(s), or desktop/legacy ready hero footer.
   */
  function syncCreatorMobileEazyLookLeft() {
    var mascot = document.getElementById('eazy-mascot');
    if (!mascot) return;
    var inner = mascot.querySelector('.eazy-mascot__inner');
    if (!inner) return;
    var slideIdx = creatorShellGetSlideIndex();
    var mobileVis = creatorShellIsMobileAppVisible();
    var dsk = creatorShellGetDesktopScreen();

    var owner =
      typeof window.__EAZ_OWNER_ID !== 'undefined' &&
      window.__EAZ_OWNER_ID !== null &&
      String(window.__EAZ_OWNER_ID).trim() !== '';

    var ta = document.getElementById('genPrompt');
    var promptOk = !!(ta && ta.value.trim().length > 0);
    var imgs = window.__creatorGenSelectedImages || [];
    var hasGenInput = promptOk || imgs.length > 0;

    var genLook = false;
    if (mobileVis && slideIdx === 1 && owner && hasGenInput) {
      genLook = true;
    } else if (!mobileVis && dsk === 'generator' && owner && hasGenInput) {
      genLook = true;
    }

    var sp = window.selectedHeroProducts || {};
    var hasHeroProducts = !!(sp.top || sp.addition);

    var heroLook = false;
    if (mobileVis && slideIdx === 3 && hasHeroProducts) {
      heroLook = true;
    } else if (!mobileVis && dsk === 'marketing' && hasHeroProducts) {
      var hb = creatorShellQueryVisibleHeroStartBtn();
      heroLook = !!(hb && !hb.disabled);
    } else if (slideIdx < 0 && !mobileVis && hasHeroProducts) {
      var footers = document.querySelectorAll('.creator-hero-eazy-footer.creator-hero-eazy-footer--ready');
      for (var fi = 0; fi < footers.length; fi++) {
        if (footers[fi].id === 'creatorGenEazyFooter') continue;
        heroLook = true;
        break;
      }
    }

    syncCreatorHeaderEazySpeech();

    var speechWrap = document.getElementById('creatorHeaderEazySpeech');
    var speechVisible = !!(speechWrap && speechWrap.classList.contains('is-visible'));
    try {
      if (typeof window.setEazyComposeUiActive === 'function') {
        window.setEazyComposeUiActive(speechVisible);
      }
    } catch (e) {}

    if (speechVisible) {
      if (mascot.classList.contains('eazy-mascot--docked')) {
        inner.classList.remove('eazy-mascot__inner--look-left');
      } else if (typeof window.syncEazyClusterFacing === 'function') {
        window.syncEazyClusterFacing();
      }
    } else {
      var cluster = document.getElementById('creatorEazyCluster');
      if (cluster) cluster.classList.remove('creator-eazy-cluster--speech-after');
      if (mascot.classList.contains('eazy-mascot--docked')) {
        inner.classList.toggle('eazy-mascot__inner--look-left', !!(genLook || heroLook));
      } else {
        var target = cluster || mascot;
        var cr = target.getBoundingClientRect();
        if (cr.width >= 4 && cr.height >= 4) {
          var cx = cr.left + cr.width / 2;
          inner.classList.toggle('eazy-mascot__inner--look-left', cx >= window.innerWidth * 0.5);
        }
      }
    }
  }
  window.syncCreatorMobileEazyLookLeft = syncCreatorMobileEazyLookLeft;

  const viewport = document.getElementById('creatorMobileSwipeViewport') || document.getElementById('swipeViewport');
  const track = viewport?.querySelector('.creator-swipe-track');
  const dots = document.querySelectorAll('.creator-dot');
  const headerTitle = document.querySelector('.creator-header__title');
  const drawerBtn = document.getElementById('creatorMobileDrawerBtn') || document.getElementById('drawerBtn');
  const drawer = document.getElementById('creatorMobileDrawer') || document.getElementById('drawer');
  const drawerBackdrop = document.getElementById('creatorMobileDrawerBackdrop') || document.getElementById('drawerBackdrop');
  const drawerClose = document.getElementById('creatorMobileDrawerClose') || document.getElementById('drawerClose');
  const drawerItems = document.querySelectorAll('.creator-drawer__item');

  const SCREEN_LABELS = (typeof window.CreatorMobileI18n !== 'undefined' && window.CreatorMobileI18n.screenLabels)
    ? window.CreatorMobileI18n.screenLabels
    : ['Dashboard', 'Generator', 'Designs', 'Marketing', 'Automations'];
  const TOTAL = 5;
  const CREATOR_SHELL_HASH_SCREENS = ['dashboard', 'generator', 'creations', 'marketing', 'automations'];

  function creatorShellPathSupportsDashboardTabHash() {
    try {
      var p = window.location.pathname || '';
      return p.indexOf('/') !== -1 || p.indexOf('/pages/creator-overview') !== -1 || window.__CREATOR_PORTAL_HOST__ === true;
    } catch (_e) {
      return false;
    }
  }

  function parseCreatorShellHashSlide() {
    if (!creatorShellPathSupportsDashboardTabHash()) return null;
    try {
      if (window.__CREATOR_PORTAL_HOST__) {
        var path = (window.location.pathname || '').replace(/\/$/, '') || '/';
        var pathMap = {
          '/': 0,
          '/dashboard': 0,
          '/generator': 1,
          '/creations': 2,
          '/marketing': 3,
          '/automations': 4
        };
        if (pathMap[path] !== undefined) return pathMap[path];
      }
      var raw = (window.location.hash || '').replace(/^#/, '').toLowerCase().trim();
      if (!raw) return null;
      if (raw === 'settings') return null;
      if (raw === 'promotions') return 3;
      var i = CREATOR_SHELL_HASH_SCREENS.indexOf(raw);
      return i >= 0 ? i : null;
    } catch (_e2) {
      return null;
    }
  }

  function replaceCreatorShellHashForIndex(index) {
    if (!creatorShellPathSupportsDashboardTabHash()) return;
    var name = CREATOR_SHELL_HASH_SCREENS[index];
    if (!name) return;
    try {
      var cur = (window.location.hash || '').replace(/^#/, '').toLowerCase();
      if (!window.__CREATOR_PORTAL_HOST__) {
        if (name === 'dashboard' && !cur) return;
        if (cur === name) return;
        if (index === 3 && name === 'marketing' && cur === 'promotions') return;
        var legacyUrl = new URL(window.location.href);
        legacyUrl.hash = name;
        window.history.replaceState(window.history.state, '', legacyUrl.pathname + legacyUrl.search + legacyUrl.hash);
        return;
      }
      var path = name === 'dashboard' ? '/dashboard' : '/' + name;
      var currentPath = (window.location.pathname || '').replace(/\/$/, '') || '/';
      if (currentPath === path) return;
      var u = new URL(window.location.href);
      u.pathname = path;
      u.hash = '';
      window.history.replaceState(window.history.state, '', u.pathname + u.search);
    } catch (_e3) {}
  }

  let currentIndex = 0;
  let touchStartX = 0;
  let touchEndX = 0;
  const MIN_SWIPE = 50;
  const LOGIN_URL = '/account/login?redirect=' + encodeURIComponent('/');

  function buildCreatorGuestLockOverlay() {
    var title = (window.CreatorMobileI18n && window.CreatorMobileI18n.generatorLockedTitle) || 'Log in to chat';
    var textBody = (window.CreatorMobileI18n && window.CreatorMobileI18n.generatorLockedText) || 'Sign in to use this feature.';
    var cta = (window.CreatorMobileI18n && window.CreatorMobileI18n.generatorLoginCta) || 'Log in';
    var wrap = document.createElement('div');
    wrap.className = 'creator-generator-lock creator-guest-nav-lock';
    wrap.innerHTML =
      '<div class="creator-generator-lock__card">' +
      '<h3 class="creator-generator-lock__title">' +
      title +
      '</h3>' +
      '<p class="creator-generator-lock__text">' +
      textBody +
      '</p>' +
      '<a class="creator-generator-lock__cta" href="' +
      LOGIN_URL +
      '">' +
      cta +
      '</a>' +
      '</div>';
    return wrap;
  }

  window.buildCreatorGuestLockOverlay = buildCreatorGuestLockOverlay;

  function removeMobileGuestNavLocks() {
    document.querySelectorAll('.creator-screen .creator-generator-lock.creator-guest-nav-lock').forEach(function (el) {
      el.remove();
    });
  }

  /** Login gate on Generator stays in #creatorGenerator; screens 2–4 use panel-level overlay. Dashboard (0) stays open. */
  function syncCreatorGuestNavLocksMobile() {
    removeMobileGuestNavLocks();
    if (!viewport || !track) return;
    var guestStrict = window.__CREATOR_IS_LOGGED_IN === false && !window.__DEV_BYPASS;
    if (!guestStrict) return;
    if (currentIndex === 0 || currentIndex === 1) return;
    var section = document.querySelector('.creator-screen[data-screen="' + currentIndex + '"]');
    if (!section) return;
    section.appendChild(buildCreatorGuestLockOverlay());
  }

  window.syncCreatorGuestNavLocksMobile = syncCreatorGuestNavLocksMobile;

  function refreshCreatorGuestLocksAfterBypass() {
    if (typeof window.syncCreatorGuestNavLocksMobile === 'function') window.syncCreatorGuestNavLocksMobile();
    try {
      if (
        typeof window.syncCreatorGuestDesktopLock === 'function' &&
        window.CreatorDesktopShell &&
        typeof window.CreatorDesktopShell.getActiveScreen === 'function'
      ) {
        window.syncCreatorGuestDesktopLock(window.CreatorDesktopShell.getActiveScreen());
      }
    } catch (_e) {}
  }

  function readDevBypassTokenFromUrl() {
    try {
      var url = new URL(window.location.href);
      return (url.searchParams.get('dev_bypass') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function removeDevBypassFromUrl() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('dev_bypass')) return;
      url.searchParams.delete('dev_bypass');
      window.history.replaceState({}, '', url.toString());
    } catch (_e) {}
  }

  function getStoredDevBypassToken() {
    try {
      return (window.sessionStorage.getItem('creator.dev_bypass_token') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function setStoredDevBypassToken(token) {
    try {
      if (!token) {
        window.sessionStorage.removeItem('creator.dev_bypass_token');
      } else {
        window.sessionStorage.setItem('creator.dev_bypass_token', token);
      }
    } catch (_e) {}
  }

  function getDevBypassToken() {
    var fromUrl = readDevBypassTokenFromUrl();
    if (fromUrl) {
      setStoredDevBypassToken(fromUrl);
      return fromUrl;
    }
    return getStoredDevBypassToken();
  }

  function getShopDomainForBypass() {
    var shop = '';
    if (window.Shopify && window.Shopify.shop) {
      shop = String(window.Shopify.shop || '').trim();
    }
    if (!shop && window.__SHOPIFY_SHOP_DOMAIN) {
      shop = String(window.__SHOPIFY_SHOP_DOMAIN || '').trim();
    }
    if (!shop) return '';
    return shop.toLowerCase();
  }

  function ensureGeneratorLockUi() {
    var generator = document.getElementById('creatorGenerator');
    if (!generator) return;
    if (generator.querySelector('.creator-generator-lock')) return;

    var title = (window.CreatorMobileI18n && window.CreatorMobileI18n.generatorLockedTitle) || 'Log in to continue';
    var text = (window.CreatorMobileI18n && window.CreatorMobileI18n.generatorLockedText) || 'Sign in to use this feature.';
    var cta = (window.CreatorMobileI18n && window.CreatorMobileI18n.generatorLoginCta) || 'Login';

    var lock = document.createElement('div');
    lock.className = 'creator-generator-lock';
    lock.innerHTML =
      '<div class="creator-generator-lock__card">' +
      '<h3 class="creator-generator-lock__title">' + title + '</h3>' +
      '<p class="creator-generator-lock__text">' + text + '</p>' +
      '<a class="creator-generator-lock__cta" href="' + LOGIN_URL + '">' + cta + '</a>' +
      '</div>';
    generator.appendChild(lock);
  }

  function setGeneratorLocked(locked) {
    var generator = document.getElementById('creatorGenerator');
    if (!generator) return;
    generator.classList.toggle('creator-generator--locked', !!locked);
    window.__GENERATOR_LOCKED = !!locked;
    if (locked) {
      ensureGeneratorLockUi();
    }
  }

  async function verifyDevBypass() {
    try {
      var isLoggedIn = Boolean(window.__CREATOR_IS_LOGGED_IN);
      if (isLoggedIn) {
        window.__DEV_BYPASS = false;
        setGeneratorLocked(false);
        return;
      }

      var token = getDevBypassToken();
      if (!token) {
        window.__DEV_BYPASS = false;
        setGeneratorLocked(true);
        return;
      }

      try {
        var verifyUrl =
          '/apps/creator-dispatch?path_prefix=/apps/creator-dispatch&op=verify-dev-bypass&token=' + encodeURIComponent(token);
        var shopDomain = getShopDomainForBypass();
        if (shopDomain) {
          verifyUrl += '&shop=' + encodeURIComponent(shopDomain);
        }
        var res = await fetch(verifyUrl, { method: 'GET', credentials: 'same-origin' });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || !data || data.ok !== true || data.bypass !== true) {
          window.__DEV_BYPASS = false;
          setStoredDevBypassToken('');
          setGeneratorLocked(true);
          return;
        }
        window.__DEV_BYPASS = true;
        if (data.owner_id) {
          window.__EAZ_OWNER_ID = String(data.owner_id);
        }
        setGeneratorLocked(false);
      } catch (_e) {
        window.__DEV_BYPASS = false;
        setGeneratorLocked(true);
      }
    } finally {
      refreshCreatorGuestLocksAfterBypass();
    }
  }

  if (!viewport || !track) return;

  verifyDevBypass();

  function goTo(index) {
    index = Math.max(0, Math.min(index, TOTAL - 1));
    currentIndex = index;
    viewport.className = 'creator-swipe-viewport slide-' + index;

    dots.forEach((dot, i) => {
      dot.classList.toggle('creator-dot--active', i === index);
    });

    if (headerTitle) {
      if (index === 2 && window.CreationsScreen && typeof window.CreationsScreen.getCurrentTab === 'function') {
        headerTitle.textContent = window.CreationsScreen.getCurrentTab() === 'products' ? (window.CreatorMobileI18n?.products || 'Products') : (window.CreatorMobileI18n?.designs || 'Designs');
      } else if (index === 3 && window.MarketingScreen && typeof window.MarketingScreen.getHeaderTitle === 'function') {
        headerTitle.textContent = window.MarketingScreen.getHeaderTitle();
      } else if (index === 4 && window.AutomationsScreen && typeof window.AutomationsScreen.getHeaderTitle === 'function') {
        headerTitle.textContent = window.AutomationsScreen.getHeaderTitle();
      } else {
        headerTitle.textContent = SCREEN_LABELS[index] || SCREEN_LABELS[0];
      }
    }

    drawerItems.forEach((item, i) => {
      item.classList.toggle('creator-drawer__item--active', i === index);
    });

    if (typeof window.refreshCreatorGenEazyUi === 'function') {
      window.refreshCreatorGenEazyUi();
    }
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }

    if (
      index === 4 &&
      window.AutomationsScreen &&
      typeof window.AutomationsScreen.refreshList === 'function'
    ) {
      setTimeout(function () {
        window.AutomationsScreen.refreshList();
      }, 0);
    }

    if (index === 3) {
      setTimeout(function () {
        if (window.ContentCreationHero && typeof window.ContentCreationHero.maybeScheduleAutoPick === 'function') {
          window.ContentCreationHero.maybeScheduleAutoPick();
        } else if (typeof window.eazMaybeScheduleHeroMarketingAutoPick === 'function') {
          window.eazMaybeScheduleHeroMarketingAutoPick();
        }
      }, 80);
    }

    replaceCreatorShellHashForIndex(index);
    if (typeof window.syncCreatorGuestNavLocksMobile === 'function') window.syncCreatorGuestNavLocksMobile();

    var shellTab = CREATOR_SHELL_HASH_SCREENS[index];
    if (window.CreatorDashboardData && typeof window.CreatorDashboardData.ensureTabLoaded === 'function') {
      window.CreatorDashboardData.ensureTabLoaded(shellTab);
    }

    try {
      document.dispatchEvent(new CustomEvent('creator:shell-screen-change', { detail: { index: index, screen: shellTab } }));
    } catch (_screenEv) {}
  }

  window.__creatorGoTo = goTo;

  function applyCreatorDashboardDeepLinkFromQuery() {
    if (!creatorShellPathSupportsDashboardTabHash()) return;
    try {
      var sp = new URLSearchParams(window.location.search || '');
      var creationsTab = (sp.get('eaz_creations_tab') || '').toLowerCase();
      if (creationsTab && window.CreationsScreen && window.CreationsScreen.switchTab) {
        window.CreationsScreen.switchTab(creationsTab);
      }
      var mSub = sp.get('eaz_marketing_subtab');
      var mContent = sp.get('eaz_marketing_content');
      if (mSub && window.MarketingScreen && window.MarketingScreen.switchSubTab) {
        window.MarketingScreen.switchSubTab(mSub);
        if (mContent && window.MarketingScreen.switchContentTab) {
          window.MarketingScreen.switchContentTab(mContent);
        }
        if (mSub === 'content-publish' && window.HeroImagesScreen && window.HeroImagesScreen.loadHeroImages) {
          window.HeroImagesScreen.loadHeroImages();
        }
      }
      var autoTab = sp.get('eaz_automations_maintab');
      if (autoTab && window.AutomationsScreen && window.AutomationsScreen.switchMainTab) {
        window.AutomationsScreen.switchMainTab(autoTab);
      }
      if (
        sp.has('eaz_creations_tab') ||
        sp.has('eaz_marketing_subtab') ||
        sp.has('eaz_marketing_content') ||
        sp.has('eaz_automations_maintab')
      ) {
        sp.delete('eaz_creations_tab');
        sp.delete('eaz_marketing_subtab');
        sp.delete('eaz_marketing_content');
        sp.delete('eaz_automations_maintab');
        var u = new URL(window.location.href);
        u.search = sp.toString() ? '?' + sp.toString() : '';
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
      }
    } catch (_dl) {}
  }

  (function syncInitialSlideFromDom() {
    var raw = viewport && viewport.getAttribute('data-initial-slide');
    var n = raw != null && raw !== '' ? parseInt(raw, 10) : 0;
    if (!Number.isFinite(n) || n < 0 || n >= TOTAL) n = 0;
    var fromHash = parseCreatorShellHashSlide();
    if (fromHash !== null) n = fromHash;
    goTo(n);
    setTimeout(applyCreatorDashboardDeepLinkFromQuery, 0);
  })();

  window.addEventListener('hashchange', function () {
    if (window.__CREATOR_PORTAL_HOST__) return;
    var idx = parseCreatorShellHashSlide();
    if (idx !== null && idx !== currentIndex) {
      goTo(idx);
    }
  });

  window.addEventListener('popstate', function () {
    if (!window.__CREATOR_PORTAL_HOST__) return;
    var idx = parseCreatorShellHashSlide();
    if (idx !== null && idx !== currentIndex) {
      goTo(idx);
    }
  });

  function openDrawer() {
    drawer?.classList.add('is-open');
    drawerBackdrop?.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer?.classList.remove('is-open');
    drawerBackdrop?.classList.remove('is-visible');
    document.body.style.overflow = '';
  }

  // Touch Events
  viewport.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  viewport.addEventListener('touchend', function (e) {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) >= MIN_SWIPE) {
      if (diff > 0) {
        goTo(currentIndex + 1);
      } else {
        goTo(currentIndex - 1);
      }
    }
  }, { passive: true });

  // Dot Click
  dots.forEach((dot, i) => {
    dot.addEventListener('click', function () {
      goTo(i);
    });
  });

  // Drawer: Open
  drawerBtn?.addEventListener('click', openDrawer);

  // Drawer: Close
  drawerClose?.addEventListener('click', closeDrawer);
  drawerBackdrop?.addEventListener('click', closeDrawer);

  // Drawer: Nav Item Click
  drawerItems.forEach((item, i) => {
    item.addEventListener('click', function () {
      goTo(i);
      closeDrawer();
    });
  });

  // Quick Actions: internal nav (data-goto, data-creations-tab, data-marketing-*)
  document.querySelectorAll('.creator-quick-action[data-goto]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var idx = parseInt(el.getAttribute('data-goto'), 10);
      if (!isNaN(idx)) goTo(idx);
      if (el.dataset.creationsTab && window.CreationsScreen && window.CreationsScreen.switchTab) {
        window.CreationsScreen.switchTab(el.dataset.creationsTab);
      }
      if (el.dataset.marketingSubtab && window.MarketingScreen) {
        if (window.MarketingScreen.switchSubTab) window.MarketingScreen.switchSubTab(el.dataset.marketingSubtab);
        if (el.dataset.marketingContent && window.MarketingScreen.switchContentTab) window.MarketingScreen.switchContentTab(el.dataset.marketingContent);
        if (el.dataset.marketingSubtab === 'content-publish' && window.HeroImagesScreen && window.HeroImagesScreen.loadHeroImages) window.HeroImagesScreen.loadHeroImages();
      }
      if (el.dataset.automationsMaintab && window.AutomationsScreen && window.AutomationsScreen.switchMainTab) {
        window.AutomationsScreen.switchMainTab(el.dataset.automationsMaintab);
      }
    });
  });

  // Drawer: Swipe to close (optional)
  drawer?.addEventListener('touchstart', function (e) {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });
  drawer?.addEventListener('touchend', function (e) {
    const touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > MIN_SWIPE) closeDrawer();
  }, { passive: true });

  // EAZ display: click when loading to retry balance
  if (typeof window.loadCreatorBalance === 'function') {
    var initBalanceEl = document.getElementById('global-eaz-balance-value');
    var initBalanceText = initBalanceEl ? (initBalanceEl.textContent || '').trim() : '';
    if (initBalanceEl && ['Lädt...', 'Lade EAZ', 'Lade...', 'Loading...', '—', ''].indexOf(initBalanceText) >= 0) {
      setTimeout(function () { window.loadCreatorBalance(); }, 120);
    }
  }

  // Footer: EAZ balance → Creator Settings (EAZ tab); other balance chips → sales modal
  function openFooterEazInCreatorSettings(fromEl) {
    try {
      if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
        ensureSettingsOverlayMount();
        var sub = 'balance';
        var wrap = fromEl && fromEl.closest ? fromEl.closest('.creator-global-footer__balance--eaz') : null;
        if (!wrap) wrap = document.querySelector('.creator-global-footer__balance--eaz');
        if (wrap && wrap.getAttribute('data-footer-eaz-mode') === 'starter') sub = 'starter';
        window.CreatorSettingsV2Modal.open({ tab: 'eaz', eazSub: sub });
        return true;
      }
    } catch (_e) {}
    return false;
  }

  document.addEventListener('click', function (e) {
    var bal = e.target.closest('.creator-global-footer__balance');
    if (!bal) return;
    if (bal.classList.contains('creator-global-footer__balance--eaz')) {
      if (openFooterEazInCreatorSettings(bal)) {
        return;
      }
    }
    if (typeof window.openSalesModal === 'function') {
      window.openSalesModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var bal = e.target.closest('.creator-global-footer__balance--eaz');
    if (!bal) return;
    e.preventDefault();
    openFooterEazInCreatorSettings(bal);
  });

  // Footer language modal
  (function initFooterLanguageModal() {
    var langBtn = document.getElementById('creatorFooterLangBtn');
    var langModal = document.getElementById('creatorFooterLangModal');
    var langClose = document.getElementById('creatorFooterLangClose');
    var langSearch = document.getElementById('creatorFooterLangSearch');
    var langList = document.getElementById('creatorFooterLangList');
    var langEmpty = document.getElementById('creatorFooterLangEmpty');
    var langInput = document.getElementById('creatorFooterLangInput');
    var countryFlagMapEl = document.getElementById('creatorFooterCountryFlagMap');
    if (!langBtn || !langModal || !langList || !langInput) return;
    var countryFlagMap = {};
    try { countryFlagMap = JSON.parse(countryFlagMapEl ? countryFlagMapEl.textContent : '{}'); } catch (_e) {}

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
      return 'en';
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
      try {
        var _rm = [];
        for (var _i = 0; _i < localStorage.length; _i++) {
          var _k = localStorage.key(_i);
          if (_k && _k.indexOf('eaz_lang_cache_v') === 0) _rm.push(_k);
        }
        for (var _j = 0; _j < _rm.length; _j++) localStorage.removeItem(_rm[_j]);
      } catch (_e) {}
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

    var LANG_TO_COUNTRY = {
      de: 'DE', en: 'GB', fr: 'FR', es: 'ES', it: 'IT', pt: 'PT', nl: 'NL', pl: 'PL',
      cs: 'CZ', da: 'DK', sv: 'SE', nb: 'NO', nn: 'NO', no: 'NO', fi: 'FI', hu: 'HU', ro: 'RO',
      bg: 'BG', hr: 'HR', sk: 'SK', sl: 'SI', et: 'EE', lv: 'LV', lt: 'LT', el: 'GR',
      ru: 'RU', uk: 'UA', tr: 'TR', ar: 'SA', he: 'IL', ja: 'JP', ko: 'KR',
      zh: 'CN', 'zh-CN': 'CN', 'zh-TW': 'TW', 'zh-Hans': 'CN', 'zh-Hant': 'TW',
      'pt-BR': 'BR', 'pt-PT': 'PT', 'en-US': 'US', 'en-GB': 'GB', 'en-AU': 'AU',
      af: 'ZA', sq: 'AL', hy: 'AM', az: 'AZ', be: 'BY', bs: 'BA', ca: 'ES', eu: 'ES', gl: 'ES',
      fa: 'IR', bn: 'BD', hi: 'IN',
      'zh-Latn': 'CN', 'sr-Latn': 'RS', 'sr-Cyrl': 'RS', 'ja-Romaji': 'JP', 'ko-Romaji': 'KR',
      'ar-Latn': 'SA', 'ru-Latn': 'RU', 'hi-Latn': 'IN',
      ga: 'IE', is: 'IS', id: 'ID', kk: 'KZ', ka: 'GE', mk: 'MK', ms: 'MY',
      mt: 'MT', mn: 'MN', ne: 'NP', sr: 'RS', sw: 'KE', ta: 'IN', te: 'IN', th: 'TH',
      vi: 'VN', cy: 'GB', lb: 'LU', fil: 'PH', km: 'KH', lo: 'LA', my: 'MM', si: 'LK',
      am: 'ET', an: 'ES', as: 'IN', ur: 'PK', uz: 'UZ', tg: 'TJ', tk: 'TM', ky: 'KG',
      ps: 'AF', pa: 'IN', gu: 'IN', mr: 'IN', ml: 'IN', kn: 'IN', or: 'IN',
      yo: 'NG', ig: 'NG', ha: 'NG', zu: 'ZA', xh: 'ZA', st: 'ZA', tn: 'BW',
      nso: 'ZA', rw: 'RW', rn: 'BI', so: 'SO', om: 'ET', ti: 'ER', ak: 'GH',
      ee: 'GH', tw: 'GH', mg: 'MG', ny: 'MW', sn: 'ZW', sd: 'PK', jv: 'ID', su: 'ID',
      ceb: 'PH', ilo: 'PH', mi: 'NZ', sm: 'WS', to: 'TO', fj: 'FJ', haw: 'US',
      eo: 'EU', ia: 'EU', gv: 'IM', co: 'FR', fy: 'NL', sc: 'IT', vec: 'IT',
      qu: 'PE', ay: 'BO', gn: 'PY'
    };
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

    function normalizeSearchText(value) {
      return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    }

    function formatCode(code) {
      return normalizeCode(code).toUpperCase();
    }

    function formatMainLanguageCode(code) {
      return getLocaleGroupBase(code) === 'no' ? 'NO' : formatCode(code);
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
      var panelId = 'creatorMobileLangDebugPanel';
      var panel = document.getElementById(panelId);
      if (!panel) {
        panel = document.createElement('div');
        panel.id = panelId;
        panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;max-width:340px;max-height:42vh;overflow:auto;padding:8px 10px;border-radius:10px;background:rgba(5,9,24,.9);border:1px solid rgba(255,255,255,.18);color:#dbe5ff;font:11px/1.35 system-ui,sans-serif;backdrop-filter:blur(8px);';
        document.body.appendChild(panel);
      }
      var rows = [];
      langList.querySelectorAll('.creator-footer-lang-modal__item').forEach(function (item) {
        var code = normalizeCode(item.dataset.langCode);
        var cc = resolveCountryCode(code);
        var viaMap = !!(cc && (countryFlagMap[String(cc).toUpperCase()] || countryFlagMap[String(cc).toLowerCase()]));
        rows.push('<div><strong>' + code + '</strong> -> ' + (cc || 'none') + ' | ' + (cc ? (viaMap ? 'shopify-map' : 'flagcdn') : 'emoji') + '</div>');
      });
      panel.innerHTML = '<div style="font-weight:700;margin-bottom:6px">Creator Mobile Lang Debug</div><div style="opacity:.8;margin-bottom:6px">active=' + normalizeLocaleForMatch(langInput && langInput.value ? langInput.value : '') + '</div>' + rows.join('');
    }

    function formatTitleCaseIfLatin(text) {
      var value = String(text || '').trim();
      if (!value) return value;
      if (!/[A-Za-z]/.test(value)) return value;
      return value
        .split(/\s+/)
        .map(function(part) {
          if (!part) return part;
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
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
      var current = normalizeLocaleForMatch(getPreferredLocaleCode() || (langInput && langInput.value ? langInput.value : getCurrentUiLocale()));

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
        var plusBtn = variants.length ? '<span class="creator-footer-lang-plus" role="button" tabindex="0" data-base-code="' + group.base + '" aria-label="Dialects and scripts">+</span>' : '';
        return '' +
          '<div class="creator-footer-lang-row" data-base-code="' + group.base + '" data-lang-search="' + searchText + '">' +
            '<button class="creator-footer-lang-modal__item' + activeClass + '" type="button" data-lang-code="' + code + '" data-lang-name="' + name + '" data-base-code="' + group.base + '" data-variants="' + variants.join(',') + '">' +
              '<span class="creator-footer-lang-modal__item-left">' +
                '<span class="creator-footer-lang-modal__item-flag" data-lang-flag>🌐</span>' +
                '<span class="creator-footer-lang-modal__item-name" data-lang-label>' + name + '</span>' +
              '</span>' +
              '<span class="creator-footer-lang-modal__item-right"><span class="creator-footer-lang-modal__item-code" data-lang-code-label translate="no">' + formatMainLanguageCode(code) + '</span>' + plusBtn + '</span>' +
            '</button>' +
          '</div>';
      }).join('');
      html += '<div class="creator-footer-lang-modal__empty" id="creatorFooterLangEmpty" hidden>No languages found</div>';
      langList.innerHTML = html;
      langEmpty = document.getElementById('creatorFooterLangEmpty');
    }

    function applyFooterLanguageLabels() {
      var activeCode = normalizeLocaleForMatch(langInput && langInput.value ? langInput.value : getCurrentUiLocale());
      var locale = getCurrentUiLocale();
      langList.querySelectorAll('.creator-footer-lang-modal__item').forEach(function(item) {
        var code = normalizeCode(item.dataset.langCode);
        var nameEl = item.querySelector('[data-lang-label]');
        var codeEl = item.querySelector('[data-lang-code-label]');
        var flagEl = item.querySelector('[data-lang-flag]');
        var normalizedCode = normalizeLocaleForMatch(code);
        var fallbackName = String(item.dataset.langName || '').trim();
        var baseCode = String(item.getAttribute('data-base-code') || '');
        var localizedName = getMainLanguageLabel(baseCode || code, locale);
        var resolvedName = localizedName || formatTitleCaseIfLatin(fallbackName) || getMainLanguageLabel(baseCode || code, locale);
        var countryCode = resolveCountryCode(code);
        var isActive = !!activeCode && (normalizedCode === activeCode || getLocaleGroupBase(normalizedCode) === getLocaleGroupBase(activeCode));
        item.classList.toggle('is-active', isActive);
        var row = item.closest('.creator-footer-lang-row');
        if (row) {
          var baseCode = String(item.getAttribute('data-base-code') || '');
          row.dataset.langSearch = [resolvedName, fallbackName, baseCode].join(' ');
        }
        if (nameEl) {
          nameEl.textContent = resolvedName;
        }
        if (codeEl) {
          codeEl.textContent = formatMainLanguageCode(code);
        }
        if (flagEl) {
          if (countryCode) {
            var flagUrl = getFlagUrl(countryCode);
            if (!flagUrl) {
              flagEl.classList.add('creator-footer-lang-modal__item-flag--emoji');
              flagEl.style.backgroundImage = '';
              flagEl.textContent = countryCodeToFlagEmoji(countryCode);
            } else {
              flagEl.classList.remove('creator-footer-lang-modal__item-flag--emoji');
              flagEl.style.backgroundImage = flagUrl ? ('url(' + flagUrl + ')') : '';
              flagEl.textContent = '';
            }
          } else {
            flagEl.classList.add('creator-footer-lang-modal__item-flag--emoji');
            flagEl.style.backgroundImage = '';
            flagEl.textContent = countryCodeToFlagEmoji(countryCode);
          }
        }
        item.dataset.langSearch = [resolvedName, fallbackName, getLocaleGroupBase(code)].join(' ');
      });
      var footerFlagEl = document.getElementById('creatorFooterLangFlag');
      if (footerFlagEl && langInput && langInput.value) {
        var activeCountryCode = resolveCountryCode(langInput.value);
        if (activeCountryCode) {
          var activeFlagUrl = getFlagUrl(activeCountryCode);
          if (!activeFlagUrl) {
            footerFlagEl.classList.add('creator-footer-lang-modal__item-flag--emoji');
            footerFlagEl.style.backgroundImage = '';
            footerFlagEl.textContent = countryCodeToFlagEmoji(activeCountryCode);
          } else {
            footerFlagEl.classList.remove('creator-footer-lang-modal__item-flag--emoji');
            footerFlagEl.style.backgroundImage = activeFlagUrl ? ('url(' + activeFlagUrl + ')') : '';
            footerFlagEl.textContent = '';
          }
        } else {
          footerFlagEl.classList.add('creator-footer-lang-modal__item-flag--emoji');
          footerFlagEl.style.backgroundImage = '';
          footerFlagEl.textContent = countryCodeToFlagEmoji(activeCountryCode);
        }
      }
      renderLangDebugPanel();
    }

    function syncInputWithCurrentLocale() {
      var current = normalizeLocaleForMatch(getPreferredLocaleCode() || getCurrentUiLocale());
      if (!current || !langInput) return;
      var items = langList.querySelectorAll('.creator-footer-lang-modal__item');
      var exact = '';
      var base = getLocaleGroupBase(current);
      var baseMatch = '';
      Array.prototype.forEach.call(items, function (item) {
        var code = normalizeLocaleForMatch(item.dataset.langCode);
        if (!exact && code === current) exact = item.dataset.langCode || '';
        if (!baseMatch && getLocaleGroupBase(code) === base) baseMatch = item.dataset.langCode || '';
      });
      if (exact) langInput.value = exact;
      else if (baseMatch) langInput.value = baseMatch;
    }

    function openLangModal() {
      syncInputWithCurrentLocale();
      applyFooterLanguageLabels();
      langModal.showModal();
      if (langSearch) {
        langSearch.value = '';
        filterLangs('');
        setTimeout(function () { langSearch.focus(); }, 40);
      }
    }

    function closeLangModal() {
      langModal.close();
    }

    function filterLangs(query) {
      var lower = normalizeSearchText(query);
      var visible = 0;
      langList.querySelectorAll('.creator-footer-lang-row').forEach(function (row) {
        var searchable = normalizeSearchText(row.dataset.langSearch || '');
        var show = !lower || searchable.indexOf(lower) !== -1;
        row.hidden = !show;
        row.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      if (langEmpty) {
        langEmpty.hidden = visible > 0;
      }
    }

    function openVariantModal(baseCode, variantsCsv, title) {
      var variants = String(variantsCsv || '').split(',').map(function (v) { return normalizeLocaleForMatch(v); }).filter(Boolean);
      if (!variants.length) return;
      var modalId = 'creatorMobileDialectModal';
      var modal = document.getElementById(modalId);
      if (!modal) {
        modal = document.createElement('dialog');
        modal.id = modalId;
        modal.className = 'creator-footer-lang-modal creator-footer-dialect-modal';
        modal.innerHTML = '<div class="creator-footer-lang-modal__content"><div class="creator-footer-lang-modal__header"><h2 class="creator-footer-lang-modal__title" id="creatorMobileDialectTitle">Variants</h2><button class="creator-footer-lang-modal__close" type="button" data-close><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div><div class="creator-footer-lang-modal__list" id="creatorMobileDialectList"></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
        modal.querySelector('[data-close]').addEventListener('click', function () { modal.close(); });
      }
      var titleEl = document.getElementById('creatorMobileDialectTitle');
      var bodyEl = document.getElementById('creatorMobileDialectList');
      if (!bodyEl) return;
      if (titleEl) titleEl.textContent = title || baseCode.toUpperCase();
      var uiLocale = normalizeLocaleForMatch(getCurrentUiLocale()) || 'en';
      var activeCode = normalizeLocaleForMatch(langInput && langInput.value ? langInput.value : getCurrentUiLocale());
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
        return '<button class="creator-footer-lang-modal__item' + active + '" type="button" data-variant-code="' + code + '">' +
          '<span class="creator-footer-lang-modal__item-left">' +
          '<span class="creator-footer-lang-modal__item-flag' + (flag ? '' : ' creator-footer-lang-modal__item-flag--emoji') + '" data-lang-flag style="' + (flag ? ('background-image:' + flag) : '') + '">' + (flag ? '' : countryCodeToFlagEmoji(cc)) + '</span>' +
          '<span class="creator-footer-lang-modal__item-name">' + name + '</span></span>' +
          '<span class="creator-footer-lang-modal__item-code">' + formatCode(code) + '</span>' +
          '</button>';
      }
      var html = '';
      if (dialects.length) {
        html += '<div class="creator-footer-dialect-modal__section-title">Dialects</div>';
        html += dialects.map(row).join('');
      }
      if (scripts.length) {
        html += '<div class="creator-footer-dialect-modal__section-title">Scripts</div>';
        html += scripts.map(row).join('');
      }
      bodyEl.innerHTML = html;
      bodyEl.onclick = function (e) {
        var btn = e.target.closest('[data-variant-code]');
        if (!btn) return;
        var code = btn.getAttribute('data-variant-code');
        if (!code) return;
        langInput.value = code;
        applyFooterLanguageLabels();
        modal.close();
        applyLocaleRouting(code);
      };
      modal.showModal();
    }

    langBtn.addEventListener('click', openLangModal);
    if (langClose) {
      langClose.addEventListener('click', closeLangModal);
    }
    langModal.addEventListener('click', function (e) {
      if (e.target === langModal) closeLangModal();
    });
    if (langSearch) {
      var runMobileLangFilter = function () { filterLangs(langSearch.value); };
      langSearch.addEventListener('input', runMobileLangFilter);
      langSearch.addEventListener('keyup', runMobileLangFilter);
      langSearch.addEventListener('search', runMobileLangFilter);
      langSearch.addEventListener('change', runMobileLangFilter);
    }
    langList.addEventListener('click', function (e) {
      var plus = e.target.closest('.creator-footer-lang-plus');
      if (plus) {
        e.preventDefault();
        e.stopPropagation();
        var base = plus.getAttribute('data-base-code') || '';
        var row = plus.closest('.creator-footer-lang-row');
        var item = row ? row.querySelector('.creator-footer-lang-modal__item') : null;
        if (item) openVariantModal(base, item.getAttribute('data-variants') || '', item.getAttribute('data-lang-name') || base);
        return;
      }
      var item = e.target.closest('.creator-footer-lang-modal__item');
      if (!item) return;
      var code = item.dataset.langCode;
      if (!code) return;
      langInput.value = code;
      applyLocaleRouting(code);
    });
    langModal.addEventListener('close', function () {
      if (langSearch) {
        langSearch.value = '';
      }
      filterLangs('');
    });

    rebuildLanguageListFromProxy();
    syncInputWithCurrentLocale();
    applyFooterLanguageLabels();
  })();

  // EAZ display: click when loading to retry balance
  document.addEventListener('click', function (e) {
    var eazEl = e.target.closest('.creator-header__eaz');
    if (eazEl && typeof window.loadCreatorBalance === 'function') {
      var valEl = eazEl.querySelector('.creator-header__eaz-value');
      if (valEl && ['Lädt...', 'Lade EAZ', 'Lade...', 'Loading...', '—', ''].indexOf((valEl.textContent || '').trim()) >= 0) {
        window.loadCreatorBalance();
      }
    }
  });

  // Account / Creator Settings button
  function isElementHiddenByAncestor(el) {
    var node = el;
    while (node && node !== document.body) {
      var styles = window.getComputedStyle(node);
      if (styles.display === 'none' || styles.visibility === 'hidden') return true;
      node = node.parentElement;
    }
    return false;
  }

  function ensureSettingsOverlayMount() {
    var overlay = document.getElementById('csmOverlay');
    if (!overlay) return;
    if (isElementHiddenByAncestor(overlay.parentElement)) {
      document.body.appendChild(overlay);
    }
  }

  function settingsModalVisible() {
    var overlay = document.getElementById('csmOverlay');
    if (!overlay) return false;
    if (overlay.getAttribute('aria-hidden') === 'false') return true;
    return overlay.style.display === 'block' || overlay.style.display === 'flex';
  }

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.creator-settings-trigger')) return;
    if (window.CreatorSettingsModal && typeof window.CreatorSettingsModal.open === 'function') {
      window.CreatorSettingsModal.open();
      return;
    }
    if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
      ensureSettingsOverlayMount();
      window.CreatorSettingsV2Modal.open();
      // Fallback for pages where the settings modal is unavailable or hidden in another section tree.
      setTimeout(function () {
        if (!settingsModalVisible() && window.AccountModal && typeof window.AccountModal.open === 'function') {
          window.AccountModal.open('my-creations');
        }
      }, 120);
      return;
    }
    if (window.AccountModal && typeof window.AccountModal.open === 'function') {
      window.AccountModal.open('my-creations');
      return;
    }
  });

  // Sales card: open sales modal on Sales screen
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-open-sales-modal]')) return;
    e.preventDefault();
    if (typeof window.openSalesModal === 'function') {
      window.openSalesModal(e, 'earnings');
    }
  });

  // Overview stat cards: internal nav (same as quick actions)
  document.querySelectorAll('.creator-stat-card[data-goto]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var idx = parseInt(el.getAttribute('data-goto'), 10);
      if (!isNaN(idx)) goTo(idx);
      if (el.dataset.creationsTab && window.CreationsScreen && window.CreationsScreen.switchTab) {
        window.CreationsScreen.switchTab(el.dataset.creationsTab);
      }
      if (el.dataset.marketingSubtab && window.MarketingScreen) {
        if (window.MarketingScreen.switchSubTab) window.MarketingScreen.switchSubTab(el.dataset.marketingSubtab);
        if (el.dataset.marketingContent && window.MarketingScreen.switchContentTab) {
          window.MarketingScreen.switchContentTab(el.dataset.marketingContent);
        }
      }
    });
  });

  try {
    window.addEventListener('creatorJobPollingStopped', function () {
      relocateCreatorEazyCluster();
    });
  } catch (e) {}

  // Collapsible Containers
  document.querySelectorAll('[data-collapsible] .creator-container__header').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const container = btn.closest('.creator-container');
      if (!container) return;
      const isCollapsed = container.classList.toggle('creator-container--collapsed');
      btn.setAttribute('aria-expanded', !isCollapsed);
    });
  });
})();
