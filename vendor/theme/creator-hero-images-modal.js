/**
 * Hero Images fullscreen modal (IDEA-039)
 */
(function () {
  'use strict';

  var root = null;
  var closeBtn = null;
  var isOpen = false;

  function getRoot() {
    if (!root) root = document.getElementById('creatorHeroImagesModal');
    return root;
  }

  function open() {
    var el = getRoot();
    if (!el) return;
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.documentElement.classList.add('chim-modal-open');

    if (window.ContentCreationHero && typeof window.ContentCreationHero.scanHosts === 'function') {
      window.ContentCreationHero.scanHosts();
    }
    if (window.ContentCreationHero && typeof window.ContentCreationHero.maybeScheduleAutoPick === 'function') {
      window.ContentCreationHero.maybeScheduleAutoPick();
    } else if (typeof window.eazMaybeScheduleHeroMarketingAutoPick === 'function') {
      window.eazMaybeScheduleHeroMarketingAutoPick();
    }
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }

    try {
      document.dispatchEvent(new CustomEvent('creator-hero-images-modal-open'));
    } catch (e) {}
  }

  function close() {
    var el = getRoot();
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.documentElement.classList.remove('chim-modal-open');
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    }
    try {
      document.dispatchEvent(new CustomEvent('creator-hero-images-modal-close'));
    } catch (e) {}
  }

  function isModalOpen() {
    var el = getRoot();
    return !!(el && !el.hidden && isOpen);
  }

  function bind() {
    root = getRoot();
    if (!root || root.getAttribute('data-chim-bound') === '1') return;
    root.setAttribute('data-chim-bound', '1');
    closeBtn = document.getElementById('chim-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        close();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isModalOpen()) {
        close();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.CreatorHeroImagesModal = {
    open: open,
    close: close,
    isOpen: isModalOpen
  };
})();
