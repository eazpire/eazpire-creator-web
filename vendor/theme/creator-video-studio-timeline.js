/**
 * Video Studio timeline + canvas compositor (IDEA-028)
 */
(function (global) {
  'use strict';

  var LABEL_W = 104;
  var MAX_TIMELINE_MS = 3 * 60 * 1000;
  var MAX_TRACKS = 12;
  var SEEK_THRESHOLD_PLAYING = 0.35;
  var SEEK_THRESHOLD_PAUSED = 0.03;
  var SEEK_THRESHOLD_START = 0.15;

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /** Universal tracks accept video, image, and audio on any lane. */
  function makeTrack(index, opts) {
    opts = opts || {};
    return {
      id: opts.id || uid('t'),
      type: 'any',
      name: opts.name || 'T' + (index + 1),
      clips: Array.isArray(opts.clips) ? opts.clips : [],
      volume: opts.volume != null ? opts.volume : 1,
      muted: !!opts.muted,
    };
  }

  function defaultTracks() {
    return [makeTrack(0, { id: 't1' }), makeTrack(1, { id: 't2' }), makeTrack(2, { id: 't3' })];
  }

  function ensureTrackAudioDefaults(tracks) {
    (tracks || []).forEach(function (t, i) {
      t.type = 'any';
      if (!t.id) t.id = uid('t');
      if (!t.name) t.name = 'T' + (i + 1);
      if (t.volume == null) t.volume = 1;
      if (t.muted == null) t.muted = false;
      if (!Array.isArray(t.clips)) t.clips = [];
    });
    return tracks;
  }

  function renumberTrackNames(tracks) {
    (tracks || []).forEach(function (t, i) {
      t.name = 'T' + (i + 1);
    });
    return tracks;
  }

  function createEngine(opts) {
    var api = {
      pxPerSec: opts.pxPerSec || 80,
      width: opts.width || 1920,
      height: opts.height || 1080,
      playheadMs: 0,
      durationMs: 0,
      tracks: ensureTrackAudioDefaults(defaultTracks()),
      selectedClipId: null,
      assetsById: Object.create(null),
      localUrls: Object.create(null),
      mediaEls: Object.create(null),
      playing: false,
      _raf: 0,
      _lastTs: 0,
      onChange: opts.onChange || function () {},
      onSelect: opts.onSelect || function () {},
      onClipContextMenu: opts.onClipContextMenu || function () {},
    };

    var canvas = opts.canvas;
    var ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
    var tracksEl = opts.tracksEl;
    var rulerEl = opts.rulerEl;
    var playheadEl = opts.playheadEl;
    var scrollEl = opts.scrollEl;
    var labels = opts.labels || {};

    function timelineWidthPx() {
      var secs = Math.max(api.durationMs / 1000, 10);
      return LABEL_W + secs * api.pxPerSec + 80;
    }

    function msToX(ms) {
      return LABEL_W + (ms / 1000) * api.pxPerSec;
    }

    function xToMs(x) {
      return Math.max(0, ((x - LABEL_W) / api.pxPerSec) * 1000);
    }

    function recomputeDuration() {
      var max = 0;
      api.tracks.forEach(function (t) {
        (t.clips || []).forEach(function (c) {
          var end = (c.timelineStart || 0) + ((c.end || 0) - (c.start || 0));
          if (end > max) max = end;
        });
      });
      api.durationMs = clamp(max, 0, MAX_TIMELINE_MS);
    }

    function getClip(clipId) {
      for (var i = 0; i < api.tracks.length; i++) {
        var t = api.tracks[i];
        for (var j = 0; j < t.clips.length; j++) {
          if (t.clips[j].id === clipId) return { track: t, clip: t.clips[j], trackIndex: i, clipIndex: j };
        }
      }
      return null;
    }

    function selectedClip() {
      return api.selectedClipId ? getClip(api.selectedClipId) : null;
    }

    function renderRuler() {
      if (!rulerEl) return;
      var w = timelineWidthPx();
      rulerEl.style.width = w + 'px';
      var html = '';
      var secs = Math.ceil(Math.max(api.durationMs / 1000, 10));
      for (var s = 0; s <= secs; s++) {
        var x = msToX(s * 1000);
        var m = Math.floor(s / 60);
        var ss = String(s % 60).padStart(2, '0');
        html +=
          '<span style="position:absolute;left:' +
          x +
          'px;top:0;height:100%;border-left:1px solid rgba(255,255,255,.2);padding-left:4px;font-size:10px;color:rgba(255,255,255,.55)">' +
          m +
          ':' +
          ss +
          '</span>';
      }
      rulerEl.innerHTML = html;
      rulerEl.style.position = 'relative';
    }

    function renderTracks() {
      if (!tracksEl) return;
      var w = timelineWidthPx();
      tracksEl.style.width = w + 'px';
      var html = '';
      api.tracks.forEach(function (track) {
        var trackVol = track.volume != null ? track.volume : 1;
        var trackMuted = !!track.muted;
        var muteLabel = labels.muteTrack || 'Mute track';
        var volLabel = labels.trackVolume || 'Track volume';
        html += '<div class="cvs-track" data-track-id="' + track.id + '">';
        html += '<div class="cvs-track__label">';
        html += '<span class="cvs-track__name">' + track.name + '</span>';
        html += '<div class="cvs-track__audio-controls">';
        html +=
          '<button type="button" class="cvs-track__mute' +
          (trackMuted ? ' is-muted' : '') +
          '" data-track-mute aria-pressed="' +
          (trackMuted ? 'true' : 'false') +
          '" aria-label="' +
          muteLabel +
          '" title="' +
          muteLabel +
          '">' +
          (trackMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A') +
          '</button>';
        html +=
          '<input type="range" class="cvs-track__volume" data-track-volume min="0" max="100" value="' +
          Math.round(clamp(trackVol, 0, 1) * 100) +
          '" aria-label="' +
          volLabel +
          '">';
        html += '</div>';
        html += '</div>';
        html +=
          '<div class="cvs-track__lane" data-track-lane="' +
          track.id +
          '" style="width:' +
          (w - LABEL_W) +
          'px"></div>';
        html += '</div>';
      });
      tracksEl.innerHTML = html;

      api.tracks.forEach(function (track) {
        var labelEl = tracksEl.querySelector(
          '.cvs-track[data-track-id="' + track.id + '"] .cvs-track__label'
        );
        bindTrackControls(labelEl, track);
        var lane = tracksEl.querySelector('[data-track-lane="' + track.id + '"]');
        if (!lane) return;
        (track.clips || []).forEach(function (clip) {
          var dur = Math.max(100, (clip.end || 0) - (clip.start || 0));
          var left = (clip.timelineStart || 0) / 1000 * api.pxPerSec;
          var width = dur / 1000 * api.pxPerSec;
          var asset = api.assetsById[clip.assetId] || {};
          var el = document.createElement('div');
          el.className =
            'cvs-clip' +
            (asset.kind === 'audio' ? ' is-audio' : '') +
            (asset.kind === 'image' ? ' is-image' : '') +
            (clip.id === api.selectedClipId ? ' is-selected' : '');
          el.dataset.clipId = clip.id;
          el.style.left = left + 'px';
          el.style.width = Math.max(12, width) + 'px';
          el.textContent = asset.original_name || asset.kind || clip.assetId || 'clip';
          el.draggable = false;
          el.innerHTML =
            '<span class="cvs-clip__edge cvs-clip__edge--l" data-edge="l"></span>' +
            '<span class="cvs-clip__label"></span>' +
            '<span class="cvs-clip__edge cvs-clip__edge--r" data-edge="r"></span>';
          el.querySelector('.cvs-clip__label').textContent =
            asset.original_name || asset.kind || 'clip';
          lane.appendChild(el);
          bindClipInteractions(el, track, clip);
        });
        lane.addEventListener('dragover', function (e) {
          e.preventDefault();
        });
        lane.addEventListener('drop', function (e) {
          e.preventDefault();
          var assetId = e.dataTransfer.getData('text/cvs-asset-id');
          if (!assetId) return;
          var rect = lane.getBoundingClientRect();
          var x = e.clientX - rect.left;
          var at = Math.max(0, (x / api.pxPerSec) * 1000);
          api.addClipFromAsset(assetId, track.id, at);
        });
      });

      if (playheadEl) {
        playheadEl.style.left = msToX(api.playheadMs) + 'px';
      }
    }

    function bindClipInteractions(el, track, clip) {
      el.addEventListener('mousedown', function (e) {
        if (e.button === 2) return; // right-click handled by contextmenu below
        var edge = e.target && e.target.getAttribute && e.target.getAttribute('data-edge');
        api.selectedClipId = clip.id;
        api.onSelect(clip);
        renderTracks();
        if (edge) {
          startTrim(e, clip, edge);
          return;
        }
        startMove(e, clip, function (moved) {
          if (!moved) {
            // Plain click (no drag): seek the playhead to this clip's start.
            api.setPlayhead(clip.timelineStart || 0);
            api.onChange();
          }
        });
      });
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        api.selectedClipId = clip.id;
        api.onSelect(clip);
        renderTracks();
        api.onClipContextMenu(clip, track, e);
      });
    }

    function bindTrackControls(labelEl, track) {
      if (!labelEl) return;
      var muteBtn = labelEl.querySelector('[data-track-mute]');
      var volInput = labelEl.querySelector('[data-track-volume]');
      if (muteBtn) {
        muteBtn.addEventListener('mousedown', function (e) {
          e.stopPropagation();
        });
        muteBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          api.setTrackMute(track.id, !track.muted);
          muteBtn.classList.toggle('is-muted', !!track.muted);
          muteBtn.textContent = track.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
          muteBtn.setAttribute('aria-pressed', track.muted ? 'true' : 'false');
        });
      }
      if (volInput) {
        volInput.addEventListener('mousedown', function (e) {
          e.stopPropagation();
        });
        volInput.addEventListener('input', function (e) {
          api.setTrackVolume(track.id, (Number(e.target.value) || 0) / 100);
        });
      }
    }

    function trackIndexAtClientY(clientY) {
      if (!tracksEl) return -1;
      var rows = tracksEl.querySelectorAll('.cvs-track');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i].getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) return i;
      }
      if (!rows.length) return -1;
      // Above first / below last → clamp to nearest track
      var first = rows[0].getBoundingClientRect();
      if (clientY < first.top) return 0;
      return rows.length - 1;
    }

    function moveClipToTrack(clip, targetTrack) {
      if (!clip || !targetTrack) return false;
      var found = getClip(clip.id);
      if (!found || found.track.id === targetTrack.id) return false;
      found.track.clips.splice(found.clipIndex, 1);
      targetTrack.clips.push(clip);
      return true;
    }

    function startMove(e, clip, onDone) {
      e.preventDefault();
      var startX = e.clientX;
      var startY = e.clientY;
      var orig = clip.timelineStart || 0;
      var moved = false;
      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
        clip.timelineStart = clamp(orig + (dx / api.pxPerSec) * 1000, 0, MAX_TIMELINE_MS);
        var ti = trackIndexAtClientY(ev.clientY);
        if (ti >= 0 && ti < api.tracks.length) {
          moveClipToTrack(clip, api.tracks[ti]);
        }
        recomputeDuration();
        renderTracks();
        drawFrame(api.playheadMs);
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        api.onChange();
        if (onDone) onDone(moved);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function startTrim(e, clip, edge) {
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX;
      var origStart = clip.start || 0;
      var origEnd = clip.end || 0;
      var origTl = clip.timelineStart || 0;
      var asset = api.assetsById[clip.assetId] || {};
      var maxSrc = asset.duration_ms || Math.max(origEnd, 5000);
      function onMove(ev) {
        var dx = (ev.clientX - startX) / api.pxPerSec * 1000;
        if (edge === 'l') {
          var ns = clamp(origStart + dx, 0, origEnd - 100);
          var delta = ns - origStart;
          clip.start = ns;
          clip.timelineStart = Math.max(0, origTl + delta);
        } else {
          clip.end = clamp(origEnd + dx, origStart + 100, maxSrc);
        }
        recomputeDuration();
        renderTracks();
        drawFrame(api.playheadMs);
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        api.onChange();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function ensureMedia(assetId) {
      if (api.mediaEls[assetId]) return api.mediaEls[assetId];
      var asset = api.assetsById[assetId];
      if (!asset) return null;
      var url = api.localUrls[assetId] || asset.url;
      if (!url) return null;
      var el;
      if (asset.kind === 'image') {
        el = new Image();
        el.crossOrigin = 'anonymous';
        el.src = url;
      } else if (asset.kind === 'audio') {
        el = document.createElement('audio');
        el.preload = 'auto';
        el.crossOrigin = 'anonymous';
        el.src = url;
      } else {
        el = document.createElement('video');
        el.preload = 'auto';
        // Start muted only to satisfy autoplay policies before the first user
        // gesture; drawFrame() applies the real clip/track mute + volume mix
        // on every frame once playback settings are known.
        el.muted = true;
        el.playsInline = true;
        el.crossOrigin = 'anonymous';
        el.src = url;
      }
      api.mediaEls[assetId] = el;
      return el;
    }

    function activeClipsAt(ms) {
      var list = [];
      api.tracks.forEach(function (track, ti) {
        (track.clips || []).forEach(function (clip) {
          var dur = (clip.end || 0) - (clip.start || 0);
          var a = clip.timelineStart || 0;
          var b = a + dur;
          if (ms >= a && ms < b) {
            list.push({ track: track, clip: clip, trackIndex: ti, localMs: clip.start + (ms - a) });
          }
        });
      });
      // paint V1 then V2 (overlay), audio separate
      return list.sort(function (a, b) {
        return a.trackIndex - b.trackIndex;
      });
    }

    // Keeps <video>/<audio> elements playing smoothly during playback instead
    // of scrubbing (seeking) every RAF tick, which is what caused choppy
    // preview. While playing we only correct drift once it becomes large;
    // otherwise the media element is left to decode/advance on its own so
    // the canvas draw below (which just reads the live frame) stays smooth.
    function syncMediaPlayback(media, localMs, playing) {
      var targetSec = Math.max(0, localMs / 1000);
      try {
        if (playing) {
          if (media.paused) {
            if (Math.abs((media.currentTime || 0) - targetSec) > SEEK_THRESHOLD_START) {
              media.currentTime = targetSec;
            }
            var p = media.play();
            if (p && p.catch) p.catch(function () {});
          } else if (Math.abs((media.currentTime || 0) - targetSec) > SEEK_THRESHOLD_PLAYING) {
            media.currentTime = targetSec;
          }
        } else {
          if (!media.paused) media.pause();
          if (Math.abs((media.currentTime || 0) - targetSec) > SEEK_THRESHOLD_PAUSED) {
            media.currentTime = targetSec;
          }
        }
      } catch (e) {}
    }

    function clipAudioMix(track, clip) {
      var trackVol = track.volume != null ? track.volume : 1;
      var trackMuted = !!track.muted;
      var clipVol = clip.volume != null ? clip.volume : 1;
      var clipMuted = !!clip.muted;
      var volume = clamp(trackVol, 0, 1) * clamp(clipVol, 0, 1);
      return { volume: volume, muted: trackMuted || clipMuted || volume <= 0 };
    }

    function pauseInactiveMedia(activeAssetIds) {
      Object.keys(api.mediaEls).forEach(function (assetId) {
        if (activeAssetIds[assetId]) return;
        var m = api.mediaEls[assetId];
        if (m && (m.tagName === 'VIDEO' || m.tagName === 'AUDIO') && !m.paused) {
          try {
            m.pause();
          } catch (e) {}
        }
      });
    }

    function drawFrame(ms) {
      if (!ctx || !canvas) return;
      if (canvas.width !== api.width) canvas.width = api.width;
      if (canvas.height !== api.height) canvas.height = api.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, api.width, api.height);

      var actives = activeClipsAt(ms);
      var activeAssetIds = Object.create(null);

      actives.forEach(function (item) {
        var asset = api.assetsById[item.clip.assetId];
        if (!asset) return;
        var media = ensureMedia(item.clip.assetId);
        if (!media) return;
        activeAssetIds[item.clip.assetId] = true;

        if (asset.kind === 'video' || asset.kind === 'audio') {
          var mix = clipAudioMix(item.track, item.clip);
          media.muted = mix.muted;
          media.volume = clamp(mix.volume, 0, 1);
          syncMediaPlayback(media, item.localMs, api.playing);
        }

        // Audio-only assets never paint on the canvas (any track).
        if (asset.kind === 'audio') return;
        if (asset.kind === 'video' && media.readyState < 2) return;

        var crop = item.clip.crop || { x: 0, y: 0, w: 1, h: 1 };
        var transform = item.clip.transform || { x: 0, y: 0, scale: 1 };
        var scale = Number(transform.scale) || 1;
        var ox = Number(transform.x) || 0;
        var oy = Number(transform.y) || 0;

        var mw = media.videoWidth || media.naturalWidth || asset.width || api.width;
        var mh = media.videoHeight || media.naturalHeight || asset.height || api.height;
        if (!mw || !mh) return;

        var sx = crop.x * mw;
        var sy = crop.y * mh;
        var sw = Math.max(1, crop.w * mw);
        var sh = Math.max(1, crop.h * mh);

        // cover-fit inside frame then apply scale from center
        var fit = Math.min(api.width / sw, api.height / sh);
        var dw = sw * fit * scale;
        var dh = sh * fit * scale;
        var dx = (api.width - dw) / 2 + ox;
        var dy = (api.height - dh) / 2 + oy;

        try {
          ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh);
        } catch (err) {}
      });

      pauseInactiveMedia(activeAssetIds);
    }

    function renderAll() {
      recomputeDuration();
      renderRuler();
      renderTracks();
      drawFrame(api.playheadMs);
      if (playheadEl) playheadEl.style.left = msToX(api.playheadMs) + 'px';
    }

    function tick(ts) {
      if (!api.playing) return;
      if (!api._lastTs) api._lastTs = ts;
      var dt = ts - api._lastTs;
      api._lastTs = ts;
      api.playheadMs = clamp(api.playheadMs + dt, 0, Math.max(api.durationMs, 1));
      if (api.playheadMs >= api.durationMs) {
        api.playing = false;
        api._raf = 0;
        api._lastTs = 0;
        api.onChange();
        renderAll();
        return;
      }
      drawFrame(api.playheadMs);
      if (playheadEl) playheadEl.style.left = msToX(api.playheadMs) + 'px';
      api.onChange();
      api._raf = requestAnimationFrame(tick);
    }

    api.setAssets = function (assets, localUrls) {
      api.assetsById = Object.create(null);
      (assets || []).forEach(function (a) {
        api.assetsById[a.id] = a;
      });
      api.localUrls = localUrls || api.localUrls;
      Object.keys(api.mediaEls).forEach(function (k) {
        delete api.mediaEls[k];
      });
      renderAll();
    };

    api.setProject = function (project) {
      if (!project) return;
      api.width = project.width || api.width;
      api.height = project.height || api.height;
      var draft = project.draft || {};
      api.tracks = renumberTrackNames(
        ensureTrackAudioDefaults(
          Array.isArray(draft.tracks) && draft.tracks.length ? draft.tracks : defaultTracks()
        )
      );
      api.playheadMs = Number(draft.playhead_ms) || 0;
      renderAll();
    };

    api.getDraft = function () {
      return {
        tracks: api.tracks,
        playhead_ms: api.playheadMs,
      };
    };

    api.setAspect = function (w, h) {
      api.width = w;
      api.height = h;
      renderAll();
    };

    api.setZoom = function (pxPerSec) {
      api.pxPerSec = clamp(pxPerSec, 40, 200);
      renderAll();
    };

    api.setPlayhead = function (ms) {
      api.playheadMs = clamp(ms, 0, MAX_TIMELINE_MS);
      drawFrame(api.playheadMs);
      if (playheadEl) playheadEl.style.left = msToX(api.playheadMs) + 'px';
    };

    api.togglePlay = function () {
      api.playing = !api.playing;
      if (api.playing) {
        api._lastTs = 0;
        api._raf = requestAnimationFrame(tick);
      } else {
        if (api._raf) {
          cancelAnimationFrame(api._raf);
          api._raf = 0;
        }
        // Explicitly pause any media that kept playing under the old
        // playhead position now that playback has stopped.
        drawFrame(api.playheadMs);
      }
      return api.playing;
    };

    api.addClipFromAsset = function (assetId, trackId, atMs) {
      var asset = api.assetsById[assetId];
      if (!asset) return null;
      var track = api.tracks.find(function (t) {
        return t.id === trackId;
      });
      // Universal tracks: keep the drop target. Fall back to first track only
      // when the id is missing (e.g. double-click add without a lane).
      if (!track) {
        track = api.tracks[0] || null;
      }
      if (!track) return null;

      var srcDur =
        asset.kind === 'image'
          ? 3000
          : Math.max(500, Number(asset.duration_ms) || 5000);
      var startAt = clamp(atMs || api.playheadMs || 0, 0, MAX_TIMELINE_MS);
      var clip = {
        id: uid('clip'),
        assetId: assetId,
        start: 0,
        end: Math.min(srcDur, MAX_TIMELINE_MS - startAt),
        timelineStart: startAt,
        crop: { x: 0, y: 0, w: 1, h: 1 },
        transform: { x: 0, y: 0, scale: 1 },
        volume: 1,
        muted: false,
      };
      if (startAt + (clip.end - clip.start) > MAX_TIMELINE_MS) {
        clip.end = clip.start + Math.max(100, MAX_TIMELINE_MS - startAt);
      }
      track.clips.push(clip);
      api.selectedClipId = clip.id;
      ensureMedia(assetId);
      renderAll();
      api.onSelect(clip);
      api.onChange();
      return clip;
    };

    api.deleteSelected = function () {
      var found = selectedClip();
      if (!found) return;
      found.track.clips.splice(found.clipIndex, 1);
      api.selectedClipId = null;
      renderAll();
      api.onChange();
    };

    api.duplicateSelected = function () {
      var found = selectedClip();
      if (!found) return null;
      var clip = found.clip;
      var dur = (clip.end || 0) - (clip.start || 0);
      var copy = {
        id: uid('clip'),
        assetId: clip.assetId,
        start: clip.start || 0,
        end: clip.end || 0,
        timelineStart: clamp((clip.timelineStart || 0) + dur, 0, MAX_TIMELINE_MS),
        crop: JSON.parse(JSON.stringify(clip.crop || { x: 0, y: 0, w: 1, h: 1 })),
        transform: JSON.parse(JSON.stringify(clip.transform || { x: 0, y: 0, scale: 1 })),
        volume: clip.volume != null ? clip.volume : 1,
        muted: !!clip.muted,
      };
      found.track.clips.push(copy);
      api.selectedClipId = copy.id;
      renderAll();
      api.onSelect(copy);
      api.onChange();
      return copy;
    };

    api.splitSelected = function () {
      var found = selectedClip();
      if (!found) return;
      var clip = found.clip;
      var a = clip.timelineStart || 0;
      var dur = (clip.end || 0) - (clip.start || 0);
      var b = a + dur;
      var ph = api.playheadMs;
      if (ph <= a + 50 || ph >= b - 50) return;
      var local = (clip.start || 0) + (ph - a);
      var right = {
        id: uid('clip'),
        assetId: clip.assetId,
        start: local,
        end: clip.end,
        timelineStart: ph,
        crop: JSON.parse(JSON.stringify(clip.crop || { x: 0, y: 0, w: 1, h: 1 })),
        transform: JSON.parse(JSON.stringify(clip.transform || { x: 0, y: 0, scale: 1 })),
        volume: clip.volume != null ? clip.volume : 1,
        muted: !!clip.muted,
      };
      clip.end = local;
      found.track.clips.push(right);
      renderAll();
      api.onChange();
    };

    api.updateSelectedTransform = function (partial) {
      var found = selectedClip();
      if (!found) return;
      found.clip.transform = Object.assign({}, found.clip.transform || {}, partial);
      drawFrame(api.playheadMs);
      api.onChange();
    };

    api.updateSelectedCrop = function (crop) {
      var found = selectedClip();
      if (!found) return;
      found.clip.crop = Object.assign({}, found.clip.crop || {}, crop);
      drawFrame(api.playheadMs);
      api.onChange();
    };

    api.updateSelectedAudio = function (partial) {
      var found = selectedClip();
      if (!found) return;
      if (partial && partial.volume != null) {
        found.clip.volume = clamp(Number(partial.volume), 0, 1);
      }
      if (partial && partial.muted != null) {
        found.clip.muted = !!partial.muted;
      }
      drawFrame(api.playheadMs);
      api.onChange();
    };

    api.setTrackVolume = function (trackId, vol) {
      var track = api.tracks.find(function (t) {
        return t.id === trackId;
      });
      if (!track) return;
      track.volume = clamp(Number(vol), 0, 1);
      drawFrame(api.playheadMs);
      api.onChange();
    };

    api.setTrackMute = function (trackId, muted) {
      var track = api.tracks.find(function (t) {
        return t.id === trackId;
      });
      if (!track) return;
      track.muted = !!muted;
      drawFrame(api.playheadMs);
      api.onChange();
    };

    api.getSelected = function () {
      return selectedClip();
    };

    // ── Transport: restart / jump to previous|next clip with audio ───────
    // Any track can hold audio/video; jump targets are based on asset kind.
    function audioClipStartTimes() {
      var starts = [];
      api.tracks.forEach(function (t) {
        (t.clips || []).forEach(function (c) {
          var asset = api.assetsById[c.assetId];
          if (asset && (asset.kind === 'audio' || asset.kind === 'video')) {
            starts.push(c.timelineStart || 0);
          }
        });
      });
      starts.sort(function (a, b) {
        return a - b;
      });
      return starts.filter(function (v, i) {
        return i === 0 || v !== starts[i - 1];
      });
    }

    api.addTrack = function () {
      if (api.tracks.length >= MAX_TRACKS) return null;
      var track = makeTrack(api.tracks.length);
      api.tracks.push(track);
      renumberTrackNames(api.tracks);
      renderAll();
      api.onChange();
      return track;
    };

    api.canAddTrack = function () {
      return api.tracks.length < MAX_TRACKS;
    };

    api.restartToStart = function () {
      if (api.playing) api.togglePlay();
      api.setPlayhead(0);
      api.onChange();
    };

    api.seekToNextAudioClip = function () {
      var starts = audioClipStartTimes();
      var cur = api.playheadMs;
      for (var i = 0; i < starts.length; i++) {
        if (starts[i] > cur + 1) {
          api.setPlayhead(starts[i]);
          api.onChange();
          return true;
        }
      }
      return false;
    };

    api.seekToPrevAudioClip = function () {
      var starts = audioClipStartTimes();
      var cur = api.playheadMs;
      var prev = 0;
      for (var i = starts.length - 1; i >= 0; i--) {
        if (starts[i] < cur - 1) {
          prev = starts[i];
          break;
        }
      }
      api.setPlayhead(prev);
      api.onChange();
      return true;
    };

    // ── Viewer overlay helpers (move/scale handles + crop reference) ─────
    function mediaNaturalSize(clip, asset) {
      var media = ensureMedia(clip.assetId);
      var mw = (media && (media.videoWidth || media.naturalWidth)) || (asset && asset.width) || api.width;
      var mh = (media && (media.videoHeight || media.naturalHeight)) || (asset && asset.height) || api.height;
      return { w: mw || api.width, h: mh || api.height, media: media };
    }

    // Returns the on-canvas rect (in canvas pixel space) of the currently
    // selected clip's composited image, using the same cover-fit math as
    // drawFrame() — used to position the move/scale overlay in the viewer.
    api.getSelectedClipBox = function () {
      var found = selectedClip();
      if (!found) return null;
      var asset = api.assetsById[found.clip.assetId];
      if (!asset || asset.kind === 'audio') return null;
      var natural = mediaNaturalSize(found.clip, asset);
      var crop = found.clip.crop || { x: 0, y: 0, w: 1, h: 1 };
      var transform = found.clip.transform || { x: 0, y: 0, scale: 1 };
      var scale = Number(transform.scale) || 1;
      var ox = Number(transform.x) || 0;
      var oy = Number(transform.y) || 0;
      var sw = Math.max(1, crop.w * natural.w);
      var sh = Math.max(1, crop.h * natural.h);
      var fit = Math.min(api.width / sw, api.height / sh);
      var dw = sw * fit * scale;
      var dh = sh * fit * scale;
      var dx = (api.width - dw) / 2 + ox;
      var dy = (api.height - dh) / 2 + oy;
      return { x: dx, y: dy, w: dw, h: dh, baseW: sw * fit, baseH: sh * fit };
    };

    // Draws the full, uncropped, untransformed source media letterboxed
    // ("contain" fit) into the canvas — used as the crop-mode reference
    // frame so the crop box maps 1:1 to the actual source image instead of
    // the cover-fit composited output (which caused the old crop UI to look
    // like the whole clip was translating when a handle was dragged).
    api.drawCropReferenceFrame = function (clipId) {
      var found = getClip(clipId);
      if (!found || !ctx || !canvas) return null;
      var asset = api.assetsById[found.clip.assetId];
      if (!asset) return null;
      var natural = mediaNaturalSize(found.clip, asset);
      if (canvas.width !== api.width) canvas.width = api.width;
      if (canvas.height !== api.height) canvas.height = api.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, api.width, api.height);
      var fit = Math.min(api.width / natural.w, api.height / natural.h);
      var dw = natural.w * fit;
      var dh = natural.h * fit;
      var dx = (api.width - dw) / 2;
      var dy = (api.height - dh) / 2;
      if (natural.media && !(asset.kind === 'video' && natural.media.readyState < 2)) {
        try {
          ctx.drawImage(natural.media, 0, 0, natural.w, natural.h, dx, dy, dw, dh);
        } catch (e) {}
      }
      return { x: dx, y: dy, w: dw, h: dh };
    };

    api.render = renderAll;
    api.drawFrame = drawFrame;

    if (scrollEl && playheadEl) {
      scrollEl.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.cvs-clip')) return;
        var rect = scrollEl.getBoundingClientRect();
        var x = e.clientX - rect.left + scrollEl.scrollLeft;
        api.setPlayhead(xToMs(x));
        api.onChange();
      });
    }

    renderAll();
    return api;
  }

  global.CreatorVideoStudioTimeline = {
    create: createEngine,
    MAX_TIMELINE_MS: MAX_TIMELINE_MS,
    MAX_TRACKS: MAX_TRACKS,
  };
})(window);
