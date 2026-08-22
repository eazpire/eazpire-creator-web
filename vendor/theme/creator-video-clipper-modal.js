/**
 * Creator Video Clipper (IDEA-077) — transcribe long-form speech, plan clips, export 9:16 Shorts.
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var TARGET_RATE = 16000;
  var CHUNK_SEC = 25;
  var SHORT_W = 1080;
  var SHORT_H = 1920;
  var MAX_BYTES = 500 * 1024 * 1024;

  var root = null;
  var state = {
    file: null,
    objectUrl: null,
    durationS: 0,
    analyzing: false,
    exporting: false,
    cues: [],
    words: [],
    text: '',
    clips: [],
    selected: {},
    exports: [],
    sidebarCollapsed: false,
    subtitle: {
      enabled: false,
      wordsPer: 6,
      lines: 2,
      font: 'Arial',
      color: '#ffffff',
      bgMode: 'transparent',
      bgColor: '#000000',
      animation: 'fade',
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
    },
    captionBlocks: [],
  };

  function isBadTranslationString(s) {
    if (typeof s !== 'string') return true;
    var t = s.toLowerCase();
    return !t || t.indexOf('translation missing') !== -1;
  }

  function i18n(key, fallback) {
    try {
      var pack = window.CreatorI18n && window.CreatorI18n.video_clipper;
      if (pack && pack[key] != null && !isBadTranslationString(String(pack[key]))) return String(pack[key]);
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

  function $(sel) {
    return root ? root.querySelector(sel) : null;
  }

  function setStatus(msg) {
    var el = $('#cvcl-status');
    if (el) el.textContent = msg || '';
  }

  function clampCaptionSettings(input) {
    var rawWords = Number(input && input.wordsPer);
    var rawLines = Number(input && input.lines);
    return {
      wordsPer: Math.max(1, Math.min(16, Math.round(Number.isFinite(rawWords) ? rawWords : 6))),
      lines: Math.max(1, Math.min(4, Math.round(Number.isFinite(rawLines) ? rawLines : 2))),
    };
  }

  function buildCaptionBlocks(words, opts) {
    opts = opts || {};
    var packed = clampCaptionSettings(opts);
    var wordsPer = packed.wordsPer;
    var lines = packed.lines;
    var rangeStart = Number(opts.start);
    var rangeEnd = Number(opts.end);
    var hasStart = Number.isFinite(rangeStart);
    var hasEnd = Number.isFinite(rangeEnd);
    var inRange = [];
    (Array.isArray(words) ? words : []).forEach(function (raw) {
      if (!raw) return;
      var text = String(raw.text || raw.word || '').trim();
      if (!text) return;
      var start = Number(raw.start);
      if (!Number.isFinite(start)) return;
      var end = Number.isFinite(Number(raw.end)) ? Number(raw.end) : start + 0.28;
      if (hasStart && end <= rangeStart) return;
      if (hasEnd && start >= rangeEnd) return;
      inRange.push({ text: text, start: start, end: end });
    });
    var blocks = [];
    for (var i = 0; i < inRange.length; i += wordsPer) {
      var chunk = inRange.slice(i, i + wordsPer);
      if (!chunk.length) continue;
      var perLine = Math.max(1, Math.ceil(chunk.length / lines));
      var lineTexts = [];
      for (var line = 0; line < lines; line++) {
        var part = chunk.slice(line * perLine, (line + 1) * perLine).map(function (w) { return w.text; });
        if (part.length) lineTexts.push(part.join(' '));
      }
      blocks.push({
        start: chunk[0].start,
        end: chunk[chunk.length - 1].end,
        lines: lineTexts,
      });
    }
    return blocks;
  }

  function captionAtTime(blocks, timeS) {
    var t = Number(timeS);
    if (!Number.isFinite(t) || !Array.isArray(blocks)) return null;
    for (var i = 0; i < blocks.length; i++) {
      if (t >= blocks[i].start && t < blocks[i].end) return blocks[i];
    }
    return null;
  }

  function captionAnimProgress(block, timeS, animation) {
    if (!block) return 1;
    if (animation === 'none') return 1;
    var span = Math.max(0.12, Math.min(0.32, (block.end - block.start) * 0.28));
    return Math.max(0, Math.min(1, (Number(timeS) - block.start) / span));
  }

  function visibleCaptionText(block, timeS, animation) {
    if (!block) return '';
    var full = (block.lines || []).join('\n');
    if (animation !== 'typewriter') return full;
    var p = captionAnimProgress(block, timeS, animation);
    return full.slice(0, Math.max(0, Math.round(full.length * p)));
  }

  function readSubtitleFromDom() {
    var sub = state.subtitle;
    var on = $('#cvcl-sub-on');
    sub.enabled = !!(on && on.checked);
    var wordsEl = $('#cvcl-sub-words');
    var linesEl = $('#cvcl-sub-lines');
    var packed = clampCaptionSettings({
      wordsPer: wordsEl && wordsEl.value,
      lines: linesEl && linesEl.value,
    });
    sub.wordsPer = packed.wordsPer;
    sub.lines = packed.lines;
    var font = $('#cvcl-sub-font');
    var color = $('#cvcl-sub-color');
    var bgMode = $('#cvcl-sub-bg-mode');
    var bg = $('#cvcl-sub-bg');
    var anim = $('#cvcl-sub-anim');
    if (font) sub.font = font.value || 'Arial';
    if (color) sub.color = color.value || '#ffffff';
    if (bgMode) sub.bgMode = bgMode.value === 'color' ? 'color' : 'transparent';
    if (bg) sub.bgColor = bg.value || '#000000';
    if (anim) sub.animation = anim.value || 'fade';
    var wrap = $('#cvcl-sub-bg-wrap');
    if (wrap) wrap.hidden = sub.bgMode !== 'color';
    var panel = $('#cvcl-sub-panel');
    if (panel) panel.hidden = !sub.enabled;
  }

  function applySubtitleBoxTransform() {
    var box = $('#cvcl-sub-box');
    if (!box) return;
    var sub = state.subtitle;
    box.style.left = (sub.x * 100) + '%';
    box.style.top = (sub.y * 100) + '%';
    box.style.transform = 'translate(-50%, -50%) rotate(' + sub.rotation + 'deg) scale(' + sub.scale + ')';
    var text = $('#cvcl-sub-text');
    if (text) {
      text.style.fontFamily = sub.font;
      text.style.color = sub.color;
      text.style.background = sub.bgMode === 'color' ? sub.bgColor : 'transparent';
      text.style.padding = sub.bgMode === 'color' ? '4px 8px' : '0';
      text.style.borderRadius = sub.bgMode === 'color' ? '6px' : '0';
    }
  }

  function rebuildCaptionBlocks() {
    readSubtitleFromDom();
    var range = state.clips[0] || { start: 0, end: state.durationS || 0 };
    state.captionBlocks = buildCaptionBlocks(state.words, {
      wordsPer: state.subtitle.wordsPer,
      lines: state.subtitle.lines,
      start: range.start,
      end: range.end || state.durationS,
    });
    applySubtitleBoxTransform();
    updateSubtitlePreviewText();
  }

  function updateSubtitlePreviewText() {
    var text = $('#cvcl-sub-text');
    var video = $('#cvcl-sub-video');
    if (!text) return;
    if (!state.subtitle.enabled) {
      text.textContent = '';
      return;
    }
    var t = video && Number.isFinite(video.currentTime) ? video.currentTime : (state.clips[0] && state.clips[0].start) || 0;
    var block = captionAtTime(state.captionBlocks, t);
    if (!block && state.captionBlocks[0]) block = state.captionBlocks[0];
    text.textContent = visibleCaptionText(block, t, state.subtitle.animation) || i18n('add_subtitle', 'Add subtitle');
    if (block && state.subtitle.animation === 'fade') {
      text.style.opacity = String(captionAnimProgress(block, t, 'fade'));
    } else if (block && state.subtitle.animation === 'slide_up') {
      var p = captionAnimProgress(block, t, 'slide_up');
      text.style.opacity = String(p);
      text.style.transform = 'translateY(' + ((1 - p) * 10) + 'px)';
    } else if (block && state.subtitle.animation === 'pop') {
      var pop = captionAnimProgress(block, t, 'pop');
      text.style.opacity = String(pop);
      text.style.transform = 'scale(' + (0.86 + 0.14 * pop) + ')';
    } else {
      text.style.opacity = '1';
      text.style.transform = '';
    }
  }

  function syncSubtitlePreviewVideo() {
    var preview = $('#cvcl-sub-video');
    if (!preview) return;
    if (state.objectUrl) {
      if (preview.src !== state.objectUrl) preview.src = state.objectUrl;
      preview.muted = true;
      var start = state.clips[0] ? state.clips[0].start : 0;
      preview.currentTime = start;
      preview.play().catch(function () {});
    } else {
      preview.removeAttribute('src');
    }
  }

  function drawCaption(ctx, w, h, timeS, clipStart, clipEnd) {
    var sub = state.subtitle;
    if (!sub.enabled) return;
    var blocks = buildCaptionBlocks(state.words, {
      wordsPer: sub.wordsPer,
      lines: sub.lines,
      start: clipStart,
      end: clipEnd,
    });
    var block = captionAtTime(blocks, timeS);
    if (!block) return;
    var progress = captionAnimProgress(block, timeS, sub.animation);
    var opacity = 1;
    var dy = 0;
    var extraScale = 1;
    if (sub.animation === 'fade') opacity = progress;
    if (sub.animation === 'slide_up') {
      opacity = progress;
      dy = (1 - progress) * h * 0.035;
    }
    if (sub.animation === 'pop') {
      opacity = progress;
      extraScale = 0.86 + 0.14 * progress;
    }
    var shown = visibleCaptionText(block, timeS, sub.animation);
    var lines = shown.split('\n').filter(Boolean);
    if (!lines.length) return;
    var fontSize = Math.max(14, w * 0.048);
    ctx.save();
    ctx.translate(w * sub.x, h * sub.y + dy);
    ctx.rotate((sub.rotation || 0) * Math.PI / 180);
    ctx.scale((sub.scale || 1) * extraScale, (sub.scale || 1) * extraScale);
    ctx.globalAlpha = opacity;
    ctx.font = '700 ' + fontSize + 'px ' + (sub.font || 'Arial');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var lineH = fontSize * 1.25;
    var blockH = lines.length * lineH;
    var maxW = 0;
    lines.forEach(function (line) {
      maxW = Math.max(maxW, ctx.measureText(line).width);
    });
    var padX = fontSize * 0.42;
    var padY = fontSize * 0.26;
    if (sub.bgMode === 'color') {
      ctx.fillStyle = sub.bgColor || '#000';
      var x0 = -maxW / 2 - padX;
      var y0 = -blockH / 2 - padY;
      var rw = maxW + padX * 2;
      var rh = blockH + padY * 2;
      var r = Math.min(10, fontSize * 0.35);
      ctx.beginPath();
      ctx.moveTo(x0 + r, y0);
      ctx.lineTo(x0 + rw - r, y0);
      ctx.quadraticCurveTo(x0 + rw, y0, x0 + rw, y0 + r);
      ctx.lineTo(x0 + rw, y0 + rh - r);
      ctx.quadraticCurveTo(x0 + rw, y0 + rh, x0 + rw - r, y0 + rh);
      ctx.lineTo(x0 + r, y0 + rh);
      ctx.quadraticCurveTo(x0, y0 + rh, x0, y0 + rh - r);
      ctx.lineTo(x0, y0 + r);
      ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = sub.color || '#fff';
    lines.forEach(function (line, idx) {
      ctx.fillText(line, 0, -blockH / 2 + lineH / 2 + idx * lineH);
    });
    ctx.restore();
  }

  function bindSubtitleHandles() {
    var box = $('#cvcl-sub-box');
    var viewer = $('#cvcl-sub-viewer');
    if (!box || !viewer || box.getAttribute('data-cvcl-handles') === '1') return;
    box.setAttribute('data-cvcl-handles', '1');
    var drag = null;
    function pointInViewer(ev) {
      var rect = viewer.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) / Math.max(1, rect.width),
        y: (ev.clientY - rect.top) / Math.max(1, rect.height),
      };
    }
    function onMove(ev) {
      if (!drag) return;
      ev.preventDefault();
      var p = pointInViewer(ev);
      if (drag.mode === 'move') {
        state.subtitle.x = Math.max(0.08, Math.min(0.92, p.x));
        state.subtitle.y = Math.max(0.08, Math.min(0.92, p.y));
      } else if (drag.mode === 'scale') {
        var dx = p.x - state.subtitle.x;
        var dy = p.y - state.subtitle.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        state.subtitle.scale = Math.max(0.45, Math.min(2.4, dist / 0.18));
      } else if (drag.mode === 'rotate') {
        state.subtitle.rotation = Math.round(Math.atan2(p.y - state.subtitle.y, p.x - state.subtitle.x) * 180 / Math.PI + 90);
      }
      applySubtitleBoxTransform();
    }
    function onUp() {
      drag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    box.addEventListener('pointerdown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('[data-cvcl-sub-scale]')) {
        drag = { mode: 'scale' };
      } else if (ev.target && ev.target.closest && ev.target.closest('[data-cvcl-sub-rotate]')) {
        drag = { mode: 'rotate' };
      } else {
        drag = { mode: 'move' };
      }
      ev.preventDefault();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  function fmtClock(sec) {
    var s = Math.max(0, Number(sec) || 0);
    var m = Math.floor(s / 60);
    var r = Math.floor(s % 60);
    return m + ':' + String(r).padStart(2, '0');
  }

  async function apiJson(op, opts) {
    opts = opts || {};
    var ownerId = getOwnerId();
    var url = API_BASE + '?op=' + encodeURIComponent(op);
    if (ownerId) {
      url += '&owner_id=' + encodeURIComponent(ownerId);
      url += '&logged_in_customer_id=' + encodeURIComponent(ownerId);
    }
    if (opts.query) {
      Object.keys(opts.query).forEach(function (key) {
        if (opts.query[key] != null && String(opts.query[key]) !== '') {
          url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(String(opts.query[key]));
        }
      });
    }
    var init = { method: opts.method || 'GET', credentials: 'include' };
    if (opts.body instanceof FormData) {
      init.body = opts.body;
      if (ownerId && !opts.body.has('owner_id')) opts.body.append('owner_id', ownerId);
    } else if (opts.json) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opts.json);
    }
    var res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      return {
        ok: false,
        error: 'network_error',
        message: i18n('link_error_network', 'Network error. Please try again.'),
      };
    }
    try {
      return await res.json();
    } catch (e) {
      return { ok: false, error: 'bad_json' };
    }
  }

  function syncSettingInputs() {
    var autoCount = $('#cvcl-auto-count');
    var autoDur = $('#cvcl-auto-duration');
    var count = $('#cvcl-count');
    var min = $('#cvcl-min');
    var max = $('#cvcl-max');
    if (count) count.disabled = !!(autoCount && autoCount.checked);
    if (min) min.disabled = !!(autoDur && autoDur.checked);
    if (max) max.disabled = !!(autoDur && autoDur.checked);
  }

  function readSettings() {
    var autoCount = $('#cvcl-auto-count');
    var autoDur = $('#cvcl-auto-duration');
    return {
      clip_count: autoCount && autoCount.checked ? 'auto' : Number(($('#cvcl-count') && $('#cvcl-count').value) || 5),
      min_s: autoDur && autoDur.checked ? 'auto' : Number(($('#cvcl-min') && $('#cvcl-min').value) || 15),
      max_s: autoDur && autoDur.checked ? 'auto' : Number(($('#cvcl-max') && $('#cvcl-max').value) || 45),
      duration_s: state.durationS,
    };
  }

  function setSourceFile(file) {
    if (state.objectUrl) {
      try { URL.revokeObjectURL(state.objectUrl); } catch (e) {}
      state.objectUrl = null;
    }
    state.file = file || null;
    state.durationS = 0;
    state.cues = [];
    state.words = [];
    state.text = '';
    state.clips = [];
    state.selected = {};
    clearExports();
    renderResults();
    var video = $('#cvcl-video');
    var empty = $('#cvcl-upload-empty');
    var preview = $('#cvcl-upload-preview');
    var meta = $('#cvcl-meta');
    var analyze = $('#cvcl-btn-analyze');
    if (!file) {
      if (video) video.removeAttribute('src');
      if (empty) empty.hidden = false;
      if (preview) preview.hidden = true;
      if (meta) meta.hidden = true;
      if (analyze) analyze.disabled = true;
      $('#cvcl-btn-export') && ($('#cvcl-btn-export').disabled = true);
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus(i18n('file_too_large', 'This file is larger than 500 MB.'));
      setSourceFile(null);
      return;
    }
    state.objectUrl = URL.createObjectURL(file);
    if (video) {
      video.src = state.objectUrl;
      video.onloadedmetadata = function () {
        state.durationS = Number(video.duration) || 0;
        if (meta) {
          meta.hidden = false;
          meta.textContent = (file.name || 'Video') + ' · ' + fmtClock(state.durationS);
        }
      };
    }
    if (empty) empty.hidden = true;
    if (preview) preview.hidden = false;
    if (analyze) analyze.disabled = false;
    syncSubtitlePreviewVideo();
    setStatus('');
  }

  function isYouTubeUrl(raw) {
    try {
      var parsed = new URL(String(raw || '').trim());
      var host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
      return host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com';
    } catch (e) {
      return false;
    }
  }

  function setOverlay(id, open) {
    var el = document.getElementById(id);
    if (!el) return;
    el.hidden = !open;
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function setLinkStatus(msg, kind) {
    var el = document.getElementById('cvcl-link-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'cvcl-link-status' + (kind ? ' is-' + kind : '');
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function linkErrorMessage(data) {
    var code = data && (data.code || data.error_code || data.error);
    var map = {
      youtube_bot: i18n('link_error_youtube_bot', 'YouTube blocked the download from our servers. Save the video on your device and use Device instead.'),
      youtube_needs_merge: i18n('link_error_youtube_merge', 'This YouTube video cannot be downloaded as a single file.'),
      youtube_failed: i18n('link_error_youtube_failed', 'Could not load that YouTube video.'),
      youtube_http_error: i18n('link_error_youtube_failed', 'Could not load that YouTube video.'),
      timeout: i18n('link_error_timeout', 'Import timed out. Try again in a moment.'),
      rate_limit: i18n('link_error_rate', 'Too many imports. Please wait a moment.'),
      invalid_url: i18n('link_error_youtube_only', 'Please paste a YouTube URL.'),
      network_error: i18n('link_error_network', 'Network error. Please try again.'),
      fetch_failed: i18n('link_error_network', 'Network error. Please try again.'),
    };
    var rawMsg = data && data.message ? String(data.message) : '';
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(rawMsg)) {
      return map.network_error;
    }
    if (rawMsg.length > 8 && rawMsg.indexOf('Could not load that YouTube') === -1) {
      return rawMsg;
    }
    if (code && map[code]) return map[code];
    return (data && data.message) || i18n('link_error_generic', 'Could not load video from that link.');
  }

  async function pollLinkIngest(assetId) {
    var maxAttempts = 120;
    for (var i = 0; i < maxAttempts; i++) {
      if (i > 0 && i % 3 === 0) {
        setLinkStatus(i18n('link_processing', 'Downloading from YouTube…'), 'info');
      }
      var data = await apiJson('video-studio-link-ingest-status', { query: { asset_id: assetId } });
      if (data && data.status === 'ready' && data.asset) return { ok: true, asset: data.asset };
      if (data && data.status === 'failed') return { ok: false, data: data };
      if (data && !data.ok && data.error && data.error !== 'asset_not_found') return { ok: false, data: data };
      await sleep(2000);
    }
    return { ok: false, data: { error: 'timeout' } };
  }

  async function setSourceFromRemoteUrl(url, name) {
    // /file/ URLs send Access-Control-Allow-Origin: *. Browsers reject
    // credentials:'include' with a wildcard — that surfaces as "Failed to fetch".
    var res = await fetch(url, { credentials: 'omit', mode: 'cors' });
    if (!res.ok) throw new Error('fetch_failed');
    var blob = await res.blob();
    if (!blob || !blob.size) throw new Error('empty_file');
    var file = new File([blob], name || 'youtube.mp4', { type: blob.type || 'video/mp4' });
    setSourceFile(file);
  }

  async function loadYouTubeLink() {
    var input = document.getElementById('cvcl-link-url');
    var loadBtn = document.getElementById('cvcl-link-load');
    var url = input ? String(input.value || '').trim() : '';
    if (!isYouTubeUrl(url)) {
      setLinkStatus(i18n('link_error_youtube_only', 'Please paste a YouTube URL.'), 'error');
      return;
    }
    if (loadBtn) loadBtn.disabled = true;
    setLinkStatus(i18n('link_downloading', 'Starting YouTube download…'), 'info');
    try {
      var data = await apiJson('video-studio-link-ingest', {
        method: 'POST',
        json: { url: url, format: 'mp4' },
      });
      if (!data || (!data.ok && !data.asset_id)) {
        setLinkStatus(linkErrorMessage(data || {}), 'error');
        return;
      }
      var asset = data.asset || null;
      if (data.asset_id && (data.status === 'queued' || data.status === 'processing' || (!asset && data.status !== 'ready'))) {
        setLinkStatus(i18n('link_queued', 'Import queued — preparing YouTube video…'), 'info');
        var polled = await pollLinkIngest(data.asset_id);
        if (!polled.ok || !polled.asset) {
          setLinkStatus(linkErrorMessage(polled.data || {}), 'error');
          return;
        }
        asset = polled.asset;
      }
      var remote = asset && (asset.url || asset.thumb_url);
      if (!remote) {
        setLinkStatus(linkErrorMessage(data || { error: 'youtube_failed' }), 'error');
        return;
      }
      setLinkStatus(i18n('link_loading_player', 'Loading video into Clipper…'), 'info');
      await setSourceFromRemoteUrl(remote, (asset && asset.original_name) || 'youtube.mp4');
      setLinkStatus(i18n('link_ready', 'YouTube video loaded.'), 'success');
      setOverlay('cvcl-link', false);
      setOverlay('cvcl-addsrc', false);
      setStatus(i18n('link_ready', 'YouTube video loaded.'));
    } catch (e) {
      var msg = e && e.message ? String(e.message) : '';
      setLinkStatus(linkErrorMessage({
        error: /fetch_failed|failed to fetch|networkerror/i.test(msg) ? 'network_error' : 'youtube_failed',
        message: msg,
      }), 'error');
    } finally {
      if (loadBtn) loadBtn.disabled = false;
    }
  }

  function encodeWavMono16(float32, sampleRate) {
    var n = float32.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var view = new DataView(buf);
    function writeStr(offset, str) {
      for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + n * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, n * 2, true);
    var o = 44;
    for (var i = 0; i < n; i++) {
      var s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    return buf;
  }

  function copyChunk(audioBuffer, startSec, durSec) {
    var srcRate = audioBuffer.sampleRate;
    var ch0 = audioBuffer.getChannelData(0);
    var ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
    var startSrc = Math.max(0, Math.floor(startSec * srcRate));
    var endSrc = Math.min(ch0.length, Math.floor((startSec + durSec) * srcRate));
    var ratio = srcRate / TARGET_RATE;
    var outLen = Math.max(0, Math.floor((endSrc - startSrc) / ratio));
    var out = new Float32Array(outLen);
    for (var i = 0; i < outLen; i++) {
      var src = startSrc + Math.floor(i * ratio);
      var a = ch0[src] || 0;
      var b = ch1 ? ch1[src] : a;
      out[i] = (a + b) / 2;
    }
    return out;
  }

  async function transcribeSource(file, onProgress) {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var raw = await file.arrayBuffer();
    var audioBuffer;
    try {
      audioBuffer = await ctx.decodeAudioData(raw);
    } catch (err) {
      try { await ctx.close(); } catch (e2) {}
      throw new Error('decode_failed');
    }
    var duration = audioBuffer.duration || 0;
    state.durationS = state.durationS || duration;
    var words = [];
    var cues = [];
    var texts = [];
    var chunks = Math.max(1, Math.ceil(duration / CHUNK_SEC));
    for (var i = 0; i < chunks; i++) {
      var offset = i * CHUNK_SEC;
      if (onProgress) onProgress(i + 1, chunks);
      var samples = copyChunk(audioBuffer, offset, CHUNK_SEC);
      if (!samples.length) continue;
      var wav = encodeWavMono16(samples, TARGET_RATE);
      var fd = new FormData();
      fd.append('file', new Blob([wav], { type: 'audio/wav' }), 'chunk-' + i + '.wav');
      fd.append('offset_s', String(offset));
      var data = await apiJson('video-clipper-transcribe', { method: 'POST', body: fd });
      if (!data || !data.ok) {
        data = await apiJson('video-clipper-transcribe', { method: 'POST', body: fd });
      }
      if (!data || !data.ok) {
        try { await ctx.close(); } catch (e3) {}
        var code = data && data.error;
        if (code === 'chunk_too_long') {
          throw new Error(i18n('chunk_too_long', 'That audio piece was too long. Refresh the page and try Analyze again.'));
        }
        throw new Error(i18n('transcribe_failed', 'Speech recognition failed. Try Analyze again.'));
      }
      if (data.text) texts.push(data.text);
      if (Array.isArray(data.words)) words = words.concat(data.words);
      if (Array.isArray(data.cues)) cues = cues.concat(data.cues);
    }
    try { await ctx.close(); } catch (e4) {}
    return { text: texts.join(' ').trim(), words: words, cues: cues };
  }

  function clearExports() {
    (state.exports || []).forEach(function (item) {
      if (item && item.url) {
        try { URL.revokeObjectURL(item.url); } catch (e) {}
      }
    });
    state.exports = [];
  }

  function renderResults() {
    var empty = $('#cvcl-results-empty');
    var list = $('#cvcl-results-list');
    if (!list) return;
    if (!state.exports.length) {
      if (empty) empty.hidden = false;
      list.hidden = true;
      list.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;
    list.hidden = false;
    list.innerHTML = state.exports.map(function (item, idx) {
      var title = String(item.title || ('Short ' + (idx + 1))).replace(/</g, '&lt;');
      return (
        '<article class="cvcl-short">' +
          '<div class="cvcl-short__player">' +
            '<video src="' + item.url + '" playsinline controls preload="metadata"></video>' +
            '<button type="button" class="cvcl-short__fs" data-cvcl-fs aria-label="' +
              i18n('fullscreen', 'Fullscreen') + '">⛶</button>' +
          '</div>' +
          '<p class="cvcl-short__title">' + title + '</p>' +
        '</article>'
      );
    }).join('');
  }

  function setSidebarCollapsed(collapsed) {
    state.sidebarCollapsed = !!collapsed;
    var side = $('#cvcl-sidebar');
    var rail = $('#cvcl-sidebar-toggle');
    if (side) side.classList.toggle('is-collapsed', state.sidebarCollapsed);
    if (rail) {
      rail.setAttribute('aria-expanded', state.sidebarCollapsed ? 'false' : 'true');
      rail.textContent = state.sidebarCollapsed ? '›' : '‹';
    }
  }

  function enterFullscreen(video) {
    if (!video) return;
    var req = video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen;
    if (req) {
      try { req.call(video); } catch (e) {}
    }
  }

  function waitSeek(video) {
    return new Promise(function (resolve) {
      var done = function () {
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done);
    });
  }

  function drawCover(ctx, video, w, h) {
    var vw = video.videoWidth || w;
    var vh = video.videoHeight || h;
    var scale = Math.max(w / vw, h / vh);
    var dw = vw * scale;
    var dh = vh * scale;
    var dx = (w - dw) / 2;
    var dy = (h - dh) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(video, dx, dy, dw, dh);
  }

  function pickRecorderMime() {
    var types = [
      'video/webm;codecs=vp9,opus',
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    for (var i = 0; i < types.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return 'video/webm';
  }

  function shortCanvasSize(video) {
    var vw = video.videoWidth || SHORT_W;
    var vh = video.videoHeight || SHORT_H;
    var cropW;
    var cropH;
    if (vw / vh >= 9 / 16) {
      cropH = vh;
      cropW = Math.round(vh * 9 / 16);
    } else {
      cropW = vw;
      cropH = Math.round(vw * 16 / 9);
    }
    var w = cropW;
    var h = cropH;
    if (w < 720 || h < 1280) {
      var up = Math.min(720 / Math.max(1, w), 1280 / Math.max(1, h));
      w = Math.round(w * up);
      h = Math.round(h * up);
    }
    if (w > SHORT_W || h > SHORT_H) {
      var down = Math.min(SHORT_W / w, SHORT_H / h);
      w = Math.round(w * down);
      h = Math.round(h * down);
    }
    w -= w % 2;
    h -= h % 2;
    return { w: Math.max(2, w), h: Math.max(2, h) };
  }

  async function renderShort(video, start, end) {
    var size = shortCanvasSize(video);
    var canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    var ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }
    var fps = 30;
    var stream = canvas.captureStream(fps);
    var capture = null;
    try {
      capture = video.captureStream ? video.captureStream() : (video.mozCaptureStream && video.mozCaptureStream());
    } catch (e) {}
    if (capture) {
      capture.getAudioTracks().forEach(function (track) { stream.addTrack(track); });
    }
    var mime = pickRecorderMime();
    var bits = size.h >= 1600 ? 14000000 : 10000000;
    var recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bits, audioBitsPerSecond: 192000 });
    } catch (e2) {
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bits });
    }
    var chunks = [];
    recorder.ondataavailable = function (ev) {
      if (ev.data && ev.data.size) chunks.push(ev.data);
    };
    var stopped = new Promise(function (resolve) {
      recorder.onstop = function () { resolve(); };
    });
    video.currentTime = Math.max(0, start);
    await waitSeek(video);
    video.muted = false;
    recorder.start(100);
    await video.play();
    await new Promise(function (resolve) {
      var tick = function () {
        drawCover(ctx, video, size.w, size.h);
        drawCaption(ctx, size.w, size.h, video.currentTime, start, end);
        if (video.currentTime >= end || video.paused || video.ended) {
          video.pause();
          if (recorder.state !== 'inactive') recorder.stop();
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    await stopped;
    return { blob: new Blob(chunks, { type: mime }), width: size.w, height: size.h, mime: mime };
  }

  async function analyze() {
    if (!state.file || state.analyzing) return;
    if (!getOwnerId()) {
      setStatus(i18n('error_owner', 'Missing owner'));
      return;
    }
    state.analyzing = true;
    $('#cvcl-btn-analyze') && ($('#cvcl-btn-analyze').disabled = true);
    $('#cvcl-btn-export') && ($('#cvcl-btn-export').disabled = true);
    setStatus(i18n('extracting_audio', 'Extracting speech… this can take a minute on long videos.'));
    try {
      var transcript = await transcribeSource(state.file, function (cur, total) {
        setStatus(i18n('transcribing', 'Transcribing…') + ' ' + cur + '/' + total);
      });
      state.text = transcript.text;
      state.words = transcript.words;
      state.cues = transcript.cues;
      if (!state.cues.length && !state.text) {
        throw new Error('empty_transcript');
      }
      setStatus(i18n('planning', 'Building clip plan…'));
      var settings = readSettings();
      var plan = await apiJson('video-clipper-plan', {
        method: 'POST',
        json: {
          cues: state.cues,
          words: state.words,
          text: state.text,
          clip_count: settings.clip_count,
          min_s: settings.min_s,
          max_s: settings.max_s,
          duration_s: state.durationS,
        },
      });
      if (!plan || !plan.ok || !Array.isArray(plan.clips) || !plan.clips.length) {
        throw new Error((plan && plan.error) || 'plan_failed');
      }
      state.clips = plan.clips;
      state.selected = {};
      plan.clips.forEach(function (c) { state.selected[c.id] = true; });
      clearExports();
      renderResults();
      rebuildCaptionBlocks();
      syncSubtitlePreviewVideo();
      setStatus(i18n('plan_ready', 'Analysis ready — export to split the video into Shorts.') + ' (' + plan.clips.length + ')');
    } catch (err) {
      var msg = String(err && err.message || err);
      if (msg === 'decode_failed') {
        setStatus(i18n('decode_failed', 'Could not read audio from this video. Try an MP4 with speech.'));
      } else if (msg === 'empty_transcript') {
        setStatus(i18n('empty_transcript', 'No speech found. Video Clipper needs spoken audio.'));
      } else {
        setStatus(i18n('analyze_failed', 'Analyze failed.') + ' ' + msg);
      }
    }
    state.analyzing = false;
    $('#cvcl-btn-analyze') && ($('#cvcl-btn-analyze').disabled = !state.file);
    $('#cvcl-btn-export') && ($('#cvcl-btn-export').disabled = !state.clips.length);
  }

  async function exportSelected() {
    if (state.exporting || !state.clips.length) return;
    var video = $('#cvcl-video');
    if (!video || !video.src) return;
    var chosen = state.clips.slice();
    if (!chosen.length) {
      setStatus(i18n('need_selection', 'Analyze the video first, then export.'));
      return;
    }
    state.exporting = true;
    $('#cvcl-btn-export') && ($('#cvcl-btn-export').disabled = true);
    clearExports();
    renderResults();
    try {
      for (var i = 0; i < chosen.length; i++) {
        var clip = chosen[i];
        setStatus(i18n('exporting', 'Splitting Short…') + ' ' + (i + 1) + '/' + chosen.length);
        var rendered = await renderShort(video, clip.start, clip.end);
        var blob = rendered.blob;
        var ext = (rendered.mime || '').indexOf('mp4') >= 0 ? 'mp4' : 'webm';
        var fd = new FormData();
        fd.append('file', blob, (clip.title || 'short') + '.' + ext);
        fd.append('title', clip.title || 'Video Clipper short');
        fd.append('aspect_preset', 'shorts_9_16');
        fd.append('width', String(rendered.width || SHORT_W));
        fd.append('height', String(rendered.height || SHORT_H));
        fd.append('duration_s', String(Math.max(0.1, clip.end - clip.start)));
        fd.append('tool', 'video_clipper');
        try {
          await apiJson('video-studio-export', { method: 'POST', body: fd });
        } catch (saveErr) {}
        state.exports.push({
          id: clip.id || ('clip_' + (i + 1)),
          title: clip.title || ('Short ' + (i + 1)),
          url: URL.createObjectURL(blob),
        });
        renderResults();
      }
      setSidebarCollapsed(true);
      setStatus(i18n('export_done', 'Shorts are ready on the right. Saved in Assets → Videos → Video Clipper.'));
    } catch (err) {
      setStatus(i18n('export_failed', 'Export failed.') + ' ' + String(err && err.message || err));
    }
    state.exporting = false;
    $('#cvcl-btn-export') && ($('#cvcl-btn-export').disabled = !state.clips.length);
  }

  function open() {
    if (!root) root = document.getElementById('creatorVideoClipperModal');
    if (!root) return;
    bindOnce();
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('cvcl-open');
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('cvcl-open');
    setOverlay('cvcl-addsrc', false);
    setOverlay('cvcl-link', false);
    var video = $('#cvcl-video');
    if (video) video.pause();
    var list = $('#cvcl-results-list');
    if (list) {
      list.querySelectorAll('video').forEach(function (el) { try { el.pause(); } catch (e) {} });
    }
  }

  function bindOnce() {
    if (!root || root.getAttribute('data-cvcl-bound') === '1') return;
    root.setAttribute('data-cvcl-bound', '1');
    var closeBtn = $('#cvcl-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var file = $('#cvcl-file');
    var upload = $('#cvcl-upload');
    if (upload && file) {
      upload.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('#cvcl-remove-video')) return;
        if (!state.file) setOverlay('cvcl-addsrc', true);
      });
      upload.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!state.file) setOverlay('cvcl-addsrc', true);
        }
      });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (f) setSourceFile(f);
        file.value = '';
      });
    }
    var addDevice = document.getElementById('cvcl-addsrc-device');
    if (addDevice && file) {
      addDevice.addEventListener('click', function () {
        setOverlay('cvcl-addsrc', false);
        file.click();
      });
    }
    var addLink = document.getElementById('cvcl-addsrc-link');
    if (addLink) {
      addLink.addEventListener('click', function () {
        setOverlay('cvcl-addsrc', false);
        setLinkStatus('', '');
        var urlInput = document.getElementById('cvcl-link-url');
        if (urlInput) urlInput.value = '';
        setOverlay('cvcl-link', true);
        if (urlInput) urlInput.focus();
      });
    }
    var addCancel = document.getElementById('cvcl-addsrc-cancel');
    if (addCancel) addCancel.addEventListener('click', function () { setOverlay('cvcl-addsrc', false); });
    var linkCancel = document.getElementById('cvcl-link-cancel');
    if (linkCancel) linkCancel.addEventListener('click', function () { setOverlay('cvcl-link', false); });
    var linkLoad = document.getElementById('cvcl-link-load');
    if (linkLoad) linkLoad.addEventListener('click', loadYouTubeLink);
    var linkUrl = document.getElementById('cvcl-link-url');
    if (linkUrl) {
      linkUrl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          loadYouTubeLink();
        }
      });
    }
    var remove = $('#cvcl-remove-video');
    if (remove) remove.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setSourceFile(null);
    });
    ['cvcl-auto-count', 'cvcl-auto-duration'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', syncSettingInputs);
    });
    ['cvcl-sub-on', 'cvcl-sub-words', 'cvcl-sub-lines', 'cvcl-sub-font', 'cvcl-sub-color', 'cvcl-sub-bg-mode', 'cvcl-sub-bg', 'cvcl-sub-anim'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', rebuildCaptionBlocks);
      if (el) el.addEventListener('change', rebuildCaptionBlocks);
    });
    var subVideo = $('#cvcl-sub-video');
    if (subVideo) {
      subVideo.addEventListener('timeupdate', function () {
        if (state.clips[0] && subVideo.currentTime >= (state.clips[0].end || state.durationS)) {
          subVideo.currentTime = state.clips[0].start || 0;
        }
        updateSubtitlePreviewText();
      });
    }
    bindSubtitleHandles();
    applySubtitleBoxTransform();
    var analyzeBtn = $('#cvcl-btn-analyze');
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
    var exportBtn = $('#cvcl-btn-export');
    if (exportBtn) exportBtn.addEventListener('click', exportSelected);
    var rail = $('#cvcl-sidebar-toggle');
    if (rail) {
      rail.addEventListener('click', function () {
        setSidebarCollapsed(!state.sidebarCollapsed);
      });
    }
    var results = $('#cvcl-results-list');
    if (results) {
      results.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-cvcl-fs]');
        if (!btn) return;
        var wrap = btn.closest('.cvcl-short__player');
        var clipVideo = wrap && wrap.querySelector('video');
        enterFullscreen(clipVideo);
      });
    }
    syncSettingInputs();
    setSidebarCollapsed(false);
  }

  function bindOpeners() {
    document.querySelectorAll('[data-creator-video-clipper-open]').forEach(function (btn) {
      if (btn._cvclBound) return;
      btn._cvclBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        open();
      });
    });
  }

  function init() {
    root = document.getElementById('creatorVideoClipperModal');
    bindOpeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CreatorVideoClipperModal = { open: open, close: close };
})();
