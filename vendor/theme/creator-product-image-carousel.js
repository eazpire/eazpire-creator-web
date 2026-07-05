/**
 * Manual product image carousel (no auto-advance).
 * Hero product modal (`buildHtmlForModal`): swipe + arrows at all widths (`data-creator-carousel-hero-modal`).
 * Other hosts: touch swipe when viewport is under 840px, arrows from 840px up.
 */
(function () {
  'use strict';
  if (window.CreatorProductImageCarousel) return;

  function escapeHtmlAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeHtmlText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function collectImageUrls(product) {
    var urls = [];
    var seen = Object.create(null);
    function push(u) {
      if (!u || typeof u !== 'string') return;
      u = u.trim();
      if (!u || seen[u]) return;
      seen[u] = true;
      urls.push(u);
    }
    if (product && product.images && Array.isArray(product.images)) {
      product.images.forEach(function (im) {
        var u = im && (im.src || im.url || (typeof im === 'string' ? im : null));
        push(u);
      });
    }
    if (product && product.image) {
      var u = product.image.src || product.image.url || (typeof product.image === 'string' ? product.image : null);
      push(u);
    }
    return urls;
  }

  function ariaLabel(key) {
    var p = window.CreatorI18n && window.CreatorI18n.product_image_carousel;
    if (p && p[key]) return p[key];
    return key === 'prev' ? 'Previous image' : 'Next image';
  }

  /**
   * Visible slide in a modal/grid product card (matches what the user saw before confirm).
   * @param {HTMLElement} cardEl - e.g. `.hero-product-selection-modal__product-item`
   * @returns {string|null}
   */
  function getVisibleCarouselImageUrlFromCard(cardEl) {
    if (!cardEl || cardEl.nodeType !== 1) return null;
    var viewport = cardEl.querySelector('[data-creator-carousel-viewport]');
    if (viewport) {
      var imgs = viewport.querySelectorAll('img.creator-product-image-carousel__img, img.hero-product-selection-modal__product-image');
      for (var i = 0; i < imgs.length; i++) {
        try {
          if (window.getComputedStyle(imgs[i]).display !== 'none' && imgs[i].src) return imgs[i].src;
        } catch (_e) {}
      }
      if (imgs[0] && imgs[0].src) return imgs[0].src;
      return null;
    }
    var single = cardEl.querySelector('img.hero-product-selection-modal__product-image');
    if (single && single.src) return single.src;
    var any = cardEl.querySelector('img[src]');
    return any && any.src ? any.src : null;
  }

  function bindCarouselRoot(rootEl) {
    if (!rootEl || rootEl.nodeType !== 1) return;
    var viewport = rootEl.querySelector('[data-creator-carousel-viewport]');
    if (!viewport) return;
    var imgs = viewport.querySelectorAll('.creator-product-image-carousel__img');
    var urlsLen = imgs.length;
    if (urlsLen < 2) return;
    var idx = 0;
    var mq = window.matchMedia('(min-width: 840px)');
    var prev = rootEl.querySelector('[data-creator-carousel-prev]');
    var next = rootEl.querySelector('[data-creator-carousel-next]');
    var forceArrows = rootEl.getAttribute('data-creator-carousel-hero-modal') === '1';

    function show(i) {
      idx = (i + urlsLen) % urlsLen;
      for (var j = 0; j < imgs.length; j++) {
        imgs[j].style.display = j === idx ? 'block' : 'none';
      }
    }

    function syncButtons() {
      var showArrows = forceArrows || mq.matches;
      if (prev) prev.style.display = showArrows ? 'flex' : 'none';
      if (next) next.style.display = showArrows ? 'flex' : 'none';
    }
    syncButtons();
    if (mq.addEventListener) mq.addEventListener('change', syncButtons);
    else if (mq.addListener) mq.addListener(syncButtons);

    if (prev) prev.addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
    if (next) next.addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });

    var sx = 0;
    var sy = 0;
    viewport.addEventListener('touchstart', function (e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      sx = e.changedTouches[0].clientX;
      sy = e.changedTouches[0].clientY;
    }, { passive: true });
    viewport.addEventListener('touchend', function (e) {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      if (mq.matches && !forceArrows) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      e.preventDefault();
      show(dx > 0 ? idx - 1 : idx + 1);
    }, { passive: false });

    var ptrId = null;
    var px = 0;
    var py = 0;
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0) return;
      ptrId = e.pointerId;
      px = e.clientX;
      py = e.clientY;
      try {
        viewport.setPointerCapture(e.pointerId);
      } catch (_e) {}
    });
    viewport.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'touch') return;
      if (ptrId !== e.pointerId) {
        ptrId = null;
        return;
      }
      try {
        viewport.releasePointerCapture(e.pointerId);
      } catch (_e2) {}
      var dx = e.clientX - px;
      var dy = e.clientY - py;
      ptrId = null;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      show(dx > 0 ? idx - 1 : idx + 1);
    });
    viewport.addEventListener('pointercancel', function () {
      ptrId = null;
    });
  }

  function attach(hostEl, urls, opts) {
    opts = opts || {};
    if (!hostEl) return;
    if (!urls || !urls.length) {
      hostEl.innerHTML = '';
      return;
    }
    var attrName = opts.attrName || 'data-creator-preview-img';
    var attrVal = opts.attrValue != null ? String(opts.attrValue) : '';
    if (urls.length === 1) {
      hostEl.innerHTML =
        '<img ' + attrName + '="' + escapeHtmlAttr(attrVal) + '" class="creator-product-image-carousel__img" loading="eager" decoding="async" fetchpriority="high" src="' + escapeHtmlAttr(urls[0]) + '" alt="">';
      return;
    }
    var prevL = ariaLabel('prev');
    var nextL = ariaLabel('next');
    var imgsHtml = urls.map(function (u, i) {
      var eager = i === 0 ? ' loading="eager" decoding="async" fetchpriority="high"' : '';
      return '<img src="' + escapeHtmlAttr(u) + '" alt="" class="creator-product-image-carousel__img" data-index="' + i + '"' + eager + ' style="' + (i === 0 ? '' : 'display:none;') + '">';
    }).join('');
    hostEl.innerHTML =
      '<div class="creator-product-image-carousel" data-creator-carousel-root>' +
      '<button type="button" class="creator-product-image-carousel__btn creator-product-image-carousel__btn--prev" data-creator-carousel-prev aria-label="' + escapeHtmlAttr(prevL) + '">‹</button>' +
      '<div class="creator-product-image-carousel__viewport" data-creator-carousel-viewport>' + imgsHtml + '</div>' +
      '<button type="button" class="creator-product-image-carousel__btn creator-product-image-carousel__btn--next" data-creator-carousel-next aria-label="' + escapeHtmlAttr(nextL) + '">›</button>' +
      '</div>';
    bindCarouselRoot(hostEl.querySelector('[data-creator-carousel-root]'));
  }

  function buildHtmlForModal(product, productTitle) {
    var urls = collectImageUrls(product);
    if (!urls.length) {
      return '<div class="hero-product-selection-modal__product-image-placeholder" aria-hidden="true"></div>';
    }
    if (urls.length === 1) {
      return '<img src="' + escapeHtmlAttr(urls[0]) + '" alt="' + escapeHtmlText(productTitle) + '" class="hero-product-selection-modal__product-image" loading="lazy" onerror="this.style.display=\'none\'">';
    }
    var prevL = ariaLabel('prev');
    var nextL = ariaLabel('next');
    var imgs = urls.map(function (u, i) {
      return '<img src="' + escapeHtmlAttr(u) + '" alt="" class="creator-product-image-carousel__img hero-product-selection-modal__product-image" data-index="' + i + '" style="' + (i === 0 ? '' : 'display:none;') + '" loading="lazy" onerror="this.style.display=\'none\'">';
    }).join('');
    return (
      '<div class="creator-product-image-carousel creator-product-image-carousel--modal" data-creator-carousel-root data-creator-carousel-hero-modal="1">' +
      '<button type="button" class="creator-product-image-carousel__btn creator-product-image-carousel__btn--prev" data-creator-carousel-prev aria-label="' + escapeHtmlAttr(prevL) + '">‹</button>' +
      '<div class="creator-product-image-carousel__viewport" data-creator-carousel-viewport>' + imgs + '</div>' +
      '<button type="button" class="creator-product-image-carousel__btn creator-product-image-carousel__btn--next" data-creator-carousel-next aria-label="' + escapeHtmlAttr(nextL) + '">›</button>' +
      '</div>'
    );
  }

  window.CreatorProductImageCarousel = {
    collectImageUrls: collectImageUrls,
    attach: attach,
    bindCarouselRoot: bindCarouselRoot,
    buildHtmlForModal: buildHtmlForModal,
    getVisibleCarouselImageUrlFromCard: getVisibleCarouselImageUrlFromCard
  };
})();
