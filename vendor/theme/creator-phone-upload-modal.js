/**
 * Opens after "Upload from phone" — shows QR, polls until image is on worker session, applies to creator.
 */
(function () {
  'use strict';

  var MODAL_ID = 'creator-phone-upload-modal';
  var QR_IMG_ID = 'creator-phone-upload-qr-img';
  var pollTimer = null;
  var currentSectionId = null;
  var currentSession = null;
  /** @type {null|function()} */
  var phoneUploadAutomationRestore = null;
  /** @type {null|function()} */
  var pendingOnCancel = null;
  var phoneDidApply = false;

  var PHONE_UPLOAD_WORKER_FALLBACK = 'https://creator-engine.eazpire.workers.dev';

  function apiBase() {
    var cfg = window.CREATOR_API_CONFIG || {};
    if (cfg.PHONE_UPLOAD_BASE_URL) {
      return String(cfg.PHONE_UPLOAD_BASE_URL).replace(/\/+$/, '');
    }
    var base = cfg.BASE_URL ? String(cfg.BASE_URL).replace(/\/+$/, '') : '';
    if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(base)) return base;
    if (window.__CREATOR_PORTAL_HOST__) return PHONE_UPLOAD_WORKER_FALLBACK;
    if (window.CreatorWidgetConfig) {
      var k = Object.keys(window.CreatorWidgetConfig)[0];
      var c = k && window.CreatorWidgetConfig[k];
      if (c && c.api_root) {
        var apiRoot = String(c.api_root).replace(/\/+$/, '').replace(/\/apps\/creator-dispatch$/i, '');
        if (/^https:\/\/creator-engine\.eazpire\.workers\.dev/i.test(apiRoot)) return apiRoot;
      }
    }
    return PHONE_UPLOAD_WORKER_FALLBACK;
  }

  function fetchPhoneUploadJson(url, options) {
    return fetch(url, options || { credentials: 'omit' }).then(function (r) {
      return r.text().then(function (text) {
        var snippet = String(text || '').trim();
        var data = {};
        if (snippet) {
          try {
            data = JSON.parse(snippet);
          } catch (_parseErr) {
            var isHtml = /^<!DOCTYPE/i.test(snippet) || /^<html/i.test(snippet);
            var err = new Error(
              isHtml
                ? 'Phone upload API returned a web page instead of JSON (HTTP ' + r.status + ').'
                : 'Invalid phone upload response (HTTP ' + r.status + ').'
            );
            err.httpStatus = r.status;
            throw err;
          }
        }
        return { httpOk: r.ok, status: r.status, data: data };
      });
    });
  }

  function getOwnerId(sectionId) {
    if (sectionId) {
      var el = document.getElementById('ownerId-' + sectionId);
      if (el && el.value) return String(el.value).trim();
    }
    var o = document.querySelector('input[id^="ownerId-"]');
    if (o && o.value) return String(o.value).trim();
    if (window.__EAZ_OWNER_ID != null && String(window.__EAZ_OWNER_ID) !== '') {
      return String(window.__EAZ_OWNER_ID).trim();
    }
    return '';
  }

  function fetchImageAndOpenDesignUploadModal(sectionId, imageUrl) {
    fetch(imageUrl, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('fetch_failed');
        return r.blob();
      })
      .then(function (blob) {
        var ft = blob.type && blob.type.indexOf('image/') === 0 ? blob.type : 'image/png';
        var file = new File([blob], 'design-from-mobile.png', { type: ft });
        if (!window.DesignUploadModal || typeof window.DesignUploadModal.init !== 'function') return;
        var api = window.DesignUploadModal.init({ sectionId: sectionId, selectedFile: file });
        if (api && typeof api.open === 'function') api.open();
      })
      .catch(function () {
        window.alert(
          (window.CreatorI18n && window.CreatorI18n.chat_genericError) ||
            'Could not load the image. Try “This device” instead.'
        );
      });
  }

  function applyImageToMyCreationsDesignModal(sectionId, imageUrl) {
    if (!sectionId || !imageUrl) return false;
    var path = typeof window.location.pathname === 'string' ? window.location.pathname : '';
    var isMyCreations =
      path.indexOf('/pages/creator-dashboard') !== -1 || path.indexOf('/pages/my-creations') !== -1;
    var isDashboard =
      path.indexOf('/pages/creator-dashboard') !== -1 && String(sectionId) === 'creator-mobile';

    if (isDashboard) {
      var dm = document.getElementById('design-upload-modal-creator-mobile');
      if (dm) {
        fetchImageAndOpenDesignUploadModal(sectionId, imageUrl);
        return true;
      }
      return false;
    }

    if (!isMyCreations) return false;
    var root = document.querySelector('[data-creations-root]');
    if (!root || String(root.getAttribute('data-section-id') || '') !== String(sectionId)) return false;

    fetchImageAndOpenDesignUploadModal(sectionId, imageUrl);
    return true;
  }

  function applyImageToCreator(sectionId, imageUrl) {
    if (!imageUrl) return;

    if (
      sectionId === 'eaz-ref-search' &&
      window.EazReferenceSearch &&
      typeof window.EazReferenceSearch.startFromUrl === 'function'
    ) {
      window.EazReferenceSearch.startFromUrl(imageUrl);
      return;
    }

    // Quick Inspirations upload flow — consume phone image before generator/shop handlers
    if (typeof window.__qiPhoneUploadApply === 'function') {
      try {
        if (window.__qiPhoneUploadApply(imageUrl)) return;
      } catch (eQi) {}
    }

    var cdmCtx = typeof window !== 'undefined' ? window.__creatorDetailPhoneContext : null;
    if (
      cdmCtx &&
      cdmCtx.category &&
      window.CreatorDetailModal &&
      typeof window.CreatorDetailModal.applyPhoneImageUrl === 'function'
    ) {
      window.CreatorDetailModal.applyPhoneImageUrl(cdmCtx.category, imageUrl);
      try {
        window.__creatorDetailPhoneContext = null;
      } catch (eCdm) {}
      return;
    }

    if (
      typeof window.__cdsDesignStudioPhoneApply === 'function' &&
      window.__cdsDesignStudioPhoneApply(imageUrl)
    ) {
      return;
    }

    if (
      typeof window.__eazSmmPhoneApply === 'function' &&
      window.__eazSmmPhoneApply(imageUrl)
    ) {
      return;
    }

    if (
      typeof window.__eazImageAddMediaPhoneApply === 'function' &&
      window.__eazImageAddMediaPhoneApply(imageUrl)
    ) {
      return;
    }

    if (
      typeof window.__eazVideoGeneratorPhoneApply === 'function' &&
      window.__eazVideoGeneratorPhoneApply(imageUrl)
    ) {
      return;
    }

    if (
      typeof window.__eazVideoStudioPhoneApply === 'function' &&
      window.__eazVideoStudioPhoneApply(imageUrl)
    ) {
      return;
    }

    if (
      typeof window.__eazPrintifyStudioPhoneApply === 'function' &&
      window.__eazPrintifyStudioPhoneApply(sectionId, imageUrl)
    ) {
      return;
    }

    var hubRoot = typeof window !== 'undefined' ? window.__EHUB_PHONE_TARGET : null;
    if (
      hubRoot &&
      hubRoot.getAttribute &&
      hubRoot.getAttribute('id') &&
      String(hubRoot.getAttribute('id')).indexOf('eazInterestsHub') === 0 &&
      window.EazInterestsHub &&
      typeof window.EazInterestsHub.applyPhoneImageFromUrl === 'function'
    ) {
      var appliedHub = window.EazInterestsHub.applyPhoneImageFromUrl(imageUrl, hubRoot);
      try {
        if (typeof window !== 'undefined') window.__EHUB_PHONE_TARGET = null;
      } catch (e0) {}
      if (appliedHub) return;
    }

    if (applyImageToMyCreationsDesignModal(sectionId, imageUrl)) {
      return;
    }

    // Design generator: same flow as device/camera — Reference Influence modal via gen-design-selected
    var genGrid = document.getElementById('genSelectedImagesGrid');
    if (genGrid) {
      try {
        window.dispatchEvent(
          new CustomEvent('gen-design-selected', { detail: { imageUrl: imageUrl, source: 'phone_qr' } })
        );
      } catch (e1) {}
      return;
    }

    // Shop Design Generator (Printify Design Studio)
    if (sectionId === 'eaz-shop-dg') {
      try {
        window.dispatchEvent(
          new CustomEvent('gen-design-selected', {
            detail: { imageUrl: imageUrl, sectionId: sectionId, source: 'phone_qr' },
          })
        );
      } catch (eDg) {}
      return;
    }

    var shop = document.body.classList.contains('eaz-shop-studio-open');

    if (shop && sectionId && typeof window.eazShopStudioRefsAdd === 'function') {
      window.eazShopStudioRefsAdd(sectionId, imageUrl, 80);
      var fi0 = document.getElementById('creatorImage-' + sectionId);
      if (fi0) fi0.dataset.imageUrl = imageUrl;
      return;
    }

    var fi = sectionId ? document.getElementById('creatorImage-' + sectionId) : null;
    if (fi) {
      fi.dataset.imageUrl = imageUrl;
      var prev = document.getElementById('imagePreview-' + sectionId);
      var pc = document.getElementById('imagePreviewContainer-' + sectionId);
      var uz = document.getElementById('uploadZone-' + sectionId);
      if (prev) prev.src = imageUrl;
      if (pc) pc.style.display = 'flex';
      if (uz) uz.style.display = 'none';
      return;
    }

    try {
      window.dispatchEvent(
        new CustomEvent('gen-design-selected', { detail: { imageUrl: imageUrl, source: 'phone_qr' } })
      );
    } catch (e2) {}
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    currentSession = null;
  }

  function setErr(msg) {
    var el = document.getElementById('creator-phone-upload-error');
    if (!el) return;
    if (msg) {
      el.hidden = false;
      el.textContent = msg;
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function startPoll(sessionId, ownerId) {
    stopPoll();
    currentSession = sessionId;
    var base = apiBase();
    var tick = function () {
      if (!currentSession || currentSession !== sessionId) return;
      var u =
        base +
        '/api/creator-phone-upload/session?id=' +
        encodeURIComponent(sessionId) +
        '&owner_id=' +
        encodeURIComponent(ownerId);
      fetch(u, { credentials: 'omit' })
        .then(function (r) {
          return r.text().then(function (text) {
            var snippet = String(text || '').trim();
            if (!snippet) return null;
            try {
              return JSON.parse(snippet);
            } catch (_e) {
              return null;
            }
          });
        })
        .then(function (data) {
          if (!data || !data.ok) return;
          if (data.status === 'completed' && data.image_url) {
            stopPoll();
            phoneDidApply = true;
            pendingOnCancel = null;
            if (window.UploadSourceModal && typeof window.UploadSourceModal.close === 'function') {
              window.UploadSourceModal.close();
            }
            applyImageToCreator(currentSectionId, data.image_url);
            closeModalUi({ skipCancel: true });
          }
        })
        .catch(function () {});
    };
    tick();
    pollTimer = setInterval(tick, 2000);
  }

  function closeModalUi(opts) {
    var skipCancel = opts && opts.skipCancel;
    var modal = document.getElementById(MODAL_ID);
    stopPoll();
    setErr('');
    try {
      if (typeof window !== 'undefined') window.__EHUB_PHONE_TARGET = null;
    } catch (eClear) {}
    if (modal) {
      modal.classList.remove('creator-phone-upload-modal--studio');
      if (modal.close) modal.close();
    }
    var qr = document.getElementById(QR_IMG_ID);
    if (qr) qr.removeAttribute('src');
    var cancelCb = pendingOnCancel;
    pendingOnCancel = null;
    if (!skipCancel && !phoneDidApply && typeof cancelCb === 'function') {
      setTimeout(function () {
        try {
          cancelCb();
        } catch (eC) {}
      }, 0);
    }
    phoneDidApply = false;
  }

  /** Fallback if styled PNG fails to load (plain QR, same payload as session). */
  function qrCodeUrlForScan(scanUrl) {
    return (
      'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=1&qzone=1&data=' +
      encodeURIComponent(scanUrl)
    );
  }

  function open(options) {
    var sectionId = (options && options.sectionId) || null;
    currentSectionId = sectionId;
    pendingOnCancel = options && typeof options.onCancel === 'function' ? options.onCancel : null;
    phoneDidApply = false;

    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    var ownerId = '';
    if (options && options.purpose === 'creator-detail' && window.__creatorDetailPhoneContext) {
      ownerId = String(window.__creatorDetailPhoneContext.ownerId || '').trim();
    }
    if (!ownerId) ownerId = getOwnerId(sectionId);
    if (!ownerId) {
      try {
        if (typeof window !== 'undefined') window.__EHUB_PHONE_TARGET = null;
      } catch (eOwn) {}
      window.alert(
        (window.CreatorI18n && window.CreatorI18n.phone_upload_login_required) ||
          'Please sign in to upload from your phone.'
      );
      var cancelLogin = pendingOnCancel;
      pendingOnCancel = null;
      if (typeof cancelLogin === 'function') {
        setTimeout(function () {
          try {
            cancelLogin();
          } catch (eL) {}
        }, 0);
      }
      return;
    }

    var loading = document.getElementById('creator-phone-upload-loading');
    var main = document.getElementById('creator-phone-upload-main');
    if (loading) loading.style.display = '';
    if (main) main.hidden = true;
    setErr('');

    phoneUploadAutomationRestore = null;
    if (typeof window.eazReparentIntoCreatorAutomationLayer === 'function') {
      phoneUploadAutomationRestore = window.eazReparentIntoCreatorAutomationLayer(modal);
    }
    modal.showModal();

    var base = apiBase();

    fetchPhoneUploadJson(base + '/api/creator-phone-upload/config')
      .then(function (res) {
        var cfg = res.data;
        if (!cfg || !cfg.ok) {
          var err = new Error((cfg && cfg.message) || (cfg && cfg.error) || 'not_configured');
          err.code = cfg && cfg.error;
          throw err;
        }
        return fetchPhoneUploadJson(base + '/api/creator-phone-upload/session', {
          method: 'POST',
          credentials: 'omit',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ owner_id: ownerId }),
        });
      })
      .then(function (res) {
        var data = res.data;
        if (!data || !data.ok || !data.scan_url || !data.session_id) {
          var err2 = new Error((data && data.message) || (data && data.error) || 'session_failed');
          err2.code = data && data.error;
          throw err2;
        }
        var qr = document.getElementById(QR_IMG_ID);
        if (qr) {
          var styled =
            base +
            '/api/creator-phone-upload/qr-image?session=' +
            encodeURIComponent(data.session_id);
          qr.onerror = function () {
            qr.onerror = null;
            qr.src = qrCodeUrlForScan(data.scan_url);
          };
          qr.src = styled;
        }
        if (loading) loading.style.display = 'none';
        if (main) main.hidden = false;
        startPoll(data.session_id, ownerId);
      })
      .catch(function (err) {
        console.warn('[CreatorPhoneUpload]', err);
        if (loading) loading.style.display = 'none';
        if (main) main.hidden = true;
        var detail = err && String(err.message || '');
        var code = err && err.code;
        if (detail && detail.length > 0 && detail.length < 500 && detail !== 'session_failed') {
          setErr(detail);
        } else if (code === 'no_creator_phone_qr' || code === 'admin_db_unavailable') {
          setErr(
            (window.CreatorI18n && window.CreatorI18n.phone_upload_config_error) ||
              'Phone upload is not set up yet. Add an active QR in Eazy QR with destination https://creator-engine.eazpire.workers.dev/creator-phone-upload'
          );
        } else {
          setErr(
            (window.CreatorI18n && window.CreatorI18n.phone_upload_config_error) ||
              'Phone upload is not available yet. Ask an admin to add a “creator_phone_ref” QR in Eazy QR (destination: this site’s /creator-phone-upload page).'
          );
        }
      });
  }

  function bind() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    var closeBtn = document.getElementById('creator-phone-upload-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModalUi);
    }
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModalUi();
    });
    modal.addEventListener('cancel', closeModalUi);
    modal.addEventListener('close', function () {
      stopPoll();
      try {
        if (typeof window !== 'undefined') window.__EHUB_PHONE_TARGET = null;
      } catch (eCl) {}
      if (phoneUploadAutomationRestore) {
        try {
          phoneUploadAutomationRestore();
        } catch (eR) {}
        phoneUploadAutomationRestore = null;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.CreatorPhoneUploadModal = {
    open: open,
    close: closeModalUi,
  };
})();
