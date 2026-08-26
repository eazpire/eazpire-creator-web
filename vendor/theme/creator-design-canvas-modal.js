/**
 * Designs Canvas editor — Add Text, then hand PNG to DesignUploadModal.
 * Layout constants stay in sync with src/features/creator/designCanvasTextLayout.js
 */
(function () {
  'use strict';

  var MODAL_ID = 'creator-design-canvas-modal';
  var EXPORT_SIZE = 4500;
  var REF_SIZE = 1000;
  var MARGIN_RATIO = 0.08;
  var LINE_HEIGHT = 1.05;

  var ctx = null;
  var bound = false;
  var stageObserver = null;

  function t(key, fallback) {
    var i18n = window.CreatorI18n && window.CreatorI18n.my_creations;
    if (i18n && i18n[key]) return i18n[key];
    return fallback;
  }

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function exportFontPx(sizeKey) {
    var n = Number(sizeKey);
    if (!isFinite(n) || n <= 0) n = 88;
    return n * (EXPORT_SIZE / REF_SIZE);
  }

  function viewerFontPx(stageWidth, sizeKey) {
    var n = Number(sizeKey);
    if (!isFinite(n) || n <= 0) n = 88;
    var width = Number(stageWidth);
    if (!isFinite(width) || width <= 0) return 24;
    return width * (n / REF_SIZE);
  }

  function wrapLines(text, maxWidth, measure) {
    var source = String(text || '');
    var paragraphs = source.split('\n');
    var lines = [];
    var safeWidth = isFinite(maxWidth) && maxWidth > 0 ? maxWidth : 1;
    var i;
    var w;
    for (i = 0; i < paragraphs.length; i++) {
      var para = paragraphs[i];
      if (!para) {
        lines.push('');
        continue;
      }
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }
      var current = '';
      for (w = 0; w < words.length; w++) {
        var word = words[w];
        var trial = current ? current + ' ' + word : word;
        if (!current || measure(trial) <= safeWidth) {
          current = trial;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  function selectedFontFamily(modal) {
    var sel = modal.querySelector('#design-canvas-font');
    var opt = sel && sel.options[sel.selectedIndex];
    return (opt && opt.getAttribute('data-family')) || 'Arial, Helvetica, sans-serif';
  }

  function selectedSize(modal) {
    var sel = modal.querySelector('#design-canvas-size');
    return (sel && sel.value) || '88';
  }

  function selectedAlign(modal) {
    var btn = modal.querySelector('.design-canvas-modal__align-btn.is-active');
    return (btn && btn.getAttribute('data-align')) || 'center';
  }

  function selectedColor(modal) {
    var swatch = modal.querySelector('.design-canvas-modal__swatch.is-active');
    return {
      id: (swatch && swatch.getAttribute('data-color-id')) || 'white',
      hex: (swatch && swatch.getAttribute('data-hex')) || '#F8FAFC',
      label: (swatch && swatch.getAttribute('title')) || t('canvas_color_white', 'White')
    };
  }

  function currentText(modal) {
    var input = modal.querySelector('#design-canvas-text-input');
    return input ? String(input.value || '') : '';
  }

  function placeholderText(modal) {
    var el = modal.querySelector('#design-canvas-text');
    return (el && el.getAttribute('data-placeholder')) || t('canvas_text_placeholder', 'Your text');
  }

  function applyPreview(modal) {
    var textEl = modal.querySelector('#design-canvas-text');
    var wrap = modal.querySelector('#design-canvas-text-wrap');
    var stage = modal.querySelector('#design-canvas-stage');
    var useBtn = modal.querySelector('#design-canvas-modal-use');
    var colorName = modal.querySelector('#design-canvas-color-name');
    if (!textEl || !wrap || !stage) return;

    var raw = currentText(modal).trim();
    var color = selectedColor(modal);
    var align = selectedAlign(modal);
    var family = selectedFontFamily(modal);
    var sizeKey = selectedSize(modal);
    var display = raw || placeholderText(modal);

    wrap.setAttribute('data-align', align);
    textEl.textContent = display;
    textEl.classList.toggle('is-placeholder', !raw);
    textEl.style.fontFamily = family;
    textEl.style.color = color.hex;
    textEl.style.fontSize = viewerFontPx(stage.clientWidth, sizeKey) + 'px';
    if (family.indexOf('Impact') !== -1) {
      textEl.style.letterSpacing = '0.02em';
    } else {
      textEl.style.letterSpacing = '';
    }
    if (colorName) colorName.textContent = color.label;
    if (useBtn) useBtn.disabled = !raw;
  }

  function exportPngFile(modal) {
    var text = currentText(modal).trim();
    if (!text) return Promise.reject(new Error('empty'));
    var family = selectedFontFamily(modal);
    var sizeKey = selectedSize(modal);
    var align = selectedAlign(modal);
    var color = selectedColor(modal);
    var fontPx = exportFontPx(sizeKey);
    var canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    var c = canvas.getContext('2d');
    if (!c) return Promise.reject(new Error('no-context'));
    c.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    c.font = '700 ' + fontPx + 'px ' + family;
    c.fillStyle = color.hex;
    c.textBaseline = 'middle';
    c.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
    var maxWidth = EXPORT_SIZE * (1 - 2 * MARGIN_RATIO);
    var lines = wrapLines(text, maxWidth, function (s) {
      return c.measureText(s).width;
    });
    var lineH = fontPx * LINE_HEIGHT;
    var totalH = lines.length * lineH;
    var x =
      align === 'left'
        ? EXPORT_SIZE * MARGIN_RATIO
        : align === 'right'
          ? EXPORT_SIZE * (1 - MARGIN_RATIO)
          : EXPORT_SIZE / 2;
    var startY = EXPORT_SIZE / 2 - totalH / 2 + lineH / 2;
    var i;
    for (i = 0; i < lines.length; i++) {
      c.fillText(lines[i], x, startY + i * lineH, maxWidth);
    }
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('blob'));
          return;
        }
        resolve(new File([blob], 'canvas-design.png', { type: 'image/png' }));
      }, 'image/png');
    });
  }

  function resetState(modal) {
    var input = modal.querySelector('#design-canvas-text-input');
    var font = modal.querySelector('#design-canvas-font');
    var size = modal.querySelector('#design-canvas-size');
    if (input) input.value = '';
    if (font) font.value = 'impact';
    if (size) size.value = '88';
    modal.querySelectorAll('.design-canvas-modal__align-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-align') === 'center');
    });
    modal.querySelectorAll('.design-canvas-modal__swatch').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-color-id') === 'white');
    });
    applyPreview(modal);
  }

  function close(fromCancel) {
    var modal = getModal();
    var cancelCb = ctx && ctx.onCancel;
    ctx = null;
    if (modal && modal.open && typeof modal.close === 'function') {
      modal.close();
    }
    if (fromCancel && typeof cancelCb === 'function') {
      window.setTimeout(cancelCb, 40);
    }
  }

  function openDesignUpload(sectionId, file) {
    if (!window.DesignUploadModal || typeof window.DesignUploadModal.init !== 'function') {
      console.warn('[DesignCanvas] DesignUploadModal missing');
      return;
    }
    var api = window.DesignUploadModal.init({ sectionId: sectionId, selectedFile: file });
    if (api && typeof api.open === 'function') api.open();
  }

  function bind(modal) {
    if (bound) return;
    bound = true;
    var textEl = modal.querySelector('#design-canvas-text');
    if (textEl && !textEl.getAttribute('data-placeholder')) {
      textEl.setAttribute('data-placeholder', textEl.textContent || t('canvas_text_placeholder', 'Your text'));
    }

    var input = modal.querySelector('#design-canvas-text-input');
    var font = modal.querySelector('#design-canvas-font');
    var size = modal.querySelector('#design-canvas-size');
    if (input) input.addEventListener('input', function () { applyPreview(modal); });
    if (font) font.addEventListener('change', function () { applyPreview(modal); });
    if (size) size.addEventListener('change', function () { applyPreview(modal); });

    modal.querySelectorAll('.design-canvas-modal__align-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modal.querySelectorAll('.design-canvas-modal__align-btn').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        applyPreview(modal);
      });
    });
    modal.querySelectorAll('.design-canvas-modal__swatch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modal.querySelectorAll('.design-canvas-modal__swatch').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        applyPreview(modal);
      });
    });

    var closeBtn = modal.querySelector('#design-canvas-modal-close');
    var cancelBtn = modal.querySelector('#design-canvas-modal-cancel');
    var useBtn = modal.querySelector('#design-canvas-modal-use');
    if (closeBtn) closeBtn.addEventListener('click', function () { close(true); });
    if (cancelBtn) cancelBtn.addEventListener('click', function () { close(true); });
    modal.addEventListener('cancel', function (e) {
      e.preventDefault();
      close(true);
    });
    if (useBtn) {
      useBtn.addEventListener('click', function () {
        if (useBtn.disabled) return;
        var sectionId = (ctx && ctx.sectionId) || '';
        useBtn.disabled = true;
        exportPngFile(modal)
          .then(function (file) {
            close(false);
            openDesignUpload(sectionId, file);
          })
          .catch(function () {
            useBtn.disabled = false;
            window.alert(t('canvas_export_failed', 'Could not create the design image. Please try again.'));
          });
      });
    }

    var stage = modal.querySelector('#design-canvas-stage');
    if (stage && typeof ResizeObserver === 'function') {
      stageObserver = new ResizeObserver(function () { applyPreview(modal); });
      stageObserver.observe(stage);
    }
  }

  function open(options) {
    var modal = getModal();
    if (!modal || typeof modal.showModal !== 'function') return;
    ctx = options || {};
    bind(modal);
    resetState(modal);
    if (!modal.open) modal.showModal();
    window.setTimeout(function () {
      var input = modal.querySelector('#design-canvas-text-input');
      if (input) input.focus();
      applyPreview(modal);
    }, 40);
  }

  window.DesignCanvasModal = { open: open, close: function () { close(false); } };
})();
