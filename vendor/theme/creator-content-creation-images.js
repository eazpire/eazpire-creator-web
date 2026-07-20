/**
 * Content Creation – Images tools grid (Hero Generator + Character Generator)
 * IDEA-044 — same card style as Video Studio / Video Generator
 */
(function () {
  'use strict';

  function isBadTranslationString(s) {
    if (typeof s !== 'string') return true;
    var t = s.toLowerCase();
    if (!t) return true;
    return (
      t.indexOf('translation missing') !== -1 ||
      t.indexOf('übersetzung fehlt') !== -1 ||
      t.indexOf('traduction manquante') !== -1
    );
  }

  function i18n(key, fallback) {
    try {
      var hz = window.CreatorI18n && window.CreatorI18n.content_creation_images;
      if (hz && hz[key] != null && !isBadTranslationString(String(hz[key]))) return String(hz[key]);
      var m = window.CreatorI18n && window.CreatorI18n.marketing;
      if (m && m[key] != null && !isBadTranslationString(String(m[key]))) return String(m[key]);
    } catch (e) {}
    return fallback;
  }

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function render(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="creator-video-tools-grid" data-creator-images-tools-grid>' +
      '<button type="button" class="creator-video-tool-card" data-creator-hero-generator-open data-mkt-function="hero-generator">' +
      '<span class="creator-video-tool-card__icon" aria-hidden="true">🖼️</span>' +
      '<span class="creator-video-tool-card__title">' +
      escapeAttr(i18n('tool_hero_generator', 'Hero Generator')) +
      '</span>' +
      '<span class="creator-video-tool-card__desc">' +
      escapeAttr(i18n('tool_hero_generator_desc', 'Create shop hero images with your products.')) +
      '</span>' +
      '</button>' +
      '<button type="button" class="creator-video-tool-card" data-creator-character-generator-open data-mkt-function="character-generator">' +
      '<span class="creator-video-tool-card__icon" aria-hidden="true">🧑</span>' +
      '<span class="creator-video-tool-card__title">' +
      escapeAttr(i18n('tool_character_generator', 'Character Generator')) +
      '</span>' +
      '<span class="creator-video-tool-card__desc">' +
      escapeAttr(i18n('tool_character_generator_desc', 'Create character images for video and social posts.')) +
      '</span>' +
      '</button>' +
      '</div>';
  }

  function bind(container) {
    if (!container || container.getAttribute('data-images-tools-bound') === '1') return;
    container.setAttribute('data-images-tools-bound', '1');
    container.addEventListener('click', function (e) {
      var heroBtn = e.target && e.target.closest ? e.target.closest('[data-creator-hero-generator-open]') : null;
      if (heroBtn && container.contains(heroBtn)) {
        e.preventDefault();
        if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.open === 'function') {
          window.CreatorHeroImagesModal.open();
        }
        return;
      }
      var charBtn = e.target && e.target.closest ? e.target.closest('[data-creator-character-generator-open]') : null;
      if (charBtn && container.contains(charBtn)) {
        e.preventDefault();
        if (window.CreatorCharacterGeneratorModal && typeof window.CreatorCharacterGeneratorModal.open === 'function') {
          window.CreatorCharacterGeneratorModal.open();
        }
      }
    });
  }

  function setupHost(el) {
    if (!el) return;
    render(el);
    bind(el);
  }

  function scanHosts() {
    document.querySelectorAll('[data-creator-images-host]').forEach(setupHost);
  }

  function init() {
    scanHosts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ContentCreationImages = {
    scanHosts: scanHosts,
    render: render,
  };
})();
