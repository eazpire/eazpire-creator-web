/**
 * Screen / tab capture for upload & reference-image source modals.
 * Web-native equivalent of “floating over other sites”: getDisplayMedia
 * (user picks a tab / window / screen), then an in-page region crop overlay.
 * True always-on floating UI over other sites requires a browser extension.
 */
(function (global) {
  'use strict';

  var STYLE_ID = 'eaz-screenshot-capture-styles';
  var ROOT_ID = 'eaz-screenshot-capture-root';
  var activeSession = null;

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

  function isSupported() {
    try {
      return !!(
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === 'function'
      );
    } catch (e) {
      return false;
    }
  }

  function isLikelyMobile() {
    try {
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return true;
      if (navigator.maxTouchPoints > 1 && window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function canUse() {
    return isSupported() && !isLikelyMobile();
  }

  function fileFromBlob(blob, nameHint) {
    if (!blob) return null;
    var type = blob.type || 'image/png';
    var ext = (type.split('/')[1] || 'png').split(';')[0] || 'png';
    var name = nameHint || 'screenshot.' + ext;
    try {
      return new File([blob], name, { type: type, lastModified: Date.now() });
    } catch (e) {
      try {
        blob.name = name;
      } catch (e2) {}
      return blob;
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    // Use a <dialog> root so capture/crop UI enters the browser top layer above
    // other showModal() dialogs (Design Generator, Printify studio, upload source).
    style.textContent =
      '#' +
      ROOT_ID +
      '{box-sizing:border-box;position:fixed;inset:0;width:100%;max-width:100vw;height:100%;max-height:100vh;' +
      'margin:0;padding:0;border:none;background:transparent;color:#f9fafb;pointer-events:none;' +
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}' +
      '#' +
      ROOT_ID +
      '::backdrop{background:transparent;}' +
      '#' +
      ROOT_ID +
      ' *{box-sizing:border-box;}' +
      '.eaz-ss-float{pointer-events:auto;position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));' +
      'transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;max-width:min(420px,calc(100vw - 24px));' +
      'padding:14px 16px;border-radius:16px;background:rgba(17,24,39,.96);color:#f9fafb;box-shadow:0 12px 40px rgba(0,0,0,.45);' +
      'border:1px solid rgba(255,255,255,.12);}' +
      '.eaz-ss-float__hint{margin:0;font-size:13px;line-height:1.4;color:#d1d5db;text-align:center;}' +
      '.eaz-ss-float__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}' +
      '.eaz-ss-btn{appearance:none;border:0;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;}' +
      '.eaz-ss-btn--primary{background:#f59e0b;color:#111827;}' +
      '.eaz-ss-btn--primary:hover{background:#fbbf24;}' +
      '.eaz-ss-btn--ghost{background:rgba(255,255,255,.08);color:#e5e7eb;}' +
      '.eaz-ss-btn--ghost:hover{background:rgba(255,255,255,.14);}' +
      '.eaz-ss-btn:disabled{opacity:.5;cursor:not-allowed;}' +
      '.eaz-ss-crop{pointer-events:auto;position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;flex-direction:column;}' +
      '.eaz-ss-crop__toolbar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;' +
      'background:rgba(17,24,39,.95);color:#f9fafb;border-bottom:1px solid rgba(255,255,255,.1);}' +
      '.eaz-ss-crop__hint{font-size:13px;color:#d1d5db;}' +
      '.eaz-ss-crop__stage{flex:1 1 auto;position:relative;overflow:hidden;cursor:crosshair;touch-action:none;}' +
      '.eaz-ss-crop__img{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:100%;max-height:100%;' +
      'user-select:none;-webkit-user-drag:none;pointer-events:none;}' +
      '.eaz-ss-crop__veil{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none;}' +
      '.eaz-ss-crop__rect{position:absolute;border:2px solid #f59e0b;box-shadow:0 0 0 9999px rgba(0,0,0,.45);pointer-events:none;}' +
      '.eaz-ss-msg{pointer-events:auto;position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);' +
      'max-width:min(420px,calc(100vw - 24px));padding:12px 16px;border-radius:12px;background:rgba(17,24,39,.96);color:#f9fafb;' +
      'font-size:13px;box-shadow:0 8px 28px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);}';
    document.head.appendChild(style);
  }

  function getRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) {
      // Migrate legacy div root (older theme cache) to a dialog for top-layer stacking.
      if (root.tagName !== 'DIALOG' && root.parentNode) {
        try {
          root.parentNode.removeChild(root);
        } catch (eMig) {}
        root = null;
      } else {
        return root;
      }
    }
    root = document.createElement('dialog');
    root.id = ROOT_ID;
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-modal', 'true');
    root.addEventListener('cancel', function (ev) {
      // Escape: abort active capture session instead of leaving an empty dialog open.
      try {
        ev.preventDefault();
      } catch (eC) {}
      if (activeSession && typeof activeSession._eazAbort === 'function') {
        activeSession._eazAbort();
      } else {
        closeRoot();
      }
    });
    document.body.appendChild(root);
    return root;
  }

  function clearRootContent() {
    var root = document.getElementById(ROOT_ID);
    if (root) root.innerHTML = '';
  }

  function closeRoot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.innerHTML = '';
    if (root.open && typeof root.close === 'function') {
      try {
        root.close();
      } catch (eClose) {}
    }
  }

  /** @deprecated use clearRootContent / closeRoot; kept as alias for content-only clear while dialog stays open */
  function clearRoot() {
    clearRootContent();
  }

  function ensureRootOpen() {
    ensureStyles();
    var root = getRoot();
    if (typeof root.showModal === 'function' && !root.open) {
      try {
        root.showModal();
      } catch (eOpen) {
        // Already open or not allowed — keep using the element.
      }
    }
    return root;
  }

  function stopStream(stream) {
    if (!stream) return;
    try {
      stream.getTracks().forEach(function (tr) {
        try {
          tr.stop();
        } catch (e) {}
      });
    } catch (e2) {}
  }

  function showMessage(text, ms) {
    var root = ensureRootOpen();
    clearRootContent();
    var el = document.createElement('div');
    el.className = 'eaz-ss-msg';
    el.textContent = text;
    root.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (root && !root.children.length) closeRoot();
    }, typeof ms === 'number' ? ms : 3200);
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

  function bindOption(btn) {
    if (!btn) return { refresh: function () {}, destroy: function () {} };
    function refresh() {
      setButtonEnabled(btn, canUse());
      if (!canUse()) {
        var desc = btn.querySelector('.gen-ref-image-card__desc, .upload-source-modal__option-desc, small');
        if (desc && !canUse()) {
          // keep static locale desc; tooltip via title
          btn.title = t(
            'screenshot_unsupported',
            'Screenshot is not available on this device or browser'
          );
        }
      } else {
        btn.removeAttribute('title');
      }
    }
    refresh();
    return { refresh: refresh, destroy: function () {} };
  }

  function captureFrameFromStream(stream) {
    return new Promise(function (resolve, reject) {
      var video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.srcObject = stream;

      var settled = false;
      function fail(err) {
        if (settled) return;
        settled = true;
        try {
          video.srcObject = null;
        } catch (e) {}
        reject(err || new Error('capture_failed'));
      }

      function grab() {
        if (settled) return;
        var w = video.videoWidth;
        var h = video.videoHeight;
        if (!w || !h) {
          fail(new Error('empty_frame'));
          return;
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        try {
          ctx.drawImage(video, 0, 0, w, h);
        } catch (e) {
          fail(e);
          return;
        }
        settled = true;
        try {
          video.pause();
          video.srcObject = null;
        } catch (e2) {}
        resolve(canvas);
      }

      video.onloadedmetadata = function () {
        var p = video.play();
        if (p && typeof p.then === 'function') {
          p.then(function () {
            // wait one frame so pixels are ready
            requestAnimationFrame(function () {
              requestAnimationFrame(grab);
            });
          }).catch(fail);
        } else {
          setTimeout(grab, 120);
        }
      };
      video.onerror = function () {
        fail(new Error('video_error'));
      };
      setTimeout(function () {
        if (!settled) fail(new Error('timeout'));
      }, 15000);
    });
  }

  function cropCanvasToBlob(sourceCanvas, rect) {
    return new Promise(function (resolve, reject) {
      var sx = Math.max(0, Math.floor(rect.x));
      var sy = Math.max(0, Math.floor(rect.y));
      var sw = Math.max(1, Math.floor(rect.w));
      var sh = Math.max(1, Math.floor(rect.h));
      if (sx + sw > sourceCanvas.width) sw = sourceCanvas.width - sx;
      if (sy + sh > sourceCanvas.height) sh = sourceCanvas.height - sy;
      if (sw < 1 || sh < 1) {
        reject(new Error('invalid_crop'));
        return;
      }
      var out = document.createElement('canvas');
      out.width = sw;
      out.height = sh;
      out.getContext('2d').drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      if (out.toBlob) {
        out.toBlob(
          function (blob) {
            if (!blob) reject(new Error('toBlob_failed'));
            else resolve(blob);
          },
          'image/png'
        );
      } else {
        try {
          var dataUrl = out.toDataURL('image/png');
          var bin = atob(dataUrl.split(',')[1] || '');
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  function openCropUi(sourceCanvas) {
    return new Promise(function (resolve) {
      var root = ensureRootOpen();
      clearRootContent();

      var crop = document.createElement('div');
      crop.className = 'eaz-ss-crop';
      crop.setAttribute('role', 'dialog');
      crop.setAttribute('aria-modal', 'true');
      crop.setAttribute('aria-label', t('screenshot_crop_title', 'Select region'));

      var toolbar = document.createElement('div');
      toolbar.className = 'eaz-ss-crop__toolbar';
      var hint = document.createElement('div');
      hint.className = 'eaz-ss-crop__hint';
      hint.textContent = t('screenshot_crop_hint', 'Drag to select a region');
      var actions = document.createElement('div');
      actions.className = 'eaz-ss-float__actions';

      var btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'eaz-ss-btn eaz-ss-btn--ghost';
      btnCancel.textContent = t('screenshot_cancel', 'Cancel');

      var btnFull = document.createElement('button');
      btnFull.type = 'button';
      btnFull.className = 'eaz-ss-btn eaz-ss-btn--ghost';
      btnFull.textContent = t('screenshot_use_full', 'Use full image');

      var btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'eaz-ss-btn eaz-ss-btn--primary';
      btnOk.textContent = t('screenshot_confirm', 'Use selection');
      btnOk.disabled = true;

      actions.appendChild(btnCancel);
      actions.appendChild(btnFull);
      actions.appendChild(btnOk);
      toolbar.appendChild(hint);
      toolbar.appendChild(actions);

      var stage = document.createElement('div');
      stage.className = 'eaz-ss-crop__stage';

      var img = document.createElement('img');
      img.className = 'eaz-ss-crop__img';
      img.alt = '';
      img.src = sourceCanvas.toDataURL('image/png');

      var rectEl = document.createElement('div');
      rectEl.className = 'eaz-ss-crop__rect';
      rectEl.style.display = 'none';

      stage.appendChild(img);
      stage.appendChild(rectEl);
      crop.appendChild(toolbar);
      crop.appendChild(stage);
      root.appendChild(crop);

      var drag = null;
      var sel = null; // {x,y,w,h} in image natural pixels

      function imageLayout() {
        var br = img.getBoundingClientRect();
        var stageBr = stage.getBoundingClientRect();
        return {
          left: br.left - stageBr.left,
          top: br.top - stageBr.top,
          width: br.width,
          height: br.height,
          natW: sourceCanvas.width,
          natH: sourceCanvas.height
        };
      }

      function clientToImage(clientX, clientY) {
        var lay = imageLayout();
        var stageBr = stage.getBoundingClientRect();
        var lx = clientX - stageBr.left - lay.left;
        var ly = clientY - stageBr.top - lay.top;
        var nx = (lx / lay.width) * lay.natW;
        var ny = (ly / lay.height) * lay.natH;
        return {
          x: Math.max(0, Math.min(lay.natW, nx)),
          y: Math.max(0, Math.min(lay.natH, ny))
        };
      }

      function paintRect() {
        if (!sel || sel.w < 2 || sel.h < 2) {
          rectEl.style.display = 'none';
          btnOk.disabled = true;
          return;
        }
        var lay = imageLayout();
        var left = lay.left + (sel.x / lay.natW) * lay.width;
        var top = lay.top + (sel.y / lay.natH) * lay.height;
        var w = (sel.w / lay.natW) * lay.width;
        var h = (sel.h / lay.natH) * lay.height;
        rectEl.style.display = 'block';
        rectEl.style.left = left + 'px';
        rectEl.style.top = top + 'px';
        rectEl.style.width = w + 'px';
        rectEl.style.height = h + 'px';
        btnOk.disabled = false;
      }

      function onDown(e) {
        e.preventDefault();
        var pt = e.touches && e.touches[0] ? e.touches[0] : e;
        var p = clientToImage(pt.clientX, pt.clientY);
        drag = { x0: p.x, y0: p.y };
        sel = { x: p.x, y: p.y, w: 0, h: 0 };
        paintRect();
      }

      function onMove(e) {
        if (!drag) return;
        e.preventDefault();
        var pt = e.touches && e.touches[0] ? e.touches[0] : e;
        var p = clientToImage(pt.clientX, pt.clientY);
        var x1 = Math.min(drag.x0, p.x);
        var y1 = Math.min(drag.y0, p.y);
        var x2 = Math.max(drag.x0, p.x);
        var y2 = Math.max(drag.y0, p.y);
        sel = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        paintRect();
      }

      function onUp(e) {
        if (!drag) return;
        if (e) e.preventDefault();
        drag = null;
        paintRect();
      }

      stage.addEventListener('mousedown', onDown);
      stage.addEventListener('mousemove', onMove);
      stage.addEventListener('mouseup', onUp);
      stage.addEventListener('mouseleave', onUp);
      stage.addEventListener('touchstart', onDown, { passive: false });
      stage.addEventListener('touchmove', onMove, { passive: false });
      stage.addEventListener('touchend', onUp, { passive: false });
      stage.addEventListener('touchcancel', onUp, { passive: false });
      window.addEventListener('resize', paintRect);

      function finish(file) {
        window.removeEventListener('resize', paintRect);
        closeRoot();
        resolve(file || null);
      }

      btnCancel.addEventListener('click', function () {
        finish(null);
      });

      btnFull.addEventListener('click', function () {
        cropCanvasToBlob(sourceCanvas, {
          x: 0,
          y: 0,
          w: sourceCanvas.width,
          h: sourceCanvas.height
        })
          .then(function (blob) {
            finish(fileFromBlob(blob, 'screenshot.png'));
          })
          .catch(function () {
            finish(null);
          });
      });

      btnOk.addEventListener('click', function () {
        if (!sel || sel.w < 2 || sel.h < 2) return;
        cropCanvasToBlob(sourceCanvas, sel)
          .then(function (blob) {
            finish(fileFromBlob(blob, 'screenshot-region.png'));
          })
          .catch(function () {
            finish(null);
          });
      });
    });
  }

  /**
   * Keep Design Studio focused after the user picks a tab/window.
   * Prefer focus-capturing-application (actively keep us focused) over
   * no-focus-change (leave focus wherever the OS picker left it — often the
   * other tab in Edge/Chromium). Must pass controller into getDisplayMedia.
   *
   * Spec timing (Chrome Conditional Focus / WICG):
   * - Many calls OK *before* getDisplayMedia (last wins).
   * - At most *one* call in the same turn *immediately after* the promise
   *   resolves; a second call or a later task throws / is ignored.
   * - Calling after the video track is live / after ~1s does NOT help.
   *
   * Limitation: websites cannot reliably force another tab back if Chromium
   * still focuses the shared tab. Prefer current tab, Window, or Entire Screen.
   * Extensions (chrome.tabs.update) can; BroadcastChannel / SW cannot.
   */
  function applyNoFocusSteal(controller) {
    if (!controller || typeof controller.setFocusBehavior !== 'function') return false;
    // focus-capturing-application first: explicitly keep the capturing app focused.
    var behaviors = ['focus-capturing-application', 'no-focus-change'];
    for (var i = 0; i < behaviors.length; i++) {
      try {
        controller.setFocusBehavior(behaviors[i]);
        return true;
      } catch (eFocus) {}
    }
    return false;
  }

  function snapshotOpenDialogs() {
    var list = [];
    try {
      var nodes = document.querySelectorAll('dialog[open]');
      for (var i = 0; i < nodes.length; i++) {
        list.push(nodes[i]);
      }
    } catch (eSnap) {}
    return list;
  }

  function restoreOpenDialogs(dialogs) {
    if (!dialogs || !dialogs.length) return;
    for (var i = 0; i < dialogs.length; i++) {
      var d = dialogs[i];
      if (!d || d.id === ROOT_ID) continue;
      try {
        if (!d.open && typeof d.showModal === 'function') {
          d.showModal();
        } else if (!d.open && typeof d.show === 'function') {
          d.show();
        }
      } catch (eShow) {
        try {
          if (!d.open && typeof d.show === 'function') d.show();
        } catch (eShow2) {}
      }
    }
  }

  function refocusCapturingWindow(opts) {
    var previousActive = opts && opts.previousActive;
    var dialogs = opts && opts.dialogs;
    try {
      if (typeof window.focus === 'function') window.focus();
    } catch (eWin) {}
    try {
      if (window.top && window.top !== window && typeof window.top.focus === 'function') {
        window.top.focus();
      }
    } catch (eTop) {}
    restoreOpenDialogs(dialogs);
    try {
      ensureRootOpen();
    } catch (eRoot) {}
    try {
      if (previousActive && previousActive.isConnected && typeof previousActive.focus === 'function') {
        previousActive.focus({ preventScroll: true });
      } else if (document.body && typeof document.body.focus === 'function') {
        document.body.setAttribute('tabindex', '-1');
        document.body.focus({ preventScroll: true });
      }
    } catch (eBody) {}
  }

  /** Best-effort: refocus several times after the OS picker / tab switch. */
  function scheduleAggressiveRefocus(opts) {
    refocusCapturingWindow(opts);
    var delays = [0, 16, 50, 120, 250, 500, 900];
    for (var i = 0; i < delays.length; i++) {
      (function (ms) {
        setTimeout(function () {
          refocusCapturingWindow(opts);
        }, ms);
      })(delays[i]);
    }
    try {
      requestAnimationFrame(function () {
        refocusCapturingWindow(opts);
        requestAnimationFrame(function () {
          refocusCapturingWindow(opts);
        });
      });
    } catch (eRaf) {}
  }

  /**
   * While this document is hidden (shared tab stole focus), keep trying focus
   * on rAF for a short budget. window.focus() cannot force a background tab
   * forward in Chromium — this only helps if the UA briefly yields focus back.
   */
  function scheduleHiddenFocusLoop(opts, budgetMs) {
    var start = Date.now();
    var maxMs = typeof budgetMs === 'number' ? budgetMs : 1200;
    function tick() {
      if (!document.hidden) {
        refocusCapturingWindow(opts);
        return;
      }
      refocusCapturingWindow(opts);
      if (Date.now() - start >= maxMs) return;
      try {
        requestAnimationFrame(tick);
      } catch (eTick) {}
    }
    try {
      requestAnimationFrame(tick);
    } catch (eStart) {}
  }

  /**
   * Sticky Document PiP when Chromium left us hidden after getDisplayMedia.
   * Chrome ~139+ confers transient activation on accept — requestWindow should
   * run soon after that. Does not switch tabs by itself; a click in PiP is a
   * user gesture that may allow focus() to bring Design Studio forward.
   * @returns {Promise<Window|null>}
   */
  function tryOpenReturnPip(opts) {
    if (!document.hidden) return Promise.resolve(null);
    var dpi = null;
    try {
      dpi = window.documentPictureInPicture;
    } catch (eDpi) {
      return Promise.resolve(null);
    }
    if (!dpi || typeof dpi.requestWindow !== 'function') return Promise.resolve(null);

    return dpi
      .requestWindow({ width: 380, height: 168 })
      .then(function (pipWin) {
        if (!pipWin || !pipWin.document) return null;
        try {
          var doc = pipWin.document;
          doc.title = t('screenshot_pip_title', 'Return to Design Studio');
          var style = doc.createElement('style');
          style.textContent =
            'html,body{margin:0;height:100%;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
            'background:#111827;color:#f9fafb;}' +
            '.wrap{box-sizing:border-box;height:100%;padding:14px 16px;display:flex;flex-direction:column;' +
            'align-items:stretch;justify-content:center;gap:12px;}' +
            'p{margin:0;font-size:13px;line-height:1.4;color:#d1d5db;text-align:center;}' +
            'button{appearance:none;border:0;border-radius:999px;padding:10px 16px;font-size:14px;' +
            'font-weight:700;cursor:pointer;background:#f59e0b;color:#111827;}' +
            'button:hover{background:#fbbf24;}';
          doc.head.appendChild(style);
          var wrap = doc.createElement('div');
          wrap.className = 'wrap';
          var p = doc.createElement('p');
          p.textContent = t(
            'screenshot_pip_hint',
            'The browser switched to the shared tab. Click below to return here and finish the crop.'
          );
          var btn = doc.createElement('button');
          btn.type = 'button';
          btn.textContent = t('screenshot_pip_return', 'Return to Design Studio');
          btn.addEventListener('click', function () {
            refocusCapturingWindow(opts);
            scheduleAggressiveRefocus(opts);
            try {
              pipWin.close();
            } catch (eClosePip) {}
          });
          wrap.appendChild(p);
          wrap.appendChild(btn);
          doc.body.appendChild(wrap);
        } catch (eBuild) {
          try {
            pipWin.close();
          } catch (eClose2) {}
          return null;
        }
        return pipWin;
      })
      .catch(function () {
        return null;
      });
  }

  /** Wait briefly for a delayed focus-steal, then try Document PiP once. */
  function tryOpenReturnPipWhenHidden(opts) {
    if (document.hidden) return tryOpenReturnPip(opts);
    return new Promise(function (resolve) {
      var settled = false;
      function finish(win) {
        if (settled) {
          if (win) closeReturnPip(win);
          return;
        }
        settled = true;
        try {
          document.removeEventListener('visibilitychange', onVis);
        } catch (eRm) {}
        resolve(win || null);
      }
      function onVis() {
        if (document.hidden) tryOpenReturnPip(opts).then(finish);
      }
      try {
        document.addEventListener('visibilitychange', onVis);
      } catch (eAdd) {}
      setTimeout(function () {
        if (settled) return;
        if (document.hidden) tryOpenReturnPip(opts).then(finish);
        else finish(null);
      }, 180);
    });
  }

  function closeReturnPip(pipWin) {
    if (!pipWin) return;
    try {
      if (!pipWin.closed) pipWin.close();
    } catch (eClose) {}
  }

  function runDisplayCapture() {
    if (!isSupported()) {
      return Promise.reject(new Error('unsupported'));
    }

    var previousActive = null;
    try {
      previousActive = document.activeElement;
    } catch (eAct) {}
    var openDialogs = snapshotOpenDialogs();
    var refocusOpts = { previousActive: previousActive, dialogs: openDialogs };

    // Product guidance (browser security limits true background cross-tab capture):
    // 1) Recommended: share this Design Studio tab (preferCurrentTab) — zero navigation.
    // 2) Other site without leaving: open it in a separate window, share Window / Screen.
    // 3) Sharing another browser *tab* often still focuses that tab in Chromium/Edge.
    var constraints = {
      video: {
        displaySurface: 'browser'
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      // Keep Window / Entire Screen available (best path for other sites without tab steal).
      monitorTypeSurfaces: 'include',
      surfaceSwitching: 'exclude',
      systemAudio: 'exclude'
    };

    var controller = null;
    try {
      if (typeof CaptureController === 'function') {
        controller = new CaptureController();
        // Required: controller must be passed into getDisplayMedia options.
        constraints.controller = controller;
        applyNoFocusSteal(controller);
      }
    } catch (eCtrl) {
      controller = null;
    }

    var onVis = null;
    try {
      onVis = function () {
        if (document.visibilityState === 'visible') {
          scheduleAggressiveRefocus(refocusOpts);
        }
      };
      document.addEventListener('visibilitychange', onVis);
    } catch (eVis) {
      onVis = null;
    }

    function cleanupVis() {
      if (!onVis) return;
      try {
        document.removeEventListener('visibilitychange', onVis);
      } catch (eRm) {}
      onVis = null;
    }

    return navigator.mediaDevices
      .getDisplayMedia(constraints)
      .then(function (stream) {
        // Spec: at most ONE setFocusBehavior call immediately after resolve
        // (same turn / microtask). Do this before any other work.
        applyNoFocusSteal(controller);

        scheduleAggressiveRefocus(refocusOpts);
        scheduleHiddenFocusLoop(refocusOpts, 1200);

        // Parallel: sticky Document PiP if Chromium still hides us (Chrome ~139+
        // may still have transient activation briefly after accept).
        var pipPromise = tryOpenReturnPipWhenHidden(refocusOpts);

        return captureFrameFromStream(stream).then(
          function (canvas) {
            stopStream(stream);
            cleanupVis();
            return pipPromise.then(function (pipWin) {
              closeReturnPip(pipWin);
              scheduleAggressiveRefocus(refocusOpts);
              return canvas;
            });
          },
          function (err) {
            stopStream(stream);
            cleanupVis();
            return pipPromise.then(function (pipWin) {
              closeReturnPip(pipWin);
              scheduleAggressiveRefocus(refocusOpts);
              throw err;
            });
          }
        );
      })
      .catch(function (err) {
        cleanupVis();
        scheduleAggressiveRefocus(refocusOpts);
        throw err;
      });
  }

  /**
   * Capture + crop. When options.immediate is true (caller already had a click
   * gesture, e.g. Upload Source → Screenshot), skip the intermediate float panel
   * and open getDisplayMedia right away — critical inside nested <dialog> flows.
   * @param {{ immediate?: boolean }|boolean} [options]
   * @returns {Promise<File|Blob|null>}
   */
  function start(options) {
    var immediate = false;
    if (options === true) immediate = true;
    else if (options && typeof options === 'object' && options.immediate) immediate = true;

    if (activeSession) {
      return activeSession;
    }
    if (!canUse()) {
      showMessage(
        t('screenshot_unsupported', 'Screenshot is not available on this device or browser')
      );
      return Promise.resolve(null);
    }

    var settle = null;
    var settled = false;

    function finishSession(file) {
      if (settled) return;
      settled = true;
      activeSession = null;
      closeRoot();
      if (settle) settle(file || null);
    }

    function handleCaptureError(err) {
      activeSession = null;
      closeRoot();
      var name = err && err.name ? String(err.name) : '';
      if (name === 'NotAllowedError' || name === 'AbortError') {
        showMessage(t('screenshot_denied', 'Screen capture was cancelled or blocked'));
      } else if (String(err && err.message) === 'unsupported') {
        showMessage(
          t('screenshot_unsupported', 'Screenshot is not available on this device or browser')
        );
      } else {
        showMessage(t('screenshot_failed', 'Could not capture screenshot. Please try again.'));
      }
      if (!settled) {
        settled = true;
        if (settle) settle(null);
      }
    }

    function runCaptureThenCrop() {
      runDisplayCapture()
        .then(function (canvas) {
          clearRootContent();
          return openCropUi(canvas);
        })
        .then(function (file) {
          // openCropUi already closed the root
          if (settled) return;
          settled = true;
          activeSession = null;
          if (settle) settle(file || null);
        })
        .catch(function (err) {
          handleCaptureError(err);
        });
    }

    activeSession = new Promise(function (resolve) {
      settle = resolve;
    });
    activeSession._eazAbort = function () {
      finishSession(null);
    };

    if (immediate) {
      // Keep a top-layer dialog open so crop UI can mount after the OS picker.
      // Brief stay-on-page tip while the OS picker opens (same gesture turn).
      ensureRootOpen();
      clearRootContent();
      var tipImmediate = document.createElement('div');
      tipImmediate.className = 'eaz-ss-msg';
      tipImmediate.setAttribute('data-t', 'creator.generator.screenshot_hint');
      tipImmediate.textContent = t(
        'screenshot_hint',
        'Recommended: share this tab (stays here). To capture another site without leaving: open it in a separate window and share that Window or Entire Screen — not another browser tab.'
      );
      getRoot().appendChild(tipImmediate);
      runCaptureThenCrop();
      return activeSession;
    }

    var root = ensureRootOpen();
    clearRootContent();

    var panel = document.createElement('div');
    panel.className = 'eaz-ss-float';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('screenshot_take', 'Take Screenshot'));

    var hint = document.createElement('p');
    hint.className = 'eaz-ss-float__hint';
    hint.setAttribute('data-t', 'creator.generator.screenshot_hint');
    hint.textContent = t(
      'screenshot_hint',
      'Recommended: share this tab (stays here). To capture another site without leaving: open it in a separate window and share that Window or Entire Screen — not another browser tab.'
    );

    var tip = document.createElement('p');
    tip.className = 'eaz-ss-float__hint';
    tip.setAttribute('data-t', 'creator.generator.screenshot_stay_hint');
    tip.textContent = t(
      'screenshot_stay_hint',
      'Sharing another browser tab may switch you to that page — browsers do this for security.'
    );

    var actions = document.createElement('div');
    actions.className = 'eaz-ss-float__actions';

    var btnTake = document.createElement('button');
    btnTake.type = 'button';
    btnTake.className = 'eaz-ss-btn eaz-ss-btn--primary';
    btnTake.textContent = t('screenshot_take', 'Take Screenshot');

    var btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'eaz-ss-btn eaz-ss-btn--ghost';
    btnCancel.textContent = t('screenshot_cancel', 'Cancel');

    actions.appendChild(btnCancel);
    actions.appendChild(btnTake);
    panel.appendChild(hint);
    panel.appendChild(tip);
    panel.appendChild(actions);
    root.appendChild(panel);

    btnCancel.addEventListener('click', function () {
      finishSession(null);
    });

    btnTake.addEventListener('click', function () {
      btnTake.disabled = true;
      btnCancel.disabled = true;
      runCaptureThenCrop();
    });

    return activeSession;
  }

  /**
   * Apply captured file to a file input (same path as Device upload).
   */
  function applyFileToInput(input, file) {
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

  global.EazScreenshotCapture = {
    isSupported: isSupported,
    canUse: canUse,
    start: start,
    bindOption: bindOption,
    setButtonEnabled: setButtonEnabled,
    applyFileToInput: applyFileToInput
  };
})(typeof window !== 'undefined' ? window : this);
