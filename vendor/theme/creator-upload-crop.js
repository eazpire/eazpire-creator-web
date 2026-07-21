/**
 * Crop-Image Flow für Upload-Modal (My Creations).
 * Primär: Client-side Auto-Crop (Canvas, Alpha-Bounds) — robust für alle Browser-PNG-Typen.
 * Fallback: Backend /tools/1.0/crop-image bzw. op=crop-image.
 */
(function () {
  "use strict";

  const OVERLAY_ID = "eazpire-crop-overlay";
  /** Match worker cropPNG defaults (saveDesign / cropImage tool). */
  const AUTO_CROP_BORDER = 10;
  const AUTO_CROP_ALPHA_THRESHOLD = 5;

  function lockModal(modal, locked) {
    if (!modal) return;
    modal.classList.toggle("eazpire-removebg-lock", !!locked);
    const backdrop = modal.querySelector(".design-upload-modal__backdrop");
    const closeBtn = modal.querySelector(".design-upload-modal__close");
    if (backdrop) {
      backdrop.style.pointerEvents = locked ? "none" : "";
      backdrop.style.cursor = locked ? "not-allowed" : "";
    }
    if (closeBtn) {
      closeBtn.disabled = locked;
      closeBtn.style.pointerEvents = locked ? "none" : "";
      closeBtn.style.cursor = locked ? "not-allowed" : "";
    }
    const btns = modal.querySelectorAll(".design-upload-action-btn, .design-upload-modal__button");
    btns.forEach(function (el) {
      if (locked) {
        el.dataset._crop_prev_disabled = el.disabled ? "1" : "0";
        el.disabled = true;
      } else {
        var prev = el.dataset._crop_prev_disabled;
        if (prev !== undefined) el.disabled = prev === "1";
        delete el.dataset._crop_prev_disabled;
      }
    });
  }

  function mountOverlay(previewPlaceholderEl) {
    if (!previewPlaceholderEl) return null;
    var computed = window.getComputedStyle(previewPlaceholderEl);
    if (computed.position === "static") previewPlaceholderEl.style.position = "relative";
    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText =
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(2,6,23,0.95);backdrop-filter:blur(2px);z-index:1000;border-radius:12px;";
    overlay.innerHTML =
      '<div style="color:#f97316;font-size:1rem;font-weight:600;">Zuschneiden …</div>';
    previewPlaceholderEl.appendChild(overlay);
    return overlay;
  }

  function normalizePngName(name) {
    var base = (name || "upload").replace(/\.[^.]+$/, "");
    return base + "-cropped.png";
  }

  function fetchSignal(signalOrController) {
    if (!signalOrController) return undefined;
    return signalOrController.signal ? signalOrController.signal : signalOrController;
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("image_load_failed"));
      };
      img.src = url;
    });
  }

  function canvasToPngFile(canvas, fileName) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("crop_encode_failed"));
          return;
        }
        resolve(new File([blob], normalizePngName(fileName), { type: "image/png" }));
      }, "image/png");
    });
  }

  /**
   * Auto-crop to visible content (alpha >= threshold) with padding.
   * Same semantics as worker cropPNG(border=10, alphaThreshold=5).
   */
  async function autoCropFileClient(file, border, alphaThreshold) {
    if (!file) throw new Error("file missing");
    border = border == null ? AUTO_CROP_BORDER : border;
    alphaThreshold = alphaThreshold == null ? AUTO_CROP_ALPHA_THRESHOLD : alphaThreshold;

    var img = await loadImageFromFile(file);
    var w = img.naturalWidth || img.width || 0;
    var h = img.naturalHeight || img.height || 0;
    if (w <= 0 || h <= 0) throw new Error("image_dimensions_invalid");

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(img, 0, 0);

    var data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      throw new Error("crop_read_pixels_failed");
    }

    var minX = w;
    var minY = h;
    var maxX = 0;
    var maxY = 0;
    var found = false;
    var x;
    var y;
    var a;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        a = data[(y * w + x) * 4 + 3];
        if (a >= alphaThreshold) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!found) {
      throw new Error("Kein sichtbarer Inhalt zum Zuschneiden gefunden.");
    }

    minX = Math.max(0, minX - border);
    minY = Math.max(0, minY - border);
    maxX = Math.min(w - 1, maxX + border);
    maxY = Math.min(h - 1, maxY + border);

    var cw = maxX - minX + 1;
    var ch = maxY - minY + 1;

    // Already tight to full canvas — nothing meaningful to crop.
    if (minX === 0 && minY === 0 && maxX === w - 1 && maxY === h - 1) {
      if (file.type && String(file.type).toLowerCase().indexOf("png") !== -1) {
        return file;
      }
      return canvasToPngFile(canvas, file.name);
    }

    var out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    var octx = out.getContext("2d");
    if (!octx) throw new Error("canvas_unavailable");
    octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return canvasToPngFile(out, file.name);
  }

  function looksLikePng(blob) {
    return blob.slice(0, 8).arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf);
      return (
        u8.length >= 8 &&
        u8[0] === 0x89 &&
        u8[1] === 0x50 &&
        u8[2] === 0x4e &&
        u8[3] === 0x47 &&
        u8[4] === 0x0d &&
        u8[5] === 0x0a &&
        u8[6] === 0x1a &&
        u8[7] === 0x0a
      );
    }).catch(function () {
      return false;
    });
  }

  function doOneCropFetch(cropUrl, file, ownerId, signal) {
    var form = new FormData();
    form.append("image", file, file.name || "upload.png");
    if (ownerId) form.append("owner_id", String(ownerId));
    return fetch(cropUrl, {
      method: "POST",
      body: form,
      signal: fetchSignal(signal),
    });
  }

  async function parseCropResponse(resp, file) {
    var blob = await resp.blob();
    if (!resp.ok) {
      var t = await blob.text().catch(function () { return ""; });
      var msg = "Zuschneiden fehlgeschlagen (" + resp.status + ")";
      try {
        var data = JSON.parse(t);
        if (data.error) msg = data.error;
      } catch (e) {}
      throw new Error(msg);
    }
    var ct = (resp.headers.get("content-type") || "").toLowerCase();
    var isJson = ct.indexOf("application/json") !== -1;
    var isPng = await looksLikePng(blob);
    if (isJson || !isPng) {
      var t2 = "";
      if (!isPng) {
        t2 = await blob.text().catch(function () { return ""; });
      }
      var msg2 = (window.CreatorI18n && window.CreatorI18n.invalidServerResponse) ||
        "Invalid server response (no image).";
      try {
        var data2 = JSON.parse(t2);
        if (data2.error) msg2 = data2.error;
      } catch (e2) {}
      throw new Error(msg2);
    }
    return new File([blob], normalizePngName(file.name), { type: "image/png" });
  }

  function resolveCropUrls(apiBaseUrl, ownerId) {
    var urls = [];
    var ownerQ = ownerId ? String(ownerId) : "";

    // Prefer same-origin dispatch tunnel on eazpire.com (avoids CORS / third-party blocks).
    try {
      if (window.CREATOR_API_CONFIG && typeof window.CREATOR_API_CONFIG.getDispatchUrl === "function") {
        var dispatch = window.CREATOR_API_CONFIG.getDispatchUrl();
        if (dispatch) {
          var du = new URL(dispatch, window.location.origin);
          du.searchParams.set("op", "crop-image");
          if (ownerQ) du.searchParams.set("owner_id", ownerQ);
          urls.push(du.toString());
        }
      }
    } catch (e) {}

    var base = String(apiBaseUrl || "").replace(/\/?$/, "").split("?")[0];
    if (base) {
      try {
        // Same pattern as remove-background: path_prefix tool route on API base.
        var pathPrefixUrl = new URL(base, window.location.origin);
        pathPrefixUrl.searchParams.set("path_prefix", "/tools/1.0/crop-image");
        if (ownerQ) pathPrefixUrl.searchParams.set("owner_id", ownerQ);
        urls.push(pathPrefixUrl.toString());
      } catch (e2) {}

      try {
        var dispatchBase =
          base.indexOf("/apps/creator-dispatch") !== -1 ? base : base + "/apps/creator-dispatch";
        var dispatchUrl = new URL(dispatchBase, window.location.origin);
        dispatchUrl.searchParams.set("op", "crop-image");
        if (ownerQ) dispatchUrl.searchParams.set("owner_id", ownerQ);
        urls.push(dispatchUrl.toString());
      } catch (e3) {}
    }

    // Dedupe while preserving order
    var seen = Object.create(null);
    return urls.filter(function (u) {
      if (!u || seen[u]) return false;
      seen[u] = true;
      return true;
    });
  }

  async function fetchCropImage(apiBaseUrl, file, ownerId, signal) {
    if (!file) throw new Error("file missing");

    var urls = resolveCropUrls(apiBaseUrl, ownerId);
    if (!urls.length) throw new Error("apiBaseUrl missing");

    var lastErr = null;
    var i;
    for (i = 0; i < urls.length; i++) {
      try {
        var resp = await doOneCropFetch(urls[i], file, ownerId, signal);
        return await parseCropResponse(resp, file);
      } catch (err) {
        lastErr = err;
        var retryable =
          err &&
          (err.name === "TypeError" ||
            err.message === "Failed to fetch" ||
            (err.message && String(err.message).indexOf("Zuschneiden fehlgeschlagen (5") === 0));
        if (!retryable || i === urls.length - 1) throw err;
        console.warn("[crop-image] endpoint failed, trying next:", urls[i], err && err.message);
      }
    }
    throw lastErr || new Error("Zuschneiden fehlgeschlagen");
  }

  /**
   * Flow: Modal locken, Overlay, client auto-crop (preferred), server fallback.
   */
  async function cropImageFlow(options) {
    var modal = options.modal;
    var previewPlaceholderEl = options.previewPlaceholderEl;
    var apiBaseUrl = options.apiBaseUrl;
    var file = options.file;
    var ownerId = options.ownerId;
    var overlay = null;

    try {
      lockModal(modal, true);
      overlay = mountOverlay(previewPlaceholderEl);

      try {
        var clientCropped = await autoCropFileClient(file, AUTO_CROP_BORDER, AUTO_CROP_ALPHA_THRESHOLD);
        return clientCropped;
      } catch (clientErr) {
        console.warn("[crop-image] client auto-crop failed, falling back to API:", clientErr);
        var abortController = new AbortController();
        var processed = await fetchCropImage(apiBaseUrl, file, ownerId, abortController.signal);
        return processed;
      }
    } catch (err) {
      console.error("[crop-image] Flow failed:", err);
      throw err;
    } finally {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      lockModal(modal, false);
    }
  }

  window.EazpireCropImage = {
    cropImageFlow: cropImageFlow,
    autoCropFileClient: autoCropFileClient,
  };
})();
