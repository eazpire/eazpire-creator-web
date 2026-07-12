/**
 * Daily limits subheader — uploads, designs (generate), publishes (Shopify listings).
 * Data: GET get-creator-journey → creation_limits_effective + listing_limits_effective.
 */
(function () {
  'use strict';

  var roots = [];
  var loading = false;
  var lastFetch = 0;
  var MIN_REFETCH_MS = 8000;

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

  function applyItem(itemEl, used, cap, locked, rootEl) {
    if (!itemEl) return;
    var countEl = itemEl.querySelector('[data-limit-count]');
    var fillEl = itemEl.querySelector('[data-limit-fill]');
    var c = Number(cap) || 0;
    var u = Number(used) || 0;
    var isLocked = !!locked || c <= 0;
    itemEl.classList.toggle('is-locked', isLocked);
    itemEl.classList.toggle('is-at-limit', !isLocked && u >= c && c > 0);
    if (countEl) {
      countEl.textContent = isLocked ? i18n('locked', rootEl) : u + '/' + c;
    }
    if (fillEl) {
      fillEl.style.width = isLocked ? '0%' : pct(u, c) + '%';
    }
  }

  function applyPayload(data) {
    if (!roots.length) return;
    var creation = (data && data.creation_limits_effective) || {};
    var listing = (data && data.listing_limits_effective) || {};
    var shopify = (listing.channels && listing.channels.shopify) || {};
    var mode = creation.mode || 'daily';

    roots.forEach(function (rootEl) {
      applyItem(
        rootEl.querySelector('[data-limit="upload"]'),
        creation.upload_used,
        creation.upload_cap,
        mode === 'daily_blocked',
        rootEl
      );
      applyItem(
        rootEl.querySelector('[data-limit="design"]'),
        creation.generate_used,
        creation.generate_cap,
        mode === 'daily_blocked',
        rootEl
      );
      applyItem(
        rootEl.querySelector('[data-limit="publish"]'),
        shopify.listings_used_today,
        shopify.listings_per_day,
        !shopify.channel_unlocked,
        rootEl
      );

      var foot = rootEl.querySelector('[data-limit-footnote]');
      if (foot) {
        foot.textContent = mode === 'lifetime' ? i18n('lifetime', rootEl) : i18n('reset', rootEl);
      }

      rootEl.classList.remove('is-loading');
      rootEl.hidden = false;
    });
    syncChromeMetrics();
  }

  function syncChromeMetrics() {
    var mobileApp = document.querySelector('.creator-mobile-app');
    var desktopApp = document.querySelector('.creator-desktop-app');
    var mobileHeader = mobileApp && mobileApp.querySelector('.creator-header');
    var desktopHeader = desktopApp && desktopApp.querySelector('.creator-desktop-header');
    var mobileVisible = mobileApp && getComputedStyle(mobileApp).display !== 'none';
    var desktopVisible = desktopApp && getComputedStyle(desktopApp).display !== 'none';
    var header = (mobileVisible && mobileHeader) || (desktopVisible && desktopHeader) || mobileHeader || desktopHeader;
    var app = (mobileVisible && mobileApp) || (desktopVisible && desktopApp) || mobileApp || desktopApp;
    if (!header || !app) return;
    var h = header.offsetHeight;
    app.style.setProperty('--creator-chrome-height', h + 'px');
    document.documentElement.style.setProperty('--creator-chrome-height', h + 'px');
  }

  function refresh(force) {
    if (!roots.length) return Promise.resolve();
    var oid = ownerId();
    if (!oid) {
      roots.forEach(function (el) {
        el.hidden = true;
      });
      return Promise.resolve();
    }
    var now = Date.now();
    if (!force && loading) return Promise.resolve();
    if (!force && now - lastFetch < MIN_REFETCH_MS) return Promise.resolve();

    loading = true;
    roots.forEach(function (el) {
      el.classList.add('is-loading');
    });
    lastFetch = now;

    return apiGet('get-creator-journey', { owner_id: oid })
      .then(function (data) {
        if (data && data.ok) applyPayload(data);
        else {
          roots.forEach(function (el) {
            el.hidden = true;
          });
        }
      })
      .catch(function () {
        /* keep last values if any */
      })
      .finally(function () {
        loading = false;
        syncChromeMetrics();
      });
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
    window.addEventListener('creator-journey-updated', function () {
      refresh(true);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refresh(false);
    });
  }

  function init() {
    roots = Array.prototype.slice.call(document.querySelectorAll('[data-creator-daily-limits]'));
    if (!roots.length) return;
    bindEvents();
    refresh(true);
    if (typeof ResizeObserver !== 'undefined') {
      document.querySelectorAll('.creator-header, .creator-desktop-header').forEach(function (header) {
        new ResizeObserver(syncChromeMetrics).observe(header);
      });
    }
    window.CreatorDailyLimitsSubheader = { refresh: refresh, syncChromeMetrics: syncChromeMetrics };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
