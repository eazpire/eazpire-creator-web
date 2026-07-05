/**
 * Syncs Eazy mascot + bubble for /pages/content-creation (hero-images-content + hero-images-upload).
 * Marketing hero uses creator-content-creation-hero.js instead; this file only targets .hero-images-eazy-bridge-root.
 */
(function () {
  'use strict';

  function syncEazyLegacy() {
    var root = document.querySelector('.hero-images-eazy-bridge-root.creator-hero-create-context');
    if (!root) return;
    var footer = root.querySelector('.creator-hero-eazy-footer');
    var btn = root.querySelector('[data-creator-hero-eazy-start]');
    var wrap = root.querySelector('[data-creator-hero-eazy-bubble-wrap]');
    if (!footer || !btn) return;

    var sp = window.selectedHeroProducts || {};
    var hasProducts = !!(sp.top || sp.addition);
    var ready = hasProducts;

    footer.classList.toggle('creator-hero-eazy-footer--ready', ready);
    if (wrap) wrap.setAttribute('aria-hidden', ready ? 'false' : 'true');
    btn.disabled = !ready;
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    } else {
      var mascot = document.getElementById('eazy-mascot');
      var inner = mascot && mascot.querySelector('.eazy-mascot__inner');
      if (inner) inner.classList.toggle('eazy-mascot__inner--look-left', !!ready);
    }
  }

  function onBubbleClick(e) {
    var gen = document.getElementById('hero-generate-btn');
    if (!gen || gen.disabled) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    gen.click();
  }

  function bindLegacyEazy() {
    var root = document.querySelector('.hero-images-eazy-bridge-root.creator-hero-create-context');
    if (!root || root.dataset.eazyLegacyBridgeBound === '1') return;
    root.dataset.eazyLegacyBridgeBound = '1';

    var btn = root.querySelector('[data-creator-hero-eazy-start]');
    if (btn) btn.addEventListener('click', onBubbleClick);

    var pe = document.getElementById('hero-additional-prompt');
    if (pe) {
      pe.addEventListener('input', syncEazyLegacy);
      pe.addEventListener('keyup', syncEazyLegacy);
    }

    document.addEventListener('categorySelectionChanged', syncEazyLegacy);
    document.addEventListener('heroLocalUploadPreviewChanged', syncEazyLegacy);

    document.addEventListener(
      'click',
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest('.content-creation-tab-btn')) {
          setTimeout(syncEazyLegacy, 0);
        }
      },
      true
    );

    syncEazyLegacy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLegacyEazy);
  } else {
    bindLegacyEazy();
  }

  window.HeroEazyLegacyBridge = { sync: syncEazyLegacy, bind: bindLegacyEazy };
})();
