/**
 * Creator Video Generator modal (IDEA-038) — Motion Control via Replicate
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var MOTION_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
  var root = null;
  var addTarget = null; // 'motion' | 'character'
  var state = {
    motionUrl: null,
    characterUrl: null,
    orientation: 'video',
    keepSound: true,
    generating: false,
    results: [],
  };

  function isBadTranslationString(s) {
    if (typeof s !== 'string') return true;
    var t = s.toLowerCase();
    return !t || t.indexOf('translation missing') !== -1;
  }

  function i18n(key, fallback) {
    try {
      var vg = window.CreatorI18n && window.CreatorI18n.video_generator;
      if (vg && vg[key] != null && !isBadTranslationString(String(vg[key]))) return String(vg[key]);
      var cv = window.CreatorI18n && window.CreatorI18n.content_creation_videos;
      if (cv && cv[key] != null && !isBadTranslationString(String(cv[key]))) return String(cv[key]);
      var vs = window.CreatorI18n && window.CreatorI18n.video_studio;
      if (vs && vs[key] != null && !isBadTranslationString(String(vs[key]))) return String(vs[key]);
    } catch (e) {}
    return fallback;
  }

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) {
      return String(window.__EAZ_OWNER_ID);
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
  }

  function $(sel, el) {
    return (el || root).querySelector(sel);
  }

  function isDesktopViewport() {
    return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  }

  function isReady() {
    return !!(state.motionUrl && state.characterUrl) && !state.generating;
  }

  function updateFab() {
    var fab = $('#cvg-generate-fab');
    if (!fab) return;
    fab.hidden = !isReady();
    fab.disabled = state.generating;
  }

  function setStatus(kind, msg) {
    var el = kind === 'motion' ? $('[data-cvg-motion-status]') : $('[data-cvg-character-status]');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
  }

  function openSubheader() {
    var wrap = $('#cvg-subheader');
    var panel = $('#cvg-subheader-panel');
    var toggle = $('#cvg-subheader-toggle');
    if (!wrap || !panel || !toggle) return;
    wrap.classList.add('is-open');
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }

  function applyMotionUrl(url) {
    state.motionUrl = url || null;
    var preview = $('[data-cvg-motion-preview]');
    var placeholder = $('[data-cvg-motion-placeholder]');
    var videoEl = $('[data-cvg-motion-preview-video]');
    if (url && videoEl) {
      videoEl.src = url;
      if (preview) preview.hidden = false;
      if (placeholder) placeholder.hidden = true;
    } else {
      if (videoEl) videoEl.removeAttribute('src');
      if (preview) preview.hidden = true;
      if (placeholder) placeholder.hidden = false;
    }
    updateFab();
  }

  function applyCharacterUrl(url) {
    state.characterUrl = url || null;
    var preview = $('[data-cvg-character-preview]');
    var placeholder = $('[data-cvg-character-placeholder]');
    var img = $('[data-cvg-character-preview-img]');
    if (url && img) {
      img.src = url;
      if (preview) preview.hidden = false;
      if (placeholder) placeholder.hidden = true;
    } else {
      if (img) img.removeAttribute('src');
      if (preview) preview.hidden = true;
      if (placeholder) placeholder.hidden = false;
    }
    updateFab();
  }

  function renderCarousel() {
    var carousel = $('#cvg-carousel');
    var countEl = $('#cvg-subheader-count');
    if (!carousel) return;
    carousel.innerHTML = '';
    var items = state.results.slice();
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cvg-carousel__item';
      card.setAttribute('role', 'listitem');
      if (item.status === 'loading') {
        var ph = document.createElement('div');
        ph.className = 'cvg-carousel__placeholder';
        var spin = document.createElement('div');
        spin.className = 'cvg-carousel__spinner';
        spin.setAttribute('aria-label', i18n('generating', 'Generating…'));
        ph.appendChild(spin);
        card.appendChild(ph);
      } else if (item.video_url) {
        var video = document.createElement('video');
        video.src = item.video_url;
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';
        card.appendChild(video);

        var actions = document.createElement('div');
        actions.className = 'cvg-carousel__actions';
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'cvg-carousel__save';
        if (item.saved) {
          saveBtn.textContent = i18n('saved_to_library', 'Saved');
          saveBtn.disabled = true;
          saveBtn.classList.add('is-saved');
        } else {
          saveBtn.textContent = i18n('save_to_library', 'Save');
          saveBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            saveResultToLibrary(item, saveBtn);
          });
        }
        actions.appendChild(saveBtn);
        card.appendChild(actions);
      }
      carousel.appendChild(card);
    });
    if (countEl) {
      var n = items.filter(function (x) { return x.status === 'done'; }).length;
      countEl.textContent = String(n);
      countEl.hidden = n < 1;
    }
  }

  async function saveResultToLibrary(item, btn) {
    if (!item || !item.video_id || item.saved) return;
    var owner = getOwnerId();
    if (!owner) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = i18n('saving', 'Saving…');
    }
    try {
      var res = await fetch(API_BASE + '?op=video-save-to-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ video_id: item.video_id, owner_id: owner }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok) {
        item.saved = true;
        if (btn) {
          btn.textContent = i18n('saved_to_library', 'Saved');
          btn.classList.add('is-saved');
        }
      } else {
        if (btn) {
          btn.disabled = false;
          btn.textContent = i18n('save_to_library', 'Save');
        }
        setStatus('character', data.error || i18n('save_failed', 'Could not save to library.'));
      }
    } catch (e) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = i18n('save_to_library', 'Save');
      }
      setStatus('character', i18n('network_error', 'Network error'));
    }
  }

  async function uploadMotion(file) {
    var owner = getOwnerId();
    if (!owner || !file) return null;
    if (file.size > MOTION_VIDEO_MAX_BYTES) {
      setStatus('motion', i18n('motion_file_too_large', 'This file is too large. Maximum size is 100 MB.'));
      return null;
    }
    setStatus('motion', i18n('uploading', 'Uploading…'));
    var fd = new FormData();
    fd.append('video', file, file.name || 'motion.mp4');
    try {
      var res = await fetch(API_BASE + '?op=upload-video-motion-ref&owner_id=' + encodeURIComponent(owner), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok && data.video_url) {
        setStatus('motion', '');
        return String(data.video_url);
      }
      setStatus('motion', data.message || data.error || i18n('motion_upload_failed', 'Could not upload motion video.'));
      return null;
    } catch (e) {
      setStatus('motion', i18n('network_error', 'Network error'));
      return null;
    }
  }

  async function uploadCharacter(file) {
    var owner = getOwnerId();
    if (!owner || !file) return null;
    setStatus('character', i18n('uploading', 'Uploading…'));
    var fd = new FormData();
    fd.append('image', file, file.name || 'character.jpg');
    try {
      var res = await fetch(API_BASE + '?op=upload-hero-image&owner_id=' + encodeURIComponent(owner), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok && data.image_url) {
        setStatus('character', '');
        return String(data.image_url);
      }
      setStatus('character', data.error || i18n('upload_failed', 'Upload failed'));
      return null;
    } catch (e) {
      setStatus('character', i18n('network_error', 'Network error'));
      return null;
    }
  }

  function openAddSourceModal(target) {
    addTarget = target === 'character' ? 'character' : 'motion';
    var overlay = document.getElementById('cvgAddSourceModal');
    if (!overlay) {
      console.warn('[VideoGenerator] Add media modal (#cvgAddSourceModal) missing');
      return;
    }
    bindAddSourceUi();
    var phoneBtn = document.getElementById('cvg-addsrc-phone');
    if (phoneBtn) phoneBtn.hidden = !isDesktopViewport();
    var pasteBtn = document.getElementById('cvg-addsrc-paste');
    if (pasteBtn) pasteBtn.hidden = addTarget !== 'character';
    var grid = document.getElementById('cvg-addsrc-grid');
    if (grid) grid.classList.toggle('cvg-addsrc-grid--with-paste', addTarget === 'character');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAddSourceModal() {
    var overlay = document.getElementById('cvgAddSourceModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openLinkModal() {
    var overlay = document.getElementById('cvgLinkModal');
    var input = document.getElementById('cvg-link-url');
    var status = document.getElementById('cvg-link-status');
    if (!overlay) return;
    if (input) input.value = '';
    if (status) {
      status.textContent = '';
      status.className = 'cvs-link-status';
    }
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    if (input) setTimeout(function () { input.focus(); }, 0);
  }

  function closeLinkModal() {
    var overlay = document.getElementById('cvgLinkModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function applyPickedAsset(asset) {
    if (!asset || !asset.url) return;
    if (addTarget === 'character') {
      if (asset.kind && asset.kind !== 'image') {
        setStatus('character', i18n('need_image', 'Please choose an image.'));
        return;
      }
      setStatus('character', '');
      applyCharacterUrl(String(asset.url));
      return;
    }
    if (asset.kind && asset.kind !== 'video') {
      setStatus('motion', i18n('need_video', 'Please choose a video.'));
      return;
    }
    setStatus('motion', '');
    applyMotionUrl(String(asset.url));
  }

  function openAssetsPicker() {
    var kind = addTarget === 'character' ? 'image' : 'video';
    if (
      window.CreatorVideoStudioModal &&
      typeof window.CreatorVideoStudioModal.openLibraryPicker === 'function'
    ) {
      window.CreatorVideoStudioModal.openLibraryPicker({
        kind: kind,
        onPick: function (asset) {
          applyPickedAsset(asset);
        },
      });
      return;
    }
    setStatus(addTarget === 'character' ? 'character' : 'motion', i18n('library_unavailable', 'Assets library is not available right now.'));
  }

  function getDeviceInput(target) {
    var id = target === 'character' ? 'cvg-input-character' : 'cvg-input-motion-video';
    return document.getElementById(id) || (root && root.querySelector(
      target === 'character' ? '[data-cvg-input="character"]' : '[data-cvg-input="motion-video"]'
    ));
  }

  function triggerDevicePicker() {
    var input = getDeviceInput(addTarget === 'character' ? 'character' : 'motion');
    if (input) input.click();
  }

  async function pasteFromClipboard() {
    var api = window.EazClipboardImage;
    if (!api || typeof api.start !== 'function') {
      setStatus('character', i18n('paste_unsupported', 'Paste from clipboard is not available in this browser.'));
      closeAddSourceModal();
      return;
    }
    var pasteBtn = document.getElementById('cvg-addsrc-paste');
    var file = await api.start({ pasteBtn: pasteBtn, toast: false });
    if (!file) return;
    closeAddSourceModal();
    var url = await uploadCharacter(file);
    if (url) applyCharacterUrl(url);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function pollLinkIngestStatus(assetId, statusEl) {
    var maxAttempts = 120;
    var intervalMs = 2000;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      if (statusEl && attempt > 0 && attempt % 3 === 0) {
        statusEl.textContent = i18n('link_processing', 'Downloading media in the background…');
      }
      var res = await fetch(
        API_BASE + '?op=video-studio-link-ingest-status&asset_id=' + encodeURIComponent(assetId),
        { credentials: 'include' }
      );
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (data.status === 'ready' && data.asset) {
        return { ok: true, asset: data.asset };
      }
      if (data.status === 'failed' || data.error) {
        return { ok: false, data: data };
      }
      await sleep(intervalMs);
    }
    return { ok: false, data: { error: 'timeout', message: i18n('link_error_generic', 'Could not add media from that link.') } };
  }

  async function ingestLinkUrl() {
    var input = document.getElementById('cvg-link-url');
    var status = document.getElementById('cvg-link-status');
    var raw = input ? String(input.value || '').trim() : '';
    if (!raw) {
      if (status) {
        status.textContent = i18n('link_error_invalid_url', 'Please enter a valid URL.');
        status.className = 'cvs-link-status';
      }
      return;
    }
    if (status) {
      status.textContent = i18n('link_downloading', 'Downloading…');
      status.className = 'cvs-link-status is-info';
    }
    var owner = getOwnerId();
    if (!owner) {
      if (status) status.textContent = i18n('network_error', 'Network error');
      return;
    }
    try {
      var res = await fetch(API_BASE + '?op=video-studio-link-ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          owner_id: owner,
          url: raw,
          format: addTarget === 'character' ? 'mp4' : 'mp4',
        }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok && data.asset && data.asset.url) {
        closeLinkModal();
        await applyPickedAsset(data.asset);
        return;
      }
      if (data.ok && data.asset_id && (data.status === 'queued' || data.status === 'processing')) {
        if (status) {
          status.textContent = i18n('link_queued', 'Import queued — preparing download…');
          status.className = 'cvs-link-status is-info';
        }
        var polled = await pollLinkIngestStatus(data.asset_id, status);
        if (polled.ok && polled.asset) {
          closeLinkModal();
          await applyPickedAsset(polled.asset);
          return;
        }
        if (status) {
          status.textContent =
            (polled.data && (polled.data.message || polled.data.error)) ||
            i18n('link_error_generic', 'Could not add media from that link.');
          status.className = 'cvs-link-status';
        }
        return;
      }
      // Fallback: use the URL directly for character images / direct media
      if (addTarget === 'character' && /^https?:\/\//i.test(raw)) {
        closeLinkModal();
        setStatus('character', '');
        applyCharacterUrl(raw);
        return;
      }
      if (status) {
        status.textContent =
          data.message || data.error || i18n('link_error_generic', 'Could not add media from that link.');
        status.className = 'cvs-link-status';
      }
    } catch (e) {
      if (status) {
        status.textContent = i18n('network_error', 'Network error');
        status.className = 'cvs-link-status';
      }
    }
  }

  function extractJobVideoResult(job) {
    if (!job) return null;
    var result = job.result || null;
    if (!result) return null;
    var url =
      result.video_url ||
      result.original_url ||
      result.url ||
      (typeof result.output === 'string' ? result.output : null);
    if (!url) return null;
    return {
      video_url: String(url),
      video_id: result.video_id || null,
      saved: false,
    };
  }

  function isJobTerminalFailure(job) {
    if (!job) return false;
    if (job.failed === true) return true;
    var status = String(job.status || '').toLowerCase();
    if (status === 'failed' || status === 'error' || status === 'canceled' || status === 'cancelled') {
      return true;
    }
    if (job.done === true && !extractJobVideoResult(job)) return true;
    return false;
  }

  function isJobTerminalSuccess(job) {
    if (!job) return false;
    var status = String(job.status || '').toLowerCase();
    var done =
      job.done === true ||
      status === 'completed' ||
      status === 'complete' ||
      status === 'succeeded';
    return done && !!extractJobVideoResult(job);
  }

  function pollJob(jobId, placeholderId) {
    var maxPolls = 240;
    var pollCount = 0;
    var pollInterval = 4000;
    var completed = false;

    function finish(ok, result, errMsg) {
      if (completed) return;
      completed = true;
      state.generating = false;
      updateFab();
      var idx = -1;
      for (var i = 0; i < state.results.length; i++) {
        if (state.results[i].id === placeholderId) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        if (ok && result && result.video_url) {
          state.results[idx] = {
            id: placeholderId,
            status: 'done',
            video_url: result.video_url,
            video_id: result.video_id || null,
            saved: false,
          };
        } else {
          state.results.splice(idx, 1);
        }
      }
      renderCarousel();
      openSubheader();
      if (!ok && errMsg) {
        setStatus('character', errMsg);
      }
    }

    function applyCompletedJob(job) {
      var parsed = extractJobVideoResult(job);
      if (parsed) {
        finish(true, parsed, null);
        return true;
      }
      if (isJobTerminalFailure(job)) {
        finish(false, null, job.message || job.error || i18n('generate_failed', 'Generation failed.'));
        return true;
      }
      return false;
    }

    function tick() {
      pollCount++;
      var owner = getOwnerId();
      if (!owner) {
        finish(false, null, i18n('network_error', 'Network error'));
        return;
      }
      fetch(
        API_BASE +
          '?op=get-job&job_id=' +
          encodeURIComponent(jobId) +
          '&owner_id=' +
          encodeURIComponent(owner),
        { credentials: 'include' }
      )
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data || !data.ok || !data.job) {
            if (pollCount < maxPolls) setTimeout(tick, pollInterval);
            else finish(false, null, i18n('generate_failed', 'Generation failed.'));
            return;
          }
          if (applyCompletedJob(data.job)) return;
          if (pollCount < maxPolls) setTimeout(tick, pollInterval);
          else finish(false, null, i18n('generate_failed', 'Generation failed.'));
        })
        .catch(function () {
          if (pollCount < maxPolls) setTimeout(tick, pollInterval);
          else finish(false, null, i18n('network_error', 'Network error'));
        });
    }

    function onJobCompleted(ev) {
      if (completed) return;
      var detail = ev && ev.detail;
      if (!detail || String(detail.jobId) !== String(jobId)) return;
      if (applyCompletedJob(detail.job)) {
        try {
          window.removeEventListener('creatorJobCompleted', onJobCompleted);
        } catch (e) {}
      }
    }

    try {
      window.addEventListener('creatorJobCompleted', onJobCompleted);
    } catch (e) {}

    tick();
  }

  async function generate() {
    if (!isReady()) return;
    var owner = getOwnerId();
    if (!owner) return;
    var promptEl = $('[data-cvg-prompt]');
    var prompt = promptEl ? String(promptEl.value || '').trim() : '';
    var keepEl = $('[data-cvg-keep-sound]');
    state.keepSound = !!(keepEl && keepEl.checked);

    state.generating = true;
    updateFab();

    var placeholderId = 'pending_' + Date.now();
    state.results.unshift({ id: placeholderId, status: 'loading' });
    renderCarousel();
    openSubheader();

    var body = {
      owner_id: owner,
      product_ids: [],
      prompt: prompt,
      source_image_url: state.characterUrl,
      product_image_urls: [],
      content_type: 'motion_control',
      motion_video_url: state.motionUrl,
      character_orientation: state.orientation,
      keep_original_sound: state.keepSound,
      save_as_draft: true,
      region: window.selectedVideoRegion || 'EU',
    };

    try {
      var res = await fetch(API_BASE + '?op=video-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      if (data.ok && data.job_id) {
        try {
          window.dispatchEvent(new CustomEvent('creatorJobStarted', {
            detail: { jobId: data.job_id, type: 'video-generate', ownerId: owner },
          }));
        } catch (e) {}
        pollJob(data.job_id, placeholderId);
      } else {
        state.generating = false;
        state.results = state.results.filter(function (r) { return r.id !== placeholderId; });
        renderCarousel();
        updateFab();
        setStatus('character', data.error || i18n('generate_failed', 'Generation failed.'));
      }
    } catch (e) {
      state.generating = false;
      state.results = state.results.filter(function (r) { return r.id !== placeholderId; });
      renderCarousel();
      updateFab();
      setStatus('character', i18n('network_error', 'Network error'));
    }
  }

  function closeDrawer() {
    var sidebar = $('#cvg-sidebar');
    var scrim = $('#cvg-drawer-scrim');
    if (sidebar) sidebar.classList.remove('is-drawer-open');
    if (scrim) scrim.hidden = true;
  }

  function openDrawer() {
    var sidebar = $('#cvg-sidebar');
    var scrim = $('#cvg-drawer-scrim');
    if (sidebar) sidebar.classList.add('is-drawer-open');
    if (scrim) scrim.hidden = false;
  }

  function open() {
    bindUi();
    root = document.getElementById('creatorVideoGeneratorModal');
    if (!root) return;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    try { document.body.classList.add('cvg-modal-open'); } catch (e) {}
    updateFab();
  }

  function close() {
    root = document.getElementById('creatorVideoGeneratorModal');
    if (!root) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    closeDrawer();
    closeAddSourceModal();
    closeLinkModal();
    try { document.body.classList.remove('cvg-modal-open'); } catch (e) {}
  }

  function bindAddSourceUi() {
    function on(id, evt, fn) {
      var el = document.getElementById(id);
      if (el && !el._cvgBound) {
        el._cvgBound = true;
        el.addEventListener(evt, fn);
      }
    }
    on('cvg-addsrc-cancel', 'click', closeAddSourceModal);
    on('cvgAddSourceModal', 'mousedown', function (e) {
      if (e.target && e.target.id === 'cvgAddSourceModal') closeAddSourceModal();
    });
    on('cvg-addsrc-assets', 'click', function () {
      closeAddSourceModal();
      openAssetsPicker();
    });
    on('cvg-addsrc-device', 'click', function () {
      closeAddSourceModal();
      triggerDevicePicker();
    });
    on('cvg-addsrc-phone', 'click', function () {
      closeAddSourceModal();
      if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
        window.CreatorPhoneUploadModal.open({ purpose: 'video-generator' });
      }
    });
    on('cvg-addsrc-link', 'click', function () {
      closeAddSourceModal();
      openLinkModal();
    });
    on('cvg-addsrc-paste', 'click', function () {
      pasteFromClipboard();
    });
    on('cvg-link-cancel', 'click', closeLinkModal);
    on('cvgLinkModal', 'mousedown', function (e) {
      if (e.target && e.target.id === 'cvgLinkModal') closeLinkModal();
    });
    on('cvg-link-submit', 'click', function () {
      ingestLinkUrl();
    });
    on('cvg-link-url', 'keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        ingestLinkUrl();
      }
    });
  }

  function bindUi() {
    root = document.getElementById('creatorVideoGeneratorModal');
    if (!root || root._cvgBound) return;
    root._cvgBound = true;

    bindAddSourceUi();

    var closeBtn = $('#cvg-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var menuBtn = $('#cvg-btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', openDrawer);

    var scrim = $('#cvg-drawer-scrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);

    var sideToggle = $('#cvg-sidebar-toggle');
    if (sideToggle) {
      sideToggle.addEventListener('click', function () {
        var sidebar = $('#cvg-sidebar');
        if (!sidebar) return;
        var collapsed = sidebar.classList.toggle('is-collapsed');
        sideToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sideToggle.textContent = collapsed ? '›' : '‹';
      });
    }

    var subToggle = $('#cvg-subheader-toggle');
    if (subToggle) {
      subToggle.addEventListener('click', function () {
        var wrap = $('#cvg-subheader');
        var panel = $('#cvg-subheader-panel');
        if (!wrap || !panel) return;
        var openNow = !wrap.classList.contains('is-open');
        wrap.classList.toggle('is-open', openNow);
        panel.hidden = !openNow;
        subToggle.setAttribute('aria-expanded', openNow ? 'true' : 'false');
      });
    }

    root.querySelectorAll('[data-cvg-orient]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.orientation = btn.getAttribute('data-cvg-orient') === 'image' ? 'image' : 'video';
        root.querySelectorAll('[data-cvg-orient]').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-cvg-orient') === state.orientation);
        });
      });
    });

    function bindUploadArea(areaSel, removeSel, target, onFile) {
      var area = $(areaSel);
      var input = getDeviceInput(target);
      if (!area || !input || area._cvgUploadBound) return;
      area._cvgUploadBound = true;
      function openPicker(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
          if (e.target && e.target.closest && e.target.closest(removeSel)) return;
        }
        openAddSourceModal(target);
      }
      area.addEventListener('click', openPicker);
      area.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker(e);
        }
      });
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        onFile(file);
      });
      var removeBtn = $(removeSel);
      if (removeBtn) {
        removeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          input.value = '';
          if (target === 'character') applyCharacterUrl(null);
          else applyMotionUrl(null);
        });
      }
    }

    bindUploadArea('[data-cvg-upload="motion-video"]', '[data-cvg-motion-remove]', 'motion', function (file) {
      uploadMotion(file).then(function (url) {
        if (url) applyMotionUrl(url);
      });
    });
    bindUploadArea('[data-cvg-upload="character"]', '[data-cvg-character-remove]', 'character', function (file) {
      uploadCharacter(file).then(function (url) {
        if (url) applyCharacterUrl(url);
      });
    });

    var fab = $('#cvg-generate-fab');
    if (fab) fab.addEventListener('click', function () { generate(); });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      var addOverlay = document.getElementById('cvgAddSourceModal');
      if (addOverlay && !addOverlay.hidden) {
        closeAddSourceModal();
        return;
      }
      var linkOverlay = document.getElementById('cvgLinkModal');
      if (linkOverlay && !linkOverlay.hidden) {
        closeLinkModal();
        return;
      }
      if (!root || root.hidden) return;
      var sidebar = $('#cvg-sidebar');
      if (sidebar && sidebar.classList.contains('is-drawer-open')) {
        closeDrawer();
        return;
      }
      close();
    });
  }

  /** Phone QR upload → apply to the last open addTarget (or character if image). */
  window.__eazVideoGeneratorPhoneApply = function (imageUrl) {
    var vgRoot = document.getElementById('creatorVideoGeneratorModal');
    if (!vgRoot || vgRoot.hidden || !imageUrl) return false;
    var target = addTarget || 'character';
    if (target === 'motion') {
      setStatus('motion', i18n('phone_needs_video', 'Phone upload currently supports images. Use Device or Link for motion video.'));
      return true;
    }
    fetch(imageUrl, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('fetch_failed');
        return r.blob();
      })
      .then(function (blob) {
        var ft = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/jpeg';
        var file = new File([blob], 'phone-upload.jpg', { type: ft });
        return uploadCharacter(file);
      })
      .then(function (url) {
        if (url) applyCharacterUrl(url);
      })
      .catch(function () {
        setStatus('character', i18n('upload_failed', 'Upload failed'));
      });
    return true;
  };

  function ensureOpenTriggers() {
    document.querySelectorAll('[data-creator-video-generator-open]').forEach(function (btn) {
      if (btn._cvgOpenBound) return;
      btn._cvgOpenBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    });
  }

  function boot() {
    bindUi();
    ensureOpenTriggers();
    document.addEventListener('creator-marketing-ready', function () {
      bindUi();
      ensureOpenTriggers();
    });
    var obs = new MutationObserver(function () { ensureOpenTriggers(); });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.CreatorVideoGeneratorModal = { open: open, close: close };
})();
