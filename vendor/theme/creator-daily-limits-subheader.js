/**
 * Daily limits subheader — uploads, designs (generate), publishes (Shopify listings).
 */
(function () {
  'use strict';

  var roots = [];
  var loading = false;
  var lastFetch = 0;
  var ownerPollTimer = null;
  var countdownTimer = null;
  var countdownModeDaily = false;
  var MIN_REFETCH_MS = 8000;
  var JOURNEY_CACHE_MS = 60000;
  var mounted = false;

  function ownerId() {
    if (typeof window._resolveEazOwnerId === 'function') {
      var resolved = window._resolveEazOwnerId();
      if (resolved) return String(resolved).trim();
    }
    if (
      window.CreatorPortalAuth &&
      window.CreatorPortalAuth.state &&
      window.CreatorPortalAuth.state.ownerId
    ) {
      return String(window.CreatorPortalAuth.state.ownerId).trim();
    }
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId).trim();

    var debugEls = document.querySelectorAll('[data-debug-owner]');
    for (var i = 0; i < debugEls.length; i++) {
      var dbg = debugEls[i];
      if (!dbg || !dbg.dataset || !dbg.dataset.debugOwner) continue;
      try {
        var p = JSON.parse(dbg.dataset.debugOwner);
        if (p && String(p).trim() && String(p).trim() !== 'null') return String(p).trim();
      } catch (_e) {
        var raw = String(dbg.dataset.debugOwner).replace(/"/g, '').trim();
        if (raw && raw !== 'null') return raw;
      }
    }
    return '';
  }

  function apiGet(op, params) {
    if (typeof window.creatorApiFetch === 'function') {
      return window.creatorApiFetch(op, params || {});
    }
    var base =
      (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) ||
      'https://creator-engine.eazpire.workers.dev';
    var url = new URL(base + '/apps/creator-dispatch');
    url.searchParams.set('op', op);
    url.searchParams.set('_t', String(Date.now()));
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] != null && params[k] !== '') url.searchParams.set(k, String(params[k]));
    });
    var oid = ownerId();
    if (oid && !url.searchParams.has('owner_id')) url.searchParams.set('owner_id', oid);
    if (oid && !url.searchParams.has('logged_in_customer_id')) {
      url.searchParams.set('logged_in_customer_id', oid);
    }
    return fetch(url.toString(), { credentials: 'include', cache: 'no-store' }).then(function (r) {
      return r.json();
    });
  }

  function i18n(key, fromRoot) {
    if (fromRoot && fromRoot.dataset) {
      var dsKey = 'i18n' + key.charAt(0).toUpperCase() + key.slice(1);
      if (fromRoot.dataset[dsKey]) return fromRoot.dataset[dsKey];
    }
    if (window.CreatorI18n && window.CreatorI18n[key]) return window.CreatorI18n[key];
    return key;
  }

  function pct(used, cap) {
    var u = Number(used) || 0;
    var c = Number(cap) || 0;
    if (c <= 0) return 0;
    return Math.min(100, Math.round((u / c) * 100));
  }

  var DAY_MS = 24 * 60 * 60 * 1000;

  function msUntilNextUtcMidnight() {
    var now = new Date();
    var next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
    );
    return Math.max(0, next.getTime() - now.getTime());
  }

  function formatCountdown(ms) {
    var totalSec = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function updateCountdownDom() {
    if (!countdownModeDaily) return;
    var remaining = msUntilNextUtcMidnight();
    var pctRemaining = Math.max(0, Math.min(100, (remaining / DAY_MS) * 100));
    var label = formatCountdown(remaining);

    roots.forEach(function (rootEl) {
      var wrap = rootEl.querySelector('[data-limit-countdown]');
      if (!wrap) return;
      var fill = wrap.querySelector('[data-countdown-fill]');
      var text = wrap.querySelector('[data-countdown-text]');
      if (fill) fill.style.height = pctRemaining.toFixed(2) + '%';
      if (text) text.textContent = label;
    });
  }

  function setCountdownVisible(show) {
    var changed = countdownModeDaily !== show;
    countdownModeDaily = show;
    roots.forEach(function (rootEl) {
      var wrap = rootEl.querySelector('[data-limit-countdown]');
      if (!wrap) return;
      if (show) {
        wrap.hidden = false;
        wrap.removeAttribute('aria-hidden');
        var aria = i18n('countdownAria', rootEl);
        if (aria && aria !== 'countdownAria') wrap.setAttribute('aria-label', aria);
      } else {
        wrap.hidden = true;
        wrap.setAttribute('aria-hidden', 'true');
        wrap.removeAttribute('aria-label');
      }
      rootEl.classList.toggle('has-countdown', !!show);
    });
    if (show) {
      updateCountdownDom();
      if (!countdownTimer) {
        countdownTimer = setInterval(updateCountdownDom, 1000);
      }
    } else {
      stopCountdown();
    }
    if (changed) syncChromeMetrics();
  }

  function storeJourneyCache(data) {
    if (!data || !data.ok) return;
    window.__EAZ_CREATOR_JOURNEY__ = data;
    window.__EAZ_CREATOR_JOURNEY_FETCHED_AT__ = Date.now();
  }

  function readJourneyCache() {
    var data = window.__EAZ_CREATOR_JOURNEY__;
    if (!data || !data.ok) return null;
    var age = Date.now() - (window.__EAZ_CREATOR_JOURNEY_FETCHED_AT__ || 0);
    if (age > JOURNEY_CACHE_MS) return null;
    return data;
  }

  function fetchJourneyData(force) {
    if (!force) {
      var cached = readJourneyCache();
      if (cached) return Promise.resolve(cached);
    }
    if (window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__) {
      return window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__;
    }

    var oid = ownerId();
    if (!oid) return Promise.resolve(null);

    window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__ = apiGet('get-creator-journey', { owner_id: oid })
      .then(function (data) {
        storeJourneyCache(data);
        if (data && data.ok) {
          try {
            window.dispatchEvent(
              new CustomEvent('creator-journey-updated', {
                detail: { source: 'daily-limits-subheader', journey: data },
              })
            );
          } catch (_ev) {}
        }
        return data;
      })
      .finally(function () {
        window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__ = null;
      });

    return window.__EAZ_CREATOR_JOURNEY_LOAD_PROMISE__;
  }

  function applyItem(itemEl, used, cap, locked, rootEl, loadingState) {
    if (!itemEl) return;
    var countEl = itemEl.querySelector('[data-limit-count]');
    var fillEl = itemEl.querySelector('[data-limit-fill]');
    var c = Number(cap) || 0;
    var u = Number(used) || 0;
    var isLocked = !loadingState && !!locked;
    itemEl.classList.toggle('is-locked', isLocked);
    itemEl.classList.toggle('is-at-limit', !isLocked && !loadingState && u >= c && c > 0);
    if (countEl) {
      if (loadingState) {
        countEl.textContent = '—';
      } else if (isLocked) {
        countEl.textContent = i18n('locked', rootEl);
      } else {
        countEl.textContent = u + '/' + c;
      }
    }
    if (fillEl) {
      fillEl.style.width = loadingState || isLocked ? '0%' : pct(u, c) + '%';
    }
  }

  function setGuestState(isGuest) {
    roots.forEach(function (rootEl) {
      rootEl.classList.toggle('is-guest', !!isGuest);
    });
    if (isGuest) setCountdownVisible(false);
  }

  function applyPayload(data, loadingState) {
    if (!roots.length) return;
    var creation = (data && data.creation_limits_effective) || {};
    var listing = (data && data.listing_limits_effective) || {};
    var shopify = (listing.channels && listing.channels.shopify) || {};
    var mode = creation.mode || 'daily';
    var hasCreation = !!(data && data.creation_limits_effective);
    var hasListing = !!(data && data.listing_limits_effective);

    roots.forEach(function (rootEl) {
      applyItem(
        rootEl.querySelector('[data-limit="upload"]'),
        creation.upload_used,
        creation.upload_cap,
        hasCreation && (creation.upload_cap || 0) <= 0,
        rootEl,
        loadingState
      );
      applyItem(
        rootEl.querySelector('[data-limit="design"]'),
        creation.generate_used,
        creation.generate_cap,
        hasCreation && (creation.generate_cap || 0) <= 0,
        rootEl,
        loadingState
      );
      applyItem(
        rootEl.querySelector('[data-limit="publish"]'),
        shopify.listings_used_today,
        shopify.listings_per_day,
        hasListing &&
          (shopify.channel_unlocked === false || (shopify.listings_per_day || 0) <= 0),
        rootEl,
        loadingState
      );

      var foot = rootEl.querySelector('[data-limit-footnote]');
      if (foot && !loadingState) {
        foot.textContent = mode === 'lifetime' ? i18n('lifetime', rootEl) : i18n('reset', rootEl);
      }

      rootEl.classList.toggle('is-loading', !!loadingState);
      rootEl.classList.remove('is-guest');
    });

    if (loadingState) {
      setCountdownVisible(false);
    } else {
      setCountdownVisible(mode !== 'lifetime');
    }
    syncChromeMetrics();
  }

  function measureHeaderOnly() {
    var mobileApp = document.querySelector('.creator-mobile-app');
    var desktopApp = document.querySelector('.creator-desktop-app');
    var mobileVisible = mobileApp && getComputedStyle(mobileApp).display !== 'none';
    var desktopVisible = desktopApp && getComputedStyle(desktopApp).display !== 'none';
    var header =
      (mobileVisible && mobileApp && mobileApp.querySelector('.creator-header')) ||
      (desktopVisible && desktopApp && desktopApp.querySelector('.creator-desktop-header')) ||
      document.querySelector('.creator-header') ||
      document.querySelector('.creator-desktop-header');
    return header ? header.offsetHeight : 0;
  }

  function syncChromeMetrics() {
    var mobileApp = document.querySelector('.creator-mobile-app');
    var desktopApp = document.querySelector('.creator-desktop-app');
    var mobileVisible = mobileApp && getComputedStyle(mobileApp).display !== 'none';
    var desktopVisible = desktopApp && getComputedStyle(desktopApp).display !== 'none';
    var app = (mobileVisible && mobileApp) || (desktopVisible && desktopApp) || mobileApp || desktopApp;

    var headerH = measureHeaderOnly();
    if (headerH > 0) {
      document.documentElement.style.setProperty('--creator-header-only-height', headerH + 'px');
    }

    var strip = document.querySelector('[data-creator-daily-limits]:not(.is-guest)');
    var stripH = strip && getComputedStyle(strip).display !== 'none' ? strip.offsetHeight : 0;
    var chromeH = headerH + stripH;
    var contentTop = chromeH + (stripH > 0 ? 8 : 0);

    if (app) app.style.setProperty('--creator-chrome-height', chromeH + 'px');
    if (app) app.style.setProperty('--creator-content-top', contentTop + 'px');
    document.documentElement.style.setProperty('--creator-chrome-height', chromeH + 'px');
    document.documentElement.style.setProperty('--creator-content-top', contentTop + 'px');
    document.documentElement.style.setProperty('--creator-daily-limits-height', stripH + 'px');
  }

  function refresh(force) {
    collectRoots();
    if (!roots.length) return Promise.resolve();

    var oid = ownerId();
    if (!oid) {
      setGuestState(true);
      syncChromeMetrics();
      return Promise.resolve();
    }

    setGuestState(false);
    syncChromeMetrics();
    var now = Date.now();
    if (!force && loading) return Promise.resolve();
    if (!force && now - lastFetch < MIN_REFETCH_MS) return Promise.resolve();

    var cached = !force ? readJourneyCache() : null;
    if (cached) {
      applyPayload(cached, false);
      lastFetch = now;
      return Promise.resolve();
    }

    loading = true;
    applyPayload(null, true);
    lastFetch = now;

    return fetchJourneyData(force)
      .then(function (data) {
        if (data && data.ok) applyPayload(data, false);
      })
      .catch(function () {
        applyPayload(null, true);
      })
      .finally(function () {
        loading = false;
        syncChromeMetrics();
      });
  }

  function collectRoots() {
    roots = Array.prototype.slice.call(document.querySelectorAll('[data-creator-daily-limits]'));
  }

  function pollOwnerAndRefresh(attempt) {
    var n = typeof attempt === 'number' ? attempt : 0;
    collectRoots();
    if (!roots.length && n < 40) {
      ownerPollTimer = setTimeout(function () {
        pollOwnerAndRefresh(n + 1);
      }, 250);
      return;
    }
    if (!roots.length) return;

    var oid = ownerId();
    if (!oid && n < 40) {
      ownerPollTimer = setTimeout(function () {
        pollOwnerAndRefresh(n + 1);
      }, 300);
      return;
    }
    refresh(true);
  }

  function bindEvents() {
    window.addEventListener('resize', syncChromeMetrics);
    window.addEventListener('creator-upload-finished', function () {
      refresh(true);
    });
    window.addEventListener('creatorSaveJobStarted', function () {
      setTimeout(function () {
        refresh(true);
      }, 1200);
    });
    window.addEventListener('creator-journey-updated', function (e) {
      var detail = e && e.detail ? e.detail : {};
      if (detail.journey && detail.journey.ok) {
        storeJourneyCache(detail.journey);
        applyPayload(detail.journey, false);
        lastFetch = Date.now();
        return;
      }
      refresh(true);
    });
    window.addEventListener('eazCreatorContextReady', function () {
      refresh(true);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        refresh(false);
        if (countdownModeDaily) updateCountdownDom();
      }
    });
  }

  function mount() {
    if (mounted) {
      refresh(true);
      return;
    }
    collectRoots();
    if (!roots.length) return;
    mounted = true;
    bindEvents();
    pollOwnerAndRefresh(0);
    if (typeof ResizeObserver !== 'undefined') {
      document.querySelectorAll('.creator-header, .creator-desktop-header, [data-creator-daily-limits]').forEach(function (el) {
        new ResizeObserver(syncChromeMetrics).observe(el);
      });
    }
    window.CreatorDailyLimitsSubheader = {
      refresh: refresh,
      syncChromeMetrics: syncChromeMetrics,
      mount: mount,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.addEventListener('eazCreatorContextReady', mount);
})();
