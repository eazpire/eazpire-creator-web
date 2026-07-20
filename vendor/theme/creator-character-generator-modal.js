/**
 * Character Generator fullscreen modal shell (IDEA-044)
 */
(function () {
  'use strict';

  var root = null;
  var closeBtn = null;
  var isOpen = false;

  function getRoot() {
    root = document.getElementById('creatorCharacterGeneratorModal');
    return root;
  }

  function bindShell() {
    var el = getRoot();
    if (!el || el.getAttribute('data-ccg-bound') === '1') return;
    el.setAttribute('data-ccg-bound', '1');
    closeBtn = document.getElementById('ccg-modal-close');
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

  function open() {
    bindShell();
    var el = getRoot();
    if (!el) {
      console.error('[CreatorCharacterGeneratorModal] root missing');
      return;
    }
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.documentElement.classList.add('chim-modal-open');
    document.documentElement.classList.add('ccg-modal-open');

    try {
      if (window.ContentCreationCharacter && typeof window.ContentCreationCharacter.scanHosts === 'function') {
        window.ContentCreationCharacter.scanHosts();
      } else {
        console.warn('[CreatorCharacterGeneratorModal] ContentCreationCharacter.scanHosts unavailable');
      }
    } catch (err) {
      console.error('[CreatorCharacterGeneratorModal] scanHosts error', err);
    }

    try {
      document.dispatchEvent(new CustomEvent('creator-character-generator-modal-open'));
    } catch (e) {}
  }

  function close() {
    var el = getRoot();
    if (!el) return;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.documentElement.classList.remove('ccg-modal-open');
    var hero = document.getElementById('creatorHeroImagesModal');
    if (!hero || hero.hidden) {
      document.documentElement.classList.remove('chim-modal-open');
    }
    try {
      document.dispatchEvent(new CustomEvent('creator-character-generator-modal-close'));
    } catch (e) {}
  }

  function isModalOpen() {
    var el = getRoot();
    return !!(el && !el.hidden && isOpen);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindShell);
  } else {
    bindShell();
  }

  window.CreatorCharacterGeneratorModal = {
    open: open,
    close: close,
    isOpen: isModalOpen,
  };
})();
