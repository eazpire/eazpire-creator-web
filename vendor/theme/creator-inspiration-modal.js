/**
 * Creator Inspiration Modal
 * Displays all public designs for inspiration and allows loading them into the upload zone
 */

(function() {
  'use strict';

  let modal = document.getElementById('creator-inspiration-modal');
  if (!modal) {
    console.warn('Creator Inspiration Modal element not found');
    window.CreatorInspirationModal = { open: () => {}, close: () => {} };
    return;
  }
  let modalInitialized = false;
  /** Set by open({ sectionId }) — applied when a design is loaded into the upload zone */
  let _inspirationModalSectionId = null;
  /** 'remix' = max one design as remix source (creator generator / upload flow) */
  let _modalPurpose = null;

  /** Prefer portal/shop dispatch (CreatorWidget / CREATOR_API_CONFIG). Never hardcode workers.dev only — it can hang while /api/dispatch works. */
  function getApiBase() {
    try {
      if (window.CREATOR_API_CONFIG && typeof window.CREATOR_API_CONFIG.getDispatchUrl === 'function') {
        var dispatchUrl = window.CREATOR_API_CONFIG.getDispatchUrl();
        if (dispatchUrl) return String(dispatchUrl).replace(/\/$/, '');
      }
    } catch (_e0) {}
    if (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) {
      return String(window.CreatorWidget.apiBaseUrl).replace(/\/$/, '');
    }
    try {
      var host = (window.location && window.location.hostname) || '';
      if (host === 'creator.eazpire.com') {
        return String(window.location.origin).replace(/\/$/, '') + '/api/dispatch';
      }
      if (host === 'www.eazpire.com' || host === 'eazpire.com') {
        return String(window.location.origin).replace(/\/$/, '') + '/__eaz/creator-dispatch';
      }
    } catch (_e1) {}
    if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) {
      var base = String(window.CREATOR_API_CONFIG.BASE_URL).replace(/\/$/, '');
      if (window.__CREATOR_PORTAL_HOST__) return base + '/api/dispatch';
      return base + '/apps/creator-dispatch';
    }
    return 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  }

  var FETCH_TIMEOUT_MS = 20000;
  var PAGE_LIMIT = 100;

  function fetchWithTimeout(url, options) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var opts = Object.assign({ credentials: 'include' }, options || {});
    if (ctrl) opts.signal = ctrl.signal;
    var pending = fetch(url, opts);
    if (ctrl) {
      timer = setTimeout(function () {
        try { ctrl.abort(); } catch (_a) {}
      }, FETCH_TIMEOUT_MS);
    }
    return pending.finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  // DOM Elements (close uses creator-base-modal header X, same as My Designs)
  let modalClose = modal.querySelector('#creator-inspiration-modal-close, .creator-base-modal__close');
  const gridView = modal.querySelector('#creator-inspiration-modal-grid-view');
  const detailView = modal.querySelector('#creator-inspiration-modal-detail-view');
  const grid = modal.querySelector('#creator-inspiration-modal-grid');
  const loadingEl = modal.querySelector('#creator-inspiration-modal-loading');
  const emptyEl = modal.querySelector('#creator-inspiration-modal-empty');
  const detailImage = modal.querySelector('#creator-inspiration-modal-detail-image');
  const detailImageMobile = modal.querySelector('#creator-inspiration-modal-detail-image-mobile');
  const closeDetailBtn = modal.querySelector('#creator-inspiration-modal-close-detail');
  const closeDetailBtnMobile = modal.querySelector('#creator-inspiration-modal-close-detail-mobile');
  const applyBtn = modal.querySelector('#creator-inspiration-modal-apply');
  const applyBtnMobile = modal.querySelector('#creator-inspiration-modal-apply-mobile');
  const searchInput = modal.querySelector('#creator-inspiration-modal-search');
  const remixesGrid = modal.querySelector('#creator-inspiration-modal-remixes-grid');
  const remixesLoading = modal.querySelector('#creator-inspiration-modal-remixes-loading');
  const remixesEmpty = modal.querySelector('#creator-inspiration-modal-remixes-empty');
  const remixCountEl = modal.querySelector('#creator-inspiration-modal-remix-count');
  const remixCountElMobile = modal.querySelector('#creator-inspiration-modal-remix-count-mobile');
  const salesCountEl = modal.querySelector('#creator-inspiration-modal-sales-count');
  const salesCountElMobile = modal.querySelector('#creator-inspiration-modal-sales-count-mobile');
  const detailDesktop = modal.querySelector('.creator-inspiration-modal__detail-desktop');
  const detailMobile = modal.querySelector('.creator-inspiration-modal__detail-mobile');
  const remixesGridMobile = modal.querySelector('#creator-inspiration-modal-remixes-grid-mobile');
  const remixesLoadingMobile = modal.querySelector('#creator-inspiration-modal-remixes-loading-mobile');
  const remixesEmptyMobile = modal.querySelector('#creator-inspiration-modal-remixes-empty-mobile');
  const filterBtn = modal.querySelector('#creator-inspiration-filter-btn');

  function isModalOpen() {
    return !!(modal && (modal.open === true || modal.hasAttribute('open')));
  }

  function refreshModalCloseEl() {
    if (!modal) return null;
    modalClose = modal.querySelector('#creator-inspiration-modal-close, .creator-base-modal__close');
    return modalClose;
  }

  let designs = [];
  let filteredDesigns = [];
  let selectedDesign = null;
  let remixes = [];
  let isLoading = false;
  let isLoadingRemixes = false;
  let searchQuery = '';
  let activeFilterState = {}; // Aktuell aktive Filter (vom Inspirations-Filter-Modal)
  let totalCount = 0; // Total number of matching designs from backend
  let searchDebounceTimer = null;
  const SEARCH_DEBOUNCE_MS = 300; // Wait 300ms after last keystroke

  // Helper: Check if mobile
  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  // Global scroll lock utility (for all Creator modals)
  function lockBodyScroll() {
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    } else {
      const body = document.body;
      const scrollY = window.scrollY;
      body.style.position = 'fixed';
      body.style.top = '-' + scrollY + 'px';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    }
  }

  // Safe unlock function - garantiert ausführbar, auch bei Fehlern
  function safeUnlockScroll() {
    try {
      if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
        window.CreatorModalPhysics.unlockBodyScroll();
      } else {
        const body = document.body;
        if (!body) return; // Sicherheitscheck
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        body.style.overflow = '';
        // Entferne auch eventuelle scrollY aus dataset falls vorhanden
        if (body.dataset && body.dataset.scrollY) {
          const scrollY = parseInt(body.dataset.scrollY, 10);
          if (!isNaN(scrollY)) {
            window.scrollTo(0, scrollY);
          }
          delete body.dataset.scrollY;
        }
      }
    } catch (e) {
      console.warn('[InspirationModal] Scroll unlock failed, using fallback:', e);
      // Fallback: Versuche Body-Styles direkt zu resetten
      try {
        const body = document.body;
        if (body) {
          body.style.position = '';
          body.style.top = '';
          body.style.width = '';
          body.style.overflow = '';
        }
      } catch (e2) {
        console.error('[InspirationModal] Fallback scroll unlock also failed:', e2);
      }
    }
  }

  function unlockBodyScroll() {
    safeUnlockScroll();
  }

  function appendServerFilters(targetUrl, filters) {
    filters = filters || {};
    if (filters.design_art && filters.design_art.length > 0) {
      targetUrl.searchParams.set('filter_design_art', filters.design_art[0]);
    }
    if (filters.ratio && filters.ratio.length > 0) {
      targetUrl.searchParams.set('filter_ratio', filters.ratio[0]);
    }
    if (filters.content_type && filters.content_type.length > 0) {
      targetUrl.searchParams.set('filter_content_type', filters.content_type[0]);
    }
    if (filters.design_type && filters.design_type.length > 0) {
      targetUrl.searchParams.set('filter_design_type', filters.design_type[0]);
    }
    if (filters.design_language && filters.design_language.length > 0) {
      targetUrl.searchParams.set('filter_design_language', filters.design_language[0]);
    }
    if (filters.personalizable && filters.personalizable.length > 0) {
      targetUrl.searchParams.set('filter_personalizable', filters.personalizable[0] === 'yes' ? 'yes' : 'no');
    } else if (filters.personalizable === true) {
      targetUrl.searchParams.set('filter_personalizable', 'yes');
    } else if (filters.personalizable === false) {
      targetUrl.searchParams.set('filter_personalizable', 'no');
    }
  }

  function applyClientExtraFilters(items, filters) {
    if (!window.InspirationFilterModal || typeof window.InspirationFilterModal.matchesFilter !== 'function') {
      return items;
    }
    const hasExtraFilters = Object.keys(filters || {}).some((key) => {
      if (['design_art', 'ratio', 'content_type', 'design_type', 'design_language', 'personalizable'].indexOf(key) >= 0) {
        return false;
      }
      return filters[key] && filters[key].length > 0;
    });
    if (!hasExtraFilters) return items;
    return items.filter((design) => window.InspirationFilterModal.matchesFilter(design, filters));
  }

  function shareInspirationQueryState(search, filters) {
    try {
      window.__creatorInspirationActiveFilters = JSON.parse(
        JSON.stringify(filters && Object.keys(filters).length ? filters : activeFilterState || {})
      );
      window.__creatorInspirationSearchQuery = typeof search === 'string' ? search : '';
    } catch (e) {
      window.__creatorInspirationActiveFilters = {};
    }
  }

  // Fetch public designs with optional search and filters (server-side).
  // First page renders immediately; further pages append in the background.
  async function fetchDesigns(options = {}) {
    if (isLoading) return;
    isLoading = true;

    const { search = '', filters = {} } = options;
    const apiBase = getApiBase();

    try {
      if (loadingEl) loadingEl.style.display = 'block';
      if (emptyEl) emptyEl.style.display = 'none';
      if (grid) grid.style.opacity = '0.5';

      let allItems = [];
      let nextCursor = null;
      let reportedTotal = 0;
      let pageGuard = 0;
      let firstPageShown = false;

      do {
        const url = new URL(apiBase);
        url.searchParams.set('op', 'list-public');
        url.searchParams.set('limit', String(PAGE_LIMIT));
        if (search && search.trim()) {
          url.searchParams.set('search', search.trim());
        }
        appendServerFilters(url, filters);
        if (nextCursor) {
          url.searchParams.set('cursor', nextCursor);
        }

        console.log('[InspirationModal] Fetching designs with URL:', url.toString());

        const response = await fetchWithTimeout(url.toString());
        if (!response.ok) {
          throw new Error('http_' + response.status);
        }
        const data = await response.json();

        if (!data.ok) {
          throw new Error(data.error || 'unknown_error');
        }

        reportedTotal = data.total_count != null ? data.total_count : reportedTotal;
        allItems = allItems.concat(data.items || []);
        nextCursor = data.next_cursor || null;
        pageGuard += 1;

        // Show first page ASAP so the modal never stays on infinite loading
        if (!firstPageShown) {
          designs = allItems;
          filteredDesigns = applyClientExtraFilters(designs, filters);
          totalCount = reportedTotal || designs.length;
          shareInspirationQueryState(search, filters);
          renderGrid();
          updateTotalCount();
          updateEmptyState();
          if (loadingEl) loadingEl.style.display = 'none';
          if (grid) grid.style.opacity = '1';
          firstPageShown = true;
        }
      } while (nextCursor && pageGuard < 40);

      designs = allItems;
      filteredDesigns = applyClientExtraFilters(designs, filters);
      totalCount = reportedTotal || designs.length;
      shareInspirationQueryState(search, filters);

      renderGrid();
      updateTotalCount();
      updateEmptyState();

      if (loadingEl) loadingEl.style.display = 'none';
      if (grid) grid.style.opacity = '1';
    } catch (error) {
      console.error('Error fetching public designs:', error);
      if (loadingEl) loadingEl.style.display = 'none';
      if (grid) grid.style.opacity = '1';
      // Keep any designs already shown from the first page; only show empty if nothing loaded
      if (!designs.length) {
        if (emptyEl) {
          emptyEl.textContent = (window.CreatorI18n && (window.CreatorI18n['creator.inspiration.empty'] || window.CreatorI18n.inspiration_empty))
            || 'No public designs found.';
          emptyEl.style.display = 'block';
        }
        if (grid) grid.style.display = 'none';
      } else {
        updateEmptyState();
        updateTotalCount();
      }
    } finally {
      isLoading = false;
    }
  }

  // Update total count display
  function updateTotalCount() {
    const countEl = modal.querySelector('#creator-inspiration-modal-count');
    if (countEl) {
      countEl.textContent = `${totalCount} Designs`;
    }
    // Also dispatch event for filter modal to update counts
    window.dispatchEvent(new CustomEvent('inspiration-designs-loaded', {
      detail: { totalCount, designs }
    }));
  }

  // Debounced search - waits for user to stop typing
  function debouncedSearch(query) {
    clearTimeout(searchDebounceTimer);
    searchQuery = query;
    
    searchDebounceTimer = setTimeout(() => {
      fetchDesigns({ search: query, filters: activeFilterState });
    }, SEARCH_DEBOUNCE_MS);
  }

  // NOTE: Search and filtering is now done SERVER-SIDE for scalability
  // The old client-side functions are kept for backwards compatibility but 
  // the main search/filter flow goes through fetchDesigns()

  // Apply current search and filters by fetching from server
  function applySearch() {
    // Server-side search and filter
    fetchDesigns({ search: searchQuery, filters: activeFilterState });
  }

  // Update empty state based on filtered results
  function updateEmptyState() {
    if (!grid || !emptyEl) return;
    
    if (filteredDesigns.length === 0 && designs.length > 0) {
      emptyEl.textContent = 'No designs found.';
      emptyEl.style.display = 'block';
      grid.style.display = 'none';
    } else if (designs.length === 0) {
      emptyEl.textContent = 'No public designs found.';
      emptyEl.style.display = 'block';
      grid.style.display = 'none';
    } else {
      emptyEl.style.display = 'none';
      grid.style.display = 'grid';
    }
  }

  // Render grid of designs (like My Creations but without title/body)
  function renderGrid() {
    if (!grid) return;
    
    grid.innerHTML = '';

    filteredDesigns.forEach((design) => {
      const card = document.createElement('div');
      card.className = 'creator-inspiration-modal__card';
      card.dataset.designId = design.id || '';
      card.dataset.designUrl = design.preview_url || '';
      card.dataset.designOriginalUrl = design.original_url || '';

      const imageWrapper = document.createElement('div');
      imageWrapper.className = 'creator-inspiration-modal__card-image-wrapper';

      if (design.preview_url) {
        const img = document.createElement('img');
        img.src = design.preview_url;
        img.alt = design.title || 'Design';
        img.className = 'creator-inspiration-modal__card-image';
        img.loading = 'lazy';
        imageWrapper.appendChild(img);
      } else {
        const noImage = document.createElement('div');
        noImage.className = 'creator-inspiration-modal__card-no-image';
        noImage.textContent = 'Kein Bild';
        imageWrapper.appendChild(noImage);
      }

      card.appendChild(imageWrapper);
      grid.appendChild(card);

      // Click handler: show detail view
      card.addEventListener('click', () => {
        console.log('[InspirationModal] Card clicked, design:', design.id);
        showDetailView(design);
      });
    });
  }

  // Fetch remixes for a design
  async function fetchRemixes(designId) {
    if (!designId || isLoadingRemixes) return;

    isLoadingRemixes = true;
    remixes = [];

    try {
      // Desktop loading states
      if (remixesLoading) remixesLoading.style.display = 'block';
      if (remixesEmpty) remixesEmpty.style.display = 'none';
      if (remixesGrid) remixesGrid.innerHTML = '';
      
      // Mobile loading states
      if (remixesLoadingMobile) remixesLoadingMobile.style.display = 'block';
      if (remixesEmptyMobile) remixesEmptyMobile.style.display = 'none';
      if (remixesGridMobile) remixesGridMobile.innerHTML = '';

      const url = new URL(getApiBase());
      url.searchParams.set('op', 'get-remixes');
      url.searchParams.set('design_id', designId);
      url.searchParams.set('limit', '50');

      const response = await fetchWithTimeout(url.toString());
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'unknown_error');
      }

      remixes = data.items || [];
      renderRemixes();
      updateRemixCount(remixes.length);

      // Desktop states
      if (remixesLoading) remixesLoading.style.display = 'none';
      if (remixesEmpty) remixesEmpty.style.display = remixes.length === 0 ? 'block' : 'none';
      
      // Mobile states
      if (remixesLoadingMobile) remixesLoadingMobile.style.display = 'none';
      if (remixesEmptyMobile) remixesEmptyMobile.style.display = remixes.length === 0 ? 'block' : 'none';
    } catch (error) {
      console.error('Error fetching remixes:', error);
      if (remixesLoading) remixesLoading.style.display = 'none';
      if (remixesEmpty) remixesEmpty.style.display = 'block';
      if (remixesLoadingMobile) remixesLoadingMobile.style.display = 'none';
      if (remixesEmptyMobile) remixesEmptyMobile.style.display = 'block';
      updateRemixCount(0);
    } finally {
      isLoadingRemixes = false;
    }
  }

  // Render remixes grid
  function renderRemixes() {
    // Desktop grid
    if (remixesGrid) {
      remixesGrid.innerHTML = '';
      remixes.forEach((remix) => {
        const card = createRemixCard(remix);
        remixesGrid.appendChild(card);
      });
    }
    
    // Mobile grid (horizontal scroll, 3 visible)
    if (remixesGridMobile) {
      remixesGridMobile.innerHTML = '';
      remixes.forEach((remix) => {
        const card = createRemixCard(remix);
        remixesGridMobile.appendChild(card);
      });
    }
  }

  // Helper: Create remix card
  function createRemixCard(remix) {
    const card = document.createElement('div');
    card.className = 'creator-inspiration-modal__card creator-inspiration-modal__remix-card';
    card.dataset.designId = remix.id || '';
    card.dataset.designUrl = remix.preview_url || '';
    card.dataset.designOriginalUrl = remix.original_url || '';

    const imageWrapper = document.createElement('div');
    imageWrapper.className = 'creator-inspiration-modal__card-image-wrapper';

    if (remix.preview_url) {
      const img = document.createElement('img');
      img.src = remix.preview_url;
      img.alt = remix.title || 'Remix';
      img.className = 'creator-inspiration-modal__card-image';
      img.loading = 'lazy';
      imageWrapper.appendChild(img);
    } else {
      const noImage = document.createElement('div');
      noImage.className = 'creator-inspiration-modal__card-no-image';
      noImage.textContent = 'Kein Bild';
      imageWrapper.appendChild(noImage);
    }

    card.appendChild(imageWrapper);

    // Click handler: replace current design with remix (parent-child navigation)
    card.addEventListener('click', () => {
      loadDesignAsSelected(remix);
    });

    return card;
  }

  // Update remix count display
  function updateRemixCount(count) {
    const countStr = String(count || 0);
    if (remixCountEl) remixCountEl.textContent = countStr;
    if (remixCountElMobile) remixCountElMobile.textContent = countStr;
  }

  // Update sales count display
  function updateSalesCount(count) {
    const countStr = String(count || 0);
    if (salesCountEl) salesCountEl.textContent = countStr;
    if (salesCountElMobile) salesCountElMobile.textContent = countStr;
  }

  // Fetch sales count for a specific design
  async function fetchDesignSales(designId) {
    if (!designId) return 0;
    
    try {
      const url = new URL(getApiBase());
      url.searchParams.set('op', 'get-design-stats');
      url.searchParams.set('design_id', designId);
      
      const response = await fetchWithTimeout(url.toString());
      const data = await response.json();
      
      if (data.ok) {
        // Backend könnte sales_count, total_sales, oder sold_count zurückgeben
        return data.sales_count || data.total_sales || data.sold_count || 0;
      }
      return 0;
    } catch (error) {
      console.warn('Error fetching design sales:', error);
      return 0;
    }
  }

  // Show loading animation in image container (mit pulsierendem eazpire creator Logo)
  function showImageLoading() {
    // Entferne vorhandene Ladeanimation falls vorhanden
    const existing = document.querySelectorAll('.inspiration-modal-image-loading');
    existing.forEach(el => el.remove());

    // CSS für Puls-Animation hinzufügen falls noch nicht vorhanden
    if (!document.getElementById('inspiration-modal-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'inspiration-modal-pulse-style';
      style.textContent = `
        @keyframes inspiration-modal-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.05);
          }
        }
      `;
      document.head.appendChild(style);
    }

    // Versuche eazpire creator Logo zu finden
    const logoImg = document.querySelector('img[alt*="eazpire" i], img[src*="eazpire-creator-logo" i], .header-logo img, header img[src*="eazpire-creator" i]');
    const logoUrl = logoImg ? logoImg.src : 'https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950';

    // Desktop: Ladeanimation im Bild-Container
    const desktopImageWrap = detailImage?.parentElement;
    if (desktopImageWrap) {
      const loading = document.createElement('div');
      loading.className = 'inspiration-modal-image-loading';
      loading.style.cssText = `
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(2, 6, 23, 0.8);
        z-index: 10;
        border-radius: 8px;
      `;
      
      const logoElement = document.createElement('div');
      logoElement.style.cssText = 'text-align: center;';
      
      const logoImgEl = document.createElement('img');
      logoImgEl.src = logoUrl;
      logoImgEl.alt = 'eazpire creator';
      logoImgEl.style.cssText = 'max-width: 150px; max-height: 150px; width: auto; height: auto; animation: inspiration-modal-pulse 1.5s ease-in-out infinite; object-fit: contain;';
      
      logoElement.appendChild(logoImgEl);
      loading.appendChild(logoElement);
      desktopImageWrap.style.position = 'relative';
      desktopImageWrap.appendChild(loading);
    }

    // Mobile: Ladeanimation im Bild-Container
    const mobileImageWrap = detailImageMobile?.parentElement;
    if (mobileImageWrap) {
      const loading = document.createElement('div');
      loading.className = 'inspiration-modal-image-loading';
      loading.style.cssText = `
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(2, 6, 23, 0.8);
        z-index: 10;
        border-radius: 8px;
      `;
      
      const logoElement = document.createElement('div');
      logoElement.style.cssText = 'text-align: center;';
      
      const logoImgEl = document.createElement('img');
      logoImgEl.src = logoUrl;
      logoImgEl.alt = 'eazpire creator';
      logoImgEl.style.cssText = 'max-width: 150px; max-height: 150px; width: auto; height: auto; animation: inspiration-modal-pulse 1.5s ease-in-out infinite; object-fit: contain;';
      
      logoElement.appendChild(logoImgEl);
      loading.appendChild(logoElement);
      mobileImageWrap.style.position = 'relative';
      mobileImageWrap.appendChild(loading);
    }
  }

  function removeImageLoading() {
    const loadings = document.querySelectorAll('.inspiration-modal-image-loading');
    loadings.forEach(el => el.remove());
  }

  // Create loading overlay with pulsing eazpire creator logo (DEPRECATED - nicht mehr verwendet)
  function createLoadingOverlay() {
    // Entferne vorhandenes Overlay falls vorhanden
    const existing = document.getElementById('inspiration-modal-loading-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'inspiration-modal-loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(2, 6, 23, 0.96);
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 20px;
    `;
    
    // Versuche eazpire creator Logo zu finden
    const logoImg = document.querySelector('img[alt*="eazpire" i], img[src*="eazpire-creator-logo" i], .header-logo img, header img[src*="eazpire-creator" i]');
    const logoUrl = logoImg ? logoImg.src : 'https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950';
    
    // Pulsierendes Logo-Element
    const logoElement = document.createElement('div');
    logoElement.style.cssText = 'text-align: center;';
    
    const logoImgEl = document.createElement('img');
    logoImgEl.src = logoUrl;
    logoImgEl.alt = 'eazpire creator';
    logoImgEl.style.cssText = 'max-width: 150px; max-height: 150px; width: auto; height: auto; animation: inspiration-modal-pulse 1.5s ease-in-out infinite; object-fit: contain;';
    
    logoElement.appendChild(logoImgEl);
    overlay.appendChild(logoElement);
    
    // CSS für Puls-Animation hinzufügen falls noch nicht vorhanden
    if (!document.getElementById('inspiration-modal-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'inspiration-modal-pulse-style';
      style.textContent = `
        @keyframes inspiration-modal-pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.05);
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(overlay);
    return overlay;
  }

  function removeLoadingOverlay() {
    const overlay = document.getElementById('inspiration-modal-loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  // Load design as selected (for parent-child navigation)
  async function loadDesignAsSelected(design) {
    // ✅ FIX: Altes Bild sofort entfernen (leere Fläche anzeigen)
    if (detailImage) {
      detailImage.src = '';
      detailImage.alt = '';
    }
    if (detailImageMobile) {
      detailImageMobile.src = '';
      detailImageMobile.alt = '';
    }
    
    // ✅ FIX: Ladeanimation nur im Bildbereich anzeigen (nicht Fullscreen)
    showImageLoading();
    
    try {
      selectedDesign = design;
      await updateDetailView(design);
      await fetchRemixes(design.id);
      
      // Warte bis Bilder geladen sind, dann entferne Ladeanimation
      const images = [detailImage, detailImageMobile].filter(Boolean);
      if (images.length > 0) {
        await Promise.all(images.map(img => {
          if (img.complete && img.src) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; // Auch bei Fehler weiter
            // Timeout nach 5 Sekunden
            setTimeout(resolve, 5000);
          });
        }));
      }
    } finally {
      // Entferne Ladeanimation
      removeImageLoading();
    }
  }

  // Update detail view with design data
  // WICHTIG: preview_url für Anzeige verwenden (kleiner, schneller)
  // original_url nur beim Remix/Upload verwenden (volle Qualität)
  async function updateDetailView(design) {
    const imageUrl = design.preview_url || design.original_url || '';

    if (detailImage) {
      detailImage.src = imageUrl;
      detailImage.alt = design.title || 'Design';
    }

    if (detailImageMobile) {
      detailImageMobile.src = imageUrl;
      detailImageMobile.alt = design.title || 'Design';
    }

    // Load sales count from API (async)
    // Show 0 initially while loading
    updateSalesCount(0);
    
    // Fetch actual sales count from backend
    if (design.id) {
      try {
        const salesCount = await fetchDesignSales(design.id);
        console.log('[InspirationModal] Sales count for design', design.id, ':', salesCount);
        updateSalesCount(salesCount);
      } catch (e) {
        console.warn('[InspirationModal] Failed to fetch sales count:', e);
      }
    }
  }

  // Show detail view with selected design
  async function showDetailView(design) {
    console.log('[InspirationModal] showDetailView called with design:', design);
    
    // ✅ FIX: Modal sofort öffnen, dann asynchron laden
    // Show/hide desktop or mobile layout
    const mobile = isMobile();
    
    if (gridView) gridView.style.display = 'none';
    if (detailView) detailView.style.display = 'flex';
    if (modal) modal.classList.add('creator-inspiration-modal--detail');
    
    if (mobile) {
      if (detailDesktop) detailDesktop.style.display = 'none';
      if (detailMobile) detailMobile.style.display = 'flex';
    } else {
      if (detailDesktop) detailDesktop.style.display = 'flex';
      if (detailMobile) detailMobile.style.display = 'none';
    }
    
    // Jetzt asynchron laden (Modal ist bereits sichtbar)
    await loadDesignAsSelected(design);
  }

  // Show grid view (close detail)
  function showGridView() {
    selectedDesign = null;
    remixes = [];

    // ✅ FIX: display Property entfernen, damit CSS (display: flex) wieder greift
    // display: block würde das Flex-Layout zerstören und Scrollbars kaputt machen
    if (gridView) gridView.style.removeProperty('display');
    if (detailView) detailView.style.display = 'none';
    if (modal) modal.classList.remove('creator-inspiration-modal--detail');
    
    // Reset remix counts
    updateRemixCount(0);
    updateSalesCount(0);
    
    // WICHTIG: Scroll-Lock NICHT entfernen, da Modal noch offen ist
    // unlockBodyScroll() wird nur in close() aufgerufen
  }


  function inspirationI18n(key, fallback) {
    if (window.CreatorI18n && window.CreatorI18n[key]) return window.CreatorI18n[key];
    return fallback;
  }

  function getFileInputForSection(sectionId) {
    if (!sectionId) return null;
    return document.getElementById('creatorImage-' + sectionId);
  }

  function getExistingRemixParentId(sectionId) {
    const fileInput = getFileInputForSection(sectionId);
    const fromInput =
      (fileInput && (fileInput.dataset.parentDesignId || fileInput.dataset.remixDesignId)) || '';
    if (fromInput) return String(fromInput).trim();
    try {
      if (window.__creatorGenParentDesignId) return String(window.__creatorGenParentDesignId).trim();
    } catch (_e) {}
    return '';
  }

  function confirmRemixReplace(existingId, nextId) {
    if (!existingId || !nextId || String(existingId) === String(nextId)) return true;
    const msg =
      (window.CreatorI18n && window.CreatorI18n.confirmRemixReplace) ||
      inspirationI18n(
        'remix_replace_confirm',
        'Replace the current remix source with this design?'
      );
    if (typeof window.confirm === 'function') return window.confirm(msg);
    return true;
  }

  function designTypeFromDesign(design) {
    if (!design) return null;
    var meta = design.metadata;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch (_e) {
        meta = null;
      }
    }
    return (meta && meta.design_type) || design.design_type || null;
  }

  // Load design into upload zone (optionally via Reference Influence modal)
  function loadDesignIntoUploadZone(design) {
    // Use preview_url first for generator consistency and speed
    const imageUrl = design.preview_url || design.original_url || '';

    if (!imageUrl) {
      console.error('No image URL available for design:', design.id);
      return;
    }

    // Generator mobile flow: hand off selection to generator event contract.
    if (window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE) {
      if (_modalPurpose === 'remix') {
        const existing = getExistingRemixParentId(_inspirationModalSectionId);
        if (existing && design.id && !confirmRemixReplace(existing, design.id)) {
          return;
        }
      }
      close();
      const detail = { imageUrl: imageUrl, designType: designTypeFromDesign(design) };
      if (_modalPurpose === 'remix' && design.id) {
        detail.parentDesignId = String(design.id);
        detail.remixMode = true;
      }
      window.dispatchEvent(new CustomEvent('gen-design-selected', { detail: detail }));
      window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE = false;
      return;
    }

    // Resolve section BEFORE close() — close() clears _inspirationModalSectionId
    let sectionId = _inspirationModalSectionId;
    _inspirationModalSectionId = null;
    if (!sectionId) {
      const shopW = document.querySelector('[data-eaz-shop-design-studio="1"]');
      if (shopW && shopW.id) {
        const sm = shopW.id.match(/creator-widget-(.+)/);
        if (sm) sectionId = sm[1];
      }
    }
    if (!sectionId) {
      const widgetElement = document.querySelector('[id^="creator-widget-"]');
      if (widgetElement) {
        const idMatch = widgetElement.id.match(/creator-widget-(.+)/);
        if (idMatch) sectionId = idMatch[1];
      }
    }
    if (!sectionId) {
      console.warn('Could not find creator widget section ID');
      return;
    }

    function applyToUploadZone(strength, influenceResult) {
      if (_modalPurpose === 'remix') {
        const existing = getExistingRemixParentId(sectionId);
        if (existing && design.id && !confirmRemixReplace(existing, design.id)) {
          return;
        }
      }

      const uploadZone = document.getElementById('uploadZone-' + sectionId);
      const previewContainer = document.getElementById('imagePreviewContainer-' + sectionId);
      const previewImg = document.getElementById('imagePreview-' + sectionId);
      const fileInput = document.getElementById('creatorImage-' + sectionId);

      if (!previewContainer || !previewImg) return;

      previewImg.src = imageUrl;
      previewContainer.style.display = 'flex';
      if (uploadZone) uploadZone.style.display = 'none';
      if (fileInput) {
        fileInput.dataset.imageUrl = imageUrl;
        if (typeof strength === 'number') fileInput.dataset.referenceStrength = String(strength);
        if (influenceResult && influenceResult.inspiration_mode) {
          fileInput.dataset.inspirationMode = String(influenceResult.inspiration_mode);
        }
        try {
          if (influenceResult && influenceResult.elements) {
            fileInput.dataset.referenceElements = JSON.stringify(influenceResult.elements);
          }
          if (influenceResult && Array.isArray(influenceResult.exclude_elements)) {
            fileInput.dataset.referenceExcludeElements = JSON.stringify(influenceResult.exclude_elements);
          }
          if (influenceResult && Array.isArray(influenceResult.include_elements)) {
            fileInput.dataset.referenceIncludeElements = JSON.stringify(influenceResult.include_elements);
          }
        } catch (eInf) {}
        if (_modalPurpose === 'remix') {
          delete fileInput.dataset.parentDesignId;
          delete fileInput.dataset.remixDesignId;
          if (design.id) {
            fileInput.dataset.parentDesignId = String(design.id);
            fileInput.dataset.remixDesignId = String(design.id);
            console.log('[Inspiration Modal] remix parent_design_id:', design.id);
          }
        } else if (design.id) {
          fileInput.dataset.parentDesignId = design.id;
          console.log('[Inspiration Modal] parent_design_id gespeichert:', design.id);
        }
      }
      if (_modalPurpose === 'remix' && design.id) {
        try {
          window.__creatorGenParentDesignId = String(design.id);
        } catch (_e3) {}
      }
      var pctEl = document.getElementById('imageAdjustInfluence-' + sectionId)?.querySelector('.creator-preview-adjust-influence__pct');
      if (pctEl && typeof strength === 'number') pctEl.textContent = Math.round(strength * 100) + '%';
      if (
        document.body.classList.contains('eaz-shop-studio-open') &&
        typeof window.eazShopStudioRefsAdd === 'function' &&
        sectionId
      ) {
        var stPct =
          typeof strength === 'number' && !isNaN(strength)
            ? strength <= 1 && strength >= 0
              ? Math.round(strength * 100)
              : Math.round(strength)
            : 60;
        var addOpts = {};
        if (influenceResult && influenceResult.inspiration_mode) addOpts.inspiration_mode = influenceResult.inspiration_mode;
        if (influenceResult && influenceResult.elements) addOpts.elements = influenceResult.elements;
        if (influenceResult && influenceResult.include_elements) addOpts.include_elements = influenceResult.include_elements;
        if (influenceResult && influenceResult.exclude_elements) addOpts.exclude_elements = influenceResult.exclude_elements;
        window.eazShopStudioRefsAdd(sectionId, imageUrl, stPct, Object.keys(addOpts).length ? addOpts : undefined);
      }
      console.log('[Inspiration Modal] Design loaded into upload zone:', design.id);
    }

    if (window.ReferenceInfluenceModal && typeof window.ReferenceInfluenceModal.open === 'function') {
      close();
      window.ReferenceInfluenceModal.open({
        imageUrl: imageUrl,
        onApply: function(result) {
          if (result && typeof result.strength === 'number') {
            applyToUploadZone(result.strength, result);
          }
        }
      });
    } else {
      close();
      applyToUploadZone(0.6);
    }
  }

  // Open modal (optional { sectionId } — e.g. from upload-source-modal for correct generator target)
  function open(opts) {
    opts = opts || {};
    _modalPurpose = opts.purpose === 'remix' ? 'remix' : null;
    try {
      window.__creatorInspirationRemixMode = _modalPurpose === 'remix';
    } catch (_eOpen) {}
    if (opts.sectionId != null && String(opts.sectionId).trim() !== '') {
      _inspirationModalSectionId = String(opts.sectionId).trim();
    }
    // WICHTIG: Immer frische DOM-Referenz holen, falls Element ersetzt wurde
    if (!modal || !modal.isConnected) {
      modal = document.getElementById('creator-inspiration-modal');
    }
    if (!modal) {
      console.error('[InspirationModal] open() - Modal element not found in DOM');
      return;
    }

    // Host: open automation <dialog> subtree, else shop studio shell, else <body> (top layer stacking)
    var modalHost = null;
    if (typeof window.eazCreatorAutomationLayerHost === 'function') {
      modalHost = window.eazCreatorAutomationLayerHost();
    }
    if (!modalHost && typeof window.eazShopStudioModalRoot === 'function') {
      modalHost = window.eazShopStudioModalRoot();
    }
    if (!modalHost) modalHost = document.body;
    if (modal.parentElement !== modalHost) {
      console.log('[InspirationModal] Moving modal to host (was child of:', modal.parentElement?.tagName, modal.parentElement?.id, ')');
      modalHost.appendChild(modal);
    }
    
    try {
      console.log('[InspirationModal] Opening modal...', { isConnected: modal.isConnected, id: modal.id });
      refreshModalCloseEl();

      // Clear any leftover overlay inline styles from pre-migration open path
      modal.style.cssText = '';
      modal.classList.remove('creator-modal', 'creator-modal--open', 'creator-modal--strong-backdrop');

      // Native <dialog> API — same as My Designs
      if (typeof modal.showModal === 'function') {
        if (!modal.open) modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }

      lockBodyScroll();

      // Load designs if not already loaded
      if (designs.length === 0 && !isLoading) {
        fetchDesigns();
      } else {
        showGridView();
      }

      // Clear search when opening modal
      if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
      }
    } catch (e) {
      console.error('[InspirationModal] Error opening modal:', e);
      try {
        if (modal && typeof modal.close === 'function' && modal.open) modal.close();
        else if (modal) modal.removeAttribute('open');
      } catch (_) {}
      safeUnlockScroll();
    }
  }

  // Close modal
  function close() {
    if (!modal) return;
    
    console.log('[InspirationModal] Closing modal...');

    try {
      // Frische DOM-Referenz falls nötig
      if (!modal || !modal.isConnected) {
        modal = document.getElementById('creator-inspiration-modal');
      }
      if (!modal) return;

      if (document.activeElement && modal.contains(document.activeElement)) {
        document.activeElement.blur();
      }

      if (typeof modal.close === 'function') {
        if (modal.open) modal.close();
      } else {
        modal.removeAttribute('open');
      }
      modal.classList.remove('creator-inspiration-modal--detail', 'creator-modal', 'creator-modal--open', 'creator-modal--strong-backdrop');
      modal.style.cssText = '';

      // Reset to grid view
      showGridView();
      selectedDesign = null;

      // Clear search when closing modal (ohne neuen Fetch auszulösen)
      if (searchInput) {
        searchInput.value = '';
        searchQuery = '';
      }
      // Filter zurücksetzen
      activeFilterState = {};
    } catch (e) {
      console.error('[InspirationModal] Error closing modal:', e);
    } finally {
      // WICHTIG: Scroll-Lock IMMER entfernen, auch wenn oben ein Fehler passiert
      safeUnlockScroll();
      _inspirationModalSectionId = null;
      _modalPurpose = null;
      try {
        window.__creatorInspirationRemixMode = false;
      } catch (_eCloseFin) {}
    }
  }

  // Event Listeners
  function setupEventListeners() {
    refreshModalCloseEl();
    // Header close X — same behavior as before: detail → grid, else close modal
    if (modalClose) {
      modalClose.addEventListener('click', (e) => {
        e.stopPropagation();
        modalClose.blur();
        if (detailView && detailView.style.display !== 'none') {
          showGridView();
        } else {
          close();
        }
      });
    }

    // Search input - live search with debouncing (server-side)
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        debouncedSearch(e.target.value);
      });

      // Clear search on Escape (when focused in search; dialog cancel handles modal Escape)
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (searchInput.value) {
            e.preventDefault();
            searchInput.value = '';
            searchQuery = '';
            clearTimeout(searchDebounceTimer);
            fetchDesigns({ search: '', filters: activeFilterState });
            searchInput.blur();
          }
        }
      });
    }

    // Backdrop click on <dialog> (click target === dialog itself)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        close();
      }
    });

    // Native dialog cancel (Escape)
    modal.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (detailView && detailView.style.display !== 'none') {
        showGridView();
      } else {
        close();
      }
    });

    // Escape key fallback
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isModalOpen()) {
        if (detailView && detailView.style.display !== 'none') {
          showGridView();
        } else {
          close();
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Cleanup function (optional, for future use)
    window._inspirationModalEscapeHandler = handleEscape;

    // Detail view: Close button (desktop)
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent closing all modals
        closeDetailBtn.blur(); // Focus entfernen
        showGridView();
      });
    }

    // Detail view: Close button (mobile)
    if (closeDetailBtnMobile) {
      closeDetailBtnMobile.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDetailBtnMobile.blur(); // Focus entfernen
        showGridView();
      });
    }

    // Detail view: Apply button (desktop)
    if (applyBtn) {
      applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedDesign) {
          // WICHTIG: Focus vom Button entfernen BEVOR Modal geschlossen wird
          applyBtn.blur();
          // Focus auf ein Element außerhalb des Modals verschieben (falls verfügbar)
          const outsideElement = document.querySelector('body');
          if (outsideElement) {
            outsideElement.setAttribute('tabindex', '-1');
            outsideElement.focus();
            outsideElement.removeAttribute('tabindex');
          }
          // Design laden
          loadDesignIntoUploadZone(selectedDesign);
          // Modal schließen (nach kurzer Verzögerung, damit Focus entfernt wurde)
          requestAnimationFrame(() => {
            close();
          });
        }
      });
    }

    // Detail view: Apply button (mobile)
    if (applyBtnMobile) {
      applyBtnMobile.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedDesign) {
          // WICHTIG: Focus vom Button entfernen BEVOR Modal geschlossen wird
          applyBtnMobile.blur();
          // Focus auf ein Element außerhalb des Modals verschieben (falls verfügbar)
          const outsideElement = document.querySelector('body');
          if (outsideElement) {
            outsideElement.setAttribute('tabindex', '-1');
            outsideElement.focus();
            outsideElement.removeAttribute('tabindex');
          }
          // Design laden
          loadDesignIntoUploadZone(selectedDesign);
          // Modal schließen (nach kurzer Verzögerung, damit Focus entfernt wurde)
          requestAnimationFrame(() => {
            close();
          });
        }
      });
    }

  }

  // Initialize
  function init() {
    setupEventListeners();
  }

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export API
  window.CreatorInspirationModal = {
    open,
    close,
    // Wird vom Inspirations-Filter-Modal verwendet, um verfügbare Designs zu analysieren
    getDesigns: function() {
      return designs.slice();
    },
  };

  // Filter-Button (öffnet Inspirations-Filter-Modal)
  // WICHTIG: Event-Listener nur EINMAL registrieren
  let filterButtonListenerAttached = false;
  
  function setupFilterButton() {
    // Verhindere mehrfache Registrierung
    if (filterButtonListenerAttached) {
      return;
    }
    
    const btn = modal ? modal.querySelector('#creator-inspiration-filter-btn') : document.getElementById('creator-inspiration-filter-btn');
    if (btn) {
      filterButtonListenerAttached = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[InspirationModal] Filter button clicked');
        
        // Prüfe ob InspirationFilterModal verfügbar ist
        window.__publicDesignFilterConsumer = 'inspiration';
        if (window.InspirationFilterModal && typeof window.InspirationFilterModal.open === 'function') {
          console.log('[InspirationModal] Calling InspirationFilterModal.open()');
          window.InspirationFilterModal.open({ consumer: 'inspiration' });
        } else {
          console.error('[InspirationModal] InspirationFilterModal.open not available');
          console.error('[InspirationModal] window.InspirationFilterModal:', window.InspirationFilterModal);
          console.error('[InspirationModal] Available modals:', Object.keys(window).filter(k => k.toLowerCase().includes('filter')));
          
          // Versuche es nach kurzer Verzögerung nochmal (falls Script noch lädt)
          setTimeout(() => {
            if (window.InspirationFilterModal && typeof window.InspirationFilterModal.open === 'function') {
              console.log('[InspirationModal] Retrying to open filter modal');
              window.InspirationFilterModal.open();
            } else {
              console.error('[InspirationModal] InspirationFilterModal still not available after delay');
            }
          }, 100);
        }
      });
    } else {
      console.warn('[InspirationModal] Filter button not found');
    }
  }
  
  // Setup Filter-Button nach Initialisierung
  setupFilterButton();
  
  // Auch nach DOMContentLoaded (falls Button später geladen wird)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        if (!filterButtonListenerAttached) {
          setupFilterButton();
        }
      }, 100);
    });
  }

  // Reagiere auf Filter-Änderungen aus dem Inspirations-Filter-Modal
  window.addEventListener('inspiration-filter-changed', (event) => {
    const consumer = event.detail && event.detail.consumer ? event.detail.consumer : 'inspiration';
    if (consumer !== 'inspiration') return;
    activeFilterState = event.detail && event.detail.filters ? event.detail.filters : {};
    try {
      window.__creatorInspirationActiveFilters = JSON.parse(JSON.stringify(activeFilterState));
    } catch (e) {
      window.__creatorInspirationActiveFilters = {};
    }
    // Server-side filtering: fetch with new filters
    fetchDesigns({ search: searchQuery, filters: activeFilterState });
  });
})();

