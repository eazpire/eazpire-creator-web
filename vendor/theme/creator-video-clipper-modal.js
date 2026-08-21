/**
 * Creator Video Clipper (IDEA-077) — transcribe long-form speech, plan clips, export 9:16 Shorts.
 */
(function () {
  'use strict';

  var API_BASE = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
    ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
    : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch');

  var TARGET_RATE = 16000;
  var CHUNK_SEC = 8 * 60;
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
    renderPlan();
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
    setStatus('');
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
        try { await ctx.close(); } catch (e3) {}
        throw new Error((data && data.error) || 'transcribe_failed');
      }
      if (data.text) texts.push(data.text);
      if (Array.isArray(data.words)) words = words.concat(data.words);
      if (Array.isArray(data.cues)) cues = cues.concat(data.cues);
    }
    try { await ctx.close(); } catch (e4) {}
    return { text: texts.join(' ').trim(), words: words, cues: cues };
  }

  function renderPlan() {
    var empty = $('#cvcl-plan-empty');
    var list = $('#cvcl-plan-list');
    var exportBtn = $('#cvcl-btn-export');
    if (!list) return;
    if (!state.clips.length) {
      if (empty) empty.hidden = false;
      list.hidden = true;
      list.innerHTML = '';
      if (exportBtn) exportBtn.disabled = true;
      return;
    }
    if (empty) empty.hidden = true;
    list.hidden = false;
    list.innerHTML = state.clips.map(function (clip, idx) {
      var id = clip.id || ('clip_' + (idx + 1));
      var checked = state.selected[id] !== false ? ' checked' : '';
      return (
        '<article class="cvcl-clip" data-clip-id="' + id + '">' +
          '<div class="cvcl-clip__top">' +
            '<input type="checkbox" data-cvcl-select' + checked + '>' +
            '<input type="text" class="cvcl-clip__title" data-cvcl-title value="' + String(clip.title || '').replace(/"/g, '&quot;') + '">' +
            '<button type="button" class="cvcl-btn" data-cvcl-preview>' + i18n('preview', 'Preview') + '</button>' +
          '</div>' +
          '<div class="cvcl-clip__times">' +
            '<label>' + i18n('start', 'Start') + ' <input type="number" min="0" step="0.1" data-cvcl-start value="' + clip.start + '"></label>' +
            '<label>' + i18n('end', 'End') + ' <input type="number" min="0" step="0.1" data-cvcl-end value="' + clip.end + '"></label>' +
          '</div>' +
          (clip.reason ? '<p class="cvcl-clip__reason">' + String(clip.reason).replace(/</g, '&lt;') + '</p>' : '') +
        '</article>'
      );
    }).join('');
    if (exportBtn) exportBtn.disabled = state.analyzing || state.exporting;
  }

  function readPlanFromDom() {
    var list = $('#cvcl-plan-list');
    if (!list) return;
    var cards = list.querySelectorAll('.cvcl-clip');
    cards.forEach(function (card, idx) {
      var clip = state.clips[idx];
      if (!clip) return;
      var title = card.querySelector('[data-cvcl-title]');
      var start = card.querySelector('[data-cvcl-start]');
      var end = card.querySelector('[data-cvcl-end]');
      var sel = card.querySelector('[data-cvcl-select]');
      if (title) clip.title = title.value;
      if (start) clip.start = Number(start.value) || clip.start;
      if (end) clip.end = Number(end.value) || clip.end;
      state.selected[clip.id] = !!(sel && sel.checked);
    });
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
    var types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < types.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return 'video/webm';
  }

  async function renderShort(video, start, end) {
    var canvas = document.createElement('canvas');
    canvas.width = SHORT_W;
    canvas.height = SHORT_H;
    var ctx = canvas.getContext('2d');
    var stream = canvas.captureStream(30);
    var capture = null;
    try {
      capture = video.captureStream ? video.captureStream() : (video.mozCaptureStream && video.mozCaptureStream());
    } catch (e) {}
    if (capture) {
      capture.getAudioTracks().forEach(function (track) { stream.addTrack(track); });
    }
    var mime = pickRecorderMime();
    var recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4500000 });
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
    recorder.start(250);
    await video.play();
    await new Promise(function (resolve) {
      var tick = function () {
        drawCover(ctx, video, SHORT_W, SHORT_H);
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
    return new Blob(chunks, { type: mime });
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
      renderPlan();
      setStatus(i18n('plan_ready', 'Plan ready — edit times if you want, then export.'));
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
    readPlanFromDom();
    var video = $('#cvcl-video');
    if (!video || !video.src) return;
    var chosen = state.clips.filter(function (c) { return state.selected[c.id] !== false; });
    if (!chosen.length) {
      setStatus(i18n('need_selection', 'Select at least one clip.'));
      return;
    }
    state.exporting = true;
    $('#cvcl-btn-export') && ($('#cvcl-btn-export').disabled = true);
    try {
      for (var i = 0; i < chosen.length; i++) {
        var clip = chosen[i];
        setStatus(i18n('exporting', 'Exporting Short…') + ' ' + (i + 1) + '/' + chosen.length);
        var blob = await renderShort(video, clip.start, clip.end);
        var fd = new FormData();
        fd.append('file', blob, (clip.title || 'short') + '.webm');
        fd.append('title', clip.title || 'Video Clipper short');
        fd.append('aspect_preset', 'shorts_9_16');
        fd.append('width', String(SHORT_W));
        fd.append('height', String(SHORT_H));
        fd.append('duration_s', String(Math.max(0.1, clip.end - clip.start)));
        var saved = await apiJson('video-studio-export', { method: 'POST', body: fd });
        if (!saved || !saved.ok) throw new Error((saved && saved.error) || 'export_failed');
        var local = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = local;
        a.download = (clip.title || 'short').replace(/[^\w\-]+/g, '_') + '.webm';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(local); }, 2000);
      }
      setStatus(i18n('export_done', 'Shorts saved to your videos and downloaded.'));
    } catch (err) {
      setStatus(i18n('export_failed', 'Export failed.') + ' ' + String(err && err.message || err));
    }
    state.exporting = false;
    $('#cvcl-btn-export') && ($('#cvcl-btn-export').disabled = !state.clips.length);
  }

  function previewClip(idx) {
    var clip = state.clips[idx];
    var video = $('#cvcl-video');
    if (!clip || !video) return;
    readPlanFromDom();
    clip = state.clips[idx];
    video.currentTime = Math.max(0, clip.start || 0);
    video.play();
    var stopAt = clip.end;
    var watch = function () {
      if (video.currentTime >= stopAt) {
        video.pause();
        video.removeEventListener('timeupdate', watch);
      }
    };
    video.addEventListener('timeupdate', watch);
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
    var video = $('#cvcl-video');
    if (video) video.pause();
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
        if (!state.file) file.click();
      });
      upload.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!state.file) file.click();
        }
      });
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (f) setSourceFile(f);
        file.value = '';
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
    var analyzeBtn = $('#cvcl-btn-analyze');
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyze);
    var exportBtn = $('#cvcl-btn-export');
    if (exportBtn) exportBtn.addEventListener('click', exportSelected);
    var list = $('#cvcl-plan-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-cvcl-preview]');
        if (!btn) return;
        var card = btn.closest('.cvcl-clip');
        var cards = list.querySelectorAll('.cvcl-clip');
        var idx = Array.prototype.indexOf.call(cards, card);
        if (idx >= 0) previewClip(idx);
      });
    }
    syncSettingInputs();
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
