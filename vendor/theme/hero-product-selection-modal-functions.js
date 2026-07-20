// Hero Product Selection Modal JavaScript Functions
// Contains all JavaScript logic for the modal (API calls, event handlers, etc.)

(function() {
  // Prevent multiple declarations if script is loaded multiple times
  if (window.heroProductSelectionModalLoaded) {
    return;
  }
  window.heroProductSelectionModalLoaded = true;

let currentHeroProductCategory = 'top';
  let selectedHeroProduct = null;
  let heroProducts = [];
  let heroRegionFilteredKeys = null;
  let heroRegionAvailability = {};
  let currentHeroRegion = (window.CreatorHeroRegions && window.CreatorHeroRegions.resolveFromShopContext)
    ? window.CreatorHeroRegions.resolveFromShopContext()
    : 'EU';
  let lockedHeroRegion = null;
  let heroModalInitialized = false; // Track if modal has been moved to body
  let heroUsedProductIds = new Set();
  let currentHeroUsageFilter = 'unused'; // 'unused' | 'used'
/** Eager `.js` fetches before lazy IO kicks in (see initHeroStorefrontLazyEnrichFromGrid). */
const HERO_MAX_STOREFRONT_ENRICH_EAGER = 14;

/** Cached Shopify `/products/{handle}.js` JSON (or null if miss). */
let storefrontProductJsonCache = new Map();
/** Coalesce concurrent storefront fetches per cache key (avoids duplicate 404s under parallel enrich). */
let storefrontProductJsonInflight = new Map();

function normalizeProductHandleForStorefront(h) {
  let s = String(h || '').trim();
  if (!s) return '';
  const q = s.indexOf('?');
  if (q !== -1) s = s.slice(0, q);
  const hash = s.indexOf('#');
  if (hash !== -1) s = s.slice(0, hash);
  try {
    s = decodeURIComponent(s);
  } catch (_e) {}
  return s;
}
/** Per-product Shopify id → index in color-only variant slices (hero modal). */
let heroColorIndexByProductKey = new Map();
let heroProductGridDelegationBound = false;
/** After a horizontal color swipe, ignore the synthetic click on the card briefly. */
let heroColorSwipeSuppressCardUntil = 0;
let heroColorSwipeTouch = { x: 0, y: 0, wrap: null };
/** Bumps on each loadHeroProducts call so stale async results cannot show errors. */
let heroProductsLoadGen = 0;

function isHeroProductModalOpen() {
  var modal = document.getElementById('hero-product-selection-modal');
  return !!(modal && modal.getAttribute('aria-hidden') === 'false');
}

function isHeroProductLoadTimeoutError(error) {
  if (!error) return false;
  var name = String(error.name || '');
  var msg = String(error.message || '');
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /timed out|aborted without reason|signal is aborted/i.test(msg)
  );
}

function teardownHeroStorefrontLazyEnrich() {
  try {
    if (window.__heroSfObserver && typeof window.__heroSfObserver.disconnect === 'function') {
      window.__heroSfObserver.disconnect();
    }
  } catch (_e) {}
  window.__heroSfObserver = null;
}

/**
 * Merge Shopify `/products/*.js` into a published-hero row (variants + featured image).
 * @returns {boolean} true if anything was applied
 */
function applyStorefrontJsonToHeroProduct(p, sp) {
  if (!p || !sp || !sp.id) return false;
  let changed = false;
  const vars = mapShopifyJsVariantsToInternal(sp);
  if (vars.length) {
    p.variants = vars;
    delete p._heroColorSlices;
    changed = true;
  }
  const img =
    sp.featured_image || (Array.isArray(sp.images) && sp.images.length ? sp.images[0] : null) || null;
  const src = typeof img === 'string' ? img : img && (img.src || img.url);
  if (src && (!p.images || !p.images.length || !(p.images[0] && (p.images[0].src || p.images[0].url)))) {
    p.images = [{ src: src }];
    changed = true;
  }
  if (src) {
    p.image = src;
    changed = true;
  }
  return changed;
}

/** For auto-pick: tops vs “addition” slot — treat generic apparel limbs as addition, not ignored. */
function heroPairBucket(p) {
  const c = categorizeHeroProduct(p);
  if (c === 'top') return 'top';
  if (c === 'additional' || c === 'clothing-other') return 'additional';
  return 'other';
}

/**
 * Build inner image block for one grid card (color swipe, carousel, or single img).
 * @returns {string}
 */
function buildHeroProductItemImageBlockHtml(product) {
  let imageUrl = null;
  if (product.images && product.images.length > 0) {
    imageUrl = product.images[0].src || product.images[0].url || product.images[0];
  } else if (product.image) {
    imageUrl = product.image.src || product.image.url || product.image;
  }

  const productIdAttr = normHeroPid(product.id || product.product_id || product.shopify_id);
  const productTitle = product.title || product.name || 'Unbekanntes Produkt';

  const slices = getHeroColorSlices(product);
  let colorIdx = heroColorIndexByProductKey.has(productIdAttr)
    ? Number(heroColorIndexByProductKey.get(productIdAttr))
    : 0;
  if (!Number.isFinite(colorIdx) || colorIdx < 0) colorIdx = 0;
  if (colorIdx >= slices.length) colorIdx = 0;
  const slice = slices[colorIdx] || slices[0];

  if (slices.length > 1 && slice && slice.image) {
    const prevL = heroModalColorAria('prev');
    const nextL = heroModalColorAria('next');
    return (
      '<div class="hero-product-selection-modal__thumb-wrap">' +
      '<button type="button" class="hero-product-selection-modal__color-nav hero-product-selection-modal__color-nav--prev" data-hero-color-nav="prev" aria-label="' +
      escapeHtmlText(prevL) +
      '">‹</button>' +
      '<div class="hero-product-selection-modal__color-img-wrap" data-hero-color-swipe-area>' +
      '<img src="' +
      escapeHtmlAttr(slice.image) +
      '" alt="" class="hero-product-selection-modal__product-image" data-hero-color-img loading="lazy" decoding="async" onerror="this.style.display=\'none\'">' +
      '</div>' +
      '<button type="button" class="hero-product-selection-modal__color-nav hero-product-selection-modal__color-nav--next" data-hero-color-nav="next" aria-label="' +
      escapeHtmlText(nextL) +
      '">›</button>' +
      '</div>' +
      (slice.label
        ? '<div class="hero-product-selection-modal__color-label" data-hero-color-label>' + escapeHtmlText(slice.label) + '</div>'
        : '<div class="hero-product-selection-modal__color-label" data-hero-color-label style="display:none"></div>')
    );
  }
  if (
    window.CreatorProductImageCarousel &&
    typeof window.CreatorProductImageCarousel.buildHtmlForModal === 'function'
  ) {
    return window.CreatorProductImageCarousel.buildHtmlForModal(product, productTitle);
  }
  if (imageUrl) {
    return (
      '<img src="' +
      escapeHtmlAttr(imageUrl) +
      '" alt="' +
      escapeHtmlText(productTitle) +
      '" class="hero-product-selection-modal__product-image" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">'
    );
  }
  return '<div class="hero-product-selection-modal__product-image-placeholder" aria-hidden="true"></div>';
}

function refreshHeroProductItemImageBlock(itemEl, product) {
  if (!itemEl || !product) return;
  itemEl.innerHTML = buildHeroProductItemImageBlockHtml(product);
  if (window.CreatorProductImageCarousel && typeof window.CreatorProductImageCarousel.bindCarouselRoot === 'function') {
    itemEl.querySelectorAll('[data-creator-carousel-root]').forEach(function (root) {
      window.CreatorProductImageCarousel.bindCarouselRoot(root);
    });
  }
}

async function heroLazyEnrichProductRow(itemEl) {
  const pid = normHeroPid(itemEl.getAttribute('data-product-id'));
  const product = findHeroProductInList(pid);
  if (!product || product._heroSfLazyBusy || product._heroSfLazyDone) return;
  if (Array.isArray(product.variants) && product.variants.length > 1) {
    product._heroSfLazyDone = true;
    return;
  }
  if (!(product.handle || product.storefront_url)) {
    product._heroSfLazyDone = true;
    return;
  }
  product._heroSfLazyBusy = true;
  try {
    const sp = await fetchStorefrontProductJson(product.handle, product.storefront_url);
    applyStorefrontJsonToHeroProduct(product, sp);
    refreshHeroProductItemImageBlock(itemEl, product);
  } catch (_e) {
  } finally {
    product._heroSfLazyBusy = false;
    product._heroSfLazyDone = true;
  }
}

function initHeroStorefrontLazyEnrichFromGrid() {
  if (!('IntersectionObserver' in window)) return;
  teardownHeroStorefrontLazyEnrich();
  const modal = document.getElementById('hero-product-selection-modal');
  const grid = document.getElementById('hero-product-selection-modal-grid');
  if (!modal || !grid) return;
  if (modal.getAttribute('aria-hidden') === 'true') return;
  const io = new IntersectionObserver(
    function (entries) {
      for (let i = 0; i < entries.length; i += 1) {
        const en = entries[i];
        if (!en.isIntersecting) continue;
        const el = /** @type {HTMLElement} */ (en.target);
        io.unobserve(el);
        heroLazyEnrichProductRow(el);
      }
    },
    { root: null, rootMargin: '140px', threshold: 0.02 }
  );
  const items = grid.querySelectorAll('.hero-product-selection-modal__product-item');
  for (let j = 0; j < items.length; j += 1) io.observe(items[j]);
  window.__heroSfObserver = io;
}

function extractNumericProductId(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const gidMatch = raw.match(/gid:\/\/shopify\/Product\/(\d+)/i);
  if (gidMatch && gidMatch[1]) return gidMatch[1];
  const digits = raw.replace(/\D+/g, '');
  return digits || '';
}

function isHeroProductUsed(product) {
  if (!product) return false;
  const candidates = [];
  if (product.id) candidates.push(String(product.id));
  if (product.shopify_product_id) candidates.push(String(product.shopify_product_id));
  if (product.product_id) candidates.push(String(product.product_id));

  for (let i = 0; i < candidates.length; i += 1) {
    const raw = candidates[i];
    if (heroUsedProductIds.has(raw)) return true;
    const numeric = extractNumericProductId(raw);
    if (!numeric) continue;
    if (heroUsedProductIds.has(numeric)) return true;
    if (heroUsedProductIds.has('gid://shopify/Product/' + numeric)) return true;
  }
  return false;
}

function normHeroPid(v) {
  return v == null ? '' : String(v).trim();
}

function heroModalColorAria(dir) {
  var m = window.CreatorI18n && window.CreatorI18n.hero_product_modal;
  if (dir === 'next') return (m && m.color_next) || 'Next color';
  return (m && m.color_previous) || 'Previous color';
}

function isHeroColorOptionName(name) {
  return /^(color|farbe|colour|couleur|colore)$/i.test(String(name || '').trim());
}

function stripUrlForSliceDedup(u) {
  const s = String(u || '').trim();
  const q = s.indexOf('?');
  return (q === -1 ? s : s.slice(0, q)).toLowerCase();
}

function variantHeroImageUrl(v, fallbackImg) {
  if (v && v.image) {
    if (typeof v.image === 'string') return v.image;
    return v.image.src || v.image.url || '';
  }
  if (v && v.featured_image) {
    if (typeof v.featured_image === 'string') return v.featured_image;
    return v.featured_image.src || v.featured_image.url || '';
  }
  return String(fallbackImg || '');
}

function variantSliceLabelFromOptions(v) {
  const opts = Array.isArray(v.options) ? v.options : [];
  const parts = [];
  for (let i = 0; i < opts.length; i += 1) {
    const o = opts[i];
    if (!o) continue;
    const val = String(o.value || '').trim();
    if (!val) continue;
    parts.push(val);
  }
  return parts.slice(0, 3).join(' · ');
}

/** Distinct preview images across variants (size, color with different mockups, etc.). */
function buildDistinctVariantImageSlices(variants, fallbackImg) {
  const seen = new Map();
  const out = [];
  for (let j = 0; j < variants.length; j += 1) {
    const v = variants[j];
    const vid = String(v.id || '').trim();
    if (!vid) continue;
    const img = variantHeroImageUrl(v, fallbackImg);
    if (!img) continue;
    const key = stripUrlForSliceDedup(img);
    if (seen.has(key)) continue;
    seen.set(key, true);
    const lab = variantSliceLabelFromOptions(v);
    out.push({ variantId: vid, label: lab, image: img });
  }
  return out;
}

function getHeroColorSlices(product) {
  if (!product) return [];
  if (product._heroColorSlices) return product._heroColorSlices;

  const fallbackImg =
    product.image ||
    (product.images && product.images[0] && (product.images[0].src || product.images[0].url || product.images[0])) ||
    '';

  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) {
    product._heroColorSlices = [
      {
        variantId: product.variantId ? String(product.variantId) : '',
        label: '',
        image: String(fallbackImg || ''),
      },
    ];
    return product._heroColorSlices;
  }

  function colorEntryForVariant(v) {
    const opts = v.options || [];
    for (let i = 0; i < opts.length; i += 1) {
      if (isHeroColorOptionName(opts[i].name)) {
        return { value: String(opts[i].value || '').trim(), label: String(opts[i].value || '').trim() };
      }
    }
    return null;
  }

  let colorSlices = [];
  const firstColor = colorEntryForVariant(variants[0]);
  if (firstColor) {
    const byColor = new Map();
    for (let j = 0; j < variants.length; j += 1) {
      const v = variants[j];
      const ce = colorEntryForVariant(v);
      if (!ce || !ce.value) continue;
      const key = ce.value.toLowerCase();
      if (byColor.has(key)) continue;
      const img = variantHeroImageUrl(v, fallbackImg) || fallbackImg;
      byColor.set(key, {
        variantId: String(v.id || ''),
        label: ce.label,
        image: String(img || ''),
      });
    }
    colorSlices = Array.from(byColor.values()).filter(function (s) {
      return s.variantId;
    });
    if (colorSlices.length < 2) {
      const v0 = variants[0];
      const img = variantHeroImageUrl(v0, fallbackImg) || fallbackImg;
      colorSlices = [{ variantId: String(v0.id || ''), label: firstColor.label, image: String(img || '') }];
    }
  } else {
    const v0 = variants[0];
    const img = variantHeroImageUrl(v0, fallbackImg) || fallbackImg;
    colorSlices = [{ variantId: String(v0.id || ''), label: '', image: String(img || '') }];
  }

  const distinctSlices = buildDistinctVariantImageSlices(variants, fallbackImg);

  let resolved;
  if (colorSlices.length >= 2) {
    resolved = colorSlices;
  } else if (distinctSlices.length >= 2) {
    resolved = distinctSlices;
  } else if (colorSlices.length) {
    resolved = colorSlices;
  } else if (distinctSlices.length) {
    resolved = distinctSlices;
  } else {
    const v0 = variants[0];
    resolved = [
      {
        variantId: String(v0.id || ''),
        label: '',
        image: String(variantHeroImageUrl(v0, fallbackImg) || fallbackImg || ''),
      },
    ];
  }

  product._heroColorSlices = resolved;
  return product._heroColorSlices;
}

function applyHeroColorSelectionToProduct(product) {
  if (!product) return;
  const slices = getHeroColorSlices(product);
  if (!slices.length) return;
  const pid = normHeroPid(product.id);
  let idx = heroColorIndexByProductKey.has(pid) ? Number(heroColorIndexByProductKey.get(pid)) : 0;
  if (!Number.isFinite(idx) || idx < 0) idx = 0;
  if (idx >= slices.length) idx = 0;
  const slice = slices[idx];
  if (!slice) return;
  product.selected_variant_id = slice.variantId || null;
  if (slice.image) {
    product.images = [{ src: slice.image }];
    product.image = slice.image;
  }
}

function updateHeroProductCardColorUI(itemEl, product, slices, idx) {
  if (!itemEl || !slices || !slices.length) return;
  const slice = slices[Math.max(0, Math.min(idx, slices.length - 1))];
  const img = itemEl.querySelector('[data-hero-color-img]');
  if (img && slice && slice.image) {
    img.src = slice.image;
  }
  const lab = itemEl.querySelector('[data-hero-color-label]');
  if (lab) {
    lab.textContent = slice && slice.label ? slice.label : '';
    lab.style.display = slice && slice.label ? 'block' : 'none';
  }
}

function findHeroProductInList(pid) {
  const p = normHeroPid(pid);
  return heroProducts.find(function (x) {
    return (
      normHeroPid(x.id) === p ||
      normHeroPid(x.product_id) === p ||
      normHeroPid(x.shopify_id) === p ||
      normHeroPid(x.shopify_product_id) === p
    );
  });
}

/**
 * @param {HTMLElement} itemEl
 * @param {number} dir -1 = previous color, +1 = next
 * @returns {boolean} true if the product had multiple colors and the index changed
 */
function advanceHeroProductColorVariant(itemEl, dir) {
  if (!itemEl || (dir !== 1 && dir !== -1)) return false;
  const pid = normHeroPid(itemEl.getAttribute('data-product-id'));
  const product = findHeroProductInList(pid);
  if (!product) return false;
  const slices = getHeroColorSlices(product);
  if (slices.length < 2) return false;
  let cur = heroColorIndexByProductKey.has(pid) ? Number(heroColorIndexByProductKey.get(pid)) : 0;
  if (!Number.isFinite(cur)) cur = 0;
  const next = (cur + dir + slices.length) % slices.length;
  heroColorIndexByProductKey.set(pid, next);
  updateHeroProductCardColorUI(itemEl, product, slices, next);
  if (selectedHeroProduct && normHeroPid(selectedHeroProduct.id) === normHeroPid(product.id)) {
    applyHeroColorSelectionToProduct(product);
    updateHeroProductSelectionButtons();
  }
  return true;
}

function onHeroProductGridClick(ev) {
  const btn = ev.target && ev.target.closest && ev.target.closest('[data-hero-color-nav]');
  if (btn) {
    ev.preventDefault();
    ev.stopPropagation();
    const item = btn.closest('.hero-product-selection-modal__product-item');
    if (!item) return;
    const dir = btn.getAttribute('data-hero-color-nav') === 'next' ? 1 : -1;
    advanceHeroProductColorVariant(item, dir);
    return;
  }

  const card = ev.target && ev.target.closest && ev.target.closest('[data-hero-select-product]');
  if (!card) return;
  if (Date.now() < heroColorSwipeSuppressCardUntil) return;
  if (ev.target.closest('[data-creator-carousel-prev], [data-creator-carousel-next]')) return;
  const pid = normHeroPid(card.getAttribute('data-product-id'));
  selectHeroProduct(pid, ev);
}

function bindHeroProductGridDelegationOnce() {
  if (heroProductGridDelegationBound) return;
  const grid = document.getElementById('hero-product-selection-modal-grid');
  if (!grid) return;
  heroProductGridDelegationBound = true;
  grid.addEventListener('click', onHeroProductGridClick);
  grid.addEventListener('touchstart', function (ev) {
    const wrap = ev.target && ev.target.closest && ev.target.closest('[data-hero-color-swipe-area]');
    if (!wrap || !grid.contains(wrap)) {
      heroColorSwipeTouch.wrap = null;
      return;
    }
    if (!ev.changedTouches || !ev.changedTouches[0]) return;
    heroColorSwipeTouch.wrap = wrap;
    heroColorSwipeTouch.x = ev.changedTouches[0].clientX;
    heroColorSwipeTouch.y = ev.changedTouches[0].clientY;
  }, { passive: true });
  grid.addEventListener('touchend', function (ev) {
    const wrap = heroColorSwipeTouch.wrap;
    if (!wrap || !ev.changedTouches || !ev.changedTouches[0]) return;
    if (!grid.contains(wrap)) {
      heroColorSwipeTouch.wrap = null;
      return;
    }
    var dx = ev.changedTouches[0].clientX - heroColorSwipeTouch.x;
    var dy = ev.changedTouches[0].clientY - heroColorSwipeTouch.y;
    heroColorSwipeTouch.wrap = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    var item = wrap.closest('.hero-product-selection-modal__product-item');
    if (!item) return;
    var dir = dx > 0 ? -1 : 1;
    if (!advanceHeroProductColorVariant(item, dir)) return;
    ev.preventDefault();
    heroColorSwipeSuppressCardUntil = Date.now() + 450;
  }, { passive: false });

  var heroColorPointerSwipe = { wrap: null, x: 0, y: 0, id: null };
  function resetHeroColorPointerSwipe() {
    heroColorPointerSwipe.wrap = null;
    heroColorPointerSwipe.id = null;
  }
  grid.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType === 'touch') return;
    if (ev.button !== 0) return;
    var wrap = ev.target.closest && ev.target.closest('[data-hero-color-swipe-area]');
    if (!wrap || !grid.contains(wrap)) return;
    heroColorPointerSwipe.wrap = wrap;
    heroColorPointerSwipe.x = ev.clientX;
    heroColorPointerSwipe.y = ev.clientY;
    heroColorPointerSwipe.id = ev.pointerId;
    try {
      wrap.setPointerCapture(ev.pointerId);
    } catch (_e) {}
  });
  grid.addEventListener('pointerup', function (ev) {
    if (ev.pointerType === 'touch') return;
    var wrap = heroColorPointerSwipe.wrap;
    if (!wrap || heroColorPointerSwipe.id !== ev.pointerId) {
      resetHeroColorPointerSwipe();
      return;
    }
    try {
      wrap.releasePointerCapture(ev.pointerId);
    } catch (_e) {}
    var dx = ev.clientX - heroColorPointerSwipe.x;
    var dy = ev.clientY - heroColorPointerSwipe.y;
    resetHeroColorPointerSwipe();
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    var item = wrap.closest('.hero-product-selection-modal__product-item');
    if (!item) return;
    var dir = dx > 0 ? -1 : 1;
    if (!advanceHeroProductColorVariant(item, dir)) return;
    heroColorSwipeSuppressCardUntil = Date.now() + 450;
  });
  grid.addEventListener('pointercancel', resetHeroColorPointerSwipe);

  grid.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const card =
        ev.target && ev.target.getAttribute && ev.target.getAttribute('data-hero-select-product') != null
          ? ev.target
          : ev.target.closest && ev.target.closest('[data-hero-select-product]');
      if (!card || !grid.contains(card)) return;
      var dir = ev.key === 'ArrowRight' ? 1 : -1;
      if (advanceHeroProductColorVariant(card, dir)) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      return;
    }
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const card =
      ev.target && ev.target.getAttribute && ev.target.getAttribute('data-hero-select-product') != null
        ? ev.target
        : ev.target.closest && ev.target.closest('[data-hero-select-product]');
    if (!card || !grid.contains(card)) return;
    if (ev.target.closest && ev.target.closest('[data-hero-color-nav], [data-creator-carousel-prev], [data-creator-carousel-next]')) {
      return;
    }
    ev.preventDefault();
    selectHeroProduct(card.getAttribute('data-product-id'), ev);
  });
}

function sortHeroProductsNewestFirst(products) {
  function timeMs(p) {
    if (!p) return 0;
    if (p.created_at) {
      const d = Date.parse(String(p.created_at));
      if (Number.isFinite(d)) return d;
    }
    if (p.last_published_at != null) {
      const n = Number(p.last_published_at);
      if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
    }
    const num = parseInt(String(p.shopify_product_id || extractNumericProductId(p.id) || '0'), 10);
    return Number.isFinite(num) ? num : 0;
  }
  return (products || []).slice().sort(function (a, b) {
    return timeMs(b) - timeMs(a);
  });
}

function escapeHtmlText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function normalizeHeroModalCategory(category) {
  var c = String(category || '').toLowerCase();
  if (c === 'top') return 'top';
  if (c === 'addition' || c === 'additional') return 'additional';
  return 'all';
}

function normalizeHeroRegionCode(regionCode) {
  if (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.normalizeRegionCode === 'function') {
    return window.CreatorHeroRegions.normalizeRegionCode(regionCode);
  }
  var code = String(regionCode || '').trim().toUpperCase();
  if (!code) return 'EU';
  if (code === 'UK') return 'GB';
  if (code === 'AU_NZ') return 'AU';
  if (code === 'PC' || code === 'PRINTIFY') return 'PRINTIFY_CHOICE';
  if (code === 'EU' || code === 'US' || code === 'GB' || code === 'CA' || code === 'AU' || code === 'CN' || code === 'PRINTIFY_CHOICE') return code;
  return 'EU';
}

function syncHeroRegionTabs() {
  var hintEl = document.getElementById('hero-product-region-lock-hint');
  var tabs = document.querySelectorAll('[data-hero-region-tab]');
  tabs.forEach(function (btn) {
    var code = normalizeHeroRegionCode(btn.getAttribute('data-hero-region-tab'));
    btn.classList.toggle('hero-product-selection-modal__region-tab--active', code === currentHeroRegion);
    var isUnavailable = heroRegionAvailability[code] === false;
    var isLockedOut = !!lockedHeroRegion && code !== lockedHeroRegion;
    btn.classList.toggle('hero-product-selection-modal__region-tab--locked', isLockedOut);
    btn.classList.toggle('hero-product-selection-modal__region-tab--unavailable', isUnavailable);
    btn.setAttribute('aria-disabled', isLockedOut ? 'true' : 'false');
  });
  if (hintEl) {
    if (lockedHeroRegion) {
      var label = lockedHeroRegion;
      if (window.CreatorHeroRegions && Array.isArray(window.CreatorHeroRegions.tabs)) {
        var match = window.CreatorHeroRegions.tabs.find(function (item) { return item.code === lockedHeroRegion; });
        if (match && match.label) label = match.label;
      }
      hintEl.textContent = 'Region ist für diesen Hero auf ' + label + ' fixiert.';
      hintEl.style.display = 'block';
    } else {
      hintEl.textContent = '';
      hintEl.style.display = 'none';
    }
  }
}

function setHeroRegionFromContext(options) {
  var opts = options || {};
  var contextRegion = opts.lockedRegion || null;
  lockedHeroRegion = contextRegion ? normalizeHeroRegionCode(contextRegion) : null;
  if (lockedHeroRegion) {
    currentHeroRegion = lockedHeroRegion;
  } else if (opts.initialRegion) {
    currentHeroRegion = normalizeHeroRegionCode(opts.initialRegion);
  } else if (window.CreatorHeroRegions && typeof window.CreatorHeroRegions.resolveFromShopContext === 'function') {
    currentHeroRegion = normalizeHeroRegionCode(window.CreatorHeroRegions.resolveFromShopContext());
  } else {
    currentHeroRegion = normalizeHeroRegionCode(currentHeroRegion);
  }
  syncHeroRegionTabs();
}

async function refreshHeroRegionAvailability() {
  var availability = {};
  var tabs = (window.CreatorHeroRegions && Array.isArray(window.CreatorHeroRegions.tabs))
    ? window.CreatorHeroRegions.tabs
    : [{ code: 'EU' }, { code: 'US' }, { code: 'GB' }, { code: 'CA' }, { code: 'AU' }, { code: 'CN' }, { code: 'PRINTIFY_CHOICE' }];
  await Promise.allSettled(tabs.map(async function (tab) {
    var code = normalizeHeroRegionCode(tab.code);
    if (code === 'PRINTIFY_CHOICE') {
      availability[code] = true;
      return;
    }
    try {
      var catalog = await window.creatorApiFetch('get-catalog-products', { region: code });
      var cntOnline = Array.isArray(catalog && catalog.products) ? catalog.products.length : 0;
      var cntPreview = Array.isArray(catalog && catalog.preview_products) ? catalog.preview_products.length : 0;
      availability[code] = !!(catalog && catalog.ok && (cntOnline + cntPreview > 0));
    } catch (_e) {
      // Bei API-Fehler nicht hart sperren
      availability[code] = true;
    }
  }));
  heroRegionAvailability = availability;
  syncHeroRegionTabs();
}

function isLikelyShopifyLocalePathPrefix(seg) {
  return !!seg && /^[a-z]{2}(-[a-z]{2})?$/i.test(String(seg).trim());
}

function buildStorefrontProductJsonUrls(handle, storefrontUrl) {
  const urls = [];
  const cleanHandle = normalizeProductHandleForStorefront(handle);
  const seen = new Set();
  function push(u) {
    if (!u || seen.has(u)) return;
    seen.add(u);
    urls.push(u);
  }
  if (storefrontUrl) {
    try {
      const u = new URL(String(storefrontUrl));
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        const m = (u.pathname || '').match(/\/products\/([^/]+)\/?$/i);
        if (m && m[1]) {
          const h = normalizeProductHandleForStorefront(decodeURIComponent(m[1]));
          if (h) push(`${u.origin}/products/${encodeURIComponent(h)}.js`);
        }
      }
    } catch (_e) {}
  }
  /** One canonical `.js` URL when we have a stored storefront link — avoids duplicate locale+default fetches and halves 404 noise. */
  if (urls.length) return urls;
  if (cleanHandle) {
    const parts = (window.location && window.location.pathname || '').split('/').filter(Boolean);
    const localeSeg = parts.length && isLikelyShopifyLocalePathPrefix(parts[0]) ? parts[0] : '';
    if (localeSeg) {
      push(`${window.location.origin}/${localeSeg}/products/${encodeURIComponent(cleanHandle)}.js`);
    }
    push(`${window.location.origin}/products/${encodeURIComponent(cleanHandle)}.js`);
  }
  return urls;
}

async function fetchStorefrontProductJson(handle, storefrontUrl) {
  const cleanHandle = normalizeProductHandleForStorefront(handle);
  const cacheKey = cleanHandle || String(storefrontUrl || '').trim();
  if (!cacheKey) return null;
  if (storefrontProductJsonCache.has(cacheKey)) {
    return storefrontProductJsonCache.get(cacheKey);
  }
  if (storefrontProductJsonInflight.has(cacheKey)) {
    return storefrontProductJsonInflight.get(cacheKey);
  }
  /** Shopify handles are slug-safe; skip obvious junk to avoid pointless 404s. */
  if (cleanHandle && (/[\s%]/.test(cleanHandle) || cleanHandle.length > 200)) {
    storefrontProductJsonCache.set(cacheKey, null);
    return null;
  }
  if (!cleanHandle && !String(storefrontUrl || '').trim()) {
    storefrontProductJsonCache.set(cacheKey, null);
    return null;
  }

  const task = (async function () {
    const urls = buildStorefrontProductJsonUrls(cleanHandle, storefrontUrl);
    for (let i = 0; i < urls.length; i += 1) {
      try {
        const res = await fetch(urls[i], { credentials: 'include', cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json().catch(function () { return null; });
        if (data && data.id) {
          storefrontProductJsonCache.set(cacheKey, data);
          return data;
        }
      } catch (_e) {}
    }
    storefrontProductJsonCache.set(cacheKey, null);
    return null;
  })();

  storefrontProductJsonInflight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    storefrontProductJsonInflight.delete(cacheKey);
  }
}

function mapShopifyJsVariantsToInternal(sp) {
  if (!sp || !Array.isArray(sp.variants)) return [];
  const optDefs = Array.isArray(sp.options) ? sp.options : [];
  return sp.variants.map(function (v) {
    const opts = [];
    for (let i = 0; i < optDefs.length; i += 1) {
      const def = optDefs[i];
      const name = def && def.name != null ? String(def.name) : '';
      const key = 'option' + (i + 1);
      if (!(key in v)) continue;
      const val = v[key];
      if (val == null || String(val).trim() === '') continue;
      opts.push({ name: name || 'Option', value: String(val).trim() });
    }
    const out = Object.assign({}, v);
    out.options = opts;
    if (!out.image && out.featured_image != null) {
      const fi = out.featured_image;
      out.image = typeof fi === 'string' ? fi : (fi && (fi.src || fi.url)) || '';
    }
    return out;
  });
}

/**
 * For published-product fallback rows: fetch Shopify product JSON (bounded concurrency),
 * merge variants + images so color/variant UI works and we avoid hundreds of parallel 404s.
 */
async function enrichPublishedHeroProductsFromStorefront(products) {
  const list = Array.isArray(products) ? products : [];
  const targets = list.filter(function (p) {
    if (!p || !(p.handle || p.storefront_url)) return false;
    if (Array.isArray(p.variants) && p.variants.length > 1) return false;
    return true;
  });
  if (!targets.length) return;

  /** Small eager head; remaining cards use IntersectionObserver lazy fetch. */
  const capped =
    targets.length > HERO_MAX_STOREFRONT_ENRICH_EAGER
      ? targets.slice(0, HERO_MAX_STOREFRONT_ENRICH_EAGER)
      : targets;

  const limit = 6;
  let ix = 0;
  async function worker() {
    while (true) {
      const j = ix++;
      if (j >= capped.length) break;
      const p = capped[j];
      try {
        const sp = await fetchStorefrontProductJson(p.handle, p.storefront_url);
        applyStorefrontJsonToHeroProduct(p, sp);
      } catch (_e) {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, capped.length) }, function () { return worker(); }));
}

function heroMarketingOwnerId() {
  return window.__EAZ_OWNER_ID != null && window.__EAZ_OWNER_ID !== ''
    ? String(window.__EAZ_OWNER_ID)
    : window.logged_in_customer_id != null
      ? String(window.logged_in_customer_id)
      : null;
}

/** Same mockup R2 URLs as hero preview modal / product picker (mockup_templates). */
async function enrichHeroProductMockupFromCatalogByKey(p) {
  if (!p || !p.product_key) return;
  const pk = String(p.product_key).trim();
  if (!pk) return;
  const owner = heroMarketingOwnerId();
  if (!owner || typeof window.creatorApiFetch !== 'function') return;
  try {
    const data = await window.creatorApiFetch('get-products-by-keys', {
      owner_id: owner,
      product_keys: pk,
    });
    if (!data || !data.ok || !Array.isArray(data.products) || !data.products.length) return;
    const row =
      data.products.find(function (x) {
        return x && String(x.product_key) === pk;
      }) || data.products[0];
    const iu = row && row.image_url && String(row.image_url).trim();
    if (!iu) return;
    p.images = [{ src: iu }];
    p.image = iu;
    try {
      delete p._heroColorSlices;
    } catch (_e) {}
    applyHeroColorSelectionToProduct(p);
  } catch (_e) {}
}

/** Admin + DB fallbacks for preview when storefront + catalog mockup row missing. */
async function enrichHeroProductImageFromShopifyIds(p) {
  if (!p) return;
  const n = extractNumericProductId(p.shopify_product_id != null ? p.shopify_product_id : p.id);
  if (!n || typeof window.creatorApiFetch !== 'function') return;
  const owner = heroMarketingOwnerId();
  if (!owner) return;
  try {
    const gid = 'gid://shopify/Product/' + n;
    const data = await window.creatorApiFetch('get-products-by-shopify-ids', {
      owner_id: owner,
      shopify_ids: gid,
    });
    if (!data || !data.ok || !Array.isArray(data.products) || !data.products.length) return;
    const row = data.products[0];
    const iu = row && row.image_url && String(row.image_url).trim();
    if (!iu) return;
    p.images = [{ src: iu }];
    p.image = iu;
    try {
      delete p._heroColorSlices;
    } catch (_e2) {}
    applyHeroColorSelectionToProduct(p);
  } catch (_e) {}
}

/**
 * Marketing auto-pick: prefer catalog + worker product APIs (no storefront 404)
 * before hitting `/products/{handle}.js` for stale handles.
 */
async function ensureHeroMarketingPickHasPreviewImages(p) {
  if (!p) return;
  function rowHasImg() {
    const img =
      (p.images && p.images[0] && (p.images[0].src || p.images[0].url)) ||
      (typeof p.image === 'string' ? p.image : p.image && (p.image.src || p.image.url));
    return !!(img && String(img).trim());
  }
  if (rowHasImg()) return;

  const numericSid = extractNumericProductId(p.shopify_product_id != null ? p.shopify_product_id : p.id);

  if (p.product_key && String(p.product_key).trim()) {
    await enrichHeroProductMockupFromCatalogByKey(p);
  }
  if (!rowHasImg() && numericSid) {
    await enrichHeroProductImageFromShopifyIds(p);
  }

  if (!rowHasImg() && (p.handle || String(p.storefront_url || '').trim())) {
    try {
      const sp = await fetchStorefrontProductJson(p.handle, p.storefront_url);
      if (sp) {
        applyStorefrontJsonToHeroProduct(p, sp);
        try {
          delete p._heroColorSlices;
        } catch (_e2) {}
        applyHeroColorSelectionToProduct(p);
      }
    } catch (_e) {}
  }
}

function heroMarketingPoolRowLikelyResolvable(p) {
  if (!p) return false;
  const img0 =
    (p.images && p.images[0] && (p.images[0].src || p.images[0].url || '')) ||
    (typeof p.image === 'string' ? p.image : p.image && (p.image.src || p.image.url || '')) ||
    '';
  if (img0 && String(img0).trim()) return true;
  const ff = p.featured_image;
  const ffStr = ff ? (typeof ff === 'string' ? ff : ff.src || ff.url || '') : '';
  if (ffStr && String(ffStr).trim()) return true;
  if (p.product_key && String(p.product_key).trim()) return true;
  const sid = extractNumericProductId(p.shopify_product_id != null ? p.shopify_product_id : p.id);
  if (sid) return true;
  if (p.handle || String(p.storefront_url || '').trim()) return true;
  return false;
}

function openHeroProductSelectionModal(category, callback, options) {
  console.log('🎯 Opening product selection modal for category:', category);

  const modal = document.getElementById('hero-product-selection-modal');
  if (!modal) {
    console.error('[HeroModal] Modal element not found in DOM');
    return;
  }

  // ✅ Fix: Modal IMMER direkt in <body> sicherstellen (idempotent)
  // Verhindert transform/overflow/filter container issues die position:fixed brechen
  if (modal.parentElement !== document.body) {
    console.log('[HeroModal] Moving modal to <body> (was child of:', modal.parentElement?.tagName, modal.parentElement?.id, ')');
    document.body.appendChild(modal);
  }

  currentHeroProductCategory = normalizeHeroModalCategory(category);
  selectedHeroProduct = null;
  updateHeroProductSelectionButtons();
  setHeroRegionFromContext(options);

  // Update modal title
  const titleElement = document.getElementById('hero-product-selection-modal-title');
  if (titleElement) {
    titleElement.textContent = `Produkt auswählen - ${category.charAt(0).toUpperCase() + category.slice(1)}`;
  }

  // Reset category buttons (no active state for visual feedback only)
  document.querySelectorAll('.hero-product-selection-modal__category-btn').forEach(btn => {
    btn.classList.remove('hero-product-selection-modal__category-btn--active');
  });

  // Reset search
  const searchInput = document.getElementById('hero-product-selection-modal-search');
  if (searchInput) searchInput.value = '';

  // Sicherstellen, dass die Basis-Klasse vorhanden ist
  if (!modal.classList.contains('creator-modal')) {
    modal.classList.add('creator-modal');
  }

  // Force reflow vor dem Setzen der open-Klasse
  void modal.offsetHeight;

  // Show modal
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('creator-modal--open');

  // INLINE-STYLES: Sichtbarkeit GARANTIEREN, unabhängig von CSS-Cascade
  modal.style.cssText = 'opacity:1; pointer-events:auto; display:flex; position:fixed; inset:0; z-index:2147483647; align-items:center; justify-content:center; background:rgba(2,6,23,0.92); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);';

  if (window.__HERO_MODAL_DEBUG) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!modal) return;
        var cs = window.getComputedStyle(modal);
        console.log('[HeroModal] OPEN CHECK', {
          inBody: document.body.contains(modal),
          parentTag: modal.parentElement ? modal.parentElement.tagName : null,
          parentId: modal.parentElement ? modal.parentElement.id : null,
          hasOpenClass: modal.classList.contains('creator-modal--open'),
          ariaHidden: modal.getAttribute('aria-hidden'),
          opacity: cs.opacity,
          display: cs.display,
          visibility: cs.visibility,
          pointerEvents: cs.pointerEvents,
          zIndex: cs.zIndex,
          rect: modal.getBoundingClientRect(),
        });
      });
    });
  }

  // Lock body scroll like other creator modals
  const win = /** @type {any} */ (window);
  const physics = win.CreatorModalPhysics;
  if (physics && typeof physics.lockBodyScroll === 'function') {
    physics.lockBodyScroll();
  }
  if (physics && typeof physics.initModalScrollLock === 'function') {
    physics.initModalScrollLock(modal);
  }

  // Add callback to modal for when product is selected
  modal._callback = callback;

  // Load products with error handling
  setTimeout(() => {
    loadHeroProducts().catch(error => {
      console.error('❌ Failed to load products on modal open:', error);
    });
  }, 100);
}

// Neue Funktion: Modal sofort öffnen mit mock data (ohne API)
function openHeroProductSelectionModalSimple(category, callback, options) {
  console.log('🎯 Opening product selection modal (simple mode) for category:', category);

  const modal = document.getElementById('hero-product-selection-modal');
  if (!modal) {
    console.error('[HeroModal] Modal element not found in DOM');
    return;
  }

  // ✅ Fix: Modal IMMER direkt in <body> sicherstellen (idempotent)
  if (modal.parentElement !== document.body) {
    console.log('[HeroModal] Moving modal to <body> (was child of:', modal.parentElement?.tagName, modal.parentElement?.id, ')');
    document.body.appendChild(modal);
  }

  currentHeroProductCategory = normalizeHeroModalCategory(category);
  selectedHeroProduct = null;
  updateHeroProductSelectionButtons();
  setHeroRegionFromContext(options);

  // Update modal title
  const titleElement = document.getElementById('hero-product-selection-modal-title');
  if (titleElement) {
    titleElement.textContent = `Produkt auswählen - ${category.charAt(0).toUpperCase() + category.slice(1)}`;
  }

  // Sicherstellen, dass die Basis-Klasse vorhanden ist
  if (!modal.classList.contains('creator-modal')) {
    modal.classList.add('creator-modal');
  }

  // Force reflow
  void modal.offsetHeight;

  // Show modal
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('creator-modal--open');

  // INLINE-STYLES: Sichtbarkeit GARANTIEREN
  modal.style.cssText = 'opacity:1; pointer-events:auto; display:flex; position:fixed; inset:0; z-index:2147483647; align-items:center; justify-content:center; background:rgba(2,6,23,0.92); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);';

  // Lock body scroll like other creator modals
  const win = /** @type {any} */ (window);
  const physics = win.CreatorModalPhysics;
  if (physics && typeof physics.lockBodyScroll === 'function') {
    physics.lockBodyScroll();
  }
  if (physics && typeof physics.initModalScrollLock === 'function') {
    physics.initModalScrollLock(modal);
  }

  // Add callback to modal for when product is selected
  modal._callback = callback;

  // Sofort mock data laden (ohne API)
  loadHeroProductsSimple();
}

  // Global verfügbar machen
  window.openHeroProductSelectionModal = openHeroProductSelectionModal;
  window.openHeroProductSelectionModalSimple = openHeroProductSelectionModalSimple;
  window.loadHeroProductsMock = loadHeroProductsMock; // Fallback für Testing
  window.selectHeroProduct = selectHeroProduct;
  window.confirmHeroProductSelection = confirmHeroProductSelection;
  window.closeHeroProductSelectionModal = closeHeroProductSelectionModal;
  window.setHeroProductUsageFilter = setHeroProductUsageFilter;
  window.setHeroProductRegionFilter = setHeroProductRegionFilter;

function closeHeroProductSelectionModal() {
  console.log('❌ Closing product selection modal');

  heroProductsLoadGen += 1;

  try {
    if (typeof window !== 'undefined') window.__heroModalUsedProductsContext = 'hero';
  } catch (_) {}

  const modal = document.getElementById('hero-product-selection-modal');
  if (!modal) return;

  // Sofort unsichtbar machen (kein Flicker)
  modal.style.opacity = '0';
  modal.style.pointerEvents = 'none';

  // Remove focus from any focused element within modal before hiding
  const activeElement = document.activeElement;
  if (activeElement && modal.contains(activeElement)) {
    /** @type {HTMLElement} */ (activeElement).blur();
  }

  // Unlock body scroll like other creator modals
  const win = /** @type {any} */ (window);
  const physics = win.CreatorModalPhysics;
  if (physics && typeof physics.removeModalScrollLock === 'function') {
    physics.removeModalScrollLock(modal);
  }
  if (physics && typeof physics.unlockBodyScroll === 'function') {
    physics.unlockBodyScroll();
  }

  // Hide modal
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('creator-modal--open');

  // Alle Inline-Styles entfernen + display:none für FOUC-Schutz
  modal.style.cssText = '';
  modal.style.display = 'none';

  // Reset state
  selectedHeroProduct = null;
  updateHeroProductSelectionButtons();
  teardownHeroStorefrontLazyEnrich();
}

function confirmHeroProductSelection() {
  if (!selectedHeroProduct) return;

  try {
    var pid = normHeroPid(
      selectedHeroProduct.id || selectedHeroProduct.product_id || selectedHeroProduct.shopify_id || selectedHeroProduct.shopify_product_id
    );
    var card = document.querySelector('.hero-product-selection-modal__product-item--selected');
    if (card && (!pid || normHeroPid(card.getAttribute('data-product-id')) === pid)) {
      var u =
        window.CreatorProductImageCarousel &&
        typeof window.CreatorProductImageCarousel.getVisibleCarouselImageUrlFromCard === 'function'
          ? window.CreatorProductImageCarousel.getVisibleCarouselImageUrlFromCard(card)
          : null;
      if (u) selectedHeroProduct.hero_generation_image_url = u;
    }
  } catch (_syncErr) {}

  console.log('✅ Confirming product selection:', selectedHeroProduct);
  if (selectedHeroProduct.region) {
    window.selectedHeroRegion = normalizeHeroRegionCode(selectedHeroProduct.region);
  } else {
    window.selectedHeroRegion = currentHeroRegion;
  }

  const modal = document.getElementById('hero-product-selection-modal');
  if (modal._callback) {
    modal._callback(selectedHeroProduct);
  }

  closeHeroProductSelectionModal();
}

async function loadHeroProducts(creatorName, retryCount, options) {
  retryCount = retryCount || 0;
  options = options || {};
  var silent = !!options.silent;
  var loadGen = ++heroProductsLoadGen;
  currentHeroRegion = normalizeHeroRegionCode(currentHeroRegion);
  console.log('📦 Loading hero products from Shopify API...', creatorName ? `for creator: ${creatorName}` : 'no creator filter', 'region:', currentHeroRegion, silent ? '(silent)' : '');

  const loadingElement = document.getElementById('hero-product-selection-modal-loading');
  const gridElement = document.getElementById('hero-product-selection-modal-grid');
  const emptyElement = document.getElementById('hero-product-selection-modal-empty');

  loadingElement.style.display = 'block';
  gridElement.innerHTML = '';
  emptyElement.style.display = 'none';
  teardownHeroStorefrontLazyEnrich();
  heroColorIndexByProductKey = new Map();
  storefrontProductJsonCache = new Map();

  try {
    if (!silent) {
      await refreshHeroRegionAvailability();
    }
    // Get owner ID from customer or global variable
    const ownerId = window.__EAZ_OWNER_ID || (window.customer && window.customer.id) || null;

    console.log('🔍 Loading products for owner ID:', ownerId, 'creator name:', creatorName);

    // Load hero-used product IDs (which products already have hero images)
    if (ownerId) {
      await loadHeroUsedProducts(ownerId);
    } else {
      heroUsedProductIds = new Set();
    }

    // Region product catalog (single source for market availability)
    heroRegionFilteredKeys = null;
    try {
      const catalog = await window.creatorApiFetch('get-catalog-products', { region: currentHeroRegion });
      if (catalog && catalog.ok) {
        const allCatalogItems = []
          .concat(Array.isArray(catalog.products) ? catalog.products : [])
          .concat(Array.isArray(catalog.preview_products) ? catalog.preview_products : []);
        const keys = allCatalogItems
          .map(function (item) { return String(item && item.product_key || '').trim(); })
          .filter(Boolean);
        if (keys.length) {
          heroRegionFilteredKeys = new Set(keys);
        }
      }
    } catch (catalogErr) {
      console.warn('[HeroModal] Could not load region catalog, fallback to unfiltered set:', catalogErr?.message || catalogErr);
    }

    // Use creatorApiFetch to load real products
    const params = {};
    if (ownerId) params.owner_id = ownerId;
    if (creatorName) params.creator_name = creatorName;

    const apiData = await window.creatorApiFetch('get-shopify-products', params);

    if (!apiData.ok) {
      throw new Error(apiData.error || 'API-Fehler beim Laden der Produkte');
    }

    function mapShopifyProducts(products) {
      return (products || []).map(function(product) {
        const id = product.id;
        return {
          id,
          shopify_product_id: extractNumericProductId(product.id),
          product_key: product.product_key || null,
          title: product.title,
          product_type: product.product_type || 'Produkt',
          images: product.image ? [{ src: product.image }] : [],
          tags: product.tags || [],
          handle: product.handle,
          price: product.price,
          currency: product.currency,
          created_at: product.created_at || null,
          variantId: product.variantId != null ? String(product.variantId) : null,
          variants: Array.isArray(product.variants) ? product.variants : [],
          region: currentHeroRegion,
          used: false
        };
      }).map(function(product) {
        product.used = isHeroProductUsed(product);
        return product;
      });
    }

    /** Published rows from D1/API have no variant list until storefront JSON enrichment. */
    function mapPublishedProducts(products) {
      return (products || []).map(function(product) {
        const id = product.shopify_product_id || product.product_key || product.id;
        var image = product.featured_image || null;
        return {
          id: String(id || ''),
          shopify_product_id: extractNumericProductId(product.shopify_product_id || id),
          product_key: product.product_key || null,
          title: product.product_name || product.title || product.product_key || 'Produkt',
          product_type: product.product_type || 'Produkt',
          images: image ? [{ src: image }] : [],
          tags: [],
          handle: product.shopify_handle || product.handle || null,
          storefront_url: product.storefront_url || null,
          price: product.price || null,
          currency: product.currency || null,
          last_published_at: product.last_published_at != null ? product.last_published_at : null,
          variants: [],
          region: currentHeroRegion,
          used: false
        };
      }).map(function(product) {
        product.used = isHeroProductUsed(product);
        return product;
      });
    }

    heroProducts = sortHeroProductsNewestFirst(mapShopifyProducts(apiData.products));

    if (currentHeroRegion === 'PRINTIFY_CHOICE') {
      heroProducts = heroProducts.filter(function (product) {
        return !!(product && product.printify_choice === true);
      });
    } else if (heroRegionFilteredKeys && heroRegionFilteredKeys.size) {
      heroProducts = heroProducts.filter(function (product) {
        return product && product.product_key && heroRegionFilteredKeys.has(String(product.product_key));
      });
    }

    // If Shopify admin/storefront source is unavailable or empty,
    // use published products so the user still sees all own products.
    if (heroProducts.length === 0 && ownerId) {
      const published = await window.creatorApiFetch('get-published-products', { owner_id: ownerId });
      if (published && published.ok && Array.isArray(published.products)) {
        heroProducts = sortHeroProductsNewestFirst(mapPublishedProducts(published.products));
        await enrichPublishedHeroProductsFromStorefront(heroProducts);
        if (currentHeroRegion === 'PRINTIFY_CHOICE') {
          heroProducts = heroProducts.filter(function (product) {
            return !!(product && product.printify_choice === true);
          });
        } else if (heroRegionFilteredKeys && heroRegionFilteredKeys.size) {
          heroProducts = heroProducts.filter(function (product) {
            return product && product.product_key && heroRegionFilteredKeys.has(String(product.product_key));
          });
        }
        console.log('↩️ Hero modal fallback: using published products:', heroProducts.length);
      }
    }

    heroProducts = sortHeroProductsNewestFirst(heroProducts);

    if (loadGen !== heroProductsLoadGen) return;

    console.log('✅ Loaded real products:', heroProducts.length);
    filterHeroProducts();

  } catch (error) {
    if (loadGen !== heroProductsLoadGen) return;

    if (isHeroProductLoadTimeoutError(error) && retryCount < 1) {
      console.warn('[HeroModal] Product load timed out, retrying once…', error.message);
      return loadHeroProducts(creatorName, retryCount + 1, options);
    }

    console.error('❌ Error loading products:', error);
    console.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    if (silent || !isHeroProductModalOpen()) {
      console.warn('[HeroModal] Product load failed without open modal — no user alert');
      return;
    }

    var displayMessage = isHeroProductLoadTimeoutError(error)
      ? 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.'
      : error.message;

    // Show error in UI
    loadingElement.style.display = 'none';
    emptyElement.style.display = 'block';
    emptyElement.innerHTML = `
      <div style="text-align: center;">
        <p style="margin-bottom: 12px;">Fehler beim Laden der Produkte</p>
        <p style="font-size: 14px; color: #9ca3af; margin-bottom: 16px;">${escapeHtmlText(displayMessage)}</p>
        <button onclick="retryLoadHeroProducts()" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">
          Erneut versuchen
        </button>
      </div>
    `;

    showHeroProductError('Fehler beim Laden der Produkte: ' + displayMessage);
  }
}

// Neue Funktion: Sofort modal öffnen mit echten Daten (ersetzt Simple-Version)
function openHeroProductSelectionModalSimple(category, callback, creatorName, options) {
  console.log('🎯 Opening product selection modal (live data) for category:', category);

  const modal = document.getElementById('hero-product-selection-modal');
  if (!modal) {
    console.error('[HeroModal] Modal element not found in DOM');
    return;
  }

  // ✅ Fix: Modal IMMER direkt in <body> sicherstellen (idempotent)
  if (modal.parentElement !== document.body) {
    console.log('[HeroModal] Moving modal to <body> (was child of:', modal.parentElement?.tagName, modal.parentElement?.id, ')');
    document.body.appendChild(modal);
  }

  currentHeroProductCategory = normalizeHeroModalCategory(category);
  selectedHeroProduct = null;
  updateHeroProductSelectionButtons();
  setHeroRegionFromContext(options);

  // Update modal title with active category
  const titleElement = document.getElementById('hero-product-selection-modal-title');
  if (titleElement) {
    var catLabel = currentHeroProductCategory === 'top'
      ? 'Top'
      : (currentHeroProductCategory === 'additional' ? 'Additional' : 'Produkte');
    titleElement.textContent = `Produkt auswählen - ${catLabel}`;
  }

  // Reset search
  const searchInput = document.getElementById('hero-product-selection-modal-search');
  if (searchInput) searchInput.value = '';

  // Sicherstellen, dass die Basis-Klasse vorhanden ist
  if (!modal.classList.contains('creator-modal')) {
    modal.classList.add('creator-modal');
  }

  // Force reflow
  void modal.offsetHeight;

  // Show modal
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('creator-modal--open');

  // INLINE-STYLES: Sichtbarkeit GARANTIEREN
  modal.style.cssText = 'opacity:1; pointer-events:auto; display:flex; position:fixed; inset:0; z-index:2147483647; align-items:center; justify-content:center; background:rgba(2,6,23,0.92); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);';

  if (window.__HERO_MODAL_DEBUG) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!modal) return;
        var cs = window.getComputedStyle(modal);
        console.log('[HeroModal] OPEN CHECK', {
          inBody: document.body.contains(modal),
          parentTag: modal.parentElement ? modal.parentElement.tagName : null,
          hasOpenClass: modal.classList.contains('creator-modal--open'),
          ariaHidden: modal.getAttribute('aria-hidden'),
          opacity: cs.opacity,
          display: cs.display,
          visibility: cs.visibility,
          pointerEvents: cs.pointerEvents,
          zIndex: cs.zIndex,
          rect: modal.getBoundingClientRect(),
        });
      });
    });
  }

  // Lock body scroll like other creator modals
  const win = /** @type {any} */ (window);
  const physics = win.CreatorModalPhysics;
  if (physics && typeof physics.lockBodyScroll === 'function') {
    physics.lockBodyScroll();
  }
  if (physics && typeof physics.initModalScrollLock === 'function') {
    physics.initModalScrollLock(modal);
  }

  // Add callback to modal for when product is selected
  modal._callback = callback;

  // Load real products (nicht mock data) with creator name - always all products
  setTimeout(() => {
    loadHeroProducts(creatorName).catch(error => {
      console.error('❌ Failed to load products on modal open:', error);
    });
  }, 100);
}

// Fallback-Funktion: Mock data laden (nur für Entwicklung/Testing)
function loadHeroProductsMock() {
  console.log('🧪 Loading mock products for testing...');

  const loadingElement = document.getElementById('hero-product-selection-modal-loading');
  const gridElement = document.getElementById('hero-product-selection-modal-grid');
  const emptyElement = document.getElementById('hero-product-selection-modal-empty');

  loadingElement.style.display = 'none';
  gridElement.innerHTML = '';
  emptyElement.style.display = 'none';

  // Mock data für Testing
  heroProducts = [
    {
      id: 'mock-1',
      title: 'Classic T-Shirt',
      product_type: 'T-Shirt',
      images: [{ src: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=300&h=300&fit=crop&crop=center' }],
      tags: ['clothing', 't-shirt']
    },
    {
      id: 'mock-2',
      title: 'Premium Hoodie',
      product_type: 'Hoodie',
      images: [{ src: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=300&h=300&fit=crop&crop=center' }],
      tags: ['clothing', 'hoodie']
    },
    {
      id: 'mock-3',
      title: 'Ceramic Mug',
      product_type: 'Mug',
      images: [{ src: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=300&fit=crop&crop=center' }],
      tags: ['drinkware', 'mug']
    },
    {
      id: 'mock-4',
      title: 'Canvas Tote Bag',
      product_type: 'Tote Bag',
      images: [{ src: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=300&fit=crop&crop=center' }],
      tags: ['accessories', 'bag']
    }
  ];

    console.log('✅ Loaded mock products:', heroProducts.length);
    filterHeroProducts();
}

async function loadHeroUsedProducts(ownerId) {
  try {
    const usageOp = (typeof window !== 'undefined' && window.__heroModalUsedProductsContext === 'video')
      ? 'video-used-products'
      : 'hero-used-products';
    const res = await fetch(`/apps/creator-dispatch?op=${usageOp}&owner_id=${encodeURIComponent(ownerId)}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      console.warn('[HeroModal] hero-used-products request failed:', res.status);
      heroUsedProductIds = new Set();
      return;
    }
    const data = await res.json().catch(() => null);
    if (data && data.ok && Array.isArray(data.used_product_ids)) {
      heroUsedProductIds = new Set(data.used_product_ids.map(String));
      console.log('[HeroModal] Loaded used hero product IDs:', heroUsedProductIds.size);
    } else {
      heroUsedProductIds = new Set();
    }
  } catch (e) {
    console.warn('[HeroModal] hero-used-products error:', e);
    heroUsedProductIds = new Set();
  }
}

function getCurrentFilteredProducts() {
  // Apply region + category filter first (unless "all"), then search filter
  let filteredProducts = heroProducts.filter(product => {
    if (
      currentHeroRegion !== 'PRINTIFY_CHOICE' &&
      product &&
      product.region &&
      normalizeHeroRegionCode(product.region) !== currentHeroRegion
    ) return false;
    if (currentHeroProductCategory === 'all') return true;
    return categorizeHeroProduct(product) === currentHeroProductCategory;
  });

  // Apply usage filter: used / unused
  if (currentHeroUsageFilter === 'used') {
    filteredProducts = filteredProducts.filter(product => product.used);
  } else if (currentHeroUsageFilter === 'unused') {
    filteredProducts = filteredProducts.filter(product => !product.used);
  }

  // Apply search filter
  const searchTerm = document.getElementById('hero-product-selection-modal-search').value.toLowerCase();
  if (searchTerm.trim()) {
    filteredProducts = filteredProducts.filter(product => {
      const title = (product.title || '').toLowerCase();
      const type = (product.product_type || '').toLowerCase();
      const tags = (product.tags || []).join(' ').toLowerCase();

      return title.includes(searchTerm) ||
             type.includes(searchTerm) ||
             tags.includes(searchTerm);
    });
  }

  return filteredProducts;
}

function filterHeroProducts() {
  const filteredProducts = getCurrentFilteredProducts();
  if (window.__HERO_MODAL_DEBUG) {
    const q = document.getElementById('hero-product-selection-modal-search');
    console.log(
      '🎯 Hero modal grid:',
      filteredProducts.length,
      currentHeroProductCategory,
      q && q.value ? 'search' : 'no search'
    );
  }
  renderHeroProducts(filteredProducts);
  updateProductSelectionUI(); // Update selection states after re-rendering
  updateHeroProductSelectionButtons();
}

function categorizeHeroProduct(product) {
  const title = (product.title || '').toLowerCase();
  const type = (product.product_type || '').toLowerCase();
  const tags = (product.tags || []).join(' ').toLowerCase();
  const pkSlug = String(product.product_key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const hay = (title + ' ' + type + ' ' + tags + ' ' + pkSlug).replace(/\s+/g, ' ').trim();

  /** Shopify often uses generic types; treat as non-top “additional” unless title/tags look like real garments. */
  const onlyType = type.trim();
  if (/^(apparel|clothing|fashion|general|misc|miscellaneous|unisex|other|gift|all|produkt|product)$/i.test(onlyType)) {
    if (!/\b(hoodie|t-?shirt|shirt|tee|tank|polo|blouse|sweater|pullover|cardigan|jacke|jacket|coat|mantel|parka|dress|skirt|pants|jean|short|legging|sock|shoe|sneaker|boot|beanie|hat|belt|scarf|oberteil|hemd|bluse)\b/i.test(hay)) {
      return 'additional';
    }
  }

  const nonGarmentTypeHints = [
    'drinkware',
    'mug',
    'tumbler',
    'poster',
    'wall art',
    'home decor',
    'home décor',
    'home & living',
    'kitchen',
    'bedding',
    'bath ',
    'stationery',
    'sticker',
    'calendar',
    'notebook',
    'tapestry',
    'coaster',
    'keychain',
    'lanyard',
    'ornament',
    'thermos',
    'phone case',
    'accessories',
    'gift',
    'wall hanging',
    'canvas',
    'framed',
    'acrylic block',
    'metal print',
    'wood print',
    'beach towel',
    'tea towel',
    'kitchen towel',
    'placemat',
    'table runner',
    'rug',
    'doormat',
    'mouse mat',
    'desk mat',
    'apron',
    'bandana',
    'flag',
    'banner',
    'magnet',
    'puzzle',
    'pillow',
    'duffel',
    'duffle',
    'cooler bag',
    'lunch bag',
    'gym bag',
    'travel bag',
    'makeup bag',
    'cosmetic bag',
    'fanny pack',
    'bum bag',
    'waist bag',
    'crossbody',
    'messenger bag',
    'shoulder bag',
    'handbag',
    'drawstring',
    'string bag',
    'jute bag',
    'paper bag',
    'wine bag',
    'bottle bag',
  ];
  for (let t = 0; t < nonGarmentTypeHints.length; t += 1) {
    const hint = nonGarmentTypeHints[t];
    if (type.includes(hint)) return 'additional';
  }

  const nonGarmentHints = [
    'mug', 'tasse', 'becher', 'drinkware', 'coffee cup', 'kaffeebecher', 'water bottle', 'flasche',
    'travel mug', 'insulated cup', 'can cooler', 'koozie', 'wine glass', 'stein',
    'poster', 'fotopapier', 'photo paper', 'photo print', 'fine art print', 'wall art',
    'leinwand', 'canvas print', 'rolled canvas', 'framed print', 'prints on paper',
    'foto-poster', 'photo poster', 'fotoleinwand', 'kunstdruck', 'druck auf',
    'pillow', 'kissen', 'blanket', 'decke', 'bath towel', 'untersetzer', 'coaster',
    'phone case', 'handyhülle', 'laptop case', 'tablet case', 'mouse pad', 'mousepad',
    'notebook', 'notizbuch', 'calendar', 'kalender',
    'tote bag', 'tragetasche', 'shopping bag', 'duffel bag', 'weekender', 'sporttasche',
    'umhängetasche', 'rucksack', 'turnbeutel', 'beutel', 'stoffbeutel', 'kosmetiktasche',
    'handtasche', 'clutch', 'shopper', 'reisetasche', 'kühltasche', 'lunchbox',
    'sticker sheet', 'aufkleber-set', 'vinyl sticker', 'enamel pin', 'kühlschrankmagnet',
    'schürze', ' apron', 'tapestry', 'wandteppich', 'platzdeckchen', 'tischläufer',
    'wanduhr', 'ornament', 'schlüsselanhänger', ' lanyard ', 'fleece decken',
    'badematte', 'fußmatte', 'fußmat', 'teppich', 'puzzle ', ' jigsaw',
  ];
  for (let i = 0; i < nonGarmentHints.length; i += 1) {
    if (hay.includes(nonGarmentHints[i])) return 'additional';
  }

  function wordRe(w) {
    try {
      return new RegExp('\\b' + String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    } catch (_e) {
      return null;
    }
  }

  const nonGarmentWords = [
    'bag',
    'tote',
    'rucksack',
    'beutel',
    'tasche',
    'koffer',
    'thermos',
    'koozie',
    'apron',
    'tapestry',
    'placemat',
    'ornament',
    'flag',
    'banner',
    'magnet',
    'puzzle',
    'rug',
    'doormat',
  ];
  for (let w = 0; w < nonGarmentWords.length; w += 1) {
    const reNg = wordRe(nonGarmentWords[w]);
    if (reNg && reNg.test(hay)) return 'additional';
  }

  const topPhrases = [
    'crop top', 'tank top', 'tube top', 'tank-top',
    't-shirt', 'tshirt', 'tee-shirt', 'tee shirt', 'polo shirt',
    'hoodie', 'hoody', 'sweatshirt', 'crewneck', 'crew neck',
    'longsleeve', 'long sleeve', 'short sleeve', 'kurzarm', 'langarm',
    'pullover', 'cardigan', 'sweater', 'strickjacke', 'strickpullover',
    'oberteil', 'blouse', 'bluse', 'hemd',
    'varsity jacket', 'bomber jacket', 'windbreaker', 'softshell jacket',
    'zip hoodie', 'zip-hoodie', 'fleece jacket', 'track jacket',
    'sport-bh', 'sports bra', 'bralette',
    'weste', 'gilet', 'bodywarmer',
    'anorak', 'parka', 'jacke', 'jacket', 'mantel',
  ];
  for (let j = 0; j < topPhrases.length; j += 1) {
    if (hay.includes(topPhrases[j])) return 'top';
  }

  const topWords = [
    'hoodie', 'sweatshirt', 't-shirt', 'tshirt', 'polo', 'blouse', 'cardigan', 'sweater',
    'longsleeve', 'pullover', 'oberteil', 'jacke', 'jacket', 'coat', 'mantel', 'parka', 'anorak',
    'shirt', 'tee', 'tank', 'vest', 'weste', 'gilet', 'crewneck',
  ];
  for (let k = 0; k < topWords.length; k += 1) {
    const re = wordRe(topWords[k]);
    if (re && re.test(hay)) return 'top';
  }

  /** Do not use generic “apparel/clothing/fashion” — Shopify mislabels mugs/posters as Apparel. */
  const clothingKeywords = [
    'pants',
    'jeans',
    'trousers',
    'shorts',
    'leggings',
    'skirt',
    'dress',
    'shoe',
    'sneaker',
    'sock',
    'boot',
    'footwear',
    'cap',
    'hat',
    'beanie',
    'belt',
    'scarf',
    'tie',
    'underwear',
    'boxer',
    'brief',
    'lingerie',
    'bodysuit',
    'jumpsuit',
    'romper',
    'overall',
    'dungaree',
  ];
  for (let m = 0; m < clothingKeywords.length; m += 1) {
    const re2 = wordRe(clothingKeywords[m]);
    if (re2 && re2.test(hay)) return 'clothing-other';
    if (hay.includes(clothingKeywords[m])) return 'clothing-other';
  }

  return 'additional';
}

function idsMatchHeroSelected(productIdAttr) {
  if (!selectedHeroProduct) return false;
  const p = normHeroPid(productIdAttr);
  return (
    normHeroPid(selectedHeroProduct.id) === p ||
    normHeroPid(selectedHeroProduct.product_id) === p ||
    normHeroPid(selectedHeroProduct.shopify_id) === p ||
    normHeroPid(selectedHeroProduct.shopify_product_id) === p
  );
}

function renderHeroProducts(products) {
  const loadingElement = document.getElementById('hero-product-selection-modal-loading');
  const gridElement = document.getElementById('hero-product-selection-modal-grid');
  const emptyElement = document.getElementById('hero-product-selection-modal-empty');

  // Hide loading indicator
  loadingElement.style.display = 'none';

  if (products.length === 0) {
    gridElement.innerHTML = '';
    emptyElement.style.display = 'block';
    emptyElement.textContent = 'Keine Produkte gefunden.';
    return;
  }

  emptyElement.style.display = 'none';

  const productsHtml = products
    .map(function (product) {
      const productIdAttr = normHeroPid(product.id || product.product_id || product.shopify_id);
      const isSelected = idsMatchHeroSelected(productIdAttr);
      const imageHtml = buildHeroProductItemImageBlockHtml(product);
      return (
        '<div class="hero-product-selection-modal__product-item' +
        (isSelected ? ' hero-product-selection-modal__product-item--selected' : '') +
        '" data-product-id="' +
        escapeHtmlAttr(productIdAttr) +
        '" data-hero-select-product role="button" tabindex="0">' +
        imageHtml +
        '</div>'
      );
    })
    .join('');

  gridElement.innerHTML = productsHtml;
  bindHeroProductGridDelegationOnce();
  if (window.CreatorProductImageCarousel && typeof window.CreatorProductImageCarousel.bindCarouselRoot === 'function') {
    gridElement.querySelectorAll('[data-creator-carousel-root]').forEach(function (root) {
      window.CreatorProductImageCarousel.bindCarouselRoot(root);
    });
  }
  initHeroStorefrontLazyEnrichFromGrid();
}

function selectHeroProduct(productId, ev) {
  if (ev && ev.target && ev.target.closest && ev.target.closest('[data-creator-carousel-prev], [data-creator-carousel-next]')) {
    return;
  }
  const pid = normHeroPid(productId);
  console.log('🎯 Selecting product with ID:', pid);

  const product = findHeroProductInList(pid);
  if (!product) {
    console.error('❌ Product not found:', pid);
    return;
  }

  console.log('✅ Selected product:', product.title || product.name);

  applyHeroColorSelectionToProduct(product);
  selectedHeroProduct = product;

  updateProductSelectionUI();
  updateHeroProductSelectionButtons();
}

function updateProductSelectionUI() {
  const productItems = document.querySelectorAll('.hero-product-selection-modal__product-item');
  productItems.forEach(function (item) {
    const productId = normHeroPid(item.getAttribute('data-product-id'));
    const isSelected = idsMatchHeroSelected(productId);
    item.classList.toggle('hero-product-selection-modal__product-item--selected', !!isSelected);
  });
}

function updateHeroProductSelectionButtons() {
  const confirmBtn = document.getElementById('hero-product-selection-modal-confirm');
  if (!confirmBtn) return;
  confirmBtn.disabled = !selectedHeroProduct;
}

function setHeroProductUsageFilter(mode) {
  const next = mode === 'used' ? 'used' : 'unused';
  if (currentHeroUsageFilter === next) return;
  currentHeroUsageFilter = next;

  const unusedBtn = document.getElementById('hero-product-usage-tab-unused');
  const usedBtn = document.getElementById('hero-product-usage-tab-used');

  if (unusedBtn && usedBtn) {
    if (next === 'unused') {
      unusedBtn.classList.add('hero-product-selection-modal__usage-tab--active');
      usedBtn.classList.remove('hero-product-selection-modal__usage-tab--active');
    } else {
      usedBtn.classList.add('hero-product-selection-modal__usage-tab--active');
      unusedBtn.classList.remove('hero-product-selection-modal__usage-tab--active');
    }
  }

  filterHeroProducts();
}

function setHeroProductRegionFilter(regionCode) {
  var next = normalizeHeroRegionCode(regionCode);
  if (heroRegionAvailability[next] === false) {
    showHeroModalNotice('Keine Produkte in der Region verfugbar.', 'warning');
    syncHeroRegionTabs();
    return;
  }
  if (lockedHeroRegion && next !== lockedHeroRegion) {
    showHeroModalNotice('Bereits ein Produkt aus Region ' + lockedHeroRegion + ' ausgewahlt.', 'warning');
    syncHeroRegionTabs();
    return;
  }
  if (currentHeroRegion === next) return;
  currentHeroRegion = next;
  syncHeroRegionTabs();
  const creatorName = window.CreatorSettings?.creatorName || null;
  loadHeroProducts(creatorName).catch(function (error) {
    console.error('❌ Failed to reload region products:', error);
  });
}

function showHeroModalNotice(message, tone) {
  var existing = document.getElementById('hero-modal-floating-notice');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  var el = document.createElement('div');
  el.id = 'hero-modal-floating-notice';
  el.textContent = String(message || '');
  var isWarn = tone === 'warning';
  el.style.cssText = [
    'position:fixed',
    'left:50%',
    'top:50%',
    'transform:translate(-50%,-50%) scale(0.96)',
    'z-index:2147483647',
    'min-width:240px',
    'max-width:min(86vw,520px)',
    'padding:12px 16px',
    'border-radius:12px',
    'text-align:center',
    'font-size:14px',
    'font-weight:600',
    'color:#fff',
    'background:' + (isWarn ? 'rgba(185, 28, 28, 0.92)' : 'rgba(15, 23, 42, 0.92)'),
    'border:1px solid rgba(255,255,255,0.2)',
    'box-shadow:0 14px 40px rgba(0,0,0,0.45)',
    'opacity:0',
    'transition:all .2s ease'
  ].join(';');
  document.body.appendChild(el);
  requestAnimationFrame(function () {
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%,-50%) scale(1)';
  });
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%,-50%) scale(0.98)';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
  }, 1900);
}

function heroThemeKeyForAutoPick(p) {
  const t = String((p && p.product_type) || '')
    .trim()
    .toLowerCase();
  if (t && !/^(apparel|clothing|fashion|general|misc|miscellaneous|unisex|other|gift|all|produkt|product)$/i.test(t)) {
    return 'ptype:' + t;
  }
  const tags = Array.isArray(p && p.tags) ? p.tags : [];
  for (let i = 0; i < tags.length; i += 1) {
    const g = String(tags[i] || '')
      .trim()
      .toLowerCase();
    if (g.length > 2) return 'tag:' + g;
  }
  return 'ptype:general';
}

function pickThematicTopAndAdditionPair(pool) {
  const byGroup = new Map();
  for (let i = 0; i < pool.length; i += 1) {
    const p = pool[i];
    const k = heroThemeKeyForAutoPick(p);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(p);
  }
  const keys = Array.from(byGroup.keys());
  for (let j = 0; j < keys.length; j += 1) {
    const arr = byGroup.get(keys[j]);
    if (!arr || arr.length < 2) continue;
    const tops = arr.filter(function (p) {
      return heroPairBucket(p) === 'top';
    });
    const adds = arr.filter(function (p) {
      return heroPairBucket(p) === 'additional';
    });
    if (tops.length && adds.length) {
      return {
        top: tops[Math.floor(Math.random() * tops.length)],
        addition: adds[Math.floor(Math.random() * adds.length)],
        theme: keys[j].replace(/^ptype:/, '').replace(/^tag:/, ''),
      };
    }
  }
  const allTops = pool.filter(function (p) {
    return heroPairBucket(p) === 'top';
  });
  const allAdds = pool.filter(function (p) {
    return heroPairBucket(p) === 'additional';
  });
  const topPick = allTops.length ? allTops[Math.floor(Math.random() * allTops.length)] : pool[Math.floor(Math.random() * pool.length)];
  const tk = heroThemeKeyForAutoPick(topPick);
  const addMatch = allAdds.filter(function (p) {
    return (
      normHeroPid(p.id || p.product_id) !== normHeroPid(topPick.id || topPick.product_id) &&
      heroThemeKeyForAutoPick(p) === tk
    );
  });
  let addPick;
  if (addMatch.length) {
    addPick = addMatch[Math.floor(Math.random() * addMatch.length)];
  } else {
    const addPool = allAdds.length ? allAdds : pool;
    const filtered = addPool.filter(function (p) {
      return normHeroPid(p.id || p.product_id) !== normHeroPid(topPick.id || topPick.product_id);
    });
    addPick =
      filtered.length > 0
        ? filtered[Math.floor(Math.random() * filtered.length)]
        : pool.find(function (p) {
            return normHeroPid(p.id || p.product_id) !== normHeroPid(topPick.id || topPick.product_id);
          });
  }
  if (!addPick) {
    const rest = pool.filter(function (p) {
      return normHeroPid(p.id || p.product_id) !== normHeroPid(topPick.id || topPick.product_id);
    });
    addPick = rest.length ? rest[Math.floor(Math.random() * rest.length)] : null;
  }
  return { top: topPick, addition: addPick, theme: tk.replace(/^ptype:/, '').replace(/^tag:/, '') };
}

function cloneProductWithRandomVariantForHero(p) {
  let o;
  try {
    o = JSON.parse(JSON.stringify(p));
  } catch (_e) {
    o = Object.assign({}, p);
  }
  delete o._heroColorSlices;
  /** Stale URL from a prior modal confirm on the shared catalog row (blob/revoked or wrong variant) breaks hero preview tiles. */
  try {
    delete o.hero_generation_image_url;
  } catch (_del) {}
  const pid = normHeroPid(o.id || o.product_id);
  const slices = getHeroColorSlices(o);
  if (slices.length > 1) {
    heroColorIndexByProductKey.set(pid, Math.floor(Math.random() * slices.length));
  } else {
    heroColorIndexByProductKey.delete(pid);
  }
  applyHeroColorSelectionToProduct(o);
  return o;
}

/**
 * Hero marketing page: pre-fill Top + Addition with unused products (thematically matched when possible)
 * and set prompt. Safe to call multiple times; skips if both slots already filled.
 */
/** Shopify `| t` in theme JS sometimes HTML-escapes quotes → &quot; in textarea. */
function decodeHeroAutoPickTranslationTemplate(s) {
  if (!s || typeof s !== 'string') return '';
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

window.runHeroMarketingAutoPick = async function runHeroMarketingAutoPick() {
  try {
    if (window.__heroMarketingAutoPickDone) return;
    if (window.__heroMarketingAutoPickRunning) return;

    var workspaceActive =
      typeof window.eazIsHeroImagesWorkspaceActive === 'function'
        ? window.eazIsHeroImagesWorkspaceActive()
        : typeof window.ContentCreationHero !== 'undefined' &&
            typeof window.ContentCreationHero.isHeroImagesWorkspaceActive === 'function'
          ? window.ContentCreationHero.isHeroImagesWorkspaceActive()
          : false;
    if (!workspaceActive) {
      return;
    }

    const owner =
      window.__EAZ_OWNER_ID != null && window.__EAZ_OWNER_ID !== ''
        ? String(window.__EAZ_OWNER_ID)
        : window.logged_in_customer_id != null
          ? String(window.logged_in_customer_id)
          : null;
    if (!owner) return;

    const sh0 = window.selectedHeroProducts;
    if (sh0 && sh0.top && sh0.addition) {
      const tTop = String((sh0.top.title || sh0.top.product_name || sh0.top.name || '')).trim();
      const tAdd = String((sh0.addition.title || sh0.addition.product_name || sh0.addition.name || '')).trim();
      if (tTop && tAdd) {
        try {
          window.__heroMarketingAutoPickDone = true;
        } catch (_d0) {}
        return;
      }
    }

    if (typeof window.creatorApiFetch !== 'function') return;

    window.__heroMarketingAutoPickRunning = true;

    /**
     * Marketing hero: always pick from EU catalog availability (same as get-catalog-products filter),
     * independent of storefront locale, so Top + Addition stay region-consistent.
     */
    lockedHeroRegion = null;
    currentHeroRegion = 'EU';
    try {
      window.selectedHeroRegion = 'EU';
    } catch (_e) {}

    const creatorName = window.CreatorSettings && window.CreatorSettings.creatorName ? window.CreatorSettings.creatorName : null;
    await loadHeroProducts(creatorName, 0, { silent: true });

    let pool = heroProducts.filter(function (p) {
      return p && !isHeroProductUsed(p);
    });
    if (pool.length < 2) {
      pool = heroProducts.filter(Boolean);
    }
    if (pool.length < 2) return;

    const poolPrefer = pool.filter(heroMarketingPoolRowLikelyResolvable);
    if (poolPrefer.length >= 2) {
      pool = poolPrefer;
    }

    const pair = pickThematicTopAndAdditionPair(pool);
    if (!pair || !pair.top || !pair.addition) return;
    if (normHeroPid(pair.top.id || pair.top.product_id) === normHeroPid(pair.addition.id || pair.addition.product_id)) {
      return;
    }

    const topReady = cloneProductWithRandomVariantForHero(pair.top);
    const addReady = cloneProductWithRandomVariantForHero(pair.addition);

    await ensureHeroMarketingPickHasPreviewImages(topReady);
    await ensureHeroMarketingPickHasPreviewImages(addReady);

    window.selectedHeroProducts = window.selectedHeroProducts || { top: null, addition: null };
    window.selectedHeroProducts.top = topReady;
    window.selectedHeroProducts.addition = addReady;

    const tpl = decodeHeroAutoPickTranslationTemplate(
      (window.CreatorI18n && window.CreatorI18n.heroAutoPickPrompt) ||
        'Editorial %theme% hero: weave %top% and %addition% into one striking portrait—layered natural light, premium campaign polish, photoreal detail, vertical framing.'
    );
    const topTitle = String((pair.top && pair.top.title) || '').replace(/["<>]/g, ' ').trim();
    const addTitle = String((pair.addition && pair.addition.title) || '').replace(/["<>]/g, ' ').trim();
    const themeWord = String(pair.theme || 'lifestyle').replace(/["<>]/g, ' ').trim();
    const autoPrompt = tpl
      .split('%top%')
      .join(topTitle)
      .split('%addition%')
      .join(addTitle)
      .split('%theme%')
      .join(themeWord);

    if (typeof window.setHeroProductPreview === 'function') {
      window.setHeroProductPreview('top', topReady);
      window.setHeroProductPreview('addition', addReady);
    }

    try {
      window.__heroMarketingAutoPrompt = autoPrompt;
    } catch (_pm) {}

    const promptEl =
      document.querySelector('[data-creator-hero-prompt]') ||
      document.getElementById('hero-additional-prompt') ||
      document.querySelector('.hero-prompt-input');
    if (promptEl && !String(promptEl.value || '').trim()) {
      promptEl.value = autoPrompt;
    }

    try {
      if (window.ContentCreationHero && typeof window.ContentCreationHero.scanHosts === 'function') {
        window.ContentCreationHero.scanHosts();
      }
    } catch (_scan) {}

    try {
      if (window.ContentCreationHero && typeof window.ContentCreationHero.syncProductUiFromSelection === 'function') {
        window.ContentCreationHero.syncProductUiFromSelection(autoPrompt);
      }
    } catch (_sync) {}

    try {
      window.dispatchEvent(
        new CustomEvent('heroAutoPickProducts', {
          detail: { top: topReady, addition: addReady, prompt: autoPrompt },
        })
      );
    } catch (_e2) {}

    if (topReady && topReady.region) {
      window.selectedHeroRegion = normalizeHeroRegionCode(topReady.region);
    }

    document.dispatchEvent(new CustomEvent('categorySelectionChanged'));
    try {
      window.dispatchEvent(new CustomEvent('heroLocalUploadPreviewChanged'));
    } catch (_e) {}

    try {
      window.__heroMarketingAutoPickDone = true;
    } catch (_d1) {}
  } catch (e) {
    console.warn('[HeroMarketingAutoPick]', e);
  } finally {
    try {
      window.__heroMarketingAutoPickRunning = false;
    } catch (_f) {}
  }
};

/**
 * Waits until `hero-product-selection-modal-functions.js` has registered `runHeroMarketingAutoPick`
 * (script order on creator-dashboard / marketing tab).
 */
window.scheduleHeroMarketingAutoPick = function scheduleHeroMarketingAutoPick(opts) {
  var maxWait = (opts && opts.maxWaitMs) || 25000;
  var t0 = Date.now();
  function tick() {
    if (typeof window.runHeroMarketingAutoPick === 'function') {
      window.runHeroMarketingAutoPick();
      return;
    }
    if (Date.now() - t0 > maxWait) return;
    setTimeout(tick, 60);
  }
  if (typeof window.requestAnimationFrame === 'function') {
    requestAnimationFrame(function () {
      tick();
    });
  } else {
    setTimeout(tick, 0);
  }
};

document.addEventListener('DOMContentLoaded', function () {
  const searchInput = document.getElementById('hero-product-selection-modal-search');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      filterHeroProducts();
    });
  }
  bindHeroProductGridDelegationOnce();
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('hero-product-selection-modal');
    if (modal && modal.getAttribute('aria-hidden') === 'false') {
      closeHeroProductSelectionModal();
    }
  }
});

document.addEventListener('click', function (e) {
  const modal = document.getElementById('hero-product-selection-modal');
  if (modal && e.target === modal) {
    closeHeroProductSelectionModal();
  }
});

function retryLoadHeroProducts() {
  console.log('🔄 Retrying to load hero products...');
  const creatorName = window.CreatorSettings?.creatorName || null;
  loadHeroProducts(creatorName);
}

function showHeroProductError(message) {
  if (!isHeroProductModalOpen()) {
    console.warn('[HeroModal]', message);
    return;
  }
  alert('Fehler: ' + message);
}

})(); // End of IIFE to prevent multiple declarations