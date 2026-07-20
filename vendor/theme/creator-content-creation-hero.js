/**
 * Content Creation – Hero Images
 * Eazy mascot + speech bubble → confirm → Eazy chat (Active jobs) → notifications on complete
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');
  window.selectedHeroProducts = window.selectedHeroProducts || { top: null, addition: null };
  window.selectedHeroRegion = window.selectedHeroRegion || (
    window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveFromShopContext === 'function'
      ? window.CreatorHeroRegions.resolveFromShopContext()
      : 'EU'
  );
  var modelImageUrl = null;
  var backgroundImageUrl = null;
  /** Registered bind contexts for refresh after DOM moves (e.g. desktop marketing mount). */
  var heroEazyContexts = [];

  /** Push auto-picked selection into every bound hero host (Marketing mobile + desktop). */
  function syncProductUiFromSelection(promptText) {
    var sel = window.selectedHeroProducts || {};
    var ptxt =
      promptText != null && String(promptText).trim()
        ? String(promptText).trim()
        : window.__heroMarketingAutoPrompt && String(window.__heroMarketingAutoPrompt).trim()
          ? String(window.__heroMarketingAutoPrompt).trim()
          : '';
    heroEazyContexts.forEach(function (ctx) {
      try {
        if (sel.top) setProductPreview(ctx, 'top', sel.top);
        if (sel.addition) setProductPreview(ctx, 'addition', sel.addition);
        var pe = ctx.container.querySelector('[data-creator-hero-prompt]');
        if (pe && ptxt && !String(pe.value || '').trim()) {
          pe.value = ptxt;
        }
        updateEazyHeroUi(ctx);
      } catch (e) {}
    });
  }

  document.addEventListener('heroAutoPickProducts', function (ev) {
    var d = ev && ev.detail;
    if (!d || !d.top || !d.addition) return;
    if (d.prompt && String(d.prompt).trim()) {
      try {
        window.__heroMarketingAutoPrompt = String(d.prompt).trim();
      } catch (_e) {}
    }
    syncProductUiFromSelection(d.prompt);
  });

  function i18n(key, fallback) {
    try {
      var hz = window.CreatorI18n && window.CreatorI18n.hero_eazy;
      if (hz && hz[key]) return hz[key];
      if (window.CreatorI18n && window.CreatorI18n[key]) return window.CreatorI18n[key];
    } catch (e) {}
    return fallback;
  }

  function eazFreeLabel() {
    return (window.CreatorI18n && window.CreatorI18n.eaz_free) || 'Free';
  }

  function parseHeroCostFromBalancePayload(payload) {
    var fallback = 0.5;
    if (!payload || payload.ok === false) {
      return { eff: fallback, isFree: false };
    }
    var raw = payload.eaz_costs && payload.eaz_costs.hero_generate;
    var inactive = !!(payload.eaz_feature_active && payload.eaz_feature_active.hero_generate === false);
    var n = raw !== undefined && raw !== null ? Number(raw) : NaN;
    var eff = inactive ? 0 : (Number.isFinite(n) ? n : fallback);
    var isFree = eff <= 0;
    return { eff: isFree ? 0 : eff, isFree: isFree };
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
    return ctx.contextEl.querySelector('.creator-hero-eazy-footer');
  }

  function updateEazyHeroUi(ctx) {
    var footer = getEazyFooter(ctx);
    var bubbleBtn = ctx && ctx.eazyStartBtn;
    if (!footer || !bubbleBtn) return;

    var selected = window.selectedHeroProducts || {};
    var arr = [];
    if (selected.top) arr.push(selected.top);
    if (selected.addition) arr.push(selected.addition);
    var hasProducts = arr.length > 0;
    /** Bubble appears once at least one product is selected (prompt/uploads optional). */
    var ready = hasProducts;

    footer.classList.toggle('creator-hero-eazy-footer--ready', ready);
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
      '<div class="creator-hero-upload-container">' +
      '<div class="creator-hero-product-selector">' +
      '<h3 class="creator-hero-product-selector-title">Produkte auswählen</h3>' +
      '<div class="creator-hero-product-grid">' +
      '<div class="creator-hero-product-category" data-category="top" data-creator-hero-category="top">' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 12h12M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6M6 12V8a2 2 0 012-2h8a2 2 0 012 2v4"/><path d="M10 8V4a2 2 0 012-2h0a2 2 0 012 2v4"/></svg>' +
      '<span class="creator-hero-product-label">Top</span>' +
      '<div class="creator-hero-product-preview" data-creator-hero-preview="top"><div class="creator-hero-preview-media" data-creator-hero-preview-media="top"></div><span class="creator-hero-product-preview-info" data-creator-hero-preview-info="top"></span><button type="button" class="creator-hero-product-preview-remove" data-creator-hero-remove="top" aria-label="Entfernen">×</button></div>' +
      '</div>' +
      '<div class="creator-hero-product-category creator-hero-product-category--disabled" data-category="bottom">' +
      '<span class="creator-hero-product-category-soon">Coming Soon</span>' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6M9 12v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6M9 12V8a2 2 0 012-2h2a2 2 0 012 2v4"/><path d="M9 8V4a2 2 0 012-2h2a2 2 0 012 2v4"/></svg>' +
      '<span class="creator-hero-product-label">Bottom</span>' +
      '</div>' +
      '<div class="creator-hero-product-category creator-hero-product-category--disabled" data-category="feet">' +
      '<span class="creator-hero-product-category-soon">Coming Soon</span>' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8c0 4.418-4.03 8-9 8a9 9 0 019-8z"/><path d="M12 8V2"/><path d="M6 8v2"/><path d="M18 8v2"/></svg>' +
      '<span class="creator-hero-product-label">Feet</span>' +
      '</div>' +
      '<div class="creator-hero-product-category" data-category="addition" data-creator-hero-category="addition">' +
      '<svg class="creator-hero-product-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>' +
      '<span class="creator-hero-product-label">Addition</span>' +
      '<div class="creator-hero-product-preview" data-creator-hero-preview="addition"><div class="creator-hero-preview-media" data-creator-hero-preview-media="addition"></div><span class="creator-hero-product-preview-info" data-creator-hero-preview-info="addition"></span><button type="button" class="creator-hero-product-preview-remove" data-creator-hero-remove="addition" aria-label="Entfernen">×</button></div>' +
      '</div>' +
      '</div></div>' +
      '<div class="creator-hero-upload-grid">' +
      '<div class="creator-hero-upload-area" data-hero-slot="model" data-creator-hero-upload="model">' +
      '<div class="creator-hero-upload-icon">👤</div>' +
      '<div class="creator-hero-upload-title">Model</div>' +
      '<div class="creator-hero-upload-text">Upload your mock model image</div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-creator-hero-input="model">' +
      '<div class="creator-hero-upload-preview" data-creator-hero-upload-preview="model"><img data-creator-hero-upload-img="model" alt=""><button type="button" class="creator-hero-upload-preview-remove" data-creator-hero-upload-remove="model">×</button></div>' +
      '</div>' +
      '<div class="creator-hero-upload-area" data-hero-slot="background" data-creator-hero-upload="background">' +
      '<div class="creator-hero-upload-icon">🌅</div>' +
      '<div class="creator-hero-upload-title">Background</div>' +
      '<div class="creator-hero-upload-text">Upload your mock background image</div>' +
      '<input type="file" accept="image/*" class="creator-hero-upload-input" data-creator-hero-input="background">' +
      '<div class="creator-hero-upload-preview" data-creator-hero-upload-preview="background"><img data-creator-hero-upload-img="background" alt=""><button type="button" class="creator-hero-upload-preview-remove" data-creator-hero-upload-remove="background">×</button></div>' +
      '</div>' +
      '</div>' +
      '<div class="creator-hero-prompt-section">' +
      '<textarea class="creator-hero-prompt-input" data-creator-hero-prompt placeholder="Add any additional information for your hero image..." rows="3"></textarea>' +
      '</div>' +
      '</div>';
  }

  /**
   * @param {object} product - Modal-shaped row (images[], variants, …). Keep RAW in selectedHeroProducts — never the return value of adaptModalProductToHero, or the next sync loses image sources.
   */
  function setProductPreview(ctx, category, product) {
    var selected = window.selectedHeroProducts || { top: null, addition: null };
    selected[category] = product;
    window.selectedHeroProducts = selected;
    if (product && product.region) {
      window.selectedHeroRegion = product.region;
    }

    var preview = ctx.container.querySelector('[data-creator-hero-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-creator-hero-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-creator-hero-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-creator-hero-category="' + category + '"]');

    if (preview && media && info && card) {
      var adapted = adaptModalProductToHero(product);
      var urls = [];
      if (adapted.image_urls && adapted.image_urls.length) urls = adapted.image_urls.slice();
      else if (adapted.image_url) urls = [adapted.image_url];
      if (window.CreatorProductImageCarousel) {
        window.CreatorProductImageCarousel.attach(media, urls, { attrName: 'data-creator-hero-preview-img', attrValue: category });
      } else if (urls.length) {
        media.innerHTML = '<img data-creator-hero-preview-img="' + category + '" src="' + escapeAttr(urls[0]) + '" alt="">';
      } else {
        media.innerHTML = '';
      }
      info.textContent = (product.title || product.name || '').slice(0, 30);
      preview.classList.add('show');
      card.classList.add('creator-hero-product-category--selected');
    }
    updateEazyHeroUi(ctx);
  }

  function clearHeroUploadVisual(ctx, slot) {
    if (slot === 'model') modelImageUrl = null;
    else backgroundImageUrl = null;
    var area = ctx.container.querySelector('[data-creator-hero-upload="' + slot + '"]');
    var preview = ctx.container.querySelector('[data-creator-hero-upload-preview="' + slot + '"]');
    var img = ctx.container.querySelector('[data-creator-hero-upload-img="' + slot + '"]');
    if (img) img.src = '';
    if (preview) preview.classList.remove('show');
    if (area) area.classList.remove('has-image');
  }

  /** After successful “start generation”, clear all slots (products, prompt, model/background uploads). */
  function resetHeroMarketingWorkspace() {
    try {
      window.__heroMarketingAutoPickDone = true;
    } catch (_e) {}
    try {
      window.__heroMarketingAutoPrompt = '';
    } catch (_e2) {}
    window.selectedHeroProducts = { top: null, addition: null };
    try {
      if (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveFromShopContext === 'function') {
        window.selectedHeroRegion = window.CreatorHeroRegions.resolveFromShopContext();
      }
    } catch (_e3) {}

    heroEazyContexts.forEach(function (ctx) {
      try {
        removeProduct(ctx, 'top');
        removeProduct(ctx, 'addition');
        clearHeroUploadVisual(ctx, 'model');
        clearHeroUploadVisual(ctx, 'background');
        var pe = ctx.container.querySelector('[data-creator-hero-prompt]');
        if (pe) pe.value = '';
      } catch (_c) {}
      try {
        updateEazyHeroUi(ctx);
      } catch (_u) {}
    });
    try {
      document.querySelectorAll('[data-creator-hero-prompt]').forEach(function (el) {
        el.value = '';
      });
    } catch (_p) {}
    try {
      document.dispatchEvent(new CustomEvent('categorySelectionChanged'));
    } catch (_ev) {}
    try {
      window.dispatchEvent(new CustomEvent('heroLocalUploadPreviewChanged'));
    } catch (_ev2) {}
  }

  function removeProduct(ctx, category) {
    var selected = window.selectedHeroProducts || {};
    selected[category] = null;
    window.selectedHeroProducts = selected;
    if (selected.top && selected.top.region) {
      window.selectedHeroRegion = selected.top.region;
    } else if (selected.addition && selected.addition.region) {
      window.selectedHeroRegion = selected.addition.region;
    } else if (!selected.top && !selected.addition) {
      window.selectedHeroRegion = null;
    }

    var preview = ctx.container.querySelector('[data-creator-hero-preview="' + category + '"]');
    var media = ctx.container.querySelector('[data-creator-hero-preview-media="' + category + '"]');
    var info = ctx.container.querySelector('[data-creator-hero-preview-info="' + category + '"]');
    var card = ctx.container.querySelector('[data-creator-hero-category="' + category + '"]');

    if (preview && media && info && card) {
      media.innerHTML = '';
      preview.classList.remove('show');
      card.classList.remove('creator-hero-product-category--selected');
    }
    updateEazyHeroUi(ctx);
  }

  function normalizeShopifyProductIdForHero(raw) {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.trunc(raw));
    var s = String(raw).trim();
    var m = s.match(/^(\d+)(?:\.0+)?$/);
    if (m) return m[1];
    return s;
  }

  function isUsableProductImageUrl(u) {
    if (u == null || typeof u !== 'string') return false;
    u = u.trim();
    if (!u) return false;
    if (u.indexOf('blob:') === 0) return false;
    if (u.indexOf('data:') === 0) return false;
    if (/^https?:\/\//i.test(u)) return true;
    if (u.indexOf('//') === 0) return true;
    /** Published/API rows sometimes use root-relative CDN paths; same-origin <img src> resolves them. */
    if (u.charAt(0) === '/' && u.length > 1) return true;
    return false;
  }

  function normalizeImageUrlForAttrs(u) {
    if (u == null || typeof u !== 'string') return '';
    return String(u).trim().replace(/&amp;/g, '&');
  }

  /** Root-relative shop CDN URLs must resolve on the storefront host (creator dashboard is same origin). */
  function absolutizeShopImageUrl(u) {
    if (u == null || typeof u !== 'string') return '';
    var s = normalizeImageUrlForAttrs(u);
    if (!s) return '';
    if (s.indexOf('blob:') === 0 || s.indexOf('data:') === 0) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.indexOf('//') === 0) return 'https:' + s;
    if (s.charAt(0) === '/') {
      try {
        if (typeof window !== 'undefined' && window.location && window.location.origin) {
          return new URL(s, window.location.origin).href;
        }
      } catch (_e) {}
      return s;
    }
    return s;
  }

  function adaptModalProductToHero(p) {
    var chosenRaw = (p && p.hero_generation_image_url && String(p.hero_generation_image_url).trim()) || '';
    var chosen = isUsableProductImageUrl(chosenRaw) ? normalizeImageUrlForAttrs(chosenRaw) : '';
    var urls = [];
    if (chosen) urls.push(chosen);
    /** Second pass: selection already normalized (avoid empty URLs after re-bind). */
    if (p && Array.isArray(p.image_urls) && p.image_urls.length) {
      for (var pi = 0; pi < p.image_urls.length; pi++) {
        var pu = p.image_urls[pi] ? normalizeImageUrlForAttrs(String(p.image_urls[pi])) : '';
        if (pu && isUsableProductImageUrl(pu) && urls.indexOf(pu) === -1) urls.push(pu);
      }
    }
    if (p && p.image_url) {
      var piu = normalizeImageUrlForAttrs(String(p.image_url));
      if (piu && isUsableProductImageUrl(piu) && urls.indexOf(piu) === -1) urls.push(piu);
    }
    var rest = window.CreatorProductImageCarousel ? window.CreatorProductImageCarousel.collectImageUrls(p) : [];
    for (var ri = 0; ri < rest.length; ri++) {
      var ru = rest[ri] ? normalizeImageUrlForAttrs(rest[ri]) : '';
      if (ru && isUsableProductImageUrl(ru) && urls.indexOf(ru) === -1) urls.push(ru);
    }
    if (p && p.images && p.images.length) {
      for (var ii = 0; ii < p.images.length; ii++) {
        var im = p.images[ii];
        var iu = im && (im.src || im.url || (typeof im === 'string' ? im : null));
        iu = iu ? normalizeImageUrlForAttrs(iu) : '';
        if (iu && isUsableProductImageUrl(iu) && urls.indexOf(iu) === -1) urls.push(iu);
      }
    }
    if (p && p.image) {
      var direct = typeof p.image === 'string' ? p.image : (p.image.src || p.image.url || '');
      direct = direct ? normalizeImageUrlForAttrs(direct) : '';
      if (direct && isUsableProductImageUrl(direct) && urls.indexOf(direct) === -1) urls.push(direct);
    }
    if (p && p.selected_variant_id && Array.isArray(p.variants)) {
      var sv = String(p.selected_variant_id);
      for (var vi = 0; vi < p.variants.length; vi++) {
        var v = p.variants[vi];
        if (!v || String(v.id) !== sv) continue;
        var vu = v.image ? (typeof v.image === 'string' ? v.image : (v.image.src || v.image.url || '')) : '';
        vu = vu ? normalizeImageUrlForAttrs(vu) : '';
        if (vu && isUsableProductImageUrl(vu) && urls.indexOf(vu) === -1) urls.push(vu);
      }
    }
    if (p && p.featured_image) {
      var ff = typeof p.featured_image === 'string' ? p.featured_image : (p.featured_image.src || p.featured_image.url || '');
      ff = ff ? normalizeImageUrlForAttrs(String(ff)) : '';
      if (ff && isUsableProductImageUrl(ff) && urls.indexOf(ff) === -1) urls.push(ff);
    }
    var img = urls[0] || null;
    if (!img && p && p.images && p.images[0]) {
      var fb = p.images[0].src || p.images[0].url || p.images[0];
      if (fb) img = normalizeImageUrlForAttrs(String(fb));
    }
    if (!img && p && p.image) {
      var fi = typeof p.image === 'string' ? p.image : (p.image.src || p.image.url || p.image);
      if (fi) img = normalizeImageUrlForAttrs(String(fi));
    }
    var outUrls = [];
    for (var ui = 0; ui < urls.length; ui++) {
      var au = absolutizeShopImageUrl(urls[ui]);
      if (au && outUrls.indexOf(au) === -1) outUrls.push(au);
    }
    urls = outUrls;
    img = img ? absolutizeShopImageUrl(img) : null;
    if (!img && urls.length) img = urls[0];
    var variantRaw = p.selected_variant_id != null ? p.selected_variant_id : p.variantId;
    var variantIdStr = variantRaw != null ? String(variantRaw).trim() : '';
    var variantNumeric = variantIdStr ? String(variantIdStr).replace(/\D/g, '') : '';
    var pid = normalizeShopifyProductIdForHero(p.id != null ? p.id : p.product_id);
    return {
      id: pid,
      product_id: pid,
      title: p.title || p.name || 'Product',
      image_url: img,
      image_urls: urls.length ? urls : (img ? [img] : []),
      region: p.region || null,
      variant_id: variantIdStr || null,
      shopify_variant_id: variantNumeric || null
    };
  }

  function getLockedRegionFromCurrentSelection() {
    var selected = window.selectedHeroProducts || {};
    if (selected.top && selected.top.region) return selected.top.region;
    if (selected.addition && selected.addition.region) return selected.addition.region;
    return null;
  }

  async function uploadImage(file, slot) {
    var owner = getOwnerId();
    if (!owner) return null;
    var fd = new FormData();
    fd.append('image', file, file.name || (slot + '.jpg'));
    try {
      var res = await fetch(API_BASE + '?op=upload-hero-image&owner_id=' + encodeURIComponent(owner), {
        method: 'POST',
        credentials: 'include',
        body: fd
      });
      var data = await res.json().catch(function () { return {}; });
      return data.ok && data.image_url ? data.image_url : null;
    } catch (e) {
      console.warn('[ContentCreationHero] Upload error:', e);
      return null;
    }
  }

  function applyHeroSlotUrl(ctx, slot, url) {
    if (!url) return;
    if (slot === 'model') modelImageUrl = url;
    else backgroundImageUrl = url;
    var preview = ctx.container.querySelector('[data-creator-hero-upload-preview="' + slot + '"]');
    var img = ctx.container.querySelector('[data-creator-hero-upload-img="' + slot + '"]');
    var area = ctx.container.querySelector('[data-creator-hero-upload="' + slot + '"]');
    if (img) img.src = url;
    if (preview) preview.classList.add('show');
    if (area) area.classList.add('has-image');
    updateEazyHeroUi(ctx);
  }

  function setupUploadArea(ctx, slot) {
    var area = ctx.container.querySelector('[data-creator-hero-upload="' + slot + '"]');
    var input = ctx.container.querySelector('[data-creator-hero-input="' + slot + '"]');
    var preview = ctx.container.querySelector('[data-creator-hero-upload-preview="' + slot + '"]');
    var img = ctx.container.querySelector('[data-creator-hero-upload-img="' + slot + '"]');
    var removeBtn = preview && preview.querySelector('[data-creator-hero-upload-remove="' + slot + '"]');

    if (!area) return;

    area.addEventListener('click', function (e) {
      if (e.target.closest('.creator-hero-upload-preview-remove')) return;
      if (window.CreatorImageAddMedia && typeof window.CreatorImageAddMedia.open === 'function') {
        window.CreatorImageAddMedia.open({
          purpose: 'hero-' + slot,
          onUrl: function (url) {
            applyHeroSlotUrl(ctx, slot, url);
          },
          onFile: function (file) {
            if (!file || !String(file.type || '').startsWith('image/')) return;
            var localUrl = URL.createObjectURL(file);
            if (img) {
              img.src = localUrl;
              img.onload = function () {
                URL.revokeObjectURL(localUrl);
              };
            }
            if (preview) preview.classList.add('show');
            if (area) area.classList.add('has-image');
            updateEazyHeroUi(ctx);
            uploadImage(file, slot).then(function (uploadedUrl) {
              applyHeroSlotUrl(ctx, slot, uploadedUrl || localUrl);
            });
          },
        });
        return;
      }
      if (input) input.click();
    });

    if (input) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        input.value = '';
        if (!file || !file.type.startsWith('image/')) return;
        var url = URL.createObjectURL(file);
        if (img) {
          img.src = url;
          img.onload = function () {
            URL.revokeObjectURL(url);
          };
        }
        if (preview) preview.classList.add('show');
        if (area) area.classList.add('has-image');
        updateEazyHeroUi(ctx);
        uploadImage(file, slot).then(function (uploadedUrl) {
          if (slot === 'model') modelImageUrl = uploadedUrl;
          else backgroundImageUrl = uploadedUrl;
          if (!uploadedUrl && img) img.src = url;
          updateEazyHeroUi(ctx);
        });
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (slot === 'model') modelImageUrl = null;
        else backgroundImageUrl = null;
        if (img) img.src = '';
        if (preview) preview.classList.remove('show');
        if (area) area.classList.remove('has-image');
        updateEazyHeroUi(ctx);
      });
    }
  }

  function buildSummaryLines(ctx, arr, promptText) {
    var lines = [];
    lines.push('• ' + i18n('summary_products', 'Products') + ': ' + arr.length);
    arr.forEach(function (p, i) {
      lines.push('  – ' + (p.title || ('#' + (i + 1))));
    });
    if (promptText) {
      var short = promptText.length > 160 ? promptText.slice(0, 160) + '…' : promptText;
      lines.push('• ' + i18n('summary_prompt', 'Prompt') + ': ' + short);
    } else {
      lines.push('• ' + i18n('summary_prompt', 'Prompt') + ': ' + i18n('default_prompt_note', '(default scene)'));
    }
    lines.push('• ' + i18n('summary_model', 'Model image') + ': ' + (modelImageUrl ? i18n('yes', 'Yes') : i18n('no', 'No')));
    lines.push('• ' + i18n('summary_background', 'Background image') + ': ' + (backgroundImageUrl ? i18n('yes', 'Yes') : i18n('no', 'No')));
    var reg = window.selectedHeroRegion || (window.CreatorHeroRegions && window.CreatorHeroRegions.resolveFromShopContext ? window.CreatorHeroRegions.resolveFromShopContext() : 'EU');
    lines.push('• ' + i18n('summary_region', 'Region') + ': ' + reg);
    return lines;
  }

  function showHeroEazyConfirm(summaryLines, priceFmt, balance, heroGenFree) {
    return new Promise(function (resolve) {
      function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      var isCreatorMode = document.body.classList.contains('creator-mode') ||
        document.querySelector('[data-creator-mode="true"]') ||
        (window.location.pathname || '').indexOf('/pages/') !== -1;

      var overlay = document.createElement('div');
      overlay.className = 'hero-eazy-confirm-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100020;padding:16px;';

      var modalBg = isCreatorMode ? '#111827' : '#fff';
      var textColor = isCreatorMode ? '#f9fafb' : '#111827';
      var muted = isCreatorMode ? '#9ca3af' : '#6b7280';

      var box = document.createElement('div');
      box.style.cssText = 'max-width:420px;width:100%;border-radius:14px;padding:22px;background:' + modalBg + ';color:' + textColor + ';box-shadow:0 24px 64px rgba(0,0,0,.45);border:1px solid ' + (isCreatorMode ? 'rgba(255,255,255,.12)' : '#e5e7eb') + ';';

      var costStrong = heroGenFree
        ? escapeHtml(eazFreeLabel())
        : (escapeHtml(String(priceFmt || '')) + ' EAZ');
      var balStr = balance === null || balance === undefined ? '—' : String(balance);
      box.innerHTML =
        '<div style="text-align:center;margin-bottom:14px;font-size:40px;line-height:1">✨</div>' +
        '<h3 style="margin:0 0 8px;font-size:17px;font-weight:700;text-align:center">' + i18n('confirm_title', 'Start hero generation?') + '</h3>' +
        '<p style="margin:0 0 14px;font-size:13px;color:' + muted + ';text-align:center">' + i18n('confirm_sub', 'Review your selection, then confirm.') + '</p>' +
        '<div style="font-size:12px;line-height:1.55;color:' + muted + ';background:' + (isCreatorMode ? 'rgba(255,255,255,.06)' : '#f3f4f6') + ';border-radius:10px;padding:12px 14px;margin-bottom:14px;white-space:pre-wrap;font-family:inherit">' +
        summaryLines.map(function (l) { return escapeHtml(l); }).join('\n') +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:16px;font-size:13px;color:' + muted + '">' +
        '<span>' + i18n('cost', 'Cost') + ': <strong style="color:' + textColor + '">' + costStrong + '</strong></span>' +
        '<span>' + i18n('balance', 'Balance') + ': <strong style="color:' + textColor + '">' + escapeHtml(balStr) + ' EAZ</strong></span>' +
        '</div>' +
        '<div style="display:flex;gap:10px">' +
        '<button type="button" class="hero-eazy-confirm-cancel" style="flex:1;padding:11px;border-radius:9px;border:1px solid ' + (isCreatorMode ? 'rgba(255,255,255,.2)' : '#d1d5db') + ';background:transparent;color:' + textColor + ';font-weight:600;cursor:pointer">' + i18n('cancel', 'Cancel') + '</button>' +
        '<button type="button" class="hero-eazy-confirm-ok" style="flex:1;padding:11px;border-radius:9px;border:none;background:#f97316;color:#fff;font-weight:700;cursor:pointer">' + i18n('confirm_ok', 'Confirm') + '</button>' +
        '</div>';

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function done(ok) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(ok);
      }

      box.querySelector('.hero-eazy-confirm-cancel').onclick = function () { done(false); };
      box.querySelector('.hero-eazy-confirm-ok').onclick = function () { done(true); };
      overlay.addEventListener('click', function (e) { if (e.target === overlay) done(false); });
    });
  }

  function dispatchCreatorJobCompletedHero(jobId, prompt, result, ok) {
    try {
      window.dispatchEvent(new CustomEvent('creatorJobCompleted', {
        detail: {
          jobId: jobId,
          job: { action: 'hero-generate', prompt: prompt || '', done: true, saving: false, result: result || null },
          ok: ok !== false,
          ts: Date.now()
        }
      }));
    } catch (e) {}
  }

  function startContentHeroJobPolling(jobId, prompt, productCount, statusEl) {
    window.activeHeroJobs = window.activeHeroJobs || [];
    var pollCount = 0;
    var maxPolls = 180;
    var pollInterval = 1000;
    var lastProgEv = 0;

    function setStatus(msg, isErr) {
      if (!statusEl) return;
      statusEl.style.display = 'block';
      statusEl.className = 'creator-hero-create-status' + (isErr ? ' error' : (msg && msg.indexOf && msg.indexOf('Fertig') !== -1 ? ' success' : ''));
      statusEl.textContent = msg || '';
    }

    function removeActiveJob() {
      window.activeHeroJobs = (window.activeHeroJobs || []).filter(function (j) { return j.jobId !== jobId; });
    }

    function updateActiveJob(patch) {
      var list = window.activeHeroJobs || [];
      var job = list.find(function (j) { return j.jobId === jobId; });
      if (!job) {
        job = { jobId: jobId, status: 'queued', progress: 0, startedAt: Date.now(), prompt: prompt, productCount: productCount, type: 'hero-generate' };
        list.push(job);
        window.activeHeroJobs = list;
      }
      Object.assign(job, patch);
    }

    function refreshChatJobs() {
      try {
        if (window.CreatorChat && typeof window.CreatorChat.refreshActiveJobs === 'function') {
          window.CreatorChat.refreshActiveJobs();
        }
      } catch (e) {}
    }

    function pollJob() {
      fetch('/apps/creator-dispatch?op=status&job_id=' + encodeURIComponent(jobId), { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var isFailed = data.status === 'failed';
          var statusMessage = data.message || (data.done ? (isFailed ? i18n('heroFailed', 'Failed') : i18n('heroDone', 'Done')) : i18n('heroRunning', 'Running…'));
          var currentProgress = typeof data.progress === 'number' ? data.progress : 0;

          updateActiveJob({ status: statusMessage, progress: currentProgress });
          refreshChatJobs();

          var now = Date.now();
          if (now - lastProgEv >= 2000) {
            window.dispatchEvent(new CustomEvent('hero-job-updated', { detail: { jobId: jobId, progress: currentProgress, status: statusMessage, done: !!data.done } }));
            lastProgEv = now;
          }

          if (data && data.not_found) {
            removeActiveJob();
            window.dispatchEvent(new CustomEvent('hero-job-completed', { detail: { jobId: jobId, result: null, reason: 'not_found' } }));
            refreshChatJobs();
            return;
          }

          if (!data.done) {
            pollCount++;
            if (pollCount < maxPolls) return setTimeout(pollJob, pollInterval);
            removeActiveJob();
            window.dispatchEvent(new CustomEvent('hero-job-completed', { detail: { jobId: jobId, result: null, reason: 'timeout' } }));
            refreshChatJobs();
            return;
          }

          var savedPrompt = prompt;
          try {
            var hj = (window.activeHeroJobs || []).find(function (j) { return j.jobId === jobId; });
            if (hj && hj.prompt) savedPrompt = hj.prompt;
          } catch (e) {}

          removeActiveJob();

          if (isFailed) {
            setStatus(data.message || i18n('hero_generation_failed', 'Generation failed'), true);
            window.dispatchEvent(new CustomEvent('hero-job-completed', { detail: { jobId: jobId, result: null, reason: 'failed' } }));
            dispatchCreatorJobCompletedHero(jobId, savedPrompt, null, false);
            refreshChatJobs();
            return;
          }

          var result = data.result || null;
          var hasImage = !!(result && (result.image_url || result.preview_url || result.original_url || result.publicUrl)) || !!(data.preview_url || data.original_url);

          if (hasImage) {
            setStatus(i18n('heroGeneratedSuccess', 'Hero image ready!'), false);
            window.dispatchEvent(new CustomEvent('hero-job-completed', { detail: { jobId: jobId, result: result || { image_url: data.preview_url || data.original_url }, reason: 'completed' } }));
            dispatchCreatorJobCompletedHero(jobId, savedPrompt, result || { image_url: data.preview_url || data.original_url }, true);
          } else {
            setStatus(data.message || i18n('hero_generation_failed', 'Generation failed'), true);
            window.dispatchEvent(new CustomEvent('hero-job-completed', { detail: { jobId: jobId, result: null, reason: 'failed' } }));
            dispatchCreatorJobCompletedHero(jobId, savedPrompt, null, false);
          }

          try {
            if (window.CreatorNotificationsModal && window.CreatorNotificationsModal.loadNotificationsFromAPI) {
              window.CreatorNotificationsModal.loadNotificationsFromAPI();
            }
          } catch (e) {}
          try {
            if (window.EazCreatorBadge && window.EazCreatorBadge.refresh) window.EazCreatorBadge.refresh();
          } catch (e) {}
          refreshChatJobs();
        })
        .catch(function () {
          pollCount++;
          if (pollCount < maxPolls) setTimeout(pollJob, pollInterval);
        });
    }

    pollJob();
  }

  async function generateHero(ctx) {
    var selected = window.selectedHeroProducts || {};
    var arr = [];
    if (selected.top) arr.push(selected.top);
    if (selected.addition) arr.push(selected.addition);
    var promptEl = ctx.container.querySelector('[data-creator-hero-prompt]');
    var bubbleBtn = ctx.eazyStartBtn;
    var statusEl = ctx.statusEl;

    if (arr.length === 0) return;

    var productIds = arr.map(function (p) {
      return normalizeShopifyProductIdForHero(p.id != null ? p.id : p.product_id);
    }).filter(Boolean);
    var prompt = (promptEl && promptEl.value.trim()) ? promptEl.value.trim() : 'Professional product photography with natural lighting and clean background';
    var owner = getOwnerId();
    if (!owner) {
      if (statusEl) { statusEl.textContent = 'Fehler: Keine Owner-ID'; statusEl.style.display = 'block'; }
      return;
    }

    var price = 0.5;
    var heroGenIsFree = false;
    var balance = null;
    try {
      var br = await fetch(API_BASE + '?op=get-balance&_t=' + Date.now() + '&owner_id=' + encodeURIComponent(owner), { credentials: 'include' });
      if (br.ok) {
        var bd = await br.json().catch(function () { return {}; });
        if (bd.ok) {
          var hc = parseHeroCostFromBalancePayload(bd);
          heroGenIsFree = hc.isFree;
          price = hc.isFree ? 0 : hc.eff;
          var balRaw =
            bd.balance_eazg != null
              ? bd.balance_eazg
              : bd.balance_total != null
                ? bd.balance_total
                : bd.balance_eaz;
          balance = balRaw == null ? null : Number(balRaw);
        }
      }
    } catch (e) {}

    if (balance !== null && !heroGenIsFree && balance < price) {
      if (window.EazInsufficientActions && typeof window.EazInsufficientActions.show === 'function') {
        window.EazInsufficientActions.show({
          required: price,
          errorPayload: {
            balance_eazg: balance,
            balance_eaz: balance,
            balance_eazc_available:
              window.__eazBalanceCache && window.__eazBalanceCache.eazcAvailable != null
                ? window.__eazBalanceCache.eazcAvailable
                : 0,
            required: price,
          },
        });
        return;
      }
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'creator-hero-create-status error';
        statusEl.textContent = (i18n('heroNotEnoughBalance', 'Not enough EAZ') + ' (' + balance + ' / ' + price + ')');
      }
      return;
    }

    var summaryLines = buildSummaryLines(ctx, arr, (promptEl && promptEl.value.trim()) ? promptEl.value.trim() : '');
    var priceFmt = heroGenIsFree ? '' : (function (n) {
      var v = Math.round(Number(n) * 100) / 100;
      return v % 1 === 0 ? String(v) : v.toFixed(2);
    })(price);
    var okConfirm = await showHeroEazyConfirm(summaryLines, priceFmt, balance, heroGenIsFree);
    if (!okConfirm) return;

    if (bubbleBtn) bubbleBtn.disabled = true;
    if (statusEl) {
      statusEl.className = 'creator-hero-create-status';
      statusEl.textContent = i18n('heroRunning', 'Starting…');
      statusEl.style.display = 'block';
    }

    try {
      var productImageUrls = arr.map(function (p) {
        var u =
          p.image_url ||
          (p.image_urls && p.image_urls[0]) ||
          (p.images && p.images[0] && (p.images[0].src || p.images[0].url || p.images[0])) ||
          (typeof p.image === 'string' ? p.image : p.image && (p.image.src || p.image.url)) ||
          null;
        if (u && typeof u === 'string') u = u.replace(/&amp;/g, '&');
        return u || null;
      });
      var body = {
        owner_id: owner,
        product_ids: productIds,
        prompt: prompt,
        api_version: 'gpt-image-1.5',
        product_image_urls: productImageUrls,
        region: window.selectedHeroRegion || (
          window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveFromShopContext === 'function'
            ? window.CreatorHeroRegions.resolveFromShopContext()
            : 'EU'
        )
      };
      if (modelImageUrl) body.model_image_url = modelImageUrl;
      if (backgroundImageUrl) body.background_image_url = backgroundImageUrl;

      var res = await fetch(API_BASE + '?op=hero-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return {}; });

      if (data.ok && data.job_id) {
        window.activeHeroJobs = window.activeHeroJobs || [];
        window.activeHeroJobs.push({
          jobId: data.job_id,
          status: 'queued',
          progress: 0,
          startedAt: Date.now(),
          prompt: prompt,
          productCount: productIds.length,
          type: 'hero-generate'
        });

        try {
          window.dispatchEvent(new CustomEvent('creatorJobStarted', {
            detail: { jobId: data.job_id, type: 'hero-generate', ownerId: owner }
          }));
        } catch (e) {}

        startContentHeroJobPolling(data.job_id, prompt, productIds.length, statusEl);

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
          statusEl.textContent = i18n('chat_hint', 'Track progress under Active jobs in eazy chat.');
          statusEl.classList.add('success');
        }

        try {
          resetHeroMarketingWorkspace();
        } catch (_clr) {}
      } else {
        if (statusEl) {
          statusEl.textContent = data.error || i18n('hero_generation_failed', 'Generation failed');
          statusEl.className = 'creator-hero-create-status error';
        }
      }
    } catch (e) {
      if (statusEl) {
        statusEl.textContent = i18n('chat_network_error_retry', 'Network error');
        statusEl.className = 'creator-hero-create-status error';
      }
      console.error('[ContentCreationHero] Generate error:', e);
    }

    if (bubbleBtn) bubbleBtn.disabled = false;
    updateEazyHeroUi(ctx);
  }

  function bind(ctx) {
    if (!ctx || !ctx.container) return;

    if (ctx.container.getAttribute('data-creator-hero-bound') === '1') {
      var gs = window.selectedHeroProducts || {};
      try {
        if (gs.top) setProductPreview(ctx, 'top', gs.top);
        if (gs.addition) setProductPreview(ctx, 'addition', gs.addition);
        var pe2 = ctx.container.querySelector('[data-creator-hero-prompt]');
        if (
          pe2 &&
          window.__heroMarketingAutoPrompt &&
          String(window.__heroMarketingAutoPrompt).trim() &&
          !String(pe2.value || '').trim()
        ) {
          pe2.value = String(window.__heroMarketingAutoPrompt).trim();
        }
        updateEazyHeroUi(ctx);
      } catch (_e) {}
      var existingIx = heroEazyContexts.findIndex(function (c) {
        return c.container === ctx.container;
      });
      if (existingIx < 0) heroEazyContexts.push(ctx);
      return;
    }
    ctx.container.setAttribute('data-creator-hero-bound', '1');

    render(ctx.container);

    var topCard = ctx.container.querySelector('[data-creator-hero-category="top"]');
    var additionCard = ctx.container.querySelector('[data-creator-hero-category="addition"]');
    var topRemove = ctx.container.querySelector('[data-creator-hero-remove="top"]');
    var additionRemove = ctx.container.querySelector('[data-creator-hero-remove="addition"]');
    var promptEl = ctx.container.querySelector('[data-creator-hero-prompt]');

    if (topCard) {
      topCard.addEventListener('click', function (e) {
        if (e.target.closest('.creator-hero-product-preview-remove')) return;
        if (e.target.closest('.creator-product-image-carousel__btn')) return;
        if (typeof window.openHeroProductSelectionModalSimple === 'function') {
          try {
            window.__heroModalUsedProductsContext = 'hero';
          } catch (_e) {}
          window.openHeroProductSelectionModalSimple('top', function (product) {
            setProductPreview(ctx, 'top', product);
          }, { lockedRegion: getLockedRegionFromCurrentSelection(), usageContext: 'hero' });
        } else {
          alert('Produktauswahl-Modal nicht verfügbar.');
        }
      });
    }
    if (additionCard) {
      additionCard.addEventListener('click', function (e) {
        if (e.target.closest('.creator-hero-product-preview-remove')) return;
        if (e.target.closest('.creator-product-image-carousel__btn')) return;
        if (typeof window.openHeroProductSelectionModalSimple === 'function') {
          try {
            window.__heroModalUsedProductsContext = 'hero';
          } catch (_e2) {}
          window.openHeroProductSelectionModalSimple('additional', function (product) {
            setProductPreview(ctx, 'addition', product);
          }, { lockedRegion: getLockedRegionFromCurrentSelection(), usageContext: 'hero' });
        } else {
          alert('Produktauswahl-Modal nicht verfügbar.');
        }
      });
    }
    if (topRemove) topRemove.addEventListener('click', function (e) { e.stopPropagation(); removeProduct(ctx, 'top'); });
    if (additionRemove) additionRemove.addEventListener('click', function (e) { e.stopPropagation(); removeProduct(ctx, 'addition'); });

    if (promptEl) {
      promptEl.addEventListener('input', function () { updateEazyHeroUi(ctx); });
      promptEl.addEventListener('keyup', function () { updateEazyHeroUi(ctx); });
    }
    if (ctx.eazyStartBtn) ctx.eazyStartBtn.addEventListener('click', function () { if (!ctx.eazyStartBtn.disabled) generateHero(ctx); });

    setupUploadArea(ctx, 'model');
    setupUploadArea(ctx, 'background');

    var already = heroEazyContexts.some(function (c) { return c.container === ctx.container; });
    if (!already) heroEazyContexts.push(ctx);

    var gSel = window.selectedHeroProducts;
    if (gSel && gSel.top && gSel.addition) {
      try {
        setProductPreview(ctx, 'top', gSel.top);
        setProductPreview(ctx, 'addition', gSel.addition);
      } catch (e) {}
    }
    var pe0 = ctx.container.querySelector('[data-creator-hero-prompt]');
    if (
      pe0 &&
      window.__heroMarketingAutoPrompt &&
      String(window.__heroMarketingAutoPrompt).trim() &&
      !String(pe0.value || '').trim()
    ) {
      pe0.value = String(window.__heroMarketingAutoPrompt).trim();
    }

    updateEazyHeroUi(ctx);
  }

  function scanHosts() {
    document.querySelectorAll('[data-creator-hero-host]').forEach(function (host) {
      var contextEl = host.closest('.creator-hero-create-context');
      if (!contextEl) return;
      var eazyStartBtn = contextEl.querySelector('[data-creator-hero-eazy-start]');
      var eazyBubbleWrap = contextEl.querySelector('[data-creator-hero-eazy-bubble-wrap]');
      var statusEl = contextEl.querySelector('[data-creator-hero-status]');
      bind({
        container: host,
        contextEl: contextEl,
        eazyStartBtn: eazyStartBtn,
        eazyBubbleWrap: eazyBubbleWrap,
        statusEl: statusEl
      });
    });
  }

  function refreshAllEazyHeroUi() {
    heroEazyContexts.forEach(function (c) {
      try {
        updateEazyHeroUi(c);
      } catch (e) {}
    });
  }

  /**
   * Hero marketing auto-pick may only run while the user is on Content Creation → Hero Images.
   * Avoids heavy get-shopify-products loads on Dashboard, Creations, Automations, Videos, etc.
   */
  function eazIsHeroImagesWorkspaceActive() {
    function marketingHeroTabActive() {
      if (!window.MarketingScreen) return true;
      if (typeof window.MarketingScreen.getCurrentSubTab === 'function') {
        if (window.MarketingScreen.getCurrentSubTab() !== 'content-creation') return false;
      }
      if (typeof window.MarketingScreen.getCurrentContentTab === 'function') {
        if (window.MarketingScreen.getCurrentContentTab() !== 'hero-images') return false;
      }
      return true;
    }

    // IDEA-039: Hero create lives in fullscreen modal
    if (window.CreatorHeroImagesModal && typeof window.CreatorHeroImagesModal.isOpen === 'function') {
      if (window.CreatorHeroImagesModal.isOpen()) return true;
    }
    var heroModal = document.getElementById('creatorHeroImagesModal');
    if (heroModal && !heroModal.hidden) return true;

    var viewport = document.getElementById('creatorMobileSwipeViewport');
    if (viewport) {
      if (!viewport.classList.contains('slide-3')) return false;
      return marketingHeroTabActive();
    }

    var desktopHero = document.getElementById('creatorDesktopHero');
    if (desktopHero) {
      var active = String(desktopHero.getAttribute('data-desktop-active-screen') || '').toLowerCase();
      if (active !== 'marketing') return false;
      return marketingHeroTabActive();
    }

    var host = document.querySelector('[data-creator-hero-host]');
    if (!host) return false;
    if (host.closest('#creatorHeroImagesModal')) {
      return !!(heroModal && !heroModal.hidden);
    }
    var panelContent = host.closest('.creator-marketing-panel-content');
    if (panelContent && !panelContent.classList.contains('is-active')) return false;
    var marketingPanel = host.closest('.creator-marketing-panel');
    if (marketingPanel && marketingPanel.hasAttribute('hidden')) return false;
    return marketingHeroTabActive();
  }

  function eazMaybeScheduleHeroMarketingAutoPick() {
    if (!eazIsHeroImagesWorkspaceActive()) return;
    if (window.__heroMarketingAutoPickDone || window.__heroMarketingAutoPickRunning) return;
    if (typeof window.scheduleHeroMarketingAutoPick === 'function') {
      window.scheduleHeroMarketingAutoPick({ maxWaitMs: 30000 });
    } else if (typeof window.runHeroMarketingAutoPick === 'function') {
      window.runHeroMarketingAutoPick();
    }
  }

  window.eazIsHeroImagesWorkspaceActive = eazIsHeroImagesWorkspaceActive;
  window.eazMaybeScheduleHeroMarketingAutoPick = eazMaybeScheduleHeroMarketingAutoPick;

  function init() {
    scanHosts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /** Only prefetch when Hero Images workspace is already visible (e.g. /pages/content-creation). */
  setTimeout(eazMaybeScheduleHeroMarketingAutoPick, 650);

  window.ContentCreationHero = {
    bind: bind,
    render: render,
    scanHosts: scanHosts,
    syncProductUiFromSelection: syncProductUiFromSelection,
    updateEazyHeroUi: updateEazyHeroUi,
    refreshAllEazyHeroUi: refreshAllEazyHeroUi,
    resetHeroMarketingWorkspace: resetHeroMarketingWorkspace,
    isHeroImagesWorkspaceActive: eazIsHeroImagesWorkspaceActive,
    maybeScheduleAutoPick: eazMaybeScheduleHeroMarketingAutoPick
  };
})();
