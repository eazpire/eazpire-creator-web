(function () {
  "use strict";

  const STYLE_ID = "eazpire-removebg-style";

  function ensureStylesInjected() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .eazpire-removebg-lock {
        pointer-events: none !important;
        user-select: none !important;
      }

      .eazpire-removebg-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(2, 6, 23, 0.95);
        backdrop-filter: blur(2px);
        z-index: 1000;
        border-radius: 12px;
      }

      .eazpire-removebg-logo {
        text-align: center;
        animation: eazpirePulse 1.1s ease-in-out infinite;
      }

      .eazpire-removebg-logo img {
        max-width: 120px;
        height: auto;
        filter: drop-shadow(0 0 20px rgba(245, 158, 11, 0.3));
      }

      @keyframes eazpirePulse {
        0% { transform: scale(0.96); opacity: 0.75; }
        50% { transform: scale(1.03); opacity: 1; }
        100% { transform: scale(0.96); opacity: 0.75; }
      }
    `;
    document.head.appendChild(style);
  }

  function lockModal(modal, locked) {
    if (!modal) return;

    if (locked) {
      // Erstelle ein globales Overlay über dem gesamten Viewport während Processing
      if (!document.getElementById('eazpire-removebg-global-overlay')) {
        const globalOverlay = document.createElement('div');
        globalOverlay.id = 'eazpire-removebg-global-overlay';
        globalOverlay.style.cssText = `
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.1);
          z-index: 99999;
          pointer-events: none;
        `;
        document.body.appendChild(globalOverlay);
      }
    } else {
      // Entferne globales Overlay
      const globalOverlay = document.getElementById('eazpire-removebg-global-overlay');
      if (globalOverlay) {
        globalOverlay.remove();
      }
    }

    modal.classList.toggle("eazpire-removebg-lock", !!locked);

    // WICHTIG: Backdrop und Close-Button während Processing blockieren!
    const backdrop = modal.querySelector('.design-upload-modal__backdrop');
    const closeBtn = modal.querySelector('.design-upload-modal__close');

    if (backdrop) {
      backdrop.style.pointerEvents = locked ? 'none' : '';
      backdrop.style.cursor = locked ? 'not-allowed' : '';
    }

    if (closeBtn) {
      closeBtn.disabled = locked;
      closeBtn.style.pointerEvents = locked ? 'none' : '';
      closeBtn.style.cursor = locked ? 'not-allowed' : '';
    }

    // Zusätzlich kritische Upload-Controls disablen
    const criticalControls = modal.querySelectorAll(
      'button:not([data-modal-close]):not(.design-upload-modal__close), ' +
      'input[type="file"], ' +
      '.design-upload-action-btn'
    );

    criticalControls.forEach((el) => {
      if (locked) {
        el.dataset._removebg_prev_disabled = el.disabled ? "1" : "0";
        if ("disabled" in el) el.disabled = true;
        el.setAttribute("aria-busy", "true");
      } else {
        const prev = el.dataset._removebg_prev_disabled;
        if ("disabled" in el && prev !== undefined) el.disabled = prev === "1";
        delete el.dataset._removebg_prev_disabled;
        el.removeAttribute("aria-busy");
      }
    });
  }

  function mountPreviewOverlay(previewPlaceholderEl) {
    ensureStylesInjected();
    if (!previewPlaceholderEl) return null;

    // placeholder muss position:relative haben, sonst overlay nicht sauber
    const computed = window.getComputedStyle(previewPlaceholderEl);
    if (computed.position === "static") {
      previewPlaceholderEl.style.position = "relative";
    }

    // Try to find the eazpire creator logo from header (same as other modals)
    const logoImg = document.querySelector('img[alt*="eazpire" i], img[src*="eazpire-creator-logo" i], .header-logo img, header img[src*="eazpire-creator" i]');
    const logoUrl = logoImg ? logoImg.src : 'https://cdn.shopify.com/s/files/1/0739/5203/5098/files/eazpire-creator-logo.png?v=1763666950';

    const overlay = document.createElement("div");
    overlay.className = "eazpire-removebg-overlay";
    overlay.innerHTML = `
      <div class="eazpire-removebg-logo">
        <img src="${logoUrl}" alt="eazpire creator" style="max-width: 120px; height: auto;">
      </div>
    `;
    previewPlaceholderEl.appendChild(overlay);
    return overlay;
  }

  async function fetchRemoveBackground({ apiBaseUrl, file, ownerId, signal }) {
    if (!apiBaseUrl) throw new Error("apiBaseUrl missing");
    if (!file) throw new Error("file missing");

    // Wir gehen über creator-dispatch (wie bei deinem Widget-Pattern mit path_prefix) :contentReference[oaicite:3]{index=3}
    const url = new URL(apiBaseUrl);
    url.searchParams.set("path_prefix", "/tools/1.0/remove-background");

    if (ownerId) url.searchParams.set("owner_id", String(ownerId));

    console.log("[remove-bg] Starting request to:", url.toString());

    const form = new FormData();
    form.append("image", file, file.name || "upload.png");
    form.append("format", "PNG");
    if (ownerId) {
      form.append("owner_id", String(ownerId));
    }

    // AbortController für bessere Kontrolle (verwende übergebenen oder erstelle neuen)
    const controller = signal ? { abort: () => signal.abort() } : new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("[remove-bg] Request timeout, aborting...");
      controller.abort();
    }, 30000); // 30 Sekunden Timeout

    try {
      const resp = await fetch(url.toString(), {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("[remove-bg] Response status:", resp.status);

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        let errorMessage = `remove-background failed (${resp.status}): ${t.slice(0, 300)}`;

        // Spezielle Behandlung für 402 (Payment Required / Insufficient EAZ)
        if (resp.status === 402) {
          try {
            const errorData = JSON.parse(t);
            if (errorData.code === 'INSUFFICIENT_EAZ') {
              if (window.EazInsufficientActions && typeof window.EazInsufficientActions.show === 'function') {
                window.EazInsufficientActions.show({ errorPayload: errorData });
              }
              errorMessage =
                'Not enough EAZG. Need ' +
                errorData.required +
                ', have ' +
                (errorData.balance_eazg != null ? errorData.balance_eazg : errorData.balance_eaz);
            }
          } catch (parseError) {
            // Fallback: behalte Original-Error
          }
        }

        throw new Error(errorMessage);
      }

      console.log("[remove-bg] Processing response...");
      const blob = await resp.blob();
      console.log("[remove-bg] Blob received, size:", blob.size);

      const outFile = new File([blob], normalizePngName(file.name), { type: "image/png" });
      console.log("[remove-bg] File created:", outFile.name, "size:", outFile.size);

      return outFile;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request was cancelled or timed out');
      }
      throw error;
    }
  }

  function normalizePngName(name) {
    const base = (name || "upload").replace(/\.[^.]+$/, "");
    return `${base}-nobg.png`;
  }

  /**
   * Hauptfunktion: lockt UI, zeigt pulsierendes Logo statt Preview,
   * ruft Backend-Proxy (Picsart removebg) und liefert neue File zurück.
   */
  async function removeBackgroundFlow({
    modal,
    previewPlaceholderEl,
    apiBaseUrl,
    file,
    ownerId,
  }) {
    let overlay = null;
    let abortController = null;

    try {
      console.log("[remove-bg] Starting flow...");
      lockModal(modal, true);
      overlay = mountPreviewOverlay(previewPlaceholderEl);

      // Globalen AbortController erstellen für diesen Flow
      abortController = new AbortController();

      // Event-Listener für Modal-Schließen hinzufügen
      const closeHandler = () => {
        console.log("[remove-bg] Modal closed, aborting request...");
        if (abortController) abortController.abort();
      };

      modal.addEventListener('modal-close', closeHandler);
      modal.addEventListener('hide', closeHandler);

      const processed = await fetchRemoveBackground({
        apiBaseUrl,
        file,
        ownerId,
        signal: abortController.signal,
      });

      // Event-Listener entfernen
      modal.removeEventListener('modal-close', closeHandler);
      modal.removeEventListener('hide', closeHandler);

      return processed;
    } catch (error) {
      console.error("[remove-bg] Flow failed:", error);
      throw error;
    } finally {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      lockModal(modal, false);
      console.log("[remove-bg] Flow completed");
    }
  }

  // export (Theme ohne Module)
  window.EazpireRemoveBackground = {
    removeBackgroundFlow,
  };
})();