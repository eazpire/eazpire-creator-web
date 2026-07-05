/**
 * Eazy Games Hub — Collection & Exchange (Play stays in creator-chat-widget.js)
 */
(function () {
  "use strict";

  var SECTION = "play";
  var collectionFilterCategory = "all";
  var collectionFilterType = "card";
  var exchangeTab = "market";
  var inviteTab = "friends";

  var HEART_ICON =
    '<svg class="eazy-games-invite__heart" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  function apiBase() {
    return window.CREATOR_API_BASE || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  }

  function shopDomain() {
    return window.CREATOR_SHOP_DOMAIN || "eazpire.myshopify.com";
  }

  function isCustomerLoggedIn() {
    if (window.__EAZY_GUEST) return false;
    if (window.__EAZ_OWNER_ID) return true;
    if (window.__creatorSettingsUserLoggedIn) return true;
    if (window.Shopify && window.Shopify.customerId) return true;
    if (window.logged_in_customer_id) return true;
    return false;
  }

  function ownerId() {
    if (window.__EAZ_OWNER_ID) return String(window.__EAZ_OWNER_ID).trim();
    if (window.Shopify && window.Shopify.customerId) {
      return String(window.Shopify.customerId).trim();
    }
    if (window.__creatorOwnerId) return String(window.__creatorOwnerId).trim();
    if (window.logged_in_customer_id) return String(window.logged_in_customer_id).trim();
    if (window.EazyBot && typeof window.EazyBot.getUserId === "function") {
      var botId = window.EazyBot.getUserId();
      if (botId) return String(botId).trim();
    }
    return null;
  }

  function fetchOp(op, params, opts) {
    var url = apiBase() + "?op=" + encodeURIComponent(op) + "&shop=" + encodeURIComponent(shopDomain());
    if (params) {
      Object.keys(params).forEach(function (k) {
        url += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      });
    }
    var init = opts || { credentials: "include" };
    return fetch(url, init).then(function (r) {
      return r.json();
    });
  }

  function postOp(op, body, queryExtra) {
    var url = apiBase() + "?op=" + encodeURIComponent(op) + "&shop=" + encodeURIComponent(shopDomain());
    if (queryExtra) {
      Object.keys(queryExtra).forEach(function (k) {
        url += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(queryExtra[k]);
      });
    }
    return fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json();
    });
  }

  window.EazyGamesHubInternals = {
    fetchOp: fetchOp,
    postOp: postOp,
  };

  function confirmAction(opts, onConfirm) {
    if (window.EazySettings && typeof window.EazySettings.showConfirm === "function") {
      window.EazySettings.showConfirm(opts, onConfirm);
      return;
    }
    var msg = (opts.title || "") + "\n\n" + (opts.text || "");
    if (window.confirm(msg)) onConfirm();
  }

  function listItemOnMarket(oid, type, id, onDone) {
    postOp("prizes-trade-listings", {
      owner_id: oid,
      instance_type: type,
      instance_id: id,
      wishlist: [],
    }).then(function (data) {
      if (data && data.ok) {
        exchangeTab = "my_listings";
        if (typeof onDone === "function") onDone();
        refreshExchange();
      }
    });
  }

  function setGamesSection(section) {
    SECTION = section || "play";
    document.querySelectorAll("[data-games-section]").forEach(function (btn) {
      var on = btn.getAttribute("data-games-section") === SECTION;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("[data-games-panel]").forEach(function (panel) {
      var on = panel.getAttribute("data-games-panel") === SECTION;
      panel.classList.toggle("is-active", on);
      panel.hidden = !on;
    });
    if (SECTION === "collection") refreshCollection();
    if (SECTION === "exchange") refreshExchange();
    if (SECTION === "friends") refreshFriends();
    if (SECTION === "community") refreshCommunity();
    if (SECTION === "play" && typeof window.refreshEazyGamesView === "function") {
      window.refreshEazyGamesView();
    }
    if (SECTION !== "collection") {
      window.__eazyCollectionHighlightOnce = null;
    }
  }

  function parseCollectionHashDeepLink() {
    var raw = String(window.location.hash || "").replace(/^#/, "");
    if (!raw) return null;
    var normalized = raw.indexOf("eazy/games/collection") === 0 ? raw : raw.replace(/^\/+/, "");
    if (normalized.indexOf("eazy/games/collection") !== 0) return null;
    var qIndex = normalized.indexOf("?");
    var query = qIndex >= 0 ? normalized.slice(qIndex + 1) : "";
    var params = new URLSearchParams(query);
    var offerId = Number(params.get("trade_offer") || "");
    return {
      offerId: Number.isFinite(offerId) && offerId > 0 ? offerId : null,
    };
  }

  function navigateCollectionDeepLink(force) {
    var deep = parseCollectionHashDeepLink();
    if (!deep) return false;
    if (force || SECTION !== "collection") setGamesSection("collection");
    if (
      deep.offerId &&
      window.EazyCardCollectionUI &&
      typeof window.EazyCardCollectionUI.openTradeReviewModal === "function"
    ) {
      window.EazyCardCollectionUI.openTradeReviewModal(deep.offerId);
    }
    return true;
  }

  function initSubnav() {
    var root = document.getElementById("eazy-games-carousel");
    if (!root || root.dataset.bound) return;
    root.dataset.bound = "1";
    root.querySelectorAll("[data-games-section]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setGamesSection(btn.getAttribute("data-games-section"));
      });
    });
    if (window.EazyCardCollectionUI && typeof window.EazyCardCollectionUI.init === "function") {
      window.EazyCardCollectionUI.init({
        t: t,
        ownerId: ownerId,
        isCustomerLoggedIn: isCustomerLoggedIn,
        setGamesSection: setGamesSection,
        refreshCollection: refreshCollection,
        refreshExchange: refreshExchange,
        confirmAction: confirmAction,
      });
    }
    var params = new URLSearchParams(window.location.search);
    var sec = params.get("games_section");
    if (sec === "collection" || sec === "exchange" || sec === "play" || sec === "friends" || sec === "invite") {
      setGamesSection(sec === "invite" ? "friends" : sec);
    } else {
      if (!navigateCollectionDeepLink(true)) setGamesSection("play");
    }
    window.addEventListener("hashchange", function () {
      navigateCollectionDeepLink(true);
    });
  }

  var CATEGORY_ICONS = { all: "⊞", shop: "🛍", creator: "✦", eazy: "⚡", special: "★" };
  var TYPE_ICONS = { card: "🃏", prize: "🏆" };

  function capitalizeLabel(s) {
    if (!s || s === "all") return t("eazy_chat.prizes_filter_all", "All");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function renderCollectionFilters() {
    var host = document.getElementById("eazy-games-collection-filters");
    if (!host) return;
    var cats = ["all", "shop", "creator", "eazy", "special"];
    var types = ["card", "prize"];
    var html = '<div class="eazy-games-collection__filter-row">';
    cats.forEach(function (c) {
      var label = capitalizeLabel(c);
      var icon = CATEGORY_ICONS[c] || "";
      html +=
        '<button type="button" class="eazy-games-chip' +
        (collectionFilterCategory === c ? " is-active" : "") +
        '" data-col-cat="' +
        c +
        '">' +
        (icon ? '<span class="eazy-games-chip__icon" aria-hidden="true">' + icon + "</span>" : "") +
        label +
        "</button>";
    });
    html += '</div><div class="eazy-games-collection__filter-row">';
    types.forEach(function (ty) {
      var label =
        ty === "prize"
          ? t("eazy_chat.prizes_filter_prizes", "Prizes")
          : t("eazy_chat.prizes_filter_cards", "Cards");
      var icon = TYPE_ICONS[ty] || "";
      html +=
        '<button type="button" class="eazy-games-chip' +
        (collectionFilterType === ty ? " is-active" : "") +
        '" data-col-type="' +
        ty +
        '">' +
        (icon ? '<span class="eazy-games-chip__icon" aria-hidden="true">' + icon + "</span>" : "") +
        label +
        "</button>";
    });
    html += "</div>";
    host.innerHTML = html;
    host.querySelectorAll("[data-col-cat]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        collectionFilterCategory = btn.getAttribute("data-col-cat");
        refreshCollection();
      });
    });
    host.querySelectorAll("[data-col-type]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        collectionFilterType = btn.getAttribute("data-col-type");
        refreshCollection();
      });
    });
  }

  function playFusionAnimation(rarity, onDone) {
    var overlay = document.createElement("div");
    overlay.className = "eazy-fusion-overlay eazy-fusion-overlay--" + (rarity || "common");
    overlay.innerHTML =
      '<div class="eazy-fusion-overlay__burst"></div><div class="eazy-fusion-overlay__label">' +
      t("eazy_chat.prizes_fusion_animating", "Fusion complete!") +
      "</div>";
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add("is-active");
    });
    setTimeout(function () {
      overlay.classList.add("is-done");
      setTimeout(function () {
        overlay.remove();
        if (typeof onDone === "function") onDone();
      }, 400);
    }, 1400);
  }

  function openFusionConfirm(item, oid) {
    confirmAction(
      {
        iconClass: "eazy-confirm__icon--warning",
        title: t("eazy_chat.prizes_confirm_fusion_title", "Fuse these cards?"),
        text: t(
          "eazy_chat.prizes_confirm_fusion_text",
          "Combine 4 matching cards into your prize. Fused cards can no longer be traded."
        ),
        confirmLabel: t("eazy_chat.prizes_fusion_confirm", "Fuse"),
      },
      function () {
        postOp("prizes-fuse", {
          owner_id: oid,
          card_definition_id: item.card_definition_id,
          instance_ids: item.instance_ids || [],
        }).then(function (data) {
          if (!data || !data.ok) return;
          playFusionAnimation(item.rarity, function () {
            collectionFilterType = "prize";
            refreshCollection();
          });
        });
      }
    );
  }

  function renderCollectionItem(item) {
    var card = document.createElement("article");
    var meta = window.EazyPrizeCards && window.EazyPrizeCards.parseMeta(item);
    if (meta && !item.description && meta.description) {
      item = Object.assign({}, item, { description: meta.description });
    }
    var listId =
      item.type === "card" && item.instance_ids && item.instance_ids.length
        ? item.instance_ids[0]
        : item.id;
    var actionsHtml =
      (item.type === "prize" && item.fulfillment_mode !== "trade_token"
        ? '<button type="button" class="eazy-games-btn eazy-games-btn--sm" data-action="redeem" data-id="' +
          item.id +
          '">' +
          t("eazy_chat.prizes_redeem", "Redeem") +
          "</button>"
        : "") +
      (item.type === "card" && !item.fusion_ready
        ? '<button type="button" class="eazy-games-btn eazy-games-btn--sm eazy-games-btn--ghost" data-action="list" data-type="' +
          item.type +
          '" data-id="' +
          listId +
          '">' +
          t("eazy_chat.exchange_list", "List") +
          "</button>"
        : "");
    var cardOpts = { actionsHtml: actionsHtml };
    if (item.type === "prize") cardOpts.prizeView = true;
    if (item.fusion_ready) cardOpts.extraClass = "eazy-prize-card--fusion-ready";
    if (window.EazyPrizeCards && typeof window.EazyPrizeCards.applyCardElement === "function") {
      window.EazyPrizeCards.applyCardElement(card, item, cardOpts);
    } else {
      card.className = "eazy-games-collection__card";
      card.textContent = item.name || item.slug || "Prize";
    }
    if (item.fusion_ready) {
      card.dataset.fusionReady = "1";
      card.dataset.cardDefId = String(item.card_definition_id || "");
    }
    return card;
  }

  function refreshCollection() {
    renderCollectionFilters();
    var grid = document.getElementById("eazy-games-collection-grid");
    var empty = document.getElementById("eazy-games-collection-empty");
    if (!grid) return;
    grid.innerHTML = "";
    var oid = ownerId();
    if (!oid) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = isCustomerLoggedIn()
          ? t("eazy_chat.prizes_collection_empty", "No prizes or cards yet. Play the daily game to win!")
          : t("eazy_chat.prizes_collection_login", "Sign in to view your collection.");
      }
      return;
    }
    if (empty) empty.hidden = true;
    var typeParam = collectionFilterType === "prize" ? "prize" : "card";
    var catParam = collectionFilterCategory === "all" ? "all" : collectionFilterCategory;
    postOp("prizes-inventory-list", {
      owner_id: oid,
      type: typeParam,
      category: catParam,
      group: typeParam === "card" ? 1 : 0,
    }).then(function (data) {
      if (!data || !data.ok) return;
      var items = data.items || [];
      if (items.length === 0) {
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      var highlight = window.__eazyCollectionHighlightOnce;
      if (highlight && highlight.id) {
        items.sort(function (a, b) {
          var aMatch =
            (highlight.type === "card" && a.card_instance_id === highlight.id) ||
            (highlight.type === "prize" && a.prize_instance_id === highlight.id);
          var bMatch =
            (highlight.type === "card" && b.card_instance_id === highlight.id) ||
            (highlight.type === "prize" && b.prize_instance_id === highlight.id);
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
          return 0;
        });
      }
      items.forEach(function (item) {
        var el = renderCollectionItem(item);
        if (highlight && highlight.id) {
          var match =
            (highlight.type === "card" && item.card_instance_id === highlight.id) ||
            (highlight.type === "prize" && item.prize_instance_id === highlight.id);
          if (match) el.classList.add("eazy-games-collection__item--highlight-pulse");
        }
        if (
          window.EazyCardCollectionUI &&
          typeof window.EazyCardCollectionUI.bindCollectionCard === "function"
        ) {
          window.EazyCardCollectionUI.bindCollectionCard(el, item, {
            ownerId: oid,
            onListed: function () {
              setGamesSection("exchange");
            },
            onUpdated: function () {
              refreshCollection();
            },
          });
        }
        grid.appendChild(el);
      });
      grid.querySelectorAll("[data-fusion-ready='1']").forEach(function (cardEl) {
        cardEl.addEventListener("click", function (e) {
          if (e.target.closest("[data-action]")) return;
          var defId = Number(cardEl.dataset.cardDefId);
          var match = (data.items || []).find(function (it) {
            return it.card_definition_id === defId && it.fusion_ready;
          });
          if (match) openFusionConfirm(match, oid);
        });
      });
      grid.querySelectorAll("[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var action = btn.getAttribute("data-action");
          var id = Number(btn.getAttribute("data-id"));
          var itemType = btn.getAttribute("data-type") || "prize";
          if (action === "redeem") {
            confirmAction(
              {
                iconClass: "eazy-confirm__icon--warning",
                title: t("eazy_chat.prizes_confirm_redeem_title", "Redeem this prize?"),
                text: t(
                  "eazy_chat.prizes_confirm_redeem_text",
                  "This will fulfill the prize to your account. This cannot be undone."
                ),
                confirmLabel: t("eazy_chat.prizes_redeem", "Redeem"),
              },
              function () {
                postOp("prizes-redeem", { owner_id: oid, instance_id: id }).then(function () {
                  refreshCollection();
                });
              }
            );
          } else if (action === "list") {
            confirmAction(
              {
                iconClass: "eazy-confirm__icon--warning",
                title: t("eazy_chat.prizes_confirm_list_title", "List on the exchange?"),
                text: t(
                  "eazy_chat.prizes_confirm_list_text",
                  "Your item will be listed on the marketplace for other players to trade."
                ),
                confirmLabel: t("eazy_chat.exchange_list", "List on exchange"),
              },
              function () {
                setGamesSection("exchange");
                listItemOnMarket(oid, itemType, id, function () {
                  refreshCollection();
                });
              }
            );
          }
        });
      });
    });
  }

  function setExchangeTab(tab) {
    exchangeTab = tab;
    document.querySelectorAll("[data-exchange-tab]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-exchange-tab") === tab);
    });
    document.querySelectorAll("[data-exchange-panel]").forEach(function (p) {
      var on = p.getAttribute("data-exchange-panel") === tab;
      p.hidden = !on;
    });
  }

  function refreshExchange() {
    var oid = ownerId();
    fetchOp("prizes-trade-tokens", { owner_id: oid || "" }).then(function (data) {
      var el = document.getElementById("eazy-games-exchange-tokens");
      if (el && data && data.ok) {
        el.textContent =
          t("eazy_chat.exchange_token_balance", "Trade tokens") + ": " + (data.balance || 0);
      }
      if (
        data &&
        data.ok &&
        window.EazyCardCollectionUI &&
        typeof window.EazyCardCollectionUI.setTokenFooter === "function"
      ) {
        window.EazyCardCollectionUI.setTokenFooter({
          balance: data.balance || 0,
          tradeCost: data.trade_cost || 0,
        });
      }
    });

    document.querySelectorAll("[data-exchange-tab]").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        setExchangeTab(btn.getAttribute("data-exchange-tab"));
        refreshExchangePanel(btn.getAttribute("data-exchange-tab"));
      });
    });

    setExchangeTab(exchangeTab);
    refreshExchangePanel(exchangeTab);
  }

  function refreshExchangePanel(tab) {
    if (tab === "market") renderExchangeMarket();
    if (tab === "my_listings") renderExchangeMyListings();
    if (tab === "trades") renderExchangeTrades();
  }

  function renderExchangeMarket() {
    var host = document.getElementById("eazy-games-exchange-market");
    if (!host) return;
    host.innerHTML = "<p class=\"eazy-games-loading\">" + t("eazy_chat.common_loading", "Loading…") + "</p>";
    fetchOp("prizes-trade-listings", { limit: 30 }).then(function (data) {
      host.innerHTML = "";
      if (!data || !data.ok || !(data.listings || []).length) {
        host.innerHTML =
          '<p class="eazy-games-empty">' + t("eazy_chat.exchange_no_listings", "No listings yet.") + "</p>";
        return;
      }
      data.listings.forEach(function (listing) {
        var card = document.createElement("article");
        card.className = "eazy-games-exchange__listing";
        var name = (listing.offered && listing.offered.name) || "Item #" + listing.offered_instance_id;
        card.innerHTML =
          "<h4>" +
          name +
          "</h4>" +
          '<button type="button" class="eazy-games-btn" data-offer-listing="' +
          listing.id +
          '">' +
          t("eazy_chat.exchange_make_offer", "Make offer") +
          '</button><button type="button" class="eazy-games-btn eazy-games-btn--ghost" data-send-listing="' +
          listing.id +
          '">' +
          t("eazy_chat.cards_send_friend", "Send to friend") +
          "</button>";
        host.appendChild(card);
      });
      host.querySelectorAll("[data-offer-listing]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var listingId = Number(btn.getAttribute("data-offer-listing"));
          if (!listingId) return;
          if (
            window.EazyCardCollectionUI &&
            typeof window.EazyCardCollectionUI.openExchangeMarketModal === "function"
          ) {
            window.EazyCardCollectionUI.openExchangeMarketModal(listingId, {
              onSubmitted: function () {
                refreshExchangePanel("market");
                refreshCollection();
              },
            });
          }
        });
      });
      host.querySelectorAll("[data-send-listing]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var listingId = Number(btn.getAttribute("data-send-listing"));
          if (!listingId) return;
          if (
            window.EazyCardCollectionUI &&
            typeof window.EazyCardCollectionUI.openSendFriendModal === "function"
          ) {
            window.EazyCardCollectionUI.openSendFriendModal(listingId);
          }
        });
      });
    });
  }

  function renderExchangeMyListings() {
    var host = document.getElementById("eazy-games-exchange-my-listings");
    if (!host) return;
    var oid = ownerId();
    host.innerHTML = "<p class=\"eazy-games-loading\">" + t("eazy_chat.common_loading", "Loading…") + "</p>";
    fetchOp("prizes-trade-listings", { limit: 50, seller_id: oid || "" }).then(function (data) {
      host.innerHTML = "";
      if (!data || !data.ok || !(data.listings || []).length) {
        host.innerHTML =
          '<p class="eazy-games-empty">' +
          t("eazy_chat.artifacts_my_listings_empty", "You have no active listings.") +
          "</p>";
        return;
      }
      data.listings.forEach(function (listing) {
        var card = document.createElement("article");
        card.className = "eazy-games-exchange__listing";
        var name = (listing.offered && listing.offered.name) || "Item #" + listing.offered_instance_id;
        card.innerHTML =
          "<h4>" +
          name +
          "</h4>" +
          '<button type="button" class="eazy-games-btn eazy-games-btn--ghost" data-cancel-listing="' +
          listing.id +
          '">' +
          t("eazy_chat.exchange_listing_cancel", "Remove listing") +
          "</button>";
        host.appendChild(card);
      });
      host.querySelectorAll("[data-cancel-listing]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var listingId = Number(btn.getAttribute("data-cancel-listing"));
          fetch(apiBase() + "?op=prizes-trade-listings&shop=" + encodeURIComponent(shopDomain()) + "&listing_id=" + listingId, {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner_id: oid, listing_id: listingId }),
          })
            .then(function (r) {
              return r.json();
            })
            .then(function () {
              renderExchangeMyListings();
              refreshCollection();
            });
        });
      });
    });
  }

  function renderExchangeTrades() {
    var host = document.getElementById("eazy-games-exchange-trades");
    if (!host) return;
    var oid = ownerId();
    host.innerHTML = "<p class=\"eazy-games-loading\">" + t("eazy_chat.common_loading", "Loading…") + "</p>";
    fetchOp("prizes-trade-my-offers", { owner_id: oid }).then(function (data) {
      if (!data || !data.ok) return;
      var incoming = data.incoming || [];
      if (!incoming.length) {
        host.innerHTML =
          '<p class="eazy-games-empty">' + t("eazy_chat.exchange_no_trades", "No trade offers yet.") + "</p>";
        return;
      }
      host.innerHTML = "";
      incoming.forEach(function (o) {
        var row = document.createElement("div");
        row.className = "eazy-games-offer";
        var label = o.offered_label || "Item #" + o.offered_instance_id;
        row.innerHTML =
          '<p class="eazy-games-offer__label">' +
          t("eazy_chat.exchange_trade_offer_for", "Offer for your listing") +
          ": <strong>" +
          label +
          "</strong></p>" +
          '<div class="eazy-games-offer__actions">' +
          '<button type="button" class="eazy-games-btn eazy-games-btn--sm eazy-games-btn--ghost" data-review="' +
          o.id +
          '">' +
          t("eazy_chat.cards_trade_review", "Review") +
          '</button>' +
          '<button type="button" class="eazy-games-btn eazy-games-btn--sm" data-accept="' +
          o.id +
          '">' +
          t("eazy_chat.exchange_accept", "Accept") +
          '</button><button type="button" class="eazy-games-btn eazy-games-btn--sm eazy-games-btn--ghost" data-decline="' +
          o.id +
          '">' +
          t("eazy_chat.exchange_decline", "Decline") +
          "</button></div>";
        host.appendChild(row);
      });
      host.querySelectorAll("[data-review]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var offerId = Number(btn.getAttribute("data-review"));
          if (!offerId) return;
          if (
            window.EazyCardCollectionUI &&
            typeof window.EazyCardCollectionUI.openTradeReviewModal === "function"
          ) {
            window.EazyCardCollectionUI.openTradeReviewModal(offerId, {
              onUpdated: function () {
                renderExchangeTrades();
                refreshCollection();
              },
            });
          }
        });
      });
      host.querySelectorAll("[data-accept]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          postOp("prizes-trade-offer", {
            owner_id: oid,
            action: "accept",
            offer_id: Number(btn.getAttribute("data-accept")),
          }).then(function () {
            renderExchangeTrades();
            refreshCollection();
          });
        });
      });
      host.querySelectorAll("[data-decline]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          postOp("prizes-trade-offer", {
            owner_id: oid,
            action: "decline",
            offer_id: Number(btn.getAttribute("data-decline")),
          }).then(function () {
            renderExchangeTrades();
          });
        });
      });
    });
  }

  function badgeLabel(badge) {
    if (badge === "creator") return t("eazy_chat.invite_badge_creator", "Creator");
    if (badge === "community") return t("eazy_chat.invite_badge_community", "Community");
    return t("eazy_chat.invite_badge_invited", "Invited");
  }

  function setInviteTab(tab) {
    inviteTab = tab || "friends";
    document.querySelectorAll("[data-invite-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-invite-tab") === inviteTab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-invite-panel]").forEach(function (panel) {
      var on = panel.getAttribute("data-invite-panel") === inviteTab;
      panel.hidden = !on;
    });
    if (inviteTab === "friends") renderInviteFriends();
    if (inviteTab === "requests") renderInviteRequests();
    if (inviteTab === "invites") renderLifeInvites();
  }

  function heartBtn(label, attrs, disabled) {
    return (
      '<button type="button" class="eazy-games-btn eazy-games-invite__life-btn"' +
      (disabled ? " disabled" : "") +
      " " +
      attrs +
      ">" +
      HEART_ICON +
      "<span>" +
      label +
      "</span></button>"
    );
  }

  function initInviteTabs() {
    var root = document.getElementById("eazy-games-invite-root");
    if (!root || root.dataset.tabsBound) return;
    root.dataset.tabsBound = "1";
    root.querySelectorAll("[data-invite-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setInviteTab(btn.getAttribute("data-invite-tab"));
      });
    });
    var shareBtn = document.getElementById("eazy-games-invite-share-btn");
    if (shareBtn && !shareBtn.dataset.bound) {
      shareBtn.dataset.bound = "1";
      shareBtn.addEventListener("click", function () {
        if (typeof window.ShareButtonOpenModal === "function") {
          window.ShareButtonOpenModal();
          return;
        }
        if (typeof window.ShareButtonResolveReferralMeta === "function") {
          window.ShareButtonResolveReferralMeta().then(function (meta) {
            if (meta && meta.url && navigator.share) {
              navigator.share({ title: "eazpire", url: meta.url }).catch(function () {});
            } else if (meta && meta.url) {
              window.prompt(t("eazy_chat.invite_copy_link", "Copy your invite link"), meta.url);
            }
          });
        }
      });
    }
  }

  function renderInviteFriendCard(friend) {
    var avatar = friend.profile_picture_url
      ? '<img class="eazy-games-invite__avatar" src="' + friend.profile_picture_url + '" alt="" loading="lazy">'
      : '<div class="eazy-games-invite__avatar eazy-games-invite__avatar--placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg></div>';
    var reqDisabled = !(friend.can_request_life || friend.can_request_game);
    var reqPending = friend.pending_life_request || friend.pending_request;
    var reqLabel = reqPending
      ? t("eazy_chat.invite_request_pending", "Pending")
      : t("eazy_chat.invite_request_game", "Request Life");
    var sendDisabled = friend.pending_sent_life || friend.can_send_life === false;
    var sendLabel = friend.pending_sent_life ? "Sent" : t("eazy_chat.invite_send_life", "Send Life");
    return (
      '<article class="eazy-games-invite__card" data-friend-id="' +
      friend.user_id +
      '">' +
      avatar +
      '<p class="eazy-games-invite__name">' +
      (friend.username || "") +
      "</p>" +
      '<span class="eazy-games-invite__badge eazy-games-invite__badge--' +
      (friend.invite_badge || "invited") +
      '">' +
      badgeLabel(friend.invite_badge) +
      "</span>" +
      '<p class="eazy-games-invite__stats">' +
      t("eazy_chat.invite_games_played", "Played") +
      ": " +
      (friend.games_played || 0) +
      " · " +
      t("eazy_chat.invite_games_won", "Won") +
      ": " +
      (friend.games_won || 0) +
      "</p>" +
      '<div class="eazy-games-invite__life-actions">' +
      heartBtn(reqLabel, 'data-request-life="' + friend.user_id + '"', reqDisabled || reqPending) +
      heartBtn(sendLabel, 'data-send-life="' + friend.user_id + '"', sendDisabled) +
      "</div></article>"
    );
  }

  function bindFriendCardActions(grid, oid) {
    grid.querySelectorAll("[data-request-life]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetId = btn.getAttribute("data-request-life");
        if (!targetId || btn.disabled) return;
        btn.disabled = true;
        postOp("create-games-play-request", { target_id: targetId }, { owner_id: oid }).then(function (res) {
          if (res && res.ok) renderInviteFriends();
          else btn.disabled = false;
        });
      });
    });
    grid.querySelectorAll("[data-send-life]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetId = btn.getAttribute("data-send-life");
        if (!targetId || btn.disabled) return;
        btn.disabled = true;
        var gameSlug =
          window.__eazySelectedGameSlug || window.__eazyTodayGameSlug || null;
        postOp(
          "send-games-life",
          { target_id: targetId, game_slug: gameSlug },
          { owner_id: oid }
        ).then(function (res) {
          if (res && res.ok) renderInviteFriends();
          else btn.disabled = false;
        });
      });
    });
  }

  function renderInviteFriends() {
    var grid = document.getElementById("eazy-games-invite-friends-grid");
    var empty = document.getElementById("eazy-games-invite-friends-empty");
    if (!grid) return;
    var oid = ownerId();
    if (!oid || !isCustomerLoggedIn()) {
      grid.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent = t("eazy_chat.games_login", "Sign in to play the daily game.");
      }
      return;
    }
    fetchOp("list-games-invite-friends", { owner_id: oid }).then(function (data) {
      if (!data || !data.ok) {
        grid.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      var friends = data.friends || [];
      if (!friends.length) {
        grid.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      grid.innerHTML = friends.map(renderInviteFriendCard).join("");
      bindFriendCardActions(grid, oid);
    });
  }

  function renderInviteRequests() {
    var list = document.getElementById("eazy-games-invite-requests-list");
    var empty = document.getElementById("eazy-games-invite-requests-empty");
    if (!list) return;
    var oid = ownerId();
    if (!oid || !isCustomerLoggedIn()) {
      list.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent = t("eazy_chat.games_login", "Sign in to play the daily game.");
      }
      return;
    }
    fetchOp("list-games-invite-requests", { owner_id: oid, status: "pending" }).then(function (data) {
      if (!data || !data.ok) {
        list.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      var requests = data.requests || [];
      if (!requests.length) {
        list.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      list.innerHTML = requests
        .map(function (req) {
          var avatar = req.requester_profile_picture_url
            ? '<img class="eazy-games-invite__avatar eazy-games-invite__avatar--sm" src="' +
              req.requester_profile_picture_url +
              '" alt="" loading="lazy">'
            : "";
          return (
            '<div class="eazy-games-invite__request-row" data-request-id="' +
            req.id +
            '">' +
            avatar +
            '<div class="eazy-games-invite__request-meta"><strong>' +
            (req.requester_username || "") +
            '</strong><span>' +
            "Requested a life" +
            "</span></div>" +
            '<div class="eazy-games-invite__request-actions">' +
            '<button type="button" class="eazy-games-btn" data-reject-request="' +
            req.id +
            '">' +
            t("eazy_chat.invite_request_reject", "Reject") +
            "</button>" +
            '<button type="button" class="eazy-games-btn eazy-games-btn--filled" data-accept-request="' +
            req.id +
            '">' +
            t("eazy_chat.invite_request_accept", "Accept") +
            "</button></div></div>"
          );
        })
        .join("");
      list.querySelectorAll("[data-accept-request]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = Number(btn.getAttribute("data-accept-request"));
          postOp("respond-games-play-request", { request_id: id, action: "accept" }, { owner_id: oid }).then(
            function () {
              renderInviteRequests();
            }
          );
        });
      });
      list.querySelectorAll("[data-reject-request]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = Number(btn.getAttribute("data-reject-request"));
          postOp("respond-games-play-request", { request_id: id, action: "reject" }, { owner_id: oid }).then(
            function () {
              renderInviteRequests();
            }
          );
        });
      });
    });
  }

  function renderLifeInvites() {
    var list = document.getElementById("eazy-games-invite-invites-list");
    var empty = document.getElementById("eazy-games-invite-invites-empty");
    if (!list) return;
    var oid = ownerId();
    if (!oid || !isCustomerLoggedIn()) {
      list.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent = t("eazy_chat.games_login", "Sign in to play the daily game.");
      }
      return;
    }
    fetchOp("list-games-life-invites", { owner_id: oid }).then(function (data) {
      if (!data || !data.ok) {
        list.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      var invites = data.invites || [];
      if (!invites.length) {
        list.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      list.innerHTML = invites
        .map(function (inv) {
          var avatar = inv.sender_profile_picture_url
            ? '<img class="eazy-games-invite__avatar eazy-games-invite__avatar--sm" src="' +
              inv.sender_profile_picture_url +
              '" alt="" loading="lazy">'
            : "";
          return (
            '<div class="eazy-games-invite__request-row" data-life-invite-id="' +
            inv.id +
            '">' +
            avatar +
            '<div class="eazy-games-invite__request-meta"><strong>' +
            (inv.sender_username || "") +
            '</strong><span>' +
            t("eazy_chat.invite_send_life", "Send Life") +
            "</span></div>" +
            '<div class="eazy-games-invite__request-actions">' +
            heartBtn(
              t("eazy_chat.invite_request_accept", "Accept"),
              'data-accept-life="' + inv.id + '" data-game-slug="' + (inv.game_slug || "") + '"',
              false
            ) +
            "</div></div>"
          );
        })
        .join("");
      list.querySelectorAll("[data-accept-life]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = Number(btn.getAttribute("data-accept-life"));
          var gameSlug = btn.getAttribute("data-game-slug") || null;
          postOp("accept-games-life-invite", { invite_id: id }, { owner_id: oid }).then(function (res) {
            if (res && res.ok) {
              renderLifeInvites();
              var slug = (res.game_slug || gameSlug || "").trim();
              if (slug) window.__eazySelectedGameSlug = slug;
              setGamesSection("play");
              if (typeof window.refreshEazyGamesView === "function") {
                window.refreshEazyGamesView();
              }
            }
          });
        });
      });
    });
  }

  function refreshFriends() {
    initInviteTabs();
    setInviteTab(inviteTab);
  }

  function refreshCommunity() {
    var grid = document.getElementById("eazy-games-community-grid");
    var empty = document.getElementById("eazy-games-community-empty");
    var status = document.getElementById("eazy-games-community-status");
    var player = document.getElementById("eazy-games-community-player");
    var listRoot = document.getElementById("eazy-games-community-root");
    if (!grid) return;

    if (player) player.hidden = true;
    if (listRoot) listRoot.style.display = "";
    grid.hidden = false;
    if (empty) empty.hidden = true;
    if (status) {
      status.hidden = false;
      status.textContent = t("eazy_chat.games_community_loading", "Loading community games…");
    }

    if (!isCustomerLoggedIn()) {
      grid.innerHTML = "";
      if (status) {
        status.textContent = t("eazy_chat.games_login", "Sign in to play the daily game.");
      }
      return;
    }

    var load =
      window.EazyCommunityGameHost && typeof window.EazyCommunityGameHost.loadCatalog === "function"
        ? window.EazyCommunityGameHost.loadCatalog()
        : fetchOp("community-games-catalog").then(function (d) {
            return d;
          });

    load
      .then(function (data) {
        if (status) status.hidden = true;
        if (!data || !data.ok) {
          if (status) {
            status.hidden = false;
            status.textContent = t("eazy_chat.games_community_error", "Could not load community games.");
          }
          return;
        }
        var games = data.games || [];
        if (!games.length) {
          grid.innerHTML = "";
          if (empty) empty.hidden = false;
          return;
        }
        if (empty) empty.hidden = true;
        grid.innerHTML = games
          .map(function (g) {
            var badge = t("eazy_chat.games_community_badge", "Community");
            return (
              '<article class="eazy-games-community__card" data-community-slug="' +
              (g.slug || "") +
              '">' +
              '<span class="eazy-games-community__badge">' +
              badge +
              "</span>" +
              "<h4>" +
              (g.title || g.slug) +
              "</h4>" +
              "<p>" +
              (g.description || "") +
              "</p>" +
              '<button type="button" class="eazy-games-btn eazy-games-btn--filled eazy-games-community__play" data-slug="' +
              (g.slug || "") +
              '">' +
              t("eazy_chat.games_community_play", "Play") +
              "</button></article>"
            );
          })
          .join("");

        grid.querySelectorAll(".eazy-games-community__play").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var slug = btn.getAttribute("data-slug");
            launchCommunityGame(slug);
          });
        });
      })
      .catch(function () {
        if (status) {
          status.hidden = false;
          status.textContent = t("eazy_chat.games_community_error", "Could not load community games.");
        }
      });
  }

  function launchCommunityGame(slug) {
    var mountRoot = document.getElementById("creator-chat-games-community-root");
    var player = document.getElementById("eazy-games-community-player");
    var grid = document.getElementById("eazy-games-community-grid");
    var listIntro = document.querySelector(".eazy-games-community__intro");
    var devLink = document.querySelector(".eazy-games-community__dev-link");
    if (!mountRoot || !window.EazyCommunityGameHost) return;

    if (grid) grid.hidden = true;
    if (listIntro) listIntro.hidden = true;
    if (devLink) devLink.hidden = true;
    if (player) player.hidden = false;
    mountRoot.innerHTML = "";

    var back = document.getElementById("eazy-games-community-back");
    if (back && !back.dataset.bound) {
      back.dataset.bound = "1";
      back.addEventListener("click", function () {
        refreshCommunity();
      });
    }

    window.EazyCommunityGameHost.launchGame(slug, mountRoot, {
      onComplete: function () {
        /* stay on game view; user taps back */
      },
      onError: function (err) {
        mountRoot.textContent = (err && err.message) || t("eazy_chat.games_community_error", "Could not load community games.");
      },
    });
  }

  window.launchCommunityGame = launchCommunityGame;

  function refreshInvite() {
    refreshFriends();
  }

  function openCollectionWithHighlight(finishData) {
    var cardId = finishData && finishData.card_instance_id;
    var prizeId = finishData && finishData.prize_instance_id;
    if (cardId) {
      window.__eazyCollectionHighlightOnce = { type: "card", id: Number(cardId) };
      collectionFilterType = "card";
    } else if (prizeId) {
      window.__eazyCollectionHighlightOnce = { type: "prize", id: Number(prizeId) };
      collectionFilterType = "prize";
    } else if (finishData && finishData.loot && finishData.loot.card) {
      window.__eazyCollectionHighlightOnce = null;
    }
    setGamesSection("collection");
  }

  function navigateToFriendsSubtab(subtab) {
    inviteTab = subtab || "friends";
    setGamesSection("friends");
  }

  function showLootReveal(loot) {
    if (!loot) return;
    var outcome = document.getElementById("creator-chat-games-outcome");
    if (!outcome) return;
    var parts = [];
    if (loot.card && loot.card.definition) {
      parts.push(loot.card.definition.name + " card");
    }
    if (!parts.length) {
      parts.push(t("eazy_chat.cards_loot_cards_only", "A new card was added to your collection."));
    }
    outcome.innerHTML =
      '<div class="creator-chat__games-outcome-inner creator-chat__games-outcome-inner--win">' +
      "<p>" +
      t("eazy_chat.games_loot_won", "You won") +
      ": " +
      parts.join(" + ") +
      '</p><button type="button" class="eazy-games-btn" id="eazy-games-go-collection">' +
      t("eazy_chat.games_view_collection", "View in Collection") +
      "</button></div>";
    outcome.hidden = false;
    var btn = document.getElementById("eazy-games-go-collection");
    if (btn) {
      btn.addEventListener("click", function () {
        setGamesSection("collection");
      });
    }
  }

  window.EazyGamesHub = {
    init: initSubnav,
    setSection: setGamesSection,
    refreshCollection: refreshCollection,
    refreshExchange: refreshExchange,
    refreshFriends: refreshFriends,
    refreshCommunity: refreshCommunity,
    launchCommunityGame: launchCommunityGame,
    refreshInvite: refreshInvite,
    openCollectionWithHighlight: openCollectionWithHighlight,
    navigateToFriendsSubtab: navigateToFriendsSubtab,
    showLootReveal: showLootReveal,
    navigateCollectionDeepLink: navigateCollectionDeepLink,
    openTradeReview: function (offerId) {
      setGamesSection("collection");
      if (
        window.EazyCardCollectionUI &&
        typeof window.EazyCardCollectionUI.openTradeReviewModal === "function"
      ) {
        window.EazyCardCollectionUI.openTradeReviewModal(offerId, {
          onUpdated: function () {
            refreshExchange();
            refreshCollection();
          },
        });
      }
    },
  };

  document.addEventListener("DOMContentLoaded", function () {
    initSubnav();
  });
})();
