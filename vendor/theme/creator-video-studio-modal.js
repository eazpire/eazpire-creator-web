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
  var exportAudioCtx = null;
  var exportSourceCache = Object.create(null);

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

  function getOwnerId() {
    if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null) {
      return String(window.__EAZ_OWNER_ID);
    }
    var meta = document.querySelector('meta[name="creator-owner-id"]');
    return meta ? meta.getAttribute('content') : null;
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
    scheduleSave();
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
          deleteAsset(asset.id);
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

  async function deleteAsset(assetId) {
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
        i18n('confirm_delete_used_prefix', 'This asset is used in ') +
        usage +
        i18n(
          'confirm_delete_used_suffix',
          ' clip(s) in the current project. Delete it anyway? The clips will be removed from the timeline.'
        );
    } else {
      msg = i18n('confirm_delete', 'Delete this asset? This cannot be undone.');
    }
    if (!window.confirm(msg)) return;

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
      assets = assets.filter(function (a) {
        return a.id !== assetId;
      });
      delete localUrls[assetId];
      delete localFiles[assetId];
      if (usage > 0) removeAssetClipsFromProject(assetId);
      if (engine) engine.setAssets(assets, localUrls);
      renderAssetGrid();
      setStatus(i18n('asset_deleted', 'Asset deleted'));
    } catch (e) {
      console.warn('[VideoStudio] delete failed', e);
      setStatus(i18n('delete_failed', 'Delete failed'));
    }
  }

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

  async function loadAssets() {
    try {
      var res = await fetch(apiUrl('video-studio-assets-list'), { credentials: 'include' });
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
      console.warn('[VideoStudio] assets list failed', e);
    }
  }

  async function loadProject() {
    try {
      var res = await fetch(apiUrl('video-studio-project-get'), { credentials: 'include' });
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
      if (engine) {
        engine.setAssets(assets, localUrls);
        engine.setProject(project);
      }
      history = [JSON.stringify(engine.getDraft())];
      historyIndex = 0;
      updateTimeUi();
    } catch (e) {
      console.warn('[VideoStudio] project load failed', e);
    }
  }

  async function saveProject(silent) {
    if (!engine) return;
    var a = currentAspect();
    var body = {
      project_id: project && project.id,
      title: (project && project.title) || 'Untitled',
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
        if (!silent) setStatus(i18n('saved', 'Saved'));
      } else if (!silent) {
        setStatus(i18n('save_failed', 'Save failed'));
      }
    } catch (e) {
      if (!silent) setStatus(i18n('save_failed', 'Save failed'));
    }
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

  function toggleCropMode() {
    cropMode = !cropMode;
    var overlay = document.getElementById('cvs-crop-overlay');
    var box = document.getElementById('cvs-crop-box');
    if (!overlay || !box) return;
    overlay.hidden = !cropMode;
    if (!cropMode) return;
    var sel = engine && engine.getSelected();
    if (!sel) {
      cropMode = false;
      overlay.hidden = true;
      setStatus(i18n('select_clip_first', 'Select a clip to crop'));
      return;
    }
    var crop = sel.clip.crop || { x: 0, y: 0, w: 1, h: 1 };
    var stage = document.getElementById('cvs-viewer-stage');
    var canvas = document.getElementById('cvs-preview-canvas');
    if (!stage || !canvas) return;
    var stageRect = stage.getBoundingClientRect();
    var canvasRect = canvas.getBoundingClientRect();
    var left = canvasRect.left - stageRect.left + crop.x * canvasRect.width;
    var top = canvasRect.top - stageRect.top + crop.y * canvasRect.height;
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.width = Math.max(20, crop.w * canvasRect.width) + 'px';
    box.style.height = Math.max(20, crop.h * canvasRect.height) + 'px';
    bindCropDrag(box, canvas, stage);
  }

  function bindCropDrag(box, canvas, stage) {
    if (box._cvsBound) return;
    box._cvsBound = true;
    box.addEventListener('mousedown', function (e) {
      if (!cropMode) return;
      var handle = e.target.getAttribute('data-handle');
      var startX = e.clientX;
      var startY = e.clientY;
      var start = {
        left: box.offsetLeft,
        top: box.offsetTop,
        width: box.offsetWidth,
        height: box.offsetHeight,
      };
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
        } else {
          if (handle.indexOf('w') >= 0) {
            left += dx;
            width -= dx;
          }
          if (handle.indexOf('e') >= 0) width += dx;
          if (handle.indexOf('n') >= 0) {
            top += dy;
            height -= dy;
          }
          if (handle.indexOf('s') >= 0) height += dy;
        }
        width = Math.max(20, width);
        height = Math.max(20, height);
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = width + 'px';
        box.style.height = height + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var stageRect = stage.getBoundingClientRect();
        var canvasRect = canvas.getBoundingClientRect();
        var bx = box.offsetLeft - (canvasRect.left - stageRect.left);
        var by = box.offsetTop - (canvasRect.top - stageRect.top);
        var crop = {
          x: clamp01(bx / canvasRect.width),
          y: clamp01(by / canvasRect.height),
          w: clamp01(box.offsetWidth / canvasRect.width),
          h: clamp01(box.offsetHeight / canvasRect.height),
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
    on('cvs-btn-save', 'click', function () {
      saveProject(false);
    });
    on('cvs-btn-export', 'click', exportProject);
    on('cvs-btn-add', 'click', function () {
      var input = document.getElementById('cvs-file-input');
      if (input) input.click();
    });
    on('cvs-file-input', 'change', function (e) {
      var files = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      files.forEach(function (f) {
        uploadFile(f);
      });
    });
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
    });
    on('cvs-pos-x', 'change', function (e) {
      if (engine) engine.updateSelectedTransform({ x: Number(e.target.value) || 0 });
    });
    on('cvs-pos-y', 'change', function (e) {
      if (engine) engine.updateSelectedTransform({ y: Number(e.target.value) || 0 });
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
    await loadAssets();
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
    var overlay = document.getElementById('cvs-crop-overlay');
    if (overlay) overlay.hidden = true;
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
    deleteAsset: deleteAsset,
    upsertNewAsset: upsertNewAsset,
    replaceAssetInPlace: replaceAssetInPlace,
    removeAssetClipsFromProject: removeAssetClipsFromProject,
    assetUsageCount: assetUsageCount,
    uploadBlobAsAsset: uploadBlobAsAsset,
  };
})();
