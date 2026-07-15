/**
 * Shared clipboard image helpers for upload / reference-image source modals.
 * Best-effort: Clipboard API when available; paste-event cache for mobile.
 */
(function (global) {
  'use strict';

  var cachedFile = null;
  var changeListeners = [];

  function isImageMime(type) {
    return !!(type && String(type).indexOf('image/') === 0);
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
        for (var t = 0; t < item.types.length; t++) {
          var type = item.types[t];
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

  function probe() {
    if (cachedFile) return Promise.resolve(true);
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      return Promise.resolve(false);
    }
    return navigator.clipboard
      .read()
      .then(function (items) {
        return extractImageFromClipboardItems(items);
      })
      .then(function (file) {
        if (file) setCachedFile(file);
        return !!file;
      })
      .catch(function () {
        return !!cachedFile;
      });
  }

  function readImageFile() {
    if (cachedFile) return Promise.resolve(cachedFile);
    return probe().then(function () {
      return cachedFile || null;
    });
  }

  function setButtonEnabled(btn, enabled) {
    if (!btn) return;
    var on = !!enabled;
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
   * Keep a source-option button in sync with clipboard image availability while a modal is open.
   * @param {HTMLElement} btn
   * @param {{ isOpen: function(): boolean }} opts
   */
  function bindOption(btn, opts) {
    if (!btn) return { refresh: function () {}, destroy: function () {} };
    var isOpen = opts && typeof opts.isOpen === 'function' ? opts.isOpen : function () { return true; };

    function refresh() {
      if (!isOpen()) return;
      setButtonEnabled(btn, !!cachedFile);
      probe().then(function (has) {
        if (!isOpen()) return;
        setButtonEnabled(btn, has || !!cachedFile);
      });
    }

    var unsub = onChange(function (has) {
      if (!isOpen()) return;
      setButtonEnabled(btn, has);
    });

    function onVisibility() {
      if (document.visibilityState === 'visible' && isOpen()) refresh();
    }

    function onFocus() {
      if (isOpen()) refresh();
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    // Start disabled until we know there is an image
    setButtonEnabled(btn, !!cachedFile);

    return {
      refresh: refresh,
      destroy: function () {
        unsub();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('focus', onFocus);
      }
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
    probe: probe,
    readImageFile: readImageFile,
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
