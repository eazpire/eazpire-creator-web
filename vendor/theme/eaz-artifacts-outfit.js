/**
 * Artifacts Outfit loadout UI — figure + slot strip (Wardrobe-style)
 */
(function () {
  "use strict";

  var ONE_PIECE_CONFLICTS = ["upper_body", "layer", "pants"];
  var SLOT_KEYS = [
    "head",
    "upper_body",
    "layer",
    "pants",
    "feet",
    "socks",
    "accessory_1",
    "accessory_2",
    "one_piece",
  ];
  var loadout = { slots: {}, visibility: {} };
  var inventory = [];
  var setStatus = null;
  var selectedSlot = null;
  var figureRetry = 0;

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
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

  function postOp(op, body) {
    return fetch(apiBase() + "?op=" + encodeURIComponent(op) + "&shop=" + encodeURIComponent(shopDomain()), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json();
    });
  }

  function slotRef(slotKey) {
    var ref = loadout.slots && loadout.slots[slotKey];
    if (!ref) return null;
    return typeof ref === "object" ? ref.instance_id : ref;
  }

  function findSlot(id) {
    return inventory.find(function (s) {
      return s.id === id;
    });
  }

  function onePieceActive() {
    return Boolean(slotRef("one_piece"));
  }

  function figureSlotsMap() {
    var map = {};
    SLOT_KEYS.forEach(function (key) {
      if (slotRef(key)) map[key] = { product_id: "artifact" };
    });
    return map;
  }

  function renderFigure() {
    var container = document.getElementById("eaz-artifacts-figure");
    if (!container) return;
    if (window.WardrobeFigure && typeof window.WardrobeFigure.render === "function") {
      figureRetry = 0;
      window.WardrobeFigure.render(container, "male", "adult", figureSlotsMap());
      wireFigureZones(container);
      return;
    }
    if (figureRetry < 20) {
      figureRetry += 1;
      setTimeout(renderFigure, 120);
    }
  }

  function wireFigureZones(container) {
    container.querySelectorAll(".wrdrb-zone").forEach(function (zone) {
      var slotKey = zone.getAttribute("data-slot");
      if (!slotKey) return;
      zone.replaceWith(zone.cloneNode(true));
    });
    container.querySelectorAll(".wrdrb-zone").forEach(function (zone) {
      var slotKey = zone.getAttribute("data-slot");
      if (!slotKey) return;
      if (slotRef(slotKey)) zone.classList.add("is-filled");
      if (selectedSlot === slotKey) zone.classList.add("is-active-slot");
      zone.addEventListener("click", function (e) {
        e.preventDefault();
        selectedSlot = slotKey;
        highlightSelectedSlot();
        var card = document.querySelector('[data-outfit-slot="' + slotKey + '"]');
        if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  function highlightSelectedSlot() {
    var fig = document.getElementById("eaz-artifacts-figure");
    if (fig) {
      fig.querySelectorAll(".wrdrb-zone").forEach(function (zone) {
        zone.classList.toggle("is-active-slot", zone.getAttribute("data-slot") === selectedSlot);
      });
    }
    document.querySelectorAll("[data-outfit-slot]").forEach(function (el) {
      el.classList.toggle("is-selected", el.getAttribute("data-outfit-slot") === selectedSlot);
    });
  }

  function equipSlot(slotKey) {
    var options = inventory.filter(function (s) {
      return s.slot_type === slotKey;
    });
    if (!options.length) {
      alert(t("eazy_chat.artifacts_no_slot_items", "No items for this slot."));
      return;
    }
    var pick = options[0];
    if (options.length > 1) {
      var ids = options.map(function (o) {
        return o.id + " (" + o.serial + ")";
      });
      var chosen = window.prompt(t("eazy_chat.artifacts_pick_instance", "Instance ID:") + "\n" + ids.join("\n"), String(options[0].id));
      if (!chosen) return;
      pick = options.find(function (o) {
        return String(o.id) === String(chosen).trim();
      });
      if (!pick) return;
    }
    var slots = Object.assign({}, loadout.slots || {});
    slots[slotKey] = { instance_id: pick.id };
    postOp("artifacts-loadout-set", { slots: slots }).then(function (res) {
      if (res && res.ok) {
        loadout.slots = slots;
        if (window.EazArtifactsHub) window.EazArtifactsHub.refresh();
      }
    });
  }

  function render(slots) {
    inventory = slots || [];
    var root = document.getElementById("eaz-artifacts-outfit-root");
    if (!root) return;

    var html =
      '<div class="eaz-artifacts-outfit">' +
      '<div class="eaz-artifacts-outfit__figure-wrap">' +
      '<div class="eaz-artifacts-outfit__figure" id="eaz-artifacts-figure" aria-label="' +
      t("eazy_chat.artifacts_section_outfit", "Outfit") +
      '"></div></div>' +
      '<div class="eaz-artifacts-outfit__slots">';

    SLOT_KEYS.forEach(function (key) {
      var id = slotRef(key);
      var inst = id ? findSlot(id) : null;
      var covered = onePieceActive() && ONE_PIECE_CONFLICTS.indexOf(key) >= 0 && !inst;
      var vis = loadout.visibility && loadout.visibility[key] !== false;
      html +=
        '<div class="eaz-artifacts-outfit__slot' +
        (covered ? " is-covered" : "") +
        (selectedSlot === key ? " is-selected" : "") +
        '" data-outfit-slot="' +
        key +
        '">';
      html += '<div class="eaz-artifacts-outfit__slot-label">' + t("eazy_chat.artifacts_slot_" + key, key) + "</div>";
      if (inst && inst.artwork_url) {
        html += '<img src="' + inst.artwork_url + '" alt=""/>';
      } else {
        html += '<div class="eaz-artifacts-outfit__empty">+</div>';
      }
      if (inst) {
        html +=
          '<label class="eaz-artifacts-outfit__vis"><input type="checkbox" data-vis-slot="' +
          key +
          '"' +
          (vis ? " checked" : "") +
          "/> " +
          t("eazy_chat.artifacts_visible_in_mint", "Visible") +
          "</label>";
      }
      html +=
        '<button type="button" class="eaz-artifacts-outfit__pick" data-pick-slot="' +
        key +
        '">' +
        t("eazy_chat.artifacts_equip", "Equip") +
        "</button></div>";
    });
    html += "</div>";

    var mintReady = setStatus && setStatus.mint_eligible;
    html +=
      '<div class="eaz-artifacts-outfit__mint">' +
      '<p id="eaz-artifacts-set-theme">' +
      (setStatus && setStatus.set_theme ? t("eazy_chat.artifacts_set_theme", "Set theme") + ": " + setStatus.set_theme : "") +
      "</p>" +
      '<button type="button" class="eazy-games-btn eazy-games-btn--filled" id="eaz-artifacts-mint-btn"' +
      (mintReady ? "" : " disabled") +
      ">" +
      t("eazy_chat.artifacts_mint_character", "Mint Character") +
      "</button></div></div>";

    root.innerHTML = html;
    renderFigure();

    root.querySelectorAll("[data-pick-slot]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        equipSlot(btn.getAttribute("data-pick-slot"));
      });
    });

    root.querySelectorAll("[data-outfit-slot]").forEach(function (card) {
      card.addEventListener("click", function (e) {
        if (e.target.closest("button") || e.target.closest("label")) return;
        var slotKey = card.getAttribute("data-outfit-slot");
        selectedSlot = slotKey;
        highlightSelectedSlot();
        var id = slotRef(slotKey);
        var inst = id ? findSlot(id) : null;
        if (inst && window.EazArtifactsHub && typeof window.EazArtifactsHub.openDetail === "function") {
          window.EazArtifactsHub.openDetail(inst, { context: "outfit" });
        }
      });
    });

    root.querySelectorAll("[data-vis-slot]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var vis = Object.assign({}, loadout.visibility || {});
        vis[cb.getAttribute("data-vis-slot")] = cb.checked;
        postOp("artifacts-loadout-visibility", { visibility: vis }).then(function (res) {
          if (res && res.ok) loadout.visibility = vis;
        });
      });
    });

    var mintBtn = document.getElementById("eaz-artifacts-mint-btn");
    if (mintBtn) mintBtn.addEventListener("click", openMintModal);
  }

  function uploadMintReference(file) {
    var oid = ownerId();
    if (!oid || !file) return Promise.resolve(null);
    var fd = new FormData();
    fd.append("image", file);
    fd.append("owner_id", oid);
    return fetch(
      apiBase() + "?op=artifacts-mint-reference-upload&shop=" + encodeURIComponent(shopDomain()),
      { method: "POST", credentials: "include", body: fd }
    ).then(function (r) {
      return r.json();
    });
  }

  function closeMintOverlay() {
    var el = document.getElementById("eaz-artifacts-mint-overlay");
    if (el) el.remove();
  }

  function openMintModal() {
    closeMintOverlay();
    var phrase = t("eazy_chat.artifacts_mint_phrase", "MINT CHARACTER");
    var overlay = document.createElement("div");
    overlay.id = "eaz-artifacts-mint-overlay";
    overlay.className = "eaz-artifacts-mint-overlay";
    overlay.innerHTML =
      '<div class="eaz-artifacts-mint-modal" role="dialog" aria-modal="true">' +
      '<h3 class="eaz-artifacts-mint-modal__title">' +
      t("eazy_chat.artifacts_mint_character", "Mint Character") +
      "</h3>" +
      '<p class="eaz-artifacts-mint-modal__hint">' +
      t(
        "eazy_chat.artifacts_mint_reference_optional",
        "Optional: upload a photo of yourself to personalize your character."
      ) +
      "</p>" +
      '<label class="eaz-artifacts-mint-modal__upload">' +
      '<input type="file" accept="image/*" id="eaz-artifacts-mint-photo" />' +
      '<span>' +
      t("eazy_chat.artifacts_mint_reference_upload", "Upload photo (optional)") +
      "</span></label>" +
      '<p class="eaz-artifacts-mint-modal__warn">' +
      t("eazy_chat.artifacts_mint_warning", "This is permanent. Slot NFTs will be destroyed. Type exactly:") +
      " <strong>" +
      phrase +
      "</strong></p>" +
      '<input type="text" class="eaz-artifacts-mint-modal__phrase" id="eaz-artifacts-mint-phrase" autocomplete="off" />' +
      '<p class="eaz-artifacts-mint-modal__status" id="eaz-artifacts-mint-status" hidden></p>' +
      '<div class="eaz-artifacts-mint-modal__actions">' +
      '<button type="button" class="eazy-games-btn" id="eaz-artifacts-mint-cancel">' +
      t("eazy_chat.cancel", "Cancel") +
      "</button>" +
      '<button type="button" class="eazy-games-btn eazy-games-btn--filled" id="eaz-artifacts-mint-confirm">' +
      t("eazy_chat.artifacts_mint_character", "Mint Character") +
      "</button></div></div>";
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeMintOverlay();
    });
    document.getElementById("eaz-artifacts-mint-cancel").addEventListener("click", closeMintOverlay);

    document.getElementById("eaz-artifacts-mint-confirm").addEventListener("click", function () {
      var typed = (document.getElementById("eaz-artifacts-mint-phrase").value || "").trim();
      if (typed !== phrase) {
        alert(t("eazy_chat.artifacts_mint_phrase_mismatch", "Confirmation phrase does not match."));
        return;
      }
      var statusEl = document.getElementById("eaz-artifacts-mint-status");
      var confirmBtn = document.getElementById("eaz-artifacts-mint-confirm");
      var fileInput = document.getElementById("eaz-artifacts-mint-photo");
      var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

      confirmBtn.disabled = true;
      statusEl.hidden = false;
      statusEl.textContent = t("eazy_chat.artifacts_mint_generating", "Creating your character…");

      var referencePromise = file ? uploadMintReference(file) : Promise.resolve(null);
      referencePromise
        .then(function (uploadRes) {
          if (file && (!uploadRes || !uploadRes.ok)) {
            throw new Error((uploadRes && uploadRes.error) || "upload_failed");
          }
          var prepareBody = {};
          if (uploadRes && uploadRes.image_url) prepareBody.reference_image_url = uploadRes.image_url;
          return postOp("artifacts-mint-prepare", prepareBody);
        })
        .then(function (prep) {
          if (!prep || !prep.ok) throw new Error((prep && prep.error) || "Cannot mint");
          return postOp("artifacts-mint-character", {
            mint_intent_id: prep.mint_intent_id,
            confirm_phrase: phrase,
          });
        })
        .then(function (res) {
          if (res && res.ok) {
            closeMintOverlay();
            alert(t("eazy_chat.artifacts_mint_success", "Character minted!"));
            if (window.EazArtifactsHub) {
              window.EazArtifactsHub.setSection("collection");
              window.EazArtifactsHub.refresh();
            }
          } else {
            throw new Error((res && res.error) || "Mint failed");
          }
        })
        .catch(function (err) {
          statusEl.textContent = err && err.message ? err.message : "Mint failed";
          confirmBtn.disabled = false;
        });
    });
  }

  window.EazArtifactsOutfit = {
    render: render,
    setLoadout: function (data) {
      loadout = { slots: data.slots || {}, visibility: data.visibility || {} };
    },
    setStatus: function (data) {
      setStatus = data;
    },
  };
})();
