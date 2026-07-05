/**
 * Creator Detail Modal
 * Handles creator profile (avatar) and cover image upload and AI generation
 * Supports tabs for switching between avatar and cover images
 * Cover images support drag & zoom for cropping
 */
(function() {
  'use strict';

  if (window.__CreatorDetailModalInitDone) return;
  window.__CreatorDetailModalInitDone = true;

  function removeDuplicateNodesById(id) {
    const nodes = Array.from(document.querySelectorAll('#' + id));
    if (nodes.length <= 1) return nodes[0] || null;
    const keep = nodes[nodes.length - 1];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      nodes[i].remove();
    }
    return keep;
  }

  removeDuplicateNodesById('creator-detail-modal');
  removeDuplicateNodesById('creator-image-assets-modal');

  const API_BASE = 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  
  // Output dimensions
  // 8:3 banner — sharp on desktop/retina (was 800×300, too soft when scaled full-width)
  const COVER_WIDTH = 2400;
  const COVER_HEIGHT = 900;
  const COVER_ZOOM_MIN = 100;
  const COVER_ZOOM_MAX = 300;

  /** Desktop: zoom via slider only. Touch: pinch (two fingers). */
  function isCoverZoomSliderDevice() {
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
  }

  function setCoverZoomContainerVisible(visible) {
    if (!elements.cover.zoomContainer) return;
    if (visible && isCoverZoomSliderDevice()) {
      elements.cover.zoomContainer.style.display = 'flex';
    } else {
      elements.cover.zoomContainer.style.display = 'none';
    }
  }

  function applyCoverZoom(newZoom, markChange) {
    const z = Math.max(COVER_ZOOM_MIN, Math.min(COVER_ZOOM_MAX, Math.round(newZoom)));
    if (z === state.cover.zoom) return;
    state.cover.zoom = z;
    if (elements.cover.zoomSlider) elements.cover.zoomSlider.value = z;
    if (elements.cover.zoomValue) elements.cover.zoomValue.textContent = z + '%';
    updateCoverTransform();
    if (markChange) markAsChanged('cover');
  }

  let coverPinchStartDist = 0;
  let coverPinchStartZoom = COVER_ZOOM_MIN;
  let coverIsPinching = false;

  function coverTouchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  let currentCreatorName = null;
  let currentOwnerId = null;
  let activeTab = 'avatar';
  /** Bumped on each openModal; stale loadCreatorImage responses are ignored. */
  let imageLoadGeneration = 0;
  
  // State per category
  const state = {
    avatar: {
      pendingImageData: null,
      hasUnsavedChanges: false,
      originalImageUrl: null,
      currentImageUrl: null,
      hasExistingImage: false,
      pollInterval: null,
    },
    cover: {
      pendingImageData: null,
      hasUnsavedChanges: false,
      originalImageUrl: null,
      currentImageUrl: null,
      hasExistingImage: false,
      pollInterval: null,
      // Crop state
      zoom: 100,
      offsetX: 0,
      offsetY: 0,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      naturalWidth: 0,
      naturalHeight: 0,
      // Display mode state
      displayMode: 'cover', // 'cover' or 'hero'
      originalDisplayMode: 'cover',
      heroImages: [],
      heroCount: 0,
      // Cover layout (simple vs rotating)
      coverLayout: 'simple',
      originalCoverLayout: 'simple',
      rotationInterval: 3,
      originalRotationInterval: 3,
      rotationSelectedIds: [],
      originalRotationSelectedIds: [],
      rotationAssets: [],
      regions: {},
      regionsLoaded: false,
      regionsMetaDirty: false,
      activeRegion: 'EU',
      standardRegion: 'EU',
    }
  };

  // DOM Elements
  const modal = document.getElementById('creator-detail-modal');
  if (!modal) return;

  function q(id) {
    return modal.querySelector('#' + id);
  }

  const elements = {
    modal,
    closeBtn: q('cdm-close'),
    cancelBtn: q('cdm-cancel'),
    saveBtn: q('cdm-save'),
    creatorName: q('cdm-creator-name'),
    status: q('cdm-status'),
    // Sidebar (mobile)
    mobileMenuBtn: q('cdm-mobile-menu-btn'),
    mobileOverlay: q('cdm-mobile-overlay'),
    sidebar: q('cdm-sidebar'),
    // Nav Items (Tabs)
    tabAvatar: q('cdm-tab-avatar'),
    tabCover: q('cdm-tab-cover'),
    contentAvatar: q('cdm-content-avatar'),
    contentCover: q('cdm-content-cover'),
    // Avatar elements
    avatar: {
      preview: q('cdm-avatar'),
      image: q('cdm-avatar-image'),
      placeholder: q('cdm-avatar-placeholder'),
      loading: q('cdm-avatar-loading'),
      removeBtn: q('cdm-avatar-remove'),
      fileInput: q('cdm-avatar-file'),
      generateBtn: q('cdm-avatar-generate-btn'),
      generateSection: q('cdm-avatar-generate-section'),
      promptInput: q('cdm-avatar-prompt'),
      startGenerateBtn: q('cdm-avatar-start-generate'),
      progressSection: q('cdm-avatar-progress'),
      progressFill: q('cdm-avatar-progress-fill'),
      progressText: q('cdm-avatar-progress-text'),
      meta: q('cdm-avatar-meta'),
    },
    // Cover elements
    cover: {
      preview: q('cdm-cover'),
      image: q('cdm-cover-image'),
      placeholder: q('cdm-cover-placeholder'),
      loading: q('cdm-cover-loading'),
      removeBtn: q('cdm-cover-remove'),
      fileInput: q('cdm-cover-file'),
      generateBtn: q('cdm-cover-generate-btn'),
      generateSection: q('cdm-cover-generate-section'),
      promptInput: q('cdm-cover-prompt'),
      startGenerateBtn: q('cdm-cover-start-generate'),
      progressSection: q('cdm-cover-progress'),
      progressFill: q('cdm-cover-progress-fill'),
      progressText: q('cdm-cover-progress-text'),
      meta: q('cdm-cover-meta'),
      dragHint: q('cdm-cover-drag-hint'),
      zoomContainer: q('cdm-cover-zoom'),
      zoomSlider: q('cdm-cover-zoom-slider'),
      zoomValue: q('cdm-cover-zoom-value'),
      // Display mode elements
      modeRadioCover: q('cdm-mode-cover'),
      modeRadioHero: q('cdm-mode-hero'),
      coverSection: q('cdm-cover-section'),
      heroSection: q('cdm-hero-section'),
      // New hero list elements
      heroList: q('cdm-hero-list'),
      heroLoading: q('cdm-hero-loading'),
      heroEmpty: q('cdm-hero-empty'),
      heroSelectedCount: q('cdm-hero-selected-count'),
      heroWarning: q('cdm-hero-warning'),
      layoutBar: q('cdm-cover-layout-bar'),
      layoutTabSimple: q('cdm-cover-layout-simple'),
      layoutTabRotating: q('cdm-cover-layout-rotating'),
      simplePanel: q('cdm-cover-simple-panel'),
      rotatingPanel: q('cdm-cover-rotating-panel'),
      rotationGrid: q('cdm-cover-rotation-grid'),
      rotationEmpty: q('cdm-cover-rotation-empty'),
      rotationLoading: q('cdm-cover-rotation-loading'),
      rotationIntervalInput: q('cdm-cover-rotation-interval'),
      rotationIntervalValue: q('cdm-cover-rotation-interval-value'),
    },
    coverRegionBar: q('cdm-cover-region-bar'),
    coverRegionTabs: q('cdm-cover-region-tabs'),
    contentCover: q('cdm-content-cover'),
  };

  // =====================================================
  // State Management
  // =====================================================
  
  function markAsChanged(category) {
    if (category === 'cover' && isCoverRegionLocked()) return;
    state[category].hasUnsavedChanges = true;
    if (category === 'cover' && window.CreatorCoverRegionsUI && state.cover.regionsLoaded) {
      window.CreatorCoverRegionsUI.flushActiveRegionDraft();
    }
    updateSaveButtonState();
  }

  function resetChangeState(category) {
    state[category].hasUnsavedChanges = false;
    state[category].pendingImageData = null;
    updateSaveButtonState();
  }

  function hasAnyUnsavedChanges() {
    const regionMeta =
      window.CreatorCoverRegionsUI &&
      state.cover.regionsLoaded &&
      window.CreatorCoverRegionsUI.hasRegionMetaChanges();
    return state.avatar.hasUnsavedChanges || state.cover.hasUnsavedChanges || regionMeta;
  }

  function appendCoverRegionQuery(url) {
    if (window.CreatorCoverRegionsUI && state.cover.regionsLoaded) {
      window.CreatorCoverRegionsUI.appendRegionQuery(url);
    }
    return url;
  }

  function isCoverRegionLocked() {
    return (
      window.CreatorCoverRegionsUI &&
      state.cover.regionsLoaded &&
      window.CreatorCoverRegionsUI.isLocked()
    );
  }

  function updateSaveButtonState() {
    elements.saveBtn.disabled = !hasAnyUnsavedChanges();
  }

  // =====================================================
  // Display Mode Management (Cover vs Hero)
  // =====================================================
  
  function rotationIdsEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const sortedA = [...a].sort().join(',');
    const sortedB = [...b].sort().join(',');
    return sortedA === sortedB;
  }

  function hasCoverLayoutChanges() {
    return (
      state.cover.coverLayout !== state.cover.originalCoverLayout ||
      state.cover.rotationInterval !== state.cover.originalRotationInterval ||
      !rotationIdsEqual(state.cover.rotationSelectedIds, state.cover.originalRotationSelectedIds)
    );
  }

  function syncCoverLayoutChangeState() {
    if (hasCoverLayoutChanges()) {
      markAsChanged('cover');
      return;
    }
    if (
      !state.cover.pendingImageData &&
      state.cover.displayMode === state.cover.originalDisplayMode &&
      state.cover.currentImageUrl === state.cover.originalImageUrl
    ) {
      state.cover.hasUnsavedChanges = false;
      updateSaveButtonState();
    }
  }

  function syncRotationIntervalLabel() {
    const val = state.cover.rotationInterval;
    if (elements.cover.rotationIntervalValue) {
      elements.cover.rotationIntervalValue.textContent = val + ' s';
    }
    if (elements.cover.rotationIntervalInput) {
      elements.cover.rotationIntervalInput.value = String(val);
    }
  }

  function coverAssetDedupeKey(item) {
    const r2 = String(item?.r2_key || '').trim();
    if (r2) return 'r2:' + r2;
    const raw = String(item?.image_url || '').trim();
    if (!raw) return '';
    try {
      return 'url:' + new URL(raw, window.location.origin).pathname;
    } catch (_) {
      return 'url:' + raw.split('?')[0];
    }
  }

  function dedupeCoverAssetsByR2(items) {
    const list = Array.isArray(items) ? items : [];
    const byKey = new Map();
    for (const item of list) {
      const key = coverAssetDedupeKey(item) || String(item.id || '').trim();
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev || Number(item.created_at || 0) > Number(prev.created_at || 0)) {
        byKey.set(key, item);
      }
    }
    return Array.from(byKey.values()).sort(
      (a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)
    );
  }

  function setRotationLoadingVisible(visible) {
    const el = elements.cover.rotationLoading;
    if (!el) return;
    el.classList.toggle('is-active', !!visible);
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function hideAllCoverAreaSpinners() {
    setRotationLoadingVisible(false);
    if (elements.cover.loading) {
      elements.cover.loading.style.display = 'none';
    }
    document.querySelectorAll('.cdm-cover-rotation-loading.is-active').forEach((node) => {
      if (node !== elements.cover.rotationLoading) {
        node.classList.remove('is-active');
        node.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function renderRotationGrid() {
    const grid = elements.cover.rotationGrid;
    const empty = elements.cover.rotationEmpty;
    if (!grid) return;

    grid.innerHTML = '';
    const items = dedupeCoverAssetsByR2(state.cover.rotationAssets);
    state.cover.rotationAssets = items;
    const validIds = new Set(items.map((i) => i.id));
    state.cover.rotationSelectedIds = state.cover.rotationSelectedIds.filter((id) =>
      validIds.has(id)
    );
    hideAllCoverAreaSpinners();

    if (!items.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    items.forEach((item) => {
      const selected = state.cover.rotationSelectedIds.indexOf(item.id) !== -1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cdm-cover-rotation-item' + (selected ? ' is-selected' : '');
      btn.setAttribute('role', 'listitem');
      btn.dataset.assetId = item.id;
      btn.innerHTML =
        '<img src="' +
        item.image_url +
        '" alt="" loading="lazy">' +
        '<span class="cdm-cover-rotation-item__check" aria-hidden="true">✓</span>';
      btn.addEventListener('click', () => toggleRotationAsset(item.id));
      grid.appendChild(btn);
    });
  }

  function toggleRotationAsset(assetId) {
    const ids = state.cover.rotationSelectedIds;
    const idx = ids.indexOf(assetId);
    if (idx === -1) {
      ids.push(assetId);
    } else {
      ids.splice(idx, 1);
    }
    renderRotationGrid();
    syncCoverLayoutChangeState();
  }

  let rotationAssetsLoadToken = 0;

  async function loadRotationAssets() {
    if (!currentOwnerId || !currentCreatorName) return;
    const loadToken = ++rotationAssetsLoadToken;
    setRotationLoadingVisible(true);
    if (elements.cover.rotationEmpty) elements.cover.rotationEmpty.hidden = true;

    try {
      const url = new URL(API_BASE);
      url.searchParams.set('op', 'list-creator-image-assets');
      url.searchParams.set('owner_id', currentOwnerId);
      url.searchParams.set('creator_name', currentCreatorName);
      url.searchParams.set('image_category', 'cover');
      const response = await fetch(url.toString());
      const data = await response.json();
      if (loadToken !== rotationAssetsLoadToken) return;
      state.cover.rotationAssets =
        data.ok && data.items ? dedupeCoverAssetsByR2(data.items) : [];
      renderRotationGrid();
    } catch (err) {
      console.error('[CDM] loadRotationAssets:', err);
      if (loadToken !== rotationAssetsLoadToken) return;
      state.cover.rotationAssets = [];
      renderRotationGrid();
    } finally {
      if (loadToken === rotationAssetsLoadToken) {
        hideAllCoverAreaSpinners();
      }
    }
  }

  function updateCoverLayoutUI(layout) {
    state.cover.coverLayout = layout;

    modal.querySelectorAll('.cdm-cover-layout-tab').forEach((tab) => {
      const isActive = tab.getAttribute('data-cover-layout') === layout;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (elements.cover.simplePanel) {
      const showSimple = layout === 'simple';
      elements.cover.simplePanel.hidden = !showSimple;
      elements.cover.simplePanel.style.display = showSimple ? 'block' : 'none';
    }
    if (elements.cover.rotatingPanel) {
      const showRotating = layout === 'rotating';
      elements.cover.rotatingPanel.hidden = !showRotating;
      elements.cover.rotatingPanel.style.display = showRotating ? 'block' : 'none';
      if (showRotating) {
        hideAllCoverAreaSpinners();
        loadRotationAssets();
      } else {
        hideAllCoverAreaSpinners();
      }
    }

    syncCoverLayoutChangeState();
  }

  async function saveCoverLayout() {
    if (!currentOwnerId || !currentCreatorName) return true;
    if (!hasCoverLayoutChanges()) return true;

    if (state.cover.coverLayout === 'rotating' && state.cover.rotationSelectedIds.length < 1) {
      showStatus(
        window.CreatorI18n?.detailModalCoverRotationMin ||
          'Select at least one image for rotation.',
        'error'
      );
      return false;
    }

    try {
      const url = new URL(API_BASE);
      url.searchParams.set('op', 'save-cover-layout');
      url.searchParams.set('owner_id', currentOwnerId);
      url.searchParams.set('creator_name', currentCreatorName);
      appendCoverRegionQuery(url);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cover_layout: state.cover.coverLayout,
          cover_rotation_interval: state.cover.rotationInterval,
          cover_rotation_asset_ids: state.cover.rotationSelectedIds,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        state.cover.originalCoverLayout = state.cover.coverLayout;
        state.cover.originalRotationInterval = state.cover.rotationInterval;
        state.cover.originalRotationSelectedIds = [...state.cover.rotationSelectedIds];
        return true;
      }
      console.error('[CDM] saveCoverLayout:', data.error);
      return false;
    } catch (err) {
      console.error('[CDM] saveCoverLayout:', err);
      return false;
    }
  }

  function updateDisplayModeUI(mode) {
    state.cover.displayMode = mode;
    
    // Update radio buttons
    if (elements.cover.modeRadioCover) elements.cover.modeRadioCover.checked = mode === 'cover';
    if (elements.cover.modeRadioHero) elements.cover.modeRadioHero.checked = mode === 'hero';
    
    // Toggle sections
    if (elements.cover.coverSection) {
      elements.cover.coverSection.style.display = mode === 'cover' ? 'block' : 'none';
    }
    if (elements.cover.heroSection) {
      elements.cover.heroSection.style.display = mode === 'hero' ? 'block' : 'none';
    }
    if (elements.cover.layoutBar) {
      elements.cover.layoutBar.style.display = mode === 'cover' ? 'flex' : 'none';
    }
    
    // If switching to hero, load hero images
    if (mode === 'hero' && state.cover.heroImages.length === 0) {
      loadHeroImages();
    }
    
    if (mode === 'cover') {
      updateCoverLayoutUI(state.cover.coverLayout);
    }
    
    // Check if mode changed from original
    if (mode !== state.cover.originalDisplayMode) {
      markAsChanged('cover');
    } else {
      syncCoverLayoutChangeState();
    }
  }
  
  document.addEventListener('hero-image-deleted', function () {
    if (!currentOwnerId) return;
    loadHeroImages();
  });

  async function loadHeroImages() {
    if (!currentOwnerId) return;
    
    // Show loading state
    if (elements.cover.heroLoading) elements.cover.heroLoading.style.display = 'flex';
    if (elements.cover.heroEmpty) elements.cover.heroEmpty.style.display = 'none';
    
    try {
      const url = `${API_BASE}?op=hero-list&owner_id=${currentOwnerId}&limit=100`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (elements.cover.heroLoading) elements.cover.heroLoading.style.display = 'none';
      
      if (data.ok && data.items) {
        // Filter to only published images for this owner
        const publishedImages = data.items.filter(img => 
          img.published_at || img.status === 'published'
        );
        state.cover.heroImages = publishedImages;
        state.cover.heroCount = publishedImages.filter(img => img.creator_page_enabled !== false).length;
        updateHeroList();
      } else if (data.ok && data.items && data.items.length === 0) {
        if (elements.cover.heroEmpty) elements.cover.heroEmpty.style.display = 'flex';
      }
    } catch (err) {
      console.error('[CDM] Failed to load hero images:', err);
      if (elements.cover.heroLoading) elements.cover.heroLoading.style.display = 'none';
      if (elements.cover.heroEmpty) elements.cover.heroEmpty.style.display = 'flex';
    }
  }
  
  function updateHeroList() {
    const listContainer = elements.cover.heroList;
    if (!listContainer) return;
    
    // Clear existing items (keep loading and empty elements)
    listContainer.querySelectorAll('.cdm-hero-list-item').forEach(el => el.remove());
    
    if (state.cover.heroImages.length === 0) {
      if (elements.cover.heroEmpty) elements.cover.heroEmpty.style.display = 'flex';
      updateHeroSelectedCount();
      return;
    }
    
    if (elements.cover.heroEmpty) elements.cover.heroEmpty.style.display = 'none';
    
    // Render each hero image as a list item
    state.cover.heroImages.forEach((image, index) => {
      const isEnabled = image.creator_page_enabled !== false; // Default true if undefined
      const isPublished = !!image.published_at;
      
      const item = document.createElement('div');
      item.className = 'cdm-hero-list-item' + (isEnabled ? ' is-selected' : '');
      item.dataset.heroId = image.id;
      item.dataset.index = index;
      
      const thumbUrl = image.thumbnail_url || image.image_url;
      const title = image.title || image.gpt_prompt || `Hero #${index + 1}`;
      const truncatedTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
      
      item.innerHTML = `
        <div class="cdm-hero-list-item__checkbox">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20,6 9,17 4,12"/>
          </svg>
        </div>
        <div class="cdm-hero-list-item__thumb">
          <img src="${thumbUrl}" alt="${truncatedTitle}" loading="lazy">
        </div>
        <div class="cdm-hero-list-item__info">
          <p class="cdm-hero-list-item__title">${truncatedTitle}</p>
          <p class="cdm-hero-list-item__meta">${isPublished ? 'Online' : 'Offline'}</p>
        </div>
        <span class="cdm-hero-list-item__badge ${isPublished ? 'cdm-hero-list-item__badge--published' : 'cdm-hero-list-item__badge--draft'}">
          ${isPublished ? 'Online' : 'Offline'}
        </span>
      `;
      
      // Click handler for toggling
      item.addEventListener('click', () => toggleHeroSelection(image.id, index));
      
      listContainer.appendChild(item);
    });
    
    updateHeroSelectedCount();
  }
  
  function updateHeroSelectedCount() {
    const selectedCount = state.cover.heroImages.filter(img => img.creator_page_enabled !== false).length;
    state.cover.heroCount = selectedCount;
    
    // Update count display
    if (elements.cover.heroSelectedCount) {
      elements.cover.heroSelectedCount.textContent = selectedCount;
    }
    
    // Show warning if hero mode is selected but less than 4 images enabled
    if (elements.cover.heroWarning) {
      const showWarning = state.cover.displayMode === 'hero' && selectedCount < 4;
      elements.cover.heroWarning.style.display = showWarning ? 'flex' : 'none';
    }
  }
  
  async function toggleHeroSelection(heroId, index) {
    const image = state.cover.heroImages[index];
    if (!image) return;
    
    // Toggle local state immediately for responsive UI
    const newEnabled = image.creator_page_enabled === false;
    image.creator_page_enabled = newEnabled;
    
    // Update UI immediately
    const itemEl = document.querySelector(`.cdm-hero-list-item[data-hero-id="${heroId}"]`);
    if (itemEl) {
      itemEl.classList.toggle('is-selected', newEnabled);
    }
    updateHeroSelectedCount();
    
    // Mark as changed
    markAsChanged('cover');
    
    // Save to server
    try {
      const url = `${API_BASE}?op=toggle-hero-creator-page&owner_id=${currentOwnerId}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hero_id: heroId, enabled: newEnabled })
      });
      const data = await response.json();
      
      if (!data.ok) {
        console.error('[CDM] Failed to toggle hero:', data.error);
        // Revert on error
        image.creator_page_enabled = !newEnabled;
        if (itemEl) itemEl.classList.toggle('is-selected', !newEnabled);
        updateHeroSelectedCount();
      }
    } catch (err) {
      console.error('[CDM] Error toggling hero:', err);
      // Revert on error
      image.creator_page_enabled = !newEnabled;
      if (itemEl) itemEl.classList.toggle('is-selected', !newEnabled);
      updateHeroSelectedCount();
    }
  }
  
  async function saveDisplayMode() {
    if (!currentOwnerId || !currentCreatorName) return;
    if (state.cover.displayMode === state.cover.originalDisplayMode) return;
    
    // Validate hero mode
    if (state.cover.displayMode === 'hero' && state.cover.heroCount < 4) {
      showStatus('Mindestens 4 Hero-Bilder erforderlich', 'error');
      return false;
    }
    
    try {
      const url = new URL(API_BASE);
      url.searchParams.set('op', 'save-cover-display-mode');
      url.searchParams.set('owner_id', currentOwnerId);
      url.searchParams.set('creator_name', currentCreatorName);
      appendCoverRegionQuery(url);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_mode: state.cover.displayMode })
      });
      
      const data = await response.json();
      
      if (data.ok) {
        state.cover.originalDisplayMode = state.cover.displayMode;
        return true;
      } else {
        console.error('[CDM] Failed to save display mode:', data.error);
        return false;
      }
    } catch (err) {
      console.error('[CDM] Error saving display mode:', err);
      return false;
    }
  }

  // =====================================================
  // Tab Management
  // =====================================================
  
  function switchTab(tab) {
    activeTab = tab;
    
    // Update nav items (sidebar drawer + desktop sub-header tabs)
    modal.querySelectorAll('.cdm-nav-item, .cdm-subheader-tab').forEach((btn) => {
      const isActive = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('is-active', isActive);
    });
    
    // Update content panels
    elements.contentAvatar.style.display = tab === 'avatar' ? 'flex' : 'none';
    elements.contentAvatar.classList.toggle('cdm-tab-content--active', tab === 'avatar');
    elements.contentCover.style.display = tab === 'cover' ? 'flex' : 'none';
    elements.contentCover.classList.toggle('cdm-tab-content--active', tab === 'cover');
    
    // Close mobile sidebar
    closeMobileSidebar();
  }
  
  function openMobileSidebar() {
    if (elements.sidebar) elements.sidebar.classList.add('is-open');
    if (elements.mobileOverlay) elements.mobileOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  
  function closeMobileSidebar() {
    if (elements.sidebar) elements.sidebar.classList.remove('is-open');
    if (elements.mobileOverlay) elements.mobileOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // =====================================================
  // Modal Open/Close
  // =====================================================
  
  function openModal(creatorName, ownerId, options) {
    const initialTab = (options && options.tab === 'cover') ? 'cover' : 'avatar';
    currentCreatorName = creatorName;
    currentOwnerId = ownerId || window.customerId || window.__EAZ_OWNER_ID;
    
    // Reset state for both categories
    ['avatar', 'cover'].forEach(cat => {
      state[cat].pendingImageData = null;
      state[cat].hasUnsavedChanges = false;
      state[cat].originalImageUrl = null;
      state[cat].currentImageUrl = null;
      state[cat].hasExistingImage = false;
      if (state[cat].pollInterval) {
        clearInterval(state[cat].pollInterval);
        state[cat].pollInterval = null;
      }
    });
    
    // Reset cover crop state
    state.cover.zoom = 100;
    state.cover.offsetX = 0;
    state.cover.offsetY = 0;
    state.cover.isDragging = false;
    state.cover.naturalWidth = 0;
    state.cover.naturalHeight = 0;
    
    // Reset display mode state
    state.cover.displayMode = 'cover';
    state.cover.originalDisplayMode = 'cover';
    state.cover.heroImages = [];
    state.cover.heroCount = 0;
    state.cover.coverLayout = 'simple';
    state.cover.originalCoverLayout = 'simple';
    state.cover.rotationInterval = 3;
    state.cover.originalRotationInterval = 3;
    state.cover.rotationSelectedIds = [];
    state.cover.originalRotationSelectedIds = [];
    state.cover.rotationAssets = [];

    // Reset UI
    elements.creatorName.textContent = creatorName;
    elements.saveBtn.disabled = true;
    elements.status.style.display = 'none';
    
    // Reset both tabs
    ['avatar', 'cover'].forEach(cat => {
      const el = elements[cat];
      el.generateSection.style.display = 'none';
      el.progressSection.style.display = 'none';
      el.promptInput.value = '';
      el.meta.textContent = '';
      showPlaceholder(cat);
    });
    
    // Reset zoom slider
    if (elements.cover.zoomSlider) {
      elements.cover.zoomSlider.value = 100;
      elements.cover.zoomValue.textContent = '100%';
      elements.cover.zoomContainer.style.display = 'none';
    }
    if (elements.cover.dragHint) {
      elements.cover.dragHint.style.display = 'none';
    }
    updateCoverLayoutUI('simple');
    syncRotationIntervalLabel();
    
    switchTab(initialTab);

    imageLoadGeneration += 1;
    const loadGen = imageLoadGeneration;
    if (window.CreatorCoverRegionsUI) {
      window.CreatorCoverRegionsUI.reset();
    }
    state.cover.regionsLoaded = false;
    state.cover.regionsMetaDirty = false;

    loadCreatorImage('avatar', loadGen);
    if (window.CreatorCoverRegionsUI) {
      window.CreatorCoverRegionsUI.loadCoverRegions(loadGen);
    } else {
      loadCreatorImage('cover', loadGen);
    }
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    currentCreatorName = null;
    currentOwnerId = null;
    
    // Close mobile sidebar if open
    closeMobileSidebar();
    
    ['avatar', 'cover'].forEach(cat => {
      if (state[cat].pollInterval) {
        clearInterval(state[cat].pollInterval);
        state[cat].pollInterval = null;
      }
    });
  }

  function confirmClose() {
    if (hasAnyUnsavedChanges()) {
      const confirmText = window.CreatorI18n?.detailModalUnsavedChanges || 'Du hast ungespeicherte Änderungen. Möchtest du sie speichern oder verwerfen?';
      const saveText = window.CreatorI18n?.commonSave || 'Speichern';
      const discardText = window.CreatorI18n?.commonDiscard || 'Verwerfen';
      
      showConfirmDialog(confirmText, saveText, discardText, (action) => {
        if (action === 'save') {
          saveAllImages();
        } else {
          closeModal();
        }
      });
    } else {
      closeModal();
    }
  }

  function showConfirmDialog(message, saveLabel, discardLabel, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'cdm-confirm-overlay';
    overlay.innerHTML = `
      <div class="cdm-confirm-dialog">
        <p class="cdm-confirm-message">${message}</p>
        <div class="cdm-confirm-actions">
          <button type="button" class="cdm-btn cdm-btn--secondary cdm-confirm-discard">${discardLabel}</button>
          <button type="button" class="cdm-btn cdm-btn--primary cdm-confirm-save">${saveLabel}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    overlay.querySelector('.cdm-confirm-save').addEventListener('click', () => {
      overlay.remove();
      callback('save');
    });
    
    overlay.querySelector('.cdm-confirm-discard').addEventListener('click', () => {
      overlay.remove();
      callback('discard');
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        callback('discard');
      }
    });
  }

  // =====================================================
  // Image Display
  // =====================================================
  
  function showPlaceholder(category) {
    const el = elements[category];
    el.image.style.display = 'none';
    el.placeholder.style.display = 'flex';
    el.loading.style.display = 'none';
    el.removeBtn.style.display = 'none';
    state[category].currentImageUrl = null;
    
    if (category === 'cover') {
      elements.cover.preview.classList.remove('cdm-cover--draggable');
      if (elements.cover.zoomContainer) elements.cover.zoomContainer.style.display = 'none';
      if (elements.cover.dragHint) elements.cover.dragHint.style.display = 'none';
    }
  }

  function showImage(category, url, enableCrop = true) {
    const el = elements[category];
    
    if (category === 'cover' && enableCrop) {
      // Clear dimensions until the new source finishes loading (avoids stale crop math)
      state.cover.naturalWidth = 0;
      state.cover.naturalHeight = 0;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        state.cover.naturalWidth = img.naturalWidth;
        state.cover.naturalHeight = img.naturalHeight;
        
        // Reset crop state
        state.cover.zoom = 100;
        state.cover.offsetX = 0;
        state.cover.offsetY = 0;
        
        // Update slider
        if (elements.cover.zoomSlider) {
          elements.cover.zoomSlider.value = 100;
          elements.cover.zoomValue.textContent = '100%';
        }
        setCoverZoomContainerVisible(true);
        
        // Show drag hint
        if (elements.cover.dragHint) {
          elements.cover.dragHint.style.display = 'flex';
        }
        
        // Enable dragging
        elements.cover.preview.classList.add('cdm-cover--draggable');
        
        // Set image
        el.image.src = url;
        el.image.style.display = 'block';
        el.placeholder.style.display = 'none';
        el.loading.style.display = 'none';
        el.removeBtn.style.display = 'block';
        
        updateCoverTransform();
      };
      img.onerror = function() {
        console.error('[Creator Detail Modal] Failed to load cover image for cropping');
        el.image.src = url;
        el.image.style.display = 'block';
        el.placeholder.style.display = 'none';
        el.loading.style.display = 'none';
        el.removeBtn.style.display = 'block';
      };
      img.src = url;
    } else {
      el.image.src = url;
      el.image.style.display = 'block';
      el.placeholder.style.display = 'none';
      el.loading.style.display = 'none';
      el.removeBtn.style.display = 'block';
    }
    
    state[category].currentImageUrl = url;
  }

  function showLoading(category) {
    elements[category].loading.style.display = 'flex';
  }

  function hideLoading(category) {
    elements[category].loading.style.display = 'none';
  }

  // =====================================================
  // Cover Crop Functions
  // =====================================================
  
  function updateCoverTransform() {
    const img = elements.cover.image;
    const container = elements.cover.preview;
    const s = state.cover;
    
    if (!img || !s.naturalWidth) return;
    
    const scale = s.zoom / 100;
    const containerRect = container.getBoundingClientRect();
    const containerW = containerRect.width;
    const containerH = containerRect.height;
    
    // Calculate scaled image dimensions
    const containerAspect = containerW / containerH;
    const imageAspect = s.naturalWidth / s.naturalHeight;
    
    let scaledW, scaledH;
    if (imageAspect > containerAspect) {
      // Image is wider - fit by height
      scaledH = containerH * scale;
      scaledW = scaledH * imageAspect;
    } else {
      // Image is taller - fit by width
      scaledW = containerW * scale;
      scaledH = scaledW / imageAspect;
    }
    
    // Clamp offset to keep image covering container
    const maxOffsetX = Math.max(0, (scaledW - containerW) / 2);
    const maxOffsetY = Math.max(0, (scaledH - containerH) / 2);
    
    s.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, s.offsetX));
    s.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, s.offsetY));
    
    // Apply transform
    img.style.width = scaledW + 'px';
    img.style.height = scaledH + 'px';
    img.style.left = '50%';
    img.style.top = '50%';
    img.style.transform = `translate(calc(-50% + ${s.offsetX}px), calc(-50% + ${s.offsetY}px))`;
  }

  function handleCoverMouseDown(e) {
    if (!state.cover.naturalWidth) return;
    
    e.preventDefault();
    state.cover.isDragging = true;
    state.cover.dragStartX = e.clientX - state.cover.offsetX;
    state.cover.dragStartY = e.clientY - state.cover.offsetY;
    
    elements.cover.preview.classList.add('cdm-cover--dragging');
  }

  function handleCoverMouseMove(e) {
    if (!state.cover.isDragging) return;
    
    e.preventDefault();
    state.cover.offsetX = e.clientX - state.cover.dragStartX;
    state.cover.offsetY = e.clientY - state.cover.dragStartY;
    
    updateCoverTransform();
    markAsChanged('cover');
  }

  function handleCoverMouseUp() {
    if (state.cover.isDragging) {
      state.cover.isDragging = false;
      elements.cover.preview.classList.remove('cdm-cover--dragging');
    }
  }

  function handleCoverZoom(e) {
    applyCoverZoom(parseInt(e.target.value, 10), true);
  }

  function getCoverExportSourceUrl() {
    const pending = state.cover.pendingImageData;
    if (pending && pending.type === 'upload' && pending.temp_url) {
      return pending.temp_url;
    }
    if (pending && pending.type === 'generated' && pending.generated_url) {
      return pending.generated_url;
    }
    return state.cover.currentImageUrl;
  }

  function coverCropWasAdjusted() {
    return state.cover.zoom !== 100 || state.cover.offsetX !== 0 || state.cover.offsetY !== 0;
  }

  /** True when saving should bake the visible 8:3 preview frame (matches shop hero). */
  function shouldRunCoverCropOnSave() {
    if (!state.cover.naturalWidth) return false;
    const pending = state.cover.pendingImageData;
    if (pending && pending.type === 'delete') return false;
    if (!getCoverExportSourceUrl()) return false;
    if (pending && pending.type !== 'delete') return true;
    return coverCropWasAdjusted();
  }

  // Export cropped cover as blob
  async function exportCroppedCover(sourceUrl) {
    const exportUrl = sourceUrl || getCoverExportSourceUrl();
    return new Promise((resolve, reject) => {
      const s = state.cover;
      const container = elements.cover.preview;
      
      if (!exportUrl || !s.naturalWidth) {
        reject(new Error('No image to export'));
        return;
      }
      
      // Create canvas with output dimensions
      const canvas = document.createElement('canvas');
      canvas.width = COVER_WIDTH;
      canvas.height = COVER_HEIGHT;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      // Load image for canvas drawing
      const sourceImg = new Image();
      sourceImg.crossOrigin = 'anonymous';
      sourceImg.onload = function() {
        const containerRect = container.getBoundingClientRect();
        const containerW = containerRect.width;
        const containerH = containerRect.height;
        
        const scale = s.zoom / 100;
        const containerAspect = containerW / containerH;
        const imageAspect = s.naturalWidth / s.naturalHeight;
        
        let scaledW, scaledH;
        if (imageAspect > containerAspect) {
          scaledH = containerH * scale;
          scaledW = scaledH * imageAspect;
        } else {
          scaledW = containerW * scale;
          scaledH = scaledW / imageAspect;
        }
        
        // Calculate source crop area
        const visibleX = (scaledW - containerW) / 2 - s.offsetX;
        const visibleY = (scaledH - containerH) / 2 - s.offsetY;
        
        // Convert to source image coordinates
        const srcScale = s.naturalWidth / scaledW;
        const sx = visibleX * srcScale;
        const sy = visibleY * srcScale;
        const sw = containerW * srcScale;
        const sh = containerH * srcScale;
        
        // Draw cropped region to canvas
        ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, COVER_WIDTH, COVER_HEIGHT);
        
        // Export as blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/png', 1.0);
      };
      sourceImg.onerror = () => reject(new Error('Failed to load image for export'));
      sourceImg.src = exportUrl;
    });
  }

  // =====================================================
  // Status Messages
  // =====================================================
  
  function showStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.className = 'cdm-status cdm-status--' + type;
    elements.status.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => {
        elements.status.style.display = 'none';
      }, 3000);
    }
  }

  function hideStatus() {
    elements.status.style.display = 'none';
  }

  // =====================================================
  // API Calls
  // =====================================================
  
  async function loadCreatorImage(category, loadGen) {
    if (!currentOwnerId || !currentCreatorName) return;

    try {
      const url = new URL(API_BASE);
      url.searchParams.set('op', 'get-creator-image');
      url.searchParams.set('owner_id', currentOwnerId);
      url.searchParams.set('creator_name', currentCreatorName);
      url.searchParams.set('image_category', category);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (loadGen !== undefined && loadGen !== imageLoadGeneration) {
        return;
      }

      const hasLocalEdits = state[category].pendingImageData || state[category].hasUnsavedChanges;

      if (!hasLocalEdits) {
        if (data.ok && data.image && data.image.image_url) {
          showImage(category, data.image.image_url, category === 'cover');
          state[category].originalImageUrl = data.image.image_url;
          state[category].hasExistingImage = true;
          elements[category].meta.textContent = data.image.image_type === 'generated'
            ? (window.CreatorI18n?.detailModalGeneratedImage || 'AI Generated')
            : (window.CreatorI18n?.detailModalCustomImage || 'Custom Image');
        } else {
          showPlaceholder(category);
          state[category].hasExistingImage = false;
        }
      } else if (data.ok && data.image && data.image.image_url) {
        // Keep preview/pending; still remember server baseline for cancel/compare
        if (!state[category].originalImageUrl) {
          state[category].originalImageUrl = data.image.image_url;
          state[category].hasExistingImage = true;
        }
      }

      // For cover category, also load display_mode / rotation (only when user has not changed cover image)
      if (category === 'cover' && !state.cover.pendingImageData) {
        if (data.cover_layout) {
          state.cover.coverLayout = data.cover_layout;
          state.cover.originalCoverLayout = data.cover_layout;
        }
        if (data.cover_rotation_interval) {
          state.cover.rotationInterval = data.cover_rotation_interval;
          state.cover.originalRotationInterval = data.cover_rotation_interval;
        }
        if (Array.isArray(data.cover_rotation_asset_ids)) {
          state.cover.rotationSelectedIds = [...data.cover_rotation_asset_ids];
          state.cover.originalRotationSelectedIds = [...data.cover_rotation_asset_ids];
        }
        if (!hasLocalEdits) {
          syncRotationIntervalLabel();
        }
        if (data.display_mode) {
          state.cover.displayMode = data.display_mode;
          state.cover.originalDisplayMode = data.display_mode;
          if (!hasLocalEdits) {
            updateDisplayModeUI(data.display_mode);
          }
        } else if (!hasLocalEdits) {
          updateDisplayModeUI('cover');
        }
      }
    } catch (error) {
      if (loadGen !== undefined && loadGen !== imageLoadGeneration) return;
      console.error(`[Creator Detail Modal] Load ${category} error:`, error);
      if (!state[category].pendingImageData && !state[category].hasUnsavedChanges) {
        showPlaceholder(category);
      }
    }
  }

  function applyAssetSelection(category, item) {
    if (!item || !item.image_url) return;
    showImage(category, item.image_url, category === 'cover');
    state[category].pendingImageData = {
      type: 'asset',
      asset_id: item.id,
      r2_key: item.r2_key,
      image_url: item.image_url,
      image_type: item.image_type || 'custom'
    };
    markAsChanged(category);
    showStatus(
      window.CreatorI18n?.detailModalAssetSelected || 'Image selected. Click Save to confirm.',
      'success'
    );
  }

  function openUploadSource(category) {
    if (!currentOwnerId || !currentCreatorName) return;
    if (window.CreatorImageUploadSourceModal && typeof window.CreatorImageUploadSourceModal.open === 'function') {
      window.CreatorImageUploadSourceModal.open({
        category: category,
        ownerId: currentOwnerId,
        creatorName: currentCreatorName,
        onAssetSelect: function (item) {
          applyAssetSelection(category, item);
        }
      });
      return;
    }
    const input = elements[category].fileInput;
    if (input) input.click();
  }

  async function applyPhoneImageUrl(category, imageUrl) {
    if (!imageUrl || !currentOwnerId || !currentCreatorName) return;
    showLoading(category);
    try {
      const res = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('fetch_failed');
      const blob = await res.blob();
      const mime = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/png';
      const file = new File([blob], category + '-phone.png', { type: mime });
      await uploadImage(category, file);
    } catch (err) {
      console.error('[Creator Detail Modal] Phone image apply failed:', err);
      showStatus(
        window.CreatorI18n?.detailModalPhoneFetchFailed || 'Could not load image from phone.',
        'error'
      );
      hideLoading(category);
    }
  }

  async function uploadImage(category, file) {
    if (!currentOwnerId || !currentCreatorName) return;

    showLoading(category);
    hideStatus();

    try {
      const formData = new FormData();
      formData.append('image', file);

      const url = new URL(API_BASE);
      url.searchParams.set('op', 'upload-creator-image');
      url.searchParams.set('owner_id', currentOwnerId);
      url.searchParams.set('creator_name', currentCreatorName);
      url.searchParams.set('image_category', category);

      const response = await fetch(url.toString(), {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.ok && data.temp_url) {
        showImage(category, data.temp_url, category === 'cover');
        state[category].pendingImageData = {
          type: 'upload',
          temp_url: data.temp_url,
          r2_key: data.r2_key,
          image_type: 'custom'
        };
        markAsChanged(category);
        showStatus(window.CreatorI18n?.detailModalUploadSuccess || 'Image uploaded. Click Save to confirm.', 'success');
      } else {
        showPlaceholder(category);
        showStatus(data.error || 'Upload failed', 'error');
      }
    } catch (error) {
      console.error(`[Creator Detail Modal] Upload ${category} error:`, error);
      showPlaceholder(category);
      showStatus('Upload failed: ' + error.message, 'error');
    } finally {
      hideLoading(category);
    }
  }

  async function generateImage(category) {
    const el = elements[category];
    const prompt = el.promptInput.value.trim();
    
    if (!prompt || prompt.length < 3) {
      showStatus(window.CreatorI18n?.detailModalPromptTooShort || 'Please enter a longer description (min. 3 characters)', 'error');
      return;
    }

    if (!currentOwnerId || !currentCreatorName) return;

    showLoading(category);
    hideStatus();
    el.startGenerateBtn.disabled = true;
    el.generateSection.style.display = 'none';
    el.progressSection.style.display = 'block';
    el.progressFill.style.width = '10%';
    el.progressText.textContent = window.CreatorI18n?.detailModalStarting || 'Starting generation...';

    try {
      const url = new URL(API_BASE);
      url.searchParams.set('op', 'generate-creator-image');
      url.searchParams.set('owner_id', currentOwnerId);
      url.searchParams.set('creator_name', currentCreatorName);
      url.searchParams.set('image_category', category);

      const requestBody = { prompt };
      
      if (state[category].currentImageUrl) {
        requestBody.reference_image = state[category].currentImageUrl;
        console.log(`[Creator Detail Modal] Using reference image for ${category}`);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (response.status === 402) {
        hideLoading(category);
        el.progressSection.style.display = 'none';
        el.generateSection.style.display = 'block';
        el.startGenerateBtn.disabled = false;
        showStatus(window.CreatorI18n?.detailModalInsufficientEaz || 'Nicht genug EAZ-Guthaben. Du benötigst 5 EAZ.', 'error');
        return;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('[Creator Detail Modal] JSON parse error:', parseError);
        hideLoading(category);
        el.progressSection.style.display = 'none';
        el.generateSection.style.display = 'block';
        el.startGenerateBtn.disabled = false;
        showStatus('Server error: ' + response.status, 'error');
        return;
      }

      if (data.ok && data.prediction_id) {
        pollForResult(category, data.prediction_id, prompt);
      } else {
        hideLoading(category);
        el.progressSection.style.display = 'none';
        el.generateSection.style.display = 'block';
        el.startGenerateBtn.disabled = false;
        
        if (data.code === 'INSUFFICIENT_EAZ') {
          if (window.EazInsufficientActions && typeof window.EazInsufficientActions.show === 'function') {
            window.EazInsufficientActions.show({
              errorPayload: data,
              onRetry: function () { generateImage(category); },
            });
          } else {
            showStatus(window.CreatorI18n?.detailModalInsufficientEaz || 'Not enough EAZG.', 'error');
          }
        } else {
          showStatus(data.error || 'Generation failed', 'error');
        }
      }
    } catch (error) {
      console.error(`[Creator Detail Modal] Generate ${category} error:`, error);
      hideLoading(category);
      el.progressSection.style.display = 'none';
      el.generateSection.style.display = 'block';
      el.startGenerateBtn.disabled = false;
      showStatus('Generation failed: ' + error.message, 'error');
    }
  }

  function pollForResult(category, predictionId, prompt) {
    const el = elements[category];
    let progress = 10;
    let pollCount = 0;
    const maxPolls = 90;

    state[category].pollInterval = setInterval(async () => {
      pollCount++;
      
      if (progress < 90) {
        progress += Math.random() * 5 + 2;
        el.progressFill.style.width = Math.min(progress, 90) + '%';
      }

      if (pollCount > maxPolls) {
        clearInterval(state[category].pollInterval);
        state[category].pollInterval = null;
        hideLoading(category);
        el.progressSection.style.display = 'none';
        el.generateSection.style.display = 'block';
        el.startGenerateBtn.disabled = false;
        showStatus(window.CreatorI18n?.detailModalTimeout || 'Generation timed out. Please try again.', 'error');
        return;
      }

      try {
        const url = new URL(API_BASE);
        url.searchParams.set('op', 'creator-image-status');
        url.searchParams.set('prediction_id', predictionId);

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.status === 'succeeded' && data.output) {
          clearInterval(state[category].pollInterval);
          state[category].pollInterval = null;
          
          el.progressFill.style.width = '100%';
          el.progressText.textContent = window.CreatorI18n?.detailModalComplete || 'Complete!';
          
          const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
          
          setTimeout(() => {
            showImage(category, imageUrl, category === 'cover');
            hideLoading(category);
            el.progressSection.style.display = 'none';
            
            state[category].pendingImageData = {
              type: 'generated',
              generated_url: imageUrl,
              prediction_id: predictionId,
              prompt: prompt,
              image_type: 'generated'
            };
            
            markAsChanged(category);
            showStatus(window.CreatorI18n?.detailModalGenerateSuccess || 'Image generated! Click Save to confirm.', 'success');
          }, 500);
          
        } else if (data.status === 'failed') {
          clearInterval(state[category].pollInterval);
          state[category].pollInterval = null;
          hideLoading(category);
          el.progressSection.style.display = 'none';
          el.generateSection.style.display = 'block';
          el.startGenerateBtn.disabled = false;
          showStatus(data.error || window.CreatorI18n?.detailModalGenerateFailed || 'Generation failed', 'error');
        } else {
          el.progressText.textContent = window.CreatorI18n?.detailModalGenerating || 'Generating your image...';
        }
      } catch (error) {
        console.error(`[Creator Detail Modal] Poll ${category} error:`, error);
      }
    }, 2000);
  }

  async function removeImage(category) {
    if (!state[category].hasExistingImage && !state[category].pendingImageData) {
      showPlaceholder(category);
      return;
    }

    if (!state[category].hasExistingImage) {
      state[category].pendingImageData = null;
      showPlaceholder(category);
      resetChangeState(category);
      showStatus(window.CreatorI18n?.detailModalImageRemoved || 'Bild entfernt.', 'success');
      return;
    }

    state[category].pendingImageData = {
      type: 'delete',
      image_type: 'none'
    };
    
    showPlaceholder(category);
    markAsChanged(category);
    showStatus(window.CreatorI18n?.detailModalImageMarkedForRemoval || 'Bild wird beim Speichern entfernt.', 'info');
  }

  async function saveAllImages() {
    const categoriesToSave = ['avatar', 'cover'].filter(cat => state[cat].hasUnsavedChanges);
    const layoutChanged = hasCoverLayoutChanges();
    
    const regionMetaDirty =
      window.CreatorCoverRegionsUI &&
      state.cover.regionsLoaded &&
      (state.cover.regionsMetaDirty || window.CreatorCoverRegionsUI.hasRegionMetaChanges());

    if (categoriesToSave.length === 0 && !layoutChanged && !regionMetaDirty) return;

    elements.saveBtn.disabled = true;
    let hasError = false;
    let savedCount = 0;

    if (regionMetaDirty && window.CreatorCoverRegionsUI) {
      window.CreatorCoverRegionsUI.flushActiveRegionDraft();
      const metaOk = await window.CreatorCoverRegionsUI.saveCoverRegionsMeta();
      if (!metaOk) {
        hasError = true;
      }
    }

    // Save display mode if changed (for cover)
    if (state.cover.displayMode !== state.cover.originalDisplayMode) {
      // Validate hero mode
      if (state.cover.displayMode === 'hero' && state.cover.heroCount < 4) {
        showStatus(window.CreatorI18n?.detailModalHeroRequired || 'Mindestens 4 Hero-Bilder erforderlich', 'error');
        elements.saveBtn.disabled = false;
        return;
      }
      
      const displayModeResult = await saveDisplayMode();
      if (!displayModeResult) {
        hasError = true;
      }
    }

    if (hasCoverLayoutChanges()) {
      const layoutResult = await saveCoverLayout();
      if (!layoutResult) {
        hasError = true;
        elements.saveBtn.disabled = !hasAnyUnsavedChanges();
        return;
      }
    }

    for (const category of categoriesToSave) {
      // Skip cover file save when only display mode / rotation changed (no image or crop edits)
      if (category === 'cover' && !state.cover.pendingImageData && !shouldRunCoverCropOnSave()) {
        savedCount++;
        resetChangeState(category);
        continue;
      }
      
      const result = await saveImage(category);
      if (result) {
        savedCount++;
      } else {
        hasError = true;
      }
    }

    if (hasError) {
      elements.saveBtn.disabled = !hasAnyUnsavedChanges();
    } else {
      showStatus(window.CreatorI18n?.detailModalSaveSuccess || 'Images saved successfully!', 'success');
      
      window.dispatchEvent(new CustomEvent('creator-images-saved', {
        detail: {
          creator_name: currentCreatorName,
          categories: categoriesToSave,
          display_mode: state.cover.displayMode
        }
      }));
      
      setTimeout(() => {
        closeModal();
      }, 1500);
    }
  }

  async function saveImage(category) {
    if (!currentOwnerId || !currentCreatorName) return false;
    const categoryState = state[category];
    
    // Handle delete case
    if (categoryState.pendingImageData && categoryState.pendingImageData.type === 'delete') {
      showLoading(category);

      try {
        const url = new URL(API_BASE);
        url.searchParams.set('op', 'delete-creator-image');
        url.searchParams.set('owner_id', currentOwnerId);
        url.searchParams.set('creator_name', currentCreatorName);
        url.searchParams.set('image_category', category);
        if (category === 'cover') appendCoverRegionQuery(url);

        const response = await fetch(url.toString(), {
          method: 'DELETE'
        });

        const data = await response.json();

        if (data.ok) {
          window.dispatchEvent(new CustomEvent('creator-image-deleted', {
            detail: { creator_name: currentCreatorName, image_category: category }
          }));
          
          resetChangeState(category);
          categoryState.hasExistingImage = false;
          categoryState.originalImageUrl = null;
          return true;
        } else {
          showStatus(data.error || 'Delete failed', 'error');
          return false;
        }
      } catch (error) {
        console.error(`[Creator Detail Modal] Delete ${category} error:`, error);
        showStatus('Delete failed: ' + error.message, 'error');
        return false;
      } finally {
        hideLoading(category);
      }
    }

    // Nothing to save
    if (!categoryState.pendingImageData && !categoryState.hasUnsavedChanges) return true;

    // Cover: export visible 8:3 frame so the shop hero matches the settings preview
    if (category === 'cover' && shouldRunCoverCropOnSave()) {
      showLoading(category);
      
      try {
        const blob = await exportCroppedCover(getCoverExportSourceUrl());
        
        // Upload cropped image as FormData
        const formData = new FormData();
        formData.append('image', blob, 'cover.png');
        
        const uploadUrl = new URL(API_BASE);
        uploadUrl.searchParams.set('op', 'upload-creator-image');
        uploadUrl.searchParams.set('owner_id', currentOwnerId);
        uploadUrl.searchParams.set('creator_name', currentCreatorName);
        uploadUrl.searchParams.set('image_category', 'cover');
        appendCoverRegionQuery(uploadUrl);
        
        const uploadRes = await fetch(uploadUrl.toString(), {
          method: 'POST',
          body: formData
        });
        
        const uploadData = await uploadRes.json();
        
        if (!uploadData.ok) {
          showStatus(uploadData.error || 'Upload failed', 'error');
          return false;
        }
        
        // Now save the uploaded image
        const saveUrl = new URL(API_BASE);
        saveUrl.searchParams.set('op', 'save-creator-image');
        saveUrl.searchParams.set('owner_id', currentOwnerId);
        saveUrl.searchParams.set('creator_name', currentCreatorName);
        saveUrl.searchParams.set('image_category', 'cover');
        appendCoverRegionQuery(saveUrl);
        
        const cropSavePayload = {
          type: 'upload',
          temp_url: uploadData.temp_url,
          r2_key: uploadData.r2_key,
          image_type: categoryState.pendingImageData?.image_type || 'custom',
          prompt: categoryState.pendingImageData?.prompt || null
        };

        const saveRes = await fetch(saveUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cropSavePayload)
        });
        
        const saveData = await saveRes.json();
        
        if (saveData.ok) {
          if (saveData.image_url) {
            showImage(category, saveData.image_url, true);
            categoryState.originalImageUrl = saveData.image_url;
          }
          categoryState.hasExistingImage = true;
          resetChangeState(category);
          
          window.dispatchEvent(new CustomEvent('creator-image-saved', {
            detail: {
              creator_name: currentCreatorName,
              image_category: category,
              image_url: saveData.image_url,
              image_type: saveData.image_type
            }
          }));
          
          return true;
        } else {
          showStatus(saveData.error || 'Save failed', 'error');
          return false;
        }
      } catch (error) {
        console.error(`[Creator Detail Modal] Save cover error:`, error);
        showStatus('Save failed: ' + error.message, 'error');
        return false;
      } finally {
        hideLoading(category);
      }
    }

    // Standard save for avatar or non-crop cases
    if (!categoryState.pendingImageData) return true;

    showLoading(category);

    try {
      const url = new URL(API_BASE);
      url.searchParams.set('op', 'save-creator-image');
      url.searchParams.set('owner_id', currentOwnerId);
      url.searchParams.set('creator_name', currentCreatorName);
      url.searchParams.set('image_category', category);
      if (category === 'cover') appendCoverRegionQuery(url);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryState.pendingImageData)
      });

      const data = await response.json();

      if (data.ok) {
        if (data.image_url) {
          showImage(category, data.image_url, category === 'cover');
          categoryState.originalImageUrl = data.image_url;
        }
        
        categoryState.hasExistingImage = true;
        resetChangeState(category);
        
        window.dispatchEvent(new CustomEvent('creator-image-saved', {
          detail: {
            creator_name: currentCreatorName,
            image_category: category,
            image_url: data.image_url,
            image_type: data.image_type
          }
        }));
        
        return true;
      } else {
        showStatus(data.error || 'Save failed', 'error');
        return false;
      }
    } catch (error) {
      console.error(`[Creator Detail Modal] Save ${category} error:`, error);
      showStatus('Save failed: ' + error.message, 'error');
      return false;
    } finally {
      hideLoading(category);
    }
  }

  // =====================================================
  // Event Listeners
  // =====================================================
  
  // Tab switching (sidebar drawer + desktop sub-header)
  modal.querySelectorAll('.cdm-nav-item, .cdm-subheader-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab === 'avatar' || tab === 'cover') switchTab(tab);
    });
  });
  
  // Mobile sidebar
  if (elements.mobileMenuBtn) {
    elements.mobileMenuBtn.addEventListener('click', openMobileSidebar);
  }
  if (elements.mobileOverlay) {
    elements.mobileOverlay.addEventListener('click', closeMobileSidebar);
  }
  
  // Close modal
  elements.closeBtn.addEventListener('click', confirmClose);
  elements.cancelBtn.addEventListener('click', confirmClose);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) confirmClose();
  });

  const avatarUploadBtn = document.getElementById('cdm-avatar-upload-btn');
  const coverUploadBtn = document.getElementById('cdm-cover-upload-btn');
  if (avatarUploadBtn) avatarUploadBtn.addEventListener('click', () => openUploadSource('avatar'));
  if (coverUploadBtn) coverUploadBtn.addEventListener('click', () => openUploadSource('cover'));

  // Avatar events
  elements.avatar.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) uploadImage('avatar', file);
    e.target.value = '';
  });

  elements.avatar.generateBtn.addEventListener('click', () => {
    const el = elements.avatar;
    const isVisible = el.generateSection.style.display !== 'none';
    el.generateSection.style.display = isVisible ? 'none' : 'block';
    el.progressSection.style.display = 'none';
  });

  elements.avatar.startGenerateBtn.addEventListener('click', () => generateImage('avatar'));
  elements.avatar.removeBtn.addEventListener('click', () => removeImage('avatar'));

  // Cover events
  elements.cover.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) uploadImage('cover', file);
    e.target.value = '';
  });

  elements.cover.generateBtn.addEventListener('click', () => {
    const el = elements.cover;
    const isVisible = el.generateSection.style.display !== 'none';
    el.generateSection.style.display = isVisible ? 'none' : 'block';
    el.progressSection.style.display = 'none';
  });

  elements.cover.startGenerateBtn.addEventListener('click', () => generateImage('cover'));
  elements.cover.removeBtn.addEventListener('click', () => removeImage('cover'));

  // Cover drag events
  elements.cover.preview.addEventListener('mousedown', handleCoverMouseDown);
  document.addEventListener('mousemove', handleCoverMouseMove);
  document.addEventListener('mouseup', handleCoverMouseUp);
  
  // Display mode radio buttons
  if (elements.cover.modeRadioCover) {
    elements.cover.modeRadioCover.addEventListener('change', () => updateDisplayModeUI('cover'));
  }
  if (elements.cover.modeRadioHero) {
    elements.cover.modeRadioHero.addEventListener('change', () => updateDisplayModeUI('hero'));
  }

  modal.querySelectorAll('.cdm-cover-layout-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const layout = tab.getAttribute('data-cover-layout');
      if (layout) updateCoverLayoutUI(layout);
    });
  });

  if (elements.cover.rotationIntervalInput) {
    elements.cover.rotationIntervalInput.addEventListener('input', (e) => {
      state.cover.rotationInterval = Number(e.target.value) || 3;
      syncRotationIntervalLabel();
      syncCoverLayoutChangeState();
    });
  }
  
  // Touch: one finger = pan, two fingers = pinch zoom (mobile / touch devices)
  elements.cover.preview.addEventListener(
    'touchstart',
    (e) => {
      if (!state.cover.naturalWidth) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        coverIsPinching = true;
        state.cover.isDragging = false;
        coverPinchStartDist = coverTouchDistance(e.touches);
        coverPinchStartZoom = state.cover.zoom;
        return;
      }
      if (e.touches.length === 1 && !coverIsPinching) {
        const touch = e.touches[0];
        handleCoverMouseDown({
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => e.preventDefault(),
        });
      }
    },
    { passive: false }
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      if (!state.cover.naturalWidth) return;
      if (coverIsPinching && e.touches.length === 2) {
        e.preventDefault();
        const dist = coverTouchDistance(e.touches);
        if (coverPinchStartDist > 0 && dist > 0) {
          const scale = dist / coverPinchStartDist;
          applyCoverZoom(coverPinchStartZoom * scale, true);
        }
        return;
      }
      if (state.cover.isDragging && e.touches.length === 1 && !coverIsPinching) {
        const touch = e.touches[0];
        handleCoverMouseMove({
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => e.preventDefault(),
        });
      }
    },
    { passive: false }
  );

  document.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      coverIsPinching = false;
      coverPinchStartDist = 0;
    }
    handleCoverMouseUp();
  });

  // Cover zoom (desktop slider only)
  if (elements.cover.zoomSlider) {
    elements.cover.zoomSlider.addEventListener('input', handleCoverZoom);
  }

  if (window.CreatorCoverRegionsUI && elements.coverRegionBar) {
    window.CreatorCoverRegionsUI.init({
      API_BASE: API_BASE,
      state: state,
      elements: elements,
      getOwnerId: function () { return currentOwnerId; },
      getCreatorName: function () { return currentCreatorName; },
      get imageLoadGeneration() { return imageLoadGeneration; },
      showStatus: showStatus,
      markAsChanged: markAsChanged,
      updateSaveButtonState: updateSaveButtonState,
      loadCreatorImage: loadCreatorImage,
      showImage: showImage,
      showPlaceholder: showPlaceholder,
      updateDisplayModeUI: updateDisplayModeUI,
      updateCoverLayoutUI: updateCoverLayoutUI,
      syncRotationIntervalLabel: syncRotationIntervalLabel,
      loadRotationAssets: loadRotationAssets,
    });
  }

  // Save button
  elements.saveBtn.addEventListener('click', saveAllImages);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (modal.style.display === 'flex' && e.key === 'Escape') {
      confirmClose();
    }
  });

  // =====================================================
  // Global API
  // =====================================================
  
  window.CreatorDetailModal = {
    open: openModal,
    close: closeModal,
    applyPhoneImageUrl: applyPhoneImageUrl
  };

  console.log('[Creator Detail Modal] Initialized');
})();
