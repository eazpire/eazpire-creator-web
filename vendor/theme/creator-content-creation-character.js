/**
 * Content Creation – Character Generator (IDEA-044)
 * Products + Character ref + Background + aspect ratios → content_publish_images (character)
 */
(function () {
  'use strict';

  var API_BASE =
    window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';

  window.selectedCharacterProducts = window.selectedCharacterProducts || { top: null, addition: null };
  window.selectedCharacterRegion =
    window.selectedCharacterRegion ||
    (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveFromShopContext === 'function'
      ? window.CreatorHeroRegions.resolveFromShopContext()
      : 'EU');

  var characterImageUrl = null;
  var backgroundImageUrl = null;
  var selectedRatio = '9:16';
  var charContexts = [];

  var RATIO_OPTIONS = [
    { ratio: '16:9', platform: 'YouTube' },
    { ratio: '9:16', platform: 'Shorts / TikTok' },
    { ratio: '1:1', platform: 'Instagram Feed' },
    { ratio: '4:5', platform: 'Instagram Portrait' },
  ];

  function i18n(key, fallback) {
    try {
      var hz = window.CreatorI18n && window.CreatorI18n.character_generator;
      if (hz && hz[key]) return hz[key];
      var he = window.CreatorI18n && window.CreatorI18n.hero_eazy;
      if (he && he[key]) return he[key];
    } catch (e) {}
    return fallback;
  }

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) {
      return String(window.__EAZ_OWNER_ID);
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  function adaptModalProductToHero(product) {
    if (!product) return { image_url: null, image_urls: [] };
    var urls = [];
    if (Array.isArray(product.images)) {
      product.images.forEach(function (im) {
        var u = (im && (im.src || im.url)) || null;
        if (u) urls.push(u);
      });
    }
    if (!urls.length && product.image_url) urls = [product.image_url];
    if (!urls.length && product.image) urls = [product.image];
    return { image_url: urls[0] || null, image_urls: urls };
  }

  function renderRatioGrid() {
    return (
      '<div class="ccg-ratio-section">' +
      '<p class="ccg-ratio-section__title">' +
      escapeAttr(i18n('ratio_section_title', 'Aspect ratio')) +
      '</p>' +
      '<div class="ccg-ratio-grid" data-ccg-ratio-grid role="group" aria-label="' +
      escapeAttr(i18n('ratio_section_title', 'Aspect ratio')) +
      '">' +
      RATIO_OPTIONS.map(function (opt) {
        var sel = opt.ratio === selectedRatio ? ' is-selected' : '';
        return (
          '<button type="button" class="ccg-ratio-card' +
          sel +
          '" data-ccg-ratio="' +
          escapeAttr(opt.ratio) +
          '" aria-pressed="' +
          (opt.ratio === selectedRatio ? 'true' : 'false') +
          '">' +
          '<span class="ccg-ratio-card__platform">' +
          escapeAttr(opt.platform) +
          '</span>' +
          '<span class="ccg-ratio-card__frame">' +
          '<span class="ccg-ratio-card__rect" data-ratio="' +
          escapeAttr(opt.ratio) +
          '">' +
          escapeAttr(opt.ratio) +
          '</span></span></button>'
        );
      }).join('') +
      '</div></div>'
    );
  }

  function getLockedRegionFromCurrentSelection() {
    var sel = window.selectedCharacterProducts || {};
    var top = sel.top;
    var addition = sel.addition;
    if (top && top.region) return top.region;
    if (addition && addition.region) return addition.region;
    return window.selectedCharacterRegion || null;
  }

  function render(container) {
    if (!container) return;
    // Same grid shell as Hero: selector (top) → uploads (left) + prompt+ratios (right)
    container.innerHTML =
      '<div class="creator-hero-upload-container">' +
      '<div class="creator-hero-product-selector">' +
      '<h3 class="creator-hero-product-selector-title">' +
      escapeAttr(i18n('select_products', 'Select products')) +
      '</h3>' +
      '<div class="creator-hero-product-grid">' +
      '<div class="creator-hero-product-category" data-category="top" data-ccg-category="top">' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h12M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6M6 12V8a2 2 0 012-2h8a2 2 0 012 2v4"/><path d="M10 8V4a2 2 0 012-2h0a2 2 0 012 2v4"/></svg>' +
      '<span class="creator-hero-product-label">Top</span>' +
      '<div class="creator-hero-product-preview" data-ccg-preview="top"><div class="creator-hero-preview-media" data-ccg-preview-media="top"></div><span class="creator-hero-product-preview-info" data-ccg-preview-info="top"></span><button type="button" class="creator-hero-product-preview-remove" data-ccg-remove="top" aria-label="Remove">×</button></div>' +
      '</div>' +
      '<div class="creator-hero-product-category creator-hero-product-category--disabled" data-category="bottom">' +
      '<span class="creator-hero-product-category-soon">Coming Soon</span>' +
      '<span class="creator-hero-product-label">Bottom</span></div>' +
      '<div class="creator-hero-product-category creator-hero-product-category--disabled" data-category="feet">' +
      '<span class="creator-hero-product-category-soon">Coming Soon</span>' +
      '<span class="creator-hero-product-label">Feet</span></div>' +
      '<div class="creator-hero-product-category" data-category="addition" data-ccg-category="addition">' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' +
      '<span class="creator-hero-product-label">Addition</span>' +
      '<div class="creator-hero-product-preview" data-ccg-preview="addition"><div class="creator-hero-preview-media" data-ccg-preview-media="addition"></div><span class="creator-hero-product-preview-info" data-ccg-preview-info="addition"></span><button type="button" class="creator-hero-product-preview-remove" data-ccg-remove="addition" aria-label="Remove">×</button></div>' +
      '</div></div></div>' +
      '<div class="creator-hero-upload-grid">' +
      '<div class="creator-hero-upload-area" data-ccg-upload="character">' +
      '<div class="creator-hero-upload-icon">👤</div>' +
      '<div class="creator-hero-upload-title">' +
      escapeAttr(i18n('character_label', 'Character')) +
      '</div>' +
      '<div class="creator-hero-upload-text">' +
      escapeAttr(i18n('character_upload_hint', 'Upload your character reference image')) +
      '</div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-ccg-input="character">' +
      '<div class="creator-hero-upload-preview" data-ccg-upload-preview="character"><img data-ccg-upload-img="character" alt=""><button type="button" class="creator-hero-upload-preview-remove" data-ccg-upload-remove="character">×</button></div>' +
      '</div>' +
      '<div class="creator-hero-upload-area" data-ccg-upload="background">' +
      '<div class="creator-hero-upload-icon">🌅</div>' +
      '<div class="creator-hero-upload-title">' +
      escapeAttr(i18n('background_label', 'Background')) +
      '</div>' +
      '<div class="creator-hero-upload-text">' +
      escapeAttr(i18n('background_upload_hint', 'Upload your background image')) +
      '</div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-ccg-input="background">' +
      '<div class="creator-hero-upload-preview" data-ccg-upload-preview="background"><img data-ccg-upload-img="background" alt=""><button type="button" class="creator-hero-upload-preview-remove" data-ccg-upload-remove="background">×</button></div>' +
      '</div></div>' +
      '<div class="creator-hero-prompt-section creator-hero-prompt-section--with-ratios">' +
      '<textarea class="creator-hero-prompt-input creator-hero-prompt-input--compact" data-ccg-prompt placeholder="' +
      escapeAttr(i18n('prompt_placeholder', 'Describe the character scene…')) +
      '" rows="3"></textarea>' +
      renderRatioGrid() +
      '</div></div>';
  }

  function setProductPreview(ctx, category, product) {
    var selected = window.selectedCharacterProducts || { top: null, addition: null };
    selected[category] = product;
    window.selectedCharacterProducts = selected;
    if (product && product.region) window.selectedCharacterRegion = product.region;

    var preview = ctx.container.querySelector('[data-ccg-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-ccg-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-ccg-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-ccg-category="' + category + '"]');
    if (preview && media && info && card) {
      var adapted = adaptModalProductToHero(product);
      var urls = adapted.image_urls && adapted.image_urls.length ? adapted.image_urls.slice() : adapted.image_url ? [adapted.image_url] : [];
      if (window.CreatorProductImageCarousel) {
        window.CreatorProductImageCarousel.attach(media, urls, {
          attrName: 'data-ccg-preview-img',
          attrValue: category,
        });
      } else if (urls.length) {
        media.innerHTML = '<img data-ccg-preview-img="' + category + '" src="' + escapeAttr(urls[0]) + '" alt="">';
      } else {
        media.innerHTML = '';
      }
      info.textContent = (product.title || product.name || '').slice(0, 30);
      preview.classList.add('show');
      card.classList.add('creator-hero-product-category--selected');
    }
    updateReady(ctx);
  }

  function clearProduct(ctx, category) {
    var selected = window.selectedCharacterProducts || { top: null, addition: null };
    selected[category] = null;
    window.selectedCharacterProducts = selected;
    var preview = ctx.container.querySelector('[data-ccg-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-ccg-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-ccg-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-ccg-category="' + category + '"]');
    if (media) media.innerHTML = '';
    if (info) info.textContent = '';
    if (preview) preview.classList.remove('show');
    if (card) card.classList.remove('creator-hero-product-category--selected');
    updateReady(ctx);
  }

  function isReady(ctx) {
    var sel = window.selectedCharacterProducts || {};
    return !!(sel.top || sel.addition);
  }

  function updateReady(ctx) {
    var btn = ctx && ctx.startBtn;
    if (btn) btn.disabled = !isReady(ctx) || !!ctx.generating;
  }

  function setStatus(ctx, msg, isError) {
    var el = ctx && ctx.statusEl;
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.style.color = isError ? '#f87171' : '';
  }

  function syncRatioUi(ctx) {
    if (!ctx || !ctx.container) return;
    ctx.container.querySelectorAll('[data-ccg-ratio]').forEach(function (btn) {
      var r = btn.getAttribute('data-ccg-ratio');
      var on = r === selectedRatio;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  async function uploadSlot(ctx, slot, file) {
    if (!file) return;
    var fd = new FormData();
    fd.append('image', file, file.name || slot + '.jpg');
    setStatus(ctx, i18n('uploading', 'Uploading…'), false);
    try {
      var res = await fetch(API_BASE + '?op=upload-hero-image', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok && data.url) {
        if (slot === 'character') characterImageUrl = data.url;
        else backgroundImageUrl = data.url;
        var preview = ctx.container.querySelector('[data-ccg-upload-preview="' + slot + '"]');
        var img = ctx.container.querySelector('[data-ccg-upload-img="' + slot + '"]');
        var area = ctx.container.querySelector('[data-ccg-upload="' + slot + '"]');
        if (img) img.src = data.url;
        if (preview) preview.classList.add('show');
        if (area) area.classList.add('has-image');
        setStatus(ctx, '', false);
      } else {
        setStatus(ctx, data.error || i18n('upload_failed', 'Upload failed'), true);
      }
    } catch (e) {
      setStatus(ctx, i18n('network_error', 'Network error'), true);
    }
  }

  function clearUpload(ctx, slot) {
    if (slot === 'character') characterImageUrl = null;
    else backgroundImageUrl = null;
    var preview = ctx.container.querySelector('[data-ccg-upload-preview="' + slot + '"]');
    var img = ctx.container.querySelector('[data-ccg-upload-img="' + slot + '"]');
    var area = ctx.container.querySelector('[data-ccg-upload="' + slot + '"]');
    var input = ctx.container.querySelector('[data-ccg-input="' + slot + '"]');
    if (img) img.src = '';
    if (preview) preview.classList.remove('show');
    if (area) area.classList.remove('has-image');
    if (input) input.value = '';
  }

  function collectProductPayload() {
    var sel = window.selectedCharacterProducts || {};
    var ids = [];
    var urls = [];
    ['top', 'addition'].forEach(function (k) {
      var p = sel[k];
      if (!p) return;
      var id = p.id || p.product_id;
      if (!id) return;
      ids.push(id);
      var adapted = adaptModalProductToHero(p);
      urls.push(adapted.image_url || null);
    });
    return { ids: ids, urls: urls };
  }

  async function pollAndSave(ctx, jobId) {
    var n = 0;
    var maxN = 90;
    function tick() {
      fetch(API_BASE + '?op=job-status&job_id=' + encodeURIComponent(jobId), {
        credentials: 'include',
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data || data.not_found) {
            ctx.generating = false;
            updateReady(ctx);
            setStatus(ctx, i18n('job_lost', 'Job not found.'), true);
            return;
          }
          if (!data.done) {
            n += 1;
            if (n < maxN) setTimeout(tick, 2000);
            else {
              ctx.generating = false;
              updateReady(ctx);
              setStatus(ctx, i18n('job_timeout', 'Still processing… check Active jobs.'), true);
            }
            return;
          }
          fetch(API_BASE + '?op=save-content-publish-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ job_id: jobId, source_kind: 'character' }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function (saveData) {
              ctx.generating = false;
              updateReady(ctx);
              if (saveData.ok) {
                var pids = collectProductPayload().ids;
                setStatus(ctx, i18n('saved', 'Character image saved to Assets.'), false);
                try {
                  document.dispatchEvent(
                    new CustomEvent('creator-character-image-saved', {
                      detail: {
                        id: saveData.id,
                        image_url: saveData.image_url,
                        product_ids: pids,
                      },
                    })
                  );
                } catch (e) {}
              } else {
                setStatus(ctx, saveData.error || i18n('save_failed', 'Could not save image.'), true);
              }
            })
            .catch(function () {
              ctx.generating = false;
              updateReady(ctx);
              setStatus(ctx, i18n('network_error', 'Network error'), true);
            });
        })
        .catch(function () {
          n += 1;
          if (n < maxN) setTimeout(tick, 2000);
          else {
            ctx.generating = false;
            updateReady(ctx);
            setStatus(ctx, i18n('network_error', 'Network error'), true);
          }
        });
    }
    tick();
  }

  async function generate(ctx) {
    if (!isReady(ctx) || ctx.generating) return;
    var owner = getOwnerId();
    if (!owner) {
      setStatus(ctx, i18n('error_owner', 'Missing owner'), true);
      return;
    }
    var products = collectProductPayload();
    if (!products.ids.length) {
      setStatus(ctx, i18n('need_product', 'Select at least one product.'), true);
      return;
    }
    var promptEl = ctx.container.querySelector('[data-ccg-prompt]');
    var prompt = promptEl ? String(promptEl.value || '').trim() : '';

    ctx.generating = true;
    updateReady(ctx);
    setStatus(ctx, i18n('generating', 'Generating…'), false);

    try {
      var res = await fetch(API_BASE + '?op=generate-content-publish-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          owner_id: owner,
          product_ids: products.ids,
          product_image_urls: products.urls,
          prompt: prompt,
          model_image_url: characterImageUrl || undefined,
          background_image_url: backgroundImageUrl || undefined,
          aspect_ratio: selectedRatio,
          region: window.selectedCharacterRegion || 'EU',
          asset_kind: 'character',
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok && data.job_id) {
        try {
          window.dispatchEvent(
            new CustomEvent('creatorJobStarted', {
              detail: { jobId: data.job_id, type: 'content-publish-image', ownerId: owner },
            })
          );
        } catch (e) {}
        setStatus(ctx, i18n('queued', 'Queued… tracking in Active jobs.'), false);
        pollAndSave(ctx, data.job_id);
      } else {
        ctx.generating = false;
        updateReady(ctx);
        setStatus(ctx, data.error || i18n('generate_failed', 'Generation failed.'), true);
      }
    } catch (e) {
      ctx.generating = false;
      updateReady(ctx);
      setStatus(ctx, i18n('network_error', 'Network error'), true);
    }
  }

  function openProductPicker(ctx, category) {
    var modalCategory = category === 'addition' ? 'additional' : 'top';
    var onPick = function (product) {
      if (!product) return;
      setProductPreview(ctx, category, product);
    };
    var opts = { lockedRegion: getLockedRegionFromCurrentSelection() };
    var modalEl = document.getElementById('hero-product-selection-modal');
    if (typeof window.openHeroProductSelectionModalSimple === 'function') {
      if (!modalEl) {
        console.error('[ContentCreationCharacter] Product modal markup missing (#hero-product-selection-modal)');
        alert('Produktauswahl-Modal nicht verfügbar.');
        return;
      }
      window.openHeroProductSelectionModalSimple(modalCategory, onPick, opts);
      return;
    }
    if (typeof window.openHeroProductSelectionModal === 'function') {
      window.openHeroProductSelectionModal(modalCategory, onPick, opts);
      return;
    }
    console.error('[ContentCreationCharacter] openHeroProductSelectionModalSimple missing');
    alert('Produktauswahl-Modal nicht verfügbar.');
  }

  function refreshBoundHost(ctx) {
    if (!ctx || !ctx.container) return;
    try {
      var sel = window.selectedCharacterProducts || {};
      if (sel.top) setProductPreview(ctx, 'top', sel.top);
      if (sel.addition) setProductPreview(ctx, 'addition', sel.addition);
      if (characterImageUrl) {
        var cPrev = ctx.container.querySelector('[data-ccg-upload-preview="character"]');
        var cImg = ctx.container.querySelector('[data-ccg-upload-img="character"]');
        var cArea = ctx.container.querySelector('[data-ccg-upload="character"]');
        if (cImg) cImg.src = characterImageUrl;
        if (cPrev) cPrev.classList.add('show');
        if (cArea) cArea.classList.add('has-image');
      }
      if (backgroundImageUrl) {
        var bPrev = ctx.container.querySelector('[data-ccg-upload-preview="background"]');
        var bImg = ctx.container.querySelector('[data-ccg-upload-img="background"]');
        var bArea = ctx.container.querySelector('[data-ccg-upload="background"]');
        if (bImg) bImg.src = backgroundImageUrl;
        if (bPrev) bPrev.classList.add('show');
        if (bArea) bArea.classList.add('has-image');
      }
      syncRatioUi(ctx);
      updateReady(ctx);
    } catch (e) {
      console.warn('[ContentCreationCharacter] refreshBoundHost failed', e);
    }
  }

  /**
   * Match Hero: render once, bind once. Re-scan on modal open must NOT wipe listeners.
   */
  function bind(ctx) {
    if (!ctx || !ctx.container) return;

    if (ctx.container.getAttribute('data-ccg-form-bound') === '1') {
      var existingIx = charContexts.findIndex(function (c) {
        return c.container === ctx.container;
      });
      if (existingIx >= 0) {
        charContexts[existingIx].contextEl = ctx.contextEl || charContexts[existingIx].contextEl;
        charContexts[existingIx].startBtn = ctx.startBtn || charContexts[existingIx].startBtn;
        charContexts[existingIx].statusEl = ctx.statusEl || charContexts[existingIx].statusEl;
        refreshBoundHost(charContexts[existingIx]);
      } else {
        charContexts.push(ctx);
        refreshBoundHost(ctx);
      }
      return;
    }

    try {
      ctx.container.setAttribute('data-ccg-form-bound', '1');
      render(ctx.container);

      ctx.container.querySelectorAll('[data-ccg-category]').forEach(function (card) {
        card.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('[data-ccg-remove]')) return;
          if (e.target && e.target.closest && e.target.closest('.creator-product-image-carousel__btn')) return;
          var cat = card.getAttribute('data-ccg-category');
          openProductPicker(ctx, cat);
        });
      });
      ctx.container.querySelectorAll('[data-ccg-remove]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          clearProduct(ctx, btn.getAttribute('data-ccg-remove'));
        });
      });

      ['character', 'background'].forEach(function (slot) {
        var area = ctx.container.querySelector('[data-ccg-upload="' + slot + '"]');
        var input = ctx.container.querySelector('[data-ccg-input="' + slot + '"]');
        var remove = ctx.container.querySelector('[data-ccg-upload-remove="' + slot + '"]');
        if (area) {
          area.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('[data-ccg-upload-remove]')) return;
            if (window.CreatorImageAddMedia && typeof window.CreatorImageAddMedia.open === 'function') {
              window.CreatorImageAddMedia.open({
                purpose: 'character-' + slot,
                onUrl: function (url) {
                  if (slot === 'character') characterImageUrl = url;
                  else backgroundImageUrl = url;
                  var preview = ctx.container.querySelector('[data-ccg-upload-preview="' + slot + '"]');
                  var img = ctx.container.querySelector('[data-ccg-upload-img="' + slot + '"]');
                  if (img) img.src = url;
                  if (preview) preview.classList.add('show');
                  area.classList.add('has-image');
                },
                onFile: function (file) {
                  uploadSlot(ctx, slot, file);
                },
              });
              return;
            }
            if (input) input.click();
          });
        }
        if (input) {
          input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            if (file) uploadSlot(ctx, slot, file);
          });
        }
        if (remove) {
          remove.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            clearUpload(ctx, slot);
          });
        }
      });

      ctx.container.querySelectorAll('[data-ccg-ratio]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectedRatio = btn.getAttribute('data-ccg-ratio') || '9:16';
          syncRatioUi(ctx);
        });
      });

      var promptEl = ctx.container.querySelector('[data-ccg-prompt]');
      if (promptEl) {
        promptEl.addEventListener('input', function () {
          updateReady(ctx);
        });
      }

      if (ctx.startBtn) {
        ctx.startBtn.addEventListener('click', function () {
          if (ctx.startBtn.disabled) return;
          generate(ctx);
        });
      }

      charContexts = charContexts.filter(function (c) {
        return c.container && document.body.contains(c.container);
      });
      charContexts.push(ctx);
      syncRatioUi(ctx);
      updateReady(ctx);
    } catch (err) {
      console.error('[ContentCreationCharacter] bind failed', err);
      try {
        ctx.container.removeAttribute('data-ccg-form-bound');
      } catch (_e) {}
    }
  }

  function scanHosts() {
    document.querySelectorAll('[data-creator-character-host]').forEach(function (host) {
      var contextEl =
        host.closest('.creator-hero-create-context') ||
        document.getElementById('creatorCharacterGeneratorModalContext');
      bind({
        container: host,
        contextEl: contextEl,
        startBtn: contextEl ? contextEl.querySelector('[data-ccg-eazy-start]') : null,
        statusEl: contextEl ? contextEl.querySelector('[data-ccg-status]') : null,
        generating: false,
      });
    });
  }

  function init() {
    try {
      scanHosts();
    } catch (err) {
      console.error('[ContentCreationCharacter] init failed', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ContentCreationCharacter = {
    scanHosts: scanHosts,
    getSelectedRatio: function () {
      return selectedRatio;
    },
  };
})();
