/**
 * Shared clipboard image helpers for upload / reference-image source modals.
 * Option stays always enabled; click reads clipboard (or paste-event cache).
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'eaz-clipboard-image-styles';
  var TOAST_ID = 'eaz-clipboard-image-toast';
  var cachedFile = null;
  var changeListeners = [];
  var toastTimer = null;

  function t(key, fallback) {
    var full = 'creator.generator.' + key;
    var fullUpload = 'creator.upload_source.' + key;
    try {
      if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.t === 'function') {
        var v0 = global.CreatorPortalI18n.t(full) || global.CreatorPortalI18n.t(fullUpload);
        if (v0) return v0;
      }
    } catch (e0) {}
    try {
      if (global.CreatorI18n) {
        if (global.CreatorI18n[full]) return global.CreatorI18n[full];
        if (global.CreatorI18n[fullUpload]) return global.CreatorI18n[fullUpload];
        if (global.CreatorI18n[key]) return global.CreatorI18n[key];
      }
    } catch (e) {}
    try {
      var flat = global.__locale;
      if (flat) {
        if (flat[full]) return flat[full];
        if (flat[fullUpload]) return flat[fullUpload];
      }
    } catch (e2) {}
    return fallback;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#' +
      TOAST_ID +
      '{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483000;' +
      'max-width:min(420px,calc(100vw - 32px));padding:12px 16px;border-radius:12px;' +
      'background:rgba(17,24,39,0.96);color:#f9fafb;font:600 14px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 10px 30px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.12);' +
      'pointer-events:none;opacity:0;transition:opacity .2s ease}' +
      '#' +
      TOAST_ID +
      '.is-visible{opacity:1}';
    document.head.appendChild(style);
  }

  function showMessage(text, ms) {
    if (!text) return;
    ensureStyles();
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOAST_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('is-visible');
    }, typeof ms === 'number' ? ms : 3600);
  }

  function isImageMime(type) {
    return !!(type && String(type).indexOf('image/') === 0);
  }

  function isApiAvailable() {
    try {
      if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
    } catch (e) {}
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.read === 'function'
    );
  }

  function fileFromBlob(blob, nameHint) {
    if (!blob) return null;
    var type = blob.type || 'image/png';
    if (!isImageMime(type)) return null;
    var ext = (type.split('/')[1] || 'png').split(';')[0] || 'png';
    var name = nameHint || blob.name || ('clipboard-image.' + ext);
    try {
      return new File([blob], name, { type: type, lastModified: Date.now() });
    } catch (e) {
      try {
        blob.name = name;
      } catch (e2) {}
      return blob;
    }
  }

  function notifyChange() {
    var has = !!cachedFile;
    for (var i = 0; i < changeListeners.length; i++) {
      try {
        changeListeners[i](has, cachedFile);
      } catch (e) {}
    }
  }

  function setCachedFile(file) {
    cachedFile = file || null;
    notifyChange();
  }

  function extractImageFromClipboardItems(items) {
    if (!items || !items.length) return Promise.resolve(null);
    var list = [];
    var i;
    for (i = 0; i < items.length; i++) list.push(items[i]);

    function tryIndex(idx) {
      if (idx >= list.length) return Promise.resolve(null);
      var item = list[idx];
      if (!item) return tryIndex(idx + 1);

      // DataTransferItemList (paste event)
      if (typeof item.getAsFile === 'function' && isImageMime(item.type)) {
        return Promise.resolve(fileFromBlob(item.getAsFile()));
      }

      // ClipboardItem (navigator.clipboard.read)
      if (item.types && typeof item.getType === 'function') {
        for (var tIdx = 0; tIdx < item.types.length; tIdx++) {
          var type = item.types[tIdx];
          if (isImageMime(type)) {
            return item
              .getType(type)
              .then(function (blob) {
                return fileFromBlob(blob);
              })
              .catch(function () {
                return tryIndex(idx + 1);
              });
          }
        }
      }
      return tryIndex(idx + 1);
    }

    return tryIndex(0);
  }

  /**
   * @returns {Promise<{ file: File|Blob|null, error: null|'empty'|'denied'|'unsupported' }>}
   */
  function readImageWithStatus() {
    if (cachedFile) {
      return Promise.resolve({ file: cachedFile, error: null });
    }
    if (!isApiAvailable()) {
      return Promise.resolve({ file: null, error: 'unsupported' });
    }
    return navigator.clipboard
      .read()
      .then(function (items) {
        return extractImageFromClipboardItems(items);
      })
      .then(function (file) {
        if (file) {
          setCachedFile(file);
          return { file: file, error: null };
        }
        return { file: null, error: 'empty' };
      })
      .catch(function (err) {
        if (cachedFile) return { file: cachedFile, error: null };
        var name = err && err.name ? String(err.name) : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          return { file: null, error: 'denied' };
        }
        // Some browsers throw when clipboard has no image / empty
        return { file: null, error: 'empty' };
      });
  }

  function messageForError(error) {
    if (error === 'denied') {
      return t(
        'paste_denied',
        'Clipboard access was blocked. Allow clipboard permission, or paste with Ctrl+V / Cmd+V while this page is focused.'
      );
    }
    if (error === 'unsupported') {
      return t(
        'paste_unsupported',
        'Paste from clipboard is not available in this browser. Use HTTPS with Chrome or Edge, or upload from your device.'
      );
    }
    return t('paste_empty', 'No image found in the clipboard. Copy an image first, then try again.');
  }

  /**
   * Read clipboard image; show toast on failure. Resolves to File/Blob or null.
   */
  function start() {
    return readImageWithStatus().then(function (result) {
      if (result && result.file) return result.file;
      showMessage(messageForError(result && result.error));
      return null;
    });
  }

  function probe() {
    return readImageWithStatus().then(function (result) {
      return !!(result && result.file);
    });
  }

  function readImageFile() {
    return readImageWithStatus().then(function (result) {
      return (result && result.file) || null;
    });
  }

  function setButtonEnabled(btn, enabled) {
    if (!btn) return;
    // Paste option stays clickable even without a clipboard image (requirement).
    var on = enabled !== false;
    if (on) {
      btn.removeAttribute('disabled');
      btn.setAttribute('aria-disabled', 'false');
      btn.classList.remove('is-disabled');
    } else {
      btn.setAttribute('disabled', 'disabled');
      btn.setAttribute('aria-disabled', 'true');
      btn.classList.add('is-disabled');
    }
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    changeListeners.push(fn);
    return function () {
      var idx = changeListeners.indexOf(fn);
      if (idx >= 0) changeListeners.splice(idx, 1);
    };
  }

  /**
   * Keep paste option always enabled while modal is open.
   * @param {HTMLElement} btn
   * @param {{ isOpen?: function(): boolean }} opts
   */
  function bindOption(btn, opts) {
    if (!btn) return { refresh: function () {}, destroy: function () {} };
    var isOpen = opts && typeof opts.isOpen === 'function' ? opts.isOpen : function () { return true; };

    function refresh() {
      if (!isOpen()) return;
      setButtonEnabled(btn, true);
    }

    refresh();

    return {
      refresh: refresh,
      destroy: function () {}
    };
  }

  // Cache images from paste anywhere (needed on mobile where clipboard.read is limited)
  document.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    if (!cd || !cd.items) return;
    extractImageFromClipboardItems(cd.items).then(function (file) {
      if (file) setCachedFile(file);
    });
  });

  global.EazClipboardImage = {
    isSupported: isApiAvailable,
    probe: probe,
    start: start,
    readImageWithStatus: readImageWithStatus,
    readImageFile: readImageFile,
    showMessage: showMessage,
    getCachedFile: function () {
      return cachedFile;
    },
    clearCache: function () {
      setCachedFile(null);
    },
    hasCachedImage: function () {
      return !!cachedFile;
    },
    setButtonEnabled: setButtonEnabled,
    onChange: onChange,
    bindOption: bindOption,
    applyFileToInput: function (input, file) {
      if (!input || !file) return false;
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (e) {
        return false;
      }
    }
  };
})(typeof window !== 'undefined' ? window : this);
