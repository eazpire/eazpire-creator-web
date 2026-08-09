/**
 * Creator Video Transition modal (IDEA-067) — page-based shell + lab encode host
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var DEFAULT_LAB_URL = 'http://127.0.0.1:3466/?embed=1';
  var SHADER_NAMES = [
    'crosswarp', 'directionalwarp', 'morph', 'Swirl', 'WaterDrop', 'ripple',
    'ButterflyWaveScrawler', 'GlitchMemories', 'cube', 'Dreamy', 'CrossZoom',
    'ZoomInCircles', 'flyeye', 'hexagonalize', 'undulatingBurnOut',
    'DoomScreenTransition', 'windowslice', 'ColourDistance', 'PolkaDotsCurtain', 'swap'
  ];

  var root = null;
  var state = {
    page: 'project',
    clipId: 'start',
    sidebarCollapsed: false,
    clipSidebarCollapsed: false,
    floatMinimized: true,
    rendering: false,
    labReady: false,
    drag: null,
    results: [],
    templates: [],
    assets: { clips: [], voiceovers: [], audio: [], results: [] },
    selectedAssetIds: [],
    pendingApplyTemplate: null,
    project: createEmptyProject()
  };

  function createEmptyProject() {
    return {
      meta: { title: '', description: '', tags: '' },
      ratio: { mode: 'matchStart', presetId: 'yt-landscape', customW: 1080, customH: 1920, maxSide: 1280 },
      global: {
        shader: 'crosswarp',
        xfade: 0.75,
        clipPlaySec: 3,
        audioMode: 'original',
        volume: 100,
        audioFile: null,
        audioAssetId: null
      },
      start: {
        file: null,
        objectUrl: null,
        assetId: null,
        settingsMode: 'global',
        clipLen: 3,
        audioMode: 'original',
        volume: 100,
        useGlobal: { clipLen: true, audioMode: true, volume: true }
      },
      transitions: [createTransitionSlot()],
      end: {
        enabled: false,
        file: null,
        objectUrl: null,
        assetId: null,
        settingsMode: 'global',
        clipLen: 3,
        audioMode: 'original',
        volume: 100,
        useGlobal: { clipLen: true, audioMode: true, volume: true }
      },
      voiceover: {
        enabled: false,
        text: '',
        file: null,
        objectUrl: null,
        assetId: null,
        startSec: 0,
        words: [],
        cues: []
      }
    };
  }

  function createTransitionSlot() {
    return {
      id: 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      file: null,
      objectUrl: null,
      assetId: null,
      settingsMode: 'global',
      clipLen: 3,
      audioMode: 'original',
      volume: 100,
      useGlobal: { clipLen: true, audioMode: true, volume: true }
    };
  }

  function isBadTranslationString(s) {
    if (typeof s !== 'string') return true;
    var t = s.toLowerCase();
    return !t || t.indexOf('translation missing') !== -1;
  }

  function i18n(key, fallback) {
    try {
      var ns = window.CreatorI18n && window.CreatorI18n.video_transition;
      if (ns && ns[key] != null && !isBadTranslationString(String(ns[key]))) return String(ns[key]);
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

  function $all(sel, el) {
    return Array.prototype.slice.call((el || root).querySelectorAll(sel));
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

  function showEl(el, on) {
    if (!el) return;
    if (on) {
      el.hidden = false;
      el.removeAttribute('hidden');
    } else {
      el.hidden = true;
      el.setAttribute('hidden', '');
    }
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

  function setClipSidebarCollapsed(collapsed) {
    state.clipSidebarCollapsed = !!collapsed;
    var side = $('#cvt-clip-sidebar');
    var rail = $('#cvt-clip-sidebar-toggle');
    if (!side) return;
    side.classList.toggle('is-collapsed', state.clipSidebarCollapsed);
    if (rail) {
      rail.setAttribute('aria-expanded', state.clipSidebarCollapsed ? 'false' : 'true');
      rail.textContent = state.clipSidebarCollapsed ? '›' : '‹';
    }
  }

  function showPage(page) {
    state.page = page || 'project';
    $all('[data-cvt-page]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-cvt-page') === state.page);
    });
    $all('[data-cvt-page-panel]').forEach(function (panel) {
      var on = panel.getAttribute('data-cvt-page-panel') === state.page;
      panel.classList.toggle('is-active', on);
      showEl(panel, on);
    });
    showEl($('#cvt-assets-float'), state.page === 'assets' && state.selectedAssetIds.length > 0);
    if (state.page === 'templates') loadTemplates();
    if (state.page === 'assets') loadAssets();
    if (state.page === 'results') renderResultsGrid();
    if (state.page === 'clips') {
      renderClipNav();
      syncClipEditor();
    }
    postLab({ type: 'goto-page', page: state.page });
  }

  function populateShaders() {
    var sel = $('#cvt-global-shader');
    if (!sel || sel.options.length) return;
    SHADER_NAMES.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }

  function loadLabFrame() {
    var frame = $('#cvt-lab-frame');
    if (!frame) return;
    var url = labUrl();
    if (!url) {
      setStatusPill(i18n('lab_missing', 'Lab URL not configured'));
      return;
    }
    if (frame.getAttribute('data-cvt-src') === url) {
      postLab({ type: 'ensure-ffmpeg' });
      return;
    }
    frame.setAttribute('data-cvt-src', url);
    frame.src = url;
    setStatusPill(i18n('lab_loading', 'Loading editor…'));
  }

  function postLab(msg) {
    var frame = $('#cvt-lab-frame');
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        Object.assign({ source: 'eazpire-cvt-host' }, msg),
        '*'
      );
    } catch (e) {}
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
    if (item.buffer) return new Blob([item.buffer], { type: item.mime || 'video/webm' });
    return null;
  }

  async function apiJson(op, opts) {
    opts = opts || {};
    var ownerId = getOwnerId();
    var url = API_BASE + '?op=' + encodeURIComponent(op);
    if (ownerId) url += '&owner_id=' + encodeURIComponent(ownerId);
    var init = { method: opts.method || 'GET', credentials: 'include' };
    if (opts.body instanceof FormData) {
      init.body = opts.body;
      if (ownerId && !opts.body.has('owner_id')) opts.body.append('owner_id', ownerId);
    } else if (opts.json) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opts.json);
    }
    var res = await fetch(url, init);
    try {
      return await res.json();
    } catch (e) {
      return { ok: false, error: 'bad_json' };
    }
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
    fd.append('file', new Blob([buf], { type: blob.type || 'application/octet-stream' }), meta.filename || 'asset.bin');
    if (meta.label) fd.append('title', meta.label);
    return apiJson('video-transition-save', { method: 'POST', body: fd });
  }

  function findClip(id) {
    if (id === 'start') return state.project.start;
    if (id === 'end') return state.project.end;
    return state.project.transitions.find(function (t) { return t.id === id; }) || null;
  }

  function renderClipNav() {
    var list = $('#cvt-clip-transition-list');
    if (!list) return;
    list.innerHTML = '';
    state.project.transitions.forEach(function (t, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cvt-clip-item' + (state.clipId === t.id ? ' is-active' : '');
      btn.setAttribute('data-cvt-clip', t.id);
      btn.textContent = 'T' + (i + 1);
      list.appendChild(btn);
    });
    $all('[data-cvt-clip]').forEach(function (btn) {
      var id = btn.getAttribute('data-cvt-clip');
      btn.classList.toggle('is-active', id === state.clipId);
      if (id === 'end') {
        btn.textContent = state.project.end.enabled
          ? i18n('clip_end', 'End')
          : i18n('clip_end_optional', 'End (optional)');
      }
    });
  }

  function syncClipEditor() {
    var clip = findClip(state.clipId);
    if (!clip) return;
    var preview = $('#cvt-clip-preview');
    if (preview) {
      if (clip.objectUrl) {
        preview.src = clip.objectUrl;
        showEl(preview, true);
      } else {
        preview.removeAttribute('src');
        showEl(preview, false);
      }
    }
    var modeGlobal = root.querySelector('input[name="cvt-clip-mode"][value="global"]');
    var modeOwn = root.querySelector('input[name="cvt-clip-mode"][value="own"]');
    if (modeGlobal) modeGlobal.checked = clip.settingsMode !== 'own';
    if (modeOwn) modeOwn.checked = clip.settingsMode === 'own';
    showEl($('#cvt-clip-individual'), clip.settingsMode === 'own');
    var len = $('#cvt-clip-len');
    var audio = $('#cvt-clip-audio-mode');
    var vol = $('#cvt-clip-volume');
    if (len) len.value = String(clip.clipLen || state.project.global.clipPlaySec);
    if (audio) audio.value = clip.audioMode || 'original';
    if (vol) vol.value = String(clip.volume != null ? clip.volume : 100);
    var gLen = $('#cvt-clip-len-global');
    var gAud = $('#cvt-clip-audio-global');
    var gVol = $('#cvt-clip-volume-global');
    if (gLen) gLen.checked = !!(clip.useGlobal && clip.useGlobal.clipLen);
    if (gAud) gAud.checked = !!(clip.useGlobal && clip.useGlobal.audioMode);
    if (gVol) gVol.checked = !!(clip.useGlobal && clip.useGlobal.volume);
    applyGlobalSourceLocks();
  }

  function applyGlobalSourceLocks() {
    var clip = findClip(state.clipId);
    if (!clip || !clip.useGlobal) return;
    var len = $('#cvt-clip-len');
    var audio = $('#cvt-clip-audio-mode');
    var vol = $('#cvt-clip-volume');
    if (len) {
      len.disabled = !!clip.useGlobal.clipLen;
      if (clip.useGlobal.clipLen) len.value = String(state.project.global.clipPlaySec);
    }
    if (audio) {
      audio.disabled = !!clip.useGlobal.audioMode;
      if (clip.useGlobal.audioMode) audio.value = state.project.global.audioMode;
    }
    if (vol) {
      vol.disabled = !!clip.useGlobal.volume;
      if (clip.useGlobal.volume) vol.value = String(state.project.global.volume);
    }
  }

  function readFormIntoProject() {
    var p = state.project;
    p.meta.title = ($('#cvt-project-title') && $('#cvt-project-title').value) || '';
    p.meta.description = ($('#cvt-project-description') && $('#cvt-project-description').value) || '';
    p.meta.tags = ($('#cvt-project-tags') && $('#cvt-project-tags').value) || '';
    p.ratio.mode = ($('#cvt-ratio-mode') && $('#cvt-ratio-mode').value) || 'matchStart';
    p.ratio.presetId = ($('#cvt-ratio-preset') && $('#cvt-ratio-preset').value) || 'yt-landscape';
    p.ratio.customW = Number(($('#cvt-ratio-w') && $('#cvt-ratio-w').value) || 1080);
    p.ratio.customH = Number(($('#cvt-ratio-h') && $('#cvt-ratio-h').value) || 1920);
    p.ratio.maxSide = Number(($('#cvt-ratio-max') && $('#cvt-ratio-max').value) || 1280);
    p.global.shader = ($('#cvt-global-shader') && $('#cvt-global-shader').value) || 'crosswarp';
    p.global.xfade = Number(($('#cvt-global-xfade') && $('#cvt-global-xfade').value) || 0.75);
    p.global.clipPlaySec = Number(($('#cvt-global-clip-len') && $('#cvt-global-clip-len').value) || 3);
    p.global.audioMode = ($('#cvt-global-audio-mode') && $('#cvt-global-audio-mode').value) || 'original';
    p.global.volume = Number(($('#cvt-global-volume') && $('#cvt-global-volume').value) || 100);
    p.voiceover.enabled = !!( $('#cvt-vo-enabled') && $('#cvt-vo-enabled').checked );
    p.voiceover.text = ($('#cvt-vo-text') && $('#cvt-vo-text').value) || '';
    p.voiceover.startSec = Number(($('#cvt-vo-start') && $('#cvt-vo-start').value) || 0);
    var cuesEl = $('#cvt-vo-cues-json');
    if (cuesEl && cuesEl.value) {
      try {
        var parsed = JSON.parse(cuesEl.value);
        p.voiceover.words = parsed.words || [];
        p.voiceover.cues = parsed.cues || [];
      } catch (e) {}
    }
  }

  function writeProjectToForm() {
    var p = state.project;
    if ($('#cvt-project-title')) $('#cvt-project-title').value = p.meta.title || '';
    if ($('#cvt-project-description')) $('#cvt-project-description').value = p.meta.description || '';
    if ($('#cvt-project-tags')) $('#cvt-project-tags').value = p.meta.tags || '';
    if ($('#cvt-ratio-mode')) $('#cvt-ratio-mode').value = p.ratio.mode;
    if ($('#cvt-ratio-preset')) $('#cvt-ratio-preset').value = p.ratio.presetId;
    if ($('#cvt-ratio-w')) $('#cvt-ratio-w').value = String(p.ratio.customW);
    if ($('#cvt-ratio-h')) $('#cvt-ratio-h').value = String(p.ratio.customH);
    if ($('#cvt-ratio-max')) $('#cvt-ratio-max').value = String(p.ratio.maxSide);
    if ($('#cvt-global-shader')) $('#cvt-global-shader').value = p.global.shader;
    if ($('#cvt-global-xfade')) $('#cvt-global-xfade').value = String(p.global.xfade);
    if ($('#cvt-global-clip-len')) $('#cvt-global-clip-len').value = String(p.global.clipPlaySec);
    if ($('#cvt-global-audio-mode')) $('#cvt-global-audio-mode').value = p.global.audioMode;
    if ($('#cvt-global-volume')) $('#cvt-global-volume').value = String(p.global.volume);
    showEl($('#cvt-ratio-preset-wrap'), p.ratio.mode === 'preset');
    showEl($('#cvt-ratio-custom-wrap'), p.ratio.mode === 'custom');
    showEl($('#cvt-global-audio-file-wrap'), p.global.audioMode === 'custom');
    if ($('#cvt-vo-enabled')) $('#cvt-vo-enabled').checked = !!p.voiceover.enabled;
    if ($('#cvt-vo-text')) $('#cvt-vo-text').value = p.voiceover.text || '';
    if ($('#cvt-vo-start')) $('#cvt-vo-start').value = String(p.voiceover.startSec || 0);
    updateVoPreview();
  }

  function updateVoPreview() {
    var cueEl = $('#cvt-vo-preview-cue');
    var audio = $('#cvt-vo-preview-audio');
    var cues = state.project.voiceover.cues || [];
    if (cueEl) cueEl.textContent = cues.length ? cues[0].text : (state.project.voiceover.text || '');
    if (audio && state.project.voiceover.objectUrl) {
      audio.src = state.project.voiceover.objectUrl;
    }
  }

  async function fileToTransfer(file) {
    if (!file) return null;
    var buf = await file.arrayBuffer();
    return {
      name: file.name || 'file.bin',
      mime: file.type || 'application/octet-stream',
      buffer: buf
    };
  }

  async function buildLabPayload() {
    readFormIntoProject();
    var p = state.project;
    var g = p.global;
    var files = {
      start: await fileToTransfer(p.start.file),
      transitions: [],
      end: p.end.enabled ? await fileToTransfer(p.end.file) : null,
      voiceover: p.voiceover.enabled ? await fileToTransfer(p.voiceover.file) : null,
      globalAudio: g.audioMode === 'custom' ? await fileToTransfer(g.audioFile) : null
    };
    for (var i = 0; i < p.transitions.length; i++) {
      files.transitions.push(await fileToTransfer(p.transitions[i].file));
    }

    function clipSettings(clip) {
      var mode = clip.settingsMode === 'own' ? 'own' : 'global';
      var ug = clip.useGlobal || {};
      var clipLen = mode === 'own' && !ug.clipLen ? clip.clipLen : g.clipPlaySec;
      var audioMode = mode === 'own' && !ug.audioMode ? clip.audioMode : g.audioMode;
      var volume = mode === 'own' && !ug.volume ? clip.volume : g.volume;
      return {
        settingsMode: mode,
        clipPlaySec: clipLen,
        audioMode: audioMode,
        volume: volume,
        assetId: clip.assetId || null
      };
    }

    return {
      meta: p.meta,
      ratio: p.ratio,
      globalDefaults: {
        shader: g.shader,
        xfade: g.xfade,
        clipPlaySec: g.clipPlaySec,
        shadersCompare: [g.shader],
        audioMode: g.audioMode,
        volume: g.volume
      },
      start: Object.assign({ enabled: true }, clipSettings(p.start)),
      transitions: p.transitions.map(function (t) {
        return Object.assign({ id: t.id }, clipSettings(t));
      }),
      end: Object.assign({ enabled: !!p.end.enabled }, clipSettings(p.end)),
      voiceover: {
        enabled: !!p.voiceover.enabled,
        source: 'upload',
        text: p.voiceover.text || '',
        startSec: p.voiceover.startSec || 0,
        words: p.voiceover.words || [],
        cues: p.voiceover.cues || [],
        subtitles: { enabled: true }
      },
      files: files
    };
  }

  function buildTemplateSnapshot() {
    readFormIntoProject();
    var p = state.project;
    return {
      meta: p.meta,
      ratio: p.ratio,
      global: {
        shader: p.global.shader,
        xfade: p.global.xfade,
        clipPlaySec: p.global.clipPlaySec,
        audioMode: p.global.audioMode,
        volume: p.global.volume,
        audioAssetId: p.global.audioAssetId
      },
      start: {
        assetId: p.start.assetId,
        settingsMode: p.start.settingsMode,
        clipLen: p.start.clipLen,
        audioMode: p.start.audioMode,
        volume: p.start.volume,
        useGlobal: p.start.useGlobal
      },
      transitions: p.transitions.map(function (t) {
        return {
          id: t.id,
          assetId: t.assetId,
          settingsMode: t.settingsMode,
          clipLen: t.clipLen,
          audioMode: t.audioMode,
          volume: t.volume,
          useGlobal: t.useGlobal
        };
      }),
      end: {
        enabled: p.end.enabled,
        assetId: p.end.assetId,
        settingsMode: p.end.settingsMode,
        clipLen: p.end.clipLen,
        audioMode: p.end.audioMode,
        volume: p.end.volume,
        useGlobal: p.end.useGlobal
      },
      voiceover: {
        enabled: p.voiceover.enabled,
        text: p.voiceover.text,
        startSec: p.voiceover.startSec,
        assetId: p.voiceover.assetId,
        words: p.voiceover.words,
        cues: p.voiceover.cues
      }
    };
  }

  async function assignFileToClip(clip, file, kind) {
    if (!clip || !file) return;
    if (clip.objectUrl) {
      try { URL.revokeObjectURL(clip.objectUrl); } catch (e) {}
    }
    clip.file = file;
    clip.objectUrl = URL.createObjectURL(file);
    try {
      var saved = await saveTransitionAsset(kind || 'clip', file, {
        label: file.name || 'Clip',
        filename: file.name || 'clip.mp4'
      });
      if (saved && saved.ok) clip.assetId = saved.asset_id;
    } catch (e) {
      console.warn('[CVT] clip save failed', e);
    }
  }

  function setFloatLoading(on) {
    showEl($('#cvt-float'), true);
    showEl($('#cvt-float-panel'), true);
    showEl($('#cvt-float-loading'), !!on);
    state.floatMinimized = false;
    var floatRoot = $('#cvt-float');
    if (floatRoot) floatRoot.setAttribute('data-minimized', '0');
  }

  function renderFloatCarousel() {
    var carousel = $('#cvt-float-carousel');
    var countEl = $('#cvt-float-count');
    var floatRoot = $('#cvt-float');
    if (!carousel || !floatRoot) return;
    carousel.innerHTML = '';
    var ok = state.results.filter(function (r) { return r && r.url && !r.error; });
    if (!ok.length && !state.rendering) {
      showEl(floatRoot, false);
      if (countEl) showEl(countEl, false);
      return;
    }
    showEl(floatRoot, true);
    if (countEl) {
      showEl(countEl, !!ok.length);
      countEl.textContent = String(ok.length);
    }
    ok.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cvt-float__card';
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

  function renderResultsGrid() {
    var grid = $('#cvt-results-grid');
    var empty = $('#cvt-results-empty');
    if (!grid) return;
    grid.innerHTML = '';
    var items = state.results.filter(function (r) { return r && r.url; });
    showEl(empty, !items.length);
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cvt-card-item';
      var vid = document.createElement('video');
      vid.src = item.url;
      vid.controls = true;
      vid.playsInline = true;
      card.appendChild(vid);
      var title = document.createElement('div');
      title.className = 'cvt-card-item__title';
      title.textContent = item.label || i18n('result', 'Result');
      card.appendChild(title);
      grid.appendChild(card);
    });
  }

  async function loadTemplates() {
    var data = await apiJson('video-transition-templates-list');
    state.templates = (data && data.templates) || [];
    var grid = $('#cvt-template-grid');
    var empty = $('#cvt-templates-empty');
    if (!grid) return;
    grid.innerHTML = '';
    showEl(empty, !state.templates.length);
    state.templates.forEach(function (tpl) {
      var card = document.createElement('div');
      card.className = 'cvt-card-item';
      card.innerHTML = '<div class="cvt-card-item__title"></div><p class="cvt-page__hint"></p>';
      card.querySelector('.cvt-card-item__title').textContent = tpl.title || 'Template';
      card.querySelector('p').textContent = tpl.description || '';
      card.addEventListener('click', function () { openApplyTemplate(tpl); });
      grid.appendChild(card);
    });
  }

  async function loadAssets() {
    var data = await apiJson('video-transition-assets-list');
    state.assets = (data && data.assets) || { clips: [], voiceovers: [], audio: [], results: [] };
    renderAssets();
  }

  function renderAssets() {
    var host = $('#cvt-assets-sections');
    var empty = $('#cvt-assets-empty');
    if (!host) return;
    host.innerHTML = '';
    var sections = [
      { key: 'clips', title: i18n('assets_clips', 'Clips'), items: state.assets.clips || [] },
      { key: 'voiceovers', title: i18n('assets_voiceovers', 'Voiceovers'), items: state.assets.voiceovers || [] },
      { key: 'audio', title: i18n('assets_audio', 'Audio'), items: state.assets.audio || [] },
      { key: 'results', title: i18n('assets_results', 'Transition Videos'), items: state.assets.results || [] }
    ];
    var total = 0;
    sections.forEach(function (sec) {
      total += sec.items.length;
      if (!sec.items.length) return;
      var wrap = document.createElement('div');
      wrap.className = 'cvt-assets-section';
      wrap.innerHTML = '<h4></h4><div class="cvt-asset-grid"></div>';
      wrap.querySelector('h4').textContent = sec.title;
      var grid = wrap.querySelector('.cvt-asset-grid');
      sec.items.forEach(function (item) {
        var card = document.createElement('div');
        card.className = 'cvt-card-item' + (state.selectedAssetIds.indexOf(item.id) >= 0 ? ' is-selected' : '');
        card.setAttribute('data-asset-id', item.id);
        card.setAttribute('data-asset-kind', item.kind || sec.key);
        if (item.kind === 'result' || item.mime && item.mime.indexOf('video') === 0 || sec.key === 'clips' || sec.key === 'results') {
          var v = document.createElement('video');
          v.src = item.url || '';
          v.muted = true;
          v.playsInline = true;
          v.preload = 'metadata';
          card.appendChild(v);
        }
        var title = document.createElement('div');
        title.className = 'cvt-card-item__title';
        title.textContent = item.title || item.id;
        card.appendChild(title);
        card.addEventListener('click', function () {
          var idx = state.selectedAssetIds.indexOf(item.id);
          if (idx >= 0) state.selectedAssetIds.splice(idx, 1);
          else state.selectedAssetIds.push(item.id);
          renderAssets();
          showEl($('#cvt-assets-float'), state.selectedAssetIds.length > 0);
        });
        grid.appendChild(card);
      });
      host.appendChild(wrap);
    });
    showEl(empty, total === 0);
  }

  function openApplyTemplate(tpl) {
    state.pendingApplyTemplate = tpl;
    var host = $('#cvt-tpl-apply-checks');
    if (!host) return;
    host.innerHTML = '';
    var snap = tpl.snapshot || {};
    var groups = [
      { title: i18n('nav_video_settings', 'Video Settings'), keys: [['ratio', !!snap.ratio]] },
      { title: i18n('nav_global_settings', 'Global Settings'), keys: [
        ['global_transitions', !!(snap.global && (snap.global.shader || snap.global.xfade))],
        ['global_video_defaults', !!(snap.global && snap.global.clipPlaySec != null)]
      ]},
      { title: i18n('nav_clips', 'Clips'), keys: [
        ['start', !!(snap.start && snap.start.assetId)],
        ['end', !!(snap.end && snap.end.enabled)]
      ].concat((snap.transitions || []).map(function (t, i) {
        return ['t' + i, !!t.assetId];
      })) },
      { title: i18n('nav_voiceover', 'Voiceover'), keys: [['voiceover', !!(snap.voiceover && (snap.voiceover.assetId || snap.voiceover.text))]] }
    ];
    groups.forEach(function (g) {
      var keys = g.keys.filter(function (k) { return k[1]; });
      if (!keys.length) return;
      var box = document.createElement('div');
      box.className = 'cvt-check-group';
      box.innerHTML = '<strong></strong>';
      box.querySelector('strong').textContent = g.title;
      keys.forEach(function (pair) {
        var label = document.createElement('label');
        label.innerHTML = '<input type="checkbox" checked data-apply-key="' + pair[0] + '"> <span></span>';
        label.querySelector('span').textContent = pair[0];
        box.appendChild(label);
      });
      host.appendChild(box);
    });
    showEl($('#cvt-template-apply'), true);
  }

  async function applyTemplateSelections() {
    var tpl = state.pendingApplyTemplate;
    if (!tpl) return;
    var snap = tpl.snapshot || {};
    var keys = {};
    $all('#cvt-tpl-apply-checks [data-apply-key]').forEach(function (cb) {
      if (cb.checked) keys[cb.getAttribute('data-apply-key')] = true;
    });
    if (keys.ratio && snap.ratio) state.project.ratio = Object.assign({}, state.project.ratio, snap.ratio);
    if (keys.global_transitions && snap.global) {
      state.project.global.shader = snap.global.shader || state.project.global.shader;
      state.project.global.xfade = snap.global.xfade != null ? snap.global.xfade : state.project.global.xfade;
    }
    if (keys.global_video_defaults && snap.global) {
      state.project.global.clipPlaySec = snap.global.clipPlaySec != null ? snap.global.clipPlaySec : state.project.global.clipPlaySec;
      state.project.global.audioMode = snap.global.audioMode || state.project.global.audioMode;
      state.project.global.volume = snap.global.volume != null ? snap.global.volume : state.project.global.volume;
    }
    if (keys.start && snap.start) {
      Object.assign(state.project.start, snap.start);
      if (snap.start.assetId) await hydrateAssetOntoClip(state.project.start, snap.start.assetId);
    }
    if (keys.end && snap.end) {
      Object.assign(state.project.end, snap.end);
      state.project.end.enabled = true;
      if (snap.end.assetId) await hydrateAssetOntoClip(state.project.end, snap.end.assetId);
    }
    (snap.transitions || []).forEach(function (t, i) {
      if (!keys['t' + i]) return;
      while (state.project.transitions.length <= i) state.project.transitions.push(createTransitionSlot());
      Object.assign(state.project.transitions[i], t);
      if (t.assetId) hydrateAssetOntoClip(state.project.transitions[i], t.assetId);
    });
    if (keys.voiceover && snap.voiceover) {
      Object.assign(state.project.voiceover, snap.voiceover);
      if (snap.voiceover.assetId) await hydrateAssetOntoClip(state.project.voiceover, snap.voiceover.assetId, true);
    }
    writeProjectToForm();
    renderClipNav();
    showEl($('#cvt-template-apply'), false);
    setStatusPill(i18n('template_applied', 'Template applied'));
  }

  async function hydrateAssetOntoClip(clip, assetId, isAudio) {
    if (!clip || !assetId) return;
    clip.assetId = assetId;
    var all = []
      .concat(state.assets.clips || [])
      .concat(state.assets.voiceovers || [])
      .concat(state.assets.audio || [])
      .concat(state.assets.results || []);
    var item = all.find(function (a) { return a.id === assetId; });
    if (!item || !item.url) {
      await loadAssets();
      all = []
        .concat(state.assets.clips || [])
        .concat(state.assets.voiceovers || [])
        .concat(state.assets.audio || [])
        .concat(state.assets.results || []);
      item = all.find(function (a) { return a.id === assetId; });
    }
    if (!item || !item.url) return;
    try {
      var res = await fetch(item.url, { credentials: 'include' });
      var blob = await res.blob();
      var file = new File([blob], item.title || 'asset', { type: item.mime || blob.type });
      if (clip.objectUrl) {
        try { URL.revokeObjectURL(clip.objectUrl); } catch (e) {}
      }
      clip.file = file;
      clip.objectUrl = URL.createObjectURL(file);
      if (isAudio) updateVoPreview();
    } catch (e) {
      console.warn('[CVT] hydrate asset failed', e);
    }
  }

  /** Client-side fill mode (mirrors worker helper) */
  function pickAssetsForFill(pool, selectedIds, mode, count, seed) {
    var list = Array.isArray(pool) ? pool.slice() : [];
    var selected = (selectedIds || []).filter(Boolean);
    var byId = {};
    list.forEach(function (a) { byId[a.id] = a; });
    var selectedItems = selected.map(function (id) { return byId[id]; }).filter(Boolean);
    var source = selectedItems.length ? selectedItems : list;
    var n = Math.max(0, Math.min(10, Number(count) || 0));
    if (!source.length || !n) return [];
    if (mode === 'selection') return source.slice(0, n);
    var sorted = source.slice().sort(function (a, b) {
      var ca = Number(a.created_at) || 0;
      var cb = Number(b.created_at) || 0;
      return mode === 'oldest' ? ca - cb : cb - ca;
    });
    if (mode === 'newest' || mode === 'oldest') return sorted.slice(0, n);
    var arr = source.slice();
    var s = (Number(seed) || Date.now()) >>> 0 || 1;
    function rand() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0xffffffff;
    }
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr.slice(0, n);
  }

  async function addSelectedAssetsToProject() {
    var mode = ($('#cvt-assets-fill-mode') && $('#cvt-assets-fill-mode').value) || 'selection';
    var tCount = Number(($('#cvt-assets-t-count') && $('#cvt-assets-t-count').value) || 3);
    var pool = (state.assets.clips || []).concat(state.assets.results || []);
    var selected = state.selectedAssetIds.slice();
    var videoPool = pool.filter(function (a) {
      return selected.indexOf(a.id) >= 0 || !selected.length;
    });
    // Prefer selected video items
    var selectedVideos = pool.filter(function (a) { return selected.indexOf(a.id) >= 0; });
    var transitions = pickAssetsForFill(
      selectedVideos.length ? selectedVideos : pool,
      selectedVideos.map(function (a) { return a.id; }),
      mode,
      tCount,
      Date.now()
    );
    var startPick = pickAssetsForFill(
      selectedVideos.length ? selectedVideos : pool,
      selected,
      mode,
      1,
      Date.now() + 1
    )[0];
    var endPick = pickAssetsForFill(
      selectedVideos.length ? selectedVideos : pool,
      selected,
      mode,
      1,
      Date.now() + 2
    )[0];

    async function place(clip, item, label) {
      if (!item) return;
      if (clip.file || clip.assetId) {
        if (!window.confirm(i18n('replace_slot', 'Replace existing ') + label + '?')) return;
      }
      await hydrateAssetOntoClip(clip, item.id);
    }

    if (startPick) await place(state.project.start, startPick, 'Start');
    state.project.transitions = [];
    for (var i = 0; i < transitions.length; i++) {
      var slot = createTransitionSlot();
      state.project.transitions.push(slot);
      await hydrateAssetOntoClip(slot, transitions[i].id);
    }
    if (!state.project.transitions.length) state.project.transitions.push(createTransitionSlot());
    if (endPick && endPick.id !== (startPick && startPick.id)) {
      state.project.end.enabled = true;
      await place(state.project.end, endPick, 'End');
    }

    var voPool = state.assets.voiceovers || [];
    var voPick = pickAssetsForFill(voPool, selected, mode, 1, Date.now() + 3)[0];
    if (voPick) {
      state.project.voiceover.enabled = true;
      await hydrateAssetOntoClip(state.project.voiceover, voPick.id, true);
    }
    var audioPool = state.assets.audio || [];
    var audioPick = pickAssetsForFill(audioPool, selected, mode, 1, Date.now() + 4)[0];
    if (audioPick) {
      state.project.global.audioMode = 'custom';
      state.project.global.audioAssetId = audioPick.id;
      await hydrateAssetOntoClip({ file: null, objectUrl: null, assetId: null }, audioPick.id, true).catch(function () {});
      try {
        var aRes = await fetch(audioPick.url, { credentials: 'include' });
        var aBlob = await aRes.blob();
        state.project.global.audioFile = new File([aBlob], audioPick.title || 'audio', { type: aBlob.type });
      } catch (e) {}
    }

    state.selectedAssetIds = [];
    showEl($('#cvt-assets-float'), false);
    renderClipNav();
    writeProjectToForm();
    showPage('clips');
    setStatusPill(i18n('assets_added', 'Added to project'));
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
          duplicate: !!(saved && saved.already_exists)
        });
      } catch (err) {
        out.push({ label: item.label, url: URL.createObjectURL(blob), saved: false });
      }
    }
    return out;
  }

  async function onLabMessage(ev) {
    var data = ev && ev.data;
    if (!data || data.source !== 'eazpire-video-transition-lab') return;
    if (data.type === 'lab-ready' || data.type === 'ffmpeg-ready') {
      state.labReady = true;
      setStatusPill(i18n('ready', 'Ready'));
      return;
    }
    if (data.type === 'status') {
      setStatusPill(data.message || i18n('ready', 'Ready'));
      return;
    }
    if (data.type === 'results') {
      state.rendering = false;
      setFloatLoading(false);
      var items = Array.isArray(data.results) ? data.results : [];
      setStatusPill(i18n('saving', 'Saving to Assets…'));
      var savedItems = await autoSaveResults(items);
      state.results = savedItems.concat(state.results).slice(0, 24);
      renderFloatCarousel();
      renderResultsGrid();
      setStatusPill(i18n('saved_results', 'Saved to Transition Videos'));
      var renderBtn = $('#cvt-btn-render');
      if (renderBtn) renderBtn.disabled = false;
    }
    if (data.type === 'render-error') {
      state.rendering = false;
      setFloatLoading(false);
      setStatusPill(data.message || i18n('render_failed', 'Render failed'));
      var btn = $('#cvt-btn-render');
      if (btn) btn.disabled = false;
    }
  }

  function applyFloatPosition(left, top) {
    var floatRoot = $('#cvt-float');
    if (!floatRoot) return;
    var w = floatRoot.offsetWidth || 56;
    var h = floatRoot.offsetHeight || 56;
    var maxL = Math.max(8, window.innerWidth - w - 8);
    var maxT = Math.max(8, window.innerHeight - h - 8);
    floatRoot.style.left = Math.min(maxL, Math.max(8, left)) + 'px';
    floatRoot.style.top = Math.min(maxT, Math.max(8, top)) + 'px';
    floatRoot.style.right = 'auto';
    floatRoot.style.bottom = 'auto';
  }

  function setFloatMinimized(min) {
    state.floatMinimized = !!min;
    var floatRoot = $('#cvt-float');
    var panel = $('#cvt-float-panel');
    if (!floatRoot) return;
    floatRoot.setAttribute('data-minimized', state.floatMinimized ? '1' : '0');
    showEl(panel, !state.floatMinimized);
  }

  async function startRender() {
    showEl($('#cvt-render-confirm'), false);
    state.rendering = true;
    setFloatLoading(true);
    renderFloatCarousel();
    setStatusPill(i18n('rendering', 'Rendering…'));
    var btn = $('#cvt-btn-render');
    if (btn) btn.disabled = true;
    loadLabFrame();
    var payload = await buildLabPayload();
    if (!payload.files.start) {
      state.rendering = false;
      setFloatLoading(false);
      setStatusPill(i18n('need_start', 'Add a Start video first'));
      if (btn) btn.disabled = false;
      showPage('clips');
      return;
    }
    var hasT = (payload.files.transitions || []).some(Boolean);
    if (!hasT) {
      state.rendering = false;
      setFloatLoading(false);
      setStatusPill(i18n('need_transition', 'Add at least one Transition clip'));
      if (btn) btn.disabled = false;
      showPage('clips');
      return;
    }
    postLab({ type: 'set-project-and-render', payload: payload });
  }

  async function onTranscribe() {
    readFormIntoProject();
    var file = state.project.voiceover.file;
    if (!file) {
      setStatusPill(i18n('need_vo_audio', 'Upload voiceover audio first'));
      return;
    }
    setStatusPill(i18n('transcribing', 'Transcribing…'));
    var fd = new FormData();
    fd.append('file', file, file.name || 'voiceover.mp3');
    var data = await apiJson('video-transition-transcribe', { method: 'POST', body: fd });
    if (!data || !data.ok) {
      setStatusPill(i18n('transcribe_failed', 'Transcription failed'));
      return;
    }
    state.project.voiceover.words = data.words || [];
    state.project.voiceover.cues = data.cues || [];
    if (data.text && !state.project.voiceover.text) {
      state.project.voiceover.text = data.text;
      if ($('#cvt-vo-text')) $('#cvt-vo-text').value = data.text;
    }
    var cuesEl = $('#cvt-vo-cues-json');
    if (cuesEl) {
      cuesEl.value = JSON.stringify({ words: state.project.voiceover.words, cues: state.project.voiceover.cues });
    }
    updateVoPreview();
    setStatusPill(i18n('transcribe_done', 'Subtitles ready — preview below'));
  }

  function bindOnce() {
    if (!root || root.getAttribute('data-cvt-bound') === '1') return;
    root.setAttribute('data-cvt-bound', '1');

    var closeBtn = $('#cvt-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    var rail = $('#cvt-sidebar-toggle');
    if (rail) rail.addEventListener('click', function () { setSidebarCollapsed(!state.sidebarCollapsed); });

    var clipRail = $('#cvt-clip-sidebar-toggle');
    if (clipRail) clipRail.addEventListener('click', function () { setClipSidebarCollapsed(!state.clipSidebarCollapsed); });

    $all('[data-cvt-page]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showPage(btn.getAttribute('data-cvt-page'));
      });
    });

    root.addEventListener('click', function (e) {
      var clipBtn = e.target.closest('[data-cvt-clip]');
      if (clipBtn && root.contains(clipBtn)) {
        state.clipId = clipBtn.getAttribute('data-cvt-clip');
        if (state.clipId === 'end') state.project.end.enabled = true;
        renderClipNav();
        syncClipEditor();
      }
    });

    var addT = $('#cvt-add-transition');
    if (addT) {
      addT.addEventListener('click', function () {
        if (state.project.transitions.length >= 10) return;
        var t = createTransitionSlot();
        state.project.transitions.push(t);
        state.clipId = t.id;
        renderClipNav();
        syncClipEditor();
      });
    }

    root.querySelectorAll('input[name="cvt-clip-mode"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var clip = findClip(state.clipId);
        if (!clip) return;
        clip.settingsMode = radio.value === 'own' ? 'own' : 'global';
        showEl($('#cvt-clip-individual'), clip.settingsMode === 'own');
        applyGlobalSourceLocks();
      });
    });

    ['cvt-clip-len-global', 'cvt-clip-audio-global', 'cvt-clip-volume-global'].forEach(function (id) {
      var el = $('#' + id);
      if (!el) return;
      el.addEventListener('change', function () {
        var clip = findClip(state.clipId);
        if (!clip) return;
        if (!clip.useGlobal) clip.useGlobal = { clipLen: true, audioMode: true, volume: true };
        if (id.indexOf('len') >= 0) clip.useGlobal.clipLen = el.checked;
        if (id.indexOf('audio') >= 0) clip.useGlobal.audioMode = el.checked;
        if (id.indexOf('volume') >= 0) clip.useGlobal.volume = el.checked;
        applyGlobalSourceLocks();
      });
    });

    ['cvt-clip-len', 'cvt-clip-audio-mode', 'cvt-clip-volume'].forEach(function (id) {
      var el = $('#' + id);
      if (!el) return;
      el.addEventListener('change', function () {
        var clip = findClip(state.clipId);
        if (!clip) return;
        if (id === 'cvt-clip-len') clip.clipLen = Number(el.value) || 3;
        if (id === 'cvt-clip-audio-mode') clip.audioMode = el.value;
        if (id === 'cvt-clip-volume') clip.volume = Number(el.value) || 100;
      });
    });

    var clipFile = $('#cvt-clip-file');
    if (clipFile) {
      clipFile.addEventListener('change', async function () {
        var file = clipFile.files && clipFile.files[0];
        var clip = findClip(state.clipId);
        if (!file || !clip) return;
        await assignFileToClip(clip, file, 'clip');
        if (state.clipId === 'end') clip.enabled = true;
        syncClipEditor();
        setStatusPill(i18n('clip_uploaded', 'Clip uploaded to Assets'));
      });
    }

    var ratioMode = $('#cvt-ratio-mode');
    if (ratioMode) {
      ratioMode.addEventListener('change', function () {
        showEl($('#cvt-ratio-preset-wrap'), ratioMode.value === 'preset');
        showEl($('#cvt-ratio-custom-wrap'), ratioMode.value === 'custom');
      });
    }
    var gAudio = $('#cvt-global-audio-mode');
    if (gAudio) {
      gAudio.addEventListener('change', function () {
        showEl($('#cvt-global-audio-file-wrap'), gAudio.value === 'custom');
      });
    }
    var gAudioFile = $('#cvt-global-audio-file');
    if (gAudioFile) {
      gAudioFile.addEventListener('change', async function () {
        var file = gAudioFile.files && gAudioFile.files[0];
        if (!file) return;
        state.project.global.audioFile = file;
        try {
          var saved = await saveTransitionAsset('audio', file, { label: file.name, filename: file.name });
          if (saved && saved.ok) state.project.global.audioAssetId = saved.asset_id;
        } catch (e) {}
      });
    }

    var voFile = $('#cvt-vo-file');
    if (voFile) {
      voFile.addEventListener('change', async function () {
        var file = voFile.files && voFile.files[0];
        if (!file) return;
        await assignFileToClip(state.project.voiceover, file, 'voiceover');
        state.project.voiceover.enabled = true;
        if ($('#cvt-vo-enabled')) $('#cvt-vo-enabled').checked = true;
        updateVoPreview();
      });
    }

    var voTranscribe = $('#cvt-vo-transcribe');
    if (voTranscribe) voTranscribe.addEventListener('click', onTranscribe);

    var voAudio = $('#cvt-vo-preview-audio');
    if (voAudio) {
      voAudio.addEventListener('timeupdate', function () {
        var t = voAudio.currentTime || 0;
        var cues = state.project.voiceover.cues || [];
        var cue = cues.find(function (c) { return t >= c.start && t < c.end; });
        var cueEl = $('#cvt-vo-preview-cue');
        if (cueEl) cueEl.textContent = cue ? cue.text : (state.project.voiceover.text || '');
      });
    }

    var saveTpl = $('#cvt-btn-save-template');
    if (saveTpl) {
      saveTpl.addEventListener('click', function () {
        readFormIntoProject();
        if ($('#cvt-tpl-save-title')) $('#cvt-tpl-save-title').value = state.project.meta.title || '';
        if ($('#cvt-tpl-save-description')) $('#cvt-tpl-save-description').value = state.project.meta.description || '';
        if ($('#cvt-tpl-save-tags')) $('#cvt-tpl-save-tags').value = state.project.meta.tags || '';
        showEl($('#cvt-template-save'), true);
      });
    }
    var tplCancel = $('#cvt-tpl-save-cancel');
    if (tplCancel) tplCancel.addEventListener('click', function () { showEl($('#cvt-template-save'), false); });
    var tplConfirm = $('#cvt-tpl-save-confirm');
    if (tplConfirm) {
      tplConfirm.addEventListener('click', async function () {
        var title = ($('#cvt-tpl-save-title') && $('#cvt-tpl-save-title').value) || 'Template';
        var description = ($('#cvt-tpl-save-description') && $('#cvt-tpl-save-description').value) || '';
        var tags = ($('#cvt-tpl-save-tags') && $('#cvt-tpl-save-tags').value) || '';
        var data = await apiJson('video-transition-templates-save', {
          method: 'POST',
          json: {
            title: title,
            description: description,
            tags: tags,
            snapshot: buildTemplateSnapshot()
          }
        });
        showEl($('#cvt-template-save'), false);
        if (data && data.ok) {
          setStatusPill(i18n('template_saved', 'Template saved'));
          loadTemplates();
        } else {
          setStatusPill(i18n('template_save_failed', 'Could not save template'));
        }
      });
    }
    var applyCancel = $('#cvt-tpl-apply-cancel');
    if (applyCancel) applyCancel.addEventListener('click', function () { showEl($('#cvt-template-apply'), false); });
    var applyConfirm = $('#cvt-tpl-apply-confirm');
    if (applyConfirm) applyConfirm.addEventListener('click', applyTemplateSelections);

    var renderBtn = $('#cvt-btn-render');
    if (renderBtn) {
      renderBtn.addEventListener('click', function () {
        showEl($('#cvt-render-confirm'), true);
      });
    }
    var renderCancel = $('#cvt-render-cancel');
    if (renderCancel) renderCancel.addEventListener('click', function () { showEl($('#cvt-render-confirm'), false); });
    var renderOk = $('#cvt-render-confirm-btn');
    if (renderOk) renderOk.addEventListener('click', startRender);

    var assetsRefresh = $('#cvt-assets-refresh');
    if (assetsRefresh) assetsRefresh.addEventListener('click', loadAssets);
    var assetsUpload = $('#cvt-assets-upload');
    if (assetsUpload) {
      assetsUpload.addEventListener('change', async function () {
        var files = Array.prototype.slice.call(assetsUpload.files || []);
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var kind = f.type.indexOf('audio') === 0 ? 'audio' : 'clip';
          await saveTransitionAsset(kind, f, { label: f.name, filename: f.name });
        }
        assetsUpload.value = '';
        await loadAssets();
        setStatusPill(i18n('assets_uploaded', 'Uploaded to Assets'));
      });
    }
    var assetsAdd = $('#cvt-assets-add');
    if (assetsAdd) assetsAdd.addEventListener('click', addSelectedAssetsToProject);

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
        try { fab.setPointerCapture(e.pointerId); } catch (err) {}
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
      fab.addEventListener('pointercancel', function () { state.drag = null; });
    }
    var minBtn = $('#cvt-float-minimize');
    if (minBtn) minBtn.addEventListener('click', function () { setFloatMinimized(true); });

    window.addEventListener('message', onLabMessage);
  }

  function open() {
    root = document.getElementById('creatorVideoTransitionModal');
    if (!root) return;
    populateShaders();
    bindOnce();
    root.hidden = false;
    root.removeAttribute('hidden');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cvt-modal-open');
    setSidebarCollapsed(false);
    setClipSidebarCollapsed(false);
    writeProjectToForm();
    showPage(state.page || 'project');
    loadLabFrame();
    renderFloatCarousel();
  }

  function close() {
    root = document.getElementById('creatorVideoTransitionModal');
    if (!root) return;
    root.hidden = true;
    root.setAttribute('hidden', '');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cvt-modal-open');
    showEl($('#cvt-assets-float'), false);
    showEl($('#cvt-template-save'), false);
    showEl($('#cvt-template-apply'), false);
    showEl($('#cvt-render-confirm'), false);
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
      var obs = new MutationObserver(function () { ensureOpenTriggers(); });
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
