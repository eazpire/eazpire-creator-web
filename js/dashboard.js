/**
 * Dashboard overview stats + level badge (Phase 3a).
 */
(function (global) {
  "use strict";

  var loadedForOwner = null;

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatNum(n) {
    return Number(n || 0).toLocaleString();
  }

  function applyStats(data) {
    if (!data || !data.ok) return false;
    var d = data.designs || {};
    var p = data.products || {};
    var h = data.heroes || data.hero_count || {};

    setText("cpStatDesignsGenerated", formatNum(d.generated));
    setText("cpStatDesignsUploaded", formatNum(d.uploaded));
    setText("cpStatProductsOnline", formatNum(p.online));
    var prodsOff = Number(p.offline);
    if (!Number.isFinite(prodsOff)) {
      prodsOff = Math.max(0, (Number(p.possible) || 0) - (Number(p.online) || 0));
    }
    setText("cpStatProductsOffline", formatNum(prodsOff));
    setText("cpStatHeroesGenerated", formatNum(h.generated != null ? h.generated : h.total));
    setText("cpStatHeroesOnline", formatNum(h.online != null ? h.online : h.published));

    var hint = document.getElementById("creatorStatsHint");
    if (hint) hint.hidden = true;
    return true;
  }

  function applyLevel(data) {
    if (!data || !data.ok) {
      setText("creatorLevelNum", "–");
      setText("creatorLevelName", "Free");
      return;
    }
    var raw = data.level;
    if (raw && typeof raw === "object") {
      var num = raw.number != null ? raw.number : raw.level != null ? raw.level : "–";
      var name = raw.name || raw.label || "Creator";
      setText("creatorLevelNum", String(num));
      setText("creatorLevelName", String(name));
      return;
    }
    setText("creatorLevelNum", "1");
    setText("creatorLevelName", String(raw || "Creator"));
  }

  async function loadDashboard(ownerId, force) {
    if (!ownerId) return;
    var stats = await global.CreatorPortalApi.getDashboardStats(ownerId, force);
    if (!applyStats(stats)) {
      var hint = document.getElementById("creatorStatsHint");
      if (hint) hint.hidden = false;
    }
    var billing = await global.CreatorPortalApi.getBillingLevel(ownerId);
    applyLevel(billing);
    loadedForOwner = String(ownerId);
  }

  function onRoute(name) {
    if (name !== "dashboard") return;
    var auth = global.CreatorPortalAuth && global.CreatorPortalAuth.state;
    if (!auth || !auth.loggedIn || !auth.ownerId) return;
    if (loadedForOwner === String(auth.ownerId)) return;
    loadDashboard(auth.ownerId, false);
  }

  async function refresh(force) {
    var auth = global.CreatorPortalAuth && global.CreatorPortalAuth.state;
    if (!auth || !auth.loggedIn || !auth.ownerId) return;
    await loadDashboard(auth.ownerId, !!force);
  }

  global.CreatorPortalDashboard = {
    onRoute: onRoute,
    refresh: refresh,
    load: loadDashboard,
  };
})(typeof window !== "undefined" ? window : globalThis);
