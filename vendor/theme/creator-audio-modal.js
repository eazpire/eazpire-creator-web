/**
 * Creator Audio Modal
 * Global audio library: list, play, upload, use on Creator page
 * Header visualizer during playback
 */
(function () {
  'use strict';

  var API_BASE = (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) || '/apps/creator-dispatch';
  var UPLOAD_BASE = 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
  var i18n = window.CreatorAudioI18n || {};
  var ownerId = window.__EAZ_OWNER_ID || null;

  function getOwnerId() {
    if (ownerId) return ownerId;
    var el = document.querySelector('[data-debug-owner]');
    if (el && el.dataset && el.dataset.debugOwner) {
      try { return JSON.parse(el.dataset.debugOwner) || null; } catch (_) {}
    }
    return null;
  }

  function t(key, fallback) {
    return (i18n[key] || fallback || key);
  }

  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var state = {
    list: [],
    selectedId: null,
    currentAudio: null,
    volume: 1,
    muted: false,
    analyser: null,
    animationId: null,
    keepAudioOnClose: false,
    loadInProgress: false,
    pendingAutoPlay: false,
    cameFromCreatorSwitch: false,
    wasPlayingBeforeHidden: false,
    bassLevel: 0
  };

  var modal = document.getElementById('creatorAudioModal');
  var confirmModal = document.getElementById('creatorAudioConfirmModal');
  var listEl = document.getElementById('creatorAudioModalList');
  var emptyEl = document.getElementById('creatorAudioModalEmpty');
  var fileInput = document.getElementById('creatorAudioModalFileInput');
  var useBtn = document.getElementById('creatorAudioModalUseBtn');
  var muteBtn = document.getElementById('creatorAudioModalMuteBtn');
  var volumeSlider = document.getElementById('creatorAudioModalVolumeSlider');
  var audioControls = document.getElementById('creatorDesktopAudioControls');
  var audioCtrlPlay = document.getElementById('creatorAudioCtrlPlay');
  var audioCtrlBack = document.getElementById('creatorAudioCtrlBack');
  var audioCtrlFwd = document.getElementById('creatorAudioCtrlFwd');
  var visualizerCanvas = document.getElementById('creatorDesktopAudioVisualizer');
  var mobileAudioControls = document.getElementById('creatorMobileAudioControls');
  var mobileCtrlPlay = document.getElementById('creatorMobileAudioCtrlPlay');
  var mobileCtrlBack = document.getElementById('creatorMobileAudioCtrlBack');
  var mobileCtrlFwd = document.getElementById('creatorMobileAudioCtrlFwd');
  var mobileVisualizerCanvas = document.getElementById('creatorMobileAudioVisualizer');

  var allAudioControls = [audioControls, mobileAudioControls].filter(Boolean);
  var allPlayBtns = [audioCtrlPlay, mobileCtrlPlay].filter(Boolean);
  var allVisualizerCanvases = [visualizerCanvas, mobileVisualizerCanvas].filter(Boolean);

  if (!modal || !listEl) return;

  function showAudioControls(show) {
    allAudioControls.forEach(function (ctrl) { if (ctrl) ctrl.classList.toggle('is-idle', !show); });
  }

  function updateHeaderPlayPause() {
    var playing = state.currentAudio && !state.currentAudio.paused;
    allPlayBtns.forEach(function (btn) {
      if (!btn) return;
      btn.classList.toggle('is-playing', playing);
      btn.setAttribute('aria-label', playing ? t('pause', 'Pause') : t('play', 'Play'));
      var playIcon = btn.querySelector('.creator-audio-ctrl__play-icon');
      var pauseIcon = btn.querySelector('.creator-audio-ctrl__pause-icon');
      if (playIcon) playIcon.hidden = playing;
      if (pauseIcon) pauseIcon.hidden = !playing;
    });
  }

  function getApiUrl(op, extra) {
    var u = new URL(API_BASE, window.location.origin);
    u.searchParams.set('op', op);
    u.searchParams.set('_t', Date.now());
    if (extra) Object.keys(extra).forEach(function (k) { u.searchParams.set(k, extra[k]); });
    return u.toString();
  }

  function fetchList() {
    return fetch(getApiUrl('list-audio-files'), { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.list = (data && data.files) ? data.files : [];
        renderList();
      })
      .catch(function (err) {
        console.warn('[CreatorAudio] list fetch failed:', err);
        state.list = [];
        renderList();
      });
  }

  var PLAY_ICON = '<svg class="creator-audio-modal__play-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  var PAUSE_ICON = '<svg class="creator-audio-modal__pause-icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (state.list.length === 0) {
      var li = document.createElement('li');
      li.className = 'creator-audio-modal__empty';
      li.id = 'creatorAudioModalEmpty';
      li.textContent = t('empty', 'No audio files yet');
      listEl.appendChild(li);
      return;
    }
    var oid = getOwnerId();
    state.list.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'creator-audio-modal__item' + (state.selectedId === item.id ? ' is-selected' : '');
      li.dataset.id = item.id;
      var isOwner = oid && String(item.owner_id) === String(oid);
      var deleteBtn = isOwner
        ? '<button type="button" class="creator-audio-modal__delete-btn" data-delete-id="' + item.id + '" aria-label="' + t('remove', 'Remove') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>'
        : '';
      li.innerHTML =
        '<div class="creator-audio-modal__cover">' +
        (item.cover_url
          ? '<img src="' + (item.cover_url || '').replace(/"/g, '&quot;') + '" alt="">'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>') +
        '</div>' +
        '<div class="creator-audio-modal__info">' +
        '<p class="creator-audio-modal__title">' + (item.title || 'Untitled').replace(/</g, '&lt;') + '</p>' +
        '<div class="creator-audio-modal__controls">' +
        '<button type="button" class="creator-audio-modal__play-btn" aria-label="' + t('play', 'Play') + '">' +
        PLAY_ICON + PAUSE_ICON +
        '</button>' +
        '<span class="creator-audio-modal__time" data-time>0:00 / ' + formatTime(item.duration_sec || 0) + '</span>' +
        '</div></div>' +
        (deleteBtn ? '<div class="creator-audio-modal__item-actions">' + deleteBtn + '</div>' : '');
      listEl.appendChild(li);
    });
    bindListEvents();
  }

  function bindListEvents() {
    if (!listEl) return;
    listEl.querySelectorAll('.creator-audio-modal__item').forEach(function (li) {
      var id = li.dataset.id;
      var playBtn = li.querySelector('.creator-audio-modal__play-btn');
      if (playBtn) playBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePlay(id); });
      li.addEventListener('click', function (e) {
        if (e.target.closest('.creator-audio-modal__play-btn') || e.target.closest('.creator-audio-modal__delete-btn')) return;
        selectItem(id);
      });
      var delBtn = li.querySelector('.creator-audio-modal__delete-btn');
      if (delBtn) delBtn.addEventListener('click', function (e) { e.stopPropagation(); deleteItem(id); });
    });
    updatePlayPauseButtons();
  }

  function updatePlayPauseButtons() {
    if (!listEl) return;
    var playingId = state.currentAudio && !state.currentAudio.paused ? state.currentAudio.dataset.id : null;
    listEl.querySelectorAll('.creator-audio-modal__item').forEach(function (li) {
      var playBtn = li.querySelector('.creator-audio-modal__play-btn');
      if (!playBtn) return;
      var id = li.dataset.id;
      var isPlaying = playingId === id;
      playBtn.classList.toggle('is-playing', isPlaying);
      playBtn.setAttribute('aria-label', isPlaying ? t('pause', 'Pause') : t('play', 'Play'));
    });
  }

  function showDeleteConfirm(item, onConfirm) {
    if (!confirmModal) { onConfirm(); return; }
    var confirmTitle = (t('remove_confirm', 'Remove?') || 'Remove?').replace(/\{\{title\}\}/g, item.title || 'Untitled');
    confirmModal.querySelector('#creator-audio-confirm-title').textContent = confirmTitle;
    confirmModal.querySelector('#creatorAudioConfirmDesc').textContent = t('remove_confirm_desc', 'This cannot be undone.');
    confirmModal.querySelector('#creatorAudioConfirmCancel').textContent = t('cancel', 'Cancel');
    confirmModal.querySelector('#creatorAudioConfirmRemove').textContent = t('remove', 'Remove');
    var resolveConfirm;
    var promise = new Promise(function (r) { resolveConfirm = r; });
    function cleanup() {
      confirmModal.close();
      confirmModal.onclick = null;
      var cb = document.getElementById('creatorAudioConfirmCancel');
      var rb = document.getElementById('creatorAudioConfirmRemove');
      if (cb) cb.onclick = null;
      if (rb) rb.onclick = null;
    }
    confirmModal.onclick = function (e) {
      if (e.target === confirmModal) { cleanup(); resolveConfirm(false); }
    };
    document.getElementById('creatorAudioConfirmCancel').onclick = function () { cleanup(); resolveConfirm(false); };
    document.getElementById('creatorAudioConfirmRemove').onclick = function () { cleanup(); resolveConfirm(true); };
    confirmModal.showModal();
    promise.then(function (ok) { if (ok) onConfirm(); });
  }

  function deleteItem(id) {
    var oid = getOwnerId();
    if (!oid) {
      alert(t('login_required', 'Please log in'));
      return;
    }
    var item = getItem(id);
    if (!item || String(item.owner_id) !== String(oid)) return;
    showDeleteConfirm(item, function () {
      doDeleteItem(id);
    });
  }

  function doDeleteItem(id) {
    var oid = getOwnerId();
    if (!oid) return;
    fetch(getApiUrl('delete-audio-file', { owner_id: oid }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_id: id }),
      credentials: 'include'
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          if (state.currentAudio && state.currentAudio.dataset.id === id) stopCurrent();
          if (state.selectedId === id) state.selectedId = null;
          fetchList();
        } else {
          alert(data && data.message ? data.message : 'Delete failed');
        }
      })
      .catch(function (err) {
        console.warn('[CreatorAudio] delete failed:', err);
        alert('Delete failed');
      });
  }

  function closeConfirmModal() {
    if (confirmModal) confirmModal.close();
  }

  function selectItem(id) {
    state.selectedId = id;
    useBtn.disabled = !id;
    listEl.querySelectorAll('.creator-audio-modal__item').forEach(function (li) {
      li.classList.toggle('is-selected', li.dataset.id === id);
    });
  }

  function getItem(id) {
    return state.list.find(function (x) { return String(x.id) === String(id); });
  }

  function togglePlay(id) {
    var item = getItem(id);
    if (!item || !item.url) return;
    if (state.currentAudio && state.currentAudio.dataset.id === id) {
      if (state.currentAudio.paused) {
        state.currentAudio.play();
      } else {
        state.currentAudio.pause();
      }
      updatePlayPauseButtons();
      return;
    }
    stopCurrent();
    var audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.dataset.id = id;
    audio.volume = state.muted ? 0 : state.volume;
    audio.addEventListener('timeupdate', function () { updateTime(id); });
    audio.addEventListener('ended', function () { onEnded(id); });
    attachPlayPauseListeners(audio);
    audio.addEventListener('loadedmetadata', function () {
      var d = audio.duration;
      if (d && isFinite(d) && (!item.duration_sec || item.duration_sec === 0)) {
        item.duration_sec = Math.round(d);
        var timeEl = listEl.querySelector('.creator-audio-modal__item[data-id="' + id + '"] .creator-audio-modal__time');
        if (timeEl) timeEl.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(item.duration_sec);
      }
    });
    audio.src = item.url;
    state.currentAudio = audio;
    setupAnalyser(audio, function () {
      audio.play();
    });
  }

  function stopCurrent() {
    setCreatorAudioPlaying(false);
    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio.src = '';
      state.currentAudio = null;
    }
    stopVisualizer(true);
    showAudioControls(false);
    updatePlayPauseButtons();
  }

  function updateTime(id) {
    var audio = state.currentAudio;
    if (!audio || audio.dataset.id !== id) return;
    var item = getItem(id);
    var timeEl = listEl.querySelector('.creator-audio-modal__item[data-id="' + id + '"] .creator-audio-modal__time');
    if (timeEl && item) {
      timeEl.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(item.duration_sec || 0);
    }
  }

  function setCreatorAudioPlaying(playing) {
    window.CreatorAudioPlaying = !!playing;
    try {
      window.dispatchEvent(new CustomEvent('creator-audio-play-state', { detail: { playing: !!playing } }));
    } catch (_) {}
    if (window.CreatorMusicParty && typeof window.CreatorMusicParty.onPlayState === 'function') {
      window.CreatorMusicParty.onPlayState(!!playing);
    }
    if (playing && window.EazySoundEffects && typeof window.EazySoundEffects.stop === 'function') {
      window.EazySoundEffects.stop();
    }
  }

  function computeBassFromFreq(freqData) {
    if (!freqData || !freqData.length) return 0;
    var lowEnd = Math.max(3, Math.floor(freqData.length * 0.06));
    var midEnd = Math.max(lowEnd + 1, Math.floor(freqData.length * 0.14));
    var lowSum = 0;
    var midSum = 0;
    var i;
    for (i = 0; i < lowEnd; i++) lowSum += freqData[i];
    for (i = lowEnd; i < midEnd; i++) midSum += freqData[i];
    var lowAvg = lowSum / lowEnd;
    var midAvg = midSum / Math.max(1, midEnd - lowEnd);
    var punch = lowAvg * 0.78 + midAvg * 0.22;
    return Math.min(1, (punch / 255) * 2.35);
  }

  function onPlay(id) {
    setCreatorAudioPlaying(true);
    showAudioControls(true);
    updateHeaderPlayPause();
    updatePlayPauseButtons();
    startVisualizer();
  }

  function onPause(id) {
    setCreatorAudioPlaying(false);
    stopVisualizer(false);
    updateHeaderPlayPause();
    if (!state.currentAudio) showAudioControls(false);
    updatePlayPauseButtons();
  }

  function attachPlayPauseListeners(audio) {
    audio.addEventListener('play', function () { onPlay(audio.dataset && audio.dataset.id); });
    audio.addEventListener('pause', function () { onPause(audio.dataset && audio.dataset.id); });
  }

  function onEnded(id) {
    stopCurrent();
    updatePlayPauseButtons();
    var timeEl = listEl.querySelector('.creator-audio-modal__item[data-id="' + id + '"] .creator-audio-modal__time');
    var item = getItem(id);
    if (timeEl && item) timeEl.textContent = '0:00 / ' + formatTime(item.duration_sec || 0);
  }

  function setupAnalyser(audio, onReady) {
    onReady = onReady || function () {};
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var src = ctx.createMediaElementSource(audio);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.25;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      state.analyser = analyser;
      state.audioContext = ctx;
      var resume = ctx.resume ? ctx.resume() : Promise.resolve();
      resume.then(function () { onReady(); }).catch(function () {
        state.analyser = null;
        stopCurrent();
        if (typeof scheduleRetryOnFirstGesture === 'function') {
          scheduleRetryOnFirstGesture();
        } else {
          onReady();
        }
      });
    } catch (_) {
      onReady();
    }
  }

  /** Start playback for an already-prepared state.currentAudio (Web Audio graph is one-shot per element). */
  function tryPlayCurrentWithAnalyser() {
    if (!state.currentAudio) return;
    if (!state.analyser) {
      setupAnalyser(state.currentAudio, function () {
        state.currentAudio.play().catch(function () { scheduleRetryOnFirstGesture(); });
        showAudioControls(true);
        updateHeaderPlayPause();
        startVisualizer();
      });
    } else {
      state.currentAudio.play().catch(function () { scheduleRetryOnFirstGesture(); });
      updateHeaderPlayPause();
    }
  }

  function drawStaticVisualizer() {
    allVisualizerCanvases.forEach(function (canvas) {
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var w = canvas.width;
      var h = canvas.height;
    var barCount = 16;
    var barW = Math.max(2, (w - 6) / barCount - 1);
    var centerY = h / 2;
    var staticHeights = [0.15, 0.35, 0.5, 0.4, 0.6, 0.3, 0.45, 0.55, 0.25, 0.4, 0.5, 0.35, 0.45, 0.3, 0.4, 0.25];
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < barCount; i++) {
      var amp = staticHeights[i] || 0.3;
      var barH = Math.max(3, amp * h * 0.5);
      var x = 3 + (i / barCount) * (w - 6);
      var t = i / barCount;
      var r = Math.round(93 + (100 - 93) * t);
      var g = Math.round(72 + (200 - 72) * t);
      var b = Math.round(198 + (255 - 198) * t);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',0.6)';
      ctx.fillRect(x, centerY - barH / 2, barW, barH);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(x + 0.5, centerY - barH / 2, Math.max(0, barW - 1), Math.max(1, barH * 0.3));
    }
    });
  }

  function startVisualizer() {
    if (allVisualizerCanvases.length === 0 || !state.analyser) return;
    var freqData = new Uint8Array(state.analyser.frequencyBinCount);
    var barCount = 16;
    var binCount = freqData.length;

    function draw() {
      if (!state.analyser || !state.currentAudio || state.currentAudio.paused) {
        state.animationId = null;
        drawStaticVisualizer();
        return;
      }
      state.analyser.getByteFrequencyData(freqData);
      state.bassLevel = computeBassFromFreq(freqData);

      allVisualizerCanvases.forEach(function (canvas) {
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;
        var w = canvas.width;
        var h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        var barW = Math.max(2, (w - 6) / barCount - 1);
        var centerY = h / 2;

        for (var i = 0; i < barCount; i++) {
        var startBin = Math.floor((i / barCount) * binCount * 0.85);
        var endBin = Math.floor(((i + 1) / barCount) * binCount * 0.85);
        var sum = 0;
        var count = 0;
        for (var j = startBin; j < endBin && j < binCount; j++) {
          sum += freqData[j];
          count++;
        }
        var avg = count > 0 ? sum / count : 0;
        var amp = Math.min(1, (avg / 255) * 1.4);
        var barH = Math.max(3, amp * h * 0.48);
        var x = 3 + (i / barCount) * (w - 6);

        var t = i / barCount;
        var r = Math.round(93 + (100 - 93) * t);
        var g = Math.round(72 + (200 - 72) * t);
        var b = Math.round(198 + (255 - 198) * t);
        if (amp > 0.4) {
          var blend = (amp - 0.4) * 1.2;
          r = Math.round(r + (255 - r) * blend * 0.5);
          g = Math.round(g + (143 - g) * blend * 0.5);
          b = Math.round(b + (68 - b) * blend * 0.5);
        }
        var glow = 0.5 + amp * 0.5;
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + glow + ')';
        ctx.shadowColor = 'rgba(100, 200, 255, 0.5)';
        ctx.shadowBlur = 3;
        ctx.fillRect(x, centerY - barH / 2, barW, barH);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.2 + amp * 0.3) + ')';
        ctx.fillRect(x + 0.5, centerY - barH / 2, Math.max(0, barW - 1), Math.max(1, barH * 0.35));
        }
      });

      state.animationId = requestAnimationFrame(draw);
    }
    draw();
  }

  function stopVisualizer(clearAnalyser) {
    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }
    if (clearAnalyser) {
      state.analyser = null;
    }
    drawStaticVisualizer();
  }

  function playRandomNext() {
    if (state.loadInProgress) return;
    var oid = getOwnerId();
    if (!oid) {
      modal.showModal();
      fetchList();
      return;
    }
    state.loadInProgress = true;
    function doPlay(item) {
      if (!item || !item.url) return;
      stopCurrent();
      state.selectedId = item.id;
      function doSet(url) {
        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_id: item.id }),
          credentials: 'include'
        }).then(function (r) { return r.json(); });
      }
      var apiUrl = getApiUrl('set-creator-audio', { owner_id: oid });
      var directUrl = (UPLOAD_BASE.split('?')[0] || UPLOAD_BASE) + '?op=set-creator-audio&owner_id=' + encodeURIComponent(oid) + '&_t=' + Date.now();
      doSet(apiUrl).catch(function () { return doSet(directUrl); }).then(function (data) {
        state.loadInProgress = false;
        if (data && data.ok) {
          var audio = new Audio();
          audio.crossOrigin = 'anonymous';
          audio.volume = state.muted ? 0 : state.volume;
          audio.loop = true;
          audio.src = item.url;
          audio.dataset.id = item.id;
          state.currentAudio = audio;
          attachPlayPauseListeners(audio);
          setupAnalyser(audio, function () {
            setCreatorAudioPlaying(true);
            audio.play().catch(function () {
              if (typeof scheduleRetryOnFirstGesture === 'function') {
                scheduleRetryOnFirstGesture();
              }
            });
            showAudioControls(true);
            startVisualizer();
          });
        }
      });
    }
    if (state.list.length === 0) {
      fetch(getApiUrl('list-audio-files'), { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          state.list = (data && data.files) ? data.files : [];
          if (state.list.length === 0) {
            state.loadInProgress = false;
            modal.showModal();
            fetchList();
          } else {
            var idx = Math.floor(Math.random() * state.list.length);
            doPlay(state.list[idx]);
          }
        })
        .catch(function () {
          state.loadInProgress = false;
          modal.showModal();
          fetchList();
        });
    } else {
      var currentId = state.selectedId || (state.currentAudio && state.currentAudio.dataset && state.currentAudio.dataset.id);
      var others = state.list.filter(function (x) { return String(x.id) !== String(currentId); });
      if (others.length === 0) others = state.list;
      var idx = Math.floor(Math.random() * others.length);
      doPlay(others[idx]);
    }
  }

  function getAudioDuration(file, cb) {
    var url = URL.createObjectURL(file);
    var audio = new Audio();
    audio.addEventListener('loadedmetadata', function () {
      URL.revokeObjectURL(url);
      var d = audio.duration;
      cb(isFinite(d) ? Math.round(d) : 0);
    });
    audio.addEventListener('error', function () {
      URL.revokeObjectURL(url);
      cb(0);
    });
    audio.src = url;
  }

  function uploadFile(file) {
    var oid = getOwnerId();
    if (!oid) {
      alert(t('login_required', 'Please log in'));
      return;
    }
    getAudioDuration(file, function (durationSec) {
      var fd = new FormData();
      fd.append('audio', file);
      if (durationSec > 0) fd.append('duration_sec', String(durationSec));
      var uploadUrl = UPLOAD_BASE + '?op=upload-audio-file&owner_id=' + encodeURIComponent(oid) + '&_t=' + Date.now();
      fetch(uploadUrl, {
        method: 'POST',
        body: fd,
        credentials: 'include'
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) {
            fetchList();
          } else {
            alert(data && data.message ? data.message : t('upload_error', 'Upload failed'));
          }
        })
        .catch(function (err) {
          console.warn('[CreatorAudio] upload failed:', err);
          alert(t('upload_error', 'Upload failed'));
        });
    });
  }

  function useSelected() {
    if (!state.selectedId) return;
    var oid = getOwnerId();
    if (!oid) {
      alert(t('login_required', 'Please log in'));
      return;
    }
    function doSetCreatorAudio(url) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_id: state.selectedId }),
        credentials: 'include'
      }).then(function (r) { return r.json(); });
    }
    var apiUrl = getApiUrl('set-creator-audio', { owner_id: oid });
    var directUrl = (UPLOAD_BASE.split('?')[0] || UPLOAD_BASE) + '?op=set-creator-audio&owner_id=' + encodeURIComponent(oid) + '&_t=' + Date.now();
    doSetCreatorAudio(apiUrl)
      .catch(function () { return doSetCreatorAudio(directUrl); })
      .then(function (data) {
        if (data && data.ok) {
          var item = getItem(state.selectedId);
          if (item && item.url) {
            stopCurrent();
            var audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.volume = state.muted ? 0 : state.volume;
            audio.loop = true;
            audio.src = item.url;
            audio.dataset.id = item.id;
            state.currentAudio = audio;
            state.selectedId = item.id;
            state.keepAudioOnClose = true;
            modal.close();
            attachPlayPauseListeners(audio);
            showAudioControls(true);
            updateHeaderPlayPause();
          }
        }
      })
      .catch(function (err) {
        console.warn('[CreatorAudio] set-creator-audio failed:', err);
        alert(t('upload_error', 'Upload failed') + ' (set-creator-audio)');
      });
  }

  allVisualizerCanvases.forEach(function (canvas) {
    if (!canvas) return;
    canvas.addEventListener('click', function () {
      modal.showModal();
      fetchList();
    });
    canvas.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        modal.showModal();
        fetchList();
      }
    });
  });

  function bindPlayBackFwd(playBtn, backBtn, fwdBtn) {
    if (playBtn) {
      playBtn.addEventListener('click', function (e) {
        if (state.pendingAutoPlay) {
          clearPendingAutoPlay();
          tryPlayCurrentWithAnalyser();
          return;
        }
        if (!state.currentAudio) {
          playRandomNext();
          return;
        }
        if (state.currentAudio.paused) {
          tryPlayCurrentWithAnalyser();
        } else {
          state.currentAudio.pause();
        }
        updateHeaderPlayPause();
      });
    }
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (!state.currentAudio) return;
        state.currentAudio.currentTime = Math.max(0, state.currentAudio.currentTime - 10);
      });
    }
    if (fwdBtn) {
      fwdBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        playRandomNext();
      });
    }
  }
  bindPlayBackFwd(audioCtrlPlay, audioCtrlBack, audioCtrlFwd);
  bindPlayBackFwd(mobileCtrlPlay, mobileCtrlBack, mobileCtrlFwd);

  document.getElementById('creatorAudioModalClose').addEventListener('click', function () {
    modal.close();
  });

  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.close();
  });

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (f) {
        uploadFile(f);
      }
      fileInput.value = '';
    });
  }
  /* Label wraps input - no extra click handler needed (was causing double file picker) */

  if (useBtn) useBtn.addEventListener('click', useSelected);

  if (muteBtn) {
    muteBtn.addEventListener('click', function () {
      state.muted = !state.muted;
      muteBtn.classList.toggle('is-muted', state.muted);
      if (state.currentAudio) state.currentAudio.volume = state.muted ? 0 : state.volume;
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', function () {
      state.volume = parseInt(volumeSlider.value, 10) / 100;
      if (state.currentAudio && !state.muted) state.currentAudio.volume = state.volume;
    });
  }

  modal.addEventListener('close', function () {
    if (state.keepAudioOnClose) {
      state.keepAudioOnClose = false;
    } else {
      stopCurrent();
      showAudioControls(false);
    }
    if (confirmModal) confirmModal.close();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (state.currentAudio && !state.currentAudio.paused) {
        state.wasPlayingBeforeHidden = true;
        state.currentAudio.pause();
      }
    } else {
      if (state.wasPlayingBeforeHidden && state.currentAudio) {
        state.wasPlayingBeforeHidden = false;
        state.currentAudio.play().catch(function () {});
      }
    }
  });

  function setTapToStartHint(show) {
    var hint = document.getElementById('creator-audio-tap-hint');
    if (show) {
      var msg = state.cameFromCreatorSwitch ? t('tap_to_start_after_switch', 'You switched to Creator – tap once to start music') : t('tap_to_start', 'Tap to start music');
      allVisualizerCanvases.forEach(function (c) {
        if (c) c.setAttribute('title', msg);
      });
      var widget = document.getElementById('creatorMobileAudioArea') || document.getElementById('creatorDesktopAudioArea');
      if (widget) widget.classList.add('creator-audio-widget--tap-to-start');
      if (!hint && widget) {
        hint = document.createElement('span');
        hint.id = 'creator-audio-tap-hint';
        hint.className = 'creator-audio-tap-hint';
        hint.textContent = msg;
        hint.setAttribute('aria-live', 'polite');
        widget.appendChild(hint);
      }
    } else {
      allVisualizerCanvases.forEach(function (c) {
        if (c) c.removeAttribute('title');
      });
      document.querySelectorAll('.creator-audio-widget--tap-to-start').forEach(function (el) { el.classList.remove('creator-audio-widget--tap-to-start'); });
      if (hint) hint.remove();
    }
  }

  function scheduleRetryOnFirstGesture() {
    if (state.pendingAutoPlay) return;
    state.pendingAutoPlay = true;
    setTapToStartHint(true);
    function onFirstGesture() {
      if (!state.pendingAutoPlay) return;
      clearPendingAutoPlay();
      tryPlayCurrentWithAnalyser();
    }
    state._firstGestureHandler = onFirstGesture;
    document.addEventListener('click', onFirstGesture, { once: true });
    document.addEventListener('touchstart', onFirstGesture, { once: true });
  }

  function doLoadActiveCreatorAudio() {
    var oid = getOwnerId();
    if (!oid) return;
    clearPendingAutoPlay();
    fetch(getApiUrl('get-creator-audio', { owner_id: oid }), { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.url) {
          stopCurrent();
          var audio = new Audio();
          audio.crossOrigin = 'anonymous';
          audio.dataset.id = data.audio_id || '';
          audio.volume = state.muted ? 0 : state.volume;
          audio.loop = true;
          audio.src = data.url;
          state.currentAudio = audio;
          state.selectedId = data.audio_id;
          attachPlayPauseListeners(audio);
          showAudioControls(true);
          updateHeaderPlayPause();
        }
      })
      .catch(function () {});
  }

  function loadActiveCreatorAudio() {
    var oid = getOwnerId();
    if (!oid) return;
    doLoadActiveCreatorAudio();
  }

  function clearPendingAutoPlay() {
    if (state._firstGestureHandler) {
      document.removeEventListener('click', state._firstGestureHandler);
      document.removeEventListener('touchstart', state._firstGestureHandler);
      state._firstGestureHandler = null;
    }
    state.pendingAutoPlay = false;
    setTapToStartHint(false);
  }

  drawStaticVisualizer();
  showAudioControls(false);

  function initAudio() {
    try {
      state.cameFromCreatorSwitch = sessionStorage.getItem('__creator_switch_to_creator') === '1';
      if (state.cameFromCreatorSwitch) sessionStorage.removeItem('__creator_switch_to_creator');
    } catch (e) {}
    loadActiveCreatorAudio();
  }

  if (document.readyState === 'complete') {
    initAudio();
  } else {
    window.addEventListener('load', initAudio);
  }

  window.CreatorAudioModal = { fetchList: fetchList, stopCurrent: stopCurrent, loadActiveCreatorAudio: loadActiveCreatorAudio, drawStaticVisualizer: drawStaticVisualizer };
  window.CreatorAudioHooks = {
    getBassLevel: function () { return state.bassLevel || 0; },
    isPlaying: function () { return !!(state.currentAudio && !state.currentAudio.paused); }
  };
})();
