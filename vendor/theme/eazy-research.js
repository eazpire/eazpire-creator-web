/**
 * eazy Research creator page — reprint-safe Amazon snapshots.
 * Cards: image, title, KI topic, language flag, category-rank, BSR. No invented sales.
 */
(function (global) {
  "use strict";

  var WATCH_KEY = "eazy-research-watched";
  var FILTER_COLLAPSE_KEY = "eazy-research-filters-collapsed";
  var HEART_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>';

  /* Gleiche Flaggen-Technik wie Footer/Header: flagcdn PNG + runder Glass-Kreis (kein Emoji). */
  var FLAG_CDN = "https://flagcdn.com/w80/";
  var LANG_TO_FLAG = { en: "GB", de: "DE", es: "ES", fr: "FR", it: "IT" };
  var MARKET_TO_FLAG = {
    "amazon.de": "DE",
    "amazon.co.uk": "GB",
    "amazon.fr": "FR",
    "amazon.it": "IT",
    "amazon.es": "ES",
    "amazon.com": "US",
    "amazon.ca": "CA",
    "amazon.co.jp": "JP",
    "amazon.com.au": "AU",
  };
  var COUNTRY_I18N = {
    "amazon.de": "creator.research.country_amazon_de",
    "amazon.co.uk": "creator.research.country_amazon_co_uk",
    "amazon.fr": "creator.research.country_amazon_fr",
    "amazon.it": "creator.research.country_amazon_it",
    "amazon.es": "creator.research.country_amazon_es",
    "amazon.com": "creator.research.country_amazon_com",
    "amazon.ca": "creator.research.country_amazon_ca",
    "amazon.co.jp": "creator.research.country_amazon_co_jp",
    "amazon.com.au": "creator.research.country_amazon_com_au",
  };
  var COUNTRY_FALLBACK = {
    "amazon.de": "DE · Amazon.de",
    "amazon.co.uk": "UK · Amazon.co.uk",
    "amazon.fr": "FR · Amazon.fr",
    "amazon.it": "IT · Amazon.it",
    "amazon.es": "ES · Amazon.es",
    "amazon.com": "US · Amazon.com",
    "amazon.ca": "CA · Amazon.ca",
    "amazon.co.jp": "JP · Amazon.co.jp",
    "amazon.com.au": "AU · Amazon.com.au",
  };

  var state = {
    products: [],
    niches: [],
    facets: { topics: [], audience: [], personalization: [], design_type: [], language: [] },
    marketplaces: [],
    marketplace: "all",
    analyzeLimits: { used: 0, remaining: 5, limit: 5, busy: false },
    preview: false,
    lastRun: null,
    q: "",
    nichesSelected: [],
    designTypesSelected: [],
    languagesSelected: [],
    personalizationsSelected: [],
    audiencesSelected: [],
    sort: "review_growth",
    reprintOk: true,
    view: "opportunities",
    loading: false,
    analyzing: false,
    searchId: "",
    searchEmptyReason: "",
    searchAmazonReturned: 0,
    searchBlocked: 0,
    pollTimer: null,
    watched: [],
    hasMore: false,
    loadingMore: false,
    loadGen: 0,
    pageSize: 80,
  };

  function captureScrollTop(el) {
    if (!el) return 0;
    var n = Number(el.scrollTop);
    return isFinite(n) ? n : 0;
  }

  /**
   * Repair an engine reset only. Writing scrollTop on every render cancels native
   * scrolling and snaps the rail/grid back to the captured value (often 0).
   */
  function restoreScrollTop(el, top) {
    if (!el) return 0;
    var captured = Math.max(0, Number(top) || 0);
    var now = captureScrollTop(el);
    if (now === 0 && captured > 0) el.scrollTop = captured;
    return captureScrollTop(el);
  }

  function scrollerRefs(root) {
    if (!root) return { filters: null, grid: null, stage: null };
    if (root.__erzScroll && root.__erzScroll.filters && root.__erzScroll.grid) {
      return root.__erzScroll;
    }
    root.__erzScroll = {
      filters: root.querySelector("[data-erz-filters]"),
      grid: root.querySelector("[data-erz-grid-scroll]"),
      stage: root.querySelector("[data-erz-stage]"),
    };
    return root.__erzScroll;
  }

  function captureResearchScroll(root) {
    var refs = scrollerRefs(root);
    return {
      filters: captureScrollTop(refs.filters),
      grid: captureScrollTop(refs.grid),
      stage: captureScrollTop(refs.stage),
    };
  }

  function restoreResearchScroll(root, saved) {
    if (!root || !saved) return saved;
    var refs = scrollerRefs(root);
    restoreScrollTop(refs.filters, saved.filters);
    restoreScrollTop(refs.grid, saved.grid);
    restoreScrollTop(refs.stage, saved.stage);
    return saved;
  }

  function withResearchScroll(root, mutate) {
    var saved = captureResearchScroll(root);
    if (typeof mutate === "function") mutate();
    return restoreResearchScroll(root, saved);
  }

  function t(key, fallback) {
    if (global.CreatorPortalI18n && typeof global.CreatorPortalI18n.t === "function") {
      var v = global.CreatorPortalI18n.t(key);
      if (v) return v;
    }
    if (global.CreatorI18n && typeof global.CreatorI18n.t === "function") {
      var v2 = global.CreatorI18n.t(key);
      if (v2) return v2;
    }
    return fallback;
  }

  function api(op, params, options) {
    params = params || {};
    options = options || {};
    if (typeof global.creatorApiFetch === "function") {
      return global.creatorApiFetch(op, params, options);
    }
    var url = new URL("/apps/creator-dispatch", global.location.origin);
    url.searchParams.set("op", op);
    Object.keys(params).forEach(function (k) {
      if (params[k] != null && params[k] !== "") url.searchParams.set(k, String(params[k]));
    });
    var fetchOpts = { credentials: "include" };
    if (options.method) fetchOpts.method = options.method;
    if (options.body != null) {
      fetchOpts.headers = { "Content-Type": "application/json" };
      fetchOpts.body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    }
    return fetch(url.toString(), fetchOpts).then(function (r) { return r.json(); });
  }

  function isLoggedIn() {
    if (global.__CREATOR_IS_LOGGED_IN === true) return true;
    if (global.__creatorSettingsUserLoggedIn === true) return true;
    if (global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.loggedIn) {
      return true;
    }
    if (global.CreatorAuth && typeof global.CreatorAuth.isLoggedIn === "function") {
      try { if (global.CreatorAuth.isLoggedIn()) return true; } catch (_e) { /* ignore */ }
    }
    var oid =
      (global.__EAZ_OWNER_ID && String(global.__EAZ_OWNER_ID).trim()) ||
      (global.__creatorOwnerId && String(global.__creatorOwnerId).trim()) ||
      (global.CreatorPortalAuth && global.CreatorPortalAuth.state && global.CreatorPortalAuth.state.ownerId) ||
      (global.CREATOR_API_CONFIG && global.CREATOR_API_CONFIG.OWNER_ID) ||
      (global.Shopify && global.Shopify.customerId) ||
      "";
    return !!String(oid || "").trim();
  }

  function showLoginOverlay() {
    try {
      if (typeof global.syncCreatorGuestNavLocksMobile === "function") global.syncCreatorGuestNavLocksMobile();
      if (typeof global.syncCreatorGuestDesktopLock === "function") global.syncCreatorGuestDesktopLock("research");
    } catch (_e) { /* overlay helpers are optional on some hosts */ }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function timeAgo(ts) {
    var n = Number(ts);
    if (!n) return "";
    var mins = Math.max(1, Math.round((Date.now() - n) / 60000));
    if (mins < 60) return mins + "m";
    var hours = Math.round(mins / 60);
    if (hours < 48) return hours + "h";
    return Math.round(hours / 24) + "d";
  }

  var MARKET_TAGS = {
    "amazon.de": "DE",
    "amazon.co.uk": "UK",
    "amazon.fr": "FR",
    "amazon.it": "IT",
    "amazon.es": "ES",
    "amazon.com": "US",
    "amazon.ca": "CA",
    "amazon.co.jp": "JP",
    "amazon.com.au": "AU",
  };

  function marketplaceHost(p) {
    return String((p && p.marketplace) || "").trim().toLowerCase();
  }

  function marketplaceTag(p) {
    if (p && p.marketplace_tag) return String(p.marketplace_tag).toUpperCase();
    var host = marketplaceHost(p);
    return MARKET_TAGS[host] || "";
  }

  /** flagcdn ISO: UK-Marktplatz und Sprache en nutzen GB (Union Jack), nie "uk.png". */
  function flagCountryCode(code) {
    var cc = String(code || "").trim().toUpperCase();
    if (!cc) return "";
    if (cc === "UK") return "GB";
    return cc;
  }

  function flagUrl(code) {
    var cc = flagCountryCode(code).toLowerCase();
    return cc ? FLAG_CDN + cc + ".png" : "";
  }

  function flagCircleHtml(code, extraClass) {
    var url = flagUrl(code);
    if (!url) return "";
    var cls = "eazy-research__flag" + (extraClass ? " " + extraClass : "");
    return '<span class="' + cls + '" style="background-image:url(' + url + ')" aria-hidden="true"></span>';
  }

  function flagForLanguage(lang) {
    var code = String(lang || "").trim().toLowerCase();
    if (!code || code === "none") return "";
    return LANG_TO_FLAG[code] || "";
  }

  function flagForMarketplace(host) {
    return MARKET_TO_FLAG[String(host || "").trim().toLowerCase()] || "";
  }

  function languageFlagHtml(lang) {
    var code = String(lang || "").trim().toLowerCase();
    if (!code) return "";
    if (code === "none") return esc(t("creator.quick_inspirations.language_none", "None"));
    var flag = flagForLanguage(code);
    return (flag ? flagCircleHtml(flag) : "") +
      '<span class="eazy-research__lang-code" translate="no">' + esc(code.toUpperCase()) + "</span>";
  }

  function watchId(p) {
    var asin = typeof p === "string" ? p : (p && p.asin) || "";
    var host = typeof p === "string" ? "" : marketplaceHost(p);
    return host ? String(asin) + ":" + host : String(asin);
  }

  function amazonUrl(p) {
    var asin = typeof p === "string" ? p : (p && p.asin) || "";
    var host = typeof p === "string" ? "amazon.de" : marketplaceHost(p) || "amazon.de";
    return "https://www." + host + "/dp/" + encodeURIComponent(asin);
  }

  function loadWatched() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(WATCH_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    } catch (_e) {
      return [];
    }
  }

  function saveWatched(asins) {
    state.watched = asins.slice();
    try {
      if (global.localStorage) global.localStorage.setItem(WATCH_KEY, JSON.stringify(asins));
    } catch (_e) { /* guest storage may be blocked */ }
  }

  function isWatched(p) {
    var id = watchId(p);
    if (state.watched.indexOf(id) !== -1) return true;
    var asin = typeof p === "string" ? p : (p && p.asin);
    return asin ? state.watched.indexOf(String(asin)) !== -1 : false;
  }

  function toggleWatch(p) {
    if (!p) return;
    var id = watchId(p);
    var asin = typeof p === "string" ? p : (p && p.asin);
    var next = state.watched.filter(function (x) { return x !== id && x !== String(asin || ""); });
    if (next.length === state.watched.length) next.push(id);
    saveWatched(next);
  }

  function subNicheOf(p) {
    if (!p) return "";
    return p.subtopic || p.sub_niche || p.sub_niche_key || p.subniche || "";
  }

  function topicKeyOf(p) {
    var topic = String((p && p.topic) || "").trim().toLowerCase();
    if (topic) return topic;
    var key = String((p && p.niche_key) || "").trim().toLowerCase();
    if (key && key !== "user_search") return key;
    return "";
  }

  function displayTopicLabels(p) {
    var out = [];
    var topic = String((p && p.topic) || "").trim();
    var sub = String((p && p.subtopic) || "").trim();
    if (topic) out.push(sub ? topic + " · " + sub : topic);
    var key = String((p && p.niche_key) || "").trim();
    if (key && key.toLowerCase() !== "user_search") {
      var label = nicheLabel(key);
      var already = topic && (topic.toLowerCase() === key.toLowerCase() || topic.toLowerCase() === String(label).toLowerCase());
      if (label && !already) out.push(label);
    }
    return out;
  }

  function languageBadge(lang) {
    return languageFlagHtml(lang);
  }

  function facetCount(group, key) {
    var rows = (state.facets && state.facets[group]) || [];
    var hit = rows.find(function (x) { return String(x.key) === String(key); });
    return hit ? Number(hit.count) || 0 : 0;
  }

  function toggleList(list, key) {
    var next = Array.isArray(list) ? list.slice() : [];
    var idx = next.indexOf(key);
    if (idx === -1) next.push(key);
    else next.splice(idx, 1);
    return next;
  }

  var AUDIENCE_VALUES = ["men", "women", "kids", "toddler"];
  var TODDLER_RE = /\b(toddlers?|bab(?:y|ies)|infants?|newborns?|kleinkind(?:er)?|s[äa]ugling(?:e)?|b[ée]b[ée]s?|neonat[ioe]s?|neugeboren(?:e|es)?)\b/i;
  var KIDS_RE = /\b(kids?|kinder|child(?:ren)?|youth|jungen|m[äa]dchen|boys?|girls?|juniors?|teens?)\b/i;
  var MEN_RE = /\b(men'?s|mens\b|herren|homme(?:s)?|uomo|uomini|hombre(?:s)?|m[äa]nner)\b/i;
  var WOMEN_RE = /\b(women'?s|womens\b|damen|femme(?:s)?|donna|donne|mujer(?:es)?|ladies|lady)\b/i;

  function audienceScore(text, re, weight) {
    if (!text) return 0;
    var flags = re.flags.indexOf("g") >= 0 ? re.flags : re.flags + "g";
    var found = String(text).match(new RegExp(re.source, flags));
    return found ? found.length * weight : 0;
  }

  function classifyAudience(title, category) {
    var t = String(title || "");
    var c = String(category || "");
    var blob = (t + " " + c).trim();
    if (!blob) return "";
    if (TODDLER_RE.test(blob)) return "toddler";
    if (KIDS_RE.test(blob)) return "kids";
    var men = audienceScore(t, MEN_RE, 3) + audienceScore(c, MEN_RE, 1);
    var women = audienceScore(t, WOMEN_RE, 3) + audienceScore(c, WOMEN_RE, 1);
    if (men && women) {
      if (men === women) return "";
      return men > women ? "men" : "women";
    }
    if (men) return "men";
    if (women) return "women";
    return "";
  }

  function audienceOf(p) {
    if (!p) return "";
    var stored = String(p.audience || "").trim().toLowerCase();
    if (AUDIENCE_VALUES.indexOf(stored) !== -1) return stored;
    return classifyAudience(p.title, [p.bsr_category, p.latest && p.latest.bsr_category, p.browse_node, p.category].filter(Boolean).join(" "));
  }

  function goGenerator() {
    if (global.CreatorDesktopShell && typeof global.CreatorDesktopShell.switchScreen === "function") {
      global.CreatorDesktopShell.switchScreen("generator");
      return;
    }
    if (global.CreatorPortalRouter && typeof global.CreatorPortalRouter.showScreen === "function") {
      global.CreatorPortalRouter.showScreen("generator");
      return;
    }
    try {
      var u = new URL(global.location.href);
      u.hash = "generator";
      global.history.replaceState(global.history.state, "", u.pathname + u.search + u.hash);
      global.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (_e) {
      global.location.hash = "generator";
    }
  }

  /**
   * Catalog grid is server-filtered. Client only trims live Analyze results
   * and the local watchlist — never a larger unfiltered cache.
   */
  function visibleProducts() {
    var liveSearch = !!state.searchId;
    var out = (state.products || []).slice();
    out = out.filter(function (p) { return p.reprint_ok === true || Number(p.reprint_ok) === 1; });
    if (liveSearch && state.marketplace && state.marketplace !== "all") {
      out = out.filter(function (p) { return marketplaceHost(p) === state.marketplace; });
    }
    if (!liveSearch && state.view === "watched") {
      out = out.filter(function (p) { return isWatched(p); });
    }
    return out;
  }

  function filterClient(rows) {
    return visibleProducts();
  }

  function nicheLabel(key) {
    var n = (state.niches || []).find(function (x) { return x.niche_key === key || x.key === key; });
    return (n && (n.label || n.niche_key)) || key || "";
  }

  function bsrCategoryOf(p) {
    if (!p) return "";
    if (p.latest && p.latest.bsr_category) return String(p.latest.bsr_category);
    return String(p.bsr_category || "");
  }

  function fmtBsrRank(p) {
    var rank = p && p.latest && p.latest.bsr != null ? Number(p.latest.bsr) : null;
    if (rank == null || !isFinite(rank) || rank <= 0) return "";
    return Number(rank).toLocaleString("de-DE");
  }

  function fmtBsr(p) {
    var rankText = fmtBsrRank(p);
    if (!rankText) return t("creator.research.bsr_missing", "No BSR");
    var cat = bsrCategoryOf(p);
    if (cat) {
      return t("creator.research.bsr_with_category", "BSR {rank} · {category}")
        .replace("{rank}", rankText)
        .replace("{category}", cat);
    }
    return t("creator.research.bsr_label", "BSR") + " " + rankText;
  }

  function bsrChange(p) {
    var delta = p && p.bsr_delta;
    if (delta == null || !isFinite(Number(delta)) || Number(delta) === 0) return null;
    var improved = p.bsr_improved === true || Number(delta) < 0;
    return {
      improved: improved,
      label: improved
        ? t("creator.research.bsr_change_improved", "↑ Improved")
        : t("creator.research.bsr_change_worse", "↓ Worse"),
    };
  }

  function productCard(p) {
    var img = p.image_url
      ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">'
      : '<div class="eazy-research-card__ph">' + esc(t("creator.research.unknown", "Unknown")) + "</div>";
    var reviewsCount = p.latest && p.latest.reviews_count != null ? Number(p.latest.reviews_count) : null;
    var reviewsHtml = reviewsCount != null && isFinite(reviewsCount)
      ? '<div class="eazy-research-card__reviews">' +
        esc(t("creator.research.reviews_count", "{count} reviews").replace("{count}", String(reviewsCount))) +
        "</div>"
      : "";
    var change = bsrChange(p);
    var rankText = fmtBsrRank(p);
    var bsrValue = rankText || t("creator.research.bsr_missing", "No BSR");
    var deltaHtml = change
      ? '<span class="eazy-research-card__bsr-delta is-' + (change.improved ? "improved" : "worse") + '">' +
        (change.improved ? "↑" : "↓") + "</span>"
      : "";
    var watched = isWatched(p);
    var watchLabel = watched
      ? t("creator.research.watch_remove", "Remove from watchlist")
      : t("creator.research.watch_add", "Add to watchlist");
    var catName = bsrCategoryOf(p);
    var topics = displayTopicLabels(p);
    var topicHtml = topics.length
      ? '<div class="eazy-research-card__tags">' + topics.map(function (label) {
          return "<span>" + esc(label) + "</span>";
        }).join("") + "</div>"
      : "";
    var catLine = catName
      ? '<div class="eazy-research-card__category">' + esc(catName) + "</div>"
      : "";
    var langHtml = languageFlagHtml(p.language);
    var langRow = langHtml
      ? '<div class="eazy-research-card__stats-lang">' + langHtml + "</div>"
      : "";
    var relScore = p.relevance_score != null && isFinite(Number(p.relevance_score))
      ? String(p.relevance_score)
      : "—";
    var statsHtml =
      '<div class="eazy-research-card__stats">' +
        '<div class="eazy-research-card__stats-cols">' +
          '<div class="eazy-research-card__stat">' +
            '<span class="eazy-research-card__stat-label">' + esc(t("creator.research.bsr_label", "BSR")) + "</span>" +
            '<span class="eazy-research-card__stat-value">' + esc(bsrValue) + deltaHtml + "</span>" +
          "</div>" +
          '<div class="eazy-research-card__stat eazy-research-card__stat--cat">' +
            '<span class="eazy-research-card__stat-label">' + esc(t("creator.research.cat_rank", "Cat. rank")) + "</span>" +
            '<span class="eazy-research-card__stat-value" title="' +
              esc(t("creator.research.relevance_hint", "Score 1–100 from this listing's BSR in its own marketplace category. Not demand or sales.")) +
            '"><span class="eazy-research-card__stat-dot" aria-hidden="true"></span>' + esc(relScore) + "</span>" +
          "</div>" +
        "</div>" +
        langRow +
      "</div>";
    return (
      '<article class="eazy-research-card" data-asin="' + esc(p.asin) +
        '" data-marketplace="' + esc(marketplaceHost(p)) + '">' +
        '<button type="button" class="eazy-research-card__watch' + (watched ? " is-on" : "") +
          '" data-erz-watch="' + esc(p.asin) + '" data-marketplace="' + esc(marketplaceHost(p)) +
          '" aria-pressed="' + (watched ? "true" : "false") +
          '" aria-label="' + esc(watchLabel) + '">' + HEART_SVG + "</button>" +
        '<button type="button" class="eazy-research-card__hit" data-erz-open="' + esc(p.asin) +
          '" data-marketplace="' + esc(marketplaceHost(p)) + '">' +
          '<div class="eazy-research-card__media">' + img + "</div>" +
          '<div class="eazy-research-card__body">' +
            "<h3>" + esc(p.title || p.asin) + "</h3>" +
            statsHtml +
            catLine +
            topicHtml +
            reviewsHtml +
          "</div>" +
        "</button>" +
        '<details class="eazy-research-card__menu">' +
          "<summary aria-label=\"" + esc(t("creator.research.menu", "Product actions")) + "\">⋯</summary>" +
          '<div class="eazy-research-card__menu-list">' +
            '<a href="' + esc(amazonUrl(p)) + '" target="_blank" rel="noopener noreferrer">' + esc(t("creator.research.open_source", "Open on Amazon")) + "</a>" +
            '<button type="button" data-erz-watch="' + esc(p.asin) + '" data-marketplace="' + esc(marketplaceHost(p)) + '">' +
              esc(watched ? t("creator.research.watch_remove", "Remove from watchlist") : t("creator.research.watch", "Watch")) +
            "</button>" +
            '<button type="button" data-erz-gen>' + esc(t("creator.research.send_generator", "Send to Generator")) + "</button>" +
          "</div>" +
        "</details>" +
      "</article>"
    );
  }

  function selectedTopics() {
    return Array.isArray(state.nichesSelected) ? state.nichesSelected : [];
  }

  function isAllTopics() {
    return selectedTopics().length === 0;
  }

  function checkRow(attr, key, label, group, selected) {
    var on = selected.indexOf(key) !== -1;
    var count = facetCount(group, key);
    return (
      '<label class="eazy-research__check' + (on ? " is-on" : "") + '">' +
        '<input type="checkbox" ' + attr + '="' + esc(key) + '"' + (on ? " checked" : "") + ">" +
        "<span>" + esc(label) + "</span>" +
        '<span class="eazy-research__count">' + esc(String(count)) + "</span>" +
      "</label>"
    );
  }

  function renderChips(root) {
    var wrap = root.querySelector("[data-erz-chips]");
    if (!wrap) return;
    var selected = selectedTopics();
    var facetTopics = (state.facets && state.facets.topics) || [];
    var packMap = {};
    (state.niches || []).forEach(function (n) {
      var key = n.niche_key || n.key;
      if (key) packMap[key] = n.label || key;
    });
    var rows = facetTopics.filter(function (f) { return f.key && f.key !== "user_search"; });
    if (!rows.length) {
      rows = (state.niches || []).map(function (n) {
        var key = n.niche_key || n.key;
        return { key: key, count: facetCount("topics", key), label: n.label || key };
      }).filter(function (n) { return n.key && n.key !== "user_search"; });
    }
    var html = rows.map(function (n) {
      var key = n.key || n.niche_key;
      var label = n.label || packMap[key] || key;
      return checkRow("data-erz-niche", key, label, "topics", selected);
    }).join("");
    withResearchScroll(root, function () {
      wrap.innerHTML = html;
    });
    var hint = root.querySelector("[data-erz-topics-hint]");
    if (hint) hint.hidden = !isAllTopics();
  }

  function syncChecks(root, selector, attr, selected) {
    root.querySelectorAll(selector).forEach(function (input) {
      var key = input.getAttribute(attr) || "";
      var on = selected.indexOf(key) !== -1;
      input.checked = on;
      var row = input.closest(".eazy-research__check");
      if (row) row.classList.toggle("is-on", on);
    });
  }

  function renderCounts(root) {
    root.querySelectorAll("[data-erz-count]").forEach(function (el) {
      var raw = el.getAttribute("data-erz-count") || "";
      var parts = raw.split(":");
      if (parts.length !== 2) return;
      el.textContent = String(facetCount(parts[0], parts[1]));
    });
  }

  function setCountryMenuOpen(root, open) {
    var wrap = root.querySelector("[data-erz-country-wrap]");
    var btn = root.querySelector("[data-erz-country-btn]");
    var menu = root.querySelector("[data-erz-country-menu]");
    if (!wrap || !btn || !menu) return;
    wrap.classList.toggle("is-open", !!open);
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function syncCountryButton(root) {
    var host = state.marketplace || "all";
    var label = host === "all"
      ? t("creator.research.country_all", "All countries")
      : t(COUNTRY_I18N[host] || "", COUNTRY_FALLBACK[host] || host);
    var labelEl = root.querySelector("[data-erz-country-label]");
    var flagEl = root.querySelector("[data-erz-country-flag]");
    if (labelEl) labelEl.textContent = label;
    var cc = flagForMarketplace(host);
    if (flagEl) {
      if (cc) {
        flagEl.style.backgroundImage = "url(" + flagUrl(cc) + ")";
        flagEl.classList.remove("is-empty");
        flagEl.hidden = false;
      } else {
        flagEl.style.backgroundImage = "";
        flagEl.classList.add("is-empty");
        flagEl.hidden = true;
      }
    }
  }

  function renderCountry(root) {
    var select = root.querySelector("[data-erz-country]");
    if (!select) return;
    var hosts = (state.marketplaces || []).map(function (m) { return m.host; });
    if (!hosts.length) {
      hosts = ["amazon.de", "amazon.co.uk", "amazon.fr", "amazon.it", "amazon.es", "amazon.com", "amazon.ca"];
    }
    var options = [{ host: "all", label: t("creator.research.country_all", "All countries") }].concat(
      hosts.map(function (host) {
        return {
          host: host,
          label: t(COUNTRY_I18N[host] || "", COUNTRY_FALLBACK[host] || host),
        };
      })
    );
    var html = options.map(function (o) {
      return '<option value="' + esc(o.host) + '"' + (state.marketplace === o.host ? " selected" : "") + ">" +
        esc(o.label) + "</option>";
    }).join("");
    if (select.innerHTML !== html) select.innerHTML = html;
    if (select.value !== state.marketplace) select.value = state.marketplace || "all";
    var menu = root.querySelector("[data-erz-country-menu]");
    if (menu) {
      var menuHtml = options.map(function (o) {
        var on = (state.marketplace || "all") === o.host;
        var cc = flagForMarketplace(o.host);
        return '<button type="button" class="eazy-research__country-opt' + (on ? " is-on" : "") +
          '" data-erz-country-opt="' + esc(o.host) + '" role="option" aria-selected="' + (on ? "true" : "false") + '">' +
          (cc ? flagCircleHtml(cc) : '<span class="eazy-research__flag is-empty" aria-hidden="true"></span>') +
          "<span>" + esc(o.label) + "</span></button>";
      }).join("");
      if (menu.innerHTML !== menuHtml) menu.innerHTML = menuHtml;
    }
    syncCountryButton(root);
  }

  function renderFacets(root) {
    syncChecks(root, "[data-erz-type]", "data-erz-type", state.designTypesSelected || []);
    syncChecks(root, "[data-erz-lang]", "data-erz-lang", state.languagesSelected || []);
    syncChecks(root, "[data-erz-pers]", "data-erz-pers", state.personalizationsSelected || []);
    syncChecks(root, "[data-erz-audience]", "data-erz-audience", state.audiencesSelected || []);
    renderCounts(root);
    var typeHint = root.querySelector("[data-erz-type-hint]");
    if (typeHint) typeHint.hidden = !!(state.designTypesSelected && state.designTypesSelected.length);
    var langHint = root.querySelector("[data-erz-lang-hint]");
    if (langHint) langHint.hidden = !!(state.languagesSelected && state.languagesSelected.length);
    var persHint = root.querySelector("[data-erz-pers-hint]");
    if (persHint) persHint.hidden = !!(state.personalizationsSelected && state.personalizationsSelected.length);
    var audHint = root.querySelector("[data-erz-audience-hint]");
    if (audHint) audHint.hidden = !(state.audiencesSelected && state.audiencesSelected.length === 0);
    renderCountry(root);
  }

  function renderGrid(root) {
    var grid = root.querySelector("[data-erz-grid]");
    var empty = root.querySelector("[data-erz-empty]");
    if (!grid) return;
    var showSkeleton = (state.loading && !state.products.length) || (state.analyzing && !state.products.length);
    if (showSkeleton) {
      withResearchScroll(root, function () {
        grid.innerHTML = Array.from({ length: 8 }).map(function () {
          return '<div class="eazy-research-card is-skeleton" aria-hidden="true"></div>';
        }).join("");
        grid.removeAttribute("data-erz-sig");
      });
      if (empty) empty.hidden = true;
      return;
    }
    var rows = visibleProducts();
    if (!rows.length) {
      withResearchScroll(root, function () {
        grid.innerHTML = "";
        grid.removeAttribute("data-erz-sig");
      });
      if (empty) {
        empty.hidden = false;
        empty.textContent = emptyGridCopy();
      }
      return;
    }
    if (empty) empty.hidden = true;
    var sig = rows.map(function (p) { return watchId(p) + (isWatched(p) ? "#1" : "#0"); }).join("|");
    if (grid.getAttribute("data-erz-sig") === sig) return;
    withResearchScroll(root, function () {
      grid.innerHTML = rows.map(productCard).join("");
      grid.setAttribute("data-erz-sig", sig);
    });
  }

  function emptyGridCopy() {
    if (state.searchId && !state.analyzing) {
      if (state.searchEmptyReason === "catalog_empty") {
        return t("creator.research.analyze_no_amazon", "Amazon catalog had no matches for this search. Try a more specific term such as vegan t-shirt.");
      }
      if (state.searchEmptyReason === "filtered_reprint") {
        return t("creator.research.analyze_no_reprint", "Amazon returned {n} products, but none are reprint-safe.")
          .replace("{n}", String(state.searchAmazonReturned || 0));
      }
      if (state.searchEmptyReason === "error") {
        return t("creator.research.analyze_error", "Live catalog search could not start.");
      }
    }
    if (state.view === "watched") {
      return t("creator.research.empty_watched", "No watched products yet. Tap the heart on a product to start tracking it.");
    }
    if (state.q || !isAllTopics() || (state.designTypesSelected && state.designTypesSelected.length) || (state.languagesSelected && state.languagesSelected.length) || (state.personalizationsSelected && state.personalizationsSelected.length) || (state.audiencesSelected && state.audiencesSelected.length) || (state.marketplace && state.marketplace !== "all")) {
      return t("creator.research.empty_search", "No reprint-safe products match this search. Try a broader niche such as Coffee or Hiking.");
    }
    return t("creator.research.empty_action", "Pick a topic or type a search to explore reprint-safe products.");
  }

  function renderStatus(root) {
    var banner = root.querySelector("[data-erz-banner]");
    if (banner) banner.hidden = !state.preview;
    var status = root.querySelector("[data-erz-status]");
    if (!status) return;
    if (state.preview) {
      var count = state.products.length;
      var ago = state.lastRun && state.lastRun.collected_at ? timeAgo(state.lastRun.collected_at) : "";
      status.textContent = t("creator.research.collector_ok", "Collector · preview") +
        " · " + count +
        (ago ? " · " + ago : "");
      return;
    }
    if (state.searchId) {
      if (state.analyzing) {
        status.textContent = t("creator.research.analyze_loading", "Analyzing…");
        return;
      }
      var found = visibleProducts().length;
      if (found) {
        status.textContent = t("creator.research.analyze_found", "{n} products found").replace("{n}", String(found));
        return;
      }
      status.textContent = emptyGridCopy();
      return;
    }
    var last = state.lastRun;
    status.textContent = last
      ? t("creator.research.last_run", "Last snapshot") + " · " + (last.niche_pack || "") +
        (last.collected_at ? " · " + timeAgo(last.collected_at) : "")
      : t("creator.research.empty", "No Amazon snapshots yet. Official catalog collection runs in the background.");
  }

  function render(root) {
    renderChips(root);
    renderFacets(root);
    renderGrid(root);
    renderStatus(root);
    var viewSelect = root.querySelector("[data-erz-view-select]");
    if (viewSelect && viewSelect.value !== state.view) viewSelect.value = state.view;
    root.querySelectorAll("[data-erz-view]").forEach(function (btn) {
      var on = btn.getAttribute("data-erz-view") === state.view;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    syncAnalyzeButton(root);
  }

  function statRow(label, value) {
    return (
      '<div class="eazy-research-modal__stat">' +
        '<span class="eazy-research-modal__stat-label">' + esc(label) + "</span>" +
        '<span class="eazy-research-modal__stat-value">' + esc(value) + "</span>" +
      "</div>"
    );
  }

  function statRowHtml(label, html) {
    return (
      '<div class="eazy-research-modal__stat">' +
        '<span class="eazy-research-modal__stat-label">' + esc(label) + "</span>" +
        '<span class="eazy-research-modal__stat-value eazy-research-modal__stat-value--flags">' + html + "</span>" +
      "</div>"
    );
  }

  function detailHtml(p) {
    var reviewsCount = p.latest && p.latest.reviews_count != null ? Number(p.latest.reviews_count) : null;
    var reviewsRow = reviewsCount != null && isFinite(reviewsCount)
      ? statRow(t("creator.research.reviews_total", "Reviews total"), String(reviewsCount))
      : "";
    var change = bsrChange(p);
    var changeRow = change
      ? statRow(t("creator.research.bsr_change", "BSR change"), change.label)
      : "";
    var topics = displayTopicLabels(p);
    var tag = marketplaceTag(p);
    var marketFlag = flagForMarketplace(marketplaceHost(p));
    var marketHtml = tag
      ? (marketFlag ? flagCircleHtml(marketFlag) : "") +
        '<span class="eazy-research__lang-code" translate="no">' + esc(tag) + "</span>"
      : "";
    var lang = languageFlagHtml(p.language);
    var tags = Array.isArray(p.tags) ? p.tags.filter(Boolean) : [];
    var pers = Number(p.personalizable) === 1 || p.personalization === "personalizable";
    var rel = p.relevance_score != null && isFinite(Number(p.relevance_score))
      ? statRow(
          t("creator.research.relevance", "Category rank"),
          t("creator.research.relevance_value", "{n}").replace("{n}", String(p.relevance_score))
        )
      : "";
    var designType = p.design_type
      ? t("creator.quick_inspirations.content_type_" + p.design_type, String(p.design_type).replace(/_/g, " "))
      : "";
    return (
      '<div class="eazy-research-modal__layout">' +
        '<div class="eazy-research-modal__media">' +
          (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="">' : "") +
        "</div>" +
        '<div class="eazy-research-modal__info">' +
          '<h3 id="eazy-research-modal-title">' + esc(p.title || p.asin) + "</h3>" +
          '<div class="eazy-research-modal__stats">' +
            (p.brand ? statRow(t("creator.research.brand", "Brand"), p.brand) : "") +
            (marketHtml ? statRowHtml(t("creator.research.marketplace", "Marketplace"), marketHtml) : "") +
            statRow(t("creator.research.bsr_label", "BSR"), fmtBsr(p)) +
            changeRow +
            rel +
            reviewsRow +
            (topics.length ? statRow(t("creator.research.topic", "Topic"), topics.join(" · ")) : "") +
            (designType ? statRow(t("creator.research.design_type", "Design type"), designType) : "") +
            (lang ? statRowHtml(t("creator.research.language", "Language"), lang) : "") +
            statRow(
              t("creator.research.custom_design", "Custom Design"),
              pers ? t("creator.research.yes", "Yes") : t("creator.research.no", "No")
            ) +
            (tags.length ? statRow(t("creator.research.tags", "Tags"), tags.join(", ")) : "") +
            (p.prompt ? statRow(t("creator.research.prompt", "Prompt"), p.prompt) : "") +
          "</div>" +
          '<p class="eazy-research-modal__hint">' +
            esc(t("creator.research.relevance_hint", "Score 1–100 from this listing's BSR in its own marketplace category. Not demand or sales.")) +
          "</p>" +
        "</div>" +
      "</div>"
    );
  }

  /**
   * Hub chrome (header z-index 150, daily-limits 145, footer 150) is a sibling of
   * `.creator-desktop-main` (z-index 120, overflow:hidden). Research also lives in
   * overflow:hidden hosts (stage panel, [data-partial], .eazy-research). A local
   * z-index of 220 only stacks inside that context — move the modal to body.
   */
  function findResearchModal(root) {
    if (document.body) {
      var kids = document.body.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].hasAttribute && kids[i].hasAttribute("data-erz-modal")) return kids[i];
      }
    }
    if (root) {
      var nested = root.querySelector("[data-erz-modal]");
      if (nested) return nested;
    }
    return document.querySelector("[data-erz-modal]");
  }

  function portalResearchModal(modal) {
    if (!modal || !document.body) return modal;
    if (modal.parentNode !== document.body) document.body.appendChild(modal);
    return modal;
  }

  async function openDetail(root, asin, marketplace) {
    var modal = portalResearchModal(findResearchModal(root));
    var box = modal && modal.querySelector("[data-erz-detail]");
    if (!modal || !box) return;
    modal.hidden = false;
    box.innerHTML = "<p>" + esc(t("creator.research.loading", "Loading...")) + "</p>";
    var host = String(marketplace || "").trim().toLowerCase();
    var local = (state.products || []).find(function (x) {
      return x.asin === asin && (!host || marketplaceHost(x) === host);
    }) || null;
    var params = { asin: asin };
    if (host) params.marketplace = host;
    var data = await api("eazy-research-product", params).catch(function () { return null; });
    var p = (data && data.product) || local;
    if (!p) {
      box.innerHTML = "<p>" + esc(t("creator.research.not_found", "Product not found.")) + "</p>";
      return;
    }
    if (local) {
      if (p.review_delta == null && local.review_delta != null) p.review_delta = local.review_delta;
      if (!p.review_delta_window && local.review_delta_window) p.review_delta_window = local.review_delta_window;
      if (p.bsr_delta == null && local.bsr_delta != null) p.bsr_delta = local.bsr_delta;
      if (p.bsr_improved == null && local.bsr_improved != null) p.bsr_improved = local.bsr_improved;
      if (!p.bsr_category && local.bsr_category) p.bsr_category = local.bsr_category;
      if (!p.niche_key && local.niche_key) p.niche_key = local.niche_key;
      if (p.latest && local.latest && !p.latest.bsr_category && local.latest.bsr_category) {
        p.latest.bsr_category = local.latest.bsr_category;
      }
    }
    box.innerHTML = detailHtml(p);
  }

  function closeDetail(root) {
    var modal = findResearchModal(root);
    if (modal) modal.hidden = true;
  }

  function applyAnalyzeLimits(limits) {
    if (!limits || typeof limits !== "object") return;
    state.analyzeLimits = {
      used: Number(limits.used) || 0,
      remaining: limits.remaining == null ? 5 : Number(limits.remaining) || 0,
      limit: Number(limits.limit) || 5,
      busy: Boolean(limits.busy),
      retry_after_ms: Number(limits.retry_after_ms) || 0,
    };
  }

  function syncAnalyzeButton(root) {
    var btn = root.querySelector("[data-erz-analyze]");
    if (!btn) return;
    var logged = isLoggedIn();
    var lim = state.analyzeLimits || { remaining: 5, limit: 5 };
    btn.disabled = state.analyzing;
    btn.textContent = state.analyzing
      ? t("creator.research.analyze_loading", "Analyzing…")
      : t("creator.research.analyze_remaining", "Analyze ({remaining}/{limit})")
          .replace("{remaining}", String(lim.remaining))
          .replace("{limit}", String(lim.limit));
    if (!logged) btn.setAttribute("title", t("creator.research.analyze_login", "Log in to run a live catalog search."));
    else if (lim.busy) btn.setAttribute("title", t("creator.research.analyze_busy", "Another Analyze is running. Please wait a few seconds."));
    else btn.removeAttribute("title");
  }

  function stopSearchPoll() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function applySearchProducts(root, products) {
    state.products = Array.isArray(products) ? products : [];
    renderGrid(root);
  }

  async function pollSearch(root) {
    if (!state.searchId || !state.analyzing) return;
    var data = await api("eazy-research-search-status", { search_id: state.searchId }).catch(function () { return null; });
    if (!state.analyzing || !state.searchId) return;
    if (data && data.ok) {
      applySearchProducts(root, data.products || []);
      state.searchEmptyReason = data.empty_reason || "";
      state.searchAmazonReturned = Number(data.amazon_returned) || 0;
      state.searchBlocked = Number(data.blocked) || 0;
      if (data.done || data.status === "done" || data.status === "error") {
        state.analyzing = false;
        stopSearchPoll();
        if (data.status === "error") {
          state.searchEmptyReason = "error";
        }
        render(root);
        return;
      }
    }
    state.pollTimer = setTimeout(function () { pollSearch(root); }, 900);
  }

  async function startAnalyze(root) {
    if (state.analyzing) return;
    if (!isLoggedIn()) {
      showLoginOverlay();
      var status = root.querySelector("[data-erz-status]");
      if (status) status.textContent = t("creator.research.analyze_login", "Log in to run a live catalog search.");
      return;
    }
    var qEl = root.querySelector("[data-erz-q]");
    var q = String((qEl && qEl.value) || state.q || "").trim();
    var placeholder = String((qEl && qEl.getAttribute("placeholder")) || "").trim();
    if (placeholder && q.toLowerCase() === placeholder.toLowerCase()) q = "";
    state.q = q;
    if (!q) {
      var emptyStatus = root.querySelector("[data-erz-status]");
      if (emptyStatus) emptyStatus.textContent = t("creator.research.analyze_empty_query", "Type a search before Analyze.");
      return;
    }
    stopSearchPoll();
    state.analyzing = true;
    state.searchId = "";
    state.searchEmptyReason = "running";
    state.searchAmazonReturned = 0;
    state.searchBlocked = 0;
    state.products = [];
    state.loading = false;
    state.nichesSelected = [];
    state.designTypesSelected = [];
    state.languagesSelected = [];
    state.personalizationsSelected = [];
    state.audiencesSelected = [];
    state.view = "opportunities";
    render(root);
    var body = { q: q };
    if (state.marketplace && state.marketplace !== "all") body.marketplace = state.marketplace;
    var data = await api("eazy-research-analyze-search", { q: q }, {
      method: "POST",
      body: body,
    }).catch(function (err) {
      return (err && err.body) || { ok: false, error: (err && err.status) || "network" };
    });
    if (!data || !data.ok) {
      state.analyzing = false;
      var msg = t("creator.research.analyze_error", "Live catalog search could not start.");
      if (data && data.error === "login_required") msg = t("creator.research.analyze_login", "Log in to run a live catalog search.");
      if (data && data.error === "cooldown") msg = t("creator.research.analyze_cooldown", "Please wait before another live search.");
      if (data && data.error === "daily_limit") msg = t("creator.research.analyze_daily_limit", "Daily live search limit reached (5 per UTC day).");
      if (data && data.error === "busy") msg = t("creator.research.analyze_busy", "Another Analyze is running. Please wait a few seconds.");
      if (data && (data.remaining != null || data.daily)) {
        applyAnalyzeLimits(data.daily || data);
      }
      var errStatus = root.querySelector("[data-erz-status]");
      if (errStatus) errStatus.textContent = msg;
      render(root);
      return;
    }
    state.searchId = data.search_id || "";
    applyAnalyzeLimits(data.daily);
    pollSearch(root);
  }

  function catalogListParams(offset) {
    var params = {
      reprint_ok: 1,
      limit: state.pageSize || 80,
      offset: Math.max(0, Number(offset) || 0),
      sort: state.sort,
      view: state.view === "watched" ? "opportunities" : (state.view || "opportunities"),
    };
    var q = String(state.q || "").trim();
    if (q) params.q = q;
    if (state.marketplace && state.marketplace !== "all") params.marketplace = state.marketplace;
    if (selectedTopics().length) params.niche = selectedTopics().join(",");
    if (state.designTypesSelected && state.designTypesSelected.length) params.design_type = state.designTypesSelected.join(",");
    if (state.languagesSelected && state.languagesSelected.length) params.language = state.languagesSelected.join(",");
    if (state.personalizationsSelected && state.personalizationsSelected.length) params.personalization = state.personalizationsSelected.join(",");
    if (state.audiencesSelected && state.audiencesSelected.length) params.audience = state.audiencesSelected.join(",");
    return params;
  }

  function resetGridScroll(root) {
    var refs = scrollerRefs(root);
    if (refs.grid) refs.grid.scrollTop = 0;
  }

  async function load(root, opts) {
    opts = opts || {};
    var append = !!opts.append;
    if (state.analyzing) return;
    if (state.searchId) return;
    if (!append && state.view === "watched") {
      render(root);
      return;
    }
    if (append && (state.loadingMore || state.loading || !state.hasMore)) return;
    var offset = append ? state.products.length : 0;
    state.loadGen += 1;
    var gen = state.loadGen;
    if (append) {
      state.loadingMore = true;
    } else {
      state.loading = true;
      state.hasMore = false;
      state.products = [];
      renderGrid(root);
    }
    var data = await api("eazy-research-products", catalogListParams(offset)).catch(function () { return null; });
    if (gen !== state.loadGen) return;
    if (state.analyzing) return;
    state.loading = false;
    state.loadingMore = false;
    if (!data || !data.ok) {
      var status = root.querySelector("[data-erz-status]");
      if (status) status.textContent = t("creator.research.error", "Research data could not be loaded.");
      if (!append) state.products = [];
      renderGrid(root);
      return;
    }
    state.preview = Boolean(data.preview);
    var page = data.products || [];
    if (!state.searchId) {
      state.products = append ? state.products.concat(page) : page;
    }
    state.hasMore = Boolean(data.has_more);
    state.niches = data.niches || [];
    state.facets = data.facets || state.facets;
    state.marketplaces = data.marketplaces || state.marketplaces;
    applyAnalyzeLimits(data.analyze_limits);
    state.lastRun = data.last_run || null;
    render(root);
    if (!append) resetGridScroll(root);
  }

  function maybeLoadMore(root) {
    if (state.analyzing || state.searchId || state.view === "watched") return;
    if (state.loading || state.loadingMore || !state.hasMore) return;
    var refs = scrollerRefs(root);
    var scroller = refs.grid;
    if (!scroller) return;
    var remain = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (remain < 320) load(root, { append: true });
  }

  function isFiltersCollapsedStored() {
    try {
      return global.localStorage && global.localStorage.getItem(FILTER_COLLAPSE_KEY) === "1";
    } catch (_e) {
      return false;
    }
  }

  function filterRailPhrase(kind, rail) {
    var key = kind === "expand" ? "creator.research.filter_expand" : "creator.research.filter_collapse";
    var fallback = kind === "expand" ? "Expand filters" : "Collapse filters";
    var fromDom = rail && rail.getAttribute(kind === "expand" ? "data-expand-label" : "data-collapse-label");
    return t(key, fromDom || fallback);
  }

  function applyFiltersCollapsed(root, collapsed) {
    var wrap = root.querySelector("[data-erz-filters-wrap]");
    var rail = root.querySelector("[data-erz-filter-toggle]");
    if (!wrap) return;
    wrap.classList.toggle("is-collapsed", !!collapsed);
    if (rail) {
      rail.setAttribute("aria-expanded", collapsed ? "false" : "true");
      var phrase = filterRailPhrase(collapsed ? "expand" : "collapse", rail);
      rail.setAttribute("aria-label", phrase);
      rail.setAttribute("title", phrase);
    }
    try {
      if (global.localStorage) global.localStorage.setItem(FILTER_COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch (_store) { /* guest storage may be blocked */ }
  }

  function applyFiltersSheet(root, open) {
    root.classList.toggle("is-filters-open", !!open);
    var backdrop = root.querySelector("[data-erz-filters-backdrop]");
    if (backdrop) backdrop.hidden = !open;
    var openBtn = root.querySelector("[data-erz-filters-open]");
    if (openBtn) openBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toggleTopic(key) {
    var next = selectedTopics().slice();
    if (!key || key === "all") {
      state.nichesSelected = [];
      return;
    }
    var idx = next.indexOf(key);
    if (idx === -1) next.push(key);
    else next.splice(idx, 1);
    state.nichesSelected = next;
  }

  function toggleAudience(key) {
    var next = Array.isArray(state.audiencesSelected) ? state.audiencesSelected.slice() : [];
    if (!key || key === "all") {
      state.audiencesSelected = [];
      return;
    }
    var idx = next.indexOf(key);
    if (idx === -1) next.push(key);
    else next.splice(idx, 1);
    state.audiencesSelected = next;
  }

  function bind(root) {
    var qTimer = null;
    var toolbar = root.querySelector("[data-erz-toolbar]");
    if (toolbar) {
      toolbar.addEventListener("submit", function (ev) {
        ev.preventDefault();
        startAnalyze(root);
      });
    }
    var q = root.querySelector("[data-erz-q]");
    if (q) {
      q.addEventListener("input", function () {
        state.q = q.value || "";
        clearTimeout(qTimer);
        qTimer = setTimeout(function () {
          if (state.searchId || state.view === "watched") renderGrid(root);
          else load(root);
        }, 180);
      });
      q.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          startAnalyze(root);
        }
      });
    }
    var sort = root.querySelector("[data-erz-sort]");
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value || "review_growth";
        if (state.searchId || state.view === "watched") renderGrid(root);
        else load(root);
      });
    }
    var viewSelect = root.querySelector("[data-erz-view-select]");
    if (viewSelect) {
      viewSelect.addEventListener("change", function () {
        state.view = viewSelect.value || "opportunities";
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
      });
    }
    var analyzeBtn = root.querySelector("[data-erz-analyze]");
    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", function () { startAnalyze(root); });
    }
    applyFiltersCollapsed(root, isFiltersCollapsedStored());
    applyFiltersSheet(root, false);
    var rail = root.querySelector("[data-erz-filter-toggle]");
    if (rail) {
      rail.addEventListener("click", function () {
        var wrap = root.querySelector("[data-erz-filters-wrap]");
        applyFiltersCollapsed(root, !(wrap && wrap.classList.contains("is-collapsed")));
      });
    }
    var openBtn = root.querySelector("[data-erz-filters-open]");
    if (openBtn) {
      openBtn.addEventListener("click", function () { applyFiltersSheet(root, true); });
    }
    var backdrop = root.querySelector("[data-erz-filters-backdrop]");
    if (backdrop) {
      backdrop.addEventListener("click", function () { applyFiltersSheet(root, false); });
    }
    var country = root.querySelector("[data-erz-country]");
    if (country) {
      country.addEventListener("change", function () {
        state.marketplace = country.value || "all";
        setCountryMenuOpen(root, false);
        if (!state.searchId) load(root);
        else render(root);
      });
    }
    function readChecked(selector, attr) {
      return Array.prototype.map.call(root.querySelectorAll(selector + ":checked"), function (el) {
        return el.getAttribute(attr);
      }).filter(Boolean);
    }
    root.addEventListener("change", function (ev) {
      var tEl = ev.target;
      if (!tEl) return;
      if (tEl.hasAttribute("data-erz-niche") || (tEl.closest && tEl.closest("[data-erz-chips]"))) {
        state.nichesSelected = readChecked("[data-erz-niche]", "data-erz-niche");
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
        return;
      }
      if (tEl.hasAttribute("data-erz-type")) {
        state.designTypesSelected = readChecked("[data-erz-type]", "data-erz-type");
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
        return;
      }
      if (tEl.hasAttribute("data-erz-lang")) {
        state.languagesSelected = readChecked("[data-erz-lang]", "data-erz-lang");
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
        return;
      }
      if (tEl.hasAttribute("data-erz-pers")) {
        state.personalizationsSelected = readChecked("[data-erz-pers]", "data-erz-pers");
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
        return;
      }
      if (tEl.hasAttribute("data-erz-audience")) {
        state.audiencesSelected = readChecked("[data-erz-audience]", "data-erz-audience");
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
      }
    });
    root.addEventListener("click", function (ev) {
      var countryBtn = ev.target.closest("[data-erz-country-btn]");
      if (countryBtn && root.contains(countryBtn)) {
        ev.preventDefault();
        var wrap = root.querySelector("[data-erz-country-wrap]");
        setCountryMenuOpen(root, !(wrap && wrap.classList.contains("is-open")));
        return;
      }
      var countryOpt = ev.target.closest("[data-erz-country-opt]");
      if (countryOpt && root.contains(countryOpt)) {
        ev.preventDefault();
        var host = countryOpt.getAttribute("data-erz-country-opt") || "all";
        var select = root.querySelector("[data-erz-country]");
        state.marketplace = host;
        if (select) select.value = host;
        setCountryMenuOpen(root, false);
        if (!state.searchId) load(root);
        else render(root);
        return;
      }
      if (!ev.target.closest("[data-erz-country-wrap]")) {
        setCountryMenuOpen(root, false);
      }
      var watch = ev.target.closest("[data-erz-watch]");
      if (watch) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleWatch({
          asin: watch.getAttribute("data-erz-watch"),
          marketplace: watch.getAttribute("data-marketplace"),
        });
        render(root);
        return;
      }
      var tab = ev.target.closest("[data-erz-view]");
      if (tab) {
        state.view = tab.getAttribute("data-erz-view") || "opportunities";
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
        return;
      }
      var open = ev.target.closest("[data-erz-open]");
      if (open) {
        openDetail(root, open.getAttribute("data-erz-open"), open.getAttribute("data-marketplace"));
        return;
      }
      if (ev.target.closest("[data-erz-gen]")) {
        goGenerator();
      }
    });
  }

  function bindModal(root) {
    var modal = portalResearchModal(findResearchModal(root));
    if (!modal || modal.dataset.erzBound === "1") return;
    modal.dataset.erzBound = "1";
    modal.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-erz-close]")) closeDetail(root);
      if (ev.target.closest("[data-erz-gen]")) goGenerator();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        setCountryMenuOpen(root, false);
        applyFiltersSheet(root, false);
        closeDetail(root);
      }
    });
  }

  function mount(root) {
    if (!root || root.dataset.erzBound === "1") return;
    root.dataset.erzBound = "1";
    scrollerRefs(root);
    state.watched = loadWatched();
    bind(root);
    var gridScroll = root.querySelector("[data-erz-grid-scroll]");
    if (gridScroll && gridScroll.dataset.erzPager !== "1") {
      gridScroll.dataset.erzPager = "1";
      gridScroll.addEventListener("scroll", function () { maybeLoadMore(root); });
    }
    bindModal(root);
    bindDocumentUi();
    syncAnalyzeButton(root);
    load(root);
  }

  var docUiBound = false;
  function bindDocumentUi() {
    if (docUiBound) return;
    docUiBound = true;
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-erz-analyze]");
      if (!btn) return;
      var host = btn.closest("[data-eazy-research]");
      if (host) startAnalyze(host);
    });
    document.addEventListener("eazCreatorContextReady", function () {
      document.querySelectorAll("[data-eazy-research]").forEach(function (el) {
        if (el.dataset.erzBound === "1") {
          syncAnalyzeButton(el);
          return;
        }
        mount(el);
      });
    });
  }

  function boot() {
    document.querySelectorAll("[data-eazy-research]").forEach(mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.EazyResearchPage = {
    boot: boot,
    load: load,
    startAnalyze: startAnalyze,
    isLoggedIn: isLoggedIn,
    preserveScrollTop: function (el, mutate) {
      var top = captureScrollTop(el);
      if (typeof mutate === "function") mutate();
      return restoreScrollTop(el, top);
    },
    scrollerRefs: scrollerRefs,
  };
})(typeof window !== "undefined" ? window : globalThis);
