/**
 * Character Generator fullscreen modal shell (IDEA-044)
 */
(function () {
  'use strict';

  var root = null;
  var closeBtn = null;
  var isOpen = false;

  function getRoot() {
    if (!root) root = document.getElementById('creatorCharacterGeneratorModal');
    return root;
  }

  function open() {
    var el = getRoot();
    if (!el) return;
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.documentElement.classList.add('chim-modal-open');
    document.documentElement.classList.add('ccg-modal-open');

    if (window.ContentCreationCharacter && typeof window.ContentCreationCharacter.scanHosts === 'function') {
      window.ContentCreationCharacter.scanHosts();
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
    if (!document.getElementById('creatorHeroImagesModal') || document.getElementById('creatorHeroImagesModal').hidden) {
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

  function bind() {
    root = getRoot();
    if (!root || root.getAttribute('data-ccg-bound') === '1') return;
    root.setAttribute('data-ccg-bound', '1');
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.CreatorCharacterGeneratorModal = {
    open: open,
    close: close,
    isOpen: isModalOpen,
  };
})();
