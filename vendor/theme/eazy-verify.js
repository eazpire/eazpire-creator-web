/**
 * Eazy Verify — community review UI (Designs / Products, Available / Completed).
 */
(function () {
  "use strict";

  var API = "/apps/creator-dispatch";
  var _shellBound = false;
  var state = {
    entityType: "design",
    view: "available",
    completedOutcome: "verified",
    currentItem: null,
    rejectReasons: [],
    qualitySubReasons: [],
    termsAccepted: false,
    touchStartX: 0,
    touchStartY: 0,
  };

  var QUALITY_SUB_PREFIX = "quality_sub:";

  function t(key, fallback) {
    var parts = String(key || "").split(".");
    var cur = window.CreatorI18n || window.CreatorMobileI18n || {};
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== "object") return fallback;
      cur = cur[parts[i]];
    }
    return cur == null || cur === "" ? fallback : cur;
  }

  function ownerId() {
    if (window.__EAZY_GUEST) return null;
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    if (window.Shopify && window.Shopify.customerId) {
      return String(window.Shopify.customerId).trim();
    }
    if (window.logged_in_customer_id) return String(window.logged_in_customer_id).trim();
    if (window.EazyBot && typeof window.EazyBot.getUserId === "function") {
      var botId = window.EazyBot.getUserId();
      if (botId) return String(botId).trim();
    }
    return null;
  }

  function apiUrl(op, qs) {
    var u = API + "?op=" + encodeURIComponent(op);
    var oid = ownerId();
    if (oid) {
      u += "&owner_id=" + encodeURIComponent(oid);
      u += "&logged_in_customer_id=" + encodeURIComponent(oid);
    }
    if (qs) u += "&" + qs;
    return u;
  }

  function root() {
    return document.getElementById("eazy-verify-root");
  }

  function setChromeVisible(visible) {
    var bar = document.getElementById("eazy-verify-primary-bar");
    if (bar) bar.hidden = !visible;
    if (!visible) {
      var outcome = document.getElementById("eazy-verify-completed-block");
      if (outcome) outcome.hidden = true;
    } else {
      syncCompletedNavVisibility();
    }
  }

  function syncCompletedNavVisibility() {
    var block = document.getElementById("eazy-verify-completed-block");
    if (block) block.hidden = !state.termsAccepted || state.view !== "completed";
  }

  function setActiveButtons(selector, attr, value) {
    document.querySelectorAll(selector).forEach(function (btn) {
      var match = btn.getAttribute(attr) === value;
      btn.classList.toggle("is-active", match);
      if (btn.getAttribute("role") === "tab") {
        btn.setAttribute("aria-selected", match ? "true" : "false");
      }
    });
  }

  function bindShell() {
    if (_shellBound) return;
    _shellBound = true;

    document.querySelectorAll("[data-eazy-verify-entity]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.entityType = btn.getAttribute("data-eazy-verify-entity") || "design";
        setActiveButtons("[data-eazy-verify-entity]", "data-eazy-verify-entity", state.entityType);
        refresh();
      });
    });

    document.querySelectorAll("[data-eazy-verify-view]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.view = btn.getAttribute("data-eazy-verify-view") || "available";
        setActiveButtons("[data-eazy-verify-view]", "data-eazy-verify-view", state.view);
        syncCompletedNavVisibility();
        refresh();
      });
    });

    document.querySelectorAll("[data-eazy-verify-outcome]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.completedOutcome = btn.getAttribute("data-eazy-verify-outcome") || "verified";
        setActiveButtons("[data-eazy-verify-outcome]", "data-eazy-verify-outcome", state.completedOutcome);
        refresh();
      });
    });

    var openBtn = document.getElementById("eazy-verify-terms-open");
    if (openBtn) openBtn.addEventListener("click", openTermsModal);

    var termsCheckbox = document.getElementById("eazy-verify-terms-checkbox");
    var modalAccept = document.getElementById("eazy-verify-terms-modal-accept");
    if (termsCheckbox && modalAccept) {
      termsCheckbox.addEventListener("change", function () {
        modalAccept.disabled = !termsCheckbox.checked;
      });
    }

    if (modalAccept) {
      modalAccept.addEventListener("click", function () {
        if (!termsCheckbox || !termsCheckbox.checked) return;
        state.termsAccepted = true;
        closeTermsModal();
        showTermsGate(false);
        setChromeVisible(true);
        refresh();
        fetch(apiUrl("verify-accept-terms"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_16_plus: true }),
        }).catch(function () {});
      });
    }
  }

  function termsSummaryHtml() {
    return (
      "<p>" +
      t(
        "eazy_verify.terms_body",
        "You must be 16 or older. Help keep our marketplace safe by reviewing designs and products fairly."
      ) +
      "</p>" +
      "<ul class=\"eazy-verify__terms-list\">" +
      "<li>" +
      t(
        "eazy_verify.terms_point_fair",
        "Review items honestly and without bias."
      ) +
      "</li>" +
      "<li>" +
      t(
        "eazy_verify.terms_point_reject",
        "Use Reject only when content clearly breaks our community rules."
      ) +
      "</li>" +
      "<li>" +
      t(
        "eazy_verify.terms_point_privacy",
        "Do not share screenshots or personal data from review items."
      ) +
      "</li>" +
      "<li>" +
      t(
        "eazy_verify.terms_point_limit",
        "Daily review limits apply to keep the system fair for everyone."
      ) +
      "</li>" +
      "</ul>"
    );
  }

  function termsRulesHtml() {
    var rules = [
      ["terms_rules_intro", "When reviewing designs and products, apply these standards consistently. Your votes help creators publish quality work safely."],
      ["terms_rules_age", "Age requirement: You must be 16 or older to participate in community verification."],
      ["terms_rules_quality", "Quality: Designs and products should be clear, complete, and suitable for print-on-demand."],
      ["terms_rules_copyright", "Copyright: No copied logos, trademarks, or artwork you do not own or have rights to use."],
      ["terms_rules_offensive", "Respect: No hateful, harassing, or discriminatory content."],
      ["terms_rules_adult", "Family-friendly: No adult or sexual content; content must be suitable for general audiences."],
      ["terms_rules_safety", "Safety: No content promoting violence, self-harm, or illegal activity."],
      ["terms_rules_misleading", "Honesty: Titles and presentation must accurately represent the design or product."],
      ["terms_rules_privacy", "Privacy: Do not share screenshots, creator names, or personal details outside the review flow."],
      ["terms_rules_fairness", "Fair play: Daily vote limits apply. Vote honestly — do not coordinate to manipulate outcomes."],
    ];
    var list = rules
      .slice(1)
      .map(function (pair) {
        return "<li>" + t("eazy_verify." + pair[0], pair[1]) + "</li>";
      })
      .join("");
    return (
      "<h5>" +
      t("eazy_verify.terms_rules_heading", "Community Rules") +
      "</h5>" +
      "<p>" +
      t("eazy_verify." + rules[0][0], rules[0][1]) +
      "</p>" +
      "<ul class=\"eazy-verify__terms-rules-list\">" +
      list +
      "</ul>"
    );
  }

  function openTermsModal() {
    var modal = document.getElementById("eazy-verify-terms-modal");
    var upper = document.getElementById("eazy-verify-terms-modal-upper");
    var lower = document.getElementById("eazy-verify-terms-modal-lower");
    var checkbox = document.getElementById("eazy-verify-terms-checkbox");
    var acceptBtn = document.getElementById("eazy-verify-terms-modal-accept");
    if (!modal || !upper || !lower) return;
    upper.innerHTML = termsSummaryHtml();
    lower.innerHTML = termsRulesHtml();
    if (checkbox) checkbox.checked = false;
    if (acceptBtn) acceptBtn.disabled = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeTermsModal() {
    var modal = document.getElementById("eazy-verify-terms-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function showTermsGate(show) {
    var gate = document.getElementById("eazy-verify-terms-gate");
    if (gate) gate.hidden = !show;
  }

  function syncRejectFooter(visible) {
    var footer = document.getElementById("eazy-verify-reject-footer");
    if (footer) footer.hidden = !visible;
  }

  function collectRejectNote(panel) {
    var parts = [];
    var otherMain = panel.querySelector("#eazy-verify-other-reason-note");
    if (otherMain && otherMain.value.trim()) parts.push(otherMain.value.trim());
    var otherQuality = panel.querySelector("#eazy-verify-quality-other-note");
    if (otherQuality && otherQuality.value.trim()) parts.push(otherQuality.value.trim());
    return parts.join("\n");
  }

  function bindRejectConfirm(panel) {
    var confirm = document.getElementById("eazy-verify-reject-confirm");
    if (!confirm) return;
    confirm.onclick = function () {
      var selected = [];
      panel.querySelectorAll('input[name="reject_reason"]:checked').forEach(function (inp) {
        selected.push(inp.value);
      });
      if (!selected.length) return;
      if (selected.indexOf("quality_issue") >= 0) {
        var qualitySelected = [];
        panel.querySelectorAll('input[name="quality_sub_reason"]:checked').forEach(function (inp) {
          qualitySelected.push(inp.value);
        });
        if (!qualitySelected.length) return;
        qualitySelected.forEach(function (sub) {
          selected.push(QUALITY_SUB_PREFIX + sub);
        });
      }
      submitVote("reject", selected, collectRejectNote(panel));
    };
  }

  function renderTermsGate() {
    showTermsGate(true);
    setChromeVisible(false);
    var stage = document.getElementById("eazy-verify-stage");
    if (stage) stage.innerHTML = "";
  }

  function renderLoginGate() {
    showTermsGate(false);
    setChromeVisible(false);
    var stage = document.getElementById("eazy-verify-stage");
    if (!stage) return;
    stage.innerHTML =
      '<p class="eazy-verify__empty">' +
      (t("eazy_chat.login_required_text", "Sign in to use this feature.")) +
      "</p>";
  }

  function renderLoading(messageKey, fallback) {
    var stage = document.getElementById("eazy-verify-stage");
    if (!stage) return;
    stage.innerHTML =
      '<p class="eazy-verify__loading" role="status" aria-live="polite">' +
      t(messageKey || "eazy_verify.loading", fallback || "Loading reviews…") +
      "</p>";
  }

  function applyQueueResponse(d) {
    if (d && (d.error === "missing_owner_id" || d.error === "unauthorized")) {
      renderLoginGate();
      return;
    }
    if (d && d.error === "terms_not_accepted") {
      state.termsAccepted = false;
      renderTermsGate();
      return;
    }
    if (d && d.terms_accepted === false) {
      state.termsAccepted = false;
      renderTermsGate();
      return;
    }
    if (d && d.terms_accepted === true) {
      state.termsAccepted = true;
      showTermsGate(false);
      setChromeVisible(true);
    }
    if (d && d.reject_reasons) state.rejectReasons = d.reject_reasons;
    if (d && d.quality_sub_reasons) state.qualitySubReasons = d.quality_sub_reasons;
    renderAvailableItem((d && d.item) || null);
  }

  function questionForItem(item) {
    var entity = (item && item.entity_type) || state.entityType;
    if (entity === "product") {
      return t(
        "eazy_verify.question_product",
        "Does this product mockup meet our community and marketplace standards?"
      );
    }
    return t(
      "eazy_verify.question_design",
      "Does this design meet our community and marketplace standards?"
    );
  }

  function openReasonInfoModal(title, body) {
    var modal = document.getElementById("eazy-verify-reason-info-modal");
    var titleEl = document.getElementById("eazy-verify-reason-info-title");
    var bodyEl = document.getElementById("eazy-verify-reason-info-body");
    if (!modal || !titleEl || !bodyEl) return;
    titleEl.textContent = title;
    bodyEl.textContent = body;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeReasonInfoModal() {
    var modal = document.getElementById("eazy-verify-reason-info-modal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function bindReasonInfoButtons(container, keyPrefix) {
    if (!container) return;
    container.querySelectorAll("[data-eazy-verify-reason-info]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var key = btn.getAttribute("data-eazy-verify-reason-info") || "";
        var label = t(keyPrefix + key, key.replace(/_/g, " "));
        var info = t(keyPrefix + key + "_info", "");
        if (!info) return;
        openReasonInfoModal(
          t("eazy_verify.reason_info_title", "About this reason") + ": " + label,
          info
        );
      });
    });
  }

  function renderAvailableItem(item) {
    var stage = document.getElementById("eazy-verify-stage");
    if (!stage) return;
    syncRejectFooter(false);
    if (!item) {
      stage.innerHTML =
        '<p class="eazy-verify__empty">' +
        (t("eazy_verify.empty", "Nothing to review right now. Check back later.")) +
        "</p>";
      return;
    }
    state.currentItem = item;
    var title = item.title || t("eazy_verify.untitled", "Untitled");
    var variantLabel = item.variant_label || "";
    stage.innerHTML =
      '<p class="eazy-verify__question">' +
      questionForItem(item) +
      "</p>" +
      '<div class="eazy-verify__card" id="eazy-verify-card">' +
      (item.image_url
        ? '<img class="eazy-verify__img" src="' +
          item.image_url +
          '" alt="" loading="eager" />'
        : "") +
      '<h3 class="eazy-verify__title">' +
      title +
      "</h3>" +
      (variantLabel
        ? '<p class="eazy-verify__variant">' +
          t("eazy_verify.variant_label", "Variant: {{ label }}").replace(
            "{{ label }}",
            variantLabel
          ) +
          "</p>"
        : "") +
      '<div class="eazy-verify__swipe-hint eazy-verify__swipe-hint--mobile">' +
      '<span class="eazy-verify__hint-approve">← ' +
      (t("eazy_verify.approve", "Approve")) +
      "</span>" +
      '<span class="eazy-verify__hint-notsure">' +
      (t("eazy_verify.not_sure", "Not Sure")) +
      " →</span>" +
      "</div>" +
      '<div class="eazy-verify__desktop-actions">' +
      '<button type="button" class="eazy-verify__btn eazy-verify__btn--approve" id="eazy-verify-approve">' +
      (t("eazy_verify.approve", "Approve")) +
      "</button>" +
      '<button type="button" class="eazy-verify__btn eazy-verify__btn--notsure" id="eazy-verify-notsure">' +
      (t("eazy_verify.not_sure", "Not Sure")) +
      "</button>" +
      "</div>" +
      '<div class="eazy-verify__reject-box">' +
      '<label class="eazy-verify__reject-toggle"><input type="checkbox" id="eazy-verify-reject-toggle" /> ' +
      (t("eazy_verify.reject_toggle", "Reject")) +
      "</label>" +
      '<div class="eazy-verify__reject-panel" id="eazy-verify-reject-panel" hidden></div>' +
      "</div>" +
      "</div>";

    var card = document.getElementById("eazy-verify-card");
    if (card) bindSwipe(card);

    var approveBtn = document.getElementById("eazy-verify-approve");
    if (approveBtn) approveBtn.addEventListener("click", function () {
      submitVote("approve");
    });
    var notSureBtn = document.getElementById("eazy-verify-notsure");
    if (notSureBtn) notSureBtn.addEventListener("click", function () {
      submitVote("not_sure");
    });

    var rejectToggle = document.getElementById("eazy-verify-reject-toggle");
    var rejectPanel = document.getElementById("eazy-verify-reject-panel");
    if (rejectToggle && rejectPanel) {
      rejectToggle.addEventListener("change", function () {
        if (rejectToggle.checked) {
          rejectPanel.hidden = false;
          renderRejectReasons(rejectPanel);
          syncRejectFooter(true);
        } else {
          rejectPanel.hidden = true;
          rejectPanel.innerHTML = "";
          syncRejectFooter(false);
        }
      });
    }
  }

  function renderRejectReasons(panel) {
    var reasons = state.rejectReasons.length ? state.rejectReasons : [
      "quality_issue",
      "legal_copyright",
      "misleading_title",
      "offensive_hateful",
      "unsafe_dangerous",
      "adult_sexual",
      "sensitive_political",
      "not_suitable_minors",
      "other_reason",
    ];
    var qualitySubs = state.qualitySubReasons.length
      ? state.qualitySubReasons
      : [
          "color_combination",
          "theme_doesnt_fit",
          "design_too_small",
          "low_contrast_on_mockup",
          "placement_issue",
          "other",
        ];
    var html =
      '<div class="eazy-verify__reject-scroll creator-chat__scroll-thin">' +
      '<p class="eazy-verify__reject-label">' +
      (t("eazy_verify.reject_select", "Please select the main reason:")) +
      "</p>";
    reasons.forEach(function (r) {
      html +=
        '<label class="eazy-verify__reason"><input type="checkbox" name="reject_reason" value="' +
        r +
        '" data-main-reason="' +
        r +
        '" /> ' +
        (t("eazy_verify.reason_" + r, r.replace(/_/g, " "))) +
        ' <button type="button" class="eazy-verify__reason-info" data-eazy-verify-reason-info="' +
        r +
        '" aria-label="' +
        (t("eazy_verify.reason_info_title", "About this reason")) +
        '">ⓘ</button></label>';
      if (r === "other_reason") {
        html +=
          '<div class="eazy-verify__other-note-wrap" id="eazy-verify-other-reason-wrap" hidden>' +
          '<textarea id="eazy-verify-other-reason-note" class="eazy-verify__other-note" rows="2" placeholder="' +
          (t("eazy_verify.reject_other_placeholder", "Describe the issue…")) +
          '"></textarea></div>';
      }
    });
    html +=
      '<div class="eazy-verify__quality-panel" id="eazy-verify-quality-panel" hidden>' +
      '<p class="eazy-verify__reject-label">' +
      (t(
        "eazy_verify.quality_sub_select",
        "What quality issue applies? (select all that fit)"
      )) +
      "</p>";
    qualitySubs.forEach(function (sub) {
      html +=
        '<label class="eazy-verify__reason eazy-verify__reason--sub"><input type="checkbox" name="quality_sub_reason" value="' +
        sub +
        '" /> ' +
        (t("eazy_verify.quality_sub_" + sub, sub.replace(/_/g, " "))) +
        ' <button type="button" class="eazy-verify__reason-info" data-eazy-verify-reason-info="' +
        sub +
        '" aria-label="' +
        (t("eazy_verify.reason_info_title", "About this reason")) +
        '">ⓘ</button></label>';
      if (sub === "other") {
        html +=
          '<div class="eazy-verify__other-note-wrap" id="eazy-verify-quality-other-wrap" hidden>' +
          '<textarea id="eazy-verify-quality-other-note" class="eazy-verify__other-note" rows="2" placeholder="' +
          (t("eazy_verify.reject_other_placeholder", "Describe the issue…")) +
          '"></textarea></div>';
      }
    });
    html += "</div></div>";
    panel.innerHTML = html;

    bindReasonInfoButtons(panel, "eazy_verify.reason_");
    var qualityPanel = document.getElementById("eazy-verify-quality-panel");
    if (qualityPanel) {
      bindReasonInfoButtons(qualityPanel, "eazy_verify.quality_sub_");
    }

    panel.querySelectorAll('input[name="reject_reason"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        var qualityChecked = panel.querySelector(
          'input[name="reject_reason"][value="quality_issue"]:checked'
        );
        if (qualityPanel) qualityPanel.hidden = !qualityChecked;
        if (inp.value === "other_reason") {
          var wrap = document.getElementById("eazy-verify-other-reason-wrap");
          if (wrap) wrap.hidden = !inp.checked;
        }
      });
    });

    panel.querySelectorAll('input[name="quality_sub_reason"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        if (inp.value === "other") {
          var wrap = document.getElementById("eazy-verify-quality-other-wrap");
          if (wrap) wrap.hidden = !inp.checked;
        }
      });
    });

    bindRejectConfirm(panel);
  }

  function bindSwipe(card) {
    card.addEventListener(
      "touchstart",
      function (e) {
        var t0 = e.changedTouches[0];
        state.touchStartX = t0.clientX;
        state.touchStartY = t0.clientY;
      },
      { passive: true }
    );
    card.addEventListener("touchend", function (e) {
      var t1 = e.changedTouches[0];
      var dx = t1.clientX - state.touchStartX;
      var dy = Math.abs(t1.clientY - state.touchStartY);
      if (Math.abs(dx) < 60 || dy > 80) return;
      if (dx < -50) submitVote("approve");
      if (dx > 50) submitVote("not_sure");
    });
  }

  function submitVote(vote, reasons, note) {
    if (!state.currentItem) return;
    fetch(apiUrl("verify-submit-vote"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: state.currentItem.id,
        vote: vote,
        reject_reasons: reasons || [],
        note: note || "",
      }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && (d.error === "daily_design_limit" || d.error === "daily_product_limit")) {
          var stage = document.getElementById("eazy-verify-stage");
          if (stage) {
            stage.innerHTML =
              '<p class="eazy-verify__empty">' +
              t("eazy_verify.daily_limit", "Daily review limit reached. Come back tomorrow.") +
              "</p>";
          }
          return;
        }
        loadAvailable();
      });
  }

  function renderCompletedList(items) {
    var stage = document.getElementById("eazy-verify-stage");
    if (!stage) return;
    if (!items || !items.length) {
      stage.innerHTML =
        '<p class="eazy-verify__empty">' +
        (t("eazy_verify.completed_empty", "No completed reviews yet.")) +
        "</p>";
      return;
    }
    stage.innerHTML =
      '<ul class="eazy-verify__completed-list">' +
      items
        .map(function (it) {
          return (
            '<li><img src="' +
            (it.image_url_snapshot || it.image_url || "") +
            '" alt="" /><span>' +
            (it.title_snapshot || it.title || "") +
            "</span></li>"
          );
        })
        .join("") +
      "</ul>";
  }

  function loadAvailable() {
    renderLoading("eazy_verify.loading_next", "Loading next item…");
    fetch(
      apiUrl(
        "verify-next-item",
        "entity_type=" + encodeURIComponent(state.entityType)
      ),
      { credentials: "include" }
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        applyQueueResponse(d);
      })
      .catch(function () {
        renderAvailableItem(null);
      });
  }

  function loadBootstrap() {
    renderLoading("eazy_verify.loading", "Loading reviews…");
    fetch(
      apiUrl(
        "verify-bootstrap",
        "entity_type=" + encodeURIComponent(state.entityType)
      ),
      { credentials: "include" }
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        applyQueueResponse(d);
      })
      .catch(function () {
        renderTermsGate();
      });
  }

  function loadCompleted() {
    renderLoading("eazy_verify.loading", "Loading reviews…");
    fetch(
      apiUrl(
        "verify-completed-list",
        "entity_type=" +
          encodeURIComponent(state.entityType) +
          "&outcome=" +
          encodeURIComponent(state.completedOutcome)
      ),
      { credentials: "include" }
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        renderCompletedList(d.items || []);
      })
      .catch(function () {
        renderCompletedList([]);
      });
  }

  function refresh() {
    if (state.view === "completed") {
      if (!state.termsAccepted) return;
      loadCompleted();
      return;
    }
    loadBootstrap();
  }

  function resetDefaults() {
    state.entityType = "design";
    state.view = "available";
    state.completedOutcome = "verified";
    setActiveButtons("[data-eazy-verify-entity]", "data-eazy-verify-entity", "design");
    setActiveButtons("[data-eazy-verify-view]", "data-eazy-verify-view", "available");
    setActiveButtons("[data-eazy-verify-outcome]", "data-eazy-verify-outcome", "verified");
    syncCompletedNavVisibility();
  }

  function init() {
    if (!root()) return;
    bindShell();
    resetDefaults();

    var reasonInfoClose = document.getElementById("eazy-verify-reason-info-close");
    if (reasonInfoClose) {
      reasonInfoClose.addEventListener("click", closeReasonInfoModal);
    }
    var reasonInfoModal = document.getElementById("eazy-verify-reason-info-modal");
    if (reasonInfoModal) {
      reasonInfoModal.addEventListener("click", function (e) {
        if (e.target === reasonInfoModal) closeReasonInfoModal();
      });
    }

    if (!ownerId()) {
      renderLoginGate();
      return;
    }
    loadBootstrap();
  }

  window.EazyVerify = { init: init, refresh: refresh };
})();
