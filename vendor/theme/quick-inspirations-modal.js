/**
 * Quick Inspirations Modal — browse + upload mood/screenshot inspirations.
 * Apply: exactly one image as loose inspiration (5%) for Creator Generator / Shop DG.
 * Upload sources: Device, Screenshot, Camera, Phone (not Public Designs / My Designs / QI / Canvas).
 */
(function () {
  'use strict';

  var API_BASE = 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  var QI_STRENGTH = 0.05;

  var modal = null;
  var uploadModal = null;
  var sourceModal = null;
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
  var screenshotBinder = null;
  var uploading = false;

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

  function hostDialogs(host) {
    if (!host) return;
    [sourceModal, uploadModal].forEach(function (dlg) {
      if (dlg && dlg.parentElement !== host) host.appendChild(dlg);
    });
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
    hostDialogs(host);

    lockScroll();
    modal.classList.add('creator-modal--open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.cssText =
      'opacity:1; pointer-events:auto; display:flex; position:fixed; inset:0; z-index:2147483647; align-items:center; justify-content:center; background:rgba(2,6,23,0.92);';
    loadFilterTags();
    loadItems();
  }

  function clearPhoneHook() {
    try {
      window.__qiPhoneUploadApply = null;
    } catch (_e) {}
  }

  function close() {
    if (!ensureEls()) return;
    setSidebarOpen(false);
    closeSourcePicker();
    closeUpload();
    clearPhoneHook();
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

  function openSourcePicker() {
    if (!sourceModal) sourceModal = document.getElementById('qi-upload-source-modal');
    if (!sourceModal) {
      // Fallback: device file picker only
      pickDeviceFiles(true, false);
      return;
    }
    refreshScreenshotOption();
    if (!window.EazScreenshotCapture) {
      setTimeout(refreshScreenshotOption, 50);
      setTimeout(refreshScreenshotOption, 250);
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
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        setSidebarOpen(false);
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
