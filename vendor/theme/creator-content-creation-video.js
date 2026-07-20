/**
 * Content Creation – Marketing Videos (products, image source, Kling-style options, prompt + Eazy)
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  window.selectedVideoProducts = window.selectedVideoProducts || { top: null, addition: null };
  window.selectedVideoRegion = window.selectedVideoRegion || (
    window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveFromShopContext === 'function'
      ? window.CreatorHeroRegions.resolveFromShopContext()
      : 'EU'
  );
  var videoSourceImageUrl = null;
  /** Reference motion clip URL (Kling motion control) after upload to worker R2 */
  var videoMotionReferenceUrl = null;
  var videoEazyContexts = [];
  window.selectedMotionCharacterProducts = window.selectedMotionCharacterProducts || { top: null, addition: null };
  /** Per-bind draft for content-publish product generation (stored on ctx in setup). */

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
      var hz = window.CreatorI18n && window.CreatorI18n.content_creation_videos;
      if (hz && hz[key] != null && !isBadTranslationString(String(hz[key]))) return String(hz[key]);
      if (window.CreatorI18n && window.CreatorI18n[key] != null && !isBadTranslationString(String(window.CreatorI18n[key]))) {
        return String(window.CreatorI18n[key]);
      }
    } catch (e) {}
    return fallback;
  }

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) return String(window.__EAZ_OWNER_ID);
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  function getEazyFooter(ctx) {
    if (!ctx || !ctx.contextEl) return null;
    return ctx.contextEl.querySelector('.creator-video-eazy-footer');
  }

  function hasAtLeastOneVideoInput(ctx) {
    if (!ctx || !ctx.container) return false;
    var selected = window.selectedVideoProducts || {};
    var arr = [];
    if (selected.top) arr.push(selected.top);
    if (selected.addition) arr.push(selected.addition);
    var hasProducts = arr.length > 0;
    var hasImage = !!videoSourceImageUrl;
    var pe = ctx.container.querySelector('[data-creator-video-prompt]');
    var hasPrompt = !!(pe && String(pe.value || '').trim());
    return hasProducts || hasImage || hasPrompt;
  }

  function getVideoContentType(container) {
    var typeEl = container && container.querySelector('[data-creator-video-content-type]');
    var t = typeEl ? String(typeEl.value || 'video_generation').trim() : 'video_generation';
    return t;
  }

  /** Eazy “ready”: video/avatar — any of product, reference image, or prompt. Motion control — motion clip plus character (product or reference image); prompt optional. */
  function isVideoEazyReady(ctx) {
    if (!ctx || !ctx.container) return false;
    var selected = window.selectedVideoProducts || {};
    var arr = [];
    if (selected.top) arr.push(selected.top);
    if (selected.addition) arr.push(selected.addition);
    var hasProducts = arr.length > 0;
    var hasImage = !!videoSourceImageUrl;
    if (getVideoContentType(ctx.container) === 'motion_control') {
      var hasMotion = !!(videoMotionReferenceUrl && String(videoMotionReferenceUrl).trim());
      return hasMotion && (hasProducts || hasImage);
    }
    return hasAtLeastOneVideoInput(ctx);
  }

  function updateEazyVideoUi(ctx) {
    var footer = getEazyFooter(ctx);
    var bubbleBtn = ctx && ctx.eazyStartBtn;
    if (!footer || !bubbleBtn) return;

    var ready = isVideoEazyReady(ctx);

    footer.classList.toggle('creator-video-eazy-footer--ready', ready);
    var bubbleWrap = ctx.eazyBubbleWrap;
    if (bubbleWrap) bubbleWrap.setAttribute('aria-hidden', ready ? 'false' : 'true');

    bubbleBtn.disabled = !ready;
    if (typeof window.syncCreatorMobileEazyLookLeft === 'function') {
      window.syncCreatorMobileEazyLookLeft();
    } else {
      var mascot = document.getElementById('eazy-mascot');
      var inner = mascot && mascot.querySelector('.eazy-mascot__inner');
      if (inner) inner.classList.toggle('eazy-mascot__inner--look-left', !!ready);
    }
  }

  function render(container) {
    if (!container) return;
    container.innerHTML =
      '<div class="creator-video-tools-grid" data-creator-video-tools-grid>' +
      '<button type="button" class="creator-video-tool-card" data-creator-video-studio-open>' +
      '<span class="creator-video-tool-card__icon" aria-hidden="true">🎞️</span>' +
      '<span class="creator-video-tool-card__title">' + escapeAttr(i18n('tool_video_studio', 'Video Studio')) + '</span>' +
      '<span class="creator-video-tool-card__desc">' + escapeAttr(i18n('tool_video_studio_desc', 'Edit clips on a timeline, crop, mix audio, and export.')) + '</span>' +
      '</button>' +
      '<button type="button" class="creator-video-tool-card" data-creator-video-generator-open>' +
      '<span class="creator-video-tool-card__icon" aria-hidden="true">✨</span>' +
      '<span class="creator-video-tool-card__title">' + escapeAttr(i18n('tool_video_generator', 'Video Generator')) + '</span>' +
      '<span class="creator-video-tool-card__desc">' + escapeAttr(i18n('tool_video_generator_desc', 'Generate videos with Motion Control and more AI tools.')) + '</span>' +
      '</button>' +
      '</div>';
  }

  /** @deprecated Legacy form markup kept for reference / future re-enable of inline settings. */
  function renderLegacyVideoForm(container) {
    if (!container) return;
    var motionInfoBodyId = 'creator-motion-info-' + String(container.id || ('x' + Math.random().toString(36).slice(2, 11))).replace(/[^a-zA-Z0-9_-]/g, '-');
    var charDlg = 'cvc-char-' + String(container.id || ('x' + Math.random().toString(36).slice(2, 11))).replace(/[^a-zA-Z0-9_-]/g, '-');
    container.innerHTML =
      '<div class="creator-hero-upload-container creator-video-upload-root">' +

      '<details class="creator-video-details" open data-creator-video-details="settings">' +
      '<summary class="creator-video-details__summary">' +
      '<span class="creator-video-details__title">' + escapeAttr(i18n('section_settings', 'Video settings')) + '</span>' +
      '</summary>' +
      '<div class="creator-video-details__body">' +
      '<div class="creator-video-field">' +
      '<label class="creator-video-field__label" for="creator-video-content-type">' + escapeAttr(i18n('content_type_label', 'Content type')) + '</label>' +
      '<select id="creator-video-content-type" class="creator-video-field__select" data-creator-video-content-type>' +
      '<option value="video_generation">' + escapeAttr(i18n('content_type_video_generation', 'Video generation')) + '</option>' +
      '<option value="motion_control">' + escapeAttr(i18n('content_type_motion_control', 'Motion control')) + '</option>' +
      '<option value="avatar">' + escapeAttr(i18n('content_type_avatar', 'Avatar')) + '</option>' +
      '</select></div>' +
      '<div class="creator-video-field creator-video-field--model" data-creator-video-model-row>' +
      '<label class="creator-video-field__label" for="creator-video-model">' + escapeAttr(i18n('model_label', 'Model')) + '</label>' +
      '<select id="creator-video-model" class="creator-video-field__select" data-creator-video-model>' +
      '<option value="video_3">' + escapeAttr(i18n('model_video_3', 'Video 3.0')) + '</option>' +
      '<option value="video_2_6">' + escapeAttr(i18n('model_video_26', 'Video 2.6')) + '</option>' +
      '</select></div>' +
      '<div class="creator-video-type-panel" data-creator-video-type-panel="video_generation">' +
      '<label class="creator-video-field__label">' + escapeAttr(i18n('field_negative_prompt', 'Negative prompt (optional)')) + '</label>' +
      '<textarea class="creator-video-field__textarea creator-video-field__textarea--sm" rows="2" data-creator-video-negative-prompt placeholder="' +
      escapeAttr(i18n('field_negative_prompt_hint', 'What to avoid in the output.')) + '"></textarea></div>' +
      '<div class="creator-video-type-panel" data-creator-video-type-panel="motion_control" hidden>' +
      '<div class="creator-video-motion-layout">' +
      '<div class="creator-video-motion-row">' +
      '<div class="creator-video-motion-col creator-video-motion-col--video">' +
      '<div class="creator-video-motion-card">' +
      '<div class="creator-video-motion-card__head">' +
      '<span class="creator-video-motion-card__icon" aria-hidden="true">🎬</span>' +
      '<span class="creator-video-motion-card__title">' + escapeAttr(i18n('motion_reference_upload_title', 'Reference motion video')) + '</span>' +
      '<button type="button" class="creator-video-motion-info-btn" data-creator-video-motion-info-open aria-label="' + escapeAttr(i18n('motion_reference_info_aria', 'Information')) + '">' +
      '<svg class="creator-video-motion-info-btn__svg" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>' +
      '<div class="creator-video-motion-upload-status" data-creator-video-motion-upload-status hidden></div>' +
      '<div class="creator-video-motion-player-shell">' +
      '<div class="creator-video-motion-upload-area" data-creator-video-upload="motion-video">' +
      '<input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v" class="creator-hero-upload-input" data-creator-video-input="motion-video">' +
      '<div class="creator-video-motion-upload-placeholder" data-creator-video-motion-placeholder>' +
      '<span class="creator-video-motion-upload-add" aria-hidden="true">+</span>' +
      '</div>' +
      '<div class="creator-video-motion-preview" data-creator-video-motion-preview hidden>' +
      '<video playsinline controls class="creator-video-motion-preview-video" data-creator-video-motion-preview-video></video>' +
      '<button type="button" class="creator-video-motion-preview-remove" data-creator-video-motion-remove aria-label="' + escapeAttr(i18n('motion_remove_video_aria', 'Remove video')) + '">×</button>' +
      '</div></div></div>' +
      '<div class="creator-video-motion-info-modal" hidden data-creator-video-motion-info-modal>' +
      '<div class="creator-video-motion-info-modal__scrim" data-creator-video-motion-info-close tabindex="-1"></div>' +
      '<div class="creator-video-motion-info-modal__panel" role="dialog" aria-modal="true" aria-labelledby="' + escapeAttr(motionInfoBodyId) + '">' +
      '<button type="button" class="creator-video-motion-info-modal__close" data-creator-video-motion-info-close aria-label="' + escapeAttr(i18n('motion_modal_close', 'Close')) + '">×</button>' +
      '<p id="' + escapeAttr(motionInfoBodyId) + '" class="creator-video-motion-info-modal__body">' + escapeAttr(i18n('motion_reference_upload_hint', 'Upload a short clip (MP4, WebM, MOV), up to about 150 MB. It is sent with your character image to motion control.')) + '</p>' +
      '</div></div></div>' +
      '<div class="creator-video-motion-orient">' +
      '<span class="creator-video-field__label">' + escapeAttr(i18n('character_orientation_label', 'Character orientation')) + '</span>' +
      '<div class="creator-video-orient-row">' +
      '<label class="creator-video-orient-choice"><input type="radio" data-creator-video-orient-radio value="video" checked><span>' + escapeAttr(i18n('character_orientation_video', 'Match reference video')) + '</span></label>' +
      '<label class="creator-video-orient-choice"><input type="radio" data-creator-video-orient-radio value="image"><span>' + escapeAttr(i18n('character_orientation_image', 'Match character image')) + '</span></label>' +
      '</div>' +
      '<label class="creator-video-motion-sound"><input type="checkbox" data-creator-video-keep-sound> ' + escapeAttr(i18n('motion_keep_sound', 'Keep reference video audio')) + '</label>' +
      '</div></div>' +
      '<div class="creator-video-motion-col creator-video-motion-col--character">' +
      '<div class="creator-video-motion-character-card">' +
      '<div class="creator-video-motion-card__head">' +
      '<span class="creator-video-motion-card__icon" aria-hidden="true">🖼️</span>' +
      '<span class="creator-video-motion-card__title">' + escapeAttr(i18n('motion_character_image_title', 'Character image')) + '</span></div>' +
      '<div class="creator-video-motion-upload-status" data-creator-video-character-upload-status hidden></div>' +
      '<div class="creator-video-motion-player-shell">' +
      '<div class="creator-video-motion-upload-area" data-creator-video-character-upload-area>' +
      '<div class="creator-video-motion-upload-placeholder" data-creator-video-character-placeholder>' +
      '<span class="creator-video-motion-upload-add" aria-hidden="true">+</span></div>' +
      '<div class="creator-video-motion-preview" data-creator-video-character-preview hidden role="img" aria-label="' + escapeAttr(i18n('motion_character_preview_aria', 'Character image preview')) + '">' +
      '<img class="creator-video-motion-character-preview-img" data-creator-video-character-preview-img alt="" />' +
      '<button type="button" class="creator-video-motion-preview-remove" data-creator-video-character-remove aria-label="' + escapeAttr(i18n('motion_remove_character_aria', 'Remove character image')) + '">×</button>' +
      '</div></div></div></div></div></div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-creator-video-character-file-direct hidden>' +
      '<label class="creator-video-field__label creator-video-field__label--mt">' + escapeAttr(i18n('field_motion_description', 'Motion / camera')) + '</label>' +
      '<textarea class="creator-video-field__textarea" rows="3" data-creator-video-motion-description" placeholder="' +
      escapeAttr(i18n('field_motion_description_hint', 'Describe camera movement or subject motion.')) + '"></textarea>' +

      '<div class="creator-video-character-modal" hidden data-creator-video-character-source-modal>' +
      '<div class="creator-video-character-modal__scrim" data-creator-video-character-source-close tabindex="-1"></div>' +
      '<div class="creator-video-character-modal__panel" role="dialog" aria-modal="true" aria-labelledby="' + escapeAttr(charDlg + '-src') + '">' +
      '<button type="button" class="creator-video-motion-info-modal__close" data-creator-video-character-source-close aria-label="' + escapeAttr(i18n('motion_modal_close', 'Close')) + '">×</button>' +
      '<h3 id="' + escapeAttr(charDlg + '-src') + '" class="creator-video-character-modal__title">' + escapeAttr(i18n('motion_character_source_title', 'Image source')) + '</h3>' +
      '<div class="creator-video-character-source-actions">' +
      '<button type="button" class="creator-video-character-source-btn" data-creator-video-character-source="upload">' + escapeAttr(i18n('motion_character_source_upload', 'Upload')) + '</button>' +
      '<button type="button" class="creator-video-character-source-btn" data-creator-video-character-source="hero">' + escapeAttr(i18n('motion_character_source_hero', 'Hero images')) + '</button>' +
      '<button type="button" class="creator-video-character-source-btn" data-creator-video-character-source="library">' + escapeAttr(i18n('motion_character_source_library', 'Images')) + '</button>' +
      '<button type="button" class="creator-video-character-source-btn" data-creator-video-character-source="products">' + escapeAttr(i18n('motion_character_source_products', 'Products')) + '</button>' +
      '</div></div></div>' +

      '<div class="creator-video-character-modal" hidden data-creator-video-character-hero-modal>' +
      '<div class="creator-video-character-modal__scrim" data-creator-video-character-hero-close tabindex="-1"></div>' +
      '<div class="creator-video-character-modal__panel creator-video-character-modal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="' + escapeAttr(charDlg + '-hero') + '">' +
      '<button type="button" class="creator-video-motion-info-modal__close" data-creator-video-character-hero-close aria-label="' + escapeAttr(i18n('motion_modal_close', 'Close')) + '">×</button>' +
      '<h3 id="' + escapeAttr(charDlg + '-hero') + '" class="creator-video-character-modal__title">' + escapeAttr(i18n('motion_character_pick_hero', 'Pick a hero image')) + '</h3>' +
      '<div class="creator-video-character-modal__grid" data-creator-video-character-hero-grid></div>' +
      '</div></div>' +

      '<div class="creator-video-character-modal" hidden data-creator-video-character-library-modal>' +
      '<div class="creator-video-character-modal__scrim" data-creator-video-character-library-close tabindex="-1"></div>' +
      '<div class="creator-video-character-modal__panel creator-video-character-modal__panel--wide" role="dialog" aria-modal="true" aria-labelledby="' + escapeAttr(charDlg + '-lib') + '">' +
      '<button type="button" class="creator-video-motion-info-modal__close" data-creator-video-character-library-close aria-label="' + escapeAttr(i18n('motion_modal_close', 'Close')) + '">×</button>' +
      '<h3 id="' + escapeAttr(charDlg + '-lib') + '" class="creator-video-character-modal__title">' + escapeAttr(i18n('motion_character_pick_library', 'Pick from your images')) + '</h3>' +
      '<div class="creator-video-character-modal__grid" data-creator-video-character-library-grid></div>' +
      '</div></div>' +

      '<div class="creator-video-character-modal" hidden data-creator-video-character-product-modal>' +
      '<div class="creator-video-character-modal__scrim" data-creator-video-character-product-close tabindex="-1"></div>' +
      '<div class="creator-video-character-modal__panel creator-video-character-modal__panel--product" role="dialog" aria-modal="true" aria-labelledby="' + escapeAttr(charDlg + '-prod') + '">' +
      '<button type="button" class="creator-video-motion-info-modal__close" data-creator-video-character-product-close aria-label="' + escapeAttr(i18n('motion_modal_close', 'Close')) + '">×</button>' +
      '<h3 id="' + escapeAttr(charDlg + '-prod') + '" class="creator-video-character-modal__title">' + escapeAttr(i18n('motion_character_product_title', 'Product image')) + '</h3>' +
      '<div data-creator-video-char-prod-step="config">' +
      '<div class="creator-video-char-prod-tabs">' +
      '<button type="button" class="creator-video-char-prod-tab is-active" data-creator-video-char-prod-tab="top">' + escapeAttr(i18n('product_main_label', 'Main product')) + '</button>' +
      '<button type="button" class="creator-video-char-prod-tab" data-creator-video-char-prod-tab="addition">' + escapeAttr(i18n('product_addition_label', 'Add-on')) + '</button>' +
      '</div>' +
      '<div class="creator-video-char-prod-tab-panel is-active" data-creator-video-char-prod-panel="top">' +
      '<div class="creator-hero-product-category creator-video-char-prod-cat" data-creator-video-char-category="top">' +
      '<div class="creator-hero-product-preview" data-creator-video-char-preview="top"><div class="creator-hero-preview-media" data-creator-video-char-preview-media="top"></div><span class="creator-hero-product-preview-info" data-creator-video-char-preview-info="top"></span><button type="button" class="creator-hero-product-preview-remove" data-creator-video-char-remove="top" aria-label="Remove">×</button></div>' +
      '<span class="creator-video-char-prod-hint">' + escapeAttr(i18n('motion_character_tap_select_main', 'Tap to select main product')) + '</span></div></div>' +
      '<div class="creator-video-char-prod-tab-panel" data-creator-video-char-prod-panel="addition" hidden>' +
      '<div class="creator-hero-product-category creator-video-char-prod-cat" data-creator-video-char-category="addition">' +
      '<div class="creator-hero-product-preview" data-creator-video-char-preview="addition"><div class="creator-hero-preview-media" data-creator-video-char-preview-media="addition"></div><span class="creator-hero-product-preview-info" data-creator-video-char-preview-info="addition"></span><button type="button" class="creator-hero-product-preview-remove" data-creator-video-char-remove="addition" aria-label="Remove">×</button></div>' +
      '<span class="creator-video-char-prod-hint">' + escapeAttr(i18n('motion_character_tap_select_addon', 'Tap to select add-on')) + '</span></div></div>' +
      '<div class="creator-hero-upload-grid creator-video-char-ref-upload-grid">' +
      '<div class="creator-hero-upload-area" data-creator-video-char-ref-slot="model">' +
      '<div class="creator-hero-upload-icon" aria-hidden="true">👤</div>' +
      '<div class="creator-hero-upload-title">' + escapeAttr(i18n('motion_character_model_ref', 'Model reference (optional)')) + '</div>' +
      '<div class="creator-hero-upload-text">' + escapeAttr(i18n('motion_character_choose_model', 'Choose model image')) + '</div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-creator-video-char-model-file>' +
      '<div class="creator-hero-upload-preview" data-creator-video-char-model-preview>' +
      '<img alt="" data-creator-video-char-model-thumb>' +
      '<button type="button" class="creator-hero-upload-preview-remove" data-creator-video-char-model-clear aria-label="' + escapeAttr(i18n('motion_character_clear', 'Clear')) + '">×</button></div></div>' +
      '<div class="creator-hero-upload-area" data-creator-video-char-ref-slot="bg">' +
      '<div class="creator-hero-upload-icon" aria-hidden="true">🌅</div>' +
      '<div class="creator-hero-upload-title">' + escapeAttr(i18n('motion_character_bg_ref', 'Background reference (optional)')) + '</div>' +
      '<div class="creator-hero-upload-text">' + escapeAttr(i18n('motion_character_choose_bg', 'Choose background')) + '</div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-creator-video-char-bg-file>' +
      '<div class="creator-hero-upload-preview" data-creator-video-char-bg-preview>' +
      '<img alt="" data-creator-video-char-bg-thumb>' +
      '<button type="button" class="creator-hero-upload-preview-remove" data-creator-video-char-bg-clear aria-label="' + escapeAttr(i18n('motion_character_clear', 'Clear')) + '">×</button></div></div></div>' +
      '<label class="creator-video-field__label creator-video-field__label--mt" for="' + escapeAttr(charDlg + '-cpp') + '">' + escapeAttr(i18n('motion_character_gen_prompt', 'Prompt')) + '</label>' +
      '<textarea class="creator-video-field__textarea" id="' + escapeAttr(charDlg + '-cpp') + '" rows="2" data-creator-video-char-prompt placeholder="' + escapeAttr(i18n('motion_character_gen_prompt_hint', 'Describe the scene…')) + '"></textarea>' +
      '<button type="button" class="creator-video-char-generate-btn" data-creator-video-char-generate>' + escapeAttr(i18n('motion_character_generate', 'Generate image')) + '</button>' +
      '<p class="creator-video-char-prod-status" data-creator-video-char-prod-status hidden></p>' +
      '</div>' +
      '<div data-creator-video-char-prod-step="preview" hidden>' +
      '<div class="creator-video-char-preview-stage"><img alt="" data-creator-video-char-result-img></div>' +
      '<div class="creator-video-char-preview-actions">' +
      '<button type="button" class="creator-video-char-secondary-btn" data-creator-video-char-regenerate>' + escapeAttr(i18n('motion_character_regenerate', 'Regenerate')) + '</button>' +
      '<button type="button" class="creator-video-char-primary-btn" data-creator-video-char-confirm>' + escapeAttr(i18n('motion_character_use_image', 'Use image')) + '</button>' +
      '</div></div>' +
      '</div></div>' +

      '</div>' +
      '<div class="creator-video-type-panel" data-creator-video-type-panel="avatar" hidden>' +
      '<label class="creator-video-field__label">' + escapeAttr(i18n('field_avatar_character', 'Character')) + '</label>' +
      '<textarea class="creator-video-field__textarea" rows="2" data-creator-video-avatar-character" placeholder="' +
      escapeAttr(i18n('field_avatar_character_hint', 'Describe the avatar look and outfit.')) + '"></textarea>' +
      '<label class="creator-video-field__label creator-video-field__label--mt">' + escapeAttr(i18n('field_avatar_script', 'Script / lines')) + '</label>' +
      '<textarea class="creator-video-field__textarea" rows="3" data-creator-video-avatar-script" placeholder="' +
      escapeAttr(i18n('field_avatar_script_hint', 'What should the avatar say or do?')) + '"></textarea></div>' +
      '</div></details>' +

      '<details class="creator-video-details" open data-creator-video-details="product">' +
      '<summary class="creator-video-details__summary">' +
      '<span class="creator-video-details__title">' + escapeAttr(i18n('section_product', 'Product')) + '</span>' +
      '</summary>' +
      '<div class="creator-video-details__body">' +
      '<div class="creator-hero-product-selector">' +
      '<h3 class="creator-hero-product-selector-title">' + i18n('select_products', 'Select products') + '</h3>' +
      '<div class="creator-hero-product-grid">' +
      '<div class="creator-hero-product-category" data-category="top" data-creator-video-category="top">' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h12M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6M6 12V8a2 2 0 012-2h8a2 2 0 012 2v4"/><path d="M10 8V4a2 2 0 012-2h0a2 2 0 012 2v4"/></svg>' +
      '<span class="creator-hero-product-label">' + escapeAttr(i18n('product_main_label', 'Main product')) + '</span>' +
      '<div class="creator-hero-product-preview" data-creator-video-preview="top"><div class="creator-hero-preview-media" data-creator-video-preview-media="top"></div><span class="creator-hero-product-preview-info" data-creator-video-preview-info="top"></span><button type="button" class="creator-hero-product-preview-remove" data-creator-video-remove="top" aria-label="Remove">×</button></div>' +
      '</div>' +
      '<div class="creator-hero-product-category" data-category="addition" data-creator-video-category="addition">' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' +
      '<span class="creator-hero-product-label">' + escapeAttr(i18n('product_addition_label', 'Add-on')) + '</span>' +
      '<div class="creator-hero-product-preview" data-creator-video-preview="addition"><div class="creator-hero-preview-media" data-creator-video-preview-media="addition"></div><span class="creator-hero-product-preview-info" data-creator-video-preview-info="addition"></span><button type="button" class="creator-hero-product-preview-remove" data-creator-video-remove="addition" aria-label="Remove">×</button></div>' +
      '</div>' +
      '</div></div></div></details>' +

      '<details class="creator-video-details" open data-creator-video-details="image">' +
      '<summary class="creator-video-details__summary">' +
      '<span class="creator-video-details__title">' + escapeAttr(i18n('section_image', 'Image')) + '</span>' +
      '</summary>' +
      '<div class="creator-video-details__body">' +
      '<p class="creator-video-hero-hint">' + escapeAttr(i18n('hero_pick_hint', 'Pick a hero image or upload a new file below.')) + '</p>' +
      '<div class="creator-video-hero-picker-status" data-creator-video-hero-status hidden></div>' +
      '<div class="creator-video-hero-picker-grid" data-creator-video-hero-picker></div>' +
      '<div class="creator-hero-upload-grid creator-hero-upload-grid--video">' +
      '<div class="creator-hero-upload-area" data-creator-video-upload="reference">' +
      '<div class="creator-hero-upload-icon">🖼️</div>' +
      '<div class="creator-hero-upload-title">' + i18n('upload_title', 'Reference image') + '</div>' +
      '<div class="creator-hero-upload-text">' + i18n('upload_hint', 'Upload an image to animate (portrait recommended)') + '</div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-creator-video-input="reference">' +
      '<div class="creator-hero-upload-preview" data-creator-video-upload-preview="reference"><img data-creator-video-upload-img="reference" alt=""><button type="button" class="creator-hero-upload-preview-remove" data-creator-video-upload-remove="reference">×</button></div>' +
      '</div></div></div></details>' +

      '<div class="creator-hero-prompt-section">' +
      '<label class="creator-video-field__label" for="creator-video-main-prompt">' + escapeAttr(i18n('field_positive_prompt', 'Prompt')) + '</label>' +
      '<textarea id="creator-video-main-prompt" class="creator-hero-prompt-input" data-creator-video-prompt rows="3" placeholder="' +
      escapeAttr(i18n('prompt_placeholder', 'Describe motion and style for your video…')) + '"></textarea>' +
      '</div></div>';
  }

  function syncContentTypeUi(container, ctx) {
    var typeEl = container.querySelector('[data-creator-video-content-type]');
    var modelRow = container.querySelector('[data-creator-video-model-row]');
    var t = typeEl ? String(typeEl.value || 'video_generation') : 'video_generation';
    container.querySelectorAll('[data-creator-video-type-panel]').forEach(function (panel) {
      var id = panel.getAttribute('data-creator-video-type-panel');
      panel.hidden = id !== t;
    });
    if (modelRow) {
      modelRow.hidden = t === 'avatar';
    }
    var imageDetails = container.querySelector('[data-creator-video-details="image"]');
    if (imageDetails) {
      if (t === 'motion_control') {
        imageDetails.setAttribute('hidden', '');
      } else {
        imageDetails.removeAttribute('hidden');
      }
    }
    if (ctx) updateEazyVideoUi(ctx);
  }

  function collectVideoOptions(container) {
    var typeEl = container.querySelector('[data-creator-video-content-type]');
    var modelRow = container.querySelector('[data-creator-video-model-row]');
    var modelEl = container.querySelector('[data-creator-video-model]');
    var neg = container.querySelector('[data-creator-video-negative-prompt]');
    var motion = container.querySelector('[data-creator-video-motion-description]');
    var avChar = container.querySelector('[data-creator-video-avatar-character]');
    var avScript = container.querySelector('[data-creator-video-avatar-script]');
    var orient = container.querySelector('[data-creator-video-orient-radio]:checked');
    var keepSoundEl = container.querySelector('[data-creator-video-keep-sound]');
    var contentType = typeEl ? String(typeEl.value || 'video_generation') : 'video_generation';
    var modelVersion = (modelRow && !modelRow.hidden && modelEl) ? String(modelEl.value || '') : null;
    var orientVal = orient ? String(orient.value || 'video').toLowerCase() : 'video';
    if (orientVal !== 'image' && orientVal !== 'video') orientVal = 'video';
    return {
      content_type: contentType,
      model_version: modelVersion,
      negative_prompt: neg ? String(neg.value || '').trim() : '',
      motion_description: motion ? String(motion.value || '').trim() : '',
      avatar_character: avChar ? String(avChar.value || '').trim() : '',
      avatar_script: avScript ? String(avScript.value || '').trim() : '',
      motion_video_url: videoMotionReferenceUrl ? String(videoMotionReferenceUrl).trim() : '',
      character_orientation: orientVal,
      keep_original_sound: !!(keepSoundEl && keepSoundEl.checked),
    };
  }

  async function loadHeroThumbnailsForVideo(container, ctx) {
    var grid = container.querySelector('[data-creator-video-hero-picker]');
    var statusEl = container.querySelector('[data-creator-video-hero-status]');
    if (!grid) return;
    var owner = getOwnerId();
    grid.innerHTML = '';
    if (!owner) return;
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.textContent = '';
    }
    try {
      var url = API_BASE + '?op=hero-list&owner_id=' + encodeURIComponent(owner) + '&limit=60';
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () { return { ok: false, items: [] }; });
      var items = (data.ok && Array.isArray(data.items)) ? data.items : [];
      if (items.length === 0) {
        var empty = document.createElement('div');
        empty.className = 'creator-video-hero-picker-empty';
        empty.textContent = i18n('hero_grid_empty', 'No hero images yet. Generate some under Hero Images or upload below.');
        grid.appendChild(empty);
        return;
      }
      items.forEach(function (item) {
        var thumbUrl = item.thumbnail_url || item.image_url;
        if (!thumbUrl) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'creator-video-hero-picker-item';
        btn.setAttribute('data-hero-thumb-url', thumbUrl);
        btn.setAttribute('data-hero-image-url', item.image_url || thumbUrl);
        var img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = item.title || item.user_prompt || 'Hero';
        img.loading = 'lazy';
        btn.appendChild(img);
        btn.addEventListener('click', function () {
          grid.querySelectorAll('.creator-video-hero-picker-item').forEach(function (b) { b.classList.remove('is-selected'); });
          btn.classList.add('is-selected');
          var full = btn.getAttribute('data-hero-image-url') || thumbUrl;
          videoSourceImageUrl = full;
          var area = container.querySelector('[data-creator-video-upload="reference"]');
          var prev = container.querySelector('[data-creator-video-upload-preview="reference"]');
          var imgEl = container.querySelector('[data-creator-video-upload-img="reference"]');
          var inp = container.querySelector('[data-creator-video-input="reference"]');
          if (inp) inp.value = '';
          if (imgEl) {
            imgEl.src = full;
            imgEl.style.display = 'block';
          }
          if (prev) prev.classList.add('show');
          if (area) area.classList.add('creator-video-hero-from-grid');
          updateEazyVideoUi(ctx);
        });
        grid.appendChild(btn);
      });
    } catch (e) {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = i18n('hero_grid_load_error', 'Could not load hero images.');
      }
      console.warn('[ContentCreationVideo] hero-list:', e);
    }
  }

  function adaptModalProductToVideo(p) {
    var urls = window.CreatorProductImageCarousel
      ? window.CreatorProductImageCarousel.collectImageUrls(p)
      : [];
    var img = urls[0] || null;
    if (!img && p.images && p.images[0]) img = p.images[0].src || p.images[0].url || p.images[0];
    if (!img && p.image) img = p.image.src || p.image.url || p.image;
    return {
      id: String(p.id || ''),
      product_id: p.id,
      title: p.title || p.name || 'Product',
      image_url: img,
      image_urls: urls.length ? urls : (img ? [img] : []),
      region: p.region || null
    };
  }

  function setVideoProductPreview(ctx, category, product) {
    var selected = window.selectedVideoProducts || { top: null, addition: null };
    selected[category] = product;
    window.selectedVideoProducts = selected;
    if (product && product.region) {
      window.selectedVideoRegion = product.region;
    }

    var preview = ctx.container.querySelector('[data-creator-video-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-creator-video-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-creator-video-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-creator-video-category="' + category + '"]');

    if (preview && media && info && card) {
      var urls = [];
      if (product.image_urls && product.image_urls.length) urls = product.image_urls.slice();
      else if (window.CreatorProductImageCarousel) urls = window.CreatorProductImageCarousel.collectImageUrls(product);
      if (!urls.length && product.image_url) urls = [product.image_url];
      if (window.CreatorProductImageCarousel) {
        window.CreatorProductImageCarousel.attach(media, urls, { attrName: 'data-creator-video-preview-img', attrValue: category });
      } else if (urls.length) {
        media.innerHTML = '<img data-creator-video-preview-img="' + category + '" src="' + escapeAttr(urls[0]) + '" alt="">';
      } else {
        media.innerHTML = '';
      }
      info.textContent = (product.title || '').slice(0, 30);
      preview.classList.add('show');
      card.classList.add('creator-hero-product-category--selected');
    }
    updateEazyVideoUi(ctx);
  }

  function removeVideoProduct(ctx, category) {
    var selected = window.selectedVideoProducts || {};
    selected[category] = null;
    window.selectedVideoProducts = selected;

    var preview = ctx.container.querySelector('[data-creator-video-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-creator-video-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-creator-video-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-creator-video-category="' + category + '"]');

    if (preview && media && info && card) {
      media.innerHTML = '';
      preview.classList.remove('show');
      card.classList.remove('creator-hero-product-category--selected');
    }
    updateEazyVideoUi(ctx);
  }

  function getLockedRegionFromVideoSelection() {
    var selected = window.selectedVideoProducts || {};
    if (selected.top && selected.top.region) return selected.top.region;
    if (selected.addition && selected.addition.region) return selected.addition.region;
    return null;
  }

  async function uploadReferenceImageWithMeta(file) {
    var owner = getOwnerId();
    if (!owner) return null;
    var fd = new FormData();
    fd.append('image', file, file.name || 'reference.jpg');
    try {
      var res = await fetch(API_BASE + '?op=upload-hero-image&owner_id=' + encodeURIComponent(owner), {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok && data.image_url) {
        return { image_url: String(data.image_url), r2_key: data.r2_key ? String(data.r2_key) : null };
      }
      return null;
    } catch (e) {
      console.warn('[ContentCreationVideo] Upload error:', e);
      return null;
    }
  }

  async function uploadReferenceImage(file) {
    var m = await uploadReferenceImageWithMeta(file);
    return m && m.image_url ? m.image_url : null;
  }

  function setupReferenceUpload(ctx) {
    var area = ctx.container.querySelector('[data-creator-video-upload="reference"]');
    var input = ctx.container.querySelector('[data-creator-video-input="reference"]');
    var preview = ctx.container.querySelector('[data-creator-video-upload-preview="reference"]');
    var img = ctx.container.querySelector('[data-creator-video-upload-img="reference"]');
    var removeBtn = preview && preview.querySelector('[data-creator-video-upload-remove="reference"]');
    var grid = ctx.container.querySelector('[data-creator-video-hero-picker]');

    if (!area || !input) return;

    area.addEventListener('click', function (e) {
      if (e.target.closest('.creator-hero-upload-preview-remove')) return;
      input.click();
    });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (grid) {
        grid.querySelectorAll('.creator-video-hero-picker-item').forEach(function (b) { b.classList.remove('is-selected'); });
      }
      area.classList.remove('creator-video-hero-from-grid');
      uploadReferenceImage(file).then(function (url) {
        videoSourceImageUrl = url;
        if (url && img) {
          img.src = url;
          img.style.display = 'block';
          if (preview) preview.classList.add('show');
        } else if (!url && img) {
          var reader = new FileReader();
          reader.onload = function () {
            img.src = reader.result;
            img.style.display = 'block';
            if (preview) preview.classList.add('show');
          };
          reader.readAsDataURL(file);
        }
        updateEazyVideoUi(ctx);
      });
    });
    if (removeBtn) {
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        videoSourceImageUrl = null;
        input.value = '';
        if (img) { img.src = ''; img.style.display = 'none'; }
        if (preview) preview.classList.remove('show');
        if (grid) {
          grid.querySelectorAll('.creator-video-hero-picker-item').forEach(function (b) { b.classList.remove('is-selected'); });
        }
        area.classList.remove('creator-video-hero-from-grid');
        updateEazyVideoUi(ctx);
      });
    }
  }

  var MOTION_VIDEO_MAX_BYTES = 150 * 1024 * 1024;

  /**
   * @returns {Promise<{ ok: boolean, url: string|null, message?: string }>}
   */
  async function uploadMotionReferenceVideo(file) {
    var owner = getOwnerId();
    if (!owner || !file) {
      return { ok: false, url: null, message: i18n('error_owner', 'Missing owner') };
    }
    if (file.size > MOTION_VIDEO_MAX_BYTES) {
      return {
        ok: false,
        url: null,
        message: i18n('motion_file_too_large', 'This file is too large. Maximum size is 150 MB.'),
      };
    }
    var fd = new FormData();
    fd.append('video', file, file.name || 'motion.mp4');
    try {
      var res = await fetch(API_BASE + '?op=upload-video-motion-ref&owner_id=' + encodeURIComponent(owner), {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok && data.video_url) {
        return { ok: true, url: data.video_url };
      }
      var msg = (data.message && String(data.message).trim()) || (data.error && String(data.error).trim()) || '';
      if (!msg && !res.ok) {
        msg = 'HTTP ' + res.status;
      }
      return { ok: false, url: null, message: msg || undefined };
    } catch (e) {
      console.warn('[ContentCreationVideo] Motion video upload:', e);
      return { ok: false, url: null, message: String(e && e.message ? e.message : e) };
    }
  }

  function getLockedRegionFromMotionCharacterSelection() {
    var s = window.selectedMotionCharacterProducts || {};
    if (s.top && s.top.region) return s.top.region;
    if (s.addition && s.addition.region) return s.addition.region;
    return null;
  }

  function setMotionCharacterProductPreview(ctx, category, product) {
    var selected = window.selectedMotionCharacterProducts || { top: null, addition: null };
    selected[category] = product;
    window.selectedMotionCharacterProducts = selected;
    if (product && product.region) window.selectedVideoRegion = product.region;

    var preview = ctx.container.querySelector('[data-creator-video-char-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-creator-video-char-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-creator-video-char-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-creator-video-char-category="' + category + '"]');

    if (preview && media && info && card) {
      var urls = [];
      if (product.image_urls && product.image_urls.length) urls = product.image_urls.slice();
      else if (window.CreatorProductImageCarousel) urls = window.CreatorProductImageCarousel.collectImageUrls(product);
      if (!urls.length && product.image_url) urls = [product.image_url];
      if (window.CreatorProductImageCarousel) {
        window.CreatorProductImageCarousel.attach(media, urls, { attrName: 'data-creator-video-char-preview-img', attrValue: category });
      } else if (urls.length) {
        media.innerHTML = '<img data-creator-video-char-preview-img="' + category + '" src="' + escapeAttr(urls[0]) + '" alt="">';
      } else {
        media.innerHTML = '';
      }
      info.textContent = (product.title || '').slice(0, 30);
      preview.classList.add('show');
      card.classList.add('creator-hero-product-category--selected');
    }
  }

  function removeMotionCharacterProduct(ctx, category) {
    var selected = window.selectedMotionCharacterProducts || {};
    selected[category] = null;
    window.selectedMotionCharacterProducts = selected;

    var preview = ctx.container.querySelector('[data-creator-video-char-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-creator-video-char-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-creator-video-char-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-creator-video-char-category="' + category + '"]');

    if (preview && media && info && card) {
      media.innerHTML = '';
      preview.classList.remove('show');
      card.classList.remove('creator-hero-product-category--selected');
    }
  }

  function setCharacterSlotImage(ctx, url) {
    videoSourceImageUrl = url || null;
    var img = ctx.container.querySelector('[data-creator-video-character-preview-img]');
    var preview = ctx.container.querySelector('[data-creator-video-character-preview]');
    var placeholder = ctx.container.querySelector('[data-creator-video-character-placeholder]');
    var area = ctx.container.querySelector('[data-creator-video-character-upload-area]');
    if (url && img) {
      img.src = url;
      if (preview) preview.hidden = false;
      if (placeholder) placeholder.hidden = true;
      if (area) area.classList.add('creator-video-motion-upload-area--has-video');
    } else {
      if (img) img.removeAttribute('src');
      if (preview) preview.hidden = true;
      if (placeholder) placeholder.hidden = false;
      if (area) area.classList.remove('creator-video-motion-upload-area--has-video');
    }
    updateEazyVideoUi(ctx);
  }

  function anyCharacterModalOpen(ctx) {
    var sel = '[data-creator-video-character-source-modal],[data-creator-video-character-hero-modal],[data-creator-video-character-library-modal],[data-creator-video-character-product-modal]';
    var nodes = ctx.container.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].hidden) return true;
    }
    return false;
  }

  function refreshCharacterModalBodyClass(ctx) {
    toggleCharacterModalBody(anyCharacterModalOpen(ctx));
  }

  function toggleCharacterModalBody(open) {
    try {
      document.body.classList.toggle('creator-video-character-modal-open', !!open);
    } catch (e) {}
  }

  async function saveUploadToContentPublishLibrary(imageUrl, r2Key) {
    if (!imageUrl || !r2Key) return;
    try {
      await fetch(API_BASE + '?op=save-content-publish-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          image_url: imageUrl,
          r2_key: r2Key,
          source_kind: 'upload'
        })
      });
    } catch (e) {
      console.warn('[ContentCreationVideo] save-content-publish-image', e);
    }
    try {
      if (window.ContentPublishImagesScreen && typeof window.ContentPublishImagesScreen.load === 'function') {
        window.ContentPublishImagesScreen.load();
      }
    } catch (e2) {}
  }

  async function loadHeroGridForCharacterModal(ctx) {
    var grid = ctx.container.querySelector('[data-creator-video-character-hero-grid]');
    if (!grid) return;
    var owner = getOwnerId();
    grid.innerHTML = '';
    if (!owner) return;
    try {
      var url = API_BASE + '?op=hero-list&owner_id=' + encodeURIComponent(owner) + '&limit=60';
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () { return { ok: false, items: [] }; });
      var items = (data.ok && Array.isArray(data.items)) ? data.items : [];
      if (items.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'creator-video-character-modal__empty';
        empty.textContent = i18n('hero_grid_empty', 'No hero images yet. Generate some under Hero Images or upload below.');
        grid.appendChild(empty);
        return;
      }
      items.forEach(function (item) {
        var thumbUrl = item.thumbnail_url || item.image_url;
        if (!thumbUrl) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'creator-video-hero-picker-item';
        var full = item.image_url || thumbUrl;
        var img = document.createElement('img');
        img.src = thumbUrl;
        img.alt = item.title || 'Hero';
        img.loading = 'lazy';
        btn.appendChild(img);
        btn.addEventListener('click', function () {
          var heroModal = ctx.container.querySelector('[data-creator-video-character-hero-modal]');
          if (heroModal) heroModal.hidden = true;
          setCharacterSlotImage(ctx, full);
          refreshCharacterModalBodyClass(ctx);
        });
        grid.appendChild(btn);
      });
    } catch (e) {
      console.warn('[ContentCreationVideo] hero-list character:', e);
    }
  }

  async function loadLibraryGridForCharacterModal(ctx) {
    var grid = ctx.container.querySelector('[data-creator-video-character-library-grid]');
    if (!grid) return;
    grid.innerHTML = '';
    var owner = getOwnerId();
    if (!owner) {
      var miss = document.createElement('p');
      miss.className = 'creator-video-character-modal__empty';
      miss.textContent = i18n('error_owner', 'Missing owner');
      grid.appendChild(miss);
      return;
    }
    try {
      var res = await fetch(API_BASE + '?op=list-content-publish-images&owner_id=' + encodeURIComponent(owner) + '&limit=60', { credentials: 'include' });
      var data = await res.json().catch(function () { return { ok: false, items: [] }; });
      var items = (data.ok && Array.isArray(data.items)) ? data.items : [];
      if (items.length === 0) {
        var empty = document.createElement('p');
        empty.className = 'creator-video-character-modal__empty';
        empty.textContent = i18n('motion_character_library_empty', 'No images in your library yet.');
        grid.appendChild(empty);
        return;
      }
      items.forEach(function (item) {
        var thumb = item.thumbnail_url || item.image_url;
        if (!thumb) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'creator-video-hero-picker-item';
        var img = document.createElement('img');
        img.src = thumb;
        img.alt = '';
        img.loading = 'lazy';
        btn.appendChild(img);
        btn.addEventListener('click', function () {
          var libModal = ctx.container.querySelector('[data-creator-video-character-library-modal]');
          if (libModal) libModal.hidden = true;
          setCharacterSlotImage(ctx, item.image_url || thumb);
          refreshCharacterModalBodyClass(ctx);
        });
        grid.appendChild(btn);
      });
    } catch (e) {
      console.warn('[ContentCreationVideo] list-content-publish-images:', e);
    }
  }

  function resetMotionCharacterProductModal(ctx) {
    ctx._charModelUrl = null;
    ctx._charBgUrl = null;
    ctx._motionCharDraftJobId = null;
    ctx._motionCharDraftResult = null;
    window.selectedMotionCharacterProducts = { top: null, addition: null };
    var cfg = ctx.container.querySelector('[data-creator-video-char-prod-step="config"]');
    var prev = ctx.container.querySelector('[data-creator-video-char-prod-step="preview"]');
    if (cfg) cfg.hidden = false;
    if (prev) prev.hidden = true;
    ['top', 'addition'].forEach(function (cat) {
      removeMotionCharacterProduct(ctx, cat);
    });
    var mFile = ctx.container.querySelector('[data-creator-video-char-model-file]');
    var bFile = ctx.container.querySelector('[data-creator-video-char-bg-file]');
    if (mFile) mFile.value = '';
    if (bFile) bFile.value = '';
    var mArea = ctx.container.querySelector('[data-creator-video-char-ref-slot="model"]');
    var mPv = ctx.container.querySelector('[data-creator-video-char-model-preview]');
    var mTh = ctx.container.querySelector('[data-creator-video-char-model-thumb]');
    var bArea = ctx.container.querySelector('[data-creator-video-char-ref-slot="bg"]');
    var bPv = ctx.container.querySelector('[data-creator-video-char-bg-preview]');
    var bTh = ctx.container.querySelector('[data-creator-video-char-bg-thumb]');
    if (mArea) mArea.classList.remove('has-image');
    if (bArea) bArea.classList.remove('has-image');
    if (mPv) mPv.classList.remove('show');
    if (bPv) bPv.classList.remove('show');
    if (mTh) mTh.removeAttribute('src');
    if (bTh) bTh.removeAttribute('src');
    var st = ctx.container.querySelector('[data-creator-video-char-prod-status]');
    if (st) { st.hidden = true; st.textContent = ''; }
    var pmt = ctx.container.querySelector('[data-creator-video-char-prompt]');
    if (pmt) pmt.value = '';
    var ri = ctx.container.querySelector('[data-creator-video-char-result-img]');
    if (ri) ri.removeAttribute('src');
  }

  function setupMotionCharacterUi(ctx) {
    ctx._charModelUrl = null;
    ctx._charBgUrl = null;
    ctx._motionCharDraftJobId = null;
    ctx._motionCharDraftResult = null;

    var area = ctx.container.querySelector('[data-creator-video-character-upload-area]');
    var prevChar = ctx.container.querySelector('[data-creator-video-character-preview]');
    var removeChar = ctx.container.querySelector('[data-creator-video-character-remove]');
    var fileDirect = ctx.container.querySelector('[data-creator-video-character-file-direct]');
    var sourceModal = ctx.container.querySelector('[data-creator-video-character-source-modal]');
    var heroModal = ctx.container.querySelector('[data-creator-video-character-hero-modal]');
    var libModal = ctx.container.querySelector('[data-creator-video-character-library-modal]');
    var prodModal = ctx.container.querySelector('[data-creator-video-character-product-modal]');

    function openSource() {
      if (sourceModal) sourceModal.hidden = false;
      refreshCharacterModalBodyClass(ctx);
    }
    function closeSource() {
      if (sourceModal) sourceModal.hidden = true;
      refreshCharacterModalBodyClass(ctx);
    }

    if (area) {
      area.addEventListener('click', function (e) {
        if (e.target.closest('[data-creator-video-character-remove]')) return;
        if (prevChar && !prevChar.hidden) return;
        openSource();
      });
    }
    if (removeChar) {
      removeChar.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        setCharacterSlotImage(ctx, null);
      });
    }

    if (fileDirect) {
      fileDirect.addEventListener('change', function () {
        var file = fileDirect.files && fileDirect.files[0];
        fileDirect.value = '';
        if (!file) return;
        uploadReferenceImageWithMeta(file).then(function (meta) {
          if (meta && meta.image_url) {
            setCharacterSlotImage(ctx, meta.image_url);
            if (meta.r2_key) saveUploadToContentPublishLibrary(meta.image_url, meta.r2_key);
          }
        });
      });
    }

    if (sourceModal) {
      sourceModal.querySelectorAll('[data-creator-video-character-source-close]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          closeSource();
        });
      });
      sourceModal.querySelectorAll('[data-creator-video-character-source]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var kind = btn.getAttribute('data-creator-video-character-source');
          closeSource();
          if (kind === 'upload') {
            if (fileDirect) fileDirect.click();
          } else if (kind === 'hero') {
            loadHeroGridForCharacterModal(ctx).then(function () {
              if (heroModal) heroModal.hidden = false;
              refreshCharacterModalBodyClass(ctx);
            });
          } else if (kind === 'library') {
            loadLibraryGridForCharacterModal(ctx).then(function () {
              if (libModal) libModal.hidden = false;
              refreshCharacterModalBodyClass(ctx);
            });
          } else if (kind === 'products') {
            resetMotionCharacterProductModal(ctx);
            if (prodModal) prodModal.hidden = false;
            refreshCharacterModalBodyClass(ctx);
          }
        });
      });
    }

    if (heroModal) {
      heroModal.querySelectorAll('[data-creator-video-character-hero-close]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          heroModal.hidden = true;
          refreshCharacterModalBodyClass(ctx);
        });
      });
    }
    if (libModal) {
      libModal.querySelectorAll('[data-creator-video-character-library-close]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          libModal.hidden = true;
          refreshCharacterModalBodyClass(ctx);
        });
      });
    }

    if (prodModal) {
      prodModal.querySelectorAll('[data-creator-video-character-product-close]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          prodModal.hidden = true;
          resetMotionCharacterProductModal(ctx);
          refreshCharacterModalBodyClass(ctx);
        });
      });

      prodModal.querySelectorAll('[data-creator-video-char-prod-tab]').forEach(function (tab) {
        tab.addEventListener('click', function () {
          var id = tab.getAttribute('data-creator-video-char-prod-tab');
          prodModal.querySelectorAll('[data-creator-video-char-prod-tab]').forEach(function (t) {
            t.classList.toggle('is-active', t.getAttribute('data-creator-video-char-prod-tab') === id);
          });
          prodModal.querySelectorAll('[data-creator-video-char-prod-panel]').forEach(function (p) {
            p.classList.toggle('is-active', p.getAttribute('data-creator-video-char-prod-panel') === id);
            p.hidden = p.getAttribute('data-creator-video-char-prod-panel') !== id;
          });
        });
      });

      ['top', 'addition'].forEach(function (cat) {
        var card = ctx.container.querySelector('[data-creator-video-char-category="' + cat + '"]');
        var rem = ctx.container.querySelector('[data-creator-video-char-remove="' + cat + '"]');
        if (card) {
          card.addEventListener('click', function (e) {
            if (e.target.closest('.creator-hero-product-preview-remove')) return;
            if (e.target.closest('.creator-product-image-carousel__btn')) return;
            if (typeof window.openHeroProductSelectionModalSimple !== 'function') return;
            var creatorName = window.CreatorSettings && window.CreatorSettings.creatorName ? window.CreatorSettings.creatorName : null;
            var slot = cat === 'addition' ? 'additional' : 'top';
            try { window.__heroModalUsedProductsContext = 'video'; } catch (err) {}
            window.openHeroProductSelectionModalSimple(
              slot,
              function (product) {
                try { window.__heroModalUsedProductsContext = 'hero'; } catch (err2) {}
                setMotionCharacterProductPreview(ctx, cat, adaptModalProductToVideo(product));
              },
              creatorName,
              {
                lockedRegion: getLockedRegionFromMotionCharacterSelection() || getLockedRegionFromVideoSelection(),
                usageContext: 'video',
              }
            );
          });
        }
        if (rem) {
          rem.addEventListener('click', function (e) {
            e.stopPropagation();
            removeMotionCharacterProduct(ctx, cat);
          });
        }
      });

      var mArea = ctx.container.querySelector('[data-creator-video-char-ref-slot="model"]');
      var mFile = ctx.container.querySelector('[data-creator-video-char-model-file]');
      var mPv = ctx.container.querySelector('[data-creator-video-char-model-preview]');
      var mTh = ctx.container.querySelector('[data-creator-video-char-model-thumb]');
      var mClr = ctx.container.querySelector('[data-creator-video-char-model-clear]');
      if (mArea && mFile) {
        mArea.addEventListener('click', function (e) {
          if (e.target.closest('.creator-hero-upload-preview-remove')) return;
          mFile.click();
        });
      }
      if (mFile) {
        mFile.addEventListener('change', function () {
          var f = mFile.files && mFile.files[0];
          if (!f) return;
          uploadReferenceImageWithMeta(f).then(function (meta) {
            if (meta && meta.image_url) {
              ctx._charModelUrl = meta.image_url;
              if (mTh) mTh.src = meta.image_url;
              if (mPv) mPv.classList.add('show');
              if (mArea) mArea.classList.add('has-image');
            }
          });
        });
      }
      if (mClr) {
        mClr.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          ctx._charModelUrl = null;
          if (mFile) mFile.value = '';
          if (mPv) mPv.classList.remove('show');
          if (mArea) mArea.classList.remove('has-image');
          if (mTh) mTh.removeAttribute('src');
        });
      }

      var bArea = ctx.container.querySelector('[data-creator-video-char-ref-slot="bg"]');
      var bFile = ctx.container.querySelector('[data-creator-video-char-bg-file]');
      var bPv = ctx.container.querySelector('[data-creator-video-char-bg-preview]');
      var bTh = ctx.container.querySelector('[data-creator-video-char-bg-thumb]');
      var bClr = ctx.container.querySelector('[data-creator-video-char-bg-clear]');
      if (bArea && bFile) {
        bArea.addEventListener('click', function (e) {
          if (e.target.closest('.creator-hero-upload-preview-remove')) return;
          bFile.click();
        });
      }
      if (bFile) {
        bFile.addEventListener('change', function () {
          var f = bFile.files && bFile.files[0];
          if (!f) return;
          uploadReferenceImageWithMeta(f).then(function (meta) {
            if (meta && meta.image_url) {
              ctx._charBgUrl = meta.image_url;
              if (bTh) bTh.src = meta.image_url;
              if (bPv) bPv.classList.add('show');
              if (bArea) bArea.classList.add('has-image');
            }
          });
        });
      }
      if (bClr) {
        bClr.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          ctx._charBgUrl = null;
          if (bFile) bFile.value = '';
          if (bPv) bPv.classList.remove('show');
          if (bArea) bArea.classList.remove('has-image');
          if (bTh) bTh.removeAttribute('src');
        });
      }

      var genBtn = ctx.container.querySelector('[data-creator-video-char-generate]');
      var statEl = ctx.container.querySelector('[data-creator-video-char-prod-status]');
      var regenBtn = ctx.container.querySelector('[data-creator-video-char-regenerate]');
      var confBtn = ctx.container.querySelector('[data-creator-video-char-confirm]');
      var resultImg = ctx.container.querySelector('[data-creator-video-char-result-img]');
      var cfgStep = ctx.container.querySelector('[data-creator-video-char-prod-step="config"]');
      var prevStep = ctx.container.querySelector('[data-creator-video-char-prod-step="preview"]');

      function showProdStatus(msg, isErr) {
        if (!statEl) return;
        statEl.textContent = msg || '';
        statEl.hidden = !msg;
        statEl.style.color = isErr ? '#fca5a5' : 'rgba(255,255,255,0.75)';
      }

      function pollDraftJob(jobId) {
        var n = 0;
        var maxN = 120;
        function tick() {
          fetch(API_BASE + '?op=status&job_id=' + encodeURIComponent(jobId), { credentials: 'include' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (!data || data.not_found) {
                showProdStatus(i18n('motion_character_job_lost', 'Job not found.'), true);
                return;
              }
              if (!data.done) {
                n++;
                if (n < maxN) setTimeout(tick, 1500);
                else showProdStatus(i18n('motion_character_job_timeout', 'Still processing… check Active jobs.'), true);
                return;
              }
              var result = data.result || {};
              var url = result.image_url || result.preview_url;
              if (!url) {
                showProdStatus(data.message || i18n('motion_character_gen_failed', 'Generation failed.'), true);
                return;
              }
              ctx._motionCharDraftResult = result;
              if (resultImg) resultImg.src = url;
              if (cfgStep) cfgStep.hidden = true;
              if (prevStep) prevStep.hidden = false;
              showProdStatus('', false);
              if (genBtn) genBtn.disabled = false;
            })
            .catch(function () {
              n++;
              if (n < maxN) setTimeout(tick, 1500);
            });
        }
        tick();
      }

      if (genBtn) {
        genBtn.addEventListener('click', function () {
          var owner = getOwnerId();
          var sel = window.selectedMotionCharacterProducts || {};
          var ids = [];
          if (sel.top) ids.push(sel.top.id || sel.top.product_id);
          if (sel.addition) ids.push(sel.addition.id || sel.addition.product_id);
          ids = ids.filter(Boolean);
          if (ids.length < 1) {
            showProdStatus(i18n('motion_character_need_product', 'Select at least one product.'), true);
            return;
          }
          var promptEl = ctx.container.querySelector('[data-creator-video-char-prompt]');
          var promptTxt = promptEl ? String(promptEl.value || '').trim() : '';
          var pUrls = ids.map(function (pid) {
            if (sel.top && String(sel.top.id || sel.top.product_id) === String(pid)) {
              return sel.top.image_url || null;
            }
            if (sel.addition && String(sel.addition.id || sel.addition.product_id) === String(pid)) {
              return sel.addition.image_url || null;
            }
            return null;
          });

          genBtn.disabled = true;
          showProdStatus(i18n('motion_character_generating', 'Generating…'), false);

          fetch(API_BASE + '?op=generate-content-publish-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              owner_id: owner,
              product_ids: ids,
              product_image_urls: pUrls,
              prompt: promptTxt,
              model_image_url: ctx._charModelUrl || undefined,
              background_image_url: ctx._charBgUrl || undefined,
              region: window.selectedVideoRegion || 'EU'
            })
          })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.ok && data.job_id) {
                ctx._motionCharDraftJobId = data.job_id;
                pollDraftJob(data.job_id);
              } else {
                genBtn.disabled = false;
                showProdStatus(data.error || i18n('motion_character_gen_failed', 'Generation failed.'), true);
              }
            })
            .catch(function () {
              genBtn.disabled = false;
              showProdStatus(i18n('network_error', 'Network error'), true);
            });
        });
      }

      if (regenBtn) {
        regenBtn.addEventListener('click', function () {
          ctx._motionCharDraftJobId = null;
          ctx._motionCharDraftResult = null;
          if (cfgStep) cfgStep.hidden = false;
          if (prevStep) prevStep.hidden = true;
          if (resultImg) resultImg.removeAttribute('src');
        });
      }

      if (confBtn) {
        confBtn.addEventListener('click', function () {
          var jid = ctx._motionCharDraftJobId;
          if (!jid) return;
          confBtn.disabled = true;
          fetch(API_BASE + '?op=save-content-publish-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ job_id: jid })
          })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              confBtn.disabled = false;
              if (data.ok && data.image_url) {
                setCharacterSlotImage(ctx, data.image_url);
                prodModal.hidden = true;
                resetMotionCharacterProductModal(ctx);
                refreshCharacterModalBodyClass(ctx);
                try {
                  if (window.ContentPublishImagesScreen && typeof window.ContentPublishImagesScreen.load === 'function') {
                    window.ContentPublishImagesScreen.load();
                  }
                } catch (e) {}
              } else {
                showProdStatus(data.error || i18n('motion_character_save_failed', 'Could not save image.'), true);
              }
            })
            .catch(function () {
              confBtn.disabled = false;
              showProdStatus(i18n('network_error', 'Network error'), true);
            });
        });
      }
    }

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!ctx.container || !document.body.contains(ctx.container)) return;
      if (prodModal && !prodModal.hidden) {
        prodModal.hidden = true;
        resetMotionCharacterProductModal(ctx);
        refreshCharacterModalBodyClass(ctx);
        return;
      }
      if (libModal && !libModal.hidden) {
        libModal.hidden = true;
        refreshCharacterModalBodyClass(ctx);
        return;
      }
      if (heroModal && !heroModal.hidden) {
        heroModal.hidden = true;
        refreshCharacterModalBodyClass(ctx);
        return;
      }
      if (sourceModal && !sourceModal.hidden) {
        closeSource();
      }
    });
  }

  function setupMotionInfoModal(ctx) {
    var modal = ctx.container.querySelector('[data-creator-video-motion-info-modal]');
    var openBtn = ctx.container.querySelector('[data-creator-video-motion-info-open]');
    if (!modal) return;

    function closeModal() {
      modal.hidden = true;
      try {
        document.body.classList.remove('creator-video-motion-info-modal-open');
      } catch (e) {}
    }
    function openModal(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      modal.hidden = false;
      try {
        document.body.classList.add('creator-video-motion-info-modal-open');
      } catch (err) {}
    }

    if (openBtn) {
      openBtn.addEventListener('click', openModal);
    }
    modal.querySelectorAll('[data-creator-video-motion-info-close]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        closeModal();
      });
    });
    var onKey = function (ev) {
      if (ev.key === 'Escape' && !modal.hidden) closeModal();
    };
    document.addEventListener('keydown', onKey);
  }

  function setupMotionReferenceUpload(ctx) {
    var area = ctx.container.querySelector('[data-creator-video-upload="motion-video"]');
    var input = ctx.container.querySelector('[data-creator-video-input="motion-video"]');
    var previewWrap = ctx.container.querySelector('[data-creator-video-motion-preview]');
    var placeholder = ctx.container.querySelector('[data-creator-video-motion-placeholder]');
    var videoEl = ctx.container.querySelector('[data-creator-video-motion-preview-video]');
    var removeBtn = ctx.container.querySelector('[data-creator-video-motion-remove]');
    var statusEl = ctx.container.querySelector('[data-creator-video-motion-upload-status]');
    if (!area || !input) return;

    function setMotionUploadStatus(msg) {
      if (!statusEl) return;
      if (msg) {
        statusEl.textContent = msg;
        statusEl.hidden = false;
      } else {
        statusEl.textContent = '';
        statusEl.hidden = true;
      }
    }

    function setPreviewVisible(show) {
      if (previewWrap) previewWrap.hidden = !show;
      if (placeholder) placeholder.hidden = show;
      if (area) area.classList.toggle('creator-video-motion-upload-area--has-video', !!show);
    }

    area.addEventListener('click', function (e) {
      if (e.target.closest('[data-creator-video-motion-remove]')) return;
      if (previewWrap && !previewWrap.hidden) return;
      input.click();
    });
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      setMotionUploadStatus('');
      uploadMotionReferenceVideo(file).then(function (result) {
        if (result.ok && result.url) {
          videoMotionReferenceUrl = result.url;
          if (videoEl) {
            videoEl.src = result.url;
            setPreviewVisible(true);
          }
          setMotionUploadStatus('');
        } else {
          videoMotionReferenceUrl = null;
          input.value = '';
          if (videoEl) {
            videoEl.removeAttribute('src');
            videoEl.load();
          }
          setPreviewVisible(false);
          var errLine = (result && result.message) ? String(result.message) : '';
          setMotionUploadStatus(
            errLine ||
              i18n('motion_upload_failed', 'Could not upload motion video. Try again or use a smaller file.')
          );
        }
        updateEazyVideoUi(ctx);
      });
    });
    if (removeBtn) {
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        videoMotionReferenceUrl = null;
        input.value = '';
        setMotionUploadStatus('');
        if (videoEl) {
          videoEl.removeAttribute('src');
          videoEl.load();
        }
        setPreviewVisible(false);
        updateEazyVideoUi(ctx);
      });
    }
  }

  function dispatchVideoJobCompleted(jobId, prompt, result, ok) {
    try {
      window.dispatchEvent(new CustomEvent('creatorJobCompleted', {
        detail: {
          jobId: jobId,
          job: { action: 'video-generate', prompt: prompt || '', done: true, saving: false, result: result || null },
          ok: ok !== false,
          ts: Date.now()
        }
      }));
    } catch (e) {}
  }

  function startVideoJobPolling(jobId, prompt, statusEl) {
    var pollCount = 0;
    var maxPolls = 240;
    var pollInterval = 2000;

    function pollJob() {
      var owner = getOwnerId();
      if (!owner) return;
      fetch(API_BASE + '?op=get-job&job_id=' + encodeURIComponent(jobId) + '&owner_id=' + encodeURIComponent(owner), {
        credentials: 'include'
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.ok || !d.job) {
            pollCount++;
            if (pollCount < maxPolls) setTimeout(pollJob, pollInterval);
            return;
          }
          var j = d.job;
          var status = String(j.status || '').toLowerCase();
          var failed =
            j.failed === true ||
            status === 'failed' ||
            status === 'error' ||
            status === 'canceled' ||
            status === 'cancelled' ||
            (j.done === true &&
              !(j.result && (j.result.video_url || j.result.original_url || j.result.url)));
          if (j.done || status === 'completed' || status === 'complete' || status === 'succeeded') {
            if (statusEl) {
              statusEl.textContent = failed
                ? (j.message || j.error || i18n('failed', 'Generation failed'))
                : i18n('status_done', 'Done! Check Content Publish → Videos.');
              statusEl.className = 'creator-hero-create-status ' + (failed ? 'error' : 'success');
            }
            dispatchVideoJobCompleted(jobId, prompt, j.result, !failed);
            try {
              if (window.CreatorNotificationsModal && window.CreatorNotificationsModal.loadNotificationsFromAPI) {
                window.CreatorNotificationsModal.loadNotificationsFromAPI();
              }
            } catch (e) {}
            try {
              if (window.CreatorVideosScreen && typeof window.CreatorVideosScreen.load === 'function') {
                window.CreatorVideosScreen.load();
              }
            } catch (e) {}
            return;
          }
          pollCount++;
          if (pollCount < maxPolls) setTimeout(pollJob, pollInterval);
        })
        .catch(function () {
          pollCount++;
          if (pollCount < maxPolls) setTimeout(pollJob, pollInterval);
        });
    }
    pollJob();
  }

  async function generateVideo(ctx) {
    var selected = window.selectedVideoProducts || {};
    var arr = [];
    if (selected.top) arr.push(selected.top);
    if (selected.addition) arr.push(selected.addition);
    var promptEl = ctx.container.querySelector('[data-creator-video-prompt]');
    var bubbleBtn = ctx.eazyStartBtn;
    var statusEl = ctx.statusEl;
    var opts = collectVideoOptions(ctx.container);

    if (!isVideoEazyReady(ctx)) return;

    var productIds = arr.map(function (p) { return p.id || p.product_id; }).filter(Boolean);
    var prompt = (promptEl && promptEl.value.trim()) ? promptEl.value.trim() : '';
    var owner = getOwnerId();
    if (!owner) {
      if (statusEl) { statusEl.textContent = i18n('error_owner', 'Missing owner'); statusEl.style.display = 'block'; }
      return;
    }

    var price = 2;
    var balance = null;
    var videoGenFree = false;
    try {
      var br = await fetch(API_BASE + '?op=get-balance&_t=' + Date.now() + '&owner_id=' + encodeURIComponent(owner), { credentials: 'include' });
      if (br.ok) {
        var bd = await br.json().catch(function () { return {}; });
        if (bd.ok) {
          var balRaw = bd.balance_total != null ? bd.balance_total : bd.balance_eaz;
          balance = balRaw != null ? Number(balRaw) : null;
          var rawV = bd.eaz_costs && bd.eaz_costs.video_generate;
          var inactive = !!(bd.eaz_feature_active && bd.eaz_feature_active.video_generate === false);
          var nv = rawV !== undefined && rawV !== null ? Number(rawV) : NaN;
          var eff = inactive ? 0 : (Number.isFinite(nv) ? nv : 2);
          videoGenFree = eff <= 0;
          price = videoGenFree ? 0 : eff;
        }
      }
    } catch (e) {}

    if (balance === null && window.getEazBalance) {
      try {
        balance = await window.getEazBalance();
      } catch (_e) {}
    }

    if (balance !== null && !videoGenFree && balance < price) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'creator-hero-create-status error';
        statusEl.textContent = i18n('not_enough_eaz', 'Not enough EAZ');
      }
      return;
    }

    if (bubbleBtn) bubbleBtn.disabled = true;
    if (statusEl) {
      statusEl.className = 'creator-hero-create-status';
      statusEl.textContent = i18n('starting', 'Starting…');
      statusEl.style.display = 'block';
    }

    try {
      var productImageUrls = arr.map(function (p) { return p.image_url; }).filter(Boolean);
      var body = {
        owner_id: owner,
        product_ids: productIds,
        prompt: prompt,
        source_image_url: videoSourceImageUrl || null,
        product_image_urls: productImageUrls,
        region: window.selectedVideoRegion || (
          window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveFromShopContext === 'function'
            ? window.CreatorHeroRegions.resolveFromShopContext()
            : 'EU'
        ),
        content_type: opts.content_type,
        model_version: opts.model_version,
        negative_prompt: opts.negative_prompt,
        motion_description: opts.motion_description,
        avatar_character: opts.avatar_character,
        avatar_script: opts.avatar_script,
        motion_video_url: opts.motion_video_url || null,
        character_orientation: opts.character_orientation,
        keep_original_sound: opts.keep_original_sound,
      };

      var res = await fetch(API_BASE + '?op=video-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return {}; });

      if (data.ok && data.job_id) {
        window.activeVideoJobs = window.activeVideoJobs || [];
        window.activeVideoJobs.push({
          jobId: data.job_id,
          status: 'queued',
          progress: 0,
          startedAt: Date.now(),
          prompt: prompt,
          type: 'video-generate'
        });

        try {
          window.dispatchEvent(new CustomEvent('creatorJobStarted', {
            detail: { jobId: data.job_id, type: 'video-generate', ownerId: owner }
          }));
        } catch (e) {}

        startVideoJobPolling(data.job_id, prompt, statusEl);

        if (window.CreatorChat && typeof window.CreatorChat.openJobs === 'function') {
          window.CreatorChat.openJobs({ focusJobId: data.job_id });
        }

        try {
          if (window.CreatorNotificationsModal && window.CreatorNotificationsModal.loadNotificationsFromAPI) {
            await window.CreatorNotificationsModal.loadNotificationsFromAPI();
          }
        } catch (e) {}
        try {
          if (window.EazCreatorBadge && window.EazCreatorBadge.refresh) await window.EazCreatorBadge.refresh();
        } catch (e) {}

        if (statusEl) {
          statusEl.textContent = i18n('track_jobs', 'Track progress under Active jobs in eazy chat.');
          statusEl.classList.add('success');
        }
      } else {
        if (statusEl) {
          statusEl.textContent = data.error || i18n('failed', 'Generation failed');
          statusEl.className = 'creator-hero-create-status error';
        }
      }
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = i18n('network_error', 'Network error');
        statusEl.className = 'creator-hero-create-status error';
      }
      console.error('[ContentCreationVideo] Generate error:', e);
    }

    if (bubbleBtn) bubbleBtn.disabled = false;
    updateEazyVideoUi(ctx);
  }

  function bind(ctx) {
    if (!ctx || !ctx.container) return;
    if (ctx.container.getAttribute('data-creator-video-bound') === '1') return;
    ctx.container.setAttribute('data-creator-video-bound', '1');
    render(ctx.container);

    ctx.container.querySelectorAll('[data-creator-video-generator-open]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        if (window.CreatorVideoGeneratorModal && typeof window.CreatorVideoGeneratorModal.open === 'function') {
          window.CreatorVideoGeneratorModal.open();
        }
      });
    });
  }

  function eazIsVideoCreationWorkspaceActive() {
    var viewport = document.getElementById('creatorMobileSwipeViewport');
    if (viewport) {
      if (!viewport.classList.contains('slide-3')) return false;
      var creation = document.getElementById('creatorMarketingPanelCreation');
      if (creation && creation.classList.contains('creator-marketing-panel--hidden')) return false;
      if (document.querySelector('.cmkt-card--child.is-active[data-mkt-for="content-creation"][data-mkt-child="videos"]')) {
        return true;
      }
      return !!document.querySelector('#creatorMarketingPanelCreation [data-content="videos"].is-active');
    }
    var desktopHero = document.getElementById('creatorDesktopHero');
    if (desktopHero) {
      if (String(desktopHero.getAttribute('data-desktop-active-screen') || '').toLowerCase() !== 'marketing') {
        return false;
      }
    }
    return !!document.querySelector(
      '#creatorDesktopMarketingHost [data-content="videos"].is-active, #creatorMarketing [data-content="videos"].is-active, ' +
      '.cmkt-card--child.is-active[data-mkt-for="content-creation"][data-mkt-child="videos"]'
    );
  }

  window.eazIsVideoCreationWorkspaceActive = eazIsVideoCreationWorkspaceActive;

  function init() {
    var hosts = document.querySelectorAll('[data-creator-video-host]');
    hosts.forEach(function (host) {
      var contextEl = host.closest('.creator-video-create-context');
      if (!contextEl) return;
      var eazyStartBtn = contextEl.querySelector('[data-creator-video-eazy-start]');
      var eazyBubbleWrap = contextEl.querySelector('[data-creator-video-eazy-bubble-wrap]');
      var statusEl = contextEl.querySelector('[data-creator-video-status]');
      bind({
        container: host,
        contextEl: contextEl,
        eazyStartBtn: eazyStartBtn,
        eazyBubbleWrap: eazyBubbleWrap,
        statusEl: statusEl
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ContentCreationVideo = { bind: bind, render: render, updateEazyVideoUi: updateEazyVideoUi };
})();
