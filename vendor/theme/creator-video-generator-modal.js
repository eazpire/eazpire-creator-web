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
      }
      carousel.appendChild(card);
    });
    if (countEl) {
      var n = items.filter(function (x) { return x.status === 'done'; }).length;
      countEl.textContent = String(n);
      countEl.hidden = n < 1;
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

  function pollJob(jobId, placeholderId) {
    var maxPolls = 240;
    var pollCount = 0;
    var pollInterval = 4000;

    function finish(ok, result) {
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
          };
        } else {
          state.results.splice(idx, 1);
        }
      }
      renderCarousel();
      openSubheader();
    }

    function tick() {
      pollCount++;
      var owner = getOwnerId();
      if (!owner) {
        finish(false, null);
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
            else finish(false, null);
            return;
          }
          var job = data.job;
          var status = String(job.status || '').toLowerCase();
          var done = job.done === true || status === 'completed' || status === 'complete' || status === 'succeeded';
          var failed = status === 'failed' || status === 'error' || status === 'canceled';
          if (done && job.result) {
            finish(true, job.result);
            return;
          }
          if (failed) {
            finish(false, null);
            return;
          }
          if (pollCount < maxPolls) setTimeout(tick, pollInterval);
          else finish(false, null);
        })
        .catch(function () {
          if (pollCount < maxPolls) setTimeout(tick, pollInterval);
          else finish(false, null);
        });
    }
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
    try { document.body.classList.remove('cvg-modal-open'); } catch (e) {}
  }

  function bindUi() {
    root = document.getElementById('creatorVideoGeneratorModal');
    if (!root || root._cvgBound) return;
    root._cvgBound = true;

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

    var motionArea = $('[data-cvg-upload="motion-video"]');
    var motionInput = $('[data-cvg-input="motion-video"]');
    if (motionArea && motionInput) {
      motionArea.addEventListener('click', function (e) {
        if (e.target.closest('[data-cvg-motion-remove]')) return;
        motionInput.click();
      });
      motionInput.addEventListener('change', function () {
        var file = motionInput.files && motionInput.files[0];
        if (!file) return;
        uploadMotion(file).then(function (url) {
          state.motionUrl = url;
          var preview = $('[data-cvg-motion-preview]');
          var placeholder = $('[data-cvg-motion-placeholder]');
          var videoEl = $('[data-cvg-motion-preview-video]');
          if (url && videoEl) {
            videoEl.src = url;
            if (preview) preview.hidden = false;
            if (placeholder) placeholder.hidden = true;
          }
          updateFab();
        });
      });
      var motionRemove = $('[data-cvg-motion-remove]');
      if (motionRemove) {
        motionRemove.addEventListener('click', function (e) {
          e.stopPropagation();
          state.motionUrl = null;
          motionInput.value = '';
          var preview = $('[data-cvg-motion-preview]');
          var placeholder = $('[data-cvg-motion-placeholder]');
          var videoEl = $('[data-cvg-motion-preview-video]');
          if (videoEl) videoEl.removeAttribute('src');
          if (preview) preview.hidden = true;
          if (placeholder) placeholder.hidden = false;
          updateFab();
        });
      }
    }

    var charArea = $('[data-cvg-upload="character"]');
    var charInput = $('[data-cvg-input="character"]');
    if (charArea && charInput) {
      charArea.addEventListener('click', function (e) {
        if (e.target.closest('[data-cvg-character-remove]')) return;
        charInput.click();
      });
      charInput.addEventListener('change', function () {
        var file = charInput.files && charInput.files[0];
        if (!file) return;
        uploadCharacter(file).then(function (url) {
          state.characterUrl = url;
          var preview = $('[data-cvg-character-preview]');
          var placeholder = $('[data-cvg-character-placeholder]');
          var img = $('[data-cvg-character-preview-img]');
          if (url && img) {
            img.src = url;
            if (preview) preview.hidden = false;
            if (placeholder) placeholder.hidden = true;
          }
          updateFab();
        });
      });
      var charRemove = $('[data-cvg-character-remove]');
      if (charRemove) {
        charRemove.addEventListener('click', function (e) {
          e.stopPropagation();
          state.characterUrl = null;
          charInput.value = '';
          var preview = $('[data-cvg-character-preview]');
          var placeholder = $('[data-cvg-character-placeholder]');
          var img = $('[data-cvg-character-preview-img]');
          if (img) img.removeAttribute('src');
          if (preview) preview.hidden = true;
          if (placeholder) placeholder.hidden = false;
          updateFab();
        });
      }
    }

    var fab = $('#cvg-generate-fab');
    if (fab) fab.addEventListener('click', function () { generate(); });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!root || root.hidden) return;
      var sidebar = $('#cvg-sidebar');
      if (sidebar && sidebar.classList.contains('is-drawer-open')) {
        closeDrawer();
        return;
      }
      close();
    });
  }

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
