/**
 * EAZ balance loader for creator portal (replaces theme creator-api-helper.liquid inline script).
 */
(function (global) {
  "use strict";

  if (!global.__CREATOR_PORTAL_HOST__) return;

  global.__eazBalanceCache = global.__eazBalanceCache || { value: null, timestamp: 0, loading: null };

  function resolveOwnerId() {
    if (global.CreatorPortalThemeBridge && typeof global.CreatorPortalThemeBridge.resolveOwnerId === "function") {
      var bridged = global.CreatorPortalThemeBridge.resolveOwnerId();
      if (bridged) return String(bridged);
    }
    if (global.__EAZ_OWNER_ID) return String(global.__EAZ_OWNER_ID).trim();
    return null;
  }

  function getEazBalanceDisplayElements() {
    var seen = new Set();
    var els = [];
    ["global-eaz-balance-value", "creator-desktop-eaz-value", "creator-footer-eaz-value"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !seen.has(el)) {
        seen.add(el);
        els.push(el);
      }
    });
    return els;
  }

  function applyEazBalanceToElements(els, formattedBalance, options) {
    options = options || {};
    els.forEach(function (balanceEl) {
      balanceEl.textContent = formattedBalance;
      balanceEl.style.color = options.color != null ? options.color : "#f97316";
      balanceEl.dataset.eazLoaded = options.loaded != null ? String(options.loaded) : "1";
    });
  }

  global._resolveEazOwnerId = resolveOwnerId;
  global._getGlobalEazSource = function () {
    var els = getEazBalanceDisplayElements();
    return els[0] || null;
  };

  global.loadCreatorBalance = async function (retryCount) {
    retryCount = retryCount || 0;

    if (global.__eazBalanceCache.loading && retryCount === 0) {
      try {
        await Promise.race([
          global.__eazBalanceCache.loading,
          new Promise(function (_, reject) {
            setTimeout(function () {
              reject(new Error("Wait timeout"));
            }, 5000);
          }),
        ]);
        if (global.__eazBalanceCache.value !== null) return;
      } catch (e) {}
    }

    var balanceEls = getEazBalanceDisplayElements();
    if (!balanceEls.length) {
      if (retryCount < 8) {
        setTimeout(function () {
          global.loadCreatorBalance(retryCount + 1);
        }, 120 * (retryCount + 1));
      }
      return;
    }

    var ownerId = resolveOwnerId();
    if (!ownerId) {
      if (retryCount < 8) {
        setTimeout(function () {
          global.loadCreatorBalance(retryCount + 1);
        }, 500 * (retryCount + 1));
      } else {
        applyEazBalanceToElements(balanceEls, "—", { color: "#9ca3af", loaded: "0" });
      }
      return;
    }

    global.__EAZ_OWNER_ID = ownerId;

    var loadPromise = (async function () {
      try {
        var fetcher =
          typeof global.creatorApiFetch === "function"
            ? global.creatorApiFetch.bind(global)
            : null;
        if (!fetcher) throw new Error("creatorApiFetch missing");
        var data = await fetcher("get-balance", { owner_id: ownerId });

        if (data && data.ok) {
          if (typeof global.applyCreatorFooterStarterUi === "function") {
            global.applyCreatorFooterStarterUi(data);
          }
          if (data.eaz_wallet_active === false && data.is_creator !== true) {
            global.__eazBalanceCache.value = null;
            global.__eazBalanceCache.timestamp = Date.now();
            applyEazBalanceToElements(balanceEls, "—", { color: "#9ca3af", loaded: "1" });
            return;
          }
          var balanceValueRaw = data.balance_total != null ? data.balance_total : data.balance_eaz;
          var balanceValue = balanceValueRaw != null ? balanceValueRaw : 0;
          var formattedBalance =
            balanceValue % 1 === 0 ? balanceValue.toString() : Number(balanceValue).toFixed(2);

          global.__eazBalanceCache.value = balanceValue;
          global.__eazBalanceCache.timestamp = Date.now();
          applyEazBalanceToElements(balanceEls, formattedBalance, { color: "#f97316", loaded: "1" });
          global.dispatchEvent(new CustomEvent("eazBalanceUpdated", { detail: { balance: balanceValue } }));
        } else {
          applyEazBalanceToElements(balanceEls, "—", { color: "#ef4444", loaded: "0" });
        }
      } catch (error) {
        applyEazBalanceToElements(balanceEls, "—", { color: "#9ca3af", loaded: "0" });
        if (retryCount < 3) {
          setTimeout(function () {
            global.loadCreatorBalance(retryCount + 1);
          }, 3000);
        }
      } finally {
        global.__eazBalanceCache.loading = null;
      }
    })();

    global.__eazBalanceCache.loading = loadPromise;
    await loadPromise;
  };

  global.loadCreatorEazBalance = global.loadCreatorBalance;

  global.addEventListener("eazCreatorContextReady", function () {
    if (typeof global.loadCreatorBalance === "function") global.loadCreatorBalance(0);
    if (typeof global.loadCreatorSalesBalance === "function") global.loadCreatorSalesBalance(0);
    if (typeof global.reloadCreatorDashboardBalances === "function") global.reloadCreatorDashboardBalances();
  });
})(typeof window !== "undefined" ? window : globalThis);
