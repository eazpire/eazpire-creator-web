/**
 * Shared artifact mint scene — Shockwave Forge + animated title + progress footer.
 * Used by full-page mint overlay and admin QR modal.
 */
(function () {
  "use strict";

  function titleFrames(baseTitle) {
    return [baseTitle, baseTitle + ".", baseTitle + "..", baseTitle + "..."];
  }

  var titleFrameIdx = 0;
  var titleInterval = null;

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  function phaseToLabel(phase) {
    var map = {
      mock: t("eazy_chat.artifacts_mint_status_starting", "Starting…"),
      waiting: t("eazy_chat.artifacts_mint_status_waiting", "Waiting for claim…"),
      generating: t("eazy_chat.artifacts_mint_status_generating", "Generating artwork…"),
      dissolving: t("eazy_chat.artifacts_mint_status_dissolving", "Dissolving…"),
      morphing: t("eazy_chat.artifacts_mint_status_morphing", "Morphing pixels…"),
      forging: t("eazy_chat.artifacts_mint_status_forging", "Forging artifact…"),
      ready: t("eazy_chat.artifacts_mint_status_ready", "Mint complete"),
    };
    return map[phase] || phase;
  }

  function ambientIntensity(status) {
    if (status === "generating" || status === "revealing") return 0.85;
    if (status === "pending") return 0.35;
    return 0.5;
  }

  function mount(container, opts) {
    if (!container) return null;
    opts = opts || {};
    var startImageUrl = opts.startImageUrl || opts.imageUrl || "";
    var endImageUrl = opts.endImageUrl || startImageUrl;
    var productTitle = opts.productTitle || "";
    var compact = !!opts.compact;
    var state = {
      status: opts.status || "pending",
      progress: 4,
      anim: null,
      revealStarted: false,
      revealDone: false,
      onRevealComplete: null,
    };

    container.innerHTML =
      '<div class="eaz-artifacts-mint-scene' +
      (compact ? " eaz-artifacts-mint-scene--compact" : "") +
      '">' +
      '<div class="eaz-artifacts-mint-scene__glow" aria-hidden="true"></div>' +
      '<p class="eaz-artifacts-mint-scene__title" data-mint-title>' +
      t("eazy_chat.artifacts_mint_title", "Minting Artifact") +
      "</p>" +
      (productTitle && !compact
        ? '<p class="eaz-artifacts-mint-scene__product">' + escapeHtml(productTitle) + "</p>"
        : "") +
      '<div class="eaz-artifacts-mint-scene__canvas-wrap">' +
      '<canvas class="eaz-artifacts-mint-scene__canvas" aria-hidden="true"></canvas>' +
      "</div>" +
      '<footer class="eaz-artifacts-mint-scene__footer">' +
      '<div class="eaz-artifacts-mint-scene__footer-row">' +
      '<span class="eaz-artifacts-mint-scene__status" data-mint-status>' +
      t("eazy_chat.artifacts_mint_status_starting", "Starting…") +
      "</span>" +
      '<span class="eaz-artifacts-mint-scene__pct" data-mint-pct>4%</span>' +
      "</div>" +
      '<div class="eaz-artifacts-mint-scene__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">' +
      '<div class="eaz-artifacts-mint-scene__bar-fill" data-mint-bar style="width:4%"></div>' +
      "</div>" +
      "</footer>" +
      "</div>";

    var titleEl = container.querySelector("[data-mint-title]");
    var statusEl = container.querySelector("[data-mint-status]");
    var pctEl = container.querySelector("[data-mint-pct]");
    var barEl = container.querySelector("[data-mint-bar]");
    var barRoot = container.querySelector(".eaz-artifacts-mint-scene__bar");
    var canvas = container.querySelector(".eaz-artifacts-mint-scene__canvas");

    function escapeHtml(s) {
      return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function setProgress(pct, statusLabel) {
      var p = Math.max(0, Math.min(100, Math.round(pct)));
      state.progress = p;
      if (barEl) barEl.style.width = p + "%";
      if (barRoot) barRoot.setAttribute("aria-valuenow", String(p));
      if (pctEl) pctEl.textContent = p + "%";
      if (statusLabel && statusEl) statusEl.textContent = statusLabel;
    }

    function startTitleAnim() {
      stopTitleAnim();
      if (!titleEl) return;
      var baseTitle = t("eazy_chat.artifacts_mint_title", "Minting Artifact");
      var frames = titleFrames(baseTitle);
      titleEl.textContent = baseTitle;
      titleInterval = window.setInterval(function () {
        titleFrameIdx = (titleFrameIdx + 1) % frames.length;
        titleEl.textContent = frames[titleFrameIdx];
      }, 450);
    }

    function stopTitleAnim() {
      if (titleInterval) {
        window.clearInterval(titleInterval);
        titleInterval = null;
      }
    }

    function stopAnim() {
      if (state.anim && state.anim.stop) state.anim.stop();
      state.anim = null;
    }

    function startAmbient() {
      if (!canvas || !startImageUrl) return;
      if (!window.ArtifactMintShockwave) {
        window.setTimeout(startAmbient, 120);
        return;
      }
      stopAnim();
      state.anim = window.ArtifactMintShockwave.run(canvas, startImageUrl, endImageUrl || startImageUrl, {
        mode: "ambient",
        compact: compact,
        intensity: ambientIntensity(state.status),
        onProgress: function (pct) {
          if (state.status === "revealing" || state.status === "ready" || state.status === "failed") return;
          setProgress(Math.max(state.progress, pct));
        },
        onPhaseChange: function (phase) {
          if (state.status === "revealing" || state.status === "ready" || state.status === "failed") return;
          setProgress(state.progress, phaseToLabel(phase));
        },
      });
    }

    function startReveal(endUrl, onComplete, attempts) {
      if (attempts === void 0) attempts = 0;
      if (!canvas || !startImageUrl || !endUrl) {
        if (typeof onComplete === "function") onComplete();
        return;
      }
      if (!window.ArtifactMintShockwave) {
        if (attempts > 80) {
          if (typeof onComplete === "function") onComplete();
          return;
        }
        window.setTimeout(function () {
          startReveal(endUrl, onComplete, attempts + 1);
        }, 120);
        return;
      }
      if (state.revealStarted) return;
      state.revealStarted = true;
      state.status = "revealing";
      container.classList.remove("is-ready", "is-failed");
      setProgress(Math.max(state.progress, 12), phaseToLabel("dissolving"));

      stopAnim();
      state.anim = window.ArtifactMintShockwave.run(canvas, startImageUrl, endUrl, {
        mode: "reveal",
        compact: compact,
        duration: compact ? 10000 : 15000,
        onProgress: function (pct) {
          setProgress(pct);
        },
        onPhaseChange: function (phase) {
          setProgress(state.progress, phaseToLabel(phase));
        },
        onComplete: function () {
          state.revealDone = true;
          if (typeof onComplete === "function") onComplete();
          else finishReady();
        },
      });
    }

    function finishReady(label) {
      stopTitleAnim();
      state.status = "ready";
      if (state.anim && state.anim.holdFinal) state.anim.holdFinal();
      if (titleEl) titleEl.textContent = t("eazy_chat.artifacts_mint_title_ready", "Artifact Ready");
      setProgress(100, label || t("eazy_chat.artifacts_mint_status_ready", "Mint complete"));
      container.classList.add("is-ready");
      container.classList.remove("is-failed");
      if (typeof opts.onStatus === "function") opts.onStatus("ready");
    }

    function resolveArtworkUrl(label) {
      if (label && typeof label === "object" && label.artworkUrl) return String(label.artworkUrl);
      return "";
    }

    function resizeCanvas() {
      if (state.anim && state.anim.resize) state.anim.resize();
    }

    function setStatus(nextStatus, label) {
      state.status = nextStatus || state.status;
      var statusLabel = typeof label === "string" ? label : "";
      var artworkUrl = resolveArtworkUrl(label);

      if (nextStatus === "ready") {
        if (artworkUrl) endImageUrl = artworkUrl;
        if (state.revealDone) {
          finishReady(statusLabel);
          return;
        }
        if (!state.revealStarted && endImageUrl && endImageUrl !== startImageUrl) {
          beginReveal(endImageUrl, function () {
            finishReady(statusLabel);
          });
          return;
        }
        if (!state.revealStarted && endImageUrl) {
          beginReveal(endImageUrl, function () {
            finishReady(statusLabel);
          });
          return;
        }
        finishReady(statusLabel);
      } else if (nextStatus === "failed") {
        stopTitleAnim();
        stopAnim();
        if (titleEl) titleEl.textContent = t("eazy_chat.artifacts_generation_failed", "Failed");
        setProgress(
          state.progress,
          statusLabel || t("eazy_chat.artifacts_mint_status_failed", "Generation failed")
        );
        container.classList.add("is-failed");
        container.classList.remove("is-ready");
      } else if (nextStatus === "generating") {
        setProgress(
          Math.max(state.progress, 22),
          statusLabel || t("eazy_chat.artifacts_mint_status_generating", "Generating artwork…")
        );
        container.classList.remove("is-ready", "is-failed");
        state.revealStarted = false;
        state.revealDone = false;
        if (state.anim && state.anim.setMode) {
          state.anim.setMode("ambient", { intensity: ambientIntensity("generating") });
        } else {
          startAmbient();
        }
      } else if (nextStatus === "pending") {
        setProgress(
          Math.max(state.progress, 8),
          statusLabel || t("eazy_chat.artifacts_mint_status_waiting", "Waiting for claim…")
        );
        if (state.anim && state.anim.setMode) {
          state.anim.setMode("ambient", { intensity: ambientIntensity("pending") });
        } else {
          startAmbient();
        }
      } else if (statusLabel) {
        setProgress(state.progress, statusLabel);
      }

      if (typeof opts.onStatus === "function") opts.onStatus(state.status);
    }

    function beginReveal(url, onComplete) {
      endImageUrl = url || endImageUrl;
      if (!endImageUrl || state.revealStarted) return;
      startReveal(endImageUrl, onComplete);
    }

    startTitleAnim();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        resizeCanvas();
        startAmbient();
      });
    });

    var ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(function () {
            resizeCanvas();
          })
        : null;
    if (ro && canvas && canvas.parentElement) ro.observe(canvas.parentElement);

    function destroy() {
      stopTitleAnim();
      stopAnim();
      if (ro) ro.disconnect();
      container.innerHTML = "";
    }

    return {
      setStatus: setStatus,
      beginReveal: beginReveal,
      setEndImageUrl: function (url) {
        endImageUrl = url || endImageUrl;
      },
      setImageUrl: function (url) {
        startImageUrl = url || startImageUrl;
        startAmbient();
      },
      destroy: destroy,
      getState: function () {
        return state.status;
      },
      hasRevealStarted: function () {
        return state.revealStarted;
      },
    };
  }

  window.EazArtifactsMintScene = { mount: mount };
})();
