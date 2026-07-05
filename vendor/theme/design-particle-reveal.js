/**
 * Design Particle Reveal - row-based pixel fade-in
 */
(function(root) {
  'use strict';

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /** Exakt wie ParticleReveal (mobile Sidebar): volles Bild zentriert */
  function sampleImageLikeParticleReveal(img, sampleStep, canvasW, canvasH) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return { pixels: [], layout: null };
    var scale = Math.min((canvasW - 20) / w, (canvasH - 20) / h, 1);
    var iw = Math.floor(w * scale);
    var ih = Math.floor(h * scale);
    var ox = (canvasW - iw) / 2;
    var oy = (canvasH - ih) / 2;
    var c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    var cctx = c.getContext('2d', { alpha: true });
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(img, 0, 0, w, h, 0, 0, iw, ih);
    var data = cctx.getImageData(0, 0, iw, ih).data;
    var pixels = [];
    for (var y = 0; y < ih; y += sampleStep) {
      for (var x = 0; x < iw; x += sampleStep) {
        var i = (y * iw + x) * 4;
        var a = data[i + 3];
        if (a > 25) {
          pixels.push({
            x: ox + x,
            y: oy + y,
            cr: data[i],
            cg: data[i + 1],
            cb: data[i + 2],
            ca: a / 255
          });
        }
      }
    }
    return { pixels: pixels, layout: { img: img, ox: ox, oy: oy, iw: iw, ih: ih } };
  }

  function sampleImage(img, sampleStep, canvasW, canvasH, padding, alignLeft, leftPaddingVal, alignRightOfBadge) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return { pixels: [], layout: null };

    padding = padding != null ? padding : 0;
    var rightPadding = padding;
    var leftPad = padding;
    if (alignRightOfBadge && leftPaddingVal != null) {
      leftPad = leftPaddingVal;
      rightPadding = padding;
    } else if (alignLeft && leftPaddingVal != null) {
      leftPad = leftPaddingVal;
      rightPadding = Math.max(padding, 0.25);
    }
    var effectiveW = canvasW * (1 - leftPad - rightPadding);
    var effectiveH = canvasH * (1 - 2 * padding);
    var scale = Math.min(effectiveW / w, effectiveH / h, 1);
    var iw = Math.floor(w * scale);
    var ih = Math.floor(h * scale);
    var ox = (alignLeft || alignRightOfBadge) ? canvasW * leftPad : (canvasW - iw) / 2;
    var oy = (canvasH - ih) / 2;

    var c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    var cctx = c.getContext('2d', { alpha: true });
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(img, 0, 0, w, h, 0, 0, iw, ih);

    var data = cctx.getImageData(0, 0, iw, ih).data;
    var pixels = [];
    for (var y = 0; y < ih; y += sampleStep) {
      for (var x = 0; x < iw; x += sampleStep) {
        var i = (y * iw + x) * 4;
        var a = data[i + 3];
        if (a > 25) {
          pixels.push({
            x: ox + x,
            y: oy + y,
            cr: data[i],
            cg: data[i + 1],
            cb: data[i + 2],
            ca: a / 255
          });
        }
      }
    }
    return { pixels: pixels, layout: { img: img, ox: ox, oy: oy, iw: iw, ih: ih } };
  }

  function sampleImageInRect(img, sampleStep, rectX, rectY, rectW, rectH) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!iw || !ih || rectW <= 0 || rectH <= 0) return { pixels: [], layout: null };
    var scale = Math.min(rectW / iw, rectH / ih, 1);
    var sw = Math.floor(iw * scale);
    var sh = Math.floor(ih * scale);
    var ox = rectX + (rectW - sw) / 2;
    var oy = rectY + (rectH - sh) / 2;
    var c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    var cctx = c.getContext('2d', { alpha: true });
    cctx.imageSmoothingEnabled = true;
    cctx.imageSmoothingQuality = 'high';
    cctx.drawImage(img, 0, 0, iw, ih, 0, 0, sw, sh);
    var data = cctx.getImageData(0, 0, sw, sh).data;
    var pixels = [];
    for (var y = 0; y < sh; y += sampleStep) {
      for (var x = 0; x < sw; x += sampleStep) {
        var i = (y * sw + x) * 4;
        var a = data[i + 3];
        if (a > 25) {
          pixels.push({
            x: ox + x,
            y: oy + y,
            cr: data[i],
            cg: data[i + 1],
            cb: data[i + 2],
            ca: a / 255
          });
        }
      }
    }
    return { pixels: pixels, layout: { img: img, ox: ox, oy: oy, iw: sw, ih: sh } };
  }

  function createRows(pixels) {
    var byRow = new Map();
    for (var i = 0; i < pixels.length; i++) {
      var p = pixels[i];
      var rowKey = Math.round(p.y / 4) * 4;
      if (!byRow.has(rowKey)) byRow.set(rowKey, []);
      byRow.get(rowKey).push(p);
    }
    return Array.from(byRow.entries()).sort(function(a, b) { return a[0] - b[0]; }).map(function(entry) { return entry[1]; });
  }

  function createSnakePath(pixels) {
    var byRow = new Map();
    for (var i = 0; i < pixels.length; i++) {
      var p = pixels[i];
      var rowKey = Math.round(p.y / 4) * 4;
      if (!byRow.has(rowKey)) byRow.set(rowKey, []);
      byRow.get(rowKey).push(p);
    }
    var rows = Array.from(byRow.entries()).sort(function(a, b) { return a[0] - b[0]; }).map(function(entry) { return entry[1]; });
    var path = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      row.sort(function(a, b) { return a.x - b.x; });
      if (r % 2 === 1) row.reverse();
      for (var j = 0; j < row.length; j++) path.push(row[j]);
    }
    return path;
  }

  function quadBezier(t, p0, p1, p2) {
    var u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
  }

  function run(container, imageUrl, opts) {
    opts = opts || {};
    var density = opts.density != null ? opts.density : 8;
    var backgroundColor = opts.backgroundColor || '#121827';
    var onComplete = opts.onComplete || function() {};
    var duration = opts.duration != null ? opts.duration : 1.2;
    var preloadedImage = opts.preloadedImage || null;
    var padding = opts.padding != null ? opts.padding : 0;
    var particleOpacity = opts.particleOpacity != null ? opts.particleOpacity : 0.4;
    var mockUrl = opts.mockUrl || null;
    var mockPrintArea = opts.mockPrintArea || { x: 0.15, y: 0.18, w: 0.15, h: 0.10 };
    var savedLayout = opts.savedLayout || null;
    var skipAnimation = opts.skipAnimation === true;

    var w = 0, h = 0;
    var rows = [];
    var layout = null;
    var pixelSize = density + 2;
    var rafId = null;
    var startTime = 0;
    var fadeDuration = 0.15;
    var stagger = 0;
    var startY = 0;

    var canvas = document.createElement('canvas');
    canvas.className = 'design-particle-reveal-canvas';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    container.style.position = container.style.position || 'relative';
    container.appendChild(canvas);

    var useAlpha = backgroundColor === 'transparent' || (typeof backgroundColor === 'string' && backgroundColor.indexOf('rgba') === 0 && backgroundColor.indexOf(', 0)') !== -1);
    var ctx = canvas.getContext('2d', { alpha: useAlpha });
    var DPR = Math.min(3, Math.max(2, window.devicePixelRatio || 1));

    function resize() {
      var cw = canvas.offsetWidth || 0;
      var ch = canvas.offsetHeight || 0;
      if ((cw === 0 || ch === 0) && container.parentElement) {
        cw = container.parentElement.offsetWidth || cw;
        ch = container.parentElement.offsetHeight || ch;
      }
      w = Math.floor(cw * DPR);
      h = Math.floor(ch * DPR);
      canvas.width = w;
      canvas.height = h;
      startY = h + 15;
    }

    var travelDuration = 0.65;
    var mockLayout = null;

    function init(imgEl, mockImgEl) {
      resize();
      if (mockUrl && mockImgEl && mockImgEl.naturalWidth) {
        var cw = (canvas.offsetWidth || container.offsetWidth || 800) / DPR;
        var ch = (canvas.offsetHeight || container.offsetHeight || 400) / DPR;
        var mw = mockImgEl.naturalWidth || mockImgEl.width;
        var mh = mockImgEl.naturalHeight || mockImgEl.height;
        var scale = Math.min(cw / mw, ch / mh, 1) * 1.05;
        var mockW = mw * scale;
        var mockH = mh * scale;
        var mockLeft = (cw - mockW) / 2;
        var mockTop = (ch - mockH) / 2 - 10;
        mockLayout = { left: mockLeft, top: mockTop, width: mockW, height: mockH, img: mockImgEl };
      }
      var result = sampleImageLikeParticleReveal(imgEl, density, w, h);
      if (!result.pixels.length || !result.layout) { onComplete(); return; }
      layout = result.layout;
      if (savedLayout && savedLayout.design && savedLayout.design.x != null && savedLayout.design.y != null) {
        var hero = document.getElementById('creatorDesktopHero');
        var heroRect = hero ? hero.getBoundingClientRect() : { left: 0, top: 0 };
        var containerRect = container.getBoundingClientRect();
        var offsetX = containerRect.left - heroRect.left;
        var offsetY = containerRect.top - heroRect.top;
        var targetOx = (savedLayout.design.x - offsetX) * DPR;
        var targetOy = (savedLayout.design.y - offsetY) * DPR;
        var maxW = (savedLayout.design.w != null ? savedLayout.design.w : layout.iw / DPR) * DPR;
        var maxH = (savedLayout.design.h != null ? savedLayout.design.h : layout.ih / DPR) * DPR;
        var scaleX = layout.iw > 0 ? maxW / layout.iw : 1;
        var scaleY = layout.ih > 0 ? maxH / layout.ih : 1;
        var uniformScale = Math.min(scaleX, scaleY);
        var targetW = layout.iw * uniformScale;
        var targetH = layout.ih * uniformScale;
        var cx = layout.ox + layout.iw / 2;
        var cy = layout.oy + layout.ih / 2;
        var tcx = targetOx + maxW / 2;
        var tcy = targetOy + maxH / 2;
        for (var pi = 0; pi < result.pixels.length; pi++) {
          var p = result.pixels[pi];
          result.pixels[pi].x = tcx + (p.x - cx) * uniformScale;
          result.pixels[pi].y = tcy + (p.y - cy) * uniformScale;
        }
        layout.ox = targetOx + (maxW - targetW) / 2;
        layout.oy = targetOy + (maxH - targetH) / 2;
        layout.iw = targetW;
        layout.ih = targetH;
      }
      if (savedLayout && savedLayout.mock && savedLayout.mock.x != null && savedLayout.mock.y != null && mockLayout) {
        mockLayout = {
          left: savedLayout.mock.x,
          top: savedLayout.mock.y,
          width: savedLayout.mock.w != null ? savedLayout.mock.w : mockLayout.width,
          height: savedLayout.mock.h != null ? savedLayout.mock.h : mockLayout.height,
          img: mockLayout.img
        };
      }
      if (skipAnimation) return;
      rows = createRows(result.pixels);
      var numRows = rows.length;
      duration = Math.max(1.5, Math.min(5, numRows * 0.11));
      travelDuration = Math.min(0.7, duration * 0.18);
      stagger = numRows > 1 ? (duration - travelDuration) / Math.max(1, numRows - 1) : 0;
      startTime = performance.now();
    }

    function tick(now) {
      var elapsed = (now - startTime) / 1000;
      var r = pixelSize;
      var allComplete = true;
      var revealY = 0;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, w, h);

      for (var ri = 0; ri < rows.length; ri++) {
        var rowPixels = rows[ri];
        var rowDelay = ri * stagger;
        var localTime = elapsed - rowDelay;
        var rowComplete = localTime >= travelDuration;
        if (!rowComplete) allComplete = false;

        var rowBottom = 0;
        for (var pj = 0; pj < rowPixels.length; pj++) {
          rowBottom = Math.max(rowBottom, rowPixels[pj].y + r / 2);
        }

        if (rowComplete) {
          revealY = Math.max(revealY, rowBottom);
        } else {
          for (var pi = 0; pi < rowPixels.length; pi++) {
            var p = rowPixels[pi];
            var drawX = p.x;
            var drawY = p.y;
            if (localTime < 0) continue;
            if (localTime >= travelDuration) {
              drawX = p.x;
              drawY = p.y;
            } else {
              var t = localTime / travelDuration;
              var eased = easeOutCubic(t);
              drawY = startY + (p.y - startY) * eased;
            }
            ctx.fillStyle = 'rgba(' + p.cr + ',' + p.cg + ',' + p.cb + ',' + (p.ca * particleOpacity) + ')';
            ctx.fillRect(drawX - r / 2, drawY - r / 2, r, r);
          }
        }
      }

      if (revealY > 0 && layout) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = particleOpacity;
        ctx.beginPath();
        ctx.rect(0, 0, w, revealY);
        ctx.clip();
        ctx.drawImage(layout.img, 0, 0, layout.img.naturalWidth, layout.img.naturalHeight,
          layout.ox, layout.oy, layout.iw, layout.ih);
        ctx.restore();
      }

      if (allComplete && rows.length > 0) {
        stop();
        var lox = Math.round(layout.ox / DPR);
        var loy = Math.round(layout.oy / DPR);
        var liw = Math.round(layout.iw / DPR);
        var lih = Math.round(layout.ih / DPR);

        canvas.width = layout.iw;
        canvas.height = layout.ih;
        ctx = canvas.getContext('2d', { alpha: useAlpha });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, layout.iw, layout.ih);
        ctx.drawImage(layout.img, 0, 0, layout.img.naturalWidth, layout.img.naturalHeight,
          0, 0, layout.iw, layout.ih);

        canvas.dataset.heroElement = 'design';
        canvas.style.cssText = 'position:absolute;left:' + lox + 'px;top:' + loy + 'px;width:' + liw + 'px;height:' + lih + 'px;display:block;pointer-events:none;z-index:1';

        var hero = document.getElementById('creatorDesktopHero');
        var heroRect = hero ? hero.getBoundingClientRect() : null;
        var containerRect = container.getBoundingClientRect();
        var offsetX = heroRect ? containerRect.left - heroRect.left : 0;
        var offsetY = heroRect ? containerRect.top - heroRect.top : 0;

        function addMock() {
          if (mockLayout && mockLayout.img) {
            var mockImg = mockLayout.img;
            mockImg.dataset.heroElement = 'mock';
            var sm = savedLayout && savedLayout.mock;
            var ml, mt, mw, mh;
            if (sm && sm.x != null && sm.y != null) {
              ml = Math.round(sm.x - offsetX);
              mt = Math.round(sm.y - offsetY);
              mw = Math.round(sm.w || mockLayout.width);
              mh = Math.round(sm.h || mockLayout.height);
            } else {
              ml = Math.round(mockLayout.left);
              mt = Math.round(mockLayout.top);
              mw = Math.round(mockLayout.width);
              mh = Math.round(mockLayout.height);
            }
            mockImg.style.cssText = 'position:absolute;left:' + ml + 'px;top:' + mt + 'px;width:' + mw + 'px;height:' + mh + 'px;object-fit:contain;object-position:center;pointer-events:none;opacity:0;transform:scale(0.96);transform-origin:center center;transition:opacity 0.9s ease-out,transform 0.9s ease-out;z-index:0';
            container.insertBefore(mockImg, container.firstChild);
            requestAnimationFrame(function () {
              mockImg.style.opacity = '1';
              mockImg.style.transform = 'scale(1)';
            });
          }
        }

        onComplete();
        if (mockLayout && mockLayout.img) {
          setTimeout(addMock, 350);
        }
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function startWithImage(img, mockImg) {
      if (!img || !img.naturalWidth) { onComplete(); return; }
      if (mockUrl) {
        if (mockImg && mockImg.naturalWidth) {
          init(img, mockImg);
          if (skipAnimation) { showFinalState(); return; }
          rafId = requestAnimationFrame(tick);
        } else {
          var mockImage = new Image();
          mockImage.crossOrigin = 'anonymous';
          mockImage.onerror = function() { init(img, null); if (skipAnimation) { showFinalState(); return; } rafId = requestAnimationFrame(tick); };
          mockImage.onload = function() { init(img, mockImage); if (skipAnimation) { showFinalState(); return; } rafId = requestAnimationFrame(tick); };
          mockImage.src = mockUrl;
        }
      } else {
        init(img, null);
        if (skipAnimation) { showFinalState(); return; }
        rafId = requestAnimationFrame(tick);
      }
    }

    function showFinalState() {
      if (!layout) { onComplete(); return; }
      var lox = Math.round(layout.ox / DPR);
      var loy = Math.round(layout.oy / DPR);
      var liw = Math.round(layout.iw / DPR);
      var lih = Math.round(layout.ih / DPR);

      canvas.width = layout.iw;
      canvas.height = layout.ih;
      ctx = canvas.getContext('2d', { alpha: useAlpha });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, layout.iw, layout.ih);
      ctx.drawImage(layout.img, 0, 0, layout.img.naturalWidth, layout.img.naturalHeight,
        0, 0, layout.iw, layout.ih);

      canvas.dataset.heroElement = 'design';
      canvas.style.cssText = 'position:absolute;left:' + lox + 'px;top:' + loy + 'px;width:' + liw + 'px;height:' + lih + 'px;display:block;pointer-events:none;z-index:1';

      var hero = document.getElementById('creatorDesktopHero');
      var heroRect = hero ? hero.getBoundingClientRect() : null;
      var containerRect = container.getBoundingClientRect();
      var offsetX = heroRect ? containerRect.left - heroRect.left : 0;
      var offsetY = heroRect ? containerRect.top - heroRect.top : 0;

      function addMockFinal() {
        if (mockLayout && mockLayout.img) {
          var mockImg = mockLayout.img;
          mockImg.dataset.heroElement = 'mock';
          var sm = savedLayout && savedLayout.mock;
          var ml, mt, mw, mh;
          if (sm && sm.x != null && sm.y != null) {
            ml = Math.round(sm.x - offsetX);
            mt = Math.round(sm.y - offsetY);
            mw = sm.w || mockLayout.width;
            mh = sm.h || mockLayout.height;
          } else {
            ml = Math.round(mockLayout.left);
            mt = Math.round(mockLayout.top);
            mw = Math.round(mockLayout.width);
            mh = Math.round(mockLayout.height);
          }
          mockImg.style.cssText = 'position:absolute;left:' + ml + 'px;top:' + mt + 'px;width:' + mw + 'px;height:' + mh + 'px;object-fit:contain;object-position:center;pointer-events:none;opacity:1;z-index:0';
          container.insertBefore(mockImg, container.firstChild);
        }
      }
      onComplete();
      if (mockLayout && mockLayout.img) {
        setTimeout(addMockFinal, 350);
      }
    }

    if (preloadedImage && preloadedImage.complete && preloadedImage.naturalWidth) {
      startWithImage(preloadedImage, null);
    } else if (preloadedImage) {
      preloadedImage.onload = function() { startWithImage(preloadedImage, null); };
      preloadedImage.onerror = function() { onComplete(); };
    } else if (imageUrl) {
      var image = new Image();
      image.crossOrigin = 'anonymous';
      image.onerror = function() { onComplete(); };
      image.onload = function() { startWithImage(image, null); };
      image.src = imageUrl;
    } else {
      onComplete();
    }

    return { stop: stop };
  }

  function getDurationForImage(img, opts) {
    opts = opts || {};
    var density = opts.density != null ? opts.density : 6;
    var DPR = Math.min(2, typeof window !== 'undefined' && window.devicePixelRatio || 1);
    var canvasW = Math.floor(800 * DPR);
    var canvasH = Math.floor(400 * DPR);
    var result = sampleImageLikeParticleReveal(img, density, canvasW, canvasH);
    if (!result.pixels.length) return 4;
    var rows = createRows(result.pixels);
    var numRows = rows.length;
    return Math.max(1.5, Math.min(5, numRows * 0.11));
  }

  root.DesignParticleReveal = { run: run, getDurationForImage: getDurationForImage };
})(typeof window !== 'undefined' ? window : {});
