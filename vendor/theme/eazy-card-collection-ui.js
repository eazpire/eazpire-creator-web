/**
 * Eazy Card Collection UI
 * Shared dialogs + token footer for web games collection flows.
 */
(function () {
  "use strict";

  var cfg = {
    t: function (_k, fallback) {
      return fallback;
    },
    ownerId: function () {
      return null;
    },
    refreshCollection: function () {},
    refreshExchange: function () {},
  };
  var reviewState = null;

  function t(key, fallback) {
    return cfg.t ? cfg.t(key, fallback) : fallback;
  }

  function q(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function internals() {
    return window.EazyGamesHubInternals || null;
  }

  function fetchOp(op, params) {
    var i = internals();
    if (!i || typeof i.fetchOp !== "function") return Promise.resolve({ ok: false, error: "missing_internals" });
    return i.fetchOp(op, params || {});
  }

  function postOp(op, body, queryExtra) {
    var i = internals();
    if (!i || typeof i.postOp !== "function") return Promise.resolve({ ok: false, error: "missing_internals" });
    return i.postOp(op, body || {}, queryExtra || undefined);
  }

  var CARD_DIALOG_IDS = [
    "eazy-card-viewer-modal",
    "eazy-card-market-modal",
    "eazy-card-send-friend-modal",
    "eazy-card-trade-review-modal",
  ];

  function closeDialog(id) {
    var el = q(id);
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  }

  function closeAllDialogs(exceptId) {
    CARD_DIALOG_IDS.forEach(function (dialogId) {
      if (dialogId !== exceptId) closeDialog(dialogId);
    });
  }

  function openDialog(id) {
    var el = q(id);
    if (!el) return false;
    closeAllDialogs(id);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    return true;
  }

  function bindDialogChrome(id) {
    var dialog = q(id);
    if (!dialog || dialog.dataset.bound) return;
    dialog.dataset.bound = "1";
    dialog.querySelectorAll("[data-cards-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeDialog(id);
      });
    });
  }

  function setTokenFooter(payload) {
    var host = q("eazy-card-token-footer");
    if (!host) return;
    var bal = Number(payload && payload.balance) || 0;
    var cost = Number(payload && payload.tradeCost) || 0;
    host.innerHTML =
      '<p class="eazy-card-token-footer__label">' +
      esc(t("eazy_chat.cards_token_footer_title", "Trade tokens")) +
      '</p><p class="eazy-card-token-footer__value">' +
      esc(String(bal)) +
      '</p><p class="eazy-card-token-footer__sub">' +
      esc(t("eazy_chat.cards_token_footer_cost", "Trade cost per completed swap: {{n}}").replace(/\{\{n\}\}/g, String(cost || 0))) +
      "</p>";
  }

  function bindCollectionCard(cardEl, item) {
    if (!cardEl || !item || cardEl.dataset.viewerBound) return;
    cardEl.dataset.viewerBound = "1";
    cardEl.addEventListener("click", function (e) {
      if (e.target.closest("[data-action]")) return;
      openCardViewerModal(item);
    });
  }

  function openCardViewerModal(item) {
    bindDialogChrome("eazy-card-viewer-modal");
    var titleEl = q("eazy-card-viewer-title");
    var mount = q("eazy-card-viewer-card");
    var meta = q("eazy-card-viewer-meta");
    if (titleEl) titleEl.textContent = item.name || item.slug || t("eazy_chat.cards_viewer_default_title", "Card");
    if (mount) {
      mount.innerHTML = "";
      var cardEl = document.createElement("article");
      if (window.EazyPrizeCards && typeof window.EazyPrizeCards.applyCardElement === "function") {
        window.EazyPrizeCards.applyCardElement(cardEl, item, {
          prizeView: item.type === "prize",
          extraClass: "eazy-prize-card--viewer-modal",
        });
      } else {
        cardEl.className = "eazy-games-collection__card";
        cardEl.textContent = item.name || item.slug || "Card";
      }
      mount.appendChild(cardEl);
    }
    if (meta) {
      meta.textContent =
        item.type === "card"
          ? t("eazy_chat.cards_viewer_meta_card", "Collect 4 matching cards to fuse into the linked prize.")
          : t("eazy_chat.cards_viewer_meta_prize", "Prize item in your collection.");
    }
    openDialog("eazy-card-viewer-modal");
  }

  function openExchangeMarketModal(listingId, opts) {
    bindDialogChrome("eazy-card-market-modal");
    var ownerId = cfg.ownerId && cfg.ownerId();
    if (!ownerId) return;
    var list = q("eazy-card-market-offer-list");
    var status = q("eazy-card-market-status");
    if (list) list.innerHTML = "";
    if (status) status.textContent = t("eazy_chat.common_loading", "Loading…");
    openDialog("eazy-card-market-modal");
    postOp("prizes-inventory-list", {
      owner_id: ownerId,
      type: "card",
      category: "all",
      group: 1,
    }).then(function (data) {
      if (!list || !status) return;
      if (!data || !data.ok) {
        status.textContent = t("eazy_chat.cards_market_error", "Could not load your cards.");
        return;
      }
      var cards = (data.items || []).filter(function (it) {
        return it.type === "card" && it.instance_ids && it.instance_ids.length;
      });
      if (!cards.length) {
        status.textContent = t("eazy_chat.cards_market_empty", "No tradable cards available.");
        return;
      }
      status.textContent = "";
      list.innerHTML = cards
        .map(function (it) {
          var iid = Number(it.instance_ids[0] || 0);
          return (
            '<button type="button" class="eazy-games-btn eazy-games-btn--ghost" data-market-offer-instance="' +
            iid +
            '">' +
            esc(it.name || it.slug || "Card") +
            "</button>"
          );
        })
        .join("");
      list.querySelectorAll("[data-market-offer-instance]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var instanceId = Number(btn.getAttribute("data-market-offer-instance"));
          if (!instanceId) return;
          postOp("prizes-trade-offer", {
            owner_id: ownerId,
            action: "create",
            listing_id: listingId,
            instance_type: "card",
            instance_id: instanceId,
          }).then(function (res) {
            if (res && res.ok) {
              status.textContent = t("eazy_chat.cards_market_success", "Offer sent.");
              if (opts && typeof opts.onSubmitted === "function") opts.onSubmitted(res);
              closeDialog("eazy-card-market-modal");
            } else {
              status.textContent = t("eazy_chat.cards_market_fail", "Could not send offer.");
            }
          });
        });
      });
    });
  }

  function openSendFriendModal(listingId) {
    bindDialogChrome("eazy-card-send-friend-modal");
    var text = q("eazy-card-send-friend-text");
    if (text) {
      text.textContent = t(
        "eazy_chat.cards_send_friend_text",
        "Share this trade review deep-link with a friend:"
      );
    }
    var input = q("eazy-card-send-friend-input");
    var deep = window.location.origin + window.location.pathname + "#eazy/games/collection?trade_offer=" + listingId;
    if (input) input.value = deep;
    var copy = q("eazy-card-send-friend-copy");
    if (copy && !copy.dataset.bound) {
      copy.dataset.bound = "1";
      copy.addEventListener("click", function () {
        var value = input ? input.value : "";
        if (!value) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(value).catch(function () {});
        } else {
          window.prompt(t("eazy_chat.cards_send_friend_copy_prompt", "Copy link"), value);
        }
      });
    }
    openDialog("eazy-card-send-friend-modal");
  }

  function paintTradeReviewModal(offer, statusEl, opts) {
    var label = offer && (offer.offered_label || ("#" + offer.offered_instance_id)) || "";
    var body = q("eazy-card-trade-review-body");
    if (body) {
      body.innerHTML =
        '<p class="eazy-card-trade-review__label">' +
        esc(t("eazy_chat.exchange_trade_offer_for", "Offer for your listing")) +
        ": <strong>" +
        esc(label) +
        "</strong></p>";
    }
    var accept = q("eazy-card-trade-review-accept");
    var decline = q("eazy-card-trade-review-decline");
    if (accept) {
      accept.onclick = function () {
        var ownerId = cfg.ownerId && cfg.ownerId();
        if (!ownerId) return;
        postOp("prizes-trade-offer", { owner_id: ownerId, action: "accept", offer_id: Number(offer.id) }).then(function (res) {
          if (res && res.ok) {
            closeDialog("eazy-card-trade-review-modal");
            if (opts && typeof opts.onUpdated === "function") opts.onUpdated(res);
            cfg.refreshExchange();
            cfg.refreshCollection();
          } else if (statusEl) {
            statusEl.textContent = t("eazy_chat.cards_trade_review_fail", "Could not update offer.");
          }
        });
      };
    }
    if (decline) {
      decline.onclick = function () {
        var ownerId = cfg.ownerId && cfg.ownerId();
        if (!ownerId) return;
        postOp("prizes-trade-offer", { owner_id: ownerId, action: "decline", offer_id: Number(offer.id) }).then(function (res) {
          if (res && res.ok) {
            closeDialog("eazy-card-trade-review-modal");
            if (opts && typeof opts.onUpdated === "function") opts.onUpdated(res);
            cfg.refreshExchange();
          } else if (statusEl) {
            statusEl.textContent = t("eazy_chat.cards_trade_review_fail", "Could not update offer.");
          }
        });
      };
    }
  }

  function openTradeReviewModal(offerId, opts) {
    bindDialogChrome("eazy-card-trade-review-modal");
    var ownerId = cfg.ownerId && cfg.ownerId();
    if (!ownerId) return;
    var statusEl = q("eazy-card-trade-review-status");
    if (statusEl) statusEl.textContent = t("eazy_chat.common_loading", "Loading…");
    openDialog("eazy-card-trade-review-modal");
    fetchOp("prizes-trade-my-offers", { owner_id: ownerId }).then(function (data) {
      if (!data || !data.ok) {
        if (statusEl) statusEl.textContent = t("eazy_chat.cards_trade_review_error", "Could not load offer.");
        return;
      }
      var incoming = data.incoming || [];
      var offer = incoming.find(function (o) {
        return Number(o.id) === Number(offerId);
      });
      if (!offer) {
        if (statusEl) statusEl.textContent = t("eazy_chat.cards_trade_review_missing", "Offer no longer available.");
        return;
      }
      reviewState = offer;
      if (statusEl) statusEl.textContent = "";
      paintTradeReviewModal(offer, statusEl, opts || {});
    });
  }

  function init(options) {
    cfg = Object.assign({}, cfg, options || {});
    bindDialogChrome("eazy-card-viewer-modal");
    bindDialogChrome("eazy-card-market-modal");
    bindDialogChrome("eazy-card-send-friend-modal");
    bindDialogChrome("eazy-card-trade-review-modal");
  }

  window.EazyCardCollectionUI = {
    init: init,
    bindCollectionCard: bindCollectionCard,
    setTokenFooter: setTokenFooter,
    openCardViewerModal: openCardViewerModal,
    openExchangeMarketModal: openExchangeMarketModal,
    openSendFriendModal: openSendFriendModal,
    openTradeReviewModal: openTradeReviewModal,
    closeAllDialogs: closeAllDialogs,
    getTradeReviewState: function () {
      return reviewState;
    },
  };
})();
