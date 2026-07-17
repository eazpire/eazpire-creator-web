/**
 * Product Mockup Modal
 * Displays large product mockups with color and view navigation
 */

/* eslint-disable */

/* This file is JavaScript but treated as TypeScript by the editor.
   All TypeScript warnings are suppressed to avoid false positives
   since this is intentionally JavaScript code. */

(function() {
  'use strict';

  // === CONFIGURATION ===
  // Simplified: ProductMockupModal shows pre-rendered design, not mockups with overlays

  // Color to hex mapping for dot rendering (kept for navigation UI)
  const COLOR_HEX = {
    white: "#ffffff",
    black: "#000000",
    navy: "#1f2a44",
    red: "#c62828",
    royal: "#4169e1",
    'royal-blue': "#4169e1",
    purple: "#6a1b9a",
    natural: "#f3efe6",
    sand: "#e6d3a3",
    'sport-grey': "#9ca3af",
    'dark-heather': "#6b7280",
    'light-grey': "#d1d5db",
    ash: "#9ca3af",
    cardinal: "#c41e3a",
    'carolina-blue': "#4db8ff",
    charcoal: "#374151",
    'forest-green': "#059669",
    gold: "#fbbf24",
    'heather-navy': "#475569",
    'heather-red': "#dc2626",
    'heather-royal': "#3b82f6",
    'kelly-green': "#16a34a",
    maroon: "#7f1d1d",
    // Fallback for unknown colors
    unknown: "#6b7280"
  };

  // Color aliases for better matching
  const COLOR_ALIASES = {
    'sport-grey': ['sport-gray', 'sport_grey'],
    'charcoal': ['charcoal_grey'],
    'heather-royal': ['heather_royal'],
  };

  // === STATE ===
  // Simplified: Only track the rendered design source
  /** @type {string|null} */
  let renderedDesignSrc = null; // The pre-rendered design image URL from PreviewModal
  /** @type {string|null} */
  let currentProductKey = null; // Kept for potential future color navigation
  /** @type {HTMLElement|null} */
  let modal = null;
  /** @type {HTMLImageElement|null} */
  let modalImage = null;
  /** @type {HTMLElement|null} */
  let modalClose = null;


  // Initialization guard
  /** @type {boolean} */
  let isInitialized = false;

  // === UTILITY FUNCTIONS ===

  function toRelativeCreatorEngineUrl(url) {
    if (!url) return null;
    if (url.startsWith('/mockup/') || url.startsWith('/file/')) return url;

    try {
      const u = new URL(url);
      if (u.origin === 'https://creator-engine.eazpire.workers.dev') {
        return u.pathname + u.search;
      }
    } catch (_) {}
    return null;
  }

  async function loadImageElement(relPath) {
    if (!relPath || !(relPath.startsWith('/mockup/') || relPath.startsWith('/file/'))) {
      throw new Error('Invalid relative path: ' + relPath);
    }

    // Convert relative path to full URL
    let fullUrl;
    if (relPath.startsWith('/mockup/')) {
      fullUrl = `https://creator-engine.eazpire.workers.dev${relPath}`;
    } else if (relPath.startsWith('/file/')) {
      fullUrl = `https://creator-engine.eazpire.workers.dev${relPath}`;
    } else {
      throw new Error('Unsupported path format: ' + relPath);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Try to avoid CORS issues
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${fullUrl}`));
      img.src = fullUrl;
    });
  }

  function fitRect(srcW, srcH, dstW, dstH) {
    const scale = Math.min(dstW / srcW, dstH / srcH);
    return { w: srcW * scale, h: srcH * scale };
  }

  function waitForImageLoad(img) {
    if (!img) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }

      const handleLoad = () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
        resolve();
      };

      const handleError = (e) => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
        reject(new Error('Image failed to load'));
      };

      img.addEventListener('load', handleLoad);
      img.addEventListener('error', handleError);
    });
  }

  /**
   * Render design as CSS overlay instead of canvas compositing (avoids CORS issues)
   * @param {string} mockupUrl - URL of the base mockup image
   * @param {string} designUrl - URL of the design image
   * @param {Object} placement - Placement coordinates and dimensions
   * @returns {HTMLElement} - Container element with mockup and design overlay
   */
  function renderDesignAsOverlay(mockupUrl, designUrl, placement) {
    // Create container for overlay
    const container = document.createElement('div');
    container.className = 'product-mockup-modal__overlay-container';
    container.style.position = 'relative';
    container.style.display = 'block';
    container.style.width = '100%';
    container.style.height = 'auto';
    container.style.opacity = '0.5'; // Start with loading state

    // Create base mockup image
    const mockupImg = document.createElement('img');
    mockupImg.className = 'product-mockup-modal__mockup-base';
    mockupImg.src = mockupUrl;
    mockupImg.crossOrigin = 'anonymous';
    mockupImg.alt = 'Product Mockup';

    // Create design overlay
    const designImg = document.createElement('img');
    designImg.className = 'product-mockup-modal__design-overlay';
    designImg.src = designUrl;
    designImg.crossOrigin = 'anonymous';
    designImg.alt = 'Design Overlay';

    // Position design overlay based on placement
    designImg.style.position = 'absolute';
    designImg.style.top = `${placement.y * 100}%`;
    designImg.style.left = `${placement.x * 100}%`;
    designImg.style.width = `${placement.w * 100}%`;
    designImg.style.height = `${placement.h * 100}%`;
    designImg.style.transform = 'translate(-50%, -50%)';
    designImg.style.objectFit = 'contain';
    designImg.style.pointerEvents = 'none';
    designImg.style.zIndex = '1';

    container.appendChild(mockupImg);
    container.appendChild(designImg);

    return container;
  }

  function getProductVariants(productKey) {
    return PRODUCT_VARIANTS[productKey] || { colors: ['white'], views: ['front'] };
  }

  /**
   * Get mockup metadata for a product (new structure with URLs)
   */
  function getMockupMetadata(productKey) {
    return MOCKUP_METADATA[productKey];
  }

  /**
   * Get the file name for a color (handles mapping from display names to file names)
   */
  function getColorFileName(color) {
    return COLOR_FILE_MAPPING[color] || color;
  }

  /**
   * Get mockup URL for a specific color and view using metadata
   */

  /**
   * Load mockup map for current design and product
   * @returns {Promise<Object>} Mockup map with views and colors
   */
  async function loadMockupMap() {
    if (!currentProductKey || !currentDesignUrl) {
      console.warn('[ProductMockupModal] Cannot load mockup map: missing productKey or designUrl');
      return null;
    }

    // Extract design ID from design URL
    const designIdMatch = currentDesignUrl.match(/\/file\/(\d+)\//);
    if (!designIdMatch) {
      console.warn('[ProductMockupModal] Cannot extract design ID from URL:', currentDesignUrl);
      return null;
    }

    const designId = designIdMatch[1];
    const cacheKey = `${designId}-${currentProductKey}`;

    // Return cached map if available
    if (mockupMap && mockupMapCacheKey === cacheKey) {
      console.log('[ProductMockupModal] Using cached mockup map');
      return mockupMap;
    }

    try {
      console.log(`[ProductMockupModal] Loading mockup map for design ${designId}, product ${currentProductKey}`);

      const response = await fetch(`${API_BASE_URL}?op=get-mockup-map&design_id=${designId}&product_key=${currentProductKey}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`[ProductMockupModal] Failed to load mockup map: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      if (!data.ok) {
        console.warn('[ProductMockupModal] Mockup map API returned error:', data.error);
        return null;
      }

      mockupMap = data.views;
      mockupMapCacheKey = cacheKey;

      console.log(`[ProductMockupModal] Loaded mockup map:`, {
        frontColors: Object.keys(mockupMap.front || {}).length,
        backColors: Object.keys(mockupMap.back || {}).length
      });

      return mockupMap;
    } catch (error) {
      console.error('[ProductMockupModal] Error loading mockup map:', error);
      return null;
    }
  }

  /**
   * Try multiple fallback strategies for loading mockup images
   * @param {string} primaryUrl - The primary URL to try
   * @param {string} productKey - Product identifier
   * @param {string} color - Color identifier
   * @param {string} view - View ('front' or 'back')
   * @returns {Promise<string>} - The URL that successfully loads
   */
  async function findWorkingMockupUrl(primaryUrl, productKey, color, view) {
    const urlsToTry = [primaryUrl];

    // Add fallback URLs with different naming conventions
    if (color === 'royal-blue') {
      urlsToTry.push(primaryUrl.replace('royal-blue', 'royal'));
    } else if (color === 'sport-grey') {
      urlsToTry.push(primaryUrl.replace('sport-grey', 'sport-gray'));
    } else if (color === 'charcoal') {
      urlsToTry.push(primaryUrl.replace('charcoal', 'charcoal_grey'));
    }

    // Try each URL
    for (const url of urlsToTry) {
      try {
        console.log(`[ProductMockupModal] Testing URL: ${url}`);
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
          // Timeout after 3 seconds
          setTimeout(() => reject(new Error('Timeout')), 3000);
        });

        console.log(`[ProductMockupModal] URL works: ${url}`);
        return url;
      } catch (error) {
        console.warn(`[ProductMockupModal] URL failed: ${url}`, error.message);
      }
    }

    // All URLs failed - return a placeholder
    console.error(`[ProductMockupModal] All URLs failed for ${productKey}/${color}/${view}`);
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIiBmaWxsPSIjOTk5Ij5Ob3QgRm91bmQ8L3RleHQ+PC9zdmc+';
  }

  function getMockupUrl(productKey, color, view) {
    const metadata = getMockupMetadata(productKey);
    if (!metadata || !metadata.colors[color]) {
      console.warn(`[ProductMockupModal] No color ${color} available for ${productKey}`);
      return null;
    }

    // If the requested view doesn't exist, try to fall back to front
    if (!metadata.colors[color][view]) {
      console.warn(`[ProductMockupModal] View ${view} not available for ${productKey}/${color}, trying front`);
      if (metadata.colors[color].front) {
        return metadata.colors[color].front;
      }
      return null;
    }

    return metadata.colors[color][view];
  }

  /**
   * Get available colors for a product using mockup metadata
   * Colors are determined by existing mockup files, not by guessing or HEAD checks
   */
  function getAvailableColors(productKey) {
    const metadata = getMockupMetadata(productKey);
    if (!metadata) {
      console.warn(`[ProductMockupModal] No metadata for ${productKey}, using legacy variants`);
      const variants = getProductVariants(productKey);
      return variants.colors;
    }

    const colors = Object.keys(metadata.colors);
    console.log(`[ProductMockupModal] Available colors for ${productKey}:`, colors.length, colors);
    return colors;
  }

  function getCurrentVariant() {
    if (!currentProductKey) return null;

    const availableColors = getAvailableColors(currentProductKey);
    const metadata = getMockupMetadata(currentProductKey);
    const views = metadata ? metadata.views : ['front'];

    const color = availableColors[currentColorIndex];
    const view = views[currentViewIndex];

    return { color, view };
  }

  /**
   * Generate mockup URL for current variant using metadata
   */
  function getCurrentMockupUrl() {
    if (!currentProductKey) return null;

    const variant = getCurrentVariant();
    if (!variant) return null;

    return getMockupUrl(currentProductKey, variant.color, variant.view);
  }

  /**
   * Display the rendered design image (simplified - no complex rendering)
   */
  function displayRenderedDesign() {
    if (!modalImage || !renderedDesignSrc) {
      console.warn('[ProductMockupModal] Cannot display design: missing modalImage or renderedDesignSrc');
      return;
    }

    console.log('[ProductMockupModal] Displaying rendered design:', renderedDesignSrc.substring(0, 50) + '...');

    // Simple img display - same as CreatorDesignPreviewModal
    modalImage.src = renderedDesignSrc;
    modalImage.style.opacity = '1';
    modalImage.style.display = 'block';

    // Ensure container is visible
    const container = modal ? modal.querySelector('.product-mockup-modal__image-container') : null;
    if (container) {
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
    }
  }

  // Navigation functions removed - we only show the pre-rendered design

  // === EVENT HANDLERS ===

  // No navigation handlers needed - we only display the pre-rendered design

  function handleKeydown(e) {
    if (!modal || !modal.classList.contains('product-mockup-modal--visible')) return;

    switch (e.key) {
      case 'Escape':
        close();
        break;
    }
  }


  /**
   * Close modal
   */
  function close() {
    if (!modal) return;

    try {
      // Ensure container is clean for next open
      if (modal) {
        const container = modal.querySelector('.product-mockup-modal__image-container');
        if (container && modalImage) {
          container.innerHTML = '';
          container.appendChild(modalImage);
          // Clear src to prevent memory leaks
          modalImage.src = '';
        }
      }
      // Fix accessibility issue: blur focused element inside modal before hiding
      const activeElement = document.activeElement;
      if (activeElement && modal && modal.contains(/** @type {Node} */ (activeElement))) {
        activeElement.blur?.();
      }

      // Force close with multiple methods to ensure it works
      if (modal) {
        modal.classList.remove('product-mockup-modal--visible');
        modal.classList.remove('product-mockup-modal--force-visible');
        modal.style.display = 'none !important'; // Force hide with !important
        modal.style.visibility = 'hidden';
        modal.style.opacity = '0';
        modal.setAttribute('aria-hidden', 'true');
      }

      console.log('[ProductMockupModal] Modal classes after close:', modal ? modal.className : 'null', 'display:', modal ? modal.style.display : 'null');

      // Force hide if still visible after a short delay
      setTimeout(() => {
        if (modal) {
          const computedStyle = window.getComputedStyle(modal);
          if (computedStyle.display !== 'none') {
            modal.style.setProperty('display', 'none', 'important');
            modal.style.setProperty('visibility', 'hidden', 'important');
            modal.style.setProperty('opacity', '0', 'important');
          }
        }
      }, 100);

      // Remove event listeners
      document.removeEventListener('keydown', handleKeydown);

      // Unlock body scroll
      const win = /** @type {any} */ (window);
      if (win.CreatorModalPhysics && typeof win.CreatorModalPhysics.unlockBodyScroll === 'function') {
        win.CreatorModalPhysics.unlockBodyScroll();
      }

    } catch (error) {
      console.error('[ProductMockupModal] Error during close:', error);
      // Emergency close
      if (modal) {
        modal.style.display = 'none';
        modal.style.visibility = 'hidden';
      }
    }
  }

  // === PUBLIC API ===

  /**
   * Open the product mockup modal
   * @param {string} productKey - The product key
   * @param {string} [designUrl] - Optional design URL for compositing
   */
  /**
   * Open the product mockup modal
   * @param {Object} options - Options object
   * @param {string} options.productKey - The product key (for future compatibility)
   * @param {string} options.renderedDesignSrc - The pre-rendered design image URL from PreviewModal
   */
  function open(options) {
    const { productKey, renderedDesignSrc: designSrc } = options;

    console.log('[ProductMockupModal] Opening with rendered design:', {
      productKey,
      hasRenderedDesignSrc: !!designSrc,
      renderedDesignSrcPreview: designSrc ? designSrc.substring(0, 50) + '...' : null
    });

    // Modal should already be initialized
    if (!modal) {
      console.warn('[ProductMockupModal] Modal not initialized, initializing now');
      init();
    }
    if (!modal) {
      console.error('[ProductMockupModal] Failed to initialize modal');
      return;
    }

    // Store the rendered design source (this is the key change!)
    renderedDesignSrc = designSrc;
    currentProductKey = productKey; // Keep for potential future use

    // Lock body scroll
    const win = /** @type {any} */ (window);
    if (win.CreatorModalPhysics && typeof win.CreatorModalPhysics.lockBodyScroll === 'function') {
      win.CreatorModalPhysics.lockBodyScroll();
    }

    // Show modal
    modal.classList.add('product-mockup-modal--visible');
    modal.classList.add('product-mockup-modal--force-visible');
    modal.setAttribute('aria-hidden', 'false');

    // Display the rendered design immediately (simple img display)
    displayRenderedDesign();

    // Add event listeners
    document.addEventListener('keydown', handleKeydown);
  }

  // === INITIALIZATION ===

  function init() {
    // Prevent double initialization
    if (isInitialized) return;
    isInitialized = true;

    // Create modal HTML (simplified - only shows the rendered design)
    const modalHtml = `
      <div class="product-mockup-modal" aria-hidden="true">
        <div class="product-mockup-modal__backdrop"></div>
        <div class="product-mockup-modal__content">
          <button class="product-mockup-modal__close" aria-label="Schließen">&times;</button>

          <div class="product-mockup-modal__image-container">
            <img class="product-mockup-modal__image" alt="Design Preview" />
          </div>

        </div>
      </div>
    `;

    // Inject modal into DOM
    if (document.body) {
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    } else {
      // If body is not ready, wait for it
      const injectModal = () => {
        if (document.body) {
          document.body.insertAdjacentHTML('beforeend', modalHtml);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectModal);
      } else {
        injectModal();
      }
    }

    // Get modal elements (simplified)
    modal = document.querySelector('.product-mockup-modal');
    modalImage = modal?.querySelector('.product-mockup-modal__image');
    modalClose = modal?.querySelector('.product-mockup-modal__close');

    // Set up event listeners
    if (modalClose) {
      modalClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      });
    }

    if (modal) {
      const backdrop = modal.querySelector('.product-mockup-modal__backdrop');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        });
      }

      // Also add click listener to modal itself (outside content area)
      modal.addEventListener('click', (e) => {
        // Only close if clicked on modal backdrop (not on content)
        if (e.target === modal) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      });
    }

    // No navigation handlers needed - we only display the pre-rendered design
  }

  // Initialize modal immediately but safely
  init();

  // Export to global scope - make sure it's available immediately
  // NOTE: This is the LEGACY modal. The new Product Detail Modal (v2) is in product-detail-modal.js.
  // This modal is kept as a fallback for products not yet migrated to the new system.

  /** Wrap the old open() to redirect to the new modal if available */
  const legacyOpen = open;
  const smartOpen = function (opts) {
    const win = /** @type {any} */ (window);
    if (win.ProductDetailModal && typeof win.ProductDetailModal.open === 'function') {
      console.log('[ProductMockupModal] Redirecting to ProductDetailModal v2');
      win.ProductDetailModal.open({
        productKey: opts.productKey,
        renderedSrc: opts.renderedDesignSrc,
      });
      return;
    }
    // Fallback to legacy modal
    legacyOpen(opts);
  };

  window.ProductMockupModal = {
    open: smartOpen,
    close,
    // Ready flag
    isReady: true
  };

  // Dispatch ready event
  if (typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ProductMockupModal:ready'));
  }

})();