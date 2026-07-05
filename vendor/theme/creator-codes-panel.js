/**
 * Creator Codes Panel
 * Redeem, daily generate, sale/purchase reveal, QR scan, gift flow.
 */
(function () {
  "use strict";

  const API_BASE = "/apps/creator-dispatch";
  let _initialized = false;
  let _ownerId = null;
  let _state = {};
  let _selectedRecipient = null;
  let _recipientSearchTimer = null;
  let _qrStream = null;
  let _qrDetectTimer = null;

  function ownerId() {
    if (_ownerId) return _ownerId;
    _ownerId = window.__EAZ_OWNER_ID || null;
    return _ownerId;
  }

  function t(key, fallback) {
    var parts = key.split(".");
    var node = window.CreatorI18n;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== "object") return fallback;
      node = node[parts[i]];
    }
    return node || fallback;
  }

  function api(op, params) {
    const sp = new URLSearchParams({ op, owner_id: ownerId(), ...params });
    return fetch(`${API_BASE}?${sp}`, { credentials: "same-origin" }).then((r) =>
      r.json()
    );
  }

  function apiPost(op, body) {
    const sp = new URLSearchParams({ op, owner_id: ownerId() });
    return fetch(`${API_BASE}?${sp}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  }

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function show(el) {
    if (el) el.style.display = "";
  }
  function hide(el) {
    if (el) el.style.display = "none";
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (!btn) return;
      btn.classList.add("is-copied");
      var span = btn.querySelector("span");
      var prev = span ? span.textContent : "";
      if (span) span.textContent = "Copied!";
      setTimeout(() => {
        btn.classList.remove("is-copied");
        if (span) span.textContent = prev;
      }, 2000);
    });
  }

  function stopQrScanner(root) {
    if (_qrDetectTimer) {
      clearInterval(_qrDetectTimer);
      _qrDetectTimer = null;
    }
    if (_qrStream) {
      _qrStream.getTracks().forEach(function (t) {
        t.stop();
      });
      _qrStream = null;
    }
    var scanner = $("[data-cc-qr-scanner]", root);
    if (scanner) scanner.hidden = true;
  }

  function parseQrToken(raw) {
    var s = String(raw || "").trim();
    if (!s) return null;
    try {
      if (s.indexOf("eazpire://") === 0) {
        var u = new URL(s.replace("eazpire://", "https://eazpire.local/"));
        return u.searchParams.get("t");
      }
      var u2 = new URL(s);
      return u2.searchParams.get("t");
    } catch (e) {
      var m = s.match(/[?&]t=([A-Za-z0-9_-]+)/);
      return m ? m[1] : null;
    }
  }

  async function claimQrToken(root, token) {
    var msgEl = $("[data-cc-qr-message]", root);
    try {
      var result = await apiPost("claim-purchase-via-qr", {
        qr_token: token,
        payload: token,
      });
      if (result.ok) {
        if (msgEl) {
          show(msgEl);
          msgEl.className = "cc-message is-success";
          msgEl.textContent = t("settings.creator_codes_qr_success", "QR verified! You can now reveal your code.");
        }
        stopQrScanner(root);
        await init();
      } else if (msgEl) {
        show(msgEl);
        msgEl.className = "cc-message is-error";
        msgEl.textContent = result.error || "QR verification failed";
      }
    } catch (e) {
      if (msgEl) {
        show(msgEl);
        msgEl.className = "cc-message is-error";
        msgEl.textContent = "Connection error";
      }
    }
  }

  async function startQrScanner(root) {
    stopQrScanner(root);
    var scanner = $("[data-cc-qr-scanner]", root);
    var video = $("[data-cc-qr-video]", root);
    if (!scanner || !video) return;

    if (!window.isSecureContext || !navigator.mediaDevices) {
      alert("Camera requires HTTPS or use Upload QR image.");
      return;
    }

    var Detector = window.BarcodeDetector;
    if (!Detector) {
      alert("QR scanning not supported in this browser. Upload a QR image instead.");
      return;
    }

    scanner.hidden = false;
    try {
      _qrStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      video.srcObject = _qrStream;
      await video.play();
    } catch (e) {
      stopQrScanner(root);
      alert("Camera permission denied.");
      return;
    }

    var detector = new Detector({ formats: ["qr_code"] });
    _qrDetectTimer = setInterval(async function () {
      if (!video || video.readyState < 2) return;
      try {
        var codes = await detector.detect(video);
        for (var i = 0; i < codes.length; i++) {
          var token = parseQrToken(codes[i].rawValue);
          if (token) {
            await claimQrToken(root, token);
            return;
          }
        }
      } catch (_) {}
    }, 500);
  }

  async function decodeQrFromFile(file, root) {
    var Detector = window.BarcodeDetector;
    if (!Detector) {
      alert("QR upload not supported in this browser.");
      return;
    }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = async function () {
      try {
        var detector = new Detector({ formats: ["qr_code"] });
        var codes = await detector.detect(img);
        URL.revokeObjectURL(url);
        for (var i = 0; i < codes.length; i++) {
          var token = parseQrToken(codes[i].rawValue);
          if (token) {
            await claimQrToken(root, token);
            return;
          }
        }
        alert("No Creator Code QR found in image.");
      } catch (e) {
        URL.revokeObjectURL(url);
        alert("Could not read QR from image.");
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      alert("Invalid image.");
    };
    img.src = url;
  }

  function tpl(str, vars) {
    if (!str) return "";
    return String(str).replace(/\{\{(\w+)\}\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "";
    });
  }

  function textFromDataT(key, fallback) {
    var el = document.querySelector('[data-t="creator.settings.' + key + '"]');
    return el && el.textContent ? el.textContent.trim() : fallback;
  }

  function ensureRedeemCelebrationOverlay() {
    var overlay = document.getElementById("ccRedeemCelebration");
    if (!overlay) return null;
    if (overlay.parentElement !== document.body) {
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function levelNameFromData(levelData, lvl) {
    var labels = (levelData && levelData.level_labels) || {};
    var name = labels[String(lvl)];
    return name || "Level " + lvl;
  }

  function eazBenefitsForLevel(levelData) {
    var lvl = Number(levelData && levelData.current_level) || 2;
    var benefits = (levelData && levelData.benefits) || {};
    var daily = Number(benefits.daily_eaz);
    var max = Number(benefits.max_eaz);
    if ((!daily && !max) && levelData && levelData.level_eaz_by_level) {
      var row = levelData.level_eaz_by_level.find(function (x) {
        return Number(x.level) === lvl;
      });
      if (row) {
        daily = Number(row.daily_eaz) || 0;
        max = Number(row.max_eaz) || 0;
      }
    }
    return { daily: daily || 0, max: max || 0 };
  }

  var FEATURE_ICONS = {
    tools: "M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z",
    names: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    eaz: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.71.35 2.65 1.48 2.78 3.06h-1.98c-.12-.88-.55-1.46-2.05-1.46-1.54 0-2.05.75-2.05 1.43 0 .73.47 1.41 2.66 1.93 2.49.6 4.19 1.62 4.19 3.78 0 1.83-1.39 2.96-3.19 3.32z",
    packs: "M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    marketing: "M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
    community: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    codes: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  };

  function buildRedeemFeatures(levelData) {
    var eaz = eazBenefitsForLevel(levelData);
    var eazTpl = textFromDataT(
      "creator_codes_redeem_feature_eaz",
      "Daily {{daily}} EAZ · Max {{max}} EAZ"
    );
    return [
      {
        icon: FEATURE_ICONS.tools,
        text: textFromDataT(
          "creator_codes_redeem_feature_tools",
          "Access to all Creator tools"
        ),
      },
      {
        icon: FEATURE_ICONS.names,
        text: textFromDataT(
          "creator_codes_redeem_feature_names",
          "Creator names & author profile"
        ),
      },
      {
        icon: FEATURE_ICONS.eaz,
        text: tpl(eazTpl, { daily: eaz.daily, max: eaz.max }),
      },
      {
        icon: FEATURE_ICONS.packs,
        text: textFromDataT(
          "creator_codes_redeem_feature_eaz_packs",
          "Buy EAZ packs anytime"
        ),
      },
      {
        icon: FEATURE_ICONS.marketing,
        text: textFromDataT(
          "creator_codes_redeem_feature_marketing",
          "Marketing tools & automations"
        ),
      },
      {
        icon: FEATURE_ICONS.community,
        text: textFromDataT(
          "creator_codes_redeem_feature_community",
          "Creator community & codes"
        ),
      },
    ];
  }

  function spawnCelebrationParticles(container) {
    if (!container) return;
    container.innerHTML = "";
    for (var i = 0; i < 36; i++) {
      var p = document.createElement("div");
      p.className = "cc-redeem-celebration__spark";
      var angle = Math.random() * Math.PI * 2;
      var dist = 60 + Math.random() * 180;
      p.style.left = 50 + (Math.random() - 0.5) * 20 + "%";
      p.style.top = 40 + (Math.random() - 0.5) * 20 + "%";
      p.style.setProperty("--tx", Math.cos(angle) * dist + "px");
      p.style.setProperty("--ty", Math.sin(angle) * dist + "px");
      p.style.animationDelay = Math.random() * 0.5 + "s";
      container.appendChild(p);
    }
  }

  function playRedeemCelebration(levelData) {
    var overlay = ensureRedeemCelebrationOverlay();
    if (!overlay) return Promise.resolve();

    var stepFeatures = $('[data-cc-redeem-step="features"]', overlay);
    var stepLevel = $('[data-cc-redeem-step="level"]', overlay);
    var featuresEl = $("[data-cc-redeem-features]", overlay);
    var particlesEl = $("[data-cc-redeem-particles]", overlay);
    var btnFeatures = $("[data-cc-redeem-features-continue]", overlay);
    var btnLevel = $("[data-cc-redeem-level-continue]", overlay);
    var oldEl = $("[data-cc-redeem-level-old]", overlay);
    var newEl = $("[data-cc-redeem-level-new]", overlay);
    var nameEl = $("[data-cc-redeem-level-name]", overlay);

    var toLevel = Math.max(2, Number(levelData && levelData.current_level) || 2);
    var fromLevel = 1;
    var levelName = levelNameFromData(levelData, toLevel);

    if (featuresEl) {
      featuresEl.innerHTML = buildRedeemFeatures(levelData)
        .map(function (item) {
          return (
            '<li class="cc-redeem-celebration__feature">' +
            '<span class="cc-redeem-celebration__feature-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24"><path d="' +
            item.icon +
            '"/></svg></span>' +
            '<span class="cc-redeem-celebration__feature-text">' +
            item.text +
            "</span></li>"
          );
        })
        .join("");
    }

    if (oldEl) oldEl.textContent = String(fromLevel);
    if (newEl) newEl.textContent = String(toLevel);
    if (nameEl) nameEl.textContent = levelName;

    show(stepFeatures);
    hide(stepLevel);
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    spawnCelebrationParticles(particlesEl);
    try {
      document.body.style.overflow = "hidden";
    } catch (_) {}

    return new Promise(function (resolve) {
      function finish() {
        overlay.hidden = true;
        overlay.setAttribute("aria-hidden", "true");
        hide(stepFeatures);
        hide(stepLevel);
        if (particlesEl) particlesEl.innerHTML = "";
        try {
          document.body.style.overflow = "";
        } catch (_) {}
        resolve();
      }

      function goLevelStep() {
        hide(stepFeatures);
        show(stepLevel);
        spawnCelebrationParticles(particlesEl);
        if (stepLevel) {
          stepLevel.style.animation = "none";
          void stepLevel.offsetWidth;
          stepLevel.style.animation = "";
        }
      }

      function onFeaturesContinue() {
        btnFeatures.removeEventListener("click", onFeaturesContinue);
        goLevelStep();
        btnLevel.addEventListener("click", onLevelContinue);
      }

      function onLevelContinue() {
        btnLevel.removeEventListener("click", onLevelContinue);
        finish();
      }

      btnFeatures.addEventListener("click", onFeaturesContinue);
    });
  }

  function afterRedeemSuccess(levelData, redeemResult) {
    if (window.CreatorLevelCelebration) {
      if (typeof window.CreatorLevelCelebration.setAck === "function") {
        window.CreatorLevelCelebration.setAck(levelData.current_level || 2);
      }
      if (typeof window.CreatorLevelCelebration.syncFromApi === "function") {
        window.CreatorLevelCelebration.syncFromApi(levelData, {
          levelName: levelNameFromData(levelData, levelData.current_level),
        });
      }
    }
    document.dispatchEvent(
      new CustomEvent("eaz:creator-redeemed", {
        detail: Object.assign({}, levelData || {}, redeemResult || {}),
      })
    );
    document.dispatchEvent(
      new CustomEvent("eaz:creator-code-state", {
        detail: { is_creator: true, has_pending_entitlement: false },
      })
    );
    if (window.EazCreatorCodeAvailableHint && typeof window.EazCreatorCodeAvailableHint.setActive === "function") {
      window.EazCreatorCodeAvailableHint.setActive(false);
    }
    setTimeout(function () {
      if (window.CreatorSettingsV2Modal && typeof window.CreatorSettingsV2Modal.open === "function") {
        window.CreatorSettingsV2Modal.open({ tab: "creator-names" });
      }
    }, 400);
  }

  function playRevealAnimation(root, code) {
    var overlay = $("[data-cc-reveal-overlay]", root);
    if (!overlay) return Promise.resolve();

    show(overlay);
    var codeEl = $("[data-cc-reveal-code]", overlay);
    var particlesEl = $("[data-cc-particles]", overlay);

    if (particlesEl) {
      particlesEl.innerHTML = "";
      for (var i = 0; i < 30; i++) {
        var p = document.createElement("div");
        p.className = "cc-particle";
        var angle = Math.random() * Math.PI * 2;
        var dist = 80 + Math.random() * 120;
        p.style.setProperty("--tx", Math.cos(angle) * dist + "px");
        p.style.setProperty("--ty", Math.sin(angle) * dist + "px");
        p.style.left = "50%";
        p.style.top = "50%";
        p.style.animationDelay = 0.8 + Math.random() * 0.4 + "s";
        particlesEl.appendChild(p);
      }
    }

    if (codeEl) {
      codeEl.textContent = "";
      codeEl.style.opacity = "1";
      codeEl.style.animation = "none";
      var letters = code.split("");
      var idx = 0;
      function typeLetter() {
        if (idx < letters.length) {
          codeEl.textContent += letters[idx];
          idx++;
          setTimeout(typeLetter, 60);
        }
      }
      setTimeout(typeLetter, 1200);
    }

    return new Promise(function (resolve) {
      function closeReveal() {
        overlay.removeEventListener("click", closeReveal);
        hide(overlay);
        if (codeEl) {
          codeEl.style.animation = "";
          codeEl.style.opacity = "";
        }
        if (particlesEl) particlesEl.innerHTML = "";
        resolve();
      }
      setTimeout(function () {
        overlay.addEventListener("click", closeReveal);
      }, 2400);
      setTimeout(closeReveal, 5000);
    });
  }

  async function revealEntitlement(root, entitlementId) {
    var result = await apiPost("reveal-creator-code", { entitlement_id: entitlementId });
    if (result.ok && result.code) {
      await playRevealAnimation(root, result.code);
      await init();
    } else {
      alert(result.message || result.error || "Could not reveal code.");
    }
  }

  function renderCreatorState(root, data) {
    _state = data || {};
    var section = $("[data-cc-creator-section]", root);
    show(section);

    var dot = $("[data-cc-dot]");
    if (data.has_pending_entitlement && dot) show(dot);
    else if (dot) hide(dot);

    // Pending sale
    var pendingSale = $("[data-cc-pending-sale]", root);
    if (data.pending_sale) {
      show(pendingSale);
    } else {
      hide(pendingSale);
    }

    // Pending purchase
    var pendingPurchase = $("[data-cc-pending-purchase]", root);
    var qrHint = $("[data-cc-purchase-qr-hint]", root);
    var qrActions = $("[data-cc-qr-actions]", root);
    var revealPurchaseBtn = $("[data-cc-reveal-purchase-btn]", root);
    if (data.pending_purchase) {
      show(pendingPurchase);
      var pp = data.pending_purchase;
      if (pp.requires_qr && !pp.qr_verified) {
        show(qrHint);
        show(qrActions);
        hide(revealPurchaseBtn);
      } else {
        hide(qrHint);
        hide(qrActions);
        show(revealPurchaseBtn);
      }
    } else {
      hide(pendingPurchase);
      stopQrScanner(root);
    }

    // Generate daily
    var genSection = $("[data-cc-generate-section]", root);
    var genBtn = $("[data-cc-generate-btn]", root);
    if (data.can_generate) {
      show(genSection);
      if (genBtn) genBtn.classList.add("is-pulsing");
    } else {
      hide(genSection);
      if (genBtn) genBtn.classList.remove("is-pulsing");
    }

    // Active code
    var activeSection = $("[data-cc-active-code]", root);
    var sendUserBtn = $("[data-cc-send-user-btn]", root);
    var poolBtn = $("[data-cc-pool-btn]", root);
    if (data.active_code && data.active_code.code) {
      show(activeSection);
      var codeDisplay = $("[data-cc-code-display]", root);
      if (codeDisplay) codeDisplay.textContent = data.active_code.code;

      var canShare = data.active_code.can_share !== false;
      if (sendUserBtn) canShare ? show(sendUserBtn) : hide(sendUserBtn);
      if (poolBtn) canShare ? show(poolBtn) : hide(poolBtn);

      var refLink = $("[data-cc-ref-link]", root);
      if (refLink && data.ref_url) {
        refLink.value = data.ref_url;
        if (window.ShareButtonResolveShareUrl && typeof window.ShareButtonResolveShareUrl === "function") {
          window.ShareButtonResolveShareUrl(data.ref_url).then(function (url) {
            if (url) refLink.value = url;
          }).catch(function () {});
        }
      }
    } else {
      hide(activeSection);
      if (sendUserBtn) hide(sendUserBtn);
      if (poolBtn) hide(poolBtn);
    }

    if (data.is_creator) {
      loadStats(root);
      loadHistory(root);
      loadCommunityPanel(root);
    }
  }

  function renderRedeemState(root) {
    show($("[data-cc-redeem-section]", root));
  }

  function formatRevenue(cents) {
    var n = Number(cents || 0) / 100;
    return n.toFixed(2);
  }

  function communityOptInCopy(role) {
    if (role === "recruiter") {
      return {
        title: t(
          "settings.creator_community_recruiter_opt_in_confirm_title",
          "Enable community for recruits"
        ),
        body: t(
          "settings.creator_community_recruiter_opt_in_confirm_body",
          "When you and a recruit both opt in: you receive AI bonus designs when they create, and you earn 30% of their net creator profit on new sales (they keep 70%). You can turn this off anytime — new sales stop sharing revenue; already published products keep their split."
        ),
      };
    }
    return {
      title: t(
        "settings.creator_community_member_opt_in_confirm_title",
        "Join community program"
      ),
      body: t(
        "settings.creator_community_member_opt_in_confirm_body",
        "When you and the creator who invited you both opt in: they receive bonus designs when you create, and you keep 70% of your net creator profit on new sales (they receive 30%). You can turn this off anytime — new sales stop sharing revenue; your existing published products keep their split."
      ),
    };
  }

  var _communityOptInPending = null;

  function closeCommunityOptInModal(root) {
    var modal = $("[data-cc-community-opt-in-modal]", root);
    if (modal && typeof modal.close === "function") modal.close();
    _communityOptInPending = null;
  }

  function openCommunityOptInModal(root, pending) {
    var modal = $("[data-cc-community-opt-in-modal]", root);
    if (!modal || typeof modal.showModal !== "function") {
      if (pending && typeof pending.onConfirm === "function") pending.onConfirm();
      return;
    }
    var copy = communityOptInCopy(pending.role);
    var titleEl = $("[data-cc-community-opt-in-title]", root);
    var textEl = $("[data-cc-community-opt-in-text]", root);
    if (titleEl) titleEl.textContent = copy.title;
    if (textEl) textEl.textContent = copy.body;
    _communityOptInPending = pending;
    modal.showModal();
  }

  async function applyCommunityOptIn(root, params) {
    try {
      var result = await apiPost("set-creator-community-opt-in", params);
      if (!result.ok) {
        alert(
          result.message ||
            result.error ||
            t("settings.creator_community_opt_in_error", "Could not update community setting. Please try again.")
        );
        return false;
      }
      await loadCommunityPanel(root);
      await loadStats(root);
      return true;
    } catch (_) {
      alert(t("settings.creator_community_opt_in_error", "Could not update community setting. Please try again."));
      return false;
    }
  }

  function bindCommunityOptInModal(root) {
    if (root.dataset.ccCommunityOptInBound === "1") return;
    root.dataset.ccCommunityOptInBound = "1";

    var confirmBtn = $("[data-cc-community-opt-in-confirm]", root);
    var cancelBtn = $("[data-cc-community-opt-in-cancel]", root);
    var modal = $("[data-cc-community-opt-in-modal]", root);

    if (confirmBtn) {
      confirmBtn.addEventListener("click", async function () {
        var pending = _communityOptInPending;
        closeCommunityOptInModal(root);
        if (!pending) return;
        await applyCommunityOptIn(root, pending.payload);
        if (typeof pending.onDone === "function") pending.onDone(true);
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        var pending = _communityOptInPending;
        closeCommunityOptInModal(root);
        if (pending && typeof pending.onDone === "function") pending.onDone(false);
      });
    }
    if (modal) {
      modal.addEventListener("cancel", function () {
        var pending = _communityOptInPending;
        _communityOptInPending = null;
        if (pending && typeof pending.onDone === "function") pending.onDone(false);
      });
    }
  }

  function requestCommunityOptInEnable(root, payload, onDone) {
    openCommunityOptInModal(root, {
      role: payload.role,
      payload: payload,
      onDone: onDone,
    });
  }

  async function loadCommunityPanel(root) {
    var section = $("[data-cc-community]", root);
    if (!section) return;

    try {
      var settingsData = await api("get-creator-community-settings");
      if (!settingsData.ok) return;

      show(section);
      var settings = settingsData.settings || {};

      var recruiterWrap = $("[data-cc-recruiter-opt-in-wrap]", root);
      var recruiterCheck = $("[data-cc-recruiter-opt-in]", root);
      if (recruiterWrap && recruiterCheck) {
        show(recruiterWrap);
        recruiterCheck.checked = !!settings.recruiter_opt_in;
        recruiterCheck.onchange = async function () {
          var wantEnabled = recruiterCheck.checked;
          if (!wantEnabled) {
            recruiterCheck.disabled = true;
            var ok = await applyCommunityOptIn(root, {
              role: "recruiter",
              enabled: false,
            });
            if (!ok) recruiterCheck.checked = true;
            recruiterCheck.disabled = false;
            return;
          }
          recruiterCheck.checked = false;
          requestCommunityOptInEnable(
            root,
            { role: "recruiter", enabled: true },
            function (confirmed) {
              if (confirmed) {
                recruiterCheck.checked = true;
                return;
              }
              recruiterCheck.checked = false;
            }
          );
        };
      }

      var memberOptins = $("[data-cc-member-optins]", root);
      var relationships = settings.member_relationships || [];
      if (memberOptins && relationships.length > 0) {
        show(memberOptins);
        memberOptins.innerHTML = relationships
          .map(function (rel) {
            var id = "cc-member-opt-" + rel.community_owner_id;
            return (
              '<label class="cc-community-toggle">' +
              '<input type="checkbox" data-cc-member-opt-in data-owner-id="' +
              rel.community_owner_id +
              '" id="' +
              id +
              '" ' +
              (rel.member_opt_in ? "checked" : "") +
              " />" +
              "<span>" +
              t("settings.creator_community_member_opt_in", "Join community program") +
              "</span></label>"
            );
          })
          .join("");

        memberOptins.querySelectorAll("[data-cc-member-opt-in]").forEach(function (el) {
          el.addEventListener("change", async function () {
            var ownerId = el.getAttribute("data-owner-id");
            var wantEnabled = el.checked;
            if (!wantEnabled) {
              el.disabled = true;
              var ok = await applyCommunityOptIn(root, {
                role: "member",
                community_owner_id: ownerId,
                enabled: false,
              });
              if (!ok) el.checked = true;
              el.disabled = false;
              return;
            }
            el.checked = false;
            requestCommunityOptInEnable(
              root,
              {
                role: "member",
                community_owner_id: ownerId,
                enabled: true,
              },
              function (confirmed) {
                el.checked = !!confirmed;
              }
            );
          });
        });
      } else if (memberOptins) {
        hide(memberOptins);
      }

      var statsData = await api("get-creator-code-stats");
      if (statsData.ok && statsData.stats) {
        var s = statsData.stats;
        show($("[data-cc-community-stats]", root));
        var activeEl = $("[data-cc-stat-active]", root);
        var pendingEl = $("[data-cc-stat-pending]", root);
        var revenueEl = $("[data-cc-stat-revenue]", root);
        if (activeEl) activeEl.textContent = s.community_active != null ? s.community_active : 0;
        if (pendingEl) pendingEl.textContent = s.pending_designs != null ? s.pending_designs : 0;
        if (revenueEl) revenueEl.textContent = formatRevenue(s.community_revenue_cents);
      }

      var membersData = await api("list-creator-community-members");
      var membersSection = $("[data-cc-members-section]", root);
      var membersList = $("[data-cc-members-list]", root);
      if (membersData.ok && membersList && (membersData.members || []).length > 0) {
        show(membersSection);
        membersList.innerHTML = membersData.members
          .map(function (m) {
            var badge = m.active
              ? '<span class="cc-community-badge is-active">' +
                t("settings.creator_community_member_active", "Active") +
                "</span>"
              : '<span class="cc-community-badge is-pending">' +
                t("settings.creator_community_member_pending", "Waiting for opt-in") +
                "</span>";
            return (
              '<div class="cc-community-row"><div><div>' +
              (m.member_id || "") +
              '</div><div class="cc-community-row__meta">' +
              (m.joined_at || "") +
              "</div></div>" +
              badge +
              "</div>"
            );
          })
          .join("");
      } else if (membersSection) {
        hide(membersSection);
      }

      var designsData = await api("get-community-designs");
      var designsSection = $("[data-cc-designs-section]", root);
      var designsList = $("[data-cc-designs-list]", root);
      var designsEmpty = $("[data-cc-designs-empty]", root);
      var designs = (designsData.ok && designsData.designs) || [];

      if (designsSection) show(designsSection);
      if (designs.length === 0) {
        if (designsList) designsList.innerHTML = "";
        if (designsEmpty) show(designsEmpty);
      } else {
        if (designsEmpty) hide(designsEmpty);
        if (designsList) {
          designsList.innerHTML = designs
            .map(function (d) {
              var img = d.preview_url
                ? '<img src="' + d.preview_url + '" alt="" />'
                : "";
              return (
                '<div class="cc-community-design-card" data-design-id="' +
                d.id +
                '">' +
                img +
                '<div class="cc-community-design-actions">' +
                '<button type="button" class="cc-btn cc-btn--primary cc-btn--copy" data-cc-claim-design="' +
                d.id +
                '"><span>' +
                t("settings.creator_community_claim_btn", "Claim") +
                "</span></button>" +
                '<button type="button" class="cc-btn cc-btn--copy" data-cc-dismiss-design="' +
                d.id +
                '"><span>' +
                t("settings.creator_community_dismiss_btn", "Dismiss") +
                "</span></button></div></div>"
              );
            })
            .join("");

          designsList.querySelectorAll("[data-cc-claim-design]").forEach(function (btn) {
            btn.addEventListener("click", async function () {
              var id = btn.getAttribute("data-cc-claim-design");
              try {
                var res = await apiPost("claim-community-design", {
                  community_design_id: Number(id),
                });
                if (res.ok) await loadCommunityPanel(root);
                else alert(res.error || "Error");
              } catch (_) {
                alert(t("settings.creator_codes_connection_error", "Connection error."));
              }
            });
          });

          designsList.querySelectorAll("[data-cc-dismiss-design]").forEach(function (btn) {
            btn.addEventListener("click", async function () {
              var id = btn.getAttribute("data-cc-dismiss-design");
              try {
                var res = await apiPost("dismiss-community-design", {
                  community_design_id: Number(id),
                });
                if (res.ok) await loadCommunityPanel(root);
              } catch (_) {}
            });
          });
        }
      }
    } catch (_) {}
  }

  async function loadStats(root) {
    try {
      var data = await api("get-creator-code-stats");
      if (!data.ok) return;
      var stats = data.stats;
      show($("[data-cc-stats]", root));
      var g = $("[data-cc-stat-generated]", root);
      var r = $("[data-cc-stat-redeemed]", root);
      var c = $("[data-cc-stat-community]", root);
      if (g) g.textContent = stats.total_generated;
      if (r) r.textContent = stats.total_redeemed;
      if (c) c.textContent = stats.community_size;
      var activeEl = $("[data-cc-stat-active]", root);
      var pendingEl = $("[data-cc-stat-pending]", root);
      var revenueEl = $("[data-cc-stat-revenue]", root);
      if (activeEl && stats.community_active != null) activeEl.textContent = stats.community_active;
      if (pendingEl && stats.pending_designs != null) pendingEl.textContent = stats.pending_designs;
      if (revenueEl && stats.community_revenue_cents != null) {
        revenueEl.textContent = formatRevenue(stats.community_revenue_cents);
      }
    } catch (_) {}
  }

  async function loadHistory(root) {
    try {
      var data = await api("list-redeemed-codes", { limit: "20" });
      if (!data.ok) return;

      var historyEl = $("[data-cc-history]", root);
      var list = $("[data-cc-history-list]", root);
      var emptyEl = $("[data-cc-history-empty]", root);
      show(historyEl);

      if (!data.codes || data.codes.length === 0) {
        show(emptyEl);
        return;
      }

      hide(emptyEl);
      list.innerHTML = "";
      data.codes.forEach(function (c) {
        var item = document.createElement("div");
        item.className = "cc-history-item";
        var dateStr = c.redeemed_at
          ? new Date(c.redeemed_at).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        item.innerHTML =
          '<span class="cc-history-code">' +
          c.code +
          "</span>" +
          '<span class="cc-history-meta">' +
          dateStr +
          "</span>";
        list.appendChild(item);
      });
    } catch (_) {}
  }

  function formatRecipientStats(user) {
    var template = t(
      "settings.creator_codes_picker_stats",
      "{{generated}} designs · {{uploads}} uploads"
    );
    return template
      .replace("{{generated}}", String(user.generated_count || 0))
      .replace("{{uploads}}", String(user.upload_count || 0));
  }

  function confirmSendText(username, permanent) {
    if (permanent) {
      return t(
        "settings.creator_codes_send_confirm_permanent",
        "Code goes to @" + username + " — you will lose this code permanently."
      ).replace("{{username}}", username);
    }
    return t(
      "settings.creator_codes_send_confirm_share",
      "Code goes to @" + username + " — it will be redeemed when they accept."
    ).replace("{{username}}", username);
  }

  function confirmPoolText(permanent) {
    if (permanent) {
      return t(
        "settings.creator_codes_pool_confirm_permanent",
        "Add this code to the Eazy gift pool? You will lose it permanently when someone claims it."
      );
    }
    return t(
      "settings.creator_codes_pool_confirm_share",
      "Add this code to the Eazy gift pool? It stays active until someone claims it."
    );
  }

  function resetPickerModal(root) {
    _selectedRecipient = null;
    var search = $("[data-cc-picker-search]", root);
    var list = $("[data-cc-picker-list]", root);
    var empty = $("[data-cc-picker-empty]", root);
    var confirm = $("[data-cc-picker-confirm]", root);
    var confirmCheck = $("[data-cc-picker-confirm-check]", root);
    var sendBtn = $("[data-cc-picker-send]", root);
    if (search) search.value = "";
    if (list) list.innerHTML = "";
    hide(empty);
    hide(confirm);
    show($("[data-cc-picker-close]", root));
    if (confirmCheck) confirmCheck.checked = false;
    if (sendBtn) sendBtn.disabled = true;
  }

  function openUserPickerModal(root) {
    var modal = $("[data-cc-picker-modal]", root);
    if (!modal || typeof modal.showModal !== "function") return;
    resetPickerModal(root);
    modal.showModal();
    loadRecipients(root, "");
  }

  function closeUserPickerModal(root) {
    var modal = $("[data-cc-picker-modal]", root);
    if (modal && typeof modal.close === "function") modal.close();
    if (_recipientSearchTimer) {
      clearTimeout(_recipientSearchTimer);
      _recipientSearchTimer = null;
    }
  }

  function openPoolModal(root) {
    var modal = $("[data-cc-pool-modal]", root);
    if (!modal || typeof modal.showModal !== "function") return;
    var textEl = $("[data-cc-pool-confirm-text]", root);
    var check = $("[data-cc-pool-confirm-check]", root);
    var checkLabel = check ? check.closest("label") : null;
    var sendBtn = $("[data-cc-pool-send]", root);
    var permanent = !!(_state.active_code && _state.active_code.is_permanent_gift);
    if (textEl) textEl.textContent = confirmPoolText(permanent);
    if (checkLabel) checkLabel.style.display = permanent ? "" : "none";
    if (check) {
      check.checked = !permanent;
      check.required = permanent;
    }
    if (sendBtn) sendBtn.disabled = permanent;
    modal.showModal();
  }

  function closePoolModal(root) {
    var modal = $("[data-cc-pool-modal]", root);
    if (modal && typeof modal.close === "function") modal.close();
  }

  function renderRecipientList(root, users) {
    var list = $("[data-cc-picker-list]", root);
    var empty = $("[data-cc-picker-empty]", root);
    if (!list) return;
    list.innerHTML = "";
    if (!users || users.length === 0) {
      show(empty);
      return;
    }
    hide(empty);
    users.forEach(function (user) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-picker-item";
      btn.setAttribute("data-owner-id", user.owner_id);
      var username = user.username || "User";
      var avatarHtml = user.profile_picture_url
        ? '<img class="cc-picker-item__avatar" src="' +
          user.profile_picture_url.replace(/"/g, "&quot;") +
          '" alt="" width="40" height="40" loading="lazy">'
        : '<span class="cc-picker-item__avatar cc-picker-item__avatar--placeholder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></span>';
      btn.innerHTML =
        '<span class="cc-picker-item__body">' +
        '<span class="cc-picker-item__name">@' +
        username +
        "</span>" +
        '<span class="cc-picker-item__stats">' +
        formatRecipientStats(user) +
        "</span></span>" +
        avatarHtml;
      btn.addEventListener("click", function () {
        selectRecipient(root, user);
      });
      list.appendChild(btn);
    });
  }

  function selectRecipient(root, user) {
    _selectedRecipient = user;
    var list = $("[data-cc-picker-list]", root);
    var confirm = $("[data-cc-picker-confirm]", root);
    var confirmText = $("[data-cc-picker-confirm-text]", root);
    var confirmCheck = $("[data-cc-picker-confirm-check]", root);
    var confirmLabel = confirmCheck ? confirmCheck.closest("label") : null;
    var sendBtn = $("[data-cc-picker-send]", root);
    if (list) hide(list);
    hide($("[data-cc-picker-empty]", root));
    hide($("[data-cc-picker-search]", root));
    hide($("[data-cc-picker-loading]", root));
    hide($("[data-cc-picker-close]", root));
    show(confirm);
    var permanent = !!(_state.active_code && _state.active_code.is_permanent_gift);
    if (confirmText) {
      confirmText.textContent = confirmSendText(user.username || "User", permanent);
    }
    if (confirmLabel) confirmLabel.style.display = permanent ? "" : "none";
    if (confirmCheck) {
      confirmCheck.checked = !permanent;
      confirmCheck.required = permanent;
    }
    if (sendBtn) sendBtn.disabled = permanent;
  }

  async function loadRecipients(root, query) {
    var loading = $("[data-cc-picker-loading]", root);
    show(loading);
    hide($("[data-cc-picker-empty]", root));
    try {
      var params = { limit: "30" };
      if (query && query.length >= 2) params.q = query;
      var data = await api("list-creator-code-recipients", params);
      renderRecipientList(root, data.ok ? data.users : []);
    } catch (_) {
      renderRecipientList(root, []);
    }
    hide(loading);
  }

  async function sendCodeToUser(root) {
    if (!_state.active_code || !_selectedRecipient) return;
    var sendBtn = $("[data-cc-picker-send]", root);
    if (sendBtn) sendBtn.disabled = true;
    try {
      var result = await apiPost("gift-creator-code", {
        code_id: _state.active_code.id,
        channel: "direct_user",
        target: _selectedRecipient.owner_id,
        confirmed: true,
      });
      if (result.ok) {
        closeUserPickerModal(root);
        await init();
      } else {
        alert(result.error || t("settings.creator_codes_send_failed", "Send failed"));
      }
    } catch (e) {
      alert(t("settings.creator_codes_connection_error", "Connection error. Please try again."));
    }
    if (sendBtn) sendBtn.disabled = false;
  }

  async function sendCodeToPool(root) {
    if (!_state.active_code) return;
    var sendBtn = $("[data-cc-pool-send]", root);
    if (sendBtn) sendBtn.disabled = true;
    try {
      var result = await apiPost("gift-creator-code", {
        code_id: _state.active_code.id,
        channel: "eazy_pool",
        confirmed: true,
      });
      if (result.ok) {
        closePoolModal(root);
        await init();
      } else {
        alert(result.error || t("settings.creator_codes_pool_failed", "Could not add to pool"));
      }
    } catch (e) {
      alert(t("settings.creator_codes_connection_error", "Connection error. Please try again."));
    }
    if (sendBtn) sendBtn.disabled = false;
  }

  async function init() {
    if (!ownerId()) return;

    var root = $("[data-cc-root]");
    if (!root) return;

    show($("[data-cc-loading]", root));
    hide($("[data-cc-redeem-section]", root));
    hide($("[data-cc-creator-section]", root));

    try {
      var data = await api("get-creator-code");
      hide($("[data-cc-loading]", root));

      if (data.show_creator_panel || data.is_creator || data.has_pending_entitlement) {
        renderCreatorState(root, data);
      }
      if (!data.is_creator) {
        renderRedeemState(root);
      }

      try {
        document.dispatchEvent(
          new CustomEvent("eaz:creator-code-state", { detail: data })
        );
      } catch (_) {}
    } catch (e) {
      hide($("[data-cc-loading]", root));
      renderRedeemState(root);
    }

    if (!_initialized) {
      bindCommunityOptInModal(root);
      bindEvents(root);
      _initialized = true;
    }
  }

  function bindEvents(root) {
    var redeemBtn = $("[data-cc-redeem-btn]", root);
    var redeemInput = $("[data-cc-redeem-input]", root);
    if (redeemBtn) {
      redeemBtn.addEventListener("click", async function () {
        var code = redeemInput ? redeemInput.value.trim() : "";
        if (!code) return;
        redeemBtn.disabled = true;
        var msgEl = $("[data-cc-redeem-message]", root);
        try {
          var result = await apiPost("redeem-creator-code", { code: code });
          if (result.ok) {
            hide(msgEl);
            var levelData = await api("get-level", {});
            if (levelData && levelData.ok !== false) {
              await playRedeemCelebration(levelData);
              afterRedeemSuccess(levelData, result);
            }
            await init();
          } else {
            show(msgEl);
            msgEl.className = "cc-message is-error";
            msgEl.textContent = result.message || result.error || "Error";
          }
        } catch (e) {
          show(msgEl);
          msgEl.className = "cc-message is-error";
          msgEl.textContent = "Connection error. Please try again.";
        }
        redeemBtn.disabled = false;
      });
    }

    var genBtn = $("[data-cc-generate-btn]", root);
    if (genBtn) {
      genBtn.addEventListener("click", async function () {
        genBtn.disabled = true;
        try {
          var result = await apiPost("generate-creator-code", {});
          if (result.ok && result.code) {
            await playRevealAnimation(root, result.code);
            await init();
          } else {
            alert(result.message || result.error || "Could not generate code.");
          }
        } catch (e) {
          alert("Connection error.");
        }
        genBtn.disabled = false;
      });
    }

    var revealSaleBtn = $("[data-cc-reveal-sale-btn]", root);
    if (revealSaleBtn) {
      revealSaleBtn.addEventListener("click", async function () {
        if (!_state.pending_sale) return;
        revealSaleBtn.disabled = true;
        await revealEntitlement(root, _state.pending_sale.id);
        revealSaleBtn.disabled = false;
      });
    }

    var revealPurchaseBtn = $("[data-cc-reveal-purchase-btn]", root);
    if (revealPurchaseBtn) {
      revealPurchaseBtn.addEventListener("click", async function () {
        if (!_state.pending_purchase) return;
        revealPurchaseBtn.disabled = true;
        await revealEntitlement(root, _state.pending_purchase.id);
        revealPurchaseBtn.disabled = false;
      });
    }

    var scanBtn = $("[data-cc-scan-qr-btn]", root);
    if (scanBtn) scanBtn.addEventListener("click", function () {
      startQrScanner(root);
    });

    var uploadBtn = $("[data-cc-upload-qr-btn]", root);
    var fileInput = $("[data-cc-qr-file-input]", root);
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener("click", function () {
        fileInput.click();
      });
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files[0]) {
          decodeQrFromFile(fileInput.files[0], root);
          fileInput.value = "";
        }
      });
    }

    var phoneQrBtn = $("[data-cc-phone-qr-btn]", root);
    if (phoneQrBtn) {
      phoneQrBtn.addEventListener("click", function () {
        if (window.CreatorPhoneUploadModal && typeof window.CreatorPhoneUploadModal.open === "function") {
          window.CreatorPhoneUploadModal.open({
            onComplete: function () {
              /* phone upload is for images — user scans product QR with phone camera separately */
            },
          });
        } else {
          alert("Open this page on your phone to scan the product QR, or use Upload QR image.");
        }
      });
    }

    var copyCodeBtn = $("[data-cc-copy-code]", root);
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener("click", function () {
        var code = $("[data-cc-code-display]", root);
        if (code) copyText(code.textContent, copyCodeBtn);
      });
    }

    var sendUserBtn = $("[data-cc-send-user-btn]", root);
    if (sendUserBtn) {
      sendUserBtn.addEventListener("click", function () {
        openUserPickerModal(root);
      });
    }

    var poolBtn = $("[data-cc-pool-btn]", root);
    if (poolBtn) {
      poolBtn.addEventListener("click", function () {
        openPoolModal(root);
      });
    }

    var pickerSearch = $("[data-cc-picker-search]", root);
    if (pickerSearch) {
      pickerSearch.addEventListener("input", function () {
        if (_recipientSearchTimer) clearTimeout(_recipientSearchTimer);
        var q = pickerSearch.value.trim();
        _recipientSearchTimer = setTimeout(function () {
          if (_selectedRecipient) return;
          loadRecipients(root, q);
        }, 350);
      });
    }

    var pickerConfirmCheck = $("[data-cc-picker-confirm-check]", root);
    var pickerSend = $("[data-cc-picker-send]", root);
    if (pickerConfirmCheck && pickerSend) {
      pickerConfirmCheck.addEventListener("change", function () {
        var permanent = !!(_state.active_code && _state.active_code.is_permanent_gift);
        if (!permanent) {
          pickerSend.disabled = !_selectedRecipient;
          return;
        }
        pickerSend.disabled = !pickerConfirmCheck.checked || !_selectedRecipient;
      });
    }
    if (pickerSend) {
      pickerSend.addEventListener("click", function () {
        sendCodeToUser(root);
      });
    }

    var pickerCancel = $("[data-cc-picker-cancel]", root);
    if (pickerCancel) {
      pickerCancel.addEventListener("click", function () {
        closeUserPickerModal(root);
      });
    }
    var pickerClose = $("[data-cc-picker-close]", root);
    if (pickerClose) {
      pickerClose.addEventListener("click", function () {
        closeUserPickerModal(root);
      });
    }

    var poolConfirmCheck = $("[data-cc-pool-confirm-check]", root);
    var poolSend = $("[data-cc-pool-send]", root);
    if (poolConfirmCheck && poolSend) {
      poolConfirmCheck.addEventListener("change", function () {
        var permanent = !!(_state.active_code && _state.active_code.is_permanent_gift);
        if (!permanent) {
          poolSend.disabled = false;
          return;
        }
        poolSend.disabled = !poolConfirmCheck.checked;
      });
    }
    if (poolSend) {
      poolSend.addEventListener("click", function () {
        sendCodeToPool(root);
      });
    }
    var poolCancel = $("[data-cc-pool-cancel]", root);
    if (poolCancel) {
      poolCancel.addEventListener("click", function () {
        closePoolModal(root);
      });
    }
  }

  window.addEventListener("creator-settings-v2-tab-changed", function (e) {
    if (e.detail && e.detail.tab === "creator-codes") init();
  });

  window.addEventListener("creator-settings-v2-opened", function () {
    setTimeout(function () {
      var activePanel = document.querySelector(
        '.csm-panel.is-active[data-csm-panel="creator-codes"]'
      );
      if (activePanel) init();
    }, 50);
  });
})();
