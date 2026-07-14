/**
 * Creator Video Studio — asset preview + tools modal (IDEA-028)
 * Cut/reassemble, remove audio, export audio, export vocals (best-effort),
 * screenshot, duplicate. Preview-first, then Save/Export (except Duplicate).
 */
(function () {
  'use strict';

  var modal, shell, titleEl, statusEl, video, audioEl, imgEl, playBtn, timeEl, tabsEl, panelsEl;
  var bound = false;
  var currentAsset = null;
  var currentTool = null;
  var activeCleanup = null; // called when leaving a tool / closing the modal
  var toolsAudioCtx = null;

  function Mod() {
    return window.CreatorVideoStudioModal;
  }

  function t(key, fallback) {
    var mod = Mod();
    if (mod && typeof mod.i18n === 'function') return mod.i18n(key, fallback);
    return fallback;
  }

  function fmtTime(ms) {
    var s = Math.floor(Math.max(0, ms) / 1000);
    var m = Math.floor(s / 60);
    var ss = String(s % 60).padStart(2, '0');
    return m + ':' + ss;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function setToolStatus(tool, msg) {
    var el = document.getElementById('cvs-' + tool + '-status');
    if (el) el.textContent = msg || '';
  }

  function assetUrl(asset) {
    var mod = Mod();
    var localUrls = (mod && mod.getLocalUrls && mod.getLocalUrls()) || {};
    return localUrls[asset.id] || asset.url;
  }

  // ── Shared media element helpers ──────────────────────────────────────
  function activeMediaEl() {
    if (currentAsset && currentAsset.kind === 'audio') return audioEl;
    if (currentAsset && currentAsset.kind === 'video') return video;
    return null;
  }

  function showMediaFor(kind) {
    video.hidden = kind !== 'video';
    audioEl.hidden = kind !== 'audio';
    imgEl.hidden = kind !== 'image';
  }

  function updateTimeUi() {
    var el = activeMediaEl();
    if (!timeEl) return;
    if (!el) {
      timeEl.textContent = '0:00 / 0:00';
      return;
    }
    timeEl.textContent = fmtTime((el.currentTime || 0) * 1000) + ' / ' + fmtTime((el.duration || 0) * 1000);
  }

  function setupMediaForAsset(asset) {
    showMediaFor(asset.kind);
    var url = assetUrl(asset);
    if (asset.kind === 'image') {
      imgEl.src = url || '';
      imgEl.alt = asset.original_name || '';
    } else if (asset.kind === 'audio') {
      audioEl.pause();
      audioEl.src = url || '';
      audioEl.currentTime = 0;
    } else {
      video.pause();
      video.src = url || '';
      video.currentTime = 0;
      video.muted = false;
    }
    updateTimeUi();
    var playing = false;
    if (playBtn) playBtn.textContent = '\u25B6';
    var el = activeMediaEl();
    if (el) {
      el.removeEventListener('timeupdate', updateTimeUi);
      el.addEventListener('timeupdate', updateTimeUi);
      el.removeEventListener('loadedmetadata', updateTimeUi);
      el.addEventListener('loadedmetadata', updateTimeUi);
    }
  }

  function togglePlay() {
    var el = activeMediaEl();
    if (!el) return;
    if (el.paused) {
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
      if (playBtn) playBtn.textContent = '\u275A\u275A';
    } else {
      el.pause();
      if (playBtn) playBtn.textContent = '\u25B6';
    }
  }

  // ── Encoding helpers (real-time capture, consistent with main export) ──
  function getToolsAudioContext() {
    if (!toolsAudioCtx) {
      toolsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } else if (toolsAudioCtx.state === 'suspended') {
      toolsAudioCtx.resume().catch(function () {});
    }
    return toolsAudioCtx;
  }

  function getToolsMediaSource(el, ctx) {
    if (el._cvsSourceNode) return el._cvsSourceNode;
    var node = ctx.createMediaElementSource(el);
    // Route the element's normal output through the Web Audio destination too,
    // otherwise creating this node would permanently silence the element's
    // native audio path for the rest of the session.
    node.connect(ctx.destination);
    el._cvsSourceNode = node;
    return node;
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(resolve);
    });
  }

  function waitSeeked(el) {
    return new Promise(function (resolve) {
      function onSeeked() {
        el.removeEventListener('seeked', onSeeked);
        resolve();
      }
      el.addEventListener('seeked', onSeeked);
    });
  }

  function pickMime(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  /**
   * Plays through `segments` ([{start,end}] ms) on mediaEl in real time while
   * capturing frames (video) and/or audio into a MediaRecorder blob.
   */
  async function encodeSegmentsToBlob(mediaEl, kind, segments, opts) {
    opts = opts || {};
    var withAudio = opts.withAudio !== false;
    var fps = opts.fps || 30;
    var canvas, ctx, stream;

    if (kind === 'video') {
      canvas = document.createElement('canvas');
      canvas.width = opts.width || mediaEl.videoWidth || 1280;
      canvas.height = opts.height || mediaEl.videoHeight || 720;
      ctx = canvas.getContext('2d');
      stream = canvas.captureStream(fps);
    } else {
      stream = new MediaStream();
    }

    if (withAudio) {
      try {
        var audioCtx = getToolsAudioContext();
        var dest = audioCtx.createMediaStreamDestination();
        var srcNode = getToolsMediaSource(mediaEl, audioCtx);
        srcNode.connect(dest);
        dest.stream.getAudioTracks().forEach(function (track) {
          stream.addTrack(track);
        });
      } catch (e) {
        console.warn('[VideoStudio] tools audio capture failed', e);
      }
    }

    var mime =
      kind === 'video'
        ? pickMime(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
        : pickMime(['audio/webm;codecs=opus', 'audio/webm']);
    if (!mime) throw new Error('encode_unsupported');

    var chunks = [];
    var recOpts = { mimeType: mime };
    if (kind === 'video') recOpts.videoBitsPerSecond = 4000000;
    var recorder = new MediaRecorder(stream, recOpts);
    recorder.ondataavailable = function (e) {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    var stopped = new Promise(function (resolve) {
      recorder.onstop = function () {
        resolve(new Blob(chunks, { type: mime }));
      };
    });

    var wasMuted = mediaEl.muted;
    mediaEl.muted = !withAudio;
    recorder.start(200);

    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      mediaEl.currentTime = Math.max(0, seg.start / 1000);
      await waitSeeked(mediaEl);
      var playPromise = mediaEl.play();
      if (playPromise && playPromise.catch) playPromise.catch(function () {});
      while (mediaEl.currentTime * 1000 < seg.end - 8 && !mediaEl.ended) {
        if (kind === 'video' && ctx) {
          try {
            ctx.drawImage(mediaEl, 0, 0, canvas.width, canvas.height);
          } catch (e) {}
        }
        await nextFrame();
      }
    }

    mediaEl.pause();
    mediaEl.muted = wasMuted;
    recorder.stop();
    return stopped;
  }

  // ── Offline audio decode + WAV encode (Export Audio / Export Vocals) ───
  function decodeAssetAudioBuffer(asset) {
    var url = assetUrl(asset);
    return fetch(url)
      .then(function (res) {
        return res.arrayBuffer();
      })
      .then(function (buf) {
        var ctx = getToolsAudioContext();
        return ctx.decodeAudioData(buf.slice(0));
      });
  }

  function audioBufferToWav(buffer) {
    var numChannels = buffer.numberOfChannels;
    var sampleRate = buffer.sampleRate;
    var numFrames = buffer.length;
    var blockAlign = numChannels * 2;
    var dataSize = numFrames * blockAlign;
    var arrBuf = new ArrayBuffer(44 + dataSize);
    var view = new DataView(arrBuf);

    function writeStr(offset, str) {
      for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    var channelData = [];
    for (var c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));

    var offset = 44;
    for (var i = 0; i < numFrames; i++) {
      for (var c2 = 0; c2 < numChannels; c2++) {
        var sample = Math.max(-1, Math.min(1, channelData[c2][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([arrBuf], { type: 'audio/wav' });
  }

  function extractVocalsHeuristic(srcBuffer, ctxForOffline) {
    var numFrames = srcBuffer.length;
    var sampleRate = srcBuffer.sampleRate;
    var monoBuffer = ctxForOffline.createBuffer(1, numFrames, sampleRate);
    var out = monoBuffer.getChannelData(0);
    if (srcBuffer.numberOfChannels >= 2) {
      var L = srcBuffer.getChannelData(0);
      var R = srcBuffer.getChannelData(1);
      for (var i = 0; i < numFrames; i++) {
        out[i] = (L[i] + R[i]) / 2;
      }
    } else {
      out.set(srcBuffer.getChannelData(0));
    }
    return new Promise(function (resolve) {
      var OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      var offline = new OfflineCtx(1, numFrames, sampleRate);
      var src = offline.createBufferSource();
      src.buffer = monoBuffer;
      var hp = offline.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 150;
      var lp = offline.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(offline.destination);
      src.start(0);
      offline.startRendering().then(resolve);
    });
  }

  function blobToObjectUrl(blob) {
    return URL.createObjectURL(blob);
  }

  async function uploadNewAsset(blob, opts) {
    var mod = Mod();
    var created = await mod.uploadBlobAsAsset(blob, opts);
    mod.upsertNewAsset(created);
    return created;
  }

  // ── Cut tool ─────────────────────────────────────────────────────────
  var cut = {
    segments: [],
    seq: null, // { kept, idx, cleanup } active reassembly preview
    previewed: false,
  };

  function uidLocal() {
    return 'seg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function cutResetState() {
    var el = activeMediaEl();
    var durationMs = currentAsset ? Number(currentAsset.duration_ms) || 0 : 0;
    if (el && el.duration && isFinite(el.duration)) durationMs = el.duration * 1000;
    cut.segments = [{ id: uidLocal(), start: 0, end: durationMs, removed: false, previewed: false }];
    cut.previewed = false;
    stopCutSequencePreview();
    setToolStatus('cut', '');
    renderCutRuler();
    renderCutSegments();
    updateCutSaveEnabled();
  }

  function cutTotalDuration() {
    var el = activeMediaEl();
    if (el && el.duration && isFinite(el.duration) && el.duration > 0) return el.duration * 1000;
    return currentAsset ? Number(currentAsset.duration_ms) || 1000 : 1000;
  }

  function renderCutRuler() {
    var ruler = document.getElementById('cvs-cut-ruler');
    if (!ruler) return;
    ruler.innerHTML = '';
    var total = cutTotalDuration();
    cut.segments.forEach(function (seg, idx) {
      if (idx === 0) return;
      var mark = document.createElement('span');
      mark.className = 'cvs-cut-ruler__mark';
      mark.style.left = clamp01(seg.start / total) * 100 + '%';
      ruler.appendChild(mark);
    });
    var ph = document.createElement('span');
    ph.className = 'cvs-cut-ruler__playhead';
    var el = activeMediaEl();
    var cur = el ? el.currentTime * 1000 : 0;
    ph.style.left = clamp01(cur / total) * 100 + '%';
    ruler.appendChild(ph);
  }

  function clamp01(n) {
    return Math.max(0, Math.min(1, Number(n) || 0));
  }

  function renderCutSegments() {
    var wrap = document.getElementById('cvs-cut-segments');
    if (!wrap) return;
    wrap.innerHTML = '';
    cut.segments.forEach(function (seg, idx) {
      var row = document.createElement('div');
      row.className = 'cvs-cut-segment' + (seg.removed ? ' is-removed' : '');
      var label = document.createElement('span');
      label.className = 'cvs-cut-segment__label';
      label.textContent =
        (t('cut_part_label', 'Part') || 'Part') + ' ' + (idx + 1) + ' \u2014 ' + fmtTime(seg.start) + '\u2013' + fmtTime(seg.end);
      row.appendChild(label);

      var playBtnEl = document.createElement('button');
      playBtnEl.type = 'button';
      playBtnEl.className = 'cvs-btn cvs-btn--ghost';
      playBtnEl.textContent = t('cut_play', 'Play');
      playBtnEl.addEventListener('click', function () {
        playCutSegment(seg);
      });
      row.appendChild(playBtnEl);

      var exportBtnEl = document.createElement('button');
      exportBtnEl.type = 'button';
      exportBtnEl.className = 'cvs-btn cvs-btn--ghost';
      exportBtnEl.textContent = t('cut_export_part', 'Export as asset');
      exportBtnEl.disabled = !seg.previewed;
      exportBtnEl.title = seg.previewed ? '' : t('cut_preview_first', 'Play this part first to preview it');
      exportBtnEl.addEventListener('click', function () {
        exportCutSegment(seg);
      });
      row.appendChild(exportBtnEl);

      var toggleBtnEl = document.createElement('button');
      toggleBtnEl.type = 'button';
      toggleBtnEl.className = 'cvs-btn cvs-btn--ghost';
      toggleBtnEl.textContent = seg.removed ? t('cut_restore', 'Restore') : t('cut_remove', 'Remove');
      toggleBtnEl.addEventListener('click', function () {
        seg.removed = !seg.removed;
        cut.previewed = false;
        renderCutSegments();
        updateCutSaveEnabled();
      });
      row.appendChild(toggleBtnEl);

      wrap.appendChild(row);
    });
  }

  function findSegmentIndexAt(ms) {
    for (var i = 0; i < cut.segments.length; i++) {
      var s = cut.segments[i];
      if (ms >= s.start && ms < s.end) return i;
    }
    return -1;
  }

  function cutSplitAtPlayhead() {
    var el = activeMediaEl();
    if (!el) return;
    var ph = el.currentTime * 1000;
    var idx = findSegmentIndexAt(ph);
    if (idx < 0) return;
    var seg = cut.segments[idx];
    if (ph - seg.start < 200 || seg.end - ph < 200) {
      setToolStatus('cut', t('cut_too_close', 'Move the playhead further from an existing cut.'));
      return;
    }
    var right = { id: uidLocal(), start: ph, end: seg.end, removed: seg.removed, previewed: false };
    seg.end = ph;
    seg.previewed = false;
    cut.segments.splice(idx + 1, 0, right);
    cut.previewed = false;
    renderCutRuler();
    renderCutSegments();
    updateCutSaveEnabled();
    setToolStatus('cut', t('cut_added', 'Cut added.'));
  }

  function playCutSegment(seg) {
    var el = activeMediaEl();
    if (!el) return;
    stopCutSequencePreview();
    el.pause();
    el.currentTime = seg.start / 1000;
    var onSeeked = function () {
      el.removeEventListener('seeked', onSeeked);
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    };
    el.addEventListener('seeked', onSeeked);
    var onTime = function () {
      if (el.currentTime * 1000 >= seg.end) {
        el.pause();
        el.removeEventListener('timeupdate', onTime);
        seg.previewed = true;
        renderCutSegments();
      }
    };
    el.addEventListener('timeupdate', onTime);
    activeCleanup = function () {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('seeked', onSeeked);
    };
  }

  function keptSegments() {
    return cut.segments.filter(function (s) {
      return !s.removed;
    });
  }

  function stopCutSequencePreview() {
    if (cut.seq && cut.seq.cleanup) cut.seq.cleanup();
    cut.seq = null;
  }

  function previewReassembled() {
    var el = activeMediaEl();
    if (!el) return;
    var kept = keptSegments();
    if (!kept.length) {
      setToolStatus('cut', t('cut_nothing_kept', 'Nothing kept — restore at least one part.'));
      return;
    }
    stopCutSequencePreview();
    var idx = 0;
    function onTime() {
      var seg = kept[idx];
      if (!seg) return;
      if (el.currentTime * 1000 >= seg.end - 20) {
        idx += 1;
        if (idx >= kept.length) {
          el.pause();
          cleanup();
          cut.previewed = true;
          updateCutSaveEnabled();
          setToolStatus('cut', t('cut_preview_done', 'Preview finished. You can now save the reassembled result.'));
          return;
        }
        playSeg(kept[idx]);
      }
    }
    function playSeg(seg) {
      el.currentTime = seg.start / 1000;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    }
    function cleanup() {
      el.removeEventListener('timeupdate', onTime);
    }
    el.addEventListener('timeupdate', onTime);
    activeCleanup = cleanup;
    cut.seq = { kept: kept, idx: 0, cleanup: cleanup };
    playSeg(kept[0]);
    setToolStatus('cut', t('cut_previewing', 'Previewing reassembled result\u2026'));
  }

  function updateCutSaveEnabled() {
    var btn = document.getElementById('cvs-cut-btn-save');
    if (btn) btn.disabled = !cut.previewed || keptSegments().length === 0;
  }

  async function exportCutSegment(seg) {
    var el = activeMediaEl();
    if (!el || !currentAsset) return;
    var statusPrefix = t('cut_exporting', 'Exporting part\u2026');
    setToolStatus('cut', statusPrefix);
    try {
      var kind = currentAsset.kind === 'audio' ? 'audio' : 'video';
      var blob = await encodeSegmentsToBlob(el, kind, [seg], {
        width: video.videoWidth,
        height: video.videoHeight,
        withAudio: true,
      });
      var ext = kind === 'video' ? 'webm' : 'webm';
      var name = (currentAsset.original_name || 'asset') + '-part.' + ext;
      await uploadNewAsset(blob, {
        name: name,
        mime: blob.type,
        duration_ms: Math.round(seg.end - seg.start),
      });
      setToolStatus('cut', t('cut_export_done', 'Part exported as a new asset.'));
    } catch (e) {
      console.warn('[VideoStudio] cut export part failed', e);
      setToolStatus('cut', t('cut_export_failed', 'Export failed.'));
    }
  }

  async function saveReassembled() {
    var el = activeMediaEl();
    if (!el || !currentAsset) return;
    if (!cut.previewed) return;
    var kept = keptSegments();
    if (!kept.length) return;
    setToolStatus('cut', t('cut_saving', 'Rendering reassembled result\u2026'));
    var saveBtn = document.getElementById('cvs-cut-btn-save');
    if (saveBtn) saveBtn.disabled = true;
    try {
      var kind = currentAsset.kind === 'audio' ? 'audio' : 'video';
      var blob = await encodeSegmentsToBlob(el, kind, kept, {
        width: video.videoWidth,
        height: video.videoHeight,
        withAudio: true,
      });
      var totalMs = kept.reduce(function (sum, s) {
        return sum + (s.end - s.start);
      }, 0);
      var name = (currentAsset.original_name || 'asset') + '-cut.webm';
      await uploadNewAsset(blob, { name: name, mime: blob.type, duration_ms: Math.round(totalMs) });
      setToolStatus('cut', t('cut_saved', 'Saved as a new asset.'));
    } catch (e) {
      console.warn('[VideoStudio] cut save failed', e);
      setToolStatus('cut', t('cut_save_failed', 'Save failed.'));
    } finally {
      updateCutSaveEnabled();
    }
  }

  // ── Audio remove tool ───────────────────────────────────────────────
  var audioRemove = { previewed: false, wasMuted: false };

  function audioRemoveReset() {
    audioRemove.previewed = false;
    var btn = document.getElementById('cvs-audio-remove-btn-save');
    if (btn) btn.disabled = true;
    setToolStatus('audio-remove', '');
  }

  function audioRemovePreview() {
    if (!video || video.hidden) return;
    video.muted = true;
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
    audioRemove.previewed = true;
    var btn = document.getElementById('cvs-audio-remove-btn-save');
    if (btn) btn.disabled = false;
    setToolStatus(
      'audio-remove',
      t('audio_remove_previewing', 'Previewing without audio. Click Save to permanently remove the audio.')
    );
    activeCleanup = function () {
      video.muted = false;
    };
  }

  async function audioRemoveSave() {
    if (!currentAsset || !audioRemove.previewed) return;
    var confirmMsg = t(
      'audio_remove_confirm',
      'This permanently removes the audio from this asset and overwrites the original. Continue?'
    );
    if (!window.confirm(confirmMsg)) return;
    var btn = document.getElementById('cvs-audio-remove-btn-save');
    if (btn) btn.disabled = true;
    setToolStatus('audio-remove', t('audio_remove_saving', 'Removing audio\u2026'));
    try {
      var durationMs = video.duration && isFinite(video.duration) ? video.duration * 1000 : currentAsset.duration_ms;
      var blob = await encodeSegmentsToBlob(video, 'video', [{ start: 0, end: durationMs }], {
        width: video.videoWidth,
        height: video.videoHeight,
        withAudio: false,
      });
      var fd = new FormData();
      fd.append('asset_id', currentAsset.id);
      fd.append('file', blob, (currentAsset.original_name || 'asset') + '-noaudio.webm');
      fd.append('ext', 'webm');
      fd.append('duration_ms', String(Math.round(durationMs)));
      var mod = Mod();
      var res = await fetch(mod.apiUrl('video-studio-asset-overwrite'), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok) throw new Error(data.error || 'overwrite_failed');
      currentAsset = data.asset;
      mod.replaceAssetInPlace(data.asset.id, data.asset);
      setupMediaForAsset(currentAsset);
      setToolStatus('audio-remove', t('audio_remove_done', 'Audio removed and saved.'));
      audioRemove.previewed = false;
    } catch (e) {
      console.warn('[VideoStudio] audio remove save failed', e);
      setToolStatus('audio-remove', t('audio_remove_failed', 'Save failed.'));
      if (btn) btn.disabled = false;
    }
  }

  // ── Export audio tool ──────────────────────────────────────────────
  var exportAudio = { blob: null, url: null };

  function exportAudioReset() {
    exportAudio.blob = null;
    if (exportAudio.url) URL.revokeObjectURL(exportAudio.url);
    exportAudio.url = null;
    var player = document.getElementById('cvs-export-audio-player');
    if (player) {
      player.hidden = true;
      player.removeAttribute('src');
    }
    var btn = document.getElementById('cvs-export-audio-btn-save');
    if (btn) btn.disabled = true;
    setToolStatus('export-audio', '');
  }

  async function exportAudioPreview() {
    if (!currentAsset) return;
    setToolStatus('export-audio', t('export_audio_decoding', 'Decoding audio\u2026'));
    try {
      var buffer = await decodeAssetAudioBuffer(currentAsset);
      var blob = audioBufferToWav(buffer);
      exportAudio.blob = blob;
      if (exportAudio.url) URL.revokeObjectURL(exportAudio.url);
      exportAudio.url = blobToObjectUrl(blob);
      var player = document.getElementById('cvs-export-audio-player');
      if (player) {
        player.src = exportAudio.url;
        player.hidden = false;
      }
      var btn = document.getElementById('cvs-export-audio-btn-save');
      if (btn) btn.disabled = false;
      setToolStatus('export-audio', t('export_audio_ready', 'Preview ready (WAV).'));
    } catch (e) {
      console.warn('[VideoStudio] export audio preview failed', e);
      setToolStatus('export-audio', t('export_audio_failed', 'Could not decode audio for this asset.'));
    }
  }

  async function exportAudioSave() {
    if (!exportAudio.blob || !currentAsset) return;
    setToolStatus('export-audio', t('export_audio_saving', 'Exporting\u2026'));
    try {
      var name = (currentAsset.original_name || 'asset') + '-audio.wav';
      await uploadNewAsset(exportAudio.blob, { name: name, mime: 'audio/wav' });
      setToolStatus('export-audio', t('export_audio_done', 'Exported as a new audio asset.'));
    } catch (e) {
      console.warn('[VideoStudio] export audio save failed', e);
      setToolStatus('export-audio', t('export_audio_save_failed', 'Export failed.'));
    }
  }

  // ── Export vocals tool (best-effort mid-channel + band-pass heuristic) ─
  var exportVocals = { blob: null, url: null };

  function exportVocalsReset() {
    exportVocals.blob = null;
    if (exportVocals.url) URL.revokeObjectURL(exportVocals.url);
    exportVocals.url = null;
    var player = document.getElementById('cvs-export-vocals-player');
    if (player) {
      player.hidden = true;
      player.removeAttribute('src');
    }
    var btn = document.getElementById('cvs-export-vocals-btn-save');
    if (btn) btn.disabled = true;
    setToolStatus('export-vocals', '');
  }

  async function exportVocalsPreview() {
    if (!currentAsset) return;
    setToolStatus('export-vocals', t('export_vocals_processing', 'Isolating vocals (best-effort)\u2026'));
    try {
      var buffer = await decodeAssetAudioBuffer(currentAsset);
      var ctx = getToolsAudioContext();
      var vocalsBuffer = await extractVocalsHeuristic(buffer, ctx);
      var blob = audioBufferToWav(vocalsBuffer);
      exportVocals.blob = blob;
      if (exportVocals.url) URL.revokeObjectURL(exportVocals.url);
      exportVocals.url = blobToObjectUrl(blob);
      var player = document.getElementById('cvs-export-vocals-player');
      if (player) {
        player.src = exportVocals.url;
        player.hidden = false;
      }
      var btn = document.getElementById('cvs-export-vocals-btn-save');
      if (btn) btn.disabled = false;
      setToolStatus(
        'export-vocals',
        t('export_vocals_ready', 'Preview-quality vocal extract ready (best-effort, not full AI separation).')
      );
    } catch (e) {
      console.warn('[VideoStudio] export vocals preview failed', e);
      setToolStatus('export-vocals', t('export_vocals_failed', 'Could not process audio for this asset.'));
    }
  }

  async function exportVocalsSave() {
    if (!exportVocals.blob || !currentAsset) return;
    setToolStatus('export-vocals', t('export_vocals_saving', 'Exporting\u2026'));
    try {
      var name = (currentAsset.original_name || 'asset') + '-vocals.wav';
      await uploadNewAsset(exportVocals.blob, { name: name, mime: 'audio/wav' });
      setToolStatus('export-vocals', t('export_vocals_done', 'Exported as a new audio asset.'));
    } catch (e) {
      console.warn('[VideoStudio] export vocals save failed', e);
      setToolStatus('export-vocals', t('export_vocals_save_failed', 'Export failed.'));
    }
  }

  // ── Screenshot tool ─────────────────────────────────────────────────
  var screenshot = { blob: null, url: null };

  function screenshotReset() {
    screenshot.blob = null;
    if (screenshot.url) URL.revokeObjectURL(screenshot.url);
    screenshot.url = null;
    var img = document.getElementById('cvs-screenshot-preview');
    if (img) {
      img.hidden = true;
      img.removeAttribute('src');
    }
    var btn = document.getElementById('cvs-screenshot-btn-save');
    if (btn) btn.disabled = true;
    setToolStatus('screenshot', '');
  }

  function screenshotCapture() {
    if (!video || video.hidden || !video.videoWidth) {
      setToolStatus('screenshot', t('screenshot_no_frame', 'No video frame available yet.'));
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(function (blob) {
      if (!blob) {
        setToolStatus('screenshot', t('screenshot_failed', 'Capture failed.'));
        return;
      }
      screenshot.blob = blob;
      if (screenshot.url) URL.revokeObjectURL(screenshot.url);
      screenshot.url = blobToObjectUrl(blob);
      var img = document.getElementById('cvs-screenshot-preview');
      if (img) {
        img.src = screenshot.url;
        img.hidden = false;
      }
      var btn = document.getElementById('cvs-screenshot-btn-save');
      if (btn) btn.disabled = false;
      setToolStatus('screenshot', t('screenshot_ready', 'Frame captured.'));
    }, 'image/png');
  }

  async function screenshotSave() {
    if (!screenshot.blob || !currentAsset) return;
    setToolStatus('screenshot', t('screenshot_saving', 'Saving\u2026'));
    try {
      var name = (currentAsset.original_name || 'asset') + '-frame.png';
      await uploadNewAsset(screenshot.blob, {
        name: name,
        mime: 'image/png',
        width: video.videoWidth,
        height: video.videoHeight,
      });
      setToolStatus('screenshot', t('screenshot_done', 'Saved as a new image asset.'));
    } catch (e) {
      console.warn('[VideoStudio] screenshot save failed', e);
      setToolStatus('screenshot', t('screenshot_save_failed', 'Save failed.'));
    }
  }

  // ── Duplicate tool ──────────────────────────────────────────────────
  async function duplicateAsset() {
    if (!currentAsset) return;
    var confirmMsg = t('duplicate_confirm', 'Create a copy of this asset?');
    if (!window.confirm(confirmMsg)) return;
    setToolStatus('duplicate', t('duplicate_saving', 'Duplicating\u2026'));
    var mod = Mod();
    try {
      var res = await fetch(mod.apiUrl('video-studio-asset-duplicate'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: currentAsset.id }),
      });
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (!data.ok) throw new Error(data.error || 'duplicate_failed');
      mod.upsertNewAsset(data.asset);
      setToolStatus('duplicate', t('duplicate_done', 'Duplicated.'));
    } catch (e) {
      console.warn('[VideoStudio] duplicate failed', e);
      setToolStatus('duplicate', t('duplicate_failed', 'Duplicate failed.'));
    }
  }

  // ── Tabs / tool switching ───────────────────────────────────────────
  function visibleToolsForKind(kind) {
    if (kind === 'image') return ['duplicate'];
    if (kind === 'audio') return ['cut', 'export-vocals', 'duplicate'];
    return ['cut', 'audio-remove', 'export-audio', 'export-vocals', 'screenshot', 'duplicate'];
  }

  function resetToolState(tool) {
    if (tool === 'cut') cutResetState();
    else if (tool === 'audio-remove') audioRemoveReset();
    else if (tool === 'export-audio') exportAudioReset();
    else if (tool === 'export-vocals') exportVocalsReset();
    else if (tool === 'screenshot') screenshotReset();
    else if (tool === 'duplicate') setToolStatus('duplicate', '');
  }

  function resetAllToolState() {
    ['cut', 'audio-remove', 'export-audio', 'export-vocals', 'screenshot', 'duplicate'].forEach(resetToolState);
  }

  function leaveCurrentTool() {
    if (activeCleanup) {
      try {
        activeCleanup();
      } catch (e) {}
      activeCleanup = null;
    }
    stopCutSequencePreview();
    var el = activeMediaEl();
    if (el) el.pause();
  }

  function selectTool(tool) {
    leaveCurrentTool();
    currentTool = tool;
    resetToolState(tool);
    var tabs = tabsEl ? tabsEl.querySelectorAll('.cvs-tools-tab') : [];
    tabs.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tool') === tool);
    });
    var panels = panelsEl ? panelsEl.querySelectorAll('.cvs-tool-panel') : [];
    panels.forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-tool-panel') !== tool;
    });
    if (tool === 'cut') {
      renderCutRuler();
      renderCutSegments();
    }
  }

  function renderTabsForKind(kind) {
    if (!tabsEl) return;
    var visible = visibleToolsForKind(kind);
    var tabs = tabsEl.querySelectorAll('.cvs-tools-tab');
    tabs.forEach(function (btn) {
      var tool = btn.getAttribute('data-tool');
      btn.hidden = visible.indexOf(tool) === -1;
    });
  }

  function defaultToolForKind(kind) {
    var visible = visibleToolsForKind(kind);
    return visible[0] || 'duplicate';
  }

  // ── Modal open/close + fullscreen ──────────────────────────────────
  function toggleFullscreen() {
    if (!shell) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (shell.requestFullscreen) {
      shell.requestFullscreen().catch(function () {});
    }
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    modal = document.getElementById('cvsAssetToolsModal');
    shell = document.getElementById('cvs-tools-shell');
    titleEl = document.getElementById('cvs-tools-title');
    statusEl = document.getElementById('cvs-tools-status');
    video = document.getElementById('cvs-tools-video');
    audioEl = document.getElementById('cvs-tools-audio');
    imgEl = document.getElementById('cvs-tools-image');
    playBtn = document.getElementById('cvs-tools-btn-play');
    timeEl = document.getElementById('cvs-tools-time');
    tabsEl = document.getElementById('cvs-tools-tabs');
    panelsEl = document.getElementById('cvs-tools-panels');
    if (!modal) return;

    function on(id, evt, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener(evt, fn);
    }

    on('cvs-tools-btn-close', 'click', close);
    on('cvs-tools-btn-fullscreen', 'click', toggleFullscreen);
    on('cvs-tools-btn-play', 'click', togglePlay);

    if (tabsEl) {
      tabsEl.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.cvs-tools-tab');
        if (!btn || btn.hidden) return;
        selectTool(btn.getAttribute('data-tool'));
      });
    }

    on('cvs-cut-btn-split', 'click', cutSplitAtPlayhead);
    on('cvs-cut-btn-reset', 'click', cutResetState);
    on('cvs-cut-btn-preview', 'click', previewReassembled);
    on('cvs-cut-btn-save', 'click', saveReassembled);

    var ruler = document.getElementById('cvs-cut-ruler');
    if (ruler) {
      ruler.addEventListener('click', function (e) {
        var el = activeMediaEl();
        if (!el) return;
        var rect = ruler.getBoundingClientRect();
        var ratio = clamp01((e.clientX - rect.left) / rect.width);
        el.currentTime = (ratio * cutTotalDuration()) / 1000;
        renderCutRuler();
      });
    }

    on('cvs-audio-remove-btn-preview', 'click', audioRemovePreview);
    on('cvs-audio-remove-btn-save', 'click', audioRemoveSave);

    on('cvs-export-audio-btn-preview', 'click', exportAudioPreview);
    on('cvs-export-audio-btn-save', 'click', exportAudioSave);

    on('cvs-export-vocals-btn-preview', 'click', exportVocalsPreview);
    on('cvs-export-vocals-btn-save', 'click', exportVocalsSave);

    on('cvs-screenshot-btn-capture', 'click', screenshotCapture);
    on('cvs-screenshot-btn-save', 'click', screenshotSave);

    on('cvs-duplicate-btn', 'click', duplicateAsset);

    if (video) {
      video.addEventListener('timeupdate', function () {
        if (currentTool === 'cut') renderCutRuler();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!modal || modal.hidden) return;
      if (e.key === 'Escape') {
        if (document.fullscreenElement) return; // let browser handle exit
        close();
      }
    });
  }

  function open(assetId) {
    var mod = Mod();
    if (!mod) return;
    var asset = (mod.getAssets() || []).find(function (a) {
      return a.id === assetId;
    });
    if (!asset) return;
    bindOnce();
    if (!modal) return;

    currentAsset = asset;
    setupMediaForAsset(asset);
    renderTabsForKind(asset.kind);
    if (titleEl) titleEl.textContent = asset.original_name || asset.kind || 'Asset';
    setStatus('');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    selectTool(defaultToolForKind(asset.kind));
  }

  function close() {
    leaveCurrentTool();
    if (video) video.pause();
    if (audioEl) audioEl.pause();
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    currentAsset = null;
  }

  window.CreatorVideoStudioAssetTools = { open: open, close: close };
})();
