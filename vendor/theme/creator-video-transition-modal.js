/**
 * Creator Video Transition modal (IDEA-067) — fullscreen shell + floating results
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var DEFAULT_LAB_URL = 'http://127.0.0.1:3466/?embed=1';
  var root = null;
  var state = {
    results: [],
    sidebarCollapsed: false,
    floatMinimized: true,
    drag: null
  };

  function isBadTranslationString(s) {
    if (typeof s !== 'string') return true;
    var t = s.toLowerCase();
    return !t || t.indexOf('translation missing') !== -1;
  }

  function i18n(key, fallback) {
    try {
      var ns = window.CreatorI18n && window.CreatorI18n.video_transition;
      if (ns && ns[key] != null && !isBadTranslationString(String(ns[key]))) return String(ns[key]);
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

  function isDesktopViewport() {
    return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  }

  function labUrl() {
    if (typeof window.__CVT_LAB_URL === 'string' && window.__CVT_LAB_URL.trim()) {
      return window.__CVT_LAB_URL.trim();
    }
    var meta = document.querySelector('meta[name="creator-video-transition-lab-url"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content').trim();
    return DEFAULT_LAB_URL;
  }

  function setStatusPill(text) {
    var pill = $('#cvt-status-pill');
    if (pill) pill.textContent = text || i18n('ready', 'Ready');
  }

  function setSidebarCollapsed(collapsed) {
    state.sidebarCollapsed = !!collapsed;
    var side = $('#cvt-sidebar');
    var rail = $('#cvt-sidebar-toggle');
    if (!side) return;
    side.classList.toggle('is-collapsed', state.sidebarCollapsed);
    if (rail) {
      rail.setAttribute('aria-expanded', state.sidebarCollapsed ? 'false' : 'true');
      rail.textContent = state.sidebarCollapsed ? '›' : '‹';
    }
  }

  function setDrawerOpen(open) {
    var side = $('#cvt-sidebar');
    var scrim = $('#cvt-drawer-scrim');
    if (!side) return;
    side.classList.toggle('is-drawer-open', !!open);
    if (scrim) {
      if (open) {
        scrim.hidden = false;
        scrim.removeAttribute('hidden');
      } else {
        scrim.hidden = true;
        scrim.setAttribute('hidden', '');
      }
    }
  }

  function showWorkspace() {
    var ws = $('#cvt-workspace');
    if (ws) {
      ws.hidden = false;
      ws.removeAttribute('hidden');
    }
    loadLabFrame();
  }

  function loadLabFrame() {
    var frame = $('#cvt-lab-frame');
    if (!frame) return;
    var url = labUrl();
    if (!url) {
      setStatusPill(i18n('lab_missing', 'Lab URL not configured'));
      return;
    }
    if (frame.getAttribute('data-cvt-src') === url) return;
    frame.setAttribute('data-cvt-src', url);
    frame.src = url;
    setStatusPill(i18n('lab_loading', 'Loading editor…'));
  }

  function renderFloatCarousel() {
    var carousel = $('#cvt-float-carousel');
    var countEl = $('#cvt-float-count');
    var floatRoot = $('#cvt-float');
    if (!carousel || !floatRoot) return;
    carousel.innerHTML = '';
    var ok = state.results.filter(function (r) {
      return r && r.url && !r.error;
    });
    if (!ok.length) {
      floatRoot.hidden = true;
      floatRoot.setAttribute('hidden', '');
      if (countEl) countEl.hidden = true;
      return;
    }
    floatRoot.hidden = false;
    floatRoot.removeAttribute('hidden');
    if (countEl) {
      countEl.hidden = false;
      countEl.textContent = String(ok.length);
    }
    ok.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cvt-float__card';
      card.setAttribute('role', 'listitem');
      var vid = document.createElement('video');
      vid.src = item.url;
      vid.controls = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      card.appendChild(vid);
      var meta = document.createElement('div');
      meta.className = 'cvt-float__card-meta';
      meta.textContent = item.label || i18n('result', 'Result');
      if (item.saved) meta.textContent += ' · ' + i18n('saved', 'Saved');
      card.appendChild(meta);
      carousel.appendChild(card);
    });
  }

  function setFloatMinimized(min) {
    state.floatMinimized = !!min;
    var floatRoot = $('#cvt-float');
    var panel = $('#cvt-float-panel');
    if (!floatRoot) return;
    floatRoot.setAttribute('data-minimized', state.floatMinimized ? '1' : '0');
    if (panel) {
      panel.hidden = state.floatMinimized;
      if (state.floatMinimized) panel.setAttribute('hidden', '');
      else panel.removeAttribute('hidden');
    }
  }

  function applyFloatPosition(left, top) {
    var floatRoot = $('#cvt-float');
    if (!floatRoot) return;
    var w = floatRoot.offsetWidth || 56;
    var h = floatRoot.offsetHeight || 56;
    var maxL = Math.max(8, window.innerWidth - w - 8);
    var maxT = Math.max(8, window.innerHeight - h - 8);
    var l = Math.min(maxL, Math.max(8, left));
    var t = Math.min(maxT, Math.max(8, top));
    floatRoot.style.left = l + 'px';
    floatRoot.style.top = t + 'px';
    floatRoot.style.right = 'auto';
    floatRoot.style.bottom = 'auto';
  }

  async function sha256Hex(buffer) {
    if (!window.crypto || !window.crypto.subtle) return '';
    var hash = await window.crypto.subtle.digest('SHA-256', buffer);
    return Array.prototype.map
      .call(new Uint8Array(hash), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      })
      .join('');
  }

  function blobFromMessageItem(item) {
    if (!item) return null;
    if (item.blob instanceof Blob) return item.blob;
    if (item.buffer) {
      return new Blob([item.buffer], { type: item.mime || 'video/webm' });
    }
    return null;
  }

  async function saveTransitionAsset(kind, blob, meta) {
    var ownerId = getOwnerId();
    if (!ownerId) return { ok: false, error: 'missing_owner_id' };
    var buf = await blob.arrayBuffer();
    var contentHash = await sha256Hex(buf);
    var fd = new FormData();
    fd.append('owner_id', ownerId);
    fd.append('kind', kind);
    fd.append('content_hash', contentHash);
    fd.append('file', new Blob([buf], { type: blob.type || 'video/webm' }), meta.filename || 'transition.webm');
    if (meta.label) fd.append('title', meta.label);
    var url = API_BASE + '?op=video-transition-save&owner_id=' + encodeURIComponent(ownerId);
    var res = await fetch(url, {
      method: 'POST',
      body: fd,
      credentials: 'include'
    });
    var data = {};
    try {
      data = await res.json();
    } catch (e) {
      data = { ok: false, error: 'bad_json' };
    }
    return data;
  }

  async function autoSaveResults(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var blob = blobFromMessageItem(item);
      if (!blob || item.error) {
        out.push(item);
        continue;
      }
      try {
        var objectUrl = URL.createObjectURL(blob);
        var saved = await saveTransitionAsset('result', blob, {
          label: item.label || 'Transition Video',
          filename: 'transition-' + (i + 1) + '.webm'
        });
        out.push({
          label: item.label,
          url: objectUrl,
          error: null,
          saved: !!(saved && saved.ok),
          asset_id: saved && (saved.asset_id || saved.video_id),
          duplicate: !!(saved && saved.already_exists),
          remoteUrl: saved && saved.video_url
        });
      } catch (err) {
        console.warn('[CVT] auto-save result failed', err);
        out.push({
          label: item.label,
          url: URL.createObjectURL(blob),
          error: null,
          saved: false
        });
      }
    }
    return out;
  }

  async function autoSaveClips(clipPayloads) {
    if (!Array.isArray(clipPayloads) || !clipPayloads.length) return;
    for (var i = 0; i < clipPayloads.length; i++) {
      var c = clipPayloads[i];
      var blob = blobFromMessageItem(c);
      if (!blob) continue;
      try {
        await saveTransitionAsset('clip', blob, {
          label: c.label || c.name || 'Transition Clip',
          filename: c.name || 'clip-' + (i + 1) + '.mp4'
        });
      } catch (err) {
        console.warn('[CVT] auto-save clip failed', err);
      }
    }
  }

  async function onLabMessage(ev) {
    var data = ev && ev.data;
    if (!data || data.source !== 'eazpire-video-transition-lab') return;
    if (data.type === 'lab-ready') {
      setStatusPill(i18n('ready', 'Ready'));
      var renderBtnReady = $('#cvt-btn-render');
      if (renderBtnReady) renderBtnReady.disabled = false;
      return;
    }
    if (data.type === 'status') {
      setStatusPill(data.message || i18n('ready', 'Ready'));
      return;
    }
    if (data.type === 'results') {
      var items = Array.isArray(data.results) ? data.results : [];
      setStatusPill(i18n('saving', 'Saving to Assets…'));
      if (Array.isArray(data.clips)) {
        await autoSaveClips(data.clips);
      }
      var savedItems = await autoSaveResults(items);
      state.results = savedItems.concat(state.results).slice(0, 24);
      renderFloatCarousel();
      setFloatMinimized(false);
      setStatusPill(i18n('saved_results', 'Saved to Transition Videos'));
      var renderBtn = $('#cvt-btn-render');
      if (renderBtn) renderBtn.disabled = false;
    }
  }

  function bindOnce() {
    if (!root || root.getAttribute('data-cvt-bound') === '1') return;
    root.setAttribute('data-cvt-bound', '1');

    var closeBtn = $('#cvt-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var menuBtn = $('#cvt-btn-menu');
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        if (isDesktopViewport()) setSidebarCollapsed(!state.sidebarCollapsed);
        else {
          var side = $('#cvt-sidebar');
          setDrawerOpen(!(side && side.classList.contains('is-drawer-open')));
        }
      });
    }

    var rail = $('#cvt-sidebar-toggle');
    if (rail) {
      rail.addEventListener('click', function () {
        setSidebarCollapsed(!state.sidebarCollapsed);
      });
    }

    var scrim = $('#cvt-drawer-scrim');
    if (scrim) scrim.addEventListener('click', function () { setDrawerOpen(false); });

    root.querySelectorAll('[data-cvt-panel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        root.querySelectorAll('[data-cvt-panel]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        showWorkspace();
        if (!isDesktopViewport()) setDrawerOpen(false);
        var frame = $('#cvt-lab-frame');
        if (frame && frame.contentWindow) {
          try {
            frame.contentWindow.postMessage(
              { source: 'eazpire-cvt-host', type: 'goto-panel', panel: btn.getAttribute('data-cvt-panel') },
              '*'
            );
          } catch (e) {}
        }
      });
    });

    root.querySelectorAll('[data-cvt-panel-jump]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showWorkspace();
        var panel = btn.getAttribute('data-cvt-panel-jump');
        var navBtn = root.querySelector('[data-cvt-panel="' + panel + '"]');
        if (navBtn) navBtn.click();
      });
    });

    var renderBtn = $('#cvt-btn-render');
    if (renderBtn) {
      renderBtn.addEventListener('click', function () {
        var frame = $('#cvt-lab-frame');
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ source: 'eazpire-cvt-host', type: 'render' }, '*');
          setStatusPill(i18n('rendering', 'Rendering…'));
          renderBtn.disabled = true;
        }
      });
    }

    var fab = $('#cvt-float-fab');
    var floatRoot = $('#cvt-float');
    if (fab && floatRoot) {
      fab.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0) return;
        var rect = floatRoot.getBoundingClientRect();
        state.drag = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          origL: rect.left,
          origT: rect.top,
          moved: false
        };
        try {
          fab.setPointerCapture(e.pointerId);
        } catch (err) {}
      });
      fab.addEventListener('pointermove', function (e) {
        if (!state.drag || state.drag.pointerId !== e.pointerId) return;
        var dx = e.clientX - state.drag.startX;
        var dy = e.clientY - state.drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 6) state.drag.moved = true;
        if (state.drag.moved) applyFloatPosition(state.drag.origL + dx, state.drag.origT + dy);
      });
      fab.addEventListener('pointerup', function (e) {
        if (!state.drag || state.drag.pointerId !== e.pointerId) return;
        var moved = state.drag.moved;
        state.drag = null;
        if (!moved) setFloatMinimized(!state.floatMinimized);
      });
      fab.addEventListener('pointercancel', function () {
        state.drag = null;
      });
    }

    var minBtn = $('#cvt-float-minimize');
    if (minBtn) minBtn.addEventListener('click', function () { setFloatMinimized(true); });

    window.addEventListener('message', onLabMessage);
  }

  function open() {
    root = document.getElementById('creatorVideoTransitionModal');
    if (!root) return;
    bindOnce();
    root.hidden = false;
    root.removeAttribute('hidden');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cvt-modal-open');
    setSidebarCollapsed(false);
    setDrawerOpen(false);
    setFloatMinimized(state.results.length ? state.floatMinimized : true);
    renderFloatCarousel();
    showWorkspace();
    var renderBtn = $('#cvt-btn-render');
    if (renderBtn) renderBtn.disabled = false;
  }

  function close() {
    root = document.getElementById('creatorVideoTransitionModal');
    if (!root) return;
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cvt-modal-open');
    setDrawerOpen(false);
  }

  function ensureOpenTriggers() {
    document.querySelectorAll('[data-creator-video-transition-open]').forEach(function (btn) {
      if (btn._cvtOpenBound) return;
      btn._cvtOpenBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        open();
      });
    });
  }

  function boot() {
    ensureOpenTriggers();
    document.addEventListener('creator-marketing-ready', function () {
      ensureOpenTriggers();
    });
    if (document.body) {
      var obs = new MutationObserver(function () {
        ensureOpenTriggers();
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.CreatorVideoTransitionModal = { open: open, close: close };
})();
