/**
 * EAZPIRE Artifacts Hub — NFTs, Outfit, Exchange, Marketplace
 */
(function () {
  "use strict";

  var SECTION = "collection";
  var slotFilter = "all";
  var lastLoadout = { slots: {}, visibility: {} };
  var nftModalContext = "inventory";
  var EXCHANGE_SUB = "market";
  var MARKET_SUB = "buy";
  var pollTimer = null;
  var lastInventory = [];
  var lastApiInventory = [];
  var trackingGenerating = {};
  var transientFailedSlots = {};
  var failedRemovalTimers = {};
  var FAILED_DISPLAY_MS = 7000;
  var openNftSlotId = null;
  var nftModalLastFocus = null;
  var releaseNftModalFocusTrap = null;

  var SLOT_KEYS = [
    "head",
    "upper_body",
    "layer",
    "pants",
    "feet",
    "socks",
    "accessory",
    "one_piece",
  ];

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  var SLOT_LABELS = {
    all: "All",
    head: "Head",
    upper_body: "Upper Body",
    layer: "Layer",
    pants: "Pants",
    feet: "Feet",
    socks: "Socks",
    accessory: "Accessory",
    accessory_1: "Accessory 1",
    accessory_2: "Accessory 2",
    one_piece: "One Piece",
  };

  function slotLabel(key) {
    if (key === "all") return t("eazy_chat.artifacts_filter_all", SLOT_LABELS.all);
    return t("eazy_chat.artifacts_slot_" + key, SLOT_LABELS[key] || key);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function findSlotById(id) {
    return (lastInventory || []).find(function (s) {
      return String(s.id) === String(id);
    });
  }

  function setLoadout(data) {
    if (!data) return;
    lastLoadout = { slots: data.slots || {}, visibility: data.visibility || {} };
  }

  function getEquippedInstanceIds() {
    var ids = {};
    var slots = lastLoadout.slots || {};
    Object.keys(slots).forEach(function (key) {
      var ref = slots[key];
      if (!ref) return;
      var id = typeof ref === "object" ? ref.instance_id : ref;
      if (id) ids[String(id)] = true;
    });
    return ids;
  }

  function findLoadoutSlotKeyForInstance(instanceId) {
    var slots = lastLoadout.slots || {};
    return Object.keys(slots).find(function (key) {
      var ref = slots[key];
      if (!ref) return false;
      var id = typeof ref === "object" ? ref.instance_id : ref;
      return String(id) === String(instanceId);
    }) || null;
  }

  function slotStatusLabel(status) {
    if (status === "listed") return t("eazy_chat.artifacts_item_status_listed", "Listed for trade");
    return t("eazy_chat.artifacts_item_status_owned", "Owned");
  }

  function generationStatusLabel(slot) {
    if (!slot) return t("eazy_chat.artifacts_item_none", "—");
    if (slot.generation_status === "generating") {
      return t("eazy_chat.artifacts_item_gen_generating", "Generating artwork…");
    }
    if (slot.generation_status === "failed") {
      return t("eazy_chat.artifacts_item_gen_failed", "Generation failed");
    }
    return t("eazy_chat.artifacts_item_gen_ready", "Ready");
  }

  function formatNichesHtml(niches) {
    var list = Array.isArray(niches) ? niches.filter(Boolean) : [];
    if (!list.length) {
      return '<span class="eaz-artifacts-nft-modal__none">' + escapeHtml(t("eazy_chat.artifacts_item_none", "—")) + "</span>";
    }
    return (
      '<span class="eaz-artifacts-nft-modal__niches">' +
      list
        .map(function (niche) {
          return '<span class="eaz-artifacts-nft-modal__niche">' + escapeHtml(niche) + "</span>";
        })
        .join("") +
      "</span>"
    );
  }

  function renderNftModalArt(slot) {
    if (slot.artwork_url) {
      return (
        '<img src="' +
        escapeHtml(slot.artwork_url) +
        '" alt="" class="eaz-artifacts-nft-modal__img"/>'
      );
    }
    if (slot.generation_status === "generating") {
      return (
        '<div class="eaz-artifacts-nft-modal__art-placeholder">' +
        '<span class="eaz-artifacts-card__spinner" aria-hidden="true"></span>' +
        '<span class="eaz-artifacts-card__gen-label">' +
        t("eazy_chat.artifacts_generating", "Generating…") +
        "</span></div>"
      );
    }
    if (slot.generation_status === "failed") {
      return (
        '<div class="eaz-artifacts-nft-modal__art-placeholder is-failed">' +
        '<span class="eaz-artifacts-card__gen-label eaz-artifacts-card__gen-label--failed">' +
        t("eazy_chat.artifacts_generation_failed", "Failed") +
        "</span>" +
        (slot.generation_error
          ? '<span class="eaz-artifacts-nft-modal__error">' + escapeHtml(slot.generation_error) + "</span>"
          : "") +
        "</div>"
      );
    }
    return (
      '<div class="eaz-artifacts-nft-modal__art-placeholder">' +
      escapeHtml(t("eazy_chat.artifacts_item_none", "—")) +
      "</div>"
    );
  }

  function populateArtifactModal(slot, context) {
    context = context === "outfit" ? "outfit" : "inventory";
    nftModalContext = context;
    var art = document.getElementById("eaz-artifacts-nft-modal-art");
    var meta = document.getElementById("eaz-artifacts-nft-modal-meta");
    var actions = document.getElementById("eaz-artifacts-nft-modal-actions");
    var title = document.getElementById("eaz-artifacts-nft-modal-title");
    if (!art || !meta || !actions || !slot) return;

    if (title) {
      title.textContent = slot.product_title
        ? String(slot.product_title)
        : t("eazy_chat.artifacts_item_preview_title", "Artifact");
    }
    art.innerHTML = renderNftModalArt(slot);
    meta.innerHTML =
      '<div class="eaz-artifacts-nft-modal__meta-row"><dt>' +
      escapeHtml(t("eazy_chat.artifacts_item_slot", "Slot")) +
      '</dt><dd>' +
      escapeHtml(slotLabel(slot.slot_type || "")) +
      "</dd></div>" +
      '<div class="eaz-artifacts-nft-modal__meta-row"><dt>' +
      escapeHtml(t("eazy_chat.artifacts_item_serial", "Serial")) +
      '</dt><dd>' +
      escapeHtml(slot.serial || t("eazy_chat.artifacts_item_none", "—")) +
      "</dd></div>" +
      '<div class="eaz-artifacts-nft-modal__meta-row"><dt>' +
      escapeHtml(t("eazy_chat.artifacts_item_product", "Product")) +
      '</dt><dd>' +
      escapeHtml(slot.product_title || t("eazy_chat.artifacts_item_none", "—")) +
      "</dd></div>" +
      '<div class="eaz-artifacts-nft-modal__meta-row"><dt>' +
      escapeHtml(t("eazy_chat.artifacts_item_generation", "Generation")) +
      '</dt><dd>' +
      escapeHtml(generationStatusLabel(slot)) +
      "</dd></div>" +
      '<div class="eaz-artifacts-nft-modal__meta-row"><dt>' +
      escapeHtml(t("eazy_chat.artifacts_item_status", "Status")) +
      '</dt><dd>' +
      escapeHtml(slotStatusLabel(slot.status)) +
      "</dd></div>" +
      '<div class="eaz-artifacts-nft-modal__meta-row"><dt>' +
      escapeHtml(t("eazy_chat.artifacts_item_niches", "Themes")) +
      '</dt><dd>' +
      formatNichesHtml(slot.niches) +
      "</dd></div>";

    var actionHtml = "";
    if (context === "outfit") {
      var outfitSlotKey = findLoadoutSlotKeyForInstance(slot.id);
      if (outfitSlotKey) {
        actionHtml +=
          '<button type="button" class="eazy-games-btn eazy-games-btn--filled" data-artifact-unequip="' +
          escapeHtml(outfitSlotKey) +
          '">' +
          t("eazy_chat.artifacts_unequip", "Unequip") +
          "</button>";
      }
    } else {
      if (slot.status === "owned" && slot.generation_status !== "generating" && slot.generation_status !== "failed") {
        actionHtml +=
          '<button type="button" class="eazy-games-btn eazy-games-btn--filled" data-nft-equip="' +
          slot.id +
          '">' +
          t("eazy_chat.artifacts_item_equip_outfit", "Equip to Outfit") +
          "</button>";
      }
      actionHtml +=
        '<button type="button" class="eazy-games-btn" data-nft-open-exchange="1">' +
        t("eazy_chat.artifacts_item_open_exchange", "Open Exchange") +
        "</button>";
    }
    actions.innerHTML = actionHtml;
  }

  function getFocusableElements(container) {
    return Array.prototype.slice
      .call(
        container.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        return !el.hidden && el.getAttribute("aria-hidden") !== "true";
      });
  }

  function trapFocusInModal(container) {
    if (releaseNftModalFocusTrap) {
      releaseNftModalFocusTrap();
      releaseNftModalFocusTrap = null;
    }
    var focusable = getFocusableElements(container);
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeNftModal();
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    releaseNftModalFocusTrap = function () {
      document.removeEventListener("keydown", onKeyDown, true);
    };
    first.focus();
  }

  function openNftModal(slot, context) {
    if (!slot || !slot.id) return;
    var modal = document.getElementById("eaz-artifacts-nft-modal");
    var card = document.getElementById("eaz-artifacts-nft-modal-card");
    if (!modal || !card) return;
    openNftSlotId = slot.id;
    populateArtifactModal(slot, context || nftModalContext);
    nftModalLastFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    trapFocusInModal(card);
  }

  function openDetail(slot, options) {
    options = options || {};
    var context = options.context === "outfit" ? "outfit" : "inventory";
    openNftModal(slot, context);
  }

  function closeNftModal() {
    var modal = document.getElementById("eaz-artifacts-nft-modal");
    if (!modal || modal.hidden) return;
    if (releaseNftModalFocusTrap) {
      releaseNftModalFocusTrap();
      releaseNftModalFocusTrap = null;
    }
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    openNftSlotId = null;
    if (nftModalLastFocus && typeof nftModalLastFocus.focus === "function") {
      nftModalLastFocus.focus();
    }
    nftModalLastFocus = null;
  }

  function equipSlotInstanceFromModal(slotId) {
    var slot = findSlotById(slotId);
    if (!slot || !slot.slot_type) return;
    fetchOp("artifacts-loadout-get").then(function (data) {
      if (!data || !data.ok) return;
      var slots = Object.assign({}, data.slots || {});
      slots[slot.slot_type] = { instance_id: slot.id };
      postOp("artifacts-loadout-set", { slots: slots }).then(function (res) {
        if (res && res.ok) {
          setLoadout({ slots: slots, visibility: (data && data.visibility) || {} });
          closeNftModal();
          setSection("outfit");
        }
      });
    });
  }

  function unequipFromModal(slotKey) {
    if (!slotKey) return;
    var slots = Object.assign({}, lastLoadout.slots || {});
    delete slots[slotKey];
    postOp("artifacts-loadout-set", { slots: slots }).then(function (res) {
      if (res && res.ok) {
        lastLoadout.slots = slots;
        closeNftModal();
        refresh();
      }
    });
  }

  function bindNftModal() {
    var modal = document.getElementById("eaz-artifacts-nft-modal");
    var closeBtn = document.getElementById("eaz-artifacts-nft-modal-close");
    var backdrop = document.getElementById("eaz-artifacts-nft-modal-backdrop");
    var actions = document.getElementById("eaz-artifacts-nft-modal-actions");
    if (closeBtn) closeBtn.addEventListener("click", closeNftModal);
    if (backdrop) backdrop.addEventListener("click", closeNftModal);
    if (actions) {
      actions.addEventListener("click", function (e) {
        var equipBtn = e.target.closest("[data-nft-equip]");
        if (equipBtn) {
          equipSlotInstanceFromModal(equipBtn.getAttribute("data-nft-equip"));
          return;
        }
        var unequipBtn = e.target.closest("[data-artifact-unequip]");
        if (unequipBtn) {
          unequipFromModal(unequipBtn.getAttribute("data-artifact-unequip"));
          return;
        }
        if (e.target.closest("[data-nft-open-exchange]")) {
          closeNftModal();
          setSection("exchange");
        }
      });
    }
    if (modal) {
      modal.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }
  }

  function bindNftGridClicks(grid) {
    if (!grid) return;
    grid.querySelectorAll("[data-artifacts-slot-id]").forEach(function (card) {
      function openFromCard() {
        var slot = findSlotById(card.getAttribute("data-artifacts-slot-id"));
        if (slot) openDetail(slot, { context: "inventory" });
      }
      card.addEventListener("click", openFromCard);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openFromCard();
        }
      });
    });
  }

  function syncOpenNftModal() {
    if (!openNftSlotId) return;
    var slot = findSlotById(openNftSlotId);
    if (slot) populateArtifactModal(slot, nftModalContext);
    else closeNftModal();
  }

  function slotIconSvg(key) {
    var icons = {
      all:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
      head:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>',
      upper_body:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M8 4l-2 3v13h12V7l-2-3"/><path d="M8 4h8"/><path d="M10 11h4"/></svg>',
      layer:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>',
      pants:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M8 3h8l1 5-2 13h-2l-1-8-1 8h-2L7 8l1-5z"/></svg>',
      feet:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M4 14c2-1 4-1 5 1s3 2 5 1 4-1 5 1v3H4v-6z"/><path d="M6 18v2M9 18v2M12 18v2M15 18v2M18 18v2"/></svg>',
      socks:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M6 4h8v8c0 2-1 4-3 5l-4 7H5l2-9c1-2 1-4-1-6V4z"/></svg>',
      accessory:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 2"/><path d="M9 3h6M9 21h6"/></svg>',
      accessory_1:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 2"/><path d="M9 3h6M9 21h6"/></svg>',
      accessory_2:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M12 2l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 7.2l5-.7L12 2z"/></svg>',
      one_piece:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M9 3h6l2 4v14H7V7l2-4z"/><path d="M9 11h6"/></svg>',
    };
    return icons[key] || icons.all;
  }

  function slotFilterButton(key, active) {
    return (
      '<button type="button" class="eaz-artifacts-slot-filter' +
      (active ? " is-active" : "") +
      '" data-slot-filter="' +
      key +
      '"><span class="eaz-artifacts-slot-filter__icon">' +
      slotIconSvg(key) +
      '</span><span class="eaz-artifacts-slot-filter__label">' +
      slotLabel(key) +
      "</span></button>"
    );
  }

  function apiBase() {
    return window.CREATOR_API_BASE || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  }

  function shopDomain() {
    return window.CREATOR_SHOP_DOMAIN || "eazpire.myshopify.com";
  }

  function ownerId() {
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    if (window.Shopify && window.Shopify.customerId) return String(window.Shopify.customerId).trim();
    if (window.logged_in_customer_id) return String(window.logged_in_customer_id).trim();
    return null;
  }

  function isLoggedIn() {
    if (window.__EAZY_GUEST) return false;
    return Boolean(ownerId());
  }

  function opUrl(op, params) {
    var url = apiBase() + "?op=" + encodeURIComponent(op) + "&shop=" + encodeURIComponent(shopDomain());
    var oid = ownerId();
    if (oid) url += "&logged_in_customer_id=" + encodeURIComponent(oid);
    if (params) {
      Object.keys(params).forEach(function (k) {
        url += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      });
    }
    return url;
  }

  function fetchOp(op, params) {
    return fetch(opUrl(op, params), { credentials: "include" }).then(function (r) {
      return r.json();
    });
  }

  function postOp(op, body) {
    var payload = body || {};
    if (ownerId() && !payload.owner_id) payload.owner_id = ownerId();
    return fetch(opUrl(op), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (r) {
      return r.json();
    });
  }

  var PENDING_TOKEN_KEY = "eaz_pending_artifact_token";
  var claimInFlight = false;

  function buildClaimLoginUrl(token) {
    var sf = String(window.__EAZ_STOREFRONT_ORIGIN || window.location.origin || "").replace(/\/+$/, "");
    var returnTo = sf + "/?eazy=artifacts&artifact_token=" + encodeURIComponent(String(token || "").trim());
    return "/account/login?return_url=" + encodeURIComponent(returnTo);
  }

  function showClaimBanner(message, state, loginToken) {
    var banner = document.getElementById("eaz-artifacts-claim-banner");
    var text = document.getElementById("eaz-artifacts-claim-banner-text");
    var spinner = document.getElementById("eaz-artifacts-claim-banner-spinner");
    var loginBtn = document.getElementById("eaz-artifacts-claim-banner-login");
    if (!banner || !text) return;
    banner.hidden = false;
    banner.classList.remove("is-success", "is-error", "is-loading");
    if (state === "success") banner.classList.add("is-success");
    else if (state === "error") banner.classList.add("is-error");
    else if (state === "loading") banner.classList.add("is-loading");
    text.textContent = message || "";
    if (spinner) spinner.hidden = state !== "loading";
    if (loginBtn) {
      if (loginToken) {
        loginBtn.hidden = false;
        loginBtn.href = buildClaimLoginUrl(loginToken);
      } else {
        loginBtn.hidden = true;
        loginBtn.removeAttribute("href");
      }
    }
  }

  function showOptimisticClaimCard() {
    var grid = document.getElementById("eaz-artifacts-nfts-grid");
    var empty = document.getElementById("eaz-artifacts-nfts-empty");
    if (!grid) return;
    if (empty) empty.hidden = true;
    if (grid.querySelector("[data-artifacts-optimistic-claim]")) return;
    grid.insertAdjacentHTML(
      "afterbegin",
      '<article class="eaz-artifacts-card is-generating" data-artifacts-optimistic-claim="1">' +
        '<div class="eaz-artifacts-card__placeholder eaz-artifacts-card__placeholder--generating">' +
        '<span class="eaz-artifacts-card__spinner" aria-hidden="true"></span>' +
        '<span class="eaz-artifacts-card__gen-label">' +
        t("eazy_chat.artifacts_generating", "Generating…") +
        "</span></div>" +
        '<div class="eaz-artifacts-card__meta"><span class="eaz-artifacts-card__slot">' +
        t("eazy_chat.artifacts_filter_all", "All") +
        '</span><span class="eaz-artifacts-card__serial">…</span></div></article>'
    );
  }

  function mergeSlotIntoInventory(slot, list) {
    if (!slot || !slot.id) return list || [];
    var base = (list || []).filter(function (s) {
      return s.id !== slot.id;
    });
    return [slot].concat(base);
  }

  function trackGeneratingSlot(slot) {
    if (slot && slot.id && slot.generation_status === "generating") {
      trackingGenerating[slot.id] = slot;
    }
  }

  function clearGeneratingTrack(slotId) {
    if (slotId && trackingGenerating[slotId]) {
      delete trackingGenerating[slotId];
    }
  }

  function showTransientGenerationFailed(slot) {
    if (!slot || !slot.id) return;
    var id = slot.id;
    clearGeneratingTrack(id);
    transientFailedSlots[id] = Object.assign({}, slot, {
      generation_status: "failed",
      _transient_failed: true,
    });
    var errDetail = slot.generation_error ? " (" + slot.generation_error + ")" : "";
    showClaimBanner(
      t("eazy_chat.artifacts_generation_retry", "Generation failed. Scan the product QR again to retry.") + errDetail,
      "error"
    );
    if (failedRemovalTimers[id]) {
      window.clearTimeout(failedRemovalTimers[id]);
    }
    failedRemovalTimers[id] = window.setTimeout(function () {
      delete transientFailedSlots[id];
      delete failedRemovalTimers[id];
      renderMergedInventory();
      hideClaimBanner(4000);
    }, FAILED_DISPLAY_MS);
    renderMergedInventory();
  }

  function notifyWearPromo() {
    if (window.EazArtifactsWearPromo && typeof window.EazArtifactsWearPromo.update === "function") {
      window.EazArtifactsWearPromo.update(lastInventory, SECTION);
    }
  }

  function renderMergedInventory() {
    var merged = (lastApiInventory || []).slice();
    Object.keys(transientFailedSlots).forEach(function (id) {
      var failedSlot = transientFailedSlots[id];
      if (failedSlot) merged.unshift(failedSlot);
    });
    lastInventory = merged;
    if (SECTION === "collection") renderNftsGrid(lastInventory);
    notifyWearPromo();
  }

  function applyInventory(slots) {
    var incoming = slots || [];
    var incomingIds = {};

    incoming.forEach(function (s) {
      incomingIds[s.id] = true;
    });

    Object.keys(trackingGenerating).forEach(function (id) {
      if (!incomingIds[id]) {
        showTransientGenerationFailed(trackingGenerating[id]);
      }
    });

    incoming.forEach(function (s) {
      if (s.generation_status === "generating") {
        trackGeneratingSlot(s);
      } else {
        clearGeneratingTrack(s.id);
      }
      if (s.generation_status === "failed") {
        showTransientGenerationFailed(s);
      }
    });

    lastApiInventory = incoming.filter(function (s) {
      return s.generation_status !== "failed";
    });
    renderMergedInventory();
  }

  function upsertClaimedSlot(slot) {
    if (!slot) return;
    removeOptimisticClaimCard();
    if (slot.generation_status === "generating") {
      trackGeneratingSlot(slot);
    } else if (slot.generation_status === "failed") {
      showTransientGenerationFailed(slot);
      return;
    }
    lastApiInventory = mergeSlotIntoInventory(slot, lastApiInventory).filter(function (s) {
      return s.generation_status !== "failed";
    });
    renderMergedInventory();
    if (slot.generation_status === "generating") {
      maybeStartPolling(lastInventory);
    }
  }

  function removeOptimisticClaimCard() {
    var card = document.querySelector("[data-artifacts-optimistic-claim]");
    if (card) card.remove();
  }

  function hideClaimBanner(delayMs) {
    window.setTimeout(function () {
      var banner = document.getElementById("eaz-artifacts-claim-banner");
      var loginBtn = document.getElementById("eaz-artifacts-claim-banner-login");
      if (banner) banner.hidden = true;
      if (loginBtn) loginBtn.hidden = true;
    }, delayMs || 0);
  }

  function parseArtifactTokenFromUrl() {
    try {
      var sp = new URLSearchParams(window.location.search);
      return (
        sp.get("artifact_token") ||
        (sp.get("eazy") === "artifacts" ? sp.get("t") || sp.get("token") : null) ||
        ""
      ).trim();
    } catch (e) {
      return "";
    }
  }

  function stripArtifactTokenFromUrl() {
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete("artifact_token");
      u.searchParams.delete("t");
      if (u.searchParams.get("eazy") === "artifacts" && !u.searchParams.get("artifact_token")) {
        u.searchParams.delete("eazy");
      }
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  function handleArtifactClaimToken(token) {
    var clean = String(token || "").trim();
    if (!clean || claimInFlight) return Promise.resolve(null);

    setSection("collection");

    if (!isLoggedIn()) {
      try {
        sessionStorage.setItem(PENDING_TOKEN_KEY, clean);
      } catch (e) {}
      showClaimBanner(
        t("eazy_chat.artifacts_claim_login", "Sign in to claim your Slot NFT."),
        "error",
        clean
      );
      return Promise.resolve({ ok: false, error: "auth_required" });
    }

    claimInFlight = true;
    showClaimBanner(t("eazy_chat.artifacts_claim_generating", "Creating your slot NFT…"), "loading");
    showOptimisticClaimCard();

    return postOp("artifacts-claim-qr", { token: clean }).then(function (res) {
      claimInFlight = false;
      if (res && res.ok) {
        try {
          sessionStorage.removeItem(PENDING_TOKEN_KEY);
        } catch (e) {}
        var msg = res.already_claimed
          ? t("eazy_chat.artifacts_claim_already", "This NFT is already in your collection.")
          : res.generating
            ? t("eazy_chat.artifacts_claim_minting", "Your artifact is being minted. It will appear below shortly.")
            : t("eazy_chat.artifacts_claim_success", "Slot NFT claimed!");
        var bannerState = res.generating ? "loading" : "success";
        showClaimBanner(msg, bannerState);
        if (res.slot) {
          upsertClaimedSlot(res.slot);
        } else {
          removeOptimisticClaimCard();
        }
        refresh();
        if (window.EazArtifactsAdminTest && typeof window.EazArtifactsAdminTest.startPollingIfNeeded === "function") {
          window.EazArtifactsAdminTest.startPollingIfNeeded();
        }
        if (!res.generating) hideClaimBanner(5000);
        return res;
      }
      removeOptimisticClaimCard();
      var err = (res && res.error) || "claim_failed";
      if (err === "auth_required") {
        try {
          sessionStorage.setItem(PENDING_TOKEN_KEY, clean);
        } catch (e) {}
        showClaimBanner(t("eazy_chat.artifacts_claim_login", "Sign in to claim your Slot NFT."), "error", clean);
      } else {
        showClaimBanner(
          t("eazy_chat.artifacts_claim_failed", "Claim failed") + (err ? " (" + err + ")" : ""),
          "error"
        );
      }
      return res;
    }).catch(function () {
      claimInFlight = false;
      removeOptimisticClaimCard();
      showClaimBanner(t("eazy_chat.artifacts_claim_failed", "Claim failed"), "error");
      return { ok: false, error: "claim_failed" };
    });
  }

  function consumePendingArtifactClaim() {
    var fromUrl = parseArtifactTokenFromUrl();
    if (fromUrl) {
      stripArtifactTokenFromUrl();
      return handleArtifactClaimToken(fromUrl);
    }
    var pending = "";
    try {
      pending = sessionStorage.getItem(PENDING_TOKEN_KEY) || "";
    } catch (e) {}
    if (pending && isLoggedIn()) {
      return handleArtifactClaimToken(pending);
    }
    return Promise.resolve(null);
  }

  function setExchangeSub(name) {
    EXCHANGE_SUB = name;
    document.querySelectorAll("[data-artifacts-exchange-sub]").forEach(function (btn) {
      var on = btn.getAttribute("data-artifacts-exchange-sub") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    refresh();
  }

  function setMarketSub(name) {
    MARKET_SUB = name;
    document.querySelectorAll("[data-artifacts-market-sub]").forEach(function (btn) {
      var on = btn.getAttribute("data-artifacts-market-sub") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    refresh();
  }

  function updateSubnavVisibility() {
    var exchangeBar = document.getElementById("eaz-artifacts-exchange-subnav");
    var marketBar = document.getElementById("eaz-artifacts-market-subnav");
    if (exchangeBar) exchangeBar.hidden = SECTION !== "exchange";
    if (marketBar) marketBar.hidden = SECTION !== "marketplace";
  }

  function maybeStartPolling(slots) {
    var hasGenerating = (slots || []).some(function (s) {
      return s.generation_status === "generating";
    });
    if (hasGenerating) {
      if (!pollTimer) {
        pollTimer = window.setInterval(function () {
          refresh();
        }, 3500);
      }
      if (window.EazArtifactsAdminTest && typeof window.EazArtifactsAdminTest.startPollingIfNeeded === "function") {
        window.EazArtifactsAdminTest.startPollingIfNeeded();
      }
    } else if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function setSection(name) {
    SECTION = name;
    document.querySelectorAll("[data-artifacts-section]").forEach(function (btn) {
      var on = btn.getAttribute("data-artifacts-section") === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("[data-artifacts-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-artifacts-panel") !== name;
    });
    var slotBar = document.getElementById("eaz-artifacts-slot-filters");
    if (slotBar) {
      slotBar.hidden = name !== "collection" && name !== "exchange";
    }
    updateSubnavVisibility();
    notifyWearPromo();
    refresh();
  }

  function renderSlotFilters() {
    var root = document.getElementById("eaz-artifacts-slot-filters");
    if (!root) return;
    var html = slotFilterButton("all", slotFilter === "all");
    SLOT_KEYS.forEach(function (key) {
      html += slotFilterButton(key, slotFilter === key);
    });
    root.innerHTML = html;
    root.querySelectorAll("[data-slot-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        slotFilter = btn.getAttribute("data-slot-filter") || "all";
        root.querySelectorAll("[data-slot-filter]").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        refresh();
      });
    });
  }

  function slotMatchesFilter(slotType, filter) {
    if (!filter || filter === "all") return true;
    if (filter === "accessory") {
      return slotType === "accessory" || slotType === "accessory_1" || slotType === "accessory_2";
    }
    return slotType === filter;
  }

  function renderNftsGrid(slots) {
    var grid = document.getElementById("eaz-artifacts-nfts-grid");
    var empty = document.getElementById("eaz-artifacts-nfts-empty");
    if (!grid) return;
    var list = slots || [];
    var equipped = getEquippedInstanceIds();
    list = list.filter(function (s) {
      return !equipped[String(s.id)];
    });
    if (slotFilter !== "all") {
      list = list.filter(function (s) {
        return slotMatchesFilter(s.slot_type, slotFilter);
      });
    }
    if (!list.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = list
      .map(function (slot) {
        var generating = slot.generation_status === "generating";
        var failed = slot.generation_status === "failed";
        var img = slot.artwork_url
          ? '<img src="' + slot.artwork_url + '" alt="" class="eaz-artifacts-card__img"/>'
          : '<div class="eaz-artifacts-card__placeholder' +
            (generating ? " eaz-artifacts-card__placeholder--generating" : "") +
            '">' +
            (generating
              ? '<span class="eaz-artifacts-card__spinner" aria-hidden="true"></span><span class="eaz-artifacts-card__gen-label">' +
                t("eazy_chat.artifacts_generating", "Generating…") +
                "</span>"
              : failed
                ? '<span class="eaz-artifacts-card__gen-label eaz-artifacts-card__gen-label--failed">' +
                  t("eazy_chat.artifacts_generation_failed", "Failed") +
                  "</span>"
                : "") +
            "</div>";
        return (
          '<article class="eaz-artifacts-card is-clickable' +
          (generating ? " is-generating" : "") +
          (failed ? " is-generation-failed" : "") +
          '" data-artifacts-slot-id="' +
          slot.id +
          '" role="button" tabindex="0" aria-label="' +
          escapeHtml((slot.product_title || slotLabel(slot.slot_type || "")) + " " + (slot.serial || "")) +
          '">' +
          img +
          '<div class="eaz-artifacts-card__meta"><span class="eaz-artifacts-card__slot">' +
          slotLabel(slot.slot_type || "") +
          '</span><span class="eaz-artifacts-card__serial">' +
          (slot.serial || "") +
          "</span></div></article>"
        );
      })
      .join("");
    bindNftGridClicks(grid);
    syncOpenNftModal();
    maybeStartPolling(list);
  }

  function renderExchange(listings, tokens) {
    var root = document.getElementById("eaz-artifacts-exchange-root");
    if (!root) return;
    var tokenEl = document.getElementById("eaz-artifacts-exchange-tokens");
    if (tokenEl) {
      tokenEl.hidden = EXCHANGE_SUB !== "market";
      if (EXCHANGE_SUB === "market") {
        tokenEl.textContent = t("eazy_chat.artifacts_trade_tokens", "Trade tokens") + ": " + (tokens || 0);
      }
    }
    var list = listings || [];
    if (slotFilter !== "all") {
      list = list.filter(function (l) {
        var s = l.slot || l;
        return slotMatchesFilter(s.slot_type, slotFilter);
      });
    }
    if (!list.length) {
      root.innerHTML =
        '<p class="eaz-artifacts-empty">' +
        (EXCHANGE_SUB === "mine"
          ? t("eazy_chat.artifacts_my_listings_empty", "You have no active listings.")
          : t("eazy_chat.artifacts_exchange_empty", "No listings yet.")) +
        "</p>";
      return;
    }
    root.innerHTML = list
      .map(function (l) {
        var s = l.slot || l;
        var img = s.artwork_url ? '<img src="' + s.artwork_url + '" alt=""/>' : "";
        var actions =
          EXCHANGE_SUB === "mine"
            ? '<button type="button" class="eazy-games-btn" data-cancel-listing="' +
              l.id +
              '">' +
              t("eazy_chat.artifacts_cancel_listing", "Cancel") +
              "</button>"
            : '<button type="button" class="eazy-games-btn eazy-games-btn--filled" data-offer-listing="' +
              l.id +
              '">' +
              t("eazy_chat.artifacts_offer_trade", "Offer trade") +
              "</button>";
        return (
          '<div class="eaz-artifacts-exchange-row">' +
          img +
          '<div><strong>' +
          slotLabel(s.slot_type || "") +
          "</strong><br/><small>" +
          (s.serial || "") +
          '</small></div>' +
          actions +
          "</div>"
        );
      })
      .join("");
    root.querySelectorAll("[data-offer-listing]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var listingId = Number(btn.getAttribute("data-offer-listing"));
        var offered = window.prompt(t("eazy_chat.artifacts_offer_slot_id", "Your slot instance ID to offer:"));
        if (!offered) return;
        postOp("artifacts-trade-offer", { listing_id: listingId, offered_instance_id: Number(offered) }).then(function (res) {
          if (res && res.ok) refresh();
          else alert((res && res.error) || "Trade failed");
        });
      });
    });
    root.querySelectorAll("[data-cancel-listing]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var listingId = Number(btn.getAttribute("data-cancel-listing"));
        fetch(apiBase() + "?op=artifacts-trade-listings&shop=" + encodeURIComponent(shopDomain()) + "&listing_id=" + listingId, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listing_id: listingId }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            if (res && res.ok) refresh();
            else alert((res && res.error) || "Cancel failed");
          });
      });
    });
  }

  function refresh() {
    if (!isLoggedIn()) return;
    if (SECTION === "collection" || SECTION === "outfit") {
      var params = slotFilter !== "all" && SECTION === "collection" ? { slot_type: slotFilter } : null;
      Promise.all([fetchOp("artifacts-inventory-list", params), fetchOp("artifacts-loadout-get")]).then(function (results) {
        var invData = results[0];
        var loadoutData = results[1];
        if (loadoutData && loadoutData.ok) {
          setLoadout(loadoutData);
          if (window.EazArtifactsOutfit) window.EazArtifactsOutfit.setLoadout(loadoutData);
        }
        if (!invData || !invData.ok) return;
        applyInventory(invData.slots || []);
        if (SECTION === "outfit" && window.EazArtifactsOutfit) {
          window.EazArtifactsOutfit.render(invData.slots || []);
        }
      });
      if (SECTION === "outfit" && window.EazArtifactsOutfit) {
        fetchOp("artifacts-set-status").then(function (data) {
          if (data && data.ok && window.EazArtifactsOutfit) window.EazArtifactsOutfit.setStatus(data);
        });
      }
    } else if (SECTION === "exchange") {
      var tradeOp =
        EXCHANGE_SUB === "mine"
          ? fetchOp("artifacts-trade-listings", { scope: "mine" })
          : fetchOp("artifacts-trade-listings", { scope: "market" });
      Promise.all([tradeOp, fetchOp("artifacts-inventory-state")]).then(function (res) {
        renderExchange((res[0] && res[0].listings) || [], (res[1] && res[1].trade_tokens) || 0);
      });
    } else if (SECTION === "marketplace" && window.EazArtifactsMarketplace) {
      window.EazArtifactsMarketplace.refresh(MARKET_SUB);
    }
  }

  function bindSubnav() {
    document.querySelectorAll("[data-artifacts-exchange-sub]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setExchangeSub(btn.getAttribute("data-artifacts-exchange-sub") || "market");
      });
    });
    document.querySelectorAll("[data-artifacts-market-sub]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setMarketSub(btn.getAttribute("data-artifacts-market-sub") || "buy");
      });
    });
  }

  function bindCarousel() {
    document.querySelectorAll("[data-artifacts-section]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setSection(btn.getAttribute("data-artifacts-section") || "collection");
      });
    });
  }

  function init() {
    renderSlotFilters();
    bindCarousel();
    bindSubnav();
    bindNftModal();
    updateSubnavVisibility();
    window.addEventListener("eaz-artifacts-mint-updated", function (ev) {
      var detail = (ev && ev.detail) || {};
      if (detail.slot && typeof upsertClaimedSlot === "function") {
        upsertClaimedSlot(detail.slot);
      }
      if (typeof setSection === "function") setSection("collection");
      if (detail.slot && detail.slot.generation_status === "generating") {
        showClaimBanner(
          t("eazy_chat.artifacts_claim_minting", "Your artifact is being minted. It will appear below shortly."),
          "loading"
        );
      }
    });
    if (window.EazArtifactsAdminTest && typeof window.EazArtifactsAdminTest.init === "function") {
      window.EazArtifactsAdminTest.init();
    }
    if (window.EazArtifactsWearPromo && typeof window.EazArtifactsWearPromo.init === "function") {
      window.EazArtifactsWearPromo.init();
    }
    setSection(SECTION);
    consumePendingArtifactClaim();
  }

  window.EazArtifactsHub = {
    init: init,
    refresh: refresh,
    setSection: setSection,
    handleArtifactClaimToken: handleArtifactClaimToken,
    consumePendingArtifactClaim: consumePendingArtifactClaim,
    upsertClaimedSlot: upsertClaimedSlot,
    handleGenerationFailed: showTransientGenerationFailed,
    showClaimStatus: function (message, state, loginToken) {
      showClaimBanner(message, state, loginToken);
    },
    openDetail: openDetail,
    openNftModal: openNftModal,
    closeNftModal: closeNftModal,
  };

  window.EazArtifactsClaim = {
    handleToken: handleArtifactClaimToken,
    consumePending: consumePendingArtifactClaim,
  };
})();
