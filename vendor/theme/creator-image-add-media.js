/**
 * Shared image Add-media + Add-from-link (with Extract + desktop QR) — IDEA-044
 * Used by Hero Generator and Character Generator (Model/Character + Background slots).
 */
(function () {
  'use strict';

  var API_BASE =
    window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL
      ? window.CREATOR_API_CONFIG.BASE_URL + '/apps/creator-dispatch'
      : 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';

  var activeCb = null; // { onUrl(url), onFile(file), purpose, label }
  var linkExtracted = null;
  var linkPhonePollTimer = null;
  var linkPhoneSessionId = null;
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

  function closeAddSource() {
    var overlay = document.getElementById('cimgAddSourceModal');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openAddSource(opts) {
    activeCb = opts || null;
    bindUi();
    var overlay = document.getElementById('cimgAddSourceModal');
    if (!overlay) return;
    var phoneBtn = document.getElementById('cimg-addsrc-phone');
    if (phoneBtn) phoneBtn.hidden = !isDesktopViewport();
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

  function showLinkPreview(url) {
    var wrap = document.getElementById('cimg-link-preview');
    var img = document.getElementById('cimg-link-preview-image');
    if (!wrap || !img) return;
    if (!url) {
      wrap.hidden = true;
      img.hidden = true;
      img.removeAttribute('src');
      return;
    }
    img.src = url;
    img.hidden = false;
    wrap.hidden = false;
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
    linkExtracted = { url: raw, kind: 'image' };
    setLinkStatus(i18n('link_extract_ready', 'Ready — tap Download to use this image.'), 'is-success');
    setDownloadEnabled(true);
    showLinkPreview(raw);
  }

  async function submitLinkDownload() {
    if (!linkExtracted || !linkExtracted.url) {
      setLinkStatus(i18n('link_extract_first', 'Extract a link first.'), '');
      return;
    }
    var url = linkExtracted.url;
    setLinkStatus(i18n('link_downloading', 'Downloading…'), 'is-info');
    try {
      // Prefer ingest into assets library when available
      var owner = getOwnerId();
      if (owner) {
        var res = await fetch(API_BASE + '?op=video-studio-link-ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ owner_id: owner, url: url, format: 'image' }),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (data.ok && data.asset && data.asset.url) {
          closeLinkModal();
          closeAddSource();
          deliverUrl(data.asset.url);
          return;
        }
      }
      // Direct URL fallback for images
      closeLinkModal();
      closeAddSource();
      deliverUrl(url);
    } catch (e) {
      closeLinkModal();
      closeAddSource();
      deliverUrl(url);
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
      // upload then callback
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
    if (
      window.CreatorVideoStudioModal &&
      typeof window.CreatorVideoStudioModal.openLibraryPicker === 'function'
    ) {
      window.CreatorVideoStudioModal.openLibraryPicker({
        kind: 'image',
        onPick: function (asset) {
          if (asset && asset.url) {
            closeAddSource();
            deliverUrl(asset.url);
          }
        },
      });
      return;
    }
    // Fallback: device
    triggerDevice();
  }

  function triggerDevice() {
    var input = document.getElementById('cimg-device-input');
    if (input) input.click();
  }

  async function pasteFromClipboard() {
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
    on('cimg-addsrc-assets', 'click', function () {
      // Keep Add media open underneath Assets / Link / Phone children
      openAssetsPicker();
    });
    on('cimg-addsrc-device', 'click', function () {
      triggerDevice();
    });
    on('cimg-addsrc-phone', 'click', function () {
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

    // Phone upload bridge for hero/character when phone modal completes with image URL
    window.__eazImageAddMediaPhoneApply = function (imageUrl) {
      if (!imageUrl || !activeCb) return false;
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
    uploadFile: uploadFile,
  };
})();
