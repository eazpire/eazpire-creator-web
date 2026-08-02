/**
 * Upload source — add image from URL (+ desktop QR to paste link from phone).
 */
(function () {
  'use strict';

  var MODAL_ID = 'upload-source-link-modal';
  var linkCtx = null;
  var linkReadyUrl = null;
  var phonePollTimer = null;
  var phoneSessionId = null;
  var bound = false;

  function i18n(key, fallback) {
    try {
      var us = window.CreatorI18n && window.CreatorI18n.upload_source;
      if (us && us[key]) return String(us[key]);
      var vs = window.CreatorI18n && window.CreatorI18n.video_studio;
      if (vs && vs[key]) return String(vs[key]);
    } catch (e) {}
    return fallback;
  }

  function getModal() {
    return document.getElementById(MODAL_ID);
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

  function fetchJson(url, options) {
    return fetch(url, options || {}).then(function (r) {
      return r.json().catch(function () {
        return {};
      }).then(function (data) {
        return { httpOk: r.ok, data: data };
      });
    });
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('upload-source-link-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'upload-source-link-modal__status' + (kind ? ' is-' + kind : '');
  }

  function setSubmitEnabled(on) {
    var btn = document.getElementById('upload-source-link-submit');
    if (btn) btn.disabled = !on;
  }

  function showPreview(url) {
    var wrap = document.getElementById('upload-source-link-preview');
    var img = document.getElementById('upload-source-link-preview-img');
    if (!wrap || !img) return;
    if (!url) {
      wrap.hidden = true;
      img.removeAttribute('src');
      return;
    }
    img.src = url;
    wrap.hidden = false;
  }

  function stopPhoneBridge() {
    if (phonePollTimer) {
      clearInterval(phonePollTimer);
      phonePollTimer = null;
    }
    phoneSessionId = null;
  }

  function applyPhoneLinkValue(value) {
    var input = document.getElementById('upload-source-link-url');
    var phoneStatus = document.getElementById('upload-source-link-phone-status');
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (phoneStatus) {
      phoneStatus.textContent = i18n('link_phone_received', 'Link received from phone');
    }
    previewUrl();
  }

  function pollPhoneSession(sessionId, ownerId) {
    var base = phoneBridgeApiBase();
    var u =
      base +
      '/api/creator-phone-upload/session?id=' +
      encodeURIComponent(sessionId) +
      '&owner_id=' +
      encodeURIComponent(ownerId);
    fetchJson(u, { credentials: 'omit' }).then(function (res) {
      var data = res.data;
      if (!data || !data.ok || phoneSessionId !== sessionId) return;
      if (data.status === 'completed' && data.value) {
        stopPhoneBridge();
        applyPhoneLinkValue(data.value);
      } else if (data.status === 'expired') {
        stopPhoneBridge();
      }
    }).catch(function () {});
  }

  function startPhoneBridge() {
    var box = document.getElementById('upload-source-link-phone');
    var qrImg = document.getElementById('upload-source-link-qr-img');
    var phoneStatus = document.getElementById('upload-source-link-phone-status');
    stopPhoneBridge();
    if (!box || !isDesktopViewport()) {
      if (box) {
        box.hidden = true;
        box.classList.remove('is-visible');
      }
      return;
    }
    box.hidden = false;
    box.classList.add('is-visible');
    if (qrImg) {
      qrImg.removeAttribute('src');
      qrImg.alt = '';
    }
    var ownerId = getOwnerId();
    if (!ownerId) {
      if (phoneStatus) {
        phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
      }
      return;
    }
    if (phoneStatus) phoneStatus.textContent = i18n('link_phone_starting', 'Preparing phone scan…');
    var base = phoneBridgeApiBase();
    fetchJson(base + '/api/creator-phone-upload/session', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner_id: ownerId, purpose: 'image_link' }),
    })
      .then(function (res) {
        var session = res.data;
        if (!res.httpOk || !session || !session.ok || !session.session_id) {
          if (phoneStatus) {
            phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
          }
          return;
        }
        phoneSessionId = session.session_id;
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
        phonePollTimer = setInterval(function () {
          pollPhoneSession(session.session_id, ownerId);
        }, 2000);
        pollPhoneSession(session.session_id, ownerId);
      })
      .catch(function () {
        if (phoneStatus) {
          phoneStatus.textContent = i18n('link_phone_unavailable', 'Phone scan unavailable right now.');
        }
      });
  }

  function previewUrl() {
    var input = document.getElementById('upload-source-link-url');
    var raw = input ? String(input.value || '').trim() : '';
    if (!raw || !/^https?:\/\//i.test(raw)) {
      setStatus(i18n('link_error_invalid_url', 'Please enter a valid URL.'), 'error');
      linkReadyUrl = null;
      setSubmitEnabled(false);
      showPreview(null);
      return;
    }
    linkReadyUrl = raw;
    setStatus(i18n('link_extract_ready', 'Ready — tap Use image to continue.'), 'success');
    setSubmitEnabled(true);
    showPreview(raw);
  }

  function close(opts) {
    opts = opts || {};
    stopPhoneBridge();
    linkReadyUrl = null;
    setSubmitEnabled(false);
    showPreview(null);
    setStatus('', '');
    var modal = getModal();
    if (modal && modal.open) modal.close();
    var onCancel = linkCtx && linkCtx.onCancel;
    linkCtx = null;
    if (!opts.skipCancel && typeof onCancel === 'function') onCancel();
  }

  function submitUrl() {
    if (!linkReadyUrl) {
      setStatus(i18n('link_extract_first', 'Preview the link first.'), 'error');
      return;
    }
    var url = linkReadyUrl;
    var onApply = linkCtx && linkCtx.onApplyUrl;
    close({ skipCancel: true });
    if (typeof onApply === 'function') {
      onApply(url);
    } else if (window.UploadSourceModal && typeof window.UploadSourceModal.applyImageUrl === 'function') {
      window.UploadSourceModal.applyImageUrl(url);
    }
  }

  function open(opts) {
    linkCtx = opts || {};
    linkReadyUrl = null;
    setSubmitEnabled(false);
    showPreview(null);
    setStatus('', '');
    var input = document.getElementById('upload-source-link-url');
    if (input) input.value = '';
    var phoneStatus = document.getElementById('upload-source-link-phone-status');
    if (phoneStatus) phoneStatus.textContent = '';

    var modal = getModal();
    if (!modal) return;
    if (typeof window.eazReparentIntoCreatorAutomationLayer === 'function') {
      linkCtx._layerRestore = window.eazReparentIntoCreatorAutomationLayer(modal);
    }
    modal.showModal();
    startPhoneBridge();
    if (input) setTimeout(function () { input.focus(); }, 0);
  }

  function bind() {
    if (bound) return;
    bound = true;
    var modal = getModal();
    if (!modal) return;

    var closeBtn = document.getElementById('upload-source-link-close');
    var cancelBtn = document.getElementById('upload-source-link-cancel');
    var extractBtn = document.getElementById('upload-source-link-extract');
    var submitBtn = document.getElementById('upload-source-link-submit');
    var urlInput = document.getElementById('upload-source-link-url');

    if (closeBtn) closeBtn.addEventListener('click', function () { close(); });
    if (cancelBtn) cancelBtn.addEventListener('click', function () { close(); });
    if (extractBtn) extractBtn.addEventListener('click', previewUrl);
    if (submitBtn) submitBtn.addEventListener('click', submitUrl);
    if (urlInput) {
      urlInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          previewUrl();
        }
      });
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) close();
    });
    modal.addEventListener('cancel', function () { close(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.UploadSourceLinkModal = {
    open: open,
    close: close,
  };
})();
