/**
 * Creator API Helper für Creator-Dashboard (Theme)
 * Balance laden, Eazy-Snap-Reward
 * Nutzt window.__EAZ_OWNER_ID und window.CREATOR_API_CONFIG (von Section gesetzt)
 */
(function () {
  'use strict';
  var metaBase = document.querySelector('meta[name="creator-api-base"]');
  var metaOwner = document.querySelector('meta[name="creator-owner-id"]');
  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) || (metaBase ? metaBase.getAttribute('content') : null) || 'https://creator-engine.eazpire.workers.dev';
  var OWNER_ID = (metaOwner ? metaOwner.getAttribute('content') : null) || window.__EAZ_OWNER_ID;

  window.CREATOR_API_CONFIG = window.CREATOR_API_CONFIG || {};
  window.CREATOR_API_CONFIG.BASE_URL = (window.CREATOR_API_CONFIG.BASE_URL || API_BASE).replace(/\/$/, '');
  if (!Number.isFinite(Number(window.CREATOR_API_CONFIG.TIMEOUT)) || Number(window.CREATOR_API_CONFIG.TIMEOUT) <= 0) {
    window.CREATOR_API_CONFIG.TIMEOUT = 30000;
  }
  if (!Number.isFinite(Number(window.CREATOR_API_CONFIG.RETRY_ATTEMPTS)) || Number(window.CREATOR_API_CONFIG.RETRY_ATTEMPTS) < 0) {
    window.CREATOR_API_CONFIG.RETRY_ATTEMPTS = 2;
  }
  if (!Number.isFinite(Number(window.CREATOR_API_CONFIG.RETRY_DELAY)) || Number(window.CREATOR_API_CONFIG.RETRY_DELAY) < 0) {
    window.CREATOR_API_CONFIG.RETRY_DELAY = 1000;
  }
  if (OWNER_ID && String(OWNER_ID).trim()) {
    window.__EAZ_OWNER_ID = String(OWNER_ID).trim();
  }

  window.__eazBalanceCache = window.__eazBalanceCache || { value: null, timestamp: 0, loading: null };
  window.__salesBalanceCache = window.__salesBalanceCache || { amount: null, currency: null, timestamp: 0, loading: null };
  var BALANCE_CACHE_MS = 12000;

  function resolveOwnerId() {
    if (typeof window._resolveEazOwnerId === 'function') {
      var resolved = window._resolveEazOwnerId();
      if (resolved !== null && resolved !== undefined && String(resolved).trim() !== '') {
        return String(resolved).trim();
      }
    }

    var id = window.__EAZ_OWNER_ID || OWNER_ID;
    if (id) return String(id).trim();

    var debugEls = document.querySelectorAll('[data-debug-owner]');
    for (var i = 0; i < debugEls.length; i++) {
      var dbgEl = debugEls[i];
      if (!dbgEl || !dbgEl.dataset || !dbgEl.dataset.debugOwner) continue;
      try {
        var parsed = JSON.parse(dbgEl.dataset.debugOwner);
        if (parsed && String(parsed).trim() && String(parsed).trim() !== 'null') return String(parsed).trim();
      } catch (_e) {
        if (dbgEl.dataset.debugOwner && dbgEl.dataset.debugOwner !== 'null') {
          return String(dbgEl.dataset.debugOwner).replace(/"/g, '').trim();
        }
      }
    }

    if (window.Shopify && window.Shopify.customerId) {
      return String(window.Shopify.customerId).trim();
    }

    var ownerInput = document.querySelector('input[id^="ownerId-"]');
    if (ownerInput && ownerInput.value) return ownerInput.value.trim();

    return null;
  }

  window.showEazySnapRewardToast = function () {
    var wrap = document.getElementById('eazy-snap-reward-toast');
    if (wrap) { wrap.classList.remove('eazy-snap-reward-toast--show'); void wrap.offsetWidth; }
    wrap = document.getElementById('eazy-snap-reward-toast');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'eazy-snap-reward-toast';
      wrap.className = 'eazy-snap-reward-toast';
      wrap.innerHTML = '<div class="eazy-snap-reward-toast__inner"><div class="eazy-snap-reward-toast__glow"></div><div class="eazy-snap-reward-toast__coin"><img src="' + (window.EazCoinBrand && window.EazCoinBrand.urlEazv ? window.EazCoinBrand.urlEazv() : 'https://pub-2ffb11d4a361463498b9a842a87a870c.r2.dev/brand/coin/eaz-coin-logo.png') + '" alt="" width="48" height="48" data-eaz-coin="eazv"></div><span class="eazy-snap-reward-toast__value">+0.01</span><span class="eazy-snap-reward-toast__unit">EAZV</span><div class="eazy-snap-reward-toast__sparkles"><span></span><span></span><span></span><span></span><span></span><span></span></div></div>';
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    wrap.classList.add('eazy-snap-reward-toast--show');
    setTimeout(function () { wrap.classList.remove('eazy-snap-reward-toast--show'); }, 2200);
  };

  window.creditEazySnapReward = async function () {
    var ownerId = window.__EAZ_OWNER_ID;
    if (!ownerId) return false;
    try {
      var res = await window.creatorApiFetch('eazy-snap-reward', { owner_id: ownerId }, { method: 'POST' });
      if (res && res.ok && res.balance_after != null) {
        var el = document.getElementById('creator-footer-eaz-value');
        if (el) el.textContent = Number(res.balance_after).toFixed(2);
        window.__eazBalanceCache.value = res.balance_after;
        window.__eazBalanceCache.timestamp = Date.now();
        return true;
      }
    } catch (e) { if (e && e.body) console.warn('[creditEazySnapReward]', e.status, e.body); }
    return false;
  };

  if (typeof window.creatorApiFetch !== 'function') {
    window.creatorApiFetch = async function (operation, params, options) {
      var url = new URL(window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch');
      url.searchParams.set('op', operation);
      if (!options || !options.method || options.method === 'GET') url.searchParams.set('_t', Date.now());
      Object.keys(params || {}).forEach(function (key) {
        var val = params[key];
        if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
      });
      var oidFallback = resolveOwnerId();
      if (oidFallback && !url.searchParams.has('logged_in_customer_id')) {
        url.searchParams.set('logged_in_customer_id', oidFallback);
      }
      if (oidFallback && !url.searchParams.has('owner_id')) {
        url.searchParams.set('owner_id', oidFallback);
      }
      var fetchOpts = { credentials: 'include', cache: 'no-store' };
      if (options) Object.assign(fetchOpts, options);
      var method = String((fetchOpts.method || 'GET')).toUpperCase();
      var idempotent = method === 'GET' || method === 'HEAD';
      var attempts = idempotent ? 3 : 1;
      var lastErr = null;
      for (var attempt = 1; attempt <= attempts; attempt++) {
        try {
          var res = await fetch(url.toString(), fetchOpts);
          var data = await res.json().catch(function () { return {}; });
          if (!res.ok) {
            var err = new Error('HTTP ' + res.status);
            err.status = res.status;
            err.body = data;
            if (idempotent && (res.status >= 500 || res.status === 429) && attempt < attempts) {
              lastErr = err;
              await new Promise(function (r) { setTimeout(r, 200 * attempt); });
              continue;
            }
            throw err;
          }
          return data;
        } catch (e) {
          lastErr = e;
          if (e.body) console.warn('[creatorApiFetch]', operation, 'Error:', e.status, e.body);
          if (idempotent && attempt < attempts && (!e.status || e.status >= 500 || e.status === 429)) {
            await new Promise(function (r) { setTimeout(r, 200 * attempt); });
            continue;
          }
          throw e;
        }
      }
      throw lastErr || new Error('HTTP failed');
    };
  }

  function formatCurrencySymbol(code) {
    if (!code) return '€';
    var c = String(code).toUpperCase();
    if (c === 'EUR') return '€';
    if (c === 'USD') return '$';
    if (c === 'GBP') return '£';
    if (c === 'CHF') return 'CHF ';
    return c + ' ';
  }

  function applySalesPayoutToDom(formatted, symbol, balanceEl, desktopSalesEl, unitEls) {
    if (balanceEl) {
      balanceEl.textContent = formatted;
      balanceEl.style.color = '';
    }
    if (desktopSalesEl) {
      desktopSalesEl.textContent = formatted;
      desktopSalesEl.style.color = '';
    }
    unitEls.forEach(function (u) {
      u.textContent = symbol;
    });
    document.querySelectorAll('.creator-desktop-header [data-sales-balance-unit]').forEach(function (u) {
      u.textContent = symbol;
    });
  }

  function clearSalesPayoutDom(balanceEl, desktopSalesEl, unitEls) {
    if (balanceEl) balanceEl.textContent = '—';
    if (desktopSalesEl) desktopSalesEl.textContent = '—';
    unitEls.forEach(function (u) {
      u.textContent = '';
    });
    document.querySelectorAll('.creator-desktop-header [data-sales-balance-unit]').forEach(function (u) {
      u.textContent = '';
    });
  }

  // Sales/payout balance (EUR etc.) — do NOT use window.loadCreatorBalance (EAZ) from creator-api-helper.liquid
  window.loadCreatorSalesBalance = async function (retryCount) {
      retryCount = retryCount || 0;
      var balanceEl = document.getElementById('global-sales-balance-value');
      var desktopSalesEl = document.getElementById('creator-desktop-sales-balance-value');
      var unitEls = document.querySelectorAll('[data-sales-balance-unit]');
      if (!balanceEl && !desktopSalesEl && unitEls.length === 0) return;
      var ownerId = resolveOwnerId();
      if (!ownerId) {
        if (retryCount < 5) setTimeout(function () { window.loadCreatorSalesBalance(retryCount + 1); }, 500 * (retryCount + 1));
        else clearSalesPayoutDom(balanceEl, desktopSalesEl, unitEls);
        return;
      }
      window.__EAZ_OWNER_ID = ownerId;
      if (window.__salesBalanceCache.loading && retryCount === 0) {
        await window.__salesBalanceCache.loading;
        return;
      }
      if (
        retryCount === 0 &&
        window.__salesBalanceCache.timestamp &&
        Date.now() - window.__salesBalanceCache.timestamp < BALANCE_CACHE_MS &&
        window.__salesBalanceCache.amount != null
      ) {
        var cachedAmt = Number(window.__salesBalanceCache.amount);
        var cachedCur = window.__salesBalanceCache.currency || 'EUR';
        var cachedSym = formatCurrencySymbol(cachedCur);
        var cachedFmt = cachedAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        applySalesPayoutToDom(cachedFmt, cachedSym, balanceEl, desktopSalesEl, unitEls);
        return;
      }
      window.__salesBalanceCache.loading = (async function () {
        try {
          var data = await Promise.race([
            window.creatorApiFetch('get-creator-payout-overview', { owner_id: ownerId, days: 90 }),
            new Promise(function (_, reject) {
              setTimeout(function () { reject(new Error('balance_timeout')); }, 12000);
            })
          ]);
          if (data && data.ok !== false) {
            var amount = data.availableAmount != null ? Number(data.availableAmount) : 0;
            var currency = data.currency || 'EUR';
            var symbol = formatCurrencySymbol(currency);
            var formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            applySalesPayoutToDom(formatted, symbol, balanceEl, desktopSalesEl, unitEls);
            window.__salesBalanceCache.amount = amount;
            window.__salesBalanceCache.currency = currency;
            window.__salesBalanceCache.timestamp = Date.now();
            window.dispatchEvent(new CustomEvent('eazBalanceUpdated', { detail: { balance: amount, currency: currency } }));
          } else {
            clearSalesPayoutDom(balanceEl, desktopSalesEl, unitEls);
          }
        } catch (e) {
          clearSalesPayoutDom(balanceEl, desktopSalesEl, unitEls);
          if (retryCount < 3) {
            setTimeout(function () { window.loadCreatorSalesBalance(retryCount + 1); }, 2500);
          }
        }
        window.__salesBalanceCache.loading = null;
      })();
      await window.__salesBalanceCache.loading;
    };

  function footerEazValueEl() {
    return document.getElementById('creator-footer-eaz-value') ||
      document.getElementById('creator-desktop-eaz-value');
  }

  function hasFooterEazStrip() {
    return !!(
      footerEazValueEl() ||
      document.getElementById('creatorDesktopEazBalance') ||
      document.querySelector('.creator-global-footer__balance--eaz')
    );
  }

  function applyFooterEazValue(data) {
    var el = footerEazValueEl();
    if (!el || !data || data.ok === false) return;
    if (typeof window.applyCreatorFooterStarterUi === 'function') {
      window.applyCreatorFooterStarterUi(data);
    }
    if (data.eaz_wallet_active === false && data.is_creator !== true) {
      return;
    }
    if (data.eaz_wallet_active === false) {
      el.textContent = '—';
      el.style.color = '';
      return;
    }
    var raw = data.balance_eazg != null
      ? data.balance_eazg
      : (data.balance_free != null && data.balance_purchased != null
        ? Number(data.balance_free || 0) + Number(data.balance_purchased || 0)
        : (data.balance_total != null ? data.balance_total : data.balance_eaz));
    var v = raw != null ? raw : 0;
    el.textContent = Number(v).toFixed(2);
    el.style.color = '';
    window.__eazBalanceCache.value = v;
    window.__eazBalanceCache.timestamp = Date.now();
    window.__eazBalanceCache.eazcAvailable =
      data.balance_eazc_available != null
        ? Number(data.balance_eazc_available)
        : Number(data.balance_earned_available || 0);
  }

  function loadCreatorEazBalance(retryCount) {
    if (typeof window.loadCreatorBalance === 'function') {
      return window.loadCreatorBalance(retryCount || 0);
    }
  }

  window.reloadCreatorFooterEazBalance = function () {
    window.__eazBalanceCache.loading = null;
    window.__eazBalanceCache.timestamp = 0;
    loadCreatorEazBalance(0);
  };

  window.reloadCreatorDashboardBalances = function () {
    window.__salesBalanceCache.loading = null;
    window.__salesBalanceCache.timestamp = 0;
    window.__eazBalanceCache.loading = null;
    window.__eazBalanceCache.timestamp = 0;
    if (typeof window.loadCreatorSalesBalance === 'function') {
      window.loadCreatorSalesBalance(0);
    }
    loadCreatorEazBalance(0);
  };

  window.loadCreatorEazBalance = loadCreatorEazBalance;

  document.addEventListener('eaz:creator-redeemed', function () {
    window.reloadCreatorFooterEazBalance();
  });

  function scheduleEazBalanceRefreshAfterJob() {
    if (typeof window.reloadCreatorFooterEazBalance === 'function') {
      window.reloadCreatorFooterEazBalance();
    }
    setTimeout(function () {
      if (typeof window.reloadCreatorFooterEazBalance === 'function') {
        window.reloadCreatorFooterEazBalance();
      }
    }, 8000);
  }

  document.addEventListener('creatorJobCompleted', scheduleEazBalanceRefreshAfterJob);
  document.addEventListener('creatorSaveJobStarted', scheduleEazBalanceRefreshAfterJob);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      var owner = resolveOwnerId();
      if (owner) window.__EAZ_OWNER_ID = owner;
      if (typeof window.loadCreatorSalesBalance === 'function') {
        window.loadCreatorSalesBalance();
      }
      loadCreatorEazBalance();
    });
  } else {
    setTimeout(function () {
      var owner = resolveOwnerId();
      if (owner) window.__EAZ_OWNER_ID = owner;
      if (typeof window.loadCreatorSalesBalance === 'function') {
        window.loadCreatorSalesBalance();
      }
      loadCreatorEazBalance();
    }, 120);
  }
})();
