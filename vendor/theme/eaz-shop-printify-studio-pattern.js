/**
 * Printify pattern math for Design Studio mock (keep in sync with src/features/shop/studioPatternMath.js).
 */
(function (global) {
  'use strict';

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function normalizePatternMode(mode) {
    var m = String(mode || 'grid').toLowerCase();
    if (m === 'brick_horizontal' || m === 'brick_h') return 'brick_h';
    if (m === 'brick_vertical' || m === 'brick_v') return 'brick_v';
    return 'grid';
  }

  function resolveStudioPattern(patternRaw) {
    if (!patternRaw || patternRaw.enabled === false) return null;

    var mode = normalizePatternMode(patternRaw.mode);
    var sx = Number(patternRaw.spacing_x != null ? patternRaw.spacing_x : 1);
    var sy = Number(patternRaw.spacing_y != null ? patternRaw.spacing_y : 1);
    if (!Number.isFinite(sx) || sx <= 0) sx = 1;
    if (!Number.isFinite(sy) || sy <= 0) sy = 1;

    var offset = Number(patternRaw.offset != null ? patternRaw.offset : 0);
    if (!Number.isFinite(offset)) offset = 0;

    var angle = Number(
      patternRaw.pattern_angle != null
        ? patternRaw.pattern_angle
        : patternRaw.angle != null
          ? patternRaw.angle
          : 0
    );
    if (!Number.isFinite(angle)) angle = 0;

    var isBrick = mode === 'brick_h' || mode === 'brick_v';
    if (isBrick && offset === 0) offset = 0.5;

    if (mode === 'brick_v') {
      angle = clamp(45 - angle, -45, 45);
    }

    sx = clamp(sx, 0.05, 10);
    sy = clamp(sy, 0.05, 10);
    offset = clamp(offset, -1, 1);
    angle = clamp(angle, -45, 45);

    return {
      mode: mode,
      spacing_x: Math.round(sx * 10000) / 10000,
      spacing_y: Math.round(sy * 10000) / 10000,
      angle: Math.round(angle * 10000) / 10000,
      offset: Math.round(offset * 10000) / 10000,
    };
  }

  function studioPatternToPrintifyApi(resolved) {
    if (!resolved) return null;
    return {
      spacing_x: resolved.spacing_x,
      spacing_y: resolved.spacing_y,
      angle: resolved.angle,
      offset: resolved.offset,
    };
  }

  function drawStudioPatternTiles(ctx, opts) {
    var resolved = resolveStudioPattern(opts.pattern);
    if (!resolved || !opts.image) return;

    var nw = opts.image.naturalWidth || 0;
    var nh = opts.image.naturalHeight || 0;
    if (nw < 2 || nh < 2) return;

    var zw = Math.max(2, opts.zoneWidth | 0);
    var zh = Math.max(2, opts.zoneHeight | 0);
    var scaleVal = clamp(Number(opts.tileScale != null ? opts.tileScale : 0.95), 0.08, 2.5);
    var zwPx = Math.max(24, opts.zoneWidthPx || zw);
    var tileW = Math.max(8, zwPx * scaleVal);
    var tileH = Math.max(8, (tileW * nh) / nw);

    var stepW = Math.max(4, tileW * resolved.spacing_x);
    var stepH = Math.max(4, tileH * resolved.spacing_y);

    var drawMode = normalizePatternMode(opts.pattern.mode);
    var offset = resolved.offset;
    var patDeg = Number(
      opts.pattern.pattern_angle != null
        ? opts.pattern.pattern_angle
        : opts.pattern.angle != null
          ? opts.pattern.angle
          : 0
    );
    if (!Number.isFinite(patDeg)) patDeg = 0;
    patDeg = clamp(patDeg, -45, 45);

    var rotStepH = clamp(Number(opts.rotationStepH != null ? opts.rotationStepH : 0), -180, 180);
    var rotStepV = clamp(Number(opts.rotationStepV != null ? opts.rotationStepV : 0), -180, 180);
    var tileBodyDeg = Number(opts.tileAngle != null ? opts.tileAngle : 0) || 0;

    var cx = zw * 0.5 + (Number(opts.designDx) || 0);
    var cy = zh * 0.5 + (Number(opts.designDy) || 0);

    var rad = Math.PI / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(patDeg * rad);
    ctx.translate(-cx, -cy);

    var span = Math.sqrt(zw * zw + zh * zh) * 0.72;
    var cn = Math.max(10, Math.ceil(span / Math.max(4, Math.min(stepW, stepH))) + 3);

    var rr;
    var cc;
    for (rr = -cn; rr <= cn; rr++) {
      for (cc = -cn; cc <= cn; cc++) {
        var bx = cx + cc * stepW;
        var by = cy + rr * stepH;
        if (drawMode === 'brick_h' && rr % 2 !== 0) {
          bx += offset * stepW;
        } else if (drawMode === 'brick_v' && cc % 2 !== 0) {
          by += offset * stepH;
        } else if (drawMode === 'grid' && Math.abs(offset) > 0.0001 && rr % 2 !== 0) {
          bx += offset * stepW;
        }

        var stepRot = rotStepH * cc + rotStepV * rr;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate((tileBodyDeg + stepRot) * rad);
        ctx.globalAlpha = opts.alpha != null ? opts.alpha : 0.97;
        try {
          ctx.drawImage(opts.image, 0, 0, nw, nh, -tileW / 2, -tileH / 2, tileW, tileH);
        } catch (eDraw) {}
        ctx.restore();
      }
    }

    ctx.restore();
  }

  global.eazPfsPatternMath = {
    clamp: clamp,
    resolveStudioPattern: resolveStudioPattern,
    studioPatternToPrintifyApi: studioPatternToPrintifyApi,
    drawStudioPatternTiles: drawStudioPatternTiles,
  };
})(typeof window !== 'undefined' ? window : globalThis);
