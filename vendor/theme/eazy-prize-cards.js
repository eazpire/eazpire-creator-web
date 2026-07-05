/**
 * Eazy Prize Card renderer — 1:1 full-bleed artwork, rarity tint + frame, overlay UI.
 * Artwork: admin upload via artwork_r2_key (placeholder / empty when unset).
 */
(function () {
  "use strict";

  var CLASS_ICON = { shop: "🛍", creator: "✦", eazy: "⚡", special: "★" };

  var STAT_LABELS = {
    utility: "UTL",
    luck: "LCK",
    craft: "CRF",
    charm: "CHM",
    power: "PWR",
  };

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseMeta(item) {
    if (item.metadata && typeof item.metadata === "object") return item.metadata;
    if (item.metadata_json) {
      try {
        return typeof item.metadata_json === "string" ? JSON.parse(item.metadata_json) : item.metadata_json;
      } catch (_e) {}
    }
    return {};
  }

  function publicFileBase() {
    if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.PUBLIC_FILE_BASE_URL) {
      return String(window.CREATOR_API_CONFIG.PUBLIC_FILE_BASE_URL).replace(/\/$/, "");
    }
    if (window.CREATOR_API_CONFIG && window.CREATOR_API_CONFIG.BASE_URL) {
      return String(window.CREATOR_API_CONFIG.BASE_URL).replace(/\/$/, "");
    }
    return "https://creator-engine.eazpire.workers.dev";
  }

  function encodeR2KeyPath(key) {
    return String(key || "")
      .replace(/^\//, "")
      .split("/")
      .map(function (segment) {
        return encodeURIComponent(segment);
      })
      .join("/");
  }

  function artworkUrl(key) {
    if (!key) return null;
    var k = String(key).trim();
    if (!k) return null;
    if (/^https?:\/\//i.test(k)) return k;
    var base = publicFileBase();
    if (k.indexOf("/file/") === 0) return base + k;
    if (k.indexOf("file/") === 0) return base + "/" + k;
    return base + "/file/" + encodeR2KeyPath(k);
  }

  function randomPreviewUrl(item) {
    var seed = String(item.slug || item.name || item.id || "eazy-prize").replace(/\s+/g, "-");
    return "https://picsum.photos/seed/" + encodeURIComponent(seed) + "/480/480";
  }

  function rarityKey(r) {
    var s = String(r || "common").toLowerCase();
    if (s === "common" || s === "uncommon" || s === "rare" || s === "epic" || s === "legendary") return s;
    return "common";
  }

  function classKey(cat) {
    var s = String(cat || "special").toLowerCase();
    if (s === "shop" || s === "creator" || s === "eazy" || s === "special") return s;
    return "special";
  }

  function effectTag(item) {
    if (item.type === "card") {
      var count = item.owned_count != null ? Number(item.owned_count) : 1;
      var need = item.fusion_count != null ? Number(item.fusion_count) : 4;
      if (count > 1) return "Collectible " + count + "/" + need;
      return "Collectible";
    }
    var mode = String(item.fulfillment_mode || "");
    if (mode === "instant_shopify_gc") return "Instant GC";
    if (mode === "on_redeem_shopify_gc") return "On redeem";
    if (mode === "entitlement") return item.subtype || "Entitlement";
    if (mode === "cosmetic") return "Cosmetic";
    if (mode === "trade_token") return "Trade token";
    return item.subtype || "Prize";
  }

  function giftCardOverlay(item, meta) {
    if (item.type !== "prize") return null;
    var mode = String(item.fulfillment_mode || "");
    if (mode !== "instant_shopify_gc" && mode !== "on_redeem_shopify_gc") return null;
    var amount = null;
    if (item.metadata && item.metadata.amount) amount = item.metadata.amount;
    else if (meta && meta.amount) amount = meta.amount;
    if (!amount) return null;
    var num = String(amount).replace(/\.00$/, "");
    return "€" + num + "\nGIFT CARD";
  }

  function resolveArtMode(item, opts) {
    if (opts.artMode) return opts.artMode;
    if (opts.prizeView && (item.price_artwork_r2_key || item.artwork_r2_key)) return "upload";
    if (item.artwork_r2_key) return "upload";
    return "placeholder";
  }

  function resolveArtworkKey(item, opts) {
    if (opts.prizeView && item.price_artwork_r2_key) return item.price_artwork_r2_key;
    return item.artwork_r2_key;
  }

  function backgroundHtml(item, opts) {
    var mode = resolveArtMode(item, opts);
    var uploaded = artworkUrl(resolveArtworkKey(item, opts));

    if (mode === "upload" && uploaded) {
      return (
        '<div class="eazy-prize-card__bg eazy-prize-card__bg--image">' +
        '<img src="' +
        esc(uploaded) +
        '" alt="" loading="lazy" decoding="async" />' +
        "</div>"
      );
    }

    if (mode === "random") {
      return (
        '<div class="eazy-prize-card__bg eazy-prize-card__bg--image">' +
        '<img src="' +
        esc(randomPreviewUrl(item)) +
        '" alt="" loading="lazy" decoding="async" />' +
        "</div>"
      );
    }

    if (mode === "none") {
      return '<div class="eazy-prize-card__bg eazy-prize-card__bg--empty" aria-hidden="true"></div>';
    }

    return (
      '<div class="eazy-prize-card__bg eazy-prize-card__bg--placeholder" aria-hidden="true">' +
      '<span class="eazy-prize-card__placeholder-label">Image coming soon</span>' +
      "</div>"
    );
  }

  function statsHtml(meta) {
    var stats = meta && meta.stats;
    if (!stats || typeof stats !== "object") return "";
    var parts = [];
    Object.keys(STAT_LABELS).forEach(function (key) {
      if (stats[key] == null) return;
      var val = Number(stats[key]);
      if (!Number.isFinite(val) || val <= 0) return;
      parts.push(
        '<span class="eazy-prize-card__stat eazy-prize-card__stat--' +
          key +
          '">' +
          STAT_LABELS[key] +
          " " +
          val +
          "</span>"
      );
    });
    if (!parts.length) return "";
    return '<div class="eazy-prize-card__stats">' + parts.join("") + "</div>";
  }

  function adminControlsHtml(opts) {
    if (!opts.adminMode) return "";
    var lootId = opts.lootEntryId != null ? Number(opts.lootEntryId) : 0;
    return (
      '<div class="eazy-prize-card__admin">' +
      '<button type="button" class="eazy-prize-card__upload-btn" data-def-type="' +
      esc(opts.definitionType || "") +
      '" data-def-id="' +
      esc(String(opts.definitionId || "")) +
      '" aria-label="Upload artwork" title="Upload artwork">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M9 16h6v-1.5H9V16Zm0-3h6v-1.5H9V13Zm3-8.5L5 11v9h14v-9L12 4.5ZM7 18.5v-6.8l5-3.7 5 3.7v6.8H7Z"/>' +
      "</svg>" +
      "</button>" +
      (lootId
        ? '<label class="eazy-prize-card__active-toggle">' +
          '<input type="checkbox" class="eazy-prize-card__active-input" data-loot-id="' +
          lootId +
          '"' +
          (opts.lootActive ? " checked" : "") +
          " />" +
          "<span>Active</span></label>"
        : "") +
      "</div>"
    );
  }

  function centerValueHtml(overlay) {
    if (!overlay) return "";
    return (
      '<div class="eazy-prize-card__center-value">' +
      esc(overlay).replace(/\n/g, "<br>") +
      "</div>"
    );
  }

  /**
   * @param {object} item — inventory item (prize or card)
   * @param {{ actionsHtml?: string, artMode?: 'upload'|'placeholder'|'none'|'random' }} [opts]
   * @returns {string}
   */
  function buildCardInnerHtml(item, opts) {
    opts = opts || {};
    var meta = parseMeta(item);
    var cls = classKey(item.category || meta.class);
    var name = item.name || item.slug || "Prize";
    var desc = item.description || meta.description || "";
    var overlay = giftCardOverlay(item, meta);
    var actions = opts.actionsHtml || "";
    var rarity = rarityKey(item.rarity);

    return (
      '<div class="eazy-prize-card__canvas">' +
      backgroundHtml(item, opts) +
      '<div class="eazy-prize-card__rarity-tint" aria-hidden="true"></div>' +
      centerValueHtml(overlay) +
      '<div class="eazy-prize-card__overlay">' +
      adminControlsHtml(opts) +
      '<div class="eazy-prize-card__head">' +
      '<span class="eazy-prize-card__class-icon" aria-hidden="true" title="' +
      esc(cls) +
      '">' +
      (CLASS_ICON[cls] || "★") +
      "</span>" +
      '<span class="eazy-prize-card__rarity-badge">' +
      esc(rarity) +
      "</span>" +
      "</div>" +
      '<div class="eazy-prize-card__overlay-bottom">' +
      statsHtml(meta) +
      '<div class="eazy-prize-card__title">' +
      esc(name) +
      "</div>" +
      (desc ? '<div class="eazy-prize-card__sub">' + esc(desc) + "</div>" : "") +
      '<div class="eazy-prize-card__foot">' +
      '<span class="eazy-prize-card__tag">' +
      esc(effectTag(item)) +
      "</span>" +
      "</div>" +
      (actions ? '<div class="eazy-prize-card__actions">' + actions + "</div>" : "") +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function applyCardElement(el, item, opts) {
    opts = opts || {};
    var rarity = rarityKey(item.rarity);
    var cls = classKey(item.category || parseMeta(item).class);
    var artMode = resolveArtMode(item, opts);

    el.className = "eazy-games-collection__card eazy-prize-card";
    if (opts.extraClass) el.className += " " + opts.extraClass;
    if (opts.adminMode) el.className += " eazy-prize-card--admin";
    if (item.fusion_ready) el.className += " eazy-prize-card--fusion-ready";
    el.setAttribute("data-rarity", rarity);
    el.setAttribute("data-class", cls);
    el.setAttribute("data-art-mode", artMode);
    el.innerHTML = buildCardInnerHtml(item, opts);
    return el;
  }

  window.EazyPrizeCards = {
    buildCardInnerHtml: buildCardInnerHtml,
    applyCardElement: applyCardElement,
    artworkUrl: artworkUrl,
    parseMeta: parseMeta,
    rarityKey: rarityKey,
    classKey: classKey,
    randomPreviewUrl: randomPreviewUrl,
    CLASS_ICON: CLASS_ICON,
  };
})();
