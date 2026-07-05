/**
 * Crop-Image Flow für Upload-Modal (My Creations).
 * Ruft Backend /tools/1.0/crop-image auf, liefert gecropptes PNG als File zurück.
 * Ablauf wie bei Hintergrund entfernen: Modal locken, Overlay, Request, neu rendern.
 */
(function () {
  "use strict";

  const OVERLAY_ID = "eazpire-crop-overlay";

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

  function doOneCropFetch(cropUrl, file, ownerId, signal) {
    var form = new FormData();
    form.append("image", file, file.name || "upload.png");
    if (ownerId) form.append("owner_id", String(ownerId));
    return fetch(cropUrl, {
      method: "POST",
      body: form,
      signal: signal && signal.signal ? signal.signal : signal,
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
    if (ct.indexOf("application/json") !== -1 || blob.size < 200) {
      var t = await blob.text().catch(function () { return ""; });
      var msg = (window.CreatorI18n?.invalidServerResponse || "Invalid server response (no image).");
      try {
        var data = JSON.parse(t);
        if (data.error) msg = data.error;
      } catch (e) {}
      throw new Error(msg);
    }
    return new File([blob], normalizePngName(file.name), { type: "image/png" });
  }

  async function fetchCropImage(apiBaseUrl, file, ownerId, signal) {
    if (!apiBaseUrl) throw new Error("apiBaseUrl missing");
    if (!file) throw new Error("file missing");

    var base = String(apiBaseUrl).replace(/\/?$/, "").split("?")[0];
    var pathPrefixUrl = new URL(base, window.location.origin);
    pathPrefixUrl.searchParams.set("path_prefix", "/tools/1.0/crop-image");
    if (ownerId) pathPrefixUrl.searchParams.set("owner_id", String(ownerId));

    var controller = signal || new AbortController();
    var resp;

    try {
      resp = await doOneCropFetch(pathPrefixUrl.toString(), file, ownerId, controller);
    } catch (err) {
      if (err && (err.name === "TypeError" || err.message === "Failed to fetch")) {
        var dispatchBase = base.indexOf("/apps/creator-dispatch") !== -1 ? base : base + "/apps/creator-dispatch";
        var dispatchUrl = new URL(dispatchBase, window.location.origin);
        dispatchUrl.searchParams.set("op", "crop-image");
        if (ownerId) dispatchUrl.searchParams.set("owner_id", String(ownerId));
        resp = await doOneCropFetch(dispatchUrl.toString(), file, ownerId, controller);
      } else {
        throw err;
      }
    }

    return parseCropResponse(resp, file);
  }

  /**
   * Flow: Modal locken, Overlay anzeigen, Crop-API aufrufen, gecropptes File zurückgeben.
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

      var abortController = new AbortController();
      var processed = await fetchCropImage(apiBaseUrl, file, ownerId, abortController.signal);
      return processed;
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
  };
})();
