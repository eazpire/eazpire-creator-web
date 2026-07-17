/**
 * product-detail-modal.js
 * Product Detail Modal for Creator Mockup System v2
 *
 * Opened when a user clicks on a product card in the Creator Design Modal.
 * Tabs: Farbauswahl | Print Area | Gewinn
 *
 * Features:
 * - Accordion-based Print Area tab with per-design settings
 * - Interactive canvas editing (drag, resize, rotate) in Print Area tab
 * - Print area clipping with dashed border
 * - Crop tool (non-destructive, live preview)
 * - Pattern system (Grid / Brick horizontal / Brick vertical)
 * - Template system, auto-save, color preview via ClientColorize
 */
(function () {
  'use strict';

  const API_BASE = (window.CREATOR_API_CONFIG?.BASE_URL || 'https://creator-engine.eazpire.workers.dev').replace(/\/$/, '') + '/apps/creator-dispatch';
  const AUTOSAVE_DEBOUNCE_MS = 2000;
  const REDRAW_DEBOUNCE_MS = 80;
  const RECALC_PROFIT_DEBOUNCE_MS = 100;
  const PDM_DEBUG_PLACEMENT = (() => {
    try {
      const u = new URL(window.location.href);
      const q = u.searchParams.get('pdm_debug_placement');
      if (q === '1' || q === '0') {
        window.localStorage?.setItem('pdm_debug_placement', q);
        return q === '1';
      }
      return window.localStorage?.getItem('pdm_debug_placement') === '1';
    } catch (_) {
      return false;
    }
  })();

  // ─── State ─────────────────────────────────────────────────────
  let modal = null;
  let isOpen = false;

  let currentProductKey = null;
  let currentOwnerId = null;
  let currentDesignId = null;
  let currentDesignUrl = null;

  let systemDefaults = null;
  let activeConfig = null;
  let templates = [];
  let pricingData = null;

  let activeTab = 'colors';
  let previewColorHex = '#FFFFFF';
  let preRenderedVariants = {};
  let enabledColors = new Set();
  /** @type {Array<{option_value_id?: number, title: string}>} */
  let availableSizes = [];
  /** Map<hexNormalized, Set<sizeTitle>> – für jede Farbe die ausgewählten Größen */
  let enabledSizesByColor = new Map();
  let selectedAreaKey = 'front';
  let placements = {};
  let additionalDesigns = [];
  let customProfitCents = null;
  let autosaveTimer = null;
  let redrawDebounceTimer = null;
  let profitDebounceTimer = null;
  let availableColors = [];
  let mockupDefaultsResp = null;
  let favoriteMockupImageUrl = null;
  /** 'single' | 'grid' – Ansicht für Mockup-Vorschau */
  let previewViewMode = 'single';

  // ─── Canvas interaction state ──────────────────────────────────
  let selectedDesignIndex = 0;
  let interactionMode = 'select'; // 'select' | 'move' | 'resize' | 'rotate' | 'crop'
  let cropState = null;
  let isDragging = false;
  let dragStartPos = { x: 0, y: 0 };
  let dragStartDesign = null; // snapshot of design at drag start
  let cropDragHandle = null; // which crop handle is being dragged
  let cropDragStartState = null; // crop state at drag start
  let cropDragStartNorm = null; // normalized position at drag start
  /** @type {ImageBitmap|null} Cached base bitmap for canvas rendering */
  let canvasBaseBitmap = null;
  /** @type {Map<string, ImageBitmap>} Cached design bitmaps keyed by url */
  let designBitmaps = new Map();
  let canvasRAF = null;

  // ─── DOM References ────────────────────────────────────────────
  let previewImg, previewCanvas, colorCountEl, profitInput, sellPriceEl,
    netProfitEl, eazpireProfitEl, baseCostEl, profitErrorEl, autosaveEl,
    templateSelect, tabBtns, tabPanes, previewColorLabel, previewEl,
    areaAccordions, cropBar;
  let placementDebugEl = null;
  let placementDebugLastBySource = { canvas: null, preview: null };

  // ─── Init ──────────────────────────────────────────────────────
  function init() {
    if (modal) return;

    const div = document.createElement('div');
    div.innerHTML = buildHTML();
    modal = div.firstElementChild;
    document.body.appendChild(modal);

    // Cache DOM refs
    previewImg = modal.querySelector('.pdm__preview-img');
    previewCanvas = modal.querySelector('.pdm__canvas');
    previewEl = modal.querySelector('.pdm__preview');
    colorCountEl = modal.querySelector('.pdm__colors-count');
    profitInput = modal.querySelector('.pdm__profit-input');
    sellPriceEl = modal.querySelector('[data-pdm-sell-price]');
    netProfitEl = modal.querySelector('[data-pdm-net-profit]');
    eazpireProfitEl = modal.querySelector('[data-pdm-eazpire]');
    baseCostEl = modal.querySelector('[data-pdm-base-cost]');
    profitErrorEl = modal.querySelector('.pdm__profit-error');
    autosaveEl = modal.querySelector('.pdm__autosave-status');
    templateSelect = modal.querySelector('.pdm__template-select');
    tabBtns = modal.querySelectorAll('.pdm__tab-btn');
    tabPanes = modal.querySelectorAll('.pdm__tab-pane');
    previewColorLabel = modal.querySelector('.pdm__preview-color-label');
    areaAccordions = modal.querySelector('.pdm__area-accordions');
    cropBar = modal.querySelector('.pdm__crop-bar');

    bindEvents();
  }

  function buildHTML() {
    return `
    <div class="pdm creator-modal" aria-hidden="true">
      <div class="pdm__backdrop"></div>
      <div class="pdm__content">
        <!-- Header -->
        <div class="pdm__header">
          <h3 class="pdm__title">Configure product</h3>
          <button class="pdm__close" aria-label="Close">&times;</button>
        </div>

        <!-- Template Bar: dropdown + save | grid (nur bei Color-Tab, rechtsbündig bis Mock-Rand) -->
        <div class="pdm__template-bar">
          <div class="pdm__template-bar-left">
            <select class="pdm__template-select">
              <option value="">Default settings</option>
            </select>
            <button type="button" class="pdm__template-save-btn" aria-label="Save as template">
              <span class="pdm__template-save-icon" aria-hidden="true"></span>
              <span class="pdm__template-save-text">Save as template</span>
            </button>
          </div>
          <div class="pdm__template-bar-preview-edge">
            <div class="pdm__view-toggle" id="pdmViewToggle">
              <button type="button" class="pdm__view-toggle-btn pdm__view-toggle-btn--active" data-view="single" aria-label="1 grid" title="1 grid"><span class="pdm__view-icon pdm__view-icon--single"></span></button>
              <button type="button" class="pdm__view-toggle-btn" data-view="grid" aria-label="Mehrfach grid" title="Mehrfach grid"><span class="pdm__view-icon pdm__view-icon--grid"></span></button>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="pdm__body">
          <!-- Preview -->
          <div class="pdm__preview pdm__preview--single">
            <div class="pdm__preview-wrap">
              <button class="pdm__preview-nav pdm__preview-nav--prev" title="Previous color">&#8249;</button>
              <img class="pdm__preview-img" alt="Mockup Preview" />
              <canvas class="pdm__canvas"></canvas>
              <button class="pdm__preview-nav pdm__preview-nav--next" title="Next color">&#8250;</button>
            </div>
            <div class="pdm__preview-grid"></div>
            <div class="pdm__preview-color-label">White</div>
            <!-- Canvas toolbar -->
            <div class="pdm__canvas-toolbar">
              <button class="pdm__canvas-tool-btn" data-tool="crop" title="Crop">&#9986;</button>
            </div>
            <!-- Crop confirm/cancel -->
            <div class="pdm__crop-bar">
              <button class="pdm__crop-btn pdm__crop-cancel" title="Cancel">&#10005;</button>
              <button class="pdm__crop-btn pdm__crop-confirm" title="Confirm">&#10003;</button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="pdm__tabs-panel">
            <div class="pdm__tab-bar">
              <button class="pdm__tab-btn pdm__tab-btn--active" data-tab="colors">Color selection</button>
              <button class="pdm__tab-btn" data-tab="area">Print Area</button>
              <button class="pdm__tab-btn" data-tab="profit">Profit</button>
            </div>
            <div class="pdm__tab-content">
              <!-- Colors Tab -->
              <div class="pdm__tab-pane pdm__tab-pane--active" data-pane="colors">
                <div class="pdm__colors-grid"></div>
                <div class="pdm__colors-count">0 of 0 colors active</div>
              </div>

              <!-- Print Area Tab -->
              <div class="pdm__tab-pane" data-pane="area">
                <div class="pdm__area-header">
                  <button class="pdm__variant-toggle" title="Individual print area per variant">Individual</button>
                  <select class="pdm__area-select">
                    <option value="front">Front</option>
                  </select>
                  <button class="pdm__add-design-btn">+ Add</button>
                </div>
                <div class="pdm__area-accordions"></div>
              </div>

              <!-- Profit Tab -->
              <div class="pdm__tab-pane" data-pane="profit">
                <div class="pdm__profit-row">
                  <span class="pdm__profit-label">Base cost</span>
                  <span class="pdm__profit-value pdm__profit-value--muted" data-pdm-base-cost>\u2014</span>
                </div>
                <hr class="pdm__profit-divider" />
                <div class="pdm__profit-row">
                  <span class="pdm__profit-label">Your profit</span>
                  <span class="pdm__profit-hint" data-pdm-creator-share-hint><!-- 40% dein Anteil --></span>
                </div>
                <div class="pdm__profit-input-row">
                  <input type="number" class="pdm__profit-input" min="1" step="0.01" placeholder="4.00" />
                  <span class="pdm__profit-currency">EUR</span>
                </div>
                <div class="pdm__profit-error" style="display:none;"></div>
                <hr class="pdm__profit-divider" />
                <div class="pdm__profit-row">
                  <span class="pdm__profit-label">Net profit</span>
                  <span class="pdm__profit-value" data-pdm-net-profit>\u2014</span>
                </div>
                <div class="pdm__profit-row">
                  <span class="pdm__profit-label">Eazpire share</span>
                  <span class="pdm__profit-value pdm__profit-value--muted" data-pdm-eazpire>\u2014</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer: Autosave links, Zurücksetzen, Verkaufspreis rechts (immer sichtbar) -->
        <div class="pdm__footer">
          <span class="pdm__autosave-status"></span>
          <div class="pdm__footer-actions">
            <button type="button" class="pdm__footer-reset-btn">Reset</button>
            <div class="pdm__footer-sell-price">
              <span class="pdm__footer-sell-price-label">Sale price</span>
              <span class="pdm__footer-sell-price-value" data-pdm-sell-price>\u2014</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Add-Source-Dialog: Öffnet sich bei "+ Hinzufügen" -->
      <div class="pdm__add-source" aria-hidden="true">
        <div class="pdm__add-source-backdrop"></div>
        <div class="pdm__add-source-content">
          <h3 class="pdm__add-source-title">Add</h3>
          <div class="pdm__add-source-options">
            <button type="button" class="pdm__add-source-opt" data-source="upload">
              <span class="pdm__add-source-icon">\u2191</span>
              <span class="pdm__add-source-label">Upload</span>
              <small class="pdm__add-source-desc">Choose file from device</small>
            </button>
            <button type="button" class="pdm__add-source-opt" data-source="my-designs">
              <span class="pdm__add-source-icon">\u2728</span>
              <span class="pdm__add-source-label">My designs</span>
              <small class="pdm__add-source-desc">Choose design from library</small>
            </button>
            <button type="button" class="pdm__add-source-opt pdm__add-source-opt--disabled" data-source="text" disabled>
              <span class="pdm__add-source-icon">T</span>
              <span class="pdm__add-source-label">Text</span>
              <small class="pdm__add-source-desc pdm__add-source-desc--muted">coming soon</small>
            </button>
            <button type="button" class="pdm__add-source-opt pdm__add-source-opt--disabled" data-source="graphics" disabled>
              <span class="pdm__add-source-icon">\u2690</span>
              <span class="pdm__add-source-label">Graphics</span>
              <small class="pdm__add-source-desc pdm__add-source-desc--muted">coming soon</small>
            </button>
            <button type="button" class="pdm__add-source-opt" data-source="canvas">
              <span class="pdm__add-source-icon">\u25A0</span>
              <span class="pdm__add-source-label">Canvas</span>
              <small class="pdm__add-source-desc">Draw inside the print area</small>
            </button>
          </div>
          <input type="file" class="pdm__add-source-file" accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg" style="display:none" />
        </div>
      </div>

      <!-- Größen-Modal: öffnet bei Klick auf Farb-Dot -->
      <div class="pdm__size-modal" id="pdm__size-modal" aria-hidden="true">
        <div class="pdm__size-modal-backdrop"></div>
        <div class="pdm__size-modal-content">
          <h4 class="pdm__size-modal-title">Sizes for <span id="pdm__size-modal-color-name"></span></h4>
          <p class="pdm__size-modal-hint">Max. 100 variants (colors × sizes)</p>
          <div class="pdm__size-modal-list" id="pdm__size-modal-list"></div>
          <div class="pdm__size-modal-limit-msg" id="pdm__size-modal-limit-msg" aria-live="polite"></div>
          <div class="pdm__size-modal-footer">
            <span class="pdm__size-modal-count"><span id="pdm__size-modal-variant-count">0</span> variants</span>
            <button type="button" class="pdm__size-modal-close">Done</button>
          </div>
        </div>
      </div>

      <!-- Template-Name-Modal -->
      <div class="pdm__size-modal" id="pdm__template-name-modal" aria-hidden="true">
        <div class="pdm__size-modal-backdrop"></div>
        <div class="pdm__size-modal-content">
          <h4 class="pdm__size-modal-title" id="pdm__template-name-title"></h4>
          <p class="pdm__size-modal-hint" id="pdm__template-name-hint"></p>
          <input type="text" class="pdm__template-name-input" id="pdm__template-name-input" maxlength="80" />
          <div class="pdm__template-name-actions">
            <button type="button" class="pdm__template-name-btn pdm__template-name-btn--cancel" id="pdm__template-name-cancel"></button>
            <button type="button" class="pdm__template-name-btn pdm__template-name-btn--save" id="pdm__template-name-save"></button>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ─── Events ────────────────────────────────────────────────────
  function bindEvents() {
    modal.querySelector('.pdm__close').addEventListener('click', close);
    modal.querySelector('.pdm__backdrop').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const tplModal = modal?.querySelector('#pdm__template-name-modal');
      if (tplModal?.classList.contains('pdm__size-modal--open')) {
        closeTemplateNameModal();
        return;
      }
      const addSource = modal?.querySelector('.pdm__add-source');
      if (addSource?.classList.contains('pdm__add-source--visible')) {
        closeAddSource();
        return;
      }
      if (isOpen) close();
    });

    tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    templateSelect.addEventListener('change', onTemplateChange);
    modal.querySelector('.pdm__template-save-btn').addEventListener('click', onSaveTemplate);
    modal.querySelector('.pdm__footer-reset-btn').addEventListener('click', onReset);

    // View toggle: 1 grid | Mehrfach grid
    modal.querySelectorAll('.pdm__view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.view === 'grid' ? 'grid' : 'single';
        previewViewMode = mode;
        modal.querySelectorAll('.pdm__view-toggle-btn').forEach(b => b.classList.toggle('pdm__view-toggle-btn--active', b.dataset.view === mode));
        previewEl.classList.toggle('pdm__preview--single', mode === 'single');
        previewEl.classList.toggle('pdm__preview--grid', mode === 'grid');
        if (mode === 'grid') renderPreviewGrid();
      });
    });

    if (profitInput) profitInput.addEventListener('input', onProfitChange);

    const navPrev = modal.querySelector('.pdm__preview-nav--prev');
    const navNext = modal.querySelector('.pdm__preview-nav--next');
    navPrev.addEventListener('click', () => {
      if (activeTab === 'area') cycleArea(-1);
      else cycleColor(-1);
    });
    navNext.addEventListener('click', () => {
      if (activeTab === 'area') cycleArea(1);
      else cycleColor(1);
    });
    modal.querySelector('.pdm__add-design-btn').addEventListener('click', onAddDesignClick);
    bindAddSourceEvents();
    bindTemplateNameModalEvents();
    modal.querySelector('.pdm__variant-toggle').addEventListener('click', togglePerVariant);

    const areaSelect = modal.querySelector('.pdm__area-select');
    if (areaSelect) areaSelect.addEventListener('change', async () => {
      selectedAreaKey = areaSelect.value;
      selectedDesignIndex = 0;
      canvasBaseBitmap = null;
      renderAreaTab();
      await loadColorVariantsForArea(selectedAreaKey);
      loadCanvasBase().then(() => redrawCanvas());
      if (previewColorLabel) previewColorLabel.textContent = selectedAreaKey.charAt(0).toUpperCase() + selectedAreaKey.slice(1).replace(/_/g, ' ');
    });

    // Canvas interaction
    previewCanvas.addEventListener('mousedown', onCanvasMouseDown);
    previewCanvas.addEventListener('mousemove', onCanvasMouseMove);
    previewCanvas.addEventListener('mouseup', onCanvasMouseUp);
    previewCanvas.addEventListener('mouseleave', onCanvasMouseUp);
    previewCanvas.addEventListener('touchstart', onCanvasTouchStart, { passive: false });
    previewCanvas.addEventListener('touchmove', onCanvasTouchMove, { passive: false });
    previewCanvas.addEventListener('touchend', onCanvasTouchEnd);

    // Canvas toolbar
    modal.querySelector('[data-tool="crop"]').addEventListener('click', enterCropMode);

    // Crop confirm/cancel
    modal.querySelector('.pdm__crop-confirm').addEventListener('click', confirmCrop);
    modal.querySelector('.pdm__crop-cancel').addEventListener('click', cancelCrop);

    // Touch swipe: area tab = cycle views, other tabs = cycle colors (nur auf preview-wrap, nicht auf Grid)
    const previewWrap = modal.querySelector('.pdm__preview-wrap');
    if (previewWrap) {
      let touchStartX = 0;
      previewWrap.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      previewWrap.addEventListener('touchend', (e) => {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diff) > 50) {
          if (activeTab === 'area') cycleArea(diff > 0 ? -1 : 1);
          else cycleColor(diff > 0 ? -1 : 1);
        }
      });
    }
  }

  // ─── Open / Close ──────────────────────────────────────────────
  async function open(opts) {
    init();

    currentProductKey = opts.productKey;
    currentOwnerId = opts.ownerId;
    currentDesignId = opts.designId;
    currentDesignUrl = opts.designUrl;

    modal.querySelector('.pdm__title').textContent = opts.productName || opts.productKey;

    // Do not set renderedSrc here: it may be print-area (card thumbnail), but Farbauswahl must show mockup.
    // updatePreview() will set the correct image after API load.

    modal.classList.add('pdm--visible', 'creator-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.body.style.overflow = 'hidden';

    switchTab('colors');

    try {
      const [defaultsResp, configResp, templatesResp, pricingResp, colorVariantsResp] = await Promise.all([
        fetchJSON(`${API_BASE}?op=get-mockup-defaults&product_key=${currentProductKey}`),
        fetchJSON(`${API_BASE}?op=get-product-config&owner_id=${currentOwnerId}&design_id=${currentDesignId}&product_key=${currentProductKey}`),
        fetchJSON(`${API_BASE}?op=get-product-templates&owner_id=${currentOwnerId}&product_key=${currentProductKey}`),
        fetchJSON(`${API_BASE}?op=get-product-pricing&product_key=${currentProductKey}&region_code=EU`),
        fetchJSON(`${API_BASE}?op=get-color-variants&product_key=${currentProductKey}&print_area_key=front`).catch(() => null),
      ]);

      systemDefaults = defaultsResp?.print_areas || [];
      activeConfig = configResp?.config || null;
      templates = templatesResp?.templates || [];
      pricingData = pricingResp;

      // Echte Mock-Fotos aus product_mockup_images haben Vorrang vor Farbüberlagerung/pre-rendered
      const hasRealMockImages = (systemDefaults || []).some(pa => pa.mockup_images_by_color && Object.keys(pa.mockup_images_by_color || {}).length > 0);

      preRenderedVariants = {};
      if (!hasRealMockImages && colorVariantsResp?.variants?.length > 0) {
        for (const v of colorVariantsResp.variants) {
          const h = (v.color_hex || '').toString().trim().toLowerCase().replace(/^#/, '');
          if (h) {
            preRenderedVariants[h] = v.url;
            preRenderedVariants['#' + h] = v.url;
          }
        }
        console.log(`[PDM] Loaded ${colorVariantsResp.variants.length} pre-rendered color variants`);
      } else if (hasRealMockImages) {
        console.log('[PDM] Using real mock images (product_mockup_images) instead of color overlay');
      }

      if (defaultsResp?.available_colors?.length > 0) availableColors = defaultsResp.available_colors;
      if (opts.availableColors?.length > 0) availableColors = opts.availableColors;
      favoriteMockupImageUrl = defaultsResp?.favorite_mockup_image_url || null;
      if (defaultsResp?.available_sizes?.length > 0) {
        availableSizes = defaultsResp.available_sizes.map(s =>
          typeof s === 'string' ? { title: s } : { option_value_id: s.option_value_id, title: s.title || String(s.option_value_id || '') }
        );
      }
      if (availableSizes.length === 0 && defaultsResp?.enabled_colors_sizes && typeof defaultsResp.enabled_colors_sizes === 'object') {
        const allSizes = new Set();
        for (const arr of Object.values(defaultsResp.enabled_colors_sizes)) {
          if (Array.isArray(arr)) arr.forEach(t => allSizes.add(String(t)));
        }
        availableSizes = [...allSizes].sort().map(t => ({ title: t }));
      }
      mockupDefaultsResp = defaultsResp;

      applyConfigOrDefaults();
      const areaKey = selectedAreaKey || 'front';
      if (!hasRealMockImages && areaKey !== 'front') {
        const resp = await fetchJSON(`${API_BASE}?op=get-color-variants&product_key=${currentProductKey}&print_area_key=${areaKey}`).catch(() => null);
        if (resp?.variants?.length > 0) {
          preRenderedVariants = {};
          for (const v of resp.variants) {
            const h = (v.color_hex || '').toString().trim().toLowerCase().replace(/^#/, '');
            if (h) { preRenderedVariants[h] = v.url; preRenderedVariants['#' + h] = v.url; }
          }
        }
      }
      renderTemplateDropdown();
      renderColorsTab();
      renderAreaTab();
      renderProfitTab();
      updatePreview();

      const i18n = window.CreatorI18n || {};
      const viewSingle = modal.querySelector('.pdm__view-toggle-btn[data-view="single"]');
      const viewGrid = modal.querySelector('.pdm__view-toggle-btn[data-view="grid"]');
      const saveBtn = modal.querySelector('.pdm__template-save-btn');
      const saveText = modal.querySelector('.pdm__template-save-text');
      const tplNameTitle = modal.querySelector('#pdm__template-name-title');
      const tplNameHint = modal.querySelector('#pdm__template-name-hint');
      const tplNameInput = modal.querySelector('#pdm__template-name-input');
      const tplNameCancel = modal.querySelector('#pdm__template-name-cancel');
      const tplNameSave = modal.querySelector('#pdm__template-name-save');
      if (viewSingle) { viewSingle.setAttribute('aria-label', i18n.pdmViewSingle || '1 grid'); viewSingle.setAttribute('title', i18n.pdmViewSingle || '1 grid'); }
      if (viewGrid) { viewGrid.setAttribute('aria-label', i18n.pdmViewMulti || 'Mehrfach grid'); viewGrid.setAttribute('title', i18n.pdmViewMulti || 'Mehrfach grid'); }
      const saveLabel = i18n.pdmSaveAsTemplate || 'Save as template';
      if (saveText) saveText.textContent = saveLabel;
      if (saveBtn) saveBtn.setAttribute('aria-label', saveLabel);
      if (tplNameTitle) tplNameTitle.textContent = i18n.pdmTemplateNameTitle || saveLabel;
      if (tplNameHint) tplNameHint.textContent = i18n.pdmTemplateNameHint || '';
      if (tplNameInput) tplNameInput.setAttribute('placeholder', i18n.pdmTemplateNamePlaceholder || '');
      if (tplNameCancel) tplNameCancel.textContent = i18n.pdmTemplateNameCancel || '';
      if (tplNameSave) tplNameSave.textContent = i18n.pdmTemplateNameSave || '';

      if (previewViewMode === 'grid') renderPreviewGrid();

      // Grid-Auswahl nur bei Color-Tab sichtbar (Initial: colors ist aktiv)
      const viewToggle = modal.querySelector('#pdmViewToggle');
      if (viewToggle) viewToggle.classList.add('is-visible');
    } catch (err) {
      console.error('[ProductDetailModal] Load error:', err);
    }
  }

  function close() {
    if (!isOpen) return;
    if (autosaveTimer) { clearTimeout(autosaveTimer); doAutosave(); }
    modal.classList.remove('pdm--visible', 'creator-modal--open');
    modal.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.body.style.overflow = '';
    closeAddSource();
    closeTemplateNameModal();

    // Clean up
    for (const ad of additionalDesigns) {
      if (ad.preview_url && typeof ad.preview_url === 'string' && ad.preview_url.startsWith('blob:')) {
        try { URL.revokeObjectURL(ad.preview_url); } catch (_) {}
      }
    }
    if (window.ClientColorize) window.ClientColorize.clearCache();
    if (canvasBaseBitmap) { try { canvasBaseBitmap.close(); } catch {} canvasBaseBitmap = null; }
    for (const bm of designBitmaps.values()) { try { bm.close(); } catch {} }
    designBitmaps.clear();
    if (canvasRAF) { cancelAnimationFrame(canvasRAF); canvasRAF = null; }
  }

  /** @returns {string} Normalized 6-digit hex without # for consistent lookup */
  function normHex(hex) {
    if (!hex) return '';
    let h = String(hex).trim().toLowerCase().replace(/^#/, '');
    if (h.length === 3 && /^[0-9a-f]{3}$/.test(h)) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    return h;
  }

  /** enabledColors aus enabledSizesByColor ableiten (nur Farben mit ≥1 Größe) */
  function syncEnabledColorsFromSizes() {
    enabledColors = new Set();
    for (const [normH, sizes] of enabledSizesByColor) {
      if (sizes && sizes.size > 0) {
        const c = availableColors.find(ac => normHex(ac.hex || ac) === normH);
        enabledColors.add(c?.hex || '#' + normH);
      }
    }
  }

  /** @returns {number} Summe aller Varianten (Farben × Größen) */
  function getTotalVariantCount() {
    let n = 0;
    for (const sizes of enabledSizesByColor.values()) {
      n += (sizes?.size || 0);
    }
    return n;
  }

  /** Größen-Titel als Set aus available_sizes */
  function getDefaultSizeTitles() {
    const defaultSizes = mockupDefaultsResp?.enabled_sizes;
    if (defaultSizes && Array.isArray(defaultSizes) && defaultSizes.length > 0) {
      return new Set(defaultSizes.map(s => typeof s === 'object' && s?.title ? s.title : String(s)));
    }
    if (availableSizes.length > 0) {
      return new Set(availableSizes.map(s => s.title));
    }
    return new Set();
  }

  // ─── Apply Config ──────────────────────────────────────────────
  function applyConfigOrDefaults() {
    enabledSizesByColor = new Map();

    if (activeConfig) {
      placements = activeConfig.placements_json || {};
      additionalDesigns = activeConfig.additional_designs_json || [];
      const cfgColors = activeConfig.enabled_colors_json || [];
      enabledColors = new Set(cfgColors);
      customProfitCents = activeConfig.custom_profit_cents || null;
      const sizesByColor = activeConfig.enabled_colors_sizes_json;
      if (sizesByColor && typeof sizesByColor === 'object') {
        for (const [hex, sizes] of Object.entries(sizesByColor)) {
          const h = normHex(hex);
          if (h && Array.isArray(sizes)) {
            enabledSizesByColor.set(h, new Set(sizes.map(String)));
          }
        }
      }
      if (enabledSizesByColor.size === 0 && cfgColors.length > 0) {
        const defaultSizes = getDefaultSizeTitles();
        for (const hex of cfgColors) {
          const h = normHex(hex);
          if (h) enabledSizesByColor.set(h, new Set(defaultSizes));
        }
      }
    } else {
      const defaultTpl = templates.find(t => t.is_default === 1);
      if (defaultTpl) {
        placements = defaultTpl.placements_json || {};
        const tplColors = defaultTpl.enabled_colors_json || [];
        enabledColors = new Set(tplColors);
        customProfitCents = defaultTpl.profit_cents || null;
        const sizesByColor = defaultTpl.enabled_colors_sizes_json;
        if (sizesByColor && typeof sizesByColor === 'object') {
          for (const [hex, sizes] of Object.entries(sizesByColor)) {
            const h = normHex(hex);
            if (h && Array.isArray(sizes)) enabledSizesByColor.set(h, new Set(sizes.map(String)));
          }
        }
        if (enabledSizesByColor.size === 0 && tplColors.length > 0) {
          const defaultSizes = getDefaultSizeTitles();
          for (const hex of tplColors) {
            const h = normHex(hex);
            if (h) enabledSizesByColor.set(h, new Set(defaultSizes));
          }
        }
      }
      if (!defaultTpl) {
        placements = {};
        if (systemDefaults.length > 0) {
          for (const area of systemDefaults) {
            const isFront = area.print_area_key === 'front';
            placements[area.print_area_key] = {
              designs: isFront
                ? [{
                    slot: 0, is_primary: true, design_id: null,
                    x: 0.5, y: 0.5, scale: 1.0, angle: 0,
                    crop: null, pattern: null,
                  }]
                : [],
            };
          }
        }
        const adminSizesByColor = mockupDefaultsResp?.enabled_colors_sizes;
        const defaultColors = mockupDefaultsResp?.enabled_colors;
        if (adminSizesByColor && typeof adminSizesByColor === 'object' && Object.keys(adminSizesByColor).length > 0) {
          for (const [hex, sizes] of Object.entries(adminSizesByColor)) {
            const h = normHex(hex);
            if (!h || !Array.isArray(sizes) || sizes.length === 0) continue;
            enabledSizesByColor.set(h, new Set(sizes.map(String)));
          }
          syncEnabledColorsFromSizes();
        } else if (defaultColors && Array.isArray(defaultColors) && defaultColors.length > 0) {
          const hexes = defaultColors.map(c => (typeof c === 'object' && c?.hex ? c.hex : String(c)));
          enabledColors = new Set(hexes);
          const defaultSizes = getDefaultSizeTitles();
          for (const hex of hexes) {
            const h = normHex(hex);
            if (h) enabledSizesByColor.set(h, new Set(defaultSizes));
          }
        } else {
          enabledColors = new Set();
        }
        customProfitCents = null;
      }
      additionalDesigns = [];
    }

    syncEnabledColorsFromSizes();
    if (enabledColors.size > 0) previewColorHex = [...enabledColors][0];
    else if (availableColors.length > 0) previewColorHex = availableColors[0].hex || '#FFFFFF';
    const areaKeys = Object.keys(placements);
    selectedAreaKey = areaKeys.includes('front') ? 'front' : (areaKeys[0] || 'front');
    selectedDesignIndex = 0;
    interactionMode = 'select';
    cropState = null;
  }

  // ─── Per-Variant Helpers ──────────────────────────────────────
  function getActiveDesigns() {
    if (!placements[selectedAreaKey]) {
      placements[selectedAreaKey] = { designs: [] };
    }
    const areaData = placements[selectedAreaKey];
    if (areaData.per_variant && previewColorHex) {
      const key = previewColorHex.toLowerCase();
      if (!areaData.variant_overrides) areaData.variant_overrides = {};
      if (!areaData.variant_overrides[key]) {
        areaData.variant_overrides[key] = {
          designs: JSON.parse(JSON.stringify(areaData.designs || []))
        };
      }
      return areaData.variant_overrides[key].designs;
    }
    return areaData.designs || [];
  }

  function onColorChange() {
    updatePreview();
    if (previewViewMode === 'grid') renderPreviewGrid();
    if (activeTab === 'area') {
      canvasBaseBitmap = null;
      const areaData = placements[selectedAreaKey];
      if (areaData?.per_variant) renderAreaTab();
      loadCanvasBase().then(() => redrawCanvas());
    }
  }

  function togglePerVariant() {
    if (!placements[selectedAreaKey]) {
      placements[selectedAreaKey] = { designs: [] };
    }
    const areaData = placements[selectedAreaKey];
    areaData.per_variant = !areaData.per_variant;
    if (areaData.per_variant) {
      const key = previewColorHex.toLowerCase();
      if (!areaData.variant_overrides) areaData.variant_overrides = {};
      if (!areaData.variant_overrides[key]) {
        areaData.variant_overrides[key] = {
          designs: JSON.parse(JSON.stringify(areaData.designs || []))
        };
      }
    }
    const btn = modal.querySelector('.pdm__variant-toggle');
    if (btn) btn.classList.toggle('pdm__variant-toggle--active', areaData.per_variant);
    renderAreaTab();
    loadDesignBitmaps().then(() => {
      scheduleRedraw();
      scheduleAutosave();
    });
  }

  // ─── Template Management ───────────────────────────────────────
  function renderTemplateDropdown() {
    templateSelect.innerHTML = '<option value="">Default settings</option>';
    for (const t of templates) {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = (t.is_default ? '\u2b50 ' : '') + t.name;
      templateSelect.appendChild(opt);
    }
    if (activeConfig?.template_id) templateSelect.value = activeConfig.template_id;
  }

  function onTemplateChange() {
    const templateId = templateSelect.value;
    if (!templateId) {
      applyConfigOrDefaults();
      renderColorsTab(); renderAreaTab(); renderProfitTab(); updatePreview();
      scheduleAutosave(); return;
    }
    const tpl = templates.find(t => String(t.id) === templateId);
    if (!tpl) return;
    placements = tpl.placements_json || {};
    enabledSizesByColor = new Map();
    const tplColors = tpl.enabled_colors_json || [];
    enabledColors = new Set(tplColors);
    const sizesByColor = tpl.enabled_colors_sizes_json;
    if (sizesByColor && typeof sizesByColor === 'object') {
      for (const [hex, sizes] of Object.entries(sizesByColor)) {
        const h = normHex(hex);
        if (h && Array.isArray(sizes)) enabledSizesByColor.set(h, new Set(sizes.map(String)));
      }
    }
    if (enabledSizesByColor.size === 0 && tplColors.length > 0) {
      const defaultSizes = getDefaultSizeTitles();
      for (const hex of tplColors) {
        const h = normHex(hex);
        if (h) enabledSizesByColor.set(h, new Set(defaultSizes));
      }
    }
    customProfitCents = tpl.profit_cents || null;
    additionalDesigns = [];
    syncEnabledColorsFromSizes();
    renderColorsTab(); renderAreaTab(); renderProfitTab(); updatePreview();
    scheduleAutosave();
  }

  function onReset() {
    onTemplateChange();
    if (activeTab === 'area') {
      canvasBaseBitmap = null;
      loadDesignBitmaps().then(() => loadCanvasBase().then(() => redrawCanvas()));
    }
  }

  async function onSaveTemplate() {
    openTemplateNameModal();
  }

  async function saveTemplateByName(rawName) {
    const name = String(rawName || '').trim();
    if (!name) return;
    try {
      const sizesByColorObj = {};
      for (const [hex, sizes] of enabledSizesByColor) {
        if (sizes && sizes.size > 0) {
          const c = availableColors.find(ac => normHex(ac.hex || ac) === hex);
          const dispHex = c?.hex || '#' + hex;
          sizesByColorObj[dispHex] = [...sizes];
        }
      }
      const resp = await fetchJSON(`${API_BASE}?op=save-product-template`, {
        method: 'POST',
        body: JSON.stringify({
          owner_id: currentOwnerId, product_key: currentProductKey, name,
          placements_json: placements, enabled_colors_json: [...enabledColors],
          enabled_colors_sizes_json: Object.keys(sizesByColorObj).length > 0 ? sizesByColorObj : null,
          profit_cents: customProfitCents,
        }),
      });
      if (resp.ok) {
        const tResp = await fetchJSON(`${API_BASE}?op=get-product-templates&owner_id=${currentOwnerId}&product_key=${currentProductKey}`);
        templates = tResp?.templates || [];
        renderTemplateDropdown();
        if (resp.id) templateSelect.value = resp.id;
      }
    } catch (err) { console.error('[PDM] Save template error:', err); }
  }

  function bindTemplateNameModalEvents() {
    const modalEl = modal.querySelector('#pdm__template-name-modal');
    const backdrop = modalEl?.querySelector('.pdm__size-modal-backdrop');
    const cancelBtn = modalEl?.querySelector('#pdm__template-name-cancel');
    const saveBtn = modalEl?.querySelector('#pdm__template-name-save');
    const input = modalEl?.querySelector('#pdm__template-name-input');
    if (!modalEl || !backdrop || !cancelBtn || !saveBtn || !input) return;

    backdrop.addEventListener('click', closeTemplateNameModal);
    cancelBtn.addEventListener('click', closeTemplateNameModal);
    saveBtn.addEventListener('click', async () => {
      const name = String(input.value || '').trim();
      if (!name) {
        input.focus();
        return;
      }
      closeTemplateNameModal();
      await saveTemplateByName(name);
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const name = String(input.value || '').trim();
        if (!name) return;
        closeTemplateNameModal();
        await saveTemplateByName(name);
      }
    });
  }

  function openTemplateNameModal() {
    const modalEl = modal.querySelector('#pdm__template-name-modal');
    const input = modalEl?.querySelector('#pdm__template-name-input');
    if (!modalEl || !input) return;
    const i18n = window.CreatorI18n || {};
    input.value = i18n.pdmTemplateNameDefault || '';
    modalEl.setAttribute('aria-hidden', 'false');
    modalEl.classList.add('pdm__size-modal--open');
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function closeTemplateNameModal() {
    const modalEl = modal.querySelector('#pdm__template-name-modal');
    if (!modalEl) return;
    modalEl.classList.remove('pdm__size-modal--open');
    modalEl.setAttribute('aria-hidden', 'true');
  }

  // ─── Tab Switching ─────────────────────────────────────────────
  function switchTab(tabKey) {
    const isAreaTab = tabKey === 'area';

    // Before leaving Print Area: flush any pending debounced redraw so preview stays in sync
    let didFlush = false;
    if (!isAreaTab) {
      didFlush = flushRedraw();
    }

    activeTab = tabKey;
    tabBtns.forEach(btn => btn.classList.toggle('pdm__tab-btn--active', btn.dataset.tab === tabKey));
    tabPanes.forEach(pane => pane.classList.toggle('pdm__tab-pane--active', pane.dataset.pane === tabKey));

    // Grid-Auswahl nur im Color selection Tab anzeigen
    const viewToggle = document.getElementById('pdmViewToggle');
    if (viewToggle) viewToggle.classList.toggle('is-visible', tabKey === 'colors');

    // Toggle canvas mode for Print Area tab
    previewEl.classList.toggle('pdm__preview--canvas-active', isAreaTab);

    if (isAreaTab && previewViewMode === 'grid') {
      previewViewMode = 'single';
      modal.querySelectorAll('.pdm__view-toggle-btn').forEach(b => b.classList.toggle('pdm__view-toggle-btn--active', b.dataset.view === 'single'));
      previewEl.classList.add('pdm__preview--single');
      previewEl.classList.remove('pdm__preview--grid');
    }

    const navPrev = modal.querySelector('.pdm__preview-nav--prev');
    const navNext = modal.querySelector('.pdm__preview-nav--next');
    if (isAreaTab) {
      // FIX: Inline display reset, damit CSS wieder korrekt greift
      previewCanvas.style.display = '';
      previewImg.style.display = '';
      previewEl.classList.remove('pdm__preview--area-fallback');
      if (navPrev) navPrev.title = 'Previous view';
      if (navNext) navNext.title = 'Next view';
      if (previewColorLabel) previewColorLabel.textContent = selectedAreaKey.charAt(0).toUpperCase() + selectedAreaKey.slice(1).replace(/_/g, ' ');
      canvasBaseBitmap = null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          loadCanvasBase().then(() => {
            redrawCanvas();
            if (canvasBaseBitmap) {
              setTimeout(() => redrawCanvas(), 100);
            } else {
              previewEl.classList.add('pdm__preview--area-fallback');
              updatePreview();
            }
          });
        });
      });
    } else {
      if (navPrev) navPrev.title = 'Previous color';
      if (navNext) navNext.title = 'Next color';
      const colorObj = availableColors.find(c => c.hex.toLowerCase() === previewColorHex.toLowerCase());
      if (previewColorLabel) previewColorLabel.textContent = colorObj?.name || previewColorHex;
      exitCropMode();
      hideCanvasLoadError();
      previewEl.classList.remove('pdm__preview--area-fallback');
      previewImg.style.display = '';
      previewCanvas.style.display = 'none';
      if (!didFlush && systemDefaults && systemDefaults.length > 0) {
        updatePreview();
      }
    }
  }

  // ─── Colors Tab ────────────────────────────────────────────────
  function renderColorsTab() {
    const grid = modal.querySelector('.pdm__colors-grid');
    grid.innerHTML = '';
    for (const c of availableColors) {
      const hex = c.hex || (typeof c === 'string' ? c : '');
      const h = normHex(hex);
      const sizes = enabledSizesByColor.get(h) || new Set();
      const sizeCount = sizes.size;
      const isActive = sizeCount > 0;

      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'pdm__color-dot';
      if (isActive) dot.classList.add('pdm__color-dot--active');
      else dot.classList.add('pdm__color-dot--disabled');
      dot.style.backgroundColor = hex;
      dot.title = (c.name || hex) + ' – Vorschau';
      if (isLightColor(hex)) {
        dot.style.border = isActive ? '2px solid #F59E0B' : '2px solid rgba(255,255,255,0.2)';
      }
      dot.dataset.hex = hex;

      const badge = document.createElement('span');
      badge.className = 'pdm__color-dot-badge';
      badge.textContent = sizeCount > 0 ? String(sizeCount) : '0';
      badge.title = (c.name || hex) + ' – ' + (window.CreatorI18n?.pdmSelectSizes || 'Größen auswählen');
      dot.appendChild(badge);

      dot.addEventListener('click', (e) => {
        if (e.target.closest('.pdm__color-dot-badge')) return;
        previewColorHex = hex;
        onColorChange();
      });
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        openSizeModal(c);
      });
      grid.appendChild(dot);
    }
    updateColorCount();
  }

  let sizeModalColor = null;

  function openSizeModal(colorObj) {
    const hex = colorObj?.hex || (typeof colorObj === 'string' ? colorObj : '');
    const h = normHex(hex);
    sizeModalColor = colorObj;

    const sizeModal = modal.querySelector('#pdm__size-modal');
    const backdrop = sizeModal?.querySelector('.pdm__size-modal-backdrop');
    const closeBtn = sizeModal?.querySelector('.pdm__size-modal-close');
    const titleEl = modal.querySelector('#pdm__size-modal-color-name');
    const listEl = modal.querySelector('#pdm__size-modal-list');
    const countEl = modal.querySelector('#pdm__size-modal-variant-count');
    const limitMsgEl = modal.querySelector('#pdm__size-modal-limit-msg');

    if (!sizeModal || !listEl) return;

    if (titleEl) titleEl.textContent = colorObj?.name || hex || 'Color';
    if (limitMsgEl) { limitMsgEl.textContent = ''; limitMsgEl.classList.remove('pdm__size-modal-limit-msg--visible'); }
    sizeModal.setAttribute('aria-hidden', 'false');
    sizeModal.classList.add('pdm__size-modal--open');

    const currentSizes = enabledSizesByColor.get(h) || new Set();
    const maxAllowed = 100;

    function showLimitMessage() {
      if (!limitMsgEl) return;
      const msg = window.CreatorI18n?.pdmMaxVariantsReached || 'Max. 100 variants selectable.';
      limitMsgEl.textContent = msg;
      limitMsgEl.classList.add('pdm__size-modal-limit-msg--visible');
      clearTimeout(showLimitMessage._t);
      showLimitMessage._t = setTimeout(() => {
        limitMsgEl.classList.remove('pdm__size-modal-limit-msg--visible');
        limitMsgEl.textContent = '';
      }, 3000);
    }

    listEl.innerHTML = '';
    for (const sz of availableSizes) {
      const title = sz.title || String(sz.option_value_id || '');
      const isChecked = currentSizes.has(title);
      const label = document.createElement('label');
      label.className = 'pdm__size-modal-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isChecked;
      cb.dataset.size = title;
      cb.addEventListener('change', () => {
        if (cb.checked) {
          const total = getTotalVariantCount();
          if (total >= maxAllowed) {
            cb.checked = false;
            showLimitMessage();
            return;
          }
          currentSizes.add(title);
        } else {
          currentSizes.delete(title);
        }
        enabledSizesByColor.set(h, new Set(currentSizes));
        syncEnabledColorsFromSizes();
        updateSizeModalCount(countEl);
        renderColorsTab();
        updateColorCount();
        previewColorHex = hex;
        onColorChange();
        scheduleAutosave();
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + title));
      listEl.appendChild(label);
    }

    function updateSizeModalCount(el) {
      if (el) el.textContent = String(getTotalVariantCount());
    }
    updateSizeModalCount(countEl);

    const close = () => {
      sizeModal.setAttribute('aria-hidden', 'true');
      sizeModal.classList.remove('pdm__size-modal--open');
      if (limitMsgEl) { limitMsgEl.textContent = ''; limitMsgEl.classList.remove('pdm__size-modal-limit-msg--visible'); }
    };
    if (backdrop) backdrop.addEventListener('click', close, { once: true });
    if (closeBtn) closeBtn.addEventListener('click', close, { once: true });
  }

  function updateColorCount() {
    const total = getTotalVariantCount();
    if (colorCountEl) colorCountEl.textContent = `${enabledColors.size} of ${availableColors.length} colors active, ${total} variants`;
  }

  function cycleColor(direction) {
    if (availableColors.length === 0) return;
    const idx = availableColors.findIndex(c => c.hex === previewColorHex);
    previewColorHex = availableColors[(idx + direction + availableColors.length) % availableColors.length].hex;
    onColorChange();
  }

  async function cycleArea(direction) {
    const areas = systemDefaults.length > 0
      ? systemDefaults.map(d => d.print_area_key)
      : Object.keys(placements).length > 0 ? Object.keys(placements) : ['front'];
    if (areas.length === 0) return;
    const idx = areas.indexOf(selectedAreaKey);
    const nextIdx = (idx + direction + areas.length) % areas.length;
    selectedAreaKey = areas[nextIdx];
    const areaSelect = modal.querySelector('.pdm__area-select');
    if (areaSelect) areaSelect.value = selectedAreaKey;
    selectedDesignIndex = 0;
    canvasBaseBitmap = null;
    renderAreaTab();
    await loadColorVariantsForArea(selectedAreaKey);
    loadCanvasBase().then(() => redrawCanvas());
    if (previewColorLabel) previewColorLabel.textContent = selectedAreaKey.charAt(0).toUpperCase() + selectedAreaKey.slice(1).replace(/_/g, ' ');
  }

  // ─── Print Area Tab (Accordion UI) ────────────────────────────
  function renderAreaTab() {
    if (!areaAccordions) return;
    areaAccordions.innerHTML = '';

    // Populate area select
    const areaSelect = modal.querySelector('.pdm__area-select');
    if (areaSelect) {
      areaSelect.innerHTML = '';
      const areas = systemDefaults.length > 0
        ? systemDefaults.map(d => d.print_area_key)
        : Object.keys(placements).length > 0 ? Object.keys(placements) : ['front'];
      for (const key of areas) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key.charAt(0).toUpperCase() + key.slice(1);
        areaSelect.appendChild(opt);
      }
      areaSelect.value = selectedAreaKey;
    }

    const designs = getActiveDesigns();

    // Update variant toggle state
    const variantToggle = modal.querySelector('.pdm__variant-toggle');
    const areaData = placements[selectedAreaKey];
    if (variantToggle && areaData) {
      variantToggle.classList.toggle('pdm__variant-toggle--active', !!areaData.per_variant);
    }

    for (let i = 0; i < designs.length; i++) {
      const d = designs[i];
      // Design accordion
      areaAccordions.appendChild(buildDesignAccordion(d, i, designs));
      // Pattern accordion (always rendered, toggle inside)
      areaAccordions.appendChild(buildPatternAccordion(d, i));
    }
  }

  function buildDesignAccordion(design, index, designs) {
    const isMain = design.is_primary;
    const acc = document.createElement('div');
    const openIndex = designs.length > 0 ? Math.min(selectedDesignIndex, designs.length - 1) : 0;
    acc.className = 'pdm__accordion' + (index === openIndex ? ' pdm__accordion--open' : '');
    acc.dataset.designIndex = index;

    // Header
    const header = document.createElement('div');
    header.className = 'pdm__accordion-header';

    const chevron = document.createElement('span');
    chevron.className = 'pdm__accordion-chevron';
    chevron.textContent = '\u25b6';
    header.appendChild(chevron);

    const thumb = document.createElement('img');
    thumb.className = 'pdm__design-thumb';
    thumb.src = design.design_id ? (getDesignPreviewUrl(design.design_id) || '') : (currentDesignUrl || '');
    thumb.alt = '';
    thumb.style.width = '28px'; thumb.style.height = '28px'; thumb.style.borderRadius = '4px'; thumb.style.objectFit = 'cover';
    header.appendChild(thumb);

    const title = document.createElement('span');
    title.className = 'pdm__accordion-title';
    title.textContent = isMain ? 'Haupt-Design' : `Design ${index + 1}`;
    header.appendChild(title);

    if (!isMain) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'pdm__design-remove';
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const designId = design.design_id;
        designs.splice(index, 1);
        if (designId) {
          const ad = additionalDesigns.find(d => d.design_id === designId);
          if (ad?.preview_url && typeof ad.preview_url === 'string' && ad.preview_url.startsWith('blob:')) {
            try { URL.revokeObjectURL(ad.preview_url); } catch (_) {}
          }
          additionalDesigns = additionalDesigns.filter(d => d.design_id !== designId);
        }
        designs.forEach((dd, ii) => { dd.slot = ii; });
        selectedDesignIndex = 0;
        renderAreaTab();
        loadDesignBitmaps().then(() => {
          scheduleRedraw();
          scheduleAutosave();
        });
      });
      header.appendChild(removeBtn);
    }

    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('pdm__design-remove')) return;
      acc.classList.toggle('pdm__accordion--open');
      selectedDesignIndex = index;
      redrawCanvas();
    });

    acc.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'pdm__accordion-body';
    const inner = document.createElement('div');
    inner.className = 'pdm__accordion-body-inner';

    // X position
    inner.appendChild(buildSliderWithInput('X Position', 'x', design.x ?? 0.5, 0, 1, 0.01, (val) => {
      design.x = val;
      scheduleRedraw(); scheduleAutosave();
    }));

    // Y position
    inner.appendChild(buildSliderWithInput('Y Position', 'y', design.y ?? 0.5, 0, 1, 0.01, (val) => {
      design.y = val;
      scheduleRedraw(); scheduleAutosave();
    }));

    // Scale slider
    inner.appendChild(buildSliderWithInput('Skalierung', 'scale', design.scale ?? 1.0, 0.05, 1.5, 0.01, (val) => {
      design.scale = val;
      scheduleRedraw(); scheduleAutosave();
    }));

    // Rotation slider
    inner.appendChild(buildSliderWithInput('Rotation', 'angle', design.angle ?? 0, -180, 180, 1, (val) => {
      design.angle = val;
      scheduleRedraw(); scheduleAutosave();
    }, true));

    // Hint
    const hint = document.createElement('div');
    hint.className = 'pdm__hint';
    hint.textContent = 'Position: Design auf dem Mockup ziehen';
    inner.appendChild(hint);

    body.appendChild(inner);
    acc.appendChild(body);

    return acc;
  }

  function buildPatternAccordion(design, index) {
    const pat = design.pattern || { enabled: false, mode: 'grid', spacingH: 0, spacingV: 0, angle: 0, offsetH: 0, rotationStepH: 0, rotationStepV: 0 };
    if (!design.pattern) design.pattern = pat;

    const acc = document.createElement('div');
    acc.className = 'pdm__accordion' + (pat.enabled ? ' pdm__accordion--open' : '');
    acc.dataset.patternIndex = index;

    // Header
    const header = document.createElement('div');
    header.className = 'pdm__accordion-header';
    const chevron = document.createElement('span');
    chevron.className = 'pdm__accordion-chevron';
    chevron.textContent = '\u25b6';
    header.appendChild(chevron);
    const title = document.createElement('span');
    title.className = 'pdm__accordion-title';
    title.textContent = 'Pattern';
    header.appendChild(title);
    header.addEventListener('click', () => acc.classList.toggle('pdm__accordion--open'));
    acc.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'pdm__accordion-body';
    const inner = document.createElement('div');
    inner.className = 'pdm__accordion-body-inner';

    // Toggle
    const toggleRow = document.createElement('div');
    toggleRow.className = 'pdm__pattern-toggle-row';
    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'pdm__pattern-toggle-label';
    toggleLabel.textContent = 'Create Pattern';
    toggleRow.appendChild(toggleLabel);
    const toggle = document.createElement('button');
    toggle.className = 'pdm__toggle' + (pat.enabled ? ' pdm__toggle--active' : '');
    toggle.addEventListener('click', () => {
      pat.enabled = !pat.enabled;
      toggle.classList.toggle('pdm__toggle--active', pat.enabled);
      if (pat.enabled) acc.classList.add('pdm__accordion--open');
      scheduleRedraw(); scheduleAutosave();
    });
    toggleRow.appendChild(toggle);
    inner.appendChild(toggleRow);

    // Mode buttons
    const modes = document.createElement('div');
    modes.className = 'pdm__pattern-modes';
    for (const [key, label] of [['grid', 'Grid'], ['brick_horizontal', 'Brick H'], ['brick_vertical', 'Brick V']]) {
      const btn = document.createElement('button');
      btn.className = 'pdm__pattern-mode-btn' + (pat.mode === key ? ' pdm__pattern-mode-btn--active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        pat.mode = key;
        modes.querySelectorAll('.pdm__pattern-mode-btn').forEach(b => b.classList.remove('pdm__pattern-mode-btn--active'));
        btn.classList.add('pdm__pattern-mode-btn--active');
        scheduleRedraw(); scheduleAutosave();
      });
      modes.appendChild(btn);
    }
    inner.appendChild(modes);

    // Pattern sliders
    inner.appendChild(buildSliderWithInput('Horizontal Spacing', 'spacingH', pat.spacingH, 0, 200, 1, (v) => { pat.spacingH = v; scheduleRedraw(); scheduleAutosave(); }, false, '%'));
    inner.appendChild(buildSliderWithInput('Vertical Spacing', 'spacingV', pat.spacingV, 0, 200, 1, (v) => { pat.spacingV = v; scheduleRedraw(); scheduleAutosave(); }, false, '%'));
    inner.appendChild(buildSliderWithInput('Angle', 'patAngle', pat.angle, 0, 360, 1, (v) => { pat.angle = v; scheduleRedraw(); scheduleAutosave(); }, true));
    inner.appendChild(buildSliderWithInput('Horizontal Offset', 'offsetH', pat.offsetH, 0, 100, 1, (v) => { pat.offsetH = v; scheduleRedraw(); scheduleAutosave(); }, false, '%'));
    inner.appendChild(buildSliderWithInput('Rotation H Step', 'rotH', pat.rotationStepH, -180, 180, 1, (v) => { pat.rotationStepH = v; scheduleRedraw(); scheduleAutosave(); }, true));
    inner.appendChild(buildSliderWithInput('Rotation V Step', 'rotV', pat.rotationStepV, -180, 180, 1, (v) => { pat.rotationStepV = v; scheduleRedraw(); scheduleAutosave(); }, true));

    body.appendChild(inner);
    acc.appendChild(body);
    return acc;
  }

  function buildSliderWithInput(label, key, value, min, max, step, onChange, isDeg, suffix) {
    const group = document.createElement('div');
    group.className = 'pdm__slider-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'pdm__slider-label';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    labelRow.appendChild(labelSpan);

    const inputWrap = document.createElement('span');
    inputWrap.className = 'pdm__slider-input-wrap';
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'pdm__slider-num-input';
    numInput.min = min;
    numInput.max = max;
    numInput.step = step;
    numInput.value = isDeg ? Math.round(value) : suffix ? Math.round(value) : Number(value).toFixed(2);
    inputWrap.appendChild(numInput);
    if (suffix) {
      const suffixSpan = document.createElement('span');
      suffixSpan.className = 'pdm__slider-suffix';
      suffixSpan.textContent = suffix;
      inputWrap.appendChild(suffixSpan);
    } else if (isDeg) {
      const degSpan = document.createElement('span');
      degSpan.className = 'pdm__slider-suffix';
      degSpan.textContent = '\u00b0';
      inputWrap.appendChild(degSpan);
    }
    labelRow.appendChild(inputWrap);
    group.appendChild(labelRow);

    const rangeInput = document.createElement('input');
    rangeInput.type = 'range';
    rangeInput.className = 'pdm__slider';
    rangeInput.min = min;
    rangeInput.max = max;
    rangeInput.step = step;
    rangeInput.value = value;
    group.appendChild(rangeInput);

    function syncFromRange() {
      const v = parseFloat(rangeInput.value);
      numInput.value = isDeg ? Math.round(v) : suffix ? Math.round(v) : Number(v).toFixed(2);
      onChange(v);
    }

    function syncFromNum() {
      let v = parseFloat(numInput.value);
      if (Number.isNaN(v)) v = value;
      v = Math.min(max, Math.max(min, v));
      rangeInput.value = v;
      numInput.value = isDeg ? Math.round(v) : suffix ? Math.round(v) : Number(v).toFixed(2);
      onChange(v);
    }

    rangeInput.addEventListener('input', syncFromRange);
    bindSliderTouchScroll(rangeInput);
    numInput.addEventListener('change', syncFromNum);
    numInput.addEventListener('blur', syncFromNum);

    return group;
  }

  function bindSliderTouchScroll(rangeInput) {
    if (!rangeInput || rangeInput.dataset.touchScrollBound === '1') return;
    rangeInput.dataset.touchScrollBound = '1';
    let startX = 0;
    let startY = 0;
    let startScrollTop = 0;
    let intent = null; // null | 'scroll' | 'slider'
    /** @type {HTMLElement|null} */
    let scrollContainer = null;

    rangeInput.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      intent = null;
      scrollContainer = rangeInput.closest('.pdm__tab-content');
      startScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    }, { passive: true });

    rangeInput.addEventListener('touchmove', (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (intent === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        intent = Math.abs(dy) > Math.abs(dx) ? 'scroll' : 'slider';
      }
      if (intent === 'scroll' && scrollContainer) {
        // Keep vertical swipe smooth while finger is over range input.
        scrollContainer.scrollTop = startScrollTop - dy;
        e.preventDefault();
      }
    }, { passive: false });

    function resetTouchIntent() {
      intent = null;
      scrollContainer = null;
    }
    rangeInput.addEventListener('touchend', resetTouchIntent, { passive: true });
    rangeInput.addEventListener('touchcancel', resetTouchIntent, { passive: true });
  }

  function onAddDesignClick() {
    const addSource = modal.querySelector('.pdm__add-source');
    if (addSource) {
      addSource.classList.add('pdm__add-source--visible');
      addSource.setAttribute('aria-hidden', 'false');
    }
  }

  function closeAddSource() {
    const addSource = modal.querySelector('.pdm__add-source');
    if (addSource) {
      addSource.classList.remove('pdm__add-source--visible');
      addSource.setAttribute('aria-hidden', 'true');
    }
  }

  function bindAddSourceEvents() {
    const addSource = modal.querySelector('.pdm__add-source');
    if (!addSource) return;

    const backdrop = addSource.querySelector('.pdm__add-source-backdrop');
    const opts = addSource.querySelectorAll('.pdm__add-source-opt:not([disabled])');
    const fileInput = addSource.querySelector('.pdm__add-source-file');

    if (backdrop) backdrop.addEventListener('click', closeAddSource);

    opts.forEach(opt => {
      opt.addEventListener('click', () => {
        const source = opt.dataset.source;
        if (source === 'upload') {
          closeAddSource();
          if (fileInput) {
            fileInput.value = '';
            fileInput.click();
          }
        } else if (source === 'my-designs') {
          closeAddSource();
          openMyDesignsPicker();
        } else if (source === 'canvas') {
          closeAddSource();
          openCanvasEditor();
        }
      });
    });

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const maxSize = 30 * 1024 * 1024;
        if (file.size > maxSize) {
          alert('The file is too large. Maximum size: 30MB');
          return;
        }
        const allowed = ['image/png', 'image/jpeg', 'image/svg+xml'];
        if (!allowed.includes(file.type)) {
          alert('Invalid file type. Allowed: PNG, JPG, SVG');
          return;
        }
        const objectUrl = URL.createObjectURL(file);
        addDesignFromUpload(objectUrl);
      });
    }
  }

  function addDesignFromUpload(previewUrl) {
    const uploadId = 'upload-' + Date.now();
    const designs = getActiveDesigns();
    designs.push({
      slot: designs.length, is_primary: false, design_id: uploadId,
      x: 0.5, y: 0.5, scale: 0.5, angle: 0, crop: null, pattern: null,
    });
    additionalDesigns.push({ design_id: uploadId, preview_url: previewUrl });
    renderAreaTab();
    loadDesignBitmaps().then(() => {
      scheduleRedraw();
      scheduleAutosave();
    });
  }

  async function openCanvasEditor() {
    if (!window.CanvasEditorModal || typeof window.CanvasEditorModal.open !== 'function') {
      console.warn('[PDM] CanvasEditorModal not available');
      return;
    }
    if (!canvasBaseBitmap) await loadCanvasBase();
    const activeDesigns = getActiveDesigns();
      const designsForCanvas = activeDesigns.map(d => {
        const url = d.is_primary
          ? (currentDesignUrl ? toRelPath(currentDesignUrl) : null)
          : getDesignPreviewUrl(d.design_id);
        return { ...d, bitmap: url ? designBitmaps.get(url) : null };
      });
      const areaDefault = (systemDefaults || []).find(d => d.print_area_key === selectedAreaKey)
        || (systemDefaults || []).find(d => (d.print_area_key || '').toLowerCase() === (selectedAreaKey || 'front').toLowerCase());
      const useTemplateRect = !!areaDefault?.has_print_area_in_image;
      const rect = useTemplateRect ? areaDefault?.print_area_rect : (areaDefault?.mockup_print_area_rect || areaDefault?.print_area_rect);
      let printAreaRect = rect
        ? { ...rect }
        : areaDefault
          ? { x: areaDefault.placement?.x ?? 0.5, y: areaDefault.placement?.y ?? 0.5, w: areaDefault.placement?.scale ?? 0.5, h: areaDefault.placement?.scale ?? 0.5 }
          : { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
      if (printAreaRect.h == null || typeof printAreaRect.h !== 'number') {
        printAreaRect = { ...printAreaRect, h: printAreaRect.w ?? 0.5 };
      }
      const useFullImageForCanvas = areaDefault?.has_print_area_in_image && !areaDefault?.has_print_area_rect;
      window.CanvasEditorModal.open({
        ownerId: currentOwnerId,
        productKey: currentProductKey,
        selectedAreaKey,
        canvasBaseBitmap,
        designs: designsForCanvas,
        printAreaRect,
        printifyDimensions: areaDefault?.printify_dimensions || null,
        useFullImageAsPrintArea: useFullImageForCanvas,
        variantColors: availableColors || [],
        onSave: (design) => {
          const designs = getActiveDesigns();
          designs.push({
            slot: designs.length, is_primary: false, design_id: design.id,
            x: 0.5, y: 0.5, scale: 0.5, angle: 0, crop: null, pattern: null,
          });
          additionalDesigns.push({ design_id: design.id, preview_url: design.preview_url });
          renderAreaTab();
          loadDesignBitmaps().then(() => {
            scheduleRedraw();
            scheduleAutosave();
          });
        },
      });
  }

  function openMyDesignsPicker() {
    if (window.DesignPickerModal && typeof window.DesignPickerModal.open === 'function') {
      window.DesignPickerModal.open({
        ownerId: currentOwnerId,
        onSelect: (design) => {
          const designs = getActiveDesigns();
          designs.push({
            slot: designs.length, is_primary: false, design_id: design.id,
            x: 0.5, y: 0.5, scale: 0.5, angle: 0, crop: null, pattern: null,
          });
          additionalDesigns.push({ design_id: design.id, preview_url: design.preview_url });
          renderAreaTab();
          loadDesignBitmaps().then(() => {
            scheduleRedraw();
            scheduleAutosave();
          });
        },
      });
    } else {
      console.warn('[PDM] DesignPickerModal not available');
    }
  }

  // ─── Profit Tab ────────────────────────────────────────────────
  function renderProfitTab() {
    if (!pricingData || !pricingData.ok) return;
    const currency = pricingData.currency || 'EUR';
    const sharePercent = pricingData.creator_share_percent ?? 40;
    modal.querySelectorAll('.pdm__profit-currency').forEach(el => el.textContent = currency);
    const shareHint = modal.querySelector('[data-pdm-creator-share-hint]');
    if (shareHint) {
      shareHint.textContent = (window.CreatorI18n?.creatorShareHint || '%p% your share of net profit').replace('%p%', sharePercent);
    }
    if (baseCostEl) baseCostEl.textContent = formatCents(pricingData.base_cost_cents, currency);
    if (profitInput) {
      profitInput.value = ((customProfitCents || pricingData.defaults.creator_profit_cents) / 100).toFixed(2);
      recalcProfit();
    }
  }

  function onProfitChange() { scheduleRecalcProfit(); scheduleAutosave(); }

  function recalcProfit() {
    if (!pricingData || !profitInput) return;
    const inputVal = parseFloat(profitInput.value);
    if (isNaN(inputVal) || inputVal < 0) {
      if (profitErrorEl) { profitErrorEl.style.display = 'block'; profitErrorEl.textContent = 'Please enter a valid amount'; }
      return;
    }
    const creatorProfitCents = Math.round(inputVal * 100);
    const minProfit = pricingData.min_profit_cents || 100;
    if (creatorProfitCents < minProfit) {
      if (profitErrorEl) { profitErrorEl.style.display = 'block'; profitErrorEl.textContent = `Minimum profit: ${formatCents(minProfit, pricingData.currency)}`; }
      return;
    }
    if (profitErrorEl) profitErrorEl.style.display = 'none';
    const sharePercent = pricingData.creator_share_percent || 40;
    const baseCost = pricingData.base_cost_cents;
    const baseCostMin = pricingData.base_cost_min_cents ?? baseCost;
    const baseCostMax = pricingData.base_cost_max_cents ?? baseCost;
    const netProfit = Math.round(creatorProfitCents / (sharePercent / 100));
    const sellPrice = baseCost + netProfit;
    const sellPriceMin = baseCostMin + netProfit;
    const sellPriceMax = baseCostMax + netProfit;
    const eazpireProfit = netProfit - creatorProfitCents;
    const cur = pricingData.currency || 'EUR';
    if (netProfitEl) netProfitEl.textContent = formatCents(netProfit, cur);
    if (eazpireProfitEl) eazpireProfitEl.textContent = formatCents(eazpireProfit, cur);
    const i18n = window.CreatorI18n || {};
    const fromToSep = i18n.pdmSalePriceFromToSep || ' \u2013 '; // " – " between min and max
    if (sellPriceEl) {
      if (baseCostMin < baseCostMax) {
        sellPriceEl.textContent = formatCents(sellPriceMin, cur) + fromToSep + formatCents(sellPriceMax, cur);
      } else {
        sellPriceEl.textContent = formatCents(sellPrice, cur);
      }
    }
    customProfitCents = creatorProfitCents;
  }

  // ─── Print Area Adjust Mode ────────────────────────────────────
  // ─── Canvas: Base Image Loading ────────────────────────────────
  function showCanvasLoadError(msg) {
    if (!previewEl) return;
    let errEl = previewEl.querySelector('.pdm__canvas-load-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'pdm__canvas-load-error';
      previewEl.appendChild(errEl);
    }
    errEl.textContent = msg || 'Could not load print area image';
    errEl.style.display = 'flex';
  }

  function hideCanvasLoadError() {
    const errEl = previewEl?.querySelector('.pdm__canvas-load-error');
    if (errEl) errEl.style.display = 'none';
  }

  async function loadColorVariantsForArea(printAreaKey) {
    if (!currentProductKey) return;
    const hasReal = (systemDefaults || []).some(pa => pa.mockup_images_by_color && Object.keys(pa.mockup_images_by_color || {}).length > 0);
    if (hasReal) return; // Echte Mock-Fotos verwenden, keine Farbüberlagerung
    try {
      const resp = await fetchJSON(`${API_BASE}?op=get-color-variants&product_key=${currentProductKey}&print_area_key=${printAreaKey || 'front'}`);
      if (resp?.variants?.length > 0) {
        const next = {};
        for (const v of resp.variants) {
          const h = (v.color_hex || '').toString().trim().toLowerCase().replace(/^#/, '');
          if (h) { next[h] = v.url; next['#' + h] = v.url; }
        }
        preRenderedVariants = next;
      }
    } catch (_) {}
  }

  async function loadCanvasBase() {
    if (canvasBaseBitmap) return;
    hideCanvasLoadError();
    let areaDefault = (systemDefaults || []).find(d => d.print_area_key === selectedAreaKey)
      || (systemDefaults || []).find(d => (d.print_area_key || '').toLowerCase() === (selectedAreaKey || 'front').toLowerCase());
    if (!areaDefault && (systemDefaults || []).length > 0) {
      areaDefault = systemDefaults[0];
    }

    if (!areaDefault) {
      showCanvasLoadError('No print area data for this product.');
      await loadDesignBitmaps();
      return;
    }

    // Exakt wie Admin Print Area Edit Mode: admin-print-area-panel.js renderEdit()
    const r2Key = areaDefault.print_area_template_r2_key || areaDefault.template_r2_key;
    const origin = (() => {
      try { return new URL(API_BASE).origin; } catch (e) { return 'https://creator-engine.eazpire.workers.dev'; }
    })();
    const imgUrl = r2Key ? (origin + '/mockup/' + encodeURIComponent(r2Key)) : '';

    if (!imgUrl) {
      showCanvasLoadError('No print area image for this view.');
      await loadDesignBitmaps();
      return;
    }

    await new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            createImageBitmap(c).then((bm) => {
              canvasBaseBitmap = bm;
              resolve();
            }).catch(() => {
              canvasBaseBitmap = img;
              resolve();
            });
          } else {
            canvasBaseBitmap = img;
            resolve();
          }
        } catch (_) {
          canvasBaseBitmap = img;
          resolve();
        }
      };
      img.onerror = () => {
        showCanvasLoadError('Could not load print area image.');
        resolve();
      };
      img.src = imgUrl;
    });

    await loadDesignBitmaps();
  }

  async function loadDesignBitmaps() {
    const designs = getActiveDesigns();

    for (const d of designs) {
      const url = d.is_primary
        ? (currentDesignUrl ? toRelPath(currentDesignUrl) : null)
        : getDesignPreviewUrl(d.design_id);
      if (url && !designBitmaps.has(url)) {
        try {
          const bitmap = await window.ClientColorize.loadBitmap(url);
          designBitmaps.set(url, bitmap);
        } catch (err) {
          console.warn('[PDM] Failed to load design bitmap:', url, err);
        }
      }
    }
  }

  // ─── Canvas: Render ────────────────────────────────────────────
  function redrawCanvas() {
    if (!isOpen || activeTab !== 'area') return;
    if (canvasBaseBitmap && window.ClientColorize) {
      hideCanvasLoadError();
      previewEl.classList.remove('pdm__preview--area-fallback');
    }
    if (!canvasBaseBitmap || !window.ClientColorize) return;

    const areaDefault = (systemDefaults || []).find(d => d.print_area_key === selectedAreaKey)
      || (systemDefaults || []).find(d => (d.print_area_key || '').toLowerCase() === (selectedAreaKey || 'front').toLowerCase());
    // Print-Area-Template: use print_area_rect (admin-configured). Mockup: mockup_print_area_rect.
    const useTemplateRect = !!areaDefault?.has_print_area_in_image;
    const rect = useTemplateRect ? areaDefault?.print_area_rect : (areaDefault?.mockup_print_area_rect || areaDefault?.print_area_rect);
    let printAreaRect = rect
      ? { ...rect }
      : { x: areaDefault?.placement?.x ?? 0.5, y: areaDefault?.placement?.y ?? 0.5, w: areaDefault?.placement?.scale ?? 0.5, h: areaDefault?.placement?.scale ?? 0.5 };
    if (printAreaRect.h == null || typeof printAreaRect.h !== 'number') {
      printAreaRect = { ...printAreaRect, h: printAreaRect.w ?? 0.5 };
    }
    // When admin set print_area_rect in DB: use it. Else: full image (backwards compat)
    const useFullImage = areaDefault?.has_print_area_in_image && !areaDefault?.has_print_area_rect;

    const activeDesigns = getActiveDesigns();
    const primaryDesign = activeDesigns.find(d => d.is_primary) || activeDesigns[0] || null;
    const designs = activeDesigns.map(d => {
      const url = d.is_primary
        ? (currentDesignUrl ? toRelPath(currentDesignUrl) : null)
        : getDesignPreviewUrl(d.design_id);
      return { ...d, bitmap: url ? designBitmaps.get(url) : null };
    });

    window.ClientColorize.renderToCanvas(previewCanvas, {
      baseBitmap: canvasBaseBitmap,
      designs,
      printAreaRect,
      printifyDimensions: areaDefault?.printify_dimensions || null,
      showPrintArea: !areaDefault?.has_print_area_in_image,
      useFullImageAsPrintArea: useFullImage,
      selectedDesignIndex,
      interactionMode,
      cropState,
    });

    updatePlacementDebugOverlay({
      source: 'canvas',
      tab: activeTab,
      areaKey: selectedAreaKey,
      colorHex: previewColorHex,
      rect: {
        x: roundDbg(printAreaRect?.x),
        y: roundDbg(printAreaRect?.y),
        w: roundDbg(printAreaRect?.w),
        h: roundDbg(printAreaRect?.h),
      },
      design: {
        x: roundDbg(primaryDesign?.x ?? 0.5),
        y: roundDbg(primaryDesign?.y ?? 0.5),
        scale: roundDbg(primaryDesign?.scale ?? 1),
        angle: roundDbg(primaryDesign?.angle ?? 0),
      }
    });
  }

  // ─── Canvas: Interaction ───────────────────────────────────────
  function onCanvasMouseDown(e) {
    if (interactionMode === 'crop') {
      // Crop mode: handle edge/corner/body dragging
      const designObj = getCropDesignObj();
      if (!designObj) return;
      const pa = previewCanvas._renderInfo?.pa;
      if (!pa) return;
      const handle = window.ClientColorize.hitTestCrop(previewCanvas, e.clientX, e.clientY, designObj, pa, cropState);
      if (handle) {
        cropDragHandle = handle;
        cropDragStartState = { ...cropState };
        cropDragStartNorm = window.ClientColorize.clientToDesignNormalized(previewCanvas, e.clientX, e.clientY, designObj, pa);
        isDragging = true;
        previewCanvas.style.cursor = getCropCursor(handle);
      }
      return;
    }
    const hit = window.ClientColorize.hitTest(previewCanvas, e.clientX, e.clientY);
    if (hit) {
      if (hit.handleType === 'crop') {
        selectedDesignIndex = hit.designIndex;
        redrawCanvas();
        enterCropMode();
        return;
      }
      selectedDesignIndex = hit.designIndex;
      interactionMode = hit.handleType || 'move';
      isDragging = true;

      const designs = getActiveDesigns();
      const d = designs[selectedDesignIndex];
      if (d) {
        dragStartDesign = { x: d.x ?? 0.5, y: d.y ?? 0.5, scale: d.scale ?? 1.0, angle: d.angle ?? 0 };
        dragStartPos = window.ClientColorize.clientToPrintAreaCoords(previewCanvas, e.clientX, e.clientY);
      }
      previewCanvas.style.cursor = interactionMode === 'rotate' ? 'crosshair' : 'grabbing';
      highlightAccordion(selectedDesignIndex);
    } else {
      selectedDesignIndex = -1;
    }
    redrawCanvas();
  }

  function onCanvasMouseMove(e) {
    if (interactionMode === 'crop' && isDragging && cropDragHandle) {
      const designObj = getCropDesignObj();
      if (!designObj) return;
      const pa = previewCanvas._renderInfo?.pa;
      if (!pa) return;
      const current = window.ClientColorize.clientToDesignNormalized(previewCanvas, e.clientX, e.clientY, designObj, pa);
      const dx = current.x - cropDragStartNorm.x;
      const dy = current.y - cropDragStartNorm.y;
      const s = cropDragStartState;
      const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

      switch (cropDragHandle) {
        case 'body':
          cropState.x = clamp(s.x + dx, 0, 1 - s.width);
          cropState.y = clamp(s.y + dy, 0, 1 - s.height);
          break;
        case 'top':
          cropState.y = clamp(s.y + dy, 0, s.y + s.height - 0.05);
          cropState.height = s.height - (cropState.y - s.y);
          break;
        case 'bottom':
          cropState.height = clamp(s.height + dy, 0.05, 1 - s.y);
          break;
        case 'left':
          cropState.x = clamp(s.x + dx, 0, s.x + s.width - 0.05);
          cropState.width = s.width - (cropState.x - s.x);
          break;
        case 'right':
          cropState.width = clamp(s.width + dx, 0.05, 1 - s.x);
          break;
        case 'tl':
          cropState.x = clamp(s.x + dx, 0, s.x + s.width - 0.05);
          cropState.y = clamp(s.y + dy, 0, s.y + s.height - 0.05);
          cropState.width = s.width - (cropState.x - s.x);
          cropState.height = s.height - (cropState.y - s.y);
          break;
        case 'tr':
          cropState.width = clamp(s.width + dx, 0.05, 1 - s.x);
          cropState.y = clamp(s.y + dy, 0, s.y + s.height - 0.05);
          cropState.height = s.height - (cropState.y - s.y);
          break;
        case 'bl':
          cropState.x = clamp(s.x + dx, 0, s.x + s.width - 0.05);
          cropState.width = s.width - (cropState.x - s.x);
          cropState.height = clamp(s.height + dy, 0.05, 1 - s.y);
          break;
        case 'br':
          cropState.width = clamp(s.width + dx, 0.05, 1 - s.x);
          cropState.height = clamp(s.height + dy, 0.05, 1 - s.y);
          break;
      }
      if (!canvasRAF) {
        canvasRAF = requestAnimationFrame(() => { canvasRAF = null; redrawCanvas(); });
      }
      return;
    }

    if (!isDragging || !dragStartDesign) return;

    const designs = getActiveDesigns();
    const d = designs[selectedDesignIndex];
    if (!d) return;

    const current = window.ClientColorize.clientToPrintAreaCoords(previewCanvas, e.clientX, e.clientY);

    if (interactionMode === 'move') {
      d.x = dragStartDesign.x + (current.x - dragStartPos.x);
      d.y = dragStartDesign.y + (current.y - dragStartPos.y);
    } else if (interactionMode === 'resize') {
      const cx = d.x ?? 0.5, cy = d.y ?? 0.5;
      const dist = Math.sqrt((current.x - cx) ** 2 + (current.y - cy) ** 2);
      const startDist = Math.sqrt((dragStartPos.x - cx) ** 2 + (dragStartPos.y - cy) ** 2);
      if (startDist > 0.001) {
        d.scale = Math.max(0.05, Math.min(1.5, dragStartDesign.scale * (dist / startDist)));
      }
    } else if (interactionMode === 'rotate') {
      const cx = d.x ?? 0.5, cy = d.y ?? 0.5;
      const dx = current.x - cx;
      const dy = current.y - cy;
      d.angle = Math.round(Math.atan2(dx, -dy) * 180 / Math.PI);
    }

    if (!canvasRAF) {
      canvasRAF = requestAnimationFrame(() => { canvasRAF = null; redrawCanvas(); });
    }
  }

  function onCanvasMouseUp() {
    if (interactionMode === 'crop' && isDragging) {
      isDragging = false;
      cropDragHandle = null;
      previewCanvas.style.cursor = 'crosshair';
      return;
    }
    if (isDragging) {
      isDragging = false;
      interactionMode = 'select';
      previewCanvas.style.cursor = 'default';
      renderAreaTab(); // sync sliders with canvas state
      updatePreview();
      scheduleAutosave();
    }
  }

  function onCanvasTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    onCanvasMouseDown({ clientX: t.clientX, clientY: t.clientY });
  }

  function onCanvasTouchMove(e) {
    e.preventDefault();
    const t = e.touches[0];
    onCanvasMouseMove({ clientX: t.clientX, clientY: t.clientY });
  }

  function onCanvasTouchEnd() { onCanvasMouseUp(); }

  function highlightAccordion(index) {
    if (!areaAccordions) return;
    areaAccordions.querySelectorAll('.pdm__accordion').forEach(a => {
      a.style.borderColor = '';
    });
    const target = areaAccordions.querySelector(`[data-design-index="${index}"]`);
    if (target) {
      target.classList.add('pdm__accordion--open');
      target.style.borderColor = '#F59E0B';
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // ─── Crop Helpers ──────────────────────────────────────────────
  function getCropDesignObj() {
    const designs = getActiveDesigns();
    const d = designs[selectedDesignIndex];
    if (!d) return null;
    const url = d.is_primary
      ? (currentDesignUrl ? toRelPath(currentDesignUrl) : null)
      : getDesignPreviewUrl(d.design_id);
    const bitmap = url ? designBitmaps.get(url) : null;
    if (!bitmap) return null;
    return { ...d, bitmap };
  }

  function getCropCursor(handle) {
    switch (handle) {
      case 'top': case 'bottom': return 'ns-resize';
      case 'left': case 'right': return 'ew-resize';
      case 'tl': case 'br': return 'nwse-resize';
      case 'tr': case 'bl': return 'nesw-resize';
      case 'body': return 'move';
      default: return 'crosshair';
    }
  }

  // ─── Crop Mode ─────────────────────────────────────────────────
  function enterCropMode() {
    if (selectedDesignIndex < 0) return;
    const designs = getActiveDesigns();
    const d = designs[selectedDesignIndex];
    if (!d) return;

    interactionMode = 'crop';
    cropState = d.crop ? { ...d.crop } : { x: 0, y: 0, width: 1, height: 1 };
    cropBar.classList.add('pdm__crop-bar--visible');
    redrawCanvas();
  }

  function confirmCrop() {
    if (interactionMode !== 'crop') return;
    const designs = getActiveDesigns();
    const d = designs[selectedDesignIndex];
    if (d && cropState) {
      // Only save crop if it's not the full image
      if (cropState.x > 0.01 || cropState.y > 0.01 || cropState.width < 0.99 || cropState.height < 0.99) {
        d.crop = { ...cropState };
      } else {
        d.crop = null;
      }
    }
    exitCropMode();
    scheduleRedraw();
    scheduleAutosave();
  }

  function cancelCrop() {
    exitCropMode();
    redrawCanvas();
  }

  function exitCropMode() {
    interactionMode = 'select';
    cropState = null;
    if (cropBar) cropBar.classList.remove('pdm__crop-bar--visible');
  }

  // ─── Mehrfach-Grid: alle Varianten als Bildergitter ───────────
  function renderPreviewGrid() {
    const gridEl = modal?.querySelector('.pdm__preview-grid');
    if (!gridEl || previewViewMode !== 'grid') return;

    const colorsToShow = enabledColors.size > 0 ? [...enabledColors] : availableColors.map(c => c.hex || (typeof c === 'string' ? c : ''));
    gridEl.innerHTML = '';

    const areaKey = activeTab === 'colors' ? 'front' : selectedAreaKey;
    const areaDefault = (systemDefaults || []).find(d => d.print_area_key === areaKey) ||
      (systemDefaults || []).find(d => (d.print_area_key || '').toLowerCase() === (areaKey || 'front').toLowerCase());
    const hasRealMockImages = areaDefault?.mockup_images_by_color && Object.keys(areaDefault.mockup_images_by_color || {}).length > 0;
    const activeDesigns = getActiveDesigns();
    const allDesigns = activeDesigns.filter((d, i) => i > 0).map(d => {
      const url = getDesignPreviewUrl(d.design_id);
      return url ? { url, scale: d.scale, angle: d.angle, x: d.x, y: d.y, crop: d.crop, pattern: d.pattern } : null;
    }).filter(Boolean);
    const needsClientColorize = (currentDesignUrl || allDesigns.length) && window.ClientColorize;

    for (const hex of colorsToShow) {
      const colorObj = availableColors.find(c => (c.hex || '').toLowerCase() === (hex || '').toLowerCase());
      const hexKey = (hex || '').replace('#', '').toLowerCase();
      const preRenderedUrl = preRenderedVariants['#' + hexKey] || preRenderedVariants[hexKey];

      let templateUrl = areaDefault?.template_url;
      let useRealMockImage = false;
      if (activeTab !== 'area' && favoriteMockupImageUrl) {
        templateUrl = favoriteMockupImageUrl;
        useRealMockImage = true;
      }
      if (hasRealMockImages && colorObj?.name) {
        const byColor = areaDefault.mockup_images_by_color;
        const colorName = String(colorObj.name || '').trim();
        const colorUrl = byColor[colorName] ||
          byColor[Object.keys(byColor).find(k => k.trim().toLowerCase() === colorName.toLowerCase())] ||
          byColor[Object.keys(byColor).find(k => (k.replace(/\s+/g, ' ').trim().toLowerCase()) === (colorName.replace(/\s+/g, ' ').trim().toLowerCase()))];
        if (colorUrl) {
          templateUrl = colorUrl;
          useRealMockImage = true;
        }
      }

      const item = document.createElement('div');
      item.className = 'pdm__preview-grid-item';
      const img = document.createElement('img');
      img.alt = (colorObj?.name || hex) + ' mockup';
      img.loading = 'lazy';

      const setSrc = (url) => {
        if (url && img.parentNode) img.src = url;
      };

      if (!needsClientColorize) {
        setSrc(useRealMockImage ? templateUrl : preRenderedUrl);
      } else if (needsClientColorize && areaDefault && window.ClientColorize && typeof window.ClientColorize.renderMockup === 'function') {
        try {
          const rectSource = areaDefault.mockup_print_area_rect || areaDefault.print_area_rect;
          let printAreaRect = rectSource ? { ...rectSource } : { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
          if (printAreaRect.h == null) printAreaRect.h = printAreaRect.w ?? 0.5;
          const primaryDesign = activeDesigns.find(d => d.is_primary);
          const placement = {
            scale: primaryDesign?.scale ?? 1.0, angle: primaryDesign?.angle ?? 0,
            x: primaryDesign?.x ?? 0.5, y: primaryDesign?.y ?? 0.5,
            crop: primaryDesign?.crop || null, pattern: primaryDesign?.pattern || null,
          };
          window.ClientColorize.renderMockup({
            templateUrl: templateUrl || null,
            designUrl: currentDesignUrl ? toRelPath(currentDesignUrl) : null,
            colorHex: hex,
            placement,
            printAreaRect,
            printifyDimensions: areaDefault?.printify_dimensions || null,
            preRenderedVariantUrl: (useRealMockImage ? null : preRenderedUrl) || null,
            additionalDesigns: allDesigns,
            skipColorize: useRealMockImage,
            useFullImageAsPrintArea: false,
            showPrintAreaOverlay: false,
          }).then(blobUrl => setSrc(blobUrl)).catch(() => setSrc(preRenderedUrl));
        } catch (err) {
          setSrc(preRenderedUrl);
        }
      } else {
        setSrc(preRenderedUrl);
      }

      item.appendChild(img);
      gridEl.appendChild(item);
    }
  }

  // ─── Preview Rendering (static img for non-area tabs) ─────────
  async function updatePreview() {
    if (!isOpen) return;

    const colorObj = availableColors.find(c => c.hex.toLowerCase() === previewColorHex.toLowerCase());
    if (previewColorLabel) previewColorLabel.textContent = colorObj?.name || previewColorHex;

    const hexKey = previewColorHex.replace('#', '').toLowerCase();
    const preRenderedUrl = preRenderedVariants['#' + hexKey] || preRenderedVariants[hexKey];
    const areaDefault = (systemDefaults || []).find(d => d.print_area_key === selectedAreaKey)
      || (systemDefaults || []).find(d => (d.print_area_key || '').toLowerCase() === (selectedAreaKey || 'front').toLowerCase());
    // Farbauswahl/Gewinn: Mockup. Print Area: Print-Area-Template wie Admin Edit Mode.
    const usePrintAreaTemplate = activeTab === 'area' && (!!areaDefault?.print_area_template_url || !!areaDefault?.print_area_template_r2_key);
    let templateUrl = areaDefault?.template_url;
    let useRealMockImage = false;
    if (!usePrintAreaTemplate && activeTab !== 'area' && favoriteMockupImageUrl) {
      templateUrl = favoriteMockupImageUrl;
      useRealMockImage = true;
    }
    // Echte Mock-Fotos statt Farbüberlagerung, wenn für diese Farbe vorhanden
    if (!usePrintAreaTemplate && areaDefault?.mockup_images_by_color && colorObj?.name) {
      const byColor = areaDefault.mockup_images_by_color;
      const colorName = String(colorObj.name || '').trim();
      const colorUrl = byColor[colorName]
        || byColor[Object.keys(byColor).find(k => k.trim().toLowerCase() === colorName.toLowerCase())]
        || byColor[Object.keys(byColor).find(k => k.replace(/\s+/g, ' ').trim().toLowerCase() === colorName.replace(/\s+/g, ' ').trim().toLowerCase())];
      if (colorUrl) {
        templateUrl = colorUrl;
        useRealMockImage = true;
      }
    }
    if (activeTab === 'area' && usePrintAreaTemplate) {
      const origin = (() => { try { return new URL(API_BASE).origin; } catch { return 'https://creator-engine.eazpire.workers.dev'; } })();
      if (areaDefault.print_area_template_r2_key) {
        templateUrl = origin + '/mockup/' + encodeURIComponent(areaDefault.print_area_template_r2_key);
      } else {
        templateUrl = areaDefault.print_area_template_url;
      }
    }

    // Build design list for rendering
    const activeDesigns = getActiveDesigns();
    const allDesigns = activeDesigns.filter((d, i) => i > 0).map(d => {
      const url = getDesignPreviewUrl(d.design_id);
      return url ? { url, scale: d.scale, angle: d.angle, x: d.x, y: d.y, crop: d.crop, pattern: d.pattern } : null;
    }).filter(Boolean);

    // No design and pre-rendered variant: show directly (skip when using print area template or real mock image)
    if (!usePrintAreaTemplate && !useRealMockImage && !currentDesignUrl && !allDesigns.length && preRenderedUrl && previewImg) {
      previewImg.src = preRenderedUrl;
      return;
    }

    if (!window.ClientColorize) {
      if (preRenderedUrl && previewImg) previewImg.src = preRenderedUrl;
      return;
    }

    // Print-Area-Template: print_area_rect (admin). Mockup: mockup_print_area_rect.
    const useTemplateRect = usePrintAreaTemplate;
    const rectSource = useTemplateRect ? areaDefault?.print_area_rect : (areaDefault?.mockup_print_area_rect || areaDefault?.print_area_rect);
    let printAreaRect = rectSource
      ? { ...rectSource }
      : { x: areaDefault?.placement?.x ?? 0.5, y: areaDefault?.placement?.y ?? 0.5, w: areaDefault?.placement?.scale ?? 0.5, h: areaDefault?.placement?.scale ?? 0.5 };
    if (printAreaRect.h == null || typeof printAreaRect.h !== 'number') {
      printAreaRect = { ...printAreaRect, h: printAreaRect.w ?? 0.5 };
    }
    const useFullImageForPreview = usePrintAreaTemplate && !areaDefault?.has_print_area_rect;

    const primaryDesign = activeDesigns.find(d => d.is_primary);
    const placement = {
      scale: primaryDesign?.scale ?? 1.0,
      angle: primaryDesign?.angle ?? 0,
      x: primaryDesign?.x ?? 0.5,
      y: primaryDesign?.y ?? 0.5,
      crop: primaryDesign?.crop || null,
      pattern: primaryDesign?.pattern || null,
    };

    updatePlacementDebugOverlay({
      source: 'preview',
      tab: activeTab,
      areaKey: selectedAreaKey,
      colorHex: previewColorHex,
      rect: {
        x: roundDbg(printAreaRect?.x),
        y: roundDbg(printAreaRect?.y),
        w: roundDbg(printAreaRect?.w),
        h: roundDbg(printAreaRect?.h),
      },
      design: {
        x: roundDbg(placement.x),
        y: roundDbg(placement.y),
        scale: roundDbg(placement.scale),
        angle: roundDbg(placement.angle),
      }
    });

    try {
      const blobUrl = await window.ClientColorize.renderMockup({
        templateUrl: templateUrl || null,
        designUrl: currentDesignUrl ? toRelPath(currentDesignUrl) : null,
        colorHex: previewColorHex,
        placement,
        printAreaRect,
        printifyDimensions: areaDefault?.printify_dimensions || null,
        preRenderedVariantUrl: (usePrintAreaTemplate || useRealMockImage) ? null : (preRenderedUrl || null),
        additionalDesigns: allDesigns,
        skipColorize: usePrintAreaTemplate || useRealMockImage,
        useFullImageAsPrintArea: useFullImageForPreview,
        showPrintAreaOverlay: false,
      });
      if (isOpen && previewImg) previewImg.src = blobUrl;
    } catch (err) {
      console.warn('[PDM] Preview render error:', err);
      if (preRenderedUrl && previewImg) previewImg.src = preRenderedUrl;
    }
  }

  // ─── Debounced Redraw / Recalc ─────────────────────────────────
  function scheduleRedraw() {
    if (redrawDebounceTimer) clearTimeout(redrawDebounceTimer);
    redrawDebounceTimer = setTimeout(() => {
      redrawDebounceTimer = null;
      redrawCanvas();
      updatePreview();
    }, REDRAW_DEBOUNCE_MS);
  }

  /** Flush any pending redraw (e.g. before tab switch) so canvas and preview stay in sync. */
  function flushRedraw() {
    if (redrawDebounceTimer) {
      clearTimeout(redrawDebounceTimer);
      redrawDebounceTimer = null;
      redrawCanvas();
      updatePreview();
      return true;
    }
    return false;
  }

  function scheduleRecalcProfit() {
    if (profitDebounceTimer) clearTimeout(profitDebounceTimer);
    profitDebounceTimer = setTimeout(() => {
      profitDebounceTimer = null;
      recalcProfit();
    }, RECALC_PROFIT_DEBOUNCE_MS);
  }

  // ─── Auto-Save ─────────────────────────────────────────────────
  function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    setAutosaveStatus('Changes...');
    autosaveTimer = setTimeout(doAutosave, AUTOSAVE_DEBOUNCE_MS);
  }

  async function doAutosave() {
    autosaveTimer = null;
    if (!currentOwnerId || !currentDesignId || !currentProductKey) return;
    setAutosaveStatus('Saving...');
    try {
      const sellPriceCents = customProfitCents && pricingData
        ? pricingData.base_cost_cents + Math.round(customProfitCents / ((pricingData.creator_share_percent || 40) / 100))
        : null;
      const sizesByColorObj = {};
      for (const [hex, sizes] of enabledSizesByColor) {
        if (sizes && sizes.size > 0) {
          const c = availableColors.find(ac => normHex(ac.hex || ac) === hex);
          const dispHex = c?.hex || '#' + hex;
          sizesByColorObj[dispHex] = [...sizes];
        }
      }
      await fetchJSON(`${API_BASE}?op=save-product-config`, {
        method: 'POST',
        body: JSON.stringify({
          owner_id: currentOwnerId, design_id: currentDesignId, product_key: currentProductKey,
          template_id: templateSelect?.value || null,
          placements_json: placements,
          additional_designs_json: additionalDesigns.length > 0 ? additionalDesigns : null,
          enabled_colors_json: enabledColors.size > 0 ? [...enabledColors] : null,
          enabled_colors_sizes_json: Object.keys(sizesByColorObj).length > 0 ? sizesByColorObj : null,
          custom_profit_cents: customProfitCents,
          custom_sell_price_cents: sellPriceCents,
        }),
      });
      setAutosaveStatus('Saved \u2713', true);
    } catch (err) {
      console.error('[PDM] Autosave error:', err);
      setAutosaveStatus('Error saving');
    }
  }

  function setAutosaveStatus(text, isSaved) {
    if (autosaveEl) {
      autosaveEl.textContent = text;
      autosaveEl.classList.toggle('pdm__autosave-status--saved', !!isSaved);
    }
  }

  function roundDbg(v) {
    return typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(4)) : null;
  }

  function dbgDelta(a, b) {
    if (typeof a !== 'number' || typeof b !== 'number') return null;
    return roundDbg(a - b);
  }

  function dbgIsDrift(v, epsilon) {
    return typeof v === 'number' && Math.abs(v) > epsilon;
  }

  function updatePlacementDebugOverlay(payload) {
    if (!PDM_DEBUG_PLACEMENT || !previewEl) {
      if (placementDebugEl) placementDebugEl.style.display = 'none';
      return;
    }
    if (!placementDebugEl) {
      placementDebugEl = document.createElement('pre');
      placementDebugEl.style.cssText = [
        'position:absolute',
        'left:8px',
        'bottom:8px',
        'z-index:30',
        'margin:0',
        'padding:8px 10px',
        'max-width:92%',
        'background:rgba(2,6,23,0.82)',
        'border:1px solid rgba(148,163,184,0.35)',
        'border-radius:8px',
        'color:#e2e8f0',
        'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
        'white-space:pre-wrap',
        'pointer-events:none'
      ].join(';');
      if (window.getComputedStyle(previewEl).position === 'static') {
        previewEl.style.position = 'relative';
      }
      previewEl.appendChild(placementDebugEl);
    }
    const normalized = {
      source: payload.source,
      tab: payload.tab,
      areaKey: payload.areaKey,
      colorHex: payload.colorHex || null,
      rect: {
        x: roundDbg(payload.rect?.x),
        y: roundDbg(payload.rect?.y),
        w: roundDbg(payload.rect?.w),
        h: roundDbg(payload.rect?.h),
      },
      design: {
        x: roundDbg(payload.design?.x),
        y: roundDbg(payload.design?.y),
        scale: roundDbg(payload.design?.scale),
        angle: roundDbg(payload.design?.angle),
      }
    };
    if (normalized.source === 'canvas' || normalized.source === 'preview') {
      placementDebugLastBySource[normalized.source] = normalized;
    }

    const c = placementDebugLastBySource.canvas;
    const p = placementDebugLastBySource.preview;
    let deltaLine = 'delta=waiting for both sources';
    let driftLine = '';
    let deltaPayload = null;
    let driftState = 'waiting'; // waiting | ok | drift | n_a
    if (c && p && c.areaKey === p.areaKey) {
      const d = {
        design: {
          x: dbgDelta(p.design?.x, c.design?.x),
          y: dbgDelta(p.design?.y, c.design?.y),
          scale: dbgDelta(p.design?.scale, c.design?.scale),
          angle: dbgDelta(p.design?.angle, c.design?.angle),
        },
        rect: {
          x: dbgDelta(p.rect?.x, c.rect?.x),
          y: dbgDelta(p.rect?.y, c.rect?.y),
          w: dbgDelta(p.rect?.w, c.rect?.w),
          h: dbgDelta(p.rect?.h, c.rect?.h),
        }
      };
      const driftFlags = [];
      if (dbgIsDrift(d.design.x, 0.0005)) driftFlags.push('x');
      if (dbgIsDrift(d.design.y, 0.0005)) driftFlags.push('y');
      if (dbgIsDrift(d.design.scale, 0.0005)) driftFlags.push('scale');
      if (dbgIsDrift(d.design.angle, 0.05)) driftFlags.push('angle');
      if (dbgIsDrift(d.rect.x, 0.0005)) driftFlags.push('rect.x');
      if (dbgIsDrift(d.rect.y, 0.0005)) driftFlags.push('rect.y');
      if (dbgIsDrift(d.rect.w, 0.0005)) driftFlags.push('rect.w');
      if (dbgIsDrift(d.rect.h, 0.0005)) driftFlags.push('rect.h');
      deltaLine = `Δ(preview-canvas) design x=${d.design.x} y=${d.design.y} s=${d.design.scale} a=${d.design.angle}`;
      driftLine = driftFlags.length ? `DRIFT: ${driftFlags.join(', ')}` : 'DRIFT: none';
      driftState = driftFlags.length ? 'drift' : 'ok';
      deltaPayload = d;
    } else if (c && p) {
      deltaLine = `delta=n/a (different area: preview=${p.areaKey} canvas=${c.areaKey})`;
      driftLine = 'DRIFT: n/a';
      driftState = 'n_a';
    }

    placementDebugEl.style.display = '';
    if (driftState === 'drift') {
      placementDebugEl.style.background = 'rgba(127, 29, 29, 0.9)';
      placementDebugEl.style.border = '1px solid rgba(248, 113, 113, 0.75)';
      placementDebugEl.style.color = '#fee2e2';
    } else if (driftState === 'ok') {
      placementDebugEl.style.background = 'rgba(20, 83, 45, 0.88)';
      placementDebugEl.style.border = '1px solid rgba(74, 222, 128, 0.65)';
      placementDebugEl.style.color = '#dcfce7';
    } else {
      placementDebugEl.style.background = 'rgba(2, 6, 23, 0.82)';
      placementDebugEl.style.border = '1px solid rgba(148, 163, 184, 0.35)';
      placementDebugEl.style.color = '#e2e8f0';
    }
    placementDebugEl.textContent = [
      `[PDM debug] source=${normalized.source} tab=${normalized.tab}`,
      `area=${normalized.areaKey} color=${normalized.colorHex || '-'}`,
      `rect x=${normalized.rect?.x} y=${normalized.rect?.y} w=${normalized.rect?.w} h=${normalized.rect?.h}`,
      `design x=${normalized.design?.x} y=${normalized.design?.y} s=${normalized.design?.scale} a=${normalized.design?.angle}`,
      deltaLine,
      driftLine
    ].join('\n');
    console.debug('[PDM placement debug]', { current: normalized, delta: deltaPayload, last: placementDebugLastBySource });
  }

  // ─── Helpers ───────────────────────────────────────────────────
  async function fetchJSON(url, opts = {}) {
    const resp = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    return resp.json();
  }

  function formatCents(cents, currency = 'EUR') { return (cents / 100).toFixed(2) + ' ' + currency; }

  function isLightColor(hex) {
    const { r, g, b } = window.ClientColorize?.hexToRgb?.(hex) || parseHex(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 180;
  }

  function parseHex(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function toRelPath(url) {
    if (!url) return null;
    if (url.startsWith('/mockup/') || url.startsWith('/file/')) return url;
    try {
      const u = new URL(url);
      if (u.origin === 'https://creator-engine.eazpire.workers.dev') return u.pathname;
    } catch {}
    return null;
  }

  function getDesignPreviewUrl(designId) {
    const ad = additionalDesigns.find(d => d.design_id === designId);
    return ad?.preview_url || null;
  }

  // ─── Public API ────────────────────────────────────────────────
  window.ProductDetailModal = {
    open,
    close,
    get isOpen() { return isOpen; },
    isReady: true,
  };

})();
