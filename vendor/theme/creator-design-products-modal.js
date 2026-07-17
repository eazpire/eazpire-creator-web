/**
 * Creations — catalog products picker (auto-publish scope).
 * Embedded in Design Preview Modal (products panel). Card media helpers also used by library activate flow.
 * Persists publish_excluded_product_keys via op=update-design; queues unpublish for removed published keys.
 */
(function () {
  'use strict';

  function apiBase() {
    return window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  function Mi() {
    return window.CreatorMobileI18n || {};
  }

  function getOwnerId() {
    if (
      typeof window.__EAZ_OWNER_ID !== 'undefined' &&
      window.__EAZ_OWNER_ID != null &&
      String(window.__EAZ_OWNER_ID).trim()
    ) {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    return null;
  }

  function catalogRegion() {
    if (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveCatalogRegion === 'function') {
      return window.CreatorHeroRegions.resolveCatalogRegion();
    }
    return 'EU';
  }

  function parseExcludedFromMeta(meta) {
    try {
      var m =
        meta && typeof meta === 'string'
          ? JSON.parse(meta || '{}')
          : meta && typeof meta === 'object'
            ? meta
            : {};
      var raw = m.publish_excluded_product_keys;
      if (!Array.isArray(raw)) return [];
      return raw
        .map(function (k) {
          return String(k || '').trim();
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function sortUnique(arr) {
    return Array.from(new Set(arr || []))
      .filter(Boolean)
      .sort();
  }

  /** eligibleKeys: catalog keys for region; checkedMap: product_key -> included for publish (checkbox checked) */
  function computeExcludedKeys(eligibleKeys, checkedMap, previousExcludedArr) {
    var prev = previousExcludedArr || [];
    var eligible = new Set(eligibleKeys || []);
    var out = [];
    for (var i = 0; i < prev.length; i++) {
      var pk = String(prev[i] || '').trim();
      if (!pk) continue;
      if (!eligible.has(pk)) out.push(pk);
    }
    for (var j = 0; j < eligibleKeys.length; j++) {
      var key = eligibleKeys[j];
      if (!checkedMap[key]) out.push(key);
    }
    return sortUnique(out);
  }

  function arraysEqualJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function resolveLibraryStatus(d) {
    if (!d) return 'inactive';
    var ls = d.library_status;
    if (ls === 'active' || ls === 'inactive') return ls;
    var id = d.id != null ? String(d.id).trim() : '';
    return id !== '' ? 'active' : 'inactive';
  }

  var hostEl = null;
  var gridEl = null;
  var btnUpdate = null;
  var btnSelAll = null;
  var btnDeselAll = null;
  var selectedCountEl = null;
  var statusEl = null;
  var hintEl = null;
  var filterTabsEl = null;
  var boundHost = null;

  var ctxEligibleKeys = [];
  var ctxChecked = {};
  var ctxInitialExcluded = [];
  /** Snapshot of publish_excluded_product_keys from metadata when panel opened (preserves off-catalog keys). */
  var ctxMetaExcludedSnapshot = [];
  var ctxPublishedRows = [];
  /** First published_designs row per product_key (for handle + badge). */
  var ctxPubRowByKey = {};
  var ctxDesign = null;
  var ctxAllProducts = [];
  /** 'unlocked' | 'locked' | 'all' — unlocked shows Active/Queue groups */
  var ctxFilter = 'unlocked';
  var unlockedGroupOpen = { active: true, queue: true };

  /** @type {WeakMap<Element, IntersectionObserver>} lazy card media observers */
  var cardMediaObservers = new WeakMap();

  var DEFAULT_CARD_PLACEMENT = { x: 0.5, y: 0.5, scale: 0.95, rotate: 0, flipX: false, flipY: false };
  var CARD_UI_SCALE_MAX = 4;

  function mockCompositing() {
    return window.CreatorMockCompositing || null;
  }

  function designPreviewUrl() {
    if (!ctxDesign) return '';
    var d = ctxDesign;
    var result = d.result;
    if (result && typeof result === 'object') {
      var fromResult = result.preview_url || result.image_url || result.original_url || '';
      if (fromResult) return String(fromResult).trim();
    }
    if (typeof result === 'string' && result.indexOf('http') === 0) {
      return String(result).trim();
    }
    return String(d.preview_url || d.image_url || d.original_url || '').trim();
  }

  function parseZoneFrac(f) {
    var MC = mockCompositing();
    if (MC) return MC.parseZoneFrac(f);
    return { l: 0.28, t: 0.22, w: 0.44, h: 0.48 };
  }

  function normalizeCardPlacement(raw) {
    if (!raw || typeof raw !== 'object') return Object.assign({}, DEFAULT_CARD_PLACEMENT);
    var MC = mockCompositing();
    if (MC && typeof MC.normalizeOpenSeedPlacement === 'function') {
      return MC.normalizeOpenSeedPlacement(raw);
    }
    var x = Number(raw.x);
    var y = Number(raw.y);
    var scale = Number(raw.scale);
    var rot = Number(raw.rotate != null ? raw.rotate : raw.angle);
    return {
      x: Number.isFinite(x) ? x : DEFAULT_CARD_PLACEMENT.x,
      y: Number.isFinite(y) ? y : DEFAULT_CARD_PLACEMENT.y,
      scale: Number.isFinite(scale) && scale > 0 ? scale : DEFAULT_CARD_PLACEMENT.scale,
      rotate: Number.isFinite(rot) ? rot : 0,
      flipX: !!raw.flipX,
      flipY: !!raw.flipY,
    };
  }

  function fitCardPreviewStage(stageEl, mockImg, frameEl) {
    var MC = mockCompositing();
    if (MC) return MC.fitMockStage(stageEl, mockImg, frameEl);
    if (!stageEl || !mockImg || !frameEl) return false;
    var nw = mockImg.naturalWidth;
    var nh = mockImg.naturalHeight;
    if (!nw || !nh) return false;
    var boxW = Math.max(1, frameEl.clientWidth);
    var boxH = Math.max(1, frameEl.clientHeight);
    if (boxW < 4 || boxH < 4) return false;
    var fit = Math.min(boxW / nw, boxH / nh);
    var w = Math.max(1, nw * fit);
    var h = Math.max(1, nh * fit);
    stageEl.style.width = w + 'px';
    stageEl.style.height = h + 'px';
    stageEl.style.aspectRatio = 'auto';
    mockImg.style.width = '100%';
    mockImg.style.height = '100%';
    mockImg.style.objectFit = 'fill';
    return true;
  }

  function clampCardScaleFallback(raw) {
    var v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) v = DEFAULT_CARD_PLACEMENT.scale;
    return Math.min(Math.max(v, 0.08), CARD_UI_SCALE_MAX);
  }

  function applyTransformToCardDesignImg(designImg, zoneEl, tr) {
    if (!designImg || !zoneEl) return;
    var MC = mockCompositing();
    if (MC) {
      MC.applyDesignTransformInZone(designImg, zoneEl, tr, {
        uiScaleMax: CARD_UI_SCALE_MAX,
        minDesignWidth: 8,
      });
      return;
    }
    console.warn('[creator-design-products-modal] CreatorMockCompositing missing — using inline card preview fallback');
    var displayTr = normalizeCardPlacement(tr);
    var x = displayTr.x;
    var y = displayTr.y;
    var rot = displayTr.rotate;
    var visualScale = clampCardScaleFallback(displayTr.scale);
    var flipSx = displayTr.flipX ? -1 : 1;
    var flipSy = displayTr.flipY ? -1 : 1;
    var zoneW = zoneEl.offsetWidth || 1;
    var zoneH = zoneEl.offsetHeight || 1;
    designImg.style.width = Math.max(8, zoneW * visualScale) + 'px';
    designImg.style.height = 'auto';
    designImg.style.maxWidth = 'none';
    designImg.style.maxHeight = 'none';
    designImg.style.left = '50%';
    designImg.style.top = '50%';
    var dx = (x - 0.5) * zoneW;
    var dy = (y - 0.5) * zoneH;
    designImg.style.transform =
      'translate(-50%, -50%) translate(' +
      dx +
      'px,' +
      dy +
      'px) rotate(' +
      rot +
      'deg) scale(' +
      flipSx +
      ',' +
      flipSy +
      ')';
    designImg.classList.add('is-laid-out');
  }

  function layoutCardPreviewStack(stackEl, attempt) {
    if (!stackEl) return;
    var tries = typeof attempt === 'number' ? attempt : 0;
    var frame = stackEl.querySelector('.creator-design-products-modal__card-frame');
    var stage = stackEl.querySelector('.creator-design-products-modal__card-stage');
    var mock = stackEl.querySelector('.creator-design-products-modal__card-mock');
    var zone = stackEl.querySelector('.creator-design-products-modal__card-zone');
    var design = stackEl.querySelector('.creator-design-products-modal__card-design');
    if (!frame || !stage || !mock) return;
    if (!mock.complete || !mock.naturalWidth || !mock.naturalHeight) return;
    if (!fitCardPreviewStage(stage, mock, frame)) {
      if (tries < 10) {
        requestAnimationFrame(function () {
          layoutCardPreviewStack(stackEl, tries + 1);
        });
      }
      return;
    }
    if (!zone || !design) return;
    if (!design.complete || !design.naturalWidth) return;
    var placement = null;
    try {
      placement = JSON.parse(stackEl.getAttribute('data-card-placement') || '{}');
    } catch (_) {
      placement = null;
    }
    var tr = normalizeCardPlacement(placement);
    applyTransformToCardDesignImg(design, zone, tr);
  }

  function bindCardPreviewResize(stackEl) {
    if (!stackEl || stackEl.__cdpPreviewResizeBound) return;
    stackEl.__cdpPreviewResizeBound = true;
    var frame = stackEl.querySelector('.creator-design-products-modal__card-frame');
    if (!frame || typeof ResizeObserver !== 'function') return;
    var ro = new ResizeObserver(function () {
      layoutCardPreviewStack(stackEl);
    });
    ro.observe(frame);
    stackEl.__cdpPreviewResizeObserver = ro;
  }

  function observeCardMediaWhenVisible(mediaEl, mountFn) {
    if (!mediaEl || typeof mountFn !== 'function') return;
    var prev = cardMediaObservers.get(mediaEl);
    if (prev) {
      try {
        prev.disconnect();
      } catch (_) {}
    }
    if (!('IntersectionObserver' in window)) {
      mountFn();
      return;
    }
    var obs = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            obs.disconnect();
            cardMediaObservers.delete(mediaEl);
            mountFn();
            break;
          }
        }
      },
      { rootMargin: '120px 0px', threshold: 0.01 }
    );
    cardMediaObservers.set(mediaEl, obs);
    obs.observe(mediaEl);
  }

  function isUsableMockUrl(u) {
    var s = String(u || '').trim();
    if (!s) return false;
    if (!/\/(?:design-studio-)?mockup-r2(?:\?|$)/i.test(s)) return true;
    try {
      var url = new URL(s, window.location.origin);
      return !!(url.searchParams.get('k') || '').trim();
    } catch (_) {
      var m = /[?&]k=([^&]*)/.exec(s);
      if (!m) return false;
      try {
        return !!decodeURIComponent(m[1] || '').trim();
      } catch (_e) {
        return false;
      }
    }
  }

  function buildCardPreviewStack(slide, designUrl) {
    var mockUrl = String((slide && slide.mock_url) || '').trim();
    if (!isUsableMockUrl(mockUrl)) return null;
    var z = parseZoneFrac(slide && slide.print_area_frac);
    var zoneStyle =
      'left:' +
      z.l * 100 +
      '%;top:' +
      z.t * 100 +
      '%;width:' +
      z.w * 100 +
      '%;height:' +
      z.h * 100 +
      '%;';
    var placement = normalizeCardPlacement(slide && slide.placement);

    var stack = document.createElement('div');
    stack.className = 'creator-design-products-modal__card-slide creator-design-products-modal__card-slide--composed';
    stack.setAttribute('data-card-placement', JSON.stringify(placement));

    var frame = document.createElement('div');
    frame.className = 'creator-design-products-modal__card-frame';

    var stage = document.createElement('div');
    stage.className = 'creator-design-products-modal__card-stage';

    var mock = document.createElement('img');
    mock.className = 'creator-design-products-modal__card-mock';
    mock.alt = '';
    mock.decoding = 'async';
    mock.draggable = false;
    mock.loading = 'lazy';
    mock.src = mockUrl;

    var zone = document.createElement('span');
    zone.className = 'creator-design-products-modal__card-zone';
    zone.setAttribute('style', zoneStyle);

    var design = document.createElement('img');
    design.className = 'creator-design-products-modal__card-design';
    design.alt = '';
    design.decoding = 'async';
    design.draggable = false;
    design.src = designUrl;

    zone.appendChild(design);
    stage.appendChild(mock);
    stage.appendChild(zone);
    frame.appendChild(stage);
    stack.appendChild(frame);

    function afterImagesReady() {
      layoutCardPreviewStack(stack);
      bindCardPreviewResize(stack);
    }

    function bindLoad(img) {
      if (img.complete && img.naturalWidth) return true;
      img.addEventListener('load', afterImagesReady, { once: true });
      img.addEventListener('error', afterImagesReady, { once: true });
      return false;
    }

    var mockReady = bindLoad(mock);
    var designReady = bindLoad(design);
    if (mockReady && designReady) afterImagesReady();

    return stack;
  }

  function mountCardMediaComposited(mediaEl, productKey, previewConfig, designUrl) {
    if (!mediaEl) return;
    mediaEl.innerHTML = '';
    var slides = ((previewConfig && previewConfig.slides) || []).filter(function (s) {
      return s && isUsableMockUrl(s.mock_url);
    });
    if (!slides.length || !designUrl) {
      mountCardMediaCarouselPlain(mediaEl, productKey, normalizeMockUrls({ mock_urls: [] }));
      return;
    }

    mediaEl.classList.add('creator-design-products-modal__card-media--composed');
    if (slides.length >= 2) {
      mediaEl.classList.add('creator-design-products-modal__card-media--carousel');
    }

    if (slides.length >= 2) {
      var stageWrap = document.createElement('div');
      stageWrap.className = 'creator-design-products-modal__card-carousel-host';
      stageWrap.setAttribute('data-product-key', productKey);

      var stackA = buildCardPreviewStack(slides[0], designUrl);
      if (!stackA) {
        mountCardMediaCarouselPlain(mediaEl, productKey, normalizeMockUrls({ mock_urls: [] }));
        return;
      }
      stackA.classList.add('is-active');
      var stackB = buildCardPreviewStack(slides[1] || slides[0], designUrl);
      stageWrap.appendChild(stackA);
      if (stackB) stageWrap.appendChild(stackB);
      stageWrap.dataset.slideIndex = '0';
      mediaEl.appendChild(stageWrap);

      var navPrev = document.createElement('button');
      navPrev.type = 'button';
      navPrev.className = 'creator-design-products-modal__card-nav creator-design-products-modal__card-nav--prev';
      navPrev.setAttribute('aria-label', Mi().designProductsPrevMock || 'Previous mock');
      navPrev.innerHTML = '&#8249;';
      var navNext = document.createElement('button');
      navNext.type = 'button';
      navNext.className = 'creator-design-products-modal__card-nav creator-design-products-modal__card-nav--next';
      navNext.setAttribute('aria-label', Mi().designProductsNextMock || 'Next mock');
      navNext.innerHTML = '&#8250;';

      var advancing = false;
      function advanceComposedSlide(delta) {
        if (advancing) return;
        advancing = true;
        var idx = parseInt(stageWrap.dataset.slideIndex || '0', 10);
        var nextIdx = (idx + delta + slides.length * 100) % slides.length;
        stageWrap.dataset.slideIndex = String(nextIdx);
        var active = stageWrap.querySelector('.creator-design-products-modal__card-slide.is-active');
        var inactive = stageWrap.querySelector('.creator-design-products-modal__card-slide:not(.is-active)');
        if (!inactive) {
          inactive = buildCardPreviewStack(slides[nextIdx], designUrl);
          if (inactive) stageWrap.appendChild(inactive);
        } else {
          var existing = inactive.querySelector('.creator-design-products-modal__card-mock');
          var targetUrl = String(slides[nextIdx].mock_url || '').trim();
          if (!isUsableMockUrl(targetUrl)) {
            advancing = false;
            return;
          }
          if (existing && existing.src !== targetUrl) {
            inactive.parentNode.removeChild(inactive);
            inactive = buildCardPreviewStack(slides[nextIdx], designUrl);
            if (inactive) stageWrap.appendChild(inactive);
          } else {
            inactive.setAttribute(
              'data-card-placement',
              JSON.stringify(normalizeCardPlacement(slides[nextIdx].placement))
            );
            layoutCardPreviewStack(inactive);
          }
        }
        if (active && inactive) {
          inactive.classList.add('is-active');
          active.classList.remove('is-active');
          if (active !== inactive && active.parentNode) active.parentNode.removeChild(active);
        }
        requestAnimationFrame(function () {
          if (inactive) layoutCardPreviewStack(inactive);
          advancing = false;
        });
      }

      navPrev.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        advanceComposedSlide(-1);
      });
      navNext.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        advanceComposedSlide(1);
      });

      mediaEl.appendChild(navPrev);
      mediaEl.appendChild(navNext);
      return;
    }

    mediaEl.classList.remove('creator-design-products-modal__card-media--carousel');
    var singleStack = buildCardPreviewStack(slides[0], designUrl);
    if (!singleStack) {
      mountCardMediaCarouselPlain(mediaEl, productKey, normalizeMockUrls({ mock_urls: [] }));
      return;
    }
    singleStack.classList.add('is-active');
    singleStack.setAttribute('data-product-key', productKey);
    mediaEl.appendChild(singleStack);
  }

  /** Fallback template when catalog API returns no mock_urls (e.g. stale DB row). */
  var CATALOG_MOCK_FALLBACK = {
    'coffee-mug':
      'https://creator-engine.eazpire.workers.dev/mockup/mockups/coffee-mug/red-right.png',
  };

  function normalizeMockUrls(product) {
    var urls = [];
    if (product && Array.isArray(product.mock_urls)) {
      urls = product.mock_urls
        .map(function (u) {
          return String(u || '').trim();
        })
        .filter(Boolean);
    }
    var prev = product && product.preview_image_url ? String(product.preview_image_url).trim() : '';
    if (!urls.length && prev) urls = [prev];
    urls = urls.filter(isUsableMockUrl);
    var creator = urls.filter(function (u) {
      return /\/mockup\//i.test(u);
    });
    if (creator.length) return creator;
    var filtered = urls.filter(function (u) {
      return !/images\.printify\.com/i.test(u);
    });
    if (filtered.length) return filtered;
    var pk = product && product.product_key ? String(product.product_key).trim() : '';
    if (pk && CATALOG_MOCK_FALLBACK[pk]) return [CATALOG_MOCK_FALLBACK[pk]];
    return filtered;
  }

  function preloadUrl(u, done) {
    if (!u || !isUsableMockUrl(u)) {
      done();
      return;
    }
    var img = new Image();
    img.onload = function () {
      done();
    };
    img.onerror = function () {
      done();
    };
    img.src = u;
  }

  function bindSlideError(img, urls, stage, productKey, getIndex) {
    if (!img || !urls || !urls.length) return;
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      var idx = getIndex();
      for (var attempt = 1; attempt < urls.length; attempt++) {
        var nextIdx = (idx + attempt) % urls.length;
        var nextUrl = urls[nextIdx];
        if (!nextUrl || nextUrl === img.src) continue;
        stage.dataset.slideIndex = String(nextIdx);
        preloadUrl(nextUrl, function () {
          img.src = nextUrl;
        });
        return;
      }
      img.style.display = 'none';
    });
  }

  function mountCardMediaCarousel(mediaEl, productKey, urls, previewConfig, designUrl) {
    if (!mediaEl) return;
    var mountFn = function () {
      if (previewConfig && previewConfig.slides && previewConfig.slides.length && designUrl) {
        try {
          mountCardMediaComposited(mediaEl, productKey, previewConfig, designUrl);
          return;
        } catch (err) {
          console.warn('[creator-design-products-modal] composited mount failed', productKey, err);
        }
      }
      mountCardMediaCarouselPlain(mediaEl, productKey, urls);
    };
    // Mount immediately so cards in the Design Preview products panel always composite
    // (lazy IO skipped when panel/tab was hidden during first paint).
    mountFn();
    requestAnimationFrame(function () {
      if (previewConfig && previewConfig.slides && previewConfig.slides.length && designUrl) {
        var stack = mediaEl.querySelector('.creator-design-products-modal__card-slide--composed.is-active');
        if (stack) layoutCardPreviewStack(stack);
      }
    });
  }

  function mountCardMediaCarouselPlain(mediaEl, productKey, urls) {
    if (!mediaEl) return;
    mediaEl.innerHTML = '';
    mediaEl.classList.add('creator-design-products-modal__card-media--carousel');
    if (!urls || !urls.length) {
      mediaEl.classList.remove('creator-design-products-modal__card-media--carousel');
      var ph = document.createElement('div');
      ph.className = 'creator-design-products-modal__card-ph';
      ph.textContent = '—';
      mediaEl.appendChild(ph);
      return;
    }

    var stage = document.createElement('div');
    stage.className = 'creator-design-products-modal__card-stage';
    stage.setAttribute('data-product-key', productKey);

    if (urls.length >= 2) {
      var imgA = document.createElement('img');
      imgA.className = 'creator-design-products-modal__card-slide is-active';
      imgA.alt = '';
      imgA.loading = 'lazy';
      imgA.src = urls[0];
      var imgB = document.createElement('img');
      imgB.className = 'creator-design-products-modal__card-slide';
      imgB.alt = '';
      imgB.loading = 'lazy';
      imgB.src = urls[1] || urls[0];
      bindSlideError(imgA, urls, stage, productKey, function () {
        return parseInt(stage.dataset.slideIndex || '0', 10);
      });
      bindSlideError(imgB, urls, stage, productKey, function () {
        var idx = parseInt(stage.dataset.slideIndex || '0', 10);
        return (idx + 1) % urls.length;
      });
      stage.appendChild(imgA);
      stage.appendChild(imgB);
      stage.dataset.slideIndex = '0';

      var navPrev = document.createElement('button');
      navPrev.type = 'button';
      navPrev.className = 'creator-design-products-modal__card-nav creator-design-products-modal__card-nav--prev';
      navPrev.setAttribute('aria-label', Mi().designProductsPrevMock || 'Previous mock');
      navPrev.innerHTML = '&#8249;';
      var navNext = document.createElement('button');
      navNext.type = 'button';
      navNext.className = 'creator-design-products-modal__card-nav creator-design-products-modal__card-nav--next';
      navNext.setAttribute('aria-label', Mi().designProductsNextMock || 'Next mock');
      navNext.innerHTML = '&#8250;';

      function advanceSlide(delta) {
        var idx = parseInt(stage.dataset.slideIndex || '0', 10);
        var nextIdx = (idx + delta + urls.length * 100) % urls.length;
        stage.dataset.slideIndex = String(nextIdx);
        var active = stage.querySelector('.creator-design-products-modal__card-slide.is-active');
        var inactive = stage.querySelector('.creator-design-products-modal__card-slide:not(.is-active)');
        if (!active || !inactive) return;
        var nextUrl = urls[nextIdx];
        preloadUrl(nextUrl, function () {
          inactive.src = nextUrl;
          inactive.classList.add('is-active');
          active.classList.remove('is-active');
        });
      }

      navPrev.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        advanceSlide(-1);
      });
      navNext.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        advanceSlide(1);
      });

      mediaEl.appendChild(stage);
      mediaEl.appendChild(navPrev);
      mediaEl.appendChild(navNext);
    } else {
      mediaEl.classList.remove('creator-design-products-modal__card-media--carousel');
      var imgSingle = document.createElement('img');
      imgSingle.alt = '';
      imgSingle.loading = 'lazy';
      imgSingle.src = urls[0];
      bindSlideError(imgSingle, urls, stage, productKey, function () {
        return 0;
      });
      stage.appendChild(imgSingle);
      mediaEl.appendChild(stage);
    }
  }

  function clearAllRotations() {
    /* Auto mock rotation removed — manual arrows only; kept for library activate API. */
  }

  /** Expose for creator-creations-library-actions activate flow */
  window.CreatorDesignProductsCardMedia = {
    mount: mountCardMediaCarousel,
    mountPlain: mountCardMediaCarouselPlain,
    clearRotations: clearAllRotations,
    normalizeMockUrls: normalizeMockUrls,
    resetPaused: function () {},
  };

  function rebuildPublishedRowMap(rows) {
    ctxPubRowByKey = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      if (!r || !r.product_key) continue;
      var pk = String(r.product_key).trim();
      if (!pk || ctxPubRowByKey[pk]) continue;
      ctxPubRowByKey[pk] = r;
    }
  }

  function refreshCardBadges(card, pk) {
    if (!card || !pk) return;
    var old = card.querySelector('.creator-design-products-modal__card-badges');
    if (old) old.remove();
    var pubRow = ctxPubRowByKey[pk];
    var isChecked = !!ctxChecked[pk];
    var M = Mi();
    var badges = document.createElement('div');
    badges.className = 'creator-design-products-modal__card-badges';
    if (pubRow) {
      var on = document.createElement('span');
      on.className = 'creator-design-products-modal__card-badge creator-design-products-modal__card-badge--online';
      on.textContent = M.designProductsBadgeOnline || M.designProductsBadgeActive || 'Active';
      badges.appendChild(on);
    } else if (isChecked) {
      var qu = document.createElement('span');
      qu.className = 'creator-design-products-modal__card-badge creator-design-products-modal__card-badge--queue';
      qu.textContent = M.designProductsBadgeQueue || 'Queue';
      badges.appendChild(qu);
    }
    if (badges.childNodes.length) card.appendChild(badges);
  }

  function refreshAllCardBadges() {
    if (!gridEl) return;
    var cards = gridEl.querySelectorAll('.creator-design-products-modal__card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var inp = card.querySelector('input[data-product-key]');
      if (!inp) continue;
      refreshCardBadges(card, inp.getAttribute('data-product-key'));
    }
  }

  function isProductUnlocked(p) {
    if (!p) return false;
    if (typeof p.unlocked === 'boolean') return p.unlocked;
    // Fallback when API has no unlock flags: treat as unlocked.
    return true;
  }

  function partitionProducts() {
    var unlocked = [];
    var locked = [];
    for (var i = 0; i < ctxAllProducts.length; i++) {
      var p = ctxAllProducts[i];
      if (isProductUnlocked(p)) unlocked.push(p);
      else locked.push(p);
    }
    var active = [];
    var queue = [];
    for (var j = 0; j < unlocked.length; j++) {
      var u = unlocked[j];
      var pk = String(u.product_key || '').trim();
      if (pk && ctxPubRowByKey[pk]) active.push(u);
      else queue.push(u);
    }
    return { unlocked: unlocked, locked: locked, active: active, queue: queue };
  }

  function visibleKeys() {
    // Select all / deselect only apply to unlocked products in the current view.
    var parts = partitionProducts();
    var list =
      ctxFilter === 'locked'
        ? []
        : ctxFilter === 'all'
          ? parts.unlocked
          : parts.unlocked;
    return list
      .map(function (p) {
        return String(p.product_key || '').trim();
      })
      .filter(Boolean);
  }

  function filteredProducts() {
    var parts = partitionProducts();
    if (ctxFilter === 'locked') return parts.locked;
    if (ctxFilter === 'unlocked') return parts.unlocked;
    return ctxAllProducts.slice();
  }

  function syncFilterTabsUi() {
    if (!filterTabsEl) return;
    var showTabs = resolveLibraryStatus(ctxDesign) === 'active';
    if (showTabs) {
      filterTabsEl.removeAttribute('hidden');
      if (ctxFilter !== 'unlocked' && ctxFilter !== 'locked') ctxFilter = 'unlocked';
    } else {
      filterTabsEl.setAttribute('hidden', '');
      ctxFilter = 'all';
    }
    var tabs = filterTabsEl.querySelectorAll('[data-cdp-products-filter]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var key = String(tab.getAttribute('data-cdp-products-filter') || '');
      var on = key === ctxFilter;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function cacheHostRefs(root) {
    hostEl = root;
    gridEl = root.querySelector('#cdp-products-grid-design-preview') || root.querySelector('[id^="cdp-products-grid-"]') || root.querySelector('.cdp-modal__products-grid');
    btnUpdate = root.querySelector('#cdp-products-update-design-preview') || root.querySelector('[id^="cdp-products-update-"]');
    btnSelAll = root.querySelector('#cdp-products-select-all-design-preview') || root.querySelector('[id^="cdp-products-select-all-"]');
    btnDeselAll = root.querySelector('#cdp-products-deselect-all-design-preview') || root.querySelector('[id^="cdp-products-deselect-all-"]');
    selectedCountEl = root.querySelector('#cdp-products-selected-count-design-preview') || root.querySelector('[id^="cdp-products-selected-count-"]');
    statusEl = root.querySelector('#cdp-products-status-design-preview') || root.querySelector('[id^="cdp-products-status-"]');
    hintEl = root.querySelector('.cdp-modal__products-hint');
    filterTabsEl = root.querySelector('#cdp-products-filter-tabs-design-preview') || root.querySelector('[id^="cdp-products-filter-tabs-"]');
  }

  function bindHostOnce(root) {
    if (!root || boundHost === root) return;
    boundHost = root;
    cacheHostRefs(root);

    if (btnSelAll) {
      btnSelAll.addEventListener('click', function () {
        var keys = visibleKeys();
        for (var i = 0; i < keys.length; i++) ctxChecked[keys[i]] = true;
        syncCheckboxInputs();
        refreshAllCardBadges();
        refreshDirty();
        refreshSelectedCount();
      });
    }
    if (btnDeselAll) {
      btnDeselAll.addEventListener('click', function () {
        var keys = visibleKeys();
        for (var j = 0; j < keys.length; j++) ctxChecked[keys[j]] = false;
        syncCheckboxInputs();
        refreshAllCardBadges();
        refreshDirty();
        refreshSelectedCount();
      });
    }
    if (btnUpdate) {
      btnUpdate.addEventListener('click', onConfirmUpdate);
    }
    if (filterTabsEl) {
      filterTabsEl.addEventListener('click', function (e) {
        var tab = e.target && e.target.closest ? e.target.closest('[data-cdp-products-filter]') : null;
        if (!tab) return;
        var next = String(tab.getAttribute('data-cdp-products-filter') || '');
        if (next !== 'unlocked' && next !== 'locked') return;
        if (ctxFilter === next) return;
        ctxFilter = next;
        syncFilterTabsUi();
        renderProductsView();
        refreshDirty();
      });
    }
  }

  function applyStaticLabels() {
    var M = Mi();
    if (btnSelAll) btnSelAll.textContent = M.designProductsSelectAll || 'Select all';
    if (btnDeselAll) btnDeselAll.textContent = M.designProductsDeselectAll || 'Deselect all';
    if (btnUpdate) btnUpdate.textContent = M.designProductsUpdate || 'Update';
    if (gridEl) gridEl.setAttribute('aria-label', M.designProductsGridAria || '');
    if (filterTabsEl) {
      var u = filterTabsEl.querySelector('[data-cdp-products-filter="unlocked"]');
      var l = filterTabsEl.querySelector('[data-cdp-products-filter="locked"]');
      if (u) u.textContent = M.designProductsTabUnlocked || 'Unlocked';
      if (l) l.textContent = M.designProductsTabLocked || 'Locked';
    }
  }

  function resetPanelState() {
    clearAllRotations();
    ctxDesign = null;
    ctxEligibleKeys = [];
    ctxChecked = {};
    ctxInitialExcluded = [];
    ctxMetaExcludedSnapshot = [];
    ctxPublishedRows = [];
    ctxPubRowByKey = {};
    ctxAllProducts = [];
    ctxFilter = 'unlocked';
    unlockedGroupOpen = { active: true, queue: true };
    if (gridEl) gridEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    if (filterTabsEl) filterTabsEl.setAttribute('hidden', '');
  }

  function syncCheckboxInputs() {
    if (!gridEl) return;
    var boxes = gridEl.querySelectorAll('input[type="checkbox"][data-product-key]');
    for (var i = 0; i < boxes.length; i++) {
      var inp = boxes[i];
      var pk = inp.getAttribute('data-product-key');
      inp.checked = !!ctxChecked[pk];
    }
  }

  function refreshSelectedCount() {
    if (!selectedCountEl) return;
    var keys = visibleKeys();
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      if (ctxChecked[keys[i]]) n += 1;
    }
    var tpl = Mi().designProductsSelectedCount || '{{count}} selected';
    selectedCountEl.textContent = tpl.replace('{{count}}', String(n)).replace('{count}', String(n));
  }

  function refreshDirty() {
    var nextExcluded = computeExcludedKeys(ctxEligibleKeys, ctxChecked, ctxMetaExcludedSnapshot);
    var dirty = !arraysEqualJson(nextExcluded, ctxInitialExcluded);
    if (btnUpdate) btnUpdate.disabled = !dirty || !ctxEligibleKeys.length;
    refreshSelectedCount();
  }

  function studioScriptUrl() {
    if (window.__CREATOR_STUDIO_MODAL_JS) return window.__CREATOR_STUDIO_MODAL_JS;
    var bundle = window.__CREATOR_LAZY_CREATIONS_BUNDLE || [];
    for (var i = 0; i < bundle.length; i++) {
      if (String(bundle[i] || '').indexOf('creator-design-studio-modal.js') !== -1) return bundle[i];
    }
    return null;
  }

  var studioLoadPromise = null;

  function loadStudioScript() {
    if (window.CreatorDesignStudioModal && typeof window.CreatorDesignStudioModal.open === 'function') {
      return Promise.resolve();
    }
    var url = studioScriptUrl();
    if (!url) return Promise.reject(new Error('studio_script_url_missing'));
    if (studioLoadPromise) return studioLoadPromise;
    if (window.__CreatorLazyModals && typeof window.__CreatorLazyModals.loadScript === 'function') {
      studioLoadPromise = window.__CreatorLazyModals.loadScript(url);
      return studioLoadPromise;
    }
    studioLoadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('studio_script_load_failed')); };
      document.head.appendChild(s);
    });
    return studioLoadPromise;
  }

  function openStudioForProduct(productKey, productMeta) {
    if (!ctxDesign || !productKey) return;
    function tryOpen() {
      var api = window.CreatorDesignStudioModal;
      if (api && typeof api.open === 'function') {
        api.open(ctxDesign, productKey, productMeta || null);
        return true;
      }
      return false;
    }
    if (tryOpen()) return;
    loadStudioScript()
      .then(function () {
        if (!tryOpen()) {
          console.warn('[creator-design-products-modal] CreatorDesignStudioModal.open unavailable after load');
        }
      })
      .catch(function (err) {
        console.warn('[creator-design-products-modal] studio script load failed', err);
      });
  }

  function buildProductCard(p, opts) {
    opts = opts || {};
    var locked = !!opts.locked;
    var pk = String(p.product_key || '').trim();
    if (!pk) return null;
    var card = document.createElement('div');
    card.className = 'creator-design-products-modal__card' + (locked ? ' is-locked' : '');
    card.setAttribute('role', 'group');
    card.setAttribute('tabindex', locked ? '-1' : '0');
    card.setAttribute('data-product-key', pk);
    if (locked) card.setAttribute('aria-disabled', 'true');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.setAttribute('data-product-key', pk);
    cb.checked = !locked && !!ctxChecked[pk];
    cb.disabled = locked;
    cb.addEventListener('click', function (ev) {
      ev.stopPropagation();
    });
    cb.addEventListener('change', function (ev) {
      ev.stopPropagation();
      if (locked) return;
      var key = ev.target.getAttribute('data-product-key');
      ctxChecked[key] = !!ev.target.checked;
      refreshCardBadges(ev.target.closest('.creator-design-products-modal__card'), key);
      refreshDirty();
    });

    if (!locked) {
      (function (productKey, productMeta) {
        card.addEventListener('click', function (ev) {
          if (ev.target && ev.target.closest && ev.target.closest('input[type="checkbox"]')) return;
          if (ev.target && ev.target.closest && ev.target.closest('.creator-design-products-modal__card-nav')) return;
          ev.preventDefault();
          ev.stopPropagation();
          openStudioForProduct(productKey, productMeta);
        });
        card.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            if (ev.target && ev.target.matches && ev.target.matches('input[type="checkbox"]')) return;
            ev.preventDefault();
            ev.stopPropagation();
            openStudioForProduct(productKey, productMeta);
          }
        });
      })(pk, p);
    }

    var media = document.createElement('div');
    media.className = 'creator-design-products-modal__card-media';
    var previewConfig = p.studio_card_preview || null;
    var designUrl = designPreviewUrl();
    try {
      mountCardMediaCarousel(media, pk, normalizeMockUrls(p), previewConfig, designUrl);
    } catch (err) {
      console.warn('[creator-design-products-modal] card media mount failed', pk, err);
      try {
        mountCardMediaCarouselPlain(media, pk, normalizeMockUrls(p));
      } catch (_) {}
    }
    var ttl = document.createElement('div');
    ttl.className = 'creator-design-products-modal__card-title';
    ttl.textContent = p.title || pk;
    card.appendChild(cb);
    card.appendChild(media);
    card.appendChild(ttl);
    refreshCardBadges(card, pk);
    return card;
  }

  function appendCardsTo(container, products, locked) {
    var grid = document.createElement('div');
    grid.className = 'creator-design-products-modal__grid cdp-modal__products-grid';
    for (var i = 0; i < products.length; i++) {
      var card = buildProductCard(products[i], { locked: !!locked });
      if (card) grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  function makeGroup(id, title, products, locked) {
    var M = Mi();
    var group = document.createElement('div');
    group.className =
      'cdp-modal__products-group' + (unlockedGroupOpen[id] !== false ? ' is-open' : '');
    group.setAttribute('data-cdp-products-group', id);

    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'cdp-modal__products-group-head';
    head.innerHTML =
      '<span>' +
      String(title).replace(/</g, '&lt;') +
      ' <span class="cdp-modal__products-group-count">(' +
      products.length +
      ')</span></span>' +
      '<span class="cdp-modal__products-group-chevron" aria-hidden="true">▾</span>';
    head.addEventListener('click', function () {
      unlockedGroupOpen[id] = !group.classList.contains('is-open');
      group.classList.toggle('is-open');
    });

    var body = document.createElement('div');
    body.className = 'cdp-modal__products-group-body';
    if (!products.length) {
      var empty = document.createElement('p');
      empty.className = 'cdp-modal__products-status';
      empty.style.padding = '4px 4px 8px';
      empty.textContent =
        id === 'active'
          ? M.designProductsEmptyActive || 'No active products.'
          : M.designProductsEmptyQueue || 'No queued products.';
      body.appendChild(empty);
    } else {
      appendCardsTo(body, products, locked);
    }

    group.appendChild(head);
    group.appendChild(body);
    return group;
  }

  function renderProductsView() {
    if (!gridEl) return;
    clearAllRotations();
    gridEl.innerHTML = '';
    gridEl.classList.remove('creator-design-products-modal__grid');
    // Stacked layout: outer scroll area is a column, not a card auto-fill grid
    // (otherwise Active/Queue groups shrink to one ~132px column).
    gridEl.classList.add('cdp-modal__products-grid--stacked');
    var M = Mi();
    var parts = partitionProducts();

    if (ctxFilter === 'locked') {
      var hint = document.createElement('p');
      hint.className = 'cdp-modal__products-locked-hint';
      hint.textContent =
        M.designProductsLockedHint ||
        'These products must be unlocked in the Skill Tree before you can select them.';
      gridEl.appendChild(hint);
      if (!parts.locked.length) {
        var emptyL = document.createElement('p');
        emptyL.className = 'cdp-modal__products-status';
        emptyL.style.padding = '8px 16px';
        emptyL.textContent = M.designProductsEmptyLocked || 'No locked products.';
        gridEl.appendChild(emptyL);
      } else {
        appendCardsTo(gridEl, parts.locked, true);
      }
      return;
    }

    // Unlocked (or all): Active + Queue collapsible groups
    var wrap = document.createElement('div');
    wrap.className = 'cdp-modal__products-groups';
    wrap.appendChild(
      makeGroup('active', M.designProductsGroupActive || M.designProductsTabActive || 'Active', parts.active, false)
    );
    wrap.appendChild(
      makeGroup('queue', M.designProductsGroupQueue || M.designProductsTabQueue || 'Queue', parts.queue, false)
    );
    gridEl.appendChild(wrap);
  }

  function renderGrid(products) {
    // Back-compat: flat list when called with an array (library helpers).
    if (!gridEl) return;
    if (!Array.isArray(products)) {
      renderProductsView();
      return;
    }
    clearAllRotations();
    gridEl.innerHTML = '';
    gridEl.classList.remove('cdp-modal__products-grid--stacked');
    gridEl.classList.add('creator-design-products-modal__grid');
    for (var i = 0; i < products.length; i++) {
      var card = buildProductCard(products[i], { locked: !isProductUnlocked(products[i]) });
      if (card) gridEl.appendChild(card);
    }
  }

  async function loadAndRender(design) {
    var owner = getOwnerId();
    var M = Mi();
    if (!owner || !design || !design.id) {
      if (statusEl) statusEl.textContent = M.designProductsLoadError || 'Could not load.';
      return;
    }
    var designId = String(design.id).trim();
    var shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : window.__SHOPIFY_SHOP_DOMAIN || null;
    var region = catalogRegion();

    if (statusEl) statusEl.textContent = Mi().creationsLoadingDesigns || 'Loading…';

    var base = apiBase();
    var catUrl =
      base +
      '?op=get-catalog-products&region=' +
      encodeURIComponent(region) +
      '&design_id=' +
      encodeURIComponent(designId) +
      '&owner_id=' +
      encodeURIComponent(owner);
    if (shop) catUrl += '&shop=' + encodeURIComponent(shop);

    var pubUrl =
      base +
      '?op=get-design-published-rows&design_id=' +
      encodeURIComponent(designId) +
      '&owner_id=' +
      encodeURIComponent(owner);
    if (shop) pubUrl += '&shop=' + encodeURIComponent(shop);

    try {
      var res = await Promise.all([
        fetch(catUrl, { credentials: 'include' }),
        fetch(pubUrl, { credentials: 'include' }),
      ]);
      var catData = await res[0].json().catch(function () {
        return {};
      });
      var pubData = await res[1].json().catch(function () {
        return {};
      });

      var products = (catData.ok && Array.isArray(catData.products) ? catData.products : []).slice();
      ctxAllProducts = products;

      // Eligible for publish selection = unlocked products only.
      ctxEligibleKeys = products
        .filter(function (x) {
          return isProductUnlocked(x);
        })
        .map(function (x) {
          return String(x.product_key || '').trim();
        })
        .filter(Boolean);

      var metaExcluded = parseExcludedFromMeta(design.metadata);
      ctxMetaExcludedSnapshot = metaExcluded.slice();

      ctxChecked = {};
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var pk = String(p.product_key || '').trim();
        if (!pk) continue;
        if (!isProductUnlocked(p)) {
          ctxChecked[pk] = false;
          continue;
        }
        ctxChecked[pk] = metaExcluded.indexOf(pk) === -1;
      }

      ctxInitialExcluded = computeExcludedKeys(ctxEligibleKeys, ctxChecked, ctxMetaExcludedSnapshot);
      ctxPublishedRows = pubData.ok && Array.isArray(pubData.rows) ? pubData.rows : [];
      rebuildPublishedRowMap(ctxPublishedRows);

      syncFilterTabsUi();

      var parts = partitionProducts();
      if (!products.length) {
        if (statusEl) statusEl.textContent = M.designProductsEmpty || 'No products.';
      } else if (ctxFilter === 'locked' && !parts.locked.length) {
        if (statusEl) statusEl.textContent = M.designProductsEmptyLocked || 'No locked products.';
      } else if (ctxFilter === 'unlocked' && !parts.unlocked.length) {
        if (statusEl) statusEl.textContent = M.designProductsEmptyUnlocked || 'No unlocked products.';
      } else if (statusEl) {
        statusEl.textContent = '';
      }

      renderProductsView();
      refreshDirty();
    } catch (e) {
      console.warn('[creator-design-products-modal]', e);
      if (statusEl) statusEl.textContent = M.designProductsLoadError || 'Could not load.';
    }
  }

  async function onConfirmUpdate() {
    var M = Mi();
    var owner = getOwnerId();
    var design = ctxDesign;
    if (!owner || !design || !design.id) return;

    var nextExcluded = computeExcludedKeys(ctxEligibleKeys, ctxChecked, ctxMetaExcludedSnapshot);
    if (arraysEqualJson(nextExcluded, ctxInitialExcluded)) return;

    var shop = window.Shopify && window.Shopify.shop ? window.Shopify.shop : window.__SHOPIFY_SHOP_DOMAIN || null;
    var base = apiBase();
    var updateUrl =
      base +
      '?op=update-design&logged_in_customer_id=' +
      encodeURIComponent(owner);
    if (shop) updateUrl += '&shop=' + encodeURIComponent(shop);

    if (btnUpdate) {
      btnUpdate.disabled = true;
      btnUpdate.textContent = M.designProductsUpdating || 'Saving…';
    }

    try {
      var putRes = await fetch(updateUrl, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          design_id: design.id,
          metadata: { publish_excluded_product_keys: nextExcluded },
        }),
      });
      var putJson = await putRes.json().catch(function () {
        return {};
      });
      if (!putJson.ok) throw new Error(putJson.error || 'save_failed');

      try {
        design.metadata = Object.assign({}, design.metadata || {}, {
          publish_excluded_product_keys: nextExcluded,
        });
      } catch (_) {}

      var unpublishIds = [];
      var excludedSet = new Set(nextExcluded);
      for (var i = 0; i < ctxPublishedRows.length; i++) {
        var pr = ctxPublishedRows[i];
        if (!pr || pr.id == null) continue;
        var pk = String(pr.product_key || '').trim();
        if (excludedSet.has(pk)) unpublishIds.push(Number(pr.id));
      }

      if (unpublishIds.length) {
        var batchUrl =
          base +
          '?op=batch-unpublish-published&logged_in_customer_id=' +
          encodeURIComponent(owner);
        if (shop) batchUrl += '&shop=' + encodeURIComponent(shop);
        var batchRes = await fetch(batchUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ published_design_ids: unpublishIds }),
        });
        var batchJson = await batchRes.json().catch(function () {
          return {};
        });
        if (!batchJson.ok && !(batchJson.enqueued_ids && batchJson.enqueued_ids.length)) {
          if (statusEl) statusEl.textContent = M.designProductsUnpublishError || '';
        }
      }

      ctxInitialExcluded = nextExcluded.slice();
      // Refresh published rows map after unpublish enqueue so badges stay accurate
      rebuildPublishedRowMap(
        ctxPublishedRows.filter(function (row) {
          return row && !excludedSet.has(String(row.product_key || '').trim());
        })
      );
      ctxPublishedRows = ctxPublishedRows.filter(function (row) {
        return row && !excludedSet.has(String(row.product_key || '').trim());
      });
      syncFilterTabsUi();
      renderProductsView();
      refreshDirty();
      if (typeof window.refreshCreationsDesignProductState === 'function') {
        window.refreshCreationsDesignProductState();
      }
      if (statusEl && !statusEl.textContent) {
        statusEl.textContent = M.designProductsSaved || 'Saved.';
      }
    } catch (err) {
      console.warn('[creator-design-products-modal] save', err);
      if (statusEl) statusEl.textContent = M.designProductsSaveError || 'Could not save.';
    } finally {
      if (btnUpdate) {
        btnUpdate.textContent = M.designProductsUpdate || 'Update';
        refreshDirty();
      }
    }
  }

  /**
   * Mount / refresh products UI inside Design Preview products panel.
   * @param {{ host: Element, design: object }} opts
   */
  function mountPanel(opts) {
    var root = opts && opts.host;
    var design = opts && opts.design;
    if (!root || !design || !design.id) return;
    bindHostOnce(root);
    cacheHostRefs(root);
    applyStaticLabels();
    ctxDesign = design;
    ctxEligibleKeys = [];
    ctxChecked = {};
    ctxInitialExcluded = [];
    ctxPublishedRows = [];
    ctxPubRowByKey = {};
    ctxAllProducts = [];
    ctxFilter = resolveLibraryStatus(design) === 'active' ? 'queue' : 'all';
    if (gridEl) gridEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    syncFilterTabsUi();
    loadAndRender(design);
  }

  function unmountPanel() {
    resetPanelState();
  }

  window.CreatorDesignProductsPanel = {
    mount: mountPanel,
    unmount: unmountPanel,
    isMounted: function () {
      return !!ctxDesign;
    },
  };

  /**
   * Legacy entry: open Design Preview on Products screen (standalone overlay removed).
   */
  window.openCreatorDesignProductsModal = function (opts) {
    var design = opts && opts.design;
    if (!design || !design.id) return;
    var api = window.CreatorDesignPreviewModal;
    if (api && typeof api.open === 'function') {
      api.open(design, { screen: 'products' });
      return;
    }
    console.warn('[creator-design-products-modal] CreatorDesignPreviewModal.open unavailable');
  };

  window.closeCreatorDesignProductsModal = function () {
    var api = window.CreatorDesignPreviewModal;
    if (api && typeof api.close === 'function') api.close();
  };
})();
