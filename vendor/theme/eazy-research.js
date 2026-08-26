/**
 * eazy Research creator page — reprint-safe Amazon snapshots.
 * Cards: image, title, KI topic, language flag, category-rank, BSR. No invented sales.
 */
(function (global) {
  "use strict";

  var WATCH_KEY = "eazy-research-watched";
  var FILTER_COLLAPSE_KEY = "eazy-research-filters-collapsed";
  /* true = Abschnitt offen. Topics bleibt offen, der Rest startet zugeklappt. */
  var FILTER_FOLDS_KEY = "eazy-research-filter-folds";
  var FILTER_FOLD_DEFAULTS = {
    topics: true,
    audience: false,
    custom_design: false,
    design_type: false,
    language: false,
    opportunity: false,
  };
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
  var ANALYZE_LANGS = [
    { id: "en", key: "creator.research.lang_en", fallback: "English", flag: "GB" },
    { id: "de", key: "creator.research.lang_de", fallback: "German", flag: "DE" },
    { id: "es", key: "creator.research.lang_es", fallback: "Spanish", flag: "ES" },
    { id: "fr", key: "creator.research.lang_fr", fallback: "French", flag: "FR" },
    { id: "it", key: "creator.research.lang_it", fallback: "Italian", flag: "IT" },
  ];
  var SORT_OPTIONS = [
    { id: "review_growth", defDir: "desc" },
    { id: "reviews", defDir: "desc" },
    { id: "bsr", defDir: "asc" },
    { id: "newest", defDir: "desc" },
  ];
  var TREND_GEOS = [
    { id: "ALL", key: "creator.research.country_all", fallback: "All countries", flag: "" },
    { id: "DE", key: "creator.research.geo_DE", fallback: "Germany", flag: "DE" },
    { id: "US", key: "creator.research.geo_US", fallback: "United States", flag: "US" },
    { id: "GB", key: "creator.research.geo_GB", fallback: "United Kingdom", flag: "GB" },
    { id: "FR", key: "creator.research.geo_FR", fallback: "France", flag: "FR" },
    { id: "IT", key: "creator.research.geo_IT", fallback: "Italy", flag: "IT" },
    { id: "ES", key: "creator.research.geo_ES", fallback: "Spain", flag: "ES" },
    { id: "CA", key: "creator.research.geo_CA", fallback: "Canada", flag: "CA" },
    { id: "AU", key: "creator.research.geo_AU", fallback: "Australia", flag: "AU" },
  ];
  var TREND_SORT_OPTIONS = [
    { id: "volume", defDir: "desc" },
    { id: "keyword", defDir: "asc" },
    { id: "competition", defDir: "desc" },
    { id: "trend", defDir: "desc" },
  ];
  var PRODUCT_TYPE_KEYS = ["tshirt", "hoodie", "mug", "doormat", "tote", "poster", "sticker"];
  var SORT_ARROW_SVG =
    '<svg class="eazy-research__sort-opt-arrow" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 3v8M4 6l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
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
    opportunitySelected: [],
    tab: "ideas",
    sort: "review_growth",
    sortDir: "desc",
    reprintOk: true,
    view: "opportunities",
    analyzeMarketplace: "all",
    analyzeLanguage: "all",
    analyzeResolvedMarketplace: "",
    analyzeResolvedLanguage: "",
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
    pageSize: 32,
    trends: {
      geo: "ALL",
      language: "all",
      topics: [],
      productTypes: [],
      volume: [],
      time: "avg_12m",
      sort: "volume",
      sortDir: "desc",
      q: "",
      searchGeo: "ALL",
      searchLang: "all",
      topicsList: [],
      keywords: [],
      configured: true,
      loading: false,
      searchId: "",
      searching: false,
      hasMore: false,
    },
    trendsLimits: { used: 0, remaining: 5, limit: 5, busy: false },
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
      filters: root.querySelector("[data-erz-filters-scroll]") || root.querySelector("[data-erz-filters]"),
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

  /**
   * Hub keeps two Research trees: desktop host + mobile swipe screen.
   * Shared `state` + one catalog fetch; every bound copy must be painted
   * or desktop stays on leftover skeletons while the hidden mobile grid fills.
   */
  function boundResearchRoots() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-eazy-research]")).filter(function (el) {
      return el && el.dataset.erzBound === "1" && el.isConnected;
    });
  }

  function eachBoundRoot(fn) {
    boundResearchRoots().forEach(fn);
  }

  function primaryResearchRoot() {
    var host = document.getElementById("creatorDesktopResearchHost");
    var desktop = host && host.querySelector("[data-eazy-research]");
    if (desktop && desktop.dataset.erzBound === "1" && desktop.isConnected) return desktop;
    return boundResearchRoots()[0] || null;
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

  function bucketLabel(key) {
    var map = {
      very_low: t("creator.research.volume_very_low", "Very low"),
      low: t("creator.research.volume_low", "Low"),
      medium: t("creator.research.volume_medium", "Medium"),
      high: t("creator.research.volume_high", "High"),
      very_high: t("creator.research.volume_very_high", "Very high"),
    };
    return map[key] || key;
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

  function amazonThumbUrl(url, edge) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    var size = edge || 320;
    try {
      var parsed = new URL(raw);
      var host = String(parsed.hostname || "").toLowerCase();
      if (
        host.indexOf("media-amazon.com") === -1 &&
        host.indexOf("ssl-images-amazon.com") === -1 &&
        host.indexOf("images-amazon.com") === -1
      ) {
        return raw;
      }
      var sized = "._AC_UL" + size + "_";
      if (/\._[^./]+(?=\.[a-zA-Z]+$)/.test(parsed.pathname)) {
        parsed.pathname = parsed.pathname.replace(/\._[^./]+(?=\.[a-zA-Z]+$)/, sized);
      } else if (/\.(jpe?g|png|webp|gif)$/i.test(parsed.pathname)) {
        parsed.pathname = parsed.pathname.replace(/(\.[a-zA-Z]+)$/, sized + "$1");
      }
      return parsed.toString();
    } catch (_e) {
      return raw;
    }
  }

  function cardImageSrc(p) {
    if (!p) return "";
    if (p.image_thumb_url) return p.image_thumb_url;
    return amazonThumbUrl(p.image_url, 320) || p.image_url || "";
  }

  function productCard(p, index) {
    var src = cardImageSrc(p);
    var eager = (Number(index) || 0) < 6;
    var img = src
      ? '<img src="' + esc(src) + '" alt=""' +
        (eager ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"') +
        ">"
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
    var oppHtml = p.opportunity_bucket
      ? '<div class="eazy-research-card__opp"><span class="eazy-research__bucket is-' + esc(p.opportunity_bucket) + '">' +
        esc(t("creator.research.opportunity", "Opportunity") + " · " + bucketLabel(p.opportunity_bucket)) +
        "</span></div>"
      : "";
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
            oppHtml +
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

  function marketplaceHosts() {
    var hosts = (state.marketplaces || []).map(function (m) { return m.host; });
    if (!hosts.length) {
      hosts = ["amazon.de", "amazon.co.uk", "amazon.fr", "amazon.it", "amazon.es", "amazon.com", "amazon.ca"];
    }
    return hosts;
  }

  function countryOptionLabel(host) {
    if (!host || host === "all") return t("creator.research.analyze_all", "All");
    return t(COUNTRY_I18N[host] || "", COUNTRY_FALLBACK[host] || host);
  }

  function defaultSortDir(id) {
    var opt = SORT_OPTIONS.find(function (o) { return o.id === id; });
    return (opt && opt.defDir) || "desc";
  }

  function sortDisplayLabel(id, dir) {
    var d = dir === "asc" ? "asc" : "desc";
    if (id === "newest") return d === "asc"
      ? t("creator.research.sort_oldest_first", "Oldest first")
      : t("creator.research.sort_newest_first", "Newest first");
    if (id === "reviews") return d === "asc"
      ? t("creator.research.sort_reviews_low", "Fewest reviews")
      : t("creator.research.sort_reviews_high", "Most reviews");
    if (id === "bsr") return d === "asc"
      ? t("creator.research.sort_bsr_best", "Best BSR")
      : t("creator.research.sort_bsr_worst", "Highest BSR");
    return d === "asc"
      ? t("creator.research.sort_growth_low", "Lowest growth")
      : t("creator.research.sort_growth_high", "Highest growth");
  }

  function sortFieldLabel(id) {
    if (id === "newest") return t("creator.research.sort_newest", "Newest snapshot");
    if (id === "reviews") return t("creator.research.sort_reviews", "Reviews");
    if (id === "bsr") return t("creator.research.sort_bsr", "BSR");
    return t("creator.research.sort_review_growth", "Review growth");
  }

  function setFlagOn(el, code) {
    if (!el) return;
    var cc = flagCountryCode(code);
    if (cc) {
      el.style.backgroundImage = "url(" + flagUrl(cc) + ")";
      el.classList.remove("is-empty");
      el.hidden = false;
    } else {
      el.style.backgroundImage = "";
      el.classList.add("is-empty");
      el.hidden = true;
    }
  }

  function setMenuOpen(root, prefix, open) {
    var wrap = root.querySelector("[data-erz-" + prefix + "-wrap]");
    var btn = root.querySelector("[data-erz-" + prefix + "-btn]");
    var menu = root.querySelector("[data-erz-" + prefix + "-menu]");
    if (!wrap || !btn || !menu) return;
    wrap.classList.toggle("is-open", !!open);
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeAllFilterMenus(root, except) {
    ["country", "platform", "analyze-lang", "sort"].forEach(function (prefix) {
      if (prefix !== except) setMenuOpen(root, prefix, false);
    });
  }

  function renderFlagSelect(root, prefix, selected, options) {
    var select = root.querySelector("[data-erz-" + prefix + "]");
    var menu = root.querySelector("[data-erz-" + prefix + "-menu]");
    var labelEl = root.querySelector("[data-erz-" + prefix + "-label]");
    var flagEl = root.querySelector("[data-erz-" + prefix + "-flag]");
    var current = selected || "all";
    var html = options.map(function (o) {
      return '<option value="' + esc(o.id) + '"' + (current === o.id ? " selected" : "") + ">" +
        esc(o.label) + "</option>";
    }).join("");
    if (select && select.innerHTML !== html) select.innerHTML = html;
    if (select && select.value !== current) select.value = current;
    if (menu) {
      var menuHtml = options.map(function (o) {
        var on = current === o.id;
        var flag = o.flag
          ? flagCircleHtml(o.flag)
          : '<span class="eazy-research__flag is-empty" aria-hidden="true"></span>';
        return '<button type="button" class="eazy-research__country-opt' + (on ? " is-on" : "") +
          '" data-erz-' + prefix + '-opt="' + esc(o.id) + '" role="option" aria-selected="' + (on ? "true" : "false") + '">' +
          flag + "<span>" + esc(o.label) + "</span></button>";
      }).join("");
      if (menu.innerHTML !== menuHtml) menu.innerHTML = menuHtml;
    }
    var picked = options.find(function (o) { return o.id === current; }) || options[0];
    if (labelEl && picked) labelEl.textContent = picked.label;
    setFlagOn(flagEl, picked && picked.flag);
  }

  function renderPlatform(root) {
    var options = [{ id: "all", label: t("creator.research.analyze_all", "All"), flag: "" }].concat(
      marketplaceHosts().map(function (host) {
        return { id: host, label: countryOptionLabel(host), flag: flagForMarketplace(host) };
      })
    );
    renderFlagSelect(root, "platform", state.analyzeMarketplace, options);
  }

  function renderAnalyzeLang(root) {
    var options = [{ id: "all", label: t("creator.research.analyze_all", "All"), flag: "" }].concat(
      ANALYZE_LANGS.map(function (row) {
        return { id: row.id, label: t(row.key, row.fallback), flag: row.flag };
      })
    );
    renderFlagSelect(root, "analyze-lang", state.analyzeLanguage, options);
  }

  function renderAnalyzeUsed(root) {
    var el = root.querySelector("[data-erz-analyze-used]");
    if (!el) return;
    var host = state.analyzeResolvedMarketplace || "";
    var lang = state.analyzeResolvedLanguage || "";
    if (!host && !lang) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    var platform = host && host !== "all" ? countryOptionLabel(host) : t("creator.research.analyze_all", "All");
    var langRow = ANALYZE_LANGS.find(function (row) { return row.id === lang; });
    var language = langRow ? t(langRow.key, langRow.fallback) : t("creator.research.analyze_all", "All");
    el.hidden = false;
    el.textContent = t("creator.research.analyze_used", "{platform} · {language}")
      .replace("{platform}", platform)
      .replace("{language}", language);
  }

  function renderSort(root) {
    var wrap = root.querySelector("[data-erz-sort-wrap]");
    var labelEl = root.querySelector("[data-erz-sort-label]");
    var menu = root.querySelector("[data-erz-sort-menu]");
    var dir = state.sortDir === "asc" ? "asc" : "desc";
    if (wrap) wrap.classList.toggle("is-desc", dir === "desc");
    if (labelEl) labelEl.textContent = sortDisplayLabel(state.sort, dir);
    if (!menu) return;
    var html = SORT_OPTIONS.map(function (opt) {
      var on = state.sort === opt.id;
      var optDir = on ? dir : opt.defDir;
      return '<button type="button" class="eazy-research__sort-opt' + (on ? " is-on" : "") +
        (optDir === "desc" ? " is-desc" : "") +
        '" data-erz-sort-opt="' + esc(opt.id) + '" role="option" aria-selected="' + (on ? "true" : "false") + '">' +
        "<span>" + esc(sortFieldLabel(opt.id)) + "</span>" + SORT_ARROW_SVG + "</button>";
    }).join("");
    if (menu.innerHTML !== html) menu.innerHTML = html;
  }

  function applySortChange(root, nextId) {
    if (state.sort === nextId) {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      state.sort = nextId;
      state.sortDir = defaultSortDir(nextId);
    }
    closeAllFilterMenus(root, "");
    renderSort(root);
    if (state.searchId || state.view === "watched") renderGrid(root);
    else load(root);
  }

  function renderFacets(root) {
    syncChecks(root, "[data-erz-type]", "data-erz-type", state.designTypesSelected || []);
    syncChecks(root, "[data-erz-lang]", "data-erz-lang", state.languagesSelected || []);
    syncChecks(root, "[data-erz-pers]", "data-erz-pers", state.personalizationsSelected || []);
    syncChecks(root, "[data-erz-audience]", "data-erz-audience", state.audiencesSelected || []);
    syncChecks(root, "[data-erz-opportunity]", "data-erz-opportunity", state.opportunitySelected || []);
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
    renderPlatform(root);
    renderAnalyzeLang(root);
    renderSort(root);
    renderAnalyzeUsed(root);
    applyFilterFolds(root);
  }

  function renderGridOne(root) {
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
      grid.innerHTML = rows.map(function (p, i) { return productCard(p, i); }).join("");
      grid.setAttribute("data-erz-sig", sig);
    });
  }

  function renderGrid(_root) {
    eachBoundRoot(renderGridOne);
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

  function renderOne(root) {
    renderChips(root);
    renderFacets(root);
    renderGridOne(root);
    renderStatus(root);
    syncAnalyzeButton(root);
  }

  function render(_root) {
    eachBoundRoot(renderOne);
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
            (p.opportunity_bucket ? statRow(t("creator.research.opportunity", "Opportunity"), bucketLabel(p.opportunity_bucket)) : "") +
          "</div>" +
          '<p class="eazy-research-modal__hint">' +
            esc(t("creator.research.opportunity_hint", "Google search interest versus Amazon listing density for this topic. A bucket, not sales.")) +
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

  function findPicker(root) {
    if (document.body) {
      var kids = document.body.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].hasAttribute && kids[i].hasAttribute("data-erz-picker")) return kids[i];
      }
    }
    return (root && root.querySelector("[data-erz-picker]")) || document.querySelector("[data-erz-picker]");
  }

  function closePicker(root) {
    var picker = findPicker(root);
    if (!picker) return;
    picker.hidden = true;
    picker.__erzPick = null;
  }

  function openPicker(root, title, options, selected, onPick) {
    var picker = portalResearchModal(findPicker(root));
    if (!picker) return;
    var titleEl = picker.querySelector("[data-erz-picker-title]");
    var list = picker.querySelector("[data-erz-picker-list]");
    if (titleEl) titleEl.textContent = title || "";
    if (list) {
      list.innerHTML = (options || []).map(function (o) {
        var on = String(o.id) === String(selected);
        var flag = o.flag
          ? flagCircleHtml(o.flag)
          : '<span class="eazy-research__flag is-empty" aria-hidden="true"></span>';
        return '<button type="button" class="eazy-research-picker__opt' + (on ? " is-on" : "") +
          '" data-erz-picker-opt="' + esc(o.id) + '" role="option" aria-selected="' + (on ? "true" : "false") + '">' +
          flag + "<span>" + esc(o.label) + "</span></button>";
      }).join("");
    }
    picker.__erzPick = onPick;
    picker.hidden = false;
  }

  function countryPickerOptions() {
    var hosts = marketplaceHosts();
    return [{ id: "all", label: t("creator.research.country_all", "All countries"), flag: "" }].concat(
      hosts.map(function (host) {
        return { id: host, label: t(COUNTRY_I18N[host] || "", COUNTRY_FALLBACK[host] || host), flag: flagForMarketplace(host) };
      })
    );
  }

  function analyzeLangPickerOptions() {
    return [{ id: "all", label: t("creator.research.analyze_all", "All"), flag: "" }].concat(
      ANALYZE_LANGS.map(function (row) {
        return { id: row.id, label: t(row.key, row.fallback), flag: row.flag };
      })
    );
  }

  function trendGeoPickerOptions() {
    return TREND_GEOS.map(function (row) {
      return { id: row.id, label: t(row.key, row.fallback), flag: row.flag };
    });
  }

  function setTab(root, tab) {
    state.tab = tab === "trends" ? "trends" : "ideas";
    root.querySelectorAll("[data-erz-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-erz-tab") === state.tab;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var ideas = root.querySelector('[data-erz-pane="ideas"]');
    var trends = root.querySelector('[data-erz-pane="trends"]');
    if (ideas) ideas.hidden = state.tab !== "ideas";
    if (trends) trends.hidden = state.tab !== "trends";
    if (state.tab === "trends") loadTrends(root);
  }

  function trendsTimeParams() {
    var time = state.trends.time || "avg_12m";
    if (time === "last_month") return { period: "last_month", trend: "" };
    if (time === "rising" || time === "stable" || time === "falling") return { period: "avg_12m", trend: time };
    return { period: "avg_12m", trend: "" };
  }

  function trendsListParams(offset) {
    var tp = trendsTimeParams();
    var params = {
      geo: state.trends.geo || "ALL",
      language: state.trends.language || "all",
      period: tp.period,
      sort: state.trends.sort || "volume",
      dir: state.trends.sortDir || "desc",
      limit: 40,
      offset: Math.max(0, Number(offset) || 0),
    };
    if (tp.trend) params.trend = tp.trend;
    if (state.trends.topics.length) params.topic = state.trends.topics.join(",");
    if (state.trends.productTypes.length) params.product_type = state.trends.productTypes.join(",");
    if (state.trends.volume.length) params.volume = state.trends.volume.join(",");
    if (state.trends.searchId) params.search_id = state.trends.searchId;
    return params;
  }

  function renderTrendGeos(root) {
    renderFlagSelect(root, "trends-geo", state.trends.geo, trendGeoPickerOptions());
    renderFlagSelect(root, "trends-search-geo", state.trends.searchGeo, trendGeoPickerOptions());
    renderFlagSelect(root, "trends-search-lang", state.trends.searchLang, analyzeLangPickerOptions());
  }

  function renderTrendTopics(root) {
    var wrap = root.querySelector("[data-erz-trends-topics]");
    if (!wrap) return;
    wrap.innerHTML = (state.trends.topicsList || []).map(function (row) {
      var on = state.trends.topics.indexOf(row.key) !== -1;
      var vol = row.volume_bucket
        ? '<span class="eazy-research__topic-vol eazy-research__bucket is-' + esc(row.volume_bucket) + '">' + esc(bucketLabel(row.volume_bucket)) + "</span>"
        : "";
      return '<label class="eazy-research__check' + (on ? " is-on" : "") + '"><input type="checkbox" data-erz-trends-topic="' +
        esc(row.key) + '"' + (on ? " checked" : "") + "><span>" + esc(row.label || row.key) + "</span>" + vol + "</label>";
    }).join("");
  }

  function renderTrendKeywords(root) {
    var table = root.querySelector("[data-erz-trends-table]");
    var empty = root.querySelector("[data-erz-trends-empty]");
    if (!table) return;
    var rows = state.trends.keywords || [];
    if (state.trends.loading && !rows.length) {
      table.innerHTML = '<p class="eazy-research__filters-hint">' + esc(t("creator.research.loading", "Loading...")) + "</p>";
      if (empty) empty.hidden = true;
      return;
    }
    if (!rows.length) {
      table.innerHTML = "";
      if (empty) {
        empty.hidden = false;
        empty.textContent = state.trends.configured === false
          ? t("creator.research.trends_unconfigured", "Google Keyword Planner is not connected yet.")
          : t("creator.research.trends_empty", "No Keyword Planner rows yet. Official Google Ads cache fills in the background.");
      }
      return;
    }
    if (empty) empty.hidden = true;
    var head =
      '<div class="eazy-research__kw-head">' +
        '<button type="button" class="eazy-research__kw-sort" data-erz-trends-col="keyword">' + esc(t("creator.research.trends_col_keyword", "Keyword")) + "</button>" +
        "<span>" + esc(t("creator.research.trends_col_topic", "Topic")) + "</span>" +
        '<button type="button" class="eazy-research__kw-sort" data-erz-trends-col="volume">' + esc(t("creator.research.trends_col_volume", "Volume")) + "</button>" +
        '<button type="button" class="eazy-research__kw-sort" data-erz-trends-col="trend">' + esc(t("creator.research.trends_col_trend", "Trend")) + "</button>" +
        '<button type="button" class="eazy-research__kw-sort" data-erz-trends-col="competition">' + esc(t("creator.research.trends_col_competition", "Competition")) + "</button>" +
        "<span>" + esc(t("creator.research.trends_col_type", "Product")) + "</span>" +
      "</div>";
    table.innerHTML = head + rows.map(function (row) {
      return '<div class="eazy-research__kw-row">' +
        "<span>" + esc(row.keyword || "") + "</span>" +
        "<span>" + esc((row.topic_key || "").replace(/_/g, " ")) + "</span>" +
        '<span class="eazy-research__bucket is-' + esc(row.volume_bucket || "") + '">' + esc(bucketLabel(row.volume_bucket) || "—") + "</span>" +
        "<span>" + esc(row.trend || "—") + "</span>" +
        "<span>" + esc(row.competition || "—") + "</span>" +
        "<span>" + esc(row.product_type || "") + "</span>" +
      "</div>";
    }).join("");
  }

  function syncTrendsSearchButton(root) {
    var btn = root.querySelector("[data-erz-trends-search]");
    if (!btn) return;
    var lim = state.trendsLimits || { remaining: 5, limit: 5 };
    btn.disabled = state.trends.searching;
    btn.textContent = state.trends.searching
      ? t("creator.research.analyze_loading", "Analyzing…")
      : t("creator.research.analyze_remaining", "Analyze ({remaining}/{limit})")
          .replace("{remaining}", String(lim.remaining))
          .replace("{limit}", String(lim.limit))
          .replace("Analyze", t("creator.research.trends_search", "Search"));
  }

  async function loadTrends(root) {
    state.trends.loading = true;
    renderTrendKeywords(root);
    var topicsData = await api("eazy-research-trends-topics", {
      geo: state.trends.geo,
      language: state.trends.language,
      product_type: state.trends.productTypes.join(","),
    }).catch(function () { return null; });
    if (topicsData && topicsData.ok) {
      state.trends.topicsList = topicsData.topics || [];
      state.trends.configured = topicsData.configured !== false;
      applyTrendsLimits(topicsData.trends_limits);
    }
    var kwData = await api("eazy-research-trends-keywords", trendsListParams(0)).catch(function () { return null; });
    state.trends.loading = false;
    if (kwData && kwData.ok) {
      state.trends.keywords = kwData.keywords || [];
      state.trends.configured = kwData.configured !== false;
      applyTrendsLimits(kwData.trends_limits);
    } else {
      state.trends.keywords = [];
    }
    renderTrendGeos(root);
    renderTrendTopics(root);
    renderTrendKeywords(root);
    syncTrendsSearchButton(root);
  }

  async function startTrendsSearch(root) {
    if (!isLoggedIn()) return;
    var input = root.querySelector("[data-erz-trends-q]");
    var q = ((input && input.value) || state.trends.q || "").trim();
    if (!q) return;
    state.trends.searching = true;
    syncTrendsSearchButton(root);
    var data = await api("eazy-research-trends-search", {}, {
      method: "POST",
      body: { q: q, geo: state.trends.searchGeo, language: state.trends.searchLang },
    }).catch(function () { return null; });
    if (!data || !data.ok) {
      state.trends.searching = false;
      if (data && data.analyze_limits) applyTrendsLimits(data.analyze_limits);
      syncTrendsSearchButton(root);
      return;
    }
    state.trends.searchId = data.search_id;
    applyTrendsLimits(data.analyze_limits);
    var tries = 0;
    while (tries < 20) {
      tries += 1;
      await new Promise(function (resolve) { setTimeout(resolve, 700); });
      var st = await api("eazy-research-trends-search-status", { search_id: data.search_id }).catch(function () { return null; });
      if (st && st.ok && st.done) {
        state.trends.keywords = st.keywords || [];
        applyTrendsLimits(st.analyze_limits);
        break;
      }
    }
    state.trends.searching = false;
    renderTrendKeywords(root);
    syncTrendsSearchButton(root);
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

  function applyTrendsLimits(limits) {
    if (!limits || typeof limits !== "object") return;
    state.trendsLimits = {
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
    if (state.analyzeMarketplace && state.analyzeMarketplace !== "all") body.marketplace = state.analyzeMarketplace;
    if (state.analyzeLanguage && state.analyzeLanguage !== "all") body.language = state.analyzeLanguage;
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
    state.analyzeResolvedMarketplace = data.marketplace || "";
    state.analyzeResolvedLanguage = data.language || "";
    applyAnalyzeLimits(data.daily);
    pollSearch(root);
  }

  function catalogListParams(offset) {
    var params = {
      reprint_ok: 1,
      limit: state.pageSize || 80,
      offset: Math.max(0, Number(offset) || 0),
      sort: state.sort,
      dir: state.sortDir || defaultSortDir(state.sort),
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
    if (state.opportunitySelected && state.opportunitySelected.length) params.opportunity = state.opportunitySelected.join(",");
    return params;
  }

  function resetGridScroll(_root) {
    eachBoundRoot(function (root) {
      var refs = scrollerRefs(root);
      if (refs.grid) refs.grid.scrollTop = 0;
    });
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
    if (data.niches) state.niches = data.niches;
    if (data.facets) state.facets = data.facets;
    if (data.marketplaces) state.marketplaces = data.marketplaces;
    applyAnalyzeLimits(data.analyze_limits);
    applyTrendsLimits(data.trends_limits);
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

  function loadFilterFolds() {
    var out = {};
    Object.keys(FILTER_FOLD_DEFAULTS).forEach(function (key) {
      out[key] = FILTER_FOLD_DEFAULTS[key];
    });
    try {
      var raw = global.localStorage && global.localStorage.getItem(FILTER_FOLDS_KEY);
      if (!raw) return out;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return out;
      Object.keys(FILTER_FOLD_DEFAULTS).forEach(function (key) {
        if (typeof parsed[key] === "boolean") out[key] = parsed[key];
      });
    } catch (_e) { /* guest storage may be blocked */ }
    return out;
  }

  function saveFilterFolds(folds) {
    try {
      if (global.localStorage) global.localStorage.setItem(FILTER_FOLDS_KEY, JSON.stringify(folds));
    } catch (_e) { /* guest storage may be blocked */ }
  }

  function foldSelectedCount(id) {
    if (id === "topics") return selectedTopics().length;
    if (id === "audience") return (state.audiencesSelected || []).length;
    if (id === "custom_design") return (state.personalizationsSelected || []).length;
    if (id === "design_type") return (state.designTypesSelected || []).length;
    if (id === "language") return (state.languagesSelected || []).length;
    return 0;
  }

  function applyFilterFolds(root) {
    if (!root) return;
    var folds = loadFilterFolds();
    root.querySelectorAll("[data-erz-fold]").forEach(function (section) {
      var id = section.getAttribute("data-erz-fold") || "";
      if (!Object.prototype.hasOwnProperty.call(FILTER_FOLD_DEFAULTS, id)) return;
      var open = !!folds[id];
      section.classList.toggle("is-collapsed", !open);
      var btn = section.querySelector("[data-erz-fold-toggle]");
      var body = section.querySelector("[data-erz-fold-body]");
      if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (body) body.hidden = !open;
      var hint = section.querySelector("[data-erz-fold-hint]");
      var count = foldSelectedCount(id);
      if (hint) {
        if (!open && count > 0) {
          hint.hidden = false;
          hint.textContent = t("creator.research.filter_selected", "{count} selected").replace("{count}", String(count));
        } else {
          hint.hidden = true;
          hint.textContent = "";
        }
      }
    });
  }

  function toggleFilterFold(root, id) {
    if (!id || !Object.prototype.hasOwnProperty.call(FILTER_FOLD_DEFAULTS, id)) return;
    var folds = loadFilterFolds();
    folds[id] = !folds[id];
    saveFilterFolds(folds);
    applyFilterFolds(root);
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
    var trendsQ = root.querySelector("[data-erz-trends-q]");
    if (trendsQ) {
      trendsQ.addEventListener("input", function () {
        state.trends.q = trendsQ.value || "";
      });
      trendsQ.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          startTrendsSearch(root);
        }
      });
    }
    var sortBtn = root.querySelector("[data-erz-sort-btn]");
    if (sortBtn) {
      sortBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        var wrap = root.querySelector("[data-erz-sort-wrap]");
        var open = !(wrap && wrap.classList.contains("is-open"));
        closeAllFilterMenus(root, open ? "sort" : "");
        setMenuOpen(root, "sort", open);
      });
    }
    var analyzeBtn = root.querySelector("[data-erz-analyze]");
    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", function () { startAnalyze(root); });
    }
    applyFiltersCollapsed(root, isFiltersCollapsedStored());
    applyFilterFolds(root);
    applyFiltersSheet(root, false);
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest("[data-erz-fold-toggle]");
      if (!btn || !root.contains(btn)) return;
      var section = btn.closest("[data-erz-fold]");
      if (!section) return;
      ev.preventDefault();
      toggleFilterFold(root, section.getAttribute("data-erz-fold"));
    });
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
        return;
      }
      if (tEl.hasAttribute("data-erz-opportunity")) {
        state.opportunitySelected = readChecked("[data-erz-opportunity]", "data-erz-opportunity");
        if (state.searchId || state.view === "watched") render(root);
        else load(root);
        return;
      }
      if (tEl.hasAttribute("data-erz-trends-topic") || tEl.hasAttribute("data-erz-trends-type") || tEl.hasAttribute("data-erz-trends-volume") || tEl.hasAttribute("data-erz-trends-time")) {
        state.trends.topics = readChecked("[data-erz-trends-topic]", "data-erz-trends-topic");
        state.trends.productTypes = readChecked("[data-erz-trends-type]", "data-erz-trends-type");
        state.trends.volume = readChecked("[data-erz-trends-volume]", "data-erz-trends-volume");
        var timeEl = root.querySelector("[data-erz-trends-time]:checked");
        state.trends.time = (timeEl && timeEl.getAttribute("data-erz-trends-time")) || "avg_12m";
        loadTrends(root);
      }
    });
    root.addEventListener("click", function (ev) {
      var tabBtn = ev.target.closest("[data-erz-tab]");
      if (tabBtn && root.contains(tabBtn)) {
        ev.preventDefault();
        setTab(root, tabBtn.getAttribute("data-erz-tab"));
        return;
      }
      var countryBtn = ev.target.closest("[data-erz-country-btn]");
      if (countryBtn && root.contains(countryBtn) && !ev.target.closest("[data-erz-platform-wrap]") && !ev.target.closest("[data-erz-analyze-lang-wrap]") && !ev.target.closest("[data-erz-trends-geo-wrap]") && !ev.target.closest("[data-erz-trends-search-geo-wrap]") && !ev.target.closest("[data-erz-trends-search-lang-wrap]")) {
        ev.preventDefault();
        closeAllFilterMenus(root, "");
        openPicker(root, t("creator.research.country", "Country"), countryPickerOptions(), state.marketplace || "all", function (id) {
          state.marketplace = id || "all";
          if (!state.searchId) load(root);
          else render(root);
        });
        return;
      }
      var platformBtn = ev.target.closest("[data-erz-platform-btn]");
      if (platformBtn && root.contains(platformBtn)) {
        ev.preventDefault();
        closeAllFilterMenus(root, "");
        openPicker(root, t("creator.research.platform", "Platform"), countryPickerOptions().map(function (o) {
          return o.id === "all" ? { id: "all", label: t("creator.research.analyze_all", "All"), flag: "" } : o;
        }), state.analyzeMarketplace || "all", function (id) {
          state.analyzeMarketplace = id || "all";
          renderPlatform(root);
        });
        return;
      }
      var langBtn = ev.target.closest("[data-erz-analyze-lang-btn]");
      if (langBtn && root.contains(langBtn)) {
        ev.preventDefault();
        closeAllFilterMenus(root, "");
        openPicker(root, t("creator.research.language", "Language"), analyzeLangPickerOptions(), state.analyzeLanguage || "all", function (id) {
          state.analyzeLanguage = id || "all";
          renderAnalyzeLang(root);
        });
        return;
      }
      var trendsGeoBtn = ev.target.closest("[data-erz-trends-geo-btn]");
      if (trendsGeoBtn && root.contains(trendsGeoBtn)) {
        ev.preventDefault();
        openPicker(root, t("creator.research.country", "Country"), trendGeoPickerOptions(), state.trends.geo, function (id) {
          state.trends.geo = id || "ALL";
          loadTrends(root);
        });
        return;
      }
      var trendsSearchGeoBtn = ev.target.closest("[data-erz-trends-search-geo-btn]");
      if (trendsSearchGeoBtn && root.contains(trendsSearchGeoBtn)) {
        ev.preventDefault();
        openPicker(root, t("creator.research.country", "Country"), trendGeoPickerOptions(), state.trends.searchGeo, function (id) {
          state.trends.searchGeo = id || "ALL";
          renderTrendGeos(root);
        });
        return;
      }
      var trendsSearchLangBtn = ev.target.closest("[data-erz-trends-search-lang-btn]");
      if (trendsSearchLangBtn && root.contains(trendsSearchLangBtn)) {
        ev.preventDefault();
        openPicker(root, t("creator.research.language", "Language"), analyzeLangPickerOptions(), state.trends.searchLang, function (id) {
          state.trends.searchLang = id || "all";
          renderTrendGeos(root);
        });
        return;
      }
      var trendsSearchBtn = ev.target.closest("[data-erz-trends-search]");
      if (trendsSearchBtn && root.contains(trendsSearchBtn)) {
        ev.preventDefault();
        startTrendsSearch(root);
        return;
      }
      var trendsCol = ev.target.closest("[data-erz-trends-col]");
      if (trendsCol && root.contains(trendsCol)) {
        ev.preventDefault();
        var col = trendsCol.getAttribute("data-erz-trends-col") || "volume";
        if (state.trends.sort === col) state.trends.sortDir = state.trends.sortDir === "asc" ? "desc" : "asc";
        else {
          state.trends.sort = col;
          state.trends.sortDir = col === "keyword" ? "asc" : "desc";
        }
        loadTrends(root);
        return;
      }
      var countryOpt = ev.target.closest("[data-erz-country-opt]");
      if (countryOpt && root.contains(countryOpt) && !countryOpt.hasAttribute("data-erz-platform-opt") && !countryOpt.hasAttribute("data-erz-analyze-lang-opt")) {
        ev.preventDefault();
        var host = countryOpt.getAttribute("data-erz-country-opt") || "all";
        var select = root.querySelector("[data-erz-country]");
        state.marketplace = host;
        if (select) select.value = host;
        closeAllFilterMenus(root, "");
        if (!state.searchId) load(root);
        else render(root);
        return;
      }
      var platformBtn = ev.target.closest("[data-erz-platform-btn]");
      if (platformBtn && root.contains(platformBtn)) {
        ev.preventDefault();
        var pWrap = root.querySelector("[data-erz-platform-wrap]");
        var openPlat = !(pWrap && pWrap.classList.contains("is-open"));
        closeAllFilterMenus(root, openPlat ? "platform" : "");
        setMenuOpen(root, "platform", openPlat);
        return;
      }
      var platformOpt = ev.target.closest("[data-erz-platform-opt]");
      if (platformOpt && root.contains(platformOpt)) {
        ev.preventDefault();
        state.analyzeMarketplace = platformOpt.getAttribute("data-erz-platform-opt") || "all";
        closeAllFilterMenus(root, "");
        renderPlatform(root);
        return;
      }
      var langBtn = ev.target.closest("[data-erz-analyze-lang-btn]");
      if (langBtn && root.contains(langBtn)) {
        ev.preventDefault();
        var lWrap = root.querySelector("[data-erz-analyze-lang-wrap]");
        var openLang = !(lWrap && lWrap.classList.contains("is-open"));
        closeAllFilterMenus(root, openLang ? "analyze-lang" : "");
        setMenuOpen(root, "analyze-lang", openLang);
        return;
      }
      var langOpt = ev.target.closest("[data-erz-analyze-lang-opt]");
      if (langOpt && root.contains(langOpt)) {
        ev.preventDefault();
        state.analyzeLanguage = langOpt.getAttribute("data-erz-analyze-lang-opt") || "all";
        closeAllFilterMenus(root, "");
        renderAnalyzeLang(root);
        return;
      }
      var sortOpt = ev.target.closest("[data-erz-sort-opt]");
      if (sortOpt && root.contains(sortOpt)) {
        ev.preventDefault();
        applySortChange(root, sortOpt.getAttribute("data-erz-sort-opt") || "review_growth");
        return;
      }
      if (
        !ev.target.closest("[data-erz-country-wrap]") &&
        !ev.target.closest("[data-erz-platform-wrap]") &&
        !ev.target.closest("[data-erz-analyze-lang-wrap]") &&
        !ev.target.closest("[data-erz-sort-wrap]")
      ) {
        closeAllFilterMenus(root, "");
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
        closeAllFilterMenus(root, "");
        applyFiltersSheet(root, false);
        closeDetail(root);
        closePicker(root);
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
  }

  var catalogLoadStarted = false;

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
    document.addEventListener("click", function (ev) {
      var picker = findPicker(null);
      if (!picker || picker.hidden) return;
      if (ev.target.closest("[data-erz-picker-close]") || ev.target === picker.querySelector("[data-erz-picker-close]") || ev.target.classList.contains("eazy-research-picker__backdrop")) {
        closePicker(null);
        return;
      }
      var opt = ev.target.closest("[data-erz-picker-opt]");
      if (opt && picker.contains(opt)) {
        var fn = picker.__erzPick;
        closePicker(null);
        if (typeof fn === "function") fn(opt.getAttribute("data-erz-picker-opt"));
      }
    });
    document.addEventListener("eazCreatorContextReady", function () {
      boot();
    });
  }

  function boot() {
    document.querySelectorAll("[data-eazy-research]").forEach(mount);
    if (!catalogLoadStarted) {
      var root = primaryResearchRoot();
      if (root) {
        catalogLoadStarted = true;
        load(root);
      }
    } else {
      render();
    }
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
