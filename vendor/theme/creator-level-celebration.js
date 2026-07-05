/**
 * Creator dashboard — level badge pulse when XP allows level-up / celebration overlay.
 */
(function () {
  'use strict';

  var OVERLAY_ID = 'creatorLevelCelebrationOverlay';

  function i18n(key, fb) {
    var m = window.CreatorCelebrationI18n || {};
    return m[key] != null ? String(m[key]) : String(fb || '');
  }

  function ownerKeyPart() {
    var o = window.__EAZ_OWNER_ID;
    return o != null && String(o).trim() !== '' ? String(o).trim() : 'guest';
  }

  function ackStorageKey() {
    return 'creator_lvl_ack_' + ownerKeyPart();
  }

  function ensureAckBaseline(currentLevel) {
    var k = ackStorageKey();
    var cur = Number(currentLevel);
    if (!Number.isFinite(cur) || cur < 1) cur = 1;
    if (sessionStorage.getItem(k) == null) {
      sessionStorage.setItem(k, String(cur));
    }
  }

  function getAck() {
    var k = ackStorageKey();
    var raw = sessionStorage.getItem(k);
    return raw != null ? Number(raw) : null;
  }

  function setAck(level) {
    var L = Number(level);
    if (!Number.isFinite(L) || L < 1) return;
    sessionStorage.setItem(ackStorageKey(), String(L));
  }

  function applyPulseEl(el, pulse, pulseAria) {
    if (!el) return;
    el.classList.toggle('creator-level-badge--pulse', !!pulse);
    if (pulse) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute(
        'aria-label',
        pulseAria || i18n('badge_ready_aria', 'Level up available — press to continue.')
      );
    } else {
      el.removeAttribute('tabindex');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
    }
  }

  function syncBadgesPulse(pulse) {
    applyPulseEl(document.getElementById('creatorDesktopHeroLevelBadge'), pulse);
    applyPulseEl(document.getElementById('creator-mobile-level-root'), pulse);
  }

  /**
   * @param {object} levelPayload — get-level JSON
   * @param {{ levelName?: string }} extra
   */
  function syncFromApi(levelPayload, extra) {
    extra = extra || {};
    if (!levelPayload || levelPayload.ok === false) return;

    var trialMode = levelPayload.trial_mode === true;
    var cur = Number(levelPayload.current_level);
    if (!Number.isFinite(cur) || cur < 1) cur = 1;
    cur = Math.min(10, Math.floor(cur));

    var xpDer = Number(levelPayload.xp_derived_level);
    if (!Number.isFinite(xpDer)) xpDer = cur;

    ensureAckBaseline(cur);

    var ack = getAck();
    if (!Number.isFinite(ack)) ack = cur;

    var trialBlocked = trialMode && xpDer > cur && cur < 10;
    var creatorCelebrate = !trialMode && cur > ack && cur <= 10;

    var pulse = trialBlocked || creatorCelebrate;

    window.__creatorLevelPulseSnapshot = {
      pulse: pulse,
      trialBlocked: trialBlocked,
      celebrateLevel: creatorCelebrate ? cur : null,
      ackPending: creatorCelebrate ? ack : cur,
      levelName: extra.levelName || '',
      xpDerivedLevel: xpDer,
      currentLevel: cur,
    };

    syncBadgesPulse(pulse);
  }

  function closeOverlay() {
    var root = document.getElementById(OVERLAY_ID);
    if (!root) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.classList.remove('creator-level-celebration--blocked', 'creator-level-celebration--success');
    try {
      document.body.style.overflow = '';
    } catch (_e) {}
  }

  function openCreatorCodesTab() {
    if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === 'function') {
      window.CreatorSettingsV2Modal.open({ tab: 'creator-codes' });
    }
  }

  function openOverlay(mode, opts) {
    opts = opts || {};
    var root = document.getElementById(OVERLAY_ID);
    if (!root) return;

    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    root.classList.remove('creator-level-celebration--blocked', 'creator-level-celebration--success');
    root.classList.add(mode === 'blocked' ? 'creator-level-celebration--blocked' : 'creator-level-celebration--success');

    var titleEl = root.querySelector('[data-celebration-title]');
    var bodyEl = root.querySelector('[data-celebration-body]');
    var rowEl = root.querySelector('[data-celebration-level-row]');
    var oldNum = root.querySelector('[data-celebration-old-level]');
    var newNum = root.querySelector('[data-celebration-new-level]');
    var nameEl = root.querySelector('[data-celebration-level-name]');
    var cta = root.querySelector('[data-celebration-cta]');

    if (mode === 'blocked') {
      if (titleEl) {
        titleEl.textContent = i18n('blocked_title', 'Activate a Creator Code');
      }
      if (bodyEl) {
        bodyEl.textContent = i18n(
          'blocked_body',
          'You have enough XP for Level 2. Redeem a Creator Code first to unlock your Creator tier and continue leveling.'
        );
      }
      if (rowEl) rowEl.hidden = true;
      if (nameEl) nameEl.hidden = true;
      if (cta) {
        cta.hidden = false;
        cta.textContent = i18n('cta_creator_codes', 'Open Creator Codes');
        cta.onclick = function () {
          closeOverlay();
          openCreatorCodesTab();
        };
      }
    } else {
      if (titleEl) titleEl.textContent = i18n('celebrate_title', 'LEVEL UP!');
      if (bodyEl) bodyEl.textContent = i18n('celebrate_subtitle', 'You reached a new level!');
      var fromLv = opts.fromLevel != null ? Number(opts.fromLevel) : Number(opts.ackPending);
      var toLv = opts.toLevel != null ? Number(opts.toLevel) : Number(opts.celebrateLevel);
      if (!Number.isFinite(fromLv)) fromLv = Math.max(1, toLv - 1);
      if (!Number.isFinite(toLv)) toLv = fromLv + 1;

      if (rowEl) rowEl.hidden = false;
      if (oldNum) oldNum.textContent = String(fromLv);
      if (newNum) newNum.textContent = String(toLv);
      if (nameEl) {
        nameEl.hidden = false;
        nameEl.textContent = opts.levelName || '';
      }
      if (cta) {
        cta.hidden = true;
        cta.onclick = null;
      }
    }

    try {
      document.body.style.overflow = 'hidden';
    } catch (_e2) {}
  }

  function wireOverlayOnce() {
    var root = document.getElementById(OVERLAY_ID);
    if (!root || root.dataset.celebrationWired === '1') return;
    root.dataset.celebrationWired = '1';
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-level-celebration]')) {
        closeOverlay();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root && !root.hidden) closeOverlay();
    });
  }

  function handleBadgeActivate(targetEl, snap) {
    if (!snap || !snap.pulse) return false;

    if (snap.trialBlocked) {
      openOverlay('blocked', {});
      return true;
    }

    if (snap.celebrateLevel != null) {
      openOverlay('success', {
        celebrateLevel: snap.celebrateLevel,
        ackPending: snap.ackPending,
        fromLevel: snap.ackPending,
        toLevel: snap.celebrateLevel,
        levelName: snap.levelName || '',
      });
      setAck(snap.celebrateLevel);
      window.__creatorLevelPulseSnapshot = Object.assign({}, snap, {
        pulse: false,
        trialBlocked: false,
        celebrateLevel: null,
      });
      syncBadgesPulse(false);
      return true;
    }

    return false;
  }

  function attachBadge(el) {
    if (!el || el.dataset.levelCelebrateAttached === '1') return;
    el.dataset.levelCelebrateAttached = '1';

    el.addEventListener('click', function (e) {
      if (e.target.closest('.creator-journey-trigger')) return;
      if (e.target.closest('.creator-settings-trigger')) return;
      if (e.target.closest('#creator-desktop-xp-hint-info')) return;

      var snap = window.__creatorLevelPulseSnapshot;
      if (!snap || !snap.pulse) return;

      e.preventDefault();
      e.stopPropagation();

      handleBadgeActivate(el, snap);
    });

    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('.creator-journey-trigger')) return;
      if (e.target.closest('.creator-settings-trigger')) return;
      var snap = window.__creatorLevelPulseSnapshot;
      if (!snap || !snap.pulse) return;
      e.preventDefault();
      handleBadgeActivate(el, snap);
    });
  }

  function boot() {
    wireOverlayOnce();
    attachBadge(document.getElementById('creatorDesktopHeroLevelBadge'));
    attachBadge(document.getElementById('creator-mobile-level-root'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.CreatorLevelCelebration = {
    syncFromApi: syncFromApi,
    close: closeOverlay,
    ackStorageKey: ackStorageKey,
    setAck: setAck,
  };
})();
