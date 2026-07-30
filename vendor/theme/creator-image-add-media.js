/**
 * Shared image Add-media + Add-from-link (with Extract + desktop QR) — IDEA-044
 * Used by Hero Generator and Character Generator (Model/Character + Background slots).
 * Character Model/Background: Image | Video Scene tabs → frame capture → Assets.
 */
(function () {
  'use strict';

  var API_BASE =
    window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';

  var VIDEO_SCENE_TITLE = 'Video Scene Image';
  var activeCb = null; // { onUrl(url), onFile(file), purpose, label }
  var mediaMode = 'image'; // 'image' | 'video-scene'
  var linkExtracted = null;
  var linkPhonePollTimer = null;
  var linkPhoneSessionId = null;
  var sceneObjectUrl = null;
  var sceneBusy = false;
  var bound = false;

  function i18n(key, fallback) {
    try {
      var vs = window.CreatorI18n && window.CreatorI18n.video_studio;
      if (vs && vs[key]) return String(vs[key]);
      var vg = window.CreatorI18n && window.CreatorI18n.video_generator;
      if (vg && vg[key]) return String(vg[key]);
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

  function isDesktopViewport() {
    try {
      return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
    } catch (e) {
      return window.innerWidth >= 900;
    }
  }

  function supportsVideoSceneTabs(purpose) {
    var p = String(purpose || '');
    return p === 'character-model' || p === 'character-background';
  }

  function isVideoSceneMode() {
    return mediaMode === 'video-scene';
  }

  function phoneBridgeApiBase() {
    try {
      if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) {
        return String(window.CREATOR_API_CONFIG.BASE_URL).replace(/\/$/, '');
      }
    } catch (e) {}
    return 'https://creator-engine.eazpire.workers.dev';
  }

  function fetchPhoneBridgeJson(url, options) {
    return fetch(url, options || {}).then(function (r) {
      return r.json().catch(function () {
        return {};
      }).then(function (data) {
        return { httpOk: r.ok, data: data };
      });
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function setHint(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function syncModeUi() {
    var tabs = document.getElementById('cimg-addsrc-tabs');
    var showTabs = !!(activeCb && supportsVideoSceneTabs(activeCb.purpose));
    if (tabs) tabs.hidden = !showTabs;

    var imageTab = document.getElementById('cimg-addsrc-tab-image');
    var videoTab = document.getElementById('cimg-addsrc-tab-video-scene');
    if (imageTab) {
      imageTab.classList.toggle('is-active', mediaMode === 'image');
      imageTab.setAttribute('aria-selected', mediaMode === 'image' ? 'true' : 'false');
    }
    if (videoTab) {
      videoTab.classList.toggle('is-active', mediaMode === 'video-scene');
      videoTab.setAttribute('aria-selected', mediaMode === 'video-scene' ? 'true' : 'false');
    }

    var pasteBtn = document.getElementById('cimg-addsrc-paste');
    if (pasteBtn) pasteBtn.hidden = isVideoSceneMode();

    var phoneBtn = document.getElementById('cimg-addsrc-phone');
    if (phoneBtn) {
      // Phone upload is image-only today; hide on Video Scene.
      phoneBtn.hidden = isVideoSceneMode() || !isDesktopViewport();
    }

    if (isVideoSceneMode()) {
      setHint('cimg-addsrc-assets-hint', i18n('add_source_assets_hint_video', 'Pick a video from your library'));
      setHint('cimg-addsrc-device-hint', i18n('add_source_device_hint_video', 'Upload a video from this device'));
      setHint('cimg-addsrc-link-hint', i18n('add_source_link_hint_video', 'Paste a video URL'));
    } else {
      setHint('cimg-addsrc-assets-hint', i18n('add_source_assets_hint', 'Your uploaded library'));
      setHint('cimg-addsrc-device-hint', i18n('add_source_device_hint', 'Upload from this device'));
      setHint('cimg-addsrc-link-hint', i18n('add_source_link_hint', 'Paste a media URL'));
      setHint('cimg-addsrc-phone-hint', i18n('add_source_phone_hint', 'Scan a QR code to upload'));
    }
  }

  function setMediaMode(mode) {
    mediaMode = mode === 'video-scene' ? 'video-scene' : 'image';
    syncModeUi();
  }

  function closeAddSource() {
    var overlay = document.getElementById('cimgAddSourceModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openAddSource(opts) {
    activeCb = opts || null;
    mediaMode = 'image';
    bindUi();
    syncModeUi();
    var overlay = document.getElementById('cimgAddSourceModal');
    if (!overlay) return;
    var phoneBtn = document.getElementById('cimg-addsrc-phone');
    if (phoneBtn && !isVideoSceneMode()) phoneBtn.hidden = !isDesktopViewport();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
  }

  function stopLinkPhoneBridge() {
    if (linkPhonePollTimer) {
      clearInterval(linkPhonePollTimer);
      linkPhonePollTimer = null;
    }
    linkPhoneSessionId = null;
  }

  function setLinkStatus(msg, kind) {
    var status = document.getElementById('cimg-link-status');
    if (!status) return;
    status.textContent = msg || '';
    status.className = 'cvs-link-status' + (kind ? ' ' + kind : '');
  }

  function setDownloadEnabled(on) {
    var btn = document.getElementById('cimg-link-submit');
    if (btn) btn.disabled = !on;
  }

  function showLinkPreview(url, kind) {
    var wrap = document.getElementById('cimg-link-preview');
    var img = document.getElementById('cimg-link-preview-image');
    var video = document.getElementById('cimg-link-preview-video');
    if (!wrap) return;
    if (img) {
      img.hidden = true;
      img.removeAttribute('src');
    }
    if (video) {
      try {
        video.pause();
      } catch (e) {}
      video.hidden = true;
      video.removeAttribute('src');
      try {
        video.load();
      } catch (e2) {}
    }
    if (!url) {
      wrap.hidden = true;
      return;
    }
    if (kind === 'video' && video) {
      video.src = url;
      video.hidden = false;
      wrap.hidden = false;
      return;
    }
    if (img) {
      img.src = url;
      img.hidden = false;
      wrap.hidden = false;
    }
  }

  function closeLinkModal() {
    stopLinkPhoneBridge();
    linkExtracted = null;
    setDownloadEnabled(false);
    showLinkPreview(null);
    var overlay = document.getElementById('cimgLinkModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openLinkModal() {
    bindUi();
    linkExtracted = null;
    setDownloadEnabled(false);
    showLinkPreview(null);
    setLinkStatus('', '');
    var input = document.getElementById('cimg-link-url');
    if (input) input.value = '';
    var phoneStatus = document.getElementById('cimg-link-phone-status');
    if (phoneStatus) phoneStatus.textContent = '';
    var overlay = document.getElementById('cimgLinkModal');
    if (!overlay) return;
    var phoneBox = document.getElementById('cimg-link-phone');
    if (phoneBox) phoneBox.hidden = !isDesktopViewport();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    if (isDesktopViewport()) startLinkPhoneBridge();
    if (input) setTimeout(function () { input.focus(); }, 0);
  }

  function applyPhoneLinkValue(value) {
    var urlInput = document.getElementById('cimg-link-url');
    var phoneStatus = document.getElementById('cimg-link-phone-status');
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
    var box = document.getElementById('cimg-link-phone');
    var qrImg = document.getElementById('cimg-link-qr-img');
    var phoneStatus = document.getElementById('cimg-link-phone-status');
    if (!box || !isDesktopViewport()) return;
    stopLinkPhoneBridge();
    if (qrImg) {
      qrImg.removeAttribute('src');
      qrImg.alt = '';
    }
    var ownerId = getOwnerId();
    if (!ownerId) {
      if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      return;
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_starting', 'Preparing phone scan…');
    var base = phoneBridgeApiBase();
    fetchPhoneBridgeJson(base + '/api/creator-phone-upload/session', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_id: ownerId, purpose: 'image_link' }),
    })
      .then(function (res) {
        var session = res.data;
        if (!res.httpOk || !session || !session.ok || !session.session_id) {
          if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
          return;
        }
        linkPhoneSessionId = session.session_id;
        if (qrImg) {
          qrImg.alt = 'Phone scan QR';
          qrImg.src =
            base +
            '/api/creator-phone-upload/qr-image?session=' +
            encodeURIComponent(session.session_id) +
            '&t=' +
            String(Date.now());
        }
        if (phoneStatus) phoneStatus.textContent = i18n('link_phone_ready', 'Scan the QR code with your phone');
        linkPhonePollTimer = setInterval(function () {
          pollLinkPhoneSession(session.session_id, ownerId);
        }, 2000);
        pollLinkPhoneSession(session.session_id, ownerId);
      })
      .catch(function () {
        if (phoneStatus) phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      });
  }

  function submitLinkExtract() {
    var input = document.getElementById('cimg-link-url');
    var raw = input ? String(input.value || '').trim() : '';
    if (!raw || !/^https?:\/\//i.test(raw)) {
      setLinkStatus(i18n('link_error_invalid_url', 'Please enter a valid URL.'), '');
      linkExtracted = null;
      setDownloadEnabled(false);
      showLinkPreview(null);
      return;
    }
    var kind = isVideoSceneMode() ? 'video' : 'image';
    linkExtracted = { url: raw, kind: kind, format: kind === 'video' ? 'mp4' : 'image' };
    setLinkStatus(
      kind === 'video'
        ? i18n('link_extract_ready_video', 'Ready — tap Download to open the scene picker.')
        : i18n('link_extract_ready', 'Ready — tap Download to use this image.'),
      'is-success'
    );
    setDownloadEnabled(true);
    showLinkPreview(raw, kind);
  }

  async function pollLinkIngestStatus(assetId) {
    var maxAttempts = 90;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && attempt % 3 === 0) {
        setLinkStatus(i18n('link_processing', 'Downloading media in the background…'), 'is-info');
      }
      var res = await fetch(
        API_BASE + '?op=video-studio-link-ingest-status&asset_id=' + encodeURIComponent(assetId),
        { credentials: 'include' }
      );
      var data = await res.json().catch(function () {
        return { ok: false };
      });
      if (data.status === 'ready' && data.asset) {
        return { ok: true, asset: data.asset };
      }
      if (data.status === 'failed') {
        return { ok: false, data: data };
      }
      if (!data.ok && data.error && data.error !== 'asset_not_found') {
        return { ok: false, data: data };
      }
      await sleep(2000);
    }
    return { ok: false, data: { error: 'timeout' } };
  }

  async function submitLinkDownload() {
    if (!linkExtracted || !linkExtracted.url) {
      setLinkStatus(i18n('link_extract_first', 'Extract a link first.'), '');
      return;
    }
    var url = linkExtracted.url;
    var wantVideo = isVideoSceneMode() || linkExtracted.kind === 'video';
    setLinkStatus(i18n('link_downloading', 'Downloading…'), 'is-info');
    setDownloadEnabled(false);
    try {
      var owner = getOwnerId();
      if (owner) {
        var res = await fetch(API_BASE + '?op=video-studio-link-ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            owner_id: owner,
            url: url,
            format: wantVideo ? 'mp4' : 'image',
          }),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (data.ok && data.asset && data.asset.url) {
          closeLinkModal();
          if (wantVideo) {
            openScenePicker({ url: data.asset.url });
          } else {
            closeAddSource();
            deliverUrl(data.asset.url);
          }
          return;
        }
        if (data.ok && data.asset_id && (data.status === 'queued' || data.status === 'processing')) {
          setLinkStatus(i18n('link_queued', 'Import queued — preparing download…'), 'is-info');
          var polled = await pollLinkIngestStatus(data.asset_id);
          if (polled.ok && polled.asset && polled.asset.url) {
            closeLinkModal();
            if (wantVideo) {
              openScenePicker({ url: polled.asset.url });
            } else {
              closeAddSource();
              deliverUrl(polled.asset.url);
            }
            return;
          }
          setLinkStatus(i18n('link_error_generic', 'Could not add media from that link.'), '');
          setDownloadEnabled(true);
          return;
        }
      }
      if (wantVideo) {
        closeLinkModal();
        openScenePicker({ url: url });
        return;
      }
      closeLinkModal();
      closeAddSource();
      deliverUrl(url);
    } catch (e) {
      if (wantVideo) {
        closeLinkModal();
        openScenePicker({ url: url });
        return;
      }
      closeLinkModal();
      closeAddSource();
      deliverUrl(url);
    } finally {
      setDownloadEnabled(true);
    }
  }

  function revokeSceneObjectUrl() {
    if (sceneObjectUrl) {
      try {
        URL.revokeObjectURL(sceneObjectUrl);
      } catch (e) {}
      sceneObjectUrl = null;
    }
  }

  function setSceneStatus(msg, kind) {
    var el = document.getElementById('cimg-scene-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'cimg-scene-status' + (kind ? ' ' + kind : '');
  }

  function setSceneUseEnabled(on) {
    var btn = document.getElementById('cimg-scene-use');
    if (btn) btn.disabled = !on || sceneBusy;
  }

  function closeScenePicker() {
    var overlay = document.getElementById('cimgScenePickerModal');
    var video = document.getElementById('cimg-scene-video');
    if (video) {
      try {
        video.pause();
      } catch (e) {}
      video.removeAttribute('crossOrigin');
      video.removeAttribute('src');
      try {
        video.load();
      } catch (e2) {}
    }
    revokeSceneObjectUrl();
    sceneBusy = false;
    setSceneStatus('', '');
    setSceneUseEnabled(false);
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function openScenePicker(opts) {
    bindUi();
    opts = opts || {};
    var overlay = document.getElementById('cimgScenePickerModal');
    var video = document.getElementById('cimg-scene-video');
    var scrub = document.getElementById('cimg-scene-scrub');
    if (!overlay || !video) return;

    revokeSceneObjectUrl();
    sceneBusy = false;
    setSceneStatus(i18n('scene_picker_loading', 'Loading video…'), 'is-info');
    setSceneUseEnabled(false);
    if (scrub) scrub.value = '0';

    var src = opts.url || null;
    if (opts.file) {
      sceneObjectUrl = URL.createObjectURL(opts.file);
      src = sceneObjectUrl;
    }
    if (!src) {
      setSceneStatus(i18n('scene_picker_no_video', 'No video available.'), '');
      return;
    }

    // Remote CDN frames need CORS for canvas capture.
    if (!opts.file && /^https?:\/\//i.test(src)) {
      video.crossOrigin = 'anonymous';
    } else {
      video.removeAttribute('crossOrigin');
    }
    video.src = src;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');

    var onMeta = function () {
      video.removeEventListener('loadedmetadata', onMeta);
      if (scrub && video.duration && isFinite(video.duration)) {
        scrub.max = String(Math.max(1, Math.floor(video.duration * 1000)));
        scrub.value = '0';
      }
      try {
        video.currentTime = 0;
      } catch (e) {}
      setSceneStatus(i18n('scene_picker_ready', 'Scrub to the frame you want, then use this scene.'), 'is-success');
      setSceneUseEnabled(true);
    };
    var onErr = function () {
      video.removeEventListener('error', onErr);
      setSceneStatus(i18n('scene_picker_load_failed', 'Could not load this video. Try another source.'), '');
      setSceneUseEnabled(false);
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
    try {
      video.load();
    } catch (e3) {}
  }

  function onSceneScrub() {
    var video = document.getElementById('cimg-scene-video');
    var scrub = document.getElementById('cimg-scene-scrub');
    if (!video || !scrub || !video.duration || !isFinite(video.duration)) return;
    var ms = Number(scrub.value) || 0;
    var t = Math.min(Math.max(0, ms / 1000), Math.max(0, video.duration - 0.05));
    try {
      video.pause();
      video.currentTime = t;
    } catch (e) {}
  }

  function blobToFile(blob, name, mime) {
    try {
      return new File([blob], name, { type: mime || blob.type || 'image/png' });
    } catch (e) {
      blob.name = name;
      return blob;
    }
  }

  async function uploadSceneImageBlob(blob, width, height) {
    var name = VIDEO_SCENE_TITLE + '.png';
    var file = blobToFile(blob, name, 'image/png');
    if (
      window.CreatorVideoStudioModal &&
      typeof window.CreatorVideoStudioModal.uploadBlobAsAsset === 'function'
    ) {
      try {
        var asset = await window.CreatorVideoStudioModal.uploadBlobAsAsset(file, {
          name: name,
          mime: 'image/png',
          width: width || null,
          height: height || null,
        });
        if (asset && asset.url) return asset.url;
      } catch (e) {
        console.warn('[CreatorImageAddMedia] uploadBlobAsAsset failed', e);
      }
    }
    try {
      var fd = new FormData();
      fd.append('file', file, name);
      if (width) fd.append('width', String(width));
      if (height) fd.append('height', String(height));
      var res = await fetch(API_BASE + '?op=video-studio-asset-upload-simple', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data.ok && data.asset && data.asset.url) return data.asset.url;
    } catch (e2) {
      console.warn('[CreatorImageAddMedia] asset upload-simple failed', e2);
    }
    return uploadFile(file);
  }

  async function useSelectedScene() {
    var video = document.getElementById('cimg-scene-video');
    var useBtn = document.getElementById('cimg-scene-use');
    if (!video || !video.videoWidth || sceneBusy) {
      setSceneStatus(i18n('scene_picker_no_frame', 'No video frame available yet.'), '');
      return;
    }
    sceneBusy = true;
    setSceneUseEnabled(false);
    if (useBtn) useBtn.disabled = true;
    setSceneStatus(i18n('scene_picker_saving', 'Saving scene image…'), 'is-info');
    try {
      try {
        video.pause();
      } catch (e) {}
      var width = video.videoWidth;
      var height = video.videoHeight;
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, width, height);
      var blob = await new Promise(function (resolve) {
        canvas.toBlob(function (b) {
          resolve(b);
        }, 'image/png');
      });
      if (!blob) throw new Error('capture_failed');
      var url = await uploadSceneImageBlob(blob, width, height);
      if (!url) throw new Error('upload_failed');
      closeScenePicker();
      closeAddSource();
      deliverUrl(url);
    } catch (err) {
      console.warn('[CreatorImageAddMedia] scene capture failed', err);
      setSceneStatus(
        i18n(
          'scene_picker_save_failed',
          'Could not save this scene. Try another frame or a different video.'
        ),
        ''
      );
      sceneBusy = false;
      setSceneUseEnabled(true);
    }
  }

  function deliverUrl(url) {
    if (activeCb && typeof activeCb.onUrl === 'function') {
      activeCb.onUrl(String(url));
    }
  }

  function deliverFile(file) {
    closeAddSource();
    if (activeCb && typeof activeCb.onFile === 'function') {
      activeCb.onFile(file);
    } else if (file && activeCb && typeof activeCb.onUrl === 'function') {
      uploadFile(file).then(function (url) {
        if (url) activeCb.onUrl(url);
      });
    }
  }

  async function uploadFile(file) {
    var owner = getOwnerId();
    if (!owner || !file) return null;
    var fd = new FormData();
    fd.append('image', file, file.name || 'image.jpg');
    try {
      var res = await fetch(API_BASE + '?op=upload-hero-image&owner_id=' + encodeURIComponent(owner), {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      var data = await res.json().catch(function () {
        return {};
      });
      return data.ok && (data.image_url || data.url) ? data.image_url || data.url : null;
    } catch (e) {
      return null;
    }
  }

  function openAssetsPicker() {
    var kind = isVideoSceneMode() ? 'video' : 'image';
    if (
      window.CreatorVideoStudioModal &&
      typeof window.CreatorVideoStudioModal.openLibraryPicker === 'function'
    ) {
      window.CreatorVideoStudioModal.openLibraryPicker({
        kind: kind,
        onPick: function (asset) {
          if (!asset || !asset.url) return;
          if (isVideoSceneMode()) {
            openScenePicker({ url: asset.url });
            return;
          }
          closeAddSource();
          deliverUrl(asset.url);
        },
      });
      return;
    }
    triggerDevice();
  }

  function triggerDevice() {
    var input = document.getElementById(isVideoSceneMode() ? 'cimg-device-video-input' : 'cimg-device-input');
    if (input) input.click();
  }

  async function pasteFromClipboard() {
    if (isVideoSceneMode()) return;
    var api = window.EazClipboardImage;
    if (!api || typeof api.start !== 'function') return;
    var pasteBtn = document.getElementById('cimg-addsrc-paste');
    var file = await api.start({ pasteBtn: pasteBtn, toast: false });
    if (!file) return;
    closeAddSource();
    deliverFile(file);
  }

  function bindUi() {
    if (bound) return;
    bound = true;

    function on(id, evt, fn) {
      var el = document.getElementById(id);
      if (el && !el._cimgBound) {
        el._cimgBound = true;
        el.addEventListener(evt, fn);
      }
    }

    on('cimg-addsrc-cancel', 'click', closeAddSource);
    on('cimgAddSourceModal', 'mousedown', function (e) {
      if (e.target && e.target.id === 'cimgAddSourceModal') closeAddSource();
    });
    on('cimg-addsrc-tab-image', 'click', function () {
      setMediaMode('image');
    });
    on('cimg-addsrc-tab-video-scene', 'click', function () {
      setMediaMode('video-scene');
    });
    on('cimg-addsrc-assets', 'click', function () {
      // Keep Add media open underneath Assets / Link / Phone children
      openAssetsPicker();
    });
    on('cimg-addsrc-device', 'click', function () {
      triggerDevice();
    });
    on('cimg-addsrc-phone', 'click', function () {
      if (isVideoSceneMode()) return;
      if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === 'function') {
        window.CreatorPhoneUploadModal.open({
          purpose: 'hero-image',
          onComplete: function (url) {
            if (url) {
              closeAddSource();
              deliverUrl(url);
            }
          },
        });
      }
    });
    on('cimg-addsrc-link', 'click', function () {
      openLinkModal();
    });
    on('cimg-addsrc-paste', 'click', function () {
      pasteFromClipboard();
    });

    on('cimg-link-cancel', 'click', closeLinkModal);
    on('cimgLinkModal', 'mousedown', function (e) {
      if (e.target && e.target.id === 'cimgLinkModal') closeLinkModal();
    });
    on('cimg-link-extract', 'click', submitLinkExtract);
    on('cimg-link-submit', 'click', function () {
      submitLinkDownload();
    });
    on('cimg-link-url', 'keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitLinkExtract();
      }
    });

    on('cimg-scene-cancel', 'click', closeScenePicker);
    on('cimgScenePickerModal', 'mousedown', function (e) {
      if (e.target && e.target.id === 'cimgScenePickerModal') closeScenePicker();
    });
    on('cimg-scene-use', 'click', function () {
      useSelectedScene();
    });
    on('cimg-scene-scrub', 'input', onSceneScrub);
    on('cimg-scene-scrub', 'change', onSceneScrub);

    var deviceInput = document.getElementById('cimg-device-input');
    if (deviceInput && !deviceInput._cimgBound) {
      deviceInput._cimgBound = true;
      deviceInput.addEventListener('change', function () {
        var file = deviceInput.files && deviceInput.files[0];
        deviceInput.value = '';
        if (!file || !String(file.type || '').startsWith('image/')) return;
        deliverFile(file);
      });
    }

    var videoInput = document.getElementById('cimg-device-video-input');
    if (videoInput && !videoInput._cimgBound) {
      videoInput._cimgBound = true;
      videoInput.addEventListener('change', function () {
        var file = videoInput.files && videoInput.files[0];
        videoInput.value = '';
        if (!file) return;
        var type = String(file.type || '');
        var name = String(file.name || '').toLowerCase();
        var looksVideo =
          type.indexOf('video/') === 0 ||
          /\.(mp4|webm|mov|m4v|mkv)$/i.test(name);
        if (!looksVideo) {
          setSceneStatus(i18n('scene_picker_need_video', 'Please choose a video file.'), '');
          return;
        }
        openScenePicker({ file: file });
      });
    }

    // Phone upload bridge for hero/character when phone modal completes with image URL
    window.__eazImageAddMediaPhoneApply = function (imageUrl) {
      if (!imageUrl || !activeCb) return false;
      if (isVideoSceneMode()) return false;
      closeAddSource();
      deliverUrl(imageUrl);
      return true;
    };
  }

  /**
   * Open Add media chooser for an image slot.
   * opts: { onUrl(url), onFile(file), purpose }
   */
  function open(opts) {
    openAddSource(opts || {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi);
  } else {
    bindUi();
  }

  window.CreatorImageAddMedia = {
    open: open,
    openLink: openLinkModal,
    close: closeAddSource,
    closeLink: closeLinkModal,
    closeScene: closeScenePicker,
    uploadFile: uploadFile,
  };
})();
