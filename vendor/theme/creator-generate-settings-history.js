/**
 * Local generator settings history — saved on confirm, even if the job never starts.
 */
(function (global) {
  "use strict";

  var KEY = "eaz_gen_settings_history_v1";
  var MAX = 12;
  var MAX_JSON = 1400000;

  function t(key, fallback) {
    var i18n = global.CreatorI18n || {};
    var aliases = {
      liveGenHistoryEmptyPrompt: ["liveGenHistoryEmptyPrompt", "history_empty_prompt", "creator.generator.history_empty_prompt"],
      liveGenHistoryEmpty: ["liveGenHistoryEmpty", "history_empty", "creator.generator.history_empty"],
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

  function readList() {
    try {
      var raw = global.localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  function writeList(list) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(list));
    } catch (_e) {}
  }

  function slimRefs(refs) {
    var out = [];
    var budget = 400000;
    var used = 0;
    (Array.isArray(refs) ? refs : []).slice(0, 4).forEach(function (r) {
      if (!r) return;
      var url = String(r.dataUrl || r.url || "").trim();
      if (url && used + url.length > budget) url = "";
      used += url.length;
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

  function push(entry) {
    if (!entry || typeof entry !== "object") return null;
    var item = {
      id: "h_" + Date.now() + "_" + Math.random().toString(16).slice(2, 8),
      ts: Date.now(),
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
      refs: slimRefs(entry.refs || entry.reference_images || []),
    };
    var list = readList();
    list.unshift(item);
    list = list.slice(0, MAX);
    var json = JSON.stringify(list);
    if (json.length > MAX_JSON) {
      item.refs = item.refs.map(function (r) {
        var copy = {};
        for (var k in r) copy[k] = r[k];
        copy.url = "";
        return copy;
      });
      list[0] = item;
    }
    writeList(list);
    return item;
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
    list: readList,
    get: function (id) {
      return readList().find(function (x) {
        return x && x.id === id;
      }) || null;
    },
    label: label,
    t: t,
  };
})(typeof window !== "undefined" ? window : this);
