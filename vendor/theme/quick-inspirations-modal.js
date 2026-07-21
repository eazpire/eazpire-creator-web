/**
 * Quick Inspirations Modal — browse + upload mood/screenshot inspirations.
 * Apply: pick one image, then Reference Influence for inspiration settings
 * (Generator / Automations / Shop DG / Shop Studio).
 * Upload sources: Device, Screenshot, Camera, Paste from Clipboard, Phone
 * (not Public Designs / My Designs / QI / Canvas).
 */
(function () {
  'use strict';

  var API_BASE = 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  var QI_STRENGTH = 0.05;

  var modal = null;
  var uploadModal = null;
  var sourceModal = null;
  var deleteConfirmModal = null;
  var deleteConfirmResolver = null;
  var sectionId = null;
  var selectedId = null;
  var previewItem = null;
  var items = [];
  var searchQuery = '';
  var activeProduct = '';
  var activeContentType = '';
  var activeLanguage = '';
  var activeTag = '';
  var activeStyle = '';
  var activeMood = '';
  var searchTimer = null;

  var CONTENT_TYPE_LABELS = {
    design_text: 'Design + Text',
    design_only: 'Design Only',
    text_only: 'Text Only',
  };
  var pendingFiles = [];
  var isLoading = false;
  var bound = false;
  var screenshotBinder = null;
  var pasteBinder = null;
  var uploading = false;
  /** 'public' | 'yours' — default Public Inspirations */
  var activeTab = 'public';
  /** Cap concurrent grid image downloads (full-size R2 files are ~100–300KB each). */
  var QI_IMG_CONCURRENCY = 4;
  var qiImgQueue = [];
  var qiImgActive = 0;
  /** @type {null|function()} */
  var pendingOnCancel = null;
  var selectionInProgress = false;
  var processPollTimer = null;
  var PROCESS_POLL_MS = 2500;

  /** Crop/segment editor state */
  var editorModal = null;
  var segmentConfigModal = null;
  var editorQueue = [];
  var editorQueueIndex = 0;
  var editorMode = 'crop';
  /** @type {{x:number,y:number,w:number,h:number}[]} normalized 0–1 */
  var editorFrames = [];
  var editorActiveFrame = 0;
  var editorObjectUrl = null;
  var editorNaturalW = 0;
  var editorNaturalH = 0;
  var editorDrag = null;
  var editorSaving = false;
  var editorPointerBound = false;

  function t(key, fallback) {
    try {
      var i18n = window.CreatorI18n || {};
      if (i18n[key]) return i18n[key];
      var path = key.indexOf('creator.') === 0 ? key.slice(8) : key;
      var parts = path.split('.');
      var cur = i18n;
      for (var i = 0; i < parts.length; i++) {
        if (!cur || typeof cur !== 'object') break;
        cur = cur[parts[i]];
      }
      if (typeof cur === 'string') return cur;
    } catch (_e) {}
    var el = document.querySelector('[data-t="' + key + '"]');
    if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
    return fallback || key;
  }

  /** Same priority as My Designs / creator-layout-drag — missing owner_id breaks uploads. */
  function getOwnerId() {
    try {
      if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID !== null && String(window.__EAZ_OWNER_ID).trim() !== '') {
        return String(window.__EAZ_OWNER_ID).trim();
      }
    } catch (_e0) {}
    try {
      if (window.Shopify && window.Shopify.customerId) {
        return String(window.Shopify.customerId).trim();
      }
    } catch (_e1) {}
    try {
      if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.OWNER_ID) {
        return String(window.CREATOR_API_CONFIG.OWNER_ID).trim();
      }
    } catch (_e2) {}
    try {
      var meta =
        document.querySelector('meta[name="eaz-owner-id"]') ||
        document.querySelector('meta[name="creator-owner-id"]');
      if (meta && meta.content) return String(meta.content).trim();
    } catch (_e3) {}
    try {
      var sid = sectionId || resolveSectionId();
      if (sid) {
        var el = document.getElementById('ownerId-' + sid);
        if (el && el.value) return String(el.value).trim();
      }
      var el2 = document.querySelector('input[id^="ownerId-"]');
      if (el2 && el2.value) return String(el2.value).trim();
    } catch (_e4) {}
    try {
      if (window.CreatorWidget && window.CreatorWidget.ownerId) {
        return String(window.CreatorWidget.ownerId).trim();
      }
    } catch (_e5) {}
    try {
      var sid2 = sectionId || resolveSectionId();
      if (sid2 && window.CreatorWidgetConfig && window.CreatorWidgetConfig[sid2] && window.CreatorWidgetConfig[sid2].owner_id != null) {
        return String(window.CreatorWidgetConfig[sid2].owner_id).trim();
      }
    } catch (_e6) {}
    try {
      var shop = document.querySelector('[data-owner-id], [data-customer-id]');
      if (shop) {
        return String(shop.getAttribute('data-owner-id') || shop.getAttribute('data-customer-id') || '').trim();
      }
    } catch (_e7) {}
    return '';
  }

  function apiUrl(op) {
    var u = new URL(API_BASE);
    u.searchParams.set('op', op);
    var oid = getOwnerId();
    if (oid) {
      u.searchParams.set('owner_id', oid);
      u.searchParams.set('logged_in_customer_id', oid);
    }
    return u;
  }

  function lockScroll() {
    if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.lockBodyScroll === 'function') {
      window.CreatorModalPhysics.lockBodyScroll();
    }
  }

  function unlockScroll() {
    try {
      if (window.CreatorModalPhysics && typeof window.CreatorModalPhysics.unlockBodyScroll === 'function') {
        window.CreatorModalPhysics.unlockBodyScroll();
      }
    } catch (_e) {}
  }

  function ensureEls() {
    modal = document.getElementById('quick-inspirations-modal');
    uploadModal = document.getElementById('qi-upload-modal');
    sourceModal = document.getElementById('qi-upload-source-modal');
    deleteConfirmModal = document.getElementById('qi-delete-confirm-modal');
    editorModal = document.getElementById('qi-editor-modal');
    segmentConfigModal = document.getElementById('qi-segment-config-modal');
    return !!modal;
  }

  function portalToBody(el) {
    if (!el || !document.body) return;
    if (el.parentElement !== document.body) {
      try {
        document.body.appendChild(el);
      } catch (_e) {}
    }
  }

  function showDialog(dlg) {
    if (!dlg) return;
    // Nested pickers must also enter the top layer above Design Studio.
    portalToBody(dlg);
    try {
      if (typeof dlg.showModal === 'function') {
        if (!dlg.open) dlg.showModal();
      } else {
        dlg.setAttribute('open', '');
      }
    } catch (_e) {
      dlg.setAttribute('open', '');
    }
  }

  function hideDialog(dlg) {
    if (!dlg) return;
    try {
      if (typeof dlg.close === 'function' && dlg.open) dlg.close();
      else dlg.removeAttribute('open');
    } catch (_e) {
      dlg.removeAttribute('open');
    }
  }

  function setSidebarOpen(open) {
    if (!modal) return;
    var body = modal.querySelector('.qi-modal__body');
    var backdrop = document.getElementById('qi-sidebar-backdrop');
    var toggle = document.getElementById('qi-filter-toggle');
    if (body) body.classList.toggle('is-sidebar-open', !!open);
    if (backdrop) backdrop.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function setDesktopSidebarCollapsed(collapsed) {
    var wrapper = document.getElementById('qi-sidebar-wrapper');
    var rail = document.getElementById('qi-filter-rail');
    if (!wrapper) return;
    wrapper.classList.toggle('is-collapsed', !!collapsed);
    if (rail) {
      rail.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      rail.setAttribute(
        'aria-label',
        collapsed
          ? t('creator.quick_inspirations.filters_expand', 'Expand filters')
          : t('creator.quick_inspirations.filters_collapse', 'Collapse filters')
      );
      rail.title = t('creator.quick_inspirations.filters', 'Filters');
    }
  }

  function setEazyTipOpen(open) {
    var tip = document.getElementById('qi-eazy-tip');
    var btn = document.getElementById('qi-eazy-btn');
    if (!tip || !btn) return;
    var show = !!open;
    tip.classList.toggle('is-visible', show);
    tip.hidden = !show;
    tip.setAttribute('aria-hidden', show ? 'false' : 'true');
    btn.setAttribute('aria-expanded', show ? 'true' : 'false');
  }

  function askDeleteConfirm() {
    return new Promise(function (resolve) {
      if (!deleteConfirmModal) deleteConfirmModal = document.getElementById('qi-delete-confirm-modal');
      if (!deleteConfirmModal) {
        resolve(false);
        return;
      }
      if (deleteConfirmResolver) {
        try {
          deleteConfirmResolver(false);
        } catch (_e) {}
        deleteConfirmResolver = null;
      }
      deleteConfirmResolver = resolve;
      showDialog(deleteConfirmModal);
    });
  }

  function closeDeleteConfirm(result) {
    var resolve = deleteConfirmResolver;
    deleteConfirmResolver = null;
    hideDialog(deleteConfirmModal);
    if (typeof resolve === 'function') resolve(!!result);
  }

  function setActiveTab(tab) {
    activeTab = tab === 'yours' ? 'yours' : 'public';
    if (!modal) return;
    var tabs = modal.querySelectorAll('[data-qi-tab]');
    tabs.forEach(function (btn) {
      var isOn = btn.getAttribute('data-qi-tab') === activeTab;
      btn.classList.toggle('is-active', isOn);
      btn.setAttribute('aria-selected', isOn ? 'true' : 'false');
    });
  }

  /** Fix Markets “Translation missing: en.creator.common.*” if Liquid | t leaked through. */
  function hardenCommonLabels() {
    var pairs = [
      ['qi-filter-reset', 'creator.common.reset', 'Reset'],
      ['qi-preview-cancel', 'creator.common.cancel', 'Cancel'],
      ['qi-preview-apply', 'creator.common.apply', 'Apply'],
      ['qi-delete-confirm-cancel', 'creator.common.cancel', 'Cancel'],
      ['qi-upload-cancel', 'creator.common.cancel', 'Cancel'],
    ];
    pairs.forEach(function (row) {
      var el = document.getElementById(row[0]);
      if (!el) return;
      var cur = (el.textContent || '').trim();
      if (!cur || /translation missing/i.test(cur) || /übersetzung fehlt/i.test(cur)) {
        el.textContent = t(row[1], row[2]);
      }
    });
  }

  function stopProcessPoll() {
    if (processPollTimer) {
      clearTimeout(processPollTimer);
      processPollTimer = null;
    }
  }

  function hasProcessingItems(list) {
    return (list || items || []).some(function (it) {
      return it && (it.status === 'processing' || it.pending === true);
    });
  }

  function scheduleProcessPoll() {
    stopProcessPoll();
    if (!hasProcessingItems()) return;
    processPollTimer = setTimeout(async function () {
      processPollTimer = null;
      if (!modal || !(modal.open || modal.classList.contains('creator-modal--open'))) {
        // Keep polling lightly even when closed so reopen is fresh — only if Yours tab context.
        if (activeTab === 'yours') {
          await loadItems({ silent: true });
        }
        if (hasProcessingItems()) scheduleProcessPoll();
        return;
      }
      if (activeTab !== 'yours') {
        if (hasProcessingItems()) scheduleProcessPoll();
        return;
      }
      await loadItems({ silent: true });
      if (hasProcessingItems()) scheduleProcessPoll();
    }, PROCESS_POLL_MS);
  }

  function emptyMessageForTab() {
    if (activeTab === 'yours') {
      if (!getOwnerId()) {
        return t('creator.quick_inspirations.empty_yours_login', 'Sign in to see your Quick Inspirations.');
      }
      return t('creator.quick_inspirations.empty_yours', 'You have no Quick Inspirations yet.');
    }
    return t('creator.quick_inspirations.empty', 'No quick inspirations yet. Be the first to upload!');
  }

  function titleCaseLabel(value) {
    var s = String(value || '').toLowerCase().trim();
    if (!s) return '';
    if (s === 't-shirt' || s === 'tshirt' || s === 'tee') return 'T-Shirt';
    return s.replace(/\b([a-z])/g, function (m, c) {
      return c.toUpperCase();
    });
  }

  function contentTypeLabel(key) {
    var k = String(key || '').toLowerCase();
    if (k === 'design_text') {
      return t('creator.quick_inspirations.content_type_design_text', CONTENT_TYPE_LABELS.design_text);
    }
    if (k === 'design_only') {
      return t('creator.quick_inspirations.content_type_design_only', CONTENT_TYPE_LABELS.design_only);
    }
    if (k === 'text_only') {
      return t('creator.quick_inspirations.content_type_text_only', CONTENT_TYPE_LABELS.text_only);
    }
    return rowLabelFallback(key);
  }

  function languageLabel(key) {
    var k = String(key || '').toLowerCase();
    if (k === 'none') return t('creator.quick_inspirations.language_none', 'None');
    if (k === 'multilingual') {
      return t('creator.quick_inspirations.language_multilingual', 'Multilingual');
    }
    return titleCaseLabel(k);
  }

  function rowLabelFallback(value) {
    return String(value || '');
  }

  function productLabel(key) {
    var k = String(key || '').toLowerCase();
    if (k === 't-shirt' || k === 'tshirt' || k === 'tee') return 'T-Shirt';
    return titleCaseLabel(k);
  }

  /**
   * @param {string} containerId
   * @param {Array} list
   * @param {string} activeValue
   * @param {function(string)} onPick
   * @param {function(string, object): string} [labelFn]
   */
  function renderFilterChips(containerId, list, activeValue, onPick, labelFn) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    (list || []).forEach(function (row) {
      var name = row.name || row;
      var label =
        typeof labelFn === 'function'
          ? labelFn(name, row)
          : row.label || name;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qi-filter-chip' + (activeValue === name ? ' is-active' : '');
      btn.textContent = label + (row.count ? ' (' + row.count + ')' : '');
      btn.addEventListener('click', function () {
        onPick(activeValue === name ? '' : name);
      });
      el.appendChild(btn);
    });
  }

  async function loadFilterTags() {
    try {
      var res = await fetch(apiUrl('quick-inspiration-tags').toString(), { credentials: 'omit' });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data || !data.ok) return;
      renderFilterChips(
        'qi-filter-products',
        data.products || [],
        activeProduct,
        function (v) {
          activeProduct = v;
          loadItems();
          loadFilterTags();
        },
        function (name) {
          return productLabel(name);
        }
      );
      renderFilterChips(
        'qi-filter-content-types',
        data.content_types || [],
        activeContentType,
        function (v) {
          activeContentType = v;
          loadItems();
          loadFilterTags();
        },
        function (name, row) {
          return row.label || contentTypeLabel(name);
        }
      );
      renderFilterChips(
        'qi-filter-languages',
        data.languages || [],
        activeLanguage,
        function (v) {
          activeLanguage = v;
          loadItems();
          loadFilterTags();
        },
        function (name) {
          return languageLabel(name);
        }
      );
      renderFilterChips('qi-filter-tags', data.tags || [], activeTag, function (v) {
        activeTag = v;
        loadItems();
        loadFilterTags();
      });
      renderFilterChips('qi-filter-styles', data.style_tags || [], activeStyle, function (v) {
        activeStyle = v;
        loadItems();
        loadFilterTags();
      });
      renderFilterChips('qi-filter-moods', data.mood_tags || [], activeMood, function (v) {
        activeMood = v;
        loadItems();
        loadFilterTags();
      });
    } catch (_e) {}
  }

  async function deleteOwnItem(item) {
    var ownerId = getOwnerId();
    if (!item || !item.id || !ownerId) return false;
    if (!isOwnedItem(item)) return false;

    var confirmed = await askDeleteConfirm();
    if (!confirmed) return false;

    try {
      var u = apiUrl('delete-quick-inspiration');
      u.searchParams.set('id', String(item.id));
      var res = await fetch(u.toString(), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, owner_id: ownerId }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'delete_failed');
      }
      items = items.filter(function (row) {
        return String(row.id) !== String(item.id);
      });
      if (selectedId != null && String(selectedId) === String(item.id)) {
        selectedId = null;
      }
      if (previewItem && String(previewItem.id) === String(item.id)) {
        closePreview();
      }
      renderGrid();
      loadFilterTags();
      return true;
    } catch (_e) {
      window.alert(
        t('creator.quick_inspirations.delete_failed', 'Could not delete Quick Inspiration.')
      );
      return false;
    }
  }

  function isOwnedItem(item) {
    var ownerId = getOwnerId();
    if (!ownerId || !item) return false;
    if (item.is_owner === true) return true;
    if (item.is_owner === false) return false;
    return String(item.owner_id || '') === String(ownerId);
  }

  function openPreview(item) {
    if (!ensureEls() || !item) return;
    if (item.status === 'processing' || item.pending === true) return;
    previewItem = item;
    var browse = document.getElementById('qi-browse-view');
    var preview = document.getElementById('qi-preview-view');
    var img = document.getElementById('qi-preview-image');
    var removeBtn = document.getElementById('qi-preview-remove');
    hardenCommonLabels();
    var cancelBtn = document.getElementById('qi-preview-cancel');
    var applyBtn = document.getElementById('qi-preview-apply');
    if (cancelBtn) cancelBtn.textContent = t('creator.common.cancel', 'Cancel');
    if (applyBtn) applyBtn.textContent = t('creator.common.apply', 'Apply');
    if (img) {
      img.src = item.image_url || item.thumb_url || '';
      img.alt = item.summary || t('creator.quick_inspirations.preview_aria', 'Preview inspiration');
    }
    if (removeBtn) {
      var owned = isOwnedItem(item);
      removeBtn.hidden = !owned;
      removeBtn.style.display = owned ? '' : 'none';
      if (owned) {
        removeBtn.textContent = t('creator.quick_inspirations.remove', 'Remove');
      }
    }
    if (browse) browse.style.display = 'none';
    if (preview) {
      preview.hidden = false;
      preview.style.display = 'flex';
      preview.setAttribute('aria-hidden', 'false');
    }
    modal.classList.add('is-preview');
  }

  function closePreview() {
    previewItem = null;
    if (!modal) return;
    var browse = document.getElementById('qi-browse-view');
    var preview = document.getElementById('qi-preview-view');
    var img = document.getElementById('qi-preview-image');
    if (img) {
      img.src = '';
      img.alt = '';
    }
    if (browse) browse.style.display = '';
    if (preview) {
      preview.hidden = true;
      preview.style.display = 'none';
      preview.setAttribute('aria-hidden', 'true');
    }
    modal.classList.remove('is-preview');
  }

  function gridThumbSrc(item) {
    if (!item) return '';
    var thumb = item.thumb_url || '';
    var full = item.image_url || '';
    // Prefer real thumbs when upload created a separate smaller file.
    if (thumb && full && thumb !== full) return thumb;
    return thumb || full;
  }

  function pumpImgQueue() {
    while (qiImgActive < QI_IMG_CONCURRENCY && qiImgQueue.length) {
      var job = qiImgQueue.shift();
      if (!job || !job.img) continue;
      qiImgActive += 1;
      (function (img, src, card) {
        var done = function () {
          qiImgActive = Math.max(0, qiImgActive - 1);
          if (card) card.classList.add('is-loaded');
          pumpImgQueue();
        };
        img.onload = done;
        img.onerror = done;
        img.src = src;
      })(job.img, job.src, job.card);
    }
  }

  function enqueueGridImage(img, src, card) {
    if (!img || !src) return;
    qiImgQueue.push({ img: img, src: src, card: card });
    pumpImgQueue();
  }

  function renderGrid() {
    var grid = document.getElementById('qi-grid');
    var empty = document.getElementById('qi-empty');
    var loading = document.getElementById('qi-loading');
    if (!grid) return;
    if (loading) loading.style.display = 'none';
    qiImgQueue = [];
    qiImgActive = 0;
    grid.innerHTML = '';
    if (!items.length) {
      if (empty) {
        empty.textContent = emptyMessageForTab();
        empty.style.display = 'block';
      }
      return;
    }
    if (empty) empty.style.display = 'none';

    var deleteAria = t('creator.quick_inspirations.delete_aria', 'Delete inspiration');
    var previewAria = t('creator.quick_inspirations.preview_aria', 'Preview inspiration');

    items.forEach(function (item, index) {
      var isProcessing = item.status === 'processing' || item.pending === true;
      var card = document.createElement('div');
      card.className =
        'qi-card' +
        (selectedId === item.id ? ' is-selected' : '') +
        (isProcessing ? ' is-processing' : '');
      card.setAttribute('data-id', item.id);
      if (isProcessing) {
        card.setAttribute('aria-busy', 'true');
        card.setAttribute(
          'aria-label',
          t('creator.quick_inspirations.analyzing', 'Uploading and analyzing…')
        );
      } else {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', previewAria);
      }

      var placeholder = document.createElement('div');
      placeholder.className = 'qi-card__img-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      card.appendChild(placeholder);

      var img = document.createElement('img');
      img.alt = item.summary || 'Quick inspiration';
      img.decoding = 'async';
      img.loading = index < 8 ? 'eager' : 'lazy';
      if (index < 4) img.fetchPriority = 'high';
      else img.fetchPriority = 'low';
      card.appendChild(img);
      enqueueGridImage(img, gridThumbSrc(item), card);

      if (isProcessing) {
        var overlay = document.createElement('div');
        overlay.className = 'qi-card__processing';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML =
          '<span class="qi-card__processing-spinner"></span><span class="qi-card__processing-label"></span>';
        var lab = overlay.querySelector('.qi-card__processing-label');
        if (lab) {
          lab.textContent = t('creator.quick_inspirations.analyzing', 'Uploading and analyzing…');
        }
        card.appendChild(overlay);
      } else if (isOwnedItem(item)) {
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'qi-card__delete';
        deleteBtn.setAttribute('aria-label', deleteAria);
        deleteBtn.innerHTML = '&times;';
        deleteBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          deleteBtn.blur();
          deleteOwnItem(item);
        });
        card.appendChild(deleteBtn);
      }

      if (!isProcessing) {
        var openItemPreview = function () {
          selectedId = item.id;
          var cards = grid.querySelectorAll('.qi-card');
          for (var i = 0; i < cards.length; i++) {
            cards[i].classList.toggle(
              'is-selected',
              String(cards[i].getAttribute('data-id')) === String(item.id)
            );
          }
          openPreview(item);
        };
        card.addEventListener('click', openItemPreview);
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openItemPreview();
          }
        });
      }

      grid.appendChild(card);
    });
  }

  async function loadItems(opts) {
    opts = opts || {};
    if (!ensureEls() || isLoading) return;
    isLoading = true;
    var loading = document.getElementById('qi-loading');
    var empty = document.getElementById('qi-empty');
    if (!opts.silent && loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';

    if (activeTab === 'yours' && !getOwnerId()) {
      items = [];
      renderGrid();
      isLoading = false;
      if (loading) loading.style.display = 'none';
      return;
    }

    try {
      var u = apiUrl('list-quick-inspirations');
      if (activeTab === 'yours') {
        u.searchParams.set('mine', '1');
      } else if (getOwnerId()) {
        u.searchParams.set('exclude_mine', '1');
      }
      if (searchQuery) u.searchParams.set('search', searchQuery);
      if (activeProduct) u.searchParams.set('product', activeProduct);
      if (activeContentType) u.searchParams.set('content_type', activeContentType);
      if (activeLanguage) u.searchParams.set('language', activeLanguage);
      if (activeTag) u.searchParams.set('tag', activeTag);
      if (activeStyle) u.searchParams.set('style', activeStyle);
      if (activeMood) u.searchParams.set('mood', activeMood);
      u.searchParams.set('limit', '36');
      var res = await fetch(u.toString(), { credentials: 'omit' });
      var data = await res.json().catch(function () {
        return {};
      });
      items = (data && (data.items || data.designs)) || [];
      renderGrid();
      if (activeTab === 'yours' && hasProcessingItems(items)) scheduleProcessPoll();
      else if (!hasProcessingItems(items)) stopProcessPoll();
    } catch (_e) {
      items = [];
      renderGrid();
    } finally {
      isLoading = false;
      if (loading) loading.style.display = 'none';
    }
  }

  function resolveSectionId() {
    if (sectionId) return sectionId;
    var shopW = document.querySelector('[data-eaz-shop-design-studio="1"]');
    if (shopW && shopW.id) {
      var sm = shopW.id.match(/creator-widget-(.+)/);
      if (sm) return sm[1];
    }
    if (sectionId === 'eaz-shop-dg' || document.getElementById('eaz-shop-dg-modal')) {
      return 'eaz-shop-dg';
    }
    var widget = document.querySelector('[id^="creator-widget-"]');
    if (widget) {
      var m = widget.id.match(/creator-widget-(.+)/);
      if (m) return m[1];
    }
    return null;
  }

  function influenceMetaFromResult(result, qiId) {
    var meta = {
      source: 'quick_inspiration',
      quick_inspiration_id: qiId
    };
    if (!result) return meta;
    if (result.inspiration_mode) meta.inspiration_mode = result.inspiration_mode;
    if (result.elements) meta.elements = result.elements;
    if (result.include_elements) meta.include_elements = result.include_elements;
    if (result.exclude_elements) meta.exclude_elements = result.exclude_elements;
    return meta;
  }

  function strengthFromResult(result) {
    if (result && typeof result.strength === 'number' && !isNaN(result.strength)) {
      return result.strength;
    }
    return QI_STRENGTH;
  }

  function openReferenceInfluenceThen(imageUrl, onApply, onCancel) {
    if (window.ReferenceInfluenceModal && typeof window.ReferenceInfluenceModal.open === 'function') {
      window.ReferenceInfluenceModal.open({
        imageUrl: imageUrl,
        initialStrength: QI_STRENGTH,
        onApply: function (result) {
          if (!result) return;
          onApply(result);
        },
        onCancel: typeof onCancel === 'function' ? onCancel : undefined
      });
      return;
    }
    onApply({ strength: QI_STRENGTH, imageUrl: imageUrl });
  }

  function applyItem(item) {
    var imageUrl = item.image_url || item.thumb_url;
    if (!imageUrl) return;
    var qiId = item.id ? String(item.id) : null;
    var returnOnCancel = pendingOnCancel;

    // Generator / Automations: hand off via event — consumers open Reference Influence
    if (window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE || window.__automationsRefPickActive) {
      selectionInProgress = true;
      pendingOnCancel = null;
      if (returnOnCancel) {
        try {
          window.__eazPendingRefSourceReturn = returnOnCancel;
        } catch (eRet) {}
      }
      close({ skipCancel: true });
      window.dispatchEvent(
        new CustomEvent('gen-design-selected', {
          detail: {
            imageUrl: imageUrl,
            quickInspiration: true,
            quickInspirationId: qiId,
            source: 'quick_inspiration'
          }
        })
      );
      window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE = false;
      return;
    }

    var sid = resolveSectionId();

    // Shop Design Generator: Reference Influence → then add ref
    if (typeof window.eazShopDgAddRef === 'function' && sid === 'eaz-shop-dg') {
      selectionInProgress = true;
      pendingOnCancel = null;
      close({ skipCancel: true });
      openReferenceInfluenceThen(
        imageUrl,
        function (result) {
          var outUrl = (result.imageUrl && String(result.imageUrl).trim()) || imageUrl;
          window.eazShopDgAddRef(outUrl, strengthFromResult(result), influenceMetaFromResult(result, qiId));
        },
        returnOnCancel
      );
      return;
    }

    // Reference Search: skip influence — start search directly
    if (sid === 'eaz-ref-search' && window.EazReferenceSearch && typeof window.EazReferenceSearch.startFromUrl === 'function') {
      selectionInProgress = true;
      pendingOnCancel = null;
      close({ skipCancel: true });
      window.EazReferenceSearch.startFromUrl(imageUrl);
      return;
    }

    // Shop Design Studio: Reference Influence → then add ref chip
    if (
      document.body.classList.contains('eaz-shop-studio-open') &&
      typeof window.eazShopStudioRefsAdd === 'function' &&
      sid
    ) {
      selectionInProgress = true;
      pendingOnCancel = null;
      close({ skipCancel: true });
      openReferenceInfluenceThen(
        imageUrl,
        function (result) {
          var outUrl = (result.imageUrl && String(result.imageUrl).trim()) || imageUrl;
          var st = strengthFromResult(result);
          var pct = st <= 1 && st >= 0 ? Math.round(st * 100) : Math.round(st);
          window.eazShopStudioRefsAdd(sid, outUrl, pct, influenceMetaFromResult(result, qiId));
        },
        returnOnCancel
      );
      return;
    }

    // Fallback (widget / other): event → consumer opens Reference Influence
    selectionInProgress = true;
    pendingOnCancel = null;
    if (returnOnCancel) {
      try {
        window.__eazPendingRefSourceReturn = returnOnCancel;
      } catch (eRet2) {}
    }
    close({ skipCancel: true });
    window.dispatchEvent(
      new CustomEvent('gen-design-selected', {
        detail: {
          imageUrl: imageUrl,
          quickInspiration: true,
          quickInspirationId: qiId,
          source: 'quick_inspiration',
          sectionId: sid
        }
      })
    );
  }

  function hostDialogs(host) {
    if (!host) return;
    [sourceModal, uploadModal, deleteConfirmModal].forEach(function (dlg) {
      if (dlg && dlg.parentElement !== host) {
        try {
          host.appendChild(dlg);
        } catch (_e) {}
      }
    });
  }

  function open(opts) {
    opts = opts || {};
    if (!ensureEls()) return;
    sectionId = opts.sectionId != null ? String(opts.sectionId).trim() : null;
    pendingOnCancel = typeof opts.onCancel === 'function' ? opts.onCancel : null;
    selectionInProgress = false;
    selectedId = null;
    closePreview();
    setSidebarOpen(false);
    setDesktopSidebarCollapsed(false);
    setEazyTipOpen(false);

    /*
     * Always portal to document.body + showModal().
     * Printify Design Studio is a native <dialog showModal()> (browser top layer).
     * A plain div with any z-index (even 2147483000) paints UNDER that top layer.
     * Nesting inside eazShopStudioModalRoot also cannot escape another top-layer dialog.
     */
    portalToBody(modal);
    hostDialogs(document.body);

    lockScroll();
    modal.classList.add('creator-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.cssText =
      'opacity:1; pointer-events:auto; display:flex; position:fixed; inset:0; margin:0; padding:0; border:none; max-width:none; max-height:none; width:100%; height:100%; box-sizing:border-box; align-items:center; justify-content:center; background:rgba(2,6,23,0.92);';
    try {
      if (typeof modal.showModal === 'function') {
        if (!modal.open) modal.showModal();
      } else {
        modal.setAttribute('open', '');
      }
    } catch (_e) {
      modal.setAttribute('open', '');
    }
    hardenCommonLabels();
    setActiveTab(opts.tab === 'yours' || opts.focusYours ? 'yours' : 'public');
    loadFilterTags();
    loadItems().then(function () {
      if (activeTab !== 'yours' && getOwnerId()) {
        // Silent check: if user has processing uploads, jump to Yours so pending tiles show.
        var u = apiUrl('list-quick-inspirations');
        u.searchParams.set('mine', '1');
        u.searchParams.set('limit', '12');
        return fetch(u.toString(), { credentials: 'omit' })
          .then(function (r) {
            return r.json().catch(function () {
              return {};
            });
          })
          .then(function (data) {
            var mine = (data && (data.items || data.designs)) || [];
            if (hasProcessingItems(mine)) {
              setActiveTab('yours');
              return loadItems({ silent: true });
            }
          });
      }
    });
  }

  function clearPhoneHook() {
    try {
      window.__qiPhoneUploadApply = null;
    } catch (_e) {}
  }

  function close(opts) {
    var skipCancel = opts && opts.skipCancel;
    if (!ensureEls()) return;
    closePreview();
    setSidebarOpen(false);
    setEazyTipOpen(false);
    closeDeleteConfirm(false);
    closeSourcePicker();
    closeUpload();
    clearPhoneHook();
    modal.classList.remove('creator-modal--open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.cssText = '';
    hideDialog(modal);
    unlockScroll();
    sectionId = null;
    var cancelCb = pendingOnCancel;
    pendingOnCancel = null;
    if (!skipCancel && !selectionInProgress && typeof cancelCb === 'function') {
      setTimeout(function () {
        try {
          cancelCb();
        } catch (eC) {}
      }, 0);
    }
    selectionInProgress = false;
  }

  function showUploadStatus(msg, kind) {
    var el = document.getElementById('qi-upload-status');
    if (!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.className = 'qi-upload__status' + (kind ? ' is-' + kind : '');
    el.textContent = msg || '';
  }

  /**
   * Idle Upload label without t() DOM fallback.
   * The submit button uses data-t=upload_submit; while busy its text is "Uploading…",
   * so t('…upload_submit') would read that back and leave the button stuck.
   */
  function uploadSubmitIdleLabel() {
    try {
      var i18n = window.CreatorI18n || {};
      if (typeof i18n['creator.quick_inspirations.upload_submit'] === 'string') {
        return i18n['creator.quick_inspirations.upload_submit'];
      }
      var nested = i18n.quick_inspirations && i18n.quick_inspirations.upload_submit;
      if (typeof nested === 'string') return nested;
    } catch (_e) {}
    return 'Upload';
  }

  function setUploadSubmitting(isBusy) {
    uploading = !!isBusy;
    var submit = document.getElementById('qi-upload-submit');
    if (!submit) return;
    if (isBusy) {
      submit.disabled = true;
      submit.textContent = t('creator.quick_inspirations.uploading', 'Uploading…');
      return;
    }
    submit.textContent = uploadSubmitIdleLabel();
    submit.disabled = pendingFiles.length === 0;
  }

  function renderPendingPreviews() {
    var wrap = document.getElementById('qi-upload-preview');
    var submit = document.getElementById('qi-upload-submit');
    if (!wrap) return;
    wrap.innerHTML = '';
    pendingFiles.forEach(function (file) {
      var img = document.createElement('img');
      img.alt = file.name || 'preview';
      img.src = URL.createObjectURL(file);
      wrap.appendChild(img);
    });
    if (submit) {
      if (!uploading) submit.textContent = uploadSubmitIdleLabel();
      submit.disabled = pendingFiles.length === 0 || uploading;
    }
  }

  async function checkBanBeforeUpload() {
    var oid = getOwnerId();
    if (!oid) {
      showUploadStatus(t('creator.quick_inspirations.login_required', 'Please sign in to upload.'), 'error');
      return false;
    }
    try {
      var res = await fetch(apiUrl('quick-inspiration-upload-status').toString(), { credentials: 'omit' });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data && data.allowed === false) {
        var msg =
          data.status === 'permanent'
            ? t('creator.quick_inspirations.ban_permanent', 'Your Quick Inspiration uploads are permanently blocked due to repeated policy violations.')
            : t('creator.quick_inspirations.ban_temp', 'Quick Inspiration uploads are temporarily blocked for 7 days due to policy violations.');
        if (data.temp_banned_until) {
          try {
            msg += ' ' + new Date(data.temp_banned_until).toLocaleString();
          } catch (_e) {}
        }
        showUploadStatus(msg, 'error');
        return false;
      }
    } catch (_e2) {}
    return true;
  }

  function refreshScreenshotOption() {
    if (!sourceModal) return;
    var shotBtn = sourceModal.querySelector('[data-qi-source="screenshot"]');
    if (!shotBtn) return;
    if (!(window.EazScreenshotCapture && typeof window.EazScreenshotCapture.bindOption === 'function')) {
      return;
    }
    if (!screenshotBinder) {
      screenshotBinder = window.EazScreenshotCapture.bindOption(shotBtn);
    } else {
      screenshotBinder.refresh();
    }
  }

  function getPasteBtn() {
    return sourceModal ? sourceModal.querySelector('[data-qi-source="paste"]') : null;
  }

  function clearPasteInlineMsg() {
    var pasteBtn = getPasteBtn();
    if (pasteBtn && window.EazClipboardImage && typeof window.EazClipboardImage.clearInlineMessage === 'function') {
      window.EazClipboardImage.clearInlineMessage(pasteBtn);
    }
  }

  function refreshPasteOption() {
    if (!sourceModal) return;
    var pasteBtn = getPasteBtn();
    if (!pasteBtn) return;
    if (!(window.EazClipboardImage && typeof window.EazClipboardImage.bindOption === 'function')) {
      return;
    }
    if (!pasteBinder) {
      pasteBinder = window.EazClipboardImage.bindOption(pasteBtn, {
        isOpen: function () {
          var m = sourceModal || document.getElementById('qi-upload-source-modal');
          return !!(m && m.open);
        }
      });
    } else {
      pasteBinder.refresh();
    }
  }

  function openSourcePicker() {
    if (!sourceModal) sourceModal = document.getElementById('qi-upload-source-modal');
    if (!sourceModal) {
      // Fallback: device file picker only
      pickDeviceFiles(true, false);
      return;
    }
    clearPasteInlineMsg();
    refreshScreenshotOption();
    refreshPasteOption();
    if (!window.EazScreenshotCapture) {
      setTimeout(refreshScreenshotOption, 50);
      setTimeout(refreshScreenshotOption, 250);
    }
    if (!window.EazClipboardImage) {
      setTimeout(refreshPasteOption, 50);
      setTimeout(refreshPasteOption, 250);
    }
    showDialog(sourceModal);
  }

  function closeSourcePicker() {
    hideDialog(sourceModal || document.getElementById('qi-upload-source-modal'));
  }

  function openConfirmUpload() {
    if (!uploadModal) uploadModal = document.getElementById('qi-upload-modal');
    if (!uploadModal) return;
    renderPendingPreviews();
    showUploadStatus('', '');
    showDialog(uploadModal);
  }

  function closeUpload() {
    hideDialog(uploadModal || document.getElementById('qi-upload-modal'));
    pendingFiles = [];
    setUploadSubmitting(false);
    renderPendingPreviews();
  }

  function showEditorStatus(msg, kind) {
    var el = document.getElementById('qi-editor-status');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'qi-upload__status';
      return;
    }
    el.style.display = '';
    el.textContent = msg;
    el.className = 'qi-upload__status' + (kind === 'error' ? ' is-error' : kind === 'warn' ? ' is-warn' : '');
  }

  function showSegmentConfigStatus(msg, kind) {
    var el = document.getElementById('qi-segment-config-status');
    if (!el) return;
    if (!msg) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'qi-upload__status';
      return;
    }
    el.style.display = '';
    el.textContent = msg;
    el.className = 'qi-upload__status' + (kind === 'error' ? ' is-error' : kind === 'warn' ? ' is-warn' : '');
  }

  function clampFrame(f) {
    var min = 0.02;
    var x = Math.max(0, Math.min(1, Number(f.x) || 0));
    var y = Math.max(0, Math.min(1, Number(f.y) || 0));
    var w = Math.max(min, Math.min(1, Number(f.w) || min));
    var h = Math.max(min, Math.min(1, Number(f.h) || min));
    if (x + w > 1) w = Math.max(min, 1 - x);
    if (y + h > 1) h = Math.max(min, 1 - y);
    return { x: x, y: y, w: w, h: h };
  }

  function buildEvenGridSegments(count) {
    var n = Math.max(2, Math.min(12, Math.round(Number(count) || 4)));
    var cols = Math.ceil(Math.sqrt(n));
    var rows = Math.ceil(n / cols);
    var cellW = 1 / cols;
    var cellH = 1 / rows;
    var out = [];
    for (var i = 0; i < n; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      out.push(clampFrame({ x: col * cellW, y: row * cellH, w: cellW, h: cellH }));
    }
    return out;
  }

  function newBatchId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return 'qib_' + window.crypto.randomUUID();
      }
    } catch (_e) {}
    return 'qib_' + Date.now().toString(36) + '_' + Math.random().toString(16).slice(2, 10);
  }

  function revokeEditorObjectUrl() {
    if (editorObjectUrl) {
      try {
        URL.revokeObjectURL(editorObjectUrl);
      } catch (_e) {}
      editorObjectUrl = null;
    }
  }

  function getEditorImageRect() {
    var img = document.getElementById('qi-editor-img');
    if (!img) return { w: 0, h: 0 };
    return { w: img.clientWidth || 0, h: img.clientHeight || 0 };
  }

  function paintEditorDim() {
    var canvas = document.getElementById('qi-editor-dim');
    var img = document.getElementById('qi-editor-img');
    if (!canvas || !img) return;
    var w = img.clientWidth;
    var h = img.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(2, 6, 23, 0.62)';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < editorFrames.length; i++) {
      var f = editorFrames[i];
      ctx.clearRect(f.x * w, f.y * h, f.w * w, f.h * h);
    }
  }

  function renderEditorFrames() {
    var host = document.getElementById('qi-editor-frames');
    if (!host) return;
    host.innerHTML = '';
    editorFrames.forEach(function (f, idx) {
      var el = document.createElement('div');
      el.className = 'qi-editor__frame' + (idx === editorActiveFrame ? ' is-active' : '');
      el.style.left = f.x * 100 + '%';
      el.style.top = f.y * 100 + '%';
      el.style.width = f.w * 100 + '%';
      el.style.height = f.h * 100 + '%';
      el.setAttribute('data-frame-index', String(idx));
      var label = document.createElement('span');
      label.className = 'qi-editor__frame-label';
      label.textContent = String(idx + 1);
      el.appendChild(label);
      ['nw', 'ne', 'sw', 'se'].forEach(function (corner) {
        var h = document.createElement('span');
        h.className = 'qi-editor__handle qi-editor__handle--' + corner;
        h.setAttribute('data-handle', corner);
        el.appendChild(h);
      });
      host.appendChild(el);
    });
    paintEditorDim();
  }

  function setEditorMode(mode, opts) {
    var openSegmentModal = !(opts && opts.skipSegmentModal);
    editorMode = mode === 'segment' ? 'segment' : 'crop';
    var cropTab = document.getElementById('qi-editor-tab-crop');
    var segTab = document.getElementById('qi-editor-tab-segment');
    if (cropTab) {
      cropTab.classList.toggle('is-active', editorMode === 'crop');
      cropTab.setAttribute('aria-selected', editorMode === 'crop' ? 'true' : 'false');
    }
    if (segTab) {
      segTab.classList.toggle('is-active', editorMode === 'segment');
      segTab.setAttribute('aria-selected', editorMode === 'segment' ? 'true' : 'false');
    }
    var hint = document.getElementById('qi-editor-hint');
    if (hint) {
      hint.setAttribute(
        'data-t',
        editorMode === 'segment'
          ? 'creator.quick_inspirations.editor_hint_segment'
          : 'creator.quick_inspirations.editor_hint_crop'
      );
      hint.textContent =
        editorMode === 'segment'
          ? t('creator.quick_inspirations.editor_hint_segment', 'Adjust each frame. Areas outside frames are dimmed.')
          : t('creator.quick_inspirations.editor_hint_crop', 'Drag and resize the frame to crop the image.');
    }
    if (editorMode === 'crop') {
      editorFrames = [clampFrame({ x: 0, y: 0, w: 1, h: 1 })];
      editorActiveFrame = 0;
      renderEditorFrames();
    } else if (openSegmentModal) {
      openSegmentConfigModal();
    }
  }

  function updateEditorProgress() {
    var el = document.getElementById('qi-editor-progress');
    if (!el) return;
    if (editorQueue.length <= 1) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    var tpl = t('creator.quick_inspirations.editor_file_of', 'File {{current}} of {{total}}');
    el.textContent = tpl
      .replace('{{current}}', String(editorQueueIndex + 1))
      .replace('{{total}}', String(editorQueue.length));
  }

  function closeSegmentConfigModal() {
    hideDialog(segmentConfigModal || document.getElementById('qi-segment-config-modal'));
    showSegmentConfigStatus('', '');
  }

  function openSegmentConfigModal() {
    if (!segmentConfigModal) segmentConfigModal = document.getElementById('qi-segment-config-modal');
    if (!segmentConfigModal) return;
    var countEl = document.getElementById('qi-segment-count');
    var analyzeEl = document.getElementById('qi-segment-analyze');
    if (countEl && !countEl.value) countEl.value = '4';
    if (analyzeEl) analyzeEl.checked = false;
    showSegmentConfigStatus('', '');
    showDialog(segmentConfigModal);
  }

  function applyEditorFrames(frames) {
    editorFrames = (frames || []).map(clampFrame);
    if (!editorFrames.length) editorFrames = [clampFrame({ x: 0, y: 0, w: 1, h: 1 })];
    editorActiveFrame = 0;
    renderEditorFrames();
  }

  async function confirmSegmentConfig() {
    var countEl = document.getElementById('qi-segment-count');
    var analyzeEl = document.getElementById('qi-segment-analyze');
    var count = Math.max(2, Math.min(12, Math.round(Number(countEl && countEl.value) || 4)));
    if (countEl) countEl.value = String(count);
    var useAi = !!(analyzeEl && analyzeEl.checked);
    var confirmBtn = document.getElementById('qi-segment-config-confirm');
    if (confirmBtn) confirmBtn.disabled = true;

    if (!useAi) {
      applyEditorFrames(buildEvenGridSegments(count));
      closeSegmentConfigModal();
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    var file = editorQueue[editorQueueIndex];
    if (!file) {
      applyEditorFrames(buildEvenGridSegments(count));
      closeSegmentConfigModal();
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    showSegmentConfigStatus(
      t('creator.quick_inspirations.segment_analyzing', 'Analyzing segments…'),
      'warn'
    );
    try {
      var form = new FormData();
      form.append('image', file, file.name || 'inspiration.jpg');
      form.append('count', String(count));
      var res = await fetch(apiUrl('analyze-qi-segments').toString(), {
        method: 'POST',
        body: form,
        credentials: 'omit'
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data && Array.isArray(data.segments) && data.segments.length) {
        applyEditorFrames(data.segments);
        if (data.source === 'grid_fallback') {
          showEditorStatus(
            t(
              'creator.quick_inspirations.segment_analyze_failed',
              'Could not analyze segments. Using an even grid instead.'
            ),
            'warn'
          );
        } else {
          showEditorStatus('', '');
        }
      } else {
        applyEditorFrames(buildEvenGridSegments(count));
        showEditorStatus(
          t(
            'creator.quick_inspirations.segment_analyze_failed',
            'Could not analyze segments. Using an even grid instead.'
          ),
          'warn'
        );
      }
      closeSegmentConfigModal();
    } catch (_e) {
      applyEditorFrames(buildEvenGridSegments(count));
      closeSegmentConfigModal();
      showEditorStatus(
        t(
          'creator.quick_inspirations.segment_analyze_failed',
          'Could not analyze segments. Using an even grid instead.'
        ),
        'warn'
      );
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
    }
  }

  function onEditorPointerDown(e) {
    if (editorSaving) return;
    var target = e.target;
    if (!target || !target.closest) return;
    var frameEl = target.closest('.qi-editor__frame');
    if (!frameEl) return;
    var idx = Number(frameEl.getAttribute('data-frame-index'));
    if (!Number.isFinite(idx) || !editorFrames[idx]) return;
    editorActiveFrame = idx;
    renderEditorFrames();
    var rect = getEditorImageRect();
    if (!rect.w || !rect.h) return;
    var handle = target.getAttribute('data-handle') || (target.closest('[data-handle]') && target.closest('[data-handle]').getAttribute('data-handle'));
    var f = editorFrames[idx];
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    editorDrag = {
      index: idx,
      mode: handle || 'move',
      startX: clientX,
      startY: clientY,
      origin: { x: f.x, y: f.y, w: f.w, h: f.h },
      stageW: rect.w,
      stageH: rect.h
    };
    e.preventDefault();
  }

  function onEditorPointerMove(e) {
    if (!editorDrag) return;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var dx = (clientX - editorDrag.startX) / editorDrag.stageW;
    var dy = (clientY - editorDrag.startY) / editorDrag.stageH;
    var o = editorDrag.origin;
    var next = { x: o.x, y: o.y, w: o.w, h: o.h };
    var mode = editorDrag.mode;
    if (mode === 'move') {
      next.x = o.x + dx;
      next.y = o.y + dy;
      next.x = Math.max(0, Math.min(1 - next.w, next.x));
      next.y = Math.max(0, Math.min(1 - next.h, next.y));
    } else {
      if (mode.indexOf('e') !== -1) next.w = o.w + dx;
      if (mode.indexOf('s') !== -1) next.h = o.h + dy;
      if (mode.indexOf('w') !== -1) {
        next.x = o.x + dx;
        next.w = o.w - dx;
      }
      if (mode.indexOf('n') !== -1) {
        next.y = o.y + dy;
        next.h = o.h - dy;
      }
    }
    editorFrames[editorDrag.index] = clampFrame(next);
    renderEditorFrames();
    e.preventDefault();
  }

  function onEditorPointerUp() {
    editorDrag = null;
  }

  function bindEditorPointers() {
    if (editorPointerBound) return;
    editorPointerBound = true;
    document.addEventListener('mousemove', onEditorPointerMove);
    document.addEventListener('mouseup', onEditorPointerUp);
    document.addEventListener('touchmove', onEditorPointerMove, { passive: false });
    document.addEventListener('touchend', onEditorPointerUp);
    document.addEventListener('touchcancel', onEditorPointerUp);
    var stage = document.getElementById('qi-editor-stage');
    if (stage) {
      stage.addEventListener('mousedown', onEditorPointerDown);
      stage.addEventListener('touchstart', onEditorPointerDown, { passive: false });
    }
  }

  function closeEditor(clearQueue) {
    hideDialog(editorModal || document.getElementById('qi-editor-modal'));
    closeSegmentConfigModal();
    revokeEditorObjectUrl();
    editorDrag = null;
    editorSaving = false;
    showEditorStatus('', '');
    var saveBtn = document.getElementById('qi-editor-save');
    if (saveBtn) saveBtn.disabled = false;
    if (clearQueue !== false) {
      editorQueue = [];
      editorQueueIndex = 0;
      pendingFiles = [];
    }
  }

  function loadEditorFile(file) {
    revokeEditorObjectUrl();
    showEditorStatus('', '');
    var img = document.getElementById('qi-editor-img');
    if (!img || !file) return;
    editorObjectUrl = URL.createObjectURL(file);
    img.onload = function () {
      editorNaturalW = img.naturalWidth || 0;
      editorNaturalH = img.naturalHeight || 0;
      setEditorMode('crop', { skipSegmentModal: true });
      editorFrames = [clampFrame({ x: 0, y: 0, w: 1, h: 1 })];
      editorActiveFrame = 0;
      renderEditorFrames();
      requestAnimationFrame(function () {
        paintEditorDim();
        setTimeout(paintEditorDim, 50);
      });
    };
    img.onerror = function () {
      showEditorStatus(t('creator.quick_inspirations.upload_failed', 'Upload failed.'), 'error');
    };
    img.src = editorObjectUrl;
    updateEditorProgress();
  }

  function openEditorQueue() {
    if (!editorModal) editorModal = document.getElementById('qi-editor-modal');
    if (!editorModal) {
      openConfirmUpload();
      return;
    }
    bindEditorPointers();
    showDialog(editorModal);
    loadEditorFile(editorQueue[editorQueueIndex]);
  }

  function cropFrameToFile(file, frame, index) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var nw = img.naturalWidth;
          var nh = img.naturalHeight;
          var sx = Math.round(frame.x * nw);
          var sy = Math.round(frame.y * nh);
          var sw = Math.max(1, Math.round(frame.w * nw));
          var sh = Math.max(1, Math.round(frame.h * nh));
          if (sx + sw > nw) sw = nw - sx;
          if (sy + sh > nh) sh = nh - sy;
          var canvas = document.createElement('canvas');
          canvas.width = sw;
          canvas.height = sh;
          var ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('canvas'));
            return;
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
          canvas.toBlob(
            function (blob) {
              URL.revokeObjectURL(url);
              if (!blob) {
                reject(new Error('blob'));
                return;
              }
              var base = (file.name || 'inspiration').replace(/\.[^.]+$/, '');
              var outName = base + (editorFrames.length > 1 ? '-seg' + (index + 1) : '-crop') + '.png';
              resolve(new File([blob], outName, { type: 'image/png' }));
            },
            'image/png',
            0.92
          );
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('image_load'));
      };
      img.src = url;
    });
  }

  async function uploadCroppedFiles(files, batchId) {
    var form = new FormData();
    files.forEach(function (f) {
      form.append('images', f, f.name || 'inspiration.png');
    });
    if (batchId) form.append('upload_batch_id', batchId);
    var res = await fetch(apiUrl('upload-quick-inspiration').toString(), {
      method: 'POST',
      body: form,
      credentials: 'omit'
    });
    var data = await res.json().catch(function () {
      return {};
    });
    return data;
  }

  function reopenEditorWithError(message) {
    editorSaving = false;
    var saveBtn = document.getElementById('qi-editor-save');
    if (saveBtn) saveBtn.disabled = false;
    if (!editorModal || !editorModal.open) {
      showDialog(editorModal || document.getElementById('qi-editor-modal'));
    }
    showEditorStatus(message, 'error');
  }

  async function saveEditorCurrent() {
    if (editorSaving) return;
    var oid = getOwnerId();
    if (!oid) {
      showEditorStatus(t('creator.quick_inspirations.login_required', 'Please sign in to upload.'), 'error');
      return;
    }
    var file = editorQueue[editorQueueIndex];
    if (!file || !editorFrames.length) return;

    editorSaving = true;
    var saveBtn = document.getElementById('qi-editor-save');
    if (saveBtn) saveBtn.disabled = true;
    showEditorStatus(t('creator.quick_inspirations.editor_saving', 'Saving and uploading…'), 'warn');

    try {
      var crops = [];
      for (var i = 0; i < editorFrames.length; i++) {
        crops.push(await cropFrameToFile(file, editorFrames[i], i));
      }
      var batchId = crops.length > 1 ? newBatchId() : null;
      // Single crop still counts as 1 upload (no batch id needed).
      var data = await uploadCroppedFiles(crops, batchId);

      if (data.error === 'missing_owner_id') {
        reopenEditorWithError(t('creator.quick_inspirations.login_required', 'Please sign in to upload.'));
        return;
      }
      if (data.error === 'upload_banned' || (data.rejected && data.rejected[0] && data.rejected[0].error === 'upload_banned')) {
        reopenEditorWithError(
          strikeMessage(data.strike) ||
            t('creator.quick_inspirations.ban_temp', 'Quick Inspiration uploads are temporarily blocked.')
        );
        return;
      }
      if (data.error === 'daily_upload_limit') {
        reopenEditorWithError(
          t('creator.quick_inspirations.daily_limit', 'Daily upload limit reached (10 Quick Inspirations per day).')
        );
        return;
      }
      if (!(data.count_ok > 0)) {
        var first = (data.rejected && data.rejected[0]) || {};
        var detail =
          strikeMessage(data.strike || first.strike) ||
          (first.error && first.error !== 'upload_failed' ? String(first.error) : '') ||
          (data.error && data.error !== 'upload_failed' ? String(data.error) : '') ||
          t('creator.quick_inspirations.upload_failed', 'Upload failed.');
        reopenEditorWithError(detail);
        return;
      }

      editorQueueIndex += 1;
      if (editorQueueIndex < editorQueue.length) {
        editorSaving = false;
        if (saveBtn) saveBtn.disabled = false;
        showEditorStatus('', '');
        loadEditorFile(editorQueue[editorQueueIndex]);
        return;
      }

      // Done with queue
      closeEditor(true);
      closeSourcePicker();
      hideDialog(uploadModal || document.getElementById('qi-upload-modal'));
      closePreview();
      setActiveTab('yours');
      await loadItems();
      loadFilterTags();
      scheduleProcessPoll();
    } catch (_e) {
      reopenEditorWithError(t('creator.quick_inspirations.upload_failed', 'Upload failed.'));
    }
  }

  async function openUploadFlow() {
    ensureEls();
    var oid = getOwnerId();
    if (!oid) {
      // Show confirm dialog just for the status message
      openConfirmUpload();
      showUploadStatus(t('creator.quick_inspirations.login_required', 'Please sign in to upload.'), 'error');
      var submit = document.getElementById('qi-upload-submit');
      if (submit) submit.disabled = true;
      return;
    }
    var ok = await checkBanBeforeUpload();
    if (!ok) {
      openConfirmUpload();
      var submit2 = document.getElementById('qi-upload-submit');
      if (submit2) submit2.disabled = true;
      return;
    }
    openSourcePicker();
  }

  function acceptFiles(files) {
    var list = Array.prototype.slice.call(files || [], 0).filter(Boolean).slice(0, 12);
    if (!list.length) return;
    pendingFiles = list;
    editorQueue = list.slice();
    editorQueueIndex = 0;
    closeSourcePicker();
    hideDialog(uploadModal || document.getElementById('qi-upload-modal'));
    openEditorQueue();
  }

  function pickDeviceFiles(multiple, useCamera) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    if (multiple) input.multiple = true;
    if (useCamera) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || [], 0).slice(0, 12);
      try {
        document.body.removeChild(input);
      } catch (_e) {}
      acceptFiles(files);
    });
    // Keep picker in same user-gesture turn
    input.click();
  }

  function handlePasteFromClipboard() {
    var pasteBtn = getPasteBtn();
    if (!(window.EazClipboardImage && typeof window.EazClipboardImage.start === 'function')) {
      if (pasteBtn && window.EazClipboardImage && window.EazClipboardImage.showInlineMessage) {
        window.EazClipboardImage.showInlineMessage(
          pasteBtn,
          window.EazClipboardImage.messageForError
            ? window.EazClipboardImage.messageForError('unsupported')
            : t(
                'creator.upload_source.paste_unsupported',
                'Paste from clipboard is not available in this browser. Use HTTPS with Chrome or Edge, or upload from your device.'
              )
        );
      }
      return;
    }

    // Keep picker open until clipboard yields an image (preserves user-gesture for clipboard.read).
    window.EazClipboardImage.start({ pasteBtn: pasteBtn, toast: false }).then(function (file) {
      if (!file) return;
      clearPasteInlineMsg();
      acceptFiles([file]);
    });
  }

  function handleSourceClick(source) {
    if (source === 'screenshot') {
      if (!(window.EazScreenshotCapture && typeof window.EazScreenshotCapture.start === 'function')) {
        closeSourcePicker();
        return;
      }
      var shotPromise = window.EazScreenshotCapture.start({ immediate: true });
      closeSourcePicker();
      shotPromise.then(function (file) {
        if (!file) return;
        acceptFiles([file]);
      });
      return;
    }

    if (source === 'paste') {
      handlePasteFromClipboard();
      return;
    }

    if (source === 'device') {
      closeSourcePicker();
      pickDeviceFiles(true, false);
      return;
    }

    if (source === 'camera') {
      closeSourcePicker();
      pickDeviceFiles(false, true);
      return;
    }

    if (source === 'phone') {
      closeSourcePicker();
      if (!window.CreatorPhoneUploadModal || typeof window.CreatorPhoneUploadModal.open !== 'function') {
        openConfirmUpload();
        showUploadStatus(t('creator.quick_inspirations.phone_unavailable', 'Phone upload is not available.'), 'error');
        return;
      }
      window.__qiPhoneUploadApply = function (imageUrl) {
        fetchUrlAsFile(imageUrl)
          .then(function (file) {
            if (!file) {
              openConfirmUpload();
              showUploadStatus(t('creator.quick_inspirations.upload_failed', 'Upload failed.'), 'error');
              return;
            }
            acceptFiles([file]);
          })
          .catch(function () {
            openConfirmUpload();
            showUploadStatus(t('creator.quick_inspirations.upload_failed', 'Upload failed.'), 'error');
          })
          .finally(function () {
            clearPhoneHook();
          });
        return true;
      };
      window.CreatorPhoneUploadModal.open({ sectionId: sectionId || resolveSectionId() || null });
    }
  }

  async function fetchUrlAsFile(url) {
    if (!url) return null;
    var res = await fetch(url, { credentials: 'omit', mode: 'cors' });
    if (!res.ok) throw new Error('fetch_failed');
    var blob = await res.blob();
    var type = (blob.type || 'image/jpeg').split(';')[0].trim();
    var ext = type.indexOf('png') !== -1 ? 'png' : type.indexOf('webp') !== -1 ? 'webp' : 'jpg';
    return new File([blob], 'phone-upload.' + ext, { type: type || 'image/jpeg' });
  }

  function strikeMessage(strike) {
    if (!strike) return '';
    if (strike.message_key === 'creator.quick_inspirations.ban_permanent') {
      return t('creator.quick_inspirations.ban_permanent', 'Your Quick Inspiration uploads are permanently blocked due to repeated policy violations.');
    }
    if (strike.message_key === 'creator.quick_inspirations.ban_temp') {
      return t('creator.quick_inspirations.ban_temp', 'Quick Inspiration uploads are temporarily blocked for 7 days due to policy violations.');
    }
    if (strike.message_key === 'creator.quick_inspirations.violation_warning') {
      return t(
        'creator.quick_inspirations.violation_warning',
        'Warning: repeated policy violations. Further violations will temporarily block uploads for 7 days.'
      );
    }
    return t(
      'creator.quick_inspirations.violation_info',
      'This image was rejected (copyright, nudity, or other prohibited content). It was not published.'
    );
  }

  function reopenUploadWithError(filesSnapshot, message) {
    pendingFiles = (filesSnapshot || []).slice();
    // Keep uploading=true until after dialog open so renderPendingPreviews does not
    // briefly enable the button; setUploadSubmitting(false) clears the busy label.
    openConfirmUpload();
    setUploadSubmitting(false);
    showUploadStatus(message, 'error');
  }

  async function submitUpload() {
    var oid = getOwnerId();
    if (!oid) {
      showUploadStatus(t('creator.quick_inspirations.login_required', 'Please sign in to upload.'), 'error');
      return;
    }
    if (!pendingFiles.length || uploading) return;
    setUploadSubmitting(true);
    showUploadStatus(t('creator.quick_inspirations.analyzing', 'Uploading and analyzing…'), 'warn');

    var filesSnapshot = pendingFiles.slice();
    var form = new FormData();
    filesSnapshot.forEach(function (f) {
      form.append('images', f, f.name || 'inspiration.jpg');
    });

    // Hide confirm UI and switch to Yours so pending tiles can appear after R2 insert.
    // Do not use closeUpload() here — it clears pendingFiles / uploading mid-request.
    closeSourcePicker();
    hideDialog(uploadModal || document.getElementById('qi-upload-modal'));
    closePreview();
    setActiveTab('yours');

    try {
      var res = await fetch(apiUrl('upload-quick-inspiration').toString(), {
        method: 'POST',
        body: form,
        credentials: 'omit'
      });
      var data = await res.json().catch(function () {
        return {};
      });

      if (data.error === 'missing_owner_id') {
        reopenUploadWithError(
          filesSnapshot,
          t('creator.quick_inspirations.login_required', 'Please sign in to upload.')
        );
        return;
      }

      if (data.count_ok > 0) {
        // Server inserted status=processing (+ R2 URLs). Reload Yours to show pending tiles;
        // poll until analyze finishes (works across modal close + page reload).
        pendingFiles = [];
        setUploadSubmitting(false);
        await loadItems();
        loadFilterTags();
        scheduleProcessPoll();
      } else if (data.error === 'upload_banned' || (data.rejected && data.rejected[0] && data.rejected[0].error === 'upload_banned')) {
        reopenUploadWithError(
          filesSnapshot,
          strikeMessage(data.strike) ||
            t('creator.quick_inspirations.ban_temp', 'Quick Inspiration uploads are temporarily blocked.')
        );
      } else if (data.error === 'daily_upload_limit') {
        reopenUploadWithError(
          filesSnapshot,
          t('creator.quick_inspirations.daily_limit', 'Daily upload limit reached (10 Quick Inspirations per day).')
        );
      } else {
        var first = (data.rejected && data.rejected[0]) || {};
        var detail =
          strikeMessage(data.strike || first.strike) ||
          (first.error && first.error !== 'upload_failed' ? String(first.error) : '') ||
          (data.error && data.error !== 'upload_failed' ? String(data.error) : '') ||
          t('creator.quick_inspirations.upload_failed', 'Upload failed.');
        reopenUploadWithError(filesSnapshot, detail);
      }
    } catch (_e) {
      reopenUploadWithError(
        filesSnapshot,
        t('creator.quick_inspirations.upload_failed', 'Upload failed.')
      );
    } finally {
      if (uploading) setUploadSubmitting(false);
    }
  }

  function bind() {
    if (bound) return;
    if (!ensureEls()) return;
    bound = true;
    hardenCommonLabels();

    var closeBtn = document.getElementById('quick-inspirations-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (modal && modal.classList.contains('is-preview')) {
          closePreview();
          return;
        }
        close();
      });
    }
    modal.addEventListener('cancel', function (e) {
      e.preventDefault();
      if (modal.classList.contains('is-preview')) {
        closePreview();
        return;
      }
      close();
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    var previewCancel = document.getElementById('qi-preview-cancel');
    if (previewCancel) {
      previewCancel.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        previewCancel.blur();
        closePreview();
      });
    }
    var previewApply = document.getElementById('qi-preview-apply');
    if (previewApply) {
      previewApply.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!previewItem) return;
        previewApply.blur();
        var item = previewItem;
        closePreview();
        selectedId = item.id;
        renderGrid();
        applyItem(item);
      });
    }
    var previewRemove = document.getElementById('qi-preview-remove');
    if (previewRemove) {
      previewRemove.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!previewItem) return;
        previewRemove.blur();
        deleteOwnItem(previewItem);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (deleteConfirmModal && deleteConfirmModal.open) {
        e.preventDefault();
        closeDeleteConfirm(false);
        return;
      }
      if (!modal || !(modal.open || modal.classList.contains('creator-modal--open'))) return;
      if (document.getElementById('qi-eazy-tip') && document.getElementById('qi-eazy-tip').classList.contains('is-visible')) {
        e.preventDefault();
        setEazyTipOpen(false);
        return;
      }
      if (modal.classList.contains('is-preview')) {
        e.preventDefault();
        closePreview();
      }
    });

    modal.querySelectorAll('[data-qi-tab]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var next = btn.getAttribute('data-qi-tab') === 'yours' ? 'yours' : 'public';
        if (next === activeTab) return;
        setActiveTab(next);
        items = [];
        selectedId = null;
        loadItems();
      });
    });

    var eazyBtn = document.getElementById('qi-eazy-btn');
    if (eazyBtn) {
      eazyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var tip = document.getElementById('qi-eazy-tip');
        setEazyTipOpen(!(tip && tip.classList.contains('is-visible')));
      });
    }
    document.addEventListener('click', function (e) {
      var tip = document.getElementById('qi-eazy-tip');
      if (!tip || !tip.classList.contains('is-visible')) return;
      if (e.target.closest && (e.target.closest('#qi-eazy-wrap') || e.target.closest('#qi-eazy-tip'))) return;
      setEazyTipOpen(false);
    });

    var filterToggle = document.getElementById('qi-filter-toggle');
    if (filterToggle) {
      filterToggle.addEventListener('click', function () {
        var body = modal.querySelector('.qi-modal__body');
        setSidebarOpen(!(body && body.classList.contains('is-sidebar-open')));
      });
    }
    var filterRail = document.getElementById('qi-filter-rail');
    if (filterRail) {
      filterRail.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var wrapper = document.getElementById('qi-sidebar-wrapper');
        setDesktopSidebarCollapsed(!(wrapper && wrapper.classList.contains('is-collapsed')));
      });
    }
    modal.querySelectorAll('[data-qi-toggle-group]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var group = btn.closest('[data-qi-filter-group]');
        if (!group) return;
        var openGroup = !group.classList.contains('is-open');
        group.classList.toggle('is-open', openGroup);
        btn.setAttribute('aria-expanded', openGroup ? 'true' : 'false');
      });
    });
    var backdrop = document.getElementById('qi-sidebar-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        setSidebarOpen(false);
      });
    }

    var deleteClose = document.getElementById('qi-delete-confirm-close');
    var deleteCancel = document.getElementById('qi-delete-confirm-cancel');
    var deleteOk = document.getElementById('qi-delete-confirm-ok');
    if (deleteClose) deleteClose.addEventListener('click', function () { closeDeleteConfirm(false); });
    if (deleteCancel) deleteCancel.addEventListener('click', function () { closeDeleteConfirm(false); });
    if (deleteOk) deleteOk.addEventListener('click', function () { closeDeleteConfirm(true); });
    if (deleteConfirmModal) {
      deleteConfirmModal.addEventListener('click', function (e) {
        if (e.target === deleteConfirmModal) closeDeleteConfirm(false);
      });
      deleteConfirmModal.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeDeleteConfirm(false);
      });
    }

    var reset = document.getElementById('qi-filter-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        activeProduct = '';
        activeContentType = '';
        activeLanguage = '';
        activeTag = '';
        activeStyle = '';
        activeMood = '';
        loadFilterTags();
        loadItems();
      });
    }

    var search = document.getElementById('qi-search');
    if (search) {
      search.addEventListener('input', function () {
        searchQuery = String(search.value || '').trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadItems, 280);
      });
    }

    var uploadOpen = document.getElementById('qi-upload-open');
    if (uploadOpen) uploadOpen.addEventListener('click', openUploadFlow);

    var sourceClose = document.getElementById('qi-upload-source-close');
    if (sourceClose) sourceClose.addEventListener('click', closeSourcePicker);
    if (sourceModal) {
      sourceModal.addEventListener('click', function (e) {
        if (e.target === sourceModal) closeSourcePicker();
      });
      sourceModal.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeSourcePicker();
      });
      sourceModal.querySelectorAll('[data-qi-source]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('is-disabled')) {
            return;
          }
          var source = btn.getAttribute('data-qi-source');
          if (source) handleSourceClick(source);
        });
      });
    }

    var uploadClose = document.getElementById('qi-upload-modal-close');
    var uploadCancel = document.getElementById('qi-upload-cancel');
    if (uploadClose) uploadClose.addEventListener('click', closeUpload);
    if (uploadCancel) uploadCancel.addEventListener('click', closeUpload);
    if (uploadModal) {
      uploadModal.addEventListener('click', function (e) {
        if (e.target === uploadModal) closeUpload();
      });
      uploadModal.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeUpload();
      });
    }

    var submit = document.getElementById('qi-upload-submit');
    if (submit) submit.addEventListener('click', submitUpload);

    var editorClose = document.getElementById('qi-editor-close');
    var editorCancel = document.getElementById('qi-editor-cancel');
    if (editorClose) editorClose.addEventListener('click', function () { closeEditor(true); });
    if (editorCancel) editorCancel.addEventListener('click', function () { closeEditor(true); });
    if (editorModal) {
      editorModal.addEventListener('click', function (e) {
        if (e.target === editorModal) closeEditor(true);
      });
      editorModal.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeEditor(true);
      });
    }
    var editorSave = document.getElementById('qi-editor-save');
    if (editorSave) editorSave.addEventListener('click', saveEditorCurrent);
    var cropTab = document.getElementById('qi-editor-tab-crop');
    var segTab = document.getElementById('qi-editor-tab-segment');
    if (cropTab) {
      cropTab.addEventListener('click', function () {
        setEditorMode('crop');
      });
    }
    if (segTab) {
      segTab.addEventListener('click', function () {
        setEditorMode('segment');
      });
    }
    window.addEventListener('resize', function () {
      if (editorModal && editorModal.open) paintEditorDim();
    });

    var segClose = document.getElementById('qi-segment-config-close');
    var segCancel = document.getElementById('qi-segment-config-cancel');
    if (segClose) segClose.addEventListener('click', closeSegmentConfigModal);
    if (segCancel) segCancel.addEventListener('click', closeSegmentConfigModal);
    if (segmentConfigModal) {
      segmentConfigModal.addEventListener('click', function (e) {
        if (e.target === segmentConfigModal) closeSegmentConfigModal();
      });
      segmentConfigModal.addEventListener('cancel', function (e) {
        e.preventDefault();
        closeSegmentConfigModal();
      });
    }
    var segConfirm = document.getElementById('qi-segment-config-confirm');
    if (segConfirm) segConfirm.addEventListener('click', confirmSegmentConfig);
  }

  function tryBind() {
    ensureEls();
    if (modal) bind();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryBind);
  } else {
    tryBind();
  }

  // Portal injects the partial after first paint — re-bind when modal appears later
  if (typeof MutationObserver !== 'undefined') {
    try {
      var obs = new MutationObserver(function () {
        if (!bound && document.getElementById('quick-inspirations-modal')) {
          tryBind();
          if (bound) obs.disconnect();
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_eObs) {}
  }

  window.QuickInspirationsModal = {
    open: function (opts) {
      tryBind();
      open(opts);
    },
    close: close
  };
})();
