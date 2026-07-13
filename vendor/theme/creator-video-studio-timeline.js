/**
 * Video Studio timeline + canvas compositor (IDEA-028)
 */
(function (global) {
  'use strict';

  var LABEL_W = 48;
  var MAX_TIMELINE_MS = 3 * 60 * 1000;

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function defaultTracks() {
    return [
      { id: 'v1', type: 'video', name: 'V1', clips: [] },
      { id: 'v2', type: 'video', name: 'V2', clips: [] },
      { id: 'a1', type: 'audio', name: 'A1', clips: [] },
    ];
  }

  function createEngine(opts) {
    var api = {
      pxPerSec: opts.pxPerSec || 80,
      width: opts.width || 1920,
      height: opts.height || 1080,
      playheadMs: 0,
      durationMs: 0,
      tracks: defaultTracks(),
      selectedClipId: null,
      assetsById: Object.create(null),
      localUrls: Object.create(null),
      mediaEls: Object.create(null),
      playing: false,
      _raf: 0,
      _lastTs: 0,
      onChange: opts.onChange || function () {},
      onSelect: opts.onSelect || function () {},
    };

    var canvas = opts.canvas;
    var ctx = canvas ? canvas.getContext('2d') : null;
    var tracksEl = opts.tracksEl;
    var rulerEl = opts.rulerEl;
    var playheadEl = opts.playheadEl;
    var scrollEl = opts.scrollEl;

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
        html += '<div class="cvs-track" data-track-id="' + track.id + '">';
        html += '<div class="cvs-track__label">' + track.name + '</div>';
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
            (track.type === 'audio' ? ' is-audio' : '') +
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
        var edge = e.target && e.target.getAttribute && e.target.getAttribute('data-edge');
        api.selectedClipId = clip.id;
        api.onSelect(clip);
        renderTracks();
        if (edge) {
          startTrim(e, clip, edge);
          return;
        }
        startMove(e, clip);
      });
    }

    function startMove(e, clip) {
      e.preventDefault();
      var startX = e.clientX;
      var orig = clip.timelineStart || 0;
      function onMove(ev) {
        var dx = ev.clientX - startX;
        clip.timelineStart = clamp(orig + (dx / api.pxPerSec) * 1000, 0, MAX_TIMELINE_MS);
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

    function drawFrame(ms) {
      if (!ctx || !canvas) return;
      canvas.width = api.width;
      canvas.height = api.height;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, api.width, api.height);

      var actives = activeClipsAt(ms);
      actives.forEach(function (item) {
        if (item.track.type === 'audio') return;
        var asset = api.assetsById[item.clip.assetId];
        if (!asset) return;
        var media = ensureMedia(item.clip.assetId);
        if (!media) return;

        var crop = item.clip.crop || { x: 0, y: 0, w: 1, h: 1 };
        var transform = item.clip.transform || { x: 0, y: 0, scale: 1 };
        var scale = Number(transform.scale) || 1;
        var ox = Number(transform.x) || 0;
        var oy = Number(transform.y) || 0;

        if (asset.kind === 'video' && media.readyState >= 2) {
          try {
            if (Math.abs((media.currentTime || 0) - item.localMs / 1000) > 0.08) {
              media.currentTime = item.localMs / 1000;
            }
          } catch (e) {}
        }

        var mw = media.videoWidth || media.naturalWidth || asset.width || api.width;
        var mh = media.videoHeight || media.naturalHeight || asset.height || api.height;
        if (!mw || !mh) return;

        var sx = crop.x * mw;
        var sy = crop.y * mh;
        var sw = Math.max(1, crop.w * mw);
        var sh = Math.max(1, crop.h * mh);

        var dw = api.width * scale;
        var dh = (sw / sh ? (api.width * (sh / sw)) : api.height) * scale;
        // cover-fit inside frame then apply scale from center
        var fit = Math.min(api.width / sw, api.height / sh);
        dw = sw * fit * scale;
        dh = sh * fit * scale;
        var dx = (api.width - dw) / 2 + ox;
        var dy = (api.height - dh) / 2 + oy;

        try {
          ctx.drawImage(media, sx, sy, sw, sh, dx, dy, dw, dh);
        } catch (err) {}
      });

      // sync audio elements
      api.tracks.forEach(function (track) {
        if (track.type !== 'audio') return;
        (track.clips || []).forEach(function (clip) {
          var media = ensureMedia(clip.assetId);
          if (!media) return;
          var dur = (clip.end || 0) - (clip.start || 0);
          var a = clip.timelineStart || 0;
          var b = a + dur;
          var vol = clip.volume != null ? clip.volume : 1;
          media.volume = clamp(vol, 0, 1);
          if (api.playing && ms >= a && ms < b) {
            var local = (clip.start || 0) + (ms - a);
            try {
              if (Math.abs((media.currentTime || 0) - local / 1000) > 0.12) {
                media.currentTime = local / 1000;
              }
              if (media.paused) media.play().catch(function () {});
            } catch (e) {}
          } else if (!media.paused) {
            media.pause();
          }
        });
      });
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
      api.tracks = Array.isArray(draft.tracks) && draft.tracks.length ? draft.tracks : defaultTracks();
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
      } else if (api._raf) {
        cancelAnimationFrame(api._raf);
        api._raf = 0;
      }
      return api.playing;
    };

    api.addClipFromAsset = function (assetId, trackId, atMs) {
      var asset = api.assetsById[assetId];
      if (!asset) return null;
      var track = api.tracks.find(function (t) {
        return t.id === trackId;
      });
      if (!track) return null;
      if (asset.kind === 'audio' && track.type !== 'audio') {
        track = api.tracks.find(function (t) {
          return t.type === 'audio';
        });
      }
      if (asset.kind !== 'audio' && track.type === 'audio') {
        track = api.tracks.find(function (t) {
          return t.type === 'video';
        });
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

    api.getSelected = function () {
      return selectedClip();
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

  global.CreatorVideoStudioTimeline = { create: createEngine, MAX_TIMELINE_MS: MAX_TIMELINE_MS };
})(window);
