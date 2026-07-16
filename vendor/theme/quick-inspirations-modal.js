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
  var activeTag = '';
  var activeStyle = '';
  var activeMood = '';
  var searchTimer = null;
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
    return !!modal;
  }

  function showDialog(dlg) {
    if (!dlg) return;
    try {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
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

  function emptyMessageForTab() {
    if (activeTab === 'yours') {
      if (!getOwnerId()) {
        return t('creator.quick_inspirations.empty_yours_login', 'Sign in to see your Quick Inspirations.');
      }
      return t('creator.quick_inspirations.empty_yours', 'You have no Quick Inspirations yet.');
    }
    return t('creator.quick_inspirations.empty', 'No quick inspirations yet. Be the first to upload!');
  }

  function renderFilterChips(containerId, list, activeValue, onPick) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    (list || []).forEach(function (row) {
      var name = row.name || row;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qi-filter-chip' + (activeValue === name ? ' is-active' : '');
      btn.textContent = name + (row.count ? ' (' + row.count + ')' : '');
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
    previewItem = item;
    var browse = document.getElementById('qi-browse-view');
    var preview = document.getElementById('qi-preview-view');
    var img = document.getElementById('qi-preview-image');
    var removeBtn = document.getElementById('qi-preview-remove');
    if (img) {
      img.src = item.image_url || item.thumb_url || '';
      img.alt = item.summary || t('creator.quick_inspirations.preview_aria', 'Preview inspiration');
    }
    if (removeBtn) {
      var owned = isOwnedItem(item);
      removeBtn.hidden = !owned;
      removeBtn.style.display = owned ? '' : 'none';
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
      var card = document.createElement('div');
      card.className = 'qi-card' + (selectedId === item.id ? ' is-selected' : '');
      card.setAttribute('data-id', item.id);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', previewAria);

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

      if (isOwnedItem(item)) {
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

      grid.appendChild(card);
    });
  }

  async function loadItems() {
    if (!ensureEls() || isLoading) return;
    isLoading = true;
    var loading = document.getElementById('qi-loading');
    var empty = document.getElementById('qi-empty');
    if (loading) loading.style.display = 'block';
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
      if (dlg && dlg.parentElement !== host) host.appendChild(dlg);
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

    var host = null;
    if (typeof window.eazCreatorAutomationLayerHost === 'function') {
      host = window.eazCreatorAutomationLayerHost();
    }
    if (!host && typeof window.eazShopStudioModalRoot === 'function') {
      host = window.eazShopStudioModalRoot();
    }
    if (!host) host = document.body;
    if (modal.parentElement !== host) host.appendChild(modal);
    hostDialogs(host);

    lockScroll();
    modal.classList.add('creator-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.cssText =
      'opacity:1; pointer-events:auto; display:flex; position:fixed; inset:0; z-index:2147483647; align-items:center; justify-content:center; background:rgba(2,6,23,0.92);';
    setActiveTab('public');
    loadFilterTags();
    loadItems();
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
    if (submit) submit.disabled = pendingFiles.length === 0 || uploading;
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
    renderPendingPreviews();
    uploading = false;
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
    closeSourcePicker();
    openConfirmUpload();
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

  async function submitUpload() {
    var oid = getOwnerId();
    if (!oid) {
      showUploadStatus(t('creator.quick_inspirations.login_required', 'Please sign in to upload.'), 'error');
      return;
    }
    if (!pendingFiles.length || uploading) return;
    uploading = true;
    var submit = document.getElementById('qi-upload-submit');
    if (submit) {
      submit.disabled = true;
      submit.textContent = t('creator.quick_inspirations.uploading', 'Uploading…');
    }
    showUploadStatus(t('creator.quick_inspirations.analyzing', 'Uploading and analyzing…'), 'warn');

    try {
      var form = new FormData();
      pendingFiles.forEach(function (f) {
        form.append('images', f, f.name || 'inspiration.jpg');
      });
      var res = await fetch(apiUrl('upload-quick-inspiration').toString(), {
        method: 'POST',
        body: form,
        credentials: 'omit'
      });
      var data = await res.json().catch(function () {
        return {};
      });

      if (data.error === 'missing_owner_id') {
        showUploadStatus(t('creator.quick_inspirations.login_required', 'Please sign in to upload.'), 'error');
        return;
      }

      if (data.strike) {
        showUploadStatus(strikeMessage(data.strike), data.strike.status === 'clear' ? 'error' : 'warn');
      }

      if (data.count_ok > 0) {
        var okMsg =
          t('creator.quick_inspirations.upload_success', 'Uploaded successfully.') +
          ' (' +
          data.count_ok +
          ')';
        if (data.count_rejected > 0) {
          okMsg +=
            ' ' +
            t('creator.quick_inspirations.some_rejected', 'Some images were rejected.') +
            (data.strike ? ' ' + strikeMessage(data.strike) : '');
          showUploadStatus(okMsg, 'warn');
        } else {
          showUploadStatus(okMsg, 'ok');
        }
        pendingFiles = [];
        renderPendingPreviews();
        loadItems();
        loadFilterTags();
        setTimeout(closeUpload, 900);
      } else if (data.error === 'upload_banned' || (data.rejected && data.rejected[0] && data.rejected[0].error === 'upload_banned')) {
        showUploadStatus(
          strikeMessage(data.strike) ||
            t('creator.quick_inspirations.ban_temp', 'Quick Inspiration uploads are temporarily blocked.'),
          'error'
        );
      } else if (data.error === 'daily_upload_limit') {
        showUploadStatus(
          t('creator.quick_inspirations.daily_limit', 'Daily upload limit reached (10 Quick Inspirations per day).'),
          'error'
        );
      } else {
        var first = (data.rejected && data.rejected[0]) || {};
        showUploadStatus(
          strikeMessage(data.strike || first.strike) ||
            t('creator.quick_inspirations.upload_failed', 'Upload failed.'),
          'error'
        );
      }
    } catch (_e) {
      showUploadStatus(t('creator.quick_inspirations.upload_failed', 'Upload failed.'), 'error');
    } finally {
      uploading = false;
      if (submit) {
        submit.textContent = t('creator.quick_inspirations.upload_submit', 'Upload');
        submit.disabled = pendingFiles.length === 0;
      }
    }
  }

  function bind() {
    if (bound) return;
    if (!ensureEls()) return;
    bound = true;

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
      if (!modal || !modal.classList.contains('creator-modal--open')) return;
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
