/**
 * Creator mobile drawer + desktop sidebar — ParticleReveal aquarium,
 * masked to nav buttons (band from first to last, padded inside nav list).
 */
(function () {
  'use strict';

  function eazAnim(scope, key) {
    try {
      if (window.EazAnim && typeof window.EazAnim.isEnabled === 'function') {
        return window.EazAnim.isEnabled(scope, key);
      }
    } catch (_e) {}
    return true;
  }

  var API_BASE = 'https://creator-engine.eazpire.workers.dev';
  var BATCH_SIZE = 40;
  var FALLBACK_URLS = [
    'https://placehold.co/400x400/1f2937/f97316?text=Design',
    'https://placehold.co/400x400/111827/fb923c?text=Creator'
  ];
  var DENSITY_DEFAULT = 6;
  var BG_COLOR = 'rgba(11, 15, 24, 0.5)';
  var PARTICLE_OPACITY = 0.2;
  var BTN_RADIUS_DESKTOP = 14;
  var BTN_RADIUS_MOBILE_DRAWER = 16;

  var designPool = [];
  var poolIndex = 0;
  var maskCanvas = null;
  var designsFetchPromise = null;

  function getMaskCanvas() {
    if (!maskCanvas) {
      maskCanvas = document.createElement('canvas');
    }
    return maskCanvas;
  }

  function fillRoundRect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.fill();
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

  function fetchDesigns() {
    if (designsFetchPromise) return designsFetchPromise;
    designsFetchPromise = fetch(API_BASE + '/apps/creator-dispatch?op=list-public&limit=' + BATCH_SIZE)
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (!d.ok || !Array.isArray(d.items)) return [];
        return (d.items || [])
          .map(function (it) {
            return it.preview_url || it.original_url;
          })
          .filter(function (u) {
            return (
              u &&
              typeof u === 'string' &&
              u.trim().length > 0 &&
              (u.indexOf('http://') === 0 || u.indexOf('https://') === 0)
            );
          });
      })
      .catch(function () {
        designsFetchPromise = null;
        return [];
      });
    return designsFetchPromise;
  }

  function getNextUrl() {
    if (designPool.length === 0) return null;
    var url = designPool[poolIndex % designPool.length];
    poolIndex += 1;
    return url;
  }

  function createAquarium(container, isActiveFn) {
    var canvasEl = null;
    var isShowing = false;
    var currentAnim = null;

    function ensureCanvas() {
      if (canvasEl && container.contains(canvasEl)) return canvasEl;
      canvasEl = document.createElement('canvas');
      canvasEl.className = 'creator-drawer__aquarium-canvas';
      canvasEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      canvasEl.setAttribute('aria-hidden', 'true');
      container.appendChild(canvasEl);
      return canvasEl;
    }

    function showParticleReveal(url) {
      if (isShowing || !url || !window.ParticleReveal) return;
      isShowing = true;

      var canvas = ensureCanvas();
      if (currentAnim && currentAnim.stop) currentAnim.stop();
      currentAnim = null;

      currentAnim = window.ParticleReveal.run(canvas, url, {
        density: DENSITY_DEFAULT,
        backgroundColor: BG_COLOR,
        particleOpacity: PARTICLE_OPACITY,
        getNextUrl: getNextUrl,
        onComplete: function () {
          currentAnim = null;
          isShowing = false;
          var cctx = canvas.getContext('2d');
          if (cctx) {
            cctx.fillStyle = BG_COLOR;
            cctx.fillRect(0, 0, canvas.width || canvas.offsetWidth, canvas.height || canvas.offsetHeight);
          }
          if (isActiveFn()) {
            tryCreate();
          }
        }
      });
    }

    function tryCreate() {
      if (designPool.length === 0) designPool = FALLBACK_URLS.slice();
      var url = getNextUrl();
      if (url && isActiveFn() && !isShowing) {
        showParticleReveal(url);
      }
    }

    function start() {
      if (designPool.length > 0) tryCreate();
      fetchDesigns().then(function (urls) {
        if (urls.length > 0) designPool = shuffle(urls);
        tryCreate();
      });
    }

    return { start: start, tryCreate: tryCreate };
  }

  function isDesktopViewport() {
    return window.matchMedia && window.matchMedia('(min-width: 992px)').matches;
  }

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function readCssPx(el, varName, fallback) {
    if (!el) return fallback;
    var raw = getComputedStyle(el).getPropertyValue(varName).trim();
    if (!raw) return fallback;
    var n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  function resetBandAquariumLayout(aq) {
    aq.style.top = '';
    aq.style.left = '';
    aq.style.width = '';
    aq.style.height = '';
    aq.style.right = '';
    aq.style.bottom = '';
  }

  function clearAquariumMask(aq) {
    aq.classList.remove('creator-sidebar-aquarium-mask-ready');
    aq.style.webkitMaskImage = '';
    aq.style.maskImage = '';
    aq.style.webkitMaskSize = '';
    aq.style.maskSize = '';
    aq.style.webkitMaskRepeat = '';
    aq.style.maskRepeat = '';
    aq.style.webkitMaskPosition = '';
    aq.style.maskPosition = '';
    aq.style.webkitMaskType = '';
    aq.style.maskType = '';
  }

  /**
   * @param {object} cfg
   * @param {string} cfg.aqId
   * @param {string} cfg.navId
   * @param {string} cfg.sidebarSelector
   * @param {string} cfg.buttonSelector
   * @param {string} cfg.padVar
   * @param {string} cfg.innerPadVar
   * @param {number} cfg.btnRadius
   * @param {function(): boolean} cfg.shouldRun
   */
  function updateBandAquariumLayout(cfg) {
    var aq = document.getElementById(cfg.aqId);
    var nav = document.getElementById(cfg.navId);
    var sidebar = aq && aq.closest(cfg.sidebarSelector);
    if (!aq || !nav || !sidebar) return;

    if (!cfg.shouldRun()) {
      clearAquariumMask(aq);
      resetBandAquariumLayout(aq);
      return;
    }

    var buttons = nav.querySelectorAll(cfg.buttonSelector);
    if (!buttons.length) {
      clearAquariumMask(aq);
      resetBandAquariumLayout(aq);
      return;
    }

    var padNav = readCssPx(sidebar, cfg.padVar, 10);
    var innerPad = readCssPx(sidebar, cfg.innerPadVar, 6);
    var btnRadius = typeof cfg.btnRadius === 'number' ? cfg.btnRadius : BTN_RADIUS_DESKTOP;

    var nr = nav.getBoundingClientRect();
    var sr = sidebar.getBoundingClientRect();
    var fr = buttons[0].getBoundingClientRect();
    var lr = buttons[buttons.length - 1].getBoundingClientRect();

    var navInnerTop = nr.top + padNav;
    var navInnerBottom = nr.bottom - padNav;
    var bandTop = fr.top - innerPad;
    var bandBottom = lr.bottom + innerPad;

    var topVp = Math.max(navInnerTop, bandTop);
    var bottomVp = Math.min(navInnerBottom, bandBottom);
    if (bottomVp <= topVp) {
      topVp = navInnerTop;
      bottomVp = navInnerBottom;
    }

    var aqTop = topVp - sr.top;
    var aqHeight = bottomVp - topVp;
    var left = nr.left - sr.left;
    var width = nr.width;

    aq.style.top = round2(aqTop) + 'px';
    aq.style.left = round2(left) + 'px';
    aq.style.width = round2(width) + 'px';
    aq.style.height = Math.max(1, round2(aqHeight)) + 'px';
    aq.style.right = 'auto';
    aq.style.bottom = 'auto';

    var ar = aq.getBoundingClientRect();
    var cw = Math.max(1, Math.ceil(ar.width));
    var ch = Math.max(1, Math.ceil(ar.height));

    var mc = getMaskCanvas();
    if (mc.width !== cw || mc.height !== ch) {
      mc.width = cw;
      mc.height = ch;
    }

    var ctx = mc.getContext('2d');
    if (!ctx) {
      clearAquariumMask(aq);
      resetBandAquariumLayout(aq);
      return;
    }

    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#ffffff';

    for (var i = 0; i < buttons.length; i++) {
      var br = buttons[i].getBoundingClientRect();
      var x = round2(br.left - ar.left);
      var y = round2(br.top - ar.top);
      var rw = round2(br.width);
      var rh = round2(br.height);
      fillRoundRect(ctx, x, y, rw, rh, btnRadius);
    }

    var pngUrl = mc.toDataURL('image/png');
    var maskUrl = 'url("' + pngUrl + '")';

    aq.style.webkitMaskImage = maskUrl;
    aq.style.maskImage = maskUrl;
    aq.style.webkitMaskSize = '100% 100%';
    aq.style.maskSize = '100% 100%';
    aq.style.webkitMaskRepeat = 'no-repeat';
    aq.style.maskRepeat = 'no-repeat';
    aq.style.webkitMaskPosition = '0 0';
    aq.style.maskPosition = '0 0';
    aq.style.webkitMaskType = 'alpha';
    aq.style.maskType = 'alpha';
    aq.classList.add('creator-sidebar-aquarium-mask-ready');

    try {
      window.dispatchEvent(new Event('resize'));
    } catch (_e) {}
  }

  function updateDesktopSidebarAquariumLayout() {
    updateBandAquariumLayout({
      aqId: 'creatorDesktopSidebarAquarium',
      navId: 'creatorDesktopNav',
      sidebarSelector: '.creator-desktop-sidebar',
      buttonSelector: '.creator-desktop-sidebar__item[data-desktop-switch]',
      padVar: '--creator-desktop-sidebar-aquarium-pad-y',
      innerPadVar: '--creator-desktop-sidebar-aquarium-inner-pad-y',
      btnRadius: BTN_RADIUS_DESKTOP,
      shouldRun: function () {
        return isDesktopViewport() && eazAnim('creator', 'sidebar_aquarium');
      }
    });
  }

  function updateMobileDrawerAquariumLayout() {
    var drawer = document.getElementById('creatorMobileDrawer');
    updateBandAquariumLayout({
      aqId: 'creatorDrawerAquarium',
      navId: 'creatorMobileNav',
      sidebarSelector: '.creator-drawer',
      buttonSelector: '.creator-drawer__item[data-nav]',
      padVar: '--creator-drawer-aquarium-pad-y',
      innerPadVar: '--creator-drawer-aquarium-inner-pad-y',
      btnRadius: BTN_RADIUS_MOBILE_DRAWER,
      shouldRun: function () {
        return (
          !isDesktopViewport() &&
          drawer &&
          drawer.classList.contains('is-open') &&
          eazAnim('creator', 'drawer_aquarium')
        );
      }
    });
  }

  function initDesktopSidebarAquariumMask() {
    var aq = document.getElementById('creatorDesktopSidebarAquarium');
    var sidebar = aq && aq.closest('.creator-desktop-sidebar');
    if (!aq || !sidebar) return;

    var ro = new ResizeObserver(function () {
      window.requestAnimationFrame(updateDesktopSidebarAquariumLayout);
    });
    ro.observe(sidebar);
    ro.observe(aq);

    var nav = document.getElementById('creatorDesktopNav');
    if (nav) {
      ro.observe(nav);
      nav.addEventListener(
        'scroll',
        function () {
          window.requestAnimationFrame(updateDesktopSidebarAquariumLayout);
        },
        { passive: true }
      );
    }
  }

  function initMobileDrawerAquariumMask() {
    var aq = document.getElementById('creatorDrawerAquarium');
    var drawer = document.getElementById('creatorMobileDrawer');
    if (!aq || !drawer) return;

    var ro = new ResizeObserver(function () {
      window.requestAnimationFrame(updateMobileDrawerAquariumLayout);
    });
    ro.observe(drawer);
    ro.observe(aq);

    var nav = document.getElementById('creatorMobileNav');
    if (nav) {
      ro.observe(nav);
      nav.addEventListener(
        'scroll',
        function () {
          window.requestAnimationFrame(updateMobileDrawerAquariumLayout);
        },
        { passive: true }
      );
    }
  }

  function bootDrawerAquarium() {
    var mobileDrawer = document.getElementById('creatorMobileDrawer');
    var mobileContainer = document.getElementById('creatorDrawerAquarium');
    var desktopContainer = document.getElementById('creatorDesktopSidebarAquarium');
    var mobileAq = null;
    var desktopAq = null;

    function scheduleAllBandLayouts() {
      window.requestAnimationFrame(function () {
        updateDesktopSidebarAquariumLayout();
        updateMobileDrawerAquariumLayout();
      });
    }

    if (mobileContainer && mobileDrawer && eazAnim('creator', 'drawer_aquarium')) {
      mobileAq = createAquarium(mobileContainer, function () {
        return (
          mobileDrawer.classList.contains('is-open') &&
          !isDesktopViewport() &&
          eazAnim('creator', 'drawer_aquarium')
        );
      });
      mobileAq.start();

      var observer = new MutationObserver(function () {
        window.requestAnimationFrame(updateMobileDrawerAquariumLayout);
        if (mobileDrawer.classList.contains('is-open') && eazAnim('creator', 'drawer_aquarium')) {
          mobileAq.tryCreate();
        }
      });
      observer.observe(mobileDrawer, { attributes: true, attributeFilter: ['class'] });

      initMobileDrawerAquariumMask();
    }

    if (desktopContainer && eazAnim('creator', 'sidebar_aquarium')) {
      desktopAq = createAquarium(desktopContainer, function () {
        return isDesktopViewport() && eazAnim('creator', 'sidebar_aquarium');
      });
      desktopAq.start();

      initDesktopSidebarAquariumMask();
    }

    if (mobileContainer || desktopContainer) {
      window.addEventListener('resize', scheduleAllBandLayouts);
      window.addEventListener('load', scheduleAllBandLayouts);
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(scheduleAllBandLayouts);
      });
    }

    var mql = window.matchMedia('(min-width: 992px)');
    var onMq = function () {
      updateDesktopSidebarAquariumLayout();
      updateMobileDrawerAquariumLayout();
      if (desktopAq && eazAnim('creator', 'sidebar_aquarium')) desktopAq.tryCreate();
      if (mobileAq && eazAnim('creator', 'drawer_aquarium')) mobileAq.tryCreate();
    };
    if (mql.addEventListener) {
      mql.addEventListener('change', onMq);
    } else if (mql.addListener) {
      mql.addListener(onMq);
    }
  }

  function startWhenReady() {
    if (window.EazAnim && typeof window.EazAnim.whenReady === 'function') {
      window.EazAnim.whenReady().then(bootDrawerAquarium);
      return;
    }
    bootDrawerAquarium();
  }

  document.addEventListener('DOMContentLoaded', startWhenReady);
})();
