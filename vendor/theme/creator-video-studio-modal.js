/**
 * Creator Video Studio modal (IDEA-028)
 */
(function () {
  'use strict';

  var API_BASE =
    (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var PART_SIZE = 5 * 1024 * 1024;
  var MAX_BYTES = 500 * 1024 * 1024;
  var SIMPLE_MAX = 32 * 1024 * 1024;

  var ASPECT = {
    youtube_16_9: { w: 1920, h: 1080 },
    shorts_9_16: { w: 1080, h: 1920 },
    ig_feed_1_1: { w: 1080, h: 1080 },
    ig_portrait_4_5: { w: 1080, h: 1350 },
    facebook_1_91: { w: 1200, h: 628 },
  };

  var root = null;
  var engine = null;
  var project = null;
  var assets = [];
  var localUrls = Object.create(null);
  var localFiles = Object.create(null);
  var history = [];
  var historyIndex = -1;
  var suppressHistory = false;
  var saveTimer = null;
  var isOpen = false;
  var cropMode = false;
  var isDirty = false;
  var cropRefFrame = null;
  var projectsCache = [];
  var exportAudioCtx = null;
  var exportSourceCache = Object.create(null);
  var linkExtracted = null; // { url, format, kind } once Extract succeeds — required before Download is enabled
  var linkPhonePollTimer = null;
  var linkPhoneSessionId = null;

  function getExportAudioContext() {
    if (!exportAudioCtx) {
      exportAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (exportAudioCtx.state === 'suspended') {
      exportAudioCtx.resume().catch(function () {});
    }
    return exportAudioCtx;
  }

  function getExportMediaSource(assetId, el, ctx) {
    var cached = exportSourceCache[assetId];
    if (cached && cached.el === el) return cached.node;
    var node = ctx.createMediaElementSource(el);
    exportSourceCache[assetId] = { el: el, node: node };
    return node;
  }

  function i18n(key, fallback) {
    try {
      var pack = window.CreatorI18n && window.CreatorI18n.video_studio;
      if (pack && pack[key]) return String(pack[key]);
    } catch (e) {}
    return fallback;
  }

  /**
   * Reusable in-app confirm/alert dialog — replaces window.confirm/alert
   * everywhere in Video Studio. Promise-based: resolves true (confirmed) or
   * false (cancelled/escaped/backdrop click).
   * cvsConfirm({ title, message, confirmLabel, cancelLabel, danger, alertOnly })
   */
  function cvsConfirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.getElementById('cvsConfirmDialog');
      var titleEl = document.getElementById('cvs-confirm-title');
      var msgEl = document.getElementById('cvs-confirm-message');
      var cancelBtn = document.getElementById('cvs-confirm-cancel');
      var okBtn = document.getElementById('cvs-confirm-ok');
      if (!overlay || !titleEl || !msgEl || !cancelBtn || !okBtn) {
        resolve(opts.alertOnly ? (window.alert(opts.message || ''), true) : window.confirm(opts.message || ''));
        return;
      }
      titleEl.textContent = opts.title || i18n('confirm_title', 'Please confirm');
      msgEl.textContent = opts.message || '';
      okBtn.textContent = opts.confirmLabel || i18n('confirm_ok', 'OK');
      cancelBtn.hidden = !!opts.alertOnly;
      cancelBtn.textContent = opts.cancelLabel || i18n('confirm_cancel', 'Cancel');
      okBtn.classList.toggle('cvs-btn--danger', !!opts.danger);
      okBtn.classList.toggle('cvs-btn--primary', !opts.danger);

      function cleanup(result) {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKey, true);
        overlay.removeEventListener('mousedown', onBackdrop);
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() {
        cleanup(true);
      }
      function onCancel() {
        cleanup(false);
      }
      function onBackdrop(e) {
        if (e.target === overlay) cleanup(false);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cleanup(false);
        } else if (e.key === 'Enter') {
          e.stopPropagation();
          cleanup(true);
        }
      }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('mousedown', onBackdrop);
      document.addEventListener('keydown', onKey, true);
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      okBtn.focus();
    });
  }
  window.cvsConfirm = cvsConfirm;

  /**
   * In-app project name/description editor — used by the header Save button
   * and the Projects modal's Edit action. Resolves { name, description } or
   * null if cancelled.
   */
  function openMetaModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var overlay = document.getElementById('cvsProjectMetaModal');
      var titleEl = document.getElementById('cvs-meta-title');
      var nameInput = document.getElementById('cvs-meta-name');
      var descInput = document.getElementById('cvs-meta-description');
      var cancelBtn = document.getElementById('cvs-meta-cancel');
      var saveBtn = document.getElementById('cvs-meta-save');
      if (!overlay || !titleEl || !nameInput || !descInput || !cancelBtn || !saveBtn) {
        resolve(null);
        return;
      }
      titleEl.textContent = opts.title || i18n('save_project_title', 'Save project');
      nameInput.value = opts.name || '';
      descInput.value = opts.description || '';

      function cleanup(result) {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKey, true);
        overlay.removeEventListener('mousedown', onBackdrop);
        saveBtn.removeEventListener('click', onSave);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onSave() {
        cleanup({
          name: nameInput.value.trim() || i18n('untitled', 'Untitled'),
          description: descInput.value.trim(),
        });
      }
      function onCancel() {
        cleanup(null);
      }
      function onBackdrop(e) {
        if (e.target === overlay) cleanup(null);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cleanup(null);
        }
      }
      saveBtn.addEventListener('click', onSave);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('mousedown', onBackdrop);
      document.addEventListener('keydown', onKey, true);
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      nameInput.focus();
      nameInput.select();
    });
  }

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null && String(window.__EAZ_OWNER_ID) !== '') {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    if (meta && meta.getAttribute('content')) return String(meta.getAttribute('content')).trim();
    var input = document.querySelector('input[id^="ownerId-"]');
    if (input && input.value) return String(input.value).trim();
    return '';
  }

  function apiUrl(op) {
    var owner = getOwnerId();
    var u = API_BASE + '?op=' + encodeURIComponent(op);
    if (owner) u += '&owner_id=' + encodeURIComponent(owner) + '&logged_in_customer_id=' + encodeURIComponent(owner);
    return u;
  }

  function setStatus(msg) {
    var el = document.getElementById('cvs-status');
    if (el) el.textContent = msg || '';
  }

  function formatTime(ms) {
    var s = Math.floor(Math.max(0, ms) / 1000);
    var m = Math.floor(s / 60);
    var ss = String(s % 60).padStart(2, '0');
    return m + ':' + ss;
  }

  function updateTimeUi() {
    var el = document.getElementById('cvs-time');
    if (!el || !engine) return;
    el.textContent = formatTime(engine.playheadMs) + ' / ' + formatTime(engine.durationMs);
  }

  function pushHistory() {
    if (!engine || suppressHistory) return;
    var snap = JSON.stringify(engine.getDraft());
    if (historyIndex >= 0 && history[historyIndex] === snap) return;
    history = history.slice(0, historyIndex + 1);
    history.push(snap);
    if (history.length > 40) history.shift();
    historyIndex = history.length - 1;
  }

  function applyHistory(snap) {
    if (!engine || !snap) return;
    suppressHistory = true;
    try {
      var draft = JSON.parse(snap);
      engine.tracks = draft.tracks || engine.tracks;
      engine.playheadMs = draft.playhead_ms || 0;
      engine.render();
      updateTimeUi();
      syncTransformUi();
    } catch (e) {}
    suppressHistory = false;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveProject(true);
    }, 900);
  }

  function onEngineChange() {
    updateTimeUi();
    pushHistory();
    isDirty = true;
    scheduleSave();
  }

  function updateProjectPickerLabel() {
    var el = document.getElementById('cvs-project-picker-name');
    if (el) el.textContent = (project && project.title) || i18n('untitled', 'Untitled');
  }

  function syncTransformUi() {
    var sel = engine && engine.getSelected();
    var scale = document.getElementById('cvs-scale');
    var x = document.getElementById('cvs-pos-x');
    var y = document.getElementById('cvs-pos-y');
    var audioTools = document.getElementById('cvs-audio-tools');
    var volume = document.getElementById('cvs-clip-volume');
    var muteBtn = document.getElementById('cvs-btn-clip-mute');
    if (!sel) {
      if (audioTools) audioTools.hidden = true;
      return;
    }
    var t = sel.clip.transform || { x: 0, y: 0, scale: 1 };
    if (scale) scale.value = String(Math.round((t.scale || 1) * 100));
    if (x) x.value = String(Math.round(t.x || 0));
    if (y) y.value = String(Math.round(t.y || 0));

    var asset = (engine.assetsById && engine.assetsById[sel.clip.assetId]) || {};
    var hasAudio = asset.kind === 'video' || asset.kind === 'audio';
    if (audioTools) audioTools.hidden = !hasAudio;
    if (hasAudio) {
      var vol = sel.clip.volume != null ? sel.clip.volume : 1;
      var muted = !!sel.clip.muted;
      if (volume) volume.value = String(Math.round(vol * 100));
      if (muteBtn) {
        muteBtn.classList.toggle('is-muted', muted);
        muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        muteBtn.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
      }
    }
  }

  function onSelectClip() {
    syncTransformUi();
    syncTransformOverlay();
  }

  // ── Canvas <-> viewer-stage CSS pixel mapping (shared by transform + crop overlays) ──
  function getCanvasScale() {
    var canvas = document.getElementById('cvs-preview-canvas');
    if (!canvas) return { x: 1, y: 1 };
    var r = canvas.getBoundingClientRect();
    return { x: r.width / (canvas.width || 1), y: r.height / (canvas.height || 1) };
  }

  function canvasToStageRectFromScale(box, scale) {
    var stage = document.getElementById('cvs-viewer-stage');
    var canvas = document.getElementById('cvs-preview-canvas');
    if (!stage || !canvas || !box) return null;
    var stageRect = stage.getBoundingClientRect();
    var canvasRect = canvas.getBoundingClientRect();
    var offX = canvasRect.left - stageRect.left;
    var offY = canvasRect.top - stageRect.top;
    return {
      left: offX + box.x * scale.x,
      top: offY + box.y * scale.y,
      width: box.w * scale.x,
      height: box.h * scale.y,
    };
  }

  function canvasToStageRect(box) {
    return canvasToStageRectFromScale(box, getCanvasScale());
  }

  function syncTransformOverlay() {
    var overlay = document.getElementById('cvs-transform-overlay');
    var box = document.getElementById('cvs-transform-box');
    if (!overlay || !box) return;
    if (cropMode || !engine) {
      overlay.hidden = true;
      return;
    }
    var clipBox = engine.getSelectedClipBox && engine.getSelectedClipBox();
    var rect = clipBox && canvasToStageRect(clipBox);
    if (!rect) {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
  }

  function bindTransformDrag() {
    var box = document.getElementById('cvs-transform-box');
    var handle = document.getElementById('cvs-transform-handle');
    if (!box || box._cvsBound) return;
    box._cvsBound = true;
    box.addEventListener('mousedown', function (e) {
      if (e.target === handle || cropMode || !engine) return;
      e.preventDefault();
      var sel = engine.getSelected();
      if (!sel) return;
      var startX = e.clientX;
      var startY = e.clientY;
      var origT = sel.clip.transform || { x: 0, y: 0, scale: 1 };
      var origX = Number(origT.x) || 0;
      var origY = Number(origT.y) || 0;
      var scale = getCanvasScale();
      function onMove(ev) {
        var dx = (ev.clientX - startX) / (scale.x || 1);
        var dy = (ev.clientY - startY) / (scale.y || 1);
        engine.updateSelectedTransform({ x: origX + dx, y: origY + dy });
        syncTransformOverlay();
        syncTransformUi();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        pushHistory();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    if (handle) {
      handle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!engine) return;
        var sel = engine.getSelected();
        if (!sel) return;
        var origScale = Number((sel.clip.transform || {}).scale) || 1;
        var boxRect = box.getBoundingClientRect();
        var cx = boxRect.left + boxRect.width / 2;
        var cy = boxRect.top + boxRect.height / 2;
        var baseDist = Math.max(1, Math.hypot(boxRect.width, boxRect.height) / 2);
        function onMove(ev) {
          var dx = ev.clientX - cx;
          var dy = ev.clientY - cy;
          var dist = Math.hypot(dx, dy);
          var newScale = Math.max(0.1, Math.min(3, origScale * (dist / baseDist)));
          engine.updateSelectedTransform({ scale: newScale });
          syncTransformOverlay();
          syncTransformUi();
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          pushHistory();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }
  }

  function renderAssetGrid() {
    var grid = document.getElementById('cvs-asset-grid');
    var empty = document.getElementById('cvs-asset-empty');
    if (!grid) return;
    grid.innerHTML = '';
    if (!assets.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    assets.forEach(function (asset) {
      var card = document.createElement('div');
      card.className = 'cvs-asset-card';
      card.draggable = true;
      card.dataset.assetId = asset.id;
      card.setAttribute('role', 'listitem');
      var url = localUrls[asset.id] || asset.thumb_url || asset.url;
      if (asset.kind === 'image' && url) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = asset.original_name || '';
        card.appendChild(img);
      } else if (asset.kind === 'video' && url) {
        var vid = document.createElement('video');
        vid.src = url;
        vid.muted = true;
        vid.preload = 'metadata';
        card.appendChild(vid);
      } else {
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'center';
        card.textContent = '♪';
      }
      var badge = document.createElement('span');
      badge.className = 'cvs-asset-card__badge';
      badge.textContent = asset.kind || '';
      card.appendChild(badge);
      if (asset._progress != null) {
        var bar = document.createElement('div');
        bar.className = 'cvs-asset-card__progress';
        bar.style.transform = 'scaleX(' + clamp01(asset._progress) + ')';
        card.appendChild(bar);
      }
      if (!asset._uploading) {
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'cvs-asset-card__delete';
        var delLabel = i18n('delete_asset', 'Delete asset');
        delBtn.setAttribute('aria-label', delLabel);
        delBtn.title = delLabel;
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('mousedown', function (e) {
          e.stopPropagation();
        });
        delBtn.addEventListener('dragstart', function (e) {
          e.preventDefault();
          e.stopPropagation();
        });
        delBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          detachAssetFromProject(asset.id);
        });
        card.appendChild(delBtn);
      }
      card.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/cvs-asset-id', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      card.addEventListener('dblclick', function () {
        if (!engine || asset._uploading) return;
        engine.addClipFromAsset(asset.id, asset.kind === 'audio' ? 'a1' : 'v1', engine.playheadMs);
      });
      card.addEventListener('click', function () {
        if (asset._uploading) return;
        if (window.CreatorVideoStudioAssetTools) {
          window.CreatorVideoStudioAssetTools.open(asset.id);
        }
      });
      grid.appendChild(card);
    });
  }

  function clamp01(n) {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }

  function assetUsageCount(assetId) {
    if (!engine) return 0;
    var count = 0;
    (engine.tracks || []).forEach(function (t) {
      (t.clips || []).forEach(function (c) {
        if (c.assetId === assetId) count += 1;
      });
    });
    return count;
  }

  function removeAssetClipsFromProject(assetId) {
    if (!engine) return;
    var removedSelected = false;
    engine.tracks.forEach(function (t) {
      t.clips = (t.clips || []).filter(function (c) {
        var keep = c.assetId !== assetId;
        if (!keep && c.id === engine.selectedClipId) removedSelected = true;
        return keep;
      });
    });
    if (removedSelected) engine.selectedClipId = null;
    engine.render();
    onEngineChange();
  }

  /**
   * Sidebar "×" — removes the asset from THIS project's sidebar only
   * (unlink via the project_assets join table). The underlying asset row
   * is untouched and stays available in the global Assets library modal.
   */
  async function detachAssetFromProject(assetId) {
    var asset = assets.find(function (a) {
      return a.id === assetId;
    });
    if (!asset) return;

    if (asset._uploading) {
      assets = assets.filter(function (a) {
        return a.id !== assetId;
      });
      renderAssetGrid();
      return;
    }

    var usage = assetUsageCount(assetId);
    var msg;
    if (usage > 0) {
      msg =
        i18n('confirm_remove_used_prefix', 'This asset is used in ') +
        usage +
        i18n(
          'confirm_remove_used_suffix',
          ' clip(s) in this project. Remove it anyway? The clips will be removed from the timeline. It stays available in your Assets library.'
        );
    } else {
      msg = i18n(
        'confirm_remove_from_project',
        'Remove this asset from the project? It stays available in your Assets library.'
      );
    }
    var confirmed = await cvsConfirm({
      title: i18n('confirm_remove_title', 'Remove from project?'),
      message: msg,
      confirmLabel: i18n('confirm_remove_action', 'Remove'),
      danger: true,
    });
    if (!confirmed) return;

    var projectId = project && project.id;
    try {
      if (projectId) {
        var res = await fetch(apiUrl('video-studio-project-asset-detach'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId, asset_id: assetId }),
        });
        var data = await res.json().catch(function () {
          return { ok: false };
        });
        if (!data.ok) throw new Error(data.error || 'detach_failed');
      }
      assets = assets.filter(function (a) {
        return a.id !== assetId;
      });
      delete localUrls[assetId];
      delete localFiles[assetId];
      if (usage > 0) removeAssetClipsFromProject(assetId);
      if (engine) engine.setAssets(assets, localUrls);
      renderAssetGrid();
      setStatus(i18n('asset_removed_from_project', 'Removed from project'));
    } catch (e) {
      console.warn('[VideoStudio] detach failed', e);
      setStatus(i18n('remove_failed', 'Remove failed'));
    }
  }

  /**
   * Attaches an already-uploaded library asset to the current project's
   * sidebar. Used by the Assets library modal (click / multi-select "Add")
   * and right after a fresh Device/Link upload finishes.
   */
  async function attachAssetToProject(assetId, opts) {
    opts = opts || {};
    var projectId = project && project.id;
    if (!projectId || !assetId) return false;
    try {
      var res = await fetch(apiUrl('video-studio-project-asset-attach'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, asset_id: assetId }),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok) throw new Error(data.error || 'attach_failed');
      if (!opts.skipReload) await loadAssets();
      return true;
    } catch (e) {
      console.warn('[VideoStudio] attach asset failed', e);
      return false;
    }
  }

  /**
   * Permanent delete from the global Assets library (Assets modal "×" /
   * multi-select "Remove"). Detaches from every project too (server-side
   * cascade) and updates the current sidebar if it happened to include it.
   */
  async function hardDeleteLibraryAsset(assetId) {
    try {
      var res = await fetch(apiUrl('video-studio-asset-delete'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId }),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok) throw new Error(data.error || 'delete_failed');
      var usage = assetUsageCount(assetId);
      assets = assets.filter(function (a) {
        return a.id !== assetId;
      });
      delete localUrls[assetId];
      delete localFiles[assetId];
      if (usage > 0) removeAssetClipsFromProject(assetId);
      if (engine) engine.setAssets(assets, localUrls);
      renderAssetGrid();
      return true;
    } catch (e) {
      console.warn('[VideoStudio] library delete failed', e);
      return false;
    }
  }

  function isDesktopViewport() {
    try {
      return window.matchMedia('(min-width: 768px)').matches;
    } catch (e) {
      return true;
    }
  }

  // ── "Add" source picker (Assets / Device / Phone / Link) ──
  function openAddSourceModal() {
    var overlay = document.getElementById('cvsAddSourceModal');
    if (!overlay) return;
    var phoneBtn = document.getElementById('cvs-addsrc-phone');
    if (phoneBtn) phoneBtn.hidden = !isDesktopViewport();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeAddSourceModal() {
    var overlay = document.getElementById('cvsAddSourceModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  // ── Assets library modal (global, all uploaded assets for this owner) ──
  var libraryAssets = [];
  var librarySelected = Object.create(null);

  function librarySelectedCount() {
    return Object.keys(librarySelected).length;
  }

  function updateLibrarySelectBar() {
    var bar = document.getElementById('cvs-library-selectbar');
    var countEl = document.getElementById('cvs-library-selectbar-count');
    var count = librarySelectedCount();
    if (bar) bar.hidden = count === 0;
    if (countEl) {
      countEl.textContent =
        count + ' ' + (count === 1 ? i18n('library_selected_one', 'selected') : i18n('library_selected_many', 'selected'));
    }
  }

  function renderLibraryGrid() {
    var grid = document.getElementById('cvs-library-grid');
    var empty = document.getElementById('cvs-library-empty');
    if (!grid) return;
    grid.innerHTML = '';
    if (!libraryAssets.length) {
      if (empty) empty.hidden = false;
      updateLibrarySelectBar();
      return;
    }
    if (empty) empty.hidden = true;
    libraryAssets.forEach(function (asset) {
      var card = document.createElement('div');
      card.className = 'cvs-library-card';
      card.dataset.assetId = asset.id;
      card.setAttribute('role', 'listitem');
      if (librarySelected[asset.id]) card.classList.add('is-selected');

      var url = asset.thumb_url || asset.url;
      if (asset.kind === 'image' && url) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = asset.original_name || '';
        card.appendChild(img);
      } else if (asset.kind === 'video' && url) {
        var vid = document.createElement('video');
        vid.src = url;
        vid.muted = true;
        vid.preload = 'metadata';
        card.appendChild(vid);
      } else {
        var audioWrap = document.createElement('div');
        audioWrap.className = 'cvs-library-card__audio';
        audioWrap.textContent = '♪';
        card.appendChild(audioWrap);
      }

      var badge = document.createElement('span');
      badge.className = 'cvs-library-card__badge';
      badge.textContent = asset.kind || '';
      card.appendChild(badge);

      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'cvs-library-card__checkbox';
      checkbox.checked = !!librarySelected[asset.id];
      checkbox.setAttribute('aria-label', i18n('library_select_asset', 'Select asset'));
      checkbox.addEventListener('click', function (e) {
        e.stopPropagation();
      });
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) {
          librarySelected[asset.id] = true;
          card.classList.add('is-selected');
        } else {
          delete librarySelected[asset.id];
          card.classList.remove('is-selected');
        }
        updateLibrarySelectBar();
      });
      card.appendChild(checkbox);

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'cvs-library-card__delete';
      var delLabel = i18n('library_delete_asset', 'Delete from library');
      delBtn.setAttribute('aria-label', delLabel);
      delBtn.title = delLabel;
      delBtn.innerHTML = '&times;';
      delBtn.addEventListener('click', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        var confirmed = await cvsConfirm({
          title: i18n('library_delete_title', 'Delete from library?'),
          message: i18n(
            'library_delete_message',
            'This permanently deletes the asset for all projects. This cannot be undone.'
          ),
          confirmLabel: i18n('confirm_delete_action', 'Delete'),
          danger: true,
        });
        if (!confirmed) return;
        var ok = await hardDeleteLibraryAsset(asset.id);
        if (ok) {
          libraryAssets = libraryAssets.filter(function (a) {
            return a.id !== asset.id;
          });
          delete librarySelected[asset.id];
          renderLibraryGrid();
        }
      });
      card.appendChild(delBtn);

      card.addEventListener('click', async function () {
        var statusEl = document.getElementById('cvs-library-status');
        var ok = await attachAssetToProject(asset.id);
        if (statusEl) {
          statusEl.textContent = ok
            ? i18n('library_added_to_project', 'Added to project sidebar')
            : i18n('attach_failed', 'Could not add asset');
        }
      });

      grid.appendChild(card);
    });
    updateLibrarySelectBar();
  }

  async function loadLibraryAssets() {
    var statusEl = document.getElementById('cvs-library-status');
    try {
      var res = await fetch(apiUrl('video-studio-assets-list'), { credentials: 'include' });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (data.ok && Array.isArray(data.items)) {
        libraryAssets = data.items;
        renderLibraryGrid();
      }
    } catch (e) {
      console.warn('[VideoStudio] library list failed', e);
      if (statusEl) statusEl.textContent = i18n('library_load_failed', 'Could not load your assets library');
    }
  }

  function openAssetsLibraryModal() {
    var overlay = document.getElementById('cvsAssetsLibraryModal');
    if (!overlay) return;
    librarySelected = Object.create(null);
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    var statusEl = document.getElementById('cvs-library-status');
    if (statusEl) statusEl.textContent = i18n('library_hint', 'Click an asset to add it to this project.');
    loadLibraryAssets();
  }

  function closeAssetsLibraryModal() {
    var overlay = document.getElementById('cvsAssetsLibraryModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    librarySelected = Object.create(null);
  }

  async function addSelectedLibraryAssetsToProject() {
    var ids = Object.keys(librarySelected);
    if (!ids.length) return;
    for (var i = 0; i < ids.length; i += 1) {
      await attachAssetToProject(ids[i], { skipReload: true });
    }
    await loadAssets();
    librarySelected = Object.create(null);
    renderLibraryGrid();
    setStatus(i18n('library_added_to_project', 'Added to project sidebar'));
  }

  async function removeSelectedLibraryAssets() {
    var ids = Object.keys(librarySelected);
    if (!ids.length) return;
    var confirmed = await cvsConfirm({
      title: i18n('library_delete_title', 'Delete from library?'),
      message:
        ids.length === 1
          ? i18n('library_delete_message', 'This permanently deletes the asset for all projects. This cannot be undone.')
          : i18n('library_delete_message_many_prefix', 'This permanently deletes ') +
            ids.length +
            i18n('library_delete_message_many_suffix', ' assets for all projects. This cannot be undone.'),
      confirmLabel: i18n('confirm_delete_action', 'Delete'),
      danger: true,
    });
    if (!confirmed) return;
    for (var i = 0; i < ids.length; i += 1) {
      await hardDeleteLibraryAsset(ids[i]);
      libraryAssets = libraryAssets.filter(function (a) {
        return a.id !== ids[i];
      });
    }
    librarySelected = Object.create(null);
    renderLibraryGrid();
  }

  // ── Link ingest (paste URL → preview via Extract → save via Download) ──
  function resetLinkPreview() {
    linkExtracted = null;
    var preview = document.getElementById('cvs-link-preview');
    var video = document.getElementById('cvs-link-preview-video');
    var audio = document.getElementById('cvs-link-preview-audio');
    var image = document.getElementById('cvs-link-preview-image');
    var downloadBtn = document.getElementById('cvs-link-submit');
    if (preview) preview.hidden = true;
    [video, audio, image].forEach(function (el) {
      if (!el) return;
      el.hidden = true;
      if (el.pause) el.pause();
      el.removeAttribute('src');
    });
    if (downloadBtn) downloadBtn.disabled = true;
  }

  function openLinkModal() {
    var overlay = document.getElementById('cvsLinkModal');
    if (!overlay) return;
    var urlInput = document.getElementById('cvs-link-url');
    var statusEl = document.getElementById('cvs-link-status');
    if (urlInput) urlInput.value = '';
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'cvs-link-status';
    }
    resetLinkPreview();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    if (urlInput) urlInput.focus();
    startLinkPhoneBridge();
  }

  function closeLinkModal() {
    var overlay = document.getElementById('cvsLinkModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    stopLinkPhoneBridge();
    resetLinkPreview();
  }

  function linkIngestErrorMessage(data) {
    if (data && data.message) return data.message;
    var map = {
      link_service_not_configured:
        (data && data.platform ? data.platform + ': ' : '') +
        i18n('link_error_not_configured', 'Link download service not configured. Please contact support.'),
      cobalt_failed: i18n('link_error_cobalt_failed', 'Could not extract media from that link.'),
      facebook_failed: i18n(
        'link_error_facebook_failed',
        'Could not find a public video on that Facebook link. Only public videos/reels work — save the file and use Device instead.'
      ),
      tiktok_failed: i18n(
        'link_error_tiktok_failed',
        'Could not extract media from that TikTok link. The post may be private or region-locked — save the file and use Device instead.'
      ),
      instagram_failed: i18n(
        'link_error_instagram_failed',
        'Could not extract public media from that Instagram link. Private or login-only posts are not supported — save the file and use Device instead.'
      ),
      youtube_failed: i18n(
        'link_error_youtube_failed',
        'Could not extract media from that YouTube link (experimental). Try again later, or save the file and use Device instead.'
      ),
      unsupported_content_type: i18n(
        'link_error_content_type',
        "That link doesn't point directly to a video, audio, or image file."
      ),
      invalid_url: i18n('link_error_invalid_url', 'Please enter a valid URL.'),
      missing_url: i18n('link_error_invalid_url', 'Please enter a valid URL.'),
      file_too_large: i18n('file_too_large', 'File too large (max 500 MB)'),
      fetch_failed: i18n('link_error_fetch_failed', 'Could not download that link.'),
    };
    return (data && map[data.error]) || i18n('link_error_generic', 'Could not add media from that link.');
  }

  function currentLinkFormat() {
    var formatInput = document.querySelector('input[name="cvs-link-format"]:checked');
    return formatInput ? formatInput.value : 'mp4';
  }

  async function submitLinkExtract() {
    var urlInput = document.getElementById('cvs-link-url');
    var statusEl = document.getElementById('cvs-link-status');
    var extractBtn = document.getElementById('cvs-link-extract');
    var url = urlInput ? String(urlInput.value || '').trim() : '';
    resetLinkPreview();
    if (!url) {
      if (statusEl) {
        statusEl.textContent = i18n('link_error_invalid_url', 'Please enter a valid URL.');
        statusEl.className = 'cvs-link-status';
      }
      return;
    }
    var format = currentLinkFormat();
    if (statusEl) {
      statusEl.textContent = i18n('link_extracting', 'Extracting preview…');
      statusEl.className = 'cvs-link-status is-info';
    }
    if (extractBtn) extractBtn.disabled = true;
    try {
      var res = await fetch(apiUrl('video-studio-link-extract'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, format: format }),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok || !data.preview_url) {
        if (statusEl) {
          statusEl.textContent = linkIngestErrorMessage(data);
          statusEl.className = 'cvs-link-status';
        }
        return;
      }
      linkExtracted = { url: url, format: format, kind: data.kind };
      renderLinkPreview(data.preview_url, data.kind);
      var downloadBtn = document.getElementById('cvs-link-submit');
      if (downloadBtn) downloadBtn.disabled = false;
      if (statusEl) {
        statusEl.textContent = data.warning
          ? i18n('link_extracted_with_warning', 'Preview ready — audio-only extraction was not available, this will save the original media.')
          : i18n('link_extracted', 'Preview ready — click Download to save it.');
        statusEl.className = 'cvs-link-status is-success';
      }
    } catch (e) {
      console.warn('[VideoStudio] link extract failed', e);
      if (statusEl) {
        statusEl.textContent = i18n('link_error_generic', 'Could not add media from that link.');
        statusEl.className = 'cvs-link-status';
      }
    } finally {
      if (extractBtn) extractBtn.disabled = false;
    }
  }

  function renderLinkPreview(previewUrl, kind) {
    var preview = document.getElementById('cvs-link-preview');
    var video = document.getElementById('cvs-link-preview-video');
    var audio = document.getElementById('cvs-link-preview-audio');
    var image = document.getElementById('cvs-link-preview-image');
    if (!preview) return;
    [video, audio, image].forEach(function (el) {
      if (el) el.hidden = true;
    });
    var target = kind === 'audio' ? audio : kind === 'image' ? image : video;
    if (target) {
      target.src = previewUrl;
      target.hidden = false;
    }
    preview.hidden = false;
  }

  async function submitLinkDownload() {
    var statusEl = document.getElementById('cvs-link-status');
    var downloadBtn = document.getElementById('cvs-link-submit');
    if (!linkExtracted) return;
    if (statusEl) {
      statusEl.textContent = i18n('link_downloading', 'Downloading…');
      statusEl.className = 'cvs-link-status is-info';
    }
    if (downloadBtn) downloadBtn.disabled = true;
    try {
      var res = await fetch(apiUrl('video-studio-link-ingest'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkExtracted.url, format: linkExtracted.format }),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok || !data.asset) {
        if (statusEl) {
          statusEl.textContent = linkIngestErrorMessage(data);
          statusEl.className = 'cvs-link-status';
        }
        if (downloadBtn) downloadBtn.disabled = false;
        return;
      }
      libraryAssets.unshift(data.asset);
      await attachAssetToProject(data.asset.id);
      if (statusEl) {
        statusEl.textContent = data.warning
          ? i18n('link_added_with_warning', 'Added — audio-only extraction was not available, saved the original media.')
          : i18n('link_added', 'Added to project sidebar');
        statusEl.className = 'cvs-link-status is-success';
      }
      setTimeout(closeLinkModal, 900);
    } catch (e) {
      console.warn('[VideoStudio] link download failed', e);
      if (statusEl) {
        statusEl.textContent = i18n('link_error_generic', 'Could not add media from that link.');
        statusEl.className = 'cvs-link-status';
      }
      if (downloadBtn) downloadBtn.disabled = false;
    }
  }

  // ── Link modal phone QR bridge — paste a link on your phone, it fills the desktop input live ──
  var PHONE_UPLOAD_WORKER_FALLBACK = 'https://creator-engine.eazpire.workers.dev';

  /**
   * Always hit the creator-engine worker (QR image + scan page), never Creator Hub origin.
   * Same hardened resolution as `apiBase()` in creator-phone-upload-modal.js.
   */
  function phoneBridgeApiBase() {
    var cfg = window.CREATOR_API_CONFIG || {};
    if (cfg.PHONE_UPLOAD_BASE_URL) {
      return String(cfg.PHONE_UPLOAD_BASE_URL).replace(/\/+$/, '');
    }
    if (cfg.WORKER_BASE_URL) {
      return String(cfg.WORKER_BASE_URL).replace(/\/+$/, '');
    }
    var base = cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/+$/, '') : '';
    if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(base)) return base;
    if (window.__CREATOR_PORTAL_HOST__) return PHONE_UPLOAD_WORKER_FALLBACK;
    var fromApi = String(API_BASE || '').replace(/\/apps\/creator-dispatch$/i, '').replace(/\/+$/, '');
    if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(fromApi)) return fromApi;
    return PHONE_UPLOAD_WORKER_FALLBACK;
  }

  function fetchPhoneBridgeJson(url, options) {
    return fetch(url, options || { credentials: 'omit' }).then(function (r) {
      return r.text().then(function (text) {
        var snippet = String(text || '').trim();
        var data = {};
        if (snippet) {
          try {
            data = JSON.parse(snippet);
          } catch (_e) {
            var err = new Error('Phone bridge returned non-JSON (HTTP ' + r.status + ')');
            err.httpStatus = r.status;
            throw err;
          }
        }
        return { httpOk: r.ok, status: r.status, data: data };
      });
    });
  }

  function stopLinkPhoneBridge() {
    if (linkPhonePollTimer) {
      clearInterval(linkPhonePollTimer);
      linkPhonePollTimer = null;
    }
    linkPhoneSessionId = null;
  }

  function applyPhoneLinkValue(value) {
    var urlInput = document.getElementById('cvs-link-url');
    var phoneStatus = document.getElementById('cvs-link-phone-status');
    if (urlInput) {
      urlInput.value = value;
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_received', 'Link received from phone');
    submitLinkExtract();
  }

  function pollLinkPhoneSession(sessionId, ownerId) {
    var base = phoneBridgeApiBase();
    var u =
      base +
      '/api/creator-phone-upload/session?id=' +
      encodeURIComponent(sessionId) +
      '&owner_id=' +
      encodeURIComponent(ownerId);
    fetchPhoneBridgeJson(u, { credentials: 'omit' })
      .then(function (res) {
        var data = res.data;
        if (!data || !data.ok || linkPhoneSessionId !== sessionId) return;
        if (data.status === 'completed' && data.value) {
          stopLinkPhoneBridge();
          applyPhoneLinkValue(data.value);
        } else if (data.status === 'expired') {
          stopLinkPhoneBridge();
        }
      })
      .catch(function () {});
  }

  function startLinkPhoneBridge() {
    var box = document.getElementById('cvs-link-phone');
    var qrImg = document.getElementById('cvs-link-qr-img');
    var phoneStatus = document.getElementById('cvs-link-phone-status');
    if (!box || !isDesktopViewport()) return;
    stopLinkPhoneBridge();
    if (qrImg) {
      qrImg.removeAttribute('src');
      qrImg.alt = '';
    }
    var ownerId = getOwnerId();
    if (!ownerId) {
      if (phoneStatus) {
        phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      }
      return;
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_starting', 'Preparing phone scan…');

    var base = phoneBridgeApiBase();
    // Session create already validates phone-upload QR config — skip a separate /config hop
    // (that hop was a common silent failure when the Hub origin was used by mistake).
    fetchPhoneBridgeJson(base + '/api/creator-phone-upload/session', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_id: ownerId, purpose: 'video_link' }),
    })
      .then(function (res) {
        var session = res.data;
        if (!res.httpOk || !session || !session.ok || !session.session_id) {
          if (phoneStatus) {
            phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
          }
          return;
        }
        linkPhoneSessionId = session.session_id;
        if (qrImg) {
          qrImg.onload = function () {
            if (phoneStatus && linkPhoneSessionId === session.session_id) {
              phoneStatus.textContent = i18n('link_phone_hint', 'Paste the link on your phone — it fills in here automatically.');
            }
          };
          qrImg.onerror = function () {
            if (phoneStatus) {
              phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
            }
          };
          qrImg.alt = 'Phone scan QR';
          qrImg.src =
            base +
            '/api/creator-phone-upload/qr-image?session=' +
            encodeURIComponent(session.session_id) +
            '&t=' +
            String(Date.now());
        }
        if (phoneStatus) {
          phoneStatus.textContent = i18n('link_phone_ready', 'Scan the QR code with your phone');
        }
        linkPhonePollTimer = setInterval(function () {
          pollLinkPhoneSession(session.session_id, ownerId);
        }, 2000);
        pollLinkPhoneSession(session.session_id, ownerId);
      })
      .catch(function () {
        if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      });
  }

  // ── Phone upload (desktop QR flow) → adds the received image as an asset ──
  window.__eazVideoStudioPhoneApply = function (imageUrl) {
    if (!isOpen || !imageUrl) return false;
    fetch(imageUrl, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('fetch_failed');
        return r.blob();
      })
      .then(function (blob) {
        var ft = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/jpeg';
        var file = new File([blob], 'phone-upload.jpg', { type: ft });
        return uploadFile(file);
      })
      .catch(function () {
        setStatus(i18n('upload_failed', 'Upload failed'));
      });
    return true;
  };

  function evenDim(n) {
    var v = Math.max(2, Math.min(1920, Math.round(Number(n) || 0)));
    if (v % 2) v -= 1;
    return Math.max(2, v);
  }

  function currentAspect() {
    var preset = (document.getElementById('cvs-aspect-preset') || {}).value || 'youtube_16_9';
    if (preset === 'custom') {
      return {
        preset: 'custom',
        width: evenDim((document.getElementById('cvs-aspect-w') || {}).value || 1920),
        height: evenDim((document.getElementById('cvs-aspect-h') || {}).value || 1080),
      };
    }
    var p = ASPECT[preset] || ASPECT.youtube_16_9;
    return { preset: preset, width: p.w, height: p.h };
  }

  function applyAspectUi() {
    var a = currentAspect();
    var custom = document.getElementById('cvs-aspect-custom');
    if (custom) custom.hidden = a.preset !== 'custom';
    if (engine) engine.setAspect(a.width, a.height);
    scheduleSave();
  }

  /**
   * Sidebar list — only assets attached to the CURRENT project (join table),
   * not the full library. See `loadLibraryAssets` for the global Assets modal.
   */
  async function loadAssets() {
    var projectId = project && project.id;
    if (!projectId) {
      assets = assets.filter(function (a) {
        return a._uploading;
      });
      renderAssetGrid();
      return;
    }
    try {
      var res = await fetch(
        apiUrl('video-studio-project-assets-list') + '&project_id=' + encodeURIComponent(projectId),
        { credentials: 'include' }
      );
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (data.ok && Array.isArray(data.items)) {
        // Keep local-only uploading cards
        var uploading = assets.filter(function (a) {
          return a._uploading;
        });
        assets = data.items.concat(uploading);
        if (engine) engine.setAssets(assets, localUrls);
        renderAssetGrid();
      }
    } catch (e) {
      console.warn('[VideoStudio] project assets list failed', e);
    }
  }

  async function loadProject(projectId) {
    try {
      var url = apiUrl('video-studio-project-get');
      if (projectId) url += '&project_id=' + encodeURIComponent(projectId);
      var res = await fetch(url, { credentials: 'include' });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok || !data.project) return;
      project = data.project;
      var presetEl = document.getElementById('cvs-aspect-preset');
      if (presetEl) presetEl.value = project.aspect_preset || 'youtube_16_9';
      var wEl = document.getElementById('cvs-aspect-w');
      var hEl = document.getElementById('cvs-aspect-h');
      if (wEl) wEl.value = String(project.width || 1920);
      if (hEl) hEl.value = String(project.height || 1080);
      var custom = document.getElementById('cvs-aspect-custom');
      if (custom) custom.hidden = (project.aspect_preset || '') !== 'custom';
      await loadAssets();
      if (engine) {
        engine.setAssets(assets, localUrls);
        engine.setProject(project);
      }
      history = [JSON.stringify(engine.getDraft())];
      historyIndex = 0;
      updateTimeUi();
      updateProjectPickerLabel();
      isDirty = false;
    } catch (e) {
      console.warn('[VideoStudio] project load failed', e);
    }
  }

  async function saveProject(silent, overrides) {
    if (!engine) return;
    var a = currentAspect();
    var body = {
      project_id: project && project.id,
      title: (overrides && overrides.title) || (project && project.title) || 'Untitled',
      description:
        overrides && overrides.description != null ? overrides.description : (project && project.description) || '',
      aspect_preset: a.preset,
      width: a.width,
      height: a.height,
      duration_ms: engine.durationMs,
      draft: engine.getDraft(),
    };
    try {
      var res = await fetch(apiUrl('video-studio-project-save'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (data.ok && data.project) {
        project = data.project;
        isDirty = false;
        updateProjectPickerLabel();
        if (!silent) setStatus(i18n('saved', 'Saved'));
      } else if (!silent) {
        setStatus(i18n('save_failed', 'Save failed'));
      }
    } catch (e) {
      if (!silent) setStatus(i18n('save_failed', 'Save failed'));
    }
  }

  async function onSaveButtonClick() {
    var result = await openMetaModal({
      title: i18n('save_project_title', 'Save project'),
      name: (project && project.title) || '',
      description: (project && project.description) || '',
    });
    if (!result) return;
    await saveProject(false, { title: result.name, description: result.description });
  }

  async function createNewProject() {
    if (isDirty) {
      var ok = await cvsConfirm({
        title: i18n('discard_unsaved_title', 'Discard unsaved project?'),
        message: i18n(
          'discard_unsaved_message',
          'You have unsaved changes in the current project. Starting a new project will discard them.'
        ),
        confirmLabel: i18n('discard_action', 'Discard'),
        danger: true,
      });
      if (!ok) return;
    }
    setStatus(i18n('loading', 'Loading…'));
    try {
      var res = await fetch(apiUrl('video-studio-project-create'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: i18n('untitled', 'Untitled') }),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok || !data.project) throw new Error(data.error || 'create_failed');
      project = data.project;
      await loadAssets();
      if (engine) {
        engine.setAssets(assets, localUrls);
        engine.setProject(project);
        history = [JSON.stringify(engine.getDraft())];
        historyIndex = 0;
      }
      updateProjectPickerLabel();
      updateTimeUi();
      isDirty = false;
      setStatus(i18n('project_created', 'New project created'));
    } catch (e) {
      console.warn('[VideoStudio] create project failed', e);
      setStatus(i18n('save_failed', 'Save failed'));
    }
  }

  // ── Projects modal (grid browser) ─────────────────────────────────────
  function formatProjectDate(ms) {
    try {
      return new Date(Number(ms) || 0).toLocaleDateString();
    } catch (e) {
      return '';
    }
  }

  function formatProjectDuration(ms) {
    var s = Math.round((Number(ms) || 0) / 1000);
    var m = Math.floor(s / 60);
    var ss = String(s % 60).padStart(2, '0');
    return m + ':' + ss;
  }

  function aspectLabel(preset) {
    var map = {
      youtube_16_9: '16:9',
      shorts_9_16: '9:16',
      ig_feed_1_1: '1:1',
      ig_portrait_4_5: '4:5',
      facebook_1_91: '1.91:1',
      custom: i18n('aspect_custom', 'Custom'),
    };
    return map[preset] || preset || '';
  }

  function openProjectsModal() {
    var overlay = document.getElementById('cvsProjectsModal');
    if (!overlay) return;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    loadProjectsList();
  }

  function closeProjectsModal() {
    var overlay = document.getElementById('cvsProjectsModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  async function loadProjectsList() {
    var statusEl = document.getElementById('cvs-projects-status');
    if (statusEl) statusEl.textContent = i18n('loading', 'Loading…');
    try {
      var res = await fetch(apiUrl('video-studio-project-list'), { credentials: 'include' });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (data.ok && Array.isArray(data.items)) {
        projectsCache = data.items;
        renderProjectsGrid();
      }
    } catch (e) {
      console.warn('[VideoStudio] project list failed', e);
    }
    if (statusEl) statusEl.textContent = '';
  }

  function renderProjectsGrid() {
    var grid = document.getElementById('cvs-projects-grid');
    var empty = document.getElementById('cvs-projects-empty');
    if (!grid) return;
    grid.innerHTML = '';
    if (!projectsCache.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    projectsCache.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'cvs-project-card' + (project && project.id === p.id ? ' is-current' : '');
      card.setAttribute('role', 'listitem');

      var name = document.createElement('div');
      name.className = 'cvs-project-card__name';
      name.textContent = p.title || i18n('untitled', 'Untitled');
      card.appendChild(name);

      var desc = document.createElement('div');
      desc.className = 'cvs-project-card__desc';
      desc.textContent = p.description || '';
      card.appendChild(desc);

      var stats = document.createElement('div');
      stats.className = 'cvs-project-card__stats';
      [aspectLabel(p.aspect_preset), formatProjectDate(p.updated_at), formatProjectDuration(p.duration_ms)].forEach(
        function (txt) {
          if (!txt) return;
          var s = document.createElement('span');
          s.className = 'cvs-project-card__stat';
          s.textContent = txt;
          stats.appendChild(s);
        }
      );
      card.appendChild(stats);

      var actions = document.createElement('div');
      actions.className = 'cvs-project-card__actions';
      var openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'cvs-btn cvs-btn--primary';
      openBtn.textContent = i18n('project_open', 'Open');
      openBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        selectProjectFromGrid(p.id);
      });
      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'cvs-btn cvs-btn--ghost';
      editBtn.textContent = i18n('project_edit', 'Edit');
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        editProjectMeta(p);
      });
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'cvs-btn cvs-btn--danger';
      delBtn.textContent = i18n('project_delete', 'Delete');
      delBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteProjectFromGrid(p.id);
      });
      actions.appendChild(openBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);

      card.addEventListener('click', function () {
        selectProjectFromGrid(p.id);
      });
      grid.appendChild(card);
    });
  }

  async function selectProjectFromGrid(projectId) {
    if (project && project.id === projectId) {
      closeProjectsModal();
      return;
    }
    if (isDirty) {
      var ok = await cvsConfirm({
        title: i18n('discard_unsaved_title', 'Discard unsaved project?'),
        message: i18n(
          'discard_unsaved_message',
          'You have unsaved changes in the current project. Opening another project will discard them.'
        ),
        confirmLabel: i18n('discard_action', 'Discard'),
        danger: true,
      });
      if (!ok) return;
    }
    setStatus(i18n('loading', 'Loading…'));
    await loadProject(projectId);
    setStatus('');
    closeProjectsModal();
  }

  async function editProjectMeta(p) {
    var result = await openMetaModal({
      title: i18n('edit_project_title', 'Edit project'),
      name: p.title || '',
      description: p.description || '',
    });
    if (!result) return;
    var statusEl = document.getElementById('cvs-projects-status');
    try {
      var res = await fetch(apiUrl('video-studio-project-get') + '&project_id=' + encodeURIComponent(p.id), {
        credentials: 'include',
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok || !data.project) throw new Error('not_found');
      var full = data.project;
      var res2 = await fetch(apiUrl('video-studio-project-save'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: p.id,
          title: result.name,
          description: result.description,
          aspect_preset: full.aspect_preset,
          width: full.width,
          height: full.height,
          duration_ms: full.duration_ms,
          draft: full.draft,
        }),
      });
      var saved = await res2.json().catch(function () {
        return { ok: false };
      });
      if (!saved.ok) throw new Error('save_failed');
      if (project && project.id === p.id) {
        project = saved.project;
        updateProjectPickerLabel();
      }
      await loadProjectsList();
    } catch (e) {
      console.warn('[VideoStudio] edit project meta failed', e);
      if (statusEl) statusEl.textContent = i18n('save_failed', 'Save failed');
    }
  }

  async function deleteProjectFromGrid(projectId) {
    var ok = await cvsConfirm({
      title: i18n('delete_project_title', 'Delete project?'),
      message: i18n(
        'delete_project_message',
        'This project and its timeline will be permanently deleted. This cannot be undone.'
      ),
      confirmLabel: i18n('delete_project_action', 'Delete'),
      danger: true,
    });
    if (!ok) return;
    var statusEl = document.getElementById('cvs-projects-status');
    try {
      var res = await fetch(apiUrl('video-studio-project-delete'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId }),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok) throw new Error(data.error || 'delete_failed');
      projectsCache = projectsCache.filter(function (x) {
        return x.id !== projectId;
      });
      renderProjectsGrid();
      if (project && project.id === projectId) {
        await loadProject();
      }
      if (statusEl) statusEl.textContent = i18n('project_deleted', 'Project deleted');
    } catch (e) {
      console.warn('[VideoStudio] delete project failed', e);
      if (statusEl) statusEl.textContent = i18n('delete_failed', 'Delete failed');
    }
  }

  // ── Timeline clip right-click menu (Remove / Duplicate) ───────────────
  function openClipContextMenu(clip, track, evt) {
    var menu = document.getElementById('cvsClipContextMenu');
    if (!menu) return;
    var removeBtn = document.getElementById('cvs-ctx-remove');
    var dupBtn = document.getElementById('cvs-ctx-duplicate');
    if (!removeBtn || !dupBtn) return;
    menu.style.left = evt.clientX + 'px';
    menu.style.top = evt.clientY + 'px';
    menu.hidden = false;
    menu.setAttribute('aria-hidden', 'false');

    function close() {
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
      removeBtn.removeEventListener('click', onRemove);
      dupBtn.removeEventListener('click', onDup);
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
    }
    function onRemove() {
      close();
      if (engine) engine.deleteSelected();
    }
    function onDup() {
      close();
      if (engine) engine.duplicateSelected();
    }
    function onOutside(e) {
      if (!menu.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    removeBtn.addEventListener('click', onRemove);
    dupBtn.addEventListener('click', onDup);
    setTimeout(function () {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
    requestAnimationFrame(function () {
      var rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = Math.max(4, window.innerWidth - rect.width - 8) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = Math.max(4, window.innerHeight - rect.height - 8) + 'px';
    });
  }

  function probeMedia(file) {
    return new Promise(function (resolve) {
      var kind = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'video';
      if (kind === 'image') {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          resolve({ kind: kind, width: img.naturalWidth, height: img.naturalHeight, duration_ms: 3000, objectUrl: url });
        };
        img.onerror = function () {
          resolve({ kind: kind, duration_ms: 3000, objectUrl: url });
        };
        img.src = url;
        return;
      }
      var el = document.createElement(kind === 'audio' ? 'audio' : 'video');
      var url2 = URL.createObjectURL(file);
      el.preload = 'metadata';
      el.onloadedmetadata = function () {
        resolve({
          kind: kind,
          width: el.videoWidth || null,
          height: el.videoHeight || null,
          duration_ms: Math.round((el.duration || 0) * 1000) || 5000,
          objectUrl: url2,
        });
      };
      el.onerror = function () {
        resolve({ kind: kind, duration_ms: 5000, objectUrl: url2 });
      };
      el.src = url2;
    });
  }

  function upsertNewAsset(asset) {
    if (!asset || !asset.id) return;
    assets = assets.filter(function (a) {
      return a.id !== asset.id;
    });
    assets.unshift(asset);
    if (engine) engine.setAssets(assets, localUrls);
    renderAssetGrid();
  }

  function replaceAssetInPlace(assetId, asset) {
    if (!asset) return;
    var idx = -1;
    for (var i = 0; i < assets.length; i++) {
      if (assets[i].id === assetId) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) assets[idx] = asset;
    else assets.unshift(asset);
    delete localUrls[assetId];
    if (engine) {
      if (engine.mediaEls && engine.mediaEls[assetId]) delete engine.mediaEls[assetId];
      engine.setAssets(assets, localUrls);
    }
    renderAssetGrid();
  }

  async function uploadFile(file) {
    if (!file || file.size > MAX_BYTES) {
      setStatus(i18n('file_too_large', 'File too large (max 500 MB)'));
      return;
    }
    var meta = await probeMedia(file);
    var tempId = 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    var tempAsset = {
      id: tempId,
      kind: meta.kind,
      mime: file.type,
      bytes: file.size,
      width: meta.width,
      height: meta.height,
      duration_ms: meta.duration_ms,
      original_name: file.name,
      url: meta.objectUrl,
      thumb_url: meta.objectUrl,
      _uploading: true,
      _progress: 0.05,
    };
    localUrls[tempId] = meta.objectUrl;
    localFiles[tempId] = file;
    assets.unshift(tempAsset);
    renderAssetGrid();
    if (engine) engine.setAssets(assets, localUrls);

    try {
      var ready;
      if (file.size <= SIMPLE_MAX) {
        ready = await uploadSimple(file, meta);
      } else {
        ready = await uploadMultipart(file, meta, function (p) {
          tempAsset._progress = p;
          renderAssetGrid();
        });
      }
      if (ready && ready.id) {
        localUrls[ready.id] = meta.objectUrl;
        localFiles[ready.id] = file;
        assets = assets.filter(function (a) {
          return a.id !== tempId;
        });
        assets.unshift(ready);
        if (engine) engine.setAssets(assets, localUrls);
        renderAssetGrid();
        setStatus(i18n('upload_done', 'Upload complete'));
        attachAssetToProject(ready.id, { skipReload: true }).catch(function () {});
      }
    } catch (err) {
      console.warn('[VideoStudio] upload failed', err);
      setStatus(i18n('upload_failed', 'Upload failed'));
      assets = assets.filter(function (a) {
        return a.id !== tempId;
      });
      renderAssetGrid();
    }
  }

  async function uploadSimple(file, meta) {
    var fd = new FormData();
    fd.append('file', file);
    if (meta.width) fd.append('width', String(meta.width));
    if (meta.height) fd.append('height', String(meta.height));
    if (meta.duration_ms) fd.append('duration_ms', String(meta.duration_ms));
    var res = await fetch(apiUrl('video-studio-asset-upload-simple'), {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'upload_failed');
    return data.asset;
  }

  async function uploadMultipart(file, meta, onProgress) {
    var initRes = await fetch(apiUrl('video-studio-asset-upload-init'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mime: file.type || 'application/octet-stream',
        bytes: file.size,
        original_name: file.name,
        width: meta.width,
        height: meta.height,
        duration_ms: meta.duration_ms,
      }),
    });
    var initData = await initRes.json();
    if (!initData.ok) throw new Error(initData.error || 'init_failed');

    var parts = [];
    var offset = 0;
    var partNumber = 1;
    while (offset < file.size) {
      var end = Math.min(offset + PART_SIZE, file.size);
      // Ensure non-last parts are >= 5MB (R2 requirement) — PART_SIZE is 5MB
      var blob = file.slice(offset, end);
      var fd = new FormData();
      fd.append('asset_id', initData.asset_id);
      fd.append('upload_id', initData.upload_id);
      fd.append('part_number', String(partNumber));
      fd.append('file', blob, 'part-' + partNumber);
      var partRes = await fetch(apiUrl('video-studio-asset-upload-part'), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var partData = await partRes.json();
      if (!partData.ok) throw new Error(partData.error || 'part_failed');
      parts.push({ part_number: partData.part_number, etag: partData.etag });
      offset = end;
      partNumber += 1;
      if (onProgress) onProgress(offset / file.size);
    }

    var completeRes = await fetch(apiUrl('video-studio-asset-upload-complete'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asset_id: initData.asset_id,
        upload_id: initData.upload_id,
        parts: parts,
        width: meta.width,
        height: meta.height,
        duration_ms: meta.duration_ms,
      }),
    });
    var completeData = await completeRes.json();
    if (!completeData.ok) throw new Error(completeData.error || 'complete_failed');
    return completeData.asset;
  }

  /**
   * Upload a client-generated Blob (cut export, audio/vocals export, screenshot,
   * audio-removed video) as a brand-new asset. Does not touch the grid/timeline —
   * callers decide when to merge the result via upsertNewAsset()/replaceAssetInPlace().
   */
  async function uploadBlobAsAsset(blob, opts) {
    opts = opts || {};
    var name = opts.name || 'asset';
    var mime = opts.mime || blob.type || 'application/octet-stream';
    var file = blob instanceof File ? blob : new File([blob], name, { type: mime });
    if (file.size > MAX_BYTES) throw new Error('file_too_large');
    var meta = {
      width: opts.width || null,
      height: opts.height || null,
      duration_ms: opts.duration_ms || null,
    };
    if (file.size <= SIMPLE_MAX) {
      return await uploadSimple(file, meta);
    }
    return await uploadMultipart(file, meta, opts.onProgress);
  }

  async function exportProject() {
    if (!engine) return;
    var btn = document.getElementById('cvs-btn-export');
    if (btn) btn.disabled = true;
    setStatus(i18n('exporting', 'Exporting…'));
    try {
      await saveProject(true);
      var a = currentAspect();
      var blob = await renderExportBlob(a.width, a.height);
      if (!blob) throw new Error('encode_failed');

      // Download locally
      var dlUrl = URL.createObjectURL(blob);
      var aEl = document.createElement('a');
      aEl.href = dlUrl;
      aEl.download = 'video-studio-export.' + (blob.type.indexOf('mp4') >= 0 ? 'mp4' : 'webm');
      document.body.appendChild(aEl);
      aEl.click();
      aEl.remove();
      setTimeout(function () {
        URL.revokeObjectURL(dlUrl);
      }, 2000);

      // Persist to creator video assets
      var fd = new FormData();
      fd.append('file', blob, aEl.download);
      fd.append('project_id', (project && project.id) || '');
      fd.append('title', (project && project.title) || 'Video Studio');
      fd.append('aspect_preset', a.preset);
      fd.append('width', String(a.width));
      fd.append('height', String(a.height));
      fd.append('duration_s', String(Math.ceil(engine.durationMs / 1000)));
      var res = await fetch(apiUrl('video-studio-export'), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (data.ok) {
        setStatus(i18n('export_done', 'Exported to video assets and downloaded'));
        try {
          if (window.CreatorVideosScreen && typeof window.CreatorVideosScreen.refresh === 'function') {
            window.CreatorVideosScreen.refresh();
          }
        } catch (e) {}
      } else {
        setStatus(i18n('export_partial', 'Downloaded locally; cloud save failed'));
      }
    } catch (err) {
      console.warn('[VideoStudio] export failed', err);
      setStatus(i18n('export_failed', 'Export failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderExportBlob(width, height) {
    return new Promise(function (resolve) {
      if (!engine || !engine.durationMs) {
        resolve(null);
        return;
      }
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var stream = canvas.captureStream(30);
      // Mix every video/audio clip's audio into the export. Web Audio only
      // allows a MediaElementSource to be created once per element, ever —
      // reuse a single persistent AudioContext + cached source nodes so
      // exporting more than once doesn't throw "already connected".
      try {
        var audioCtx = getExportAudioContext();
        var dest = audioCtx.createMediaStreamDestination();
        var hasAudio = false;
        Object.keys(engine.mediaEls || {}).forEach(function (assetId) {
          var el = engine.mediaEls[assetId];
          if (!el || (el.tagName !== 'AUDIO' && el.tagName !== 'VIDEO')) return;
          try {
            var src = getExportMediaSource(assetId, el, audioCtx);
            src.connect(dest);
            hasAudio = true;
          } catch (e) {}
        });
        if (hasAudio) {
          dest.stream.getAudioTracks().forEach(function (t) {
            stream.addTrack(t);
          });
        }
      } catch (e) {}

      var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : '';
      if (!mime) {
        resolve(null);
        return;
      }
      var chunks = [];
      var recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = function () {
        resolve(new Blob(chunks, { type: mime }));
      };

      var origW = engine.width;
      var origH = engine.height;
      var origCanvas = document.getElementById('cvs-preview-canvas');
      engine.width = width;
      engine.height = height;
      var start = performance.now();
      var duration = engine.durationMs;
      recorder.start(200);

      function frame(now) {
        var t = Math.min(duration, now - start);
        engine.playheadMs = t;
        // draw onto export canvas via engine by temporarily swapping context target
        if (origCanvas) {
          engine.drawFrame(t);
          var xctx = canvas.getContext('2d');
          xctx.fillStyle = '#000';
          xctx.fillRect(0, 0, width, height);
          xctx.drawImage(origCanvas, 0, 0, width, height);
        }
        if (t >= duration) {
          recorder.stop();
          engine.width = origW;
          engine.height = origH;
          engine.playheadMs = 0;
          engine.render();
          return;
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  // Crop mode shows the full, uncropped source media letterboxed ("contain"
  // fit) as a fixed reference frame, and the crop box maps 1:1 onto it.
  // Dragging edge handles (or the box itself, to reposition) only ever
  // recomputes the crop fraction against that fixed reference — it never
  // touches clip.transform — which is what previously made the whole clip
  // appear to move while cropping.
  function toggleCropMode() {
    cropMode = !cropMode;
    var overlay = document.getElementById('cvs-crop-overlay');
    var box = document.getElementById('cvs-crop-box');
    var transformOverlay = document.getElementById('cvs-transform-overlay');
    if (!overlay || !box) return;
    if (!cropMode) {
      overlay.hidden = true;
      cropRefFrame = null;
      if (engine) engine.drawFrame(engine.playheadMs);
      syncTransformOverlay();
      setStatus('');
      return;
    }
    var sel = engine && engine.getSelected();
    if (!sel) {
      cropMode = false;
      overlay.hidden = true;
      setStatus(i18n('select_clip_first', 'Select a clip to crop'));
      return;
    }
    if (transformOverlay) transformOverlay.hidden = true;
    var ref = engine.drawCropReferenceFrame && engine.drawCropReferenceFrame(sel.clip.id);
    if (!ref) {
      cropMode = false;
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    cropRefFrame = canvasToStageRect(ref);
    var crop = sel.clip.crop || { x: 0, y: 0, w: 1, h: 1 };
    box.style.left = cropRefFrame.left + crop.x * cropRefFrame.width + 'px';
    box.style.top = cropRefFrame.top + crop.y * cropRefFrame.height + 'px';
    box.style.width = Math.max(20, crop.w * cropRefFrame.width) + 'px';
    box.style.height = Math.max(20, crop.h * cropRefFrame.height) + 'px';
    setStatus(i18n('crop_hint', 'Drag the edge handles to crop, or drag the box to reposition. Click Crop again to finish.'));
    bindCropDrag(box);
  }

  function bindCropDrag(box) {
    if (box._cvsBound) return;
    box._cvsBound = true;
    box.addEventListener('mousedown', function (e) {
      if (!cropMode || !cropRefFrame) return;
      e.preventDefault();
      var handle = e.target.getAttribute && e.target.getAttribute('data-handle');
      var startX = e.clientX;
      var startY = e.clientY;
      var start = {
        left: box.offsetLeft,
        top: box.offsetTop,
        width: box.offsetWidth,
        height: box.offsetHeight,
      };
      var minSize = 20;
      var ref = cropRefFrame;
      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        var left = start.left;
        var top = start.top;
        var width = start.width;
        var height = start.height;
        if (!handle) {
          left += dx;
          top += dy;
        } else if (handle === 'w') {
          left += dx;
          width -= dx;
        } else if (handle === 'e') {
          width += dx;
        } else if (handle === 'n') {
          top += dy;
          height -= dy;
        } else if (handle === 's') {
          height += dy;
        }
        if (width < minSize) {
          if (handle === 'w') left -= minSize - width;
          width = minSize;
        }
        if (height < minSize) {
          if (handle === 'n') top -= minSize - height;
          height = minSize;
        }
        left = Math.max(ref.left, Math.min(left, ref.left + ref.width - width));
        top = Math.max(ref.top, Math.min(top, ref.top + ref.height - height));
        width = Math.min(width, ref.left + ref.width - left);
        height = Math.min(height, ref.top + ref.height - top);
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = width + 'px';
        box.style.height = height + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var crop = {
          x: clamp01((box.offsetLeft - ref.left) / ref.width),
          y: clamp01((box.offsetTop - ref.top) / ref.height),
          w: clamp01(box.offsetWidth / ref.width),
          h: clamp01(box.offsetHeight / ref.height),
        };
        if (crop.x + crop.w > 1) crop.w = 1 - crop.x;
        if (crop.y + crop.h > 1) crop.h = 1 - crop.y;
        if (engine) engine.updateSelectedCrop(crop);
        pushHistory();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function ensureEngine() {
    if (engine) return engine;
    if (!window.CreatorVideoStudioTimeline) return null;
    engine = window.CreatorVideoStudioTimeline.create({
      canvas: document.getElementById('cvs-preview-canvas'),
      tracksEl: document.getElementById('cvs-timeline-tracks'),
      rulerEl: document.getElementById('cvs-timeline-ruler'),
      playheadEl: document.getElementById('cvs-timeline-playhead'),
      scrollEl: document.getElementById('cvs-timeline-scroll'),
      onChange: onEngineChange,
      onSelect: onSelectClip,
      onClipContextMenu: openClipContextMenu,
      labels: {
        muteTrack: i18n('mute_track', 'Mute track'),
        trackVolume: i18n('track_volume', 'Track volume'),
      },
    });
    return engine;
  }

  function bindUi() {
    root = document.getElementById('creatorVideoStudioModal');
    if (!root || root._cvsBound) return;
    root._cvsBound = true;

    function on(id, evt, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    }
    on('cvs-btn-close', 'click', close);
    on('cvs-btn-save', 'click', onSaveButtonClick);
    on('cvs-btn-export', 'click', exportProject);
    on('cvs-project-picker', 'click', openProjectsModal);
    on('cvs-btn-new-project', 'click', createNewProject);
    on('cvs-projects-btn-new', 'click', createNewProject);
    on('cvs-projects-btn-close', 'click', closeProjectsModal);
    on('cvs-btn-add', 'click', openAddSourceModal);
    on('cvs-addsrc-cancel', 'click', closeAddSourceModal);
    on('cvsAddSourceModal', 'mousedown', function (e) {
      if (e.target && e.target.id === 'cvsAddSourceModal') closeAddSourceModal();
    });
    on('cvs-addsrc-assets', 'click', function () {
      closeAddSourceModal();
      openAssetsLibraryModal();
    });
    on('cvs-addsrc-device', 'click', function () {
      closeAddSourceModal();
      var input = document.getElementById('cvs-file-input');
      if (input) input.click();
    });
    on('cvs-addsrc-phone', 'click', function () {
      closeAddSourceModal();
      if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
        window.CreatorPhoneUploadModal.open({ purpose: 'video-studio' });
      }
    });
    on('cvs-addsrc-link', 'click', function () {
      closeAddSourceModal();
      openLinkModal();
    });
    on('cvs-file-input', 'change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      files.forEach(function (f) {
        uploadFile(f);
      });
    });
    on('cvs-link-cancel', 'click', closeLinkModal);
    on('cvsLinkModal', 'mousedown', function (e) {
      if (e.target && e.target.id === 'cvsLinkModal') closeLinkModal();
    });
    on('cvs-link-extract', 'click', submitLinkExtract);
    on('cvs-link-submit', 'click', submitLinkDownload);
    on('cvs-link-url', 'keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitLinkExtract();
      }
    });
    on('cvs-link-url', 'input', function () {
      if (linkExtracted) resetLinkPreview();
    });
    on('cvs-library-btn-close', 'click', closeAssetsLibraryModal);
    on('cvs-library-btn-cancel-select', 'click', function () {
      librarySelected = Object.create(null);
      renderLibraryGrid();
    });
    on('cvs-library-btn-remove-selected', 'click', removeSelectedLibraryAssets);
    on('cvs-library-btn-add-selected', 'click', addSelectedLibraryAssetsToProject);
    on('cvs-sidebar-toggle', 'click', function () {
      var wrap = document.getElementById('cvs-sidebar-wrap');
      if (!wrap) return;
      var collapsed = wrap.classList.toggle('is-collapsed');
      var btn = document.getElementById('cvs-sidebar-toggle');
      if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
    on('cvs-aspect-preset', 'change', applyAspectUi);
    on('cvs-aspect-w', 'change', applyAspectUi);
    on('cvs-aspect-h', 'change', applyAspectUi);
    on('cvs-timeline-zoom', 'input', function (e) {
      if (engine) engine.setZoom(Number(e.target.value) || 80);
    });
    on('cvs-btn-play', 'click', function () {
      if (!engine) return;
      var playing = engine.togglePlay();
      this.textContent = playing ? '❚❚' : '▶';
    });
    on('cvs-btn-restart', 'click', function () {
      if (!engine) return;
      engine.restartToStart();
      var playBtn = document.getElementById('cvs-btn-play');
      if (playBtn) playBtn.textContent = '▶';
    });
    on('cvs-btn-backward', 'click', function () {
      if (engine) engine.seekToPrevAudioClip();
    });
    on('cvs-btn-forward', 'click', function () {
      if (engine) engine.seekToNextAudioClip();
    });
    on('cvs-btn-split', 'click', function () {
      if (engine) engine.splitSelected();
    });
    on('cvs-btn-delete-clip', 'click', function () {
      if (engine) engine.deleteSelected();
    });
    on('cvs-btn-undo', 'click', function () {
      if (historyIndex <= 0) return;
      historyIndex -= 1;
      applyHistory(history[historyIndex]);
    });
    on('cvs-btn-redo', 'click', function () {
      if (historyIndex >= history.length - 1) return;
      historyIndex += 1;
      applyHistory(history[historyIndex]);
    });
    on('cvs-btn-crop', 'click', toggleCropMode);
    on('cvs-scale', 'input', function (e) {
      if (engine) engine.updateSelectedTransform({ scale: (Number(e.target.value) || 100) / 100 });
      syncTransformOverlay();
    });
    on('cvs-pos-x', 'change', function (e) {
      if (engine) engine.updateSelectedTransform({ x: Number(e.target.value) || 0 });
      syncTransformOverlay();
    });
    on('cvs-pos-y', 'change', function (e) {
      if (engine) engine.updateSelectedTransform({ y: Number(e.target.value) || 0 });
      syncTransformOverlay();
    });
    bindTransformDrag();
    window.addEventListener('resize', function () {
      syncTransformOverlay();
    });
    on('cvs-clip-volume', 'input', function (e) {
      if (!engine) return;
      engine.updateSelectedAudio({ volume: (Number(e.target.value) || 0) / 100 });
    });
    on('cvs-btn-clip-mute', 'click', function () {
      if (!engine) return;
      var sel = engine.getSelected();
      if (!sel) return;
      engine.updateSelectedAudio({ muted: !sel.clip.muted });
      syncTransformUi();
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen) return;
      function clickId(id) {
        var el = document.getElementById(id);
        if (el) el.click();
      }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        clickId('cvs-btn-play');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        clickId('cvs-btn-undo');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        clickId('cvs-btn-redo');
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
        clickId('cvs-btn-delete-clip');
      }
    });
  }

  async function open() {
    bindUi();
    root = document.getElementById('creatorVideoStudioModal');
    if (!root) return;
    ensureEngine();
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    isOpen = true;
    document.documentElement.classList.add('cvs-studio-open');
    setStatus(i18n('loading', 'Loading…'));
    await loadProject();
    setStatus('');
  }

  function close() {
    if (!root) return;
    if (engine && engine.playing) engine.togglePlay();
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.documentElement.classList.remove('cvs-studio-open');
    cropMode = false;
    cropRefFrame = null;
    var overlay = document.getElementById('cvs-crop-overlay');
    if (overlay) overlay.hidden = true;
    var transformOverlay = document.getElementById('cvs-transform-overlay');
    if (transformOverlay) transformOverlay.hidden = true;
    closeProjectsModal();
    closeAddSourceModal();
    closeAssetsLibraryModal();
    closeLinkModal();
  }

  function isVideoCreationWorkspaceActive() {
    // Mobile swipe viewport
    var viewport = document.getElementById('creatorMobileSwipeViewport');
    if (viewport && viewport.offsetParent !== null) {
      if (!viewport.classList.contains('slide-3')) return false;
      var creation = document.getElementById('creatorMarketingPanelCreation');
      if (!creation || creation.classList.contains('creator-marketing-panel--hidden') || creation.hidden) {
        return false;
      }
      return !!document.querySelector(
        '#creatorMarketingPanelCreation [data-content="videos"].is-active, #creatorMarketing [data-content="videos"].is-active'
      );
    }

    // Desktop hero / portal stage
    var desktopHero = document.getElementById('creatorDesktopHero');
    if (desktopHero) {
      var screen = String(desktopHero.getAttribute('data-desktop-active-screen') || '').toLowerCase();
      if (screen && screen !== 'marketing') return false;
    }

    var creationPanel =
      document.getElementById('creatorMarketingPanelCreation') ||
      document.querySelector('#creatorDesktopMarketingHost [data-subtab="content-creation"], #creatorDesktopContentCreation [data-subtab="content-creation"]');
    if (creationPanel) {
      if (creationPanel.classList.contains('creator-marketing-panel--hidden') || creationPanel.hidden) {
        return false;
      }
    }

    // Active Videos under-tab (creation workspace)
    if (
      document.querySelector(
        '#creatorDesktopMarketingHost [data-content="videos"].is-active, #creatorDesktopContentCreation [data-content="videos"].is-active, #creatorMarketingPanelCreation [data-content="videos"].is-active, #creatorMarketing [data-content="videos"].is-active'
      )
    ) {
      return true;
    }

    // Portal marketing host: under-tab button active
    var underTab = document.querySelector(
      '.creator-marketing-under-tab.is-active[data-content="videos"], [data-creator-under-tab="videos"].is-active'
    );
    if (underTab) {
      var subtab = document.querySelector(
        '.creator-marketing-tab.is-active[data-subtab="content-creation"], [data-subtab="content-creation"].is-active'
      );
      if (subtab) return true;
      var wrap = document.getElementById('creatorDesktopContentCreation') || document.getElementById('creatorMarketing');
      if (wrap && String(wrap.getAttribute('data-marketing-subtab') || '') === 'content-creation') return true;
    }

    return false;
  }

  function updateFooterButtonVisibility() {
    /* Content-bar button is only in the Videos panel footer; no toggle needed beyond panel visibility. */
  }

  function ensureFooterButton() {
    var buttons = document.querySelectorAll(
      '[data-creator-video-studio-open], #creatorFooterVideoStudioBtn, .creator-video-eazy-footer__studio-btn'
    );
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (btn._cvsBound) continue;
      btn._cvsBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    }

    // Remove leftover main-footer CTAs from earlier iteration
    var leftovers = document.querySelectorAll(
      '.creator-desktop-footer__center, .creator-global-footer__center, #creatorFooterVideoStudio'
    );
    for (var j = 0; j < leftovers.length; j++) {
      var node = leftovers[j];
      if (node.closest && node.closest('.creator-video-eazy-footer')) continue;
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }

  function observeWorkspace() {
    ensureFooterButton();
    var obs = new MutationObserver(function () {
      ensureFooterButton();
    });
    var targets = [
      document.getElementById('creatorMobileSwipeViewport'),
      document.getElementById('creatorDesktopHero'),
      document.getElementById('creatorMarketing'),
      document.getElementById('creatorDesktopMarketingHost'),
      document.getElementById('creatorDesktopContentCreation'),
      document.getElementById('creatorMarketingPanelCreation'),
      document.getElementById('creatorMarketingHost'),
      document.body,
    ].filter(Boolean);
    targets.forEach(function (t) {
      obs.observe(t, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class', 'data-desktop-active-screen', 'hidden', 'data-subtab', 'data-marketing-subtab', 'data-content'],
      });
    });
    setTimeout(ensureFooterButton, 500);
    setTimeout(ensureFooterButton, 1500);
  }

  function boot() {
    bindUi();
    observeWorkspace();
    document.addEventListener('creator-marketing-ready', function () {
      ensureFooterButton();
      updateFooterButtonVisibility();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.CreatorVideoStudioModal = {
    open: open,
    close: close,
    refreshAssets: loadAssets,
    getAssets: function () {
      return assets;
    },
    getLocalUrls: function () {
      return localUrls;
    },
    getEngine: function () {
      return engine;
    },
    apiUrl: apiUrl,
    i18n: i18n,
    setStatus: setStatus,
    deleteAsset: detachAssetFromProject,
    detachAsset: detachAssetFromProject,
    hardDeleteLibraryAsset: hardDeleteLibraryAsset,
    attachAssetToProject: attachAssetToProject,
    upsertNewAsset: upsertNewAsset,
    replaceAssetInPlace: replaceAssetInPlace,
    removeAssetClipsFromProject: removeAssetClipsFromProject,
    assetUsageCount: assetUsageCount,
    uploadBlobAsAsset: uploadBlobAsAsset,
    confirm: cvsConfirm,
  };
})();
