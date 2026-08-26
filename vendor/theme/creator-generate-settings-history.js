/**
 * Account-bound generator settings history.
 * Server (D1 via dispatch) is the source of truth. Memory cache only after a successful fetch/push.
 */
(function (global) {
  "use strict";

  var MAX = 16;
  var cache = [];
  var cacheOwner = "";
  var loginRequired = false;

  function t(key, fallback) {
    var i18n = global.CreatorI18n || {};
    var aliases = {
      liveGenHistoryEmptyPrompt: ["liveGenHistoryEmptyPrompt", "history_empty_prompt", "creator.generator.history_empty_prompt"],
      liveGenHistoryEmpty: ["liveGenHistoryEmpty", "history_empty", "creator.generator.history_empty"],
      liveGenHistoryLogin: ["liveGenHistoryLogin", "history_login", "creator.generator.history_login"],
    };
    var keys = aliases[key] || [key];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (typeof i18n[k] === "string" && i18n[k] && i18n[k].indexOf("Translation missing") === -1) return i18n[k];
    }
    if (i18n.generator && typeof i18n.generator[keys[1]] === "string" && i18n.generator[keys[1]]) {
      return i18n.generator[keys[1]];
    }
    return fallback;
  }

  function dispatchUrl() {
    if (global.CREATOR_API_CONFIG && typeof global.CREATOR_API_CONFIG.getDispatchUrl === "function") {
      try {
        var d = global.CREATOR_API_CONFIG.getDispatchUrl();
        if (d) return String(d).replace(/\/+$/, "");
      } catch (_e) {}
    }
    var base = (global.CREATOR_API_CONFIG && global.CREATOR_API_CONFIG.BASE_URL)
      ? String(global.CREATOR_API_CONFIG.BASE_URL).replace(/\/+$/, "")
      : "https://creator-engine.eazpire.workers.dev";
    if (/\/apps\/creator-dispatch$/i.test(base)) return base;
    return base + "/apps/creator-dispatch";
  }

  function resolveOwnerId() {
    if (typeof global.__EAZ_OWNER_ID !== "undefined" && global.__EAZ_OWNER_ID != null) {
      var o = String(global.__EAZ_OWNER_ID).trim();
      if (o) return o;
    }
    if (global.Shopify && global.Shopify.customerId) return String(global.Shopify.customerId);
    var meta = global.document && global.document.querySelector && global.document.querySelector('meta[name="creator-owner-id"]');
    if (meta) {
      var c = (meta.getAttribute("content") || "").trim();
      if (c) return c;
    }
    var cfg = global.CREATOR_API_CONFIG || {};
    if (cfg.ownerId || cfg.owner_id) return String(cfg.ownerId || cfg.owner_id);
    try {
      var sp = new URLSearchParams(global.location && global.location.search ? global.location.search : "");
      var q = sp.get("owner_id") || sp.get("logged_in_customer_id");
      if (q) return String(q).trim();
    } catch (_e2) {}
    return "";
  }

  function slimRefs(refs) {
    var out = [];
    (Array.isArray(refs) ? refs : []).slice(0, 4).forEach(function (r) {
      if (!r) return;
      var url = String(r.dataUrl || r.url || "").trim();
      if (/^data:/i.test(url) || /^blob:/i.test(url) || url.length > 2048) url = "";
      if (url && !/^https?:\/\//i.test(url)) url = "";
      out.push({
        url: url,
        similarity: typeof r.similarity === "number" ? r.similarity : null,
        source: r.source || null,
        strength: r.strength != null ? r.strength : null,
        inspiration_mode: r.inspiration_mode || null,
        quickInspirationId: r.quickInspirationId || r.quick_inspiration_id || null,
      });
    });
    return out;
  }

  function buildItem(entry) {
    return {
      prompt: String(entry.prompt || "").trim(),
      designType: entry.designType || "classic",
      targetProduct: entry.targetProduct || "all",
      generatorMode: entry.generatorMode || "design",
      ratio: entry.ratio || "portrait",
      contentType: entry.contentType || "design-text",
      styles: Array.isArray(entry.styles) ? entry.styles.slice(0, 12) : [],
      designColors: Array.isArray(entry.designColors) ? entry.designColors.slice(0, 12) : [],
      background: entry.background && typeof entry.background === "object" ? entry.background : { mode: "transparent" },
      language: entry.language && typeof entry.language === "object" ? entry.language : { mode: "as-design" },
      referenceStrength: entry.referenceStrength != null ? entry.referenceStrength : null,
      origin: entry.origin || null,
      refs: slimRefs(entry.refs || entry.reference_images || []),
    };
  }

  function setCache(ownerId, list) {
    cacheOwner = ownerId;
    cache = Array.isArray(list) ? list.slice(0, MAX) : [];
  }

  function fetchJson(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (data) {
        return { status: r.status, data: data || {} };
      }).catch(function () {
        return { status: r.status, data: {} };
      });
    });
  }

  function listAsync() {
    var ownerId = resolveOwnerId();
    if (!ownerId) {
      loginRequired = true;
      setCache("", []);
      return Promise.resolve([]);
    }
    loginRequired = false;
    var u = new URL(dispatchUrl());
    u.searchParams.set("op", "generate-settings-history-list");
    u.searchParams.set("owner_id", ownerId);
    u.searchParams.set("logged_in_customer_id", ownerId);
    u.searchParams.set("limit", String(MAX));
    return fetchJson(u.toString(), { method: "GET", credentials: "include" })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          loginRequired = true;
          setCache(ownerId, []);
          return [];
        }
        var items = res.data && res.data.ok && Array.isArray(res.data.items) ? res.data.items : [];
        setCache(ownerId, items);
        return cache;
      })
      .catch(function () {
        return cacheOwner === ownerId ? cache : [];
      });
  }

  function push(entry) {
    if (!entry || typeof entry !== "object") return Promise.resolve(null);
    var ownerId = resolveOwnerId();
    if (!ownerId) {
      loginRequired = true;
      return Promise.resolve(null);
    }
    var item = buildItem(entry);
    item.owner_id = ownerId;
    var u = new URL(dispatchUrl());
    u.searchParams.set("op", "generate-settings-history-push");
    u.searchParams.set("owner_id", ownerId);
    return fetchJson(u.toString(), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          loginRequired = true;
          return null;
        }
        var saved = res.data && res.data.ok && res.data.item ? res.data.item : null;
        if (saved) {
          var next = [saved].concat(cache.filter(function (x) { return x && x.id !== saved.id; }));
          setCache(ownerId, next);
        }
        return saved;
      })
      .catch(function () {
        return null;
      });
  }

  function label(item) {
    var prompt = String(item && item.prompt ? item.prompt : "").trim();
    var words = prompt ? prompt.split(/\s+/).slice(0, 6).join(" ") : t("liveGenHistoryEmptyPrompt", "No prompt");
    if (prompt && prompt.split(/\s+/).length > 6) words += "…";
    var d = item && item.ts ? new Date(item.ts) : null;
    var when = d && !isNaN(d.getTime())
      ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    return when ? when + " · " + words : words;
  }

  global.CreatorGenerateSettingsHistory = {
    push: push,
    list: function () {
      return cache.slice();
    },
    listAsync: listAsync,
    refresh: listAsync,
    isLoginRequired: function () {
      return loginRequired || !resolveOwnerId();
    },
    get: function (id) {
      return cache.find(function (x) {
        return x && x.id === id;
      }) || null;
    },
    label: label,
    t: t,
    resolveOwnerId: resolveOwnerId,
  };
})(typeof window !== "undefined" ? window : this);
