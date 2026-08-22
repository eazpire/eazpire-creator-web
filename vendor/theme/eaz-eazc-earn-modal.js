/**
 * EAZC header badge + fullscreen How-you-earn modal.
 * Sales EAZC only (no Move / Daily EAZG).
 */
(function () {
  'use strict';

  if (window.__EAZC_EARN_MODAL_BOUND) return;
  window.__EAZC_EARN_MODAL_BOUND = true;

  function modalEl() {
    return document.getElementById('eazcEarnModal');
  }

  var dialogClickBound = false;
  function bindDialogDismiss() {
    var dialog = modalEl();
    if (!dialog || dialogClickBound) return;
    dialogClickBound = true;
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closeModal();
    });
  }

  function openModal() {
    bindDialogDismiss();
    var el = modalEl();
    if (!el) return;
    if (typeof el.showModal === 'function') {
      if (!el.open) el.showModal();
    } else {
      el.setAttribute('open', '');
    }
    document.documentElement.classList.add('eaz-eazc-earn-open');
  }

  function closeModal() {
    var el = modalEl();
    if (!el) return;
    if (typeof el.close === 'function' && el.open) el.close();
    else el.removeAttribute('open');
    document.documentElement.classList.remove('eaz-eazc-earn-open');
  }

  window.openEazcEarnModal = openModal;
  window.closeEazcEarnModal = closeModal;

  function fmtHeaderEazc(n) {
    var v = Number(n);
    if (!Number.isFinite(v) || v < 0) v = 0;
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }

  function headerEazcFromPayload(data) {
    if (!data || data.ok === false) return 0;
    if (data.balance_eazc_header != null && Number.isFinite(Number(data.balance_eazc_header))) {
      return Number(data.balance_eazc_header);
    }
    var avail = Number(
      data.balance_eazc_available != null ? data.balance_eazc_available : data.balance_earned_available || 0
    );
    var locked = Number(
      data.balance_eazc_locked != null ? data.balance_eazc_locked : data.balance_earned_locked || 0
    );
    if (!Number.isFinite(avail)) avail = 0;
    if (!Number.isFinite(locked)) locked = 0;
    return avail + locked;
  }

  function applyAllBadgeValues(formatted) {
    document.querySelectorAll('[data-sales-balance-value]').forEach(function (el) {
      el.textContent = formatted;
      el.dataset.eazcHeader = '1';
    });
    document.querySelectorAll('[data-sales-balance-unit]').forEach(function (el) {
      el.textContent = 'EAZC';
    });
  }

  window.applyCreatorHeaderEazcBalance = window.applyCreatorHeaderEazcBalance || function (amountOrPayload) {
    var amount =
      amountOrPayload != null && typeof amountOrPayload === 'object'
        ? headerEazcFromPayload(amountOrPayload)
        : Number(amountOrPayload);
    if (!Number.isFinite(amount) || amount < 0) amount = 0;
    var formatted = fmtHeaderEazc(amount);
    applyAllBadgeValues(formatted);
    window.__salesBalanceCache = window.__salesBalanceCache || {};
    window.__salesBalanceCache.amount = amount;
    window.__salesBalanceCache.currency = 'EAZC';
    window.__salesBalanceCache.timestamp = Date.now();
    return amount;
  };

  function dispatchBase() {
    try {
      if (window.CREATOR_API_CONFIG && typeof window.CREATOR_API_CONFIG.getDispatchUrl === 'function') {
        var via = window.CREATOR_API_CONFIG.getDispatchUrl();
        if (via) return String(via).replace(/\/+$/, '');
      }
    } catch (e0) {}
    try {
      var host = window.location && window.location.hostname;
      if (host === 'www.eazpire.com' || host === 'eazpire.com') {
        return String(window.location.origin || '').replace(/\/+$/, '') + '/__eaz/creator-dispatch';
      }
    } catch (e1) {}
    return 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  function resolveOwnerId() {
    var badge = document.querySelector('[data-eazc-owner]');
    if (badge) {
      var fromBadge = String(badge.getAttribute('data-eazc-owner') || '').trim();
      if (fromBadge && fromBadge !== 'null') return fromBadge;
    }
    if (typeof window._resolveEazOwnerId === 'function') {
      try {
        var resolved = window._resolveEazOwnerId();
        if (resolved != null && String(resolved).trim()) return String(resolved).trim();
      } catch (e2) {}
    }
    var candidates = [window.__EAZ_OWNER_ID, window.Shopify && window.Shopify.customerId];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] == null) continue;
      var id = String(candidates[i]).trim();
      if (id && id !== 'null') return id;
    }
    return '';
  }

  async function refreshShopBadges() {
    if (!document.querySelector('[data-eazc-badge]')) return;
    if (typeof window.loadCreatorSalesBalance === 'function') {
      try {
        await window.loadCreatorSalesBalance();
        return;
      } catch (e3) {}
    }
    var owner = resolveOwnerId();
    if (!owner) {
      applyAllBadgeValues('0');
      return;
    }
    var url = dispatchBase() + '?op=get-balance&owner_id=' + encodeURIComponent(owner) + '&_t=' + Date.now();
    try {
      var res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      var data = await res.json();
      if (typeof window.applyCreatorHeaderEazcBalance === 'function') {
        window.applyCreatorHeaderEazcBalance(data);
      } else {
        applyAllBadgeValues(fmtHeaderEazc(headerEazcFromPayload(data)));
      }
    } catch (e4) {
      /* keep loading text */
    }
  }

  document.addEventListener('click', function (e) {
    var info = e.target && e.target.closest && e.target.closest('[data-open-eazc-earn-modal]');
    if (info) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
      return;
    }
    if (e.target && e.target.closest && e.target.closest('[data-eazc-earn-close]')) {
      e.preventDefault();
      closeModal();
      return;
    }
    var main = e.target && e.target.closest && e.target.closest('[data-eazc-open-balance="1"]');
    if (main && typeof window.openSalesModal === 'function') {
      /* creator headers keep existing sales-modal open via their own listeners */
    }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  bindDialogDismiss();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshShopBadges);
  } else {
    refreshShopBadges();
  }
})();
