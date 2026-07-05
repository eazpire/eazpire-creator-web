/**
 * Pixel Float Animation
 * Phase 1: Pixel schweben von unten nach oben, Reihe für Reihe → echtes Bild
 * Phase 2: Bild löst sich auf (Dissolve) – parallel beginnt das nächstes Design mit Assemble
 * Phase 3: onComplete → Schleife via getNextUrl
 *
 * Verwendung:
 *   ParticleReveal.run(canvas, imageUrl, {
 *     density: 6, duration: 5,
 *     getNextUrl: fn,  // optional – liefert nächstes Bild; Überlappung Dissolve + Assemble
 *     onComplete: fn
 *   })
 */
(function(root) {
  'use strict';

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function sampleImage(img, sampleStep, canvasW, canvasH) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return { pixels: [], layout: null };

    const scale = Math.min((canvasW - 20) / w, (canvasH - 20) / h, 1);
    const iw = Math.floor(w * scale);
    const ih = Math.floor(h * scale);
    const ox = (canvasW - iw) / 2;
    const oy = (canvasH - ih) / 2;

    const c = document.createElement('canvas');
    c.width = iw;
    c.height = ih;
    const ctx = c.getContext('2d', { alpha: true });
    ctx.drawImage(img, 0, 0, w, h, 0, 0, iw, ih);

    const data = ctx.getImageData(0, 0, iw, ih).data;
    const pixels = [];

    for (let y = 0; y < ih; y += sampleStep) {
      for (let x = 0; x < iw; x += sampleStep) {
        const i = (y * iw + x) * 4;
        const a = data[i + 3];
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
    return {
      pixels: pixels,
      layout: { img: img, ox: ox, oy: oy, iw: iw, ih: ih }
    };
  }

  function createRows(pixels, canvasH) {
    const byRow = new Map();
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      const rowKey = Math.round(p.y / 4) * 4;
      if (!byRow.has(rowKey)) byRow.set(rowKey, []);
      byRow.get(rowKey).push(p);
    }
    return Array.from(byRow.entries())
      .sort((a, b) => a[0] - b[0])
      .map(function(entry) { return entry[1]; });
  }

  function createRings(pixels, cx, cy) {
    const byDist = new Map();
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ringKey = Math.round(dist / 4) * 4;
      if (!byDist.has(ringKey)) byDist.set(ringKey, []);
      byDist.get(ringKey).push(p);
    }
    return Array.from(byDist.entries())
      .sort((a, b) => a[0] - b[0])
      .map(function(entry) { return entry[1]; });
  }

  function run(canvas, imageUrl, opts) {
    opts = opts || {};
    const density = opts.density ?? 6;
    const backgroundColor = opts.backgroundColor ?? '#0b0f18';
    const onComplete = opts.onComplete || function() {};
    const getNextUrl = opts.getNextUrl || null;
    const particleOpacity = opts.particleOpacity ?? 0.35;
    const noDissolve = opts.noDissolve || false;
    const radialReveal = opts.radialReveal || false;

    const ctx = canvas.getContext('2d', { alpha: true });
    const DPR = Math.min(2, window.devicePixelRatio || 1);

    let w = 0, h = 0;
    let rows = [];
    let layout = null;
    let pixelSize = density + 2;
    let startY = 0;
    let travelDuration = 0.65;
    let stagger = 0;
    let rafId = null;
    let startTime = 0;
    let phase = 'assemble';
    let dissolveStartTime = 0;
    let totalDuration = 5;
    let dissolveDuration = 2.5;
    let radialFadeDuration = 0.35;
    // Nächstes Bild (lädt während Dissolve, blendet parallel ein)
    let nextRows = [];
    let nextLayout = null;
    let nextStagger = 0;
    let nextTravelDuration = 0.65;

    function resize() {
      w = Math.floor(canvas.offsetWidth * DPR);
      h = Math.floor(canvas.offsetHeight * DPR);
      canvas.width = w;
      canvas.height = h;
      startY = h + 15;
    }

    function init(imgEl) {
      resize();
      const result = sampleImage(imgEl, density, w, h);
      if (!result.pixels.length || !result.layout) {
        onComplete();
        return;
      }
      layout = result.layout;
      if (radialReveal) {
        const cx = layout.ox + layout.iw / 2;
        const cy = layout.oy + layout.ih / 2;
        rows = createRings(result.pixels, cx, cy);
        const numRings = rows.length;
        radialFadeDuration = 0.35;
        totalDuration = Math.max(1.8, Math.min(6, numRings * 0.12));
        stagger = numRings > 1
          ? (totalDuration - radialFadeDuration) / (numRings - 1)
          : 0;
        travelDuration = radialFadeDuration;
      } else {
        rows = createRows(result.pixels, h);
        const numRows = rows.length;
        totalDuration = Math.max(1.5, Math.min(5, numRows * 0.11));
        dissolveDuration = Math.max(0.75, Math.min(2.5, numRows * 0.05));
        travelDuration = Math.min(0.7, totalDuration * 0.18);
        stagger = numRows > 1
          ? (totalDuration - travelDuration) / (numRows - 1)
          : 0;
      }
      startTime = performance.now();
      phase = 'assemble';
    }

    function initNext(imgEl) {
      const result = sampleImage(imgEl, density, w, h);
      if (!result.pixels.length || !result.layout) return;
      nextLayout = result.layout;
      nextRows = createRows(result.pixels, h);
      const numRows = nextRows.length;
      const nextTotalDuration = Math.max(1.5, Math.min(5, numRows * 0.11));
      nextTravelDuration = Math.min(0.7, nextTotalDuration * 0.18);
      nextStagger = numRows > 1
        ? (nextTotalDuration - nextTravelDuration) / (numRows - 1)
        : 0;
    }

    function loadNextImage() {
      if (!getNextUrl) return;
      const url = getNextUrl();
      if (!url) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = function() { nextRows = []; nextLayout = null; };
      img.onload = function() { initNext(img); };
      img.src = url;
    }

    function tick(now) {
      const dt = Math.min(0.04, (now - (tick._last || now)) / 1000);
      tick._last = now;
      const elapsed = (now - startTime) / 1000;

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, w, h);

      const r = pixelSize;

      if (phase === 'assemble') {
        let revealY = 0;
        let allComplete = true;

        if (radialReveal) {
          const cx = layout.ox + layout.iw / 2;
          const cy = layout.oy + layout.ih / 2;
          const maxRadius = Math.sqrt(Math.pow(layout.iw / 2, 2) + Math.pow(layout.ih / 2, 2)) + 2;
          const revealProgress = Math.min(1, elapsed / totalDuration);
          const revealRadius = maxRadius * easeOutCubic(revealProgress);
          allComplete = revealProgress >= 1;

          if (revealRadius > 0.5 && layout) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, revealRadius, 0, 2 * Math.PI);
            ctx.clip();
            ctx.globalAlpha = 1;
            ctx.drawImage(layout.img, 0, 0, layout.img.naturalWidth, layout.img.naturalHeight,
              layout.ox, layout.oy, layout.iw, layout.ih);
            ctx.restore();
          }
        } else {
          for (let ri = 0; ri < rows.length; ri++) {
            const rowPixels = rows[ri];
            const rowDelay = ri * stagger;
            const localTime = elapsed - rowDelay;
            const rowComplete = localTime >= travelDuration;
            if (!rowComplete) allComplete = false;

            let rowBottom = 0;
            for (let pi = 0; pi < rowPixels.length; pi++) {
              rowBottom = Math.max(rowBottom, rowPixels[pi].y + r / 2);
            }

            if (rowComplete) {
              revealY = Math.max(revealY, rowBottom);
            } else {
              for (let pi = 0; pi < rowPixels.length; pi++) {
                const p = rowPixels[pi];
                let drawX = p.x, drawY = p.y;
                if (localTime < 0) continue;
                if (localTime >= travelDuration) {
                  drawX = p.x;
                  drawY = p.y;
                } else {
                  const t = localTime / travelDuration;
                  const eased = easeOutCubic(t);
                  drawY = startY + (p.y - startY) * eased;
                  drawX = p.x;
                }
                ctx.fillStyle = 'rgba(' + p.cr + ',' + p.cg + ',' + p.cb + ',' + (p.ca * particleOpacity) + ')';
                ctx.fillRect(drawX - r / 2, drawY - r / 2, r, r);
              }
            }
          }

          if (revealY > 0 && layout) {
            ctx.save();
            ctx.globalAlpha = particleOpacity;
            ctx.beginPath();
            ctx.rect(0, 0, w, revealY);
            ctx.clip();
            ctx.drawImage(layout.img, 0, 0, layout.img.naturalWidth, layout.img.naturalHeight,
              layout.ox, layout.oy, layout.iw, layout.ih);
            ctx.restore();
          }
        }

        if (allComplete) {
          if (noDissolve) {
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.drawImage(layout.img, 0, 0, layout.img.naturalWidth, layout.img.naturalHeight,
              layout.ox, layout.oy, layout.iw, layout.ih);
            ctx.restore();
            stop();
            onComplete();
            return;
          }
          phase = 'dissolve';
          dissolveStartTime = performance.now();
          loadNextImage();
        }
      } else if (phase === 'dissolve') {
        const dissolveElapsed = (now - dissolveStartTime) / 1000;
        const numRows = rows.length;
        const fadeDuration = 0.35;
        const dissolveStagger = numRows > 1 ? (dissolveDuration - fadeDuration) / Math.max(1, numRows - 1) : 0;
        const totalDissolveTime = (numRows - 1) * dissolveStagger + fadeDuration;
        const lastRowStartTime = (numRows - 1) * dissolveStagger;

        // Neues Design erst, wenn letzte Reihe mit Verschwinden begonnen hat
        const nextElapsed = Math.max(0, dissolveElapsed - lastRowStartTime);
        if (nextRows.length > 0 && nextLayout) {
          let nextRevealY = 0;
          for (var nri = 0; nri < nextRows.length; nri++) {
            var nextRowPixels = nextRows[nri];
            var nextRowDelay = nri * nextStagger;
            var nextLocalTime = nextElapsed - nextRowDelay;
            var nextRowComplete = nextLocalTime >= nextTravelDuration;

            var nextRowBottom = 0;
            for (var npi = 0; npi < nextRowPixels.length; npi++) {
              nextRowBottom = Math.max(nextRowBottom, nextRowPixels[npi].y + r / 2);
            }
            if (nextRowComplete) {
              nextRevealY = Math.max(nextRevealY, nextRowBottom);
            } else {
              for (var npi = 0; npi < nextRowPixels.length; npi++) {
                var np = nextRowPixels[npi];
                var nDrawX = np.x, nDrawY = np.y;
                if (nextLocalTime < 0) continue;
                if (nextLocalTime >= nextTravelDuration) {
                  nDrawX = np.x;
                  nDrawY = np.y;
                } else {
                  var nt = nextLocalTime / nextTravelDuration;
                  var neased = easeOutCubic(nt);
                  nDrawY = startY + (np.y - startY) * neased;
                  nDrawX = np.x;
                }
                ctx.fillStyle = 'rgba(' + np.cr + ',' + np.cg + ',' + np.cb + ',' + (np.ca * particleOpacity) + ')';
                ctx.fillRect(nDrawX - r / 2, nDrawY - r / 2, r, r);
              }
            }
          }
          if (nextRevealY > 0 && nextLayout) {
            ctx.save();
            ctx.globalAlpha = particleOpacity;
            ctx.beginPath();
            ctx.rect(0, 0, w, nextRevealY);
            ctx.clip();
            ctx.drawImage(nextLayout.img, 0, 0, nextLayout.img.naturalWidth, nextLayout.img.naturalHeight,
              nextLayout.ox, nextLayout.oy, nextLayout.iw, nextLayout.ih);
            ctx.restore();
          }
        }

        // Altes Design ausblenden
        for (var ri = 0; ri < numRows; ri++) {
          var rowPixels = rows[ri];
          var rowDelay = ri * dissolveStagger;
          var localTime = dissolveElapsed - rowDelay;

          for (var pi = 0; pi < rowPixels.length; pi++) {
            var p = rowPixels[pi];
            var drawX = p.x, drawY = p.y;
            var alpha = p.ca * particleOpacity;
            if (localTime < 0) {
              alpha = p.ca * particleOpacity;
            } else if (localTime >= fadeDuration) {
              continue;
            } else {
              var t = localTime / fadeDuration;
              var eased = easeOutCubic(t);
              alpha = p.ca * particleOpacity * (1 - eased);
            }
            ctx.fillStyle = 'rgba(' + p.cr + ',' + p.cg + ',' + p.cb + ',' + alpha + ')';
            ctx.fillRect(drawX - r / 2, drawY - r / 2, r, r);
          }
        }

        if (dissolveElapsed >= totalDissolveTime) {
          // Nächstes bereits am Einblenden? → Promote und weiter
          if (getNextUrl && nextRows.length > 0 && nextLayout) {
            rows = nextRows;
            layout = nextLayout;
            stagger = nextStagger;
            travelDuration = nextTravelDuration;
            const promotedRows = rows.length;
            totalDuration = Math.max(1.5, Math.min(5, promotedRows * 0.11));
            dissolveDuration = Math.max(0.75, Math.min(2.5, promotedRows * 0.05));
            startTime = dissolveStartTime + lastRowStartTime * 1000;
            nextRows = [];
            nextLayout = null;
            phase = 'assemble';
          } else {
            stop();
            onComplete();
            return;
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onerror = function() {
      onComplete();
    };
    image.onload = function() {
      init(image);
      if (!layout || !rows || !rows.length) {
        stop();
        onComplete();
        return;
      }
      tick._last = performance.now();
      rafId = requestAnimationFrame(tick);
    };
    image.src = imageUrl;

    return { stop: stop };
  }

  root.ParticleReveal = { run: run };
})(typeof window !== 'undefined' ? window : {});
