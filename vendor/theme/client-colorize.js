/**
 * client-colorize.js
 * Client-side product mockup rendering with color overlay and design placement.
 *
 * Uses the product template's alpha channel as the garment mask.
 * Applies multiply-blend colorization and overlays the design with shade-following.
 *
 * Supports: pre-rendered variants, print-area clipping, design x/y positioning,
 * crop regions, and pattern tiling (grid/brick).
 *
 * Designed for instant (<100ms) color switching in the Product Detail Modal.
 */
(function () {
  'use strict';

  // ─── Configuration ───────────────────────────────────────────────
  const PROXY_BASE = 'https://creator-engine.eazpire.workers.dev/mockup/proxy';
  const MOCKUP_BASE = 'https://creator-engine.eazpire.workers.dev/mockup';

  // ─── Image Cache ─────────────────────────────────────────────────
  /** @type {Map<string, ImageData>} key → decoded ImageData */
  const imageDataCache = new Map();
  /** @type {Map<string, ImageBitmap>} key → ImageBitmap for canvas drawing */
  const bitmapCache = new Map();

  /**
   * Load an image from URL and return its ImageData.
   * Uses the proxy for CORS-safe fetching where needed.
   * Results are cached by URL.
   */
  async function loadImageData(url) {
    if (imageDataCache.has(url)) {
      const cached = imageDataCache.get(url);
      return { imageData: cached, width: cached.width, height: cached.height };
    }

    let fetchUrl = url;
    if (url.startsWith('/mockup/') || url.startsWith('/file/')) {
      fetchUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
    }

    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error(`Failed to load image: ${resp.status} ${url}`);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    imageDataCache.set(url, imageData);
    return { imageData, width: imageData.width, height: imageData.height };
  }

  /**
   * Load an image as ImageBitmap (for canvas drawing). Cached.
   */
  async function loadBitmap(url) {
    if (bitmapCache.has(url)) return bitmapCache.get(url);

    let fetchUrl = url;
    if (url.startsWith('/mockup/') || url.startsWith('/file/')) {
      fetchUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
    }

    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error(`Failed to load bitmap: ${resp.status} ${url}`);
    const blob = await resp.blob();
    const bitmap = await createImageBitmap(blob);
    bitmapCache.set(url, bitmap);
    return bitmap;
  }

  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function colorizeTemplate(templateData, color) {
    const src = templateData.data;
    const w = templateData.width;
    const h = templateData.height;
    const out = new Uint8ClampedArray(src.length);

    for (let i = 0; i < src.length; i += 4) {
      const a = src[i + 3];
      if (a === 0) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; continue; }
      const lum = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
      const shade = 0.15 + 0.85 * lum;
      out[i] = Math.round(color.r * shade);
      out[i + 1] = Math.round(color.g * shade);
      out[i + 2] = Math.round(color.b * shade);
      out[i + 3] = a;
    }
    return new ImageData(out, w, h);
  }

  // ─── Print Area Helpers ──────────────────────────────────────────

  /**
   * Compute print area rectangle in pixel coordinates.
   * For print area templates (useFullImageAsPrintArea): the full image IS the print area (1:1 with Printify).
   * When printAreaRect has .h: use (x,y) as top-left normalized (PRODUCT_TEMPLATES / server-computed).
   * Otherwise: use (x,y) as center and .w as width fraction (legacy placement).
   * @returns {{ x: number, y: number, w: number, h: number, cx, cy }} top-left corner + size in px
   */
  function computePrintArea(tw, th, printAreaRect, printifyDimensions, useFullImageAsPrintArea, useExactPrintAreaRect) {
    if (useFullImageAsPrintArea) {
      return { x: 0, y: 0, w: tw, h: th, cx: tw / 2, cy: th / 2 };
    }
    if (printAreaRect?.h != null && typeof printAreaRect.h === 'number') {
      const pw = printAreaRect.w ?? 0.5;
      const ph = printAreaRect.h ?? 0.5;
      const paX = (printAreaRect.x ?? 0) * tw;
      const paY = (printAreaRect.y ?? 0) * th;
      let paW = pw * tw;
      let paH = ph * th;
      // Admin-configured rect: use exactly as stored (no aspect correction)
      if (useExactPrintAreaRect) {
        return { x: paX, y: paY, w: paW, h: paH, cx: paX + paW / 2, cy: paY + paH / 2 };
      }
      // Printify aspect correction – MUST match admin-print-area-panel computeDisplayRect exactly
      if (printifyDimensions?.width && printifyDimensions?.height) {
        const expectedAspect = printifyDimensions.width / printifyDimensions.height;
        const rectAspect = paW / paH;
        if (rectAspect > expectedAspect * 1.02) {
          paH = paW / expectedAspect;
        } else if (rectAspect < expectedAspect / 1.02) {
          paW = paH * expectedAspect;
        }
        return { x: paX, y: paY, w: paW, h: paH, cx: paX + paW / 2, cy: paY + paH / 2 };
      }
      return { x: paX, y: paY, w: paW, h: paH, cx: paX + paW / 2, cy: paY + paH / 2 };
    }
    const cx = (printAreaRect?.x ?? 0.5) * tw;
    const cy = (printAreaRect?.y ?? 0.5) * th;
    const paW = (printAreaRect?.w ?? 0.5) * tw;
    let paH;
    if (printifyDimensions?.width && printifyDimensions?.height) {
      paH = paW * (printifyDimensions.height / printifyDimensions.width);
    } else {
      paH = paW * (th / tw);
    }
    return { x: cx - paW / 2, y: cy - paH / 2, w: paW, h: paH, cx, cy };
  }

  // ─── Design Drawing ──────────────────────────────────────────────

  /**
   * Draw a single design onto ctx. Handles position, scale, rotation, crop.
   * @param {CanvasRenderingContext2D} ctx
   * @param {ImageBitmap} bitmap - Design bitmap
   * @param {object} design - { scale, angle, x, y, crop, pattern }
   * @param {object} pa - Print area { x, y, w, h, cx, cy }
   */
  function drawSingleDesign(ctx, bitmap, design, pa) {
    const scale = design.scale || 1.0;

    // Always fit based on FULL design dimensions (crop is a visual mask, not resize)
    const fullW = bitmap.width, fullH = bitmap.height;
    const scaleX = (pa.w * scale) / fullW;
    const scaleY = (pa.h * scale) / fullH;
    const fitScale = Math.min(scaleX, scaleY);
    const dw = fullW * fitScale;
    const dh = fullH * fitScale;

    // Position: design (x, y) is relative to print area (0-1), default center
    const dx = design.x !== undefined ? design.x : 0.5;
    const dy = design.y !== undefined ? design.y : 0.5;
    const cx = pa.x + dx * pa.w;
    const cy = pa.y + dy * pa.h;

    ctx.save();
    ctx.translate(cx, cy);
    if (design.angle) ctx.rotate((design.angle * Math.PI) / 180);

    // Apply crop as a clipping mask (design stays in place, only visibility changes)
    if (design.crop) {
      const cropX = -dw / 2 + design.crop.x * dw;
      const cropY = -dh / 2 + design.crop.y * dh;
      const cropW = design.crop.width * dw;
      const cropH = design.crop.height * dh;
      ctx.beginPath();
      ctx.rect(cropX, cropY, cropW, cropH);
      ctx.clip();
    }

    ctx.globalAlpha = 0.95;
    ctx.drawImage(bitmap, 0, 0, fullW, fullH, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  /**
   * Draw a pattern of a design across the print area.
   */
  function drawPatternDesign(ctx, bitmap, design, pa) {
    const pat = design.pattern;
    if (!pat || !pat.enabled) return;

    const scale = design.scale || 0.3;

    // Source rect (crop)
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    if (design.crop) {
      sx = (design.crop.x || 0) * bitmap.width;
      sy = (design.crop.y || 0) * bitmap.height;
      sw = (design.crop.width || 1) * bitmap.width;
      sh = (design.crop.height || 1) * bitmap.height;
    }

    // Calculate single tile size
    const scaleX = (pa.w * scale) / sw;
    const scaleY = (pa.h * scale) / sh;
    const fitScale = Math.min(scaleX, scaleY);
    const tileW = sw * fitScale;
    const tileH = sh * fitScale;

    const spacingH = (pat.spacingH || 0) / 100 * tileW;
    const spacingV = (pat.spacingV || 0) / 100 * tileH;
    const stepW = tileW + spacingH;
    const stepH = tileH + spacingV;
    const offsetH = (pat.offsetH || 0) / 100 * stepW;

    if (stepW < 1 || stepH < 1) return; // safety

    // Global pattern rotation
    ctx.save();
    ctx.translate(pa.cx, pa.cy);
    if (pat.angle) ctx.rotate((pat.angle * Math.PI) / 180);
    ctx.translate(-pa.cx, -pa.cy);

    // Determine grid bounds (expand to fill rotated area)
    const diag = Math.sqrt(pa.w * pa.w + pa.h * pa.h) * 1.5;
    const startX = pa.cx - diag / 2;
    const startY = pa.cy - diag / 2;

    const cols = Math.ceil(diag / stepW) + 1;
    const rows = Math.ceil(diag / stepH) + 1;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let tx = startX + col * stepW;
        let ty = startY + row * stepH;

        // Brick offset
        if (pat.mode === 'brick_horizontal' && row % 2 === 1) {
          tx += stepW / 2;
        } else if (pat.mode === 'brick_vertical' && col % 2 === 1) {
          ty += stepH / 2;
        }

        // Apply horizontal offset
        tx += offsetH * (row % 2 === 1 ? 1 : 0);

        // Per-tile rotation
        const tileAngle = (pat.rotationStepH || 0) * col + (pat.rotationStepV || 0) * row;

        ctx.save();
        ctx.translate(tx, ty);
        if (tileAngle) ctx.rotate((tileAngle * Math.PI) / 180);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(bitmap, sx, sy, sw, sh, -tileW / 2, -tileH / 2, tileW, tileH);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  // ─── Main Render Functions ───────────────────────────────────────

  /**
   * Render a complete mockup to an OffscreenCanvas and return a blob URL.
   * Used for static preview (Farb-Tab / Gewinn-Tab / img tag).
   */
  async function renderMockup({
    templateUrl, designUrl, colorHex, placement, printAreaRect,
    printifyDimensions, preRenderedVariantUrl, additionalDesigns = [],
    skipColorize = false,
    useFullImageAsPrintArea = false,
    useExactPrintAreaRect = false,
    showPrintAreaOverlay = false,
  }) {
    let tw, th, canvas, ctx;

    if (preRenderedVariantUrl) {
      const resp = await fetch(preRenderedVariantUrl);
      if (!resp.ok) throw new Error(`Failed to load variant: ${resp.status}`);
      const blob = await resp.blob();
      const bitmap = await createImageBitmap(blob);
      tw = bitmap.width; th = bitmap.height;
      canvas = new OffscreenCanvas(tw, th);
      ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } else if (templateUrl) {
      if (skipColorize) {
        const bitmap = await loadBitmap(templateUrl);
        tw = bitmap.width; th = bitmap.height;
        canvas = new OffscreenCanvas(tw, th);
        ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
      } else {
        const { imageData: tplData, width, height } = await loadImageData(templateUrl);
        tw = width; th = height;
        canvas = new OffscreenCanvas(tw, th);
        ctx = canvas.getContext('2d');
        const color = hexToRgb(colorHex || '#FFFFFF');
        const colorized = colorizeTemplate(tplData, color);
        ctx.putImageData(colorized, 0, 0);
      }
    } else {
      throw new Error('renderMockup: templateUrl or preRenderedVariantUrl required');
    }

    const pa = computePrintArea(tw, th, printAreaRect, printifyDimensions, useFullImageAsPrintArea, useExactPrintAreaRect);

    // Clip to print area
    ctx.save();
    ctx.beginPath();
    ctx.rect(pa.x, pa.y, pa.w, pa.h);
    ctx.clip();

    // Draw all designs
    const allDesigns = [];
    // Keep persisted placement values from Product Detail Modal.
    // Forcing x/y to center here causes a drift between Mockup and Print Area tabs.
    if (designUrl) allDesigns.push({ url: designUrl, ...(placement || {}) });
    for (const d of additionalDesigns) { if (d.url) allDesigns.push(d); }

    for (const design of allDesigns) {
      try {
        const bitmap = await loadBitmap(design.url);
        if (design.pattern?.enabled) {
          drawPatternDesign(ctx, bitmap, design, pa);
        } else {
          drawSingleDesign(ctx, bitmap, design, pa);
        }
      } catch (err) {
        console.warn('[client-colorize] Design overlay failed:', err);
      }
    }

    ctx.restore(); // remove clip

    if (showPrintAreaOverlay) {
      ctx.fillStyle = 'rgba(0, 180, 80, 0.18)';
      ctx.fillRect(pa.x, pa.y, pa.w, pa.h);
      ctx.strokeStyle = 'rgba(0, 180, 80, 0.85)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1;
      ctx.strokeRect(pa.x, pa.y, pa.w, pa.h);
    }

    const blob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    return URL.createObjectURL(blob);
  }

  /**
   * Render a complete mockup to a visible <canvas> element.
   * Used for interactive editing in the Print Area tab.
   *
   * @param {HTMLCanvasElement} canvasEl - The visible canvas element
   * @param {object} opts
   * @param {ImageBitmap|null} opts.baseBitmap - Pre-loaded base image (colorized template or variant)
   * @param {object[]} opts.designs - All designs with bitmaps: [{ bitmap, scale, angle, x, y, crop, pattern, is_primary }]
   * @param {object} opts.printAreaRect - { x, y, w } normalized
   * @param {object} opts.printifyDimensions - { width, height }
   * @param {boolean} opts.showPrintArea - Draw dashed print area border
   * @param {number|null} opts.selectedDesignIndex - Which design is selected
   * @param {string|null} opts.interactionMode - 'select' | 'move' | 'resize' | 'rotate' | 'crop'
   * @param {object|null} opts.cropState - Temp crop state { x, y, width, height }
   */
  function renderToCanvas(canvasEl, opts) {
    const { baseBitmap, designs = [], printAreaRect, printifyDimensions,
            showPrintArea, selectedDesignIndex, interactionMode, cropState,
            useFullImageAsPrintArea = false, useExactPrintAreaRect = false } = opts;

    if (!baseBitmap) return;

    const bw = baseBitmap.naturalWidth ?? baseBitmap.width;
    const bh = baseBitmap.naturalHeight ?? baseBitmap.height;
    if (!bw || !bh) return;

    // Set canvas resolution (HiDPI aware), let CSS max-width/max-height handle display sizing
    // This makes the canvas layout identical to the <img> tag behavior
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = bw * dpr;
    canvasEl.height = bh * dpr;
    canvasEl.style.width = '';
    canvasEl.style.height = '';

    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, bw, bh);

    // Compute display scale from actual rendered size (for line widths and hit testing)
    const canvasRect = canvasEl.getBoundingClientRect();
    const displayScale = canvasRect.width > 0 ? canvasRect.width / bw : 0.5;

    // Layer 1: Base image (colorized template or pre-rendered variant)
    ctx.drawImage(baseBitmap, 0, 0);

    const pa = computePrintArea(bw, bh, printAreaRect, printifyDimensions, useFullImageAsPrintArea, useExactPrintAreaRect);

    // Layer 2+3: Designs with print area clipping
    ctx.save();
    ctx.beginPath();
    ctx.rect(pa.x, pa.y, pa.w, pa.h);
    ctx.clip();

    for (let i = 0; i < designs.length; i++) {
      const d = designs[i];
      if (!d.bitmap) continue;
      const designData = { ...d };

      // If this design is being cropped, use temp cropState
      if (i === selectedDesignIndex && interactionMode === 'crop' && cropState) {
        designData.crop = cropState;
      }

      if (d.pattern?.enabled) {
        drawPatternDesign(ctx, d.bitmap, designData, pa);
      } else {
        drawSingleDesign(ctx, d.bitmap, designData, pa);
      }
    }

    // Layer 4: Print area – grüner Rahmen (immer sichtbar)
    ctx.save();
    if (pa.w < bw - 2 || pa.h < bh - 2) {
      ctx.fillStyle = 'rgba(0, 180, 80, 0.18)';
      ctx.fillRect(pa.x, pa.y, pa.w, pa.h);
    }
    const lw = 1 / displayScale;
    const dashLen = 6 / displayScale;
    ctx.strokeStyle = 'rgba(0, 180, 80, 0.85)';
    ctx.lineWidth = lw;
    ctx.setLineDash([dashLen, dashLen]);
    ctx.strokeRect(pa.x, pa.y, pa.w, pa.h);
    ctx.restore();

    // Layer 5: Selection handles for selected design
    let cropIconCanvasPos = null;
    if (selectedDesignIndex !== null && selectedDesignIndex !== undefined &&
        selectedDesignIndex >= 0 && selectedDesignIndex < designs.length &&
        interactionMode !== 'crop') {
      const d = designs[selectedDesignIndex];
      if (d.bitmap) {
        const info = getDesignRect(d, pa);
        drawSelectionRect(ctx, info, displayScale);
        // Compute crop icon position in canvas coords for hit-testing
        const chw = info.w / 2, chh = info.h / 2;
        const cropLocalX = chw;
        const cropLocalY = -chh - 20 / displayScale;
        const cRad = (info.angle * Math.PI) / 180;
        const cCos = Math.cos(cRad), cSin = Math.sin(cRad);
        cropIconCanvasPos = {
          x: info.cx + cropLocalX * cCos - cropLocalY * cSin,
          y: info.cy + cropLocalX * cSin + cropLocalY * cCos,
          radius: 12 / displayScale,
        };
      }
    }

    // Layer 5b: Crop overlay
    if (interactionMode === 'crop' && selectedDesignIndex !== null &&
        selectedDesignIndex >= 0 && selectedDesignIndex < designs.length) {
      const d = designs[selectedDesignIndex];
      if (d.bitmap) {
        drawCropOverlay(ctx, d, pa, cropState, bw, bh, displayScale);
      }
    }

    // Store transform info on canvas for hit-testing
    canvasEl._renderInfo = { bw, bh, displayScale, dpr, pa, designs, selectedDesignIndex, cropIconCanvasPos };
  }

  /** Printify aspect 4200×4800 (width/height) */
  const PRINTIFY_ASPECT = 4200 / 4800;

  /**
   * Render print area adjust mode: base image + green draggable/resizable rect only.
   * No design overlay. Aspect corrected via computePrintArea when printifyDimensions given.
   * @param {HTMLCanvasElement} canvasEl
   * @param {object} opts - { baseBitmap, printAreaRect, printifyDimensions? }
   */
  function renderPrintAreaAdjust(canvasEl, opts) {
    const { baseBitmap, printAreaRect, printifyDimensions } = opts;
    if (!baseBitmap) return;

    const bw = baseBitmap.width;
    const bh = baseBitmap.height;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = bw * dpr;
    canvasEl.height = bh * dpr;
    canvasEl.style.width = '';
    canvasEl.style.height = '';
    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.drawImage(baseBitmap, 0, 0);

    const pa = computePrintArea(bw, bh, printAreaRect, printifyDimensions, false);
    const paX = pa.x;
    const paY = pa.y;
    const paW = pa.w;
    const paH = pa.h;

    ctx.fillStyle = 'rgba(0, 180, 80, 0.35)';
    ctx.fillRect(paX, paY, paW, paH);
    ctx.strokeStyle = 'rgba(0, 180, 80, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(paX, paY, paW, paH);

    const rect = canvasEl.getBoundingClientRect();
    const displayScale = rect.width > 0 ? rect.width / bw : 0.5;
    const handleR = 6 / displayScale;
    const handles = [
      { x: paX, y: paY },
      { x: paX + paW, y: paY },
      { x: paX + paW, y: paY + paH },
      { x: paX, y: paY + paH },
    ];
    ctx.fillStyle = 'rgba(0, 180, 80, 0.9)';
    handles.forEach(({ x, y }) => {
      ctx.beginPath();
      ctx.arc(x, y, handleR, 0, Math.PI * 2);
      ctx.fill();
    });

    canvasEl._renderInfo = { bw, bh, displayScale, dpr, pa: { x: paX, y: paY, w: paW, h: paH }, printAreaRect };
  }

  /**
   * Hit test for print area adjust mode.
   * @returns {{ type: 'body'|'corner', cornerIndex?: number }|null}
   */
  function hitTestPrintAreaAdjust(canvasEl, clientX, clientY) {
    const info = canvasEl._renderInfo;
    if (!info) return null;
    const rect = canvasEl.getBoundingClientRect();
    const tx = (clientX - rect.left) / info.displayScale;
    const ty = (clientY - rect.top) / info.displayScale;
    const pa = info.pa;
    const r = 8 / info.displayScale;
    const corners = [
      [pa.x, pa.y], [pa.x + pa.w, pa.y], [pa.x + pa.w, pa.y + pa.h], [pa.x, pa.y + pa.h],
    ];
    for (let i = 0; i < 4; i++) {
      const dx = tx - corners[i][0];
      const dy = ty - corners[i][1];
      if (dx * dx + dy * dy <= r * r) return { type: 'corner', cornerIndex: i };
    }
    if (tx >= pa.x && tx <= pa.x + pa.w && ty >= pa.y && ty <= pa.y + pa.h) {
      return { type: 'body' };
    }
    return null;
  }

  /**
   * Client coords to template pixel coords (for print area adjust).
   */
  function clientToTemplatePixels(canvasEl, clientX, clientY) {
    const info = canvasEl._renderInfo;
    if (!info) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / info.displayScale,
      y: (clientY - rect.top) / info.displayScale,
    };
  }

  /**
   * Get the bounding rect of a design in template pixel coordinates.
   * @param {object} design - Design object with bitmap, scale, x, y, angle, crop
   * @param {object} pa - Print area {x, y, w, h}
   * @param {boolean} [useCrop=true] - If true and design has crop, return the cropped visible area.
   *   Pass false for crop-related operations that need the full design rect.
   */
  function getDesignRect(design, pa, useCrop) {
    const scale = design.scale || 1.0;
    const sw = design.bitmap.width, sh = design.bitmap.height;

    const scaleX = (pa.w * scale) / sw;
    const scaleY = (pa.h * scale) / sh;
    const fitScale = Math.min(scaleX, scaleY);
    const dw = sw * fitScale;
    const dh = sh * fitScale;

    const dx = design.x !== undefined ? design.x : 0.5;
    const dy = design.y !== undefined ? design.y : 0.5;
    const cx = pa.x + dx * pa.w;
    const cy = pa.y + dy * pa.h;
    const angle = design.angle || 0;

    // When crop exists and useCrop is not explicitly false, return cropped visible area
    if (useCrop !== false && design.crop) {
      const cropW = design.crop.width * dw;
      const cropH = design.crop.height * dh;
      // Crop center offset in design-local (unrotated) space
      const localCX = dw * (design.crop.x + design.crop.width / 2 - 0.5);
      const localCY = dh * (design.crop.y + design.crop.height / 2 - 0.5);
      // Rotate offset to world space
      const rad = (angle * Math.PI) / 180;
      const cosA = Math.cos(rad), sinA = Math.sin(rad);
      return {
        cx: cx + localCX * cosA - localCY * sinA,
        cy: cy + localCX * sinA + localCY * cosA,
        w: cropW, h: cropH, angle,
      };
    }

    return { cx, cy, w: dw, h: dh, angle };
  }

  function drawSelectionRect(ctx, info, displayScale) {
    const { cx, cy, w, h, angle } = info;
    const hw = w / 2, hh = h / 2;
    const handleSize = 7 / displayScale;

    ctx.save();
    ctx.translate(cx, cy);
    if (angle) ctx.rotate((angle * Math.PI) / 180);

    // Selection border
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.5 / displayScale;
    ctx.setLineDash([]);
    ctx.strokeRect(-hw, -hh, w, h);

    // Handles
    ctx.fillStyle = '#F59E0B';
    const positions = [
      [-hw, -hh], [0, -hh], [hw, -hh],
      [-hw, 0], [hw, 0],
      [-hw, hh], [0, hh], [hw, hh],
    ];
    for (const [px, py] of positions) {
      ctx.fillRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
    }

    // Rotation handle (circle above center)
    const rotY = -hh - 20 / displayScale;
    ctx.beginPath();
    ctx.arc(0, rotY, 5 / displayScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.lineTo(0, rotY + 5 / displayScale);
    ctx.stroke();

    // Crop icon (above frame, top-right)
    const cropIconX = hw;
    const cropIconY = rotY;
    ctx.beginPath();
    ctx.arc(cropIconX, cropIconY, 12 / displayScale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1 / displayScale;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `${14 / displayScale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u2702', cropIconX, cropIconY);

    ctx.restore();
  }

  function drawCropOverlay(ctx, design, pa, cropState, bw, bh, displayScale) {
    const info = getDesignRect(design, pa, false); // full rect for crop manipulation
    const { cx, cy, w, h, angle } = info;
    const hw = w / 2, hh = h / 2;

    const crop = cropState || design.crop || { x: 0, y: 0, width: 1, height: 1 };
    const cropX = -hw + crop.x * w;
    const cropY = -hh + crop.y * h;
    const cropW = crop.width * w;
    const cropH = crop.height * h;

    // Compute crop corners in canvas coordinates
    const rad = (angle * Math.PI) / 180;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    function toCanvas(lx, ly) {
      return { x: cx + lx * cosA - ly * sinA, y: cy + lx * sinA + ly * cosA };
    }
    const c0 = toCanvas(cropX, cropY);
    const c1 = toCanvas(cropX + cropW, cropY);
    const c2 = toCanvas(cropX + cropW, cropY + cropH);
    const c3 = toCanvas(cropX, cropY + cropH);

    // Dark overlay with evenodd hole at crop region
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, bw, bh);
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill('evenodd');
    ctx.restore();

    // Crop border and handles (in design-local coords)
    ctx.save();
    ctx.translate(cx, cy);
    if (angle) ctx.rotate(rad);

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2 / displayScale;
    ctx.setLineDash([]);
    ctx.strokeRect(cropX, cropY, cropW, cropH);

    const hs = 6 / displayScale;
    ctx.fillStyle = '#22c55e';
    // Corner handles
    const corners = [
      [cropX, cropY], [cropX + cropW, cropY],
      [cropX, cropY + cropH], [cropX + cropW, cropY + cropH],
    ];
    for (const [px, py] of corners) {
      ctx.fillRect(px - hs / 2, py - hs / 2, hs, hs);
    }
    // Edge midpoint handles
    const edgeMids = [
      [cropX + cropW / 2, cropY],           // top
      [cropX + cropW / 2, cropY + cropH],   // bottom
      [cropX, cropY + cropH / 2],           // left
      [cropX + cropW, cropY + cropH / 2],   // right
    ];
    for (const [px, py] of edgeMids) {
      ctx.fillRect(px - hs / 2, py - hs / 2, hs, hs);
    }

    ctx.restore();
  }

  /**
   * Hit-test for crop handles. Returns handle type string or null.
   * @returns {string|null} 'tl','tr','bl','br','top','bottom','left','right','body', or null
   */
  function hitTestCrop(canvasEl, clientX, clientY, designWithBitmap, pa, cropSt) {
    const rect = canvasEl.getBoundingClientRect();
    const bw = designWithBitmap.bitmap ? undefined : 0; // unused directly
    const info = canvasEl._renderInfo;
    if (!info || !designWithBitmap.bitmap) return null;

    const tx = (clientX - rect.left) / info.displayScale;
    const ty = (clientY - rect.top) / info.displayScale;

    const dr = getDesignRect(designWithBitmap, pa, false); // full rect for crop handles
    const hw = dr.w / 2, hh = dr.h / 2;

    // Convert to design-local coordinates (unrotate)
    const dxC = tx - dr.cx, dyC = ty - dr.cy;
    const rad = -(dr.angle * Math.PI) / 180;
    const cosR = Math.cos(rad), sinR = Math.sin(rad);
    const lx = dxC * cosR - dyC * sinR;
    const ly = dxC * sinR + dyC * cosR;

    // Normalize to 0-1 within design bounds
    const nx = (lx + hw) / dr.w;
    const ny = (ly + hh) / dr.h;

    const crop = cropSt || { x: 0, y: 0, width: 1, height: 1 };
    const ht = 12 / info.displayScale / Math.max(dr.w, dr.h); // hit threshold normalized

    // Corners first (take priority)
    if (Math.abs(nx - crop.x) < ht && Math.abs(ny - crop.y) < ht) return 'tl';
    if (Math.abs(nx - (crop.x + crop.width)) < ht && Math.abs(ny - crop.y) < ht) return 'tr';
    if (Math.abs(nx - crop.x) < ht && Math.abs(ny - (crop.y + crop.height)) < ht) return 'bl';
    if (Math.abs(nx - (crop.x + crop.width)) < ht && Math.abs(ny - (crop.y + crop.height)) < ht) return 'br';

    // Edges
    if (Math.abs(ny - crop.y) < ht && nx > crop.x - ht && nx < crop.x + crop.width + ht) return 'top';
    if (Math.abs(ny - (crop.y + crop.height)) < ht && nx > crop.x - ht && nx < crop.x + crop.width + ht) return 'bottom';
    if (Math.abs(nx - crop.x) < ht && ny > crop.y - ht && ny < crop.y + crop.height + ht) return 'left';
    if (Math.abs(nx - (crop.x + crop.width)) < ht && ny > crop.y - ht && ny < crop.y + crop.height + ht) return 'right';

    // Body (move)
    if (nx >= crop.x && nx <= crop.x + crop.width && ny >= crop.y && ny <= crop.y + crop.height) return 'body';

    return null;
  }

  /**
   * Convert client coords to design-normalized (0-1) coordinates.
   */
  function clientToDesignNormalized(canvasEl, clientX, clientY, designWithBitmap, pa) {
    const info = canvasEl._renderInfo;
    if (!info || !designWithBitmap.bitmap) return { x: 0.5, y: 0.5 };

    const rect = canvasEl.getBoundingClientRect();
    const tx = (clientX - rect.left) / info.displayScale;
    const ty = (clientY - rect.top) / info.displayScale;

    const dr = getDesignRect(designWithBitmap, pa, false); // full rect for coordinate mapping
    const hw = dr.w / 2, hh = dr.h / 2;

    const dxC = tx - dr.cx, dyC = ty - dr.cy;
    const rad = -(dr.angle * Math.PI) / 180;
    const cosR = Math.cos(rad), sinR = Math.sin(rad);
    const lx = dxC * cosR - dyC * sinR;
    const ly = dxC * sinR + dyC * cosR;

    return { x: (lx + hw) / dr.w, y: (ly + hh) / dr.h };
  }

  /**
   * Hit-test: convert CSS pixel click position to template coordinates
   * and find which design (if any) was clicked.
   * @returns {{ designIndex: number, handleType: string|null }} or null
   */
  function hitTest(canvasEl, clientX, clientY) {
    const info = canvasEl._renderInfo;
    if (!info) return null;

    const rect = canvasEl.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const tx = cssX / info.displayScale;
    const ty = cssY / info.displayScale;

    // Check crop icon first
    if (info.cropIconCanvasPos) {
      const dx = tx - info.cropIconCanvasPos.x;
      const dy = ty - info.cropIconCanvasPos.y;
      const r = info.cropIconCanvasPos.radius * 1.3;
      if (dx * dx + dy * dy <= r * r) {
        return { designIndex: info.selectedDesignIndex, handleType: 'crop' };
      }
    }

    // Check handles of selected design
    if (info.selectedDesignIndex >= 0 && info.selectedDesignIndex < info.designs.length) {
      const d = info.designs[info.selectedDesignIndex];
      if (d.bitmap) {
        const dr = getDesignRect(d, info.pa);
        const hw = dr.w / 2, hh = dr.h / 2;
        const dxC = tx - dr.cx, dyC = ty - dr.cy;
        const rad = -(dr.angle * Math.PI) / 180;
        const cosR = Math.cos(rad), sinR = Math.sin(rad);
        const lx = dxC * cosR - dyC * sinR;
        const ly = dxC * sinR + dyC * cosR;
        const hs = 12 / info.displayScale;

        // Rotation handle
        const rotY = -hh - 20 / info.displayScale;
        if (Math.abs(lx) < hs && Math.abs(ly - rotY) < hs) {
          return { designIndex: info.selectedDesignIndex, handleType: 'rotate' };
        }

        // Corner resize handles
        const cornerHandles = [
          [-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh],
        ];
        for (const [cx, cy] of cornerHandles) {
          if (Math.abs(lx - cx) < hs && Math.abs(ly - cy) < hs) {
            return { designIndex: info.selectedDesignIndex, handleType: 'resize' };
          }
        }
      }
    }

    // Check designs back-to-front for body hits
    for (let i = info.designs.length - 1; i >= 0; i--) {
      const d = info.designs[i];
      if (!d.bitmap) continue;
      const dr = getDesignRect(d, info.pa);
      const hw = dr.w / 2, hh = dr.h / 2;
      const dxC = tx - dr.cx, dyC = ty - dr.cy;
      const rad = -(dr.angle * Math.PI) / 180;
      const cosR = Math.cos(rad), sinR = Math.sin(rad);
      const lx = dxC * cosR - dyC * sinR;
      const ly = dxC * sinR + dyC * cosR;
      if (lx >= -hw && lx <= hw && ly >= -hh && ly <= hh) {
        return { designIndex: i, handleType: 'move' };
      }
    }

    return null;
  }

  /**
   * Convert a CSS client position to normalized print-area-relative coordinates.
   */
  function clientToPrintAreaCoords(canvasEl, clientX, clientY) {
    const info = canvasEl._renderInfo;
    if (!info) return { x: 0.5, y: 0.5 };

    const rect = canvasEl.getBoundingClientRect();
    const tx = (clientX - rect.left) / info.displayScale;
    const ty = (clientY - rect.top) / info.displayScale;

    return {
      x: (tx - info.pa.x) / info.pa.w,
      y: (ty - info.pa.y) / info.pa.h,
    };
  }

  // ─── Other utilities ─────────────────────────────────────────────

  async function renderColorPreview(templateUrl, colorHex) {
    const { imageData: tplData, width: tw, height: th } = await loadImageData(templateUrl);
    const color = hexToRgb(colorHex || '#FFFFFF');
    const colorized = colorizeTemplate(tplData, color);
    const canvas = new OffscreenCanvas(tw, th);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(colorized, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png', quality: 0.92 });
    return URL.createObjectURL(blob);
  }

  async function preloadTemplate(templateUrl) { await loadImageData(templateUrl); }

  function clearCache() {
    imageDataCache.clear();
    for (const bm of bitmapCache.values()) { try { bm.close(); } catch {} }
    bitmapCache.clear();
  }

  // ─── Public API ──────────────────────────────────────────────────
  window.ClientColorize = {
    renderMockup,
    renderToCanvas,
    renderPrintAreaAdjust,
    renderColorPreview,
    preloadTemplate,
    clearCache,
    hexToRgb,
    loadBitmap,
    computePrintArea,
    getDesignRect,
    hitTest,
    hitTestCrop,
    hitTestPrintAreaAdjust,
    clientToPrintAreaCoords,
    clientToDesignNormalized,
    clientToTemplatePixels,
    PRINTIFY_ASPECT: 4200 / 4800,
    _imageDataCache: imageDataCache,
    _bitmapCache: bitmapCache,
  };

})();
