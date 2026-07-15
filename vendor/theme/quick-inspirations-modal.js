/**
 * Quick Inspirations Modal — browse + upload mood/screenshot inspirations.
 * Apply: exactly one image as loose inspiration (5%) for Creator Generator / Shop DG.
 */
(function () {
  'use strict';

  var API_BASE = 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  var QI_STRENGTH = 0.05;

  var modal = null;
  var uploadModal = null;
  var sectionId = null;
  var selectedId = null;
  var items = [];
  var searchQuery = '';
  var activeTag = '';
  var activeStyle = '';
  var activeMood = '';
  var searchTimer = null;
  var pendingFiles = [];
  var isLoading = false;
  var bound = false;

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

  function getOwnerId() {
    try {
      if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.OWNER_ID) {
        return String(window.CREATOR_API_CONFIG.OWNER_ID).trim();
      }
    } catch (_e) {}
    try {
      var meta = document.querySelector('meta[name="eaz-owner-id"]');
      if (meta && meta.content) return String(meta.content).trim();
    } catch (_e2) {}
    try {
      if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    } catch (_e3) {}
    try {
      var shop = document.querySelector('[data-owner-id], [data-customer-id]');
      if (shop) {
        return String(shop.getAttribute('data-owner-id') || shop.getAttribute('data-customer-id') || '').trim();
      }
    } catch (_e4) {}
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
    return !!modal;
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

  function renderGrid() {
    var grid = document.getElementById('qi-grid');
    var empty = document.getElementById('qi-empty');
    var loading = document.getElementById('qi-loading');
    if (!grid) return;
    if (loading) loading.style.display = 'none';
    grid.innerHTML = '';
    if (!items.length) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    items.forEach(function (item) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'qi-card' + (selectedId === item.id ? ' is-selected' : '');
      card.setAttribute('data-id', item.id);
      var img = document.createElement('img');
      img.src = item.thumb_url || item.image_url;
      img.alt = item.summary || 'Quick inspiration';
      img.loading = 'lazy';
      card.appendChild(img);
      var apply = document.createElement('span');
      apply.className = 'qi-card__apply';
      apply.textContent = t('creator.common.apply', 'Apply');
      card.appendChild(apply);
      card.addEventListener('click', function () {
        selectedId = item.id;
        renderGrid();
        applyItem(item);
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
    try {
      var u = apiUrl('list-quick-inspirations');
      if (searchQuery) u.searchParams.set('search', searchQuery);
      if (activeTag) u.searchParams.set('tag', activeTag);
      if (activeStyle) u.searchParams.set('style', activeStyle);
      if (activeMood) u.searchParams.set('mood', activeMood);
      u.searchParams.set('limit', '60');
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

  function applyItem(item) {
    var imageUrl = item.image_url || item.thumb_url;
    if (!imageUrl) return;
    var qiId = item.id ? String(item.id) : null;

    if (window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE) {
      close();
      window.dispatchEvent(
        new CustomEvent('gen-design-selected', {
          detail: {
            imageUrl: imageUrl,
            quickInspiration: true,
            quickInspirationId: qiId,
            similarity: QI_STRENGTH,
            referenceStrength: QI_STRENGTH,
            source: 'quick_inspiration'
          }
        })
      );
      window.__CREATOR_MOBILE_GEN_UPLOAD_ACTIVE = false;
      return;
    }

    var sid = resolveSectionId();

    // Shop Design Generator modal refs
    if (typeof window.eazShopDgAddRef === 'function') {
      close();
      window.eazShopDgAddRef(imageUrl, QI_STRENGTH, {
        source: 'quick_inspiration',
        quick_inspiration_id: qiId
      });
      return;
    }

    if (
      document.body.classList.contains('eaz-shop-studio-open') &&
      typeof window.eazShopStudioRefsAdd === 'function' &&
      sid
    ) {
      close();
      window.eazShopStudioRefsAdd(sid, imageUrl, 5, {
        source: 'quick_inspiration',
        quick_inspiration_id: qiId
      });
      return;
    }

    // Creator generator selectedImages via event
    close();
    window.dispatchEvent(
      new CustomEvent('gen-design-selected', {
        detail: {
          imageUrl: imageUrl,
          quickInspiration: true,
          quickInspirationId: qiId,
          similarity: QI_STRENGTH,
          referenceStrength: QI_STRENGTH,
          source: 'quick_inspiration',
          sectionId: sid
        }
      })
    );

    // Classic upload zone fallback
    if (sid) {
      var fileInput = document.getElementById('creatorImage-' + sid);
      var previewContainer = document.getElementById('imagePreviewContainer-' + sid);
      var previewImg = document.getElementById('imagePreview-' + sid);
      var uploadZone = document.getElementById('uploadZone-' + sid);
      if (previewImg && previewContainer) {
        previewImg.src = imageUrl;
        previewContainer.style.display = 'flex';
        if (uploadZone) uploadZone.style.display = 'none';
      }
      if (fileInput) {
        fileInput.dataset.imageUrl = imageUrl;
        fileInput.dataset.referenceStrength = String(QI_STRENGTH);
        fileInput.dataset.refSource = 'quick_inspiration';
        if (qiId) fileInput.dataset.quickInspirationId = qiId;
        delete fileInput.dataset.parentDesignId;
        delete fileInput.dataset.remixDesignId;
      }
    }
  }

  function open(opts) {
    opts = opts || {};
    if (!ensureEls()) return;
    sectionId = opts.sectionId != null ? String(opts.sectionId).trim() : null;
    selectedId = null;
    setSidebarOpen(false);

    var host = null;
    if (typeof window.eazCreatorAutomationLayerHost === 'function') {
      host = window.eazCreatorAutomationLayerHost();
    }
    if (!host && typeof window.eazShopStudioModalRoot === 'function') {
      host = window.eazShopStudioModalRoot();
    }
    if (!host) host = document.body;
    if (modal.parentElement !== host) host.appendChild(modal);

    lockScroll();
    modal.classList.add('creator-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.cssText =
      'opacity:1; pointer-events:auto; display:flex; position:fixed; inset:0; z-index:2147483647; align-items:center; justify-content:center; background:rgba(2,6,23,0.92);';
    loadFilterTags();
    loadItems();
  }

  function close() {
    if (!ensureEls()) return;
    setSidebarOpen(false);
    modal.classList.remove('creator-modal--open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.cssText = '';
    unlockScroll();
    sectionId = null;
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
    if (submit) submit.disabled = pendingFiles.length === 0;
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

  function openUpload() {
    if (!uploadModal) uploadModal = document.getElementById('qi-upload-modal');
    if (!uploadModal) return;
    pendingFiles = [];
    renderPendingPreviews();
    showUploadStatus('', '');
    checkBanBeforeUpload().then(function (ok) {
      if (uploadModal.showModal) uploadModal.showModal();
      else uploadModal.setAttribute('open', '');
      if (!ok) {
        var submit = document.getElementById('qi-upload-submit');
        if (submit) submit.disabled = true;
      }
    });
  }

  function closeUpload() {
    if (!uploadModal) return;
    if (uploadModal.close) uploadModal.close();
    else uploadModal.removeAttribute('open');
    pendingFiles = [];
    renderPendingPreviews();
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
    if (!pendingFiles.length) return;
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
      if (submit) {
        submit.textContent = t('creator.quick_inspirations.upload_submit', 'Upload');
        submit.disabled = pendingFiles.length === 0;
      }
    }
  }

  function bind() {
    if (bound || !ensureEls()) return;
    bound = true;

    var closeBtn = document.getElementById('quick-inspirations-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });

    var filterToggle = document.getElementById('qi-filter-toggle');
    if (filterToggle) {
      filterToggle.addEventListener('click', function () {
        var body = modal.querySelector('.qi-modal__body');
        setSidebarOpen(!(body && body.classList.contains('is-sidebar-open')));
      });
    }
    var backdrop = document.getElementById('qi-sidebar-backdrop');
    if (backdrop) backdrop.addEventListener('click', function () {
      setSidebarOpen(false);
    });
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
    if (uploadOpen) uploadOpen.addEventListener('click', openUpload);

    var uploadClose = document.getElementById('qi-upload-modal-close');
    var uploadCancel = document.getElementById('qi-upload-cancel');
    if (uploadClose) uploadClose.addEventListener('click', closeUpload);
    if (uploadCancel) uploadCancel.addEventListener('click', closeUpload);

    var pick = document.getElementById('qi-upload-pick');
    var input = document.getElementById('qi-upload-input');
    if (pick && input) {
      pick.addEventListener('click', function () {
        input.click();
      });
      input.addEventListener('change', function () {
        pendingFiles = Array.prototype.slice.call(input.files || [], 0).slice(0, 12);
        renderPendingPreviews();
        input.value = '';
      });
    }
    var submit = document.getElementById('qi-upload-submit');
    if (submit) submit.addEventListener('click', submitUpload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.QuickInspirationsModal = {
    open: open,
    close: close
  };
})();
