/**
 * Design Upload Modal Logic für My Creations
 * - Liest Upload-Optionen aus dem Modal
 * - Verwaltet Upload-Status und Validierung
 *
 * ✅ Fixes:
 * - Action Bar wird NICHT mehr in den Placeholder gerendert (sonst unclickable / kein Platz)
 * - Action Bar ist im Liquid unter dem Placeholder => Buttons klickbar
 * - CSS Parse Bug umgangen (Dialog-Block im Liquid korrekt schließen)
 * - updateActionButtons() toggelt Bar visibility + `has-actions` (Rundungen bündig)
 * - Remove-Button (X) per event delegation robust via closest()
 */

(function () {
  'use strict';

  if (!window.DesignUploadModal) {
    window.DesignUploadModal = {
      init: function (config) {
        var selectedFile = config && config.selectedFile ? config.selectedFile : null;
        var sectionId = (config && config.sectionId) || 'creator-mobile';
        var ownerId = typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null
          ? String(window.__EAZ_OWNER_ID)
          : null;
        var apiBase = (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL)
          ? window.CREATOR_API_CONFIG.BASE_URL
          : 'https://creator-engine.eazpire.workers.dev';
        var instance = window.CreatorDesignUploadModal && typeof window.CreatorDesignUploadModal.init === 'function'
          ? window.CreatorDesignUploadModal.init({
              sectionId: sectionId,
              ownerId: ownerId,
              apiBase: apiBase,
              selectedFile: selectedFile
            })
          : null;
        return {
          open: function () {
            if (instance && typeof instance.openDesignUploadModal === 'function') {
              instance.openDesignUploadModal();
              return;
            }
            window.location.href = '/pages/creator-dashboard#creations';
          }
        };
      }
    };
  }

  window.CreatorDesignUploadModal = {
    init: function (config) {
      const { sectionId, onUploadStart, ownerId, apiBase, selectedFile, shopMode } = config || {};
      if (!sectionId) {
        console.warn('CreatorDesignUploadModal.init: missing sectionId', config);
        return;
      }

      var existing = window.CreatorDesignUploadModalInstances && window.CreatorDesignUploadModalInstances[sectionId];
      if (existing) {
        if (selectedFile && typeof existing._setTempSelectedFile === 'function') {
          existing._setTempSelectedFile(selectedFile);
        }
        if (onUploadStart && typeof existing._setOnUploadStart === 'function') {
          existing._setOnUploadStart(onUploadStart);
        }
        if (shopMode !== undefined && typeof existing._setShopMode === 'function') {
          existing._setShopMode(!!shopMode);
        }
        return existing;
      }

      const modal = document.getElementById(`design-upload-modal-${sectionId}`);
      if (!modal) {
        console.warn('CreatorDesignUploadModal.init: modal not found', `design-upload-modal-${sectionId}`);
        return;
      }

      return initUploadLogic(modal, sectionId, onUploadStart, ownerId, apiBase, selectedFile, !!shopMode);
    }
  };

  function openFileSelector(modal, setSelectedFile) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/svg+xml';
    fileInput.style.display = 'none';

    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) {
        document.body.removeChild(fileInput);
        return;
      }

      const maxSize = 30 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('Die Datei ist zu groß. Maximale Größe: 30MB');
        document.body.removeChild(fileInput);
        return;
      }

      const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        alert('Ungültiger Dateityp. Erlaubt sind: PNG, JPG, SVG');
        document.body.removeChild(fileInput);
        return;
      }

      console.log('📁 Neue Datei ausgewählt:', file.name, 'Größe:', file.size);

      if (setSelectedFile) {
        setSelectedFile(file);
      }
      displayFilePreview(modal, file);

      document.body.removeChild(fileInput);
    });

    fileInput.click();
  }

  function showErrorMessage(modal, message, type = 'error') {
    // Remove existing error messages
    const existingErrors = modal.querySelectorAll('.design-upload-error');
    existingErrors.forEach(el => el.remove());

    // Create error message element
    const errorEl = document.createElement('div');
    errorEl.className = `design-upload-error design-upload-error--${type}`;
    errorEl.textContent = message;

    // Add to modal
    const placeholder = modal.querySelector('.design-upload-placeholder');
    if (placeholder) {
      placeholder.appendChild(errorEl);
    }

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorEl.parentNode) {
        errorEl.remove();
      }
    }, 5000);
  }

  /**
   * Berechnet die sichtbare Rechteckfläche des Bildes (object-fit: contain) relativ zum Preview-Container.
   */
  function getContainedImageRect(previewEl, img) {
    const cw = previewEl.clientWidth || previewEl.offsetWidth;
    const ch = previewEl.clientHeight || previewEl.offsetHeight;
    const nw = img.naturalWidth || img.width || 0;
    const nh = img.naturalHeight || img.height || 0;
    if (nw <= 0 || nh <= 0) return null;
    const scale = Math.min(cw / nw, ch / nh);
    const w = Math.round(nw * scale);
    const h = Math.round(nh * scale);
    const left = Math.round((cw - w) / 2);
    const top = Math.round((ch - h) / 2);
    return { left, top, width: w, height: h };
  }

  const FRAME_MIN_SIZE = 24;

  /** Matches worker `MIN_PRINT_SIDE_PX` — uploads below this short side get Picsart upscale. */
  const MIN_PRINT_SIDE_PX = 4096;
  const UPSCALE_FACTOR = 4;

  function formatResolutionLabel(w, h) {
    const width = Math.round(Number(w) || 0);
    const height = Math.round(Number(h) || 0);
    if (width <= 0 || height <= 0) return '—';
    return width + '\u00d7' + height;
  }

  function formatMbLabel(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '0';
    const mb = n / (1024 * 1024);
    if (mb < 0.1) return mb.toFixed(2);
    if (mb < 10) return mb.toFixed(1);
    return String(Math.round(mb * 10) / 10);
  }

  function needsUpscaleForPrintQuality(width, height) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return true;
    return Math.min(w, h) < MIN_PRINT_SIDE_PX;
  }

  function estimateUpscaleDimensions(width, height, bytes) {
    const w = Math.round(Number(width) || 0);
    const h = Math.round(Number(height) || 0);
    const b = Number(bytes) || 0;
    return {
      width: w > 0 ? w * UPSCALE_FACTOR : 0,
      height: h > 0 ? h * UPSCALE_FACTOR : 0,
      bytes: b > 0 ? Math.round(b * UPSCALE_FACTOR * UPSCALE_FACTOR) : 0,
      factor: UPSCALE_FACTOR
    };
  }

  function i18nUploadModal(key, fallback) {
    if (typeof window.getI18n === 'function') {
      const v = window.getI18n(key, fallback);
      if (v != null && v !== '') return v;
    }
    return fallback;
  }

  function showUpscaleInfoModal(meta) {
    if (!meta || !meta.needsUpscale) return;
    const existing = document.getElementById('creator-upload-upscale-info');
    if (existing) existing.remove();

    const est = estimateUpscaleDimensions(meta.width, meta.height, meta.bytes);
    const overlay = document.createElement('div');
    overlay.id = 'creator-upload-upscale-info';
    overlay.className = 'creator-upload-upscale-info-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const dialog = document.createElement('div');
    dialog.className = 'creator-upload-upscale-info-dialog';
    dialog.innerHTML =
      '<h3>' + escapeUploadHtml(i18nUploadModal('uploadModalUpscaleInfoTitle', 'Automatic upscale')) + '</h3>' +
      '<div class="creator-upload-upscale-info-dialog__row">' +
        '<span class="creator-upload-upscale-info-dialog__label">' +
          escapeUploadHtml(i18nUploadModal('uploadModalUpscaleInfoOriginal', 'Original')) +
        '</span>' +
        '<span class="creator-upload-upscale-info-dialog__value">' +
          escapeUploadHtml(formatResolutionLabel(meta.width, meta.height) + ' · ' + formatMbLabel(meta.bytes) + ' MB') +
        '</span>' +
      '</div>' +
      '<div class="creator-upload-upscale-info-dialog__row">' +
        '<span class="creator-upload-upscale-info-dialog__label">' +
          escapeUploadHtml(i18nUploadModal('uploadModalUpscaleInfoEstimated', 'After upscale (estimated)')) +
        '</span>' +
        '<span class="creator-upload-upscale-info-dialog__value">' +
          escapeUploadHtml(formatResolutionLabel(est.width, est.height) + ' · ~' + formatMbLabel(est.bytes) + ' MB') +
        '</span>' +
      '</div>' +
      '<p class="creator-upload-upscale-info-dialog__note">' +
        escapeUploadHtml(i18nUploadModal(
          'uploadModalUpscaleInfoAuto',
          'Upscale runs automatically when you upload if the image is below print quality (shorter side under 4096 px).'
        )) +
      '</p>' +
      '<button type="button" class="creator-upload-upscale-info-dialog__btn">' +
        escapeUploadHtml(i18nUploadModal('uploadModalUpscaleInfoClose', 'Got it')) +
      '</button>';

    function close() {
      overlay.remove();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    dialog.querySelector('.creator-upload-upscale-info-dialog__btn').addEventListener('click', close);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function escapeUploadHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildPreviewMetaMarkup() {
    // Resolution: value only. Size: "1.4 MB" (value then unit).
    return (
      '<div class="design-upload-preview__meta" data-upload-preview-meta="1">' +
        '<span class="design-upload-preview__meta-chip" data-upload-meta="resolution">' +
          '<span data-upload-meta-value="resolution">—</span>' +
        '</span>' +
        '<span class="design-upload-preview__meta-chip" data-upload-meta="size">' +
          '<span data-upload-meta-value="size">—</span>' +
          '<span class="design-upload-preview__meta-unit">' +
            escapeUploadHtml(i18nUploadModal('uploadModalLabelSizeMb', 'MB')) +
          '</span>' +
        '</span>' +
        '<button type="button" class="design-upload-preview__meta-chip design-upload-preview__meta-chip--upscale" data-upload-meta="upscale" hidden>' +
          escapeUploadHtml(i18nUploadModal('uploadModalLabelUpscale', 'Upscale')) +
        '</button>' +
      '</div>'
    );
  }

  function updatePreviewMetaLabels(modal, file, width, height) {
    const placeholder = modal && modal.querySelector('.design-upload-placeholder');
    if (!placeholder) return null;
    // Always host on placeholder (position:relative) so chips sit above crop frame / image.
    let metaEl = placeholder.querySelector('.design-upload-preview__meta');
    if (!metaEl) {
      placeholder.insertAdjacentHTML('beforeend', buildPreviewMetaMarkup());
      metaEl = placeholder.querySelector('.design-upload-preview__meta');
    }
    if (!metaEl) return null;

    const isSvg = !!(file && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '')));
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    const bytes = file && file.size != null ? Number(file.size) : 0;
    const measured = w > 0 && h > 0;
    // Only show Upscale once we have real pixel size (avoid flash before measure).
    const needsUpscale = !isSvg && measured && needsUpscaleForPrintQuality(w, h);

    const resVal = metaEl.querySelector('[data-upload-meta-value="resolution"]');
    const sizeVal = metaEl.querySelector('[data-upload-meta-value="size"]');
    const upscaleBtn = metaEl.querySelector('[data-upload-meta="upscale"]');
    if (resVal) resVal.textContent = isSvg ? 'SVG' : formatResolutionLabel(w, h);
    if (sizeVal) sizeVal.textContent = formatMbLabel(bytes);
    if (upscaleBtn) {
      if (needsUpscale) {
        upscaleBtn.hidden = false;
        upscaleBtn.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation();
          showUpscaleInfoModal({ width: w, height: h, bytes: bytes, needsUpscale: true });
        };
      } else {
        upscaleBtn.hidden = true;
        upscaleBtn.onclick = null;
      }
    }

    const meta = { width: w, height: h, bytes: bytes, needsUpscale: needsUpscale, isSvg: isSvg };
    const api = window.CreatorDesignUploadModalInstances && window.CreatorDesignUploadModalInstances.__active;
    if (api) api._fileMeta = meta;
    return meta;
  }

  function detectImageDimensions(file, imgEl) {
    return new Promise(function (resolve) {
      if (imgEl && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
        resolve({ width: imgEl.naturalWidth, height: imgEl.naturalHeight });
        return;
      }
      if (!file || file.type === 'image/svg+xml') {
        resolve({ width: 0, height: 0 });
        return;
      }
      const url = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = function () {
        const dim = { width: probe.naturalWidth || 0, height: probe.naturalHeight || 0 };
        URL.revokeObjectURL(url);
        resolve(dim);
      };
      probe.onerror = function () {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      probe.src = url;
    });
  }

  function mapUploadJobStatus(data) {
    if (!data) return 'uploading';
    if (data.error || data.failed) return 'failed';
    if (data.saved || data.done) return 'done';
    const msg = String(data.message || '').toLowerCase();
    const p = Number(data.progress) || 0;
    if (msg.indexOf('skalier') >= 0 || msg.indexOf('upscale') >= 0 || msg.indexOf('hochskal') >= 0) {
      return 'upscaling';
    }
    if (msg.indexOf('speicher') >= 0 || msg.indexOf('saving') >= 0 || msg.indexOf('gespeichert') >= 0) {
      return 'saving';
    }
    if (
      msg.indexOf('metadaten') >= 0 ||
      msg.indexOf('metadata') >= 0 ||
      msg.indexOf('beschneid') >= 0 ||
      msg.indexOf('crop') >= 0 ||
      msg.indexOf('verarbeit') >= 0
    ) {
      return 'processing';
    }
    if (msg.indexOf('lade bilder') >= 0 || (msg.indexOf('hoch') >= 0 && p >= 70)) return 'saving';
    if (p < 15) return 'uploading';
    if (p < 50) return 'processing';
    if (p < 70) return 'upscaling';
    return 'saving';
  }

  function dispatchUploadPlaceholder(detail) {
    try {
      window.dispatchEvent(new CustomEvent('creatorUploadPlaceholder', { detail: detail || {} }));
    } catch (_) {}
  }

  function dispatchUploadProgress(detail) {
    try {
      window.dispatchEvent(new CustomEvent('creatorUploadProgress', { detail: detail || {} }));
    } catch (_) {}
  }

  function normalizePngCropName(name) {
    const base = (name || 'upload').replace(/\.[^.]+$/, '');
    return base + '-cropped.png';
  }

  function getShopStudioWidgetSid() {
    const w = document.querySelector('[data-eaz-shop-design-studio="1"]');
    if (!w || !w.id) return null;
    const m = /^creator-widget-(.+)$/.exec(w.id);
    return m ? m[1] : null;
  }

  function isShopDesignUploadModal(modal) {
    return !!(modal && modal.classList && modal.classList.contains('eaz-shop-design-upload-modal'));
  }

  function renderShopUploadModalEmptyPlaceholder(modal) {
    const placeholder = modal.querySelector('.design-upload-placeholder');
    if (!placeholder) return;
    const line1 =
      typeof window.getI18n === 'function'
        ? window.getI18n('uploadModalDropzoneTextAddAnother', 'Tap to add another image')
        : 'Tap to add another image';
    const line2 =
      typeof window.getI18n === 'function'
        ? window.getI18n('uploadModalDropzoneHint', 'PNG, JPG, SVG up to 30MB')
        : 'PNG, JPG, SVG up to 30MB';
    placeholder.innerHTML = `
        <div class="design-upload-placeholder__image">
          <div class="design-upload-placeholder__icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="design-upload-placeholder__text">
            <p>${line1}</p>
            <small>${line2}</small>
          </div>
        </div>
      `;
  }

  async function convertImageFileToPngIfNeeded(file) {
    if (!file || !file.type || file.type.indexOf('png') !== -1) return file;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          c.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              reject(new Error('png_convert_failed'));
              return;
            }
            resolve(new File([blob], normalizePngCropName(file.name), { type: 'image/png' }));
          }, 'image/png', 0.95);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image_load_failed'));
      };
      img.src = url;
    });
  }

  /** Visible image box inside preview — prefer real layout over theoretical contain math. */
  function getDisplayedImageRect(previewEl, img) {
    if (!previewEl || !img) return getContainedImageRect(previewEl, img);
    try {
      const pr = previewEl.getBoundingClientRect();
      const ir = img.getBoundingClientRect();
      if (pr.width > 0 && pr.height > 0 && ir.width > 0 && ir.height > 0) {
        return {
          left: Math.round(ir.left - pr.left),
          top: Math.round(ir.top - pr.top),
          width: Math.round(ir.width),
          height: Math.round(ir.height),
        };
      }
    } catch (_) {}
    return getContainedImageRect(previewEl, img);
  }

  function isFrameFullImage(frame, displayed) {
    if (!frame || !displayed) return true;
    const fl = parseFloat(frame.style.left) || 0;
    const ft = parseFloat(frame.style.top) || 0;
    const fw = parseFloat(frame.style.width) || 0;
    const fh = parseFloat(frame.style.height) || 0;
    if (fw <= 0 || fh <= 0) return true;
    // Stale frame after layout/resize (outside preview image) → treat as full = auto-crop.
    const outside =
      fl + fw < displayed.left - 4 ||
      ft + fh < displayed.top - 4 ||
      fl > displayed.left + displayed.width + 4 ||
      ft > displayed.top + displayed.height + 4;
    if (outside) return true;
    return (
      Math.abs(fw - displayed.width) < 3 &&
      Math.abs(fh - displayed.height) < 3 &&
      Math.abs(fl - displayed.left) < 3 &&
      Math.abs(ft - displayed.top) < 3
    );
  }

  async function exportManualCropFromFrame(modal, file) {
    const placeholder = modal.querySelector('.design-upload-placeholder');
    const preview = placeholder && placeholder.querySelector('.design-upload-preview');
    const frame = preview && preview.querySelector('.design-upload-frame');
    const img = preview && preview.querySelector('.design-upload-preview__full-image');
    if (!preview || !frame || !img || !file) return null;
    const displayed = getDisplayedImageRect(preview, img);
    if (!displayed || displayed.width <= 0 || displayed.height <= 0) return null;
    if (isFrameFullImage(frame, displayed)) return null;

    const fl = parseFloat(frame.style.left) || 0;
    const ft = parseFloat(frame.style.top) || 0;
    const fw = parseFloat(frame.style.width) || 0;
    const fh = parseFloat(frame.style.height) || 0;
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (nw <= 0 || nh <= 0 || fw <= 0 || fh <= 0) return null;

    const ix = Math.round(((fl - displayed.left) / displayed.width) * nw);
    const iy = Math.round(((ft - displayed.top) / displayed.height) * nh);
    const iw = Math.round((fw / displayed.width) * nw);
    const ih = Math.round((fh / displayed.height) * nh);
    const sx = Math.max(0, Math.min(nw - 1, ix));
    const sy = Math.max(0, Math.min(nh - 1, iy));
    const sw = Math.max(1, Math.min(nw - sx, iw));
    const sh = Math.max(1, Math.min(nh - sy, ih));
    const url = URL.createObjectURL(file);
    const i2 = new Image();
    try {
      await new Promise((resolve, reject) => {
        i2.onload = resolve;
        i2.onerror = function () { reject(new Error('image_load_failed')); };
        i2.src = url;
      });
      const c = document.createElement('canvas');
      c.width = sw;
      c.height = sh;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(i2, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
      if (!blob) return null;
      return new File([blob], normalizePngCropName(file.name), { type: 'image/png' });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function startFrameMove(e) {
    e.preventDefault();
    if (e.pointerId != null) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
    const frame = e.currentTarget.closest('.design-upload-frame');
    const preview = frame && frame.parentElement;
    if (!preview) return;
    const previewRect = preview.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let startLeft = parseFloat(frame.style.left) || 0;
    let startTop = parseFloat(frame.style.top) || 0;
    const frameW = parseFloat(frame.style.width) || 0;
    const frameH = parseFloat(frame.style.height) || 0;
    const maxLeft = Math.max(0, previewRect.width - frameW);
    const maxTop = Math.max(0, previewRect.height - frameH);
    const captureEl = e.currentTarget;

    function onMove(e2) {
      const dx = e2.clientX - startX;
      const dy = e2.clientY - startY;
      frame.style.left = Math.max(0, Math.min(maxLeft, startLeft + dx)) + 'px';
      frame.style.top = Math.max(0, Math.min(maxTop, startTop + dy)) + 'px';
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      try {
        if (captureEl && captureEl.releasePointerCapture && e.pointerId != null) {
          captureEl.releasePointerCapture(e.pointerId);
        }
      } catch (err2) {}
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function startFrameResize(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerId != null) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
    const frame = e.currentTarget.closest('.design-upload-frame');
    const preview = frame && frame.parentElement;
    if (!preview) return;
    const previewRect = preview.getBoundingClientRect();
    const pw = previewRect.width;
    const ph = previewRect.height;

    let left = parseFloat(frame.style.left) || 0;
    let top = parseFloat(frame.style.top) || 0;
    let right = left + (parseFloat(frame.style.width) || 0);
    let bottom = top + (parseFloat(frame.style.height) || 0);

    function toLocal(clientX, clientY) {
      return {
        x: clientX - previewRect.left,
        y: clientY - previewRect.top
      };
    }
    function clamp(v, a, b) {
      return Math.max(a, Math.min(b, v));
    }

    const resizeHandleEl = e.currentTarget;

    function onMove(e2) {
      const loc = toLocal(e2.clientX, e2.clientY);
      if (handle.indexOf('l') !== -1) left = clamp(loc.x, 0, right - FRAME_MIN_SIZE);
      if (handle.indexOf('r') !== -1) right = clamp(loc.x, left + FRAME_MIN_SIZE, pw);
      if (handle.indexOf('t') !== -1) top = clamp(loc.y, 0, bottom - FRAME_MIN_SIZE);
      if (handle.indexOf('b') !== -1) bottom = clamp(loc.y, top + FRAME_MIN_SIZE, ph);
      frame.style.left = left + 'px';
      frame.style.top = top + 'px';
      frame.style.width = (right - left) + 'px';
      frame.style.height = (bottom - top) + 'px';
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      try {
        if (resizeHandleEl && resizeHandleEl.releasePointerCapture && e.pointerId != null) {
          resizeHandleEl.releasePointerCapture(e.pointerId);
        }
      } catch (err2) {}
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function createDesignFrame(previewEl, img) {
    const existing = previewEl.querySelector('.design-upload-frame');
    if (existing) existing.remove();

    const rect = getDisplayedImageRect(previewEl, img) || getContainedImageRect(previewEl, img);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const frame = document.createElement('div');
    frame.className = 'design-upload-frame';
    frame.style.left = rect.left + 'px';
    frame.style.top = rect.top + 'px';
    frame.style.width = rect.width + 'px';
    frame.style.height = rect.height + 'px';

    const center = document.createElement('div');
    center.className = 'design-upload-frame__center';
    center.setAttribute('aria-label', 'Rahmen verschieben');
    center.addEventListener('pointerdown', startFrameMove);
    frame.appendChild(center);

    ['tl', 'tr', 'br', 'bl', 't', 'r', 'b', 'l'].forEach(function (pos) {
      const handle = document.createElement('div');
      handle.className = 'design-upload-frame__resize design-upload-frame__resize--' + pos;
      handle.dataset.handle = pos;
      handle.addEventListener('pointerdown', function (ev) { startFrameResize(ev, pos); });
      frame.appendChild(handle);
    });

    previewEl.appendChild(frame);
    return true;
  }

  function displayFilePreview(modal, file) {
    const placeholder = modal.querySelector('.design-upload-placeholder');
    if (!placeholder) {
      console.error('❌ Platzhalter-Element nicht gefunden');
      return;
    }

    console.log('📸 Erstelle Datei-Vorschau für:', file.name, 'Größe:', file.size, 'bytes');

    if (isShopDesignUploadModal(modal)) {
      try {
        const prev = modal.dataset.eazShopStripBlobUrl;
        if (prev) URL.revokeObjectURL(prev);
      } catch (e) {}
      const imageUrl = URL.createObjectURL(file);
      modal.dataset.eazShopStripBlobUrl = imageUrl;
      const sid = getShopStudioWidgetSid();
      const input = sid ? document.getElementById('creatorImage-' + sid) : null;
      if (input) {
        input.dataset.imageUrl = imageUrl;
      }
      renderShopUploadModalEmptyPlaceholder(modal);
      placeholder.style.background = '';
      placeholder.style.borderColor = '';

      const api = window.CreatorDesignUploadModalInstances && window.CreatorDesignUploadModalInstances.__active;
      if (api && typeof api._setTempSelectedFile === 'function') {
        api._setTempSelectedFile(file);
      }
      if (api && typeof api._updateActionButtons === 'function') api._updateActionButtons();
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const imageUrl = URL.createObjectURL(file);
      console.log('📸 Object-URL erstellt:', imageUrl);

      placeholder.innerHTML =
        '<div class="design-upload-placeholder__image">' +
          '<button type="button" class="design-upload-preview__remove" aria-label="Design entfernen">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>' +
          '</button>' +
          '<div class="design-upload-preview">' +
            '<img src="' + imageUrl + '" alt="Vorschau: ' + escapeUploadHtml(file.name) + '" class="design-upload-preview__full-image">' +
          '</div>' +
        '</div>' +
        buildPreviewMetaMarkup();

      placeholder.style.background = '#1f2937';
      placeholder.style.borderColor = '#f97316';

      // Show MB (+ provisional Upscale) immediately; resolution fills in after measure.
      updatePreviewMetaLabels(modal, file, 0, 0);

      const preview = placeholder.querySelector('.design-upload-preview');
      const img = placeholder.querySelector('.design-upload-preview__full-image');
      if (preview && img) {
        function attachFrame() {
          var retries = 0;
          var maxRetries = 5;
          function tryCreate() {
            if (createDesignFrame(preview, img)) return;
            retries += 1;
            if (retries < maxRetries && (preview.clientWidth === 0 || preview.clientHeight === 0)) {
              setTimeout(tryCreate, 80);
            }
          }
          requestAnimationFrame(function () {
            requestAnimationFrame(tryCreate);
          });
        }
        function onPreviewReady() {
          attachFrame();
          detectImageDimensions(file, img).then(function (dim) {
            updatePreviewMetaLabels(modal, file, dim.width, dim.height);
          });
        }
        if (img.complete && img.naturalWidth > 0) {
          onPreviewReady();
        } else {
          img.addEventListener('load', onPreviewReady);
          // Fallback if load already fired between complete check and listener.
          detectImageDimensions(file, null).then(function (dim) {
            if (dim.width > 0 && dim.height > 0) {
              updatePreviewMetaLabels(modal, file, dim.width, dim.height);
            }
          });
        }
      } else if (file) {
        detectImageDimensions(file, null).then(function (dim) {
          updatePreviewMetaLabels(modal, file, dim.width, dim.height);
        });
      }

      // ✅ Bar/Buttons Zustand aktualisieren (Bar ist im Liquid, nicht im Placeholder!)
      const api = window.CreatorDesignUploadModalInstances && window.CreatorDesignUploadModalInstances.__active;
      if (api && typeof api._setTempSelectedFile === 'function') {
        api._setTempSelectedFile(file);
      }

      // fallback: wenn active instance nicht gesetzt ist, wird updateActionButtons später beim open/handler aufgerufen
      if (api && typeof api._updateActionButtons === 'function') api._updateActionButtons();

      console.log('✅ Datei-Vorschau erstellt:', file.name);
    };

    reader.onerror = (error) => {
      console.error('❌ Fehler beim Lesen der Datei:', error);
      alert(window.getI18n ? window.getI18n('errorLoadingPreview', 'Error loading image preview. Please try again.') : (window.CreatorI18n?.errorLoadingPreview || 'Error loading image preview. Please try again.'));
    };

    reader.readAsDataURL(file);
  }

  function initUploadLogic(modal, sectionId, onUploadStart, ownerIdParam, apiBaseParam, selectedFile, shopMode) {
    const closeBtn = modal.querySelector('.design-upload-modal__close');
    const backdrop = modal.querySelector('.design-upload-modal__backdrop');
    const cancelBtn = modal.querySelector('.design-upload-modal__button--secondary');
    const uploadBtn = modal.querySelector('.design-upload-modal__button--primary');
    const shopEazyBtn = modal.querySelector('[data-eaz-shop-upload-submit]');

    let ownerId = ownerIdParam || null;
    let apiBase = apiBaseParam || null;
    let savedUploadSettings = null;

    let tempSelectedFile = selectedFile || null;
    let onUploadStartRef = onUploadStart;
    let shopModeRef = !!shopMode;
    let originalSelectedFile = null;
    let isRemoveBgProcessing = false;
    let isCropProcessing = false;

    console.log('🔄 initUploadLogic - tempSelectedFile:', tempSelectedFile ? tempSelectedFile.name : 'null');

    if (!window.CreatorDesignUploadModal) window.CreatorDesignUploadModal = {};
    window.CreatorDesignUploadModal.savedUploadSettings = savedUploadSettings;

    function resolveOwnerId() {
      if (ownerId != null && String(ownerId).trim()) return String(ownerId).trim();
      if (typeof window.__EAZ_OWNER_ID !== 'undefined' && window.__EAZ_OWNER_ID != null && String(window.__EAZ_OWNER_ID).trim()) {
        ownerId = String(window.__EAZ_OWNER_ID).trim();
        return ownerId;
      }
      var meta = document.querySelector('meta[name="creator-owner-id"]');
      if (meta && meta.getAttribute('content') && String(meta.getAttribute('content')).trim()) {
        ownerId = String(meta.getAttribute('content')).trim();
        return ownerId;
      }
      return null;
    }

    function resolveApiBase() {
      if (apiBase && String(apiBase).trim()) {
        apiBase = String(apiBase).replace(/\/$/, '');
        return apiBase;
      }
      if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) {
        apiBase = String(window.CREATOR_API_CONFIG.BASE_URL).replace(/\/$/, '');
        return apiBase;
      }
      apiBase = 'https://creator-engine.eazpire.workers.dev';
      return apiBase;
    }

    /**
     * Same-origin / portal dispatch — never block UI on workers.dev alone
     * (can hang while /api/dispatch works on creator.eazpire.com).
     */
    function resolveDispatchUrl() {
      try {
        if (window.CREATOR_API_CONFIG && typeof window.CREATOR_API_CONFIG.getDispatchUrl === 'function') {
          var via = window.CREATOR_API_CONFIG.getDispatchUrl();
          if (via) return String(via).replace(/\/$/, '');
        }
      } catch (_e0) {}
      try {
        var host = (window.location && window.location.hostname) || '';
        if (host === 'creator.eazpire.com' || window.__CREATOR_PORTAL_HOST__) {
          return String(window.location.origin).replace(/\/$/, '') + '/api/dispatch';
        }
        if (host === 'www.eazpire.com' || host === 'eazpire.com') {
          return String(window.location.origin).replace(/\/$/, '') + '/__eaz/creator-dispatch';
        }
      } catch (_e1) {}
      if (window.CreatorWidget && window.CreatorWidget.apiBaseUrl) {
        return String(window.CreatorWidget.apiBaseUrl).replace(/\/$/, '');
      }
      var base = resolveApiBase();
      if (!base) return 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch';
      if (base.indexOf('/apps/creator-dispatch') !== -1 || base.indexOf('/api/dispatch') !== -1) {
        return base;
      }
      return base + '/apps/creator-dispatch';
    }

    var SETTINGS_FETCH_TIMEOUT_MS = 5000;

    function fetchWithTimeout(url, options, timeoutMs) {
      var ms = typeof timeoutMs === 'number' ? timeoutMs : SETTINGS_FETCH_TIMEOUT_MS;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      var opts = Object.assign({ credentials: 'include', cache: 'no-store' }, options || {});
      if (ctrl) opts.signal = ctrl.signal;
      var pending = fetch(url, opts);
      if (ctrl) {
        timer = setTimeout(function () {
          try { ctrl.abort(); } catch (_a) {}
        }, ms);
      }
      return pending.finally(function () {
        if (timer) clearTimeout(timer);
      });
    }

    async function parseJsonResponse(response) {
      var ct = (response.headers.get('content-type') || '').toLowerCase();
      var text = await response.text();
      if (!text) return {};
      var trimmed = text.trim();
      if (trimmed.charAt(0) === '<') {
        throw new Error('non_json_html_response');
      }
      if (ct.indexOf('application/json') === -1 && trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[') {
        throw new Error('non_json_response');
      }
      return JSON.parse(text);
    }

    async function waitForOwnerId(maxMs) {
      var limit = typeof maxMs === 'number' ? maxMs : 1500;
      var id = resolveOwnerId();
      if (id) return id;
      var start = Date.now();
      while (Date.now() - start < limit) {
        await new Promise(function (r) { setTimeout(r, 50); });
        id = resolveOwnerId();
        if (id) return id;
      }
      return null;
    }

    function setActionsBarVisible(visible) {
      const bar = modal.querySelector('.design-upload-actions-bar');
      if (!bar) return;
      bar.style.display = visible ? 'flex' : 'none';
    }

    function updateActionButtons() {
      const actionsContainer = modal.querySelector('.design-upload-actions-bar');
      const removeBgBtn = modal.querySelector('.design-upload-action-btn[data-action="remove_background"]');
      const cropBtn = modal.querySelector('.design-upload-action-btn[data-action="crop_image"]');
      const stack = modal.querySelector('.design-upload-preview-stack');
      const shopStrip = modal.classList.contains('eaz-shop-design-upload-modal');

      const hasFile = !!tempSelectedFile;
      const isEnabled = hasFile && !isRemoveBgProcessing && !isCropProcessing;
      const showActions = hasFile && !shopStrip;

      if (actionsContainer) actionsContainer.style.display = showActions ? 'flex' : 'none';
      if (stack) stack.classList.toggle('has-actions', showActions);

      if (removeBgBtn) removeBgBtn.disabled = !isEnabled || shopStrip;
      if (cropBtn) cropBtn.disabled = !isEnabled || shopStrip;
    }

    // Expose internal helpers for displayFilePreview() to update state
    if (!window.CreatorDesignUploadModalInstances) window.CreatorDesignUploadModalInstances = {};
    if (!window.CreatorDesignUploadModalInstances.__active) window.CreatorDesignUploadModalInstances.__active = null;

    // bind action handlers ONCE (bar stays stable in DOM)
    function bindActionButtonHandlersOnce() {
      const removeBgBtn = modal.querySelector('.design-upload-action-btn[data-action="remove_background"]');
      const cropBtn = modal.querySelector('.design-upload-action-btn[data-action="crop_image"]');
      const previewPlaceholder = modal.querySelector('.design-upload-placeholder');

      if (removeBgBtn && !removeBgBtn.dataset._bound) {
        removeBgBtn.dataset._bound = '1';

        removeBgBtn.addEventListener('click', async function (e) {
          e.preventDefault();
          e.stopPropagation();

          if (isRemoveBgProcessing) return;

          const isActive = this.getAttribute('data-active') === 'true';

          // Toggle OFF
          if (isActive) {
            this.setAttribute('data-active', 'false');

            if (originalSelectedFile) {
              tempSelectedFile = originalSelectedFile;
              displayFilePreview(modal, originalSelectedFile);
              updateActionButtons();
            }
            return;
          }

          // Toggle ON
          this.setAttribute('data-active', 'true');

          if (!tempSelectedFile) {
            this.setAttribute('data-active', 'false');
            return;
          }

          if (!originalSelectedFile) originalSelectedFile = tempSelectedFile;

          isRemoveBgProcessing = true;
          updateActionButtons();

          try {
            const apiBaseUrl = apiBase || window.api_base_url || window.API_BASE_URL || window.creator_api_base_url;
            let fileForBg = tempSelectedFile;
            fileForBg = await convertImageFileToPngIfNeeded(fileForBg);

            const processed = await window.EazpireRemoveBackground.removeBackgroundFlow({
              modal,
              previewPlaceholderEl: previewPlaceholder,
              apiBaseUrl,
              file: fileForBg,
              ownerId: resolveOwnerId(),
            });

            tempSelectedFile = processed;
            displayFilePreview(modal, processed);
            updateActionButtons();
          } catch (err) {
            console.error('[remove-bg] failed', err);
            this.setAttribute('data-active', 'false');

            // Show error message for insufficient EAZ
            if (err.message && err.message.includes('Nicht genug EAZ Guthaben')) {
              showErrorMessage(modal, 'Nicht genug EAZ Guthaben verfügbar. Bitte laden Sie EAZ auf.', 'error');
            } else {
              showErrorMessage(modal, 'Hintergrundentfernung fehlgeschlagen. Bitte versuchen Sie es erneut.', 'error');
            }
            if (originalSelectedFile) {
              tempSelectedFile = originalSelectedFile;
              displayFilePreview(modal, originalSelectedFile);
              updateActionButtons();
            }
          } finally {
            isRemoveBgProcessing = false;
            updateActionButtons();
          }
        });
      }

      if (cropBtn && !cropBtn.dataset._bound) {
        cropBtn.dataset._bound = '1';
        cropBtn.addEventListener('click', async function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (isCropProcessing || !tempSelectedFile) return;

          isCropProcessing = true;
          updateActionButtons();

          try {
            let fileForCrop = tempSelectedFile;
            fileForCrop = await convertImageFileToPngIfNeeded(fileForCrop);
            const manualCrop = await exportManualCropFromFrame(modal, fileForCrop);
            if (manualCrop) {
              tempSelectedFile = manualCrop;
              displayFilePreview(modal, manualCrop);
              updateActionButtons();
              return;
            }
            if (!window.EazpireCropImage || typeof window.EazpireCropImage.cropImageFlow !== 'function') {
              throw new Error('Crop module not loaded. Please reload the page.');
            }
            const apiBaseUrl = resolveApiBase() || window.api_base_url || window.API_BASE_URL || window.creator_api_base_url;
            const processed = await window.EazpireCropImage.cropImageFlow({
              modal,
              previewPlaceholderEl: previewPlaceholder,
              apiBaseUrl,
              file: fileForCrop,
              ownerId: resolveOwnerId(),
            });
            tempSelectedFile = processed;
            displayFilePreview(modal, processed);
            updateActionButtons();
          } catch (err) {
            console.error('[crop] failed', err);
            const msg = err && err.message ? String(err.message) : '';
            showErrorMessage(
              modal,
              msg && msg !== 'crop_encode_failed' && msg !== 'image_load_failed'
                ? msg
                : 'Zuschneiden fehlgeschlagen. Bitte versuchen Sie es erneut.',
              'error'
            );
          } finally {
            isCropProcessing = false;
            updateActionButtons();
          }
        });
      }
    }

    const creatorSelect = modal.querySelector(`#design-upload-creator-select-${sectionId}`);
    const visibilityCheckbox = modal.querySelector(`#design-upload-visibility-${sectionId}`);

    function normalizeCreatorNames(list) {
      const out = [];
      const seen = Object.create(null);
      (Array.isArray(list) ? list : []).forEach(function (raw) {
        const n = raw != null ? String(raw).trim() : '';
        if (!n || seen[n]) return;
        seen[n] = true;
        out.push(n);
      });
      return out;
    }

    function resolveActiveCreatorName() {
      if (window.CreatorSettings && window.CreatorSettings.creatorName != null && String(window.CreatorSettings.creatorName).trim()) {
        return String(window.CreatorSettings.creatorName).trim();
      }
      if (savedUploadSettings && savedUploadSettings.creator_name) {
        return String(savedUploadSettings.creator_name).trim();
      }
      return '';
    }

    function applyUploadSettingsToUI(settings) {
      const s = settings || savedUploadSettings || {};
      if (creatorSelect) {
        const name = (s.creator_name !== undefined && s.creator_name !== null) ? String(s.creator_name).trim() : '';
        if (name && Array.from(creatorSelect.options).some(function (opt) { return opt.value === name; })) {
          creatorSelect.value = name;
        } else if (name) {
          creatorSelect.value = name;
        }
      }
      if (visibilityCheckbox) {
        const vis = s.visibility === 'private' ? 'private' : 'public';
        visibilityCheckbox.checked = vis === 'public';
        visibilityCheckbox.setAttribute('data-visibility', vis);
      }
    }

    async function fetchCreatorNamesFromApi(oid, dispatchBase) {
      const names = [];
      let activeName = '';
      const base = dispatchBase || resolveDispatchUrl();
      if (!base || !oid) return { names: [], activeName: '' };

      try {
        const url = new URL(base, window.location.origin);
        url.searchParams.set('op', 'get-settings');
        url.searchParams.set('owner_id', oid);
        url.searchParams.set('logged_in_customer_id', oid);
        url.searchParams.set('_t', String(Date.now()));
        const res = await fetchWithTimeout(url.toString(), {}, SETTINGS_FETCH_TIMEOUT_MS);
        if (!res.ok) return { names: [], activeName: '' };
        const data = await parseJsonResponse(res).catch(function () { return {}; });
        const settings = data.settings || data || {};
        const arr = Array.isArray(settings.creator_names) ? settings.creator_names.slice() : [];
        if (settings.creator_name && arr.indexOf(settings.creator_name) === -1) {
          arr.unshift(settings.creator_name);
        }
        const normalized = normalizeCreatorNames(arr);
        if (normalized.length) {
          names.push.apply(names, normalized);
        }
        if (settings.active_creator_name != null && String(settings.active_creator_name).trim()) {
          activeName = String(settings.active_creator_name).trim();
        } else if (settings.creator_name != null && String(settings.creator_name).trim()) {
          activeName = String(settings.creator_name).trim();
        }
      } catch (e) {
        console.warn('Upload modal: get-settings failed', e);
      }
      return { names: normalizeCreatorNames(names), activeName: activeName };
    }

    async function loadCreatorNamesForUploadModal() {
      if (!creatorSelect || shopModeRef) return;

      let names = [];
      let activeName = '';

      if (window.CreatorSettings && Array.isArray(window.CreatorSettings.creatorNames)) {
        names = normalizeCreatorNames(window.CreatorSettings.creatorNames);
        if (window.CreatorSettings.creatorName != null && String(window.CreatorSettings.creatorName).trim()) {
          activeName = String(window.CreatorSettings.creatorName).trim();
        }
      }

      // Fill from cache immediately so UI is usable; refresh from API in background if empty.
      if (names.length === 0) {
        const oid = resolveOwnerId() || (await waitForOwnerId(800));
        const base = resolveDispatchUrl();
        if (oid && base) {
          const fetched = await fetchCreatorNamesFromApi(oid, base);
          names = fetched.names;
          if (fetched.activeName) activeName = fetched.activeName;
        }
      }

      const emptyLabel = (typeof window.getI18n === 'function'
        ? window.getI18n('upload_modal_no_creator', 'No creator available')
        : null)
        || (window.CreatorMobileI18n && window.CreatorMobileI18n.upload_modal_no_creator)
        || (window.CreatorI18n && (window.CreatorI18n['creator.upload_modal.no_creator'] || window.CreatorI18n.uploadModalNoCreator))
        || 'No creator available';

      creatorSelect.innerHTML = '';
      if (names.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = emptyLabel;
        creatorSelect.appendChild(opt);
        return;
      }

      names.forEach(function (n) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        creatorSelect.appendChild(opt);
      });

      // Default: last selected (saved upload settings), then active creator, then first
      const fromSettings = (savedUploadSettings && savedUploadSettings.creator_name)
        ? String(savedUploadSettings.creator_name).trim()
        : '';
      const toSelect = fromSettings || activeName || resolveActiveCreatorName();
      if (toSelect && Array.from(creatorSelect.options).some(function (opt) { return opt.value === toSelect; })) {
        creatorSelect.value = toSelect;
      } else if (creatorSelect.options.length) {
        creatorSelect.selectedIndex = 0;
      }
    }

    function getUploadSettings() {
      const settings = {};
      settings.remove_background = 'no';
      settings.crop_image = 'no';
      if (shopModeRef) {
        settings.creator_name = null;
        settings.visibility = 'public';
        console.log('📤 getUploadSettings (shop) — fixed defaults');
        return settings;
      }
      if (creatorSelect) {
        const v = (creatorSelect.value || '').trim();
        settings.creator_name = v || null;
      } else {
        const active = resolveActiveCreatorName();
        settings.creator_name = active || null;
      }
      if (visibilityCheckbox) {
        settings.visibility = visibilityCheckbox.checked ? 'public' : 'private';
      } else {
        settings.visibility = 'public';
      }
      console.log('📤 getUploadSettings - Upload-Einstellungen:', settings);
      return settings;
    }

    async function loadSavedUploadSettings() {
      const oid = resolveOwnerId() || (await waitForOwnerId(800));
      const base = resolveDispatchUrl();
      if (!oid || !base) {
        console.warn('⚠️ Keine ownerId oder apiBase - Upload-Einstellungen können nicht geladen werden');
        return null;
      }

      try {
        const url = new URL(base, window.location.origin);
        url.searchParams.set('op', 'get-upload-settings');
        url.searchParams.set('owner_id', oid);
        url.searchParams.set('logged_in_customer_id', oid);
        url.searchParams.set('_t', Date.now().toString());

        const response = await fetchWithTimeout(url.toString(), {}, SETTINGS_FETCH_TIMEOUT_MS);

        if (!response.ok) {
          console.warn('⚠️ Upload-Einstellungen konnten nicht geladen werden (HTTP ' + response.status + ')');
          return null;
        }

        const data = await parseJsonResponse(response);
        if (data.ok && data.settings && data.settings.upload) return data.settings.upload;
        return null;
      } catch (error) {
        if (error && (error.name === 'AbortError' || String(error.message || '').indexOf('aborted') >= 0)) {
          console.warn('⚠️ Timeout beim Laden der Upload-Einstellungen');
        } else if (error.name === 'TypeError' && String(error.message || '').includes('Failed to fetch')) {
          console.warn('⚠️ CORS-Fehler beim Laden der Upload-Einstellungen');
        } else {
          console.warn('⚠️ Fehler beim Laden der Upload-Einstellungen:', error);
        }
        return null;
      }
    }

    async function saveUploadSettings(settings) {
      const oid = resolveOwnerId();
      const base = resolveDispatchUrl();
      if (!oid || !base) {
        console.warn('⚠️ Keine ownerId oder apiBase - Upload-Einstellungen können nicht gespeichert werden');
        return;
      }

      try {
        const settingsToSave = settings ? { ...settings } : {};

        const url = new URL(base, window.location.origin);
        url.searchParams.set('op', 'set-upload-settings');
        url.searchParams.set('owner_id', oid);
        url.searchParams.set('logged_in_customer_id', oid);

        const response = await fetchWithTimeout(
          url.toString(),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ upload: settingsToSave }),
          },
          SETTINGS_FETCH_TIMEOUT_MS
        );

        const data = await parseJsonResponse(response).catch(function () { return {}; });
        if (!data.ok) console.warn('⚠️ Fehler beim Speichern der Upload-Einstellungen:', data);
      } catch (error) {
        if (error.name === 'TypeError' && String(error.message || '').includes('Failed to fetch')) {
          console.warn('⚠️ CORS-Fehler beim Speichern der Upload-Einstellungen');
        } else {
          console.warn('⚠️ Fehler beim Speichern der Upload-Einstellungen:', error);
        }
      }
    }

    function buildDispatchBaseUrl() {
      return resolveDispatchUrl();
    }

    async function pollUploadStatus(jobId) {
      const oid = resolveOwnerId();
      if (!jobId || !oid) return;
      const base = buildDispatchBaseUrl();
      if (!base) return;

      const maxAttempts = 90;
      const intervalMs = 2000;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        try {
          const statusUrl = new URL(base);
          statusUrl.searchParams.set('op', 'status');
          statusUrl.searchParams.set('job_id', String(jobId));
          statusUrl.searchParams.set('owner_id', String(oid));

          const resp = await fetch(statusUrl.toString(), { credentials: 'include', cache: 'no-store' });
          const data = await resp.json().catch(() => ({}));
          const statusKey = mapUploadJobStatus(data);
          dispatchUploadProgress({
            jobId: String(jobId),
            status: statusKey,
            progress: data && data.progress != null ? Number(data.progress) : null,
            message: data && data.message ? String(data.message) : null,
            previewUrl:
              (data && data.result && (data.result.preview_url || data.result.image_url)) ||
              (data && (data.preview_url || data.image_url)) ||
              null
          });

          if (data && (data.done || data.saved || data.error || data.failed)) {
            window.dispatchEvent(new CustomEvent('creator-upload-finished', {
              detail: { jobId: String(jobId), status: data, statusKey: statusKey }
            }));
            if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
              window.CreationsScreen.loadDesigns();
            }
            return;
          }
        } catch (_) {
          // keep polling; transient network errors should not stop queue tracking
        }
      }
    }

    async function uploadDesignViaQueue(settings, file) {
      const oid = resolveOwnerId();
      if (!oid) throw new Error('missing owner_id');
      if (!file) throw new Error('missing file');

      const base = buildDispatchBaseUrl();
      if (!base) throw new Error('missing api base');

      const localId = 'local_upload_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8);
      let previewBlobUrl = null;
      try {
        previewBlobUrl = URL.createObjectURL(file);
      } catch (_) {
        previewBlobUrl = null;
      }

      let fileMeta =
        (window.CreatorDesignUploadModalInstances &&
          window.CreatorDesignUploadModalInstances.__active &&
          window.CreatorDesignUploadModalInstances.__active._fileMeta) ||
        null;
      if (!fileMeta || !fileMeta.width) {
        try {
          const dim = await detectImageDimensions(file, null);
          fileMeta = updatePreviewMetaLabels(modal, file, dim.width, dim.height) || {
            width: dim.width,
            height: dim.height,
            bytes: file.size,
            needsUpscale: needsUpscaleForPrintQuality(dim.width, dim.height)
          };
        } catch (_) {
          fileMeta = {
            width: 0,
            height: 0,
            bytes: file.size,
            needsUpscale: true
          };
        }
      }

      dispatchUploadPlaceholder({
        localId: localId,
        jobId: null,
        previewUrl: previewBlobUrl,
        title: (file.name || 'Upload').replace(/\.[^.]+$/, ''),
        filename: file.name || 'Upload',
        status: 'uploading',
        needsUpscale: !!(fileMeta && fileMeta.needsUpscale),
        width: fileMeta && fileMeta.width,
        height: fileMeta && fileMeta.height,
        bytes: fileMeta && fileMeta.bytes
      });

      const formData = new FormData();
      formData.append('image', file);
      formData.append('owner_id', String(oid));
      formData.append('creator_name', (settings && settings.creator_name) ? String(settings.creator_name) : '');
      formData.append('visibility', (settings && settings.visibility === 'private') ? 'private' : 'public');

      const url = new URL(base);
      url.searchParams.set('op', 'upload-design');
      url.searchParams.set('owner_id', String(oid));

      const resp = await fetch(url.toString(), {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await resp.json().catch(() => ({}));

      if (!(resp.ok || resp.status === 202)) {
        dispatchUploadProgress({
          localId: localId,
          jobId: null,
          status: 'failed',
          error: (data && (data.message || data.error)) ? String(data.message || data.error) : 'upload_failed'
        });
        throw new Error((data && (data.message || data.error)) ? String(data.message || data.error) : 'upload_failed');
      }

      const jobId = data.jobId || data.job_id || null;
      if (jobId) {
        dispatchUploadPlaceholder({
          localId: localId,
          jobId: String(jobId),
          previewUrl: previewBlobUrl,
          title: (file.name || 'Upload').replace(/\.[^.]+$/, ''),
          filename: file.name || 'Upload',
          status: 'processing',
          needsUpscale: !!(fileMeta && fileMeta.needsUpscale),
          width: fileMeta && fileMeta.width,
          height: fileMeta && fileMeta.height,
          bytes: fileMeta && fileMeta.bytes
        });
        window.dispatchEvent(new CustomEvent('creatorSaveJobStarted', { detail: { jobId: String(jobId) } }));
        pollUploadStatus(jobId);
      } else {
        if (window.CreationsScreen && typeof window.CreationsScreen.loadDesigns === 'function') {
          window.CreationsScreen.loadDesigns();
        }
      }
    }

    function fillCreatorSelectFromCache() {
      if (!creatorSelect || shopModeRef) return false;
      if (!window.CreatorSettings || !Array.isArray(window.CreatorSettings.creatorNames)) return false;
      const names = normalizeCreatorNames(window.CreatorSettings.creatorNames);
      if (!names.length) return false;
      creatorSelect.innerHTML = '';
      names.forEach(function (n) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        creatorSelect.appendChild(opt);
      });
      const active =
        (window.CreatorSettings.creatorName != null && String(window.CreatorSettings.creatorName).trim()) ||
        (savedUploadSettings && savedUploadSettings.creator_name) ||
        '';
      if (active && Array.from(creatorSelect.options).some(function (opt) { return opt.value === active; })) {
        creatorSelect.value = active;
      } else if (creatorSelect.options.length) {
        creatorSelect.selectedIndex = 0;
      }
      return true;
    }

    function showUploadModalShell() {
      window.scrollTo({ top: 0, behavior: 'instant' });

      modal.style.display = '';
      modal.setAttribute('aria-hidden', 'false');

      if (window.CreatorUtils && window.CreatorUtils.preventBodyScroll) {
        window.CreatorUtils.preventBodyScroll(true);
      } else {
        document.body.style.overflow = 'hidden';
      }

      window.CreatorDesignUploadModalInstances.__active = api;
    }

    async function hydrateUploadModalSettings() {
      try {
        const loadedSettings = await loadSavedUploadSettings();
        const settingsToApply = loadedSettings !== null ? loadedSettings : (savedUploadSettings || {});
        savedUploadSettings = settingsToApply;
        if (window.CreatorDesignUploadModal) {
          window.CreatorDesignUploadModal.savedUploadSettings = savedUploadSettings;
        }
        await loadCreatorNamesForUploadModal();
        applyUploadSettingsToUI(savedUploadSettings);
      } catch (e) {
        console.warn('⚠️ Upload-Modal Hydration fehlgeschlagen:', e);
        try {
          await loadCreatorNamesForUploadModal();
          applyUploadSettingsToUI(savedUploadSettings || {});
        } catch (_e2) {}
      }
    }

    function openDesignUploadModal() {
      // Show immediately — never await network before paint (workers.dev can hang for minutes).
      fillCreatorSelectFromCache();
      applyUploadSettingsToUI(savedUploadSettings || {});
      if (tempSelectedFile) {
        displayFilePreview(modal, tempSelectedFile);
      } else {
        setActionsBarVisible(false);
      }
      updateActionButtons();
      bindActionButtonHandlersOnce();
      prefetchUploadModalEazCosts();
      showUploadModalShell();

      // Refresh settings/names in background
      void hydrateUploadModalSettings();
    }

    function resetFilePreview() {
      const placeholder = modal.querySelector('.design-upload-placeholder');
      if (!placeholder) return;

      if (modal.classList.contains('eaz-shop-design-upload-modal')) {
        try {
          const prev = modal.dataset.eazShopStripBlobUrl;
          if (prev) {
            URL.revokeObjectURL(prev);
            delete modal.dataset.eazShopStripBlobUrl;
          }
        } catch (e) {}
      }

      const existingImg = placeholder.querySelector('.design-upload-preview__full-image');
      if (existingImg && existingImg.src && existingImg.src.startsWith('blob:')) {
        URL.revokeObjectURL(existingImg.src);
      }

      placeholder.innerHTML = `
        <div class="design-upload-placeholder__image">
          <div class="design-upload-placeholder__icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="14,2 14,8 20,8" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="16" y1="13" x2="8" y2="13" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="16" y1="17" x2="8" y2="17" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="10,9 9,9 8,9" stroke="#6b7280" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="design-upload-placeholder__text">
            <p>Klicke hier um ein Design auszuwählen</p>
            <small>PNG, JPG, SVG bis 30MB</small>
          </div>
        </div>
      `;

      placeholder.style.background = '#1a1f2e';
      placeholder.style.borderColor = '#4b5563';

      tempSelectedFile = null;
      originalSelectedFile = null;
      if (window.CreatorDesignUploadModalInstances && window.CreatorDesignUploadModalInstances.__active) {
        window.CreatorDesignUploadModalInstances.__active._fileMeta = null;
      }

      // Reset remove-bg button active state
      const removeBgBtn = modal.querySelector('.design-upload-action-btn[data-action="remove_background"]');
      if (removeBgBtn) removeBgBtn.setAttribute('data-active', 'false');

      updateActionButtons();
    }

    function closeDesignUploadModal() {
      const focusedElement = modal.querySelector(':focus');
      if (focusedElement) focusedElement.blur();

      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';

      if (window.CreatorUtils && window.CreatorUtils.preventBodyScroll) {
        window.CreatorUtils.preventBodyScroll(false);
      } else {
        document.body.style.overflow = '';
      }

      resetFilePreview();
    }

    let uploadInProgress = false;

    const UPLOAD_DEFAULT_COST = 5;

    function getEazCostCatalog() {
      if (window.EazCostCatalog) return window.EazCostCatalog;
      return {
        fmtEaz: formatUploadEazAmount,
        resolveCost: function (map, feature) {
          var n = map && map[feature] != null ? Number(map[feature]) : NaN;
          if (Number.isFinite(n) && n >= 0) return n;
          if (feature === 'design_upload') return UPLOAD_DEFAULT_COST;
          if (feature === 'bg_remove') return 0;
          return 0;
        }
      };
    }

    /** Cached EAZ costs for instant confirm dialog (refreshed in background). */
    var eazCostCache = { design_upload: UPLOAD_DEFAULT_COST, bg_remove: 0 };

    /** Catalog list price in upload UI (mascot discounts apply at billing, not on labels). */
    function getUploadDisplayCost(feature) {
      var cat = getEazCostCatalog();
      if (feature === 'design_upload') {
        return cat.defaultCost ? cat.defaultCost('design_upload') : UPLOAD_DEFAULT_COST;
      }
      return cat.resolveCost(eazCostCache, feature);
    }

    function updateUploadCostLabels() {
      var cat = getEazCostCatalog();
      modal.querySelectorAll('[data-eaz-cost-feature]').forEach(function (el) {
        var feature = el.getAttribute('data-eaz-cost-feature');
        if (!feature) return;
        var cost = getUploadDisplayCost(feature);
        var btnCost = el.closest('.btn-cost');
        if (cost <= 0) {
          if (btnCost) btnCost.hidden = true;
          return;
        }
        if (btnCost) btnCost.hidden = false;
        var formatted = cat.fmtEaz ? cat.fmtEaz(cost) : formatUploadEazAmount(cost);
        if (el.classList.contains('design-upload-eaz-cost-upload--suffix')) {
          el.textContent = formatted + ' EAZ';
        } else if (el.classList.contains('btn-cost-inline')) {
          el.textContent = formatted;
        } else {
          el.textContent = formatted;
        }
      });
    }

    function prefetchUploadModalEazCosts() {
      var dispatchBase = buildDispatchBaseUrl();
      var oid = resolveOwnerId();
      if (!oid || !dispatchBase) {
        updateUploadCostLabels();
        return;
      }
      try {
        var balUrl = new URL(dispatchBase);
        balUrl.searchParams.set('op', 'get-balance');
        balUrl.searchParams.set('owner_id', String(oid));
        balUrl.searchParams.set('_t', String(Date.now()));
        fetch(balUrl.toString(), { credentials: 'include', cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (balData) {
            var ec = balData && balData.eaz_costs;
            if (!ec) return;
            if (ec.bg_remove != null) eazCostCache.bg_remove = Number(ec.bg_remove);
            updateUploadCostLabels();
          })
          .catch(function () {});
      } catch (_e) {}
      updateUploadCostLabels();
    }

    function refreshConfirmDialogCost(modalBox, isRemoveBgActive) {
      var costValueEl = modalBox.querySelector('[data-upload-confirm-cost-value]');
      if (!costValueEl) return;
      var cat = getEazCostCatalog();
      var uploadCost = getUploadDisplayCost('design_upload');
      var bgCost = getUploadDisplayCost('bg_remove');
      var totalCost = uploadCost + (isRemoveBgActive ? bgCost : 0);
      costValueEl.textContent = (cat.fmtEaz ? cat.fmtEaz(totalCost) : formatUploadEazAmount(totalCost)) + ' EAZ';
    }

    function formatUploadEazAmount(n) {
      if (n == null || !Number.isFinite(Number(n))) return '0';
      var r = Math.round(Number(n) * 100) / 100;
      return r % 1 === 0 ? String(r) : r.toFixed(2);
    }

    function i18nUploadConfirm(key, fallback) {
      if (typeof window.getI18n === 'function') {
        return window.getI18n(key, fallback);
      }
      var map = window.CreatorI18n || {};
      return map[key] != null && map[key] !== '' ? map[key] : fallback;
    }

    /** Critical confirm-dialog CSS (loads with JS — base.css img{width:100%} breaks coin icons). Dark default; --shop = light. */
    function ensureUploadConfirmStyles() {
      if (document.getElementById('creator-upload-confirm-styles')) return;
      var style = document.createElement('style');
      style.id = 'creator-upload-confirm-styles';
      style.textContent = [
        '.creator-upload-confirm-overlay{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:10000050;display:flex;align-items:center;justify-content:center;overflow-x:hidden;overflow-y:auto;padding:max(12px,env(safe-area-inset-top,0)) 16px max(12px,env(safe-area-inset-bottom,0));box-sizing:border-box}',
        '.creator-upload-confirm-dialog{display:block;flex-shrink:0;text-align:left;background:#111827;border:1px solid #374151;border-radius:16px;padding:20px 22px;max-width:400px;width:min(400px,calc(100vw - 32px));box-shadow:0 16px 48px rgba(0,0,0,.45);color:#e5e7eb}',
        '.creator-upload-confirm-dialog h3{color:#e5e7eb;font-size:18px;font-weight:600;margin:0 0 14px;text-align:center}',
        '.creator-upload-confirm-dialog__summary{background:#0f172a;border:1px solid #374151;border-radius:12px;padding:14px;margin-bottom:12px}',
        '.creator-upload-confirm-dialog__row{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;font-size:14px;flex-wrap:nowrap}',
        '.creator-upload-confirm-dialog__row:last-child,.creator-upload-confirm-dialog__row--last{margin-bottom:0}',
        '.creator-upload-confirm-dialog__label{color:#9ca3af;flex-shrink:0}',
        '.creator-upload-confirm-dialog__value{color:#e5e7eb;font-weight:500;text-align:right;flex-shrink:0;white-space:nowrap}',
        '.creator-upload-confirm-dialog__value--wrap{flex-shrink:1;white-space:normal;overflow-wrap:anywhere;min-width:0}',
        '.creator-upload-confirm-dialog__value--cost{display:inline-flex;align-items:center;gap:6px;color:#fb923c;width:fit-content;max-width:100%;margin-left:auto}',
        '.creator-upload-confirm-dialog__value--xp{color:#4ade80}',
        '.creator-upload-confirm-dialog__cost{background:linear-gradient(135deg,rgba(249,115,22,.18),rgba(15,23,42,.9));border:1px solid rgba(249,115,22,.35);border-radius:12px;padding:12px 14px;margin-bottom:14px}',
        '.creator-upload-confirm-dialog__actions{display:flex;flex-direction:column;gap:10px;width:100%}',
        '@media(min-width:380px){.creator-upload-confirm-dialog__actions{flex-direction:row}.creator-upload-confirm-dialog__btn{flex:1;min-width:0}}',
        '.creator-upload-confirm-dialog__btn{padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;font-family:inherit;box-sizing:border-box;min-height:44px;line-height:1.2}',
        '.creator-upload-confirm-dialog__btn--cancel{background:transparent;color:#9ca3af;border:1px solid #4b5563}',
        '.creator-upload-confirm-dialog__btn--cancel:hover{background:#1f2937;color:#e5e7eb;border-color:#6b7280}',
        '.creator-upload-confirm-dialog__btn--primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:#f97316;color:#fff}',
        '.creator-upload-confirm-dialog__btn--primary:hover{background:#fb923c}',
        '.creator-upload-confirm-dialog .eaz-coin-icon{display:inline-block;width:18px!important;height:18px!important;max-width:18px!important;min-width:18px!important;flex:0 0 18px!important;object-fit:contain}',
        '.creator-upload-confirm-dialog__btn .eaz-coin-icon{width:14px!important;height:14px!important;max-width:14px!important;min-width:14px!important;flex:0 0 14px!important}',
        /* Shop light skin */
        '.creator-upload-confirm-overlay--shop{background:rgba(15,23,42,.55)}',
        '.creator-upload-confirm-dialog--shop{background:#fff;border:1px solid #e5e7eb;box-shadow:0 16px 48px rgba(0,0,0,.12);color:#111827}',
        '.creator-upload-confirm-dialog--shop h3{color:#111827}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__summary{background:#f9fafb;border:1px solid #e5e7eb}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__label{color:#6b7280}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__value{color:#111827}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__value--cost{color:#c2410c}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__value--xp{color:#15803d}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__cost{background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(251,191,36,.08));border:1px solid rgba(249,115,22,.25)}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__btn--cancel{background:#f3f4f6;color:#374151;border:none}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__btn--cancel:hover{background:#e5e7eb;color:#374151;border:none}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__btn--primary{background:linear-gradient(135deg,#f97316,#fbbf24);color:#0f172a}',
        '.creator-upload-confirm-dialog--shop .creator-upload-confirm-dialog__btn--primary:hover{filter:brightness(1.03)}'
      ].join('');
      document.head.appendChild(style);
    }

    function resolveEazvCoinUrl() {
      if (window.EazCoinBrand && typeof window.EazCoinBrand.urlEazv === 'function') {
        try {
          var u = window.EazCoinBrand.urlEazv();
          if (u) return String(u);
        } catch (_) {}
      }
      if (window.__EazCoinUrls && window.__EazCoinUrls.eazv_coin_logo) {
        return String(window.__EazCoinUrls.eazv_coin_logo);
      }
      return 'https://creator-engine.eazpire.workers.dev/apps/creator-dispatch?op=platform-asset-public&slot=eazv_coin_logo';
    }

    // Bestätigungsdialog für Upload anzeigen (sofort — Kosten aus Cache, API im Hintergrund)
    function showUploadConfirmDialog(settings, file, onConfirm) {
      ensureUploadConfirmStyles();
      const removeBgBtn = modal.querySelector('.design-upload-action-btn[data-action="remove_background"]');
      const isRemoveBgActive = removeBgBtn && removeBgBtn.getAttribute('data-active') === 'true';

      var cat = getEazCostCatalog();
      var uploadCost = getUploadDisplayCost('design_upload');
      var bgCost = getUploadDisplayCost('bg_remove');
      var totalCost = uploadCost + (isRemoveBgActive ? bgCost : 0);

      const shopConfirm = isShopDesignUploadModal(modal);
      const modalOverlay = document.createElement('div');
      modalOverlay.className = 'creator-upload-confirm-overlay' + (shopConfirm ? ' creator-upload-confirm-overlay--shop' : '');
      modalOverlay.setAttribute('role', 'presentation');

      const creatorName = settings.creator_name || '—';
      const visPub = i18nUploadConfirm('uploadConfirmVisibilityPublic', 'Public');
      const visPriv = i18nUploadConfirm('uploadConfirmVisibilityPrivate', 'Private');
      const visibilityLabel = settings.visibility === 'public' ? visPub : visPriv;
      const eazvCoinSrc = resolveEazvCoinUrl();

      const modalBox = document.createElement('div');
      modalBox.className = 'creator-upload-confirm-dialog' + (shopConfirm ? ' creator-upload-confirm-dialog--shop' : '');
      modalBox.innerHTML = `
        <h3>${escapeHtml(i18nUploadConfirm('uploadConfirmTitle', 'Upload this design?'))}</h3>

        <div class="creator-upload-confirm-dialog__summary">
          <div class="creator-upload-confirm-dialog__row">
            <span class="creator-upload-confirm-dialog__label">${escapeHtml(i18nUploadConfirm('uploadConfirmCreator', 'Creator'))}</span>
            <span class="creator-upload-confirm-dialog__value creator-upload-confirm-dialog__value--wrap">${escapeHtml(creatorName)}</span>
          </div>
          <div class="creator-upload-confirm-dialog__row">
            <span class="creator-upload-confirm-dialog__label">${escapeHtml(i18nUploadConfirm('uploadConfirmVisibility', 'Visibility'))}</span>
            <span class="creator-upload-confirm-dialog__value">${escapeHtml(visibilityLabel)}</span>
          </div>
          ${isRemoveBgActive ? `
          <div class="creator-upload-confirm-dialog__row">
            <span class="creator-upload-confirm-dialog__label">${escapeHtml(i18nUploadConfirm('uploadConfirmRemoveBg', 'Remove background'))}</span>
            <span class="creator-upload-confirm-dialog__value">${escapeHtml(i18nUploadConfirm('uploadConfirmRemoveBgActive', 'On'))}</span>
          </div>
          ` : ''}
        </div>

        <div class="creator-upload-confirm-dialog__cost">
          <div class="creator-upload-confirm-dialog__row">
            <span class="creator-upload-confirm-dialog__label">${escapeHtml(i18nUploadConfirm('uploadConfirmCost', 'Cost'))}</span>
            <span class="creator-upload-confirm-dialog__value creator-upload-confirm-dialog__value--cost">
              <img class="eaz-coin-icon" src="${escapeHtml(eazvCoinSrc)}" alt="" width="18" height="18" data-eaz-coin="eazv">
              <span data-upload-confirm-cost-value>${escapeHtml((cat.fmtEaz ? cat.fmtEaz(totalCost) : formatUploadEazAmount(totalCost)) + ' EAZ')}</span>
            </span>
          </div>
        </div>

        <div class="creator-upload-confirm-dialog__actions">
          <button type="button" class="creator-upload-confirm-dialog__btn creator-upload-confirm-dialog__btn--cancel upload-confirm-cancel">
            ${escapeHtml(i18nUploadConfirm('uploadConfirmCancel', 'Cancel'))}
          </button>
          <button type="button" class="creator-upload-confirm-dialog__btn creator-upload-confirm-dialog__btn--primary upload-confirm-yes">
            <span>${escapeHtml(i18nUploadConfirm('uploadConfirmUploadBtn', 'Upload'))}</span>
            <img class="eaz-coin-icon" src="${escapeHtml(eazvCoinSrc)}" alt="" width="14" height="14" data-eaz-coin="eazv">
          </button>
        </div>
      `;

      modalOverlay.appendChild(modalBox);
      document.body.appendChild(modalOverlay);

      prefetchUploadModalEazCosts();
      setTimeout(function () {
        refreshConfirmDialogCost(modalBox, isRemoveBgActive);
      }, 0);

      const cancelBtn = modalBox.querySelector('.upload-confirm-cancel');
      const confirmBtn = modalBox.querySelector('.upload-confirm-yes');

      return new Promise(function (resolve) {
        function close() {
          document.removeEventListener('keydown', escHandler);
          if (modalOverlay.parentNode) {
            modalOverlay.parentNode.removeChild(modalOverlay);
          }
          resolve();
        }

        cancelBtn.addEventListener('click', close);
        confirmBtn.addEventListener('click', function () {
          close();
          if (typeof onConfirm === 'function') onConfirm();
        });

        modalOverlay.addEventListener('click', function (e) {
          if (e.target === modalOverlay) close();
        });

        function escHandler(e) {
          if (e.key === 'Escape') close();
        }
        document.addEventListener('keydown', escHandler);
      });
    }

    // Simple HTML escape helper
    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function startUpload() {
      if (uploadInProgress) {
        console.log('🚀 startUpload - blockiert (Upload läuft bereits)');
        return;
      }
      
      if (!tempSelectedFile) {
        console.warn('⚠️ startUpload - keine Datei ausgewählt');
        showErrorMessage(modal, window.getI18n ? window.getI18n('pleaseSelectFile', 'Please select a file first.') : (window.CreatorI18n?.pleaseSelectFile || 'Please select a file first.'), 'warning');
        return;
      }
      
      const settings = getUploadSettings();

      console.log('🚀 startUpload - Datei:', tempSelectedFile ? tempSelectedFile.name : 'Keine Datei', 'Settings:', settings);

      if (shopModeRef && typeof onUploadStartRef === 'function') {
        uploadInProgress = true;
        if (uploadBtn) uploadBtn.disabled = true;
        if (shopEazyBtn) shopEazyBtn.disabled = true;
        Promise.resolve(onUploadStartRef(settings, tempSelectedFile))
          .then(() => {
            setTimeout(() => {
              closeDesignUploadModal();
              tempSelectedFile = null;
              uploadInProgress = false;
              if (uploadBtn) uploadBtn.disabled = false;
              if (shopEazyBtn) shopEazyBtn.disabled = false;
            }, 800);
          })
          .catch((err) => {
            console.error('[upload] shop onUploadStart failed', err);
            showErrorMessage(modal, (err && err.message) ? String(err.message) : 'upload_failed', 'error');
            uploadInProgress = false;
            if (uploadBtn) uploadBtn.disabled = false;
            if (shopEazyBtn) shopEazyBtn.disabled = false;
          });
        return;
      }

      // Zeige Bestätigungsdialog
      void showUploadConfirmDialog(settings, tempSelectedFile, function () {
        // User hat bestätigt - starte Upload
        uploadInProgress = true;
        if (uploadBtn) {
          uploadBtn.disabled = true;
        }

        savedUploadSettings = settings;
        if (window.CreatorDesignUploadModal) window.CreatorDesignUploadModal.savedUploadSettings = savedUploadSettings;
        saveUploadSettings(settings);

        if (onUploadStart && typeof onUploadStart === 'function') {
          Promise.resolve(onUploadStart(settings, tempSelectedFile))
            .then(() => {
              setTimeout(() => {
                closeDesignUploadModal();
                tempSelectedFile = null;
                uploadInProgress = false;
                if (uploadBtn) uploadBtn.disabled = false;
              }, 1500);
            })
            .catch((err) => {
              console.error('[upload] onUploadStart failed', err);
              showErrorMessage(modal, (err && err.message) ? String(err.message) : 'upload_failed', 'error');
              uploadInProgress = false;
              if (uploadBtn) uploadBtn.disabled = false;
            });
        } else {
          uploadDesignViaQueue(settings, tempSelectedFile)
            .then(() => {
              setTimeout(() => {
                closeDesignUploadModal();
                tempSelectedFile = null;
                uploadInProgress = false;
                if (uploadBtn) uploadBtn.disabled = false;
              }, 1500);
            })
            .catch((err) => {
              console.error('[upload] failed', err);
              showErrorMessage(modal, (err && err.message) ? String(err.message) : 'upload_failed', 'error');
              uploadInProgress = false;
              if (uploadBtn) uploadBtn.disabled = false;
            });
        }
      });
    }

    if (visibilityCheckbox) {
      visibilityCheckbox.addEventListener('change', function () {
        const vis = this.checked ? 'public' : 'private';
        this.setAttribute('data-visibility', vis);
      });
    }

    // Buttons
    if (uploadBtn) uploadBtn.addEventListener('click', (e) => { e.preventDefault(); startUpload(); });
    if (shopEazyBtn) shopEazyBtn.addEventListener('click', (e) => { e.preventDefault(); startUpload(); });
    if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeDesignUploadModal(); });
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.preventDefault(); closeDesignUploadModal(); });
    if (backdrop) backdrop.addEventListener('click', (e) => { e.preventDefault(); closeDesignUploadModal(); });

    // Click placeholder for file select + remove X via delegation
    const placeholder = modal.querySelector('.design-upload-placeholder');
    if (placeholder) {
      placeholder.addEventListener('click', function (e) {
        if (e.target.closest('.design-upload-preview__meta')) {
          return;
        }
        const removeBtn = e.target.closest('.design-upload-preview__remove');
        if (removeBtn) {
          e.preventDefault();
          e.stopPropagation();
          console.log('🗑️ Design entfernt - setze Vorschau zurück');
          resetFilePreview();
          return;
        }

        // only open file selector when clicking placeholder/background/image
        const clickedImage = !!e.target.closest('.design-upload-preview__full-image');
        const hasPreview = !!placeholder.querySelector('.design-upload-preview');

        if (clickedImage || !hasPreview) {
          console.log('📁 Öffne Datei-Auswahl');
          openFileSelector(modal, (file) => {
            tempSelectedFile = file;
            updateActionButtons();
          });
        }
      });
    }

    // ESC (block during processing)
    const escHandler = (e) => {
      if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
        if (isRemoveBgProcessing || isCropProcessing) {
          console.log('[modal] Escape blockiert während Verarbeitung');
          return;
        }
        closeDesignUploadModal();
      }
    };
    document.addEventListener('keydown', escHandler);

    // Bind action handlers once
    bindActionButtonHandlersOnce();
    updateActionButtons();

    const api = {
      openDesignUploadModal,
      closeDesignUploadModal,
      startUpload,
      getUploadSettings,
      applyUploadSettingsToUI,
      displayFilePreview,
      resetFilePreview,
      openFileSelector,
      getSelectedFile: () => tempSelectedFile,

      // internal hooks used by displayFilePreview fallback
      _setTempSelectedFile: (f) => { tempSelectedFile = f; },
      _updateActionButtons: updateActionButtons,
      _setOnUploadStart: (fn) => { onUploadStartRef = fn; },
      _setShopMode: (v) => { shopModeRef = !!v; }
    };

    if (!window.CreatorDesignUploadModalInstances) window.CreatorDesignUploadModalInstances = {};
    window.CreatorDesignUploadModalInstances[sectionId] = api;

    // mark current api as active (so displayFilePreview fallback can update state)
    window.CreatorDesignUploadModalInstances.__active = api;

    return api;
  }
})();