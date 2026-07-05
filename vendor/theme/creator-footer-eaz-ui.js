/**
 * Footer EAZ strip: trial Level 1 (no Creator Code) shows Starter Pack slots (generate/upload x/x).
 * After Creator Code redeem, creators use EAZ only — always show coin balance.
 */
(function () {
  'use strict';

  function isCreatorPayload(data) {
    return !!(data && (data.is_creator === true || data.is_creator === 1));
  }

  function isStarterFooterPayload(data) {
    if (!data || data.ok === false) return false;
    // Creators pay with EAZ — never show free generate/upload quotas in the footer.
    if (isCreatorPayload(data)) return false;
    if (data.eaz_wallet_active === true) return false;
    // Pre–Creator Code trial: show generate/upload slots until code unlocks EAZ (level 2+).
    return data.trial_generate_cap != null && data.trial_upload_cap != null;
  }

  function creatorBalancePayload() {
    return {
      ok: true,
      is_creator: true,
      eaz_wallet_active: true,
      trial_mode: false,
    };
  }

  window.applyCreatorFooterStarterUi = function (data) {
    var starter = isStarterFooterPayload(data);
    var wraps = [];
    var desk = document.getElementById('creatorDesktopEazBalance');
    if (desk) wraps.push(desk);
    document.querySelectorAll('.creator-global-footer__balance--eaz').forEach(function (el) {
      wraps.push(el);
    });

    wraps.forEach(function (wrap) {
      if (!wrap) return;
      wrap.setAttribute('data-footer-eaz-mode', starter ? 'starter' : 'balance');
      var norm = wrap.querySelector('[data-footer-eaz-normal]');
      var st = wrap.querySelector('[data-footer-eaz-starter]');
      if (norm) norm.hidden = starter;
      if (st) st.hidden = !starter;

      var ariaBal = wrap.getAttribute('data-footer-aria-balance') || '';
      var ariaStarter = wrap.getAttribute('data-footer-aria-starter') || '';
      if (starter && ariaStarter) wrap.setAttribute('aria-label', ariaStarter);
      else if (!starter && ariaBal) wrap.setAttribute('aria-label', ariaBal);

      if (!starter) return;

      var gu = Number(data.trial_generate_used || 0);
      var gc = Number(data.trial_generate_cap || 0);
      var uu = Number(data.trial_upload_used || 0);
      var uc = Number(data.trial_upload_cap || 0);
      var genEl = wrap.querySelector('[data-starter-gen-count]');
      var upEl = wrap.querySelector('[data-starter-upload-count]');
      if (genEl) genEl.textContent = gu + '/' + gc;
      if (upEl) upEl.textContent = uu + '/' + uc;
    });
  };

  function onCreatorActivated() {
    window.applyCreatorFooterStarterUi(creatorBalancePayload());
    if (typeof window.reloadCreatorFooterEazBalance === 'function') {
      window.reloadCreatorFooterEazBalance();
    }
  }

  document.addEventListener('eaz:creator-redeemed', onCreatorActivated);
  document.addEventListener('eaz:creator-code-state', function (e) {
    var detail = e && e.detail;
    if (detail && detail.is_creator) onCreatorActivated();
  });
})();
