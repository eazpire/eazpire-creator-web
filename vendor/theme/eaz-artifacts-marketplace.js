/**
 * Artifacts Character Marketplace (earned EAZ) — Buy | Sell
 */
(function () {
  "use strict";

  function t(key, fallback) {
    return (window.CreatorI18n && window.CreatorI18n[key]) || fallback;
  }

  function apiBase() {
    return window.CREATOR_API_BASE || "https://creator-engine.eazpire.workers.dev/apps/creator-dispatch";
  }

  function shopDomain() {
    return window.CREATOR_SHOP_DOMAIN || "eazpire.myshopify.com";
  }

  function fetchOp(op, params) {
    var url = apiBase() + "?op=" + encodeURIComponent(op) + "&shop=" + encodeURIComponent(shopDomain());
    if (params) {
      Object.keys(params).forEach(function (k) {
        url += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      });
    }
    return fetch(url, { credentials: "include" }).then(function (r) {
      return r.json();
    });
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

  function renderBuy(root, listings) {
    if (!listings.length) {
      root.innerHTML = '<p class="eaz-artifacts-empty">' + t("eazy_chat.artifacts_market_empty", "No characters for sale.") + "</p>";
      return;
    }
    root.innerHTML = listings
      .map(function (l) {
        var ch = l.character || {};
        var img = ch.image_url ? '<img src="' + ch.image_url + '" alt=""/>' : '<div class="eaz-artifacts-card__placeholder"></div>';
        return (
          '<article class="eaz-artifacts-market-card">' +
          img +
          '<div class="eaz-artifacts-market-card__body"><strong>' +
          (ch.rarity || "") +
          " · " +
          (ch.archetype || "") +
          '</strong><span class="eaz-artifacts-market-price">' +
          l.price_eaz +
          " EAZ</span>" +
          '<button type="button" class="eazy-games-btn eazy-games-btn--filled" data-buy-listing="' +
          l.listing_id +
          '">' +
          t("eazy_chat.artifacts_buy", "Buy") +
          "</button></div></article>"
        );
      })
      .join("");
    root.querySelectorAll("[data-buy-listing]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = Number(btn.getAttribute("data-buy-listing"));
        if (!window.confirm(t("eazy_chat.artifacts_buy_confirm", "Buy this character with earned EAZ?"))) return;
        postOp("artifacts-market-buy", { listing_id: id }).then(function (res) {
          if (res && res.ok) refresh("buy");
          else alert((res && res.error) || "Purchase failed");
        });
      });
    });
  }

  function renderSell(root, data) {
    var listings = (data && data.listings) || [];
    var sellable = (data && data.sellable_characters) || [];
    if (!listings.length && !sellable.length) {
      root.innerHTML =
        '<p class="eaz-artifacts-empty">' + t("eazy_chat.artifacts_sell_empty", "No characters to sell yet.") + "</p>";
      return;
    }
    var html = "";
    if (listings.length) {
      html += '<h4 class="eaz-artifacts-sell-heading">' + t("eazy_chat.artifacts_my_market_listings", "My listings") + "</h4>";
      html += listings
        .map(function (l) {
          var ch = l.character || {};
          var img = ch.image_url ? '<img src="' + ch.image_url + '" alt=""/>' : "";
          return (
            '<div class="eaz-artifacts-exchange-row">' +
            img +
            "<div><strong>" +
            (ch.rarity || "") +
            " · " +
            (ch.archetype || "") +
            "</strong><br/><small>" +
            l.price_eaz +
            " EAZ</small></div>" +
            '<button type="button" class="eazy-games-btn" data-cancel-market="' +
            l.listing_id +
            '">' +
            t("eazy_chat.artifacts_cancel_listing", "Cancel") +
            "</button></div>"
          );
        })
        .join("");
    }
    if (sellable.length) {
      html += '<h4 class="eaz-artifacts-sell-heading">' + t("eazy_chat.artifacts_sellable_characters", "Sell a character") + "</h4>";
      html += sellable
        .map(function (ch) {
          var img = ch.image_url ? '<img src="' + ch.image_url + '" alt=""/>' : "";
          return (
            '<div class="eaz-artifacts-exchange-row">' +
            img +
            "<div><strong>" +
            (ch.rarity || "") +
            " · " +
            (ch.archetype || "") +
            '</strong><br/><small>' +
            (ch.serial || "") +
            '</small></div><button type="button" class="eazy-games-btn eazy-games-btn--filled" data-list-character="' +
            ch.id +
            '">' +
            t("eazy_chat.artifacts_list_for_sale", "List for sale") +
            "</button></div>"
          );
        })
        .join("");
    }
    root.innerHTML = html;
    root.querySelectorAll("[data-cancel-market]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = Number(btn.getAttribute("data-cancel-market"));
        postOp("artifacts-market-cancel", { listing_id: id }).then(function (res) {
          if (res && res.ok) refresh("sell");
          else alert((res && res.error) || "Cancel failed");
        });
      });
    });
    root.querySelectorAll("[data-list-character]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var characterId = Number(btn.getAttribute("data-list-character"));
        var price = window.prompt(t("eazy_chat.artifacts_list_price_prompt", "Price in earned EAZ (min 10):"), "10");
        if (!price) return;
        postOp("artifacts-market-list-character", { character_id: characterId, price_eaz: Number(price) }).then(function (res) {
          if (res && res.ok) refresh("sell");
          else alert((res && res.error) || "Listing failed");
        });
      });
    });
  }

  function refresh(mode) {
    var root = document.getElementById("eaz-artifacts-marketplace-root");
    if (!root) return;
    var sub = mode || "buy";
    root.innerHTML = '<p class="eaz-artifacts-loading">' + t("eazy_chat.artifacts_loading", "Loading…") + "</p>";
    var scope = sub === "sell" ? "sell" : "buy";
    fetchOp("artifacts-market-list", { scope: scope }).then(function (data) {
      if (scope === "sell") renderSell(root, data);
      else renderBuy(root, (data && data.listings) || []);
    });
  }

  window.EazArtifactsMarketplace = { refresh: refresh };
})();
