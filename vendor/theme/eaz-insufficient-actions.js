/**
 * Shared INSUFFICIENT_EAZ UX — Option A contextual convert EAZC → EAZG.
 */
(function () {
  'use strict';

  var MODAL_ID = 'eaz-insufficient-modal';

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  function tpl(str, map) {
    var out = String(str || '');
    Object.keys(map || {}).forEach(function (k) {
      out = out.replace(new RegExp('\\{\\{\\s*' + k + '\\s*\\}\\}', 'g'), String(map[k]));
    });
    return out;
  }

  function fmtEaz(n) {
    if (n == null || !isFinite(Number(n))) return '0';
    var v = Number(n);
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }

  function ownerId() {
    if (typeof window._resolveEazOwnerId === 'function') return window._resolveEazOwnerId();
    return window.__EAZ_OWNER_ID || null;
  }

  function ensureModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'eaz-insufficient-modal';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="eaz-insufficient-modal__backdrop" data-eaz-insufficient-close></div>' +
      '<div class="eaz-insufficient-modal__panel" role="dialog" aria-modal="true" aria-labelledby="eazInsufficientTitle">' +
      '<h3 class="eaz-insufficient-modal__title" id="eazInsufficientTitle"></h3>' +
      '<p class="eaz-insufficient-modal__body" id="eazInsufficientBody"></p>' +
      '<div class="eaz-insufficient-modal__actions" id="eazInsufficientActions"></div>' +
      '<button type="button" class="eaz-insufficient-modal__close" data-eaz-insufficient-close>' +
      (t('eaz_insufficient_close', 'Close') || 'Close') +
      '</button></div>';
    document.body.appendChild(wrap);
    wrap.querySelectorAll('[data-eaz-insufficient-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        wrap.hidden = true;
      });
    });
    return wrap;
  }

  function openEazWallet(sub) {
    if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
      window.CreatorSettingsV2Modal.open({ tab: 'eaz', eazSub: sub || 'balance' });
      return;
    }
    if (window.location && window.location.hash !== '#creator-settings') {
      window.location.hash = 'creator-settings';
    }
  }

  async function convertAndRetry(amount, onRetry) {
    var oid = ownerId();
    if (!oid || !amount || amount < 1) return false;
    try {
      if (typeof window.creatorApiFetch !== 'function') return false;
      var res = await window.creatorApiFetch(
        'convert-eazc-to-eazg',
        {},
        {
          method: 'POST',
          body: {
            owner_id: oid,
            amount_eaz: amount,
            context_shortfall: true,
          },
        }
      );
      if (!res || !res.ok) return false;
      if (typeof window.reloadCreatorFooterEazBalance === 'function') {
        window.reloadCreatorFooterEazBalance();
      }
      if (window.CreatorSettingsEazPanel && typeof window.CreatorSettingsEazPanel.refresh === 'function') {
        window.CreatorSettingsEazPanel.refresh();
      }
      if (typeof onRetry === 'function') {
        await onRetry();
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  function show(opts) {
    opts = opts || {};
    var payload = opts.errorPayload || {};
    var required = Number(opts.required != null ? opts.required : payload.required || 0);
    var have = Number(
      payload.balance_eazg != null ? payload.balance_eazg : payload.balance_eaz || 0
    );
    var eazcAvail = Number(
      payload.balance_eazc_available != null
        ? payload.balance_eazc_available
        : payload.balance_earned_available || 0
    );
    var shortfall = Math.max(0, Math.round((required - have) * 100) / 100);
    var convertAmount = Math.max(1, shortfall);
    var canConvert = eazcAvail >= convertAmount && convertAmount >= 1;

    var modal = ensureModal();
    var titleEl = document.getElementById('eazInsufficientTitle');
    var bodyEl = document.getElementById('eazInsufficientBody');
    var actionsEl = document.getElementById('eazInsufficientActions');
    if (!titleEl || !bodyEl || !actionsEl) return;

    titleEl.textContent = t('eaz_insufficient_title', 'Not enough EAZG');
    bodyEl.textContent = tpl(t('eaz_insufficient_need_have', 'Need {{required}} EAZG · you have {{have}} EAZG'), {
      required: fmtEaz(required),
      have: fmtEaz(have),
    });

    actionsEl.innerHTML = '';

    if (canConvert) {
      var convertBtn = document.createElement('button');
      convertBtn.type = 'button';
      convertBtn.className = 'eaz-insufficient-modal__btn eaz-insufficient-modal__btn--primary';
      convertBtn.textContent = tpl(
        t('eaz_insufficient_convert_and_retry', 'Convert and retry'),
        { amount: fmtEaz(convertAmount) }
      );
      convertBtn.addEventListener('click', async function () {
        convertBtn.disabled = true;
        var ok = await convertAndRetry(convertAmount, opts.onRetry);
        convertBtn.disabled = false;
        if (ok) modal.hidden = true;
        else alert(t('eaz_convert_fail', 'Conversion failed.'));
      });
      actionsEl.appendChild(convertBtn);
    }

    var buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'eaz-insufficient-modal__btn';
    buyBtn.textContent = t('eaz_insufficient_buy_eazg', 'Buy EAZG packs');
    buyBtn.addEventListener('click', function () {
      modal.hidden = true;
      openEazWallet('buy');
    });
    actionsEl.appendChild(buyBtn);

    var walletBtn = document.createElement('button');
    walletBtn.type = 'button';
    walletBtn.className = 'eaz-insufficient-modal__btn eaz-insufficient-modal__btn--ghost';
    walletBtn.textContent = t('eaz_insufficient_open_wallet', 'Open EAZ wallet');
    walletBtn.addEventListener('click', function () {
      modal.hidden = true;
      openEazWallet('balance');
    });
    actionsEl.appendChild(walletBtn);

    modal.hidden = false;
  }

  window.EazInsufficientActions = { show: show, convertAndRetry: convertAndRetry };
})();
